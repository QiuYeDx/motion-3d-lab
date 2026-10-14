import * as THREE from 'three'
import type { StylizeEffect } from '../../../lib/stylize'

/*
 * 街机矢量屏 — a 1980s vector CRT (Battlezone / Asteroids / Tempest): no raster, no fill, only the beam.
 *
 * LINES (hidden-line removal comes free: the normal / depth buffers only hold front-most surfaces)
 *   8 opposite tap pairs (4 at r, 4 at r/2) around each pixel compare coverage (silhouettes), the 2nd
 *   difference of 1/z (depth steps; planes give 0) and normal creases (flat-shaded facets → every polygon edge).
 *   The share of straddling pairs gives a rounded beam profile: outer ring → coloured line, inner → white-hot core.
 *   Surfaces can also be drawn by the beam directly: `vectorBeam(material)` marks a material (NoBlending,
 *   opacity 0.5 → alpha 0.5 in the scene target); its bright texels (e.g. a grid texture) become beam lines.
 * BEAM DWELL
 *   A real beam moves at constant speed along a segment and lingers at its ends, so vertices glow brighter.
 *   8 normal taps on a 2.5 CSS px ring: along a plain edge they hold two classes of normal (all deviations from
 *   the mean are collinear → Gram determinant 0); at a vertex / crossing three or more meet → the determinant
 *   lights up and boosts the line + adds a hot dot. Long segments stay a little dimmer.
 * PHOSPHOR
 *   bloom: 10 tap pairs on a golden-angle spiral (2.5 → 24 CSS px) measure "beam within R" for a multi-radius
 *   glow. Persistence: if the page calls `captureVectorPersistence(fx, gl)` after <Stylize> each frame, the
 *   previous screen comes back as `tHist` and the phosphor keeps max(new, old · decay) — real fading trails
 *   (`setVectorPersistence(fx, seconds)`). Without it (e.g. in the style switcher) the effect simply has none.
 * GLASS
 *   barrel curvature with a rounded tube mask, a dark green-black faceplate, edge falloff, a soft reflection
 *   sheen, faint grain and a tiny refresh flicker. No scanlines — vector displays had none.
 *
 * MODES (CPU-blended uniforms, no per-mode branches)
 *   green 绿色荧光 — Battlezone P39 green, long green afterglow
 *   white 白色矢量 — Asteroids P4 white, slightly blue afterglow
 *   color 彩色矢量 — Tempest: each object keeps its own (saturated) hue, neutral surfaces turn blue
 */

export const vectorModes = [
  { id: 'green', label: '绿色荧光' },
  { id: 'white', label: '白色矢量' },
  { id: 'color', label: '彩色矢量' },
] as const
export type VectorMode = (typeof vectorModes)[number]['id']

export const vectorMeta = { title: '街机矢量屏', en: 'Vector Arcade', background: '#000000', theme: 'dark' as const }

type V3 = [number, number, number]
type Look = { beam: V3; phos: V3 /* afterglow tint per second */; screen: V3; hue: number }
const LOOK: Record<VectorMode, Look> = {
  green: { beam: [0.3, 1.0, 0.42], phos: [0.22, 1.0, 0.4], screen: [0.008, 0.02, 0.013], hue: 0 },
  white: { beam: [0.8, 0.87, 1.0], phos: [0.5, 0.72, 1.0], screen: [0.012, 0.014, 0.018], hue: 0 },
  color: { beam: [0.32, 0.62, 1.0], phos: [1.0, 1.0, 1.0], screen: [0.01, 0.01, 0.018], hue: 1 },
}
const MODES = vectorModes.map((m) => m.id)

const FRAG = /* glsl */ `
uniform vec3 uBeam;     // beam colour (mode blend)
uniform float uHueW;    // 0 = single beam colour, 1 = per-object hue
uniform vec3 uPhos;     // afterglow tint (per decay step)
uniform vec3 uScreen;   // unlit faceplate
uniform float uLineR;   // edge ring radius, CSS px
uniform float uCrease;  // normal crease threshold (1 - dot)
uniform float uCurve;   // barrel curvature
uniform float uGlow;
uniform float uDecay;   // history multiplier this frame (0 = no persistence)
uniform sampler2D tHist;
uniform float uT;

vec4 nL(vec2 p) { return textureLod(tNormal, p / uRes, 0.0); }
vec4 sL(vec2 p) { return textureLod(tScene, p / uRes, 0.0); }
vec3 srgbOf(vec3 c) {
  c *= uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float zL(vec2 p) {
  float d = textureLod(tDepth, p / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
// alpha 0.5 in the scene target = a surface the beam draws directly (vectorBeam)
float marked(float a) { return 1.0 - smoothstep(0.12, 0.3, abs(a - 0.5)); }
// saturated hue + how coloured the source was
vec4 hueOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / (mx + 0.02);
  vec3 h = (c - mn) / max(mx - mn, 1e-3);
  h = pow(h, vec3(1.4));
  return vec4(h, smoothstep(0.12, 0.35, sat));
}
vec3 beamCol(vec4 hs) {
  vec3 h = hs.rgb * 0.85 + 0.15;
  h *= 0.7 / max(luma(h), 0.3); // even out perceived brightness (pure blue would read far dimmer than yellow)
  h = mix(uBeam, h, hs.a);
  return mix(uBeam, h, uHueW);
}
float gram(vec4 a, vec4 b) { float ab = dot(a, b); return dot(a, a) * dot(b, b) - ab * ab; }
vec4 cls(vec4 n) { return vec4((n.rgb * 2.0 - 1.0) * n.a, (1.0 - n.a) * 1.2); }

vec3 stylize(vec2 px) {
  vec2 uv = px / uRes;
  /* ---- tube geometry: barrel distortion + rounded mask */
  vec2 c = uv * 2.0 - 1.0;
  float asp = uRes.x / uRes.y;
  vec2 cn = c * vec2(asp, 1.0) / sqrt(asp * asp + 1.0);
  float r2 = dot(cn, cn);
  vec2 w = c * (1.0 + uCurve * r2);
  vec2 half_ = uRes * 0.5 / uDpr;
  vec2 q = (abs(w) - 1.0) * half_ + 26.0;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 26.0;
  float mask = 1.0 - smoothstep(-2.0, 0.6, sd);
  float edge = 1.0 - smoothstep(-90.0, 0.0, sd);
  vec2 p = (w * 0.5 + 0.5) * uRes;
  p.x += sin(uT * 47.0 + p.y * 0.031) * 0.12 * uDpr; // beam wobble

  /* ---- edges: 8 tap pairs around the centre */
  vec4 nC = nL(p);
  float zC = zL(p);
  vec4 sC = sL(p);
  vec3 nnC = normalize(nC.rgb * 2.0 - 1.0);
  float r = uLineR * uDpr;
  float outer = 0.0, inner = 0.0, lineW = 0.0;
  vec4 lineHue = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    float k = float(i);
    float ring = i < 4 ? 1.0 : 0.5;
    float a = k * 0.785398 + (i < 4 ? 0.0 : 0.3927);
    vec2 d = vec2(cos(a), sin(a)) * r * ring;
    vec2 pa = p + d, pb = p - d;
    vec4 nA = nL(pa), nB = nL(pb);
    float zA = zL(pa), zB = zL(pb);
    float covAll = nA.a * nB.a * nC.a;
    float eCov = max(abs(nA.a - nC.a), abs(nB.a - nC.a));
    float iz = (1.0 / zA + 1.0 / zB - 2.0 / zC) * zC;
    // depth-buffer precision falls with distance: raise the bar so far grazing planes don't trace bands
    float zt = 0.004 + zC * zC * 6e-6;
    vec4 sA = sL(pa), sB = sL(pb);
    // beam-drawn surfaces (marked) never trace their own depth: a huge grazing ground plane shows banding there
    float selfZ = marked(sA.a) * marked(sB.a) * marked(sC.a);
    float eZ = covAll * (1.0 - selfZ) * smoothstep(zt, zt * 1.8 + 0.008, abs(iz) / ring);
    vec3 nnA = normalize(nA.rgb * 2.0 - 1.0), nnB = normalize(nB.rgb * 2.0 - 1.0);
    float dn = max(1.0 - dot(nnA, nnC), 1.0 - dot(nnB, nnC));
    float eN = covAll * smoothstep(uCrease, uCrease * 2.0 + 0.04, dn);
    float e = max(eCov, max(eZ, eN));
    // the front-most of the three gives the line its colour
    float zF = mix(1e9, zC, nC.a);
    vec3 cF = sC.rgb;
    float wa = step(zA, zF - 1e-4) * nA.a;
    cF = mix(cF, sA.rgb, wa); zF = mix(zF, zA, wa);
    float wb = step(zB, zF - 1e-4) * nB.a;
    cF = mix(cF, sB.rgb, wb);
    lineHue += e * hueOf(srgbOf(cF));
    lineW += e;
    if (i < 4) outer += e; else inner += e;
  }
  outer *= 0.25;
  inner *= 0.25;
  float frac = outer * 0.55 + inner * 0.45;
  float line = smoothstep(0.12, 0.6, frac);
  float core = smoothstep(0.55, 0.95, inner) * smoothstep(0.35, 0.8, outer);

  // surfaces the beam draws itself (marked material): their bright texels are lines
  float mC = marked(sC.a);
  vec3 sCs = srgbOf(sC.rgb);
  float bm = mC * luma(sCs);
  float bLine = clamp(bm * 1.8, 0.0, 1.0);
  float bCore = smoothstep(0.45, 0.95, bm);

  /* ---- beam dwell: three or more normal classes on a small ring = a vertex / crossing */
  vec4 v[8];
  vec4 mean = vec4(0.0);
  float R0 = 2.5 * uDpr;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.2;
    v[i] = cls(nL(p + vec2(cos(a), sin(a)) * R0));
    mean += v[i];
  }
  mean *= 0.125;
  for (int i = 0; i < 8; i++) v[i] -= mean;
  float g = gram(v[0], v[2]) + gram(v[1], v[3]) + gram(v[2], v[4]) + gram(v[3], v[5])
          + gram(v[4], v[6]) + gram(v[5], v[7]) + gram(v[6], v[0]) + gram(v[7], v[1]);
  float dwell = smoothstep(0.004, 0.05, g);

  /* ---- phosphor bloom: tap pairs on a spiral, "beam within R" */
  vec4 glowHue = vec4(0.0);
  float glow = 0.0, glowE = 0.0;
  float ign = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
  for (int i = 0; i < 10; i++) {
    float k = float(i);
    float R = 2.5 * pow(1.29, k) * (0.88 + 0.24 * ign) * uDpr;
    float a = k * 2.39996 + 0.4 + (ign - 0.5) * 0.6;
    vec2 d = vec2(cos(a), sin(a)) * R;
    vec4 nA = nL(p + d), nB = nL(p - d);
    vec4 sA = sL(p + d), sB = sL(p - d);
    float eCov = abs(nA.a - nB.a);
    float eN = i < 4 ? nA.a * nB.a * smoothstep(0.3, 0.7, 1.0 - dot(normalize(nA.rgb * 2.0 - 1.0), normalize(nB.rgb * 2.0 - 1.0))) : 0.0;
    vec3 cA = srgbOf(sA.rgb), cB = srgbOf(sB.rgb);
    float bA = marked(sA.a) * luma(cA), bB = marked(sB.a) * luma(cB);
    float e = max(eCov, eN) + (bA + bB) * 0.35;
    float front = nA.a > nB.a + 0.5 ? 1.0 : nB.a > nA.a + 0.5 ? 0.0 : step(luma(cB), luma(cA));
    float ww = pow(0.86, k);
    glowHue += e * ww * hueOf(mix(cB, cA, front));
    glowE += e * ww;
    glow += e * ww;
  }
  glow /= 5.6;

  vec3 lc = beamCol(lineHue / max(lineW, 1e-3));
  vec3 bc = beamCol(hueOf(sCs));
  vec3 gc = beamCol(glowHue / max(glowE, 1e-3));

  /* ---- emission */
  float bright = 0.72 + 1.1 * dwell;
  vec3 E = lc * line * bright;
  E += mix(vec3(1.0), lc, 0.22) * core * (0.55 + 0.7 * dwell);
  E += lc * dwell * line * 0.9;                       // hot vertex dot
  E += bc * bLine * 0.85 + mix(vec3(1.0), bc, 0.3) * bCore * 0.5;
  E += gc * glow * uGlow * 0.55;
  E *= 0.97 + 0.03 * hash12(vec2(floor(uT * 60.0), 3.1)); // refresh flicker
  vec3 ph = 1.0 - exp(-E * 1.35);

  /* ---- glass (deterministic per pixel, so the afterglow can subtract it back out) */
  vec3 glass = uScreen * (1.0 - r2 * 0.55) * mask;
  vec2 sh = (uv - vec2(0.24, 0.8)) * vec2(asp, 1.0);
  glass += vec3(0.6, 0.7, 0.75) * exp(-dot(sh, sh) * 9.0) * 0.035 * mask;
  glass += vec3(0.5, 0.6, 0.65) * exp(-pow((uv.y - 0.93 + 0.05 * c.x * c.x) * 40.0, 2.0)) * 0.025 * mask;
  float inner_ = mask * (1.0 - edge * 0.55);

  vec3 cur = ph * inner_;
  if (uDecay > 0.0) {
    // the old frame spreads a little every frame, so trails melt into soft streaks instead of crisp copies
    vec2 hp = 1.0 / uRes;
    vec3 h = textureLod(tHist, uv, 0.0).rgb * 0.4
           + (textureLod(tHist, uv + vec2(hp.x, 0.0), 0.0).rgb + textureLod(tHist, uv - vec2(hp.x, 0.0), 0.0).rgb
            + textureLod(tHist, uv + vec2(0.0, hp.y), 0.0).rgb + textureLod(tHist, uv - vec2(0.0, hp.y), 0.0).rgb) * 0.15;
    vec3 prev = max(h - glass, 0.0);
    cur = max(cur, prev * uDecay * uPhos - 1.5 / 255.0);
  }
  vec3 col = cur + glass;
  col += (hash12(px + fract(uT * 3.7) * 61.0) - 0.5) * 0.008 * mask;
  return col;
}
`

/* ------------------------------------------------------------------ factory + setters */

type State = {
  mode: VectorMode
  w: number[]
  target: number[]
  t: number
  persist: number // seconds (1/e)
  hist: THREE.FramebufferTexture | null
  captured: number // frames captured since the history was (re)created
  buf: THREE.Vector2
}
export type VectorEffect = StylizeEffect & { vec: State }

export function createVectorEffect(opts: { mode?: VectorMode; persistence?: number } = {}): VectorEffect {
  const mode = opts.mode ?? 'green'
  const w = MODES.map((m) => (m === mode ? 1 : 0))
  const st: State = { mode, w: [...w], target: [...w], t: 0, persist: opts.persistence ?? 0.08, hist: null, captured: 0, buf: new THREE.Vector2() }
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  black.needsUpdate = true
  const u = {
    uBeam: { value: new THREE.Vector3() },
    uHueW: { value: 0 },
    uPhos: { value: new THREE.Vector3() },
    uScreen: { value: new THREE.Vector3() },
    uLineR: { value: 1.0 },
    uCrease: { value: 0.12 },
    uCurve: { value: 0.07 },
    uGlow: { value: 1 },
    uDecay: { value: 0 },
    tHist: { value: black as THREE.Texture },
    uT: { value: 0 },
  }
  const apply = () => {
    const b = [0, 0, 0]
    const ph = [0, 0, 0]
    const sc = [0, 0, 0]
    let hue = 0
    MODES.forEach((m, i) => {
      const L = LOOK[m]
      for (let j = 0; j < 3; j++) {
        b[j] += L.beam[j] * st.w[i]
        ph[j] += L.phos[j] * st.w[i]
        sc[j] += L.screen[j] * st.w[i]
      }
      hue += L.hue * st.w[i]
    })
    u.uBeam.value.set(b[0], b[1], b[2])
    u.uPhos.value.set(ph[0], ph[1], ph[2])
    u.uScreen.value.set(sc[0], sc[1], sc[2])
    u.uHueW.value = hue
  }
  apply()
  return {
    frag: FRAG,
    uniforms: u,
    normals: true,
    background: vectorMeta.background,
    vec: st,
    update(dt) {
      st.t += dt
      const k = Math.min(1, dt * 4)
      for (let i = 0; i < st.w.length; i++) st.w[i] += (st.target[i] - st.w[i]) * k
      apply()
      u.uT.value = st.t
      const live = st.hist && st.captured > 1 && st.persist > 0.001
      // afterglow per frame; a long frame (tab switch) clears it
      u.uDecay.value = live && dt > 0 ? Math.exp(-dt / st.persist) : 0
      // the tint is a per-second factor, applied every frame
      if (live) {
        const f = Math.min(dt, 0.1)
        u.uPhos.value.set(Math.pow(u.uPhos.value.x, f), Math.pow(u.uPhos.value.y, f), Math.pow(u.uPhos.value.z, f))
      }
    },
  }
}

export function setVectorMode(fx: StylizeEffect, mode: VectorMode) {
  const st = (fx as VectorEffect).vec
  if (!st || st.mode === mode) return
  st.mode = mode
  st.target = MODES.map((m) => (m === mode ? 1 : 0))
}

/** afterglow time constant in seconds (0 = off); default 0.08. Needs captureVectorPersistence() every frame */
export function setVectorPersistence(fx: StylizeEffect, seconds: number) {
  const st = (fx as VectorEffect).vec
  if (st) st.persist = seconds
}

/** barrel curvature of the tube, default 0.07 */
export function setVectorCurvature(fx: StylizeEffect, k: number) {
  const u = fx.uniforms as { uCurve: THREE.IUniform<number> } | undefined
  if (u) u.uCurve.value = k
}

/**
 * Copy what is on screen into the effect's afterglow history. Call it every frame AFTER <Stylize> has drawn
 * (e.g. `useFrame(({ gl }) => captureVectorPersistence(fx, gl), 2)`). The canvas must have an alpha channel
 * (`gl={{ alpha: true }}`) — copying an RGB drawing buffer into an RGBA texture is not allowed.
 */
export function captureVectorPersistence(fx: StylizeEffect, gl: THREE.WebGLRenderer) {
  const st = (fx as VectorEffect).vec
  if (!st) return
  const u = fx.uniforms as { tHist: THREE.IUniform<THREE.Texture> }
  gl.getDrawingBufferSize(st.buf)
  const w = Math.max(1, Math.floor(st.buf.x))
  const h = Math.max(1, Math.floor(st.buf.y))
  if (!st.hist || st.hist.image.width !== w || st.hist.image.height !== h) {
    st.hist?.dispose()
    st.hist = new THREE.FramebufferTexture(w, h)
    st.captured = 0
    u.tHist.value = st.hist
  }
  gl.setRenderTarget(null)
  gl.copyFramebufferToTexture(st.hist)
  st.captured++
}

/** free the history texture (call on unmount if you used captureVectorPersistence) */
export function disposeVectorPersistence(fx: StylizeEffect) {
  const st = (fx as VectorEffect).vec
  if (!st?.hist) return
  st.hist.dispose()
  st.hist = null
  st.captured = 0
}

/** mark a material as drawn by the beam itself: its bright texels become vector lines (e.g. a grid texture) */
export function vectorBeam<M extends THREE.Material>(m: M): M {
  m.blending = THREE.NoBlending
  m.transparent = false
  m.opacity = 0.5
  m.needsUpdate = true
  return m
}
