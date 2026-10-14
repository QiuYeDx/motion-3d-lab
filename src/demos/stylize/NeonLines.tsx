import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import {
  createNeonEffect,
  litNeon,
  neonMeta,
  neonModes,
  powerOnNeon,
  setNeonFlicker,
  setNeonGlow,
  setNeonLineWidth,
  setNeonMode,
  type NeonMode,
} from './effects/neon'

/*
 * 霓虹线稿 showcase — a bar sign (cocktail glass, a sitting cat, an "OPEN" box) built as ordinary 3D shapes and
 * thin tubes. The effect keeps only their edges and turns them into gas tubes on a brick wall; on load the
 * tubes buzz on one segment at a time, and a click switches the sign off and on again.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const WIDTHS = [
  { zh: '细', css: 1.05 },
  { zh: '中', css: 1.5 },
  { zh: '粗', css: 2.15 },
]
const GLOWS = [
  { zh: '弱', k: 0.55 },
  { zh: '中', k: 1 },
  { zh: '强', k: 1.6 },
]
const NOTE: Record<NeonMode, string> = {
  neon: '灯管取物体本色 · 接头留缝 · 偶尔接触不良',
  laser: '扫描光束自上而下 · 线条随余辉淡出 · 光斑抖动',
  tron: '青色线框 · 更多折痕 · 透视网格地面',
}
const SHORT: Record<NeonMode, string> = { neon: '霓虹', laser: '激光', tron: '蓝图' }
const ACCENT: Record<NeonMode, string> = { neon: '#ff3df2', laser: '#38ff5a', tron: '#3ee8ff' }

/* ------------------------------------------------------------------ geometry */

/** dense points along a polyline with rounded corners (neon tubes are bent, not mitred) */
function rounded(pts: [number, number][], rad: number, closed = false) {
  const out: THREE.Vector3[] = []
  const n = pts.length
  const P = (i: number) => new THREE.Vector2(...pts[(i + n) % n])
  for (let i = 0; i < n; i++) {
    const p = P(i)
    if (!closed && (i === 0 || i === n - 1)) {
      out.push(new THREE.Vector3(p.x, p.y, 0))
      continue
    }
    const a = P(i - 1)
    const b = P(i + 1)
    const da = a.clone().sub(p)
    const db = b.clone().sub(p)
    const r = Math.min(rad, da.length() * 0.45, db.length() * 0.45)
    const s = p.clone().add(da.normalize().multiplyScalar(r))
    const e = p.clone().add(db.normalize().multiplyScalar(r))
    for (let k = 0; k <= 6; k++) {
      const t = k / 6
      const q = s
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .add(p.clone().multiplyScalar(2 * (1 - t) * t))
        .add(e.clone().multiplyScalar(t * t))
      out.push(new THREE.Vector3(q.x, q.y, 0))
    }
  }
  return out
}

function tube(pts: THREE.Vector3[], closed: boolean, radius: number, seg = 160) {
  const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal')
  return new THREE.TubeGeometry(curve, seg, radius, 10, closed)
}

function ellipse(rx: number, ry: number, n = 48) {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push(new THREE.Vector3(Math.cos(a) * rx, Math.sin(a) * ry, 0))
  }
  return out
}

function signGeo() {
  const R = 0.02
  const H = 0.25
  const shift = (pts: THREE.Vector3[], x: number, y = 0) => pts.map((p) => p.clone().add(new THREE.Vector3(x, y, 0)))
  const letters = [
    tube(shift(ellipse(0.17, H), -0.78), true, R),
    tube(
      shift(
        rounded(
          [
            [-0.13, -H],
            [-0.13, H],
            [0.06, H],
            [0.15, 0.13],
            [0.06, 0.0],
            [-0.13, 0.0],
          ],
          0.1,
        ),
        -0.27,
      ),
      false,
      R,
    ),
    tube(
      shift(
        rounded(
          [
            [0.13, H],
            [-0.12, H],
            [-0.12, -H],
            [0.13, -H],
          ],
          0.05,
        ),
        0.2,
      ),
      false,
      R,
      100,
    ),
    tube(shift([new THREE.Vector3(-0.12, 0, 0), new THREE.Vector3(0.09, 0, 0)], 0.2), false, R, 12),
    tube(
      shift(
        rounded(
          [
            [-0.14, -H],
            [-0.14, H],
            [0.14, -H],
            [0.14, H],
          ],
          0.03,
        ),
        0.68,
      ),
      false,
      R,
      120,
    ),
  ]
  const frame = tube(
    rounded(
      [
        [-1.22, -0.44],
        [1.22, -0.44],
        [1.22, 0.44],
        [-1.22, 0.44],
      ],
      0.2,
      true,
    ),
    true,
    0.024,
    220,
  )
  return { letters, frame }
}

function glassGeo() {
  const pts: [number, number][] = [
    [0.0, 0.0],
    [0.4, 0.0],
    [0.42, 0.025],
    [0.38, 0.05],
    [0.06, 0.08],
    [0.034, 0.14],
    [0.034, 0.8],
    [0.06, 0.86],
    [0.78, 1.58],
    [0.8, 1.6],
  ]
  const glass = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    72,
  )
  const liquid = new THREE.LatheGeometry(
    [
      [0, 0.92],
      [0.05, 0.92],
      [0.6, 1.42],
      [0, 1.42],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    72,
  )
  return { glass, liquid }
}

function catGeo() {
  const s = new THREE.Shape()
  s.moveTo(-0.42, 0)
  s.bezierCurveTo(-0.5, 0.0, -0.52, 0.1, -0.44, 0.14)
  s.bezierCurveTo(-0.46, 0.4, -0.4, 0.62, -0.36, 0.78)
  s.bezierCurveTo(-0.5, 0.86, -0.54, 1.02, -0.5, 1.14)
  s.lineTo(-0.47, 1.52)
  s.lineTo(-0.3, 1.32)
  s.bezierCurveTo(-0.22, 1.35, -0.14, 1.35, -0.07, 1.32)
  s.lineTo(0.08, 1.5)
  s.lineTo(0.1, 1.12)
  s.bezierCurveTo(0.12, 1.0, 0.1, 0.92, 0.05, 0.84)
  s.bezierCurveTo(0.32, 0.72, 0.5, 0.45, 0.48, 0.2)
  s.bezierCurveTo(0.47, 0.08, 0.42, 0.02, 0.36, 0.0)
  // tail: out along the floor, curling up
  s.bezierCurveTo(0.62, 0.0, 0.86, 0.06, 0.88, 0.32)
  s.bezierCurveTo(0.9, 0.55, 0.74, 0.66, 0.68, 0.56)
  s.bezierCurveTo(0.76, 0.52, 0.8, 0.4, 0.76, 0.28)
  s.bezierCurveTo(0.72, 0.12, 0.56, 0.08, 0.36, 0.08)
  s.lineTo(-0.36, 0.08)
  s.bezierCurveTo(-0.38, 0.06, -0.38, 0.02, -0.42, 0)
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 24 })
  body.translate(0, 0, -0.06)
  const eye = new THREE.Shape()
  eye.moveTo(-0.07, 0)
  eye.quadraticCurveTo(0, 0.06, 0.07, 0)
  eye.quadraticCurveTo(0, -0.06, -0.07, 0)
  const eyes = new THREE.ExtrudeGeometry(eye, { depth: 0.03, bevelEnabled: false, curveSegments: 12 })
  const whisker = (a: number) =>
    tube(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.17 * Math.cos(a) * 0.6, -0.17 * Math.sin(a) * 0.6, 0.01), new THREE.Vector3(-0.3 * Math.cos(a), -0.3 * Math.sin(a), 0)],
      false,
      0.008,
      24,
    )
  return { body, eyes, whiskers: [whisker(-0.18), whisker(0.08)] }
}

/* ------------------------------------------------------------------ scene */

const mat = (hex: string, emissive = 0.55) =>
  new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: emissive, roughness: 0.35, side: THREE.DoubleSide })

function Sign({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const olive = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 2.2 : 0)
  const g = useMemo(() => ({ sign: signGeo(), glass: glassGeo(), cat: catGeo() }), [])
  const m = useMemo(
    () => ({
      glass: mat('#2fd4ff', 0.6),
      liquid: mat('#ff2e8a', 0.6),
      olive: mat('#8cff2e', 0.6),
      pick: mat('#ffd23a', 0.6),
      cat: mat('#ffb21e', 0.55),
      eye: mat('#45ff7a', 0.8),
      letters: mat('#ff3b2a', 0.6),
      frame: mat('#3d5cff', 0.6),
    }),
    [],
  )
  useEffect(
    () => () => {
      g.sign.letters.forEach((x) => x.dispose())
      g.sign.frame.dispose()
      g.glass.glass.dispose()
      g.glass.liquid.dispose()
      g.cat.body.dispose()
      g.cat.eyes.dispose()
      g.cat.whiskers.forEach((x) => x.dispose())
      Object.values(m).forEach((x) => x.dispose())
    },
    [g, m],
  )

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = POSTER ? Math.min((vh * 0.8) / 3.9, (vw * 0.8) / 4.6) : mobile ? Math.min((vw * 1.0) / 4.5, (vh * 0.52) / 3.9) : Math.min((vh * 0.74) / 3.9, (vw * 0.56) / 4.6)
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.17, POSTER ? 0.0 : mobile ? vh * 0.13 : 0.02, 0)
    }
    if (turn.current) {
      const sway = POSTER ? 0.18 : Math.sin(T * 0.33) * 0.32 + Math.sin(T * 0.71) * 0.06
      turn.current.rotation.set(0.06 + rx.get() + Math.sin(T * 0.27) * 0.04, sway + ry.get(), 0)
    }
    // small life: the olive bobs in the drink, the tail flicks
    if (olive.current) olive.current.position.y = Math.sin(T * 1.3) * 0.025
    if (tail.current) tail.current.rotation.z = Math.sin(T * 2.1) * 0.02
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[-2, 3, 5]} intensity={1.6} />
      <group ref={rig}>
        <group ref={turn}>
          {/* cocktail glass */}
          <group position={[-1.12, 0.05, 0]} rotation={[0.28, 0, 0.1]}>
            <mesh geometry={g.glass.glass} material={m.glass} />
            <mesh geometry={g.glass.liquid} material={m.liquid} />
            <group ref={olive}>
              <mesh position={[0.14, 1.36, 0.05]} material={m.olive}>
                <sphereGeometry args={[0.1, 24, 16]} />
              </mesh>
              <mesh position={[0.24, 1.6, 0.04]} rotation={[0, 0, -0.42]} material={m.pick}>
                <cylinderGeometry args={[0.012, 0.012, 0.62, 8]} />
              </mesh>
            </group>
          </group>
          {/* cat */}
          <group position={[1.12, 0.04, 0]}>
            <group ref={tail}>
              <mesh geometry={g.cat.body} material={m.cat} />
            </group>
            <mesh geometry={g.cat.eyes} position={[-0.31, 1.17, 0.07]} material={m.eye} />
            {g.cat.whiskers.map((w, i) => (
              <mesh key={i} geometry={w} position={[-0.46, 1.03, 0.08]} material={m.cat} />
            ))}
          </group>
          {/* OPEN box */}
          <group position={[0, -0.82, 0.05]}>
            <mesh geometry={g.sign.frame} material={m.frame} />
            {g.sign.letters.map((l, i) => (
              <mesh key={i} geometry={l} material={m.letters} />
            ))}
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function NeonLines() {
  const fx = useMemo(() => {
    const f = createNeonEffect()
    if (POSTER) {
      litNeon(f)
      setNeonFlicker(f, false)
    }
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<NeonMode>('neon')
  const [wi, setWi] = useState(1)
  const [gi, setGi] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const ry = useMotionValue(0)
  const rx = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  const first = useRef(true)
  useEffect(() => {
    setNeonMode(fx, mode)
    if (mode === 'neon' && !first.current) powerOnNeon(fx)
    first.current = false
  }, [fx, mode])
  useEffect(() => setNeonLineWidth(fx, WIDTHS[wi].css), [fx, wi])
  useEffect(() => setNeonGlow(fx, GLOWS[gi].k), [fx, gi])

  // idle: cycle the modes
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => neonModes[(neonModes.findIndex((x) => x.id === m) + 1) % neonModes.length].id)
    }, 7500)
    return () => window.clearInterval(id)
  }, [])

  // drag turns the sign (Motion inertia on release); a click without a drag flips the power
  const drag = useRef<{ x: number; y: number; id: number; moved: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y)
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.005, -1.1, 1.1))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.003, -0.35, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved < 6) {
      if (mode !== 'neon') setMode('neon')
      else powerOnNeon(fx)
      return
    }
    anims.current = [
      animate(ry, ry.get(), {
        type: 'inertia',
        velocity: ry.getVelocity(),
        power: 0.35,
        timeConstant: 520,
        min: -1.1,
        max: 1.1,
        bounceStiffness: 140,
        bounceDamping: 18,
        onComplete: () => {
          anims.current.push(animate(ry, 0, { type: 'spring', stiffness: 18, damping: 9, delay: 1.5 }))
        },
      }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.35, max: 0.35, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const label = neonModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage ne ne-${mode}${split.open ? ' ne-split' : ''}`}
      style={{ ['--ne-accent' as string]: ACCENT[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0.2, 9], fov: 30, near: 0.5, far: 40 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={neonMeta.background} preload={preload} />
        <Sign ry={ry} rx={rx} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label={label} />

        <div className="hero-copy ne-copy">
          <div className="scrim ne-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Neon Lines ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="ne-kmode"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              只留轮廓，
              <br />
              <span className="ne-glow">全部点亮</span>
            </h1>
            <p className="ne-sub">画面里只剩轮廓、折痕和色块交界，每条线都成了一根灯管：白热的芯、彩色的辉光，还照亮身后的砖墙。灯管之间留着接头，偶尔有一段接触不良地闪。</p>
            <div className="ne-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={neonModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg ne-cycle"
            onClick={() => {
              poke()
              setWi((i) => (i + 1) % WIDTHS.length)
            }}
          >
            <span>
              {mobile ? '线' : '线宽'} <b>{WIDTHS[wi].zh}</b>
            </span>
          </button>
          <button
            className="seg ne-cycle"
            onClick={() => {
              poke()
              setGi((i) => (i + 1) % GLOWS.length)
            }}
          >
            <span>
              {mobile ? '光' : '辉光'} <b>{GLOWS[gi].zh}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="ne-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动招牌 · 单击重新通电</p>
      </div>
    </div>
  )
}

const css = `
.ne { cursor: grab; touch-action: none; background: ${neonMeta.background}; }
.ne:active { cursor: grabbing; }
.ne canvas { display: block; }
.ne-copy { pointer-events: none !important; }
.ne-scrim { --soft-bg: rgba(6, 5, 10, .74); }
.ne-copy .kicker { transition: color .6s; }
.ne-copy .kicker i { background: var(--ne-accent); box-shadow: 0 0 10px var(--ne-accent), 0 0 3px #fff; transition: background .6s, box-shadow .6s; }
.ne-kmode { display: inline-block; color: var(--fg); }
.ne-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.ne-glow {
  color: #fff6fd;
  text-shadow: 0 0 2px #fff, 0 0 10px var(--ne-accent), 0 0 26px var(--ne-accent), 0 0 52px color-mix(in srgb, var(--ne-accent) 60%, transparent);
  transition: text-shadow .6s;
}
.ne-sub { max-width: 400px; }
.ne-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.ne-spec span { display: inline-flex; align-items: center; gap: 9px; }
.ne-spec i { width: 18px; height: 3px; border-radius: 3px; background: #fff; box-shadow: 0 0 6px var(--ne-accent), 0 0 12px var(--ne-accent); }
.ne-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.ne-cycle b { font-weight: 600; color: var(--fg); }
.ne .hint { transition: opacity .4s; }
.ne-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .ne-copy { transition: opacity .4s; }
  .ne-split .ne-copy { opacity: 0; }
  .ne-sub { display: none; }
  .ne-copy h1 { font-size: 36px; }
  .ne-spec { margin-top: 12px; font-size: 11px; }
  .ne .dock .seg { padding: 0 9px; }
  .ne .dock .dock-sep { margin: 0 1px; }
}
`
