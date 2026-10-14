import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 剪纸叠层 — the picture is rebuilt as stacked sheets of cut paper.
 *
 *  1. Layers. The scene's lightness (optionally mixed with depth, `setPapercutDepth`) becomes a continuous
 *     "stack height" H: 0 on the empty background, 1 … N on the subject. Sheet k is cut along the iso-line
 *     H = k, so darker / deeper parts sit lower in the stack and each brighter / nearer region is a sheet
 *     laid on top. The sampling position is domain-warped (slow wobble + fine jitter + rare scissor nicks)
 *     so every cut looks hand-made.
 *  2. Shadows. Each sheet casts a soft drop shadow onto the ones below: the stack height is sampled at
 *     several distances toward the light; a sheet that is ≥ x layers higher at distance x·h shades this
 *     point (h = shadow length per layer). Plus contact shadow at the foot of every step.
 *  3. Paper. Flat colour per sheet from the mode's palette (back → front), fibre texture, a thin light
 *     edge on the cut border where it faces the light (darker where it faces away), AA across the cuts.
 *  4. Modes: 灯箱 warm backlit lightbox (teal → orange sheets, glow from behind), 中国剪纸 one red sheet on
 *     cream with crescent / dot patterns cut into the brighter areas, 纸雕 white paper only (shadows do all
 *     the shading). Optional shadow-box frame (`setPapercutBox`); off by default (full screen).
 *
 * Changing the layer count slides the cuts to their new places; changing mode sweeps a scissor cut across.
 */

export type PapercutMode = 'lightbox' | 'chinese' | 'kirigami'

export const papercutModes: { id: PapercutMode; label: string; en: string; dark?: boolean }[] = [
  { id: 'lightbox', label: '灯箱', en: 'Lightbox', dark: true },
  { id: 'chinese', label: '中国剪纸', en: 'Chinese paper-cut' },
  { id: 'kirigami', label: '纸雕', en: 'Paper sculpture' },
]

export const papercutMeta = { title: '剪纸叠层', en: 'Paper Cut', background: '#f4ede2', theme: 'light' as const }

/* ------------------------------------------------------------------ papers (sRGB, back → front) */

export const PAPERS: Record<PapercutMode, string[]> = {
  lightbox: ['#0b2431', '#0f4251', '#156a6c', '#3f9583', '#e39a52', '#f0823a', '#f7a94e', '#fcd98f'],
  chinese: ['#f2e3c4', '#c8161f', '#c8161f', '#c8161f', '#c8161f', '#c8161f', '#c8161f', '#a90f18'],
  kirigami: ['#e2dfd9', '#e8e5e0', '#edebe6', '#f1efeb', '#f4f3ef', '#f7f6f3', '#f9f8f6', '#fcfbf9'],
}

// per-mode parameters (see the uniform comments in the shader)
const MODE_PARAMS: Record<PapercutMode, { A: number[]; B: number[]; C: number[]; D: number[] }> = {
  //           shadow len  str  edge  flat     fibre glow pattern vignette   shadow tint                edge light colour
  lightbox: { A: [7.5, 0.62, 0.28, 0], B: [1.0, 1.0, 0, 0.55], C: [0.03, 0.08, 0.12, 0], D: [1.0, 0.86, 0.62, 0] },
  chinese: { A: [3.2, 0.42, 0.12, 1], B: [1.2, 0.0, 1, 0.12], C: [0.35, 0.12, 0.08, 0], D: [1.0, 0.62, 0.55, 0] },
  kirigami: { A: [9.0, 0.5, 0.38, 0], B: [0.9, 0.0, 0, 0.22], C: [0.2, 0.22, 0.3, 0], D: [1.0, 1.0, 1.0, 0] },
}
const ORDER: PapercutMode[] = ['lightbox', 'chinese', 'kirigami']
const MODE_INDEX: Record<PapercutMode, number> = { lightbox: 0, chinese: 1, kirigami: 2 }

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
// papers as an 8×3 RGBA8 texture: row m = mode, back → front
uniform sampler2D tPal;
uniform int uNS;     // shadow taps (as a uniform: keeps ANGLE/FXC from unrolling the loop)
// parameters of the incoming (T) and outgoing (F) mode:
//  A shadow length per layer (CSS px), shadow strength, edge light, flat single sheet (剪纸)
//  B fibre texture, backlight glow, cut patterns, vignette
//  C shadow tint (rgb)
//  D edge light colour (rgb)
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uTC; uniform vec4 uTD;
uniform vec4 uFA; uniform vec4 uFB; uniform vec4 uFC; uniform vec4 uFD;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uLayers;
uniform vec2 uLight;      // unit direction toward the light (screen, y up)
uniform vec2 uGlow;       // lightbox glow centre (uv)
uniform float uDepthMix;
uniform vec2 uDepthRange; // view depth that maps to the front / back of the stack
uniform vec4 uBox;        // shadow box: centre x, centre y (CSS px from the top left), half width, half height
uniform float uBoxOn;
uniform vec3 uPage;
uniform vec3 uFrame;

vec4 PA; vec4 PB; vec4 PC; vec4 PD;
float ROW;
float N;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// continuous stack height at a (warped) device px: 0 background, 1 … N on the subject
float heightAt(vec2 px) {
  vec3 c = sceneL(px);
  float cov = textureLod(tNormal, px / uRes, 0.0).a;
  float v = luma(c);
  if (uDepthMix > 0.001) {
    float nr = clamp((uDepthRange.y - depthL(px)) / max(uDepthRange.y - uDepthRange.x, 1e-3), 0.0, 1.0);
    v = mix(v, nr, uDepthMix);
  }
  return smoothstep(0.2, 0.8, cov) * (1.0 + clamp(v, 0.0, 1.0) * (N - 1.002));
}

// hand-cut wobble, CSS px
vec2 warpAt(vec2 cp) {
  vec2 w = (vec2(vnoise(cp / 46.0), vnoise(cp / 46.0 + 17.3)) - 0.5) * 7.0;
  w += (vec2(vnoise(cp / 6.5 + 3.1), vnoise(cp / 6.5 + 9.7)) - 0.5) * 1.3;
  vec2 ci = floor(cp / 13.0);
  if (hash12(ci + 2.2) < 0.16) {                     // scissor nick
    vec2 f = fract(cp / 13.0) - 0.5;
    w += (hash22(ci) - 0.5) * 5.0 * max(0.0, 1.0 - length(f) * 4.0);
  }
  return w;
}

// 剪纸 cut patterns, growing with the level t (0..1) so brighter areas show more of the cream ground:
// staggered rows of crescents (月牙纹) on even levels, round holes (圆点) on odd ones.
// Returns the signed distance to the hole (CSS px, < 0 inside) and the paper's outward normal there.
float holes(vec2 cp, float t, float odd, out vec2 nrm) {
  float S = mix(14.0, 19.0, t);
  vec2 g = cp / S;
  float row = floor(g.y);
  g.x += mod(row, 2.0) * 0.5;
  vec2 f = (fract(g) - 0.5) * S;
  if (odd > 0.5) {
    float r = mix(2.0, 3.6, t);
    nrm = -normalize(f + 1e-4);
    return length(f) - r;
  }
  float flip = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
  float r = mix(3.4, 5.8, t);
  vec2 c2 = vec2(0.0, r * 0.62 * flip);
  float d1 = length(f) - r;
  float d2 = length(f - c2) - r * 0.95;
  nrm = d1 > -d2 ? -normalize(f + 1e-4) : normalize(f - c2 + 1e-4);
  return max(d1, -d2);
}

float patT(float k) { return clamp((k - 2.0) / max(N - 4.0, 1.0), 0.0, 1.0); }

// stack height seen by the shadow rays (剪纸: one flat sheet with its holes)
float occH(vec2 q) {
  vec2 qc = q / uDpr;
  float h = heightAt(q + warpAt(qc) * uDpr);
  if (PA.w > 0.5) {
    float s = smoothstep(0.8, 1.2, h);
    float kq = floor(h);
    if (PB.z > 0.5 && kq > N - 1.5 && N > 2.5) s = 0.0;   // the cut-away top level (its rim is ignored)
    else if (PB.z > 0.5 && kq >= 2.0) {
      vec2 hn;
      s *= smoothstep(-0.7, 0.7, holes(qc, patT(kq), mod(kq, 2.0), hn));
    }
    return s;
  }
  return h;
}

// each sheet takes the nearest card of the mode's 8 (no in-between mixes: teal + orange would go muddy)
vec3 paper(float k) {
  float u = clamp(k / max(N - 1.0, 1.0), 0.0, 1.0);
  return texelFetch(tPal, ivec2(int(floor(u * 7.0 + 0.5)), int(ROW)), 0).rgb;
}

float fibres(vec2 cp, float seed) {
  float n = (vnoise(cp * 0.9 + seed) - 0.5) * 0.5 + (vnoise(cp * 0.22 + seed * 2.0) - 0.5) * 0.7;
  vec2 q = cp * 0.4 + seed * 3.0;
  vec2 r1 = mat2(0.8, 0.6, -0.6, 0.8) * q;
  vec2 r2 = mat2(0.28, -0.96, 0.96, 0.28) * q;
  float f = smoothstep(0.66, 0.92, vnoise(vec2(r1.x * 0.22, r1.y * 3.0)))
          + smoothstep(0.68, 0.93, vnoise(vec2(r2.x * 0.25, r2.y * 3.2)));
  return n * 0.06 + f * 0.035;
}

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 papercut(vec2 px, float frontD) {
  vec2 cp = px / uDpr;
  vec2 pw = px + warpAt(cp) * uDpr;
  float r = 1.6 * uDpr;
  float hc = heightAt(pw);
  float hx1 = heightAt(pw + vec2(r, 0.0)), hx0 = heightAt(pw - vec2(r, 0.0));
  float hy1 = heightAt(pw + vec2(0.0, r)), hy0 = heightAt(pw - vec2(0.0, r));
  float H = (2.0 * hc + hx1 + hx0 + hy1 + hy0) / 6.0;
  vec2 grad = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * r);
  float gl = max(length(grad), 1e-4);
  float k = clamp(floor(H), 0.0, N - 1.0);
  float dLow = k < 0.5 ? 1e4 : (H - k) / gl;      // to this sheet's own cut edge
  float dUp = k > N - 1.5 ? 1e4 : (k + 1.0 - H) / gl; // to the edge of the sheet above
  vec2 eN = -grad / gl;                           // outward normal of this sheet's edge
  float kLow = k - 1.0, kUp = k + 1.0;

  // 剪纸: one red sheet (阴阳刻). Shapes are separated by thin cut lines; the darkest level stays solid,
  // the middle levels are decorated with crescents / dots cut through to the cream ground, and the
  // brightest level is cut away entirely, leaving only a red outline rim. cutA = how much of this pixel
  // is cut away (shows the ground).
  float flatS = PA.w;
  float cutA = 0.0;
  if (PB.z > 0.5 && k >= 2.0) {
    float gap = 1.15 * uDpr;
    cutA = 1.0 - smoothstep(gap - 0.6 * uDpr, gap + 0.6 * uDpr, dLow);
    bool top = k > N - 1.5 && N > 2.5;
    // erosion probe: is this pixel more than E inside its own level?
    float E = (top ? 4.4 : 5.5) * uDpr;
    float m = 1e3;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982;
      m = min(m, heightAt(pw + vec2(cos(a), sin(a)) * E) - k);
    }
    float inner = smoothstep(-0.1, 0.1, m);
    if (top) {
      cutA = max(cutA, inner);
    } else {
      vec2 hn;
      float hs = holes(cp, patT(k), mod(k, 2.0), hn) * uDpr;
      cutA = max(cutA, inner * (1.0 - smoothstep(-0.7 * uDpr, 0.7 * uDpr, hs)));
    }
    dLow = 1e4;   // edges between red levels are drawn by cutA
  }
  if (flatS > 0.5 && k >= 1.0) dUp = 1e4;
  float own = flatS > 0.5 ? 0.0 : k;   // 剪纸: shadows are only computed for the ground

  // drop shadow from the sheets above (toward the light), plus contact shadow at the foot of each step
  float h = PA.x * uDpr;
  float sh = 0.0;
  for (int i = 0; i < uNS; i++) {
    float x = 0.45 + float(i) * 0.62;
    float hq = occH(px + uLight * h * x);
    float need = own + (flatS > 0.5 ? 0.5 : max(x, 0.9));
    float w = 0.18 + 0.16 * x;
    sh = max(sh, smoothstep(need - w, need + w, hq) * (1.0 - 0.13 * x));
  }
  float ao = 1.0 - smoothstep(0.0, h * 0.8, dUp);
  float shade = max(sh, ao * 0.55) * PA.y;
  float groundShade = shade;
  if (flatS > 0.5 && k >= 1.0) shade = 0.0;   // the red sheet itself is flat

  vec2 uv = px / uRes;
  vec3 col = paper(k);
  col *= 1.0 + fibres(cp, k * 7.3) * PB.x;
  // lightbox: light shining through the sheets from behind — translucent paper glows in its own colour,
  // the back sheets most, with a small warm core at the lamp
  if (PB.y > 0.01) {
    vec2 gd = (uv - uGlow) * vec2(uRes.x / uRes.y, 1.0);
    float g = exp(-dot(gd, gd) * 3.2);
    float back = 1.0 - k / max(N - 1.0, 1.0);
    col = min(col * (1.0 + PB.y * g * (0.15 + 1.7 * back * back * back)), vec3(1.0));
    col += vec3(1.0, 0.78, 0.45) * PB.y * exp(-dot(gd, gd) * 26.0) * 0.35 * back;
  }
  col *= 1.0 - shade * (vec3(1.0) - PC.rgb);
  // the cut edge: a thin lit rim where it faces the light, darker where it faces away
  float e = 1.0 - smoothstep(0.0, 1.6 * uDpr, dLow);
  float facing = dot(eN, uLight);
  col += PD.rgb * e * PA.z * (0.25 + 0.75 * max(facing, 0.0));
  col *= 1.0 - e * 0.22 * max(-facing, 0.0);

  // antialias across the nearest cut
  float aa = 0.9 * uDpr;
  if (dLow < dUp) {
    if (dLow < aa) {
      vec3 nb = paper(kLow) * (1.0 - PA.y * 0.6 * (vec3(1.0) - PC.rgb));
      col = mix(nb, col, 0.5 + 0.5 * dLow / aa);
    }
  } else if (dUp < aa) {
    vec3 nb = paper(kUp) + PD.rgb * PA.z * 0.5;
    col = mix(nb, col, 0.5 + 0.5 * dUp / aa);
  }

  // 剪纸: the cut-away parts show the (shadowed) cream ground
  if (cutA > 0.0) {
    vec3 gcol = paper(0.0) * (1.0 + fibres(cp, 0.0) * PB.x) * (1.0 - groundShade * (vec3(1.0) - PC.rgb));
    col = mix(col, gcol, cutA);
  }

  // scissor cut sweeping across on a mode change
  col *= 1.0 - 0.55 * (1.0 - smoothstep(0.6 * uDpr, 1.6 * uDpr, frontD));
  col *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 10.0 * uDpr, frontD - 1.0 * uDpr)) * step(0.0, frontD);
  return col;
}

vec3 stylize(vec2 px) {
  bool to = true;
  float frontD = 1e5;
  if (uMix < 1.0) {
    // sweep across the box when there is one, else across the screen
    float span = uBoxOn > 0.5 ? 2.0 * uBox.z * uDpr : uRes.x;
    float x0 = uBoxOn > 0.5 ? (uBox.x - uBox.z) * uDpr : 0.0;
    float wc = (px.x - x0) / span * 0.84 + (1.0 - px.y / uRes.y) * 0.16 + (vnoise(px / uDpr * 0.01) - 0.5) * 0.03;
    float f = wc - (uMix * 1.24 - 0.12);
    to = f <= 0.0;
    frontD = abs(f) * span / 0.84;
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  PC = to ? uTC : uFC;
  PD = to ? uTD : uFD;
  ROW = to ? uTo : uFrom;
  N = max(uLayers, 2.0);

  vec2 uv = px / uRes;
  if (uBoxOn < 0.5) {
    vec3 c = papercut(px, frontD);
    vec2 vq = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    return c * (1.0 - PB.w * 0.5 * smoothstep(0.3, 1.1, length(vq)));
  }

  // shadow box on a paper wall
  vec2 tl = vec2(px.x, uRes.y - px.y) / uDpr;
  vec2 Lt = vec2(uLight.x, -uLight.y);
  vec2 p = tl - uBox.xy;
  float sd = sdBox(p, uBox.zw, 10.0);
  float fw = clamp(min(uBox.z, uBox.w) * 0.07, 12.0, 22.0);
  vec3 col = vec3(0.0);
  if (sd < 1.0) {
    col = papercut(px, frontD);
    // the frame shades the inside of the box along the edges that face away from the light
    float fs = smoothstep(-4.0, 14.0, sdBox(p + Lt * 22.0, uBox.zw, 10.0));
    col *= 1.0 - 0.5 * fs - 0.12 * (1.0 - smoothstep(0.0, 26.0, -sd));
    vec2 vq = p / uBox.zw;
    col *= 1.0 - PB.w * 0.32 * smoothstep(0.45, 1.25, length(vq));
  }
  if (sd > -1.0) {
    vec3 o;
    if (sd < fw) {
      // painted wooden frame, lip on the inside, lit from the light side
      float t = sd / fw;
      vec2 gn = normalize(vec2(
        sdBox(p + vec2(1.0, 0.0), uBox.zw, 10.0) - sdBox(p - vec2(1.0, 0.0), uBox.zw, 10.0),
        sdBox(p + vec2(0.0, 1.0), uBox.zw, 10.0) - sdBox(p - vec2(0.0, 1.0), uBox.zw, 10.0)) + 1e-5);
      float lit = dot(gn, -Lt);
      o = uFrame * (0.94 + 0.05 * vnoise(tl * vec2(0.6, 0.08)));
      o *= 1.0 + 0.1 * lit * (1.0 - smoothstep(0.0, 0.3, t)) - 0.05;
      o *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.12, t));
      o *= 1.0 - 0.1 * smoothstep(0.85, 1.0, t);
    } else {
      // the wall, with the box's soft shadow
      o = uPage * (1.0 + fibres(tl, 91.0) * 0.8);
      float ds = sdBox(p + Lt * 18.0, uBox.zw + fw, 10.0);
      o *= 1.0 - 0.2 * (1.0 - smoothstep(-12.0, 34.0, ds));
    }
    col = sd <= -1.0 ? col : (sd >= 1.0 ? o : mix(col, o, smoothstep(-1.0, 1.0, sd)));
  }
  return col;
}
`

/* ------------------------------------------------------------------ factory + controls */

type Box = { x: number; y: number; halfWidth: number; halfHeight: number } | null
type State = { mode: PapercutMode; layers: number; layersT: number; t: number; box: Box; sweep: boolean }
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

export function createPapercutEffect(init: { mode?: PapercutMode; layers?: number } = {}): StylizeEffect {
  const mode = init.mode ?? 'lightbox'
  const layers = init.layers ?? 5
  const data = new Uint8Array(8 * 3 * 4)
  ORDER.forEach((m, mi) => PAPERS[m].forEach((hex, i) => data.set([...rgb(hex), 255], (mi * 8 + i) * 4)))
  const tPal = new THREE.DataTexture(data, 8, 3, THREE.RGBAFormat, THREE.UnsignedByteType)
  tPal.minFilter = tPal.magFilter = THREE.NearestFilter
  tPal.needsUpdate = true
  const v4 = () => new THREE.Vector4()
  const col = (hex: string) => new THREE.Vector3(...rgb(hex).map((c) => c / 255))
  const uniforms: U = {
    tPal: { value: tPal },
    uNS: { value: 5 },
    uTA: { value: v4() },
    uTB: { value: v4() },
    uTC: { value: v4() },
    uTD: { value: v4() },
    uFA: { value: v4() },
    uFB: { value: v4() },
    uFC: { value: v4() },
    uFD: { value: v4() },
    uFrom: { value: MODE_INDEX[mode] },
    uTo: { value: MODE_INDEX[mode] },
    uMix: { value: 1 },
    uLayers: { value: layers },
    uLight: { value: new THREE.Vector2(-0.6, 0.8) },
    uGlow: { value: new THREE.Vector2(0.5, 0.62) },
    uDepthMix: { value: 0 },
    uDepthRange: { value: new THREE.Vector2(1, 20) },
    uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uBoxOn: { value: 0 },
    uPage: { value: col('#efe7da') },
    uFrame: { value: col('#f8f5ef') },
  }
  const st: State = { mode, layers, layersT: layers, t: 0, box: null, sweep: true }
  STATE.set(uniforms, st)
  const copy = (to: string, idx: number) => {
    const P = MODE_PARAMS[ORDER[idx]]
    ;(uniforms[to + 'A'].value as THREE.Vector4).fromArray(P.A)
    ;(uniforms[to + 'B'].value as THREE.Vector4).fromArray(P.B)
    ;(uniforms[to + 'C'].value as THREE.Vector4).fromArray(P.C)
    ;(uniforms[to + 'D'].value as THREE.Vector4).fromArray(P.D)
  }
  const sync = () => {
    copy('uT', uniforms.uTo.value)
    copy('uF', uniforms.uFrom.value)
  }
  sync()
  return {
    frag: FRAG,
    uniforms,
    normals: true,
    background: papercutMeta.background,
    update(dt, ctx) {
      const u = uniforms
      st.t += dt
      if (u.uMix.value < 1) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 1.3)
        if (u.uMix.value >= 1) u.uFrom.value = u.uTo.value
      }
      st.layers += (st.layersT - st.layers) * (1 - Math.exp(-dt * 3.2))
      if (Math.abs(st.layers - st.layersT) < 2e-3) st.layers = st.layersT
      u.uLayers.value = st.layers
      sync()
      // idle light sweep: from the upper left, swinging slowly toward the top
      const t = st.t
      const a = (st.sweep ? 2.25 + Math.sin(t * 0.21) * 0.5 : 2.25)
      ;(u.uLight.value as THREE.Vector2).set(Math.cos(a), Math.sin(a))
      // lightbox glow drifts a little (follows the box when there is one)
      let gx = 0.56,
        gy = 0.6
      if (st.box) {
        const W = ctx.width / ctx.dpr
        const H = ctx.height / ctx.dpr
        gx = st.box.x / W + (st.box.halfWidth / W) * 0.25
        gy = 1 - (st.box.y - st.box.halfHeight * 0.25) / H
      }
      ;(u.uGlow.value as THREE.Vector2).set(gx + Math.sin(t * 0.17) * 0.06, gy + Math.sin(t * 0.23 + 1) * 0.04)
    },
  }
}

/** switch paper style: a scissor cut sweeps across */
export function setPapercutMode(fx: StylizeEffect, mode: PapercutMode) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st || st.mode === mode) return
  st.mode = mode
  if (u.uMix.value >= 0.5) u.uFrom.value = u.uTo.value
  u.uTo.value = MODE_INDEX[mode]
  u.uMix.value = 0
}

/** number of sheets in the stack (4–7); the cuts slide to their new places */
export function setPapercutLayers(fx: StylizeEffect, n: number) {
  const st = stateOf(fx)
  if (st) st.layersT = n
}

/** mix depth into the stack order: 0 = lightness only (default); near / far = view depth of front / back */
export function setPapercutDepth(fx: StylizeEffect, mix: number, near = 1, far = 20) {
  const u = fx.uniforms as U
  u.uDepthMix.value = mix
  ;(u.uDepthRange.value as THREE.Vector2).set(near, far)
}

/** put the paper in a framed shadow box on a wall (CSS px, from the top left); null = full screen */
export function setPapercutBox(fx: StylizeEffect, box: Box) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st) return
  st.box = box
  u.uBoxOn.value = box ? 1 : 0
  if (box) (u.uBox.value as THREE.Vector4).set(box.x, box.y, box.halfWidth, box.halfHeight)
}

/** stop / resume the idle light sweep (e.g. while the visitor drags the light) */
export function setPapercutSweep(fx: StylizeEffect, on: boolean) {
  const st = stateOf(fx)
  if (st) st.sweep = on
}
