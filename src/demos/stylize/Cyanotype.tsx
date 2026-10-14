import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  createCyanotypeEffect,
  cyanotypeMeta,
  cyanotypeModes,
  cyanotypeProgress,
  developCyanotype,
  setCyanotypeExposure,
  setCyanotypeFrame,
  setCyanotypeMode,
  type CyanotypeMode,
} from './effects/cyanotype'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 蓝晒 showcase — a botanist's table seen from above: two fern fronds, ginkgo, maple and willow leaves, a
 * daisy, a glass apothecary bottle with a cosmos, scissors and a handwritten specimen label. Flat, lacy
 * silhouettes are what a photogram (植物标本 mode, à la Anna Atkins) is made of; the strong low key light
 * gives the photographic modes a clear value structure.
 * The table is hidden from the normal pass (scene.onBeforeRender checks overrideMaterial), so its coverage
 * is empty and only the specimens count as "objects lying on the paper" for the photogram.
 * The effect lives in ./effects/cyanotype.ts; the brushed print area is placed beside the copy.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CYCLE_EVERY = 12000

const EXPO = [
  { zh: '短', v: -0.65 },
  { zh: '标准', v: 0 },
  { zh: '长', v: 0.7 },
]

const SPEC: Record<CyanotypeMode, { tool: string; note: string }> = {
  classic: { tool: '底片接触印', note: '普鲁士蓝 · 高光留出纸白' },
  photogram: { tool: '实物投影', note: '标本直接压在药纸上 · 挡住的地方留白' },
  toned: { tool: '茶染', note: '单宁调色 · 蓝转紫褐 · 纸色变暖' },
}

const STAGES = ['曝光中', '水洗显影', '氧化加深']

/* ------------------------------------------------------------------ textures */

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** leaf texture with veins; bbox maps the ShapeGeometry's (shape-space) uvs onto the canvas */
function veinTexture(kind: 'pinnate' | 'fan' | 'palmate', base: string, vein: string, bbox: [number, number, number, number], origin: [number, number]) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const x = c.getContext('2d')!
  x.fillStyle = base
  x.fillRect(0, 0, S, S)
  const [x0, y0, x1, y1] = bbox
  const toPx = (u: number, v: number): [number, number] => [((u - x0) / (x1 - x0)) * S, (1 - (v - y0) / (y1 - y0)) * S]
  const [ox, oy] = toPx(origin[0], origin[1])
  x.strokeStyle = vein
  x.lineCap = 'round'
  if (kind === 'fan') {
    for (let i = 0; i < 46; i++) {
      const a = Math.PI * (0.16 + (0.68 * i) / 45)
      x.lineWidth = 1.2
      x.beginPath()
      x.moveTo(ox, oy)
      x.lineTo(ox + Math.cos(a) * S * 1.2, oy - Math.sin(a) * S * 1.2)
      x.stroke()
    }
  } else if (kind === 'palmate') {
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i - 2) * 0.72
      x.lineWidth = 3.5
      x.beginPath()
      x.moveTo(ox, oy)
      const ex = ox + Math.cos(a) * S * 0.62
      const ey = oy - Math.sin(a) * S * 0.62
      x.lineTo(ex, ey)
      x.stroke()
      for (let k = 1; k < 5; k++) {
        const t = k / 5
        const px = ox + (ex - ox) * t
        const py = oy + (ey - oy) * t
        for (const sgn of [-1, 1]) {
          x.lineWidth = 1.4
          x.beginPath()
          x.moveTo(px, py)
          x.lineTo(px + Math.cos(a + sgn * 0.8) * 30, py - Math.sin(a + sgn * 0.8) * 30)
          x.stroke()
        }
      }
    }
  } else {
    // midrib along +x (shape space) from the origin, laterals toward the tip
    const [tx, ty] = toPx(x1, (y0 + y1) / 2)
    x.lineWidth = 4
    x.beginPath()
    x.moveTo(ox, oy)
    x.lineTo(tx, ty)
    x.stroke()
    for (let k = 1; k < 12; k++) {
      const t = k / 12
      const px = ox + (tx - ox) * t
      const py = oy + (ty - oy) * t
      for (const sgn of [-1, 1]) {
        x.lineWidth = 1.6
        x.beginPath()
        x.moveTo(px, py)
        x.quadraticCurveTo(px + 20, py + sgn * 25, px + 35, py + sgn * 65)
        x.stroke()
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.repeat.set(1 / (x1 - x0), 1 / (y1 - y0))
  t.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0))
  return t
}

function labelTexture() {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 300 // label text must stay legible
  const x = c.getContext('2d')!
  x.fillStyle = '#f3ecd9'
  x.fillRect(0, 0, 640, 300)
  x.strokeStyle = '#3b2f25'
  x.lineWidth = 4
  x.strokeRect(16, 16, 608, 268)
  x.lineWidth = 1.5
  x.strokeRect(26, 26, 588, 248)
  x.fillStyle = '#2a211b'
  x.font = 'italic 600 50px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'
  x.fillText('Polypodium vulgare', 46, 116)
  x.font = 'italic 34px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive'
  x.fillText('No. 27 · Kent, 1843', 46, 186)
  x.font = '600 22px Georgia, serif'
  x.fillText('BRITISH ALGAE & FERNS', 46, 246)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ------------------------------------------------------------------ specimens */

// Every scene material is MeshStandardMaterial + map + DoubleSide, so the whole table compiles ONE program
// (first-load stall budget); plain-coloured parts use this 1×1 white map.
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
WHITE.needsUpdate = true
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ map: WHITE, side: THREE.DoubleSide, roughness: 0.8, ...p })
function Mat(p: { color: string; roughness?: number; metalness?: number; map?: THREE.Texture }) {
  return <meshStandardMaterial map={p.map ?? WHITE} side={THREE.DoubleSide} color={p.color} roughness={p.roughness ?? 0.8} metalness={p.metalness ?? 0} />
}

/** a lanceolate pinna along +x with lobed margins */
function pinnaGeo(len: number, w: number, lobes: number) {
  const s = new THREE.Shape()
  const N = 28
  s.moveTo(0, 0)
  const prof = (t: number) => w * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - 0.2 * t) * (0.72 + 0.28 * Math.abs(Math.sin(t * lobes * Math.PI)))
  for (let i = 1; i <= N; i++) {
    const t = i / N
    s.lineTo(t * len, prof(t))
  }
  for (let i = N - 1; i >= 1; i--) {
    const t = i / N
    s.lineTo(t * len, -prof(t) * 0.92)
  }
  s.closePath()
  return new THREE.ShapeGeometry(s, 2)
}

/** fern frond in the XY plane (rachis along +y), merged into one geometry */
function frondGeo(R: number, pairs: number, Lmax: number, bend: number, seed: number) {
  const rnd = mulberry(seed)
  const parts: THREE.BufferGeometry[] = []
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    pts.push(new THREE.Vector3(bend * t * t, t * R, 0))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  for (let i = 0; i < pairs; i++) {
    const t = 0.1 + (0.88 * i) / pairs
    const len = Lmax * Math.pow(1 - t, 0.75) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6 + 0.25)))
    if (len < 0.05) continue
    const p = curve.getPoint(t)
    const tan = curve.getTangent(t)
    const ang = Math.atan2(tan.y, tan.x)
    for (const side of [-1, 1]) {
      const g = pinnaGeo(len, len * 0.2, 5 + Math.round(rnd() * 3))
      // pinnae point toward the tip, alternate slightly along the rachis
      g.rotateZ(ang - side * (0.98 + (rnd() - 0.5) * 0.12))
      g.translate(p.x, p.y + (side > 0 ? 0.03 : 0), 0)
      parts.push(g)
    }
  }
  // terminal tip
  const tip = pinnaGeo(Lmax * 0.28, Lmax * 0.05, 4)
  const pe = curve.getPoint(0.97)
  tip.rotateZ(Math.atan2(curve.getTangent(0.97).y, curve.getTangent(0.97).x))
  tip.translate(pe.x, pe.y, 0)
  parts.push(tip)
  const leaf = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!
  parts.forEach((g) => g.dispose())
  const stem = new THREE.TubeGeometry(curve, 40, 0.022, 6, false)
  return { leaf, stem }
}

function Fern({ R, pairs, Lmax, bend, seed, t, phase, color }: { R: number; pairs: number; Lmax: number; bend: number; seed: number; t: React.RefObject<number>; phase: number; color: string }) {
  const G = useMemo(() => frondGeo(R, pairs, Lmax, bend, seed), [R, pairs, Lmax, bend, seed])
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const k = t.current ?? 0
    // a breath of air lifts the tip a little and sways the frond in the plane of the table
    if (ref.current) ref.current.rotation.set(0.05 + Math.sin(k * 0.8 + phase) * 0.035, 0, Math.sin(k * 0.55 + phase) * 0.03)
  })
  return (
    <group ref={ref}>
      <mesh geometry={G.leaf} castShadow receiveShadow>
        <Mat color={color} roughness={0.8} />
      </mesh>
      <mesh geometry={G.stem} castShadow>
        <Mat color="#7f9a5a" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Ginkgo({ color }: { color: string }) {
  const M = useMemo(() => {
    const s = new THREE.Shape()
    const r = 0.62
    s.moveTo(0, 0)
    const N = 60
    for (let i = 0; i <= N; i++) {
      const a = Math.PI * (0.17 + (0.66 * i) / N)
      const notch = Math.exp(-Math.pow((a - Math.PI / 2) / 0.05, 2)) * 0.32
      const rr = r * (1 - notch) * (1 + 0.025 * Math.sin(a * 37))
      s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    s.closePath()
    const geo = new THREE.ShapeGeometry(s, 2)
    const map = veinTexture('fan', color, 'rgba(70, 60, 10, .55)', [-0.55, 0, 0.55, 0.64], [0, 0])
    return { geo, mat: std({ map }) }
  }, [color])
  return (
    <group>
      <mesh geometry={M.geo} material={M.mat} castShadow receiveShadow />
      <mesh position={[0, -0.28, 0]} castShadow>
        <boxGeometry args={[0.025, 0.56, 0.02]} />
        <Mat color="#6b6a2a" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Maple({ color }: { color: string }) {
  const M = useMemo(() => {
    const s = new THREE.Shape()
    const R = 0.72
    const N = 220
    for (let i = 0; i <= N; i++) {
      const th = -Math.PI / 2 + (i / N) * Math.PI * 2
      const lobe = Math.pow(Math.abs(Math.cos(((th - Math.PI / 2) * 5) / 2)), 0.55)
      const notch = 1 - 0.75 * Math.exp(-Math.pow((th + Math.PI / 2) / 0.35, 2))
      const rr = R * (0.42 + 0.58 * lobe) * notch * (1 + 0.035 * Math.sin(th * 46))
      const p = [Math.cos(th) * rr, Math.sin(th) * rr + 0.12]
      if (i === 0) s.moveTo(p[0], p[1])
      else s.lineTo(p[0], p[1])
    }
    const geo = new THREE.ShapeGeometry(s, 1)
    const map = veinTexture('palmate', color, 'rgba(60, 20, 10, .5)', [-0.8, -0.65, 0.8, 0.9], [0, 0.0])
    return { geo, mat: std({ map }) }
  }, [color])
  return (
    <group>
      <mesh geometry={M.geo} material={M.mat} castShadow receiveShadow />
      <mesh position={[0, -0.3, 0]} rotation={[0, 0, 0.08]} castShadow>
        <boxGeometry args={[0.022, 0.6, 0.02]} />
        <Mat color="#5e3a22" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Willow({ len, color }: { len: number; color: string }) {
  const M = useMemo(() => {
    const geo = pinnaGeo(len, len * 0.13, 0)
    const map = veinTexture('pinnate', color, 'rgba(30, 50, 20, .45)', [0, -len * 0.13, len, len * 0.13], [0, 0])
    return { geo, mat: std({ map }) }
  }, [len, color])
  return <mesh geometry={M.geo} material={M.mat} castShadow receiveShadow />
}

function petalsGeo(n: number, len: number, w: number, notch = true) {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.bezierCurveTo(len * 0.3, w, len * 0.85, w * 1.1, len, notch ? w * 0.35 : 0)
    if (notch) {
      s.lineTo(len * 0.94, 0)
      s.lineTo(len, -w * 0.35)
    }
    s.bezierCurveTo(len * 0.85, -w * 1.1, len * 0.3, -w, 0, 0)
    const g = new THREE.ShapeGeometry(s, 6)
    g.rotateZ((i / n) * Math.PI * 2 + (i % 2) * 0.05)
    parts.push(g.toNonIndexed())
    g.dispose()
  }
  return mergeGeometries(parts)!
}

function Daisy({ petal, center, n = 14, len = 0.36 }: { petal: string; center: string; n?: number; len?: number }) {
  const geo = useMemo(() => petalsGeo(n, len, len * 0.16), [n, len])
  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <Mat color={petal} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[len * 0.26, len * 0.3, 0.06, 24]} />
        <Mat color={center} roughness={0.9} />
      </mesh>
    </group>
  )
}

const RIM_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`
const RIM_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 4.0);
  // thin glass: a faint body tint plus bright grazing edges
  gl_FragColor = vec4(mix(vec3(0.84, 0.93, 0.9), vec3(1.0, 1.0, 0.98) * 1.3, f), 0.1 + f * 0.5);
}
`

function Bottle({ t }: { t: React.RefObject<number> }) {
  const M = useMemo(() => {
    const prof = [
      [0.0, 0.0],
      [0.4, 0.0],
      [0.46, 0.05],
      [0.47, 0.85],
      [0.42, 1.05],
      [0.2, 1.22],
      [0.15, 1.3],
      [0.15, 1.62],
      [0.19, 1.66],
      [0.19, 1.72],
      [0.15, 1.74],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const geo = new THREE.LatheGeometry(prof, 48)
    const rim = new THREE.ShaderMaterial({ vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const pts = [new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.02, 1.0, 0), new THREE.Vector3(0.1, 1.8, 0.15), new THREE.Vector3(0.24, 2.3, 0.5)]
    const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.022, 6, false)
    const leaf = pinnaGeo(0.55, 0.09, 0)
    return { geo, rim, stem, leaf }
  }, [])
  const sprig = useRef<THREE.Group>(null)
  useFrame(() => {
    const k = t.current ?? 0
    if (sprig.current) sprig.current.rotation.set(Math.sin(k * 0.9) * 0.04, 0, Math.sin(k * 0.7 + 1) * 0.05)
  })
  return (
    <group>
      <group ref={sprig}>
        <mesh geometry={M.stem} castShadow>
          <Mat color="#8da866" roughness={0.8} />
        </mesh>
        <mesh geometry={M.leaf} position={[0.05, 1.55, 0.02]} rotation={[0.3, 0.2, 0.7]} castShadow>
          <Mat color="#a9c47e" roughness={0.8} />
        </mesh>
        <mesh geometry={M.leaf} position={[0.1, 1.95, 0.05]} rotation={[0.2, -0.4, 2.3]} scale={0.8} castShadow>
          <Mat color="#a9c47e" roughness={0.8} />
        </mesh>
        <group position={[0.24, 2.31, 0.5]} rotation={[-1.0, 0.15, -0.25]}>
          <Daisy petal="#f0ece4" center="#c9902c" n={9} len={0.42} />
        </group>
      </group>
      <mesh geometry={M.geo} material={M.rim} renderOrder={3} />
    </group>
  )
}

function Scissors() {
  const M = useMemo(() => {
    const blade = new THREE.Shape()
    blade.moveTo(-0.15, -0.05)
    blade.lineTo(1.25, -0.012)
    blade.quadraticCurveTo(1.32, 0.0, 1.25, 0.03)
    blade.lineTo(-0.15, 0.08)
    blade.closePath()
    const bg = new THREE.ExtrudeGeometry(blade, { depth: 0.025, bevelEnabled: false })
    const steel = std({ color: '#5d6166', roughness: 0.32, metalness: 0.55 })
    const brass = std({ color: '#8a6a32', roughness: 0.4, metalness: 0.6 })
    return { bg, steel, brass }
  }, [])
  return (
    <group>
      {[-1, 1].map((s) => (
        <group key={s} rotation={[0, 0, s * 0.16]}>
          <mesh geometry={M.bg} material={M.steel} position={[0, 0, s > 0 ? 0.0 : 0.026]} castShadow />
          <mesh material={M.steel} position={[-0.5, s * 0.12, 0.012]} castShadow>
            <torusGeometry args={[0.17, 0.035, 10, 36]} />
          </mesh>
          <mesh material={M.steel} position={[-0.25, s * 0.06, 0.012]} rotation={[0, 0, s * 0.35]} castShadow>
            <boxGeometry args={[0.24, 0.05, 0.03]} />
          </mesh>
        </group>
      ))}
      <mesh material={M.brass} position={[0, 0.0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.08, 16]} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

const FLAT: [number, number, number] = [-Math.PI / 2, 0, 0]

function Table({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const table = useRef<THREE.Mesh>(null)
  const t = useRef(POSTER ? 4 : 0)
  const label = useMemo(labelTexture, [])

  // the table is the "paper", not an object on it: keep it out of the normal / coverage pass
  useEffect(() => {
    const prev = scene.onBeforeRender
    scene.onBeforeRender = () => {
      if (table.current) table.current.visible = !scene.overrideMaterial
    }
    return () => {
      scene.onBeforeRender = prev
    }
  }, [scene])

  useFrame((_, raw) => {
    if (!POSTER && !REDUCED) t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(0.88, vw / 8.4, vh / 5.9) : mobile ? Math.min(0.6, vw / 8.6) : Math.min(1, (vw * 0.6) / 7.2, (vh * 0.78) / 5.0)
    const x = POSTER ? 0 : mobile ? -0.1 * k : vw * 0.14
    const y = POSTER ? 0 : mobile ? vh * 0.13 : 0.05
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(x, 0, -y * 1.15)
    }
    if (spin.current) spin.current.rotation.set(rx.get(), Math.sin(t.current * 0.12) * 0.1 + ry.get(), 0)
  })

  return (
    <>
      <hemisphereLight args={['#fffaf0', '#8c8474', 0.75]} />
      <directionalLight
        position={[-5, 8, 3.5]}
        intensity={2.9}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      <group ref={rig}>
        <group ref={spin}>
          <mesh ref={table} rotation={FLAT} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <Mat color="#6c6556" roughness={0.95} />
          </mesh>
          {/* big fern, lower left → upper right */}
          <group position={[-2.3, 0.05, 1.55]} rotation={[0, -0.95, 0]}>
            <group rotation={FLAT}>
              <Fern R={3.6} pairs={19} Lmax={0.62} bend={-0.35} seed={3} t={t} phase={0} color="#a3c27a" />
            </group>
          </group>
          {/* smaller fern from the right */}
          <group position={[2.9, 0.06, 0.95]} rotation={[0, 0.85, 0]}>
            <group rotation={FLAT}>
              <Fern R={2.6} pairs={15} Lmax={0.48} bend={0.28} seed={9} t={t} phase={1.7} color="#b2cc86" />
            </group>
          </group>
          <group position={[0.15, 0.03, 0.95]} rotation={[0, 0.5, 0]}>
            <group rotation={FLAT}>
              <Ginkgo color="#e6da78" />
            </group>
          </group>
          <group position={[0.95, 0.035, 1.75]} rotation={[0, -0.6, 0]} scale={0.8}>
            <group rotation={FLAT}>
              <Ginkgo color="#eadf8a" />
            </group>
          </group>
          <group position={[-0.75, 0.04, -1.25]} rotation={[0, 0.35, 0]}>
            <group rotation={FLAT}>
              <Maple color="#e8a46c" />
            </group>
          </group>
          <group position={[2.1, 0.03, -0.25]} rotation={[0, 2.5, 0]}>
            <group rotation={FLAT}>
              <Willow len={1.3} color="#bcd494" />
            </group>
          </group>
          <group position={[2.35, 0.03, 0.15]} rotation={[0, 2.85, 0]}>
            <group rotation={FLAT}>
              <Willow len={1.05} color="#c4d99c" />
            </group>
          </group>
          <group position={[-2.0, 0.04, -0.35]} rotation={FLAT}>
            <Daisy petal="#f2eee6" center="#c48a2a" />
          </group>
          <group position={[1.2, 0, -1.05]}>
            <Bottle t={t} />
          </group>
          <group position={[-0.45, 0.02, 2.05]} rotation={[0, 0.35, 0]}>
            <group rotation={FLAT}>
              <Scissors />
            </group>
          </group>
          <mesh position={[2.05, 0.012, 2.05]} rotation={[-Math.PI / 2, 0, 0.1]} castShadow receiveShadow>
            <planeGeometry args={[1.45, 0.68]} />
            <Mat color="#ffffff" map={label} roughness={0.9} />
          </mesh>
        </group>
      </group>
    </>
  )
}

/** "曝光中 → 水洗 → 氧化" status, driven from the effect's own clock (no React render per frame) */
function DevStatus({ fx, el }: { fx: StylizeEffect; el: React.RefObject<HTMLDivElement | null> }) {
  const last = useRef(-1)
  useFrame(() => {
    const box = el.current
    if (!box) return
    const { p, stage } = cyanotypeProgress(fx)
    const bar = box.querySelector<HTMLElement>('b')
    if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`
    if (stage !== last.current) {
      last.current = stage
      box.style.opacity = stage === 3 ? '0' : '1'
      const lab = box.querySelector<HTMLElement>('span')
      if (lab && stage < 3) lab.textContent = STAGES[stage]
    }
  })
  return null
}

/** brushed print area: beside the copy on desktop, above it on phones, centred for posters */
function FramePlacer({ fx }: { fx: StylizeEffect }) {
  const size = useThree((s) => s.size)
  useEffect(() => {
    const w = size.width
    const h = size.height
    if (POSTER) setCyanotypeFrame(fx, 0.5, 0.515, 0.45, 0.41, 28)
    else if (w < 760) {
      // between the chrome (top 72px) and the copy (bottom ≈ 300px)
      const top = 84 / h
      const bot = Math.min(0.48, 330 / h)
      setCyanotypeFrame(fx, 0.5, 1 - (top + (1 - bot - top) / 2), 0.5 - 40 / w, (1 - bot - top) / 2, 18)
    } else {
      const left = Math.min(0.42, (Math.min(560, w * 0.4) + 40) / w)
      const right = 1 - 48 / w
      const top = 78 / h
      const bot = 112 / h
      setCyanotypeFrame(fx, (left + right) / 2, (bot + 1 - top) / 2, (right - left) / 2, (1 - top - bot) / 2, 30)
    }
  }, [fx, size.width, size.height])
  return null
}

/* ------------------------------------------------------------------ page */

export default function Cyanotype() {
  const [mode, setMode] = useState<CyanotypeMode>('classic')
  const [expoI, setExpoI] = useState(1)
  const fx = useMemo(() => {
    const f = createCyanotypeEffect()
    if (!POSTER && !REDUCED) developCyanotype(f)
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.66)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const dev = useRef<HTMLDivElement>(null)

  useEffect(() => setCyanotypeMode(fx, mode), [fx, mode])
  useEffect(() => setCyanotypeExposure(fx, EXPO[expoI].v), [fx, expoI])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => cyanotypeModes[(cyanotypeModes.findIndex((o) => o.id === m) + 1) % cyanotypeModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.004, -0.6, 0.6))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.002, -0.12, 0.12))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600, min: -0.6, max: 0.6, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.12, max: 0.12, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const S = SPEC[mode]
  const label = cyanotypeModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage cy${split.open ? ' cy-split' : ''}`}
      style={{ background: cyanotypeMeta.background }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 8.2, 4.6], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0.1)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={cyanotypeMeta.background} />
        <Table ry={ry} rx={rx} />
        <FramePlacer fx={fx} />
        <DevStatus fx={fx} el={dev} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy cy-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Cyanotype · Sun Print, 1842
            </p>
            <h1>
              阳光晒出的
              <br />
              普鲁士蓝
            </h1>
            <p className="cy-sub">铁盐药液刷在厚水彩纸上，压上底片或植物标本放到太阳下，再用清水一冲：见光处变成深蓝，挡住的地方留出纸白。刷痕、水渍和纸纹都是工艺本身的痕迹。</p>
            <div className="cy-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.tool}</b>
                  {S.note}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="cy-dev" ref={dev} style={{ opacity: 0 }}>
              <span>曝光中</span>
              <i>
                <b />
              </i>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={cyanotypeModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg cy-cycle" onClick={() => setExpoI((d) => (d + 1) % EXPO.length)}>
              <span>
                曝光 <b>{EXPO[expoI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="cy-lab">曝光</span>
              <Seg items={EXPO.map((d, i) => ({ value: i, label: d.zh }))} value={expoI} onChange={setExpoI} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg cy-btn" onClick={() => developCyanotype(fx)} aria-label="重新曝光显影">
            <span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <circle cx="7" cy="7" r="2.6" fill="currentColor" />
                <path d="M7 1v1.6M7 11.4V13M1 7h1.6M11.4 7H13M2.8 2.8l1.1 1.1M10.1 10.1l1.1 1.1M2.8 11.2l1.1-1.1M10.1 3.9l1.1-1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {MOBILE ? '晒' : '重新晒'}
            </span>
          </button>
          <button className="seg cy-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="cy-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动桌面 · 闲置时自动换工艺</p>
      </div>
    </div>
  )
}

const css = `
.cy { cursor: grab; touch-action: none; }
.cy:active { cursor: grabbing; }
.cy canvas { display: block; }
.cy-copy { pointer-events: none !important; --soft-bg: #ece6d6; }
.cy-copy .scrim { opacity: 0; transition: opacity .5s; }
.cy-split .cy-copy .scrim { opacity: .92; }
.cy-copy .kicker { color: #5d6a78; }
.cy-copy .kicker i { background: #1f4e8c; }
.cy-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #16314f; }
.cy-sub { max-width: 400px; color: #44505c !important; }
.cy-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #44505c; }
.cy-spec span { display: inline-flex; align-items: center; gap: 10px; }
.cy-spec b { font-weight: 600; color: #16314f; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(31, 78, 140, .35); }
.cy-dev { display: flex; align-items: center; gap: 10px; margin-top: 14px; height: 14px; font: 500 11px/1 var(--mono); color: #5d6a78; transition: opacity .6s; }
.cy-dev i { position: relative; width: 120px; height: 2px; border-radius: 2px; background: rgba(31, 78, 140, .16); overflow: hidden; }
.cy-dev b { position: absolute; inset: 0; background: #1f4e8c; transform-origin: left; transform: scaleX(0); }
.cy-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.cy-btn span, .cy-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.cy-btn svg { color: #1f4e8c; }
.cy-cycle b { font-weight: 600; color: var(--fg); }
.cy .hint { transition: opacity .4s; color: #44505c; padding: 4px 10px; border-radius: 999px; background: rgba(236, 230, 214, .78); }
.cy-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .cy-copy { transition: opacity .4s; }
  .cy-split .cy-copy { opacity: 0; }
  .cy-sub { display: none; }
  .cy-copy h1 { font-size: 32px; }
  .cy-spec { margin-top: 10px; }
  .cy-dev { margin-top: 8px; }
  .cy .dock .seg { padding: 0 8px; }
  .cy .dock .dock-sep { margin: 0 1px; }
}
`
