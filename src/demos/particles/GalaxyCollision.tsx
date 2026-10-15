import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* Restricted three-body galaxy collision (Toomre & Toomre 1972):
 * each galaxy = a softened point-mass "bulge" + a Plummer dark halo potential. The two centres follow their own
 * two-body orbit (precomputed on the CPU, with a dynamical-friction drag so they spiral in and merge); the stars
 * are massless test particles that feel only the two centres, integrated on the GPU (GPUComputationRenderer). */

/* ------------------------------------------------------------------ model */

const MC = 1 // bulge mass
const MH = 3 // halo mass
const AH = 1.6 // halo scale
const ES = 0.14 // star softening
const ECC = 0.35 // centre–centre softening (extended bodies)
const QB = 0.8 // mass of galaxy B relative to A
const SB = 0.85 // length scale of galaxy B
const D0 = 7.2 // starting separation
const YR = 0.55 // 亿年 per time unit

type Preset = {
  key: string
  zh: string
  en: string
  aside: string
  rp: number
  fv: number
  kdf: number
  /** spin axes: inclination from the prograde axis (deg) and azimuth (deg) */
  a: [number, number]
  b: [number, number]
}

const PRESETS: Preset[] = [
  { key: 'head', zh: '正面', en: 'Head-on', aside: 'r_p 0.4', rp: 0.4, fv: 1.0, kdf: 0.26, a: [28, 20], b: [62, 200] },
  { key: 'graze', zh: '擦身', en: 'Grazing', aside: 'r_p 1.9 · prograde', rp: 1.9, fv: 0.94, kdf: 0.3, a: [18, 30], b: [48, 150] },
  { key: 'retro', zh: '逆行', en: 'Retrograde', aside: 'B spins backwards', rp: 1.45, fv: 0.94, kdf: 0.3, a: [22, 40], b: [158, 120] },
]

const PHASES = [
  { key: 'approach', zh: '接近', en: 'Approach' },
  { key: 'pass', zh: '初次掠过', en: 'First passage' },
  { key: 'tails', zh: '潮汐尾', en: 'Tidal tails' },
  { key: 'fall', zh: '回落', en: 'Falling back' },
  { key: 'merge', zh: '并合', en: 'Coalescence' },
  { key: 'ellip', zh: '椭圆星系', en: 'Elliptical remnant' },
]

const SPEEDS = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
]

/** |acceleration| / r of one galaxy's potential (mass m, length scale s) */
function gOf(r2: number, m: number, s: number, eps: number) {
  return m * (MC / Math.pow(r2 + eps * eps * s * s, 1.5) + MH / Math.pow(r2 + AH * AH * s * s, 1.5))
}

type Orbit = {
  step: number
  rx: Float32Array
  rz: Float32Array
  v0: [number, number]
  tPeri1: number
  tApo1: number
  tPeri2: number
  tMerge: number
  tEnd: number
}

/** relative orbit B − A in the x–z plane, rotated so that B starts on +x */
function buildOrbit(p: Preset): Orbit {
  const M = 1 + QB
  // relative acceleration = pull of A on B + pull of B on A (both softened, extended)
  const g = (r2: number) => gOf(r2, 1, 1, ECC) + gOf(r2, QB, SB, ECC)
  const phi = (r: number) => -(MC / Math.hypot(r, ECC) + MH / Math.hypot(r, AH)) * M
  const vesc = Math.sqrt(-2 * phi(p.rp))
  let x = p.rp
  let y = 0
  let vx = 0
  let vy = vesc * p.fv
  // integrate backward from pericentre to the starting separation (no friction)
  const h = 0.002
  for (let k = 0; k < 40000 && Math.hypot(x, y) < D0; k++) {
    const a = -g(x * x + y * y)
    vx -= a * x * h
    vy -= a * y * h
    x -= vx * h
    y -= vy * h
  }
  // rotate so the start position lies on +x
  const ang = -Math.atan2(y, x)
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  ;[x, y] = [c * x - s * y, s * x + c * y]
  ;[vx, vy] = [c * vx - s * vy, s * vx + c * vy]
  const v0: [number, number] = [vx, vy]
  // forward with dynamical friction (drag on the relative velocity ∝ halo density)
  const STEP = 0.01
  const TMAX = 48
  const n = Math.round(TMAX / STEP) + 1
  const rx = new Float32Array(n)
  const rz = new Float32Array(n)
  const sub = Math.round(STEP / h)
  for (let i = 0; i < n; i++) {
    rx[i] = x
    rz[i] = y
    for (let k = 0; k < sub; k++) {
      const r2 = x * x + y * y
      const a = -g(r2)
      const rho = 1 / Math.pow(1 + r2 / (AH * AH), 1.5)
      vx += (a * x - p.kdf * rho * vx) * h
      vy += (a * y - p.kdf * rho * vy) * h
      x += vx * h
      y += vy * h
    }
  }
  const sep = (i: number) => Math.hypot(rx[i], rz[i])
  const ext: { t: number; min: boolean }[] = []
  for (let i = 1; i < n - 1; i++) {
    const a = sep(i - 1)
    const b = sep(i)
    const d = sep(i + 1)
    if (b < a && b <= d) ext.push({ t: i * STEP, min: true })
    else if (b > a && b >= d) ext.push({ t: i * STEP, min: false })
  }
  let last = 0
  for (let i = 0; i < n; i++) if (sep(i) > 0.55) last = i
  const tMerge = last * STEP
  const mins = ext.filter((e) => e.min)
  const maxs = ext.filter((e) => !e.min)
  const tPeri1 = mins[0]?.t ?? 5
  const tApo1 = maxs.find((e) => e.t > tPeri1)?.t ?? tPeri1 + 2
  const tPeri2 = Math.min(mins.find((e) => e.t > tApo1)?.t ?? tMerge, tMerge)
  return { step: STEP, rx, rz, v0, tPeri1, tApo1, tPeri2, tMerge, tEnd: Math.min(tMerge + 8, TMAX) }
}

function relAt(o: Orbit, t: number, out: THREE.Vector3) {
  const f = Math.min(Math.max(t / o.step, 0), o.rx.length - 1.001)
  const i = Math.floor(f)
  const k = f - i
  return out.set(o.rx[i] + (o.rx[i + 1] - o.rx[i]) * k, 0, o.rz[i] + (o.rz[i + 1] - o.rz[i]) * k)
}

function phaseAt(o: Orbit, t: number) {
  if (t < o.tPeri1 - 1.1) return 0
  if (t < o.tPeri1 + 1.4) return 1
  if (t < Math.max(o.tApo1, o.tPeri1 + 3)) return 2
  if (t < o.tPeri2 - 0.6) return 3
  if (t < o.tMerge + 1.5) return 4
  return 5
}

/** spin axis + in-plane basis; prograde = orbital angular momentum, which is −y for this orbit */
function diskBasis([incDeg, azDeg]: [number, number]) {
  const i = THREE.MathUtils.degToRad(incDeg)
  const a = THREE.MathUtils.degToRad(azDeg)
  const n = new THREE.Vector3(Math.sin(i) * Math.cos(a), -Math.cos(i), Math.sin(i) * Math.sin(a)).normalize()
  const e1 = new THREE.Vector3(1, 0, 0).cross(n)
  if (e1.lengthSq() < 1e-4) e1.set(0, 0, 1).cross(n)
  e1.normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize()
  // e1 × e2 = n  →  counter-clockwise about n is the e1 → e2 direction
  return { n, e1, e2 }
}

const rand = (() => {
  let s = 1234567
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 1e9) / 1e9
  }
})()
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(6.2831853 * rand())

type ICs = { pos: Float32Array; vel: Float32Array }

/** stars: exponential disk + small bulge, on circular orbits in their own galaxy's potential */
function buildICs(p: Preset, o: Orbit, w: number, h: number, kind: Float32Array): ICs {
  const N = w * h
  const pos = new Float32Array(N * 4)
  const vel = new Float32Array(N * 4)
  const M = 1 + QB
  const rel0 = new THREE.Vector3(o.rx[0], 0, o.rz[0])
  const vrel0 = new THREE.Vector3(o.v0[0], 0, o.v0[1])
  const gals = [
    { m: 1, s: 1, c: rel0.clone().multiplyScalar(-QB / M), v: vrel0.clone().multiplyScalar(-QB / M), b: diskBasis(p.a) },
    { m: QB, s: SB, c: rel0.clone().multiplyScalar(1 / M), v: vrel0.clone().multiplyScalar(1 / M), b: diskBasis(p.b) },
  ]
  const tmp = new THREE.Vector3()
  const half = N / 2
  for (let i = 0; i < N; i++) {
    const G = gals[i < half ? 0 : 1]
    const k = kind[i]
    let lx: number, ly: number, lz: number, vx: number, vy: number, vz: number
    if (k === 1) {
      // bulge: compact spheroid, circular orbits on random planes
      let r = 0
      do r = 0.22 * Math.sqrt(1 / Math.pow(rand() * 0.98 + 0.01, 2 / 3) - 1)
      while (r > 0.7 || r < 0.05)
      r *= G.s
      const u = rand() * 2 - 1
      const th = rand() * Math.PI * 2
      const sq = Math.sqrt(1 - u * u)
      lx = r * sq * Math.cos(th)
      ly = r * sq * Math.sin(th)
      lz = r * u * 0.7
      const vc = Math.sqrt(r * r * gOf(r * r, G.m, G.s, ES))
      // random direction perpendicular to r
      tmp.set(gauss(), gauss(), gauss())
      const rl = Math.hypot(lx, ly, lz)
      const dot = (tmp.x * lx + tmp.y * ly + tmp.z * lz) / (rl * rl)
      tmp.set(tmp.x - dot * lx, tmp.y - dot * ly, tmp.z - dot * lz).normalize().multiplyScalar(vc)
      vx = tmp.x
      vy = tmp.y
      vz = tmp.z
    } else {
      // exponential disk Σ ∝ e^(−r/Rd): r ~ Gamma(2, Rd)
      let r = 0
      do r = -0.44 * Math.log((rand() + 1e-9) * (rand() + 1e-9))
      while (r > 2.3 || r < 0.12)
      if (k === 2) r = Math.max(r, 0.45) // HII knots live in the arms, not the core
      // 40 % of the disk (and every HII knot) starts on the two arms; shear then winds them up
      const onArm = k === 2 || rand() < 0.4
      const th = onArm ? (-6.6 * Math.log(r / 0.6) + (rand() < 0.5 ? 0 : 2 * Math.PI) + gauss() * 0.55) / 2 : rand() * Math.PI * 2
      r *= G.s
      lx = r * Math.cos(th)
      ly = r * Math.sin(th)
      lz = gauss() * 0.035 * G.s * (1 + r * 0.6)
      const vc = Math.sqrt(r * r * gOf(r * r, G.m, G.s, ES))
      const disp = 0.035 + 0.05 * Math.exp(-r / 0.5)
      vx = -Math.sin(th) * vc + gauss() * disp
      vy = Math.cos(th) * vc + gauss() * disp
      vz = gauss() * disp * 0.5
    }
    const { e1, e2, n } = G.b
    pos[i * 4] = G.c.x + e1.x * lx + e2.x * ly + n.x * lz
    pos[i * 4 + 1] = G.c.y + e1.y * lx + e2.y * ly + n.y * lz
    pos[i * 4 + 2] = G.c.z + e1.z * lx + e2.z * ly + n.z * lz
    pos[i * 4 + 3] = 1
    vel[i * 4] = G.v.x + e1.x * vx + e2.x * vy + n.x * vz
    vel[i * 4 + 1] = G.v.y + e1.y * vx + e2.y * vy + n.y * vz
    vel[i * 4 + 2] = G.v.z + e1.z * vx + e2.z * vy + n.z * vz
    vel[i * 4 + 3] = 0
  }
  return { pos, vel }
}

/* ------------------------------------------------------------------ GLSL */

const ACC = /* glsl */ `
uniform vec3 uCA, uCB;
uniform float uH;
vec3 acc(vec3 p) {
  vec3 d = uCA - p;
  float r2 = dot(d, d);
  vec3 a = d * (${MC.toFixed(3)} * pow(r2 + ${(ES * ES).toFixed(5)}, -1.5) + ${MH.toFixed(3)} * pow(r2 + ${(AH * AH).toFixed(5)}, -1.5));
  d = uCB - p;
  r2 = dot(d, d);
  a += d * ${QB.toFixed(3)} * (${MC.toFixed(3)} * pow(r2 + ${(ES * ES * SB * SB).toFixed(5)}, -1.5) + ${MH.toFixed(3)} * pow(r2 + ${(AH * AH * SB * SB).toFixed(5)}, -1.5));
  return a;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

const VEL_FRAG = /* glsl */ `
uniform float uRelax, uSeed;
${ACC}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz;
  vec3 v = texture2D(textureVelocity, uv).xyz;
  v += acc(p) * uH;
  // after coalescence: "violent relaxation" — orbit planes get scrambled, energy kept → a spheroidal remnant
  if (uRelax > 0.0) {
    float sp = length(v);
    float a = hash12(uv * 731.3 + uSeed) * 6.2831853;
    float z = hash12(uv * 197.1 - uSeed * 1.7) * 2.0 - 1.0;
    vec3 rd = vec3(sqrt(1.0 - z * z) * vec2(cos(a), sin(a)), z);
    // only the bound inner body relaxes; the tails keep streaming
    float inner = exp(-dot(p, p) / 5.0);
    v = normalize(mix(v, rd * sp, min(uRelax * inner * uH * 0.9, 0.5)) + 1e-6) * sp;
  }
  gl_FragColor = vec4(v, 0.0);
}
`

const POS_FRAG = /* glsl */ `
${ACC}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  // symplectic Euler: drift with the freshly kicked velocity (same kick as the velocity pass)
  gl_FragColor = vec4(p.xyz + (v + acc(p.xyz) * uH) * uH, p.w);
}
`

const STAR_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform vec3 uCA, uCB;
uniform mat3 uBA, uBB;     // columns e1, e2, n
uniform vec2 uArm;         // density-wave strength per galaxy (fades once tides take over)
uniform float uTime, uSize, uPR, uFade, uHalfV;
uniform vec3 uColA, uColB, uCore, uHiiA, uHiiB;
attribute float aKind;
attribute float aSeed;
varying vec3 vCol;

float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  vec2 uv = position.xy;
  vec3 p = texture2D(tPos, uv).xyz;
  vec3 v = texture2D(tVel, uv).xyz;
  bool isB = uv.y > uHalfV;
  vec3 c = isB ? uCB : uCA;
  mat3 B = isB ? uBB : uBA;
  float sc = isB ? ${SB.toFixed(3)} : 1.0;
  vec3 q = (p - c) / sc;
  vec3 l = q * B;                         // local disk coords (x, y in plane, z along the spin)
  float r = length(l.xy) + 1e-4;
  float th = atan(l.y, l.x);

  // two trailing log-spiral arms rotating at a fixed pattern speed (stars stream through them)
  float ph = 2.0 * (th - uTime * 0.42) + 6.6 * log(r / 0.6);
  float arm = pow(0.5 + 0.5 * cos(ph), 3.0);
  float dust = pow(0.5 + 0.5 * cos(ph + 0.95), 10.0) * smoothstep(0.25, 0.6, r) * (0.45 + 0.9 * vnoise(l * 7.0 + 3.1));
  float armK = (isB ? uArm.y : uArm.x) * smoothstep(0.18, 0.5, r) * (1.0 - smoothstep(1.7, 2.4, r));

  vec3 base = isB ? uColB : uColA;
  vec3 hii = isB ? uHiiB : uHiiA;
  float b = 1.0;
  vec3 col = base;
  if (aKind > 1.5) {            // HII knots / young clusters: only lit in the arms
    col = hii;
    b = 0.45 + armK * 4.0 * arm;
  } else {
    b = mix(1.0, 0.3 + 2.2 * arm, armK) * (1.0 - 0.8 * dust * armK);
  }
  // warm, dense core
  float rc = length(q);
  float core = exp(-rc * rc * 9.0);
  if (aKind > 0.5 && aKind < 1.5) core = max(core, 0.6);
  col = mix(col, uCore, core * 0.8);
  b *= 1.0 - 0.45 * core;
  // fast stars (flung out at pericentre) burn hotter
  float sp = smoothstep(1.2, 3.2, length(v));
  col = mix(col, vec3(1.0), sp * 0.35);
  b *= 1.0 + sp * 0.6;
  b *= mix(0.75, 1.25, fract(aSeed * 7.13));
  // sparse debris far from both nuclei glows fainter (surface brightness, not just dot count)
  vec3 da = p - uCA;
  vec3 db = p - uCB;
  float dmin2 = min(dot(da, da), dot(db, db));
  b *= 0.55 + 0.45 * exp(-dmin2 / 7.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * (aKind > 1.5 ? 1.5 : mix(0.8, 1.25, aSeed));
  gl_PointSize = max(sz * uPR * (16.0 / -mv.z), 1.0);
  vCol = col * b * uFade;
}
`

const STAR_FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = exp(-d * 3.2) - 0.04;
  gl_FragColor = vec4(vCol * a * uGain, 1.0);
}
`

const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // camera-facing billboard
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  gl_Position = projectionMatrix * mv;
}
`
const GLOW_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uI;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = exp(-r * r * 7.0) * 0.8 + exp(-r * r * 60.0) * 2.2;
  gl_FragColor = vec4(uCol * g * uI * (1.0 - smoothstep(0.8, 1.0, r)), 1.0);
}
`

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`
const BG_FRAG = /* glsl */ `
uniform vec2 uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uAspect;
  float r = length(p - vec2(0.05, 0.02));
  vec3 col = mix(vec3(0.0032, 0.0026, 0.0085), vec3(0.0004, 0.0003, 0.0012), smoothstep(0.0, 0.9, r));
  col += vec3(0.004, 0.0025, 0.011) * exp(-r * r * 5.0);
  gl_FragColor = vec4(col, 1.0);
}
`

const FIELD_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uPR;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 40.0);
  float big = step(0.985, aSeed);
  gl_PointSize = (1.2 + big * 1.6) * uPR;
  vec3 c = mix(vec3(0.62, 0.7, 1.0), vec3(1.0, 0.82, 0.62), fract(aSeed * 13.7));
  vCol = c * (0.05 + 0.2 * pow(fract(aSeed * 91.3), 6.0) + big * 0.4) * tw;
}
`
const FIELD_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.1, 0.5, length(c));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`

/* ------------------------------------------------------------------ scene */

type Ctl = {
  preset: React.MutableRefObject<number>
  playing: React.MutableRefObject<boolean>
  speed: React.MutableRefObject<number>
  resetReq: React.MutableRefObject<number>
  drag: React.MutableRefObject<{ yaw: number; pitch: number; vy: number; vp: number; down: boolean; last: number }>
  onPhase: (phase: number, years: string) => void
}

const lin = (hex: string) => new THREE.Color(hex)

function Galaxies({ w, h, ctl }: { w: number; h: number; ctl: Ctl }) {
  const gl = useThree((s) => s.gl)
  const N = w * h

  const kind = useMemo(() => {
    const k = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const r = rand()
      k[i] = r < 0.09 ? 1 : r < 0.14 ? 2 : 0
    }
    return k
  }, [N])

  const orbits = useMemo(() => PRESETS.map((p) => buildOrbit(p)), [])

  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(w, h, gl)
    if (!gl.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType)
    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    const velVar = gpu.addVariable('textureVelocity', VEL_FRAG, vel0)
    const posVar = gpu.addVariable('texturePosition', POS_FRAG, pos0)
    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])
    const common = () => ({ uCA: { value: new THREE.Vector3() }, uCB: { value: new THREE.Vector3() }, uH: { value: 0 } })
    Object.assign(velVar.material.uniforms, common(), { uRelax: { value: 0 }, uSeed: { value: 0 } })
    Object.assign(posVar.material.uniforms, common())
    const err = gpu.init()
    if (err) console.error(err)
    return { gpu, velVar, posVar, pos0, vel0 }
  }, [gl, w, h])
  useEffect(() => () => sim.gpu.dispose(), [sim])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const ref = new Float32Array(N * 3)
    const seed = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      ref[i * 3] = ((i % w) + 0.5) / w
      ref[i * 3 + 1] = (Math.floor(i / w) + 0.5) / h
      seed[i] = rand()
    }
    g.setAttribute('position', new THREE.BufferAttribute(ref, 3))
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    return g
  }, [N, w, h, kind])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERT,
        fragmentShader: STAR_FRAG,
        uniforms: {
          tPos: { value: null },
          tVel: { value: null },
          uCA: { value: new THREE.Vector3() },
          uCB: { value: new THREE.Vector3() },
          uBA: { value: new THREE.Matrix3() },
          uBB: { value: new THREE.Matrix3() },
          uArm: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uSize: { value: N > 80000 ? 2.1 : 2.5 },
          uPR: { value: 1 },
          uFade: { value: 0 },
          uHalfV: { value: 0.5 },
          uGain: { value: N > 80000 ? 0.34 : 0.48 },
          uColA: { value: lin('#7d9dff') },
          uColB: { value: lin('#ffb455') },
          uCore: { value: lin('#fff1dc') },
          uHiiA: { value: lin('#9ad2ff') },
          uHiiB: { value: lin('#ff7f9e') },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [N],
  )

  const glowMat = useMemo(
    () =>
      [lin('#ffe6c4'), lin('#ffd59a')].map(
        (c) =>
          new THREE.ShaderMaterial({
            vertexShader: GLOW_VERT,
            fragmentShader: GLOW_FRAG,
            uniforms: { uCol: { value: c }, uI: { value: 0 } },
            transparent: true,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [],
  )
  const glowA = useRef<THREE.Mesh>(null)
  const glowB = useRef<THREE.Mesh>(null)

  const st = useMemo(
    () => ({
      t: 0,
      clock: 0,
      orbit: orbits[ctl.preset.current],
      preset: -1,
      reset: -1,
      fade: 0,
      ending: false,
      phase: -1,
      years: '',
      lastUi: 0,
      ca: new THREE.Vector3(),
      cb: new THREE.Vector3(),
      rel: new THREE.Vector3(),
      basisA: new THREE.Matrix3(),
      basisB: new THREE.Matrix3(),
      warm: POSTER,
    }),
    [orbits, ctl],
  )

  const restart = (pi: number) => {
    const p = PRESETS[pi]
    const o = orbits[pi]
    const ics = buildICs(p, o, w, h, kind)
    ;(sim.pos0.image.data as Float32Array).set(ics.pos)
    ;(sim.vel0.image.data as Float32Array).set(ics.vel)
    sim.pos0.needsUpdate = true
    sim.vel0.needsUpdate = true
    for (const rt of sim.posVar.renderTargets) sim.gpu.renderTexture(sim.pos0, rt)
    for (const rt of sim.velVar.renderTargets) sim.gpu.renderTexture(sim.vel0, rt)
    const a = diskBasis(p.a)
    const b = diskBasis(p.b)
    st.basisA.set(a.e1.x, a.e2.x, a.n.x, a.e1.y, a.e2.y, a.n.y, a.e1.z, a.e2.z, a.n.z)
    st.basisB.set(b.e1.x, b.e2.x, b.n.x, b.e1.y, b.e2.y, b.n.y, b.e1.z, b.e2.z, b.n.z)
    st.orbit = o
    st.preset = pi
    st.t = 0
    st.ending = false
  }

  const centres = (t: number) => {
    relAt(st.orbit, t, st.rel)
    const M = 1 + QB
    st.ca.copy(st.rel).multiplyScalar(-QB / M)
    st.cb.copy(st.rel).multiplyScalar(1 / M)
  }

  const step = (hh: number) => {
    centres(st.t + hh * 0.5)
    const vu = sim.velVar.material.uniforms
    const pu = sim.posVar.material.uniforms
    vu.uCA.value.copy(st.ca)
    vu.uCB.value.copy(st.cb)
    pu.uCA.value.copy(st.ca)
    pu.uCB.value.copy(st.cb)
    vu.uH.value = hh
    pu.uH.value = hh
    const o = st.orbit
    vu.uRelax.value = THREE.MathUtils.smoothstep(st.t, o.tMerge - 2, o.tMerge + 3)
    vu.uSeed.value = (vu.uSeed.value + 0.6180339) % 97
    sim.gpu.compute()
    st.t += hh
  }

  useFrame((state, raw) => {
    const dt = Math.min(raw, 1 / 30)
    st.clock += dt

    if (st.preset !== ctl.preset.current || st.reset !== ctl.resetReq.current) {
      st.reset = ctl.resetReq.current
      restart(ctl.preset.current)
      st.fade = 0
      if (POSTER) st.warm = true
    }
    const o = st.orbit

    /* integrate (poster: fast-forward to the tails) */
    const H = 0.0125
    if (st.warm) {
      const goal = o.tPeri1 + 3.0
      for (let k = 0; k < 60 && st.t < goal; k++) step(H)
      if (st.t >= goal) st.warm = false
    } else if (ctl.playing.current && !st.ending) {
      const simDt = dt * ctl.speed.current
      const n = Math.min(8, Math.ceil(simDt / H))
      for (let k = 0; k < n; k++) step(simDt / n)
    }
    if (st.t >= o.tEnd) st.ending = true
    st.fade = THREE.MathUtils.damp(st.fade, st.ending ? 0 : 1, st.ending ? 3.2 : 2.2, dt)
    if (st.ending && st.fade < 0.02) {
      ctl.resetReq.current++
    }

    /* uniforms */
    centres(st.t)
    const u = mat.uniforms
    u.tPos.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    u.tVel.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
    u.uCA.value.copy(st.ca)
    u.uCB.value.copy(st.cb)
    u.uBA.value.copy(st.basisA)
    u.uBB.value.copy(st.basisB)
    const armFade = 1 - THREE.MathUtils.smoothstep(st.t, o.tPeri1 - 1.2, o.tPeri1 + 2.2)
    u.uArm.value.set(armFade, armFade)
    u.uTime.value = st.t
    u.uPR.value = state.viewport.dpr
    u.uFade.value = st.fade
    const sep = st.rel.length()
    if (glowA.current && glowB.current) {
      glowA.current.position.copy(st.ca)
      glowB.current.position.copy(st.cb)
      // when the cores overlap, one glow carries both
      const merged = 1 - THREE.MathUtils.smoothstep(sep, 0.2, 0.9)
      glowMat[0].uniforms.uI.value = st.fade * (0.5 + 0.35 * merged)
      glowMat[1].uniforms.uI.value = st.fade * 0.42 * (1 - merged * 0.8)
    }

    /* camera: drag orbit with inertia + slow idle drift; distance follows the system's extent */
    const d = ctl.drag.current
    const idle = !d.down && performance.now() - d.last > 2500
    if (!d.down) {
      d.yaw += d.vy * dt
      d.pitch += d.vp * dt
      const k = Math.exp(-dt * 3.2)
      d.vy *= k
      d.vp *= k
    }
    if (idle) d.yaw += dt * 0.035
    d.pitch = THREE.MathUtils.clamp(d.pitch, -1.25, 1.35)
    const cam = state.camera as THREE.PerspectiveCamera
    const { width, height } = state.size
    const aspect = width / height
    const mobile = width < 760
    // frame the pair on approach, then stay wide enough for the tails and the remnant's halo
    const ext = Math.max(THREE.MathUtils.clamp(sep, 2.5, 7.2), THREE.MathUtils.lerp(2.5, 7.4, THREE.MathUtils.smoothstep(st.t, o.tPeri1, o.tPeri1 + 4)))
    const want = (9.5 + ext * 1.05) / Math.min(1, aspect * (mobile ? 0.95 : 0.8))
    const camState = cam.userData as { dist?: number }
    camState.dist = THREE.MathUtils.damp(camState.dist ?? want, want, 0.8, dt)
    const R = camState.dist
    const el = 0.5 + d.pitch
    cam.position.set(Math.sin(d.yaw) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(d.yaw) * Math.cos(el) * R)
    cam.lookAt(0, 0, 0)
    const oy = POSTER ? 0 : mobile ? 0.1 : 0.02
    if (oy) cam.setViewOffset(width, height, 0, oy * height, width, height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()

    /* overlay: phase + elapsed (throttled, and only when the text changes) */
    const ph = phaseAt(o, st.t)
    const yrs = (st.t * YR).toFixed(1)
    if (ph !== st.phase || (yrs !== st.years && st.clock - st.lastUi > 0.2)) {
      st.phase = ph
      st.years = yrs
      st.lastUi = st.clock
      ctl.onPhase(ph, yrs)
    }
  })

  return (
    <>
      <points geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />
      <mesh ref={glowA} material={glowMat[0]} frustumCulled={false} renderOrder={3} scale={1.5}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={glowB} material={glowMat[1]} frustumCulled={false} renderOrder={3} scale={1.3}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  )
}

function Backdrop() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const bg = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        uniforms: { uAspect: { value: new THREE.Vector2(1, 1) } },
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  const field = useMemo(() => {
    const n = 2600
    const p = new Float32Array(n * 3)
    const s = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1
      const th = rand() * Math.PI * 2
      const r = 70 + rand() * 20
      const q = Math.sqrt(1 - u * u)
      p[i * 3] = q * Math.cos(th) * r
      p[i * 3 + 1] = u * r
      p[i * 3 + 2] = q * Math.sin(th) * r
      s[i] = rand()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    return { g, m }
  }, [])
  useFrame((s) => {
    field.m.uniforms.uTime.value = s.clock.elapsedTime
    field.m.uniforms.uPR.value = dpr
    const a = size.width / size.height
    bg.uniforms.uAspect.value.set(Math.max(a, 1), Math.max(1 / a, 1))
  })
  return (
    <>
      <mesh material={bg} frustumCulled={false} renderOrder={-2}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <points geometry={field.g} material={field.m} frustumCulled={false} renderOrder={-1} />
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function GalaxyCollision() {
  const phone = useMemo(() => typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760, [])
  const [w, h] = phone ? [256, 256] : [320, 320]
  const [preset, setPreset] = useState(1)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [ui, setUi] = useState({ phase: 0, years: '0.0' })

  const presetRef = useRef(1)
  const playingRef = useRef(true)
  const speedRef = useRef(1)
  const resetReq = useRef(0)
  const drag = useRef({ yaw: -0.35, pitch: 0, vy: 0, vp: 0, down: false, last: -1e9 })
  const ptr = useRef({ x: 0, y: 0, t: 0, id: -1 })

  const ctl = useMemo<Ctl>(
    () => ({
      preset: presetRef,
      playing: playingRef,
      speed: speedRef,
      resetReq,
      drag,
      onPhase: (phase, years) => setUi((u) => (u.phase === phase && u.years === years ? u : { phase, years })),
    }),
    [],
  )

  const ph = PHASES[ui.phase]
  const p = PRESETS[preset]

  return (
    <div
      className="stage gx-stage"
      style={{ background: '#04030a', touchAction: 'none' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest?.('.dock, .demo-chrome')) return
        const d = drag.current
        d.down = true
        d.vy = d.vp = 0
        d.last = performance.now()
        ptr.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d.down || e.pointerId !== ptr.current.id) return
        const now = performance.now()
        const dx = e.clientX - ptr.current.x
        const dy = e.clientY - ptr.current.y
        const dts = Math.max((now - ptr.current.t) / 1000, 1 / 240)
        const k = 3.6 / Math.max(window.innerWidth, 600)
        d.yaw -= dx * k
        d.pitch += dy * k
        d.vy = THREE.MathUtils.lerp(d.vy, (-dx * k) / dts, 0.5)
        d.vp = THREE.MathUtils.lerp(d.vp, (dy * k) / dts, 0.5)
        d.last = now
        ptr.current = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId }
      }}
      onPointerUp={(e) => {
        const d = drag.current
        if (e.pointerId !== ptr.current.id) return
        d.down = false
        d.last = performance.now()
        if (performance.now() - ptr.current.t > 80) d.vy = d.vp = 0
      }}
      onPointerCancel={() => (drag.current.down = false)}
    >
      <style>{`
        .gx-stage canvas { cursor: grab; }
        .gx-stage:active canvas { cursor: grabbing; }
        .gx-play { display: inline-flex; align-items: center; gap: 7px; }
        .gx-play svg { width: 10px; height: 10px; }
        .gx-legend { position: absolute; right: 24px; top: 88px; display: grid; gap: 8px; font: 500 12px/1 var(--mono); color: var(--fg-2); pointer-events: none !important; }
        .gx-legend i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 8px; vertical-align: 0; }
        .gx-stage .big-label p span { font-variant-numeric: tabular-nums; }
        @media (max-width: 760px) {
          .gx-legend { display: none; }
          .gx-stage .dock .seg { padding: 0 10px; }
          .gx-stage .dock .dock-sep { margin: 0 2px; }
        }
      `}</style>

      <Canvas dpr={[1, 2]} camera={{ position: [0, 6, 16], fov: 38, near: 0.1, far: 300 }} gl={{ antialias: false, alpha: false }}>
        <Backdrop />
        <Galaxies w={w} h={h} ctl={ctl} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.42} luminanceSmoothing={0.35} radius={0.72} />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={ph.key}
          meta={`${(w * h).toLocaleString()} stars · 3-body · ${p.zh}`}
          title={ph.zh}
          sub={ph.en}
          aside={`${ui.years} 亿年`}
        />
        <div className="gx-legend">
          <span>
            <i style={{ background: '#9db4ff' }} />
            星系 A · M = 1
          </span>
          <span>
            <i style={{ background: '#ffc070' }} />
            星系 B · M = 0.8
          </span>
        </div>

        <div className="dock">
          <button
            className="seg gx-play"
            aria-pressed={playing}
            onClick={() => {
              playingRef.current = !playing
              setPlaying(!playing)
            }}
          >
            <span className="gx-play">
              <svg viewBox="0 0 10 10" aria-hidden>
                {playing ? <path d="M2 1h2v8H2zM6 1h2v8H6z" fill="currentColor" /> : <path d="M2 1l7 4-7 4z" fill="currentColor" />}
              </svg>
              {playing ? '暂停' : '播放'}
            </span>
          </button>
          <span className="dock-sep" />
          <Seg
            items={SPEEDS}
            value={speed}
            onChange={(v) => {
              speedRef.current = v
              setSpeed(v)
            }}
          />
          <span className="dock-sep" />
          <Seg
            items={PRESETS.map((x, i) => ({ value: i, label: x.zh }))}
            value={preset}
            onChange={(v) => {
              presetRef.current = v
              setPreset(v)
              playingRef.current = true
              setPlaying(true)
            }}
          />
        </div>
        <p className="hint">
          拖动旋转视角 · 碰撞参数决定潮汐尾
          <br />
          1 秒 ≈ {(YR * speed).toFixed(2)} 亿年 · {speed}×
        </p>
      </div>
    </div>
  )
}
