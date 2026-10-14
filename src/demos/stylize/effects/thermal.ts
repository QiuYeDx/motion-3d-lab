import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 热成像 — the frame re-read as a temperature field and pushed through a sensor palette.
 *
 * TEMPERATURE CONVENTION (what scenes paint to be hot)
 *   The effect reads the linear (un-tonemapped) scene colour. Two sources of "temperature" T (0..1):
 *     · ambient: T_amb = 0.05 + 0.26·luma(sRGB)          — ordinary lit stuff: dark = cold, bright ≈ room temp
 *     · heat:    T_hot = 0.30 + 0.70·(g / r)              — warm emissive colours on a red → orange → yellow ramp
 *   blended by warmth = how red-not-blue the colour is:   w = smoothstep(.2,.75, r−b) · smoothstep(.15,.6, r−g/2)
 *   T = mix(T_amb, T_hot, w).   °C = −10 + 150·T   (T = 1 → 140 °C).
 *   So: paint hot things with an EMISSIVE colour (1, g, 0) (linear) — pure red reads ≈ 35 °C (a body),
 *   orange ≈ 85 °C (an engine), yellow ≈ 140 °C (a bulb). `thermalPaint(°C)` returns exactly that colour;
 *   use it as `emissive` (or a MeshBasicMaterial colour with toneMapped={false}). Saturated warm albedos
 *   (a red ball under a lamp) read as warm too, which is what you want on an arbitrary scene.
 *   The background should be the effect's own dark clear colour (cold sky).
 *
 * SENSOR
 *   · a little optical blur + heat bloom (two rings of temperature taps; hot halos bleed outward)
 *   · fixed-pattern noise (column stripes + per-pixel offset), temporal noise, cold vignetting
 *   · non-uniformity: a slow gradient that drifts in after each calibration … and every ~10 s a NUC
 *     (non-uniformity correction): the shutter drops for ~0.4 s (flat field), the drift resets
 *   · range: `setThermalRange(fx, lo, hi)` (°C) maps that span onto the palette; default −5 … 90 °C
 *
 * MODES: 铁红 ironbow · 彩虹 (turbo-like, perceptually smooth) · 白热 white-hot · 夜视仪 — the last is an
 * image intensifier, not thermal: amplified luminance on a green phosphor with scintillation, bloom
 * around light sources and a round tube vignette. Palettes crossfade; NV crossfades in as a whole.
 */

export const thermalModes = [
  { id: 'iron', label: '铁红' },
  { id: 'rainbow', label: '彩虹' },
  { id: 'white', label: '白热' },
  { id: 'night', label: '夜视仪' },
] as const
export type ThermalMode = (typeof thermalModes)[number]['id']

export const thermalMeta = { title: '热成像', en: 'Thermal Vision', background: '#07060a', theme: 'dark' as const }

/* ------------------------------------------------------------------ temperature helpers (JS side) */

export const T_MIN_C = -10
export const T_SPAN_C = 150
export const celsiusToT = (c: number) => (c - T_MIN_C) / T_SPAN_C
export const tToCelsius = (t: number) => T_MIN_C + T_SPAN_C * t

/** linear colour the effect reads as `celsius` (≥ 35 °C; below that it saturates to pure red). */
export function thermalPaint(celsius: number, target = new THREE.Color()) {
  const t = celsiusToT(celsius)
  const g = THREE.MathUtils.clamp((t - 0.3) / 0.7, 0, 1)
  return target.setRGB(1, g, 0, THREE.LinearSRGBColorSpace)
}

const ss = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
/** JS mirror of the shader's temperature read-out, for a linear colour */
export function thermalTempOf(r: number, g: number, b: number) {
  const s = (c: number) => THREE.MathUtils.clamp(toSrgb(c / (1 + c * 0.12)), 0, 1)
  const amb = 0.05 + 0.26 * (0.299 * s(r) + 0.587 * s(g) + 0.114 * s(b))
  const w = ss(0.2, 0.75, r - b) * ss(0.15, 0.6, r - g * 0.5)
  const hot = 0.3 + 0.7 * THREE.MathUtils.clamp(g / Math.max(r, 1e-3), 0, 1)
  return amb + (hot - amb) * w
}

/**
 * emissive for ANY temperature: ≥ 35 °C → `thermalPaint` at intensity 1; cooler things get a neutral grey
 * (cold) that turns faintly pink toward body heat, at an intensity solved so the shader reads `celsius`.
 * Assumes a dark, dimly lit albedo (bright lighting adds to the ambient term and reads warmer).
 */
export function thermalEmissive(celsius: number, target = new THREE.Color()) {
  const t = celsiusToT(celsius)
  if (t >= 0.3) return { color: thermalPaint(celsius, target), intensity: 1 }
  const red = ss(18, 34, celsius)
  const g = 1 - 0.72 * red
  const b = 1 - 0.85 * red
  let lo = 0
  let hi = 4
  for (let i = 0; i < 28; i++) {
    const k = (lo + hi) / 2
    if (thermalTempOf(k, k * g, k * b) < t) lo = k
    else hi = k
  }
  return { color: target.setRGB(1, g, b, THREE.LinearSRGBColorSpace), intensity: (lo + hi) / 2 }
}

/* ------------------------------------------------------------------ palettes */

const STOPS: Record<Exclude<ThermalMode, 'night'>, [number, string][]> = {
  iron: [
    [0, '#000004'],
    [0.12, '#1b0c5a'],
    [0.3, '#6a0d83'],
    [0.46, '#b3245e'],
    [0.6, '#e8501f'],
    [0.74, '#f99312'],
    [0.88, '#fcd34a'],
    [1, '#fffbe8'],
  ],
  rainbow: [
    [0, '#23103a'],
    [0.1, '#4145ab'],
    [0.22, '#4675ed'],
    [0.34, '#2ab3e6'],
    [0.46, '#1ae0b0'],
    [0.57, '#6dfa64'],
    [0.67, '#c4f034'],
    [0.77, '#f9c432'],
    [0.87, '#f97a1f'],
    [0.95, '#db3a0a'],
    [1, '#ffe8e0'],
  ],
  white: [
    [0, '#050505'],
    [0.5, '#6f6f6f'],
    [1, '#ffffff'],
  ],
}
const NIGHT_STOPS: [number, string][] = [
  [0, '#020a03'],
  [0.5, '#2f8a3a'],
  [1, '#d8ffc8'],
]

/** CSS linear-gradient (bottom → top = cold → hot) for a palette scale bar */
export function thermalPaletteCss(mode: ThermalMode, dir = 'to top') {
  const s = mode === 'night' ? NIGHT_STOPS : STOPS[mode]
  return `linear-gradient(${dir}, ${s.map(([p, c]) => `${c} ${(p * 100).toFixed(0)}%`).join(', ')})`
}

let palTex: THREE.DataTexture | null = null
function buildPalette() {
  if (palTex) return palTex
  const W = 256
  const rows = [STOPS.iron, STOPS.rainbow, STOPS.white]
  const data = new Uint8Array(W * 4 * rows.length)
  const hex = (h: string) => {
    const n = parseInt(h.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  rows.forEach((stops, r) => {
    for (let i = 0; i < W; i++) {
      const t = i / (W - 1)
      let k = 0
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++
      const [p0, c0] = stops[k]
      const [p1, c1] = stops[k + 1]
      const f = THREE.MathUtils.clamp((t - p0) / (p1 - p0), 0, 1)
      // interpolate in sRGB (the stops are display colours)
      const a = hex(c0)
      const b = hex(c1)
      const o = (r * W + i) * 4
      for (let j = 0; j < 3; j++) data[o + j] = Math.round(a[j] + (b[j] - a[j]) * f)
      data[o + 3] = 255
    }
  })
  const t = new THREE.DataTexture(data, W, rows.length)
  t.colorSpace = THREE.NoColorSpace
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  palTex = t
  return t
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;
uniform float uRowA;
uniform float uRowB;
uniform float uRowMix;
uniform float uNV;
uniform vec2 uRange;     // normalised T mapped to palette 0 … 1
uniform float uNuc;      // shutter (flat field) envelope
uniform float uDrift;    // non-uniformity, grows after each NUC
uniform float uDriftA;   // its direction
uniform float uSeed;     // temporal noise frame

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 lin(vec2 px) { return texture2D(tScene, px / uRes).rgb * uExposure; }

float tempOf(vec3 c) {
  vec3 s = linearToSrgb(c / (1.0 + c * 0.12));
  float amb = 0.05 + 0.26 * luma(clamp(s, 0.0, 1.0));
  float w = smoothstep(0.2, 0.75, c.r - c.b) * smoothstep(0.15, 0.6, c.r - c.g * 0.5);
  float hot = 0.3 + 0.7 * clamp(c.g / max(c.r, 1e-3), 0.0, 1.0);
  return mix(amb, hot, w);
}

// image-intensifier response: green-weighted (a red heat paint barely registers, lamps do)
float nvLum(vec3 c) { return dot(c, vec3(0.12, 0.68, 0.2)); }

vec3 palette(float t) {
  t = clamp(t, 0.002, 0.998);
  vec3 a = texture2D(tPal, vec2(t, (uRowA + 0.5) / 3.0)).rgb;
  vec3 b = texture2D(tPal, vec2(t, (uRowB + 0.5) / 3.0)).rgb;
  return mix(a, b, uRowMix);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec3 c0 = lin(px);
  float T0 = tempOf(c0);
  float N0 = nvLum(c0);

  // optics: a soft inner ring + a wide ring for bloom (temperature for thermal, luminance for NV)
  float Tin = 0.0, Nin = 0.0, Tout = 0.0, Nout = 0.0;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472 + 0.3;
    vec2 d = vec2(cos(a), sin(a));
    vec3 ci = lin(px + d * 2.2 * uDpr);
    Tin += tempOf(ci);
    Nin += nvLum(ci);
    vec3 co = lin(px + d * 9.0 * uDpr);
    vec3 cw = lin(px + vec2(-d.y, d.x) * 20.0 * uDpr);
    float to = tempOf(co), tw = tempOf(cw);
    Tout += to * 0.6 + tw * 0.4;
    Nout += nvLum(co) * 0.6 + nvLum(cw) * 0.4;
  }
  Tin /= 6.0; Nin /= 6.0; Nout /= 6.0; Tout /= 6.0;

  /* ---- thermal */
  float T = mix(T0, Tin, 0.45);
  T += max(Tout - T, 0.0) * 0.45;                         // heat bloom bleeds outward from hot things
  float tn = (T - uRange.x) / max(uRange.y - uRange.x, 1e-3);
  // sensor: fixed pattern (columns + pixels), temporal noise, cold vignette, drifting non-uniformity
  float col = hash12(vec2(floor(cp.x * 0.75), 7.0)) - 0.5;
  float fpn = col * 0.016 + (hash12(floor(cp * 0.75) + 3.7) - 0.5) * 0.012;
  float tnoise = (hash12(floor(cp * 0.75) + uSeed * 17.31) - 0.5) * 0.03;
  vec2 vc = uv - 0.5;
  float vig = dot(vc * vec2(uRes.x / uRes.y, 1.0), vc * vec2(uRes.x / uRes.y, 1.0));
  vec2 dd = vec2(cos(uDriftA), sin(uDriftA));
  float nonU = uDrift * (dot(vc, dd) * 0.14 + (vnoise(uv * 2.3 + uDriftA) - 0.5) * 0.08);
  tn += fpn + tnoise + nonU - vig * 0.07;
  // NUC: the shutter covers the sensor → a flat, slightly noisy field
  tn = mix(tn, 0.34 + fpn * 0.6 + tnoise * 0.5, uNuc);
  vec3 th = palette(tn);

  /* ---- night vision */
  vec3 nvc = vec3(0.0);
  if (uNV > 0.01) {
    float I = mix(N0, Nin, 0.35) * 7.0;
    I += max(Nout * 7.0 - 0.8, 0.0) * 0.6;              // halos around light sources
    I = 1.0 - exp(-I * 1.6);
    float grainK = 0.06 + 0.3 * (1.0 - I);              // photon noise: worst in the dark
    float sc = hash12(floor(cp * 0.9) + uSeed * 23.7) - 0.5;
    float spark = step(0.9988, hash12(floor(cp * 0.5) + uSeed * 5.1));
    I = clamp(I + sc * grainK + spark * 0.7, 0.0, 1.0);
    // fibre-optic honeycomb, very faint
    vec2 hp = cp * 0.42;
    vec2 hq = vec2(hp.x + hp.y * 0.5, hp.y * 0.866);
    float hex = smoothstep(0.32, 0.5, length(fract(hq) - 0.5));
    I *= 1.0 - hex * 0.06;
    // tube: round field of view with a soft edge
    float R = min(uRes.x, uRes.y) * 0.49;
    vec2 pc = px - uRes * 0.5;
    float tube = 1.0 - smoothstep(R * 0.86, R * 1.0, length(pc));
    I *= tube * (1.0 - 0.35 * smoothstep(0.3, 1.0, length(pc) / R));
    nvc = mix(vec3(0.008, 0.03, 0.012), vec3(0.42, 1.0, 0.38), I);
    nvc = mix(nvc, vec3(0.86, 1.0, 0.8), smoothstep(0.82, 1.0, I) * 0.7);
    nvc *= 1.0 - 0.85 * uNuc;
  }
  return mix(th, nvc, uNV);
}
`

/* ------------------------------------------------------------------ factory + setters */

const ROW: Record<Exclude<ThermalMode, 'night'>, number> = { iron: 0, rainbow: 1, white: 2 }

type ThermalState = {
  mode: ThermalMode
  rowFrom: number
  rowTo: number
  rowK: number
  nv: number
  nvTarget: number
  lo: number
  hi: number
  loTarget: number
  hiTarget: number
  t: number
  nextNuc: number
  nucT: number // time since the NUC started (-1 = idle)
  drift: number
  nucEnabled: boolean
}
export type ThermalEffect = StylizeEffect & { thermal: ThermalState }

const NUC_LEN = 0.55

export function createThermalEffect(): ThermalEffect {
  const st: ThermalState = {
    mode: 'iron',
    rowFrom: 0,
    rowTo: 0,
    rowK: 1,
    nv: 0,
    nvTarget: 0,
    lo: celsiusToT(-5),
    hi: celsiusToT(90),
    loTarget: celsiusToT(-5),
    hiTarget: celsiusToT(90),
    t: 0,
    nextNuc: 6 + Math.random() * 3,
    nucT: -1,
    drift: 0,
    nucEnabled: true,
  }
  const u = {
    tPal: { value: buildPalette() },
    uRowA: { value: 0 },
    uRowB: { value: 0 },
    uRowMix: { value: 0 },
    uNV: { value: 0 },
    uRange: { value: new THREE.Vector2(st.lo, st.hi) },
    uNuc: { value: 0 },
    uDrift: { value: 0 },
    uDriftA: { value: Math.random() * 6.28 },
    uSeed: { value: 0 },
  }
  return {
    frag: FRAG,
    uniforms: u,
    background: thermalMeta.background,
    thermal: st,
    update(dt) {
      st.t += dt
      u.uSeed.value = Math.floor(st.t * 30) % 512
      // palette crossfade
      if (st.rowK < 1) st.rowK = Math.min(1, st.rowK + dt / 0.6)
      const e = st.rowK * st.rowK * (3 - 2 * st.rowK)
      u.uRowA.value = st.rowFrom
      u.uRowB.value = st.rowTo
      u.uRowMix.value = e
      st.nv += (st.nvTarget - st.nv) * Math.min(1, dt * 5)
      u.uNV.value = st.nv
      // range (AGC) eases
      const k = Math.min(1, dt * 2.2)
      st.lo += (st.loTarget - st.lo) * k
      st.hi += (st.hiTarget - st.hi) * k
      u.uRange.value.set(st.lo, st.hi)
      // non-uniformity drifts in; NUC every ~10 s
      st.drift = Math.min(1, st.drift + dt / 9)
      if (st.nucT < 0 && st.nucEnabled && st.t > st.nextNuc) st.nucT = 0
      if (st.nucT >= 0) {
        st.nucT += dt
        const p = st.nucT
        const env = p < 0.05 ? p / 0.05 : p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / (NUC_LEN - 0.4))
        u.uNuc.value = env
        if (p > 0.2 && st.drift > 0) {
          st.drift = 0
          u.uDriftA.value = Math.random() * 6.28
        }
        if (p >= NUC_LEN) {
          st.nucT = -1
          u.uNuc.value = 0
          st.nextNuc = st.t + 9 + Math.random() * 3
        }
      }
      u.uDrift.value = st.drift
    },
  }
}

export function setThermalMode(fx: StylizeEffect, mode: ThermalMode) {
  const st = (fx as ThermalEffect).thermal
  if (!st || st.mode === mode) return
  st.mode = mode
  if (mode === 'night') {
    st.nvTarget = 1
    return
  }
  st.nvTarget = 0
  const row = ROW[mode]
  if (row !== st.rowTo) {
    // start from wherever the current blend is (rows are discrete, so restart from the visible target)
    st.rowFrom = st.rowK < 0.5 ? st.rowFrom : st.rowTo
    st.rowTo = row
    st.rowK = st.rowFrom === row ? 1 : 0
  }
}

/** palette span in °C; pass null to return to the default (−5 … 90 °C) */
export function setThermalRange(fx: StylizeEffect, range: [number, number] | null) {
  const st = (fx as ThermalEffect).thermal
  if (!st) return
  const [lo, hi] = range ?? [-5, 90]
  st.loTarget = celsiusToT(lo)
  st.hiTarget = celsiusToT(Math.max(hi, lo + 5))
}

/** read-only sensor state for a HUD: whether a NUC is happening and the current (eased) span in °C */
export function thermalStatus(fx: StylizeEffect) {
  const st = (fx as ThermalEffect).thermal
  return { nuc: st.nucT >= 0, range: [tToCelsius(st.lo), tToCelsius(st.hi)] as [number, number], mode: st.mode }
}

/** freeze / resume the periodic NUC (e.g. for posters) */
export function setThermalNuc(fx: StylizeEffect, on: boolean) {
  const st = (fx as ThermalEffect).thermal
  if (st) st.nucEnabled = on
}
