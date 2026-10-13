import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'
import { POSTER } from '../../lib/iso'
import { useShaderMaterial } from '../shader/glsl'
import { AudioEngine, BINS, HIST, Spectrum, type Source } from './audioEngine'

/* ------------------------------------------------------------------ config */

const PHONE = typeof window !== 'undefined' && window.innerWidth < 760
const COLS = PHONE ? 560 : 896
const ROWS = PHONE ? 36 : 48
const COUNT = COLS * ROWS
const RINGS = PHONE ? 84 : 120
const LAT = PHONE ? 64 : 96

const MODES = [
  { key: 'sphere', zh: '球体', short: '球体', en: 'Spectral Sphere', aside: `${LAT} latitude rings · log bands` },
  { key: 'rings', zh: '圆环', short: '圆环', en: 'Ring of Rings', aside: `${RINGS} rings · mirrored spectrum` },
  { key: 'terrain', zh: '频谱地形', short: '地形', en: 'Spectrogram Terrain', aside: `${ROWS} ridgelines · 3.2 s history` },
]

/** ring (shock wave) placement per mode — mirrors the transforms done in the vertex shader */
const TILT_T = -0.95
const TILT_G = 0.5
const GROUND = -1.05
const RING_POSE = [
  { rx: 0, y: 0, z: 0, r0: 1.55, grow: 0.9 },
  { rx: TILT_T, y: 0, z: 0, r0: 2.1, grow: 0.5 },
  { rx: -Math.PI / 2 + TILT_G, y: GROUND * Math.cos(TILT_G) + 1.4 * Math.sin(TILT_G), z: GROUND * Math.sin(TILT_G) - 1.4 * Math.cos(TILT_G), r0: 0.8, grow: 1.5 },
]

/* ------------------------------------------------------------------ GLSL */

const VERT = /* glsl */ `
uniform sampler2D uSpec;
uniform float uTime, uKick, uBass, uHigh, uScroll, uPR, uSize, uProg, uSpin, uSway, uAlpha;
uniform vec3 uFromW, uToW;
attribute vec2 aTorus;
attribute vec2 aGrid;
attribute vec3 aU;
attribute float aRnd;
varying vec3 vCol;
varying float vA;

float specAt(float u, float age) {
  float v = (clamp(age, 0.0, ${HIST - 1}.0) + 0.5) / ${HIST}.0;
  return texture2D(uSpec, vec2((u * ${BINS - 1}.0 + 0.5) / ${BINS}.0, v)).r;
}
vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
float hash(float n) { return fract(sin(n) * 43758.5453); }

vec3 pal(float u) {
  // sRGB stops: hot pink (bass) → violet → blue → cyan (highs)
  vec3 c0 = vec3(1.0, 0.31, 0.85);
  vec3 c1 = vec3(0.64, 0.34, 1.0);
  vec3 c2 = vec3(0.30, 0.50, 1.0);
  vec3 c3 = vec3(0.30, 0.95, 1.0);
  float t = clamp(u, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(c0, c1, t) : t < 2.0 ? mix(c1, c2, t - 1.0) : mix(c2, c3, t - 2.0);
}

void main() {
  // 30% of the sphere / ring particles are "echoes" that replay the last ~0.5 s → soft motion trails
  float echo = step(0.7, aRnd);
  float eAge = echo * (aRnd - 0.7) / 0.3;
  float age = eAge * 20.0;
  float jit = (fract(aRnd * 37.0) - 0.5);

  // 1 · sphere — stacked latitude rings (|y|, equal-area) → band; each ring is pushed out by its level
  float mS = specAt(aU.x, age);
  vec3 d = position;
  float wob = 0.03 * sin(d.x * 5.0 + uTime * 0.9) * sin(d.z * 4.0 - uTime * 0.7 + d.y * 3.0);
  vec3 dS = rotX(rotY(d, uSpin), 0.22);
  vec3 pS = dS * (1.4 + wob + jit * 0.025 + mS * 0.95);

  // 2 · ring of rings — angle around the big ring (mirrored, bass at the front) → band; each small ring swells
  float mT = specAt(aU.y, age);
  float phi = aTorus.x;
  float th = aTorus.y + uTime * 0.35;
  float rt = 0.06 + mT * 0.8 + jit * 0.02;
  vec3 nT = vec3(cos(th) * cos(phi), cos(th) * sin(phi), sin(th));
  vec3 pT = rotY(rotX(vec3(cos(phi), sin(phi), 0.0) * (2.05 + mT * 0.18) + nT * rt, ${TILT_T.toFixed(3)}), uSway);

  // 3 · spectrogram terrain — columns = bands (mirrored, bass in the middle), rows = history
  float mG = specAt(aU.z, aGrid.y * ${HIST - 2}.0 + 1.0 - uScroll);
  vec3 pG = rotX(vec3((aGrid.x - 0.5) * ${PHONE ? '4.6' : '6.2'}, ${GROUND.toFixed(3)} + mG * 1.7, 1.4 - aGrid.y * 6.4), ${TILT_G.toFixed(3)});

  // staggered morph with a little mid-flight swirl
  float pr = clamp((uProg - aRnd * 0.35) / 0.65, 0.0, 1.0);
  pr = pr * pr * (3.0 - 2.0 * pr);
  vec3 a = pS * uFromW.x + pT * uFromW.y + pG * uFromW.z;
  vec3 b = pS * uToW.x + pT * uToW.y + pG * uToW.z;
  vec3 W = mix(uFromW, uToW, pr);
  vec3 p = mix(a, b, pr);
  float arc = sin(pr * 3.14159);
  p += vec3(sin(aRnd * 40.0 + uTime), cos(aRnd * 31.0 - uTime * 0.7), sin(aRnd * 17.0 + 1.0)) * arc * 0.6;

  float m = dot(W, vec3(mS, mT, mG));
  float u = dot(W, aU);

  // bass: global pulse
  p *= 1.0 + uKick * 0.075 + uBass * 0.05;

  // highs: sparkle on the rim (sphere silhouette, high bands everywhere)
  vec3 nV = normalize(normalMatrix * dS);
  float rim = max(W.x * pow(1.0 - abs(nV.z), 2.0), smoothstep(0.5, 1.0, u));
  float tw = step(0.84 - uHigh * 0.5, hash(aRnd * 913.0 + floor(uTime * 16.0 + aRnd * 7.0)));
  float spark = rim * tw * smoothstep(0.04, 0.45, uHigh);

  vec3 col = pal(u);
  col = mix(col, vec3(1.0, 0.93, 0.98), smoothstep(0.55, 1.0, m) * 0.4 + spark * 0.55);
  col += vec3(1.0, 0.35, 0.8) * max(uKick, 0.0) * (1.0 - u) * 0.45;
  float bright = 0.16 + m * 1.2 + spark * 1.4;
  float fade = mix(1.0 - eAge * 0.75, 1.0 - aGrid.y * 0.82, W.z);
  vCol = pow(col, vec3(2.2)) * bright;
  vA = uAlpha * fade;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.75 + m * 0.9 + spark * 1.8) * (9.0 / -mv.z);
}
`

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float f = 1.0 - d * 4.0;
  gl_FragColor = vec4(vCol, vA * f * f);
  #include <colorspace_fragment>
}
`

const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const RING_FRAG = /* glsl */ `
uniform float uA, uThick;
varying vec2 vUv;
void main() {
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float d = (r - 0.9) / uThick;
  float a = exp(-d * d * 2.0);
  float ang = atan(c.y, c.x) / 6.2831853;
  float dots = 0.2 + 0.8 * step(0.5, fract(ang * 220.0));
  vec3 col = mix(vec3(1.0, 0.31, 0.85), vec3(1.0, 0.85, 0.97), a * 0.5);
  gl_FragColor = vec4(pow(col, vec3(2.2)) * a * dots * 1.3, uA);
  #include <colorspace_fragment>
}
`

const HALO_FRAG = /* glsl */ `
uniform float uBass, uKick;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  vec3 pink = pow(vec3(1.0, 0.31, 0.85), vec3(2.2));
  vec3 vio = pow(vec3(0.42, 0.3, 1.0), vec3(2.2));
  vec3 c = pink * exp(-d * d * 9.0) * (0.012 + uBass * 0.03 + max(uKick, 0.0) * 0.045) + vio * exp(-d * d * 3.0) * 0.014;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`

/* ------------------------------------------------------------------ geometry */

function buildGeometry() {
  const n = COUNT
  const pos = new Float32Array(n * 3)
  const tor = new Float32Array(n * 2)
  const grid = new Float32Array(n * 2)
  const u = new Float32Array(n * 3)
  const rnd = new Float32Array(n)
  const ga = Math.PI * (3 - Math.sqrt(5))
  const perRing = Math.floor(n / RINGS)
  for (let i = 0; i < n; i++) {
    const r0 = Math.random()
    rnd[i] = r0
    // Fibonacci sphere
    const yf = 1 - ((i + 0.5) / n) * 2
    // snap to latitude rings so every band reads as one clean contour
    const y = ((Math.min(LAT - 1, Math.floor(((yf + 1) / 2) * LAT)) + 0.5) / LAT) * 2 - 1
    const rr = Math.sqrt(1 - y * y)
    const th = i * ga
    pos[i * 3] = Math.cos(th) * rr
    pos[i * 3 + 1] = y
    pos[i * 3 + 2] = Math.sin(th) * rr
    u[i * 3] = Math.min(1, Math.abs(y) + (r0 - 0.5) * 0.006)
    // ring of rings: ring index around the big circle, starting at the bottom
    const ring = i % RINGS
    const k = Math.floor(i / RINGS)
    const along = ((ring + 0.5) / RINGS) * Math.PI * 2
    tor[i * 2] = along - Math.PI / 2
    tor[i * 2 + 1] = (k / perRing) * Math.PI * 2 + ring * 0.37
    u[i * 3 + 1] = (along > Math.PI ? Math.PI * 2 - along : along) / Math.PI
    // terrain grid
    const col = i % COLS
    const row = Math.floor(i / COLS)
    grid[i * 2] = col / (COLS - 1)
    grid[i * 2 + 1] = row / (ROWS - 1)
    u[i * 3 + 2] = Math.abs((col / (COLS - 1)) * 2 - 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aTorus', new THREE.BufferAttribute(tor, 2))
  g.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2))
  g.setAttribute('aU', new THREE.BufferAttribute(u, 3))
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1))
  return g
}

const ONEHOT = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
const ease = (x: number) => x * x * (3 - 2 * x)

/* ------------------------------------------------------------------ scene */

type MeterRefs = { bars: (HTMLElement | null)[]; dot: HTMLElement | null }

function Visual({
  spec,
  engine,
  live,
  kick,
  prog,
  morph,
  meter,
}: {
  spec: Spectrum
  engine: React.RefObject<AudioEngine | null>
  live: MotionValue<number>
  kick: MotionValue<number>
  prog: MotionValue<number>
  morph: React.RefObject<{ from: number; to: number }>
  meter: React.RefObject<MeterRefs>
}) {
  const scale = usePortraitScale(1.08)
  const dpr = useThree((s) => s.viewport.dpr)
  const geo = useMemo(buildGeometry, [])
  useEffect(() => () => geo.dispose(), [geo])

  const uniforms = useMemo(
    () => ({
      uSpec: { value: spec.texture },
      uTime: { value: 0 },
      uKick: { value: 0 },
      uBass: { value: 0 },
      uHigh: { value: 0 },
      uScroll: { value: 0 },
      uPR: { value: 1 },
      uSize: { value: PHONE ? 2.0 : 2.1 },
      uProg: { value: 1 },
      uSpin: { value: 0 },
      uSway: { value: 0 },
      uAlpha: { value: PHONE ? 0.4 : 0.62 },
      uFromW: { value: new THREE.Vector3(1, 0, 0) },
      uToW: { value: new THREE.Vector3(1, 0, 0) },
    }),
    [spec],
  )
  const mat = useShaderMaterial(() => ({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  const haloU = useMemo(() => ({ uBass: { value: 0 }, uKick: { value: 0 } }), [])
  const haloMat = useShaderMaterial(() => ({
    vertexShader: PLANE_VERT,
    fragmentShader: HALO_FRAG,
    uniforms: haloU,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))

  // shock-ring pool
  const ringMats = useMemo(
    () =>
      [0, 1, 2, 3].map(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: PLANE_VERT,
            fragmentShader: RING_FRAG,
            uniforms: { uA: { value: 0 }, uThick: { value: 0.05 } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          }),
      ),
    [],
  )
  useEffect(() => () => ringMats.forEach((m) => m.dispose()), [ringMats])
  const ringMeshes = useRef<(THREE.Mesh | null)[]>([])
  const ringState = useMemo(() => ringMats.map(() => ({ born: -9, str: 0 })), [ringMats])
  const ringGroup = useRef<THREE.Group>(null)
  const outer = useRef<THREE.Group>(null)
  const st = useMemo(() => ({ t: 0, spin: 0, nextRing: 0 }), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    st.t += dt
    const t = st.t
    const e = engine.current
    const lv = live.get()
    const beat = spec.update(dt, e && lv > 0.001 ? e.analyser : null, lv)
    if (beat > 0) {
      animate(kick, 0, { type: 'spring', velocity: 9 + beat * 14, stiffness: 320, damping: 15 })
      const r = ringState[st.nextRing]
      r.born = t
      r.str = 0.45 + beat * 0.55
      st.nextRing = (st.nextRing + 1) % ringState.length
    }

    const k = kick.get()
    const u = uniforms
    st.spin += dt * (0.12 + spec.mid * 0.25)
    u.uTime.value = t
    u.uKick.value = k
    u.uBass.value = spec.bass
    u.uHigh.value = Math.min(1, spec.highN * 0.9)
    u.uScroll.value = spec.scroll
    u.uPR.value = dpr
    u.uSpin.value = st.spin
    u.uSway.value = Math.sin(t * 0.21) * 0.32
    const pg = prog.get()
    u.uProg.value = pg
    const m = morph.current
    u.uFromW.value.copy(ONEHOT[m.from])
    u.uToW.value.copy(ONEHOT[m.to])
    haloU.uBass.value = spec.bass
    haloU.uKick.value = k

    // pointer parallax
    const g = outer.current
    if (g) {
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, state.pointer.y * -0.14, 2.5, dt)
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, state.pointer.x * 0.2, 2.5, dt)
    }

    // shock rings follow the dominant layout
    const w = ease(Math.min(1, Math.max(0, (pg - 0.15) / 0.7)))
    const A = RING_POSE[m.from]
    const B = RING_POSE[m.to]
    const rg = ringGroup.current
    if (rg) {
      rg.rotation.x = A.rx + (B.rx - A.rx) * w
      rg.rotation.y = (m.to === 1 ? w : m.from === 1 ? 1 - w : 0) * u.uSway.value
      rg.position.set(0, A.y + (B.y - A.y) * w, A.z + (B.z - A.z) * w)
    }
    const r0 = A.r0 + (B.r0 - A.r0) * w
    const grow = A.grow + (B.grow - A.grow) * w
    for (let i = 0; i < ringState.length; i++) {
      const mesh = ringMeshes.current[i]
      if (!mesh) continue
      const age = t - ringState[i].born
      const life = 1.25
      if (age > life) {
        mesh.visible = false
        continue
      }
      const q = age / life
      const rad = r0 * (1 + (1 - Math.pow(1 - q, 3)) * grow)
      const s = rad / 0.45
      mesh.visible = true
      mesh.scale.setScalar(s)
      const mu = ringMats[i].uniforms
      mu.uA.value = ringState[i].str * Math.pow(1 - q, 2) * 0.6
      mu.uThick.value = (0.022 + q * 0.03) / (s / 2)
    }

    // live band meter (DOM, no React renders)
    const mr = meter.current
    if (mr) {
      const vals = [spec.sub, spec.bass, spec.mid, spec.highN * 0.85]
      for (let i = 0; i < 4; i++) {
        const el = mr.bars[i]
        if (el) el.style.transform = `scaleY(${Math.max(0.06, Math.min(1, vals[i])).toFixed(3)})`
      }
      if (mr.dot) mr.dot.style.opacity = String(0.22 + Math.min(1, Math.max(0, k) * 1.4) * 0.78)
    }
  })

  return (
    <group position={[0, PHONE ? 0.95 * scale + 0.35 : 0.1, 0]} scale={scale}>
      <mesh position={[0, 0, -3]} material={haloMat} renderOrder={-1}>
        <planeGeometry args={[16, 16]} />
      </mesh>
      <group ref={outer}>
        <points geometry={geo} material={mat} frustumCulled={false} />
        <group ref={ringGroup} rotation-order="YXZ">
          {ringMats.map((rm, i) => (
            <mesh key={i} material={rm} visible={false} ref={(el) => void (ringMeshes.current[i] = el)}>
              <planeGeometry args={[1, 1]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ icons */

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor" />
  </svg>
)
const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
    <rect x="3" y="2" width="2.8" height="10" rx="1" fill="currentColor" />
    <rect x="8.2" y="2" width="2.8" height="10" rx="1" fill="currentColor" />
  </svg>
)
const IconSound = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 6v4h2.6L8.5 13V3L5.1 6H2.5Z" fill="currentColor" stroke="none" />
    {off ? <path d="m11 6 3.5 4M14.5 6 11 10" /> : <path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M12.8 3.8a6 6 0 0 1 0 8.4" />}
  </svg>
)
const IconMic = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="5.5" y="1.8" width="5" height="8.2" rx="2.5" fill="currentColor" stroke="none" />
    <path d="M3.3 7.6a4.7 4.7 0 0 0 9.4 0M8 12.4v2" />
  </svg>
)

/* ------------------------------------------------------------------ page */

export default function AudioReactive() {
  const [mode, setMode] = useState(0)
  const [auto, setAuto] = useState(true)
  const [source, setSource] = useState<Source>('demo')
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(48000)
  const [toast, setToast] = useState<{ id: number; text: string; warn?: boolean } | null>(null)

  const engine = useRef<AudioEngine | null>(null)
  const spec = useMemo(() => new Spectrum(), [])
  const kick = useMotionValue(0)
  const live = useMotionValue(0)
  const prog = useMotionValue(1)
  const morph = useRef({ from: 0, to: 0 })
  const meter = useRef<MeterRefs>({ bars: [], dot: null })
  const toastTimer = useRef(0)

  useEffect(
    () => () => {
      engine.current?.dispose()
      engine.current = null
      clearTimeout(toastTimer.current)
    },
    [],
  )
  useEffect(() => () => spec.texture.dispose(), [spec])

  // mode morph (Motion owns the timeline; the shader reads prog)
  useEffect(() => {
    const m = morph.current
    if (m.to === mode) return
    if (prog.get() >= 0.5) m.from = m.to
    m.to = mode
    prog.set(0)
    const c = animate(prog, 1, { duration: 1.9, ease: [0.65, 0, 0.35, 1] })
    return () => c.stop()
  }, [mode, prog])

  useEffect(() => {
    if (!auto || POSTER) return
    const id = setInterval(() => setMode((v) => (v + 1) % MODES.length), 11000)
    return () => clearInterval(id)
  }, [auto])

  const showToast = useCallback((text: string, warn = false) => {
    clearTimeout(toastTimer.current)
    setToast({ id: performance.now(), text, warn })
    toastTimer.current = window.setTimeout(() => setToast(null), 3400)
  }, [])

  /** must run synchronously inside the click handler (autoplay policy) */
  const ensure = () => {
    if (!engine.current) {
      engine.current = new AudioEngine()
      engine.current.setMuted(muted)
      setRate(engine.current.ctx.sampleRate)
    }
    void engine.current.ctx.resume()
    return engine.current
  }
  const goLive = () => {
    setStarted(true)
    setPlaying(true)
    animate(live, 1, { duration: 0.9, ease: 'easeOut' })
  }
  const playDemo = () => {
    ensure().useDemo()
    setSource('demo')
    goLive()
  }
  const pickMic = async () => {
    const e = ensure()
    setSource('mic')
    setStarted(true)
    showToast('正在请求麦克风权限…')
    const ok = await e.useMic()
    if (engine.current !== e) return
    if (ok) {
      showToast('麦克风已接入：说话、拍手或外放一首歌')
      goLive()
    } else {
      showToast('没有拿到麦克风权限，已切回示例音乐', true)
      playDemo()
    }
  }
  const pickSource = (s: Source) => {
    if (s === source && playing) return
    if (s === 'mic') void pickMic()
    else playDemo()
  }
  const togglePlay = () => {
    const e = engine.current
    if (!e || !started) return playDemo()
    if (playing) {
      void e.ctx.suspend()
      setPlaying(false)
      animate(live, 0, { duration: 0.7, ease: 'easeInOut' })
    } else {
      void e.ctx.resume()
      setPlaying(true)
      animate(live, 1, { duration: 0.7, ease: 'easeOut' })
    }
  }
  const toggleMute = () => {
    engine.current?.setMuted(!muted)
    setMuted(!muted)
  }

  const md = MODES[mode]
  const status = !started || !playing ? '待机模拟 · IDLE' : source === 'mic' ? '麦克风 · LIVE' : '示例音乐 · 116 BPM'

  return (
    <div className="stage" style={{ background: '#08080e' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 9], fov: 42 }} gl={{ antialias: false, alpha: false }}>
        <color attach="background" args={['#08080e']} />
        <Visual spec={spec} engine={engine} live={live} kick={kick} prog={prog} morph={morph} meter={meter} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.3} luminanceSmoothing={0.3} radius={0.65} />
        </EffectComposer>
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={md.key}
          meta={`FFT 2048 · ${+(rate / 1000).toFixed(1)} kHz · ${COUNT.toLocaleString()} particles`}
          title={md.zh}
          sub={md.en}
          aside={md.aside}
        />

        <div className={'ar-meter' + (started ? '' : ' pre')} aria-hidden>
          <p>
            <i ref={(el) => void (meter.current.dot = el)} />
            {status}
          </p>
          <div className="ar-bars">
            {['SUB', 'BASS', 'MID', 'HIGH'].map((l, i) => (
              <div key={l}>
                <span>
                  <b ref={(el) => void (meter.current.bars[i] = el)} />
                </span>
                <em>{l}</em>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {!started && (
            <motion.div
              className="ar-gate"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.06, filter: 'blur(8px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <button className="ar-play" onClick={playDemo}>
                <span>播放示例音乐</span>
                <i>
                  <IconPlay />
                </i>
              </button>
              <p>116 BPM · 浏览器实时合成，没有音频文件</p>
              <button className="ar-alt" onClick={() => pickSource('mic')}>
                或者用麦克风驱动
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={'ar-toast' + (toast.warn ? ' warn' : '')}
              role="status"
              initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="dock ar-dock">
          <Seg
            items={MODES.map((m, i) => ({ value: i, label: PHONE ? m.short : m.zh }))}
            value={mode}
            onChange={(v) => {
              setMode(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          {PHONE ? (
            <button className="seg ar-icon" aria-label="使用麦克风" aria-pressed={source === 'mic' && started} onClick={() => pickSource(source === 'mic' ? 'demo' : 'mic')}>
              <IconMic />
            </button>
          ) : (
            <Seg
              items={[
                { value: 'demo' as Source, label: '示例音乐' },
                { value: 'mic' as Source, label: '麦克风' },
              ]}
              value={source}
              onChange={pickSource}
            />
          )}
          <span className="dock-sep" />
          <button className="seg ar-icon" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button className="seg ar-icon" aria-label={muted ? '取消静音' : '静音'} aria-pressed={muted} onClick={toggleMute}>
            <IconSound off={muted} />
          </button>
        </div>
      </div>
    </div>
  )
}

const css = `
.ar-gate {
  position: absolute; left: 0; right: 0; top: 50%; margin-top: -70px;
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  pointer-events: none !important;
}
.ar-gate > * { pointer-events: auto }
.ar-gate::before {
  content: ''; position: absolute; z-index: -1; left: 50%; top: 50%; width: 560px; height: 300px; translate: -50% -50%;
  background: radial-gradient(closest-side, rgba(8, 8, 14, .72), rgba(8, 8, 14, .4) 55%, transparent);
  pointer-events: none;
}
.ar-gate p, .ar-alt { text-shadow: 0 1px 12px rgba(8, 8, 14, .9) }
.ar-play {
  position: relative; display: inline-flex; align-items: center; gap: 14px;
  height: 64px; padding: 0 10px 0 28px; border: 0; border-radius: 999px; cursor: pointer;
  font: 600 18px/1 var(--display); letter-spacing: .01em; color: #fff;
  background: rgba(20, 14, 30, .55);
  box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 0 rgba(255, 79, 216, .5), 0 18px 60px -20px rgba(255, 79, 216, .7);
  backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
  transition: transform .18s var(--ease-out), box-shadow .3s;
  animation: ar-pulse 2.2s cubic-bezier(.2, .7, .3, 1) infinite;
}
.ar-play:hover { box-shadow: inset 0 0 0 1px rgba(255, 160, 235, .6), 0 0 0 0 rgba(255, 79, 216, .5), 0 18px 70px -16px rgba(255, 79, 216, .85) }
.ar-play:active { transform: scale(.96) }
.ar-play i {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
  background: #ff4fd8; color: #1a0716; box-shadow: 0 0 24px rgba(255, 79, 216, .7);
}
.ar-play i svg { margin-left: 2px; width: 16px; height: 16px }
@keyframes ar-pulse {
  0% { box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 0 rgba(255, 79, 216, .45), 0 18px 60px -20px rgba(255, 79, 216, .7) }
  70%, 100% { box-shadow: inset 0 0 0 1px rgba(255, 140, 230, .35), 0 0 0 22px rgba(255, 79, 216, 0), 0 18px 60px -20px rgba(255, 79, 216, .7) }
}
.ar-gate p { margin: 4px 0 0; font: 500 12px/1 var(--mono); letter-spacing: .06em; color: rgba(244, 242, 238, .62) }
.ar-alt {
  border: 0; background: none; cursor: pointer; padding: 6px 10px;
  font: 500 13px/1 var(--sans); color: rgba(244, 242, 238, .78);
  text-decoration: underline; text-decoration-color: rgba(244, 242, 238, .3); text-underline-offset: 4px;
}
.ar-alt:hover { color: #fff }
.ar-toast {
  position: absolute; top: 84px; left: 50%; translate: -50% 0;
  padding: 10px 16px; border-radius: 999px; white-space: nowrap;
  font: 500 13px/1 var(--sans); color: var(--fg);
  background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.ar-toast.warn { box-shadow: inset 0 0 0 1px rgba(255, 180, 120, .45); color: #ffd9b8 }
.ar-dock .ar-icon { width: 36px; padding: 0; display: grid; place-items: center }
.ar-dock .ar-icon svg { display: block }
.ar-dock .ar-icon[aria-pressed='true'] { color: #ff8fe6 }
.ar-meter {
  position: absolute; right: clamp(24px, 6vw, 96px); bottom: 104px;
  pointer-events: none !important; text-align: right;
}
.ar-meter p {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 12px;
  font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.ar-meter p i { width: 6px; height: 6px; border-radius: 50%; background: #ff4fd8; box-shadow: 0 0 10px #ff4fd8; opacity: .22 }
.ar-bars { display: flex; justify-content: flex-end; gap: 10px }
.ar-bars > div { display: flex; flex-direction: column; align-items: center; gap: 7px }
.ar-bars span { position: relative; display: block; width: 6px; height: 46px; border-radius: 3px; background: rgba(255, 255, 255, .07); overflow: hidden }
.ar-bars b {
  position: absolute; inset: 0; border-radius: 3px; transform-origin: 50% 100%; transform: scaleY(.06);
  background: linear-gradient(to top, #ff4fd8, #9a6bff 60%, #5ff0ff);
}
.ar-bars em { font: normal 500 9px/1 var(--mono); letter-spacing: .06em; color: rgba(244, 242, 238, .45) }
@media (max-width: 760px) {
  .ar-gate { margin-top: 90px }
  .ar-gate::before { width: 400px; height: 240px }
  .ar-play { height: 58px; font-size: 17px; padding-left: 24px }
  .ar-play i { width: 40px; height: 40px }
  .ar-meter { right: 20px; bottom: 214px; transition: opacity .4s }
  .ar-meter.pre { opacity: 0 }
  .ar-meter p { font-size: 10px; margin-bottom: 10px }
  .ar-bars { gap: 7px }
  .ar-bars span { height: 34px; width: 5px }
}
`
