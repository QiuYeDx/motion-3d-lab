import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 蓝晒 — a cyanotype contact print on heavy watercolour paper.
 *
 *  · density: the scene's luminance (softened like a contact print, with a little bleed of blue into the
 *    whites) goes through a cyanotype curve — long pale toe, deep Prussian shoulder; 植物标本 instead uses
 *    the object coverage (normal-buffer alpha) as a photogram: whatever lies on the paper blocks the UV and
 *    stays white, translucent / grazing parts let some light through, edges are soft where things lift off.
 *  · tone: paper → pale cyan → green-leaning mid blue → Prussian blue; 调色 crossfades to a tannin-toned
 *    palette (warm paper, violet-brown darks).
 *  · process: a hand-brushed coating with ragged stroke ends, bristle streaks and drips at the bottom edge;
 *    a fully exposed border around the negative; mottled coating, pooled density at the brush edge,
 *    tide lines and vertical rinse streaks from the wash, speckles where the coating skipped the paper's
 *    tooth, soft grain, paper fibres and relief.
 *  · development (optional): yellow-green sensitiser → bronze-grey exposure → a rinse front sweeps down
 *    turning it blue → the blue deepens as it oxidises.
 * All taps use textureLod and live in ONE 8-step loop; modes are numbers lerped on the CPU.
 */

export const cyanotypeModes = [
  { id: 'classic', label: '经典' },
  { id: 'photogram', label: '植物标本' },
  { id: 'toned', label: '调色' },
] as const
export type CyanotypeMode = (typeof cyanotypeModes)[number]['id']

export const cyanotypeMeta = { title: '蓝晒', en: 'Cyanotype', background: '#ece6d6', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = { photo: number; paper: V3; light: V3; mid: V3; deep: V3; gamma: number }

const LOOKS: Record<CyanotypeMode, Look> = {
  classic: { photo: 0, paper: [0.95, 0.93, 0.86], light: [0.64, 0.77, 0.82], mid: [0.17, 0.44, 0.58], deep: [0.05, 0.15, 0.36], gamma: 1.0 },
  photogram: { photo: 1, paper: [0.96, 0.95, 0.9], light: [0.7, 0.81, 0.86], mid: [0.18, 0.42, 0.6], deep: [0.04, 0.13, 0.34], gamma: 1.0 },
  toned: { photo: 0, paper: [0.93, 0.86, 0.73], light: [0.78, 0.7, 0.66], mid: [0.44, 0.34, 0.38], deep: [0.19, 0.12, 0.15], gamma: 1.1 },
}

const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const lerpLook = (a: Look, b: Look, k: number): Look => ({
  photo: a.photo + (b.photo - a.photo) * k,
  gamma: a.gamma + (b.gamma - a.gamma) * k,
  paper: lerp3(a.paper, b.paper, k),
  light: lerp3(a.light, b.light, k),
  mid: lerp3(a.mid, b.mid, k),
  deep: lerp3(a.deep, b.deep, k),
})

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform float uPhoto;   // 0 photographic … 1 photogram
uniform float uGamma;
uniform float uExpo;    // 曝光 -1 … 1
uniform vec4 uFrame;    // brushed area: centre (uv, y up), half size (fraction of the viewport)
uniform float uInset;   // negative inset inside the brushed area, CSS px
uniform float uDev;     // 0 … 1 exposure progress
uniform float uWash;    // rinse front, 0 (top) … 1 (bottom); > 1 = fully washed
uniform float uOx;      // 0 … 1 oxidation (blue deepening)

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

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

/* heavy watercolour paper: rounded tooth at two scales + long fibres */
float paperH(vec2 cp) {
  float g = vnoise(cp * 0.3) * 0.5 + vnoise(cp * 0.75 + 7.0) * 0.32 + vnoise(cp * 1.6 + 3.0) * 0.18;
  vec2 r1 = rot(0.5) * cp;
  vec2 r2 = rot(-1.1) * cp;
  float f1 = vnoise(vec2(r1.x * 0.03, r1.y * 1.1));
  float f2 = vnoise(vec2(r2.x * 0.04, r2.y * 1.25) + 11.0);
  return g + smoothstep(0.8, 0.97, max(f1, f2)) * 0.24;
}

vec3 tone(float D) {
  vec3 c = mix(uPaper, uLight, smoothstep(0.0, 0.38, D));
  c = mix(c, uMid, smoothstep(0.3, 0.74, D));
  return mix(c, uDeep, smoothstep(0.68, 1.02, D));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;

  /* ---- brushed coating: ragged stroke ends, bristle streaks, drips */
  vec2 C = uFrame.xy * res;
  vec2 H = uFrame.zw * res;
  vec2 p = cp - C;
  float side = sign(p.x);
  // strokes run horizontally: each stroke (≈40px tall) ends at its own x, bristles drag streaks
  float strokeId = floor((p.y + 4000.0) / 38.0);
  float bristle = vnoise(vec2(p.x * 0.01, p.y * 0.16) + side * 13.0);
  float xEnd = H.x + (hash12(vec2(strokeId, side)) - 0.5) * 34.0 + (bristle - 0.5) * 22.0
             + (vnoise(vec2(p.y * 0.035, side * 7.0)) - 0.5) * 22.0;
  float yEnd = H.y + (vnoise(vec2(p.x * 0.006, sign(p.y) * 5.0)) - 0.5) * 30.0 + (vnoise(vec2(p.x * 0.05, sign(p.y))) - 0.5) * 8.0;
  float ex = xEnd - abs(p.x);   // > 0 inside
  float ey = yEnd - abs(p.y);
  // dry-brush: near the stroke end only the loaded bristles leave pigment
  float dry = smoothstep(0.0, 46.0, ex);
  float bristles = smoothstep(0.42, 0.62, vnoise(vec2(p.x * 0.005, p.y * 0.3) + 3.0) + dry * 0.9);
  float coat = smoothstep(-1.2, 1.2, ex) * mix(bristles, 1.0, dry) * smoothstep(-1.0, 1.0, ey);
  // drips below the bottom edge
  float cell = floor(p.x / 28.0);
  float dr = hash12(vec2(cell, 91.0));
  float dLen = (14.0 + 46.0 * hash12(vec2(cell, 93.0))) * step(0.8, dr);
  float dx = p.x - (cell + 0.5) * 28.0 - (hash12(vec2(cell, 97.0)) - 0.5) * 12.0;
  float below = -(p.y + yEnd);                // > 0 under the bottom edge
  float t = clamp(below / max(dLen, 1.0), 0.0, 1.0);
  float w = (2.0 + 3.0 * hash12(vec2(cell, 99.0))) * (1.0 - 0.45 * t);
  vec2 tip = vec2(dx, below - dLen);
  float drip = max(step(0.0, below) * step(below, dLen) * smoothstep(w + 0.8, w - 0.8, abs(dx)),
                   smoothstep(w * 1.25 + 0.8, w * 1.25 - 0.8, length(tip)));
  drip *= step(0.5, dLen) * step(abs(p.x), xEnd - 8.0);
  coat = max(coat, drip);
  // the brush edge pools sensitiser → denser rim
  float rim = smoothstep(16.0, 2.0, min(ex, ey)) * step(0.0, min(ex, ey));

  /* ---- the negative inside the coating; outside it the coating is fully exposed */
  vec2 N = H - uInset - vec2(10.0, 6.0);
  vec2 qn = abs(p) - N;
  float neg = 1.0 - smoothstep(-2.5, 2.5, max(qn.x, qn.y));

  /* ---- scene: contact-print softness + bleed; coverage for the photogram — one loop */
  vec3 c0 = sceneL(px);
  vec4 n0 = nrmL(px);
  float L0 = luma(c0);
  float Ls = 0.0, Lw = 0.0, cs = 0.0, cw = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + 0.2;
    vec2 d = vec2(cos(a), sin(a));
    vec2 o1 = d * 1.5 * uDpr;
    vec2 o2 = rot(0.39) * d * 4.5 * uDpr;
    Ls += luma(sceneL(px + o1));
    Lw += luma(sceneL(px + o2));
    cs += nrmL(px + o1).a;
    cw += nrmL(px + o2).a;
  }
  Ls /= 8.0; Lw /= 8.0; cs /= 8.0; cw /= 8.0;
  float L = mix(L0, Ls, 0.55);
  L = mix(L, min(L, Lw + 0.05), 0.55);          // blue creeps into the whites

  float e = 0.5 + 0.5 * uExpo;
  float Dc = clamp(pow(1.0 - L, mix(1.3, 0.58, e) * uGamma) * mix(0.98, 1.12, e), 0.0, 1.0);

  // photogram: coverage blocks the light; dark / thick parts block more, grazing edges of glass too
  float cov = mix(mix(n0.a, cs, 0.5), cw, 0.3);
  vec3 nv = n0.a > 0.5 ? normalize(n0.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
  float graze = pow(1.0 - abs(nv.z), 2.0);
  float opaque = mix(0.5, 1.0, smoothstep(0.78, 0.3, L0)) + graze * 0.5;
  float block = cov * clamp(opaque, 0.0, 1.0);
  float leak = (cw - cs) * 0.35;                 // light creeping under lifted edges
  float Dp = clamp(1.0 - block * (1.0 - 0.18 * e) + max(leak, 0.0) + 0.08 * e - 0.04, 0.0, 1.0);

  float D = mix(Dc, Dp, uPhoto);
  D = mix(0.97, D, neg);                         // fully exposed border around the negative

  /* ---- process artefacts on the density */
  float hp = paperH(cp);
  float mott = fbm(cp / 85.0 + 2.0) - 0.5;
  D *= 1.0 + mott * 0.22 + (fbm(cp / 300.0 + 9.0) - 0.5) * 0.16;
  D *= 1.0 + rim * 0.12;
  // water stains: a few dried pools, a touch paler inside with a darker tide line at the rim
  float wf = fbm(cp / 340.0 + 31.0);
  float stain = smoothstep(0.6, 0.625, wf);
  float tideLine = 1.0 - smoothstep(0.0, 0.01, abs(wf - 0.612));
  D *= 1.0 - 0.07 * stain;
  D *= 1.0 + 0.12 * tideLine;
  // rinse streaks running down
  D *= 1.0 - 0.06 * smoothstep(0.62, 0.9, vnoise(vec2(cp.x / 11.0, cp.y / 380.0) + 5.0));
  // the coating skips the paper's valleys → pale speckles in the deep blue
  D *= 1.0 - 0.24 * smoothstep(0.34, 0.2, hp) * smoothstep(0.4, 0.9, D);
  // soft grain
  float gr = (hash12(floor(cp / 1.3) + 0.5) - 0.5) * 0.06 + (vnoise(cp * 0.6) - 0.5) * 0.05;
  D = clamp(D + gr, 0.0, 1.06);

  /* ---- development: sensitiser → exposure → rinse → oxidation */
  float yTop = 1.0 - (cp.y - (C.y - H.y)) / max(2.0 * H.y, 1.0);    // 0 at the top of the coating
  float ripple = (vnoise(vec2(cp.x / 40.0, uTime * 0.8)) - 0.5) * 0.05;
  float washed = 1.0 - smoothstep(uWash - 0.012, uWash + 0.012, yTop + ripple);
  vec3 fresh = tone(D * mix(0.74, 1.0, uOx));
  vec3 sens = vec3(0.86, 0.84, 0.5) * (0.93 + 0.07 * hp);
  vec3 exposing = mix(sens, vec3(0.42, 0.47, 0.44), smoothstep(0.1, 1.0, D) * uDev);
  vec3 ink = mix(exposing, fresh, washed);
  // wet sheen at the rinse front
  float front = exp(-pow((yTop + ripple - uWash) / 0.02, 2.0)) * step(uWash, 1.05);
  ink += front * 0.1;

  vec3 col = mix(uPaper, ink, coat);

  /* ---- paper relief, lit from the upper left; faint fibres on top */
  float hx = paperH(cp + vec2(1.0, 0.0));
  float hy = paperH(cp + vec2(0.0, 1.0));
  col *= 1.0 + ((hp - hx) + (hy - hp)) * 0.085;
  col *= 1.0 - 0.03 * (fbm(cp / 260.0) - 0.5);
  vec2 vu = cp / res - 0.5;
  col *= 1.0 - dot(vu, vu) * 0.12;
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type CyState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: CyanotypeMode
  expo: number
  expoTarget: number
  dev: number // seconds into the development sequence; Infinity = done
}
export type CyanotypeEffect = StylizeEffect & { cy: CyState }

const EXPOSE = 2.6
const WASH = 1.9
const OXIDISE = 2.8
const DEV_TOTAL = EXPOSE + WASH + OXIDISE

export function createCyanotypeEffect(init: { mode?: CyanotypeMode } = {}): CyanotypeEffect {
  const m0 = init.mode ?? 'classic'
  const st: CyState = { from: LOOKS[m0], to: LOOKS[m0], cur: LOOKS[m0], k: 1, mode: m0, expo: 0, expoTarget: 0, dev: Infinity }
  const u = {
    uPaper: { value: new THREE.Vector3() },
    uLight: { value: new THREE.Vector3() },
    uMid: { value: new THREE.Vector3() },
    uDeep: { value: new THREE.Vector3() },
    uPhoto: { value: 0 },
    uGamma: { value: 1 },
    uExpo: { value: 0 },
    uFrame: { value: new THREE.Vector4(0.5, 0.5, 0.455, 0.435) },
    uInset: { value: 30 },
    uDev: { value: 1 },
    uWash: { value: 2 },
    uOx: { value: 1 },
  }
  const apply = (L: Look) => {
    u.uPaper.value.set(...L.paper)
    u.uLight.value.set(...L.light)
    u.uMid.value.set(...L.mid)
    u.uDeep.value.set(...L.deep)
    u.uPhoto.value = L.photo
    u.uGamma.value = L.gamma
  }
  apply(st.cur)
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    background: cyanotypeMeta.background,
    cy: st,
    update(dt) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
        apply(st.cur)
      }
      st.expo += (st.expoTarget - st.expo) * Math.min(1, dt * 4)
      u.uExpo.value = st.expo
      if (st.dev < DEV_TOTAL) {
        st.dev += dt
        const t = st.dev
        u.uDev.value = Math.min(1, t / EXPOSE)
        u.uWash.value = t < EXPOSE ? -0.05 : t < EXPOSE + WASH ? -0.05 + ease((t - EXPOSE) / WASH) * 1.15 : 2
        u.uOx.value = t < EXPOSE + WASH ? 0 : ease(Math.min(1, (t - EXPOSE - WASH) / OXIDISE))
      } else {
        u.uDev.value = 1
        u.uWash.value = 2
        u.uOx.value = 1
      }
    },
  }
}

export function setCyanotypeMode(fx: StylizeEffect, mode: CyanotypeMode) {
  const st = (fx as CyanotypeEffect).cy
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** 曝光: -1 (under) … 0 … 1 (over) */
export function setCyanotypeExposure(fx: StylizeEffect, v: number) {
  const st = (fx as CyanotypeEffect).cy
  if (st) st.expoTarget = v
}

/** where the sensitiser was brushed: centre (uv, y up) and half size (fractions of the viewport) */
export function setCyanotypeFrame(fx: StylizeEffect, cx: number, cy: number, hw: number, hh: number, inset = 30) {
  const u = fx.uniforms
  if (!u) return
  ;(u.uFrame.value as THREE.Vector4).set(cx, cy, hw, hh)
  u.uInset.value = inset
}

/** run the print through exposure → rinse → oxidation (≈7 s) */
export function developCyanotype(fx: StylizeEffect) {
  const st = (fx as CyanotypeEffect).cy
  if (st) st.dev = 0
}

/** 0 → 1 through the development; 1 when settled. `stage` 0 exposing, 1 washing, 2 oxidising, 3 done */
export function cyanotypeProgress(fx: StylizeEffect) {
  const st = (fx as CyanotypeEffect).cy
  if (!st || st.dev >= DEV_TOTAL) return { p: 1, stage: 3 }
  const t = st.dev
  return { p: t / DEV_TOTAL, stage: t < EXPOSE ? 0 : t < EXPOSE + WASH ? 1 : 2 }
}
