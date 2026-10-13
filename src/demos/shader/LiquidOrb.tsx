import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'
import { SIMPLEX_3D, useShaderMaterial } from './glsl'

type StateKey = 'idle' | 'listen' | 'think' | 'answer'
type Params = { amp: number; freq: number; speed: number; hue: number; scale: number; swirl: number; glow: number; drift: number }

const STATES: { key: StateKey; zh: string; en: string; desc: string; p: Params }[] = [
  { key: 'idle', zh: '待机', en: 'Idle', desc: '缓慢呼吸，等待唤起', p: { amp: 0.065, freq: 0.9, speed: 0.22, hue: 0.0, scale: 1, swirl: 0, glow: 0.6, drift: 0 } },
  { key: 'listen', zh: '聆听', en: 'Listening', desc: '表面随声音起伏，音量越大波动越强', p: { amp: 0.06, freq: 1.2, speed: 0.5, hue: 0.45, scale: 1.02, swirl: 0, glow: 0.6, drift: 0 } },
  { key: 'think', zh: '思考', en: 'Thinking', desc: '噪声场加速旋转，色相持续流动', p: { amp: 0.09, freq: 1.45, speed: 0.9, hue: 0.22, scale: 0.94, swirl: 1.9, glow: 0.75, drift: 0.16 } },
  { key: 'answer', zh: '回答', en: 'Responding', desc: '跟随语句节奏脉动，像在开口说话', p: { amp: 0.075, freq: 1.1, speed: 0.55, hue: 0.72, scale: 1.0, swirl: 0.4, glow: 1.05, drift: 0 } },
]
const KEYS = ['amp', 'freq', 'speed', 'hue', 'scale', 'swirl', 'glow', 'drift'] as const

const vert = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uSwirl;
uniform float uScale;
varying vec3 vN;
varying vec3 vSN;
varying vec3 vView;
varying float vDisp;
${SIMPLEX_3D}

float field(vec3 p) {
  vec3 q = p * uFreq;
  float a = uSwirl * p.y + uTime * 0.15 * uSwirl;
  float c = cos(a), s = sin(a);
  q.xz = mat2(c, -s, s, c) * q.xz;
  float n = snoise(q + vec3(0.0, uTime * 0.55, uTime * 0.3));
  n += 0.28 * snoise(q * 2.0 + vec3(uTime * 0.35, 0.0, -uTime * 0.2));
  return n;
}
vec3 displace(vec3 n) { return n * (1.0 + uAmp * field(n)); }

void main() {
  vec3 p = normalize(position);
  vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(p, t);
  float e = 0.012;
  float f0 = field(p);
  vec3 d0 = p * (1.0 + uAmp * f0);
  vec3 d1 = displace(normalize(p + t * e));
  vec3 d2 = displace(normalize(p + b * e));
  vec3 nrm = normalize(cross(d1 - d0, d2 - d0));
  vDisp = f0;
  vec4 mv = modelViewMatrix * vec4(d0 * uScale, 1.0);
  vN = normalize(normalMatrix * nrm);
  vSN = normalize(normalMatrix * p);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const frag = /* glsl */ `
uniform float uHue;
uniform float uGlow;
varying vec3 vN;
varying vec3 vSN;
varying vec3 vView;
varying float vDisp;

vec3 pal(float t) {
  // cyclic violet → blue → cyan → pink film palette (sRGB stops, linearised)
  t = fract(t) * 4.0;
  vec3 c0 = vec3(0.50, 0.36, 1.00);
  vec3 c1 = vec3(0.26, 0.52, 1.00);
  vec3 c2 = vec3(0.36, 0.92, 0.98);
  vec3 c3 = vec3(1.00, 0.46, 0.84);
  vec3 c = t < 1.0 ? mix(c0, c1, smoothstep(0.0, 1.0, t))
         : t < 2.0 ? mix(c1, c2, smoothstep(1.0, 2.0, t))
         : t < 3.0 ? mix(c2, c3, smoothstep(2.0, 3.0, t))
         : mix(c3, c0, smoothstep(3.0, 4.0, t));
  return pow(c, vec3(2.2));
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.4);

  vec3 base = pal(uHue);
  vec3 rimC = pal(uHue + 0.1 + (1.0 - ndv) * 0.12 + vDisp * 0.05);
  vec3 film = pal(uHue - 0.08 + vDisp * 0.12);

  // dark glassy body with a soft luminous core
  vec3 col = base * 0.012;
  col += base * pow(ndv, 3.0) * uGlow * 0.15;
  // internal thin-film bands that follow the displacement
  float band = 0.5 + 0.5 * sin(vDisp * 8.0 + ndv * 6.0);
  col += film * band * pow(1.0 - ndv, 1.4) * 0.28;
  // fresnel rim
  col += rimC * fr * 1.35;

  // studio reflections: a soft top strip + one sharp key highlight
  vec3 r = reflect(-v, n);
  col += smoothstep(0.45, 0.95, r.y) * smoothstep(-0.2, 0.6, r.z) * 0.1 * mix(vec3(1.0), rimC, 0.4);
  vec3 l1 = normalize(vec3(-0.45, 0.75, 0.6));
  vec3 l2 = normalize(vec3(0.7, -0.35, 0.4));
  // highlights use a softened normal so they stay clean ovals that wobble, not noisy squiggles
  vec3 ns = normalize(mix(n, normalize(vSN), 0.82));
  col += pow(max(dot(ns, normalize(l1 + v)), 0.0), 320.0) * 1.1 + pow(max(dot(n, normalize(l1 + v)), 0.0), 40.0) * 0.08;
  col += pow(max(dot(ns, normalize(l2 + v)), 0.0), 50.0) * pal(uHue + 0.25) * 0.22;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

const haloFrag = /* glsl */ `
uniform float uHue;
uniform float uGlow;
varying vec2 vUv;
vec3 pal(float t) {
  // cyclic violet → blue → cyan → pink film palette (sRGB stops, linearised)
  t = fract(t) * 4.0;
  vec3 c0 = vec3(0.50, 0.36, 1.00);
  vec3 c1 = vec3(0.26, 0.52, 1.00);
  vec3 c2 = vec3(0.36, 0.92, 0.98);
  vec3 c3 = vec3(1.00, 0.46, 0.84);
  vec3 c = t < 1.0 ? mix(c0, c1, smoothstep(0.0, 1.0, t))
         : t < 2.0 ? mix(c1, c2, smoothstep(1.0, 2.0, t))
         : t < 3.0 ? mix(c2, c3, smoothstep(2.0, 3.0, t))
         : mix(c3, c0, smoothstep(3.0, 4.0, t));
  return pow(c, vec3(2.2));
}
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float g = exp(-d * d * 7.0) * 0.05 + exp(-d * d * 20.0) * 0.045;
  vec3 c = pal(uHue) * g * uGlow;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`
const haloVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const DETAIL = typeof window !== 'undefined' && window.innerWidth < 760 ? 48 : 80

type MV = Record<(typeof KEYS)[number], MotionValue<number>>

function Orb({ mv, mode, bars }: { mv: MV; mode: React.RefObject<StateKey>; bars: React.RefObject<(HTMLElement | null)[]> }) {
  const scale = usePortraitScale(1.5)
  const group = useRef<THREE.Group>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0.1 },
      uFreq: { value: 1 },
      uSwirl: { value: 0 },
      uScale: { value: 1 },
      uHue: { value: 0 },
      uGlow: { value: 0.6 },
    }),
    [],
  )
  const orbMat = useShaderMaterial(() => ({ vertexShader: vert, fragmentShader: frag, uniforms }))
  const haloMat = useShaderMaterial(() => ({
    vertexShader: haloVert,
    fragmentShader: haloFrag,
    uniforms: { uHue: uniforms.uHue, uGlow: uniforms.uGlow },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }))
  const st = useRef({ t: 0, clock: 0, drift: 0, voice: 0, voiceTarget: 0, syll: 0, talk: 0 })
  const ptr = useRef(new THREE.Vector2())

  useEffect(() => {
    const onMove = (e: PointerEvent) => ptr.current.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const s = st.current
    const m = mode.current
    s.clock += dt
    s.t += dt * mv.speed.get()
    const dr = mv.drift.get()
    s.drift += dt * dr
    // once the swirl stops, settle the accumulated hue drift on a whole palette turn (invisible wrap)
    if (dr < 0.02) s.drift = THREE.MathUtils.damp(s.drift, Math.round(s.drift), 1.2, dt)

    // procedural "voice level": syllables gated on/off with a jittery envelope
    s.syll -= dt
    if (s.syll <= 0) {
      s.syll = 0.09 + Math.random() * 0.22
      s.voiceTarget = Math.random() < 0.78 ? 0.35 + Math.random() * 0.65 : 0.04
    }
    const listening = m === 'listen' ? 1 : 0
    s.voice = THREE.MathUtils.damp(s.voice, s.voiceTarget * listening, 14, dt)
    // speaking rhythm while answering
    const talking = m === 'answer' ? 1 : 0
    const beat = Math.pow(0.5 + 0.5 * Math.sin(s.clock * 7.2), 3) * (0.55 + 0.45 * Math.sin(s.clock * 1.7))
    s.talk = THREE.MathUtils.damp(s.talk, talking * beat, 10, dt)

    const u = uniforms
    u.uTime.value = s.t
    u.uAmp.value = mv.amp.get() + s.voice * 0.075 + s.talk * 0.03
    u.uFreq.value = mv.freq.get()
    u.uSwirl.value = mv.swirl.get()
    u.uScale.value = mv.scale.get() * (1 + s.voice * 0.07 + s.talk * 0.045)
    u.uHue.value = mv.hue.get() + s.drift
    u.uGlow.value = mv.glow.get() * (1 + s.voice * 0.5 + s.talk * 0.6)

    const g = group.current
    if (g) {
      g.rotation.y += dt * 0.08
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -ptr.current.y * 0.18, 2.5, dt)
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, ptr.current.x * -0.1, 2.5, dt)
      g.position.x = THREE.MathUtils.damp(g.position.x, ptr.current.x * 0.12, 2, dt)
    }

    // drive the little level meter in the input pill without React re-renders
    const b = bars.current
    if (b) {
      for (let i = 0; i < b.length; i++) {
        const el = b[i]
        if (!el) continue
        const wob = 0.55 + 0.45 * Math.sin(s.clock * (9 + i * 2.3) + i * 1.7)
        const lvl = m === 'listen' ? 0.15 + s.voice * wob : m === 'answer' ? 0.15 + s.talk * 0.8 * wob : m === 'think' ? 0.25 + 0.2 * Math.sin(s.clock * 6 - i * 0.9) : 0.15
        el.style.transform = `scaleY(${Math.max(0.12, Math.min(1, lvl)).toFixed(3)})`
      }
    }
  })

  return (
    <group position={[0, 0.42 * scale + (scale < 1 ? 0.25 : 0), 0]} scale={scale}>
      <mesh position={[0, 0, -1.5]} material={haloMat}>
        <planeGeometry args={[9, 9]} />
      </mesh>
      <group ref={group}>
        <mesh material={orbMat}>
          <icosahedronGeometry args={[1, DETAIL]} />
        </mesh>
      </group>
    </group>
  )
}

export default function LiquidOrb() {
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const mode = useRef<StateKey>('idle')
  const bars = useRef<(HTMLElement | null)[]>([])
  const lastUser = useRef(-1e9)
  const seq = useRef<number[]>([])

  const amp = useMotionValue(STATES[0].p.amp)
  const freq = useMotionValue(STATES[0].p.freq)
  const speed = useMotionValue(STATES[0].p.speed)
  const hue = useMotionValue(STATES[0].p.hue)
  const scale = useMotionValue(STATES[0].p.scale)
  const swirl = useMotionValue(STATES[0].p.swirl)
  const glow = useMotionValue(STATES[0].p.glow)
  const drift = useMotionValue(STATES[0].p.drift)
  const mv: MV = useMemo(() => ({ amp, freq, speed, hue, scale, swirl, glow, drift }), [amp, freq, speed, hue, scale, swirl, glow, drift])

  const st = STATES[idx]

  useEffect(() => {
    mode.current = st.key
    const ctrls = KEYS.map((k) =>
      animate(mv[k], st.p[k], k === 'scale' ? { type: 'spring', stiffness: 140, damping: 9 } : { type: 'spring', stiffness: 38, damping: 13 }),
    )
    return () => ctrls.forEach((c) => c.stop())
  }, [st, mv])

  // idle auto-cycle: only while nobody has touched anything for a while
  useEffect(() => {
    const id = setInterval(() => {
      if (performance.now() - lastUser.current < 12000 || seq.current.length) return
      setIdx((i) => (i + 1) % STATES.length)
    }, 4800)
    return () => clearInterval(id)
  }, [])

  const clearSeq = () => {
    seq.current.forEach(clearTimeout)
    seq.current = []
  }
  useEffect(() => clearSeq, [])

  const pick = useCallback((i: number) => {
    lastUser.current = performance.now()
    clearSeq()
    setReply(null)
    setIdx(i)
  }, [])

  const send = () => {
    const q = text.trim() || '帮我写一句首页标语'
    lastUser.current = performance.now()
    clearSeq()
    setText('')
    setReply(`“${q.length > 18 ? q.slice(0, 18) + '…' : q}”`)
    setIdx(2)
    seq.current.push(
      window.setTimeout(() => setIdx(3), 2400),
      window.setTimeout(() => {
        setIdx(0)
        setReply(null)
        lastUser.current = performance.now()
        seq.current = []
      }, 7600),
    )
  }

  const caption = reply ? (st.key === 'think' ? `正在思考 ${reply}` : st.key === 'answer' ? '正在回答，光球随语句节奏脉动' : st.desc) : st.desc

  return (
    <div className="stage" style={{ background: '#06060b' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 6], fov: 40 }} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={['#06060b']} />
        <Orb mv={mv} mode={mode} bars={bars} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.42} luminanceSmoothing={0.3} radius={0.7} />
        </EffectComposer>
      </Canvas>

      <div className="overlay">
        <div className="lo-panel">
          <div className="lo-caption">
            <p className="lo-meta">
              <i style={{ animationDuration: st.key === 'idle' ? '2.4s' : '0.9s' }} />
              {String(idx + 1).padStart(2, '0')} / 04 · {st.en}
            </p>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={st.key + (reply ? 'r' : '')}
                initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                <h2>{st.zh}</h2>
                <p>{caption}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <form
            className="lo-pill"
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
          >
            <button type="button" className="lo-mic" aria-label="语音输入" aria-pressed={st.key === 'listen'} onClick={() => pick(st.key === 'listen' ? 0 : 1)}>
              <span className="lo-bars" aria-hidden>
                {[0, 1, 2, 3, 4].map((i) => (
                  <b key={i} ref={(el) => void (bars.current[i] = el)} />
                ))}
              </span>
            </button>
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                lastUser.current = performance.now()
              }}
              placeholder="问点什么，按回车发送"
              aria-label="提问"
            />
            <button type="submit" className="lo-send" aria-label="发送">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M8 13V3.5M3.8 7.5 8 3.3l4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </div>

        <div className="dock">
          <Seg items={STATES.map((s, i) => ({ value: i, label: s.zh }))} value={idx} onChange={pick} />
        </div>
        <p className="hint">回车发送 · 进入 思考 → 回答</p>
      </div>
    </div>
  )
}

const css = `
.lo-panel {
  position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%);
  width: min(520px, calc(100% - 32px));
  display: flex; flex-direction: column; align-items: center; gap: 22px;
  pointer-events: none;
}
.lo-panel > * { pointer-events: auto }
.lo-caption { text-align: center; min-height: 96px; }
.lo-meta {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font: 500 11.5px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-2);
}
.lo-meta i { width: 6px; height: 6px; border-radius: 50%; background: #b9a6ff; box-shadow: 0 0 10px #b9a6ff; animation: lo-blink 2.4s ease-in-out infinite }
@keyframes lo-blink { 50% { opacity: .35 } }
.lo-caption h2 { margin: 0; font: 600 30px/1.1 var(--display); letter-spacing: -.02em; color: var(--fg) }
.lo-caption p { margin: 8px 0 0; font-size: 14.5px; color: var(--fg-2) }
.lo-pill {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 54px; padding: 6px;
  border-radius: 999px; background: rgba(255,255,255,.055);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 20px 50px -24px rgba(120,100,255,.45);
  backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  transition: box-shadow .3s;
}
.lo-pill:focus-within { box-shadow: inset 0 0 0 1px rgba(185,166,255,.45), 0 20px 50px -20px rgba(120,100,255,.6) }
.lo-pill input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent;
  color: var(--fg); font: 15px/1 var(--sans); padding: 0 6px;
}
.lo-pill input::placeholder { color: rgba(244,242,238,.42) }
.lo-mic, .lo-send {
  flex: none; width: 42px; height: 42px; border: 0; border-radius: 50%; cursor: pointer;
  display: grid; place-items: center; color: var(--fg);
  background: rgba(255,255,255,.07); transition: background .2s, transform .15s var(--ease-out);
}
.lo-mic:active, .lo-send:active { transform: scale(.94) }
.lo-mic[aria-pressed='true'] { background: rgba(140,200,255,.18) }
.lo-send { background: #f1edff; color: #14111f }
.lo-bars { display: flex; align-items: center; gap: 2.5px; height: 18px }
.lo-bars b { width: 2.5px; height: 18px; border-radius: 2px; background: currentColor; transform: scaleY(.15); opacity: .9 }
@media (max-width: 760px) {
  .lo-panel { bottom: 86px; gap: 16px }
  .lo-caption { min-height: 84px }
  .lo-caption h2 { font-size: 26px }
}
`
