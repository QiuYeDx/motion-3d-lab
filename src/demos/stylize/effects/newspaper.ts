import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 老报纸 — the render as a news photo printed on cheap, yellowed newsprint, decades later.
 *
 *  · PRINT (inside the photo box, `uFrame`; the whole screen by default)
 *    One loop over four inks (C, M, Y, K). Each ink samples the scene at its own misregistered offset
 *    (5 textureLod taps, a cell-sized average), separates (GCR for colour, luma for black-only), runs it
 *    through newsprint's short range (light tints drop out, shadows plug up) and heavy dot gain, then
 *    screens it — a coarse AM cosine dot (≈ 65–85 lpi feel, 6–7 CSS px) or, for the wirephoto, a
 *    horizontal line screen whose rows are the transmitted scan lines. Ink spread = wide, ragged dot
 *    edges plus a faint bleed halo; laydown is mottled; a horizontal band where the ink ran low.
 *    No derivatives (the AA width is analytic), no per-mode routines: modes are numbers lerped on the CPU.
 *  · PAPER (everywhere): yellowed stock with blotches, fibres and grain, browning toward the edges,
 *    foxing spots, the facing page's text set off in reverse (a canvas texture), a greasy thumb print,
 *    an ink smear, and a central horizontal fold — shadow, highlight and ink cracked along the crease.
 *
 * Modes (`newspaperModes`): 黑白号外 (1940s extra, black only, coarse) · 彩色周末版 (1960s colour supplement,
 * misregistered faded CMYK) · 传真照片 (wirephoto: line screen, scanline banding, torn rows, grain).
 * `setNewspaperQuality(fx, 'good' | 'poor')` scales gain, spread, raggedness, misregistration, the low-ink
 * band and the set-off. `setNewspaperFrame()` places the photo box; `createNewspaperOriginal(fx)` is the
 * matching "原图": same paper and box, the clean render inside.
 */

export const newspaperModes = [
  { id: 'extra', label: '黑白号外' },
  { id: 'colour', label: '彩色周末版' },
  { id: 'wire', label: '传真照片' },
] as const
export type NewspaperMode = (typeof newspaperModes)[number]['id']

export const newspaperQualities = [
  { id: 'good', label: '精印' },
  { id: 'poor', label: '粗印' },
] as const
export type NewspaperQuality = (typeof newspaperQualities)[number]['id']

export const newspaperMeta = { title: '老报纸', en: 'Old Newspaper', background: '#dedbd2', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = {
  colour: number // 0 black only … 1 CMYK
  line: number // 0 dots … 1 line screen
  cell: number // CSS px
  mis: number // misregistration scale
  lo: number // tone below this → no ink (blown highlights)
  hi: number // above this → solid (crushed blacks)
  gain: number
  spread: number
  rough: number
  fade: number // faded inks
  scan: number // wirephoto transmission artefacts
  paper: V3
}

const LOOKS: Record<NewspaperMode, Look> = {
  extra: { colour: 0, line: 0, cell: 6.6, mis: 0, lo: 0.11, hi: 0.9, gain: 0.26, spread: 0.2, rough: 0.24, fade: 0, scan: 0, paper: [0.905, 0.855, 0.735] },
  colour: { colour: 1, line: 0, cell: 6.0, mis: 1, lo: 0.08, hi: 0.88, gain: 0.26, spread: 0.16, rough: 0.2, fade: 1, scan: 0, paper: [0.925, 0.885, 0.775] },
  wire: { colour: 0, line: 1, cell: 4.4, mis: 0, lo: 0.06, hi: 0.86, gain: 0.2, spread: 0.24, rough: 0.16, fade: 0, scan: 1, paper: [0.9, 0.86, 0.75] },
}
const KEYS = ['colour', 'line', 'cell', 'mis', 'lo', 'hi', 'gain', 'spread', 'rough', 'fade', 'scan'] as const

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = { ...a, paper: [0, 0, 0] as V3 }
  for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * k
  for (let i = 0; i < 3; i++) o.paper[i] = a.paper[i] + (b.paper[i] - a.paper[i]) * k
  return o
}

/* ------------------------------------------------------------------ set-off texture */

const GHOST_CHARS =
  '本报讯据悉昨日上午时分发射场方面宣布试验取得圆满成功各界人士纷纷表示祝贺记者在现场看到人群欢呼雀跃城市交通秩序良好天气晴朗气温回升市场物价平稳工厂农田学校医院'
const GHOST_EN = 'THE MORNING EDITION CITY NEWS WEATHER MARKETS SPORTS LATE FINAL'

/** the facing page, mirrored: dark text on white, blurred a little (ink wicked through) */
function ghostTexture() {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const x = c.getContext('2d')!
  x.fillStyle = '#fff'
  x.fillRect(0, 0, S, S)
  x.translate(S, 0)
  x.scale(-1, 1)
  x.filter = 'blur(0.8px)'
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const serif = '"Songti SC", "SimSun", "STSong", "Noto Serif CJK SC", serif'
  // five columns, with headlines and a photo block here and there
  const colW = 186
  for (let col = 0; col < 5; col++) {
    const x0 = 14 + col * (colW + 18)
    let y = 22
    while (y < S - 10) {
      const r = rnd()
      if (r < 0.08) {
        x.fillStyle = '#222'
        x.font = `700 30px ${serif}`
        let s = ''
        for (let k = 0; k < 6; k++) s += GHOST_CHARS[Math.floor(rnd() * GHOST_CHARS.length)]
        x.fillText(s, x0, y + 30)
        y += 46
      } else if (r < 0.11 && y < S - 200) {
        const g = x.createLinearGradient(x0, y, x0 + colW, y + 150)
        g.addColorStop(0, '#9a9a9a')
        g.addColorStop(0.5, '#5a5a5a')
        g.addColorStop(1, '#b4b4b4')
        x.fillStyle = g
        x.fillRect(x0, y + 4, colW, 150)
        y += 170
      } else if (r < 0.14) {
        x.fillStyle = '#333'
        x.font = `600 13px Georgia, ${serif}`
        x.fillText(GHOST_EN.slice(Math.floor(rnd() * 30), Math.floor(rnd() * 30) + 30), x0, y + 14)
        y += 22
      } else {
        // a paragraph
        const lines = 3 + Math.floor(rnd() * 8)
        x.fillStyle = '#3a3a3a'
        x.font = `13px ${serif}`
        for (let l = 0; l < lines && y < S - 10; l++) {
          let s = l === 0 ? '　' : ''
          const n = l === lines - 1 ? 4 + Math.floor(rnd() * 9) : 14
          for (let k = 0; k < n; k++) s += GHOST_CHARS[Math.floor(rnd() * GHOST_CHARS.length)]
          x.fillText(s, x0, y + 13)
          y += 17
        }
        y += 6
      }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec4 uFrame;      // photo box in uv (x0, y0, x1, y1), y up
uniform float uBorder;    // box rule, CSS px (0 = none)
uniform float uColour, uLine, uCell, uMis, uLo, uHi, uGain, uSpread, uRough, uFade, uScan;
uniform float uLow;       // low-ink band strength
uniform float uGhost;     // set-off strength
uniform float uSmudge;
uniform float uAge;
uniform float uBandY;     // low-ink band centre, uv y
uniform float uCreaseY;   // fold, uv y (< 0: none)
uniform vec3 uPaper;
uniform sampler2D tGhost;

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

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec3 sceneAvg(vec2 p, float r) {
  return (sceneL(p) * 2.0 + sceneL(p + vec2(r, r)) + sceneL(p + vec2(-r, r)) + sceneL(p + vec2(r, -r)) + sceneL(p + vec2(-r, -r))) / 6.0;
}

/* cosine-spot AM dot (rotated) or horizontal line screen; analytic AA width (no derivatives) */
float inkScreen(vec2 p, float ang, float cell, float v, float rough) {
  vec2 q = rot(ang) * p / cell;
  float dotS = 0.5 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  float lineS = cos(6.2831853 * p.y / cell);
  float spot = mix(dotS, lineS, uLine);
  v = clamp(v, 0.0, 1.0);
  float vd = v + 0.78 * v * (1.0 - v) * (1.0 - 2.0 * v);  // spot area → tone
  float w = 1.7 / cell + uSpread * 0.5;
  float T = mix(mix(1.0 + w, -1.0 - w, vd), cos(3.14159265 * v) * (1.0 + w), uLine);
  T += rough * min(1.0, v * 8.0) * min(1.0, (1.0 - v) * 8.0);
  float d = smoothstep(T - w, T + w, spot);
  // ink wicking into the fibres: a faint grey bleed around every dot
  float halo = smoothstep(T - w - 0.38, T + w, spot) * (0.04 + uSpread * 0.3);
  return max(d, halo * step(0.02, v));
}

vec3 printPhoto(vec2 px, vec2 cp, vec2 uv, vec3 paper) {
  float cell = uCell * uDpr;

  /* wirephoto: rows of the transmitted scan, each with its own gain and a little horizontal tear */
  float row = floor(px.y / cell);
  float rn = hash12(vec2(row, 3.7));
  float tear = (hash12(vec2(row, 9.1)) - 0.5) * 1.6 + (vnoise(vec2(row * 0.09, 1.0)) - 0.5) * 7.0;
  vec2 ps = px + vec2(tear * uDpr * uScan, 0.0);
  float bandW = sin(cp.y * 0.043 + 1.3) * 0.6 + sin(cp.y * 0.011 + 0.4) * 0.4;
  float grain = hash12(floor(cp / 1.5) + 0.5) - 0.5;
  float vAdd = uScan * ((rn - 0.5) * 0.09 + bandW * 0.05 + grain * 0.12);
  float drop = uScan * step(0.982, hash12(vec2(row, 1.3)));

  /* low-ink band: the fountain ran dry across part of the run, streaky along the paper path */
  float by = (uv.y - uBandY) * uRes.y / uDpr;
  float band = exp(-pow(by / 34.0, 2.0)) * (0.6 + 0.4 * vnoise(vec2(cp.x / 26.0, by / 300.0)));
  float inkLow = 1.0 - uLow * band * 0.6;

  float r0 = (vnoise(cp * 0.62) * 0.6 + vnoise(cp * 2.2 + 5.0) * 0.4 - 0.5) * uRough;

  vec3 col = paper;
  for (int i = 0; i < 4; i++) {
    if (i < 3 && uColour < 0.002) continue;
    vec2 o = (i == 0 ? vec2(2.4, -1.5) : i == 1 ? vec2(-1.9, 2.3) : i == 2 ? vec2(3.0, 2.6) : vec2(0.3, -0.2)) * uMis * uDpr;
    vec3 s = sceneAvg(ps - o, cell * 0.32);
    vec3 kq = 1.0 - s;
    float kmin = min(kq.r, min(kq.g, kq.b));
    float kG = smoothstep(0.3, 0.92, kmin) * kmin;
    float sep = i == 0 ? kq.r : i == 1 ? kq.g : kq.b;
    float v = i < 3 ? max(sep - kG * 0.8, 0.0) * uColour : mix(1.0 - luma(s), kG, uColour);
    v += vAdd * (i == 3 ? 1.0 : uColour);
    v = smoothstep(uLo, uHi, v);               // newsprint's short range
    v = v + uGain * v * (1.0 - v);             // dot gain
    float ang = i == 0 ? 0.2618 : i == 1 ? 1.309 : i == 2 ? 0.0 : 0.7854;
    float rough = r0 * (i == 1 || i == 3 ? 1.0 : -1.0);
    float d = inkScreen(ps - o, ang, cell, v, rough);
    vec2 mp = rot(0.6 + float(i)) * cp;
    d *= (0.84 + 0.1 * vnoise(mp * 0.021 + float(i) * 7.1) + 0.06 * vnoise(mp * 0.07)) * inkLow * (1.0 - drop * 0.55);
    vec3 ink = i == 0 ? mix(vec3(0.0, 0.6, 0.86), vec3(0.16, 0.6, 0.82), uFade)
             : i == 1 ? mix(vec3(0.9, 0.08, 0.5), vec3(0.9, 0.32, 0.5), uFade)
             : i == 2 ? mix(vec3(1.0, 0.88, 0.0), vec3(0.98, 0.85, 0.26), uFade)
             : vec3(0.15, 0.135, 0.12);
    col *= mix(vec3(1.0), ink, d);
  }
  return col;
}

vec3 paperAt(vec2 cp, vec2 uv, vec2 res) {
  vec3 c = uPaper;
  float blotch = fbm(cp / 230.0 + 4.0) - 0.5;
  vec2 r1 = rot(0.4) * cp;
  float fib = smoothstep(0.7, 0.95, vnoise(vec2(r1.x * 0.05, r1.y * 0.7)));
  float grain = hash12(floor(cp)) - 0.5;
  c *= 1.0 - 0.05 * blotch - 0.03 * grain - 0.035 * fib;
  // browning toward the edges, irregular
  vec2 e = min(uv, 1.0 - uv) * res;
  float ed = min(e.x, e.y) + (fbm(cp / 70.0 + 3.0) - 0.5) * 130.0;
  float age = smoothstep(105.0, -10.0, ed) * uAge;
  c = mix(c, c * vec3(0.88, 0.76, 0.56), age * 0.7);
  // foxing: small rust spots with a paler halo, more of them near the edges
  float fx = vnoise(cp / 3.2 + 31.0) * vnoise(cp / 29.0 + 7.0) * (0.75 + 0.25 * vnoise(cp / 400.0)) + age * 0.16;
  float fox = smoothstep(0.72, 0.8, fx);
  c = mix(c, c * vec3(0.8, 0.65, 0.46), fox * 0.75 * uAge);
  // the facing page set off in reverse
  float g = 1.0 - textureLod(tGhost, cp / 1024.0 + vec2(0.13, 0.27), 0.0).r;
  c *= 1.0 - uGhost * 0.085 * g;
  return c;
}

/* greasy thumb print: whorled ridges inside a partial ellipse */
float thumb(vec2 cp, vec2 ctr, float ang, float sz) {
  vec2 q = rot(ang) * (cp - ctr) / sz;
  q.y *= 0.76;
  float r = length(q);
  float mask = smoothstep(1.0, 0.55, r) * smoothstep(0.25, 0.7, vnoise(q * 2.4 + ctr * 0.01));
  vec2 w = q + vec2(0.0, 0.22 * q.x * q.x);
  float ph = length(w * vec2(1.0, 1.08)) * sz / 2.5 + vnoise(q * 3.0) * 1.4;
  float ridge = smoothstep(0.1, 0.9, 0.5 + 0.5 * sin(ph * 6.2831853));
  return mask * ridge;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = px / uRes;
  vec3 paper = paperAt(cp, uv, res);

  vec2 b0 = uFrame.xy * res, b1 = uFrame.zw * res;
  vec2 dq = max(b0 - cp, cp - b1);
  float outside = max(dq.x, dq.y);             // < 0 inside the photo box, CSS px

  vec3 col = paper;
  if (outside < 0.0) {
#ifdef RAW
    col = sceneL(px) * mix(vec3(1.0), paper / uPaper, 0.4);
#else
    col = printPhoto(px, cp, uv, paper);
#endif
  }
  // box rule just outside the photo
  float rule = step(0.0, outside) * (1.0 - smoothstep(uBorder - 0.6, uBorder + 0.6, outside)) * step(0.01, uBorder);
  col = mix(col, col * vec3(0.17, 0.15, 0.13), rule * (0.8 + 0.2 * vnoise(cp * 0.3)));

  // ink smear by the photo's lower right, thumb prints
  vec2 sc = vec2(mix(b0.x, b1.x, 0.86), mix(b0.y, b1.y, 0.1));
  vec2 sq = rot(-0.35) * (cp - sc) / vec2(80.0, 18.0);
  float smear = smoothstep(1.0, 0.2, length(sq)) * smoothstep(0.42, 0.8, fbm(sq * 1.6 + 3.0));
  col *= 1.0 - uSmudge * 0.16 * smear;
  float tp = thumb(cp, vec2(0.885, 0.2) * res, 0.5, 30.0) + thumb(cp, vec2(0.075, 0.6) * res, -0.9, 27.0) * 0.8;
  col *= 1.0 - uSmudge * 0.14 * tp;

  // central fold: shadow below, a highlight on the ridge, ink cracked along it
  if (uCreaseY > 0.0) {
    float y = cp.y - uCreaseY * res.y + (vnoise(vec2(cp.x / 160.0, 2.0)) - 0.5) * 3.0;
    float sh = exp(-pow(max(-y, 0.0) / 10.0, 2.0)) * step(y, 0.0) * 0.14 + exp(-pow(y / 30.0, 2.0)) * 0.04;
    float hl = exp(-pow((y - 1.8) / 1.6, 2.0)) * 0.1;
    float crack = exp(-pow(y / 0.9, 2.0)) * smoothstep(0.35, 0.75, vnoise(vec2(cp.x / 3.0, 7.0)));
    col = mix(col, paper, crack * 0.55);
    col *= 1.0 - sh;
    col += hl * (vec3(1.0) - col);
  }
  // a little overall falloff, the sheet isn't flat-lit
  vec2 vu = uv - 0.5;
  col *= 1.0 - dot(vu, vu) * 0.14;
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type NpState = { from: Look; to: Look; cur: Look; k: number; mode: NewspaperMode; poor: number; poorTarget: number; shown?: number }
export type NewspaperEffect = StylizeEffect & { np: NpState }

const QUALITY = (poor: number) => ({
  gain: 0.72 + 0.55 * poor,
  spread: 0.6 + 0.8 * poor,
  rough: 0.65 + 0.75 * poor,
  mis: 0.55 + 1.0 * poor,
  low: 0.3 + 0.7 * poor,
  ghost: 0.5 + 0.5 * poor,
  smudge: 0.55 + 0.45 * poor,
})

export function createNewspaperEffect(init: { mode?: NewspaperMode; quality?: NewspaperQuality } = {}): NewspaperEffect {
  const m0 = init.mode ?? 'extra'
  const p0 = init.quality === 'good' ? 0 : 1
  const st: NpState = { from: LOOKS[m0], to: LOOKS[m0], cur: LOOKS[m0], k: 1, mode: m0, poor: p0, poorTarget: p0 }
  const u = {
    uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
    uBorder: { value: 0 },
    uColour: { value: 0 },
    uLine: { value: 0 },
    uCell: { value: 6.6 },
    uMis: { value: 0 },
    uLo: { value: 0.1 },
    uHi: { value: 0.8 },
    uGain: { value: 0.3 },
    uSpread: { value: 0.2 },
    uRough: { value: 0.2 },
    uFade: { value: 0 },
    uScan: { value: 0 },
    uLow: { value: 0.5 },
    uGhost: { value: 1 },
    uSmudge: { value: 1 },
    uAge: { value: 1 },
    uBandY: { value: 0.64 },
    uCreaseY: { value: 0.5 },
    uPaper: { value: new THREE.Vector3() },
    tGhost: { value: ghostTexture() },
  }
  const apply = () => {
    const L = st.cur
    const q = QUALITY(st.poor)
    u.uColour.value = L.colour
    u.uLine.value = L.line
    u.uCell.value = L.cell
    u.uMis.value = L.mis * q.mis
    u.uLo.value = L.lo
    u.uHi.value = L.hi
    u.uGain.value = L.gain * q.gain
    u.uSpread.value = L.spread * q.spread
    u.uRough.value = L.rough * q.rough
    u.uFade.value = L.fade
    u.uScan.value = L.scan
    u.uLow.value = q.low
    u.uGhost.value = q.ghost
    u.uSmudge.value = q.smudge
    u.uPaper.value.set(...L.paper)
  }
  apply()
  const ease = (x: number) => x * x * (3 - 2 * x)
  return {
    frag: FRAG,
    uniforms: u,
    background: newspaperMeta.background,
    np: st,
    update(dt) {
      // first frame on screen (pages wait for this before revealing themselves)
      if (st.shown === undefined) st.shown = performance.now()
      let dirty = false
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.75)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
        dirty = true
      }
      if (Math.abs(st.poorTarget - st.poor) > 1e-4) {
        st.poor += (st.poorTarget - st.poor) * Math.min(1, dt * 5)
        dirty = true
      }
      if (dirty) apply()
    },
  }
}

/** the matching 原图: same paper, rule, fold and set-off; the clean render inside the photo box */
export function createNewspaperOriginal(fx: StylizeEffect): StylizeEffect {
  return { frag: '#define RAW\n' + FRAG, uniforms: fx.uniforms, background: fx.background }
}

export function setNewspaperMode(fx: StylizeEffect, mode: NewspaperMode) {
  const st = (fx as NewspaperEffect).np
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

export function setNewspaperQuality(fx: StylizeEffect, q: NewspaperQuality) {
  const st = (fx as NewspaperEffect).np
  if (st) st.poorTarget = q === 'poor' ? 1 : 0
}

/**
 * photo box in viewport fractions, measured from the TOP-left like the DOM (x0, top, x1, bottom),
 * plus the rule width in CSS px. The fold and the low-ink band are given as fractions from the top, too.
 */
export function setNewspaperFrame(fx: StylizeEffect, box: { x0: number; top: number; x1: number; bottom: number }, border = 1.2, crease = 0.5, band = 0.36) {
  const u = fx.uniforms
  if (!u) return
  ;(u.uFrame.value as THREE.Vector4).set(box.x0, 1 - box.bottom, box.x1, 1 - box.top)
  u.uBorder.value = border
  u.uCreaseY.value = crease < 0 ? -1 : 1 - crease
  u.uBandY.value = 1 - band
}
