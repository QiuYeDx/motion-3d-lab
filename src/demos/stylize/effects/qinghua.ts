import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 青花 — underglaze cobalt painted on white porcelain under a glassy transparent glaze.
 *
 *  1. 分水. Scene value (lightly softened) → cobalt density, quantised into five washes (影淡 · 正淡 · 二浓 ·
 *     正浓 · 头浓) over the white body. Wash borders wander with a slow noise and pool a little darker where the
 *     wash dried (the painter's water line).
 *  2. 勾线. Depth / normal / coverage changes on a ring of taps become a fine dark cobalt outline whose width
 *     swells and thins with a slow "brush pressure" noise.
 *  3. 晕散. A wider ring gives a blurred density that creeps out from the dark masses into the glaze, so blue
 *     edges are slightly fuzzy (strongest in 元青花).
 *  4. 纹饰. Lit, flat parts of objects get registers of painted decoration, bottom → top: 莲瓣 lotus-petal
 *     panels, 回纹 key-fret, 缠枝莲 lotus scroll (petals washed deep at the base, pale at the tip), 回纹, 卷草
 *     scroll, each band framed by double 弦纹 lines. Low contrast — the form still reads through. The
 *     decoration lives on the screen by default or, with `setQinghuaAnchor`, on the surface of a turning
 *     object (cylindrical coordinates about its axis rebuilt from depth), so it turns with a vase.
 *  5. 堆积. Iron-rich cobalt (苏麻离青) heaps into near-black spots with a faint metallic glint where it pooled:
 *     in the deep washes, along lines and at accents. Heavy in 元青花, almost none in 明清.
 *  6. 釉. A bluish-white body; the glaze thickens to a pale celadon tint at grazing angles, carries a crisp
 *     window-shaped specular streak and a point highlight from a slowly moving key light (normals), plus
 *     tiny bubbles (visible as lens-like specks in the blue) and rare pinholes.
 *  7. 釉里红. In that mode warm scene hues and the lotus flowers are painted in underglaze copper red.
 *
 * Scene alpha < 0.97 (a material written with custom One/Zero blending, e.g. a rosewood stand) passes through;
 * the empty background is drawn in the flat page colour (`setQinghuaPaper`), keeping the shadows of a floor
 * that the page hides from the normal pass (e.g. a ShadowMaterial plane).
 * Modes are numbers lerped on the CPU, so a mode switch is a smooth morph. Each motif routine has a single call
 * site; derivatives are taken once, outside every branch; all taps are textureLod.
 */

export const qinghuaModes = [
  { id: 'yuan', label: '元青花', en: 'Yuan' },
  { id: 'ming', label: '明清', en: 'Ming–Qing' },
  { id: 'youlihong', label: '釉里红', en: 'Copper red' },
] as const
export type QinghuaMode = (typeof qinghuaModes)[number]['id']

export const qinghuaMeta = { title: '青花瓷', en: 'Blue & White', background: '#e7eaea', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = {
  body: V3
  pale: V3
  mid: V3
  deep: V3
  spot: V3
  gamma: number // density curve
  white: number // value above which the body stays white
  bleed: number // 晕散
  soft: number // wash border softness
  spots: number // 堆积
  line: number // outline width, CSS px
  motif: number // decoration strength (> 1 also paints it deeper)
  red: number // 釉里红
  lineK: number // outline darkness
}

const hex = (h: string): V3 => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LOOKS: Record<QinghuaMode, Look> = {
  yuan: {
    body: hex('#f1f5f3'),
    pale: hex('#a4b8e2'),
    mid: hex('#3352ae'),
    deep: hex('#17207a'),
    spot: hex('#0b0d2a'),
    gamma: 1.12,
    white: 0.17,
    bleed: 0.9,
    soft: 0.12,
    spots: 1,
    line: 1.45,
    motif: 1.5,
    red: 0,
    lineK: 0.95,
  },
  ming: {
    body: hex('#f7f9fb'),
    pale: hex('#c3d3ee'),
    mid: hex('#4d74c4'),
    deep: hex('#213f98'),
    spot: hex('#172a68'),
    gamma: 1.35,
    white: 0.2,
    bleed: 0.22,
    soft: 0.04,
    spots: 0.06,
    line: 0.95,
    motif: 1,
    red: 0,
    lineK: 0.85,
  },
  youlihong: {
    body: hex('#f6f8f6'),
    pale: hex('#b9cbec'),
    mid: hex('#4469ba'),
    deep: hex('#1d368a'),
    spot: hex('#171f4c'),
    gamma: 1.25,
    white: 0.18,
    bleed: 0.5,
    soft: 0.08,
    spots: 0.32,
    line: 1.15,
    motif: 1.12,
    red: 1,
    lineK: 0.9,
  },
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = { ...a }
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    ;(o as Record<string, unknown>)[key] = Array.isArray(x) ? lerp3(x as V3, y as V3, k) : lerp(x as number, y as number, k)
  }
  return o
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318531
uniform vec3 uPaper;   // flat background colour (sRGB)
uniform vec3 uBody;
uniform vec3 uPale;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uSpotC;
uniform vec3 uRPale;
uniform vec3 uRMid;
uniform vec3 uRDeep;
uniform vec4 uL1;      // gamma, white threshold, bleed, wash softness
uniform vec4 uL2;      // spots, line width (CSS px), motif strength, red
uniform float uLineK;
uniform float uCell;   // decoration unit, CSS px (screen mode)
uniform float uAnchor;
uniform mat4 uAM;      // view → object space
uniform vec4 uAP;      // tan(fov/2), units round the axis, unit height (object units), y offset (units)
uniform mat4 uAM2;
uniform vec4 uAP2;     // on, units round, unit height, y offset
uniform vec4 uAB2;     // bounds of object 2 in its own space: radius, y min, y max, -
uniform vec3 uLight;   // key light (view space)

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + 13.1; a *= 0.5; }
  return s / 0.875;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec4 sceneT(vec2 px) { return textureLod(tScene, px / uRes, 0.0); }
vec3 toS(vec3 c) {
  c *= uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmT(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// lens pointed at top and bottom: half height sqrt(r² - d²), half width r - d
float sdVesica(vec2 p, float r, float d) {
  p = abs(p);
  float b = sqrt(r * r - d * d);
  return (p.y - b) * d > p.x * b ? length(p - vec2(0.0, b)) : length(p - vec2(-d, 0.0)) - r;
}
// a petal / leaf: base at the origin, pointing up, length L, half width w
float petal(vec2 q, float L, float w) {
  float h = 0.5 * L;
  float r = 0.5 * (h * h / w + w);
  return sdVesica(q - vec2(0.0, h), r, r - w);
}
// archimedean curl r = b·θ, θ up to th1 (outer end), drawn from the eye outward
float curl(vec2 q, float b, float th1) {
  float rho = length(q);
  float t = mod(atan(q.y, q.x), TAU);
  float k = floor((rho / b - t) / TAU + 0.5);
  float th = t + TAU * max(k, 0.0);
  float d = abs(rho - b * th);
  if (th > th1) d = length(q - b * th1 * vec2(cos(th1), sin(th1)));
  return min(d, abs(rho - 0.012));
}

/* ---- decoration registers. Each returns (line distance, wash fill density, flower flag, accent dot sd), units */

// 莲瓣: upright lotus-petal panels with a double outline and a heaped dot inside
vec4 mPetals(float x, float v) {
  vec2 q = vec2((fract(x * 2.0) - 0.5) * 0.5, v - 0.1);
  float ax = abs(q.x);
  float R = 0.36;
  float dTop = length(vec2(ax, q.y) - vec2(0.19 - R, 0.42)) - R;
  float dBot = max(ax - 0.19, -q.y);
  float d = q.y > 0.42 ? dTop : dBot;
  float line = min(abs(d), abs(d + 0.05));
  float fill = d < -0.05 ? mix(0.32, 0.1, clamp(q.y / 0.68, 0.0, 1.0)) : 0.0;
  float acc = length((q - vec2(0.0, 0.34)) * vec2(1.0, 0.62)) - 0.04;
  return vec4(line, fill, 0.0, acc);
}

// 回纹: a continuous square meander on a shared baseline (band height 0.35)
vec4 mFret(float x, float v) {
  vec2 q = vec2(fract(x / 0.35), v / 0.35);
  float d = sdSeg(q, vec2(-0.02, 0.2), vec2(1.02, 0.2));
  d = min(d, sdSeg(q, vec2(0.86, 0.2), vec2(0.86, 0.8)));
  d = min(d, sdSeg(q, vec2(0.86, 0.8), vec2(0.24, 0.8)));
  d = min(d, sdSeg(q, vec2(0.24, 0.8), vec2(0.24, 0.38)));
  d = min(d, sdSeg(q, vec2(0.24, 0.38), vec2(0.68, 0.38)));
  d = min(d, sdSeg(q, vec2(0.68, 0.38), vec2(0.68, 0.64)));
  d = min(d, sdSeg(q, vec2(0.68, 0.64), vec2(0.42, 0.64)));
  d = min(d, sdSeg(q, vec2(0.42, 0.64), vec2(0.42, 0.52)));
  return vec4(d * 0.35, 0.0, 0.0, 1.0);
}

// 缠枝莲: a wavy stem; an open lotus on every crest, hanging leaves and a curling tendril at every trough
vec4 mLotus(float x, float v) {
  float fx = fract(x);
  float A = 0.24, y0 = 0.56;
  float ys = y0 + A * sin(TAU * fx);
  float sl = A * TAU * cos(TAU * fx);
  float line = abs(v - ys) / sqrt(1.0 + sl * sl);
  float fill = 0.0, flower = 0.0, acc = 1.0;
  // the lotus on the nearest crest (so its petals may spill over the cell border)
  {
    vec2 q = vec2(fract(x - 0.25 + 0.5) - 0.5, v - (y0 + A - 0.015));
    float L = 0.5;
    float dC = petal(q, L, 0.1);
    float dS = min(petal(rot(0.48) * q, L * 0.9, 0.094), petal(rot(-0.48) * q, L * 0.9, 0.094));
    float dO = min(petal(rot(1.02) * q, L * 0.68, 0.08), petal(rot(-1.02) * q, L * 0.68, 0.08));
    // front petals hide the outlines of those behind
    float lC = abs(dC);
    float lS = max(abs(dS), -dC);
    float lO = max(abs(dO), -min(dC, dS));
    float dU = min(dC, min(dS, dO));
    // seed-pod cup at the base
    float cup = length((q - vec2(0.0, 0.035)) * vec2(1.0, 1.7)) - 0.105;
    line = min(line, min(min(lC, lS), min(lO, max(abs(cup), -dC))));
    if (dU < 0.0) { fill = mix(0.56, 0.12, clamp(length(q) / L, 0.0, 1.0)); flower = 1.0; }
    if (cup < 0.0) { fill = 0.62; flower = 1.0; }
    acc = length(q - vec2(0.0, 0.03)) - 0.022;
  }
  // leaves hanging from the nearest trough, and a tendril rising beside it into a curl
  {
    vec2 p = vec2(fract(x - 0.75 + 0.5) - 0.5, v);
    vec2 b = vec2(0.0, y0 - A + 0.01);
    vec2 q1 = rot(PI - 0.62) * (p - b);
    vec2 q2 = rot(PI + 0.62) * (p - b);
    float l1 = petal(q1, 0.36, 0.085);
    float l2 = petal(q2, 0.3, 0.075);
    float dl = min(l1, l2);
    float rib = min(max(sdSeg(q1, vec2(0.0), vec2(0.0, 0.24)), l1), max(sdSeg(q2, vec2(0.0), vec2(0.0, 0.2)), l2));
    line = min(line, min(abs(dl), rib + 0.004));
    if (dl < 0.0) fill = max(fill, mix(0.48, 0.3, clamp(length(p - b) / 0.3, 0.0, 1.0)));
    vec2 c = vec2(0.05, 0.86);
    float cd = curl(p - c, 0.0125, 3.0 * PI);
    float y6 = y0 + A * sin(TAU * 0.6);
    float stalk = min(sdSeg(p, vec2(-0.15, y6), vec2(-0.1, 0.66)), sdSeg(p, vec2(-0.1, 0.66), vec2(-0.068, 0.86)));
    line = min(line, min(cd, stalk));
    acc = min(acc, length(p - c) - 0.016);
  }
  // a leaf where the stem crosses the middle, alternately up-left and down-right
  {
    float cx = floor(x * 2.0 + 0.5) * 0.5;
    float up = mod(cx * 2.0, 2.0) < 0.5 ? 1.0 : -1.0;   // rising crossing at whole units
    vec2 b = vec2(x - cx, v - y0);
    vec2 q = rot(up > 0.0 ? 0.75 : PI + 0.75) * b;
    float lf = petal(q, 0.26, 0.06);
    float rib = max(sdSeg(q, vec2(0.0), vec2(0.0, 0.2)), lf);
    line = min(line, min(abs(lf), rib + 0.004));
    if (lf < 0.0) fill = max(fill, mix(0.46, 0.28, clamp(length(b) / 0.26, 0.0, 1.0)));
  }
  return vec4(line, fill, flower, acc);
}

// 卷草: a low wave with a curling scroll leaf in every half unit, alternating up / down (band height 0.8)
vec4 mScroll(float x, float v) {
  float u = fract(x * 2.0);
  float s = mod(floor(x * 2.0), 2.0) < 0.5 ? 1.0 : -1.0;
  float A = 0.12, y0 = 0.4;
  float ys = y0 + A * s * sin(PI * u);
  float sl = A * s * PI * cos(PI * u) / 0.5;
  float line = abs(v - ys) / sqrt(1.0 + sl * sl);
  vec2 p = vec2(u * 0.5, v);
  // the curl hangs on the inside of the hump
  vec2 c = vec2(0.25, y0 + s * 0.05);
  vec2 q = (p - c) * vec2(1.0, s);
  float cd = curl(vec2(-q.x, q.y), 0.011, 2.6 * PI);
  // a leaf lobe sprouting from the hump outward
  vec2 lq = rot(-0.9 * s) * ((p - vec2(0.31, y0 + s * A * 0.95)) * vec2(1.0, s));
  float lf = petal(lq, 0.2, 0.05);
  line = min(line, min(cd, abs(lf)));
  float fill = lf < 0.0 ? 0.34 : 0.0;
  return vec4(line, fill, 0.0, length(p - c) - 0.014);
}

// one register per pixel; a period of 4 units: 莲瓣 · 回纹 · 缠枝莲 · 回纹 · 卷草, framed by double lines
vec4 motif(vec2 P) {
  float y = mod(P.y, 4.0);
  float x = P.x;
  float v, H;
  vec4 m;
  if (y < 1.0) { v = y; H = 1.0; m = mPetals(x, v); }
  else if (y < 1.35 || (y >= 2.85 && y < 3.2)) { v = y < 1.35 ? y - 1.0 : y - 2.85; H = 0.35; m = mFret(x + (y < 1.35 ? 0.0 : 0.17), v); }
  else if (y < 2.85) { v = y - 1.35; H = 1.5; m = mLotus(x, v); }
  else { v = y - 3.2; H = 0.8; m = mScroll(x, v); }
  m.x = min(m.x, min(min(abs(v - 0.018), abs(v - 0.06)), min(abs(H - 0.018 - v), abs(H - 0.06 - v))));
  return m;
}

vec3 cobalt(float D) {
  vec3 c = mix(uBody, uPale, smoothstep(0.0, 0.34, D));
  c = mix(c, uMid, smoothstep(0.3, 0.7, D));
  return mix(c, uDeep, smoothstep(0.62, 1.0, D));
}
vec3 copper(float D) {
  vec3 c = mix(uBody, uRPale, smoothstep(0.0, 0.34, D));
  c = mix(c, uRMid, smoothstep(0.3, 0.72, D));
  return mix(c, uRDeep, smoothstep(0.66, 1.0, D));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec4 s0 = sceneT(px);
  vec4 n0 = nrmT(px);
  vec3 c0 = toS(s0.rgb);
  float cov = n0.a;
  if (cov < 0.5) {
    // empty background: the flat page colour, keeping any shadow a hidden floor caught (scene darker than its
    // clear colour there) as a cool, soft shade
    float base = luma(toS(srgbToLinear(uPaper)));
    float sh = clamp(luma(c0) / max(base, 1e-3), 0.0, 1.0);
    return uPaper * mix(vec3(0.8, 0.84, 0.9), vec3(1.0), sh);
  }
  if (s0.a < 0.97) return c0;           // pass-through (stands, mounts)
  float d0 = depthL(px);
  vec3 nv = normalize(n0.rgb * 2.0 - 1.0);
  float v0 = luma(c0);

  /* ---- outline ring (brush pressure varies its radius) + wide ring for bleed and the decoration mask */
  float press = vnoise(cp * 0.018 + 3.0);
  float rl = uL2.y * uDpr * (0.65 + 0.7 * press);
  float rw = 6.0 * uDpr;
  float edge = 0.0;
  float Lw = 0.0, nw = 0.0, near = 0.0;
  vec3 cw = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    float a = float(k) * 0.7853982 + 0.2;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 q = px + dir * rl;
    vec4 nk = nrmT(q);
    float e = abs(nk.a - cov);
    if (nk.a > 0.5) {
      float dk = depthL(q);
      e = max(e, smoothstep(0.025, 0.07, abs(dk - d0) / d0));
      vec3 nkv = nk.rgb * 2.0 - 1.0;
      e = max(e, smoothstep(0.3, 0.55, 1.0 - dot(nkv, nv)));
    }
    edge = max(edge, e);
    vec2 q2 = px + rot(0.39) * dir * rw;
    vec4 n2 = nrmT(q2);
    vec4 s2 = sceneT(q2);
    float jump = abs(n2.a - cov);
    if (n2.a > 0.5) jump = max(jump, smoothstep(0.03, 0.08, abs(depthL(q2) - d0) / d0));
    near = max(near, jump);
    if (n2.a > 0.5 && s2.a > 0.97) {
      vec3 ck = toS(s2.rgb);
      Lw += luma(ck);
      cw += ck;
      nw += 1.0;
    }
  }
  Lw = nw > 0.0 ? Lw / nw : v0;
  cw = nw > 0.0 ? cw / nw : c0;

  /* ---- 分水: five washes */
  float bleed = uL1.z;
  float v = mix(v0, Lw, 0.2 + 0.25 * bleed);
  float Dr = pow(clamp((1.0 - v - uL1.y) / (0.92 - uL1.y), 0.0, 1.0), uL1.x);
  float wob = (fbm(cp * 0.007 + 7.0) - 0.5) * 0.3 + (vnoise(cp * 0.06) - 0.5) * 0.08;
  float q = clamp(Dr * 5.0 + wob * step(0.02, Dr), 0.0, 5.0);
  float f = fract(q);
  float s = uL1.w;
  float Dp = (floor(q) + smoothstep(0.5 - s, 0.5 + s, f)) / 5.0;
  // the drying wash leaves a slightly darker line on the deep side of each border
  float rim = smoothstep(0.5 + s, 0.5 + s + 0.04, f) * (1.0 - smoothstep(0.5 + s + 0.05, 0.5 + s + 0.22, f));
  Dp += rim * 0.05 * step(0.6, q);
  // brushed wash: faint streaks along the stroke
  Dp *= 1.0 + (vnoise(vec2(cp.x * 0.05 + cp.y * 0.02, cp.y * 0.006)) - 0.5) * 0.12;
  // 晕散: blue creeping out of the dark masses into the glaze
  float Dw = pow(clamp((1.0 - Lw - uL1.y) / (0.92 - uL1.y), 0.0, 1.0), uL1.x);
  Dp = max(Dp, Dw * (0.25 + 0.4 * bleed) * smoothstep(0.15, 0.6, Dw));

  /* ---- decoration coordinates: on the turning object, or on the screen */
  vec2 P = cp / uCell;
  float wrapN = 1e6;
  if (uAnchor > 0.5) {
    vec2 ndc = uv * 2.0 - 1.0;
    vec3 vp = vec3(ndc.x * d0 * uAP.x * uRes.x / uRes.y, ndc.y * d0 * uAP.x, -d0);
    vec3 o = (uAM * vec4(vp, 1.0)).xyz;
    vec3 cr = uAP.yzw;
    vec3 o2 = (uAM2 * vec4(vp, 1.0)).xyz;
    if (uAP2.x > 0.5 && length(o2.xz) < uAB2.x && o2.y > uAB2.y && o2.y < uAB2.z) {
      o = o2;
      cr = uAP2.yzw;
    }
    P = vec2(atan(o.x, o.z) / TAU * cr.x, o.y / cr.y + cr.z);
    wrapN = cr.x;
  }
  vec2 dPx = dFdx(P), dPy = dFdy(P);
  dPx.x -= wrapN * floor(dPx.x / wrapN + 0.5);
  dPy.x -= wrapN * floor(dPy.x / wrapN + 0.5);
  float gpx = clamp(0.5 * (length(dPx) + length(dPy)), 1e-4, 0.2);   // units per device px

  vec4 M = motif(P);
  float lw = uL2.y * uDpr * 0.42 * (0.8 + 0.4 * press);
  float dl = M.x / gpx;
  float aa = 0.7 + 0.9 * bleed;
  float mLine = 1.0 - smoothstep(lw - aa, lw + aa, dl);
  float mHalo = exp(-max(dl - lw, 0.0) / (1.6 * uDpr)) * 0.18 * bleed;
  float mAcc = 1.0 - smoothstep(-aa, aa, M.w / gpx);
  // only on lit, open surfaces, fading where the motif would be squeezed at silhouettes
  float mask = min(uL2.z, 1.0) * (1.0 - near) * smoothstep(0.7, 0.3, Dr) * smoothstep(0.05, 0.028, gpx * uDpr);
  float Dm = max(max(mLine * 0.64, mHalo), max(M.y, mAcc * 0.88 * mask));
  Dm = min(Dm * max(uL2.z, 1.0), 0.95) * mask;
  float D = max(Dp, Dm);
  float motifWins = step(Dp + 0.02, Dm);

  /* ---- 勾线 */
  float line = edge * uLineK;
  D = max(D, line * (0.86 + 0.14 * press));

  /* ---- copper red: warm scene hues, and the flowers of the decoration */
  vec3 ch = mix(c0, cw, 0.4);
  float mx = max(ch.r, max(ch.g, ch.b)), mn = min(ch.r, min(ch.g, ch.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float warm = step(max(ch.g, ch.b), ch.r) * smoothstep(0.22, 0.42, sat);
  float redK = uL2.w * max(warm * (1.0 - line * 0.6), M.z * motifWins);

  /* ---- 堆积: iron spots where the cobalt pooled */
  // irregular heaps: a two-octave noise on the object surface, thresholded high, only in the deeper blue
  float hn = vnoise(P * 7.0 + 3.0) * 0.62 + vnoise(P * 23.0 + 9.0) * 0.38;
  float spot = smoothstep(0.7 - 0.04 * bleed, 0.77, hn) * smoothstep(0.58, 0.9, D) * uL2.x;
  // and a scatter of small round specks
  vec2 sg = P * 11.0;
  vec2 si = floor(sg);
  vec2 sc = 0.25 + 0.5 * vec2(hash12(si + 3.1), hash12(si + 8.7));
  float sd = length(fract(sg) - sc) / (0.1 + 0.14 * hash12(si + 5.3));
  spot = max(spot, (1.0 - smoothstep(0.5, 1.0, sd)) * step(hash12(si + 17.0), 0.1) * smoothstep(0.6, 0.9, D) * uL2.x);
  // spots also gather along the outlines and on accent dots
  spot = max(spot, uL2.x * line * smoothstep(0.62, 0.8, vnoise(cp * 0.22 + 5.0)) * 0.9);
  spot = max(spot, uL2.x * mAcc * mask * 0.8);
  // heaps along the painted strokes, where the brush paused
  spot = max(spot, uL2.x * mLine * mask * smoothstep(0.66, 0.8, vnoise(P * 26.0 + 2.0)) * 0.85);
  spot = clamp(spot, 0.0, 1.0);

  vec3 col = mix(cobalt(D), copper(D), redK);
  vec3 spotC = mix(uSpotC, vec3(0.3, 0.1, 0.11), redK);
  col = mix(col, spotC, spot * 0.85);

  /* ---- the glaze over it all */
  float nz = clamp(nv.z, 0.0, 1.0);
  // thicker glaze at grazing angles pools a faint celadon tint; the body is gently shaded
  col = mix(col, col * vec3(0.88, 0.96, 0.95), pow(1.0 - nz, 2.5) * 0.55);
  col *= mix(0.9, 1.0, smoothstep(0.05, 0.75, v0));
  // bubbles: lens-like specks inside the glaze (seen in the blue), rare dark pinholes (棕眼)
  vec2 bg = P * 22.0;
  vec2 bi = floor(bg);
  float bh = hash12(bi + 41.0);
  vec2 bc = 0.25 + 0.5 * vec2(hash12(bi + 1.7), hash12(bi + 9.2));
  float bd = length(fract(bg) - bc) / (0.1 + 0.16 * hash12(bi + 4.4));
  float bub = (1.0 - smoothstep(0.6, 1.0, bd)) * step(bh, 0.22);
  float pin = (1.0 - smoothstep(0.3, 0.6, bd)) * step(0.993, bh);
  col = mix(col, col + vec3(0.1, 0.11, 0.12) * (1.0 - smoothstep(0.0, 0.7, bd)), bub * smoothstep(0.1, 0.5, D) * 0.9);
  col *= 1.0 - bub * smoothstep(0.7, 1.0, bd) * 0.06;
  col = mix(col, vec3(0.42, 0.44, 0.46), pin * 0.6);

  // specular: a crisp window streak + point highlight from the moving key light; fresnel sheen at the rim
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLight);
  vec3 Hh = normalize(L + V);
  float nh = max(dot(nv, Hh), 0.0);
  vec3 r = reflect(-V, nv);
  vec2 wq = vec2(r.x - L.x, r.y - L.y);
  vec2 wb = abs(rot(-0.12) * wq) - vec2(0.035, 0.26);
  float win = 1.0 - smoothstep(-0.01, 0.012, max(wb.x, wb.y));
  float spec = pow(nh, 260.0) * 1.2 + win * 0.72 + pow(nh, 30.0) * 0.08;
  spec *= smoothstep(0.0, 0.25, nz);
  float fres = pow(1.0 - nz, 4.0) * 0.16;
  col += spec * vec3(1.0, 1.0, 0.99) + fres * vec3(0.85, 0.92, 1.0);
  // iron spots glint a little in the highlight (锡光)
  col += spot * pow(nh, 18.0) * vec3(0.35, 0.36, 0.4);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type QhState = { from: Look; to: Look; cur: Look; k: number; mode: QinghuaMode; t: number; cell: number; cellT: number }
export type QinghuaEffect = StylizeEffect & { qh: QhState }

const RED = { pale: hex('#ecbdb4'), mid: hex('#be4a40'), deep: hex('#7a2023') }

export function createQinghuaEffect(init: { mode?: QinghuaMode; cell?: number } = {}): QinghuaEffect {
  const m0 = init.mode ?? 'yuan'
  const cell = init.cell ?? 104
  const st: QhState = { from: LOOKS[m0], to: LOOKS[m0], cur: LOOKS[m0], k: 1, mode: m0, t: 0, cell, cellT: cell }
  const v3 = (c: V3) => new THREE.Vector3(...c)
  const u = {
    uPaper: { value: v3(hex(qinghuaMeta.background)) },
    uBody: { value: new THREE.Vector3() },
    uPale: { value: new THREE.Vector3() },
    uMid: { value: new THREE.Vector3() },
    uDeep: { value: new THREE.Vector3() },
    uSpotC: { value: new THREE.Vector3() },
    uRPale: { value: v3(RED.pale) },
    uRMid: { value: v3(RED.mid) },
    uRDeep: { value: v3(RED.deep) },
    uL1: { value: new THREE.Vector4() },
    uL2: { value: new THREE.Vector4() },
    uLineK: { value: 1 },
    uCell: { value: cell },
    uAnchor: { value: 0 },
    uAM: { value: new THREE.Matrix4() },
    uAP: { value: new THREE.Vector4(0.3, 8, 0.8, 0) },
    uAM2: { value: new THREE.Matrix4() },
    uAP2: { value: new THREE.Vector4(0, 6, 0.4, 0) },
    uAB2: { value: new THREE.Vector4(1, 0, 1, 0) },
    uLight: { value: new THREE.Vector3(-0.35, 0.45, 0.82).normalize() },
  }
  const apply = (L: Look) => {
    u.uBody.value.set(...L.body)
    u.uPale.value.set(...L.pale)
    u.uMid.value.set(...L.mid)
    u.uDeep.value.set(...L.deep)
    u.uSpotC.value.set(...L.spot)
    u.uL1.value.set(L.gamma, L.white, L.bleed, L.soft)
    u.uL2.value.set(L.spots, L.line, L.motif, L.red)
    u.uLineK.value = L.lineK
  }
  apply(st.cur)
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    background: qinghuaMeta.background,
    qh: st,
    update(dt) {
      st.t += dt
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
        apply(st.cur)
      }
      st.cell += (st.cellT - st.cell) * (1 - Math.exp(-dt * 5))
      if (Math.abs(st.cell - st.cellT) < 0.01) st.cell = st.cellT
      u.uCell.value = st.cell
      // the key light drifts from side to side, so the glaze streak slides over the curves
      const a = Math.sin(st.t * 0.27) * 0.55 - 0.25
      u.uLight.value.set(Math.sin(a), 0.38 + 0.1 * Math.sin(st.t * 0.19), Math.cos(a)).normalize()
    },
  }
}

export function setQinghuaMode(fx: StylizeEffect, mode: QinghuaMode) {
  const st = (fx as QinghuaEffect).qh
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** decoration unit in CSS px when it lives on the screen (eases there) */
export function setQinghuaCell(fx: StylizeEffect, px: number) {
  const st = (fx as QinghuaEffect).qh
  if (st) st.cellT = px
}

/** flat colour drawn where nothing was rendered (match the page background); also becomes the clear colour */
export function setQinghuaPaper(fx: StylizeEffect, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color)
  const s = c.clone().convertLinearToSRGB()
  ;(fx.uniforms!.uPaper.value as THREE.Vector3).set(s.r, s.g, s.b)
  // the scene is cleared to the same colour, so shadows on a hidden floor can be measured against it
  fx.background = color
}

/**
 * Lay the decoration on a turning object: `viewToObject` = inverse of its model-view matrix, `around` = units
 * round the axis, `height` = unit height in object units, `offset` = register offset (units; a period is 4:
 * 莲瓣 0–1, 回纹 1–1.35, 缠枝莲 1.35–2.85, 回纹 2.85–3.2, 卷草 3.2–4). null = back to screen space.
 * The optional second object is used where a point lies inside its bounds (in its own object space).
 */
export type QinghuaAnchor = { viewToObject: THREE.Matrix4; around: number; height: number; offset?: number }
export function setQinghuaAnchor(
  fx: StylizeEffect,
  a: (QinghuaAnchor & { tanHalfFov: number }) | null,
  b?: (QinghuaAnchor & { radius: number; yMin: number; yMax: number }) | null,
) {
  const u = fx.uniforms!
  u.uAnchor.value = a ? 1 : 0
  if (!a) return
  ;(u.uAM.value as THREE.Matrix4).copy(a.viewToObject)
  ;(u.uAP.value as THREE.Vector4).set(a.tanHalfFov, a.around, a.height, a.offset ?? 0)
  const p2 = u.uAP2.value as THREE.Vector4
  if (!b) {
    p2.x = 0
    return
  }
  ;(u.uAM2.value as THREE.Matrix4).copy(b.viewToObject)
  p2.set(1, b.around, b.height, b.offset ?? 0)
  ;(u.uAB2.value as THREE.Vector4).set(b.radius, b.yMin, b.yMax, 0)
}
