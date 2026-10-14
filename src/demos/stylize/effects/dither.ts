import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'
import { hexToRgb } from '../../shader/glsl'

/*
 * 1-bit dither — every "dither cell" (uCell CSS px, snapped to whole device px) becomes one of two inks.
 *
 *   bayer  ordered 8×8 Bayer threshold matrix
 *   blue   64×64 blue-noise threshold texture, generated on the CPU with void-and-cluster (cached per page)
 *   error  Atkinson error diffusion, evaluated on the GPU: each cell re-runs the Atkinson scan over a small
 *          causal window (4 rows × ≤13 cells) of its neighbours. Atkinson only passes on 6/8 of the error, so
 *          the influence of anything outside the window has decayed to almost nothing — the result is close to a
 *          true serial pass, without a read-back. Window borders are seeded from blue noise so flat areas don't
 *          collapse into a regular pattern.
 *
 * World-stable (Obra Dinn): the threshold pattern is shifted, whole cells at a time, by the camera's yaw/pitch
 * times its focal length, so when the camera turns the pattern travels with the world instead of the image
 * "swimming" through a screen-fixed screen. Needs `bindDitherCamera(fx, camera)`; without it the pattern simply
 * stays in screen space. Error diffusion is a screen-order scan by nature, so the toggle doesn't apply to it.
 *
 * Edges: depth (1/z Laplacian, near side only) + normal creases on the cell grid, drawn in the dark ink — or
 * the light ink where the surface itself is in deep shadow, so silhouettes still read inside the dark.
 */

export type DitherMode = 'bayer' | 'blue' | 'error'
export type DitherPalette = 'obra' | 'mac' | 'phosphor' | 'duo'

export const ditherMeta = { title: '1-bit 抖动', en: '1-bit Dither', background: '#e8dfc8', theme: 'light' as const }

export const ditherModes: { id: DitherMode; label: string; en: string }[] = [
  { id: 'bayer', label: 'Bayer 8×8', en: 'Ordered' },
  { id: 'blue', label: '蓝噪声', en: 'Blue noise' },
  { id: 'error', label: '误差扩散', en: 'Atkinson' },
]

export const ditherPalettes: { id: DitherPalette; label: string; dark: string; light: string }[] = [
  { id: 'obra', label: '奥伯拉丁', dark: '#2b2118', light: '#e8dfc8' },
  { id: 'mac', label: 'Mac 1-bit', dark: '#000000', light: '#ffffff' },
  { id: 'phosphor', label: '磷光绿', dark: '#07160c', light: '#5cff86' },
  { id: 'duo', label: '两色印刷', dark: '#1f3a93', light: '#f6c4ad' },
]

/* ------------------------------------------------------------------ threshold textures (CPU, cached) */

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** void-and-cluster blue noise (Ulichney 1993): returns ranks 0..N²-1 */
function voidAndCluster(N: number, sigma = 1.6, seed = 7) {
  const S = N * N
  // toroidal gaussian, stored 2N wide/high so lookups need no modulo
  const G = new Float32Array(4 * S)
  for (let y = 0; y < 2 * N; y++)
    for (let x = 0; x < 2 * N; x++) {
      const dx = Math.min(x % N, N - (x % N))
      const dy = Math.min(y % N, N - (y % N))
      G[y * 2 * N + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
    }
  const splat = (E: Float32Array, p: number, s: number) => {
    const px = p % N
    const py = (p / N) | 0
    for (let y = 0; y < N; y++) {
      const g = (y - py + N) * 2 * N + N - px
      const row = y * N
      for (let x = 0; x < N; x++) E[row + x] += s * G[g + x]
    }
  }
  const argExt = (E: Float32Array, B: Uint8Array, want: number, max: boolean) => {
    let best = -1
    let bv = max ? -Infinity : Infinity
    for (let i = 0; i < S; i++) {
      if (B[i] !== want) continue
      const v = E[i]
      if (max ? v > bv : v < bv) {
        bv = v
        best = i
      }
    }
    return best
  }

  // 1 · initial binary pattern: ~10% random points, then relax (swap tightest cluster → largest void)
  const rnd = mulberry32(seed)
  const B = new Uint8Array(S)
  const E = new Float32Array(S)
  let ones = 0
  const target = Math.round(S * 0.1)
  while (ones < target) {
    const p = Math.floor(rnd() * S)
    if (B[p]) continue
    B[p] = 1
    splat(E, p, 1)
    ones++
  }
  for (let guard = 0; guard < S * 4; guard++) {
    const c = argExt(E, B, 1, true)
    B[c] = 0
    splat(E, c, -1)
    const v = argExt(E, B, 0, false)
    B[v] = 1
    splat(E, v, 1)
    if (v === c) break
  }

  const rank = new Uint32Array(S)
  // 2 · ranks below the prototype: peel off tightest clusters
  {
    const B1 = B.slice()
    const E1 = E.slice()
    let n = ones
    while (n > 0) {
      const c = argExt(E1, B1, 1, true)
      B1[c] = 0
      splat(E1, c, -1)
      n--
      rank[c] = n
    }
  }
  // 3 · ranks above: fill the largest voids
  {
    let n = ones
    while (n < S) {
      const v = argExt(E, B, 0, false)
      B[v] = 1
      splat(E, v, 1)
      rank[v] = n
      n++
    }
  }
  return rank
}

let TEX: { bayer: THREE.DataTexture; blue: THREE.DataTexture } | null = null

function makeTex(values: ArrayLike<number>, N: number, levels: number) {
  const data = new Uint8Array(N * N * 4)
  for (let i = 0; i < N * N; i++) {
    const v = Math.round(((values[i] + 0.5) / levels) * 255)
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

function textures() {
  if (TEX) return TEX
  // Bayer 8×8 by recursive doubling
  let m = [[0]]
  while (m.length < 8) {
    const n = m.length
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array(n * 2).fill(0))
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y][x]
        next[y][x] = v
        next[y][x + n] = v + 2
        next[y + n][x] = v + 3
        next[y + n][x + n] = v + 1
      }
    m = next
  }
  TEX = {
    bayer: makeTex(m.flat(), 8, 64),
    blue: makeTex(voidAndCluster(64), 64, 4096),
  }
  return TEX
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tBayer;
uniform sampler2D tBlue;
uniform float uCell;      // dither cell, CSS px
uniform float uModeA;     // 0 bayer · 1 blue · 2 error
uniform float uModeB;
uniform float uModeMix;   // cells dissolve A → B in blue-noise order
uniform float uWorld;     // 0 screen-space · 1 world-stable (also dissolves)
uniform vec2 uPan;        // camera yaw / pitch, radians
uniform float uProjY;     // projectionMatrix[1][1] (0 = no camera bound)
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uContrast;
uniform float uGamma;
uniform float uBias;
uniform float uEdge;

float CELL;

float toneAt(vec2 cell) {
  float v = luma(sceneAt((cell + 0.5) * CELL));
  v = pow(max(v, 0.0), uGamma);
  return clamp((v - 0.5) * uContrast + 0.5 + uBias, 0.0, 1.0);
}
float bayerAt(vec2 c) { return texture2D(tBayer, (mod(c, 8.0) + 0.5) / 8.0).r; }
float blueAt(vec2 c) { return texture2D(tBlue, (mod(c, 64.0) + 0.5) / 64.0).r; }

#define EL 9
#define EW 13
// Atkinson error diffusion over a causal window ending at this cell. Rows scan top → bottom
// (decreasing gl y), cells left → right; row r only needs to reach (3 - r) cells past this column.
float atkinson(vec2 c) {
  float e0[EW];
  float e1[EW];
  float e2[EW];
  for (int i = 0; i < EW; i++) { e0[i] = 0.0; e1[i] = 0.0; e2[i] = 0.0; }
  float o = 0.0;
  for (int r = 0; r < 4; r++) {
    float y = c.y + float(3 - r);
    for (int i = 0; i < EW; i++) {
      if (i > EL + 3 - r) break;
      vec2 q = vec2(c.x + float(i - EL), y);
      float v = toneAt(q) + e0[i];
      // the error that would have arrived from outside the window is unknown: seed it with blue noise
      if (r == 0 || i < 2) v += (blueAt(q + vec2(17.0, 31.0)) - 0.5) * 0.4;
      o = step(0.5, v);
      float err = (v - o) * 0.125;
      if (i + 1 < EW) e0[i + 1] += err;
      if (i + 2 < EW) e0[i + 2] += err;
      if (i > 0) e1[i - 1] += err;
      e1[i] += err;
      if (i + 1 < EW) e1[i + 1] += err;
      e2[i] += err;
    }
    for (int i = 0; i < EW; i++) { e0[i] = e1[i]; e1[i] = e2[i]; e2[i] = 0.0; }
  }
  return o;
}

float ditherWith(float mode, vec2 c, vec2 pc, float v) {
  if (mode > 1.5) return atkinson(c);
  float t = mode < 0.5 ? bayerAt(pc) : blueAt(pc);
  return step(t, v);
}

// x: edge strength · y: 1 if it's a silhouette (depth step) rather than a crease
vec2 edgeAt(vec2 c) {
  vec2 p = (c + 0.5) * CELL;
  vec2 dx = vec2(CELL, 0.0), dy = vec2(0.0, CELL);
  float i0 = 1.0 / depthAt(p);
  float iL = 1.0 / depthAt(p - dx), iR = 1.0 / depthAt(p + dx);
  float iD = 1.0 / depthAt(p - dy), iU = 1.0 / depthAt(p + dy);
  // Laplacian of 1/z is ~0 on planes; strongly negative on the near side of a depth step
  float lap = min(iL + iR - 2.0 * i0, iD + iU - 2.0 * i0) / i0;
  float sil = smoothstep(0.035, 0.07, -lap);
  float e = sil;
  vec3 n = normalAt(p);
  if (dot(n, n) > 0.5) {
    vec3 nr = normalAt(p + dx), nu = normalAt(p + dy);
    float crease = min(dot(nr, nr) > 0.5 ? dot(n, nr) : 1.0, dot(nu, nu) > 0.5 ? dot(n, nu) : 1.0);
    e = max(e, smoothstep(0.82, 0.62, crease));
  }
  return vec2(e, step(0.5, sil));
}

vec3 stylize(vec2 px) {
  CELL = max(1.0, floor(uCell * uDpr + 0.5));
  vec2 c = floor(px / CELL);
  float v = toneAt(c);

  // world-stable pattern: shift by the camera's turn, in whole cells
  float focal = 0.5 * uRes.y * uProjY;
  vec2 pan = floor(uPan * focal / CELL + 0.5);
  float h = hash12(c * 0.7919 + 3.17);
  vec2 pc = c + (h < uWorld ? pan : vec2(0.0));

  float mode = blueAt(c + vec2(7.0, 3.0)) < uModeMix ? uModeB : uModeA;
  float ink = 1.0 - ditherWith(mode, c, pc, v); // 1 = dark

  vec2 e = edgeAt(c);
  // dark ink lines; a silhouette inside deep shadow flips to the light ink so the shape still reads
  if (e.x * uEdge > 0.5) ink = (e.y > 0.5 && v < 0.06) ? 0.0 : 1.0;
  return mix(uLight, uDark, ink);
}
`

/* ------------------------------------------------------------------ factory + controls */

type State = {
  mode: number
  pending: number | null
  world: number
  worldTarget: number
  dark: THREE.Vector3
  light: THREE.Vector3
  darkT: THREE.Vector3
  lightT: THREE.Vector3
  camera: THREE.Camera | null
  yaw: number
  prevYaw: number | null
  dir: THREE.Vector3
}
// keyed by the uniforms object, which survives `{ ...fx }` copies made by other demos
const STATE = new WeakMap<object, State>()
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)
const MODE_INDEX: Record<DitherMode, number> = { bayer: 0, blue: 1, error: 2 }
const v3 = (hex: string) => new THREE.Vector3(...hexToRgb(hex))

export function createDitherEffect(init: { mode?: DitherMode; palette?: DitherPalette; world?: boolean } = {}): StylizeEffect {
  const tex = textures()
  const pal = ditherPalettes.find((p) => p.id === (init.palette ?? 'obra'))!
  const m0 = MODE_INDEX[init.mode ?? 'blue']
  const uniforms = {
    tBayer: { value: tex.bayer },
    tBlue: { value: tex.blue },
    uCell: { value: 2 },
    uModeA: { value: m0 },
    uModeB: { value: m0 },
    uModeMix: { value: 0 },
    uWorld: { value: init.world === false ? 0 : 1 },
    uPan: { value: new THREE.Vector2() },
    uProjY: { value: 0 },
    uDark: { value: v3(pal.dark) },
    uLight: { value: v3(pal.light) },
    uContrast: { value: 1.6 },
    uGamma: { value: 0.9 },
    uBias: { value: 0 },
    uEdge: { value: 1 },
  }
  const st: State = {
    mode: m0,
    pending: null,
    world: uniforms.uWorld.value,
    worldTarget: uniforms.uWorld.value,
    dark: uniforms.uDark.value,
    light: uniforms.uLight.value,
    darkT: uniforms.uDark.value.clone(),
    lightT: uniforms.uLight.value.clone(),
    camera: null,
    yaw: 0,
    prevYaw: null,
    dir: new THREE.Vector3(),
  }
  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms,
    normals: true,
    update(dt) {
      // mode dissolve (blue-noise order, so even the transition is dithered)
      if (uniforms.uModeA.value !== uniforms.uModeB.value) {
        uniforms.uModeMix.value = Math.min(1, uniforms.uModeMix.value + dt / 0.7)
        if (uniforms.uModeMix.value >= 1) {
          uniforms.uModeA.value = uniforms.uModeB.value
          uniforms.uModeMix.value = 0
        }
      }
      // world / screen dissolve
      const dw = st.worldTarget - st.world
      st.world += Math.sign(dw) * Math.min(Math.abs(dw), dt / 0.6)
      uniforms.uWorld.value = st.world
      // palette ease
      const k = 1 - Math.exp(-dt * 7)
      st.dark.lerp(st.darkT, k)
      st.light.lerp(st.lightT, k)
      // camera turn → pattern pan
      const cam = st.camera as THREE.PerspectiveCamera | null
      if (cam && cam.isPerspectiveCamera) {
        cam.getWorldDirection(st.dir)
        const yaw = Math.atan2(st.dir.x, -st.dir.z)
        if (st.prevYaw !== null) {
          let d = yaw - st.prevYaw
          if (d > Math.PI) d -= 2 * Math.PI
          if (d < -Math.PI) d += 2 * Math.PI
          st.yaw += d
        } else st.yaw = yaw
        st.prevYaw = yaw
        uniforms.uPan.value.set(st.yaw, Math.asin(THREE.MathUtils.clamp(st.dir.y, -1, 1)))
        uniforms.uProjY.value = cam.projectionMatrix.elements[5]
      } else {
        uniforms.uProjY.value = 0
      }
    },
  }
  STATE.set(uniforms, st)
  return fx
}

type U = { [k: string]: THREE.IUniform }
const uni = (fx: StylizeEffect) => fx.uniforms as U

/** switch the dither method; cells dissolve from the old method to the new one */
export function setDitherMode(fx: StylizeEffect, mode: DitherMode) {
  const u = uni(fx)
  const m = MODE_INDEX[mode]
  if (u.uModeB.value === m && u.uModeMix.value === 0 && u.uModeA.value === m) return
  if (u.uModeA.value !== u.uModeB.value && u.uModeMix.value > 0.5) u.uModeA.value = u.uModeB.value
  u.uModeB.value = m
  u.uModeMix.value = 0
  if (u.uModeA.value === m) u.uModeB.value = m
}

export function setDitherPalette(fx: StylizeEffect, id: DitherPalette, instant = false) {
  const st = stateOf(fx)
  const p = ditherPalettes.find((q) => q.id === id)
  if (!st || !p) return
  st.darkT.set(...hexToRgb(p.dark))
  st.lightT.set(...hexToRgb(p.light))
  if (instant) {
    st.dark.copy(st.darkT)
    st.light.copy(st.lightT)
  }
}

/** world-stable (Obra Dinn) vs screen-space threshold pattern */
export function setDitherWorld(fx: StylizeEffect, on: boolean) {
  const st = stateOf(fx)
  if (st) st.worldTarget = on ? 1 : 0
}

/** contrast (1 = neutral), bias (−0.5…0.5, shifts the threshold), gamma (<1 lifts mid-tones) */
export function setDitherTone(fx: StylizeEffect, t: { contrast?: number; bias?: number; gamma?: number; edges?: number; cell?: number }) {
  const u = uni(fx)
  if (t.contrast !== undefined) u.uContrast.value = t.contrast
  if (t.bias !== undefined) u.uBias.value = t.bias
  if (t.gamma !== undefined) u.uGamma.value = t.gamma
  if (t.edges !== undefined) u.uEdge.value = t.edges
  if (t.cell !== undefined) u.uCell.value = t.cell
}

/** give the effect the scene camera so the world-stable pattern can follow its turns */
export function bindDitherCamera(fx: StylizeEffect, camera: THREE.Camera | null) {
  const st = stateOf(fx)
  if (!st) return
  st.camera = camera
  st.prevYaw = null
}
