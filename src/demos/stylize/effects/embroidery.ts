import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 刺绣针脚 — the scene is re-made as hand embroidery on cloth.
 *
 *  1. Thread regions. Every sample is snapped to a 28-colour thread card in OKLab (chroma weighted a
 *     little above lightness so hue decides the "family"). A stitch takes ONE colour (sampled at its own
 *     centre) and is clipped to its colour family, so regions end in clean edges; a pixel keeps the
 *     stitch's family when it is within a small margin of it (spatial hysteresis → whole stitches,
 *     boundaries that don't crawl).
 *  2. Satin stitches. The screen is tiled by jittered cells (CSS px × uDpr); each cell lays a small
 *     patch of parallel stitches whose direction comes from the structure tensor of the projected normal
 *     (so stitches run perpendicular to silhouettes and wrap round forms; axial, so ± normals agree),
 *     constant for the whole patch (= stable rows). Stitch length is capped (~1.0–1.4 cells, i.e. 3–6 mm
 *     at the nominal scale); patches overlap in a random order, so long areas become split /
 *     long-and-short stitching with staggered ends. Each stitch is a raised cylinder: twisted plies,
 *     anisotropic Kajiya–Kay sheen along the fibres under a slowly drifting light, dimples where it
 *     dives into its needle holes, and the stitches above cast short shadows onto those below.
 *  3. Outlines: stem stitch (rope of slanted stitches) or back stitch along silhouettes, depth steps,
 *     creases and strong colour borders, in a darker thread.
 *  4. Cloth: woven linen / silk / denim (twill) with slubs, shadow + puckering around the embroidery;
 *     optional felt patch with a merrowed satin border (denim mode) and an embroidery hoop on a table.
 *
 * Modes: 缎面绣 glossy floss on linen · 苏绣 split silk, two-colour alternating long-and-short shading
 * on silk · 牛仔补丁 chunky cotton on denim with a felt patch.
 * Mode changes sweep the new cloth across and stitch the picture in again (穿针); `stitchInEmbroidery`
 * replays that from bare cloth.
 */

export type EmbroideryMode = 'satin' | 'suzhou' | 'denim'

export const embroideryModes: { id: EmbroideryMode; label: string; en: string }[] = [
  { id: 'satin', label: '缎面绣', en: 'Satin stitch' },
  { id: 'suzhou', label: '苏绣', en: 'Suzhou' },
  { id: 'denim', label: '牛仔补丁', en: 'Denim patch' },
]

export const embroideryMeta = { title: '刺绣针脚', en: 'Embroidery', background: '#efe9df', theme: 'light' as const }

/* ------------------------------------------------------------------ thread card (sRGB) */

// family: 0 white/grey · 1 red · 2 pink · 3 orange · 4 yellow · 5 green · 6 teal · 7 blue · 8 purple · 9 brown
export const THREAD_PALETTE: { hex: string; fam: number }[] = [
  { hex: '#fbf8f1', fam: 0 },
  { hex: '#d6d0c4', fam: 0 },
  { hex: '#8c867c', fam: 0 },
  { hex: '#2f2b29', fam: 0 },
  { hex: '#f2836b', fam: 1 },
  { hex: '#e0392b', fam: 1 },
  { hex: '#a81c2c', fam: 1 },
  { hex: '#6a1424', fam: 1 },
  { hex: '#f8c6d4', fam: 2 },
  { hex: '#ee86aa', fam: 2 },
  { hex: '#cf4680', fam: 2 },
  { hex: '#962a5a', fam: 2 },
  { hex: '#fdd497', fam: 3 },
  { hex: '#f6a033', fam: 3 },
  { hex: '#dc6519', fam: 3 },
  { hex: '#e9b922', fam: 4 },
  { hex: '#cfe69a', fam: 5 },
  { hex: '#88c053', fam: 5 },
  { hex: '#3d8c3c', fam: 5 },
  { hex: '#1f5531', fam: 5 },
  { hex: '#1f8f88', fam: 6 },
  { hex: '#a9c8ef', fam: 7 },
  { hex: '#4f7fd0', fam: 7 },
  { hex: '#22397e', fam: 7 },
  { hex: '#c4aee6', fam: 8 },
  { hex: '#7d55b8', fam: 8 },
  { hex: '#d9b48a', fam: 9 },
  { hex: '#8a5a31', fam: 9 },
]
// order in which colour regions are stitched by the 穿针 animation (per family, 0 first)
const FAMILY_ORDER = [0.62, 0.55, 0.85, 0.45, 0.78, 0.0, 0.12, 0.18, 0.75, 0.3]

// per-mode parameters (see the uniform comments in the shader)
const MODE_PARAMS: Record<EmbroideryMode, { A: number[]; B: number[]; C: number[]; D: number[] }> = {
  //            cell  width gloss twist      dither outlineW dark holes   fabric patch sheenExp groove   slant strands filament pucker
  satin: { A: [15, 2.4, 0.62, 0.16], B: [0.55, 2.6, 0.5, 0.2], C: [0, 0, 34, 0.16], D: [1, 3, 0.1, 1] },
  suzhou: { A: [11, 1.55, 0.5, 0.05], B: [1.0, 1.5, 0.66, 0.15], C: [1, 0, 60, 0.07], D: [0, 2, 0.2, 0.6] },
  denim: { A: [18, 3.5, 0.13, 0.62], B: [0.0, 3.4, 0.42, 1.0], C: [2, 1, 6, 0.42], D: [1, 2, 0.04, 1.3] },
}
const MODE_INDEX: Record<EmbroideryMode, number> = { satin: 0, suzhou: 1, denim: 2 }

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const v3 = (hex: string) => new THREE.Vector3(...rgb(hex))
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
function oklab(hex: string) {
  const [r, g, b] = rgb(hex).map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return new THREE.Vector3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  )
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
#define NP ${THREAD_PALETTE.length}
#define PI 3.14159265
// thread card as an NP×2 float texture (fetched — dynamically indexed uniform arrays become long switch
// chains on ANGLE/D3D): row 0 = OKLab + family, row 1 = sRGB + stitch-in order of the family
uniform sampler2D tPal;
uniform int uNP;   // palette size and patch count as uniforms: keeps ANGLE/FXC from unrolling the loops
uniform int uN9;
// parameters of the incoming (T) and outgoing (F) mode:
//  A cell (CSS px), thread width (CSS px), gloss, fibre twist angle
//  B two-colour dither, outline width (CSS px), outline darkness, needle-hole depth
//  C cloth (0 linen · 1 silk · 2 denim), felt patch, sheen exponent, ply groove depth
//  D outline slant (0 back stitch · 1 stem stitch), strands, filament striation, puckering
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uTC; uniform vec4 uTD;
uniform vec4 uFA; uniform vec4 uFB; uniform vec4 uFC; uniform vec4 uFD;
uniform float uDensity;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uFromEmpty;
uniform vec4 uHoop;    // centre (CSS px from the top left), radius (CSS px), on
uniform vec3 uLinen;
uniform vec3 uSilk;
uniform vec3 uDenim;
uniform vec3 uWeft;
uniform vec3 uFelt;
uniform vec3 uBorder;
uniform vec3 uTable;
uniform vec3 uWood;

vec3 LIGHT;     // screen-space light (x right, y up, z to the viewer), drifts slowly
vec2 SD;        // unit direction shadows fall in (screen)
vec2 CP;        // CSS px, y up
vec2 HC;        // hoop centre, CSS px, y up
float HR;
float HON;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

// explicit-LOD fetches: no implicit derivatives, so the loops below can stay rolled in ANGLE's HLSL
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }
float covL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0).a; }
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec4 palA(int i) { return texelFetch(tPal, ivec2(i, 0), 0); }
vec4 palB(int i) { return texelFetch(tPal, ivec2(i, 1), 0); }

vec3 toLab(vec3 c) {
  vec3 l = srgbToLinear(c);
  vec3 lms = vec3(
    0.4122214708 * l.r + 0.5363325363 * l.g + 0.0514459929 * l.b,
    0.2119034982 * l.r + 0.6806995451 * l.g + 0.1073969566 * l.b,
    0.0883024619 * l.r + 0.2817188376 * l.g + 0.6299787005 * l.b);
  lms = pow(max(lms, vec3(1e-6)), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}
float palDist(vec3 a, vec3 b) { vec3 d = a - b; return d.x * d.x * 0.6 + (d.y * d.y + d.z * d.z) * 2.0; }
// nearest thread and the runner-up
void classify(vec3 lab, out int i1, out int i2, out float d1, out float d2) {
  d1 = 1e9; d2 = 1e9; i1 = 0; i2 = 0;
  for (int i = 0; i < uNP; i++) {
    float d = palDist(lab, palA(i).xyz);
    if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; }
    else if (d < d2) { d2 = d; i2 = i; }
  }
}

// 0..1 order across the work (upper left → lower right) used by the stitch-in animation
float sweep(vec2 px) {
  vec2 p = px / uDpr;
  if (HON > 0.5) return clamp(dot(p - HC, vec2(0.7071, -0.7071)) / (2.0 * HR) + 0.5, 0.0, 1.0);
  return wipeCoord(px);
}

/* ---------------------------------------------------------------- cloth */

// woven height field: x = thread height (0 in the gaps), y = 1 where the vertical (warp) thread is on top,
// z = id of the visible thread
vec3 weave(vec2 cp, float P, float twill, float slub) {
  vec2 g = cp / P;
  vec2 id = floor(g), f = fract(g);
  float warpTop = twill > 0.5 ? step(mod(id.x - id.y, 4.0), 2.5) : step(mod(id.x + id.y, 2.0), 0.5);
  float sx = vnoise(vec2(id.x * 3.1, cp.y * 0.045)), sy = vnoise(vec2(cp.x * 0.045, id.y * 3.1 + 40.0));
  float wx = 0.4 + slub * (sx - 0.5), wy = 0.4 + slub * (sy - 0.5);
  float ax = abs(f.x - 0.5), ay = abs(f.y - 0.5);
  float pX = sqrt(max(1.0 - ax * ax / (wx * wx), 0.0));
  float pY = sqrt(max(1.0 - ay * ay / (wy * wy), 0.0));
  float h = warpTop > 0.5
    ? max(pX * (0.74 + 0.26 * sin(PI * f.y)), pY * 0.45)
    : max(pY * (0.74 + 0.26 * sin(PI * f.x)), pX * 0.45);
  float tid = warpTop > 0.5 ? id.x : id.y + 517.0;
  // sub-3-px weaves alias: fade toward the average
  h = mix(h, 0.62, smoothstep(3.6, 2.2, P * uDpr));
  return vec3(h, warpTop, tid);
}

// linen (plain weave, irregular slubbed threads, flax flecks) · silk (fine even weave, broad slow lustre) ·
// denim (3/1 twill, indigo warp with ring-dyed fading streaks, ecru weft peeking through)
vec3 fabricAt(vec2 cp, float type) {
  bool lin = type < 0.5, silk = type > 0.5 && type < 1.5;
  vec3 w = weave(cp, lin ? 3.2 : (silk ? 2.0 : 2.4), lin || silk ? 0.0 : 1.0, lin ? 0.24 : (silk ? 0.05 : 0.16));
  float along = w.y > 0.5 ? cp.y : cp.x;
  if (lin) {
    float tone = 0.93 + 0.1 * hash12(vec2(w.z, 3.0)) - 0.05 * vnoise(vec2(w.z * 1.7, along * 0.08));
    float fleck = step(0.992, hash12(vec2(w.z, floor(along / 7.0))));
    vec3 c = uLinen * tone * (0.7 + 0.36 * w.x);
    c = mix(c, c * vec3(0.72, 0.66, 0.58), fleck * w.x);
    return c * (0.97 + 0.05 * vnoise(cp * 0.012));
  }
  if (silk) {
    float lustre = 0.5 + 0.5 * sin(cp.x * 0.006 + cp.y * 0.0035 + 2.0 * vnoise(cp * 0.004) + LIGHT.x * 2.5);
    return uSilk * (0.9 + 0.12 * w.x) + vec3(0.05, 0.045, 0.04) * lustre * (w.y > 0.5 ? 1.0 : 0.6);
  }
  float fade = vnoise(vec2(w.z * 0.9, cp.y * 0.012)) * 0.6 + vnoise(cp * vec2(0.01, 0.003)) * 0.4;
  vec3 warp = uDenim * (0.78 + 0.5 * fade) * (0.94 + 0.12 * hash12(vec2(w.z, 9.0)));
  return mix(uWeft * (0.8 + 0.25 * fade), warp, w.y) * (0.62 + 0.46 * w.x);
}

vec3 felt(vec2 cp) {
  float n = vnoise(cp * 0.35) * 0.45 + vnoise(cp * 1.3 + 7.0) * 0.35 + hash12(floor(cp * 1.4)) * 0.2;
  vec2 q = cp * 0.25;
  float fib = smoothstep(0.82, 1.0, vnoise(q * vec2(1.0, 6.0) + vnoise(q) * 3.0)) * 0.5
            + smoothstep(0.82, 1.0, vnoise(q.yx * vec2(1.0, 6.0) + 11.0)) * 0.5;
  return uFelt * (0.86 + 0.2 * n) + fib * 0.05;
}

/* ---------------------------------------------------------------- stitches */

// patch direction: structure tensor (axial, so the two sides of a ridge agree) of
//  · the projected normal → stitches run perpendicular to silhouettes and wrap round forms
//  · the colour gradient → stitches run from light to dark across shading bands (long-and-short)
// a gentle diagonal where neither says anything
vec2 cellDir(vec2 c, float S) {
  vec2 T = vec2(-0.342, 0.94) * 0.025;
  vec2 o1 = vec2(0.69, 0.4) * S, o2 = vec2(-0.4, 0.69) * S;   // orthogonal, |o| = 0.8 S
  float l0 = 0.0, l1 = 0.0, l2 = 0.0;
  for (int k = 0; k < 3; k++) {
    vec2 p = c + (k == 0 ? vec2(0.0) : (k == 1 ? o1 : o2));
    vec4 n = nrmL(p);
    float l = luma(sceneL(p));
    if (k == 0) l0 = l; else if (k == 1) l1 = l; else l2 = l;
    if (n.a > 0.5) {
      vec2 v = n.xy * 2.0 - 1.0;
      T += vec2(v.x * v.x - v.y * v.y, 2.0 * v.x * v.y);
    }
  }
  vec2 g = (l1 - l0) * normalize(o1) + (l2 - l0) * normalize(o2);
  float gl = length(g);
  if (gl > 1e-4) {
    vec2 u = g / gl;
    T += vec2(u.x * u.x - u.y * u.y, 2.0 * u.x * u.y) * 0.3 * smoothstep(0.012, 0.05, gl);
  }
  float ang = 0.5 * atan(T.y, T.x);
  ang = floor(ang / (PI / 24.0) + 0.5) * (PI / 24.0);   // 7.5° steps: rows stay put while things move
  return vec2(cos(ang), sin(ang));
}

// one stitch of patch \`id\` (centre c, direction d) at offset q from c:
// (along −1..1, across −1..1, row offset from c in px, along px). Rows sit on a grid shared by every patch
// with the same direction, so neighbouring patches continue each other's rows (split / long-and-short).
vec4 stitchAt(vec2 q, vec2 c, vec2 d, vec2 id, float S, float W, float RH, out float off, out float hl) {
  vec2 nv = vec2(-d.y, d.x);
  float u = dot(q, d);
  float vc = dot(c, nv), v = vc + dot(q, nv);
  float r0 = floor(vc / W + 0.5);
  float r = clamp(floor(v / W + 0.5), r0 - RH, r0 + RH);
  float h1 = hash12(id * 1.37 + vec2(r * 0.731, r * 0.0913) + 3.1);
  float h2 = hash12(id * 2.11 + vec2(r * 0.1317, r * 0.519) + 7.7);
  off = (h1 - 0.5) * 0.7 * S;          // staggered ends (long-and-short)
  hl = S * (0.5 + 0.25 * h2);           // half length
  return vec4((u - off) / hl, (v - r * W) / (0.5 * W), r * W - vc, u - off);
}
bool covered(vec4 g) { return abs(g.x) < 1.0 && abs(g.y) < 0.95 - 0.22 * smoothstep(0.8, 1.0, abs(g.x)); }

// a raised, twisted thread; a, s = along / across (−1..1), d / nv = its screen directions
vec3 shadeThread(vec3 base, vec2 d, vec2 nv, float a, float s, float alongPx, float seed, float W,
                 vec4 A, vec4 B, vec4 C, vec4 D) {
  float h = sqrt(max(1.0 - s * s, 0.0));
  float dip = smoothstep(0.62, 1.0, abs(a));
  vec3 N = normalize(vec3(nv * s * 0.95 + d * sign(a) * dip * 0.35, h + 0.12));
  // plies twisted round the thread → slanted grooves
  float ph = alongPx / (W * 2.4) + s * D.y * 0.22 + seed * 5.0;
  float ply = 0.5 + 0.5 * cos(2.0 * PI * ph);
  float groove = 1.0 - C.w * (1.0 - smoothstep(0.0, 0.55, ply));
  float fil = 1.0 - D.z * (0.5 + 0.5 * sin(s * 11.0 + seed * 20.0 + ph * 0.7));
  // Kajiya–Kay sheen along the fibres (they lean by the twist angle; each ply shifts the highlight)
  vec3 T = normalize(vec3(d * cos(A.w) + nv * sin(A.w), 0.0));
  T = normalize(T - N * dot(T, N) + N * (ply - 0.5) * 0.5);
  vec3 H = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
  float th = dot(T, H);
  float kk = pow(sqrt(max(1.0 - th * th, 0.0)), C.z);
  float diff = max(dot(N, LIGHT), 0.0);
  vec3 c = base * (0.56 + 0.62 * diff) * groove * fil;
  c += mix(vec3(1.0), base, 0.3) * kk * A.z * (0.7 + 0.3 * ply) * h;
  // the thread dives into its needle hole
  c *= 1.0 - (0.04 + 0.5 * B.w) * dip * dip;
  c *= 0.7 + 0.3 * smoothstep(0.0, 0.45, h);
  return c;
}

/* ---------------------------------------------------------------- outlines */

vec3 EC;  // darker side's colour
// x = edge strength, y = tangent angle
vec2 edgeAt(vec2 px, float r) {
  vec2 dx = vec2(r, 0.0), dy = vec2(0.0, r);
  vec3 cL = sceneL(px - dx), cR = sceneL(px + dx), cD = sceneL(px - dy), cU = sceneL(px + dy);
  vec4 nL = nrmL(px - dx), nR = nrmL(px + dx), nD = nrmL(px - dy), nU = nrmL(px + dy);
  vec3 lL = toLab(cL), lR = toLab(cR), lD = toLab(cD), lU = toLab(cU);
  float i0 = 1.0 / depthL(px);
  float iL = 1.0 / depthL(px - dx), iR = 1.0 / depthL(px + dx), iD = 1.0 / depthL(px - dy), iU = 1.0 / depthL(px + dy);
  vec3 wl = vec3(0.6, 1.3, 1.3);
  vec3 gxc = (lR - lL) * wl * min(nL.a, nR.a), gyc = (lU - lD) * wl * min(nD.a, nU.a);
  float gxv = nR.a - nL.a, gyv = nU.a - nD.a;
  float im = max(max(i0, max(iL, iR)), max(iD, iU));
  float gxz = (iR - iL) / im * 5.0, gyz = (iU - iD) / im * 5.0;
  float lap = max(abs(iL + iR - 2.0 * i0), abs(iD + iU - 2.0 * i0)) / im;
  vec3 gxn = (nR.xyz - nL.xyz) * min(nL.a, nR.a), gyn = (nU.xyz - nD.xyz) * min(nD.a, nU.a);
  float eC = smoothstep(0.1, 0.17, max(length(gxc), length(gyc)));
  float eS = max(abs(gxv), abs(gyv));
  float eZ = smoothstep(0.035, 0.09, lap);
  float eN = smoothstep(0.16, 0.28, max(length(gxn), length(gyn)));
  float e = max(max(eS, eZ), max(eC * 0.85, eN * 0.75));
  float jxx = dot(gxc, gxc) + gxv * gxv + gxz * gxz + dot(gxn, gxn);
  float jyy = dot(gyc, gyc) + gyv * gyv + gyz * gyz + dot(gyn, gyn);
  float jxy = dot(gxc, gyc) + gxv * gyv + gxz * gyz + dot(gxn, gyn);
  float ang = 0.5 * atan(2.0 * jxy, jxx - jyy) + 0.5 * PI;
  // the darker (covered) side's colour
  float bl = 9.0;
  EC = cL;
  if (nL.a > 0.5 && luma(cL) < bl) { bl = luma(cL); EC = cL; }
  if (nR.a > 0.5 && luma(cR) < bl) { bl = luma(cR); EC = cR; }
  if (nD.a > 0.5 && luma(cD) < bl) { bl = luma(cD); EC = cD; }
  if (nU.a > 0.5 && luma(cU) < bl) { bl = luma(cU); EC = cU; }
  return vec2(e, ang);
}

/* ---------------------------------------------------------------- one mode, one pass */

vec3 embroider(vec2 px, vec3 cloth, vec4 A, vec4 B, vec4 C, vec4 D, float rev, float sig) {
  float dens = uDensity;
  float S = A.x * dens * uDpr;
  float W = A.y * mix(1.0, dens, 0.6) * uDpr;
  float RH = max(floor(0.7 * S / W + 0.5), 1.0);
  float cov = covL(px);

  // the one thread shaded in this pass (felt-patch border or satin stitch): colour, frame, coordinates
  float draw = 0.0, dim = 1.0;
  vec3 bCol = vec3(0.0);
  vec2 bD = vec2(1.0, 0.0);
  vec4 bG = vec4(0.0);    // along, across, -, along px
  float bSeed = 0.0;
  vec4 bB = B;

  /* cloth (+ felt patch) */
  vec3 col = cloth;
  if (C.y > 0.5) {
    vec2 pc = HON > 0.5 ? HC : uRes / uDpr * 0.5;
    float PR = HON > 0.5 ? HR * 0.88 : min(uRes.x, uRes.y) / uDpr * 0.45;
    vec2 rel = CP - pc;
    float rp = length(rel);
    float bw = 12.0 * sqrt(dens);
    if (rp < PR - bw) {
      col = felt(CP);
    } else if (rp < PR) {
      // merrowed border: dense satin wrapped over the felt edge
      vec2 rd = rel / max(rp, 1e-3);
      float Wb = W / uDpr;
      float N = floor(2.0 * PI * PR / Wb);
      float th = atan(rel.y, rel.x) / (2.0 * PI) + 0.5;
      float a = (rp - (PR - bw * 0.5)) / (bw * 0.5);
      float ph = th * N + a * 0.35;
      float s = fract(ph) * 2.0 - 1.0;
      draw = 1.0;
      bCol = uBorder; bD = rd; bG = vec4(a * 0.82, s, 0.0, rp * uDpr); bSeed = hash12(vec2(floor(ph), 3.0));
      bB = vec4(B.xyz, 0.0);
    } else {
      float ps = length(CP - SD * 5.0 - pc);
      col *= 1.0 - 0.38 * (1.0 - smoothstep(PR - 2.0, PR + 6.0, ps));
    }
  }
  // embroidery shadow on the cloth + puckering where the stitching pulls it
  if (cov < 0.5) {
    float sh = (covL(px - SD * 2.0 * uDpr) + covL(px - SD * 4.0 * uDpr) + covL(px - SD * 7.0 * uDpr)) / 3.0;
    float near = 0.0;
    for (int k = 0; k < 6; k++) {
      float an = float(k) * 1.0472 + 0.3;
      near += covL(px + vec2(cos(an), sin(an)) * 13.0 * uDpr);
    }
    near /= 6.0;
    vec2 pcn = HON > 0.5 ? HC : uRes / uDpr * 0.5;
    vec2 rr = CP - pcn;
    float wr = sin(atan(rr.y, rr.x) * 48.0 + vnoise(CP * 0.03) * 5.0);
    // only once the stitching nearby has (probably) been done
    float done = smoothstep(0.0, 0.25, rev - 0.5 * sig - 0.4);
    float st = min(sh * 1.3, 1.0) * done;
    near *= done;
    dim = (1.0 - 0.3 * st) * (1.0 - 0.07 * near * D.w) * (1.0 + 0.06 * near * D.w * wr);
    col *= dim;
  }

  /* satin stitches */
  if (cov > 0.5) {
    vec3 pLab = toLab(sceneL(px));
    int p1, p2;
    float pd1, pd2;
    classify(pLab, p1, p2, pd1, pd2);
    float pFam = palA(p1).w;

    vec2 so = SD * 0.42 * W;
    vec2 g0 = floor(px / S);
    float reach = 1.5 * S;
    float bestP = -1.0, fbP = -1.0;
    vec2 fD = vec2(1.0, 0.0);
    vec4 fG = vec4(0.0);
    float fSeed = 0.0;
    float shMax = -1.0;   // highest priority among the stitches whose shadow falls here
    float nOver = 9.0;
    vec2 nD = vec2(1.0, 0.0);
    vec4 nG = vec4(0.0);
    for (int k = 0; k < uN9; k++) {
      {
        vec2 id = g0 + vec2(float(k - (k / 3) * 3 - 1), float(k / 3 - 1));
        vec2 c = (id + 0.5 + (hash22(id) - 0.5) * 0.6) * S;
        vec2 q = px - c;
        if (max(abs(q.x), abs(q.y)) > reach) continue;
        float prio = hash12(id + 17.31);
        vec2 d = cellDir(c, S);
        float off, hl;
        vec4 gs = stitchAt(q - so, c, d, id, S, W, RH, off, hl);
        if (covered(gs)) shMax = max(shMax, prio);
        vec4 gg = stitchAt(q, c, d, id, S, W, RH, off, hl);
        float over = max(abs(gg.x) - 1.0, abs(gg.y) - 0.95);
        if (over < nOver) { nOver = over; nD = d; nG = gg; }
        if (!covered(gg)) continue;
        float seed = hash12(id * 3.7 + gg.z * 0.137);
        if (prio > fbP) { fbP = prio; fD = d; fG = gg; fSeed = seed; }
        if (prio <= bestP) continue;
        vec2 nv = vec2(-d.y, d.x);
        vec2 sc = c + d * off + nv * gg.z;   // the stitch's own centre: one colour per stitch
        if (covL(sc) < 0.5) continue;
        vec3 sLab = toLab(sceneL(sc));
        int s1, s2;
        float sd1, sd2;
        classify(sLab, s1, s2, sd1, sd2);
        // clipped to its colour family (hysteresis: the pixel adopts the stitch's thread when close)
        vec4 pa1 = palA(s1);
        if (abs(pa1.w - pFam) > 0.5 && palDist(pLab, pa1.xyz) > pd1 + 0.0025) continue;
        // 穿针: stitched region by region, each stitch drawn from one hole to the other
        float key = 0.5 * sweep(sc) + 0.38 * palB(s1).w + 0.12 * seed;
        float prog = clamp((rev - key) / 0.06, 0.0, 1.0);
        if (gg.x * (seed > 0.5 ? 1.0 : -1.0) > -1.0 + 2.0 * prog) continue;
        // long-and-short shading: some stitches take the runner-up thread
        float tt = sd1 / max(sd1 + sd2, 1e-6);
        float pick = 0.5 * smoothstep(0.5 - 0.5 * B.x, 0.501, tt) * step(sd2, 0.03) * step(abs(palA(s2).w - pa1.w), 0.5);
        int ci = hash12(id * 5.1 + gg.z * 0.17 + 0.3) < pick ? s2 : s1;
        bestP = prio; bD = d; bG = gg; bCol = palB(ci).rgb; bSeed = seed;
      }
    }
    float topP = -1.0;
    dim = 1.0;
    if (bestP >= 0.0) {
      draw = 1.0;
      topP = bestP;
    } else if (fbP >= 0.0) {
      // thin features / borders: the top stitch here, in this pixel's own thread
      vec4 pb = palB(p1);
      float key = 0.5 * sig + 0.38 * pb.w + 0.12 * fSeed;
      float prog = clamp((rev - key) / 0.06, 0.0, 1.0);
      if (fG.x * (fSeed > 0.5 ? 1.0 : -1.0) <= -1.0 + 2.0 * prog) {
        draw = 1.0;
        topP = fbP;
        bCol = pb.rgb; bD = fD; bG = fG; bSeed = fSeed;
      }
    } else if (rev > 1.0) {
      // no stitch lands here: the nearest one, a little longer
      draw = 1.0;
      dim = 0.85;
      bCol = palB(p1).rgb; bD = nD; bG = vec4(clamp(nG.xy, -0.9, 0.9), nG.zw); bSeed = 0.5;
    }
    // stitches lying above this one cast short shadows on it
    dim *= 1.0 - 0.13 * step(topP + 1e-4, shMax) * smoothstep(1.0, 1.2, rev);
    col *= dim;
  }
  // one shading call site for border and stitch (every call is inlined by the HLSL compiler)
  if (draw > 0.5) col = shadeThread(bCol, bD, vec2(-bD.y, bD.x), bG.x, bG.y, bG.w, bSeed, W, A, bB, C, D) * dim;

  /* outlines (stem / back stitch) */
  float r = max(B.y * 0.5 * sqrt(dens) * uDpr, 0.8);
  vec2 eg = edgeAt(px, r);
  float ovis = smoothstep(0.0, 0.05, rev - (0.72 + 0.28 * sig));
  float e = smoothstep(0.4, 0.65, eg.x) * ovis;
  if (e > 0.0) {
    float ang = floor(eg.y / (PI / 8.0) + 0.5) * (PI / 8.0);
    vec2 t = vec2(cos(ang), sin(ang));
    vec2 tn = vec2(-t.y, t.x);
    float Ow = 2.0 * r;
    float al = dot(px, t) / (Ow * 1.5);
    float ac = dot(px, tn) / (Ow * 1.5);
    vec3 oc = EC * B.z;
    oc = clamp(mix(vec3(luma(oc)), oc, 1.25), 0.0, 1.0);
    // stem stitch: overlapping slanted stitches → a twisted rope; back stitch: short dashes end to end
    bool stem = D.x > 0.5;
    float ph = stem ? al + ac * 1.1 : al * 0.42;
    float f2 = fract(ph) * 2.0 - 1.0;
    vec2 od = stem ? normalize(t + tn * 0.6) : t;
    vec2 on = stem ? normalize(tn - t * 0.6) : tn;
    vec3 thr = shadeThread(oc, od, on, stem ? 0.0 : f2 * 1.08, stem ? f2 : 0.0, al * Ow, floor(ph) * 0.37, Ow * 0.8, A, B, C, D);
    col = mix(col, thr, e);
  }
  return col;
}

/* ---------------------------------------------------------------- hoop + table */

vec3 tableAt(vec2 cp) {
  float plank = floor(cp.y / 150.0);
  float y = cp.y - plank * 150.0;
  float g = vnoise(vec2(cp.x * 0.004 + plank * 13.0, y * 0.11)) * 0.6 + vnoise(vec2(cp.x * 0.02, y * 0.5 + plank)) * 0.4;
  vec3 c = uTable * (0.95 + 0.05 * hash12(vec2(plank, 2.0))) * (0.95 + 0.07 * g);
  c *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 1.6, y)) - 0.05 * (1.0 - smoothstep(0.0, 1.2, 150.0 - y));
  return c;
}

vec3 outside(vec2 rel, float rho, float fabT, vec3 cloth) {
  float RW = clamp(HR * 0.075, 11.0, 28.0);
  vec2 dir = rel / max(rho, 1e-3);
  vec3 col = tableAt(CP);
  // the cloth hangs out past the ring, frayed at its edge; shadows on the table
  float M = HR * 0.12 * (0.75 + 0.5 * vnoise(dir * 2.4 + 5.0));
  float fe = HR + RW + M;
  float rs = length(rel - SD * 9.0);
  col *= 1.0 - 0.2 * (1.0 - smoothstep(fe - 8.0, fe + 10.0, rs));
  float fray = (hash12(vec2(floor(atan(rel.y, rel.x) * HR * 0.6), 1.0)) - 0.5) * (fabT > 0.5 && fabT < 1.5 ? 1.2 : 3.0);
  if (rho < fe + 3.0) {
    vec3 f = cloth;
    float ang = atan(rel.y, rel.x);
    float fold = sin(ang * 23.0 + vnoise(dir * 4.0) * 6.0);
    f *= 1.0 + 0.07 * fold * smoothstep(HR + RW, fe, rho);
    f *= 1.0 - 0.32 * (1.0 - smoothstep(HR + RW - 3.0, HR + RW + 9.0, length(rel - SD * 6.0)));
    col = mix(col, f, smoothstep(fe + fray + 0.8, fe + fray - 0.8, rho));
  }
  // ring shadow on the cloth already done; the outer ring itself (light birch, grain along the ring)
  if (rho < HR + RW) {
    float x = (rho - HR) / RW;
    float pr = x * 2.0 - 1.0;
    vec3 N = normalize(vec3(dir * pr * 1.15, sqrt(max(1.0 - pr * pr, 0.04))));
    float diff = max(dot(N, LIGHT), 0.0);
    float tA = atan(-rel.x, -rel.y);   // seam at the top, under the clasp
    float grain = vnoise(vec2(tA * HR * 0.06, x * 5.0)) * 0.6 + vnoise(vec2(tA * HR * 0.25, x * 14.0)) * 0.4;
    vec3 w = uWood * (0.82 + 0.22 * grain) * (0.55 + 0.6 * diff);
    vec3 H = normalize(LIGHT + vec3(0.0, 0.0, 1.0));
    w += pow(max(dot(N, H), 0.0), 40.0) * 0.18;
    w *= 0.85 + 0.15 * smoothstep(0.0, 0.12, x) * smoothstep(1.0, 0.88, x);
    col = w;
  }
  // brass screw clasp at the top
  vec2 q = rel - vec2(0.0, HR + RW * 0.5);
  float lugW = RW * 0.9, gap = RW * 0.22, lugH = RW * 1.9;
  vec2 lq = vec2(abs(q.x) - gap - lugW * 0.5, q.y - lugH * 0.25);
  vec2 lb = abs(lq) - vec2(lugW * 0.5, lugH * 0.5);
  float lugD = length(max(lb, 0.0)) + min(max(lb.x, lb.y), 0.0) - 2.0;
  float shL = length(max(abs(lq - SD * 4.0) - vec2(lugW * 0.5, lugH * 0.5), 0.0)) - 2.0;
  col *= 1.0 - 0.25 * (1.0 - smoothstep(-1.0, 5.0, shL)) * step(HR + RW, rho);
  if (lugD < 0.0) {
    float edge = smoothstep(-3.5, 0.0, lugD);
    vec3 wl = uWood * 0.92 * (0.9 + 0.1 * vnoise(q * vec2(0.4, 0.06)));
    col = wl * (1.0 - 0.25 * edge) + 0.1 * edge * step(0.0, -lq.x * sign(q.x) + lq.y);
  }
  float by = q.y - lugH * 0.38;
  float barH = RW * 0.26;
  float barL = gap + lugW + RW * 0.6;
  if (abs(by) < barH && abs(q.x) < barL) {
    float pr = by / barH;
    float diff = 0.55 + 0.5 * max(pr, 0.0);
    vec3 brass = vec3(0.79, 0.62, 0.3) * diff + pow(1.0 - abs(pr - 0.35), 8.0) * 0.35;
    brass *= 0.9 + 0.1 * step(0.5, fract(q.x / 2.2));   // thread of the screw
    col = brass;
  }
  vec2 kq = q - vec2(barL + RW * 0.25, lugH * 0.38);
  float kd = length(kq) - RW * 0.48;
  if (kd < 0.0) {
    vec2 kn = kq / (RW * 0.48);
    vec3 N = normalize(vec3(kn, sqrt(max(1.0 - dot(kn, kn), 0.0))));
    col = vec3(0.8, 0.63, 0.31) * (0.45 + 0.65 * max(dot(N, LIGHT), 0.0)) + pow(max(dot(N, normalize(LIGHT + vec3(0, 0, 1))), 0.0), 30.0) * 0.5;
    col *= 0.85 + 0.15 * step(0.5, fract(atan(kn.y, kn.x) * 4.77));   // knurling
  }
  return col;
}

vec3 stylize(vec2 px) {
  CP = px / uDpr;
  float t = uTime;
  LIGHT = normalize(vec3(-0.55 + 0.3 * sin(t * 0.21), 0.62 + 0.2 * sin(t * 0.13 + 1.3), 0.8));
  SD = normalize(-LIGHT.xy);
  HON = uHoop.w;
  HC = vec2(uHoop.x, uRes.y / uDpr - uHoop.y);
  HR = uHoop.z;

  // which mode this pixel shows: a mode change sweeps the new cloth across, then the threads are
  // stitched in (rev = how far the stitching has got; 9 = all done)
  float sig = sweep(px);
  float front = uMix * 2.6 - 0.1 + (vnoise(CP / 38.0) - 0.5) * 0.14;
  bool to = uFromEmpty > 0.5 || sig < front || uMix >= 1.0;
  float rev = to && uMix < 1.0 ? uMix * 1.3 - 0.06 : 9.0;
  vec4 A = to ? uTA : uFA, B = to ? uTB : uFB, C = to ? uTC : uFC, D = to ? uTD : uFD;

  vec3 cloth = fabricAt(CP, C.x);
  vec2 rel = CP - HC;
  float rho = length(rel);
  if (HON > 0.5 && rho > HR) return clamp(outside(rel, rho, C.x, cloth), 0.0, 1.0);
  vec3 col = embroider(px, cloth, A, B, C, D, rev, sig);
  if (HON > 0.5) {
    // fabric drum-tight over the inner ring: a ridge at the rim, the outer ring's shadow, tension shading
    float x = (HR - rho);
    col *= 1.0 + 0.1 * (1.0 - smoothstep(0.0, 3.0, abs(x - 2.5))) - 0.12 * (1.0 - smoothstep(0.0, 1.5, x));
    col *= 1.0 - 0.3 * smoothstep(HR - 3.0, HR + 4.0, length(rel - SD * 9.0));
    col *= 1.0 - 0.06 * smoothstep(HR * 0.6, HR, rho);
  }
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + controls */

type State = { mode: EmbroideryMode; density: number; densityT: number; dur: number }
// keyed by the uniforms object, which survives `{ ...fx }` copies made by other demos
const STATE = new WeakMap<object, State>()
type U = { [k: string]: THREE.IUniform }
const stateOf = (fx: StylizeEffect) => (fx.uniforms ? STATE.get(fx.uniforms) : undefined)

export function createEmbroideryEffect(init: { mode?: EmbroideryMode; density?: number } = {}): StylizeEffect {
  const mode = init.mode ?? 'satin'
  const dens = init.density ?? 1
  // thread card texture: row 0 = OKLab + family, row 1 = sRGB + stitch-in order of the family
  const N = THREAD_PALETTE.length
  const pal = new Float32Array(N * 2 * 4)
  THREAD_PALETTE.forEach((p, i) => {
    const lab = oklab(p.hex)
    const c = rgb(p.hex)
    pal.set([lab.x, lab.y, lab.z, p.fam], i * 4)
    pal.set([c[0], c[1], c[2], FAMILY_ORDER[p.fam]], (N + i) * 4)
  })
  const tPal = new THREE.DataTexture(pal, N, 2, THREE.RGBAFormat, THREE.FloatType)
  tPal.minFilter = tPal.magFilter = THREE.NearestFilter
  tPal.needsUpdate = true
  const v4 = () => new THREE.Vector4()
  const uniforms: U = {
    tPal: { value: tPal },
    uNP: { value: N },
    uN9: { value: 9 },
    uTA: { value: v4() },
    uTB: { value: v4() },
    uTC: { value: v4() },
    uTD: { value: v4() },
    uFA: { value: v4() },
    uFB: { value: v4() },
    uFC: { value: v4() },
    uFD: { value: v4() },
    uDensity: { value: dens },
    uFrom: { value: MODE_INDEX[mode] },
    uTo: { value: MODE_INDEX[mode] },
    uMix: { value: 1 },
    uFromEmpty: { value: 0 },
    uHoop: { value: new THREE.Vector4(0, 0, 1, 0) },
    uLinen: { value: v3('#e6dcc7') },
    uSilk: { value: v3('#f1ece2') },
    uDenim: { value: v3('#34558c') },
    uWeft: { value: v3('#b9b8b2') },
    uFelt: { value: v3('#cfe2dc') },
    uBorder: { value: v3('#e9b922') },
    uTable: { value: v3('#e9dfcf') },
    uWood: { value: v3('#d9ae78') },
  }
  const st: State = { mode, density: dens, densityT: dens, dur: 2.4 }
  STATE.set(uniforms, st)
  // copy the incoming / outgoing mode's parameter set into the T / F uniforms
  const ORDER: EmbroideryMode[] = ['satin', 'suzhou', 'denim']
  const copy = (to: string, idx: number) => {
    const P = MODE_PARAMS[ORDER[idx]]
    ;(uniforms[to + 'A'].value as THREE.Vector4).fromArray(P.A)
    ;(uniforms[to + 'B'].value as THREE.Vector4).fromArray(P.B)
    ;(uniforms[to + 'C'].value as THREE.Vector4).fromArray(P.C)
    ;(uniforms[to + 'D'].value as THREE.Vector4).fromArray(P.D)
  }
  const syncParams = () => {
    copy('uT', uniforms.uTo.value)
    copy('uF', uniforms.uFrom.value)
  }
  syncParams()
  return {
    frag: FRAG,
    uniforms,
    normals: true,
    background: embroideryMeta.background,
    update(dt) {
      const u = uniforms
      if (u.uMix.value < 1) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / st.dur)
        if (u.uMix.value >= 1) {
          u.uFrom.value = u.uTo.value
          u.uFromEmpty.value = 0
        }
      }
      st.density += (st.densityT - st.density) * (1 - Math.exp(-dt * 5))
      if (Math.abs(st.density - st.densityT) < 1e-3) st.density = st.densityT
      u.uDensity.value = st.density
      syncParams()
    },
  }
}

/** switch the embroidery technique: the new cloth sweeps across and the picture is stitched in again */
export function setEmbroideryMode(fx: StylizeEffect, mode: EmbroideryMode) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st || st.mode === mode) return
  st.mode = mode
  if (u.uMix.value >= 0.5) {
    u.uFrom.value = u.uTo.value
    u.uFromEmpty.value = 0
  }
  u.uTo.value = MODE_INDEX[mode]
  u.uMix.value = 0
  st.dur = 2.4
}

/** 穿针: replay the stitching from bare cloth (on load) */
export function stitchInEmbroidery(fx: StylizeEffect, seconds = 3) {
  const st = stateOf(fx)
  const u = fx.uniforms as U
  if (!st) return
  u.uFrom.value = u.uTo.value
  u.uFromEmpty.value = 1
  u.uMix.value = 0
  st.dur = seconds
}

/** stitch-size multiplier (1 = default; < 1 denser, finer stitches). Eases. */
export function setEmbroideryDensity(fx: StylizeEffect, k: number, instant = false) {
  const st = stateOf(fx)
  if (!st) return
  st.densityT = k
  if (instant) st.density = k
}

/** embroidery hoop on a table: centre in CSS px from the top-left of the canvas, inner radius in CSS px; null = cloth everywhere */
export function setEmbroideryHoop(fx: StylizeEffect, hoop: { x: number; y: number; r: number } | null) {
  const v = (fx.uniforms as U).uHoop.value as THREE.Vector4
  if (!hoop) v.w = 0
  else v.set(hoop.x, hoop.y, hoop.r, 1)
}
