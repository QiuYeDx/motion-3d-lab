/**
 * GLSL for the reaction–diffusion demo (Gray-Scott, Karl Sims' formulation: Du = 1, Dv = 0.5, dt = 1, 3×3 Laplacian).
 *
 * State texture: R = U (substrate), G = V (catalyst). Sim texels are ~2 CSS px, so the pattern scale is the same on
 * every screen. All passes draw one full-screen triangle.
 */

export const rdVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const HEAD = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`

/* F / k: the preset blended with a "parameter map" that lays the whole pattern zoo out across the canvas */
const PARAMS = /* glsl */ `
uniform vec2 uFK;     // preset (F, k)
uniform float uMap;   // 0 = preset everywhere, 1 = parameter map
vec2 fkAt(vec2 uv) {
  // k runs left → right; F runs bottom → top inside the band where Gray-Scott makes patterns
  float k = mix(0.046, 0.066, uv.x);
  float lo = 0.006 + (k - 0.045) * 1.25;
  float hi = 0.012 + (k - 0.045) * 2.2;
  float F = mix(lo, hi, uv.y);
  return mix(uFK, vec2(F, k), uMap);
}
`

/* one Gray-Scott step */
export const rdStepFrag = HEAD + PARAMS + /* glsl */ `
uniform sampler2D tState;
uniform sampler2D tMask;
uniform float uContain; // > 0: outside the seed word the recipe can't sustain V, so the pattern stays inside the glyphs
uniform vec2 uTexel;
void main() {
  vec2 e = uTexel;
  vec2 c = texture2D(tState, vUv).xy;
  vec2 n = texture2D(tState, vUv + vec2(0.0, e.y)).xy;
  vec2 s = texture2D(tState, vUv - vec2(0.0, e.y)).xy;
  vec2 w = texture2D(tState, vUv - vec2(e.x, 0.0)).xy;
  vec2 ea = texture2D(tState, vUv + vec2(e.x, 0.0)).xy;
  vec2 ne = texture2D(tState, vUv + e).xy;
  vec2 nw = texture2D(tState, vUv + vec2(-e.x, e.y)).xy;
  vec2 se = texture2D(tState, vUv + vec2(e.x, -e.y)).xy;
  vec2 sw = texture2D(tState, vUv - e).xy;
  vec2 lap = (n + s + w + ea) * 0.2 + (ne + nw + se + sw) * 0.05 - c;
  vec2 fk = fkAt(vUv);
  if (uContain > 0.0) fk = mix(fk, vec2(0.03, 0.07), uContain * (1.0 - texture2D(tMask, vUv).r));
  float u = c.x;
  float v = c.y;
  float uvv = u * v * v;
  u += 1.0 * lap.x - uvv + fk.x * (1.0 - u);
  v += 0.5 * lap.y + uvv - (fk.x + fk.y) * v;
  gl_FragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}
`

/* initial state from a mask (text / logo drawn on a canvas) + optional sprinkle of seeds */
export const rdInitFrag = HEAD + /* glsl */ `
uniform sampler2D tMask;
uniform vec2 uSimRes;
uniform float uSprinkle;
uniform float uSeed;
uniform float uMaskK;
void main() {
  float m = texture2D(tMask, vUv).r * uMaskK;
  vec2 cell = floor(vUv * uSimRes / 7.0);
  float sp = step(1.0 - uSprinkle, hash12(cell + uSeed)) * step(length(fract(vUv * uSimRes / 7.0) - 0.5), 0.3);
  // light grain inside the glyphs so the seed breaks up into pattern instead of a uniform blob
  float g = hash12(vUv * uSimRes + uSeed * 3.1);
  float v = max(m * (0.22 + 0.1 * g), sp * 0.3);
  gl_FragColor = vec4(1.0 - v * 2.0, v, 0.0, 1.0);
}
`

/* brush: a capsule from uP0 to uP1 (sim texels); paint seeds or erase */
export const rdBrushFrag = HEAD + /* glsl */ `
uniform sampler2D tState;
uniform vec2 uSimRes;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uRad;
uniform float uErase;
uniform float uSeed;
void main() {
  vec2 c = texture2D(tState, vUv).xy;
  vec2 p = vUv * uSimRes;
  vec2 pa = p - uP0;
  vec2 ba = uP1 - uP0;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  float d = length(pa - ba * h);
  float a = smoothstep(uRad, uRad * 0.55, d);
  // seeds go down as grain so a painted stroke breaks into pattern quickly
  if (uErase < 0.5) a *= step(0.35, hash12(p + uSeed));
  vec2 target = uErase > 0.5 ? vec2(1.0, 0.0) : vec2(0.5, 0.25);
  gl_FragColor = vec4(mix(c, target, a), 0.0, 1.0);
}
`

/* display: V as a glazed relief */
export const rdShowFrag = HEAD + PARAMS + /* glsl */ `
uniform sampler2D tState;
uniform vec2 uTexel;
uniform vec2 uRes;      // drawing buffer px
uniform float uDpr;
uniform vec3 uGround;
uniform vec3 uGlaze;
uniform vec3 uDeep;
uniform vec3 uRim;
uniform float uFade;
uniform float uTime;
uniform vec4 uVeil;      // centre (uv), radii (uv): the relief sinks flat under the copy so text stays legible
uniform float uVeilK;
float vk;

float hgt(vec2 uv) {
  float v = texture2D(tState, uv).y;
  return smoothstep(0.08, 0.34, v) * vk;
}

void main() {
  vec2 uv = vUv;
  float vd = length((uv - uVeil.xy) / uVeil.zw);
  vk = 1.0 - uVeilK * (1.0 - smoothstep(0.35, 1.0, vd));
  vec2 e = uTexel;
  float h = hgt(uv);
  float hx = hgt(uv + vec2(e.x, 0.0)) - hgt(uv - vec2(e.x, 0.0));
  float hy = hgt(uv + vec2(0.0, e.y)) - hgt(uv - vec2(0.0, e.y));
  // broad height (cavity / thickness of glaze pooling)
  float hb = (hgt(uv + vec2(3.0 * e.x, 0.0)) + hgt(uv - vec2(3.0 * e.x, 0.0)) + hgt(uv + vec2(0.0, 3.0 * e.y)) + hgt(uv - vec2(0.0, 3.0 * e.y))) * 0.25;
  vec3 n = normalize(vec3(-hx * 1.25, -hy * 1.25, 1.0));

  vec3 L = normalize(vec3(-0.55, 0.62, 0.56));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  // the relief casts a short soft shadow on the ground, away from the key light
  vec2 sdir = -L.xy * e * 2.4;
  float occ = max(max(hgt(uv + sdir) , hgt(uv + sdir * 2.0) * 0.8), hgt(uv + sdir * 3.2) * 0.55);
  float shadow = smoothstep(0.0, 0.9, occ - h) * (1.0 - h);

  float slope = clamp(length(vec2(hx, hy)) * 1.4, 0.0, 1.0);
  // glaze: thin and light on the shoulders (it "breaks" over edges), deep where it pools on the crown
  vec3 glaze = mix(uRim, uGlaze, smoothstep(0.15, 0.75, h));
  glaze = mix(glaze, uDeep, smoothstep(0.55, 1.0, hb) * 0.55);
  vec3 base = mix(uGround, glaze, smoothstep(0.02, 0.4, h));

  // ground: soft contact darkening next to the relief
  base *= 1.0 - 0.10 * smoothstep(0.0, 0.6, hb - h) * (1.0 - h);
  base *= 1.0 - 0.16 * shadow;

  // lambert normalised so the flat ground keeps its exact colour
  float diff = 1.0 + (dot(n, L) - L.z) * 0.9;
  vec3 col = base * clamp(diff, 0.6, 1.2);

  // specular: tight wet-glaze highlight + broad sheen, only on the glaze
  float gloss = smoothstep(0.1, 0.5, h);
  float nh = max(dot(n, H), 0.0);
  float spec = pow(nh, 90.0) * 0.85 + pow(nh, 12.0) * 0.06;
  col += vec3(1.0, 0.985, 0.95) * spec * gloss * (0.4 + 0.6 * slope);
  // fresnel-ish rim catches a cool sky
  col += vec3(0.82, 0.9, 1.0) * pow(slope, 2.0) * 0.06 * gloss;

  // ceramic grain + very soft vignette
  vec2 px = gl_FragCoord.xy / uDpr;
  float g = hash12(floor(px)) - 0.5;
  col += g * 0.018;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.06 * dot(q, q) * 2.0;

  col = mix(uGround, col, uFade);
  gl_FragColor = vec4(col, 1.0);
}
`
