import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { startWebGPU } from './millionGPU'
import { bindRig, createRig } from './millionRig'

const MillionFallback = lazy(() => import('./MillionFallback'))

const COUNT = 1_000_000
const FALLBACK_SIZE = 512 // 262,144 particles

const PRESETS = [
  { key: 'lorenz', zh: '洛伦兹', en: 'Lorenz Attractor', aside: "σ=10 ρ=28 β=8/3" },
  { key: 'thomas', zh: '托马斯', en: 'Thomas Attractor', aside: "x' = sin y − bx" },
  { key: 'vortex', zh: '旋涡', en: 'Spiral Vortex', aside: '2 log-arms · flat rotation' },
  { key: 'nebula', zh: '星云', en: 'Curl Nebula', aside: 'curl ∇×ψ · 2 octaves' },
]

/** debug switch: `?nogpu` forces the WebGL fallback */
const FORCE_FALLBACK = typeof location !== 'undefined' && /[?&]nogpu\b/.test(location.search + location.hash)

type Mode = 'probe' | 'webgpu' | 'webgl'

export default function WebGPUMillion() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const [mode, setMode] = useState<Mode>(() => (FORCE_FALLBACK || typeof navigator === 'undefined' || !('gpu' in navigator) ? 'webgl' : 'probe'))
  const [fps, setFps] = useState(0)
  const [gen, setGen] = useState(0)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  const w0 = useMotionValue(1)
  const w1 = useMotionValue(0)
  const w2 = useMotionValue(0)
  const w3 = useMotionValue(0)
  const weights = useMemo(() => [w0, w1, w2, w3], [w0, w1, w2, w3])
  const rig = useMemo(() => createRig(() => [w0.get(), w1.get(), w2.get(), w3.get()]), [w0, w1, w2, w3])

  // crossfade the field weights (Motion owns the timeline, the GPU reads .get() each frame)
  useEffect(() => {
    const ctrls = weights.map((w, i) => animate(w, i === idx ? 1 : 0, { duration: 2.6, ease: [0.45, 0, 0.2, 1] }))
    return () => ctrls.forEach((c) => c.stop())
  }, [idx, weights])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % PRESETS.length), 10000)
    return () => clearInterval(id)
  }, [auto])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    return bindRig(el, rig)
  }, [rig])

  // WebGPU path: probe → run; any failure (or a second device loss) drops to WebGL
  useEffect(() => {
    if (mode === 'webgl' || !canvas.current) return
    let alive = true
    let engine: { destroy: () => void } | null = null
    startWebGPU({
      canvas: canvas.current,
      count: COUNT,
      rig,
      onStats: (f) => alive && setFps(f),
      onLost: (msg) => {
        if (!alive) return
        console.warn('WebGPU device lost:', msg)
        if (gen < 1) setGen((g) => g + 1)
        else setMode('webgl')
      },
    })
      .then((e) => {
        if (!alive) return e.destroy()
        engine = e
        setMode('webgpu')
      })
      .catch((err) => {
        if (!alive) return
        console.warn('WebGPU unavailable, falling back to WebGL:', err)
        setMode('webgl')
      })
    return () => {
      alive = false
      engine?.destroy()
    }
    // mode flips probe → webgpu after start; only (re)start on generation / fallback changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen, mode === 'webgl', rig])

  const preset = PRESETS[idx]
  const n = mode === 'webgl' ? FALLBACK_SIZE * FALLBACK_SIZE : COUNT
  const api = mode === 'webgl' ? 'WebGL GPGPU' : 'WebGPU compute'
  const narrow = typeof window !== 'undefined' && window.innerWidth < 520
  const meta = `${n.toLocaleString()}${narrow ? '' : ' particles'} · ${api}${fps ? ` · ${Math.round(fps)} fps` : ''}`

  return (
    <div ref={stage} className="stage mil-stage" style={{ background: '#05050a', touchAction: 'none' }}>
      <style>{`
        .mil-stage { cursor: grab; }
        .mil-stage:active { cursor: grabbing; }
        .mil-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .mil-chip {
          position: absolute; left: clamp(24px, 6vw, 96px); top: 76px;
          display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px;
          border-radius: 999px; font: 500 12px/1 var(--mono); color: #ffd9a8;
          background: rgba(255, 170, 80, 0.1); box-shadow: inset 0 0 0 1px rgba(255, 190, 120, 0.22);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        }
        .mil-chip i { width: 6px; height: 6px; border-radius: 50%; background: #ffb062; }
        .mil-fps { font-variant-numeric: tabular-nums; }
      `}</style>

      {mode !== 'webgl' ? (
        <canvas key={gen} ref={canvas} className="mil-canvas" />
      ) : (
        <Suspense fallback={null}>
          <MillionFallback size={FALLBACK_SIZE} rig={rig} onStats={setFps} />
        </Suspense>
      )}

      <div className="overlay">
        <AnimatePresence>
          {mode === 'webgl' && (
            <motion.p
              className="mil-chip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <i /> WebGPU 不可用 · 已退回 WebGL 26 万粒子
            </motion.p>
          )}
        </AnimatePresence>
        <BigLabel id={preset.key} meta={meta} title={preset.zh} sub={preset.en} aside={preset.aside} />
        <div className="dock">
          <Seg
            items={PRESETS.map((p, i) => ({ value: i, label: p.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '轮播'}</span>
          </button>
        </div>
        <p className="hint">
          指针是一口引力井 · 拖动旋转视角
          <br />
          每帧 1 次 compute pass 积分全部粒子
        </p>
      </div>
    </div>
  )
}
