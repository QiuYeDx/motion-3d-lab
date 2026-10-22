/* Model railway — track graph, block interlocking and station passengers. No React / three here.

   Layout (x → lower-right on screen, z → lower-left; all trains run the same way round):
     outer loop O and inner loop I are concentric rounded rectangles sharing corner centres,
     linked by two crossovers (C1 outer→inner on the back straight, C2 inner→outer on the right side).
     The outer front straight has a passing siding on the outside; an island platform sits between
     the outer main and the inner front straight.

   Interlocking: every long edge is a block with a signal at its end. A train reserves the next block (plus any
   short connector in front of it, atomically) before it may pass the signal; blocks are released when the tail
   clears them. Because every block is longer than the longest train, a stopped train holds exactly one block, and
   every directed cycle of blocks has ≥ 4 blocks — so 3 trains can never wait on each other in a circle. */

export type Sample = { x: number; z: number; tx: number; tz: number }

/** polyline resampled at a uniform step so lookups are O(1) */
export class Poly {
  xs: Float32Array
  zs: Float32Array
  n: number
  L: number
  h: number
  constructor(raw: number[]) {
    const m = raw.length / 2
    const cum = new Float64Array(m)
    for (let i = 1; i < m; i++) cum[i] = cum[i - 1] + Math.hypot(raw[i * 2] - raw[i * 2 - 2], raw[i * 2 + 1] - raw[i * 2 - 1])
    this.L = cum[m - 1]
    this.n = Math.max(2, Math.ceil(this.L / 0.04) + 1)
    this.h = this.L / (this.n - 1)
    this.xs = new Float32Array(this.n)
    this.zs = new Float32Array(this.n)
    let j = 0
    for (let i = 0; i < this.n; i++) {
      const s = i * this.h
      while (j < m - 2 && cum[j + 1] < s) j++
      const seg = cum[j + 1] - cum[j] || 1
      const k = Math.min(1, Math.max(0, (s - cum[j]) / seg))
      this.xs[i] = raw[j * 2] + (raw[j * 2 + 2] - raw[j * 2]) * k
      this.zs[i] = raw[j * 2 + 1] + (raw[j * 2 + 3] - raw[j * 2 + 1]) * k
    }
  }
  at(s: number, o: Sample) {
    const f = Math.min(this.n - 1.0001, Math.max(0, s / this.h))
    const i = Math.floor(f)
    const k = f - i
    o.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * k
    o.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * k
    const dx = this.xs[i + 1] - this.xs[i]
    const dz = this.zs[i + 1] - this.zs[i]
    const l = Math.hypot(dx, dz) || 1
    o.tx = dx / l
    o.tz = dz / l
    return o
  }
}

/* ------------------------------------------------------------------ loop geometry */
function roundedLoop(W: number, H: number, r: number) {
  const a = W - r
  const b = H - r
  const raw: number[] = []
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.05))
    for (let i = 0; i < n; i++) raw.push(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n)
  }
  const arc = (cx: number, cz: number, t0: number, t1: number) => {
    const n = Math.max(4, Math.ceil((Math.abs(t1 - t0) * r) / 0.04))
    for (let i = 0; i < n; i++) {
      const t = t0 + ((t1 - t0) * i) / n
      raw.push(cx + r * Math.cos(t), cz + r * Math.sin(t))
    }
  }
  line(-a, H, a, H)
  arc(a, b, Math.PI / 2, 0)
  line(W, b, W, -b)
  arc(a, -b, 0, -Math.PI / 2)
  line(a, -H, -a, -H)
  arc(-a, -b, -Math.PI / 2, -Math.PI)
  line(-W, -b, -W, b)
  arc(-a, b, Math.PI, Math.PI / 2)
  raw.push(-a, H)
  return new Poly(raw)
}

function cut(loop: Poly, s0: number, s1: number) {
  const raw: number[] = []
  const o: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  const n = Math.max(2, Math.ceil((s1 - s0) / 0.04))
  for (let i = 0; i <= n; i++) {
    let s = s0 + ((s1 - s0) * i) / n
    s = ((s % loop.L) + loop.L) % loop.L
    loop.at(s, o)
    raw.push(o.x, o.z)
  }
  return new Poly(raw)
}

/** tangent-continuous S curve between two points that share a heading */
function sCurve(p0: Sample, p1: Sample) {
  const d = Math.hypot(p1.x - p0.x, p1.z - p0.z) / 3
  const c1x = p0.x + p0.tx * d
  const c1z = p0.z + p0.tz * d
  const c2x = p1.x - p1.tx * d
  const c2z = p1.z - p1.tz * d
  const raw: number[] = []
  for (let i = 0; i <= 120; i++) {
    const t = i / 120
    const u = 1 - t
    raw.push(
      u * u * u * p0.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * p1.x,
      u * u * u * p0.z + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * p1.z,
    )
  }
  return new Poly(raw)
}

/* ------------------------------------------------------------------ graph */
export type Edge = {
  id: number
  poly: Poly
  from: number
  to: number
  short: boolean
  /** station dwell point (head position along the edge), -1 = none */
  stopAt: number
  /** which side the platform is on, relative to travel (+1 right, -1 left) */
  platformSide: number
  /** signal side (+1 right, -1 left), 0 = no signal */
  sig: number
  /** stop this far before the end node (fouling point before merges) */
  margin: number
}
export type Node = { id: number; ins: number[]; outs: number[]; x: number; z: number; turnout: number }
export type Turnout = {
  id: number
  node: number
  kind: 'diverge' | 'merge'
  /** outs (diverge) or ins (merge) in state order */
  edges: number[]
  state: number
  k: number
  pending: boolean
  clickable: boolean
  letter: string
  names: [string, string]
}

export const O_W = 9
export const O_H = 5.6
export const O_R = 3
export const GAP = 1.6
export const I_W = O_W - GAP
export const I_H = O_H - GAP
export const I_R = O_R - GAP
export const PLATFORM = { x0: -2.4, x1: 2.4, z0: I_H + 0.42, z1: O_H - 0.42, y: 0.2 }

export function buildLayout() {
  const O = roundedLoop(O_W, O_H, O_R)
  const I = roundedLoop(I_W, I_H, I_R)
  const tmpA: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  const tmpB: Sample = { x: 0, z: 0, tx: 0, tz: 0 }
  // stations along the loops (arc length from the start of the front straight, x = -(W - r))
  const oS1 = 0.4
  const oS2 = 11.6
  const oX2m = 16.712 + 4.4
  const oX1d = 26.624 + 3.6
  const oMid = O.L - 4.712 - 2.6
  const iX2d = 14.2 + 0.8
  const iX1m = 21.6 + 7.2
  const iMid = I.L - 2.199 - 2.6
  const iP = 9.2

  const nodes: Node[] = []
  const node = (poly: Poly, s: number) => {
    poly.at(s, tmpA)
    nodes.push({ id: nodes.length, ins: [], outs: [], x: tmpA.x, z: tmpA.z, turnout: -1 })
    return nodes.length - 1
  }
  const nS1 = node(O, oS1)
  const nS2 = node(O, oS2)
  const nX2m = node(O, oX2m)
  const nX1d = node(O, oX1d)
  const nOm = node(O, oMid)
  const nX1m = node(I, iX1m)
  const nIm = node(I, iMid)
  const nIp = node(I, iP)
  const nX2d = node(I, iX2d)

  const edges: Edge[] = []
  const edge = (poly: Poly, from: number, to: number, o: Partial<Edge> = {}) => {
    const e: Edge = { id: edges.length, poly, from, to, short: false, stopAt: -1, platformSide: 0, sig: 1, margin: 0.5, ...o }
    edges.push(e)
    nodes[from].outs.push(e.id)
    nodes[to].ins.push(e.id)
    return e.id
  }
  // siding: S curve out to the passing track, straight, S curve back
  O.at(oS1, tmpA)
  const sidA: Sample = { x: -2.4, z: O_H + GAP, tx: 1, tz: 0 }
  const sidB: Sample = { x: 2.4, z: O_H + GAP, tx: 1, tz: 0 }
  const sc1 = sCurve(tmpA, sidA)
  O.at(oS2, tmpB)
  const sc2 = sCurve(sidB, tmpB)
  const sidRaw: number[] = []
  for (let i = 0; i < sc1.n; i++) sidRaw.push(sc1.xs[i], sc1.zs[i])
  for (let i = 1; i < sc2.n; i++) sidRaw.push(sc2.xs[i], sc2.zs[i])
  const siding = new Poly(sidRaw)

  const eO1 = edge(cut(O, oS1, oS2), nS1, nS2, { stopAt: 2.0 - tmpA.x, platformSide: -1, sig: -1, margin: 1.75 })
  const eO1s = edge(siding, nS1, nS2, { margin: 1.75 })
  const eO2 = edge(cut(O, oS2, oX2m), nS2, nX2m, { margin: 1.75 })
  const eO3 = edge(cut(O, oX2m, oX1d), nX2m, nX1d)
  const eO4a = edge(cut(O, oX1d, oMid), nX1d, nOm)
  const eO4b = edge(cut(O, oMid, O.L + oS1), nOm, nS1)
  O.at(oX1d, tmpA)
  I.at(iX1m, tmpB)
  const eC1 = edge(sCurve(tmpA, tmpB), nX1d, nX1m, { short: true, sig: 0 })
  const eI2 = edge(cut(I, iX2d, iX1m), nX2d, nX1m, { sig: -1, margin: 1.75 })
  const eI1a = edge(cut(I, iX1m, iMid), nX1m, nIm)
  const iStop = I.L - iMid + 8.0 // head stops at x = 2.0 on the inner front straight
  const eI1b = edge(cut(I, iMid, I.L + iP), nIm, nIp, { stopAt: iStop, platformSide: 1 })
  const eI1c = edge(cut(I, iP, iX2d), nIp, nX2d)
  I.at(iX2d, tmpA)
  O.at(oX2m, tmpB)
  const eC2 = edge(sCurve(tmpA, tmpB), nX2d, nX2m, { short: true, sig: 0 })

  const turnouts: Turnout[] = []
  const turnout = (n: number, kind: 'diverge' | 'merge', e: number[], letter = '', names: [string, string] = ['', '']) => {
    const t: Turnout = { id: turnouts.length, node: n, kind, edges: e, state: 0, k: 0, pending: false, clickable: kind === 'diverge', letter, names }
    nodes[n].turnout = t.id
    turnouts.push(t)
  }
  turnout(nS1, 'diverge', [eO1, eO1s], 'A', ['进站', '越行'])
  turnout(nX1d, 'diverge', [eO4a, eC1], 'B', ['外环', '入内环'])
  turnout(nX2d, 'diverge', [eI2, eC2], 'C', ['内环', '出外环'])
  turnout(nS2, 'merge', [eO1, eO1s])
  turnout(nX2m, 'merge', [eO2, eC2])
  turnout(nX1m, 'merge', [eI2, eC1])

  return {
    O,
    I,
    nodes,
    edges,
    turnouts,
    ids: { eO1, eO1s, eO2, eO3, eO4a, eO4b, eC1, eI2, eI1a, eI1b, eI1c, eC2 },
  }
}
export type Layout = ReturnType<typeof buildLayout>

/* ------------------------------------------------------------------ trains */
export type VehKind = 'steam' | 'tender' | 'coach' | 'emuHead' | 'emu' | 'emuTail' | 'diesel' | 'tank' | 'box' | 'logs' | 'container'
export type Veh = { kind: VehKind; len: number; c: number; half: number }
export type TrainSpec = { name: string; vmax: number; stops: boolean; vehs: { kind: VehKind; len: number }[]; edge: number; s: number }

export class Train {
  id: number
  name: string
  vmax: number
  stops: boolean
  vehs: Veh[]
  len: number
  route: number[]
  hi = 0
  s: number
  v = 0
  dwell = 0
  dwellDone = false
  waiting = 0
  constructor(id: number, spec: TrainSpec) {
    this.id = id
    this.name = spec.name
    this.vmax = spec.vmax
    this.stops = spec.stops
    let d = 0.02
    this.vehs = spec.vehs.map((v) => {
      const out = { kind: v.kind, len: v.len, c: d + v.len / 2, half: v.len / 2 - Math.min(0.17, v.len * 0.22) }
      d += v.len + 0.055
      return out
    })
    this.len = d
    this.route = [spec.edge]
    this.s = spec.s
  }
}

const ACC = 0.65
const DEC = 1.05
export const DWELL = 4.2

export class Railway {
  L: Layout
  trains: Train[] = []
  owner: Int16Array
  sigK: Float32Array
  onDwell?: (t: Train, e: Edge) => void
  constructor(L: Layout, specs: TrainSpec[]) {
    this.L = L
    this.owner = new Int16Array(L.edges.length).fill(-1)
    this.sigK = new Float32Array(L.edges.length)
    specs.forEach((sp, i) => {
      const t = new Train(i, sp)
      this.trains.push(t)
      this.owner[sp.edge] = i
    })
    for (let e = 0; e < L.edges.length; e++) this.sigK[e] = this.signalGreen(e) ? 1 : 0
  }

  len(e: number) {
    return this.L.edges[e].poly.L
  }

  /** the next edges a train would reserve from the end of edge e (stops after the first long edge) */
  nextSeq(e: number, out: number[]) {
    out.length = 0
    let n = this.L.nodes[this.L.edges[e].to]
    for (let guard = 0; guard < 4; guard++) {
      let nx = n.outs[0]
      if (n.turnout >= 0) {
        const t = this.L.turnouts[n.turnout]
        if (t.kind === 'diverge') nx = t.edges[t.state]
      }
      out.push(nx)
      if (!this.L.edges[nx].short) break
      n = this.L.nodes[this.L.edges[nx].to]
    }
    return out
  }

  private seq: number[] = []
  tryReserve(t: Train) {
    const last = t.route[t.route.length - 1]
    const seq = this.nextSeq(last, this.seq)
    // facing points that are still moving cannot be routed over
    let p = last
    for (const e of seq) {
      const n = this.L.nodes[this.L.edges[p].to]
      if (n.turnout >= 0) {
        const to = this.L.turnouts[n.turnout]
        if (to.kind === 'diverge' && (Math.abs(to.k - to.state) > 0.03 || to.pending)) return false
      }
      p = e
    }
    for (const e of seq) if (this.owner[e] >= 0) return false
    p = last
    for (const e of seq) {
      const n = this.L.nodes[this.L.edges[p].to]
      if (n.turnout >= 0) {
        const to = this.L.turnouts[n.turnout]
        if (to.kind === 'merge') to.state = Math.max(0, to.edges.indexOf(p))
      }
      this.owner[e] = t.id
      t.route.push(e)
      p = e
    }
    return true
  }

  locked(to: { node: number }) {
    const inE = this.L.nodes[to.node].ins[0]
    const o = this.owner[inE]
    if (o < 0) return false
    const r = this.trains[o].route
    const i = r.indexOf(inE)
    return i >= 0 && i < r.length - 1
  }

  /** user / dispatcher throws a facing turnout; deferred while a train has a route set over it */
  toggle(id: number) {
    const to = this.L.turnouts[id]
    if (this.locked(to)) {
      to.pending = !to.pending
      return false
    }
    to.state ^= 1
    to.pending = false
    return true
  }

  signalGreen(e: number) {
    const o = this.owner[e]
    if (o >= 0) {
      const r = this.trains[o].route
      return r.indexOf(e) < r.length - 1
    }
    const seq = this.nextSeq(e, this.seq)
    for (const x of seq) if (this.owner[x] >= 0) return false
    return true
  }

  update(dt: number) {
    const { edges, turnouts } = this.L
    for (const to of turnouts) {
      if (to.pending && !this.locked(to)) {
        to.state ^= 1
        to.pending = false
      }
      to.k += (to.state - to.k) * (1 - Math.exp(-dt * 7))
    }
    for (const t of this.trains) {
      const head = edges[t.route[t.hi]]
      if (t.dwell > 0) {
        t.dwell -= dt
        t.v = 0
        if (t.dwell <= 0) t.dwellDone = true
      }
      // distance the train may still run (to the stop point of the last reserved block)
      const limitOf = () => {
        let d = edges[t.route[t.hi]].poly.L - t.s
        for (let j = t.hi + 1; j < t.route.length; j++) d += this.len(t.route[j])
        return d - edges[t.route[t.route.length - 1]].margin
      }
      let limit = limitOf()
      const brake = (t.v * t.v) / (2 * DEC)
      if (limit < brake + 1.6 && this.tryReserve(t)) limit = limitOf()
      let stopLimit = Infinity
      if (t.stops) {
        if (head.stopAt >= 0 && !t.dwellDone && t.s <= head.stopAt + 0.01) stopLimit = head.stopAt - t.s
        else {
          let d = head.poly.L - t.s
          for (let j = t.hi + 1; j < t.route.length; j++) {
            const e = edges[t.route[j]]
            if (e.stopAt >= 0) {
              stopLimit = d + e.stopAt
              break
            }
            d += e.poly.L
          }
        }
      }
      const atStop = stopLimit < 0.015
      if (atStop && !t.dwellDone && t.dwell <= 0 && head.stopAt >= 0) {
        t.dwell = DWELL
        t.v = 0
        t.s = head.stopAt
        this.onDwell?.(t, head)
      }
      if (t.dwell > 0) continue
      const lim = Math.max(0, Math.min(limit, stopLimit))
      const vAllow = Math.sqrt(2 * DEC * Math.max(0, lim - 0.01))
      const target = Math.min(t.vmax, vAllow)
      t.v = t.v < target ? Math.min(target, t.v + ACC * dt) : target
      t.waiting = t.v < 0.02 && lim < 0.05 ? t.waiting + dt : 0
      t.s += Math.min(t.v * dt, lim)
      while (t.s > this.len(t.route[t.hi]) && t.hi < t.route.length - 1) {
        t.s -= this.len(t.route[t.hi])
        t.hi++
        t.dwellDone = false
      }
      // release blocks the tail has cleared
      let rem = t.s - t.len
      let idx = t.hi
      while (rem < 0 && idx > 0) {
        idx--
        rem += this.len(t.route[idx])
      }
      if (idx > 0) {
        for (let j = 0; j < idx; j++) if (this.owner[t.route[j]] === t.id) this.owner[t.route[j]] = -1
        t.route.splice(0, idx)
        t.hi -= idx
      }
    }
    for (let e = 0; e < edges.length; e++) {
      if (!edges[e].sig) continue
      const g = this.signalGreen(e) ? 1 : 0
      this.sigK[e] += (g - this.sigK[e]) * (1 - Math.exp(-dt * 10))
    }
  }

  /** point at distance d behind the head of train t */
  behind(t: Train, d: number, o: Sample) {
    let idx = t.hi
    let rem = t.s - d
    while (rem < 0 && idx > 0) {
      idx--
      rem += this.len(t.route[idx])
    }
    return this.L.edges[t.route[idx]].poly.at(Math.max(0, rem), o)
  }

  carCentre(t: Train, vi: number, o: Sample) {
    return this.behind(t, t.vehs[vi].c, o)
  }

}

/* ------------------------------------------------------------------ station passengers */
export const P_MAX = 44
export const PS = { Off: 0, Arrive: 1, Wait: 2, Board: 3, Alight: 4, Leave: 5 } as const
export type Pax = {
  st: number
  x: number
  z: number
  y: number
  fx: number
  fz: number
  tx: number
  tz: number
  t: number
  delay: number
  head: number
  scale: number
  phase: number
  hop: number
}
export const FOOT = { x: PLATFORM.x0 + 0.78, z: (PLATFORM.z0 + PLATFORM.z1) / 2 }

export class Station {
  pax: Pax[] = []
  boarded = 0
  private spawnT = 0.4
  private seed = 1
  constructor() {
    for (let i = 0; i < P_MAX; i++)
      this.pax.push({ st: PS.Off, x: 0, z: 0, y: PLATFORM.y, fx: 0, fz: 0, tx: 0, tz: 0, t: 0, delay: 0, head: 0, scale: 0, phase: i * 1.7, hop: 0 })
    // a few people already waiting
    for (let i = 0; i < 6; i++) {
      const p = this.pax[i]
      p.st = PS.Wait
      this.spot(p)
      p.x = p.tx
      p.z = p.tz
      p.scale = 1
    }
  }
  rand() {
    this.seed = (this.seed * 16807) % 2147483647
    return (this.seed - 1) / 2147483646
  }
  private spot(p: Pax) {
    p.tx = PLATFORM.x0 + 1.25 + this.rand() * (PLATFORM.x1 - PLATFORM.x0 - 1.5)
    p.tz = PLATFORM.z0 + 0.14 + this.rand() * (PLATFORM.z1 - PLATFORM.z0 - 0.28)
  }
  private free() {
    return this.pax.find((p) => p.st === PS.Off)
  }
  /** a train has stopped: doors = platform-edge points next to each passenger car */
  dwell(doors: { x: number; z: number; dz: number }[]) {
    // alighting first
    for (const d of doors) {
      const n = Math.floor(this.rand() * 2.6)
      for (let k = 0; k < n; k++) {
        const p = this.free()
        if (!p) break
        p.st = PS.Alight
        p.fx = d.x + (this.rand() - 0.5) * 0.25
        p.fz = d.z + d.dz
        p.tx = p.fx
        p.tz = d.z
        p.x = p.fx
        p.z = p.fz
        p.t = 0
        p.delay = 0.15 + k * 0.45 + this.rand() * 0.3
        p.scale = 0
        p.hop = 0
      }
    }
    let order = 0
    for (const p of this.pax) {
      if (p.st !== PS.Wait || this.rand() > 0.75) continue
      let best = doors[0]
      for (const d of doors) if (Math.abs(d.x - p.x) < Math.abs(best.x - p.x)) best = d
      p.st = PS.Board
      p.fx = best.x + (this.rand() - 0.5) * 0.2
      p.fz = best.z + best.dz
      p.tx = p.fx
      p.tz = best.z
      p.delay = 0.9 + order * 0.28 + this.rand() * 0.3
      p.t = 0
      order++
    }
  }
  update(dt: number) {
    this.spawnT -= dt
    const waiting = this.pax.reduce((n, p) => n + (p.st === PS.Wait || p.st === PS.Arrive ? 1 : 0), 0)
    if (this.spawnT <= 0) {
      this.spawnT = 0.9 + this.rand() * 1.8
      const p = waiting < 12 ? this.free() : undefined
      if (p) {
        p.st = PS.Arrive
        p.x = FOOT.x
        p.z = FOOT.z
        p.scale = 0
        this.spot(p)
      }
    }
    const SPEED = 0.62
    for (const p of this.pax) {
      if (p.st === PS.Off) continue
      if (p.delay > 0) {
        p.delay -= dt
        if (p.st === PS.Board || p.st === PS.Alight) continue
      }
      if (p.st === PS.Arrive || p.st === PS.Leave) {
        p.scale = Math.min(1, p.scale + dt * 4)
        const dx = p.tx - p.x
        const dz = p.tz - p.z
        const d = Math.hypot(dx, dz)
        if (d > 0.01) {
          const st = Math.min(d, SPEED * dt)
          p.x += (dx / d) * st
          p.z += (dz / d) * st
          p.head = Math.atan2(-dz, dx)
        }
        if (p.st === PS.Leave && Math.hypot(FOOT.x - p.x, FOOT.z - p.z) < 0.3) {
          p.scale = Math.max(0, Math.min(p.scale, Math.hypot(FOOT.x - p.x, FOOT.z - p.z) / 0.3))
          if (d < 0.02) p.st = PS.Off
        } else if (d <= 0.01 && p.st === PS.Arrive) p.st = PS.Wait
      } else if (p.st === PS.Board) {
        // walk to the platform edge, then hop in
        const dx = p.tx - p.x
        const dz = p.tz - p.z
        const d = Math.hypot(dx, dz)
        if (d > 0.01) {
          const st = Math.min(d, SPEED * 1.3 * dt)
          p.x += (dx / d) * st
          p.z += (dz / d) * st
          p.head = Math.atan2(-dz, dx)
        } else {
          p.hop += dt / 0.32
          const k = Math.min(1, p.hop)
          p.x = p.tx + (p.fx - p.tx) * k
          p.z = p.tz + (p.fz - p.tz) * k
          p.y = PLATFORM.y + Math.sin(k * Math.PI) * 0.16 + k * 0.03
          p.scale = 1 - Math.max(0, (k - 0.6) / 0.4)
          if (k >= 1) {
            p.st = PS.Off
            p.hop = 0
            p.y = PLATFORM.y
            this.boarded++
          }
        }
      } else if (p.st === PS.Alight) {
        p.hop += dt / 0.32
        const k = Math.min(1, p.hop)
        p.scale = Math.min(1, k / 0.4)
        p.x = p.fx + (p.tx - p.fx) * k
        p.z = p.fz + (p.tz - p.fz) * k
        p.y = PLATFORM.y + 0.03 * (1 - k) + Math.sin(k * Math.PI) * 0.16
        p.head = Math.atan2(-(p.tz - p.fz), p.tx - p.fx)
        if (k >= 1) {
          p.st = PS.Leave
          p.y = PLATFORM.y
          p.tx = FOOT.x
          p.tz = FOOT.z
        }
      }
    }
  }
}
