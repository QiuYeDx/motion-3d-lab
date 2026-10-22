/*
 * GLSL for the 水下焦散 demo.
 *
 * Water surface = periodic analytic waves (wave vectors are whole multiples of 2π/L, so everything tiles over the
 * L×L domain) + a CPU ripple heightfield (DataTexture, repeat-wrapped). The caustics map is built the classic way
 * (Evan Wallace's WebGL Water): a fine grid of the surface is drawn into a floating-point target with every vertex
 * moved to where its refracted sun ray lands on the sea floor; the fragment shader writes old-area / new-area
 * (screen-space derivatives), so converging rays add up to bright filaments. Drawn three times with slightly
 * different refractive indices into R, G and B — that is the chromatic fringe at the caustic edges.
 */

export const SIM = 128

/** heightfield h and its gradient (dh/dx, dh/dz) at world xz */
export const WATER = /* glsl */ `
uniform float uTime;
uniform float uL;
uniform float uSurf;
uniform sampler2D uSim;
uniform float uSimAmp;
uniform float uWaveAmp;
uniform float uRough;
vec3 wave1(vec2 p, vec2 mn, float a, float w, float ph) {
  vec2 k = (6.2831853 / uL) * mn;
  float th = dot(k, p) - w * uTime + ph;
  return a * vec3(sin(th), k * cos(th));
}
vec3 water(vec2 p) {
  vec3 w = wave1(p, vec2(6.0, 7.0), 0.045, 1.25, 0.0);
  w += wave1(p, vec2(-9.0, 4.0), 0.040, 1.40, 1.7);
  w += wave1(p, vec2(3.0, -10.0), 0.035, 1.55, 4.1);
  w += wave1(p, vec2(-7.0, -8.0), 0.030, 1.70, 2.3);
  w += wave1(p, vec2(12.0, 1.0), 0.022, 1.95, 5.2);
  w += wave1(p, vec2(2.0, 14.0), 0.016, 2.20, 0.6);
  w *= 0.6;
  w += wave1(p, vec2(2.0, 1.0), 0.08, 0.45, 3.0);
  w *= uWaveAmp;
  // rough water: a bigger swell and choppy short waves on top
  w += uRough * (wave1(p, vec2(3.0, -2.0), 0.12, 0.7, 1.0) + wave1(p, vec2(15.0, -9.0), 0.009, 2.9, 1.1)
               + wave1(p, vec2(-12.0, 16.0), 0.007, 3.3, 3.9) + wave1(p, vec2(-5.0, 9.0), 0.016, 1.9, 0.4));
  vec2 uv = p / uL + 0.5;
  const float e = 1.0 / ${SIM}.0;
  float h = texture2D(uSim, uv).r;
  float hx = texture2D(uSim, uv + vec2(e, 0.0)).r - texture2D(uSim, uv - vec2(e, 0.0)).r;
  float hz = texture2D(uSim, uv + vec2(0.0, e)).r - texture2D(uSim, uv - vec2(0.0, e)).r;
  float k = ${SIM}.0 / (2.0 * uL);
  w += uSimAmp * vec3(h, hx * k, hz * k);
  return w;
}
`

/* ------------------------------------------------------------------ caustics map */

export const CAUS_VERT = /* glsl */ `
uniform vec3 uSunAir;
uniform float uEta;
varying vec2 vOld;
varying vec2 vNew;
${WATER}
void main() {
  vec2 p = position.xz;
  vec3 w = water(p);
  vec3 N = normalize(vec3(-w.y, 1.0, -w.z));
  vec3 rd = refract(uSunAir, N, uEta);
  vec3 rf = refract(uSunAir, vec3(0.0, 1.0, 0.0), uEta);
  float y0 = uSurf + w.x;
  vec2 hit = p + rd.xz * (y0 / -rd.y);
  // map coords: subtract the flat-water offset so the map is indexed by "surface point above"
  vec2 m = hit - rf.xz * (uSurf / -rf.y);
  vOld = p;
  vNew = m;
  gl_Position = vec4(m / (0.5 * uL), 0.0, 1.0);
}
`
export const CAUS_FRAG = /* glsl */ `
uniform vec3 uMask;
varying vec2 vOld;
varying vec2 vNew;
void main() {
  vec2 ox = dFdx(vOld), oy = dFdy(vOld);
  vec2 nx = dFdx(vNew), ny = dFdy(vNew);
  float a0 = abs(ox.x * oy.y - ox.y * oy.x);
  float a1 = abs(nx.x * ny.y - nx.y * ny.x);
  float I = min(a0 / max(a1, 1e-7), 14.0);
  gl_FragColor = vec4(uMask * I, 1.0);
}
`

/* ------------------------------------------------------------------ lit underwater surfaces (floor, rocks, grass, amphora) */

const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`

export const DUNE = /* glsl */ `
float dune(vec2 p) {
  float r = length(p);
  float h = 0.42 * sin(p.x * 0.21 + 1.0) * sin(p.y * 0.17) + 0.3 * sin(p.x * 0.09 - p.y * 0.13 + 2.0) + 0.12 * sin(p.x * 0.5 + p.y * 0.3);
  return h * smoothstep(2.5, 9.0, r) + 0.6 * smoothstep(14.0, 40.0, -p.y) - 0.04;
}
`

export const UW_VERT = /* glsl */ `
uniform float uTime;
uniform float uRough;
varying vec3 vPw;
varying vec3 vNw;
varying vec2 vUv;
${DUNE}
void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vUv = uv;
#ifdef GRASS
  vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float k = uv.y * uv.y;
  pos.x *= 1.0 - uv.y * 0.75;
  float sway = sin(uTime * 1.1 + base.x * 0.6 + base.z * 0.4) * (0.32 + 0.25 * uRough) + sin(uTime * 2.3 + base.z * 1.3) * 0.08;
  pos.x += sway * k;
  pos.z += 0.18 * sin(uTime * 0.9 + base.x * 1.7) * k;
#endif
#ifdef USE_INSTANCING
  vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vNw = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nrm);
#else
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vNw = normalize(mat3(modelMatrix) * nrm);
#endif
#ifdef FLOOR
  float e = 0.15;
  float h0 = dune(wp.xz);
  wp.y += h0;
  vNw = normalize(vec3(h0 - dune(wp.xz + vec2(e, 0.0)), e, h0 - dune(wp.xz + vec2(0.0, e))));
#endif
  vPw = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

export const UW_FRAG = /* glsl */ `
uniform float uTime;
uniform float uL;
uniform float uSurf;
uniform vec3 uAlbedo;
uniform sampler2D uCaus;
uniform vec3 uSunUW;
uniform vec2 uFlatOff;
uniform vec3 uSunCol;
uniform vec3 uSigma;
uniform float uLightDepth;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform float uCausLod;
uniform vec3 uVase;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
varying vec3 vPw;
varying vec3 vNw;
varying vec2 vUv;
${NOISE}
float sand(vec2 p) {
  float n = vnoise(p * 0.35);
  return 0.035 * sin(dot(p, vec2(0.92, 0.39)) * 4.6 + n * 5.0) * (0.55 + 0.45 * vnoise(p * 0.9 + 7.0));
}
void main() {
  vec3 P = vPw;
  vec3 N = normalize(vNw);
  vec3 alb = uAlbedo;
  float ao = 1.0;
  float shadow = 1.0;
#ifdef FLOOR
  // wind-rippled sand: bump the normal with ridges, speckle the albedo
  float e = 0.04;
  float s0 = sand(P.xz);
  vec3 bn = normalize(vec3(s0 - sand(P.xz + vec2(e, 0.0)), e, s0 - sand(P.xz + vec2(0.0, e))));
  N = normalize(N + vec3(bn.x, 0.0, bn.z) * 1.6);
  float sp = hash12(floor(P.xz * 40.0));
  alb *= 0.86 + 0.14 * vnoise(P.xz * 1.7) + (sp > 0.93 ? 0.12 : 0.0) - (sp < 0.04 ? 0.18 : 0.0);
  alb *= 1.0 + 0.25 * (s0 / 0.035) * 0.3;
  // the amphora: contact shadow + a soft shadow cast along the light (vertical capsule)
  vec2 rp = P.xz - uVase.xz;
  ao = mix(0.35, 1.0, smoothstep(0.45, 1.9, length(rp)));
  vec2 dxz = uSunUW.xz / max(uSunUW.y, 0.2);
  float tm = clamp(-dot(rp, dxz) / max(dot(dxz, dxz), 1e-4), 0.0, 3.3);
  shadow = mix(0.25, 1.0, smoothstep(0.55, 1.15, length(rp + dxz * tm)));
#endif
#ifdef GRASS
  alb *= mix(0.55, 1.25, vUv.y);
  if (!gl_FrontFacing) N = -N;
#endif
#ifdef VASE
  // glazed cream body with a terracotta band and sandy wear near the foot
  float yv = P.y - uVase.y;
  alb = mix(alb, vec3(0.62, 0.26, 0.15), smoothstep(0.012, 0.0, abs(yv - 2.28) - 0.05));
  alb = mix(alb, vec3(0.62, 0.26, 0.15), smoothstep(0.012, 0.0, abs(yv - 1.02) - 0.025));
  alb = mix(alb, vec3(0.55, 0.48, 0.36), smoothstep(0.55, 0.0, yv) * (0.5 + 0.5 * vnoise(P.xz * 6.0 + yv * 3.0)));
  ao = mix(0.55, 1.0, smoothstep(0.0, 0.7, yv));
#endif
  // light reaching this point: the caustic pattern of the surface patch above it, attenuated by the water column
  vec2 m = P.xz - uFlatOff * (uSurf - P.y);
  vec3 caus = texture2D(uCaus, m / uL + 0.5, uCausLod).rgb;
  float dB = max(uSurf - P.y, 0.0) * uLightDepth;
  vec3 att = exp(-uSigma * dB);
  float ndl = dot(N, uSunUW);
#ifdef GRASS
  ndl = abs(ndl) * 0.8 + 0.2;
#endif
  ndl = max(ndl, 0.0);
  vec3 sun = uSunCol * att * ndl * caus * shadow;
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5) * exp(-uSigma * dB * 0.5) * ao;
  vec3 col = alb * (sun + amb * ao);
#ifdef VASE
  vec3 V = normalize(cameraPosition - P);
  vec3 R = reflect(-V, N);
  float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  vec3 envc = mix(uFogDeep, uFogUp * 1.6, smoothstep(-0.3, 0.9, R.y)) + uSunCol * att * pow(max(dot(R, uSunUW), 0.0), 60.0) * 2.0;
  col += envc * fr * 0.8;
#endif
  gl_FragColor = vec4(col, length(P - cameraPosition));
}
`

/* ------------------------------------------------------------------ the surface from below: Snell's window + TIR */

export const SURF_VERT = /* glsl */ `
varying vec3 vPw;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
export const SURF_FRAG = /* glsl */ `
uniform vec3 uSunUp;
uniform vec3 uSunCol;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
uniform float uSkyK;
varying vec3 vPw;
${WATER}
${NOISE}
void main() {
  vec3 w = water(vPw.xz);
  vec3 Nd = -normalize(vec3(-w.y, 1.0, -w.z));
  vec3 V = normalize(vPw - cameraPosition);
  float ci = clamp(dot(-V, Nd), 0.0, 1.0);
  vec3 T = refract(V, Nd, 1.333);
  vec3 col;
  // the mirrored underwater world (total internal reflection) — dark, with a hint of the light above
  vec3 R = reflect(V, Nd);
  vec3 under = mix(uFogDeep * 0.6, uFogUp * 0.9, smoothstep(-1.0, -0.2, R.y));
  if (dot(T, T) < 1e-4) {
    col = under;
  } else {
    // Fresnel for water → air, evaluated on the transmitted side so it rises to 1 at the critical angle
    float ct = clamp(T.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(T, -Nd), 0.0), 5.0);
    float el = T.y;
    vec3 sky = mix(vec3(1.25, 1.35, 1.35), vec3(0.45, 0.78, 1.05), smoothstep(0.0, 0.85, el));
    // drifting clouds, seen through the moving lens of the surface
    vec2 cu = T.xz / max(T.y, 0.06) * 0.55 + vec2(uTime * 0.012, uTime * 0.004);
    float cl = vnoise(cu * 1.3) * 0.55 + vnoise(cu * 2.9 + 3.1) * 0.3 + vnoise(cu * 6.5 - 1.7) * 0.15;
    cl = smoothstep(0.42, 0.78, cl) * smoothstep(0.04, 0.3, el);
    sky = mix(sky, vec3(1.7, 1.75, 1.8), cl * 0.85);
    float sd = max(dot(T, uSunUp), 0.0);
    sky += vec3(1.0, 0.95, 0.85) * (pow(sd, 900.0) * 40.0 + pow(sd, 40.0) * 1.6 + pow(sd, 6.0) * 0.35);
    // the compressed horizon at the window rim picks up a slight prismatic fringe
    sky *= vec3(1.0 + 0.15 * smoothstep(0.08, 0.0, ct), 1.0, 1.0 + 0.2 * smoothstep(0.03, 0.12, ct) * smoothstep(0.2, 0.1, ct));
    col = mix(sky * uSkyK, under, F);
  }
  gl_FragColor = vec4(col, length(vPw - cameraPosition));
}
`

/* ------------------------------------------------------------------ full-screen passes */

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const VIEW = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
vec3 viewDir(vec2 uv) {
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  p /= p.w;
  return normalize((uCamWorld * vec4(p.xyz, 0.0)).xyz);
}
`

/** volumetric shafts, half resolution: march the view ray through the water column; the light at each sample is
 *  the (blurred) caustic intensity of the surface patch straight up-sun of it, attenuated on both legs */
export const RAYS_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D uCaus;
uniform vec3 uCamPos;
uniform float uL;
uniform float uSurf;
uniform vec2 uFlatOff;
uniform vec3 uSigma;
uniform float uLightDepth;
uniform vec3 uSunCol;
uniform vec3 uSunUW;
uniform float uRayK;
uniform float uFrame;
varying vec2 vUv;
${VIEW}
#define STEPS 34
void main() {
  vec3 dir = viewDir(vUv);
  float d = texture2D(tScene, vUv).a;
  d = d < 0.001 ? 34.0 : min(d, 34.0);
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  float st = d / float(STEPS);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + j) * st;
    vec3 S = uCamPos + dir * t;
    if (S.y > uSurf) break;
    vec2 m = S.xz - uFlatOff * (uSurf - S.y);
    vec3 c = textureLod(uCaus, m / uL + 0.5, 3.6).rgb;
    vec3 sh = c * c * c;
    acc += sh * exp(-uSigma * ((uSurf - S.y) * uLightDepth + t));
  }
  float mu = dot(dir, uSunUW);
  float g = 0.55;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.0065;
  gl_FragColor = vec4(acc * st * uRayK * hg * uSunCol, 1.0);
}
`

export const COMP_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tRays;
uniform vec3 uSigma;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
uniform vec3 uSunUW;
uniform vec3 uSunCol;
uniform float uExposure;
uniform float uFade;
uniform vec2 uRes;
varying vec2 vUv;
${VIEW}
void main() {
  vec4 s = texture2D(tScene, vUv);
  float d = s.a < 0.001 ? 200.0 : s.a;
  vec3 dir = viewDir(vUv);
  vec3 T = exp(-uSigma * d * 0.62);
  vec3 fog = mix(uFogDeep, uFogUp, smoothstep(-0.45, 0.95, dir.y));
  fog += uSunCol * uFogUp * pow(max(dot(dir, uSunUW), 0.0), 8.0) * 0.35;
  vec3 col = s.rgb * T + fog * (1.0 - T);
  // soften the half-res, jittered march: centre + four diagonal taps
  vec2 px = 1.0 / uRes;
  vec3 rays = texture2D(tRays, vUv).rgb * 0.2;
  rays += texture2D(tRays, vUv + vec2(2.5, 1.0) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-2.5, -1.0) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(1.0, -2.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-1.0, 2.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(4.5, 4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-4.5, 4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(4.5, -4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-4.5, -4.5) * px).rgb * 0.1;
  col += rays;
  col *= uExposure;
  // filmic shoulder, vignette, display gamma, dither
  col = col / (1.0 + col * 0.55);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  vec2 sv = vUv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.75;
  col *= uFade;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/** marine snow, drawn over the composite; occluded by hand against the scene distance */
export const SNOW_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uPx;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
varying float vD;
varying float vY;
varying float vSeed;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.21 + aSeed * 6.0) * 0.4 + uTime * 0.05, -uTime * (0.05 + 0.06 * fract(aSeed * 7.3)), cos(uTime * 0.17 + aSeed * 4.0) * 0.4);
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vD = -mv.z;
  vY = p.y;
  vSeed = aSeed;
  gl_PointSize = clamp((0.6 + 1.4 * fract(aSeed * 13.1)) * uPx * 0.035 / max(vD, 0.3), 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`
export const SNOW_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec3 uSigma;
uniform vec3 uFogUp;
uniform float uSurf;
uniform float uExposure;
uniform float uTime;
varying float vD;
varying float vY;
varying float vSeed;
void main() {
  float sd = texture2D(tScene, gl_FragCoord.xy / uRes).a;
  if (sd > 0.001 && sd < vD) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.2, 1.0, r);
  vec3 c = uFogUp * 1.6 * exp(-uSigma * ((uSurf - vY) * 0.7 + vD * 0.62));
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + vSeed * 2.0) + vSeed * 30.0);
  c *= a * tw * uExposure * smoothstep(0.25, 1.2, vD);
  gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0 / 2.2)), 1.0);
}
`
