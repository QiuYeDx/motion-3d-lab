import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  GLASS_PALETTES,
  createGlassEffect,
  glassMeta,
  glassModes,
  setGlassCell,
  setGlassMode,
  setGlassWindow,
  type GlassMode,
} from './effects/stainedglass'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 彩色玻璃 showcase — a rose with leaves and a bud in front of a rayed sun over two hills, set in a
 * pointed (Gothic) arch in a dark stone wall. The sky is the scene's clear colour (big cobalt panes),
 * the subject gets the smaller panes; light from behind drifts across. Flat, saturated materials and one
 * strong key light give each petal / leaf two or three clear glass tones. The effect (panes, lead,
 * window, wall) lives in ./effects/stainedglass.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const WALL = '#120f14'

const SIZES = [
  { zh: '小', k: 0.74 },
  { zh: '中', k: 1 },
  { zh: '大', k: 1.38 },
]

const SPEC: Record<GlassMode, { glass: string; lead: string }> = {
  cathedral: { glass: '吹制古玻璃 · 厚薄不匀、气泡与拉丝', lead: 'H 形铅条 · 焊点 · 灰绘描线' },
  tiffany: { glass: '乳光玻璃 · 两色流纹', lead: '铜箔包边 · 细焊缝' },
  modern: { glass: '透明压花 + 色片 · 直边几何切割', lead: '细锌条 · 无焊点' },
}

/** the window (CSS px): centre x, bottom y, half width, height — shared by the effect and the scene rig */
function windowFor(w: number, h: number) {
  if (POSTER) {
    const height = h * 0.88
    return { x: w / 2, bottom: h * 0.94, halfWidth: Math.min(height * 0.3, w * 0.4), height }
  }
  if (w < 760) {
    const height = Math.min(h * 0.54, (w * 0.8) / 0.62)
    return { x: w / 2, bottom: 100 + height, halfWidth: Math.min(height * 0.31, w * 0.4), height }
  }
  const height = Math.min(h - 214, 780)
  const halfWidth = height * 0.31
  const x = Math.min(Math.max(w * 0.66, 560 + halfWidth + 40), w - halfWidth - 70)
  return { x, bottom: 104 + height, halfWidth, height }
}

/* ------------------------------------------------------------------ geometry helpers */

const col = (hex: string) => new THREE.Color(hex)

function setColors(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => THREE.Color) {
  const p = geo.attributes.position
  const arr = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i))
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

function leafGeometry(len: number) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.bezierCurveTo(len * 0.28, len * 0.22, len * 0.3, len * 0.7, 0, len)
  s.bezierCurveTo(-len * 0.3, len * 0.7, -len * 0.28, len * 0.22, 0, 0)
  const g = new THREE.ShapeGeometry(s, 24)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    // fold along the midrib and curl the tip back
    p.setZ(i, -Math.abs(x) * 0.55 + Math.pow(y / len, 2) * len * 0.22)
  }
  g.computeVertexNormals()
  const mid = col('#9ad84a')
  const leaf = col('#2f9a46')
  const edge = col('#155f2c')
  setColors(g, (x, y) => {
    const ax = Math.abs(x) / (len * 0.3)
    if (ax < 0.07) return mid
    return leaf.clone().lerp(edge, THREE.MathUtils.smoothstep(ax + y / len * 0.3, 0.5, 1.1))
  })
  return g
}

function hillGeometry(y0: number, amp: number, phase: number, color: string, top: string) {
  const s = new THREE.Shape()
  const W = 2.2
  s.moveTo(-W, -3)
  for (let i = 0; i <= 40; i++) {
    const x = -W + (i / 40) * W * 2
    s.lineTo(x, y0 + Math.sin(x * 1.3 + phase) * amp + Math.sin(x * 2.9 + phase * 2) * amp * 0.3)
  }
  s.lineTo(W, -3)
  s.closePath()
  const g = new THREE.ShapeGeometry(s, 4)
  const a = col(top)
  const b = col(color)
  setColors(g, (_x, y) => a.clone().lerp(b, THREE.MathUtils.smoothstep(y, y0 + amp, y0 - 0.5)))
  return g
}

/* ------------------------------------------------------------------ scene */

/** heart-shaped lobe (rose petal) or pointed sepal from the origin along +y, gently domed */
function lobeGeometry(r: number, kind: 'petal' | 'sepal', base: string, tip: string) {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  if (kind === 'petal') {
    s.bezierCurveTo(r * 0.62, r * 0.12, r * 0.82, r * 0.92, r * 0.3, r * 1.0)
    s.quadraticCurveTo(r * 0.08, r * 1.0, 0, r * 0.86)
    s.quadraticCurveTo(-r * 0.08, r * 1.0, -r * 0.3, r * 1.0)
    s.bezierCurveTo(-r * 0.82, r * 0.92, -r * 0.62, r * 0.12, 0, 0)
  } else {
    s.quadraticCurveTo(r * 0.2, r * 0.5, 0, r)
    s.quadraticCurveTo(-r * 0.2, r * 0.5, 0, 0)
  }
  const g = new THREE.ShapeGeometry(s, 28)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const d = Math.min(1, Math.hypot(x * 1.4, y - r * 0.5) / (r * 0.62))
    p.setZ(i, (1 - d * d) * r * 0.12 - (y / r) * r * 0.05)
  }
  g.computeVertexNormals()
  const a = col(base)
  const b = col(tip)
  setColors(g, (_x, y) => a.clone().lerp(b, THREE.MathUtils.smoothstep(y / r, 0.2, 0.95)))
  return g
}

/** a heraldic (Tudor) rose: red outer petals, green sepals between them, white inner petals, gold heart */
function Rose() {
  const G = useMemo(
    () => ({
      outer: lobeGeometry(0.86, 'petal', '#a3122a', '#e23a52'),
      sepal: lobeGeometry(1.06, 'sepal', '#1f7a35', '#4fb04a'),
      inner: lobeGeometry(0.5, 'petal', '#e9e2d2', '#fffaf0'),
    }),
    [],
  )
  const petals = useRef<(THREE.Group | null)[]>([])
  const t0 = useRef(POSTER ? 3 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    petals.current.forEach((m, i) => {
      if (m) m.rotation.x = Math.sin(t * 1.1 + i * 1.9) * 0.05
    })
  })
  const ring = (n: number, off: number, z: number, geo: THREE.BufferGeometry, key: string, base: number) =>
    Array.from({ length: n }, (_, i) => (
      <group key={key + i} rotation={[0, 0, (i / n) * Math.PI * 2 + off]} position={[0, 0, z]}>
        <group
          ref={(m) => {
            petals.current[base + i] = m
          }}
        >
          <mesh geometry={geo}>
            <meshStandardMaterial vertexColors roughness={0.55} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </group>
    ))
  return (
    <group>
      {ring(5, Math.PI / 5, -0.04, G.sepal, 's', 0)}
      {ring(5, 0, 0, G.outer, 'o', 5)}
      {ring(5, Math.PI / 5, 0.07, G.inner, 'i', 10)}
      <mesh position={[0, 0, 0.12]} scale={[0.19, 0.19, 0.08]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshStandardMaterial color="#f2b01e" roughness={0.45} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[Math.cos((i / 7) * Math.PI * 2) * 0.12, Math.sin((i / 7) * Math.PI * 2) * 0.12, 0.2]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color="#c4581a" roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function Bud() {
  return (
    <group>
      <mesh scale={[0.13, 0.2, 0.13]}>
        <sphereGeometry args={[1, 20, 14]} />
        <meshStandardMaterial color="#d42a45" roughness={0.5} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation={[0, 0, (i - 1) * 0.7]} position={[0, -0.12, 0.02]}>
          <coneGeometry args={[0.05, 0.22, 8]} />
          <meshStandardMaterial color="#2f8a3a" roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

const LEAVES: [number, number, number, number][] = [
  // x, y, z-rotation, length
  [0.04, -1.22, 1.0, 0.62],
  [0.0, -1.42, -0.95, 0.6],
  [0.02, -1.78, 0.8, 0.46],
]

function Window({ rx, ry }: { rx: MotionValue<number>; ry: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const flower = useRef<THREE.Group>(null)
  const rays = useRef<THREE.Group>(null)
  const bud = useRef<THREE.Group>(null)
  const leaves = useRef<(THREE.Mesh | null)[]>([])
  const t0 = useRef(POSTER ? 4 : 0)

  const G = useMemo(() => {
    const stem = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(0.04, -2.3, 0), new THREE.Vector3(-0.05, -1.4, 0.05), new THREE.Vector3(0.06, -0.7, 0.1), new THREE.Vector3(0, -0.2, 0.15)]),
      40,
      0.045,
      10,
    )
    const budStem = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([new THREE.Vector3(-0.03, -1.65, 0.06), new THREE.Vector3(-0.4, -1.45, 0.05), new THREE.Vector3(-0.78, -1.08, 0.0)]),
      24,
      0.03,
      8,
    )
    const ray = new THREE.BufferGeometry()
    ray.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.48, 0, -0.1, 0.48, 0, 0, 1.25, 0, 0, 0.48, 0, 0, 1.25, 0, 0.1, 0.48, 0], 3))
    ray.computeVertexNormals()
    const longRay = ray.clone()
    longRay.scale(1, 1.32, 1)
    return {
      stem,
      budStem,
      ray,
      longRay,
      leaves: LEAVES.map((l) => leafGeometry(l[3])),
      hillBack: hillGeometry(-1.25, 0.16, 0.7, '#3b2a7a', '#7e5fd0'),
      hillFront: hillGeometry(-1.62, 0.12, 2.4, '#14562c', '#55b34a'),
    }
  }, [])

  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    const w = windowFor(size.width, size.height)
    if (rig.current) {
      const cy = w.bottom - w.height / 2
      rig.current.position.set((w.x / size.width - 0.5) * viewport.width, (0.5 - cy / size.height) * viewport.height, 0)
      rig.current.scale.setScalar(((w.height / size.height) * viewport.height) / 4)
    }
    if (flower.current) {
      flower.current.rotation.set(-0.12 + rx.get() + Math.sin(t * 0.5) * 0.05, ry.get() + Math.sin(t * 0.37) * 0.16, Math.sin(t * 0.6) * 0.04)
    }
    if (rays.current) rays.current.rotation.z = -t * 0.06
    if (bud.current) bud.current.rotation.z = 0.7 + Math.sin(t * 0.9 + 1) * 0.08
    leaves.current.forEach((m, i) => {
      if (m) m.rotation.x = 0.35 + Math.sin(t * 1.3 + i * 1.7) * 0.12
    })
  })

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#fff4e6', '#4a3a6a', 0.6]} />
      <directionalLight position={[-3, 4, 6]} intensity={2.7} />
      <directionalLight position={[4, -1, 3]} intensity={0.4} color="#b8c8ff" />
      <group ref={rig}>
        {/* sun with rays */}
        <group position={[0, 1.12, -2]}>
          <mesh>
            <circleGeometry args={[0.4, 64]} />
            <meshBasicMaterial color="#ffc232" />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <circleGeometry args={[0.24, 48]} />
            <meshBasicMaterial color="#fff09a" />
          </mesh>
          <group ref={rays} position={[0, 0, -0.01]}>
            {Array.from({ length: 16 }, (_, i) => (
              <mesh key={i} geometry={i % 2 ? G.ray : G.longRay} rotation={[0, 0, (i / 16) * Math.PI * 2]}>
                <meshBasicMaterial color={i % 2 ? '#ff8a1c' : '#ffcf3a'} side={THREE.DoubleSide} />
              </mesh>
            ))}
          </group>
        </group>
        <mesh geometry={G.hillBack} position={[0, 0, -1.4]}>
          <meshBasicMaterial vertexColors />
        </mesh>
        <mesh geometry={G.hillFront} position={[0, 0, -1.0]}>
          <meshBasicMaterial vertexColors />
        </mesh>
        <group ref={flower} position={[0, -0.22, 0]}>
          <mesh geometry={G.stem}>
            <meshStandardMaterial color="#2a7f37" roughness={0.6} />
          </mesh>
          <mesh geometry={G.budStem}>
            <meshStandardMaterial color="#2a7f37" roughness={0.6} />
          </mesh>
          <group ref={bud} position={[-0.8, -1.02, 0]}>
            <Bud />
          </group>
          {LEAVES.map(([x, y, rz], i) => (
            <group key={i} position={[x, y, 0.06]} rotation={[0, 0, rz]}>
              <mesh
                ref={(m) => {
                  leaves.current[i] = m
                }}
                geometry={G.leaves[i]}
              >
                <meshStandardMaterial vertexColors roughness={0.55} side={THREE.DoubleSide} />
              </mesh>
            </group>
          ))}
          <group position={[0, 0.02, 0.2]} scale={1.05}>
            <Rose />
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function StainedGlass() {
  const [mode, setMode] = useState<GlassMode>('cathedral')
  const [size, setSize] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createGlassEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  // start the background compile for the screen target before the first frame (see Embroidery.tsx)
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)

  useEffect(() => setGlassMode(fx, mode), [fx, mode])
  useEffect(() => setGlassCell(fx, SIZES[size].k), [fx, size])
  useEffect(() => {
    const on = () => setGlassWindow(fx, windowFor(window.innerWidth, window.innerHeight))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fx])

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.007, -1.3, 1.3))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.005, -0.6, 0.6))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, 0, { type: 'spring', velocity: ry.getVelocity(), stiffness: 30, damping: 6 }),
      animate(rx, 0, { type: 'spring', velocity: rx.getVelocity(), stiffness: 40, damping: 8 }),
    ]
  }

  const I = SPEC[mode]
  const label = glassModes.find((m) => m.id === mode)!.label
  const pal = GLASS_PALETTES[mode]

  return (
    <div
      className={`stage sg${split.open ? ' sg-split' : ''}`}
      style={{ background: WALL }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 12], fov: 30 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={glassMeta.background} preload={preload} />
        <Window rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy sg-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Stained Glass · {pal.length} 色玻璃
            </p>
            <h1>
              光从背后
              <br />
              透进来
            </h1>
            <p className="sg-sub">
              画面被切成一片片玻璃：块的边界会贴着轮廓走，每块只取一种颜色、吸附到玻璃色卡；铅条沿接缝焊起来，光从窗后缓缓扫过，照出气泡、拉丝和厚薄。
            </p>
            <div className="sg-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="sg-chart" aria-hidden>
                    {pal.map((p, i) => (
                      <motion.i
                        key={p.hex}
                        className={p.kind ? 'clear' : ''}
                        style={{ background: p.hex }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26, delay: 0.08 + i * 0.02 }}
                      />
                    ))}
                  </div>
                  <p>
                    {I.glass}
                    <br />
                    {I.lead}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={glassModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg sg-cycle" onClick={() => setSize((d) => (d + 1) % SIZES.length)}>
              <span>
                玻璃块 <b>{SIZES[size].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="sg-lbl">玻璃块</span>
              <Seg items={SIZES.map((d, i) => ({ value: i, label: d.zh }))} value={size} onChange={setSize} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="sg-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动玫瑰 · 光从窗后缓缓扫过</p>
      </div>
    </div>
  )
}

const css = `
.sg { cursor: grab; touch-action: none; }
.sg:active { cursor: grabbing; }
.sg canvas { display: block; }
.sg-copy { pointer-events: none !important; }
.sg .hint { transition: opacity .4s; }
.sg-split .hint { opacity: 0; }
.sg-copy .scrim { --soft-bg: ${WALL}; left: -200px; right: -120px; height: 760px; }
.sg-copy .kicker i { background: #e0a43a; box-shadow: 0 0 10px #e0a43a; }
.sg-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.sg-sub { max-width: 400px; }
.sg-spec { margin-top: 24px; min-height: 80px; }
.sg-chart { display: flex; flex-wrap: wrap; gap: 3px; max-width: 420px; }
.sg-chart i {
  width: 16px; height: 22px; border-radius: 8px 8px 2px 2px;
  box-shadow: inset 0 0 0 1.5px rgba(10, 8, 12, .85), 0 0 12px -2px currentColor;
  background-image: linear-gradient(160deg, rgba(255,255,255,.35), rgba(255,255,255,0) 55%) !important;
}
.sg-chart i.clear { background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.45) 0 1px, rgba(255,255,255,0) 1px 4px) !important; }
.sg-spec p { margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.sg-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.sg-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.sg-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .sg-copy { transition: opacity .4s; }
  .sg-split .sg-copy { opacity: 0; }
  .sg-sub { display: none; }
  .sg-copy h1 { font-size: 34px; }
  .sg-spec { margin-top: 12px; min-height: 0; }
  .sg-chart i { width: 12px; height: 16px; }
  .sg .dock .seg { padding: 0 8px; }
  .sg .dock .dock-sep { margin: 0 1px; }
}
`
