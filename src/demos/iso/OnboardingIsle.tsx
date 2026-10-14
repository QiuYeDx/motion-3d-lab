import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AnimatePresence, animate, motion, motionValue, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ content */
const STEPS = [
  { title: '创建账号', sub: '注册并验证邮箱', reward: '小屋' },
  { title: '填写资料', sub: '头像、昵称和职位', reward: '风车' },
  { title: '邀请成员', sub: '把同事拉进工作区', reward: '街坊' },
  { title: '连接数据源', sub: '接入数据库或表格', reward: '水塔' },
  { title: '发布第一个项目', sub: '从模板一键发布', reward: '发射台' },
  { title: '开启通知', sub: '重要变化第一时间知道', reward: '钟楼' },
]
const NS = STEPS.length
const START = [true, false, false, false, false, false]
const POSTER_DONE = [true, true, true, false, false, false]
const BUILD_S = 2.4 // seconds for one unlock sequence

/* layout: a 3×3 grid on the island, the path snakes P0→P5 then through two garden cells to the lighthouse */
const CELL = 2.45
const PLOTS: [number, number][] = [
  [CELL, CELL],
  [0, CELL],
  [-CELL, CELL],
  [-CELL, 0],
  [0, 0],
  [CELL, 0],
]
const POND_CELL: [number, number] = [CELL, -CELL]
const GARDEN_CELL: [number, number] = [0, -CELL]
const LH: [number, number] = [-CELL, -CELL]
const MS = 1.28 // model scale
const TOPS = [1.2, 1.55, 1.15, 1.55, 1.5, 1.95].map((h) => h * MS) // building heights, for the lock / tooltip anchor
const PAD = 1.8

/* ------------------------------------------------------------------ math */
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const seg = (u: number, a: number, b: number) => clamp01((u - a) / (b - a))
const smooth = (v: number) => v * v * (3 - 2 * v)
const springIn = (t: number) => (t <= 0 ? 0 : t >= 1.6 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(13 * t))
const backOut = (p: number, s = 1.7) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
const easeOut = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p)

/* ------------------------------------------------------------------ palette */
const C = {
  grass: '#a8d98f',
  grass2: '#b9e2a0',
  plot: '#cbe9b0',
  locked: '#f0e7d4',
  soil: '#ecd3aa',
  cream: '#fbf5e8',
  cream2: '#f2e4cb',
  coral: '#ee6f5b',
  coral2: '#d95d57',
  teal: '#2bb39a',
  tealDk: '#1d8f7c',
  sky: '#6fb6dc',
  gold: '#f5b942',
  slate: '#4b5765',
  wood: '#d49556',
  win: '#5d7290',
  door: '#7a5145',
  leaf: '#78c08a',
  leaf2: '#9bd38a',
  pine: '#4ea47d',
  trunk: '#a8755a',
  water: '#7fcfe6',
  stone: '#ece4d4',
  lit: '#ffd45c',
}
const ROCK = ['#e8c398', '#dba584', '#c58a8a', '#a07c9e', '#7d6c9e']
const COL = {
  locked: new THREE.Color(C.locked),
  plot: new THREE.Color(C.plot),
  teal: new THREE.Color(C.teal),
  lineLocked: new THREE.Color('#b3a993'),
  stone: new THREE.Color(C.stone),
  stoneLit: new THREE.Color('#58d2b8'),
}

/* ------------------------------------------------------------------ shared GPU resources */
function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
/** rounded slab whose top face sits at y = 0 */
function slab(w: number, d: number, r: number, h: number, bevel = 0.07) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.02, r - bevel)), {
    depth: Math.max(0.01, h - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  })
  g.rotateX(Math.PI / 2)
  g.translate(0, -bevel, 0)
  return g
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 20),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  ball: new THREE.SphereGeometry(0.5, 16, 12),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  puff: new THREE.IcosahedronGeometry(0.5, 1),
  oct: new THREE.OctahedronGeometry(0.5, 0),
  plane: new THREE.PlaneGeometry(1, 1),
  ring: new THREE.RingGeometry(0.42, 0.5, 48),
  prism: (() => {
    const s = new THREE.Shape()
    s.moveTo(-0.5, 0)
    s.lineTo(0.5, 0)
    s.lineTo(0, 1)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
    g.translate(0, 0, -0.5)
    g.rotateY(Math.PI / 2) // ridge along x, slopes face ±z
    return g
  })(),
  pennant: (() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.42, -0.11)
    s.lineTo(0, -0.24)
    s.closePath()
    return new THREE.ShapeGeometry(s)
  })(),
  shackle: new THREE.TorusGeometry(0.1, 0.032, 8, 20, Math.PI),
  stone: new THREE.CylinderGeometry(0.13, 0.15, 0.05, 10),
  confetti: new THREE.BoxGeometry(0.1, 0.022, 0.15),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const M = {
  grass: lam(C.grass),
  soil: lam(C.soil),
  cream: lam(C.cream),
  cream2: lam(C.cream2),
  coral: lam(C.coral, { flatShading: true }),
  coral2: lam(C.coral2, { flatShading: true }),
  teal: lam(C.teal, { flatShading: true }),
  tealDk: lam(C.tealDk),
  sky: lam(C.sky, { flatShading: true }),
  gold: lam(C.gold, { flatShading: true }),
  slate: lam(C.slate),
  wood: lam(C.wood),
  plank: lam('#efc685'),
  win: lam(C.win),
  door: lam(C.door),
  leaf: lam(C.leaf, { flatShading: true }),
  leaf2: lam(C.leaf2, { flatShading: true }),
  pine: lam(C.pine, { flatShading: true }),
  trunk: lam(C.trunk),
  water: lam(C.water),
  stone: lam(C.stone),
  white: lam('#ffffff'),
  cloud: lam('#ffffff', { emissive: new THREE.Color('#eaf6f3'), emissiveIntensity: 0.35, flatShading: true }),
  glass: lam('#bcd4e2', { emissive: new THREE.Color(C.lit), emissiveIntensity: 0 }),
  lamp: lam('#fff6da', { emissive: new THREE.Color(C.lit), emissiveIntensity: 0 }),
  lockBody: lam('#5a6676'),
  lockMetal: lam('#cfd6de'),
  rock: ROCK.map((c) => lam(c)),
  flowers: ['#f29bb0', '#ffd36b', '#ffffff', '#c9a3f0'].map((c) => lam(c)),
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
const outline = (dashed: boolean) =>
  canvasTex(256, 256, (g) => {
    g.strokeStyle = '#fff'
    g.lineWidth = 9
    g.lineCap = 'round'
    if (dashed) g.setLineDash([18, 16])
    g.beginPath()
    g.roundRect(14, 14, 228, 228, 34)
    g.stroke()
  })
const TEX = {
  dash: outline(true),
  solid: outline(false),
  glow: canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.4, 'rgba(255,255,255,.5)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
  }),
  crack: canvasTex(256, 256, (g) => {
    g.strokeStyle = '#fff'
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (let k = 0; k < 9; k++) {
      let a = (k / 9) * Math.PI * 2 + rnd(k) * 0.4
      let x = 128
      let y = 128
      let len = 16
      g.lineWidth = 6
      g.beginPath()
      g.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        a += (rnd(k * 13 + s) - 0.5) * 0.9
        x += Math.cos(a) * len
        y += Math.sin(a) * len
        g.lineTo(x, y)
        len *= 1.05
      }
      g.stroke()
      // a side branch
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40)
      g.lineTo(128 + Math.cos(a + 0.5) * 70, 128 + Math.sin(a + 0.5) * 70)
      g.stroke()
    }
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(128, 128, 10, 0, Math.PI * 2)
    g.fill()
  }),
}
const ghostMat = () => new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#d6f5ee'), emissiveIntensity: 0.6, transparent: true, opacity: 0.5, depthWrite: false })

/* ------------------------------------------------------------------ context */
type Ctx = {
  us: MotionValue<number>[]
  outs: MotionValue<number>[]
  cel: MotionValue<number>
  hover: number
  next: number
  setHover: (i: number) => void
  toggle: (i: number) => void
}
const IsleCtx = createContext<Ctx>(null!)

/* ------------------------------------------------------------------ pieces */
type V3 = [number, number, number]
function Part({ p, s, m, rot, cast = true }: { p: V3; s: V3; m: THREE.Material; rot?: V3; cast?: boolean }) {
  return <mesh geometry={G.box} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}
function Mesh({ g, m, p, s, rot, cast = true }: { g: THREE.BufferGeometry; m: THREE.Material; p: V3; s: V3 | number; rot?: V3; cast?: boolean }) {
  return <mesh geometry={g} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}

function Tree({ p, s = 1, pine = false, alt = false }: { p: V3; s?: number; pine?: boolean; alt?: boolean }) {
  return (
    <group position={p} scale={s}>
      <Mesh g={G.cyl8} m={M.trunk} p={[0, 0.13, 0]} s={[0.09, 0.26, 0.09]} />
      {pine ? (
        <>
          <Mesh g={G.cone} m={M.pine} p={[0, 0.45, 0]} s={[0.56, 0.5, 0.56]} />
          <Mesh g={G.cone} m={M.pine} p={[0, 0.7, 0]} s={[0.4, 0.4, 0.4]} />
        </>
      ) : (
        <Mesh g={G.ico} m={alt ? M.leaf2 : M.leaf} p={[0, 0.48, 0]} s={[0.56, 0.6, 0.56]} />
      )}
    </group>
  )
}

/* buildings take a material map so the same model renders as the translucent "locked" ghost */
type Pal = Record<'wall' | 'wall2' | 'roof' | 'roof2' | 'accent' | 'dark' | 'win' | 'door' | 'wood' | 'metal' | 'leaf' | 'gold' | 'white', THREE.Material>
const REAL: Pal = {
  wall: M.cream,
  wall2: M.cream2,
  roof: M.coral,
  roof2: M.teal,
  accent: M.sky,
  dark: M.slate,
  win: M.win,
  door: M.door,
  wood: M.wood,
  metal: M.lockMetal,
  leaf: M.leaf,
  gold: M.gold,
  white: M.white,
}
const ghostPal = (m: THREE.Material): Pal => ({
  wall: m,
  wall2: m,
  roof: m,
  roof2: m,
  accent: m,
  dark: m,
  win: m,
  door: m,
  wood: m,
  metal: m,
  leaf: m,
  gold: m,
  white: m,
})

function Home({ p }: { p: Pal }) {
  return (
    <group>
      <Part p={[0, 0.3, 0]} s={[0.95, 0.6, 0.72]} m={p.wall} />
      <Mesh g={G.prism} m={p.roof} p={[0, 0.6, 0]} s={[1.08, 0.46, 0.9]} />
      <Part p={[0.26, 0.86, -0.12]} s={[0.12, 0.3, 0.12]} m={p.wall2} />
      <Part p={[-0.2, 0.17, 0.365]} s={[0.18, 0.34, 0.02]} m={p.door} cast={false} />
      <Part p={[0.2, 0.36, 0.365]} s={[0.2, 0.16, 0.02]} m={p.win} cast={false} />
      <Part p={[0.48, 0.36, 0]} s={[0.02, 0.16, 0.22]} m={p.win} cast={false} />
      {/* little porch step + mailbox */}
      <Part p={[-0.2, 0.025, 0.44]} s={[0.32, 0.05, 0.14]} m={p.wall2} />
      <Mesh g={G.cyl8} m={p.dark} p={[0.55, 0.16, 0.5]} s={[0.035, 0.32, 0.035]} />
      <Part p={[0.55, 0.34, 0.5]} s={[0.12, 0.1, 0.16]} m={p.accent} />
    </group>
  )
}

function Windmill({ p }: { p: Pal }) {
  const blades = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (blades.current) blades.current.rotation.z -= Math.min(dt, 1 / 30) * 1.4
  })
  return (
    <group>
      <mesh geometry={useMemo(() => new THREE.CylinderGeometry(0.3, 0.42, 1.05, 16), [])} material={p.wall} position={[0, 0.525, 0]} castShadow receiveShadow />
      <Mesh g={G.cone} m={p.roof2} p={[0, 1.22, 0]} s={[0.72, 0.36, 0.72]} />
      <Part p={[0.0, 0.2, 0.39]} s={[0.2, 0.34, 0.06]} m={p.door} rot={[0, 0, 0]} cast={false} />
      <Part p={[0.31, 0.62, 0.0]} s={[0.06, 0.16, 0.14]} m={p.win} cast={false} />
      <group position={[0, 0.98, 0]} rotation={[0, Math.PI / 4, 0]}>
        <Mesh g={G.cyl8} m={p.dark} p={[0, 0, 0.32]} s={[0.1, 0.16, 0.1]} rot={[Math.PI / 2, 0, 0]} />
        <group ref={blades} position={[0, 0, 0.42]}>
          {[0, 1, 2, 3].map((k) => (
            <group key={k} rotation={[0, 0, (k * Math.PI) / 2]}>
              <Part p={[0, 0.36, 0]} s={[0.04, 0.68, 0.03]} m={p.dark} />
              <Part p={[0.07, 0.42, 0]} s={[0.12, 0.5, 0.015]} m={p.white} />
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

function MiniHouse({ p, x, z, h, roof, s = 1 }: { p: Pal; x: number; z: number; h: number; roof: THREE.Material; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <Part p={[0, h / 2, 0]} s={[0.46, h, 0.46]} m={p.wall} />
      <mesh geometry={G.cone4} material={roof} position={[0, h + 0.17, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.72, 0.34, 0.72]} castShadow />
      <Part p={[0.06, 0.11, 0.235]} s={[0.12, 0.22, 0.02]} m={p.door} cast={false} />
      <Part p={[0.235, h * 0.62, 0]} s={[0.02, 0.11, 0.12]} m={p.win} cast={false} />
    </group>
  )
}
function Team({ p }: { p: Pal }) {
  const ghost = p.wall === p.roof
  return (
    <group>
      <MiniHouse p={p} x={-0.36} z={-0.32} h={0.62} roof={ghost ? p.roof : M.sky} />
      <MiniHouse p={p} x={0.36} z={-0.22} h={0.44} roof={ghost ? p.roof : M.gold} />
      <MiniHouse p={p} x={-0.26} z={0.38} h={0.4} roof={ghost ? p.roof : M.coral} s={0.92} />
      <group position={[0.34, 0, 0.38]}>
        <Mesh g={G.cyl8} m={ghost ? p.wood : M.trunk} p={[0, 0.1, 0]} s={[0.06, 0.2, 0.06]} />
        <Mesh g={G.ico} m={p.leaf} p={[0, 0.32, 0]} s={[0.36, 0.4, 0.36]} />
      </group>
    </group>
  )
}

function WaterTower({ p }: { p: Pal }) {
  const legs: [number, number][] = [
    [0.27, 0.27],
    [-0.27, 0.27],
    [0.27, -0.27],
    [-0.27, -0.27],
  ]
  return (
    <group>
      {legs.map(([x, z]) => (
        <Mesh key={`${x}${z}`} g={G.cyl8} m={p.dark} p={[x, 0.42, z]} s={[0.06, 0.84, 0.06]} />
      ))}
      <Part p={[0, 0.42, 0.27]} s={[0.54, 0.035, 0.035]} m={p.dark} />
      <Part p={[0.27, 0.42, 0]} s={[0.035, 0.035, 0.54]} m={p.dark} />
      <Part p={[0, 0.42, -0.27]} s={[0.54, 0.035, 0.035]} m={p.dark} />
      <Part p={[-0.27, 0.42, 0]} s={[0.035, 0.035, 0.54]} m={p.dark} />
      <Mesh g={G.cyl} m={p.accent} p={[0, 1.1, 0]} s={[0.9, 0.52, 0.9]} />
      <Mesh g={G.cyl} m={p.roof2} p={[0, 1.04, 0]} s={[0.92, 0.1, 0.92]} />
      <Mesh g={G.cone} m={p.wall} p={[0, 1.48, 0]} s={[0.98, 0.26, 0.98]} />
      <Mesh g={G.ball} m={p.roof2} p={[0, 1.64, 0]} s={0.09} />
      {/* pipe down into the ground: "data" flowing into the island */}
      <Mesh g={G.cyl8} m={p.roof2} p={[0.12, 0.45, 0.12]} s={[0.07, 0.9, 0.07]} />
      <Mesh g={G.cyl} m={p.wall2} p={[0.12, 0.03, 0.12]} s={[0.24, 0.06, 0.24]} />
    </group>
  )
}

function Rocket({ p }: { p: Pal }) {
  const body = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (body.current) body.current.position.y = Math.sin(s.clock.elapsedTime * 2.2) * 0.012
  })
  return (
    <group>
      <Mesh g={G.cyl} m={p.wall2} p={[0, 0.05, 0]} s={[1.15, 0.1, 1.15]} />
      <Mesh g={G.cyl} m={p.dark} p={[0, 0.11, 0]} s={[0.5, 0.03, 0.5]} />
      {/* gantry */}
      <group position={[-0.42, 0, -0.38]}>
        <Part p={[0, 0.62, 0]} s={[0.18, 1.12, 0.18]} m={p.wood} />
        {[0.3, 0.62, 0.94].map((y) => (
          <Part key={y} p={[0.17, y, 0.13]} s={[0.24, 0.04, 0.05]} m={p.dark} />
        ))}
      </group>
      <group ref={body}>
        <Mesh g={G.cyl} m={p.white} p={[0, 0.58, 0]} s={[0.34, 0.8, 0.34]} />
        <Mesh g={G.cone} m={p.roof} p={[0, 1.17, 0]} s={[0.34, 0.38, 0.34]} />
        <Mesh g={G.cyl} m={p.roof} p={[0, 0.2, 0]} s={[0.36, 0.06, 0.36]} />
        {[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2 + Math.PI / 4
          return <Part key={k} p={[Math.sin(a) * 0.2, 0.3, Math.cos(a) * 0.2]} s={[0.03, 0.28, 0.18]} rot={[0, a, 0]} m={p.roof} />
        })}
        <group position={[0, 0.72, 0]} rotation={[0, Math.PI / 4, 0]}>
          <Mesh g={G.cyl} m={p.accent} p={[0, 0, 0.16]} s={[0.15, 0.03, 0.15]} rot={[Math.PI / 2, 0, 0]} cast={false} />
        </group>
      </group>
    </group>
  )
}

function BellTower({ p }: { p: Pal }) {
  const bell = useRef<THREE.Group>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime % 4.5
    if (bell.current) bell.current.rotation.x = t < 2 ? Math.sin(t * 9) * 0.45 * Math.exp(-t * 1.6) : 0
  })
  return (
    <group>
      <Part p={[0, 0.55, 0]} s={[0.62, 1.1, 0.62]} m={p.wall} />
      <Part p={[0, 1.12, 0]} s={[0.7, 0.06, 0.7]} m={p.wall2} />
      <Part p={[0, 0.2, 0.315]} s={[0.2, 0.36, 0.02]} m={p.door} cast={false} />
      <Part p={[0.315, 0.75, 0]} s={[0.02, 0.24, 0.14]} m={p.win} cast={false} />
      <Part p={[0, 0.75, 0.315]} s={[0.14, 0.24, 0.02]} m={p.win} cast={false} />
      {[
        [0.27, 0.27],
        [-0.27, 0.27],
        [0.27, -0.27],
        [-0.27, -0.27],
      ].map(([x, z]) => (
        <Part key={`${x}${z}`} p={[x, 1.36, z]} s={[0.07, 0.42, 0.07]} m={p.wall} />
      ))}
      <group ref={bell} position={[0, 1.54, 0]}>
        <Mesh g={G.cyl8} m={p.dark} p={[0, -0.03, 0]} s={[0.03, 0.06, 0.03]} />
        <mesh geometry={useMemo(() => new THREE.CylinderGeometry(0.08, 0.17, 0.22, 16), [])} material={p.gold} position={[0, -0.16, 0]} castShadow />
        <Mesh g={G.ball} m={p.dark} p={[0, -0.28, 0]} s={0.06} />
      </group>
      <Part p={[0, 1.6, 0]} s={[0.72, 0.06, 0.72]} m={p.wall2} />
      <mesh geometry={G.cone4} material={p.roof} position={[0, 1.83, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.98, 0.42, 0.98]} castShadow />
    </group>
  )
}

const MODELS = [Home, Windmill, Team, WaterTower, Rocket, BellTower]

/* ------------------------------------------------------------------ plot: lock → crack → scaffold → pop → confetti → flag */
const CONF_N = 22
const CONF_COLORS = ['#2bb39a', '#ffd166', '#ee6f5b', '#ffffff', '#6fb6dc', '#f29bb0'].map((c) => new THREE.Color(c))
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v = new THREE.Vector3()
const _s = new THREE.Vector3()

function Plot({ i }: { i: number }) {
  const { us, outs, hover, next, setHover, toggle } = useContext(IsleCtx)
  const [x, z] = PLOTS[i]
  const Model = MODELS[i]
  const root = useRef<THREE.Group>(null)
  const pad = useRef<THREE.Group>(null)
  const bld = useRef<THREE.Group>(null)
  const ghost = useRef<THREE.Group>(null)
  const lock = useRef<THREE.Group>(null)
  const shackle = useRef<THREE.Mesh>(null)
  const crack = useRef<THREE.Mesh>(null)
  const scaf = useRef<THREE.Group>(null)
  const poles = useRef<(THREE.Object3D | null)[]>([])
  const bars = useRef<THREE.Group>(null)
  const flag = useRef<THREE.Group>(null)
  const pennant = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const conf = useRef<THREE.InstancedMesh>(null)
  const stars = useRef<(THREE.Mesh | null)[]>([])
  const lift = useSpring(0, { stiffness: 380, damping: 22 })
  const hovered = hover === i
  const isNext = next === i

  const mats = useMemo(
    () => ({
      pad: lam(C.locked, { emissive: new THREE.Color(C.teal), emissiveIntensity: 0 }),
      line: new THREE.MeshBasicMaterial({ map: TEX.dash, color: COL.lineLocked, transparent: true, depthWrite: false }),
      crack: new THREE.MeshBasicMaterial({ map: TEX.crack, color: '#14c9a5', transparent: true, opacity: 0, depthWrite: false }),
      glow: new THREE.MeshBasicMaterial({ map: TEX.glow, color: '#6ff0d4', transparent: true, opacity: 0, depthWrite: false }),
      ring: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      ghost: ghostMat(),
      star: new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false }),
    }),
    [],
  )
  const ghostP = useMemo(() => ghostPal(mats.ghost), [mats])
  const conf0 = useMemo(
    () =>
      Array.from({ length: CONF_N }, (_, k) => {
        const a = (k / CONF_N) * Math.PI * 2 + rnd(i * 31 + k) * 0.5
        const sp = 0.9 + rnd(i * 17 + k) * 1.3
        return { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2.6 + rnd(i * 7 + k) * 1.8, spin: 6 + rnd(k * 3 + i) * 10, ax: rnd(k + i * 5) * 6 }
      }),
    [i],
  )
  const starPos = useMemo(
    () => Array.from({ length: 5 }, (_, k) => [Math.cos(k * 1.3 + i) * 0.75, 0.6 + rnd(k + i * 9) * (TOPS[i] - 0.1), Math.sin(k * 1.3 + i) * 0.75] as V3),
    [i],
  )

  useEffect(() => {
    lift.set(hovered ? 1 : 0)
  }, [hovered, lift])

  useEffect(() => {
    const im = conf.current
    if (!im) return
    for (let k = 0; k < CONF_N; k++) im.setColorAt(k, CONF_COLORS[k % CONF_COLORS.length])
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [])

  useFrame((state) => {
    const u = us[i].get()
    const o = outs[i].get()
    const t = state.clock.elapsedTime
    const h = lift.get()
    const outK = o <= 0 ? 1 : 1 - smooth(o)
    if (root.current) root.current.position.y = h * 0.14

    // pad & outline
    const grassK = smooth(seg(u, 0.3, 0.6)) * outK
    mats.pad.color.lerpColors(COL.locked, COL.plot, grassK)
    const ck = seg(u, 0.03, 0.2)
    const cf = 1 - seg(u, 0.5, 0.8)
    mats.pad.emissiveIntensity = h * 0.12 + smooth(ck) * cf * 0.35
    const built = u > 0.5
    mats.line.map = built || hovered ? TEX.solid : TEX.dash
    const pulse = isNext && u === 0 ? 0.5 + 0.5 * Math.sin(t * 4.2) : 0
    mats.line.color.lerpColors(COL.lineLocked, COL.teal, Math.max(h, pulse, built ? 1 : 0))
    mats.line.opacity = built ? h * 0.95 : 0.7 + 0.3 * Math.max(h, pulse)

    // cracks + glow, the ground shivers while it splits
    if (crack.current) {
      crack.current.scale.setScalar(PAD * (0.35 + 0.65 * easeOut(ck)))
      mats.crack.opacity = smooth(ck) * cf
      mats.glow.opacity = smooth(ck) * cf * 0.85
    }
    if (pad.current) {
      const shake = u > 0.03 && u < 0.32 ? (1 - seg(u, 0.03, 0.32)) * 0.022 : 0
      pad.current.position.x = Math.sin(t * 71) * shake
      pad.current.position.z = Math.cos(t * 63) * shake
    }

    // ghost + padlock
    const gk = 1 - smooth(seg(u, 0, 0.16))
    if (ghost.current) ghost.current.visible = gk > 0.01
    mats.ghost.opacity = gk * (0.5 + h * 0.25)
    if (lock.current) {
      const lk = seg(u, 0, 0.17)
      lock.current.visible = lk < 1
      const pop = seg(lk, 0.4, 1)
      const sc = lk < 0.4 ? 1 + Math.sin(lk * 55) * 0.08 * (1 - lk) : (1 + pop * 0.5) * (1 - smooth(pop))
      lock.current.scale.setScalar(Math.max(0.001, sc) * (1.3 + h * 0.15))
      lock.current.position.y = TOPS[i] + 0.42 + Math.sin(t * 2 + i) * 0.05 + pop * 0.5 + h * 0.12
      if (shackle.current) shackle.current.position.y = 0.15 + smooth(seg(lk, 0, 0.4)) * 0.1
    }

    // scaffold springs up, then sinks once the building is in
    if (scaf.current) {
      const sOut = smooth(seg(u, 0.58, 0.72))
      scaf.current.visible = u > 0.13 && sOut < 1 && o <= 0
      scaf.current.scale.y = Math.max(0.001, 1 - sOut)
      poles.current.forEach((pl, k) => {
        if (pl) pl.scale.y = Math.max(0.001, springIn(seg(u, 0.13 + k * 0.03, 0.13 + k * 0.03 + 0.24) * 1.6))
      })
      if (bars.current) {
        const b = springIn(seg(u, 0.27, 0.45) * 1.6)
        bars.current.scale.set(Math.max(0.001, b), 1, Math.max(0.001, b))
        bars.current.visible = b > 0.001
      }
    }

    // building pops with squash & stretch
    if (bld.current) {
      const b = seg(u, 0.44, 0.76)
      const e = springIn(b * 1.6)
      const sy = Math.max(0.001, e) * outK
      const sxz = Math.max(0.001, Math.min(1, b * 4) * (1 + (1 - e) * 0.32)) * outK
      bld.current.visible = b > 0 && outK > 0.002
      bld.current.scale.set(sxz, sy, sxz)
    }

    // burst ring + confetti + sparkles
    const fr = seg(u, 0.52, 0.76)
    if (ring.current) {
      ring.current.visible = fr > 0 && fr < 1 && o <= 0
      ring.current.scale.setScalar(0.8 + easeOut(fr) * 2.6)
      mats.ring.opacity = (1 - fr) * 0.95
    }
    const im = conf.current
    if (im) {
      const f = seg(u, 0.54, 1)
      const live = f > 0 && f < 1 && o <= 0
      im.visible = live
      if (live) {
        const tt = f * 1.5
        const fade = 1 - smooth(seg(f, 0.72, 1))
        for (let k = 0; k < CONF_N; k++) {
          const c = conf0[k]
          const y = Math.max(0.16, 0.95 + c.vy * tt - 3.4 * tt * tt)
          const drag = 1 - Math.exp(-2.2 * tt)
          _v.set(c.vx * 0.75 * drag, y, c.vz * 0.75 * drag)
          _e.set(c.ax + tt * c.spin, tt * c.spin * 0.7, c.ax)
          _q.setFromEuler(_e)
          _s.setScalar(fade)
          im.setMatrixAt(k, _m.compose(_v, _q, _s))
        }
        im.instanceMatrix.needsUpdate = true
      }
    }
    stars.current.forEach((st, k) => {
      if (!st) return
      const q = seg(u, 0.58 + k * 0.045, 0.82 + k * 0.045)
      const v = Math.sin(q * Math.PI) * outK
      st.visible = v > 0.01
      st.scale.set(v * 0.13, v * 0.22, v * 0.13)
      st.rotation.y = t * 3 + k
    })

    // little flag on the back corner
    if (flag.current) {
      const g = seg(u, 0.72, 0.9)
      flag.current.visible = g > 0 && outK > 0.002
      flag.current.scale.set(1, Math.max(0.001, backOut(g)) * outK, 1)
      if (pennant.current) {
        pennant.current.rotation.y = Math.PI / 4 + Math.sin(t * 5 + i) * 0.28
        pennant.current.scale.x = 0.85 + Math.sin(t * 7 + i * 2) * 0.12
      }
    }
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(i)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    setHover(-1)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    toggle(i)
  }

  return (
    <group position={[x, 0, z]}>
      <group ref={root}>
        <group ref={pad}>
          <RoundedBox args={[PAD, 0.12, PAD]} radius={0.05} smoothness={3} material={mats.pad} position={[0, 0.06, 0]} receiveShadow />
          <mesh ref={crack} geometry={G.plane} material={mats.crack} position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} />
          <mesh geometry={G.plane} material={mats.glow} position={[0, 0.128, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={2.6} renderOrder={3} />
        </group>
        <mesh geometry={G.plane} material={mats.line} position={[0, 0.13, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={PAD + 0.32} renderOrder={4} />
        <mesh ref={ring} geometry={G.ring} material={mats.ring} position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} visible={false} />

        <group position={[0, 0.12, 0]}>
          <group ref={ghost} scale={MS}>
            <Model p={ghostP} />
          </group>
          <group ref={bld} visible={false}>
            <group scale={MS}>
              <Model p={REAL} />
            </group>
          </group>

          {/* scaffold */}
          <group ref={scaf} visible={false}>
            {[
              [0.7, 0.7],
              [-0.7, 0.7],
              [0.7, -0.7],
              [-0.7, -0.7],
            ].map(([px, pz], k) => (
              <group key={k} position={[px, 0, pz]} ref={(el) => void (poles.current[k] = el)}>
                <Mesh g={G.cyl8} m={M.wood} p={[0, 0.8, 0]} s={[0.065, 1.6, 0.065]} />
              </group>
            ))}
            <group ref={bars}>
              {[0.55, 1.15].map((y) => (
                <group key={y}>
                  <Part p={[0, y, 0.7]} s={[1.48, 0.06, 0.06]} m={M.plank} />
                  <Part p={[0, y, -0.7]} s={[1.48, 0.06, 0.06]} m={M.plank} />
                  <Part p={[0.7, y, 0]} s={[0.06, 0.06, 1.48]} m={M.plank} />
                  <Part p={[-0.7, y, 0]} s={[0.06, 0.06, 1.48]} m={M.plank} />
                </group>
              ))}
              <Part p={[0.7, 0.85, 0]} s={[0.045, 0.045, 1.6]} rot={[0.72, 0, 0]} m={M.wood} />
              <Part p={[0, 0.85, 0.7]} s={[1.6, 0.045, 0.045]} rot={[0, 0, -0.72]} m={M.wood} />
            </group>
          </group>

          {/* padlock */}
          <group ref={lock} rotation={[0, Math.PI / 4, 0]}>
            <RoundedBox args={[0.36, 0.3, 0.16]} radius={0.06} smoothness={3} material={M.lockBody} castShadow />
            <mesh ref={shackle} geometry={G.shackle} material={M.lockMetal} position={[0, 0.15, 0]} />
            <Mesh g={G.cyl8} m={M.gold} p={[0, 0.01, 0.085]} s={[0.07, 0.02, 0.07]} rot={[Math.PI / 2, 0, 0]} cast={false} />
          </group>

          {/* confetti + sparkles */}
          <instancedMesh ref={conf} args={[G.confetti, undefined, CONF_N]} visible={false} frustumCulled={false}>
            <meshLambertMaterial />
          </instancedMesh>
          {starPos.map((sp, k) => (
            <mesh key={k} ref={(el) => void (stars.current[k] = el)} geometry={G.oct} material={mats.star} position={sp} visible={false} />
          ))}

          {/* flag */}
          <group ref={flag} position={[-0.76, 0, -0.76]} visible={false}>
            <Mesh g={G.cyl8} m={M.white} p={[0, 0.5, 0]} s={[0.035, 1.0, 0.035]} />
            <Mesh g={G.ball} m={M.gold} p={[0, 1.02, 0]} s={0.07} />
            <mesh ref={pennant} geometry={G.pennant} position={[0, 0.98, 0]} castShadow>
              <meshLambertMaterial color={C.teal} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>

        {/* generous hit box */}
        <mesh geometry={G.box} position={[0, 0.9, 0]} scale={[2.0, 1.8, 2.0]} visible={false} onPointerOver={over} onPointerOut={out} onClick={click} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ path stones */
type Stone = { x: number; z: number; seg: number; q: number }
function buildStones() {
  const pts: Stone[] = []
  const centres: [number, number][] = [...PLOTS, POND_CELL, GARDEN_CELL, LH]
  for (let s = 0; s < centres.length - 1; s++) {
    const [ax, az] = centres[s]
    const [bx, bz] = centres[s + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const dx = (bx - ax) / len
    const dz = (bz - az) / len
    const from = s < NS ? 1.05 : 0.1
    const to = s < NS - 1 ? len - 1.05 : s === centres.length - 2 ? len - 0.95 : len - 0.1
    const n = Math.max(2, Math.round((to - from) / 0.36) + 1)
    for (let k = 0; k < n; k++) {
      const d = from + ((to - from) * k) / (n - 1)
      pts.push({ x: ax + dx * d + (rnd(s * 9 + k) - 0.5) * 0.06, z: az + dz * d + (rnd(s * 5 + k) - 0.5) * 0.06, seg: s, q: k / Math.max(1, n - 1) })
    }
  }
  return pts
}
const STONES = buildStones()
// final run (P5 → pond → garden → lighthouse) lights up in one sweep during the celebration
const FINAL = STONES.filter((s) => s.seg >= NS - 1)

function Path() {
  const { us, outs, cel } = useContext(IsleCtx)
  const ref = useRef<THREE.InstancedMesh>(null)
  const col = useMemo(() => new THREE.Color(), [])
  useEffect(() => {
    const im = ref.current
    if (!im) return
    STONES.forEach((s, k) => {
      _e.set(0, rnd(k) * 3, 0)
      _q.setFromEuler(_e)
      im.setMatrixAt(k, _m.compose(_v.set(s.x, 0.025, s.z), _q, _s.set(1, 1, 1)))
      im.setColorAt(k, COL.stone)
    })
    im.instanceMatrix.needsUpdate = true
  }, [])
  useFrame(() => {
    const im = ref.current
    if (!im || !im.instanceColor) return
    const lvl = (i: number) => seg(us[i].get(), 0.72, 1) * (outs[i].get() > 0 ? 0 : 1)
    const c = cel.get()
    STONES.forEach((s, k) => {
      let lit: number
      if (s.seg < NS - 1) {
        const l = Math.min(lvl(s.seg), lvl(s.seg + 1))
        lit = clamp01(l * 3 - s.q * 1.2)
      } else {
        const fi = FINAL.indexOf(s) / FINAL.length
        lit = clamp01((c * 1.6 - fi) / 0.25)
      }
      col.lerpColors(COL.stone, COL.stoneLit, smooth(lit))
      im.setColorAt(k, col)
    })
    im.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[G.stone, undefined, STONES.length]} receiveShadow>
      <meshLambertMaterial />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ lighthouse + fireworks */
function Lighthouse({ progress }: { progress: number }) {
  const { cel } = useContext(IsleCtx)
  const beam = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Sprite>(null)
  const prog = useSpring(progress, { stiffness: 80, damping: 20 })
  useEffect(() => {
    prog.set(progress)
  }, [progress, prog])
  const mats = useMemo(
    () => ({
      beam: new THREE.MeshBasicMaterial({ color: '#fff3b8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      halo: new THREE.SpriteMaterial({ map: TEX.glow, color: '#ffe08a', transparent: true, opacity: 0, depthWrite: false }),
    }),
    [],
  )
  const beamGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(0.55, 3.4, 24, 1, true)
    g.translate(0, -1.7, 0)
    g.rotateZ(Math.PI / 2) // apex at origin, opening along +x
    return g
  }, [])
  useFrame((s, dt) => {
    const c = cel.get()
    const on = smooth(seg(c, 0.55, 1))
    const charge = prog.get()
    M.lamp.emissiveIntensity = charge * 0.25 + on * 2.4
    M.glass.emissiveIntensity = charge * 0.15 + on * 0.9
    mats.beam.opacity = on * 0.32
    mats.halo.opacity = on * 0.95
    if (beam.current) {
      beam.current.visible = on > 0.01
      beam.current.rotation.y += Math.min(dt, 1 / 30) * 1.3
    }
    if (halo.current) halo.current.scale.setScalar(1.3 + on * 0.5 + Math.sin(s.clock.elapsedTime * 3) * 0.08 * on)
  })
  const stripes = [
    [0.44, 0.4, C.cream],
    [0.4, 0.36, C.coral],
    [0.36, 0.32, C.cream],
    [0.32, 0.29, C.coral],
  ] as const
  const H = 0.5
  return (
    <group position={[LH[0], 0, LH[1]]}>
      {/* rocky knoll */}
      <Mesh g={G.cyl} m={M.rock[0]} p={[0, 0.17, 0]} s={[1.75, 0.34, 1.75]} />
      <Mesh g={G.cyl} m={M.grass} p={[0, 0.37, 0]} s={[1.55, 0.08, 1.55]} />
      <Mesh g={G.ico} m={M.rock[1]} p={[0.62, 0.32, 0.5]} s={[0.36, 0.28, 0.36]} />
      <Mesh g={G.ico} m={M.rock[2]} p={[-0.7, 0.3, 0.3]} s={[0.3, 0.24, 0.3]} />
      <group position={[0, 0.41, 0]}>
        {stripes.map(([r0, r1], k) => (
          <mesh key={k} position={[0, H * k + H / 2, 0]} castShadow receiveShadow material={k % 2 ? M.coral : M.cream}>
            <cylinderGeometry args={[r1, r0, H, 24]} />
          </mesh>
        ))}
        <Part p={[0, 0.2, 0.42]} s={[0.2, 0.36, 0.06]} m={M.door} cast={false} />
        <Part p={[0.37, 0.95, 0]} s={[0.04, 0.16, 0.1]} m={M.win} cast={false} />
        <Mesh g={G.cyl} m={M.slate} p={[0, 2.03, 0]} s={[0.84, 0.06, 0.84]} />
        <mesh position={[0, 2.18, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.slate}>
          <torusGeometry args={[0.4, 0.015, 6, 32]} />
        </mesh>
        <Mesh g={G.cyl} m={M.glass} p={[0, 2.26, 0]} s={[0.46, 0.4, 0.46]} cast={false} />
        <Mesh g={G.ball} m={M.lamp} p={[0, 2.26, 0]} s={0.2} cast={false} />
        <Mesh g={G.cone} m={M.coral} p={[0, 2.62, 0]} s={[0.66, 0.34, 0.66]} />
        <Mesh g={G.ball} m={M.gold} p={[0, 2.82, 0]} s={0.1} />
        <group ref={beam} position={[0, 2.26, 0]} visible={false}>
          <mesh geometry={beamGeo} material={mats.beam} renderOrder={6} />
          <mesh geometry={beamGeo} material={mats.beam} rotation={[0, Math.PI, 0]} renderOrder={6} />
        </group>
        <sprite ref={halo} material={mats.halo} position={[0, 2.26, 0]} renderOrder={7} />
      </group>
    </group>
  )
}

const FW_N = 6
const FW_P = 56
const FW_COLORS = ['#2bb39a', '#ff7a5c', '#ffc93c', '#f472b6', '#7c9cff', '#4fd1c5'].map((c) => new THREE.Color(c))
const FW_POS: V3[] = [
  [-2.4, 6.0, -2.4],
  [1.0, 5.2, -1.6],
  [-1.2, 5.6, 1.4],
  [2.6, 5.9, 0.6],
  [-3.6, 5.0, 0.2],
  [0.4, 6.4, -0.2],
]
const FW_AT = [0, 0.55, 1.15, 1.75, 2.4, 3.0]
const FW_CYCLE = 3.4
function Fireworks() {
  const { cel } = useContext(IsleCtx)
  const ref = useRef<THREE.InstancedMesh>(null)
  const clock = useRef(0)
  const dirs = useMemo(
    () =>
      Array.from({ length: FW_N * FW_P }, (_, k) => {
        const a = rnd(k * 1.7) * Math.PI * 2
        const y = rnd(k * 2.3 + 1) * 2 - 1
        const r = Math.sqrt(1 - y * y)
        const sp = 0.85 + rnd(k * 3.1) * 0.3
        return [Math.cos(a) * r * sp, y * sp, Math.sin(a) * r * sp] as V3
      }),
    [],
  )
  useEffect(() => {
    const im = ref.current
    if (!im) return
    for (let k = 0; k < FW_N * FW_P; k++) im.setColorAt(k, FW_COLORS[Math.floor(k / FW_P) % FW_COLORS.length])
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [])
  useFrame((_, dt) => {
    const im = ref.current
    if (!im) return
    const c = cel.get()
    if (c < 0.7) {
      clock.current = 0
      im.visible = false
      return
    }
    im.visible = true
    clock.current += Math.min(dt, 1 / 30)
    const T = clock.current % FW_CYCLE
    for (let b = 0; b < FW_N; b++) {
      let tau = T - FW_AT[b]
      if (tau < 0) tau += FW_CYCLE
      const [cx, cy, cz] = FW_POS[b]
      const rise = 0.5
      for (let p = 0; p < FW_P; p++) {
        const k = b * FW_P + p
        if (tau < rise) {
          // the shell climbing up: only one particle visible, the rest collapsed into it
          const q = tau / rise
          const y = 1.2 + (cy - 1.2) * easeOut(q)
          _v.set(cx, y - (p % 4) * 0.12, cz)
          _s.setScalar(p < 4 ? 0.12 * (1 - (p % 4) * 0.22) : 0.0001)
        } else {
          const e = tau - rise
          const life = 1.5
          if (e > life) {
            _s.setScalar(0.0001)
            _v.set(cx, cy, cz)
          } else {
            const d = dirs[k]
            const R = 2.1 * (1 - Math.exp(-4.2 * e))
            _v.set(cx + d[0] * R, cy + d[1] * R - 0.55 * e * e, cz + d[2] * R)
            const fade = 1 - e / life
            _s.setScalar(0.17 * fade * (0.75 + 0.25 * Math.sin(e * 30 + p)))
          }
        }
        im.setMatrixAt(k, _m.compose(_v, _q.identity(), _s))
      }
    }
    im.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[G.ball, undefined, FW_N * FW_P]} frustumCulled={false} visible={false}>
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ island body + decor */
function Island() {
  const geos = useMemo(
    () => ({
      top: slab(8.4, 8.4, 1.7, 0.32),
      soil: slab(8.25, 8.25, 1.65, 0.5),
      r1: slab(7.7, 7.6, 1.55, 1.0),
      r2: slab(6.5, 6.3, 1.4, 1.0),
      r3: slab(4.9, 4.8, 1.2, 1.0),
      r4: slab(3.1, 3.2, 0.9, 0.95),
    }),
    [],
  )
  return (
    <group>
      <mesh geometry={geos.top} material={M.grass} receiveShadow />
      <mesh geometry={geos.soil} material={M.soil} position={[0, -0.32, 0]} />
      <mesh geometry={geos.r1} material={M.rock[0]} position={[0.05, -0.82, 0.05]} />
      <mesh geometry={geos.r2} material={M.rock[1]} position={[-0.1, -1.82, 0.15]} />
      <mesh geometry={geos.r3} material={M.rock[2]} position={[0.2, -2.82, -0.05]} />
      <mesh geometry={geos.r4} material={M.rock[3]} position={[-0.05, -3.82, 0.2]} />
      <mesh geometry={G.cone} material={M.rock[4]} position={[0.05, -5.35, 0.15]} rotation={[Math.PI, 0, 0]} scale={[2.2, 1.6, 2.2]} />
      <mesh geometry={G.cone} material={M.rock[3]} position={[2.4, -3.4, 1.6]} rotation={[Math.PI, 0, 0]} scale={[1.0, 1.3, 1.0]} />
      <mesh geometry={G.cone} material={M.rock[3]} position={[-1.6, -3.3, 2.3]} rotation={[Math.PI, 0, 0]} scale={[0.9, 1.1, 0.9]} />

      {/* pond cell */}
      <group position={[POND_CELL[0], 0, POND_CELL[1]]}>
        <mesh geometry={useMemo(() => slab(1.25, 1.05, 0.5, 0.06, 0.02), [])} material={M.water} position={[0.38, 0.012, -0.42]} />
        <Mesh g={G.cyl} m={M.leaf2} p={[0.6, 0.03, -0.3]} s={[0.22, 0.02, 0.22]} cast={false} />
        <Mesh g={G.cyl} m={M.leaf2} p={[0.2, 0.03, -0.62]} s={[0.16, 0.02, 0.16]} cast={false} />
        <Mesh g={G.ball} m={M.flowers[0]} p={[0.6, 0.06, -0.3]} s={0.07} />
        <Tree p={[-0.6, 0, 0.6]} s={0.75} alt />
        <Mesh g={G.ico} m={M.leaf} p={[0.75, 0.1, 0.45]} s={[0.3, 0.22, 0.3]} />
      </group>
      {/* garden cell */}
      <group position={[GARDEN_CELL[0], 0, GARDEN_CELL[1]]}>
        <Tree p={[-0.55, 0, -0.6]} s={0.9} />
        <Tree p={[0.55, 0, -0.55]} s={0.8} pine />
        <Tree p={[0.6, 0, 0.6]} s={0.65} alt />
        {Array.from({ length: 9 }, (_, k) => (
          <Mesh key={k} g={G.ball} m={M.flowers[k % 4]} p={[-0.7 + (k % 3) * 0.16, 0.05, 0.42 + Math.floor(k / 3) * 0.14]} s={0.09} cast={false} />
        ))}
      </group>
      {/* border trees & bushes */}
      {(
        [
          [-3.6, 1.4, 0.85, 'pine'],
          [-3.55, 3.3, 0.7, ''],
          [-1.1, 3.65, 0.6, 'alt'],
          [3.65, -1.1, 0.75, 'pine'],
          [3.4, -3.55, 0.8, ''],
          [1.2, -3.7, 0.7, 'alt'],
          [-3.6, -1.2, 0.7, 'pine'],
          [-1.1, -3.6, 0.85, 'pine'],
          [3.65, 1.1, 0.6, 'alt'],
        ] as const
      ).map(([px, pz, s, k]) => (
        <Tree key={`${px}${pz}`} p={[px, 0, pz]} s={s} pine={k === 'pine'} alt={k === 'alt'} />
      ))}
      {(
        [
          [3.7, 3.0],
          [1.15, 3.75],
          [3.75, -2.3],
          [-2.4, 3.75],
        ] as const
      ).map(([px, pz], k) => (
        <Mesh key={k} g={G.ico} m={k % 2 ? M.leaf2 : M.leaf} p={[px, 0.1, pz]} s={[0.36, 0.26, 0.36]} />
      ))}
    </group>
  )
}

function Cloud({ p, s = 1, speed = 0.15 }: { p: V3; s?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    if (ref.current) ref.current.position.x = p[0] + Math.sin(st.clock.elapsedTime * speed + p[2]) * 0.6
  })
  return (
    <group ref={ref} position={p} scale={s}>
      <Mesh g={G.puff} m={M.cloud} p={[0, 0, 0]} s={[1.3, 0.9, 1.1]} cast={false} />
      <Mesh g={G.puff} m={M.cloud} p={[0.75, -0.12, 0.1]} s={[0.95, 0.7, 0.85]} cast={false} />
      <Mesh g={G.puff} m={M.cloud} p={[-0.7, -0.16, 0.05]} s={[0.85, 0.6, 0.8]} cast={false} />
    </group>
  )
}

/** the whole island bobs gently */
function Floater({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (ref.current && !POSTER) ref.current.position.y = Math.sin(s.clock.elapsedTime * 0.8) * 0.08
  })
  return <group ref={ref}>{children}</group>
}

/** projects DOM anchors (hover tooltip + celebration badge) */
function Anchors({ hover, tip, badge }: { hover: number; tip: React.RefObject<HTMLDivElement | null>; badge: React.RefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const size = useThree((s) => s.size)
  useFrame(({ camera }) => {
    const put = (el: HTMLDivElement | null, x: number, y: number, z: number) => {
      if (!el) return
      v.set(x, y, z).project(camera)
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
    }
    if (hover >= 0) put(tip.current, PLOTS[hover][0], TOPS[hover] + 0.95, PLOTS[hover][1])
    put(badge.current, LH[0], 4.0, LH[1])
  })
  return null
}

/* ------------------------------------------------------------------ DOM bits */
function Ring({ value, all }: { value: number; all: boolean }) {
  const R = 19
  const L = 2 * Math.PI * R
  return (
    <svg className="oi-ring" width="48" height="48" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(29,28,26,.08)" strokeWidth="5" />
      <motion.circle
        cx="24"
        cy="24"
        r={R}
        fill="none"
        stroke={all ? '#f5b942' : C.teal}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={L}
        initial={false}
        animate={{ strokeDashoffset: L * (1 - value) }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        transform="rotate(-90 24 24)"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ page */
export default function OnboardingIsle() {
  const us = useMemo(() => STEPS.map(() => motionValue(0)), [])
  const outs = useMemo(() => STEPS.map(() => motionValue(0)), [])
  const cel = useMotionValue(0)
  const [done, setDone] = useState<boolean[]>(() => (POSTER ? POSTER_DONE : START))
  const [hover, setHover] = useState(-1)
  const [mode, setMode] = useState<'auto' | 'manual'>(POSTER ? 'manual' : 'auto')
  const [party, setParty] = useState(false)
  const prev = useRef<boolean[] | null>(null)
  const doneRef = useRef(done)
  doneRef.current = done
  const lastTouch = useRef(0)
  const allAt = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const tip = useRef<HTMLDivElement>(null)
  const badge = useRef<HTMLDivElement>(null)

  const count = done.filter(Boolean).length
  const all = count === NS
  const next = done.indexOf(false)

  // checklist → per-plot unlock timelines
  useEffect(() => {
    const p = prev.current
    prev.current = done
    done.forEach((d, i) => {
      if (!p) {
        us[i].set(d ? 1 : 0)
        return
      }
      if (d === p[i]) return
      us[i].stop()
      outs[i].stop()
      if (d) {
        outs[i].set(0)
        us[i].set(0)
        animate(us[i], 1, { duration: BUILD_S, ease: 'linear' })
      } else if (us[i].get() > 0) {
        animate(outs[i], 1, {
          duration: 0.42,
          ease: [0.5, 0, 0.75, 0],
          onComplete: () => {
            us[i].set(0)
            outs[i].set(0)
          },
        })
      }
    })
  }, [done, us, outs])

  // all six → light the lighthouse after the last building lands
  useEffect(() => {
    if (!all) {
      setParty(false)
      allAt.current = 0
      animate(cel, 0, { duration: 0.5 })
      return
    }
    const tm = setTimeout(
      () => {
        setParty(true)
        allAt.current = performance.now()
        animate(cel, 1, { duration: 1.8, ease: 'linear' })
      },
      POSTER ? 0 : 1900,
    )
    return () => clearTimeout(tm)
  }, [all, cel])

  // idle auto-play: tick one step every 2.5 s, hold the celebration, then start over
  useEffect(() => {
    if (mode !== 'auto') return
    const id = setInterval(() => {
      if (performance.now() - lastTouch.current < 7000) return
      const d = doneRef.current
      const k = d.indexOf(false)
      if (k >= 0) setDone(d.map((v, i) => (i === k ? true : v)))
      else if (allAt.current && performance.now() - allAt.current > 7200) setDone(START)
    }, 2500)
    return () => clearInterval(id)
  }, [mode])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const touch = () => void (lastTouch.current = performance.now())
  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const toggle = useCallback((i: number) => {
    lastTouch.current = performance.now()
    setDone((d) => d.map((v, j) => (j === i ? !v : v)))
  }, [])
  const reset = () => {
    touch()
    clearTimers()
    setDone(START)
  }
  const finishAll = () => {
    touch()
    clearTimers()
    let n = 0
    doneRef.current.forEach((v, i) => {
      if (v) return
      timers.current.push(setTimeout(() => setDone((d) => d.map((x, j) => (j === i ? true : x))), n++ * 420))
    })
  }

  const ctx = useMemo<Ctx>(() => ({ us, outs, cel, hover, next, setHover, toggle }), [us, outs, cel, hover, next, toggle])

  return (
    <div className="stage oi-root">
      <div aria-hidden className="oi-sun" />
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }} onPointerMissed={() => setHover(-1)}>
        <IsoRig fit={19.5} mobileFit={12} mobileOffsetY={0.08} offset={[0.2, -0.02]} target={[0, -0.6, 0]} />
        <Lights />
        <IsleCtx.Provider value={ctx}>
          <Floater>
            <Island />
            <Path />
            {PLOTS.map((_, i) => (
              <Plot key={i} i={i} />
            ))}
            <Lighthouse progress={count / NS} />
            <Fireworks />
          </Floater>
        </IsleCtx.Provider>
        <Cloud p={[-3.5, -4.6, 6.5]} s={1.0} />
        <Cloud p={[4.5, -3.4, -5.5]} s={1.1} speed={0.1} />
        <Cloud p={[-3.5, 1.4, -7.5]} s={0.75} speed={0.12} />
        <Cloud p={[7.5, 0.6, -2.5]} s={0.6} speed={0.18} />
        <Anchors hover={hover} tip={tip} badge={badge} />
      </Canvas>

      <div ref={tip} className="oi-anchor" aria-hidden>
        <AnimatePresence>
          {hover >= 0 && (
            <motion.div
              key={hover}
              className="oi-tip"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 560, damping: 32 }}
            >
              <b>
                <em>{String(hover + 1).padStart(2, '0')}</em>
                {STEPS[hover].title}
              </b>
              <span data-done={done[hover]}>{done[hover] ? `已解锁 · ${STEPS[hover].reward}` : '点击完成这一步'}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div ref={badge} className="oi-anchor" aria-live="polite">
        <AnimatePresence>
          {party && (
            <motion.div
              className="oi-badge"
              initial={{ opacity: 0, y: 14, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.5 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.3L8 11.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" fill="currentColor" />
              </svg>
              全部完成
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy oi-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <div className="oi-intro">
            <p className="kicker">
              <i style={{ background: C.teal }} /> Isometric · Onboarding
            </p>
            <h1>
              做完一步
              <br />
              小岛长大一点
            </h1>
            <p>把新手引导做成一座待解锁的小岛：每勾掉一项，对应地块就会裂开、搭起脚手架、弹出新建筑。悬停清单项可在岛上找到它。</p>
          </div>

          <div className="oi-card" onPointerDown={touch}>
            <div className="oi-head">
              <div className="oi-ringwrap">
                <Ring value={count / NS} all={all} />
                <span>
                  {count}
                  <small>/{NS}</small>
                </span>
              </div>
              <div className="oi-head-txt">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.b key={all ? 'all' : 'todo'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>
                    {all ? '全部完成，灯塔点亮！' : '新手任务'}
                  </motion.b>
                </AnimatePresence>
                <span>{all ? '整座小岛已解锁' : `还差 ${NS - count} 步点亮灯塔`}</span>
              </div>
              <button className="oi-reset" onClick={reset} aria-label="重置任务" title="重置">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.5v2.6h2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <ul className="oi-list">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  role="checkbox"
                  aria-checked={done[i]}
                  tabIndex={0}
                  data-done={done[i]}
                  data-hover={hover === i}
                  data-next={next === i}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      toggle(i)
                    }
                  }}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(-1)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(-1)}
                >
                  <span className="oi-box">
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                      <motion.path
                        d="M4.2 9.4l3.1 3.1L13.9 6"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={false}
                        animate={{ pathLength: done[i] ? 1 : 0 }}
                        transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1], delay: done[i] ? 0.06 : 0 }}
                      />
                    </svg>
                  </span>
                  <span className="oi-t">
                    <b>{s.title}</b>
                    <em>{done[i] ? `已解锁「${s.reward}」` : s.sub}</em>
                  </span>
                  <span className="oi-tag">{next === i ? '下一步' : String(i + 1).padStart(2, '0')}</span>
                </li>
              ))}
            </ul>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'auto', label: '自动演示' },
              { value: 'manual', label: '手动' },
            ]}
            value={mode}
            onChange={(v) => {
              touch()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" onClick={finishAll} disabled={all}>
            <span>一键完成</span>
          </button>
          <button className="seg" onClick={reset}>
            <span>重置</span>
          </button>
        </div>
        <p className="hint">悬停清单 · 岛上对应地块会亮起
          <br />
          点击地块或清单项都能打勾
        </p>
      </div>

      <style>{`
        .oi-root { --soft-bg: #eef6f3; --oi-acc: ${C.teal};
          background: radial-gradient(90% 70% at 68% 40%, #f7fbfa 0%, #e9f3f0 50%, #d7eae5 100%); }
        .oi-sun { position: absolute; right: 14%; top: 10%; width: min(36vw, 460px); aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.95) 0%, rgba(240,250,246,.7) 45%, transparent 70%); pointer-events: none; }
        .oi-copy { justify-content: center; gap: 22px; }
        .oi-copy h1 { font-size: clamp(32px, 3.5vw, 48px); }
        .oi-copy .oi-intro p:last-child { font-size: 15px; margin-top: 14px; line-height: 1.7; }
        .oi-card { position: relative; padding: 14px 10px 10px; border-radius: 22px; background: rgba(255,255,255,.78);
          backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(30,60,55,.07), 0 24px 48px -28px rgba(30,80,70,.4); }
        .oi-head { display: flex; align-items: center; gap: 12px; padding: 0 6px 12px 8px; }
        .oi-ringwrap { position: relative; width: 48px; height: 48px; flex: none; }
        .oi-ringwrap span { position: absolute; inset: 0; display: grid; place-items: center; font: 600 14px/1 var(--display);
          font-variant-numeric: tabular-nums; color: var(--ink); }
        .oi-ringwrap small { font-size: 10px; color: var(--ink-3); font-weight: 500; }
        .oi-ringwrap span { display: flex; align-items: baseline; justify-content: center; padding-top: 17px; }
        .oi-head-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .oi-head-txt b { display: block; font: 600 16px/1.2 var(--display); color: var(--ink); }
        .oi-head-txt span { font-size: 12.5px; color: var(--ink-3); }
        .oi-reset { width: 34px; height: 34px; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
          background: transparent; color: var(--ink-2); transition: background .2s, transform .15s var(--ease-out); }
        .oi-reset:hover { background: rgba(29,28,26,.06); }
        .oi-reset:active { transform: scale(.92) rotate(-30deg); }
        .oi-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
        .oi-list li { position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 10px; border-radius: 14px;
          cursor: pointer; outline: none; user-select: none; transition: background .2s; }
        .oi-list li[data-hover='true'] { background: color-mix(in srgb, var(--oi-acc) 10%, transparent); }
        .oi-list li:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--oi-acc) 55%, transparent); }
        .oi-box { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border-radius: 7px;
          box-shadow: inset 0 0 0 1.6px rgba(29,28,26,.2); background: #fff;
          transition: background .25s var(--ease-out), box-shadow .25s, transform .2s var(--ease-out); }
        .oi-list li:active .oi-box { transform: scale(.88); }
        .oi-list li[data-done='true'] .oi-box { background: var(--oi-acc); box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--oi-acc) 80%, transparent); }
        .oi-list li[data-next='true'] .oi-box { box-shadow: inset 0 0 0 1.6px var(--oi-acc); }
        .oi-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .oi-t b { font: 500 14.5px/1.25 var(--sans); color: var(--ink); transition: color .25s; }
        .oi-t em { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .oi-list li[data-done='true'] .oi-t em { color: ${C.tealDk}; }
        .oi-tag { flex: none; font: 500 11px/1 var(--mono); color: var(--ink-3); padding: 5px 8px; border-radius: 999px; }
        .oi-list li[data-next='true'] .oi-tag { font-family: var(--sans); font-weight: 600; color: ${C.tealDk};
          background: color-mix(in srgb, var(--oi-acc) 13%, transparent); }
        .dock .seg:disabled { opacity: .4; cursor: default; }
        .oi-anchor { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
        .oi-tip, .oi-badge { position: absolute; left: 0; bottom: 0; translate: -50% 0; transform-origin: 50% 100%; white-space: nowrap; }
        .oi-tip { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 13px 7px; border-radius: 14px;
          background: rgba(255,255,255,.94); color: var(--ink); font-family: var(--sans);
          box-shadow: 0 10px 24px -10px rgba(20,60,50,.45), inset 0 0 0 1px rgba(0,0,0,.05); }
        .oi-tip b { font-size: 13.5px; font-weight: 600; display: flex; gap: 6px; align-items: baseline; }
        .oi-tip b em { font: 500 10.5px/1 var(--mono); color: var(--ink-3); }
        .oi-tip span { font-size: 11.5px; color: var(--ink-3); }
        .oi-tip span[data-done='true'] { color: ${C.tealDk}; }
        .oi-badge { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px 9px 13px; border-radius: 999px;
          background: linear-gradient(180deg, #ffd466, #f5b23c); color: #5b3a06; font: 700 14px/1 var(--sans); letter-spacing: .04em;
          box-shadow: 0 12px 28px -10px rgba(190,120,20,.6), inset 0 1px 0 rgba(255,255,255,.6); }
        @media (max-width: 760px) {
          .oi-intro { display: none; }
          .oi-copy { bottom: 76px; gap: 0; }
          .oi-card { padding: 10px 8px 8px; border-radius: 18px; }
          .oi-head { padding: 0 4px 8px 6px; gap: 10px; }
          .oi-ringwrap { width: 40px; height: 40px; }
          .oi-ring { width: 40px; height: 40px; }
          .oi-ringwrap span { padding-top: 13px; font-size: 12.5px; }
          .oi-head-txt b { font-size: 14.5px; }
          .oi-head-txt span { font-size: 11.5px; }
          .oi-list { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }
          .oi-list li { padding: 7px 8px; gap: 8px; border-radius: 11px; }
          .oi-t b { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .oi-t em, .oi-tag { display: none; }
          .oi-box { width: 19px; height: 19px; border-radius: 6px; }
          .dock { bottom: 16px; }
        }
      `}</style>
    </div>
  )
}

function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 1.6)
    l.position.set(5, 11, 4)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -7
    cam.right = cam.top = 7
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.15} color="#fffaf2" />
      <hemisphereLight args={['#ffffff', '#9fc8b8', 0.6]} />
      <primitive object={sun} />
    </>
  )
}
