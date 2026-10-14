import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'
import { SIMPLEX_3D, hexToRgb } from '../../shader/glsl'

/*
 * 版画雕刻 — three relief-print looks drawn from one "line field".
 *
 * Line field: parallel lines whose phase is   (screen position · dir  −  relief · depth) / spacing.
 * Subtracting the (linear) view depth is the same as slicing the scene with a stack of planes tilted toward the
 * camera, so the lines bow over every form like latitude lines over a globe, crowd together where a surface
 * turns away, and break cleanly at silhouettes — the banknote-portrait look. Where a surface lies almost parallel
 * to the slicing planes (the line field goes sparse) a second, steeper family takes over automatically.
 *
 *   copper   line screen: line width follows darkness (thin hairlines in the light, swelling in the shadows),
 *            a crossing family in deep shadow, a third in the darkest core; guilloché rosette on the background
 *   woodcut  bold black ground with white gouge cuts along the same field — a cut's width follows lightness, so
 *            cuts taper naturally into the dark; jagged noise on every threshold, wood-grain ink
 *   linocut  two blocks printed on top of each other: a red block (highlights cut away, slightly misregistered,
 *            mottled ink) and a black keyline / shadow block with gouged lines
 *
 * All widths and spacings are CSS px × uDpr, so line density is identical at DPR 1 and 2.
 */

export type EngraveMode = 'copper' | 'woodcut' | 'linocut'

export const engraveMeta = { title: '版画雕刻', en: 'Engraving', background: '#f1ead9', theme: 'light' as const }

export const engraveModes: { id: EngraveMode; label: string; en: string; paper: string; ink: string }[] = [
  { id: 'copper', label: '铜版雕刻', en: 'Copperplate', paper: '#f1ead9', ink: '#1d2a44' },
  { id: 'woodcut', label: '木刻', en: 'Woodcut', paper: '#efe6d3', ink: '#17130f' },
  { id: 'linocut', label: '麻胶双色', en: 'Linocut', paper: '#f0e4ca', ink: '#1b1613' },
]
const LINO_RED = '#c9432a'

const FRAG = /* glsl */ `
uniform float uSpacing;   // line spacing, CSS px
uniform float uModeA;
uniform float uModeB;
uniform float uModeMix;
uniform float uRelief;    // slicing tilt × px-per-world-unit, as a fraction of the view height
uniform vec2 uCenter;     // uv of the medallion / sun behind the subject
uniform float uContrast;
uniform vec3 uInkCopper;
uniform vec3 uInkWood;
uniform vec3 uInkLino;
uniform vec3 uRed;
uniform vec3 uPaper0;
uniform vec3 uPaper1;
uniform vec3 uPaper2;

${SIMPLEX_3D}

float lineCov(float ph, float fw, float w) {
  float f = abs(fract(ph + 0.5) - 0.5);          // 0 on a line's centre … 0.5 between lines
  float aa = max(fw, 1e-4) * 0.75;
  float c = (1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, f)) * min(1.0, w / (2.0 * aa)); // sub-pixel lines fade, not vanish
  // lines closer than ~2.5 device px would alias: fade to their average ink instead
  return mix(c, w, smoothstep(0.3, 0.55, fw));
}

vec3 paperAt(vec2 cp, vec3 base) {
  float blotch = snoise(vec3(cp * 0.0025, 3.0));
  vec2 r1 = mat2(0.94, 0.34, -0.34, 0.94) * cp;
  float fib = smoothstep(0.6, 0.95, snoise(vec3(r1 * vec2(0.012, 0.2), 1.0)));
  float grain = hash12(floor(cp)) - 0.5;
  return base * (1.0 - 0.03 * blotch - 0.025 * grain) - vec3(0.045, 0.045, 0.04) * fib * 0.6;
}

// 0 = white … 1 = black
float darkAt(vec2 px) {
  float l = luma(sceneAt(px));
  return 1.0 - clamp((l - 0.5) * uContrast + 0.5, 0.0, 1.0);
}

// silhouettes (1/z Laplacian) + creases; w = sampling offset in device px
float edgeAt(vec2 px, float w) {
  vec2 dx = vec2(w, 0.0), dy = vec2(0.0, w);
  float i0 = 1.0 / depthAt(px);
  float iL = 1.0 / depthAt(px - dx), iR = 1.0 / depthAt(px + dx);
  float iD = 1.0 / depthAt(px - dy), iU = 1.0 / depthAt(px + dy);
  float lap = max(abs(iL + iR - 2.0 * i0), abs(iD + iU - 2.0 * i0)) / max(max(i0, max(iL, iR)), max(iD, iU));
  float e = smoothstep(0.02, 0.06, lap);
  vec3 n = normalAt(px);
  vec3 a = normalAt(px - dx), b = normalAt(px + dx), c = normalAt(px - dy), d = normalAt(px + dy);
  float m = 1.0;
  if (dot(n, n) > 0.5) {
    if (dot(a, a) > 0.5) m = min(m, dot(n, a));
    if (dot(b, b) > 0.5) m = min(m, dot(n, b));
    if (dot(c, c) > 0.5) m = min(m, dot(n, c));
    if (dot(d, d) > 0.5) m = min(m, dot(n, d));
  }
  return max(e, smoothstep(0.86, 0.6, m));
}

// globals filled once per pixel (derivatives must be taken in uniform control flow)
float D;      // darkness
float COV;    // coverage
float EDGE;
float PA, PB, PC, PW, PG;         // phases: main, cross, deep, woodcut, gouge (linocut)
float FA, FB, FC, FW, FG;         // their screen-space widths (fwidth)
vec2 CP;                          // CSS px

vec3 copper() {
  // main family: width follows darkness; fills in with the steeper family where the field goes sparse
  float sparse = smoothstep(0.55, 0.3, FA * uSpacing * uDpr);   // FA·spacing ≈ 1 on surfaces facing the camera
  float wA = clamp(D * 1.05 + 0.07 * smoothstep(0.0, 0.06, D), 0.0, 0.92);   // hairlines survive into the lights
  float a = lineCov(PA, FA, wA) * (1.0 - sparse);
  float aB = lineCov(PB, FB, wA) * sparse;
  float wB = clamp((D - 0.5) * 1.7, 0.0, 0.8);
  float b = lineCov(PB, FB, wB);
  float wC = clamp((D - 0.8) * 2.5, 0.0, 0.7);
  float c = lineCov(PC, FC, wC);
  float ink = max(max(a, aB), max(b, c)) * COV;

  // guilloché rosette around the subject (background only)
  vec2 q = (CP - uCenter * uRes / uDpr);
  float R = length(q);
  float H = min(uRes.y, uRes.x * 1.25) / uDpr;  // frame size: view height, or width on portrait phones
  float th = atan(q.y, q.x);
  float g1 = (R + 7.0 * sin(th * 18.0) + 4.0 * sin(th * 7.0 + 1.0)) / 5.5;
  float g2 = (R - 7.0 * sin(th * 18.0 + 0.6) + 4.0 * sin(th * 11.0)) / 5.5;
  float ring = smoothstep(0.25 * H, 0.29 * H, R) * smoothstep(0.39 * H, 0.355 * H, R);
  float inner = smoothstep(0.25 * H, 0.2 * H, R) * 0.4;
  float gl = max(lineCov(g1, fwidth(g1), 0.11), lineCov(g2, fwidth(g2), 0.11));
  float gu = gl * (ring + inner) * 0.42 * (1.0 - COV);
  // a fine border ring
  float rim = (1.0 - smoothstep(0.4, 1.1, abs(R - 0.4 * H))) * 0.7 + (1.0 - smoothstep(0.3, 0.9, abs(R - 0.41 * H))) * 0.4;
  gu = max(gu, rim * (1.0 - COV));

  ink = max(ink, gu);
  ink = max(ink, EDGE * 0.92);
  vec3 col = paperAt(CP, uPaper0);
  return mix(col, uInkCopper, ink * 0.94);
}

vec3 woodcut() {
  float n1 = snoise(vec3(CP / 11.0, 1.7));
  float n2 = snoise(vec3(CP / 3.2, 4.1));
  float d = D + 0.16 * n1 + 0.07 * n2;
  // white gouge cuts in a black block; a cut's width follows lightness so it tapers into the shadows
  float cutW = smoothstep(0.36, 0.94, 1.0 - d);
  float cut = lineCov(PW + 0.18 * n1, FW, cutW);
  float ink = (1.0 - cut) * COV;
  // flecks: little gouge nicks left in the solid black
  float nick = step(0.8, snoise(vec3(CP * vec2(0.22, 0.6), 9.0))) * step(0.66, d);
  ink *= 1.0 - nick * COV;

  // the uncut block behind the subject: black, with long horizontal gouges that open up toward the top
  vec2 q = (CP - uCenter * uRes / uDpr);
  float H = min(uRes.y, uRes.x * 1.25) / uDpr;  // frame size: view height, or width on portrait phones
  vec2 hb = vec2(0.4, 0.385) * H;
  vec2 bq = abs(q) - hb + 2.5 * vec2(snoise(vec3(CP.yy / 25.0, 1.0)), snoise(vec3(CP.xx / 25.0, 2.0)));
  float block = 1.0 - smoothstep(-0.8, 0.8, max(bq.x, bq.y));
  float sky = clamp(q.y / hb.y * 0.5 + 0.5, 0.0, 1.0);                // 0 bottom … 1 top
  float gw = smoothstep(0.15, 1.0, sky) * 0.85 + 0.06 * snoise(vec3(CP / vec2(60.0, 6.0), 7.0));
  float gouge = lineCov(PG + 0.12 * snoise(vec3(CP / 50.0, 3.0)), FG, max(gw, 0.0));
  float bg = block * (1.0 - gouge);
  // keep a thin white "cut-around" line between the block and the subject
  float halo = smoothstep(0.2, 0.6, EDGE) * (1.0 - COV);
  bg *= 1.0 - halo;
  ink = max(ink, bg * (1.0 - COV));
  ink = max(ink, smoothstep(0.35, 0.6, EDGE) * COV);

  // wood grain in the ink, a few paper specks
  float grain = snoise(vec3(CP * vec2(0.012, 0.18), 2.0));
  float speck = step(0.8, snoise(vec3(CP * 0.45, 5.0)));
  float dens = 0.93 + 0.07 * grain - 0.5 * speck;
  vec3 col = paperAt(CP, uPaper1);
  return mix(col, uInkWood, clamp(ink * dens, 0.0, 1.0));
}

vec3 linocut() {
  vec2 mis = vec2(2.2, -1.6) * uDpr;
  // red block (sampled at a misregistered position)
  vec2 pr = gl_FragCoord.xy + mis;
  float dR = darkAt(pr);
  float covR = coverageAt(pr);
  float nR = snoise(vec3(CP / 14.0, 6.0));
  float red = covR * step(0.15 + 0.04 * nR, dR);
  // sun disc behind the subject, with horizontal gouges cut through it
  vec2 q = (CP - uCenter * uRes / uDpr);
  float H = min(uRes.y, uRes.x * 1.25) / uDpr;  // frame size: view height, or width on portrait phones
  float disc = 1.0 - smoothstep(0.36 * H - 1.0, 0.36 * H + 1.0, length(q) + 3.0 * snoise(vec3(CP / 30.0, 2.0)));
  float stripes = lineCov(PG, FG, smoothstep(-0.1 * H, 0.3 * H, -q.y) * 0.75);
  red = max(red, disc * (1.0 - stripes) * (1.0 - covR));
  // mottled ink: density variation + small holes where the roller skipped
  float mott = 0.9 + 0.1 * snoise(vec3(CP * 0.05, 8.0));
  float holes = step(0.72, snoise(vec3(CP * 0.32, 3.0))) * 0.55;
  red *= mott * (1.0 - holes);

  // black block: keylines + shadows with gouged lines
  float n1 = snoise(vec3(CP / 9.0, 3.3));
  float d = D + 0.1 * n1;
  float cutW = smoothstep(0.4, 0.8, 1.0 - d);
  float blk = (1.0 - lineCov(PW + 0.08 * n1, FW, cutW)) * COV * smoothstep(0.4, 0.44, d);
  blk = max(blk, smoothstep(0.3, 0.55, EDGE));
  blk *= 0.92 + 0.08 * snoise(vec3(CP * vec2(0.02, 0.25), 1.0));

  vec3 col = paperAt(CP, uPaper2);
  col *= mix(vec3(1.0), uRed, clamp(red, 0.0, 1.0));
  col *= mix(vec3(1.0), uInkLino, clamp(blk, 0.0, 1.0));
  return col;
}

vec3 modeCol(float m) {
  if (m < 0.5) return copper();
  if (m < 1.5) return woodcut();
  return linocut();
}

vec3 stylize(vec2 px) {
  CP = px / uDpr;
  D = darkAt(px);
  COV = coverageAt(px);
  float depth = depthAt(px);
  float bend = uRelief * uRes.y * (COV > 0.5 ? depth : 0.0);
  float sp = uSpacing * uDpr;
  // line families: main ~ -8°, cross ~ 52°, deep ~ -62°
  PA = (dot(px, vec2(0.139, 0.990)) - bend) / sp;
  PB = (dot(px, vec2(-0.788, 0.616)) - bend * 0.8) / sp;
  PC = (dot(px, vec2(0.883, 0.469)) - bend * 0.8) / (sp * 0.9);
  PW = (dot(px, vec2(0.21, 0.978)) - bend) / (sp * 2.3);
  PG = px.y / (sp * 2.6);
  FA = fwidth(PA); FB = fwidth(PB); FC = fwidth(PC); FW = fwidth(PW); FG = fwidth(PG);
  EDGE = edgeAt(px, max(1.0, 0.9 * uDpr));

  vec3 a = modeCol(uModeA);
  if (uModeMix <= 0.0) return a;
  vec3 b = modeCol(uModeB);
  return mix(a, b, smoothstep(0.0, 1.0, uModeMix));
}
`

/* ------------------------------------------------------------------ factory + controls */

const MODE_INDEX: Record<EngraveMode, number> = { copper: 0, woodcut: 1, linocut: 2 }
type State = { spacing: number; spacingT: number; relief: number; reliefT: number }
// keyed by the uniforms object, which survives `{ ...fx }` copies made by other demos
const STATE = new WeakMap<object, State>()
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)
const v3 = (hex: string) => new THREE.Vector3(...hexToRgb(hex))

export function createEngraveEffect(init: { mode?: EngraveMode; spacing?: number } = {}): StylizeEffect {
  const m0 = MODE_INDEX[init.mode ?? 'copper']
  const sp = init.spacing ?? 5
  const uniforms = {
    uSpacing: { value: sp },
    uModeA: { value: m0 },
    uModeB: { value: m0 },
    uModeMix: { value: 0 },
    uRelief: { value: 0.085 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uContrast: { value: 1.4 },
    uInkCopper: { value: v3(engraveModes[0].ink) },
    uInkWood: { value: v3(engraveModes[1].ink) },
    uInkLino: { value: v3(engraveModes[2].ink) },
    uRed: { value: v3(LINO_RED) },
    uPaper0: { value: v3(engraveModes[0].paper) },
    uPaper1: { value: v3(engraveModes[1].paper) },
    uPaper2: { value: v3(engraveModes[2].paper) },
  }
  const st: State = { spacing: sp, spacingT: sp, relief: 0.085, reliefT: 0.085 }
  const fx: StylizeEffect = {
    frag: FRAG,
    uniforms,
    normals: true,
    update(dt) {
      if (uniforms.uModeA.value !== uniforms.uModeB.value) {
        uniforms.uModeMix.value = Math.min(1, uniforms.uModeMix.value + dt / 0.8)
        if (uniforms.uModeMix.value >= 1) {
          uniforms.uModeA.value = uniforms.uModeB.value
          uniforms.uModeMix.value = 0
        }
      }
      const k = 1 - Math.exp(-dt * 5)
      st.spacing += (st.spacingT - st.spacing) * k
      st.relief += (st.reliefT - st.relief) * k
      uniforms.uSpacing.value = st.spacing
      uniforms.uRelief.value = st.relief
    },
  }
  STATE.set(uniforms, st)
  return fx
}

type U = { [k: string]: THREE.IUniform }

/** switch the print technique (crossfades) */
export function setEngraveMode(fx: StylizeEffect, mode: EngraveMode) {
  const u = fx.uniforms as U
  const m = MODE_INDEX[mode]
  if (u.uModeA.value === m && u.uModeB.value === m) return
  if (u.uModeA.value !== u.uModeB.value && u.uModeMix.value > 0.5) u.uModeA.value = u.uModeB.value
  u.uModeB.value = m
  u.uModeMix.value = 0
  if (u.uModeA.value === m) u.uModeB.value = m
}

/** line spacing in CSS px (eases) */
export function setEngraveDensity(fx: StylizeEffect, spacingCss: number, instant = false) {
  const st = stateOf(fx)
  if (!st) return
  st.spacingT = spacingCss
  if (instant) st.spacing = spacingCss
}

/** how strongly lines bow over the forms (≈ slicing tilt × screen-height fraction per world unit) */
export function setEngraveRelief(fx: StylizeEffect, relief: number) {
  const st = stateOf(fx)
  if (st) st.reliefT = relief
}

/** centre (uv, 0..1, y up) of the guilloché medallion / linocut sun */
export function setEngraveCenter(fx: StylizeEffect, u: number, v: number) {
  ;(fx.uniforms as U).uCenter.value.set(u, v)
}
