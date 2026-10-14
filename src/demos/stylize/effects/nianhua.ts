import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'
import { WOODBLOCK_GLSL, chromaKeyJs, ease, floatTable, lerp, rgb01 } from './woodblock'

/*
 * 木版年画 — a Chinese New-Year woodblock print (杨柳青 / 桃花坞 / 朱仙镇).
 *
 *  1. 墨线版 key block, printed first: bold black lines wherever depth (1/z Laplacian), normals (creases) or
 *     the colour class (chroma key, see woodblock.ts) change within a radius = half the line width. The radius
 *     swells and thins along the stroke and the sampling point is jittered, so the lines read as cut with a
 *     knife — confident but not mechanical. Neutral darks (hair, lacquer) are part of the key block too.
 *  2. 套色 colour blocks: the scene is classified (lighting-independent hue/saturation) into seven blocks —
 *     黄 红 桃红 绿 蓝 紫 and the hand-painted 开脸 skin wash. Each block samples the scene at its own offset,
 *     i.e. every block is slightly misregistered against the key block, and the transparent water-based inks
 *     multiply where they overlap. Inside a block: wood grain picked up by the ink (each plank its own grain
 *     angle), uneven ink load (patchy, lighter where the block runs out near its edge). 杨柳青 keeps a soft
 *     hand-painted gradient of the modelling and paints pink cheeks (开脸) on faces.
 *  3. 宣纸: warm paper with fibres and mottling.
 *  4. 印刷 (`printNianhua`): blank paper → the key block is rubbed on → each colour block in turn → the hand
 *     painting fades in. Every reprint re-rolls the misregistration.
 *
 * All sizes are CSS px × uDpr. Mode changes morph every parameter and ink on the CPU (one shader path).
 */

export type NianhuaMode = 'yangliuqing' | 'taohuawu' | 'zhuxianzhen'

export const nianhuaModes: { id: NianhuaMode; label: string; en: string }[] = [
  { id: 'yangliuqing', label: '杨柳青', en: 'Yangliuqing' },
  { id: 'taohuawu', label: '桃花坞', en: 'Taohuawu' },
  { id: 'zhuxianzhen', label: '朱仙镇', en: 'Zhuxianzhen' },
]

export const nianhuaMeta = { title: '木版年画', en: 'Woodblock Nianhua', background: '#f5eedc', theme: 'light' as const }

/** the blocks in print order (after the key block) */
export const NIANHUA_BLOCKS = ['黄版', '红版', '桃红版', '绿版', '蓝版', '紫版', '开脸'] as const

// reference scene colours each block is cut for (classified by hue / saturation, not brightness)
const TARGETS = ['#f2c02a', '#d8302a', '#ec6f9a', '#2fa060', '#3a62d0', '#7d55c8', '#f6dcc6']

type Look = {
  inks: string[] // 7 blocks, print order
  key: string
  paper: string
  lineW: number // key line width, CSS px
  mis: number // misregistration, CSS px
  grain: number
  soft: number // hand-painted gradient
  patch: number // uneven ink
  blush: number
}

const LOOKS: Record<NianhuaMode, Look> = {
  // refined: more colours, softer, hand-finished faces
  yangliuqing: {
    inks: ['#f7d35c', '#de4a3a', '#f39db3', '#5fae7c', '#6382c8', '#a67bbd', '#fde6d4'],
    key: '#1d1713',
    paper: '#f5eedc',
    lineW: 2.3,
    mis: 1.5,
    grain: 0.35,
    soft: 0.62,
    patch: 0.25,
    blush: 1,
  },
  // bright, bold contrasting colours, strong wood grain
  taohuawu: {
    inks: ['#ffd31c', '#f0262d', '#f6479c', '#0fa85a', '#2c5fde', '#9a3ab9', '#fcdcc8'],
    key: '#15100c',
    paper: '#f7f0de',
    lineW: 3.0,
    mis: 2.6,
    grain: 1.0,
    soft: 0,
    patch: 0.4,
    blush: 0.55,
  },
  // rustic: very bold lines, four colours, heavy misregistration, tan paper
  zhuxianzhen: {
    inks: ['#f0b62a', '#d0322a', '#d0322a', '#2f8c4c', '#71388a', '#71388a', '#f4e2b8'],
    key: '#120d0a',
    paper: '#e9d5ab',
    lineW: 4.0,
    mis: 5.2,
    grain: 0.75,
    soft: 0,
    patch: 0.8,
    blush: 0,
  },
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;   // 8×2 float: row 0 = inks (blocks 0..6, key ink at 7); row 1 = class targets (xy)
uniform int uNB;          // colour blocks (7) — uniform loop bounds keep ANGLE/FXC from unrolling
uniform int uNT;          // classifier targets (8 = 7 blocks + paper)
uniform float uLineW;
uniform float uMis;
uniform float uGrain;
uniform float uSoft;
uniform float uPatch;
uniform float uBlush;
uniform float uSeed;
uniform float uPrint;     // 0 blank paper … 1 key block printed … 1 + k colour block k printed
uniform vec3 uPaper;

${WOODBLOCK_GLSL}

// soft membership of colour c in block k
float member(vec3 c, int k) {
  vec2 q = chromaKey(c);
  float dk = 1e3, dm = 1e3;
  for (int j = 0; j < uNT; j++) {
    float d = distance(q, texelFetch(tPal, ivec2(j, 1), 0).xy);
    if (j == k) dk = d; else dm = min(dm, d);
  }
  return smoothstep(-0.05, 0.05, dm - dk) * (1.0 - blackness(c, 0.14));
}

// wood grain picked up by the ink: 1 on an ink-starved streak
float woodGrain(vec2 cp, float k) {
  float a = (hash12(vec2(k, 3.1)) - 0.5) * 0.7;
  float ca = cos(a), sa = sin(a);
  vec2 r = vec2(ca * cp.x + sa * cp.y, -sa * cp.x + ca * cp.y);
  float w = r.y / 4.6 + 2.6 * fbm2(r * vec2(0.0035, 0.018) + k * 7.0) + 0.5 * vnoise(r * vec2(0.03, 0.2));
  float f = abs(fract(w) - 0.5) * 2.0;
  float streak = 1.0 - smoothstep(0.0, 0.42, f);
  float band = smoothstep(0.38, 0.78, vnoise(r * vec2(0.008, 0.05) + k * 3.0));
  return clamp(streak * (0.35 + 0.65 * band) + 0.3 * band, 0.0, 1.0);
}

// rubbing reveal for print stage progress p (0..1); dir alternates per block
float rub(vec2 px, vec2 cp, float p, float k) {
  if (p >= 1.0) return 1.0;
  if (p <= 0.0) return 0.0;
  float a = k * 2.39996 + 0.6;
  vec2 d = vec2(cos(a), sin(a));
  vec2 uv = (px / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float wc = dot(uv, d) / 1.6 + 0.5 + (fbm2(cp * vec2(0.004, 0.03) + k * 5.0) - 0.5) * 0.22;
  float x = p * 1.3 - 0.15;
  return smoothstep(wc - 0.05, wc + 0.01, x);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;

  /* --- key block: lines ------------------------------------------------ */
  float wob = 0.7 + 0.6 * fbm2(cp * 0.028 + uSeed * 3.0);
  float r = max(0.85, uLineW * 0.5 * wob) * uDpr;
  vec2 p0 = px + (vec2(vnoise(cp * 0.23), vnoise(cp * 0.23 + 7.7)) - 0.5) * 1.1 * uDpr;
  float i0 = idepthL(p0);
  vec4 n0 = normalL(p0);
  vec3 c0 = sceneL(p0);
  vec2 k0 = chromaKey(c0);
  float b0 = blackness(c0, 0.14);
  float s0 = specular(c0);
  float lap = 0.0, crease = 0.0, colr = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 0.7853982 + 0.2;
    vec2 d = vec2(cos(a), sin(a)) * r * (i == 1 || i == 3 ? 0.85 : 1.0);
    vec2 pa = p0 + d, pb = p0 - d;
    float ia = idepthL(pa), ib = idepthL(pb);
    lap = max(lap, abs(ia + ib - 2.0 * i0) / max(i0, max(ia, ib)));
    vec4 na = normalL(pa), nb = normalL(pb);
    if (n0.w > 0.5 && na.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, na.xyz));
    if (n0.w > 0.5 && nb.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, nb.xyz));
    crease = max(crease, abs(na.w - nb.w) * 2.0);
    vec3 ca = sceneL(pa), cb = sceneL(pb);
    // highlights have no colour of their own: no colour edge into or out of them (depth / creases still ink)
    colr = max(colr, (distance(chromaKey(ca), k0) + abs(blackness(ca, 0.14) - b0)) * (1.0 - max(s0, specular(ca))));
    colr = max(colr, (distance(chromaKey(cb), k0) + abs(blackness(cb, 0.14) - b0)) * (1.0 - max(s0, specular(cb))));
  }
  float line = max(max(smoothstep(0.025, 0.07, lap), smoothstep(0.22, 0.42, crease)), smoothstep(0.26, 0.44, colr));
  // solid black areas (hair, lacquer) belong to the key block; no misregistration
  float key = max(line, b0);
  key *= rub(px, cp, clamp(uPrint, 0.0, 1.0), -1.0);
  key *= (0.9 + 0.1 * vnoise(cp * 0.31)) * (1.0 - 0.55 * step(0.9, vnoise(cp * 0.55 + 3.3)));

  /* --- paper ----------------------------------------------------------- */
  float fib = paperFibres(cp, 1.0);
  vec3 col = uPaper * (1.0 + fib);

  /* --- colour blocks, overprinted --------------------------------------- */
  vec4 N = normalL(px);
  for (int k = 0; k < uNB; k++) {
    float fk = float(k);
    float pk = clamp((uPrint - 1.0 - fk) * 1.35, 0.0, 1.0);
    if (pk <= 0.0) continue;
    bool hand = k == uNB - 1;    // the last block is the hand-painted face wash (开脸)
    vec2 h = vec2(hash12(vec2(fk * 7.1 + 1.3, uSeed)), hash12(vec2(fk * 3.7 + 9.1, uSeed + 4.2))) - 0.5;
    vec2 q = px - h * 2.0 * uMis * uDpr * (hand ? 0.3 : 1.0);
    float ang = hash12(vec2(fk, 5.5)) * 6.283;
    vec2 dir = vec2(cos(ang), sin(ang)) * 4.5 * uDpr;
    float m = 0.0, me = 1.0, sp = 0.0;
    vec3 cq = vec3(0.0);
    for (int j = 0; j < 3; j++) {           // 0: the block here · 1, 2: probes for the block's edge
      vec2 qj = q + (j == 0 ? vec2(0.0) : (j == 1 ? dir : -dir));
      vec3 c = sceneL(qj);
      float mm = member(c, k);
      if (j == 0) { m = mm; cq = c; sp = specular(c); } else me = min(me, mm);
    }
    // a small highlight enclosed by this block (both probes inside it) is printed over, not left as a hole
    m = max(m, sp * me);
    me = max(me, sp);
    if (m < 0.003) continue;
    float rev = hand ? smoothstep(0.0, 1.0, pk) : rub(px, cp, pk, fk);
    float load = 1.0 - uPatch * 0.5 * smoothstep(0.3, 0.85, fbm2(cp * 0.007 + fk * 13.0));
    load *= 1.0 - uPatch * 0.18 * vnoise(cp * 0.09 + fk);
    vec3 ink = texelFetch(tPal, ivec2(k, 0), 0).rgb;
    if (hand) {
      // 开脸: soft pink on the cheeks — where a round face turns sideways, a little below its middle
      vec2 cv = vec2(abs(N.x) - 0.48, N.y + 0.22);
      float bl = uBlush * exp(-dot(cv, cv) / 0.045) * step(0.5, N.w);
      ink = mix(ink, vec3(0.95, 0.52, 0.58), clamp(bl, 0.0, 1.0) * 0.75);
    } else {
      load *= 1.0 - 0.32 * (1.0 - me);                         // thinner where the block runs out
      load *= 1.0 - uGrain * 0.5 * woodGrain(cp, fk);
    }
    // 杨柳青: hand-finished gradients keep a little of the modelling
    float V = max(max(cq.r, cq.g), cq.b);
    ink *= mix(1.0, mix(0.74, 1.05, smoothstep(0.15, 0.85, V)), uSoft);
    float a = clamp(m * load * rev * (1.0 - max(fib, 0.0) * 1.6), 0.0, 1.0);
    col *= mix(vec3(1.0), ink, a);                              // transparent inks multiply
  }

  vec3 keyInk = texelFetch(tPal, ivec2(7, 0), 0).rgb;
  return mix(col, keyInk, clamp(key, 0.0, 1.0));
}
`

/* ------------------------------------------------------------------ factory + controls */

type State = { mode: NianhuaMode; from: Look; to: Look; k: number; print: number; printing: boolean; scale: number }
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

const KEY_TIME = 1.2 // s for the key block
const BLOCK_TIME = 0.62 // s per colour block (incl. a short pause)
const DONE = 1 + NIANHUA_BLOCKS.length + 0.2

export function createNianhuaEffect(init: { mode?: NianhuaMode } = {}): StylizeEffect {
  const mode = init.mode ?? 'yangliuqing'
  const pal = floatTable(8, 2)
  TARGETS.forEach((hex, i) => pal.set(i, 1, [...chromaKeyJs(hex), 0, 1]))
  pal.set(7, 1, [0, 0, 0, 1]) // paper: neutral
  const uniforms: U = {
    tPal: { value: pal.tex },
    uNB: { value: 7 },
    uNT: { value: 8 },
    uLineW: { value: 2 },
    uMis: { value: 2 },
    uGrain: { value: 0.5 },
    uSoft: { value: 0 },
    uPatch: { value: 0.3 },
    uBlush: { value: 1 },
    uSeed: { value: 0.37 },
    uPrint: { value: 99 },
    uPaper: { value: new THREE.Vector3() },
  }
  const st: State = { mode, from: LOOKS[mode], to: LOOKS[mode], k: 1, print: 99, printing: false, scale: 1 }
  STATE.set(uniforms, st)
  const c0 = new THREE.Color()
  const c1 = new THREE.Color()
  const mixHex = (a: string, b: string, t: number): [number, number, number] => {
    c0.setRGB(...rgb01(a))
    c1.setRGB(...rgb01(b))
    c0.lerp(c1, t)
    return [c0.r, c0.g, c0.b]
  }
  const apply = () => {
    const t = ease(st.k)
    const A = st.from
    const B = st.to
    for (let i = 0; i < 7; i++) pal.set(i, 0, mixHex(A.inks[i], B.inks[i], t))
    pal.set(7, 0, mixHex(A.key, B.key, t))
    pal.tex.needsUpdate = true
    ;(uniforms.uPaper.value as THREE.Vector3).set(...mixHex(A.paper, B.paper, t))
    uniforms.uLineW.value = lerp(A.lineW, B.lineW, t) * st.scale
    uniforms.uMis.value = lerp(A.mis, B.mis, t) * st.scale
    uniforms.uGrain.value = lerp(A.grain, B.grain, t)
    uniforms.uSoft.value = lerp(A.soft, B.soft, t)
    uniforms.uPatch.value = lerp(A.patch, B.patch, t)
    uniforms.uBlush.value = lerp(A.blush, B.blush, t)
  }
  apply()
  return {
    frag: FRAG,
    uniforms,
    normals: true,
    background: nianhuaMeta.background,
    update(dt) {
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        apply()
      }
      if (st.printing) {
        st.print += dt / (st.print < 1 ? KEY_TIME : BLOCK_TIME)
        if (st.print >= DONE) {
          st.print = 99
          st.printing = false
        }
      }
      uniforms.uPrint.value = st.print
    },
  }
}

/** switch workshop style (every ink and parameter morphs over ~0.9 s) */
export function setNianhuaMode(fx: StylizeEffect, mode: NianhuaMode) {
  const st = stateOf(fx)
  if (!st || st.mode === mode) return
  const t = ease(st.k)
  // start from wherever a running morph is
  const cur = st.from
  const nxt = st.to
  const mid: Look = {
    inks: cur.inks.map((h, i) => '#' + new THREE.Color().setRGB(...rgb01(h)).lerp(new THREE.Color().setRGB(...rgb01(nxt.inks[i])), t).getHexString()),
    key: '#' + new THREE.Color().setRGB(...rgb01(cur.key)).lerp(new THREE.Color().setRGB(...rgb01(nxt.key)), t).getHexString(),
    paper: '#' + new THREE.Color().setRGB(...rgb01(cur.paper)).lerp(new THREE.Color().setRGB(...rgb01(nxt.paper)), t).getHexString(),
    lineW: lerp(cur.lineW, nxt.lineW, t),
    mis: lerp(cur.mis, nxt.mis, t),
    grain: lerp(cur.grain, nxt.grain, t),
    soft: lerp(cur.soft, nxt.soft, t),
    patch: lerp(cur.patch, nxt.patch, t),
    blush: lerp(cur.blush, nxt.blush, t),
  }
  st.mode = mode
  st.from = mid
  st.to = LOOKS[mode]
  st.k = 0
}

/** scale line widths + misregistration (e.g. 0.7 when the print is shown small on a phone) */
export function setNianhuaScale(fx: StylizeEffect, k: number) {
  const st = stateOf(fx)
  if (!st || Math.abs(st.scale - k) < 1e-3) return
  st.scale = k
  const u = fx.uniforms as U
  const t = ease(st.k)
  u.uLineW.value = lerp(st.from.lineW, st.to.lineW, t) * k
  u.uMis.value = lerp(st.from.mis, st.to.mis, t) * k
}

/** 印刷: start from blank paper, rub on the key block, then every colour block in turn (≈ 5.6 s);
 *  each run rolls a fresh misregistration */
export function printNianhua(fx: StylizeEffect) {
  const st = stateOf(fx)
  if (!st) return
  st.print = 0
  st.printing = true
  ;(fx.uniforms as U).uSeed.value = Math.random() * 10
  ;(fx.uniforms as U).uPrint.value = 0
}

/** where the print run is: stage -1 = done, 0 = key block, 1..7 = colour block index + 1 */
export function nianhuaPrintStage(fx: StylizeEffect): { stage: number; label: string } {
  const st = stateOf(fx)
  if (!st || !st.printing) return { stage: -1, label: '' }
  if (st.print < 1) return { stage: 0, label: '墨线版' }
  const i = Math.min(NIANHUA_BLOCKS.length - 1, Math.floor(st.print - 1))
  return { stage: i + 1, label: NIANHUA_BLOCKS[i] }
}
