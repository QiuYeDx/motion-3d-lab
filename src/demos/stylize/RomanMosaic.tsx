import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  ROMAN_PALETTES,
  createRomanEffect,
  romanMeta,
  romanModes,
  setRomanLight,
  setRomanMode,
  setRomanSize,
  type RomanMode,
} from './effects/roman'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 罗马镶嵌 showcase — an emblema in the manner of a Roman marine floor: a dolphin leaping over a band of
 * running waves, two red mullets below, the field framed by a Greek-key meander and a two-strand guilloche.
 * The frame and the field are a flat, unlit canvas texture (exact colours → crisp courses); the dolphin and
 * the fish are lit 3D meshes so their shading bands give the stones something to follow. The effect itself
 * (courses, stones, glints) lives in ./effects/roman.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const BG = romanMeta.background
const ASPECT = MOBILE ? 0.98 : 1.38

const SIZES = [
  { zh: '小', k: 0.78 },
  { zh: '中', k: 1 },
  { zh: '大', k: 1.32 },
]

const SPEC: Record<RomanMode, { a: string; b: string }> = {
  pompeii: { a: '天然石材 · 3 行描边 · 细石子', b: '赤陶 / 赭石 / 玄武岩 · 石灰灰浆' },
  byzantine: { a: '金箔玻璃铺底 · 宝石色玻璃', b: '石子各自倾斜 · 光扫过时闪烁' },
  ostia: { a: '只用黑白两种石子', b: '黑色剪影 · 白石描出细节' },
}

/** the emblema (CSS px): centre x/y and width */
function panelFor(w: number, h: number) {
  if (POSTER) {
    const width = Math.min(w * 0.86, h * 0.84 * ASPECT)
    return { x: w / 2, y: h / 2, width }
  }
  if (w < 760) {
    const width = Math.min(w - 24, h * 0.5 * ASPECT)
    return { x: w / 2, y: 86 + width / ASPECT / 2, width }
  }
  const width = Math.min(w - 640, (h - 210) * ASPECT, 1100)
  const x = Math.min(Math.max(w * 0.64, 560 + width / 2), w - width / 2 - 56)
  return { x, y: 92 + (h - 190) / 2, width }
}

/* ------------------------------------------------------------------ canvas textures */

const INK = '#23201e'
const CREAM = '#ede3cc'

/** frame (meander + guilloche) and the field with its water lines */
function panelTexture() {
  // drawn in a 1600-wide coordinate space onto a smaller CPU-backed canvas: the stones sample the texture
  // only at their centres, so resolution doesn't matter, and a small CPU canvas uploads quickly
  const W = 1600
  const H = Math.round(W / ASPECT)
  const cv = document.createElement('canvas')
  const k = 1100 / W
  cv.width = Math.round(W * k)
  cv.height = Math.round(H * k)
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.scale(k, k)
  g.fillStyle = INK
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#f2ece0'
  g.fillRect(16, 16, W - 32, H - 32)

  // --- Greek key (simple running meander) on each side, corner squares
  const s = 15 // stroke = gap
  const u = 2 * s
  const band0 = 30
  const bandH = 3 * u + s // centreline span 3 units
  const meander = (len: number) => {
    // returns a polyline for a horizontal band of length len (x along, y down 0..3 units)
    const n = Math.max(2, Math.round(len / (4 * u)))
    const k = len / (n * 4 * u)
    const pts: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const x0 = i * 4
      pts.push([x0, 3], [x0, 0], [x0 + 3, 0], [x0 + 3, 2], [x0 + 1, 2], [x0 + 1, 3])
    }
    pts.push([n * 4, 3])
    return pts.map(([x, y]) => [x * u * k, y * u] as [number, number])
  }
  g.strokeStyle = INK
  g.lineWidth = s
  g.lineJoin = 'miter'
  g.lineCap = 'square'
  const side = (x: number, y: number, len: number, rot: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.beginPath()
    meander(len).forEach(([px, py], i) => (i ? g.lineTo(px, py + s / 2) : g.moveTo(px, py + s / 2)))
    g.stroke()
    g.restore()
  }
  const inner = band0 + bandH + s
  const corner = inner - band0
  side(band0 + corner, band0, W - 2 * (band0 + corner), 0)
  side(W - band0 - corner, H - band0, W - 2 * (band0 + corner), Math.PI)
  side(band0, H - band0 - corner, H - 2 * (band0 + corner), -Math.PI / 2)
  side(W - band0, band0 + corner, H - 2 * (band0 + corner), Math.PI / 2)
  // corner squares: a black square with a red lozenge
  for (const [cx, cy] of [
    [band0, band0],
    [W - band0 - corner, band0],
    [band0, H - band0 - corner],
    [W - band0 - corner, H - band0 - corner],
  ]) {
    g.fillStyle = INK
    g.fillRect(cx + 4, cy + 4, corner - 8, corner - 8)
    g.fillStyle = '#a9472a'
    g.beginPath()
    const m = corner / 2
    g.moveTo(cx + m, cy + 18)
    g.lineTo(cx + corner - 18, cy + m)
    g.lineTo(cx + m, cy + corner - 18)
    g.lineTo(cx + 18, cy + m)
    g.closePath()
    g.fill()
  }

  // --- two-strand guilloche on black
  const gA = inner + 10
  const gH = 92
  g.fillStyle = INK
  g.fillRect(gA, gA, W - 2 * gA, H - 2 * gA)
  const fieldA = gA + gH
  const strand = (len: number, colours: string[]) => {
    const n = Math.max(3, Math.round(len / 150))
    const P = len / n
    const amp = gH * 0.27
    const draw = (phase: number, cols: string[], from: number, to: number) => {
      const steps = 24
      ;[30, 19, 8].forEach((w, wi) => {
        g.strokeStyle = cols[wi]
        g.lineWidth = w
        g.lineCap = 'round'
        g.beginPath()
        for (let j = 0; j <= steps; j++) {
          const x = from + ((to - from) * j) / steps
          const y = gH / 2 + Math.sin((x / P) * Math.PI * 2 + phase) * amp
          if (j) g.lineTo(x, y)
          else g.moveTo(x, y)
        }
        g.stroke()
      })
    }
    // alternate which strand is on top every half period
    for (let i = 0; i < n * 2; i++) {
      const a = (i * P) / 2,
        b = ((i + 1) * P) / 2
      const top = i % 2
      draw(top ? 0 : Math.PI, top ? ['#5a6f7e', '#9fb2bc', '#eef0ea'] : colours, a - 2, b + 2)
      draw(top ? Math.PI : 0, top ? colours : ['#5a6f7e', '#9fb2bc', '#eef0ea'], a - 2, b + 2)
    }
    // white eyes in the loops
    g.fillStyle = '#efe6d2'
    for (let i = 0; i < n; i++) {
      g.beginPath()
      g.arc((i + 0.25) * P, gH / 2, 8, 0, Math.PI * 2)
      g.fill()
      g.beginPath()
      g.arc((i + 0.75) * P, gH / 2, 8, 0, Math.PI * 2)
      g.fill()
    }
  }
  const warm = ['#8a2f1d', '#c9733c', '#f0cf8a']
  const gside = (x: number, y: number, len: number, rot: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    strand(len, warm)
    g.restore()
  }
  gside(gA + gH, gA, W - 2 * (gA + gH), 0)
  gside(W - gA - gH, H - gA, W - 2 * (gA + gH), Math.PI)
  gside(gA, H - gA - gH, H - 2 * (gA + gH), -Math.PI / 2)
  gside(W - gA, gA + gH, H - 2 * (gA + gH), Math.PI / 2)

  // --- the field
  g.fillStyle = INK
  g.fillRect(fieldA - 2, fieldA - 2, W - 2 * fieldA + 4, H - 2 * fieldA + 4)
  g.fillStyle = CREAM
  g.fillRect(fieldA + 10, fieldA + 10, W - 2 * fieldA - 20, H - 2 * fieldA - 20)
  // water lines: short wavy dashes, denser toward the waves
  const fx0 = fieldA + 30,
    fx1 = W - fieldA - 30
  const fy0 = fieldA + 30,
    fy1 = H - fieldA - 30
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let row = 0; row < 6; row++) {
    const y = fy0 + (fy1 - fy0) * (0.16 + row * 0.11)
    const dens = 0.3 + row * 0.08
    for (let x = fx0 + rnd() * 90; x < fx1 - 60; x += 110 + rnd() * 120) {
      if (rnd() > dens) continue
      const L = 34 + rnd() * 46
      g.strokeStyle = row % 3 === 2 ? '#4f7682' : '#6f9096'
      g.lineWidth = 15
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + L / 2, y - 7, x + L, y)
      g.stroke()
    }
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, field: { x0: fieldA / W, x1: 1 - fieldA / W, y0: fieldA / H, y1: 1 - fieldA / H } }
}

/** a band of running waves (Vitruvian scroll); repeats horizontally */
function waveTexture() {
  const W = 512,
    H = 160
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = CREAM
  g.fillRect(0, 0, W, H)
  const n = 1
  const P = W / n
  const yb = H * 0.78,
    yt = H * 0.12
  g.fillStyle = '#30495a'
  g.beginPath()
  g.moveTo(0, H)
  g.lineTo(0, yb)
  for (let i = 0; i < n; i++) {
    const x0 = i * P
    const r = P * 0.17
    const cx = x0 + P * 0.62,
      cy = yt + r
    g.bezierCurveTo(x0 + P * 0.32, yb, x0 + P * 0.3, yt, cx, yt)
    // curl: over the top and down inside
    g.arc(cx, cy, r, -Math.PI / 2, Math.PI * 0.75, false)
    g.arc(cx - r * 0.18, cy + r * 0.05, r * 0.55, Math.PI * 0.75, -Math.PI * 0.4, true)
    g.quadraticCurveTo(cx + r * 1.6, cy + r * 0.6, x0 + P, yb)
  }
  g.lineTo(W, H)
  g.closePath()
  g.fill()
  // a light line along the base of the band
  g.fillStyle = '#7fa3b0'
  g.fillRect(0, H * 0.86, W, H * 0.05)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

/* ------------------------------------------------------------------ dolphin + fish */

const BODY_KEYS: [number, number][] = [
  [0, 0.04],
  [0.06, 0.07],
  [0.1, 0.17],
  [0.17, 0.27],
  [0.33, 0.32],
  [0.5, 0.29],
  [0.7, 0.17],
  [0.86, 0.075],
  [1, 0.04],
]
function bodyR(s: number) {
  for (let i = 0; i < BODY_KEYS.length - 1; i++) {
    const [a, ra] = BODY_KEYS[i]
    const [b, rb] = BODY_KEYS[i + 1]
    if (s <= b) {
      const t = (s - a) / (b - a)
      return ra + (rb - ra) * (0.5 - 0.5 * Math.cos(Math.PI * t))
    }
  }
  return BODY_KEYS[BODY_KEYS.length - 1][1]
}

function dolphinGeometry(L: number) {
  const NS = 80,
    NR = 32
  const pos: number[] = []
  const colr: number[] = []
  const idx: number[] = []
  const back = new THREE.Color('#1f3245')
  const side = new THREE.Color('#57718a')
  const stripe = new THREE.Color('#a8492a')
  const belly = new THREE.Color('#f4ecdc')
  for (let i = 0; i <= NS; i++) {
    const s = i / NS
    const r = bodyR(s) * 1.3
    const spine = 0.15 * Math.sin(Math.PI * s) - Math.max(0, 0.09 - s) * 0.6
    const melon = Math.exp(-Math.pow((s - 0.13) / 0.05, 2)) * 0.06
    for (let j = 0; j <= NR; j++) {
      const th = (j / NR) * Math.PI * 2
      const sn = Math.sin(th)
      const y = spine + (sn > 0 ? sn * (r + melon) : sn * r * 0.92)
      const z = Math.cos(th) * r * 0.8
      pos.push((0.5 - s) * L, y, z)
      const v = sn + 0.18 * Math.sin(s * Math.PI * 2.2 + 0.4)
      const c = v > 0.3 ? back : v > -0.02 ? side : v > -0.2 && s > 0.14 && s < 0.84 ? stripe : belly
      colr.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j
      const b = a + NR + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function shapeGeo(pts: [number, number][], curve = true) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  if (curve) {
    for (let i = 1; i + 1 < pts.length; i += 2) s.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
  } else pts.slice(1).forEach(([x, y]) => s.lineTo(x, y))
  s.closePath()
  return new THREE.ShapeGeometry(s, 16)
}

function Dolphin({ rx, ry }: { rx: MotionValue<number>; ry: MotionValue<number> }) {
  const L = 2.75
  const G = useMemo(
    () => ({
      body: dolphinGeometry(L),
      dorsal: shapeGeo([
        [0.3, 0],
        [0.12, 0.22],
        [-0.26, 0.44],
        [-0.12, 0.16],
        [-0.3, 0],
      ]),
      pectoral: shapeGeo([
        [0.1, 0],
        [-0.05, -0.12],
        [-0.36, -0.3],
        [-0.12, -0.04],
        [-0.12, 0.04],
      ]),
      flukes: shapeGeo([
        [0.08, 0],
        [-0.1, 0.12],
        [-0.36, 0.42],
        [-0.22, 0.12],
        [-0.17, 0],
        [-0.22, -0.12],
        [-0.36, -0.42],
        [-0.1, -0.12],
        [0.08, 0],
      ]),
    }),
    [],
  )
  const root = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const fin = useRef<THREE.Group>(null)
  const t0 = useRef(POSTER ? 2.4 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    // a slow leap: rise and dip with the body pitched along the path
    const ph = t * 0.55
    if (root.current) {
      root.current.position.set(Math.sin(ph * 0.5) * 0.15, 0.32 + Math.sin(ph) * 0.2, 0.35)
      root.current.rotation.set(rx.get() + 0.05, ry.get() + Math.sin(ph * 0.5) * 0.12, Math.cos(ph) * 0.22 + 0.08)
    }
    if (tail.current) tail.current.rotation.set(0, Math.sin(t * 1.6) * 0.5, Math.sin(t * 1.6 + 0.6) * 0.18)
    if (fin.current) fin.current.rotation.z = -0.1 + Math.sin(t * 1.6 + 1.2) * 0.12
  })
  const mat = (c: string) => <meshPhongMaterial color={c} shininess={28} specular="#3a3a3a" side={THREE.DoubleSide} />
  return (
    <group ref={root}>
      <mesh geometry={G.body}>
        <meshPhongMaterial vertexColors shininess={28} specular="#3a3a3a" />
      </mesh>
      <mesh geometry={G.dorsal} position={[-0.02, 0.5, 0]}>
        {mat('#1f3245')}
      </mesh>
      <group ref={fin} position={[0.6, -0.14, 0.24]}>
        <mesh geometry={G.pectoral}>{mat('#2b4256')}</mesh>
      </group>
      <group ref={tail} position={[-L / 2 + 0.02, 0, 0]}>
        <mesh geometry={G.flukes}>{mat('#1f3245')}</mesh>
      </group>
      {/* eye */}
      <mesh position={[L * 0.5 - 0.37, 0.14, 0.2]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshPhongMaterial color="#f3ead6" shininess={28} specular="#3a3a3a" />
      </mesh>
      <mesh position={[L * 0.5 - 0.365, 0.14, 0.235]}>
        <sphereGeometry args={[0.026, 16, 12]} />
        <meshPhongMaterial color="#0d0c0c" shininess={28} specular="#3a3a3a" />
      </mesh>
    </group>
  )
}

function Fish({ phase, color }: { phase: number; color: string }) {
  const g = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Mesh>(null)
  const G = useMemo(
    () =>
      shapeGeo([
        [0, 0],
        [-0.12, 0.1],
        [-0.2, 0.14],
        [-0.16, 0],
        [-0.2, -0.14],
        [-0.12, -0.1],
        [0, 0],
      ]),
    [],
  )
  const t0 = useRef(POSTER ? 2 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current + phase
    if (g.current) {
      g.current.position.y = Math.sin(t * 0.8) * 0.06
      g.current.rotation.z = Math.cos(t * 0.8) * 0.12
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 4) * 0.5
  })
  return (
    <group ref={g}>
      <mesh scale={[0.36, 0.14, 0.1]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshPhongMaterial color={color} shininess={28} specular="#3a3a3a" />
      </mesh>
      <mesh position={[0.02, -0.04, 0.075]} scale={[0.28, 0.035, 0.03]}>
        <sphereGeometry args={[1, 24, 8]} />
        <meshPhongMaterial color="#e9c25c" shininess={28} specular="#3a3a3a" />
      </mesh>
      <mesh position={[0.24, 0.03, 0.07]}>
        <sphereGeometry args={[0.024, 12, 8]} />
        <meshPhongMaterial color="#141212" shininess={28} specular="#3a3a3a" />
      </mesh>
      <mesh ref={tail} geometry={G} position={[-0.32, 0, 0]}>
        <meshPhongMaterial color={color} shininess={28} specular="#3a3a3a" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

const PANEL_W = 6

type Panel = ReturnType<typeof panelTexture> & { wave: THREE.CanvasTexture }

function Emblema({ rx, ry }: { rx: MotionValue<number>; ry: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const rig = useRef<THREE.Group>(null)
  const warm = useRef<THREE.Mesh>(null)
  // the emblema is built a few frames after mount, not in the frame that creates the WebGL context
  const [P, setP] = useState<Panel | null>(null)
  useEffect(() => {
    let made: Panel | null = null
    const id = setTimeout(() => {
      const w = waveTexture()
      w.repeat.set(2.6, 1)
      made = { ...panelTexture(), wave: w }
      setP(made)
    }, 60)
    return () => {
      clearTimeout(id)
      made?.tex.dispose()
      made?.wave.dispose()
    }
  }, [])
  // compile its materials in parallel (KHR_parallel_shader_compile) a frame later and keep it hidden until
  // they are linked, so no frame blocks on a synchronous shader link; upload the textures meanwhile
  useLayoutEffect(() => {
    const g = rig.current
    if (!g || !P) return
    let alive = true
    g.visible = false
    const r = requestAnimationFrame(() => {
      const grp = rig.current
      if (!alive || !grp) return
      grp.visible = true
      gl.compileAsync(grp, camera, scene)
        .catch(() => {})
        .then(() => {
          if (!alive || !rig.current) return
          if (warm.current) warm.current.visible = false
          rig.current.visible = true
        })
      grp.visible = false
    })
    const t1 = setTimeout(() => gl.initTexture(P.tex), 40)
    const t2 = setTimeout(() => gl.initTexture(P.wave), 80)
    return () => {
      alive = false
      cancelAnimationFrame(r)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [gl, camera, scene, P])
  const t0 = useRef(0)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t0.current += dt
    const r = panelFor(size.width, size.height)
    if (rig.current) {
      rig.current.position.set((r.x / size.width - 0.5) * viewport.width, (0.5 - r.y / size.height) * viewport.height, 0)
      rig.current.scale.setScalar(((r.width / size.width) * viewport.width) / PANEL_W)
    }
    if (P) P.wave.offset.x = POSTER ? 0.3 : -t0.current * 0.035
  })
  const PH = PANEL_W / ASPECT
  const f = P?.field ?? { x0: 0, x1: 1, y0: 0, y1: 1 }
  const fw = (f.x1 - f.x0) * PANEL_W
  const fh = (f.y1 - f.y0) * PH
  const waveH = fh * 0.22
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#fff4e2', '#5d5a66', 0.55]} />
      <directionalLight position={[-3, 5, 7]} intensity={2.9} />
      <directionalLight position={[4, -2, 3]} intensity={0.35} color="#c8d6ff" />
      <group ref={rig}>
        {P && (
          <>
            {/* shares its program with the lib's normal pass, so that one compiles in parallel too */}
            <mesh ref={warm} scale={1e-4}>
              <planeGeometry />
              <meshNormalMaterial />
            </mesh>
            <mesh>
              <planeGeometry args={[PANEL_W, PH]} />
              <meshBasicMaterial map={P.tex} toneMapped={false} />
            </mesh>
            {/* wave band along the bottom of the field */}
            <mesh position={[0, -fh / 2 + waveH / 2 + 0.06, 0.01]}>
              <planeGeometry args={[fw - 0.12, waveH]} />
              <meshBasicMaterial map={P.wave} toneMapped={false} />
            </mesh>
            <group position={[0, 0.05, 0]} scale={0.98}>
              <Dolphin rx={rx} ry={ry} />
            </group>
            <group position={[1.15, -fh / 2 + waveH + 0.42, 0.2]} rotation={[0, Math.PI, 0]} scale={0.9}>
              <Fish phase={0} color="#c4553a" />
            </group>
            <group position={[-1.35, -fh / 2 + waveH + 0.3, 0.2]} rotation={[0, Math.PI, 0]} scale={0.75}>
              <Fish phase={2.1} color="#b8442f" />
            </group>
          </>
        )}
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function RomanMosaic() {
  const [mode, setMode] = useState<RomanMode>('pompeii')
  const [size, setSize] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createRomanEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)

  useEffect(() => setRomanMode(fx, mode), [fx, mode])
  useEffect(() => setRomanSize(fx, SIZES[size].k * (MOBILE ? 0.8 : 1)), [fx, size])

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const lightIdle = useRef<number | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    // the glinting light follows a hovering mouse, and drifts back to its own sweep when idle
    if (e.pointerType === 'mouse' && !drag.current) {
      setRomanLight(fx, { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight })
      if (lightIdle.current) clearTimeout(lightIdle.current)
      lightIdle.current = window.setTimeout(() => setRomanLight(fx, null), 2200)
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.008, -1.4, 1.4))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.006, -0.8, 0.8))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, 0, { type: 'spring', velocity: ry.getVelocity(), stiffness: 26, damping: 6 }),
      animate(rx, 0, { type: 'spring', velocity: rx.getVelocity(), stiffness: 36, damping: 8 }),
    ]
  }
  useEffect(() => () => void (lightIdle.current && clearTimeout(lightIdle.current)), [])

  const I = SPEC[mode]
  const label = romanModes.find((m) => m.id === mode)!.label
  const pal = ROMAN_PALETTES[mode]

  return (
    <div
      className={`stage rm${split.open ? ' rm-split' : ''}`}
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 12], fov: 30 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={BG} preload={preload} />
        <Emblema rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy rm-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Roman Mosaic · Opus vermiculatum
            </p>
            <h1>
              石子顺着
              <br />
              轮廓一圈圈排
            </h1>
            <p className="rm-sub">
              镶嵌师把石子沿着轮廓和明暗分界一行行铺开（andamento），离轮廓远了再改成水平直排。每颗石子只取一种天然石色，有大小、缺角和灰缝；光扫过时，倾斜的石面会闪一下。
            </p>
            <div className="rm-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="rm-chart" aria-hidden>
                    {pal.map((p, i) => (
                      <motion.i
                        key={p.hex}
                        title={p.name}
                        className={p.kind === 2 ? 'gold' : p.kind === 1 ? 'glass' : ''}
                        style={{ background: p.hex, rotate: ((i * 37) % 9) - 4 }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26, delay: 0.08 + i * 0.02 }}
                      />
                    ))}
                  </div>
                  <p>
                    {I.a}
                    <br />
                    {I.b}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={romanModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg rm-cycle" onClick={() => setSize((d) => (d + 1) % SIZES.length)}>
              <span>
                石块 <b>{SIZES[size].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="rm-lbl">石块大小</span>
              <Seg items={SIZES.map((d, i) => ({ value: i, label: d.zh }))} value={size} onChange={setSize} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="rm-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动海豚 · 移动鼠标让石面反光</p>
      </div>
    </div>
  )
}

const css = `
.rm { cursor: grab; touch-action: none; }
.rm:active { cursor: grabbing; }
.rm canvas { display: block; }
.rm-copy { pointer-events: none !important; }
.rm .hint { transition: opacity .4s; background: rgba(236, 228, 211, .86); padding: 6px 10px; border-radius: 999px; }
.rm-split .hint { opacity: 0; }
.rm-copy .scrim { --soft-bg: ${BG}; left: -200px; right: -120px; height: 760px; }
.rm-copy .kicker i { background: #a9512f; box-shadow: 0 0 10px rgba(169, 81, 47, .5); }
.rm-copy h1 { font-size: clamp(40px, 4.6vw, 62px); }
.rm-sub { max-width: 410px; }
.rm-spec { margin-top: 24px; min-height: 84px; }
.rm-chart { display: flex; flex-wrap: wrap; gap: 4px; max-width: 400px; }
.rm-chart i {
  width: 17px; height: 17px; border-radius: 3px 4px 3px 5px;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), 0 1px 0 rgba(255,255,255,.5), 0 2px 4px -2px rgba(40,30,20,.5);
  background-image: radial-gradient(circle at 30% 25%, rgba(255,255,255,.28), rgba(255,255,255,0) 55%) !important;
}
.rm-chart i.glass { background-image: linear-gradient(150deg, rgba(255,255,255,.45), rgba(255,255,255,0) 45%) !important; }
.rm-chart i.gold { background-image: linear-gradient(135deg, rgba(255,250,220,.75), rgba(255,255,255,0) 40%, rgba(120,80,10,.25)) !important; }
.rm-spec p { margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.rm-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.rm-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.rm-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .rm-copy { transition: opacity .4s; }
  .rm-split .rm-copy { opacity: 0; }
  .rm-sub { display: none; }
  .rm-copy h1 { font-size: 34px; }
  .rm-spec { margin-top: 12px; min-height: 0; }
  .rm-chart i { width: 13px; height: 13px; }
  .rm .dock .seg { padding: 0 8px; }
  .rm .dock .dock-sep { margin: 0 1px; }
}
`
