import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0]

/** shared-element name used by the clicked gallery card and the demo page */
export const STAGE_VT = 'demo-stage'

/** the demo the visitor came back from — Home names that card so the page shrinks into it */
export const nav = { lastDemo: '', homeScroll: 0 }

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }

export const canMorph = () =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  !location.search.includes('poster')

export function useHashRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    let current = read()
    const on = () => {
      const next = read()
      if (next === current) return
      if (!current) nav.homeScroll = window.scrollY
      if (current) nav.lastDemo = current
      current = next
      const doc = document as VTDocument
      if (canMorph()) {
        document.documentElement.dataset.vt = next ? 'enter' : 'leave'
        const t = doc.startViewTransition!(() => flushSync(() => setRoute(next)))
        t.finished.finally(() => {
          delete document.documentElement.dataset.vt
          // names are only meaningful during the transition
          document.querySelectorAll<HTMLElement>('.card-media').forEach((el) => (el.style.viewTransitionName = ''))
        })
      } else {
        setRoute(next)
      }
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const go = (id: string) => {
  window.location.hash = id ? `/${id}` : '/'
}
