import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import {
  CONVEYOR,
  PARCEL_ON_TABLE,
  PHONE,
  STATIONS,
  TABLE,
  T_END,
  backOut,
  bubbleAnchor,
  courierWalk,
  focusPos,
  lightState,
  parcelPos,
  productPos,
  reachedOf,
  robotLift,
  robotPose,
  scooterPose,
  span,
  stationOf,
  truckPose,
  truckSpeed,
  type Pose,
} from './orderJourneyCore'

/* ================================================================== world state (mutable, read in useFrame) */
type View = 'follow' | 'overview'
type World = {
  t: number
  speed: number
  view: View
  ready: boolean
  jump: (i: number) => void
  hover: number
}
const POSTER_T = 18.9

/* ================================================================== palette + shared resources */
const C = {
  grass: '#cde6b8',
  grass2: '#c3e0ad',
  pave: '#eef0f3',
  rim: '#f7f3ec',
  soil: '#e2d6c2',
  soil2: '#d3c5ad',
  road: '#737b8c',
  dash: '#f6f4ee',
  floor: '#e4e8ef',
  lane: '#f5c84c',
  deck: '#f2e2c6',
  wall: '#f4f1eb',
  rack: '#4f7fd1',
  shelf: '#f2a65a',
  kraft: '#d8a86a',
  kraft2: '#c8945a',
  accent: '#ff7a3d',
  teal: '#2fb6a4',
  ink: '#2b2e38',
  glass: '#bcd9ea',
  tree: '#7dbf7a',
  tree2: '#99cf86',
  pine: '#5ea37a',
  trunk: '#9c6f58',
  white: '#fbfaf7',
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  ball: new THREE.SphereGeometry(1, 16, 12),
  ico: new THREE.IcosahedronGeometry(1, 0),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.12),
  plane: new THREE.PlaneGeometry(1, 1),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const M = {
  grass: lam(C.grass),
  grass2: lam(C.grass2),
  pave: lam(C.pave),
  rim: lam(C.rim),
  soil: lam(C.soil),
  soil2: lam(C.soil2),
  road: lam(C.road),
  dash: lam(C.dash),
  floor: lam(C.floor),
  lane: lam(C.lane),
  deck: lam(C.deck),
  wall: lam(C.wall),
  rack: lam(C.rack),
  shelf: lam(C.shelf),
  kraft: lam(C.kraft),
  kraft2: lam(C.kraft2),
  accent: lam(C.accent),
  teal: lam(C.teal),
  ink: lam(C.ink),
  glass: lam(C.glass),
  tree: lam(C.tree, { flatShading: true }),
  tree2: lam(C.tree2, { flatShading: true }),
  pine: lam(C.pine, { flatShading: true }),
  trunk: lam(C.trunk),
  white: lam(C.white),
  grey: lam('#c9ced8'),
  dark: lam('#454a58'),
  skin: lam('#ffd9bf'),
  blue: lam('#3f7bd8'),
  green: lam('#46b37a'),
  red: lam('#e5534b'),
  pot: lam('#e9a07a'),
  hazard: lam('#2f3340'),
  lampR: lam('#5a2b2b', { emissive: new THREE.Color('#ff4b3e'), emissiveIntensity: 0 }),
  lampY: lam('#5a4a22', { emissive: new THREE.Color('#ffc53d'), emissiveIntensity: 0 }),
  lampG: lam('#244a34', { emissive: new THREE.Color('#35d07f'), emissiveIntensity: 0 }),
  beacon: lam('#ffb48f', { emissive: new THREE.Color('#ff7a3d'), emissiveIntensity: 0 }),
  pin: new THREE.MeshBasicMaterial({ color: C.accent }),
  pinRing: new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.5, depthWrite: false }),
  ripple: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }),
  dot: new THREE.MeshBasicMaterial({ color: C.accent }),
  hit: new THREE.MeshBasicMaterial({ visible: false }),
}

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
const FONT = "'PingFang SC','Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif"
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

const winTex = new Map<string, THREE.Texture>()
function getWinTex(cols: number, floors: number, base: string) {
  const key = `${cols}-${floors}-${base}`
  let t = winTex.get(key)
  if (t) return t
  const W = cols * 40 + 16
  const H = floors * 44 + 10
  t = canvasTex(W, H, (g) => {
    g.fillStyle = base
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(0,0,0,0.05)'
    for (let f = 1; f < floors; f++) g.fillRect(0, f * 44 + 3, W, 3)
    for (let f = 0; f < floors; f++)
      for (let c = 0; c < cols; c++) {
        g.fillStyle = (f * 7 + c * 3) % 5 === 0 ? '#ffe7a8' : '#8fa6bf'
        g.fillRect(14 + c * 40, 14 + f * 44, 24, 24)
      }
  })
  winTex.set(key, t)
  return t
}

/* ================================================================== small pieces */
function B({ p, s, m, r, cast = true, recv = true, geo = G.box }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material | THREE.Material[]; r?: [number, number, number]; cast?: boolean; recv?: boolean; geo?: THREE.BufferGeometry }) {
  return <mesh geometry={geo} material={m} position={p} scale={s} rotation={r} castShadow={cast} receiveShadow={recv} />
}

function Tree({ p, s = 1, k = 0, pine = false }: { p: [number, number]; s?: number; k?: number; pine?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    if (ref.current) ref.current.rotation.z = Math.sin(st.clock.elapsedTime * 1.2 + k * 1.7) * 0.03
  })
  return (
    <group position={[p[0], 0, p[1]]} scale={s}>
      <group ref={ref}>
        <B p={[0, 0.12, 0]} s={[0.05, 0.24, 0.05]} m={M.trunk} geo={G.cyl} />
        {pine ? (
          <>
            <mesh material={M.pine} position={[0, 0.42, 0]} castShadow>
              <coneGeometry args={[0.26, 0.42, 6]} />
            </mesh>
            <mesh material={M.pine} position={[0, 0.64, 0]} castShadow>
              <coneGeometry args={[0.18, 0.34, 6]} />
            </mesh>
          </>
        ) : (
          <B p={[0, 0.44, 0]} s={[0.26, 0.28, 0.26]} m={k % 2 ? M.tree : M.tree2} geo={G.ico} />
        )}
      </group>
    </group>
  )
}

function Building({ x, z, w, d, h, wall = '#f5efe6', cap = '#7ea7cf', floors }: { x: number; z: number; w: number; d: number; h: number; wall?: string; cap?: string; floors?: number }) {
  const mats = useMemo(() => {
    const f = floors ?? Math.max(1, Math.round(h / 0.42))
    const side = lam('#ffffff', { map: getWinTex(Math.max(1, Math.round(w / 0.36)), f, wall) })
    const sideD = lam('#ffffff', { map: getWinTex(Math.max(1, Math.round(d / 0.36)), f, wall) })
    const top = lam(wall)
    return { body: [side, side, top, top, sideD, sideD], cap: lam(cap) }
  }, [w, d, h, wall, cap, floors])
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={G.box} material={mats.body} position={[0, h / 2, 0]} scale={[w, h, d]} castShadow receiveShadow />
      <B p={[0, h + 0.03, 0]} s={[w + 0.06, 0.06, d + 0.06]} m={mats.cap} />
      <B p={[w * 0.18, h + 0.12, -d * 0.15]} s={[w * 0.28, 0.14, d * 0.3]} m={M.grey} />
    </group>
  )
}

function House({ x, z, w = 0.8, d = 0.8, h = 0.5, wall = '#f6eee2', roof = '#d9765c', rot = 0, door = true }: { x: number; z: number; w?: number; d?: number; h?: number; wall?: string; roof?: string; rot?: number; door?: boolean }) {
  const mw = useMemo(() => lam(wall), [wall])
  const mr = useMemo(() => lam(roof, { flatShading: true }), [roof])
  const rh = 0.36
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <B p={[0, h / 2, 0]} s={[w, h, d]} m={mw} />
      <mesh material={mr} position={[0, h + rh / 2, 0]} rotation={[0, 0, 0]} scale={[w + 0.12, rh, d + 0.12]} castShadow>
        <primitive object={ROOF} attach="geometry" />
      </mesh>
      {door && <B p={[w / 2 + 0.006, 0.13, 0]} s={[0.02, 0.26, 0.16]} m={M.ink} cast={false} />}
      <B p={[w * 0.18, h * 0.62, d / 2 + 0.006]} s={[0.15, 0.13, 0.02]} m={M.glass} cast={false} />
      <B p={[-w * 0.2, h * 0.62, d / 2 + 0.006]} s={[0.15, 0.13, 0.02]} m={M.glass} cast={false} />
    </group>
  )
}
/** unit gable roof prism (ridge along x) */
const ROOF = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.5, 0)
  s.lineTo(0.5, 0)
  s.lineTo(0, 1)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
  g.translate(0, -0.5, -0.5)
  g.rotateY(Math.PI / 2)
  g.computeVertexNormals()
  return g
})()

/* ================================================================== ground, roads */
type Seg2 = { x0: number; z0: number; x1: number; z1: number }
const ROADS: Seg2[] = [
  { x0: 5.0, z0: -2.0, x1: 5.0, z1: -0.4 },
  { x0: 1.6, z0: -0.4, x1: 6.5, z1: -0.4 },
  { x0: 2.0, z0: -0.4, x1: 2.0, z1: 5.0 },
  { x0: -6.5, z0: 1.6, x1: 6.5, z1: 1.6 },
  { x0: -1.6, z0: 3.4, x1: 2.0, z1: 3.4 },
  { x0: -1.6, z0: 3.4, x1: -1.6, z1: 4.4 },
  { x0: -3.7, z0: 4.4, x1: -1.6, z1: 4.4 },
]
const XS: [number, number][] = [
  [5.0, -0.4],
  [2.0, -0.4],
  [2.0, 1.6],
  [2.0, 3.4],
  [-1.6, 3.4],
  [-1.6, 4.4],
  [-1.6, 1.6],
]
const RW = 0.78

function Ground() {
  const dashes = useMemo(() => {
    const out: { x: number; z: number; h: boolean }[] = []
    for (const r of ROADS) {
      const h = r.z0 === r.z1
      const a = h ? r.x0 : r.z0
      const b = h ? r.x1 : r.z1
      for (let u = a + 0.3; u < b - 0.2; u += 0.5) {
        const x = h ? u : r.x0
        const z = h ? r.z0 : u
        if (XS.some(([ix, iz]) => Math.abs(ix - x) < 0.62 && Math.abs(iz - z) < 0.62)) continue
        out.push({ x, z, h })
      }
    }
    return out
  }, [])
  return (
    <group>
      {/* board */}
      <B p={[0, -0.09, 0]} s={[13.2, 0.18, 10.2]} m={M.rim} cast={false} />
      <B p={[0, -0.42, 0]} s={[13.0, 0.5, 10.0]} m={M.soil} cast={false} />
      <B p={[0, -0.86, 0]} s={[12.4, 0.4, 9.4]} m={M.soil2} cast={false} />
      {/* zones */}
      <B p={[-4.45, 0.01, 1.7]} s={[4.1, 0.02, 6.6]} m={M.grass} cast={false} />
      <B p={[2.0, 0.008, 1.7]} s={[9.0, 0.02, 6.6]} m={M.pave} cast={false} />
      <B p={[-5.05, 0.01, -3.3]} s={[2.9, 0.02, 3.4]} m={M.deck} cast={false} />
      <B p={[0.1, 0.02, -3.27]} s={[7.0, 0.04, 3.3]} m={M.floor} cast={false} />
      <B p={[5.1, 0.015, -3.27]} s={[2.8, 0.03, 3.3]} m={M.grey} cast={false} />
      {/* park strip + plaza lawns */}
      <B p={[-0.4, 0.016, -0.2]} s={[3.6, 0.02, 1.6]} m={M.grass2} cast={false} />
      <B p={[4.2, 0.016, 4.25]} s={[4.2, 0.02, 1.3]} m={M.grass2} cast={false} />
      <B p={[0.2, 0.016, 4.35]} s={[2.6, 0.02, 1.1]} m={M.grass2} cast={false} />
      {/* roads */}
      {ROADS.map((r, k) => {
        const h = r.z0 === r.z1
        const len = (h ? r.x1 - r.x0 : r.z1 - r.z0) + RW
        return <B key={k} p={[(r.x0 + r.x1) / 2, 0.025, (r.z0 + r.z1) / 2]} s={h ? [Math.min(len, 13.2 - Math.abs((r.x0 + r.x1) / 2) * 0), 0.03, RW] : [RW, 0.03, len]} m={M.road} cast={false} />
      })}
      {dashes.map((d, k) => (
        <B key={k} p={[d.x, 0.043, d.z]} s={d.h ? [0.24, 0.006, 0.05] : [0.05, 0.006, 0.24]} m={M.dash} cast={false} />
      ))}
      {/* zebra crossing in front of the traffic light */}
      {[-0.28, -0.14, 0, 0.14, 0.28].map((dx) => (
        <B key={dx} p={[2.0 + dx, 0.044, 0.98]} s={[0.08, 0.006, 0.22]} m={M.dash} cast={false} />
      ))}
    </group>
  )
}

/* ================================================================== ① phone */
const SCR_W = 360
const SCR_H = 720
const PH_W = 0.95
const PH_H = 1.9
const SC_W = 0.84
const SC_H = 1.68
type Page = 'shop' | 'checkout' | 'paid' | 'track'
function pageOf(t: number): Page {
  return t < 1.8 ? 'shop' : t < 3.35 ? 'checkout' : t < 5.2 ? 'paid' : 'track'
}
function drawScreen(g: CanvasRenderingContext2D, page: Page, pressed: boolean, reached: number) {
  const W = SCR_W
  const H = SCR_H
  g.clearRect(0, 0, W, H)
  g.fillStyle = '#f6f7fb'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#20232c'
  g.font = `600 18px ${FONT}`
  g.textBaseline = 'middle'
  g.fillText('10:24', 26, 30)
  g.fillRect(W - 58, 24, 32, 13)
  const title = (s: string) => {
    g.fillStyle = '#20232c'
    g.font = `700 30px ${FONT}`
    g.fillText(s, 26, 86)
  }
  const button = (label: string, y: number) => {
    rr(g, 26, y, W - 52, 74, 37)
    g.fillStyle = pressed ? '#d9561d' : C.accent
    g.fill()
    g.fillStyle = '#fff'
    g.font = `700 28px ${FONT}`
    g.textAlign = 'center'
    g.fillText(label, W / 2, y + 38)
    g.textAlign = 'left'
  }
  const cup = (x: number, y: number, s: number) => {
    rr(g, x, y, s, s, s * 0.16)
    g.fillStyle = '#d4f1ec'
    g.fill()
    g.fillStyle = C.teal
    rr(g, x + s * 0.34, y + s * 0.26, s * 0.32, s * 0.56, s * 0.06)
    g.fill()
    g.fillStyle = '#1d8f80'
    rr(g, x + s * 0.32, y + s * 0.18, s * 0.36, s * 0.1, s * 0.03)
    g.fill()
  }
  if (page === 'shop') {
    title('好物小店')
    cup(26, 128, W - 52)
    g.fillStyle = '#20232c'
    g.font = `700 32px ${FONT}`
    g.fillText('随行保温杯', 26, 470)
    g.fillStyle = '#7b8090'
    g.font = `400 20px ${FONT}`
    g.fillText('316 不锈钢 · 450ml · 次日达', 26, 510)
    g.fillStyle = C.accent
    g.font = `800 40px ${FONT}`
    g.fillText('¥129', 26, 562)
    button('立即购买', 608)
  } else if (page === 'checkout') {
    title('确认订单')
    rr(g, 26, 124, W - 52, 112, 18)
    g.fillStyle = '#fff'
    g.fill()
    g.fillStyle = '#7b8090'
    g.font = `400 19px ${FONT}`
    g.fillText('收货地址', 46, 156)
    g.fillStyle = '#20232c'
    g.font = `600 23px ${FONT}`
    g.fillText('梧桐路 18 号 · 3 单元', 46, 196)
    rr(g, 26, 252, W - 52, 140, 18)
    g.fillStyle = '#fff'
    g.fill()
    cup(44, 272, 100)
    g.fillStyle = '#20232c'
    g.font = `600 23px ${FONT}`
    g.fillText('随行保温杯', 160, 300)
    g.fillStyle = '#7b8090'
    g.font = `400 19px ${FONT}`
    g.fillText('×1 · 次日达 · 免运费', 160, 336)
    g.fillStyle = '#20232c'
    g.font = `400 22px ${FONT}`
    g.fillText('实付', 26, 452)
    g.fillStyle = C.accent
    g.font = `800 38px ${FONT}`
    g.fillText('¥129', 90, 452)
    button('提交订单', 608)
  } else if (page === 'paid') {
    g.fillStyle = '#e8f8ef'
    g.beginPath()
    g.arc(W / 2, 230, 92, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#35c07a'
    g.beginPath()
    g.arc(W / 2, 230, 64, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#fff'
    g.lineWidth = 12
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(W / 2 - 28, 232)
    g.lineTo(W / 2 - 6, 254)
    g.lineTo(W / 2 + 30, 212)
    g.stroke()
    g.textAlign = 'center'
    g.fillStyle = '#20232c'
    g.font = `700 36px ${FONT}`
    g.fillText('下单成功', W / 2, 380)
    g.fillStyle = '#7b8090'
    g.font = `400 20px ${FONT}`
    g.fillText('订单号 2610 1524 0024', W / 2, 424)
    g.fillStyle = C.accent
    g.font = `600 22px ${FONT}`
    g.fillText('预计今天 16:40 送达', W / 2, 470)
    g.textAlign = 'left'
  } else {
    title('物流详情')
    rr(g, 26, 118, W - 52, 92, 18)
    g.fillStyle = '#fff4ec'
    g.fill()
    g.fillStyle = C.accent
    g.font = `700 24px ${FONT}`
    g.fillText(STATIONS[Math.max(0, reached - 1)].zh, 46, 152)
    g.fillStyle = '#9a7a66'
    g.font = `400 18px ${FONT}`
    g.fillText('预计今天 16:40 送达', 46, 186)
    const y0 = 256
    const step = 72
    g.fillStyle = '#e3e5ec'
    g.fillRect(45, y0, 4, step * 5)
    g.fillStyle = C.accent
    g.fillRect(45, y0, 4, step * Math.max(0, reached - 1))
    STATIONS.forEach((s, i) => {
      const y = y0 + i * step
      const done = i < reached
      g.beginPath()
      g.arc(47, y, done ? 11 : 9, 0, Math.PI * 2)
      g.fillStyle = done ? C.accent : '#d5d8e0'
      g.fill()
      g.fillStyle = done ? '#20232c' : '#a3a7b3'
      g.font = `${i === reached - 1 ? 700 : 500} 22px ${FONT}`
      g.fillText(s.zh, 74, y - 4)
      g.fillStyle = '#9aa0ad'
      g.font = `400 16px ${FONT}`
      g.fillText(done ? s.time : '—', 74, y + 22)
    })
  }
}

function PhoneStation({ w }: { w: World }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = SCR_W
    c.height = SCR_H
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    drawScreen(c.getContext('2d')!, 'shop', false, 0)
    return t
  }, [])
  const scrMat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex }), [tex])
  const key = useRef('')
  const ripple = useRef<THREE.Mesh>(null)
  const dots = useRef<THREE.Group>(null)
  const curve = useMemo(
    () => new THREE.QuadraticBezierCurve3(new THREE.Vector3(PHONE.x + 0.3, 2.15, PHONE.z + 0.3), new THREE.Vector3(-3.6, 3.6, -2.6), new THREE.Vector3(-2.6, 0.55, -2.2)),
    [],
  )
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = w.t
    const page = pageOf(t)
    const pressed = (t > 1.3 && t < 1.65) || (t > 2.95 && t < 3.3)
    const reached = reachedOf(t)
    const k = `${page}|${pressed}|${page === 'track' ? reached : 0}`
    if (k !== key.current) {
      key.current = k
      drawScreen((tex.image as HTMLCanvasElement).getContext('2d')!, page, pressed, reached)
      tex.needsUpdate = true
    }
    // tap ripple on the button
    const r = ripple.current
    if (r) {
      const u = t > 1.25 && t < 1.95 ? (t - 1.25) / 0.7 : t > 2.9 && t < 3.6 ? (t - 2.9) / 0.7 : -1
      r.visible = u >= 0
      if (u >= 0) {
        r.scale.setScalar(0.05 + u * 0.32)
        ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.85
      }
    }
    // order data flies from the phone to the warehouse
    const g = dots.current
    if (g)
      g.children.forEach((c, i) => {
        const u = (t - 3.7) / 1.25 - i * 0.07
        c.visible = u > 0 && u < 1
        if (c.visible) {
          curve.getPoint(u, v)
          c.position.copy(v)
          c.scale.setScalar(0.06 * (1 - i * 0.1))
        }
      })
  })
  const btnY = 608 + 37
  return (
    <group>
      <group position={[PHONE.x, 0, PHONE.z]}>
        <B p={[0, 0.06, 0]} s={[0.8, 0.12, 0.8]} m={M.white} geo={G.cyl} />
        <B p={[0, 0.13, 0]} s={[0.6, 0.04, 0.6]} m={M.accent} geo={G.cyl} cast={false} />
        <group rotation={[0, Math.PI / 4, 0]}>
          <group position={[0, 0.2, 0]} rotation={[-0.14, 0, 0]}>
            <B p={[0, PH_H / 2, 0]} s={[PH_W, PH_H, 0.09]} m={M.ink} geo={G.rbox} />
            <mesh material={scrMat} position={[0, PH_H / 2, 0.047]} scale={[SC_W, SC_H, 1]}>
              <primitive object={G.plane} attach="geometry" />
            </mesh>
            <mesh ref={ripple} material={M.ripple} position={[0, PH_H / 2 + (0.5 - btnY / SCR_H) * SC_H, 0.05]} visible={false}>
              <ringGeometry args={[0.6, 1, 32]} />
            </mesh>
            <B p={[0, PH_H - 0.07, 0.048]} s={[0.18, 0.03, 0.005]} m={M.dark} cast={false} />
          </group>
          {/* stand */}
          <B p={[0, 0.32, -0.22]} s={[0.36, 0.42, 0.06]} r={[0.5, 0, 0]} m={M.grey} />
        </group>
      </group>
      {/* props on the deck */}
      <group position={[-6.0, 0, -1.95]}>
        <B p={[0, 0.14, 0]} s={[0.22, 0.28, 0.22]} m={M.pot} geo={G.cyl} />
        <B p={[0, 0.48, 0]} s={[0.26, 0.32, 0.26]} m={M.tree} geo={G.ico} />
      </group>
      <group position={[-3.9, 0, -4.6]}>
        <B p={[0, 0.12, 0]} s={[0.18, 0.24, 0.18]} m={M.pot} geo={G.cyl} />
        <mesh material={M.pine} position={[0, 0.48, 0]} castShadow>
          <coneGeometry args={[0.2, 0.5, 6]} />
        </mesh>
      </group>
      <group position={[-6.0, 0, -4.2]}>
        <B p={[0, 0.22, 0]} s={[0.36, 0.06, 1.1]} m={M.shelf} />
        <B p={[0, 0.1, -0.42]} s={[0.3, 0.2, 0.06]} m={M.dark} />
        <B p={[0, 0.1, 0.42]} s={[0.3, 0.2, 0.06]} m={M.dark} />
      </group>
      <group ref={dots}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} geometry={G.ball} material={M.dot} visible={false} />
        ))}
      </group>
    </group>
  )
}

/* ================================================================== ② warehouse + robot */
const RACKS = [-2.3, -0.6, 1.1]
const BOX_COLS = [C.kraft, '#9fc4e8', '#f4f1ea', C.kraft2, '#f1c27a']
function Racks() {
  const boxes = useMemo(() => {
    const out: { p: [number, number, number]; s: number; c: number }[] = []
    let k = 0
    RACKS.forEach((rx, ri) => {
      for (let lvl = 0; lvl < 3; lvl++)
        for (let slot = 0; slot < 3; slot++) {
          k++
          if (ri === 1 && lvl === 1 && slot === 1) continue // the picked one is a separate object
          if ((k * 7) % 5 === 0) continue
          const s = 0.22 + ((k * 13) % 4) * 0.025
          out.push({ p: [rx - 0.38 + slot * 0.38, 0.07 + lvl * 0.4 + s / 2, -4.15 + (((k * 5) % 3) - 1) * 0.04], s, c: k % BOX_COLS.length })
        }
    })
    return out
  }, [])
  const mats = useMemo(() => BOX_COLS.map((c) => lam(c)), [])
  return (
    <group>
      {RACKS.map((rx) => (
        <group key={rx} position={[rx, 0, -4.15]}>
          {[-0.6, 0.6].flatMap((dx) => [-0.22, 0.22].map((dz) => <B key={`${dx}${dz}`} p={[dx, 0.66, dz]} s={[0.05, 1.32, 0.05]} m={M.rack} />))}
          {[0.05, 0.45, 0.85, 1.25].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.26, 0.04, 0.5]} m={M.shelf} />
          ))}
        </group>
      ))}
      {boxes.map((b, i) => (
        <B key={i} p={b.p} s={[b.s, b.s * 0.85, b.s]} m={mats[b.c]} />
      ))}
    </group>
  )
}

function Warehouse() {
  const sign = useMemo(
    () =>
      canvasTex(512, 128, (g) => {
        g.fillStyle = '#2b2e38'
        rr(g, 0, 0, 512, 128, 24)
        g.fill()
        g.fillStyle = C.accent
        g.beginPath()
        g.arc(64, 64, 22, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#fff'
        g.font = `700 54px ${FONT}`
        g.textBaseline = 'middle'
        g.fillText('智能仓 WH-03', 108, 68)
      }),
    [],
  )
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sign }), [sign])
  const lanes = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = []
    const add = (x0: number, z0: number, x1: number, z1: number) =>
      out.push({ p: [(x0 + x1) / 2, 0.045, (z0 + z1) / 2], s: [Math.abs(x1 - x0) + 0.05, 0.005, Math.abs(z1 - z0) + 0.05] })
    add(-2.6, -2.2, 1.6, -2.2)
    add(-0.6, -2.2, -0.6, -3.35)
    add(1.6, -2.2, 1.6, -3.0)
    return out
  }, [])
  return (
    <group>
      {/* back + side walls */}
      <B p={[0.1, 0.6, -4.97]} s={[7.1, 1.2, 0.1]} m={M.wall} />
      <B p={[-3.42, 0.3, -3.3]} s={[0.1, 0.6, 3.45]} m={M.wall} />
      <B p={[0.1, 1.22, -4.97]} s={[7.14, 0.05, 0.14]} m={M.grey} />
      <mesh material={signMat} position={[2.75, 0.84, -4.915]} scale={[1.4, 0.35, 1]}>
        <primitive object={G.plane} attach="geometry" />
      </mesh>
      {lanes.map((l, i) => (
        <B key={i} p={l.p} s={l.s} m={M.lane} cast={false} />
      ))}
      {/* charging pad */}
      <B p={[-2.6, 0.045, -2.2]} s={[0.78, 0.01, 0.62]} m={M.green} cast={false} />
      <Racks />
    </group>
  )
}

function Robot({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const lift = useRef<THREE.Group>(null)
  const pose = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0 }), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = w.t
    robotPose(t, pose)
    g.position.set(pose.x, 0.05, pose.z)
    // symmetric AGV: keep heading in [-π/2, π/2] so reversing never spins it around
    let y = pose.yaw
    while (y > Math.PI / 2) y -= Math.PI
    while (y < -Math.PI / 2) y += Math.PI
    g.rotation.y = y
    if (lift.current) lift.current.position.y = robotLift(t)
    const busy = t > 4.9 && t < 10.3
    M.beacon.emissiveIntensity = busy ? 0.6 + 0.6 * Math.max(0, Math.sin(t * 12)) : 0.15
  })
  return (
    <group ref={ref}>
      <B p={[0, 0.11, 0]} s={[0.62, 0.18, 0.46]} m={M.white} geo={G.rbox} />
      <B p={[0, 0.07, 0]} s={[0.64, 0.05, 0.48]} m={M.accent} cast={false} />
      <B p={[0.25, 0.22, 0.17]} s={[0.05, 0.05, 0.05]} m={M.beacon} geo={G.ball} />
      <group ref={lift}>
        <B p={[0, 0.215, 0]} s={[0.46, 0.035, 0.36]} m={M.dark} />
      </group>
    </group>
  )
}

/* ================================================================== ③ packing */
const PARCEL = { w: 0.34, h: 0.26 }
function Product({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = w.t
    productPos(t, v)
    g.position.copy(v)
    g.visible = t < 11.75
  })
  return (
    <group ref={ref}>
      <B p={[0, 0.11, 0]} s={[0.2, 0.22, 0.2]} m={M.teal} />
      <B p={[0, 0.11, 0]} s={[0.205, 0.05, 0.205]} m={M.white} cast={false} />
    </group>
  )
}

function Parcel({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const flaps = useRef<(THREE.Group | null)[]>([])
  const tape = useRef<THREE.Mesh>(null)
  const label = useRef<THREE.Mesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  const labelMat = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: canvasTex(128, 96, (g) => {
          g.fillStyle = '#ffffff'
          g.fillRect(0, 0, 128, 96)
          g.fillStyle = C.accent
          g.fillRect(0, 0, 128, 24)
          g.fillStyle = '#2b2e38'
          for (let i = 0; i < 22; i++) g.fillRect(12 + i * 4.6, 40, i % 3 ? 2 : 3.2, 34)
          g.fillRect(12, 80, 60, 5)
        }),
      }),
    [],
  )
  const { w: S, h: H } = PARCEL
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = w.t
    parcelPos(t, v)
    g.position.copy(v)
    // yaw: follow the carrier so the box sits square on the truck / scooter
    g.rotation.y = t > 14.6 && t < 24 ? truckPose(t, { x: 0, z: 0, yaw: 0 }).yaw : t >= 24.8 && t < 29 ? scooterPose(t, { x: 0, z: 0, yaw: 0 }).yaw : 0
    // flaps: ±x pair first, then ±z
    const a = span(t, 10.95, 11.45)
    const b = span(t, 11.35, 11.85)
    const open = (u: number) => -2.05 * (1 - u)
    flaps.current.forEach((f, i) => {
      if (!f) return
      f.rotation.set(0, 0, 0)
      const ang = open(i < 2 ? a : b)
      if (i === 0) f.rotation.z = ang
      else if (i === 1) f.rotation.z = -ang
      else if (i === 2) f.rotation.x = -ang
      else f.rotation.x = ang
    })
    if (tape.current) {
      const u = span(t, 11.95, 12.5)
      tape.current.visible = u > 0.01
      tape.current.scale.x = Math.max(0.001, u) * (S + 0.03)
      tape.current.position.x = (-(1 - u) * (S + 0.03)) / 2
    }
    if (label.current) {
      const u = span(t, 12.98, 13.2, (x) => backOut(x, 2.4))
      label.current.visible = t > 12.98
      label.current.scale.set(0.2 * Math.max(0.001, u), 1, 0.15 * Math.max(0.001, u))
    }
  })
  return (
    <group ref={ref}>
      <B p={[0, H / 2, 0]} s={[S, H, S]} m={M.kraft} />
      {/* flaps hinged on the top edges: +x, -x, +z, -z */}
      {[
        [S / 2, 0, 1],
        [-S / 2, 0, -1],
        [0, S / 2, 1],
        [0, -S / 2, -1],
      ].map(([hx, hz, sg], i) => (
        <group key={i} ref={(e) => void (flaps.current[i] = e)} position={[hx, H, hz]}>
          <B p={i < 2 ? [(-sg * S) / 4, 0.004, 0] : [0, 0.004, (-sg * S) / 4]} s={i < 2 ? [S / 2, 0.008, S] : [S, 0.008, S / 2]} m={M.kraft2} cast={false} />
        </group>
      ))}
      <mesh ref={tape} geometry={G.box} material={M.accent} position={[0, H + 0.012, 0]} scale={[S, 0.006, 0.07]} visible={false} />
      <mesh ref={label} geometry={G.box} material={labelMat} position={[0, H + 0.018, 0.07]} scale={[0.2, 0.004, 0.15]} rotation={[0, 0, 0]} visible={false} />
    </group>
  )
}

function Packing({ w }: { w: World }) {
  const head = useRef<THREE.Group>(null)
  const belt = useMemo(() => {
    const t = canvasTex(64, 32, (g) => {
      g.fillStyle = '#3a3f4c'
      g.fillRect(0, 0, 64, 32)
      g.strokeStyle = '#596071'
      g.lineWidth = 6
      g.beginPath()
      g.moveTo(16, 4)
      g.lineTo(32, 16)
      g.lineTo(16, 28)
      g.moveTo(44, 4)
      g.lineTo(60, 16)
      g.lineTo(44, 28)
      g.stroke()
    })
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(4, 1)
    return t
  }, [])
  const beltMat = useMemo(() => new THREE.MeshLambertMaterial({ map: belt }), [belt])
  useFrame(() => {
    const t = w.t
    if (head.current) {
      const down = span(t, 12.65, 12.98) * (1 - span(t, 13.12, 13.5))
      head.current.position.y = 1.52 - down * 0.4
    }
    const run = t > 13.4 && t < 14.3 ? 1 : 0.08
    belt.offset.x -= 0.016 * run * w.speed
  })
  const tx = TABLE.x
  const tz = TABLE.z
  return (
    <group>
      {/* table */}
      <B p={[tx, TABLE.top - 0.03, tz]} s={[1.24, 0.06, 0.82]} m={M.white} />
      {[-0.55, 0.55].flatMap((dx) => [-0.34, 0.34].map((dz) => <B key={`${dx}${dz}`} p={[tx + dx, (TABLE.top - 0.06) / 2, tz + dz]} s={[0.05, TABLE.top - 0.06, 0.05]} m={M.dark} />))}
      {/* tape roll + box stack */}
      <B p={[tx + 0.42, TABLE.top + 0.05, tz - 0.24]} s={[0.07, 0.1, 0.07]} m={M.accent} geo={G.cyl} r={[Math.PI / 2, 0, 0]} />
      <B p={[tx + 0.4, TABLE.top + 0.012, tz + 0.22]} s={[0.3, 0.02, 0.24]} m={M.kraft2} />
      <B p={[tx + 0.4, TABLE.top + 0.032, tz + 0.22]} s={[0.3, 0.02, 0.24]} m={M.kraft} />
      {/* stamp gantry over the parcel */}
      <B p={[PARCEL_ON_TABLE.x, 0.95, tz - 0.38]} s={[0.06, 1.9, 0.06]} m={M.dark} />
      <B p={[PARCEL_ON_TABLE.x, 1.86, tz - 0.12]} s={[0.08, 0.08, 0.6]} m={M.dark} />
      <group ref={head} position={[PARCEL_ON_TABLE.x, 1.52, tz + 0.07]}>
        <B p={[0, 0.2, 0]} s={[0.04, 0.34, 0.04]} m={M.grey} />
        <B p={[0, 0, 0]} s={[0.2, 0.1, 0.17]} m={M.accent} />
      </group>
      {/* conveyor to the truck */}
      <group position={[(CONVEYOR.x0 + CONVEYOR.x1) / 2, 0, CONVEYOR.z]}>
        <B p={[0, CONVEYOR.top - 0.05, 0]} s={[CONVEYOR.x1 - CONVEYOR.x0 + 0.1, 0.08, 0.42]} m={M.grey} />
        <mesh geometry={G.box} material={beltMat} position={[0, CONVEYOR.top - 0.005, 0]} scale={[CONVEYOR.x1 - CONVEYOR.x0, 0.01, 0.34]} receiveShadow />
        {[-0.5, 0.5].map((dx) => (
          <B key={dx} p={[dx, (CONVEYOR.top - 0.09) / 2, 0]} s={[0.06, CONVEYOR.top - 0.09, 0.36]} m={M.dark} />
        ))}
      </group>
    </group>
  )
}

/* ================================================================== ④ truck, dock, traffic */
function Dock() {
  return (
    <group>
      <B p={[5.1, 0.55, -4.55]} s={[2.2, 1.1, 0.7]} m={M.wall} />
      <B p={[5.1, 1.13, -4.55]} s={[2.3, 0.06, 0.8]} m={M.grey} />
      <B p={[5.0, 0.42, -4.19]} s={[0.9, 0.8, 0.02]} m={M.grey} cast={false} />
      {[0.15, 0.3, 0.45, 0.6].map((y) => (
        <B key={y} p={[5.0, y, -4.175]} s={[0.88, 0.015, 0.01]} m={M.wall} cast={false} />
      ))}
      {/* hazard stripes */}
      {Array.from({ length: 7 }, (_, i) => (
        <B key={i} p={[4.25 + i * 0.25, 0.04, -3.88]} s={[0.12, 0.006, 0.08]} r={[0, 0.6, 0]} m={i % 2 ? M.lane : M.hazard} cast={false} />
      ))}
    </group>
  )
}

function Truck({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group>(null)
  const pose = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0 }), [])
  const logo = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: canvasTex(256, 96, (g) => {
          g.fillStyle = '#ffffff'
          g.fillRect(0, 0, 256, 96)
          g.fillStyle = C.accent
          g.font = `800 52px ${FONT}`
          g.textBaseline = 'middle'
          g.fillText('速达', 20, 50)
          g.fillStyle = '#2b2e38'
          g.font = `700 30px ${FONT}`
          g.fillText('EXPRESS', 130, 52)
        }),
      }),
    [],
  )
  const spin = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const t = w.t
    truckPose(t, pose)
    g.position.set(pose.x, 0.03, pose.z)
    g.rotation.y = pose.yaw
    spin.current += Math.min(dt, 1 / 30) * w.speed * truckSpeed(t) * 8
    wheels.current?.children.forEach((c) => void (c.rotation.z = -spin.current))
  })
  return (
    <group ref={ref}>
      <B p={[0, 0.2, 0]} s={[1.28, 0.1, 0.46]} m={M.dark} />
      <group ref={wheels}>
        {[0.42, -0.42].flatMap((x) =>
          [0.25, -0.25].map((z) => (
            <group key={`${x}${z}`} position={[x, 0.12, z]}>
              <B p={[0, 0, 0]} s={[0.12, 0.08, 0.12]} r={[Math.PI / 2, 0, 0]} m={M.ink} geo={G.cyl} />
              <B p={[0.03, 0, 0]} s={[0.04, 0.085, 0.04]} r={[Math.PI / 2, 0, 0]} m={M.grey} geo={G.cyl} cast={false} />
            </group>
          )),
        )}
      </group>
      {/* cab */}
      <B p={[0.42, 0.48, 0]} s={[0.44, 0.46, 0.5]} m={M.white} geo={G.rbox} />
      <B p={[0.42, 0.37, 0]} s={[0.45, 0.07, 0.505]} m={M.accent} cast={false} />
      <B p={[0.645, 0.56, 0]} s={[0.01, 0.17, 0.4]} m={M.glass} cast={false} />
      <B p={[0.47, 0.57, 0.252]} s={[0.22, 0.14, 0.01]} m={M.glass} cast={false} />
      <B p={[0.47, 0.57, -0.252]} s={[0.22, 0.14, 0.01]} m={M.glass} cast={false} />
      <B p={[0.66, 0.3, 0.17]} s={[0.01, 0.05, 0.07]} m={M.lampY} cast={false} />
      <B p={[0.66, 0.3, -0.17]} s={[0.01, 0.05, 0.07]} m={M.lampY} cast={false} />
      {/* bed with rails */}
      <B p={[-0.24, 0.28, 0]} s={[0.84, 0.06, 0.5]} m={M.white} />
      <B p={[-0.24, 0.36, 0.235]} s={[0.84, 0.12, 0.03]} m={M.accent} />
      <B p={[-0.24, 0.36, -0.235]} s={[0.84, 0.12, 0.03]} m={M.accent} />
      <B p={[-0.645, 0.36, 0]} s={[0.03, 0.12, 0.5]} m={M.accent} />
      <mesh material={logo} position={[-0.24, 0.36, 0.252]} scale={[0.5, 0.11, 1]}>
        <primitive object={G.plane} attach="geometry" />
      </mesh>
      {/* other parcels already loaded */}
      <B p={[-0.02, 0.43, 0.11]} s={[0.24, 0.24, 0.2]} m={M.kraft} />
      <B p={[-0.04, 0.4, -0.12]} s={[0.22, 0.18, 0.2]} m={M.kraft2} />
      <B p={[-0.02, 0.6, 0.1]} s={[0.16, 0.12, 0.16]} m={M.kraft2} />
    </group>
  )
}

function TrafficLight({ w }: { w: World }) {
  useFrame(() => {
    const s = lightState(w.t)
    M.lampR.emissiveIntensity = s === 2 ? 1.6 : 0
    M.lampY.emissiveIntensity = s === 1 ? 1.6 : 0.0
    M.lampG.emissiveIntensity = s === 0 ? 1.5 : 0
  })
  const head = (
    <group>
      <B p={[0, 0, 0]} s={[0.14, 0.42, 0.14]} m={M.ink} geo={G.rbox} />
      {[
        [0.13, M.lampR],
        [0, M.lampY],
        [-0.13, M.lampG],
      ].map(([y, m]) => (
        <group key={y as number}>
          <B p={[0.075, y as number, 0]} s={[0.045, 0.045, 0.045]} m={m as THREE.Material} geo={G.ball} cast={false} />
          <B p={[0, y as number, -0.075]} s={[0.045, 0.045, 0.045]} m={m as THREE.Material} geo={G.ball} cast={false} />
        </group>
      ))}
    </group>
  )
  return (
    <group>
      <group position={[2.6, 0, 0.92]}>
        <B p={[0, 0.5, 0]} s={[0.03, 1.0, 0.03]} m={M.dark} geo={G.cyl} />
        <group position={[0, 1.08, 0]}>{head}</group>
      </group>
      <group position={[1.4, 0, 2.28]} rotation={[0, Math.PI, 0]}>
        <B p={[0, 0.5, 0]} s={[0.03, 1.0, 0.03]} m={M.dark} geo={G.cyl} />
        <group position={[0, 1.08, 0]}>{head}</group>
      </group>
    </group>
  )
}

/** cross traffic on the z = 1.6 street, timed to pass during the red light and never meet the truck */
const CARS = [
  { lane: 1.78, dir: 1, starts: [1.0, 7.5, 13.0, 24.5, 30.0], color: '#7fb2d6' },
  { lane: 1.42, dir: -1, starts: [3.0, 9.0, 15.8, 26.0, 32.0], color: '#f3c969' },
  { lane: 1.78, dir: 1, starts: [14.2], color: '#9fd0b6' },
]
function CrossCar({ w, car }: { w: World; car: (typeof CARS)[number] }) {
  const ref = useRef<THREE.Group>(null)
  const mat = useMemo(() => lam(car.color), [car.color])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = w.t
    let x = 99
    for (const s of car.starts) {
      const u = t - s
      if (u < 0) continue
      const xx = car.dir > 0 ? -6.8 + 1.8 * u : 6.8 - 1.8 * u
      if (xx > -6.6 && xx < 6.6) x = xx
    }
    g.visible = x < 50
    g.position.set(x, 0.03, car.lane)
    g.rotation.y = car.dir > 0 ? 0 : Math.PI
  })
  return (
    <group ref={ref} visible={false}>
      <B p={[0, 0.14, 0]} s={[0.46, 0.14, 0.26]} m={mat} geo={G.rbox} />
      <B p={[-0.04, 0.25, 0]} s={[0.24, 0.12, 0.23]} m={M.glass} geo={G.rbox} />
      {[0.14, -0.14].flatMap((x) => [0.12, -0.12].map((z) => <B key={`${x}${z}`} p={[x, 0.06, z]} s={[0.06, 0.04, 0.06]} r={[Math.PI / 2, 0, 0]} m={M.ink} geo={G.cyl} cast={false} />))}
    </group>
  )
}

/* ================================================================== city + residential */
function City() {
  return (
    <group>
      {/* in front of the truck's route: keep it low (shops, trees) so the truck never hides */}
      <Building x={3.05} z={0.8} w={0.9} d={0.66} h={0.55} wall="#fbefe2" cap="#e48a6a" floors={1} />
      <Building x={4.3} z={0.8} w={0.95} d={0.66} h={0.6} wall="#eef4f6" cap="#7ea7cf" floors={1} />
      <Tree p={[5.35, 0.55]} k={20} s={0.85} />
      <Tree p={[5.9, 0.95]} k={21} s={0.7} pine />
      <Tree p={[6.15, 0.25]} k={22} s={0.65} />
      {/* south of the cross street */}
      <Building x={3.1} z={2.55} w={0.95} d={0.8} h={0.7} wall="#f3f0e6" cap="#9cc49a" floors={2} />
      <Building x={4.45} z={2.5} w={1.0} d={0.85} h={2.0} wall="#e9eef5" cap="#7ea7cf" />
      <Building x={5.8} z={2.55} w={0.95} d={0.85} h={1.35} wall="#fbeee0" cap="#f0b85a" />
      <House x={3.3} z={4.35} roof="#6f97ad" />
      <House x={4.65} z={4.35} roof="#d9765c" wall="#f2f4ee" />
      <Tree p={[5.9, 4.3]} k={1} />
      <Tree p={[6.2, 3.7]} k={2} s={0.8} pine />
      {/* behind the route: the tall towers live here */}
      <Building x={0.95} z={0.3} w={0.9} d={1.0} h={2.2} wall="#f2ece2" cap="#e48a6a" />
      <Building x={-1.55} z={0.3} w={1.0} d={0.95} h={1.55} wall="#eef2ea" cap="#9cc49a" />
      <Tree p={[-0.4, -0.55]} k={3} />
      <Tree p={[-0.2, 0.55]} k={4} s={0.9} />
      <Tree p={[-0.6, 0.95]} k={5} s={0.75} pine />
      <Tree p={[0.3, -0.85]} k={6} s={0.8} />
      <Tree p={[-1.9, -0.95]} k={7} s={0.85} />
      <Tree p={[1.3, -1.05]} k={8} s={0.7} pine />
      <Tree p={[-2.65, -1.1]} k={9} s={0.75} />
      {/* block before the hub */}
      <Building x={-1.05} z={2.5} w={1.0} d={0.8} h={1.15} wall="#f4efe4" cap="#7ea7cf" />
      <Tree p={[0.6, 4.45]} k={10} s={0.85} />
      <Tree p={[-0.55, 4.5]} k={11} s={0.7} pine />
      <Tree p={[1.25, 4.3]} k={12} s={0.75} />
    </group>
  )
}

function Hub() {
  const sign = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: canvasTex(256, 96, (g) => {
          g.fillStyle = C.accent
          rr(g, 0, 0, 256, 96, 16)
          g.fill()
          g.fillStyle = '#fff'
          g.font = `700 50px ${FONT}`
          g.textBaseline = 'middle'
          g.textAlign = 'center'
          g.fillText('社区驿站', 128, 50)
        }),
      }),
    [],
  )
  return (
    <group position={[0.55, 0, 2.5]}>
      <B p={[0, 0.36, 0]} s={[1.05, 0.72, 0.8]} m={M.white} />
      <B p={[0, 0.76, 0]} s={[1.15, 0.08, 0.9]} m={M.accent} />
      <mesh material={sign} position={[0, 0.58, 0.405]} scale={[0.66, 0.24, 1]}>
        <primitive object={G.plane} attach="geometry" />
      </mesh>
      <B p={[-0.25, 0.22, 0.405]} s={[0.26, 0.4, 0.02]} m={M.glass} cast={false} />
      {/* parcel lockers */}
      <B p={[0.6, 0.3, 0.12]} s={[0.12, 0.6, 0.5]} m={M.grey} />
      <B p={[0.4, 0.06, 0.62]} s={[0.24, 0.12, 0.2]} m={M.kraft} />
    </group>
  )
}

function Residential() {
  return (
    <group>
      <House x={-5.75} z={-0.6} roof="#d9765c" />
      <House x={-4.3} z={-0.7} roof="#6f97ad" wall="#eef3f5" />
      <House x={-5.7} z={0.75} w={0.7} d={0.7} roof="#e1a050" />
      <House x={-3.1} z={-0.3} w={0.7} d={0.7} roof="#c25b57" wall="#f8efe0" />
      <House x={-5.75} z={2.65} roof="#6f97ad" />
      <House x={-4.3} z={2.7} w={0.75} d={0.75} roof="#e1a050" wall="#f3efe8" />
      <House x={-2.95} z={2.6} w={0.7} d={0.7} roof="#d9765c" />
      <Tree p={[-4.95, 0.8]} k={13} />
      <Tree p={[-3.4, 0.7]} k={14} s={0.8} pine />
      <Tree p={[-6.1, 3.9]} k={15} s={0.9} />
      <Tree p={[-6.1, 4.6]} k={16} s={0.7} pine />
      <Tree p={[-2.75, 3.75]} k={17} s={0.8} />
      <Tree p={[-3.0, 4.85]} k={18} s={0.6} />
      <Tree p={[-6.15, -1.25]} k={19} s={0.75} pine />
    </group>
  )
}

/** the customer's house, with the doorstep where the parcel ends up */
function Home({ w }: { w: World }) {
  const light = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (light.current) (light.current.material as THREE.MeshLambertMaterial).emissiveIntensity = w.t > 30.2 ? 1.2 : 0.1
  })
  const lampMat = useMemo(() => lam('#fff1c4', { emissive: new THREE.Color('#ffc24a'), emissiveIntensity: 0.1 }), [])
  return (
    <group>
      <group position={[-4.6, 0, 4.4]}>
        <B p={[0, 0.33, 0]} s={[1.05, 0.66, 0.95]} m={M.white} />
        <mesh material={M.accent} position={[0, 0.66 + 0.22, 0]} scale={[1.17, 0.44, 1.07]} castShadow>
          <primitive object={ROOF} attach="geometry" />
        </mesh>
        <B p={[0.527, 0.17, 0]} s={[0.02, 0.34, 0.2]} m={M.ink} cast={false} />
        <B p={[0.527, 0.47, 0.3]} s={[0.02, 0.15, 0.17]} m={M.glass} cast={false} />
        <B p={[0.527, 0.47, -0.3]} s={[0.02, 0.15, 0.17]} m={M.glass} cast={false} />
        <B p={[0.15, 0.47, 0.477]} s={[0.2, 0.15, 0.02]} m={M.glass} cast={false} />
        <mesh ref={light} geometry={G.ball} material={lampMat} position={[0.55, 0.42, 0.14]} scale={0.035} />
        {/* doormat + step */}
        <B p={[0.64, 0.025, 0]} s={[0.22, 0.05, 0.36]} m={M.grey} cast={false} />
        {/* mailbox */}
        <B p={[0.85, 0.2, 0.42]} s={[0.025, 0.4, 0.025]} m={M.dark} />
        <B p={[0.85, 0.42, 0.42]} s={[0.12, 0.08, 0.08]} m={M.blue} />
      </group>
      {/* little fence */}
      {Array.from({ length: 6 }, (_, i) => (
        <B key={i} p={[-5.1 + i * 0.18, 0.08, 3.78]} s={[0.04, 0.16, 0.04]} m={M.white} />
      ))}
      <B p={[-4.65, 0.12, 3.78]} s={[1.0, 0.03, 0.02]} m={M.white} />
    </group>
  )
}

/* ================================================================== ⑤ scooter + courier */
function Courier({ walking }: { walking: RefObject<number> }) {
  const legL = useRef<THREE.Mesh>(null)
  const legR = useRef<THREE.Mesh>(null)
  useFrame((st) => {
    const sw = walking.current ? Math.sin(st.clock.elapsedTime * 12) * 0.5 : 0
    if (legL.current) legL.current.rotation.z = sw
    if (legR.current) legR.current.rotation.z = -sw
  })
  return (
    <group>
      <mesh ref={legL} geometry={G.box} material={M.dark} position={[0, 0.11, 0.05]} scale={[0.07, 0.22, 0.07]} castShadow />
      <mesh ref={legR} geometry={G.box} material={M.dark} position={[0, 0.11, -0.05]} scale={[0.07, 0.22, 0.07]} castShadow />
      <mesh material={M.blue} position={[0, 0.34, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.12, 6, 12]} />
      </mesh>
      <B p={[0, 0.53, 0]} s={[0.09, 0.09, 0.09]} m={M.skin} geo={G.ball} />
      <mesh material={M.accent} position={[0, 0.56, 0]} castShadow>
        <sphereGeometry args={[0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  )
}

function Scooter({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const rider = useRef<THREE.Group>(null)
  const walker = useRef<THREE.Group>(null)
  const walking = useRef(0)
  const pose = useMemo<Pose>(() => ({ x: 0, z: 0, yaw: 0 }), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = w.t
    scooterPose(t, pose)
    g.position.set(pose.x, 0.03, pose.z)
    g.rotation.y = pose.yaw
    const onFoot = t >= 29.0
    if (rider.current) rider.current.visible = !onFoot
    if (walker.current) {
      walker.current.visible = onFoot
      if (onFoot) {
        courierWalk(t, v)
        walker.current.position.set(v.x, 0.03, v.z)
        const back = t > 30.9
        walker.current.rotation.y = back ? -Math.PI / 2 + 0.3 : Math.PI + 0.35
        walking.current = (t > 29.0 && t < 29.8) || (t > 30.9 && t < 31.7) ? 1 : 0
      }
    }
  })
  return (
    <>
      <group ref={ref}>
        {[0.25, -0.25].map((x) => (
          <B key={x} p={[x, 0.09, 0]} s={[0.09, 0.05, 0.09]} r={[Math.PI / 2, 0, 0]} m={M.ink} geo={G.cyl} />
        ))}
        <B p={[0, 0.2, 0]} s={[0.52, 0.07, 0.17]} m={M.white} geo={G.rbox} />
        <B p={[0.22, 0.32, 0]} s={[0.12, 0.26, 0.2]} m={M.accent} geo={G.rbox} />
        <B p={[0.26, 0.52, 0]} s={[0.04, 0.2, 0.04]} m={M.dark} r={[0, 0, -0.25]} />
        <B p={[0.29, 0.62, 0]} s={[0.04, 0.04, 0.32]} m={M.dark} />
        <B p={[-0.08, 0.32, 0]} s={[0.24, 0.06, 0.16]} m={M.dark} geo={G.rbox} />
        <B p={[-0.27, 0.44, 0]} s={[0.24, 0.03, 0.22]} m={M.dark} />
        <B p={[-0.27, 0.37, 0]} s={[0.03, 0.12, 0.03]} m={M.dark} />
        <group ref={rider} position={[-0.06, 0.18, 0]} rotation={[0, 0, 0]}>
          <Courier walking={{ current: 0 }} />
        </group>
      </group>
      <group ref={walker} visible={false}>
        <Courier walking={walking} />
      </group>
    </>
  )
}

/* ================================================================== the order pin */
function Pin({ w }: { w: World }) {
  const ref = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame((st) => {
    const g = ref.current
    if (!g) return
    const t = w.t
    if (t < 5.0) v.set(PHONE.x, 2.4, PHONE.z)
    else if (t < 10.55) {
      productPos(t, v)
      v.y += 0.62
    } else {
      parcelPos(t, v)
      v.y += 0.72
    }
    const e = st.clock.elapsedTime
    g.position.set(v.x, v.y + Math.sin(e * 3) * 0.05, v.z)
    g.rotation.y = e * 1.6
    if (ring.current) {
      const u = (e * 0.9) % 1
      ring.current.scale.setScalar(0.4 + u * 0.9)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.55
    }
  })
  return (
    <group ref={ref}>
      <B p={[0, 0.12, 0]} s={[0.1, 0.1, 0.1]} m={M.pin} geo={G.ball} cast={false} />
      <mesh material={M.pin} position={[0, 0.02, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.07, 0.14, 12]} />
      </mesh>
      <B p={[0, 0.125, 0]} s={[0.045, 0.045, 0.045]} m={M.white} geo={G.ball} cast={false} />
      <mesh ref={ring} material={M.pinRing} position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.2, 32]} />
      </mesh>
    </group>
  )
}

/* ================================================================== stations: click to jump */
const HIT: { p: [number, number, number]; s: [number, number, number] }[] = [
  { p: [PHONE.x, 1.0, PHONE.z], s: [2.2, 2.4, 2.2] },
  { p: [-0.9, 0.8, -3.7], s: [4.6, 1.6, 2.4] },
  { p: [TABLE.x + 0.2, 0.9, TABLE.z], s: [1.8, 1.9, 1.3] },
  { p: [5.0, 0.7, -2.8], s: [1.6, 1.4, 2.6] },
  { p: [0.3, 0.7, 2.9], s: [2.4, 1.4, 1.8] },
  { p: [-4.4, 0.9, 4.3], s: [1.9, 1.8, 1.6] },
]
function Hits({ w }: { w: World }) {
  return (
    <group>
      {HIT.map((h, i) => (
        <mesh
          key={i}
          geometry={G.box}
          material={M.hit}
          position={h.p}
          scale={h.s}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation()
            w.hover = i
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            w.hover = -1
            document.body.style.cursor = ''
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation()
            w.jump(i)
          }}
        />
      ))}
    </group>
  )
}

/* ================================================================== camera: iso rig with a spring follow */
const FIT_D = 21.5
const FIT_M = 16.2
const OVERVIEW = new THREE.Vector3(0.1, 0.3, 0.1)
function Rig({ w }: { w: World }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const st = useMemo(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), k: 1, vk: 0, f: 0, vf: 0, init: false }), [])
  const tgt = useMemo(() => new THREE.Vector3(), [])
  const acc = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const { width, height } = size
    const mobile = width < 760
    const follow = !POSTER && w.view === 'follow' && w.t < 31.8
    let kT = 1
    if (follow) {
      focusPos(w.t, tgt)
      kT = mobile ? 1.6 : 1.75
    } else {
      tgt.copy(OVERVIEW)
      if (POSTER) kT = 1.2
    }
    const fT = follow ? 1 : 0
    if (!st.init || POSTER) {
      st.p.copy(tgt)
      st.k = kT
      st.f = fT
      st.init = true
    } else {
      // critically-damped-ish spring (stiffness K, damping D)
      const K = 26
      const D = 2 * Math.sqrt(K) * 0.92
      acc.copy(tgt).sub(st.p).multiplyScalar(K).addScaledVector(st.v, -D)
      st.v.addScaledVector(acc, dt)
      st.p.addScaledVector(st.v, dt)
      const ak = K * (kT - st.k) - D * st.vk
      st.vk += ak * dt
      st.k += st.vk * dt
      const af = K * (fT - st.f) - D * st.vf
      st.vf += af * dt
      st.f += st.vf * dt
    }
    camera.zoom = (Math.min(width, height * 1.25) / (mobile ? FIT_M : FIT_D)) * st.k
    const d = 60
    camera.position.set(st.p.x + d, st.p.y + d, st.p.z + d)
    camera.lookAt(st.p)
    const ox = POSTER || mobile ? 0 : 0.2 + st.f * 0.02
    const oy = POSTER ? 0 : mobile ? 0.13 + st.f * 0.01 : -0.02
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ================================================================== DOM bubbles projected from 3D */
function BubbleProjector({ w, els }: { w: World; els: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const size = useThree((s) => s.size)
  useFrame(({ camera }) => {
    const cur = stationOf(w.t)
    for (let i = 0; i < STATIONS.length; i++) {
      const el = els.current[i]
      if (!el) continue
      bubbleAnchor(i, w.t, v).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      // following: only the current stop and the one before; overview: everything reached so far
      const near = w.view === 'overview' || w.t >= 31.8 || i === cur || i === cur - 1 || w.hover === i
      el.style.opacity = near ? (i === cur || w.hover === i || w.view === 'overview' ? '1' : w.t >= 31.8 ? '0.8' : '0.55') : '0'
    }
  })
  return null
}

/* ================================================================== driver + lights */
function Driver({ w, onTick }: { w: World; onTick: (station: number, reached: number) => void }) {
  const last = useRef('')
  useFrame((_, dt) => {
    if (!w.ready) return
    dt = Math.min(dt, 1 / 30)
    if (!POSTER) {
      w.t += dt * w.speed
      if (w.t >= T_END) w.t = 0
    }
    const s = stationOf(w.t)
    const r = reachedOf(w.t)
    const k = `${s}|${r}`
    if (k !== last.current) {
      last.current = k
      onTick(s, r)
    }
  })
  return null
}

function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fffaf0', 1.75)
    l.position.set(5, 8.3, 2.5)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera as THREE.OrthographicCamera
    c.left = c.bottom = -9.5
    c.right = c.top = 9.5
    c.near = 1
    c.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.42} color="#fbfaff" />
      <hemisphereLight args={['#ffffff', '#d6dcc8', 0.36]} />
      <primitive object={sun} />
    </>
  )
}

function useCompiled(ref: RefObject<THREE.Object3D | null>, onReady: () => void) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    let dead = false
    gl.compileAsync(g, camera, scene)
      .catch(() => {})
      .then(() => {
        if (dead) return
        setReady(true)
        onReady()
      })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready
}

function Scene({ w, onTick, els }: { w: World; onTick: (s: number, r: number) => void; els: RefObject<(HTMLDivElement | null)[]> }) {
  const root = useRef<THREE.Group>(null)
  const ready = useCompiled(root, () => void (w.ready = true))
  const intro = useRef(0)
  useFrame((_, dt) => {
    const g = root.current
    if (!g || !ready) return
    intro.current = POSTER ? 1 : Math.min(1, intro.current + Math.min(dt, 1 / 30) / 0.9)
    const e = backOut(intro.current, 1.2)
    g.position.y = (1 - e) * -1.6
  })
  return (
    <>
      <Rig w={w} />
      <Lights />
      <Driver w={w} onTick={onTick} />
      <group ref={root} visible={ready}>
        <Ground />
        <PhoneStation w={w} />
        <Warehouse />
        <Robot w={w} />
        <Packing w={w} />
        <Product w={w} />
        <Parcel w={w} />
        <Dock />
        <Truck w={w} />
        <TrafficLight w={w} />
        {CARS.map((c, i) => (
          <CrossCar key={i} w={w} car={c} />
        ))}
        <City />
        <Hub />
        <Residential />
        <Home w={w} />
        <Scooter w={w} />
        <Pin w={w} />
        <Hits w={w} />
      </group>
      {!POSTER && <BubbleProjector w={w} els={els} />}
    </>
  )
}

/* ================================================================== page */
export default function OrderJourney() {
  const [station, setStation] = useState(POSTER ? stationOf(POSTER_T) : 0)
  const [reached, setReached] = useState(POSTER ? reachedOf(POSTER_T) : 0)
  const [speed, setSpeed] = useState<1 | 2>(1)
  const [view, setView] = useState<View>(POSTER ? 'overview' : 'follow')
  const els = useRef<(HTMLDivElement | null)[]>([])
  const w = useMemo<World>(
    () => ({
      t: POSTER ? POSTER_T : 0,
      speed: 1,
      view: POSTER ? 'overview' : 'follow',
      ready: false,
      hover: -1,
      jump: () => {},
    }),
    [],
  )
  w.jump = (i: number) => {
    w.t = STATIONS[i].start
  }
  const restart = () => {
    w.t = 0
  }
  const onTick = (s: number, r: number) => {
    setStation(s)
    setReached(r)
  }
  const pickSpeed = (s: 1 | 2) => {
    w.speed = s
    setSpeed(s)
  }
  const pickView = (v: View) => {
    w.view = v
    setView(v)
  }

  const progress = reached <= 1 ? 0 : (reached - 1) / (STATIONS.length - 1)
  const cur = STATIONS[Math.max(0, reached - 1)]

  return (
    <div className="stage oj-root">
      <div aria-hidden className="oj-sun" />
      <Canvas orthographic flat shadows="percentage" dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <Scene w={w} onTick={onTick} els={els} />
      </Canvas>

      <div aria-hidden className="oj-veil" data-on={view === 'follow'} />
      <div className="oj-bubbles" aria-hidden>
        {STATIONS.map((s, i) => (
          <div key={s.key} ref={(e) => void (els.current[i] = e)} className="oj-anchor">
            <AnimatePresence>
              {reached > i && (
                <motion.button
                  className="oj-bubble"
                  data-done={i === STATIONS.length - 1}
                  tabIndex={-1}
                  onClick={() => w.jump(i)}
                  initial={{ opacity: 0, y: 10, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.9, transition: { duration: 0.18 } }}
                  transition={{ type: 'spring', stiffness: 520, damping: i === STATIONS.length - 1 ? 16 : 28 }}
                >
                  <i>{i === STATIONS.length - 1 ? '✓' : i + 1}</i>
                  <b>{s.zh}</b>
                  <span>{s.time}</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        ))}
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
            <i style={{ background: '#ff7a3d' }} /> Isometric · Order journey
          </p>
          <h1>
            一个订单
            <br />
            的等距旅程
          </h1>
          <p className="oj-desc">从手机上点下「提交订单」开始，跟着橙色定位钉走一遍：机器人拣货、打包贴单、卡车穿城等红灯、快递员骑车送到家门口。点场景里任意一站，或下面的进度，都能直接跳过去。</p>

          <ol className="oj-track" aria-label="物流进度">
            <motion.span className="oj-line" aria-hidden animate={{ scaleY: progress }} transition={{ type: 'spring', stiffness: 160, damping: 26 }} />
            {STATIONS.map((s, i) => {
              const state = i < reached ? (i === reached - 1 ? 'cur' : 'done') : i === station && i >= reached ? 'next' : 'todo'
              return (
                <li key={s.key} data-state={state}>
                  <button onClick={() => w.jump(i)}>
                    <i />
                    <b>{s.zh}</b>
                    <span className="oj-sub">{s.sub}</span>
                    <em>{i < reached ? s.time : '--:--'}</em>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="oj-mini" aria-hidden>
            <div className="oj-mini-bar">
              {STATIONS.map((s, i) => (
                <i key={s.key} data-on={i < reached} />
              ))}
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={cur.key + reached}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                transition={{ duration: 0.22 }}
              >
                <b>{reached ? cur.zh : '等待下单'}</b> {reached ? `· ${cur.time}` : ''}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="hero-actions">
            <button className="btn primary" onClick={restart}>
              重新下单
            </button>
            <button className="btn" onClick={() => pickView(view === 'follow' ? 'overview' : 'follow')}>
              {view === 'follow' ? '看全景' : '跟随包裹'}
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <span className="oj-dock-label">速度</span>
          <Seg
            items={[
              { value: 1 as const, label: '1×' },
              { value: 2 as const, label: '2×' },
            ]}
            value={speed}
            onChange={pickSpeed}
          />
          <span className="dock-sep" />
          <span className="oj-dock-label">视角</span>
          <Seg
            items={[
              { value: 'follow' as View, label: '跟随' },
              { value: 'overview' as View, label: '全览' },
            ]}
            value={view}
            onChange={pickView}
          />
        </div>
        <p className="hint">点击场景里的站点可直接跳转</p>
      </div>

      <style>{`
        .oj-root { --soft-bg: #eef3f8; background: linear-gradient(180deg, #f4f7fb 0%, #eaf0f6 60%, #dfe7f0 100%); }
        .oj-sun { position: absolute; right: 12%; top: 10%; width: min(40vw, 560px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(255,255,255,.4) 45%, transparent 70%); }
        .oj-root .hero-copy p.oj-desc { font-size: 15px; line-height: 1.75; }
        .oj-root .hero-copy h1 { font-size: clamp(36px, 4.2vw, 56px); }
        .oj-track { position: relative; list-style: none; margin: 22px 0 0; padding: 0; display: grid; gap: 2px; }
        .oj-track::before, .oj-line { content: ''; position: absolute; left: 6px; top: 15px; bottom: 15px; width: 2px; border-radius: 1px; background: color-mix(in srgb, var(--fg) 12%, transparent); }
        .oj-line { background: #ff7a3d; transform-origin: 50% 0; }
        .oj-track li button { position: relative; display: grid; grid-template-columns: 14px auto 1fr auto; align-items: center; gap: 12px; width: 100%;
          height: 30px; padding: 0 10px 0 0; border: 0; background: transparent; color: var(--fg-2); font: 14px/1 var(--sans); cursor: pointer; text-align: left;
          border-radius: 8px; transition: color .25s; }
        .oj-track li button:hover { color: var(--fg); }
        .oj-track i { width: 14px; height: 14px; border-radius: 50%; background: var(--paper, #fff); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--fg) 18%, transparent);
          transition: background .3s, box-shadow .3s; z-index: 1; }
        .oj-track li[data-state='done'] i { background: #ff7a3d; box-shadow: none; }
        .oj-track li[data-state='cur'] i { background: #ff7a3d; box-shadow: 0 0 0 4px rgba(255,122,61,.22); animation: oj-pulse 1.4s ease-out infinite; }
        .oj-track li[data-state='next'] i { box-shadow: inset 0 0 0 2px #ff7a3d; }
        .oj-track li[data-state='done'] b, .oj-track li[data-state='cur'] b { color: var(--fg); }
        .oj-track b { font-weight: 600; white-space: nowrap; }
        .oj-track .oj-sub { font-size: 12px; color: var(--fg-2); opacity: 0; transform: translateX(-4px); transition: opacity .3s, transform .3s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .oj-track li[data-state='cur'] .oj-sub { opacity: 1; transform: none; }
        .oj-track em { font: 12px/1 var(--mono); color: var(--fg-2); font-variant-numeric: tabular-nums; }
        .oj-track li[data-state='cur'] em { color: #e8642a; font-weight: 600; }
        @keyframes oj-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,122,61,.45); } 100% { box-shadow: 0 0 0 9px rgba(255,122,61,0); } }
        .oj-mini { display: none; }
        .oj-dock-label { padding: 0 2px 0 10px; font: 12px/1 var(--sans); color: var(--fg-2); }
        .oj-bubbles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .poster .oj-bubbles, .poster .oj-sun, .poster .oj-veil { display: none; }
        .oj-veil { position: absolute; inset: 0 auto 0 0; width: min(680px, 52vw); pointer-events: none; opacity: 0; transition: opacity .8s ease;
          background: linear-gradient(90deg, rgba(240,244,249,.96) 0%, rgba(240,244,249,.9) 62%, rgba(240,244,249,.5) 82%, rgba(240,244,249,0) 100%); }
        .oj-veil[data-on='true'] { opacity: 1; }
        .oj-anchor { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: opacity .35s; will-change: transform; }
        .oj-bubble { position: absolute; left: 0; bottom: 6px; translate: -50% 0; transform-origin: 50% 110%; pointer-events: auto; cursor: pointer;
          display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px 0 5px; border: 0; border-radius: 999px; white-space: nowrap;
          background: rgba(255,255,255,.94); color: #1d1f24; font: 500 13px/1 var(--sans);
          box-shadow: 0 10px 24px -10px rgba(30,40,60,.45), inset 0 0 0 1px rgba(20,30,50,.06); }
        .oj-bubble::after { content: ''; position: absolute; left: 50%; bottom: -5px; width: 10px; height: 10px; translate: -50% 0; rotate: 45deg;
          background: inherit; border-radius: 2px; }
        .oj-bubble i { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #ff7a3d; color: #fff;
          font: 600 11px/1 var(--mono); font-style: normal; }
        .oj-bubble span { font: 11px/1 var(--mono); color: #868b97; padding-left: 7px; border-left: 1px solid rgba(20,30,50,.1); }
        .oj-bubble[data-done='true'] { background: #1fa463; color: #fff; height: 36px; font-size: 14px; font-weight: 600; }
        .oj-bubble[data-done='true'] i { background: #fff; color: #1fa463; font-size: 13px; }
        .oj-bubble[data-done='true'] span { color: rgba(255,255,255,.8); border-color: rgba(255,255,255,.3); }
        @media (max-width: 760px) {
          .oj-root .hero-copy p.oj-desc, .oj-track { display: none; }
          .oj-root .hero-copy h1 { font-size: 34px; }
          .oj-mini { display: block; margin-top: 14px; }
          .oj-mini-bar { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
          .oj-mini-bar i { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--fg) 12%, transparent); transition: background .3s; }
          .oj-mini-bar i[data-on='true'] { background: #ff7a3d; }
          .oj-mini p { margin: 10px 0 0 !important; font-size: 14px !important; color: var(--fg-2); }
          .oj-mini b { color: var(--fg); }
          .oj-root .hero-actions { margin-top: 16px; }
          .oj-dock-label { display: none; }
          .oj-bubble { height: 28px; font-size: 12px; }
          .oj-bubble span { display: none; }
          .oj-sun { right: -10%; top: 6%; width: 90vw; }
          .oj-veil { inset: auto 0 0 0; width: auto; height: 46%;
            background: linear-gradient(0deg, rgba(234,240,246,.97) 0%, rgba(234,240,246,.9) 55%, rgba(234,240,246,0) 100%); }
        }
      `}</style>
    </div>
  )
}

