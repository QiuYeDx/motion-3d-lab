import { motion } from 'motion/react'
import { useId } from 'react'

type Item<T> = { value: T; label: string }

/** Segmented control with a shared-layout highlight (Motion layoutId). */
export function Seg<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: Item<T>[]
  value: T
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <>
      {items.map((it) => (
        <button key={String(it.value)} className="seg" aria-pressed={it.value === value} onClick={() => onChange(it.value)}>
          {it.value === value && (
            <motion.span layoutId={id} className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
          )}
          <span>{it.label}</span>
        </button>
      ))}
    </>
  )
}
