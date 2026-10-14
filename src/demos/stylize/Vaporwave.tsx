import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import {
  createVaporwaveEffect,
  setVaporwaveGridSpeed,
  setVaporwaveLayout,
  setVaporwaveMode,
  vaporwaveMeta,
  vaporwaveModes,
  type VaporwaveEffect,
  type VaporwaveMode,
} from './effects/vaporwave'

/*
 * 蒸汽波 showcase — a plaster Roman bust (built from primitives: head, nose, blank eyes, curls, a laurel wreath,
 * a bare chest on a blue plinth) slowly turning in front of the striped sun, with a pink ring, a teal
 * icosahedron and a gold ball orbiting it. The effect (./effects/vaporwave.ts) recolours it and paints the set;
 * the page keeps the sun right behind the head and the horizon under the plinth, and adds the DOM bits:
 * palm silhouettes, full-width / katakana type, a VHS OSD and a draggable "aesthetic.exe" dialog.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const SPEEDS = [
  { zh: '停', k: 0 },
  { zh: '慢', k: 0.45 },
  { zh: '中', k: 1 },
  { zh: '快', k: 2.1 },
]
const NOTE: Record<VaporwaveMode, string> = {
  sunset: '粉橙落日 · 紫色网格 · 青色高光与品红暗部',
  y2k: '冰蓝银色铬面 · 泡泡高光 · 闪烁星芒',
  plaster: '粉青大理石 · 棋盘格地面 · 柔光石膏',
}
const FILE: Record<VaporwaveMode, string> = { sunset: 'SUNSET.MID', y2k: 'Y2K_CHROME.WAV', plaster: 'MARBLE.BMP' }
const SHORT: Record<VaporwaveMode, string> = { sunset: '日落', y2k: '千禧', plaster: '石膏' }
const ACCENT: Record<VaporwaveMode, string> = { sunset: '#ff6ad5', y2k: '#7fe9ff', plaster: '#ff8fc0' }
const BG: Record<VaporwaveMode, string> = { sunset: '#12062a', y2k: '#040d2c', plaster: '#86d4cf' }
const PALM: Record<VaporwaveMode, string> = { sunset: '#1d0733', y2k: '#04102c', plaster: '#3d8f8b' }

/* ------------------------------------------------------------------ bust */

function curlMatrices() {
  // Fibonacci sphere over the skull, minus the face, the ears and the neck
  const out: THREE.Matrix4[] = []
  const N = 230
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
    if (d.y < -0.2) continue
    if (d.z > 0.15 && d.y < 0.45) continue // face
    if (Math.abs(d.x) > 0.8 && d.y < 0.25 && d.z > -0.3) continue // ears
    if (d.z > 0.5 && d.y < 0.56) continue // forehead
    p.set(d.x * 0.34, 1.93 + d.y * 0.41, d.z * 0.38)
    const k = 0.06 + (((i * 7919) % 13) / 13) * 0.028
    s.set(k, k * 0.9, k)
    out.push(new THREE.Matrix4().compose(p, q, s))
  }
  return out
}

function laurelMatrices() {
  const out: THREE.Matrix4[] = []
  const n = 30
  const e = new THREE.Euler()
  const q = new THREE.Quaternion()
  for (let i = 0; i < n; i++) {
    // a ring around the crown, open at the back
    const t = (i / (n - 1)) * 2 - 1 // -1..1
    const ang = t * 2.5
    const x = Math.sin(ang) * 0.385
    const z = Math.cos(ang) * 0.42
    const y = 2.1 + (1 - Math.cos(ang)) * 0.04 + (i % 2 ? 0.045 : -0.015)
    // long axis along the ring, faces turned outwards, alternately tilted up / down (herringbone)
    e.set(i % 2 ? 0.45 : -0.45, ang + Math.PI / 2, 1.2, 'YZX')
    q.setFromEuler(e)
    out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.04, 0.022, 0.1)))
  }
  return out
}

function Bust({ ry, onHead }: { ry: MotionValue<number>; onHead: (x: number, y: number, bottom: number) => void }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const camera = useThree((s) => s.camera)
  const rig = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const orbit = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ico = useRef<THREE.Mesh>(null)
  const ball = useRef<THREE.Mesh>(null)
  const head = useRef<THREE.Object3D>(null)
  const foot = useRef<THREE.Object3D>(null)
  const all = useRef<THREE.Group>(null)
  const ready = usePrecompiled(all)
  const t = useRef(POSTER ? 6.5 : 0)
  const v = useMemo(() => new THREE.Vector3(), [])

  const g = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 48, 32)
    const curl = new THREE.SphereGeometry(1, 14, 10)
    const leaf = new THREE.SphereGeometry(1, 12, 8)
    const nose = new THREE.CylinderGeometry(0.0, 1, 1, 3, 1)
    const neck = new THREE.CylinderGeometry(0.17, 0.21, 0.56, 32)
    const shoulder = new THREE.CapsuleGeometry(0.2, 1.0, 12, 32)
    // the bust: a U-shaped chest that narrows into a short socle (lathe, squashed front-to-back)
    const chest = new THREE.LatheGeometry(
      [
        [0, 0.5],
        [0.17, 0.5],
        [0.2, 0.56],
        [0.3, 0.62],
        [0.45, 0.72],
        [0.56, 0.86],
        [0.62, 1.0],
        [0.6, 1.12],
        [0.46, 1.23],
        [0.2, 1.3],
        [0, 1.31],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    )
    const plinthTop = new THREE.CylinderGeometry(0.46, 0.54, 0.14, 48)
    const plinth = new THREE.BoxGeometry(1.2, 0.34, 1.0)
    const ring = new THREE.TorusGeometry(0.3, 0.075, 20, 64)
    const ico = new THREE.IcosahedronGeometry(0.24, 0)
    return { sphere, curl, leaf, nose, neck, shoulder, chest, plinthTop, plinth, ring, ico }
  }, [])
  const m = useMemo(
    () => ({
      plaster: new THREE.MeshStandardMaterial({ color: '#f1ebe3', roughness: 0.55 }),
      laurel: new THREE.MeshStandardMaterial({ color: '#8fbf6a', roughness: 0.45 }),
      plinth: new THREE.MeshStandardMaterial({ color: '#3f6fd8', roughness: 0.4 }),
      ring: new THREE.MeshStandardMaterial({ color: '#e8405e', roughness: 0.3 }),
      ico: new THREE.MeshStandardMaterial({ color: '#1fb3a4', roughness: 0.35, flatShading: true }),
      ball: new THREE.MeshStandardMaterial({ color: '#f4b43a', roughness: 0.25 }),
    }),
    [],
  )
  const curls = useMemo(curlMatrices, [])
  const leaves = useMemo(laurelMatrices, [])
  const curlRef = useRef<THREE.InstancedMesh>(null)
  const leafRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    curls.forEach((mt, i) => curlRef.current?.setMatrixAt(i, mt))
    leaves.forEach((mt, i) => leafRef.current?.setMatrixAt(i, mt))
    if (curlRef.current) curlRef.current.instanceMatrix.needsUpdate = true
    if (leafRef.current) leafRef.current.instanceMatrix.needsUpdate = true
  }, [curls, leaves])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => x.dispose())
      Object.values(m).forEach((x) => x.dispose())
    },
    [g, m],
  )

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    if (rig.current) {
      // the bust is ≈ 2.45 tall (plinth bottom at y = 0)
      const k = POSTER ? (vh * 0.62) / 2.45 : mobile ? Math.min((vh * 0.4) / 2.45, (vw * 0.62) / 2.0) : Math.min((vh * 0.6) / 2.45, (vw * 0.4) / 2.0)
      rig.current.scale.setScalar(k)
      const x = POSTER || mobile ? 0 : vw * 0.16
      const yb = POSTER ? -vh * 0.36 : mobile ? vh * 0.5 - vh * 0.62 : -vh * 0.36
      rig.current.position.set(x, yb, 0)
    }
    if (turn.current) turn.current.rotation.set(0, ry.get(), 0)
    if (orbit.current) {
      orbit.current.rotation.set(0.32, T * 0.42, 0.12)
    }
    if (ring.current) ring.current.rotation.set(T * 0.6, T * 0.9, 0)
    if (ico.current) ico.current.rotation.set(T * 0.5, T * 0.35, 0)
    if (ball.current) ball.current.position.y = 0.12 + Math.sin(T * 1.4) * 0.08
    // tell the effect where the head and the plinth bottom are on screen
    if (head.current && foot.current) {
      head.current.getWorldPosition(v).project(camera)
      const hx = v.x * 0.5 + 0.5
      const hy = 0.5 - v.y * 0.5
      foot.current.getWorldPosition(v).project(camera)
      onHead(hx, hy, 0.5 - v.y * 0.5)
    }
  })

  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#ffffff', '#6a4a7a', 0.5]} />
      <directionalLight position={[-3.2, 4, 4.5]} intensity={1.9} />
      <directionalLight position={[3.5, 1.2, 2]} intensity={0.45} />
      <directionalLight position={[0.5, 3, -4]} intensity={1.4} />
      <group ref={rig}>
        <object3D ref={foot} position={[0, 0.0, 0]} />
        <group ref={all} visible={ready}>
          <group ref={turn}>
            <object3D ref={head} position={[0, 1.8, 0]} />
            {/* plinth */}
            <mesh geometry={g.plinth} material={m.plinth} position={[0, 0.17, 0]} />
            <mesh geometry={g.plinthTop} material={m.plinth} position={[0, 0.41, 0]} />
            {/* chest + shoulders */}
            <mesh geometry={g.chest} material={m.plaster} position={[0, -0.02, -0.03]} scale={[1, 1, 0.6]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[-0.21, 1.0, 0.1]} scale={[0.26, 0.2, 0.12]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0.21, 1.0, 0.1]} scale={[0.26, 0.2, 0.12]} />
            <mesh geometry={g.shoulder} material={m.plaster} position={[0, 1.17, -0.05]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.85]} />
            {/* neck + head */}
            <mesh geometry={g.neck} material={m.plaster} position={[0, 1.44, 0.02]} rotation={[0.08, 0, 0]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.93, 0.0]} scale={[0.33, 0.4, 0.37]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.74, 0.1]} scale={[0.25, 0.23, 0.26]} />
            {/* brow ridge, nose, blank eyes, lips, chin, ears */}
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.975, 0.295]} scale={[0.22, 0.035, 0.07]} />
            <mesh geometry={g.nose} material={m.plaster} position={[0, 1.86, 0.37]} rotation={[-0.3, 0, 0]} scale={[0.065, 0.21, 0.075]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[-0.11, 1.91, 0.3]} scale={[0.055, 0.034, 0.045]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0.11, 1.91, 0.3]} scale={[0.055, 0.034, 0.045]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.735, 0.335]} scale={[0.08, 0.024, 0.045]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.695, 0.325]} scale={[0.06, 0.026, 0.045]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0, 1.62, 0.28]} scale={[0.09, 0.075, 0.07]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[-0.33, 1.9, 0.0]} scale={[0.045, 0.1, 0.07]} />
            <mesh geometry={g.sphere} material={m.plaster} position={[0.33, 1.9, 0.0]} scale={[0.045, 0.1, 0.07]} />
            {/* curls + laurel */}
            <instancedMesh ref={curlRef} args={[g.curl, m.plaster, curls.length]} />
            <instancedMesh ref={leafRef} args={[g.leaf, m.laurel, leaves.length]} />
          </group>
          {/* orbiting props */}
          <group position={[0, 1.6, 0]}>
            <group ref={orbit}>
              <mesh ref={ring} geometry={g.ring} material={m.ring} position={[1.45, 0.1, 0]} />
              <mesh ref={ico} geometry={g.ico} material={m.ico} position={[-1.3, 0.35, 0.6]} />
              <mesh ref={ball} geometry={g.sphere} material={m.ball} position={[0.2, 0.12, -1.4]} scale={0.13} />
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ DOM deco */

function Palm({ flip, color, className }: { flip?: boolean; color: string; className: string }) {
  // a leaning trunk + seven drooping fronds
  const fronds = [
    'M0 0 C -40 -18 -92 -10 -128 26 C -96 4 -52 2 0 0',
    'M0 0 C -30 -40 -82 -52 -122 -34 C -80 -40 -40 -26 0 0',
    'M0 0 C -6 -46 -36 -82 -70 -96 C -40 -70 -20 -40 0 0',
    'M0 0 C 18 -44 52 -72 92 -80 C 56 -62 28 -36 0 0',
    'M0 0 C 40 -30 90 -36 128 -14 C 90 -24 46 -16 0 0',
    'M0 0 C 44 -6 92 12 118 48 C 86 18 46 8 0 0',
    'M0 0 C -14 -10 -48 6 -70 42 C -44 12 -22 4 0 0',
  ]
  return (
    <svg className={className} viewBox="-150 -110 300 520" style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden>
      <g fill={color}>
        <path d="M-6 0 C 4 120 26 260 64 410 L 88 410 C 46 262 20 124 8 0 Z" />
        {fronds.map((d, i) => (
          <path key={i} d={d} />
        ))}
        <circle cx="2" cy="4" r="9" />
      </g>
    </svg>
  )
}

function Win95({ mode, onNext, onClose, bounds }: { mode: VaporwaveMode; onNext: () => void; onClose: () => void; bounds: React.RefObject<HTMLDivElement | null> }) {
  return (
    <motion.div
      className="vw-win"
      drag
      dragConstraints={bounds}
      dragMomentum
      dragElastic={0.15}
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="vw-title">
        <span>aesthetic.exe</span>
        <div className="vw-tbtn">
          <button tabIndex={-1} aria-hidden>
            _
          </button>
          <button aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="vw-body">
        <div className="vw-icon">i</div>
        <div>
          <p>正在载入 ＡＥＳＴＨＥＴＩＣＳ…</p>
          <p className="vw-file">C:\DREAMS\{FILE[mode]}</p>
        </div>
      </div>
      <div className="vw-bar">
        <i />
      </div>
      <div className="vw-btns">
        <button onClick={onNext}>换个年代</button>
        <button onClick={onClose}>取消</button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Vaporwave() {
  const fx = useMemo(() => createVaporwaveEffect(), [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<VaporwaveMode>('sunset')
  const [si, setSi] = useState(2)
  const [mobile] = useState(MOBILE)
  // the dialog pops up a moment after the page (and keeps its layout work out of the first frames)
  const [win, setWin] = useState(false)
  const [deco, setDeco] = useState(POSTER)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const osd = useRef<HTMLSpanElement>(null)
  const overlay = useRef<HTMLDivElement>(null)

  const ry = useMotionValue(POSTER ? -0.45 : -0.5)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())
  const busy = useRef(false)

  useEffect(() => setVaporwaveMode(fx, mode), [fx, mode])
  useEffect(() => setVaporwaveGridSpeed(fx, POSTER ? 0 : SPEEDS[si].k), [fx, si])

  // idle: cycle the modes; the dialog comes back after a while
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => vaporwaveModes[(vaporwaveModes.findIndex((x) => x.id === m) + 1) % vaporwaveModes.length].id)
    }, 8000)
    return () => window.clearInterval(id)
  }, [])
  const shown = useRef(false)
  useEffect(() => {
    if (win || POSTER) return
    const id = window.setTimeout(() => {
      shown.current = true
      setWin(true)
    }, shown.current ? 9000 : 1800)
    return () => window.clearTimeout(id)
  }, [win])
  useEffect(() => {
    if (POSTER) return
    const id = window.setTimeout(() => setDeco(true), 700)
    return () => window.clearTimeout(id)
  }, [])

  // VHS counter in the OSD (written directly, no re-render)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now() - 754000
    const tick = () => {
      const s = Math.floor((performance.now() - t0) / 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      if (osd.current) osd.current.textContent = `SP ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  // keep the sun behind the head and the horizon at the plinth (smoothed)
  const lay = useRef({ x: 0.5, h: 0.6, init: false })
  const onHead = (x: number, _y: number, bottom: number) => {
    const L = lay.current
    const hz = THREE.MathUtils.clamp(bottom - (mobile ? 0.1 : 0.15), 0.3, 0.8)
    if (!L.init) {
      L.x = x
      L.h = hz
      L.init = true
    }
    L.x += (x - L.x) * 0.08
    L.h += (hz - L.h) * 0.08
    setVaporwaveLayout(fx as VaporwaveEffect, L.x, L.h, mobile ? 0.2 : 0.27)
  }

  // drag turns the bust (Motion inertia), otherwise it keeps turning slowly
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob, .vw-win')) return
    poke()
    anim.current?.stop()
    busy.current = true
    drag.current = { x: e.clientX, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(ry.get() + (e.clientX - d.x) * 0.0085)
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    anim.current = animate(ry, ry.get(), {
      type: 'inertia',
      velocity: ry.getVelocity(),
      power: 0.4,
      timeConstant: 600,
      onComplete: () => (busy.current = false),
    })
  }

  const label = vaporwaveModes.find((m) => m.id === mode)!.label
  const next = () => {
    poke()
    setMode((m) => vaporwaveModes[(vaporwaveModes.findIndex((x) => x.id === m) + 1) % vaporwaveModes.length].id)
  }

  return (
    <div
      className={`stage vw vw-${mode}${split.open ? ' vw-split' : ''}`}
      style={{ ['--vw-accent' as string]: ACCENT[mode], ['--vw-palm' as string]: PALM[mode], background: BG[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 10], fov: 30, near: 0.5, far: 40 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={vaporwaveMeta.background} preload={preload} />
        <Spin ry={ry} busy={busy} />
        <Bust ry={ry} onHead={onHead} />
      </Canvas>

      {/* set dressing that also belongs in the poster */}
      <div className="vw-deco">
        {deco && (
          <>
            <Palm className="vw-palm l" color="var(--vw-palm)" />
            <Palm className="vw-palm r" color="var(--vw-palm)" flip />
          </>
        )}
        <p className="vw-kata">ヴェイパーウェイヴ</p>
      </div>

      <div className="overlay" ref={overlay}>
        <OriginalSplit split={split} label={label} />
        <p className="vw-float a">ＡＥＳＴＨＥＴＩＣ</p>
        <p className="vw-float b">夢</p>
        <p className="vw-float c">エステティック ・ 1995</p>
        <div className="vw-osd">
          <span>PLAY ▶</span>
          <span ref={osd}>SP 00:12:34</span>
        </div>

        <div className="hero-copy vw-copy">
          <div className="scrim vw-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Vaporwave ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="vw-kmode"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              落日、网格
              <br />
              <span className="vw-grad">与石膏像</span>
            </h1>
            <p className="vw-sub">画面亮度经过粉、紫、青三色渐变重新上色，石膏像有了青色高光和品红暗部；空着的背景换成条纹落日和朝地平线滚去的网格，再盖一层 VHS 跟踪噪声与色偏。</p>
            <div className="vw-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>{win && !mobile && <Win95 key="win" mode={mode} onNext={next} onClose={() => setWin(false)} bounds={overlay} />}</AnimatePresence>

        <div className="dock">
          <Seg
            items={vaporwaveModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg vw-cycle"
            onClick={() => {
              poke()
              setSi((i) => (i + 1) % SPEEDS.length)
            }}
          >
            <span>
              {mobile ? '网格' : '网格速度'} <b>{SPEEDS[si].zh}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="vw-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动石膏像 · 窗口可以拖走</p>
      </div>
    </div>
  )
}

/** the slow idle turn (paused while the visitor drags / the inertia runs) */
function Spin({ ry, busy }: { ry: MotionValue<number>; busy: React.RefObject<boolean> }) {
  useFrame((_, raw) => {
    if (POSTER || busy.current) return
    ry.set(ry.get() + Math.min(raw, 1 / 30) * 0.28)
  })
  return null
}

const css = `
.vw { cursor: grab; touch-action: none; transition: background .8s; overflow: hidden; }
.vw:active { cursor: grabbing; }
.vw canvas { display: block; }
.vw-deco { position: absolute; inset: 0; pointer-events: none; }
.vw-palm { position: absolute; bottom: -4%; height: 64vh; width: auto; opacity: .96; animation: vw-in 1.2s ease-out both; }
@keyframes vw-in { from { opacity: 0; } }
.vw-palm path, .vw-palm circle { transition: fill .8s; }
.vw-palm.l { left: 33vw; height: 30vh; bottom: 4vh; opacity: .9; }
.vw-palm.r { right: -4vw; }
.vw-kata {
  position: absolute; right: clamp(14px, 2.4vw, 34px); top: 50%; transform: translateY(-50%); margin: 0;
  writing-mode: vertical-rl; font: 600 15px/1 var(--sans); letter-spacing: .5em; color: #fff;
  text-shadow: -1.5px 0 rgba(255, 60, 180, .75), 1.5px 0 rgba(60, 230, 255, .75); opacity: .78;
}
.overlay > .vw-float { pointer-events: none; }
.vw-float {
  position: absolute; margin: 0; color: #fff; white-space: nowrap; mix-blend-mode: screen;
  text-shadow: -2px 0 rgba(255, 50, 190, .8), 2px 0 rgba(50, 230, 255, .8), 0 0 18px var(--vw-accent);
  animation: vw-bob 7s ease-in-out infinite;
}
.vw-float.a { right: 8vw; top: 13vh; font: 700 clamp(18px, 2vw, 28px)/1 var(--sans); letter-spacing: .3em; }
.vw-float.b { left: 40vw; top: 24vh; font: 800 clamp(48px, 6vw, 86px)/1 var(--sans); opacity: .5; animation-duration: 9s; animation-delay: -3s; }
.vw-float.c { left: 44vw; top: 12vh; font: 500 12px/1 var(--mono); letter-spacing: .32em; opacity: .7; animation-duration: 11s; animation-delay: -5s; }
@keyframes vw-bob { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -10px, 0); } }
.vw-osd {
  position: absolute; right: clamp(56px, 6vw, 96px); bottom: 86px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  font: 600 15px/1 var(--mono); color: #fff; letter-spacing: .08em; pointer-events: none !important;
  text-shadow: 0 0 6px rgba(255, 255, 255, .6), -1px 0 rgba(255, 60, 180, .8), 1px 0 rgba(60, 230, 255, .8);
}
.vw-osd span:first-child { animation: vw-blink 1.6s steps(1) infinite; }
@keyframes vw-blink { 50% { opacity: 0; } }
.vw-copy { pointer-events: none !important; }
.vw-scrim { --soft-bg: rgba(18, 6, 42, .62); transition: --soft-bg .8s; }
.vw-copy .kicker i { background: var(--vw-accent); box-shadow: 0 0 10px var(--vw-accent); transition: background .6s, box-shadow .6s; }
.vw-kmode { display: inline-block; color: var(--fg); }
.vw-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.vw-grad {
  background: linear-gradient(90deg, #ff6ad5, #c774e8 45%, #8ff2ff); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(-2px 0 rgba(255, 60, 180, .35)) drop-shadow(2px 0 rgba(60, 230, 255, .35));
}
.vw-sub { max-width: 400px; }
.vw-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.vw-spec span { display: inline-flex; align-items: center; gap: 9px; }
.vw-spec i { width: 18px; height: 3px; border-radius: 3px; background: linear-gradient(90deg, #ff6ad5, #8ff2ff); }
.vw-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.vw-cycle b { font-weight: 600; color: var(--fg); }
.vw .hint { transition: opacity .4s; }
.vw-split .hint, .vw-split .vw-float, .vw-split .vw-osd { opacity: 0; transition: opacity .4s; }
.vw-plaster .vw-copy { --fg: #2a1d3c; --fg-2: rgba(42, 29, 60, .74); color: var(--fg); }
.vw-plaster .vw-scrim { --soft-bg: rgba(214, 246, 240, .72); }
.vw-plaster .vw-grad { background: linear-gradient(90deg, #e2508f, #9a5fd0 50%, #2a9b98); -webkit-background-clip: text; background-clip: text; }

/* Windows 95 dialog */
.overlay > .vw-win {
  position: absolute; right: 5vw; top: 25vh; width: 268px; padding: 3px; touch-action: none; cursor: default;
  background: #c3c3c3; color: #000; font: 12px/1.35 Tahoma, 'Segoe UI', sans-serif;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 10px 14px 0 rgba(20, 0, 40, .35);
}
.vw-title {
  display: flex; align-items: center; justify-content: space-between; height: 20px; padding: 0 3px 0 6px; cursor: move;
  background: linear-gradient(90deg, #000080, #1084d0); color: #fff; font-weight: 700; letter-spacing: .02em;
}
.vw-tbtn { display: flex; gap: 2px; }
.vw-tbtn button, .vw-btns button {
  border: 0; background: #c3c3c3; color: #000; font: inherit; cursor: pointer;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
}
.vw-tbtn button { width: 16px; height: 14px; padding: 0; font: 700 11px/12px Tahoma, sans-serif; }
.vw-btns button:active, .vw-tbtn button:active { box-shadow: inset 1px 1px #0a0a0a, inset -1px -1px #ffffff, inset 2px 2px #808080, inset -2px -2px #dfdfdf; }
.vw-body { display: flex; gap: 12px; padding: 14px 12px 8px; }
.vw-body p { margin: 0; }
.vw-file { margin-top: 4px !important; font: 11px/1.3 var(--mono); color: #3a3a3a; }
.vw-icon {
  flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  background: #fff; color: #000080; font: 700 18px/1 Georgia, serif; box-shadow: inset 0 0 0 2px #000080;
}
.vw-bar {
  margin: 4px 12px 10px; height: 18px; padding: 2px;
  box-shadow: inset 1px 1px #808080, inset -1px -1px #ffffff; background: #c3c3c3; overflow: hidden;
}
.vw-bar i {
  display: block; height: 100%;
  background: repeating-linear-gradient(90deg, #000080 0 9px, transparent 9px 11px);
  animation: vw-load 4.2s steps(22) infinite;
}
@keyframes vw-load { from { width: 0%; } 80%, to { width: 100%; } }
.vw-btns { display: flex; justify-content: flex-end; gap: 6px; padding: 0 10px 10px; }
.vw-btns button { min-width: 74px; height: 23px; padding: 0 10px; }

@media (max-width: 760px) {
  .vw-copy { transition: opacity .4s; }
  .vw-split .vw-copy { opacity: 0; }
  .vw-sub { display: none; }
  .vw-copy h1 { font-size: 36px; }
  .vw-spec { margin-top: 12px; font-size: 11px; }
  .vw .dock .seg { padding: 0 9px; }
  .vw .dock .dock-sep { margin: 0 1px; }
  .vw-palm { height: 40vh; bottom: 14vh; opacity: .9; }
  .vw-palm.l { height: 30vh; left: -12vw; bottom: 14vh; }
  .vw-palm.r { right: -14vw; }
  .vw-kata { font-size: 12px; top: 30%; }
  .vw-float.a { right: 6vw; top: 84px; font-size: 14px; }
  .vw-float.b, .vw-float.c, .vw-osd { display: none; }
}
body.poster .vw-kata { opacity: .9; }
`
