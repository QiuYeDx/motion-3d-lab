import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 说明书线图 — assembly-instruction illustration (LEGO / IKEA manuals).
 *
 *  · Lines with ONE weight: from every pixel 8 rays march outward (4 steps) looking for the nearest edge —
 *    a coverage change or a depth step that the plane through the pixel doesn't predict (silhouettes and
 *    part-over-part outlines), or a crease where the view normal turns by more than ~40°; the hit is refined
 *    by bisection. The line is drawn
 *    where that distance is under half the line width, so silhouettes get one thick uniform weight and
 *    creases one thin one, independent of the geometry.
 *  · Flat fills with exactly two tones. The fill is the object's paint, recovered from the render without its
 *    shading: coloured pixels keep their hue (chromaticity) at one fixed paint value, neutral ones snap to the
 *    nearest plastic grey (black · dark · light · white), so lighting gradients never reach the fill. The tone
 *    comes from the view normal against a fixed illustrator's light (upper left): lit, or one flat shadow.
 *  · A crisp white hairline runs just inside the outline along upper-left edges of lit faces; LEGO adds a
 *    crisp glossy pip / streak on curved plastic.
 *  · Ground: paper white; LEGO puts the step on a soft blue-grey panel, the exploded view on faint
 *    engineering grid paper with blue ink.
 *  · Modes are numbers lerped on the CPU (one shader path), so switching crossfades.
 */

export const manualModes = [
  { id: 'brick', label: '积木' },
  { id: 'flatpack', label: '家具' },
  { id: 'exploded', label: '爆炸图' },
] as const
export type ManualMode = (typeof manualModes)[number]['id']

export const manualMeta = { title: '说明书线图', en: 'Instruction Manual', background: '#f7f6f2', theme: 'light' as const }

type V3 = [number, number, number]
type Look = {
  lineW: number // silhouette width, CSS px
  creaseW: number // crease width, CSS px
  color: number // 1 colour fills, 0 grey
  pale: number // 0 solid fill … 1 nearly paper
  sat: number
  shadowK: number
  hi: number // edge hairline
  gloss: number
  panel: number
  grid: number
  ink: V3
  tint: V3 // fill / shadow tint
  panelCol: V3
}

const rgb = (hex: string): V3 => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LOOKS: Record<ManualMode, Look> = {
  brick: {
    lineW: 2.3, creaseW: 1.15, color: 1, pale: 0, sat: 1.15, shadowK: 0.74, hi: 1, gloss: 1, panel: 1, grid: 0,
    ink: rgb('#17171a'), tint: rgb('#eef0ff'), panelCol: rgb('#e2e8ef'),
  },
  flatpack: {
    lineW: 2.0, creaseW: 1.0, color: 0, pale: 0, sat: 1, shadowK: 0.82, hi: 0.6, gloss: 0, panel: 0, grid: 0,
    ink: rgb('#111111'), tint: rgb('#ffffff'), panelCol: rgb('#eeeeec'),
  },
  exploded: {
    lineW: 1.7, creaseW: 0.9, color: 1, pale: 0.9, sat: 0.3, shadowK: 0.86, hi: 0.4, gloss: 0, panel: 0, grid: 1,
    ink: rgb('#1d3c74'), tint: rgb('#d6e4fa'), panelCol: rgb('#eef3fb'),
  },
}

const UNI: Record<keyof Look, string> = {
  lineW: 'uLineW',
  creaseW: 'uCreaseW',
  color: 'uColor',
  pale: 'uPale',
  sat: 'uSat',
  shadowK: 'uShadowK',
  hi: 'uHi',
  gloss: 'uGloss',
  panel: 'uPanel',
  grid: 'uGrid',
  ink: 'uInk',
  tint: 'uTint',
  panelCol: 'uPanelCol',
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform float uLineW;
uniform float uCreaseW;
uniform float uLineScale;
uniform float uColor;
uniform float uPale;
uniform float uSat;
uniform float uShadowK;
uniform float uHi;
uniform float uGloss;
uniform float uPanel;
uniform float uGrid;
uniform vec3 uInk;
uniform vec3 uTint;
uniform vec3 uPanelCol;
uniform vec3 uPaper;
uniform vec4 uPanelRect;   // CSS px, top-left origin: x, y, w, h (w <= 0 → auto)

const vec3 ILL = vec3(-0.5, 0.68, 0.54);

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float rawD(vec2 px) { return textureLod(tDepth, px / uRes, 0.0).r; }
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }
float izOf(float d) {
  if (uOrtho > 0.5) return 1.0 / (uNear + d * (uFar - uNear));
  float z = d * 2.0 - 1.0;
  return (uFar + uNear - z * (uFar - uNear)) / (2.0 * uNear * uFar);
}

// 2 = silhouette / occluding edge, 1 = crease, 0 = none
int edgeAt(vec2 q, vec2 px, float cov0, float iz0, vec2 grad, vec3 n0) {
  float d = rawD(q);
  float c = step(d, 0.99999);
  if (c != cov0) return 2;
  if (cov0 < 0.5) return 0;
  float iz = izOf(d);
  if (abs(iz - (iz0 + dot(grad, q - px))) > 0.004 * iz0) return 2;
  vec3 n = nrmL(q).xyz * 2.0 - 1.0;
  if (dot(n, n0) < 0.76 * length(n)) return 1;
  return 0;
}

vec3 chromaOf(vec3 c) { return c / (max(max(c.r, c.g), c.b) + 1e-3); }

float roundRect(vec2 p, vec2 c, vec2 h, float r) {
  vec2 q = abs(p - c) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 resC = uRes / uDpr;
  vec2 cpT = vec2(cp.x, resC.y - cp.y); // top-left origin, CSS px

  /* centre */
  float d0 = rawD(px);
  float cov0 = step(d0, 0.99999);
  float iz0 = izOf(d0);
  vec3 n0 = normalize(nrmL(px).xyz * 2.0 - 1.0);
  vec2 grad = vec2(0.0);
  if (cov0 > 0.5) {
    float r = izOf(rawD(px + vec2(1.0, 0.0))), l = izOf(rawD(px - vec2(1.0, 0.0)));
    float u = izOf(rawD(px + vec2(0.0, 1.0))), b = izOf(rawD(px - vec2(0.0, 1.0)));
    grad.x = abs(r - iz0) < abs(iz0 - l) ? r - iz0 : iz0 - l;
    grad.y = abs(u - iz0) < abs(iz0 - b) ? u - iz0 : iz0 - b;
  }

  /* distance to the nearest silhouette / crease (8 rays × 4 steps) */
  float Ws = 0.5 * uLineW * uLineScale * uDpr;
  float Wc = 0.5 * uCreaseW * uLineScale * uDpr;
  float aa = 0.65 * uDpr;
  float R = Ws + aa + 1.6 * uDpr;
  float dSil = 1e5;
  float dCr = 1e5;
  vec2 dirHit = vec2(0.0);
  float dHit = 1e5;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.3927;
    vec2 dir = vec2(cos(a), sin(a));
    float lo = 0.0;
    float hi = 0.0;
    int hit = 0;
    for (int k = 1; k <= 4; k++) {
      float r = R * float(k) / 4.0;
      int e = edgeAt(px + dir * r, px, cov0, iz0, grad, n0);
      if (e > 0) { hi = r; hit = e; break; }
      lo = r;
    }
    if (hit > 0) {
      // refine where the edge is (two bisection steps) so line sides and the hairline are smooth
      for (int b = 0; b < 2; b++) {
        float m = 0.5 * (lo + hi);
        if (edgeAt(px + dir * m, px, cov0, iz0, grad, n0) > 0) hi = m; else lo = m;
      }
      float dd = 0.5 * (lo + hi);
      if (hit == 2) dSil = min(dSil, dd); else dCr = min(dCr, dd);
      if (dd < dHit) { dHit = dd; dirHit = dir; }
    }
  }
  float line = max(smoothstep(Ws + aa, Ws - aa, dSil), smoothstep(Wc + aa, Wc - aa, dCr));

  /* fill colour, flat: hue at a fixed paint value for colours, the nearest plastic grey for neutrals */
  vec3 c0 = sceneL(px);
  float V = max(max(c0.r, c0.g), c0.b);
  float S = (V - min(min(c0.r, c0.g), c0.b)) / max(V, 1e-3);
  vec3 hue = chromaOf(c0);
  vec3 paint = hue * mix(0.9, 0.95, smoothstep(0.5, 0.2, S));
  // neutral greys: black · dark grey · light grey · white (crisp steps, so a lit gradient never smears)
  float g1 = smoothstep(0.27, 0.3, V);
  float g2 = smoothstep(0.54, 0.57, V);
  float g3 = smoothstep(0.8, 0.83, V);
  float gv = mix(mix(mix(0.17, 0.43, g1), 0.7, g2), 0.96, g3);
  vec3 neutral = vec3(gv) * mix(vec3(1.0), hue, 0.35);
  vec3 alb = mix(neutral, paint, smoothstep(0.16, 0.3, S));
  alb = clamp(mix(vec3(dot(alb, vec3(0.3, 0.59, 0.11))), alb, uSat), 0.0, 1.0);
  // IKEA: grey only (dark parts become a light grey, everything else white)
  vec3 grey = vec3(mix(0.78, 0.985, smoothstep(0.24, 0.27, dot(alb, vec3(0.3, 0.59, 0.11)))));
  vec3 base = mix(grey, alb, uColor);
  base = mix(base, uPaper * uTint, uPale);

  /* two tones from the illustrator's light */
  float ndl = dot(n0, normalize(ILL));
  float lit = smoothstep(0.08, 0.14, ndl);
  vec3 shadowC = base * uShadowK * mix(vec3(1.0), vec3(0.93, 0.95, 1.04), uColor * (1.0 - uPale));
  vec3 fill = mix(shadowC, base, lit);

  // crisp edge hairline just inside upper-left outlines of lit faces
  float inner = min(dSil - Ws, dCr - Wc);
  float band = smoothstep(0.35 * uDpr, 0.75 * uDpr, inner) * (1.0 - smoothstep(1.5 * uDpr, 1.9 * uDpr, inner));
  float upLeft = smoothstep(0.1, 0.5, dot(dirHit, normalize(vec2(-1.0, 1.0))));
  fill = mix(fill, mix(vec3(1.0), uPaper, uPale * 0.5), band * upLeft * lit * uHi * 0.85);

  // LEGO: crisp gloss on curved plastic
  vec3 Rv = reflect(-normalize(vec3(-0.35, 0.55, 0.76)), n0);
  float sp = smoothstep(0.955, 0.965, Rv.z);
  fill = mix(fill, vec3(1.0), sp * uGloss * 0.9);

  /* ground */
  float n = hash12(floor(cp * 0.75)) - 0.5;
  vec3 paper = uPaper * (1.0 + n * 0.012);
  vec4 pr = uPanelRect;
  if (pr.z <= 0.0) pr = vec4(resC.x * 0.05, resC.y * 0.06, resC.x * 0.9, resC.y * 0.88);
  float pd = roundRect(cpT, pr.xy + pr.zw * 0.5, pr.zw * 0.5, 18.0);
  vec3 panelC = mix(uPanelCol * (1.0 + n * 0.008), uPanelCol * 0.985, smoothstep(0.0, 1.0, cpT.y / resC.y));
  vec3 ground = mix(paper, panelC, smoothstep(0.7, -0.7, pd) * uPanel);
  // exploded view: faint engineering grid
  vec2 g = abs(fract(cp / 24.0 + 0.5) - 0.5) * 24.0;
  vec2 G = abs(fract(cp / 120.0 + 0.5) - 0.5) * 120.0;
  float gl = max(1.0 - smoothstep(0.3, 0.9, min(g.x, g.y)), 1.6 * (1.0 - smoothstep(0.4, 1.1, min(G.x, G.y))));
  ground = mix(ground, uInk, gl * 0.07 * uGrid);

  vec3 col = mix(ground, fill, cov0);
  col = mix(col, uInk, line);
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

type State = { mode: ManualMode; from: Look; to: Look; k: number }
const STATE = new WeakMap<StylizeEffect, State>()
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const isV3 = (v: unknown): v is V3 => Array.isArray(v)

export function createManualEffect(init: { mode?: ManualMode } = {}): StylizeEffect {
  const mode = init.mode ?? 'brick'
  const L = LOOKS[mode]
  const uniforms: Record<string, THREE.IUniform> = {
    uLineScale: { value: 1 },
    uPaper: { value: new THREE.Vector3(...rgb('#fbfaf7')) },
    uPanelRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  }
  for (const key of Object.keys(UNI) as (keyof Look)[]) {
    const v = L[key]
    uniforms[UNI[key]] = { value: isV3(v) ? new THREE.Vector3(...v) : v }
  }
  const st: State = { mode, from: L, to: L, k: 1 }
  const fx: StylizeEffect = {
    normals: true,
    frag: FRAG,
    uniforms,
    background: manualMeta.background,
    update(dt) {
      if (st.k >= 1) return
      st.k = Math.min(1, st.k + dt / 0.6)
      const e = ease(st.k)
      for (const key of Object.keys(UNI) as (keyof Look)[]) {
        const a = st.from[key]
        const b = st.to[key]
        const u = uniforms[UNI[key]]
        if (isV3(a) && isV3(b)) (u.value as THREE.Vector3).set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e)
        else u.value = (a as number) + ((b as number) - (a as number)) * e
      }
    },
  }
  STATE.set(fx, st)
  return fx
}

export function setManualMode(fx: StylizeEffect, mode: ManualMode) {
  const st = STATE.get(fx)
  if (!st || st.mode === mode) return
  const u = fx.uniforms!
  const now = {} as Record<keyof Look, number | V3>
  for (const key of Object.keys(UNI) as (keyof Look)[]) {
    const v = u[UNI[key]].value
    now[key] = v instanceof THREE.Vector3 ? [v.x, v.y, v.z] : (v as number)
  }
  st.from = now as Look
  st.to = LOOKS[mode]
  st.mode = mode
  st.k = 0
}

/** line weight multiplier (1 = the mode's own) */
export function setManualLineScale(fx: StylizeEffect, k: number) {
  fx.uniforms!.uLineScale.value = k
}

/** the LEGO step panel, CSS px from the top-left (null = an inset panel filling the screen) */
export function setManualPanel(fx: StylizeEffect, r: { x: number; y: number; w: number; h: number } | null) {
  const v = fx.uniforms!.uPanelRect.value as THREE.Vector4
  if (r) v.set(r.x, r.y, r.w, r.h)
  else v.set(0, 0, 0, 0)
}
