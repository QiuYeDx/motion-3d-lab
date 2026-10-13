import { SIMPLEX_3D } from './glsl'

/**
 * GLSL for the rainy-window demo.
 *
 * Pane space: x ∈ [0, A] (A = aspect), y ∈ [0, 1] bottom → top. All drop sizes are in these units.
 * The two background targets cover the pane plus a margin M on every side, so drops near the edge can
 * look "past" the screen border.
 */

export const quadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const HASH = /* glsl */ `
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 h42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
`

/* ------------------------------------------------------------------ procedural night city */

export const cityFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uM;
uniform float uTime;
uniform float uFocus; // 0 = sharp (what the drops focus), 1 = bokeh (what the glass shows)
uniform float uDusk;  // 1 = 黄昏, 0 = 深夜
uniform float uYOff;  // portrait: lift the skyline above the copy
${HASH}

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

const float ROAD = 0.205;

vec3 palette(float h) {
  vec3 c;
  if (h < 0.40) c = vec3(1.0, 0.52, 0.16);       // sodium
  else if (h < 0.64) c = vec3(1.0, 0.80, 0.52);  // warm white
  else if (h < 0.76) c = vec3(0.62, 0.80, 1.0);  // cool white
  else if (h < 0.86) c = vec3(1.0, 0.16, 0.10);  // red
  else if (h < 0.94) c = vec3(0.12, 0.85, 0.95); // teal neon
  else c = vec3(1.0, 0.22, 0.58);                // magenta neon
  return c;
}

// 深夜: warm whites turn to sodium — the street is left to the lamps and the odd neon
vec3 lightCol(float h) {
  return h < 0.64 ? mix(palette(h * 0.62), palette(h), uDusk) : palette(h);
}

float bokehDisc(float d, float r) {
  float disc = smoothstep(r, r * 0.86, d);
  float rim = 0.8 + 0.32 * smoothstep(r * 0.45, r * 0.95, d);
  float rings = 1.0 + 0.05 * sin(d / r * 22.0);
  return disc * rim * rings;
}

float pointLight(float d, float rs) {
  return exp(-d * d / (rs * rs)) * 1.7 + exp(-d / (rs * 2.6)) * 0.16;
}

vec3 lights(vec2 p, float cs, float y0, float y1, float prob, float rs, float rb, float amp, float seed, float ys) {
  vec3 acc = vec3(0.0);
  vec2 id0 = floor(p / cs);
  float r = mix(rs, rb, uFocus);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(float(i), float(j));
      vec4 h = h42(id + seed);
      if (h.x > prob) continue;
      vec2 c = (id + 0.1 + 0.8 * h.yz) * cs;
      if (c.y < y0 || c.y > y1) continue;
      vec2 dv = p - c;
      dv.y *= ys;
      float d = length(dv);
      float tw = 0.78 + 0.22 * sin(uTime * (0.35 + h.w * 1.2) + h.w * 40.0);
      vec3 col = lightCol(fract(h.w * 7.13 + seed * 0.01)) * amp * (0.4 + 0.6 * h.y) * tw;
      acc += col * mix(pointLight(d, rs) * 2.4, bokehDisc(d, r) * 0.4, uFocus);
    }
  }
  return acc;
}

// a lane of cars: pairs of lights sliding along y = laneY
vec3 cars(vec2 p, float laneY, float speed, vec3 col, float sep, float seed, float ys, float prob) {
  float cs = 0.24;
  float x = p.x - uTime * speed;
  float id0 = floor(x / cs);
  float rs = 0.0026;
  float r = mix(rs, 0.026, uFocus);
  vec3 acc = vec3(0.0);
  float cy = ys < 1.0 ? laneY - 0.035 : laneY;
  for (int i = -1; i <= 1; i++) {
    float id = id0 + float(i);
    vec4 h = h42(vec2(id, seed));
    if (h.x > prob) continue;
    float cx = (id + 0.2 + 0.6 * h.y) * cs;
    for (int k = 0; k < 2; k++) {
      vec2 c = vec2(cx + (k == 0 ? -sep : sep), cy);
      vec2 dv = vec2(x - c.x, (p.y - c.y) * ys);
      float d = length(dv);
      acc += col * (0.7 + 0.3 * h.z) * mix(pointLight(d, rs) * 2.4, bokehDisc(d, r) * 0.45, uFocus);
    }
  }
  return acc;
}

// one row of building silhouettes; returns coverage, writes window emission
float buildings(vec2 p, float cw, float hmin, float hvar, float seed, float litP, out vec3 win) {
  float id = floor(p.x / cw);
  float fx = fract(p.x / cw);
  float hh = hmin + hvar * pow(h11(id + seed), 1.8);
  if (h11(id * 3.17 + seed) > 0.86) hh += 0.1;
  float ew = mix(0.0012, 0.02, uFocus);
  float gx = mix(0.025, 0.0, uFocus);
  float cover = smoothstep(hh + ew, hh - ew, p.y) * smoothstep(0.0, gx + 0.001, fx) * smoothstep(1.0, 1.0 - gx - 0.001, fx);

  vec2 wsz = vec2(0.0062, 0.0095);
  vec2 wid = floor(p / wsz);
  vec2 wf = fract(p / wsz);
  float rowLit = step(0.25, h21(vec2(id, wid.y) + seed)); // whole dark floors
  float lit = step(1.0 - litP, h21(wid + seed * 1.7)) * rowLit;
  float frame = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.25, wf.y) * step(wf.y, 0.72);
  vec3 wc = mix(vec3(1.0, 0.68, 0.34), vec3(0.7, 0.85, 1.0), step(0.78, h21(wid * 1.31 + 4.0)));
  wc *= 0.35 + 0.65 * h21(wid + 9.0);
  vec3 sharpW = wc * lit * frame;
  vec3 avgW = vec3(1.0, 0.72, 0.42) * litP * 0.75 * 0.31 * 0.75;
  float below = smoothstep(hh - 0.004, hh - 0.012, p.y);
  win = mix(sharpW * 1.6, avgW, uFocus) * below * cover;
  return cover;
}

void main() {
  vec2 p = vec2((vUv.x * (1.0 + 2.0 * uM) - uM) * uA, vUv.y * (1.0 + 2.0 * uM) - uM - uYOff);
  float y = p.y;

  // sky — city glow sits on the horizon
  vec3 nTop = lin(vec3(0.020, 0.028, 0.055));
  vec3 nMid = lin(vec3(0.050, 0.055, 0.095));
  vec3 nHor = lin(vec3(0.20, 0.13, 0.12));
  vec3 dTop = lin(vec3(0.03, 0.05, 0.12));
  vec3 dMid = lin(vec3(0.1, 0.09, 0.19));
  vec3 dHor = lin(vec3(0.6, 0.3, 0.15));
  vec3 top = mix(nTop, dTop, uDusk);
  vec3 mid = mix(nMid, dMid, uDusk);
  vec3 hor = mix(nHor, dHor, uDusk);
  vec3 col = mix(hor, mid, smoothstep(0.36, 0.62, y));
  col = mix(col, top, smoothstep(0.6, 1.05, y));

  // far skyline
  vec3 win;
  float cov = buildings(p, 0.05, 0.40, 0.2, 3.0, mix(0.13, 0.3, uDusk), win);
  vec3 farB = mix(lin(vec3(0.05, 0.05, 0.08)), lin(vec3(0.08, 0.06, 0.09)), uDusk);
  col = mix(col, farB, cov * 0.92) + win * 0.55;

  // far city lights scattered through the skyline
  col += lights(p, 0.028, 0.26, 0.5, mix(0.3, 0.5, uDusk), 0.0019, 0.014, 0.75, 11.0, 1.0);

  // near buildings occlude
  float cov2 = buildings(p + vec2(0.37, 0.0), 0.12, 0.28, 0.26, 17.0, mix(0.08, 0.18, uDusk), win);
  vec3 nearB = mix(lin(vec3(0.018, 0.02, 0.03)), lin(vec3(0.04, 0.025, 0.04)), uDusk);
  col = mix(col, nearB, cov2) + win * 0.9;

  // street level
  float road = smoothstep(ROAD + 0.002, ROAD - 0.004, y);
  vec3 roadC = mix(lin(vec3(0.03, 0.03, 0.04)), lin(vec3(0.07, 0.04, 0.05)), uDusk);
  col = mix(col, roadC * (0.6 + 0.6 * smoothstep(-0.1, ROAD, y)), road);

  // street lamps, signs, traffic lights
  col += lights(p, 0.075, 0.21, 0.62, 0.34, 0.0034, 0.042, 1.3, 29.0, 1.0);
  // cars: tail lights drifting left, headlights drifting right
  col += cars(p, ROAD + 0.008, -0.05, vec3(1.0, 0.1, 0.06) * 1.3, 0.011, 5.0, 1.0, 0.55);
  col += cars(p, ROAD - 0.012, 0.075, vec3(1.0, 0.86, 0.62) * 1.25, 0.014, 8.0, 1.0, 0.5);
  // close, very out-of-focus lights
  col += lights(p, 0.17, 0.0, 0.78, 0.22, 0.005, 0.1, 0.36, 41.0, 1.0);

  // wet asphalt: everything above smears down into long vertical reflections
  if (y < ROAD) {
    float k = smoothstep(-0.15, ROAD, y);
    float rx = p.x + 0.0025 * sin(y * 260.0 + uTime * 1.1) * (1.0 - uFocus);
    // mirror the band just above the kerb, stretched ~3x downward
    vec2 pm = vec2(rx, ROAD + (ROAD - y) * 0.32);
    vec3 refl = lights(pm, 0.075, 0.21, 0.62, 0.42, 0.0034, 0.042, 1.0, 29.0, 1.0);
    refl += lights(pm, 0.028, 0.26, 0.5, 0.5, 0.0019, 0.014, 0.75, 11.0, 1.0) * 0.6;
    vec2 pr = vec2(rx, y);
    refl += cars(pr, ROAD + 0.008, -0.05, vec3(1.0, 0.1, 0.06) * 1.3, 0.011, 5.0, 0.3, 0.55);
    refl += cars(pr, ROAD - 0.012, 0.075, vec3(1.0, 0.86, 0.62) * 1.25, 0.014, 8.0, 0.3, 0.5);
    k *= smoothstep(ROAD + 0.004, ROAD - 0.035, y);
    col += refl * 0.32 * k;
  }

  // warm/cool grade
  col *= mix(vec3(0.95, 1.0, 1.08), vec3(1.06, 0.97, 0.88), uDusk);
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ drops → lens field */

export const dropVert = /* glsl */ `
attribute vec4 aDrop;  // x, y, r, stretch
attribute float aKind; // 1 = sliding
uniform float uA;
uniform float uKR;
varying vec2 vD;
varying float vR;
varying float vS;
varying float vKind;
void main() {
  float r = aDrop.z;
  float s = aDrop.w;
  float ext = r * uKR;
  vec2 local = vec2(position.x * ext, mix(-ext, ext * (1.0 + 2.0 * s), position.y * 0.5 + 0.5));
  vD = local;
  vR = r;
  vS = s;
  vKind = aKind;
  vec2 pane = aDrop.xy + local;
  gl_Position = vec4(pane.x / uA * 2.0 - 1.0, pane.y * 2.0 - 1.0, 0.0, 1.0);
}
`

// additive: (d.x·w, d.y·w, w, r·w) — merged drops blend their lens coordinates smoothly (metaballs)
export const dropFrag = /* glsl */ `
precision highp float;
uniform float uKR;
varying vec2 vD;
varying float vR;
varying float vS;
void main() {
  vec2 d = vD;
  if (d.y > 0.0) d.y /= 1.0 + 2.0 * vS;
  d.x *= 1.0 + vS * 0.25;
  float s = length(d) / (vR * uKR);
  if (s >= 1.0) discard;
  float w = (1.0 - s * s);
  w *= w;
  gl_FragColor = vec4(d * w, w, vR * w);
}
`

// sliding drops wipe the micro-droplets and part of the fog along their path (max-blended timestamps)
export const clearFrag = /* glsl */ `
precision highp float;
uniform float uTime;
varying vec2 vD;
varying float vR;
varying float vS;
varying float vKind;
void main() {
  if (vKind < 0.5) discard;
  vec2 d = vD;
  if (d.y > 0.0) d.y /= 1.0 + 2.0 * vS;
  float s = length(d) / (vR * 1.15);
  if (s >= 1.0) discard;
  gl_FragColor = vec4(uTime, uTime - 13.0, 0.0, 0.0);
}
`

// pointer wipe: a capsule from uP0 to uP1 (pane units)
export const wipeFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uTime;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uRad;
void main() {
  vec2 p = vec2(vUv.x * uA, vUv.y);
  vec2 ba = uP1 - uP0;
  float t = clamp(dot(p - uP0, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float d = length(p - uP0 - ba * t) / uRad;
  if (d >= 1.0) discard;
  float edge = smoothstep(0.25, 1.0, d);
  gl_FragColor = vec4(uTime - edge * 30.0, uTime - edge * 40.0, uTime - edge * 40.0, 0.0);
}
`

/* ------------------------------------------------------------------ composite */

export const compositeFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform sampler2D tDrops;
uniform sampler2D tState;
uniform vec2 uRes;
uniform float uA;
uniform float uM;
uniform float uTime;
uniform float uKR;
uniform float uDensity;
uniform float uFog;
uniform float uDusk;
uniform float uSharpK;
${HASH}
${SIMPLEX_3D}

vec2 bgUv(vec2 p) {
  return vec2((p.x / uA + uM) / (1.0 + 2.0 * uM), (p.y + uM) / (1.0 + 2.0 * uM));
}

// a lens: the drop shows an inverted, zoomed-out, sharp view of the city
vec3 lens(vec2 p, vec2 d, float r, float inner, float V) {
  vec2 q = d / r;
  // a ball lens: very wide angle, upside down — V is the radius of the city patch it shows
  vec2 sp = (p - d) - q * V * (1.0 + 0.4 * dot(q, q));
  // explicit LOD: implicit derivatives are undefined inside the per-drop branches
  float lod = log2(max(1.0, (1.0 + V / r) * uSharpK / uRes.y)) - 0.35;
  vec3 c = textureLod(tSharp, bgUv(sp), lod).rgb * 1.9;
  c = mix(c, textureLod(tBlur, bgUv(p - d), 0.0).rgb, 0.18);
  // dark refractive rim, bright caustic crescent at the bottom, specular glint top-left
  c *= mix(0.08, 1.0, smoothstep(0.0, 0.55, inner));
  float crescent = smoothstep(0.35, 0.95, -q.y) * smoothstep(0.0, 0.35, inner) * (1.0 - smoothstep(0.35, 0.8, inner));
  c += crescent * textureLod(tBlur, bgUv(p + vec2(0.0, r * 3.0)), 0.0).rgb * 0.9;
  float spec = smoothstep(0.32, 0.0, length(q - vec2(-0.32, 0.4))) * 0.22 + smoothstep(0.1, 0.0, length(q - vec2(-0.28, 0.44))) * 0.6;
  c += spec * vec3(0.95, 0.97, 1.0);
  return c;
}

// procedural micro-droplets on one grid layer; returns (rgb, coverage)
vec4 droplets(vec2 p, float off, float cs, float dens, float rmin, float rmax, float seed, float px) {
  vec2 id = floor((p + off) / cs);
  vec4 h = h42(id + seed);
  if (h.x > dens) return vec4(0.0);
  vec2 c = (id + 0.22 + 0.56 * h.yz) * cs - off;
  float age = uTime - textureLod(tState, vec2(c.x / uA, c.y), 0.0).r;
  float regrow = 2.5 + 22.0 * h.w;
  float grow = smoothstep(regrow, regrow + 1.2, age);
  float r = mix(rmin, rmax, h.w * h.w) * grow;
  if (r < px * 0.6) return vec4(0.0);
  vec2 d = p - c;
  float dl = length(d);
  float cov = smoothstep(r, r - px * 1.2, dl);
  if (cov <= 0.0) return vec4(0.0);
  float inner = 1.0 - (dl * dl) / (r * r);
  return vec4(lens(p, d, r, inner, r * 3.4), cov);
}

void main() {
  vec2 p = vec2(vUv.x * uA, vUv.y);
  float px = 1.0 / uRes.y;
  vec4 st = texture2D(tState, vUv);

  // glass: bokeh city, plus condensation
  vec2 bu = bgUv(p);
  vec3 glass = texture2D(tBlur, bu).rgb;
  // where a hand wiped the glass, the city snaps into focus (fades back as the glass fogs over)
  float clarity = 1.0 - smoothstep(4.0, 28.0, uTime - st.b);
  if (clarity > 0.0) {
    vec3 sharp = textureLod(tSharp, bu, 1.2).rgb * 1.15 + glass * 0.3;
    glass = mix(glass, sharp, clarity * 0.85);
  }
  float fogAge = uTime - st.g;
  float fogBack = smoothstep(4.0, 30.0, fogAge);
  float n = snoise(vec3(p * 2.2, uTime * 0.02)) * 0.5 + 0.5;
  float n2 = snoise(vec3(p * 9.0, 3.0)) * 0.5 + 0.5;
  vec2 ev = (vUv - 0.5) * vec2(1.0, 1.25);
  float shape = 0.32 + 0.45 * n * n + 0.5 * smoothstep(0.28, 0.72, length(ev)) + 0.2 * smoothstep(0.3, 0.0, p.y) + 0.08 * n2;
  float fog = clamp(fogBack * uFog * shape, 0.0, 1.0);
  vec3 heavy = textureLod(tBlur, bu, 2.5).rgb * 0.5 + textureLod(tBlur, bu + vec2(0.0, 0.01), 4.0).rgb * 0.6;
  vec3 haze = mix(vec3(0.008, 0.011, 0.018), vec3(0.012, 0.012, 0.022), uDusk);
  vec3 fogged = heavy * 0.85 + haze;
  fogged = mix(fogged, vec3(dot(fogged, vec3(0.3, 0.55, 0.15))), 0.3);
  // micro-condensation: a faint frosted sheen lit by whatever glows behind it
  fogged += heavy * (0.25 + 0.35 * n2) * 0.3;
  // micro-texture of condensation catching the light
  // a freshly wiped glass is a little darker and crisper
  vec3 col = mix(glass, fogged, fog);
  // water collects along the edge of a wipe
  float wipeEdge = smoothstep(0.15, 0.45, fogBack) * (1.0 - smoothstep(0.45, 0.8, fogBack)) * step(fogAge, 60.0);
  col += heavy * wipeEdge * 0.12;

  float see = 1.0 - fog * 0.35; // drops are on the outside; condensation softens them

  // micro droplets
  vec4 dd = droplets(p, 0.0, 0.011, 0.55 * uDensity, 0.0012, 0.0034, 1.0, px);
  col = mix(col, dd.rgb, dd.a * see * 0.95);
  dd = droplets(p, 0.37, 0.021, 0.42 * uDensity, 0.002, 0.0058, 7.0, px);
  col = mix(col, dd.rgb, dd.a * see);
  dd = droplets(p, 0.71, 0.043, 0.3 * uDensity, 0.003, 0.0085, 13.0, px);
  col = mix(col, dd.rgb, dd.a * see);

  // big drops & trails from the simulation (metaball field)
  vec4 D = texture2D(tDrops, vUv);
  float F = D.b;
  float T = 0.3086; // field value at s = 1/1.5 → the drop's visual radius
  float aa = max(fwidth(F), 1e-4);
  if (F > T * 0.6) {
    float m = smoothstep(T - aa, T + aa, F);
    vec2 d = D.rg / F;
    float r = max(D.a / F, 1e-4);
    float inner = clamp((F - T) / (1.0 - T), 0.0, 1.0);
    vec3 dc = lens(p, d, r, inner, r * 3.2);
    col = mix(col, dc, m * see);
  }

  // vignette, tone map, grain
  vec2 vp = vUv - 0.5;
  vp.x *= uA;
  col *= 1.0 - smoothstep(0.3, 1.2, length(vp)) * 0.62;
  col = 1.0 - exp(-col * 1.25);
  col = pow(col, vec3(1.0 / 2.2));
  col += (h21(gl_FragCoord.xy + fract(uTime * 7.1) * 311.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`
