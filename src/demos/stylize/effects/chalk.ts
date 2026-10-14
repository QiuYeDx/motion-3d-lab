import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 粉笔板书 — chalk on a slate board.
 *
 *  · board: green-black slate with a fine tooth, slow cloudy variation and old eraser smears (wide wiped
 *    residue with felt streaks along the swipe). Chalk only catches the raised tooth unless pressed hard,
 *    so every mark is granular.
 *  · value is inverted from pencil: chalk is light, so the LIT parts get chalk and shadows stay bare board.
 *    Shading is laid with the side of the stick: broad rows of grainy strokes with ragged edges and
 *    streaks dragged along the stroke, up to three layers (main direction → cross layer → highlights
 *    pressed hard enough to fill the tooth).
 *  · contours: depth Laplacian + normal creases, sampled at a wobbling position; pressure varies along the
 *    line, the tooth breaks it, and now and then a second, offset pass doubles it (one call site, 2 taps).
 *  · colour: white plus a few coloured sticks (yellow, pink, light blue, light green, orange) in a small
 *    DataTexture; each pixel picks the stick whose hue is nearest the scene's, only where the scene is
 *    saturated enough — so a 黑板 drawing is mostly white with accents.
 *  · dust: specks everywhere, more (and a faint haze) just below chalked areas, where dust falls.
 *  · `drawChalk(fx)` replays the drawing (lines lead, then the shading strokes appear one by one, each laid
 *    from start to end); `eraseChalk(fx)` sweeps an eraser across and redraws, leaving smeared residue.
 *  · modes are numbers + board colours interpolated on the CPU.
 */

export const chalkModes = [
  { id: 'board', label: '黑板' },
  { id: 'color', label: '彩色粉笔' },
  { id: 'lecture', label: '板书讲解' },
] as const
export type ChalkMode = (typeof chalkModes)[number]['id']

export const chalkMeta = { title: '粉笔板书', en: 'Chalkboard', background: '#1d2622', theme: 'dark' as const }

/** board colour per mode (pages use it for the stage background) */
export const chalkBoard: Record<ChalkMode, string> = {
  board: '#1f2b25',
  color: '#1d2326',
  lecture: '#24402f',
}

/* ------------------------------------------------------------------ palette */

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const STICKS = ['#f3f0e6', '#f5e07a', '#f3a3bf', '#9ccff0', '#b1e29a', '#f5b878'].map(rgb)
const NPAL = STICKS.length

/* ------------------------------------------------------------------ per-mode look */

type Look = {
  board: RGB
  lineK: number
  lineW: number // CSS px
  wobble: number
  double: number
  crisp: number // 1 = clean diagram lines (few breaks)
  fill: number
  fillW: number // side-stroke row width, CSS px
  cross: number // second / third shading layers
  color: number
  colorTh: number // saturation needed before a coloured stick is used
  lineColor: number
  dust: number
  smear: number
}

const LOOKS: Record<ChalkMode, Look> = {
  board: { board: rgb(chalkBoard.board), lineK: 1, lineW: 1.25, wobble: 1, double: 0.75, crisp: 0.15, fill: 0.9, fillW: 15, cross: 1, color: 0.8, colorTh: 0.38, lineColor: 0.15, dust: 1, smear: 1 },
  color: { board: rgb(chalkBoard.color), lineK: 0.92, lineW: 1.4, wobble: 1, double: 0.45, crisp: 0.2, fill: 1, fillW: 13, cross: 1, color: 1, colorTh: 0.1, lineColor: 0.9, dust: 1, smear: 0.8 },
  lecture: { board: rgb(chalkBoard.lecture), lineK: 1, lineW: 1.1, wobble: 0.3, double: 0, crisp: 0.8, fill: 0.6, fillW: 17, cross: 0.35, color: 0.75, colorTh: 0.22, lineColor: 0.25, dust: 0.6, smear: 0.7 },
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
uniform vec3 uBoard;
uniform float uLineK;
uniform float uLineW;
uniform float uWobble;
uniform float uDouble;
uniform float uCrisp;
uniform float uFill;
uniform float uFillW;
uniform float uCross;
uniform float uColor;
uniform float uColorTh;
uniform float uLineColor;
uniform float uDust;
uniform float uSmear;
uniform float uSize;   // stroke scale (phones draw a little finer)
uniform float uDraw;   // 0 → 1 draw-in
uniform float uErase;  // eraser front in screen x (0..1), < -0.5 = idle
uniform float uGhost;  // residue of a wiped drawing

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
vec3 normL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0).xyz; }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 res = uRes / uDpr;
  float S = uSize;

  /* board tooth: chalk sticks to the peaks */
  float th = vnoise(cp * 0.85) * 0.42 + vnoise(cp * 2.3 + 5.0) * 0.3 + hash12(floor(cp * 1.6)) * 0.28;

  /* board + old eraser smears (wide arcs with felt streaks along the swipe) */
  float bend = sin(cp.x / 260.0 + fbm(cp / 400.0) * 3.0) * 40.0;
  float smear = fbm(vec2(cp.x / 380.0, (cp.y + bend) / 110.0) + 3.0);
  float felt = vnoise(vec2(cp.x / 90.0, (cp.y + bend) / 2.6));
  float residue = smoothstep(0.42, 0.85, smear) * (0.55 + 0.45 * felt) * uSmear;
  vec3 white = texelFetch(tPal, ivec2(0, 0), 0).rgb;
  vec3 board = uBoard * (0.9 + 0.16 * fbm(cp / 520.0 + 9.0)) * (0.96 + 0.08 * th);
  board = mix(board, white * 0.62, residue * 0.16);

  /* scene, sampled with a wobble (the hand isn't a plotter) */
  vec2 wob = (vec2(vnoise(cp * 0.03 + 1.0), vnoise(cp * 0.03 + 8.0)) - 0.5) * 3.0 * uWobble * uDpr;
  vec3 c = sceneL(px + wob);
  float V = luma(c);
  float A = smoothstep(0.16, 0.85, V);
  float Va = luma(sceneL(px + vec2(0.0, 15.0) * uDpr)); // just above: its dust falls here

  /* draw-in order: lines lead, then the shading strokes */
  float fld = (cp.x / res.x) * 0.55 + (1.0 - cp.y / res.y) * 0.3 + fbm(cp / 160.0) * 0.25;
  float done = step(0.999, uDraw);
  float lineP = uDraw * 2.3 - fld;
  float fillP = uDraw * 2.3 - 0.9 - fld;

  /* side-of-the-chalk shading: up to three layers */
  // the hand changes stroke direction with the facing of the form (3 directions, picked from the normal)
  vec3 nn = textureLod(tNormal, px / uRes, 0.0).xyz * 2.0 - 1.0;
  float bucket = length(nn.xy) < 0.3 ? 0.0 : floor(fract(atan(nn.y, nn.x) / 6.2831853 + 0.6) * 3.0);
  float ang0 = 0.62 + bucket * 1.05;
  float fill = 0.0;
  for (int L = 0; L < 3; L++) {
    float fL = float(L);
    float ang = ang0 + (fL < 0.5 ? 0.0 : (fL < 1.5 ? -1.15 : -0.5));
    float a0 = fL < 0.5 ? 0.04 : (fL < 1.5 ? 0.6 : 0.82);
    float p = smoothstep(a0, a0 + (fL < 0.5 ? 0.45 : 0.2), A) * uFill * (fL < 0.5 ? 1.0 : uCross);
    vec2 r = rot(ang) * cp;
    float W = uFillW * S * (1.0 + 0.25 * fL);
    r.y += (vnoise(vec2(r.x / 180.0, fL * 5.0 + bucket * 3.0)) - 0.5) * W * 1.6; // strokes arc a little
    float row = floor(r.y / W);
    float fy = fract(r.y / W);
    float hr = hash12(vec2(row, fL * 7.1));
    float Ls = (80.0 + 150.0 * hr) * S;
    float u = r.x / Ls + hash12(vec2(fL, row) + 1.7);
    float seg = floor(u);
    float fu = fract(u);
    float sh = hash12(vec2(seg, row) + fL * 3.3);
    float gap = 0.04 + 0.08 * sh;
    float ends = smoothstep(0.0, gap, fu) * smoothstep(1.0, 1.0 - gap * 1.8, fu);
    // a broad band (the side of the stick), soft edged, neighbouring strokes touch or overlap
    float wv = 0.6 + 0.12 * (vnoise(vec2(r.x * 0.03, row * 3.1 + fL)) - 0.5);
    float across = 1.0 - smoothstep(wv - 0.42, wv + 0.04, abs(fy - 0.5 + (sh - 0.5) * 0.1));
    // streaks dragged along the stroke + the board tooth
    float drag = vnoise(vec2(r.x * 0.035, r.y * 0.9) + fL * 9.0) * 0.6 + vnoise(vec2(r.x * 0.012, r.y * 0.35) + 3.0) * 0.4;
    float grain = th * 0.55 + drag * 0.45;
    // the stroke shape only changes the pressure — the board tooth decides where chalk lands, so
    // stroke edges and ends break up into grains instead of fading smoothly
    float press = p * (0.62 + 0.55 * sh) * across * ends;
    float dep = smoothstep(1.0 - press - 0.05, 1.0 - press + 0.06, grain) * step(0.02, press);
    float rv = max(clamp((fillP - sh * 0.35 - fL * 0.08) * 5.0, 0.0, 1.0), done);
    dep *= step(fu, rv);
    fill = max(fill, dep);
  }

  // dust rubbed into the board between the strokes (keeps the shading from reading as stripes)
  float rubT = 0.8 - A * 0.42;
  float rub = smoothstep(0.15, 0.95, A) * smoothstep(rubT, rubT + 0.07, th * 0.65 + vnoise(cp * 0.18 + 7.0) * 0.35);
  fill = max(fill, rub * 0.6 * uFill * max(smoothstep(0.0, 0.3, fillP), done));

  /* contours (+ an occasional doubled pass) */
  float eL = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 off = fk * (vec2(1.8, -1.3) + (vec2(vnoise(cp * 0.02 + 30.0), vnoise(cp * 0.02 + 40.0)) - 0.5) * 3.0) * uDpr;
    vec2 jw = (vec2(vnoise(cp * 0.045 + 2.0 + fk * 5.0), vnoise(cp * 0.045 + 9.0 + fk * 5.0)) - 0.5) * 3.0 * uWobble * uDpr;
    vec2 p = px + off + jw;
    float r = max(uLineW * S * uDpr, 0.75);
    float d0 = depthL(p);
    float d1 = depthL(p + vec2(r, 0.0));
    float d2 = depthL(p - vec2(r, 0.0));
    float d3 = depthL(p + vec2(0.0, r));
    float d4 = depthL(p - vec2(0.0, r));
    float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
    float en = length(normL(p + vec2(r, 0.0)) - normL(p - vec2(r, 0.0))) + length(normL(p + vec2(0.0, r)) - normL(p - vec2(0.0, r)));
    float e = max(smoothstep(0.035, 0.09, lap), smoothstep(0.3, 0.55, en));
    float gate = fk < 0.5 ? 1.0 : smoothstep(0.55, 0.72, vnoise(cp / 70.0 + 13.0)) * uDouble * 0.7;
    eL = max(eL, e * gate);
  }
  float lp = 0.6 + 0.4 * vnoise(cp / 30.0 + 21.0);
  float lift = mix(smoothstep(0.12, 0.26, vnoise(cp / 26.0 + 5.0)), 1.0, uCrisp);
  float lpress = clamp(eL * lift * (0.42 + 0.42 * lp + uCrisp * 0.3), 0.0, 1.1);
  float line = smoothstep(1.0 - lpress - 0.05, 1.0 - lpress + 0.06, th) * step(0.02, lpress) * uLineK;
  line *= max(smoothstep(0.0, 0.04, lineP), done);

  /* colour: nearest coloured stick by hue, only where the scene is saturated */
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 0.05);
  vec3 ch = c - vec3(luma(c));
  vec3 chn = ch / max(length(ch), 1e-4);
  vec3 stick = white;
  float best = -2.0;
  for (int i = 1; i < NPAL; i++) {
    vec3 pc = texelFetch(tPal, ivec2(i, 0), 0).rgb;
    vec3 pch = pc - vec3(luma(pc));
    float sc = dot(chn, pch / max(length(pch), 1e-4));
    if (sc > best) { best = sc; stick = pc; }
  }
  float colAmt = uColor * smoothstep(uColorTh, uColorTh + 0.15, sat);
  vec3 fillCol = mix(white, stick, colAmt);
  fillCol = mix(fillCol, white, smoothstep(0.82, 1.0, A) * 0.45); // pressed-hard highlights
  vec3 lineCol = mix(white, stick, colAmt * uLineColor);

  /* eraser: content behind the front is wiped, leaving smeared residue */
  float ux = cp.x / res.x + (vnoise(vec2(cp.y / 40.0, 3.0)) - 0.5) * 0.05;
  float wiped = uErase > -0.5 ? 1.0 - smoothstep(uErase - 0.035, uErase, ux) : 0.0;
  float keep = 1.0 - wiped;
  float scrub = vnoise(vec2(cp.x / 2.4, cp.y / 60.0)) * 0.6 + vnoise(vec2(cp.x / 30.0, cp.y / 8.0)) * 0.4;
  float ghost = max(uGhost, wiped) * (smoothstep(0.08, 0.8, A) * 0.75 + eL * 0.4) * (0.35 + 0.65 * scrub) * 0.2;

  vec3 col = board;
  col = mix(col, white * 0.8, ghost);
  col = mix(col, fillCol, fill * keep * 0.9);
  col = mix(col, lineCol, clamp(line, 0.0, 1.0) * keep * 0.95);

  /* dust: a faint haze under chalked areas + specks */
  col = mix(col, white, smoothstep(0.3, 0.9, Va) * 0.045 * uDust * keep * max(fillP > 0.0 ? 1.0 : 0.0, done));
  vec2 dc = floor(cp / 9.0);
  vec2 dp = (dc + 0.15 + 0.7 * vec2(hash12(dc + 3.7), hash12(dc + 8.1))) * 9.0;
  float rad = 0.45 + 0.85 * hash12(dc + 1.3);
  float speck = 1.0 - smoothstep(rad - 0.5, rad + 0.5, length(cp - dp));
  float prob = (0.006 + 0.13 * smoothstep(0.25, 0.8, Va) * keep) * uDust;
  col = mix(col, white * 0.88, speck * step(hash12(dc + 5.9), prob) * 0.55);
  return clamp(col, 0.0, 1.0);
}
`

/* ------------------------------------------------------------------ factory + setters */

const DRAW_DUR = 4.6
const ERASE_DUR = 1.25

type ChalkState = {
  from: Look
  to: Look
  cur: Look
  k: number
  mode: ChalkMode
  draw: number // seconds into the draw-in (≥ DRAW_DUR = finished)
  erase: number // seconds into an erase sweep (-1 = idle)
  ghost: number
  floor: number
  size: number
}
export type ChalkEffect = StylizeEffect & { chalk: ChalkState }

export function createChalkEffect(): ChalkEffect {
  const st: ChalkState = { from: LOOKS.board, to: LOOKS.board, cur: LOOKS.board, k: 1, mode: 'board', draw: DRAW_DUR, erase: -1, ghost: 0, floor: 0, size: 1 }
  const data = new Uint8Array(NPAL * 4)
  STICKS.forEach((c, i) => data.set([Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), 255], i * 4))
  const pal = new THREE.DataTexture(data, NPAL, 1, THREE.RGBAFormat)
  pal.colorSpace = THREE.NoColorSpace
  pal.magFilter = pal.minFilter = THREE.NearestFilter
  pal.needsUpdate = true

  const u = {
    tPal: { value: pal },
    uBoard: { value: new THREE.Vector3(...LOOKS.board.board) },
    uLineK: { value: 1 },
    uLineW: { value: 1 },
    uWobble: { value: 1 },
    uDouble: { value: 0 },
    uCrisp: { value: 0 },
    uFill: { value: 1 },
    uFillW: { value: 10 },
    uCross: { value: 1 },
    uColor: { value: 1 },
    uColorTh: { value: 0.3 },
    uLineColor: { value: 0 },
    uDust: { value: 1 },
    uSmear: { value: 1 },
    uSize: { value: 1 },
    uDraw: { value: 1 },
    uErase: { value: -1 },
    uGhost: { value: 0 },
  }
  const apply = (L: Look) => {
    ;(u.uBoard.value as THREE.Vector3).set(...L.board)
    u.uLineK.value = L.lineK
    u.uLineW.value = L.lineW
    u.uWobble.value = L.wobble
    u.uDouble.value = L.double
    u.uCrisp.value = L.crisp
    u.uFill.value = L.fill
    u.uFillW.value = L.fillW
    u.uCross.value = L.cross
    u.uColor.value = L.color
    u.uColorTh.value = L.colorTh
    u.uLineColor.value = L.lineColor
    u.uDust.value = L.dust
    u.uSmear.value = L.smear
    u.uSize.value = st.size
  }
  apply(st.cur)
  return {
    normals: true,
    frag: FRAG,
    uniforms: u,
    chalk: st,
    update(dt) {
      if (st.erase >= 0) {
        st.erase += dt
        const p = Math.min(1, st.erase / ERASE_DUR)
        u.uErase.value = -0.06 + (p * (2 - p)) * 1.16
        if (p >= 1) {
          // the board is clean (but not quite): redraw on top of the residue
          st.erase = -1
          u.uErase.value = -1
          st.ghost = 1
          st.floor = 0.3
          st.draw = 0
        }
      } else {
        st.draw += dt
      }
      // the smear of a wiped drawing fades to a faint permanent residue
      st.ghost += (st.floor - st.ghost) * Math.min(1, dt * 0.3)
      u.uGhost.value = st.ghost
      const p = Math.min(1, st.draw / DRAW_DUR)
      u.uDraw.value = st.erase >= 0 ? 1 : p < 1 ? p * (2 - p) * 0.999 : 1
      if (st.k < 1) {
        st.k = Math.min(1, st.k + dt / 0.8)
        const s = st.k < 0.5 ? 4 * st.k ** 3 : 1 - (-2 * st.k + 2) ** 3 / 2
        st.cur = lerpLook(st.from, st.to, s)
      }
      apply(st.cur)
    },
  }
}

/** replay the drawing: lines first, then the shading strokes one by one */
export function drawChalk(fx: StylizeEffect) {
  const st = (fx as ChalkEffect).chalk
  if (st && st.erase < 0) st.draw = 0
}

/** sweep an eraser across the board (left → right), then redraw on top of the smeared residue */
export function eraseChalk(fx: StylizeEffect) {
  const st = (fx as ChalkEffect).chalk
  if (st && st.erase < 0) st.erase = 0
}

/** skip the draw-in (posters) */
export function settleChalk(fx: StylizeEffect) {
  const st = (fx as ChalkEffect).chalk
  if (st) {
    st.draw = DRAW_DUR
    st.erase = -1
  }
}

/** 0 → 1 while the drawing is being made; the eraser sweep reports its own progress in `erasing` */
export function chalkProgress(fx: StylizeEffect) {
  const st = (fx as ChalkEffect).chalk
  if (!st) return { draw: 1, erasing: -1 }
  return { draw: Math.min(1, st.draw / DRAW_DUR), erasing: st.erase < 0 ? -1 : Math.min(1, st.erase / ERASE_DUR) }
}

export function setChalkMode(fx: StylizeEffect, mode: ChalkMode) {
  const st = (fx as ChalkEffect).chalk
  if (!st || st.mode === mode) return
  st.mode = mode
  st.from = st.cur
  st.to = LOOKS[mode]
  st.k = 0
}

/** stroke scale (1 = default; phones look better a little finer, e.g. 0.8) */
export function setChalkSize(fx: StylizeEffect, size: number) {
  const st = (fx as ChalkEffect).chalk
  if (st) st.size = size
}
