import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ presets */

type Preset = {
  key: string
  zh: string
  en: string
  aside: string
  /** noise frequency, field speed, time evolution, 2nd octave, ring flow, drag */
  u: { freq: number; amp: number; evolve: number; oct2: number; ring: number; drag: number }
}

const PRESETS: Preset[] = [
  { key: 'soft', zh: '柔流', en: 'Soft Drift', aside: 'curl ψ · f 0.32', u: { freq: 0.32, amp: 0.9, evolve: 0.07, oct2: 0, ring: 0, drag: 1.6 } },
  { key: 'turb', zh: '湍流', en: 'Turbulence', aside: '2 octaves · f 0.6', u: { freq: 0.6, amp: 1.9, evolve: 0.2, oct2: 0.7, ring: 0, drag: 3.0 } },
  { key: 'ring', zh: '环流', en: 'Orbital Ring', aside: 'swirl + curl · r 2.3', u: { freq: 0.55, amp: 0.55, evolve: 0.12, oct2: 0.35, ring: 1, drag: 2.2 } },
]
type UKey = keyof Preset['u']
const UKEYS = Object.keys(PRESETS[0].u) as UKey[]

const MODES = [
  { value: 0, label: '吸引' },
  { value: 1, label: '排斥' },
  { value: 2, label: '旋涡' },
]

/* ------------------------------------------------------------------ GLSL */

const COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(3.5, 9.5, hash12(uv * 517.31 + 3.7)); }
`

// simplex noise with analytic gradient (Gustavson / Ashima, MIT)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v, out vec3 gradient) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;
  return 105.0 * dot(m4, pdotx);
}
// curl of a 3-component potential built from offset simplex fields: 3 noise taps
vec3 curl(vec3 p) {
  vec3 g1, g2, g3;
  snoise(p, g1);
  snoise(p + vec3(31.416, -47.853, 12.793), g2);
  snoise(p + vec3(-23.17, 19.31, 73.41), g3);
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
`

const VEL_FRAG = /* glsl */ `
uniform float uDt, uTime, uFreq, uAmp, uEvolve, uOct2, uRing, uDrag, uMaxR;
uniform vec3 uPointer, uModeW;
uniform float uPStrength;
${COMMON}
${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || dot(p.xyz, p.xyz) > uMaxR * uMaxR) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 pos = p.xyz;
  float te = uTime * uEvolve;
  vec3 q = pos * uFreq + vec3(te * 0.7, -te * 0.45, te);
  vec3 field = curl(q) * uAmp * 0.22;
  if (uOct2 > 0.001) field += curl(q * 2.37 + vec3(17.0, 4.0, -9.0) - te * 0.8) * uAmp * uOct2 * 0.12;

  // orbital ring around the view axis (z), pulled toward radius 2.9 and z = 0
  vec2 xy = pos.xy;
  float rr = length(xy) + 1e-4;
  vec2 rad = xy / rr;
  vec3 ringV = vec3(-rad.y, rad.x, 0.0) * (1.5 + 1.0 / (0.6 + rr)) + vec3(rad * (2.3 - rr) * 1.7, -pos.z * 1.6);
  field = mix(field, field * 0.6 + ringV, uRing);

  // soft containment so the cloud keeps its silhouette
  float d = length(pos);
  field -= pos / (d + 1e-4) * smoothstep(3.4, 5.6, d) * 1.8;

  // relax toward the field velocity (streamlines) ...
  vec3 nv = mix(field, v.xyz, exp(-uDrag * uDt));

  // ... and add the pointer source
  vec3 dp = uPointer - pos;
  float r2 = dot(dp, dp);
  float r = sqrt(r2) + 1e-3;
  vec3 dir = dp / r;
  float fall = 1.0 / (1.0 + r2 * 0.55);
  // soft core: the pull fades inside r ~ 0.6 so particles slingshot through instead of piling up
  float core = smoothstep(0.0, 0.9, r);
  vec3 attract = (dir * core + cross(vec3(0.0, 0.0, 1.0), dir) * 0.45) * fall * 9.0;
  vec3 repel = -dir * exp(-r2 * 0.35) * 26.0;
  vec3 swirl = (cross(vec3(0.0, 0.0, 1.0), dir) * 1.0 + dir * 0.35) * fall * 18.0;
  nv += (uModeW.x * attract + uModeW.y * repel + uModeW.z * swirl) * uPStrength * uDt;

  float sp = length(nv);
  if (sp > 9.0) nv *= 9.0 / sp;
  gl_FragColor = vec4(nv, 0.0);
}
`

const POS_FRAG = /* glsl */ `
uniform float uDt, uTime, uMaxR;
${COMMON}
vec3 spawn(vec2 uv) {
  float a = hash12(uv * 913.1 + uTime * 1.31);
  float b = hash12(uv * 271.7 - uTime * 0.77 + 5.1);
  float c = hash12(uv * 631.9 + uTime * 0.53 + 9.3);
  float th = a * 6.2831853;
  float ph = acos(2.0 * b - 1.0);
  float r = 3.3 * pow(c, 0.5);
  return vec3(sin(ph) * cos(th) * 1.25, sin(ph) * sin(th) * 0.85, cos(ph) * 0.9) * r;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || dot(p.xyz, p.xyz) > uMaxR * uMaxR) {
    gl_FragColor = vec4(spawn(uv), 0.0);
    return;
  }
  gl_FragColor = vec4(p.xyz + v.xyz * uDt, p.w + uDt);
}
`

const POINT_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize, uPR, uMaxSpeed;
varying vec3 vCol;
varying float vA;
${COMMON}
vec3 pal(float t) {
  vec3 c0 = vec3(0.30, 0.07, 0.34);
  vec3 c1 = vec3(0.78, 0.16, 0.38);
  vec3 c2 = vec3(1.00, 0.46, 0.17);
  vec3 c3 = vec3(1.00, 0.90, 0.74);
  t *= 3.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  return mix(c2, c3, t - 2.0);
}
void main() {
  vec2 uv = position.xy;
  vec4 p = texture2D(tPos, uv);
  vec4 v = texture2D(tVel, uv);
  float t = clamp(length(v.xyz) / uMaxSpeed, 0.0, 1.0);
  t = smoothstep(0.0, 1.0, pow(t, 0.75));
  vCol = pal(t);
  float life = lifeOf(uv);
  vA = smoothstep(0.0, 0.7, p.w) * (1.0 - smoothstep(life - 1.4, life, p.w));
  vA *= 0.45 + 0.55 * t;
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.8 + 0.7 * t) * (9.0 / -mv.z);
}
`

const POINT_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(vCol, vA * uAlpha * (1.0 - d * 2.4));
}
`

const RING_FRAG = /* glsl */ `
uniform float uTime, uMode, uOpacity;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float ang = atan(c.y, c.x) / 6.2831853 + 0.5;
  // attract: rings collapse inward, repel: expand outward, vortex: rotating dashes
  float wave = uMode < 0.5 ? fract(r * 1.6 + uTime * 0.9) : fract(r * 1.6 - uTime * 0.9);
  float rings = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.08, 0.16, wave));
  float dash = step(0.5, fract(ang * 18.0 + uTime * 0.6)) * smoothstep(0.86, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float a = uMode > 1.5 ? dash : rings * (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.1, 0.3, r);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.62), a * uOpacity);
}
`
const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

/* ------------------------------------------------------------------ sim */

type Uniforms = Record<UKey, MotionValue<number>>

function Flow({ size, u, modeW, mode, lastMove }: { size: number; u: Uniforms; modeW: MotionValue<number>[]; mode: number; lastMove: React.MutableRefObject<number> }) {
  const gl = useThree((s) => s.gl)
  const dpr = useThree((s) => s.viewport.dpr)

  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(size, size, gl)
    if (!gl.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType)
    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    const pa = pos0.image.data as Float32Array
    for (let i = 0; i < pa.length; i += 4) {
      // start in a soft ellipsoid, with randomised ages so respawns never sync
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r = 3.3 * Math.sqrt(Math.random())
      pa[i] = Math.sin(ph) * Math.cos(th) * r * 1.25
      pa[i + 1] = Math.sin(ph) * Math.sin(th) * r * 0.85
      pa[i + 2] = Math.cos(ph) * r * 0.9
      pa[i + 3] = Math.random() * 3.5
    }
    const velVar = gpu.addVariable('textureVelocity', VEL_FRAG, vel0)
    const posVar = gpu.addVariable('texturePosition', POS_FRAG, pos0)
    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])
    Object.assign(velVar.material.uniforms, {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uFreq: { value: 0.3 },
      uAmp: { value: 1 },
      uEvolve: { value: 0.1 },
      uOct2: { value: 0 },
      uRing: { value: 0 },
      uDrag: { value: 2 },
      uMaxR: { value: 7.5 },
      uPointer: { value: new THREE.Vector3(99, 99, 0) },
      uModeW: { value: new THREE.Vector3(1, 0, 0) },
      uPStrength: { value: 0 },
    })
    Object.assign(posVar.material.uniforms, { uDt: { value: 0 }, uTime: { value: 0 }, uMaxR: { value: 7.5 } })
    const err = gpu.init()
    if (err) console.error(err)
    return { gpu, velVar, posVar }
  }, [gl, size])
  useEffect(() => () => sim.gpu.dispose(), [sim])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const ref = new Float32Array(size * size * 3)
    for (let i = 0; i < size * size; i++) {
      ref[i * 3] = ((i % size) + 0.5) / size
      ref[i * 3 + 1] = (Math.floor(i / size) + 0.5) / size
    }
    g.setAttribute('position', new THREE.BufferAttribute(ref, 3))
    return g
  }, [size])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        uniforms: {
          tPos: { value: null },
          tVel: { value: null },
          uSize: { value: size > 300 ? 1.6 : 3.4 },
          uPR: { value: 1 },
          uMaxSpeed: { value: 2.6 },
          uAlpha: { value: size > 300 ? 0.42 : 0.58 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [size],
  )

  const ringMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        uniforms: { uTime: { value: 0 }, uMode: { value: 0 }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  const ring = useRef<THREE.Mesh>(null)

  const tmp = useMemo(
    () => ({ ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit: new THREE.Vector3(), target: new THREE.Vector3(), cur: new THREE.Vector3(0, 0, 0), strength: 0, time: 0 }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    tmp.time += dt
    const t = tmp.time
    const vu = sim.velVar.material.uniforms
    const pu = sim.posVar.material.uniforms

    // camera sways slowly for parallax
    const cam = state.camera
    const aspect = state.size.width / state.size.height
    cam.position.set(Math.sin(t * 0.07) * 1.6, Math.sin(t * 0.05) * 0.6, 9.5 / Math.min(1, aspect * 1.25))
    cam.lookAt(0, 0, 0)

    // pointer → plane z = 0; idle → the source wanders on a Lissajous path
    const active = performance.now() - lastMove.current < 2600
    if (active) {
      tmp.ray.setFromCamera(state.pointer, cam)
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) tmp.target.copy(tmp.hit)
    } else {
      tmp.target.set(Math.sin(t * 0.29) * 3.1, Math.sin(t * 0.43 + 1.2) * 1.7, 0)
    }
    const k = 1 - Math.exp(-dt * (active ? 14 : 2))
    tmp.cur.lerp(tmp.target, k)
    tmp.strength = THREE.MathUtils.damp(tmp.strength, active ? 1 : 0.4, 3, dt)

    vu.uDt.value = dt
    vu.uTime.value = t
    for (const key of UKEYS) {
      const name = ('u' + key[0].toUpperCase() + key.slice(1)) as 'uFreq'
      vu[name].value = u[key].get()
    }
    ;(vu.uPointer.value as THREE.Vector3).copy(tmp.cur)
    ;(vu.uModeW.value as THREE.Vector3).set(modeW[0].get(), modeW[1].get(), modeW[2].get())
    vu.uPStrength.value = tmp.strength
    pu.uDt.value = dt
    pu.uTime.value = t
    sim.gpu.compute()

    mat.uniforms.tPos.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    mat.uniforms.tVel.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
    mat.uniforms.uPR.value = dpr

    if (ring.current) {
      ring.current.position.copy(tmp.cur)
      ring.current.quaternion.copy(cam.quaternion)
      ringMat.uniforms.uTime.value = t
      ringMat.uniforms.uMode.value = mode
      ringMat.uniforms.uOpacity.value = THREE.MathUtils.damp(ringMat.uniforms.uOpacity.value, active ? 0.55 : 0.18, 4, dt)
    }
  })

  return (
    <>
      <points geometry={geo} material={mat} frustumCulled={false} />
      <mesh ref={ring} material={ringMat} renderOrder={2}>
        <planeGeometry args={[1.5, 1.5]} />
      </mesh>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function FlowField() {
  const phone = useMemo(() => typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760, [])
  const size = phone ? 256 : 512
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const [mode, setMode] = useState(0)
  const lastMove = useRef(-1e9)

  const mvFreq = useMotionValue(PRESETS[0].u.freq)
  const mvAmp = useMotionValue(PRESETS[0].u.amp)
  const mvEvolve = useMotionValue(PRESETS[0].u.evolve)
  const mvOct2 = useMotionValue(PRESETS[0].u.oct2)
  const mvRing = useMotionValue(PRESETS[0].u.ring)
  const mvDrag = useMotionValue(PRESETS[0].u.drag)
  const u: Uniforms = useMemo(() => ({ freq: mvFreq, amp: mvAmp, evolve: mvEvolve, oct2: mvOct2, ring: mvRing, drag: mvDrag }), [mvFreq, mvAmp, mvEvolve, mvOct2, mvRing, mvDrag])
  const w0 = useMotionValue(1)
  const w1 = useMotionValue(0)
  const w2 = useMotionValue(0)
  const modeW = useMemo(() => [w0, w1, w2], [w0, w1, w2])

  useEffect(() => {
    const p = PRESETS[idx].u
    const ctrls = UKEYS.map((k) => animate(u[k], p[k], { duration: 2.2, ease: [0.45, 0, 0.2, 1] }))
    return () => ctrls.forEach((c) => c.stop())
  }, [idx, u])

  useEffect(() => {
    const ctrls = modeW.map((w, i) => animate(w, i === mode ? 1 : 0, { duration: 0.7, ease: [0.23, 1, 0.32, 1] }))
    return () => ctrls.forEach((c) => c.stop())
  }, [mode, modeW])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % PRESETS.length), 9000)
    return () => clearInterval(id)
  }, [auto])

  const preset = PRESETS[idx]

  return (
    <div
      className="stage"
      style={{ background: 'radial-gradient(80% 70% at 55% 45%, #1a0f1f 0%, #0b0810 60%, #060509 100%)', touchAction: 'none' }}
      onPointerMove={() => (lastMove.current = performance.now())}
      onPointerDown={() => (lastMove.current = performance.now())}
    >
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 9.5], fov: 45 }} gl={{ antialias: false, alpha: true }}>
        <Flow size={size} u={u} modeW={modeW} mode={mode} lastMove={lastMove} />
      </Canvas>

      <div className="overlay">
        <BigLabel id={preset.key} meta={`${(size * size).toLocaleString()} particles · GPGPU`} title={preset.zh} sub={preset.en} aside={preset.aside} />
        <div className="dock">
          <Seg
            items={PRESETS.map((p, i) => ({ value: i, label: p.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <Seg items={MODES} value={mode} onChange={setMode} />
        </div>
        <p className="hint">
          移动指针牵引粒子
          <br />
          静置时引力源自动巡游
        </p>
      </div>
    </div>
  )
}
