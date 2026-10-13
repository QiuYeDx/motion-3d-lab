import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ map
   9×9 plot. r road loop · h house · H tower · S shop · t/T trees · l lamp · b flower bed · f fountain · . grass */
const MAP = [
  'ThtHh.ShT',
  'hrrrrrrrH',
  'trHhlShrh',
  'Hrht.THrt',
  'lrl.f.lrh',
  'hrSb.thrS',
  'TrhlHhTrt',
  'hrrrrrrrh',
  'tSh.HhthT',
]
const N = 9
const WAVE = 1.35 // s for the wave to cross the diagonal
const DUR = 0.8 // s per tile
const BUILD_END = WAVE + DUR + 0.05

const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const backOut = (p: number, s = 1.9) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
const smooth = (v: number) => v * v * (3 - 2 * v)

/* ------------------------------------------------------------------ palette */
const C = {
  grass: '#b5d49b',
  grass2: '#a9cc90',
  road: '#a29ca6',
  dash: '#f7f0dd',
  plaza: '#f1e6cf',
  soil: '#ecd9b6',
  tree: '#7cb87c',
  tree2: '#97c98a',
  pine: '#5f9f78',
  trunk: '#a0705a',
  water: '#8ccbe0',
  door: '#6b4a45',
  winDay: '#7d8ca0',
  lit: '#ffcf70',
  stone: '#f6eedf',
}
const WALLS = ['#f7efdf', '#f4dccb', '#e3ecef', '#f6e7bd']
const ROOFS = ['#d4694f', '#c25b57', '#6f97ad', '#e1a050']
const TOWER_WALLS = ['#f5ecdb', '#e6eef0', '#f2d6c6']
const HOUSE_NAMES = ['面包房', '花店', '邮局', '小书店', '咖啡馆', '理发店', '裁缝铺', '面馆', '钟表铺', '茶铺', '画室', '诊所', '甜品店', '照相馆', '修车铺', '杂货铺', '唱片行', '洗衣房']
const TOWER_NAMES = ['云杉公寓', '灯塔大厦', '钟楼', '图书馆', '市政厅', '广播站', '旅馆', '天文台']
const SHOP_NAMES = ['街角咖啡', '冰淇淋店', '小超市', '面包坊']

/* ------------------------------------------------------------------ shared GPU resources */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(1, 0),
  ball: new THREE.SphereGeometry(1, 12, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  plane: new THREE.PlaneGeometry(1, 1),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const M = {
  grass: lam(C.grass),
  grass2: lam(C.grass2),
  road: lam(C.road),
  dash: lam(C.dash),
  plaza: lam(C.plaza),
  soil: lam(C.soil),
  tree: lam(C.tree, { flatShading: true }),
  tree2: lam(C.tree2, { flatShading: true }),
  pine: lam(C.pine, { flatShading: true }),
  trunk: lam(C.trunk),
  water: lam(C.water),
  door: lam(C.door),
  stone: lam(C.stone),
  post: lam('#5d5a66'),
  bulb: lam('#fff4d6', { emissive: new THREE.Color(C.lit), emissiveIntensity: 0 }),
  head: lam('#fffbe8', { emissive: new THREE.Color('#fff1b8'), emissiveIntensity: 0 }),
  tail: lam('#e0605a', { emissive: new THREE.Color('#ff4a3d'), emissiveIntensity: 0 }),
  wheel: lam('#3f3c46'),
  glass: lam('#bcd7e6'),
  flowers: ['#f29bb0', '#ffd36b', '#ffffff', '#f3a0d8'].map((c) => lam(c)),
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const glowTex = canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,1)')
  r.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
})
const beamTex = canvasTex(128, 64, (g) => {
  const lg = g.createLinearGradient(0, 0, 128, 0)
  lg.addColorStop(0, 'rgba(255,255,255,0.9)')
  lg.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = lg
  g.beginPath()
  g.moveTo(0, 26)
  g.lineTo(128, 0)
  g.lineTo(128, 64)
  g.lineTo(0, 38)
  g.closePath()
  g.fill()
})
const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffc66b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: '#fff0b8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })

const towerTex = new Map<number, { map: THREE.Texture; em: THREE.Texture }>()
function getTowerTex(floors: number) {
  let t = towerTex.get(floors)
  if (t) return t
  const W = 128
  const H = floors * 48
  const rects: [number, number, number, number][] = []
  for (let f = 0; f < floors; f++) for (let c = 0; c < 2; c++) rects.push([20 + c * 52, 12 + f * 48, 36, 26])
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(0,0,0,0.05)'
    for (let f = 1; f < floors; f++) g.fillRect(0, f * 48 - 2, W, 3)
    g.fillStyle = '#7f8ea3'
    rects.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h))
  })
  const em = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#fff'
    rects.forEach(([x, y, w, h], k) => {
      if (rnd(k * 3.7 + floors) < 0.22) return // a few windows stay dark
      g.fillRect(x, y, w, h)
    })
  })
  t = { map, em }
  towerTex.set(floors, t)
  return t
}

/* ------------------------------------------------------------------ context */
type Sel = { id: number; pos: [number, number, number]; name: string; sub: string }
type Ctx = {
  build: MotionValue<number>
  night: MotionValue<number>
  select: (s: Sel) => void
  registerHop: (id: number, fn: () => void) => void
  touch: () => void
}
const TownCtx = createContext<Ctx>(null!)

/* ------------------------------------------------------------------ pieces */
function Part({ p, s, m, cast = true, rot }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; cast?: boolean; rot?: [number, number, number] }) {
  return <mesh geometry={G.box} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}

/** wraps a building: hover lift, click hop + squash, label, windows turning on at night with a stagger */
function Building({ id, top, name, sub, x, z, winMat, children }: { id: number; top: number; name: string; sub: string; x: number; z: number; winMat: THREE.MeshLambertMaterial; children: React.ReactNode }) {
  const { night, select, registerHop, touch } = useContext(TownCtx)
  const ref = useRef<THREE.Group>(null)
  const pop = useMotionValue(0)
  const squash = useMotionValue(1)
  const flash = useMotionValue(0)
  const hover = useSpring(0, { stiffness: 420, damping: 26 })
  const delay = 0.25 + rnd(id * 9.1) * 0.6

  const hop = useCallback(
    (big = false) => {
      const h = big ? 0.75 : 0.35
      animate(pop, [0, 0, h, 0, 0], { duration: big ? 0.8 : 0.6, times: [0, 0.18, 0.5, 0.82, 1], ease: ['linear', 'easeOut', 'easeIn', 'linear'] })
      animate(squash, [1, 0.78, 1.14, 1, 0.84, 1.05, 1], { duration: big ? 0.8 : 0.6, times: [0, 0.18, 0.3, 0.5, 0.82, 0.9, 1] })
      if (big) animate(flash, [0, 1, 0], { duration: 1.1, times: [0, 0.15, 1] })
    },
    [pop, squash, flash],
  )
  useEffect(() => registerHop(id, () => hop(false)), [id, hop, registerHop])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const s = squash.get()
    g.position.y = pop.get() + hover.get() * 0.1
    const k = 1 / Math.sqrt(s)
    g.scale.set(k, s, k)
    const on = smooth(clamp01((night.get() - delay) / 0.12))
    winMat.emissiveIntensity = on * 1.35 + flash.get() * 1.6
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hover.set(1)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    hover.set(0)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    touch()
    hop(true)
    select({ id, pos: [x, top + 0.55, z], name, sub })
  }
  return (
    <group ref={ref} onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  )
}

function useWinMat() {
  return useMemo(() => lam(C.winDay, { emissive: new THREE.Color(C.lit), emissiveIntensity: 0 }), [])
}

function House({ id, x, z }: { id: number; x: number; z: number }) {
  const win = useWinMat()
  const r = rnd(id)
  const w = 0.56 + rnd(id + 1) * 0.12
  const hb = 0.42 + rnd(id + 2) * 0.22
  const wall = useMemo(() => lam(WALLS[Math.floor(r * WALLS.length)]), [r])
  const roof = useMemo(() => lam(ROOFS[Math.floor(rnd(id + 5) * ROOFS.length)], { flatShading: true }), [id])
  const rh = 0.34 + rnd(id + 3) * 0.12
  const name = HOUSE_NAMES[id % HOUSE_NAMES.length]
  return (
    <Building id={id} x={x} z={z} top={hb + rh} name={name} sub={`No.${String(id).padStart(2, '0')} · 2F`} winMat={win}>
      <Part p={[0, hb / 2, 0]} s={[w, hb, w]} m={wall} />
      <mesh material={roof} position={[0, hb + rh / 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[(w + 0.12) / Math.SQRT2, rh, 4]} />
      </mesh>
      <Part p={[w * 0.22, hb + rh * 0.55, -w * 0.18]} s={[0.08, 0.22, 0.08]} m={wall} />
      <Part p={[-w * 0.2, 0.12, w / 2 + 0.006]} s={[0.14, 0.24, 0.02]} m={M.door} cast={false} />
      <Part p={[w * 0.18, hb * 0.62, w / 2 + 0.006]} s={[0.14, 0.13, 0.02]} m={win} cast={false} />
      <Part p={[w / 2 + 0.006, hb * 0.62, -w * 0.18]} s={[0.02, 0.13, 0.14]} m={win} cast={false} />
      <Part p={[w / 2 + 0.006, hb * 0.62, w * 0.18]} s={[0.02, 0.13, 0.14]} m={win} cast={false} />
    </Building>
  )
}

function Tower({ id, x, z }: { id: number; x: number; z: number }) {
  const floors = 3 + Math.floor(rnd(id + 7) * 3)
  const H = floors * 0.36
  const w = 0.7
  const { map, em } = getTowerTex(floors)
  const win = useMemo(
    () => lam(TOWER_WALLS[Math.floor(rnd(id + 4) * TOWER_WALLS.length)], { map, emissiveMap: em, emissive: new THREE.Color(C.lit), emissiveIntensity: 0 }),
    [id, map, em],
  )
  const cap = useMemo(() => lam(ROOFS[Math.floor(rnd(id + 6) * ROOFS.length)]), [id])
  const mats = useMemo(() => [win, win, cap, cap, win, win], [win, cap])
  return (
    <Building id={id} x={x} z={z} top={H + 0.3} name={TOWER_NAMES[id % TOWER_NAMES.length]} sub={`${floors}F · 等距塔楼`} winMat={win}>
      <mesh geometry={G.box} material={mats} position={[0, H / 2, 0]} scale={[w, H, w]} castShadow receiveShadow />
      <Part p={[0, H + 0.03, 0]} s={[w + 0.08, 0.06, w + 0.08]} m={cap} />
      <mesh geometry={G.cyl} material={M.stone} position={[-0.14, H + 0.17, -0.12]} scale={[0.12, 0.22, 0.12]} castShadow />
      <Part p={[0.18, H + 0.1, 0.16]} s={[0.16, 0.08, 0.16]} m={M.post} />
    </Building>
  )
}

function Shop({ id, x, z }: { id: number; x: number; z: number }) {
  const win = useWinMat()
  const wall = useMemo(() => lam(WALLS[Math.floor(rnd(id + 2) * WALLS.length)]), [id])
  const awn = useMemo(() => lam(ROOFS[Math.floor(rnd(id + 3) * ROOFS.length)]), [id])
  const hb = 0.44
  return (
    <Building id={id} x={x} z={z} top={hb + 0.2} name={SHOP_NAMES[id % SHOP_NAMES.length]} sub="营业中 · 9:00–21:00" winMat={win}>
      <Part p={[0, hb / 2, 0]} s={[0.78, hb, 0.68]} m={wall} />
      <Part p={[0, hb + 0.03, 0]} s={[0.84, 0.06, 0.74]} m={awn} />
      <Part p={[0, hb + 0.13, -0.1]} s={[0.4, 0.14, 0.04]} m={M.stone} />
      {/* striped awning on the +z face */}
      {[-0.3, -0.1, 0.1, 0.3].map((dx, k) => (
        <Part key={dx} p={[dx, hb - 0.08, 0.42]} s={[0.2, 0.03, 0.2]} rot={[0.45, 0, 0]} m={k % 2 ? M.stone : awn} />
      ))}
      <Part p={[0.1, 0.17, 0.345]} s={[0.42, 0.18, 0.02]} m={win} cast={false} />
      <Part p={[-0.25, 0.13, 0.345]} s={[0.14, 0.26, 0.02]} m={M.door} cast={false} />
      <Part p={[0.395, 0.2, 0]} s={[0.02, 0.16, 0.36]} m={win} cast={false} />
    </Building>
  )
}

function Tree({ id, p, pine = false, scale = 1 }: { id: number; p: [number, number, number]; pine?: boolean; scale?: number }) {
  const ref = useRef<THREE.Group>(null)
  const ph = rnd(id) * 6
  useFrame((s) => {
    if (ref.current) ref.current.rotation.z = Math.sin(s.clock.elapsedTime * 1.3 + ph) * 0.035
  })
  return (
    <group position={p} scale={scale}>
      <group ref={ref}>
        <mesh geometry={G.cyl} material={M.trunk} position={[0, 0.12, 0]} scale={[0.05, 0.24, 0.05]} castShadow />
        {pine ? (
          <>
            <mesh material={M.pine} position={[0, 0.42, 0]} castShadow>
              <coneGeometry args={[0.28, 0.45, 6]} />
            </mesh>
            <mesh material={M.pine} position={[0, 0.66, 0]} castShadow>
              <coneGeometry args={[0.2, 0.36, 6]} />
            </mesh>
          </>
        ) : (
          <mesh geometry={G.sphere} material={rnd(id + 1) > 0.5 ? M.tree : M.tree2} position={[0, 0.44, 0]} scale={[0.27, 0.3, 0.27]} castShadow />
        )}
      </group>
    </group>
  )
}

function Lamp({ p }: { p: [number, number, number] }) {
  return (
    <group position={p}>
      <mesh geometry={G.cyl} material={M.post} position={[0, 0.3, 0]} scale={[0.025, 0.6, 0.025]} castShadow />
      <mesh geometry={G.ball} material={M.bulb} position={[0, 0.63, 0]} scale={0.07} />
      <mesh geometry={G.plane} material={glowMat} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1.5} renderOrder={2} />
    </group>
  )
}

function Fountain() {
  const jet = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    if (jet.current) jet.current.scale.y = 0.16 + Math.sin(t * 6) * 0.03
    if (ring.current) {
      const k = (t * 0.6) % 1
      ring.current.scale.setScalar(0.08 + k * 0.22)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.7
    }
  })
  return (
    <group>
      <mesh geometry={G.cyl} material={M.stone} position={[0, 0.07, 0]} scale={[0.38, 0.14, 0.38]} castShadow receiveShadow />
      <mesh geometry={G.cyl} material={M.water} position={[0, 0.142, 0]} scale={[0.32, 0.01, 0.32]} />
      <mesh geometry={G.cyl} material={M.stone} position={[0, 0.22, 0]} scale={[0.05, 0.22, 0.05]} />
      <mesh ref={jet} geometry={G.ball} material={M.water} position={[0, 0.36, 0]} scale={[0.05, 0.16, 0.05]} />
      <mesh ref={ring} position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1, 32]} />
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} />
      </mesh>
    </group>
  )
}

function FlowerBed({ id }: { id: number }) {
  return (
    <group>
      <Part p={[0, 0.06, -0.15]} s={[0.7, 0.12, 0.22]} m={M.tree} />
      {Array.from({ length: 7 }, (_, k) => (
        <mesh key={k} geometry={G.ball} material={M.flowers[k % 4]} position={[-0.3 + k * 0.1, 0.05, 0.12 + rnd(id + k) * 0.12]} scale={0.045} />
      ))}
      <Part p={[0, 0.13, 0.32]} s={[0.4, 0.03, 0.1]} m={M.trunk} />
      <Part p={[-0.15, 0.06, 0.32]} s={[0.03, 0.12, 0.08]} m={M.post} />
      <Part p={[0.15, 0.06, 0.32]} s={[0.03, 0.12, 0.08]} m={M.post} />
    </group>
  )
}

/* ------------------------------------------------------------------ tile */
function Tile({ i, j, ch }: { i: number; j: number; ch: string }) {
  const { build } = useContext(TownCtx)
  const ref = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const x = i - (N - 1) / 2
  const z = j - (N - 1) / 2
  const delay = ((i + j) / (2 * (N - 1))) * WAVE
  const id = j * N + i

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const p = clamp01((build.get() - delay) / DUR)
    g.visible = p > 0
    if (!g.visible) return
    g.position.y = (1 - backOut(p)) * -4.2
    if (inner.current) {
      const q = clamp01((p - 0.35) / 0.65)
      const e = Math.max(0.001, backOut(q, 2.4))
      inner.current.scale.set(0.4 + 0.6 * Math.min(e, 1.1), e, 0.4 + 0.6 * Math.min(e, 1.1))
    }
  })

  const road = ch === 'r'
  const top = road ? M.road : ch === 'f' ? M.plaza : (i + j) % 2 ? M.grass : M.grass2
  const horizontal = road && (j === 1 || j === 7) && i > 1 && i < 7
  const vertical = road && (i === 1 || i === 7) && j > 1 && j < 7

  let content: React.ReactNode = null
  if (ch === 'h') content = <House id={id} x={x} z={z} />
  else if (ch === 'H') content = <Tower id={id} x={x} z={z} />
  else if (ch === 'S') content = <Shop id={id} x={x} z={z} />
  else if (ch === 't')
    content = (
      <>
        <Tree id={id} p={[-0.15, 0, -0.12]} />
        {rnd(id) > 0.4 && <Tree id={id + 50} p={[0.22, 0, 0.2]} scale={0.7} />}
      </>
    )
  else if (ch === 'T') content = <Tree id={id} p={[0, 0, 0]} pine scale={1.1} />
  else if (ch === 'l')
    content = (
      <>
        <Lamp p={[0.18, 0, 0.18]} />
        <mesh geometry={G.sphere} material={M.tree2} position={[-0.2, 0.1, -0.2]} scale={[0.17, 0.13, 0.17]} castShadow />
      </>
    )
  else if (ch === 'b') content = <FlowerBed id={id} />
  else if (ch === 'f') content = <Fountain />

  return (
    <group ref={ref} position={[x, 0, z]} visible={false}>
      <mesh geometry={G.box} material={top} position={[0, -0.06, 0]} scale={[0.985, 0.12, 0.985]} receiveShadow />
      <mesh geometry={G.box} material={M.soil} position={[0, -0.42, 0]} scale={[0.985, 0.6, 0.985]} />
      {horizontal && <Part p={[0, 0.003, 0]} s={[0.34, 0.01, 0.05]} m={M.dash} cast={false} />}
      {vertical && <Part p={[0, 0.003, 0]} s={[0.05, 0.01, 0.34]} m={M.dash} cast={false} />}
      {content && <group ref={inner}>{content}</group>}
    </group>
  )
}

/* ------------------------------------------------------------------ cars */
const _p = { x: 0, z: 0, dx: 1, dz: 0 }
/** point on a rounded-square loop of half-size h, corner radius R, arc-length s */
function loop(s: number, h: number, R: number) {
  const L = 2 * (h - R)
  const arc = (Math.PI * R) / 2
  const seg = L + arc
  s = ((s % (4 * seg)) + 4 * seg) % (4 * seg)
  const k = Math.floor(s / seg)
  const u = s - k * seg
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]
  const starts = [
    [-h + R, -h],
    [h, -h + R],
    [h - R, h],
    [-h, h - R],
  ]
  const [dx, dz] = dirs[k]
  const [sx, sz] = starts[k]
  const nx = -dz
  const nz = dx
  if (u < L) {
    _p.x = sx + dx * u
    _p.z = sz + dz * u
    _p.dx = dx
    _p.dz = dz
  } else {
    const th = (u - L) / R
    const cx = sx + dx * L + nx * R
    const cz = sz + dz * L + nz * R
    _p.x = cx - nx * R * Math.cos(th) + dx * R * Math.sin(th)
    _p.z = cz - nz * R * Math.cos(th) + dz * R * Math.sin(th)
    _p.dx = dx * Math.cos(th) + nx * Math.sin(th)
    _p.dz = dz * Math.cos(th) + nz * Math.sin(th)
  }
  return 4 * seg
}

const CARS = [
  { lane: 0, at: 0.0, color: '#ef8a6f', speed: 1.05 },
  { lane: 0, at: 0.36, color: '#f3c969', speed: 1.05 },
  { lane: 0, at: 0.7, color: '#7fb2d6', speed: 1.05 },
  { lane: 1, at: 0.12, color: '#f8f3ea', speed: 0.9 },
  { lane: 1, at: 0.58, color: '#9fd0b6', speed: 0.9 },
]

function Car({ lane, at, color, speed }: (typeof CARS)[number]) {
  const { build } = useContext(TownCtx)
  const ref = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const st = useRef({ s: -1 })
  const mat = useMemo(() => lam(color), [color])
  const h = lane === 0 ? 3.2 : 2.8
  const R = 0.5 + (h - 3)
  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    dt = Math.min(dt, 1 / 30)
    const P = loop(0, h, R)
    if (st.current.s < 0) st.current.s = at * P
    st.current.s += dt * speed
    const s = lane === 0 ? st.current.s : P - st.current.s
    loop(s, h, R)
    const dx = lane === 0 ? _p.dx : -_p.dx
    const dz = lane === 0 ? _p.dz : -_p.dz
    g.position.set(_p.x, 0, _p.z)
    g.rotation.y = Math.atan2(-dz, dx)
    const v = smooth(clamp01((build.get() - BUILD_END + 0.45) / 0.4))
    g.scale.setScalar(Math.max(0.001, v))
    g.visible = v > 0
    if (body.current) body.current.position.y = 0.075 + Math.abs(Math.sin(state.clock.elapsedTime * 11 + at * 9)) * 0.008
  })
  return (
    <group ref={ref}>
      <group ref={body}>
        <RoundedBox args={[0.44, 0.13, 0.24]} radius={0.045} smoothness={3} material={mat} castShadow />
        <RoundedBox args={[0.22, 0.12, 0.21]} radius={0.04} smoothness={3} position={[-0.04, 0.1, 0]} material={M.glass} castShadow />
        <RoundedBox args={[0.18, 0.04, 0.215]} radius={0.015} smoothness={2} position={[-0.04, 0.165, 0]} material={mat} />
        <Part p={[0.222, 0.01, 0.07]} s={[0.012, 0.04, 0.05]} m={M.head} cast={false} />
        <Part p={[0.222, 0.01, -0.07]} s={[0.012, 0.04, 0.05]} m={M.head} cast={false} />
        <Part p={[-0.222, 0.01, 0.08]} s={[0.012, 0.03, 0.04]} m={M.tail} cast={false} />
        <Part p={[-0.222, 0.01, -0.08]} s={[0.012, 0.03, 0.04]} m={M.tail} cast={false} />
      </group>
      {[0.13, -0.13].flatMap((wx) =>
        [0.11, -0.11].map((wz) => (
          <mesh key={`${wx}${wz}`} geometry={G.cyl} material={M.wheel} position={[wx, 0.04, wz]} rotation={[Math.PI / 2, 0, 0]} scale={[0.04, 0.04, 0.04]} />
        )),
      )}
      <mesh geometry={G.plane} material={beamMat} position={[0.62, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.8, 0.5, 1]} renderOrder={3} />
    </group>
  )
}

/* ------------------------------------------------------------------ lighting */
const DAY = { amb: new THREE.Color('#fff4e6'), hemiSky: new THREE.Color('#ffffff'), hemiGround: new THREE.Color('#b8cfa0'), sun: new THREE.Color('#fff0d8') }
const NIGHT = { amb: new THREE.Color('#7a84b4'), hemiSky: new THREE.Color('#6a76a8'), hemiGround: new THREE.Color('#1b2040'), sun: new THREE.Color('#a7b8ff') }

function Lighting({ night }: { night: MotionValue<number> }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff0d8', 1.7)
    l.position.set(5, 10, 3)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -8
    cam.right = cam.top = 8
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    return l
  }, [])
  useFrame(() => {
    const n = night.get()
    if (amb.current) {
      amb.current.color.lerpColors(DAY.amb, NIGHT.amb, n)
      amb.current.intensity = THREE.MathUtils.lerp(1.15, 0.55, n)
    }
    if (hemi.current) {
      hemi.current.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, n)
      hemi.current.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, n)
      hemi.current.intensity = THREE.MathUtils.lerp(0.55, 0.45, n)
    }
    sun.color.lerpColors(DAY.sun, NIGHT.sun, n)
    sun.intensity = THREE.MathUtils.lerp(1.75, 0.5, n)
    sun.position.set(THREE.MathUtils.lerp(5, -3, n), 10, THREE.MathUtils.lerp(3, 6, n))
    const lamps = smooth(clamp01((n - 0.15) / 0.5))
    M.bulb.emissiveIntensity = lamps * 2.2
    glowMat.opacity = lamps * 0.85
    beamMat.opacity = lamps * 0.55
    M.head.emissiveIntensity = lamps * 1.6
    M.tail.emissiveIntensity = lamps * 1.2
  })
  return (
    <>
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <primitive object={sun} />
    </>
  )
}

function Town() {
  return (
    <group>
      {MAP.flatMap((row, j) => row.split('').map((ch, i) => <Tile key={`${i}-${j}`} i={i} j={j} ch={ch} />))}
      {CARS.map((c, k) => (
        <Car key={k} {...c} />
      ))}
    </group>
  )
}

/** pins a DOM element to a world point (one element, no extra React roots) */
function LabelAnchor({ pos, el }: { pos: React.RefObject<[number, number, number] | null>; el: React.RefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const p = pos.current
    const e = el.current
    if (!p || !e) return
    v.set(p[0], p[1], p[2]).project(camera)
    e.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
  })
  return null
}

/* ------------------------------------------------------------------ page */
export default function TinyTown() {
  const build = useMotionValue(0)
  const night = useMotionValue(0)
  const [mode, setMode] = useState<'day' | 'night'>('day')
  const [sel, setSel] = useState<Sel | null>(null)
  const auto = useRef(true)
  const lastTouch = useRef(0)
  const hops = useRef(new Map<number, () => void>())
  const selTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const selPos = useRef<[number, number, number] | null>(null)
  const anchor = useRef<HTMLDivElement>(null)

  const runBuild = useCallback(() => {
    build.stop()
    if (build.get() <= 0.01) {
      animate(build, BUILD_END, { duration: BUILD_END, ease: 'linear' })
      return
    }
    animate(build, 0, {
      duration: 0.9,
      ease: 'linear',
      onComplete: () => void animate(build, BUILD_END, { duration: BUILD_END, ease: 'linear' }),
    })
  }, [build])

  useEffect(() => {
    const t = setTimeout(runBuild, 250)
    return () => clearTimeout(t)
  }, [runBuild])

  useEffect(() => {
    const ctl = animate(night, mode === 'night' ? 1 : 0, { duration: 2.2, ease: [0.45, 0, 0.25, 1] })
    return () => ctl.stop()
  }, [mode, night])

  // ambient loop: day ↔ night on its own, and a random building hops now and then while idle
  useEffect(() => {
    const cyc = setInterval(() => {
      if (auto.current) setMode((m) => (m === 'day' ? 'night' : 'day'))
    }, 9000)
    const hop = setInterval(() => {
      if (performance.now() - lastTouch.current < 6000 || build.get() < BUILD_END - 0.01) return
      const ids = [...hops.current.keys()]
      hops.current.get(ids[Math.floor(Math.random() * ids.length)])?.()
    }, 2600)
    return () => {
      clearInterval(cyc)
      clearInterval(hop)
    }
  }, [build])

  const ctx = useMemo<Ctx>(
    () => ({
      build,
      night,
      select: (s) => {
        selPos.current = s.pos
        setSel(s)
        clearTimeout(selTimer.current)
        selTimer.current = setTimeout(() => setSel(null), 2800)
      },
      registerHop: (id, fn) => void hops.current.set(id, fn),
      touch: () => void (lastTouch.current = performance.now()),
    }),
    [build, night],
  )

  const isNight = mode === 'night'

  return (
    <div className={`stage tt-root${isNight ? ' tt-night' : ''}`} style={{ background: 'linear-gradient(180deg, #f4f8f0 0%, #e4efe2 58%, #d2e5d4 100%)' }}>
      <div aria-hidden className="tt-sun" />
      <motion.div aria-hidden className="tt-sky-night" style={{ opacity: night }}>
        <div className="tt-stars" />
        <div className="tt-moon" />
      </motion.div>

      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }} onPointerMissed={() => setSel(null)}>
        <IsoRig fit={19.5} mobileFit={13.8} mobileOffsetY={0.21} offset={[0.19, -0.02]} target={[0, 0.2, 0]} />
        <Lighting night={night} />
        <TownCtx.Provider value={ctx}>
          <Town />
        </TownCtx.Provider>
        <LabelAnchor pos={selPos} el={anchor} />
      </Canvas>

      <div ref={anchor} className="tt-anchor" aria-live="polite">
        <AnimatePresence>
          {sel && (
            <motion.div
              key={sel.id}
              className="tt-label"
              initial={{ opacity: 0, y: 8, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 30 }}
            >
              <b>{sel.name}</b>
              <span>{sel.sub}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#5fa77f' }} /> Isometric · Stagger build
          </p>
          <h1>
            一座小镇
            <br />
            逐格生长
          </h1>
          <p>81 块地块沿对角线依次升起，落地时带一点回弹。小车绕着环路慢慢开；入夜后窗户一盏盏亮起，路灯在地上投下暖光。点一下任意房子看看它是谁。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={runBuild}>
              重建小镇
            </button>
            <button
              className="btn"
              onClick={() => {
                auto.current = false
                setMode(isNight ? 'day' : 'night')
              }}
            >
              {isNight ? '天亮了' : '入夜'}
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'day', label: '白天' },
              { value: 'night', label: '夜晚' },
            ]}
            value={mode}
            onChange={(v) => {
              auto.current = false
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" onClick={runBuild}>
            <span>重建</span>
          </button>
        </div>
        <p className="hint">点击建筑 · 它会跳一下并报出名字</p>
      </div>

      <style>{`
        .tt-root { --soft-bg: #eef5eb; transition: background .6s; }
        .tt-root .hero-copy h1, .tt-root .hero-copy p, .tt-root .hint { transition: color .8s ease; }
        .tt-night { --fg: #f6f1e6; --fg-2: rgba(246,241,230,.66); --glass: rgba(28,32,62,.55); --glass-line: rgba(255,255,255,.1); --soft-bg: #1d2244; }
        .tt-night .btn.primary { color: #1d2244; }
        .tt-sun { position: absolute; right: 16%; top: 12%; width: min(30vw, 380px); aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle, #fff7d9 0%, #fbf1cf 45%, transparent 70%); }
        .tt-sky-night { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, #141933 0%, #1f2650 55%, #343a6c 100%); }
        .tt-stars { position: absolute; inset: 0; opacity: .8;
          background-image: radial-gradient(1.4px 1.4px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 28% 9%, #fff 50%, transparent 51%),
            radial-gradient(1.2px 1.2px at 47% 22%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 66% 12%, #fff 50%, transparent 51%),
            radial-gradient(1.6px 1.6px at 83% 26%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 92% 8%, #fff 50%, transparent 51%),
            radial-gradient(1.1px 1.1px at 57% 36%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 8% 42%, #fff 50%, transparent 51%),
            radial-gradient(1.3px 1.3px at 38% 48%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 74% 44%, #fff 50%, transparent 51%); }
        .tt-moon { position: absolute; right: 19%; top: 13%; width: 64px; height: 64px; border-radius: 50%;
          background: #fbf3d8; box-shadow: 0 0 60px 18px rgba(251,243,216,.22); }
        .tt-moon::after { content: ''; position: absolute; left: 16px; top: -6px; width: 60px; height: 60px; border-radius: 50%; background: #1b2147; }
        .tt-anchor { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
        .tt-anchor .tt-label { position: absolute; left: 0; bottom: 0; translate: -50% 0; }
        .tt-label { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 14px 7px; border-radius: 14px;
          background: rgba(255,255,255,.92); color: #1d1c1a; white-space: nowrap; transform-origin: 50% 100%;
          box-shadow: 0 10px 24px -10px rgba(30,40,30,.45), inset 0 0 0 1px rgba(0,0,0,.05); font-family: var(--sans); }
        .tt-label b { font-size: 14px; font-weight: 600; }
        .tt-label span { font: 11px/1 var(--mono); color: #7a756c; }
        @media (max-width: 760px) { .tt-sun { top: 9%; right: 6%; width: 46vw; } .tt-moon { top: 11%; right: 9%; width: 44px; height: 44px; } .tt-moon::after { left: 11px; top: -4px; width: 42px; height: 42px; } }
      `}</style>
    </div>
  )
}
