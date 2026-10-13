import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { FluidSim, type FluidParams } from './fluidSim'

type ModeKey = 'neon' | 'ink' | 'aurora'
type Mode = {
  key: ModeKey
  zh: string
  en: string
  sub: string
  aside: string
  p: FluidParams & { radius: number; force: number; amount: number }
  colors: [number, number, number][]
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const MODES: Mode[] = [
  {
    key: 'neon',
    zh: '霓虹',
    en: 'Neon',
    sub: '高饱和染料在近黑底上涡旋，叠一层柔光',
    aside: 'curl 30 · glow',
    p: { curl: 30, velDiss: 0.22, dyeDiss: 0.7, pressure: 0.8, threshold: 0.12, radius: 0.22, force: 5200, amount: 0.22 },
    colors: ['#ff2a7a', '#ff5a36', '#ff2fd0', '#8a3dff', '#2f6bff', '#18d8ff'].map(hex),
  },
  {
    key: 'ink',
    zh: '水墨',
    en: 'Ink Wash',
    sub: '墨在宣纸上晕开，浓淡随笔势变化',
    aside: 'curl 6 · paper grain',
    p: { curl: 6, velDiss: 0.9, dyeDiss: 0.2, pressure: 0.8, threshold: 0, radius: 0.28, force: 3000, amount: 0.085 },
    colors: [[1, 1, 1]],
  },
  {
    key: 'aurora',
    zh: '极光',
    en: 'Aurora',
    sub: '青绿与紫罗兰在夜空里缓慢交织',
    aside: 'curl 18 · night sky',
    p: { curl: 18, velDiss: 0.35, dyeDiss: 0.55, pressure: 0.8, threshold: 0.04, radius: 0.34, force: 4200, amount: 0.16 },
    colors: ['#1ff2a0', '#14c6c9', '#2f8cff', '#6f5bff', '#b25cff', '#4dffcf'].map(hex),
  },
]

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const SIM_RES = MOBILE ? 96 : 128
const DYE_RES = MOBILE ? 512 : 1024

type Ptr = { x: number; y: number; px: number; py: number; moved: boolean; inside: boolean; last: number; bursts: { x: number; y: number }[] }

function lerpColor(cols: [number, number, number][], t: number, out: number[]) {
  const n = cols.length
  const f = (((t % n) + n) % n)
  const i = Math.floor(f)
  const k = f - i
  const s = k * k * (3 - 2 * k)
  const a = cols[i]
  const b = cols[(i + 1) % n]
  out[0] = a[0] + (b[0] - a[0]) * s
  out[1] = a[1] + (b[1] - a[1]) * s
  out[2] = a[2] + (b[2] - a[2]) * s
}

function Fluid({ ptr, w, flush, modeIdx, kick }: { ptr: React.RefObject<Ptr>; w: MotionValue<number>[]; flush: MotionValue<number>; modeIdx: React.RefObject<number>; kick: React.RefObject<number> }) {
  const gl = useThree((s) => s.gl)
  const sim = useMemo(() => new FluidSim(gl, SIM_RES, DYE_RES), [gl])
  useEffect(() => () => sim.dispose(), [sim])

  const st = useRef({ time: 0, hue: Math.random() * 6, ghostT: Math.random() * 50, gx: -1, gy: -1, puff: 0.6, seeded: false, kick: 0 })
  const col = useRef([0, 0, 0])
  const params = useRef({ curl: 0, velDiss: 0, dyeDiss: 0, pressure: 0.8, threshold: 0, radius: 0, force: 0, amount: 0 })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 60)
    const s = st.current
    s.time += rawDt
    const canvas = gl.domElement
    sim.resize(canvas.width, canvas.height)
    const aspect = canvas.width / canvas.height

    // blend solver params by the animated mode weights
    const ws = [w[0].get(), w[1].get(), w[2].get()]
    const P = params.current
    for (const k of Object.keys(P) as (keyof typeof P)[]) {
      P[k] = ws[0] * MODES[0].p[k] + ws[1] * MODES[1].p[k] + ws[2] * MODES[2].p[k]
    }
    const mode = MODES[modeIdx.current]
    const isInk = mode.key === 'ink'

    const dye = (amt: number, hueShift = 0, ink = 1) => {
      if (isInk) {
        const v = amt * ink
        col.current[0] = v
        col.current[1] = v
        col.current[2] = v
      } else {
        lerpColor(mode.colors, s.hue + hueShift, col.current)
        col.current[0] *= amt
        col.current[1] *= amt
        col.current[2] *= amt
      }
      return col.current
    }

    // aurora: a wavy curtain of small splats drifting upward instead of a round puff
    const curtain = (strength: number) => {
      const y = 0.3 + Math.random() * 0.4
      const x0 = 0.08 + Math.random() * 0.45
      const span = 0.35 + Math.random() * 0.3
      const ph = Math.random() * 6
      const hue = Math.random() * 6
      const N = 16
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        const x = x0 + span * t
        const yy = y + Math.sin(t * 5 + ph) * 0.06
        lerpColor(mode.colors, hue + t * 1.6, col.current)
        const a = 0.22 * strength * (0.6 + 0.4 * Math.sin(t * Math.PI))
        sim.splat(x, yy, Math.cos(t * 5 + ph) * 120, (240 + Math.random() * 160) * strength, col.current[0] * a, col.current[1] * a, col.current[2] * a, P.radius * 0.45)
      }
    }

    // ink: a short tapering brush dab instead of a round blot
    const dab = (strength: number) => {
      const x = 0.15 + Math.random() * 0.7
      const y = 0.15 + Math.random() * 0.7
      const a = Math.random() * Math.PI * 2
      const bend = (Math.random() - 0.5) * 2.4
      const L = 0.08 + Math.random() * 0.1
      const k = 0.3 + Math.random() * 0.45
      const N = 9
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1)
        const ang = a + bend * t
        const px = x + Math.cos(ang) * L * t
        const py = y + Math.sin(ang) * L * t * aspect
        const v = k * (1 - t * 0.75) * strength
        sim.splat(px, py, Math.cos(ang) * 260, Math.sin(ang) * 260, v, v, v, P.radius * (0.55 - t * 0.3))
      }
    }

    const randomSplat = (strength = 1) => {
      if (mode.key === 'aurora') return curtain(strength)
      if (isInk) return dab(strength)
      const x = 0.15 + Math.random() * 0.7
      const y = 0.15 + Math.random() * 0.7
      const a = Math.random() * Math.PI * 2
      const v = (900 + Math.random() * 700) * strength
      const c = dye(isInk ? 0.25 + Math.random() * 0.45 : 0.6 + Math.random() * 0.4, Math.random() * 6, 1)
      sim.splat(x, y, Math.cos(a) * v, Math.sin(a) * v, c[0], c[1], c[2], P.radius * (0.6 + Math.random() * 0.6))
    }

    if (!s.seeded) {
      s.seeded = true
      if (POSTER) {
        // gallery poster: a composed, multi-hue band that curls up through the middle
        for (let i = 0; i < 12; i++) {
          const t = i / 11
          const x = 0.14 + 0.72 * t
          const y = 0.5 + 0.16 * Math.sin(t * 6.2)
          const a = Math.cos(t * 6.2) * 0.9 + (i % 2 ? 1.2 : -1.2)
          const c = dye(0.75, t * 5, 1)
          sim.splat(x, y, Math.cos(a) * 520, Math.sin(a) * 520, c[0], c[1], c[2], P.radius * 1.1)
        }
      } else for (let i = 0; i < 7; i++) randomSplat(1.2)
    }

    // mode switched → a few bursts in the new palette
    if (kick.current !== s.kick) {
      s.kick = kick.current
      for (let i = 0; i < (mode.key === 'aurora' ? 2 : 4); i++) randomSplat(mode.key === 'aurora' ? 0.9 : 1.1)
    }

    s.hue += dt * 0.6

    // a stroke from (x0,y0) to (x1,y1): sub-splats so fast moves draw a line, not dots
    const stroke = (x0: number, y0: number, x1: number, y1: number, gain: number) => {
      let dx = x1 - x0
      let dy = y1 - y0
      if (aspect < 1) dx *= aspect
      if (aspect > 1) dy /= aspect
      const len = Math.hypot((x1 - x0) * aspect, y1 - y0) // splat-shader space (x scaled by aspect)
      if (len < 1e-5) return
      const n = Math.min(12, Math.max(1, Math.ceil(len / 0.01)))
      // neighbouring gaussians overlap ≈ sqrt(π·r)/spacing times — divide it out so a fast
      // stroke carries the same velocity / dye per unit length as a single splat
      const r = (P.radius / 100) * Math.max(aspect, 1)
      const overlap = Math.min(n, Math.max(1, Math.sqrt(Math.PI * r) / (len / n)))
      const speed = len / Math.max(dt, 1 / 240)
      // ink: fast strokes run dry (飞白), slow ones pool
      const inkDensity = isInk ? 1.2 - Math.min(0.7, speed * 0.3) : 1
      // deposit per unit length: a slow or idle brush must not pool into a blot
      const lenK = Math.min(1, Math.max(isInk ? 0.03 : 0.35, len / 0.012))
      const c = dye((P.amount * gain * 2.2 * lenK) / overlap, 0, inkDensity)
      const fx = (dx * P.force * gain) / overlap
      const fy = (dy * P.force * gain) / overlap
      for (let i = 1; i <= n; i++) {
        const t = i / n
        sim.splat(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, fx, fy, c[0], c[1], c[2], P.radius)
      }
    }

    const p = ptr.current
    if (p.moved) {
      p.moved = false
      if (p.px >= 0) stroke(p.px, p.py, p.x, p.y, 1)
      p.px = p.x
      p.py = p.y
    }
    while (p.bursts.length) {
      const b = p.bursts.shift()!
      const c = dye(isInk ? 0.75 : 1.6, 0, 1)
      sim.splat(b.x, b.y, 0, 0, c[0], c[1], c[2], P.radius * 1.8)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3
        const v = isInk ? 420 : 650
        const cc = dye(isInk ? 0.12 : 0.18, i * 0.4, 1)
        sim.splat(b.x + Math.cos(a) * 0.02, b.y + Math.sin(a) * 0.02 * aspect, Math.cos(a) * v, Math.sin(a) * v, cc[0], cc[1], cc[2], P.radius * 1.4)
      }
    }

    // idle: an invisible brush draws slow arcs, plus the odd puff, so the stage is never empty
    const idle = POSTER || performance.now() - p.last > 2600
    if (idle) {
      s.ghostT += dt
      const t = s.ghostT
      const on = Math.sin(t * 0.8) > -0.35
      const gx = 0.5 + 0.33 * Math.sin(t * 0.41 + Math.sin(t * 0.17) * 1.6)
      const gy = 0.5 + 0.27 * Math.sin(t * 0.59 + 1.3) + 0.06 * Math.sin(t * 1.3)
      if (on && s.gx >= 0) stroke(s.gx, s.gy, gx, gy, isInk ? 0.75 : 0.6)
      s.gx = on ? gx : -1
      s.gy = gy
      s.puff -= dt
      if (s.puff <= 0) {
        s.puff = isInk ? 2.8 + Math.random() * 1.6 : 1.1 + Math.random() * 1.1
        randomSplat(0.8)
      }
    } else {
      s.gx = -1
    }

    const fl = flush.get()
    sim.step(dt, { curl: P.curl, velDiss: P.velDiss, dyeDiss: P.dyeDiss * (POSTER ? 0.3 : 1) + fl, pressure: P.pressure, threshold: P.threshold })
    ;(sim.display.uniforms.uW.value as { set: (a: number, b: number, c: number) => void }).set(ws[0], ws[1], ws[2])
    sim.render(s.time, 1 / state.viewport.dpr)
  }, 1)

  return null
}

export default function FluidInk() {
  const [idx, setIdx] = useState(0)
  const modeIdx = useRef(idx)
  const kick = useRef(0)
  const stage = useRef<HTMLDivElement>(null)
  const ptr = useRef<Ptr>({ x: 0, y: 0, px: -1, py: -1, moved: false, inside: false, last: -1e9, bursts: [] })
  const w0 = useMotionValue(1)
  const w1 = useMotionValue(0)
  const w2 = useMotionValue(0)
  const flush = useMotionValue(0)
  const ws = useMemo(() => [w0, w1, w2], [w0, w1, w2])
  const first = useRef(true)

  useEffect(() => {
    modeIdx.current = idx
    const ctrls = ws.map((m, i) => animate(m, i === idx ? 1 : 0, { duration: 1.1, ease: [0.45, 0, 0.2, 1] }))
    if (first.current) {
      first.current = false
      ws.forEach((m, i) => m.set(i === idx ? 1 : 0))
    } else {
      kick.current++
      flush.set(3.2)
      ctrls.push(animate(flush, 0, { duration: 1.6, ease: 'easeOut' }))
    }
    return () => ctrls.forEach((c) => c.stop())
  }, [idx, ws, flush])

  useEffect(() => {
    const el = stage.current!
    const toUv = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height] as const
    }
    const onMove = (e: PointerEvent) => {
      const p = ptr.current
      const [x, y] = toUv(e)
      if (x < 0 || x > 1 || y < 0 || y > 1) return
      // a fresh stroke after a pause starts where the pointer is now
      if (performance.now() - p.last > 120) {
        p.px = x
        p.py = y
      }
      p.x = x
      p.y = y
      p.moved = true
      p.last = performance.now()
    }
    const onDown = (e: PointerEvent) => {
      const p = ptr.current
      const [x, y] = toUv(e)
      p.bursts.push({ x, y })
      p.px = x
      p.py = y
      p.x = x
      p.y = y
      p.last = performance.now()
    }
    window.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
    }
  }, [])

  const mode = MODES[idx]
  const ink = mode.key === 'ink'

  return (
    <div className="stage fi-root" data-mode={mode.key} style={{ background: ink ? '#efe7d6' : '#07070c' }}>
      <style>{css}</style>
      <div ref={stage} className="fi-canvas">
        <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 1] }}>
          <Fluid ptr={ptr} w={ws} flush={flush} modeIdx={modeIdx} kick={kick} />
        </Canvas>
      </div>

      <div className="overlay fi-overlay">
        <div className="fi-label soft-text">
          <BigLabel
            id={mode.key}
            meta={`${String(idx + 1).padStart(2, '0')} / 03 · STABLE FLUIDS · ${SIM_RES}² SIM / ${DYE_RES}² DYE`}
            title={mode.zh}
            sub={mode.sub}
            aside={mode.aside}
          />
          <AnimatePresence>
            {ink && (
              <motion.span
                className="fi-seal"
                aria-hidden
                initial={{ opacity: 0, scale: 1.25, rotate: -8 }}
                animate={{ opacity: 1, scale: 1, rotate: -3 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.35 }}
              >
                <b>水</b>
                <b>墨</b>
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="dock">
          <Seg items={MODES.map((m, i) => ({ value: i, label: m.zh }))} value={idx} onChange={setIdx} />
        </div>
        <p className="hint">拖动鼠标搅动 · 点击溅开</p>
      </div>
    </div>
  )
}

const css = `
.fi-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.fi-root { transition: background .8s; }
.fi-overlay { transition: color .8s; }
.fi-label { --soft-bg: #07070c; }
.fi-root[data-mode='ink'] .fi-label { --soft-bg: #efe7d6; }
.fi-label .big-label-meta { font-size: 11px; letter-spacing: .1em; }
.fi-seal {
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: calc(104px + 132px);
  display: grid; grid-template-columns: 1fr; place-items: center; gap: 0;
  width: 38px; padding: 5px 0; border-radius: 4px;
  background: #b8322a; color: #f6e9dc;
  font: 600 15px/1.15 'STKaiti', 'KaiTi', 'Kaiti SC', serif;
  box-shadow: inset 0 0 0 2px #b8322a, inset 0 0 0 3.5px rgba(246,233,220,.75);
  pointer-events: none;
}
.fi-seal b { font-weight: 600 }
/* 水墨: the whole page (including the demo chrome) switches to a light, paper-toned scheme */
.demo-page:has(.fi-root[data-mode='ink']) {
  --fg: #1f1c18;
  --fg-2: rgba(31, 28, 24, .62);
  --glass: rgba(250, 245, 236, .6);
  --glass-line: rgba(31, 28, 24, .1);
  color-scheme: light;
}
.demo-page:has(.fi-root) .chip { transition: background .6s, color .6s; }
@media (max-width: 760px) {
  .fi-label .big-label p span { display: none; }
  .fi-seal { bottom: calc(92px + 112px); }
  .fi-label .big-label-meta { font-size: 10px; }
}
`
