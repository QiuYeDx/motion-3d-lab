/**
 * GLSL for the frosted-window demo.
 *
 * Pane space: x ∈ [0, A] (A = aspect), y ∈ [0, 1] bottom → top. Sim space: texels of the frost field.
 *
 * Frost = Reiter's hexagonal snow-crystal automaton (see frostStepFrag): vapour diffuses towards the ice, cells next
 * to the ice soak it up and freeze, so tips outrun flanks and grow side branches → fern-like dendrites at the scale of
 * a couple of pixels, six-fold by construction.
 *
 * Frost state (float RGBA): R = s (water; ≥ 1 frozen, the excess is thickness), G = warmth, B = receptive flag,
 * A = rime haze. Glass state (half-float RGBA, coarser): R = wet, G = mist (breath), BA = direction of the last wipe.
 */

export const quadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/*
 * The automaton lives on a hex lattice, so every crystal would share the same six axes. The pane is shown through
 * a gentle domain warp (and brushes are pushed through the same warp in JS: warp() in FrostWindow.tsx), so the
 * ferns curve and lean differently across the glass.
 */
export const WARP = { amp: 0.045, f1: 3.7, g1: 1.3, f2: 3.1, g2: 1.9 }
const WARP_GLSL = /* glsl */ `
vec2 warp(vec2 p, float A) {
  // fades out towards the frame so the lattice is never sampled outside the pane
  float d = min(min(p.x, A - p.x), min(p.y, 1.0 - p.y));
  float k = smoothstep(0.0, 0.12, d);
  return k * ${WARP.amp.toFixed(4)} * vec2(sin(p.y * ${WARP.f1.toFixed(3)} + p.x * ${WARP.g1.toFixed(3)} + 1.7), sin(p.x * ${WARP.f2.toFixed(3)} - p.y * ${WARP.g2.toFixed(3)} + 0.4));
}
`

const HASH = /* glsl */ `
float h12(vec2 p) {
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

/* ------------------------------------------------------------------ the street outside */

export const streetFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uTime;
uniform float uMobile;
${HASH}

const vec3 LAMP = vec3(1.0, 0.6, 0.26);

float box(vec2 p, vec2 c, vec2 h, float b) {
  vec2 d = abs(p - c) - h;
  float m = max(d.x, d.y);
  return smoothstep(b, -b, m);
}

// light reaching a point from the street lamps (used to light the snow)
float lampField(vec2 p, out vec3 cone) {
  float acc = 0.0;
  cone = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = -0.05 + fi * 0.62;
    vec2 head = vec2(x, 0.5 - fi * 0.0);
    vec2 d = p - head;
    acc += exp(-dot(d, d) * 20.0) * 0.9;
    // cone under the lamp
    float dy = head.y - p.y;
    if (dy > 0.0 && p.y > 0.11) {
      float w = dy * 0.5 + 0.012;
      float c = smoothstep(w, w * 0.15, abs(d.x)) * exp(-dy * 1.6);
      cone += LAMP * c;
    }
  }
  return acc;
}

float snow(vec2 p, float cs, float speed, float rad, float soft, float seed, float amt) {
  vec2 q = p;
  q.y += uTime * speed;
  q.x += sin(q.y * 2.3 + seed) * 0.02 + uTime * speed * 0.18;
  vec2 id = floor(q / cs);
  float acc = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cid = id + vec2(float(i), float(j));
      vec4 h = h42(cid + seed);
      if (h.x > amt) continue;
      vec2 c = (cid + 0.15 + 0.7 * h.yz) * cs;
      c.x += sin(uTime * (0.6 + h.w) + h.w * 30.0) * cs * 0.18;
      float r = rad * (0.55 + 0.7 * h.w);
      float d = length(q - c);
      acc += smoothstep(r, r * soft, d) * (0.55 + 0.45 * h.y);
    }
  }
  return acc;
}

void main() {
  vec2 p0 = vec2(vUv.x * uA, vUv.y);
  // compose the street for a 1.6-wide view and centre it; portrait screens look at the middle of it
  float x = p0.x + (1.6 - uA) * 0.5 + uMobile * 0.32; // phones: the lamp next to the warm window
  float y = p0.y + uMobile * 0.06;
  vec2 p = vec2(x, y);

  // night sky: deep blue, a little warm city glow behind the roofs
  vec3 col = mix(vec3(0.05, 0.075, 0.13), vec3(0.012, 0.02, 0.045), smoothstep(0.4, 1.0, y));
  col += vec3(0.2, 0.11, 0.06) * exp(-abs(y - 0.62) * 7.0) * 0.35;

  // across the street: a tall facade (left) and a lower one (right)
  float f1 = box(p, vec2(0.34, 0.9), vec2(0.62, 0.58), 0.006);
  float roof2 = 0.82 + 0.02 * step(1.3, x);
  float f2 = box(p, vec2(1.33, 0.5), vec2(0.36, roof2 - 0.5), 0.006);
  vec3 wall = vec3(0.028, 0.036, 0.058);
  col = mix(col, wall, max(f1, f2));
  // snow on the roof edge of the lower building
  col += vec3(0.16, 0.19, 0.25) * smoothstep(0.012, 0.0, abs(y - roof2 - 0.004)) * step(0.97, x) * step(x, 1.69) * 0.7;

  // windows
  {
    vec2 cs = vec2(0.15, 0.165);
    vec2 g = (p - vec2(0.0, 0.36)) / cs;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float inF1 = step(-0.28, x) * step(x, 0.92) * step(0.0, id.y);
    float inF2 = step(1.02, x) * step(x, 1.66) * step(0.0, id.y) * step(y, roof2 - 0.06);
    float inside = max(inF1, inF2);
    vec4 h = h42(id + 3.0);
    float w = box(f, vec2(0.0), vec2(0.24, 0.3), 0.06);
    float lit = step(0.68, h.x);
    // the one warm window everybody looks at
    bool hero = id.x == 7.0 && id.y == 1.0;
    vec3 wc = mix(vec3(1.0, 0.58, 0.26), vec3(1.0, 0.78, 0.5), h.y) * (0.35 + 0.5 * h.z);
    if (h.w > 0.85) wc = vec3(0.45, 0.62, 0.95) * 0.5; // a TV-blue one
    if (hero) {
      float cur = smoothstep(0.02, 0.08, abs(f.x)) ; // curtains drawn to the sides
      wc = vec3(1.0, 0.62, 0.3) * (1.35 - 0.5 * cur);
      lit = 1.0;
      w = box(f, vec2(0.0), vec2(0.3, 0.36), 0.05);
    }
    col = mix(col, col * 0.6 + wc * lit, w * inside);
    // snow on the sills
    col += vec3(0.13, 0.15, 0.2) * box(f, vec2(0.0, -0.34), vec2(0.28, 0.02), 0.03) * inside;
  }

  // ground: snow, faintly blue, with warm pools of lamplight
  float ground = smoothstep(0.322, 0.31, y);
  vec3 snowCol = mix(vec3(0.09, 0.11, 0.16), vec3(0.14, 0.16, 0.22), smoothstep(0.31, 0.0, y));
  col = mix(col, snowCol, ground);
  // curb line
  col *= 1.0 - 0.35 * smoothstep(0.008, 0.0, abs(y - 0.2)) * ground;

  vec3 cone;
  float lf = lampField(p, cone);
  for (int i = 0; i < 4; i++) {
    float lx = -0.05 + float(i) * 0.62;
    // pools on the snow
    vec2 dp = vec2((x - lx) * 0.9, (y - 0.2) * 3.2);
    col += LAMP * exp(-dot(dp, dp) * 30.0) * 0.4 * ground;
    // posts
    col = mix(col, vec3(0.02, 0.022, 0.03), smoothstep(0.004, 0.0015, abs(x - lx)) * step(0.12, y) * step(y, 0.5));
  }
  col += cone * 0.06;

  // lamp heads (soft defocused discs) and their halos
  for (int i = 0; i < 4; i++) {
    vec2 head = vec2(-0.05 + float(i) * 0.62, 0.5);
    float d = length(p - head);
    col += LAMP * (smoothstep(0.03, 0.022, d) * 2.2 + exp(-d * 9.0) * 0.32 + exp(-d * 30.0) * 0.6);
  }

  // falling snow: far, mid, near (near flakes are big and soft — out of focus)
  vec3 lit = vec3(0.32, 0.38, 0.5) + LAMP * lf * 2.2 + cone * 2.0;
  col += lit * snow(p, 0.03, 0.06, 0.0022, 0.2, 1.0, 0.55) * 0.35;
  col += lit * snow(p, 0.06, 0.1, 0.0045, 0.35, 7.0, 0.45) * 0.4;
  col += lit * snow(p + 3.0, 0.14, 0.17, 0.012, 0.05, 13.0, 0.35) * 0.22;

  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ frost field */

/*
 * Hex lattice in "odd-r" offset layout: odd rows are shifted half a cell right. Texels are 1 × 0.866 so the six
 * neighbours sit at 60° on screen.
 */
const HEX = /* glsl */ `
uniform sampler2D tS;
uniform vec2 uSimRes;
vec4 at(vec2 cell) { return texture2D(tS, (cell + 0.5) / uSimRes); }
`

export const frostInitFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uSimRes;
uniform float uSeed;
uniform float uCell; // CSS px per texel
uniform float uBeta;
uniform float uInterior; // share of 110-px cells that hold a dust speck
${HASH}

// one nucleus every ~spacing texels along an edge, on a jittered lattice
float edgeSeeds(float t, float depth, float spacing, float prob, float seed) {
  float id = floor(t / spacing);
  float best = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cid = id + float(k);
    vec2 h = vec2(h12(vec2(cid, seed)), h12(vec2(seed, cid * 1.7)));
    if (h.x > prob) continue;
    float c = (cid + 0.2 + 0.6 * h.y) * spacing;
    float r = 0.9 + 1.4 * h.x;
    float d = length(vec2(t - c, depth - 0.5));
    best = max(best, step(d, r));
  }
  return best;
}

void main() {
  vec2 cell = floor(vUv * uSimRes);
  vec2 p = cell + 0.5;
  float k = 2.0 / uCell; // spacing is given in CSS px / 2
  float f = 0.0;
  f = max(f, edgeSeeds(p.x, p.y, 30.0 * k, 0.8, uSeed + 1.0));                  // bottom (coldest)
  f = max(f, edgeSeeds(p.x, uSimRes.y - p.y, 54.0 * k, 0.55, uSeed + 2.0));     // top
  f = max(f, edgeSeeds(p.y, p.x, 40.0 * k, 0.65, uSeed + 3.0));                 // left
  f = max(f, edgeSeeds(p.y, uSimRes.x - p.x, 40.0 * k, 0.65, uSeed + 4.0));     // right
  vec2 q = min(p, uSimRes - p);
  f = max(f, step(length(q * vec2(1.0, 0.866)), 4.0));                          // corners
  // a few dust specks inside the pane grow into lone stars
  vec2 gc = floor(p / (110.0 * k));
  vec4 gh = h42(gc + uSeed * 1.3);
  vec2 gp = (gc + 0.2 + 0.6 * gh.yz) * 110.0 * k;
  if (gh.x < uInterior) f = max(f, step(length((p - gp) * vec2(1.0, 0.866)), 1.2));
  // a little jitter in the vapour makes the arms branch irregularly from the first step
  float s = f > 0.5 ? 1.0 : uBeta * (0.97 + 0.06 * h12(p + uSeed));
  gl_FragColor = vec4(s, 0.0, 0.0, 0.0);
}
`

/*
 * Reiter's local snow-crystal automaton (2005) on the hex lattice, plus warmth (the fingertip) and humidity:
 *  · receptive = frozen (s ≥ 1) or touching a frozen cell; the receptive part keeps its water and gains γ per step
 *  · the rest (vapour) diffuses: u' = u + α/2 (⟨u⟩₆ − u), with receptive neighbours counting as sinks (u = 0)
 *  · warm glass is never receptive, and above 0.5 it melts what is there
 * R = s (water; frozen when ≥ 1, the excess is ice thickness), G = warmth, B = receptive flag (read by the
 * neighbours next step), A = rime haze on bare cold glass.
 */
export const frostStepFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
${HEX}
uniform float uBeta;   // ambient vapour
uniform float uGamma;  // water condensing on the ice per step
uniform float uRho;    // humidity: vapour drifting back to β
uniform float uWarmK;  // warmth kept per step
uniform float uRimeK;  // rime haze growth per step
${HASH}

float uOf(vec4 v) { return v.z > 0.5 ? 0.0 : v.x; }
float frz(vec4 v) { return step(1.0, v.x); }

void main() {
  vec2 cell = floor(vUv * uSimRes);
  float odd = mod(cell.y, 2.0);
  vec2 o = odd > 0.5 ? vec2(0.0, 1.0) : vec2(-1.0, 0.0);
  vec4 c = at(cell);
  vec4 n0 = at(cell + vec2(-1.0, 0.0));
  vec4 n1 = at(cell + vec2(1.0, 0.0));
  vec4 n2 = at(cell + vec2(o.x, 1.0));
  vec4 n3 = at(cell + vec2(o.y, 1.0));
  vec4 n4 = at(cell + vec2(o.x, -1.0));
  vec4 n5 = at(cell + vec2(o.y, -1.0));

  float warm = c.y;
  float nf = frz(n0) + frz(n1) + frz(n2) + frz(n3) + frz(n4) + frz(n5);
  float rec = (frz(c) + nf) > 0.5 && warm < 0.04 ? 1.0 : 0.0;

  float u = rec > 0.5 ? 0.0 : c.x;
  float avg = (uOf(n0) + uOf(n1) + uOf(n2) + uOf(n3) + uOf(n4) + uOf(n5)) / 6.0;
  float s = u + 0.5 * (avg - u);
  if (rec > 0.5) s += c.x + uGamma;
  else s += uRho * (uBeta - s);

  // warmth: spreads a little, fades; while warm nothing freezes, and real warmth melts the ice
  float wavg = (n0.y + n1.y + n2.y + n3.y + n4.y + n5.y) / 6.0;
  warm = max(0.0, (warm + 0.12 * (wavg - warm)) * uWarmK - 0.0004);
  if (warm > 0.04) s = min(s, 0.985);
  if (warm > 0.5) s = mix(s, uBeta, 0.2);

  // rime: a faint haze settles on bare cold glass over time
  float rime = c.w;
  rime = s < 1.0 && warm < 0.04 ? rime + (1.0 - rime) * uRimeK : rime;

  gl_FragColor = vec4(s, warm, rec, rime);
}
`

/* brushes: up to 16 capsules per pass — finger wipes, running drops, breath, new nuclei */
const BRUSH_HEAD = /* glsl */ `
uniform vec4 uB0[16]; // x0 y0 x1 y1 (pane units)
uniform vec4 uB1[16]; // radius (pane units), type, strength, —
uniform int uN;
uniform float uA;
float capsule(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}
`

export const frostBrushFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tS;
uniform float uBeta;
${BRUSH_HEAD}
void main() {
  vec4 c = texture2D(tS, vUv);
  vec2 p = vec2(vUv.x * uA, vUv.y);
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec4 b0 = uB0[i];
    vec4 b1 = uB1[i];
    float d = capsule(p, b0.xy, b0.zw);
    float r = b1.x;
    float type = b1.y;
    if (type < 0.5) {
      // warm fingertip: melts the ice, wipes the rime, leaves the glass warm for a while
      float a = smoothstep(r, r * 0.6, d) * b1.z;
      float hard = step(d, r * 0.85);
      c.x = mix(c.x, uBeta * 0.8, max(a, hard));
      c.y = max(c.y, a);
      c.w = mix(c.w, 0.0, a);
      c.z = mix(c.z, 0.0, hard);
    } else if (type < 1.5) {
      // a running drop melts a narrow channel
      float a = smoothstep(r, r * 0.5, d) * b1.z;
      float hard = step(d, r * 0.8);
      c.x = mix(c.x, uBeta, hard);
      c.y = max(c.y, a * 0.7);
      c.w = mix(c.w, 0.0, a);
      c.z = mix(c.z, 0.0, hard);
    } else if (type < 2.5) {
      // breath: warm moist air pauses the growth (it doesn't melt the ice)
      float a = exp(-d * d / (r * r) * 2.5) * b1.z;
      c.y = max(c.y, min(0.45, c.y + a * 0.6));
    } else {
      // a new nucleus (dust speck on the glass)
      if (d < r && c.y < 0.04) c.x = max(c.x, 1.0);
    }
  }
  gl_FragColor = c;
}
`

export const glassFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tG;
uniform float uDt;
uniform float uMist; // mist the breath leaves behind fades with this rate
${BRUSH_HEAD}
void main() {
  vec4 c = texture2D(tG, vUv);
  vec2 p = vec2(vUv.x * uA, vUv.y);
  c.x = max(0.0, c.x - uDt * 0.07);       // the wipe dries in ~15 s
  c.y = max(0.0, c.y - uDt * uMist * (0.4 + c.y)); // breath mist evaporates
  for (int i = 0; i < 16; i++) {
    if (i >= uN) break;
    vec4 b0 = uB0[i];
    vec4 b1 = uB1[i];
    float d = capsule(p, b0.xy, b0.zw);
    float r = b1.x;
    float type = b1.y;
    if (type < 0.5) {
      float a = smoothstep(r * 1.1, r * 0.5, d) * b1.z;
      c.x = max(c.x, a);
      c.y = mix(c.y, 0.0, a);
      vec2 dir = b0.zw - b0.xy;
      float l = length(dir);
      if (l > 1e-5) c.zw = mix(c.zw, dir / l, a);
    } else if (type < 1.5) {
      float a = smoothstep(r, r * 0.4, d) * b1.z;
      c.x = max(c.x, a * 0.85);
      c.zw = mix(c.zw, vec2(0.0, 1.0), a);
    } else if (type < 2.5) {
      float a = exp(-d * d / (r * r) * 1.3) * b1.z;
      c.y = min(1.2, c.y + a);
    }
  }
  gl_FragColor = c;
}
`

/* ------------------------------------------------------------------ composite */

export const MAX_DROPS = 24

export const compositeFrag = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D tStreet;
uniform sampler2D tS;
uniform sampler2D tG;
uniform vec2 uSimTx;
uniform vec2 uRes;    // drawing buffer px
uniform float uDpr;
uniform float uA;
uniform float uTime;
uniform float uFade;
uniform vec4 uDrops[${MAX_DROPS}]; // x, y (pane), r (pane), alpha
uniform vec3 uGhost; // x, y (pane), alpha — the fingertip of the auto-wipe
${HASH}
${WARP_GLSL}

vec3 street(vec2 uv, float lod) { return textureLod(tStreet, uv, lod).rgb; }

float iceOf(float s) { return smoothstep(0.965, 1.015, s); }
float thickOf(float s) { return 1.0 - exp(-max(s - 1.0, 0.0) * 1.3); }
float iceAt(vec2 uv) { return iceOf(texture2D(tS, uv).x); }
float heightAt(vec2 uv) {
  float s = texture2D(tS, uv).x;
  return iceOf(s) * 0.6 + sqrt(max(s - 1.0, 0.0)) * 0.9;
}

void main() {
  vec2 uv = vUv;
  vec2 px = gl_FragCoord.xy / uDpr; // CSS px
  vec2 pane = vec2(uv.x * uA, uv.y);
  vec2 wp = pane + warp(pane, uA);
  vec2 su = vec2(wp.x / uA, wp.y); // where this pixel sits on the frost lattice

  vec4 S = texture2D(tS, su);
  vec4 G = texture2D(tG, su);
  float ice = iceOf(S.x);
  float thick = thickOf(S.x);
  float wet = G.x;
  float mist = clamp(G.y, 0.0, 1.0);

  // relief of the ice → normal
  vec2 e = uSimTx;
  float hx = heightAt(su + vec2(e.x, 0.0)) - heightAt(su - vec2(e.x, 0.0));
  float hy = heightAt(su + vec2(0.0, e.y)) - heightAt(su - vec2(0.0, e.y));
  vec3 n = normalize(vec3(-hx * 2.2, -hy * 2.2, 1.0));
  float edge = clamp(length(vec2(iceAt(su + vec2(e.x, 0.0)) - iceAt(su - vec2(e.x, 0.0)), iceAt(su + vec2(0.0, e.y)) - iceAt(su - vec2(0.0, e.y)))) * 1.4, 0.0, 1.0);

  // how frosted this spot is: crystals, plus the thin rime haze that settles on bare cold glass
  float rime = clamp(S.w * (1.0 - ice) * 0.6, 0.0, 0.5);
  float frost = max(ice * (0.72 + 0.28 * thick), rime);

  // --- clear glass: the street, a little smeared where a finger went
  vec2 dir = G.zw;
  float dl = length(dir);
  vec2 dn = dl > 1e-3 ? dir / dl : vec2(1.0, 0.0);
  vec2 sp = vec2(dot(px, dn), dot(px, vec2(-dn.y, dn.x)));
  float streak = h12(vec2(floor(sp.y / 3.0), 7.0)) * 0.6 + h12(vec2(floor(sp.y / 11.0), 3.0)) * 0.4;
  float smear = wet * (0.4 + 0.6 * streak);
  vec2 refr = n.xy * 0.006 * (frost + wet * 0.5);
  vec3 clear = street(uv + refr, smear * 1.6);
  clear *= 1.0 + 0.08 * (streak - 0.5) * wet;

  // --- frosted: blurred + scattered (the lamps glow through the ice)
  vec3 blur = vec3(0.0);
  float br = 10.0 / uRes.y * uDpr;
  blur += street(uv + refr * 3.0 + vec2(br, 0.0), 3.6);
  blur += street(uv + refr * 3.0 - vec2(br, 0.0), 3.6);
  blur += street(uv + refr * 3.0 + vec2(0.0, br), 3.6);
  blur += street(uv + refr * 3.0 - vec2(0.0, br), 3.6);
  blur *= 0.25;
  vec3 glow = street(uv, 6.0);
  float lumB = dot(glow, vec3(0.3, 0.55, 0.15));
  vec3 iceCol = blur * 0.8 + glow * 0.9 + vec3(0.30, 0.40, 0.55) * 0.07;
  // crystal relief: room-side light from the upper left, a cold sky reflection on the slopes
  vec3 L = normalize(vec3(-0.5, 0.6, 0.62));
  float ndl = dot(n, L);
  iceCol *= 0.85 + 0.45 * ndl;
  iceCol += vec3(0.62, 0.75, 0.95) * (0.05 + 0.16 * thick) * ice;
  iceCol += vec3(0.75, 0.85, 1.0) * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * 0.18 * ice;
  // crisp crystal edges catch light
  iceCol += (vec3(0.7, 0.82, 1.0) * 0.16 + glow * 0.8) * edge;

  vec3 col = mix(clear, iceCol, frost);

  // --- sparkle: individual facets glint and twinkle, more where light comes through
  {
    vec2 cell = floor(px / 3.0);
    vec4 h = h42(cell + 11.0);
    if (h.x > 0.955 && ice > 0.5) {
      vec2 f = (fract(px / 3.0) - 0.5) * 3.0 - (h.yz - 0.5) * 1.5;
      float tw = pow(max(0.0, sin(uTime * (0.6 + h.w * 2.2) + h.y * 60.0)), 18.0);
      float star = exp(-dot(f, f) * 1.2) + exp(-abs(f.x) * 3.0 - abs(f.y) * 0.7) * 0.25 + exp(-abs(f.y) * 3.0 - abs(f.x) * 0.7) * 0.25;
      col += vec3(0.85, 0.93, 1.0) * star * tw * (0.35 + lumB * 6.0) * ice;
    }
  }

  // --- wet edge: a thin lens of melt water along the boundary of a wipe catches the light
  {
    vec2 ge = 2.5 * uDpr / uRes;
    float wx = texture2D(tG, su + vec2(ge.x, 0.0)).x - texture2D(tG, su - vec2(ge.x, 0.0)).x;
    float wy = texture2D(tG, su + vec2(0.0, ge.y)).x - texture2D(tG, su - vec2(0.0, ge.y)).x;
    float rim = smoothstep(0.04, 0.3, length(vec2(wx, wy))) * smoothstep(0.05, 0.4, wet);
    vec2 bend = normalize(vec2(wx, wy) + 1e-5) * 0.012;
    col += (street(uv - bend, 1.5) * 0.9 + glow * 0.6 + vec3(0.5, 0.58, 0.7) * 0.07) * rim * 0.8;
    // the wiped glass itself: a faint watery sheen in the direction of the stroke
    col += vec3(0.5, 0.56, 0.66) * 0.035 * wet * streak * (1.0 - frost);
  }

  // --- breath mist: a soft milky veil of condensation with a fine dew grain
  {
    float grain = h12(floor(px / 2.0) + 5.0);
    vec3 mistCol = blur * 1.2 + glow * 2.0 + vec3(0.45, 0.52, 0.64) * 0.3;
    mistCol *= 0.9 + 0.2 * grain;
    float mk = smoothstep(0.0, 1.0, mist);
    col = mix(col, max(col, mistCol), mk * 0.9);
  }

  // --- drops of melt water: tiny ball lenses showing the street upside down
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 d = uDrops[i];
    if (d.w <= 0.0) continue;
    vec2 q = pane - d.xy;
    q.y *= 1.12;
    float r = d.z;
    float dd = dot(q, q) / (r * r);
    if (dd > 1.6) continue;
    // contact shadow / meniscus ring just outside
    col *= 1.0 - 0.25 * d.w * smoothstep(1.6, 1.0, dd) * step(1.0, dd);
    if (dd < 1.0) {
      float z = sqrt(1.0 - dd);
      vec3 dn3 = normalize(vec3(q / r, z * 1.3));
      vec2 look = uv - q / vec2(uA, 1.0) * 5.5; // inverted, zoomed-out view through the drop
      vec3 dc = street(look, 0.5) * 1.3 + vec3(0.04, 0.05, 0.07);
      dc *= 0.5 + 0.5 * smoothstep(0.0, 0.7, z);      // dark rim
      // light from behind gathers in a bright crescent at the bottom, a room-side highlight sits up top
      dc += (glow * 2.2 + vec3(0.25, 0.3, 0.38) * 0.35) * smoothstep(0.25, 0.95, -q.y / r) * (1.0 - z * 0.5);
      float sp = pow(max(dot(dn3, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 24.0);
      dc += vec3(1.0, 0.96, 0.9) * sp * 1.1;
      col = mix(col, dc, d.w * smoothstep(1.0, 0.86, dd));
    }
  }

  // --- the ghost fingertip of the auto-wipe: a faint warm touch
  {
    vec2 q = pane - uGhost.xy;
    col += vec3(1.0, 0.7, 0.45) * exp(-dot(q, q) / 0.0012) * 0.12 * uGhost.z;
  }

  // vignette + slight cold grade
  vec2 v = uv - 0.5;
  col *= 1.0 - 0.32 * dot(v, v) * 1.6;
  col = col / (1.0 + col * 0.12);

  gl_FragColor = vec4(col * uFade + vec3(0.03, 0.045, 0.07) * (1.0 - uFade), 1.0);
}
`
