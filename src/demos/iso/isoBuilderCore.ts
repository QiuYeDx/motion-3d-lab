/* Iso Builder — editor model (grid, per-cell animation clocks, undo, town generator, idle "ghost" actions).
   Pure TS, no React / three: the scene reads these typed arrays every frame. */

export const N = 12
export const HALF = (N - 1) / 2

export const GRASS = 0
export const ROAD = 1
export const HOUSE = 2
export const TREE = 3
export const WATER = 4
export type Kind = 0 | 1 | 2 | 3 | 4

/** neighbour order N E S W → mask bits 1 2 4 8 (N = −z) */
export const DX = [0, 1, 0, -1]
export const DZ = [-1, 0, 1, 0]

export const clock = () => performance.now() / 1000

export function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Snap = { t: Uint8Array; v: Float32Array }
type QItem = { at: number; k: number; t: Kind; v: number; puff: number }

export type Puffs = {
  x: Float32Array
  y: Float32Array
  z: Float32Array
  vx: Float32Array
  vy: Float32Array
  vz: Float32Array
  born: Float32Array
  size: Float32Array
  next: number
}
export const PUFFS = 220

export class Editor {
  t = new Uint8Array(N * N)
  v = new Float32Array(N * N)
  born = new Float32Array(N * N).fill(-99)
  /** the previous occupant shrinks out from `died` */
  oT = new Uint8Array(N * N)
  oV = new Float32Array(N * N)
  died = new Float32Array(N * N).fill(-99)
  /** house facing (current, eased toward the nearest road every frame) */
  yaw = new Float32Array(N * N)
  /** clear wave: column falls at fallAt, a fresh grass column rises at riseAt */
  fallAt = new Float32Array(N * N).fill(-99)
  riseAt = new Float32Array(N * N).fill(-99)
  queue: QItem[] = []
  qi = 0
  undo: Snap[] = []
  busyUntil = 0
  dirty = true
  puffs: Puffs = {
    x: new Float32Array(PUFFS),
    y: new Float32Array(PUFFS),
    z: new Float32Array(PUFFS),
    vx: new Float32Array(PUFFS),
    vy: new Float32Array(PUFFS),
    vz: new Float32Array(PUFFS),
    born: new Float32Array(PUFFS).fill(-99),
    size: new Float32Array(PUFFS),
    next: 0,
  }

  busy(now: number) {
    return now < this.busyUntil || this.qi < this.queue.length
  }

  mask(k: number, kind: number) {
    const i = k % N
    const j = (k / N) | 0
    let m = 0
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d]
      const nj = j + DZ[d]
      if (ni >= 0 && ni < N && nj >= 0 && nj < N && this.t[nj * N + ni] === kind) m |= 1 << d
    }
    return m
  }

  is(i: number, j: number, kind: number) {
    return i >= 0 && i < N && j >= 0 && j < N && this.t[j * N + i] === kind
  }

  /** yaw that turns a house's door (+z) toward an adjacent road; prefers the faces the camera can see */
  facing(k: number): number | null {
    const i = k % N
    const j = (k / N) | 0
    if (this.is(i, j + 1, ROAD)) return 0
    if (this.is(i + 1, j, ROAD)) return Math.PI / 2
    if (this.is(i, j - 1, ROAD)) return Math.PI
    if (this.is(i - 1, j, ROAD)) return -Math.PI / 2
    return null
  }

  puff(k: number, at: number, count: number, y = 0.05) {
    const p = this.puffs
    const cx = (k % N) - HALF
    const cz = ((k / N) | 0) - HALF
    for (let n = 0; n < count; n++) {
      const q = p.next
      p.next = (p.next + 1) % PUFFS
      const a = (n / count) * Math.PI * 2 + Math.random() * 0.6
      const sp = 0.9 + Math.random() * 0.7
      p.x[q] = cx + Math.cos(a) * 0.22
      p.z[q] = cz + Math.sin(a) * 0.22
      p.y[q] = y
      p.vx[q] = Math.cos(a) * sp
      p.vz[q] = Math.sin(a) * sp
      p.vy[q] = 0.5 + Math.random() * 0.5
      p.size[q] = 0.11 + Math.random() * 0.07
      p.born[q] = at + Math.random() * 0.04
    }
  }

  /** returns true if the cell changed */
  set(k: number, t: Kind, v: number, at: number, puff = 5, force = false) {
    if (this.t[k] === t && !force) return false
    if (this.t[k] === t && t === GRASS) return false
    this.oT[k] = this.t[k]
    this.oV[k] = this.v[k]
    this.died[k] = at
    this.t[k] = t
    this.v[k] = v
    this.born[k] = at
    if (t === HOUSE) {
      const f = this.facing(k)
      this.yaw[k] = f ?? (Math.floor(v * 4) * Math.PI) / 2
    }
    if (puff) this.puff(k, at, t === GRASS ? Math.max(3, puff - 2) : puff, t === WATER ? 0 : 0.05)
    this.dirty = true
    return true
  }

  snap(): Snap {
    return { t: this.t.slice(), v: this.v.slice() }
  }

  push(s: Snap) {
    this.undo.push(s)
    if (this.undo.length > 60) this.undo.shift()
    this.dirty = true
  }

  restore(at: number) {
    const s = this.undo.pop()
    if (!s) return false
    for (let k = 0; k < N * N; k++) {
      if (s.t[k] === this.t[k] && (s.v[k] === this.v[k] || s.t[k] === ROAD || s.t[k] === WATER || s.t[k] === GRASS)) continue
      const i = k % N
      const j = (k / N) | 0
      // tiny diagonal stagger so a big undo reads as a wave instead of a cut
      this.queue.push({ at: at + (i + j) * 0.012, k, t: s.t[k] as Kind, v: s.v[k], puff: 3 })
    }
    this.queue.sort((a, b) => a.at - b.at)
    this.dirty = true
    return true
  }

  clear(at: number) {
    this.queue.length = 0
    this.qi = 0
    let last = at
    for (let k = 0; k < N * N; k++) {
      const i = k % N
      const j = (k / N) | 0
      const d = ((i + j) / (2 * (N - 1))) * 0.6 + hash(k * 3.1) * 0.06
      this.fallAt[k] = at + d
      this.riseAt[k] = at + 1.15 + d * 0.9
      last = Math.max(last, this.riseAt[k])
      this.oT[k] = this.t[k]
      this.oV[k] = this.v[k]
      // the old occupant rides the falling column, then vanishes off-screen
      this.died[k] = this.riseAt[k] - 0.3
      this.t[k] = GRASS
      this.born[k] = this.riseAt[k]
    }
    this.busyUntil = last + 0.5
    this.dirty = true
  }

  /** run scheduled placements whose time has come */
  step(now: number) {
    const q = this.queue
    while (this.qi < q.length && q[this.qi].at <= now) {
      const it = q[this.qi++]
      this.set(it.k, it.t, it.v, it.at, it.puff, it.t === HOUSE || it.t === TREE)
    }
    if (this.qi >= q.length && q.length) {
      q.length = 0
      this.qi = 0
    }
  }

  /** replace the map with a freshly planned town, staggered over ~1.5 s */
  generate(at: number, seed = Math.floor(Math.random() * 1e9)) {
    const plan = planTown(mulberry(seed))
    const q: QItem[] = []
    for (let k = 0; k < N * N; k++) {
      const cur = this.t[k]
      const nxt = plan.t[k]
      if (cur === GRASS) continue
      if (cur === nxt && (cur === ROAD || cur === WATER)) continue
      const i = k % N
      const j = (k / N) | 0
      q.push({ at: at + ((i + j) / (2 * (N - 1))) * 0.22, k, t: GRASS, v: 0, puff: 0 })
    }
    for (const p of plan.order) {
      const cur = this.t[p.k]
      if (cur === p.t && (cur === ROAD || cur === WATER)) continue
      q.push({ at: at + p.at, k: p.k, t: p.t, v: plan.v[p.k], puff: p.t === TREE ? 0 : 2 })
    }
    q.sort((a, b) => a.at - b.at)
    this.queue = q
    this.qi = 0
    this.busyUntil = at + 1.65
  }

  stats() {
    let road = 0
    let house = 0
    let green = 0
    for (let k = 0; k < N * N; k++) {
      const t = this.t[k]
      if (t === ROAD) road++
      else if (t === HOUSE) house++
      else if (t === TREE || t === GRASS) green++
    }
    return { road, house, green: Math.round((green / (N * N)) * 100), undo: this.undo.length }
  }

  /** a small, sensible edit for the idle ghost cursor */
  pickAction(rnd: () => number): { t: Kind; cells: number[] } | null {
    const houseSpots: number[] = []
    const treeSpots: number[] = []
    const waterSpots: number[] = []
    const trees: number[] = []
    const ends: number[] = []
    for (let k = 0; k < N * N; k++) {
      const t = this.t[k]
      if (t === GRASS) {
        if (this.mask(k, ROAD)) houseSpots.push(k)
        if (this.mask(k, TREE) || this.mask(k, WATER)) treeSpots.push(k)
        if (this.mask(k, WATER)) waterSpots.push(k)
      } else if (t === TREE) trees.push(k)
      else if (t === ROAD) {
        const m = this.mask(k, ROAD)
        if (m === 1 || m === 2 || m === 4 || m === 8) ends.push(k)
      }
    }
    const pick = (a: number[]) => a[Math.floor(rnd() * a.length)]
    const opts: [number, () => { t: Kind; cells: number[] } | null][] = [
      [houseSpots.length ? 3 : 0, () => ({ t: HOUSE, cells: [pick(houseSpots)] })],
      [treeSpots.length ? 2.2 : 0, () => {
        const k = pick(treeSpots)
        const cells = [k]
        const i = k % N
        const j = (k / N) | 0
        const d = Math.floor(rnd() * 4)
        if (rnd() < 0.6 && this.is(i + DX[d], j + DZ[d], GRASS)) cells.push((j + DZ[d]) * N + i + DX[d])
        return { t: TREE, cells }
      }],
      [ends.length ? 2 : 0, () => {
        const k = pick(ends)
        const m = this.mask(k, ROAD)
        const d = (([1, 2, 4, 8].indexOf(m) + 2) % 4) as number // away from the only neighbour
        const cells: number[] = []
        let i = k % N
        let j = (k / N) | 0
        const len = 1 + Math.floor(rnd() * 3)
        for (let s = 0; s < len; s++) {
          i += DX[d]
          j += DZ[d]
          if (!this.is(i, j, GRASS) && !this.is(i, j, TREE)) break
          cells.push(j * N + i)
        }
        return cells.length ? { t: ROAD, cells } : null
      }],
      [waterSpots.length ? 0.8 : 0, () => ({ t: WATER, cells: [pick(waterSpots)] })],
      [trees.length > 6 ? 0.6 : 0, () => ({ t: GRASS, cells: [pick(trees)] })],
    ]
    const total = opts.reduce((s, o) => s + o[0], 0)
    if (!total) return null
    let r = rnd() * total
    for (const [w, f] of opts) {
      if ((r -= w) <= 0 && w > 0) return f()
    }
    return null
  }
}

/* ------------------------------------------------------------------ town planner */

type Plan = { t: Uint8Array; v: Float32Array; order: { k: number; t: Kind; at: number }[] }

export function planTown(rnd: () => number): Plan {
  const t = new Uint8Array(N * N)
  const v = new Float32Array(N * N)
  for (let k = 0; k < N * N; k++) v[k] = rnd()
  const R = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
  const inb = (i: number, j: number) => i >= 0 && i < N && j >= 0 && j < N
  const put = (i: number, j: number, x: Kind) => {
    if (inb(i, j)) t[j * N + i] = x
  }
  const h = (j: number, i0: number, i1: number) => {
    for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) put(i, j, ROAD)
  }
  const vl = (i: number, j0: number, j1: number) => {
    for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) put(i, j, ROAD)
  }

  /* road network — a few hand-tuned families, randomised */
  const shape = R(0, 2)
  if (shape === 0) {
    // block loop with tails
    const a = R(2, 4)
    const b = a + R(4, 5)
    const c = R(2, 4)
    const d = c + R(4, 5)
    h(a, c, d)
    h(b, c, d)
    vl(c, a, b)
    vl(d, a, b)
    vl(R(c + 2, d - 2), a, rnd() < 0.5 ? b : a + 2) // an inner street → T junctions
    vl(c, R(0, 1), a)
    h(b, d, R(d + 2, N - 1))
    if (rnd() < 0.6) h(a, d, R(d + 1, N - 2))
  } else if (shape === 1) {
    // crossroads town
    const m = R(4, 6)
    const n = R(4, 6)
    h(m, R(0, 1), R(N - 2, N - 1))
    vl(n, R(0, 1), R(N - 2, N - 1))
    const j2 = R(m + 3, N - 2)
    h(j2, n, R(n + 3, N - 2))
    const i2 = R(1, n - 3)
    vl(i2, R(1, m - 3), m)
    if (rnd() < 0.6) vl(R(n + 3, N - 2), m, R(1, m - 3))
  } else {
    // two avenues and a high street
    const c = R(2, 3)
    const d = R(7, 9)
    const m = R(4, 7)
    vl(c, R(1, 3), N - 2)
    vl(d, 1, R(N - 4, N - 1))
    h(m, 0, d)
    h(R(1, 2), d, N - 2)
    if (rnd() < 0.7) h(N - 2, c, R(c + 3, d))
  }

  /* pond, sometimes with a river running to the island edge */
  for (let tries = 0; tries < 60; tries++) {
    const ci = 1.5 + rnd() * (N - 4)
    const cj = 1.5 + rnd() * (N - 4)
    const rx = 1.1 + rnd() * 0.9
    const rz = 1.1 + rnd() * 0.9
    const cells: number[] = []
    let blocked = 0
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const dd = Math.hypot((i - ci) / rx, (j - cj) / rz)
        if (dd < 1 + (rnd() - 0.5) * 0.25) {
          if (t[j * N + i] === ROAD) blocked++
          else cells.push(j * N + i)
        }
      }
    if (blocked > 1 || cells.length < 4) continue
    for (const k of cells) t[k] = WATER
    if (rnd() < 0.55) {
      const dirs = [0, 1, 2, 3].sort(() => rnd() - 0.5)
      const d = dirs[0]
      let i = Math.round(ci)
      let j = Math.round(cj)
      for (let s = 0; s < N; s++) {
        i += DX[d]
        j += DZ[d]
        if (!inb(i, j) || t[j * N + i] === ROAD) break
        put(i, j, WATER)
        if (rnd() < 0.3) {
          // meander: a sideways step keeps the river 4-connected
          const side = rnd() < 0.5 ? (d + 1) % 4 : (d + 3) % 4
          const si = i + DX[side]
          const sj = j + DZ[side]
          if (inb(si, sj) && t[sj * N + si] !== ROAD) {
            put(si, sj, WATER)
            i = si
            j = sj
          }
        }
      }
    }
    break
  }

  /* houses line the streets */
  const roadAdj = (k: number) => {
    const i = k % N
    const j = (k / N) | 0
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d]
      const nj = j + DZ[d]
      if (inb(ni, nj) && t[nj * N + ni] === ROAD) return true
    }
    return false
  }
  for (let k = 0; k < N * N; k++) if (t[k] === GRASS && roadAdj(k) && rnd() < 0.58) t[k] = HOUSE

  /* trees in clusters (and around the water) */
  const clusters = R(3, 5)
  for (let c = 0; c < clusters; c++) {
    let ci = 0
    let cj = 0
    for (let tries = 0; tries < 30; tries++) {
      ci = R(0, N - 1)
      cj = R(0, N - 1)
      if (t[cj * N + ci] === GRASS) break
    }
    const r = 1.4 + rnd() * 0.9
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const k = j * N + i
        if (t[k] !== GRASS) continue
        const dd = Math.hypot(i - ci, j - cj)
        if (dd < r && rnd() < 0.92 - (dd / r) * 0.55) t[k] = TREE
      }
  }
  for (let k = 0; k < N * N; k++) if (t[k] === GRASS && rnd() < 0.05) t[k] = TREE

  /* placement order: roads grow along the network (BFS), water from its centre, houses follow their road */
  const order: Plan['order'] = []
  const dist = new Int16Array(N * N).fill(-1)
  const firstRoad = t.indexOf(ROAD)
  let maxD = 1
  if (firstRoad >= 0) {
    const bfs = [firstRoad]
    dist[firstRoad] = 0
    for (let h2 = 0; h2 < bfs.length; h2++) {
      const k = bfs[h2]
      const i = k % N
      const j = (k / N) | 0
      for (let d = 0; d < 4; d++) {
        const ni = i + DX[d]
        const nj = j + DZ[d]
        const nk = nj * N + ni
        if (inb(ni, nj) && t[nk] === ROAD && dist[nk] < 0) {
          dist[nk] = dist[k] + 1
          maxD = Math.max(maxD, dist[nk])
          bfs.push(nk)
        }
      }
    }
  }
  const nearRoadD = (k: number) => {
    const i = k % N
    const j = (k / N) | 0
    let best = maxD
    for (let d = 0; d < 4; d++) {
      const ni = i + DX[d]
      const nj = j + DZ[d]
      if (inb(ni, nj) && dist[nj * N + ni] >= 0) best = Math.min(best, dist[nj * N + ni])
    }
    return best / maxD
  }
  let wi = 0
  let wj = 0
  let wn = 0
  for (let k = 0; k < N * N; k++)
    if (t[k] === WATER) {
      wi += k % N
      wj += (k / N) | 0
      wn++
    }
  wi /= wn || 1
  wj /= wn || 1
  for (let k = 0; k < N * N; k++) {
    const kind = t[k] as Kind
    if (kind === GRASS) continue
    const i = k % N
    const j = (k / N) | 0
    let at = 0
    if (kind === ROAD) at = 0.2 + (Math.max(0, dist[k]) / maxD) * 0.55
    else if (kind === WATER) at = 0.72 + Math.min(1, Math.hypot(i - wi, j - wj) / 5) * 0.3
    else if (kind === HOUSE) at = 0.9 + nearRoadD(k) * 0.4 + rnd() * 0.06
    else at = 1.15 + rnd() * 0.38
    order.push({ k, t: kind, at })
  }
  return { t, v, order }
}
