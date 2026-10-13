import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { animate, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'

type Layer = { key: string; name: string; en: string; desc: string; slab: string; item: string }

const LAYERS: Layer[] = [
  { key: 'ui', name: '界面层', en: 'Interface', desc: '组件、主题与交互，面向用户的一切。', slab: '#fdfcf9', item: '#3f9a72' },
  { key: 'flow', name: '编排层', en: 'Orchestration', desc: '把请求拆成任务、排队、重试与回调。', slab: '#cdeedd', item: '#ff8a5c' },
  { key: 'model', name: '模型层', en: 'Models', desc: '推理、检索与评估，可以热切换。', slab: '#93d4b3', item: '#2f6f8f' },
  { key: 'data', name: '数据层', en: 'Data', desc: '事件流、向量索引与冷存储。', slab: '#4fa880', item: '#f6f1e7' },
]
const SLAB = 6
const THICK = 0.34

function Items({ k, color }: { k: string; color: string }) {
  const mat = <meshLambertMaterial color={color} />
  if (k === 'ui')
    return (
      <group>
        {[
          [-1.6, -1.4, 2, 1.4],
          [1.2, -1.4, 2.2, 1.4],
          [-1.6, 1.0, 2, 2.2],
          [1.2, 1.0, 2.2, 0.8],
          [1.2, 2.0, 2.2, 0.6],
        ].map(([x, z, w, d], i) => (
          <RoundedBox key={i} args={[w, 0.12, d]} radius={0.05} position={[x, 0.06, z]}>
            <meshLambertMaterial color={i === 0 ? color : '#e8efe9'} />
          </RoundedBox>
        ))}
      </group>
    )
  if (k === 'flow') {
    const nodes: [number, number][] = [
      [-1.8, -1.6],
      [0, -1.6],
      [1.8, -1.6],
      [-0.9, 0.4],
      [0.9, 0.4],
      [0, 2],
    ]
    return (
      <group>
        {nodes.map(([x, z], i) => (
          <mesh key={i} position={[x, 0.2, z]}>
            <cylinderGeometry args={[0.32, 0.32, 0.4, 24]} />
            {i === 5 ? mat : <meshLambertMaterial color="#fffaf3" />}
          </mesh>
        ))}
        {[
          [0, 3],
          [1, 3],
          [1, 4],
          [2, 4],
          [3, 5],
          [4, 5],
        ].map(([a, b], i) => {
          const A = nodes[a]
          const B = nodes[b]
          const len = Math.hypot(B[0] - A[0], B[1] - A[1])
          return (
            <mesh key={i} position={[(A[0] + B[0]) / 2, 0.08, (A[1] + B[1]) / 2]} rotation={[0, -Math.atan2(B[1] - A[1], B[0] - A[0]), 0]}>
              <boxGeometry args={[len, 0.06, 0.08]} />
              <meshLambertMaterial color={color} />
            </mesh>
          )
        })}
      </group>
    )
  }
  if (k === 'model')
    return (
      <group>
        {[-1.6, 0, 1.6].flatMap((x) =>
          [-1.6, 0, 1.6].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.36, z]}>
              <sphereGeometry args={[x === 0 && z === 0 ? 0.55 : 0.32, 24, 16]} />
              <meshLambertMaterial color={x === 0 && z === 0 ? color : '#e9f5ef'} />
            </mesh>
          )),
        )}
      </group>
    )
  return (
    <group>
      {[-1.5, 0.3].flatMap((x) =>
        [-1.2, 1.2].map((z) => (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            {[0, 1, 2].map((s) => (
              <mesh key={s} position={[0, 0.14 + s * 0.3, 0]}>
                <cylinderGeometry args={[0.62, 0.62, 0.24, 32]} />
                <meshLambertMaterial color={color} />
              </mesh>
            ))}
          </group>
        )),
      )}
      <RoundedBox args={[0.9, 1.2, 3.2]} radius={0.08} position={[2.1, 0.6, 0]}>
        <meshLambertMaterial color="#d7efe2" />
      </RoundedBox>
    </group>
  )
}

function Slab({
  layer,
  index,
  gap,
  active,
  onHover,
}: {
  layer: Layer
  index: number
  gap: MotionValue<number>
  active: string | null
  onHover: (k: string | null) => void
}) {
  const ref = useRef<THREE.Group>(null)
  const lift = useRef(0)
  const fade = useRef(1)
  const mats = useRef<THREE.Material[]>([])

  useEffect(() => {
    const list: THREE.Material[] = []
    ref.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) {
        m.transparent = true
        list.push(m)
      }
    })
    mats.current = list
  }, [])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    const isActive = active === layer.key
    lift.current = THREE.MathUtils.damp(lift.current, isActive ? 0.45 : 0, 8, dt)
    fade.current = THREE.MathUtils.damp(fade.current, active && !isActive ? 0.28 : 1, 8, dt)
    const n = LAYERS.length - 1 - index
    g.position.y = n * (THICK + gap.get()) + lift.current
    for (const m of mats.current) m.opacity = fade.current
  })

  return (
    <group
      ref={ref}
      onPointerOver={(e) => {
        e.stopPropagation()
        onHover(layer.key)
      }}
      onPointerOut={() => onHover(null)}
    >
      <RoundedBox args={[SLAB, THICK, SLAB]} radius={0.12} smoothness={4} position={[0, -THICK / 2, 0]}>
        <meshLambertMaterial color={layer.slab} />
      </RoundedBox>
      <Items k={layer.key} color={layer.item} />
    </group>
  )
}

/** packets riding up through the stack */
function Packets({ gap }: { gap: MotionValue<number> }) {
  const refs = useRef<THREE.Mesh[]>([])
  const lanes = useMemo(
    () => [
      [-2.6, 2.6, 0],
      [2.6, -2.6, 0.33],
      [2.6, 2.6, 0.66],
      [-2.6, -2.6, 0.5],
    ],
    [],
  )
  useFrame((s) => {
    const top = (LAYERS.length - 1) * (THICK + gap.get()) + 0.4
    refs.current.forEach((m, i) => {
      if (!m) return
      const [x, z, off] = lanes[i]
      const u = (s.clock.elapsedTime * 0.28 + off) % 1
      m.position.set(x, -0.2 + u * (top + 0.2), z)
      const sc = Math.sin(u * Math.PI)
      m.scale.setScalar(0.4 + sc * 0.6)
    })
  })
  return (
    <>
      {lanes.map((_, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m!)}>
          <boxGeometry args={[0.26, 0.26, 0.26]} />
          <meshBasicMaterial color="#ff8a5c" />
        </mesh>
      ))}
    </>
  )
}

export default function LayerStack() {
  const gap = useMotionValue(1.2)
  const [active, setActive] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const loop = useRef<AnimationPlaybackControls | null>(null)

  // breathe: collapse ↔ explode, paused while something is focused or pinned open
  useEffect(() => {
    loop.current?.stop()
    if (active) {
      loop.current = animate(gap, 2.5, { type: 'spring', stiffness: 120, damping: 18 })
    } else if (expanded) {
      loop.current = animate(gap, [gap.get(), 2.6, 2.6, 1.15, 1.15, 2.6], {
        duration: 7,
        times: [0, 0.14, 0.45, 0.6, 0.78, 1],
        ease: 'easeInOut',
        repeat: Infinity,
      })
    } else {
      loop.current = animate(gap, 1.1, { type: 'spring', stiffness: 160, damping: 20 })
    }
    return () => loop.current?.stop()
  }, [active, expanded, gap])

  return (
    <div className="stage" style={{ background: 'linear-gradient(180deg, #f5f8f4 0%, #e3efe7 100%)' }}>
      <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={21} mobileFit={25} mobileOffsetY={0.24} offset={[0.18, -0.02]} target={[0, 4.6, 0]} />
        <ambientLight intensity={1.15} />
        <directionalLight position={[4, 10, 7]} intensity={1.9} />
        <group>
          {LAYERS.map((l, i) => (
            <Slab key={l.key} layer={l} index={i} gap={gap} active={active} onHover={setActive} />
          ))}
          <Packets gap={gap} />
        </group>
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="kicker">
            <i style={{ background: '#3f9a72' }} /> Isometric · Architecture
          </p>
          <h1>
            四层架构
            <br />
            一眼看懂
          </h1>
          <ul className="layer-list" onMouseLeave={() => setActive(null)}>
            {LAYERS.map((l, i) => (
              <li
                key={l.key}
                data-active={active === l.key}
                data-dim={!!active && active !== l.key}
                onMouseEnter={() => setActive(l.key)}
              >
                <span className="ll-no">L{i + 1}</span>
                <span className="ll-swatch" style={{ background: l.slab }} />
                <div>
                  <b>
                    {l.name} <em>{l.en}</em>
                  </b>
                  <p>{l.desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="hero-actions">
            <button className="btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? '收拢' : '展开循环'}
            </button>
          </div>
        </motion.div>
      </div>
      <style>{`
        .layer-list { list-style: none; margin: 24px 0 0; padding: 0; display: grid; gap: 2px; }
        .layer-list li { display: grid; grid-template-columns: 28px 14px 1fr; gap: 12px; align-items: start;
          padding: 10px 12px; margin: 0 -12px; border-radius: 12px; cursor: default;
          transition: background .25s, opacity .25s; }
        .layer-list li[data-active='true'] { background: rgba(255,255,255,.75); }
        .layer-list li[data-dim='true'] { opacity: .45; }
        .layer-list .ll-no { font: 500 11px/20px var(--mono); color: var(--fg-2); }
        .layer-list .ll-swatch { width: 14px; height: 14px; margin-top: 3px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
        .layer-list b { font-weight: 600; font-size: 15px; line-height: 20px; }
        .layer-list b em { font-weight: 400; color: var(--fg-2); font-size: 12px; margin-left: 4px; }
        .layer-list p { margin: 2px 0 0 !important; font-size: 13px !important; line-height: 1.6 !important; }
        @media (max-width: 760px) { .layer-list p { display: none; } }
      `}</style>
    </div>
  )
}
