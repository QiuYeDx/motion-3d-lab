/** Point-cloud generators. Every function fills `n` xyz triplets, roughly within radius ~2.4. */

const TAU = Math.PI * 2
const rnd = (a = 1) => (Math.random() * 2 - 1) * a

export type ShapeFn = (n: number) => Float32Array

export const sphere: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const th = g * i
    const s = 2.2 * (1 + rnd(0.015))
    out.set([Math.cos(th) * r * s, y * s, Math.sin(th) * r * s], i * 3)
  }
  return out
}

export const torusKnot: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const p = 2
  const q = 3
  const R = 1.35
  const tube = 0.34
  const P = (u: number) => {
    const cu = Math.cos(u)
    const su = Math.sin(u)
    const quOverP = (q / p) * u
    const cs = Math.cos(quOverP)
    return [R * (2 + cs) * 0.5 * cu, R * (2 + cs) * su * 0.5, R * Math.sin(quOverP) * 0.5]
  }
  for (let i = 0; i < n; i++) {
    const u = (i / n) * TAU * p
    const a = P(u)
    const b = P(u + 0.01)
    const T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const N = [b[0] + a[0], b[1] + a[1], b[2] + a[2]]
    const B = cross(T, N)
    norm(B)
    const N2 = cross(B, T)
    norm(N2)
    const v = Math.random() * TAU
    const r = tube * Math.sqrt(0.75 + Math.random() * 0.25)
    const cx = -r * Math.cos(v)
    const cy = r * Math.sin(v)
    out.set([(a[0] + cx * N2[0] + cy * B[0]) * 1.3, (a[1] + cx * N2[1] + cy * B[1]) * 1.3, (a[2] + cx * N2[2] + cy * B[2]) * 1.3], i * 3)
  }
  return out
}

export const helix: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const turns = 2.6
  const h = 5
  for (let i = 0; i < n; i++) {
    const k = Math.random()
    const y = (k - 0.5) * h
    const a = k * turns * TAU
    const type = Math.random()
    if (type < 0.78) {
      const s = type < 0.39 ? 0 : Math.PI
      const r = 1.05 + rnd(0.07)
      out.set([Math.cos(a + s) * r + rnd(0.05), y + rnd(0.05), Math.sin(a + s) * r + rnd(0.05)], i * 3)
    } else {
      // rungs
      const kk = Math.round(k * 34) / 34
      const yy = (kk - 0.5) * h
      const aa = kk * turns * TAU
      const t = rnd(1)
      out.set([Math.cos(aa) * t * 1.05, yy + rnd(0.02), Math.sin(aa) * t * 1.05], i * 3)
    }
  }
  return out
}

export const saddle: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const side = Math.ceil(Math.sqrt(n))
  for (let i = 0; i < n; i++) {
    const gx = (i % side) / (side - 1) - 0.5
    const gz = Math.floor(i / side) / (side - 1) - 0.5
    const x = gx * 4.2
    const z = gz * 4.2
    out.set([x, (x * x - z * z) * 0.28, z], i * 3)
  }
  return out
}

export const lattice: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const k = 3 // 4 nodes per axis
  const s = 3.6
  for (let i = 0; i < n; i++) {
    const axis = i % 3
    const a = (Math.floor(Math.random() * (k + 1)) / k - 0.5) * s
    const b = (Math.floor(Math.random() * (k + 1)) / k - 0.5) * s
    const t = (Math.random() - 0.5) * s
    const j = rnd(0.025)
    const p = axis === 0 ? [t, a + j, b] : axis === 1 ? [a, t, b + j] : [a + j, b, t]
    out.set(p, i * 3)
  }
  return out
}

export const galaxy: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  const arms = 3
  for (let i = 0; i < n; i++) {
    const r = Math.pow(Math.random(), 1.6) * 3
    const arm = (i % arms) / arms
    const a = arm * TAU + r * 1.35
    const spread = Math.pow(Math.random(), 3) * (0.55 - r * 0.08) + 0.02
    out.set(
      [Math.cos(a) * r + rnd(spread) , rnd(0.08) * (1.2 - r / 3), Math.sin(a) * r + rnd(spread)],
      i * 3,
    )
  }
  return out
}

export const mobius: ShapeFn = (n) => {
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const u = Math.random() * TAU
    const v = rnd(0.6)
    const R = 1.8
    out.set(
      [(R + v * Math.cos(u / 2)) * Math.cos(u), v * Math.sin(u / 2), (R + v * Math.cos(u / 2)) * Math.sin(u)],
      i * 3,
    )
  }
  return out
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function norm(v: number[]) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  v[0] /= l
  v[1] /= l
  v[2] /= l
}

/** shuffle triplets in place so morph pairs are spatially random (nicer swirl) */
export function shuffle3(a: Float32Array) {
  const n = a.length / 3
  for (let i = n - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    for (let k = 0; k < 3; k++) {
      const t = a[i * 3 + k]
      a[i * 3 + k] = a[j * 3 + k]
      a[j * 3 + k] = t
    }
  }
  return a
}

/** Sample filled pixels of rendered text into `n` points (x right, y up), width ≈ `width` units */
export function textPoints(text: string, n: number, width = 6, font = '700 160px "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif') {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 40
  const h = 220
  c.width = w
  c.height = h
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, w / 2, h / 2)
  const data = ctx.getImageData(0, 0, w, h).data
  const pix: number[] = []
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (data[(y * w + x) * 4 + 3] > 128) pix.push(x, y)
  const out = new Float32Array(n * 3)
  const scale = width / Math.max(w, 600)
  const m = pix.length / 2
  for (let i = 0; i < n; i++) {
    if (!m) break
    const j = (Math.random() * m) | 0
    out.set([(pix[j * 2] - w / 2 + Math.random() * 2) * scale, (h / 2 - pix[j * 2 + 1] + Math.random() * 2) * scale, rnd(0.06)], i * 3)
  }
  return out
}
