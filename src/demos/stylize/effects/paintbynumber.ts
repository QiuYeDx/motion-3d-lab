import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 数字填色 — a paint-by-number canvas: the picture is printed as numbered regions and painted in, one pot at
 * a time.
 *
 *  1. Regions. The scene is rendered at half CSS resolution (bilinear → a smooth colour field) and every
 *     sample is snapped to the nearest paint of a numbered kit (12 / 16 / 20 pots) in Oklab, lightness
 *     included — so a lit side and a shadow side become two regions ("light bands"), like a real kit.
 *     The kit lives in a tiny float DataTexture (sRGB row + Oklab row) read with texelFetch.
 *  2. Print. Region borders are thin blue-grey lines (4 taps 0.6 CSS px away disagree with the centre).
 *     Numbers: a coarse staggered grid (46 CSS px); each cell proposes one jittered label point, which is
 *     printed only if the region there survives two rings of probes (6 at 10 px all agree → deep inside;
 *     if 6 more at 30 px also agree it is a big region and only a fraction of its cells keep their number).
 *     Digits come from a mip-mapped canvas glyph atlas (textureLod, explicit LOD).
 *     All snapping goes through ONE call site in one loop (centre, border taps, paint jitter, label probes).
 *  3. Paint. Pots are painted in number order; their windows overlap so a few pots are open at once. Inside
 *     a pot's window the paint advances across the canvas as streaky brush strokes. The paint is sampled
 *     through a small noise offset, so it overlaps the printed line in places and misses it in others
 *     (white canvas peeks through until the neighbour gets painted). Flat acrylic with a faint brush texture
 *     and a darker rim where it pools against a border; once painted, the number is gone.
 *  4. Modes: 填色中 paints, holds the finished picture, washes the canvas and starts again · 完成 finishes
 *     quickly and stays painted (no lines) · 线稿 lifts all paint: just lines and numbers, a colouring-book page.
 *     `fillPaintByNumber(fx)` restarts, `pbnProgress` / `pbnCurrent` report progress and the open pot.
 */

export type PbnMode = 'fill' | 'done' | 'lines'
export type PbnCount = 12 | 16 | 20

export const pbnModes: { id: PbnMode; label: string; en: string }[] = [
  { id: 'fill', label: '填色中', en: 'Painting' },
  { id: 'done', label: '完成', en: 'Finished' },
  { id: 'lines', label: '线稿', en: 'Line art' },
]

export const pbnCounts: PbnCount[] = [12, 16, 20]

export const pbnMeta = { title: '数字填色', en: 'Paint by Number', background: '#ffffff', theme: 'light' as const }

type Paint = { hex: string; zh: string }
const P: Record<string, Paint> = {
  white: { hex: '#fbf9f3', zh: '钛白' },
  cream: { hex: '#f1dfb4', zh: '米黄' },
  yellow: { hex: '#f5c534', zh: '柠檬黄' },
  orange: { hex: '#ee8f33', zh: '橘黄' },
  vermilion: { hex: '#de4a35', zh: '朱红' },
  crimson: { hex: '#a8232e', zh: '深红' },
  maroon: { hex: '#5e1a24', zh: '酱紫' },
  pink: { hex: '#f0a0b2', zh: '粉红' },
  violet: { hex: '#8a5cc0', zh: '紫罗兰' },
  indigo: { hex: '#3e3a8a', zh: '靛蓝' },
  blue: { hex: '#2c63c9', zh: '群青' },
  sky: { hex: '#86c3ea', zh: '天蓝' },
  teal: { hex: '#1fa092', zh: '青绿' },
  lime: { hex: '#a9d36a', zh: '嫩绿' },
  green: { hex: '#479b45', zh: '草绿' },
  forest: { hex: '#22593a', zh: '墨绿' },
  tan: { hex: '#c58f5c', zh: '土黄' },
  brown: { hex: '#6a4631', zh: '熟褐' },
  grey: { hex: '#a29c92', zh: '暖灰' },
  charcoal: { hex: '#2b2b33', zh: '炭黑' },
}

/** the kits, numbered 1…N in this order */
export const PBN_SETS: Record<PbnCount, Paint[]> = {
  12: ['white', 'cream', 'yellow', 'orange', 'vermilion', 'crimson', 'violet', 'blue', 'sky', 'green', 'brown', 'grey'].map((k) => P[k]),
  16: ['white', 'cream', 'yellow', 'orange', 'vermilion', 'crimson', 'pink', 'violet', 'blue', 'sky', 'teal', 'green', 'forest', 'brown', 'grey', 'charcoal'].map((k) => P[k]),
  20: ['white', 'cream', 'yellow', 'orange', 'vermilion', 'crimson', 'maroon', 'pink', 'violet', 'indigo', 'blue', 'sky', 'teal', 'lime', 'green', 'forest', 'tan', 'brown', 'grey', 'charcoal'].map((k) => P[k]),
}

const MAXP = 32
/** pot windows overlap: each one is open for this fraction of the whole run */
const winOf = (n: number) => Math.min(0.3, 3.2 / n)

/* ------------------------------------------------------------------ colour helpers */

const srgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function oklab(hex: string) {
  const [r, g, b] = srgb(hex).map(toLin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/* ------------------------------------------------------------------ glyph atlas (digits 0–9) */

let ATLAS: HTMLCanvasElement | null = null
function digitAtlas() {
  if (ATLAS) return ATLAS
  const cw = 64
  const ch = 80
  const c = document.createElement('canvas')
  c.width = cw * 10
  c.height = ch
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '600 66px "Segoe UI", "Helvetica Neue", Arial, sans-serif'
  for (let i = 0; i < 10; i++) g.fillText(String(i), cw * i + cw / 2, ch / 2 + 3)
  ATLAS = c
  return c
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;    // ${MAXP}×2 float: row 0 sRGB, row 1 Oklab
uniform sampler2D tGlyph;  // digits 0–9, 10 cells of 64×80
uniform int uN;            // pots in the kit
uniform float uProg;       // 0..1 painting progress
uniform float uWin;        // a pot's window (fraction of the run)
uniform float uWash;       // paint visibility (0 = bare printed canvas)
uniform vec4 uLook;        // line ghost under paint, label amount, brush texture, line amount
uniform float uGrid;       // label grid, CSS px
uniform float uKeep;       // fraction of big-region cells that keep their number

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 oklabOf(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}

// the region (pot index) at a device-px position: nearest paint in Oklab
int potAt(vec2 p) {
  vec3 c = textureLod(tScene, clamp(p, vec2(0.5), uRes - 0.5) / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  vec3 lab = oklabOf(clamp(c, 0.0, 1.0));
  float best = 1e9;
  int bi = 0;
  for (int i = 0; i < uN; i++) {
    vec3 d = lab - texelFetch(tPal, ivec2(i, 1), 0).rgb;
    d.yz *= 1.15;
    float e = dot(d, d);
    if (e < best) { best = e; bi = i; }
  }
  return bi;
}

// how far the pot's paint has come at this pixel (0 bare … 1 painted)
float paintedAt(int i, vec2 uv, vec2 cp) {
  float st = float(i) / float(uN) * (1.0 - uWin);
  float t = clamp((uProg - st) / uWin, 0.0, 1.0);
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  // the brush crosses the canvas in streaky strokes, a little differently for each pot
  float h = float(i) * 0.6180339;
  float ang = 0.35 + 0.5 * sin(h * 6.283);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 r = vec2(dot(cp, dir), dot(cp, vec2(-dir.y, dir.x)));
  float streak = vnoise(r * vec2(0.012, 0.16) + h * 31.0) * 0.6 + vnoise(r * vec2(0.03, 0.5) + h * 7.0) * 0.4;
  float front = mix(uv.x, 1.0 - uv.y, 0.3 + 0.4 * fract(h * 3.0));
  front = 0.06 + 0.82 * clamp(front + (streak - 0.5) * 0.22 + (vnoise(cp * 0.006 + h) - 0.5) * 0.2, 0.0, 1.0);
  return smoothstep(front - 0.012, front + 0.012, t);
}

vec3 stylize(vec2 px) {
  float S = uDpr;
  vec2 uv = px / uRes;
  vec2 cp = px / S;

  // label cell: a staggered grid, one jittered candidate point per cell
  float G = uGrid;
  float row = floor(cp.y / G);
  float sh = mod(row, 2.0) * 0.5;
  vec2 cell = vec2(floor(cp.x / G + sh), row);
  vec2 lc = (cell + vec2(0.5 - sh, 0.5)) * G + (vec2(hash12(cell + 3.1), hash12(cell + 8.7)) - 0.5) * G * 0.42;
  float gh = 10.0;                      // digit height, CSS px
  vec2 lr = cp - lc;
  bool inBox = abs(lr.x) < gh * 0.72 && abs(lr.y) < gh * 0.62 && uLook.y > 0.001;

  // every snap goes through this loop: centre · 4 border taps · paint jitter · label point · 2 probe rings
  vec2 jit = vec2(vnoise(cp * 0.16) - 0.5, vnoise(cp * 0.16 + 17.0) - 0.5) * 2.6 + vec2(vnoise(cp * 0.6 + 5.0) - 0.5) * 0.8;
  int idx = 0, paintI = 0, labI = -1, q1 = 0, q2 = 0, q3 = 0;
  float border = 0.0;
  bool label = inBox;
  bool big = true;
  int K = inBox ? 19 : 6;
  for (int k = 0; k < K; k++) {
    vec2 sp;
    if (k == 0) sp = cp;
    else if (k < 5) {
      float a = float(k - 1) * 1.5707963;
      sp = cp + vec2(cos(a), sin(a)) * 1.1;
    } else if (k == 5) sp = cp + jit;
    else if (k == 6) sp = lc;
    else {
      float j = float(k < 13 ? k - 7 : k - 13);
      float a = j * 1.0471976 + (k < 13 ? 0.0 : 0.52);
      sp = lc + vec2(cos(a), sin(a)) * (k < 13 ? 10.0 : 30.0);
    }
    int q = potAt(sp * S);
    if (k == 0) idx = q;
    else if (k < 5) {
      if (k == 1) q1 = q;
      else if (k == 2) q2 = q;
      else if (k == 3) q3 = q;
      else {
        // a sliver thinner than ~2 px between two regions (an anti-aliased edge passing through a third
        // paint) is given to its neighbour, so outlines stay single
        if (q1 != idx && q3 != idx) idx = q1;
        else if (q2 != idx && q != idx) idx = q2;
        border = float(q1 != idx) + float(q2 != idx) + float(q3 != idx) + float(q != idx);
      }
    } else if (k == 5) paintI = q;
    else if (k == 6) {
      labI = q;
      if (q != idx) { label = false; break; }
    } else if (k < 13) {
      if (q != labI) { label = false; break; }
    } else if (q != labI) {
      big = false;
      break;
    }
  }
  if (big && label && hash12(cell * 1.31 + 0.7) > uKeep) label = false;

  // canvas: primed linen
  vec3 canvasC = vec3(0.985, 0.979, 0.962);
  float weave = sin(cp.x * 2.3) * sin(cp.y * 2.3);
  canvasC *= 0.99 + 0.012 * weave + 0.02 * (vnoise(cp * 0.05) - 0.5);
  vec3 col = canvasC;

  // printed lines and numbers
  vec3 ink = vec3(0.45, 0.53, 0.66);
  float line = clamp(border * 0.4, 0.0, 0.8) * uLook.w;
  col = mix(col, ink, line * 0.85);
  float digits = 0.0;
  if (label && labI >= 0) {
    int num = labI + 1;
    int d0 = num / 10;
    int d1 = num - d0 * 10;
    float adv = gh * 0.6;
    float cw = gh * 0.8;               // atlas cell width in CSS px (64:80)
    float lod = log2(80.0 / (gh * S));
    vec2 lp = lr;                      // CanvasTexture is flipped: atlas v runs up, like cp
    float a = 0.0;
    if (d0 == 0) {
      vec2 g = lp / vec2(cw, gh) + 0.5;
      if (g.x > 0.0 && g.x < 1.0 && g.y > 0.0 && g.y < 1.0)
        a = textureLod(tGlyph, vec2((float(d1) + g.x) / 10.0, g.y), lod).a;
    } else {
      vec2 g0 = (lp + vec2(adv * 0.5, 0.0)) / vec2(cw, gh) + 0.5;
      vec2 g1 = (lp - vec2(adv * 0.5, 0.0)) / vec2(cw, gh) + 0.5;
      float a0 = 0.0, a1 = 0.0;
      if (g0.x > 0.0 && g0.x < 1.0 && g0.y > 0.0 && g0.y < 1.0)
        a0 = textureLod(tGlyph, vec2((float(d0) + g0.x) / 10.0, g0.y), lod).a;
      if (g1.x > 0.0 && g1.x < 1.0 && g1.y > 0.0 && g1.y < 1.0)
        a1 = textureLod(tGlyph, vec2((float(d1) + g1.x) / 10.0, g1.y), lod).a;
      a = max(a0, a1);
    }
    digits = a * uLook.y;
    col = mix(col, ink * 0.8, digits);
  }

  // paint
  float pk = paintedAt(paintI, uv, cp) * uWash;
  if (pk > 0.001) {
    vec3 pc = texelFetch(tPal, ivec2(paintI, 0), 0).rgb;
    // flat acrylic: soft brush streaks, a little impasto, darker where it pools against a border
    float h = float(paintI) * 0.6180339;
    float ang = 0.35 + 0.5 * sin(h * 6.283);
    vec2 dir = vec2(cos(ang), sin(ang));
    // strokes follow one direction per pot; a gentle warp bends them (warping the domain, not the angle,
    // so far from the origin nothing swirls)
    vec2 wp = cp + (vec2(vnoise(cp * 0.012 + h), vnoise(cp * 0.012 + h + 5.0)) - 0.5) * 26.0;
    vec2 r = vec2(dot(wp, dir), dot(wp, vec2(-dir.y, dir.x)));
    float br = vnoise(r * vec2(0.025, 0.55)) * 0.55 + vnoise(r * vec2(0.06, 1.3) + 3.0) * 0.45;
    float blot = vnoise(cp * 0.03 + h * 4.0);
    vec3 paint = pc * (1.0 + (br - 0.5) * 0.06 * uLook.z + (blot - 0.5) * 0.03 * uLook.z);
    paint *= 1.0 - 0.07 * border;
    // the printed line shows faintly through thin paint
    paint = mix(paint, paint * ink * 1.1, line * uLook.x);
    col = mix(col, clamp(paint, 0.0, 1.0), pk);
  }

  // a soft light falloff across the canvas
  float v = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0));
  col *= 1.0 - 0.06 * smoothstep(0.4, 1.0, v);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + controls */

type State = {
  mode: PbnMode
  n: PbnCount
  prog: number
  wash: number
  hold: number
  restart: boolean // washing out before starting over
  look: number[]
  paused: boolean
}
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

const LOOKS: Record<PbnMode, number[]> = {
  //       ghost  labels brush lines
  fill: [0.16, 1, 1, 1],
  done: [0.0, 1, 1.5, 1],
  lines: [0.16, 1, 1, 1],
}

function writePalette(tex: THREE.DataTexture, paints: { hex: string }[]) {
  const d = tex.image.data as Float32Array
  d.fill(0)
  paints.forEach((p, i) => {
    const s = srgb(p.hex)
    const l = oklab(p.hex)
    d.set([s[0], s[1], s[2], 1], i * 4)
    d.set([l[0], l[1], l[2], 1], (MAXP + i) * 4)
  })
  tex.needsUpdate = true
}

export function createPbnEffect(init: { mode?: PbnMode; colors?: PbnCount } = {}): StylizeEffect {
  const mode = init.mode ?? 'fill'
  const n = init.colors ?? 16
  const tPal = new THREE.DataTexture(new Float32Array(MAXP * 2 * 4), MAXP, 2, THREE.RGBAFormat, THREE.FloatType)
  tPal.minFilter = tPal.magFilter = THREE.NearestFilter
  writePalette(tPal, PBN_SETS[n])
  const tGlyph = new THREE.CanvasTexture(digitAtlas())
  tGlyph.minFilter = THREE.LinearMipmapLinearFilter
  tGlyph.magFilter = THREE.LinearFilter
  tGlyph.generateMipmaps = true
  const uniforms: U = {
    tPal: { value: tPal },
    tGlyph: { value: tGlyph },
    uN: { value: n },
    uProg: { value: mode === 'done' ? 1 : 0 },
    uWin: { value: winOf(n) },
    uWash: { value: mode === 'lines' ? 0 : 1 },
    uLook: { value: new THREE.Vector4().fromArray(LOOKS[mode]) },
    uGrid: { value: 46 },
    uKeep: { value: 0.07 },
  }
  const st: State = { mode, n, prog: mode === 'done' ? 1 : 0, wash: mode === 'lines' ? 0 : 1, hold: 0, restart: false, look: [...LOOKS[mode]], paused: false }
  STATE.set(uniforms, st)
  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms,
    // regions are decided on a half-CSS-resolution render: smooth, DPR-independent shapes
    scale: 0.5,
    background: pbnMeta.background,
    update(dt, ctx) {
      fx.scale = 0.5 / Math.max(1, ctx.dpr)
      const u = uniforms
      const dur = st.n * 1.15 + 2
      if (st.paused) {
        // hold everything (posters)
      } else if (st.restart) {
        st.wash = Math.max(0, st.wash - dt / 0.8)
        if (st.wash <= 0) {
          st.restart = false
          st.prog = 0
          st.hold = 0
          if (st.mode === 'done') st.mode = 'fill'
        }
      } else if (st.mode === 'fill') {
        st.wash = Math.min(1, st.wash + dt / 0.5)
        if (st.prog < 1) st.prog = Math.min(1, st.prog + dt / dur)
        else {
          st.hold += dt
          if (st.hold > 4.5) st.restart = true
        }
      } else if (st.mode === 'done') {
        st.wash = Math.min(1, st.wash + dt / 0.5)
        st.prog = Math.min(1, st.prog + dt / 2.6)
      } else {
        st.wash = Math.max(0, st.wash - dt / 0.7)
        if (st.wash <= 0) st.prog = 0
      }
      const L = LOOKS[st.mode]
      const k = 1 - Math.exp(-dt * 5)
      for (let i = 0; i < 4; i++) st.look[i] += (L[i] - st.look[i]) * k
      ;(u.uLook.value as THREE.Vector4).fromArray(st.look)
      u.uProg.value = st.prog
      u.uWash.value = st.wash
    },
  }
  return fx
}

export function setPbnMode(fx: StylizeEffect, mode: PbnMode) {
  const st = stateOf(fx)
  if (!st || st.mode === mode) return
  if (mode === 'fill' && st.mode === 'lines') st.prog = 0
  st.mode = mode
  st.hold = 0
  if (mode !== 'fill') st.restart = false
}

/** kit size: 12, 16 or 20 numbered pots (the picture is re-segmented) */
export function setPbnColors(fx: StylizeEffect, n: PbnCount) {
  const st = stateOf(fx)
  if (!st || st.n === n) return
  st.n = n
  const u = fx.uniforms as U
  writePalette(u.tPal.value as THREE.DataTexture, PBN_SETS[n])
  u.uN.value = n
  u.uWin.value = winOf(n)
}

/** start over: the canvas is washed clean and painted again from pot 1 */
export function fillPaintByNumber(fx: StylizeEffect) {
  const st = stateOf(fx)
  if (!st) return
  if (st.mode === 'lines') st.mode = 'fill'
  st.restart = true
  if (st.wash <= 0) {
    st.prog = 0
    st.restart = false
  }
}

/** 0..1 painting progress (0 while the canvas is bare) */
export function pbnProgress(fx: StylizeEffect) {
  const st = stateOf(fx)
  return st ? st.prog * Math.min(1, st.wash * 2) : 0
}

/** the pot being painted now (0-based; −1 when none), and how far the pots before it are */
export function pbnCurrent(fx: StylizeEffect) {
  const st = stateOf(fx)
  if (!st || st.wash < 0.5) return -1
  const w = winOf(st.n)
  let best = -1
  let bd = 9
  for (let i = 0; i < st.n; i++) {
    const s = (i / st.n) * (1 - w)
    const t = (st.prog - s) / w
    if (t > 0 && t < 1 && Math.abs(t - 0.5) < bd) {
      bd = Math.abs(t - 0.5)
      best = i
    }
  }
  return best
}

/** per pot: 0 untouched … 1 painted */
export function pbnPotDone(fx: StylizeEffect, i: number) {
  const st = stateOf(fx)
  if (!st) return 0
  const w = winOf(st.n)
  const s = (i / st.n) * (1 - w)
  return Math.min(1, Math.max(0, (st.prog - s) / w)) * Math.min(1, st.wash * 2)
}

/** pot count currently in use */
export function pbnCount(fx: StylizeEffect): PbnCount {
  return stateOf(fx)?.n ?? 16
}

/** freeze the painting where it is (posters) */
export function setPbnPaused(fx: StylizeEffect, paused: boolean) {
  const st = stateOf(fx)
  if (st) st.paused = paused
}

/** jump to a progress value (posters) */
export function setPbnProgress(fx: StylizeEffect, p: number) {
  const st = stateOf(fx)
  if (!st) return
  st.prog = p
  st.wash = 1
  st.hold = 0
  st.restart = false
}
