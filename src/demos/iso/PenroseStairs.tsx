import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, AnimatePresence, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { POSTER } from '../../lib/iso'

/*
 * Penrose stairs. The walk goes +x 8, +z 8, −x 4, −z 4 while every step rises h = 1/6, so after 24 steps
 * the walker is at (4, 4, 4) — exactly one isometric "view-axis" away from the start, which projects onto
 * the same pixels. The z-buffer would show that seam, so when the view is locked to true isometric we
 * move steps 0…CUT one loop up (+(4,4,4), the real continuation of the staircase). That relocates the
 * discontinuity to CUT→CUT+1 inside the receding −z flight, where the nearer step is supposed to cover
 * the farther one anyway, so the break can't be seen. Off-axis we draw the real geometry and the trick
 * is exposed: the walkers visibly jump from the top step back to the bottom one.
 */

const H = 1 / 6
const RUNS: [number, number, number][] = [
  [1, 0, 8],
  [0, 1, 8],
  [-1, 0, 4],
  [0, -1, 4],
]
const N = RUNS.reduce((a, r) => a + r[2], 0) // 24
const LOOP = new THREE.Vector3(4, N * H, 4) // (4,4,4)
const CUT = 21 // steps 0..CUT are lifted one loop when locked
const FLOOR = -1.6
const ISO_PHI = THREE.MathUtils.radToDeg(Math.asin(1 / Math.sqrt(3)))
const ISO_THETA = 45
const LOCK_EPS = 0.4

/** step k: centre (x, z) and tread height */
const STEPS = (() => {
  const out: { x: number; z: number; y: number; run: number }[] = []
  let x = 0
  let z = 0
  let k = 0
  RUNS.forEach(([dx, dz, n], run) => {
    for (let i = 0; i < n; i++) {
      out.push({ x, z, y: k * H, run })
      x += dx
      z += dz
      k++
    }
  })
  return out
})()

const CENTRE = (() => {
  const c = new THREE.Vector3()
  STEPS.forEach((s) => c.add(new THREE.Vector3(s.x, s.y - 0.8, s.z)))
  return c.divideScalar(N)
})()

const PAL = {
  treadA: '#f6eef6',
  treadB: '#e9dcef',
  wall: '#b99ad6',
  window: '#5b4377',
  trim: '#f2c7d6',
  walker: '#fff8f0',
  hood: '#6c4f93',
}

function Steps({ lockedRef }: { lockedRef: React.RefObject<boolean> }) {
  const groups = useRef<THREE.Group[]>([])
  useFrame(() => {
    const lift = lockedRef.current
    groups.current.forEach((g, k) => {
      if (!g) return
      const s = STEPS[k]
      const up = lift && k <= CUT
      g.position.set(s.x + (up ? LOOP.x : 0), up ? LOOP.y : 0, s.z + (up ? LOOP.z : 0))
    })
  })

  return (
    <>
      {STEPS.map((s, k) => {
        const colH = s.y - FLOOR
        // outer faces get windows; which faces are "outer" depends on the flight
        const outerX = s.run === 1 ? 0.505 : s.run === 3 ? -0.505 : 0
        const outerZ = s.run === 0 ? -0.505 : s.run === 2 ? 0.505 : 0
        return (
          <group key={k} ref={(g) => void (groups.current[k] = g!)}>
            <mesh position={[0, FLOOR + colH / 2 - 0.04, 0]}>
              <boxGeometry args={[1, colH - 0.08, 1]} />
              <meshLambertMaterial color={PAL.wall} />
            </mesh>
            <mesh position={[0, s.y - 0.04, 0]}>
              <boxGeometry args={[1, 0.08, 1]} />
              <meshLambertMaterial color={k % 2 ? PAL.treadB : PAL.treadA} />
            </mesh>
            {/* nosing line at the front edge of each tread */}
            <mesh position={[0, s.y - 0.1, 0]}>
              <boxGeometry args={[1.002, 0.02, 1.002]} />
              <meshLambertMaterial color={PAL.trim} />
            </mesh>
            {k % 2 === 0 && (outerX !== 0 || outerZ !== 0) && (
              <mesh position={[outerX, FLOOR + 1.0 + (k % 4 === 0 ? 0.3 : 0), outerZ]}>
                <boxGeometry args={[outerX ? 0.02 : 0.22, 0.5, outerZ ? 0.02 : 0.22]} />
                <meshBasicMaterial color={PAL.window} />
              </mesh>
            )}
          </group>
        )
      })}
    </>
  )
}

function stepCentre(j: number, out: THREE.Vector3) {
  // j may be N (= step 0 one loop up)
  const loops = Math.floor(j / N)
  const s = STEPS[((j % N) + N) % N]
  return out.set(s.x, s.y, s.z).addScaledVector(LOOP, loops)
}

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()

function Walkers({ lockedRef, speed }: { lockedRef: React.RefObject<boolean>; speed: MotionValue<number> }) {
  const refs = useRef<THREE.Group[]>([])
  const u = useRef(0)
  const COUNT = 7
  useFrame((st, dt) => {
    u.current += Math.min(dt, 1 / 20) * speed.get()
    const lift = lockedRef.current
    refs.current.forEach((g, n) => {
      if (!g) return
      const p = (((u.current + n * (N / COUNT)) % N) + N) % N
      const i = Math.floor(p)
      const f = p - i
      stepCentre(i, tmpA)
      stepCentre(i + 1, tmpB)
      const climb = THREE.MathUtils.smoothstep(f, 0.45, 0.85)
      const x = THREE.MathUtils.lerp(tmpA.x, tmpB.x, f)
      const z = THREE.MathUtils.lerp(tmpA.z, tmpB.z, f)
      const y = THREE.MathUtils.lerp(tmpA.y, tmpB.y, climb)
      const up = lift && i <= CUT
      const bob = Math.abs(Math.sin((p + n) * Math.PI)) * 0.05
      g.position.set(x + (up ? LOOP.x : 0), y + bob + (up ? LOOP.y : 0), z + (up ? LOOP.z : 0))
      g.rotation.y = Math.atan2(tmpB.x - tmpA.x, tmpB.z - tmpA.z)
      g.rotation.z = Math.sin(st.clock.elapsedTime * 7 + n) * 0.05
    })
  })
  return (
    <>
      {Array.from({ length: COUNT }, (_, n) => (
        <group key={n} ref={(g) => void (refs.current[n] = g!)}>
          <mesh position={[0, 0.2, 0]}>
            <coneGeometry args={[0.14, 0.42, 14]} />
            <meshLambertMaterial color={PAL.hood} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <sphereGeometry args={[0.085, 14, 10]} />
            <meshLambertMaterial color={PAL.walker} />
          </mesh>
          <mesh position={[0, 0.55, -0.02]} rotation={[-0.35, 0, 0]}>
            <coneGeometry args={[0.1, 0.2, 12]} />
            <meshLambertMaterial color={PAL.hood} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function Rig({
  theta,
  phi,
  lockedRef,
  onLock,
}: {
  theta: MotionValue<number>
  phi: MotionValue<number>
  lockedRef: React.RefObject<boolean>
  onLock: (locked: boolean) => void
}) {
  const { width, height } = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const last = useRef<boolean | null>(null)

  useEffect(() => {
    const mobile = width < 760
    camera.zoom = Math.min(width, height * 1.2) / (mobile ? 13.5 : 15.5)
    camera.setViewOffset(width, height, mobile || POSTER ? 0 : -0.15 * width, mobile ? 0.15 * height : 0, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  useFrame(() => {
    const t = theta.get()
    const p = phi.get()
    const locked = Math.abs(t - ISO_THETA) < LOCK_EPS && Math.abs(p - ISO_PHI) < LOCK_EPS
    const th = THREE.MathUtils.degToRad(locked ? ISO_THETA : t)
    const ph = THREE.MathUtils.degToRad(locked ? ISO_PHI : p)
    const R = 80
    camera.position.set(
      CENTRE.x + R * Math.cos(ph) * Math.sin(th),
      CENTRE.y + R * Math.sin(ph),
      CENTRE.z + R * Math.cos(ph) * Math.cos(th),
    )
    camera.lookAt(CENTRE)
    lockedRef.current = locked
    if (last.current !== locked) {
      last.current = locked
      onLock(locked)
    }
  })
  return null
}

export default function PenroseStairs() {
  const theta = useMotionValue(ISO_THETA)
  const phi = useMotionValue(ISO_PHI)
  const speed = useMotionValue(1.1)
  const lockedRef = useRef(true)
  const [locked, setLocked] = useState(true)
  const [readout, setReadout] = useState({ t: ISO_THETA, p: ISO_PHI })
  const [climbed, setClimbed] = useState(0)
  const anims = useRef<AnimationPlaybackControls[]>([])
  const drag = useRef<{ x: number; y: number; t: number; p: number } | null>(null)
  const lastInput = useRef(0)
  const [lockPulse, setLockPulse] = useState(0)
  const [hurry, setHurry] = useState(false)

  const stop = () => {
    anims.current.forEach((a) => a.stop())
    anims.current = []
  }

  const settle = (opts = { stiffness: 70, damping: 15 }) => {
    stop()
    anims.current = [animate(theta, ISO_THETA, { type: 'spring', ...opts }), animate(phi, ISO_PHI, { type: 'spring', ...opts })]
  }

  const reveal = () => {
    stop()
    lastInput.current = performance.now()
    const swing = theta.get() - 58
    const times = [0, 0.38, 0.58, 1]
    const ease = ['easeInOut', 'linear', [0.3, 1.2, 0.5, 1]] as const
    anims.current = [
      animate(theta, [theta.get(), swing, swing, ISO_THETA], { duration: 4.6, times, ease: [...ease] }),
      animate(phi, [phi.get(), 18, 18, ISO_PHI], { duration: 4.6, times, ease: [...ease] }),
    ]
  }

  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (drag.current || performance.now() - lastInput.current < 8000) return
      reveal()
    }, 11000)
    const first = setTimeout(reveal, 4200)
    return () => {
      clearInterval(id)
      clearTimeout(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const u1 = theta.on('change', (t) => setReadout((r) => ({ ...r, t })))
    const u2 = phi.on('change', (p) => setReadout((r) => ({ ...r, p })))
    // a step counter that only ever goes up — the joke of the piece
    const id = setInterval(() => setClimbed((c) => c + 1), 1000 / 1.1)
    return () => {
      u1()
      u2()
      clearInterval(id)
    }
  }, [theta, phi])

  useEffect(() => {
    const a = animate(speed, hurry ? 3.2 : 1.1, { type: 'spring', stiffness: 80, damping: 16 })
    return () => a.stop()
  }, [hurry, speed])

  const onLock = (l: boolean) => {
    setLocked(l)
    if (l) setLockPulse((n) => n + 1)
  }

  return (
    <div
      className="stage"
      style={{ background: 'radial-gradient(110% 90% at 60% 40%, #fbf7fb 0%, #ece3f2 55%, #d9cbe8 100%)', touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        stop()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, t: theta.get(), p: phi.get() }
        ;(e.currentTarget as HTMLElement).style.cursor = 'grabbing'
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        theta.set(d.t - (e.clientX - d.x) * 0.35)
        phi.set(THREE.MathUtils.clamp(d.p + (e.clientY - d.y) * 0.25, 4, 82))
      }}
      onPointerUp={(e) => {
        if (!drag.current) return
        drag.current = null
        lastInput.current = performance.now()
        ;(e.currentTarget as HTMLElement).style.cursor = 'grab'
        const t = theta.get()
        theta.set(ISO_THETA + ((((t - ISO_THETA) % 360) + 540) % 360) - 180)
        settle()
      }}
    >
      <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <Rig theta={theta} phi={phi} lockedRef={lockedRef} onLock={onLock} />
        <ambientLight intensity={1.25} color="#fff6fb" />
        <directionalLight position={[3, 10, 6]} intensity={1.7} />
        <Steps lockedRef={lockedRef} />
        <Walkers lockedRef={lockedRef} speed={speed} />
      </Canvas>

      <div className="overlay" style={{ pointerEvents: 'none' }}>
        <motion.div
          className="hero-copy"
          style={{ pointerEvents: 'none' }}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="kicker">
            <i style={{ background: '#8a6cc9' }} /> Isometric · Escher
          </p>
          <h1>
            一直向上，
            <br />
            却回到原地
          </h1>
          <p>四段楼梯每一级都在升高，绕一圈后却正好回到起点。秘密在视角：只有严格等距时，顶端才和底端重合。</p>
          <p className="ps-count">
            已经爬了 <b>{climbed.toLocaleString()}</b> 级 · 高度 <b>±0</b>
          </p>
        </motion.div>

        <div className="dock" style={{ pointerEvents: 'auto' }}>
          <span className="seg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'default', minWidth: 172, color: 'var(--fg)' }}>
            <motion.i
              key={lockPulse}
              initial={{ scale: locked ? 2.2 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              style={{ width: 8, height: 8, borderRadius: 8, background: locked ? '#8a6cc9' : '#d9824f' }}
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={locked ? 'l' : 'u'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
              >
                {locked ? '等距锁定 · 无限' : `θ ${readout.t.toFixed(0)}°  φ ${readout.p.toFixed(0)}°`}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="dock-sep" />
          <button className="seg" onClick={reveal}>
            <span>转开看看</span>
          </button>
          <button className="seg" aria-pressed={hurry} onClick={() => setHurry((h) => !h)}>
            <span>{hurry ? '慢慢走' : '快点爬'}</span>
          </button>
        </div>
        <p className="hint">拖动画面旋转 · 松手自动吸附回等距</p>
      </div>
      <style>{`
        .ps-count { margin-top: 18px !important; font: 12px/1.6 var(--mono) !important; color: var(--fg-2); }
        .ps-count b { color: #6c4f93; font-weight: 600; }
      `}</style>
    </div>
  )
}
