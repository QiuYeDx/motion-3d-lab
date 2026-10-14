import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 字符画 — the scene is redrawn as a grid of glyphs taken from canvas-built atlases.
 *
 *  · cells are sized in CSS px × uDpr (a mono glyph is 0.6 × 1), so the grid looks the same at DPR 1 and 2
 *  · each cell averages four scene taps and picks a glyph by tone; glyphs are read with an explicit mip LOD
 *    (the per-cell uv jumps would otherwise make the GPU pick a blurry mip along every cell border)
 *  · 轮廓 runs a cell-scale Sobel on depth + normals + coverage, takes the dominant orientation from the
 *    structure tensor and swaps the ramp glyph for / \ | - _ — the "pro" ASCII look
 *  · 汉字 orders its CJK candidates by ink coverage measured from the atlas itself
 *  · 盲文 thresholds 2×4 sub-samples per cell (ordered dither) into the U+2800 + bits pattern
 *  · mode switches dissolve cell by cell; `uLens` punches a window to the untouched render
 */

export const asciiModes = [
  { id: 'ramp', label: '明暗' },
  { id: 'edge', label: '轮廓' },
  { id: 'color', label: '彩色' },
  { id: 'han', label: '汉字' },
  { id: 'braille', label: '盲文' },
  { id: 'matrix', label: '代码雨' },
] as const
export type AsciiMode = (typeof asciiModes)[number]['id']

export const asciiMeta = { title: '字符画', en: 'ASCII Art', background: '#0a0c0b', theme: 'dark' as const }

/* ------------------------------------------------------------------ glyph atlases (built once) */

export const ASCII_RAMP = ' .:-=+*#%@'
// edge glyphs | - / \ _ (atlas 10–14) are drawn as strokes so neighbouring cells join into lines
const MATRIX_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z' // 48
const HAN_CANDIDATES = '　丶一二十人三上口土王日田由目石回米国東围星語鬼雷燕龍舞鬱龘'

const MONO = '"Cascadia Mono", Consolas, "SF Mono", Menlo, "Courier New", monospace'
const CJK = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif'
const KANA = '"MS Gothic", "Yu Gothic", "Meiryo", "Hiragino Kaku Gothic ProN", "Noto Sans CJK JP", monospace'

// tile sizes (texels). Mono tiles keep the 0.6 glyph aspect, CJK tiles are square.
const MW = 48
const MH = 80
const HT = 80

type Atlases = {
  ascii: THREE.Texture
  han: THREE.Texture
  braille: THREE.Texture
  hanRamp: string
  hanCov: number[]
}
let cache: Atlases | null = null

function texture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.NoColorSpace
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.anisotropy = 1
  t.needsUpdate = true
  return t
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  return { c, g }
}

function buildAtlases(): Atlases {
  /* mono: ramp (0–9), edge strokes (10–14), mirrored half-width kana + digits for the rain (15–62) */
  const A = canvas(MW * 8, MH * 8)
  const at = (i: number) => [(i % 8) * MW, Math.floor(i / 8) * MH] as const
  A.g.font = `700 62px ${MONO}`
  for (let i = 0; i < ASCII_RAMP.length; i++) {
    const [x, y] = at(i)
    A.g.fillText(ASCII_RAMP[i], x + MW / 2, y + MH / 2 + 3)
  }
  A.g.lineWidth = 7
  A.g.lineCap = 'round'
  const ins = 7
  const strokes: [number, number, number, number][] = [
    [MW / 2, ins, MW / 2, MH - ins], // |
    [ins, MH / 2, MW - ins, MH / 2], // -
    [ins, MH - ins, MW - ins, ins], // /
    [ins, ins, MW - ins, MH - ins], // \
    [ins, MH - 10, MW - ins, MH - 10], // _
  ]
  strokes.forEach(([x0, y0, x1, y1], k) => {
    const [x, y] = at(10 + k)
    A.g.beginPath()
    A.g.moveTo(x + x0, y + y0)
    A.g.lineTo(x + x1, y + y1)
    A.g.stroke()
  })
  A.g.font = `700 64px ${KANA}`
  for (let k = 0; k < 48; k++) {
    const [x, y] = at(15 + k)
    const ch = MATRIX_GLYPHS[k] ?? '0'
    A.g.save()
    A.g.translate(x + MW / 2, y + MH / 2 + 2)
    if (k < 38) A.g.scale(-1, 1) // the film mirrors its katakana
    A.g.fillText(ch, 0, 0)
    A.g.restore()
  }

  /* CJK ramp — measure ink coverage per glyph, then lay the atlas out lightest → densest */
  const probe = canvas(HT, HT)
  probe.g.font = `500 68px ${CJK}`
  const measured = [...HAN_CANDIDATES].map((ch) => {
    probe.g.fillStyle = '#000'
    probe.g.fillRect(0, 0, HT, HT)
    probe.g.fillStyle = '#fff'
    probe.g.fillText(ch, HT / 2, HT / 2 + 3)
    const d = probe.g.getImageData(0, 0, HT, HT).data
    let s = 0
    for (let i = 0; i < d.length; i += 4) s += d[i]
    return { ch, cov: s / (255 * HT * HT) }
  })
  measured.sort((a, b) => a.cov - b.cov)
  // drop near-duplicates in coverage so every step of the ramp is visible
  const ramp: typeof measured = []
  for (const m of measured) if (!ramp.length || m.cov - ramp[ramp.length - 1].cov > 0.006) ramp.push(m)
  const H = canvas(HT * 8, HT * 4)
  H.g.font = `500 68px ${CJK}`
  ramp.slice(0, 32).forEach((m, i) => H.g.fillText(m.ch, (i % 8) * HT + HT / 2, Math.floor(i / 8) * HT + HT / 2 + 3))
  const top = ramp[Math.min(ramp.length, 32) - 1].cov || 1

  /* Braille U+2800 block: tile i is the glyph U+2800 + i (dot n ↔ bit n-1), drawn as dots */
  const B = canvas(MW * 16, MH * 16)
  const dots: [number, number][] = [
    [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3],
  ]
  for (let i = 0; i < 256; i++) {
    const x = (i % 16) * MW
    const y = Math.floor(i / 16) * MH
    for (let b = 0; b < 8; b++) {
      if (!(i & (1 << b))) continue
      const [cx, cy] = dots[b]
      B.g.beginPath()
      B.g.arc(x + MW * (0.3 + 0.4 * cx), y + MH * (0.14 + 0.24 * cy), 7.2, 0, Math.PI * 2)
      B.g.fill()
    }
  }

  return {
    ascii: texture(A.c),
    han: texture(H.c),
    braille: texture(B.c),
    hanRamp: ramp
      .slice(0, 32)
      .map((m) => m.ch)
      .join(''),
    hanCov: Array.from({ length: 32 }, (_, i) => (ramp[i] ? ramp[i].cov / top : 2)),
  }
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tAscii;
uniform sampler2D tHan;
uniform sampler2D tBraille;
uniform float uCell;      // cell height, CSS px
uniform float uModeA;
uniform float uModeB;
uniform float uMix;       // 0 → A, 1 → B (cell-by-cell dissolve)
uniform vec3 uLens;       // x, y, radius in device px (radius 0 = off)
uniform vec3 uLensColor;
uniform float uHanCov[32];
uniform float uHanN;
uniform float uEdgeT;

const float ASPECT = 0.6;
const vec3 BG = vec3(0.039, 0.047, 0.043);

float tone(vec3 c) {
  float v = clamp((luma(c) - 0.035) / 0.78, 0.0, 1.0);
  return pow(v, 0.82);
}

// read a glyph tile with an explicit LOD (no derivative seams at cell borders)
float atlas(sampler2D t, vec2 grid, float tileH, float idx, vec2 uv, float cellH, float blur) {
  float col = mod(idx, grid.x);
  float row = floor(idx / grid.x);
  uv = clamp(uv, 0.015, 0.985);
  vec2 q = vec2((col + uv.x) / grid.x, 1.0 - (row + 1.0 - uv.y) / grid.y);
  float lod = max(log2(tileH / cellH) - 0.4, 0.0) + blur;
  return textureLod(t, q, lod).r;
}
vec3 cellScene(vec2 c, vec2 cs) {
  vec2 o = cs * 0.25;
  return (sceneAt(c - o) + sceneAt(c + o) + sceneAt(c + vec2(o.x, -o.y)) + sceneAt(c + vec2(-o.x, o.y))) * 0.25;
}

vec2 monoCell() { return vec2(ASPECT, 1.0) * uCell * uDpr; }
vec2 hanCell() { return vec2(1.0) * uCell * 1.3 * uDpr; }
vec2 cellOf(float m) { return abs(m - 3.0) < 0.5 ? hanCell() : monoCell(); }

/*
 * Compile cost (ANGLE → HLSL/FXC is slow on big shaders): the mode is chosen first and every expensive
 * routine appears once in the code — one Sobel, one Braille sampler, one glyph read per atlas. Taps that
 * use implicit-derivative texture reads are written out by hand (no loops to unroll, no dynamically
 * indexed arrays); glyph reads use textureLod.
 */

// one Sobel tap with weights (wx, wy): accumulates the depth and the normal+coverage gradients
void sobelTap(vec2 p, float wx, float wy, inout vec2 gD, inout vec4 hx, inout vec4 hy) {
  float d = log(max(depthAt(p), 1e-3)) * 3.0;
  vec4 n = texture2D(tNormal, p / uRes);
  vec4 f = vec4(n.rgb * 2.0 - 1.0, n.a * 1.6);
  gD += vec2(wx, wy) * d;
  hx += wx * f;
  hy += wy * f;
}

// one Braille dot: tone at a sub-position against an ordered-dither threshold t (0..7)
float dot8(vec2 o, vec2 cs, vec2 q, float t, inout float sum) {
  float l = tone(sceneAt(o + q * cs));
  sum += l;
  return l > (t + 0.5) / 8.0 * 0.82 + 0.06 ? 1.0 : 0.0;
}

vec3 renderMode(float m, vec2 px) {
  vec2 cs = cellOf(m);
  vec2 id = floor(px / cs), uv = fract(px / cs), c = (id + 0.5) * cs;
  vec3 sc = cellScene(c, cs);
  float v = tone(sc);

  int atl = 0; // 0 mono, 1 CJK, 2 Braille
  float idx = min(floor(v * 10.0), 9.0);
  vec3 ink = vec3(0.84, 0.96, 0.88);
  float gA = mix(0.5, 1.0, v);
  float hA = 0.22 * v;
  vec3 base = BG;

  if (m < 0.5) {
    /* 0 · 明暗 — the defaults above */
  } else if (m < 1.5) {
    /* 1 · 轮廓 — cell-scale Sobel, structure-tensor orientation */
    vec2 o = cs * 0.5;
    vec2 gD = vec2(0.0);
    vec4 hx = vec4(0.0), hy = vec4(0.0);
    sobelTap(c + vec2(-o.x, -o.y), -1.0, -1.0, gD, hx, hy);
    sobelTap(c + vec2(0.0, -o.y), 0.0, -2.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, -o.y), 1.0, -1.0, gD, hx, hy);
    sobelTap(c + vec2(-o.x, 0.0), -2.0, 0.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, 0.0), 2.0, 0.0, gD, hx, hy);
    sobelTap(c + vec2(-o.x, o.y), -1.0, 1.0, gD, hx, hy);
    sobelTap(c + vec2(0.0, o.y), 0.0, 2.0, gD, hx, hy);
    sobelTap(c + vec2(o.x, o.y), 1.0, 1.0, gD, hx, hy);
    float gyD = gD.y;
    float md = length(gD); // clamp depth so a silhouette doesn't dwarf everything else
    if (md > 6.0) gD *= 6.0 / md;
    float Jxx = gD.x * gD.x + dot(hx, hx);
    float Jxy = gD.x * gD.y + dot(hx, hy);
    float Jyy = gD.y * gD.y + dot(hy, hy);
    float s = sqrt(Jxx + Jyy);
    if (s > uEdgeT) {
      float th = 0.5 * atan(2.0 * Jxy, Jxx - Jyy);           // gradient orientation
      float phi = mod(th + 1.5707963 + 0.3926991, 3.1415927); // line orientation, offset by half a bin
      float k = floor(phi / 0.7853982);
      idx = k < 0.5 ? (gyD < -0.05 ? 14.0 : 11.0) : (k < 1.5 ? 12.0 : (k < 2.5 ? 10.0 : 13.0));
      ink = vec3(0.49, 1.0, 0.6);
      gA = mix(0.65, 1.0, smoothstep(uEdgeT, uEdgeT * 1.8, s));
      hA = 0.35;
    } else {
      ink = vec3(0.36, 0.5, 0.42);
      gA = mix(0.45, 0.95, v);
      hA = 0.12 * v;
    }
  } else if (m < 2.5) {
    /* 2 · 彩色 */
    float mx = max(max(sc.r, sc.g), sc.b);
    vec3 hue = sc / max(mx, 0.08);
    hue = mix(vec3(luma(hue)), hue, 1.35);
    ink = clamp(hue, 0.0, 1.0) * mix(0.55, 1.0, v);
    gA = 1.0;
    hA = 0.25 * v;
    base = BG * (1.0 - 0.6 * v) + sc * 0.07;
  } else if (m < 3.5) {
    /* 3 · 汉字 */
    float best = 0.0, bd = 9.0;
    for (int i = 0; i < 32; i++) {
      if (float(i) >= uHanN) break;
      float d = abs(uHanCov[i] - v);
      if (d < bd) { bd = d; best = float(i); }
    }
    atl = 1;
    idx = best;
    ink = mix(vec3(0.62, 0.44, 0.33), vec3(1.0, 0.93, 0.8), v);
    gA = mix(0.55, 1.0, v);
    hA = 0.2 * v;
  } else if (m < 4.5) {
    /* 4 · 盲文 — dot n (1..8) → bit n-1 */
    vec2 o = id * cs;
    float sum = 0.0;
    float bits = dot8(o, cs, vec2(0.3, 0.86), 0.0, sum)
      + 2.0 * dot8(o, cs, vec2(0.3, 0.62), 6.0, sum)
      + 4.0 * dot8(o, cs, vec2(0.3, 0.38), 1.0, sum)
      + 8.0 * dot8(o, cs, vec2(0.7, 0.86), 4.0, sum)
      + 16.0 * dot8(o, cs, vec2(0.7, 0.62), 2.0, sum)
      + 32.0 * dot8(o, cs, vec2(0.7, 0.38), 5.0, sum)
      + 64.0 * dot8(o, cs, vec2(0.3, 0.14), 7.0, sum)
      + 128.0 * dot8(o, cs, vec2(0.7, 0.14), 3.0, sum);
    float bv = sum / 8.0;
    atl = 2;
    idx = bits;
    ink = mix(vec3(0.45, 0.72, 0.95), vec3(0.85, 0.96, 1.0), bv);
    gA = mix(0.6, 1.0, bv);
    hA = 0.25 * bv;
  } else {
    /* 5 · 代码雨 */
    float rows = ceil(uRes.y / cs.y);
    float row = rows - 1.0 - id.y; // counted from the top
    float trail = 0.0, head = 0.0;
    for (int d = 0; d < 3; d++) {
      float sd = float(d) * 17.13;
      float sp = mix(6.0, 17.0, hash12(vec2(id.x, 3.1 + sd)));
      float L = mix(10.0, 30.0, hash12(vec2(id.x, 7.7 + sd)));
      float period = rows + L + rows * 0.8 * hash12(vec2(id.x, 9.1 + sd));
      float hp = mod(uTime * sp + hash12(vec2(id.x, 1.3 + sd)) * period, period);
      float dist = hp - row;
      if (dist >= 0.0 && dist < L) trail = max(trail, pow(1.0 - dist / L, 1.7));
      if (dist >= 0.0 && dist < 1.0) head = 1.0;
    }
    float rate = 0.6 + 6.0 * hash12(id + 4.2);
    idx = 15.0 + floor(hash12(id + floor(uTime * rate + hash12(id) * 9.0) * 0.731) * 47.99);
    float b = trail * (0.14 + 1.5 * v) + v * 0.55 + head * (0.35 + 0.9 * v);
    ink = mix(vec3(0.3, 1.0, 0.5), vec3(0.85, 1.0, 0.9), clamp(head * 0.8 + v * v * 0.35, 0.0, 1.0));
    gA = b;
    hA = b * 0.45;
  }

  // the single glyph read (+ its blurred mip as a halo)
  float g, hl;
  if (atl == 0) {
    g = smoothstep(0.12, 0.75, atlas(tAscii, vec2(8.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tAscii, vec2(8.0), 80.0, idx, uv, cs.y, 2.2);
  } else if (atl == 1) {
    g = smoothstep(0.1, 0.7, atlas(tHan, vec2(8.0, 4.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tHan, vec2(8.0, 4.0), 80.0, idx, uv, cs.y, 2.0);
  } else {
    g = smoothstep(0.1, 0.7, atlas(tBraille, vec2(16.0), 80.0, idx, uv, cs.y, 0.0));
    hl = atlas(tBraille, vec2(16.0), 80.0, idx, uv, cs.y, 2.0);
  }
  return base + ink * (g * gA + hl * hA);
}

vec3 stylize(vec2 px) {
  // cell-by-cell dissolve: pick the mode first, so one mode is evaluated per pixel
  float m = uModeB;
  float flash = 0.0;
  if (uMix < 1.0 && uModeA != uModeB) {
    float h = hash12(floor(px / cellOf(uModeB)) + 31.7) * 0.8;
    if (h < uMix) flash = max(0.0, 1.0 - (uMix - h) * 8.0); // freshly flipped cells flash
    else m = uModeA;
  }
  vec3 col = renderMode(m, px);
  col = col * (1.0 + 2.2 * flash) + vec3(0.03, 0.09, 0.05) * flash;

  /* lens: the untouched render inside a circle, with a glowing rim */
  if (uLens.z > 0.5) {
    float d = length(px - uLens.xy);
    float r = uLens.z;
    float aa = 1.2 * uDpr;
    float inside = 1.0 - smoothstep(r - aa, r + aa, d);
    vec3 raw = sceneAt(px) * (1.0 - 0.25 * smoothstep(r * 0.55, r, d));
    col = mix(col, raw, inside);
    float rim = exp(-abs(d - r) / (1.6 * uDpr));
    float glow = exp(-max(d - r, 0.0) / (14.0 * uDpr)) * step(r, d);
    col += uLensColor * (rim * 0.9 + glow * 0.18);
  }
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

type State = {
  u: {
    uCell: THREE.IUniform<number>
    uModeA: THREE.IUniform<number>
    uModeB: THREE.IUniform<number>
    uMix: THREE.IUniform<number>
    uLens: THREE.IUniform<THREE.Vector3>
    uLensColor: THREE.IUniform<THREE.Color>
  }
  cellTarget: number
}
const STATE = new WeakMap<StylizeEffect, State>()
const modeIndex = (m: AsciiMode) => asciiModes.findIndex((x) => x.id === m)

export function createAsciiEffect(): StylizeEffect {
  cache ??= buildAtlases()
  const A = cache
  const u = {
    tAscii: { value: A.ascii },
    tHan: { value: A.han },
    tBraille: { value: A.braille },
    uCell: { value: 11 },
    uModeA: { value: 1 },
    uModeB: { value: 1 },
    uMix: { value: 1 },
    uLens: { value: new THREE.Vector3(0, 0, 0) },
    uLensColor: { value: new THREE.Color(0.49, 1.0, 0.6) },
    uHanCov: { value: A.hanCov },
    uHanN: { value: Math.min(32, A.hanRamp.length) },
    uEdgeT: { value: 1.25 },
  }
  const st: State = { u, cellTarget: 11 }
  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms: u,
    normals: true,
    // glyph cells are ≥ 8 CSS px: a half-resolution scene is plenty on hi-DPI screens
    scale: typeof window !== 'undefined' && window.devicePixelRatio >= 1.5 ? 0.5 : 1,
    update(dt) {
      if (u.uMix.value < 1) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 0.7)
        if (u.uMix.value >= 1) u.uModeA.value = u.uModeB.value
      }
      const k = 1 - Math.exp(-dt * 7)
      u.uCell.value += (st.cellTarget - u.uCell.value) * k
      if (Math.abs(st.cellTarget - u.uCell.value) < 0.01) u.uCell.value = st.cellTarget
    },
  }
  STATE.set(fx, st)
  return fx
}

/** switch mode with a cell-by-cell dissolve */
export function setAsciiMode(fx: StylizeEffect, mode: AsciiMode, instant = false) {
  const s = STATE.get(fx)
  if (!s) return
  const i = modeIndex(mode)
  const u = s.u
  if (instant) {
    u.uModeA.value = u.uModeB.value = i
    u.uMix.value = 1
    return
  }
  if (u.uModeB.value === i) return
  if (u.uMix.value >= 0.5) u.uModeA.value = u.uModeB.value
  u.uModeB.value = i
  u.uMix.value = 0
}

/** cell height in CSS px (eased); glyph width follows the 0.6 mono aspect */
export function setAsciiCell(fx: StylizeEffect, cssPx: number, instant = false) {
  const s = STATE.get(fx)
  if (!s) return
  s.cellTarget = cssPx
  if (instant) s.u.uCell.value = cssPx
}

/** lens showing the original render: centre + radius in DEVICE px (y up, as gl_FragCoord); r = 0 hides it */
export function setAsciiLens(fx: StylizeEffect, x: number, y: number, r: number) {
  STATE.get(fx)?.u.uLens.value.set(x, y, r)
}

/** the ramps actually in use (the CJK one is measured from the atlas at runtime) */
export function asciiRamps() {
  cache ??= buildAtlases()
  return { ascii: ASCII_RAMP, han: cache.hanRamp.replace('　', ' '), braille: '⠀⠁⠃⠇⡇⣇⣧⣷⣿' }
}
