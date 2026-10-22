import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { motion, useSpring } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { createDotGeometry, createDotMaterial, createGlowMaterial, quadGeo } from './isoWarmup'
import { bakeColoured, useBakeStatic, useStagedWarmup } from './staticMerge'
import {
  buildLayout,
  P_MAX,
  PLATFORM,
  PS,
  Railway,
  Station,
  type Edge,
  type Layout,
  type Poly,
  type Sample,
  type Train,
  type TrainSpec,
  type Turnout,
  type VehKind,
} from './railwayCore'

/* ================================================================== palette — sage table, warm stone, brick red */
const C = {
  grass: '#bfd4a6',
  grass2: '#aec894',
  boardEdge: '#dcc6a2',
  boardEdge2: '#b99b75',
  ballast: '#cdc3b5',
  tie: '#806b5c',
  rail: '#8e8890',
  blade: '#e8e2d6',
  water: '#9cc8d0',
  waterDeep: '#86b8c3',
  stone: '#d8cfc2',
  stoneDark: '#a99d8f',
  platform: '#ece4d4',
  edgeLine: '#e7c15c',
  cream: '#f4ecdc',
  cream2: '#ebe0cd',
  mint: '#dfe8e2',
  brick: '#c8574a',
  slate: '#6f7e8c',
  ochre: '#d7a24c',
  roofDark: '#5f6670',
  glass: '#3d4048',
  tree: '#83a97c',
  tree2: '#9bbd8b',
  pine: '#61896d',
  trunk: '#9a7559',
  hill: '#a9c590',
  hill2: '#9dbb86',
  field: '#e3cf8f',
  red: '#d9483b',
  dark: '#34302f',
}

/* ================================================================== shared GPU resources */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  ball: new THREE.SphereGeometry(1, 12, 8),
  ico: new THREE.IcosahedronGeometry(1, 0),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone: new THREE.ConeGeometry(1, 1, 7),
  prism: (() => {
    const s = new THREE.Shape()
    s.moveTo(-0.5, 0)
    s.lineTo(0.5, 0)
    s.lineTo(0, 0.5)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
    g.translate(0, 0, -0.5)
    return g
  })(),
}
const matCache = new Map<string, THREE.MeshLambertMaterial>()
const lam = (c: string) => {
  let m = matCache.get(c)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c })
    matCache.set(c, m)
  }
  return m
}
const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 })

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type V3 = [number, number, number]
const RAIL_TOP = 0.11
const BOARD = { x0: -10.45, x1: 10.55, z0: -6.95, z1: 8.15 }
const HILL = { x: -7.5, z: -4.1, r: 2.9 }
const POND = { x: -5.1, z: 1.6, r: 0.85 }

/* ================================================================== layout + trains */
const SPECS: TrainSpec[] = [
  {
    name: '红色蒸汽',
    vmax: 1.45,
    stops: true,
    edge: 5, // O4b
    s: 4.6,
    vehs: [
      { kind: 'steam', len: 0.86 },
      { kind: 'tender', len: 0.44 },
      { kind: 'coach', len: 0.74 },
      { kind: 'coach', len: 0.74 },
      { kind: 'coach', len: 0.74 },
    ],
  },
  {
    name: '青色电车',
    vmax: 1.8,
    stops: true,
    edge: 9, // I1b (heading into the station)
    s: 4.2,
    vehs: [
      { kind: 'emuHead', len: 0.92 },
      { kind: 'emu', len: 0.88 },
      { kind: 'emuTail', len: 0.92 },
    ],
  },
  {
    name: '黄色货运',
    vmax: 1.2,
    stops: false,
    edge: 3, // O3
    s: 6.5,
    vehs: [
      { kind: 'diesel', len: 0.76 },
      { kind: 'tank', len: 0.56 },
      { kind: 'box', len: 0.56 },
      { kind: 'logs', len: 0.56 },
      { kind: 'container', len: 0.56 },
    ],
  },
]
const TRAIN_DOT = ['#d9483b', '#3f8c80', '#d7a24c']

/* ================================================================== track geometry */
function sweep(polys: Poly[], profile: [number, number][], step = 2) {
  const segs = profile.length - 1
  let quads = 0
  for (const poly of polys) quads += Math.ceil((poly.n - 1) / step) * segs
  const pos = new Float32Array(quads * 18)
  const nor = new Float32Array(quads * 18)
  const a: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  const b: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  const nrm = profile.slice(0, -1).map(([l0, y0], j) => {
    const [l1, y1] = profile[j + 1]
    const nl = -(y1 - y0)
    const ny = l1 - l0
    const nn = Math.hypot(nl, ny)
    return [nl / nn, ny / nn]
  })
  let o = 0
  const put = (arr: Float32Array, x: number, y: number, z: number) => {
    arr[o] = x
    arr[o + 1] = y
    arr[o + 2] = z
  }
  for (const poly of polys) {
    for (let i = 0; i < poly.n - 1; i += step) {
      poly.at(i * poly.h, a)
      poly.at(Math.min(poly.L, Math.min(poly.n - 1, i + step) * poly.h), b)
      for (let j = 0; j < segs; j++) {
        const [l0, y0] = profile[j]
        const [l1, y1] = profile[j + 1]
        const [nl, ny] = nrm[j]
        // A0 A1 B1 · A0 B1 B0
        const vs: [Sample, number, number][] = [
          [a, l0, y0],
          [a, l1, y1],
          [b, l1, y1],
          [a, l0, y0],
          [b, l1, y1],
          [b, l0, y0],
        ]
        for (const [s0, l, y] of vs) {
          put(pos, s0.x - s0.tz * l, y, s0.z + s0.tx * l)
          put(nor, -s0.tz * nl, ny, s0.tx * nl)
          o += 3
        }
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, o), 3))
  return g
}

function Track({ L }: { L: Layout }) {
  const { ballast, rails, ties } = useMemo(() => {
    const polys = L.edges.map((e) => e.poly)
    const ballast = sweep(polys, [
      [-0.42, 0],
      [-0.3, 0.05],
      [0.3, 0.05],
      [0.42, 0],
    ])
    const rp = (c: number): [number, number][] => [
      [c - 0.02, 0.07],
      [c - 0.02, RAIL_TOP],
      [c + 0.02, RAIL_TOP],
      [c + 0.02, 0.07],
    ]
    const rails = [sweep(polys, rp(-0.13), 2), sweep(polys, rp(0.13), 2)]
    const ties: { x: number; z: number; yaw: number }[] = []
    const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
    for (const e of L.edges) {
      const n = Math.floor(e.poly.L / 0.2)
      for (let i = 0; i <= n; i++) {
        e.poly.at((i * e.poly.L) / n, o)
        ties.push({ x: o.x, z: o.z, yaw: Math.atan2(-o.tz, o.tx) })
      }
    }
    return { ballast, rails, ties }
  }, [L])
  const tiesRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    ties.forEach((t, i) => {
      q.setFromAxisAngle(up, t.yaw)
      m.compose(new THREE.Vector3(t.x, 0.062, t.z), q, new THREE.Vector3(0.075, 0.026, 0.5))
      tiesRef.current!.setMatrixAt(i, m)
    })
    tiesRef.current!.instanceMatrix.needsUpdate = true
  }, [ties])
  return (
    <group>
      <mesh geometry={ballast} material={lam(C.ballast)} receiveShadow />
      {rails.map((g, i) => (
        <mesh key={i} geometry={g} material={lam(C.rail)} castShadow receiveShadow />
      ))}
      <instancedMesh ref={tiesRef} args={[G.box, lam(C.tie), ties.length]} receiveShadow />
    </group>
  )
}

/* ================================================================== small building blocks */
function B({ p, s, c, rot, cast = true, m }: { p: V3; s: V3; c?: string; rot?: V3; cast?: boolean; m?: THREE.Material }) {
  return <mesh geometry={G.box} material={m ?? lam(c!)} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}
function Roof({ p, s, c, rotY = 0 }: { p: V3; s: V3; c: string; rotY?: number }) {
  // prism ridge runs along local z; s = [width, height*2, length]
  return <mesh geometry={G.prism} material={lam(c)} position={p} scale={s} rotation={[0, rotY, 0]} castShadow receiveShadow />
}

function House({ x, z, w, d, h, wall, roof, rotY = 0 }: { x: number; z: number; w: number; d: number; h: number; wall: string; roof: string; rotY?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <B p={[0, h / 2, 0]} s={[w, h, d]} c={wall} />
      <Roof p={[0, h, 0]} s={[w + 0.14, 0.9, d + 0.12]} c={roof} />
      {/* door + windows on the two camera-facing sides */}
      <B p={[w / 2 + 0.005, 0.16, 0]} s={[0.02, 0.3, 0.16]} c={C.dark} cast={false} />
      <B p={[w / 2 + 0.005, h * 0.62, d * 0.28]} s={[0.02, 0.13, 0.12]} c={C.glass} cast={false} />
      <B p={[w / 2 + 0.005, h * 0.62, -d * 0.28]} s={[0.02, 0.13, 0.12]} c={C.glass} cast={false} />
      <B p={[-w * 0.22, h * 0.6, d / 2 + 0.005]} s={[0.13, 0.13, 0.02]} c={C.glass} cast={false} />
      <B p={[w * 0.22, h * 0.6, d / 2 + 0.005]} s={[0.13, 0.13, 0.02]} c={C.glass} cast={false} />
    </group>
  )
}

/* ================================================================== board, water, hill, scenery */
const grassTex = canvasTex(512, 512, (g) => {
  g.fillStyle = C.grass
  g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 2600; i++) {
    const x = rnd(i) * 512
    const y = rnd(i + 0.5) * 512
    g.fillStyle = rnd(i * 3.1) > 0.5 ? 'rgba(120,150,95,0.16)' : 'rgba(240,245,220,0.18)'
    g.fillRect(x, y, 2 + rnd(i * 7.7) * 3, 2 + rnd(i * 5.3) * 3)
  }
})
grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping
grassTex.repeat.set(3, 2.2)
const fieldTex = canvasTex(128, 128, (g) => {
  g.fillStyle = C.field
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(160,130,60,0.35)'
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 16 + 4, 128, 6)
})
const signTex = canvasTex(256, 64, (g) => {
  g.fillStyle = '#f7f3ea'
  g.fillRect(0, 0, 256, 64)
  g.fillStyle = '#2f3a44'
  g.fillRect(0, 0, 256, 6)
  g.font = '600 34px "PingFang SC","Microsoft YaHei",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('青柳站', 128, 36)
})
const clockTex = canvasTex(64, 64, (g) => {
  g.fillStyle = '#fbf7ee'
  g.beginPath()
  g.arc(32, 32, 30, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#3b3a40'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(32, 32)
  g.lineTo(32, 12)
  g.moveTo(32, 32)
  g.lineTo(46, 38)
  g.stroke()
})

function Board() {
  const W = BOARD.x1 - BOARD.x0
  const D = BOARD.z1 - BOARD.z0
  const cx = (BOARD.x0 + BOARD.x1) / 2
  const cz = (BOARD.z0 + BOARD.z1) / 2
  const top = useMemo(() => new THREE.MeshLambertMaterial({ map: grassTex }), [])
  return (
    <group>
      <mesh position={[cx, -0.18, cz]} scale={[W, 0.36, D]} geometry={G.box} material={[lam(C.boardEdge), lam(C.boardEdge), top, lam(C.boardEdge), lam(C.boardEdge), lam(C.boardEdge)]} receiveShadow />
      <B p={[cx, -0.5, cz]} s={[W - 0.3, 0.28, D - 0.3]} c={C.boardEdge2} cast={false} />
    </group>
  )
}

/** a stream from the board edge into the pond, under both left-hand bridges */
function Water() {
  const geo = useMemo(() => {
    const raw: number[] = []
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      const x = BOARD.x0 + (POND.x - BOARD.x0) * t
      raw.push(x, 1.35 + Math.sin(t * 7.5) * 0.18 * (1 - t) + 0.2 * t)
    }
    const pos: number[] = []
    for (let i = 0; i < 60; i++) {
      const [x0, z0, x1, z1] = [raw[i * 2], raw[i * 2 + 1], raw[i * 2 + 2], raw[i * 2 + 3]]
      const w0 = 0.3 + 0.06 * Math.sin(i * 0.7)
      const w1 = 0.3 + 0.06 * Math.sin((i + 1) * 0.7)
      pos.push(x0, 0, z0 - w0, x0, 0, z0 + w0, x1, 0, z1 + w1, x0, 0, z0 - w0, x1, 0, z1 + w1, x1, 0, z1 - w1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <group>
      <mesh geometry={geo} position={[0, 0.006, 0]} material={lam(C.water)} receiveShadow />
      <mesh position={[POND.x, 0.006, POND.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={lam(C.water)}>
        <circleGeometry args={[POND.r, 28]} />
      </mesh>
      <mesh position={[POND.x + 0.1, 0.008, POND.z + 0.05]} rotation={[-Math.PI / 2, 0, 0]} material={lam(C.waterDeep)}>
        <circleGeometry args={[POND.r * 0.55, 24]} />
      </mesh>
      {/* stepping stones + reeds */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} geometry={G.ico} material={lam(C.stone)} position={[POND.x + Math.cos(i * 1.3 + 2) * (POND.r + 0.08), 0.03, POND.z + Math.sin(i * 1.3 + 2) * (POND.r + 0.08)]} scale={[0.09, 0.05, 0.08]} castShadow />
      ))}
    </group>
  )
}

function Bridge({ x }: { x: number }) {
  // girder bridge carrying a track that runs along z over the stream
  return (
    <group position={[x, 0, 1.45]}>
      <B p={[0, 0.054, 0]} s={[0.66, 0.02, 1.25]} c="#5d5650" cast={false} />
      {[-0.36, 0.36].map((l) => (
        <group key={l}>
          <B p={[l, 0.17, 0]} s={[0.06, 0.24, 1.3]} c="#6b737c" />
          <B p={[l, 0.29, 0]} s={[0.1, 0.03, 1.32]} c="#59616a" />
        </group>
      ))}
      {[-0.66, 0.66].map((z) => (
        <B key={z} p={[0, 0.03, z]} s={[0.92, 0.12, 0.16]} c={C.stone} />
      ))}
    </group>
  )
}

function Hill({ L }: { L: Layout }) {
  const geo = useMemo(() => {
    const pts = [
      [HILL.r, 0],
      [HILL.r * 0.94, 0.55],
      [HILL.r * 0.81, 1.0],
      [HILL.r * 0.62, 1.38],
      [HILL.r * 0.36, 1.62],
      [0.001, 1.72],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    const g = new THREE.LatheGeometry(pts, 9)
    return g.toNonIndexed()
  }, [])
  useMemo(() => geo.computeVertexNormals(), [geo])
  // tunnel portals: where each track crosses the hill foot
  const portals = useMemo(() => {
    const out: { x: number; z: number; yaw: number }[] = []
    const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
    const R = HILL.r * 0.9
    for (const e of L.edges) {
      let prev: boolean | null = null
      for (let s = 0; s <= e.poly.L; s += 0.05) {
        e.poly.at(s, o)
        const inside = Math.hypot(o.x - HILL.x, o.z - HILL.z) < R
        if (prev !== null && inside !== prev) {
          // face outward along the track
          const sign = inside ? -1 : 1
          out.push({ x: o.x, z: o.z, yaw: Math.atan2(-o.tz * sign, o.tx * sign) })
        }
        prev = inside
      }
    }
    return out
  }, [L])
  return (
    <group>
      <mesh geometry={geo} position={[HILL.x, -0.02, HILL.z]} material={new THREE.MeshLambertMaterial({ color: C.hill, flatShading: true })} castShadow receiveShadow />
      {portals.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, p.yaw, 0]}>
          <B p={[-0.12, 0.3, 0]} s={[0.4, 0.52, 0.52]} c="#2d2b2c" cast={false} />
          <B p={[0.02, 0.3, 0.32]} s={[0.16, 0.6, 0.12]} c={C.stoneDark} />
          <B p={[0.02, 0.3, -0.32]} s={[0.16, 0.6, 0.12]} c={C.stoneDark} />
          <B p={[0.02, 0.64, 0]} s={[0.18, 0.12, 0.78]} c={C.stone} />
        </group>
      ))}
      {[
        [-7.2, -4.4, 0.9],
        [-7.9, -3.5, 0.7],
        [-6.6, -5.0, 0.6],
        [-8.3, -4.8, 0.75],
      ].map(([x, z, h], i) => {
        const d = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r
        const y = 1.72 * (1 - d * d) - 0.05
        return (
          <group key={i} position={[x, y, z]}>
            <mesh geometry={G.cone} material={lam(C.pine)} position={[0, h * 0.45, 0]} scale={[0.26 * h, h * 0.9, 0.26 * h]} castShadow />
          </group>
        )
      })}
    </group>
  )
}

function Trees({ L }: { L: Layout }) {
  const list = useMemo(() => {
    const trackPts: number[] = []
    const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
    for (const e of L.edges) for (let s = 0; s <= e.poly.L; s += 0.3) trackPts.push(e.poly.at(s, o).x, o.z)
    const blocked: [number, number, number, number][] = [
      [-2.9, 1.9, 1.3, 3.5], // station building
      [PLATFORM.x0 - 0.3, PLATFORM.z0 - 0.2, PLATFORM.x1 + 0.3, PLATFORM.z1 + 0.2],
      [1.5, -3.2, 6.5, 2.6], // houses
      [-5.6, -2.6, -3.2, -0.6], // church
      [-2.6, -2.4, 0.9, -0.2], // field
      [2.8, 2.3, 4.3, 3.6], // signal box
    ]
    const out: { x: number; z: number; s: number; k: number }[] = []
    for (let i = 0; i < 900 && out.length < 72; i++) {
      const x = BOARD.x0 + 0.35 + rnd(i * 1.7) * (BOARD.x1 - BOARD.x0 - 0.7)
      const z = BOARD.z0 + 0.35 + rnd(i * 2.3 + 0.4) * (BOARD.z1 - BOARD.z0 - 0.7)
      if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.r + 0.2) continue
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.3) continue
      if (x < POND.x && Math.abs(z - 1.45) < 0.6) continue
      if (blocked.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue
      let ok = true
      for (let j = 0; j < trackPts.length; j += 2) if (Math.hypot(trackPts[j] - x, trackPts[j + 1] - z) < 0.72) { ok = false; break }
      if (!ok || out.some((t) => Math.hypot(t.x - x, t.z - z) < 0.55)) continue
      out.push({ x, z, s: 0.75 + rnd(i * 9.1) * 0.55, k: Math.floor(rnd(i * 4.4) * 3) })
    }
    return out
  }, [L])
  const crowns = useRef<THREE.InstancedMesh>(null)
  const pines = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const col = new THREE.Color()
    list.forEach((t, i) => {
      const pine = t.k === 2
      q.setFromEuler(new THREE.Euler(0, rnd(i * 3.7) * 3, 0))
      if (pine) {
        pines.current!.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0.2 + 0.42 * t.s, t.z), q, new THREE.Vector3(0.24 * t.s, 0.85 * t.s, 0.24 * t.s)))
        crowns.current!.setMatrixAt(i, zero)
      } else {
        crowns.current!.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0.3 + 0.26 * t.s, t.z), q, new THREE.Vector3(0.27 * t.s, 0.3 * t.s, 0.27 * t.s)))
        crowns.current!.setColorAt(i, col.set(t.k ? C.tree2 : C.tree))
        pines.current!.setMatrixAt(i, zero)
      }
      trunks.current!.setMatrixAt(i, m.compose(new THREE.Vector3(t.x, 0.13, t.z), q.identity(), new THREE.Vector3(0.035, 0.26, 0.035)))
    })
    crowns.current!.instanceMatrix.needsUpdate = true
    if (crowns.current!.instanceColor) crowns.current!.instanceColor.needsUpdate = true
    pines.current!.instanceMatrix.needsUpdate = true
    trunks.current!.instanceMatrix.needsUpdate = true
  }, [list])
  const crownMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), [])
  return (
    <group>
      <instancedMesh ref={crowns} args={[G.ico, crownMat, list.length]} castShadow receiveShadow />
      <instancedMesh ref={pines} args={[G.cone, lam(C.pine), list.length]} castShadow receiveShadow />
      <instancedMesh ref={trunks} args={[G.cyl6, lam(C.trunk), list.length]} castShadow />
    </group>
  )
}

function Station3D() {
  const pz = (PLATFORM.z0 + PLATFORM.z1) / 2
  const pw = PLATFORM.z1 - PLATFORM.z0
  const px = (PLATFORM.x0 + PLATFORM.x1) / 2
  const plen = PLATFORM.x1 - PLATFORM.x0
  const signMat = useMemo(() => new THREE.MeshLambertMaterial({ map: signTex }), [])
  const clockMat = useMemo(() => new THREE.MeshBasicMaterial({ map: clockTex }), [])
  return (
    <group>
      {/* island platform */}
      <B p={[px, PLATFORM.y / 2, pz]} s={[plen, PLATFORM.y, pw]} c={C.platform} />
      <B p={[px, PLATFORM.y + 0.002, PLATFORM.z0 + 0.05]} s={[plen, 0.006, 0.04]} c={C.edgeLine} cast={false} />
      <B p={[px, PLATFORM.y + 0.002, PLATFORM.z1 - 0.05]} s={[plen, 0.006, 0.04]} c={C.edgeLine} cast={false} />
      {/* canopy */}
      {[1.1, 2.1].map((x) => (
        <B key={x} p={[x, 0.45, pz]} s={[0.05, 0.5, 0.05]} c={C.roofDark} />
      ))}
      <B p={[1.6, 0.72, pz]} s={[1.5, 0.05, 0.6]} c={C.brick} />
      <B p={[1.6, 0.75, pz]} s={[1.4, 0.03, 0.2]} c="#b34c41" cast={false} />
      {/* name board */}
      <mesh position={[1.6, 0.42, pz]} material={signMat}>
        <boxGeometry args={[0.72, 0.18, 0.03]} />
      </mesh>
      {/* benches */}
      {[-0.4, 0.5].map((x) => (
        <group key={x} position={[x, PLATFORM.y, pz]}>
          <B p={[0, 0.06, 0]} s={[0.36, 0.03, 0.12]} c={C.ochre} />
          <B p={[0, 0.03, 0]} s={[0.3, 0.06, 0.04]} c={C.roofDark} />
        </group>
      ))}
      {/* stair tower + footbridge to the station building */}
      <B p={[PLATFORM.x0 + 0.27, 0.58, pz]} s={[0.5, 0.76, 0.56]} c={C.cream2} />
      <B p={[PLATFORM.x0 + 0.27, 0.98, pz]} s={[0.58, 0.06, 0.64]} c={C.slate} />
      <B p={[PLATFORM.x0 + 0.525, 0.38, pz]} s={[0.02, 0.36, 0.22]} c={C.dark} cast={false} />
      <B p={[PLATFORM.x0 + 0.27, 0.86, (pz + 3.2) / 2]} s={[0.4, 0.05, pz - 3.2]} c={C.cream2} />
      {[-0.19, 0.19].map((l) => (
        <B key={l} p={[PLATFORM.x0 + 0.27 + l, 0.97, (pz + 3.2) / 2]} s={[0.025, 0.18, pz - 3.2]} c={C.slate} />
      ))}
      {/* station building (inside the loop) */}
      <group position={[-0.7, 0, 2.7]}>
        <B p={[0, 0.55, 0]} s={[3.6, 1.1, 1.0]} c={C.cream} />
        <Roof p={[0, 1.1, 0]} s={[1.18, 0.9, 3.75]} c={C.slate} rotY={Math.PI / 2} />
        <B p={[0.2, 1.42, 0.12]} s={[0.36, 0.5, 0.36]} c={C.cream} />
        <mesh geometry={G.cone4} material={lam(C.brick)} position={[0.2, 1.84, 0.12]} rotation={[0, Math.PI / 4, 0]} scale={[0.32, 0.34, 0.32]} castShadow />
        <mesh position={[0.2, 1.48, 0.305]} material={clockMat}>
          <circleGeometry args={[0.11, 20]} />
        </mesh>
        {[-1.3, -0.7, 0.9, 1.5].map((x) => (
          <B key={x} p={[x, 0.62, 0.505]} s={[0.24, 0.32, 0.02]} c={C.glass} cast={false} />
        ))}
        <B p={[0.2, 0.3, 0.505]} s={[0.44, 0.6, 0.02]} c={C.dark} cast={false} />
        <B p={[1.805, 0.62, 0]} s={[0.02, 0.32, 0.4]} c={C.glass} cast={false} />
      </group>
    </group>
  )
}

function Town() {
  return (
    <group>
      <House x={2.5} z={-2.2} w={1.0} d={0.9} h={0.7} wall={C.cream} roof={C.brick} />
      <House x={3.9} z={-2.3} w={0.9} d={0.8} h={0.9} wall={C.mint} roof={C.slate} />
      <House x={5.5} z={-1.4} w={0.9} d={1.3} h={0.75} wall={C.cream2} roof={C.ochre} rotY={Math.PI / 2} />
      <House x={2.6} z={-0.4} w={0.8} d={0.8} h={0.65} wall={C.cream2} roof={C.slate} />
      <House x={4.1} z={-0.3} w={1.1} d={0.85} h={1.05} wall={C.cream} roof={C.brick} />
      <House x={5.6} z={0.6} w={0.8} d={0.9} h={0.7} wall={C.mint} roof={C.brick} />
      <House x={3.0} z={1.35} w={0.9} d={0.75} h={0.62} wall={C.cream} roof={C.ochre} />
      <House x={4.7} z={1.75} w={0.8} d={0.7} h={0.6} wall={C.cream2} roof={C.slate} />
      {/* church */}
      <group position={[-4.4, 0, -1.6]}>
        <B p={[0, 0.45, 0]} s={[1.5, 0.9, 0.8]} c={C.cream} />
        <Roof p={[0, 0.9, 0]} s={[0.92, 1.0, 1.6]} c={C.slate} rotY={Math.PI / 2} />
        <B p={[0.85, 0.75, 0]} s={[0.45, 1.5, 0.45]} c={C.cream2} />
        <mesh geometry={G.cone4} material={lam(C.slate)} position={[0.85, 1.85, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.4, 0.75, 0.4]} castShadow />
        <B p={[1.08, 1.15, 0]} s={[0.02, 0.2, 0.12]} c={C.glass} cast={false} />
        <B p={[1.08, 0.2, 0]} s={[0.02, 0.36, 0.2]} c={C.dark} cast={false} />
        {[-0.45, 0, 0.45].map((x) => (
          <B key={x} p={[x - 0.1, 0.5, 0.405]} s={[0.12, 0.3, 0.02]} c={C.glass} cast={false} />
        ))}
      </group>
      {/* field with hay bales */}
      <mesh position={[-0.85, 0.008, -1.3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3.2, 1.9]} />
        <meshLambertMaterial map={fieldTex} />
      </mesh>
      {[
        [-1.9, -0.8],
        [-1.2, -1.7],
        [0.1, -1.0],
      ].map(([x, z], i) => (
        <mesh key={i} geometry={G.cyl} material={lam('#e6c56f')} position={[x, 0.09, z]} rotation={[Math.PI / 2, 0, i]} scale={[0.1, 0.16, 0.1]} castShadow />
      ))}
      {/* signal box */}
      <group position={[3.55, 0, 2.95]}>
        <B p={[0, 0.3, 0]} s={[0.8, 0.6, 0.6]} c={C.brick} />
        <B p={[0, 0.72, 0]} s={[0.84, 0.26, 0.64]} c={C.cream} />
        <B p={[0, 0.72, 0]} s={[0.86, 0.12, 0.66]} c={C.glass} cast={false} />
        <Roof p={[0, 0.85, 0]} s={[0.74, 0.5, 0.98]} c={C.slate} rotY={Math.PI / 2} />
      </group>
      {/* fence along the front edge */}
      {Array.from({ length: 30 }, (_, i) => (
        <B key={i} p={[BOARD.x0 + 0.6 + i * 0.68, 0.08, BOARD.z1 - 0.18]} s={[0.04, 0.16, 0.04]} c={C.cream} />
      ))}
      <B p={[0, 0.12, BOARD.z1 - 0.18]} s={[BOARD.x1 - BOARD.x0 - 1.0, 0.025, 0.02]} c={C.cream} />
    </group>
  )
}

/* ================================================================== vehicles */
type Pal = { main: string; dark: string; body: string; band: string; roof: string; glass: string }
const PALS: Pal[] = [
  { main: '#c8473c', dark: '#34302f', body: '#efe4cf', band: '#8f3b33', roof: '#77706b', glass: '#3b3a42' },
  { main: '#3f8c80', dark: '#2f3438', body: '#f3f1ea', band: '#3f8c80', roof: '#b9bdbc', glass: '#34393f' },
  { main: '#d7a24c', dark: '#36332f', body: '#a5553f', band: '#6f7f8c', roof: '#8d8a86', glass: '#34393f' },
]
function bx(g: THREE.Object3D, c: string, sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0) {
  const m = new THREE.Mesh(G.box, lam(c))
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, z)
  m.rotation.z = rz
  m.castShadow = true
  g.add(m)
  return m
}
function cyl(g: THREE.Object3D, c: string, r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z') {
  const m = new THREE.Mesh(G.cyl, lam(c))
  m.scale.set(r, len, r)
  m.position.set(x, y, z)
  if (axis === 'x') m.rotation.z = Math.PI / 2
  if (axis === 'z') m.rotation.x = Math.PI / 2
  m.castShadow = true
  g.add(m)
  return m
}
function buildVeh(kind: VehKind, len: number, p: Pal) {
  const g = new THREE.Group()
  const l = len
  switch (kind) {
    case 'steam':
      bx(g, p.dark, l, 0.05, 0.34, 0, 0.13, 0)
      cyl(g, p.main, 0.13, 0.5, 0.1, 0.29, 0, 'x')
      cyl(g, p.dark, 0.135, 0.1, 0.37, 0.29, 0, 'x')
      cyl(g, p.dark, 0.045, 0.16, 0.34, 0.47, 0, 'y')
      cyl(g, '#c9a35a', 0.05, 0.08, 0.1, 0.43, 0, 'y')
      bx(g, p.main, 0.27, 0.3, 0.38, -0.28, 0.31, 0)
      bx(g, p.glass, 0.2, 0.08, 0.385, -0.27, 0.38, 0)
      bx(g, p.dark, 0.33, 0.04, 0.42, -0.28, 0.48, 0)
      bx(g, p.main, 0.04, 0.07, 0.38, 0.43, 0.13, 0)
      bx(g, '#fff4d6', 0.03, 0.05, 0.06, 0.43, 0.38, 0)
      for (const x of [0.24, 0.04, -0.16]) for (const z of [-0.17, 0.17]) cyl(g, x === 0.24 ? p.dark : p.main, x === 0.24 ? 0.06 : 0.08, 0.04, x, x === 0.24 ? 0.06 : 0.08, z, 'z')
      break
    case 'tender':
      bx(g, p.dark, l - 0.04, 0.05, 0.3, 0, 0.12, 0)
      bx(g, p.main, l, 0.22, 0.36, 0, 0.25, 0)
      bx(g, '#2a2826', l - 0.08, 0.04, 0.28, 0, 0.37, 0)
      break
    case 'coach':
      bx(g, p.dark, l - 0.1, 0.05, 0.3, 0, 0.12, 0)
      bx(g, p.band, l, 0.08, 0.4, 0, 0.18, 0)
      bx(g, p.body, l, 0.17, 0.4, 0, 0.305, 0)
      bx(g, p.glass, l - 0.1, 0.075, 0.405, 0, 0.31, 0)
      bx(g, p.roof, l + 0.02, 0.05, 0.36, 0, 0.415, 0)
      break
    case 'emuHead':
    case 'emuTail': {
      const inner = new THREE.Group()
      if (kind === 'emuTail') inner.rotation.y = Math.PI
      g.add(inner)
      bx(inner, p.dark, l - 0.12, 0.05, 0.3, 0, 0.12, 0)
      bx(inner, p.body, l - 0.14, 0.27, 0.42, -0.07, 0.28, 0)
      bx(inner, p.band, l - 0.14, 0.05, 0.425, -0.07, 0.19, 0)
      bx(inner, p.glass, l - 0.3, 0.08, 0.425, -0.13, 0.32, 0)
      bx(inner, p.roof, l - 0.16, 0.04, 0.38, -0.08, 0.43, 0)
      bx(inner, p.band, 0.14, 0.16, 0.42, l / 2 - 0.07, 0.22, 0)
      bx(inner, p.glass, 0.1, 0.16, 0.4, l / 2 - 0.1, 0.355, 0, -0.55)
      bx(inner, '#fff4d6', 0.02, 0.03, 0.06, l / 2, 0.24, 0.13)
      bx(inner, '#fff4d6', 0.02, 0.03, 0.06, l / 2, 0.24, -0.13)
      break
    }
    case 'emu':
      bx(g, p.dark, l - 0.12, 0.05, 0.3, 0, 0.12, 0)
      bx(g, p.body, l, 0.27, 0.42, 0, 0.28, 0)
      bx(g, p.band, l, 0.05, 0.425, 0, 0.19, 0)
      bx(g, p.glass, l - 0.12, 0.08, 0.425, 0, 0.32, 0)
      bx(g, p.roof, l - 0.02, 0.04, 0.38, 0, 0.43, 0)
      bx(g, p.dark, 0.22, 0.015, 0.26, 0, 0.55, 0)
      bx(g, p.dark, 0.015, 0.13, 0.015, -0.04, 0.49, 0, 0.6)
      bx(g, p.dark, 0.015, 0.13, 0.015, 0.04, 0.49, 0, -0.6)
      break
    case 'diesel':
      bx(g, p.dark, l, 0.05, 0.36, 0, 0.12, 0)
      bx(g, p.dark, l + 0.01, 0.03, 0.37, 0, 0.165, 0)
      bx(g, p.main, 0.24, 0.3, 0.4, 0.21, 0.32, 0)
      bx(g, p.glass, 0.245, 0.07, 0.405, 0.21, 0.38, 0)
      bx(g, p.dark, 0.28, 0.04, 0.42, 0.21, 0.49, 0)
      bx(g, p.main, 0.46, 0.2, 0.28, -0.13, 0.27, 0)
      bx(g, p.main, 0.06, 0.16, 0.28, 0.35, 0.25, 0)
      cyl(g, p.dark, 0.03, 0.08, -0.05, 0.4, 0, 'y')
      bx(g, '#fff4d6', 0.02, 0.04, 0.05, l / 2, 0.3, 0)
      break
    case 'tank':
      bx(g, p.dark, l, 0.05, 0.34, 0, 0.12, 0)
      cyl(g, p.band, 0.14, l - 0.06, 0, 0.3, 0, 'x')
      cyl(g, p.band, 0.05, 0.08, 0, 0.45, 0, 'y')
      break
    case 'box':
      bx(g, p.dark, l - 0.04, 0.05, 0.32, 0, 0.12, 0)
      bx(g, p.body, l, 0.29, 0.38, 0, 0.3, 0)
      bx(g, p.roof, l + 0.02, 0.035, 0.4, 0, 0.46, 0)
      bx(g, '#7e3f30', 0.16, 0.22, 0.39, 0, 0.29, 0)
      break
    case 'logs':
      bx(g, '#6c5443', l, 0.05, 0.38, 0, 0.14, 0)
      for (const x of [-0.22, 0.22]) for (const z of [-0.17, 0.17]) bx(g, p.dark, 0.025, 0.2, 0.025, x, 0.25, z)
      cyl(g, '#a07a58', 0.065, l - 0.04, 0, 0.23, -0.08, 'x')
      cyl(g, '#a07a58', 0.065, l - 0.04, 0, 0.23, 0.08, 'x')
      cyl(g, '#b48b66', 0.065, l - 0.08, 0, 0.34, 0, 'x')
      break
    case 'container':
      bx(g, p.dark, l, 0.05, 0.34, 0, 0.13, 0)
      bx(g, '#4f8f8a', l - 0.04, 0.26, 0.36, 0, 0.29, 0)
      bx(g, '#437d79', l - 0.02, 0.02, 0.365, 0, 0.23, 0)
      break
  }
  return g
}
function buildBogie(c: string) {
  const g = new THREE.Group()
  bx(g, c, 0.22, 0.05, 0.3, 0, 0.085, 0)
  cyl(g, '#2a2828', 0.045, 0.32, 0.065, 0.045, 0, 'z')
  cyl(g, '#2a2828', 0.045, 0.32, -0.065, 0.045, 0, 'z')
  return g
}

const PUFF_N = 56
function Trains({ rail, ctl }: { rail: Railway; ctl: React.RefObject<SimCtl> }) {
  const built = useMemo(() => {
    const root = new THREE.Group()
    const trains = rail.trains.map((t, ti) => {
      const vehs = t.vehs.map((v) => {
        const body = buildVeh(v.kind, v.len, PALS[ti])
        bakeColoured(body)
        root.add(body)
        const bog = v.kind === 'steam' ? null : [buildBogie(PALS[ti].dark), buildBogie(PALS[ti].dark)]
        bog?.forEach((b) => {
          bakeColoured(b)
          root.add(b)
        })
        return { body, bog }
      })
      return vehs
    })
    return { root, trains }
  }, [rail])

  const puffGeo = useMemo(() => createDotGeometry(PUFF_N), [])
  const puffMat = useMemo(() => createDotMaterial('#ffffff', 0.75), [])
  const puffRef = useRef<THREE.InstancedMesh>(null)
  const puffs = useMemo(() => Array.from({ length: PUFF_N }, () => ({ x: 0, y: 0, z: 0, age: 9, life: 1, vx: 0, vz: 0, s: 0.1 })), [])
  const st = useRef({ next: 0, i: 0 })
  const tmp = useMemo(() => ({ a: { x: 0, z: 0, tx: 0, tz: 0 } as Sample, b: { x: 0, z: 0, tx: 0, tz: 0 } as Sample, m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() }), [])

  useFrame((_, rdt) => {
    const dt = ctl.current!.paused ? 0 : Math.min(rdt, 1 / 30) * ctl.current!.speed
    const { a, b } = tmp
    rail.trains.forEach((t, ti) => {
      built.trains[ti].forEach((vo, vi) => {
        const v = t.vehs[vi]
        rail.behind(t, v.c - v.half, a)
        const ax = a.x
        const az = a.z
        const atx = a.tx
        const atz = a.tz
        rail.behind(t, v.c + v.half, b)
        const cx = (ax + b.x) / 2
        const cz = (az + b.z) / 2
        const yaw = Math.atan2(-(az - b.z), ax - b.x)
        vo.body.position.set(cx, RAIL_TOP, cz)
        vo.body.rotation.y = yaw
        if (vo.bog) {
          vo.bog[0].position.set(ax, RAIL_TOP - 0.06, az)
          vo.bog[0].rotation.y = Math.atan2(-atz, atx)
          vo.bog[1].position.set(b.x, RAIL_TOP - 0.06, b.z)
          vo.bog[1].rotation.y = Math.atan2(-b.tz, b.tx)
        }
        // chuffing steam from the chimney
        if (v.kind === 'steam' && dt > 0) {
          const s = st.current
          s.next -= dt * (0.6 + (t.v / t.vmax) * 2.4)
          if (s.next <= 0) {
            s.next = 0.32
            const p = puffs[s.i]
            s.i = (s.i + 1) % PUFF_N
            p.x = cx + Math.cos(yaw) * 0.34
            p.z = cz - Math.sin(yaw) * 0.34
            p.y = RAIL_TOP + 0.56
            p.age = 0
            p.life = 1.5 + Math.random() * 0.6
            p.vx = -Math.cos(yaw) * t.v * 0.25 + (Math.random() - 0.5) * 0.06
            p.vz = Math.sin(yaw) * t.v * 0.25 + (Math.random() - 0.5) * 0.06
            p.s = 0.09 + (t.v / t.vmax) * 0.05
          }
        }
      })
    })
    const alpha = puffGeo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute
    const { m, q, p, s } = tmp
    for (let i = 0; i < PUFF_N; i++) {
      const f = puffs[i]
      f.age += dt
      const k = f.age / f.life
      if (k >= 1) {
        alpha.setX(i, 0)
        m.makeScale(0, 0, 0)
      } else {
        f.x += f.vx * dt
        f.z += f.vz * dt
        f.y += (0.32 - k * 0.15) * dt
        const sc = f.s + k * 0.32
        alpha.setX(i, (1 - k) * (1 - k) * 0.85 * Math.min(1, f.age * 8))
        m.compose(p.set(f.x, f.y, f.z), q, s.set(sc, sc, sc))
      }
      puffRef.current!.setMatrixAt(i, m)
    }
    puffRef.current!.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
  })
  return (
    <>
      <primitive object={built.root} />
      <instancedMesh ref={puffRef} args={[puffGeo, puffMat, PUFF_N]} frustumCulled={false} renderOrder={4} />
    </>
  )
}

/* ================================================================== signals */
function Signals({ rail }: { rail: Railway }) {
  const L = rail.L
  const list = useMemo(() => {
    const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
    return L.edges
      .filter((e) => e.sig)
      .map((e) => {
        e.poly.at(e.poly.L - e.margin + 0.1, o)
        const lat = e.sig * 0.43
        return { e: e.id, x: o.x - o.tz * lat, z: o.z + o.tx * lat, yaw: Math.atan2(o.tz, -o.tx) }
      })
  }, [L])
  const lamps = useRef<THREE.InstancedMesh>(null)
  const glows = useRef<THREE.InstancedMesh>(null)
  const lampMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff' }), [])
  const glowMat = useMemo(() => {
    const m = createGlowMaterial(0.62)
    m.uniforms.uIntensity.value = 1
    return m
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    list.forEach((s, i) => {
      for (let k = 0; k < 2; k++) {
        const y = 0.8 - k * 0.11
        m.compose(new THREE.Vector3(s.x, y, s.z), new THREE.Quaternion(), new THREE.Vector3(0.042, 0.042, 0.042))
        lamps.current!.setMatrixAt(i * 2 + k, m)
        m.compose(new THREE.Vector3(s.x, y, s.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
        glows.current!.setMatrixAt(i * 2 + k, m)
        lamps.current!.setColorAt(i * 2 + k, new THREE.Color('#000000'))
        glows.current!.setColorAt(i * 2 + k, new THREE.Color('#000000'))
      }
    })
    lamps.current!.instanceMatrix.needsUpdate = true
    glows.current!.instanceMatrix.needsUpdate = true
  }, [list])
  const col = useMemo(() => new THREE.Color(), [])
  const RED_ON = useMemo(() => new THREE.Color('#ff4b3e'), [])
  const RED_OFF = useMemo(() => new THREE.Color('#4a2522'), [])
  const GRN_ON = useMemo(() => new THREE.Color('#4cf08a'), [])
  const GRN_OFF = useMemo(() => new THREE.Color('#1f3a2a'), [])
  useFrame(() => {
    list.forEach((s, i) => {
      const k = rail.sigK[s.e]
      lamps.current!.setColorAt(i * 2, col.lerpColors(RED_ON, RED_OFF, k))
      lamps.current!.setColorAt(i * 2 + 1, col.lerpColors(GRN_OFF, GRN_ON, k))
      glows.current!.setColorAt(i * 2, col.copy(RED_ON).multiplyScalar(0.55 * (1 - k)))
      glows.current!.setColorAt(i * 2 + 1, col.copy(GRN_ON).multiplyScalar(0.5 * k))
    })
    lamps.current!.instanceColor!.needsUpdate = true
    glows.current!.instanceColor!.needsUpdate = true
  })
  return (
    <group>
      {list.map((s) => (
        <group key={s.e} position={[s.x, 0, s.z]} rotation={[0, s.yaw, 0]}>
          <mesh geometry={G.cyl} material={lam('#55575c')} position={[0, 0.36, 0]} scale={[0.022, 0.72, 0.022]} castShadow />
          <B p={[0, 0.745, 0]} s={[0.05, 0.25, 0.095]} c="#2c2c30" />
          <B p={[0, 0.885, 0]} s={[0.06, 0.025, 0.11]} c="#2c2c30" cast={false} />
          <B p={[0, 0.02, 0]} s={[0.1, 0.04, 0.1]} c={C.stoneDark} cast={false} />
        </group>
      ))}
      <instancedMesh ref={lamps} args={[G.ball, lampMat, list.length * 2]} />
      <instancedMesh ref={glows} args={[quadGeo, glowMat, list.length * 2]} frustumCulled={false} renderOrder={5} />
    </group>
  )
}

/* ================================================================== turnouts */
function turnoutGeom(L: Layout, to: Turnout) {
  const n = L.nodes[to.node]
  const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  const yaws = to.edges.map((id) => {
    const e = L.edges[id]
    if (to.kind === 'diverge') {
      e.poly.at(0.9, o)
    } else {
      e.poly.at(e.poly.L - 0.9, o)
    }
    return Math.atan2(-(o.z - n.z), o.x - n.x)
  })
  // lever on the opposite side to the diverging branch
  const e0 = L.edges[to.edges[0]]
  e0.poly.at(to.kind === 'diverge' ? 0.05 : e0.poly.L - 0.05, o)
  const e1 = L.edges[to.edges[1]]
  const o1: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  e1.poly.at(to.kind === 'diverge' ? 1.6 : e1.poly.L - 1.6, o1)
  const rx = -o.tz
  const rz = o.tx
  const side = (o1.x - n.x) * rx + (o1.z - n.z) * rz > 0 ? -1 : 1
  const lever: V3 = [n.x + rx * side * 0.66 + o.tx * 0.5, 0, n.z + rz * side * 0.66 + o.tz * 0.5]
  return { yaws, lever, trackYaw: Math.atan2(-o.tz, o.tx) }
}

const FLAG = [new THREE.Color('#5aa874'), new THREE.Color('#e6a23c')]
function TurnoutView({ rail, to, onToggle }: { rail: Railway; to: Turnout; onToggle: (id: number) => void }) {
  const L = rail.L
  const n = L.nodes[to.node]
  const geo = useMemo(() => turnoutGeom(L, to), [L, to])
  const blade = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const disc = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const discMat = useMemo(() => new THREE.MeshLambertMaterial({ color: FLAG[0].clone(), emissive: new THREE.Color('#000000') }), [])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0, depthWrite: false }), [])
  const hover = useSpring(0, { stiffness: 400, damping: 28 })
  useFrame((state) => {
    let d = geo.yaws[1] - geo.yaws[0]
    d = Math.atan2(Math.sin(d), Math.cos(d))
    if (blade.current) blade.current.rotation.y = geo.yaws[0] + d * to.k
    if (arm.current) arm.current.rotation.x = (to.k - 0.5) * 1.3
    if (disc.current) {
      disc.current.rotation.y = to.k * Math.PI * 0.5
      const pend = to.pending ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 10) : 0
      discMat.color.lerpColors(FLAG[0], FLAG[1], to.k)
      discMat.emissive.setScalar(pend * 0.35)
      disc.current.scale.setScalar(1 + pend * 0.25)
    }
    if (ring.current) {
      const h = hover.get()
      ringMat.opacity = h * 0.55
      ring.current.scale.setScalar(0.85 + h * 0.15)
    }
  })
  const handlers = to.clickable
    ? {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onToggle(to.id)
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          hover.set(1)
          document.body.style.cursor = 'pointer'
        },
        onPointerOut: () => {
          hover.set(0)
          document.body.style.cursor = ''
        },
      }
    : {}
  return (
    <group>
      <group ref={blade} position={[n.x, 0.075, n.z]}>
        {[-0.13, 0.13].map((l) => (
          <mesh key={l} geometry={G.box} material={lam(C.blade)} position={[0.45, 0.02, l]} scale={[0.9, 0.04, 0.035]} />
        ))}
      </group>
      {to.clickable && (
        <>
          <group position={geo.lever} rotation={[0, geo.trackYaw, 0]}>
            <B p={[0, 0.04, 0]} s={[0.2, 0.08, 0.14]} c="#4b4a50" />
            <group ref={arm} position={[0, 0.08, 0]}>
              <B p={[0, 0.13, 0]} s={[0.03, 0.26, 0.03]} c="#3a393e" />
              <mesh geometry={G.ball} material={lam(C.red)} position={[0, 0.27, 0]} scale={0.035} />
            </group>
            <mesh geometry={G.cyl} material={lam('#4b4a50')} position={[0.16, 0.22, 0]} scale={[0.014, 0.44, 0.014]} castShadow />
            <mesh ref={disc} position={[0.16, 0.46, 0]} material={discMat} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 0.025, 20]} />
            </mesh>
          </group>
          <mesh ref={ring} position={[n.x, 0.012, n.z]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
            <ringGeometry args={[0.72, 0.8, 40]} />
          </mesh>
          <mesh geometry={G.cyl} material={ghost} position={[(n.x + geo.lever[0]) / 2, 0.3, (n.z + geo.lever[2]) / 2]} scale={[0.95, 0.6, 0.95]} {...handlers} />
        </>
      )}
    </group>
  )
}

/* ================================================================== passengers */
const SHIRTS = ['#d9483b', '#3f8c80', '#e6a23c', '#5c7fb0', '#f2ede2', '#8f6aa8', '#6fa36a', '#c96f6b']
const SKIN = ['#f3d2bd', '#e7bea0', '#d29f80', '#f7dfcf']
function Passengers({ station }: { station: Station }) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.042, 0.085, 3, 8), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3() }), [])
  useLayoutEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < P_MAX; i++) {
      bodies.current!.setColorAt(i, c.set(SHIRTS[Math.floor(rnd(i * 5.1) * SHIRTS.length)]))
      heads.current!.setColorAt(i, c.set(SKIN[Math.floor(rnd(i * 2.9) * SKIN.length)]))
    }
    bodies.current!.instanceColor!.needsUpdate = true
    heads.current!.instanceColor!.needsUpdate = true
  }, [])
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const { m, q, e, p, s } = tmp
    station.pax.forEach((pp, i) => {
      const vis = pp.st !== PS.Off && pp.scale > 0.01
      const moving = pp.st === PS.Arrive || pp.st === PS.Leave || (pp.st === PS.Board && pp.delay <= 0)
      const bob = moving ? Math.abs(Math.sin(t * 11 + pp.phase)) * 0.018 : 0
      const k = vis ? pp.scale : 0
      const idleTurn = pp.st === PS.Wait ? Math.sin(t * 0.4 + pp.phase) * 0.6 : 0
      e.set(0, pp.head + idleTurn, 0)
      q.setFromEuler(e)
      p.set(pp.x, pp.y + (0.085 + bob) * k, pp.z)
      m.compose(p, q, s.set(k, k, k))
      bodies.current!.setMatrixAt(i, m)
      p.y = pp.y + (0.19 + bob) * k
      m.compose(p, q, s.set(0.042 * k, 0.042 * k, 0.042 * k))
      heads.current!.setMatrixAt(i, m)
    })
    bodies.current!.instanceMatrix.needsUpdate = true
    heads.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={bodies} args={[bodyGeo, lam('#ffffff'), P_MAX]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[G.ball, lam('#ffffff'), P_MAX]} castShadow frustumCulled={false} />
    </>
  )
}

/* ================================================================== lighting */
function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff3e2', 1.65)
    l.position.set(7, 13, 3)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -15
    cam.right = cam.top = 15
    cam.near = 0.5
    cam.far = 50
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.3} color="#f6f3ea" />
      <hemisphereLight args={['#fbfbf4', '#9fae8c', 0.65]} />
      <primitive object={sun} />
    </>
  )
}

/* ================================================================== sim driver + DOM pins */
type SimCtl = { speed: number; paused: boolean; random: boolean; lastTouch: number }
function Sim({
  rail,
  station,
  ctl,
  onTurnouts,
  pins,
  status,
  carried,
}: {
  rail: Railway
  station: Station
  ctl: React.RefObject<SimCtl>
  onTurnouts: () => void
  pins: React.RefObject<(HTMLButtonElement | null)[]>
  status: React.RefObject<(HTMLSpanElement | null)[]>
  carried: React.RefObject<HTMLElement | null>
}) {
  const st = useRef({ next: 4, states: rail.L.turnouts.map((t) => t.state * 2 + (t.pending ? 1 : 0)), texts: ['', '', ''], carried: -1 })
  const v = useMemo(() => new THREE.Vector3(), [])
  const pinPts = useMemo(() => rail.L.turnouts.filter((t) => t.clickable).map((t) => turnoutGeom(rail.L, t).lever), [rail])
  useFrame(({ camera, size }, rdt) => {
    const c = ctl.current!
    const dt = c.paused ? 0 : Math.min(rdt, 1 / 30) * c.speed
    if (dt > 0) {
      rail.update(dt)
      station.update(dt)
      // dispatcher: throw a random facing turnout every few seconds while the visitor isn't playing
      const s = st.current
      s.next -= dt
      if (s.next <= 0) {
        s.next = 3.4 + Math.random() * 3
        if (c.random && performance.now() - c.lastTouch > 7000) {
          const cand = rail.L.turnouts.filter((t) => t.clickable && !t.pending)
          const t = cand[Math.floor(Math.random() * cand.length)]
          if (t) rail.toggle(t.id)
        }
      }
    }
    const s = st.current
    let changed = false
    rail.L.turnouts.forEach((t, i) => {
      const k = t.state * 2 + (t.pending ? 1 : 0)
      if (k !== s.states[i]) {
        s.states[i] = k
        changed = true
      }
    })
    if (changed) onTurnouts()
    // pin the turnout chips
    pinPts.forEach((p, i) => {
      const el = pins.current?.[i]
      if (!el) return
      v.set(p[0], 0.95, p[2]).project(camera)
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
    })
    rail.trains.forEach((t, i) => {
      const txt = t.dwell > 0 ? '停站 · 上下客' : t.waiting > 0.25 ? '红灯 · 排队等待' : t.v > 0.05 ? (rail.L.edges[t.route[t.hi]].id >= 6 && rail.L.edges[t.route[t.hi]].id <= 10 ? '内环 · 行驶中' : '外环 · 行驶中') : '起步'
      if (txt !== s.texts[i]) {
        s.texts[i] = txt
        const el = status.current?.[i]
        if (el) {
          el.textContent = txt
          el.dataset.state = t.dwell > 0 ? 'dwell' : t.waiting > 0.25 ? 'wait' : 'run'
        }
      }
    })
    if (station.boarded !== s.carried && carried.current) {
      s.carried = station.boarded
      carried.current.textContent = String(station.boarded)
    }
  })
  return null
}

function Statics({ rail }: { rail: Railway }) {
  const ref = useRef<THREE.Group>(null)
  useBakeStatic(ref)
  const L = rail.L
  return (
    <group ref={ref}>
      <Board />
      <Water />
      <Bridge x={-9} />
      <Bridge x={-7.4} />
      <Hill L={L} />
      <Station3D />
      <Town />
      <Signals rail={rail} />
    </group>
  )
}

/** mounts the scene over a few frames so no single frame does all the CPU setup */
const STAGES = 4
function Scene({ rail, station, ctl, onReady, onToggle }: { rail: Railway; station: Station; ctl: React.RefObject<SimCtl>; onReady: () => void; onToggle: (id: number) => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (stage >= STAGES) return
    const r = requestAnimationFrame(() => setStage((s) => s + 1))
    return () => cancelAnimationFrame(r)
  }, [stage])
  useStagedWarmup(stage >= STAGES, onReady)
  const L = rail.L
  return (
    <group>
      {stage >= 1 && <Statics rail={rail} />}
      {stage >= 2 && <Track L={L} />}
      {stage >= 3 && (
        <>
          <Trees L={L} />
          {L.turnouts.map((t) => (
            <TurnoutView key={t.id} rail={rail} to={t} onToggle={onToggle} />
          ))}
        </>
      )}
      {stage >= 4 && (
        <>
          <Trains rail={rail} ctl={ctl} />
          <Passengers station={station} />
        </>
      )}
    </group>
  )
}

/* ================================================================== page */
export default function ModelRailway() {
  const { rail, station } = useMemo(() => {
    const L = buildLayout()
    const rail = new Railway(L, SPECS)
    const station = new Station()
    const tmp: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
    rail.onDwell = (t: Train, e: Edge) => {
      const doors: { x: number; z: number; dz: number }[] = []
      const edgeZ = e.platformSide < 0 ? PLATFORM.z1 : PLATFORM.z0
      const dz = e.platformSide < 0 ? 0.3 : -0.3
      t.vehs.forEach((v, i) => {
        if (v.kind === 'steam' || v.kind === 'tender') return
        rail.carCentre(t, i, tmp)
        doors.push({ x: tmp.x - 0.12, z: edgeZ, dz }, { x: tmp.x + 0.16, z: edgeZ, dz })
      })
      station.dwell(doors.filter((d) => d.x > PLATFORM.x0 + 0.6 && d.x < PLATFORM.x1 - 0.05))
    }
    return { rail, station }
  }, [])
  const ctl = useRef<SimCtl>({ speed: 1, paused: false, random: true, lastTouch: POSTER ? 0 : -1e9 })
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [random, setRandom] = useState(true)
  const [ready, setReady] = useState(false)
  const [, setTick] = useState(0)
  const pins = useRef<(HTMLButtonElement | null)[]>([])
  const status = useRef<(HTMLSpanElement | null)[]>([])
  const carried = useRef<HTMLElement | null>(null)

  useEffect(() => {
    ctl.current.speed = speed
    ctl.current.paused = paused
    ctl.current.random = random
  }, [speed, paused, random])
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const bump = useCallback(() => setTick((n) => n + 1), [])
  const toggle = useCallback(
    (id: number) => {
      ctl.current.lastTouch = performance.now()
      rail.toggle(id)
      bump()
    },
    [rail, bump],
  )
  const shuffle = useCallback(() => {
    ctl.current.lastTouch = performance.now()
    for (const t of rail.L.turnouts) if (t.clickable && Math.random() < 0.6) rail.toggle(t.id)
    bump()
  }, [rail, bump])
  const onReady = useCallback(() => setReady(true), [])
  const scene = useMemo(() => <Scene rail={rail} station={station} ctl={ctl} onReady={onReady} onToggle={toggle} />, [rail, station, onReady, toggle])
  const clickable = rail.L.turnouts.filter((t) => t.clickable)

  return (
    <div className="stage mr-root" style={{ background: 'linear-gradient(180deg, #f3f5ee 0%, #e9eee2 55%, #dde6d6 100%)' }}>
      <div aria-hidden className="mr-sun" />
      <motion.div className="mr-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.6 }}>
        <Canvas orthographic flat shadows="percentage" dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
          <IsoRig fit={27.5} mobileFit={21.5} mobileOffsetY={0.1} offset={[0.215, -0.045]} target={[0.2, 0, 0.8]} />
          <Lights />
          {scene}
          <Sim rail={rail} station={station} ctl={ctl} onTurnouts={bump} pins={pins} status={status} carried={carried} />
        </Canvas>
      </motion.div>

      <div className="overlay">
        <div className="mr-pins">
          {clickable.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => void (pins.current[i] = el)}
              className="mr-pin"
              data-state={t.state}
              data-pending={t.pending || undefined}
              onClick={() => toggle(t.id)}
              aria-label={`道岔 ${t.letter}：${t.names[t.state]}，点击切换`}
            >
              <b>{t.letter}</b>
              <span>{t.pending ? '待车过' : t.names[t.state]}</span>
            </button>
          ))}
        </div>

        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: C.red }} /> Isometric · Interlocking
          </p>
          <h1>
            桌上的
            <br />
            微缩铁路
          </h1>
          <p>
            <span className="mr-long">三列小火车共用两条交错的环线，每段轨道都是一个闭塞区间：前方有车，信号就转红，后车在信号前排队。</span>
            点道岔 A / B / C 改走向，列车立刻按新路线跑；客车进站会停下，小人上下车。
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={shuffle}>
              随机扳道
            </button>
            <span className="btn mr-stat">
              已载客 <b ref={(el) => void (carried.current = el)}>0</b> 人
            </span>
          </div>
        </motion.div>

        <div className="mr-trains" aria-live="polite">
          {rail.trains.map((t, i) => (
            <div key={t.id} className="mr-train">
              <i style={{ background: TRAIN_DOT[i] }} />
              <b>{t.name}</b>
              <span ref={(el) => void (status.current[i] = el)} data-state="run">
                起步
              </span>
            </div>
          ))}
        </div>

        <div className="dock">
          <span className="mr-dock-label">速度</span>
          <Seg
            items={[
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
            ]}
            value={speed}
            onChange={setSpeed}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused && <span className="seg-bg" />}
            <span>{paused ? '继续' : '暂停'}</span>
          </button>
          <button className="seg" aria-pressed={random} onClick={() => setRandom((r) => !r)}>
            {random && <span className="seg-bg" />}
            <span>自动扳道</span>
          </button>
        </div>
        <p className="hint">点击道岔旁的拨杆或字母标签 · 有车通过时会等它开过再扳</p>
      </div>

      <style>{`
        .mr-root { --soft-bg: #eef2e8; }
        .mr-canvas { position: absolute; inset: 0; }
        .mr-sun { position: absolute; right: 12%; top: 8%; width: min(34vw, 440px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, #fbf7e6 0%, #f5f3e0 45%, transparent 70%); }
        .mr-stat { cursor: default; font-variant-numeric: tabular-nums; }
        .mr-stat b { font-weight: 600; margin: 0 2px; }
        .mr-pins { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none !important; }
        .mr-pin { position: absolute; left: 0; top: 0; translate: -50% -100%; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
          height: 26px; padding: 0 9px 0 3px; border: 0; border-radius: 999px; cursor: pointer; white-space: nowrap;
          background: rgba(255,255,255,.9); color: #2b2f2a; font: 500 12px/1 var(--sans);
          box-shadow: 0 6px 16px -8px rgba(40,50,30,.45), inset 0 0 0 1px rgba(0,0,0,.06); transition: transform .15s var(--ease-out); }
        .mr-pin:active { transform: scale(.95); }
        .mr-pin b { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font: 600 11px/1 var(--mono); color: #fff;
          background: #5aa874; transition: background .25s; }
        .mr-pin[data-state='1'] b { background: #e6a23c; }
        .mr-pin[data-pending] { animation: mr-pulse 1s ease-in-out infinite; }
        .mr-pin[data-pending] span { color: #b5761c; }
        @keyframes mr-pulse { 50% { box-shadow: 0 0 0 4px rgba(230,162,60,.28), inset 0 0 0 1px rgba(0,0,0,.06); } }
        .mr-trains { position: absolute; right: 24px; top: 84px; display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: 14px;
          background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .mr-train { display: grid; grid-template-columns: 8px 64px 96px; align-items: center; gap: 8px; font: 12px/1.2 var(--sans); color: var(--fg); }
        .mr-train i { width: 8px; height: 8px; border-radius: 50%; }
        .mr-train b { font-weight: 600; }
        .mr-train span { font: 11px/1 var(--mono); color: var(--fg-2); transition: color .3s; }
        .mr-train span[data-state='wait'] { color: #c8473c; }
        .mr-train span[data-state='dwell'] { color: #3f8c80; }
        .mr-dock-label { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
        @media (max-width: 760px) {
          .mr-long { display: none; }
          .mr-root .hero-copy > p:not(.kicker) { font-size: 14px; line-height: 1.6; margin-top: 12px; }
          .mr-root .hero-actions { margin-top: 16px; }
          .mr-trains { display: none; }
          .mr-dock-label { display: none; }
          .mr-root .seg { padding: 0 11px; }
          .mr-pin { height: 22px; font-size: 11px; padding: 0 7px 0 2px; }
          .mr-pin b { width: 18px; height: 18px; }
          .mr-sun { right: 2%; top: 7%; width: 52vw; }
        }
      `}</style>
    </div>
  )
}

