import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, AnimatePresence, motion, useMotionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { POSTER } from '../../lib/iso'

/*
 * Penrose loop: three beams along +x, +y, +z. Under a true isometric camera the end of the
 * z beam (n,n,n) projects onto the start of the x beam (0,0,0), so the path looks closed.
 * Depth can't satisfy "each joint has the outgoing beam in front", so when the view is locked
 * to isometric we switch to painter's order: Xb → Y → Z → Xa (x beam split in two, Xa drawn
 * last without its inner cap). Off-axis we fall back to the z-buffer and the trick is exposed.
 */

const N = 6
const H = N / 2
const ISO_PHI = THREE.MathUtils.radToDeg(Math.asin(1 / Math.sqrt(3))) // 35.264°
const ISO_THETA = 45
const TARGET = new THREE.Vector3((5 * N) / 6, N / 2, N / 6)
const LOCK_EPS = 0.4

// face order of BoxGeometry groups: +x, -x, +y, -y, +z, -z
const TONES = ['#c26a7a', '#6e4a6b', '#fbf3ea', '#5a3b5e', '#eaa487', '#7d5470']

type Beam = { name: string; min: V3; max: V3; order: number; dropPX?: boolean }
type V3 = [number, number, number]

const BEAMS: Beam[] = [
  { name: 'xb', min: [H, -0.5, -0.5], max: [N + 0.5, 0.5, 0.5], order: 1 },
  { name: 'y', min: [N - 0.5, 0.5, -0.5], max: [N + 0.5, N + 0.5, 0.5], order: 2 },
  { name: 'z', min: [N - 0.5, N - 0.5, 0.5], max: [N + 0.5, N + 0.5, N + 0.5], order: 3 },
  { name: 'xa', min: [-0.5, -0.5, -0.5], max: [H, 0.5, 0.5], order: 4, dropPX: true },
]

const PATH: V3[] = [
  [0, 0, 0],
  [N, 0, 0],
  [N, N, 0],
  [N, N, N],
]

function Structure({ lockedRef }: { lockedRef: React.RefObject<boolean> }) {
  const mats = useMemo(
    () =>
      BEAMS.map((b) =>
        TONES.map((c, i) => new THREE.MeshBasicMaterial({ color: c, visible: !(b.dropPX && i === 0) })),
      ),
    [],
  )
  const walkers = useRef<THREE.Mesh[]>([])
  const walkerMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#2f5f6e', depthTest: false, transparent: true }), [])
  const trailMats = useMemo(
    () => [0.45, 0.25, 0.12].map((o) => new THREE.MeshBasicMaterial({ color: '#2f5f6e', transparent: true, opacity: o, depthTest: false })),
    [],
  )

  useFrame((state) => {
    const locked = lockedRef.current
    for (const set of mats) {
      for (const m of set) {
        m.depthTest = !locked
        m.depthWrite = !locked
      }
    }
    // walker: ride the loop; at (n,n,n) jump back to the origin — invisible when locked
    const t = state.clock.elapsedTime * 0.22
    walkers.current.forEach((w, i) => {
      if (!w) return
      const u = (((t - i * 0.035) % 3) + 3) % 3
      const k = Math.floor(u)
      const f = u - k
      const a = PATH[k]
      const b = PATH[k + 1]
      w.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f + 0.68, a[2] + (b[2] - a[2]) * f)
    })
  })

  return (
    <group>
      {BEAMS.map((b, i) => {
        const size: V3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
        const pos: V3 = [(b.max[0] + b.min[0]) / 2, (b.max[1] + b.min[1]) / 2, (b.max[2] + b.min[2]) / 2]
        return (
          <mesh key={b.name} position={pos} material={mats[i]} renderOrder={b.order}>
            <boxGeometry args={size} />
          </mesh>
        )
      })}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(m) => void (walkers.current[i] = m!)}
          material={i === 0 ? walkerMat : trailMats[i - 1]}
          renderOrder={10 - i}
          scale={i === 0 ? 1 : 1 - i * 0.18}
        >
          <sphereGeometry args={[0.22, 24, 16]} />
        </mesh>
      ))}
    </group>
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
    camera.zoom = Math.min(width, height) / (N * (mobile ? 2.1 : 2.25))
    camera.setViewOffset(width, height, mobile || POSTER ? 0 : -0.14 * width, mobile ? 0.14 * height : 0, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  useFrame(() => {
    const t = theta.get()
    const p = phi.get()
    const locked = Math.abs(t - ISO_THETA) < LOCK_EPS && Math.abs(p - ISO_PHI) < LOCK_EPS
    const th = THREE.MathUtils.degToRad(locked ? ISO_THETA : t)
    const ph = THREE.MathUtils.degToRad(locked ? ISO_PHI : p)
    const R = 60
    camera.position.set(
      TARGET.x + R * Math.cos(ph) * Math.sin(th),
      TARGET.y + R * Math.sin(ph),
      TARGET.z + R * Math.cos(ph) * Math.cos(th),
    )
    camera.lookAt(TARGET)
    lockedRef.current = locked
    if (last.current !== locked) {
      last.current = locked
      onLock(locked)
    }
  })
  return null
}

export default function ImpossibleLoop() {
  const theta = useMotionValue(ISO_THETA)
  const phi = useMotionValue(ISO_PHI)
  const lockedRef = useRef(true)
  const [locked, setLocked] = useState(true)
  const [readout, setReadout] = useState({ t: ISO_THETA, p: ISO_PHI })
  const anims = useRef<AnimationPlaybackControls[]>([])
  const drag = useRef<{ x: number; y: number; t: number; p: number } | null>(null)
  const lastInput = useRef(0)
  const [lockPulse, setLockPulse] = useState(0)

  const stop = () => {
    anims.current.forEach((a) => a.stop())
    anims.current = []
  }

  const settle = (opts = { stiffness: 70, damping: 15 }) => {
    stop()
    anims.current = [
      animate(theta, ISO_THETA, { type: 'spring', ...opts }),
      animate(phi, ISO_PHI, { type: 'spring', ...opts }),
    ]
  }

  const reveal = () => {
    stop()
    lastInput.current = performance.now()
    const swing = theta.get() + 62
    anims.current = [
      animate(theta, [theta.get(), swing, swing, ISO_THETA], { duration: 4.2, times: [0, 0.38, 0.55, 1], ease: ['easeInOut', 'linear', [0.3, 1.25, 0.5, 1]] }),
      animate(phi, [phi.get(), 22, 22, ISO_PHI], { duration: 4.2, times: [0, 0.38, 0.55, 1], ease: ['easeInOut', 'linear', [0.3, 1.25, 0.5, 1]] }),
    ]
  }

  // ambient loop: every so often the camera drifts off-axis to show the trick, then snaps back
  useEffect(() => {
    const id = setInterval(() => {
      if (drag.current || performance.now() - lastInput.current < 7000) return
      reveal()
    }, 9000)
    const first = setTimeout(reveal, 2600)
    return () => {
      clearInterval(id)
      clearTimeout(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const u1 = theta.on('change', (t) => setReadout((r) => ({ ...r, t })))
    const u2 = phi.on('change', (p) => setReadout((r) => ({ ...r, p })))
    return () => {
      u1()
      u2()
    }
  }, [theta, phi])

  const onLock = (l: boolean) => {
    setLocked(l)
    if (l) setLockPulse((n) => n + 1)
  }

  return (
    <div
      className="stage"
      style={{ background: 'radial-gradient(120% 90% at 50% 40%, #f3f6f4 0%, #dce8e6 55%, #b9d1d0 100%)', touchAction: 'none', cursor: 'grab' }}
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
        // unwrap so we spring back the short way round
        const t = theta.get()
        theta.set(ISO_THETA + ((((t - ISO_THETA) % 360) + 540) % 360) - 180)
        settle()
      }}
    >
      <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 200 }} gl={{ antialias: true, alpha: true }}>
        <Rig theta={theta} phi={phi} lockedRef={lockedRef} onLock={onLock} />
        <Structure lockedRef={lockedRef} />
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
            <i style={{ background: '#5b8a9a' }} /> Isometric · Illusion
          </p>
          <h1>
            只在一个
            <br />
            角度成立
          </h1>
          <p>三根梁在真实空间里根本不相连。只有在严格的等距视角下，末端恰好投影到起点上，小球才能永远绕圈。</p>
        </motion.div>

        <div className="dock" style={{ pointerEvents: 'auto' }}>
          <span className="seg" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'default', minWidth: 172, color: 'var(--fg)' }}>
            <motion.i
              key={lockPulse}
              initial={{ scale: locked ? 2.2 : 1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              style={{ width: 8, height: 8, borderRadius: 8, background: locked ? '#3f9a72' : '#d9824f' }}
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
                {locked ? '等距锁定 · 闭合' : `θ ${readout.t.toFixed(0)}°  φ ${readout.p.toFixed(0)}°`}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="dock-sep" />
          <button className="seg" onClick={reveal}>
            <span>揭穿一下</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              lastInput.current = performance.now()
              settle({ stiffness: 120, damping: 18 })
            }}
          >
            <span>回到等距</span>
          </button>
        </div>
        <p className="hint">拖动画面旋转 · 松手自动吸附回等距</p>
      </div>
    </div>
  )
}
