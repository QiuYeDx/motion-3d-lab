import { motion } from 'motion/react'
import { useLayoutEffect, useState } from 'react'
import { demos, groups, type DemoMeta } from '../demos/registry'
import { nav, STAGE_VT } from '../lib/router'

const ease = [0.23, 1, 0.32, 1] as const

export default function Home() {
  const [returning] = useState(() => nav.lastDemo !== '')
  // runs inside the view-transition update, so the returning card is on screen for the "new" snapshot
  useLayoutEffect(() => {
    window.scrollTo(0, nav.homeScroll)
  }, [])

  return (
    <main className="home">
      <header className="home-hero">
        <motion.p className="eyebrow" initial={returning ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
          React · Three.js · Motion
        </motion.p>
        <motion.h1 initial={returning ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05, ease }}>
          Motion 3D Lab
        </motion.h1>
        <motion.p className="lede" initial={returning ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1, ease }}>
          一组 3D 创意小样：等距空间、粒子几何、材质光影与交互实验。每个都可以直接拆进产品页、首页和 Landing 页，做主视觉或“配菜”。
        </motion.p>
        <motion.ol className="toc" initial={returning ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}>
          {groups.map((g) => (
            <li key={g.id}>
              <a href={`#/`} onClick={(e) => { e.preventDefault(); document.getElementById(`g-${g.id}`)?.scrollIntoView({ behavior: 'smooth' }) }}>
                <span>{g.no}</span>
                {g.title}
                <em>{demos.filter((d) => d.group === g.id).length}</em>
              </a>
            </li>
          ))}
        </motion.ol>
      </header>

      {groups.map((g) => (
        <section key={g.id} id={`g-${g.id}`} className="group">
          <div className="group-head">
            <span className="group-no">{g.no}</span>
            <div>
              <h2>
                {g.title} <em>{g.en}</em>
              </h2>
              <p>{g.desc}</p>
            </div>
          </div>
          <div className="grid">
            {demos
              .filter((d) => d.group === g.id)
              .map((d, i, list) => (
                <Card key={d.id} demo={d} delay={i * 0.05} span={spanFor(i, list.length)} instant={returning} />
              ))}
          </div>
        </section>
      ))}

      <footer className="home-foot">
        <span>Esc 返回目录 · Alt + ← / → 切换 demo</span>
        <span>motion-3d-lab</span>
      </footer>
    </main>
  )
}

/** 6-column grid: rows of thirds; leftovers become leading half-width rows so no row is ragged */
function spanFor(i: number, n: number) {
  const halves = n % 3 === 1 ? 4 : n % 3 === 2 ? 2 : 0
  return i < halves ? 3 : 2
}

function Card({ demo, delay, span, instant }: { demo: DemoMeta; delay: number; span: number; instant: boolean }) {
  const [poster, setPoster] = useState(true)
  const n = demos.indexOf(demo) + 1
  return (
    <motion.a
      href={`#/${demo.id}`}
      className="card"
      data-span={span}
      onClick={(e) => {
        const media = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.card-media')
        if (media) media.style.viewTransitionName = STAGE_VT
      }}
      initial={instant ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay, ease }}
    >
      <div
        className="card-media"
        style={{
          viewTransitionName: nav.lastDemo === demo.id ? STAGE_VT : undefined,
          background: `radial-gradient(120% 90% at 70% 30%, ${demo.swatch[1]}55, ${demo.swatch[0]} 70%)`,
        }}
      >
        {poster && <img src={`posters/${demo.id}.webp`} alt="" loading={instant ? 'eager' : 'lazy'} onError={() => setPoster(false)} />}
      </div>
      {/* outside the media box so it doesn't get scaled up by the morph */}
      <span className={`card-no theme-${demo.theme}`}>{String(n).padStart(2, '0')}</span>
      <div className="card-body">
        <h3>
          {demo.title}
          <em>{demo.en}</em>
        </h3>
        <p>{demo.desc}</p>
        <ul className="tags">
          {demo.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </motion.a>
  )
}
