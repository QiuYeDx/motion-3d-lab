import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/*
 * "原图" before / after split for the stylize showcase pages (sketch + mosaic).
 * The lib's wipe coordinate is wipeCoord = 0.84·x + 0.16·y (x, y = 0..1, y from the top), so the split
 * is a slightly slanted line; this draws that exact line plus a draggable knob at mid-height.
 *
 *   const split = useOriginalSplit()
 *   <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} />
 *   <OriginalSplit split={split} label="素描" />
 */

export type SplitState = {
  on: boolean // the original is in the pipeline (stays true while sliding out)
  open: boolean // UI state
  wipe: MotionValue<number>
  toggle: () => void
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export function useOriginalSplit(start = 0.56): SplitState {
  const [on, setOn] = useState(false)
  const [open, setOpen] = useState(false)
  const wipe = useMotionValue(0)
  const pos = useRef(start)
  const anim = useRef<{ stop: () => void } | null>(null)
  const toggle = () => {
    anim.current?.stop()
    if (!open) {
      setOn(true)
      setOpen(true)
      wipe.set(0)
      anim.current = animate(wipe, pos.current, { type: 'spring', stiffness: 140, damping: 22 })
    } else {
      setOpen(false)
      pos.current = clamp(wipe.get(), 0.12, 0.9)
      anim.current = animate(wipe, 0, { duration: 0.55, ease: [0.65, 0, 0.35, 1], onComplete: () => setOn(false) })
    }
  }
  useEffect(() => () => anim.current?.stop(), [])
  return { on, open, wipe, toggle }
}

export function OriginalSplit({ split, label }: { split: SplitState; label: string }) {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const { wipe } = split
  const x1 = useTransform(wipe, (w) => (vp.w * w) / 0.84)
  const x2 = useTransform(wipe, (w) => (vp.w * (w - 0.16)) / 0.84)
  const kx = useTransform(wipe, (w) => (vp.w * (w - 0.08)) / 0.84)

  const drag = useRef<number | null>(null)
  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    drag.current = e.pointerId
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (drag.current !== e.pointerId) return
    wipe.set(clamp((0.84 * e.clientX) / vp.w + 0.08, 0.06, 0.94))
  }
  const onUp = (e: React.PointerEvent) => {
    if (drag.current === e.pointerId) drag.current = null
  }

  return (
    <AnimatePresence>
      {split.open && (
        <motion.div
          className="osplit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <style>{css}</style>
          <svg className="osplit-line" width={vp.w} height={vp.h}>
            <motion.line x1={x1} y1={0} x2={x2} y2={vp.h} stroke="rgba(0,0,0,.22)" strokeWidth={4} />
            <motion.line x1={x1} y1={0} x2={x2} y2={vp.h} stroke="#fff" strokeWidth={1.5} />
          </svg>
          <motion.div
            className="osplit-knob"
            style={{ x: kx, y: vp.h / 2 }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
          >
            <span className="osplit-tag l">原图</span>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
              <path d="M8 6 L3 11 L8 16 M14 6 L19 11 L14 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="osplit-tag r">{label}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const css = `
.overlay > .osplit { position: absolute; inset: 0; pointer-events: none; }
.osplit-line { position: absolute; left: 0; top: 0; pointer-events: none; }
.osplit-knob {
  position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; pointer-events: auto; cursor: ew-resize; touch-action: none;
  background: #fff; color: #1d1c1a; box-shadow: 0 6px 20px -6px rgba(0,0,0,.4), 0 0 0 1px rgba(0,0,0,.06);
}
.osplit-tag {
  position: absolute; top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
  padding: 5px 9px; border-radius: 999px; font: 500 11.5px/1 var(--sans); letter-spacing: .02em;
  background: rgba(20, 20, 22, .72); color: #fff; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.osplit-tag.l { right: 54px; }
.osplit-tag.r { left: 54px; }
`
