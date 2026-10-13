import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { SIMPLEX_3D, hexToRgb, useShaderMaterial } from './glsl'

type Palette = { key: string; zh: string; en: string; c: [string, string, string]; back: string; spec: string; bg: string; dot: string }

const PALETTES: Palette[] = [
  { key: 'rose', zh: '玫瑰金', en: 'Rose Gold', c: ['#ff9db8', '#f6c49a', '#e98aa0'], back: '#5a2236', spec: '#fff1e6', bg: '#0d0a10', dot: '#ffb3c7' },
  { key: 'glacier', zh: '冰川', en: 'Glacier', c: ['#8fd0ff', '#d6f1ff', '#7f97ff'], back: '#1d2c66', spec: '#f2fbff', bg: '#070b12', dot: '#9fd8ff' },
  { key: 'neon', zh: '霓虹', en: 'Neon', c: ['#ff3ea5', '#7b5cff', '#21d4ff'], back: '#2a0f4a', spec: '#ffffff', bg: '#08060f', dot: '#ff3ea5' },
]

/* ribbon layout in the group's local frame */
const RIBBONS = [
  { seed: 0.3, y: 0.5, width: 1.05, amp: 0.9, twist: 2.2, ci: 0 },
  { seed: 4.1, y: 0.0, width: 1.4, amp: 1.0, twist: 1.6, ci: 1 },
  { seed: 8.7, y: -0.45, width: 0.85, amp: 0.85, twist: 2.6, ci: 2 },
  { seed: 13.2, y: 0.05, width: 0.5, amp: 1.2, twist: 3.0, ci: 0 },
]

const SEG_L = 360
const SEG_W = 12

function stripGeometry() {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array((SEG_L + 1) * (SEG_W + 1) * 3)
  const idx: number[] = []
  let k = 0
  for (let i = 0; i <= SEG_L; i++) {
    for (let j = 0; j <= SEG_W; j++) {
      pos[k++] = i / SEG_L // s along the ribbon
      pos[k++] = (j / SEG_W) * 2 - 1 // v across
      pos[k++] = 0
    }
  }
  for (let i = 0; i < SEG_L; i++) {
    for (let j = 0; j < SEG_W; j++) {
      const a = i * (SEG_W + 1) + j
      const b = a + SEG_W + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50)
  return g
}

const vert = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform float uWidth;
uniform float uAmp;
uniform float uTwist;
uniform float uY;
uniform vec3 uPointer;
uniform float uBend;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec2 vSV;
${SIMPLEX_3D}

const float LEN = 20.0;

vec3 curve(float s) {
  float t = uTime;
  float x = (s - 0.5) * LEN;
  float y = uY
    + sin(s * 3.4 + t * 0.21 + uSeed) * 0.42 * uAmp
    + snoise(vec3(s * 1.5, uSeed, t * 0.06)) * 0.75 * uAmp;
  float z = cos(s * 2.6 + t * 0.17 + uSeed * 1.7) * 0.9 * uAmp
    + snoise(vec3(s * 1.1 + 5.0, uSeed, t * 0.05)) * 1.1 * uAmp;
  // pointer: ribbons lean gently towards it
  float near = exp(-pow((x - uPointer.x) / 2.6, 2.0));
  y += (uPointer.y - y) * 0.16 * near * uBend;
  z += 0.35 * near * uBend;
  return vec3(x, y, z);
}

void main() {
  float s = position.x;
  float v = position.y;
  vec3 p = curve(s);
  vec3 T = normalize(curve(s + 0.0015) - p);
  vec3 N0 = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 B0 = cross(T, N0);
  float th = snoise(vec3(s * 1.2, uSeed + 3.0, uTime * 0.05)) * uTwist + s * 2.2 + uTime * 0.04 + uSeed;
  vec3 W = cos(th) * N0 + sin(th) * B0;
  vec3 Nrm = normalize(cross(T, W));
  // slight curl across the width so it reads as cloth, not paper
  vec3 pos = p + W * v * uWidth * 0.5 + Nrm * (v * v) * 0.12 * uWidth;
  vec3 nC = normalize(Nrm - W * v * 0.35);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vN = normalize(normalMatrix * nC);
  vT = normalize(normalMatrix * T);
  vView = -mv.xyz;
  vSV = vec2(s, v);
  gl_Position = projectionMatrix * mv;
}
`

const frag = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uBack;
uniform vec3 uSpec;
uniform float uFade;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec2 vSV;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 T = normalize(vT);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.2);

  // iridescent drift between the two front colours along the length and with view angle
  float k = clamp(0.5 + 0.5 * sin(vSV.x * 7.0 + vSV.y * 0.8) * 0.8 + (fr - 0.3) * 0.6, 0.0, 1.0);
  vec3 front = mix(uA, uB, k);
  vec3 base = gl_FrontFacing ? front : mix(uBack, front, 0.25);

  vec3 L1 = normalize(vec3(-0.3, 0.8, 0.6));
  vec3 L2 = normalize(vec3(0.6, -0.2, 0.7));
  float dif = 0.35 + 0.65 * max(dot(n, L1), 0.0);

  // Kajiya-Kay anisotropic sheen along the threads
  vec3 H1 = normalize(L1 + v);
  vec3 H2 = normalize(L2 + v);
  float th1 = dot(T, H1);
  float th2 = dot(T, H2);
  float an1 = pow(sqrt(max(1.0 - th1 * th1, 0.0)), 70.0);
  float an2 = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 24.0);
  float blinn = pow(max(dot(n, H1), 0.0), 60.0);

  vec3 col = base * dif * 0.42;
  col += front * fr * 0.55;
  col += uSpec * (an1 * 0.55 + blinn * 0.5);
  col += front * an2 * 0.22;

  // threads + soft edges
  float edge = smoothstep(1.0, 0.72, abs(vSV.y));
  float ends = smoothstep(0.0, 0.18, vSV.x) * smoothstep(1.0, 0.82, vSV.x);
  float a = edge * ends * uFade * (0.5 + 0.5 * fr + an1 * 0.4);
  gl_FragColor = vec4(col * a, 1.0);
}
`

const bgVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
`
const bgFrag = /* glsl */ `
uniform vec3 uBg;
uniform vec3 uTint;
uniform vec2 uRes;
uniform vec2 uCenter;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 p = (vUv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(p);
  vec3 col = uBg + uTint * 0.07 * exp(-d * d * 1.6);
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.3, d);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * 2.0; // dither the gradient
  gl_FragColor = vec4(col, 1.0);
}
`

function Backdrop({ colors }: { colors: () => [number[], number[]] }) {
  const size = useThree((s) => s.size)
  const uniforms = useMemo(() => ({ uBg: { value: new THREE.Vector3() }, uTint: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2(0.62, 0.55) } }), [])
  const mat = useShaderMaterial(() => ({ vertexShader: bgVert, fragmentShader: bgFrag, uniforms, depthWrite: false, depthTest: false }))
  useFrame(() => {
    const [bg, tint] = colors()
    uniforms.uBg.value.set(bg[0], bg[1], bg[2])
    uniforms.uTint.value.set(tint[0], tint[1], tint[2])
    uniforms.uRes.value.set(size.width, size.height)
    uniforms.uCenter.value.set(size.width < 760 ? 0.5 : 0.64, size.width < 760 ? 0.66 : 0.52)
  })
  return (
    <mesh material={mat} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

type Uni = {
  uTime: { value: number }
  uSeed: { value: number }
  uWidth: { value: number }
  uAmp: { value: number }
  uTwist: { value: number }
  uY: { value: number }
  uPointer: { value: THREE.Vector3 }
  uBend: { value: number }
  uA: { value: THREE.Vector3 }
  uB: { value: THREE.Vector3 }
  uBack: { value: THREE.Vector3 }
  uSpec: { value: THREE.Vector3 }
  uFade: { value: number }
}

function Ribbon({ cfg, geo, uniRef }: { cfg: (typeof RIBBONS)[number]; geo: THREE.BufferGeometry; uniRef: (u: Uni) => void }) {
  const uniforms = useMemo<Uni>(
    () => ({
      uTime: { value: 0 },
      uSeed: { value: cfg.seed },
      uWidth: { value: cfg.width },
      uAmp: { value: cfg.amp },
      uTwist: { value: cfg.twist },
      uY: { value: cfg.y },
      uPointer: { value: new THREE.Vector3(0, 0, 0) },
      uBend: { value: 0 },
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uBack: { value: new THREE.Vector3() },
      uSpec: { value: new THREE.Vector3(1, 1, 1) },
      uFade: { value: 0 },
    }),
    [cfg],
  )
  const mat = useShaderMaterial(() => ({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }))
  useEffect(() => uniRef(uniforms), [uniforms, uniRef])
  return <mesh geometry={geo} material={mat} frustumCulled={false} />
}

function Scene({ mix, from, to, pointer }: { mix: MotionValue<number>; from: React.RefObject<number[][]>; to: React.RefObject<number[][]>; pointer: React.RefObject<THREE.Vector2> }) {
  const geo = useMemo(stripGeometry, [])
  useEffect(() => () => geo.dispose(), [geo])
  const group = useRef<THREE.Group>(null)
  const unis = useRef<Uni[]>([])
  const { viewport, size } = useThree()
  const mobile = size.width < 760
  const clock = useRef(12)
  const lp = useRef(new THREE.Vector3())
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const bend = useRef(0)
  const fade = useRef(0)

  const setters = useMemo(() => RIBBONS.map((_, i) => (u: Uni) => void (unis.current[i] = u)), [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    clock.current += dt
    fade.current = Math.min(1, fade.current + dt * 0.5)
    const k = mix.get()
    const a = from.current
    const b = to.current
    const lerp = (i: number, j: number) => a[i][j] + (b[i][j] - a[i][j]) * k
    // pointer → group local space at z = 0
    const g = group.current
    const p = pointer.current
    if (g) {
      tmp.set((p.x * viewport.width) / 2, (p.y * viewport.height) / 2, 0)
      g.worldToLocal(tmp)
      lp.current.lerp(tmp, 1 - Math.exp(-dt * 2.5))
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -p.y * 0.06, 1.5, dt)
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, p.x * 0.08, 1.5, dt)
    }
    bend.current = THREE.MathUtils.damp(bend.current, Math.abs(p.x) > 1.5 ? 0 : 1, 1.2, dt)
    const e = Math.sin(Math.min(1, fade.current) * Math.PI * 0.5)
    for (let i = 0; i < unis.current.length; i++) {
      const u = unis.current[i]
      if (!u) continue
      const ci = RIBBONS[i].ci
      u.uTime.value = clock.current
      u.uPointer.value.copy(lp.current)
      u.uBend.value = bend.current
      u.uFade.value = e * (i === 3 ? 0.7 : 1)
      u.uA.value.set(lerp(ci, 0), lerp(ci, 1), lerp(ci, 2))
      const cj = (ci + 1) % 3
      u.uB.value.set(lerp(cj, 0), lerp(cj, 1), lerp(cj, 2))
      u.uBack.value.set(lerp(3, 0), lerp(3, 1), lerp(3, 2))
      u.uSpec.value.set(lerp(4, 0), lerp(4, 1), lerp(4, 2))
    }
  })

  const bgA = useMemo(() => [0, 0, 0], [])
  const bgB = useMemo(() => [0, 0, 0], [])
  const colors = useMemo(
    () => (): [number[], number[]] => {
      const k = mix.get()
      for (let j = 0; j < 3; j++) {
        bgA[j] = from.current[5][j] + (to.current[5][j] - from.current[5][j]) * k
        bgB[j] = from.current[6][j] + (to.current[6][j] - from.current[6][j]) * k
      }
      return [bgA, bgB]
    },
    [mix, from, to, bgA, bgB],
  )

  const s = mobile ? 0.72 : 1
  return (
    <>
    <Backdrop colors={colors} />
    <group ref={group} position={mobile ? [0.1, 1.05, 0] : [1.7, -0.15, 0]} rotation={[0.18, -0.25, mobile ? 0.95 : 0.56]} scale={s}>
      {RIBBONS.map((r, i) => (
        <Ribbon key={i} cfg={r} geo={geo} uniRef={setters[i]} />
      ))}
    </group>
    </>
  )
}

const toArr = (p: Palette) => [...p.c.map(hexToRgb), hexToRgb(p.back), hexToRgb(p.spec), hexToRgb(p.bg), hexToRgb(p.dot)]

export default function SilkRibbons() {
  const [idx, setIdx] = useState(0)
  const mix = useMotionValue(1)
  const from = useRef<number[][]>(toArr(PALETTES[0]))
  const to = useRef<number[][]>(toArr(PALETTES[0]))
  const pointer = useRef(new THREE.Vector2(9, 9))
  const touched = useRef(false)

  useEffect(() => {
    const k = mix.get()
    from.current = from.current.map((c, i) => c.map((v, j) => v + (to.current[i][j] - v) * k))
    to.current = toArr(PALETTES[idx])
    mix.set(0)
    const a = animate(mix, 1, { duration: 2.2, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [idx, mix])

  useEffect(() => {
    const id = setInterval(() => {
      if (!touched.current) setIdx((i) => (i + 1) % PALETTES.length)
    }, 8000)
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    const onLeave = () => pointer.current.set(9, 9)
    window.addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    return () => {
      clearInterval(id)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const pal = PALETTES[idx]

  return (
    <div className="stage" style={{ background: pal.bg }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 38 }} gl={{ antialias: true, alpha: false }}>
        <Scene mix={mix} from={from} to={to} pointer={pointer} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy sr-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
          style={{ ['--soft-bg' as string]: pal.bg }}
        >
          <span className="scrim" />
          <p className="kicker">
            <i style={{ background: pal.dot, transition: 'background 1.2s' }} /> Silk · {pal.en}
          </p>
          <h1>
            柔软的光
            <br />
            缓慢流过
          </h1>
          <p>四条丝带在 GPU 上沿噪声曲线翻卷，正反面分别着色，高光顺着纤维方向拉开。移动指针，它们会轻轻弯向你。</p>
          <div className="hero-actions">
            <button className="btn primary">预约体验</button>
            <button className="btn">了解工艺</button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={PALETTES.map((p, i) => ({ value: i, label: p.zh }))}
            value={idx}
            onChange={(v) => {
              touched.current = true
              setIdx(v)
            }}
          />
        </div>
        <p className="hint">移动指针 · 丝带随之弯曲</p>
      </div>
    </div>
  )
}

const css = `
.sr-copy h1 { font-weight: 500; letter-spacing: -0.03em; }
.sr-copy p:not(.kicker) { max-width: 400px; }
.sr-copy .scrim { opacity: .75 }
`
