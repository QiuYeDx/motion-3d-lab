import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 油画笔触 — anisotropic Kuwahara + oriented brush strokes + lit impasto on linen.
 *
 *  · orientation: a smoothed structure tensor of the scene's luminance gradient (4×4 luma taps → four
 *    overlapping Sobels), plus a weak prior from the view-space normals (strokes wrap around forms where
 *    the shading is flat) and a faint default diagonal (the painter's hand) where there is no structure.
 *  · colour: generalized anisotropic Kuwahara (Kyprianidis) — 8 sectors × 12 taps on an ellipse that is
 *    stretched along the edge tangent by the tensor's anisotropy. Sectors are weighted by 1 / (1 + σ^q),
 *    so the flattest neighbourhood wins and edges stay crisp while everything else becomes paint patches.
 *    Taps are read in a cheap √(linear) domain (no pow per tap) and converted once at the end.
 *  · strokes: two staggered cell layers of strokes laid along the tangent. The stroke angle is quantised
 *    into 8 bins and the two nearest bins are blended, so the cell grid never swirls. Each stroke has a
 *    rounded loaded head, bristle streaks, paint that runs out into dry-brush breaks, and an optional
 *    "dab" colour sampled at its centre (so impressionist dabs read as single touches of colour).
 *  · impasto: height = stroke body + bristles + ridges (+ canvas weave where the paint is thin); a normal
 *    from its finite differences is lit by a warm key from the upper left, with a soft varnish sheen.
 *  · modes only change numbers, which are interpolated on the CPU — a mode switch morphs, never cuts.
 */

export const oilModes = [
  { id: 'classic', label: '古典' },
  { id: 'impression', label: '印象派' },
  { id: 'impasto', label: '厚涂' },
] as const
export type OilMode = (typeof oilModes)[number]['id']

export const oilMeta = { title: '油画笔触', en: 'Oil Paint', background: '#e9dfca', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = {
  radius: number // Kuwahara radius, CSS px
  q: number // sector sharpness exponent
  len: number // stroke length, CSS px
  wid: number // stroke width, CSS px
  impasto: number // height / lighting strength
  knife: number // 0 bristle brush → 1 palette knife planes
  bristle: number // bristle streak strength
  dry: number // dry-brush breaks
  round: number // rounded dabs instead of long strokes
  dab: number // per-stroke flat colour (sampled at the stroke centre)
  jitter: number // per-stroke colour variation
  broken: number // ground showing between strokes
  sat: number
  contrast: number
  warm: number // classical warm / muted grade, umber shadows
  cool: number // impressionist coloured (violet) shadows, warm lights
  vig: number // dark vignette
  ground: V3
}

const rgb = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LOOKS: Record<OilMode, Look> = {
  classic: { radius: 10, q: 8, len: 46, wid: 11, impasto: 0.6, knife: 0, bristle: 1, dry: 0.5, round: 0, dab: 0.55, jitter: 0.06, broken: 0.1, sat: 0.84, contrast: 1.06, warm: 1, cool: 0, vig: 0.38, ground: rgb('#4a3020') },
  impression: { radius: 6, q: 6, len: 20, wid: 9, impasto: 0.75, knife: 0, bristle: 0.85, dry: 0.35, round: 1, dab: 0.85, jitter: 0.12, broken: 0.18, sat: 1.32, contrast: 1.02, warm: 0, cool: 1, vig: 0.1, ground: rgb('#f1eadb') },
  impasto: { radius: 12, q: 10, len: 50, wid: 22, impasto: 1.2, knife: 1, bristle: 0.25, dry: 0.3, round: 0, dab: 0.85, jitter: 0.07, broken: 0.1, sat: 1.14, contrast: 1.1, warm: 0.25, cool: 0.25, vig: 0.22, ground: rgb('#d9d2c4') },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number | V3>
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    o[key] = Array.isArray(x) ? (x.map((v, i) => v + ((y as V3)[i] - v) * k) as V3) : (x as number) + ((y as number) - (x as number)) * k
  }
  return o as unknown as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform float uRadius;
uniform float uQ;
uniform float uLen;
uniform float uWid;
uniform float uSize;
uniform float uImpasto;
uniform float uKnife;
uniform float uBristle;
uniform float uDry;
uniform float uRound;
uniform float uDab;
uniform float uJitter;
uniform float uBroken;
uniform float uSat;
uniform float uContrast;
uniform float uWarm;
uniform float uCool;
uniform float uVig;
uniform vec2 uVigC;
uniform vec3 uGround;

#define PI 3.14159265

vec3 rawAt(vec2 p) { return sqrt(max(texture2D(tScene, p / uRes).rgb * uExposure, 0.0)); }
vec3 finishCol(vec3 s) {
  vec3 c = s * s;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

/* smoothed structure tensor (fx², fy², fx·fy) from four overlapping Sobels on a 4×4 luma grid */
vec3 structureTensor(vec2 px, float s) {
  float l[16];
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++)
      l[j * 4 + i] = dot(rawAt(px + (vec2(float(i), float(j)) - 1.5) * s), vec3(0.299, 0.587, 0.114));
  vec3 T = vec3(0.0);
  for (int j = 1; j < 3; j++)
    for (int i = 1; i < 3; i++) {
      float gx = (l[(j - 1) * 4 + i + 1] + 2.0 * l[j * 4 + i + 1] + l[(j + 1) * 4 + i + 1])
               - (l[(j - 1) * 4 + i - 1] + 2.0 * l[j * 4 + i - 1] + l[(j + 1) * 4 + i - 1]);
      float gy = (l[(j + 1) * 4 + i - 1] + 2.0 * l[(j + 1) * 4 + i] + l[(j + 1) * 4 + i + 1])
               - (l[(j - 1) * 4 + i - 1] + 2.0 * l[(j - 1) * 4 + i] + l[(j - 1) * 4 + i + 1]);
      T += vec3(gx * gx, gy * gy, gx * gy);
    }
  return T * 0.25;
}

/* generalized anisotropic Kuwahara, 8 sectors × (3 angles × 4 radii) */
vec3 kuwahara(vec2 px, vec2 tdir, vec2 ndir, float A, float R) {
  float a = R * clamp(1.0 + A, 1.0, 2.0);
  float b = R * clamp(1.0 / (1.0 + A), 0.5, 1.0);
  vec3 c0 = rawAt(px);
  vec3 num = vec3(0.0);
  float den = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 m = c0;
    vec3 s = c0 * c0;
    for (int j = 0; j < 3; j++) {
      float ang = (float(k) + (float(j) + 0.5) / 3.0) * (PI * 0.25);
      vec2 d = vec2(cos(ang), sin(ang));
      for (int i = 0; i < 4; i++) {
        float r = (float(i) + 1.0) * 0.25;
        vec2 o = d * r;
        vec3 c = rawAt(px + tdir * (o.x * a) + ndir * (o.y * b));
        m += c;
        s += c * c;
      }
    }
    m /= 13.0;
    s = abs(s / 13.0 - m * m);
    float sig = (s.r + s.g + s.b) * 255.0;
    float w = 1.0 / (1.0 + pow(min(sig, 60.0), 0.5 * uQ));
    num += m * w;
    den += w;
  }
  return num / max(den, 1e-30);
}

/* one candidate stroke (rows of strokes along u, in the bin's rotated frame q, CSS px).
   returns height; alpha = coverage, order = painting order, id = hash, cq = centre in q, br = bristles */
float strokeAt(vec2 q, vec2 cell, float shift, float seed, float L, float W,
               out float alpha, out float order, out float id, out vec2 cq, out float br) {
  float h1 = hash12(cell + seed * 13.17);
  float h2 = hash12(cell.yx * 1.71 + seed * 5.31 + 2.0);
  float h3 = hash12(cell * 2.33 + seed + 7.0);
  float h4 = hash12(cell * 0.77 + seed * 2.9 + 4.0);
  vec2 c = vec2((cell.x + 0.5 + (h1 - 0.5) * 0.6) * L - shift, (cell.y + 0.5 + (h2 - 0.5) * 0.3) * W);
  cq = c;
  order = h4;
  id = hash12(cell * 0.913 + seed * 3.7 + 11.0);
  vec2 d = rot((h3 - 0.5) * mix(0.2, 0.7, uKnife)) * (q - c);
  float hl = 0.5 * L * mix(mix(0.95, 0.7, uKnife), 1.6, fract(h1 * 7.31 + h4));
  float hw = 0.5 * W * mix(0.95, 1.24, h2);
  float s = d.x / hl + uKnife * (h4 - 0.5) * 1.2 * d.y / hw; // knife: slanted, uneven ends
  float t = d.y / hw + (h3 - 0.5) * 0.45 * s * s;   // slight bow
  if (abs(s) > 1.0 || abs(t) > 1.0) { alpha = 0.0; br = 0.5; return 0.0; }
  // bristle streaks: fine across the stroke, long along it
  float bx = vnoise(vec2(s * 1.2 + h1 * 9.0, d.y * 0.55 + h2 * 37.0));
  float by = vnoise(vec2(s * 0.45 + 3.0, d.y * 1.2 + h3 * 19.0));
  br = mix(0.5, bx * 0.6 + by * 0.4, uBristle);
  // shape: knife = hard parallelogram, brush = soft ragged edges, loaded rounded head, tapering tail
  float soft = mix(0.38, 0.06, uKnife);
  float across = 1.0 - smoothstep(1.0 - soft, 1.0, abs(t) + (1.0 - uKnife) * (br - 0.5) * 0.3);
  float head = smoothstep(-1.0, -1.0 + mix(0.32, 0.06, uKnife), s - mix(0.25, 0.02, uKnife) * t * t);
  float tail = 1.0 - smoothstep(mix(0.35, 0.82, uKnife), 1.0, s);
  // paint runs out along the stroke → dry-brush breaks between the bristles
  float load = 1.0 - smoothstep(-0.3, 1.05, s) * (0.5 + 0.6 * h2) * uDry;
  float dryk = smoothstep(0.0, 0.22, load - (1.0 - br) * 0.7);
  // impressionist dabs: a rounded, ragged comma instead of a long stroke
  float e = length(vec2(s * 1.05 + 0.08, t)) * mix(0.82, 1.08, h4) + (vnoise(d * 0.35 + h3 * 40.0) - 0.5) * 0.3;
  float dabM = (1.0 - smoothstep(0.78, 1.02, e)) * (1.0 - smoothstep(0.5, 1.0, s) * 0.35);
  alpha = mix(across * head * tail, dabM, uRound) * mix(1.0, dryk, uDry);
  // height: body + bristles; knife: flat plateau with a ridge where the blade lifted off
  float body = mix(0.5 + 0.5 * br, 0.75 + 0.1 * h3, uKnife);
  float ridge = uKnife * smoothstep(0.3, 0.85, t) * (1.0 - smoothstep(0.85, 1.0, t)) * 0.45 * h1
              + uKnife * smoothstep(0.65, 0.95, s) * 0.45
              + (1.0 - uKnife) * smoothstep(-1.0, -0.85, s) * (1.0 - smoothstep(-0.85, -0.5, s)) * 0.3;
  return alpha * (body + ridge * across);
}

/* all strokes that can reach this pixel in one angle bin: 3 along × 2 rows, blended by painting order.
   returns height; alpha = coverage; top = dominant stroke (id, centre in CSS px, its alpha), br = bristles */
float strokeBin(vec2 cp, float ang, float seed, out float alpha, out float topId, out vec2 topC, out float topA, out float brOut) {
  vec2 du = vec2(cos(ang), sin(ang));
  vec2 dv = vec2(-du.y, du.x);
  vec2 q = vec2(dot(cp, du), dot(cp, dv));
  float L = uLen * uSize * 0.8;
  float W = uWid * uSize;
  float r0 = floor(q.y / W);
  float r1 = r0 + (fract(q.y / W) > 0.5 ? 1.0 : -1.0);
  float hs = 0.0, ws = 0.0, bs = 0.0, cover = 1.0, best = -1.0;
  topId = 0.0; topC = cp; topA = 0.0;
  for (int r = 0; r < 2; r++) {
    float row = r == 0 ? r0 : r1;
    float shift = hash12(vec2(row * 1.37, seed * 7.1)) * L;
    float col0 = floor((q.x + shift) / L);
    for (int k = -1; k <= 1; k++) {
      float a, o, id, b;
      vec2 cq;
      float h = strokeAt(q, vec2(col0 + float(k), row), shift, seed, L, W, a, o, id, cq, b);
      if (a <= 0.0) continue;
      float w = a * a * exp(7.0 * o);
      hs += h * w;
      bs += b * w;
      ws += w;
      cover *= 1.0 - a;
      float rank = o + step(0.35, a) * 2.0;
      if (rank > best) { best = rank; topId = id; topC = cq.x * du + cq.y * dv; topA = a; }
    }
  }
  alpha = 1.0 - cover;
  brOut = ws > 0.0 ? bs / ws : 0.5;
  // blended height, pulled down where coverage is thin
  return ws > 0.0 ? hs / ws * smoothstep(0.0, 0.6, alpha) : 0.0;
}

float weave(vec2 cp) {
  vec2 g = cp / 3.1;
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float over = mod(cell.x + cell.y, 2.0);
  float tv = 1.0 - pow(abs(f.x) * 2.0, 2.0);
  float th = 1.0 - pow(abs(f.y) * 2.0, 2.0);
  float slubV = 0.75 + 0.5 * vnoise(vec2(cell.x * 3.1, cp.y * 0.05));
  float slubH = 0.75 + 0.5 * vnoise(vec2(cp.x * 0.05, cell.y * 2.7 + 9.0));
  return over > 0.5 ? max(tv * slubV, th * slubH * 0.55) : max(th * slubH, tv * slubV * 0.55);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  float R = uRadius * uSize * uDpr;

  /* orientation */
  vec3 T = structureTensor(px, max(1.5, R * 0.42));
  vec3 n = normalAt(px);
  T += vec3(n.x * n.x, n.y * n.y, n.x * n.y) * 0.004;
  // default where nothing has structure: strokes rising to the right, wandering in broad patches
  float da = 2.18 + (vnoise(cp / 210.0 + 5.0) - 0.5) * 2.2 + (vnoise(cp / 70.0) - 0.5) * 0.6;
  vec2 g0 = vec2(cos(da), sin(da));
  T += vec3(g0.x * g0.x, g0.y * g0.y, g0.x * g0.y) * 0.0008;
  float E = T.x, G = T.y, F = T.z;
  float dd = sqrt((E - G) * (E - G) + 4.0 * F * F);
  float l1 = 0.5 * (E + G + dd);
  float l2 = 0.5 * (E + G - dd);
  vec2 gdir = E >= G ? vec2(l1 - G, F) : vec2(F, l1 - E);
  gdir = length(gdir) > 1e-9 ? normalize(gdir) : vec2(0.0, 1.0);
  vec2 tdir = vec2(-gdir.y, gdir.x);
  float A = l1 + l2 > 1e-9 ? (l1 - l2) / (l1 + l2) : 0.0;

  /* colour */
  vec3 base = kuwahara(px, tdir, gdir, A, R);

  /* strokes along the tangent (angle mod π, 8 bins; the two nearest are blended) */
  float ang = atan(tdir.y, tdir.x);
  if (ang < 0.0) ang += PI;
  float bf = ang / (PI / 8.0);
  float bin = floor(bf);
  float f = smoothstep(0.2, 0.8, fract(bf));
  float aA, iA, tA, bA, aB, iB, tB, bB;
  vec2 cA, cB;
  float hA = strokeBin(cp, mod(bin, 8.0) * (PI / 8.0), mod(bin, 8.0), aA, iA, cA, tA, bA);
  float hB = strokeBin(cp, mod(bin + 1.0, 8.0) * (PI / 8.0), mod(bin + 1.0, 8.0), aB, iB, cB, tB, bB);
  float H = mix(hA, hB, f);
  float alpha = mix(aA, aB, f);
  float br = mix(bA, bB, f);
  float id = f < 0.5 ? iA : iB;
  float alpha0 = mix(tA, tB, f);

  /* dab colour: the stroke carries the colour found at its centre, unless that crosses an edge */
  vec3 dabC = mix(rawAt(cA * uDpr), rawAt(cB * uDpr), f);
  vec3 dv = dabC - base;
  float sim = exp(-dot(dv, dv) * 16.0);
  vec3 paint = mix(base, dabC, uDab * alpha0 * sim);
  vec3 jit = vec3(hash12(vec2(id, 1.3)), hash12(vec2(id, 7.9)), hash12(vec2(id, 4.1))) - 0.5;
  paint += (jit * 0.6 + (hash12(vec2(id, 2.2)) - 0.5)) * uJitter * alpha0;
  vec3 c = finishCol(paint);

  /* palette */
  float l = luma(c);
  c = mix(vec3(l), c, uSat);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  l = luma(c);
  // classical: warm, muted, umber in the shadows, a golden varnish
  vec3 umber = vec3(0.25, 0.16, 0.09);
  vec3 cw = c * vec3(1.06, 0.98, 0.8);
  cw = mix(umber * (0.45 + l), cw, smoothstep(0.04, 0.5, l));
  c = mix(c, cw, uWarm);
  // impressionist: violet-blue shadows, warm sunlit lights
  vec3 cc = mix(c * vec3(0.84, 0.86, 1.18) + vec3(0.03, 0.02, 0.07), c, smoothstep(0.22, 0.58, l));
  cc = mix(cc, cc * vec3(1.05, 1.0, 0.86) + vec3(0.02, 0.015, 0.0), smoothstep(0.62, 0.92, l));
  c = mix(c, cc, uCool);

  /* ground between strokes, canvas weave in thin paint */
  float thin = 1.0 - clamp(alpha, 0.0, 1.0);
  float wv = weave(cp);
  float gap = thin * uBroken * (0.65 + 0.35 * (1.0 - wv));
  c = mix(c, uGround, clamp(gap, 0.0, 1.0));
  c *= 1.0 - 0.06 * (1.0 - wv) * (0.15 + 0.85 * thin);
  c *= 1.0 + (br - 0.5) * 0.12 * alpha * (1.0 - uKnife);

  /* impasto lighting (normal from the screen-space slope of the paint height, per CSS px) */
  float hC = H + wv * 0.22 * (1.0 - 0.8 * alpha);
  vec2 slope = clamp(vec2(dFdx(hC), dFdy(hC)) * uDpr, -1.2, 1.2);
  float k = 0.6 * uImpasto;
  vec3 N = normalize(vec3(-slope * k, 1.0));
  vec3 Ld = normalize(vec3(-0.55, 0.62, 0.62));
  float diff = dot(N, Ld) / Ld.z;
  float shade = clamp(mix(1.0, diff, 0.55), 0.62, 1.38);
  vec3 Hh = normalize(Ld + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(N, Hh), 0.0);
  float sp = mix(26.0, 16.0, uKnife);
  float spec = max(pow(nh, sp) - pow(Hh.z, sp) * 1.05, 0.0) * mix(0.32, 0.26, uKnife) * min(uImpasto, 1.0);
  float sheen = 0.03 * pow(nh, 5.0);
  c = c * shade + (spec + sheen) * vec3(1.0, 0.95, 0.84);

  /* vignette */
  vec2 uv = px / uRes;
  vec2 vd = (uv - uVigC) * vec2(uRes.x / uRes.y * 0.62, 1.0);
  float vig = smoothstep(0.35, 1.15, length(vd));
  c *= 1.0 - uVig * vig * 0.75;
  c = mix(c, c * vec3(0.92, 0.82, 0.66), uWarm * vig * 0.5);
  return clamp(c, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type OilState = { from: Look; to: Look; cur: Look; k: number; size: number; sizeTarget: number; mode: OilMode }
export type OilEffect = StylizeEffect & { oil: OilState }

export function createOilEffect(): OilEffect {
  const st: OilState = { from: LOOKS.classic, to: LOOKS.classic, cur: LOOKS.classic, k: 1, size: 1, sizeTarget: 1, mode: 'classic' }
  const u = {
    uRadius: { value: 7 },
    uQ: { value: 8 },
    uLen: { value: 30 },
    uWid: { value: 7 },
    uSize: { value: 1 },
    uImpasto: { value: 0.5 },
    uKnife: { value: 0 },
    uBristle: { value: 1 },
    uDry: { value: 0.5 },
    uRound: { value: 0 },
    uDab: { value: 0.3 },
    uJitter: { value: 0.04 },
    uBroken: { value: 0.2 },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uWarm: { value: 1 },
    uCool: { value: 0 },
    uVig: { value: 0.5 },
    uVigC: { value: new THREE.Vector2(0.5, 0.5) },
    uGround: { value: new THREE.Vector3() },
  }
  const apply = (L: Look) => {
    u.uRadius.value = L.radius
    u.uQ.value = L.q
    u.uLen.value = L.len
    u.uWid.value = L.wid
    u.uImpasto.value = L.impasto
    u.uKnife.value = L.knife
    u.uBristle.value = L.bristle
    u.uDry.value = L.dry
    u.uRound.value = L.round
    u.uDab.value = L.dab
    u.uJitter.value = L.jitter
    u.uBroken.value = L.broken
    u.uSat.value = L.sat
    u.uContrast.value = L.contrast
    u.uWarm.value = L.warm
    u.uCool.value = L.cool
    u.uVig.value = L.vig
    u.uGround.value.set(...L.ground)
    u.uSize.value = st.size
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    oil: st,
    update(dt) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        const e = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, e)
      }
      st.size += (st.sizeTarget - st.size) * Math.min(1, dt * 5)
      apply(st.cur)
    },
  }
}

export function setOilMode(fx: StylizeEffect, mode: OilMode) {
  const st = (fx as OilEffect).oil
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** brush size multiplier: 1 = default; ~0.75 fine … 1.4 broad */
export function setOilStrokeSize(fx: StylizeEffect, size: number) {
  const st = (fx as OilEffect).oil
  if (st) st.sizeTarget = size
}

/** centre of the (classical) dark vignette in uv, y up — put it on the subject */
export function setOilFocus(fx: StylizeEffect, x: number, y: number) {
  const v = fx.uniforms?.uVigC?.value as THREE.Vector2 | undefined
  v?.set(x, y)
}
