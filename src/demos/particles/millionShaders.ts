/* Shaders for WebGPUMillion: WGSL (WebGPU path) + GLSL (WebGL fallback).
 * Both paths implement the same 4 velocity fields, crossfaded by a vec4 of weights:
 *   x = Lorenz attractor, y = Thomas attractor, z = spiral vortex (galaxy), w = curl-noise nebula
 * plus a pointer "gravity well" that pulls particles into an orbiting accretion ring. */

/* ------------------------------------------------------------------ WGSL */

/** uniform block shared by every WebGPU pass — keep in sync with UNIFORM_FLOATS / writeUniforms */
const WGSL_UNIFORMS = /* wgsl */ `
struct U {
  w: vec4f,         // preset weights
  well: vec4f,      // xyz = gravity well, w = strength
  axis: vec4f,      // xyz = camera forward (well swirl axis)
  sim: vec4f,       // dt, time, count, frame
  viewProj: mat4x4f,
  view: vec4f,      // width px, height px, point radius px, intensity
  look: vec4f,      // exposure, speed norm, reference depth, dpr
};
struct P { pos: vec4f, vel: vec4f };   // pos.w = age, vel.w = life
@group(0) @binding(0) var<uniform> u: U;
`

const WGSL_NOISE = /* wgsl */ `
fn mod289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute4(x: vec4f) -> vec4f { return mod289v4(((x * 34.0) + 10.0) * x); }
fn taylorInvSqrt4(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }
// simplex noise gradient (Gustavson / Ashima, MIT)
fn snoiseGrad(v: vec3f) -> vec3f {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;
  i = mod289v3(i);
  let p = permute4(permute4(permute4(i.z + vec4f(0.0, i1.z, i2.z, 1.0)) + i.y + vec4f(0.0, i1.y, i2.y, 1.0)) + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);
  let norm = taylorInvSqrt4(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  let m = max(0.5 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  let m2 = m * m;
  let m4 = m2 * m2;
  let pdotx = vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  let temp = m2 * m * pdotx;
  var gr = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gr += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  return gr * 105.0;
}
fn curl(p: vec3f) -> vec3f {
  let g1 = snoiseGrad(p);
  let g2 = snoiseGrad(p + vec3f(31.416, -47.853, 12.793));
  let g3 = snoiseGrad(p + vec3f(-23.17, 19.31, 73.41));
  return vec3f(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
`

const WGSL_FIELDS = /* wgsl */ `
fn lorenzV(p: vec3f) -> vec3f {
  let s = 0.105;
  let a = vec3f(p.x, p.z, p.y) / s + vec3f(0.0, 0.0, 24.0);
  let d = vec3f(10.0 * (a.y - a.x), a.x * (28.0 - a.z) - a.y, a.x * a.y - 2.6666667 * a.z);
  return vec3f(d.x, d.z, d.y) * s * 0.3;
}
fn thomasV(p: vec3f) -> vec3f {
  let s = 0.62;
  let a = p / s;
  let b = 0.19;
  let d = vec3f(sin(a.y) - b * a.x, sin(a.z) - b * a.y, sin(a.x) - b * a.z);
  return d * s * 1.9;
}
// galaxy plane is tilted ~34° about x so the arms read from the default 3/4 camera
const TC = 0.83;
const TS = 0.56;
fn vortexV(pw: vec3f, t: f32) -> vec3f {
  let p = vec3f(pw.x, TC * pw.y + TS * pw.z, -TS * pw.y + TC * pw.z);
  let v = vortexL(p, t);
  return vec3f(v.x, TC * v.y - TS * v.z, TS * v.y + TC * v.z);
}
fn vortexL(p: vec3f, t: f32) -> vec3f {
  let r = length(p.xz) + 1e-3;
  let rad = vec3f(p.x, 0.0, p.z) / r;
  let tng = vec3f(-rad.z, 0.0, rad.x);
  let th = atan2(p.z, p.x);
  // two logarithmic arms; particles are herded onto them (sin(2Δ) has period π → 2 arms)
  let arm = log(r + 0.05) * 2.4 - t * 0.22;
  let herd = -sin(2.0 * (th - arm)) * 2.2 * smoothstep(0.3, 1.0, r);
  let vt = 1.9 * r / (r + 0.35) + herd;
  let vr = -0.16 - max(r - 2.9, 0.0) * 2.0 + 0.18 * cos(2.0 * (th - arm));
  let thick = 0.06 + 0.5 * exp(-r * r * 1.6);
  let vy = -p.y * 2.2 * smoothstep(0.0, thick * 2.5, abs(p.y));
  return tng * vt + rad * vr + vec3f(0.0, vy, 0.0);
}
fn nebulaV(p: vec3f, t: f32) -> vec3f {
  var f = curl(p * 0.36 + vec3f(t * 0.03, -t * 0.02, t * 0.025)) * 0.42;
  f += curl(p * 0.95 + vec3f(5.2, -t * 0.05, 1.3)) * 0.11;
  let d = length(p) + 1e-4;
  f -= p / d * smoothstep(2.4, 4.0, d) * 1.6;
  f += vec3f(-p.z, 0.0, p.x) * 0.12;
  return f;
}
`

const WGSL_HASH = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(s: ptr<function, u32>) -> f32 { *s = pcg(*s); return f32(*s) * (1.0 / 4294967295.0); }
`

export const WGSL_SIM = /* wgsl */ `
${WGSL_UNIFORMS}
@group(0) @binding(1) var<storage, read_write> ps: array<P>;
${WGSL_NOISE}
${WGSL_FIELDS}
${WGSL_HASH}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.sim.z)) { return; }
  let dt = u.sim.x;
  let t = u.sim.y;
  var p = ps[i];
  var pos = p.pos.xyz;
  var vel = p.vel.xyz;
  var age = p.pos.w + dt;
  let life = p.vel.w;
  let r2 = dot(pos, pos);
  if (age > life || !(r2 < 60.0)) {
    // respawn inside a soft sphere; preset-shaped spawn would bias the morph, a sphere keeps crossfades fair
    var s = pcg(i ^ pcg(u32(u.sim.w) * 1664525u + 1013904223u));
    let th = rnd(&s) * 6.2831853;
    let ph = acos(2.0 * rnd(&s) - 1.0);
    let rr = 3.4 * pow(rnd(&s), 0.4);
    pos = vec3f(sin(ph) * cos(th), cos(ph) * 0.8, sin(ph) * sin(th)) * rr;
    vel = vec3f(0.0);
    ps[i] = P(vec4f(pos, 0.0), vec4f(vel, life));
    return;
  }

  let w = u.w;
  var f = curl(pos * 0.5 + vec3f(t * 0.04)) * (0.04 + 0.1 * (w.x + w.y) + 0.015 * w.z);
  if (w.x > 0.001) { f += w.x * lorenzV(pos); }
  if (w.y > 0.001) { f += w.y * thomasV(pos); }
  if (w.z > 0.001) { f += w.z * vortexV(pos, t); }
  if (w.w > 0.001) { f += w.w * nebulaV(pos, t); }
  let drag = dot(w, vec4f(60.0, 30.0, 5.0, 3.0));

  // gravity well → orbiting ring around the pointer, facing the camera
  if (u.well.w > 0.001) {
    let d = u.well.xyz - pos;
    let r = length(d) + 1e-3;
    let dir = d / r;
    var sw = cross(u.axis.xyz, dir);
    sw = sw / (length(sw) + 1e-4);
    let reach = exp(-r * r * 0.5);
    let ring = 0.55;
    let pull = clamp((r - ring) * 2.2, -2.5, 4.0);
    f += (dir * pull * 1.6 + sw * 3.2) * reach * u.well.w;
  }

  vel = mix(f, vel, exp(-drag * dt));
  let sp = length(vel);
  if (sp > 9.0) { vel *= 9.0 / sp; }
  pos += vel * dt;
  ps[i] = P(vec4f(pos, age), vec4f(vel, life));
}
`

export const WGSL_DRAW = /* wgsl */ `
${WGSL_UNIFORMS}
@group(0) @binding(1) var<storage, read> ps: array<P>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) c: vec2f,
  @location(1) col: vec3f,
};

fn pal(t: f32) -> vec3f {
  let c0 = vec3f(0.10, 0.13, 0.55);
  let c1 = vec3f(0.18, 0.62, 1.00);
  let c2 = vec3f(0.55, 1.00, 1.00);
  let c3 = vec3f(1.00, 0.62, 0.86);
  let x = t * 3.0;
  if (x < 1.0) { return mix(c0, c1, x); }
  if (x < 2.0) { return mix(c1, c2, x - 1.0); }
  return mix(c2, c3, x - 2.0);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  let p = ps[ii];
  var clip = u.viewProj * vec4f(p.pos.xyz, 1.0);
  if (clip.w < 0.2) {
    o.pos = vec4f(0.0, 0.0, -2.0, 1.0);
    o.c = vec2f(0.0);
    o.col = vec3f(0.0);
    return o;
  }
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let sp = length(p.vel.xyz);
  let t = clamp(sp / u.look.y, 0.0, 1.0);
  let k = smoothstep(0.0, 1.0, pow(t, 0.7));
  // perspective size in px, never thinner than ~1 device px so the quad still rasterises smoothly
  let radius = clamp(u.view.z * u.look.z / clip.w, 0.9 * u.look.w, 3.2 * u.look.w);
  let shrink = u.view.z * u.look.z / clip.w / radius; // < 1 when clamped up → dim instead of growing
  clip.x += c.x * radius * 2.0 / u.view.x * clip.w;
  clip.y += c.y * radius * 2.0 / u.view.y * clip.w;
  let age = p.pos.w;
  let life = p.vel.w;
  let fade = smoothstep(0.0, 0.6, age) * (1.0 - smoothstep(life - 0.9, life, age));
  o.pos = clip;
  o.c = c;
  o.col = pal(k) * u.view.w * fade * (0.55 + 0.9 * k) * clamp(shrink * shrink, 0.25, 1.0);
  return o;
}

@fragment
fn fs(i: VO) -> @location(0) vec4f {
  let d = dot(i.c, i.c);
  let a = max(1.0 - d, 0.0);
  return vec4f(i.col * a * a, 0.0);
}
`

export const WGSL_COMPOSITE = /* wgsl */ `
${WGSL_UNIFORMS}
@group(0) @binding(1) var hdr: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn hash2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }

@fragment
fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let h = textureLoad(hdr, vec2i(fc.xy), 0).rgb;
  let uv = fc.xy / u.view.xy;
  let q = (uv - vec2f(0.5, 0.46)) * vec2f(u.view.x / u.view.y, 1.0);
  let g = smoothstep(0.0, 0.95, length(q));
  var bg = mix(vec3f(0.050, 0.058, 0.115), vec3f(0.016, 0.016, 0.032), g);
  let c = vec3f(1.0) - exp(-h * u.look.x);
  var col = bg * (1.0 - c * 0.6) + c;
  col += (hash2(fc.xy + fract(u.sim.y) * 91.0) - 0.5) / 255.0;
  return vec4f(col, 1.0);
}
`

/** floats in the uniform block (12 vec4 = 48 floats = 192 bytes) */
export const UNIFORM_FLOATS = 48

/* ------------------------------------------------------------------ GLSL fallback (GPUComputationRenderer) */

const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 snoiseGrad(vec3 v) {
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
  vec3 gr = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gr += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  return gr * 105.0;
}
vec3 curl(vec3 p) {
  vec3 g1 = snoiseGrad(p);
  vec3 g2 = snoiseGrad(p + vec3(31.416, -47.853, 12.793));
  vec3 g3 = snoiseGrad(p + vec3(-23.17, 19.31, 73.41));
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(6.0, 14.0, hash12(uv * 517.31 + 3.7)); }
`

const GLSL_FIELDS = /* glsl */ `
vec3 lorenzV(vec3 p) {
  float s = 0.105;
  vec3 a = vec3(p.x, p.z, p.y) / s + vec3(0.0, 0.0, 24.0);
  vec3 d = vec3(10.0 * (a.y - a.x), a.x * (28.0 - a.z) - a.y, a.x * a.y - 2.6666667 * a.z);
  return vec3(d.x, d.z, d.y) * s * 0.3;
}
vec3 thomasV(vec3 p) {
  float s = 0.62;
  vec3 a = p / s;
  float b = 0.19;
  return vec3(sin(a.y) - b * a.x, sin(a.z) - b * a.y, sin(a.x) - b * a.z) * s * 1.9;
}
const float TC = 0.83;
const float TS = 0.56;
vec3 vortexL(vec3 p, float t);
vec3 vortexV(vec3 pw, float t) {
  vec3 p = vec3(pw.x, TC * pw.y + TS * pw.z, -TS * pw.y + TC * pw.z);
  vec3 v = vortexL(p, t);
  return vec3(v.x, TC * v.y - TS * v.z, TS * v.y + TC * v.z);
}
vec3 vortexL(vec3 p, float t) {
  float r = length(p.xz) + 1e-3;
  vec3 rad = vec3(p.x, 0.0, p.z) / r;
  vec3 tng = vec3(-rad.z, 0.0, rad.x);
  float th = atan(p.z, p.x);
  float arm = log(r + 0.05) * 2.4 - t * 0.22;
  float herd = -sin(2.0 * (th - arm)) * 2.2 * smoothstep(0.3, 1.0, r);
  float vt = 1.9 * r / (r + 0.35) + herd;
  float vr = -0.16 - max(r - 2.9, 0.0) * 2.0 + 0.18 * cos(2.0 * (th - arm));
  float thick = 0.06 + 0.5 * exp(-r * r * 1.6);
  float vy = -p.y * 2.2 * smoothstep(0.0, thick * 2.5, abs(p.y));
  return tng * vt + rad * vr + vec3(0.0, vy, 0.0);
}
vec3 nebulaV(vec3 p, float t) {
  vec3 f = curl(p * 0.36 + vec3(t * 0.03, -t * 0.02, t * 0.025)) * 0.42;
  f += curl(p * 0.95 + vec3(5.2, -t * 0.05, 1.3)) * 0.11;
  float d = length(p) + 1e-4;
  f -= p / d * smoothstep(2.4, 4.0, d) * 1.6;
  f += vec3(-p.z, 0.0, p.x) * 0.12;
  return f;
}
`

export const GLSL_VEL = /* glsl */ `
uniform float uDt, uTime;
uniform vec4 uW, uWell;
uniform vec3 uAxis;
${GLSL_NOISE}
${GLSL_FIELDS}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || !(dot(p.xyz, p.xyz) < 60.0)) { gl_FragColor = vec4(0.0); return; }
  vec3 pos = p.xyz;
  vec4 w = uW;
  float t = uTime;
  vec3 f = curl(pos * 0.5 + vec3(t * 0.04)) * (0.04 + 0.1 * (w.x + w.y) + 0.015 * w.z);
  if (w.x > 0.001) f += w.x * lorenzV(pos);
  if (w.y > 0.001) f += w.y * thomasV(pos);
  if (w.z > 0.001) f += w.z * vortexV(pos, t);
  if (w.w > 0.001) f += w.w * nebulaV(pos, t);
  float drag = dot(w, vec4(60.0, 30.0, 5.0, 3.0));
  if (uWell.w > 0.001) {
    vec3 d = uWell.xyz - pos;
    float r = length(d) + 1e-3;
    vec3 dir = d / r;
    vec3 sw = cross(uAxis, dir);
    sw /= length(sw) + 1e-4;
    float reach = exp(-r * r * 0.5);
    float pull = clamp((r - 0.55) * 2.2, -2.5, 4.0);
    f += (dir * pull * 1.6 + sw * 3.2) * reach * uWell.w;
  }
  vec3 nv = mix(f, v.xyz, exp(-drag * uDt));
  float sp = length(nv);
  if (sp > 9.0) nv *= 9.0 / sp;
  gl_FragColor = vec4(nv, 0.0);
}
`

export const GLSL_POS = /* glsl */ `
uniform float uDt, uTime;
${GLSL_NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || !(dot(p.xyz, p.xyz) < 60.0)) {
    float a = hash12(uv * 913.1 + uTime * 1.31);
    float b = hash12(uv * 271.7 - uTime * 0.77 + 5.1);
    float c = hash12(uv * 631.9 + uTime * 0.53 + 9.3);
    float th = a * 6.2831853;
    float ph = acos(2.0 * b - 1.0);
    float r = 3.4 * pow(c, 0.4);
    gl_FragColor = vec4(vec3(sin(ph) * cos(th), cos(ph) * 0.8, sin(ph) * sin(th)) * r, 0.0);
    return;
  }
  gl_FragColor = vec4(p.xyz + v.xyz * uDt, p.w + uDt);
}
`

export const GLSL_POINT_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize, uSpeedNorm;
varying vec3 vCol;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(6.0, 14.0, hash12(uv * 517.31 + 3.7)); }
vec3 pal(float t) {
  vec3 c0 = vec3(0.10, 0.13, 0.55);
  vec3 c1 = vec3(0.18, 0.62, 1.00);
  vec3 c2 = vec3(0.55, 1.00, 1.00);
  vec3 c3 = vec3(1.00, 0.62, 0.86);
  float x = t * 3.0;
  if (x < 1.0) return mix(c0, c1, x);
  if (x < 2.0) return mix(c1, c2, x - 1.0);
  return mix(c2, c3, x - 2.0);
}
void main() {
  vec2 uv = position.xy;
  vec4 p = texture2D(tPos, uv);
  vec4 v = texture2D(tVel, uv);
  float t = clamp(length(v.xyz) / uSpeedNorm, 0.0, 1.0);
  float k = smoothstep(0.0, 1.0, pow(t, 0.7));
  float life = lifeOf(uv);
  float fade = smoothstep(0.0, 0.6, p.w) * (1.0 - smoothstep(life - 0.9, life, p.w));
  vCol = pal(k) * fade * (0.55 + 0.9 * k);
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(uSize / -mv.z, 1.5);
}
`

export const GLSL_POINT_FRAG = /* glsl */ `
uniform float uIntensity;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float a = max(1.0 - dot(c, c), 0.0);
  gl_FragColor = vec4(vCol * a * a * uIntensity, 1.0);
}
`

export const GLSL_BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }
`
export const GLSL_BG_FRAG = /* glsl */ `
uniform vec2 uRes;
varying vec2 vUv;
void main() {
  vec2 q = (vUv - vec2(0.5, 0.54)) * vec2(uRes.x / uRes.y, 1.0);
  float g = smoothstep(0.0, 0.95, length(q));
  gl_FragColor = vec4(mix(vec3(0.050, 0.058, 0.115), vec3(0.016, 0.016, 0.032), g), 1.0);
}
`
