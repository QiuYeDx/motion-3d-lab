import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 卡通描边 — cel shading as a pure post effect (the scene keeps its ordinary PBR materials).
 *
 *  · light / shadow bands: the effect can't see albedo, so it estimates it. Around each pixel it looks at
 *    4 rings of samples (≈ 2 % … 19 % of the screen height) and keeps the brightest one that is the SAME
 *    material — same chromaticity (r,g,b / sum) and same coverage — ignoring clipped highlights.
 *    illum = luma / that local maximum ≈ how lit this point is relative to its own albedo, which is
 *    thresholded into 2 (or 3) bands with a crisp, anti-aliased terminator. The lit colour is the pixel's
 *    own colour rescaled to the local maximum (hue kept, saturation boosted); shadows multiply it by a
 *    cool / violet tint, anime style.
 *  · highlights: a pixel much brighter than the ring around it is a specular peak → a crisp white pip;
 *    in 日式动画 the pips grow 4-point star rays.
 *  · rim light: view-space normals that face away from the camera (upper-right side).
 *  · ink lines: depth jumps measured on 1/z (planes have zero 2nd difference in 1/z, so slopes never ink),
 *    tested at 4 radii in 4 directions. The line WIDTH follows the size of the jump: silhouettes against
 *    the sky get the full width, small occlusions thin lines, and a line tapers to nothing where the jump
 *    fades out. Normal creases add thin lines on top. Line colour: a darkened version of the local colour
 *    (anime / flat) or pure ink (comic).
 *  · modes only change uniforms, interpolated on the CPU → mode switches morph.
 */

export const toonModes = [
  { id: 'anime', label: '日式动画' },
  { id: 'comic', label: '美漫网点' },
  { id: 'flat', label: '扁平插画' },
] as const
export type ToonMode = (typeof toonModes)[number]['id']

export const toonMeta = { title: '卡通描边', en: 'Toon Shading', background: '#bfe2ff', theme: 'light' as const }

type V3 = [number, number, number]
type Look = {
  thresh: number // lit / shadow split on illum
  thresh2: number // shadow / deep split (3-band)
  bands3: number // 0 = 2 bands, 1 = 3 bands
  soft: number // terminator half-width (illum units, added to the AA width)
  tint: V3 // shadow multiply
  sat: number
  rim: number
  spec: number
  star: number
  dots: number // Ben-Day dots in the shadow bands
  sky: number // 0 smooth gradient, 1 halftone sky, 2 posterised sky (blended)
  skyDots: number
  skyPoster: number
  flat: number // posterise + flatten
  grain: number
  lineW: number // silhouette line width, CSS px
  creaseW: number // crease sample radius, CSS px
  creaseK: number
  inkMix: number // 0 line = darkened local colour, 1 = pure ink
  ink: V3
  paper: V3 // comic paper tone for the sky
}

const rgb = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LOOKS: Record<ToonMode, Look> = {
  anime: {
    thresh: 0.74, thresh2: 0.0, bands3: 0, soft: 0.015, tint: [0.7, 0.64, 0.92], sat: 1.16, rim: 0.85, spec: 1, star: 1,
    dots: 0, sky: 0, skyDots: 0, skyPoster: 0, flat: 0, grain: 0, lineW: 1.9, creaseW: 0.9, creaseK: 0.8, inkMix: 0.18,
    ink: rgb('#2a2036'), paper: rgb('#fbf7ee'),
  },
  comic: {
    thresh: 0.78, thresh2: 0.45, bands3: 1, soft: 0.006, tint: [0.58, 0.52, 0.8], sat: 1.32, rim: 0.3, spec: 0.9, star: 0,
    dots: 1, sky: 1, skyDots: 1, skyPoster: 0, flat: 0, grain: 0.25, lineW: 3.6, creaseW: 1.25, creaseK: 1, inkMix: 1,
    ink: rgb('#141018'), paper: rgb('#fbf5e6'),
  },
  flat: {
    thresh: 0.7, thresh2: 0.0, bands3: 0, soft: 0.0, tint: [0.84, 0.81, 0.96], sat: 1.06, rim: 0, spec: 0.25, star: 0,
    dots: 0, sky: 2, skyDots: 0, skyPoster: 1, flat: 1, grain: 1, lineW: 1.1, creaseW: 0, creaseK: 0, inkMix: 0,
    ink: rgb('#2b2a3a'), paper: rgb('#fbf7ee'),
  },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const out: Record<string, number | V3> = {}
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    out[key] = Array.isArray(x) ? (x.map((xi, i) => xi + ((y as V3)[i] - xi) * k) as V3) : x + ((y as number) - x) * k
  }
  return out as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform float uThresh;
uniform float uThresh2;
uniform float uBands3;
uniform float uSoft;
uniform vec3 uTint;
uniform float uSat;
uniform float uRim;
uniform float uSpec;
uniform float uStar;
uniform float uDots;
uniform float uSkyDots;
uniform float uSkyPoster;
uniform float uFlat;
uniform float uGrain;
uniform float uLineW;
uniform float uLineScale;
uniform float uCreaseW;
uniform float uCreaseK;
uniform float uInkMix;
uniform vec3 uInk;
uniform vec3 uPaper;

vec3 chromaOf(vec3 c) { return c / (c.r + c.g + c.b + 0.01); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// local maximum luma of the same material (x) + brightest same-surface neighbour (y, for specular peaks)
vec2 localLight(vec2 px, vec3 c, float L, float cov) {
  vec3 ch = chromaOf(c);
  // power mean (p = 16) instead of a hard max: close to the max once a fair share of the samples see the lit
  // side, but no single tap can flip it — a hard max stamps ghost copies of every highlight around itself
  float L2 = L * L, L4 = L2 * L2, L8 = L4 * L4;
  float M8 = L8 * L8 * 2.0;
  float Mw = 2.0;
  float near = 0.0;
  float nearW = 0.0;
  float H = uRes.y;
  for (int ring = 0; ring < 4; ring++) {
    float r = H * 0.018 * pow(2.2, float(ring));
    float a0 = float(ring) * 0.52 + 0.2;
    for (int i = 0; i < 6; i++) {
      float a = a0 + float(i) * 1.0472;
      vec2 q = px + vec2(cos(a), sin(a)) * r;
      vec3 s = sceneAt(q);
      float cs = coverageAt(q);
      float Ls = luma(s);
      float same = 1.0 - abs(cs - cov);
      if (ring < 2) {
        // specular peak reference: the same surface only (a light floor next to a dark object is no highlight)
        // brighter than EVERY neighbour on one of the two rings = a small isolated highlight
        // (lit floor beside a cast shadow has bright neighbours along the edge, so it isn't one);
        // samples off the surface (other coverage) count as "as bright as me", never as darker
        float nb = mix(L, Ls, same);
        if (ring == 0) near = max(near, nb);
        else nearW = max(nearW, nb);
      }
      float sim = (1.0 - smoothstep(0.045, 0.12, distance(chromaOf(s), ch))) * same * (1.0 - smoothstep(0.985, 0.999, Ls));
      float x = max(mix(L, Ls, sim), L);
      float x2 = x * x, x4 = x2 * x2, x8 = x4 * x4;
      float w = ring == 3 ? 0.7 : 1.0;
      M8 += x8 * x8 * w;
      Mw += w;
    }
  }
  float M = max(pow(M8 / Mw, 0.0625), L);
  return vec2(M, min(near, nearW));
}

// specular peak seed: bright, and darker a little way off on both sides of the ray
float peakAt(vec2 q, vec2 perp) {
  float L = luma(sceneAt(q));
  float o = 7.0 * uDpr;
  float side = max(luma(sceneAt(q + perp * o)), luma(sceneAt(q - perp * o)));
  return smoothstep(0.86, 0.96, L) * smoothstep(0.1, 0.22, L - side);
}

float starRays(vec2 px) {
  float s = 0.0;
  for (int d = 0; d < 2; d++) {
    vec2 dir = d == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    for (int k = 1; k <= 3; k++) {
      float t = float(k) / 3.0;
      vec2 o = dir * t * 12.0 * uDpr;
      float fall = 1.0 - t * 0.78;
      s = max(s, max(peakAt(px + o, perp), peakAt(px - o, perp)) * fall);
    }
  }
  // thin the rays: they only survive close to the axis lines through a seed (the perp test does that)
  return s;
}

// depth-jump line: width grows with the size of the jump; 1/z so planes never ink
float depthLine(vec2 px, float d0, out float silh) {
  float iz0 = 1.0 / d0;
  float W = max(uLineW * uLineScale * uDpr, 0.0);
  float line = 0.0;
  silh = 0.0;
  if (W < 0.3) return 0.0;
  for (int k = 1; k <= 4; k++) {
    float s = max(W * float(k) / 4.0, 1.0);
    float J = 0.0;
    float F = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 dir = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(0.0, 1.0) : i == 2 ? vec2(0.7071, 0.7071) : vec2(0.7071, -0.7071);
      vec2 o = dir * s;
      float ip = 1.0 / depthAt(px + o);
      float im = 1.0 / depthAt(px - o);
      // near side of an occluding edge: 1/z drops sharply on one side
      J = max(J, -(ip + im - 2.0 * iz0) / iz0);
      // far side (thin outer half of the line, softens the outer boundary)
      F = max(F, (ip + im - 2.0 * iz0) / max(min(ip, im), 1e-4));
    }
    J = clamp(J, 0.0, 1.0);
    float g = smoothstep(0.015, 0.16, J);          // jump size → width
    float on = smoothstep(0.012, 0.022, J);
    line = max(line, on * clamp(W * (0.3 + 0.7 * g) - s + 1.0, 0.0, 1.0));
    float far = smoothstep(0.03, 0.06, F);
    line = max(line, far * clamp(W * 0.32 - s + 1.0, 0.0, 1.0));
    silh = max(silh, g);
  }
  return line;
}

float creaseLine(vec2 px) {
  float r = uCreaseW * uLineScale * uDpr;
  if (r < 0.3 || uCreaseK < 0.01) return 0.0;
  r = max(r, 0.8);
  vec3 n00 = normalAt(px + vec2(-r, -r));
  vec3 n20 = normalAt(px + vec2(r, -r));
  vec3 n02 = normalAt(px + vec2(-r, r));
  vec3 n22 = normalAt(px + vec2(r, r));
  vec3 n10 = normalAt(px + vec2(0.0, -r));
  vec3 n12 = normalAt(px + vec2(0.0, r));
  vec3 n01 = normalAt(px + vec2(-r, 0.0));
  vec3 n21 = normalAt(px + vec2(r, 0.0));
  vec3 gx = (n20 + 2.0 * n21 + n22) - (n00 + 2.0 * n01 + n02);
  vec3 gy = (n02 + 2.0 * n12 + n22) - (n00 + 2.0 * n10 + n20);
  float e = sqrt(dot(gx, gx) + dot(gy, gy));
  return smoothstep(1.2, 2.2, e) * uCreaseK;
}

// Ben-Day dots: cover = inked area fraction
float benday(vec2 px, float cellCss, float cover) {
  float cell = cellCss * uDpr;
  vec2 q = mat2(0.7071, 0.7071, -0.7071, 0.7071) * px / cell;
  vec2 f = fract(q) - 0.5;
  float d = length(f) * cell;
  float r = sqrt(clamp(cover, 0.0, 0.9) / 3.14159) * cell;
  return 1.0 - smoothstep(r - 0.7, r + 0.7, d);
}

vec3 sky(vec2 px, vec3 base) {
  float y = px.y / uRes.y;                        // 0 bottom → 1 top
  vec3 top = base * vec3(0.7, 0.83, 0.98);
  vec3 bot = min(base * 1.05 + 0.04, vec3(1.0));
  vec3 smoothSky = mix(bot, top, smoothstep(0.0, 1.0, y));
  // flat: banded gradient
  float yq = (floor(y * 5.0) + 0.5) / 5.0;
  vec3 poster = mix(bot, top, yq);
  vec3 s = mix(smoothSky, poster, uSkyPoster);
  // comic: halftone sky on paper, denser toward the top
  float hd = benday(px, 8.0, mix(0.04, 0.55, smoothstep(0.1, 1.0, y)));
  vec3 comic = mix(uPaper, top * vec3(0.82, 0.92, 1.0), hd);
  return mix(s, comic, uSkyDots);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec3 c = sceneAt(px);
  float cov = coverageAt(px);
  float d0 = depthAt(px);
  vec3 n = normalAt(px);
  float L = luma(c);

  vec2 ll = localLight(px, c, L, cov);
  float M = max(ll.x, 0.035);
  float illum = L / M;

  // lit colour estimate: own hue at the local maximum value, saturated
  vec3 alb = min(c * min(M / max(L, 0.015), 6.0), vec3(1.0));
  // the lit band only goes part of the way to the estimate: flatter than the render, but a stray bright
  // sample can't stamp a visible ghost into it
  vec3 litC = mix(min(c * 1.04 + 0.01, vec3(1.0)), alb, 0.55);
  alb = clamp(mix(vec3(luma(alb)), alb, uSat), 0.0, 1.0);
  litC = clamp(mix(vec3(luma(litC)), litC, uSat), 0.0, 1.0);
  // flat: posterise the value
  float v = max(max(alb.r, alb.g), alb.b);
  float vq = (floor(v * 5.0 + 0.6)) / 5.0;
  alb = mix(alb, alb * clamp(vq / max(v, 0.01), 0.6, 1.4), uFlat * 0.8);
  litC = mix(litC, alb, uFlat);

  // bands (AA from the derivative so the terminator is crisp but not jagged)
  float aa = max(fwidth(illum), 1e-3) * 0.75 + uSoft;
  float lit = smoothstep(uThresh - aa, uThresh + aa, illum);
  float deep = (1.0 - smoothstep(uThresh2 - aa, uThresh2 + aa, illum)) * uBands3;

  vec3 shadowCol = alb * uTint;
  vec3 deepCol = shadowCol * vec3(0.5, 0.48, 0.62);
  vec3 col;
  if (uDots > 0.01) {
    // comic: mid band = dots of the shadow colour on the lit colour, deep band = ink dots on the shadow colour
    float dMid = benday(px, 6.0, 0.42);
    float dDeep = benday(px, 6.0, 0.5);
    vec3 midC = mix(litC, shadowCol * 0.85, dMid);
    vec3 deepC = mix(shadowCol * 0.82, mix(uInk, deepCol, 0.35), dDeep);
    vec3 dotted = mix(mix(midC, deepC, deep), litC, lit);
    vec3 plain = mix(mix(shadowCol, deepCol, deep), litC, lit);
    col = mix(plain, dotted, uDots);
  } else {
    col = mix(mix(shadowCol, deepCol, deep), litC, lit);
  }

  // rim light (upper-right, faces turned away from the camera)
  float rimF = smoothstep(0.7, 0.86, 1.0 - n.z) * smoothstep(-0.15, 0.45, dot(n.xy, normalize(vec2(0.8, 0.55)))) * cov;
  col = mix(col, min(alb * 1.15 + 0.32, vec3(1.0)), rimF * uRim * mix(0.55, 1.0, 1.0 - lit));

  // specular pips + star rays
  float peak = smoothstep(0.06, 0.2, L - ll.y) * smoothstep(0.78, 0.92, L) * cov;
  float pip = smoothstep(0.45, 0.6, peak) * uSpec;
  float glow = peak * 0.35 * uStar;
  float rays = 0.0;
  if (uStar > 0.01) rays = starRays(px) * uStar;
  col = mix(col, vec3(1.0), clamp(max(pip, rays * 0.95) + glow, 0.0, 1.0));

  // background
  float bg = 1.0 - cov;
  col = mix(col, sky(px, c), bg);

  // ink
  float silh;
  float dl = depthLine(px, d0, silh);
  float cl = creaseLine(px) * cov;
  float lineA = max(dl, cl);
  vec3 lineLocal = mix(alb, shadowCol, 0.5) * vec3(0.36, 0.33, 0.46);
  vec3 lineCol = mix(lineLocal, uInk, uInkMix);
  col = mix(col, lineCol, clamp(lineA, 0.0, 1.0));

  // paper grain (flat illustration) / print tooth (comic)
  float g = (hash12(floor(cp * 1.2)) - 0.5) * 0.05 + (vnoise(cp * 0.06) - 0.5) * 0.035;
  col += g * uGrain;
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type ToonState = { from: Look; to: Look; cur: Look; k: number; mode: ToonMode; width: number; widthTarget: number }
export type ToonEffect = StylizeEffect & { toon: ToonState }

export function createToonEffect(): ToonEffect {
  const st: ToonState = { from: LOOKS.anime, to: LOOKS.anime, cur: LOOKS.anime, k: 1, mode: 'anime', width: 1, widthTarget: 1 }
  const v3 = (c: V3) => new THREE.Vector3(...c)
  const u = {
    uThresh: { value: 0 },
    uThresh2: { value: 0 },
    uBands3: { value: 0 },
    uSoft: { value: 0 },
    uTint: { value: v3(LOOKS.anime.tint) },
    uSat: { value: 1 },
    uRim: { value: 0 },
    uSpec: { value: 0 },
    uStar: { value: 0 },
    uDots: { value: 0 },
    uSkyDots: { value: 0 },
    uSkyPoster: { value: 0 },
    uFlat: { value: 0 },
    uGrain: { value: 0 },
    uLineW: { value: 1 },
    uLineScale: { value: 1 },
    uCreaseW: { value: 1 },
    uCreaseK: { value: 1 },
    uInkMix: { value: 0 },
    uInk: { value: v3(LOOKS.anime.ink) },
    uPaper: { value: v3(LOOKS.anime.paper) },
  }
  const apply = (L: Look) => {
    u.uThresh.value = L.thresh
    u.uThresh2.value = L.thresh2
    u.uBands3.value = L.bands3
    u.uSoft.value = L.soft
    u.uTint.value.set(...L.tint)
    u.uSat.value = L.sat
    u.uRim.value = L.rim
    u.uSpec.value = L.spec
    u.uStar.value = L.star
    u.uDots.value = L.dots
    u.uSkyDots.value = L.skyDots
    u.uSkyPoster.value = L.skyPoster
    u.uFlat.value = L.flat
    u.uGrain.value = L.grain
    u.uLineW.value = L.lineW
    u.uCreaseW.value = L.creaseW
    u.uCreaseK.value = L.creaseK
    u.uInkMix.value = L.inkMix
    u.uInk.value.set(...L.ink)
    u.uPaper.value.set(...L.paper)
    u.uLineScale.value = st.width
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    background: toonMeta.background,
    toon: st,
    update(dt) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.7)
        const e = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, e)
      }
      st.width += (st.widthTarget - st.width) * Math.min(1, dt * 8)
      apply(st.cur)
    },
  }
}

export function setToonMode(fx: StylizeEffect, mode: ToonMode) {
  const st = (fx as ToonEffect).toon
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** ink line width multiplier (1 = the mode's default; 0.5 … 1.8 reads well) */
export function setToonLineWidth(fx: StylizeEffect, k: number) {
  const st = (fx as ToonEffect).toon
  if (st) st.widthTarget = k
}
