import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 红外摄影 — infrared film, not a thermal camera: the picture is about what REFLECTS near-infrared light.
 *
 * IR MODEL (from the visible scene colour, display sRGB)
 *   Chlorophyll reflects IR strongly ("Wood effect"), blue sky and water hardly at all, most other things about
 *   as much as they reflect visible light, warm pigments / skin a bit more. Per pixel:
 *     chl   = (g − max(0.85·r, b)) / max     — how leaf-green a colour is   → fol = smoothstep(.02, .22, chl)
 *     blue  = smoothstep(.04, .3, b − max(r, .85·g))                        — sky, water
 *     warm  = smoothstep(.05, .35, r − b)                                    — skin, wood, red paint
 *     base  = L·(1 − .85·blue) + .55·warm·max
 *     leaf  = .28 + 1.15·max                  (bright even in shade)
 *     IR    = mix(base, leaf, fol)
 *   So lit greens → IR > 1 (glowing), a blue sky → ≈ 0.1, white clouds stay bright, water goes dark.
 *
 * MODES — the false-colour mappings (crossfaded as weights; all cheap maths on the same IR value)
 *   彩红外  Aerochrome:  out = (IR, R, G)          foliage → hot pink / magenta, sky → teal-cyan, red → yellow
 *   黑白红外 B&W IR:       out = IR                  snow-white trees, near-black sky, strongest halation
 *   金色红外 590 nm gold:  out ≈ (.95·IR + .1·R, .62·IR + .2·G, .2·IR + .62·B)   (channel-swapped)
 *                                                    foliage → gold / orange, sky → deep blue
 *
 * FILM / LENS
 *   · halation: 12 taps on two rings (≈ 5 and 14 CSS px) of the mapped picture; whatever is brighter than
 *     ~0.62 bleeds outward — reddish on colour IR film (no anti-halation layer), white on B&W, warm on gold
 *   · lens softness: the inner ring is mixed in (more toward the corners) + vignette
 *   · grain: two octaves, strongest in the midtones, 24 fps; monochrome on B&W, slightly coloured otherwise
 *   `setInfraredHalation(fx, k)` scales the glow (0 … 2, default 1).
 */

export const infraredModes = [
  { id: 'aero', label: '彩红外' },
  { id: 'bw', label: '黑白红外' },
  { id: 'gold', label: '金色红外' },
] as const
export type InfraredMode = (typeof infraredModes)[number]['id']

export const infraredMeta = { title: '红外摄影', en: 'Infrared Photo', background: '#b4d0ee', theme: 'light' as const }

const FRAG = /* glsl */ `
uniform vec3 uW;        // aero, bw, gold
uniform float uHal;     // halation gain
uniform float uSeed;    // grain frame

vec3 srgbL(vec2 p) {
  vec3 c = textureLod(tScene, p / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// near-infrared reflectance of a visible colour
float irOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float L = luma(c);
  float chl = clamp((c.g - max(c.r * 0.85, c.b)) / (mx + 0.04), 0.0, 1.0);
  float fol = smoothstep(0.02, 0.22, chl);
  float blue = smoothstep(0.04, 0.3, c.b - max(c.r, c.g * 0.85));
  float warm = smoothstep(0.05, 0.35, c.r - c.b);
  float base = L * (1.0 - 0.85 * blue) + 0.55 * warm * mx;
  float leaf = 0.28 + 1.15 * mx;
  return mix(base, leaf, fol);
}

// the mode's false-colour picture of one tap
vec3 mapIR(vec3 c) {
  float ir = irOf(c);
  vec3 aero = vec3(ir, c.r, mix(c.g, c.b, 0.15));
  aero = mix(vec3(luma(aero)), aero, 1.18);
  vec3 bw = vec3(ir * 0.96 + 0.02);
  vec3 gold = vec3(0.95 * ir + 0.1 * c.r, 0.62 * ir + 0.2 * c.g, 0.2 * ir + 0.62 * c.b);
  return aero * uW.x + bw * uW.y + gold * uW.z;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec2 res = uRes / uDpr;
  vec2 vc = uv - 0.5;
  vec2 va = vc * vec2(res.x / res.y, 1.0);
  float vig = dot(va, va);

  /* taps (one call site): centre, 6 at ~1.6 px (softness), 6 at 3–7 px + 6 at 9–16 px (halation). The halo
     rings are rotated and their radii jittered per pixel, so discrete taps don't print ghost copies of dark
     shapes — the residue reads as grain. */
  float jr = hash12(floor(cp) + 0.37) * 6.2832;
  float jd = hash12(floor(cp) + 7.1);
  vec3 C = vec3(0.0), soft = vec3(0.0), hal = vec3(0.0);
  for (int i = 0; i < 19; i++) {
    float k = float(i);
    vec2 o = vec2(0.0);
    if (i > 0 && i < 7) { float a = k * 1.0472; o = vec2(cos(a), sin(a)) * 1.6; }
    else if (i >= 7 && i < 13) { float a = k * 1.0472 + jr; o = vec2(cos(a), sin(a)) * (3.0 + 4.0 * jd); }
    else if (i >= 13) { float a = k * 1.0472 + jr + 0.52; o = vec2(cos(a), sin(a)) * (9.0 + 7.0 * jd); }
    vec3 m = mapIR(srgbL(px + o * uDpr));
    if (i == 0) C = m;
    else if (i < 7) soft += m;
    else {
      float b = max(m.r, max(m.g, m.b));
      vec3 over = max(m - 0.78, 0.0) + vec3(smoothstep(0.75, 1.15, b)) * 0.22;
      hal += over * (i < 13 ? 1.0 : 0.75);
    }
  }
  soft /= 6.0;
  hal /= 10.2;

  // lens: a touch soft everywhere, more toward the corners
  vec3 col = mix(C, soft, 0.28 + 0.4 * smoothstep(0.1, 0.6, vig));
  // halation: colour IR film bleeds red, B&W white, gold warm; strongest (dreamiest) on B&W
  vec3 hc = vec3(1.0, 0.42, 0.38) * uW.x + vec3(1.0) * uW.y + vec3(1.0, 0.78, 0.48) * uW.z;
  float hk = uHal * (0.9 + 0.7 * uW.y);
  float hb = dot(hal, vec3(0.333));
  col += hc * hb * hk * 1.6;
  col = 1.0 - (1.0 - col) * (1.0 - hc * hb * hk * 0.4);

  // film curve: a gentle S, highlights roll off
  col = clamp(col, 0.0, 1.4);
  col = col / (1.0 + max(col - 0.85, 0.0) * 1.2);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.45);

  // grain: two octaves, strongest in the midtones; coloured a little on colour film
  float v = luma(col);
  float mid = 0.35 + 2.6 * v * (1.0 - v);
  float g1 = hash12(floor(cp * 0.85) + uSeed * 19.3) - 0.5;
  float g2 = vnoise(cp * 0.45 + uSeed * 7.7) - 0.5;
  vec3 gc = vec3(g1 + g2 * 0.8);
  vec3 gch = vec3(hash12(floor(cp * 0.85) + uSeed * 3.1 + 11.0), hash12(floor(cp * 0.85) + uSeed * 5.7 + 23.0), 0.0) - 0.5;
  gc += vec3(gch.x, gch.y, -gch.x - gch.y) * 0.35 * (1.0 - uW.y);
  col += gc * 0.085 * mid;

  col *= 1.0 - 0.32 * smoothstep(0.12, 0.85, vig);
  return clamp(col, 0.0, 1.0);
}
`

type IrState = { mode: InfraredMode; from: THREE.Vector3; to: THREE.Vector3; k: number; t: number; hal: number; halTarget: number }
export type InfraredEffect = StylizeEffect & { ir: IrState }

const W: Record<InfraredMode, [number, number, number]> = { aero: [1, 0, 0], bw: [0, 1, 0], gold: [0, 0, 1] }

export function createInfraredEffect(): InfraredEffect {
  const st: IrState = { mode: 'aero', from: new THREE.Vector3(1, 0, 0), to: new THREE.Vector3(1, 0, 0), k: 1, t: 0, hal: 1, halTarget: 1 }
  const u = {
    uW: { value: new THREE.Vector3(1, 0, 0) },
    uHal: { value: 1 },
    uSeed: { value: 0 },
  }
  return {
    frag: FRAG,
    uniforms: u,
    background: infraredMeta.background,
    ir: st,
    update(dt) {
      st.t += dt
      if (st.k < 1) st.k = Math.min(1, st.k + dt / 0.7)
      const e = st.k * st.k * (3 - 2 * st.k)
      u.uW.value.copy(st.from).lerp(st.to, e)
      st.hal += (st.halTarget - st.hal) * Math.min(1, dt * 6)
      u.uHal.value = st.hal
      u.uSeed.value = Math.floor(st.t * 24) % 480
    },
  }
}

export function setInfraredMode(fx: StylizeEffect, mode: InfraredMode) {
  const st = (fx as InfraredEffect).ir
  if (!st || st.mode === mode) return
  const e = st.k * st.k * (3 - 2 * st.k)
  st.from.lerp(st.to, e)
  st.to.set(...W[mode])
  st.k = 0
  st.mode = mode
}

/** halation strength, 0 … 2 (default 1); eases */
export function setInfraredHalation(fx: StylizeEffect, k: number) {
  const st = (fx as InfraredEffect).ir
  if (st) st.halTarget = THREE.MathUtils.clamp(k, 0, 2)
}
