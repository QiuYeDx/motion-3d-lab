import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 故障艺术 — a signal that is mostly fine, then isn't.
 *
 * Everything is driven by one "level" (0 calm … 1 full burst) that the effect animates itself in update():
 * a calm baseline, random burst timers, and within a burst a stepped seed so each corrupted "frame" holds
 * for a few display frames (real glitches stutter, they don't shimmer). Visitors can add a local burst at a
 * screen row (triggerGlitch / setGlitchHold).
 *
 * Per pixel, in this order (each expensive routine has ONE call site, modes are just feature amounts that
 * the CPU crossfades — no per-mode branches in the shader):
 *  1. sampling offset: tape wobble, rolling tracking band, head-switching at the bottom (VHS); random
 *     horizontal bands that slide, single-line tearing, interlaced field offset, vertical roll;
 *     macroblock slices: from a corrupted block to the end of its row each 16px block references the
 *     wrong place (bad motion vector) and is sampled coarsely
 *  2. ONE scene fetch with RGB channel split
 *  3. ONE bounded loop (12 steps) shared by pixel sorting (the brightest pixel within a random-length span
 *     above is sorted down, so bright edges melt into column streaks) and datamosh (bright pixels smeared
 *     along a motion direction)
 *  4. chroma bleed (VHS, 4 taps) and a small neon glow (8 taps)
 *  5. colour: DCT ringing + posterize in broken blocks, inverted / channel-swapped blocks, chroma noise,
 *     snow, holographic duotone, scanlines, interlace darkening, vignette
 */

export const glitchModes = [
  { id: 'vhs', label: 'VHS' },
  { id: 'digital', label: '数据损坏' },
  { id: 'cyber', label: '赛博' },
] as const
export type GlitchMode = (typeof glitchModes)[number]['id']

export const glitchMeta = { title: '故障艺术', en: 'Glitch', background: '#08080c', theme: 'dark' as const }

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  base: number // calm level
  rgb: number // calm RGB split, CSS px
  block: number // band displacement
  tear: number // line tearing / jitter
  macro: number // macroblock slices
  sort: number // pixel sorting
  mosh: number // datamosh smear
  inv: number // inverted / swapped blocks
  inter: number // interlace
  scan: number // scanlines
  cnoise: number // chroma noise
  vhs: number // wobble, tracking, head switching, bleed, snow, grade
  holo: number // holographic duotone
  glow: number // neon glow
}

const LOOKS: Record<GlitchMode, Look> = {
  vhs: { base: 0.06, rgb: 1.2, block: 0.55, tear: 0.8, macro: 0, sort: 0, mosh: 0, inv: 0, inter: 0.55, scan: 0.28, cnoise: 0.9, vhs: 1, holo: 0, glow: 0.45 },
  digital: { base: 0.07, rgb: 0.5, block: 1, tear: 0.35, macro: 1, sort: 1, mosh: 1, inv: 0.7, inter: 0.15, scan: 0, cnoise: 0.35, vhs: 0, holo: 0, glow: 0.3 },
  cyber: { base: 0.08, rgb: 2.2, block: 0.75, tear: 1, macro: 0.25, sort: 0.35, mosh: 0, inv: 0.45, inter: 0.5, scan: 0.55, cnoise: 0.45, vhs: 0, holo: 1, glow: 1 },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = {} as Record<string, number>
  for (const key of Object.keys(a) as (keyof Look)[]) o[key] = a[key] + (b[key] - a[key]) * k
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform float uAmt;      // visitor 强度
uniform float uLevel;    // global level (calm baseline + bursts)
uniform float uSeed;     // stepped seed: one value per corrupted "frame"
uniform vec3 uHit;       // x row (CSS px from the bottom), y strength, z half-height (CSS px)
uniform vec2 uSplitDir;
uniform vec2 uMoshDir;
uniform float uRoll;     // vertical roll, CSS px
uniform float uRgb;
uniform float uBlock;
uniform float uTear;
uniform float uMacro;
uniform float uSort;
uniform float uMosh;
uniform float uInv;
uniform float uInter;
uniform float uScan;
uniform float uCNoise;
uniform float uVhs;
uniform float uHolo;
uniform float uGlow;

float h2(vec2 p, float s) { return hash12(p + vec2(s * 17.17, s * 3.71)); }

// explicit-LOD fetch so every loop below stays rolled in ANGLE's HLSL
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}

vec3 toYiq(vec3 c) {
  return vec3(dot(c, vec3(0.299, 0.587, 0.114)), dot(c, vec3(0.596, -0.274, -0.322)), dot(c, vec3(0.211, -0.523, 0.312)));
}
vec3 fromYiq(vec3 y) {
  return vec3(y.x + 0.956 * y.y + 0.621 * y.z, y.x - 0.272 * y.y - 0.647 * y.z, y.x - 1.106 * y.y + 1.703 * y.z);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;              // CSS px, y up
  vec2 res = uRes / uDpr;
  float s = uSeed;
  float tf = floor(uTime * 24.0);   // "video frame" clock for analog noise

  /* local intensity: global level + the visitor's burst around a row */
  float hd = (cp.y - uHit.x) / max(uHit.z, 1.0);
  float hitK = uHit.y * exp(-hd * hd);
  float G = clamp((uLevel + hitK) * uAmt, 0.0, 1.6);
  float Gs = G * G;

  vec2 off = vec2(0.0, uRoll * min(uAmt, 1.0));
  float row = floor(cp.y);

  /* ---- 1 · VHS transport: wobble, tracking band, head switching */
  float band = 0.0, head = 0.0;
  if (uVhs > 0.001) {
    off.x += (sin(cp.y * 0.021 + uTime * 1.3) * 0.8 + sin(cp.y * 0.13 - uTime * 6.0) * 0.22) * uVhs * (1.0 + G * 3.0);
    float by = fract(uTime * 0.035 + 0.3) * (res.y + 240.0) - 120.0;
    float bd = (cp.y - by) / (10.0 + 46.0 * G);
    band = exp(-bd * bd) * uVhs * (0.3 + 1.2 * G);
    off.x += (hash12(vec2(floor(cp.y / 2.0), tf)) - 0.5) * 34.0 * band;
    head = (1.0 - smoothstep(7.0, 15.0 + 10.0 * G, cp.y)) * uVhs;
    off.x += head * (10.0 + 28.0 * hash12(vec2(floor(cp.y / 2.0), tf + 3.0)) + 30.0 * G);
  }

  /* ---- band displacement: random-height bands slide sideways */
  float bh = 7.0 + 60.0 * h2(vec2(3.1, 0.0), s);
  float bc = floor((cp.y + h2(vec2(9.0, 1.0), s) * bh) / bh);
  float br = h2(vec2(bc, 2.0), s);
  float bOn = step(1.0 - 0.5 * G * uBlock, br);
  float shift = (h2(vec2(bc, 5.0), s) - 0.5) * (30.0 + 260.0 * G) * bOn;
  // thin slices on top
  float sh = 2.0 + 7.0 * h2(vec2(7.7, 0.0), s);
  float sc = floor(cp.y / sh);
  float sOn = step(1.0 - 0.18 * Gs * uBlock, h2(vec2(sc, 11.0), s));
  shift += (h2(vec2(sc, 13.0), s) - 0.5) * 120.0 * sOn;
  off.x += shift;

  /* ---- tearing: a skewed tear line + per-line jitter */
  float tearY = h2(vec2(1.0, 21.0), s) * res.y;
  float tearOn = step(0.55, h2(vec2(2.0, 21.0), s)) * uTear * smoothstep(0.25, 0.7, G);
  off.x += step(tearY, cp.y) * tearOn * (12.0 + (cp.y - tearY) * 0.12 * (h2(vec2(4.0, 21.0), s) - 0.3));
  off.x += (hash12(vec2(row, tf + s)) - 0.5) * 4.0 * uTear * Gs;

  /* ---- interlace: one field lags the other */
  float field = mod(floor(px.y / max(1.0, floor(uDpr * 1.5 + 0.5))), 2.0);
  off.x += field * uInter * (0.6 + 7.0 * G);

  /* ---- macroblocks: from a corrupted block to the end of its slice everything references the wrong place */
  vec2 mb = floor(cp / 16.0);
  float sliceBad = step(1.0 - 0.32 * uMacro * G, h2(vec2(mb.y, 31.0), s));
  float errX = floor(h2(vec2(mb.y, 37.0), s) * res.x / 16.0);
  float macro = sliceBad * step(errX, mb.x);
  // a few isolated stuck blocks too
  macro = max(macro, step(1.0 - 0.05 * uMacro * G, h2(mb, s + 41.0)));
  vec2 lp = cp - mb * 16.0;             // 0..16 inside the block
  vec2 mv = (vec2(h2(vec2(mb.y, 43.0), s), h2(vec2(mb.y, 47.0), s)) - 0.5) * vec2(120.0, 48.0);
  mv += (vec2(h2(mb, s + 53.0), h2(mb, s + 59.0)) - 0.5) * 24.0;
  vec2 coarse = (mb * 16.0 + floor(lp / 4.0) * 4.0 + 2.0) - cp;   // 4px pixelation inside the block

  vec2 q = cp + off + macro * (mv + coarse);
  vec2 qp = q * uDpr;

  /* ---- 2 · one fetch with an RGB split */
  float split = uRgb * (1.0 + 0.6 * uHolo * sin(uTime * 2.3)) + G * (5.0 + 16.0 * h2(vec2(5.0, 61.0), s)) + hitK * 10.0;
  vec2 sd = uSplitDir * split * uDpr;
  vec3 col = vec3(sceneL(qp + sd).r, sceneL(qp).g, sceneL(qp - sd).b);

  /* ---- 3 · pixel sort + datamosh, one shared bounded loop */
  vec2 sr = floor(vec2(cp.x / 70.0, cp.y / 150.0));
  float sortOn = uSort * step(1.0 - 0.55 * G, h2(sr, s + 71.0)) * step(0.12, G);
  vec2 mr = floor(cp / 40.0);
  float moshOn = uMosh * step(1.0 - 0.6 * G, h2(floor(mr / vec2(3.0, 2.0)), s + 83.0)) * step(0.15, G);
  if (sortOn + moshOn > 0.0) {
    // pixel sort: within a span of random length per column, the brightest pixel above is "sorted" down,
    // so bright edges melt into streaks that fade with distance (the classic sorted-column look)
    float thr = 0.2 + 0.25 * h2(sr, s + 73.0);
    float st = (3.0 + 3.0 * h2(sr, s + 79.0)) * uDpr;
    float colL = 2.0 + 10.0 * hash12(vec2(floor(cp.x / 2.0), s + floor(cp.y / 150.0)));
    float jit = hash12(px + fract(uTime) * 61.0);
    vec2 md = uMoshDir * (5.0 + 6.0 * G) * uDpr;
    float lumC = luma(col);
    vec3 hiC = col;
    float hiL = lumC, hiI = 0.0;
    vec3 smear = col;
    for (int i = 1; i <= 12; i++) {
      float fi = float(i);
      vec3 a = sceneL(qp + vec2(0.0, st * fi));
      vec3 m = sceneL(qp - md * (fi - jit));
      float la = luma(a) * step(fi, colL);
      if (la > hiL) { hiL = la; hiC = a; hiI = fi; }
      // datamosh: bright pixels drag along the motion vector, fading with distance
      smear = max(smear, m * (1.0 - fi / 13.0) * smoothstep(0.15, 0.6, luma(m)));
    }
    float drip = step(thr, hiL) * step(0.5, hiI) * (1.0 - hiI / (colL + 1.0));
    col = mix(col, hiC, sortOn * drip);
    col = mix(col, smear, moshOn * 0.9);
    macro = max(macro, moshOn * 0.35);
  }

  /* ---- 4 · chroma bleed (VHS: chroma is low-bandwidth and delayed) + neon glow */
  vec3 yiq = toYiq(col);
  if (uVhs > 0.001) {
    vec2 ch = vec2(0.0);
    for (int i = 1; i <= 4; i++) {
      ch += toYiq(sceneL(qp - vec2((2.5 + float(i) * 2.6) * uDpr, 0.0))).yz;
    }
    yiq.yz = mix(yiq.yz, ch * 0.25 * 1.15, 0.75 * uVhs);
  }
  col = fromYiq(yiq);
  if (uGlow > 0.001) {
    vec3 gl = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854 + 0.4;
      float r = (mod(float(i), 2.0) < 0.5 ? 7.0 : 17.0) * uDpr;
      vec3 c = sceneL(qp + vec2(cos(a), sin(a)) * r);
      gl += max(c - 0.55, 0.0) * (mod(float(i), 2.0) < 0.5 ? 0.16 : 0.09);
    }
    col += gl * uGlow * (1.0 + G);
  }

  /* ---- 5 · colour corruption */
  // DCT ringing + posterize + green/magenta cast in broken blocks
  if (macro > 0.0) {
    vec2 uv = floor(vec2(h2(mb, s + 91.0), h2(mb, s + 97.0)) * 7.0) + 1.0;
    float basis = cos(3.14159 * (floor(lp.x / 2.0) + 0.5) * uv.x / 8.0) * cos(3.14159 * (floor(lp.y / 2.0) + 0.5) * uv.y / 8.0);
    vec3 bc2 = floor(col * 5.0 + 0.5) / 5.0;
    bc2 += basis * 0.14;
    float cst = h2(mb, s + 101.0);
    bc2 *= cst < 0.3 ? vec3(0.65, 1.25, 0.7) : cst > 0.82 ? vec3(1.25, 0.6, 1.2) : vec3(1.0);
    col = mix(col, bc2, macro);
  }
  // inverted / channel-swapped rectangles
  vec2 ib = floor(cp / vec2(56.0 + 90.0 * h2(vec2(1.0, 107.0), s), 10.0 + 26.0 * h2(vec2(2.0, 107.0), s)));
  float ir = h2(ib, s + 109.0);
  float invOn = step(1.0 - 0.07 * uInv * Gs, ir);
  // inversion only where there is something to invert (a black field turning white reads as a UI bug)
  vec3 alt = ir > 1.0 - 0.025 * uInv * Gs && luma(col) > 0.18 ? 1.0 - col : col.brg * vec3(1.15, 0.9, 1.25) + vec3(0.02, 0.0, 0.05);
  col = mix(col, alt, invOn);

  // chroma noise (horizontally stretched), luma snow
  vec3 n = vec3(
    hash12(floor(cp / vec2(4.0, 1.0)) + tf * 1.7) - 0.5,
    hash12(floor(cp / vec2(4.0, 1.0)) + tf * 2.3 + 9.0) - 0.5,
    hash12(floor(px) + tf * 3.1) - 0.5
  );
  yiq = toYiq(col);
  yiq.yz += n.xy * uCNoise * (0.05 + 0.22 * G);
  float snow = (band * 0.9 + head * 0.7 + uVhs * 0.05) * step(0.5, hash12(vec2(floor(cp.x / (1.0 + 3.0 * hash12(vec2(row, tf)))), row + tf)));
  yiq.x += n.z * (0.04 + 0.05 * uVhs + 0.08 * G) + snow * (hash12(vec2(cp.x, row + tf * 7.0)) * 0.55);
  // VHS grade: softened saturation, lifted blacks, warm
  yiq.yz *= 1.0 - 0.18 * uVhs;
  col = fromYiq(yiq);
  col = mix(col, col * vec3(1.04, 0.98, 0.9) + 0.03, uVhs);

  // holographic duotone: indigo shadows, magenta mids, cyan highs, drifting with height and time
  if (uHolo > 0.001) {
    float l = luma(col);
    float sweep = 0.5 + 0.5 * sin(cp.y * 0.006 - uTime * 0.9 + cp.x * 0.0015);
    vec3 duo = mix(vec3(0.05, 0.02, 0.16), vec3(1.0, 0.12, 0.8), smoothstep(0.04, 0.5, l));
    duo = mix(duo, vec3(0.3, 1.0, 1.0), smoothstep(0.42, 0.9, l) * (0.5 + 0.5 * sweep));
    // keep saturated colours (bars, neon) mostly their own; tint the neutrals
    float sat = length(col - l);
    col = mix(col, duo * (0.8 + 0.45 * l), uHolo * mix(0.62, 0.25, smoothstep(0.08, 0.35, sat)));
  }

  // scanlines (3 CSS px period) + darker lagging field
  float sl = 0.5 + 0.5 * cos(6.28318 * px.y / (3.0 * uDpr));
  col *= 1.0 - uScan * 0.32 * sl;
  col *= 1.0 - field * uInter * 0.06 * (1.0 + G * 2.0);

  // vignette
  vec2 vu = cp / res - 0.5;
  col *= 1.0 - dot(vu, vu) * (0.55 + 0.25 * uVhs);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type GlState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: GlitchMode
  t: number
  // bursts
  next: number // seconds until the next burst
  left: number // seconds left in the current burst
  power: number // strength of the current burst
  frame: number // seconds until the next corrupted frame
  level: number
  seedT: number
  blip: boolean
  frozen: boolean
  // visitor
  hit: number
  hitRow: number // 0..1 from the top
  hold: number
  roll: number
  rollV: number
  amount: number
  amountTarget: number
  reduced: boolean
  res: { h: number }
}
export type GlitchEffect = StylizeEffect & { gl: GlState }

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function createGlitchEffect(init: { mode?: GlitchMode } = {}): GlitchEffect {
  const m0 = init.mode ?? 'vhs'
  const st: GlState = {
    from: LOOKS[m0],
    to: LOOKS[m0],
    cur: LOOKS[m0],
    k: 1,
    mode: m0,
    t: 0,
    next: rnd(1.2, 2.5),
    left: 0,
    power: 0,
    frame: 0,
    level: 0,
    seedT: 0,
    blip: false,
    frozen: false,
    hit: 0,
    hitRow: 0.5,
    hold: 0,
    roll: 0,
    rollV: 0,
    amount: 1,
    amountTarget: 1,
    reduced: false,
    res: { h: 800 },
  }
  const u = {
    uAmt: { value: 1 },
    uLevel: { value: 0 },
    uSeed: { value: 1 },
    uHit: { value: new THREE.Vector3(0, 0, 60) },
    uSplitDir: { value: new THREE.Vector2(1, 0) },
    uMoshDir: { value: new THREE.Vector2(0.9, -0.4).normalize() },
    uRoll: { value: 0 },
    uRgb: { value: 1 },
    uBlock: { value: 0 },
    uTear: { value: 0 },
    uMacro: { value: 0 },
    uSort: { value: 0 },
    uMosh: { value: 0 },
    uInv: { value: 0 },
    uInter: { value: 0 },
    uScan: { value: 0 },
    uCNoise: { value: 0 },
    uVhs: { value: 0 },
    uHolo: { value: 0 },
    uGlow: { value: 0 },
  }
  const apply = (L: Look) => {
    u.uRgb.value = L.rgb
    u.uBlock.value = L.block
    u.uTear.value = L.tear
    u.uMacro.value = L.macro
    u.uSort.value = L.sort
    u.uMosh.value = L.mosh
    u.uInv.value = L.inv
    u.uInter.value = L.inter
    u.uScan.value = L.scan
    u.uCNoise.value = L.cnoise
    u.uVhs.value = L.vhs
    u.uHolo.value = L.holo
    u.uGlow.value = L.glow
  }
  apply(st.cur)
  const newFrame = () => {
    u.uSeed.value = Math.floor(Math.random() * 997) + 1
    const a = Math.random() < 0.75 ? (Math.random() < 0.5 ? 0 : Math.PI) + rnd(-0.25, 0.25) : rnd(0, Math.PI * 2)
    u.uSplitDir.value.set(Math.cos(a), Math.sin(a))
  }
  return {
    frag: FRAG,
    uniforms: u,
    background: glitchMeta.background,
    gl: st,
    update(dt, ctx) {
      st.t += dt
      st.res.h = ctx.height / ctx.dpr
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.6)
        const e = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, e)
      }
      apply(st.cur)
      st.amount += (st.amountTarget - st.amount) * Math.min(1, dt * 6)
      u.uAmt.value = st.amount

      /* burst scheduler: calm most of the time, then a stuttering burst */
      const R = st.reduced
      if (st.left > 0) {
        st.left -= dt
        st.frame -= dt
        if (st.frame <= 0) {
          st.frame = rnd(0.04, 0.11)
          newFrame()
          // some frames drop back to almost clean — the stutter is what sells it
          st.level = Math.random() < 0.22 ? st.cur.base : st.power * rnd(0.45, 1)
          if (!R && st.power > 0.65 && Math.random() < 0.18) st.rollV = rnd(-1, 1) * 900
          if (Math.random() < 0.3) {
            const a = rnd(0, Math.PI * 2)
            u.uMoshDir.value.set(Math.cos(a), Math.sin(a) * 0.5).normalize()
          }
        }
        if (st.left <= 0) st.level = st.cur.base
      } else {
        st.next -= dt
        // calm: an occasional single bad frame
        st.seedT -= dt
        if (st.seedT <= 0) {
          newFrame()
          if (!R && !st.blip && Math.random() < 0.14) {
            st.blip = true
            st.seedT = rnd(0.05, 0.12)
          } else {
            st.blip = false
            st.seedT = rnd(0.35, 0.9)
          }
        }
        if (!st.frozen) st.level = st.blip ? 0.2 : st.cur.base
        if (st.next <= 0) {
          st.next = R ? rnd(9, 16) : rnd(1.6, 5.2)
          st.left = R ? rnd(0.12, 0.25) : rnd(0.15, 0.95)
          st.power = R ? rnd(0.12, 0.22) : Math.random() < 0.3 ? rnd(0.75, 1) : rnd(0.3, 0.7)
          st.frame = 0
        }
      }
      u.uLevel.value = st.level

      /* vertical roll: thrown by a burst, snaps back like a V-hold */
      st.roll += st.rollV * dt
      st.rollV *= Math.exp(-dt * 7)
      st.roll *= Math.exp(-dt * 9)
      if (Math.abs(st.roll) < 0.05) st.roll = 0
      u.uRoll.value = st.roll

      /* the visitor's burst decays, unless held */
      const target = Math.max(st.hold, 0)
      if (st.hit < target) st.hit = target
      else st.hit += (target - st.hit) * Math.min(1, dt * 3.2)
      if (st.hold > 0 && Math.random() < dt * 14) newFrame()
      u.uHit.value.set(st.res.h * (1 - st.hitRow), st.hit, 46 + 60 * st.hit)
    },
  }
}

/** current glitch intensity (0 calm … ~1.5) — e.g. to jitter DOM overlays in sync */
export function glitchLevel(fx: StylizeEffect) {
  const st = (fx as GlitchEffect).gl
  return st ? Math.min(1.6, (st.level + st.hit * 0.7) * st.amount) : 0
}

/**
 * A burst now. `strength` 0..1; `row` = 0..1 from the top of the screen to centre it on a row
 * (omit for a whole-frame burst).
 */
export function triggerGlitch(fx: StylizeEffect, strength = 0.8, row?: number) {
  const st = (fx as GlitchEffect).gl
  if (!st) return
  const s = st.reduced ? Math.min(strength, 0.35) : strength
  if (row !== undefined) {
    st.hitRow = row
    st.hit = Math.max(st.hit, s * 1.1)
  }
  st.left = Math.max(st.left, (st.reduced ? 0.15 : 0.3) + s * 0.35)
  st.power = Math.max(row !== undefined ? s * 0.55 : s, st.left > 0 ? st.power * 0.5 : 0)
  st.frame = 0
  st.next = st.reduced ? rnd(9, 16) : rnd(2.5, 5.5)
}

/** sustain a burst around a row while the visitor holds (strength 0 releases it) */
export function setGlitchHold(fx: StylizeEffect, strength: number, row?: number) {
  const st = (fx as GlitchEffect).gl
  if (!st) return
  st.hold = st.reduced ? Math.min(strength, 0.4) : strength
  if (row !== undefined) st.hitRow = row
  if (strength > 0) {
    st.left = Math.max(st.left, 0.12)
    st.power = Math.max(st.power, strength * 0.45)
  }
}

export function setGlitchMode(fx: StylizeEffect, mode: GlitchMode) {
  const st = (fx as GlitchEffect).gl
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
  // a switch is itself a glitch
  triggerGlitch(fx, st.reduced ? 0.2 : 0.7)
}

/** 强度: multiplies every artefact (0 = clean signal … 1.5) */
export function setGlitchAmount(fx: StylizeEffect, amount: number) {
  const st = (fx as GlitchEffect).gl
  if (st) st.amountTarget = amount
}

/** prefers-reduced-motion: rare, mild bursts; no vertical roll */
export function setGlitchReducedMotion(fx: StylizeEffect, on: boolean) {
  const st = (fx as GlitchEffect).gl
  if (!st) return
  st.reduced = on
  if (on) {
    st.next = Math.max(st.next, rnd(6, 10))
    st.power = Math.min(st.power, 0.22)
  }
}

/** freeze into one representative corrupted frame (posters) */
export function freezeGlitch(fx: StylizeEffect, level = 0.55, seed = 377) {
  const st = (fx as GlitchEffect).gl
  if (!st) return
  st.left = 0
  st.next = 1e9
  st.seedT = 1e9
  st.frozen = true
  st.level = level
  fx.uniforms!.uSeed.value = seed
}
