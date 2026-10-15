import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useSpring } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { hexToRgb } from './glsl'

/*
 * 体积云海 — three passes, all hand-rolled (no R3F scene graph):
 *  1. once: a tiling 64³ Perlin-Worley / Worley-fbm noise volume is rendered slice by slice into a 3D
 *     render target on the GPU (no CPU noise, nothing blocks the main thread);
 *  2. every frame, at ~0.5× resolution: a raymarch through a cloud slab between two altitudes —
 *     weather-map coverage, height profile, detail erosion; each sample marches a few steps toward the sun
 *     (Beer–Lambert + multi-scatter octaves + powder), dual-lobe Henyey-Greenstein phase for the silver
 *     lining, sky ambient, aerial perspective. Ray starts are jittered with interleaved-gradient (blue-ish)
 *     noise so the coarse steps read as fine grain, not banding;
 *  3. full resolution: bilinear upscale + screen-space crepuscular rays (radial march toward the sun over the
 *     "unoccluded sun" mask that pass 2 writes in alpha) + filmic tone map.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const DEVICE_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
const CANVAS_DPR = Math.min(DEVICE_DPR, MOBILE ? 1.25 : 1.5)
const BASE_SCALE = 0.5
const STEPS = MOBILE ? 46 : 64
const LSTEPS = MOBILE ? 4 : 5
const NS = MOBILE ? 20 : 28
const FOCAL = 1.2
const NOISE = 64

/* ------------------------------------------------------------------ shaders */

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const HASH = /* glsl */ `
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`

// one slice of the tiling noise volume per draw
const GEN_FRAG = /* glsl */ `
precision highp float;
uniform float uLayer;
#define N ${NOISE.toFixed(1)}
${HASH}
float worley(vec3 p, float per) {
  vec3 id = floor(p);
  vec3 f = p - id;
  float d = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 diff = o + hash33(mod(id + o, per)) - f;
    d = min(d, dot(diff, diff));
  }
  return sqrt(d);
}
float grad(vec3 i, vec3 f, vec3 o, float per) {
  vec3 g = normalize(hash33(mod(i + o, per) + 11.7) * 2.0 - 1.0);
  return dot(g, f - o);
}
float gnoise(vec3 p, float per) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = grad(i, f, vec3(0.0, 0.0, 0.0), per), b = grad(i, f, vec3(1.0, 0.0, 0.0), per);
  float c = grad(i, f, vec3(0.0, 1.0, 0.0), per), d = grad(i, f, vec3(1.0, 1.0, 0.0), per);
  float e = grad(i, f, vec3(0.0, 0.0, 1.0), per), g = grad(i, f, vec3(1.0, 0.0, 1.0), per);
  float h = grad(i, f, vec3(0.0, 1.0, 1.0), per), k = grad(i, f, vec3(1.0, 1.0, 1.0), per);
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
void main() {
  vec3 p = vec3(gl_FragCoord.xy, uLayer + 0.5) / N;
  float pf = 0.0, amp = 0.5, fr = 4.0;
  for (int o = 0; o < 4; o++) { pf += amp * gnoise(p * fr, fr); amp *= 0.5; fr *= 2.0; }
  pf = clamp(pf * 0.9 + 0.5, 0.0, 1.0);
  float w1 = 1.0 - worley(p * 4.0, 4.0);
  float w2 = 1.0 - worley(p * 8.0, 8.0);
  float w3 = 1.0 - worley(p * 16.0, 16.0);
  float w4 = 1.0 - worley(p * 32.0, 32.0);
  float wf = w1 * 0.625 + w2 * 0.25 + w3 * 0.125;
  // perlin-worley: billowy cells with perlin connectivity
  float pw = clamp((pf - (wf - 1.0)) / (2.0 - wf), 0.0, 1.0);
  float det = w2 * 0.625 + w3 * 0.25 + w4 * 0.125;
  float hi = w3 * 0.6 + w4 * 0.4;
  float lo = clamp(0.5 + 0.8 * (gnoise(p * 2.0, 2.0) * 0.65 + gnoise(p * 4.0, 4.0) * 0.35), 0.0, 1.0);
  gl_FragColor = vec4(pw, det, hi, lo);
}
`

const CLOUD_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform highp sampler3D uNoise;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uRo, uRt, uUp, uFw;
uniform vec3 uSun, uSunCol, uSkyTop, uSkyHor, uFogCol, uSea, uAmbTop, uAmbBot;
uniform float uCov, uFog;
uniform vec2 uWind;
uniform sampler2D tHist;
uniform float uHistW, uFrame;
uniform vec3 uPRo, uPRt, uPUp, uPFw;

#define YB 0.0
#define YT 2.4
#define STEPS ${STEPS}
#define LSTEPS ${LSTEPS}
#define FOCAL ${FOCAL.toFixed(3)}
#define FAR 42.0
#define DENS 26.0
${HASH}

float hgN(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }

float cloud(vec3 p, bool detail, bool near) {
  float h = (p.y - YB) / (YT - YB);
  if (h <= 0.0 || h >= 1.0) return 0.0;
  vec3 q = p;
  q.xz += uWind;
  // weather: low-frequency coverage + how tall the cells are allowed to grow
  float wc = textureLod(uNoise, vec3(q.xz * 0.012, 0.31), 0.0).a;
  float cov = clamp(uCov + (wc - 0.5) * 1.1, 0.0, 1.0);
  // a flat-ish sea of cells (tops ≈ 1 unit) with the odd cumulus tower where the weather map peaks
  float topH = mix(0.36, 1.0, smoothstep(0.58, 0.95, wc + uCov * 0.25));
  float prof = smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(topH * 0.35, topH, h));
  vec4 n = textureLod(uNoise, q * vec3(0.07, 0.09, 0.07), 0.0);
  float base = remap(n.r * prof, 1.0 - cov, 1.0, 0.0, 1.0);
  if (base <= 0.0) return 0.0;
  if (detail) {
    float dn = textureLod(uNoise, q * 0.3 + vec3(0.0, -uTime * 0.015, 0.0), 0.0).g;
    // wispy at the base, billowy at the top
    float m = mix(dn, 1.0 - dn, clamp(h * 6.0, 0.0, 1.0));
    base = remap(base, m * 0.38, 1.0, 0.0, 1.0);
  }
  if (near && base > 0.0) {
    // close to the camera: one more, finer erosion octave for crisp cauliflower edges
    float hn = textureLod(uNoise, q * 0.95 + vec3(uTime * 0.01, 0.0, 0.0), 0.0).b;
    base = remap(base, hn * 0.22, 1.0, 0.0, 1.0);
  }
  return clamp(base, 0.0, 1.0);
}

vec3 skyCol(vec3 rd, float cosT) {
  float y = max(rd.y, 0.0);
  vec3 c = mix(uSkyHor, uSkyTop, pow(smoothstep(0.0, 0.42, y), 0.55));
  c = mix(c, uFogCol, smoothstep(0.03, -0.06, rd.y));
  float cs = max(cosT, 0.0);
  c += uSunCol * (0.025 * cs * cs * cs + 0.06 * pow(cs, 24.0) + 0.3 * pow(cs, 600.0));
  c += uSunCol * smoothstep(0.99986, 0.99993, cosT) * 4.0;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uFw * FOCAL + uv.x * uRt + uv.y * uUp);
  vec3 ro = uRo;
  float cosT = dot(rd, uSun);
  // dual-lobe HG (forward silver lining + a little back-scatter), softened per multi-scatter octave
  float ph1 = mix(hgN(cosT, 0.62), hgN(cosT, -0.2), 0.25);
  float ph2 = mix(hgN(cosT, 0.31), hgN(cosT, -0.1), 0.25);
  float ph3 = mix(hgN(cosT, 0.15), hgN(cosT, -0.05), 0.25);
  float cs = max(cosT, 0.0);
  vec3 fogC = uFogCol + uSunCol * (0.04 * cs * cs + 0.08 * pow(cs, 12.0));

  float tn = 0.0, tf = -1.0;
  if (abs(rd.y) > 1e-4) {
    float ta = (YB - ro.y) / rd.y, tb = (YT - ro.y) / rd.y;
    tn = max(min(ta, tb), 0.0);
    tf = min(max(ta, tb), FAR);
  } else if (ro.y > YB && ro.y < YT) {
    tf = FAR;
  }

  vec3 col = vec3(0.0);
  float T = 1.0;
  float tW = 0.0;
  if (tf > tn) {
    float t = tn + ign(gl_FragCoord.xy + 5.588238 * uFrame) * (0.1 + tn * 0.055);
    for (int i = 0; i < STEPS; i++) {
      if (t > tf || T < 0.015) break;
      float dt = clamp(0.1 + t * 0.055, 0.1, 1.6);
      vec3 p = ro + rd * t;
      float d = cloud(p, t < 16.0, t < 5.0);
      if (d > 0.002) {
        float od = 0.0;
        float ls = 0.05;
        vec3 lp = p;
        for (int j = 0; j < LSTEPS; j++) {
          lp += uSun * ls;
          od += cloud(lp, false, false) * ls;
          ls *= 1.9;
        }
        od *= DENS;
        float sig = d * DENS;
        float h = clamp((p.y - YB) / (YT - YB), 0.0, 1.0);
        vec3 sunL = uSunCol * (exp(-od) * ph1 + 0.3 * exp(-od * 0.3) * ph2 + 0.12 * exp(-od * 0.1) * ph3);
        // powder: dark creases on the side facing away from the sun, none when looking into it
        float powder = 1.0 - exp(-sig * 0.9);
        sunL *= mix(powder, 1.0, 0.45 + 0.55 * cs);
        float hh = clamp((p.y - YB) / 1.2, 0.0, 1.0);
        vec3 amb = mix(uAmbBot, uAmbTop, hh * hh * (3.0 - 2.0 * hh)) * (0.34 + 0.3 * exp(-od * 0.2));
        vec3 S = (sunL + amb) * sig;
        S = mix(S, fogC * sig, 1.0 - exp(-t * uFog));
        float tr = exp(-sig * dt);
        col += T * (S - S * tr) / sig;
        tW += T * (1.0 - tr) * t;
        T *= tr;
      }
      t += dt;
    }
  }

  vec3 bg;
  if (rd.y < 0.0 && ro.y > -4.0) {
    // the sea far below the cloud layer, lost in haze toward the horizon
    float ts = (-4.0 - ro.y) / rd.y;
    bg = mix(uSea, fogC, 1.0 - exp(-ts * uFog * 0.75));
    bg = mix(bg, skyCol(rd, cosT), smoothstep(-0.06, 0.0, rd.y));
  } else {
    bg = skyCol(rd, cosT);
  }
  col += T * bg;

  // source for the screen-space light shafts: sky we can see that is close to the sun
  float src = T * smoothstep(-0.05, 0.01, rd.y) * (0.35 * pow(cs, 50.0) + 2.2 * pow(cs, 500.0));
  // silver-lined cloud edges near the sun also cast streaks
  src += max(dot(col, vec3(0.3, 0.5, 0.2)) - 1.1, 0.0) * 0.5 * pow(cs, 10.0);
  // temporal accumulation: reproject this pixel's (transmittance-weighted) cloud depth into last frame
  float cov = 1.0 - T;
  float tr = cov > 0.02 ? tW / cov : 1e4;
  vec3 wp = ro + rd * mix(1e4, tr, smoothstep(0.02, 0.5, cov));
  vec3 dp = wp - uPRo;
  float z = dot(dp, uPFw);
  if (z > 0.0 && uHistW > 0.0) {
    vec2 pv = vec2(dot(dp, uPRt), dot(dp, uPUp)) / z * FOCAL;
    vec2 puv = vec2(pv.x * uRes.y / uRes.x, pv.y) + 0.5;
    if (all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
      vec4 h = textureLod(tHist, puv, 0.0);
      col = mix(col, h.rgb, uHistW);
      src = mix(src, h.a, uHistW);
    }
  }
  gl_FragColor = vec4(col, src);
}
`

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform vec2 uRes;
uniform vec2 uSunUV;
uniform float uRays;
uniform vec3 uSunCol;
uniform float uFade;
#define NS ${NS}
${HASH}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // upscale with a small tent filter: hides the jittered-march grain of the half-res buffer
  vec2 tx = 0.75 / vec2(textureSize(tA, 0));
  vec3 col = textureLod(tA, uv, 0.0).rgb * 0.4;
  col += textureLod(tA, uv + vec2(tx.x, tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(-tx.x, tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(tx.x, -tx.y), 0.0).rgb * 0.15;
  col += textureLod(tA, uv + vec2(-tx.x, -tx.y), 0.0).rgb * 0.15;
  // crepuscular rays: march toward the (possibly off-screen) sun over the unoccluded-sun mask
  vec2 dv = uSunUV - uv;
  float len = length(dv);
  dv *= min(1.0, 0.7 / max(len, 1e-4));
  vec2 st = dv / float(NS);
  vec2 q = uv + st * ign(gl_FragCoord.xy);
  float acc = 0.0, w = 1.0, ws = 0.0;
  for (int i = 0; i < NS; i++) {
    acc += textureLod(tA, q, 0.0).a * w;
    ws += w;
    w *= 0.955;
    q += st;
  }
  acc /= ws;
  // keep the scattering local to the sun's neighbourhood so it reads as shafts, not as a global wash
  vec2 ds = (uv - uSunUV) * vec2(uRes.x / uRes.y, 1.0);
  col += uSunCol * acc * uRays * exp(-dot(ds, ds) * 3.0);
  col = aces(col * 0.9);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 sv = uv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.18;
  col += (ign(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uFade, uFade);
}
`

/* ------------------------------------------------------------------ presets */

const lin = (hex: string, k = 1) => hexToRgb(hex).map((c) => Math.pow(c, 2.2) * k)

type Tod = { key: string; zh: string; en: string; el: number; az: number; top: string; hor: string; fog: string; sea: string; ambTop: string; ambBot: string; sun: string; sunK: number; rays: number; dot: string }
const TODS: Tod[] = [
  { key: 'dawn', zh: '日出', en: 'Sunrise', el: 3.5, az: 22, top: '#5486dc', hor: '#ffc89c', fog: '#ebcdc6', sea: '#47588f', ambTop: '#879fdb', ambBot: '#5d5a8c', sun: '#ffb168', sunK: 3.8, rays: 0.6, dot: '#ff9f5a' },
  { key: 'noon', zh: '正午', en: 'Noon', el: 50, az: 40, top: '#4c8ae0', hor: '#d3e5f7', fog: '#dce8f4', sea: '#3f6299', ambTop: '#a9c3ec', ambBot: '#62799f', sun: '#fff3e2', sunK: 2.8, rays: 0.4, dot: '#f5c542' },
  { key: 'dusk', zh: '黄昏', en: 'Dusk', el: 2.5, az: 28, top: '#6670c2', hor: '#ffb08e', fog: '#e6b4ab', sea: '#3c3b6e', ambTop: '#958ccc', ambBot: '#574872', sun: '#ff9458', sunK: 3.5, rays: 0.7, dot: '#ff6f61' },
]
type TodVals = Record<'top' | 'hor' | 'fog' | 'sea' | 'ambTop' | 'ambBot' | 'sun' | 'ang', number[]>
const todVals = (t: Tod): TodVals => ({
  top: lin(t.top),
  hor: lin(t.hor),
  fog: lin(t.fog),
  sea: lin(t.sea),
  ambTop: lin(t.ambTop, 0.9),
  ambBot: lin(t.ambBot, 0.75),
  sun: lin(t.sun, t.sunK),
  ang: [THREE.MathUtils.degToRad(t.el), THREE.MathUtils.degToRad(t.az), t.rays],
})

const COVS = [
  { zh: '稀疏', v: 0.2 },
  { zh: '中等', v: 0.32 },
  { zh: '浓密', v: 0.46 },
]

/* ------------------------------------------------------------------ flight path */

const pathX = (s: number) => 2.6 * Math.sin(s * 0.041) + 1.2 * Math.sin(s * 0.093 + 1.3)
const pathDX = (s: number) => 2.6 * 0.041 * Math.cos(s * 0.041) + 1.2 * 0.093 * Math.cos(s * 0.093 + 1.3)
const pathY = (s: number) => 1.72 + 0.16 * Math.sin(s * 0.058 + 0.4) + 0.06 * Math.sin(s * 0.17 + 1.0)

/* ------------------------------------------------------------------ renderer */

function Sky({
  tod,
  cov,
  speed,
  px,
  py,
  scale,
}: {
  tod: React.RefObject<TodVals>
  cov: React.RefObject<number>
  speed: ReturnType<typeof useSpring>
  px: ReturnType<typeof useSpring>
  py: ReturnType<typeof useSpring>
  scale: React.RefObject<number>
}) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mk = (mat: THREE.ShaderMaterial) => {
      const m = new THREE.Mesh(geo, mat)
      m.frustumCulled = false
      const s = new THREE.Scene()
      s.add(m)
      return s
    }

    const vol = new THREE.WebGL3DRenderTarget(NOISE, NOISE, NOISE, { depthBuffer: false })
    const vt = vol.texture
    vt.wrapS = vt.wrapT = vt.wrapR = THREE.RepeatWrapping
    vt.minFilter = vt.magFilter = THREE.LinearFilter
    vt.generateMipmaps = false
    const genU = { uLayer: { value: 0 } }
    const genMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: GEN_FRAG, uniforms: genU, depthTest: false, depthWrite: false, toneMapped: false })

    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    const fbo = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    const fbo2 = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    const cu = {
      uNoise: { value: vt },
      uRes: { value: new THREE.Vector2(4, 4) },
      uTime: { value: 0 },
      uRo: { value: new THREE.Vector3() },
      uRt: { value: new THREE.Vector3() },
      uUp: { value: new THREE.Vector3() },
      uFw: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
      uSunCol: { value: new THREE.Vector3() },
      uSkyTop: { value: new THREE.Vector3() },
      uSkyHor: { value: new THREE.Vector3() },
      uFogCol: { value: new THREE.Vector3() },
      uSea: { value: new THREE.Vector3() },
      uAmbTop: { value: new THREE.Vector3() },
      uAmbBot: { value: new THREE.Vector3() },
      uCov: { value: 0.5 },
      uFog: { value: 0.021 },
      uWind: { value: new THREE.Vector2() },
      tHist: { value: fbo2.texture },
      uHistW: { value: 0 },
      uFrame: { value: 0 },
      uPRo: { value: new THREE.Vector3() },
      uPRt: { value: new THREE.Vector3() },
      uPUp: { value: new THREE.Vector3() },
      uPFw: { value: new THREE.Vector3() },
    }
    const cloudMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: CLOUD_FRAG, uniforms: cu, depthTest: false, depthWrite: false, toneMapped: false })

    const pu = {
      tA: { value: fbo.texture },
      uRes: { value: new THREE.Vector2(4, 4) },
      uSunUV: { value: new THREE.Vector2(0.5, 0.7) },
      uRays: { value: 0 },
      uSunCol: { value: new THREE.Vector3() },
      uFade: { value: 0 },
    }
    const postMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: POST_FRAG, uniforms: pu, depthTest: false, depthWrite: false, toneMapped: false })

    return { geo, cam, vol, genU, genMat, genScene: mk(genMat), fbo, fbo2, cu, cloudMat, cloudScene: mk(cloudMat), pu, postMat, postScene: mk(postMat) }
  }, [])
  useEffect(
    () => () => {
      R.geo.dispose()
      R.vol.dispose()
      R.fbo.dispose()
      R.fbo2.dispose()
      R.genMat.dispose()
      R.cloudMat.dispose()
      R.postMat.dispose()
    },
    [R],
  )

  // compile every program asynchronously against the target it will draw into; plain CSS sky until then
  const phase = useRef<'compiling' | 'noise' | 'ready'>('compiling')
  useEffect(() => {
    let alive = true
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(R.vol, 0)
    const a = gl.compileAsync(R.genScene, R.cam)
    gl.setRenderTarget(R.fbo)
    const b = gl.compileAsync(R.cloudScene, R.cam)
    gl.setRenderTarget(null)
    const c = gl.compileAsync(R.postScene, R.cam)
    gl.setRenderTarget(prev)
    Promise.all([a, b, c])
      .catch(() => {})
      .then(() => {
        if (alive) phase.current = 'noise'
      })
    return () => {
      alive = false
    }
  }, [R, gl])

  const st = useMemo(
    () => ({
      s: POSTER ? 12.6 : 0,
      t: POSTER ? 21 : 0,
      fade: 0,
      flip: false,
      frame: 0,
      yaw: 0,
      roll: 0,
      buf: new THREE.Vector2(),
      ro: new THREE.Vector3(),
      fw: new THREE.Vector3(),
      rt: new THREE.Vector3(),
      up: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    if (phase.current === 'compiling') {
      gl.setRenderTarget(null)
      gl.setClearColor(0x000000, 0)
      gl.clear()
      return
    }
    if (phase.current === 'noise') {
      // bake the noise volume: one tiny draw per slice, once
      for (let i = 0; i < NOISE; i++) {
        R.genU.uLayer.value = i
        gl.setRenderTarget(R.vol, i)
        gl.render(R.genScene, R.cam)
      }
      gl.setRenderTarget(null)
      phase.current = 'ready'
    }

    /* flight: forward along a meandering path, banking into the turns; the pointer steers a little */
    const sp = speed.get() as number
    // the poster is a still of one composed moment
    const run = POSTER ? 0 : dt
    st.s += run * 0.6 * sp
    st.t += run
    const s = st.s
    const ptrX = POSTER ? 0 : (px.get() as number)
    const ptrY = POSTER ? 0 : (py.get() as number)
    const yawPath = Math.atan(pathDX(s))
    // portrait phones: the copy sits low, so look further down and a little toward the sun
    const mobile = size.width < 760
    const yaw = yawPath + ptrX * 0.24 + (mobile ? 0.2 : 0)
    const yawRate = (yaw - st.yaw) / Math.max(dt, 1e-3)
    st.yaw = yaw
    st.roll = THREE.MathUtils.damp(st.roll, THREE.MathUtils.clamp(-yawRate * 1.6, -0.2, 0.2) - ptrX * 0.05, 2.5, dt)
    const pitch = (mobile ? -0.2 : -0.045) + ptrY * 0.07 + 0.015 * Math.sin(st.t * 0.4)
    st.ro.set(pathX(s) + 0, pathY(s) + 0.03 * Math.sin(st.t * 0.7), -s)
    st.fw.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    st.rt.crossVectors(st.fw, THREE.Object3D.DEFAULT_UP).normalize()
    st.up.crossVectors(st.rt, st.fw)
    const cr = Math.cos(st.roll)
    const sr = Math.sin(st.roll)
    st.tmp.copy(st.rt).multiplyScalar(cr).addScaledVector(st.up, sr)
    st.up.multiplyScalar(cr).addScaledVector(st.rt, -sr)
    st.rt.copy(st.tmp)

    /* sizes: the march runs at ~half the drawing buffer */
    gl.getDrawingBufferSize(st.buf)
    const k = scale.current
    const w = Math.max(16, Math.round(st.buf.x * k))
    const h = Math.max(16, Math.round(st.buf.y * k))
    let fresh = false
    if (R.fbo.width !== w || R.fbo.height !== h) {
      R.fbo.setSize(w, h)
      R.fbo2.setSize(w, h)
      fresh = true
    }
    // ping-pong: write one, read the other as history
    const cur = st.flip ? R.fbo2 : R.fbo
    const hist = st.flip ? R.fbo : R.fbo2
    st.flip = !st.flip

    /* uniforms */
    const T = tod.current
    const c = R.cu
    c.uRes.value.set(w, h)
    c.uTime.value = st.t
    c.uRo.value.copy(st.ro)
    c.uFw.value.copy(st.fw)
    c.uRt.value.copy(st.rt)
    c.uUp.value.copy(st.up)
    const [el, az, rays] = T.ang
    c.uSun.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    c.uSunCol.value.fromArray(T.sun)
    c.uSkyTop.value.fromArray(T.top)
    c.uSkyHor.value.fromArray(T.hor)
    c.uFogCol.value.fromArray(T.fog)
    c.uSea.value.fromArray(T.sea)
    c.uAmbTop.value.fromArray(T.ambTop)
    c.uAmbBot.value.fromArray(T.ambBot)
    c.uCov.value = cov.current
    c.uWind.value.set(st.t * 0.035, st.t * 0.012)

    // project the sun for the light shafts
    const sun = c.uSun.value
    const sz = sun.dot(st.fw)
    const aspect = st.buf.x / st.buf.y
    const p = R.pu
    p.uRes.value.copy(st.buf)
    if (sz > 0.02) p.uSunUV.value.set(((FOCAL * sun.dot(st.rt)) / sz) / aspect + 0.5, (FOCAL * sun.dot(st.up)) / sz + 0.5)
    p.uRays.value = rays * THREE.MathUtils.smoothstep(sz, 0.02, 0.35)
    p.uSunCol.value.fromArray(T.sun)
    st.fade = Math.min(1, st.fade + dt * 0.8)
    p.uFade.value = st.fade * st.fade * (3 - 2 * st.fade)

    c.tHist.value = hist.texture
    c.uHistW.value = fresh || st.frame < 2 || dt === 0 ? 0 : 0.72
    c.uFrame.value = st.frame % 64
    st.frame++
    p.tA.value = cur.texture
    gl.setRenderTarget(cur)
    gl.render(R.cloudScene, R.cam)
    c.uPRo.value.copy(st.ro)
    c.uPRt.value.copy(st.rt)
    c.uPUp.value.copy(st.up)
    c.uPFw.value.copy(st.fw)
    gl.setRenderTarget(null)
    gl.render(R.postScene, R.cam)
  }, 1)

  return null
}

/* ------------------------------------------------------------------ page */

export default function CloudSea() {
  const [todIdx, setTodIdx] = useState(0)
  const [covIdx, setCovIdx] = useState(1)
  const [speedV, setSpeedV] = useState(1)

  const tod = useRef<TodVals>(todVals(TODS[0]))
  const cov = useRef(COVS[1].v)
  const scale = useRef(BASE_SCALE)
  const speed = useSpring(1, { stiffness: 24, damping: 12 })
  const px = useSpring(0, { stiffness: 16, damping: 11, mass: 1.2 })
  const py = useSpring(0, { stiffness: 16, damping: 11, mass: 1.2 })

  // time of day: sun angle, sky, haze and light colours glide from whatever is on screen
  useEffect(() => {
    const from: Partial<TodVals> = {}
    for (const [k, v] of Object.entries(tod.current)) from[k as keyof TodVals] = [...v]
    const to = todVals(TODS[todIdx])
    const c = animate(0, 1, {
      duration: 2.8,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (e) => {
        for (const key of Object.keys(to) as (keyof TodVals)[]) {
          const f = from[key]!
          for (let i = 0; i < to[key].length; i++) tod.current[key][i] = f[i] + (to[key][i] - f[i]) * e
        }
      },
    })
    return () => c.stop()
  }, [todIdx])

  useEffect(() => {
    const c = animate(cov.current, COVS[covIdx].v, { duration: 2.4, ease: [0.45, 0, 0.25, 1], onUpdate: (v) => (cov.current = v) })
    return () => c.stop()
  }, [covIdx])
  useEffect(() => speed.set(speedV), [speedV, speed])

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    px.set(((e.clientX - r.left) / r.width) * 2 - 1)
    py.set(-(((e.clientY - r.top) / r.height) * 2 - 1))
  }
  const onLeave = () => {
    px.set(0)
    py.set(0)
  }
  // touch: drag to steer, springs home on release
  const touch = useRef<{ id: number; x: number; y: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || (e.target as HTMLElement).closest('.dock, button, input, a')) return
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  const onTouchMove = (e: React.PointerEvent) => {
    const t = touch.current
    if (!t || t.id !== e.pointerId) return
    px.set(THREE.MathUtils.clamp((e.clientX - t.x) / 140, -1, 1))
    py.set(THREE.MathUtils.clamp(-(e.clientY - t.y) / 140, -1, 1))
  }
  const onUp = () => {
    if (!touch.current) return
    touch.current = null
    onLeave()
  }

  const T = TODS[todIdx]

  return (
    <div
      className="stage cs"
      onPointerMove={(e) => (e.pointerType === 'touch' ? onTouchMove(e) : onMove(e))}
      onPointerLeave={onLeave}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={CANVAS_DPR} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }} orthographic camera={{ position: [0, 0, 1] }}>
        <PerformanceMonitor
          onDecline={() => (scale.current = Math.max(0.32, scale.current * 0.85))}
          onIncline={() => (scale.current = Math.min(BASE_SCALE, scale.current * 1.12))}
          flipflops={4}
        />
        <Sky tod={tod} cov={cov} speed={speed} px={px} py={py} scale={scale} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy cs-copy"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: T.dot, boxShadow: `0 0 10px ${T.dot}` }} /> Volumetric · Henyey–Greenstein
          </p>
          <h1>在云上</h1>
          <p className="cs-lede">云海由体积光线步进实时算出。低角度的阳光穿过云隙化作光束，逆光的云边镶上一圈金边。</p>
          <div className="cs-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={T.key}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                <b style={{ color: T.dot }}>{T.en}</b> · 太阳高度 {T.el}°
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="dock cs-dock">
          <Seg items={TODS.map((t, i) => ({ value: i, label: t.zh }))} value={todIdx} onChange={setTodIdx} />
          <span className="dock-sep" />
          <Seg items={COVS.map((c, i) => ({ value: i, label: c.zh }))} value={covIdx} onChange={setCovIdx} />
          <span className="dock-sep cs-sep2" />
          <label className="cs-range" title="飞行速度">
            <span>航速</span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={speedV}
              onChange={(e) => setSpeedV(Number(e.target.value))}
              style={{ ['--v' as string]: `${(speedV / 3) * 100}%` }}
            />
          </label>
        </div>
        <p className="hint">
          移动指针 · 轻轻转向
          <br />
          {STEPS} steps × {LSTEPS} sun taps · ½ res
        </p>
      </div>
    </div>
  )
}

const css = `
.cs { background: linear-gradient(180deg, #a9c0e6 0%, #e9d3cf 34%, #f8dcc6 46%, #f3ece8 62%, #e8e4ea 100%); touch-action: none; }
.cs .cs-copy { --soft-bg: rgba(250, 244, 240, .8); }
.cs .cs-copy h1 { font-size: clamp(44px, 5.4vw, 76px); letter-spacing: -.04em; }
.cs .cs-lede { max-width: 350px; font-size: 15px; color: color-mix(in srgb, var(--fg) 72%, transparent); }
.cs-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); }
.cs-meta span { display: inline-block; }
.cs-meta b { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; transition: color 1.2s; }
.cs .kicker i { transition: background 1.2s, box-shadow 1.2s; }
.cs-range { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px 0 8px; font: 500 13px/1 var(--sans); color: var(--fg-2); cursor: pointer; }
.cs-range input { -webkit-appearance: none; appearance: none; width: 92px; height: 18px; margin: 0; background: transparent; cursor: pointer; }
.cs-range input::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, var(--fg) var(--v), color-mix(in srgb, var(--fg) 14%, transparent) var(--v)); }
.cs-range input::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.18); }
.cs-range input::-moz-range-track { height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--fg) 14%, transparent); }
.cs-range input::-moz-range-progress { height: 4px; border-radius: 4px; background: var(--fg); }
.cs-range input::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #fff; }
@media (max-width: 760px) {
  .cs .cs-copy { bottom: 136px; }
  .cs .cs-lede { font-size: 13.5px; }
  .cs-meta { display: none; }
  .cs-dock { flex-wrap: wrap; justify-content: center; row-gap: 2px; border-radius: 22px; width: max-content; }
  .cs-dock .seg { padding: 0 11px; }
  .cs-sep2 { display: none; }
}
`
