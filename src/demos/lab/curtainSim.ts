/**
 * Verlet cloth for the curtain reveal: a 48×48 sheet dropped onto a product (rounded-cylinder collider)
 * standing on a pedestal (rounded cylinder) above a floor. three-free so it can be tested headless.
 */

export const CN = 48 // particles per side
export const CSIZE = 4.5 // sheet size
export const CH = 1 / 120 // fixed step
const ITER = 10
const GRAV = -9.8
const DRAG = 2.2 // aerodynamic coefficient (per area)
const THICK = 0.035

/* colliders (y up, centred on the origin) */
export const SPK = { r: 0.515, y0: 0, y1: 1.86, round: 0.12 } // the product
export const PED = { r: 1.05, y0: -1.15, y1: 0, round: 0.05 } // pedestal
export const FLOOR = -1.15

type Cyl = { r: number; y0: number; y1: number; round: number }

/**
 * Signed distance to a vertical rounded cylinder + outward normal (written to n).
 */
function sdCyl(c: Cyl, x: number, y: number, z: number, n: Float64Array) {
  const rr = Math.hypot(x, z)
  const cy = (c.y0 + c.y1) / 2
  const hh = (c.y1 - c.y0) / 2
  const qx = rr - (c.r - c.round)
  const dy = y - cy
  const qy = Math.abs(dy) - (hh - c.round)
  const sy = dy >= 0 ? 1 : -1
  const ux = rr > 1e-6 ? x / rr : 1
  const uz = rr > 1e-6 ? z / rr : 0
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy)
    n[0] = (ux * qx) / l
    n[1] = (sy * qy) / l
    n[2] = (uz * qx) / l
    return l - c.round
  }
  if (qx > qy) {
    n[0] = ux
    n[1] = 0
    n[2] = uz
    return qx - c.round
  }
  n[0] = 0
  n[1] = sy
  n[2] = 0
  return qy - c.round
}

export type Env = {
  /** ambient draft (m/s) */
  draft: number
  /** reveal gust 0..1 and seconds since it started */
  gust: number
  gustT: number
  /** collide with product + pedestal */
  collide: boolean
}

export function makeCurtain() {
  const N = CN * CN
  const pos = new Float32Array(N * 3)
  const prev = new Float32Array(N * 3)
  const acc = new Float32Array(N * 3)
  const ca: number[] = []
  const cb: number[] = []
  const ck: number[] = []
  const id = (c: number, r: number) => r * CN + c
  const add = (a: number, b: number, k: number) => {
    ca.push(a)
    cb.push(b)
    ck.push(k)
  }
  for (let r = 0; r < CN; r++)
    for (let c = 0; c < CN; c++) {
      if (c < CN - 1) add(id(c, r), id(c + 1, r), 1)
      if (r < CN - 1) add(id(c, r), id(c, r + 1), 1)
      if (c < CN - 1 && r < CN - 1) {
        add(id(c, r), id(c + 1, r + 1), 0.5)
        add(id(c + 1, r), id(c, r + 1), 0.5)
      }
      if (c < CN - 2) add(id(c, r), id(c + 2, r), 0.08)
      if (r < CN - 2) add(id(c, r), id(c, r + 2), 0.08)
    }
  const CA = Int32Array.from(ca)
  const CB = Int32Array.from(cb)
  const CK = Float32Array.from(ck)
  const CR = new Float32Array(CA.length)
  const sp = CSIZE / (CN - 1)
  for (let k = 0; k < CA.length; k++) {
    const a = CA[k]
    const b = CB[k]
    CR[k] = sp * Math.hypot((a % CN) - (b % CN), Math.floor(a / CN) - Math.floor(b / CN))
  }
  const tris: number[] = []
  for (let r = 0; r < CN - 1; r++)
    for (let c = 0; c < CN - 1; c++) {
      const i = id(c, r)
      tris.push(i, i + CN, i + 1, i + 1, i + CN, i + CN + 1)
    }
  const TR = Int32Array.from(tris)
  const n = new Float64Array(3)
  const contact = new Uint8Array(N)
  let time = 0

  /** lay the sheet flat at height y, turned by `turn`, with a faint ripple so the drape is not symmetric */
  const reset = (y: number, turn = 0.42, seed = 1) => {
    const ct = Math.cos(turn)
    const st = Math.sin(turn)
    for (let r = 0; r < CN; r++)
      for (let c = 0; c < CN; c++) {
        const i = id(c, r) * 3
        const u = (c / (CN - 1) - 0.5) * CSIZE
        const v = (r / (CN - 1) - 0.5) * CSIZE
        const x = u * ct - v * st + 0.06
        const z = u * st + v * ct - 0.04
        pos[i] = x
        pos[i + 1] = y + 0.05 * Math.sin(u * 1.7 + seed) * Math.cos(v * 1.3 - seed * 0.5) - 0.012 * (u * u + v * v)
        pos[i + 2] = z
        prev[i] = x
        prev[i + 1] = pos[i + 1] + 0.004 // tiny initial downward velocity
        prev[i + 2] = z
      }
    contact.fill(0)
  }

  const FRICTION = 0.92
  /** push out of a collider and kill most of the tangential motion of this step (sticky velvet) */
  const resolve = (i: number, d: number, fr: number) => {
    const k = THICK - d
    pos[i] += n[0] * k
    pos[i + 1] += n[1] * k
    pos[i + 2] += n[2] * k
    const mx = pos[i] - prev[i]
    const my = pos[i + 1] - prev[i + 1]
    const mz = pos[i + 2] - prev[i + 2]
    const mn = mx * n[0] + my * n[1] + mz * n[2]
    pos[i] -= (mx - mn * n[0]) * fr
    pos[i + 1] -= (my - mn * n[1]) * fr
    pos[i + 2] -= (mz - mn * n[2]) * fr
  }

  const collideAll = (on: boolean, fr: number) => {
    for (let p = 0; p < N; p++) {
      const i = p * 3
      let hit = 0
      if (on) {
        // cheap broad phase: both colliders live inside |x|,|z| < 1.4, y < 1.6
        if (pos[i + 1] < SPK.y1 + 0.2 && Math.abs(pos[i]) < PED.r + 0.15 && Math.abs(pos[i + 2]) < PED.r + 0.15) {
          let d = sdCyl(SPK, pos[i], pos[i + 1], pos[i + 2], n)
          if (d < THICK) {
            resolve(i, d, fr)
            hit = 1
          }
          d = sdCyl(PED, pos[i], pos[i + 1], pos[i + 2], n)
          if (d < THICK) {
            resolve(i, d, fr)
            hit = 1
          }
        }
      }
      if (pos[i + 1] < FLOOR + THICK) {
        n[0] = 0
        n[1] = 1
        n[2] = 0
        resolve(i, pos[i + 1] - FLOOR, fr * 0.7)
        hit = 1
      }
      contact[p] = hit
    }
  }

  const step = (e: Env) => {
    time += CH
    const t = time
    acc.fill(0)
    for (let i = 1; i < N * 3; i += 3) acc[i] = GRAV
    // air: a gentle draft that breathes, plus the reveal gust (a front sweeping in from −x)
    const draft = e.draft * (0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.31 + 1))
    const inv = 1 / CH
    for (let k = 0; k < TR.length; k += 3) {
      const a = TR[k] * 3
      const b = TR[k + 1] * 3
      const c = TR[k + 2] * 3
      const cx = (pos[a] + pos[b] + pos[c]) / 3
      const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3
      const cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3
      let wx = draft * (1 + 0.5 * Math.sin(cz * 2.1 + t * 1.7))
      let wy = draft * 0.25 * Math.sin(cx * 1.9 - t * 1.3)
      let wz = draft * 0.6 * Math.sin(cx * 1.4 + cy * 2 + t * 1.1)
      if (e.gust > 0) {
        const front = e.gustT * 5.5 - 2.8 - cx // arrives at the left side first
        const g = e.gust * (front <= 0 ? 0 : front >= 1 ? 1 : front * front * (3 - 2 * front))
        wx += g * (13 + 3 * Math.sin(cy * 3 + t * 6))
        wy += g * (17 + 3 * Math.sin(cz * 3 - t * 5))
        wz += g * 2.5 * Math.sin(cx * 2 + t * 4)
      }
      const vx = wx - ((pos[a] - prev[a] + pos[b] - prev[b] + pos[c] - prev[c]) * inv) / 3
      const vy = wy - ((pos[a + 1] - prev[a + 1] + pos[b + 1] - prev[b + 1] + pos[c + 1] - prev[c + 1]) * inv) / 3
      const vz = wz - ((pos[a + 2] - prev[a + 2] + pos[b + 2] - prev[b + 2] + pos[c + 2] - prev[c + 2]) * inv) / 3
      const e1x = pos[b] - pos[a]
      const e1y = pos[b + 1] - pos[a + 1]
      const e1z = pos[b + 2] - pos[a + 2]
      const e2x = pos[c] - pos[a]
      const e2y = pos[c + 1] - pos[a + 1]
      const e2z = pos[c + 2] - pos[a + 2]
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const nl = Math.hypot(nx, ny, nz)
      if (nl < 1e-12) continue
      // force ∝ area · (v·n̂) along n̂ ; area = nl/2, per-particle mass ≈ sp² → normalise
      const s = ((nx * vx + ny * vy + nz * vz) / nl) * (DRAG / 3) * (nl / 2 / (sp * sp))
      const fx = (nx / nl) * s
      const fy = (ny / nl) * s
      const fz = (nz / nl) * s
      acc[a] += fx
      acc[a + 1] += fy
      acc[a + 2] += fz
      acc[b] += fx
      acc[b + 1] += fy
      acc[b + 2] += fz
      acc[c] += fx
      acc[c + 1] += fy
      acc[c + 2] += fz
    }
    // integrate (contact friction bleeds tangential speed of particles resting on something)
    const h2 = CH * CH
    for (let p = 0; p < N; p++) {
      const i = p * 3
      const damp = contact[p] ? 0.9 : 0.996
      for (let j = 0; j < 3; j++) {
        const q = pos[i + j]
        const v = (q - prev[i + j]) * damp
        prev[i + j] = q
        pos[i + j] = q + v + acc[i + j] * h2
      }
    }
    for (let it = 0; it < ITER; it++) {
      for (let k = 0; k < CA.length; k++) {
        const a = CA[k] * 3
        const b = CB[k] * 3
        const dx = pos[b] - pos[a]
        const dy = pos[b + 1] - pos[a + 1]
        const dz = pos[b + 2] - pos[a + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 1e-9) continue
        let diff = (d - CR[k]) / d
        // cloth resists stretching far more than compression (lets it fold instead of crumpling springily)
        if (diff < 0) diff *= 0.18
        diff *= 0.5 * CK[k]
        pos[a] += dx * diff
        pos[a + 1] += dy * diff
        pos[a + 2] += dz * diff
        pos[b] -= dx * diff
        pos[b + 1] -= dy * diff
        pos[b + 2] -= dz * diff
      }
      if (it % 2 === 1 || it === ITER - 1) collideAll(e.collide, e.gust > 0 ? FRICTION * (1 - e.gust) : FRICTION)
    }
  }

  /** deepest penetration into the colliders (for tests) */
  const penetration = () => {
    let worst = 0
    for (let p = 0; p < N; p++) {
      const i = p * 3
      const d = Math.min(sdCyl(SPK, pos[i], pos[i + 1], pos[i + 2], n), sdCyl(PED, pos[i], pos[i + 1], pos[i + 2], n))
      worst = Math.min(worst, d)
    }
    return worst
  }

  const stretch = () => {
    let sum = 0
    let mx = 0
    let cnt = 0
    for (let k = 0; k < CA.length; k++) {
      if (CK[k] !== 1) continue
      const a = CA[k] * 3
      const b = CB[k] * 3
      const r = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]) / CR[k]
      sum += r
      cnt++
      mx = Math.max(mx, r)
    }
    return { avg: sum / cnt, max: mx }
  }

  const bounds = () => {
    let minX = Infinity
    let minY = Infinity
    let maxY = -Infinity
    let maxV = 0
    for (let p = 0; p < N; p++) {
      const i = p * 3
      minX = Math.min(minX, pos[i])
      minY = Math.min(minY, pos[i + 1])
      maxY = Math.max(maxY, pos[i + 1])
      maxV = Math.max(maxV, Math.hypot(pos[i] - prev[i], pos[i + 1] - prev[i + 1], pos[i + 2] - prev[i + 2]) / CH)
    }
    return { minX, minY, maxY, maxV }
  }

  reset(2.6)
  return { pos, prev, TR, N, step, reset, penetration, bounds, stretch }
}

export type Curtain = ReturnType<typeof makeCurtain>
