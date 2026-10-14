import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * X 光 — the frame re-read as a radiograph: brightness = how much material the ray crosses.
 *
 * DENSITY CONVENTION (what scenes paint to look dense)
 *   For every pixel the effect estimates an attenuation D = 0.4·tissue + dense:
 *     · tissue (from the normal buffer, i.e. the FRONT surface + coverage):
 *         tissue = cov · (0.17 + 0.17·f + 1.05·(1 − f)^2.4),   f = view-facing-ness (n.z)
 *       a solid term (a chord through a ball is longest in the middle) plus a shell term: at grazing angles the
 *       ray runs along the skin for a long way, so every outline gets a bright rim, like soft tissue / a shell.
 *       The shell term only applies where the surface is curved or at an outline (normals vary across a 5.5 px
 *       ring), so a flat floor seen at a grazing angle stays a faint plate.
 *     · dense (from the linear scene colour): NEUTRAL colours brighter than 1.15 (linear — over-exposed, so an
 *       ordinary lit white wall stays below it) are dense inner parts:
 *         dense = clamp((L − 1.15) / 1.6, 0, 1.6) · (1 − smoothstep(.18, .45, chroma)),  L = max(r, g, b)
 *       So paint bones / metal with an unlit over-bright grey: `xrayPaint(d)` (MeshBasicMaterial, toneMapped
 *       false). d ≈ 0.2 organic (food, plastic), 0.5 bone / mixed, 1.0+ metal. To see them INSIDE something,
 *       wrap them in a translucent "flesh" mesh (opacity α, dark colour, a depth-only pre-pass so only its
 *       front surface blends) and pass α: `xrayPaint(d, α)` compensates for the flesh hiding part of the colour.
 *       The flesh is what the normal buffer sees → silhouette + rims; the paint shows through → bones.
 *       Ordinary lit scenes work too: everything reads as tissue of one density, specular glints are rejected
 *       (dense must hold over a ~6 px neighbourhood, so pin-point highlights don't become "metal").
 *   The background (no coverage) is empty air → fully exposed film.
 *
 * FILM: transmission I = exp(−dose·D·2.1); the image shows 1 − I (dense = white) on blue-black base, slight
 *   blur (4 taps at 1.2 px), unsharp-mask edge enhancement (8 taps at 5.5 px), film grain, vignetting and a
 *   light box behind it (centre hot-spot + the bands of its fluorescent tubes).
 * MODES: 胶片 film · CT 伪彩 (teal → peach pseudo-colour LUT, circular reconstruction field, a slice band sweeping
 *   down with iso-density contours and a live density profile of its centre row) · 安检机 (baggage scanner on
 *   white: orange organic / green mixed / blue metal by `dense`, darker where thicker, detector line noise).
 *   All three are cheap colourings of the same taps, crossfaded by uniform weights.
 * LENS: `setXrayLens(fx, {x, y, r, on})` (CSS px) → x-ray only inside a round scanner window, the plain render
 *   (dimmed) outside.
 */

export const xrayModes = [
  { id: 'film', label: '胶片' },
  { id: 'ct', label: 'CT 伪彩' },
  { id: 'scan', label: '安检机' },
] as const
export type XrayMode = (typeof xrayModes)[number]['id']

export const xrayMeta = { title: 'X 光', en: 'X-Ray', background: '#05080c', theme: 'dark' as const }

/** linear grey the effect reads as density `d`; pass the opacity of a translucent shell it sits in */
export function xrayPaint(d: number, shellOpacity = 0, target = new THREE.Color()) {
  const v = (1.15 + 1.6 * d) / Math.max(0.05, 1 - shellOpacity)
  return target.setRGB(v, v, v, THREE.LinearSRGBColorSpace)
}

const FRAG = /* glsl */ `
uniform vec3 uW;        // film, ct, scan
uniform float uDose;
uniform vec4 uLens;     // centre (device px), radius (device px), amount
uniform float uScan;    // CT slice centre, 0..1 from the top
uniform float uT;
uniform float uSeed;

vec3 linL(vec2 p) { return textureLod(tScene, p / uRes, 0.0).rgb * uExposure; }
vec4 nrmL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

// x = view-facing-ness, y = dense, z = coverage; n = view normal
vec3 matAt(vec2 p, out vec3 nn) {
  vec4 n = nrmL(p);
  vec3 c = linL(p);
  nn = normalize(n.rgb * 2.0 - 1.0);
  float f = clamp(nn.z, 0.0, 1.0);
  float L = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float chroma = (L - mn) / max(L, 1e-3);
  float dense = clamp((L - 1.15) / 1.6, 0.0, 1.6) * (1.0 - smoothstep(0.18, 0.45, chroma));
  return vec3(f, dense, n.a);
}

vec3 ctLut(float v) {
  v = clamp(v, 0.0, 1.0);
  vec3 c = mix(vec3(0.012, 0.02, 0.045), vec3(0.03, 0.2, 0.32), smoothstep(0.0, 0.25, v));
  c = mix(c, vec3(0.05, 0.6, 0.58), smoothstep(0.2, 0.48, v));
  c = mix(c, vec3(0.93, 0.66, 0.45), smoothstep(0.45, 0.74, v));
  return mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.72, 0.95, v));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec2 res = uRes / uDpr;
  float yTop = 1.0 - uv.y;
  vec2 profP = vec2(px.x, (1.0 - uScan) * uRes.y);

  /* ---- taps: centre, 4 at 1.2 px (blur), 8 at 5.5 px (unsharp, curvature, glint test), 1 on the CT slice row.
     The solid part (base) and the grazing-angle shell part of the tissue are summed separately: the shell only
     counts where the surface is curved or at an outline (normals change across the ring) — a flat plate seen
     at an angle stays a faint plate instead of glowing all over. */
  vec3 nC = vec3(0.0, 0.0, 1.0);
  float bC = 0.0, sC = 0.0, denC = 0.0, covC = 0.0;
  vec2 soft = vec2(0.0), ring = vec2(0.0), prof = vec2(0.0);
  float denRing = 0.0, curv = 0.0;
  for (int i = 0; i < 14; i++) {
    float k = float(i);
    float a = i < 5 ? k * 1.5708 + 0.785 : k * 0.785 + 0.39;
    float r = i == 0 ? 0.0 : i < 5 ? 1.2 : 5.5;
    vec2 q = i == 13 ? profP : px + vec2(cos(a), sin(a)) * r * uDpr;
    vec3 nn;
    vec3 m = matAt(q, nn);
    vec2 bs = m.z * vec2(0.17 + 0.17 * m.x, 1.05 * pow(1.0 - m.x, 2.4)) * 0.4;
    bs.x += m.y;
    if (i == 0) { nC = nn; bC = bs.x; sC = bs.y; denC = m.y; covC = m.z; }
    else if (i < 5) soft += bs;
    else if (i < 13) {
      ring += bs;
      denRing += m.y;
      curv = max(curv, max((1.0 - dot(nC, nn)) * m.z * covC, abs(m.z - covC)));
    }
    else prof = bs;
  }
  soft *= 0.25;
  ring *= 0.125;
  denRing *= 0.125;
  float kc = smoothstep(0.003, 0.03, curv);
  // a dense spot must be backed by its neighbourhood (rejects specular glints on ordinary scenes)
  float denE = min(denC, denRing * 2.6 + 0.04);
  float Dc = mix(bC - denC + denE + kc * sC, soft.x + kc * soft.y, 0.55);
  float Dring = ring.x + kc * ring.y;
  float Dprof = prof.x + 0.6 * prof.y;
  float Ds = max(Dc + 0.6 * (Dc - Dring), 0.0);          // unsharp mask
  float v = 1.0 - exp(-uDose * Ds * 2.1);

  vec2 vc = uv - 0.5;
  vec2 va = vc * vec2(uRes.x / uRes.y, 1.0);
  float vig = dot(va, va);
  float grain = hash12(floor(cp * 0.9) + uSeed * 13.7) - 0.5;
  float grain2 = vnoise(cp * 0.45 + uSeed * 3.1) - 0.5;

  /* ---- film on a light box */
  float lb = 0.84 + 0.16 * (1.0 - smoothstep(0.0, 0.7, vig)) + 0.03 * cos(uv.x * 6.2832 * 2.5 + 0.6) + (vnoise(uv * vec2(3.0, 2.0)) - 0.5) * 0.05;
  vec3 film = mix(vec3(0.02, 0.035, 0.06), vec3(0.8, 0.89, 0.97), pow(clamp(v, 0.0, 1.0), 1.1));
  film *= lb;
  film += (grain * 0.05 + grain2 * 0.03) * (0.3 + v);
  film *= 1.0 - 0.5 * smoothstep(0.1, 0.65, vig);

  /* ---- CT pseudo-colour: circular field, slice band with contours and a density profile */
  float bandH = 0.15;
  float dy = abs(yTop - uScan);
  float inBand = 1.0 - smoothstep(bandH * 0.5 - 0.003, bandH * 0.5, dy);
  vec3 lut = ctLut(v);
  float iso = fract(Ds * 7.0);
  float contour = covC * smoothstep(0.86, 0.95, iso) * (1.0 - smoothstep(0.95, 1.0, iso));
  vec3 ct = mix(lut * 0.5 + luma(lut) * 0.12, lut + contour * vec3(0.5, 0.9, 1.0) * 0.5, inBand);
  float vp = 1.0 - exp(-uDose * Dprof * 2.1);
  float yBase = uScan + bandH * 0.5;
  float yLine = yBase - vp * bandH * 0.82;
  ct += vec3(0.3, 0.95, 1.0) * inBand * step(0.02, vp) * (step(yLine, yTop) * (0.08 + 0.14 * smoothstep(yBase, yLine, yTop)) + exp(-abs(yTop - yLine) * res.y * 0.9) * 0.9);
  float edgeY = abs(dy - bandH * 0.5) * res.y;
  ct += vec3(0.35, 0.95, 1.0) * exp(-edgeY * 1.2) * 0.9;
  float tick = step(fract(cp.x / 24.0), 0.06) * step(dy, bandH * 0.5 + 6.0 / res.y) * step(bandH * 0.5, dy);
  ct += vec3(0.35, 0.95, 1.0) * tick * 0.6;
  // reconstruction circle
  float R = min(res.x, res.y) * 0.47;
  float dc = length(cp - res * 0.5);
  ct *= 1.0 - 0.75 * smoothstep(R - 2.0, R + 2.0, dc);
  ct += vec3(0.25, 0.75, 0.85) * exp(-abs(dc - R) * 0.9) * 0.35;
  vec2 gq = abs(fract(cp / 48.0) - 0.5) * 48.0;
  ct += vec3(0.2, 0.6, 0.7) * (1.0 - smoothstep(0.0, 0.8, min(gq.x, gq.y))) * 0.05;
  ct += grain * 0.03;

  /* ---- baggage scanner: class colour by dense, darkness by total attenuation */
  vec3 cls = mix(vec3(0.97, 0.56, 0.12), vec3(0.22, 0.7, 0.28), smoothstep(0.24, 0.38, denE));
  cls = mix(cls, vec3(0.16, 0.34, 0.86), smoothstep(0.56, 0.76, denE));
  float I = exp(-uDose * Ds * 1.9);
  cls *= mix(1.0, 0.22, smoothstep(0.55, 0.97, 1.0 - I));
  vec3 bgS = vec3(0.95, 0.955, 0.94) - (hash12(vec2(floor(cp.y * 0.5), 3.0)) - 0.5) * 0.025;
  vec3 scan = mix(cls, bgS, I);
  scan += grain * 0.02;

  vec3 col = film * uW.x + ct * uW.y + scan * uW.z;

  /* ---- handheld scanner lens */
  if (uLens.w > 0.001) {
    vec3 lc = linL(px);
    vec3 orig = clamp(linearToSrgb(lc / (1.0 + lc * 0.12)), 0.0, 1.0) * 0.82;
    float d = length(px - uLens.xy);
    float Rl = uLens.z;
    float inL = 1.0 - smoothstep(Rl - 1.5 * uDpr, Rl + 1.5 * uDpr, d);
    col = mix(col, mix(orig, col, inL), uLens.w);
    float ring = exp(-abs(d - Rl) / (1.1 * uDpr));
    float ang = atan(px.y - uLens.y, px.x - uLens.x);
    float tk = step(0.9, fract(ang / 6.2832 * 72.0)) * step(Rl, d) * step(d, Rl + 7.0 * uDpr);
    float shade = smoothstep(Rl, Rl + 26.0 * uDpr, d) * (1.0 - smoothstep(Rl + 26.0 * uDpr, Rl + 60.0 * uDpr, d));
    col = mix(col, col * 0.7, (1.0 - shade) * step(Rl, d) * 0.5 * uLens.w);
    col += vec3(0.75, 0.92, 1.0) * (ring * 0.85 + tk * 0.5) * uLens.w;
  }
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

const IDX: Record<XrayMode, number> = { film: 0, ct: 1, scan: 2 }

type XrayState = {
  mode: XrayMode
  w: [number, number, number]
  target: [number, number, number]
  dose: number
  doseTarget: number
  lens: { x: number; y: number; r: number; on: boolean }
  lensK: number
  t: number
  scanT: number
}
export type XrayEffect = StylizeEffect & { xray: XrayState }

export function createXrayEffect(opts: { mode?: XrayMode; dose?: number } = {}): XrayEffect {
  const mode = opts.mode ?? 'film'
  const w: [number, number, number] = [0, 0, 0]
  w[IDX[mode]] = 1
  const st: XrayState = {
    mode,
    w: [...w] as [number, number, number],
    target: [...w] as [number, number, number],
    dose: opts.dose ?? 1,
    doseTarget: opts.dose ?? 1,
    lens: { x: 0, y: 0, r: 120, on: false },
    lensK: 0,
    t: 0,
    scanT: 0,
  }
  const u = {
    uW: { value: new THREE.Vector3(...w) },
    uDose: { value: st.dose },
    uLens: { value: new THREE.Vector4(0, 0, 100, 0) },
    uScan: { value: 0.5 },
    uT: { value: 0 },
    uSeed: { value: 0 },
  }
  return {
    frag: FRAG,
    uniforms: u,
    normals: true,
    background: xrayMeta.background,
    xray: st,
    update(dt, ctx) {
      st.t += dt
      const k = Math.min(1, dt * 4)
      for (let i = 0; i < 3; i++) st.w[i] += (st.target[i] - st.w[i]) * k
      u.uW.value.set(st.w[0], st.w[1], st.w[2])
      st.dose += (st.doseTarget - st.dose) * Math.min(1, dt * 5)
      u.uDose.value = st.dose
      st.lensK += ((st.lens.on ? 1 : 0) - st.lensK) * Math.min(1, dt * 7)
      u.uLens.value.set(st.lens.x * ctx.dpr, ctx.height - st.lens.y * ctx.dpr, st.lens.r * ctx.dpr, st.lensK)
      // CT slice: sweeps down the frame and back (eased at the ends)
      st.scanT += dt
      const ph = (st.scanT / 7) % 1
      const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2
      u.uScan.value = 0.14 + 0.72 * (tri * tri * (3 - 2 * tri))
      u.uT.value = st.t
      u.uSeed.value = Math.floor(st.t * 18) % 256
    },
  }
}

export function setXrayMode(fx: StylizeEffect, mode: XrayMode) {
  const st = (fx as XrayEffect).xray
  if (!st || st.mode === mode) return
  st.mode = mode
  st.target = [0, 0, 0]
  st.target[IDX[mode]] = 1
}

/** dose / contrast multiplier, default 1 (0.6 soft … 1.6 hard) */
export function setXrayDose(fx: StylizeEffect, dose: number) {
  const st = (fx as XrayEffect).xray
  if (st) st.doseTarget = dose
}

/** round scanner window in CSS px from the top-left of the canvas; `on: false` shows the x-ray everywhere */
export function setXrayLens(fx: StylizeEffect, lens: { x?: number; y?: number; r?: number; on?: boolean }) {
  const st = (fx as XrayEffect).xray
  if (st) Object.assign(st.lens, lens)
}

/** CT slice position (0..1 from the top) for a HUD */
export function xrayScanY(fx: StylizeEffect) {
  return ((fx as XrayEffect).uniforms?.uScan.value as number) ?? 0.5
}
