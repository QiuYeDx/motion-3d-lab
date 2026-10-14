import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { SIMPLEX_3D, useShaderMaterial } from './glsl'

/*
 * 黄昏海面 — eight Gerstner waves displace a big non-uniform grid in the vertex shader; the fragment
 * shader re-evaluates the same eight waves per pixel for analytic normals and the Jacobian (crest
 * foam), adds capillary detail that fades with the pixel footprint, and shades with a fresnel mix of
 * the procedural sky (shared with the sky dome) over a deep-water body with subsurface glow on crests.
 * The boat samples the very same wave function on the CPU.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const G = 9.8
const NW = 8
const GRID_Z = -14 // grid centre: densest just in front of the camera
const CAM_Y = 3.2

/* ------------------------------------------------------------------ waves (shared CPU ↔ GPU) */

// [angle relative to the wind (deg), wavelength (m), base steepness]
const WAVES: [number, number, number][] = [
  [0, 38, 0.16],
  [24, 24, 0.14],
  [-31, 17, 0.13],
  [58, 11, 0.12],
  [-52, 7.6, 0.11],
  [12, 5.1, 0.1],
  [-78, 3.3, 0.09],
  [37, 2.2, 0.08],
]
const WIND = 12 // deg: waves roll in towards the camera, a little from the left
const WDIR = WAVES.map(([a]) => {
  const r = THREE.MathUtils.degToRad(a + WIND)
  return [Math.sin(r), Math.cos(r)] as const
})
const WK = WAVES.map(([, L]) => (2 * Math.PI) / L)

type SeaState = { zh: string; en: string; mul: number[]; foam: number; chop: number; sss: number }
const SEAS: SeaState[] = [
  { zh: '平静', en: 'Calm', mul: [0.16, 0.18, 0.2, 0.26, 0.3, 0.36, 0.42, 0.5], foam: 0.12, chop: 0.55, sss: 0.7 },
  { zh: '微浪', en: 'Breeze', mul: [0.55, 0.55, 0.58, 0.6, 0.64, 0.66, 0.7, 0.72], foam: 0.56, chop: 1, sss: 1 },
  { zh: '大浪', en: 'Swell', mul: [1.06, 1.0, 0.95, 0.9, 0.86, 0.8, 0.74, 0.7], foam: 0.74, chop: 1.35, sss: 1.25 },
]

// capillary detail: normal-only waves (dir.xy, k, slope)
const DETAIL = [
  [0.42, 0.91, 5.7, 0.05],
  [-0.77, 0.64, 8.9, 0.045],
  [0.95, -0.31, 13.1, 0.04],
  [-0.2, -0.98, 19.7, 0.035],
  [0.61, 0.79, 29.3, 0.03],
]

/** displaced position of the undisplaced grid point (x0, z0) */
function gerstner(x0: number, z0: number, t: number, steep: number[], out: THREE.Vector3) {
  let dx = 0
  let dy = 0
  let dz = 0
  for (let i = 0; i < NW; i++) {
    const [Dx, Dz] = WDIR[i]
    const k = WK[i]
    const f = k * (Dx * x0 + Dz * z0) - Math.sqrt(G * k) * t
    const a = steep[i] / k
    const c = Math.cos(f)
    dx += Dx * a * c
    dz += Dz * a * c
    dy += a * Math.sin(f)
  }
  return out.set(x0 + dx, dy, z0 + dz)
}

/** water height at world (x, z): invert the horizontal Gerstner shift with a few fixed-point steps */
function heightAt(x: number, z: number, t: number, steep: number[], tmp: THREE.Vector3) {
  let x0 = x
  let z0 = z
  for (let i = 0; i < 4; i++) {
    gerstner(x0, z0, t, steep, tmp)
    x0 += x - tmp.x
    z0 += z - tmp.z
  }
  return gerstner(x0, z0, t, steep, tmp).y
}

/* ------------------------------------------------------------------ time of day */

type Tod = {
  zh: string
  clock: string
  dot: string
  c: Record<'zenith' | 'mid' | 'horizon' | 'glow' | 'sun' | 'cloudLit' | 'cloudDark' | 'deep' | 'sss' | 'sail', string>
  n: Record<'el' | 'az' | 'sunSize' | 'sunInt' | 'glowInt' | 'stars' | 'cloud' | 'exposure' | 'spec' | 'hemi' | 'key' | 'fog' | 'sailGlow', number>
}
const TODS: Tod[] = [
  {
    zh: '黄昏',
    clock: '18:42',
    dot: '#ff9a5a',
    c: { zenith: '#141b48', mid: '#5b4590', horizon: '#ff9a5c', glow: '#ff7436', sun: '#ffc489', cloudLit: '#ff8a64', cloudDark: '#3d2c58', deep: '#07103a', sss: '#2a7a80', sail: '#ffb27a' },
    n: { el: 2.4, az: 0, sunSize: 0.028, sunInt: 26, glowInt: 1, stars: 0, cloud: 0.9, exposure: 1, spec: 1.6, hemi: 0.9, key: 2.6, fog: 0.0042, sailGlow: 0.35 },
  },
  {
    zh: '蓝调时刻',
    clock: '19:26',
    dot: '#8fa8ff',
    c: { zenith: '#081233', mid: '#1d3470', horizon: '#9a86b8', glow: '#7f9be6', sun: '#d9e4ff', cloudLit: '#a497cf', cloudDark: '#18234c', deep: '#040b1e', sss: '#1a4c7c', sail: '#8fa8ff' },
    n: { el: 9, az: 7, sunSize: 0.011, sunInt: 22, glowInt: 0.4, stars: 1, cloud: 0.6, exposure: 1.15, spec: 0.9, hemi: 0.9, key: 0.9, fog: 0.0038, sailGlow: 0.08 },
  },
  {
    zh: '正午',
    clock: '12:04',
    dot: '#ffe08a',
    c: { zenith: '#1f5fbf', mid: '#5c9ee0', horizon: '#c9e1f0', glow: '#fff1d0', sun: '#fff6e6', cloudLit: '#ffffff', cloudDark: '#9fb6d0', deep: '#03284a', sss: '#14a89c', sail: '#fff4de' },
    n: { el: 26, az: 6, sunSize: 0.02, sunInt: 40, glowInt: 0.45, stars: 0, cloud: 0.65, exposure: 0.85, spec: 2.2, hemi: 2.2, key: 3.2, fog: 0.0032, sailGlow: 0.42 },
  },
]
type TodVals = Record<string, number[]>
const lin = (hex: string) => {
  const c = new THREE.Color(hex) // ColorManagement: sRGB hex → linear working space
  return [c.r, c.g, c.b]
}
function todVals(t: Tod): TodVals {
  const o: TodVals = {}
  for (const [k, v] of Object.entries(t.c)) o[k] = lin(v)
  for (const [k, v] of Object.entries(t.n)) o[k] = [v]
  return o
}

/* ------------------------------------------------------------------ shaders */

const SKY = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith, uMid, uHorizon, uGlow, uSunCol, uCloudLit, uCloudDark;
uniform float uSunSize, uSunInt, uGlowInt, uStars, uCloud, uTime;

${SIMPLEX_3D}

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

// clouds: 1 = draw cloud streaks, disk: 1 = draw the sun disk
vec3 skyCol(vec3 d, float clouds, float disk) {
  float y = max(d.y, 0.0);
  float mu = dot(d, uSunDir);
  vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.2, pow(y, 0.8)));
  c = mix(c, uZenith, smoothstep(0.06, 0.55, y));
  // the warm band of the horizon reaches round towards the sun's azimuth
  float az = max(dot(normalize(d.xz + 1e-5), normalize(uSunDir.xz + 1e-5)), 0.0);
  float mup = max(mu, 0.0);
  c += uGlow * uGlowInt * ((0.18 * pow(mup, 4.0) + 0.5 * pow(mup, 16.0)) * exp(-y * 5.0) + 0.3 * exp(-y * 12.0) * az * az + 1.4 * pow(mup, 120.0));
  if (disk > 0.5) {
    float dd = smoothstep(cos(uSunSize * 1.3), cos(uSunSize), mu) * smoothstep(-0.002, 0.004, d.y);
    c += uSunCol * uSunInt * dd;
  }
  if (clouds > 0.5 && y > 0.0) {
    // thin stratus streaks low over the sea, lit from the sun's side
    vec2 cp = d.xz / (y + 0.07);
    float n = snoise(vec3(cp.x * 0.16 + uTime * 0.006, cp.y * 0.55, 1.7)) * 0.65 + snoise(vec3(cp.x * 0.5, cp.y * 1.7 - uTime * 0.004, 4.3)) * 0.35;
    float cl = smoothstep(0.08, 0.7, n) * smoothstep(0.012, 0.07, y) * smoothstep(0.42, 0.1, y) * uCloud;
    vec3 cc = mix(uCloudDark, uCloudLit, pow(mup * 0.5 + 0.5, 4.0) * (0.6 + 0.4 * exp(-y * 6.0)));
    c = mix(c, cc, cl * 0.85);
  }
  return c;
}
`

const OCEAN_VERT = /* glsl */ `
uniform vec4 uWave[${NW}];
uniform float uTime;
attribute float aSpacing;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec2 x0 = p.xz;
  vec3 disp = vec3(0.0);
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uWave[i];
    float k = w.z;
    float L = 6.2831853 / k;
    // waves the local grid can't resolve are left to the per-pixel normals
    float a = w.w / k * smoothstep(3.5 * aSpacing, 7.0 * aSpacing, L);
    float f = k * dot(w.xy, x0) - sqrt(9.8 * k) * uTime;
    float c = cos(f);
    disp += vec3(w.x * a * c, a * sin(f), w.y * a * c);
  }
  p += disp;
  vWorld = p;
  vXZ = x0;
  vH = disp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`

const OCEAN_FRAG = /* glsl */ `
uniform vec4 uWave[${NW}];
uniform vec3 uDeep, uSss;
uniform float uSpec, uFoam, uChop, uSssK, uAmp, uFogD;
varying vec3 vWorld;
varying vec2 vXZ;
varying float vH;
${SKY}

const vec4 DET[5] = vec4[5](${DETAIL.map((d) => `vec4(${d.map((x) => x.toFixed(3)).join(', ')})`).join(', ')});

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 x0 = vXZ;
  float foot = max(length(fwidth(x0)), 1e-4); // metres per pixel

  // ---- analytic Gerstner normal + Jacobian, re-evaluated per pixel
  vec3 T = vec3(1.0, 0.0, 0.0);
  vec3 B = vec3(0.0, 0.0, 1.0);
  float jxx = 1.0, jzz = 1.0, jxz = 0.0;
  for (int i = 0; i < ${NW}; i++) {
    vec4 w = uWave[i];
    float k = w.z;
    float L = 6.2831853 / k;
    float s = w.w * (1.0 - smoothstep(L * 0.07, L * 0.28, foot));
    float f = k * dot(w.xy, x0) - sqrt(9.8 * k) * uTime;
    float sn = sin(f) * s;
    float cs = cos(f) * s;
    T += vec3(-w.x * w.x * sn, w.x * cs, -w.x * w.y * sn);
    B += vec3(-w.x * w.y * sn, w.y * cs, -w.y * w.y * sn);
    jxx -= w.x * w.x * sn;
    jzz -= w.y * w.y * sn;
    jxz -= w.x * w.y * sn;
  }
  vec3 N = normalize(cross(B, T));

  // ---- capillary ripples (normal only), gone once a pixel covers them
  vec2 g = vec2(0.0);
  for (int j = 0; j < 5; j++) {
    vec4 d = DET[j];
    float L = 6.2831853 / d.z;
    float fade = 1.0 - smoothstep(L * 0.12, L * 0.45, foot);
    float f = d.z * dot(d.xy, x0) - sqrt(9.8 * d.z) * uTime * 1.1 + float(j) * 1.7;
    g += d.xy * d.w * cos(f) * fade;
  }
  N = normalize(N - vec3(g.x, 0.0, g.y) * uChop);
  float rough = smoothstep(0.015, 1.6, foot);

  vec3 L = uSunDir;
  float sunVis = smoothstep(-0.03, 0.02, L.y);

  // ---- reflection
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.002;
  R = normalize(R);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  F = mix(F, 0.6, rough * 0.35);
  vec3 refl = skyCol(R, 1.0, 0.0);

  // ---- water body + light leaking through thin crests (strongest when looking into the light)
  float diff = max(dot(N, L), 0.0);
  vec3 body = uDeep * (0.6 + 0.4 * diff);
  float crest = clamp(vH / max(uAmp, 0.05) * 0.55 + 0.35, 0.0, 1.0);
  float into = pow(max(dot(normalize(-V.xz), normalize(L.xz + 1e-5)), 0.0), 3.0);
  body += uSss * crest * crest * (0.25 + 0.75 * into) * pow(1.0 - ndv, 1.5) * uSssK * (1.0 - smoothstep(40.0, 220.0, dist)) * (0.3 + 0.7 * sunVis);
  vec3 col = mix(body, refl, F);

  // ---- the sun path: a tight lobe that widens with distance, plus twinkling facets
  float mu = max(dot(R, L), 0.0);
  float shine = mix(1400.0, 70.0, rough);
  float spec = pow(mu, shine) * (shine + 8.0) / 60.0 + pow(mu, 24.0) * 0.06;
  // sparkles: one random point per 12 cm cell, drawn ~1 px wide, only on facets near the sun lobe
  vec2 cell = floor(x0 * 8.0);
  float fr = floor(uTime * 6.0);
  float sp = hash12(cell + fr * 13.37);
  vec2 spo = vec2(hash12(cell + 3.1 + fr), hash12(cell - 5.7 + fr)) * 0.8 + 0.1;
  float spd = length(fract(x0 * 8.0) - spo) / 8.0;
  spec += step(0.97, sp) * smoothstep(foot * 1.6, foot * 0.4, spd) * pow(mu, 180.0) * 40.0 * (1.0 - rough);
  col += uSunCol * uSpec * spec * sunVis;

  // ---- foam where the surface bunches up (Jacobian < threshold)
  float J = jxx * jzz - jxz * jxz;
  if (J < uFoam + 0.05) {
    float n1 = snoise(vec3(x0 * 0.32, uTime * 0.12)) * 0.5 + 0.5;
    float n2 = snoise(vec3(x0 * 1.5 + 7.0, uTime * 0.3)) * 0.5 + 0.5;
    float n3 = snoise(vec3(x0 * 4.2 - 3.0, uTime * 0.5)) * 0.5 + 0.5;
    float m = smoothstep(uFoam, uFoam - 0.2, J);
    // lacy whitecaps: the mask eats into the noise, so thin foam breaks into filaments
    float foam = smoothstep(0.62 - m * 0.3, 0.7 - m * 0.3, n1 * 0.45 + n2 * 0.35 + n3 * 0.3) * m;
    foam *= 1.0 - smoothstep(40.0, 170.0, dist);
    vec3 foamCol = mix(uMid, uHorizon, 0.5) * 0.75 + uSunCol * (0.25 + 0.6 * diff) * sunVis * 0.6;
    col = mix(col, foamCol, foam * 0.9);
  }

  // ---- distance haze into the horizon colour of the same sky
  vec3 haze = skyCol(normalize(vec3(-V.x, 0.0, -V.z)), 0.0, 0.0);
  float fog = 1.0 - exp(-dist * uFogD);
  fog = max(fog, smoothstep(300.0, 620.0, dist));
  col = mix(col, haze, fog);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`

const DOME_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const DOME_FRAG = /* glsl */ `
varying vec3 vWorld;
${SKY}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c;
  if (d.y < 0.0) {
    c = skyCol(normalize(vec3(d.x, 0.0, d.z)), 0.0, 0.0);
  } else {
    c = skyCol(d, 1.0, 1.0);
    if (uStars > 0.001) {
      vec3 sd = d * 240.0;
      vec3 id = floor(sd);
      float h = hash13(id);
      float st = step(0.992, h) * smoothstep(0.42, 0.0, length(fract(sd) - 0.5));
      st *= 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
      c += vec3(0.9, 0.95, 1.0) * st * uStars * smoothstep(0.06, 0.35, d.y) * 1.6;
    }
  }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
}
`

/* ------------------------------------------------------------------ geometry */

function makeGrid(n: number) {
  // non-uniform grid: ~0.2 m cells around the centre, growing to ~600 m at the rim
  const A = 40
  const B = 600
  const map = (u: number) => Math.sign(u) * (A * Math.abs(u) + B * u ** 4)
  const dmap = (u: number) => A + 4 * B * Math.abs(u) ** 3
  const v = n + 1
  const pos = new Float32Array(v * v * 3)
  const sp = new Float32Array(v * v)
  for (let j = 0; j < v; j++) {
    for (let i = 0; i < v; i++) {
      const u = -1 + (2 * i) / n
      const w = -1 + (2 * j) / n
      const k = j * v + i
      pos[k * 3] = map(u)
      pos[k * 3 + 2] = map(w)
      sp[k] = (Math.max(dmap(u), dmap(w)) * 2) / n
    }
  }
  const idx = new Uint32Array(n * n * 6)
  let o = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * v + i
      const b = a + 1
      const c = a + v
      const d = c + 1
      idx[o++] = a
      idx[o++] = c
      idx[o++] = b
      idx[o++] = b
      idx[o++] = c
      idx[o++] = d
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSpacing', new THREE.BufferAttribute(sp, 1))
  g.setIndex(new THREE.BufferAttribute(idx, 1))
  return g
}

function makeHull() {
  // stations along the keel: z, half-beam, sheer height
  const st: [number, number, number][] = [
    [-1.62, 0.5, 0.42],
    [-1.1, 0.62, 0.38],
    [-0.4, 0.67, 0.36],
    [0.3, 0.63, 0.38],
    [0.9, 0.5, 0.43],
    [1.4, 0.28, 0.5],
    [1.78, 0.0, 0.6],
  ]
  const ring = (s: [number, number, number]) => {
    const [z, w, h] = s
    const bow = Math.max(0, (z - 0.9) / 0.9)
    return [
      new THREE.Vector3(-w, h, z),
      new THREE.Vector3(-w * 0.86, -0.06, z),
      new THREE.Vector3(0, -0.36 + bow * 0.3, z),
      new THREE.Vector3(w * 0.86, -0.06, z),
      new THREE.Vector3(w, h, z),
    ]
  }
  const rings = st.map(ring)
  const tri: THREE.Vector3[] = []
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tri.push(a, b, c, a, c, d)
  for (let s = 0; s < rings.length - 1; s++) {
    const r0 = rings[s]
    const r1 = rings[s + 1]
    for (let k = 0; k < 4; k++) quad(r0[k], r0[k + 1], r1[k + 1], r1[k])
  }
  // transom
  const t = rings[0]
  tri.push(t[0], t[2], t[1], t[0], t[4], t[2], t[2], t[4], t[3])
  const hull = new THREE.BufferGeometry().setFromPoints(tri)
  hull.computeVertexNormals()

  // deck: a fan over the gunwale, slightly sunk
  const d: THREE.Vector3[] = []
  const c = new THREE.Vector3(0, 0.33, 0)
  const rim = [...rings.map((r) => r[4]), ...rings.slice().reverse().map((r) => r[0])]
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i].clone().setY(rim[i].y - 0.05)
    const b = rim[(i + 1) % rim.length].clone().setY(rim[(i + 1) % rim.length].y - 0.05)
    d.push(c, b, a)
  }
  const deck = new THREE.BufferGeometry().setFromPoints(d)
  deck.computeVertexNormals()

  // mainsail with a little belly, and a jib
  const sail: THREE.Vector3[] = []
  const tack = new THREE.Vector3(0, 0.75, 0.42)
  const head = new THREE.Vector3(0, 4.0, 0.42)
  const clew = new THREE.Vector3(0, 0.82, -1.45)
  const belly = (p: THREE.Vector3, k: number) => p.clone().setX(p.x + k)
  const mid1 = belly(tack.clone().lerp(clew, 0.5), 0.12)
  const mid2 = belly(head.clone().lerp(clew, 0.5), 0.2)
  const mid3 = belly(tack.clone().lerp(head, 0.5), 0.05)
  sail.push(tack, mid1, mid3, mid1, mid2, mid3, mid1, clew, mid2, mid3, mid2, head)
  const jibHead = new THREE.Vector3(0, 3.3, 0.46)
  const jibTack = new THREE.Vector3(0, 0.62, 1.7)
  const jibClew = new THREE.Vector3(0.1, 0.8, 0.62)
  const jm = belly(jibHead.clone().lerp(jibClew, 0.5), 0.1)
  sail.push(jibHead, jibTack, jm, jm, jibTack, jibClew)
  const sails = new THREE.BufferGeometry().setFromPoints(sail)
  sails.computeVertexNormals()
  return { hull, deck, sails }
}

/* ------------------------------------------------------------------ scene */

type Shared = {
  sea: React.RefObject<number[]> // current per-wave steepness
  seaX: React.RefObject<{ foam: number; chop: number; sss: number }>
  tod: React.RefObject<TodVals>
  px: MotionValue<number>
  py: MotionValue<number>
}

function Ocean({ sea, seaX, tod, px, py }: Shared) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)

  const U = useMemo(
    () => ({
      uTime: { value: 0 },
      uWave: { value: Array.from({ length: NW }, (_, i) => new THREE.Vector4(WDIR[i][0], WDIR[i][1], WK[i], 0)) },
      uSunDir: { value: new THREE.Vector3(0, 0.05, -1).normalize() },
      uZenith: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color() },
      uSss: { value: new THREE.Color() },
      uSunSize: { value: 0.02 },
      uSunInt: { value: 20 },
      uGlowInt: { value: 1 },
      uStars: { value: 0 },
      uCloud: { value: 1 },
      uSpec: { value: 1 },
      uFoam: { value: 0.5 },
      uChop: { value: 1 },
      uSssK: { value: 1 },
      uAmp: { value: 1 },
      uFogD: { value: 0.004 },
    }),
    [],
  )
  const oceanMat = useShaderMaterial(() => ({ vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, uniforms: U, side: THREE.DoubleSide }))
  const domeMat = useShaderMaterial(() => ({ vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: U, side: THREE.BackSide, depthWrite: false }))
  const grid = useMemo(() => makeGrid(MOBILE ? 220 : 420), [])
  const boatGeo = useMemo(() => makeHull(), [])
  useEffect(
    () => () => {
      grid.dispose()
      boatGeo.hull.dispose()
      boatGeo.deck.dispose()
      boatGeo.sails.dispose()
    },
    [grid, boatGeo],
  )

  const boat = useRef<THREE.Group>(null)
  const sailMat = useRef<THREE.MeshStandardMaterial>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const tmp = useMemo(
    () => ({ t: POSTER ? 14 : 0, v: new THREE.Vector3(), look: new THREE.Vector3(), e: new THREE.Euler(0, 0, 0, 'YXZ'), y: 0, pitch: 0, roll: 0, init: false }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    tmp.t += dt
    const t = tmp.t
    const steep = sea.current
    const P = tod.current

    /* ---- uniforms */
    U.uTime.value = t
    let amp = 0
    for (let i = 0; i < NW; i++) {
      U.uWave.value[i].w = steep[i]
      amp += steep[i] / WK[i]
    }
    U.uAmp.value = amp
    const el = THREE.MathUtils.degToRad(P.el[0])
    const az = THREE.MathUtils.degToRad(P.az[0])
    U.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el))
    U.uZenith.value.fromArray(P.zenith)
    U.uMid.value.fromArray(P.mid)
    U.uHorizon.value.fromArray(P.horizon)
    U.uGlow.value.fromArray(P.glow)
    U.uSunCol.value.fromArray(P.sun)
    U.uCloudLit.value.fromArray(P.cloudLit)
    U.uCloudDark.value.fromArray(P.cloudDark)
    U.uDeep.value.fromArray(P.deep)
    U.uSss.value.fromArray(P.sss)
    U.uSunSize.value = P.sunSize[0]
    U.uSunInt.value = P.sunInt[0]
    U.uGlowInt.value = P.glowInt[0]
    U.uStars.value = P.stars[0]
    U.uCloud.value = P.cloud[0]
    U.uSpec.value = P.spec[0]
    U.uFogD.value = P.fog[0]
    const sx = seaX.current
    U.uFoam.value = sx.foam
    U.uChop.value = sx.chop
    U.uSssK.value = sx.sss
    gl.toneMappingExposure = P.exposure[0]

    /* ---- lights follow the sky */
    if (key.current) {
      key.current.position.copy(U.uSunDir.value).multiplyScalar(60)
      key.current.color.fromArray(P.sun)
      key.current.intensity = P.key[0] * THREE.MathUtils.smoothstep(P.el[0], -2, 3)
    }
    if (hemi.current) {
      hemi.current.color.fromArray(P.mid)
      hemi.current.groundColor.fromArray(P.deep)
      hemi.current.intensity = P.hemi[0]
    }
    if (sailMat.current) {
      sailMat.current.emissive.fromArray(P.sail)
      sailMat.current.emissiveIntensity = P.sailGlow[0]
    }

    /* ---- camera: sun a little right of centre on desktop, pointer pans gently */
    const portrait = size.width < size.height
    const mobile = size.width < 760
    const fov = portrait ? 62 : 50
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const yaw0 = POSTER || mobile ? 0.02 : -0.13
    const pitch0 = portrait ? -0.13 : -0.11
    const yaw = yaw0 + px.get() * 0.07 - Math.sin(t * 0.05) * 0.015
    const pitch = pitch0 + py.get() * 0.03
    camera.position.set(px.get() * 0.5, CAM_Y + Math.sin(t * 0.4) * 0.05 + py.get() * 0.15, 0)
    tmp.look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).add(camera.position)
    camera.lookAt(tmp.look)

    /* ---- boat rides the same Gerstner sea */
    const g = boat.current
    if (g) {
      const heading = 2.05 + Math.sin(t * 0.07) * 0.12
      const bx = (mobile && !POSTER ? -1.9 : -2.5) + Math.sin(t * 0.045) * 0.35
      const bz = -21
      const hx = Math.sin(heading)
      const hz = Math.cos(heading)
      const v = tmp.v
      const len = 1.5
      const beam = 0.55
      const hb = heightAt(bx + hx * len, bz + hz * len, t, steep, v)
      const hs = heightAt(bx - hx * len, bz - hz * len, t, steep, v)
      const hp = heightAt(bx + hz * beam, bz - hx * beam, t, steep, v)
      const hq = heightAt(bx - hz * beam, bz + hx * beam, t, steep, v)
      const hc = heightAt(bx, bz, t, steep, v)
      const y = hc * 0.5 + (hb + hs + hp + hq) * 0.125
      const pitch = -Math.atan2(hb - hs, len * 2)
      const roll = Math.atan2(hp - hq, beam * 2)
      if (!tmp.init) {
        tmp.init = true
        tmp.y = y
        tmp.pitch = pitch
        tmp.roll = roll
      }
      // a little inertia: the hull lags the surface it sits on
      tmp.y = THREE.MathUtils.damp(tmp.y, y, 6, dt)
      tmp.pitch = THREE.MathUtils.damp(tmp.pitch, pitch, 4, dt)
      tmp.roll = THREE.MathUtils.damp(tmp.roll, roll, 3.5, dt)
      g.position.set(bx, tmp.y - 0.04, bz)
      tmp.e.set(tmp.pitch, heading, tmp.roll + Math.sin(t * 0.9) * 0.015)
      g.quaternion.setFromEuler(tmp.e)
    }
  })

  return (
    <>
      <mesh material={domeMat} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1800, 48, 24]} />
      </mesh>
      <mesh geometry={grid} material={oceanMat} position={[0, 0, GRID_Z]} frustumCulled={false} />
      <hemisphereLight ref={hemi} />
      <directionalLight ref={key} />
      <group ref={boat}>
        <mesh geometry={boatGeo.hull}>
          <meshStandardMaterial color="#3b2722" roughness={0.75} flatShading />
        </mesh>
        <mesh geometry={boatGeo.deck}>
          <meshStandardMaterial color="#9a7652" roughness={0.8} flatShading />
        </mesh>
        <mesh position={[0, 2.3, 0.42]}>
          <cylinderGeometry args={[0.035, 0.05, 4.1, 6]} />
          <meshStandardMaterial color="#2a1f1c" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.8, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.9, 5]} />
          <meshStandardMaterial color="#2a1f1c" roughness={0.6} />
        </mesh>
        <mesh geometry={boatGeo.sails}>
          <meshStandardMaterial ref={sailMat} color="#efe4d0" roughness={0.9} side={THREE.DoubleSide} flatShading />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function SunsetOcean() {
  const [seaIdx, setSeaIdx] = useState(1)
  const [todIdx, setTodIdx] = useState(0)
  const [dpr, setDpr] = useState<number>(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MOBILE ? 1.5 : 1.75))

  const sea = useRef<number[]>(WAVES.map(([, , s], i) => s * SEAS[1].mul[i]))
  const seaX = useRef({ foam: SEAS[1].foam, chop: SEAS[1].chop, sss: SEAS[1].sss })
  const tod = useRef<TodVals>(todVals(TODS[0]))

  // pointer → gentle camera pan (Motion springs, read in useFrame)
  const px = useSpring(0, { stiffness: 18, damping: 12, mass: 1.2 })
  const py = useSpring(0, { stiffness: 18, damping: 12, mass: 1.2 })

  // sea state: every wave's steepness eases to its new value
  useEffect(() => {
    const from = [...sea.current]
    const fx = { ...seaX.current }
    const S = SEAS[seaIdx]
    const to = WAVES.map(([, , s], i) => s * S.mul[i])
    const c = animate(0, 1, {
      duration: 2.6,
      ease: [0.45, 0, 0.25, 1],
      onUpdate: (k) => {
        for (let i = 0; i < NW; i++) sea.current[i] = from[i] + (to[i] - from[i]) * k
        seaX.current.foam = fx.foam + (S.foam - fx.foam) * k
        seaX.current.chop = fx.chop + (S.chop - fx.chop) * k
        seaX.current.sss = fx.sss + (S.sss - fx.sss) * k
      },
    })
    return () => c.stop()
  }, [seaIdx])

  // time of day: sky, sun and water colours cross-fade from whatever is on screen
  useEffect(() => {
    const from: TodVals = {}
    for (const [k, v] of Object.entries(tod.current)) from[k] = [...v]
    const to = todVals(TODS[todIdx])
    const c = animate(0, 1, {
      duration: 2.4,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        for (const key in to) for (let i = 0; i < to[key].length; i++) tod.current[key][i] = from[key][i] + (to[key][i] - from[key][i]) * k
      },
    })
    return () => c.stop()
  }, [todIdx])

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    px.set(((e.clientX - r.left) / r.width) * 2 - 1)
    py.set(-(((e.clientY - r.top) / r.height) * 2 - 1))
  }
  const onLeave = () => {
    px.set(0)
    py.set(0)
  }

  const T = TODS[todIdx]
  const S = SEAS[seaIdx]

  return (
    <div className="stage so" style={{ background: '#120f1f' }} onPointerMove={onMove} onPointerLeave={onLeave}>
      <style>{css}</style>
      <Canvas dpr={dpr} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }} camera={{ fov: 50, near: 0.1, far: 4000, position: [0, CAM_Y, 0] }}>
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.75, d * 0.8))} flipflops={3} />
        <Ocean sea={sea} seaX={seaX} tod={tod} px={px} py={py} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="so-copy soft-text"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="so-kicker">
            <i style={{ background: T.dot, boxShadow: `0 0 12px ${T.dot}` }} />
            <span>GERSTNER × 8 ·</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={T.clock}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                {T.clock}
              </motion.span>
            </AnimatePresence>
          </p>
          <h1>海，永远不重复</h1>
          <p className="so-sub">八组 Gerstner 波在顶点里叠加，菲涅尔把天空映进每一道浪；小船读取同一个波函数，随浪起伏。</p>
          <p className="so-state">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={S.en}
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.45 }}
              >
                Σ steepness {WAVES.reduce((a, [, , s], i) => a + s * S.mul[i], 0).toFixed(2)} · {S.en}
              </motion.span>
            </AnimatePresence>
          </p>
        </motion.div>

        <div className="dock">
          <Seg items={SEAS.map((s, i) => ({ value: i, label: s.zh }))} value={seaIdx} onChange={setSeaIdx} />
          <span className="dock-sep" />
          <Seg items={TODS.map((t, i) => ({ value: i, label: t.zh }))} value={todIdx} onChange={setTodIdx} />
        </div>
        <p className="hint">移动指针 · 视线随之轻移</p>
      </div>
    </div>
  )
}

const css = `
.so-copy {
  --soft-bg: #07080f;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 112px;
  max-width: 430px; pointer-events: none !important;
}
.so-copy { isolation: isolate; }
.so-copy::before {
  content: ''; position: absolute; z-index: -1; left: -140px; right: -160px; top: -90px; bottom: -70px;
  background: radial-gradient(closest-side, rgba(6, 8, 18, .42), rgba(6, 8, 18, .2) 55%, transparent);
  pointer-events: none;
}
.so-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.so-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.6s, box-shadow 1.6s; }
.so-kicker span { display: inline-block; }
.so-copy h1 { margin: 0; font: 600 clamp(34px, 4vw, 56px)/1.06 var(--display); letter-spacing: -.035em; }
.so-sub { margin: 14px 0 0; font-size: 14.5px; line-height: 1.75; color: var(--fg-2); }
.so-state { margin: 18px 0 0; min-height: 18px; font: 500 11.5px/1.5 var(--mono); letter-spacing: .04em; color: var(--fg-2); opacity: .8 }
.so-state span { display: inline-block }
@media (max-width: 760px) {
  .so .dock .seg { padding: 0 10px; }
  .so-copy { bottom: 96px; right: 24px; }
  .so-copy h1 { font-size: 32px; }
  .so-sub { font-size: 13px; }
  .so-state { display: none }
}
`
