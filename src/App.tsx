import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { demos } from './demos/registry'
import { canMorph, useHashRoute } from './lib/router'
import Home from './components/Home'
import DemoPage from './components/DemoPage'

export default function App() {
  const route = useHashRoute()
  const demo = demos.find((d) => d.id === route)

  useEffect(() => {
    document.title = demo ? `${demo.title} · Motion 3D Lab` : 'Motion 3D Lab'
  }, [demo])

  const page = demo ? <DemoPage key={demo.id} demo={demo} /> : <Home key="home" />

  // With the View Transition API the browser morphs between snapshots, so swap pages instantly.
  if (canMorph()) return page

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={demo?.id ?? 'home'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      >
        {page}
      </motion.div>
    </AnimatePresence>
  )
}
