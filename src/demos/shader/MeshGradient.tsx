import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { SIMPLEX_3D, hexToRgb, useShaderMaterial } from './glsl'

type Palette = { key: string; zh: string; colors: string[]; fg: string; fg2: string; dark?: boolean }

/* colour 0 is the "air" the blobs float in; 1–4 are the blobs */
const PALETTES: Palette[] = [
  { key: 'mist', zh: '晨雾', colors: ['#edf0fb', '#8ea6ff', '#ffb3cf', '#a6e6d8', '#b9a3ff'], fg: '#16182a', fg2: 'rgba(22,24,42,0.66)' },
  { key: 'coral', zh: '珊瑚', colors: ['#fff0e4', '#ff8a6b', '#ffc65c', '#ff5f8f', '#ffd3bd'], fg: '#2a1310', fg2: 'rgba(42,19,16,0.68)' },
  { key: 'aurora', zh: '极光', colors: ['#e3faf3', '#2fd0b5', '#6f7dff', '#c4f27e', '#a77bff'], fg: '#0b2420', fg2: 'rgba(11,36,32,0.68)' },
  { key: 'night', zh: '夜幕', colors: ['#0a0c1e', '#2b35a8', '#7d3fe6', '#ff5c8d', '#0f2a66'], fg: '#f6f4ff', fg2: 'rgba(246,244,255,0.7)', dark: true },
]

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const frag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC[5];
uniform vec2 uPointer;
uniform float uPush;
uniform float uDark;
${SIMPLEX_3D}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // two octaves of domain warp — the blobs bend instead of being round
  vec2 q = p;
  q += 0.22 * vec2(snoise(vec3(p * 1.1, t * 0.06)), snoise(vec3(p * 1.1 + 7.3, t * 0.06 + 2.0)));
  q += 0.07 * vec2(snoise(vec3(q * 2.7, t * 0.1 + 3.0)), snoise(vec3(q * 2.7 + 1.7, t * 0.1 + 5.0)));

  // pointer pushes space outward
  vec2 dp = q - uPointer;
  float fall = exp(-dot(dp, dp) * 6.0);
  q += normalize(dp + 1e-4) * fall * 0.16 * uPush;

  float sx = max(asp, 0.75) * 0.5;
  vec2 c1 = vec2(sin(t * 0.090 + 0.0) * sx * 0.9, cos(t * 0.070 + 1.0) * 0.36);
  vec2 c2 = vec2(cos(t * 0.075 + 2.1) * sx * 0.85, sin(t * 0.095 + 0.4) * 0.40);
  vec2 c3 = vec2(sin(t * 0.060 + 4.2) * sx * 0.7, sin(t * 0.083 + 3.3) * 0.42);
  vec2 c4 = vec2(cos(t * 0.105 + 5.0) * sx * 0.8, cos(t * 0.064 + 2.6) * 0.38);

  // Shepard-style blend: each blob dominates its neighbourhood, the "air" fills the rest
  float w0 = 0.9;
  float w1 = 1.0 / pow(length(q - c1) + 0.06, 2.4);
  float w2 = 1.0 / pow(length(q - c2) + 0.06, 2.4);
  float w3 = 1.0 / pow(length(q - c3) + 0.06, 2.4);
  float w4 = 1.0 / pow(length(q - c4) + 0.06, 2.4);
  vec3 col = (uC[0] * w0 + uC[1] * w1 + uC[2] * w2 + uC[3] * w3 + uC[4] * w4) / (w0 + w1 + w2 + w3 + w4);

  // soft sheen along a slow noise ridge
  float ridge = 1.0 - abs(snoise(vec3(q * 1.1 + 11.0, t * 0.05)));
  col += pow(ridge, 3.0) * mix(0.035, 0.025, uDark);

  // vignette (subtle)
  vec2 vp = (vUv - 0.5) * 2.0;
  float vig = smoothstep(0.55, 1.6, length(vp));
  col *= 1.0 - vig * mix(0.12, 0.3, uDark);

  // film grain
  float g = hash(gl_FragCoord.xy + fract(t * 7.13) * 413.0) - 0.5;
  col += g * mix(0.05, 0.04, uDark);

  gl_FragColor = vec4(col, 1.0);
}
`

function Gradient({ mix, from, to, push, pointer }: { mix: MotionValue<number>; from: React.RefObject<number[][]>; to: React.RefObject<number[][]>; push: MotionValue<number>; pointer: React.RefObject<THREE.Vector2> }) {
  const size = useThree((s) => s.size)
  const uniforms = useMemo(
    () => ({
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uC: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPush: { value: 0 },
      uDark: { value: 0 },
    }),
    [],
  )
  const mat = useShaderMaterial(() => ({ vertexShader: vert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false }))
  const lp = useRef(new THREE.Vector2(0, -0.6))
  const clock = useRef(Math.random() * 40 + 20)

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    clock.current += dt
    const u = uniforms
    u.uTime.value = clock.current
    u.uRes.value.set(size.width, size.height)
    const k = mix.get()
    const a = from.current
    const b = to.current
    for (let i = 0; i < 5; i++) {
      u.uC.value[i].set(a[i][0] + (b[i][0] - a[i][0]) * k, a[i][1] + (b[i][1] - a[i][1]) * k, a[i][2] + (b[i][2] - a[i][2]) * k)
    }
    u.uDark.value = (a[5][0] + (b[5][0] - a[5][0]) * k)
    const asp = size.width / size.height
    const p = pointer.current
    lp.current.x = THREE.MathUtils.damp(lp.current.x, p.x * 0.5 * asp, 3, dt)
    lp.current.y = THREE.MathUtils.damp(lp.current.y, p.y * 0.5, 3, dt)
    u.uPointer.value.copy(lp.current)
    u.uPush.value = push.get()
  })

  return (
    <mesh frustumCulled={false} material={mat}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

const toArr = (p: Palette) => [...p.colors.map(hexToRgb), [p.dark ? 1 : 0, 0, 0]]

export default function MeshGradient() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const mix = useMotionValue(1)
  const push = useMotionValue(0)
  const from = useRef<number[][]>(toArr(PALETTES[0]))
  const to = useRef<number[][]>(toArr(PALETTES[0]))
  const pointer = useRef(new THREE.Vector2(0, -1.2))

  // snapshot the currently displayed colours, then glide to the next palette
  useEffect(() => {
    const k = mix.get()
    from.current = from.current.map((c, i) => c.map((v, j) => v + (to.current[i][j] - v) * k))
    to.current = toArr(PALETTES[idx])
    mix.set(0)
    const a = animate(mix, 1, { duration: 1.8, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [idx, mix])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % PALETTES.length), 6500)
    return () => clearInterval(id)
  }, [auto])

  useEffect(() => {
    let timer = 0
    const onMove = (e: PointerEvent) => {
      pointer.current.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
      animate(push, 1, { type: 'spring', stiffness: 120, damping: 20 })
      clearTimeout(timer)
      timer = window.setTimeout(() => animate(push, 0.35, { duration: 2.2, ease: 'easeInOut' }), 1400)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      clearTimeout(timer)
    }
  }, [push])

  const pal = PALETTES[idx]

  return (
    <div className="stage" style={{ background: pal.colors[0], transition: 'background 1.6s' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 1.5]} gl={{ antialias: false, alpha: true }} camera={{ position: [0, 0, 1] }}>
        <Gradient mix={mix} from={from} to={to} push={push} pointer={pointer} />
      </Canvas>

      <div className="overlay mg-overlay" style={{ ['--mg-fg' as string]: pal.fg, ['--mg-fg2' as string]: pal.fg2 }} data-dark={pal.dark ? '' : undefined}>
        <div className="mg-hero">
        <motion.div
          className="mg-hero-in"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
        >
          <a className="mg-badge" href="#/shader-gradient" onClick={(e) => e.preventDefault()}>
            <i />
            新版本 2.0 已发布
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
              <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <h1>
            让首屏的背景
            <br />
            自己慢慢呼吸
          </h1>
          <p>五个色块沿扭曲噪声漂移，叠一层胶片颗粒。整块背景只是一张全屏着色器，没有图片和视频。</p>
          <div className="mg-actions">
            <button className="mg-btn primary">免费开始使用</button>
            <button className="mg-btn" onClick={() => { setAuto(false); setIdx((i) => (i + 1) % PALETTES.length) }}>
              换一套配色
            </button>
          </div>
        </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={PALETTES.map((p, i) => ({ value: i, label: p.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '轮播'}</span>
          </button>
        </div>
        <p className="hint mg-hint">移动指针 · 推开色块</p>
      </div>
    </div>
  )
}

const css = `
.mg-overlay { --mg-fg: #16182a; --mg-fg2: rgba(22,24,42,.66); }
.mg-hero {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%);
  width: min(760px, calc(100% - 40px)); text-align: center;
  display: flex; flex-direction: column; align-items: center;
  color: var(--mg-fg); transition: color 1.2s;
}
.mg-hero-in { display: flex; flex-direction: column; align-items: center; }
.mg-badge {
  display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 10px;
  border-radius: 999px; font: 500 13px/1 var(--sans); color: var(--mg-fg);
  background: color-mix(in srgb, #fff 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 55%, transparent), 0 6px 20px -10px rgba(0,0,0,.25);
  backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
  transition: color 1.2s, background 1.2s, box-shadow 1.2s;
}
.mg-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .75 }
.mg-badge svg { opacity: .6 }
.mg-hero h1 {
  margin: 26px 0 0; font: 600 clamp(38px, 5.8vw, 80px)/1.06 var(--display); letter-spacing: -0.04em;
}
.mg-hero p {
  max-width: 520px; margin: 22px 0 0; font-size: 16.5px; line-height: 1.75; color: var(--mg-fg2); transition: color 1.2s;
}
.mg-actions { display: flex; gap: 10px; margin-top: 32px; }
.mg-btn {
  height: 46px; padding: 0 22px; border: 0; border-radius: 999px; cursor: pointer;
  font: 500 14.5px/1 var(--sans); color: var(--mg-fg);
  background: color-mix(in srgb, #fff 30%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mg-fg) 16%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  transition: transform .15s var(--ease-out), color 1.2s, background 1.2s, box-shadow 1.2s;
}
.mg-btn:active { transform: scale(.97) }
.mg-btn.primary { background: var(--mg-fg); color: color-mix(in srgb, var(--mg-fg) 8%, #fff); box-shadow: 0 10px 24px -12px rgba(0,0,0,.45) }
.mg-overlay[data-dark] .mg-btn.primary { color: #12132a }
.mg-overlay[data-dark] .mg-badge, .mg-overlay[data-dark] .mg-btn:not(.primary) {
  background: color-mix(in srgb, #fff 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 18%, transparent);
}
.mg-hint { color: var(--mg-fg2); transition: color 1.2s }
@media (max-width: 760px) {
  .mg-hero { transform: translate(-50%, -58%) }
  .mg-hero p { font-size: 15px }
  .mg-actions { flex-direction: column; width: 100%; max-width: 280px }
}
`
