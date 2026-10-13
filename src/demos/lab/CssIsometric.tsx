import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

/*
 * No WebGL: a dashboard laid out with normal CSS grid, then tilted into an isometric plane with
 * rotateX(55°) rotateZ(-45°). Every card keeps preserve-3d so its inner chips can float on Z.
 * Toggling "flat" springs the plane back to 0° — the same DOM, readable as a regular UI.
 */

const spring = { type: 'spring', stiffness: 110, damping: 18, mass: 0.9 } as const

type CardDef = { id: string; area: string; title: string; tone: string; body: React.ReactNode }

const bars = [38, 62, 48, 80, 56, 92, 70]

const CARDS: CardDef[] = [
  {
    id: 'rev',
    area: '1 / 1 / 2 / 3',
    title: '本周营收',
    tone: '#3b6cf6',
    body: (
      <div className="iso-chart">
        {bars.map((h, i) => (
          <i key={i} style={{ height: `${h}%`, opacity: i === 5 ? 1 : 0.35 + i * 0.06 }} />
        ))}
        <b className="float" style={{ left: '68%', bottom: '92%' }}>
          ¥ 128,400
        </b>
      </div>
    ),
  },
  {
    id: 'user',
    area: '1 / 3 / 2 / 4',
    title: '活跃用户',
    tone: '#ff6b4a',
    body: (
      <div className="iso-kpi">
        <strong>24.8k</strong>
        <span>+12.4%</span>
        <div className="ring float" />
      </div>
    ),
  },
  {
    id: 'team',
    area: '2 / 1 / 3 / 2',
    title: '团队',
    tone: '#3f9a72',
    body: (
      <div className="iso-avatars">
        {['#ffb36b', '#6b8cff', '#3fd2c7', '#ff7bd5'].map((c, i) => (
          <i key={c} className="float" style={{ background: c, transitionDelay: `${i * 40}ms` }} />
        ))}
      </div>
    ),
  },
  {
    id: 'tasks',
    area: '2 / 2 / 4 / 3',
    title: '任务',
    tone: '#7b68d8',
    body: (
      <ul className="iso-list">
        {['设计评审', '粒子性能优化', '等距插画', '发布 v2.0', '写周报'].map((t, i) => (
          <li key={t} className={i === 1 ? 'float' : ''}>
            <i data-done={i > 2} />
            {t}
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'map',
    area: '2 / 3 / 3 / 4',
    title: '地区分布',
    tone: '#f2c46d',
    body: (
      <div className="iso-dots">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} className={i === 9 || i === 14 ? 'float' : ''} style={{ opacity: [0.2, 0.5, 1][(i * 7) % 3] }} />
        ))}
      </div>
    ),
  },
  {
    id: 'cta',
    area: '3 / 1 / 4 / 2',
    title: '升级',
    tone: '#1d1c1a',
    body: (
      <div className="iso-cta">
        <span className="float">Pro</span>
        <p>解锁全部 3D 组件</p>
      </div>
    ),
  },
  {
    id: 'log',
    area: '3 / 3 / 4 / 4',
    title: '部署',
    tone: '#3fd2c7',
    body: (
      <div className="iso-log">
        <code>✓ build 14.2s</code>
        <code>✓ test 238 passed</code>
        <code className="float">→ deploying…</code>
      </div>
    ),
  },
]

export default function CssIsometric() {
  const [flat, setFlat] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const reduce = useReducedMotion()
  const [entered, setEntered] = useState(false)
  // the viewport reserves room for the copy on desktop; once flat (copy hidden) slide back to centre
  const flatShift = typeof window !== 'undefined' && window.innerWidth >= 760 ? -Math.min(window.innerWidth * 0.13, 190) : 0
  useEffect(() => {
    const id = setTimeout(() => setEntered(true), 1400)
    return () => clearTimeout(id)
  }, [])

  return (
    <div className="stage iso-css-stage">
      <div className="iso-viewport">
        <motion.div
          className="iso-plane"
          data-flat={flat}
          initial={reduce ? false : { rotateX: 55, rotateZ: -45, scale: 0.7, opacity: 0 }}
          animate={flat ? { rotateX: 0, rotateZ: 0, scale: 1, opacity: 1, x: flatShift } : { rotateX: 55, rotateZ: -45, scale: 0.86, opacity: 1, x: 0 }}
          transition={spring}
        >
          {CARDS.map((c, i) => (
            <motion.article
              key={c.id}
              className="iso-card"
              style={{ gridArea: c.area, '--tone': c.tone } as React.CSSProperties}
              initial={reduce ? false : { z: 260, opacity: 0 }}
              animate={{ z: !flat && hover === c.id ? 46 : 0, opacity: 1 }}
              transition={{ ...spring, delay: entered ? 0 : 0.25 + i * 0.07 }}
              onHoverStart={() => setHover(c.id)}
              onHoverEnd={() => setHover((h) => (h === c.id ? null : h))}
              data-hover={hover === c.id}
            >
              <header>
                <i />
                {c.title}
              </header>
              {c.body}
            </motion.article>
          ))}
        </motion.div>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          style={{ pointerEvents: 'none' }}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: flat ? 0 : 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#3b6cf6' }} /> CSS 3D · No WebGL
          </p>
          <h1>
            界面本身
            <br />
            就是插画
          </h1>
          <p>普通的 CSS Grid 仪表盘，倾斜成等距平面。悬停的卡片沿 Z 轴抬起，里面的元素再各自浮起一层。</p>
        </motion.div>
        <div className="dock">
          <button className="seg" aria-pressed={!flat} onClick={() => setFlat(false)}>
            {!flat && <motion.span layoutId="css-iso-seg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>等距</span>
          </button>
          <button className="seg" aria-pressed={flat} onClick={() => setFlat(true)}>
            {flat && <motion.span layoutId="css-iso-seg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>展平</span>
          </button>
        </div>
      </div>

      <style>{`
        .iso-css-stage { background: radial-gradient(110% 90% at 60% 40%, #f7f8fb 0%, #e6eaf2 100%); }
        .iso-css-stage .scrim { --soft-bg: #eef1f6; }
        .iso-viewport { position: absolute; inset: 0; display: grid; place-items: center; perspective: 2400px;
          padding-left: min(26vw, 380px); }
        @media (max-width: 760px) { .iso-viewport { padding-left: 0; place-items: start center; padding-top: 80px; } }
        .iso-plane { width: 760px; height: 600px; display: grid; gap: 22px; grid-template-columns: 1.15fr 1fr 1fr;
          grid-template-rows: 1fr 1fr 0.9fr; transform-style: preserve-3d; }
        @media (max-width: 760px) { .iso-plane { width: 520px; height: 440px; gap: 14px; zoom: 0.68; } }
        .iso-card { position: relative; padding: 18px 18px 16px; border-radius: 18px; background: #fff;
          transform-style: preserve-3d; color: #1d1c1a; display: flex; flex-direction: column; min-width: 0;
          box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 0 0 1px rgba(29,28,26,.06), 14px 14px 0 -4px rgba(40,50,80,.08);
          transition: box-shadow .4s var(--ease-out); }
        .iso-card[data-hover='true'] { box-shadow: 0 0 0 1px rgba(29,28,26,.06), 46px 46px 40px -8px rgba(40,50,80,.22); }
        .iso-plane[data-flat='true'] .iso-card { box-shadow: 0 1px 0 rgba(0,0,0,.04), 0 0 0 1px rgba(29,28,26,.06), 0 12px 24px -16px rgba(40,50,80,.3); }
        .iso-card header { display: flex; align-items: center; gap: 8px; font: 600 13px/1 var(--sans); color: #57534c; }
        .iso-card header i { width: 8px; height: 8px; border-radius: 3px; background: var(--tone); }
        .iso-card .float { transform: translateZ(0); transition: transform .5s var(--ease-out); }
        .iso-card[data-hover='true'] .float { transform: translateZ(34px); }
        .iso-plane[data-flat='true'] .float { transform: none !important; }

        .iso-chart { position: relative; flex: 1; display: flex; align-items: flex-end; gap: 10px; margin-top: 18px;
          transform-style: preserve-3d; }
        .iso-chart i { flex: 1; border-radius: 6px 6px 3px 3px; background: var(--tone); }
        .iso-chart b { position: absolute; padding: 6px 10px; border-radius: 8px; background: #1d1c1a; color: #fff;
          font: 600 12px/1 var(--mono); white-space: nowrap; transform-origin: bottom; }
        .iso-kpi { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; position: relative; transform-style: preserve-3d; }
        .iso-kpi strong { font: 600 40px/1 var(--display); letter-spacing: -.03em; }
        .iso-kpi span { margin-top: 6px; font: 600 12px var(--mono); color: #3f9a72; }
        .iso-kpi .ring { position: absolute; right: 0; top: 4px; width: 64px; height: 64px; border-radius: 50%;
          background: conic-gradient(var(--tone) 0 72%, #f1ece6 0); -webkit-mask: radial-gradient(circle, transparent 52%, #000 54%); mask: radial-gradient(circle, transparent 52%, #000 54%); }
        .iso-avatars { flex: 1; display: flex; align-items: center; transform-style: preserve-3d; }
        .iso-avatars i { width: 40px; height: 40px; margin-right: -10px; border-radius: 50%; box-shadow: 0 0 0 3px #fff; }
        .iso-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; transform-style: preserve-3d; }
        .iso-list li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
          background: #f5f3f8; font-size: 13px; }
        .iso-list li.float { background: var(--tone); color: #fff; }
        .iso-list li i { width: 14px; height: 14px; border-radius: 5px; box-shadow: inset 0 0 0 1.5px currentColor; opacity: .5; }
        .iso-list li i[data-done='true'] { background: currentColor; opacity: .3; }
        .iso-dots { flex: 1; display: grid; grid-template-columns: repeat(8, 1fr); align-content: center; gap: 8px;
          margin-top: 10px; transform-style: preserve-3d; }
        .iso-dots i { aspect-ratio: 1; border-radius: 50%; background: var(--tone); }
        .iso-cta { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; transform-style: preserve-3d; }
        .iso-cta span { align-self: flex-start; padding: 8px 14px; border-radius: 999px; background: #1d1c1a; color: #fff;
          font: 600 14px/1 var(--display); }
        .iso-cta p { margin: 10px 0 0; font-size: 13px; color: #57534c; }
        .iso-log { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; transform-style: preserve-3d; }
        .iso-log code { padding: 6px 10px; border-radius: 8px; background: #f2f6f6; font: 12px var(--mono); color: #3f5d5a; }
        .iso-log code.float { background: #1d1c1a; color: #8be0d6; }
      `}</style>
    </div>
  )
}
