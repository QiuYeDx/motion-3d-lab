import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'
import { WOODBLOCK_GLSL, chromaKeyJs, ease, floatTable, lerp, rgb01 } from './woodblock'

/*
 * 浮世绘 — an Edo woodblock print (北斋 / 广重 / 美人画).
 *
 *  · 輪郭 outline block: thin, crisp, even lines in indigo / sumi wherever depth, normals or the colour class
 *    change (a hairline with soft AA; specular highlights never make a line). Unlike nianhua.ts there is no
 *    misregistration: the kento marks kept every block in register.
 *  · flat colour blocks from a small Edo palette — Prussian blue, indigo, beni red, ochre, pale green, flesh —
 *    chosen by the scene's lighting-independent hue class, then printed in at most three flat tones of that
 *    colour (the value structure of the render quantised into dark / mid / light, with crisp edges).
 *  · ぼかし bokashi: a graded wash across the sky (dark band at the top fading into the paper; 广重 adds a warm
 *    band low on the horizon), and water that deepens toward the horizon (by view depth). 广重 also lets far
 *    things fade into the mist.
 *  · 和紙 washi: fibres, a faint yellowing toward the edges, sparse foxing, wood grain only where colour lies flat
 *    over a large area (the sky), and in 美人画 a mica (雲母摺) ground that glitters.
 *  · optional sheet frame (`setUkiyoeFrame`): thin border rule, plain margin, kento registration marks.
 *
 * Every mode only changes table rows + uniforms (CPU-morphed), so one shader path runs for all of them.
 */

export type UkiyoeMode = 'hokusai' | 'hiroshige' | 'bijinga'

export const ukiyoeModes: { id: UkiyoeMode; label: string; en: string }[] = [
  { id: 'hokusai', label: '北斋', en: 'Hokusai' },
  { id: 'hiroshige', label: '广重', en: 'Hiroshige' },
  { id: 'bijinga', label: '美人画', en: 'Bijin-ga' },
]

export const ukiyoeMeta = { title: '浮世绘', en: 'Ukiyo-e', background: '#efe4cc', theme: 'light' as const }

// classes: the reference scene colour each block is cut for (hue class; 6 = neutral → paper)
const TARGETS = ['#2f5f9e', '#5a9a70', '#c23a2c', '#c8913a', '#f1dcbf', '#7a5a9a']

type Look = {
  tiers: string[][] // 7 classes × [dark, mid, light]
  sumi: string
  line: string
  sky: string
  horizon: string
  mica: string
  paper: string
  lo: number
  hi: number
  skyAmt: number
  skyLo: number
  horizAmt: number
  haze: number
  water: number
  micaAmt: number
  lineK: number
  grain: number
}

const SKIN = ['#d9b48e', '#f0d9b9', '#f6e8d0']
const LOOKS: Record<UkiyoeMode, Look> = {
  // strong Prussian blue, dynamic contrast
  hokusai: {
    tiers: [
      ['#1a3160', '#2b5592', '#8fb6d0'],
      ['#4b673a', '#8aa06a', '#c3ca9a'],
      ['#8c2a22', '#bf3b2c', '#de8b6f'],
      ['#7a5230', '#c38d45', '#e4c28b'],
      SKIN,
      ['#4a3a5e', '#76628c', '#b3a3bf'],
      ['#bfcbd0', '#efe4cc', '#efe4cc'],
    ],
    sumi: '#1f1d1b',
    line: '#1b2645',
    sky: '#2a4d84',
    horizon: '#e8b48a',
    mica: '#e6ddd5',
    paper: '#efe4cc',
    lo: 0.3,
    hi: 0.72,
    skyAmt: 0.95,
    skyLo: 0.58,
    horizAmt: 0,
    haze: 0.08,
    water: 0.85,
    micaAmt: 0,
    lineK: 1,
    grain: 1,
  },
  // softer bokashi skies, atmosphere, more greens
  hiroshige: {
    tiers: [
      ['#24406c', '#4d79a6', '#a8c5d6'],
      ['#3c6943', '#7ea86a', '#bfd4a2'],
      ['#9a3428', '#cc4b36', '#e9a184'],
      ['#86603a', '#c99a55', '#e8cd98'],
      SKIN,
      ['#5a4a6e', '#8c7aa2', '#c6b8cf'],
      ['#cbd5d2', '#f0e6cf', '#f0e6cf'],
    ],
    sumi: '#28241f',
    line: '#2a2c38',
    sky: '#3b5f90',
    horizon: '#e7a27c',
    mica: '#e6ddd5',
    paper: '#f0e6cf',
    lo: 0.3,
    hi: 0.68,
    skyAmt: 0.8,
    skyLo: 0.42,
    horizAmt: 0.6,
    haze: 0.6,
    water: 1,
    micaAmt: 0,
    lineK: 0.95,
    grain: 0.8,
  },
  // pale palette, very fine lines, mica ground
  bijinga: {
    tiers: [
      ['#647e9e', '#a0b5c8', '#d0dbe2'],
      ['#7c9273', '#b0c1a0', '#d8dfc7'],
      ['#ad544a', '#d98a7c', '#efc3b3'],
      ['#a48357', '#d2b688', '#ecdcb8'],
      ['#e5c9b0', '#f5e6d4', '#faf0e4'],
      ['#8a7794', '#b8a7c0', '#ddd0e0'],
      ['#d8d2c8', '#f3ebdd', '#f3ebdd'],
    ],
    sumi: '#2c2522',
    line: '#4a3933',
    sky: '#cfc6d2',
    horizon: '#e7c3b6',
    mica: '#e9e0d8',
    paper: '#f3ebdd',
    lo: 0.28,
    hi: 0.66,
    skyAmt: 0,
    skyLo: 0.6,
    horizAmt: 0,
    haze: 0,
    water: 0.25,
    micaAmt: 1,
    lineK: 0.6,
    grain: 0.4,
  },
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;   // 8×4 float: rows 0..2 = tiers dark/mid/light for classes 0..6 (6 = paper);
                          // column 7: sumi, line, sky; row 3 = class targets (xy)
uniform int uNT;          // classes (7)
uniform float uLineW;     // CSS px
uniform float uLo, uHi;   // tone thresholds (scene value)
uniform float uSkyAmt, uSkyLo, uHorizAmt, uHorizY, uHaze, uWater, uMica, uGrain;
uniform vec2 uDepthRange; // view depth: near … horizon (water bokashi / haze)
uniform vec3 uPaper, uHorizon, uMicaCol;
uniform vec4 uFrame;      // x, y, w, h in CSS px from the top left
uniform float uFrameOn;

${WOODBLOCK_GLSL}

int classOf(vec3 c) {
  vec2 q = chromaKey(c);
  int best = 0;
  float bd = 1e3;
  for (int j = 0; j < uNT; j++) {
    vec2 t = j == uNT - 1 ? vec2(0.0) : texelFetch(tPal, ivec2(j, 3), 0).xy;
    float d = distance(q, t);
    if (d < bd) { bd = d; best = j; }
  }
  return best;
}

float sdBox(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
// a 1-px-ish ink segment from a to b (CSS px), returns coverage
float seg(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, length(pa - ba * h));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 tl = vec2(cp.x, uRes.y / uDpr - cp.y);           // CSS px from the top left
  vec2 fc = uFrameOn > 0.5 ? uFrame.xy + uFrame.zw * 0.5 : uRes / uDpr * 0.5;
  vec2 fh = uFrameOn > 0.5 ? uFrame.zw * 0.5 : uRes / uDpr * 0.5;
  vec2 fp = tl - fc;
  float inside = uFrameOn > 0.5 ? step(sdBox(fp, fh), 0.0) : 1.0;
  float ty = clamp(0.5 - fp.y / (2.0 * fh.y), 0.0, 1.0);  // 0 bottom … 1 top of the picture

  /* --- paper ----------------------------------------------------------- */
  float fib = paperFibres(cp, 2.0);
  vec3 paper = uPaper * (1.0 + fib);
  // yellowing toward the sheet edges + sparse foxing
  vec2 sq = (tl / (uRes / uDpr)) - 0.5;
  float edge = smoothstep(0.32, 0.7, max(abs(sq.x), abs(sq.y)) + 0.08 * (vnoise(cp * 0.01) - 0.5));
  paper *= mix(vec3(1.0), vec3(0.96, 0.92, 0.82), edge * 0.6);
  // foxing: a few small rust specks, soft-edged, clustered loosely
  vec2 fg = floor(cp / 38.0);
  vec2 fo = (vec2(hash12(fg + 1.7), hash12(fg + 9.1)) - 0.5) * 26.0;
  float fr = 1.2 + 2.6 * hash12(fg + 4.4);
  float fox = (1.0 - smoothstep(fr * 0.4, fr, length(cp - (fg + 0.5) * 38.0 - fo))) * step(0.86, hash12(fg + 2.3));
  paper *= mix(vec3(1.0), vec3(0.84, 0.7, 0.52), fox * 0.32);

  if (inside < 0.5) {
    // margin: plain paper, the frame rule just outside, kento marks below the picture
    float ink = 0.0;
    float d = sdBox(fp, fh);
    ink = max(ink, 1.0 - smoothstep(0.4, 1.4, abs(d - 0.6)));
    vec2 br = fc + fh;          // bottom-right corner
    vec2 bl = vec2(fc.x - fh.x, br.y);
    float k = 0.0;
    k = max(k, seg(tl, br + vec2(-30.0, 14.0), br + vec2(-4.0, 14.0), 1.6));
    k = max(k, seg(tl, br + vec2(-4.0, 14.0), br + vec2(-4.0, 26.0), 1.6));
    k = max(k, seg(tl, bl + vec2(10.0, 14.0), bl + vec2(44.0, 14.0), 1.6));
    vec3 lc = texelFetch(tPal, ivec2(7, 1), 0).rgb;
    vec3 col = mix(paper, lc, ink * 0.85);
    return mix(col, lc, k * 0.3 * (0.7 + 0.3 * vnoise(cp * 0.4)));
  }

  /* --- outline block ----------------------------------------------------- */
  float w = uLineW;
  float r = max(0.6, w * 0.5) * uDpr;
  float i0 = idepthL(px);
  vec4 n0 = normalL(px);
  vec3 c0 = sceneL(px);
  vec2 k0 = chromaKey(c0);
  float b0 = blackness(c0, 0.26);
  float s0 = specular(c0);
  float lap = 0.0, crease = 0.0, colr = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a)) * r;
    vec2 pa = px + d, pb = px - d;
    float ia = idepthL(pa), ib = idepthL(pb);
    lap = max(lap, abs(ia + ib - 2.0 * i0) / max(i0, max(ia, ib)));
    vec4 na = normalL(pa), nb = normalL(pb);
    if (n0.w > 0.5 && na.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, na.xyz));
    if (n0.w > 0.5 && nb.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, nb.xyz));
    crease = max(crease, abs(na.w - nb.w) * 2.0);
    vec3 ca = sceneL(pa), cb = sceneL(pb);
    colr = max(colr, (distance(chromaKey(ca), k0) + abs(blackness(ca, 0.26) - b0)) * (1.0 - max(s0, specular(ca))));
    colr = max(colr, (distance(chromaKey(cb), k0) + abs(blackness(cb, 0.26) - b0)) * (1.0 - max(s0, specular(cb))));
  }
  float line = max(max(smoothstep(0.02, 0.06, lap), smoothstep(0.25, 0.45, crease)), smoothstep(0.3, 0.46, colr));
  line *= min(1.0, w * uDpr / 1.3);                      // sub-pixel hairlines fade instead of aliasing

  /* --- colour blocks ----------------------------------------------------- */
  float cov = n0.w;
  float V = max(max(c0.r, c0.g), c0.b);
  int k = classOf(c0);
  float tl1 = smoothstep(uHi - 0.02, uHi + 0.02, V);
  float td = 1.0 - smoothstep(uLo - 0.02, uLo + 0.02, V);
  vec3 dark = texelFetch(tPal, ivec2(k, 0), 0).rgb;
  vec3 mid = texelFetch(tPal, ivec2(k, 1), 0).rgb;
  vec3 lite = texelFetch(tPal, ivec2(k, 2), 0).rgb;
  vec3 blk = mix(mix(mid, lite, tl1), dark, td);
  blk = mix(blk, texelFetch(tPal, ivec2(7, 0), 0).rgb, b0);
  float depth = 1.0 / max(i0, 1e-4);
  float far = smoothstep(uDepthRange.x, uDepthRange.y, depth) * cov;
  // water bokashi: blues deepen toward the horizon
  if (k == 0) blk = mix(blk, dark * 0.82, far * uWater * (1.0 - b0));

  // sky (background): bokashi bands
  vec3 sky = paper;
  float band = smoothstep(uSkyLo, min(1.0, uSkyLo + 0.38), ty + 0.03 * (vnoise(cp * vec2(0.004, 0.02)) - 0.5));
  sky = mix(sky, texelFetch(tPal, ivec2(7, 2), 0).rgb * (1.0 + fib * 0.6), uSkyAmt * band);
  float hz = exp(-pow((ty - uHorizY) / 0.11, 2.0));
  sky = mix(sky, uHorizon * (1.0 + fib * 0.6), uHorizAmt * hz * (1.0 - band));
  // 雲母摺: mica ground with glints
  if (uMica > 0.0) {
    vec3 mica = uMicaCol * (1.0 + fib) * (0.98 + 0.04 * sin(cp.x * 0.004 + cp.y * 0.003 + uTime * 0.2));
    vec2 g = floor(cp / 3.0);
    float h = hash12(g + 7.0);
    float tw = pow(max(0.0, sin(uTime * (0.6 + h * 1.4) + h * 40.0)), 12.0);
    mica += vec3(0.16, 0.15, 0.17) * step(0.965, h) * tw;
    mica += vec3(0.05, 0.035, 0.06) * smoothstep(0.55, 0.9, vnoise(cp * 0.01 + uTime * 0.05));
    sky = mix(sky, mica, uMica);
  }

  vec3 col = mix(sky, blk * (1.0 + fib * 0.8), cov);
  // 广重: far things sink into the mist
  col = mix(col, sky, far * uHaze * 0.65);
  // wood grain only shows where colour lies flat over a large area (sky / wide fills)
  float gr = vnoise(vec2(cp.x * 0.004, cp.y * 0.16 + 3.0 * vnoise(cp * vec2(0.002, 0.01))));
  float grain = smoothstep(0.55, 0.85, gr) * (1.0 - cov * 0.6);
  float tint = uSkyAmt * band + uHorizAmt * hz;
  col *= 1.0 - uGrain * grain * (0.03 + 0.05 * clamp(tint, 0.0, 1.0));
  // baren rubbing: faint mottling of the ink
  col *= 1.0 + (fbm2(cp * 0.03) - 0.5) * 0.035 * cov;

  vec3 lc = texelFetch(tPal, ivec2(7, 1), 0).rgb;
  return mix(col, lc, clamp(line, 0.0, 1.0) * 0.94);
}
`

/* ------------------------------------------------------------------ factory + controls */

type State = { mode: UkiyoeMode; from: Look; to: Look; k: number; lineW: number; lineT: number }
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

const mixLook = (A: Look, B: Look, t: number): Look => {
  const c0 = new THREE.Color()
  const c1 = new THREE.Color()
  const mx = (a: string, b: string) => '#' + c0.setRGB(...rgb01(a)).lerp(c1.setRGB(...rgb01(b)), t).getHexString()
  const n = (k: keyof Look) => lerp(A[k] as number, B[k] as number, t)
  return {
    tiers: A.tiers.map((row, i) => row.map((h, j) => mx(h, B.tiers[i][j]))),
    sumi: mx(A.sumi, B.sumi),
    line: mx(A.line, B.line),
    sky: mx(A.sky, B.sky),
    horizon: mx(A.horizon, B.horizon),
    mica: mx(A.mica, B.mica),
    paper: mx(A.paper, B.paper),
    lo: n('lo'),
    hi: n('hi'),
    skyAmt: n('skyAmt'),
    skyLo: n('skyLo'),
    horizAmt: n('horizAmt'),
    haze: n('haze'),
    water: n('water'),
    micaAmt: n('micaAmt'),
    lineK: n('lineK'),
    grain: n('grain'),
  }
}

export function createUkiyoeEffect(init: { mode?: UkiyoeMode; lineWidth?: number } = {}): StylizeEffect {
  const mode = init.mode ?? 'hokusai'
  const lw = init.lineWidth ?? 1.1
  const pal = floatTable(8, 4)
  TARGETS.forEach((hex, i) => pal.set(i, 3, [...chromaKeyJs(hex), 0, 1]))
  const uniforms: U = {
    tPal: { value: pal.tex },
    uNT: { value: 7 },
    uLineW: { value: lw },
    uLo: { value: 0.33 },
    uHi: { value: 0.72 },
    uSkyAmt: { value: 1 },
    uSkyLo: { value: 0.6 },
    uHorizAmt: { value: 0 },
    uHorizY: { value: 0.32 },
    uHaze: { value: 0 },
    uWater: { value: 1 },
    uMica: { value: 0 },
    uGrain: { value: 1 },
    uDepthRange: { value: new THREE.Vector2(6, 40) },
    uPaper: { value: new THREE.Vector3() },
    uHorizon: { value: new THREE.Vector3() },
    uMicaCol: { value: new THREE.Vector3() },
    uFrame: { value: new THREE.Vector4(0, 0, 100, 100) },
    uFrameOn: { value: 0 },
  }
  const st: State = { mode, from: LOOKS[mode], to: LOOKS[mode], k: 1, lineW: lw, lineT: lw }
  STATE.set(uniforms, st)
  const apply = () => {
    const L = st.k >= 1 ? st.to : mixLook(st.from, st.to, ease(st.k))
    L.tiers.forEach((row, i) => row.forEach((h, j) => pal.set(i, j, rgb01(h))))
    pal.set(7, 0, rgb01(L.sumi))
    pal.set(7, 1, rgb01(L.line))
    pal.set(7, 2, rgb01(L.sky))
    pal.tex.needsUpdate = true
    ;(uniforms.uPaper.value as THREE.Vector3).set(...rgb01(L.paper))
    ;(uniforms.uHorizon.value as THREE.Vector3).set(...rgb01(L.horizon))
    ;(uniforms.uMicaCol.value as THREE.Vector3).set(...rgb01(L.mica))
    uniforms.uLo.value = L.lo
    uniforms.uHi.value = L.hi
    uniforms.uSkyAmt.value = L.skyAmt
    uniforms.uSkyLo.value = L.skyLo
    uniforms.uHorizAmt.value = L.horizAmt
    uniforms.uHaze.value = L.haze
    uniforms.uWater.value = L.water
    uniforms.uMica.value = L.micaAmt
    uniforms.uGrain.value = L.grain
    uniforms.uLineW.value = st.lineW * L.lineK
  }
  apply()
  return {
    frag: FRAG,
    uniforms,
    normals: true,
    background: ukiyoeMeta.background,
    update(dt) {
      let dirty = false
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.9)
        dirty = true
      }
      if (Math.abs(st.lineW - st.lineT) > 1e-3) {
        st.lineW += (st.lineT - st.lineW) * (1 - Math.exp(-dt * 6))
        dirty = true
      }
      if (dirty) apply()
    },
  }
}

/** switch the master (palette, bokashi, line weight morph over ~0.9 s) */
export function setUkiyoeMode(fx: StylizeEffect, mode: UkiyoeMode) {
  const st = stateOf(fx)
  if (!st || st.mode === mode) return
  st.from = st.k >= 1 ? st.to : mixLook(st.from, st.to, ease(st.k))
  st.to = LOOKS[mode]
  st.mode = mode
  st.k = 0
}

/** outline width in CSS px (before the mode's own factor; eases) */
export function setUkiyoeLineWidth(fx: StylizeEffect, css: number) {
  const st = stateOf(fx)
  if (st) st.lineT = css
}

/** the printed sheet: picture rect in CSS px from the top left (border rule, margin, kento); null = full bleed */
export function setUkiyoeFrame(fx: StylizeEffect, rect: { x: number; y: number; w: number; h: number } | null) {
  const u = fx.uniforms as U
  u.uFrameOn.value = rect ? 1 : 0
  if (rect) (u.uFrame.value as THREE.Vector4).set(rect.x, rect.y, rect.w, rect.h)
}

/** view depth of the near water … the horizon (water bokashi, mist); horizonY = 0..1 height of the warm band */
export function setUkiyoeDepth(fx: StylizeEffect, near: number, far: number, horizonY = 0.32) {
  const u = fx.uniforms as U
  ;(u.uDepthRange.value as THREE.Vector2).set(near, far)
  u.uHorizY.value = horizonY
}
