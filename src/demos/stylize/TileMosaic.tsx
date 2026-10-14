import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  DMC_PALETTE,
  LEGO_PALETTE,
  SMALTI_PALETTE,
  createMosaicEffect,
  mosaicMeta,
  mosaicModes,
  setMosaicCell,
  setMosaicMode,
  type MosaicMode,
} from './effects/mosaic'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 材料拼贴 showcase — a toy rocket bobbing past a ringed planet on a navy "patch" of space: big flat
 * shapes in saturated colours, so it still reads at ~40 cells across. The effect lives in ./effects/mosaic.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CELLS = MOBILE
  ? [
      { zh: '小', css: 8 },
      { zh: '中', css: 11 },
      { zh: '大', css: 16 },
    ]
  : [
      { zh: '小', css: 10 },
      { zh: '中', css: 14 },
      { zh: '大', css: 20 },
    ]

const INFO: Record<MosaicMode, { spec: string; chart: string[]; bg: string }> = {
  lego: { spec: '1×1 圆点板 · 同色相邻并成 1×2', chart: LEGO_PALETTE, bg: '#f2efe9' },
  stitch: { spec: '14 目 Aida 布 · 背景留白不绣', chart: DMC_PALETTE, bg: '#f1ece1' },
  tile: { spec: '玻璃马赛克 · 釉面高光与勾缝', chart: SMALTI_PALETTE, bg: '#e6e0d4' },
  led: { spec: 'RGB 三色灯珠 · 光晕溢出 · 刷新带', chart: ['#ff2a2a', '#2aff5a', '#2a6bff'], bg: '#0b0c10' },
}

/* ------------------------------------------------------------------ scene */

function starShape(r1: number, r2: number) {
  const s = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? r2 : r1
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  s.closePath()
  return s
}

const lathe = (pts: [number, number][], seg = 48) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
  )

const STARS: [number, number, number, number][] = [
  [1.75, 2.0, -1.2, 0.42],
  [-0.5, 2.3, -1.6, 0.3],
  [2.55, -0.5, -1.4, 0.3],
  [-2.2, 1.2, -1.5, 0.38],
  [0.7, -2.3, -1.4, 0.28],
]

function Space({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const rocket = useRef<THREE.Group>(null)
  const flame = useRef<THREE.Group>(null)
  const planet = useRef<THREE.Group>(null)
  const moon = useRef<THREE.Mesh>(null)
  const stars = useRef<(THREE.Mesh | null)[]>([])

  const G = useMemo(
    () => ({
      body: lathe([
        [0, -0.95],
        [0.38, -0.95],
        [0.5, -0.55],
        [0.54, 0.0],
        [0.5, 0.45],
        [0.44, 0.62],
        [0, 0.62],
      ]),
      nose: lathe([
        [0, 0.6],
        [0.45, 0.6],
        [0.38, 0.92],
        [0.22, 1.18],
        [0, 1.32],
      ]),
      star: new THREE.ExtrudeGeometry(starShape(1, 0.45), { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }),
    }),
    [],
  )

  useFrame((state, raw) => {
    const t = state.clock.elapsedTime
    void raw
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = POSTER ? Math.min(1.1, vh / 6.4) : mobile ? Math.min(0.92, vw / 6.6) : Math.min(1.08, vh / 6.6, vw / 11)
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.18, mobile && !POSTER ? vh * 0.15 : 0, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get() + Math.sin(t * 0.4) * 0.05, ry.get() + Math.sin(t * 0.3) * 0.35, 0)
    if (rocket.current) {
      rocket.current.position.set(0.6 + Math.sin(t * 0.7) * 0.1, 0.35 + Math.sin(t * 1.5) * 0.16, 0.8)
      rocket.current.rotation.set(0, Math.sin(t * 0.5) * 0.5, -0.5 + Math.sin(t * 1.1) * 0.08)
    }
    if (flame.current) {
      const f = 1 + Math.sin(t * 23) * 0.12 + Math.sin(t * 37) * 0.08
      flame.current.scale.set(1 + Math.sin(t * 19) * 0.06, f, 1 + Math.sin(t * 19) * 0.06)
    }
    if (planet.current) planet.current.rotation.y = t * 0.25
    if (moon.current) moon.current.position.set(Math.cos(t * 0.6) * 1.75, Math.sin(t * 0.6) * 0.45, Math.sin(t * 0.6) * 1.2)
    stars.current.forEach((m, i) => {
      if (!m) return
      const s = STARS[i][3] * (0.85 + 0.2 * Math.sin(t * 2.2 + i * 1.7))
      m.scale.setScalar(s)
      m.rotation.z = Math.sin(t * 0.8 + i) * 0.25
    })
  })

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[-4, 5, 6]} intensity={2.3} />
      <directionalLight position={[4, -2, 3]} intensity={0.35} />
      <group ref={rig}>
        {/* the navy patch of sky */}
        <mesh position={[0, 0, -2.6]}>
          <circleGeometry args={[3.3, 96]} />
          <meshBasicMaterial color="#26307a" />
        </mesh>
        {STARS.map(([x, y, z], i) => (
          <mesh
            key={i}
            ref={(m) => {
              stars.current[i] = m
            }}
            geometry={G.star}
            position={[x, y, z]}
          >
            <meshStandardMaterial color="#ffd23a" roughness={0.5} />
          </mesh>
        ))}
        <group ref={spin}>
          <group ref={planet} position={[-1.3, -1.05, -0.8]} rotation={[0.35, 0, 0.32]} scale={0.85}>
            <mesh>
              <sphereGeometry args={[1.05, 64, 40]} />
              <meshStandardMaterial color="#ff7a3c" roughness={0.7} />
            </mesh>
            <mesh rotation={[0, 0, 0]} scale={[1, 0.22, 1]} position={[0, 0.25, 0]}>
              <sphereGeometry args={[1.06, 64, 16, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16]} />
              <meshStandardMaterial color="#ffb347" roughness={0.7} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.12]}>
              <torusGeometry args={[1.62, 0.16, 16, 96]} />
              <meshStandardMaterial color="#ffe14d" roughness={0.6} />
            </mesh>
            <mesh ref={moon}>
              <sphereGeometry args={[0.24, 32, 20]} />
              <meshStandardMaterial color="#c8b6ff" roughness={0.7} />
            </mesh>
          </group>
          <group ref={rocket} scale={1.3}>
            <mesh geometry={G.body}>
              <meshStandardMaterial color="#ffffff" roughness={0.45} />
            </mesh>
            <mesh geometry={G.nose}>
              <meshStandardMaterial color="#ff2e3f" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.12, 0.52]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.1, 40]} />
              <meshStandardMaterial color="#35c2ff" roughness={0.2} />
            </mesh>
            <mesh position={[0, 0.12, 0.56]}>
              <torusGeometry args={[0.26, 0.06, 12, 40]} />
              <meshStandardMaterial color="#ff2e3f" roughness={0.45} />
            </mesh>
            {[0, 1, 2].map((i) => (
              <group key={i} rotation={[0, (i * Math.PI * 2) / 3 + 0.4, 0]}>
                <mesh position={[0.56, -0.68, 0]} rotation={[0, 0, 0.22]}>
                  <boxGeometry args={[0.36, 0.6, 0.09]} />
                  <meshStandardMaterial color="#ff2e3f" roughness={0.45} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, -1.03, 0]}>
              <cylinderGeometry args={[0.26, 0.32, 0.18, 32]} />
              <meshStandardMaterial color="#4a4f63" roughness={0.5} />
            </mesh>
            <group ref={flame} position={[0, -1.12, 0]}>
              <mesh position={[0, -0.42, 0]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.27, 0.85, 32]} />
                <meshBasicMaterial color="#ffb21e" />
              </mesh>
              <mesh position={[0, -0.28, 0.02]} rotation={[Math.PI, 0, 0]}>
                <coneGeometry args={[0.15, 0.5, 24]} />
                <meshBasicMaterial color="#fff27a" />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function TileMosaic() {
  const [mode, setMode] = useState<MosaicMode>('lego')
  const [cell, setCell] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(createMosaicEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const [grid, setGrid] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => setMosaicMode(fx, mode), [fx, mode])
  useEffect(() => setMosaicCell(fx, CELLS[cell].css), [fx, cell])
  useEffect(() => {
    const on = () => setGrid({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

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
    ry.set(ry.get() + (e.clientX - d.x) * 0.008)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.005, -0.6, 0.6))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 650 }),
      // tilt eases home after the throw
      animate(rx, 0, { type: 'spring', velocity: rx.getVelocity(), stiffness: 60, damping: 12 }),
    ]
  }

  // in compare mode the copy sits over the (light) original render, so keep the light theme
  const dark = mode === 'led' && !split.open
  const I = INFO[mode]
  const label = mosaicModes.find((m) => m.id === mode)!.label
  const cs = CELLS[cell].css
  const cols = Math.ceil(grid.w / cs)
  const rows = Math.ceil(grid.h / cs)

  return (
    <div
      className={`stage mo${dark ? ' mo-dark' : ''}${split.open ? ' mo-split' : ''}`}
      style={{ background: I.bg, ['--mo-bg' as string]: split.open ? INFO.lego.bg : I.bg }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 10], fov: 35 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={mosaicMeta.background} />
        <Space rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy mo-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Tile Mosaic · {cols}×{rows} 格
            </p>
            <h1>
              一格一格，
              <br />
              拼出来的画面
            </h1>
            <p className="mo-sub">
              每格先取色，再吸附到真实色卡 —— 乐高 {LEGO_PALETTE.length} 色、DMC 绣线 {DMC_PALETTE.length} 色、玻璃马赛克 {SMALTI_PALETTE.length} 色；最后按同一个光源补上凸点、线股、釉面或发光管。
            </p>
            <div className="mo-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="mo-chart">
                    {I.chart.map((c, i) => (
                      <motion.i
                        key={c + i}
                        style={{ background: c }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26, delay: 0.1 + i * 0.018 }}
                      />
                    ))}
                    <span>{mode === 'led' ? `P${cs}` : `${I.chart.length} 色`}</span>
                  </div>
                  <p>{I.spec}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={mosaicModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg mo-cycle" onClick={() => setCell((d) => (d + 1) % CELLS.length)}>
              <span>
                格 <b>{CELLS[cell].zh}</b>
              </span>
            </button>
          ) : (
            <Seg items={CELLS.map((d, i) => ({ value: i, label: d.zh }))} value={cell} onChange={setCell} />
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="mo-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动火箭和星球 · 格子大小可调</p>
      </div>
    </div>
  )
}

const css = `
.mo { cursor: grab; touch-action: none; transition: background .7s; }
.mo:active { cursor: grabbing; }
.mo canvas { display: block; }
.mo-dark { --fg: #f4f2ee; --fg-2: rgba(244, 242, 238, .66); --glass: rgba(30, 32, 40, .55); --glass-line: rgba(255,255,255,.1); }
.mo .overlay { transition: color .6s; }
.mo-copy { pointer-events: none !important; }
.mo .hint { transition: opacity .4s; }
.mo-split .hint { opacity: 0; }
.mo-copy .scrim { --soft-bg: var(--mo-bg); left: -200px; right: -120px; height: 760px; transition: opacity .6s; }
.mo-copy .kicker i { background: #e3000b; }
.mo-copy h1 { font-size: clamp(38px, 4.4vw, 60px); }
.mo-sub { max-width: 410px; }
.mo-spec { margin-top: 24px; min-height: 52px; }
.mo-chart { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; max-width: 460px; }
.mo-chart i {
  width: 12px; height: 12px; border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.35);
}
.mo-chart span { margin-left: 8px; font: 600 11.5px/1 var(--mono); color: var(--fg); }
.mo-spec p { margin: 10px 0 0; font: 500 12px/1.5 var(--mono); color: var(--fg-2); }
.mo-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.mo-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .mo-copy { transition: opacity .4s; }
  .mo-split .mo-copy { opacity: 0; }
  .mo-sub { display: none; }
  .mo-copy h1 { font-size: 34px; }
  .mo-spec { margin-top: 14px; min-height: 0; }
  .mo-chart { max-width: 300px; }
  .mo-chart i { width: 10px; height: 10px; }
  .mo .dock .seg { padding: 0 8px; }
  .mo .dock .dock-sep { margin: 0 1px; }
}
`
