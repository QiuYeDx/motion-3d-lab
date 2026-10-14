import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 水墨 — sumi ink on raw xuan paper.
 *
 *  · 墨分五色: scene value → ink density, posterised into five tones (焦 浓 重 淡 清) whose borders wander
 *    with the paper; everything brighter than a threshold stays bare paper (留白). A dark rim marks the
 *    leading edge of each tone, where the water carried the ink as the wash dried (水痕).
 *  · washes: one ring of taps (10 directions × 2 radii) gives a near and a wide blur, the luma gradient
 *    (= contour normal, used to orient the brush) and the nearest depth around the pixel. Wet passages
 *    use the blurred value; the wide blur, gated by long paper fibres, wicks out past the edges as a
 *    feathered halo (洇).
 *  · contours: depth Laplacian + normal / coverage differences at a radius that swells and thins with a
 *    slow "pressure" noise, so lines go thick → thin like a loaded brush; a second, wider ring makes the
 *    wet halo of the stroke. 飞白: streaks running along the stroke tangent (cell-local stroke frame) open
 *    up where the brush runs dry; 笔断: the line lifts off now and then.
 *  · 皴: short directional dabs (two families, hemp-fibre and axe-cut) laid into the dark masses.
 *  · distance: depth → paler and wetter (wider blur, no lines) — atmospheric perspective; an optional mist
 *    band drifts across the middle distance.
 *  · 工笔 adds pale indigo / ochre / cinnabar glazes picked from the scene hue; 泼墨 adds splashed blots and
 *    spatter. Modes are numbers interpolated on the CPU, so switching is a smooth morph.
 *  · `paintInkwash(fx)` replays the painting: lines are written first, then the washes soak in.
 */

export const inkwashModes = [
  { id: 'xieyi', label: '写意' },
  { id: 'gongbi', label: '工笔' },
  { id: 'pomo', label: '泼墨' },
] as const
export type InkwashMode = (typeof inkwashModes)[number]['id']

export const inkwashMeta = { title: '水墨', en: 'Ink Wash', background: '#f2ede2', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  lineK: number // contour strength
  lineW: number // contour half-width, CSS px
  press: number // thick / thin variation
  sel: number // 1 = only silhouettes / depth breaks, 0 = also creases
  dry: number // 飞白
  lift: number // broken strokes
  halo: number // wet halo around strokes
  bleed: number // wash feathering into the fibres
  bleedR: number // wash blur radius, CSS px
  wet: number // base wetness of washes
  steps: number // tone posterisation crispness
  cun: number // texture dabs
  color: number // 工笔 glazes
  splash: number // 泼墨 blots + spatter
  contrast: number // density gamma
  white: number // 留白 threshold
}

const LOOKS: Record<InkwashMode, Look> = {
  xieyi: { lineK: 0.95, lineW: 1.45, press: 0.95, sel: 0.7, dry: 0.8, lift: 0.55, halo: 0.7, bleed: 0.75, bleedR: 9, wet: 0.5, steps: 0.85, cun: 0.85, color: 0, splash: 0, contrast: 1.1, white: 0.27 },
  gongbi: { lineK: 0.92, lineW: 0.7, press: 0.1, sel: 0, dry: 0, lift: 0, halo: 0.08, bleed: 0.12, bleedR: 5, wet: 0.2, steps: 0.5, cun: 0, color: 1, splash: 0, contrast: 1.25, white: 0.29 },
  pomo: { lineK: 0.75, lineW: 2.1, press: 1, sel: 0.9, dry: 0.6, lift: 0.4, halo: 1, bleed: 1, bleedR: 17, wet: 0.85, steps: 0.9, cun: 0.35, color: 0, splash: 1, contrast: 1.5, white: 0.35 },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number>
  for (const key of Object.keys(a) as (keyof Look)[]) o[key] = a[key] + (b[key] - a[key]) * k
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uInkThin;
uniform vec3 uIndigo;
uniform vec3 uOchre;
uniform vec3 uCinnabar;
uniform float uLineK;
uniform float uLineW;
uniform float uPress;
uniform float uSel;
uniform float uDry;
uniform float uLift;
uniform float uHalo;
uniform float uBleed;
uniform float uBleedR;
uniform float uWet;
uniform float uSteps;
uniform float uCun;
uniform float uColor;
uniform float uSplash;
uniform float uContrast;
uniform float uWhite;
uniform float uDensity;  // visitor's 墨色浓淡
uniform vec3 uFog;       // depth near, depth far (world units), strength
uniform vec2 uMist;      // mist drift offset, CSS px
uniform float uMistK;
uniform float uReveal;   // 0 → 1 painting progress

// explicit-LOD reads: safe inside loops and branches
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
vec4 normL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

/* xuan paper: long thin fibres in every direction (0..1, high on a fibre) */
float fibres(vec2 cp) {
  vec2 r1 = rot(0.5) * cp;
  vec2 r2 = rot(-1.1) * cp;
  vec2 r3 = rot(2.2) * cp;
  float f = vnoise(vec2(r1.x * 0.045, r1.y * 0.85));
  f = max(f, vnoise(vec2(r2.x * 0.035, r2.y * 0.7) + 7.0));
  f = max(f, vnoise(vec2(r3.x * 0.055, r3.y * 1.0) + 13.0));
  return f;
}

float inkOf(float l, float fogK) {
  float D = clamp((1.0 - l - uWhite) / (0.8 - uWhite), 0.0, 1.0);
  return pow(D, uContrast) * uDensity * (1.0 - fogK * 0.8);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;

  /* the hand trembles a little */
  vec2 trem = vec2(vnoise(cp * 0.022 + 3.0), vnoise(cp * 0.022 + 11.0)) - 0.5;
  vec2 q = px + trem * 3.2 * uDpr;

  vec3 c0 = sceneL(q);
  float l0 = luma(c0);
  float d0 = depthL(q);
  float fog0 = smoothstep(uFog.x, uFog.y, d0) * uFog.z;

  /* ring: near / wide blur, contour normal, nearest depth around */
  float R = uBleedR * (0.75 + 0.9 * fog0) * uDpr;
  float lIn = 0.0, lOut = 0.0, dMin = d0;
  vec3 cAvg = c0;
  vec2 g = vec2(0.0);
  mat2 tw = rot(0.314);
  for (int i = 0; i < 10; i++) {
    float a = float(i) * 0.6283185 + 0.31;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 p1 = q + dir * R * 0.42;
    vec2 p2 = q + (tw * dir) * R;
    vec3 c1 = sceneL(p1);
    float l1 = luma(c1);
    float l2 = luma(sceneL(p2));
    lIn += l1;
    lOut += l2;
    cAvg += c1;
    g += dir * (l1 - l0);
    dMin = min(dMin, depthL(p2));
  }
  lIn *= 0.1;
  lOut *= 0.1;
  cAvg /= 11.0;
  float fogW = smoothstep(uFog.x, uFog.y, dMin) * uFog.z;

  /* mist band drifting through the middle distance */
  float mist = 0.0;
  if (uMistK > 0.001) {
    float band = smoothstep(uFog.x, mix(uFog.x, uFog.y, 0.45), dMin) * (1.0 - 0.5 * smoothstep(mix(uFog.x, uFog.y, 0.6), uFog.y, dMin));
    mist = smoothstep(0.42, 0.75, fbm(vec2(cp.x + uMist.x, cp.y * 2.4) / vec2(520.0, 900.0) + 4.0)) * band * uMistK;
  }

  /* washes: posterised into the five tones */
  float wet = clamp(uWet + fogW * 0.8, 0.0, 1.0);
  float lNear = (l0 + lIn * 10.0) / 11.0;
  float lWide = (l0 + lIn * 10.0 + lOut * 10.0) / 21.0;
  float L = mix(l0, mix(lNear, lWide, wet), wet);
  float D = inkOf(L, fogW) * (1.0 - mist * 0.85);
  float jit = (fbm(cp / 60.0 + 20.0) - 0.5) * 0.55;
  float x = clamp(D, 0.0, 1.2) * 5.0 + jit;
  float fl = floor(x);
  float fr = fract(x);
  float s = mix(0.5, 0.05, uSteps * (1.0 - wet * 0.55));
  float kq = max(fl + smoothstep(0.5 - s, 0.5 + s, fr), 0.0);
  float Dq = 0.95 * pow(min(kq / 5.0, 1.15), 1.15);
  Dq = mix(Dq, D, wet * 0.35);
  // 水痕: the leading edge of each tone keeps a slightly darker rim
  float fw = max(fwidth(x), 1e-4);
  float rim = step(0.5, fr) * (1.0 - smoothstep(0.0, fw * 2.8 * uDpr, fr - 0.5)) * step(0.6, x);
  Dq += rim * 0.09 * (1.0 - wet * 0.7);

  /* 洇: the wide blur wicks out along the paper fibres */
  float fib = fibres(cp);
  float Dw = inkOf(lWide, fogW) * (1.0 - mist * 0.85);
  float feather = smoothstep(0.3, 0.95, Dw * 1.6 + (fib - 0.5) * 0.9 + (vnoise(cp * 0.11) - 0.5) * 0.35);
  float halo = Dw * feather * 0.6 * uBleed;
  float Iw = max(Dq, halo);
  // ink settles into the fibres
  Iw *= 1.0 + (fib - 0.5) * 0.22 * (1.0 - Iw);

  /* 泼墨: splashed blots with a ragged, bleeding border + spatter */
  float spat = 0.0;
  if (uSplash > 0.001) {
    float bn = fbm(cp / 58.0 + 40.0);
    float blot = smoothstep(0.42, 0.5, Dw * 1.3 + (bn - 0.5) * 0.75 + (fib - 0.5) * 0.12);
    Iw = max(Iw, blot * mix(0.5, 0.97, smoothstep(0.25, 0.8, Dw + bn * 0.35)) * uSplash * (1.0 - smoothstep(0.15, 0.5, fogW)));
    vec2 sc = floor(cp / 17.0);
    vec2 sp = (sc + vec2(0.2, 0.2) + 0.6 * vec2(hash12(sc + 5.1), hash12(sc + 9.7))) * 17.0;
    float sr = 0.7 + 3.0 * pow(hash12(sc + 2.3), 3.0);
    float sd = length(cp - sp);
    spat = (1.0 - smoothstep(sr - 0.7, sr + 0.5, sd)) * step(hash12(sc + 13.3), 0.3)
         * smoothstep(0.08, 0.3, Dw) * (1.0 - smoothstep(0.6, 0.85, Dw)) * uSplash;
  }

  /* contours */
  vec2 nrm = dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, 1.0);
  vec2 tng = vec2(-nrm.y, nrm.x);
  float pn = vnoise(cp / 40.0 + 50.0);
  float press = mix(1.0, 0.3 + 1.5 * pn * pn, uPress);
  float rw = max(uLineW * press * uDpr, 0.6);
  float eLine = 0.0, eHalo = 0.0;
  for (int k = 0; k < 2; k++) {
    float r = k == 0 ? rw : rw * 2.6 + 3.5 * uDpr;
    float d1 = depthL(q + vec2(r, 0.0));
    float d2 = depthL(q - vec2(r, 0.0));
    float d3 = depthL(q + vec2(0.0, r));
    float d4 = depthL(q - vec2(0.0, r));
    float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
    vec4 n1 = normL(q + vec2(r, 0.0));
    vec4 n2 = normL(q - vec2(r, 0.0));
    vec4 n3 = normL(q + vec2(0.0, r));
    vec4 n4 = normL(q - vec2(0.0, r));
    float en = length(n1.xyz - n2.xyz) + length(n3.xyz - n4.xyz);
    // (no coverage term: a ground plane clipped by the far plane would draw a false horizon line)
    float e = smoothstep(mix(0.03, 0.09, uSel), mix(0.08, 0.2, uSel), lap);
    e = max(e, smoothstep(0.28, 0.55, en) * (1.0 - uSel));
    if (k == 0) eLine = e; else eHalo = e;
  }
  // 飞白: streaks along the stroke, in a cell-local stroke frame (joins between cells stay solid)
  float P = 84.0;
  vec2 cc = (floor(cp / P) + 0.5) * P;
  vec2 dc = cp - cc;
  float streak = vnoise(vec2(dot(dc, tng) * 0.028, dot(dc, nrm) * 0.45) + cc * 0.137);
  float seam = smoothstep(0.0, 0.1, 0.5 - max(abs(dc.x), abs(dc.y)) / P);
  float dryAmt = uDry * smoothstep(0.3, 0.7, vnoise(cp / 52.0 + 9.0) + (1.0 - pn) * 0.25) * seam;
  float dryMask = mix(1.0, smoothstep(0.32, 0.56, streak), dryAmt);
  float lift = mix(1.0, smoothstep(0.16, 0.3, vnoise(cp / 34.0 + 70.0)), uLift);
  float near = 1.0 - smoothstep(0.0, 0.6, fogW) * 0.95;
  float Il = eLine * uLineK * (0.8 + 0.12 * press) * dryMask * lift * near * (1.0 - mist);
  float Ih = eHalo * uHalo * 0.3 * (1.0 - dryAmt) * lift * near
           * smoothstep(0.25, 0.85, fib * 0.75 + vnoise(cp * 0.2) * 0.45);

  /* 皴: short directional dabs in the dark masses */
  float cun = 0.0;
  float cunMask = smoothstep(0.32, 0.6, Dq) * (1.0 - fogW) * uCun * smoothstep(0.3, 0.55, fbm(cp / 90.0 + 3.0));
  if (cunMask > 0.01) {
    for (int fam = 0; fam < 2; fam++) {
      float ff = float(fam);
      vec2 r = rot(mix(1.3, 0.5, ff)) * cp;
      vec2 cell = vec2(15.0, 5.5);
      vec2 b = floor(r / cell);
      for (int j = -1; j <= 1; j++) {
        vec2 id = b + vec2(float(j), 0.0);
        float h = hash12(id + ff * 37.0);
        vec2 ctr = (id + vec2(0.5 + (hash12(id + 3.1) - 0.5) * 0.7, 0.5)) * cell;
        vec2 d = rot((hash12(id + 5.3) - 0.5) * 0.7) * (r - ctr);
        float len = 3.5 + 8.5 * h * h;
        float al = d.x / len;
        float th = (0.7 + 1.0 * hash12(id + 7.7)) * (1.0 - al * al * 0.6) * (0.75 + 0.25 * (al + 1.0));
        float dab = (1.0 - smoothstep(th * 0.55, th, abs(d.y))) * (1.0 - smoothstep(0.55, 1.0, abs(al)));
        dab *= 0.45 + 0.55 * step(0.38, vnoise(vec2(d.x * 0.18, d.y * 2.2) + id * 3.0));
        dab *= step(hash12(id + 11.9), mix(0.42, 0.32, ff)) * mix(1.0, smoothstep(0.5, 0.75, Dq), ff);
        cun = max(cun, dab);
      }
    }
    cun *= cunMask;
  }

  /* painting order: lines are written first, then the washes soak in */
  float fld = 0.62 * fbm(cp / 260.0 + 1.7) + 0.38 * vnoise(cp / 40.0);
  float rv = uReveal * 1.9;
  Il *= smoothstep(0.0, 0.06, rv - fld);
  Ih *= smoothstep(0.3, 0.6, rv - fld);
  float soak = smoothstep(0.35, 0.9, rv - fld);
  Iw *= soak;
  cun *= smoothstep(0.7, 0.95, rv - fld);
  spat *= smoothstep(0.75, 0.8, rv - fld);

  float I = 1.0 - (1.0 - Iw) * (1.0 - Il) * (1.0 - Ih) * (1.0 - cun * 0.62) * (1.0 - spat * 0.9);
  I = clamp(I, 0.0, 0.97);

  /* 工笔: pale mineral / plant pigments glazed under the ink */
  vec3 base = uPaper;
  if (uColor > 0.001) {
    vec3 cs = mix(c0, cAvg, 0.5);
    float mx = max(cs.r, max(cs.g, cs.b));
    float mn = min(cs.r, min(cs.g, cs.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    float dlt = max(mx - mn, 1e-4);
    float hue = mx == cs.r ? mod((cs.g - cs.b) / dlt, 6.0) : (mx == cs.g ? (cs.b - cs.r) / dlt + 2.0 : (cs.r - cs.g) / dlt + 4.0);
    hue /= 6.0;
    float wc = 1.0 - smoothstep(0.035, 0.075, min(hue, 1.0 - hue));
    float wo = smoothstep(0.035, 0.075, hue) * (1.0 - smoothstep(0.17, 0.24, hue));
    float wi = clamp(1.0 - wc - wo, 0.0, 1.0);
    vec3 pig = uCinnabar * wc + uOchre * wo + uIndigo * wi;
    float a = uColor * smoothstep(0.1, 0.42, sat) * soak * (1.0 - fogW * 0.7) * (0.55 + 0.45 * (fib * 0.4 + 0.6));
    base = mix(base, uPaper * pig, a * 0.85);
  }

  vec3 inkCol = mix(uInkThin, uInk, smoothstep(0.12, 0.85, I));
  vec3 col = mix(base, inkCol, I);

  /* paper: warm, mottled, with a few pale fibres */
  col *= 1.0 - 0.04 * (fbm(cp / 190.0) - 0.5);
  col += vec3(0.014, 0.012, 0.008) * smoothstep(0.82, 0.97, fib) * (1.0 - I);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const REVEAL_DUR = 4.2

type InkState = { from: Look; to: Look; cur: Look; k: number; mode: InkwashMode; t: number; density: number; densityTarget: number }
export type InkwashEffect = StylizeEffect & { ink: InkState }

// display-referred colours (the shader works in sRGB)
const srgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
export function createInkwashEffect(): InkwashEffect {
  const st: InkState = { from: LOOKS.xieyi, to: LOOKS.xieyi, cur: LOOKS.xieyi, k: 1, mode: 'xieyi', t: REVEAL_DUR, density: 1, densityTarget: 1 }
  const u = {
    uPaper: { value: srgb('#f2ede2') },
    uInk: { value: srgb('#15130f') },
    uInkThin: { value: srgb('#4c5257') },
    uIndigo: { value: srgb('#8fa8b8') },
    uOchre: { value: srgb('#e3b47c') },
    uCinnabar: { value: srgb('#e48a72') },
    uLineK: { value: 1 },
    uLineW: { value: 1 },
    uPress: { value: 1 },
    uSel: { value: 0 },
    uDry: { value: 0 },
    uLift: { value: 0 },
    uHalo: { value: 0 },
    uBleed: { value: 0 },
    uBleedR: { value: 8 },
    uWet: { value: 0 },
    uSteps: { value: 0.5 },
    uCun: { value: 0 },
    uColor: { value: 0 },
    uSplash: { value: 0 },
    uContrast: { value: 1 },
    uWhite: { value: 0.2 },
    uDensity: { value: 1 },
    uFog: { value: new THREE.Vector3(14, 40, 1) },
    uMist: { value: new THREE.Vector2(0, 0) },
    uMistK: { value: 0 },
    uReveal: { value: 1 },
  }
  const apply = (L: Look) => {
    u.uLineK.value = L.lineK
    u.uLineW.value = L.lineW
    u.uPress.value = L.press
    u.uSel.value = L.sel
    u.uDry.value = L.dry
    u.uLift.value = L.lift
    u.uHalo.value = L.halo
    u.uBleed.value = L.bleed
    u.uBleedR.value = L.bleedR
    u.uWet.value = L.wet
    u.uSteps.value = L.steps
    u.uCun.value = L.cun
    u.uColor.value = L.color
    u.uSplash.value = L.splash
    u.uContrast.value = L.contrast
    u.uWhite.value = L.white
    u.uDensity.value = st.density
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    ink: st,
    update(dt) {
      st.t += dt
      const p = Math.min(1, st.t / REVEAL_DUR)
      u.uReveal.value = 1 - Math.pow(1 - p, 2.2)
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        const s = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, s)
      }
      st.density += (st.densityTarget - st.density) * Math.min(1, dt * 5)
      u.uMist.value.x += dt * 14
      apply(st.cur)
    },
  }
}

/** replay the painting: lines first, then the washes soak in */
export function paintInkwash(fx: StylizeEffect) {
  const st = (fx as InkwashEffect).ink
  if (st) st.t = 0
}

/** skip the painting animation (posters) */
export function settleInkwash(fx: StylizeEffect) {
  const st = (fx as InkwashEffect).ink
  if (st) st.t = REVEAL_DUR
}

/** 0 → 1 while the painting is being made */
export function inkwashProgress(fx: StylizeEffect) {
  const st = (fx as InkwashEffect).ink
  return st ? Math.min(1, st.t / REVEAL_DUR) : 1
}

export function setInkwashMode(fx: StylizeEffect, mode: InkwashMode) {
  const st = (fx as InkwashEffect).ink
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** 墨色浓淡: ink density multiplier (≈ 0.7 淡 … 1.3 浓) */
export function setInkwashDensity(fx: StylizeEffect, density: number) {
  const st = (fx as InkwashEffect).ink
  if (st) st.densityTarget = density
}

/** atmospheric perspective: depth range in world units where things fade to pale wet washes; strength 0..1 */
export function setInkwashFog(fx: StylizeEffect, near: number, far: number, strength = 1) {
  ;(fx.uniforms!.uFog.value as THREE.Vector3).set(near, far, strength)
}

/** drifting mist band in the middle distance (0 = off) */
export function setInkwashMist(fx: StylizeEffect, amount: number) {
  fx.uniforms!.uMistK.value = amount
}
