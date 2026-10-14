import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { asciiMeta, asciiModes, asciiRamps, createAsciiEffect, setAsciiCell, setAsciiLens, setAsciiMode, type AsciiMode } from './effects/ascii'

/*
 * 字符画 showcase — a torus knot with orbiting moons, lit hard (warm key + cyan rim) so its value
 * structure survives the trip into ten glyphs. The stylize effect lives in effects/ascii.ts; this page
 * drives its mode / cell size / lens and adds the before-after split via the lib's prev + wipe.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const BG = asciiMeta.background

const CELLS = [
  { zh: '小', css: 8 },
  { zh: '中', css: 11 },
  { zh: '大', css: 14 },
]

const INFO: Record<AsciiMode, { flag: string; note: string }> = {
  ramp: { flag: 'ramp', note: '10 级字符阶：亮度从空格一路排到 @' },
  edge: { flag: 'edge', note: '深度 / 法线 Sobel 边缘处，按走向换成 / \\ | - _' },
  color: { flag: 'color', note: '同一套字符阶，染上场景本来的颜色' },
  han: { flag: 'han', note: '汉字按图集里实测的笔画密度排序' },
  braille: { flag: 'braille', note: '每格 2×4 个点各自取样，拼成 U+2800 盲文' },
  matrix: { flag: 'matrix', note: '一列列下落的字符，亮度由场景调制' },
}

/* ------------------------------------------------------------------ scene */

const ORBITS = [
  { r: 2.25, tilt: 0.5, phase: 0.0, speed: 0.55, size: 0.34, color: '#1fe0c0' },
  { r: 2.6, tilt: -0.75, phase: 2.1, speed: 0.38, size: 0.26, color: '#ffd23f' },
  { r: 1.95, tilt: 1.25, phase: 4.0, speed: 0.72, size: 0.2, color: '#9d6bff' },
  { r: 2.9, tilt: 0.15, phase: 5.2, speed: 0.3, size: 0.4, color: '#3d8bff' },
]

type Drive = { rx: MotionValue<number>; ry: MotionValue<number> }


function Subject({ rx, ry }: Drive) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const moons = useRef<(THREE.Mesh | null)[]>([])
  const st = useRef({ t: POSTER ? 2.2 : 0, auto: POSTER ? 0.5 : 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    if (!POSTER) {
      s.t += dt
      s.auto += dt * 0.25
    }
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = mobile ? Math.min(0.9, vw / 6.4) : Math.min(1.08, vh / 6.6)
      rig.current.scale.setScalar(POSTER ? k * 1.12 : k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.16, POSTER ? 0 : mobile ? vh * 0.13 : 0, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get() + Math.sin(s.t * 0.4) * 0.08, s.auto + ry.get(), Math.sin(s.t * 0.23) * 0.08)
    if (ring.current) ring.current.rotation.set(1.15 + Math.sin(s.t * 0.3) * 0.12, 0, s.t * 0.18)
    ORBITS.forEach((o, i) => {
      const m = moons.current[i]
      if (!m) return
      const a = o.phase + s.t * o.speed
      const x = Math.cos(a) * o.r
      const z = Math.sin(a) * o.r
      m.position.set(x, z * Math.sin(o.tilt) * 0.55, z * Math.cos(o.tilt))
    })
  })

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[-4, 5.5, 5]}
        intensity={3.6}
        color="#fff1e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0006}
      />
      <directionalLight position={[5, 1.5, -6]} intensity={5} color="#78e6ff" />
      <directionalLight position={[-6, -2, -3]} intensity={1.6} color="#ff6ad5" />
      <group ref={rig}>
        <group ref={spin}>
          <mesh castShadow receiveShadow>
            <torusKnotGeometry args={[1.05, 0.38, 320, 40, 2, 3]} />
            <meshStandardMaterial color="#ff5b3a" roughness={0.32} metalness={0.05} />
          </mesh>
        </group>
        <mesh ref={ring} castShadow>
          <torusGeometry args={[2.45, 0.035, 12, 160]} />
          <meshStandardMaterial color="#f2f2f2" roughness={0.3} />
        </mesh>
        {ORBITS.map((o, i) => (
          <mesh key={i} ref={(m) => void (moons.current[i] = m)} castShadow>
            <sphereGeometry args={[o.size, 40, 28]} />
            <meshStandardMaterial color={o.color} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </>
  )
}

function Lens({ fx, lx, ly, lr }: { fx: ReturnType<typeof createAsciiEffect>; lx: MotionValue<number>; ly: MotionValue<number>; lr: MotionValue<number> }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  useFrame(() => {
    const d = gl.getPixelRatio()
    setAsciiLens(fx, lx.get() * d, (size.height - ly.get()) * d, Math.max(0, lr.get()) * d)
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function AsciiArt() {
  const fx = useMemo(createAsciiEffect, [])
  const orig = useMemo(createOriginalEffect, [])
  const ramps = useMemo(asciiRamps, [])
  const [mode, setMode] = useState<AsciiMode>('edge')
  const [cell, setCell] = useState(MOBILE ? 0 : 1)
  const [split, setSplit] = useState(false)
  const [splitLive, setSplitLive] = useState(false)
  const [mobile] = useState(MOBILE)

  const rx = useMotionValue(0.22)
  const ry = useMotionValue(0)
  const wipe = useMotionValue(1)
  const lxRaw = useMotionValue(0)
  const lyRaw = useMotionValue(0)
  const lx = useSpring(lxRaw, { stiffness: 520, damping: 42 })
  const ly = useSpring(lyRaw, { stiffness: 520, damping: 42 })
  const lr = useMotionValue(0)
  const stage = useRef<HTMLDivElement>(null)
  const lastInput = useRef(0)

  useEffect(() => setAsciiMode(fx, mode), [fx, mode])
  useEffect(() => setAsciiCell(fx, CELLS[cell].css), [fx, cell])
  useEffect(() => {
    setAsciiMode(fx, mode, true)
    setAsciiCell(fx, CELLS[cell].css, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx])

  // idle → the modes cycle on their own
  useEffect(() => {
    if (POSTER) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      if (now - lastInput.current < 7000 || now - last < 4600) return
      last = now
      setMode((m) => asciiModes[(asciiModes.findIndex((x) => x.id === m) + 1) % asciiModes.length].id)
    }, 400)
    return () => clearInterval(id)
  }, [])

  // split: the original render slides in from the right
  useEffect(() => {
    if (split) setSplitLive(true)
    const a = animate(wipe, split ? (mobile ? 0.5 : 0.62) : 1, {
      type: 'spring',
      stiffness: 140,
      damping: 22,
      onComplete: () => !split && setSplitLive(false),
    })
    return () => a.stop()
  }, [split, wipe, mobile])

  /* pointer: lens follows (mouse hover / touch press), drag turns the knot with inertia */
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const lensAnim = useRef<{ stop: () => void } | null>(null)
  const hideTimer = useRef(0)
  const lensR = () => (mobile ? 84 : 118)
  const showLens = () => {
    window.clearTimeout(hideTimer.current)
    if (lr.get() < lensR() - 1) {
      lensAnim.current?.stop()
      lensAnim.current = animate(lr, lensR(), { type: 'spring', stiffness: 260, damping: 20 })
    }
  }
  const hideLens = (delay = 0) => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      lensAnim.current?.stop()
      lensAnim.current = animate(lr, 0, { duration: 0.35, ease: [0.4, 0, 0.2, 1] })
    }, delay)
  }
  const local = (e: React.PointerEvent) => {
    const r = stage.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top] as const
  }
  const overUi = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest('.dock, .as-handle, .as-copy *')
  const onDown = (e: React.PointerEvent) => {
    lastInput.current = performance.now()
    if ((e.target as HTMLElement).closest('.dock, .as-handle')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    if (e.pointerType !== 'mouse') {
      lxRaw.jump(x)
      lyRaw.jump(y - 70)
      lx.jump(x)
      ly.jump(y - 70)
      showLens()
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = local(e)
    const touch = e.pointerType !== 'mouse'
    if (!touch || drag.current) {
      if (lr.get() < 1) {
        lx.jump(x)
        ly.jump(touch ? y - 70 : y)
      }
      lxRaw.set(x)
      lyRaw.set(touch ? y - 70 : y) // keep the lens above the finger
      if (!touch) {
        if (overUi(e)) hideLens(0)
        else {
          showLens()
          hideLens(2600)
        }
      }
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    lastInput.current = performance.now()
    ry.set(ry.get() + (e.clientX - d.x) * 0.009)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.006, -0.9, 0.9))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') hideLens(250)
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 600 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.4, timeConstant: 450, min: -0.9, max: 0.9, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  /* split handle: drag the diagonal seam */
  const onHandleDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    lastInput.current = performance.now()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const r = stage.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    wipe.set(THREE.MathUtils.clamp(x * 0.84 + y * 0.16, 0.08, 0.96))
  }

  // seam geometry follows wipeCoord = x·0.84 + y·0.16 (y from the top)
  const [seam, setSeam] = useState({ x0: 0, x1: 0, on: false })
  useEffect(
    () =>
      wipe.on('change', (w) => {
        setSeam({ x0: (w / 0.84) * 100, x1: ((w - 0.16) / 0.84) * 100, on: w < 0.995 })
      }),
    [wipe],
  )

  const info = INFO[mode]
  const ramp = mode === 'han' ? ramps.han : mode === 'braille' ? ramps.braille : mode === 'matrix' ? 'ｱｲｳｴｵｶｷ…0-9' : ramps.ascii
  const cmd = `ascii --mode=${info.flag} --cell=${CELLS[cell].css}px`

  return (
    <div
      ref={stage}
      className="stage as"
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={(e) => e.pointerType === 'mouse' && hideLens(0)}
    >
      <style>{css}</style>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0.6, 10], fov: 34 }}
      >
        <Stylize effect={fx} prev={splitLive ? orig : null} wipe={wipe} background={BG} exposure={1.05} />
        <Subject rx={rx} ry={ry} />
        <Lens fx={fx} lx={lx} ly={ly} lr={lr} />
      </Canvas>

      <div className="overlay">
        <div className="as-copy">
          <span className="scrim" style={{ ['--soft-bg' as string]: BG }} />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="as-kicker">
              <i />
              tty · glyph renderer
            </p>
            <Typed className="as-cmd" text={cmd} />
            <h1>
              把 3D
              <br />
              打成字符
            </h1>
            <p className="as-sub">每帧先渲染场景，再把屏幕切成等宽字符格：每格采样亮度、深度和法线，从字形图集里挑一个最合适的字。</p>
            <div className="as-out">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <p>
                    <b>#</b> {info.note}
                  </p>
                  <p className="as-ramp">
                    <b>ramp</b> <code>"{ramp}"</code>
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {seam.on && (
          <>
            <svg className="as-seam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1={seam.x0} y1={0} x2={seam.x1} y2={100} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="as-tag as-tag-l" style={{ left: `calc(${(seam.x0 + seam.x1) / 2}% - 12px)` }}>
              字符
            </span>
            <span className="as-tag as-tag-r" style={{ left: `calc(${(seam.x0 + seam.x1) / 2}% + 12px)` }}>
              原图
            </span>
            <button
              className="as-handle"
              style={{ left: `${(seam.x0 + seam.x1) / 2}%` }}
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              aria-label="拖动分割线"
            >
              ⟷
            </button>
          </>
        )}

        <div className="dock" onPointerDown={() => (lastInput.current = performance.now())}>
          <Seg items={asciiModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          {!mobile && (
            <>
              <span className="dock-sep" />
              <Seg items={CELLS.map((c, i) => ({ value: i, label: c.zh }))} value={cell} onChange={setCell} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split} onClick={() => setSplit((v) => !v)}>
            {split && <motion.span layoutId="as-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">
          移动鼠标：圆圈里是原始渲染
          <br />
          拖动旋转 · 闲置时自动换模式
        </p>
      </div>
    </div>
  )
}

/** a command line that re-types itself whenever its text changes */
function Typed({ text, className }: { text: string; className?: string }) {
  const [n, setN] = useState(text.length)
  const prev = useRef(text)
  useEffect(() => {
    if (prev.current === text) return
    // keep the common prefix, retype the rest
    let k = 0
    while (k < text.length && text[k] === prev.current[k]) k++
    prev.current = text
    let i = k
    setN(k)
    const id = setInterval(() => {
      i++
      setN(i)
      if (i >= text.length) clearInterval(id)
    }, 28)
    return () => clearInterval(id)
  }, [text])
  return (
    <p className={className}>
      <b>~/lab $</b> {text.slice(0, n)}
      <span className="as-caret" />
    </p>
  )
}

const css = `
.as { cursor: crosshair; touch-action: none; }
.as canvas { display: block; }
.as-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(460px, calc(100% - 48px)); pointer-events: none !important; isolation: isolate;
  color: #e9f5ec; font-family: var(--mono);
}
.as-copy .scrim { height: 640px; left: -160px; right: -120px; }
.as-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 18px;
  font: 500 11.5px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: rgba(200, 236, 210, .6);
}
.as-kicker i { width: 7px; height: 7px; border-radius: 50%; background: #7dff9a; box-shadow: 0 0 10px #7dff9a; }
.as-cmd {
  margin: 0 0 16px; min-height: 20px; font: 500 13.5px/20px var(--mono); color: #c9f7d4; white-space: nowrap;
}
.as-cmd b { color: #7dff9a; font-weight: 600; }
.as-caret {
  display: inline-block; width: 8px; height: 15px; margin-left: 3px; vertical-align: -2px;
  background: #7dff9a; animation: as-blink 1.05s steps(1) infinite;
}
@keyframes as-blink { 50% { opacity: 0; } }
.as-copy h1 {
  margin: 0; font: 700 clamp(44px, 5.6vw, 80px)/1.02 var(--mono); letter-spacing: -.02em; color: #f2fff5;
  text-shadow: 0 0 28px rgba(125, 255, 154, .22);
}
.as-sub { margin: 22px 0 0; max-width: 400px; font: 400 14.5px/1.8 var(--sans); color: rgba(225, 240, 230, .66); }
.as-out { margin-top: 20px; min-height: 52px; font: 12.5px/1.75 var(--mono); color: rgba(225, 240, 230, .7); }
.as-out p { margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.as-out b { color: #7dff9a; font-weight: 500; margin-right: 4px; }
.as-ramp code { color: #f2fff5; font-family: var(--mono); letter-spacing: .08em; }
.as-seam { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none !important; }
.as-seam line { stroke: #7dff9a; stroke-width: 1.5; filter: drop-shadow(0 0 6px #7dff9a); }
.as-handle {
  position: absolute; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border: 0; border-radius: 50%;
  background: #0a0c0b; color: #7dff9a; font: 600 16px/1 var(--mono); cursor: ew-resize; touch-action: none;
  box-shadow: inset 0 0 0 1.5px #7dff9a, 0 0 18px rgba(125, 255, 154, .4);
}
.as-tag {
  position: absolute; top: calc(50% + 30px); pointer-events: none !important;
  font: 500 11px/1 var(--mono); letter-spacing: .1em; color: #7dff9a; padding: 5px 7px; background: rgba(10, 12, 11, .8);
}
.as-tag-l { transform: translateX(-100%); }
.as .dock .seg { font-family: var(--sans); }
@media (max-width: 760px) {
  .as-copy { top: auto; bottom: 84px; justify-content: flex-end; }
  .as-copy h1 { font-size: 40px; }
  .as-sub { display: none; }
  .as-out { margin-top: 12px; min-height: 0; font-size: 11.5px; }
  .as-out .as-ramp { display: none; }
  .as-cmd { font-size: 12px; margin-bottom: 12px; }
  .as-kicker { margin-bottom: 12px; }
  .as .dock .seg { padding: 0 9px; }
  .as-copy .scrim { height: 380px; top: 62%; }
}
`
