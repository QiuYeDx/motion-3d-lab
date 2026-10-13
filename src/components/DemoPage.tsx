import { Suspense, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { demos, type DemoMeta } from '../demos/registry'
import { go, STAGE_VT } from '../lib/router'

export default function DemoPage({ demo }: { demo: DemoMeta }) {
  const i = demos.indexOf(demo)
  const prev = demos[(i - 1 + demos.length) % demos.length]
  const next = demos[(i + 1) % demos.length]
  const { Component } = demo
  // the gallery poster covers the stage while the chunk loads and the first frames settle,
  // so the card → page morph lands on a picture instead of an empty canvas
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      if (e.key === 'Escape') go('')
      if (e.key === 'ArrowRight' && e.altKey) go(next.id)
      if (e.key === 'ArrowLeft' && e.altKey) go(prev.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next])

  return (
    <div className={`demo-page theme-${demo.theme}`} style={{ background: demo.swatch[0], viewTransitionName: STAGE_VT }}>
      <Suspense fallback={null}>
        <Component />
        <Mounted onMount={() => setReady(true)} />
      </Suspense>
      <motion.img
        className="demo-poster"
        src={`posters/${demo.id}.webp`}
        alt=""
        aria-hidden
        initial={false}
        animate={{ opacity: ready ? 0 : 1 }}
        transition={{ delay: ready ? 0.5 : 0, duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
      />
      <motion.nav
        className="demo-chrome"
        style={{ viewTransitionName: 'demo-chrome' }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      >
        <a className="chip chip-back" href="#/" aria-label="返回目录">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Lab
        </a>
        <span className="chip chip-title">
          <b>{String(i + 1).padStart(2, '0')}</b>
          {demo.title}
          <em>{demo.en}</em>
        </span>
        <span className="chip-pager">
          <a className="chip" href={`#/${prev.id}`} aria-label={`上一个：${prev.title}`} title={prev.title}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a className="chip" href={`#/${next.id}`} aria-label={`下一个：${next.title}`} title={next.title}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="m5.5 3 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </span>
      </motion.nav>
    </div>
  )
}

function Mounted({ onMount }: { onMount: () => void }) {
  const cb = useRef(onMount)
  cb.current = onMount
  useEffect(() => {
    // two frames: let the canvas draw before revealing it
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(() => cb.current())))
    return () => cancelAnimationFrame(raf)
  }, [])
  return null
}
