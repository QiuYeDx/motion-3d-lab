import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import {
  createPopEffect,
  popMeta,
  popModes,
  popPanelAt,
  popPanelCount,
  popPanelInks,
  repullPanel,
  setPopFrame,
  setPopMode,
  shufflePop,
  type PopMode,
} from './effects/popscreen'

/*
 * 丝印四联 — a pop portrait (a platinum-curled starlet built from primitives: pale skin, yellow curls, red lips,
 * blue lids) that turns her head slowly, so every panel of the sheet animates in sync. The strip mode swaps in
 * a soup can for the supermarket-ad look. The scene is framed in the print area (camera view offset), and the
 * effect crops each panel's window from the same rectangle, so the "原图" split lines up with the prints.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const NOTE: Record<PopMode, string> = {
  quad: '2×2 · 三层丝网 · 黑版错位 3–7px',
  nine: '3×3 · 九套撞色 · 部分格子带网点',
  strip: '1×4 · Ben-Day 网点 · 超市广告味',
}
type Rect = { x: number; y: number; w: number; h: number }

function areaFor(W: number, H: number): Rect {
  if (POSTER) return { x: 34, y: 34, w: W - 68, h: H - 68 }
  if (W < 760) return { x: 14, y: 78, w: W - 28, h: Math.max(220, H - 78 - 286) }
  const x0 = Math.max(W * 0.37, 500)
  return { x: x0, y: 86, w: W - x0 - 52, h: H - 86 - 104 }
}

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** soup can label: red top, white bottom, gold medallion, big lettering */
function labelTexture() {
  const W = 2048
  const H = 768
  return canvasTex(W, H, (c) => {
    c.fillStyle = '#f6f2ea'
    c.fillRect(0, 0, W, H)
    c.fillStyle = '#d42a26'
    c.fillRect(0, 0, W, H * 0.5)
    // a thin gold band between the halves
    c.fillStyle = '#e9b42c'
    c.fillRect(0, H * 0.5 - 10, W, 20)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    // the label wraps around: the lettering faces the camera at u = 0.25 (three.js cylinder seam at the back)
    for (const cx of [W * 0.25, W * 0.75]) {
      c.fillStyle = '#fbf7ef'
      c.font = `italic 700 ${H * 0.2}px Georgia, "Times New Roman", serif`
      c.fillText('Tomato', cx, H * 0.2)
      c.font = `700 ${H * 0.055}px Georgia, "Times New Roman", serif`
      c.fillText('— C O N D E N S E D —', cx, H * 0.4)
      c.fillStyle = '#d42a26'
      c.font = `900 ${H * 0.2}px Georgia, "Times New Roman", serif`
      c.fillText('SOUP', cx, H * 0.79)
      // medallion
      c.fillStyle = '#e9b42c'
      c.beginPath()
      c.arc(cx, H * 0.5, H * 0.085, 0, Math.PI * 2)
      c.fill()
      c.strokeStyle = '#b8801a'
      c.lineWidth = 6
      c.stroke()
    }
    // fleurs-de-lis-ish dots along the bottom
    c.fillStyle = '#e9b42c'
    for (let x = 30; x < W; x += 64) {
      c.beginPath()
      c.arc(x, H * 0.95, 9, 0, Math.PI * 2)
      c.fill()
    }
  })
}

/* ------------------------------------------------------------------ subjects */

const SKIN = '#f6ebe4'
const HAIR = '#f6c21c'

function makeMats() {
  const std = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness })
  return {
    skin: std(SKIN, 0.55),
    hair: std(HAIR, 0.5),
    lips: std('#e3192c', 0.35),
    lid: std('#3d7bf0', 0.45),
    white: std('#ffffff', 0.4),
    ink: std('#121014', 0.5),
    brow: std('#3a2a1c', 0.7),
    top: std('#2f6fe0', 0.6),
    metal: new THREE.MeshStandardMaterial({ color: '#cfd0d4', roughness: 0.35, metalness: 0.3 }),
  }
}
type Mats = ReturnType<typeof makeMats>

/** curls on the crown and sides, leaving the face open */
function curlSpots() {
  const out: { p: [number, number, number]; r: number }[] = []
  const rx = 0.62
  const ry = 0.8
  const rz = 0.66
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let ring = 0; ring < 7; ring++) {
    const pol = 0.12 + ring * 0.3 // from the top
    const n = ring === 0 ? 5 : 9 + ring * 2
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + ring * 0.37
      const x = Math.sin(pol) * Math.sin(az)
      const y = Math.cos(pol)
      const z = Math.sin(pol) * Math.cos(az)
      // keep the face clear: front-facing points below the hairline
      if (z > 0.15 && y < 0.62 - Math.abs(x) * 0.25) continue
      if (y < -0.25) continue
      const k = 1.06 + rand() * 0.08
      out.push({ p: [x * rx * k * 1.08, 0.3 + y * ry * k, z * rz * k], r: 0.2 + rand() * 0.08 })
    }
  }
  // the swept front wave
  out.push({ p: [-0.22, 0.98, 0.42], r: 0.24 }, { p: [0.08, 1.04, 0.38], r: 0.22 }, { p: [0.34, 0.92, 0.4], r: 0.21 }, { p: [-0.48, 0.78, 0.36], r: 0.2 })
  return out
}

function Portrait({ M }: { M: Mats }) {
  const curls = useMemo(curlSpots, [])
  const S = (props: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; r?: [number, number, number] }) => (
    <mesh position={props.p} scale={props.s} rotation={props.r ?? [0, 0, 0]} material={props.m} castShadow receiveShadow>
      <sphereGeometry args={[1, 40, 28]} />
    </mesh>
  )
  return (
    <group>
      {/* head, jaw, neck, shoulders */}
      <S p={[0, 0.3, 0]} s={[0.62, 0.8, 0.66]} m={M.skin} />
      <S p={[0, 0.02, 0.06]} s={[0.5, 0.48, 0.56]} m={M.skin} />
      <mesh position={[0, -0.62, -0.06]} material={M.skin} castShadow receiveShadow>
        <cylinderGeometry args={[0.25, 0.3, 0.8, 32]} />
      </mesh>
      <S p={[0, -1.12, -0.1]} s={[1.28, 0.42, 0.6]} m={M.skin} />
      <S p={[0, -1.42, -0.08]} s={[1.36, 0.34, 0.66]} m={M.top} />
      {/* hair */}
      {curls.map((c, i) => (
        <mesh key={i} position={c.p} scale={c.r} material={M.hair} castShadow receiveShadow>
          <sphereGeometry args={[1, 20, 14]} />
        </mesh>
      ))}
      {/* eyes: whites, irises, heavy blue lids, lashes, brows */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <S p={[s * 0.22, 0.375, 0.55]} s={[0.15, 0.08, 0.07]} m={M.white} />
          <S p={[s * 0.205, 0.365, 0.6]} s={[0.062, 0.062, 0.035]} m={M.ink} />
          <S p={[s * 0.22, 0.43, 0.55]} s={[0.18, 0.085, 0.09]} m={M.lid} />
          <S p={[s * 0.228, 0.39, 0.6]} s={[0.18, 0.026, 0.04]} m={M.ink} r={[0, 0, s * -0.1]} />
          <S p={[s * 0.24, 0.6, 0.54]} s={[0.16, 0.03, 0.04]} m={M.ink} r={[0, 0, s * -0.2]} />
        </group>
      ))}
      {/* nose */}
      <S p={[0, 0.2, 0.64]} s={[0.075, 0.11, 0.085]} m={M.skin} />
      {/* parted lips, teeth */}
      <S p={[0, 0.03, 0.6]} s={[0.17, 0.05, 0.07]} m={M.lips} />
      <S p={[0, -0.005, 0.615]} s={[0.12, 0.022, 0.04]} m={M.white} />
      <S p={[0, -0.06, 0.585]} s={[0.15, 0.06, 0.07]} m={M.lips} />
      {/* beauty mark */}
      <S p={[0.25, -0.03, 0.545]} s={[0.02, 0.02, 0.02]} m={M.ink} />
    </group>
  )
}

function SoupCan({ M, label }: { M: Mats; label: THREE.Texture }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 1.5, 96, 1, true]} />
        <meshStandardMaterial map={label} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, s * 0.78, 0]}>
          <mesh material={M.metal} castShadow receiveShadow>
            <cylinderGeometry args={[0.6, 0.6, 0.06, 96]} />
          </mesh>
          <mesh position={[0, s * 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.metal} castShadow>
            <torusGeometry args={[0.6, 0.035, 12, 96]} />
          </mesh>
          <mesh position={[0, s * 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.metal}>
            <torusGeometry args={[0.42, 0.02, 10, 96]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

function Scene({ ry, rx, fx, can }: { ry: MotionValue<number>; rx: MotionValue<number>; fx: StylizeEffect; can: boolean }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const head = useRef<THREE.Group>(null)
  const tin = useRef<THREE.Group>(null)
  const M = useMemo(makeMats, [])
  const label = useMemo(labelTexture, [])
  useEffect(
    () => () => {
      Object.values(M).forEach((m) => m.dispose())
      label.dispose()
    },
    [M, label],
  )
  const t = useRef(POSTER ? 1.2 : 0)
  const swap = useRef(can ? 1 : 0)

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    const W = size.width
    const H = size.height
    const A = areaFor(W, H)
    setPopFrame(fx, { area: A, focus: A })
    // frame the subject in the print area: SPAN world units ≈ 92 % of its height
    const SPAN = can ? 3.9 : 2.45
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const D = (SPAN * H) / (A.h * 0.92 * 2 * tan)
    camera.position.set(0, 0, D)
    camera.lookAt(0, 0, 0)
    camera.setViewOffset(W, H, -(A.x + A.w / 2 - W / 2), -(A.y + A.h / 2 - H / 2), W, H)
    // the hidden subject waits far below the frame (still compiled, culled by the frustum)
    swap.current = can ? 1 : 0
    if (head.current) {
      head.current.position.y = swap.current ? -60 : -0.32
      const sway = POSTER ? 0.32 : Math.sin(t.current * 0.42) * 0.55
      head.current.rotation.set(rx.get() + Math.sin(t.current * 0.31) * 0.05, sway + ry.get(), Math.sin(t.current * 0.42 + 0.6) * 0.06)
    }
    if (tin.current) {
      tin.current.position.y = swap.current ? 0 : -60
      tin.current.rotation.set(0.24 + rx.get() * 0.6, -Math.PI / 2 - 0.5 + t.current * 0.5 + ry.get(), 0.05)
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c8bba8', 0.45]} />
      <directionalLight
        position={[-4.6, 3.6, 4.2]}
        intensity={3.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[3.5, 0.5, 3]} intensity={0.3} />
      <group ref={content} visible={ready}>
        <group ref={head} scale={0.98}>
          <Portrait M={M} />
        </group>
        <group ref={tin} scale={1.38}>
          <SoupCan M={M} label={label} />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

type Tag = { id: number; x: number; y: number; n: number }

export default function PopSilkscreen() {
  const fx = useMemo(() => createPopEffect({ mode: 'quad' }), [])
  const orig = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const [mode, setMode] = useState<PopMode>('quad')
  const [mobile] = useState(MOBILE)
  const [inks, setInks] = useState<string[][]>(() => popPanelInks(fx))
  const [pulls, setPulls] = useState(4)
  const [tags, setTags] = useState<Tag[]>([])
  const split = useOriginalSplit()
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const ry = useMotionValue(0)
  const rx = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())
  const refreshInks = () => setInks(popPanelInks(fx).map((p) => p.slice()))

  const shownMode = useRef(mode)
  useEffect(() => {
    setPopMode(fx, mode)
    if (shownMode.current !== mode) setPulls((n) => n + popPanelCount(fx))
    shownMode.current = mode
    refreshInks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, mode])

  const pull = (i: number) => {
    repullPanel(fx, i)
    setPulls((n) => n + 1)
    refreshInks()
  }
  const shuffle = () => {
    shufflePop(fx)
    setPulls((n) => n + popPanelCount(fx))
    refreshInks()
  }

  // idle: the printer keeps pulling — one panel every few seconds, a new layout now and then
  useEffect(() => {
    if (POSTER) return
    let beat = 0
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 9000 || splitOpen.current) return
      beat++
      if (beat % 6 === 0) {
        setMode((m) => popModes[(popModes.findIndex((x) => x.id === m) + 1) % popModes.length].id)
      } else {
        const n = popPanelCount(fx)
        pull(Math.floor(Math.random() * n))
      }
    }, 2600)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx])

  // drag to turn the subject (coasts on release, then eases home); a click on a panel re-pulls it
  const drag = useRef<{ x: number; y: number; x0: number; y0: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const home = useRef<number | undefined>(undefined)
  const stage = useRef<HTMLDivElement>(null)
  const tagId = useRef(0)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    window.clearTimeout(home.current)
    drag.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) {
      if (stage.current && e.pointerType === 'mouse') {
        const r = stage.current.getBoundingClientRect()
        stage.current.style.cursor = popPanelAt(fx, e.clientX - r.left, e.clientY - r.top) >= 0 ? 'pointer' : 'grab'
      }
      return
    }
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.006, -1.4, 1.4))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.35, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (moved < 6 && stage.current) {
      const r = stage.current.getBoundingClientRect()
      const i = popPanelAt(fx, e.clientX - r.left, e.clientY - r.top)
      if (i >= 0) {
        pull(i)
        const id = ++tagId.current
        setTags((ts) => [...ts.slice(-3), { id, x: e.clientX - r.left, y: e.clientY - r.top, n: i + 1 }])
        window.setTimeout(() => setTags((ts) => ts.filter((t) => t.id !== id)), 1100)
      }
      return
    }
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.3, timeConstant: 500, min: -1.4, max: 1.4, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.25, timeConstant: 400, min: -0.35, max: 0.35, bounceStiffness: 160, bounceDamping: 18 }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12 }), animate(rx, 0, { type: 'spring', stiffness: 30, damping: 12 })]
    }, 4500)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const Mo = popModes.find((m) => m.id === mode)!
  const nPanels = mode === 'nine' ? 9 : 4

  return (
    <div ref={stage} className="stage ps" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 12], fov: 26 }}>
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background={popMeta.background} preload={preload} />
        <Scene ry={ry} rx={rx} fx={fx} can={mode === 'strip'} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label="丝印" />

        <AnimatePresence>
          {tags.map((t) => (
            <motion.span
              key={t.id}
              className="ps-tag"
              style={{ left: t.x, top: t.y }}
              initial={{ opacity: 0, y: 4, scale: 0.9 }}
              animate={{ opacity: 1, y: -26, scale: 1 }}
              exit={{ opacity: 0, y: -40 }}
              transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
            >
              再印 #{t.n}
            </motion.span>
          ))}
        </AnimatePresence>

        <div className="ps-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="ps-kicker">
              <b>POP SILKSCREEN</b>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {Mo.en} · {Mo.label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              同一个画面
              <br />
              印 <em>{nPanels}</em> 遍
            </h1>
            <p className="ps-sub">每一格都是同一帧画面，用三块丝网叠印：背景版、平涂色版、黑版。三块各自错位一点，刮板拉过时留下条纹和缺墨。点任意一格，换一套撞色重新刮印。</p>
            <div className="ps-inks" aria-label="当前撞色">
              {inks.slice(0, nPanels).map((p, i) => (
                <motion.span key={i} layout className="ps-ink" title={`#${i + 1}`}>
                  {[0, 1, 3].map((s) => (
                    <motion.i key={s} animate={{ backgroundColor: p[s] }} transition={{ duration: 0.5, delay: 0.25 + s * 0.05 }} />
                  ))}
                </motion.span>
              ))}
              <span className="ps-count">
                印次 No.
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.b key={pulls} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.25 }}>
                    {String(pulls).padStart(4, '0')}
                  </motion.b>
                </AnimatePresence>
              </span>
            </div>
            <div className="ps-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={mode} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}>
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={popModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <motion.button
            className="seg ps-shuffle"
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              poke()
              shuffle()
            }}
          >
            <span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <circle cx="4" cy="4" r="3" fill="#ff2d87" />
                <circle cx="10" cy="4" r="3" fill="#ffe23d" />
                <circle cx="4" cy="10" r="3" fill="#1fc6c0" />
                <circle cx="10" cy="10" r="3" fill="#2a3fe0" />
              </svg>
              {mobile ? '撞色' : '撞色组合'}
            </span>
          </motion.button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="ps-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">点一格重新刮印 · 拖动转头</p>
      </div>
    </div>
  )
}

const css = `
.ps { background: #fbf6ec; cursor: grab; touch-action: none; color: #17141a; }
.ps:active { cursor: grabbing; }
.ps canvas { display: block; }
.ps-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(400px, calc(100% - 48px)); pointer-events: none !important;
}
.ps-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.ps-kicker b { padding: 5px 7px 4px; background: #ff2d87; color: #fff; font-weight: 700; box-shadow: 2px 2px 0 #17141a; }
.ps-kicker span { display: inline-block; opacity: .7; letter-spacing: .06em; }
.ps-copy h1 {
  margin: 0; font: 900 clamp(40px, 4.6vw, 66px)/1.04 var(--sans); letter-spacing: -.02em;
}
.ps-copy h1 em {
  font-style: normal; display: inline-block; padding: 0 .12em; margin: 0 .04em; color: #17141a;
  background: #ffe23d; box-shadow: .06em .06em 0 #ff2d87;
}
.ps-sub { margin: 22px 0 0; max-width: 380px; font-size: 15px; line-height: 1.8; opacity: .78; }
.ps-inks { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 22px; }
.ps-ink { display: inline-flex; width: 30px; height: 18px; outline: 1.5px solid #17141a; outline-offset: 0; }
.ps-ink i { flex: 1; }
.ps-count { margin-left: 8px; display: inline-flex; gap: 6px; font: 500 11.5px/18px var(--mono); letter-spacing: .04em; opacity: .75; }
.ps-count b { display: inline-block; font-weight: 700; }
.ps-spec { margin-top: 16px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .03em; }
.ps-spec span { display: inline-flex; align-items: center; gap: 8px; }
.ps-spec i { width: 22px; height: 10px; flex: none; background: radial-gradient(circle, #ff2d87 1.6px, transparent 1.9px) 0 0 / 4px 4px; }
.ps-shuffle span { display: inline-flex; align-items: center; gap: 7px; }
.ps-tag {
  position: absolute; transform: translate(-50%, -50%); pointer-events: none; white-space: nowrap;
  padding: 5px 9px; font: 700 11.5px/1 var(--mono); letter-spacing: .04em;
  background: #17141a; color: #ffe23d; box-shadow: 2px 2px 0 #ff2d87;
}
.ps .hint { color: #17141a; opacity: .65; }
@media (max-width: 760px) {
  .ps-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .ps-copy h1 { font-size: 34px; }
  .ps-sub { display: none; }
  .ps-kicker { margin-bottom: 12px; }
  .ps-inks { margin-top: 14px; }
  .ps-ink { width: 24px; height: 14px; }
  .ps-spec { display: none; }
  .ps .dock .seg { padding: 0 10px; }
}
`
