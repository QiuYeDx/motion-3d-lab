import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 彩色玻璃 — the picture is re-made as a leaded window lit from behind.
 *
 *  1. Panes. A jittered Voronoi partition (CSS px × uDpr, larger panes on the empty background). The
 *     nearest-seed search adds a "same side" penalty when a seed's colour / coverage differs from the
 *     pixel's, so pane borders snap to silhouettes and small shapes keep their outline. 现代 uses a
 *     jittered quad / triangle partition instead (straight, angular panes).
 *  2. Lead. Lines run along the pane borders (power-diagram distance to the nearest bisector) and along
 *     every discontinuity of the scene (colour, coverage, normal creases), so the glass colour never
 *     changes without a came between. Rounded profile with a bevel highlight, solder blobs at junctions,
 *     and bright glass "eats" into the lead edges (irradiation).
 *  3. Glass. Each pane takes ONE colour (the scene at its seed) snapped in OKLab to the mode's glass
 *     palette; per-pane thickness (deeper colour where thicker), antique streaks / opalescent swirls,
 *     seeds (bubbles), grisaille matting (the scene's shading painted back in) and trace lines on creases.
 *     A soft "sun behind the window" drifts slowly.
 *  4. Optional window: a pointed (Gothic) arch with saddle bars, a stone frame and a dark ashlar wall
 *     washed by the light spilling through (`setGlassWindow`). Off by default (full-screen glass).
 *
 * Mode switches re-lead the window along a sweeping came (left → right).
 */

export type GlassMode = 'cathedral' | 'tiffany' | 'modern'

export const glassModes: { id: GlassMode; label: string; en: string }[] = [
  { id: 'cathedral', label: '教堂', en: 'Cathedral' },
  { id: 'tiffany', label: '蒂凡尼', en: 'Tiffany' },
  { id: 'modern', label: '现代', en: 'Modern' },
]

export const glassMeta = { title: '彩色玻璃', en: 'Stained Glass', background: '#2a4c98', theme: 'dark' as const }

/* ------------------------------------------------------------------ glass palettes (sRGB) */

// kind: 0 coloured antique glass · 1 clear textured glass (reeded / hammered)
export const GLASS_PALETTES: Record<GlassMode, { hex: string; kind?: number }[]> = {
  cathedral: [
    { hex: '#7e0c1d' }, // deep ruby
    { hex: '#c3142c' }, // ruby
    { hex: '#e2677a' }, // rose
    { hex: '#0c2a80' }, // deep cobalt
    { hex: '#1f55cc' }, // cobalt
    { hex: '#64a6ea' }, // sky
    { hex: '#e39412' }, // amber
    { hex: '#f6cf3a' }, // silver-stain yellow
    { hex: '#c7581a' }, // flashed orange
    { hex: '#0e5a2f' }, // deep emerald
    { hex: '#2e9e4a' }, // emerald
    { hex: '#9cc63c' }, // yellow green
    { hex: '#4a1f72' }, // deep violet
    { hex: '#8e5cc8' }, // violet
    { hex: '#ebe7d2' }, // white glass
    { hex: '#a9b8bd' }, // grey-green clear
  ],
  tiffany: [
    { hex: '#d98a2a' }, // amber
    { hex: '#eeba5c' }, // honey
    { hex: '#b9622a' }, // butterscotch
    { hex: '#a8402a' }, // brick
    { hex: '#6d8a2c' }, // olive
    { hex: '#9fbc7a' }, // sage
    { hex: '#3c7c3b' }, // leaf
    { hex: '#2c8784' }, // teal
    { hex: '#86b6d8' }, // sky opal
    { hex: '#2d4e9e' }, // cobalt
    { hex: '#d9798c' }, // rose
    { hex: '#7a3768' }, // plum
    { hex: '#a71d2e' }, // ruby
    { hex: '#f0d04c' }, // lemon
    { hex: '#efe1c0' }, // cream opal
    { hex: '#f5f2ea' }, // white opal
  ],
  modern: [
    { hex: '#eef2f2', kind: 1 }, // clear
    { hex: '#d3d9db', kind: 1 }, // frosted
    { hex: '#9ea7ad', kind: 1 }, // smoke
    { hex: '#3a3f48', kind: 1 }, // graphite
    { hex: '#a6dcd6' }, // aqua tint
    { hex: '#f2e8a8' }, // pale yellow
    { hex: '#bcd6f2' }, // pale blue
    { hex: '#f3c3c8' }, // blush
    { hex: '#94141f' }, // deep red
    { hex: '#1c2f78' }, // navy
    { hex: '#d8222f' }, // signal red
    { hex: '#2449c0' }, // ultramarine
    { hex: '#f5c21c' }, // chrome yellow
    { hex: '#ee7a22' }, // orange
    { hex: '#2f9e57' }, // green
    { hex: '#6a46b8' }, // violet
  ],
}

// per-mode parameters (see the uniform comments in the shader)
const MODE_PARAMS: Record<GlassMode, { A: number[]; B: number[]; C: number[]; D: number[] }> = {
  //            cell  lead  joint bevel     opal streak bubbles grisaille  part chroma glow sunK     lead rgb               jitter
  cathedral: { A: [26, 3.4, 0.6, 1.0], B: [0.0, 0.85, 0.2, 1.0], C: [0, 1.3, 0.55, 4.5], D: [0.07, 0.066, 0.075, 0.85] },
  tiffany: { A: [21, 1.7, 0.25, 0.55], B: [0.85, 0.55, 0.05, 0.35], C: [0, 1.18, 0.4, 3.2], D: [0.15, 0.095, 0.05, 0.95] },
  modern: { A: [40, 2.4, 0.0, 0.4], B: [0.0, 0.25, 0.1, 0.0], C: [1, 1.12, 0.45, 3.6], D: [0.2, 0.205, 0.215, 0.62] },
}
const ORDER: GlassMode[] = ['cathedral', 'tiffany', 'modern']
const MODE_INDEX: Record<GlassMode, number> = { cathedral: 0, tiffany: 1, modern: 2 }
const NP = 16

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function oklab(hex: string) {
  const [r, g, b] = rgb(hex).map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
#define PI 3.14159265
// palettes as a 16×6 float texture (fetched — dynamically indexed uniform arrays turn into switch chains
// on ANGLE/D3D): row 2m = OKLab + kind, row 2m+1 = sRGB, m = mode
uniform sampler2D tPal;
uniform int uNP;
uniform int uR;      // neighbourhood radius (1) as a uniform: keeps the loops rolled on ANGLE/FXC
// parameters of the incoming (T) and outgoing (F) mode:
//  A cell (CSS px), lead width (CSS px), solder joint bulge, bevel
//  B opalescence, antique streaks, bubble density, grisaille painting
//  C partition (0 voronoi · 1 quads/triangles), chroma boost before snapping, edge glow, sun falloff
//  D lead colour (rgb), seed jitter
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uTC; uniform vec4 uTD;
uniform vec4 uFA; uniform vec4 uFB; uniform vec4 uFC; uniform vec4 uFD;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uCell;   // pane size multiplier
uniform vec2 uSun;     // backlight centre (uv, y up)
uniform vec4 uWin;     // window: centre x, bottom y (CSS px from the top left), half width, height
uniform float uWinOn;
uniform vec3 uWall;
uniform vec3 uStone;

vec4 PA; vec4 PB; vec4 PC; vec4 PD;
float ROW;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

// explicit-LOD fetches (no implicit derivatives → loops stay rolled)
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmT(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

vec3 toLab(vec3 c) {
  vec3 l = srgbToLinear(c);
  vec3 lms = vec3(
    0.4122214708 * l.r + 0.5363325363 * l.g + 0.0514459929 * l.b,
    0.2119034982 * l.r + 0.6806995451 * l.g + 0.1073969566 * l.b,
    0.0883024619 * l.r + 0.2817188376 * l.g + 0.6299787005 * l.b);
  lms = pow(max(lms, vec3(1e-6)), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}

// nearest glass of the current mode's palette → sRGB + kind
vec4 snapGlass(vec3 c) {
  vec3 lab = toLab(c);
  lab.yz *= PC.y;
  float best = 1e9;
  int bi = 0;
  int row = int(ROW);
  for (int i = 0; i < uNP; i++) {
    vec3 d = lab - texelFetch(tPal, ivec2(i, row), 0).xyz;
    float dd = d.x * d.x * 0.9 + (d.y * d.y + d.z * d.z) * 2.2;
    if (dd < best) { best = dd; bi = i; }
  }
  vec4 k = texelFetch(tPal, ivec2(bi, row), 0);
  return vec4(texelFetch(tPal, ivec2(bi, row + 1), 0).rgb, k.w);
}

// how strongly two samples belong to different shapes (colour border, silhouette, crease)
float edgeM(vec3 ca, vec4 na, vec3 cb, vec4 nb) {
  float dc = length(ca - cb);
  float dn = (na.a > 0.5 && nb.a > 0.5) ? 1.0 - dot(na.rgb * 2.0 - 1.0, nb.rgb * 2.0 - 1.0) : 0.0;
  return max(max(smoothstep(0.13, 0.27, dc), abs(na.a - nb.a)), smoothstep(0.4, 0.8, dn));
}

/* ---------------------------------------------------------------- partitions */

// Voronoi with a same-side penalty. Out: seed px, seed id, e1/e2 (px, distance to the nearest and a
// further pane border — e2 small ⇒ junction), penalty of the chosen seed, its colour.
void voronoi(vec2 px, float cs, vec3 c0, float a0,
             out vec2 seedPx, out vec2 sid, out float e1, out float e2, out float pen1, out vec3 seedC) {
  vec2 g = px / cs;
  vec2 n = floor(g);
  float D1 = 1e9, D2 = 1e9, D3 = 1e9;
  vec2 s1 = g, s2 = g + 9.0, s3 = g + 9.0, i1 = n;
  vec3 c1 = c0;
  float p1 = 0.0;
  for (int j = -uR; j <= uR; j++)
    for (int i = -uR; i <= uR; i++) {
      vec2 id = n + vec2(float(i), float(j));
      vec2 sp = id + 0.5 + (hash22(id) - 0.5) * PD.w;
      vec2 spx = sp * cs;
      vec3 c = sceneL(spx);
      float a = nrmT(spx).a;
      float pen = 2.6 * smoothstep(0.17, 0.36, length(c - c0)) + 3.0 * abs(a - a0);
      vec2 d = sp - g;
      float D = dot(d, d) + pen;
      if (D < D1) { D3 = D2; s3 = s2; D2 = D1; s2 = s1; D1 = D; s1 = sp; i1 = id; c1 = c; p1 = pen; }
      else if (D < D2) { D3 = D2; s3 = s2; D2 = D; s2 = sp; }
      else if (D < D3) { D3 = D; s3 = sp; }
    }
  e1 = (D2 - D1) / (2.0 * max(length(s2 - s1), 1e-3)) * cs;
  e2 = (D3 - D1) / (2.0 * max(length(s3 - s1), 1e-3)) * cs;
  seedPx = s1 * cs;
  sid = i1;
  pen1 = p1;
  seedC = c1;
}

vec2 qv(vec2 v) { return v + (hash22(v * 1.31 + 7.7) - 0.5) * 0.6; }
float ef(vec2 a, vec2 b, vec2 p) { return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x); }
bool inTri(vec2 p, vec2 a, vec2 b, vec2 c) { return ef(a, b, p) >= 0.0 && ef(b, c, p) >= 0.0 && ef(c, a, p) >= 0.0; }
float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// jittered quads, most of them split into two triangles along a random diagonal
void angular(vec2 px, float cs, out vec2 seedPx, out vec2 sid, out float e1, out float e2) {
  vec2 g = px / cs;
  vec2 n = floor(g);
  vec2 A = g, B = g, C = g, Dd = g;
  float kind = -1.0; // 0 quad, 1 first triangle, 2 second triangle
  vec2 qid = n;
  for (int j = -uR; j <= uR; j++)
    for (int i = -uR; i <= uR; i++) {
      vec2 q = n + vec2(float(i), float(j));
      vec2 a = qv(q), b = qv(q + vec2(1.0, 0.0)), c = qv(q + vec2(1.0, 1.0)), d = qv(q + vec2(0.0, 1.0));
      float h = hash12(q + 3.1);
      bool diagAC = h < 0.4;
      bool whole = h > 0.82;
      vec2 t0 = a, t1 = b, t2 = diagAC ? c : d;
      vec2 u0 = diagAC ? a : b, u1 = c, u2 = d;
      bool in1 = inTri(g, t0, t1, t2);
      bool in2 = inTri(g, u0, u1, u2);
      if (kind < 0.0 && (in1 || in2)) {
        qid = q; A = a; B = b; C = c; Dd = d;
        kind = whole ? 0.0 : (in1 ? 1.0 : 2.0);
        if (!whole) {
          if (in1) { A = t0; B = t1; C = t2; } else { A = u0; B = u1; C = u2; }
        }
      }
    }
  float d1, d2, d3, d4;
  if (kind < 0.5) {
    d1 = segD(g, A, B); d2 = segD(g, B, C); d3 = segD(g, C, Dd); d4 = segD(g, Dd, A);
    seedPx = (A + B + C + Dd) * 0.25 * cs;
  } else {
    d1 = segD(g, A, B); d2 = segD(g, B, C); d3 = segD(g, C, A); d4 = 9.0;
    seedPx = (A + B + C) / 3.0 * cs;
  }
  float m1 = min(d1, d2), M1 = max(d1, d2);
  float m2 = min(d3, d4), M2 = max(d3, d4);
  e1 = min(m1, m2) * cs;
  e2 = min(max(m1, m2), min(M1, M2)) * cs;
  sid = qid * 3.0 + max(kind, 0.0);
}

/* ---------------------------------------------------------------- window + wall */

// pointed (equilateral) arch: q in CSS px, x from the centre, y up from the springing line
float archSdf(vec2 q, float a, float hr) {
  float d = q.y > 0.0
    ? max(length(q - vec2(-a, 0.0)), length(q - vec2(a, 0.0))) - 2.0 * a
    : abs(q.x) - a;
  return max(d, -(q.y + hr));
}

vec3 wall(vec2 tl, float sdf, vec3 spill, float spillK) {
  // ashlar: courses of dressed stone with mortar joints
  float rowH = 34.0;
  float row = floor(tl.y / rowH);
  float bw = 64.0 + 34.0 * hash12(vec2(row, 3.0));
  float x = tl.x + hash12(vec2(row, 7.0)) * bw;
  float col = floor(x / bw);
  vec2 f = vec2(fract(x / bw) * bw, fract(tl.y / rowH) * rowH);
  float mort = min(min(f.x, bw - f.x), min(f.y, rowH - f.y));
  vec2 bid = vec2(col, row);
  vec3 c = uWall * (0.82 + 0.3 * hash12(bid)) * (0.9 + 0.2 * vnoise(tl * 0.08 + bid * 5.0));
  c *= 0.94 + 0.12 * vnoise(tl * 0.5);
  c *= mix(0.45, 1.0, smoothstep(0.6, 2.2, mort));
  // top edges of the blocks catch the light from the window a little
  c *= 1.0 + 0.18 * smoothstep(2.4, 1.2, f.y) * step(1.0, f.y);
  float glow = exp(-sdf / spillK);
  c += spill * glow * 0.32 + spill * exp(-sdf / (spillK * 3.0)) * 0.07;
  return c;
}

// stone frame round the opening: chamfered reveal lit by the window
vec3 frame(float sdf, float fw, vec2 tl, vec3 spill) {
  float t = sdf / fw;
  vec3 c = uStone * (0.88 + 0.2 * vnoise(tl * 0.12)) * (0.95 + 0.1 * vnoise(tl * 0.9));
  float step1 = smoothstep(0.42, 0.46, t);
  c *= mix(1.25, 0.9, step1);                       // inner chamfer (lit) vs outer face
  c += spill * (1.0 - smoothstep(0.0, 0.45, t)) * 0.65;
  c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.08, abs(t - 0.44)));  // arris line
  c *= 1.0 - 0.5 * smoothstep(0.9, 1.0, t);         // joint with the wall
  return c;
}

/* ---------------------------------------------------------------- glass */

vec3 glass(vec2 px, float extraD, float extraW) {
  vec2 cp = px / uDpr;
  float hw = max(PA.y * uDpr * 0.5, 0.75);
  vec3 c0 = sceneL(px);
  vec4 n0 = nrmT(px);

  // 1 · borders between shapes, sampled across p at two radii (→ a lead line of the same width as the
  //     pane leads, centred on the border); the taps also give a local average colour and creases
  float J1 = 0.0, J0 = 0.0, crease = 0.0;
  vec3 avg = c0;
  for (int k = 0; k < 4; k++) {
    float ang = float(k) * PI * 0.25;
    vec2 o = vec2(cos(ang), sin(ang)) * hw;
    vec3 ca = sceneL(px + o), cb = sceneL(px - o);
    vec4 na = nrmT(px + o), nb = nrmT(px - o);
    J1 = max(J1, edgeM(ca, na, cb, nb));
    avg += ca + cb;
    vec2 o2 = o * 0.45;
    vec3 ca2 = sceneL(px + o2), cb2 = sceneL(px - o2);
    vec4 na2 = nrmT(px + o2), nb2 = nrmT(px - o2);
    J0 = max(J0, edgeM(ca2, na2, cb2, nb2));
    float dn = (na2.a > 0.5 && nb2.a > 0.5) ? 1.0 - dot(na2.rgb * 2.0 - 1.0, nb2.rgb * 2.0 - 1.0) : 0.0;
    crease = max(crease, smoothstep(0.05, 0.22, dn));
  }
  avg /= 9.0;
  float dJ = hw * (1.45 - 0.72 * J0 - 0.73 * J1);

  // 2 · panes
  float cs = max(PA.x * uCell * uDpr * mix(1.55, 1.0, step(0.5, n0.a)), 6.0);
  vec2 seedPx, sid;
  float e1, e2, pen1 = 0.0;
  vec3 seedC;
  if (PC.x < 0.5) {
    voronoi(px, cs, c0, n0.a, seedPx, sid, e1, e2, pen1, seedC);
  } else {
    angular(px, cs, seedPx, sid, e1, e2);
    seedC = sceneL(seedPx);
    pen1 = 3.0 * smoothstep(0.17, 0.36, length(seedC - c0)) + 3.0 * abs(nrmT(seedPx).a - n0.a);
  }
  // a seed across a border (thin shapes) → the fragment takes its own local colour
  vec3 src = pen1 > 1.2 ? avg : seedC;
  vec4 G = snapGlass(src);

  // 3 · lead: nearest / second-nearest line (junction → solder blob)
  float d = e1, d2 = e2;
  if (dJ < d) { d2 = d; d = dJ; } else d2 = min(d2, dJ);
  float dx = extraD - extraW * hw;
  if (dx < d) { d2 = d; d = dx; } else d2 = min(d2, dx);
  float joint = PA.z * (1.0 - smoothstep(0.0, hw * 2.4, d2));
  float w = hw * (1.0 + joint);
  float aa = 0.85;
  float lead = 1.0 - smoothstep(w - aa, w + aa, d);

  // 4 · the glass
  vec2 uv = px / uRes;
  vec2 sd = (uv - uSun) * vec2(uRes.x / uRes.y, 1.0);
  float sun = exp(-dot(sd, sd) * PC.w);
  float light = 0.5 + 1.25 * sun + 0.1 * uv.y;
  vec2 rel = (px - seedPx) / cs;
  float h = hash12(sid + 1.7);
  vec2 dir = vec2(cos(h * 6.283), sin(h * 6.283));
  float th = 0.82 + 0.36 * hash12(sid + 9.2) + 0.3 * dot(rel, dir);
  vec3 g = pow(max(G.rgb, vec3(0.0)), vec3(mix(0.8, 1.4, clamp(th - 0.55, 0.0, 1.0))));

  // antique glass: streaks drawn along one direction per pane, wavy
  vec2 sdir = vec2(cos(h * 3.14 + 0.6), sin(h * 3.14 + 0.6));
  float sx = dot(cp, sdir), sy = dot(cp, vec2(-sdir.y, sdir.x));
  float wav = vnoise(vec2(sx, sy) * 0.03 + sid) * 4.0;
  float st = vnoise(vec2(sx * 0.16 + wav, sy * 0.012) + sid * 3.1);
  float st2 = vnoise(vec2(sx * 0.045 + wav * 0.5, sy * 0.006) + sid * 1.3);
  g *= 1.0 + PB.y * ((st - 0.5) * 0.32 + (st2 - 0.5) * 0.36);

  // opalescent (Tiffany): milky swirls + a darker streak of the same hue
  if (PB.x > 0.01) {
    vec2 wq = cp * 0.022 + sid * 2.7;
    wq += vec2(vnoise(wq * 1.7), vnoise(wq * 1.7 + 5.2)) * 2.2;
    float sw = vnoise(wq) * 0.65 + vnoise(wq * 2.3) * 0.35;
    g = mix(g, vec3(0.97, 0.94, 0.86), PB.x * smoothstep(0.5, 0.86, sw) * 0.62);
    g = mix(g, g * g * 1.05, PB.x * smoothstep(0.42, 0.14, sw) * 0.7);
    light = mix(light, 0.86 + 0.42 * sun, PB.x * 0.55);
  }

  // clear textured glass (现代): reeded or hammered — brightness ripples, no colour
  if (G.w > 0.5) {
    float rip = hash12(sid + 4.4) < 0.5
      ? 0.5 + 0.5 * sin(dot(cp, dir) * 0.9)
      : vnoise(cp * 0.22 + sid) * 0.6 + vnoise(cp * 0.6) * 0.4;
    light *= 0.86 + 0.3 * rip;
    g = mix(g, avg, 0.12);
  }

  // seeds (bubbles)
  vec2 bc = cp / 11.0;
  vec2 bi = floor(bc), bf = fract(bc);
  if (hash12(bi + sid * 0.37) < PB.z) {
    vec2 bp = 0.25 + 0.5 * hash22(bi + 4.0);
    float br = 0.07 + 0.1 * hash12(bi + 2.0);
    float bd = length(bf - bp) / br;
    float rim = smoothstep(0.6, 0.92, bd) * (1.0 - smoothstep(0.92, 1.12, bd));
    g *= 1.0 + 0.28 * (1.0 - smoothstep(0.0, 0.9, bd));
    g = mix(g, vec3(1.0), rim * 0.35 * clamp(light - 0.3, 0.0, 1.0));
  }

  // grisaille: the scene's own shading painted back in (matting), trace lines on creases, edge matting
  float ratio = (luma(c0) + 0.05) / (luma(src) + 0.05);
  g *= mix(1.0, clamp(ratio, 0.5, 1.3), PB.w * 0.55 * n0.a);
  float paint = crease * (1.0 - J1) * step(hash12(sid + 5.0), 0.7) * PB.w;
  g = mix(g, vec3(0.2, 0.13, 0.09), paint * 0.65);
  g *= 1.0 - 0.32 * PB.w * exp(-max(d - w, 0.0) / (hw * 3.2));

  vec3 col = g * light * 1.55;
  col = 1.0 - exp(-col * 1.15);
  col += vec3(1.0, 0.92, 0.75) * pow(sun, 3.0) * 0.12;   // hot core of the sun behind the glass

  // 5 · lead came
  float r = clamp(d / w, 0.0, 1.0);
  float ridge = sqrt(max(1.0 - r * r, 0.0));
  vec3 lc = PD.rgb * (0.6 + PA.w * 0.9 * ridge + (1.0 - PA.w) * 0.4);
  lc += vec3(0.55, 0.58, 0.66) * pow(ridge, 10.0) * 0.14 * PA.w;
  float jb = joint / max(PA.z, 1e-3) * step(0.01, PA.z);
  lc = mix(lc, vec3(0.3, 0.3, 0.33) * (0.55 + 0.75 * ridge) + pow(ridge, 14.0) * 0.18, smoothstep(0.35, 0.9, jb) * 0.7);
  lc += col * PC.z * pow(r, 3.0);   // bright glass glows over the edge of the lead
  return mix(col, lc, lead);
}

vec3 stylize(vec2 px) {
  // which mode this pixel shows (a came sweeps across during a switch)
  bool to = true;
  float frontD = 1e5;
  if (uMix < 1.0) {
    // sweep across the window when there is one, else across the screen
    float span = uWinOn > 0.5 ? 2.0 * uWin.z * uDpr : uRes.x;
    float x0 = uWinOn > 0.5 ? (uWin.x - uWin.z) * uDpr : 0.0;
    float wc = (px.x - x0) / span * 0.84 + (1.0 - px.y / uRes.y) * 0.16 + (vnoise(px / uDpr * 0.006) - 0.5) * 0.06;
    float f = wc - (uMix * 1.24 - 0.12);
    to = f <= 0.0;
    frontD = abs(f) * span / 0.84;
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  PC = to ? uTC : uFC;
  PD = to ? uTD : uFD;
  ROW = (to ? uTo : uFrom) * 2.0;

  if (uWinOn < 0.5) return glass(px, frontD, 0.0);

  // window in a wall
  vec2 tl = vec2(px.x, uRes.y - px.y) / uDpr;  // CSS px from the top left
  float a = uWin.z;
  float hr = uWin.w - a * 1.7320508;
  vec2 q = vec2(tl.x - uWin.x, (uWin.y - tl.y) - hr);
  float sdf = archSdf(q, a, hr);
  float fw = clamp(a * 0.16, 16.0, 30.0);
  vec3 col = vec3(0.0);
  if (sdf < 1.0) {
    // saddle bars across the opening
    float stepY = uWin.w / 5.0;
    float yb = uWin.y - tl.y;
    float k = clamp(floor(yb / stepY + 0.5), 1.0, 4.0);
    float barD = abs(yb - k * stepY) * uDpr;
    float edgeD = -sdf * uDpr;
    float extra = min(barD, edgeD);
    col = glass(px, min(frontD, extra), barD < edgeD ? 0.55 : 1.1);
  }
  if (sdf > -1.0) {
    // light spilling through: a soft average of the window's glass, tinted by the glass just inside
    vec2 cen = vec2(uWin.x, uWin.y - uWin.w * 0.55);
    vec2 inP = tl + normalize(cen - tl + 1e-3) * (max(sdf, 0.0) + 70.0);
    vec3 local = sceneL(vec2(inP.x, uRes.y / uDpr - inP.y) * uDpr);
    vec3 mean = (sceneL(vec2(cen.x, uRes.y / uDpr - cen.y) * uDpr)
               + sceneL(vec2(cen.x - a * 0.5, uRes.y / uDpr - cen.y + uWin.w * 0.25) * uDpr)
               + sceneL(vec2(cen.x + a * 0.5, uRes.y / uDpr - cen.y - uWin.w * 0.25) * uDpr)) / 3.0;
    vec3 spill = mix(mean, local, 0.35);
    vec2 su = (px / uRes - uSun) * vec2(uRes.x / uRes.y, 1.0) * 1.6;
    spill = mix(spill, vec3(1.0, 0.8, 0.5), 0.3) * (0.35 + 0.6 * exp(-dot(su, su)));
    vec3 o = sdf < fw ? frame(max(sdf, 0.0), fw, tl, spill) : wall(tl, sdf - fw, spill, a * 0.42);
    col = sdf <= -1.0 ? col : (sdf >= 1.0 ? o : mix(col, o, smoothstep(-1.0, 1.0, sdf)));
  }
  return col;
}
`

/* ------------------------------------------------------------------ factory + controls */

type Win = { x: number; bottom: number; halfWidth: number; height: number } | null
type State = { mode: GlassMode; cell: number; cellT: number; t: number; win: Win }
// keyed by the uniforms object, which survives `{ ...fx }` / Object.assign copies made by other demos
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

export function createGlassEffect(init: { mode?: GlassMode; cell?: number } = {}): StylizeEffect {
  const mode = init.mode ?? 'cathedral'
  const cell = init.cell ?? 1
  const data = new Float32Array(NP * 6 * 4)
  ORDER.forEach((m, mi) => {
    GLASS_PALETTES[m].forEach((p, i) => {
      const lab = oklab(p.hex)
      data.set([lab[0], lab[1], lab[2], p.kind ?? 0], (mi * 2 * NP + i) * 4)
      data.set([...rgb(p.hex), 1], ((mi * 2 + 1) * NP + i) * 4)
    })
  })
  const tPal = new THREE.DataTexture(data, NP, 6, THREE.RGBAFormat, THREE.FloatType)
  tPal.minFilter = tPal.magFilter = THREE.NearestFilter
  tPal.needsUpdate = true
  const v4 = () => new THREE.Vector4()
  const col = (hex: string) => new THREE.Vector3(...rgb(hex))
  const uniforms: U = {
    tPal: { value: tPal },
    uNP: { value: NP },
    uR: { value: 1 },
    uTA: { value: v4() },
    uTB: { value: v4() },
    uTC: { value: v4() },
    uTD: { value: v4() },
    uFA: { value: v4() },
    uFB: { value: v4() },
    uFC: { value: v4() },
    uFD: { value: v4() },
    uFrom: { value: MODE_INDEX[mode] },
    uTo: { value: MODE_INDEX[mode] },
    uMix: { value: 1 },
    uCell: { value: cell },
    uSun: { value: new THREE.Vector2(0.5, 0.6) },
    uWin: { value: new THREE.Vector4(0, 0, 1, 1) },
    uWinOn: { value: 0 },
    uWall: { value: col('#221b21') },
    uStone: { value: col('#3b3238') },
  }
  const st: State = { mode, cell, cellT: cell, t: 0, win: null }
  STATE.set(uniforms, st)
  const copy = (to: string, idx: number) => {
    const P = MODE_PARAMS[ORDER[idx]]
    ;(uniforms[to + 'A'].value as THREE.Vector4).fromArray(P.A)
    ;(uniforms[to + 'B'].value as THREE.Vector4).fromArray(P.B)
    ;(uniforms[to + 'C'].value as THREE.Vector4).fromArray(P.C)
    ;(uniforms[to + 'D'].value as THREE.Vector4).fromArray(P.D)
  }
  const sync = () => {
    copy('uT', uniforms.uTo.value)
    copy('uF', uniforms.uFrom.value)
  }
  sync()
  return {
    frag: FRAG,
    uniforms,
    normals: true,
    background: glassMeta.background,
    update(dt, ctx) {
      const u = uniforms
      st.t += dt
      if (u.uMix.value < 1) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 1.5)
        if (u.uMix.value >= 1) u.uFrom.value = u.uTo.value
      }
      st.cell += (st.cellT - st.cell) * (1 - Math.exp(-dt * 6))
      if (Math.abs(st.cell - st.cellT) < 1e-3) st.cell = st.cellT
      u.uCell.value = st.cell
      sync()
      // the sun behind the window drifts slowly on a lissajous path
      const W = ctx.width / ctx.dpr
      const H = ctx.height / ctx.dpr
      const t = st.t
      let cx = 0.5,
        cy = 0.62,
        ax = 0.26,
        ay = 0.14
      if (st.win) {
        const w = st.win
        cx = w.x / W
        cy = 1 - (w.bottom - w.height * 0.62) / H
        ax = (w.halfWidth / W) * 0.85
        ay = (w.height / H) * 0.2
      }
      ;(u.uSun.value as THREE.Vector2).set(cx + Math.sin(t * 0.21) * ax, cy + Math.sin(t * 0.13 + 1.1) * ay)
    },
  }
}

/** switch the glass style: a new came sweeps across and re-leads the window */
export function setGlassMode(fx: StylizeEffect, mode: GlassMode) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st || st.mode === mode) return
  st.mode = mode
  if (u.uMix.value >= 0.5) u.uFrom.value = u.uTo.value
  u.uTo.value = MODE_INDEX[mode]
  u.uMix.value = 0
}

/** pane size multiplier (1 = the mode's default; eases there) */
export function setGlassCell(fx: StylizeEffect, k: number) {
  const st = stateOf(fx)
  if (st) st.cellT = k
}

/** put the glass in a pointed-arch window in a stone wall (CSS px, from the top left); null = full screen */
export function setGlassWindow(fx: StylizeEffect, win: Win) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st) return
  st.win = win
  u.uWinOn.value = win ? 1 : 0
  if (win) (u.uWin.value as THREE.Vector4).set(win.x, win.bottom, win.halfWidth, win.height)
}
