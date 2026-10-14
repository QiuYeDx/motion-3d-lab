import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 全息投影 — the frame re-drawn as projected light: nothing is lit, everything glows.
 *
 * LIGHT MODEL (per pixel, from the normal buffer + scene colour)
 *   I = cov · (0.04 + 1.05·fres + 0.5·L²·(0.3 + 0.7·f) + 0.12·L),   f = view-facing-ness (n.z), fres = (1 − f)²
 *   so silhouettes and grazing surfaces glow, faces turned to the viewer are thin and show what is behind
 *   (a dim procedural room: dark gradient + dot grid), and the scene's own lighting survives as faint interior
 *   shading (L = scene luma). Composited additively over that backdrop — the subject is translucent.
 *   Chromatic dispersion: the three output channels read I at three horizontal offsets; the offset grows from
 *   ~1 px on faces to ~4 px at silhouettes. A halo (6 coverage taps at 7 / 15 px) blooms around the subject.
 *
 * SOLID THINGS (the projector, the table) — a scene can keep objects "real" by marking their material:
 *   `hologramSolid(material)` sets NoBlending + opacity 0.25, so they write alpha 0.25 into the scene target.
 *   Those pixels are shown as the plain render (plus the projector's light spill) and never become hologram.
 *   On an unmarked scene (alpha 1 everywhere) everything is projected.
 *
 * SIGNAL (driven by timers in update(dt), never by React)
 *   scrolling scanlines + a slow bright sweep, stepped data sparkles and dashes, a constant faint flicker and,
 *   every few seconds (rate and size from `setHologramStability`): a horizontal band that shears sideways for a
 *   few stepped "frames", a brightness drop of a frame or two, or a vertical jump that snaps back (re-sync).
 *   `glitchHologram(fx)` forces one.
 *
 * PROJECTOR (optional, `setHologramProjector`): a light cone rising from a lens point (CSS px) with drifting
 *   rays and bright edges, a ring emitter disc around the lens, and a light pool on solid things near it.
 *
 * MODES (all features are uniform amounts crossfaded on the CPU; the shader has no per-mode branches)
 *   星战 starwars — blue-white, heavy rolling scanlines, line jitter, 2.5 px low-res blocks, chunky noise, flicker
 *   赛博 cyber    — cyan with magenta fringes, crisp silhouettes, wireframe from normal creases + an
 *                   iso-normal graticule, light lines, little noise
 *   医疗 medical  — green-teal, a slicing plane sweeps up and down (bright cut line, ruler ticks, depth
 *                   contours of the cross-section around it), soft lines
 */

export const hologramModes = [
  { id: 'starwars', label: '星战' },
  { id: 'cyber', label: '赛博' },
  { id: 'medical', label: '医疗' },
] as const
export type HologramMode = (typeof hologramModes)[number]['id']

export const hologramMeta = { title: '全息投影', en: 'Hologram', background: '#02070d', theme: 'dark' as const }

/** CSS colour of each mode's light, for DOM chrome that should match */
export const hologramAccent: Record<HologramMode, string> = {
  starwars: '#8cc8ff',
  cyber: '#3ef2ff',
  medical: '#4dffb8',
}

/** keep a material "real" (not projected): it writes alpha 0.25 into the scene target, which the effect reads */
export function hologramSolid<M extends THREE.Material>(m: M): M {
  m.blending = THREE.NoBlending
  m.transparent = false
  m.opacity = 0.25
  m.needsUpdate = true
  return m
}

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = {
  colA: V3 // channel read at +offset
  colB: V3 // centre
  colC: V3 // −offset
  tint: V3 // halo, sparkles, wire, cone
  scanP: number // scanline period, CSS px
  scanS: number // scanline depth
  scanV: number // scroll speed, CSS px / s
  sweep: number // slow bright sweep band
  pix: number // low-res block, CSS px (1 = off)
  chunk: number // noise cell, CSS px
  noise: number
  wire: number // crease wireframe + crisp silhouettes
  grid: number // iso-normal graticule
  dispB: number // dispersion on faces, CSS px
  dispE: number // extra at silhouettes
  jit: number // per-line horizontal jitter, CSS px
  flick: number // constant flicker depth
  med: number // slicing plane + contours
  gain: number
}

const LOOKS: Record<HologramMode, Look> = {
  starwars: {
    colA: [0.36, 0.2, 0.18],
    colB: [0.18, 0.5, 0.52],
    colC: [0.04, 0.12, 0.42],
    tint: [0.5, 0.75, 1.0],
    scanP: 4.2,
    scanS: 0.62,
    scanV: 16,
    sweep: 0.55,
    pix: 2.5,
    chunk: 3,
    noise: 0.75,
    wire: 0,
    grid: 0,
    dispB: 0.8,
    dispE: 2.6,
    jit: 1.3,
    flick: 0.16,
    med: 0,
    gain: 1.05,
  },
  cyber: {
    colA: [0.42, 0.06, 0.36],
    colB: [0.1, 0.78, 0.8],
    colC: [0.0, 0.16, 0.34],
    tint: [0.3, 0.95, 1.0],
    scanP: 3,
    scanS: 0.2,
    scanV: 28,
    sweep: 0.35,
    pix: 1,
    chunk: 1.5,
    noise: 0.3,
    wire: 1,
    grid: 1,
    dispB: 0.6,
    dispE: 4.2,
    jit: 0,
    flick: 0.03,
    med: 0,
    gain: 0.95,
  },
  medical: {
    colA: [0.1, 0.32, 0.12],
    colB: [0.12, 0.6, 0.42],
    colC: [0.02, 0.1, 0.2],
    tint: [0.3, 1.0, 0.72],
    scanP: 5,
    scanS: 0.3,
    scanV: 10,
    sweep: 0,
    pix: 1,
    chunk: 2,
    noise: 0.35,
    wire: 0.35,
    grid: 0,
    dispB: 0.4,
    dispE: 1.8,
    jit: 0.2,
    flick: 0.05,
    med: 1,
    gain: 1,
  },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number | V3>
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    o[key] = Array.isArray(x) ? (x.map((v, i) => v + ((y as V3)[i] - v) * k) as V3) : (x as number) + ((y as number) - (x as number)) * k
  }
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform vec3 uTint;
uniform vec4 uScan;     // period, depth, speed, sweep
uniform vec4 uLook;     // pix, chunk, noise, wire
uniform vec4 uLook2;    // dispersion base, edge, line jitter, graticule
uniform vec4 uMisc;     // flicker mult, gain, medical, slice y (0..1 from the bottom)
uniform vec4 uBand;     // y0, y1 (0..1 from the bottom), shift CSS px, on
uniform vec2 uSig;      // vertical roll CSS px, seed
uniform vec4 uCone;     // lens x, y (CSS px from the bottom-left), top half-width, height
uniform vec4 uCone2;    // lens half-width, disc rx, disc ry, amount
uniform vec2 uSliceX;   // horizontal extent of the slicing plane, 0..1

vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec4 colL(vec2 p) { return textureLod(tScene, p / uRes, 0.0); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// x = light, y = fresnel, z = hologram coverage, w = scene luma; nn = view normal
vec4 tapAt(vec2 p, out vec3 nn) {
  vec4 n = nrmL(p);
  vec4 c = colL(p);
  float cov = n.a * smoothstep(0.45, 0.85, c.a);
  nn = normalize(n.rgb * 2.0 - 1.0);
  float f = clamp(nn.z, 0.0, 1.0);
  float fres = (1.0 - f) * (1.0 - f);
  // display-ish luma without three pow()s per tap (cheap to compile on D3D)
  float L = sqrt(clamp(luma(c.rgb * uExposure), 0.0, 1.0));
  float I = 0.04 + 1.05 * fres + 0.5 * L * L * (0.3 + 0.7 * f) + 0.12 * L;
  return vec4(I * cov, fres * cov, cov, L);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = cp / res;
  float seed = uSig.y;

  /* ---- signal: vertical re-sync jump, sheared band, per-line jitter, low-res blocks */
  vec2 q = cp;
  q.y += uSig.x;
  float yN = q.y / res.y;
  float band = uBand.w * step(uBand.x, yN) * step(yN, uBand.y);
  float row = floor(q.y / 2.0);
  q.x += band * (uBand.z + (hash12(vec2(row, seed)) - 0.5) * 7.0);
  q.x += (hash12(vec2(row, floor(uTime * 20.0))) - 0.5) * uLook2.z;
  if (uLook.x > 1.01) q = (floor(q / uLook.x) + 0.5) * uLook.x;

  /* ---- taps (one call site): 0 centre, 1/2 dispersion ±d, 3–8 ring at 1.6 px (creases, outline,
     graticule), 9–14 halo ring at 7 / 15 px */
  vec2 dir = vec2(1.0, 0.16);
  float d = 0.0;
  vec3 nC = vec3(0.0, 0.0, 1.0);
  float covC = 0.0, fresC = 0.0;
  vec3 I3 = vec3(0.0);
  float crease = 0.0, iso = 0.0, sil = 0.0, halo = 0.0;
  for (int i = 0; i < 15; i++) {
    float k = float(i);
    vec2 o = vec2(0.0);
    if (i == 1) o = dir * d;
    else if (i == 2) o = -dir * d;
    else if (i > 2 && i < 9) { float a = (k - 3.0) * 1.0472 + 0.3; o = vec2(cos(a), sin(a)) * 1.6; }
    else if (i >= 9) { float a = (k - 9.0) * 1.0472 + 0.82; o = vec2(cos(a), sin(a)) * (mod(k, 2.0) < 0.5 ? 7.0 : 15.0); }
    vec3 nn;
    vec4 t = tapAt((q + o) * uDpr, nn);
    if (i == 0) {
      nC = nn; covC = t.z; fresC = t.y; I3.y = t.x;
      d = uLook2.x + uLook2.y * mix(1.0, fresC, covC) + band * 5.0;
    }
    else if (i == 1) I3.x = t.x;
    else if (i == 2) I3.z = t.x;
    else if (i < 9) {
      float both = covC * t.z;
      crease = max(crease, (1.0 - dot(nC, nn)) * both);
      vec2 qa = floor(nC.xy * 5.0), qb = floor(nn.xy * 5.0);
      iso = max(iso, both * step(0.5, abs(qa.x - qb.x) + abs(qa.y - qb.y)));
      sil = max(sil, abs(t.z - covC));
    }
    else halo += t.z * (0.3 + t.y);
  }
  halo /= 6.0;

  /* ---- hologram light */
  vec3 holo = uColA * I3.x + uColB * I3.y + uColC * I3.z;
  float wire = smoothstep(0.05, 0.22, crease) * 0.9 + sil * 0.7;
  holo += uTint * (wire * uLook.w * 0.8 + iso * uLook2.w * 0.3);
  holo += uTint * halo * 0.2;

  // scanlines scroll upward; a slow brighter sweep rides up the image
  float ph = (cp.y - uTime * uScan.z) / uScan.x;
  float sl = 0.5 + 0.5 * cos(ph * 6.2832);
  float scan = 1.0 - uScan.y * (1.0 - sl * sl);
  float sweepY = fract(uTime * 0.09) * 1.5 - 0.25;
  float sw = (uv.y - sweepY) * 9.0;
  float sweep = exp(-sw * sw) * uScan.w;
  holo *= scan * (1.0 + sweep * 1.4 + band * 0.3);

  // data noise: stepped sparkles and short dashes, only on / around the subject
  float near = clamp(covC + halo * 2.2, 0.0, 1.0);
  vec2 cell = floor(q / uLook.y);
  float spark = step(1.0 - 0.012 * uLook.z, hash12(cell + seed * 7.13)) * near;
  float dash = step(1.0 - 0.006 * uLook.z, hash12(vec2(floor(q.x / 16.0), floor(q.y / uLook.y)) + seed * 3.1)) * near;
  holo += uTint * (spark * 0.8 + dash * 0.3);

  // medical: a slicing plane — bright cut line, cross-section fill + depth contours around it, ruler ticks
  if (uMisc.z > 0.01) {
    float dy = cp.y - uMisc.w * res.y;
    float span = smoothstep(uSliceX.x - 0.03, uSliceX.x + 0.03, uv.x) * (1.0 - smoothstep(uSliceX.y - 0.03, uSliceX.y + 0.03, uv.x));
    float cut = exp(-dy * dy / 2.5) * span;
    float zone = exp(-dy * dy / (2.0 * 38.0 * 38.0));
    float z = depthAt(q * uDpr);
    float ct = abs(fract(z * 7.0) - 0.5);
    float contour = smoothstep(0.38, 0.48, ct) * covC;
    float tick = span * step(fract(cp.x / 12.0), 0.12) * step(0.0, dy) * step(dy, mod(floor(cp.x / 12.0), 5.0) < 0.5 ? 9.0 : 5.0);
    vec3 m = uTint * (cut * (0.35 + 1.4 * covC) + zone * (contour * 0.9 + covC * 0.25) + tick * 0.35);
    holo = holo * (1.0 - 0.3 * uMisc.z * (1.0 - zone)) + m * uMisc.z;
  }
  holo *= uMisc.x * uMisc.y;

  /* ---- what is behind: a dim room (dot grid) or a solid, real object */
  vec2 vc = uv - 0.5;
  vec2 va = vc * vec2(res.x / res.y, 1.0);
  float vig = dot(va, va);
  vec3 env = mix(vec3(0.004, 0.01, 0.018), vec3(0.012, 0.028, 0.045), smoothstep(0.0, 1.0, uv.y));
  vec2 g = fract(cp / 24.0) - 0.5;
  env += uTint * 0.03 * smoothstep(0.11, 0.02, length(g));
  env *= 1.0 - 0.6 * smoothstep(0.05, 0.7, vig);
  vec4 sc = colL(px);
  float solid = nrmL(px).a * (1.0 - smoothstep(0.45, 0.85, sc.a));
  vec3 bg = mix(env, sceneAt(px) * 0.92, solid);

  /* ---- projector: cone of light, ring emitter, light pool */
  if (uCone2.w > 0.001) {
    vec2 A = uCone.xy;
    float hh = (cp.y - A.y) / uCone.w;
    float hw = mix(uCone2.x, uCone.z, clamp(hh, 0.0, 1.0));
    float dx = (cp.x - A.x) / hw;
    float adx = abs(dx);
    float inC = (1.0 - smoothstep(0.55, 1.0, adx)) * smoothstep(0.0, 0.03, hh) * (1.0 - smoothstep(0.7, 1.05, hh));
    float rays = 0.55 + 0.45 * vnoise(vec2(dx * 6.0 + 3.0, hh * 1.2 - uTime * 0.45));
    float rim = smoothstep(0.8, 0.97, adx) * (1.0 - smoothstep(0.97, 1.02, adx)) * smoothstep(0.0, 0.05, hh) * (1.0 - smoothstep(0.4, 1.0, hh));
    float motes = step(0.996, hash12(floor(cp / 3.0) + floor(uTime * 6.0))) * inC;
    float cone = inC * rays * pow(max(1.0 - hh, 0.0), 1.4) * 0.2 + rim * 0.18 + motes * 0.5;
    vec2 de = (cp - A) / uCone2.yz;
    float e = length(de);
    float disc = 1.0 - smoothstep(0.9, 1.0, e);
    float ring = pow(0.5 + 0.5 * cos(6.2832 * (e * 3.0 - uTime * 0.6)), 8.0) * disc * 0.45;
    float edgeR = smoothstep(0.86, 0.95, e) * disc;
    float core = exp(-e * e * 9.0);
    float pool = exp(-length(de * vec2(0.32, 0.3)) * 2.2) * solid;
    vec3 light = uTint * ((cone + ring + edgeR * 0.6 + core * 0.9) * uMisc.x + pool * 0.35);
    bg += light * uCone2.w;
  }

  vec3 col = bg * (1.0 - 0.3 * clamp(I3.y, 0.0, 1.0)) + holo;
  col = 1.0 - exp(-col * 1.2);
  col *= 1.0 - 0.25 * smoothstep(0.2, 0.9, vig);
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

type HoloState = {
  mode: HologramMode
  from: Look
  to: Look
  k: number
  t: number
  stability: number
  nextEvent: number
  ev: null | { kind: 'band' | 'drop' | 'roll'; t: number; len: number; amp: number; step: number }
  roll: number
  rollV: number
  slice: number
  sliceDir: number
  sliceRange: [number, number]
  events: boolean
  level: number // 0 calm … 1 glitching (for HUDs)
  forced: boolean
}
export type HologramEffect = StylizeEffect & { holo: HoloState }

export function createHologramEffect(): HologramEffect {
  const st: HoloState = {
    mode: 'starwars',
    from: LOOKS.starwars,
    to: LOOKS.starwars,
    k: 1,
    t: 0,
    stability: 0.6,
    nextEvent: 2.5,
    ev: null,
    roll: 0,
    rollV: 0,
    slice: 0.5,
    sliceDir: 1,
    sliceRange: [0.12, 0.88],
    events: true,
    level: 0,
    forced: false,
  }
  const u = {
    uColA: { value: new THREE.Vector3() },
    uColB: { value: new THREE.Vector3() },
    uColC: { value: new THREE.Vector3() },
    uTint: { value: new THREE.Vector3() },
    uScan: { value: new THREE.Vector4() },
    uLook: { value: new THREE.Vector4() },
    uLook2: { value: new THREE.Vector4() },
    uMisc: { value: new THREE.Vector4(1, 1, 0, 0.5) },
    uBand: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSig: { value: new THREE.Vector2() },
    uCone: { value: new THREE.Vector4(0, 0, 100, 100) },
    uCone2: { value: new THREE.Vector4(10, 60, 16, 0) },
    uSliceX: { value: new THREE.Vector2(0.1, 0.9) },
  }
  const apply = (L: Look, flick: number) => {
    u.uColA.value.set(...L.colA)
    u.uColB.value.set(...L.colB)
    u.uColC.value.set(...L.colC)
    u.uTint.value.set(...L.tint)
    u.uScan.value.set(L.scanP, L.scanS, L.scanV, L.sweep)
    u.uLook.value.set(L.pix, L.chunk, L.noise, L.wire)
    u.uLook2.value.set(L.dispB, L.dispE, L.jit, L.grid)
    u.uMisc.value.set(flick, L.gain, L.med, st.slice)
  }
  apply(LOOKS.starwars, 1)

  return {
    frag: FRAG,
    uniforms: u,
    normals: true,
    background: hologramMeta.background,
    holo: st,
    update(dt) {
      st.t += dt
      if (st.k < 1) st.k = Math.min(1, st.k + dt / 0.7)
      const e = st.k * st.k * (3 - 2 * st.k)
      const L = st.k >= 1 ? st.to : lerpLook(st.from, st.to, e)
      const s = st.stability
      // stepped noise frame (~15 fps for the chunky star-wars noise, faster otherwise)
      const seed = Math.floor(st.t * (L.pix > 1.5 ? 14 : 22))

      /* signal events */
      if (!st.ev && (st.events || st.forced) && st.t > st.nextEvent) {
        const r = st.forced ? 0 : Math.random()
        const amp = st.forced ? Math.max(1.2, 1.35 - 0.85 * s) : 1.35 - 0.85 * s
        st.forced = false
        st.ev =
          r < 0.58
            ? { kind: 'band', t: 0, len: 0.16 + Math.random() * 0.24, amp, step: -1 }
            : r < 0.84
              ? { kind: 'drop', t: 0, len: 0.07 + Math.random() * 0.08, amp, step: -1 }
              : { kind: 'roll', t: 0, len: 0.05, amp, step: -1 }
        if (st.ev.kind === 'roll') {
          st.roll = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 22) * amp
          st.rollV = 0
        }
      }
      let flick = 1 - L.flick * (1.25 - 0.6 * s) * (0.5 + 0.5 * Math.sin(st.t * 37.0) * Math.sin(st.t * 11.3))
      u.uBand.value.w = 0
      st.level = Math.max(0, st.level - dt * 3)
      if (st.ev) {
        const ev = st.ev
        ev.t += dt
        const step = Math.floor(ev.t / 0.055)
        if (ev.kind === 'band' || ev.kind === 'drop') {
          if (step !== ev.step) {
            ev.step = step
            // bands land on the subject (the slice range is its vertical extent when a page sets it)
            const h = (0.04 + Math.random() * 0.14) * (ev.kind === 'drop' ? 1.6 : 1)
            const [ra, rb] = st.sliceRange
            const y0 = ra - 0.05 + Math.random() * (rb - ra + 0.1) - h / 2
            u.uBand.value.set(y0, y0 + h, (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 44) * ev.amp, 1)
          }
          u.uBand.value.w = 1
          if (ev.kind === 'drop') flick *= step % 2 === 0 ? 0.25 + 0.2 * Math.random() : 0.75
        }
        st.level = 1
        if (ev.t >= ev.len) {
          st.ev = null
          st.nextEvent = st.t + (0.9 + 8.5 * s * s + Math.random() * (1.5 + 3 * s))
        }
      }
      // re-sync: the vertical jump springs back with a little overshoot
      const kx = 900
      const c = 34
      st.rollV += (-kx * st.roll - c * st.rollV) * dt
      st.roll += st.rollV * dt
      if (Math.abs(st.roll) < 0.05 && Math.abs(st.rollV) < 0.5) st.roll = st.rollV = 0

      /* medical slicing plane ping-pongs over its range */
      const [a, b] = st.sliceRange
      st.slice += st.sliceDir * dt * 0.16
      if (st.slice > b) {
        st.slice = b
        st.sliceDir = -1
      } else if (st.slice < a) {
        st.slice = a
        st.sliceDir = 1
      }

      apply(L, flick)
      u.uSig.value.set(st.roll, seed % 997)
    },
  }
}

export function setHologramMode(fx: StylizeEffect, mode: HologramMode) {
  const st = (fx as HologramEffect).holo
  if (!st || st.mode === mode) return
  const e = st.k * st.k * (3 - 2 * st.k)
  st.from = st.k >= 1 ? st.to : lerpLook(st.from, st.to, e)
  st.to = LOOKS[mode]
  st.k = 0
  st.mode = mode
}

/** 0 = unstable signal (frequent, big glitches) … 1 = steady (rare, small ones) */
export function setHologramStability(fx: StylizeEffect, s: number) {
  const st = (fx as HologramEffect).holo
  if (!st) return
  st.stability = THREE.MathUtils.clamp(s, 0, 1)
  st.nextEvent = Math.min(st.nextEvent, st.t + 0.6 + 6 * st.stability)
}

/** force a signal glitch now (e.g. on click) */
export function glitchHologram(fx: StylizeEffect) {
  const st = (fx as HologramEffect).holo
  if (!st || st.ev) return
  st.forced = true
  st.nextEvent = st.t
}

/** turn the random glitches off / on (posters) */
export function setHologramEvents(fx: StylizeEffect, on: boolean) {
  const st = (fx as HologramEffect).holo
  if (st) st.events = on
}

/**
 * projector cone, all in CSS px with y measured from the TOP of the canvas:
 * lens point, lens half-width, cone half-width at the top, cone height, emitter disc radii; on = 0..1
 */
export function setHologramProjector(
  fx: StylizeEffect,
  p: { x: number; y: number; lens: number; top: number; height: number; rx: number; ry: number; on: number; viewH: number },
) {
  const u = fx.uniforms as Record<string, THREE.IUniform<THREE.Vector4>>
  u.uCone.value.set(p.x, p.viewH - p.y, p.top, Math.max(1, p.height))
  u.uCone2.value.set(p.lens, Math.max(1, p.rx), Math.max(1, p.ry), p.on)
}

/**
 * range the medical slicing plane sweeps, as 0..1 of the canvas height measured from the TOP, and optionally
 * its horizontal extent (0..1 of the width; default 0.1 … 0.9)
 */
export function setHologramSliceRange(fx: StylizeEffect, top: number, bottom: number, left = 0.1, right = 0.9) {
  const st = (fx as HologramEffect).holo
  if (!st) return
  st.sliceRange = [1 - Math.max(top, bottom), 1 - Math.min(top, bottom)]
  ;(fx.uniforms as Record<string, THREE.IUniform<THREE.Vector2>>).uSliceX.value.set(left, right)
}

/** for HUDs: glitch level (0..1, decays), slice position (0..1 from the top), mode */
export function hologramStatus(fx: StylizeEffect) {
  const st = (fx as HologramEffect).holo
  return { level: st.level, slice: 1 - st.slice, mode: st.mode, glitching: !!st.ev }
}
