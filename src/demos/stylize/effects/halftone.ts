import type { StylizeEffect } from '../../../lib/stylize'
import { SIMPLEX_3D } from '../../shader/glsl'

/*
 * 半调印刷 as a reusable stylize effect — the print pass from shader/HalftonePrint.tsx (which predates the
 * shared pipeline), reading the scene through the lib's sceneAt. Cell-averaged by a few taps instead of mips.
 */

export const halftoneModes = [
  { id: 'cmyk', label: 'CMYK' },
  { id: 'riso', label: 'Riso' },
  { id: 'mono', label: '报纸' },
] as const
export type HalftoneMode = (typeof halftoneModes)[number]['id']

export const halftoneMeta = { title: '半调印刷', en: 'Halftone', background: '#ffffff', theme: 'light' as const }

const FRAG = /* glsl */ `
uniform float uCell;
uniform float uMis;
uniform int uMode;

${SIMPLEX_3D}

vec3 sceneAvg(vec2 p, float cell) {
  float r = cell * 0.3;
  return (sceneAt(p) * 2.0 + sceneAt(p + vec2(r, r)) + sceneAt(p + vec2(-r, r)) + sceneAt(p + vec2(r, -r)) + sceneAt(p + vec2(-r, -r))) / 6.0;
}
#define sceneAt(p, cell) sceneAvg(p, cell)
// AM screen with a cosine spot: round dots → checkerboard at 50% → round holes. p, cell in device px.
float screen(vec2 p, float ang, float cell, float v, float rough) {
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, s, -s, c) * p / cell;
  float spot = 0.5 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  v = clamp(v, 0.0, 1.0);
  v = v + 0.78 * v * (1.0 - v) * (1.0 - 2.0 * v); // spot area → tone
  v = v + 0.07 * v * (1.0 - v);                    // dot gain
  float w = fwidth(spot) * 0.7;
  // threshold runs from just above the spot's peak (no ink) to just below its trough (solid)
  float T = mix(1.0 + 1.3 * w, -1.0 - 1.3 * w, v) + rough * min(1.0, v * 10.0) * min(1.0, (1.0 - v) * 10.0);
  return smoothstep(T - w, T + w, spot);
}

// ragged dot edges: ink wicks into the fibres (CSS-px scale so it looks the same at any DPR)
float roughAt(vec2 cp, float seed) {
  return (snoise(vec3(cp * 0.55, seed)) * 0.55 + snoise(vec3(cp * 2.3, seed + 11.0)) * 0.4) * 0.17;
}

vec3 paperAt(vec2 cp, vec3 base) {
  float blotch = snoise(vec3(cp * 0.0028, 9.0));
  float c1 = cos(0.35), s1 = sin(0.35);
  float c2 = cos(-1.2), s2 = sin(-1.2);
  vec2 r1 = mat2(c1, s1, -s1, c1) * cp;
  vec2 r2 = mat2(c2, s2, -s2, c2) * cp;
  float f1 = smoothstep(0.62, 0.95, snoise(vec3(r1 * vec2(0.012, 0.21), 1.0)));
  float f2 = smoothstep(0.66, 0.97, snoise(vec3(r2 * vec2(0.016, 0.24), 5.0)));
  float f3 = smoothstep(0.7, 0.98, snoise(vec3(r1 * vec2(0.03, 0.4), 7.0)));
  float grain = hash12(floor(cp)) - 0.5;
  vec3 c = base * (1.0 - 0.028 * blotch - 0.022 * grain);
  c -= vec3(0.05, 0.05, 0.045) * (f1 * 0.6 + f2 * 0.45);
  c += vec3(0.03) * f3;
  return c;
}

float mottle(vec2 cp, float seed) { return 0.86 + 0.14 * (snoise(vec3(cp * 0.018, seed)) * 0.5 + 0.5); }

vec2 drift(float i) {
  return vec2(sin(uTime * 0.7 + i * 2.1), cos(uTime * 0.55 + i * 1.3)) * 0.9;
}

vec3 printCMYK(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr;
  float m = uMis * uDpr * (0.6 + uCell / 16.0);
  vec2 oC = (vec2(2.6, -1.6) + drift(0.0)) * m;
  vec2 oM = (vec2(-2.1, 2.4) + drift(1.0)) * m;
  vec2 oY = (vec2(3.2, 2.8) + drift(2.0)) * m;
  vec3 sC = sceneAt(p - oC, cell);
  vec3 sM = sceneAt(p - oM, cell);
  vec3 sY = sceneAt(p - oY, cell);
  vec3 sK = sceneAt(p, cell);
  // separation with a little grey-component replacement
  float c = 1.0 - sC.r, mg = 1.0 - sM.g, y = 1.0 - sY.b;
  vec3 kq = 1.0 - sK;
  float kmin = min(kq.r, min(kq.g, kq.b));
  float k = smoothstep(0.3, 0.92, kmin) * kmin;
  c = max(c - k * 0.75, 0.0);
  mg = max(mg - k * 0.75, 0.0);
  y = max(y - k * 0.75, 0.0);
  float dC = screen(p - oC, radians(15.0), cell, c, roughAt(cp, 1.0)) * mottle(cp, 1.0);
  float dM = screen(p - oM, radians(75.0), cell, mg, roughAt(cp, 2.0)) * mottle(cp, 2.0);
  float dY = screen(p - oY, 0.0, cell, y, roughAt(cp, 3.0)) * mottle(cp, 3.0);
  float dK = screen(p, radians(45.0), cell, k, roughAt(cp, 4.0)) * mottle(cp, 4.0);
  vec3 col = paperAt(cp, vec3(0.965, 0.95, 0.91));
  col *= mix(vec3(1.0), vec3(0.0, 0.63, 0.88), dC);
  col *= mix(vec3(1.0), vec3(0.91, 0.0, 0.5), dM);
  col *= mix(vec3(1.0), vec3(1.0, 0.9, 0.0), dY);
  col *= mix(vec3(1.0), vec3(0.14, 0.12, 0.13), dK);
  return col;
}

vec2 risoSep(vec3 c) {
  // least-squares fit of the colour's optical density with the two inks' densities
  vec3 P = vec3(1.0, 0.28, 0.69);
  vec3 B = vec3(0.0, 0.47, 0.75);
  vec3 dP = -log(max(P, 0.04));
  vec3 dB = -log(max(B, 0.04));
  vec3 D = -log(max(c, 0.04));
  float a11 = dot(dP, dP), a12 = dot(dP, dB), a22 = dot(dB, dB);
  float det = a11 * a22 - a12 * a12;
  float a = (a22 * dot(dP, D) - a12 * dot(dB, D)) / det;
  float b = (a11 * dot(dB, D) - a12 * dot(dP, D)) / det;
  return clamp(vec2(a, b), 0.0, 1.0);
}

vec3 printRiso(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.1;
  float m = uDpr * (0.6 + uCell / 16.0);
  // a riso drum is never quite square: a baseline offset, plus the misregistration control
  vec2 oP = (vec2(1.2, -0.8) * 0.6 + (vec2(-3.2, 2.2) + drift(5.0)) * uMis) * m;
  vec2 oB = (vec2(-0.8, 0.6) * 0.6 + (vec2(2.6, -2.6) + drift(6.0)) * uMis) * m;
  float a = risoSep(sceneAt(p - oP, cell)).x;
  float b = risoSep(sceneAt(p - oB, cell)).y;
  float grain = hash12(floor(p / max(uDpr * 0.75, 1.0)));
  float dP = screen(p - oP, radians(75.0), cell, a * 1.05, roughAt(cp, 6.0) * 1.4) * (0.78 + 0.22 * grain) * mottle(cp, 6.0);
  float dB = screen(p - oB, radians(15.0), cell, b, roughAt(cp, 7.0) * 1.4) * (0.78 + 0.22 * hash12(floor(p / max(uDpr * 0.75, 1.0)) + 9.7)) * mottle(cp, 7.0);
  vec3 col = paperAt(cp, vec3(0.953, 0.93, 0.878));
  col *= mix(vec3(1.0), vec3(1.0, 0.28, 0.69), dP * 0.95);
  col *= mix(vec3(1.0), vec3(0.0, 0.47, 0.75), dB * 0.92);
  return col;
}

vec3 printMono(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.05;
  vec3 c = sceneAt(p, cell);
  float v = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
  v = smoothstep(0.1, 0.9, v); // newsprint: light tints drop out, shadows plug up
  float d = screen(p, radians(45.0), cell, v, roughAt(cp, 8.0) * 1.2) * mottle(cp, 8.0);
  vec3 col = paperAt(cp, vec3(0.91, 0.882, 0.812));
  col *= mix(vec3(1.0), vec3(0.11, 0.105, 0.1), d);
  return col;
}


#undef sceneAt
vec3 stylize(vec2 px) {
  if (uMode == 0) return printCMYK(px);
  if (uMode == 1) return printRiso(px);
  return printMono(px);
}
`

export function createHalftoneEffect(): StylizeEffect {
  return {
    frag: FRAG,
    uniforms: {
      uCell: { value: 7 },
      uMis: { value: 0.15 },
      uMode: { value: 0 },
    },
  }
}

export function setHalftoneMode(fx: StylizeEffect, mode: HalftoneMode) {
  fx.uniforms!.uMode.value = halftoneModes.findIndex((m) => m.id === mode)
}
