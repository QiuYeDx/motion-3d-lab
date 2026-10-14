import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 材料拼贴 — the screen is rebuilt from physical units on a grid anchored at the screen centre
 * (cells in CSS px × uDpr). Each cell takes a 5-tap average of the scene, snaps it to the material's real
 * colour chart and is then shaded as an object under one fixed light (upper left):
 *
 *  · 乐高    1×1 plates (pairs of equal colour merge into 1×2), stud with lit rim, wall and cast shadow, seams
 *  · 十字绣  two twisted-thread strands per cell (bottom “/”, top “\” with a contact shadow) on aida cloth;
 *            cells outside the subject (coverage) are left as bare cloth
 *  · 马赛克  jittered-voronoi tesserae with bevelled edges, glaze specular, per-tile tint, grout lines
 *  · LED 屏  round lenses with R/G/B emitters, glow bleeding into neighbours, black housing, a refresh band
 *
 * Mode switches rebuild the picture cell by cell (random order, drifting left → right).
 */

export const mosaicModes = [
  { id: 'lego', label: '乐高', dark: false },
  { id: 'stitch', label: '十字绣', dark: false },
  { id: 'tile', label: '马赛克', dark: false },
  { id: 'led', label: 'LED 屏', dark: true },
] as const
export type MosaicMode = (typeof mosaicModes)[number]['id']

export const mosaicMeta = { title: '材料拼贴', en: 'Tile Mosaic', background: '#f2efe9', theme: 'light' as const }

/* ------------------------------------------------------------------ colour charts (sRGB) */

export const LEGO_PALETTE = [
  '#f4f4f4', // white
  '#a0a5a9', // light bluish grey
  '#6c6e68', // dark bluish grey
  '#1b2a34', // black
  '#c91a09', // red
  '#720e0f', // dark red
  '#fe8a18', // orange
  '#f2cd37', // yellow
  '#e4cd9e', // tan
  '#582a12', // reddish brown
  '#bbe90b', // lime
  '#237841', // green
  '#0055bf', // blue
  '#0a3463', // dark blue
  '#36aebf', // medium azure
  '#e4adc8', // bright pink
  '#ac78ba', // medium lavender
  '#e3e2dd', // very light bluish grey
]
export const DMC_PALETTE = [
  '#1e1e1e', // 310
  '#fcfcfa', // B5200
  '#d3d3d6', // 415
  '#8c8c8c', // 414
  '#c72b3b', // 321
  '#e31d42', // 666
  '#970b23', // 816
  '#ffcbd5', // 3708
  '#c5498a', // 3607
  '#803a6b', // 552
  '#ff8b00', // 740
  '#ffbf57', // 742
  '#ffe300', // 973
  '#9ecf3b', // 704
  '#47a72f', // 702
  '#056517', // 699
  '#04c4ca', // 3845
  '#30c2ec', // 996
  '#466a8e', // 798
  '#0e365c', // 820
  '#253b73', // 336
  '#985e33', // 434
  '#594937', // 838
  '#fbd5bb', // 945
]
export const SMALTI_PALETTE = [
  '#efe6d2', // ivory
  '#f7f5f0', // white
  '#d9a520', // gold
  '#c98a2b', // ochre
  '#b5532f', // terracotta
  '#d8361f', // vermilion
  '#9e1b2a', // crimson
  '#d97a8a', // rose
  '#6b2d5c', // plum
  '#1f3f8f', // lapis
  '#2d6cc0', // cobalt
  '#22a5a8', // turquoise
  '#136b6b', // teal
  '#6f7d2a', // olive
  '#3f9a3b', // leaf
  '#9fb78a', // sage
  '#5b6470', // slate
  '#24262b', // charcoal
  '#d7c19a', // sand
  '#8ec3e6', // sky
  '#f0c419', // sunflower
  '#1a2350', // night blue
]

const vec = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
#define NL ${LEGO_PALETTE.length}
#define ND ${DMC_PALETTE.length}
#define NS ${SMALTI_PALETTE.length}
uniform vec3 uLego[NL];
uniform vec3 uDmc[ND];
uniform vec3 uSmalti[NS];
uniform float uCell;     // CSS px
uniform float uModeA;
uniform float uModeB;
uniform float uMix;
uniform vec3 uCloth;

const vec3 LIGHT = vec3(-0.48, 0.55, 0.68);

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

// "redmean" weighted RGB distance — cheap and close enough to perceptual for palette snapping
float cdist(vec3 a, vec3 b) {
  float rm = 0.5 * (a.r + b.r);
  vec3 d = a - b;
  return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
}
vec3 qLego(vec3 c) { vec3 b = uLego[0]; float bd = 1e9; for (int i = 0; i < NL; i++) { float d = cdist(c, uLego[i]); if (d < bd) { bd = d; b = uLego[i]; } } return b; }
vec3 qDmc(vec3 c) { vec3 b = uDmc[0]; float bd = 1e9; for (int i = 0; i < ND; i++) { float d = cdist(c, uDmc[i]); if (d < bd) { bd = d; b = uDmc[i]; } } return b; }
vec3 qSmalti(vec3 c) { vec3 b = uSmalti[0]; float bd = 1e9; for (int i = 0; i < NS; i++) { float d = cdist(c, uSmalti[i]); if (d < bd) { bd = d; b = uSmalti[i]; } } return b; }

// cell coords (cell units, origin at screen centre) ↔ device px
vec2 toPx(vec2 c, float cs) { return c * cs + uRes * 0.5; }

// average colour + coverage around a point (5 taps, radius r px)
vec4 area(vec2 p, float r) {
  vec3 a = sceneAt(p) * 2.0 + sceneAt(p + vec2(r, r)) + sceneAt(p + vec2(-r, r)) + sceneAt(p + vec2(r, -r)) + sceneAt(p + vec2(-r, -r));
  float v = coverageAt(p) * 2.0 + coverageAt(p + vec2(r, r)) + coverageAt(p + vec2(-r, r)) + coverageAt(p + vec2(r, -r)) + coverageAt(p + vec2(-r, -r));
  return vec4(a, v) / 6.0;
}
// material cells take the centre colour (an average would invent muddy in-between colours at every edge)
vec4 cellSample(vec2 id, float cs) { vec2 p = toPx(id + 0.5, cs); return vec4(sceneAt(p), coverageAt(p)); }
vec4 cellAvg(vec2 id, float cs) { return area(toPx(id + 0.5, cs), cs * 0.26); }

/* ---------------- 乐高 */
vec3 lego(vec2 id, vec2 f, float cs) {
  float aa = 1.2 / cs;
  vec3 base = qLego(cellSample(id, cs).rgb);
  // pairs of equal colour fuse into a 1×2 plate (no seam between them)
  bool leftOfPair = mod(id.x, 2.0) < 0.5;
  vec3 nb = qLego(cellSample(id + vec2(leftOfPair ? 1.0 : -1.0, 0.0), cs).rgb);
  bool fused = dot(nb - base, nb - base) < 1e-5;
  float exL = f.x, exR = 1.0 - f.x;
  if (fused) { if (leftOfPair) exR += 1.0; else exL += 1.0; }
  float eyB = f.y, eyT = 1.0 - f.y;

  vec3 col = base;
  // plate bevel: lit top/left, shaded bottom/right
  col *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.07, eyT)) + 0.09 * (1.0 - smoothstep(0.0, 0.07, exL));
  col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.07, eyB)) - 0.14 * (1.0 - smoothstep(0.0, 0.07, exR));
  // stud: cast shadow → cylinder wall → top face with lit rim + gloss
  vec2 q = f - 0.5;
  const float R = 0.3;
  float sh = 1.0 - smoothstep(R - 0.06, R + 0.1, length(q - vec2(0.075, -0.085)));
  col *= 1.0 - 0.32 * sh;
  float wall = 1.0 - smoothstep(R - aa, R + aa, length(q - vec2(0.02, -0.03)));
  col = mix(col, base * 0.74, wall);
  vec2 qt = q + vec2(0.012, -0.015);
  float rr = length(qt);
  float top = 1.0 - smoothstep(R - aa, R + aa, rr);
  float facing = max(dot(qt / max(rr, 1e-4), normalize(vec2(-1.0, 1.0))), 0.0);
  float rim = smoothstep(R - 0.075, R - 0.025, rr) * (1.0 - smoothstep(R - 0.025, R, rr));
  vec3 topc = base * 1.04 + rim * facing * 0.42 + (1.0 - facing) * rim * -0.12 * base;
  topc += 0.05 * (1.0 - smoothstep(R * 0.55 - aa, R * 0.55 + aa, rr)) * (1.0 - smoothstep(R * 0.45 - aa, R * 0.45, rr)) ;
  topc += 0.28 * exp(-dot(qt - vec2(-0.11, 0.11), qt - vec2(-0.11, 0.11)) * 160.0);
  col = mix(col, topc, top);
  // seams between plates
  float e = min(min(exL, exR), min(eyB, eyT));
  col = mix(col * 0.55, col, smoothstep(0.012, 0.012 + aa, e));
  return col;
}

/* ---------------- 十字绣 */
vec3 aida(vec2 id, vec2 f, vec2 cp) {
  vec2 sid = floor(f * 2.0);
  vec2 sub = fract(f * 2.0);
  float chk = mod(sid.x + sid.y, 2.0);
  float thr = chk < 0.5 ? sub.y : sub.x;
  float bundle = 1.0 - 0.2 * pow(abs(thr * 2.0 - 1.0), 2.0);
  float fib = 0.965 + 0.035 * sin((chk < 0.5 ? sub.x : sub.y) * 25.0 + hash12(id + sid) * 6.0);
  vec2 dc = min(f, 1.0 - f);
  float hole = 1.0 - smoothstep(0.05, 0.12, length(dc));
  vec3 c = uCloth * bundle * fib * (0.97 + 0.03 * vnoise(cp * 0.02));
  return c * (1.0 - 0.5 * hole);
}

// one strand along unit direction d: rgb = shaded thread, a = coverage
vec4 strand(vec2 q, vec2 d, vec3 col, float seed, float aa) {
  vec2 n = vec2(-d.y, d.x);
  float al = dot(q, d);
  float ac = dot(q, n);
  const float L = 0.6;
  float taper = 1.0 - smoothstep(L - 0.2, L, abs(al));
  float hw = 0.2 * (0.5 + 0.5 * taper);
  float s = ac / hw;
  float cov = (1.0 - smoothstep(1.0 - aa / hw, 1.0, abs(s))) * (1.0 - smoothstep(L - aa, L, abs(al)));
  float nz = sqrt(max(1.0 - s * s, 0.0));
  vec3 nrm = normalize(vec3(n * s * 0.9, nz + 0.1));
  float diff = 0.5 + 0.66 * max(dot(nrm, normalize(LIGHT)), 0.0);
  float ply = 0.5 + 0.5 * sin(6.2831 * (al * 6.5 - s * 0.55) + seed * 6.0);
  float plyShade = mix(0.7, 1.07, smoothstep(0.05, 0.85, ply));
  float spec = pow(max(dot(reflect(-normalize(LIGHT), nrm), vec3(0.0, 0.0, 1.0)), 0.0), 14.0) * 0.2 * smoothstep(0.3, 0.9, ply);
  return vec4(col * diff * plyShade + spec, cov);
}

vec3 stitch(vec2 id, vec2 f, float cs, vec2 cp) {
  float aa = 1.3 / cs;
  vec3 col = aida(id, f, cp);
  vec4 s = cellSample(id, cs);
  if (s.a < 0.5) return col;
  vec3 th = qDmc(s.rgb) * (0.96 + 0.06 * hash12(id + 3.3));
  vec2 q = f - 0.5;
  vec2 d1 = vec2(0.7071, 0.7071), d2 = vec2(0.7071, -0.7071);
  vec2 so = vec2(0.045, -0.05); // shadows fall to the lower right
  vec4 b = strand(q, d1, th, hash12(id), aa);
  vec4 t = strand(q, d2, th * 1.02, hash12(id + 9.1), aa);
  float shB = strand(q - so, d1, th, 0.0, aa).a;
  float shT = strand(q - so, d2, th, 0.0, aa).a;
  col *= 1.0 - 0.38 * max(shB, shT);
  col = mix(col, b.rgb * (1.0 - 0.4 * shT), b.a);
  col = mix(col, t.rgb, t.a);
  return col;
}

/* ---------------- 马赛克 */
vec2 tilePoint(vec2 g) { return g + 0.5 + (hash22(g) - 0.5) * 0.52; }

vec3 tiles(vec2 c, float cs, vec2 cp) {
  float aa = 1.2 / cs;
  vec2 n = floor(c);
  vec2 mr = vec2(0.0), mg = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = tilePoint(n + g) - c;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  float ed = 8.0;
  vec2 edir = vec2(0.0);
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = tilePoint(n + g) - c;
      vec2 dr = r - mr;
      if (dot(dr, dr) > 1e-5) {
        float e = dot(0.5 * (mr + r), normalize(dr));
        if (e < ed) { ed = e; edir = normalize(dr); }
      }
    }
  vec2 tid = n + mg;
  vec2 tp = toPx(tilePoint(tid), cs);
  vec3 sc = sceneAt(tp);
  vec3 base = qSmalti(sc);
  float h = hash12(tid + 5.7);
  base *= 0.9 + 0.17 * h;
  base += (hash22(tid + 2.3).x - 0.5) * vec3(0.04, 0.0, -0.04);
  // glaze: per-tile tilt + bevel toward the grout
  const float G = 0.05;
  float bev = 1.0 - smoothstep(G, G + 0.17, ed);
  vec2 tilt = (hash22(tid + 7.0) - 0.5) * 0.34;
  vec3 nrm = normalize(vec3(tilt + edir * bev * 1.1, 1.0));
  vec3 Ld = normalize(LIGHT);
  float diff = 0.76 + 0.34 * dot(nrm, Ld);
  vec3 rv = reflect(-Ld, nrm);
  float spec = pow(max(rv.z, 0.0), 48.0) * 0.7 + pow(max(rv.z, 0.0), 6.0) * 0.06;
  vec3 col = base * diff + spec;
  col *= 0.97 + 0.06 * vnoise(cp * 0.35 + tid);
  vec3 grout = vec3(0.84, 0.81, 0.75) * (0.9 + 0.1 * vnoise(cp * 0.8));
  grout *= 0.8 + 0.2 * smoothstep(0.0, G, G - ed); // shade where the grout meets the tile wall
  return mix(grout, col, smoothstep(G, G + aa, ed));
}

/* ---------------- LED 屏 */
vec3 cellLight(vec2 id, float cs) {
  vec4 s = cellAvg(id, cs);
  vec3 c = s.rgb;
  float l = luma(c);
  c = clamp(mix(vec3(l), c, 1.25), 0.0, 1.0); // emitted light reads more saturated
  return c * smoothstep(0.25, 0.65, s.a);
}

vec3 led(vec2 id, vec2 f, float cs, vec2 px) {
  float aa = 1.2 / cs;
  vec3 c = cellLight(id, cs);
  vec2 q = f - 0.5;
  // housing: black with a faint louvre ridge between rows
  vec3 col = vec3(0.035, 0.037, 0.045) * (1.0 + 0.6 * smoothstep(0.42, 0.5, abs(q.y)));
  float lr = length(q);
  float lens = 1.0 - smoothstep(0.4 - aa, 0.4 + aa, lr);
  vec3 lc = vec3(0.075, 0.08, 0.09) * (1.0 - 0.6 * smoothstep(0.1, 0.4, lr));
  float e = 0.14;
  float eR = 1.0 - smoothstep(e * 0.3, e, length(q - vec2(-0.14, 0.075)));
  float eG = 1.0 - smoothstep(e * 0.3, e, length(q - vec2(0.14, 0.075)));
  float eB = 1.0 - smoothstep(e * 0.3, e, length(q - vec2(0.0, -0.155)));
  vec3 em = vec3(c.r * eR, c.g * eG, c.b * eB) * 1.9;
  em += vec3(1.0) * pow(min(min(c.r * eR + c.g * eG + c.b * eB, 1.0), 1.0), 3.0) * 0.18; // hot cores
  lc += em * 0.85 + c * 0.6 * (1.0 - smoothstep(0.0, 0.42, lr)); // diffuser
  // lens gloss
  lc += 0.12 * exp(-dot(q - vec2(-0.16, 0.18), q - vec2(-0.16, 0.18)) * 120.0) * (1.0 - smoothstep(0.2, 0.4, lr));
  col = mix(col, lc, lens);
  // glow bleeding from the 3×3 neighbourhood
  vec3 glow = vec3(0.0);
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec3 nc = (i == 0 && j == 0) ? c : cellLight(id + g, cs);
      vec2 d = q - g;
      glow += nc * exp(-dot(d, d) * 3.2);
    }
  col += glow * 0.2;
  // refresh band rolling down the panel
  float yN = 1.0 - px.y / uRes.y;
  float band = fract(uTime * 0.16) * 1.3 - 0.15;
  float bd = yN - band;
  col *= 1.0 + 0.16 * exp(-bd * bd * 900.0) - 0.05 * smoothstep(0.0, -0.3, bd) * step(bd, 0.0);
  return col;
}

vec3 drawMode(float m, vec2 px, vec2 c, vec2 id, vec2 f, float cs) {
  vec2 cp = px / uDpr;
  if (m < 0.5) return lego(id, f, cs);
  if (m < 1.5) return stitch(id, f, cs, cp);
  if (m < 2.5) return tiles(c, cs, cp);
  return led(id, f, cs, px);
}

vec3 stylize(vec2 px) {
  float cs = max(uCell * uDpr, 3.0);
  vec2 c = (px - uRes * 0.5) / cs;
  vec2 id = floor(c);
  vec2 f = c - id;
  float m = uModeB;
  if (uMix < 1.0) {
    // rebuild cell by cell: random order, drifting left → right
    float thr = hash12(id * 1.37 + 4.1) * 0.55 + wipeCoord(toPx(id + 0.5, cs)) * 0.45;
    if (thr >= uMix) m = uModeA;
  }
  return drawMode(m, px, c, id, f, cs);
}
`

/* ------------------------------------------------------------------ factory + setters */

type MosaicState = { mode: MosaicMode; cell: number; cellTarget: number }
export type MosaicEffect = StylizeEffect & { mosaic: MosaicState }

const modeIndex = (m: MosaicMode) => mosaicModes.findIndex((x) => x.id === m)

export function createMosaicEffect(): MosaicEffect {
  const st: MosaicState = { mode: 'lego', cell: 14, cellTarget: 14 }
  const u = {
    uLego: { value: LEGO_PALETTE.map(vec) },
    uDmc: { value: DMC_PALETTE.map(vec) },
    uSmalti: { value: SMALTI_PALETTE.map(vec) },
    uCell: { value: st.cell },
    uModeA: { value: 0 },
    uModeB: { value: 0 },
    uMix: { value: 1 },
    uCloth: { value: vec('#f1ece1') },
  }
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    mosaic: st,
    update(dt) {
      if (u.uMix.value < 1) u.uMix.value = Math.min(1, u.uMix.value + dt / 0.9)
      st.cell += (st.cellTarget - st.cell) * Math.min(1, dt * 5)
      if (Math.abs(st.cell - st.cellTarget) < 0.01) st.cell = st.cellTarget
      u.uCell.value = st.cell
    },
  }
}

export function setMosaicMode(fx: StylizeEffect, mode: MosaicMode) {
  const st = (fx as MosaicEffect).mosaic
  const u = fx.uniforms!
  if (!st || st.mode === mode) return
  st.mode = mode
  if (u.uMix.value > 0.5) u.uModeA.value = u.uModeB.value
  u.uModeB.value = modeIndex(mode)
  u.uMix.value = 0
}

/** cell size in CSS px (eases there); default 14 */
export function setMosaicCell(fx: StylizeEffect, cssPx: number) {
  const st = (fx as MosaicEffect).mosaic
  if (st) st.cellTarget = cssPx
}
