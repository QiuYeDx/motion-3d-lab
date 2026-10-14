import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 丝印四联 — a Warhol "Marilyn" sheet. The screen becomes a grid of panels (2×2, 3×3 or a 1×4 strip); every
 * panel samples the WHOLE scene through its own window (cover-fit to the panel aspect, centred on a focus
 * rectangle) and prints it as a silkscreen run:
 *
 *   1. background screen — flat ink everywhere the subject isn't (coverage from the depth buffer, blurred so the
 *      stencil has soft hand-cut corners). It has its own registration offset, so a sliver of paper or an
 *      overprint line shows along the silhouette.
 *   2. colour screen — the subject posterised into flat areas: the scene colour is classified (light / warm /
 *      yellow / cool by hue, "shadow" by HSV value) and each class is printed in that panel's pop palette.
 *      Sampled at another offset with a slow wobble → the colour areas never quite match the key.
 *   3. key screen — black: thresholded darks + depth contours (1/z Laplacian), misregistered differently per
 *      panel; some panels carry a coarse photo halftone in the mid-darks, the strip has Ben-Day dots.
 *   Ink texture: streaks along the squeegee pull, ink starving toward the end of the pull (voids), ink build-up
 *   where a stencil edge stops the flood, ragged print edges, thin white gutters.
 *
 * Panel data (palettes, offsets, pull progress) lives in a small float DataTexture read with texelFetch.
 * `repullPanel(fx, i)` re-prints one panel with a fresh palette / registration and a squeegee wipe;
 * mode switches pull a new sheet over the whole grid. Each pixel picks its layout / panel / palette set first
 * and then runs every expensive routine exactly once.
 */

export type PopMode = 'quad' | 'nine' | 'strip'

export const popModes: { id: PopMode; label: string; en: string }[] = [
  { id: 'quad', label: '四联', en: '2 × 2' },
  { id: 'nine', label: '九宫', en: '3 × 3' },
  { id: 'strip', label: '条带', en: '1 × 4' },
]

export const popMeta = { title: '丝印四联', en: 'Pop Silkscreen', background: '#f3ece0', theme: 'light' as const }

type ModeDef = { cols: number; rows: number; aMin: number; aMax: number; gutter: number; benday: number; halftone: number; mis: number }
const MODES: Record<PopMode, ModeDef> = {
  quad: { cols: 2, rows: 2, aMin: 0.74, aMax: 1.5, gutter: 12, benday: 0, halftone: 0.4, mis: 1 },
  nine: { cols: 3, rows: 3, aMin: 0.74, aMax: 1.5, gutter: 9, benday: 0, halftone: 0.34, mis: 0.8 },
  strip: { cols: 4, rows: 1, aMin: 0.64, aMax: 0.95, gutter: 10, benday: 1, halftone: 0, mis: 0.75 },
}

/** palettes: [background, light ("face"), warm ("lips"), yellow ("hair"), cool ("eyeshadow"), shadow] */
export const POP_PALETTES: string[][] = [
  ['#ff2d87', '#ffe23d', '#e8132b', '#1fc6c0', '#2a3fe0', '#ff7a1a'],
  ['#ff8c1a', '#ff9ad5', '#d0102e', '#ffe600', '#12b5e8', '#6c2bd9'],
  ['#19c6d1', '#ff9fc0', '#ff3b1f', '#ffe600', '#2a2ad8', '#0f8f4e'],
  ['#ffe600', '#ff5ca8', '#d4021d', '#1fb2ff', '#7b2cff', '#ff6a00'],
  ['#2b3bd8', '#ffb3d1', '#ff2a2a', '#ffe100', '#26e0b8', '#ff6a00'],
  ['#36cc68', '#fff04d', '#ff1f6b', '#ff7a00', '#3f37c9', '#0d7fb8'],
  ['#8a3cff', '#ffd24a', '#ff2d55', '#3df5c4', '#ff9ae0', '#1d4fff'],
  ['#ff3b30', '#bff2ff', '#ffe600', '#ff5ac8', '#1f3bd6', '#7a1fa2'],
  ['#ffa0c8', '#fff3a6', '#ff2a5f', '#18c9e0', '#5a2df0', '#ff7a33'],
  ['#12b5e8', '#ffe23d', '#ff2d87', '#ff6b1a', '#2a2ad8', '#8fd61f'],
  ['#c6f432', '#ff8fc8', '#e8132b', '#7b2cff', '#1fb2ff', '#ff6a00'],
  ['#ff6a00', '#c9f7ff', '#ff1f8f', '#ffe600', '#1a3bd0', '#a1127a'],
]
const KEY_INK = '#141117'
const PAPER = '#fbf6ec'

const NP = 9 // max panels
const TW = 16 // texels per row: 0..7 current set, 8..15 previous set
const TH = NP + 1 // + one row of pull progress

const FRAG = /* glsl */ `
uniform sampler2D tData;
uniform vec4 uSheetA;   // previous layout: x, y (GL device px), w, h
uniform vec4 uSheetB;   // current layout
uniform vec4 uGridA;    // cols, rows, gutter (device px), Ben-Day amount
uniform vec4 uGridB;
uniform vec4 uWinA;     // scene window for a panel: centre uv, size uv
uniform vec4 uWinB;
uniform vec4 uMisAB;    // misregistration scale of layout A, B
uniform float uLine;    // global squeegee line (GL device px); new layout above it
uniform vec4 uLineSpan; // x0, x1 of the global blade
uniform vec3 uBead;
uniform vec3 uPaper;
uniform vec3 uKey;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 sceneL(vec2 uv) {
  vec3 c = textureLod(tScene, uv, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
bool inside01(vec2 uv) { return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0; }
float rawDepth(vec2 uv) { return inside01(uv) ? textureLod(tDepth, uv, 0.0).r : 1.0; }
float covL(vec2 uv) { return step(rawDepth(uv), 0.99999); }
float invZ(vec2 uv) {
  float d = rawDepth(uv);
  if (uOrtho > 0.5) return 1.0 / (uNear + d * (uFar - uNear));
  float z = d * 2.0 - 1.0;
  return (uFar + uNear - z * (uFar - uNear)) / (2.0 * uNear * uFar);
}
float covBlur(vec2 uv, vec2 r) {
  return (covL(uv + vec2(r.x, r.y * 0.4)) + covL(uv + vec2(-r.x * 0.4, r.y)) + covL(uv + vec2(-r.x, -r.y * 0.4)) + covL(uv + vec2(r.x * 0.4, -r.y))) * 0.25;
}

// 1 light · 2 warm · 3 yellow · 4 cool · 5 shadow
int inkClass(vec3 c) {
  float V = max(c.r, max(c.g, c.b));
  float m = min(c.r, min(c.g, c.b));
  float C = V - m;
  float S = C / max(V, 1e-3);
  if (V < 0.42) return 5;
  if (S < 0.27) return 1;
  float h;
  if (V == c.r) h = (c.g - c.b) / C;
  else if (V == c.g) h = 2.0 + (c.b - c.r) / C;
  else h = 4.0 + (c.r - c.g) / C;
  h = fract(h / 6.0);
  if (h < 0.045 || h > 0.84) return 2;
  if (h < 0.2) return 3;
  return 4;
}

float benday(vec2 p, float cell, float cover) {
  vec2 r = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / cell;
  float d = length(fract(r) - 0.5) * cell;
  float R = cell * sqrt(cover / 3.14159);
  return smoothstep(R + 0.7, R - 0.7, d);
}

// squeegee blade + the bead of ink it pushes ahead of itself (dy > 0 above the blade)
vec3 blade(vec3 col, float dy, float k, vec3 ink) {
  float bw = 4.5 * k;
  float bead = 9.0 * k;
  if (dy < 0.0 && dy > -bead) {
    float t = -dy / bead;                       // 0 at the blade → 1 at the bead's front
    float wet = 1.0 - smoothstep(0.75, 1.0, t);
    vec3 b = ink * (0.78 + 0.22 * t);
    b += vec3(0.35) * exp(-pow((t - 0.35) * 7.0, 2.0)); // glossy rim
    col = mix(col, b, wet);
  }
  if (dy >= 0.0 && dy < bw) {
    float t = dy / bw;
    col = mix(vec3(0.16, 0.16, 0.19), vec3(0.42, 0.42, 0.46), smoothstep(0.1, 0.9, t));
  }
  if (dy >= bw && dy < bw + 5.0 * k) col *= 0.82 + 0.18 * smoothstep(0.0, 5.0 * k, dy - bw); // blade shadow
  return col;
}

vec3 printPanel(vec2 px, vec2 cp, vec2 rel, vec4 sheet, vec4 grid, vec4 win, float mis, bool isNew, vec3 paper) {
  vec2 cellSz = sheet.zw / grid.xy;
  vec2 cell = min(floor(rel / cellSz), grid.xy - 1.0);
  vec2 ps = cellSz - grid.z;
  vec2 lp = rel - cell * cellSz - grid.z * 0.5;
  // CSS px → panel px: ink features scale a little with the panel so the 3×3 prints read as smaller copies
  float k = uDpr * clamp(ps.y / (uDpr * 330.0), 0.55, 1.2);
  // ragged print edge (the stencil's open area, slightly uneven)
  float rag = (vnoise(cp * 0.4 + cell * 7.1) - 0.5) * 1.4 * uDpr;
  if (lp.x < rag || lp.y < rag || lp.x > ps.x - rag || lp.y > ps.y - rag) return paper;

  int idx = int((grid.y - 1.0 - cell.y) * grid.x + cell.x);
  vec4 an = texelFetch(tData, ivec2(idx, ${NP}), 0);
  float tilt = (lp.x / ps.x - 0.5) * ps.y * 0.06;
  float pullY = mix(ps.y + 12.0 * k, -16.0 * k, an.x) + tilt;
  bool cur = isNew && lp.y >= pullY;
  int base = cur ? 0 : ${TW / 2};
  vec4 P0 = texelFetch(tData, ivec2(base + 6, idx), 0); // key offset, colour offset (CSS px)
  vec4 P1 = texelFetch(tData, ivec2(base + 7, idx), 0); // bg offset, halftone flag, seed
  float seed = P1.w;

  // panel px → scene uv
  vec2 sc = win.zw / ps;
  vec2 q = lp;
  vec2 wob = (vec2(vnoise(cp * 0.03 + seed * 9.0), vnoise(cp * 0.03 + seed * 9.0 + 5.3)) - 0.5) * 4.0 * k;

  /* background screen */
  vec2 uvB = win.xy + (q - P1.xy * k * mis + wob - ps * 0.5) * sc;
  vec2 rb = 2.6 * k * sc;
  float covB = covBlur(uvB, rb);
  float bgM = 1.0 - smoothstep(0.42, 0.58, covB);
  float buildB = 1.0 - clamp(abs(covB - 0.5) * 2.4, 0.0, 1.0);

  /* colour screen */
  vec2 uvF = win.xy + (q - P0.zw * k * mis + wob * 0.6 - ps * 0.5) * sc;
  float covF = covBlur(uvF, rb);
  float fM = smoothstep(0.44, 0.6, covF);
  float buildF = 1.0 - clamp(abs(covF - 0.5) * 2.4, 0.0, 1.0);
  int cls = inkClass(sceneL(uvF));

  /* key screen */
  vec2 uvK = win.xy + (q - P0.xy * k * mis - ps * 0.5) * sc;
  vec3 sK = sceneL(uvK);
  float L = luma(sK);
  vec2 rl = 1.25 * k * sc;
  float iz0 = invZ(uvK);
  float lapX = abs(invZ(uvK + vec2(rl.x, 0.0)) + invZ(uvK - vec2(rl.x, 0.0)) - 2.0 * iz0);
  float lapY = abs(invZ(uvK + vec2(0.0, rl.y)) + invZ(uvK - vec2(0.0, rl.y)) - 2.0 * iz0);
  float edge = smoothstep(0.03, 0.08, max(lapX, lapY) / max(iz0, 1e-4));

  vec3 inkB = texelFetch(tData, ivec2(base, idx), 0).rgb;
  vec3 inkF = texelFetch(tData, ivec2(base + cls, idx), 0).rgb;

  /* ink behaviour: streaks along the pull, starving toward its end, voids, build-up at stencil edges */
  float st = vnoise(vec2(cp.x * 0.5 + seed * 31.0, cp.y * 0.012 + seed)) * 0.6 + vnoise(vec2(cp.x * 1.9 + seed * 7.0, cp.y * 0.04)) * 0.4;
  float starve = smoothstep(0.3, 1.0, 1.0 - lp.y / ps.y) * (0.35 + 0.65 * fract(seed * 3.7));
  float load = 1.0 - 0.09 * st - 0.16 * starve * st;
  float vn = vnoise(cp * 0.3 / (k / uDpr) + seed * 13.0) * 0.62 + hash12(floor(cp * 0.9) + seed * 50.0) * 0.38;
  float voidM = smoothstep(0.9 - 0.16 * starve, 0.94 - 0.16 * starve, vn);
  float flood = 1.0 - smoothstep(0.0, 22.0 * k, ps.y - lp.y); // heavy ink where the flood starts

  vec3 col = paper;
  // background ink (Ben-Day dots in the strip)
  float bd = grid.w > 0.5 ? benday(lp, 5.6 * k, 0.62) : 1.0;
  vec3 iB = inkB * (1.0 - 0.13 * buildB - 0.07 * flood);
  col = mix(col, iB, bgM * bd * load * (1.0 - voidM * 0.85));
  // colour ink (semi-opaque: an overprint on the background reads as a darker sliver)
  vec3 iF = inkF * (1.0 - 0.12 * buildF - 0.06 * flood) * mix(vec3(1.0), col, 0.22);
  float fA = fM * load * (1.0 - voidM * 0.8);
  if (grid.w > 0.5 && cls == 1) fA *= mix(0.55, 1.0, benday(lp + 2.0 * k, 4.4 * k, 0.5));
  col = mix(col, iF, fA);
  // key ink: darks + contours (+ coarse halftone in some panels)
  float kThr = 0.18;
  float key = smoothstep(kThr + 0.035, kThr - 0.035, L);
  if (P1.z > 0.5) {
    float v = smoothstep(0.5, kThr, L);
    vec2 r = mat2(0.7071, 0.7071, -0.7071, 0.7071) * lp / (4.6 * k);
    float d = length(fract(r) - 0.5);
    float R = 0.62 * sqrt(v);
    key = max(key, smoothstep(R + 0.06, R - 0.06, d) * step(0.04, v));
  }
  key = max(key, edge);
  float kv = vnoise(cp * 0.55 + seed * 3.0) * 0.6 + hash12(floor(cp * 1.3) + seed * 70.0) * 0.4;
  float kVoid = smoothstep(0.9 - 0.14 * starve, 0.94 - 0.14 * starve, kv);
  col = mix(col, uKey, key * (0.97 - 0.06 * st) * (1.0 - kVoid * 0.8));

  // fresh print: squeegee still crossing this panel
  if (isNew && an.x > 0.0 && an.x < 1.0) col = blade(col, lp.y - pullY, k, texelFetch(tData, ivec2(0, idx), 0).rgb);
  return col;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec3 paper = uPaper * (1.0 - 0.03 * (vnoise(cp * 0.012) - 0.5) - 0.025 * (hash12(floor(cp)) - 0.5));
  paper -= vec3(0.012) * smoothstep(0.75, 0.95, vnoise(vec2(cp.x * 0.015, cp.y * 0.12)));
  bool isNew = px.y > uLine;
  vec4 sheet = isNew ? uSheetB : uSheetA;
  vec4 grid = isNew ? uGridB : uGridA;
  vec4 win = isNew ? uWinB : uWinA;
  float mis = isNew ? uMisAB.y : uMisAB.x;
  vec2 rel = px - sheet.xy;
  vec3 col = paper;
  if (rel.x >= 0.0 && rel.y >= 0.0 && rel.x < sheet.z && rel.y < sheet.w) col = printPanel(px, cp, rel, sheet, grid, win, mis, isNew, paper);
  if (px.x >= uLineSpan.x && px.x <= uLineSpan.y && abs(px.y - uLine) < 20.0 * uDpr) col = blade(col, px.y - uLine, uDpr, uBead);
  return col;
}
`

/* ------------------------------------------------------------------ state */

type Panel = { pal: number[][]; key: [number, number]; fill: [number, number]; bg: [number, number]; halftone: number; seed: number }
type Rect = { x: number; y: number; w: number; h: number }
type State = {
  data: Float32Array
  tex: THREE.DataTexture
  cur: Panel[]
  prev: Panel[]
  pull: { t: number; delay: number; dur: number }[]
  modeA: PopMode
  modeB: PopMode
  wipe: number // 1 = done
  area: Rect | null // CSS px, top-left origin
  focus: Rect | null
  css: { w: number; h: number; dpr: number }
  sheet: Rect // current layout, CSS px top-left
  grid: { cols: number; rows: number }
  palIdx: number[]
}
const STATE = new WeakMap<StylizeEffect, State>()

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const randOff = (m: number): [number, number] => {
  const a = Math.random() * Math.PI * 2
  const r = rnd(0.45, 1) * m
  return [Math.cos(a) * r, Math.sin(a) * r]
}
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function newPanel(palIndex: number, halftoneChance: number): Panel {
  const src = POP_PALETTES[palIndex]
  const pal = src.map(rgb)
  // a little extra variety: sometimes the yellow and cool screens trade inks
  if (Math.random() < 0.35) [pal[3], pal[4]] = [pal[4], pal[3]]
  return {
    pal,
    key: randOff(rnd(3, 7)),
    fill: randOff(rnd(1.5, 4)),
    bg: randOff(rnd(1, 3)),
    halftone: Math.random() < halftoneChance ? 1 : 0,
    seed: Math.random(),
  }
}

/** palette indices for n panels: all different, neighbours never share a background */
function pickPalettes(n: number, avoid: number[] = []) {
  const ids = POP_PALETTES.map((_, i) => i)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  // prefer palettes the sheet isn't already showing in the same slot
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    let k = ids.findIndex((p) => p !== avoid[i] && !out.includes(p))
    if (k < 0) k = 0
    out.push(ids.splice(k, 1)[0])
  }
  return out
}

function writePanel(st: State, i: number, p: Panel, base: number) {
  const d = st.data
  const o = (i * TW + base) * 4
  for (let s = 0; s < 6; s++) d.set([p.pal[s][0], p.pal[s][1], p.pal[s][2], 1], o + s * 4)
  d.set([p.key[0], p.key[1], p.fill[0], p.fill[1]], o + 24)
  d.set([p.bg[0], p.bg[1], p.halftone, p.seed], o + 28)
}
function writeAll(st: State) {
  for (let i = 0; i < NP; i++) {
    writePanel(st, i, st.cur[i], 0)
    writePanel(st, i, st.prev[i], TW / 2)
  }
  st.tex.needsUpdate = true
}

/** the strip folds into 2 × 2 on portrait areas (phones) */
function gridFor(mode: PopMode, area: Rect) {
  const M = MODES[mode]
  if (mode === 'strip' && area.w / area.h < 1.1) return { cols: 2, rows: 2 }
  return { cols: M.cols, rows: M.rows }
}

function layout(mode: PopMode, area: Rect, dpr: number) {
  const M = { ...MODES[mode], ...gridFor(mode, area) }
  const g = M.gutter * dpr * (mode === 'nine' && area.w < 600 * dpr ? 0.7 : 1)
  const aspect = THREE.MathUtils.clamp((area.w / M.cols - g) / (area.h / M.rows - g), M.aMin, M.aMax)
  const pw = Math.min(area.w / M.cols - g, (area.h / M.rows - g) * aspect)
  const ph = pw / aspect
  const w = M.cols * (pw + g)
  const h = M.rows * (ph + g)
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h, g, aspect, cols: M.cols, rows: M.rows }
}

/* ------------------------------------------------------------------ factory */

export function createPopEffect(init: { mode?: PopMode } = {}): StylizeEffect {
  const mode = init.mode ?? 'quad'
  const data = new Float32Array(TW * TH * 4)
  const tex = new THREE.DataTexture(data, TW, TH, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  const v4 = () => new THREE.Vector4()
  const uniforms: Record<string, THREE.IUniform> = {
    tData: { value: tex },
    uSheetA: { value: v4() },
    uSheetB: { value: v4() },
    uGridA: { value: v4() },
    uGridB: { value: v4() },
    uWinA: { value: v4() },
    uWinB: { value: v4() },
    uMisAB: { value: v4() },
    uLine: { value: -1e5 },
    uLineSpan: { value: v4() },
    uBead: { value: new THREE.Vector3(...rgb('#ff2d87')) },
    uPaper: { value: new THREE.Vector3(...rgb(PAPER)) },
    uKey: { value: new THREE.Vector3(...rgb(KEY_INK)) },
  }
  const pals = pickPalettes(NP)
  const cur = pals.map((p) => newPanel(p, MODES[mode].halftone))
  const st: State = {
    data,
    tex,
    cur,
    prev: cur.slice(),
    pull: cur.map(() => ({ t: 1, delay: 0, dur: 0.6 })),
    modeA: mode,
    modeB: mode,
    wipe: 1,
    area: null,
    focus: null,
    css: { w: 1, h: 1, dpr: 1 },
    sheet: { x: 0, y: 0, w: 1, h: 1 },
    grid: { cols: MODES[mode].cols, rows: MODES[mode].rows },
    palIdx: pals,
  }
  writeAll(st)

  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms,
    background: popMeta.background,
    update(dt, { dpr, width, height }) {
      const W = width
      const H = height
      st.css = { w: W / dpr, h: H / dpr, dpr }
      const u = uniforms
      // print area (device px, top-left origin)
      const m = Math.max(16, Math.min(W, H) / dpr * 0.04)
      const A = st.area
        ? { x: st.area.x * dpr, y: st.area.y * dpr, w: st.area.w * dpr, h: st.area.h * dpr }
        : { x: m * dpr, y: m * dpr, w: W - 2 * m * dpr, h: H - 2 * m * dpr }
      const F = st.focus ? { x: st.focus.x * dpr, y: st.focus.y * dpr, w: st.focus.w * dpr, h: st.focus.h * dpr } : { x: 0, y: 0, w: W, h: H }
      const put = (mode: PopMode, sheetU: THREE.Vector4, gridU: THREE.Vector4, winU: THREE.Vector4) => {
        const L = layout(mode, A, dpr)
        sheetU.set(L.x, H - (L.y + L.h), L.w, L.h)
        gridU.set(L.cols, L.rows, L.g, MODES[mode].benday)
        // the panel's window into the scene: the largest panel-aspect rect inside the focus rect
        let ww = F.w
        let wh = F.h
        if (L.aspect < F.w / F.h) ww = F.h * L.aspect
        else wh = F.w / L.aspect
        winU.set((F.x + F.w / 2) / W, 1 - (F.y + F.h / 2) / H, ww / W, wh / H)
        return L
      }
      put(st.modeA, u.uSheetA.value, u.uGridA.value, u.uWinA.value)
      const LB = put(st.modeB, u.uSheetB.value, u.uGridB.value, u.uWinB.value)
      st.sheet = { x: LB.x / dpr, y: LB.y / dpr, w: LB.w / dpr, h: LB.h / dpr }
      st.grid = { cols: LB.cols, rows: LB.rows }
      ;(u.uMisAB.value as THREE.Vector4).set(MODES[st.modeA].mis, MODES[st.modeB].mis, 0, 0)

      // global pull (mode change): the blade runs top → bottom over both sheets
      if (st.wipe < 1) {
        st.wipe = Math.min(1, st.wipe + dt / 1.05)
        const a = u.uSheetA.value as THREE.Vector4
        const b = u.uSheetB.value as THREE.Vector4
        const top = Math.max(a.y + a.w, b.y + b.w) + 14 * dpr
        const bot = Math.min(a.y, b.y) - 24 * dpr
        u.uLine.value = top - easeIO(st.wipe) * (top - bot)
        ;(u.uLineSpan.value as THREE.Vector4).set(Math.min(a.x, b.x), Math.max(a.x + a.z, b.x + b.z), 0, 0)
        if (st.wipe >= 1) {
          st.modeA = st.modeB
          u.uLine.value = -1e5
        }
      }

      // per-panel pulls
      let dirty = false
      st.pull.forEach((p, i) => {
        if (p.t >= 1) return
        if (p.delay > 0) {
          p.delay -= dt
          return
        }
        p.t = Math.min(1, p.t + dt / p.dur)
        data[(NP * TW + i) * 4] = easeIO(p.t)
        dirty = true
      })
      if (dirty) tex.needsUpdate = true
    },
  }
  // progress row: everything printed
  for (let i = 0; i < NP; i++) data[(NP * TW + i) * 4] = 1
  tex.needsUpdate = true
  STATE.set(fx, st)
  return fx
}

/* ------------------------------------------------------------------ controls */

/** switch the grid: a new sheet is pulled over the old one, every panel with a fresh palette */
export function setPopMode(fx: StylizeEffect, mode: PopMode) {
  const st = STATE.get(fx)
  if (!st || mode === st.modeB) return
  // (a pull already running is cut short: its new sheet becomes the old one)
  st.modeA = st.modeB
  st.modeB = mode
  st.prev = st.cur
  const pals = pickPalettes(NP, st.palIdx)
  st.palIdx = pals
  st.cur = pals.map((p) => newPanel(p, MODES[mode].halftone))
  st.pull.forEach((p, i) => {
    p.t = 1
    st.data[(NP * TW + i) * 4] = 1
  })
  writeAll(st)
  st.wipe = 0
  const bead = st.cur[0].pal[0]
  ;(fx.uniforms!.uBead.value as THREE.Vector3).set(bead[0], bead[1], bead[2])
  if (st.css.w <= 1) {
    // not on screen yet: no animation
    st.modeA = mode
    st.wipe = 1
  }
}

/** re-pull one panel (index in reading order): new palette + registration, squeegee wipe */
export function repullPanel(fx: StylizeEffect, i: number, delay = 0) {
  const st = STATE.get(fx)
  if (!st || i < 0 || i >= NP) return
  const used = new Set(st.palIdx)
  let p = Math.floor(Math.random() * POP_PALETTES.length)
  for (let k = 0; k < 20 && (used.has(p) || p === st.palIdx[i]); k++) p = Math.floor(Math.random() * POP_PALETTES.length)
  st.palIdx[i] = p
  // what's on the paper now (mid-pull: the new print wins) becomes the "old" side
  st.prev[i] = st.pull[i].t >= 0.5 ? st.cur[i] : st.prev[i]
  st.cur[i] = newPanel(p, MODES[st.modeB].halftone)
  writePanel(st, i, st.prev[i], TW / 2)
  writePanel(st, i, st.cur[i], 0)
  st.pull[i] = { t: 0, delay, dur: rnd(0.5, 0.68) }
  st.data[(NP * TW + i) * 4] = 0
  st.tex.needsUpdate = true
}

/** new colour combination for the whole sheet, panel after panel */
export function shufflePop(fx: StylizeEffect) {
  const st = STATE.get(fx)
  if (!st) return
  const n = popPanelCount(fx)
  for (let i = 0; i < n; i++) repullPanel(fx, i, i * (n > 4 ? 0.07 : 0.13))
}

/** panels in the current layout */
export function popPanelCount(fx: StylizeEffect) {
  const st = STATE.get(fx)
  if (!st) return 4
  return st.grid.cols * st.grid.rows
}

/**
 * Where the sheet is printed and which part of the scene each panel shows (both CSS px, top-left origin).
 * `area` defaults to the whole screen minus a margin, `focus` to the whole scene.
 */
export function setPopFrame(fx: StylizeEffect, frame: { area?: Rect | null; focus?: Rect | null }) {
  const st = STATE.get(fx)
  if (!st) return
  if (frame.area !== undefined) st.area = frame.area
  if (frame.focus !== undefined) st.focus = frame.focus
}

/** panel index under a CSS-px point (reading order), or -1 */
export function popPanelAt(fx: StylizeEffect, x: number, y: number) {
  const st = STATE.get(fx)
  if (!st) return -1
  const s = st.sheet
  const M = st.grid
  const c = Math.floor(((x - s.x) / s.w) * M.cols)
  const r = Math.floor(((y - s.y) / s.h) * M.rows)
  if (c < 0 || r < 0 || c >= M.cols || r >= M.rows) return -1
  return r * M.cols + c
}

/** the printed sheet in CSS px (current layout) */
export function popSheet(fx: StylizeEffect): Rect {
  return STATE.get(fx)?.sheet ?? { x: 0, y: 0, w: 0, h: 0 }
}

/** background ink of each panel (sRGB hex), reading order — for UI swatches */
export function popPanelInks(fx: StylizeEffect) {
  const st = STATE.get(fx)
  if (!st) return []
  return st.palIdx.map((p) => POP_PALETTES[p])
}
