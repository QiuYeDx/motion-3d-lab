import * as THREE from 'three'

/* Fireworks simulation: a packed CPU particle pool (typed arrays, swap-remove), rockets, flashes and smoke puffs.
   Everything here is plain data + math; the React page drives `step()` from useFrame and uploads the outputs. */

export type TypeId = 'chrys' | 'peony' | 'willow' | 'ring' | 'heart' | 'star' | 'crackle'

export const TYPES: { id: TypeId; zh: string; en: string; aside: string }[] = [
  { id: 'chrys', zh: '菊花', en: 'Chrysanthemum', aside: 'spherical · comet trails' },
  { id: 'peony', zh: '牡丹', en: 'Peony', aside: 'crisp stars · pistil core' },
  { id: 'willow', zh: '柳枝', en: 'Willow', aside: 'long drooping gold' },
  { id: 'ring', zh: '环形', en: 'Ring', aside: 'random plane · core' },
  { id: 'heart', zh: '心形', en: 'Heart', aside: 'shaped burst' },
  { id: 'star', zh: '星形', en: 'Star', aside: 'shaped burst' },
  { id: 'crackle', zh: '闪烁', en: 'Crackle', aside: 'strobe · crackling' },
]

type RGB = [number, number, number]
const lin = (hex: string): RGB => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
// colour pairs: the star burns c0 and switches to c1 late in its life
const PALETTES: [RGB, RGB][] = (
  [
    ['#ff3048', '#ffc24a'],
    ['#38ff7a', '#eef4ff'],
    ['#3f6bff', '#c060ff'],
    ['#ffc94a', '#ff3a2e'],
    ['#e8eeff', '#4aa0ff'],
    ['#ff4fb8', '#fff0f6'],
    ['#2ff0ff', '#6dff5a'],
    ['#a85cff', '#ff4f8f'],
    ['#ff7a1e', '#3dff9a'],
  ] as [string, string][]
).map(([a, b]) => [lin(a), lin(b)])
export const PALETTE_COUNT = PALETTES.length
const GOLD = lin('#ffb347')
const EMBER = lin('#ff5a14')
const WHITE: RGB = [1, 1, 1]
const CRACKLE = lin('#fff2cf')

/* particle record layout (floats) */
const S = 24
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, DRAG = 8, GRAV = 9, SIZE = 10
const R0 = 11, G0 = 12, B0 = 13, R1 = 14, G1 = 15, B1 = 16, CHG = 17, KIND = 18, TRATE = 19, TACC = 20, PHASE = 21, BRIGHT = 22, FLAGS = 23
const K_STAR = 0, K_EMBER = 1, K_SPARK = 2, K_GLITTER = 3, K_WILLOW = 4
const F_CRACKLE = 1, F_STROBE = 2, F_WILLOW = 4

export type Flash = { x: number; y: number; z: number; r: number; g: number; b: number; fast: number; slow: number }
type Rocket = { x0: number; x1: number; y1: number; z: number; t: number; dur: number; type: TypeId; pal: number; seed: number; acc: number; px: number; py: number; scale: number }
type Puff = { x: number; y: number; z: number; vx: number; vy: number; age: number; life: number; size0: number; size1: number; alpha: number; rot: number; spin: number; tile: number }

export type AudioHooks = { boom: (delay: number, gain: number) => void; crackle: (delay: number) => void; thump: () => void }

export const SMOKE_MAX = 240

export class FireworksEngine {
  readonly max: number
  readonly P: Float32Array
  n = 0
  // render outputs (+64 for rocket heads)
  readonly outPos: Float32Array
  readonly outCol: Float32Array
  readonly outSize: Float32Array
  outCount = 0
  rockets: Rocket[] = []
  flashes: Flash[] = []
  puffs: Puff[] = []
  readonly smokePos = new Float32Array(SMOKE_MAX * 3)
  readonly smokeCol = new Float32Array(SMOKE_MAX * 4)
  readonly smokeSize = new Float32Array(SMOKE_MAX * 3) // size, rotation, tile
  smokeCount = 0
  quality: number
  scale = 1 // burst size multiplier (portrait screens shrink bursts)
  audio: AudioHooks | null = null
  onBurst: ((type: TypeId, stars: number) => void) | null = null
  shells = 0

  constructor(max: number, quality: number) {
    this.max = max
    this.quality = quality
    this.P = new Float32Array(max * S)
    this.outPos = new Float32Array((max + 64) * 3)
    this.outCol = new Float32Array((max + 64) * 3)
    this.outSize = new Float32Array(max + 64)
  }

  private add(): number {
    if (this.n >= this.max) return -1
    const o = this.n * S
    this.n++
    this.P.fill(0, o, o + S)
    return o
  }

  private star(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, drag: number, grav: number, size: number, c0: RGB, c1: RGB, change: number, trail: number, flags: number, bright: number) {
    const o = this.add()
    if (o < 0) return
    const P = this.P
    P[o + PX] = x; P[o + PY] = y; P[o + PZ] = z
    P[o + VX] = vx; P[o + VY] = vy; P[o + VZ] = vz
    P[o + LIFE] = life; P[o + DRAG] = drag; P[o + GRAV] = grav; P[o + SIZE] = size
    P[o + R0] = c0[0]; P[o + G0] = c0[1]; P[o + B0] = c0[2]
    P[o + R1] = c1[0]; P[o + G1] = c1[1]; P[o + B1] = c1[2]
    P[o + CHG] = change; P[o + KIND] = K_STAR; P[o + TRATE] = trail; P[o + TACC] = Math.random()
    P[o + PHASE] = Math.random(); P[o + BRIGHT] = bright; P[o + FLAGS] = flags
  }

  private ember(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, drag: number, grav: number, size: number, r: number, g: number, b: number, kind: number, bright: number) {
    const o = this.add()
    if (o < 0) return
    const P = this.P
    P[o + PX] = x; P[o + PY] = y; P[o + PZ] = z
    P[o + VX] = vx; P[o + VY] = vy; P[o + VZ] = vz
    P[o + LIFE] = life; P[o + DRAG] = drag; P[o + GRAV] = grav; P[o + SIZE] = size
    P[o + R0] = r; P[o + G0] = g; P[o + B0] = b
    P[o + KIND] = kind; P[o + PHASE] = Math.random(); P[o + BRIGHT] = bright
  }

  /* ---------------------------------------------------------------- launching */

  launch(x1: number, y1: number, z: number, type: TypeId, pal = Math.floor(Math.random() * PALETTES.length), delay = 0) {
    const dur = 1.05 + (y1 / 40) * 0.75 + Math.random() * 0.15
    this.rockets.push({ x0: x1 + (Math.random() - 0.5) * 4, x1, y1, z, t: -delay / dur, dur, type, pal, seed: Math.random() * 100, acc: 0, px: x1, py: 0, scale: this.scale })
  }

  private rocketPos(r: Rocket, t: number, out: { x: number; y: number }) {
    const e = 1 - (1 - t) * (1 - t)
    out.x = r.x0 + (r.x1 - r.x0) * (t * (2 - t)) + Math.sin(t * 17 + r.seed) * 0.32 * (1 - t) + Math.sin(t * 41 + r.seed * 2) * 0.08
    out.y = r.y1 * e
  }

  /* ---------------------------------------------------------------- bursts */

  private burst(r: Rocket, x: number, y: number, z: number) {
    const q = this.quality
    const sc = r.scale
    const [c0, c1] = PALETTES[r.pal]
    const rnd = Math.random
    let stars = 0
    const sphere = (count: number, speed: number, fn: (dx: number, dy: number, dz: number, sp: number) => void) => {
      const off = rnd() * Math.PI * 2
      for (let i = 0; i < count; i++) {
        const k = (i + 0.5) / count
        const ph = Math.acos(1 - 2 * k)
        const th = off + i * 2.39996323
        const dx = Math.sin(ph) * Math.cos(th)
        const dy = Math.cos(ph)
        const dz = Math.sin(ph) * Math.sin(th)
        fn(dx, dy, dz, speed * (0.9 + rnd() * 0.18))
      }
    }
    // an orthonormal basis for planar bursts; `face` keeps the plane roughly facing the camera
    const basis = (face: boolean) => {
      let nx: number, ny: number, nz: number
      if (face) {
        const yaw = (rnd() - 0.5) * 0.7
        const pitch = (rnd() - 0.5) * 0.35
        nx = Math.sin(yaw); ny = Math.sin(pitch); nz = Math.cos(yaw) * Math.cos(pitch)
      } else {
        do {
          nx = rnd() * 2 - 1; ny = rnd() * 2 - 1; nz = rnd() * 2 - 1
          const l = Math.hypot(nx, ny, nz) || 1
          nx /= l; ny /= l; nz /= l
        } while (Math.abs(nz) < 0.4)
      }
      // u = normalize(up × n), v = n × u
      let ux = nz, uy = 0, uz = -nx
      const ul = Math.hypot(ux, uy, uz) || 1
      ux /= ul; uy /= ul; uz /= ul
      if (face) {
        // in-plane roll so shapes stay upright-ish
        const roll = (rnd() - 0.5) * 0.35
        const cr = Math.cos(roll), sr = Math.sin(roll)
        const vx0 = ny * uz - nz * uy, vy0 = nz * ux - nx * uz, vz0 = nx * uy - ny * ux
        return { ux: ux * cr + vx0 * sr, uy: uy * cr + vy0 * sr, uz: uz * cr + vz0 * sr, vx: vx0 * cr - ux * sr, vy: vy0 * cr - uy * sr, vz: vz0 * cr - uz * sr }
      }
      return { ux, uy, uz, vx: ny * uz - nz * uy, vy: nz * ux - nx * uz, vz: nx * uy - ny * ux }
    }
    // the shape helpers return points on a unit outline, sampled by arc length
    const outline = (pts: [number, number][], count: number, speed: number, life: number, trail: number) => {
      const B = basis(true)
      const segs: number[] = [0]
      for (let i = 1; i < pts.length; i++) segs.push(segs[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      const total = segs[segs.length - 1]
      let j = 1
      for (let i = 0; i < count; i++) {
        const d = (i / count) * total
        while (j < segs.length - 1 && segs[j] < d) j++
        const f = (d - segs[j - 1]) / Math.max(1e-6, segs[j] - segs[j - 1])
        const px = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f
        const py = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f
        const s = speed * (0.98 + rnd() * 0.04)
        this.star(x, y, z, (B.ux * px + B.vx * py) * s, (B.uy * px + B.vy * py) * s, (B.uz * px + B.vz * py) * s, life * (0.95 + rnd() * 0.1), 1.9, 1.1, 0.5, c0, c1, 0.62, trail, 0, 1.9)
        stars++
      }
    }

    switch (r.type) {
      case 'chrys': {
        sphere(Math.round(140 * q), 21 * sc, (dx, dy, dz, sp) => {
          this.star(x, y, z, dx * sp, dy * sp, dz * sp, 2.0 + rnd() * 0.5, 1.55, 5.2, 0.42, c0, c1, 0.6, 46, 0, 1.6)
          stars++
        })
        break
      }
      case 'peony': {
        sphere(Math.round(160 * q), 22 * sc, (dx, dy, dz, sp) => {
          this.star(x, y, z, dx * sp, dy * sp, dz * sp, 1.6 + rnd() * 0.4, 1.75, 4.6, 0.6, c0, c1, 0.55, 0, 0, 2.1)
          stars++
        })
        const [p0] = PALETTES[(r.pal + 4) % PALETTES.length]
        sphere(Math.round(48 * q), 9 * sc, (dx, dy, dz, sp) => {
          this.star(x, y, z, dx * sp, dy * sp, dz * sp, 1.2 + rnd() * 0.3, 1.8, 4, 0.48, p0, WHITE, 0.7, 0, 0, 2.0)
          stars++
        })
        break
      }
      case 'willow': {
        sphere(Math.round(66 * q), 16 * sc, (dx, dy, dz, sp) => {
          this.star(x, y, z, dx * sp, dy * sp + 1.5, dz * sp, 3.3 + rnd() * 0.7, 2.3, 2.6, 0.42, GOLD, EMBER, 0.85, 52, F_WILLOW, 1.6)
          stars++
        })
        break
      }
      case 'ring': {
        const B = basis(false)
        const count = Math.round(96 * q)
        const sp = 20 * sc
        const off = rnd() * 6.28
        for (let i = 0; i < count; i++) {
          const a = off + (i / count) * Math.PI * 2
          const ca = Math.cos(a), sa = Math.sin(a)
          const s = sp * (0.985 + rnd() * 0.03)
          this.star(x, y, z, (B.ux * ca + B.vx * sa) * s, (B.uy * ca + B.vy * sa) * s, (B.uz * ca + B.vz * sa) * s, 1.9 + rnd() * 0.3, 1.6, 3.2, 0.52, c0, c1, 0.6, 14, 0, 2.0)
          stars++
        }
        const [p0] = PALETTES[(r.pal + 3) % PALETTES.length]
        sphere(Math.round(36 * q), 7 * sc, (dx, dy, dz, s) => {
          this.star(x, y, z, dx * s, dy * s, dz * s, 1.3 + rnd() * 0.3, 1.6, 3, 0.46, p0, p0, 1, 0, 0, 2.0)
          stars++
        })
        break
      }
      case 'heart': {
        const pts: [number, number][] = []
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2
          const hx = 16 * Math.sin(t) ** 3
          const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
          pts.push([hx / 16, (hy + 2) / 16])
        }
        outline(pts, Math.round(120 * q), 19 * sc, 2.3, 6)
        break
      }
      case 'star': {
        const pts: [number, number][] = []
        for (let i = 0; i <= 10; i++) {
          const a = Math.PI / 2 + (i / 10) * Math.PI * 2
          const rr = i % 2 ? 0.42 : 1
          pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
        }
        outline(pts, Math.round(130 * q), 20 * sc, 2.3, 6)
        break
      }
      case 'crackle': {
        sphere(Math.round(120 * q), 18 * sc, (dx, dy, dz, sp) => {
          this.star(x, y, z, dx * sp, dy * sp, dz * sp, 1.5 + rnd() * 0.6, 1.6, 4.4, 0.42, CRACKLE, GOLD, 0.7, 10, F_CRACKLE | F_STROBE, 1.9)
          stars++
        })
        this.audio?.crackle(1.6)
        break
      }
    }

    // light: a fast flash plus a slow afterglow; colour is the shell's first colour lifted toward white
    const main = r.type === 'willow' ? GOLD : r.type === 'crackle' ? CRACKLE : c0
    this.flashes.push({ x, y, z, r: main[0] * 0.7 + 0.3, g: main[1] * 0.7 + 0.3, b: main[2] * 0.7 + 0.3, fast: 2.6, slow: 0.75 })
    if (this.flashes.length > 10) this.flashes.shift()
    // smoke left behind by the burst
    const nPuff = 3 + Math.floor(rnd() * 3)
    for (let i = 0; i < nPuff; i++) {
      const a = rnd() * Math.PI * 2
      const rr = (2 + rnd() * 6) * sc
      this.puff(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, z + (rnd() - 0.5) * 6, 6 + rnd() * 5, 0.13 + rnd() * 0.08)
    }
    this.audio?.boom(0.22 + rnd() * 0.1, r.type === 'willow' ? 0.7 : 1)
    this.shells++
    this.onBurst?.(r.type, stars)
  }

  puff(x: number, y: number, z: number, size: number, alpha: number) {
    if (this.puffs.length >= SMOKE_MAX) this.puffs.shift()
    this.puffs.push({
      x, y, z,
      vx: 0.35 + Math.random() * 0.5, vy: 0.15 + Math.random() * 0.25,
      age: 0, life: 14 + Math.random() * 8,
      size0: size * 0.45, size1: size * (1.5 + Math.random() * 0.5),
      alpha, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.12, tile: Math.floor(Math.random() * 4),
    })
  }

  /* ---------------------------------------------------------------- step */

  private tmp = { x: 0, y: 0 }

  step(dt: number) {
    const P = this.P
    const rnd = Math.random
    const cap = this.max * 0.9

    // rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      const was = r.t
      r.t += dt / r.dur
      if (r.t < 0) continue
      if (was < 0 && r.t >= 0) this.audio?.thump()
      if (r.t >= 1) {
        this.rocketPos(r, 1, this.tmp)
        this.burst(r, this.tmp.x, this.tmp.y, r.z)
        this.rockets.splice(i, 1)
        continue
      }
      this.rocketPos(r, r.t, this.tmp)
      const vx = (this.tmp.x - r.px) / Math.max(dt, 1e-4)
      const vy = (this.tmp.y - r.py) / Math.max(dt, 1e-4)
      // sparkling trail, denser while the motor is still pushing
      r.acc += dt * (110 - r.t * 60)
      while (r.acc >= 1 && this.n < cap) {
        r.acc -= 1
        const f = rnd()
        const ex = r.px + (this.tmp.x - r.px) * f
        const ey = r.py + (this.tmp.y - r.py) * f
        this.ember(ex, ey, r.z, vx * 0.08 + (rnd() - 0.5) * 1.6, vy * 0.05 - 1.5 - rnd() * 2, (rnd() - 0.5) * 1.6, 0.45 + rnd() * 0.6, 2.6, 3.5, 0.2 + rnd() * 0.1, 1, 0.62, 0.3, K_GLITTER, 1.5)
      }
      if (r.t > 0.05 && rnd() < dt * 2.2) this.puff(this.tmp.x, this.tmp.y, r.z, 2.2, 0.1)
      r.px = this.tmp.x
      r.py = this.tmp.y
    }

    // particles
    let i = 0
    while (i < this.n) {
      const o = i * S
      const age = P[o + AGE] + dt
      if (age >= P[o + LIFE] || P[o + PY] < 0.05) {
        if (P[o + FLAGS] & F_CRACKLE && P[o + PY] > 0) {
          const x = P[o + PX], y = P[o + PY], z = P[o + PZ]
          const k = 3 + Math.floor(rnd() * 3)
          for (let j = 0; j < k; j++) this.ember(x, y, z, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9, 0.12 + rnd() * 0.2, 4, 2, 0.24, 1, 1, 1, K_SPARK, 3.2)
        }
        this.n--
        if (i !== this.n) P.copyWithin(o, this.n * S, this.n * S + S)
        continue
      }
      P[o + AGE] = age
      const k = Math.exp(-P[o + DRAG] * dt)
      P[o + VX] = P[o + VX] * k + 0.35 * dt
      P[o + VY] = P[o + VY] * k - P[o + GRAV] * dt
      P[o + VZ] *= k
      P[o + PX] += P[o + VX] * dt
      P[o + PY] += P[o + VY] * dt
      P[o + PZ] += P[o + VZ] * dt

      const rate = P[o + TRATE]
      if (rate > 0 && P[o + KIND] === K_STAR) {
        const t = age / P[o + LIFE]
        // trails thin out smoothly as the pool fills, so later shells always get their stars
        const pressure = Math.min(1, Math.max(0, (cap - this.n) / (cap * 0.35)))
        let acc = P[o + TACC] + rate * dt * (1 - t * 0.6) * pressure
        if (acc >= 1 && this.n < cap) {
          const willow = (P[o + FLAGS] & F_WILLOW) !== 0
          const useC1 = t > P[o + CHG]
          const cr = useC1 ? P[o + R1] : P[o + R0], cg = useC1 ? P[o + G1] : P[o + G0], cb = useC1 ? P[o + B1] : P[o + B0]
          while (acc >= 1) {
            acc -= 1
            const back = rnd() * dt
            const x = P[o + PX] - P[o + VX] * back, y = P[o + PY] - P[o + VY] * back, z = P[o + PZ] - P[o + VZ] * back
            if (willow) {
              this.ember(x, y, z, P[o + VX] * 0.03 + (rnd() - 0.5) * 0.15, P[o + VY] * 0.03 - 0.2, (rnd() - 0.5) * 0.15, 2.0 + rnd() * 1.0, 3, 0.9, 0.27, cr, cg, cb, K_WILLOW, 1.15)
            } else {
              this.ember(x, y, z, P[o + VX] * 0.2 + (rnd() - 0.5) * 0.5, P[o + VY] * 0.2 + (rnd() - 0.5) * 0.5, P[o + VZ] * 0.2, 0.35 + rnd() * 0.35, 3, 2.5, 0.28, cr, cg, cb, K_EMBER, 1.1)
            }
          }
        }
        P[o + TACC] = acc
      }
      i++
    }

    // flashes
    for (let j = this.flashes.length - 1; j >= 0; j--) {
      const f = this.flashes[j]
      f.fast *= Math.exp(-dt * 7)
      f.slow *= Math.exp(-dt * 0.9)
      if (f.fast + f.slow < 0.01) this.flashes.splice(j, 1)
    }

    // smoke
    for (let j = this.puffs.length - 1; j >= 0; j--) {
      const p = this.puffs[j]
      p.age += dt
      if (p.age >= p.life) {
        this.puffs.splice(j, 1)
        continue
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx += (0.6 - p.vx) * dt * 0.1
      p.rot += p.spin * dt
    }
  }

  /* ---------------------------------------------------------------- outputs */

  writeOutputs(time: number) {
    const P = this.P
    const pos = this.outPos, col = this.outCol, siz = this.outSize
    let m = 0
    for (let i = 0; i < this.n; i++) {
      const o = i * S
      const age = P[o + AGE]
      const t = age / P[o + LIFE]
      const kind = P[o + KIND]
      let r: number, g: number, b: number, br: number, sz = P[o + SIZE]
      if (kind === K_STAR) {
        const chg = P[o + CHG]
        const m1 = Math.min(1, Math.max(0, (t - chg) / 0.08))
        r = P[o + R0] + (P[o + R1] - P[o + R0]) * m1
        g = P[o + G0] + (P[o + G1] - P[o + G0]) * m1
        b = P[o + B0] + (P[o + B1] - P[o + B0]) * m1
        // white-hot ignition
        if (t < 0.1) {
          const h = 1 - t / 0.1
          r += (1 - r) * h; g += (1 - g) * h; b += (1 - b) * h
        }
        // burn-out toward an orange ember
        if (t > 0.78) {
          const e = (t - 0.78) / 0.22
          r += (EMBER[0] - r) * e * 0.6; g += (EMBER[1] - g) * e * 0.6; b += (EMBER[2] - b) * e * 0.6
        }
        const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1
        br = P[o + BRIGHT] * fade * (t < 0.04 ? 1.6 : 1)
        const flags = P[o + FLAGS]
        if (flags & F_STROBE && t > 0.25) br *= ((age * 11 + P[o + PHASE]) % 1) < 0.45 ? 1.5 : 0.06
        if (t > 0.82) br *= 0.55 + 0.45 * Math.random()
        sz *= 1 - 0.35 * t
      } else if (kind === K_SPARK) {
        r = 1; g = 0.95; b = 0.85
        br = P[o + BRIGHT] * (1 - t) * (1 - t)
      } else {
        const e = Math.min(1, kind === K_WILLOW ? t * 0.8 : t * 1.3)
        r = P[o + R0] + (EMBER[0] - P[o + R0]) * e
        g = P[o + G0] + (EMBER[1] - P[o + G0]) * e
        b = P[o + B0] + (EMBER[2] - P[o + B0]) * e
        const f = 1 - t
        br = P[o + BRIGHT] * f * Math.sqrt(f)
        if (kind === K_WILLOW) br = P[o + BRIGHT] * Math.pow(f, 0.8) * (Math.random() < 0.12 ? 2.4 : 0.8)
        else if (kind === K_GLITTER) br *= Math.random() < 0.3 ? 2.2 : 0.55
        sz *= 0.6 + 0.4 * f
      }
      pos[m * 3] = P[o + PX]; pos[m * 3 + 1] = P[o + PY]; pos[m * 3 + 2] = P[o + PZ]
      col[m * 3] = r * br; col[m * 3 + 1] = g * br; col[m * 3 + 2] = b * br
      siz[m] = sz
      m++
    }
    // rocket heads
    for (const rk of this.rockets) {
      if (rk.t < 0 || m >= this.max + 64) continue
      const fl = 0.75 + 0.25 * Math.sin(time * 60 + rk.seed)
      pos[m * 3] = rk.px; pos[m * 3 + 1] = rk.py; pos[m * 3 + 2] = rk.z
      col[m * 3] = 2.6 * fl; col[m * 3 + 1] = 1.9 * fl; col[m * 3 + 2] = 1.1 * fl
      siz[m] = 0.55
      m++
    }
    this.outCount = m
  }

  /** smoke instance data, lit by the current flashes and a warm city glow from below */
  writeSmoke() {
    const fl = this.flashes
    let m = 0
    for (const p of this.puffs) {
      const t = p.age / p.life
      const s = p.size0 + (p.size1 - p.size0) * (1 - (1 - t) * (1 - t))
      const a = p.alpha * Math.min(1, p.age / 1.2) * (1 - t) * (1 - t)
      let lr = 0.018, lg = 0.02, lb = 0.035
      const low = Math.max(0, 1 - p.y / 30)
      lr += 0.05 * low; lg += 0.028 * low; lb += 0.03 * low
      for (const f of fl) {
        const dx = p.x - f.x, dy = p.y - f.y, dz = p.z - f.z
        const k = (f.fast + f.slow) / (1 + (dx * dx + dy * dy + dz * dz) / 160)
        lr += f.r * k * 0.07; lg += f.g * k * 0.07; lb += f.b * k * 0.07
      }
      this.smokePos[m * 3] = p.x; this.smokePos[m * 3 + 1] = p.y; this.smokePos[m * 3 + 2] = p.z
      this.smokeCol[m * 4] = lr; this.smokeCol[m * 4 + 1] = lg; this.smokeCol[m * 4 + 2] = lb; this.smokeCol[m * 4 + 3] = a
      this.smokeSize[m * 3] = s; this.smokeSize[m * 3 + 1] = p.rot; this.smokeSize[m * 3 + 2] = p.tile
      m++
    }
    this.smokeCount = m
  }

  /** the strongest `count` flashes (by current intensity), for the sky/skyline shader */
  topFlashes(out: Flash[], count: number) {
    out.length = 0
    for (const f of this.flashes) {
      out.push(f)
    }
    out.sort((a, b) => b.fast + b.slow - (a.fast + a.slow))
    if (out.length > count) out.length = count
    return out
  }
}

/* ------------------------------------------------------------------ audio (opt-in, after a user gesture) */

export class FireworksAudio implements AudioHooks {
  ctx: AudioContext
  noise: AudioBuffer
  master: GainNode
  constructor() {
    this.ctx = new AudioContext()
    const len = this.ctx.sampleRate * 2
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    const comp = this.ctx.createDynamicsCompressor()
    this.master.connect(comp)
    comp.connect(this.ctx.destination)
  }
  private burstNoise(at: number, freq: number, q: number, gain: number, attack: number, decay: number, type: BiquadFilterType = 'lowpass') {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(gain, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    src.connect(f)
    f.connect(g)
    g.connect(this.master)
    src.start(at, Math.random() * 1.2)
    src.stop(at + attack + decay + 0.05)
  }
  boom(delay: number, gain: number) {
    const at = this.ctx.currentTime + delay
    this.burstNoise(at, 520 + Math.random() * 200, 0.7, 0.9 * gain, 0.006, 1.4)
    this.burstNoise(at, 120, 1.2, 0.8 * gain, 0.01, 0.9)
  }
  crackle(delay: number) {
    const t0 = this.ctx.currentTime + delay
    for (let i = 0; i < 26; i++) this.burstNoise(t0 + Math.random() * 0.7, 2500 + Math.random() * 3000, 1, 0.12 + Math.random() * 0.12, 0.002, 0.04, 'highpass')
  }
  thump() {
    this.burstNoise(this.ctx.currentTime, 260, 1, 0.25, 0.004, 0.22)
  }
}
