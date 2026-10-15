/**
 * Verlet rope menu physics: N cards, each hung from a fixed rail anchor by a 12-segment rope.
 * Per card 17 particles: rope 0..12 (0 pinned at the rail, 12 = eyelet on the card) + 4 card corners
 * (TL, TR, BR, BL). The card body is the eyelet + corners held rigid by 10 distance constraints.
 * Card–card contact: corners of one card pushed out of the other's oriented box, in the menu plane (xy).
 * Fixed step (1/120 s), position-based constraint relaxation, long-range attachment caps the rope stretch.
 */

export const N = 5
export const SEG = 12
export const PER = SEG + 1 + 4
export const CARD_W = 1.5
export const CARD_H = 1.9
export const CARD_D = 0.08
export const EYE = 0.17 // eyelet below the top edge
export const PITCH = 1.74
export const RAIL_Y = 2.75
export const ROPE_L = [2.2, 3.05, 2.55, 3.35, 2.4]
export const H = 1 / 120
const ITER = 10
const GRAV = -19
const M_ROPE = 0.12
const M_EYE = 0.3
const M_CORNER = 0.55
const VMAX2 = (8 * H) ** 2 // max 8 units / s per particle

// card-local offsets (x right, y up) of the 4 corners relative to the eyelet
const HW = CARD_W / 2
const HH = CARD_H / 2
const LOCAL: [number, number][] = [
  [-HW, EYE],
  [HW, EYE],
  [HW, EYE - CARD_H],
  [-HW, EYE - CARD_H],
]

export type Sim = ReturnType<typeof makeSim>

export function anchorX(c: number) {
  return (c - (N - 1) / 2) * PITCH
}

export function makeSim() {
  const P = N * PER
  const pos = new Float32Array(P * 3)
  const prev = new Float32Array(P * 3)
  const w = new Float32Array(P) // inverse mass
  const frozen = new Uint8Array(N) // card body taken out of the sim (opened)
  const ca: number[] = []
  const cb: number[] = []
  const cr: number[] = []
  const owner: number[] = [] // card index; body constraints are skipped while frozen
  const body: number[] = []
  const segLen = ROPE_L.map((l) => l / SEG)

  const place = (c: number, ex: number, ey: number, ez: number, keepVel = false) => {
    // card hanging straight under its eyelet at (ex, ey, ez)
    const b = c * PER
    for (let k = 0; k < 4; k++) {
      const i = (b + SEG + 1 + k) * 3
      const vx = pos[i] - prev[i]
      const vy = pos[i + 1] - prev[i + 1]
      const vz = pos[i + 2] - prev[i + 2]
      pos[i] = ex + LOCAL[k][0]
      pos[i + 1] = ey + LOCAL[k][1]
      pos[i + 2] = ez
      prev[i] = pos[i] - (keepVel ? vx : 0)
      prev[i + 1] = pos[i + 1] - (keepVel ? vy : 0)
      prev[i + 2] = pos[i + 2] - (keepVel ? vz : 0)
    }
  }

  for (let c = 0; c < N; c++) {
    const b = c * PER
    const ax = anchorX(c)
    for (let k = 0; k <= SEG; k++) {
      const i = (b + k) * 3
      pos[i] = ax
      pos[i + 1] = RAIL_Y - k * segLen[c]
      pos[i + 2] = 0
      w[b + k] = k === 0 ? 0 : 1 / (k === SEG ? M_EYE : M_ROPE)
      if (k > 0) {
        ca.push(b + k - 1)
        cb.push(b + k)
        cr.push(segLen[c])
        owner.push(c)
        body.push(0)
      }
    }
    const e = b + SEG
    for (let k = 0; k < 4; k++) w[b + SEG + 1 + k] = 1 / M_CORNER
    place(c, ax, RAIL_Y - ROPE_L[c], 0)
    const ids = [e, b + SEG + 1, b + SEG + 2, b + SEG + 3, b + SEG + 4]
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        ca.push(ids[i])
        cb.push(ids[j])
        const A = ids[i] * 3
        const B = ids[j] * 3
        cr.push(Math.hypot(pos[A] - pos[B], pos[A + 1] - pos[B + 1], pos[A + 2] - pos[B + 2]))
        owner.push(c)
        body.push(1)
      }
  }
  prev.set(pos)
  const CA = Int32Array.from(ca)
  const CB = Int32Array.from(cb)
  const CR = Float32Array.from(cr)
  const OWN = Int32Array.from(owner)
  const BODY = Uint8Array.from(body)

  // pointer grab: card + bilinear (s, t) point on it, target in world
  const grab = { card: -1, s: 0.5, t: 0.5, x: 0, y: 0, z: 0 }
  // forces
  const env = { wind: 0, ambient: 1, bx: 0, by: 0, bvx: 0, bvy: 0, breeze: 0 }
  let time = 0

  const corner = (c: number, k: number) => (c * PER + SEG + 1 + k) * 3

  // card frame in the xy plane (for collisions)
  const cx = new Float32Array(N)
  const cy = new Float32Array(N)
  const ux = new Float32Array(N)
  const uy = new Float32Array(N)
  const frames = () => {
    for (let c = 0; c < N; c++) {
      const a = corner(c, 0)
      const b = corner(c, 1)
      const d = corner(c, 2)
      const e = corner(c, 3)
      cx[c] = (pos[a] + pos[b] + pos[d] + pos[e]) / 4
      cy[c] = (pos[a + 1] + pos[b + 1] + pos[d + 1] + pos[e + 1]) / 4
      let x = pos[b] - pos[a] + pos[d] - pos[e]
      let y = pos[b + 1] - pos[a + 1] + pos[d + 1] - pos[e + 1]
      const l = Math.hypot(x, y) || 1
      x /= l
      y /= l
      ux[c] = x
      uy[c] = y
    }
  }

  const shiftCard = (c: number, dx: number, dy: number, dz: number, keep: number) => {
    // translate a card body (eyelet + corners); `keep` = share of the shift that does NOT become velocity
    for (let k = SEG; k < PER; k++) {
      const i = (c * PER + k) * 3
      pos[i] += dx
      pos[i + 1] += dy
      pos[i + 2] += dz
      prev[i] += dx * keep
      prev[i + 1] += dy * keep
      prev[i + 2] += dz * keep
    }
  }

  // corners of card a inside card b's box → push that corner out (gives the contact its torque)
  const corners = (a: number, b: number, hw: number, hh: number) => {
    let hits = 0
    for (let k = 0; k < 4; k++) {
      const i = corner(a, k)
      const dx = pos[i] - cx[b]
      const dy = pos[i + 1] - cy[b]
      const lx = dx * ux[b] + dy * uy[b]
      const ly = -dx * uy[b] + dy * ux[b]
      const px = hw - Math.abs(lx)
      const py = hh - Math.abs(ly)
      if (px <= 0 || py <= 0) continue
      hits++
      let nx: number
      let ny: number
      let depth: number
      if (px < py) {
        const sg = Math.sign(lx) || 1
        nx = ux[b] * sg
        ny = uy[b] * sg
        depth = px
      } else {
        const sg = Math.sign(ly) || 1
        nx = -uy[b] * sg
        ny = ux[b] * sg
        depth = py
      }
      depth *= 0.8
      // (half of each push also goes into prev, so contacts separate without injecting much velocity)
      pos[i] += nx * depth * 0.5
      pos[i + 1] += ny * depth * 0.5
      prev[i] += nx * depth * 0.25
      prev[i + 1] += ny * depth * 0.25
      // contact friction on the corner (kill some tangential velocity)
      const tvx = pos[i] - prev[i]
      const tvy = pos[i + 1] - prev[i + 1]
      const vt = tvx * -ny + tvy * nx
      prev[i] += -ny * vt * 0.15
      prev[i + 1] += nx * vt * 0.15
      shiftCard(b, -nx * depth * 0.125, -ny * depth * 0.125, 0, 0.5)
    }
    return hits
  }

  const collide = () => {
    frames()
    const m = CARD_D * 0.5
    const hw = HW + m
    const hh = HH + m
    for (let a = 0; a < N; a++) {
      if (frozen[a]) continue
      for (let b = a + 1; b < N && b <= a + 2; b++) {
        if (frozen[b]) continue
        // SAT between the two boxes in the menu plane
        const dx = cx[b] - cx[a]
        const dy = cy[b] - cy[a]
        let best = Infinity
        let bnx = 0
        let bny = 0
        const axes = [ux[a], uy[a], -uy[a], ux[a], ux[b], uy[b], -uy[b], ux[b]]
        for (let q = 0; q < 8; q += 2) {
          const ax = axes[q]
          const ay = axes[q + 1]
          const ra = hw * Math.abs(ux[a] * ax + uy[a] * ay) + hh * Math.abs(-uy[a] * ax + ux[a] * ay)
          const rb = hw * Math.abs(ux[b] * ax + uy[b] * ay) + hh * Math.abs(-uy[b] * ax + ux[b] * ay)
          const d = dx * ax + dy * ay
          const o = ra + rb - Math.abs(d)
          if (o <= 0) {
            best = -1
            break
          }
          if (o < best) {
            best = o
            const sg = Math.sign(d) || 1
            bnx = ax * sg
            bny = ay * sg
          }
        }
        if (best <= 0) continue
        const za = (pos[corner(a, 0) + 2] + pos[corner(a, 2) + 2]) * 0.5
        const zb = (pos[corner(b, 0) + 2] + pos[corner(b, 2) + 2]) * 0.5
        if (cx[a] > cx[b] + 0.05) {
          // order flipped (one was dragged past the other): let them slip past each other in depth
          if (za - zb < 0.34) {
            shiftCard(a, 0, 0, 0.014, 0.6)
            shiftCard(b, 0, 0, -0.014, 0.6)
          }
          continue
        }
        if (Math.abs(za - zb) > 0.4) continue
        const hits = corners(a, b, hw, hh) + corners(b, a, hw, hh)
        if (!hits) {
          // edge-on-edge crossing: separate along the axis of least overlap
          const o = best * 0.4
          shiftCard(a, -bnx * o, -bny * o, 0, 0.5)
          shiftCard(b, bnx * o, bny * o, 0, 0.5)
        }
      }
    }
  }

  const step = () => {
    time += H
    const t = time
    const h2 = H * H
    const P3 = P * 3
    // integrate
    for (let p = 0; p < P; p++) {
      if (w[p] === 0) continue
      const c = (p / PER) | 0
      const local = p - c * PER
      const isCorner = local > SEG
      if (isCorner && frozen[c]) continue
      const i = p * 3
      let ax = 0
      let ay = GRAV
      let az = 0
      // ambient air + gust: corners catch it, the rope a little
      const catchK = isCorner ? 1 : 0.25
      const side = isCorner ? (local - SEG - 1 === 0 || local - SEG - 1 === 3 ? -1 : 1) : 0
      const gust = env.wind
      const amb = env.ambient
      ax += catchK * (amb * 0.9 * Math.sin(t * 0.7 + c * 1.3) * Math.sin(t * 0.31 + c) + gust * (13 + 4 * Math.sin(t * 2.1 + c * 0.9)))
      az += catchK * (amb * 0.6 * Math.sin(t * 0.9 + c * 2.1) + gust * (2.2 * Math.sin(t * 1.6 + c * 1.7) + side * 3 * Math.sin(t * 2.7 + c)))
      // cards live in the menu plane: a soft spring + damper pulls them back to z = 0
      if (isCorner || local === SEG) {
        az += -pos[i + 2] * 26 - ((pos[i + 2] - prev[i + 2]) / H) * 2.2
      }
      // pointer breeze
      if (env.breeze > 0) {
        const dx = pos[i] - env.bx
        const dy = pos[i + 1] - env.by
        const f = Math.max(0, 1 - (dx * dx + dy * dy) / 3.2) * env.breeze * catchK
        ax += env.bvx * f * 3.2
        ay += env.bvy * f * 1.2
        az += Math.hypot(env.bvx, env.bvy) * f * 0.6 * side
      }
      const damp = isCorner ? 0.9905 : 0.994
      let vx = (pos[i] - prev[i]) * damp
      let vy = (pos[i + 1] - prev[i + 1]) * damp
      let vz = (pos[i + 2] - prev[i + 2]) * damp
      // speed cap keeps wild flings / pile-ups from throwing cards over the rail
      const v2 = vx * vx + vy * vy + vz * vz
      if (v2 > VMAX2) {
        const f = Math.sqrt(VMAX2 / v2)
        vx *= f
        vy *= f
        vz *= f
      }
      prev[i] = pos[i]
      prev[i + 1] = pos[i + 1]
      prev[i + 2] = pos[i + 2]
      pos[i] += vx + ax * h2
      pos[i + 1] += vy + ay * h2
      pos[i + 2] += vz + az * h2
    }
    // relax
    for (let it = 0; it < ITER; it++) {
      for (let k = 0; k < CA.length; k++) {
        if (BODY[k] && frozen[OWN[k]]) continue
        const a = CA[k]
        const b = CB[k]
        const wa = w[a]
        const wb = w[b]
        const ws = wa + wb
        if (ws === 0) continue
        const A = a * 3
        const B = b * 3
        const dx = pos[B] - pos[A]
        const dy = pos[B + 1] - pos[A + 1]
        const dz = pos[B + 2] - pos[A + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 1e-9) continue
        const diff = (d - CR[k]) / (d * ws)
        pos[A] += dx * diff * wa
        pos[A + 1] += dy * diff * wa
        pos[A + 2] += dz * diff * wa
        pos[B] -= dx * diff * wb
        pos[B + 1] -= dy * diff * wb
        pos[B + 2] -= dz * diff * wb
      }
      // pointer grab: pull the bilinear point toward the target (soft)
      if (grab.card >= 0 && !frozen[grab.card]) {
        const c = grab.card
        const s = grab.s
        const tt = grab.t
        const wts = [(1 - s) * (1 - tt), s * (1 - tt), s * tt, (1 - s) * tt]
        let px = 0
        let py = 0
        let pz = 0
        let w2 = 0
        for (let k = 0; k < 4; k++) {
          const i = corner(c, k)
          px += pos[i] * wts[k]
          py += pos[i + 1] * wts[k]
          pz += pos[i + 2] * wts[k]
          w2 += wts[k] * wts[k]
        }
        const kx = ((grab.x - px) * 0.3) / w2
        const ky = ((grab.y - py) * 0.3) / w2
        const kz = ((grab.z - pz) * 0.3) / w2
        for (let k = 0; k < 4; k++) {
          const i = corner(c, k)
          pos[i] += kx * wts[k]
          pos[i + 1] += ky * wts[k]
          pos[i + 2] += kz * wts[k]
        }
      }
      if (it % 3 === 1) collide()
      // long-range attachment: the rope may stretch a little, never a lot
      for (let c = 0; c < N; c++) {
        const b = c * PER
        const lim = grab.card === c ? 1.14 : 1.05
        const A = b * 3
        for (let k = 2; k <= SEG; k++) {
          const i = (b + k) * 3
          const dx = pos[i] - pos[A]
          const dy = pos[i + 1] - pos[A + 1]
          const dz = pos[i + 2] - pos[A + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          const max = k * segLen[c] * lim
          if (d > max) {
            const f = max / d
            pos[i] = pos[A] + dx * f
            pos[i + 1] = pos[A + 1] + dy * f
            pos[i + 2] = pos[A + 2] + dz * f
          }
        }
      }
    }
    // the wall behind (z) and a soft floor in front of nothing
    for (let i = 2; i < P3; i += 3) if (pos[i] < -0.42) pos[i] = -0.42
  }

  /** velocity kick (world units / s) on a card body */
  const kick = (c: number, vx: number, vy: number, vz = 0, spin = 0) => {
    const b = c * PER
    for (let k = SEG; k <= SEG + 4; k++) {
      const i = (b + k) * 3
      const sgn = k === SEG ? 0 : k - SEG - 1 === 0 || k - SEG - 1 === 3 ? -1 : 1
      prev[i] -= vx * H
      prev[i + 1] -= (vy + sgn * spin) * H
      prev[i + 2] -= vz * H
    }
  }

  /** cap the speed (world units / s) of a card and its rope, e.g. after a hard fling */
  const clampVel = (c: number, max: number) => {
    const m = max * H
    for (let k = 1; k < PER; k++) {
      const i = (c * PER + k) * 3
      const vx = pos[i] - prev[i]
      const vy = pos[i + 1] - prev[i + 1]
      const vz = pos[i + 2] - prev[i + 2]
      const v = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (v > m) {
        const f = m / v
        prev[i] = pos[i] - vx * f
        prev[i + 1] = pos[i + 1] - vy * f
        prev[i + 2] = pos[i + 2] - vz * f
      }
    }
  }

  return { pos, prev, w, frozen, grab, env, step, kick, place, clampVel, corner, segLen, get time() { return time } }
}

/** card pose from its corners: centre + orthonormal basis (columns x, y, z) */
export function cardFrame(sim: Sim, c: number, out: { p: [number, number, number]; x: number[]; y: number[]; z: number[] }) {
  const { pos, corner } = sim
  const a = corner(c, 0)
  const b = corner(c, 1)
  const d = corner(c, 2)
  const e = corner(c, 3)
  for (let j = 0; j < 3; j++) {
    out.p[j] = (pos[a + j] + pos[b + j] + pos[d + j] + pos[e + j]) / 4
    out.x[j] = pos[b + j] - pos[a + j] + pos[d + j] - pos[e + j]
    out.y[j] = pos[a + j] - pos[e + j] + pos[b + j] - pos[d + j]
  }
  const nx = Math.hypot(out.x[0], out.x[1], out.x[2]) || 1
  for (let j = 0; j < 3; j++) out.x[j] /= nx
  const dp = out.y[0] * out.x[0] + out.y[1] * out.x[1] + out.y[2] * out.x[2]
  for (let j = 0; j < 3; j++) out.y[j] -= dp * out.x[j]
  const ny = Math.hypot(out.y[0], out.y[1], out.y[2]) || 1
  for (let j = 0; j < 3; j++) out.y[j] /= ny
  out.z[0] = out.x[1] * out.y[2] - out.x[2] * out.y[1]
  out.z[1] = out.x[2] * out.y[0] - out.x[0] * out.y[2]
  out.z[2] = out.x[0] * out.y[1] - out.x[1] * out.y[0]
}

/** bilinear (s, t) of a world point on a card (s: left→right, t: top→bottom) */
export function cardST(sim: Sim, c: number, px: number, py: number, pz: number) {
  const f = { p: [0, 0, 0] as [number, number, number], x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] }
  cardFrame(sim, c, f)
  const dx = px - f.p[0]
  const dy = py - f.p[1]
  const dz = pz - f.p[2]
  const lx = dx * f.x[0] + dy * f.x[1] + dz * f.x[2]
  const ly = dx * f.y[0] + dy * f.y[1] + dz * f.y[2]
  return { s: Math.min(1, Math.max(0, lx / CARD_W + 0.5)), t: Math.min(1, Math.max(0, 0.5 - ly / CARD_H)) }
}
