import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 水彩晕染 — washes of transparent pigment on cold-press paper.
 *
 *  · flow: sampling is displaced by low-frequency turbulence (colour creeps across soft edges) plus a
 *    finer "hand tremor"; while a wash is wet the flow keeps moving.
 *  · abstraction: a bilateral-ish blur (2 rings × 8 taps, weighted by colour similarity) flattens the
 *    scene into washes; the same taps + an outer ring give a near / wide blur for bleeding and pooling.
 *  · pigment: Beer–Lambert — absorbance A = −log(colour), the paper colour is multiplied by exp(−A·k).
 *    Near-white scene colours have A ≈ 0, so highlights are the paper itself (never white paint).
 *    k carries everything physical: edge darkening (pixel denser than its blurred surroundings → pigment
 *    pooled at the border as the wash dried), granulation (pigment settles in the paper's valleys),
 *    glaze layers (dry mode posterizes the density into stacked washes, each with a hard dark rim) and
 *    the vignette that lets the painting fade out into untouched paper.
 *  · drying: a 0..1.8 progress drives a noise front that "lays" the washes from wet edges; the fresh
 *    front carries a cauliflower backrun, wet areas bleed more and only grow their dark rims as they dry.
 *  · lines: depth / normal edges as a faint pencil underdrawing, or loose ink in the 速写 mode.
 *  · modes are numbers interpolated on the CPU; a mode change also re-blooms the painting.
 */

export const watercolorModes = [
  { id: 'wet', label: '湿画' },
  { id: 'dry', label: '干画' },
  { id: 'sketch', label: '速写' },
] as const
export type WatercolorMode = (typeof watercolorModes)[number]['id']

export const watercolorMeta = { title: '水彩晕染', en: 'Watercolor', background: '#f6f2ea', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  bleed: number // turbulent displacement, CSS px
  soft: number // wet softness (mix toward the wide blur)
  blur: number // abstraction radius, CSS px
  edge: number // edge darkening
  gran: number // granulation
  glaze: number // posterized glaze layers
  ink: number // ink contour lines
  pencil: number // pencil underdrawing
  washK: number // pigment density
  loose: number // loose wash: misregistered, patchy
  sat: number
}

const LOOKS: Record<WatercolorMode, Look> = {
  wet: { bleed: 9, soft: 0.62, blur: 7, edge: 0.75, gran: 0.4, glaze: 0, ink: 0, pencil: 0.3, washK: 0.82, loose: 0, sat: 1.05 },
  dry: { bleed: 2.2, soft: 0.05, blur: 4.5, edge: 1.0, gran: 0.75, glaze: 0.85, ink: 0, pencil: 0.42, washK: 0.88, loose: 0, sat: 1.0 },
  sketch: { bleed: 4.5, soft: 0.25, blur: 6, edge: 0.8, gran: 0.45, glaze: 0.25, ink: 1, pencil: 0, washK: 0.72, loose: 1, sat: 1.0 },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number>
  for (const key of Object.keys(a) as (keyof Look)[]) o[key] = a[key] + (b[key] - a[key]) * k
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uInkCol;
uniform float uBleed;
uniform float uSoft;
uniform float uBlur;
uniform float uEdge;
uniform float uGran;
uniform float uGlaze;
uniform float uInk;
uniform float uPencil;
uniform float uWashK;
uniform float uLoose;
uniform float uSat;
uniform float uAmount;   // visitor's 晕染程度
uniform float uReveal;   // 0 → 1.8 drying progress
uniform float uFlowT;    // flow clock (only advances while wet)
uniform vec2 uVigC;      // vignette centre, uv (y up)
uniform float uVigR;     // vignette radius, fraction of the short side
uniform float uVig;

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

/* cold-press paper: rounded tooth at two scales + a few long fibres */
float paperH(vec2 cp) {
  float g = vnoise(cp * 0.36) * 0.5 + vnoise(cp * 0.8 + 7.0) * 0.32 + vnoise(cp * 1.7 + 3.0) * 0.18;
  vec2 r1 = rot(0.6) * cp;
  vec2 r2 = rot(-0.95) * cp;
  float f1 = vnoise(vec2(r1.x * 0.035, r1.y * 1.15));
  float f2 = vnoise(vec2(r2.x * 0.045, r2.y * 1.3) + 11.0);
  float fib = smoothstep(0.78, 0.97, max(f1, f2));
  return g + fib * 0.22;
}

/* depth Laplacian + normal Sobel edges (r in device px) */
float edgeAt(vec2 p, float r) {
  float d0 = depthAt(p);
  float d1 = depthAt(p + vec2(r, 0.0));
  float d2 = depthAt(p - vec2(r, 0.0));
  float d3 = depthAt(p + vec2(0.0, r));
  float d4 = depthAt(p - vec2(0.0, r));
  float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
  vec3 n1 = normalAt(p + vec2(r, 0.0));
  vec3 n2 = normalAt(p - vec2(r, 0.0));
  vec3 n3 = normalAt(p + vec2(0.0, r));
  vec3 n4 = normalAt(p - vec2(0.0, r));
  float en = length(n1 - n2) + length(n3 - n4);
  return max(smoothstep(0.02, 0.06, lap), smoothstep(0.55, 1.1, en));
}

vec3 absorb(vec3 c) { return -log(clamp(c, 0.035, 1.0)); }

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;

  /* drying front: washes are laid along a noise field; the fresh edge carries a backrun */
  float field = 0.66 * fbm(cp / 300.0 + 3.1) + 0.34 * fbm(cp / 70.0 + 9.7);
  field = clamp((field - 0.22) / 0.56, 0.0, 1.0);
  float cauli = fbm(cp / 7.0 + 5.0);
  float local = uReveal - field + (cauli - 0.5) * 0.07;
  float painted = smoothstep(-0.012, 0.012, local);
  float front = painted * exp(-max(local, 0.0) / 0.045);
  float wet = painted * clamp(1.0 - local / 0.55, 0.0, 1.0);

  /* flow + tremor */
  float amt = uAmount;
  vec2 flow = vec2(fbm(cp / 95.0 + vec2(0.0, uFlowT * 0.12)), fbm(cp / 95.0 + vec2(31.7, 7.3) - uFlowT * 0.1)) - 0.5;
  vec2 trem = vec2(vnoise(cp / 22.0 + 4.0), vnoise(cp / 22.0 + 13.0)) - 0.5;
  vec2 disp = flow * uBleed * amt * (1.6 + 1.6 * wet) + trem * 2.6;
  vec2 loose = vec2(4.5, -3.0) * uLoose;
  vec2 q = px + (disp + loose) * uDpr;

  /* wash abstraction: bilateral rings + near / wide blur from the same taps */
  float R = uBlur * (0.75 + 0.5 * amt) * uDpr;
  vec3 c0 = sceneAt(q);
  vec3 acc = c0, near = c0, wide = vec3(0.0), outer = vec3(0.0);
  float wacc = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + 0.3;
    vec2 d = vec2(cos(a), sin(a));
    vec3 c1 = sceneAt(q + d * R * 0.5);
    vec3 c2 = sceneAt(q + d * R);
    vec3 c3 = sceneAt(q + rot(0.39) * d * R * 2.3);
    vec3 e1 = c1 - c0, e2 = c2 - c0;
    float w1 = exp(-dot(e1, e1) * 28.0);
    float w2 = exp(-dot(e2, e2) * 28.0);
    acc += c1 * w1 + c2 * w2;
    wacc += w1 + w2;
    near += c1;
    outer += c2;
    wide += c3;
  }
  vec3 sharp = acc / wacc;
  wide = (near + outer + wide * 2.0) / 33.0;
  near = (near + outer * 0.5) / 13.0;
  float soft = clamp(uSoft * (0.6 + 0.4 * amt) + wet * 0.45, 0.0, 1.0);
  vec3 wash = mix(sharp, wide, soft * 0.85);

  /* pigment absorbance (highlights lift to bare paper) */
  vec3 A = absorb(wash) - absorb(uPaper);
  float Am = dot(A, vec3(0.3333));
  float chroma = length(A - Am);
  A = max(mix(vec3(Am), A, uSat) - 0.045, 0.0);
  float D = dot(A, vec3(0.3333));
  // neutral shadows become a cool violet-blue wash, as a painter would mix them
  A += vec3(0.2, 0.1, -0.06) * D * (1.0 - smoothstep(0.05, 0.3, chroma));

  /* glazes: posterize the density into stacked washes, each with its own dark rim */
  float x = D * 2.6 + (fbm(cp / 80.0 + 50.0) - 0.5) * 0.55;
  float fl = floor(x);
  float fr = fract(x);
  float fw = max(fwidth(x), 1e-4);
  float Dq = (fl + smoothstep(0.5 - fw * 1.2, 0.5 + fw * 1.2, fr)) / 2.6 + 0.05 * smoothstep(0.02, 0.1, D);
  float rim = (1.0 - smoothstep(0.0, fw * 2.5 * uDpr, fr - 0.5)) * step(0.5, fr) * step(0.03, D);
  A *= mix(1.0, clamp(Dq / max(D, 0.02), 0.0, 3.0), uGlaze * smoothstep(0.01, 0.06, D));

  /* edge darkening: denser than the blurred surroundings → pigment pooled there while drying */
  vec3 An = max(absorb(near) - absorb(uPaper), 0.0);
  vec3 As = max(absorb(sharp) - absorb(uPaper), 0.0);
  float pool = dot(As - An, vec3(0.3333)) + 0.35 * length(As - An);
  pool = smoothstep(0.02, 0.3, pool);
  float dryness = 1.0 - wet;

  /* paper */
  float hp = paperH(cp);
  float hx = paperH(cp + vec2(1.0, 0.0));
  float hy = paperH(cp + vec2(0.0, 1.0));

  float k = uWashK;
  k *= 1.0 + uEdge * (pool * 0.5 * dryness + rim * uGlaze * 0.45 * dryness);
  k *= 1.0 + uGran * (0.5 - hp) * 1.5 * smoothstep(0.03, 0.35, D);
  k *= 1.0 + (fbm(cp / 14.0 + 21.0) - 0.5) * 0.35 * uGran; // flocculation
  k *= 1.0 + wet * 0.18;                                  // wet paint is darker
  k *= 1.0 + front * (0.9 + 0.8 * cauli) * 1.3;            // backrun at the drying front
  k *= 1.0 - 0.22 * smoothstep(0.03, 0.12, local) * (1.0 - smoothstep(0.12, 0.3, local)) * (1.0 - cauli); // bloom pale inside
  // loose: some patches left unpainted, the wash stops short of the lines
  float patchy = smoothstep(0.32, 0.6, fbm(cp / 130.0 + 40.0));
  k *= mix(1.0, 0.25 + 0.75 * patchy, uLoose * 0.8);
  // vignette into bare paper, with a ragged brushy border
  vec2 vc = uVigC * res;
  float r = length(cp - vc) / min(res.x, res.y);
  r += (fbm(cp / 45.0 + 70.0) - 0.5) * 0.16 + (vnoise(cp / 9.0) - 0.5) * 0.03;
  float vmask = 1.0 - smoothstep(uVigR, uVigR + 0.1, r);
  k *= mix(1.0, vmask, uVig);
  k *= painted;

  vec3 col = uPaper * exp(-A * k);

  /* lines: pencil underdrawing / loose ink */
  float lineAmt = max(uPencil, uInk);
  if (lineAmt > 0.01) {
    vec2 j = (vec2(vnoise(cp * 0.05 + 2.0), vnoise(cp * 0.05 + 9.0)) - 0.5) * 3.0
           + (vec2(vnoise(cp * 0.3), vnoise(cp * 0.3 + 5.0)) - 0.5) * 0.8;
    float e = edgeAt(px + j * uDpr, max(uDpr * mix(0.9, 1.15, uInk), 0.75));
    float press = 0.55 + 0.45 * vnoise(cp * 0.035 + 30.0);
    float lift = smoothstep(0.1, 0.3, vnoise(cp * 0.06 + 12.0));
    float ln = e * press * mix(1.0, lift, 0.8);
    float vm = mix(1.0, smoothstep(0.0, 0.7, vmask + 0.08), uVig);
    // graphite: grey, only catches the paper tooth
    float pencil = ln * uPencil * 0.42 * smoothstep(0.25, 0.75, hp + 0.25) * vm;
    col *= 1.0 - pencil * vec3(0.62, 0.6, 0.58);
    float ink = smoothstep(0.15, 0.5, ln) * uInk * vm;
    col = mix(col, uInkCol * (0.85 + 0.3 * hp), ink * 0.92);
  }

  /* paper relief, lit from the upper left */
  float shade = ((hp - hx) * 0.8 + (hy - hp) * 0.8) * 0.09;
  col *= 1.0 + shade;
  col *= 1.0 - 0.025 * (fbm(cp / 220.0) - 0.5);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const REVEAL_END = 1.8
const REVEAL_DUR = 6.5

type WcState = { from: Look; to: Look; cur: Look; k: number; amount: number; amountTarget: number; mode: WatercolorMode; t: number; flowT: number }
export type WatercolorEffect = StylizeEffect & { wc: WcState }

export function createWatercolorEffect(): WatercolorEffect {
  const st: WcState = { from: LOOKS.wet, to: LOOKS.wet, cur: LOOKS.wet, k: 1, amount: 1, amountTarget: 1, mode: 'wet', t: 0, flowT: 0 }
  const u = {
    uPaper: { value: new THREE.Vector3(0.965, 0.95, 0.918) },
    uInkCol: { value: new THREE.Vector3(0.17, 0.14, 0.13) },
    uBleed: { value: 0 },
    uSoft: { value: 0 },
    uBlur: { value: 5 },
    uEdge: { value: 0 },
    uGran: { value: 0 },
    uGlaze: { value: 0 },
    uInk: { value: 0 },
    uPencil: { value: 0 },
    uWashK: { value: 1 },
    uLoose: { value: 0 },
    uSat: { value: 1 },
    uAmount: { value: 1 },
    uReveal: { value: 0 },
    uFlowT: { value: 0 },
    uVigC: { value: new THREE.Vector2(0.5, 0.5) },
    uVigR: { value: 0.56 },
    uVig: { value: 1 },
  }
  const apply = (L: Look) => {
    u.uBleed.value = L.bleed
    u.uSoft.value = L.soft
    u.uBlur.value = L.blur
    u.uEdge.value = L.edge
    u.uGran.value = L.gran
    u.uGlaze.value = L.glaze
    u.uInk.value = L.ink
    u.uPencil.value = L.pencil
    u.uWashK.value = L.washK
    u.uLoose.value = L.loose
    u.uSat.value = L.sat
    u.uAmount.value = st.amount
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    wc: st,
    update(dt) {
      st.t += dt
      const p = Math.min(1, st.t / REVEAL_DUR)
      // eases in (the first washes go down on bare paper), then slows as the last ones settle
      const e = 0.35 * (1 - Math.pow(1 - p, 2)) + 0.65 * p * p * (3 - 2 * p)
      u.uReveal.value = 0.04 + e * (REVEAL_END - 0.04)
      // the flow only creeps while something is still wet
      st.flowT += dt * (1 - p)
      u.uFlowT.value = st.flowT
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        const s = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, s)
      }
      st.amount += (st.amountTarget - st.amount) * Math.min(1, dt * 5)
      apply(st.cur)
    },
  }
}

/** 0 → 1 while the painting blooms in and dries (1 = settled) */
export function watercolorProgress(fx: StylizeEffect) {
  const st = (fx as WatercolorEffect).wc
  return st ? Math.min(1, st.t / REVEAL_DUR) : 1
}

/** start the bloom-in from bare paper again */
export function rebloomWatercolor(fx: StylizeEffect) {
  const st = (fx as WatercolorEffect).wc
  if (st) st.t = 0
}

/** skip the bloom (posters, reduced motion) */
export function settleWatercolor(fx: StylizeEffect) {
  const st = (fx as WatercolorEffect).wc
  if (st) st.t = REVEAL_DUR * 2
}

export function setWatercolorMode(fx: StylizeEffect, mode: WatercolorMode, bloom = true) {
  const st = (fx as WatercolorEffect).wc
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
  if (bloom) st.t = 0
}

/** 晕染程度: bleed / softness multiplier, 1 = default (0.5 … 1.6) */
export function setWatercolorBleed(fx: StylizeEffect, amount: number) {
  const st = (fx as WatercolorEffect).wc
  if (st) st.amountTarget = amount
}

/** where the painting fades into bare paper: centre (uv, y up), radius (× short side), strength 0..1 */
export function setWatercolorVignette(fx: StylizeEffect, x: number, y: number, radius = 0.56, strength = 1) {
  const u = fx.uniforms
  if (!u) return
  ;(u.uVigC.value as THREE.Vector2).set(x, y)
  u.uVigR.value = radius
  u.uVig.value = strength
}
