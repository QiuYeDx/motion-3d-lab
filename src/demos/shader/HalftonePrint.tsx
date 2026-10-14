import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { SIMPLEX_3D } from './glsl'

/*
 * 半调印刷 — the 3D scene is rendered into an off-screen target (with mipmaps), then a full-screen pass
 * "prints" it: per-ink separation, rotated AM dot screens evaluated in DEVICE pixels (so dots stay
 * razor-sharp at DPR 2), subtractive (multiplicative) ink mixing on a procedural paper, ragged dot
 * edges, ink mottle, and per-plate misregistration. Mode changes wipe across the sheet like a new
 * pull through the press.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const FBO_SCALE = 0.5 // the scene only needs to resolve down to dot-cell size

type Mode = { key: string; zh: string; short: string; spec: string; inks: { name: string; hex: string }[]; paper: string }
const MODES: Mode[] = [
  {
    key: 'cmyk',
    zh: 'CMYK 半调',
    short: 'CMYK',
    spec: 'C 15° · M 75° · Y 0° · K 45°',
    inks: [
      { name: 'C', hex: '#00a0e0' },
      { name: 'M', hex: '#e8007f' },
      { name: 'Y', hex: '#ffe500' },
      { name: 'K', hex: '#231f20' },
    ],
    paper: '#f6f2e8',
  },
  {
    key: 'riso',
    zh: 'Riso 双色',
    short: 'Riso',
    spec: 'Fluo Pink 75° · Blue 15°',
    inks: [
      { name: 'P', hex: '#ff48b0' },
      { name: 'B', hex: '#0078bf' },
    ],
    paper: '#f3ede0',
  },
  {
    key: 'mono',
    zh: '网点单色',
    short: '单色',
    spec: 'K 45° · Newsprint',
    inks: [{ name: 'K', hex: '#1c1b1a' }],
    paper: '#e8e1cf',
  },
]
const DOTS = [
  { zh: '细', css: 5 },
  { zh: '中', css: 8 },
  { zh: '粗', css: 13 },
]

/* ------------------------------------------------------------------ print shader */

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const PRINT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;      // drawing-buffer size (device px)
uniform float uDpr;
uniform float uCell;    // dot cell, CSS px
uniform float uFbo;     // scene target scale
uniform float uMis;     // misregistration amount 0..1
uniform float uTime;
uniform float uWipe;
uniform int uModeA;
uniform int uModeB;

${SIMPLEX_3D}

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 sceneAt(vec2 p, float cell) {
  float lod = log2(max(cell * uFbo, 1.0)) - 0.6;
  vec3 c = textureLod(tScene, p / uRes, lod).rgb;
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

// AM screen with a cosine spot: round dots → checkerboard at 50% → round holes. p, cell in device px.
float screen(vec2 p, float ang, float cell, float v, float rough) {
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, s, -s, c) * p / cell;
  float spot = 0.5 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  v = clamp(v, 0.0, 1.0);
  v = v + 0.78 * v * (1.0 - v) * (1.0 - 2.0 * v); // spot area → tone
  v = v + 0.07 * v * (1.0 - v);                    // dot gain
  float w = fwidth(spot) * 0.7;
  // threshold runs from just above the spot's peak (no ink) to just below its trough (solid)
  float T = mix(1.0 + 1.3 * w, -1.0 - 1.3 * w, v) + rough * min(1.0, v * 10.0) * min(1.0, (1.0 - v) * 10.0);
  return smoothstep(T - w, T + w, spot);
}

// ragged dot edges: ink wicks into the fibres (CSS-px scale so it looks the same at any DPR)
float roughAt(vec2 cp, float seed) {
  return (snoise(vec3(cp * 0.55, seed)) * 0.55 + snoise(vec3(cp * 2.3, seed + 11.0)) * 0.4) * 0.17;
}

vec3 paperAt(vec2 cp, vec3 base) {
  float blotch = snoise(vec3(cp * 0.0028, 9.0));
  float c1 = cos(0.35), s1 = sin(0.35);
  float c2 = cos(-1.2), s2 = sin(-1.2);
  vec2 r1 = mat2(c1, s1, -s1, c1) * cp;
  vec2 r2 = mat2(c2, s2, -s2, c2) * cp;
  float f1 = smoothstep(0.62, 0.95, snoise(vec3(r1 * vec2(0.012, 0.21), 1.0)));
  float f2 = smoothstep(0.66, 0.97, snoise(vec3(r2 * vec2(0.016, 0.24), 5.0)));
  float f3 = smoothstep(0.7, 0.98, snoise(vec3(r1 * vec2(0.03, 0.4), 7.0)));
  float grain = hash12(floor(cp)) - 0.5;
  vec3 c = base * (1.0 - 0.028 * blotch - 0.022 * grain);
  c -= vec3(0.05, 0.05, 0.045) * (f1 * 0.6 + f2 * 0.45);
  c += vec3(0.03) * f3;
  return c;
}

float mottle(vec2 cp, float seed) { return 0.86 + 0.14 * (snoise(vec3(cp * 0.018, seed)) * 0.5 + 0.5); }

vec2 drift(float i) {
  return vec2(sin(uTime * 0.7 + i * 2.1), cos(uTime * 0.55 + i * 1.3)) * 0.9;
}

vec3 printCMYK(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr;
  float m = uMis * uDpr * (0.6 + uCell / 16.0);
  vec2 oC = (vec2(2.6, -1.6) + drift(0.0)) * m;
  vec2 oM = (vec2(-2.1, 2.4) + drift(1.0)) * m;
  vec2 oY = (vec2(3.2, 2.8) + drift(2.0)) * m;
  vec3 sC = sceneAt(p - oC, cell);
  vec3 sM = sceneAt(p - oM, cell);
  vec3 sY = sceneAt(p - oY, cell);
  vec3 sK = sceneAt(p, cell);
  // separation with a little grey-component replacement
  float c = 1.0 - sC.r, mg = 1.0 - sM.g, y = 1.0 - sY.b;
  vec3 kq = 1.0 - sK;
  float kmin = min(kq.r, min(kq.g, kq.b));
  float k = smoothstep(0.3, 0.92, kmin) * kmin;
  c = max(c - k * 0.75, 0.0);
  mg = max(mg - k * 0.75, 0.0);
  y = max(y - k * 0.75, 0.0);
  float dC = screen(p - oC, radians(15.0), cell, c, roughAt(cp, 1.0)) * mottle(cp, 1.0);
  float dM = screen(p - oM, radians(75.0), cell, mg, roughAt(cp, 2.0)) * mottle(cp, 2.0);
  float dY = screen(p - oY, 0.0, cell, y, roughAt(cp, 3.0)) * mottle(cp, 3.0);
  float dK = screen(p, radians(45.0), cell, k, roughAt(cp, 4.0)) * mottle(cp, 4.0);
  vec3 col = paperAt(cp, vec3(0.965, 0.95, 0.91));
  col *= mix(vec3(1.0), vec3(0.0, 0.63, 0.88), dC);
  col *= mix(vec3(1.0), vec3(0.91, 0.0, 0.5), dM);
  col *= mix(vec3(1.0), vec3(1.0, 0.9, 0.0), dY);
  col *= mix(vec3(1.0), vec3(0.14, 0.12, 0.13), dK);
  return col;
}

vec2 risoSep(vec3 c) {
  // least-squares fit of the colour's optical density with the two inks' densities
  vec3 P = vec3(1.0, 0.28, 0.69);
  vec3 B = vec3(0.0, 0.47, 0.75);
  vec3 dP = -log(max(P, 0.04));
  vec3 dB = -log(max(B, 0.04));
  vec3 D = -log(max(c, 0.04));
  float a11 = dot(dP, dP), a12 = dot(dP, dB), a22 = dot(dB, dB);
  float det = a11 * a22 - a12 * a12;
  float a = (a22 * dot(dP, D) - a12 * dot(dB, D)) / det;
  float b = (a11 * dot(dB, D) - a12 * dot(dP, D)) / det;
  return clamp(vec2(a, b), 0.0, 1.0);
}

vec3 printRiso(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.1;
  float m = uDpr * (0.6 + uCell / 16.0);
  // a riso drum is never quite square: a baseline offset, plus the misregistration control
  vec2 oP = (vec2(1.2, -0.8) * 0.6 + (vec2(-3.2, 2.2) + drift(5.0)) * uMis) * m;
  vec2 oB = (vec2(-0.8, 0.6) * 0.6 + (vec2(2.6, -2.6) + drift(6.0)) * uMis) * m;
  float a = risoSep(sceneAt(p - oP, cell)).x;
  float b = risoSep(sceneAt(p - oB, cell)).y;
  float grain = hash12(floor(p / max(uDpr * 0.75, 1.0)));
  float dP = screen(p - oP, radians(75.0), cell, a * 1.05, roughAt(cp, 6.0) * 1.4) * (0.78 + 0.22 * grain) * mottle(cp, 6.0);
  float dB = screen(p - oB, radians(15.0), cell, b, roughAt(cp, 7.0) * 1.4) * (0.78 + 0.22 * hash12(floor(p / max(uDpr * 0.75, 1.0)) + 9.7)) * mottle(cp, 7.0);
  vec3 col = paperAt(cp, vec3(0.953, 0.93, 0.878));
  col *= mix(vec3(1.0), vec3(1.0, 0.28, 0.69), dP * 0.95);
  col *= mix(vec3(1.0), vec3(0.0, 0.47, 0.75), dB * 0.92);
  return col;
}

vec3 printMono(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.05;
  vec3 c = sceneAt(p, cell);
  float v = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
  v = smoothstep(0.1, 0.9, v); // newsprint: light tints drop out, shadows plug up
  float d = screen(p, radians(45.0), cell, v, roughAt(cp, 8.0) * 1.2) * mottle(cp, 8.0);
  vec3 col = paperAt(cp, vec3(0.91, 0.882, 0.812));
  col *= mix(vec3(1.0), vec3(0.11, 0.105, 0.1), d);
  return col;
}

vec3 printMode(int mode, vec2 p) {
  if (mode == 0) return printCMYK(p);
  if (mode == 1) return printRiso(p);
  return printMono(p);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float e = (p.x / uRes.x) * 0.82 + (1.0 - p.y / uRes.y) * 0.18;
  float side = smoothstep(uWipe - 0.002, uWipe + 0.002, e); // 1 = old sheet
  vec3 col = vec3(0.0);
  if (side > 0.0) col += printMode(uModeA, p) * side;
  if (side < 1.0) col += printMode(uModeB, p) * (1.0 - side);
  // the squeegee: a soft shadow line riding the wipe edge
  if (uWipe > 0.0 && uWipe < 1.0) col *= 1.0 - 0.14 * exp(-abs(e - uWipe) * 260.0);
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ scene + press */

type Drive = {
  rx: MotionValue<number>
  ry: MotionValue<number>
  cell: MotionValue<number>
  mis: MotionValue<number>
  wipe: MotionValue<number>
  modes: React.RefObject<{ a: number; b: number }>
}

function Press({ rx, ry, cell, mis, wipe, modes }: Drive) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)

  const R = useMemo(() => {
    const fbo = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    })
    const mat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT,
      fragmentShader: PRINT_FRAG,
      uniforms: {
        tScene: { value: fbo.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uDpr: { value: 1 },
        uCell: { value: 8 },
        uFbo: { value: FBO_SCALE },
        uMis: { value: 0 },
        uTime: { value: 0 },
        uWipe: { value: 0 },
        uModeA: { value: 0 },
        uModeB: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false
    const post = new THREE.Scene()
    post.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { fbo, mat, geo, post, cam, buf: new THREE.Vector2() }
  }, [])
  useEffect(
    () => () => {
      R.fbo.dispose()
      R.mat.dispose()
      R.geo.dispose()
    },
    [R],
  )

  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const st = useRef({ t: 0, auto: POSTER ? -0.4 : 0 })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    s.t += dt
    s.auto += dt * 0.22

    /* layout: object right of the copy on desktop, high on phones, centred for the poster */
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = mobile ? Math.min(0.92, vw / 5.6) : Math.min(1, vh / 6.2)
      rig.current.scale.setScalar(POSTER ? k * 1.2 : k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.17, POSTER ? 0 : mobile ? vh * 0.13 : 0, 0)
    }
    if (spin.current) {
      spin.current.rotation.set(rx.get() + Math.sin(s.t * 0.3) * 0.06, s.auto + ry.get(), 0)
    }

    /* 1 · scene → off-screen target */
    gl.getDrawingBufferSize(R.buf)
    const w = Math.max(2, Math.round(R.buf.x * FBO_SCALE))
    const h = Math.max(2, Math.round(R.buf.y * FBO_SCALE))
    if (R.fbo.width !== w || R.fbo.height !== h) R.fbo.setSize(w, h)
    gl.setRenderTarget(R.fbo)
    gl.setClearColor(0xffffff, 1)
    gl.clear(true, true, false)
    gl.render(scene, camera)

    /* 2 · print pass → screen */
    const u = R.mat.uniforms
    u.uRes.value.copy(R.buf)
    u.uDpr.value = gl.getPixelRatio()
    u.uCell.value = cell.get()
    u.uMis.value = mis.get()
    u.uTime.value = s.t
    u.uWipe.value = wipe.get()
    u.uModeA.value = modes.current.a
    u.uModeB.value = modes.current.b
    gl.setRenderTarget(null)
    gl.render(R.post, R.cam)
  }, 1)

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[-4.5, 5.5, 5]}
        intensity={3.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[5, -1, -4]} intensity={0.9} />
      <group ref={rig}>
        {/* a flat tint disc behind the object: prints as a light screen and catches the cast shadow */}
        <mesh position={[0.35, 0.15, -2.6]} receiveShadow>
          <circleGeometry args={[2.7, 96]} />
          <meshStandardMaterial color="#ffd9b8" roughness={1} />
        </mesh>
        <group ref={spin}>
          <mesh castShadow receiveShadow>
            <torusKnotGeometry args={[0.95, 0.32, 260, 36, 2, 3]} />
            <meshStandardMaterial color="#ff4a5a" roughness={0.38} />
          </mesh>
          <mesh position={[1.75, 1.05, 0.45]} castShadow receiveShadow>
            <sphereGeometry args={[0.5, 48, 32]} />
            <meshStandardMaterial color="#ffc21a" roughness={0.35} />
          </mesh>
          <mesh position={[-1.75, -1.0, 0.7]} rotation={[0.6, 0.7, 0.2]} castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshStandardMaterial color="#1f7fff" roughness={0.5} />
          </mesh>
          <mesh position={[-1.35, 1.35, -0.5]} rotation={[1.1, 0.3, 0]} castShadow receiveShadow>
            <torusGeometry args={[0.36, 0.12, 20, 48]} />
            <meshStandardMaterial color="#12b39a" roughness={0.4} />
          </mesh>
          <mesh position={[1.45, -1.25, -0.6]} rotation={[0.3, 0, -0.4]} castShadow receiveShadow>
            <coneGeometry args={[0.4, 0.85, 40]} />
            <meshStandardMaterial color="#6a3cff" roughness={0.45} />
          </mesh>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function HalftonePrint() {
  const [mode, setMode] = useState(0)
  const [dot, setDot] = useState(1)
  const [misOn, setMisOn] = useState(false)
  const [mobile] = useState(MOBILE)

  const rx = useMotionValue(0.18)
  const ry = useMotionValue(0)
  const cell = useMotionValue(DOTS[1].css)
  const mis = useMotionValue(0)
  const wipe = useMotionValue(0)
  const modes = useRef({ a: 0, b: 0 })
  const shadowX = useTransform(mis, (m) => `${(m * 4).toFixed(2)}px ${(m * 3).toFixed(2)}px 0 rgba(255, 72, 176, ${(0.15 + m * 0.7).toFixed(2)})`)

  // dot size eases, so the screen visibly grows / shrinks
  useEffect(() => {
    const a = animate(cell, DOTS[dot].css, { duration: 0.9, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [dot, cell])

  // misregistration: the plates slip with a little overshoot
  useEffect(() => {
    const a = animate(mis, misOn ? 1 : 0, { type: 'spring', stiffness: 120, damping: 9, mass: 1 })
    return () => a.stop()
  }, [misOn, mis])

  // mode change: the new print wipes across the old one
  useEffect(() => {
    const M = modes.current
    if (M.a === mode && M.b === mode) return
    if (wipe.get() > 0.5) M.a = M.b
    M.b = mode
    wipe.set(0)
    const a = animate(wipe, 1, {
      duration: 1.1,
      ease: [0.65, 0, 0.35, 1],
      onComplete: () => {
        M.a = M.b
        wipe.set(0)
      },
    })
    return () => a.stop()
  }, [mode, wipe])

  // drag to turn the object; let go and it coasts (Motion inertia)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(ry.get() + (e.clientX - d.x) * 0.009)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.006, -0.9, 0.9))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 600 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.4, timeConstant: 450, min: -0.9, max: 0.9, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const M = MODES[mode]
  const lpi = Math.round(96 / DOTS[dot].css)

  return (
    <div className="stage ht" style={{ background: M.paper, transition: 'background .8s' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0.5, 9], fov: 34 }}
      >
        <Press rx={rx} ry={ry} cell={cell} mis={mis} wipe={wipe} modes={modes} />
      </Canvas>

      <div className="overlay">
        <span className="ht-crop tl" />
        <span className="ht-crop tr" />
        <span className="ht-crop bl" />
        <span className="ht-crop br" />

        <div className="ht-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="ht-kicker">
              <b>PRINT STUDY</b>
              <span>
                {lpi} LPI · {M.short}
              </span>
            </p>
            <motion.h1 style={{ textShadow: shadowX }}>
              把 3D
              <br />
              印在纸上
            </motion.h1>
            <p className="ht-sub">每一帧先渲染进离屏缓冲，再按设备像素分色、加网：几块网屏各转一个角度，在纸面上相乘叠印。</p>
            <div className="ht-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={M.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                >
                  {M.inks.map((k) => (
                    <i key={k.name} style={{ background: k.hex }} />
                  ))}
                  {M.spec}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg items={MODES.map((m, i) => ({ value: i, label: mobile ? m.short : m.zh }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          <Seg items={DOTS.map((d, i) => ({ value: i, label: d.zh }))} value={dot} onChange={setDot} />
          <span className="dock-sep" />
          <button className="seg ht-toggle" aria-pressed={misOn} onClick={() => setMisOn((v) => !v)}>
            {misOn && <motion.span layoutId="ht-mis" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>
              <i />
              {mobile ? '错位' : '套印错位'}
            </span>
          </button>
        </div>
        <p className="hint">拖动转动物体 · 松手会惯性滑行</p>
      </div>
    </div>
  )
}

const css = `
.ht { cursor: grab; touch-action: none; }
.ht:active { cursor: grabbing; }
.ht canvas { display: block; }
.ht-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(440px, calc(100% - 48px)); pointer-events: none !important;
  color: #1d1c1a;
}
.ht-kicker {
  display: flex; align-items: center; gap: 10px; margin: 0 0 20px;
  font: 600 11px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: #1d1c1a;
}
.ht-kicker b { padding: 5px 7px 4px; background: #1d1c1a; color: #f6f2e8; font-weight: 600; }
.ht-kicker span { color: #57534c; }
.ht-copy h1 {
  margin: 0; font: 900 clamp(48px, 6.4vw, 92px)/.98 var(--display); letter-spacing: -.045em;
  color: #1d1c1a; mix-blend-mode: multiply;
}
.ht-sub { margin: 22px 0 0; max-width: 380px; font-size: 15px; line-height: 1.75; color: #57534c; }
.ht-spec { margin-top: 22px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .04em; color: #57534c; }
.ht-spec span { display: inline-flex; align-items: center; gap: 4px; }
.ht-spec i { width: 10px; height: 10px; mix-blend-mode: multiply; }
.ht-spec i:last-of-type { margin-right: 8px; }
.ht-toggle span { display: inline-flex; align-items: center; gap: 7px; }
.ht-toggle i {
  width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid currentColor; position: relative;
  transition: box-shadow .4s;
}
.ht-toggle[aria-pressed='true'] i { box-shadow: 2.5px 1.5px 0 -0.5px #ff48b0; }
.ht-crop { position: absolute; width: 22px; height: 22px; pointer-events: none !important; opacity: .55; }
.ht-crop::before, .ht-crop::after { content: ''; position: absolute; background: #1d1c1a; }
.ht-crop::before { width: 100%; height: 1px; }
.ht-crop::after { width: 1px; height: 100%; }
.ht-crop.tl { left: 20px; top: 76px; } .ht-crop.tl::before { top: 0 } .ht-crop.tl::after { left: 0 }
.ht-crop.tr { right: 20px; top: 76px; } .ht-crop.tr::before { top: 0 } .ht-crop.tr::after { right: 0 }
.ht-crop.bl { left: 20px; bottom: 20px; } .ht-crop.bl::before { bottom: 0 } .ht-crop.bl::after { left: 0 }
.ht-crop.br { right: 20px; bottom: 20px; } .ht-crop.br::before { bottom: 0 } .ht-crop.br::after { right: 0 }
@media (max-width: 760px) {
  .ht-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .ht-copy h1 { font-size: 44px; }
  .ht-sub { display: none; }
  .ht-spec { margin-top: 14px; }
  .ht-kicker { margin-bottom: 14px; }
  .ht .dock .seg { padding: 0 10px; }
}
`
