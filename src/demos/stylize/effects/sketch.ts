import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 素描排线 — tonal hatching + wobbly contours, re-drawn ("boiled") 8 times a second.
 *
 *  · hatching: a 1024² canvas texture of hand-like strokes (noise-varied width, pressure fade at both
 *    ends, occasional lifts) in two interleaved sets (R / G). It is tiled in screen space in patches, each
 *    patch with its own random offset + slight rotation (two staggered patch grids cross-fade, so patch
 *    seams never cut strokes hard). Up to 4 directions × 2 sets are added as the tone darkens:
 *    light → single hatch → cross-hatch → dense. Mip LOD comes from analytic derivatives, so the patch
 *    jumps never pick a blurry mip.
 *  · paper tooth: graphite only catches the peaks of a fixed paper grain unless pressed hard.
 *  · contours: depth Laplacian + normal Sobel, sampled at a noise-jittered position (wobble), with
 *    pressure / lifts along the line and an occasional displaced second pass (doubled / overshooting).
 *  · boiling: every noise seed is the time quantised to 8 fps; switch it off to freeze the drawing.
 *  · modes only change a handful of parameters, which are interpolated on the CPU — so a mode switch is a
 *    smooth morph (graphite → ink → charcoal → blueprint) rather than a cut.
 */

export const sketchModes = [
  { id: 'pencil', label: '铅笔', dark: false },
  { id: 'pen', label: '钢笔', dark: false },
  { id: 'charcoal', label: '炭笔', dark: false },
  { id: 'blueprint', label: '蓝图', dark: true },
] as const
export type SketchMode = (typeof sketchModes)[number]['id']

export const sketchMeta = { title: '素描排线', en: 'Pencil Sketch', background: '#f4f1ea', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  paper: [number, number, number]
  ink: [number, number, number]
  crisp: number // 0 soft graphite → 1 hard-edged ink strokes
  grain: number // how much the paper tooth breaks up the strokes
  smudge: number // charcoal tonal rubbing
  lineW: number // contour sample radius, CSS px
  lineK: number // contour strength
  hatchK: number // hatching strength
  grid: number // blueprint grid
  wobble: number // contour jitter
  double: number // doubled / overshooting lines
  coarse: number // stroke spacing multiplier
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LOOKS: Record<SketchMode, Look> = {
  pencil: { paper: rgb('#f4f1ea'), ink: rgb('#35332f'), crisp: 0, grain: 0.8, smudge: 0, lineW: 1.0, lineK: 0.92, hatchK: 0.86, grid: 0, wobble: 1, double: 0.75, coarse: 1 },
  pen: { paper: rgb('#f8f6f0'), ink: rgb('#121214'), crisp: 1, grain: 0, smudge: 0, lineW: 0.85, lineK: 1, hatchK: 1, grid: 0, wobble: 0.7, double: 0.45, coarse: 0.92 },
  charcoal: { paper: rgb('#ebe5d9'), ink: rgb('#1f1d1b'), crisp: 0, grain: 1, smudge: 1, lineW: 1.9, lineK: 1, hatchK: 0.72, grid: 0, wobble: 1.25, double: 0.55, coarse: 1.35 },
  blueprint: { paper: rgb('#1d4c8f'), ink: rgb('#eef4ff'), crisp: 0.55, grain: 0.15, smudge: 0, lineW: 0.95, lineK: 0.96, hatchK: 0.62, grid: 1, wobble: 0.55, double: 0.3, coarse: 1.1 },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const m = (x: number, y: number) => x + (y - x) * k
  const v = (x: number[], y: number[]) => [m(x[0], y[0]), m(x[1], y[1]), m(x[2], y[2])] as [number, number, number]
  return {
    paper: v(a.paper, b.paper),
    ink: v(a.ink, b.ink),
    crisp: m(a.crisp, b.crisp),
    grain: m(a.grain, b.grain),
    smudge: m(a.smudge, b.smudge),
    lineW: m(a.lineW, b.lineW),
    lineK: m(a.lineK, b.lineK),
    hatchK: m(a.hatchK, b.hatchK),
    grid: m(a.grid, b.grid),
    wobble: m(a.wobble, b.wobble),
    double: m(a.double, b.double),
    coarse: m(a.coarse, b.coarse),
  }
}

/* ------------------------------------------------------------------ stroke texture (built once) */

const TEX = 1024
let strokeTex: THREE.Texture | null = null

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildStrokeTexture() {
  if (strokeTex) return strokeTex
  const c = document.createElement('canvas')
  c.width = c.height = TEX
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, TEX, TEX)
  g.globalCompositeOperation = 'lighter'
  const rnd = mulberry(1977)
  const ROWS = 96
  const SP = TEX / ROWS

  const stroke = (x0: number, y0: number, len: number, channel: string) => {
    const slope = (rnd() - 0.5) * 0.035
    const bow = (rnd() - 0.5) * 3.2
    const w0 = 1.5 + rnd() * 1.7
    const alpha = 0.5 + rnd() * 0.5
    const n = Math.max(6, Math.round(len / 7))
    // width random walk (noise-varied)
    const wv: number[] = []
    let walk = 0
    for (let i = 0; i <= n; i++) {
      walk = walk * 0.8 + (rnd() - 0.5) * 0.5
      wv.push(walk)
    }
    const top: [number, number][] = []
    const bot: [number, number][] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = x0 + t * len
      const y = y0 + slope * t * len + bow * (4 * t * (1 - t))
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.45)
      const w = Math.max(0.35, w0 * (0.35 + 0.65 * taper) * (1 + wv[i]))
      top.push([x, y - w / 2])
      bot.push([x, y + w / 2])
    }
    // pressure: fade in / out at the ends, a few lifts along the way
    const grad = g.createLinearGradient(x0, 0, x0 + len, 0)
    const a = (k: number) => `rgba(${channel},${Math.max(0, Math.min(1, alpha * k)).toFixed(3)})`
    grad.addColorStop(0, a(0))
    grad.addColorStop(0.06 + rnd() * 0.08, a(0.9))
    const lifts = rnd() < 0.55 ? 1 + Math.floor(rnd() * 2) : 0
    const at: number[] = []
    for (let i = 0; i < lifts; i++) at.push(0.25 + rnd() * 0.5)
    at.sort((p, q) => p - q)
    for (const t of at) {
      grad.addColorStop(t - 0.03, a(0.85 + rnd() * 0.15))
      grad.addColorStop(t, a(0.08 + rnd() * 0.2))
      grad.addColorStop(t + 0.03, a(0.8 + rnd() * 0.2))
    }
    grad.addColorStop(0.82 + rnd() * 0.08, a(0.7 + rnd() * 0.3))
    grad.addColorStop(1, a(0))
    g.fillStyle = grad
    // wrap: draw again wherever the stroke crosses an edge of the tile
    const oxs = [0, ...(x0 + len > TEX ? [-TEX] : []), ...(x0 < 0 ? [TEX] : [])]
    const oys = [0, ...(y0 > TEX - 8 ? [-TEX] : []), ...(y0 < 8 ? [TEX] : [])]
    for (const ox of oxs)
      for (const oy of oys) {
        g.save()
        g.translate(ox, oy)
        g.beginPath()
        g.moveTo(top[0][0], top[0][1])
        for (const p of top) g.lineTo(p[0], p[1])
        for (let i = bot.length - 1; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1])
        g.closePath()
        g.fill()
        g.restore()
      }
  }

  for (let set = 0; set < 2; set++) {
    const ch = set === 0 ? '255,0,0' : '0,255,0'
    for (let r = 0; r < ROWS; r++) {
      const y = (r + (set ? 0.5 : 0) + (rnd() - 0.5) * 0.3) * SP
      let x = rnd() * TEX
      const end = x + TEX
      while (x < end - 30) {
        const len = Math.min(70 + rnd() * 250, end - x)
        stroke(x % TEX, y, len, ch)
        x += len + (rnd() < 0.3 ? -10 - rnd() * 20 : 6 + rnd() * 34)
      }
    }
  }

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  t.needsUpdate = true
  strokeTex = t
  return t
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tStroke;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uCrisp;
uniform float uGrain;
uniform float uSmudge;
uniform float uLineW;
uniform float uLineK;
uniform float uHatchK;
uniform float uGrid;
uniform float uWobble;
uniform float uDouble;
uniform float uDensity;   // 1 = default stroke spacing
uniform float uSeed;      // boil frame

#define TEXN ${TEX.toFixed(1)}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// one hatch direction → ink of the two interleaved stroke sets (R, G)
vec2 hatchDir(vec2 cp, float ang, float texPerCss, float layer) {
  mat2 R = rot(ang);
  vec2 q = R * cp * texPerCss;                       // texture px, u along the strokes
  vec2 dx = R * vec2(texPerCss / uDpr, 0.0) / TEXN;  // analytic derivatives (cp = px / uDpr)
  vec2 dy = R * vec2(0.0, texPerCss / uDpr) / TEXN;
  const float TU = 230.0;
  const float TV = 150.0;
  float row = floor(q.y / TV);
  float hr = hash12(vec2(row * 1.31, layer * 17.0 + uSeed * 3.1));
  float u = q.x / TU + hr;
  vec2 res = vec2(0.0);
  for (int g = 0; g < 2; g++) {
    float ug = u + float(g) * 0.5;
    float col = floor(ug);
    float fu = fract(ug);
    float w = smoothstep(0.0, 0.24, fu) * smoothstep(1.0, 0.76, fu);
    vec2 h = vec2(hash12(vec2(col, row) + layer * 31.7 + uSeed * 7.13),
                  hash12(vec2(row, col) * 1.7 + layer * 13.1 + uSeed * 3.71));
    float r = (hash12(vec2(col * 3.1, row) + uSeed + layer) - 0.5) * 0.1;
    vec2 centre = vec2((col - float(g) * 0.5 - hr + 0.5) * TU, (row + 0.5) * TV);
    vec2 t = rot(r) * (q - centre) + h * TEXN;
    vec2 s = textureGrad(tStroke, t / TEXN, dx, dy).rg;
    res = max(res, s * w);
  }
  return res;
}

float ramp(float t, float a, float b) { return smoothstep(a, b, t); }

float layerInk(vec2 s, float t, float a0, float a1, float b0, float b1) {
  float press = 0.62 + 0.45 * t;                 // darker tone → harder pressure
  vec2 v = s * vec2(ramp(t, a0, a1), ramp(t, b0, b1)) * press;
  v = mix(v, smoothstep(0.2, 0.42, v), uCrisp);  // ink: hard-edged strokes that thin out instead of fading
  return max(v.x, v.y);
}

float hatching(vec2 cp, float t) {
  float k = 2.0 * uDensity;                      // texture px per CSS px (rows ≈ 5.3 CSS px apart)
  float ink = 0.0;
  if (t < 0.05) return 0.0;
  float a = 0.94 + (hash12(vec2(uSeed, 3.0)) - 0.5) * 0.04;
  ink = layerInk(hatchDir(cp, a, k, 1.0), t, 0.07, 0.21, 0.18, 0.32);
  if (t > 0.3) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a - 1.62, k, 2.0), t, 0.3, 0.44, 0.42, 0.55));
  if (t > 0.53) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a - 0.78, k * 1.05, 3.0), t, 0.53, 0.65, 0.63, 0.74));
  if (t > 0.72) ink = 1.0 - (1.0 - ink) * (1.0 - layerInk(hatchDir(cp, a + 0.42, k * 1.45, 4.0), t, 0.72, 0.84, 0.82, 0.94));
  return ink;
}

// depth Laplacian (jumps, not slopes) + normal Sobel (creases); r = sample radius in device px
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

float contour(vec2 px, vec2 cp) {
  float r = max(uLineW * uDpr, 0.75);
  float s = uSeed;
  vec2 j = (vec2(vnoise(cp * 0.045 + s * 1.37), vnoise(cp * 0.045 + vec2(19.1, 3.3) + s * 2.11)) - 0.5) * 3.8;
  j += (vec2(vnoise(cp * 0.22 + s * 5.3), vnoise(cp * 0.22 + vec2(7.7, 1.9) - s * 3.1)) - 0.5) * 1.0;
  j *= uWobble * uDpr;
  float e = edgeAt(px + j, r);
  float press = 0.62 + 0.38 * vnoise(cp * 0.03 + s * 0.77 + 40.0);
  float lift = smoothstep(0.08, 0.22, vnoise(cp * 0.055 + s * 2.9 + 9.0));
  float l = e * press * mix(1.0, lift, 0.85);
  if (uDouble > 0.01) {
    // occasional second, displaced pass: reads as a doubled stroke across a line, an overshoot along it
    float gate = smoothstep(0.48, 0.7, vnoise(cp * 0.012 + s * 0.93 + 70.0));
    if (gate > 0.0) {
      vec2 dir = rot(vnoise(cp * 0.008 + s * 0.5) * 12.0) * vec2(1.0, 0.0);
      vec2 j2 = -0.7 * j + dir * 3.4 * uDpr;
      float e2 = edgeAt(px + j2, r * 0.8) * (0.4 + 0.35 * vnoise(cp * 0.05 + s + 3.0));
      l = max(l, e2 * gate * uDouble);
    }
  }
  return l;
}

float gridLine(vec2 p, float stepPx, float w) {
  vec2 d = abs(mod(p + stepPx * 0.5, stepPx) - stepPx * 0.5);
  float m = min(d.x, d.y);
  float aa = 0.6 / uDpr;
  return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, m);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec3 sc = sceneAt(px);
  float t = clamp((0.93 - luma(sc)) / 0.82, 0.0, 1.0);

  float hInk = hatching(cp, t) * uHatchK;

  float lInk = contour(px, cp) * uLineK;
  lInk = mix(lInk, smoothstep(0.22, 0.45, lInk), uCrisp);

  // charcoal: rubbed-in tone from a blurred copy of the scene
  float sm = 0.0;
  if (uSmudge > 0.01) {
    float acc = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785 + 0.3;
      acc += luma(sceneAt(px + vec2(cos(a), sin(a)) * 7.0 * uDpr));
      acc += 0.5 * luma(sceneAt(px + vec2(cos(a + 0.39), sin(a + 0.39)) * 15.0 * uDpr));
    }
    float tb = clamp((0.95 - acc / 12.0) / 0.84, 0.0, 1.0);
    sm = smoothstep(0.08, 0.9, tb) * (0.7 + 0.3 * vnoise(cp * 0.017 + 3.0)) * 0.78 * uSmudge;
  }

  float ink = 1.0 - (1.0 - hInk) * (1.0 - lInk) * (1.0 - sm);

  // paper tooth: soft media only catches the grain peaks unless pressed hard
  float tooth = 0.55 * vnoise(cp * vec2(0.85, 1.25)) + 0.45 * hash12(floor(cp * 1.4));
  float catchK = smoothstep(0.12, 0.85, tooth + ink * 0.75 - 0.32);
  ink *= mix(1.0, catchK, uGrain);

  vec2 gc = cp - uRes / uDpr * 0.5;
  float grid = max(gridLine(gc, 14.0, 0.7) * 0.13, gridLine(gc, 70.0, 1.2) * 0.3) * uGrid;

  float fib = vnoise(cp * 0.0035) - 0.5;
  vec3 paper = uPaper * (1.0 - 0.04 * fib - 0.03 * (hash12(floor(cp * 1.5)) - 0.5) * (0.3 + uGrain));
  paper = mix(paper, uInk, grid);
  return mix(paper, uInk, clamp(ink, 0.0, 1.0));
}
`

/* ------------------------------------------------------------------ factory + setters */

type SketchState = {
  from: Look
  to: Look
  cur: Look
  k: number
  density: number
  densityTarget: number
  boil: boolean
  t: number
  mode: SketchMode
}

export type SketchEffect = StylizeEffect & { sketch: SketchState }

export function createSketchEffect(): SketchEffect {
  const st: SketchState = {
    from: LOOKS.pencil,
    to: LOOKS.pencil,
    cur: LOOKS.pencil,
    k: 1,
    density: 1,
    densityTarget: 1,
    boil: true,
    t: 0,
    mode: 'pencil',
  }
  const v3 = (c: [number, number, number]) => new THREE.Vector3(...c)
  const u = {
    tStroke: { value: buildStrokeTexture() },
    uPaper: { value: v3(LOOKS.pencil.paper) },
    uInk: { value: v3(LOOKS.pencil.ink) },
    uCrisp: { value: 0 },
    uGrain: { value: 0 },
    uSmudge: { value: 0 },
    uLineW: { value: 1 },
    uLineK: { value: 1 },
    uHatchK: { value: 1 },
    uGrid: { value: 0 },
    uWobble: { value: 1 },
    uDouble: { value: 0 },
    uDensity: { value: 1 },
    uSeed: { value: 0 },
  }
  const apply = (L: Look) => {
    u.uPaper.value.set(...L.paper)
    u.uInk.value.set(...L.ink)
    u.uCrisp.value = L.crisp
    u.uGrain.value = L.grain
    u.uSmudge.value = L.smudge
    u.uLineW.value = L.lineW
    u.uLineK.value = L.lineK
    u.uHatchK.value = L.hatchK
    u.uGrid.value = L.grid
    u.uWobble.value = L.wobble
    u.uDouble.value = L.double
    u.uDensity.value = st.density / L.coarse
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    sketch: st,
    update(dt) {
      st.t += dt
      if (st.boil) u.uSeed.value = Math.floor(st.t * 8) % 997
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.75)
        const e = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, e)
      }
      st.density += (st.densityTarget - st.density) * Math.min(1, dt * 6)
      apply(st.cur)
    },
  }
}

export function setSketchMode(fx: StylizeEffect, mode: SketchMode) {
  const st = (fx as SketchEffect).sketch
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** stroke density, 1 = default (≈ 5 CSS px between strokes); 0.7 sparse … 1.4 dense */
export function setSketchDensity(fx: StylizeEffect, density: number) {
  const st = (fx as SketchEffect).sketch
  if (st) st.densityTarget = density
}

/** "boiling": re-seed the stroke / wobble noise 8× a second; false freezes the drawing */
export function setSketchBoil(fx: StylizeEffect, on: boolean) {
  const st = (fx as SketchEffect).sketch
  if (st) st.boil = on
}
