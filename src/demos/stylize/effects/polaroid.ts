import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 拍立得 — integral instant film.
 *
 *  · OPTICS: a plastic lens — soft focus (one 8-tap ring mixed in, more toward the corners) and a little
 *    halation (a wider ring; highlights bleed outward), strong corner vignette.
 *  · COLOUR SCIENCE: desaturate, cross-processed split toning (shadows pushed teal, highlights yellow),
 *    a soft S-curve that never reaches black or white — blacks are lifted and slightly green/cyan, whites
 *    are a warm cream — and an overall cast per film type.
 *  · CHEMISTRY: the reagent pod is burst by the rollers and spread from the bottom: a darker, odd-coloured
 *    rim around the image edges, uneven "fingers" where it didn't quite reach the top, mottled blotches on
 *    expired stock; warm orange-red light leaks creeping in from one edge; dust specks, a hairline scratch
 *    and static print grain (it is a physical print — none of it flickers).
 *  · DEVELOPING (`developPolaroid(fx)`, ≈ 6 s): flat grey-blue → the cyan dye forms first (the picture
 *    appears blue/cyan), then magenta, the yellow last (warm tones arrive at the end) while contrast builds
 *    up from the centre outward.
 *  · FRAME: `setPolaroidFrame()` puts the picture in a white instant-film frame (thicker bottom border)
 *    lying on a pale oak table with a soft contact shadow — position, size and tilt in CSS px, so a page can
 *    slide it out of a camera (`setPolaroidSlot` hides the part still inside). Without a frame the film look
 *    fills the screen (as in the style switcher).
 * Everything heavy is called from one place per pixel; all taps use textureLod; modes are lerped numbers.
 */

export const polaroidModes = [
  { id: 'sx70', label: 'SX-70' },
  { id: 'p600', label: '600' },
  { id: 'expired', label: '过期相纸' },
] as const
export type PolaroidMode = (typeof polaroidModes)[number]['id']

export const polaroidMeta = { title: '拍立得', en: 'Polaroid', background: '#cfdde0', theme: 'light' as const }

/* ------------------------------------------------------------------ per-mode look */

type V3 = [number, number, number]
type Look = {
  black: V3
  white: V3
  cast: V3
  sat: number
  contrast: number
  soft: number
  vig: number
  chem: number
  leak: number
  blotch: number
  split: number
}

const LOOKS: Record<PolaroidMode, Look> = {
  sx70: { black: [0.14, 0.18, 0.18], white: [0.99, 0.94, 0.82], cast: [1.03, 1.0, 0.93], sat: 0.84, contrast: 1.02, soft: 1, vig: 0.6, chem: 0.6, leak: 0.7, blotch: 0, split: 1 },
  p600: { black: [0.06, 0.09, 0.105], white: [0.97, 0.965, 0.92], cast: [0.95, 1.0, 1.05], sat: 0.98, contrast: 1.32, soft: 0.35, vig: 0.5, chem: 0.42, leak: 0.35, blotch: 0, split: 0.75 },
  expired: { black: [0.26, 0.15, 0.22], white: [1.0, 0.86, 0.72], cast: [1.12, 0.86, 0.92], sat: 0.6, contrast: 0.72, soft: 0.8, vig: 0.7, chem: 1, leak: 1, blotch: 1, split: 1.3 },
}
const KEYS = ['sat', 'contrast', 'soft', 'vig', 'chem', 'leak', 'blotch', 'split'] as const
const V3KEYS = ['black', 'white', 'cast'] as const

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const o = { ...a }
  for (const key of KEYS) o[key] = a[key] + (b[key] - a[key]) * k
  for (const key of V3KEYS) o[key] = [0, 1, 2].map((i) => a[key][i] + (b[key][i] - a[key][i]) * k) as V3
  return o
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform vec4 uFrame;      // print: centre (CSS px, from top-left), half image size, tilt (rad); z < 0 → full-bleed
uniform vec3 uView;       // where the camera framed the picture: centre + half size (CSS px)
uniform float uSlot;      // the print is hidden above this line (CSS px from the top): still inside the camera
uniform vec3 uBlack, uWhite, uCast;
uniform float uSat, uContrast, uSoft, uVig, uChem, uLeak, uBlotch, uSplit;
uniform float uDev;       // 0 … 1 development
uniform float uSeed;      // per print: where the leak / dust / scratch fall

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

/* the picture. spx: scene sample point (device px), iuv: 0..1 across the image (y down), asp: width / height,
   ip: CSS px per image unit (for grain / dust size) */
vec3 film(vec2 spx, vec2 iuv, float asp, float ip) {
  vec2 ic = (iuv - 0.5) * vec2(asp, 1.0) / max(asp, 1.0) * 2.0;   // -1..1 on the long side
  float corner = clamp(dot(ic, ic) * 0.5, 0.0, 1.0);

  /* lens: soft focus + halation, one loop */
  vec3 c0 = sceneL(spx);
  vec3 near = vec3(0.0), far = vec3(0.0);
  float r1 = (0.7 + 1.1 * uSoft + 1.6 * corner) * uDpr;
  float r2 = (7.0 + 5.0 * uSoft) * uDpr;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    vec2 d = vec2(cos(a), sin(a));
    near += sceneL(spx + d * r1);
    far += sceneL(spx + d.yx * vec2(1.0, -1.0) * r2);
  }
  near /= 8.0;
  far /= 8.0;
  vec3 c = mix(c0, near, clamp(0.25 + 0.4 * uSoft + 0.3 * corner, 0.0, 1.0));
  vec3 glow = max(far - 0.62, 0.0);
  c += glow * vec3(1.0, 0.85, 0.7) * (0.5 + 0.6 * uSoft);

  /* colour science */
  float L = luma(c);
  c = mix(vec3(L), c, uSat);
  c *= uCast;
  // cross-processed split tone: teal shadows, yellow highlights
  float sh = (1.0 - L) * (1.0 - L);
  float hi = L * L;
  c += uSplit * (sh * vec3(-0.05, 0.03, 0.045) + hi * vec3(0.05, 0.025, -0.07));
  // soft S-curve into lifted, tinted blacks and creamy whites
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.55);
  c = uBlack + (uWhite - uBlack) * c;

  /* chemistry */
  vec2 e = vec2(min(iuv.x, 1.0 - iuv.x), 1.0 - iuv.y) * vec2(asp, 1.0) / max(asp, 1.0);
  float top = iuv.y * min(asp, 1.0);
  float edgeN = vnoise(vec2(iuv.x * 16.0 + uSeed, iuv.y * 3.0)) - 0.5;
  float rim = smoothstep(0.045, 0.0, min(e.x, e.y) + edgeN * 0.02) * uChem;
  c = mix(c, c * vec3(0.72, 0.82, 0.86), rim * 0.7);
  // the reagent didn't quite reach the top: ragged fingers, under-developed and warm
  float reach = 0.035 + (vnoise(vec2(iuv.x * 9.0 + uSeed * 3.0, 0.5)) * 0.06 + vnoise(vec2(iuv.x * 31.0, uSeed)) * 0.025) * uChem;
  float finger = smoothstep(reach, reach - 0.012, top) * step(0.05, uChem);
  c = mix(c, vec3(0.93, 0.78, 0.55) * mix(vec3(1.0), uCast, 0.5), finger * 0.85);
  float tide = exp(-pow((top - reach) / 0.006, 2.0)) * uChem * 0.25;
  c *= 1.0 - tide;
  // expired stock: mottled patches of magenta / orange
  float bl = fbm(iuv * vec2(asp, 1.0) * 3.2 + uSeed * 1.7);
  float b2 = fbm(iuv * vec2(asp, 1.0) * 6.5 + 9.0 + uSeed);
  c = mix(c, c * vec3(1.12, 0.78, 1.0), smoothstep(0.55, 0.75, bl) * 0.55 * uBlotch);
  c = mix(c, c * vec3(1.15, 0.92, 0.7), smoothstep(0.6, 0.78, b2) * 0.45 * uBlotch);

  /* vignette */
  c *= 1.0 - uVig * smoothstep(0.15, 1.0, corner) * 0.85;
  c = mix(c, c * vec3(0.9, 0.95, 1.05), smoothstep(0.3, 1.0, corner) * 0.4);

  /* light leak creeping in from one edge: warm streaks, red at the edge, amber further in */
  float dEdge = (uSeed < 4.0 ? 1.0 - iuv.x : iuv.x) * asp / max(asp, 1.0);
  float ly = iuv.y * 1.0 + dEdge * 0.9;           // the streaks lean as they come in
  float streak = smoothstep(0.15, 0.95, 0.5 + 0.5 * sin(ly * 7.0 + uSeed * 1.3) * sin(ly * 2.3 + uSeed));
  float reachL = 0.1 + 0.16 * streak;
  float leak = exp(-dEdge / reachL) * (0.35 + 0.65 * streak) * uLeak;
  vec3 leakCol = mix(vec3(1.0, 0.42, 0.16), vec3(1.0, 0.16, 0.08), exp(-dEdge / 0.04));
  leakCol = mix(vec3(1.0, 0.78, 0.4), leakCol, smoothstep(0.0, 0.5, leak));
  c = 1.0 - (1.0 - c) * (1.0 - leakCol * min(leak, 1.0) * 0.9);

  /* development: cyan dye first (red channel), magenta, yellow last; contrast builds from the centre */
  float dv = clamp(uDev * 1.12 - corner * 0.08 - (vnoise(iuv * 5.0 + uSeed) - 0.5) * 0.08, 0.0, 1.0);
  vec3 base = vec3(0.56, 0.6, 0.63) + (vnoise(iuv * 3.0) - 0.5) * 0.03;
  vec3 ch = vec3(smoothstep(0.02, 0.5, dv), smoothstep(0.18, 0.72, dv), smoothstep(0.38, 1.0, dv));
  vec3 cDev = mix(vec3(luma(c)), c, smoothstep(0.3, 1.0, dv));
  cDev = mix(vec3(0.6), cDev, 0.35 + 0.65 * smoothstep(0.0, 0.85, dv));
  c = mix(base, cDev, ch);

  /* physical print: static grain, dust, a hairline scratch */
  vec2 gp = iuv * ip;
  float gr = (hash12(floor(gp / 1.3) + uSeed) - 0.5) * 0.05 + (vnoise(gp * 0.7) - 0.5) * 0.035;
  c += gr * (0.5 + L);
  vec2 dc = floor(gp / 3.0);
  float dh = hash12(dc + uSeed * 7.0);
  vec2 dp = fract(gp / 3.0) - 0.5;
  float speck = step(0.9993, dh) * smoothstep(0.42, 0.15, length(dp));
  c = mix(c, hash12(dc + 3.1) > 0.3 ? vec3(0.97, 0.96, 0.93) : uBlack * 0.7, speck * 0.8);
  vec2 sd = rot(0.35 + uSeed * 0.2) * (iuv - vec2(0.3 + uSeed * 0.05, 0.5));
  float scratch = smoothstep(0.0012, 0.0, abs(sd.x + sin(sd.y * 6.0) * 0.01)) * step(abs(sd.y), 0.28) * 0.45;
  c = mix(c, vec3(0.95, 0.93, 0.88), scratch * (0.4 + 0.6 * uChem));
  return clamp(c, 0.0, 1.0);
}

vec3 tableAt(vec2 cp) {
  // pale oak boards running across
  float plank = floor(cp.y / 150.0);
  float wy = cp.y + vnoise(vec2(cp.x / 260.0, plank)) * 18.0;
  float grain = fbm(vec2(cp.x / 380.0 + plank * 7.0, wy / 5.0));
  float fine = vnoise(vec2(cp.x / 30.0, wy / 1.2));
  vec3 c = vec3(0.86, 0.77, 0.63) * (0.9 + 0.1 * hash12(vec2(plank, 2.0)));
  c *= 1.0 - 0.1 * smoothstep(0.45, 0.8, grain) - 0.03 * fine;
  float seam = smoothstep(1.6, 0.0, abs(mod(cp.y, 150.0) - 1.0));
  c *= 1.0 - seam * 0.22;
  return c;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 cd = vec2(cp.x, res.y - cp.y);          // CSS px from the top-left, like the DOM

  if (uFrame.z < 0.0) {
    // full-bleed: the screen is the picture
    vec2 iuv = cd / res;
#ifdef RAW
    return sceneL(px);
#else
    return film(px, iuv, res.x / res.y, max(res.x, res.y));
#endif
  }

  float s = uFrame.z;
  vec2 q = rot(-uFrame.w) * (cd - uFrame.xy);    // print-local, y down
  float side = s * 0.12, topB = s * 0.15, botB = s * 0.56;
  vec2 fc = vec2(0.0, (botB - topB) * 0.5);       // frame centre relative to the image centre
  vec2 fh = vec2(s + side, s + (topB + botB) * 0.5);

  vec3 col = tableAt(cp);
  // soft contact shadow, light from the upper left
  vec2 qs = rot(-uFrame.w) * (cd - uFrame.xy - vec2(5.0, 9.0));
  float shd = sdBox(qs - fc, fh - 3.0);
  float vis = step(uSlot, cd.y);                  // still inside the camera above the slot
  col *= 1.0 - 0.3 * smoothstep(20.0, -6.0, shd) * vis;

  float df = sdBox(q - fc, fh - 2.0) - 2.0;       // rounded corners
  float inFrame = smoothstep(0.7, -0.7, df) * vis;
  if (inFrame > 0.0) {
    // matte white frame with a faint texture, slightly darker toward its edge
    vec3 fr = vec3(0.955, 0.945, 0.925) * (0.985 + 0.015 * vnoise(q * 0.5)) - 0.02 * smoothstep(-6.0, 0.0, df);
    float di = sdBox(q, vec2(s));
    vec3 c = fr;
    if (di < 0.6) {
      vec2 iuv = q / (2.0 * s) + 0.5;
      vec2 v = uView.xy + q * (uView.z / s);
      vec2 spx = vec2(v.x, res.y - v.y) * uDpr;
#ifdef RAW
      vec3 ph = sceneL(spx);
#else
      vec3 ph = film(spx, iuv, 1.0, 2.0 * s);
#endif
      c = mix(fr, ph, smoothstep(0.6, -0.6, di));
    }
    // the frame stands a hair proud of the picture: inner shadow along the window's top / left edges
    if (di < 0.0) c *= 1.0 - 0.16 * smoothstep(3.0, 0.0, min(q.x + s, q.y + s));
    col = mix(col, c, inFrame);
  }
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const DEV_TIME = 6.2

type PState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: PolaroidMode
  dev: number // seconds into development; >= DEV_TIME = done
  shown?: number // performance.now() of the first frame on screen
}
export type PolaroidEffect = StylizeEffect & { pol: PState }

export function createPolaroidEffect(init: { mode?: PolaroidMode } = {}): PolaroidEffect {
  const m0 = init.mode ?? 'sx70'
  const st: PState = { from: LOOKS[m0], to: LOOKS[m0], cur: LOOKS[m0], k: 1, mode: m0, dev: DEV_TIME }
  const u = {
    uFrame: { value: new THREE.Vector4(0, 0, -1, 0) },
    uView: { value: new THREE.Vector3(0, 0, 1) },
    uSlot: { value: -1e5 },
    uBlack: { value: new THREE.Vector3() },
    uWhite: { value: new THREE.Vector3() },
    uCast: { value: new THREE.Vector3() },
    uSat: { value: 1 },
    uContrast: { value: 1 },
    uSoft: { value: 1 },
    uVig: { value: 0.5 },
    uChem: { value: 0.5 },
    uLeak: { value: 0.5 },
    uBlotch: { value: 0 },
    uSplit: { value: 1 },
    uDev: { value: 1 },
    uSeed: { value: 2.3 },
  }
  const apply = () => {
    const L = st.cur
    u.uBlack.value.set(...L.black)
    u.uWhite.value.set(...L.white)
    u.uCast.value.set(...L.cast)
    for (const key of KEYS) (u as Record<string, THREE.IUniform>)['u' + key[0].toUpperCase() + key.slice(1)].value = L[key]
  }
  apply()
  const ease = (x: number) => x * x * (3 - 2 * x)
  return {
    frag: FRAG,
    uniforms: u,
    background: polaroidMeta.background,
    pol: st,
    update(dt) {
      if (st.shown === undefined) st.shown = performance.now()
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
        apply()
      }
      if (st.dev < DEV_TIME) st.dev = Math.min(DEV_TIME, st.dev + dt)
      u.uDev.value = st.dev / DEV_TIME
    },
  }
}

/** the matching 原图: same table and frame, the untouched render inside */
export function createPolaroidOriginal(fx: StylizeEffect): StylizeEffect {
  return { frag: '#define RAW\n' + FRAG, uniforms: fx.uniforms, background: fx.background }
}

export function setPolaroidMode(fx: StylizeEffect, mode: PolaroidMode) {
  const st = (fx as PolaroidEffect).pol
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** develop a fresh print (≈ 6 s): grey-blue → cyan → full colour. A new print gets its own leak and dust. */
export function developPolaroid(fx: StylizeEffect, opts: { reseed?: boolean } = {}) {
  const st = (fx as PolaroidEffect).pol
  if (!st) return
  st.dev = 0
  if (opts.reseed !== false && fx.uniforms) fx.uniforms.uSeed.value = Math.round(Math.random() * 79) / 10
}

/** jump to a fully developed print (posters) */
export function finishPolaroid(fx: StylizeEffect) {
  const st = (fx as PolaroidEffect).pol
  if (st) st.dev = DEV_TIME
  if (fx.uniforms) fx.uniforms.uDev.value = 1
}

/** 0 → 1 through the development */
export function polaroidProgress(fx: StylizeEffect) {
  const st = (fx as PolaroidEffect).pol
  return st ? st.dev / DEV_TIME : 1
}

/**
 * place the print (CSS px from the top-left, like the DOM): centre, half the IMAGE size, tilt in radians.
 * `view` is where the camera framed the picture (defaults to the print's own box). `null` = full-bleed film.
 */
export function setPolaroidFrame(
  fx: StylizeEffect,
  frame: { x: number; y: number; s: number; angle?: number } | null,
  view?: { x: number; y: number; s: number },
) {
  const u = fx.uniforms
  if (!u) return
  if (!frame) {
    ;(u.uFrame.value as THREE.Vector4).set(0, 0, -1, 0)
    return
  }
  ;(u.uFrame.value as THREE.Vector4).set(frame.x, frame.y, frame.s, frame.angle ?? 0)
  const v = view ?? frame
  ;(u.uView.value as THREE.Vector3).set(v.x, v.y, v.s)
}

/** hide the part of the print above this line (CSS px from the top) — it is still inside the camera */
export function setPolaroidSlot(fx: StylizeEffect, y: number | null) {
  if (fx.uniforms) fx.uniforms.uSlot.value = y ?? -1e5
}
