/* Neural-net demo model: layer layouts, sparse connection sampling, a plausible "forward pass" and a tiny
 * nearest-template digit classifier (so hand-drawn input gets a sensible answer). Pure data, no React/three. */

export const SIDE = 16 // input image is SIDE × SIDE

export type LayerSpec = { kind: 'grid'; side: number; cell: number } | { kind: 'disc'; n: number; r: number } | { kind: 'column'; n: number }

export type NetPreset = { key: string; label: string; en: string; layers: LayerSpec[] }

export const NETS: NetPreset[] = [
  {
    key: 's',
    label: '浅',
    en: '5 layers',
    layers: [
      { kind: 'grid', side: SIDE, cell: 0.2 },
      { kind: 'grid', side: 8, cell: 0.36 },
      { kind: 'disc', n: 40, r: 1.15 },
      { kind: 'disc', n: 20, r: 0.85 },
      { kind: 'column', n: 10 },
    ],
  },
  {
    key: 'm',
    label: '标准',
    en: '6 layers',
    layers: [
      { kind: 'grid', side: SIDE, cell: 0.2 },
      { kind: 'grid', side: 8, cell: 0.36 },
      { kind: 'disc', n: 56, r: 1.3 },
      { kind: 'disc', n: 36, r: 1.05 },
      { kind: 'disc', n: 20, r: 0.8 },
      { kind: 'column', n: 10 },
    ],
  },
  {
    key: 'l',
    label: '深宽',
    en: '7 layers',
    layers: [
      { kind: 'grid', side: SIDE, cell: 0.2 },
      { kind: 'grid', side: 10, cell: 0.31 },
      { kind: 'grid', side: 8, cell: 0.36 },
      { kind: 'disc', n: 64, r: 1.4 },
      { kind: 'disc', n: 44, r: 1.15 },
      { kind: 'disc', n: 24, r: 0.85 },
      { kind: 'column', n: 10 },
    ],
  },
]

export const SPACING = 1.85
export const COL_GAP = 0.42
/** every layer plane is turned about the vertical axis so it faces the 3/4 camera (the digit stays readable) */
export const TILT = THREE_DEG(38)
function THREE_DEG(d: number) {
  return (d * Math.PI) / 180
}
const TS = Math.sin(TILT)
const TC = Math.cos(TILT)
/** world point on layer 0's plane → (column, row) in input pixels */
export function inputCell(x0: number, hx: number, hy: number, hz: number, cell: number) {
  const u = (hx - x0) * TS + hz * TC // in-plane horizontal coordinate
  return { c: u / cell + SIDE / 2, r: SIDE / 2 - hy / cell }
}
/** normal of every layer plane (pointing toward +x / the next layer) */
export const PLANE_N = [TC, 0, -TS] as const

export type Net = {
  L: number
  N: number
  start: number[]
  count: number[]
  x: number[]
  pos: Float32Array // N × 3
  layerOf: Uint8Array
  /** sparse drawn connections (global neuron indices) + transition index */
  lineSrc: Int32Array
  lineDst: Int32Array
  lineLayer: Uint8Array
  /** dense weights per transition l → l+1 (n_{l+1} × n_l) used for the activations */
  W: Float32Array[]
  /** per hidden layer: a sparse class code per class (makes deep layers agree with the answer) */
  codes: Float32Array[][]
}

function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildNet(p: NetPreset): Net {
  const rnd = mulberry(7 + p.layers.length * 101)
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2831853 * rnd())
  const L = p.layers.length
  const count = p.layers.map((l) => (l.kind === 'grid' ? l.side * l.side : l.n))
  const start: number[] = []
  let N = 0
  for (const c of count) {
    start.push(N)
    N += c
  }
  const x = p.layers.map((_, i) => (i - (L - 1) / 2) * SPACING)
  const pos = new Float32Array(N * 3)
  const layerOf = new Uint8Array(N)
  p.layers.forEach((l, li) => {
    for (let k = 0; k < count[li]; k++) {
      const g = start[li] + k
      layerOf[g] = li
      let y = 0
      let z = 0
      if (l.kind === 'grid') {
        const c = k % l.side
        const r = Math.floor(k / l.side)
        y = (l.side / 2 - r - 0.5) * l.cell
        z = (c - l.side / 2 + 0.5) * l.cell
      } else if (l.kind === 'disc') {
        const rr = l.r * Math.sqrt((k + 0.5) / l.n)
        const th = k * 2.39996323
        y = Math.sin(th) * rr
        z = Math.cos(th) * rr
      } else {
        y = ((l.n - 1) / 2 - k) * COL_GAP
      }
      pos[g * 3] = x[li] + z * TS
      pos[g * 3 + 1] = y
      pos[g * 3 + 2] = z * TC
    }
  })

  /* dense weights: first layer = local receptive fields on the image, deeper = random gaussian */
  const W: Float32Array[] = []
  for (let l = 0; l < L - 1; l++) {
    const ns = count[l]
    const nd = count[l + 1]
    const w = new Float32Array(nd * ns)
    const src = p.layers[l]
    const dst = p.layers[l + 1]
    for (let j = 0; j < nd; j++) {
      for (let i = 0; i < ns; i++) {
        let v = gauss()
        if (src.kind === 'grid' && dst.kind === 'grid' && l === 0) {
          // receptive field: pixels near the corresponding image location
          const sc = i % src.side
          const sr = Math.floor(i / src.side)
          const f = src.side / dst.side
          const dc = ((j % dst.side) + 0.5) * f
          const dr = (Math.floor(j / dst.side) + 0.5) * f
          const d2 = (sc + 0.5 - dc) ** 2 + (sr + 0.5 - dr) ** 2
          v = d2 < (f * 1.6) ** 2 ? Math.abs(v) * 0.8 + 0.4 - 0.25 * Math.sqrt(d2) : 0
        }
        w[j * ns + i] = v
      }
    }
    W.push(w)
  }

  /* class codes for hidden layers */
  const codes: Float32Array[][] = []
  for (let l = 0; l < L; l++) {
    const per: Float32Array[] = []
    for (let c = 0; c < 10; c++) {
      const v = new Float32Array(count[l])
      for (let k = 0; k < count[l]; k++) v[k] = rnd() < 0.22 ? 0.65 + 0.35 * rnd() : 0
      per.push(v)
    }
    codes.push(per)
  }

  /* sparse drawn connections */
  const ls: number[] = []
  const ld: number[] = []
  const ll: number[] = []
  for (let l = 0; l < L - 1; l++) {
    const ns = count[l]
    const nd = count[l + 1]
    const w = W[l]
    const isOut = l === L - 2
    const per = l === 0 ? 4 : isOut ? 9 : nd > 40 ? 5 : 6
    for (let j = 0; j < nd; j++) {
      const picked = new Set<number>()
      if (l === 0) {
        // strongest receptive-field pixels
        const cand: number[] = []
        for (let i = 0; i < ns; i++) if (w[j * ns + i] > 0) cand.push(i)
        while (picked.size < Math.min(per, cand.length)) picked.add(cand[Math.floor(rnd() * cand.length)])
      } else {
        if (isOut) {
          // the last hidden layer's code neurons for this class always connect to it
          const code = codes[l][j]
          for (let i = 0; i < ns && picked.size < per - 3; i++) if (code[i] > 0) picked.add(i)
        }
        while (picked.size < Math.min(per, ns)) picked.add(Math.floor(rnd() * ns))
      }
      for (const i of picked) {
        ls.push(start[l] + i)
        ld.push(start[l + 1] + j)
        ll.push(l)
      }
    }
  }
  return {
    L,
    N,
    start,
    count,
    x,
    pos,
    layerOf,
    lineSrc: Int32Array.from(ls),
    lineDst: Int32Array.from(ld),
    lineLayer: Uint8Array.from(ll),
    W,
    codes,
  }
}

/** activations per layer (each in 0..1); output = class probabilities scaled so the winner is 1 */
export function forward(net: Net, input: Float32Array, probs: Float32Array, winner: number, seed: number): Float32Array[] {
  const rnd = mulberry(seed)
  const acts: Float32Array[] = [input]
  for (let l = 1; l < net.L; l++) {
    const n = net.count[l]
    const a = new Float32Array(n)
    if (l === net.L - 1) {
      let mx = 0
      for (let k = 0; k < n; k++) mx = Math.max(mx, probs[k])
      for (let k = 0; k < n; k++) a[k] = probs[k] / (mx || 1)
      acts.push(a)
      break
    }
    const prev = acts[l - 1]
    const ns = net.count[l - 1]
    const w = net.W[l - 1]
    let mean = 0
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let i = 0; i < ns; i++) s += w[j * ns + i] * prev[i]
      a[j] = s
      mean += s
    }
    mean /= n
    let v = 0
    for (let j = 0; j < n; j++) v += (a[j] - mean) ** 2
    const sd = Math.sqrt(v / n) || 1
    // deeper layers lean more on the class code → the signal visibly converges on the answer
    const alpha = 0.15 + 0.55 * ((l - 1) / Math.max(1, net.L - 3))
    const code = net.codes[l][winner]
    for (let j = 0; j < n; j++) {
      const z = Math.max(0, ((a[j] - mean) / sd) * 0.42 + 0.12)
      const r = Math.min(1, Math.pow(z, 1.15))
      a[j] = Math.min(1, (1 - alpha) * r + alpha * code[j] * (0.75 + 0.25 * rnd()))
    }
    acts.push(a)
  }
  return acts
}

/* ------------------------------------------------------------------ digits */

const HAND = ['"Segoe Script"', '"Ink Free"', '"Segoe Print"', '"Comic Sans MS"', 'cursive']
const PRINT = ['Georgia', '"Segoe UI"', 'Arial', '"Trebuchet MS"', 'sans-serif']

let big: HTMLCanvasElement | null = null
let mid: HTMLCanvasElement | null = null
let small: HTMLCanvasElement | null = null

function canvases() {
  if (!big) {
    big = document.createElement('canvas')
    big.width = big.height = 64
    mid = document.createElement('canvas')
    mid.width = mid.height = 32
    small = document.createElement('canvas')
    small.width = small.height = SIDE
  }
  return [big, mid!, small!] as const
}

/** render a digit into a SIDE×SIDE intensity grid (row-major, row 0 = top) */
export function renderDigit(d: number, jitter: number, rnd: () => number = Math.random, fontOverride?: string): Float32Array {
  const [b, m, s] = canvases()
  const bc = b.getContext('2d')!
  bc.setTransform(1, 0, 0, 1, 0, 0)
  bc.fillStyle = '#000'
  bc.fillRect(0, 0, 64, 64)
  const fonts = jitter > 0 ? (rnd() < 0.65 ? HAND : PRINT) : PRINT
  const font = fontOverride ?? fonts[Math.floor(rnd() * fonts.length)]
  const weight = fontOverride ? 600 : rnd() < 0.4 ? 600 : 400
  const size = 50 + (rnd() - 0.5) * 10 * jitter
  bc.translate(32 + (rnd() - 0.5) * 7 * jitter, 34 + (rnd() - 0.5) * 6 * jitter)
  bc.rotate((rnd() - 0.5) * 0.4 * jitter)
  bc.font = `${weight} ${size}px ${font}, sans-serif`
  bc.textAlign = 'center'
  bc.textBaseline = 'middle'
  bc.fillStyle = '#fff'
  bc.strokeStyle = '#fff'
  bc.lineWidth = 0.8 + rnd() * 1.6 * jitter
  bc.fillText(String(d), 0, 2)
  bc.strokeText(String(d), 0, 2)
  const mc = m.getContext('2d')!
  mc.imageSmoothingEnabled = true
  mc.clearRect(0, 0, 32, 32)
  mc.drawImage(b, 0, 0, 32, 32)
  const sc = s.getContext('2d', { willReadFrequently: true })!
  sc.imageSmoothingEnabled = true
  sc.clearRect(0, 0, SIDE, SIDE)
  sc.drawImage(m, 0, 0, SIDE, SIDE)
  const px = sc.getImageData(0, 0, SIDE, SIDE).data
  const out = new Float32Array(SIDE * SIDE)
  let mx = 0
  for (let i = 0; i < out.length; i++) {
    out[i] = px[i * 4] / 255
    mx = Math.max(mx, out[i])
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.pow(out[i] / (mx || 1), 0.8) * 1.15)
  return out
}

/** crop to the ink's bounding box, scale to fit 12 px, centre, blur a little, zero-mean / unit-norm */
function features(g: Float32Array): Float32Array {
  let x0 = SIDE
  let y0 = SIDE
  let x1 = -1
  let y1 = -1
  for (let r = 0; r < SIDE; r++)
    for (let c = 0; c < SIDE; c++)
      if (g[r * SIDE + c] > 0.2) {
        x0 = Math.min(x0, c)
        x1 = Math.max(x1, c)
        y0 = Math.min(y0, r)
        y1 = Math.max(y1, r)
      }
  const f = new Float32Array(SIDE * SIDE)
  if (x1 < 0) return f
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const k = 12 / Math.max(w, h)
  const ox = SIDE / 2 - (w * k) / 2
  const oy = SIDE / 2 - (h * k) / 2
  const at = (c: number, r: number) => {
    const cc = Math.min(SIDE - 1, Math.max(0, c))
    const rr = Math.min(SIDE - 1, Math.max(0, r))
    return g[rr * SIDE + cc]
  }
  const tmp = new Float32Array(SIDE * SIDE)
  for (let r = 0; r < SIDE; r++)
    for (let c = 0; c < SIDE; c++) {
      const sx = (c + 0.5 - ox) / k + x0 - 0.5
      const sy = (r + 0.5 - oy) / k + y0 - 0.5
      if (sx < x0 - 1 || sx > x1 + 1 || sy < y0 - 1 || sy > y1 + 1) continue
      const ix = Math.floor(sx)
      const iy = Math.floor(sy)
      const fx = sx - ix
      const fy = sy - iy
      tmp[r * SIDE + c] = (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy
    }
  // 3×3 blur
  let mean = 0
  for (let r = 0; r < SIDE; r++)
    for (let c = 0; c < SIDE; c++) {
      let s = 0
      let n = 0
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || cc < 0 || rr >= SIDE || cc >= SIDE) continue
          const wgt = dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1
          s += tmp[rr * SIDE + cc] * wgt
          n += wgt
        }
      f[r * SIDE + c] = s / n
      mean += f[r * SIDE + c]
    }
  mean /= f.length
  let norm = 0
  for (let i = 0; i < f.length; i++) {
    f[i] -= mean
    norm += f[i] * f[i]
  }
  norm = Math.sqrt(norm) || 1
  for (let i = 0; i < f.length; i++) f[i] /= norm
  return f
}

let templates: { d: number; f: Float32Array }[] | null = null

function getTemplates() {
  if (!templates) {
    templates = []
    const fonts = ['Arial', 'Georgia', '"Segoe Print"', '"Segoe Script"', '"Ink Free"']
    for (let d = 0; d < 10; d++) for (const font of fonts) templates.push({ d, f: features(renderDigit(d, 0, () => 0.5, font)) })
  }
  return templates
}

/** nearest-template classifier → softmax probabilities over 0–9 */
export function classify(g: Float32Array, out: Float32Array) {
  const f = features(g)
  const best = new Float32Array(10).fill(-1)
  for (const t of getTemplates()) {
    let s = 0
    for (let i = 0; i < f.length; i++) s += f[i] * t.f[i]
    if (s > best[t.d]) best[t.d] = s
  }
  let mx = -Infinity
  for (let d = 0; d < 10; d++) mx = Math.max(mx, best[d])
  let sum = 0
  for (let d = 0; d < 10; d++) {
    out[d] = Math.exp((best[d] - mx) * 22)
    sum += out[d]
  }
  let win = 0
  for (let d = 0; d < 10; d++) {
    out[d] /= sum
    if (out[d] > out[win]) win = d
  }
  return win
}

/** probabilities for a known label: confident, with a believable runner-up */
const CONFUSE = [6, 7, 7, 8, 9, 6, 5, 1, 3, 4]
export function labelProbs(d: number, rnd: () => number, out: Float32Array) {
  const conf = 0.82 + rnd() * 0.16
  let rest = 1 - conf
  out.fill(0)
  out[d] = conf
  const r2 = rest * (0.45 + rnd() * 0.3)
  out[CONFUSE[d]] += r2
  rest -= r2
  for (let k = 0; k < 10; k++) {
    if (k === d) continue
    const v = rest * rnd() * 0.35
    out[k] += v
    rest -= v
  }
  out[(d + 3) % 10] += rest
}
