import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 毛线编织 — the picture is knitted as a sweater.
 *
 *  · Fabric grid: stitches in CSS px × uDpr, columns centred on the screen, rows counted from the bottom (so a
 *    ribbed hem can sit there). The fabric drapes: a slow low-frequency warp, and on objects the stitches are
 *    foreshortened along the (blurred) view normal and shaded by it, so curved forms read as stuffed,
 *    amigurumi-like bumps.
 *  · Colour is CHARTED: every stitch takes one yarn colour, sampled at its own centre and snapped to the mode's
 *    8-colour yarn box (a DataTexture read with texelFetch). Background stitches may follow a built-in motif
 *    chart (Fair Isle bands of peeries, diamonds and stars · granny squares for crochet).
 *  · Stitch geometry. A pixel's cell spans from the centre of one stitch to the centre of the next, so it
 *    holds the right half of stitch A and the left half of stitch B; it evaluates those two stitches in its
 *    own row and in the row below (whose legs reach up into it) → 4 stitch lookups, ≤ 8 strands, all from one
 *    call site inside one loop.
 *      knit (stockinette)  each stitch = two slanted plump legs → interlocking Vs stacked into columns
 *      purl                 a horizontal bump, smiles and frowns alternating (rib hem, cable ground)
 *      crochet              granny clusters: three tall posts + a chain on top, open chain spaces between,
 *                           rows offset by half a cluster
 *  · Yarn shading per strand: rounded tube under a key light, 2–3 twisted plies, fibre streaks, the ends dive
 *    under the neighbouring stitches, contact shadows from the strands above, dark gaps between stitches,
 *    a mohair halo of fibres beyond the strand. Per-stitch tension jitter (size / offset, a few loose ones).
 *  · 粗棒针 adds cable panels (two 3-stitch bundles crossing every 8 rows on a purl ground) wherever the
 *    picture is flat enough; the ribbed hem (2 × 2) is set with `setKnitHem`.
 *  · Changing mode or stitch size knits the new fabric in row by row from the bottom, the live row sitting on
 *    a bamboo needle; `knitIn()` starts from the knitting chart (graph paper with coloured squares).
 */

export const knitModes = [
  { id: 'fairisle', label: '提花毛衣' },
  { id: 'chunky', label: '粗棒针' },
  { id: 'crochet', label: '钩针' },
] as const
export type KnitMode = (typeof knitModes)[number]['id']

export const knitMeta = { title: '毛线编织', en: 'Knitwear', background: '#efe5d2', theme: 'light' as const }

/** yarn boxes (sRGB); index 0 is the ground colour */
export const KNIT_PALETTES: Record<KnitMode, string[]> = {
  fairisle: ['#f1e6d0', '#c8352c', '#7a1d2a', '#1f3a60', '#e2a52c', '#2d6b4a', '#8bb6d8', '#b9a283'],
  chunky: ['#f0e3cd', '#f3b9ae', '#d5727a', '#a7c79c', '#5c9c93', '#f2d384', '#b4a3d9', '#7a5a4f'],
  crochet: ['#f7f1e4', '#f26b55', '#f6c241', '#36b2ad', '#67ae46', '#c3356d', '#2d5db4', '#553727'],
}
/** palette index used for the ribbed hem / loose yarn end */
export const KNIT_HEM: Record<KnitMode, number> = { fairisle: 3, chunky: 2, crochet: 6 }

const KIND: Record<KnitMode, number> = { fairisle: 0, chunky: 1, crochet: 2 }
const CELL: Record<KnitMode, number> = { fairisle: 11, chunky: 18, crochet: 17 }
const ASPECT = [0.8, 0.82, 0.92]

/* ------------------------------------------------------------------ motif chart (Fair Isle bands) */

const CW = 24
const CH = 40

/**
 * palette index + 1 per cell (0 = no motif), row 0 = bottom.
 * rows 0–14: the border band above the hem · rows 16–39: the yoke under the neckline
 */
function fairIsleChart() {
  const g = new Uint8Array(CW * CH * 4)
  const set = (x: number, y: number, idx: number) => {
    const i = (y * CW + x) * 4
    g[i] = idx + 1
    g[i + 3] = 255
  }
  const peerie = (x: number, y0: number, c: number) => {
    if (x % 4 === 2) {
      set(x, y0, c)
      set(x, y0 + 2, c)
    }
    if (x % 2 === 1) set(x, y0 + 1, c)
  }
  const diamonds = (x: number, y0: number, out: number, inn: number) => {
    for (let r = 0; r < 7; r++) {
      const d = Math.abs((x % 8) - 3) + Math.abs(r - 3)
      if (d === 3) set(x, y0 + r, out)
      else if (d < 3 && x % 8 !== 7) set(x, y0 + r, d === 0 ? out : inn)
    }
  }
  for (let x = 0; x < CW; x++) {
    peerie(x, 0, 1)
    diamonds(x, 4, 3, 4)
    peerie(x, 12, 1)
    peerie(x, 16, 4)
    diamonds(x, 20, 5, 1)
    // stars (11 × 11), two per repeat, red / navy, a mustard dot between them
    const sx = x % 12
    const dx = sx - 5
    for (let r = 0; r < 11; r++) {
      const dy = r - 5
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      if (sx > 10) {
        if (dy === 0) set(x, 28 + r, 4)
        continue
      }
      const arm = (ax === ay && ax >= 2 && ax <= 4) || (dx === 0 && ay <= 5 && ay >= 2) || (dy === 0 && ax <= 5 && ax >= 2)
      const hub = ax + ay <= 1
      const hook = (ax === 4 && ay === 2) || (ax === 2 && ay === 4)
      if (arm || hub || hook) set(x, 28 + r, x < 12 ? 1 : 3)
    }
  }
  const t = new THREE.DataTexture(g, CW, CH, THREE.RGBAFormat)
  t.needsUpdate = true
  return t
}

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function paletteTexture() {
  const rows = knitModes.map((m) => KNIT_PALETTES[m.id])
  const data = new Uint8Array(8 * rows.length * 4)
  rows.forEach((row, r) =>
    row.forEach((hex, i) => {
      const [R, G, B] = hexRgb(hex)
      const k = (r * 8 + i) * 4
      data[k] = R
      data[k + 1] = G
      data[k + 2] = B
      data[k + 3] = 255
    }),
  )
  const t = new THREE.DataTexture(data, 8, rows.length, THREE.RGBAFormat)
  t.needsUpdate = true
  return t
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;    // 8 yarns × 3 modes
uniform sampler2D tChart;  // Fair Isle motif chart, r = palette index + 1
uniform vec4 uA;           // slot A (above the knitting front): kind (-1 chart, 0 knit, 1 chunky, 2 crochet), cell W (CSS px), palette row, aspect H/W
uniform vec4 uB;           // slot B (knitted, below the front)
uniform float uFront;      // rows of B knitted so far (> 9000 = done)
uniform float uMotif;
uniform float uHem;        // ribbed hem height from the bottom, CSS px
uniform float uBulge;
uniform float uDrape;      // CSS px

const vec3 KEY = vec3(-0.45, 0.6, 0.66);

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

float cdist(vec3 a, vec3 b) {
  float rm = 0.5 * (a.r + b.r);
  vec3 d = a - b;
  return (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
}
// opponent-space distance with a tunable lightness weight (hue decides the yarn, value only a little)
float ydist(vec3 a, vec3 b, float wL, float wC) {
  vec3 d = a - b;
  float dl = dot(d, vec3(0.3, 0.59, 0.11));
  float da = d.r - d.g;
  float db = 0.5 * (d.r + d.g) - d.b;
  return wL * dl * dl + wC * (da * da + db * db);
}
// how the picture is matched to the yarn box: lift toward white, lightness weight, value compression
vec3 matchParams(int row) {
  if (row == 0) return vec3(0.0, 1.6, 0.0);
  if (row == 1) return vec3(0.12, 0.7, 0.6);
  return vec3(0.04, 1.1, 0.25);
}
vec3 palC(int i, int row) { return texelFetch(tPal, ivec2(i, row), 0).rgb; }
int hemIdx(int row) { return row == 0 ? 3 : row == 1 ? 2 : 6; }

// fuzz amount, fuzz reach (× W), ply pitch (× W), sheen
vec4 yarnParams(int row) {
  if (row == 0) return vec4(0.55, 0.22, 0.62, 0.07);
  if (row == 1) return vec4(0.95, 0.3, 0.45, 0.04);
  return vec4(0.22, 0.12, 0.55, 0.24);
}

int motifIdx(vec2 id, int row, float H) {
  if (row == 0) {
    // a border band above the hem, a yoke under the top edge, sparse "lice" dots on the body between
    float r0 = id.y - ceil(uHem / H) - 2.0;
    float rt = floor(uRes.y / uDpr / H) - id.y;
    int cy = -1;
    if (r0 >= 0.0 && r0 < 15.0) cy = int(r0);
    else if (rt >= 2.0 && rt < 26.0) cy = 41 - int(rt);
    if (cy >= 0) return int(texelFetch(tChart, ivec2(int(id.x - 24.0 * floor(id.x / 24.0)), cy), 0).r * 255.0 + 0.5) - 1;
    float lx = id.x - 8.0 * floor(id.x / 8.0);
    float ly = id.y - 8.0 * floor(id.y / 8.0);
    if (lx < 0.5 && ly < 0.5) return 3;
    if (abs(lx - 4.0) < 0.5 && abs(ly - 4.0) < 0.5) return 1;
    return -1;
  }
  if (row == 2) {
    // granny squares: concentric rounds, joined with the ground colour
    vec2 sq = floor(id / 6.0);
    vec2 l = abs(id - sq * 6.0 - 2.5);
    float ring = max(l.x, l.y) - 0.5;
    // every other square is plain ground; the coloured ones have two rounds and a ground-colour join
    if (ring > 1.5 || mod(sq.x + sq.y, 2.0) > 0.5) return 0;
    int a = 1 + int(floor(hash12(sq * 1.7 + 3.1) * 5.999));
    int b = 1 + (a + int(floor(hash12(sq + 9.2) * 3.999))) % 6;
    return ring < 0.5 ? a : b;
  }
  return -1;
}

// one stitch's yarn: rgb + palette index. p = its centre in device px
vec4 yarnAt(vec2 p, vec2 id, int row, bool hem, float H) {
  int mi = -1;
  vec3 c = sceneL(p);
  if (hem) mi = hemIdx(row);
  else if (uMotif > 0.5 && nrmL(p).a < 0.5) mi = motifIdx(id, row, H);
  if (mi < 0) {
    // a little per-stitch jitter → speckled ("heathered") steps between neighbouring yarns
    vec3 mp = matchParams(row);
    // hue-keeping value compression (pastel / cotton boxes have no dark shades of every colour)
    float lv = max(dot(c, vec3(0.3, 0.59, 0.11)), 1e-3);
    c = min(c * mix(lv, 0.78, mp.z) / lv, vec3(1.0));
    c = mix(c, vec3(1.0), mp.x) + (hash12(id * 0.731 + 5.3) - 0.5) * 0.06;
    // near-neutral pixels (greys, shadows on a light floor) must not pick a strongly coloured yarn
    float chroma = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    float wC = mix(1.6, 0.5, smoothstep(0.05, 0.22, chroma));
    float bd = 1e9;
    mi = 0;
    for (int i = 0; i < 8; i++) {
      float d = ydist(c, palC(i, row), mp.y, wC);
      if (d < bd) { bd = d; mi = i; }
    }
  }
  return vec4(palC(mi, row), float(mi));
}

// stitch kinds: 0 knit, 1 purl, 2 crochet. side +1: the stitch sits at the left edge of the cell (we see its right
// half), -1: at the right edge. Positions in CSS px, x from the stitch centre, y from the row bottom.
bool strandDef(int sk, float side, int s, float W, float H, float par, out vec2 c, out vec2 d, out float hl, out float hw, out float bend) {
  if (sk == 0) {
    if (s > 0) return false;
    c = vec2(0.24 * W * side, 0.53 * H);
    d = normalize(vec2(0.5 * side, 0.87));
    hl = 0.57 * H;
    hw = 0.235 * W;
    bend = 0.25 * side;
    return true;
  }
  if (sk == 1) {
    if (s > 0) return false;
    c = vec2(0.0, 0.5 * H);
    d = vec2(1.0, 0.0);
    hl = 0.62 * W;
    hw = 0.28 * H;
    bend = par > 0.5 ? 0.6 : -0.6;
    return true;
  }
  // crochet (granny stitch): a cluster of three tall treble posts fanning out a little, closed by a chain on top;
  // the cell middle between clusters stays open (the chain space)
  if (s == 0) {
    c = vec2(0.0, 0.47 * H);
    d = vec2(0.0, 1.0);
    hl = 0.47 * H;
    hw = 0.13 * W;
    bend = 0.0;
  } else if (s == 1) {
    c = vec2(0.25 * W * side, 0.47 * H);
    d = normalize(vec2(0.16 * side, 1.0));
    hl = 0.46 * H;
    hw = 0.12 * W;
    bend = 0.25 * side;
  } else {
    c = vec2(0.0, 0.95 * H);
    d = vec2(1.0, 0.0);
    hl = 0.4 * W;
    hw = 0.085 * H;
    bend = 0.5;
  }
  return true;
}

// x: coverage, y: across (-1..1), z: along (-1..1), w: distance to the surface (CSS px, < 0 inside)
vec4 strandEval(vec2 q, vec2 c, vec2 d, float hl, float hw, float bend, float aa) {
  vec2 r = q - c;
  float a = dot(r, d);
  float t = clamp(a / hl, -1.0, 1.0);
  float b = dot(r, vec2(-d.y, d.x)) - bend * hw * (t * t - 0.4);
  float rad = hw * (1.0 - 0.28 * t * t);
  float L = max(hl - rad, 0.0);
  float dist = length(vec2(max(abs(a) - L, 0.0), b)) - rad;
  return vec4(smoothstep(aa, -aa, dist), clamp(b / rad, -1.0, 1.0), t, dist);
}

vec3 yarnShade(vec3 base, vec4 sv, vec2 d, float lenPx, float seed, vec4 P, float W) {
  float s = sv.y;
  float t = sv.z;
  vec2 n2 = vec2(-d.y, d.x);
  vec3 N = normalize(vec3(n2 * s * 0.95, sqrt(max(1.0 - s * s, 0.0)) + 0.08));
  vec3 Ld = normalize(KEY);
  float diff = 0.4 + 0.7 * max(dot(N, Ld), 0.0);
  // twisted plies: stripes slanting across the strand
  float ph = t * lenPx / (P.z * W) + s * 0.85 + seed * 7.0;
  float ply = 0.5 + 0.5 * cos(6.2831853 * ph);
  float sh = mix(0.8, 1.04, smoothstep(0.05, 0.75, ply));
  sh *= 0.88 + 0.2 * vnoise(vec2(ph * 5.0, s * 3.0 + seed * 31.0));
  // the ends dive under the neighbouring stitches
  sh *= mix(1.0, 0.5, smoothstep(0.5, 1.0, abs(t)));
  vec3 R = reflect(-Ld, N);
  float sp = pow(max(R.z, 0.0), 10.0) * smoothstep(0.4, 0.95, ply) * P.w;
  return base * diff * sh + sp;
}

float fibres(vec2 cp) {
  vec2 a = mat2(0.82, 0.57, -0.57, 0.82) * cp;
  vec2 b = mat2(0.82, -0.57, 0.57, 0.82) * cp;
  float n = max(vnoise(a * vec2(0.22, 0.95)), vnoise(b * vec2(0.22, 0.95) + 17.0));
  return smoothstep(0.42, 0.85, n);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 resC = uRes / uDpr;
  float aa = 0.75 / uDpr;

  // drape: a slow low-frequency warp of the whole fabric (the hem stays straight)
  float hemK = uHem > 0.0 ? smoothstep(uHem, uHem + 70.0, cp.y) : 1.0;
  vec2 dq = cp * 0.0042;
  vec2 warp = (vec2(vnoise(dq + vec2(0.0, uTime * 0.05)), vnoise(dq + vec2(5.2, 1.3 - uTime * 0.04))) - 0.5) * 2.0 * uDrape * hemK;

  // knitted yet? (B below the front, A above; the live row fills in stitch by stitch, alternating direction)
  float HB = uB.y * uB.w;
  float fyB = (cp.y + warp.y) / HB;
  float rowB = floor(fyB);
  float fr = floor(uFront);
  float xProg = cp.x / resC.x;
  if (mod(fr, 2.0) > 0.5) xProg = 1.0 - xProg;
  bool useB = rowB < fr || (rowB < fr + 0.5 && xProg < fract(uFront));
  vec4 S = useB ? uB : uA;
  int kind = int(floor(S.x + 0.5));
  int prow = int(S.z + 0.5);
  bool chart = kind < 0;
  float W = S.y;
  float H = W * S.w;
  vec2 cell = vec2(W, H);
  vec4 P = yarnParams(prow);

  // amigurumi: blurred normal → foreshortened stitches + form shading
  float rn = 0.9 * W * uDpr;
  vec4 nm = (nrmL(px) * 2.0 + nrmL(px + vec2(rn, 0.0)) + nrmL(px - vec2(rn, 0.0)) + nrmL(px + vec2(0.0, rn)) + nrmL(px - vec2(0.0, rn))) / 6.0;
  vec3 nb = normalize(nm.rgb * 2.0 - 1.0 + vec3(0.0, 0.0, 1e-3));
  float bk = chart ? 0.0 : uBulge * nm.a;
  vec2 nd = length(nb.xy) > 1e-3 ? normalize(nb.xy) : vec2(1.0, 0.0);
  float fsk = 1.0 / mix(1.0, max(nb.z, 0.62), bk * 0.8) - 1.0;
  float form = 1.0 + bk * (dot(nb, normalize(KEY)) - 0.55) * 0.45;

  vec2 f = (cp - vec2(resC.x * 0.5, 0.0) + warp) / cell;

  // cable panels (chunky): two 3-stitch bundles crossing every 8 rows on a purl ground, only in flat areas
  bool cables = false;
  bool forcePurl = false;
  float cableShade = 1.0;
  if (kind == 1 && cp.y > uHem + 6.0) {
    float rep = floor((f.x + 0.5) / 10.0);
    float pc = f.x - rep * 10.0;
    float blk = floor(f.y / 8.0);
    vec2 bc = vec2(rep * 10.0 + 4.5, (blk + 0.5) * 8.0);
    vec2 bpx = (cp + (bc - f) * cell) * uDpr;
    vec2 o = vec2(4.0 * W, 3.0 * H) * uDpr;
    vec3 c0 = sceneL(bpx);
    float uni = max(max(cdist(c0, sceneL(bpx + o)), cdist(c0, sceneL(bpx - o))),
                    max(cdist(c0, sceneL(bpx + vec2(o.x, -o.y))), cdist(c0, sceneL(bpx + vec2(-o.x, o.y)))));
    if (uni < 0.03) {
      cables = true;
      if (pc >= 1.5 && pc < 7.5) {
        float p = pc - 1.5;
        float sx = smoothstep(0.12, 0.88, fract(f.y / 8.0));
        float fs = 3.0 * sx;
        float bs = 3.0 - 3.0 * sx;
        float lift = sin(3.14159 * sx);
        float pSrc = p;
        if (p >= fs && p < fs + 3.0) {
          pSrc = p - fs;
          float e = min(p - fs, fs + 3.0 - p);
          cableShade = mix(0.72, 1.0, smoothstep(0.0, 0.45, e));
        } else if (p >= bs && p < bs + 3.0) {
          pSrc = p - bs + 3.0;
          float e = min(abs(p - fs), abs(p - fs - 3.0));
          cableShade = 1.0 - lift * 0.4 * (1.0 - smoothstep(0.0, 0.9, e));
        } else {
          forcePurl = true;
          cableShade = 0.8;
        }
        f.x = rep * 10.0 + 1.5 + pSrc;
      }
    }
  }

  float j = floor(f.y);
  vec3 C = vec3(0.0);
  float A = 0.0;
  vec3 gap = vec3(0.3);
  float dOut = 1e3;
  vec3 fuzzC = vec3(0.0);
  vec3 chartC = vec3(1.0);
  float chartI = 0.0;

  for (int k = 0; k < 2; k++) {
    if (chart && k == 0) continue;
    float row = j - 1.0 + float(k);
    float shift = (kind == 2 && mod(row, 2.0) > 0.5) ? 0.5 : 0.0;
    float fx = f.x - shift;
    float ci = floor(fx);
    float u = fx - ci;
    for (int st = 0; st < 2; st++) {
      if (chart && st == 1) continue;
      float col = chart ? floor(f.x + 0.5) : ci + float(st);
      vec2 id = vec2(col, row);
      bool hem = uHem > 0.0 && (row + 0.5) * H < uHem;
      vec2 cpC = cp + (vec2(col + shift, row + 0.5) - f) * cell;
      vec4 y = yarnAt(cpC * uDpr, id, prow, hem, H);
      if (chart) {
        chartC = y.rgb;
        chartI = y.a;
        continue;
      }
      if (k == 1 && (st == 0 ? u < 0.5 : u >= 0.5)) gap = y.rgb;

      int sk = kind == 2 ? 2 : 0;
      if (kind != 2) {
        float m4 = col - 4.0 * floor(col / 4.0);
        float m10 = col - 10.0 * floor(col / 10.0);
        if (hem) { if (m4 >= 1.5) sk = 1; }
        else if (forcePurl || (cables && (m10 < 1.5 || m10 > 7.5))) sk = 1;
      }
      // tension: a little size / offset jitter, a few loose stitches
      float h1 = hash12(id + 0.37);
      float h2 = hash12(id * 1.31 + 7.7);
      float sc = 1.0 + (h1 - 0.5) * 0.1 + step(0.95, h2) * 0.12;
      vec2 jit = (vec2(h2, hash12(id + 2.9)) - 0.5) * vec2(0.07 * W, 0.06 * H);
      float side = st == 0 ? 1.0 : -1.0;
      vec2 q = vec2((u - float(st)) * W, (f.y - row) * H) - jit;
      vec2 qc = q - vec2(0.0, 0.5 * H);
      qc += nd * dot(qc, nd) * fsk;
      q = qc / sc + vec2(0.0, 0.5 * H);
      vec3 base = y.rgb * (0.95 + 0.08 * hash12(id + 11.0));
      if (sk == 1) base *= hem ? 0.7 : 0.84;
      float par = mod(row + col, 2.0);

      for (int s = 0; s < 3; s++) {
        vec2 c;
        vec2 d;
        float hl;
        float hw;
        float bend;
        if (!strandDef(sk, side, s, W, H, par, c, d, hl, hw, bend)) break;
        vec4 sv = strandEval(q, c, d, hl, hw, bend, aa);
        // contact shadow cast down-right onto everything below this strand
        float shd = strandEval(q + vec2(-0.1 * W, 0.13 * W), c, d, hl, hw, bend, aa + 1.2).x;
        C *= 1.0 - 0.42 * shd;
        if (sv.w > 0.0 && sv.w < dOut) {
          dOut = sv.w;
          fuzzC = base;
        }
        if (sv.x > 0.001) {
          vec3 yc = yarnShade(base, sv, d, hl * 2.0, h1 + float(s) * 0.37 + float(st) * 0.21, P, W);
          C = yc * sv.x + C * (1.0 - sv.x);
          A = sv.x + A * (1.0 - sv.x);
        }
      }
    }
  }

  vec3 col;
  if (chart) {
    // knitting chart: graph paper, coloured squares, every 10th line heavier
    vec2 g = vec2(f.x + 0.5, f.y);
    vec2 e = (0.5 - abs(fract(g) - 0.5)) * cell;
    float cx = floor(g.x);
    float cy = floor(g.y + 0.5);
    float majX = abs(cx - 10.0 * floor(cx / 10.0 + 0.5)) < 0.5 ? 1.0 : 0.0;
    float majY = abs(cy - 10.0 * floor(cy / 10.0 + 0.5)) < 0.5 ? 1.0 : 0.0;
    float lx = 1.0 - smoothstep(0.35 + majX * 0.5, 0.35 + majX * 0.5 + 0.8, e.x);
    float ly = 1.0 - smoothstep(0.35 + majY * 0.5, 0.35 + majY * 0.5 + 0.8, e.y);
    vec3 paper = vec3(0.976, 0.968, 0.945);
    vec3 fill = chartI < 0.5 ? paper : mix(paper, chartC, 0.9);
    col = fill * (0.985 + 0.03 * hash12(floor(cp)));
    col = mix(col, vec3(0.42, 0.47, 0.58), max(lx * (0.32 + 0.3 * majX), ly * (0.32 + 0.3 * majY)));
  } else {
    col = C + (gap * (prow == 2 ? 0.3 : 0.2) + 0.01) * (1.0 - A);
    // mohair halo: fibres beyond the strand, and a light veil over it
    float fib = fibres(cp);
    float halo = 1.0 - smoothstep(0.0, P.y * W, dOut);
    col = mix(col, fuzzC * 1.06 + 0.03, clamp(halo * fib * P.x * 0.75, 0.0, 0.8));
    col = mix(col, max(col, C * 0.9 + 0.06), fib * P.x * 0.18 * A);
    col *= form * cableShade;
  }

  // the bamboo needle holding the live row
  if (uFront < 9000.0) {
    float yN = (fyB - fr - 0.95) * HB;
    float rN = 0.3 * uB.y;
    col *= 1.0 - 0.38 * (1.0 - smoothstep(0.0, rN * 1.6, abs(yN + rN * 0.9)));
    float s = clamp(yN / rN, -1.0, 1.0);
    vec3 N = vec3(0.0, s, sqrt(max(1.0 - s * s, 0.0)));
    vec3 Ld = normalize(KEY);
    float node = smoothstep(0.08, 0.0, abs(fract(cp.x / 140.0) - 0.5) - 0.012);
    vec3 bamboo = vec3(0.86, 0.69, 0.43) * (0.55 + 0.6 * max(dot(N, Ld), 0.0)) * (1.0 - 0.25 * node);
    bamboo *= 0.95 + 0.06 * vnoise(vec2(cp.x * 0.05, s * 4.0));
    bamboo += pow(max(reflect(-Ld, N).z, 0.0), 24.0) * 0.35;
    col = mix(col, bamboo, smoothstep(rN + aa, rN - aa, abs(yN)));
  }
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

type KnitState = { mode: KnitMode; scale: number; knitting: boolean; dur: number }
export type KnitEffect = StylizeEffect & { knit: KnitState }

const slotFor = (mode: KnitMode, scale: number, chart = false) => {
  const k = KIND[mode]
  return new THREE.Vector4(chart ? -1 : k, CELL[mode] * scale, k, ASPECT[k])
}

export function createKnitEffect(init: { mode?: KnitMode } = {}): KnitEffect {
  const mode = init.mode ?? 'fairisle'
  const st: KnitState = { mode, scale: 1, knitting: false, dur: 2.6 }
  const u = {
    tPal: { value: paletteTexture() },
    tChart: { value: fairIsleChart() },
    uA: { value: slotFor(mode, 1) },
    uB: { value: slotFor(mode, 1) },
    uFront: { value: 1e5 },
    uMotif: { value: 0 },
    uHem: { value: 0 },
    uBulge: { value: 1 },
    uDrape: { value: 6 },
  }
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    background: knitMeta.background,
    knit: st,
    update(dt, { dpr, height }) {
      if (!st.knitting) return
      const B = u.uB.value
      const rows = height / dpr / (B.y * B.w) + 2
      u.uFront.value += (dt * rows) / st.dur
      if (u.uFront.value >= rows) {
        st.knitting = false
        u.uFront.value = 1e5
        u.uA.value.copy(B)
      }
    },
  }
}

const restart = (fx: KnitEffect, from: THREE.Vector4) => {
  const u = fx.uniforms!
  ;(u.uA.value as THREE.Vector4).copy(from)
  ;(u.uB.value as THREE.Vector4).copy(slotFor(fx.knit.mode, fx.knit.scale))
  u.uFront.value = 0
  fx.knit.knitting = true
}

/** switch yarn box / stitch: the new fabric is knitted in from the bottom over the old one */
export function setKnitMode(fx: StylizeEffect, mode: KnitMode, opts: { instant?: boolean } = {}) {
  const k = fx as KnitEffect
  if (!k.knit || k.knit.mode === mode) return
  const prev = (fx.uniforms!.uB.value as THREE.Vector4).clone()
  k.knit.mode = mode
  if (opts.instant) {
    ;(fx.uniforms!.uA.value as THREE.Vector4).copy(slotFor(mode, k.knit.scale))
    ;(fx.uniforms!.uB.value as THREE.Vector4).copy(slotFor(mode, k.knit.scale))
    return
  }
  restart(k, prev)
}

/** stitch size multiplier (1 = the mode's own gauge); re-knits */
export function setKnitStitch(fx: StylizeEffect, scale: number) {
  const k = fx as KnitEffect
  if (!k.knit || k.knit.scale === scale) return
  const prev = (fx.uniforms!.uB.value as THREE.Vector4).clone()
  k.knit.scale = scale
  restart(k, prev)
}

/** knit the picture in from its chart (graph paper), row by row from the bottom */
export function knitIn(fx: StylizeEffect, seconds = 2.6) {
  const k = fx as KnitEffect
  if (!k.knit) return
  k.knit.dur = seconds
  restart(k, slotFor(k.knit.mode, k.knit.scale, true))
}

/** Fair Isle bands / granny squares on the background stitches */
export function setKnitMotif(fx: StylizeEffect, on: boolean) {
  fx.uniforms!.uMotif.value = on ? 1 : 0
}

/** height of the 2 × 2 ribbed hem at the bottom, CSS px (0 = none) */
export function setKnitHem(fx: StylizeEffect, cssPx: number) {
  fx.uniforms!.uHem.value = cssPx
}
