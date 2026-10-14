import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import {
  bindDitherCamera,
  createDitherEffect,
  ditherModes,
  ditherPalettes,
  setDitherMode,
  setDitherPalette,
  setDitherTone,
  setDitherWorld,
  type DitherMode,
  type DitherPalette,
} from './effects/dither'

/*
 * 1-bit 抖动 — a ship's gun deck, lit by a swinging lantern and a shaft of daylight through the gun port,
 * redrawn with two inks. The camera only turns (never travels), which is exactly the case Obra Dinn's
 * world-stable dither handles perfectly: flip to 屏幕空间 and the dots start to "swim" across the timbers.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const MODE_NOTE: Record<DitherMode, string> = {
  bayer: 'Bayer 8×8 · 64 级 · 规整十字纹',
  blue: 'Void-and-cluster 64² · 无方向感',
  error: 'Atkinson · 只传 6/8 误差 · 高反差',
}
const SHORT: Record<DitherMode, string> = { bayer: 'Bayer', blue: '蓝噪', error: '误差' }
// card colours per palette (phosphor reads better as a dark terminal card)
const CARD: Record<DitherPalette, 'light' | 'dark'> = { obra: 'light', mac: 'light', phosphor: 'dark', duo: 'light' }

type TourStep = { mode: DitherMode; world: boolean; palette: DitherPalette }
const TOUR: TourStep[] = [
  { mode: 'blue', world: true, palette: 'obra' },
  { mode: 'bayer', world: true, palette: 'obra' },
  { mode: 'bayer', world: false, palette: 'obra' },
  { mode: 'error', world: false, palette: 'mac' },
  { mode: 'blue', world: true, palette: 'phosphor' },
  { mode: 'bayer', world: true, palette: 'duo' },
]

/* ------------------------------------------------------------------ geometry helpers */

const lathe = (pts: [number, number][], seg = 32) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  )

function barrelGeo() {
  const pts: [number, number][] = [[0, 0]]
  for (let i = 0; i <= 18; i++) {
    const y = (i / 18) * 0.9
    pts.push([0.265 + 0.055 * Math.sin((Math.PI * y) / 0.9), y])
  }
  pts.push([0.24, 0.9], [0.24, 0.88], [0, 0.88])
  return lathe(pts, 28)
}

function cannonGeo() {
  return lathe(
    [
      [0, -0.2],
      [0.045, -0.19],
      [0.06, -0.15],
      [0.04, -0.1],
      [0.05, -0.06],
      [0.13, -0.02],
      [0.17, 0.02],
      [0.17, 0.09],
      [0.155, 0.11],
      [0.152, 0.5],
      [0.163, 0.52],
      [0.163, 0.58],
      [0.146, 0.6],
      [0.118, 1.42],
      [0.13, 1.46],
      [0.13, 1.5],
      [0.12, 1.53],
      [0.135, 1.6],
      [0.135, 1.66],
      [0.065, 1.66],
      [0.065, 1.35],
      [0, 1.35],
    ],
    36,
  )
}

function ropeGeo() {
  const pts: THREE.Vector3[] = []
  const turns = 4.2
  for (let i = 0; i <= 240; i++) {
    const t = i / 240
    const a = t * turns * Math.PI * 2
    const r = 0.1 + t * 0.32
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.036, Math.sin(a) * r))
  }
  // second, smaller layer on top
  for (let i = 1; i <= 150; i++) {
    const t = i / 150
    const a = turns * Math.PI * 2 + t * 2.6 * Math.PI * 2
    const r = 0.42 - t * 0.26
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.036 + 0.066 * Math.min(1, t * 6), Math.sin(a) * r))
  }
  // loose end trailing over the deck
  const e = pts[pts.length - 1]
  pts.push(new THREE.Vector3(e.x + 0.15, 0.08, e.z + 0.25), new THREE.Vector3(e.x + 0.25, 0.036, e.z + 0.55), new THREE.Vector3(e.x + 0.1, 0.036, e.z + 0.85))
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 900, 0.036, 8)
}

/* ------------------------------------------------------------------ scene */

function Plank({ p, s, c }: { p: [number, number, number]; s: [number, number, number]; c: string }) {
  return (
    <mesh position={p} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  )
}

const WOOD = '#c09a70'
const WOOD_2 = '#b08a62'
const WOOD_D = '#8a6646'
const FLOOR = '#d8bc94'
const IRON = '#2f2f33'
const PORT = { x0: 1.05, x1: 1.95, y0: 0.64, y1: 1.28 }
const BACK_Z = -1.7
const RIGHT_X = 3.5

function Deck({ yaw, pitch, fx }: { yaw: MotionValue<number>; pitch: MotionValue<number>; fx: StylizeEffect }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useEffect(() => bindDitherCamera(fx, camera), [fx, camera])

  const geo = useMemo(() => ({ barrel: barrelGeo(), cannon: cannonGeo(), rope: ropeGeo() }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  const lantern = useRef<THREE.Group>(null)
  const st = useRef({ t: POSTER ? 2.2 : 0, layout: '' })

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    s.t += dt
    const t = s.t
    const mobile = size.width < 760

    /* camera: fixed position, slow look-around drift + drag offsets (pure rotation) */
    const key = `${size.width}x${size.height}`
    if (s.layout !== key) {
      s.layout = key
      camera.fov = mobile ? 64 : 44
      camera.near = 0.1
      camera.far = 60
      if (mobile) camera.setViewOffset(size.width, size.height, 0, size.height * 0.17, size.width, size.height)
      else camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
    if (mobile) camera.position.set(0.2, 1.5, 4.6)
    else camera.position.set(-0.45, 1.55, 4.7)
    const baseYaw = POSTER ? 0.15 : mobile ? 0.12 : 0.04
    const drift = POSTER ? 0 : Math.sin(t * 0.11) * 0.11 + Math.sin(t * 0.037 + 1) * 0.05
    camera.rotation.order = 'YXZ'
    camera.rotation.set(-0.1 + pitch.get() + Math.sin(t * 0.17) * 0.025, -(baseYaw + drift + yaw.get()), 0)

    /* lantern swings like a ship's lamp in a slow swell */
    if (lantern.current) {
      lantern.current.rotation.z = Math.sin(t * 1.05) * 0.38
      lantern.current.rotation.x = Math.sin(t * 0.7 + 0.8) * 0.14
    }
  })

  // ---- static set: floor, back wall with gun port, right wall, ribs, ceiling beams
  const set = useMemo(() => {
    const out: React.ReactElement[] = []
    // floor planks running toward the hull
    for (let i = 0; i < 26; i++) {
      const x = -4 + i * 0.3 + 0.15
      const tint = i % 3 === 0 ? '#cfb189' : i % 3 === 1 ? FLOOR : '#e0c7a2'
      out.push(<Plank key={`f${i}`} p={[x, -0.025, 1.6]} s={[0.288, 0.05, 6.6]} c={tint} />)
    }
    // back wall planks (horizontal), with the gun-port gap
    const ph = 0.32
    for (let j = 0; j < 11; j++) {
      const y = j * ph + ph / 2
      const c = j % 2 ? WOOD : WOOD_2
      if (y > PORT.y0 && y < PORT.y1) {
        const l0 = -4.2
        const r1 = RIGHT_X
        out.push(<Plank key={`bl${j}`} p={[(l0 + PORT.x0) / 2, y, BACK_Z]} s={[PORT.x0 - l0, ph - 0.014, 0.08]} c={c} />)
        out.push(<Plank key={`br${j}`} p={[(PORT.x1 + r1) / 2, y, BACK_Z]} s={[r1 - PORT.x1, ph - 0.014, 0.08]} c={c} />)
      } else {
        out.push(<Plank key={`b${j}`} p={[-0.35, y, BACK_Z]} s={[7.7, ph - 0.014, 0.08]} c={c} />)
      }
    }
    // gun-port frame
    const fx0 = PORT.x0 - 0.06
    const fx1 = PORT.x1 + 0.06
    out.push(<Plank key="ps" p={[(fx0 + fx1) / 2, PORT.y0 - 0.04, BACK_Z + 0.07]} s={[fx1 - fx0 + 0.12, 0.1, 0.14]} c={WOOD_D} />)
    out.push(<Plank key="pt" p={[(fx0 + fx1) / 2, PORT.y1 + 0.04, BACK_Z + 0.07]} s={[fx1 - fx0 + 0.12, 0.1, 0.14]} c={WOOD_D} />)
    out.push(<Plank key="pl" p={[fx0, (PORT.y0 + PORT.y1) / 2, BACK_Z + 0.07]} s={[0.1, PORT.y1 - PORT.y0 + 0.18, 0.14]} c={WOOD_D} />)
    out.push(<Plank key="pr" p={[fx1, (PORT.y0 + PORT.y1) / 2, BACK_Z + 0.07]} s={[0.1, PORT.y1 - PORT.y0 + 0.18, 0.14]} c={WOOD_D} />)
    // ribs on the back wall
    for (const x of [-3.0, -1.55, 0.2, 2.75]) out.push(<Plank key={`r${x}`} p={[x, 1.65, BACK_Z + 0.1]} s={[0.2, 3.3, 0.14]} c={WOOD_D} />)
    // right wall (planks along z) + ribs
    for (let j = 0; j < 11; j++) {
      out.push(<Plank key={`rw${j}`} p={[RIGHT_X, j * ph + ph / 2, 1.6]} s={[0.08, ph - 0.014, 6.6]} c={j % 2 ? WOOD : WOOD_2} />)
    }
    for (const z of [-0.2, 1.5, 3.2]) out.push(<Plank key={`rr${z}`} p={[RIGHT_X - 0.1, 1.65, z]} s={[0.14, 3.3, 0.2]} c={WOOD_D} />)
    // ceiling + beams
    out.push(<Plank key="ceil" p={[-0.3, 3.42, 1.6]} s={[8, 0.06, 6.8]} c="#8a6a4a" />)
    for (const z of [-1.0, 0.65, 2.3, 3.95]) out.push(<Plank key={`cb${z}`} p={[-0.3, 3.24, z]} s={[8, 0.28, 0.24]} c={WOOD_D} />)
    // dark backing behind the plank gaps (otherwise the gaps show the sky colour)
    const back = (k: string, x0: number, x1: number, y0: number, y1: number) =>
      out.push(<mesh key={k} position={[(x0 + x1) / 2, (y0 + y1) / 2, BACK_Z - 0.08]} castShadow><boxGeometry args={[x1 - x0, y1 - y0, 0.04]} /><meshStandardMaterial color="#2a2018" /></mesh>)
    back('bk1a', -4.4, PORT.x0, -0.1, 3.6)
    back('bk1b', PORT.x1, RIGHT_X + 0.1, -0.1, 3.6)
    back('bk1c', PORT.x0, PORT.x1, -0.1, PORT.y0)
    back('bk1d', PORT.x0, PORT.x1, PORT.y1, 3.6)
    out.push(<mesh key="bk2" position={[RIGHT_X + 0.08, 1.7, 1.6]}><boxGeometry args={[0.04, 3.6, 7]} /><meshStandardMaterial color="#2a2018" /></mesh>)
    out.push(<mesh key="bk3" position={[-0.3, -0.08, 1.6]}><boxGeometry args={[8.4, 0.04, 7]} /><meshStandardMaterial color="#2a2018" /></mesh>)
    // knee brace in the corner
    out.push(<Plank key="knee" p={[RIGHT_X - 0.18, 2.95, BACK_Z + 0.2]} s={[0.22, 0.6, 0.22]} c={WOOD_D} />)
    return out
  }, [])

  const balls = useMemo(() => {
    const out: [number, number, number][] = []
    const r = 0.1
    for (let l = 0; l < 3; l++) {
      const n = 3 - l
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) out.push([(i - (n - 1) / 2) * 2 * r, r + l * r * Math.SQRT2, (k - (n - 1) / 2) * 2 * r])
    }
    return out
  }, [])

  return (
    <>
      <hemisphereLight args={['#fff4dc', '#5a4632', 0.07]} />
      {/* daylight through the gun port: the hull shadows everything else */}
      <spotLight
        position={[3.4, 3.3, -6.2]}
        angle={0.32}
        penumbra={0.35}
        intensity={240}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-near={2}
        shadow-camera-far={16}
        onUpdate={(l) => {
          l.target.position.set(0.75, 0, 0.3)
          l.target.updateMatrixWorld()
        }}
      />

      {set}

      {/* the sea and the horizon, seen through the port */}
      <mesh position={[0, -0.6, -40]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 70]} />
        <meshBasicMaterial color="#d6cfbb" />
      </mesh>

      {/* cannon on its carriage, aimed out of the port */}
      <group position={[1.5, 0, -0.25]} rotation={[0, 0.04, 0]}>
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 0.2, 0, 0]}>
            <Plank p={[0, 0.3, 0]} s={[0.08, 0.2, 1.05]} c={WOOD_D} />
            <Plank p={[0, 0.47, -0.2]} s={[0.08, 0.16, 0.6]} c={WOOD_D} />
            <Plank p={[0, 0.6, -0.33]} s={[0.08, 0.12, 0.32]} c={WOOD_D} />
          </group>
        ))}
        {[-0.38, 0.38].map((z) => (
          <group key={z}>
            <mesh position={[0, 0.17, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
              <cylinderGeometry args={[0.04, 0.04, 0.66, 12]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.8} />
            </mesh>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.31, 0.17, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
                <cylinderGeometry args={[0.17, 0.17, 0.07, 28]} />
                <meshStandardMaterial color="#8d6a47" roughness={0.8} />
              </mesh>
            ))}
          </group>
        ))}
        <group position={[0, 0.66, 0.55]} rotation={[-Math.PI / 2 + 0.05, 0, 0]}>
          <mesh geometry={geo.cannon} castShadow receiveShadow>
            <meshStandardMaterial color={IRON} roughness={0.42} metalness={0.55} />
          </mesh>
          <mesh position={[0, 0.55, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.46, 14]} />
            <meshStandardMaterial color={IRON} roughness={0.42} metalness={0.55} />
          </mesh>
        </group>
        {/* breeching rope to the hull */}
        <mesh position={[0, 0.5, 0.75]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.07, 0.022, 8, 20]} />
          <meshStandardMaterial color="#c9b38a" roughness={1} />
        </mesh>
      </group>

      {/* shot pyramid */}
      <group position={[2.55, 0, 0.75]}>
        <Plank p={[0, 0.02, 0]} s={[0.72, 0.04, 0.72]} c={WOOD_D} />
        {balls.map((p, i) => (
          <mesh key={i} position={[p[0], p[1] + 0.04, p[2]]} castShadow receiveShadow>
            <sphereGeometry args={[0.1, 24, 16]} />
            <meshStandardMaterial color={IRON} roughness={0.38} metalness={0.5} />
          </mesh>
        ))}
      </group>

      {/* barrels */}
      {(
        [
          [-1.35, -1.05, 0.2],
          [-0.72, -1.2, 1.4],
          [-2.05, -0.75, 2.6],
        ] as const
      ).map(([x, z, r], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}>
          <mesh geometry={geo.barrel} castShadow receiveShadow>
            <meshStandardMaterial color={i === 1 ? '#9b774f' : '#8a6743'} roughness={0.8} />
          </mesh>
          {[0.1, 0.27, 0.63, 0.8].map((y) => (
            <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[0.265 + 0.055 * Math.sin((Math.PI * y) / 0.9) + 0.006, 0.014, 6, 40]} />
              <meshStandardMaterial color="#3a332c" roughness={0.6} metalness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {/* a barrel on its side, chocked */}
      <group position={[-1.75, 0.3, 0.5]} rotation={[0, 0.5, Math.PI / 2]}>
        <mesh geometry={geo.barrel} position={[0, -0.45, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#9a7752" roughness={0.8} />
        </mesh>
        {[0.1, 0.8].map((y) => (
          <mesh key={y} position={[0, y - 0.45, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.285, 0.014, 6, 40]} />
            <meshStandardMaterial color="#3a332c" roughness={0.6} metalness={0.3} />
          </mesh>
        ))}
      </group>

      {/* rope coil */}
      <mesh geometry={geo.rope} position={[0.15, 0, 0.95]} castShadow receiveShadow>
        <meshStandardMaterial color="#d8c6a0" roughness={0.95} />
      </mesh>

      {/* crate */}
      <group position={[2.75, 0, -0.95]} rotation={[0, -0.25, 0]}>
        <Plank p={[0, 0.3, 0]} s={[0.62, 0.6, 0.62]} c="#b08d64" />
        {[-0.24, 0.24].map((x) => (
          <Plank key={x} p={[x, 0.3, 0.32]} s={[0.07, 0.6, 0.03]} c={WOOD_D} />
        ))}
        <Plank p={[0, 0.3, 0.32]} s={[0.55, 0.07, 0.03]} c={WOOD_D} />
      </group>

      {/* the swinging lantern */}
      <group ref={lantern} position={[0.3, 3.1, 0.65]}>
        <mesh position={[0, -0.36, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.72, 6]} />
          <meshStandardMaterial color="#2a2420" />
        </mesh>
        <group position={[0, -0.95, 0]}>
          <mesh position={[0, 0.27, 0]}>
            <coneGeometry args={[0.15, 0.17, 6]} />
            <meshStandardMaterial color="#3b332b" roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.39, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.045, 0.01, 6, 16]} />
            <meshStandardMaterial color="#3b332b" />
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 0.36, 6]} />
            <meshStandardMaterial color="#fff2c8" emissive="#ffe1a0" emissiveIntensity={3.5} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const a = (k / 6) * Math.PI * 2 + Math.PI / 6
            return (
              <mesh key={k} position={[Math.cos(a) * 0.105, 0, Math.sin(a) * 0.105]}>
                <boxGeometry args={[0.018, 0.38, 0.018]} />
                <meshStandardMaterial color="#3b332b" />
              </mesh>
            )
          })}
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.13, 0.11, 0.05, 6]} />
            <meshStandardMaterial color="#3b332b" roughness={0.5} metalness={0.4} />
          </mesh>
          <pointLight
            intensity={30}
            decay={2}
            color="#ffd9a0"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.002}
            shadow-camera-near={0.25}
          />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function OneBitDither() {
  const fx = useMemo(() => createDitherEffect({ mode: 'blue', palette: 'obra', world: true }), [])
  const orig = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<DitherMode>('blue')
  const [palette, setPalette] = useState<DitherPalette>('obra')
  const [world, setWorld] = useState(true)
  const [thr, setThr] = useState(0.5)
  const [mobile] = useState(MOBILE)

  const yaw = useMotionValue(0)
  const pitch = useMotionValue(0)
  const split = useOriginalSplit()
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  useEffect(() => setDitherMode(fx, mode), [fx, mode])
  useEffect(() => setDitherPalette(fx, palette), [fx, palette])
  useEffect(() => setDitherWorld(fx, world), [fx, world])
  useEffect(() => setDitherTone(fx, { bias: 0.5 - thr }), [fx, thr])

  // idle tour through methods / palettes
  useEffect(() => {
    if (POSTER) return
    let i = 0
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      i = (i + 1) % TOUR.length
      const s = TOUR[i]
      setMode(s.mode)
      setWorld(s.world)
      setPalette(s.palette)
    }, 5200)
    return () => window.clearInterval(id)
  }, [])

  // drag to look around the deck (Motion inertia on release)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .od-card, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    yaw.set(THREE.MathUtils.clamp(yaw.get() - (e.clientX - d.x) * 0.0013, -0.45, 0.32))
    pitch.set(THREE.MathUtils.clamp(pitch.get() - (e.clientY - d.y) * 0.0011, -0.22, 0.2))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(yaw, yaw.get(), { type: 'inertia', velocity: yaw.getVelocity(), power: 0.25, timeConstant: 450, min: -0.45, max: 0.32, bounceStiffness: 120, bounceDamping: 20 }),
      animate(pitch, pitch.get(), { type: 'inertia', velocity: pitch.getVelocity(), power: 0.25, timeConstant: 400, min: -0.22, max: 0.2, bounceStiffness: 140, bounceDamping: 20 }),
    ]
  }

  const pal = ditherPalettes.find((p) => p.id === palette)!
  const cardDark = CARD[palette] === 'dark'
  const paper = cardDark ? pal.dark : pal.light
  const ink = cardDark ? pal.light : pal.dark
  const pick = <T,>(fn: (v: T) => void) => (v: T) => {
    poke()
    fn(v)
  }

  return (
    <div
      className="stage od"
      style={{ background: pal.light, ['--od-paper' as string]: paper, ['--od-ink' as string]: ink }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [-0.45, 1.55, 4.7], fov: 40 }}>
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background="#f2ead8" exposure={1.05} />
        <Deck yaw={yaw} pitch={pitch} fx={fx} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label="1-bit" />

        <div className="od-col">
        <motion.div
          className="od-card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="od-kicker">
            <b>1-BIT</b>
            <span>两种墨 · 一间船舱</span>
          </p>
          <h1>每一格只能深或浅</h1>
          <p className="od-sub">
            画面按 2px 一格切开，每格只用两种颜色之一，明暗全靠阈值图的疏密来骗眼睛。转动镜头时，
            <em>世界稳定</em>让网点贴在船舱上，而不是在画面里“游泳”。
          </p>
          <div className="od-note">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={mode + String(world)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              >
                {MODE_NOTE[mode]}
                {mode !== 'error' && <i>{world ? ' · 世界稳定' : ' · 屏幕空间'}</i>}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="od-row">
            <span className="od-label">调色</span>
            <div className="od-swatches">
              {ditherPalettes.map((p) => (
                <button
                  key={p.id}
                  className="od-sw"
                  aria-pressed={p.id === palette}
                  aria-label={p.label}
                  title={p.label}
                  onClick={() => pick(setPalette)(p.id)}
                  style={{ ['--a' as string]: p.dark, ['--b' as string]: p.light }}
                >
                  {p.id === palette && <motion.span layoutId="od-sw-ring" className="od-sw-ring" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                  <i />
                </button>
              ))}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={palette}
                  className="od-sw-name"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.3 }}
                >
                  {pal.label}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
          <label className="od-row od-thr">
            <span className="od-label">阈值</span>
            <input
              type="range"
              min={0.3}
              max={0.7}
              step={0.01}
              value={thr}
              onChange={(e) => {
                poke()
                setThr(Number(e.target.value))
              }}
              style={{ ['--v' as string]: `${((thr - 0.3) / 0.4) * 100}%` }}
            />
            <span className="od-val">{Math.round(thr * 100)}%</span>
          </label>
        </motion.div>
        </div>

        <div className="dock">
          <Seg items={ditherModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))} value={mode} onChange={pick(setMode)} />
          <span className="dock-sep" />
          <span className={mode === 'error' ? 'od-space od-dim' : 'od-space'} title={mode === 'error' ? '误差扩散按扫描顺序逐格计算，天生跟着屏幕走' : undefined}>
            <Seg
              items={[
                { value: 0, label: mobile ? '屏幕' : '屏幕空间' },
                { value: 1, label: mobile ? '世界' : '世界稳定' },
              ]}
              value={world ? 1 : 0}
              onChange={pick((v: number) => setWorld(v === 1))}
            />
          </span>
          <span className="dock-sep" />
          <button className="seg od-toggle" aria-pressed={split.open} onClick={() => { poke(); split.toggle() }}>
            {split.open && <motion.span layoutId="od-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">
          拖动环顾船舱
          <br />
          {mode === 'error' ? '误差扩散逐格扫描，只能跟着屏幕走' : world ? '网点跟着船舱走' : '屏幕空间：网点在画面上“游泳”'}
        </p>
      </div>
    </div>
  )
}

const css = `
/* the chrome's frosted chips average a 1-bit pattern to mid-grey — give them a solid paper backing */
.demo-page:has(.od) .chip { background: rgba(236, 226, 202, 0.94); box-shadow: inset 0 0 0 1px rgba(43, 33, 24, 0.35), 0 2px 0 rgba(43, 33, 24, 0.55); color: #2b2118; }
.demo-page:has(.od) .chip-title b, .demo-page:has(.od) .chip-title span { color: rgba(43, 33, 24, 0.7); }

.od { cursor: grab; touch-action: none; transition: background .6s; }
.od:active { cursor: grabbing; }
.od canvas { display: block; }
.od-col {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px; width: min(408px, calc(100% - 48px));
  display: flex; flex-direction: column; justify-content: center; pointer-events: none !important;
}
.od-card {
  position: relative; pointer-events: auto; padding: 26px 28px 22px;
  background: var(--od-paper); color: var(--od-ink);
  outline: 1.5px solid var(--od-ink); outline-offset: -7px;
  box-shadow: inset 0 0 0 1.5px var(--od-ink);
  transition: background .6s, color .6s, outline-color .6s, box-shadow .6s;
}
.od-card::after {
  content: ''; position: absolute; left: 8px; top: 8px; right: -8px; bottom: -8px; z-index: -1;
  background: repeating-conic-gradient(var(--od-ink) 0 25%, transparent 0 50%) 0 0 / 4px 4px;
  transition: background .6s;
}
.od-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.od-kicker b { padding: 5px 7px 4px; background: var(--od-ink); color: var(--od-paper); font-weight: 700; transition: background .6s, color .6s; }
.od-kicker span { opacity: .75; letter-spacing: .08em; }
.od-card h1 { margin: 0; font: 800 clamp(30px, 2.9vw, 40px)/1.12 var(--display); letter-spacing: -.03em; }
.od-sub { margin: 14px 0 0; font-size: 14px; line-height: 1.75; opacity: .82; }
.od-sub em { font-weight: 700; opacity: 1; }
.od-note { margin-top: 14px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .02em; }
.od-note span { display: inline-block; }
.od-note i { font-style: normal; font-weight: 700; }
.od-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding-top: 14px; border-top: 1px dashed color-mix(in srgb, var(--od-ink) 40%, transparent); }
.od-row + .od-row { margin-top: 10px; padding-top: 10px; }
.od-label { font: 600 11px/1 var(--mono); letter-spacing: .1em; width: 30px; flex: none; }
.od-swatches { display: flex; align-items: center; gap: 6px; }
.od-sw { position: relative; width: 30px; height: 30px; padding: 0; border: 0; background: none; cursor: pointer; display: grid; place-items: center; }
.od-sw i {
  width: 20px; height: 20px; border-radius: 50%; position: relative; z-index: 1;
  background: linear-gradient(135deg, var(--b) 0 50%, var(--a) 50% 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--od-ink) 45%, transparent);
}
.od-sw-ring { position: absolute; inset: 0; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--od-ink); }
.od-sw-name { margin-left: 6px; font: 500 12px/1 var(--sans); white-space: nowrap; }
.od-thr input {
  flex: 1; min-width: 0; height: 22px; margin: 0; background: none; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.od-thr input::-webkit-slider-runnable-track {
  height: 6px; border: 1.5px solid var(--od-ink);
  background: linear-gradient(90deg, var(--od-ink) var(--v), transparent var(--v)),
    repeating-conic-gradient(var(--od-ink) 0 25%, transparent 0 50%) 0 0 / 2px 2px;
}
.od-thr input::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 18px; margin-top: -7.5px;
  background: var(--od-paper); border: 1.5px solid var(--od-ink);
}
.od-thr input::-moz-range-track { height: 6px; border: 1.5px solid var(--od-ink); background: transparent; }
.od-thr input::-moz-range-progress { height: 6px; background: var(--od-ink); }
.od-thr input::-moz-range-thumb { width: 12px; height: 18px; border-radius: 0; background: var(--od-paper); border: 1.5px solid var(--od-ink); }
.od-val { font: 500 11.5px/1 var(--mono); width: 32px; text-align: right; }
.od-space { display: flex; gap: 4px; transition: opacity .3s; }
.od-dim { opacity: .45; }
.od-dim .seg { cursor: default; }
.od .dock { z-index: 3; }
.od .hint { color: var(--od-ink); background: var(--od-paper); padding: 6px 9px; outline: 1px solid var(--od-ink); transition: background .6s, color .6s; }

@media (max-width: 760px) {
  .od-col { top: auto; bottom: 84px; left: 20px; width: calc(100% - 40px); }
  .od-card { padding: 16px 18px 14px; }
  .od-card h1 { font-size: 26px; }
  .od-sub, .od-note { display: none; }
  .od-kicker { margin-bottom: 10px; }
  .od-row { margin-top: 10px; padding-top: 10px; }
  .od .dock .seg { padding: 0 9px; }
  .od .dock .dock-sep { margin: 0 1px; }
}
`
