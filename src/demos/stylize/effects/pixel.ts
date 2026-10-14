import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 像素风 — low-resolution render + palette quantization.
 *
 *  · the scene target is rendered at 1 / (pixel size × DPR) of the drawing buffer with nearest filtering
 *    (`fx.scale` is updated every frame from the chosen pixel size); the shader also snaps every device px
 *    to the centre of its art pixel, so the look survives when the lib renders the scene at full res
 *    (e.g. while a before/after split needs the original)
 *  · colours are matched to the palette in OKLab (perceptual), with an optional 4×4 Bayer dither between
 *    the two nearest entries — only when they are neighbours in the palette, so hues don't speckle
 *  · 1-px dark outline on the background side of silhouettes and on the far side of depth steps
 *    (depth Laplacian, so sloped planes don't trigger it), lighter creases where normals turn sharply,
 *    and very bright texels snap to the palette's lightest colour as a "pixel highlight"
 *  · 掌机 = Game Boy 4-tone + LCD pixel grid; CRT = barrel curvature, beam-width scanlines per art row,
 *    aperture-grille RGB mask, glow, vignette — drawn at full resolution over the low-res image
 */

export const pixelModes = [
  { id: 'modern', label: '现代像素' },
  { id: 'gameboy', label: '掌机' },
  { id: 'crt', label: 'CRT' },
] as const
export type PixelMode = (typeof pixelModes)[number]['id']

export const pixelPalettes = [
  {
    id: 'sweetie',
    label: 'Sweetie 16',
    colors: ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
  },
  {
    id: 'pico8',
    label: 'PICO-8',
    colors: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  },
  {
    id: 'endesga',
    label: 'Endesga 32',
    colors: [
      '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633', '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
      '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466', '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
    ],
  },
  { id: 'gb', label: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { id: '1bit', label: '1-bit', colors: ['#16161d', '#f1ead8'] },
] as const
export type PixelPaletteId = (typeof pixelPalettes)[number]['id']

export const pixelMeta = { title: '像素风', en: 'Pixel Art', background: '#29366f', theme: 'dark' as const }

/* ------------------------------------------------------------------ colour */

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function oklab(hex: string): THREE.Vector3 {
  const n = parseInt(hex.slice(1), 16)
  const r = toLin(((n >> 16) & 255) / 255)
  const g = toLin(((n >> 8) & 255) / 255)
  const b = toLin((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return new THREE.Vector3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  )
}

type Pal = { lab: THREE.Vector3[]; info: THREE.Vector4; dark: THREE.Vector3; light: THREE.Vector3 }
function palette(id: PixelPaletteId): Pal {
  const p = pixelPalettes.find((x) => x.id === id) ?? pixelPalettes[0]
  let lab = p.colors.map(oklab)
  const chroma = Math.max(...lab.map((v) => Math.hypot(v.y, v.z)))
  const mono = chroma < 0.06 || id === 'gb' // luminance-only palettes match on L alone
  if (mono) lab = [...lab].sort((a, b) => a.x - b.x)
  let dark = lab[0]
  let light = lab[0]
  for (const v of lab) {
    if (v.x < dark.x) dark = v
    if (v.x > light.x) light = v
  }
  // span: largest colour distance still dithered between (neighbouring ramp steps only)
  const span = id === '1bit' ? 3 : id === 'gb' ? 0.5 : 0.2
  const padded = Array.from({ length: 32 }, (_, i) => (lab[i] ?? lab[0]).clone())
  const band = id === '1bit' ? 0.1 : 0.2
  return { lab: padded, info: new THREE.Vector4(lab.length, mono ? 0 : 1, span, band), dark: dark.clone(), light: light.clone() }
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform float uPixel;     // art pixel, CSS px
uniform vec3 uPalA[32];
uniform vec4 uInfoA;      // count, chroma weight, dither span, dither band start
uniform vec3 uDarkA;
uniform vec3 uLightA;
uniform vec3 uPalB[32];
uniform vec4 uInfoB;
uniform vec3 uDarkB;
uniform vec3 uLightB;
uniform float uPalMix;    // palette A → B, texel-by-texel
uniform vec3 uGB[4];
uniform float uModeA;
uniform float uModeB;
uniform float uMix;
uniform float uDither;
uniform float uOutline;

vec3 toOklab(vec3 srgb) {
  vec3 c = srgbToLinear(clamp(srgb, 0.0, 1.0));
  vec3 lms = vec3(
    0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
    0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
    0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}
vec3 fromOklab(vec3 L) {
  vec3 lms = vec3(
    L.x + 0.3963377774 * L.y + 0.2158037573 * L.z,
    L.x - 0.1055613458 * L.y - 0.0638541728 * L.z,
    L.x - 0.0894841775 * L.y - 1.2914855480 * L.z);
  lms = lms * lms * lms;
  vec3 c = vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  return linearToSrgb(c);
}

float bayer4(vec2 p) {
  p = mod(p, 4.0);
  int i = int(p.x) + int(p.y) * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}

float blockPx() { return max(1.0, floor(uPixel * uDpr + 0.5)); }

vec3 palAt(int w, int i) {
  if (w == 0) return uPalA[i];
  if (w == 1) return uPalB[i];
  return uGB[i];
}
vec4 infoOf(int w) { return w == 0 ? uInfoA : (w == 1 ? uInfoB : vec4(4.0, 0.0, 0.5, 0.2)); }
vec3 darkOf(int w) { return w == 0 ? uDarkA : (w == 1 ? uDarkB : uGB[0]); }
vec3 lightOf(int w) { return w == 0 ? uLightA : (w == 1 ? uLightB : uGB[3]); }

vec3 quantize(vec3 lab, int w, vec2 cell, float dither) {
  vec4 inf = infoOf(w);
  vec3 wt = vec3(1.0, inf.y, inf.y);
  if (inf.y < 0.5) {
    // luminance-only palette: stretch the scene's L onto the palette's L range
    // (entries are sorted by L) — every tone gets an equal share of the scene's range
    float l = pow(clamp((lab.x - 0.14) / 0.74, 0.0, 1.0), 1.2);
    l = mix(l, smoothstep(0.0, 1.0, l), 0.7); // a gentle S: more flat lights and darks
    float f = l * (inf.x - 1.0);
    int i0 = int(min(floor(f), inf.x - 2.0));
    lab.x = mix(palAt(w, i0).x, palAt(w, i0 + 1).x, f - float(i0));
  }
  float d1 = 1e9, d2 = 1e9;
  vec3 p1 = vec3(0.0), p2 = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (float(i) >= inf.x) break;
    vec3 p = palAt(w, i);
    vec3 d = (lab - p) * wt;
    float dd = dot(d, d);
    if (dd < d1) { d2 = d1; p2 = p1; d1 = dd; p1 = p; }
    else if (dd < d2) { d2 = dd; p2 = p; }
  }
  vec3 e = (p2 - p1) * wt;
  float el = length(e);
  float t = clamp(dot((lab - p1) * wt, e) / max(el * el, 1e-6), 0.0, 1.0);
  // dither only near the midpoint between two colours: flat areas stay flat, like hand-made pixel art
  // (inf.w = where the band starts; palettes with few colours dither over a wider band)
  t = smoothstep(inf.w, 0.5, t) * 0.5;
  t *= dither * (1.0 - smoothstep(inf.z * 0.7, inf.z, el));
  return t > bayer4(cell) ? p2 : p1;
}

/* the art itself: one palette colour per low-res texel */
vec3 pixelArt(vec2 px, int forceW) {
  float b = blockPx();
  vec2 cell = floor(px / b);
  vec2 c = (cell + 0.5) * b;
  int w = forceW >= 0 ? forceW : (hash12(cell + 5.17) < uPalMix ? 1 : 0);

  vec3 s = sceneAt(c);
  vec3 lab = toOklab(s);
  lab.yz *= 1.18;                              // pixel art likes a little more chroma
  lab.x = (lab.x - 0.5) * 1.06 + 0.5;
  float cov = coverageAt(c);

  if (uOutline > 0.5) {
    float dC = depthAt(c);
    vec3 nC = normalAt(c);
    float thr = 0.02 * dC + 0.06;
    bool sil = false, behind = false, crease = false;
    vec2 dirs[4];
    dirs[0] = vec2(1.0, 0.0); dirs[1] = vec2(-1.0, 0.0); dirs[2] = vec2(0.0, 1.0); dirs[3] = vec2(0.0, -1.0);
    for (int k = 0; k < 4; k++) {
      vec2 q = c + dirs[k] * b;
      float cn = coverageAt(q);
      if (cov < 0.5 && cn > 0.5) sil = true;
      if (cov > 0.5 && cn > 0.5) {
        float dn = depthAt(q);
        float dOpp = depthAt(c - dirs[k] * b);
        // a depth step (not a slope): neighbour much nearer AND the second difference is large
        if (dC - dn > thr && abs(dn + dOpp - 2.0 * dC) > thr) behind = true;
        if (k == 0 || k == 2) {
          if (dot(nC, normalAt(q)) < 0.6 && abs(dC - dn) < thr) crease = true;
        }
      }
    }
    if (sil) return fromOklab(darkOf(w));
    if (behind) lab.x *= 0.45;
    else if (crease) lab.x *= 0.86;
  }
  if (cov > 0.5 && luma(s) > 0.88) return fromOklab(lightOf(w)); // pixel highlight
  // flat backdrops stay flat: dither only where geometry was drawn
  return fromOklab(quantize(lab, w, cell, uDither * step(0.5, cov)));
}

/* every mode runs pixelArt exactly once (inlining it per mode is too much for some shader compilers) */
vec3 renderMode(float m, vec2 px) {
  float b = blockPx();
  bool gb = m > 0.5 && m < 1.5;
  bool crt = m > 1.5;

  // CRT: barrel-warp the lookup and round the screen corners
  vec2 wpx = px;
  vec2 wuv = px / uRes;
  float r2 = 0.0, screen = 1.0;
  if (crt) {
    vec2 cc = px / uRes - 0.5;
    float asp = uRes.x / uRes.y;
    vec2 k = cc * vec2(asp, 1.0) / max(asp, 1.0);
    r2 = dot(k, k);
    vec2 w = cc * (1.0 + 0.09 * r2 + 0.05 * r2 * r2);
    wuv = w + 0.5;
    vec2 q = abs(w * vec2(asp, 1.0)) - (vec2(0.5 * asp, 0.5) - 0.006) + 0.035;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.035;
    screen = 1.0 - smoothstep(-0.002, 0.001, sd);
    if (screen <= 0.0) return vec3(0.012);
    wpx = wuv * uRes;
  }

  vec3 col = pixelArt(wpx, gb ? 2 : -1);

  if (gb) {
    // 掌机: LCD pixel grid
    vec2 f = fract(px / b) * b;
    float gap = (b >= 3.0 && (f.x < 1.0 || f.y < 1.0)) ? 1.0 : 0.0;
    return mix(col, fromOklab(uGB[3]) * 0.92 + col * 0.08, gap * 0.28);
  }
  if (!crt) return col;

  // scanlines: the beam gets wider on bright rows
  float fy = fract(wpx.y / b) - 0.5;
  float width = mix(0.24, 0.42, luma(col));
  float scan = exp(-fy * fy / (2.0 * width * width));
  col *= mix(1.0, scan, b >= 3.0 ? 0.7 : 0.35) * 1.28;

  // aperture grille in device px (one triad ≈ 3 CSS px)
  float mp = mod(floor(px.x / max(1.0, floor(uDpr + 0.5))), 3.0);
  vec3 mask = vec3(0.78);
  if (mp < 0.5) mask.r = 1.2; else if (mp < 1.5) mask.g = 1.2; else mask.b = 1.2;
  col *= mask;

  // glow from the bright parts of the image
  vec3 g = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.3;
    g += sceneAt(wpx + vec2(cos(a), sin(a)) * b * (i < 4 ? 1.6 : 3.4));
  }
  g /= 8.0;
  col += g * g * 0.42;

  // rolling refresh band + vignette
  col *= 1.0 + 0.05 * smoothstep(0.92, 1.0, sin((wuv.y * 0.6 + uTime * 0.11) * 6.2831853));
  col *= 1.0 - 0.55 * smoothstep(0.12, 0.62, r2);
  return col * screen + vec3(0.012) * (1.0 - screen);
}

vec3 stylize(vec2 px) {
  // texel-by-texel dissolve between modes: pick the mode first, so one mode is evaluated per pixel
  float h = hash12(floor(px / blockPx()) + 13.7) * 0.85;
  bool toB = uMix >= 1.0 || h < uMix;
  vec3 col = renderMode(toB ? uModeB : uModeA, px);
  if (toB && uMix < 1.0 && uModeA != uModeB) col += vec3(0.18) * max(0.0, 1.0 - (uMix - h) * 9.0);
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

type U = {
  uPixel: THREE.IUniform<number>
  uPalA: THREE.IUniform<THREE.Vector3[]>
  uInfoA: THREE.IUniform<THREE.Vector4>
  uDarkA: THREE.IUniform<THREE.Vector3>
  uLightA: THREE.IUniform<THREE.Vector3>
  uPalB: THREE.IUniform<THREE.Vector3[]>
  uInfoB: THREE.IUniform<THREE.Vector4>
  uDarkB: THREE.IUniform<THREE.Vector3>
  uLightB: THREE.IUniform<THREE.Vector3>
  uPalMix: THREE.IUniform<number>
  uModeA: THREE.IUniform<number>
  uModeB: THREE.IUniform<number>
  uMix: THREE.IUniform<number>
  uDither: THREE.IUniform<number>
  uOutline: THREE.IUniform<number>
}
const STATE = new WeakMap<StylizeEffect, { u: U; palette: PixelPaletteId }>()

function load(u: U, slot: 'A' | 'B', p: Pal) {
  u[`uPal${slot}`].value.forEach((v, i) => v.copy(p.lab[i]))
  u[`uInfo${slot}`].value.copy(p.info)
  u[`uDark${slot}`].value.copy(p.dark)
  u[`uLight${slot}`].value.copy(p.light)
}
function copyBtoA(u: U) {
  u.uPalA.value.forEach((v, i) => v.copy(u.uPalB.value[i]))
  u.uInfoA.value.copy(u.uInfoB.value)
  u.uDarkA.value.copy(u.uDarkB.value)
  u.uLightA.value.copy(u.uLightB.value)
}

const deviceDpr = () => (typeof window === 'undefined' ? 1 : Math.min(2, Math.max(1, window.devicePixelRatio || 1)))

export function createPixelEffect(): StylizeEffect {
  const p = palette('sweetie')
  const gb = palette('gb')
  const u: U & { uGB: THREE.IUniform<THREE.Vector3[]> } = {
    uPixel: { value: 4 },
    uPalA: { value: p.lab.map((v) => v.clone()) },
    uInfoA: { value: p.info.clone() },
    uDarkA: { value: p.dark.clone() },
    uLightA: { value: p.light.clone() },
    uPalB: { value: p.lab.map((v) => v.clone()) },
    uInfoB: { value: p.info.clone() },
    uDarkB: { value: p.dark.clone() },
    uLightB: { value: p.light.clone() },
    uPalMix: { value: 1 },
    uGB: { value: gb.lab.slice(0, 4) },
    uModeA: { value: 0 },
    uModeB: { value: 0 },
    uMix: { value: 1 },
    uDither: { value: 1 },
    uOutline: { value: 1 },
  }
  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms: u,
    normals: true,
    filter: 'nearest',
    scale: 1 / Math.max(1, Math.round(4 * deviceDpr())),
    update(dt) {
      // the lib reads fx.scale every frame: one scene texel per art pixel
      fx.scale = 1 / Math.max(1, Math.round(u.uPixel.value * deviceDpr()))
      if (u.uMix.value < 1) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 0.6)
        if (u.uMix.value >= 1) u.uModeA.value = u.uModeB.value
      }
      if (u.uPalMix.value < 1) {
        u.uPalMix.value = Math.min(1, u.uPalMix.value + dt / 0.55)
        if (u.uPalMix.value >= 1) copyBtoA(u)
      }
    },
  }
  STATE.set(fx, { u, palette: 'sweetie' })
  return fx
}

export function setPixelMode(fx: StylizeEffect, mode: PixelMode, instant = false) {
  const s = STATE.get(fx)
  if (!s) return
  const i = pixelModes.findIndex((m) => m.id === mode)
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

/** palette for 现代像素 / CRT (掌机 always uses the Game Boy greens); dissolves texel by texel */
export function setPixelPalette(fx: StylizeEffect, id: PixelPaletteId, instant = false) {
  const s = STATE.get(fx)
  if (!s || s.palette === id) return
  s.palette = id
  const p = palette(id)
  if (instant) {
    load(s.u, 'A', p)
    load(s.u, 'B', p)
    s.u.uPalMix.value = 1
    return
  }
  if (s.u.uPalMix.value >= 0.5) copyBtoA(s.u)
  load(s.u, 'B', p)
  s.u.uPalMix.value = 0
}

/** art-pixel size in CSS px (scene resolution follows) */
export function setPixelSize(fx: StylizeEffect, cssPx: number) {
  const s = STATE.get(fx)
  if (!s) return
  s.u.uPixel.value = cssPx
  fx.scale = 1 / Math.max(1, Math.round(cssPx * deviceDpr()))
}

export function setPixelOptions(fx: StylizeEffect, o: { dither?: boolean; outline?: boolean }) {
  const s = STATE.get(fx)
  if (!s) return
  if (o.dither !== undefined) s.u.uDither.value = o.dither ? 1 : 0
  if (o.outline !== undefined) s.u.uOutline.value = o.outline ? 1 : 0
}

/** world-units-per-art-pixel helper for pixel-snapped orthographic cameras */
export function pixelWorldSize(cssPx: number, dpr: number, zoom: number) {
  return Math.max(1, Math.round(cssPx * dpr)) / (zoom * dpr)
}
