import { Canvas, useFrame } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { MorphCloud, type MorphCloudHandle } from '../../lib/MorphCloud'
import { shuffle3, sphere, textPoints } from '../../lib/shapes'

const COUNT = typeof window !== 'undefined' && window.innerWidth < 760 ? 16000 : 30000
const WORDS = ['MOTION', '等距 × 粒子', '3D LAB', '你好，世界', 'SHIP IT']
const PALETTES: [string, string, string][] = [
  ['#ff6b4a', '#ffb36b', '#fff1e6'],
  ['#6b8cff', '#b48cff', '#eef0ff'],
  ['#3fd2c7', '#8be0a4', '#eafffb'],
  ['#ff7bd5', '#ffb36b', '#fff0fa'],
  ['#f2c46d', '#ff8a5c', '#fff7e6'],
]

/** world width visible at z=0 for the camera below (z=8, fov 42) */
function fitWidth(text: string) {
  const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 1.6
  const visible = 2 * 8 * Math.tan(THREE.MathUtils.degToRad(21)) * aspect
  return Math.min(7.4, visible * 0.86, 1.25 * text.length + 1.2)
}

function Tilt({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame((s, dt) => {
    if (!g.current) return
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, s.pointer.x * 0.35, 3, dt)
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -s.pointer.y * 0.25, 3, dt)
  })
  return <group ref={g}>{children}</group>
}

export default function ParticleType() {
  const cloud = useRef<MorphCloudHandle>(null)
  const [word, setWord] = useState(WORDS[0])
  const [pal, setPal] = useState(0)
  const [draft, setDraft] = useState('')
  const [auto, setAuto] = useState(true)
  const shell = useMemo(() => {
    const s = shuffle3(sphere(COUNT))
    for (let i = 0; i < s.length; i++) s[i] *= 1.25
    return s
  }, [])
  const initial = useMemo(() => textPoints(WORDS[0], COUNT, fitWidth(WORDS[0])), [])
  const timers = useRef<number[]>([])

  const show = useCallback(
    (text: string, p: number) => {
      timers.current.forEach(clearTimeout)
      cloud.current?.morphTo(shell, { duration: 1.6, scatter: 1.4 })
      timers.current = [
        window.setTimeout(() => {
          setWord(text)
          setPal(p)
          cloud.current?.morphTo(textPoints(text, COUNT, fitWidth(text)), { duration: 2.4, scatter: 0.6 })
        }, 1250),
      ]
    },
    [shell],
  )

  useEffect(() => {
    if (!auto) return
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % WORDS.length
      show(WORDS[i], i % PALETTES.length)
    }, 5600)
    return () => clearInterval(id)
  }, [auto, show])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  return (
    <div className="stage" style={{ background: 'radial-gradient(90% 70% at 50% 45%, #1a1416 0%, #0b0a0c 72%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 42 }} gl={{ antialias: false, alpha: true }}>
        <Tilt>
          <MorphCloud ref={cloud} count={COUNT} initial={initial} colors={PALETTES[pal]} size={40} stagger={0.5} />
        </Tilt>
      </Canvas>
      <div className="overlay">
        <div className="big-label" style={{ bottom: 104 }}>
          <p className="big-label-meta">{COUNT.toLocaleString()} particles · canvas-sampled glyphs</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={word}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              style={{ margin: 0, font: '500 15px/1.4 var(--sans)', color: 'var(--fg-2)' }}
            >
              当前：<span style={{ color: 'var(--fg)' }}>{word}</span>
            </motion.p>
          </AnimatePresence>
        </div>
        <form
          className="dock"
          onSubmit={(e) => {
            e.preventDefault()
            const t = draft.trim().slice(0, 14)
            if (!t) return
            setAuto(false)
            show(t, (pal + 1) % PALETTES.length)
            setDraft('')
          }}
        >
          <input
            className="type-input"
            value={draft}
            maxLength={14}
            placeholder="输入一个词，回车"
            onChange={(e) => setDraft(e.target.value)}
            aria-label="自定义文字"
          />
          <button className="seg" type="submit" aria-pressed={!!draft.trim()}>
            <span>生成</span>
          </button>
          <span className="dock-sep" />
          <button className="seg" type="button" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停轮播' : '继续轮播'}</span>
          </button>
        </form>
      </div>
      <style>{`
        .type-input { width: 200px; height: 34px; padding: 0 14px; border: 0; border-radius: 999px; outline: none;
          background: color-mix(in srgb, var(--fg) 8%, transparent); color: var(--fg); font: 14px var(--sans); }
        .type-input::placeholder { color: var(--fg-2); }
        .type-input:focus-visible { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 35%, transparent); }
        @media (max-width: 760px) { .type-input { width: 140px; } }
      `}</style>
    </div>
  )
}
