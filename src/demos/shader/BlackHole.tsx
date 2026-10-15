import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { SIMPLEX_3D } from './glsl'

/*
 * 黑洞 — one full-screen fragment shader. Every pixel's light ray is integrated backwards from the camera
 * through a Schwarzschild-like field (units: r_s = 1) with the classic photon-orbit acceleration
 * a = -1.5·h²·r̂/r⁴ (h = |r × v| is conserved), so rays bend, wrap round the photon sphere or fall in.
 * Wherever a ray crosses the equatorial plane between r = 3 (ISCO) and the outer rim it picks up the
 * accretion disk: Keplerian-sheared noise rings, a blackbody temperature ramp, relativistic Doppler
 * beaming + gravitational redshift. Escaping rays sample a procedural star field / nebula by their FINAL
 * direction, so the sky is lensed too. A cheap in-march glow integral stands in for bloom.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const DEVICE_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
// the march is long; render below native and let the browser upscale (stars are drawn footprint-aware)
const BASE_DPR = MOBILE ? Math.min(DEVICE_DPR, 1.5) * 0.62 : DEVICE_DPR > 1.3 ? DEVICE_DPR * 0.6 : 0.9
const STEPS = MOBILE ? 150 : 220
const FOCAL = 1.65
const RIN = 3.0
const ROUT = 10.5

/* ------------------------------------------------------------------ shader */

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uZoom;
uniform float uTime;
uniform float uBright;
uniform float uFade;
uniform float uPix;
uniform vec3 uRo, uRt, uUp, uFw;

#define STEPS ${STEPS}
#define FOCAL ${FOCAL.toFixed(3)}
#define RIN ${RIN.toFixed(2)}
#define ROUT ${ROUT.toFixed(2)}
#define RESC 46.0

${SIMPLEX_3D}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// temperature ramp (t ≈ T / T_inner): deep red → orange → gold → white-hot → blue-white (linear rgb)
vec3 heat(float t) {
  vec3 c = mix(vec3(0.42, 0.03, 0.01), vec3(1.0, 0.22, 0.03), smoothstep(0.15, 0.45, t));
  c = mix(c, vec3(1.0, 0.56, 0.16), smoothstep(0.45, 0.72, t));
  c = mix(c, vec3(1.0, 0.86, 0.62), smoothstep(0.72, 0.98, t));
  c = mix(c, vec3(0.78, 0.86, 1.0), smoothstep(1.05, 1.5, t));
  return c;
}

/* ---- disk ---- */
float diskNoise(float ang, float lr, float seed) {
  vec3 q = vec3(cos(ang) * 1.25, sin(ang) * 1.25, lr * 6.5 + seed);
  float n = snoise(q) * 0.5;
  n += snoise(q * vec3(2.6, 2.6, 3.1) + 7.1) * 0.3;
  n += snoise(q * vec3(6.0, 6.0, 8.0) - 3.7) * 0.2;
  return n;
}

// emission (rgb) and opacity (a) where the ray crosses the plane; dir = traced direction (photon goes -dir)
vec4 diskAt(vec3 pc, vec3 dir) {
  float r = length(pc.xz);
  if (r < RIN - 0.35 || r > ROUT) return vec4(0.0);
  float th = atan(pc.z, pc.x);
  float om = 0.7071 * pow(r, -1.5);
  // Keplerian shear winds the noise up forever: run two phase-shifted copies and cross-fade (flow-map trick)
  const float P = 34.0;
  float a = fract(uTime / P);
  float wA = 1.0 - abs(2.0 * a - 1.0);
  float wB = 1.0 - wA;
  float lr = log(r);
  float nA = diskNoise(th - om * a * P, lr, 0.0);
  float nB = diskNoise(th - om * fract(a + 0.5) * P, lr, 19.7);
  float n = (nA * wA + nB * wB) * inversesqrt(wA * wA + wB * wB);

  float edgeIn = smoothstep(RIN - 0.35, RIN + 0.5, r);
  float edgeOut = 1.0 - smoothstep(ROUT * 0.5, ROUT, r);
  float rings = 0.82 + 0.18 * sin(lr * 30.0 + n * 5.0);
  float clump = smoothstep(-0.55, 0.6, n);
  float dens = edgeIn * edgeOut * (0.12 + 1.1 * clump * clump) * rings;

  // relativistic beaming: orbital speed (pseudo-Newtonian) against the photon's direction, + gravitational redshift
  float beta = sqrt(0.5 / max(r - 1.0, 0.6));
  vec3 vdir = vec3(-pc.z, 0.0, pc.x) / r;
  float mu = dot(vdir, -dir);
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * mu) * sqrt(1.0 - 1.0 / r);
  g = pow(g, 0.85);

  float prof = pow(r / RIN, -0.62);
  vec3 c = heat(prof * g);
  float I = prof * prof * pow(g, 3.0) * 1.5;
  // the hot inner rim gets a touch of extra fire
  I *= 1.0 + 1.4 * exp(-(r - RIN - 0.25) * (r - RIN - 0.25) * 6.0);
  float alpha = clamp(dens * 1.05, 0.0, 0.94);
  return vec4(c * I * dens * uBright, alpha);
}

/* ---- sky (sampled by the final, lensed direction) ---- */
vec3 starLayer(vec3 d, float scale, float keep, float gain) {
  vec3 q = d * scale;
  vec3 id = floor(q);
  vec3 h = hash33(id);
  if (h.z > keep) return vec3(0.0);
  vec3 sp = 0.22 + 0.56 * hash33(id + 17.31);
  vec3 dv = q - id - sp;
  float w0 = 0.04;
  float w = max(w0, uPix * scale * 0.75);
  float e = exp(-dot(dv, dv) / (w * w)) * (w0 * w0) / (w * w);
  float mag = pow(h.x, 7.0) * 7.0 + 0.18;
  vec3 tint = mix(vec3(1.0, 0.72, 0.5), vec3(0.62, 0.78, 1.0), smoothstep(0.2, 0.9, h.y));
  return tint * mag * e * gain;
}

vec3 sky(vec3 d) {
  vec3 bn = normalize(vec3(0.35, 1.0, -0.25));
  float bd = dot(d, bn);
  float band = exp(-bd * bd * 7.0);
  float n1 = snoise(d * 1.7 + vec3(3.0, 1.0, 0.0)) * 0.5 + 0.5;
  float n2 = snoise(d * 4.3 - vec3(1.0, 5.0, 2.0)) * 0.5 + 0.5;
  vec3 neb = vec3(0.32, 0.12, 0.5) * n1 * n1 * (0.18 + band * 0.7) + vec3(0.04, 0.2, 0.32) * pow(n2, 3.0) * (0.1 + band);
  neb *= 0.11;
  // dust lane: darker streaks inside the band
  neb *= 1.0 - band * 0.6 * smoothstep(0.45, 0.8, n2);
  vec3 s = starLayer(d, 80.0, 0.42, 1.0) + starLayer(d, 190.0, 0.55 * (0.45 + band), 0.6);
  return neb + s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv = (uv - uShift) / uZoom;
  vec3 rd = normalize(uFw * FOCAL + uv.x * uRt + uv.y * uUp);

  vec3 p = uRo;
  vec3 v = rd;
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);
  vec3 col = vec3(0.0);
  float Tr = 1.0;
  float glow = 0.0;
  float ring = 0.0;
  bool captured = false;
  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    if (r < 1.0) { captured = true; break; }
    if (r > RESC && dot(p, v) > 0.0) break;
    float dt = clamp(0.075 * r - 0.03, 0.035, 2.6);
    vec3 pp = p;
    v += (-1.5 * h2 / (r2 * r2 * r)) * p * dt;
    p += v * dt;
    float dl = dt * length(v);
    // bloom-ish halo around the disk and a thin photon-sphere ring, integrated along the bent ray
    float rr = length(p.xz);
    glow += Tr * dl * exp(-p.y * p.y * 3.0) * smoothstep(ROUT + 5.0, RIN, rr) * smoothstep(2.2, RIN + 0.8, rr) * step(2.4, r);
    float dr = (r - 1.5) * 9.0;
    ring += Tr * dl * exp(-dr * dr);
    if (pp.y * p.y < 0.0) {
      vec3 pc = mix(pp, p, pp.y / (pp.y - p.y));
      vec4 dk = diskAt(pc, normalize(v));
      col += Tr * dk.rgb;
      Tr *= 1.0 - dk.a;
      if (Tr < 0.01) break;
    }
  }
  if (!captured && Tr > 0.01) col += Tr * sky(normalize(v));
  // light from the halo that ends up in the hole would have to cross the shadow: keep the shadow inky
  col += vec3(1.0, 0.42, 0.12) * glow * (captured ? 0.006 : 0.024) * uBright;
  // photon ring: rays that skim the photon sphere. Captured rays that fall straight in only graze it briefly
  // (ring < ~1.5) and must stay black; near-critical ones that linger keep it, so the rim stays continuous.
  float rg = captured ? max(ring - 1.6, 0.0) : ring;
  col += vec3(1.0, 0.72, 0.45) * rg * 0.5 * uBright;

  // filmic-ish shoulder, then display gamma
  col = 1.0 - exp(-col * 1.15);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 sv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.6;
  col *= uFade;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ views */

type View = { key: string; zh: string; el: number; dist: number; note: string }
const VIEWS: View[] = [
  { key: 'side', zh: '侧视', el: 0.075, dist: 29, note: '倾角 4° · 盘的背面被抬成上下两道光弧' },
  { key: 'high', zh: '俯视', el: 0.46, dist: 29, note: '倾角 26° · 光弧压扁成一圈，阴影偏向一侧' },
  { key: 'face', zh: '正视', el: 1.28, dist: 31, note: '倾角 73° · 正对盘面，多普勒差异几乎消失' },
]
const RATES = [
  { v: 0.25, label: '0.25×' },
  { v: 1, label: '1×' },
  { v: 4, label: '4×' },
]

type Drag = { on: boolean; x: number; y: number; t: number; vAz: number; vEl: number; az: number }

/* ------------------------------------------------------------------ scene */

function Hole({
  el,
  dist,
  bright,
  rate,
  drag,
}: {
  el: ReturnType<typeof useMotionValue<number>>
  dist: ReturnType<typeof useMotionValue<number>>
  bright: ReturnType<typeof useSpring>
  rate: ReturnType<typeof useSpring>
  drag: React.RefObject<Drag>
}) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const uniforms = {
      uRes: { value: new THREE.Vector2() },
      uShift: { value: new THREE.Vector2() },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uBright: { value: 1 },
      uFade: { value: 0 },
      uPix: { value: 0.001 },
      uRo: { value: new THREE.Vector3() },
      uRt: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3() },
      uFw: { value: new THREE.Vector3() },
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false, toneMapped: false })
    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { uniforms, mat, geo, scene, cam }
  }, [])
  useEffect(
    () => () => {
      R.mat.dispose()
      R.geo.dispose()
    },
    [R],
  )

  // compile off the main thread against the screen target; draw nothing heavy until it is linked
  const ready = useRef(false)
  useEffect(() => {
    let alive = true
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(null)
    gl.compileAsync(R.scene, R.cam)
      .catch(() => {})
      .then(() => {
        if (alive) ready.current = true
      })
    gl.setRenderTarget(prev)
    return () => {
      alive = false
    }
  }, [R, gl])

  const st = useMemo(
    () => ({ t: POSTER ? 41 : 6, fade: 0, ro: new THREE.Vector3(), fw: new THREE.Vector3(), rt: new THREE.Vector3(), up: new THREE.Vector3(), tmp: new THREE.Vector3() }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    if (!ready.current) {
      gl.setRenderTarget(null)
      gl.setClearColor(0x020203, 1)
      gl.clear()
      return
    }
    const u = R.uniforms
    const d = drag.current

    /* orbit: slow auto drift + drag inertia */
    if (!d.on) {
      d.az += d.vAz * dt
      el.set(THREE.MathUtils.clamp(el.get() + d.vEl * dt, -1.35, 1.35))
      const k = Math.exp(-dt * 2.6)
      d.vAz *= k
      d.vEl *= k
    }
    d.az += dt * (POSTER ? 0 : 0.035)
    st.t += dt * (rate.get() as number) * 3.2
    st.fade = Math.min(1, st.fade + dt * 0.9)

    const e = el.get()
    const r = dist.get()
    st.ro.set(Math.cos(e) * Math.sin(d.az), Math.sin(e), Math.cos(e) * Math.cos(d.az)).multiplyScalar(r)
    st.fw.copy(st.ro).multiplyScalar(-1).normalize()
    st.rt.crossVectors(st.fw, THREE.Object3D.DEFAULT_UP).normalize()
    st.up.crossVectors(st.rt, st.fw)
    // a slight cinematic roll
    const roll = 0.1
    st.tmp.copy(st.rt).multiplyScalar(Math.cos(roll)).addScaledVector(st.up, Math.sin(roll))
    st.up.multiplyScalar(Math.cos(roll)).addScaledVector(st.rt, -Math.sin(roll))
    st.rt.copy(st.tmp)

    /* framing: hole right of the copy on desktop, high on phones, centred for the poster */
    gl.getDrawingBufferSize(u.uRes.value)
    const aspect = size.width / size.height
    const mobile = size.width < 760
    if (POSTER) {
      u.uShift.value.set(0, 0)
      u.uZoom.value = 1.08
    } else if (mobile) {
      u.uShift.value.set(0, 0.15)
      u.uZoom.value = Math.min(0.78, aspect * 1.55)
    } else {
      u.uShift.value.set(Math.min(0.17 * aspect, 0.33), 0.0)
      u.uZoom.value = 1.0
    }
    u.uPix.value = 1 / (u.uRes.value.y * FOCAL * u.uZoom.value)
    u.uRo.value.copy(st.ro)
    u.uFw.value.copy(st.fw)
    u.uRt.value.copy(st.rt)
    u.uUp.value.copy(st.up)
    u.uTime.value = st.t
    u.uBright.value = bright.get() as number
    u.uFade.value = st.fade * st.fade * (3 - 2 * st.fade)

    gl.setRenderTarget(null)
    gl.render(R.scene, R.cam)
  }, 1)

  return null
}

/* ------------------------------------------------------------------ page */

export default function BlackHole() {
  const [viewIdx, setViewIdx] = useState(0)
  const [rateIdx, setRateIdx] = useState(1)
  const [brightV, setBrightV] = useState(1)
  const [dpr, setDpr] = useState(BASE_DPR)

  const el = useMotionValue(VIEWS[0].el)
  const dist = useMotionValue(VIEWS[0].dist)
  const bright = useSpring(1, { stiffness: 60, damping: 18 })
  const rate = useSpring(1, { stiffness: 22, damping: 10 })
  const drag = useRef<Drag>({ on: false, x: 0, y: 0, t: 0, vAz: 0, vEl: 0, az: POSTER ? 0.6 : 0.35 })
  const anims = useRef<AnimationPlaybackControls[]>([])

  const pickView = (i: number) => {
    setViewIdx(i)
    anims.current.forEach((a) => a.stop())
    drag.current.vEl = 0
    anims.current = [
      animate(el, VIEWS[i].el, { type: 'spring', stiffness: 26, damping: 11, mass: 1.2 }),
      animate(dist, VIEWS[i].dist, { type: 'spring', stiffness: 26, damping: 12, mass: 1.2 }),
    ]
  }
  useEffect(() => () => anims.current.forEach((a) => a.stop()), [])
  useEffect(() => bright.set(brightV), [brightV, bright])
  useEffect(() => rate.set(RATES[rateIdx].v), [rateIdx, rate])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, button, input, a')) return
    const d = drag.current
    d.on = true
    d.x = e.clientX
    d.y = e.clientY
    d.t = performance.now()
    d.vAz = 0
    d.vEl = 0
    anims.current.forEach((a) => a.stop())
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d.on) return
    const now = performance.now()
    const dts = Math.max((now - d.t) / 1000, 1 / 240)
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    const k = 0.0055
    // move the camera directly while dragging; remember a smoothed velocity for the throw
    el.set(THREE.MathUtils.clamp(el.get() + dy * k, -1.35, 1.35))
    d.vAz = THREE.MathUtils.lerp(d.vAz, (-dx * k) / dts, 0.5)
    d.vEl = THREE.MathUtils.lerp(d.vEl, (dy * k) / dts, 0.5)
    d.az += -dx * k
    d.x = e.clientX
    d.y = e.clientY
    d.t = now
  }
  const onUp = () => {
    const d = drag.current
    if (!d.on) return
    d.on = false
    // a pause before release means no throw
    if (performance.now() - d.t > 90) {
      d.vAz = 0
      d.vEl = 0
    }
    d.vAz = THREE.MathUtils.clamp(d.vAz, -3, 3)
    d.vEl = THREE.MathUtils.clamp(d.vEl, -2, 2)
  }

  const V = VIEWS[viewIdx]

  return (
    <div
      className="stage bh"
      style={{ background: '#020203', touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={dpr} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} orthographic camera={{ position: [0, 0, 1] }}>
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(0.45, d * 0.8))}
          onIncline={() => setDpr((d) => Math.min(BASE_DPR, d * 1.15))}
          flipflops={3}
        />
        <Hole el={el} dist={dist} bright={bright} rate={rate} drag={drag} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy bh-copy"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Schwarzschild · Ray bending
          </p>
          <h1>事件视界</h1>
          <p className="bh-lede">每条光线都被引力弯折：吸积盘的背面被抬到黑洞头顶，迎面旋来的一侧更亮、更蓝。</p>
          <div className="bh-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={V.key}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                {V.note}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="dock bh-dock">
          <Seg items={VIEWS.map((v, i) => ({ value: i, label: v.zh }))} value={viewIdx} onChange={pickView} />
          <span className="dock-sep" />
          <label className="bh-range" title="吸积盘亮度">
            <span>亮度</span>
            <input
              type="range"
              min={0.3}
              max={2}
              step={0.01}
              value={brightV}
              onChange={(e) => setBrightV(Number(e.target.value))}
              style={{ ['--v' as string]: `${((brightV - 0.3) / 1.7) * 100}%` }}
            />
          </label>
          <span className="dock-sep bh-sep2" />
          <Seg items={RATES.map((r, i) => ({ value: i, label: r.label }))} value={rateIdx} onChange={setRateIdx} />
        </div>
        <p className="hint">
          拖动环绕 · 松手带惯性
          <br />
          r<sub>s</sub> = 1 · ≤ {STEPS} steps / ray
        </p>
      </div>
    </div>
  )
}

const css = `
.bh .bh-copy { --soft-bg: rgba(2, 2, 3, .78); }
.bh .kicker i { background: #ffb36b; box-shadow: 0 0 10px #ff9a4a; }
.bh .bh-copy h1 { font-size: clamp(40px, 5vw, 68px); }
.bh .bh-lede { max-width: 360px; font-size: 15px; }
.bh-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); }
.bh-meta span { display: inline-block; }
.bh-range { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px 0 8px; font: 500 13px/1 var(--sans); color: var(--fg-2); cursor: pointer; }
.bh-range input { -webkit-appearance: none; appearance: none; width: 92px; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.bh-range input::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, #ffb36b var(--v), rgba(255,255,255,.16) var(--v)); }
.bh-range input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff4e6; box-shadow: 0 0 0 3px rgba(255,179,107,.25), 0 0 12px rgba(255,160,80,.6); }
.bh-range input::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,.16); }
.bh-range input::-moz-range-progress { height: 4px; border-radius: 4px; background: #ffb36b; }
.bh-range input::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #fff4e6; }
.bh canvas { cursor: grab; }
.bh canvas:active { cursor: grabbing; }
@media (max-width: 760px) {
  .bh .bh-copy { bottom: 136px; }
  .bh .bh-lede { font-size: 13.5px; }
  .bh-meta { display: none; }
  .bh-dock { flex-wrap: wrap; justify-content: center; row-gap: 2px; border-radius: 22px; width: max-content; }
  .bh-dock .seg { padding: 0 11px; }
  .bh-sep2 { display: none; }
}
`
