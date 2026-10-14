import * as THREE from 'three'

/*
 * Shared bits for the two woodblock-print effects (木版年画 nianhua.ts, 浮世绘 ukiyoe.ts).
 *
 *  · explicit-LOD scene / depth / normal fetches (safe inside loops and branches: no implicit derivatives)
 *  · a lighting-independent "chroma key": a 2D point whose direction is the hue (opponent axes) and whose
 *    length is the saturation, eased so pastel highlights on a coloured object stay with that colour and only
 *    near-neutral pixels fall to the centre (= paper). Both effects classify the scene into ink blocks by the
 *    nearest target in this disc; the targets are computed on the CPU with the same formula (chromaKeyJs).
 *  · paper fibres / value noise
 *  · a small float DataTexture for palettes (read with texelFetch — no dynamically indexed uniform arrays)
 */

export const WOODBLOCK_GLSL = /* glsl */ `
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float idepthL(vec2 px) {           // 1 / view depth
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  float z;
  if (uOrtho > 0.5) z = uNear + d * (uFar - uNear);
  else { float zn = d * 2.0 - 1.0; z = (2.0 * uNear * uFar) / (uFar + uNear - zn * (uFar - uNear)); }
  return 1.0 / max(z, 1e-4);
}
vec4 normalL(vec2 px) {             // xyz view normal (-1..1), w coverage
  vec4 n = textureLod(tNormal, px / uRes, 0.0);
  return vec4(n.rgb * 2.0 - 1.0, n.a);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm2(vec2 p) { return vnoise(p) * 0.62 + vnoise(p * 2.13 + 5.2) * 0.38; }
/** 2D chroma key: direction = hue, length = eased saturation (0 = neutral) */
vec2 chromaKey(vec3 c) {
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float s = (mx - mn) / max(mx, 1e-3);
  vec2 o = vec2(c.r - 0.5 * (c.g + c.b), 0.8660254 * (c.g - c.b));
  return o / max(length(o), 1e-4) * smoothstep(0.06, 0.4, s);
}
/** neutral & dark → solid ink (hair, black lacquer); dark but saturated (a deep blue in shadow) is not black */
float blackness(vec3 c, float t) {
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float s = (mx - mn) / max(mx, 1e-3);
  return (1.0 - smoothstep(t - 0.035, t + 0.035, mx)) * (1.0 - smoothstep(0.4, 0.7, s));
}
/** clipped, near-neutral: a specular highlight (or pure white) — its "colour" is unknown */
float specular(vec3 c) {
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float s = (mx - mn) / max(mx, 1e-3);
  return smoothstep(0.972, 0.992, mx) * (1.0 - smoothstep(0.1, 0.28, s));
}
/** long paper fibres + soft mottling, ~0 mean; cp in CSS px */
float paperFibres(vec2 cp, float seed) {
  float n = (vnoise(cp * 0.9 + seed) - 0.5) * 0.4 + (vnoise(cp * 0.07 + seed * 2.0) - 0.5) * 0.9;
  vec2 q = cp * 0.33 + seed * 3.0;
  vec2 r1 = mat2(0.8, 0.6, -0.6, 0.8) * q;
  vec2 r2 = mat2(0.28, -0.96, 0.96, 0.28) * q;
  vec2 r3 = mat2(-0.5, 0.87, -0.87, -0.5) * q;
  // sparse long fibres: thin along one axis, bent by a slow warp, gated by a low-frequency mask
  float f = smoothstep(0.8, 0.96, vnoise(vec2(r1.x * 0.06, r1.y * 2.4 + 4.0 * vnoise(r1 * 0.03)))) * step(0.55, vnoise(r1 * 0.02 + 3.0))
          + smoothstep(0.82, 0.97, vnoise(vec2(r2.x * 0.07, r2.y * 2.6 + 4.0 * vnoise(r2 * 0.025)))) * step(0.55, vnoise(r2 * 0.02 + 8.0))
          + smoothstep(0.82, 0.97, vnoise(vec2(r3.x * 0.05, r3.y * 2.2 + 3.0 * vnoise(r3 * 0.03)))) * step(0.6, vnoise(r3 * 0.02 + 1.0));
  return n * 0.04 + f * 0.012;
}
`

/** JS twin of the GLSL chromaKey, for computing class targets from reference colours */
export function chromaKeyJs(hex: string): [number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const s = (mx - mn) / Math.max(mx, 1e-3)
  const ox = r - 0.5 * (g + b)
  const oy = 0.8660254 * (g - b)
  const l = Math.max(Math.hypot(ox, oy), 1e-4)
  const t = Math.min(1, Math.max(0, (s - 0.06) / (0.4 - 0.06)))
  const e = t * t * (3 - 2 * t)
  return [(ox / l) * e, (oy / l) * e]
}

export const rgb01 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** W×H RGBA float texture, nearest, for texelFetch */
export function floatTable(w: number, h: number) {
  const data = new Float32Array(w * h * 4)
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  const set = (x: number, y: number, v: [number, number, number] | [number, number, number, number]) => {
    const i = (y * w + x) * 4
    data[i] = v[0]
    data[i + 1] = v[1]
    data[i + 2] = v[2]
    data[i + 3] = v.length > 3 ? (v as number[])[3] : 1
  }
  return { tex, data, set }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
