import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 蜡笔粉彩 — a box of crayons (or pastel sticks) on toothy paper.
 *
 *  · colour: the scene is matched against a 24-stick box (a tiny DataTexture read with texelFetch). Each
 *    stick is modelled as "paper → stick at pressure k", so a pale pink becomes a lightly pressed pink and
 *    a deep shadow becomes the stick pressed hard. Where one stick can't reach the colour, a second stick
 *    is chosen and laid on top (another direction) — the way children shade a house's dark side.
 *  · strokes: wax is laid in patches of back-and-forth scribble. Each patch has one of a few hand
 *    directions, rows that arc around a wrist pivot, their own turn-around points and a wobbling width.
 *    Neighbouring patches cross only near their borders (crossing strokes, never a uniform cross-hatch).
 *  · paper tooth: wax only catches the raised grain unless pressed hard; pressure ∝ how dark / saturated
 *    the stick has to be, so light passages are speckly and dark ones dense, with a slight waxy sheen.
 *  · "outside the lines": colour is sampled through a slow noise displacement, so fills misregister with
 *    the wobbly darker outline (depth + normal edges, drawn at another jitter) — child-drawing energy.
 *  · pastel: toned paper, softer strokes rubbed flat in places, the colour smudged along a flow field
 *    (finger blending), chalk dust specks and light pastel highlights laid on top.
 *  · oil pastel: thick buttery layers with lit ridges, and sgraffito — fine scratches through the top
 *    layer that reveal the colour underneath.
 *  · draw-in: `drawCrayon(fx)` replays the picture being made: outlines first, then patch after patch is
 *    scribbled in row by row, then the shading layer, then highlights.
 *  · modes only change numbers (and the stick colours), interpolated on the CPU, so a mode switch morphs.
 */

export const crayonModes = [
  { id: 'crayon', label: '蜡笔' },
  { id: 'soft', label: '软粉彩' },
  { id: 'oil', label: '油粉彩' },
] as const
export type CrayonMode = (typeof crayonModes)[number]['id']

export const crayonMeta = { title: '蜡笔粉彩', en: 'Crayon & Pastel', background: '#fbf8f1', theme: 'light' as const }

/** paper colour per mode (pages use it for the stage background) */
export const crayonPaper: Record<CrayonMode, string> = {
  crayon: '#fbf8f1',
  soft: '#9fadbb',
  oil: '#f0e5cd',
}

/* ------------------------------------------------------------------ palettes */

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// a 24-stick box (Crayola-like)
const BOX = [
  '#e0352c', // red
  '#ff8a1e', // orange
  '#ffb31f', // yellow-orange
  '#ffdc26', // yellow
  '#c9e04a', // green-yellow
  '#84c440', // yellow-green
  '#2f9f4c', // green
  '#1e6a3f', // pine
  '#16a29f', // blue-green
  '#72c6f0', // sky blue
  '#1e8dd6', // cerulean
  '#2b58d2', // blue
  '#28347e', // indigo
  '#7a43b8', // violet
  '#b52f78', // red-violet
  '#f25b9e', // magenta
  '#ffaec9', // carnation pink
  '#ffc99b', // peach
  '#d3a266', // tan
  '#8b4b26', // brown
  '#55301c', // mahogany
  '#8f8b86', // grey
  '#2a2626', // black
  '#fbfaf3', // white
].map(rgb)
const NPAL = BOX.length

const tint = (c: RGB, white: number, sat: number): RGB => {
  const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
  return c.map((v) => {
    const s = l + (v - l) * sat
    return Math.min(1, Math.max(0, s + (1 - s) * white))
  }) as RGB
}

const PALETTES: Record<CrayonMode, RGB[]> = {
  crayon: BOX,
  // soft pastel sticks: chalky, a touch lighter and softer
  soft: BOX.map((c, i) => (i >= 20 ? tint(c, i === 23 ? 0 : 0.04, 0.9) : tint(c, 0.1, 0.88))),
  // oil pastels: rich, saturated
  oil: BOX.map((c) => tint(c, 0, 1.12)),
}

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  paper: RGB
  ink: RGB // outline crayon
  tooth: number // how strictly wax only catches the grain peaks
  grain: number // paper grain frequency (lower = coarser)
  paperTex: number // visibility of the paper texture itself
  snap: number // 1 = only the box colours, < 1 lets the true colour through (blended pastel)
  smudge: number // finger blending along the flow field
  rub: number // strokes rubbed flat
  soft: number // stroke edge softness
  dust: number
  high: number // light highlights on top
  thick: number // impasto ridges
  scratch: number // sgraffito
  line: number // outline strength
  sheen: number
  press: number
  chalk: number
  opacity: number
  spacing: number
}

const LOOKS: Record<CrayonMode, Look> = {
  crayon: {
    paper: rgb(crayonPaper.crayon), ink: rgb('#2b2422'), tooth: 1, grain: 1, paperTex: 0.5, snap: 1, smudge: 0, rub: 0, soft: 0,
    dust: 0, high: 0, thick: 0, scratch: 0, line: 1, sheen: 1, press: 1, chalk: 0, opacity: 0.94, spacing: 1,
  },
  soft: {
    paper: rgb(crayonPaper.soft), ink: rgb('#2a2d3a'), tooth: 0.85, grain: 0.8, paperTex: 1.6, snap: 0.7, smudge: 1, rub: 0.45, soft: 1,
    dust: 1, high: 1, thick: 0, scratch: 0, line: 0.55, sheen: 0, press: 1.1, chalk: 1, opacity: 0.97, spacing: 1.45,
  },
  oil: {
    paper: rgb(crayonPaper.oil), ink: rgb('#1e1a1c'), tooth: 0.35, grain: 0.85, paperTex: 0.7, snap: 0.92, smudge: 0.25, rub: 0.1, soft: 0.45,
    dust: 0, high: 0.75, thick: 1, scratch: 1, line: 0.8, sheen: 0.6, press: 1.35, chalk: 0, opacity: 1, spacing: 1.25,
  },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number | RGB>
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    o[key] = Array.isArray(x) ? (x.map((v, i) => v + ((y as RGB)[i] - v) * k) as RGB) : (x as number) + ((y as number) - (x as number)) * k
  }
  return o as unknown as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;    // NPAL × 1 stick colours (sRGB)
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uSize;
uniform float uTooth;
uniform float uGrain;
uniform float uPaperTex;
uniform float uSnap;
uniform float uSmudge;
uniform float uRub;
uniform float uSoft;
uniform float uDust;
uniform float uHigh;
uniform float uThick;
uniform float uScratch;
uniform float uLine;
uniform float uSheen;
uniform float uPress;
uniform float uChalk;
uniform float uOpacity;
uniform float uSpacing;
uniform float uDraw;       // 0..1 draw-in progress (≥ 1: finished)

#define NPAL ${NPAL}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// explicit-LOD reads (used inside loops)
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float coverL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0).a; }

/* scribble field: x = wax (stroke mask × pressure along the stroke), y = lit ridge, z = hand angle */
vec4 strokeField(vec2 cp, float layer, float S, float kk, float prog) {
  float P = 44.0 * S;                    // patch size, CSS px
  float sp = 3.3 * S * uSpacing;         // row spacing, CSS px
  vec2 off = vec2(0.37, 0.71) * layer;
  vec2 g = cp / P + off;
  vec2 base = floor(g);
  vec2 W = uRes / uDpr;
  float w1 = 0.0, w2 = 0.0;
  vec4 s1 = vec4(0.0), s2 = vec4(0.0);
  float rubN = uRub * smoothstep(0.35, 0.6, vnoise(cp * 0.011 + layer * 4.0));
  for (int j = 0; j < 9; j++) {
    vec2 cell = base + vec2(float(j - (j / 3) * 3) - 1.0, float(j / 3) - 1.0);
    vec2 h = hash22(cell + layer * 19.17);
    float h3 = hash12(cell * 1.71 + layer * 5.3 + 2.0);
    vec2 c = cell + 0.5 + (h - 0.5) * 0.5;
    vec2 rel = (g - c) * P;
    // a few hand directions per layer (children rarely rotate the wrist freely)
    float ang = 0.62 + layer * 1.25 + (floor(h3 * 3.0) - 1.0) * 0.8 + (h.x - 0.5) * 0.3;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-dir.y, dir.x);
    float u = dot(rel, dir);
    float v = dot(rel, nrm);
    float e = length(vec2(u / 1.08, v / 0.82)) / P;
    e += 0.1 * sin(u * 0.08 + h.y * 6.3) * sin(v * 0.1 + h.x * 6.3);
    float blob = smoothstep(1.0, 0.8, e);
    if (blob <= 0.0) continue;
    // rows arc around the wrist
    float R = P * (1.5 + 2.5 * h3) * (h.y > 0.5 ? 1.0 : -1.0);
    float vv = v + u * u / (2.0 * R);
    float rowf = vv / sp;
    float row = floor(rowf);
    float f = rowf - row;
    float rh = hash12(vec2(row * 1.37 + cell.x * 3.1, h3 * 91.0 + layer * 7.0 + cell.y * 1.3));
    float halfLen = P * (0.6 + 0.5 * rh);
    float along = (u - (rh - 0.5) * P * 0.5) / halfLen;
    float ends = smoothstep(1.0, 0.78, abs(along));
    // wax ribbon across the row: wider when pressed harder, wobbling width
    float wid = 0.28 + 0.16 * kk + 0.07 * sin(u * 0.06 + rh * 20.0) + 0.06 * uSoft;
    float dist = abs(f - 0.5);
    float sft = 0.05 + 0.2 * uSoft;
    float prof = smoothstep(wid + sft, wid - sft, dist);
    float press = 0.8 + 0.2 * sin(u * 0.035 + rh * 12.0);
    prof = mix(prof, 0.9, rubN);
    float ink = prof * ends * press;
    // impasto: rounded ridge across the stroke, lit from the upper left
    float x = clamp(dist / max(wid, 0.05), 0.0, 1.0);
    float lit = dot(nrm, vec2(-0.6, 0.8)) * sin(x * 1.5708) * sign(f - 0.5) * prof * (1.0 - rubN);
    // draw-in: patches start in order (left → right, shuffled), rows are scribbled back and forth
    if (prog < 1.0) {
      vec2 cc = (c - off) * P;
      float order = 0.5 * h3 + 0.5 * clamp(cc.x / W.x, 0.0, 1.0);
      float lp = clamp((prog - order * 0.6) / 0.4, 0.0, 1.0);
      float nR = 1.7 * P / sp;
      float ri = clamp((vv + 0.85 * P) / (1.7 * P), 0.0, 0.999) * nR;
      float a01 = clamp(along * 0.5 + 0.5, 0.0, 1.0);
      if (mod(floor(ri), 2.0) > 0.5) a01 = 1.0 - a01;
      ink *= step((floor(ri) + a01) / nR, lp);
    }
    float wgt = blob * (0.3 + h3);
    vec4 s = vec4(ink, lit, ang, 0.0);
    if (wgt > w1) { w2 = w1; s2 = s1; w1 = wgt; s1 = s; }
    else if (wgt > w2) { w2 = wgt; s2 = s; }
  }
  // the runner-up patch only crosses through near the border between them
  float a = s1.x * smoothstep(0.0, 0.2, w1);
  float b = s2.x * smoothstep(0.62, 1.0, w2 / max(w1, 1e-4));
  return vec4(max(a, b), a >= b ? s1.y : s2.y, s1.z, 0.0);
}

float toothAt(vec2 cp) {
  vec2 g = cp * uGrain;
  float a = vnoise(g * vec2(0.55, 0.85));
  float b = vnoise(g * 1.6 + 13.0);
  float c = hash12(floor(g * 1.25));
  return clamp(0.42 * a + 0.36 * b + 0.22 * c, 0.0, 1.0);
}

float catchWax(float depth, float tooth) {
  float thr = 1.0 - depth * 1.3;
  float c = smoothstep(thr - 0.1, thr + 0.1, tooth);
  return mix(smoothstep(0.04, 0.4, depth), c, uTooth);
}

// depth Laplacian (jumps) + normal Sobel (creases); r = sample radius in device px
float edgeAt(vec2 p, float r) {
  float d0 = depthAt(p);
  float d1 = depthAt(p + vec2(r, 0.0));
  float d2 = depthAt(p - vec2(r, 0.0));
  float d3 = depthAt(p + vec2(0.0, r));
  float d4 = depthAt(p - vec2(0.0, r));
  float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
  vec3 n00 = normalAt(p + vec2(-r, -r));
  vec3 n10 = normalAt(p + vec2(0.0, -r));
  vec3 n20 = normalAt(p + vec2(r, -r));
  vec3 n01 = normalAt(p + vec2(-r, 0.0));
  vec3 n21 = normalAt(p + vec2(r, 0.0));
  vec3 n02 = normalAt(p + vec2(-r, r));
  vec3 n12 = normalAt(p + vec2(0.0, r));
  vec3 n22 = normalAt(p + vec2(r, r));
  vec3 gx = (n20 + 2.0 * n21 + n22) - (n00 + 2.0 * n01 + n02);
  vec3 gy = (n02 + 2.0 * n12 + n22) - (n00 + 2.0 * n10 + n20);
  float en = sqrt(dot(gx, gx) + dot(gy, gy));
  return max(smoothstep(0.018, 0.05, lap), smoothstep(0.9, 1.7, en));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  float S = uSize;

  /* sampling position wanders a little: the colour spills past the outline */
  vec2 wob = (vec2(vnoise(cp * 0.03), vnoise(cp * 0.03 + 31.7)) - 0.5) * 9.0 * S;
  wob += (vec2(vnoise(cp * 0.13 + 5.0), vnoise(cp * 0.13 + 9.0)) - 0.5) * 2.4 * S;
  vec2 q = px + wob * uDpr;

  /* target colour, smudged along a slow flow field (finger blending) */
  float fa = 6.2832 * vnoise(cp * 0.0065 + 3.0);
  vec2 sd = vec2(cos(fa), sin(fa)) * uSmudge * 3.6 * S * uDpr;
  vec3 acc = vec3(0.0);
  float cw = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 sp = q + sd * (float(i) - 2.0);
    float cv = coverL(sp);
    acc += sceneL(sp) * cv;
    cw += cv;
  }
  float cover = cw / 5.0;
  vec3 t = cw > 0.001 ? acc / cw : uPaper;

  /* pick sticks: layer 0 from the paper, layer 1 on top of layer 0 where it can't reach the colour */
  vec3 base = uPaper;
  vec3 p1 = uPaper, p2 = uPaper;
  float k1 = 0.0, k2 = 0.0, e1 = 1e9;
  for (int L = 0; L < 2; L++) {
    float be = 1e9;
    vec3 bp = base;
    float bk = 0.0;
    for (int i = 0; i < NPAL; i++) {
      vec3 p = texelFetch(tPal, ivec2(i, 0), 0).rgb;
      vec3 d = p - base;
      float k = clamp(dot(t - base, d) / max(dot(d, d), 1e-4), 0.0, 1.0);
      vec3 r = base + d * k - t;
      // the first stick is chosen mostly by hue (children shade with the same colour, then go over it
      // with a darker one); the second one by the full colour
      float lr = dot(r, vec3(0.299, 0.587, 0.114));
      vec3 rc = r - lr;
      float e = dot(rc * rc, vec3(1.0)) * 1.3 + lr * lr * (L == 0 ? 0.35 : 1.0) + 0.012 * (1.0 - k);
      if (e < be) { be = e; bp = p; bk = k; }
    }
    if (L == 0) {
      p1 = bp; k1 = bk; e1 = be;
      base = mix(uPaper, p1, k1);
    } else {
      p2 = bp;
      k2 = bk * smoothstep(0.8, 0.45, be / max(e1, 1e-5)) * step(0.0015, e1);
    }
  }
  float cvr = smoothstep(0.25, 0.65, cover);
  // near-white, colourless things (a white table, a cloud) are left as bare paper, the way children do
  float chroma = max(t.r, max(t.g, t.b)) - min(t.r, min(t.g, t.b));
  // (only when they are darker than the paper: on toned paper light neutrals are laid in white pastel)
  float dl = luma(uPaper) - luma(t);
  float leave = (1.0 - smoothstep(0.08, 0.2, chroma)) * smoothstep(0.34, 0.2, dl) * smoothstep(-0.04, 0.02, dl);
  cvr *= 1.0 - leave;
  k1 *= cvr;
  k2 *= cvr;
  // pastel: the true colour comes through (sticks blended on the paper); chalk lightens a little
  vec3 c1 = mix(mix(p1, t, 1.0 - uSnap), vec3(1.0), uChalk * 0.08);
  vec3 c2 = mix(mix(p2, t, 1.0 - uSnap), vec3(1.0), uChalk * 0.05);
  float lt = luma(t);
  vec3 c3 = mix(t, vec3(1.0, 0.99, 0.95), 0.6);
  float k3 = uHigh * smoothstep(0.6, 0.88, lt) * cvr;

  /* paper */
  float tooth = toothAt(cp);
  vec3 col = uPaper * (1.0 + (tooth - 0.5) * 0.09 * uPaperTex) * (1.0 + (vnoise(cp * 0.004) - 0.5) * 0.03);

  vec3 under = col;
  float topK = 0.0;
  float ang = 0.6;
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    vec3 pc = L == 0 ? c1 : (L == 1 ? c2 : c3);
    float k = L == 0 ? k1 : (L == 1 ? k2 : k3);
    if (L == 1) under = col;
    if (k < 0.02) continue;
    float st = L == 0 ? 0.12 : (L == 1 ? 0.45 : 0.72);
    float en = L == 0 ? 0.72 : (L == 1 ? 0.9 : 1.0);
    float prog = uDraw >= 1.0 ? 2.0 : clamp((uDraw - st) / (en - st), 0.0, 1.0);
    if (prog <= 0.0) continue;
    vec4 sf = strokeField(cp, fl, S, k, prog);
    float depth = sf.x * (0.28 + 0.85 * k) * uPress;
    float cov = catchWax(depth, L == 2 ? tooth * 0.7 + 0.3 * hash12(floor(cp * 0.8)) : tooth);
    col = mix(col, pc, cov * uOpacity);
    // waxy sheen where pressed hard; buttery ridges (oil pastel)
    col += vec3(0.07) * uSheen * cov * smoothstep(0.55, 1.0, k) * (0.6 + 0.6 * sf.y);
    col *= 1.0 + uThick * 0.16 * sf.y * cov;
    if (L < 2 && cov > 0.3) { topK = max(topK, k); ang = sf.z; }
  }

  /* sgraffito: fine scratches through the top layer reveal what is underneath */
  if (uScratch > 0.01 && topK > 0.3) {
    float sa = ang + 0.55;
    vec2 dir = vec2(cos(sa), sin(sa));
    vec2 sq = vec2(dot(cp, dir), dot(cp, vec2(-dir.y, dir.x)));
    float spc = 4.6 * S;
    float fy = fract(sq.y / spc + 0.4 * vnoise(sq * 0.025));
    float w = 0.55 / spc;
    float aa = 0.7 / (uDpr * spc);
    float line = 1.0 - smoothstep(w - aa, w + aa, abs(fy - 0.5));
    float region = smoothstep(0.5, 0.62, vnoise(cp * 0.012 + 4.0));
    float dash = smoothstep(0.32, 0.45, vnoise(vec2(sq.x * 0.045, floor(sq.y / spc) * 3.1)));
    vec3 reveal = k2 > 0.15 ? under * 1.06 : mix(col, uPaper, 0.75);
    col = mix(col, reveal, line * region * dash * uScratch * smoothstep(0.3, 0.6, topK));
  }

  /* chalk dust: loose specks of the stick colour, also drifting off the shapes */
  if (uDust > 0.01) {
    vec2 dc = floor(cp * 0.7 / S);
    float hd = hash12(dc + 7.0);
    float near = smoothstep(0.02, 0.3, cover);
    float spk = step(1.0 - 0.07 * uDust * near, hd) * smoothstep(0.2, 0.8, toothAt(cp * 1.7 + 40.0));
    col = mix(col, mix(c1, vec3(1.0), 0.25), spk * 0.6);
    col *= 1.0 + (hash12(floor(cp * 1.3) + 3.0) - 0.5) * 0.05 * uDust;
  }

  /* outline: a darker crayon, wobbling, at its own misregistration */
  if (uLine > 0.01) {
    float ol = uDraw >= 1.0 ? 1.0 : clamp(uDraw / 0.32, 0.0, 1.0);
    vec2 j = (vec2(vnoise(cp * 0.05 + 11.0), vnoise(cp * 0.05 + vec2(19.1, 3.3))) - 0.5) * 4.0 * S;
    j += (vec2(vnoise(cp * 0.21 + 7.0), vnoise(cp * 0.21 + 1.9)) - 0.5) * 1.3 * S;
    float e = edgeAt(px + j * uDpr, max(1.25 * S * uDpr, 0.8));
    float press = 0.7 + 0.3 * vnoise(cp * 0.04 + 40.0);
    float reveal = step(vnoise(cp * 0.008 + 70.0) * 0.75 + hash12(floor(cp / (30.0 * S))) * 0.25, ol * 1.02);
    float lineK = e * press * uLine * reveal;
    float cl = catchWax(lineK * 0.95, tooth);
    vec3 lc = mix(uInk, t * 0.42, 0.3);
    col = mix(col, lc, cl * 0.92);
  }
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type CrayonState = {
  from: Look
  to: Look
  cur: Look
  palFrom: RGB[]
  palTo: RGB[]
  k: number
  size: number
  sizeTarget: number
  draw: number
  drawing: boolean
  mode: CrayonMode
}

export type CrayonEffect = StylizeEffect & { crayon: CrayonState }

const DRAW_SECONDS = 4.2

export function createCrayonEffect(): CrayonEffect {
  const st: CrayonState = {
    from: LOOKS.crayon,
    to: LOOKS.crayon,
    cur: LOOKS.crayon,
    palFrom: PALETTES.crayon,
    palTo: PALETTES.crayon,
    k: 1,
    size: 1,
    sizeTarget: 1,
    draw: 1,
    drawing: false,
    mode: 'crayon',
  }
  const data = new Uint8Array(NPAL * 4)
  const pal = new THREE.DataTexture(data, NPAL, 1, THREE.RGBAFormat)
  pal.colorSpace = THREE.NoColorSpace
  pal.magFilter = pal.minFilter = THREE.NearestFilter
  const writePal = (a: RGB[], b: RGB[], k: number) => {
    for (let i = 0; i < NPAL; i++)
      for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round((a[i][c] + (b[i][c] - a[i][c]) * k) * 255)
    for (let i = 0; i < NPAL; i++) data[i * 4 + 3] = 255
    pal.needsUpdate = true
  }
  writePal(BOX, BOX, 1)

  const v3 = (c: RGB) => new THREE.Vector3(...c)
  const u = {
    tPal: { value: pal },
    uPaper: { value: v3(LOOKS.crayon.paper) },
    uInk: { value: v3(LOOKS.crayon.ink) },
    uSize: { value: 1 },
    uTooth: { value: 1 },
    uGrain: { value: 1 },
    uPaperTex: { value: 1 },
    uSnap: { value: 1 },
    uSmudge: { value: 0 },
    uRub: { value: 0 },
    uSoft: { value: 0 },
    uDust: { value: 0 },
    uHigh: { value: 0 },
    uThick: { value: 0 },
    uScratch: { value: 0 },
    uLine: { value: 1 },
    uSheen: { value: 0 },
    uPress: { value: 1 },
    uChalk: { value: 0 },
    uOpacity: { value: 1 },
    uSpacing: { value: 1 },
    uDraw: { value: 1 },
  }
  const apply = (L: Look) => {
    u.uPaper.value.set(...L.paper)
    u.uInk.value.set(...L.ink)
    u.uTooth.value = L.tooth
    u.uGrain.value = L.grain
    u.uPaperTex.value = L.paperTex
    u.uSnap.value = L.snap
    u.uSmudge.value = L.smudge
    u.uRub.value = L.rub
    u.uSoft.value = L.soft
    u.uDust.value = L.dust
    u.uHigh.value = L.high
    u.uThick.value = L.thick
    u.uScratch.value = L.scratch
    u.uLine.value = L.line
    u.uSheen.value = L.sheen
    u.uPress.value = L.press
    u.uChalk.value = L.chalk
    u.uOpacity.value = L.opacity
    u.uSpacing.value = L.spacing
    u.uSize.value = st.size
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    background: crayonMeta.background,
    crayon: st,
    update(dt) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        const e = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, e)
        writePal(st.palFrom, st.palTo, e)
      }
      if (st.drawing) {
        st.draw = Math.min(1, st.draw + dt / DRAW_SECONDS)
        if (st.draw >= 1) st.drawing = false
      }
      u.uDraw.value = st.draw
      st.size += (st.sizeTarget - st.size) * Math.min(1, dt * 6)
      apply(st.cur)
    },
  }
}

export function setCrayonMode(fx: StylizeEffect, mode: CrayonMode) {
  const st = (fx as CrayonEffect).crayon
  if (!st || st.mode === mode) return
  // freeze the current palette mix as the new start
  const data = (fx.uniforms!.tPal.value as THREE.DataTexture).image.data as Uint8Array
  st.palFrom = Array.from({ length: NPAL }, (_, i) => [data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255] as RGB)
  st.palTo = PALETTES[mode]
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** stroke size: 1 = default (≈ 3.3 CSS px rows, 44 px patches); 0.75 fine … 1.45 chunky */
export function setCrayonSize(fx: StylizeEffect, size: number) {
  const st = (fx as CrayonEffect).crayon
  if (st) st.sizeTarget = size
}

/** replay the drawing: outlines, then patch after patch of scribble, shading, highlights */
export function drawCrayon(fx: StylizeEffect) {
  const st = (fx as CrayonEffect).crayon
  if (!st) return
  st.draw = 0
  st.drawing = true
}

/** 0..1 progress of the draw-in (1 when finished) */
export function crayonProgress(fx: StylizeEffect) {
  return (fx as CrayonEffect).crayon?.draw ?? 1
}
