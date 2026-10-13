import { Canvas, useFrame } from '@react-three/fiber'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'
import { Seg } from '../../components/Seg'

const G = 48 // grid size
const MODES = [
  { value: 'wave', label: '波浪' },
  { value: 'ripple', label: '涟漪' },
  { value: 'terrain', label: '地形' },
  { value: 'ziggurat', label: '阶梯塔' },
] as const
type Mode = (typeof MODES)[number]['value']

const fields: Record<Mode, (x: number, z: number, t: number) => number> = {
  wave: (x, z, t) => 1.2 + 1.05 * Math.sin(x * 0.36 + t * 1.1) * Math.cos(z * 0.29 + t * 0.8),
  ripple: (x, z, t) => {
    const d = Math.hypot(x, z)
    return 1.1 + 1.0 * Math.sin(d * 0.7 - t * 2.4) * Math.exp(-d * 0.04)
  },
  terrain: (x, z, t) => {
    const a = Math.sin(x * 0.23 + 1.3) * Math.cos(z * 0.19 - 0.4)
    const b = Math.sin(x * 0.51 - z * 0.37 + t * 0.35) * 0.45
    const c = Math.cos(x * 0.93 + z * 0.81 - t * 0.2) * 0.2
    return Math.max(0.15, 0.9 + (a + b + c) * 1.05)
  },
  ziggurat: (x, z, t) => {
    const r = Math.max(Math.abs(x), Math.abs(z))
    const lvl = Math.max(0, 7 - Math.floor(r / 1.5))
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.6 - r * 0.35)
    return 0.25 + lvl * (0.36 + 0.06 * breathe)
  },
}

const low = new THREE.Color('#e4def7')
const high = new THREE.Color('#6a55d4')
const hot = new THREE.Color('#ff8a6b')

function Field({ mode }: { mode: Mode }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const weights = useRef<Record<Mode, number>>({ wave: 1, ripple: 0, terrain: 0, ziggurat: 0 })
  const bump = useRef({ x: 0, z: 0, k: 0 })
  const heights = useMemo(() => new Float32Array(G * G).fill(0.9), [])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const col = useMemo(() => new THREE.Color(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -1), [])
  const hit = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, dt) => {
    const m = mesh.current
    if (!m) return
    dt = Math.min(dt, 1 / 20)
    const t = state.clock.elapsedTime
    const w = weights.current
    for (const k of Object.keys(w) as Mode[]) w[k] = THREE.MathUtils.damp(w[k], k === mode ? 1 : 0, 2.6, dt)

    // pointer → ground plane
    state.raycaster.setFromCamera(state.pointer, state.camera)
    const b = bump.current
    if (state.raycaster.ray.intersectPlane(plane, hit)) {
      b.x = THREE.MathUtils.damp(b.x, hit.x, 10, dt)
      b.z = THREE.MathUtils.damp(b.z, hit.z, 10, dt)
      const moved = state.pointer.x !== 0 || state.pointer.y !== 0
      b.k = THREE.MathUtils.damp(b.k, moved ? 1 : 0, 4, dt)
    }

    let i = 0
    for (let gx = 0; gx < G; gx++) {
      for (let gz = 0; gz < G; gz++) {
        const x = gx - G / 2 + 0.5
        const z = gz - G / 2 + 0.5
        let h = 0
        for (const k of Object.keys(w) as Mode[]) if (w[k] > 0.001) h += w[k] * fields[k](x, z, t)
        const d2 = (x - b.x) ** 2 + (z - b.z) ** 2
        const lift = b.k * 2.4 * Math.exp(-d2 / 5)
        // springy follow so columns lag a little behind the field
        heights[i] = THREE.MathUtils.damp(heights[i], h + lift, 9, dt)
        const hh = heights[i]
        dummy.position.set(x, hh / 2, z)
        dummy.scale.set(0.9, hh, 0.9)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        col.copy(low).lerp(high, THREE.MathUtils.clamp((hh - 0.4) / 1.9, 0, 1) ** 1.3)
        col.lerp(hot, THREE.MathUtils.clamp(lift / 2.4, 0, 1) * 0.85)
        m.setColorAt(i, col)
        i++
      }
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, G * G]} frustumCulled={false}>
      <boxGeometry />
      <meshLambertMaterial />
    </instancedMesh>
  )
}

export default function BlockField() {
  const [mode, setMode] = useState<Mode>('wave')
  const [auto, setAuto] = useState(true)
  const stage = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      setMode((m) => MODES[(MODES.findIndex((x) => x.value === m) + 1) % MODES.length].value)
    }, 5200)
    return () => clearInterval(id)
  }, [auto])

  return (
    <div ref={stage} className="stage" style={{ background: 'linear-gradient(180deg, #f6f3fb 0%, #e9e4f5 100%)' }}>
      <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} eventSource={stage} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={24} mobileFit={20} offset={[0.16, -0.04]} />
        <ambientLight intensity={1.05} />
        <directionalLight position={[3, 10, 6]} intensity={2.3} color="#fffaf5" />
        <Field mode={mode} />
      </Canvas>
      <div className="overlay">
        <motion.div
          className="hero-copy"
          style={{ pointerEvents: 'none', '--soft-bg': '#f1eef9' } as React.CSSProperties}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#7b68d8' }} /> Isometric · Feature
          </p>
          <h1>
            看得见的
            <br />
            数据起伏
          </h1>
          <p>2304 根柱体共用一个 InstancedMesh，每帧按高度场插值。切换形态时权重平滑过渡，指针所到之处会隆起。</p>
        </motion.div>
        <div className="dock">
          <Seg
            items={MODES as unknown as { value: Mode; label: string }[]}
            value={mode}
            onChange={(v) => {
              setMode(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '自动轮播 ●' : '自动轮播 ○'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
