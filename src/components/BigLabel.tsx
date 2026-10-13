import { AnimatePresence, motion } from 'motion/react'

/** Bottom-left label that swaps with a blur/slide when `id` changes. */
export function BigLabel({ id, meta, title, sub, aside }: { id: string; meta: string; title: string; sub: string; aside?: string }) {
  return (
    <div className="big-label">
      <p className="big-label-meta">{meta}</p>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={id}
          initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
        >
          <h1>{title}</h1>
          <p>
            {sub}
            {aside && <span>{aside}</span>}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
