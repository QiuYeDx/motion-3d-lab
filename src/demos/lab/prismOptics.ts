import * as THREE from 'three'

/* ------------------------------------------------------------------ spectrum */

/** CIE 1931 2° colour-matching functions, Wyman–Sloan–Shirley (2013) multi-lobe fit. */
function g(x: number, mu: number, s1: number, s2: number) {
  const t = (x - mu) / (x < mu ? s1 : s2)
  return Math.exp(-0.5 * t * t)
}
function cie(l: number): [number, number, number] {
  const x = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2)
  const y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1)
  const z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8)
  return [x, y, z]
}
/** a fully saturated (max channel = 1) linear-sRGB hue for a wavelength */
export function hueOf(l: number): [number, number, number] {
  const [x, y, z] = cie(l)
  let r = 3.2406 * x - 1.5372 * y - 0.4986 * z
  let gg = -0.9689 * x + 1.8758 * y + 0.0415 * z
  let b = 0.0557 * x - 0.204 * y + 1.057 * z
  r = Math.max(0, r)
  gg = Math.max(0, gg)
  b = Math.max(0, b)
  const m = Math.max(r, gg, b, 1e-6)
  return [r / m, gg / m, b / m]
}

export const NW = 40
export const LMIN = 405
export const LMAX = 695

/** wavelengths + per-channel weights that sum to exactly white */
export function buildSpectrum() {
  const lam = new Float32Array(NW)
  const w = new Float32Array(NW * 3)
  const sum = [0, 0, 0]
  for (let i = 0; i < NW; i++) {
    const l = LMIN + ((LMAX - LMIN) * i) / (NW - 1)
    lam[i] = l
    const c = hueOf(l)
    for (let k = 0; k < 3; k++) {
      w[i * 3 + k] = c[k]
      sum[k] += c[k]
    }
  }
  for (let i = 0; i < NW; i++) for (let k = 0; k < 3; k++) w[i * 3 + k] /= sum[k]
  return { lam, w }
}

/* ------------------------------------------------------------------ 2D ray tracing */

export const MAXSEG = 9

export type Trace = {
  seg: Float32Array // [x0, y0, x1, y1, inside, intensity] × MAXSEG
  ns: number
  dx: number // final direction
  dy: number
  exited: boolean
  screen: boolean
  sy: number
  inc: number // angle of incidence at the first face (rad)
  r0: number // Fresnel reflectance at the first face
  tir: boolean
  px: number // first hit
  py: number
  nx: number // normal at first hit (pointing back at the source)
  ny: number
}

export const makeTrace = (): Trace => ({ seg: new Float32Array(MAXSEG * 6), ns: 0, dx: 0, dy: 0, exited: false, screen: false, sy: 0, inc: NaN, r0: 0, tir: false, px: 0, py: 0, nx: 0, ny: 0 })

function fresnel(n1: number, n2: number, ci: number, ct: number) {
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct)
  const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct)
  return 0.5 * (rs * rs + rp * rp)
}

export type Bounds = { x0: number; x1: number; y0: number; y1: number; sx: number; sy0: number; sy1: number }

/**
 * Trace one ray of refractive index `n` through a CCW triangle `V` (x0,y0,x1,y1,x2,y2):
 * Snell refraction with Fresnel transmission at every interface, total internal reflection
 * when sin θt > 1. Stops on the screen line x = sx (sy0..sy1) or the view bounds.
 */
export function trace(ox: number, oy: number, dx: number, dy: number, n: number, V: Float32Array, B: Bounds, out: Trace) {
  let inside = false
  let I = 1
  out.ns = 0
  out.exited = false
  out.screen = false
  out.inc = NaN
  out.tir = false
  for (let b = 0; b < MAXSEG; b++) {
    let tBest = Infinity
    let eBest = -1
    for (let e = 0; e < 3; e++) {
      const ax = V[e * 2]
      const ay = V[e * 2 + 1]
      const ex = V[((e + 1) % 3) * 2] - ax
      const ey = V[((e + 1) % 3) * 2 + 1] - ay
      const den = dx * ey - dy * ex
      if (Math.abs(den) < 1e-12) continue
      const t = ((ax - ox) * ey - (ay - oy) * ex) / den
      const u = ((ax - ox) * dy - (ay - oy) * dx) / den
      if (t > 1e-6 && u >= 0 && u <= 1 && t < tBest) {
        tBest = t
        eBest = e
      }
    }
    const s = out.seg
    const k6 = out.ns * 6
    if (eBest < 0) {
      // free flight → screen or view edge
      let t = Infinity
      if (dx > 1e-6) {
        const ts = (B.sx - ox) / dx
        const yy = oy + dy * ts
        if (ts > 0 && yy >= B.sy0 && yy <= B.sy1) {
          t = ts
          out.screen = true
          out.sy = yy
        }
      }
      if (!out.screen) {
        if (dx > 1e-9) t = Math.min(t, (B.x1 - ox) / dx)
        if (dx < -1e-9) t = Math.min(t, (B.x0 - ox) / dx)
        if (dy > 1e-9) t = Math.min(t, (B.y1 - oy) / dy)
        if (dy < -1e-9) t = Math.min(t, (B.y0 - oy) / dy)
        if (!isFinite(t)) t = 40
      }
      s[k6] = ox
      s[k6 + 1] = oy
      s[k6 + 2] = ox + dx * t
      s[k6 + 3] = oy + dy * t
      s[k6 + 4] = 0
      s[k6 + 5] = I
      out.ns++
      out.exited = !inside
      break
    }
    const px = ox + dx * tBest
    const py = oy + dy * tBest
    s[k6] = ox
    s[k6 + 1] = oy
    s[k6 + 2] = px
    s[k6 + 3] = py
    s[k6 + 4] = inside ? 1 : 0
    s[k6 + 5] = I
    out.ns++
    if (out.ns >= MAXSEG) break

    const ex = V[((eBest + 1) % 3) * 2] - V[eBest * 2]
    const ey = V[((eBest + 1) % 3) * 2 + 1] - V[eBest * 2 + 1]
    const el = Math.hypot(ex, ey)
    let Nx = ey / el // outward normal of a CCW triangle
    let Ny = -ex / el
    let ci = -(dx * Nx + dy * Ny)
    if (ci < 0) {
      Nx = -Nx
      Ny = -Ny
      ci = -ci
    }
    const n1 = inside ? n : 1
    const n2 = inside ? 1 : n
    const eta = n1 / n2
    const k = 1 - eta * eta * (1 - ci * ci)
    if (b === 0) {
      out.inc = Math.acos(Math.min(1, ci))
      out.px = px
      out.py = py
      out.nx = Nx
      out.ny = Ny
    }
    if (k < 0) {
      // total internal reflection
      out.tir = true
      dx += 2 * ci * Nx
      dy += 2 * ci * Ny
    } else {
      const ct = Math.sqrt(k)
      const R = fresnel(n1, n2, ci, ct)
      if (b === 0) out.r0 = R
      I *= 1 - R
      dx = eta * dx + (eta * ci - ct) * Nx
      dy = eta * dy + (eta * ci - ct) * Ny
      inside = !inside
    }
    const dl = Math.hypot(dx, dy)
    dx /= dl
    dy /= dl
    ox = px + dx * 1e-5
    oy = py + dy * 1e-5
  }
  out.dx = dx
  out.dy = dy
}

/* ------------------------------------------------------------------ additive beam quads */

export const beamVert = /* glsl */ `
attribute vec2 aUv;
attribute vec3 aCol;
attribute vec2 aMode;
varying vec2 vUv;
varying vec3 vCol;
varying vec2 vMode;
void main() {
  vUv = aUv;
  vCol = aCol;
  vMode = aMode;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const beamFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying vec3 vCol;
varying vec2 vMode;
void main() {
  float I;
  if (vMode.y > 1.5) {
    // radial glow
    vec2 q = vec2(vUv.x, vUv.y * 2.0 - 1.0);
    float r = length(q);
    I = (exp(-r * r * 9.0) + exp(-r * 4.5) * 0.35) * smoothstep(1.0, 0.6, r);
  } else {
    float a = vUv.x;
    I = (exp(-a * a * 7.0) + exp(-abs(a) * 3.2) * 0.2) * (1.0 - a * a);
    if (vMode.y > 0.5) I *= smoothstep(0.0, 0.4, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
    if (vMode.x > 0.0) I *= smoothstep(0.38, 0.5, fract(vUv.y * vMode.x)) * smoothstep(1.0, 0.88, fract(vUv.y * vMode.x));
  }
  gl_FragColor = vec4(vCol * I, 1.0);
}
`

export class QuadBuf {
  readonly max: number
  n = 0
  pos: Float32Array
  uv: Float32Array
  col: Float32Array
  mode: Float32Array
  geo: THREE.BufferGeometry
  private aPos: THREE.BufferAttribute
  private aUv: THREE.BufferAttribute
  private aCol: THREE.BufferAttribute
  private aMode: THREE.BufferAttribute

  constructor(max: number) {
    this.max = max
    this.pos = new Float32Array(max * 4 * 3)
    this.uv = new Float32Array(max * 4 * 2)
    this.col = new Float32Array(max * 4 * 3)
    this.mode = new Float32Array(max * 4 * 2)
    const idx = new Uint16Array(max * 6)
    for (let q = 0; q < max; q++) {
      idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3], q * 6)
    }
    this.geo = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aUv = new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage)
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage)
    this.aMode = new THREE.BufferAttribute(this.mode, 2).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('position', this.aPos)
    this.geo.setAttribute('aUv', this.aUv)
    this.geo.setAttribute('aCol', this.aCol)
    this.geo.setAttribute('aMode', this.aMode)
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1))
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4)
  }

  begin() {
    this.n = 0
  }

  private vert(v: number, x: number, y: number, u: number, w: number, r: number, g: number, b: number, dash: number, fade: number) {
    this.pos[v * 3] = x
    this.pos[v * 3 + 1] = y
    this.pos[v * 3 + 2] = 0
    this.uv[v * 2] = u
    this.uv[v * 2 + 1] = w
    this.col[v * 3] = r
    this.col[v * 3 + 1] = g
    this.col[v * 3 + 2] = b
    this.mode[v * 2] = dash
    this.mode[v * 2 + 1] = fade
  }

  /** a soft line from (x0,y0) to (x1,y1), half-width hw0 → hw1, colour × i0 → i1 */
  seg(x0: number, y0: number, x1: number, y1: number, hw0: number, hw1: number, r: number, g: number, b: number, i0: number, i1: number, dash = 0, fade = 0) {
    if (this.n >= this.max) return
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    const nx = -dy / len
    const ny = dx / len
    const v = this.n * 4
    const w1 = fade ? 1 : len
    this.vert(v, x0 + nx * hw0, y0 + ny * hw0, 1, 0, r * i0, g * i0, b * i0, dash, fade)
    this.vert(v + 1, x0 - nx * hw0, y0 - ny * hw0, -1, 0, r * i0, g * i0, b * i0, dash, fade)
    this.vert(v + 2, x1 + nx * hw1, y1 + ny * hw1, 1, w1, r * i1, g * i1, b * i1, dash, fade)
    this.vert(v + 3, x1 - nx * hw1, y1 - ny * hw1, -1, w1, r * i1, g * i1, b * i1, dash, fade)
    this.n++
  }

  glow(x: number, y: number, rad: number, r: number, g: number, b: number, i: number) {
    if (this.n >= this.max) return
    const v = this.n * 4
    this.vert(v, x - rad, y + rad, -1, 1, r * i, g * i, b * i, 0, 2)
    this.vert(v + 1, x - rad, y - rad, -1, 0, r * i, g * i, b * i, 0, 2)
    this.vert(v + 2, x + rad, y + rad, 1, 1, r * i, g * i, b * i, 0, 2)
    this.vert(v + 3, x + rad, y - rad, 1, 0, r * i, g * i, b * i, 0, 2)
    this.n++
  }

  commit() {
    const n = this.n
    for (const a of [this.aPos, this.aUv, this.aCol, this.aMode]) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, n * 4 * a.itemSize)
      a.needsUpdate = true
    }
    this.geo.setDrawRange(0, n * 6)
  }

  dispose() {
    this.geo.dispose()
  }
}
