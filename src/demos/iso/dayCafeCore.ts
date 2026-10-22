/* Day at the café — a whole day precomputed as a deterministic schedule.
   Loop time u ∈ [0, DAY) seconds maps to the clock 6:00 → 24:00. Every person's position is a pure function of u,
   so the time scrubber can run forwards, backwards or jump and the crowd is always consistent. */

export const DAY = 60
export const hourOf = (u: number) => 6 + (u / DAY) * 18
export const uOf = (h: number) => ((h - 6) / 18) * DAY
export const OPEN_H = 6.5
export const CLOSE_H = 22

export type Path = { xs: number[]; zs: number[]; cum: number[]; L: number }
export function mkPath(pts: [number, number][]): Path {
  const xs: number[] = []
  const zs: number[] = []
  const cum: number[] = []
  let L = 0
  pts.forEach(([x, z], i) => {
    if (i > 0) L += Math.hypot(x - xs[i - 1], z - zs[i - 1])
    xs.push(x)
    zs.push(z)
    cum.push(L)
  })
  return { xs, zs, cum, L }
}
export type P2 = { x: number; z: number; hx: number; hz: number }
export function pathAt(p: Path, s: number, o: P2) {
  const n = p.xs.length
  if (s <= 0 || n < 2) {
    o.x = p.xs[0]
    o.z = p.zs[0]
    if (n > 1) setHead(o, p.xs[1] - p.xs[0], p.zs[1] - p.zs[0])
    return o
  }
  if (s >= p.L) {
    o.x = p.xs[n - 1]
    o.z = p.zs[n - 1]
    setHead(o, p.xs[n - 1] - p.xs[n - 2], p.zs[n - 1] - p.zs[n - 2])
    return o
  }
  let i = 1
  while (i < n - 1 && p.cum[i] < s) i++
  const k = (s - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1)
  o.x = p.xs[i - 1] + (p.xs[i] - p.xs[i - 1]) * k
  o.z = p.zs[i - 1] + (p.zs[i] - p.zs[i - 1]) * k
  setHead(o, p.xs[i] - p.xs[i - 1], p.zs[i] - p.zs[i - 1])
  return o
}
function setHead(o: P2, dx: number, dz: number) {
  const l = Math.hypot(dx, dz)
  if (l > 1e-6) {
    o.hx = dx / l
    o.hz = dz / l
  }
}

/* ------------------------------------------------------------------ the floor plan (x → lower-right, z → lower-left) */
export const SHOP = { x0: -4, x1: 1.5, z0: -3.5, z1: 1.0 }
export const WALK_Z = 2.05 // sidewalk walking line along the front
export const WALK_X = 2.3 // sidewalk walking line along the right side
export const LEFT_END: [number, number] = [-5.75, WALK_Z]
export const RIGHT_END: [number, number] = [WALK_X, -3.85]
export const QX = -3.05 // queue line
export const REG: [number, number] = [QX, -1.85]
export const DOOR_Q: [number, number] = [QX, WALK_Z]
export const PICK: [number, number] = [-2.0, -1.85]
export const LANE_X = -2.45
export const GAP = 0.55
export const CAP = 7
export const V = 1.65
export const ORDER = 0.4
export const MAKE = 0.85
export const BARISTA_REG = -3.05
export const BARISTA_MACH = -2.1
export const BARISTA_Z = -3.05

const SW = mkPath([LEFT_END, [WALK_X - 0.35, WALK_Z], [WALK_X, WALK_Z - 0.35], RIGHT_END])
const SW_D = Math.abs(DOOR_Q[0] - LEFT_END[0]) // arc of the queue mouth along the sidewalk
const SW_EXIT = Math.abs(LANE_X - LEFT_END[0])
export const ZEBRA_X = 1.0
const CROSS_Z = 4.35
const ZEBRA_ARC = ZEBRA_X - LEFT_END[0]
const QPATH = mkPath([REG, DOOR_Q])

export type Seat = { x: number; z: number; face: number; via: [number, number][]; table: [number, number]; stool?: boolean }
export const SEATS: Seat[] = [
  { x: -1.2, z: -1.12, face: Math.PI / 2, via: [], table: [-1.2, -0.68] },
  { x: -1.2, z: -0.24, face: -Math.PI / 2, via: [[-1.85, -0.35]], table: [-1.2, -0.68] },
  { x: -0.02, z: -1.5, face: 0, via: [[-0.5, -1.85]], table: [0.45, -1.5] },
  { x: 0.92, z: -1.5, face: Math.PI, via: [[0.45, -2.05], [0.95, -1.95]], table: [0.45, -1.5] },
  { x: -0.02, z: 0.22, face: 0, via: [[-0.6, -0.35], [-0.45, 0.2]], table: [0.45, 0.22] },
  { x: 0.92, z: 0.22, face: Math.PI, via: [[-0.6, -0.35], [-0.2, 0.75], [0.95, 0.72]], table: [0.45, 0.22] },
  { x: 0.9, z: -3.02, face: 0, via: [[0.35, -2.3], [0.55, -3.0]], table: [1.28, -3.02], stool: true },
  { x: 0.9, z: -2.52, face: 0, via: [[0.4, -2.2]], table: [1.28, -2.52], stool: true },
]

/* ------------------------------------------------------------------ rng */
function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (h: number, c: number, w: number) => Math.exp(-0.5 * ((h - c) / w) ** 2)

/** customers per second (loop time) at a given hour */
export function demand(h: number) {
  if (h < OPEN_H || h > CLOSE_H - 0.25) return 0
  return 0.55 + 1.5 * gauss(h, 7.7, 0.85) + 1.1 * gauss(h, 12.5, 0.9) + 0.4 * gauss(h, 18.4, 1.1) - 0.16 * gauss(h, 15.2, 1.0)
}
export function footfall(h: number) {
  if (h < 6.1 || h > 23.7) return 0
  return 0.12 + 0.45 * gauss(h, 8.2, 1.0) + 0.3 * gauss(h, 12.5, 1.3) + 0.38 * gauss(h, 18.2, 1.2) - 0.06 * gauss(h, 23, 0.6)
}

/* ------------------------------------------------------------------ people */
export type Leg = { t0: number; t1: number; path: Path }
export type Person = {
  id: number
  kind: 'cust' | 'walker'
  a: number
  end: number
  /** entry walk: spawn → queue mouth (or straight through for walkers / balkers) */
  entry: Leg
  balk: boolean
  J: number
  r: number
  s: number
  lr: number
  p: number
  f: number
  h: number
  E: number[]
  seat: number
  seatT0: number
  seatT1: number
  legs: Leg[]
  cups: number
  shirt: number
  skin: number
  hair: number
  tall: number
}

export function buildDay(seed = 7) {
  const R = mulberry(seed)
  const people: Person[] = []
  const blank = (kind: Person['kind'], a: number): Person => ({
    id: people.length,
    kind,
    a,
    end: a,
    entry: { t0: a, t1: a, path: SW },
    balk: false,
    J: 0,
    r: 0,
    s: 0,
    lr: 0,
    p: 0,
    f: 0,
    h: 0,
    E: [],
    seat: -1,
    seatT0: 0,
    seatT1: 0,
    legs: [],
    cups: 1,
    shirt: Math.floor(R() * 10),
    skin: Math.floor(R() * 4),
    hair: Math.floor(R() * 4),
    tall: 0.92 + R() * 0.16,
  })
  const walkLeg = (t0: number, pts: [number, number][]): Leg => {
    const path = mkPath(pts)
    return { t0, t1: t0 + path.L / V, path }
  }
  const swPts = (from: number, to: number): [number, number][] => {
    // sub-path of the sidewalk between two arc positions (either direction)
    const out: [number, number][] = []
    const o: P2 = { x: 0, z: 0, hx: 1, hz: 0 }
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 0.25))
    for (let i = 0; i <= n; i++) {
      pathAt(SW, from + ((to - from) * i) / n, o)
      out.push([o.x, o.z])
    }
    return out
  }

  // --- customers: thinned Poisson arrivals over the opening hours
  const lmax = 2.2
  let u = uOf(OPEN_H)
  const custs: Person[] = []
  while (true) {
    u += -Math.log(1 - R()) / lmax
    if (u > uOf(CLOSE_H)) break
    if (R() * lmax > demand(hourOf(u))) continue
    const p = blank('cust', u)
    // from the left end of the sidewalk, or across the zebra crossing at the corner
    const cross = R() < 0.45
    p.entry = cross ? walkLeg(u, [[ZEBRA_X, CROSS_Z], ...swPts(ZEBRA_ARC, SW_D)]) : walkLeg(u, swPts(0, SW_D))
    p.J = p.entry.t1
    const r = R()
    p.cups = r < 0.55 ? 1 : r < 0.85 ? 2 : 3
    custs.push(p)
  }
  custs.sort((a, b) => a.J - b.J)

  // --- single barista FIFO service with a capped queue
  const served: Person[] = []
  let fPrev = -1e9
  const seatFree = SEATS.map(() => -1e9)
  for (const p of custs) {
    const ahead = served.filter((q) => q.lr > p.J)
    if (ahead.length >= CAP || p.J > uOf(CLOSE_H)) {
      p.balk = true
      continue
    }
    p.E = ahead.map((q) => q.lr).sort((a, b) => a - b)
    const prev = served[served.length - 1]
    const free = p.J + QPATH.L / V
    p.r = prev && prev.lr > p.J ? Math.max(free, prev.lr + GAP / V) : free
    p.s = Math.max(p.r, fPrev)
    p.lr = p.s + ORDER
    p.f = p.lr + MAKE
    p.p = p.lr + Math.hypot(PICK[0] - REG[0], PICK[1] - REG[1]) / V
    p.h = Math.max(p.f, p.p)
    fPrev = p.f
    served.push(p)

    // stay or take away?
    const hr = hourOf(p.h)
    const stayP = hr < 10 ? 0.25 : hr < 14 ? 0.55 : hr < 17 ? 0.7 : 0.5
    const ex = R()
    const exitTail: [number, number][] = ex < 0.4 ? swPts(SW_EXIT, 0) : ex < 0.7 ? swPts(SW_EXIT, SW.L) : [...swPts(SW_EXIT, ZEBRA_ARC), [ZEBRA_X, CROSS_Z]]
    const outPts = (from: [number, number][]) => [...from, [LANE_X, -1.2], [LANE_X, 1.0], ...exitTail] as [number, number][]
    let seated = false
    if (R() < stayP) {
      const order = SEATS.map((_, i) => i).sort(() => R() - 0.5)
      for (const k of order) {
        const s = SEATS[k]
        const inPts: [number, number][] = [PICK, ...s.via, [s.x, s.z]]
        const leg = walkLeg(p.h, inPts)
        const dur = 6 + R() * 7
        const t1 = Math.min(leg.t1 + dur, uOf(22.6))
        if (seatFree[k] < leg.t1 && t1 - leg.t1 > 3) {
          seatFree[k] = t1 + 0.4
          p.seat = k
          p.seatT0 = leg.t1
          p.seatT1 = t1
          p.legs.push(leg)
          const back: [number, number][] = [[s.x, s.z], ...[...s.via].reverse()]
          const out = walkLeg(t1, outPts(back))
          p.legs.push(out)
          p.end = out.t1
          seated = true
          break
        }
      }
    }
    if (!seated) {
      const out = walkLeg(p.h, outPts([PICK]))
      p.legs.push(out)
      p.end = out.t1
    }
    people.push(p)
  }
  // balkers walk on by (pausing at the door to look at the queue)
  for (const p of custs) {
    if (!p.balk) continue
    p.kind = 'walker'
    const pause = 0.7
    p.legs = [walkLeg(p.J + pause, swPts(SW_D, p.entry.path.xs[0] < -5 ? SW.L : 0))]
    p.end = p.legs[0].t1
    people.push(p)
  }

  // --- passers-by all day long
  let w = 0.2
  const fmax = 1.0
  while (true) {
    w += -Math.log(1 - R()) / fmax
    if (w > DAY - 0.5) break
    if (R() * fmax > footfall(hourOf(w))) continue
    const p = blank('walker', w)
    const right = R() < 0.5
    p.entry = walkLeg(w, swPts(right ? SW.L : 0, right ? 0 : SW.L))
    p.J = p.entry.t1
    p.end = p.J
    people.push(p)
  }

  // --- barista: arrives 6:05, leaves 22:45
  const bIn = walkLeg(uOf(6.05), [...swPts(0, SW_EXIT), [LANE_X, 1.0], [-3.6, 0.5], [-3.78, -1.9], [-3.78, -3.05], [BARISTA_REG, BARISTA_Z]])
  const bOut = walkLeg(uOf(22.75), [[BARISTA_REG, BARISTA_Z], [-3.78, -3.05], [-3.78, -1.9], [-3.6, 0.5], [LANE_X, 1.0], ...swPts(SW_EXIT, 0)])

  // cars on the street, a few per hour
  const cars: { t0: number; c: number }[] = []
  let c = 0.5
  while (c < DAY - 1) {
    const h = hourOf(c)
    const rate = h > 23 ? 0.05 : 0.12 + 0.18 * gauss(h, 8.5, 1.2) + 0.15 * gauss(h, 18.3, 1.3)
    c += -Math.log(1 - R()) / rate
    if (c < DAY - 1) cars.push({ t0: c, c: Math.floor(R() * 5) })
  }

  people.forEach((p, i) => (p.id = i))
  const cupTimes = served.map((p) => [p.h, p.cups] as [number, number]).sort((a, b) => a[0] - b[0])
  return { people, served, bIn, bOut, cars, cupTimes }
}
export type Day = ReturnType<typeof buildDay>

/* ------------------------------------------------------------------ evaluation */
export type Pose = {
  vis: number
  x: number
  z: number
  head: number
  moving: boolean
  sit: boolean
  cup: 0 | 1 | 2 // none · in hand · on table
  cx: number
  cz: number
  hot: number
}
const _o: P2 = { x: 0, z: 0, hx: 1, hz: 0 }
const yawOf = (hx: number, hz: number) => Math.atan2(-hz, hx)

function legPose(l: Leg, t: number, o: Pose) {
  const s = ((t - l.t0) / Math.max(1e-6, l.t1 - l.t0)) * l.path.L
  pathAt(l.path, s, _o)
  o.x = _o.x
  o.z = _o.z
  o.head = yawOf(_o.hx, _o.hz)
  o.moving = t < l.t1
}

/** queue arc (distance from the register) at time t */
function queueArc(p: Person, t: number) {
  let arc = QPATH.L - V * (t - p.J)
  const n0 = p.E.length
  let ahead = n0
  for (let k = 0; k < n0; k++) {
    if (p.E[k] <= t) {
      ahead = n0 - k - 1
      arc = Math.max(arc, GAP * (n0 - k) - V * (t - p.E[k]))
    }
  }
  return Math.max(arc, GAP * ahead, 0)
}

export function personPose(p: Person, t: number, o: Pose) {
  o.vis = 0
  o.sit = false
  o.cup = 0
  o.hot = 0
  if (t < p.a || t > p.end) return o
  // fade in / out at the board edges
  o.vis = Math.min(1, (t - p.a) / 0.45, (p.end - t) / 0.45)
  if (t < p.entry.t1 || p.kind === 'walker') {
    if (t <= p.entry.t1) legPose(p.entry, t, o)
    else if (p.legs.length && t >= p.legs[0].t0) legPose(p.legs[0], t, o)
    else {
      legPose(p.entry, p.entry.t1, o)
      o.moving = false
      o.head = yawOf(0, -1) + Math.sin((t - p.J) * 3) * 0.5 // peer at the queue
    }
    return o
  }
  if (t < p.r) {
    const arc = queueArc(p, t)
    pathAt(QPATH, arc, _o)
    o.x = _o.x
    o.z = _o.z
    o.head = yawOf(0, -1)
    o.moving = arc > 0.01 && Math.abs(queueArc(p, t + 0.05) - arc) > 0.002
    return o
  }
  if (t < p.lr) {
    o.x = REG[0]
    o.z = REG[1]
    o.head = yawOf(0, -1)
    o.moving = false
    return o
  }
  if (t < p.h) {
    const k = Math.min(1, (t - p.lr) / Math.max(1e-6, p.p - p.lr))
    o.x = REG[0] + (PICK[0] - REG[0]) * k
    o.z = REG[1] + (PICK[1] - REG[1]) * k
    o.head = k < 1 ? yawOf(1, 0) : yawOf(0, -1)
    o.moving = k < 1
    return o
  }
  o.cup = 1
  o.hot = Math.max(0, 1 - (t - p.h) / 5)
  if (p.seat >= 0 && t >= p.seatT0 && t <= p.seatT1) {
    const s = SEATS[p.seat]
    o.x = s.x
    o.z = s.z
    o.head = s.face
    o.moving = false
    o.sit = true
    o.cup = 2
    o.cx = s.x + (s.table[0] - s.x) * 0.55
    o.cz = s.z + (s.table[1] - s.z) * 0.55
    o.hot = Math.max(0, 1 - (t - p.seatT0) / 6)
    return o
  }
  for (const l of p.legs) {
    if (t >= l.t0 && t <= l.t1) {
      legPose(l, t, o)
      return o
    }
  }
  const last = p.legs[p.legs.length - 1]
  legPose(last, last.t1, o)
  return o
}

/** barista x along the back of the counter, plus what she's doing */
export function baristaPose(day: Day, t: number, o: Pose & { act: number; cupOut: boolean }) {
  o.vis = 0
  o.act = 0
  o.cupOut = false
  o.cup = 0
  if (t < day.bIn.t0 || t > day.bOut.t1) return o
  o.vis = Math.min(1, (t - day.bIn.t0) / 0.45, (day.bOut.t1 - t) / 0.45)
  if (t <= day.bIn.t1) {
    legPose(day.bIn, t, o)
    return o
  }
  if (t >= day.bOut.t0) {
    legPose(day.bOut, t, o)
    return o
  }
  o.z = BARISTA_Z
  o.head = yawOf(0, 1)
  o.moving = false
  const S = day.served
  // last service that started before t
  let lo = -1
  for (let i = 0; i < S.length; i++) if (S[i].s <= t) lo = i
  const lerpX = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, Math.max(0, k))
  const IDLE = -2.6
  const nextS = lo + 1 < S.length ? S[lo + 1].s : Infinity
  if (lo < 0) {
    o.x = nextS - t < 0.4 ? lerpX(IDLE, BARISTA_REG, 1 - (nextS - t) / 0.4) : IDLE
    o.act = nextS - t < 0.4 ? 0 : 2
    return o
  }
  const c = S[lo]
  if (t < c.lr) {
    o.x = BARISTA_REG
    o.act = 1
  } else if (t < c.f) {
    o.x = lerpX(BARISTA_REG, BARISTA_MACH, (t - c.lr) / 0.35)
    o.moving = t < c.lr + 0.35
    o.act = 3
  } else {
    // hand over, then drift to the idle spot or back to the till
    const wait = nextS - t
    let x = BARISTA_MACH
    if (t - c.f > 1.0) x = lerpX(BARISTA_MACH, IDLE, (t - c.f - 1.0) / 0.4)
    if (wait < 0.4) x = lerpX(x, BARISTA_REG, 1 - wait / 0.4)
    o.x = x
    o.act = t < c.h ? 4 : t - c.f > 1.4 && wait > 0.4 ? 2 : 0
    o.moving = (t - c.f > 1.0 && t - c.f < 1.4) || wait < 0.4
  }
  o.cupOut = t >= c.f - 0.35 && t < c.h
  return o
}

export function cupsSold(day: Day, t: number) {
  let n = 0
  for (const [h, c] of day.cupTimes) {
    if (h > t) break
    n += c
  }
  return n
}
