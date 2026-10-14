import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { createSketchEffect, setSketchBoil, setSketchDensity, setSketchMode, sketchMeta, sketchModes, type SketchMode } from './effects/sketch'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 素描排线 showcase — a still life (rangefinder camera, cup & saucer, pear, a pencil) on a slow turntable
 * under one hard key light, so every surface lands clearly in a tone band: paper-white, single hatch,
 * cross-hatch or dense. The effect lives in ./effects/sketch.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const DENS = [
  { zh: '疏', v: 0.74 },
  { zh: '中', v: 1 },
  { zh: '密', v: 1.38 },
]

const SPEC: Record<SketchMode, { tool: string; paper: string; bg: string }> = {
  pencil: { tool: '石墨 2B', paper: '米色素描纸 · 4 层排线', bg: '#f4f1ea' },
  pen: { tool: '针管笔 0.3', paper: '硬边排线 · 不晕染', bg: '#f8f6f0' },
  charcoal: { tool: '柳木炭条', paper: '擦抹调子 · 粗边', bg: '#ebe5d9' },
  blueprint: { tool: '白色绘图笔', paper: '蓝晒图纸 · 坐标网格', bg: '#1d4c8f' },
}

/* ------------------------------------------------------------------ props */

function lathe(pts: [number, number][], seg = 64) {
  return new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
  )
}

function RangefinderCamera() {
  const silver = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dcdad4', roughness: 0.32 }), [])
  const black = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e1e1e', roughness: 0.55 }), [])
  const leather = useMemo(() => new THREE.MeshStandardMaterial({ color: '#34322f', roughness: 0.9 }), [])
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c2433', roughness: 0.06 }), [])
  return (
    <group position={[-0.55, 0.52, -0.1]} rotation={[0, 0.42, 0]}>
      <RoundedBox args={[1.9, 1.04, 0.62]} radius={0.09} smoothness={4} material={silver} castShadow receiveShadow />
      <RoundedBox args={[1.94, 0.6, 0.66]} radius={0.05} smoothness={3} position={[0, -0.08, 0]} material={leather} castShadow receiveShadow />
      {/* lens */}
      <group position={[0.12, -0.08, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.05, 0]} material={black} castShadow>
          <cylinderGeometry args={[0.43, 0.43, 0.1, 64]} />
        </mesh>
        <mesh position={[0, 0.3, 0]} material={silver} castShadow receiveShadow>
          <cylinderGeometry args={[0.36, 0.38, 0.42, 64]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={black} castShadow>
          <cylinderGeometry args={[0.395, 0.395, 0.12, 36]} />
        </mesh>
        <mesh position={[0, 0.53, 0]} material={black} castShadow>
          <cylinderGeometry args={[0.37, 0.36, 0.06, 64]} />
        </mesh>
        <mesh position={[0, 0.565, 0]} material={glass}>
          <cylinderGeometry args={[0.27, 0.27, 0.02, 64]} />
        </mesh>
      </group>
      {/* windows, dials, shoe */}
      <mesh position={[-0.62, 0.3, 0.315]} material={glass}>
        <boxGeometry args={[0.36, 0.2, 0.03]} />
      </mesh>
      <mesh position={[0.66, 0.3, 0.315]} material={glass}>
        <boxGeometry args={[0.18, 0.16, 0.03]} />
      </mesh>
      <mesh position={[0.5, 0.57, -0.02]} material={silver} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.1, 40]} />
      </mesh>
      <mesh position={[0.5, 0.63, -0.02]} material={black}>
        <cylinderGeometry args={[0.14, 0.17, 0.03, 40]} />
      </mesh>
      <mesh position={[0.78, 0.56, 0.14]} material={silver} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.09, 24]} />
      </mesh>
      <mesh position={[-0.62, 0.58, -0.02]} material={black} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.12, 40]} />
      </mesh>
      <mesh position={[-0.05, 0.545, -0.02]} material={black} castShadow>
        <boxGeometry args={[0.32, 0.05, 0.26]} />
      </mesh>
      <mesh position={[0.97, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} material={silver}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
      </mesh>
      <mesh position={[-0.97, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} material={silver}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 16]} />
      </mesh>
    </group>
  )
}

function CupAndSaucer() {
  const G = useMemo(
    () => ({
      saucer: lathe([
        [0, 0],
        [0.48, 0],
        [0.62, 0.05],
        [0.74, 0.1],
        [0.75, 0.125],
        [0.71, 0.12],
        [0.58, 0.08],
        [0.3, 0.055],
        [0, 0.055],
      ]),
      cup: lathe([
        [0, 0],
        [0.22, 0],
        [0.26, 0.03],
        [0.35, 0.3],
        [0.4, 0.58],
        [0.415, 0.66],
        [0.385, 0.665],
        [0.37, 0.6],
        [0.32, 0.32],
        [0.25, 0.08],
        [0, 0.08],
      ]),
    }),
    [],
  )
  const china = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.22, side: THREE.DoubleSide }), [])
  return (
    <group position={[1.3, 0, -0.85]} rotation={[0, -0.5, 0]}>
      <mesh geometry={G.saucer} material={china} castShadow receiveShadow />
      <group position={[0, 0.055, 0]}>
        <mesh geometry={G.cup} material={china} castShadow receiveShadow />
        <mesh position={[0, 0.56, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.37, 48]} />
          <meshStandardMaterial color="#3a2317" roughness={0.15} />
        </mesh>
        <mesh position={[0.4, 0.37, 0]} rotation={[0, 0, -Math.PI / 2]} material={china} castShadow>
          <torusGeometry args={[0.15, 0.045, 16, 32, Math.PI]} />
        </mesh>
      </group>
    </group>
  )
}

function Pear() {
  const geo = useMemo(
    () =>
      lathe([
        [0, 0],
        [0.22, 0.02],
        [0.36, 0.1],
        [0.43, 0.25],
        [0.42, 0.42],
        [0.35, 0.58],
        [0.26, 0.72],
        [0.21, 0.85],
        [0.17, 0.98],
        [0.1, 1.07],
        [0, 1.09],
      ]),
    [],
  )
  return (
    <group position={[0.95, 0, 0.95]} rotation={[0.1, 0, -0.12]}>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color="#cdb65a" roughness={0.55} />
      </mesh>
      <mesh position={[0.03, 1.17, 0]} rotation={[0, 0, -0.35]} castShadow>
        <cylinderGeometry args={[0.022, 0.028, 0.22, 10]} />
        <meshStandardMaterial color="#4f3822" roughness={0.8} />
      </mesh>
      <mesh position={[0.17, 1.17, 0.02]} rotation={[0.2, 0.2, 0.5]} scale={[0.2, 0.025, 0.09]} castShadow>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#6f8a3a" roughness={0.6} />
      </mesh>
    </group>
  )
}

function Pencil() {
  return (
    <group position={[-0.35, 0.065, 1.38]} rotation={[0, -0.28, Math.PI / 2]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.065, 0.065, 1.5, 6]} />
        <meshStandardMaterial color="#e3b23a" roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.065, 0.2, 6]} />
        <meshStandardMaterial color="#e8cfa2" roughness={0.8} flatShading />
      </mesh>
      <mesh position={[0, 0.975, 0]}>
        <coneGeometry args={[0.02, 0.05, 12]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.4} />
      </mesh>
      <mesh position={[0, -0.8, 0]} castShadow>
        <cylinderGeometry args={[0.068, 0.068, 0.1, 20]} />
        <meshStandardMaterial color="#c9c7c1" roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.9, 0]} castShadow>
        <cylinderGeometry args={[0.064, 0.064, 0.1, 20]} />
        <meshStandardMaterial color="#e48c8c" roughness={0.7} />
      </mesh>
    </group>
  )
}

function StillLife({ rx, ry }: { rx: MotionValue<number>; ry: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const st = useRef({ t: 0, auto: POSTER ? -0.35 : 0.2 })

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    s.t += dt
    s.auto += dt * 0.16
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = POSTER ? Math.min(1.3, vh / 3.7) : mobile ? Math.min(1.1, vw / 4.9) : Math.min(1.3, vh / 3.85, vw / 8.2)
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.15, POSTER ? 0.15 : mobile ? vh * 0.16 : 0.2, 0)
    }
    if (spin.current) {
      spin.current.rotation.set(rx.get(), s.auto + ry.get(), 0)
    }
  })

  return (
    <>
      <ambientLight intensity={0.26} />
      <directionalLight
        position={[-4.2, 6.5, 3.4]}
        intensity={3.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-4.5}
        shadow-camera-right={4.5}
        shadow-camera-top={4.5}
        shadow-camera-bottom={-4.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[5, 2, -4]} intensity={0.55} />
      <group ref={rig}>
        <group ref={spin}>
          <mesh position={[0, -0.09, 0]} receiveShadow>
            <cylinderGeometry args={[2.2, 2.24, 0.18, 96]} />
            <meshStandardMaterial color="#f3eee5" roughness={0.9} />
          </mesh>
          <RangefinderCamera />
          <CupAndSaucer />
          <Pear />
          <Pencil />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function PencilSketch() {
  const [mode, setMode] = useState<SketchMode>('pencil')
  const [dens, setDens] = useState(1)
  const [boil, setBoil] = useState(true)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(createSketchEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)

  useEffect(() => setSketchMode(fx, mode), [fx, mode])
  useEffect(() => setSketchDensity(fx, DENS[dens].v), [fx, dens])
  useEffect(() => setSketchBoil(fx, boil), [fx, boil])

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
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.22, 0.4))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 650 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.22, max: 0.4, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  // in compare mode the copy sits over the (light) original render, so keep the light theme
  const dark = mode === 'blueprint' && !split.open
  const S = SPEC[mode]
  const label = sketchModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage sk${dark ? ' sk-dark' : ''}${split.open ? ' sk-split' : ''}`}
      style={{ background: S.bg }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.7, 8.8], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.45, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={sketchMeta.background} />
        <StillLife rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy sk-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Pencil Sketch · {boil ? '8 fps 重描' : '定格'}
            </p>
            <h1>
              一支铅笔，
              <br />
              每秒重描八次
            </h1>
            <p className="sk-sub">亮部留白，灰部单排，暗部交叉再加密 —— 排线按明暗一层层叠上去；轮廓来自深度与法线的边缘，再用噪声抖成手绘线，偶尔描两遍。</p>
            <div className="sk-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.tool}</b>
                  {S.paper}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={sketchModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg sk-cycle" onClick={() => setDens((d) => (d + 1) % DENS.length)}>
              <span>
                线 <b>{DENS[dens].zh}</b>
              </span>
            </button>
          ) : (
            <Seg items={DENS.map((d, i) => ({ value: i, label: d.zh }))} value={dens} onChange={setDens} />
          )}
          <span className="dock-sep" />
          <button className="seg sk-toggle" aria-pressed={boil} onClick={() => setBoil((v) => !v)}>
            {boil && <motion.span layoutId="sk-boil" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>
              <i className={boil ? 'on' : ''} />
              沸腾
            </span>
          </button>
          <button className="seg sk-toggle" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="sk-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动静物 · 松手惯性滑行</p>
      </div>
    </div>
  )
}

const css = `
.sk { cursor: grab; touch-action: none; transition: background .7s; }
.sk:active { cursor: grabbing; }
.sk canvas { display: block; }
.sk-dark { --fg: #f1f5ff; --fg-2: rgba(232, 240, 255, .72); --glass: rgba(14, 38, 80, .5); --glass-line: rgba(255,255,255,.14); }
.sk .overlay { transition: color .6s; }
.sk-copy { pointer-events: none !important; }
.sk .hint { transition: opacity .4s; }
.sk-split .hint { opacity: 0; }
.sk-copy .kicker i { background: #3c3a36; transition: background .6s; }
.sk-dark .sk-copy .kicker i { background: #9cc3ff; }
.sk-copy h1 { font-size: clamp(38px, 4.4vw, 60px); }
.sk-sub { max-width: 400px; transition: color .6s; }
.sk-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.sk-spec span { display: inline-flex; align-items: center; gap: 10px; }
.sk-spec b {
  font-weight: 600; color: var(--fg); padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 30%, transparent);
}
.sk-toggle span, .sk-cycle span { display: inline-flex; align-items: center; gap: 7px; }
.sk-cycle b { font-weight: 600; color: var(--fg); }
.sk-toggle i { width: 12px; height: 2px; border-radius: 2px; background: currentColor; position: relative; }
.sk-toggle i.on { animation: sk-boil .375s steps(3) infinite; }
@keyframes sk-boil {
  0% { transform: translateY(0) rotate(-6deg); }
  33% { transform: translateY(-1px) rotate(4deg); }
  66% { transform: translateY(1px) rotate(-2deg); }
}
@media (max-width: 760px) {
  .sk-copy { transition: opacity .4s; }
  .sk-split .sk-copy { opacity: 0; }
  .sk-sub { display: none; }
  .sk-copy h1 { font-size: 34px; }
  .sk-spec { margin-top: 12px; }
  .sk .dock .seg { padding: 0 7px; }
  .sk .dock .dock-sep { margin: 0 1px; }
}
`
