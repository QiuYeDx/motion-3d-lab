import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion, useScroll, useSpring, type MotionValue } from 'motion/react'
import { useRef } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'

/* keyframes: [progress, x, y, z, rotY] — progress comes from Motion's useScroll */
type KF = [number, number, number, number, number][]

function kf(p: number, frames: KF, out: number[]) {
  if (p <= frames[0][0]) return frames[0].slice(1).forEach((v, i) => (out[i] = v))
  for (let i = 1; i < frames.length; i++) {
    const [p1] = frames[i]
    if (p <= p1) {
      const a = frames[i - 1]
      const b = frames[i]
      const k = (p - a[0]) / (b[0] - a[0])
      const e = k * k * (3 - 2 * k)
      for (let j = 0; j < 4; j++) out[j] = a[j + 1] + (b[j + 1] - a[j + 1]) * e
      return
    }
  }
  frames[frames.length - 1].slice(1).forEach((v, i) => (out[i] = v))
}

const MODULES = [
  { color: '#2b2a33', home: [-0.85, 0.85], grid: [-2.7, -2.7], h: 0 },
  { color: '#f2c46d', home: [0.85, 0.85], grid: [2.7, -2.7], h: 1 },
  { color: '#3b6cf6', home: [-0.85, -0.85], grid: [-2.7, 2.7], h: 2 },
  { color: '#f6f3ee', home: [0.85, -0.85], grid: [2.7, 2.7], h: 3 },
]

function moduleFrames(m: (typeof MODULES)[number]): KF {
  const [hx, hz] = m.home
  const [gx, gz] = m.grid
  const ex = hx * 1.9
  const ez = hz * 1.9
  return [
    [0.0, hx, 0.95, hz, 0],
    [0.3, hx, 0.95, hz, 0],
    [0.42, ex, 2.2 + m.h * 0.25, ez, 0.4],
    [0.52, ex, 2.2 + m.h * 0.25, ez, 0.4],
    [0.62, gx, 0.85, gz, 0],
    [0.7, gx, 0.85, gz, 0],
    [0.8, 0, 0.85 + m.h * 1.72, 0, Math.PI / 2],
    [0.86, 0, 0.85 + m.h * 1.72, 0, Math.PI / 2],
    [0.96, hx, 0.95, hz, Math.PI * 2],
    [1, hx, 0.95, hz, Math.PI * 2],
  ]
}

const LID: KF = [
  [0, 0, 2.55, 0, 0],
  [0.12, 0, 2.55, 0, 0],
  [0.28, -1.6, 5.4, 1.6, 0.5],
  [0.86, -1.6, 5.4, 1.6, 0.5],
  [0.97, 0, 2.55, 0, 0],
]
const SHELL: KF = [
  [0, 0, 1.15, 0, 0],
  [0.18, 0, 1.15, 0, 0],
  [0.36, 0, -4.6, 0, 0],
  [0.86, 0, -4.6, 0, 0],
  [0.97, 0, 1.15, 0, 0],
]

function Product({ progress }: { progress: MotionValue<number> }) {
  const root = useRef<THREE.Group>(null)
  const lid = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Group>(null)
  const shellMat = useRef<THREE.MeshLambertMaterial>(null)
  const mods = useRef<THREE.Group[]>([])
  const frames = MODULES.map(moduleFrames)
  const v = [0, 0, 0, 0]

  useFrame((s) => {
    const p = progress.get()
    if (root.current) root.current.rotation.y = -p * Math.PI * 0.5 + Math.sin(s.clock.elapsedTime * 0.5) * 0.04
    if (lid.current) {
      kf(p, LID, v)
      lid.current.position.set(v[0], v[1], v[2])
      lid.current.rotation.z = v[3]
    }
    if (shell.current) {
      kf(p, SHELL, v)
      shell.current.position.set(v[0], v[1], v[2])
      if (shellMat.current) shellMat.current.opacity = THREE.MathUtils.clamp(1 - (1.15 - v[1]) / 4.5, 0, 1)
    }
    mods.current.forEach((g, i) => {
      if (!g) return
      kf(p, frames[i], v)
      g.position.set(v[0], v[1], v[2])
      g.rotation.y = v[3]
    })
  })

  return (
    <group ref={root}>
      <RoundedBox args={[4.4, 0.3, 4.4]} radius={0.1} position={[0, -0.15, 0]}>
        <meshLambertMaterial color="#d9d4ca" />
      </RoundedBox>
      <group ref={shell}>
        <RoundedBox args={[4.2, 2.3, 4.2]} radius={0.16}>
          <meshLambertMaterial ref={shellMat} color="#e0573a" transparent />
        </RoundedBox>
      </group>
      <group ref={lid}>
        <RoundedBox args={[4.4, 0.36, 4.4]} radius={0.14}>
          <meshLambertMaterial color="#f6f3ee" />
        </RoundedBox>
        <mesh position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.75, 48]} />
          <meshBasicMaterial color="#e0573a" />
        </mesh>
      </group>
      {MODULES.map((m, i) => (
        <group key={i} ref={(g) => void (mods.current[i] = g!)}>
          <RoundedBox args={[1.55, 1.55, 1.55]} radius={0.16} smoothness={4}>
            <meshLambertMaterial color={m.color} />
          </RoundedBox>
          <mesh position={[0, 0.79, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.32, 32]} />
            <meshBasicMaterial color={i === 0 ? '#f2c46d' : '#2b2a33'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

const CHAPTERS = [
  { k: '00', t: '一个盒子', d: '向下滚动。整段 3D 动画只由一个 scrollYProgress 驱动，经 useSpring 平滑后交给 useFrame 读取。', side: 'left' },
  { k: '01', t: '打开它', d: '盖子抬起、外壳下沉。每个部件是一组关键帧 [进度, x, y, z, 旋转]，在相邻帧间做 smoothstep 插值。', side: 'right' },
  { k: '02', t: '四个模块', d: '模块散开、错落悬停，再平铺成 2 × 2 的网格——适合配合功能列表逐项讲解。', side: 'left' },
  { k: '03', t: '重新堆叠', d: '同样的四个模块，换一种组合就是另一种叙事：从“并列”变成“层级”。', side: 'right' },
  { k: '04', t: '合上，交付', d: '回到起点，形成闭环。往回滚动时一切倒放，这是滚动驱动相比时间驱动最大的好处。', side: 'left' },
]

export default function ScrollStory() {
  const scroller = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: scroller })
  const smooth = useSpring(scrollYProgress, { stiffness: 90, damping: 22, mass: 0.6 })

  return (
    <div ref={scroller} className="stage" style={{ overflowY: 'auto', overflowX: 'hidden', background: 'linear-gradient(180deg, #f3f1ec, #ebe6dc)' }}>
      <div style={{ position: 'sticky', top: 0, height: '100dvh', marginBottom: '-100dvh' }}>
        <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
          <IsoRig fit={15} mobileFit={17} target={[0, 1.4, 0]} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[4, 10, 6]} intensity={1.8} />
          <Product progress={smooth} />
        </Canvas>
      </div>

      <motion.div
        aria-hidden
        style={{
          position: 'fixed',
          right: 24,
          top: '30vh',
          width: 2,
          height: '40vh',
          borderRadius: 2,
          background: 'rgba(29,28,26,.12)',
          zIndex: 2,
        }}
      >
        <motion.div style={{ width: '100%', height: '100%', background: '#e0573a', borderRadius: 2, scaleY: smooth, transformOrigin: 'top' }} />
      </motion.div>

      {CHAPTERS.map((c, i) => (
        <section key={c.k} style={{ position: 'relative', height: i === 0 ? '100vh' : '120vh', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          <motion.div
            className="story-card"
            data-side={c.side}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ root: scroller, amount: 0.6 }}
            transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            <span>{c.k}</span>
            <h2>{c.t}</h2>
            <p>{c.d}</p>
            {i === 0 && <em>↓ scroll</em>}
          </motion.div>
        </section>
      ))}
      <div style={{ height: '40vh' }} />
      <style>{`
        .story-card { position: relative; z-index: 3; width: min(380px, calc(100% - 48px)); margin-left: clamp(24px, 7vw, 120px);
          color: var(--ink); }
        .story-card[data-side='right'] { margin-left: auto; margin-right: clamp(40px, 7vw, 120px); }
        .story-card span { font: 500 12px/1 var(--mono); color: #e0573a; }
        .story-card h2 { margin: 12px 0 0; font: 600 clamp(34px, 4vw, 52px)/1.05 var(--display); letter-spacing: -0.03em; }
        .story-card p { margin: 16px 0 0; font-size: 15.5px; line-height: 1.75; color: var(--ink-2); }
        .story-card em { display: inline-block; margin-top: 20px; font: 12px var(--mono); color: var(--ink-3); }
        @media (max-width: 760px) {
          section { align-items: flex-end !important; padding-bottom: 12vh; }
          .story-card, .story-card[data-side='right'] { margin: 0 24px; padding: 16px 18px; border-radius: 16px;
            background: rgba(243,241,236,.82); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        }
      `}</style>
    </div>
  )
}
