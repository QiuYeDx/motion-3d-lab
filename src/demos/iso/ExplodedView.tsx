import { Environment, Lightformer, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { animate, motion, useMotionValue, useMotionValueEvent, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { useScreenWarmup } from './isoWarmup'

/* ------------------------------------------------------------------ palette (graphite body, champagne top, one orange accent) */
const C = {
  body: '#2c2e32',
  leather: '#222427',
  silver: '#d2cec6',
  chrome: '#e2e2e0',
  dark: '#121315',
  accent: '#ff6b3d',
  glass: '#bcd4de',
  rim: '#1b1c1f',
  pcb: '#3a5852',
  chip: '#1c1e21',
  gold: '#cfa968',
  alu: '#b3b6ba',
  copper: '#bf7a4f',
  flex: '#d9a14a',
  batt: '#3b3e43',
}
const DIM = new THREE.Color('#e6e3dc')
const HOT = new THREE.Color(C.accent)

type V3 = [number, number, number]

/* ------------------------------------------------------------------ parts (callout level) + pieces (moving bodies) */
type PartId = 'glass' | 'barrel' | 'front' | 'sensor' | 'ibis' | 'board' | 'back' | 'screen' | 'top' | 'battery'
type Side = 'ul' | 'dr' | 'u' | 'd' | 'l' | 'r'
type PartDef = { id: PartId; name: string; spec: string; side: Side; len: number; anchor: V3; piece?: number }

const PARTS: PartDef[] = [
  { id: 'glass', name: '光学镜组', spec: '9 组 11 片 · 2 枚 ED 镜片', side: 'dr', len: 70, anchor: [0, -0.3, 0], piece: 2 },
  { id: 'barrel', name: '镜筒 · 对焦环', spec: '线性马达 · 内对焦', side: 'ul', len: 78, anchor: [0, 0.6, 0.55] },
  { id: 'front', name: '前壳 · 卡口', spec: '镁合金 · 不锈钢卡口', side: 'dr', len: 116, anchor: [0.9, -0.55, 0.4] },
  { id: 'sensor', name: '全画幅传感器', spec: '24MP 背照式 CMOS', side: 'dr', len: 104, anchor: [0.2, -0.2, 0.03] },
  { id: 'ibis', name: '五轴防抖平台', spec: '7 档补偿 · 音圈电机', side: 'ul', len: 96, anchor: [-0.5, -0.36, 0.06] },
  { id: 'board', name: '主板', spec: '双核影像处理器 · 8GB', side: 'dr', len: 84, anchor: [0.35, -0.35, 0.05] },
  { id: 'back', name: '后壳', spec: '密封胶条 · 防滴溅', side: 'r', len: 60, anchor: [1.28, -0.35, -0.22] },
  { id: 'screen', name: '翻转触屏', spec: '3.0″ · 162 万点', side: 'u', len: 48, anchor: [0.45, 0.1, -0.05] },
  { id: 'top', name: '顶盖 · 双拨盘', spec: '铝合金 · 独立曝光补偿', side: 'ul', len: 52, anchor: [-0.98, 0.18, 0.26] },
  { id: 'battery', name: '电池', spec: '2280 mAh · USB-C 快充', side: 'd', len: 40, anchor: [0.05, -0.45, 0.1] },
]
const PART_INDEX = Object.fromEntries(PARTS.map((p, i) => [p.id, i])) as Record<PartId, number>

type PieceDef = { part: PartId; base: V3; off: V3; rot?: V3; start: number; span?: number }
const LENS_Z = 0.47
const GLASS = [
  { y: 0.2, r: 0.4, f: 0.05, b: 0.06 },
  { y: 0.38, r: 0.42, f: -0.04, b: 0.07 },
  { y: 0.56, r: 0.44, f: 0.035, b: -0.03 },
  { y: 0.74, r: 0.46, f: 0.08, b: 0.025 },
  { y: 0.93, r: 0.48, f: 0.1, b: -0.02 },
]
const PIECES: PieceDef[] = [
  { part: 'top', base: [0, 0.73, -0.02], off: [0, 1.6, 0], start: 0 },
  { part: 'screen', base: [0.22, -0.02, -0.49], off: [0, 0.3, -3.35], rot: [1.72, 0, 0], start: 0.05 },
  { part: 'back', base: [0, 0, 0], off: [0, 0, -2.6], start: 0.1 },
  ...GLASS.map((g, k): PieceDef => ({ part: 'glass', base: [0, 0, LENS_Z + g.y], off: [0, 0, 3.05 + k * 0.42 - g.y], start: 0.15 + (4 - k) * 0.025 })),
  { part: 'barrel', base: [0, 0, LENS_Z], off: [0, 0, 1.75], start: 0.2 },
  { part: 'front', base: [0, 0, 0], off: [0, 0, 1.25], start: 0.28 },
  { part: 'battery', base: [-0.98, -0.12, -0.04], off: [0.95, -1.6, -0.55], start: 0.32 },
  { part: 'board', base: [0.12, -0.02, -0.15], off: [0, 0, -1.9], start: 0.38 },
  { part: 'ibis', base: [0, 0, -0.05], off: [0, 0, -1.15], start: 0.45 },
  { part: 'sensor', base: [0, 0, 0.05], off: [0, 0, -0.5], start: 0.52 },
]
const SPAN = 0.42

/* ------------------------------------------------------------------ geometry helpers */
/** closed rectangular profile revolved around the optical axis (Y here, rotated to Z by the caller) */
function ringGeo(rIn: number, rOut: number, y0: number, y1: number, ch = 0.008, seg = 64) {
  const pts = [
    [rIn, y0 + ch],
    [rIn + ch, y0],
    [rOut - ch, y0],
    [rOut, y0 + ch],
    [rOut, y1 - ch],
    [rOut - ch, y1],
    [rIn + ch, y1],
    [rIn, y1 - ch],
    [rIn, y0 + ch],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const g = new THREE.LatheGeometry(pts, seg)
  g.rotateX(Math.PI / 2)
  return g
}

/** a lens element: two spherical-ish caps around a short rim (sag > 0 = convex) */
function lensGeo(r: number, front: number, back: number, t = 0.05) {
  const pts: THREE.Vector2[] = []
  const N = 12
  for (let i = 0; i <= N; i++) {
    const rho = (r * i) / N
    pts.push(new THREE.Vector2(rho, -t / 2 - back * (1 - (rho / r) ** 2)))
  }
  for (let i = N; i >= 0; i--) {
    const rho = (r * i) / N
    pts.push(new THREE.Vector2(rho, t / 2 + front * (1 - (rho / r) ** 2)))
  }
  const g = new THREE.LatheGeometry(pts, 48)
  g.rotateX(Math.PI / 2)
  return g
}

/** knurled cylinder: every other radial vertex pushed in */
function knurlGeo(r: number, h: number, teeth = 40, depth = 0.014, open = false) {
  const g = new THREE.CylinderGeometry(r, r, h, teeth * 2, 1, open)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const rr = Math.hypot(x, z)
    if (rr < r * 0.5) continue
    const a = Math.atan2(z, x)
    const k = Math.round(a / (Math.PI / teeth))
    if (k % 2 !== 0) {
      const s = (rr - depth) / rr
      p.setX(i, x * s)
      p.setZ(i, z * s)
    }
  }
  g.computeVertexNormals()
  return g
}

/* ------------------------------------------------------------------ canvas textures (system fonts only) */
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

function makeTextures() {
  const screen = canvasTex(512, 328, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 328)
    sky.addColorStop(0, '#7f9cb8')
    sky.addColorStop(0.55, '#f2c39c')
    sky.addColorStop(1, '#e48e6a')
    g.fillStyle = sky
    g.fillRect(0, 0, 512, 328)
    g.fillStyle = '#fbe6c8'
    g.beginPath()
    g.arc(338, 176, 30, 0, Math.PI * 2)
    g.fill()
    const hills = (y: number, amp: number, col: string, ph: number) => {
      g.fillStyle = col
      g.beginPath()
      g.moveTo(0, 328)
      for (let x = 0; x <= 512; x += 8) g.lineTo(x, y + Math.sin(x * 0.012 + ph) * amp + Math.sin(x * 0.031 + ph * 2) * amp * 0.4)
      g.lineTo(512, 328)
      g.fill()
    }
    hills(214, 18, '#a46a6c', 1)
    hills(244, 14, '#6d4a5e', 3)
    hills(282, 10, '#3e3346', 5)
    // UI chrome
    g.fillStyle = 'rgba(10,10,14,.45)'
    g.fillRect(0, 0, 512, 34)
    g.fillRect(0, 294, 512, 34)
    g.fillStyle = '#fff'
    g.font = '600 17px Consolas, monospace'
    g.fillText('1/250   F2.8   ISO 200', 16, 23)
    g.fillText('4K 30p', 420, 23)
    g.fillText('± 0.0', 16, 318)
    g.fillStyle = '#ffb08e'
    g.fillText('● REC', 420, 318)
    g.strokeStyle = '#7dffa6'
    g.lineWidth = 3
    g.strokeRect(306, 140, 66, 66)
    // histogram
    g.fillStyle = 'rgba(255,255,255,.55)'
    for (let i = 0; i < 40; i++) {
      const h = 6 + Math.abs(Math.sin(i * 0.37) * 28) * Math.exp(-(((i - 22) / 14) ** 2))
      g.fillRect(140 + i * 3, 314 - h, 2, h)
    }
  })

  const pcb = canvasTex(512, 280, (g) => {
    g.fillStyle = C.pcb
    g.fillRect(0, 0, 512, 280)
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    g.lineCap = 'round'
    for (let i = 0; i < 150; i++) {
      g.strokeStyle = rnd() < 0.5 ? 'rgba(150,200,180,.22)' : 'rgba(120,175,160,.16)'
      g.lineWidth = rnd() < 0.2 ? 3 : 1.4
      let x = rnd() * 512
      let y = rnd() * 280
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 3; k++) {
        const len = 20 + rnd() * 70
        const dir = Math.floor(rnd() * 4)
        if (dir === 0) x += len
        else if (dir === 1) y += len * 0.6
        else if (dir === 2) {
          x += len * 0.5
          y += len * 0.5
        } else y -= len * 0.6
        g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = 'rgba(215,180,110,.55)'
      g.beginPath()
      g.arc(x, y, 2.4, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = 'rgba(240,240,232,.7)'
    g.font = '600 13px Consolas, monospace'
    g.fillText('LM-X1  MAIN  REV.3', 18, 262)
    g.strokeStyle = 'rgba(240,240,232,.45)'
    g.lineWidth = 1.5
    g.strokeRect(268, 48, 104, 104)
  })

  const sensor = canvasTex(256, 176, (g) => {
    const gr = g.createLinearGradient(0, 0, 256, 176)
    gr.addColorStop(0, '#3b3a6e')
    gr.addColorStop(0.35, '#5a7f8f')
    gr.addColorStop(0.55, '#b5a36b')
    gr.addColorStop(0.75, '#7b4e74')
    gr.addColorStop(1, '#2b3550')
    g.fillStyle = gr
    g.fillRect(0, 0, 256, 176)
    g.strokeStyle = 'rgba(0,0,0,.18)'
    g.lineWidth = 1
    for (let x = 0; x < 256; x += 4) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 176)
      g.stroke()
    }
    for (let y = 0; y < 176; y += 4) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(256, y)
      g.stroke()
    }
  })

  const battery = canvasTex(128, 384, (g) => {
    g.fillStyle = C.batt
    g.fillRect(0, 0, 128, 384)
    g.fillStyle = C.accent
    g.fillRect(0, 300, 128, 14)
    g.save()
    g.translate(64, 160)
    g.rotate(-Math.PI / 2)
    g.fillStyle = '#eceae4'
    g.font = '700 30px "Segoe UI", system-ui, sans-serif'
    g.textAlign = 'center'
    g.fillText('LUMEN', 0, -6)
    g.font = '500 15px Consolas, monospace'
    g.fillStyle = 'rgba(236,234,228,.65)'
    g.fillText('NP-L28 · 7.2V 2280mAh', 0, 22)
    g.restore()
  })

  const brand = canvasTex(256, 64, (g) => {
    g.clearRect(0, 0, 256, 64)
    g.fillStyle = '#f2efe8'
    g.font = '600 40px "Segoe UI", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('L U M E N', 128, 34)
  })

  return { screen, pcb, sensor, battery, brand }
}
type Tex = ReturnType<typeof makeTextures>

/* ------------------------------------------------------------------ piece models (local to each piece origin) */
function TopPlate() {
  const hump = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.44, 0)
    s.lineTo(0.3, 0)
    s.lineTo(0.08, 0.34)
    s.lineTo(-0.4, 0.34)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.84, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2 })
    g.translate(0, 0, -0.42)
    g.rotateY(-Math.PI / 2)
    return g
  }, [])
  const dial = useMemo(() => knurlGeo(0.24, 0.13, 36, 0.012), [])
  const ev = useMemo(() => knurlGeo(0.17, 0.11, 28, 0.01), [])
  const cmd = useMemo(() => knurlGeo(0.15, 0.06, 24, 0.012), [])
  return (
    <group>
      <RoundedBox args={[2.62, 0.12, 0.9]} radius={0.05} smoothness={3}>
        <meshStandardMaterial color={C.silver} metalness={0.75} roughness={0.32} />
      </RoundedBox>
      <mesh geometry={hump} position={[0, 0.04, 0]}>
        <meshStandardMaterial color={C.silver} metalness={0.75} roughness={0.32} />
      </mesh>
      {/* hot shoe */}
      <mesh position={[0, 0.42, -0.13]}>
        <boxGeometry args={[0.36, 0.035, 0.32]} />
        <meshStandardMaterial color={C.chrome} metalness={0.9} roughness={0.18} />
      </mesh>
      {/* eyepiece */}
      <RoundedBox args={[0.6, 0.3, 0.14]} radius={0.05} smoothness={2} position={[0, 0.22, -0.5]}>
        <meshStandardMaterial color={C.dark} roughness={0.85} />
      </RoundedBox>
      {/* mode dial */}
      <mesh geometry={dial} position={[0.82, 0.13, -0.08]}>
        <meshStandardMaterial color={C.silver} metalness={0.8} roughness={0.3} flatShading />
      </mesh>
      <mesh position={[0.82, 0.2, 0.1]}>
        <boxGeometry args={[0.03, 0.01, 0.1]} />
        <meshBasicMaterial color={C.accent} />
      </mesh>
      {/* exposure comp dial */}
      <mesh geometry={ev} position={[1.12, 0.12, -0.3]}>
        <meshStandardMaterial color={C.body} metalness={0.4} roughness={0.5} flatShading />
      </mesh>
      {/* shutter button with collar */}
      <mesh position={[-0.98, 0.09, 0.26]}>
        <cylinderGeometry args={[0.14, 0.15, 0.07, 36]} />
        <meshStandardMaterial color={C.silver} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[-0.98, 0.15, 0.26]}>
        <cylinderGeometry args={[0.085, 0.09, 0.06, 32]} />
        <meshStandardMaterial color={C.accent} roughness={0.35} />
      </mesh>
      {/* rear command dial */}
      <mesh geometry={cmd} position={[-0.62, 0.08, -0.36]}>
        <meshStandardMaterial color={C.dark} metalness={0.3} roughness={0.6} flatShading />
      </mesh>
    </group>
  )
}

function Screen({ tex }: { tex: Tex }) {
  return (
    <group>
      <RoundedBox args={[1.74, 1.1, 0.08]} radius={0.03} smoothness={2}>
        <meshStandardMaterial color={C.leather} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, -0.041]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.6, 1.02]} />
        <meshStandardMaterial map={tex.screen} emissiveMap={tex.screen} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.15} />
      </mesh>
      {/* hinge */}
      <mesh position={[0, 0.56, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.035, 0.035, 1.2, 16]} />
        <meshStandardMaterial color={C.alu} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

function BackShell() {
  return (
    <group>
      <RoundedBox args={[2.6, 1.34, 0.44]} radius={0.1} smoothness={3} position={[0, 0, -0.22]}>
        <meshStandardMaterial color={C.body} roughness={0.55} metalness={0.15} />
      </RoundedBox>
      {/* inner frame — visible once the shell has backed away */}
      <mesh position={[0, 0, 0.002]}>
        <boxGeometry args={[2.32, 1.08, 0.01]} />
        <meshStandardMaterial color="#1a1b1e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <boxGeometry args={[2.1, 0.88, 0.012]} />
        <meshStandardMaterial color="#26282c" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* gasket line */}
      <mesh position={[0, 0.555, 0.008]}>
        <boxGeometry args={[2.3, 0.02, 0.014]} />
        <meshStandardMaterial color={C.accent} roughness={0.5} />
      </mesh>
      {/* thumb rest + buttons on the back */}
      <RoundedBox args={[0.5, 0.46, 0.1]} radius={0.04} smoothness={2} position={[-0.98, 0.28, -0.47]}>
        <meshStandardMaterial color={C.leather} roughness={0.85} />
      </RoundedBox>
      {[-0.32, -0.08].map((y) => (
        <mesh key={y} position={[-0.98, y, -0.455]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 20]} />
          <meshStandardMaterial color={C.dark} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function GlassElement({ k }: { k: number }) {
  const e = GLASS[k]
  const geo = useMemo(() => lensGeo(e.r, e.f, e.b), [e])
  return (
    <group>
      <mesh geometry={geo} renderOrder={2}>
        <meshPhysicalMaterial color={C.glass} roughness={0.05} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} transparent opacity={0.55} envMapIntensity={2.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[e.r + 0.006, e.r + 0.006, 0.05, 48, 1, true]} />
        <meshStandardMaterial color={C.rim} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Barrel() {
  const g = useMemo(
    () => ({
      collar: ringGeo(0.47, 0.585, 0, 0.09),
      tube: ringGeo(0.5, 0.6, 0.09, 1.0),
      lip: ringGeo(0.44, 0.61, 1.0, 1.08, 0.02),
      focus: (() => {
        const k = knurlGeo(0.622, 0.36, 72, 0.014, true)
        k.rotateX(Math.PI / 2)
        k.translate(0, 0, 0.6)
        return k
      })(),
      accent: ringGeo(0.598, 0.606, 0.88, 0.9, 0.002),
    }),
    [],
  )
  return (
    <group>
      <mesh geometry={g.collar}>
        <meshStandardMaterial color={C.chrome} metalness={0.9} roughness={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.tube}>
        <meshStandardMaterial color={C.body} metalness={0.35} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.focus}>
        <meshStandardMaterial color={C.leather} roughness={0.75} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.accent}>
        <meshStandardMaterial color={C.accent} roughness={0.4} />
      </mesh>
      <mesh geometry={g.lip}>
        <meshStandardMaterial color={C.dark} metalness={0.3} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function FrontShell({ tex }: { tex: Tex }) {
  const mount = useMemo(() => ringGeo(0.5, 0.64, 0.4, 0.47, 0.01), [])
  return (
    <group>
      <RoundedBox args={[2.6, 1.34, 0.4]} radius={0.1} smoothness={3} position={[0, 0, 0.2]}>
        <meshStandardMaterial color={C.leather} roughness={0.82} metalness={0.05} />
      </RoundedBox>
      {/* grip */}
      <RoundedBox args={[0.62, 1.32, 0.36]} radius={0.16} smoothness={3} position={[-0.98, 0, 0.5]}>
        <meshStandardMaterial color={C.leather} roughness={0.85} />
      </RoundedBox>
      {/* metal band where the shell meets the top plate */}
      <mesh position={[0.3, 0.62, 0.38]}>
        <boxGeometry args={[1.9, 0.07, 0.05]} />
        <meshStandardMaterial color={C.body} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh geometry={mount}>
        <meshStandardMaterial color={C.chrome} metalness={0.95} roughness={0.16} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, 0.402]}>
        <circleGeometry args={[0.5, 48]} />
        <meshStandardMaterial color={C.dark} roughness={0.9} />
      </mesh>
      {/* mount index dot, AF lamp, lens release, brand */}
      <mesh position={[0, 0.6, 0.41]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.02, 12]} />
        <meshBasicMaterial color={C.accent} />
      </mesh>
      <mesh position={[-0.52, 0.46, 0.405]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
        <meshStandardMaterial color="#5a3a2c" roughness={0.2} metalness={0.2} />
      </mesh>
      <mesh position={[0.74, -0.3, 0.41]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.03, 24]} />
        <meshStandardMaterial color={C.chrome} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0.82, 0.42, 0.403]}>
        <planeGeometry args={[0.7, 0.175]} />
        <meshBasicMaterial map={tex.brand} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

function Battery({ tex }: { tex: Tex }) {
  return (
    <group>
      <RoundedBox args={[0.4, 0.98, 0.3]} radius={0.04} smoothness={2}>
        <meshStandardMaterial color={C.batt} roughness={0.55} />
      </RoundedBox>
      <mesh position={[0.201, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.27, 0.92]} />
        <meshStandardMaterial map={tex.battery} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.151]}>
        <planeGeometry args={[0.36, 0.92]} />
        <meshStandardMaterial map={tex.battery} roughness={0.5} />
      </mesh>
      {[-0.08, 0, 0.08].map((x) => (
        <mesh key={x} position={[x, 0.495, 0]}>
          <boxGeometry args={[0.04, 0.012, 0.12]} />
          <meshStandardMaterial color={C.gold} metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function Board({ tex }: { tex: Tex }) {
  const smd = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = smd.current
    if (!m) return
    let s = 11
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const o = new THREE.Object3D()
    const col = new THREE.Color()
    let n = 0
    while (n < m.count) {
      const x = -0.95 + rnd() * 1.9
      const y = -0.5 + rnd() * 1.0
      if (x > 0.05 && x < 0.7 && y > -0.18 && y < 0.42) continue // processor keep-out
      if (x < -0.3 && x > -0.95 && y > 0.05 && y < 0.4) continue // ram
      const big = rnd() < 0.25
      o.position.set(x, y, 0.03)
      o.scale.set(big ? 0.09 : 0.05, big ? 0.06 : 0.03, big ? 0.03 : 0.02)
      o.updateMatrix()
      m.setMatrixAt(n, o.matrix)
      m.setColorAt(n, col.set(big ? '#2a2b2e' : rnd() < 0.5 ? '#b9a27a' : '#56514a'))
      n++
    }
    m.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      <mesh>
        <boxGeometry args={[2.06, 1.12, 0.035]} />
        <meshStandardMaterial color={C.pcb} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.0185]}>
        <planeGeometry args={[2.06, 1.12]} />
        <meshStandardMaterial map={tex.pcb} roughness={0.55} />
      </mesh>
      {/* processor with heat-spreader lid */}
      <mesh position={[0.38, 0.12, 0.045]}>
        <boxGeometry args={[0.46, 0.46, 0.05]} />
        <meshStandardMaterial color={C.chip} roughness={0.5} />
      </mesh>
      <mesh position={[0.38, 0.12, 0.075]}>
        <boxGeometry args={[0.34, 0.34, 0.012]} />
        <meshStandardMaterial color={C.alu} metalness={0.9} roughness={0.28} />
      </mesh>
      {/* ram */}
      {[-0.78, -0.48].map((x) => (
        <mesh key={x} position={[x, 0.22, 0.04]}>
          <boxGeometry args={[0.26, 0.22, 0.04]} />
          <meshStandardMaterial color={C.chip} roughness={0.45} />
        </mesh>
      ))}
      {/* card slot + connectors */}
      <mesh position={[-0.55, -0.32, 0.05]}>
        <boxGeometry args={[0.62, 0.3, 0.06]} />
        <meshStandardMaterial color={C.chrome} metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh position={[0.82, -0.38, 0.035]}>
        <boxGeometry args={[0.3, 0.12, 0.035]} />
        <meshStandardMaterial color="#efeae0" roughness={0.6} />
      </mesh>
      <mesh position={[0.15, -0.53, 0.025]}>
        <boxGeometry args={[0.8, 0.04, 0.012]} />
        <meshStandardMaterial color={C.gold} metalness={0.9} roughness={0.25} />
      </mesh>
      <instancedMesh ref={smd} args={[undefined, undefined, 46]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </group>
  )
}

function Ibis() {
  const coil = useMemo(() => {
    const g = new THREE.TorusGeometry(0.1, 0.04, 10, 28)
    return g
  }, [])
  return (
    <group>
      <RoundedBox args={[1.3, 1.0, 0.05]} radius={0.02} smoothness={2}>
        <meshStandardMaterial color={C.alu} metalness={0.85} roughness={0.32} />
      </RoundedBox>
      <mesh position={[0, 0, 0.027]}>
        <boxGeometry args={[0.8, 0.58, 0.01]} />
        <meshStandardMaterial color="#26282c" roughness={0.7} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <mesh key={`${sx}${sy}`} geometry={coil} position={[sx * 0.5, sy * 0.36, 0.04]}>
            <meshStandardMaterial color={C.copper} metalness={0.8} roughness={0.35} />
          </mesh>
        )),
      )}
      {/* flex cable */}
      <mesh position={[0.52, -0.6, 0]}>
        <boxGeometry args={[0.26, 0.3, 0.012]} />
        <meshStandardMaterial color={C.flex} roughness={0.4} metalness={0.1} />
      </mesh>
    </group>
  )
}

function Sensor({ tex }: { tex: Tex }) {
  return (
    <group>
      <RoundedBox args={[0.94, 0.72, 0.05]} radius={0.015} smoothness={2}>
        <meshStandardMaterial color="#26272b" roughness={0.45} />
      </RoundedBox>
      <mesh position={[0, 0, 0.026]}>
        <boxGeometry args={[0.82, 0.6, 0.008]} />
        <meshStandardMaterial color={C.gold} metalness={0.9} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[0.74, 0.52]} />
        <meshStandardMaterial map={tex.sensor} metalness={0.55} roughness={0.18} envMapIntensity={1.6} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ runtime per piece */
type Mat = THREE.MeshStandardMaterial
type MatRec = { m: Mat; base: THREE.Color; op: number; em: THREE.Color | null }
type RT = { def: PieceDef; g: THREE.Group | null; x: number; v: number; dim: number; hot: number; mats: MatRec[]; lift: THREE.Vector3; dirty: boolean }

function Piece({ rt, children, onHover }: { rt: RT; children: ReactNode; onHover: (id: PartId | null, from?: PartId) => void }) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = ref.current!
    rt.g = g
    const recs: MatRec[] = []
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as Mat).clone()
      mesh.material = mat
      recs.push({ m: mat, base: mat.color.clone(), op: mat.opacity, em: mat.emissive ? mat.emissive.clone() : null })
    })
    rt.mats = recs
    rt.dirty = true
    return () => recs.forEach((r) => r.m.dispose())
  }, [rt])
  const id = rt.def.part
  return (
    <group
      ref={ref}
      position={rt.def.base}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(id)
      }}
      onPointerOut={() => onHover(null, id)}
    >
      {children}
    </group>
  )
}

/* ------------------------------------------------------------------ callout DOM refs */
type CalloutRefs = { w: number[]; label: (HTMLDivElement | null)[]; line: (SVGPolylineElement | null)[]; dot: (SVGCircleElement | null)[]; g: (SVGGElement | null)[] }

const SIDE_DIR: Record<Side, [number, number]> = {
  ul: [-0.5, -0.866],
  dr: [0.5, 0.866],
  u: [0.2, -1],
  d: [0.2, 1],
  l: [-1, 0.25],
  r: [1, -0.25],
}

const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------------ scene */
function Scene({ prog, hov, setHov, co, onReady }: { prog: MotionValue<number>; hov: RefObject<PartId | null>; setHov: (id: PartId | null, from?: PartId) => void; co: RefObject<CalloutRefs>; onReady: () => void }) {
  useScreenWarmup(onReady)
  const tex = useMemo(makeTextures, [])
  useEffect(() => () => Object.values(tex).forEach((t) => t.dispose()), [tex])
  const rts = useMemo<RT[]>(
    () =>
      PIECES.map((def) => {
        const o = new THREE.Vector3(...def.off)
        return { def, g: null, x: POSTER ? 1 : 0, v: 0, dim: 0, hot: 0, mats: [], lift: o.lengthSq() ? o.normalize().multiplyScalar(0.14) : o, dirty: true }
      }),
    [],
  )
  const root = useRef<THREE.Group>(null)
  // soft contact shadows: one blurred blob per piece, sized to its footprint, fading with height
  const blobs = useRef<(THREE.Mesh | null)[]>([])
  const blobGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const blobTex = useMemo(
    () =>
      canvasTex(128, 128, (g) => {
        const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
        r.addColorStop(0, 'rgba(255,255,255,1)')
        r.addColorStop(0.4, 'rgba(255,255,255,.6)')
        r.addColorStop(0.75, 'rgba(255,255,255,.16)')
        r.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = r
        g.fillRect(0, 0, 128, 128)
      }),
    [],
  )
  const blobMats = useMemo(() => rts.map(() => new THREE.MeshBasicMaterial({ map: blobTex, color: '#3a3128', transparent: true, depthWrite: false, opacity: 0 })), [rts, blobTex])
  const foot = useMemo(() => rts.map(() => ({ c: new THREE.Vector3(), w: 1, d: 1, h: 0.5 })), [rts])
  useLayoutEffect(() => {
    const box = new THREE.Box3()
    const size = new THREE.Vector3()
    rts.forEach((rt, i) => {
      if (!rt.g) return
      rt.g.updateWorldMatrix(true, true)
      box.setFromObject(rt.g)
      box.getSize(size)
      box.getCenter(foot[i].c)
      rt.g.worldToLocal(foot[i].c)
      foot[i].w = size.x
      foot[i].d = Math.max(size.z, rt.def.part === 'glass' ? 0.5 : 0.3)
      foot[i].h = size.y / 2
    })
  }, [rts, foot])
  const st = useRef({ rp: POSTER ? 1 : 0, kx: 0, kv: 0 })
  const v = useMemo(() => new THREE.Vector3(), [])
  const tmp = useMemo(() => new THREE.Color(), [])

  useFrame(({ camera, size }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const p = prog.get()
    const h = hov.current
    const s = st.current
    // pieces: target from the staggered window, followed by a slightly under-damped spring → springy seat on assembly
    for (const rt of rts) {
      const g = rt.g
      if (!g) continue
      const d = rt.def
      const target = easeIO(Math.min(1, Math.max(0, (p - d.start) / (d.span ?? SPAN))))
      const k = 210
      const c = 2 * 0.6 * Math.sqrt(k)
      const prevX = rt.x
      rt.v += (k * (target - rt.x) - c * rt.v) * dt
      rt.x += rt.v * dt
      if (prevX > 0.025 && rt.x <= 0.025 && rt.v < -0.9) s.kv -= Math.min(2.4, -rt.v) * 0.9 // seat kick
      const isHot = h === d.part
      const hotT = isHot ? 1 : 0
      const dimT = h && !isHot ? 1 : 0
      const oh = rt.hot
      const od = rt.dim
      rt.hot += (hotT - rt.hot) * Math.min(1, dt * 10)
      rt.dim += (dimT - rt.dim) * Math.min(1, dt * 8)
      const x = rt.x
      g.position.set(d.base[0] + d.off[0] * x + rt.lift.x * rt.hot, d.base[1] + d.off[1] * x + rt.lift.y * rt.hot, d.base[2] + d.off[2] * x + rt.lift.z * rt.hot)
      if (d.rot) g.rotation.set(d.rot[0] * x, d.rot[1] * x, d.rot[2] * x)
      if (rt.dirty || Math.abs(oh - rt.hot) > 1e-4 || Math.abs(od - rt.dim) > 1e-4) {
        rt.dirty = false
        for (const r of rt.mats) {
          r.m.color.copy(r.base).lerp(DIM, rt.dim * 0.62)
          if (r.em) r.m.emissive.copy(r.em).lerp(DIM, rt.dim * 0.42).lerp(tmp.copy(HOT), rt.hot * 0.06)
          if (r.m.transparent) r.m.opacity = r.op * (1 - rt.dim * 0.55)
        }
      }
    }
    // root: lift, re-centre and zoom out as the stack opens; seat kick squash
    s.rp += (p - s.rp) * Math.min(1, dt * 3.2)
    s.kv += (-260 * s.kx - 15 * s.kv) * dt
    s.kx += s.kv * dt
    const e = smooth(0, 1, s.rp)
    const mobile = size.width < 760
    const sc = THREE.MathUtils.lerp(mobile ? 1.5 : 1.75, mobile ? 1 : 1.08, e)
    const r = root.current
    if (r) {
      r.position.set(0.6 * e, THREE.MathUtils.lerp(1.45, 2.5, e), 0.7 * e)
      r.scale.set(sc * (1 - s.kx * 0.02), sc * (1 + s.kx * 0.045), sc * (1 - s.kx * 0.02))
      r.updateMatrixWorld(true)
    }
    rts.forEach((rt, i) => {
      const b = blobs.current[i]
      if (!b || !rt.g) return
      const f = foot[i]
      v.copy(f.c)
      rt.g.localToWorld(v)
      const hgt = Math.max(0, v.y - f.h * sc)
      const spread = 1.25 + hgt * 0.22
      b.position.set(v.x, 0.004 + i * 0.0004, v.z)
      b.scale.set(f.w * sc * spread + 0.3, f.d * sc * spread + 0.3, 1)
      blobMats[i].opacity = ((rt.def.part === 'glass' ? 0.16 : 0.34) / (1 + hgt * 0.55)) * (1 - rt.dim * 0.5)
    })
    // callouts: project anchors, write SVG + label transforms directly
    const refs = co.current
    if (!refs) return
    const lenK = mobile ? 0.62 : 1
    PARTS.forEach((pd, i) => {
      const rt = rts[PIECES.findIndex((q) => q.part === pd.id) + (pd.piece ?? 0)]
      const lab = refs.label[i]
      const gEl = refs.g[i]
      if (!rt?.g || !lab || !gEl) return
      const vis = smooth(0.6, 0.92, rt.x) * (1 - rt.dim * 0.75)
      if (vis < 0.01) {
        if (lab.style.visibility !== 'hidden') {
          lab.style.visibility = 'hidden'
          gEl.style.visibility = 'hidden'
        }
        return
      }
      lab.style.visibility = ''
      gEl.style.visibility = ''
      v.set(pd.anchor[0], pd.anchor[1], pd.anchor[2])
      rt.g.localToWorld(v).project(camera)
      const ax = (v.x * 0.5 + 0.5) * size.width
      const ay = (-v.y * 0.5 + 0.5) * size.height
      const [dx, dy] = SIDE_DIR[pd.side]
      const L = pd.len * lenK * (0.55 + 0.45 * vis)
      const ex = ax + dx * L
      const ey = ay + dy * L
      const left = dx < 0
      let tx = ex + (left ? -14 : 14)
      const w = refs.w[i] || (refs.w[i] = lab.offsetWidth)
      if (left && tx - 6 - w < 8) tx = 14 + w
      if (!left && tx + 6 + w > size.width - 8) tx = size.width - 14 - w
      refs.line[i]?.setAttribute('points', `${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${tx.toFixed(1)},${ey.toFixed(1)}`)
      refs.dot[i]?.setAttribute('cx', ax.toFixed(1))
      refs.dot[i]?.setAttribute('cy', ay.toFixed(1))
      gEl.style.opacity = vis.toFixed(3)
      lab.style.opacity = vis.toFixed(3)
      lab.style.transform = `translate3d(${(tx + (left ? -6 : 6)).toFixed(1)}px, ${ey.toFixed(1)}px, 0) translate(${left ? '-100%' : '0'}, -50%)`
      const hot = h === pd.id ? '1' : '0'
      if (lab.dataset.hot !== hot) {
        lab.dataset.hot = hot
        gEl.dataset.hot = hot
      }
    })
  })

  const tex_ = tex
  return (
    <>
      <group ref={root}>
        {rts.map((rt, i) => {
          const d = rt.def
          let model: ReactNode = null
          switch (d.part) {
            case 'top':
              model = <TopPlate />
              break
            case 'screen':
              model = <Screen tex={tex_} />
              break
            case 'back':
              model = <BackShell />
              break
            case 'glass':
              model = <GlassElement k={PIECES.slice(0, i).filter((q) => q.part === 'glass').length} />
              break
            case 'barrel':
              model = <Barrel />
              break
            case 'front':
              model = <FrontShell tex={tex_} />
              break
            case 'battery':
              model = <Battery tex={tex_} />
              break
            case 'board':
              model = <Board tex={tex_} />
              break
            case 'ibis':
              model = <Ibis />
              break
            case 'sensor':
              model = <Sensor tex={tex_} />
              break
          }
          return (
            <Piece key={i} rt={rt} onHover={setHov}>
              {model}
            </Piece>
          )
        })}
      </group>
      {rts.map((_, i) => (
        <mesh key={i} ref={(m) => void (blobs.current[i] = m)} rotation={[-Math.PI / 2, 0, 0]} geometry={blobGeo} material={blobMats[i]} renderOrder={0} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ floor: faint drafting grid */
const floorMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uLine: { value: new THREE.Color('#a59d90') } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLine;
      varying vec3 vW;
      float grid(vec2 p, float s) { vec2 q = p / s; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main() {
        vec2 p = vW.xz;
        float fade = 1.0 - smoothstep(2.5, 10.0, length(p - vec2(-0.6, 0.3)));
        float a = (grid(p, 0.5) * 0.16 + grid(p, 2.5) * 0.3) * fade;
        gl_FragColor = vec4(uLine, a);
        #include <colorspace_fragment>
      }`,
  })

function Floor() {
  const mat = useMemo(floorMat, [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={-1}>
      <planeGeometry args={[40, 40]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ page */
const STOPS = [
  { value: 0, label: '合上' },
  { value: 0.5, label: '半拆' },
  { value: 1, label: '全拆' },
]

export default function ExplodedView() {
  const prog = useMotionValue(POSTER ? 1 : 0)
  const hov = useRef<PartId | null>(null)
  const [hovId, setHovId] = useState<PartId | null>(null)
  const [ready, setReady] = useState(false)
  const [bucket, setBucket] = useState(POSTER ? 1 : 0)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const lastUser = useRef(-1e9)
  const slider = useRef<HTMLInputElement>(null)
  const pct = useRef<HTMLSpanElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const co = useRef<CalloutRefs>({ w: [], label: [], line: [], dot: [], g: [] })

  const setHov = useCallback((id: PartId | null, from?: PartId) => {
    if (id === null && from && hov.current !== from) return
    hov.current = id
    if (id) lastUser.current = performance.now()
    setHovId(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }, [])
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  useMotionValueEvent(prog, 'change', (v) => {
    if (slider.current) slider.current.value = String(Math.round(v * 1000))
    if (pct.current) pct.current.textContent = `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`
    const b = v < 0.25 ? 0 : v < 0.75 ? 0.5 : 1
    setBucket((o) => (o === b ? o : b))
  })

  const goTo = useCallback(
    (to: number, user = true) => {
      anim.current?.stop()
      if (user) lastUser.current = performance.now()
      const from = prog.get()
      const dur = 0.5 + 1.9 * Math.abs(to - from)
      anim.current = animate(prog, to, { duration: dur, ease: to > from ? [0.6, 0, 0.3, 1] : [0.55, 0, 0.25, 1] })
      return dur
    },
    [prog],
  )

  // wheel scrubbing over the whole stage
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      anim.current?.stop()
      lastUser.current = performance.now()
      const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY
      prog.set(Math.min(1, Math.max(0, prog.get() + d * 0.0009)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [prog])

  // idle auto-loop: explode → hold → assemble → hold
  useEffect(() => {
    if (POSTER) return
    let dead = false
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    ;(async () => {
      await sleep(1300)
      while (!dead) {
        if (hov.current || performance.now() - lastUser.current < 6500) {
          await sleep(400)
          continue
        }
        const to = prog.get() > 0.5 ? 0 : 1
        const mark = lastUser.current
        const dur = goTo(to, false)
        const hold = dur * 1000 + (to === 1 ? 3400 : 2200)
        const t0 = performance.now()
        while (!dead && performance.now() - t0 < hold && lastUser.current === mark) await sleep(100)
      }
    })()
    return () => {
      dead = true
      anim.current?.stop()
    }
  }, [goTo, prog])

  const exploded = bucket === 1

  return (
    <div ref={stage} className="stage ev-root" style={{ background: 'radial-gradient(120% 90% at 66% 42%, #fbfaf7 0%, #f1f0ec 52%, #e6e3dc 100%)' }}>
      <motion.div className="ev-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.7 }}>
        <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }} onPointerMissed={() => setHov(null)}>
          <IsoRig fit={14.5} mobileFit={9.4} mobileOffsetY={0.1} offset={[0.17, -0.01]} target={[0.15, 1.75, 0.15]} />
          <ambientLight intensity={0.35} color="#fff6ec" />
          <directionalLight position={[5, 9, 7]} intensity={1.5} color="#fff3e6" />
          <directionalLight position={[-7, 3, 2]} intensity={0.35} color="#dfe8ff" />
          <Environment resolution={256} frames={1}>
            <color attach="background" args={['#b9b6b0']} />
            <Lightformer form="rect" intensity={3} position={[0, 7, 3]} scale={[10, 3, 1]} />
            <Lightformer form="rect" intensity={2.2} position={[-6, 2, 4]} scale={[2, 8, 1]} />
            <Lightformer form="rect" intensity={1.8} color="#e2e8ff" position={[6, 2.5, 3]} scale={[2.5, 8, 1]} />
            <Lightformer form="rect" intensity={1.3} color="#ffe2cf" position={[3, -1, -7]} scale={[6, 3, 1]} />
            <Lightformer form="ring" intensity={2} position={[-3, 4, -6]} scale={2} />
            <Lightformer form="rect" intensity={0.7} position={[0, -6, 0]} scale={[14, 14, 1]} />
          </Environment>
          <Floor />
          <Scene prog={prog} hov={hov} setHov={setHov} co={co} onReady={() => setReady(true)} />
        </Canvas>
      </motion.div>

      {/* callouts */}
      <div className="ev-callouts" data-hover={hovId ? '1' : '0'}>
        <svg className="ev-lines" aria-hidden>
          {PARTS.map((p, i) => (
            <g key={p.id} ref={(el) => void (co.current.g[i] = el)} style={{ visibility: 'hidden' }}>
              <polyline ref={(el) => void (co.current.line[i] = el)} points="" />
              <circle ref={(el) => void (co.current.dot[i] = el)} r={3} />
            </g>
          ))}
        </svg>
        {PARTS.map((p, i) => (
          <div
            key={p.id}
            ref={(el) => void (co.current.label[i] = el)}
            className="ev-label"
            style={{ visibility: 'hidden', textAlign: SIDE_DIR[p.side][0] < 0 ? 'right' : 'left' }}
            onPointerEnter={() => setHov(p.id)}
            onPointerLeave={() => setHov(null, p.id)}
          >
            <b>
              <em>{String(PART_INDEX[p.id] + 1).padStart(2, '0')}</em>
              {p.name}
            </b>
            <span>{p.spec}</span>
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
            <i style={{ background: C.accent }} /> Isometric · Product
          </p>
          <h1>
            把一台相机
            <br />
            拆开给你看
          </h1>
          <p>十个零件沿光轴依次退开：镜组向前，传感器、主板与屏幕向后，顶盖上浮、电池下沉。悬停任一零件，它会亮起并报出自己的规格。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => goTo(exploded ? 0 : 1)}>
              {exploded ? '合上' : '一键拆解'}
            </button>
            <span className="btn ev-count" style={{ cursor: 'default' }}>
              {hovId ? `${String(PART_INDEX[hovId] + 1).padStart(2, "0")} · ${PARTS[PART_INDEX[hovId]].name}` : "10 个零件 · 悬停查看"}
            </span>
          </div>
        </motion.div>

        <div className="dock ev-dock">
          <Seg items={STOPS} value={bucket} onChange={(v) => goTo(v)} />
          <span className="dock-sep" />
          <label className="ev-scrub">
            <input
              ref={slider}
              type="range"
              min={0}
              max={1000}
              defaultValue={POSTER ? 1000 : 0}
              aria-label="拆解进度"
              onInput={(e) => {
                anim.current?.stop()
                lastUser.current = performance.now()
                prog.set(Number((e.target as HTMLInputElement).value) / 1000)
              }}
            />
            <span ref={pct}>{POSTER ? '100%' : '0%'}</span>
          </label>
        </div>
        <p className="hint">滚轮或拖动进度条拆装 · 悬停零件查看标注</p>
      </div>

      <style>{`
        .ev-root { --soft-bg: #f1f0ec; }
        .ev-canvas { position: absolute; inset: 0; }
        .ev-callouts { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .ev-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
        .ev-lines g { transition: opacity .2s; }
        .ev-lines polyline { fill: none; stroke: rgba(29,28,26,.55); stroke-width: 1; vector-effect: non-scaling-stroke; }
        .ev-lines circle { fill: #f6f5f1; stroke: rgba(29,28,26,.7); stroke-width: 1.2; }
        .ev-lines g[data-hot='1'] polyline { stroke: ${C.accent}; stroke-width: 1.6; }
        .ev-lines g[data-hot='1'] circle { fill: ${C.accent}; stroke: ${C.accent}; }
        .ev-label { position: absolute; left: 0; top: 0; pointer-events: auto; cursor: default; white-space: nowrap; will-change: transform;
          display: flex; flex-direction: column; gap: 4px; padding: 2px 0; user-select: none; }
        .ev-label b { font: 600 13px/1.1 var(--sans); color: var(--ink); letter-spacing: .01em; transition: color .2s; }
        .ev-label b em { font: 500 10px/1 var(--mono); font-style: normal; color: var(--ink-3); margin-right: 6px; transition: color .2s; }
        .ev-label span { font: 11px/1.2 var(--mono); color: var(--ink-2); }
        .ev-label[data-hot='1'] b, .ev-label[data-hot='1'] b em { color: ${C.accent}; }
        .ev-dock { gap: 6px; }
        .ev-scrub { display: inline-flex; align-items: center; gap: 10px; padding: 0 10px 0 6px; font: 500 12px/1 var(--mono); color: var(--fg-2); }
        .ev-scrub span { min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: var(--fg); }
        .ev-scrub input { -webkit-appearance: none; appearance: none; width: 150px; height: 18px; background: transparent; cursor: pointer; margin: 0; }
        .ev-scrub input::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--fg) 16%, transparent); }
        .ev-scrub input::-moz-range-track { height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--fg) 16%, transparent); }
        .ev-scrub input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%; background: ${C.accent};
          box-shadow: 0 0 0 3px rgba(255,107,61,.18), 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }
        .ev-scrub input:active::-webkit-slider-thumb { transform: scale(1.15); }
        .ev-scrub input::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: ${C.accent}; }
        .ev-count { font-size: 13px; color: var(--fg-2); }
        @media (max-width: 760px) {
          .ev-label span { display: none; }
          .ev-label b { font-size: 11px; }
          .ev-label b em { display: none; }
          .ev-root .hero-copy p:not(.kicker) { display: none; }
          .ev-count { display: none; }
          .ev-scrub input { width: 84px; }
          .ev-scrub span { display: none; }
        }
      `}</style>
    </div>
  )
}
