import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  createPixelEffect,
  pixelModes,
  pixelPalettes,
  pixelWorldSize,
  setPixelMode,
  setPixelPalette,
  setPixelSize,
  type PixelMode,
  type PixelPaletteId,
} from './effects/pixel'

/*
 * 像素风 showcase — a floating-island diorama at dusk (cottage, tree, pond, campfire with a flickering
 * light, chimney smoke, fireflies) seen through an orthographic camera.
 *
 * Pixel-snapped camera: the camera never rotates; its target drifts (idle bob / layout offset) but is
 * rounded to whole art pixels along the camera's right / up axes every frame, so the low-res raster only
 * ever moves by integer texels and static geometry never shimmers. Only turning the island (drag) re-samples it.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const SIZES = [
  { label: '3px', css: 3 },
  { label: '4px', css: 4 },
  { label: '6px', css: 6 },
]

// idle tour: a few (mode, palette) looks
const TOUR: { mode: PixelMode; pal: PixelPaletteId }[] = [
  { mode: 'modern', pal: 'sweetie' },
  { mode: 'modern', pal: 'pico8' },
  { mode: 'gameboy', pal: 'pico8' },
  { mode: 'modern', pal: 'endesga' },
  { mode: 'crt', pal: 'endesga' },
  { mode: 'modern', pal: '1bit' },
  { mode: 'crt', pal: 'sweetie' },
]

const DUSK_BG = new THREE.Color('#2c3b80')
const NIGHT_BG = new THREE.Color('#1b2048')

/* ------------------------------------------------------------------ camera */

const DIR = new THREE.Vector3(1, 0.82, 1).normalize()

function SnapRig({ pixel, drift }: { pixel: MotionValue<number>; drift: React.RefObject<THREE.Vector2> }) {
  const cam = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const R = useMemo(() => ({ right: new THREE.Vector3(), up: new THREE.Vector3(), T: new THREE.Vector3(), d: new THREE.Vector2(), t: 0, init: false }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    if (!POSTER) R.t += dt
    if (!R.init) {
      cam.position.copy(DIR).multiplyScalar(50)
      cam.lookAt(0, 0, 0)
      cam.updateMatrixWorld()
      R.right.setFromMatrixColumn(cam.matrixWorld, 0)
      R.up.setFromMatrixColumn(cam.matrixWorld, 1)
      R.init = true
    }
    const mobile = size.width < 760
    const fit = mobile ? 12.5 : POSTER ? 14 : 16
    const zoom = Math.min(size.width, size.height * 1.3) / fit
    if (cam.zoom !== zoom) {
      cam.zoom = zoom
      cam.updateProjectionMatrix()
    }
    // target in camera-plane coordinates: layout offset + slow bob
    const ox = POSTER || mobile ? 0 : -(size.width * 0.16) / zoom
    const oy = POSTER ? 0.35 : mobile ? -(size.height * 0.14) / zoom + 0.6 : 0.45
    // pointer parallax eases in continuously — the snap below turns it into whole-pixel steps
    R.d.lerp(drift.current, 1 - Math.exp(-dt * 2.5))
    const a = ox + Math.sin(R.t * 0.21) * 0.45 + R.d.x
    const b = oy + Math.sin(R.t * 0.33 + 1) * 0.22 + R.d.y
    // snap both to the art-pixel grid
    const wpt = pixelWorldSize(pixel.get(), gl.getPixelRatio(), zoom)
    const sa = Math.round(a / wpt) * wpt
    const sb = Math.round(b / wpt) * wpt
    R.T.set(0, 0, 0).addScaledVector(R.right, sa).addScaledVector(R.up, sb)
    cam.position.copy(R.T).addScaledVector(DIR, 50)
    cam.updateMatrixWorld()
  })
  return null
}

/* ------------------------------------------------------------------ diorama */

function Box({ p, s, c, r = [0, 0, 0], e, ei = 1, shadow = true }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: [number, number, number]; e?: string; ei?: number; shadow?: boolean }) {
  return (
    <mesh position={p} rotation={r} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.9} emissive={e ?? '#000000'} emissiveIntensity={e ? ei : 0} />
    </mesh>
  )
}

function Diorama({ yaw, night }: { yaw: MotionValue<number>; night: MotionValue<number> }) {
  const island = useRef<THREE.Group>(null)
  const fireLight = useRef<THREE.PointLight>(null)
  const flames = useRef<(THREE.Mesh | null)[]>([])
  const sparks = useRef<(THREE.Mesh | null)[]>([])
  const smoke = useRef<(THREE.Mesh | null)[]>([])
  const flies = useRef<(THREE.Mesh | null)[]>([])
  const windowMat = useRef<THREE.MeshStandardMaterial>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const t = useRef(POSTER ? 3.1 : 0)
  const C = useMemo(
    () => ({ duskKey: new THREE.Color('#ffb072'), nightKey: new THREE.Color('#8ea2ff'), duskSky: new THREE.Color('#9fb0ff'), nightSky: new THREE.Color('#4a5aa8') }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const n = night.get()
    if (island.current) island.current.rotation.y = yaw.get()

    // lights follow the time of day
    if (key.current) {
      key.current.color.copy(C.duskKey).lerp(C.nightKey, n)
      key.current.intensity = THREE.MathUtils.lerp(3.9, 2.0, n)
    }
    if (hemi.current) {
      hemi.current.color.copy(C.duskSky).lerp(C.nightSky, n)
      hemi.current.intensity = THREE.MathUtils.lerp(1.1, 0.8, n)
    }
    if (windowMat.current) windowMat.current.emissiveIntensity = THREE.MathUtils.lerp(0.7, 2.4, n)

    // fire: layered flicker
    const fl = 0.75 + 0.15 * Math.sin(T * 13.1) + 0.1 * Math.sin(T * 23.7 + 1.3) + 0.08 * Math.sin(T * 7.3)
    if (fireLight.current) fireLight.current.intensity = (7 + 9 * n) * fl
    flames.current.forEach((m, i) => {
      if (!m) return
      const k = 0.85 + 0.25 * Math.sin(T * (11 + i * 3.7) + i)
      m.scale.set(1, k, 1)
      m.rotation.y = T * (0.6 + i * 0.4)
    })
    sparks.current.forEach((m, i) => {
      if (!m) return
      const ph = (T * 0.55 + i / sparks.current.length) % 1
      m.position.set(0.95 + Math.sin(i * 2.3 + T) * 0.22 * ph, 0.45 + ph * 1.9, 1.05 + Math.cos(i * 1.7) * 0.25 * ph)
      m.scale.setScalar(Math.max(0.001, (1 - ph) * 1))
    })
    smoke.current.forEach((m, i) => {
      if (!m) return
      const ph = (T * 0.2 + i / smoke.current.length) % 1
      m.position.set(-0.85 + ph * 0.9 + Math.sin(ph * 5 + i) * 0.12, 3.45 + ph * 2.4, -1.65 + ph * 0.35)
      const sc = (0.45 + ph * 1.0) * (1 - THREE.MathUtils.smoothstep(ph, 0.6, 1))
      m.scale.setScalar(Math.max(0.001, sc))
      m.rotation.set(ph * 1.5, ph * 2.1, 0)
    })
    flies.current.forEach((m, i) => {
      if (!m) return
      const a = T * (0.4 + i * 0.07) + i * 1.9
      m.position.set(1.7 + Math.cos(a) * (0.9 + i * 0.1), 1.0 + Math.sin(a * 1.7 + i) * 0.45 + i * 0.12, -1.3 + Math.sin(a) * (0.8 + i * 0.08))
      m.scale.setScalar(n > 0.25 ? 1 : 0.001)
    })
  })

  return (
    <>
      <hemisphereLight ref={hemi} args={['#9fb0ff', '#4a2f3c', 1.1]} />
      <directionalLight
        ref={key}
        position={[3.5, 10, 7]}
        intensity={2.9}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0008}
      />
      <group ref={island}>
        {/* island body */}
        <Box p={[0, -0.25, 0]} s={[7, 0.5, 7]} c="#5fae3a" />
        <Box p={[0, -1.05, 0]} s={[6.6, 1.1, 6.6]} c="#9a5b35" />
        <Box p={[0, -2.0, 0]} s={[5.2, 0.8, 5.2]} c="#6d625d" />
        <Box p={[0, -2.75, 0]} s={[3.4, 0.7, 3.4]} c="#5a5260" />
        <Box p={[0.3, -3.35, -0.2]} s={[1.6, 0.6, 1.6]} c="#4a4352" />
        {/* cottage */}
        <group position={[-1.3, 0, -1.4]}>
          <Box p={[0, 0.85, 0]} s={[2.3, 1.7, 1.9]} c="#e8c18f" />
          <mesh position={[0, 2.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
            <coneGeometry args={[1.95, 1.15, 4, 1]} />
            <meshStandardMaterial color="#c4453c" roughness={0.85} flatShading />
          </mesh>
          <Box p={[0.45, 2.55, -0.25]} s={[0.34, 0.9, 0.34]} c="#6b6470" />
          <Box p={[0.35, 0.5, 0.96]} s={[0.55, 1.0, 0.06]} c="#5b3426" shadow={false} />
          <mesh position={[-0.55, 1.05, 0.96]}>
            <boxGeometry args={[0.5, 0.48, 0.06]} />
            <meshStandardMaterial ref={windowMat} color="#ffd36b" emissive="#ffc24a" emissiveIntensity={0.7} />
          </mesh>
          <mesh position={[1.16, 1.05, 0.2]}>
            <boxGeometry args={[0.06, 0.48, 0.5]} />
            <meshStandardMaterial color="#ffd36b" emissive="#ffc24a" emissiveIntensity={1.2} />
          </mesh>
        </group>
        {/* tree */}
        <group position={[1.75, 0, -1.6]}>
          <Box p={[0, 0.7, 0]} s={[0.36, 1.4, 0.36]} c="#6b3f2a" />
          <mesh position={[0, 1.85, 0]} castShadow receiveShadow>
            <icosahedronGeometry args={[1.05, 0]} />
            <meshStandardMaterial color="#2f9a52" roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0.15, 2.65, 0.1]} rotation={[0.4, 0.3, 0]} castShadow receiveShadow>
            <icosahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#4cc062" roughness={0.9} flatShading />
          </mesh>
        </group>
        {/* bush + rocks */}
        <mesh position={[2.55, 0.35, 1.9]} castShadow receiveShadow>
          <icosahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#3aa457" roughness={0.9} flatShading />
        </mesh>
        <mesh position={[-2.7, 0.2, 0.6]} rotation={[0.3, 0.5, 0]} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.35, 0]} />
          <meshStandardMaterial color="#9a96a8" roughness={0.9} flatShading />
        </mesh>
        {/* pond */}
        <mesh position={[-1.6, 0.02, 1.7]} receiveShadow>
          <cylinderGeometry args={[0.95, 0.95, 0.05, 8]} />
          <meshStandardMaterial color="#3f8fe0" roughness={0.2} emissive="#2a5fc0" emissiveIntensity={0.25} />
        </mesh>
        {/* path stones from the door to the fire */}
        {[
          [-0.85, -0.05],
          [-0.35, 0.45],
          [0.1, 0.85],
        ].map(([x, z], i) => (
          <Box key={i} p={[x, 0.02, z]} s={[0.42, 0.06, 0.34]} c="#c9c3b6" r={[0, i * 0.4, 0]} shadow={false} />
        ))}
        {/* fence */}
        {[-2.9, -2.2, -1.5, -0.8].map((x, i) => (
          <Box key={i} p={[x, 0.32, 3.05]} s={[0.14, 0.65, 0.14]} c="#b07a4a" />
        ))}
        <Box p={[-1.85, 0.42, 3.05]} s={[2.3, 0.1, 0.08]} c="#b07a4a" />
        {/* campfire */}
        <group position={[0.95, 0, 1.05]}>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * 0.48, 0.1, Math.sin(a) * 0.48]} rotation={[a, a * 2, 0]} castShadow>
                <dodecahedronGeometry args={[0.13, 0]} />
                <meshStandardMaterial color="#8d8a99" roughness={0.9} flatShading />
              </mesh>
            )
          })}
          <Box p={[0, 0.1, 0]} s={[0.7, 0.12, 0.14]} c="#7a4a2c" r={[0, 0.5, 0]} />
          <Box p={[0, 0.16, 0]} s={[0.7, 0.12, 0.14]} c="#6b3f26" r={[0, -0.7, 0]} />
          {[
            { r: 0.26, h: 0.75, c: '#ff6a1f', y: 0.48 },
            { r: 0.16, h: 0.55, c: '#ffd23a', y: 0.42 },
          ].map((f, i) => (
            <mesh key={i} ref={(m) => void (flames.current[i] = m)} position={[0, f.y, 0]}>
              <coneGeometry args={[f.r, f.h, 5]} />
              <meshStandardMaterial color={f.c} emissive={f.c} emissiveIntensity={2.2} flatShading />
            </mesh>
          ))}
          <pointLight ref={fireLight} position={[0, 0.7, 0]} color="#ff8a3a" intensity={8} decay={2} distance={0} />
        </group>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} ref={(m) => void (sparks.current[i] = m)}>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshStandardMaterial color="#ffe14a" emissive="#ffc23a" emissiveIntensity={3} />
          </mesh>
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={i} ref={(m) => void (smoke.current[i] = m)}>
            <boxGeometry args={[0.26, 0.26, 0.26]} />
            <meshStandardMaterial color="#d6d9ec" emissive="#7d84a8" emissiveIntensity={0.7} roughness={1} />
          </mesh>
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} ref={(m) => void (flies.current[i] = m)}>
            <boxGeometry args={[0.06, 0.06, 0.06]} />
            <meshStandardMaterial color="#e9ff8a" emissive="#d8ff5a" emissiveIntensity={4} />
          </mesh>
        ))}
      </group>
    </>
  )
}

/* moon + clouds, anchored to the camera so they act like a far backdrop */
function Sky() {
  const cam = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const moon = useRef<THREE.Mesh>(null)
  const g = useRef<THREE.Group>(null)
  const clouds = useRef<(THREE.Group | null)[]>([])
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!POSTER) t.current += Math.min(dt, 1 / 30)
    if (!g.current) return
    g.current.position.copy(cam.position).addScaledVector(DIR, -80)
    g.current.quaternion.copy(cam.quaternion)
    // place the backdrop in viewport fractions so it frames the island on any aspect
    const hw = size.width / 2 / cam.zoom
    const hh = size.height / 2 / cam.zoom
    const mobile = size.width < 760
    moon.current?.position.set(hw * (mobile ? 0.5 : 0.57), hh * (mobile ? 0.5 : 0.56), 0)
    clouds.current.forEach((c, i) => {
      if (!c) return
      const span = hw * 2.6
      const x = ((((i * 11 + t.current * (0.25 + i * 0.1)) % span) + span) % span) - span / 2
      c.position.set(x, hh * (i === 0 ? 0.74 : 0.36), -1)
    })
  })
  return (
    <group ref={g}>
      <mesh ref={moon}>
        <circleGeometry args={[0.85, 24]} />
        <meshBasicMaterial color="#fff2c4" />
      </mesh>
      {[
        { y: 2.2, s: 0.8 },
        { y: 4.6, s: 0.55 },
      ].map((c, i) => (
        <group key={i} ref={(m) => void (clouds.current[i] = m)} position={[0, c.y, -1]} scale={c.s}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[2.4, 0.5, 0.1]} />
            <meshBasicMaterial color="#5d6f9c" />
          </mesh>
          <mesh position={[-0.3, 0.38, 0]}>
            <boxGeometry args={[1.3, 0.4, 0.1]} />
            <meshBasicMaterial color="#5d6f9c" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ page */

export default function PixelArt() {
  const fx = useMemo(createPixelEffect, [])
  const orig = useMemo(createOriginalEffect, [])
  const [mobile] = useState(MOBILE)
  const [mode, setMode] = useState<PixelMode>('modern')
  const [pal, setPal] = useState<PixelPaletteId>('sweetie')
  const [size, setSize] = useState(mobile ? 0 : 1)
  const [split, setSplit] = useState(false)
  const [splitLive, setSplitLive] = useState(false)
  const bg = useMemo(() => DUSK_BG.clone(), [])

  const yaw = useMotionValue(0)
  const night = useMotionValue(POSTER ? 0.35 : 0)
  const pixel = useMotionValue(SIZES[mobile ? 0 : 1].css)
  const wipe = useMotionValue(1)
  const drift = useRef(new THREE.Vector2())
  const stage = useRef<HTMLDivElement>(null)
  const lastInput = useRef(0)

  useEffect(() => setPixelMode(fx, mode), [fx, mode])
  useEffect(() => setPixelPalette(fx, pal), [fx, pal])
  useEffect(() => {
    pixel.set(SIZES[size].css)
    setPixelSize(fx, SIZES[size].css)
  }, [fx, size, pixel])

  // time of day: dusk ↔ night, slowly
  useEffect(() => {
    if (POSTER) return
    const a = animate(night, [0, 1, 1, 0, 0], { duration: 44, times: [0, 0.4, 0.55, 0.95, 1], ease: 'easeInOut', repeat: Infinity })
    return () => a.stop()
  }, [night])
  useEffect(
    () =>
      night.on('change', (n) => {
        bg.copy(DUSK_BG).lerp(NIGHT_BG, n)
      }),
    [night, bg],
  )

  // idle: tour through looks, and give the island a quarter turn now and then
  useEffect(() => {
    if (POSTER) return
    let i = 0
    let last = performance.now()
    let turns = 0
    const id = setInterval(() => {
      const now = performance.now()
      if (now - lastInput.current < 8000 || now - last < 5200) return
      last = now
      i = (i + 1) % TOUR.length
      setMode(TOUR[i].mode)
      setPal(TOUR[i].pal)
      if (++turns % 3 === 0) animate(yaw, Math.round(yaw.get() / (Math.PI / 2)) * (Math.PI / 2) + Math.PI / 2, { type: 'spring', stiffness: 60, damping: 14 })
    }, 400)
    return () => clearInterval(id)
  }, [yaw])

  useEffect(() => {
    if (split) setSplitLive(true)
    const a = animate(wipe, split ? (mobile ? 0.5 : 0.62) : 1, { type: 'spring', stiffness: 140, damping: 22, onComplete: () => !split && setSplitLive(false) })
    return () => a.stop()
  }, [split, wipe, mobile])

  /* drag: turn the island; let go and it coasts, then settles on a 90° step (the iso view) */
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    lastInput.current = performance.now()
    if ((e.target as HTMLElement).closest('.dock, .px-handle, .px-pals')) return
    anim.current?.stop()
    drag.current = { x: e.clientX, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const r = stage.current!.getBoundingClientRect()
      drift.current.set(((e.clientX - r.left) / r.width - 0.5) * -0.9, ((e.clientY - r.top) / r.height - 0.5) * 0.6)
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    lastInput.current = performance.now()
    yaw.set(yaw.get() + (e.clientX - d.x) * 0.008)
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    const q = Math.PI / 2
    anim.current = animate(yaw, yaw.get(), {
      type: 'inertia',
      velocity: yaw.getVelocity(),
      power: 0.35,
      timeConstant: 320,
      modifyTarget: (v) => Math.round(v / q) * q,
    })
  }

  const onHandleDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    lastInput.current = performance.now()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onHandleMove = (e: React.PointerEvent) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
    const r = stage.current!.getBoundingClientRect()
    wipe.set(THREE.MathUtils.clamp(((e.clientX - r.left) / r.width) * 0.84 + ((e.clientY - r.top) / r.height) * 0.16, 0.08, 0.96))
  }
  const [seam, setSeam] = useState({ x0: 0, x1: 0, on: false })
  useEffect(() => wipe.on('change', (w) => setSeam({ x0: (w / 0.84) * 100, x1: ((w - 0.16) / 0.84) * 100, on: w < 0.995 })), [wipe])

  // resolution readout
  const [res, setRes] = useState('')
  useEffect(() => {
    const f = () => {
      const p = SIZES[size].css
      setRes(`${Math.round(window.innerWidth / p)}×${Math.round(window.innerHeight / p)}`)
    }
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [size])

  const shownPal = mode === 'gameboy' ? 'gb' : pal
  const palInfo = pixelPalettes.find((p) => p.id === shownPal)!
  const pickPal = (id: PixelPaletteId) => {
    lastInput.current = performance.now()
    if (id === 'gb') {
      setMode('gameboy')
      return
    }
    setPal(id)
    if (mode === 'gameboy') setMode('modern')
  }

  return (
    <div
      ref={stage}
      className="stage px"
      style={{ background: '#1a1c2c' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [50, 41, 50], zoom: 60, near: 0.1, far: 300 }}
      >
        <Stylize effect={fx} prev={splitLive ? orig : null} wipe={wipe} background={bg} samples={0} />
        <SnapRig pixel={pixel} drift={drift} />
        <Diorama yaw={yaw} night={night} />
        <Sky />
      </Canvas>

      <div className="overlay">
        <div className="px-copy">
          <span className="scrim" style={{ ['--soft-bg' as string]: '#1a1c2c' }} />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="px-kicker">
              <i />
              low-res · {res} px
            </p>
            <h1>
              像素对齐的
              <br />
              小小世界
            </h1>
            <p className="px-sub">场景先按 1/{SIZES[size].css} 分辨率渲染，再在 OKLab 空间里找最近的调色板颜色，相邻两色之间用 4×4 Bayer 抖动；深度断层处补 1px 深色描边。</p>
            <div className="px-pals" role="radiogroup" aria-label="调色板">
              {pixelPalettes.map((p) => (
                <button key={p.id} className="px-pal" aria-pressed={shownPal === p.id} onClick={() => pickPal(p.id)}>
                  {shownPal === p.id && <motion.span layoutId="px-pal" className="px-pal-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                  <span className="px-sw" data-n={p.colors.length}>
                    {p.colors.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  <span className="px-pal-name">{p.label}</span>
                </button>
              ))}
            </div>
            <div className="px-now">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={shownPal + mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                  {palInfo.colors.length} colours · {mode === 'crt' ? 'CRT scanlines' : mode === 'gameboy' ? 'DMG LCD' : 'ordered dither'}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {seam.on && (
          <>
            <svg className="px-seam" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              <line x1={seam.x0} y1={0} x2={seam.x1} y2={100} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="px-tag px-tag-l" style={{ left: `calc(${(seam.x0 + seam.x1) / 2}% - 12px)` }}>
              像素
            </span>
            <span className="px-tag" style={{ left: `calc(${(seam.x0 + seam.x1) / 2}% + 12px)` }}>
              原图
            </span>
            <button className="px-handle" style={{ left: `${(seam.x0 + seam.x1) / 2}%` }} onPointerDown={onHandleDown} onPointerMove={onHandleMove} aria-label="拖动分割线">
              ⟷
            </button>
          </>
        )}

        <div className="dock" onPointerDown={() => (lastInput.current = performance.now())}>
          <Seg items={pixelModes.map((m) => ({ value: m.id, label: mobile && m.id === 'modern' ? '现代' : m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          <Seg items={SIZES.map((s, i) => ({ value: i, label: s.label }))} value={size} onChange={setSize} />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split} onClick={() => setSplit((v) => !v)}>
            {split && <motion.span layoutId="px-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">
          相机目标点吸附到像素网格：画面只按整格平移，不闪烁
          <br />
          拖动转岛 · 松手吸附回 90° 等距视角
        </p>
      </div>
    </div>
  )
}

const css = `
.px { cursor: grab; touch-action: none; }
.px:active { cursor: grabbing; }
.px canvas { display: block; }
.px-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(440px, calc(100% - 48px)); pointer-events: none !important; isolation: isolate; color: #f4f4f4;
}
.px-copy .scrim { height: 680px; left: -160px; right: -100px; opacity: .85; }
.px-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 18px;
  font: 600 11.5px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: #94b0c2;
}
.px-kicker i { width: 8px; height: 8px; background: #ffcd75; box-shadow: 2px 2px 0 #b13e53; }
.px-copy h1 {
  margin: 0; font: 800 clamp(42px, 5.2vw, 74px)/1.06 var(--display); letter-spacing: -.02em; color: #f4f4f4;
  text-shadow: 4px 4px 0 #5d275d, 8px 8px 0 rgba(26, 28, 44, .9);
}
.px-sub { margin: 24px 0 0; max-width: 400px; font-size: 14.5px; line-height: 1.8; color: rgba(222, 230, 240, .72); }
.px-pals {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin: 22px 0 0 -10px;
  pointer-events: auto;
}
.px-pal {
  position: relative; display: flex; align-items: center; gap: 12px; height: 32px; padding: 0 12px 0 10px;
  border: 0; background: transparent; color: rgba(222, 230, 240, .6); cursor: pointer; border-radius: 2px;
  font: 500 12px/1 var(--mono); transition: color .2s;
}
.px-pal:hover, .px-pal[aria-pressed='true'] { color: #fff; }
.px-pal-bg { position: absolute; inset: 0; background: rgba(244, 244, 244, .1); box-shadow: inset 2px 0 0 #ffcd75; z-index: -1; }
.px-sw { display: grid; grid-auto-flow: column; grid-template-rows: repeat(1, 10px); gap: 0; width: 128px; }
.px-sw[data-n='32'] { grid-template-rows: repeat(2, 5px); }
.px-sw i { display: block; height: 100%; }
.px-pal-name { position: relative; }
.px-now { margin: 14px 0 0; min-height: 16px; font: 500 11.5px/16px var(--mono); color: #94b0c2; letter-spacing: .04em; }
.px-seam { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none !important; }
.px-seam line { stroke: #ffcd75; stroke-width: 2; }
.px-handle {
  position: absolute; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border: 0; border-radius: 0;
  background: #1a1c2c; color: #ffcd75; font: 700 16px/1 var(--mono); cursor: ew-resize; touch-action: none;
  box-shadow: inset 0 0 0 2px #ffcd75, 4px 4px 0 #5d275d;
}
.px-tag {
  position: absolute; top: calc(50% + 30px); pointer-events: none !important;
  font: 600 11px/1 var(--mono); letter-spacing: .1em; color: #1a1c2c; padding: 5px 7px; background: #ffcd75;
}
.px-tag-l { transform: translateX(-100%); }
@media (max-width: 760px) {
  .px-copy { top: auto; bottom: 84px; justify-content: flex-end; }
  .px-copy h1 { font-size: 36px; text-shadow: 3px 3px 0 #5d275d; }
  .px-sub, .px-now { display: none; }
  .px-kicker { margin-bottom: 12px; }
  .px-pals { flex-direction: row; flex-wrap: nowrap; gap: 4px; margin: 14px 0 0 0; }
  .px-pal { height: 28px; padding: 0 7px; }
  .px-pal-name { display: none; }
  .px-sw { width: 44px; }
  .px-sw[data-n='32'] { grid-template-rows: repeat(2, 5px); }
  .px .dock .seg { padding: 0 10px; }
  .px-copy .scrim { height: 360px; top: 64%; }
}
`
