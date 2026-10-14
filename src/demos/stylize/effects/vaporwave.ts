import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 蒸汽波 — an aesthetic recolour, not a glitch: the scene keeps its shapes and lighting, but every surface is
 * re-cast as glossy pastel plaster under a synthetic sunset, and the empty background becomes the vaporwave set.
 *
 * OBJECTS (coverage > 0)
 *   gradient map: scene luma → a 64-px palette strip. Two strips (warm / cool): the source hue picks the blend, so a
 *   red thing turns pink, a blue thing turns cyan / violet, a neutral thing takes the mode's default (`neutral`).
 *   The strips are one 64×2 DataTexture, re-blended on the CPU while a mode crossfades (128 px — free).
 *   Gloss: a fake chrome environment (view-space reflection vector → sky / horizon line / floor colours),
 *   a two-tone specular (cyan Blinn highlight on the key side, magenta rim on the shade side), crisp "bubble"
 *   highlights (Y2K) and faint marble veins (plaster).
 * BACKGROUND (coverage = 0), drawn in screen space (no geometry needed)
 *   sky gradient + stars / sparkles, a striped retro sun (gaps widen toward the bottom and drift down), a sun glow,
 *   and below the horizon a fake-perspective floor: glowing grid lines scrolling toward the viewer (analytic AA +
 *   glow from the per-px footprint), or a box-filtered checkerboard, a sun reflection streak and horizon haze.
 * SIGNAL
 *   VHS tracking: a soft band that rolls down the frame and shears its lines sideways, a little line wobble,
 *   chroma offset (red / blue channels composite the object at ±1.6 CSS px), faint scanlines, grain, vignette;
 *   soft bloom from bright scene areas and a backlit halo around silhouettes (one 12-tap loop).
 *
 * All modes are uniform values blended on the CPU — the shader has no per-mode branches.
 * The page can place the sun / horizon (`setVaporwaveLayout`) and the grid speed (`setVaporwaveGridSpeed`).
 */

export const vaporwaveModes = [
  { id: 'sunset', label: '日落' },
  { id: 'y2k', label: '千禧' },
  { id: 'plaster', label: '蒸汽石膏' },
] as const
export type VaporwaveMode = (typeof vaporwaveModes)[number]['id']

export const vaporwaveMeta = { title: '蒸汽波', en: 'Vaporwave', background: '#2a1240', theme: 'dark' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
const hex = (h: string): V3 => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

type Look = {
  warm: string[] // gradient map stops, dark → light (sRGB)
  cool: string[]
  skyTop: string
  skyMid: string
  skyHz: string
  sunTop: string
  sunBot: string
  glow: string
  grid: string
  floor: string
  chkA: string
  chkB: string
  specA: string // highlight
  specB: string // shade rim
  envSky: string
  envFloor: string
  checker: number
  chrome: number
  bubbles: number
  vein: number
  stars: number
  sparkle: number
  neutral: number // coolness given to grey / white objects
  vhs: number
  speed: number // grid speed factor
  gamma: number // gradient-map gamma (> 1 = more of the dark end)
  bloom: number
}

const LOOK: Record<VaporwaveMode, Look> = {
  sunset: {
    warm: ['#1c0a3a', '#5e1868', '#d33f97', '#ff8fc0', '#ffd9cf'],
    cool: ['#140c40', '#33288a', '#5a63d8', '#62d4ff', '#dcfaff'],
    skyTop: '#12062a',
    skyMid: '#5a1a6e',
    skyHz: '#ff6f91',
    sunTop: '#ffe46b',
    sunBot: '#ff2f8e',
    glow: '#ff5fa8',
    grid: '#ff43e0',
    floor: '#140630',
    chkA: '#1b0838',
    chkB: '#3a1060',
    specA: '#7ff6ff',
    specB: '#ff3fb4',
    envSky: '#ffb0d8',
    envFloor: '#2a0b4a',
    checker: 0,
    chrome: 0.22,
    bubbles: 0.15,
    vein: 0,
    stars: 1,
    sparkle: 0.2,
    neutral: 0.05,
    vhs: 1,
    speed: 1,
    gamma: 1,
    bloom: 1,
  },
  y2k: {
    warm: ['#161244', '#5a4fb8', '#b49cff', '#f5c8f0', '#f4ecff'],
    cool: ['#06173a', '#1b56a0', '#45bfee', '#a2e4fb', '#e4f6ff'],
    skyTop: '#040d2c',
    skyMid: '#173f8f',
    skyHz: '#9ee9ff',
    sunTop: '#ffffff',
    sunBot: '#62c8ff',
    glow: '#7fe0ff',
    grid: '#6ff2ff',
    floor: '#030c26',
    chkA: '#06173a',
    chkB: '#0f2c5c',
    specA: '#ffffff',
    specB: '#ff7ae6',
    envSky: '#b4e4ff',
    envFloor: '#2c5c9e',
    checker: 0,
    chrome: 0.62,
    bubbles: 1,
    vein: 0,
    stars: 0.35,
    sparkle: 1,
    neutral: 0.9,
    vhs: 0.7,
    speed: 1.25,
    gamma: 1.1,
    bloom: 0.8,
  },
  plaster: {
    warm: ['#7a5a86', '#c487ab', '#eeb0c6', '#f9cddb', '#ffe4ec'],
    cool: ['#3c7a84', '#66afac', '#98d8cd', '#c3ece4', '#e2f6f1'],
    skyTop: '#86d4cf',
    skyMid: '#bfe9e2',
    skyHz: '#ffd0e0',
    sunTop: '#fff2c8',
    sunBot: '#ff9fc3',
    glow: '#b86a90',
    grid: '#ffffff',
    floor: '#e9b8cf',
    chkA: '#fbdbe7',
    chkB: '#5fb9b3',
    specA: '#ffffff',
    specB: '#ff9cc8',
    envSky: '#d9fbf4',
    envFloor: '#e7a6c6',
    checker: 1,
    chrome: 0.1,
    bubbles: 0.25,
    vein: 1,
    stars: 0,
    sparkle: 0.15,
    neutral: 0.42,
    vhs: 0.55,
    speed: 0.7,
    gamma: 1.55,
    bloom: 0.3,
  },
}
const MODES = vaporwaveModes.map((m) => m.id)
const COLOR_KEYS = ['skyTop', 'skyMid', 'skyHz', 'sunTop', 'sunBot', 'glow', 'grid', 'floor', 'chkA', 'chkB', 'specA', 'specB', 'envSky', 'envFloor'] as const

/* gradient strips, built once per module (3 modes × 2 rows × 64 px) */
const PAL_W = 64
let STRIPS: Float32Array[] | null = null
function strips() {
  if (STRIPS) return STRIPS
  STRIPS = MODES.map((m) => {
    const out = new Float32Array(PAL_W * 2 * 3)
    ;[LOOK[m].warm, LOOK[m].cool].forEach((stops, row) => {
      const cs = stops.map(hex)
      for (let i = 0; i < PAL_W; i++) {
        const t = (i / (PAL_W - 1)) * (cs.length - 1)
        const k = Math.min(cs.length - 2, Math.floor(t))
        const f = t - k
        for (let c = 0; c < 3; c++) out[(row * PAL_W + i) * 3 + c] = cs[k][c] + (cs[k + 1][c] - cs[k][c]) * f
      }
    })
    return out
  })
  return STRIPS
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;
uniform vec3 uSkyTop, uSkyMid, uSkyHz, uSunTop, uSunBot, uGlow, uGrid, uFloor, uChkA, uChkB, uSpecA, uSpecB, uEnvSky, uEnvFloor;
uniform vec4 uAmt;    // x checker, y chrome, z bubbles, w vein
uniform vec4 uAmt2;   // x stars, y sparkle, z neutral coolness, w vhs
uniform vec3 uSun;    // x sun centre (0..1 of width), y horizon (0..1 from top), z sun radius (fraction of height)
uniform float uScroll;
uniform float uT;
uniform vec2 uTone;   // x gradient-map gamma, y bloom gain

vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec3 colL(vec2 p) {
  vec3 c = textureLod(tScene, p / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// warm (0) … cool (1): green → blue → violet count as cool, red / orange / yellow / magenta as warm
float coolness(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  float sat = d / (mx + 0.03);
  float h = 0.0;
  if (d > 1e-4) {
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
  }
  h /= 6.0;
  float cool = smoothstep(0.12, 0.3, h) * (1.0 - smoothstep(0.76, 0.9, h));
  return mix(uAmt2.z, cool, smoothstep(0.12, 0.35, sat));
}

// a glowing grid line: d = distance to the line in px, w = core half-width px, g = glow radius px
float gline(float d, float w, float g) {
  return (1.0 - smoothstep(w, w + 1.0, d)) + exp(-d / g) * 0.42;
}

// the vaporwave set, in CSS px (y up)
vec3 backdrop(vec2 cp, vec2 res) {
  float yTop = 1.0 - cp.y / res.y;
  float hz = uSun.y;
  float sy = clamp(yTop / hz, 0.0, 1.0);
  vec3 sky = mix(uSkyTop, uSkyMid, smoothstep(0.0, 0.7, sy));
  sky = mix(sky, uSkyHz, smoothstep(0.5, 1.0, sy) * smoothstep(0.5, 1.0, sy));

  // stars (tiny, twinkling) and sparkles (4-point glints)
  vec2 sc = cp / 34.0;
  vec2 si = floor(sc);
  float hs = hash12(si + 7.0);
  vec2 sp = (fract(sc) - 0.5 - (vec2(hash12(si + 1.3), hash12(si + 9.1)) - 0.5) * 0.6) * 34.0;
  float tw = 0.55 + 0.45 * sin(uT * (1.5 + hs * 3.0) + hs * 40.0);
  float upper = 1.0 - smoothstep(0.35, 0.9, sy);
  float star = step(0.86, hs) * exp(-dot(sp, sp) * 0.9) * tw * upper;
  float spk = step(0.93, hash12(si + 3.7)) * tw * tw;
  float glint = (exp(-abs(sp.y) * 1.3 - abs(sp.x) * 0.16) + exp(-abs(sp.x) * 1.3 - abs(sp.y) * 0.16)) * exp(-length(sp) * 0.12);
  sky += vec3(1.0, 0.95, 1.0) * star * uAmt2.x * 0.8;
  sky += vec3(0.85, 0.98, 1.0) * spk * glint * uAmt2.y * (1.0 - sy * 0.6);

  // the sun: centre sits a little above the horizon, the stripes cut its lower half
  float R = uSun.z * res.y;
  vec2 c0 = vec2(uSun.x * res.x, (1.0 - hz) * res.y + R * 0.3);
  vec2 d = cp - c0;
  float r = length(d) / R;
  float yy = d.y / R;
  vec3 sunC = mix(uSunBot, uSunTop, smoothstep(-0.85, 0.95, yy));
  float k = clamp((0.25 - yy) / 1.25, 0.0, 1.0);
  float per = max(R * 0.15, 6.0);
  float ph = fract((d.y + uT * per * 0.35) / per);
  float gapW = k * 0.62;
  float aa = 1.0 / per;
  float gap = step(yy, 0.25) * (1.0 - smoothstep(gapW - aa, gapW + aa, ph)) * smoothstep(0.0, 0.02, gapW);
  float disc = 1.0 - smoothstep(1.0 - 1.2 / R, 1.0 + 1.2 / R, r);
  float sunM = disc * (1.0 - gap);
  float o = max(r - 1.0, 0.0);
  vec3 col = sky + uGlow * (exp(-o * 4.0) * 0.45 + exp(-o * 1.2) * 0.22) * (1.0 - disc * 0.7);
  col = mix(col, sunC, sunM);

  // the floor
  if (yTop > hz) {
    float s = (yTop - hz) / (1.0 - hz);
    float zf = 1.0 / max(s, 1e-3);
    float sx = res.y * 0.36;
    float X = (cp.x - uSun.x * res.x) / sx * zf;
    float Z = zf * 1.15 + uScroll;
    float fwx = zf / sx;
    float fwz = 1.15 / (max(s * s, 1e-6) * (1.0 - hz) * res.y);
    float dx = (0.5 - abs(fract(X) - 0.5)) / fwx;
    float dz = (0.5 - abs(fract(Z) - 0.5)) / fwz;
    float lw = 0.45 + s * 1.3;
    float gg = 2.0 + s * 9.0;
    float fade = 1.0 - smoothstep(0.18, 0.75, max(fwx, fwz));
    float grid = max(gline(dx, lw, gg), gline(dz, lw, gg)) * fade;
    vec3 floorC = uFloor * (0.75 + 0.45 * s) + uGrid * (grid * 1.1 + (1.0 - fade) * 0.18);

    // box-filtered checkerboard (plaster)
    vec2 q = vec2(X, Z);
    vec2 w = vec2(fwx, fwz) * 1.4 + 1e-4;
    vec2 ii = 2.0 * (abs(fract((q - 0.5 * w) * 0.5) - 0.5) - abs(fract((q + 0.5 * w) * 0.5) - 0.5)) / w;
    float ck = 0.5 - 0.5 * ii.x * ii.y;
    vec3 chk = mix(uChkA, uChkB, ck) * (0.88 + 0.16 * s);
    floorC = mix(floorC, chk, uAmt.x);

    // glossy floor: the sun's reflection streak and the glow pooling at the horizon
    float refl = exp(-abs(cp.x - c0.x) / (R * 0.55)) * exp(-s * 3.2);
    floorC += mix(uSunBot, uSunTop, 0.4) * refl * 0.35;
    floorC = mix(floorC, uSkyHz, exp(-s * 9.0) * 0.75);
    col = floorC;
  }
  // horizon line glow
  col += uGlow * exp(-abs(yTop - hz) * res.y / 5.0) * 0.55;
  return col;
}

vec3 stylize(vec2 px) {
  vec2 res = uRes / uDpr;
  float yT = 1.0 - px.y / uRes.y;

  /* ---- VHS: rolling tracking band shears lines sideways, plus a slow wobble */
  float vhs = uAmt2.w;
  float bandY = fract(uT * 0.05 + 0.35) * 1.5 - 0.25;
  float band = exp(-pow((yT - bandY) / 0.03, 2.0));
  float row = floor(px.y / (uDpr * 2.0));
  float fr = floor(uT * 24.0);
  float jig = hash12(vec2(row, fr)) - 0.5;
  float dxs = (jig * 9.0 * band + sin(yT * 38.0 + uT * 2.3) * 0.4) * vhs;
  vec2 p = px + vec2(dxs * uDpr, 0.0);
  vec2 cp = p / uDpr;

  /* ---- object: gradient map + gloss */
  vec4 nn = nrmL(p);
  float cov = nn.a;
  vec3 n = cov > 0.01 ? normalize(nn.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
  vec3 sc = colL(p);
  float L = luma(sc);
  float t = clamp((L - 0.03) / 0.9, 0.0, 1.0);
  t = mix(t, t * t * (3.0 - 2.0 * t), 0.4);
  // highlights roll off before the lightest stop, so big pale surfaces stay pastel instead of clipping white
  t = pow(t, uTone.x) * 0.9;
  float cool = coolness(sc);
  vec3 base = textureLod(tPal, vec2((t * float(${PAL_W - 1}) + 0.5) / float(${PAL_W}), 0.25 + 0.5 * cool), 0.0).rgb;

  // fake chrome: the reflection vector picks sky / horizon / floor
  float ry = 2.0 * n.z * n.y;
  vec3 envUp = mix(uSkyHz, uEnvSky, smoothstep(0.0, 0.7, ry));
  vec3 envDn = mix(uSkyHz * 0.7, uEnvFloor, smoothstep(0.0, 0.45, -ry));
  vec3 env = mix(envDn, envUp, step(0.0, ry)) + uSunTop * exp(-abs(ry) * 26.0) * 0.6;
  env *= 0.5 + 0.48 * t;
  vec3 obj = mix(base, env, uAmt.y);

  // marble veins (plaster)
  float vn = vnoise(n.xy * 2.6 + vec2(n.z * 1.7, 0.0) + 3.0) * 0.7 + vnoise(n.xy * 6.0 + 11.0) * 0.3;
  float vein = 1.0 - smoothstep(0.0, 0.05, abs(vn - 0.52));
  obj = mix(obj, obj * vec3(0.84, 0.86, 0.95), vein * uAmt.w * 0.6);

  // two-tone gloss: cyan highlight on the key side, magenta along the shaded rim
  vec3 Lk = normalize(vec3(-0.45, 0.55, 0.7));
  float sp = pow(max(dot(n, normalize(Lk + vec3(0.0, 0.0, 1.0))), 0.0), 56.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.4);
  float keySide = smoothstep(-0.35, 0.35, dot(n.xy, normalize(Lk.xy)));
  obj += uSpecA * sp * 0.85;
  obj += mix(uSpecB, uSpecA, keySide) * rim * 0.5;
  float b1 = smoothstep(0.972, 0.982, dot(n, normalize(vec3(-0.36, 0.44, 0.82))));
  float b2 = smoothstep(0.991, 0.995, dot(n, normalize(vec3(0.3, 0.52, 0.8))));
  obj += vec3(1.0) * (b1 + b2 * 0.8) * uAmt.z * 0.8;

  /* ---- background */
  vec3 bg = backdrop(cp, res);

  /* ---- soft bloom from bright surfaces + a backlit halo around silhouettes (12 taps) */
  float bloom = 0.0, halo = 0.0;
  float ign = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  for (int i = 0; i < 12; i++) {
    float k = float(i);
    float rr = (3.0 + k * k * 0.22) * (0.85 + 0.3 * ign) * uDpr;
    float a = k * 2.39996 + ign * 0.6;
    vec2 q = p + vec2(cos(a), sin(a)) * rr;
    vec4 tn = nrmL(q);
    // linear luma (no sRGB pow per tap): 0.55..1.0 linear ≈ 0.78..1.0 display
    float tl = luma(textureLod(tScene, q / uRes, 0.0).rgb * uExposure);
    float w = 1.0 / (1.0 + k * 0.35);
    bloom += smoothstep(0.55, 1.0, tl) * tn.a * w;
    halo += tn.a * w;
  }
  bloom *= uTone.y / 4.6;
  halo /= 4.6;

  /* ---- composite with chroma offset: red / blue see the object shifted sideways */
  float fo = 1.6 * uDpr * (0.6 + 0.4 * vhs) + abs(dxs) * 0.3 * uDpr;
  float covR = nrmL(p + vec2(fo, 0.0)).a;
  float covB = nrmL(p - vec2(fo, 0.0)).a;
  vec3 objR = mix(uSpecB, obj, cov);
  vec3 objB = mix(uSpecA, obj, cov);
  vec3 col = vec3(mix(bg.r, objR.r, covR), mix(bg.g, obj.g, cov), mix(bg.b, objB.b, covB));
  col += mix(uSpecA, vec3(1.0), 0.5) * bloom * 0.3 * (0.6 + 0.4 * cov);
  col += uGlow * halo * (1.0 - cov) * 0.22;

  /* ---- tape: tracking noise, scanlines, grain, vignette */
  float streak = step(0.985, hash12(vec2(floor(px.x / (uDpr * 18.0)), row + fr * 3.1))) * band;
  col += vec3(0.9, 0.85, 1.0) * streak * 0.5 * vhs;
  col = mix(col, col * 0.88 + 0.06, band * 0.35 * vhs);
  col *= 1.0 - 0.07 * vhs * (0.5 + 0.5 * sin(px.y / uDpr * 2.09));
  col += (hash12(px + fract(uT * 7.0) * 91.0) - 0.5) * 0.045 * (0.4 + 0.6 * vhs);
  vec2 vc = px / uRes - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.5;
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type State = {
  mode: VaporwaveMode
  w: number[]
  target: number[]
  t: number
  scroll: number
  speed: number
  palW: number[] // weights the palette texture was last built with
}
export type VaporwaveEffect = StylizeEffect & { vapor: State }

export function createVaporwaveEffect(opts: { mode?: VaporwaveMode; gridSpeed?: number } = {}): VaporwaveEffect {
  const mode = opts.mode ?? 'sunset'
  const w = MODES.map((m) => (m === mode ? 1 : 0))
  const st: State = { mode, w: [...w], target: [...w], t: 0, scroll: 0, speed: opts.gridSpeed ?? 1, palW: [-1, -1, -1] }
  const data = new Uint8Array(PAL_W * 2 * 4)
  const pal = new THREE.DataTexture(data, PAL_W, 2, THREE.RGBAFormat)
  pal.magFilter = THREE.LinearFilter
  pal.minFilter = THREE.LinearFilter
  pal.generateMipmaps = false
  pal.wrapS = pal.wrapT = THREE.ClampToEdgeWrapping
  const u: Record<string, THREE.IUniform> = {
    tPal: { value: pal },
    uAmt: { value: new THREE.Vector4() },
    uAmt2: { value: new THREE.Vector4() },
    uSun: { value: new THREE.Vector3(0.5, 0.6, 0.26) },
    uScroll: { value: 0 },
    uT: { value: 0 },
    uTone: { value: new THREE.Vector2(1, 1) },
  }
  const cap = (k: string) => 'u' + k[0].toUpperCase() + k.slice(1)
  for (const k of COLOR_KEYS) u[cap(k)] = { value: new THREE.Vector3() }

  const apply = () => {
    // colours + amounts
    for (const k of COLOR_KEYS) {
      const v = [0, 0, 0]
      MODES.forEach((m, i) => {
        const c = hex(LOOK[m][k])
        for (let j = 0; j < 3; j++) v[j] += c[j] * st.w[i]
      })
      ;(u[cap(k)].value as THREE.Vector3).set(v[0], v[1], v[2])
    }
    const mix = (key: keyof Look) => MODES.reduce((s, m, i) => s + (LOOK[m][key] as number) * st.w[i], 0)
    ;(u.uAmt.value as THREE.Vector4).set(mix('checker'), mix('chrome'), mix('bubbles'), mix('vein'))
    ;(u.uAmt2.value as THREE.Vector4).set(mix('stars'), mix('sparkle'), mix('neutral'), mix('vhs'))
    ;(u.uTone.value as THREE.Vector2).set(mix('gamma'), mix('bloom'))
    // palette strip, only when the blend moved
    if (st.w.some((x, i) => Math.abs(x - st.palW[i]) > 1e-3)) {
      const S = strips()
      for (let i = 0; i < PAL_W * 2; i++) {
        for (let c = 0; c < 3; c++) {
          let v = 0
          for (let m = 0; m < MODES.length; m++) v += S[m][i * 3 + c] * st.w[m]
          data[i * 4 + c] = Math.round(Math.min(1, Math.max(0, v)) * 255)
        }
        data[i * 4 + 3] = 255
      }
      pal.needsUpdate = true
      st.palW = [...st.w]
    }
  }
  apply()

  return {
    frag: FRAG,
    uniforms: u,
    normals: true,
    background: vaporwaveMeta.background,
    vapor: st,
    update(dt) {
      st.t += dt
      const k = Math.min(1, dt * 3.2)
      for (let i = 0; i < st.w.length; i++) st.w[i] += (st.target[i] - st.w[i]) * k
      const spd = MODES.reduce((s, m, i) => s + LOOK[m].speed * st.w[i], 0)
      st.scroll += dt * 0.55 * st.speed * spd
      if (st.scroll > 1000) st.scroll -= 1000
      u.uScroll.value = st.scroll
      u.uT.value = st.t
      apply()
    },
  }
}

export function setVaporwaveMode(fx: StylizeEffect, mode: VaporwaveMode) {
  const st = (fx as VaporwaveEffect).vapor
  if (!st || st.mode === mode) return
  st.mode = mode
  st.target = MODES.map((m) => (m === mode ? 1 : 0))
}

/** grid travel speed multiplier (0 = still), default 1 */
export function setVaporwaveGridSpeed(fx: StylizeEffect, k: number) {
  const st = (fx as VaporwaveEffect).vapor
  if (st) st.speed = k
}

/** sun centre x (0..1 of the width), horizon y (0..1 from the top), sun radius (fraction of the height) */
export function setVaporwaveLayout(fx: StylizeEffect, sunX: number, horizon: number, radius = 0.26) {
  const u = fx.uniforms as { uSun: THREE.IUniform<THREE.Vector3> } | undefined
  u?.uSun.value.set(sunX, horizon, radius)
}
