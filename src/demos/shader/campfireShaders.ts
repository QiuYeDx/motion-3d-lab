import { SIMPLEX_3D } from './glsl'

/* GLSL for 篝火 (Campfire.tsx). All scene shaders write LINEAR HDR into a half-float target; the composite
 * pass adds heat haze + mip bloom, tone-maps and converts to sRGB. */

const HASH = /* glsl */ `
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`

/* ------------------------------------------------------------------ billboards (fire / smoke / glow) */

export const BILL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// flame: a few flickering tongues, domain-warped by upward-advected noise, coloured by a temperature ramp
export const FIRE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime, uHeight, uWidth, uLean, uFlare, uInt;
${SIMPLEX_3D}

vec3 ramp(float T) {
  vec3 c = mix(vec3(0.0), vec3(0.55, 0.04, 0.005), smoothstep(0.0, 0.22, T));
  c = mix(c, vec3(2.2, 0.55, 0.06), smoothstep(0.18, 0.5, T));
  c = mix(c, vec3(4.0, 2.1, 0.45), smoothstep(0.45, 0.8, T));
  c = mix(c, vec3(5.5, 4.6, 2.6), smoothstep(0.8, 1.25, T));
  return c;
}

void main() {
  vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
  float t = uTime;
  float h = uHeight * (1.0 + 0.45 * uFlare) * (1.0 - 0.22 * abs(uLean));
  float y = p.y;
  // wind: the whole flame leans, more at the top
  float x = p.x - uLean * pow(max(y, 0.0), 1.3) * 0.42;
  vec3 q = vec3(x * 3.4, y * 2.3 - t * 2.7, t * 0.5);
  float n = snoise(q) * 0.55 + snoise(q * 2.13 + vec3(1.7, -t * 1.1, 4.0)) * 0.3 + snoise(q * 4.4 + vec3(3.1, -t * 2.0, 9.0)) * 0.15;
  float yh = y / h;
  x += n * 0.085 * (0.25 + yh) * uWidth;

  float body = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float r = fract(sin(fk * 91.37) * 437.53);
    float cx = (fk - 2.0) * 0.12 * uWidth + sin(t * (1.1 + r) + fk * 2.1) * 0.03;
    float hk = h * (0.55 + 0.45 * r + 0.25 * step(1.5, fk) * step(fk, 2.5)) * (0.86 + 0.14 * sin(t * (3.1 + fk * 0.7) + fk * 4.0) + 0.06 * sin(t * 7.3 + fk));
    float yn = y / hk;
    float w = (0.15 + 0.05 * r) * uWidth * pow(max(1.0 - yn, 0.0), 0.62) * smoothstep(-0.12, 0.08, yn);
    float d = abs(x - cx * (1.0 - yn * 0.7)) / max(w, 1e-3);
    body = max(body, max(1.0 - d, 0.0) * max(1.0 - yn * 0.85, 0.0));
  }
  // noise only lives in the flame column: it frays the edges and tears licks off the tips
  float colW = 0.26 * uWidth * (1.0 - 0.45 * clamp(yh, 0.0, 1.0));
  float column = exp(-x * x / (colW * colW)) * (1.0 - smoothstep(0.7, 1.35, yh));
  float f = body * (1.0 + 0.5 * n) + n * 0.3 * column * smoothstep(-0.05, 0.25, yh) - 0.04;
  f = max(f, (n * 0.95 - 0.42) * column * smoothstep(0.35, 0.85, yh));
  float T = clamp(f * 1.45, 0.0, 1.4);
  vec3 c = ramp(T) * smoothstep(0.0, 0.18, f);
  // a little blue at the root, where the gas is hottest and leanest
  c += vec3(0.05, 0.12, 0.6) * smoothstep(0.12, 0.0, y) * smoothstep(0.2, 0.6, body) * 0.8;
  c *= smoothstep(0.0, 0.05, y + 0.02);
  gl_FragColor = vec4(c * uInt, 1.0);
}
`

export const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
uniform float uInt;
void main() {
  vec2 p = vUv - 0.5;
  p.y *= 1.2;
  float r2 = dot(p, p);
  vec3 c = vec3(1.0, 0.36, 0.07) * (exp(-r2 * 30.0) * 0.32 + exp(-r2 * 14.0) * 0.08);
  gl_FragColor = vec4(c * uInt * (1.0 - smoothstep(0.08, 0.25, r2)), 1.0);
}
`

export const SMOKE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime, uLean, uAmt, uBase;
${SIMPLEX_3D}
void main() {
  vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
  float y = p.y;
  float yr = y / uSize.y;
  float wy = y + uBase;
  float x = p.x - uLean * pow(max(wy, 0.0), 1.45) * 0.42 + 0.06 * sin(y * 1.3 - uTime * 0.6);
  float t = uTime;
  float n = snoise(vec3(x * 1.7, y * 1.05 - t * 0.5, t * 0.13)) * 0.65 + snoise(vec3(x * 4.0, y * 2.6 - t * 0.9, t * 0.3 + 5.0)) * 0.35;
  float w = 0.13 + y * 0.2;
  float dens = exp(-(x * x) / (w * w)) * smoothstep(0.0, 0.18, yr) * (1.0 - smoothstep(0.45, 1.0, yr));
  dens *= smoothstep(-0.35, 0.6, n);
  float a = clamp(dens * 0.45 * uAmt, 0.0, 1.0);
  vec3 col = mix(vec3(0.32, 0.13, 0.05), vec3(0.04, 0.045, 0.06), smoothstep(0.0, 0.35, yr));
  gl_FragColor = vec4(col, a);
}
`

/* ------------------------------------------------------------------ sparks (GPU particles) */

export const SPARK_VERT = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime, uRate, uLean, uBurstT, uBurstAmt, uMode, uPx, uLift, uInt;
varying float vA;
varying float vHeat;
void main() {
  float life = 1.4 + aSeed.y * 2.2;
  float u;
  if (uMode < 0.5) {
    u = fract((uTime + aSeed.x * 41.0) / life);
    if (aSeed.x > uRate) u = 2.0;
  } else {
    life *= 0.9;
    u = (uTime - uBurstT - aSeed.x * 0.55) / life;
    if (fract(aSeed.x * 13.1) > uBurstAmt) u = 2.0;
  }
  if (u < 0.0 || u > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vHeat = 0.0;
    return;
  }
  float t = u * life;
  float ang = aSeed.z * 6.2831853;
  float r0 = 0.04 + 0.2 * fract(aSeed.w * 7.3);
  vec3 p = vec3(cos(ang) * r0, 0.18 + 0.2 * fract(aSeed.y * 5.1), sin(ang) * r0);
  float vy = (0.65 + 1.25 * aSeed.w) * uLift * (uMode > 0.5 ? 1.35 : 1.0);
  p.y += vy * t - 0.05 * t * t;
  // burst sparks are flung outwards a little before the updraft takes them
  float out1 = uMode > 0.5 ? 0.35 * (1.0 - exp(-t * 3.0)) : 0.0;
  p.x += cos(ang) * out1;
  p.z += sin(ang) * out1;
  // turbulence: wobbling corkscrews that widen as they rise, and the wind
  p.x += sin(t * (2.2 + aSeed.w * 3.0) + aSeed.z * 17.0) * 0.1 * t + uLean * 0.55 * t * t;
  p.z += cos(t * (1.7 + aSeed.y * 2.5) + aSeed.x * 23.0) * 0.1 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.01 + 0.016 * aSeed.y) * (1.0 - u * 0.55);
  float px = size * uPx / -mv.z;
  gl_PointSize = max(px, 1.6);
  // sub-pixel sparks keep their energy instead of shimmering
  float tw = 0.65 + 0.35 * sin(uTime * (18.0 + aSeed.x * 20.0) + aSeed.z * 40.0);
  vA = (1.0 - u) * smoothstep(0.0, 0.04, u) * tw * min(1.0, px / 1.6) * uInt;
  vHeat = 1.0 - u;
}
`

export const SPARK_FRAG = /* glsl */ `
varying float vA;
varying float vHeat;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 3.0) * smoothstep(1.0, 0.6, r);
  vec3 c = mix(vec3(1.4, 0.18, 0.02), vec3(5.0, 2.6, 0.7), vHeat * vHeat);
  gl_FragColor = vec4(c * a * vA * 1.6, 1.0);
}
`

/* ------------------------------------------------------------------ night sky */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime, uPix;
${HASH}
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 c = mix(vec3(0.03, 0.03, 0.05), vec3(0.006, 0.009, 0.022), smoothstep(-0.02, 0.45, e));
  // the treeline glows faintly where a distant town would be, and around the fire's side of the sky
  c += vec3(0.05, 0.025, 0.02) * exp(-max(e, 0.0) * 9.0) * 0.6;
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 70.0 : 170.0;
    vec3 sp = d * sc;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float h = h13(id + float(L) * 13.0);
    if (h > (L == 0 ? 0.92 : 0.9)) {
      vec3 off = (vec3(h13(id + 1.3), h13(id + 2.7), h13(id + 5.1)) - 0.5) * 0.5;
      float dd = length(f - off);
      float cellPx = (1.0 / sc) / uPix;
      float r = max(0.7 / cellPx, 0.05);
      float m = h13(id + 9.1);
      float mag = (L == 0 ? 0.6 + 3.0 * m * m * m : 0.35 + 0.5 * m) * (L == 0 ? 1.0 : smoothstep(1.6, 3.4, cellPx));
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 70.0);
      vec3 tint = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h13(id + 4.4));
      c += tint * exp(-dd * dd / (r * r)) * mag * tw * 0.5 / max(r * cellPx, 0.7) * smoothstep(0.02, 0.2, e);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}
`

/* ------------------------------------------------------------------ composite */

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const POST_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec2 uFireA;
uniform vec2 uFireB;
uniform float uHazeW, uHaze, uTime, uFade, uExposure, uBloom;
${HASH}
${SIMPLEX_3D}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 uv = vUv;
  // heat haze: a column of rising refraction above the flames (screen space)
  float aspect = uRes.x / uRes.y;
  float span = max(uFireB.y - uFireA.y, 0.02);
  float yy = (uv.y - uFireA.y) / span;
  float dx = (uv.x - mix(uFireA.x, uFireB.x, clamp(yy, 0.0, 1.0))) * aspect / max(uHazeW, 0.01);
  float m = exp(-dx * dx * 2.2) * smoothstep(0.35, 0.95, yy) * (1.0 - smoothstep(1.6, 3.4, yy));
  vec2 off = vec2(0.0);
  if (m > 0.002) {
    vec2 hp = vec2(uv.x * aspect, uv.y) / max(uHazeW, 0.05);
    off.x = snoise(vec3(hp * vec2(7.0, 4.5) - vec2(0.0, uTime * 2.2), uTime * 0.7));
    off.y = snoise(vec3(hp * vec2(6.0, 4.0) - vec2(0.0, uTime * 2.6), uTime * 0.7 + 9.0));
    off *= m * uHaze * 0.008;
  }
  vec3 col = textureLod(tScene, uv + off, 0.0).rgb;
  // bloom from the target's own mip chain (flames, embers, sparks are the only HDR > 1 things)
  vec3 b = textureLod(tScene, uv, 3.0).rgb * 0.45 + textureLod(tScene, uv, 4.5).rgb * 0.35 + textureLod(tScene, uv, 6.0).rgb * 0.3;
  col += max(b - 0.08, 0.0) * uBloom;
  col = aces(col * uExposure);
  col = toSRGB(col);
  vec2 sv = uv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.7;
  col += (h12(gl_FragCoord.xy + fract(uTime) * 71.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uFade, uFade);
}
`

/* ------------------------------------------------------------------ embers in log cracks (onBeforeCompile) */

export const EMBER_PULSE = /* glsl */ `
#include <emissivemap_fragment>
{
  vec2 eu = vEmissiveMapUv;
  float pulse = 0.55 + 0.45 * sin(uEmberTime * 2.3 + eu.x * 31.0 + eu.y * 17.0) * sin(uEmberTime * 1.3 + eu.y * 23.0 - eu.x * 7.0);
  totalEmissiveRadiance *= pulse * uEmberGain;
}
`
