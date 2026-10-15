import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 沙画 — sand on a back-lit glass table.
 *
 *  · value = sand thickness: dark parts of the scene are a thick layer that blocks the lamp (deep brown →
 *    black), light parts are a thin dusting or bare glass that glows. Light through the layer falls off
 *    exponentially (exp(−k·thickness)) and is mapped through a 5-stop "light through sand" ramp.
 *  · grains: two jittered cell sizes (≈ 1.25 and 2 CSS px) + clumps. A grain blocks the light where the layer
 *    is thicker than its random threshold, so thin sand is a scatter of dark specks, thick sand has pinholes,
 *    and every soft edge is grainy rather than a clean gradient. Grains at the edge of a layer catch the lamp
 *    and twinkle (sparkle); grains on top of thick sand catch a little room light.
 *  · picture: the scene is sampled through a small noise wobble and a 7-tap blur, so coverage edges are soft;
 *    wind-blown drift streaks run through the mid tones.
 *  · finger strokes: depth / normal contours at two radii. The core is pushed clear (a bright groove with a
 *    few grains dragged along the stroke tangent), the wider band gets the sand that was pushed aside (a
 *    slightly darker lip on both sides). On bare glass a contour is a thin trickle of sand instead.
 *  · performance: `smearSand(fx)` swings a palm across the table in an arc (a ridge of pushed sand at the
 *    front, an even layer with swirl marks and finger trails behind it), then `pourSand` lets the next picture
 *    form — sand streams in from the top / edges and settles, and the finger lines are drawn last.
 *  · modes (暖光 / 冷光 / 彩沙) are numbers + colours interpolated on the CPU. 彩沙 picks an earthy sand per
 *    region from the scene hue (small DataTexture + texelFetch) with a few stray grains of other colours.
 */

export const sandModes = [
  { id: 'warm', label: '暖光' },
  { id: 'cool', label: '冷光' },
  { id: 'color', label: '彩沙' },
] as const
export type SandMode = (typeof sandModes)[number]['id']

export const sandMeta = { title: '沙画', en: 'Sand Art', background: '#9a9184', theme: 'dark' as const }

/** table colour per mode (pages use it for the stage background / frame) */
export const sandTable: Record<SandMode, string> = {
  warm: '#1b1209',
  cool: '#0b0e13',
  color: '#17110c',
}

/* ------------------------------------------------------------------ palette + looks */

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
// coloured sands: 0 = natural sand (used where the scene is unsaturated), then earthy colours
const SANDS = ['#a8794a', '#c2532c', '#d9a237', '#6f8c3c', '#3d6f9f', '#8a4a7a', '#2f8a86'].map(rgb)
const NPAL = SANDS.length

type Look = {
  c0: RGB // light through the thickest sand
  c1: RGB
  c2: RGB
  c3: RGB
  c4: RGB // bare glass (the lamp)
  spark: RGB
  color: number // coloured sands
  hot: number // lamp hot spot
  line: number
  drift: number
  sparkK: number
}

const LOOKS: Record<SandMode, Look> = {
  warm: { c0: rgb('#110803'), c1: rgb('#3a1b09'), c2: rgb('#9a4c15'), c3: rgb('#eba04c'), c4: rgb('#fff0cc'), spark: rgb('#fff4d6'), color: 0, hot: 1, line: 1, drift: 1, sparkK: 1 },
  cool: { c0: rgb('#06080c'), c1: rgb('#162131'), c2: rgb('#456282'), c3: rgb('#a8c6e2'), c4: rgb('#f3f8ff'), spark: rgb('#ffffff'), color: 0, hot: 0.8, line: 1, drift: 0.8, sparkK: 1.15 },
  color: { c0: rgb('#0e0905'), c1: rgb('#33200f'), c2: rgb('#8a5a2a'), c3: rgb('#e8c48c'), c4: rgb('#fff7e8'), spark: rgb('#fffaf0'), color: 1, hot: 0.7, line: 0.85, drift: 0.7, sparkK: 0.8 },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const m = (x: number, y: number) => x + (y - x) * k
  const o = {} as Record<string, unknown>
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    o[key] = Array.isArray(x) ? (x as RGB).map((v, i) => m(v, (y as RGB)[i])) : m(x as number, y as number)
  }
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec3 uSpark;
uniform float uColorSand;
uniform float uHot;
uniform float uLineK;
uniform float uDriftK;
uniform float uSparkK;
uniform float uSize;   // stroke scale (phones a little finer)
uniform float uFront;  // smear front along the sweep (−1 idle, > 1.2 = table covered)
uniform float uDir;    // sweep direction ±1
uniform float uPour;   // 0 → 1 the next picture forms
uniform float uLines;  // 0 → 1 finger lines drawn
uniform float uSeed;   // per performance
uniform float uFlow;   // clock for moving sand

#define NPAL ${NPAL}

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec3 normL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0).xyz; }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s / 0.875;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec3 ramp(float x) {
  vec3 c = mix(uC0, uC1, smoothstep(0.0, 0.1, x));
  c = mix(c, uC2, smoothstep(0.08, 0.36, x));
  c = mix(c, uC3, smoothstep(0.32, 0.7, x));
  return mix(c, uC4, smoothstep(0.66, 1.0, x));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = cp / res;
  float S = uSize;

  /* ---- the sweep (palm swung from the elbow: an arc around a pivot below the table) */
  vec2 q = cp - vec2(res.x * 0.5, -res.y * 0.85);
  float ang = atan(q.x, q.y);
  float rad = length(q);
  float amax = atan(res.x * 0.62, res.y * 0.85);
  float u = ang / amax * 0.5 + 0.5;
  u = uDir > 0.0 ? u : 1.0 - u;
  u += (fbm(cp / 90.0 + uSeed) - 0.5) * 0.07;
  float dF = u - uFront;
  float behind = 1.0 - smoothstep(-0.012, 0.0, dF);
  float onT = step(-0.5, uFront) * step(uFront, 1.2);
  float ridge = smoothstep(-0.035, 0.0, dF) * exp(-max(dF, 0.0) / 0.03) * onT;

  /* ---- formation order of the next picture: top first, in from the side edges, in clumps */
  float edgeD = min(uv.x, 1.0 - uv.x) * 2.0;
  float ord = (1.0 - uv.y) * 0.55 + edgeD * 0.2 + fbm(cp / 170.0 + uSeed * 3.0) * 0.25;
  float G = 1.25;
  float jit = hash12(floor(cp / G) + 71.3) - 0.5;           // grains settle one by one, not as a smooth fade
  float formed = clamp((uPour * 1.3 - ord + jit * 0.1) / 0.16, 0.0, 1.0);
  float E = behind * (1.0 - formed);                       // 1 = even, smeared layer
  float zone = formed * (1.0 - formed) * 4.0 * behind;     // sand still flowing in
  float moving = max(ridge, zone);

  /* ---- grains (fixed; re-dealt where sand is moving) */
  vec2 gp = cp + vec2(0.0, uFlow * 70.0) * step(0.3, moving);
  // two lattices at odd angles, so grains don't line up with the pixel grid on high-DPR screens
  vec2 gc = floor(rot(0.52) * gp / G);
  float gA = hash12(gc + 0.5);
  float gB = hash12(floor(rot(-0.31) * gp / (G * 1.62) + 0.37) + 19.3);
  float clump = vnoise(gp / (G * 4.0) + 3.1);
  float gv = 0.5 * gA + 0.22 * gB + 0.28 * clump;

  /* ---- the picture: thickness from the scene, soft wobbling edges */
  vec2 wob = (vec2(vnoise(cp * 0.06 + 1.0), vnoise(cp * 0.06 + 8.0)) - 0.5) * 2.4 * uDpr;
  vec3 C = vec3(0.0);
  float vMax = 0.0;
  float vMin = 1.0;
  for (int i = 0; i < 7; i++) {
    float a = float(i) * 1.0472 + 0.4;
    vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * 2.6 * uDpr * S;
    vec3 c = sceneL(px + wob + o);
    float l = luma(c);
    vMax = max(vMax, l);
    vMin = min(vMin, l);
    C += c * (i == 0 ? 2.0 : 1.0);
  }
  C /= 8.0;
  float V = luma(C);
  float Tp = 1.0 - smoothstep(0.1, 0.84, V);
  Tp = mix(Tp, Tp * Tp * (3.0 - 2.0 * Tp), 0.6);                  // fewer in-between tones
  Tp += (fbm(cp / 260.0 + 2.0) - 0.5) * 0.14;                       // unevenly spread layer

  // wind-blown drift streaks, in patches, gently waving
  vec2 dr = rot(0.14) * cp;
  dr.y += (vnoise(vec2(dr.x / 300.0, 1.7)) - 0.5) * 40.0;
  float patchK = smoothstep(0.45, 0.75, fbm(cp / 320.0 + 11.0));
  float drift = vnoise(vec2(dr.x / 120.0 + uFlow * 0.01, dr.y / 2.6)) * 0.65 + vnoise(vec2(dr.x / 40.0, dr.y / 1.3) + 5.0) * 0.35;
  Tp += (drift - 0.5) * 0.2 * uDriftK * patchK * (0.25 + Tp * (1.0 - Tp) * 3.0);

  /* ---- finger strokes: core pushed clear, sand piled on both sides */
  vec2 jw = (vec2(vnoise(cp * 0.04 + 2.0), vnoise(cp * 0.04 + 9.0)) - 0.5) * 2.0 * uDpr;
  float eC = 0.0;
  float eP = 0.0;
  vec2 gdir = vec2(1.0, 0.0);
  for (int k = 0; k < 2; k++) {
    float r = (k == 0 ? 2.3 : 6.0) * S * uDpr;
    vec2 p = px + jw;
    float d0 = depthL(p);
    float d1 = depthL(p + vec2(r, 0.0));
    float d2 = depthL(p - vec2(r, 0.0));
    float d3 = depthL(p + vec2(0.0, r));
    float d4 = depthL(p - vec2(0.0, r));
    float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
    vec3 na = normL(p + vec2(r, 0.0));
    vec3 nb = normL(p - vec2(r, 0.0));
    vec3 nc = normL(p + vec2(0.0, r));
    vec3 nd = normL(p - vec2(0.0, r));
    float en = length(na - nb) + length(nc - nd);
    float e = max(smoothstep(0.03, 0.085, lap), smoothstep(0.28, 0.55, en));
    if (k == 0) {
      eC = e;
      gdir = vec2(d1 - d2, d3 - d4) / max(d0, 1e-3) + vec2(dot(na - nb, vec3(1.0)), dot(nc - nd, vec3(1.0))) * 0.02;
    } else {
      eP = e;
    }
  }
  vec2 nrm = normalize(gdir + vec2(1e-6, 0.0));
  if (nrm.x < 0.0) nrm = -nrm;
  vec2 tng = vec2(-nrm.y, nrm.x);
  float along = dot(cp, tng);
  float across = dot(cp, nrm);
  float press = 0.55 + 0.45 * vnoise(vec2(along / 40.0, 3.0 + uSeed));
  float dragged = vnoise(vec2(along / 16.0, across / 0.8));
  float lo = fbm(cp / 140.0 + 7.0) * 0.72 + uv.x * 0.28;           // order the lines are drawn in
  float lineVis = smoothstep(lo, lo + 0.04, uLines * 1.08);
  // a finger can only push sand aside where there is sand on both sides of the line: a dark shape against
  // the light keeps its silhouette (and thin dark shapes aren't erased); between two light areas the line is
  // a thin trickle of sand instead
  float inSand = 1.0 - smoothstep(0.42, 0.68, vMax);
  float onGlass = smoothstep(0.55, 0.78, vMin);
  float clr = eC * press * (0.62 + 0.38 * dragged) * uLineK * lineVis * inSand;
  float pile = clamp(eP - eC, 0.0, 1.0) * uLineK * lineVis * (1.0 - smoothstep(0.5, 0.75, vMax));
  float T = Tp * (1.0 - 0.9 * clr) + pile * 0.2 * smoothstep(0.1, 0.4, Tp);
  T += eC * onGlass * 0.4 * press * lineVis * uLineK;

  /* ---- the even layer behind the palm: swirl marks + finger trails along the arc */
  float sw = vnoise(vec2(rad / 1.7, ang * 40.0 + uSeed * 5.0)) * 0.5 + vnoise(vec2(rad / 7.0, ang * 9.0 - uSeed * 3.0)) * 0.5;
  float trail = smoothstep(0.7, 0.82, vnoise(vec2(rad / 16.0 + uSeed * 7.0, ang * 1.6 + 4.0)));
  float Te = 0.44 + (sw - 0.5) * 0.2 + (fbm(cp / 220.0 + uSeed * 9.0) - 0.5) * 0.12 - trail * 0.24;
  float stream = vnoise(vec2(cp.x / 2.2, cp.y / 22.0 + uFlow * 8.0));
  T = mix(T, Te, E);
  T += ridge * 0.62 * (0.6 + 0.4 * sw);
  T += zone * ((stream - 0.5) * 0.45 + 0.12);
  T = clamp(T, 0.0, 1.35);

  /* ---- light through the layer: every grain rounds the thickness up or down (gradients become grain
     density, like sand that is either there or not) */
  float Tq = floor(T * 3.0 + gv) / 3.0;
  float Tm = mix(T, Tq, 0.72);
  float gap = step(Tq, T - 0.001) * step(T, 0.999);    // grains that rounded down let light through
  float Lt = exp(-2.9 * Tm);
  vec2 hc = (uv - vec2(0.5, 0.56)) * vec2(res.x / res.y, 1.0);
  Lt *= 1.0 + uHot * (0.16 - dot(hc, hc) * 0.5);
  Lt = clamp(Lt, 0.0, 1.0);

  vec3 mono = ramp(Lt);
  float top = smoothstep(0.55, 1.0, Tm) * (0.3 + 0.7 * gA) * (0.6 + 0.4 * clump);
  mono += uSpark * top * 0.04;

  /* ---- coloured sands */
  vec3 col = mono;
  if (uColorSand > 0.01) {
    float mx = max(C.r, max(C.g, C.b));
    float mn = min(C.r, min(C.g, C.b));
    float sat = (mx - mn) / max(mx, 0.05);
    vec3 ch = C - vec3(luma(C));
    vec3 chn = ch / max(length(ch), 1e-4);
    int bi = 0;
    float best = -2.0;
    for (int i = 1; i < NPAL; i++) {
      vec3 pc = texelFetch(tPal, ivec2(i, 0), 0).rgb;
      vec3 pch = pc - vec3(luma(pc));
      float sc = dot(chn, pch / max(length(pch), 1e-4));
      if (sc > best) { best = sc; bi = i; }
    }
    int pick = sat > 0.14 ? bi : 0;
    float hs = hash12(gc + 31.7);
    if (hs < 0.07 || E > 0.5) pick = int(floor(hash12(gc + 4.4) * float(NPAL) - 0.001));  // stray / mixed grains
    vec3 sand = texelFetch(tPal, ivec2(pick, 0), 0).rgb * (0.8 + 0.4 * gA);
    vec3 colC = mix(sand * 0.13, sand * 1.12, smoothstep(0.03, 0.5, Lt));
    colC = mix(colC, uC4, smoothstep(0.5, 1.0, Lt));
    colC += uSpark * top * 0.03;
    col = mix(mono, colC, uColorSand);
  }

  /* ---- sparkle: grains at the edge of a layer catching the lamp */
  float tw = uFlow * 1.4 + gB * 7.0;
  float sp = step(0.986, hash12(gc + floor(tw) * 13.1 + 0.7));
  float edgeZone = smoothstep(0.1, 0.28, T) * (1.0 - smoothstep(0.7, 1.0, T));
  float spark = sp * edgeZone * sin(fract(tw) * 3.14159) * uSparkK;
  col += uSpark * spark * 0.85;

  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const SMEAR_DUR = 1.5
const REST_DUR = 0.35
const POUR_DUR = 4.2

type Phase = 'idle' | 'smear' | 'rest' | 'pour'

type SandState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: SandMode
  phase: Phase
  t: number
  flow: number
  size: number
  onCovered: (() => void) | null
  count: number
}
export type SandEffect = StylizeEffect & { sand: SandState }

export function createSandEffect(): SandEffect {
  const st: SandState = { from: LOOKS.warm, to: LOOKS.warm, cur: LOOKS.warm, k: 1, mode: 'warm', phase: 'idle', t: 0, flow: 0, size: 1, onCovered: null, count: 0 }
  const data = new Uint8Array(NPAL * 4)
  SANDS.forEach((c, i) => data.set([Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), 255], i * 4))
  const pal = new THREE.DataTexture(data, NPAL, 1, THREE.RGBAFormat)
  pal.colorSpace = THREE.NoColorSpace
  pal.magFilter = pal.minFilter = THREE.NearestFilter
  pal.needsUpdate = true

  const v3 = (c: RGB) => new THREE.Vector3(...c)
  const L0 = LOOKS.warm
  const u = {
    tPal: { value: pal },
    uC0: { value: v3(L0.c0) },
    uC1: { value: v3(L0.c1) },
    uC2: { value: v3(L0.c2) },
    uC3: { value: v3(L0.c3) },
    uC4: { value: v3(L0.c4) },
    uSpark: { value: v3(L0.spark) },
    uColorSand: { value: 0 },
    uHot: { value: 1 },
    uLineK: { value: 1 },
    uDriftK: { value: 1 },
    uSparkK: { value: 1 },
    uSize: { value: 1 },
    uFront: { value: -1 },
    uDir: { value: 1 },
    uPour: { value: 1 },
    uLines: { value: 1 },
    uSeed: { value: 0.37 },
    uFlow: { value: 0 },
  }
  const apply = (L: Look) => {
    u.uC0.value.set(...L.c0)
    u.uC1.value.set(...L.c1)
    u.uC2.value.set(...L.c2)
    u.uC3.value.set(...L.c3)
    u.uC4.value.set(...L.c4)
    u.uSpark.value.set(...L.spark)
    u.uColorSand.value = L.color
    u.uHot.value = L.hot
    u.uLineK.value = L.line
    u.uDriftK.value = L.drift
    u.uSparkK.value = L.sparkK
    u.uSize.value = st.size
  }
  apply(st.cur)
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    sand: st,
    update(dt) {
      st.flow += dt
      u.uFlow.value = st.flow
      st.t += dt
      if (st.phase === 'smear') {
        const p = Math.min(1, st.t / SMEAR_DUR)
        // the palm accelerates into the sweep and slows as it leaves the table
        u.uFront.value = -0.1 + (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) * 1.42
        u.uPour.value = 0
        u.uLines.value = 0
        if (p >= 1) {
          st.phase = 'rest'
          st.t = 0
          u.uFront.value = 1.3
          const cb = st.onCovered
          st.onCovered = null
          cb?.()
        }
      } else if (st.phase === 'rest') {
        if (st.t >= REST_DUR) {
          st.phase = 'pour'
          st.t = 0
        }
      } else if (st.phase === 'pour') {
        const p = Math.min(1, st.t / (POUR_DUR * 0.72))
        u.uPour.value = ease(p)
        u.uLines.value = Math.min(1, Math.max(0, (st.t - POUR_DUR * 0.55) / (POUR_DUR * 0.45)))
        if (st.t >= POUR_DUR) {
          st.phase = 'idle'
          u.uFront.value = -1
          u.uPour.value = 1
          u.uLines.value = 1
        }
      }
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
      }
      apply(st.cur)
    },
  }
}

/**
 * sweep the picture away with the palm (an even layer with swirl marks is left), then let the next picture
 * form. `onCovered` runs when the table is fully covered — swap the scene there. Returns false if a
 * performance is already running.
 */
export function smearSand(fx: StylizeEffect, onCovered?: () => void) {
  const st = (fx as SandEffect).sand
  if (!st || st.phase !== 'idle') return false
  st.phase = 'smear'
  st.t = 0
  st.count++
  st.onCovered = onCovered ?? null
  const u = fx.uniforms!
  u.uDir.value = st.count % 2 ? 1 : -1
  u.uSeed.value = (st.count * 0.618) % 1
  return true
}

/** start from an even layer and let the picture form (sand pours in, lines drawn last) */
export function pourSand(fx: StylizeEffect) {
  const st = (fx as SandEffect).sand
  if (!st || st.phase === 'smear' || st.phase === 'rest') return
  const u = fx.uniforms!
  st.count++
  u.uSeed.value = (st.count * 0.618) % 1
  u.uFront.value = 1.3
  u.uPour.value = 0
  u.uLines.value = 0
  st.phase = 'pour'
  st.t = 0
}

/** finish immediately (posters) */
export function settleSand(fx: StylizeEffect) {
  const st = (fx as SandEffect).sand
  if (!st) return
  st.phase = 'idle'
  st.onCovered = null
  const u = fx.uniforms!
  u.uFront.value = -1
  u.uPour.value = 1
  u.uLines.value = 1
}

/** what the sand is doing: phase + progress 0..1 of it; `front` = palm position along the sweep (0..1) */
export function sandProgress(fx: StylizeEffect) {
  const st = (fx as SandEffect).sand
  if (!st) return { phase: 'idle' as Phase, p: 1, front: -1, dir: 1 }
  const u = fx.uniforms!
  const dur = st.phase === 'smear' ? SMEAR_DUR : st.phase === 'rest' ? REST_DUR : st.phase === 'pour' ? POUR_DUR : 1
  return { phase: st.phase, p: st.phase === 'idle' ? 1 : Math.min(1, st.t / dur), front: u.uFront.value as number, dir: u.uDir.value as number }
}

export function setSandMode(fx: StylizeEffect, mode: SandMode) {
  const st = (fx as SandEffect).sand
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** stroke scale (1 = default; phones look better a little finer, e.g. 0.8) */
export function setSandSize(fx: StylizeEffect, size: number) {
  const st = (fx as SandEffect).sand
  if (st) st.size = size
}
