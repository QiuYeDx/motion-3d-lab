import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  createGlitchEffect,
  freezeGlitch,
  glitchLevel,
  glitchMeta,
  glitchModes,
  setGlitchAmount,
  setGlitchHold,
  setGlitchMode,
  setGlitchReducedMotion,
  triggerGlitch,
  type GlitchMode,
} from './effects/glitch'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 故障艺术 showcase — a retro CRT on a turntable in a dark room, colour bars on its screen, a magenta neon
 * "ERROR" sign on the wall, two cassettes. Saturated emissive colour (bars, neon) is what makes RGB splits
 * and pixel sorting readable. The signal is calm most of the time; the effect (./effects/glitch.ts) throws
 * its own bursts and the visitor can add one at any screen row (click), sustain it (hold) or rotate (drag).
 * The neon sign and the DOM on-screen display stutter in sync with the effect's level.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CYCLE_EVERY = 11000

const SPEC: Record<GlitchMode, { tool: string; note: string }> = {
  vhs: { tool: '磁带', note: '跟踪噪声 · 色度渗漏 · 磁头切换' },
  digital: { tool: 'H.264', note: '宏块错误 · 数据拖影 · 像素排序' },
  cyber: { tool: '霓虹', note: 'RGB 分离 · 扫描线 · 全息色调' },
}

const AMOUNTS = [
  { zh: '弱', v: 0.5 },
  { zh: '中', v: 1 },
  { zh: '强', v: 1.45 },
]

/* ------------------------------------------------------------------ textures */

function neonTexture(text: string, glow: string, px = 200) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 300
  const x = c.getContext('2d')!
  x.font = `800 ${px}px "Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.lineJoin = 'round'
  x.lineCap = 'round'
  // halo, coloured tube, hot white core
  x.shadowColor = glow
  x.shadowBlur = 46
  x.strokeStyle = glow
  x.lineWidth = 15
  x.strokeText(text, 512, 158)
  x.shadowBlur = 14
  x.strokeText(text, 512, 158)
  x.shadowBlur = 0
  x.strokeStyle = '#ffe6fb'
  x.lineWidth = 5
  x.strokeText(text, 512, 158)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function labelTexture(title: string, side: string, stripes: string[]) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const x = c.getContext('2d')!
  x.fillStyle = '#efe7d4'
  x.fillRect(0, 0, 512, 256)
  stripes.forEach((s, i) => {
    x.fillStyle = s
    x.fillRect(0, 150 + i * 20, 512, 14)
  })
  x.fillStyle = '#1b1b22'
  x.font = 'italic 700 46px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive'
  x.fillText(title, 26, 82)
  x.font = '700 22px "Consolas", monospace'
  x.fillText(side, 26, 128)
  x.textAlign = 'right'
  x.fillText('C-60', 486, 128)
  // reel window cut-out
  x.fillStyle = '#26232b'
  x.beginPath()
  x.roundRect(150, 96, 212, 44, 22)
  x.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ------------------------------------------------------------------ CRT */

// every lit material is MeshStandardMaterial + map, so the room compiles ONE standard program (first-load stall)
const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
WHITE.needsUpdate = true
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ map: WHITE, ...p })

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  // CRT bulge
  p.z += (1.0 - dot(uv - 0.5, uv - 0.5) * 2.2) * 0.07;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`
const SCREEN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uTime;
uniform float uGain;
vec3 bar(float i) {
  if (i < 0.5) return vec3(0.78);
  if (i < 1.5) return vec3(0.78, 0.78, 0.0);
  if (i < 2.5) return vec3(0.0, 0.78, 0.78);
  if (i < 3.5) return vec3(0.0, 0.78, 0.0);
  if (i < 4.5) return vec3(0.78, 0.0, 0.78);
  if (i < 5.5) return vec3(0.78, 0.0, 0.0);
  return vec3(0.0, 0.0, 0.78);
}
void main() {
  vec2 uv = vUv;
  float i = floor(uv.x * 7.0);
  vec3 c;
  if (uv.y > 0.34) c = bar(i);
  else if (uv.y > 0.26) c = mod(i, 2.0) < 0.5 ? bar(6.0 - i) * 0.9 : vec3(0.06);
  else {
    float j = floor(uv.x * 6.0);
    c = j < 1.0 ? vec3(0.0, 0.13, 0.3) : j < 2.0 ? vec3(0.95) : j < 3.0 ? vec3(0.2, 0.0, 0.42) : vec3(0.04 + 0.03 * step(4.5, j));
  }
  // rolling bright band + scan structure
  float r = fract(uv.y * 0.9 - uTime * 0.11);
  c *= 0.82 + 0.4 * smoothstep(0.86, 1.0, r);
  c *= 0.86 + 0.14 * sin(uv.y * 520.0);
  vec2 d = uv - 0.5;
  c *= 1.0 - dot(d, d) * 1.4;
  c = pow(c, vec3(2.2));
  gl_FragColor = vec4(c * uGain, 1.0);
}
`

function Crt({ fx }: { fx: StylizeEffect }) {
  const M = useMemo(() => {
    const body = std({ color: '#c9bea7', roughness: 0.55, metalness: 0.05 })
    const dark = std({ color: '#17161b', roughness: 0.45, metalness: 0.2 })
    const metal = std({ color: '#d9d6d0', roughness: 0.25, metalness: 0.9 })
    const screen = new THREE.ShaderMaterial({
      vertexShader: SCREEN_VERT,
      fragmentShader: SCREEN_FRAG,
      uniforms: { uTime: { value: 0 }, uGain: { value: 1.9 } },
    })
    const G = {
      body: new RoundedBoxGeometry(2.3, 1.78, 1.55, 4, 0.16),
      bezel: new RoundedBoxGeometry(1.72, 1.32, 0.12, 3, 0.1),
      screen: new THREE.PlaneGeometry(1.5, 1.12, 24, 24),
    }
    return { body, dark, metal, screen, G }
  }, [])
  useFrame((_, dt) => {
    M.screen.uniforms.uTime.value += Math.min(dt, 1 / 30)
    // the picture tube dims a touch when the signal breaks
    M.screen.uniforms.uGain.value = 1.9 - Math.min(0.6, glitchLevel(fx) * 0.5)
  })
  return (
    <group>
      <mesh geometry={M.G.body} material={M.body} position={[0, 0.89 + 0.12, 0]} castShadow receiveShadow />
      <mesh geometry={M.G.bezel} material={M.dark} position={[-0.22, 1.02, 0.74]} />
      <mesh geometry={M.G.screen} material={M.screen} position={[-0.22, 1.02, 0.79]} />
      {/* control strip: two knobs, buttons, speaker grille */}
      {[1.42, 1.02].map((y, i) => (
        <mesh key={y} material={M.dark} position={[0.86, y, 0.79]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[i ? 0.085 : 0.11, i ? 0.09 : 0.115, 0.08, 24]} />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} material={M.dark} position={[0.86, 0.55 - k * 0.055, 0.785]}>
          <boxGeometry args={[0.26, 0.018, 0.02]} />
        </mesh>
      ))}
      <mesh material={M.metal} position={[0.86, 1.22, 0.785]}>
        <boxGeometry args={[0.2, 0.03, 0.02]} />
      </mesh>
      {/* feet */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} material={M.dark} position={[x, 0.06, 0.4]}>
          <boxGeometry args={[0.32, 0.12, 0.3]} />
        </mesh>
      ))}
      {/* rabbit ears */}
      <mesh material={M.dark} position={[0.2, 1.9, -0.15]}>
        <sphereGeometry args={[0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {[-0.55, 0.42].map((a, i) => (
        <group key={i} position={[0.2, 2.02, -0.15]} rotation={[-0.15, i ? 0.4 : -0.3, a]}>
          <mesh material={M.metal} position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.012, 0.018, 1.24, 8]} />
          </mesh>
          <mesh material={M.metal} position={[0, 1.25, 0]}>
            <sphereGeometry args={[0.03, 12, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Cassette({ title, side, stripes, shell }: { title: string; side: string; stripes: string[]; shell: string }) {
  const M = useMemo(() => {
    return {
      shell: std({ color: shell, roughness: 0.32, metalness: 0.1 }),
      label: std({ map: labelTexture(title, side, stripes), roughness: 0.75 }),
      reel: std({ color: '#f2efe8', roughness: 0.4 }),
      tape: std({ color: '#3a2418', roughness: 0.6 }),
      geo: new RoundedBoxGeometry(1.0, 0.64, 0.11, 3, 0.03),
    }
  }, [title, side, stripes, shell])
  return (
    <group>
      <mesh geometry={M.geo} material={M.shell} castShadow receiveShadow />
      <mesh material={M.label} position={[0, 0.06, 0.056]}>
        <planeGeometry args={[0.86, 0.43]} />
      </mesh>
      {[-0.205, 0.205].map((x, i) => (
        <group key={x} position={[x, 0.025, 0.058]}>
          <mesh material={M.tape} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[i ? 0.07 : 0.1, i ? 0.07 : 0.1, 0.004, 28]} />
          </mesh>
          <mesh material={M.reel} position={[0, 0, 0.003]}>
            <torusGeometry args={[0.04, 0.012, 8, 20]} />
          </mesh>
        </group>
      ))}
      {/* trapezoid bottom guide */}
      <mesh material={M.shell} position={[0, -0.25, 0.06]}>
        <boxGeometry args={[0.56, 0.1, 0.02]} />
      </mesh>
    </group>
  )
}

function NeonSign({ fx, t }: { fx: StylizeEffect; t: React.RefObject<number> }) {
  const M = useMemo(() => {
    const tex = neonTexture('ERROR', '#ff2bd6')
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    const sub = neonTexture('NO SIGNAL', '#2ee6ff', 130)
    const mat2 = new THREE.MeshBasicMaterial({ map: sub, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    return { mat, mat2 }
  }, [])
  const light = useRef<THREE.PointLight>(null)
  const sub = useRef<THREE.Mesh>(null)
  const size = useThree((s) => s.size)
  useFrame(() => {
    // phones: the second sign tucks in above the screen instead of hanging off the left edge
    if (sub.current) {
      if (size.width < 760) sub.current.position.set(-0.95, 0.72, 0.01)
      else sub.current.position.set(-2.15, -1.0, 0.01)
      sub.current.scale.setScalar(size.width < 760 ? 0.62 : 1)
    }
    const L = glitchLevel(fx)
    // neon tubes buzz: a slow breath, and drop-outs when the signal breaks
    const k = t.current ?? 0
    let on = 0.92 + 0.08 * Math.sin(k * 2.1) * Math.sin(k * 5.3)
    if (L > 0.3 && Math.random() < L * 0.35) on *= 0.25
    M.mat.color.setScalar(2.4 * on)
    M.mat2.color.setScalar(1.7 * (L > 0.5 && Math.random() < 0.3 ? 0.3 : 1))
    if (light.current) light.current.intensity = 26 * on
  })
  return (
    <group position={[0, 3.55, -1.55]}>
      <mesh material={M.mat}>
        <planeGeometry args={[3.6, 1.05]} />
      </mesh>
      <mesh ref={sub} material={M.mat2} position={[-2.15, -1.0, 0.01]} rotation={[0, 0, 0.06]}>
        <planeGeometry args={[2.0, 0.59]} />
      </mesh>
      <pointLight ref={light} position={[0, -0.1, 0.6]} color="#ff2bd6" intensity={26} distance={12} decay={1.6} />
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

function Room({ fx, ry, rx }: { fx: StylizeEffect; ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 3.2 : 0)

  useFrame((_, raw) => {
    if (!POSTER) t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(1.1, vh / 5.6, vw / 7.4) : mobile ? Math.min(0.66, vw / 5.6) : Math.min(1.12, vh / 5.5, vw / 9.6)
    const x = POSTER ? 0.45 * k : mobile ? 0 : vw * 0.2
    const y = POSTER ? -1.95 : mobile ? -0.5 : -2.0
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(x, y, 0)
      rig.current.rotation.x = rx.get()
    }
    if (turn.current) turn.current.rotation.y = (POSTER ? -0.32 : Math.sin(t.current * 0.23) * 0.42 - 0.12) + ry.get()
  })

  const stripesA = useMemo(() => ['#ff5a36', '#ffb000', '#2ec4b6'], [])
  const stripesB = useMemo(() => ['#ff2bd6', '#7b5cff', '#2ee6ff'], [])

  return (
    <>
      <hemisphereLight args={['#5a4f8c', '#0a0a10', 0.35]} />
      <directionalLight position={[3, 6, 6]} intensity={0.55} color="#c9d2ff" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <group ref={rig}>
        {/* wall + floor */}
        <mesh position={[0, 3, -1.75]} receiveShadow>
          <planeGeometry args={[30, 10]} />
          <meshStandardMaterial map={WHITE} color="#1a1420" roughness={0.92} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 3]} receiveShadow>
          <planeGeometry args={[30, 12]} />
          <meshStandardMaterial map={WHITE} color="#121018" roughness={0.38} metalness={0.25} />
        </mesh>
        <NeonSign fx={fx} t={t} />
        <pointLight position={[3.4, 1.6, 1.6]} color="#2ee6ff" intensity={18} distance={10} decay={1.6} />
        <pointLight position={[-3.2, 0.8, 2.2]} color="#7b5cff" intensity={10} distance={9} decay={1.6} />
        <group ref={turn}>
          <Crt fx={fx} />
          <group position={[-1.75, 0.37, 0.15]} rotation={[0, 0.38, -0.12]}>
            <Cassette title="Night Drive" side="SIDE A" stripes={stripesB} shell="#22202a" />
          </group>
          <group position={[-0.55, 1.97, 0.3]} rotation={[-Math.PI / 2, 0, 0.28]}>
            <Cassette title="Mixtape '89" side="SIDE B" stripes={stripesA} shell="#d8d2c8" />
          </group>
        </group>

      </group>
    </>
  )
}

/* ------------------------------------------------------------------ on-screen display */

function pad(n: number, w = 2) {
  return String(Math.floor(n)).padStart(w, '0')
}

function Osd({ fx, mode, osd }: { fx: StylizeEffect; mode: GlitchMode; osd: React.RefObject<HTMLDivElement | null> }) {
  const t = useRef(POSTER ? 754 : 0)
  const drops = useRef(0)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 20)
    t.current += dt
    const el = osd.current
    if (!el) return
    const L = glitchLevel(fx)
    if (L > 0.35 && Math.random() < L * 0.25) drops.current++
    const j = REDUCED ? 0 : L > 0.25 ? (Math.random() - 0.5) * 14 * L : 0
    el.style.transform = `translate3d(${j.toFixed(1)}px,0,0)`
    el.style.opacity = !REDUCED && L > 0.6 && Math.random() < 0.18 ? '0.25' : '1'
    const s = t.current
    for (const n of el.querySelectorAll<HTMLElement>('[data-k]')) {
      const k = n.dataset.k
      if (k === 'tc') n.textContent = `${pad(s / 3600, 1)}:${pad((s / 60) % 60)}:${pad(s % 60)}`
      else if (k === 'clock') n.textContent = `PM 11:${pad(58 + Math.floor(s / 60))}`
      else if (k === 'drop') n.textContent = String(drops.current).padStart(4, '0')
      else if (k === 'rate') n.textContent = (8.4 - L * 6.1 + Math.sin(s * 3) * 0.2).toFixed(1)
      else if (k === 'sync') n.textContent = `${Math.round(99 - L * 58)}%`
    }
  })
  void mode
  return null
}

/* ------------------------------------------------------------------ page */

export default function Glitch() {
  const [mode, setMode] = useState<GlitchMode>(POSTER ? 'cyber' : 'vhs')
  const [amountI, setAmountI] = useState(1)
  const fx = useMemo(() => {
    const f = createGlitchEffect({ mode: POSTER ? 'cyber' : 'vhs' })
    if (POSTER) freezeGlitch(f, 0.3, 377)
    if (REDUCED) setGlitchReducedMotion(f, true)
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const osd = useRef<HTMLDivElement>(null)

  useEffect(() => setGlitchMode(fx, mode), [fx, mode])
  useEffect(() => setGlitchAmount(fx, AMOUNTS[amountI].v), [fx, amountI])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => glitchModes[(glitchModes.findIndex((o) => o.id === m) + 1) % glitchModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  /* press = burst at that row, hold = sustain, drag = rotate */
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const press = useRef<{ x: number; y: number; id: number; t: number; drag: boolean; lx: number; ly: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const rowOf = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return THREE.MathUtils.clamp((e.clientY - r.top) / r.height, 0, 1)
  }
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), drag: false, lx: e.clientX, ly: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setGlitchHold(fx, 0.9, rowOf(e))
  }
  const onMove = (e: React.PointerEvent) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    if (!p.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 9) {
      p.drag = true
      setGlitchHold(fx, 0)
    }
    if (p.drag) {
      ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - p.lx) * 0.006, -1.1, 1.1))
      rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - p.ly) * 0.0015, -0.05, 0.12))
    } else setGlitchHold(fx, 0.9, rowOf(e))
    p.lx = e.clientX
    p.ly = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    const p = press.current
    if (!p || p.id !== e.pointerId) return
    press.current = null
    touch()
    setGlitchHold(fx, 0)
    if (!p.drag) {
      if (performance.now() - p.t < 260) triggerGlitch(fx, 0.95, rowOf(e))
      return
    }
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 520, min: -1.1, max: 1.1, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.05, max: 0.12, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const S = SPEC[mode]
  const label = glitchModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage gl${split.open ? ' gl-split' : ''}`}
      style={{ background: glitchMeta.background }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 1.4, 10], fov: 34 }} onCreated={({ camera }) => camera.lookAt(0, 0.35, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={glitchMeta.background} />
        <Room fx={fx} ry={ry} rx={rx} />
        <Osd fx={fx} mode={mode} osd={osd} />
      </Canvas>

      <div className="overlay">
        <div ref={osd} className={`gl-osd gl-osd-${mode}`} aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={mode} className="gl-osd-in" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              {mode === 'vhs' && (
                <>
                  <div className="gl-tl">
                    PLAY <b>▶</b>
                  </div>
                  <div className="gl-tr">
                    SP <span data-k="tc">0:00:00</span>
                  </div>
                  <div className="gl-br">
                    <span data-k="clock">PM 11:58</span>
                    <br />
                    OCT.14 1994
                  </div>
                </>
              )}
              {mode === 'digital' && (
                <>
                  <div className="gl-tl">
                    <i className="gl-rec" />
                    DECODE ERR 0x00C3
                  </div>
                  <div className="gl-tr">
                    丢帧 <span data-k="drop">0000</span> · <span data-k="rate">8.4</span> Mbps
                  </div>
                </>
              )}
              {mode === 'cyber' && (
                <>
                  <div className="gl-tl">// SIGNAL_LOST</div>
                  <div className="gl-tr">
                    NODE_07 · 同步 <span data-k="sync">99%</span>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="hero-copy gl-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Glitch · Signal Corruption
            </p>
            <h1 className="gl-h1" data-text="信号间歇性抽风">
              信号
              <br />
              间歇性抽风
            </h1>
            <p className="gl-sub">大部分时间画面是好的，然后突然坏掉：RGB 通道错位、整条扫描线滑开、压缩坏块从一个点一路蔓延到行尾、亮部被“像素排序”成一道道竖条。点一下，故障就发生在那一行。</p>
            <div className="gl-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: 8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.tool}</b>
                  {S.note}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={glitchModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg gl-cycle" onClick={() => setAmountI((d) => (d + 1) % AMOUNTS.length)}>
              <span>
                强度 <b>{AMOUNTS[amountI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="gl-lab">强度</span>
              <Seg items={AMOUNTS.map((d, i) => ({ value: i, label: d.zh }))} value={amountI} onChange={setAmountI} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg gl-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="gl-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">点击任意处制造故障 · 按住持续 · 拖动转动</p>
      </div>
    </div>
  )
}

const css = `
.gl { cursor: crosshair; touch-action: none; }
.gl canvas { display: block; }
.gl-copy { pointer-events: none !important; }
.gl-copy .scrim { --soft-bg: rgba(8, 8, 12, .78); opacity: .85; }
.gl-copy .kicker { color: #b9b4c8; }
.gl-copy .kicker i { background: #ff2bd6; box-shadow: 0 0 10px #ff2bd6; }
.gl-h1 { font-size: clamp(38px, 4.4vw, 60px) !important; color: #f4f1f8; text-shadow: -1.5px 0 rgba(255, 43, 214, .55), 1.5px 0 rgba(46, 230, 255, .5); }
.gl-sub { max-width: 410px; color: #bdb8cb !important; }
.gl-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #bdb8cb; }
.gl-spec span { display: inline-flex; align-items: center; gap: 10px; }
.gl-spec b { font-weight: 600; color: #fff; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255, 43, 214, .6); }
.gl-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.gl-cycle span, .gl-btn span { display: inline-flex; align-items: center; gap: 6px; }
.gl-cycle b { font-weight: 600; color: var(--fg); }
.gl .hint { color: #a8a3b8; transition: opacity .4s; }
.gl-split .hint { opacity: 0; }

.overlay > .gl-osd { position: absolute; inset: 0; pointer-events: none; will-change: transform; }
.gl-osd-in { position: absolute; inset: 0; }
.gl-osd { font: 700 19px/1.25 "Consolas", "Lucida Console", var(--mono); color: #f5f5f0; letter-spacing: .06em;
  text-shadow: -2px 0 rgba(255, 40, 120, .55), 2px 0 rgba(40, 220, 255, .5), 0 0 6px rgba(0, 0, 0, .8); }
.gl-tl, .gl-tr, .gl-br { position: absolute; }
.gl-tl { right: 40px; top: 88px; text-align: right; }
.gl-tr { right: 40px; top: 116px; text-align: right; font-size: 16px; opacity: .92; }
.gl-br { right: 40px; bottom: 74px; text-align: right; }
.gl-tl b { font-size: .9em; }
.gl-osd-digital, .gl-osd-cyber { font-size: 14px; font-weight: 600; letter-spacing: .08em; }
.gl-osd-digital .gl-tr, .gl-osd-cyber .gl-tr { top: 112px; font-size: 13px; }
.gl-osd-digital { color: #b8ffcf; }
.gl-osd-cyber { color: #9ff6ff; }
.gl-rec { display: inline-block; width: 8px; height: 8px; margin-right: 8px; background: #ff3b5c; vertical-align: 1px; animation: gl-blink 1s steps(2) infinite; }
@keyframes gl-blink { 50% { opacity: 0; } }
.gl-split .gl-osd { opacity: 0 !important; }
@media (prefers-reduced-motion: reduce) { .gl-rec { animation: none; } }
@media (max-width: 760px) {
  .gl-copy { transition: opacity .4s; }
  .gl-split .gl-copy { opacity: 0; }
  .gl-sub { display: none; }
  .gl-h1 { font-size: 34px !important; }
  .gl-spec { margin-top: 12px; }
  .gl-osd { font-size: 15px; }
  .gl-osd-digital, .gl-osd-cyber { font-size: 12px; }
  .gl-tl { right: 18px; top: 80px; }
  .gl-tr { right: 18px; top: 102px !important; font-size: 12px !important; }
  .gl-br { display: none; }
  .gl .dock .seg { padding: 0 9px; }
  .gl .dock .dock-sep { margin: 0 1px; }
}
`
