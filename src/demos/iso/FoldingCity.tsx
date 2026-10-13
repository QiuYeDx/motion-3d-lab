import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ==================================================================== city grid
   Local frame: hinge 1 sits on the line z = 0. The fixed "base" city lies at z ∈ [0, 6.4] (towards the camera),
   the folding band lies at z ∈ [-9.6, 0], split into N hinged slabs ("pages"). Each slab's content is authored in
   slab-local coords: x ∈ [-W/2, W/2], z ∈ [-S, 0] with its hinge edge at z = 0 and the street right next to it. */
const W = 9.6
const BAND = 9.6
const BASE_S = 3.2
const STREET = [-0.18, -0.86] // x-street band (z range) in slab coords
const BLOCK_Z0 = -1.12
const CROSS_X = [-1.6, 1.6] // cross streets (along z)
const CROSS_HW = 0.42
const BLOCKS: [number, number][] = [
  [-W / 2 + 0.12, CROSS_X[0] - CROSS_HW - 0.08],
  [CROSS_X[0] + CROSS_HW + 0.08, CROSS_X[1] - CROSS_HW - 0.08],
  [CROSS_X[1] + CROSS_HW + 0.08, W / 2 - 0.12],
]
const FLOOR_H = 0.3
const STAGGER = 0.32
const ACCENT = '#f0a35e'

/* palette — cool, desaturated, one warm accent */
const TINTS = ['#f4f6f9', '#e4eaf1', '#d5dee8', '#c6d2df', '#b6c5d5', '#a7b8cb']
const CAR_COLS = ['#f5f7fa', '#a9b7c7', '#6e8098', '#d9e0e8', ACCENT]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (u: number) => u * u * (3 - 2 * u)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** joint angle k (1-based) of N for fold progress f — joint 1 leads, the rest follow in a stagger */
function jointAngle(f: number, k: number, n: number) {
  const span = 1 + (n - 1) * STAGGER
  const u = Math.min(f, 1) * span - (k - 1) * STAGGER
  let e = u <= 0 ? 0 : u >= 1 ? 1 : smooth(u)
  if (f > 1) e += Math.min(f - 1, 0.12) // spring overshoot past fully folded
  return (Math.PI / n) * e
}

/** height of the street that ends up overhead when fully folded */
function ceilingY(n: number) {
  const S = BAND / n
  let y = 0
  for (let k = 1; k < n; k++) y += S * Math.sin((k * Math.PI) / n)
  return y
}

/* ==================================================================== textures & materials */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const facadeCache = new Map<string, THREE.Texture>()
function facadeTex(cols: number, floors: number) {
  const key = `${cols}x${floors}`
  let t = facadeCache.get(key)
  if (t) return t
  const CW = 26
  const FH = 32
  const rng = mulberry32(cols * 131 + floors * 17)
  t = canvasTex(cols * CW, floors * FH, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, cols * CW, floors * FH)
    g.fillStyle = 'rgba(40,60,90,0.06)'
    for (let f = 1; f < floors; f++) g.fillRect(0, f * FH - 2, cols * CW, 2)
    for (let f = 0; f < floors; f++) {
      const ground = f === floors - 1
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.1
        g.fillStyle = lit ? '#f4b57c' : ground ? '#7d8ea5' : '#6a7c94'
        if (ground) g.fillRect(c * CW + 3, f * FH + 9, CW - 6, FH - 9)
        else g.fillRect(c * CW + 7, f * FH + 8, CW - 14, FH - 15)
      }
    }
  })
  facadeCache.set(key, t)
  return t
}

const lam = (color: string | THREE.Color, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const matCache = new Map<string, THREE.Material>()
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = matCache.get(key) as T | undefined
  if (!m) {
    m = make()
    matCache.set(key, m)
  }
  return m
}
const M = {
  crust: lam('#aebbcb'),
  hinge: lam(ACCENT, { emissive: new THREE.Color(ACCENT), emissiveIntensity: 0.35 }),
  trunk: lam('#8c97a6'),
  leaf: lam('#a5bfae', { flatShading: true }),
  leaf2: lam('#93b2a0', { flatShading: true }),
  glass: lam('#d9e4ef'),
  roofBox: lam('#cfd8e3'),
  tower: lam('#b9c6d4'),
  wheel: lam('#3c4656'),
  bird: new THREE.MeshLambertMaterial({ color: '#56657a', side: THREE.DoubleSide }),
  cloud: lam('#ffffff', { transparent: true, opacity: 0.94 }),
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  ico: new THREE.IcosahedronGeometry(1, 0),
  cloud: new THREE.IcosahedronGeometry(1, 2),
}

/* slab edges read as a layered cut (light street level, warm core); the underside gets a structural grid */
const edgeTex = canvasTex(4, 64, (g) => {
  g.fillStyle = '#e6ebf1'
  g.fillRect(0, 0, 4, 64)
  g.fillStyle = '#f0b07c'
  g.fillRect(0, 20, 4, 30)
  g.fillStyle = '#9fb0c3'
  g.fillRect(0, 50, 4, 14)
})
const underTile = canvasTex(64, 64, (g) => {
  g.fillStyle = '#9cadc1'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#b1c0d1'
  g.fillRect(0, 0, 64, 4)
  g.fillRect(0, 0, 4, 64)
  g.fillStyle = 'rgba(60,80,110,0.12)'
  g.fillRect(28, 28, 8, 8)
})
underTile.wrapS = underTile.wrapT = THREE.RepeatWrapping

/* ==================================================================== layout */
type Bld = { x: number; z: number; w: number; d: number; floors: number; tint: number; extra: number }
type Car = { lane: 0 | 1; x0: number; speed: number; col: number }
type SlabDef = { S: number; blds: Bld[]; trees: [number, number, number][]; cars: Car[]; parks: number[]; tex: THREE.Texture }

function makeSlab(seed: number, S: number, maxFloors: number): SlabDef {
  const rng = mulberry32(seed)
  const z1 = -S + 0.14
  const depth = BLOCK_Z0 - z1
  const rows = depth > 2.4 ? 2 : 1
  const rowD = depth / rows
  const parks: number[] = []
  if (rng() < 0.4) parks.push(Math.floor(rng() * 3))
  const blds: Bld[] = []
  BLOCKS.forEach(([x0, x1], bi) => {
    if (parks.includes(bi)) return
    for (let r = 0; r < rows; r++) {
      const zc = BLOCK_Z0 - rowD * (r + 0.5)
      let x = x0 + 0.04
      while (x1 - x > 0.55) {
        const opts = [0.7, 0.85, 1.0, 1.2].filter((w) => w <= x1 - x - 0.04)
        let w = opts.length ? opts[Math.floor(rng() * opts.length)] : x1 - x - 0.04
        if (x1 - x - w < 0.6) w = x1 - x - 0.04 // swallow a sliver at the end of the block
        const floors = 2 + Math.floor(rng() * (maxFloors - 1))
        blds.push({ x: x + w / 2, z: zc, w: w - 0.06, d: rowD - 0.14, floors, tint: Math.floor(rng() * TINTS.length), extra: rng() })
        x += w + 0.04
      }
    }
  })
  const trees: [number, number, number][] = []
  for (let x = -W / 2 + 0.5; x < W / 2 - 0.3; x += 0.95 + rng() * 0.4) {
    if (CROSS_X.some((c) => Math.abs(x - c) < CROSS_HW + 0.2)) continue
    trees.push([x, (STREET[1] + BLOCK_Z0) / 2, 0.75 + rng() * 0.4])
  }
  parks.forEach((bi) => {
    const [x0, x1] = BLOCKS[bi]
    for (let i = 0; i < 7; i++) trees.push([x0 + 0.3 + rng() * (x1 - x0 - 0.6), BLOCK_Z0 - 0.25 - rng() * (depth - 0.5), 0.9 + rng() * 0.6])
  })
  const nCars = 2 + (rng() < 0.6 ? 1 : 0)
  const cars: Car[] = Array.from({ length: nCars }, (_, i) => ({
    lane: (i % 2) as 0 | 1,
    x0: rng() * W,
    speed: 0.55 + rng() * 0.35,
    col: i === 0 ? 4 : Math.floor(rng() * 4),
  }))
  const ppu = 72
  const tex = canvasTex(Math.round(W * ppu), Math.round(S * ppu), (g) => {
    const X = (x: number) => (x + W / 2) * ppu
    const Z = (z: number) => (z + S) * ppu // canvas top = far edge (z = -S)
    g.fillStyle = '#e9edf2'
    g.fillRect(0, 0, W * ppu, S * ppu)
    // blocks
    BLOCKS.forEach(([x0, x1], bi) => {
      g.fillStyle = parks.includes(bi) ? '#cfdccf' : '#dfe5ec'
      g.fillRect(X(x0), Z(BLOCK_Z0), (x1 - x0) * ppu, (BLOCK_Z0 - z1) * ppu)
    })
    // x street
    g.fillStyle = '#c3ccd7'
    g.fillRect(0, Z(STREET[0]), W * ppu, (STREET[0] - STREET[1]) * ppu)
    // cross streets
    CROSS_X.forEach((c) => g.fillRect(X(c - CROSS_HW), 0, CROSS_HW * 2 * ppu, Z(STREET[1])))
    // lane dashes
    g.fillStyle = 'rgba(255,255,255,0.85)'
    const zm = Z((STREET[0] + STREET[1]) / 2)
    for (let x = 0.2; x < W; x += 0.7) {
      if (CROSS_X.some((c) => Math.abs(x - W / 2 - c) < CROSS_HW + 0.05)) continue
      g.fillRect(x * ppu, zm - 1.5, 0.34 * ppu, 3)
    }
    // zebra crossings
    g.fillStyle = 'rgba(255,255,255,0.8)'
    CROSS_X.forEach((c) => {
      for (let k = 0; k < 6; k++) g.fillRect(X(c - CROSS_HW + 0.06 + k * 0.14), Z(STREET[1] - 0.04), 0.07 * ppu, 0.24 * ppu)
    })
  })
  return { S, blds, trees, cars, parks, tex }
}

/* ==================================================================== slab */
function Building({ b, grow, growable }: { b: Bld; grow?: MotionValue<number>; growable: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const H = b.floors * FLOOR_H + 0.1
  const mats = useMemo(() => {
    const colsX = Math.max(2, Math.round(b.d / 0.24))
    const colsZ = Math.max(2, Math.round(b.w / 0.24))
    const tint = TINTS[b.tint]
    const mx = cached(`f${colsX}x${b.floors}${tint}`, () => lam(tint, { map: facadeTex(colsX, b.floors) }))
    const mz = cached(`f${colsZ}x${b.floors}${tint}`, () => lam(tint, { map: facadeTex(colsZ, b.floors) }))
    const roof = cached(`r${tint}`, () => lam(new THREE.Color(tint).multiplyScalar(0.9)))
    return [mx, mx, roof, roof, mz, mz]
  }, [b])
  const delay = (-b.z / BAND) * 0.5 + Math.abs(b.x) * 0.03
  useFrame(() => {
    if (!growable || !grow || !ref.current) return
    const u = clamp01((grow.get() * 1.6 - delay) / 0.8)
    const e = u >= 1 ? 1 : 1 - (1 - u) ** 3
    ref.current.scale.set(1, Math.max(0.001, e), 1)
    ref.current.visible = e > 0.002
  })
  return (
    <group ref={ref} position={[b.x, 0, b.z]}>
      <mesh geometry={G.box} material={mats} position={[0, H / 2, 0]} scale={[b.w, H, b.d]} castShadow receiveShadow />
      {b.extra > 0.62 && b.floors >= 4 && (
        <mesh geometry={G.cyl} material={M.tower} position={[b.w * 0.18, H + 0.14, -b.d * 0.15]} scale={[0.1, 0.28, 0.1]} castShadow />
      )}
      {b.extra < 0.4 && <mesh geometry={G.box} material={M.roofBox} position={[-b.w * 0.15, H + 0.06, b.d * 0.12]} scale={[b.w * 0.35, 0.12, b.d * 0.3]} castShadow />}
    </group>
  )
}

function Tree({ p, s }: { p: [number, number, number]; s: number }) {
  return (
    <group position={[p[0], 0, p[1]]} scale={s}>
      <mesh geometry={G.cyl} material={M.trunk} position={[0, 0.1, 0]} scale={[0.025, 0.2, 0.025]} />
      <mesh geometry={G.ico} material={p[2] > 1 ? M.leaf2 : M.leaf} position={[0, 0.3, 0]} scale={[0.15, 0.18, 0.15]} castShadow />
    </group>
  )
}

function CarMesh({ col }: { col: number }) {
  const mat = useMemo(() => cached(`car${col}`, () => lam(CAR_COLS[col])), [col])
  return (
    <group>
      <mesh geometry={G.box} material={mat} position={[0, 0.075, 0]} scale={[0.34, 0.09, 0.17]} castShadow />
      <mesh geometry={G.box} material={M.glass} position={[-0.03, 0.15, 0]} scale={[0.17, 0.07, 0.15]} />
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} geometry={G.box} material={M.wheel} position={[x, 0.035, 0]} scale={[0.07, 0.07, 0.18]} />
      ))}
    </group>
  )
}

function Cars({ cars, clock }: { cars: Car[]; clock: { t: number } }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    cars.forEach((c, i) => {
      const g = refs.current[i]
      if (!g) return
      const span = W + 0.6
      const dir = c.lane === 0 ? 1 : -1
      const u = (((c.x0 + dir * c.speed * clock.t) % span) + span) % span
      const x = -W / 2 - 0.3 + u
      g.position.x = x
      const edge = Math.min(1, (W / 2 + 0.3 - Math.abs(x)) / 0.4)
      g.scale.setScalar(Math.max(0.001, edge))
    })
  })
  return (
    <>
      {cars.map((c, i) => (
        <group key={i} ref={(e) => void (refs.current[i] = e)} position={[0, 0, c.lane === 0 ? -0.36 : -0.68]} rotation={[0, c.lane === 0 ? 0 : Math.PI, 0]}>
          <CarMesh col={c.col} />
        </group>
      ))}
    </>
  )
}

function Slab({ def, clock, grow, growable, hinge }: { def: SlabDef; clock: { t: number }; grow?: MotionValue<number>; growable: boolean; hinge: boolean }) {
  const S = def.S
  const mats = useMemo(() => {
    const top = lam('#ffffff', { map: def.tex })
    const ut = underTile.clone()
    ut.repeat.set(W / 0.8, S / 0.8)
    ut.needsUpdate = true
    const under = lam('#ffffff', { map: ut })
    const edge = cached('edge', () => lam('#ffffff', { map: edgeTex }))
    return [edge, edge, top, under, edge, edge]
  }, [def])
  return (
    <group>
      <mesh geometry={G.box} material={mats} position={[0, -0.16, -S / 2]} scale={[W, 0.32, S - 0.02]} receiveShadow castShadow />
      {def.blds.map((b, i) => (
        <Building key={i} b={b} grow={grow} growable={growable} />
      ))}
      {def.trees.map((t, i) => (
        <Tree key={i} p={t} s={t[2]} />
      ))}
      <Cars cars={def.cars} clock={clock} />
      {hinge && <mesh geometry={G.cyl} material={M.hinge} position={[0, -0.06, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.075, W + 0.16, 0.075]} />}
    </group>
  )
}

/* ==================================================================== band of hinged pages */
function Band({ n, fold, grow, clock }: { n: number; fold: MotionValue<number>; grow: MotionValue<number>; clock: { t: number } }) {
  const S = BAND / n
  const defs = useMemo(() => Array.from({ length: n }, (_, k) => makeSlab(1000 + n * 37 + k * 11, S, 6)), [n, S])
  const hinges = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const f = fold.get()
    for (let k = 0; k < n; k++) {
      const h = hinges.current[k]
      if (h) h.rotation.x = Math.max(0, jointAngle(f, k + 1, n))
    }
  })
  const chain = (k: number): React.ReactNode =>
    k >= n ? null : (
      <group ref={(e) => void (hinges.current[k] = e)} position={[0, 0, k === 0 ? 0 : -S]}>
        <Slab def={defs[k]} clock={clock} grow={grow} growable hinge />
        {chain(k + 1)}
      </group>
    )
  return <>{chain(0)}</>
}

/* ==================================================================== sky: clouds + birds */
function Clouds({ clock }: { clock: { t: number } }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const defs = useMemo(
    () => [
      { y: 11.5, z: -9, x0: 0, s: 0.95, v: 0.3 },
      { y: 12.5, z: -3, x0: 14, s: 0.75, v: 0.22 },
    ],
    [],
  )
  useFrame(() => {
    defs.forEach((d, i) => {
      const g = refs.current[i]
      if (!g) return
      const span = 34
      g.position.x = ((((d.x0 + d.v * clock.t) % span) + span) % span) - span / 2
    })
  })
  return (
    <>
      {defs.map((d, i) => (
        <group key={i} ref={(e) => void (refs.current[i] = e)} position={[0, d.y, d.z]} scale={d.s}>
          <mesh geometry={G.cloud} material={M.cloud} scale={[1.3, 0.7, 0.9]} />
          <mesh geometry={G.cloud} material={M.cloud} position={[1.1, -0.15, 0.2]} scale={[0.9, 0.55, 0.7]} />
          <mesh geometry={G.cloud} material={M.cloud} position={[-1.1, -0.2, -0.1]} scale={[0.85, 0.5, 0.7]} />
          <mesh geometry={G.cloud} material={M.cloud} position={[0.3, 0.35, -0.1]} scale={[0.7, 0.5, 0.6]} />
        </group>
      ))}
    </>
  )
}

const wingGeo = (() => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.12, 0, 0.32, 0.12, 0, 0.26], 3))
  g.computeVertexNormals()
  return g
})()
function Birds({ clock }: { clock: { t: number } }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const wings = useRef<(THREE.Mesh | null)[]>([])
  const defs = useMemo(() => Array.from({ length: 6 }, (_, i) => ({ r: 6.5 + (i % 3) * 1.4, y: 6.8 + (i % 2) * 0.9 + i * 0.12, ph: i * 0.55, v: 0.16 + (i % 3) * 0.02 })), [])
  useFrame(() => {
    const t = clock.t
    defs.forEach((d, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = d.ph + t * d.v
      g.position.set(Math.cos(a) * d.r, d.y + Math.sin(t * 0.9 + i) * 0.25, Math.sin(a) * d.r - 1)
      g.rotation.y = -a
      const flap = Math.sin(t * 9 + i * 1.7) * 0.7
      const l = wings.current[i * 2]
      const r = wings.current[i * 2 + 1]
      if (l) l.rotation.x = flap
      if (r) r.rotation.x = -flap
    })
  })
  return (
    <>
      {defs.map((_, i) => (
        <group key={i} ref={(e) => void (refs.current[i] = e)}>
          <mesh geometry={G.box} material={M.bird} scale={[0.22, 0.05, 0.06]} />
          <mesh ref={(e) => void (wings.current[i * 2] = e)} geometry={wingGeo} material={M.bird} />
          <mesh ref={(e) => void (wings.current[i * 2 + 1] = e)} geometry={wingGeo} material={M.bird} scale={[1, 1, -1]} />
        </group>
      ))}
    </>
  )
}

/* ==================================================================== camera */
function Rig({ fold, rot, n }: { fold: MotionValue<number>; rot: MotionValue<number>; n: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  const tgt = useMemo(() => new THREE.Vector3(), [])
  const sm = useRef(-1)

  useLayoutEffect(() => {
    const mobile = width < 760
    const ox = POSTER || mobile ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.12 : -0.01
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  const lastD = useRef(30)
  useFrame((_, dt) => {
    // the camera follows the fold, but softly (so a fast scrub does not whip it around)
    const f = clamp01(fold.get())
    sm.current = sm.current < 0 ? f : sm.current + (f - sm.current) * Math.min(1, dt * 4)
    const fs = sm.current
    const e = smooth(fs)

    // bounds of the city in the fold plane (y, z): base + the chain of pages (+ their buildings along each normal)
    const S = BAND / n
    let ymin = -0.3
    let ymax = 2.4
    let zmin = 0
    const zmax = BASE_S * 2
    let a = 0
    let y = 0
    let z = 0
    const add = (py: number, pz: number) => {
      if (py < ymin) ymin = py
      if (py > ymax) ymax = py
      if (pz < zmin) zmin = pz
    }
    for (let k = 1; k <= n; k++) {
      a += Math.max(0, jointAngle(fs, k, n))
      const y2 = y + S * Math.sin(a)
      const z2 = z - S * Math.cos(a)
      const ny = Math.cos(a) * 1.9
      const nz = Math.sin(a) * 1.9
      add(y2, z2)
      add(y + ny, z + nz)
      add(y2 + ny, z2 + nz)
      y = y2
      z = z2
    }
    const ty = (ymin + ymax) / 2
    const tz = (zmin + zmax) / 2

    // crane down as it folds, ending just under the overhead street so the hanging city is seen from below
    const ceil = ceilingY(n)
    const phiEnd = Math.asin(THREE.MathUtils.clamp((ceil * 0.84 - ty) / lastD.current, 0.03, 0.5))
    const phi = lerp(THREE.MathUtils.degToRad(31), phiEnd, e)

    // fit: horizontal extent of the footprint seen on the diagonal, vertical extent of the fold
    const mobile = width < 760
    const aspect = width / height
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const hHalf = (W / 2 + (zmax - zmin) / 2) * Math.SQRT1_2 + 0.6
    const vHalf = ((ymax - ymin) / 2) * Math.cos(phi) + hHalf * Math.sin(phi) + 0.6
    const availH = POSTER ? 0.84 : mobile ? 0.98 : 0.56
    const availV = POSTER ? 0.86 : mobile ? 0.48 : 0.78
    const D = Math.max(hHalf / (tan * aspect * availH), vHalf / (tan * availV))
    lastD.current = D

    const r = rot.get()
    tgt.set(tz * Math.sin(r), ty, tz * Math.cos(r))
    const c = Math.cos(phi) * D * Math.SQRT1_2
    camera.position.set(tgt.x + c, tgt.y + Math.sin(phi) * D, tgt.z + c)
    camera.lookAt(tgt)
  })
  return null
}

function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fffaf3', 1.45)
    l.position.set(7, 15, 9)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -14
    cam.right = cam.top = 14
    cam.near = 1
    cam.far = 50
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.03
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={0.75} color="#f3f6fa" />
      <hemisphereLight args={['#f6f9fc', '#c4cfdc', 0.75]} />
      <primitive object={sun} />
      {/* soft fill from below-front so the street hanging overhead still reads */}
      <directionalLight position={[4, -6, 8]} intensity={0.55} color="#e6eef8" />
    </>
  )
}

function Clock({ clock }: { clock: { t: number } }) {
  useFrame((_, dt) => void (clock.t += Math.min(dt, 1 / 30)))
  return null
}

function City({ n, fold, grow, rot, clock }: { n: number; fold: MotionValue<number>; grow: MotionValue<number>; rot: MotionValue<number>; clock: { t: number } }) {
  const g = useRef<THREE.Group>(null)
  const base = useMemo(() => [makeSlab(77, BASE_S, 7), makeSlab(78, BASE_S, 7)], [])
  useFrame(() => {
    if (g.current) g.current.rotation.y = rot.get()
  })
  return (
    <group ref={g}>
      {base.map((d, i) => (
        <group key={i} position={[0, 0, BASE_S * (i + 1)]}>
          <Slab def={d} clock={clock} growable={false} hinge={false} />
        </group>
      ))}
      <Band key={n} n={n} fold={fold} grow={grow} clock={clock} />
    </group>
  )
}

/* ==================================================================== page */
type Dir = 'fwd' | 'right'
export default function FoldingCity() {
  const fold = useMotionValue(POSTER ? 0.62 : 0)
  const grow = useMotionValue(1)
  const rot = useMotionValue(0)
  const clock = useMemo(() => ({ t: 0 }), [])
  const [n, setN] = useState(3)
  const [nSel, setNSel] = useState(3)
  const [dir, setDir] = useState<Dir>('fwd')
  const [dragging, setDragging] = useState(false)
  const angleEl = useRef<HTMLElement>(null)
  const ctl = useRef<AnimationPlaybackControls | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const token = useRef(0)
  const drag = useRef<{ y: number; f: number; id: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const nRef = useRef(n)
  nRef.current = n

  const stop = useCallback(() => {
    token.current++
    ctl.current?.stop()
    clearTimeout(timer.current)
  }, [])

  /** ambient loop: fold up, hold, unfold, hold … */
  const loop = useCallback(
    (hold = 0) => {
      if (POSTER) return
      const my = token.current
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        if (my !== token.current) return
        const target = fold.get() < 0.5 ? 1 : 0
        ctl.current = animate(fold, target, {
          duration: target ? 3.6 : 3.0,
          ease: [0.6, 0, 0.3, 1],
          onComplete: () => my === token.current && loop(target ? 2600 : 1500),
        })
      }, hold)
    },
    [fold],
  )

  useEffect(() => {
    loop(700)
    return () => stop()
  }, [loop, stop])

  useMotionValueEvent(fold, 'change', (v) => {
    const el = angleEl.current
    if (!el) return
    let a = 0
    for (let k = 1; k <= nRef.current; k++) a += Math.max(0, jointAngle(v, k, nRef.current))
    el.textContent = `${Math.round(THREE.MathUtils.radToDeg(a))}°`
  })

  const goTo = (target: number) => {
    stop()
    const my = token.current
    if (grow.get() < 1) animate(grow, 1, { duration: 0.6 })
    ctl.current = animate(fold, target, { type: 'spring', stiffness: 55, damping: 13, onComplete: () => my === token.current && loop(2600) })
  }

  const changeN = async (v: number) => {
    if (v === nSel) return
    setNSel(v)
    stop()
    const my = token.current
    ctl.current = animate(fold, 0, { type: 'spring', stiffness: 90, damping: 18 })
    await ctl.current
    if (my !== token.current) return
    ctl.current = animate(grow, 0, { duration: 0.32, ease: 'easeIn' })
    await ctl.current
    if (my !== token.current) return
    setN(v)
    ctl.current = animate(grow, 1, { duration: 1.0, ease: 'linear' })
    await ctl.current
    if (my === token.current) loop(300)
  }

  const changeDir = async (v: Dir) => {
    if (v === dir) return
    setDir(v)
    stop()
    const my = token.current
    grow.set(1)
    ctl.current = animate(fold, 0, { type: 'spring', stiffness: 90, damping: 18 })
    await ctl.current
    if (my !== token.current) return
    ctl.current = animate(rot, v === 'right' ? Math.PI / 2 : 0, { type: 'spring', stiffness: 60, damping: 14 })
    await ctl.current
    if (my === token.current) loop(250)
  }

  /* vertical drag scrubs the fold; on release a spring carries it on in the drag direction */
  const onDown = (e: React.PointerEvent) => {
    if (POSTER || (e.target as HTMLElement).tagName !== 'CANVAS') return
    stop()
    grow.set(1)
    drag.current = { y: e.clientY, f: fold.get(), id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const h = stageRef.current?.clientHeight ?? 800
    let f = d.f + (d.y - e.clientY) / (h * 0.55)
    if (f < 0) f = -0.18 * (1 - Math.exp(f / 0.18))
    if (f > 1) f = 1 + 0.18 * (1 - Math.exp(-(f - 1) / 0.18))
    fold.set(f)
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setDragging(false)
    const v = fold.getVelocity()
    const f = fold.get()
    const target = v > 0.25 ? 1 : v < -0.25 ? 0 : f > 0.5 ? 1 : 0
    const my = token.current
    ctl.current = animate(fold, target, { type: 'spring', stiffness: 60, damping: 11, velocity: v, onComplete: () => my === token.current && loop(2600) })
  }

  return (
    <div
      ref={stageRef}
      className={`stage fc-root${dragging ? ' fc-drag' : ''}`}
      style={{ background: 'linear-gradient(180deg, #eef1f5 0%, #e5eaf0 55%, #d9e0e8 100%)' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div aria-hidden className="fc-sun" />
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.5, far: 200, position: [20, 14, 20] }} gl={{ antialias: true, alpha: true }}>
        <Rig fold={fold} rot={rot} n={n} />
        <Clock clock={clock} />
        <Lights />
        <City n={n} fold={fold} grow={grow} rot={rot} clock={clock} />
        <Clouds clock={clock} />
        <Birds clock={clock} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: ACCENT }} /> Perspective · Hinges
          </p>
          <h1>
            把城市
            <br />
            折起来
          </h1>
          <p>像《盗梦空间》里的巴黎：远处的街区沿折线一段段翻起，越过头顶变成天花板——楼房倒挂，汽车照样在倒过来的街道上行驶。上下拖动画面控制折叠角度，松手后它会自己接着折。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => goTo(fold.get() > 0.5 ? 0 : 1)}>
              折起 / 展开
            </button>
            <span className="btn fc-angle" style={{ cursor: 'default' }}>
              折角 <b ref={angleEl}>{Math.round(THREE.MathUtils.radToDeg(Array.from({ length: n }, (_, k) => jointAngle(fold.get(), k + 1, n)).reduce((x, y) => x + y, 0)))}°</b>
            </span>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'fwd', label: '向前' },
              { value: 'right', label: '向右' },
            ]}
            value={dir}
            onChange={(v) => void changeDir(v)}
          />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 2, label: '2 段' },
              { value: 3, label: '3 段' },
              { value: 4, label: '4 段' },
            ]}
            value={nSel}
            onChange={(v) => void changeN(v)}
          />
        </div>
        <p className="hint">上下拖动画面 · 控制折叠角度</p>
      </div>

      <style>{`
        .fc-root { --soft-bg: #eef1f5; cursor: grab; touch-action: none; }
        .fc-root.fc-drag { cursor: grabbing; }
        .fc-root .overlay { cursor: auto; }
        .fc-sun { position: absolute; right: 14%; top: 9%; width: min(30vw, 380px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(250,222,196,.75) 0%, rgba(248,230,214,.35) 40%, transparent 70%); }
        .fc-angle { font: 13px/1 var(--sans); color: var(--fg-2); min-width: 112px; }
        .fc-angle b { font: 600 14px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; min-width: 38px; text-align: right; }
        @media (max-width: 760px) {
          .fc-root .hero-copy p:not(.kicker) { display: none; }
          .fc-sun { right: 4%; top: 8%; width: 52vw; }
        }
      `}</style>
    </div>
  )
}
