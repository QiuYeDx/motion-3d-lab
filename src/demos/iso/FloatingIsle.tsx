import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'

/* palette — dusty Monument-Valley pastels */
const C = {
  top: '#f4e4d4',
  rock: '#e59a7c',
  rock2: '#c96f6b',
  deep: '#8a4f6e',
  deeper: '#5e3a5f',
  tower: '#f7efe6',
  roof: '#e86f62',
  door: '#3a2740',
  teal: '#78bdb5',
  bridge: '#f0c7a0',
  goal: '#ffd166',
  tree: '#8cc3a5',
}

type V3 = [number, number, number]

function Block({ p, s, c, cast = true }: { p: V3; s: V3; c: string; cast?: boolean }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshLambertMaterial color={c} />
    </mesh>
  )
}

/** inverted stepped pyramid under a plateau, so it reads as a floating rock */
function Rock({ x, z, w, d, layers = 4 }: { x: number; z: number; w: number; d: number; layers?: number }) {
  const cols = [C.rock, C.rock2, C.deep, C.deeper, C.deeper]
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: layers }, (_, i) => {
        const k = 1 - i * (0.78 / layers)
        return <Block key={i} p={[0, -0.5 - i, 0]} s={[w * k, 1, d * k]} c={i === 0 ? C.rock : cols[i]} />
      })}
    </group>
  )
}

function Tree({ p, h = 1 }: { p: V3; h?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.3, 6]} />
        <meshLambertMaterial color={C.deep} />
      </mesh>
      <mesh position={[0, 0.3 + 0.45 * h, 0]} castShadow>
        <coneGeometry args={[0.32 * h, 0.9 * h, 4]} />
        <meshLambertMaterial color={C.tree} flatShading />
      </mesh>
    </group>
  )
}

function Tower() {
  return (
    <group position={[-1.5, 0, -1.5]}>
      <Block p={[0, 1.6, 0]} s={[1.8, 3.2, 1.8]} c={C.tower} />
      <Block p={[0, 3.35, 0]} s={[2.1, 0.3, 2.1]} c={C.rock} />
      {/* crenellations */}
      {[-0.8, 0.8].flatMap((x) => [-0.8, 0.8].map((z) => <Block key={`${x}${z}`} p={[x, 3.7, z]} s={[0.45, 0.4, 0.45]} c={C.tower} />))}
      <mesh position={[0, 4.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.95, 1.2, 4]} />
        <meshLambertMaterial color={C.roof} flatShading />
      </mesh>
      {/* door on +z face, arch on top */}
      <Block p={[0, 0.45, 0.91]} s={[0.56, 0.9, 0.04]} c={C.door} cast={false} />
      <mesh position={[0, 0.9, 0.91]}>
        <cylinderGeometry args={[0.28, 0.28, 0.04, 16, 1, false, 0, Math.PI]} />
        <meshBasicMaterial color={C.door} />
      </mesh>
      {/* slit windows */}
      <Block p={[0.91, 2.1, 0]} s={[0.04, 0.6, 0.18]} c={C.door} cast={false} />
      <Block p={[0, 2.3, 0.91]} s={[0.18, 0.5, 0.04]} c={C.door} cast={false} />
    </group>
  )
}

function Gate({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Block p={[-0.55, 0.55, 0]} s={[0.22, 1.1, 0.22]} c={C.teal} />
      <Block p={[0.55, 0.55, 0]} s={[0.22, 1.1, 0.22]} c={C.teal} />
      <Block p={[0, 1.18, 0]} s={[1.5, 0.18, 0.3]} c={C.teal} />
    </group>
  )
}

/* ------------------------------------------------------------------ walker path */

const BRIDGE_PIVOT: V3 = [3, 0, 1.5]
const BRIDGE_LEN = 2.6

// a closed tour around the main isle; index 5 is the "bridge end" decision point
const TOUR: V3[] = [
  [-1.5, 0, -0.45], // door
  [-1.5, 0, 1.6],
  [1.5, 0, 1.6],
  [1.5, 0, 0.7],
  [1.5, 0.5, 0.25],
  [1.5, 1.0, -0.25],
  [1.5, 1.5, -1.0],
  [1.5, 1.0, -0.25],
  [1.5, 0.5, 0.25],
  [1.5, 0, 0.7],
  [2.6, 0, 1.5], // bridge end
  [-0.2, 0, 1.6],
  [-1.5, 0, 1.2],
]
const BRIDGE_STOP = 10
const CROSSING: V3[] = [
  [4.3, 0, 1.5],
  [6.3, 0, 1.5],
  [6.3, 0, 1.5],
  [4.3, 0, 1.5],
  [2.6, 0, 1.5],
]

function Walker({ bridgeAngle, onBusy }: { bridgeAngle: MotionValue<number>; onBusy: (busy: boolean) => void }) {
  const ref = useRef<THREE.Group>(null)
  const st = useRef({ seg: 0, queue: [...TOUR.slice(1), TOUR[0]] as V3[], from: TOUR[0], t: 0, wait: 0, crossing: false })

  useFrame((state, dt) => {
    const s = st.current
    const g = ref.current
    if (!g) return
    dt = Math.min(dt, 1 / 20)
    const to = s.queue[0]
    const dist = Math.hypot(to[0] - s.from[0], to[1] - s.from[1], to[2] - s.from[2]) || 0.0001
    if (s.wait > 0) {
      s.wait -= dt
    } else {
      s.t += (dt * 1.15) / dist
    }
    if (s.t >= 1) {
      s.t = 0
      s.from = to
      s.queue.shift()
      // reached the bridge end on the tour?
      if (!s.crossing && to === TOUR[BRIDGE_STOP]) {
        const a = ((bridgeAngle.get() % 360) + 360) % 360
        const aligned = (a < 2 || a > 358) && Math.abs(bridgeAngle.getVelocity()) < 30
        if (aligned) {
          s.crossing = true
          onBusy(true)
          s.queue.unshift(...CROSSING)
          s.wait = 0.25
        } else {
          s.wait = 0.8 // look at the gap, then carry on
        }
      } else if (s.crossing && s.queue.length === TOUR.length - BRIDGE_STOP) {
        s.crossing = false
        onBusy(false)
      }
      if (to[0] === 6.3 && s.queue[0][0] === 6.3) s.wait = 1.2 // rest at the goal
      if (s.queue.length === 0) s.queue = [...TOUR.slice(1), TOUR[0]]
    }
    const k = s.t
    const x = THREE.MathUtils.lerp(s.from[0], to[0], k)
    const y = THREE.MathUtils.lerp(s.from[1], to[1], k)
    const z = THREE.MathUtils.lerp(s.from[2], to[2], k)
    const moving = s.wait <= 0
    const bob = moving ? Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.06 : 0
    g.position.set(x, y + bob, z)
    // hide while "inside" the tower door
    const atDoor = s.from === TOUR[0] && k < 0.12
    g.scale.setScalar(atDoor ? k / 0.12 : 1)
  })

  return (
    <group ref={ref}>
      <mesh position={[0, 0.26, 0]} castShadow>
        <coneGeometry args={[0.16, 0.52, 16]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <sphereGeometry args={[0.1, 16, 12]} />
        <meshLambertMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <coneGeometry args={[0.08, 0.22, 12]} />
        <meshLambertMaterial color={C.door} />
      </mesh>
    </group>
  )
}

function Bridge({ angle, onCrank }: { angle: MotionValue<number>; onCrank: () => void }) {
  const pivot = useRef<THREE.Group>(null)
  const knob = useRef<THREE.Group>(null)
  const [hover, setHover] = useState(false)
  useFrame(() => {
    const a = THREE.MathUtils.degToRad(angle.get())
    if (pivot.current) pivot.current.rotation.y = a
    if (knob.current) knob.current.rotation.x = a * 2
  })
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => void (document.body.style.cursor = '')
  }, [hover])
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    onCrank()
  }
  return (
    <group position={BRIDGE_PIVOT}>
      <group ref={pivot}>
        <Block p={[BRIDGE_LEN / 2 + 0.05, -0.12, 0]} s={[BRIDGE_LEN, 0.24, 0.9]} c={C.bridge} />
        <Block p={[BRIDGE_LEN / 2 + 0.05, -0.36, 0]} s={[BRIDGE_LEN - 0.4, 0.24, 0.5]} c={C.rock} />
      </group>
      {/* crank on the cliff face below the pivot */}
      <group position={[0.06, -0.78, 0]} onPointerDown={down} onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.36, 0.36, 0.12, 24]} />
          <meshLambertMaterial color={hover ? C.goal : C.teal} />
        </mesh>
        <group ref={knob} position={[0.08, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.14, 12]} />
            <meshLambertMaterial color={C.door} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Goal() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((s) => {
    if (!ref.current) return
    ref.current.rotation.y = s.clock.elapsedTime * 1.2
    ref.current.position.y = 1.0 + Math.sin(s.clock.elapsedTime * 2) * 0.08
  })
  return (
    <group position={[6.3, 0, 1.5]}>
      <mesh ref={ref} castShadow>
        <octahedronGeometry args={[0.28]} />
        <meshLambertMaterial color={C.goal} emissive={C.goal} emissiveIntensity={0.35} flatShading />
      </mesh>
      <Block p={[0, 0.1, -0.7]} s={[0.25, 0.2, 0.25]} c={C.teal} />
    </group>
  )
}

function Cloud({ p, s = 1, speed = 0.15 }: { p: V3; s?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    if (!ref.current) return
    const t = st.clock.elapsedTime * speed
    ref.current.position.x = p[0] + Math.sin(t) * 1.2
    ref.current.position.z = p[2] - Math.sin(t) * 1.2
  })
  return (
    <group ref={ref} position={p} scale={s}>
      <Block p={[0, 0, 0]} s={[1.6, 0.35, 0.9]} c="#ffffff" cast={false} />
      <Block p={[0.3, 0.3, 0]} s={[0.9, 0.35, 0.7]} c="#ffffff" cast={false} />
    </group>
  )
}

function Isle({ bridgeAngle, onCrank, onBusy }: { bridgeAngle: MotionValue<number>; onCrank: () => void; onBusy: (b: boolean) => void }) {
  const root = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (root.current) root.current.position.y = Math.sin(s.clock.elapsedTime * 0.8) * 0.12
  })
  return (
    <group ref={root}>
      {/* main isle */}
      <Rock x={0} z={0} w={6} d={6} layers={4} />
      <Block p={[0, 0.02, 0]} s={[6, 0.04, 6]} c={C.top} cast={false} />
      <Tower />
      {/* raised platform + steps */}
      <Block p={[1.5, 0.75, -1.5]} s={[2, 1.5, 2]} c={C.rock} />
      <Block p={[1.5, 1.52, -1.5]} s={[2, 0.04, 2]} c={C.top} cast={false} />
      <Block p={[1.5, 0.5, -0.25]} s={[1.2, 1.0, 0.5]} c={C.top} />
      <Block p={[1.5, 0.25, 0.25]} s={[1.2, 0.5, 0.5]} c={C.top} />
      <Gate p={[1.5, 1.5, -1.6]} />
      <Tree p={[-2.4, 0, 2.2]} h={1.1} />
      <Tree p={[-0.4, 0, 2.5]} h={0.8} />
      <Tree p={[2.4, 0, -0.1]} h={0.7} />
      {/* path tiles */}
      {[-1.5, -0.5, 0.5].map((x) => (
        <Block key={x} p={[x, 0.05, 1.6]} s={[0.8, 0.04, 0.8]} c={C.bridge} cast={false} />
      ))}
      <Bridge angle={bridgeAngle} onCrank={onCrank} />
      {/* small isle */}
      <group>
        <Rock x={6.3} z={1.5} w={2} d={2} layers={3} />
        <Block p={[6.3, 0.02, 1.5]} s={[2, 0.04, 2]} c={C.top} cast={false} />
        <Goal />
      </group>
      <Walker bridgeAngle={bridgeAngle} onBusy={onBusy} />
    </group>
  )
}

export default function FloatingIsle() {
  const bridgeAngle = useMotionValue(0)
  const target = useRef(0)
  const busy = useRef(false)
  const lastUser = useRef(0)
  const [spins, setSpins] = useState(0)

  const crank = useCallback((auto = false) => {
    if (busy.current) return
    if (!auto) lastUser.current = performance.now()
    target.current += 90
    animate(bridgeAngle, target.current, { type: 'spring', stiffness: 140, damping: 13, mass: 0.9 })
    setSpins((n) => n + 1)
  }, [bridgeAngle])

  // ambient loop: the bridge swings itself around unless the visitor is playing with it
  useEffect(() => {
    const id = setInterval(() => {
      if (performance.now() - lastUser.current < 6000) return
      const aligned = target.current % 360 === 0
      if (aligned && Math.random() < 0.55) return // linger when connected
      crank(true)
    }, 2400)
    return () => clearInterval(id)
  }, [crank])

  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4ea', 1.55)
    l.position.set(4, 9, 6)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -10
    cam.right = cam.top = 10
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])

  return (
    <div className="stage" style={{ background: 'linear-gradient(180deg, #fbf1e7 0%, #f6dccf 55%, #eec2b8 100%)' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: '18%',
          top: '14%',
          width: 'min(34vw, 420px)',
          aspectRatio: '1',
          borderRadius: '50%',
          background: 'radial-gradient(circle, #ffe3cf 0%, #ffd9c4 55%, transparent 70%)',
        }}
      />
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={18.5} mobileFit={15} offset={[0.2, -0.03]} target={[1.6, -0.4, 0.4]} />
        <ambientLight intensity={1.45} color="#fff1e8" />
        <hemisphereLight args={['#fff7ef', '#c9849a', 0.6]} />
        <primitive object={light} />
        <Isle bridgeAngle={bridgeAngle} onCrank={() => crank()} onBusy={(b) => (busy.current = b)} />
        <Cloud p={[-4, 2.5, 4]} s={0.9} />
        <Cloud p={[7, 3.4, -3]} s={0.7} speed={0.1} />
        <Cloud p={[2, -4.5, 6]} s={1.1} speed={0.12} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="kicker">
            <i /> Isometric · Hero
          </p>
          <h1>
            让首屏
            <br />
            像一座小岛
          </h1>
          <p>正交视角消除透视的“紧迫感”，柔和配色与缓慢浮动让首屏安静下来。小旅人会在桥接通时走到对岸。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => crank()}>
              转动桥梁
            </button>
            <span className="btn" style={{ cursor: 'default' }}>
              已转动 {spins} 次
            </span>
          </div>
        </motion.div>
        <p className="hint">点击悬崖上的转盘 · 桥对齐时小人会过桥</p>
      </div>
    </div>
  )
}
