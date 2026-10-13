import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useRef } from 'react'

const ease = [0.23, 1, 0.32, 1] as const

/** a layer that sits at `depth` px on Z and drifts against the pointer for extra parallax */
function Layer({ depth, mx, my, children, className }: { depth: number; mx: MotionValue<number>; my: MotionValue<number>; children: React.ReactNode; className?: string }) {
  const x = useTransform(mx, [0, 1], [-depth * 0.35, depth * 0.35])
  const y = useTransform(my, [0, 1], [-depth * 0.25, depth * 0.25])
  return (
    <motion.div className={`dc-layer ${className ?? ''}`} style={{ z: depth, x, y }}>
      {children}
    </motion.div>
  )
}

function Card({ i, tone, title, en, art, front }: { i: number; tone: [string, string]; title: string; en: string; art: React.ReactNode; front: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const sx = useSpring(mx, { stiffness: 170, damping: 18, mass: 0.6 })
  const sy = useSpring(my, { stiffness: 170, damping: 18, mass: 0.6 })
  const rotateY = useTransform(sx, [0, 1], [-14, 14])
  const rotateX = useTransform(sy, [0, 1], [11, -11])
  const gx = useTransform(sx, (v) => `${v * 100}%`)
  const gy = useTransform(sy, (v) => `${v * 100}%`)
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,.28), rgba(255,255,255,0) 55%)`
  const lift = useSpring(0, { stiffness: 220, damping: 20 })

  return (
    <motion.div
      className="dc-wrap"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.15 + i * 0.1, ease }}
    >
      <motion.div
        ref={ref}
        className="dc-card"
        style={{ rotateX, rotateY, z: lift, background: `linear-gradient(150deg, ${tone[0]}, ${tone[1]})` }}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect()
          mx.set((e.clientX - r.left) / r.width)
          my.set((e.clientY - r.top) / r.height)
        }}
        onPointerEnter={() => lift.set(40)}
        onPointerLeave={() => {
          mx.set(0.5)
          my.set(0.5)
          lift.set(0)
        }}
      >
        <Layer depth={20} mx={sx} my={sy} className="dc-art">
          {art}
        </Layer>
        <Layer depth={70} mx={sx} my={sy} className="dc-front">
          {front}
        </Layer>
        <Layer depth={44} mx={sx} my={sy} className="dc-text">
          <span>{String(i + 1).padStart(2, '0')}</span>
          <h3>{title}</h3>
          <p>{en}</p>
        </Layer>
        <motion.div className="dc-glare" style={{ background: glare }} />
      </motion.div>
    </motion.div>
  )
}

function IsoCubes() {
  const cube = (x: number, y: number, s: number, c: [string, string, string]) => (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 ${-s} L${s * 0.866} ${-s / 2} L0 0 L${-s * 0.866} ${-s / 2}Z`} fill={c[0]} />
      <path d={`M${-s * 0.866} ${-s / 2} L0 0 L0 ${s} L${-s * 0.866} ${s / 2}Z`} fill={c[1]} />
      <path d={`M${s * 0.866} ${-s / 2} L0 0 L0 ${s} L${s * 0.866} ${s / 2}Z`} fill={c[2]} />
    </g>
  )
  const c: [string, string, string] = ['#efe6ff', '#b69cff', '#8a6cf0']
  return (
    <svg viewBox="-120 -120 240 240" width="100%" height="100%">
      {cube(-52, 30, 44, c)}
      {cube(52, 30, 44, c)}
      {cube(0, 0, 44, c)}
      {cube(0, -60, 44, ['#fff3ea', '#ffb59a', '#ff8a6b'])}
    </svg>
  )
}

function Orbits() {
  return (
    <svg viewBox="-120 -120 240 240" width="100%" height="100%" fill="none">
      {[40, 70, 100].map((r, i) => (
        <ellipse key={r} rx={r} ry={r * 0.42} stroke="rgba(255,255,255,.35)" strokeWidth="1.2" transform={`rotate(${-18 + i * 4})`} />
      ))}
      <circle r="22" fill="#fff4dd" />
      <circle r="22" fill="url(#g1)" />
      <defs>
        <radialGradient id="g1" cx="0.35" cy="0.35">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#f2a65a" />
        </radialGradient>
      </defs>
    </svg>
  )
}

function Waves() {
  return (
    <svg viewBox="0 0 240 240" width="100%" height="100%" fill="none" preserveAspectRatio="none">
      {Array.from({ length: 9 }, (_, i) => {
        const y = 60 + i * 16
        const a = 14 + i * 2
        return (
          <path
            key={i}
            d={`M-10 ${y} C 50 ${y - a}, 90 ${y + a}, 130 ${y} S 210 ${y - a}, 250 ${y}`}
            stroke={`rgba(255,255,255,${0.12 + i * 0.06})`}
            strokeWidth="1.6"
          />
        )
      })}
    </svg>
  )
}

export default function DepthCards() {
  return (
    <div className="stage dc-stage">
      <motion.header className="dc-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
        <p>2.5D · Motion springs · CSS translateZ</p>
        <h1>把指针变成光源</h1>
      </motion.header>
      <div className="dc-row">
        <Card
          i={0}
          tone={['#2a2140', '#5b46a8']}
          title="等距方块"
          en="Isometric stack"
          art={<IsoCubes />}
          front={<span className="dc-chip">3 layers</span>}
        />
        <Card
          i={1}
          tone={['#3b2318', '#b8643a']}
          title="轨道"
          en="Orbit system"
          art={<Orbits />}
          front={<span className="dc-dot" />}
        />
        <Card
          i={2}
          tone={['#0f2a2c', '#1f7f7a']}
          title="波纹"
          en="Layered waves"
          art={<Waves />}
          front={<span className="dc-chip">spring</span>}
        />
      </div>
      <p className="hint">在卡片上移动指针</p>
      <style>{`
        .dc-stage { overflow-y: auto; background: radial-gradient(90% 70% at 50% 30%, #1c1b26 0%, #0e0e13 75%); color: var(--fg); }
        .dc-head { text-align: center; padding: 96px 24px 0; }
        .dc-head p { margin: 0; font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2); }
        .dc-head h1 { margin: 14px 0 0; font: 600 clamp(34px, 4.4vw, 56px)/1.05 var(--display); letter-spacing: -0.03em; }
        .dc-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 36px; padding: 56px 24px 96px; perspective: 1100px; }
        .dc-wrap { transform-style: preserve-3d; }
        .dc-card { position: relative; width: 300px; height: 400px; border-radius: 26px; transform-style: preserve-3d;
          box-shadow: 0 40px 80px -30px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.08); cursor: pointer; }
        .dc-layer { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
        .dc-art { inset: 40px 24px 120px; }
        .dc-text { inset: auto 26px 26px; }
        .dc-text span { font: 500 11px/1 var(--mono); color: rgba(255,255,255,.55); }
        .dc-text h3 { margin: 10px 0 0; font: 600 26px/1.1 var(--display); color: #fff; }
        .dc-text p { margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,.6); }
        .dc-front { inset: 24px 24px auto auto; }
        .dc-chip { display: inline-block; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,.9);
          color: #15141a; font: 600 12px/1 var(--mono); box-shadow: 0 10px 20px -8px rgba(0,0,0,.5); }
        .dc-dot { display: block; width: 18px; height: 18px; border-radius: 50%; background: #fff4dd;
          box-shadow: 0 0 0 6px rgba(255,244,221,.18), 0 10px 20px -6px rgba(0,0,0,.5); }
        .dc-glare { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; mix-blend-mode: soft-light; }
        @media (max-width: 760px) { .dc-card { width: 260px; height: 340px; } .dc-head { padding-top: 80px; } }
      `}</style>
    </div>
  )
}
