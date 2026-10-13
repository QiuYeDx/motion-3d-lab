import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { CuboidCollider, Physics, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import { ContactShadows } from '@react-three/drei'
import { motion } from 'motion/react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ the word, as a 5-row pixel font */

const GLYPHS: Record<string, string[]> = {
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  L: ['#...', '#...', '#...', '#...', '####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
}
const WORD = 'BUILD'
const LETTER_TOP = ['#3b6cf6', '#ff6b4a', '#f4b63f', '#2b2a33', '#3b6cf6']
const LETTER_TOP_2 = ['#5a84ff', '#ff8466', '#ffc95e', '#45434f', '#5a84ff']
const BASE = ['#f7f2e9', '#efe8dc']
const LAYERS = 2
const SIZE = 0.96

type Block = { home: THREE.Vector3; col: number; layer: number; color: THREE.Color; delay: number }

function buildBlocks(): { blocks: Block[]; span: number } {
  const cells: { col: number; row: number; letter: number }[] = []
  let x = 0
  WORD.split('').forEach((ch, li) => {
    const g = GLYPHS[ch]
    g.forEach((line, row) => line.split('').forEach((c, i) => c === '#' && cells.push({ col: x + i, row, letter: li })))
    x += g[0].length + 1
  })
  const span = x - 1
  const blocks: Block[] = []
  // deterministic jitter so every rebuild looks the same "random"
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let layer = 0; layer < LAYERS; layer++) {
    for (const c of cells) {
      const top = layer === LAYERS - 1
      const color = new THREE.Color(
        top ? (rnd() < 0.22 ? LETTER_TOP_2[c.letter] : LETTER_TOP[c.letter]) : BASE[rnd() < 0.5 ? 0 : 1],
      )
      blocks.push({
        // word reads along −z (screen up-right in true iso), letter "up" is −x
        home: new THREE.Vector3(c.row - 2, SIZE / 2 + layer * SIZE + 0.001, (span - 1) / 2 - c.col),
        col: c.col,
        layer,
        color,
        delay: c.col * 0.085 + layer * 0.55 + c.row * 0.018 + rnd() * 0.05,
      })
    }
  }
  return { blocks, span }
}

/* ------------------------------------------------------------------ controller (shared between scene + DOM) */

type Phase = 'rain' | 'hold' | 'knocked' | 'clear'
type Ctl = {
  phase: Phase
  t0: number // phase start (scene clock)
  lastUser: number
  pendingKnock: boolean
  pendingRebuild: boolean
  lowG: boolean
}

const ST_PARKED = 0
const ST_WAIT = 1
const ST_LIVE = 2
const ST_SHRINK = 3

const PLATFORM = { x: 9.2, z: 29.5, h: 1.2 }

function Blocks({ ctl, onPhase }: { ctl: React.RefObject<Ctl>; onPhase: (p: Phase) => void }) {
  const { blocks } = useMemo(buildBlocks, [])
  const N = blocks.length
  const bodies = useRef<(RapierRigidBody | null)[]>([])
  const mesh = useRef<THREE.InstancedMesh>(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const geo = useMemo(() => new RoundedBoxGeometry(SIZE, SIZE, SIZE, 3, 0.12), [])
  const st = useMemo(
    () => ({
      state: new Uint8Array(N),
      spawnAt: new Float32Array(N),
      scale: new Float32Array(N),
      shrinkAt: new Float32Array(N),
      clock: 0,
    }),
    [N],
  )
  const drag = useRef({ i: -1, ndc: new THREE.Vector2(), y: 3.2, hover: false })
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit: new THREE.Vector3(),
      e: new THREE.Euler(),
    }),
    [],
  )

  useEffect(() => {
    const m = mesh.current!
    blocks.forEach((b, i) => m.setColorAt(i, b.color))
    m.instanceColor!.needsUpdate = true
  }, [blocks])

  const park = (i: number) => {
    const rb = bodies.current[i]
    if (!rb) return
    rb.setEnabled(false)
    rb.setTranslation({ x: blocks[i].home.x, y: -60 - i, z: blocks[i].home.z }, false)
    rb.setLinvel({ x: 0, y: 0, z: 0 }, false)
    rb.setAngvel({ x: 0, y: 0, z: 0 }, false)
    st.state[i] = ST_PARKED
    st.scale[i] = 0
  }

  const startRain = () => {
    const c = ctl.current!
    c.phase = 'rain'
    c.t0 = st.clock
    onPhase('rain')
    for (let i = 0; i < N; i++) {
      if (st.state[i] !== ST_PARKED) park(i)
      st.state[i] = ST_WAIT
      st.spawnAt[i] = st.clock + 0.25 + blocks[i].delay
    }
  }

  const spawn = (i: number) => {
    const rb = bodies.current[i]
    if (!rb) return
    const h = blocks[i].home
    const j = (k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5
    rb.setTranslation({ x: h.x + j(1) * 0.03, y: h.y + 3.2, z: h.z + j(2) * 0.03 }, true)
    tmp.e.set(j(3) * 0.03, j(4) * 0.05, j(5) * 0.03)
    tmp.q.setFromEuler(tmp.e)
    rb.setRotation(tmp.q, true)
    rb.setLinvel({ x: 0, y: -1, z: 0 }, true)
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
    rb.setEnabled(true)
    rb.wakeUp()
    st.state[i] = ST_LIVE
    st.scale[i] = 0.35
  }

  const knock = () => {
    const c = ctl.current!
    c.phase = 'knocked'
    c.t0 = st.clock
    onPhase('knocked')
    // a blast from just under one end of the word, so it topples like a wave
    const cz = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6)
    const cx = (Math.random() - 0.5) * 3
    for (let i = 0; i < N; i++) {
      const rb = bodies.current[i]
      if (!rb || st.state[i] !== ST_LIVE) continue
      const t = rb.translation()
      const dx = t.x - cx
      const dz = t.z - cz
      const d = Math.hypot(dx, dz) + 0.6
      const k = (c.lowG ? 7 : 17) / (1 + d * 0.3)
      rb.applyImpulse({ x: (dx / d) * k * 0.8, y: (c.lowG ? 1.5 : 5) + k * 0.8 + Math.random() * (c.lowG ? 1 : 2.5), z: (dz / d) * k }, true)
      rb.applyTorqueImpulse({ x: (Math.random() - 0.5) * 1.6, y: (Math.random() - 0.5) * 1.6, z: (Math.random() - 0.5) * 1.6 }, true)
    }
  }

  const rebuild = () => {
    const c = ctl.current!
    c.phase = 'clear'
    c.t0 = st.clock
    onPhase('clear')
    drag.current.i = -1
    for (let i = 0; i < N; i++) {
      if (st.state[i] === ST_LIVE) {
        st.state[i] = ST_SHRINK
        st.shrinkAt[i] = st.clock + (i % 37) * 0.006
      } else if (st.state[i] === ST_WAIT) park(i)
    }
  }

  // drag → velocity servo toward a point on a horizontal plane, applied before every physics step
  useBeforePhysicsStep(() => {
    const d = drag.current
    if (d.i < 0) return
    const rb = bodies.current[d.i]
    if (!rb || st.state[d.i] !== ST_LIVE) return void (d.i = -1)
    tmp.ray.setFromCamera(d.ndc, camera)
    tmp.plane.constant = -d.y
    if (!tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) return
    tmp.hit.x = THREE.MathUtils.clamp(tmp.hit.x, -PLATFORM.x, PLATFORM.x)
    tmp.hit.z = THREE.MathUtils.clamp(tmp.hit.z, -PLATFORM.z / 2 - 2, PLATFORM.z / 2 + 2)
    const t = rb.translation()
    let vx = (tmp.hit.x - t.x) * 16
    let vy = (tmp.hit.y - t.y) * 16
    let vz = (tmp.hit.z - t.z) * 16
    const m = Math.hypot(vx, vy, vz)
    if (m > 30) {
      vx *= 30 / m
      vy *= 30 / m
      vz *= 30 / m
    }
    rb.setLinvel({ x: vx, y: vy, z: vz }, true)
    const a = rb.angvel()
    rb.setAngvel({ x: a.x * 0.85, y: a.y * 0.85, z: a.z * 0.85 }, true)
  })

  useEffect(() => {
    const toNdc = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      drag.current.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const move = (e: PointerEvent) => {
      if (drag.current.i >= 0) toNdc(e)
    }
    const up = () => {
      if (drag.current.i < 0) return
      drag.current.i = -1
      ctl.current!.lastUser = performance.now()
      document.body.style.cursor = drag.current.hover ? 'grab' : ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
    }
  }, [gl, ctl])

  const grab = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId == null || st.state[e.instanceId] !== ST_LIVE) return
    e.stopPropagation()
    const d = drag.current
    d.i = e.instanceId
    const r = gl.domElement.getBoundingClientRect()
    d.ndc.set(((e.nativeEvent.clientX - r.left) / r.width) * 2 - 1, -((e.nativeEvent.clientY - r.top) / r.height) * 2 + 1)
    const t = bodies.current[d.i]!.translation()
    d.y = Math.max(t.y, 0.5) + 2.4
    ctl.current!.lastUser = performance.now()
    document.body.style.cursor = 'grabbing'
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    st.clock += dt
    const now = st.clock
    const c = ctl.current!

    // external requests from the DOM
    if (c.pendingKnock) {
      c.pendingKnock = false
      if (c.phase !== 'clear') knock()
    }
    if (c.pendingRebuild) {
      c.pendingRebuild = false
      rebuild()
    }

    let waiting = 0
    let shrinking = 0
    for (let i = 0; i < N; i++) {
      const s = st.state[i]
      if (s === ST_WAIT) {
        if (now >= st.spawnAt[i]) spawn(i)
        else waiting++
      } else if (s === ST_LIVE) {
        st.scale[i] = Math.min(1, st.scale[i] + dt * 5)
        const rb = bodies.current[i]
        if (rb && rb.translation().y < -14) park(i) // fell off the platform — returns on next rebuild
      } else if (s === ST_SHRINK) {
        if (now >= st.shrinkAt[i]) {
          st.scale[i] -= dt * 4.5
          if (st.scale[i] <= 0) park(i)
          else shrinking++
        } else shrinking++
      }
    }

    // phase machine + ambient loop
    const idle = performance.now() - c.lastUser > 7000
    if (c.phase === 'rain' && waiting === 0 && now - c.t0 > 1) {
      c.phase = 'hold'
      c.t0 = now
      onPhase('hold')
    } else if (c.phase === 'hold' && idle && now - c.t0 > 5.5) {
      knock()
    } else if (c.phase === 'knocked' && idle && now - c.t0 > 3.6) {
      rebuild()
    } else if (c.phase === 'clear' && shrinking === 0) {
      startRain()
    }

    // sync instance matrices from rigid bodies
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < N; i++) {
      const rb = bodies.current[i]
      const sc = st.scale[i]
      if (!rb || sc <= 0) {
        tmp.m.makeScale(0, 0, 0)
      } else {
        const t = rb.translation()
        const r = rb.rotation()
        const e = sc < 1 ? 1 - Math.pow(1 - sc, 3) : 1
        tmp.p.set(t.x, t.y, t.z)
        tmp.q.set(r.x, r.y, r.z, r.w)
        tmp.s.setScalar(e)
        tmp.m.compose(tmp.p, tmp.q, tmp.s)
      }
      m.setMatrixAt(i, tmp.m)
    }
    m.instanceMatrix.needsUpdate = true
    m.boundingSphere = null // raycasts must see the moved instances
  })

  // first rain
  useEffect(() => {
    for (let i = 0; i < N; i++) park(i)
    startRain()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {blocks.map((b, i) => (
        <RigidBody
          key={i}
          ref={(rb) => void (bodies.current[i] = rb)}
          colliders={false}
          position={[b.home.x, -60 - i, b.home.z]}
          linearDamping={0.05}
          angularDamping={0.3}
          canSleep
        >
          <CuboidCollider args={[SIZE / 2, SIZE / 2, SIZE / 2]} friction={0.9} restitution={0.04} density={1.2} />
        </RigidBody>
      ))}
      <instancedMesh
        ref={mesh}
        args={[geo, undefined, N]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerDown={grab}
        onPointerOver={(e) => {
          if (e.instanceId == null || st.state[e.instanceId] !== ST_LIVE) return
          drag.current.hover = true
          if (drag.current.i < 0) document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          drag.current.hover = false
          if (drag.current.i < 0) document.body.style.cursor = ''
        }}
      >
        <meshStandardMaterial roughness={0.62} metalness={0} envMapIntensity={0} />
      </instancedMesh>
    </>
  )
}

/** orthographic 3/4 view from the +x side, so the word (laid along −z) reads left → right */
function Rig({ fit, mobileFit, offset, mobileOffsetY }: { fit: number; mobileFit: number; offset: [number, number]; mobileOffsetY: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const { width, height } = useThree((s) => s.size)
  useLayoutEffect(() => {
    const mobile = width < 760
    camera.zoom = Math.min(width, height * 1.25) / (mobile ? mobileFit : fit)
    const el = THREE.MathUtils.degToRad(34)
    const yaw = THREE.MathUtils.degToRad(-14)
    const d = 60
    camera.position.set(Math.cos(el) * Math.cos(yaw) * d, Math.sin(el) * d + 0.5, Math.cos(el) * Math.sin(yaw) * d)
    camera.lookAt(0, 0.5, 0)
    const ox = mobile || POSTER ? 0 : offset[0]
    const oy = POSTER ? 0 : mobile ? mobileOffsetY : offset[1]
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height, fit, mobileFit, mobileOffsetY, offset[0], offset[1]])
  return null
}

function Platform() {
  const geo = useMemo(() => new RoundedBoxGeometry(PLATFORM.x, PLATFORM.h, PLATFORM.z, 4, 0.4), [])
  return (
    <RigidBody type="fixed" colliders={false} position={[0, -PLATFORM.h / 2, 0]}>
      <CuboidCollider args={[PLATFORM.x / 2, PLATFORM.h / 2, PLATFORM.z / 2]} friction={1} />
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial color="#fbf8f2" roughness={0.9} />
      </mesh>
      {/* inset grid lines that hint at the target cells */}
      <mesh position={[0, PLATFORM.h / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLATFORM.x - 1.2, PLATFORM.z - 1.2]} />
        <meshBasicMaterial color="#e7e0d3" transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -PLATFORM.h / 2 - 0.9, 0]}>
        <boxGeometry args={[PLATFORM.x - 1.6, 1.8, PLATFORM.z - 1.6]} />
        <meshStandardMaterial color="#d8cfbf" roughness={1} />
      </mesh>
    </RigidBody>
  )
}

function Lights() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ec', 2.1)
    l.position.set(-6, 22, 10)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -22
    cam.right = cam.top = 22
    cam.near = 1
    cam.far = 60
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.03
    l.shadow.radius = 6
    return l
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d9cbb5', 1.35]} />
      <ambientLight intensity={0.55} />
      <primitive object={light} />
    </>
  )
}

export default function PhysicsStack() {
  const ctl = useRef<Ctl>({ phase: 'rain', t0: 0, lastUser: 0, pendingKnock: false, pendingRebuild: false, lowG: false })
  const [phase, setPhase] = useState<Phase>('rain')
  const [gravity, setGravity] = useState<'earth' | 'moon'>('earth')

  const user = () => (ctl.current.lastUser = performance.now())
  const toppled = phase === 'knocked'

  return (
    <div className="stage phys-stage">
      <style>{`
        .phys-stage { background: radial-gradient(120% 90% at 70% 40%, #f8f6f1 0%, #efebe3 55%, #e6e0d5 100%); }
        .phys-stage .scrim { --soft-bg: #f3f0ea; }
        .phys-stat { display: inline-flex; align-items: center; gap: 8px; margin-top: 22px; font: 500 12px/1 var(--mono); color: var(--fg-2); letter-spacing: .04em; }
        .phys-stat b { display: inline-block; width: 8px; height: 8px; border-radius: 2px; }
      `}</style>
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 400 }} gl={{ antialias: true, alpha: true }}>
        <Rig fit={40} mobileFit={31} offset={[0.17, -0.01]} mobileOffsetY={0.2} />
        <Lights />
        <Suspense fallback={null}>
          <Physics gravity={[0, gravity === 'earth' ? -26 : -4.5, 0]}>
            <Platform />
            <ContactShadows position={[0, -PLATFORM.h - 1.82, 0]} scale={[24, 44]} frames={2} blur={2.4} far={5} opacity={0.4} color="#6b5a45" />
            <Blocks ctl={ctl} onPhase={setPhase} />
          </Physics>
        </Suspense>
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Rapier · Rigid bodies
          </p>
          <h1>
            一块一块
            <br />
            搭出来
          </h1>
          <p>116 个刚体方块按列依次落下，自然堆成 BUILD。按住任意方块拖起、甩出去；或者一键推倒，再看它们重新落回原位。</p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                user()
                if (toppled) ctl.current.pendingRebuild = true
                else ctl.current.pendingKnock = true
              }}
            >
              {toppled ? '重建' : '推倒'}
            </button>
            <button
              className="btn"
              onClick={() => {
                user()
                ctl.current.pendingRebuild = true
              }}
            >
              重新落下
            </button>
          </div>
          <p className="phys-stat">
            <b style={{ background: '#3b6cf6' }} />
            <b style={{ background: '#ff6b4a' }} />
            <b style={{ background: '#f4b63f' }} />
            <b style={{ background: '#2b2a33' }} />
            &nbsp;
            {phase === 'rain' ? '正在落下…' : phase === 'hold' ? '已堆好 · 拖拽方块试试' : phase === 'knocked' ? '已推倒' : '回收中…'}
          </p>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'earth', label: '标准重力' },
              { value: 'moon', label: '月面重力' },
            ]}
            value={gravity}
            onChange={(v) => {
              user()
              ctl.current.lowG = v === 'moon'
              setGravity(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              user()
              ctl.current.pendingKnock = true
            }}
          >
            <span>推倒</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              ctl.current.pendingRebuild = true
            }}
          >
            <span>重建</span>
          </button>
        </div>
        <p className="hint">拖拽方块可抛掷 · 掉出平台的方块会在重建时回来</p>
      </div>
    </div>
  )
}
