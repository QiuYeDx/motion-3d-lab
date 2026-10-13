/**
 * 2D granular sim of the hourglass's vertical cross-section (position-based dynamics + spatial hash).
 * Coordinates are in the hourglass's LOCAL frame: neck at y = 0, bulbs along ±y, walls at |x| = R(y).
 * Gravity is supplied in that local frame, so flipping the glass simply rotates the gravity vector.
 * The renderer revolves every grain around the y axis (x → radius), so a 2D pile becomes a 3D cone.
 */

/** half height of the glass interior (neck → cap) */
export const HALF = 1.55
/** widest bulb radius at neck width 0 */
export const RMAX = 0.86

/** bulb profile in [0, 1] for t = |y| / HALF (shared with the glass shader — keep in sync with GLSL `bulb`) */
export function bulb(t: number) {
  t = Math.min(Math.abs(t), 1)
  if (t < 0.7) return Math.pow(Math.sin((Math.PI / 2) * (t / 0.7)), 1.5)
  const u = (t - 0.7) / 0.3
  return 1 - 0.28 * Math.pow(u, 2.2)
}

export const BULB_GLSL = /* glsl */ `
float bulb(float t) {
  t = min(abs(t), 1.0);
  if (t < 0.7) return pow(sin(1.5707963 * (t / 0.7)), 1.5);
  float u = (t - 0.7) / 0.3;
  return 1.0 - 0.28 * pow(u, 2.2);
}
float profileR(float y, float neck) { return neck + (${RMAX.toFixed(4)} - neck) * bulb(y / ${HALF.toFixed(4)}); }
`

export function profileR(y: number, neck: number) {
  return neck + (RMAX - neck) * bulb(y / HALF)
}

const LUT = 1024
/** solver tuning: static / kinetic friction, iterations, velocity damping of grains wedged in the pile */
export const TUNE = { muS: 0.62, muK: 0.42, iters: 2, rest: 0.85, restN: 3, muCap: 0.8, muWall: 0.5, mass: 0.12 }

export class SandSim {
  readonly n: number
  readonly r: number
  readonly px: Float32Array
  readonly py: Float32Array
  readonly ox: Float32Array
  readonly oy: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  readonly rad: Float32Array
  readonly mu: Float32Array
  readonly cnt: Uint8Array
  /** gravity in the local frame */
  gx = 0
  gy = -14
  /** neck radius */
  neck = 0.05
  /** grains per second allowed through the throat — a steady, fill-independent flow like a real hourglass */
  flow = 110
  private tokens = 0
  private sub = 0
  private granted: Int32Array
  private lutNeck = -1
  private lut = new Float32Array(LUT + 1)
  // grid
  private cs: number
  private gw: number
  private gh: number
  private x0: number
  private y0: number
  private cellStart: Int32Array
  private cursor: Int32Array
  private sorted: Int32Array
  private pcell: Int32Array
  private flip = false
  private seed = 1234567

  constructor(n: number, r: number) {
    this.n = n
    this.r = r
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.ox = new Float32Array(n)
    this.oy = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.rad = new Float32Array(n)
    this.mu = new Float32Array(n)
    this.cnt = new Uint8Array(n)
    this.cs = 2 * r * 1.18
    this.x0 = -RMAX - 0.02
    this.y0 = -HALF - 0.02
    this.gw = Math.ceil((2 * RMAX + 0.04) / this.cs) + 1
    this.gh = Math.ceil((2 * HALF + 0.04) / this.cs) + 1
    this.cellStart = new Int32Array(this.gw * this.gh + 1)
    this.cursor = new Int32Array(this.gw * this.gh)
    this.sorted = new Int32Array(n)
    this.pcell = new Int32Array(n)
    this.granted = new Int32Array(n).fill(-1)
    for (let i = 0; i < n; i++) this.rad[i] = r * (0.84 + 0.32 * this.rand())
  }

  rand() {
    // xorshift — deterministic so every load looks the same
    let x = this.seed
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.seed = x >>> 0
    return this.seed / 4294967296
  }

  private buildLut() {
    if (Math.abs(this.lutNeck - this.neck) < 1e-5) return
    this.lutNeck = this.neck
    for (let k = 0; k <= LUT; k++) this.lut[k] = profileR((k / LUT) * HALF, this.neck)
  }

  /** wall radius at height y */
  R(y: number) {
    let f = (Math.abs(y) / HALF) * LUT
    if (f >= LUT) return this.lut[LUT]
    const k = f | 0
    f -= k
    return this.lut[k] + (this.lut[k + 1] - this.lut[k]) * f
  }

  /** wall slope dR/dy at height y */
  dR(y: number) {
    let f = (Math.abs(y) / HALF) * LUT
    if (f >= LUT) f = LUT - 1
    const k = f | 0
    const d = (this.lut[k + 1] - this.lut[k]) * (LUT / HALF)
    return y < 0 ? -d : d
  }

  /**
   * Fill both bulbs: `fracLower` of the grains as a cone on the lower cap, the rest in the upper bulb with a dimple.
   * `up` = +1 when the local +y bulb is on top.
   */
  init(fracLower: number, up = 1) {
    this.buildLut()
    const sp = 2 * this.r * 1.12
    const rowH = sp * 0.866
    type C = { x: number; y: number; k: number }
    const top: C[] = []
    const bot: C[] = []
    let row = 0
    for (let y = -HALF + this.r * 1.2; y < HALF - this.r; y += rowH, row++) {
      const R = this.R(y) - this.r * 1.2
      if (R <= 0) continue
      const off = (row & 1) * sp * 0.5
      for (let x = -R + off; x <= R; x += sp) {
        const yy = y * up // so "top" always means the upper bulb
        if (yy > this.r) top.push({ x, y, k: yy + 0.62 * Math.max(0, 0.42 - Math.abs(x)) })
        else if (yy < -this.r) bot.push({ x, y, k: yy + HALF + 0.58 * Math.abs(x) })
      }
    }
    // bottom: lowest "cone level" first; top: fill from the neck up, leaving a dimple over the neck
    bot.sort((a, b) => a.k - b.k)
    top.sort((a, b) => a.k - b.k)
    const nb = Math.min(bot.length, Math.round(this.n * fracLower))
    const nt = Math.min(top.length, this.n - nb)
    let i = 0
    const put = (c: C) => {
      this.px[i] = this.ox[i] = c.x + (this.rand() - 0.5) * this.r * 0.2
      this.py[i] = this.oy[i] = c.y + (this.rand() - 0.5) * this.r * 0.2
      this.vx[i] = this.vy[i] = 0
      i++
    }
    for (let k = 0; k < nb; k++) put(bot[k])
    for (let k = 0; k < nt; k++) put(top[k])
    // if the bulbs could not hold everything (should not happen) park the rest on the lower cap
    while (i < this.n) put(bot[(i * 7) % bot.length])
    this.walls()
  }

  /** advance by `steps` fixed substeps of `h` seconds */
  step(h: number, steps: number) {
    this.buildLut()
    for (let s = 0; s < steps; s++) this.substep(h)
  }

  private substep(h: number) {
    const { n, px, py, ox, oy, vx, vy, mu } = this
    const gx = this.gx * h
    const gy = this.gy * h
    const vmax = (this.r * 1.35) / h
    const vmax2 = vmax * vmax
    const neckZone = this.neck * 2.2
    const down = this.gy < 0 ? -1 : 1
    this.sub++
    this.tokens = Math.min(this.tokens + this.flow * h, 2)
    for (let i = 0; i < n; i++) {
      let ux = vx[i] + gx
      let uy = vy[i] + gy
      const s2 = ux * ux + uy * uy
      if (s2 > vmax2) {
        const k = vmax / Math.sqrt(s2)
        ux *= k
        uy *= k
      }
      ox[i] = px[i]
      oy[i] = py[i]
      px[i] += ux * h
      py[i] += uy * h
      // grains in the throat lose most of their friction and (upstream of the gate) get a tiny shake,
      // so arches never jam the neck
      if (Math.abs(py[i]) < neckZone) {
        mu[i] = 0.12
        if (py[i] * down <= 0) px[i] += (this.rand() - 0.5) * this.r * 0.1
      } else mu[i] = 1
    }
    this.walls()
    this.buildGrid()
    this.cnt.fill(0)
    for (let it = 0; it < TUNE.iters; it++) {
      this.contacts()
      this.walls()
    }
    const inv = 1 / h
    const cnt = this.cnt
    const rest = TUNE.rest
    const restN = TUNE.restN * TUNE.iters
    const vertical = Math.abs(this.gy) > Math.abs(this.gx) * 2
    const collim = this.neck * 3
    for (let i = 0; i < n; i++) {
      // grains wedged between several neighbours shed energy fast (stands in for rolling resistance)
      const k = cnt[i] >= restN ? rest : 0.998
      vx[i] = (px[i] - ox[i]) * inv * k
      vy[i] = (py[i] - oy[i]) * inv * k
      // free-falling grains below the throat keep a narrow, nearly vertical stream
      if (vertical && cnt[i] === 0 && py[i] * down > 0 && Math.abs(px[i]) < collim) {
        vx[i] = vx[i] * 0.86 - px[i] * 2.5
      }
    }
  }

  private walls() {
    const { n, px, py, ox, oy, rad, granted } = this
    const muC = TUNE.muCap
    const muW = TUNE.muWall
    // the throat meters grains: crossing y = 0 along gravity costs a token, otherwise the grain waits on the gate
    const gate = Math.abs(this.gy) > Math.abs(this.gx) * 0.6
    const down = this.gy < 0 ? -1 : 1
    for (let i = 0; i < n; i++) {
      if (gate && oy[i] * down < 0 && py[i] * down >= 0 && granted[i] !== this.sub) {
        if (this.tokens >= 1) {
          this.tokens -= 1
          granted[i] = this.sub
        } else py[i] = -down * 1e-4
      }
      const r = rad[i]
      let x = px[i]
      let y = py[i]
      if (!(x === x) || !(y === y)) {
        // NaN guard — never happens in practice, but a lost grain must not poison the buffer
        x = 0
        y = 0
        ox[i] = 0
        oy[i] = 0
      }
      const lim = HALF - r
      if (y > lim || y < -lim) {
        const pen = (y > 0 ? y - lim : -lim - y)
        y = y > 0 ? lim : -lim
        // Coulomb friction against the cap
        const tx = x - ox[i]
        const al = Math.abs(tx)
        x -= al < muC * pen ? tx : (tx * muC * pen) / al
      }
      let R = this.R(y) - r
      const ax = x < 0 ? -x : x
      if (ax > R) {
        // push out along the true wall normal, then Coulomb friction scaled by how hard the grain presses
        const sx = x < 0 ? -1 : 1
        const dR = this.dR(y)
        const inv = 1 / Math.sqrt(1 + dR * dR)
        const nx = sx * inv
        const ny = -dR * inv
        const pen = (ax - R) * inv
        x -= nx * pen
        y -= ny * pen
        const dx = x - ox[i]
        const dy = y - oy[i]
        const dn = dx * nx + dy * ny
        const tx = dx - dn * nx
        const ty = dy - dn * ny
        const tl = Math.sqrt(tx * tx + ty * ty)
        if (tl > 1e-12) {
          const k = tl < muW * pen ? 1 : (muW * pen) / tl
          x -= tx * k
          y -= ty * k
        }
        // hard guarantee: never outside the glass
        if (y > lim) y = lim
        else if (y < -lim) y = -lim
        R = this.R(y) - r
        if (x > R) x = R
        else if (x < -R) x = -R
      }
      px[i] = x
      py[i] = y
    }
  }

  private buildGrid() {
    const { n, px, py, cellStart, cursor, sorted, pcell, gw, gh, cs, x0, y0 } = this
    const nc = gw * gh
    cellStart.fill(0)
    const inv = 1 / cs
    for (let i = 0; i < n; i++) {
      let cx = ((px[i] - x0) * inv) | 0
      let cy = ((py[i] - y0) * inv) | 0
      if (cx < 0) cx = 0
      else if (cx >= gw) cx = gw - 1
      if (cy < 0) cy = 0
      else if (cy >= gh) cy = gh - 1
      const c = cy * gw + cx
      pcell[i] = c
      cellStart[c + 1]++
    }
    for (let c = 0; c < nc; c++) {
      cellStart[c + 1] += cellStart[c]
      cursor[c] = cellStart[c]
    }
    for (let i = 0; i < n; i++) sorted[cursor[pcell[i]]++] = i
  }

  private contacts() {
    const { gw, gh, cellStart, sorted, px, py, ox, oy, rad, mu, cnt } = this
    const muS = TUNE.muS
    const muK = TUNE.muK
    // mass scaling (Macklin et al.): the grain lower along gravity is "heavier" and moves less, which
    // makes deep piles stiff with only a couple of Gauss–Seidel iterations
    const gl = Math.hypot(this.gx, this.gy) || 1
    const upx = (-this.gx / gl) * TUNE.mass / (2 * this.r)
    const upy = (-this.gy / gl) * TUNE.mass / (2 * this.r)
    this.flip = !this.flip
    // alternate the sweep direction so Gauss–Seidel bias does not lean the piles to one side
    const rev = this.flip
    const nc = gw * gh
    // neighbour offsets of the forward half-stencil: self, (+1,0) (-1,+1) (0,+1) (+1,+1)
    for (let q = 0; q < nc; q++) {
      const c = rev ? nc - 1 - q : q
      const s = cellStart[c]
      const e = cellStart[c + 1]
      if (s === e) continue
      const cx = c % gw
      const cy = (c - cx) / gw
      for (let a = s; a < e; a++) {
        const i = sorted[a]
        for (let k = 0; k < 5; k++) {
          let b0: number
          let b1: number
          if (k === 0) {
            b0 = a + 1
            b1 = e
          } else {
            let cc: number
            if (k === 1) {
              if (cx + 1 >= gw) continue
              cc = c + 1
            } else {
              if (cy + 1 >= gh) break
              if (k === 2) {
                if (cx === 0) continue
                cc = c + gw - 1
              } else if (k === 3) cc = c + gw
              else {
                if (cx + 1 >= gw) continue
                cc = c + gw + 1
              }
            }
            b0 = cellStart[cc]
            b1 = cellStart[cc + 1]
          }
          for (let b = b0; b < b1; b++) {
            const j = sorted[b]
            let dx = px[j] - px[i]
            let dy = py[j] - py[i]
            const rr = rad[i] + rad[j]
            const d2 = dx * dx + dy * dy
            if (d2 >= rr * rr) continue
            let d = Math.sqrt(d2)
            if (d < 1e-7) {
              dx = ((i * 7919) % 13) * 1e-5 - 6e-5
              dy = 1e-4
              d = Math.sqrt(dx * dx + dy * dy)
            }
            const nx = dx / d
            const ny = dy / d
            const pen = rr - d
            let si = 0.5 + (px[i] - px[j]) * upx + (py[i] - py[j]) * upy
            si = si < 0.06 ? 0.06 : si > 0.94 ? 0.94 : si
            const sj = 1 - si
            cnt[i]++
            cnt[j]++
            px[i] -= nx * pen * si
            py[i] -= ny * pen * si
            px[j] += nx * pen * sj
            py[j] += ny * pen * sj
            // Coulomb friction on the relative tangential displacement of this substep
            const rx = px[j] - ox[j] - (px[i] - ox[i])
            const ry = py[j] - oy[j] - (py[i] - oy[i])
            const rn = rx * nx + ry * ny
            const tx = rx - rn * nx
            const ty = ry - rn * ny
            const tl = Math.sqrt(tx * tx + ty * ty)
            if (tl < 1e-9) continue
            const m = mu[i] < mu[j] ? mu[i] : mu[j]
            const f = tl < muS * m * pen ? 1 : Math.min((muK * m * pen) / tl, 1)
            px[i] += tx * f * si
            py[i] += ty * f * si
            px[j] -= tx * f * sj
            py[j] -= ty * f * sj
          }
        }
      }
    }
  }

  /** grains on the side of the neck that currently points up (`up` = sign of local up's y) */
  countUpper(up: number) {
    const { n, py } = this
    let c = 0
    if (up >= 0) {
      for (let i = 0; i < n; i++) if (py[i] > 0) c++
    } else {
      for (let i = 0; i < n; i++) if (py[i] < 0) c++
    }
    return c
  }
}
