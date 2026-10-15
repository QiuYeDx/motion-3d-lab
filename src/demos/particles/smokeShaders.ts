/* GLSL for the volumetric smoke demo: GPGPU curl-noise advection, an 8-slice opacity shadow map
   (two RGBA targets rendered from the light), lit soft particles and the final composite with light shafts. */

export const COMMON = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(5.5, 9.5, hash12(uv * 517.31 + 3.7)); }
`

// simplex noise with analytic gradient (Gustavson / Ashima, MIT)
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
void snoiseGrad(vec3 v, out vec3 gradient) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;
}
vec3 curl(vec3 p) {
  vec3 g1, g2, g3;
  snoiseGrad(p, g1);
  snoiseGrad(p + vec3(31.416, -47.853, 12.793), g2);
  snoiseGrad(p + vec3(-23.17, 19.31, 73.41), g3);
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
`

/* ------------------------------------------------------------------ simulation */

export const VEL_FRAG = /* glsl */ `
uniform float uDt, uTime, uTurb, uPS;
uniform vec3 uPtr, uPtrVel;
${COMMON}
${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w < 0.0 || p.w > lifeOf(uv) || p.y > 8.5) {
    gl_FragColor = vec4(0.0, 0.6, 0.0, 0.0);
    return;
  }
  vec3 pos = p.xyz;
  float h = max(pos.y, 0.0);
  // laminar right above the tips, turbulent higher up (like a real incense plume)
  float tb = smoothstep(0.35, 2.8, h);
  vec3 q = pos * vec3(0.62, 0.42, 0.62) + vec3(0.0, -uTime * 0.3, uTime * 0.06);
  vec3 field = vec3(0.0, mix(0.95, 0.4, smoothstep(0.0, 5.5, h)), 0.0);
  field += curl(q) * (0.035 + tb * 0.36 * uTurb);
  float sway = smoothstep(0.3, 3.2, h);
  field.x += (sin(uTime * 0.21 + h * 0.55) * 0.15 + sin(uTime * 0.13 + h * 1.3) * 0.05) * sway;
  field.z += sin(uTime * 0.17 + h * 0.4 + 1.3) * 0.07 * sway;
  // the plume entrains air and widens as it rises
  field.xz += pos.xz * 0.06 * tb;
  vec3 nv = mix(field, v.xyz, exp(-1.5 * uDt));

  // pointer: drag the smoke along with the cursor and spin it around
  vec3 d = pos - uPtr;
  float r2 = dot(d.xy, d.xy) + d.z * d.z * 0.35;
  float fall = exp(-r2 / 0.6) * uPS;
  float sp = length(uPtrVel);
  vec3 swirl = vec3(-d.y, d.x, 0.0) * sp * 0.9;
  nv += ((uPtrVel * 1.25 - nv) * min(1.0, uDt * 7.0) + swirl * uDt * 2.0) * fall;
  float s = length(nv);
  if (s > 6.0) nv *= 6.0 / s;
  gl_FragColor = vec4(nv, 0.0);
}
`

export const POS_FRAG = /* glsl */ `
uniform float uDt, uTime;
${COMMON}
vec3 spawn(vec2 uv) {
  float a = hash12(uv * 913.1 + uTime * 1.31);
  float b = hash12(uv * 271.7 - uTime * 0.77 + 5.1);
  float c = hash12(uv * 631.9 + uTime * 0.53 + 9.3);
  vec3 tip = a < 0.34 ? vec3(-0.13, 0.0, 0.05) : a < 0.67 ? vec3(0.0, 0.07, -0.05) : vec3(0.12, -0.03, 0.06);
  float th = b * 6.2831853;
  float r = 0.022 * sqrt(c);
  return tip + vec3(cos(th) * r, 0.0, sin(th) * r);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w < 0.0) {
    float a = p.w + uDt;
    gl_FragColor = vec4(a >= 0.0 ? spawn(uv) : p.xyz, a);
    return;
  }
  if (p.w > lifeOf(uv) || p.y > 8.5) {
    gl_FragColor = vec4(spawn(uv), 0.0);
    return;
  }
  gl_FragColor = vec4(p.xyz + v.xyz * uDt, p.w + uDt);
}
`

/* ------------------------------------------------------------------ particles */

// shared per-particle setup: sim-space position, world size and opacity
const PARTICLE = /* glsl */ `
uniform sampler2D tPos;
uniform float uSizeK, uDensity;
${COMMON}
bool particle(vec2 uv, out vec3 p, out float size, out float a, out float h1) {
  vec4 P = texture2D(tPos, uv);
  h1 = hash12(uv * 91.7 + 1.3);
  p = P.xyz;
  if (P.w <= 0.0) { size = 0.0; a = 0.0; return false; }
  float t = P.w / lifeOf(uv);
  size = mix(0.035, 0.74, pow(t, 0.8)) * (0.6 + 0.8 * h1) * uSizeK;
  a = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t)) * smoothstep(8.5, 6.5, p.y);
  a *= 0.0035 / (0.003 + size * size) * uDensity;
  return true;
}
`

export const LIGHT_VERT = /* glsl */ `
uniform mat4 uLightVP;
uniform float uLScale;
varying float vD, vA;
${PARTICLE}
void main() {
  vec3 p; float size, a, h1;
  if (!particle(position.xy, p, size, a, h1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vD = 0.0; return; }
  vec4 c = uLightVP * vec4(p, 1.0);
  gl_Position = c;
  vD = c.z * 0.5 + 0.5;
  vA = a;
  gl_PointSize = max(1.0, size * uLScale);
}
`

// every particle adds its density to all slices it lies in front of (seen from the light)
export const LIGHT_FRAG = /* glsl */ `
uniform float uBase;
varying float vD, vA;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float m = exp(-d2 * 2.6) * vA;
  vec4 s = (uBase + vec4(1.0, 2.0, 3.0, 4.0)) / 8.0;
  vec4 w = 1.0 - smoothstep(s - 0.07, s + 0.07, vec4(vD));
  gl_FragColor = w * m;
}
`

export const SMOKE_VERT = /* glsl */ `
uniform sampler2D tL0, tL1;
uniform mat4 uLightVP;
uniform float uScale, uExt, uKeyI, uG, uInk;
uniform vec3 uL, uKey, uAmbLo, uAmbHi, uCam;
varying vec3 vCol;
varying float vA, vRot, vTile;
${PARTICLE}
float sliceAt(vec4 A, vec4 B, float f) {
  vec4 wA = max(vec4(0.0), 1.0 - abs(f - vec4(0.0, 1.0, 2.0, 3.0)));
  vec4 wB = max(vec4(0.0), 1.0 - abs(f - vec4(4.0, 5.0, 6.0, 7.0)));
  return dot(A, wA) + dot(B, wB);
}
void main() {
  vec3 p; float size, a, h1;
  if (!particle(position.xy, p, size, a, h1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); vRot = 0.0; vTile = 0.0; return; }
  vec3 l = (uLightVP * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  vec4 A = texture2D(tL0, l.xy);
  vec4 B = texture2D(tL1, l.xy);
  float tau = sliceAt(A, B, l.z * 8.0 - 1.0) * uExt;
  float T = exp(-tau);
  vec3 V = normalize(uCam - p);
  float ct = dot(-uL, V);
  float g = uG;
  // Henyey-Greenstein, normalised so its forward peak is 1
  float hg = (1.0 - g) * (1.0 - g) * (1.0 - g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5);
  float phase = 0.3 + 1.0 * hg;
  vec3 amb = mix(uAmbLo, uAmbHi, smoothstep(0.0, 6.0, p.y)) * (0.3 + 0.7 * exp(-tau * 0.3));
  vec3 lit = uKey * (T * phase * uKeyI) + amb;
  // ink: shadowed smoke is dense ink, lit smoke thins out toward the paper
  float lum = dot(lit, vec3(0.3, 0.55, 0.15));
  vCol = lit;
  vA = a * mix(1.0, clamp(1.0 - lum * 0.45, 0.22, 0.8), uInk);
  vRot = h1 * 6.2831853;
  vTile = floor(fract(h1 * 7.31) * 4.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / -mv.z;
}
`

export const SMOKE_FRAG = /* glsl */ `
uniform sampler2D tSprite;
uniform float uInk;
uniform vec3 uInkCol;
varying vec3 vCol;
varying float vA, vRot, vTile;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, sn, -sn, cs) * c;
  vec2 tuv = (clamp(c, -0.5, 0.5) + 0.5 + vec2(mod(vTile, 2.0), floor(vTile / 2.0))) * 0.5;
  float m = texture2D(tSprite, tuv).r * (1.0 - smoothstep(0.16, 0.25, dot(c, c)));
  float a = m * vA;
  vec3 col = mix(vCol, uInkCol, uInk);
  gl_FragColor = vec4(col * a, a);
}
`

/* ------------------------------------------------------------------ composite: background + smoke + light shafts */

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export const COMP_FRAG = /* glsl */ `
uniform sampler2D tSmoke;
uniform vec3 uBg0, uBg1, uGlowCol;
uniform vec2 uLightUV, uBaseUV;
uniform float uGlowI, uAspect, uRays, uInk, uTime, uReady;
varying vec2 vUv;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float glowAt(vec2 uv) {
  vec2 d = (uv - uLightUV) * vec2(uAspect, 1.0);
  float r2 = dot(d, d);
  return exp(-r2 * 7.0) * 0.6 + 0.12 / (1.0 + r2 * 10.0);
}
void main() {
  vec2 uv = vUv;
  vec3 bg = mix(uBg1, uBg0, smoothstep(0.0, 1.0, uv.y));
  // a soft pool of light on the table under the censer
  vec2 bd = (uv - uBaseUV) * vec2(uAspect * 0.55, 2.4);
  bg += uGlowCol * exp(-dot(bd, bd) * 3.0) * 0.05 * (1.0 - uInk);
  bg += uGlowCol * glowAt(uv) * uGlowI;
  vec2 vd = (uv - 0.5) * vec2(uAspect, 1.0);
  bg *= mix(1.0 - dot(vd, vd) * 0.35, 1.0 - dot(vd, vd) * 0.08, uInk);
  // paper fibres in ink mode
  float grain = h12(floor(uv * vec2(uAspect, 1.0) * 900.0)) - 0.5;
  bg += grain * mix(0.006, 0.03, uInk);

  vec4 s = textureLod(tSmoke, uv, 0.0) * uReady;
  vec3 col = bg * (1.0 - s.a) + s.rgb;

  // light shafts: march toward the light, the glow is blocked wherever smoke is dense
  if (uRays > 0.001) {
    vec2 dl = uLightUV - uv;
    vec2 stp = dl * (0.85 / float(RAY_STEPS));
    vec2 q = uv + stp * h12(uv * 1777.0 + uTime);
    float acc = 0.0;
    float w = 1.0;
    for (int i = 0; i < RAY_STEPS; i++) {
      float a = textureLod(tSmoke, q, 0.0).a * uReady;
      acc += glowAt(q) * (1.0 - min(1.0, a * 2.2)) * w;
      w *= 0.94;
      q += stp;
    }
    col += uGlowCol * acc * uRays * (1.0 / float(RAY_STEPS)) * (1.0 - s.a * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ censer */

export const CENSER_VERT = /* glsl */ `
varying vec3 vN, vP;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
export const CENSER_FRAG = /* glsl */ `
uniform vec3 uL, uKey, uBase, uCamW, uInkCol;
uniform float uInk, uKeyI;
varying vec3 vN, vP;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(uCamW - vP);
  float nl = max(dot(n, uL), 0.0);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 H = normalize(uL + V);
  float spec = pow(max(dot(n, H), 0.0), 40.0);
  vec3 c = uBase * (0.18 + nl * 0.9 * uKeyI) + uKey * (spec * 0.5 * uKeyI + rim * 0.12);
  vec3 ink = uInkCol * (0.9 + nl * 0.25) + rim * 0.08;
  gl_FragColor = vec4(mix(c, ink, uInk), 1.0);
}
`

export const TIP_VERT = /* glsl */ `
uniform float uScale, uTime;
attribute float aSeed;
varying float vF;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vF = 0.75 + 0.25 * sin(uTime * (2.0 + aSeed) + aSeed * 9.0) * sin(uTime * 3.7 + aSeed * 3.0);
  gl_PointSize = 0.28 * uScale / -mv.z;
}
`
export const TIP_FRAG = /* glsl */ `
uniform float uInk;
varying float vF;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 60.0);
  float halo = exp(-d2 * 6.0) * 0.35;
  // dark themes: additive glow (alpha 0); ink: a small deep-red ember painted over the paper
  vec3 glow = vec3(1.0, 0.42, 0.12) * (core * 2.0 + halo);
  vec3 ink = vec3(0.7, 0.12, 0.08) * core * 1.4;
  gl_FragColor = vec4(mix(glow, ink, uInk) * vF, clamp(core * 1.4, 0.0, 1.0) * vF * uInk);
}
`
