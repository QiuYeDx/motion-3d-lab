import { SIMPLEX_3D } from './glsl'

/*
 * GLSL for the 肥皂泡 demo.
 *
 * Thin-film interference: a soap film (n ≈ 1.33) reflects from its front (air→water, π phase flip) and back
 * (water→air, no flip) faces. With single-face amplitude reflectance r (r² = F, the Fresnel term) the Airy sum is
 *   R(λ) = 2F(1 − cos δ) / (1 + F² − 2F cos δ),   δ = 4π·n·d·cos θt / λ
 * so a film much thinner than λ reflects nothing (the "black film" stage just before a bubble bursts).
 * R(λ) is evaluated at 16 wavelengths and folded into linear sRGB with the CIE 1931 observer (Wyman et al.'s
 * multi-lobe fit), normalised so a flat spectrum maps to white.
 */

function cie(l: number) {
  const g = (x: number, mu: number, s1: number, s2: number) => {
    const t = (x - mu) / (x < mu ? s1 : s2)
    return Math.exp(-0.5 * t * t)
  }
  const X = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2)
  const Y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1)
  const Z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8)
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z]
}

function filmGlsl() {
  const N = 16
  const ls: number[] = []
  const ws: number[][] = []
  const sum = [0, 0, 0]
  for (let i = 0; i < N; i++) {
    const l = 400 + ((700 - 400) * i) / (N - 1)
    const w = cie(l)
    ls.push(l)
    ws.push(w)
    for (let c = 0; c < 3; c++) sum[c] += w[c]
  }
  const lines = ls
    .map((l, i) => {
      const w = ws[i].map((v, c) => (v / sum[c]).toFixed(5))
      return `  c = cos(k * ${(1 / l).toFixed(7)}); acc += vec3(${w.join(', ')}) * ((A - A * c) / (B - A * c));`
    })
    .join('\n')
  return /* glsl */ `
vec3 filmRGB(float d, float F, float ct) {
  float k = 16.7133 * d * ct;
  float A = 2.0 * F;
  float B = 1.0 + F * F;
  vec3 acc = vec3(0.0);
  float c;
${lines}
  return max(acc, 0.0);
}
`
}

/** procedural studio the films reflect: a tall three-light window up-left behind the camera, a strip light right,
 *  a cool rim light behind, a dim fill wall and a warm floor bounce (linear radiance) */
export const ENV = /* glsl */ `
float rrect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// local panel coords (x right, y up, on the plane 1 unit along ax); w = 0 behind the viewer
vec3 panelQ(vec3 d, vec3 ax) {
  float t = dot(d, ax);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), ax));
  vec3 up = cross(ax, rt);
  return vec3(vec2(dot(d, rt), dot(d, up)) / max(t, 1e-3), step(0.05, t));
}
vec3 env(vec3 d) {
  float y = d.y;
  vec3 c = mix(vec3(0.006, 0.007, 0.012), vec3(0.022, 0.026, 0.040), smoothstep(-0.4, 0.8, y));
  // dim fill wall behind the camera (what the middle of each bubble mirrors)
  c += vec3(0.030, 0.034, 0.046) * smoothstep(-0.2, 0.9, d.z) * smoothstep(-0.7, 0.2, y);
  // key: a tall three-light studio window (vertical mullions only, so the reflection never reads as a logo),
  // up-left, behind the camera
  vec3 q = panelQ(d, normalize(vec3(-0.52, 0.5, 0.69)));
  float s = rrect(q.xy, vec2(0.5, 0.64), 0.1);
  float win = (1.0 - smoothstep(-0.015, 0.015, s)) * q.z;
  float mull = smoothstep(0.01, 0.026, abs(abs(q.x) - 0.17));
  float grad = 0.75 + 0.25 * smoothstep(-0.5, 0.5, q.y);
  c += vec3(2.1, 2.05, 1.95) * win * mull * grad;
  // tall strip light on the right
  q = panelQ(d, normalize(vec3(0.82, 0.12, 0.56)));
  s = rrect(q.xy, vec2(0.075, 0.62), 0.05);
  c += vec3(0.85, 1.0, 1.3) * (1.0 - smoothstep(-0.02, 0.02, s)) * q.z;
  // cool rim light behind-left (shows on the bubble edges)
  q = panelQ(d, normalize(vec3(-0.75, 0.25, -0.62)));
  s = rrect(q.xy, vec2(0.3, 0.7), 0.2);
  c += vec3(0.25, 0.55, 0.95) * 0.7 * (1.0 - smoothstep(-0.25, 0.25, s)) * q.z;
  // overhead softbox (lights the tops and the wand's film)
  q = panelQ(d, normalize(vec3(0.15, 1.0, -0.2)));
  s = rrect(q.xy, vec2(0.5, 0.3), 0.12);
  c += vec3(0.9, 0.95, 1.05) * (1.0 - smoothstep(-0.06, 0.06, s)) * q.z;
  // warm bounce from below, faint magenta practical behind-right
  c += vec3(0.16, 0.10, 0.06) * smoothstep(-0.15, -0.75, y);
  q = panelQ(d, normalize(vec3(0.6, -0.15, -0.78)));
  c += vec3(0.75, 0.25, 0.55) * 0.5 * exp(-dot(q.xy, q.xy) * 6.0) * q.z;
  return c;
}
`

/* film thickness (nm) on the unit sphere: gravity drains the film so it is thick at the bottom and thins at the top
   (uDrain 0 → 1 over the bubble's life), a swirling, advected turbulence field rides on top, and late in life
   sharp-edged black-film patches grow down from the top. */
const THICKNESS = /* glsl */ `
float filmThickness(vec3 p, float drain, float seed, float t) {
  float a = t * 0.16 + p.y * 1.3 + seed;
  float ca = cos(a), sa = sin(a);
  vec3 q = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
  vec3 w = vec3(snoise(q * 1.25 + vec3(seed, t * 0.09, 0.0)), snoise(q * 1.25 + vec3(5.2, 1.3 - t * 0.07, seed)), 0.0);
  q += w * 0.42;
  float n = snoise(q * 2.3 + vec3(0.0, -t * 0.16, seed * 0.7));
  float y = p.y + w.x * 0.16 + n * 0.05;
  float s = clamp(0.5 - 0.5 * y, 0.0, 1.0);
  float top = mix(380.0, 30.0, smoothstep(0.0, 0.85, drain));
  float bot = mix(700.0, 1050.0, drain);
  float d = mix(top, bot, pow(s, mix(0.9, 1.7, drain)));
  d += n * mix(150.0, 95.0, drain) * (0.35 + s);
  // black film: sharp-edged, mottled, spreading down from the top late in life
  float bf = smoothstep(0.5, 0.56, (1.0 - s) * drain * 1.15 + 0.2 * snoise(q * 3.1 + vec3(0.0, t * 0.25, seed)));
  d = mix(d, 9.0, bf);
  return max(d, 0.0);
}
`

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uThick;
uniform float uGain;
${SIMPLEX_3D}
${ENV}
${filmGlsl()}
${THICKNESS}
`

export const BUBBLE_VERT = /* glsl */ `
uniform float uTime;
uniform float uWob;
uniform float uSeed;
uniform vec4 uSquash;
uniform vec4 uPlaneA;
uniform vec4 uPlaneB;
uniform float uPop;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
${SIMPLEX_3D}
vec3 deform(vec3 p) {
  float n = snoise(p * 0.8 + vec3(uSeed, uTime * 0.42, uTime * 0.31));
  n += 0.15 * snoise(p * 1.7 + vec3(uTime * 0.63, uSeed, 0.0));
  vec3 q = p * (1.0 + uWob * n);
  vec3 ax = uSquash.xyz;
  float s = dot(q, ax);
  q += ax * s * (-uSquash.w) + (q - ax * s) * (uSquash.w * 0.5);
  // a neighbour's shared wall: flatten everything beyond the contact plane
  q -= uPlaneA.xyz * max(dot(q, uPlaneA.xyz) - uPlaneA.w, 0.0);
  q -= uPlaneB.xyz * max(dot(q, uPlaneB.xyz) - uPlaneB.w, 0.0);
  return q * (1.0 - 0.05 * uPop);
}
void main() {
  vec3 p = normalize(position);
  vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(p, t);
  float e = 0.025;
  vec3 d0 = deform(p);
  vec3 d1 = deform(normalize(p + t * e));
  vec3 d2 = deform(normalize(p + b * e));
  vec3 nrm = normalize(cross(d1 - d0, d2 - d0));
  vLocal = p;
  vec4 wp = modelMatrix * vec4(d0, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * nrm);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

/** the wand's flat film: same fragment shader, the "local" position is the disc point lifted onto a dome */
export const DISC_VERT = /* glsl */ `
uniform float uRad;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec2 l = position.xy / uRad;
  vLocal = vec3(l, sqrt(max(1.0 - dot(l, l), 0.0)) * 0.4);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const BUBBLE_FRAG = /* glsl */ `
uniform float uSeed;
uniform float uDrain;
uniform float uPop;
uniform float uFade;
uniform vec3 uPopDir;
varying vec3 vLocal;
varying vec3 vNw;
varying vec3 vPw;
${COMMON}
void main() {
  vec3 p = vLocal;
  float rim = 0.0;
  if (uPop > 0.0) {
    // the film tears open from the poke and retracts; the gathered rim is thick (white) and ragged
    float ang = acos(clamp(dot(normalize(p), uPopDir), -1.0, 1.0)) / 3.14159265;
    float jag = snoise(p * 5.0 + uSeed) * 0.08 + snoise(p * 16.0 - uSeed) * 0.035;
    float edge = uPop * 1.2 + jag - 0.1;
    if (ang < edge) discard;
    rim = 1.0 - smoothstep(0.0, 0.07, ang - edge);
  }
  vec3 n = normalize(vNw);
  // three flips the winding for BackSide, so gl_FrontFacing is true there: use its define instead
#if defined(FLIP_SIDED)
  n = -n;
#elif defined(DOUBLE_SIDED)
  if (!gl_FrontFacing) n = -n;
#endif
  vec3 v = normalize(cameraPosition - vPw);
  float ci = clamp(dot(n, v), 0.0, 1.0);
  float F = min(0.02 + 0.98 * pow(1.0 - ci, 5.0), 0.985);
  float st = sqrt(1.0 - ci * ci) / 1.33;
  float ct = sqrt(1.0 - st * st);
  float d = filmThickness(p, uDrain, uSeed, uTime) * uThick;
  vec3 R = filmRGB(d, F, ct);
  vec3 L = env(reflect(-v, n));
  vec3 col = R * L * uGain;
  float a = clamp(dot(R, vec3(0.3333)), 0.0, 1.0);
  col += rim * vec3(0.8, 0.9, 1.0) * 1.1;
  a = max(a, rim * 0.75);
  col = 1.0 - exp(-col * 1.1);
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col * uFade, a * uFade);
}
`

/** glossy plastic for the wand, lit by the same studio */
export const WAND_VERT = /* glsl */ `
varying vec3 vNw;
varying vec3 vPw;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
export const WAND_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec3 vNw;
varying vec3 vPw;
${ENV}
void main() {
  vec3 n = normalize(vNw);
  vec3 v = normalize(cameraPosition - vPw);
  vec3 key = normalize(vec3(-0.52, 0.5, 0.69));
  float dif = max(dot(n, key), 0.0);
  float wrap = max(dot(n, normalize(vec3(0.8, 0.1, 0.5))), 0.0);
  vec3 col = uColor * (0.06 + dif * 0.75 + wrap * 0.18 + max(-n.y, 0.0) * 0.05);
  float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  col += env(reflect(-v, n)) * fr * 0.9;
  // subsurface-ish glow on the thin plastic
  col += uColor * 0.12 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
  col = 1.0 - exp(-col * 1.1);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`

/** full-screen studio backdrop: deep blue-black with out-of-focus bokeh lights clustered round the bubbles */
export const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 1.0, 1.0); }
`
export const BG_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSpread;
uniform float uTime;
varying vec2 vUv;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y - 0.5);
  vec3 c = mix(vec3(0.0025, 0.003, 0.0055), vec3(0.008, 0.010, 0.018), smoothstep(-0.55, 0.5, p.y));
  vec2 cc = uCenter;
  c += vec3(0.008, 0.016, 0.030) * exp(-dot(p - cc, p - cc) * 4.0 / (uSpread * uSpread));
  c += vec3(0.012, 0.008, 0.010) * exp(-dot(p - cc - vec2(0.0, -0.45 * uSpread), p - cc - vec2(0.0, -0.45 * uSpread)) * 9.0 / (uSpread * uSpread));
  // bokeh: soft discs with a slightly brighter rim (lens look)
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 o = vec2(h11(fi + 1.3) - 0.5, h11(fi + 7.9) - 0.42) * vec2(1.7, 1.15) * uSpread;
    o += 0.02 * vec2(sin(uTime * 0.11 + fi * 2.1), cos(uTime * 0.09 + fi * 1.3));
    float r = (0.025 + 0.075 * h11(fi + 3.7)) * uSpread;
    float d = length(p - cc - o);
    float disc = 1.0 - smoothstep(r * 0.86, r, d);
    disc *= 0.7 + 0.3 * smoothstep(r * 0.4, r * 0.95, d);
    float k = h11(fi + 11.1);
    vec3 col = k < 0.33 ? vec3(1.0, 0.62, 0.32) : k < 0.66 ? vec3(0.35, 0.75, 1.0) : vec3(0.85, 0.45, 0.95);
    c += col * disc * (0.006 + 0.022 * h11(fi + 5.5));
  }
  vec2 sv = vUv - 0.5;
  c *= 1.0 - dot(sv, sv) * 0.9;
  c = pow(c, vec3(1.0 / 2.2));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`

/** droplets flung from a popping film */
export const DROP_VERT = /* glsl */ `
attribute float aA;
attribute float aS;
uniform float uPx;
varying float vA;
void main() {
  vA = aA;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aS * uPx / -mv.z;
  if (aA <= 0.0) gl_PointSize = 0.0;
  gl_Position = projectionMatrix * mv;
}
`
export const DROP_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q) * 2.0;
  if (d > 1.0) discard;
  float body = 1.0 - smoothstep(0.55, 1.0, d);
  float hi = exp(-dot(q - vec2(-0.14, -0.14), q - vec2(-0.14, -0.14)) * 90.0);
  vec3 col = vec3(0.55, 0.75, 0.95) * body * 0.35 + vec3(1.0) * hi * 0.9;
  float a = body * 0.35 * vA;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)) * vA, a);
}
`
