/* Maze generation (recursive backtracker + braiding + shallow water) and four grid searches that record a
   step-by-step trace, so the page can replay any expansion progress as a pure function of "step k". */

export type Algo = 'astar' | 'dijkstra' | 'bfs' | 'greedy'
export const ALGOS: { value: Algo; label: string; zh: string }[] = [
  { value: 'astar', label: 'A*', zh: 'A* · 曼哈顿' },
  { value: 'dijkstra', label: 'Dijkstra', zh: 'Dijkstra' },
  { value: 'bfs', label: 'BFS', zh: '广度优先' },
  { value: 'greedy', label: '贪心', zh: '贪心最佳优先' },
]
export const WATER_COST = 4

export type Grid = { n: number; wall: Uint8Array; cost: Uint8Array; start: number; goal: number }

export type Trace = {
  steps: number
  /** step at which a cell was expanded (1-based), -1 = never */
  closedAt: Int32Array
  /** step at which a cell entered the open set (0 = start), -1 = never */
  openAt: Int32Array
  /** discovered-cell count after step s */
  discCum: Int32Array
  path: number[]
  cost: number
  found: boolean
}

export type Summary = { disc: number; steps: number; len: number; cost: number; found: boolean }

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

export function generate(n: number, seed: number): Grid {
  const r = rng(seed)
  const id = (x: number, y: number) => y * n + x
  const wall = new Uint8Array(n * n).fill(1)
  const cost = new Uint8Array(n * n).fill(1)
  const R = (n - 1) / 2
  const seen = new Uint8Array(R * R)
  const stack = [0]
  seen[0] = 1
  wall[id(1, 1)] = 0
  const nb: number[] = []
  while (stack.length) {
    const c = stack[stack.length - 1]
    const cx = c % R
    const cy = (c / R) | 0
    nb.length = 0
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0]
      const ny = cy + DIRS[d][1]
      if (nx < 0 || ny < 0 || nx >= R || ny >= R || seen[ny * R + nx]) continue
      nb.push(d)
    }
    if (!nb.length) {
      stack.pop()
      continue
    }
    const d = nb[Math.floor(r() * nb.length)]
    const nx = cx + DIRS[d][0]
    const ny = cy + DIRS[d][1]
    seen[ny * R + nx] = 1
    wall[id(2 * cx + 1 + DIRS[d][0], 2 * cy + 1 + DIRS[d][1])] = 0
    wall[id(2 * nx + 1, 2 * ny + 1)] = 0
    stack.push(ny * R + nx)
  }
  // braid: knock out some walls between rooms so there are loops (otherwise every algorithm finds the same path)
  const cand: number[] = []
  for (let y = 1; y < n - 1; y++)
    for (let x = 1; x < n - 1; x++) {
      if (!wall[id(x, y)] || (x + y) % 2 === 0) continue
      cand.push(id(x, y))
    }
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[cand[i], cand[j]] = [cand[j], cand[i]]
  }
  const knock = Math.round(cand.length * 0.16)
  for (let i = 0; i < knock; i++) wall[cand[i]] = 0

  const start = id(1, 1)
  const goal = id(n - 2, n - 2)
  // shallow water: a few blobs flooded along corridors, away from start / goal
  const pools = n > 16 ? 4 : 3
  for (let p = 0, tries = 0; p < pools && tries < 200; tries++) {
    const x = 1 + Math.floor(r() * (n - 2))
    const y = 1 + Math.floor(r() * (n - 2))
    const c = id(x, y)
    if (wall[c] || cost[c] > 1) continue
    if (x + y < 7 || 2 * (n - 2) - x - y < 7) continue
    const size = 5 + Math.floor(r() * 4)
    const q = [c]
    cost[c] = WATER_COST
    let k = 1
    for (let guard = 0; q.length && k < size && guard < 60; guard++) {
      const cc = q.splice(Math.floor(r() * q.length), 1)[0]
      for (let d = 0; d < 4 && k < size; d++) {
        const nx = (cc % n) + DIRS[d][0]
        const ny = ((cc / n) | 0) + DIRS[d][1]
        const ni = id(nx, ny)
        if (wall[ni] || cost[ni] > 1 || ni === start || ni === goal) continue
        cost[ni] = WATER_COST
        q.push(ni)
        k++
      }
      q.push(cc)
      if (q.length > 12) q.shift()
    }
    p++
  }
  return { n, wall, cost, start, goal }
}

/* small binary heap keyed by (key, seq) */
class Heap {
  k: number[] = []
  s: number[] = []
  v: number[] = []
  size = 0
  push(key: number, seq: number, val: number) {
    let i = this.size++
    this.k[i] = key
    this.s[i] = seq
    this.v[i] = val
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(i, p)) break
      this.swap(i, p)
      i = p
    }
  }
  pop() {
    const out = this.v[0]
    this.size--
    if (this.size > 0) {
      this.k[0] = this.k[this.size]
      this.s[0] = this.s[this.size]
      this.v[0] = this.v[this.size]
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.size && this.less(l, m)) m = l
        if (r < this.size && this.less(r, m)) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return out
  }
  less(a: number, b: number) {
    return this.k[a] < this.k[b] || (this.k[a] === this.k[b] && this.s[a] < this.s[b])
  }
  swap(a: number, b: number) {
    let t = this.k[a]
    this.k[a] = this.k[b]
    this.k[b] = t
    t = this.s[a]
    this.s[a] = this.s[b]
    this.s[b] = t
    t = this.v[a]
    this.v[a] = this.v[b]
    this.v[b] = t
  }
}

export function search(g: Grid, algo: Algo): Trace {
  const { n, wall, cost, start, goal } = g
  const N2 = n * n
  const gs = new Float64Array(N2).fill(Infinity)
  const came = new Int32Array(N2).fill(-1)
  const openAt = new Int32Array(N2).fill(-1)
  const closedAt = new Int32Array(N2).fill(-1)
  const gx = goal % n
  const gy = (goal / n) | 0
  const h = (c: number) => Math.abs((c % n) - gx) + Math.abs(((c / n) | 0) - gy)
  const weighted = algo === 'astar' || algo === 'dijkstra'
  const key = (c: number) => (algo === 'astar' ? (gs[c] + h(c)) * 1024 + h(c) : algo === 'dijkstra' ? gs[c] : algo === 'greedy' ? h(c) : 0)
  const heap = new Heap()
  let seq = 0
  gs[start] = 0
  openAt[start] = 0
  heap.push(key(start), seq++, start)
  let step = 0
  let found = false
  const discPerStep: number[] = [1]
  let disc = 1
  while (heap.size) {
    const c = heap.pop()
    if (closedAt[c] >= 0) continue
    step++
    closedAt[c] = step
    if (c === goal) {
      found = true
      discPerStep[step] = disc
      break
    }
    const cx = c % n
    const cy = (c / n) | 0
    for (let d = 0; d < 4; d++) {
      const nx = cx + DIRS[d][0]
      const ny = cy + DIRS[d][1]
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue
      const nb = ny * n + nx
      if (wall[nb] || closedAt[nb] >= 0) continue
      const ng = gs[c] + (weighted ? cost[nb] : 1)
      if (!weighted) {
        if (openAt[nb] >= 0) continue
      } else if (ng >= gs[nb]) continue
      gs[nb] = ng
      came[nb] = c
      if (openAt[nb] < 0) {
        openAt[nb] = step
        disc++
      }
      heap.push(key(nb), seq++, nb)
    }
    discPerStep[step] = disc
  }
  const path: number[] = []
  let pc = 0
  if (found) {
    for (let c = goal; c >= 0; c = came[c]) path.push(c)
    path.reverse()
    for (let i = 1; i < path.length; i++) pc += cost[path[i]]
  }
  const discCum = new Int32Array(step + 1)
  for (let s = 0; s <= step; s++) discCum[s] = discPerStep[s] ?? disc
  return { steps: step, closedAt, openAt, discCum, path, cost: pc, found }
}

export function summarize(t: Trace): Summary {
  return { disc: t.discCum[t.steps] ?? 0, steps: t.steps, len: Math.max(0, t.path.length - 1), cost: t.cost, found: t.found }
}
