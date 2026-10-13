import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'
import { MorphCloud, type MorphCloudHandle } from '../../lib/MorphCloud'
import { galaxy, helix, lattice, mobius, saddle, shuffle3, sphere, torusKnot, type ShapeFn } from '../../lib/shapes'

const COUNT = typeof window !== 'undefined' && window.innerWidth < 760 ? 22000 : 42000

type Shape = { key: string; zh: string; en: string; fn: ShapeFn; colors: [string, string, string]; formula: string }

const SHAPES: Shape[] = [
  { key: 'sphere', zh: '球面', en: 'Fibonacci Sphere', fn: sphere, colors: ['#7f9bff', '#b79bff', '#f1f3ff'], formula: 'θ = i · 137.5°' },
  { key: 'knot', zh: '环面结', en: 'Torus Knot (2,3)', fn: torusKnot, colors: ['#ff6b8b', '#ffb36b', '#fff1e0'], formula: 'p = 2, q = 3' },
  { key: 'helix', zh: '双螺旋', en: 'Double Helix', fn: helix, colors: ['#3fd2c7', '#5b9bff', '#e6fffb'], formula: 'r = 1, 2.6 turns' },
  { key: 'saddle', zh: '马鞍面', en: 'Hyperbolic Paraboloid', fn: saddle, colors: ['#f2c46d', '#ff8a5c', '#fff6df'], formula: 'y = x² − z²' },
  { key: 'lattice', zh: '晶格', en: 'Cubic Lattice', fn: lattice, colors: ['#8be0a4', '#4fc3f7', '#f0fff4'], formula: '4 × 4 × 4 nodes' },
  { key: 'mobius', zh: '莫比乌斯带', en: 'Möbius Strip', fn: mobius, colors: ['#c58bff', '#ff7bd5', '#fbefff'], formula: 'one side, one edge' },
  { key: 'galaxy', zh: '旋臂星系', en: 'Spiral Galaxy', fn: galaxy, colors: ['#ffb36b', '#6b8cff', '#fff8ec'], formula: '3 arms, r^1.6' },
]

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const scale = usePortraitScale()
  useFrame((s, dt) => {
    if (!g.current) return
    g.current.rotation.y += dt * 0.12
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, 0.35 + s.pointer.y * -0.25, 2.5, dt)
    g.current.rotation.z = THREE.MathUtils.damp(g.current.rotation.z, s.pointer.x * -0.15, 2.5, dt)
  })
  return (
    <group ref={g} scale={scale}>
      {children}
    </group>
  )
}

export default function ShapeMorph() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const cloud = useRef<MorphCloudHandle>(null)
  const targets = useMemo(() => SHAPES.map((s) => shuffle3(s.fn(COUNT))), [])
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    cloud.current?.morphTo(targets[idx], { duration: 2.8 })
  }, [idx, targets])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % SHAPES.length), 5200)
    return () => clearInterval(id)
  }, [auto])

  const shape = SHAPES[idx]

  return (
    <div className="stage" style={{ background: 'radial-gradient(90% 70% at 50% 45%, #141a33 0%, #090b16 70%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8.5], fov: 45 }} gl={{ antialias: false, alpha: true }}>
        <Rig>
          <MorphCloud ref={cloud} count={COUNT} initial={targets[0]} colors={shape.colors} size={52} />
        </Rig>
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={shape.key}
          meta={`${String(idx + 1).padStart(2, '0')} / ${String(SHAPES.length).padStart(2, '0')} · ${COUNT.toLocaleString()} particles`}
          title={shape.zh}
          sub={shape.en}
          aside={shape.formula}
        />

        <div className="dock">
          <Seg
            items={SHAPES.map((s, i) => ({ value: i, label: s.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '播放'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
