import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 马克笔速写 — an industrial-design / architecture marker rendering on smooth marker paper.
 *
 *  · tone → passes: the lit side is left as white paper, mid tones get one pass of a light marker, shadows two
 *    or three passes of darker greys (cool or warm grey sets). Saturated surfaces use ONE colour marker (the
 *    scene hue snapped to a small marker set in a DataTexture), its shadow side either a grey laid over it
 *    (product renders) or the same hue again (Copic comics). Coloured surfaces are judged by their value, not
 *    luma, so a lit blue panel is one clean pass of blue.
 *  · strokes: wide chisel-tip passes laid in parallel straight rows (one direction per surface: from the
 *    view-space normal, quantised to 45° — or to 90° for architecture), rows spaced closer than the nib is
 *    wide, so neighbours overlap in a darker seam (transparent ink multiplies). Each stroke has its own slight
 *    angle and bow, streaks along it, and ends where the nib lifted. Alcohol ink pools where a stroke stops:
 *    seven taps along the stroke direction give the surface extent, so ends are darker and strokes may
 *    overshoot the silhouette by one or two steps (per-stroke random) — loose, confident.
 *  · fineliner: crisp black depth / normal contours that run on past corners. The overshoot samples the edge
 *    detector at ±o along 4 directions and keeps it where the edge found there runs in that direction
 *    (construction lines in the architecture mode reach much further and are faint).
 *  · white gel pen: broken white lines just inside the edges of surfaces that face the light.
 *  · architecture adds a quick pale-blue sky swipe behind the subject; comics blend strokes softly.
 *  · `drawMarker(fx)` replays the drawing: outlines first, then the passes sweep in light → dark, highlights
 *    last. Modes and the nib width are numbers interpolated on the CPU.
 */

export const markerModes = [
  { id: 'product', label: '产品设计' },
  { id: 'arch', label: '建筑速写' },
  { id: 'comic', label: '漫画上色' },
] as const
export type MarkerMode = (typeof markerModes)[number]['id']

export const markerMeta = { title: '马克笔速写', en: 'Marker Sketch', background: '#f7f7f4', theme: 'light' as const }

/** paper colour per mode (pages use it for the stage background) */
export const markerPaper: Record<MarkerMode, string> = {
  product: '#f7f7f4',
  arch: '#f6f3ec',
  comic: '#fbfaf7',
}

/* ------------------------------------------------------------------ palette + looks */

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const MARKERS = ['#2f6fd6', '#e0443a', '#f08c2e', '#f4c430', '#3daa5c', '#14a39b', '#7a59cf', '#e8609c'].map(rgb)
const NPAL = MARKERS.length

type Look = {
  paper: RGB
  g1: RGB
  g2: RGB
  g3: RGB
  ink: RGB
  sat: number // saturation before a colour marker is used
  vivid: number // 1 = marker colour as is, < 1 softened
  hue: number // shadow on colour: 0 grey over it, 1 the same hue again
  soft: number // blended (feathered) strokes
  seam: number // overlap darkening
  t1: number
  t2: number
  t3: number
  axis: number // stroke directions snap to 90°
  lineW: number // fineliner sample radius, CSS px
  over: number // overshoot past corners, CSS px
  extK: number // overshoot / construction line strength
  hiK: number // white gel pen
  sky: number
}

const LOOKS: Record<MarkerMode, Look> = {
  product: {
    paper: rgb(markerPaper.product), g1: rgb('#dde2e6'), g2: rgb('#c0c7cd'), g3: rgb('#8e979f'), ink: rgb('#18191c'),
    sat: 0.24, vivid: 1, hue: 0, soft: 0, seam: 1, t1: 0.8, t2: 0.56, t3: 0.33, axis: 0, lineW: 0.85, over: 10, extK: 0.85, hiK: 1, sky: 0,
  },
  arch: {
    paper: rgb(markerPaper.arch), g1: rgb('#e7e1d6'), g2: rgb('#cfc4b3'), g3: rgb('#9c8f7e'), ink: rgb('#3a342e'),
    sat: 0.2, vivid: 0.5, hue: 0, soft: 0.12, seam: 0.85, t1: 0.82, t2: 0.58, t3: 0.32, axis: 1, lineW: 0.7, over: 36, extK: 0.32, hiK: 0.35, sky: 1,
  },
  comic: {
    paper: rgb(markerPaper.comic), g1: rgb('#e6e0e8'), g2: rgb('#cbc2cf'), g3: rgb('#958aa0'), ink: rgb('#0b0b0d'),
    sat: 0.12, vivid: 1.15, hue: 1, soft: 1, seam: 0.3, t1: 0.86, t2: 0.6, t3: 0.36, axis: 0, lineW: 1.45, over: 3, extK: 0.6, hiK: 0.9, sky: 0,
  },
}

const lerpLook = (a: Look, b: Look, k: number): Look => {
  const m = (x: number, y: number) => x + (y - x) * k
  const o = {} as Record<string, unknown>
  for (const key of Object.keys(a) as (keyof Look)[]) {
    const x = a[key]
    const y = b[key]
    o[key] = Array.isArray(x) ? (x as RGB).map((v, i) => m(v, (y as RGB)[i])) : m(x as number, y as number)
  }
  return o as Look
}

/* ------------------------------------------------------------------ shader */

const FRAG = /* glsl */ `
uniform sampler2D tPal;
uniform vec3 uPaper;
uniform vec3 uG1;
uniform vec3 uG2;
uniform vec3 uG3;
uniform vec3 uInk;
uniform float uW;       // nib width, CSS px
uniform float uSat;
uniform float uVivid;
uniform float uHue;
uniform float uSoft;
uniform float uSeam;
uniform float uT1;
uniform float uT2;
uniform float uT3;
uniform float uAxis;
uniform float uLineW;
uniform float uOver;
uniform float uExtK;
uniform float uHiK;
uniform float uSky;
uniform float uDraw;    // 0 → 1 draw-in (1 = finished)
uniform float uSeed;

#define NPAL ${NPAL}

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
vec4 normL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.07 + 13.7; a *= 0.5; }
  return s / 0.875;
}

// scene colour + "tone" (value for coloured surfaces, luma for neutral ones); tone < 0 marks the background
vec4 tapAt(vec2 q) {
  vec3 c = sceneL(q);
  float cov = textureLod(tNormal, q / uRes, 0.0).a;
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float ca = smoothstep(uSat, uSat + 0.12, (mx - mn) / max(mx, 0.04));
  float tone = mix(luma(c), mx * 0.9, ca * 0.8);
  return vec4(c, cov > 0.5 ? tone : -1.0 - tone);
}
float toneOf(vec4 t) { return t.a < 0.0 ? -t.a - 1.0 : t.a; }
float satOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  return (mx - min(c.r, min(c.g, c.b))) / max(mx, 0.04);
}
float skyAt(vec2 cp) {
  vec2 uv = cp / (uRes / uDpr);
  // one loose band of sky behind the subject, ragged at the ends
  vec2 q = (uv - vec2(0.66, 0.82)) * vec2(2.5, 6.5);
  return smoothstep(0.0, 0.05, 1.0 - length(q) + (fbm(cp / 140.0 + 4.0) - 0.5) * 0.45);
}
// presence of pass k (0..2 tone passes, 3 = sky) at a tap; soft edges for blended (comic) strokes
float presK(vec4 t, int k, float skyQ) {
  if (k == 3) return t.a < 0.0 ? skyQ : 0.0;
  float th = k == 0 ? uT1 : (k == 1 ? uT2 : uT3);
  float s = 0.004 + uSoft * 0.05;
  return 1.0 - smoothstep(th - s, th + s, toneOf(t));
}

// fineliner edge detector: x = edge strength, yz = edge normal direction (unnormalised)
vec3 edgeAt(vec2 p, float r) {
  float d0 = depthL(p);
  float d1 = depthL(p + vec2(r, 0.0));
  float d2 = depthL(p - vec2(r, 0.0));
  float d3 = depthL(p + vec2(0.0, r));
  float d4 = depthL(p - vec2(0.0, r));
  float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
  vec3 na = normL(p + vec2(r, 0.0)).xyz;
  vec3 nb = normL(p - vec2(r, 0.0)).xyz;
  vec3 nc = normL(p + vec2(0.0, r)).xyz;
  vec3 nd = normL(p - vec2(0.0, r)).xyz;
  float ex = length(na - nb);
  float ey = length(nc - nd);
  float eS = smoothstep(0.025, 0.07, lap);
  float eN = smoothstep(0.3, 0.6, ex + ey);
  // direction across the edge: the depth gradient for silhouettes, the normal change for creases
  vec2 gD = vec2(d1 - d2, d3 - d4);
  vec2 gN = vec2(ex, ey * (dot(na - nb, nc - nd) < 0.0 ? -1.0 : 1.0));
  vec2 g = eS > eN ? gD / max(length(gD), 1e-6) : gN / max(length(gN), 1e-6);
  return vec3(max(eS, eN), g);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  vec2 uv = cp / res;

  /* ---- stroke direction for this surface (from the normal) */
  vec4 n4 = normL(px);
  vec3 nrm = n4.xyz * 2.0 - 1.0;
  float cov = n4.a;
  // direction from a smoothed normal, so curved surfaces get a few broad facets instead of slivers
  // (neighbours across a crease don't count, so flat faces keep one direction up to their edges)
  float bw = uW * 0.9 * uDpr;
  vec3 nsum = nrm;
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(bw, 0.0) : (i == 1 ? vec2(-bw, 0.0) : (i == 2 ? vec2(0.0, bw) : vec2(0.0, -bw)));
    vec4 nq = normL(px + o);
    vec3 v = nq.xyz * 2.0 - 1.0;
    nsum += v * nq.a * smoothstep(0.82, 0.96, dot(v, nrm));
  }
  vec2 nsm = normalize(nsum).xy;
  float ang;
  if (cov < 0.5) ang = 0.0;   // background: cast shadows on the floor get a quick horizontal swipe
  else if (length(nsm) < 0.32) ang = uAxis > 0.5 ? 1.5708 : 0.785;
  else {
    float st = uAxis > 0.5 ? 1.5708 : 0.7854;
    ang = floor((atan(nsm.y, nsm.x) + 1.5708) / st + 0.5) * st;
  }
  vec2 d = vec2(cos(ang), sin(ang));
  vec2 nn = vec2(-d.y, d.x);
  float along = dot(cp, d);
  float acr = dot(cp, nn);

  /* ---- seven taps along the stroke: surface extent for overshoot + ink pooling at the ends */
  float E = max(uW * 0.32, 3.0);
  vec4 t0 = tapAt(px - d * 3.0 * E * uDpr);
  vec4 t1 = tapAt(px - d * 2.0 * E * uDpr);
  vec4 t2 = tapAt(px - d * E * uDpr);
  vec4 t3 = tapAt(px);
  vec4 t4 = tapAt(px + d * E * uDpr);
  vec4 t5 = tapAt(px + d * 2.0 * E * uDpr);
  vec4 t6 = tapAt(px + d * 3.0 * E * uDpr);

  // the marker family: the most saturated colour along the stroke, snapped to the marker set
  vec3 cs = t3.rgb * (0.02 + satOf(t3.rgb)) + t2.rgb * satOf(t2.rgb) + t4.rgb * satOf(t4.rgb) + t1.rgb * satOf(t1.rgb) * 0.7 + t5.rgb * satOf(t5.rgb) * 0.7;
  float ws = 0.02 + satOf(t3.rgb) + satOf(t2.rgb) + satOf(t4.rgb) + (satOf(t1.rgb) + satOf(t5.rgb)) * 0.7;
  vec3 C = cs / ws;
  vec3 ch = C - vec3(luma(C));
  vec3 chn = ch / max(length(ch), 1e-4);
  vec3 F = texelFetch(tPal, ivec2(0, 0), 0).rgb;
  float best = -2.0;
  for (int i = 0; i < NPAL; i++) {
    vec3 pc = texelFetch(tPal, ivec2(i, 0), 0).rgb;
    vec3 pch = pc - vec3(luma(pc));
    float sc = dot(chn, pch / max(length(pch), 1e-4));
    if (sc > best) { best = sc; F = pc; }
  }
  F = mix(vec3(luma(F)), F, uVivid);
  F = mix(F, vec3(1.0), (1.0 - min(uVivid, 1.0)) * 0.45);
  F = clamp(F, 0.0, 1.0);
  float skyQ = uSky > 0.01 ? skyAt(cp) : 0.0;

  /* ---- marker passes: light → dark (→ sky) */
  vec3 col = uPaper;
  float diag = length(res);
  float alongN = dot(cp - res * 0.5, d) / diag + 0.5;
  for (int k = 0; k < 4; k++) {
    if (k == 3 && uSky < 0.01) break;
    float fk = float(k);
    float W = uW * (k == 2 ? 0.86 : (k == 3 ? 1.5 : 1.0));
    float sp = W * 0.86;
    float rowf = acr / sp + fk * 0.5 + uSeed * 0.13;
    float p0 = presK(t0, k, skyQ), p1 = presK(t1, k, skyQ), p2 = presK(t2, k, skyQ), p3 = presK(t3, k, skyQ);
    float p4 = presK(t4, k, skyQ), p5 = presK(t5, k, skyQ), p6 = presK(t6, k, skyQ);
    float cnt = 0.0;
    float pool = 0.0;
    float colA = 0.0;
    for (int j = 0; j < 2; j++) {
      float row = floor(rowf) - float(j);
      float fy = (rowf - row) * sp;
      float hr = hash12(vec2(row, fk * 7.1 + 1.3));
      float Ls = W * (18.0 + 30.0 * hr);
      float uu = along / Ls + hash12(vec2(row, fk + 3.3));
      float seg = floor(uu);
      float fu = fract(uu);
      float sh = hash12(vec2(seg, row) + fk * 3.7);
      // each stroke: its own slight angle and bow
      float off = (fu - 0.5) * Ls * (sh - 0.5) * 0.03 + sin(fu * 3.14159) * (hash12(vec2(row, seg) + 9.0) - 0.5) * W * 0.16;
      float wv = W * (0.95 + 0.1 * sh);
      float y = fy - off;
      float aa = 0.55 / uDpr + uSoft * W * 0.2;
      float inside = smoothstep(-aa, aa, y) * smoothstep(wv + aa, wv - aa, y);
      if (inside <= 0.0) continue;
      // overshoot by 0–2 taps in a random direction; ends pool
      float o = floor(hash12(vec2(row, seg) + 5.1 + fk) * 3.0);
      float o1 = step(0.5, o);
      float o2 = step(1.5, o);
      bool fwd = hash12(vec2(seg, row) + 2.7 + fk) < 0.5;
      float c0 = fwd ? max(p3, max(p2 * o1, p1 * o2)) : max(p3, max(p4 * o1, p5 * o2));
      float cF = fwd ? max(p4, max(p3 * o1, p2 * o2)) : max(p4, max(p5 * o1, p6 * o2));
      float cB = fwd ? max(p2, max(p1 * o1, p0 * o2)) : max(p2, max(p3 * o1, p4 * o2));
      float endZ = c0 * (1.0 - min(cF, cB));
      // nib lifted inside a long surface: the stroke ends there too
      float lift = 1.0 - smoothstep(0.0, 4.5 / Ls, min(fu, 1.0 - fu));
      // draw-in: rows are laid one after another, each stroke runs along its direction
      float t = (uDraw - 0.3 - fk * 0.16 - fract(row * 0.618) * 0.12) / 0.1;
      float shown = uDraw >= 0.999 ? 1.0 : step(alongN, t);
      float streak = 0.9 + 0.1 * vnoise(vec2(along * 0.02, fy * 0.3 + row * 3.0));
      float dens = (0.88 + 0.12 * sh) * streak;
      float edgeDk = smoothstep(wv * 0.5 - W * 0.06, wv * 0.5, abs(y - wv * 0.5)) * 0.18 * (1.0 - uSoft); // rim dries darker
      float m = inside * c0 * shown;
      cnt += m * (dens + edgeDk);
      pool += m * max(endZ, lift * 0.75);
      colA = max(colA, m * smoothstep(uSat, uSat + 0.12, satOf(p3 > 0.5 ? t3.rgb : (fwd ? t2.rgb : t4.rgb))));
    }
    cnt = min(cnt, 1.0 + uSeam * 0.6 * (cnt - 1.0));
    // pass colours (transparent: they multiply)
    vec3 pc;
    if (k == 0) pc = mix(uG1, mix(vec3(1.0), F, 0.62), colA);
    else if (k == 1) pc = mix(uG2, mix(vec3(1.0), F, 0.82), colA);
    else if (k == 2) pc = mix(uG3, mix(uG3 * vec3(0.98, 0.99, 1.02), F * F * 0.85 + 0.08, uHue), colA);
    else pc = vec3(0.8, 0.88, 0.96);
    float amt = cnt + pool * 0.55;
    col *= pow(max(pc, vec3(0.02)), vec3(amt));
  }

  /* ---- fineliner (+ overshoot / construction lines) and the gel-pen band */
  float r = max(uLineW * uDpr, 0.75);
  float dc = depthL(px);
  vec3 nc = n4.xyz;
  float e0 = 0.0;
  float ext = 0.0;
  float band = 0.0;
  for (int i = 0; i < 10; i++) {
    vec2 q = px;
    float rr = r;
    vec2 dir = vec2(0.0);
    if (i > 0 && i < 9) {
      float di = floor(float(i - 1) * 0.5);
      float sg = mod(float(i - 1), 2.0) < 0.5 ? 1.0 : -1.0;
      dir = vec2(cos(di * 0.7854), sin(di * 0.7854));
      q = px + dir * sg * uOver * uDpr;
      // same surface as this pixel there: nothing to extend
      if (abs(depthL(q) - dc) / dc < 0.002 && length(normL(q).xyz - nc) < 0.03) continue;
    } else if (i == 9) {
      rr = r * 3.4;
      if (uHiK < 0.01) break;
    }
    vec3 eg = edgeAt(q, rr);
    if (i == 0) e0 = eg.x;
    else if (i == 9) band = eg.x;
    else {
      float al = 1.0 - smoothstep(0.2, 0.4, abs(dot(eg.yz, dir)));
      ext = max(ext, eg.x * al);
    }
  }
  float lo = fbm(cp / 130.0 + 3.0) * 0.8 + uv.x * 0.2;
  float lineShown = uDraw >= 0.999 ? 1.0 : smoothstep(lo, lo + 0.03, uDraw / 0.3);
  float ink = smoothstep(0.3, 0.6, e0);
  float inkE = smoothstep(0.3, 0.6, ext) * uExtK;
  col = mix(col, uInk, max(ink, inkE) * lineShown * 0.96);

  // white gel pen: broken lines just inside the edges of surfaces that face the light
  vec3 Lv = normalize(vec3(-0.55, 0.7, 0.5));
  float facing = smoothstep(0.45, 0.8, dot(nrm, Lv)) * step(0.5, cov);
  float gate = smoothstep(0.42, 0.5, vnoise(cp / 22.0 + 7.0));
  float hi = clamp(band - e0 * 1.6, 0.0, 1.0) * facing * gate * uHiK * smoothstep(0.88, 0.98, uDraw);
  col = mix(col, vec3(1.0), hi * 0.92);

  // paper tooth
  col *= 1.0 - 0.025 * (vnoise(cp * 0.6) - 0.5) - 0.02 * (vnoise(cp / 300.0) - 0.5);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const DRAW_DUR = 6.0

type MarkerState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: MarkerMode
  width: number
  widthTarget: number
  draw: number
}
export type MarkerEffect = StylizeEffect & { marker: MarkerState }

export function createMarkerEffect(): MarkerEffect {
  const st: MarkerState = { from: LOOKS.product, to: LOOKS.product, cur: LOOKS.product, k: 1, mode: 'product', width: 18, widthTarget: 18, draw: DRAW_DUR }
  const data = new Uint8Array(NPAL * 4)
  MARKERS.forEach((c, i) => data.set([Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), 255], i * 4))
  const pal = new THREE.DataTexture(data, NPAL, 1, THREE.RGBAFormat)
  pal.colorSpace = THREE.NoColorSpace
  pal.magFilter = pal.minFilter = THREE.NearestFilter
  pal.needsUpdate = true

  const v3 = (c: RGB) => new THREE.Vector3(...c)
  const L0 = LOOKS.product
  const u = {
    tPal: { value: pal },
    uPaper: { value: v3(L0.paper) },
    uG1: { value: v3(L0.g1) },
    uG2: { value: v3(L0.g2) },
    uG3: { value: v3(L0.g3) },
    uInk: { value: v3(L0.ink) },
    uW: { value: 18 },
    uSat: { value: 0.2 },
    uVivid: { value: 1 },
    uHue: { value: 0 },
    uSoft: { value: 0 },
    uSeam: { value: 1 },
    uT1: { value: 0.8 },
    uT2: { value: 0.56 },
    uT3: { value: 0.33 },
    uAxis: { value: 0 },
    uLineW: { value: 1 },
    uOver: { value: 10 },
    uExtK: { value: 1 },
    uHiK: { value: 1 },
    uSky: { value: 0 },
    uDraw: { value: 1 },
    uSeed: { value: 0.3 },
  }
  const apply = (L: Look) => {
    u.uPaper.value.set(...L.paper)
    u.uG1.value.set(...L.g1)
    u.uG2.value.set(...L.g2)
    u.uG3.value.set(...L.g3)
    u.uInk.value.set(...L.ink)
    u.uSat.value = L.sat
    u.uVivid.value = L.vivid
    u.uHue.value = L.hue
    u.uSoft.value = L.soft
    u.uSeam.value = L.seam
    u.uT1.value = L.t1
    u.uT2.value = L.t2
    u.uT3.value = L.t3
    // directions are a switch: flip half way through the morph
    u.uAxis.value = L.axis > 0.5 ? 1 : 0
    u.uLineW.value = L.lineW
    u.uOver.value = L.over
    u.uExtK.value = L.extK
    u.uHiK.value = L.hiK
    u.uSky.value = L.sky
    u.uW.value = st.width
  }
  apply(st.cur)
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    marker: st,
    update(dt) {
      st.draw += dt
      const p = Math.min(1, st.draw / DRAW_DUR)
      u.uDraw.value = p >= 1 ? 1 : p * 0.999
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        st.cur = lerpLook(st.from, st.to, ease(st.k))
      }
      st.width += (st.widthTarget - st.width) * Math.min(1, dt * 5)
      apply(st.cur)
    },
  }
}

/** replay the drawing: outlines, then the marker passes light → dark, then the white highlights */
export function drawMarker(fx: StylizeEffect) {
  const st = (fx as MarkerEffect).marker
  if (!st) return
  st.draw = 0
  fx.uniforms!.uSeed.value = Math.random()
}

/** skip the draw-in (posters) */
export function settleMarker(fx: StylizeEffect) {
  const st = (fx as MarkerEffect).marker
  if (st) st.draw = DRAW_DUR
}

/** 0 → 1 while the sketch is being drawn */
export function markerProgress(fx: StylizeEffect) {
  const st = (fx as MarkerEffect).marker
  return st ? Math.min(1, st.draw / DRAW_DUR) : 1
}

export function setMarkerMode(fx: StylizeEffect, mode: MarkerMode) {
  const st = (fx as MarkerEffect).marker
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** chisel nib width in CSS px (default 18; ~11 fine … ~28 broad) */
export function setMarkerWidth(fx: StylizeEffect, width: number) {
  const st = (fx as MarkerEffect).marker
  if (st) st.widthTarget = width
}
