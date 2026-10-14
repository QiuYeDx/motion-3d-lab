import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AnimatePresence, animate, motion, motionValue, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrthographicCamera } from 'three'
import { POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ================================================================== network
   Coordinates are on a grid (x → south-east on screen, z → south-west), scaled by K.
   Each line is a list of waypoints: station names, or [x, z] bend points that get filleted. */
const K = 0.86
const ST: Record<string, [number, number]> = {
  西郊: [-10, 2],
  公园西: [-5, 0],
  博物馆: [-1.5, 0],
  人民广场: [1, 0],
  东门: [5, 0],
  科技园: [7.5, 0],
  东湖: [10, 0],
  北站: [1, -7.5],
  体育中心: [1, -4],
  图书馆: [1, -2],
  长乐街: [1, 2],
  南湖: [1, 4],
  机场: [1, 7.5],
  西北新城: [-9, -6],
  西园: [-7, -4],
  金融街: [-5, -2],
  老城: [-1.5, 1.5],
  滨江: [4, 7],
  云谷: [9, -6],
  星河: [7, -4],
  樱花路: [5, -2],
  南门: [-1, 4],
  西南郊: [-4, 7],
  北海: [-2, -4],
  槐树里: [-5, 2],
}
type Way = string | [number, number]
type LineDef = { name: string; short: string; color: string; h: number; loop?: boolean; way: Way[] }
const LINES: LineDef[] = [
  { name: '1号线', short: '1', color: '#e2483d', h: 0.72, way: ['西郊', [-8, 2], [-6, 0], '公园西', '博物馆', '人民广场', '东门', '科技园', '东湖'] },
  { name: '2号线', short: '2', color: '#2d7be0', h: 1.08, way: ['北站', '体育中心', '图书馆', '人民广场', '长乐街', '南湖', '机场'] },
  { name: '3号线', short: '3', color: '#21a865', h: 1.8, way: ['西北新城', '西园', '金融街', '老城', '南湖', '滨江'] },
  { name: '4号线', short: '4', color: '#f29a12', h: 1.44, way: ['云谷', '星河', '樱花路', '长乐街', '南门', '西南郊'] },
  {
    name: '环线',
    short: '环',
    color: '#8d5bd8',
    h: 0.36,
    loop: true,
    way: ['北海', '体育中心', [5, -4], '樱花路', '东门', [5, 4], '南湖', '南门', [-5, 4], '槐树里', '公园西', '金融街', [-5, -4]],
  },
]
const NL = LINES.length

/* ------------------------------------------------------------------ path building */
type Path = { xs: Float32Array; zs: Float32Array; cum: Float32Array; L: number; loop: boolean; stS: Map<string, number> }
const P = (w: Way): [number, number] => {
  const p = typeof w === 'string' ? ST[w] : w
  return [p[0] * K, p[1] * K]
}
function buildPath(way: Way[], loop: boolean, r = 1.45 * K): Path {
  const n = way.length
  const pts: [number, number][] = []
  const stIdx: [string, number][] = []
  const get = (i: number) => way[((i % n) + n) % n]
  for (let i = 0; i < n; i++) {
    const w = way[i]
    const B = P(w)
    if (typeof w === 'string') {
      stIdx.push([w, pts.length])
      pts.push(B)
      continue
    }
    const A = P(get(i - 1))
    const Cc = P(get(i + 1))
    const la = Math.hypot(B[0] - A[0], B[1] - A[1])
    const lc = Math.hypot(Cc[0] - B[0], Cc[1] - B[1])
    const u1 = [(B[0] - A[0]) / la, (B[1] - A[1]) / la]
    const u2 = [(Cc[0] - B[0]) / lc, (Cc[1] - B[1]) / lc]
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])))
    if (th < 1e-3) {
      pts.push(B)
      continue
    }
    const limA = la * (typeof get(i - 1) === 'string' ? 0.9 : 0.5)
    const limC = lc * (typeof get(i + 1) === 'string' ? 0.9 : 0.5)
    const d = Math.min(r * Math.tan(th / 2), limA, limC)
    const P1: [number, number] = [B[0] - u1[0] * d, B[1] - u1[1] * d]
    const P2: [number, number] = [B[0] + u2[0] * d, B[1] + u2[1] * d]
    pts.push(P1)
    const N = 14
    for (let k = 1; k <= N; k++) {
      const t = k / N
      const a = (1 - t) * (1 - t)
      const b = 2 * (1 - t) * t
      const c = t * t
      pts.push([a * P1[0] + b * B[0] + c * P2[0], a * P1[1] + b * B[1] + c * P2[1]])
    }
  }
  if (loop) pts.push(pts[0])
  else {
    // run the track a little past both terminals so the end cars have somewhere to sit
    const ext = (a: [number, number], b: [number, number]): [number, number] => {
      const l = Math.hypot(a[0] - b[0], a[1] - b[1])
      return [a[0] + ((a[0] - b[0]) / l) * 0.42, a[1] + ((a[1] - b[1]) / l) * 0.42]
    }
    pts.unshift(ext(pts[0], pts[1]))
    pts.push(ext(pts[pts.length - 1], pts[pts.length - 2]))
    stIdx.forEach((e) => (e[1] += 1))
  }
  const m = pts.length
  const xs = new Float32Array(m)
  const zs = new Float32Array(m)
  const cum = new Float32Array(m)
  for (let i = 0; i < m; i++) {
    xs[i] = pts[i][0]
    zs[i] = pts[i][1]
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])
  }
  return { xs, zs, cum, L: cum[m - 1], loop, stS: new Map(stIdx.map(([s, i]) => [s, cum[i]])) }
}
const PS = { x: 0, z: 0, tx: 1, tz: 0 }
function sample(p: Path, s: number) {
  if (p.loop) s = ((s % p.L) + p.L) % p.L
  else s = Math.max(0, Math.min(p.L, s))
  let lo = 0
  let hi = p.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (p.cum[mid] <= s) lo = mid
    else hi = mid
  }
  const seg = p.cum[hi] - p.cum[lo] || 1e-6
  const t = (s - p.cum[lo]) / seg
  const dx = p.xs[hi] - p.xs[lo]
  const dz = p.zs[hi] - p.zs[lo]
  PS.x = p.xs[lo] + dx * t
  PS.z = p.zs[lo] + dz * t
  const l = Math.hypot(dx, dz) || 1
  PS.tx = dx / l
  PS.tz = dz / l
  return PS
}

/* ribbon track: a rounded-rect profile swept along the path; vertex rings are in path order so drawRange "draws" the line */
const RW = 0.32
const RH = 0.11
function ribbonProfile(w: number, h: number, r: number, seg = 4) {
  const out: { px: number; py: number; nx: number; ny: number }[] = []
  const cs = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
  ]
  for (const [cx, cy, a0] of cs)
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2)
      out.push({ px: cx + Math.cos(a) * r, py: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) })
    }
  return out
}
const PROFILE = ribbonProfile(RW, RH, 0.045)
function ribbonGeo(p: Path, y: number, step = 0.05) {
  const prof = PROFILE
  const np = prof.length
  const rings = Math.max(2, Math.ceil(p.L / step) + 1)
  const pos = new Float32Array(rings * np * 3)
  const nor = new Float32Array(rings * np * 3)
  for (let i = 0; i < rings; i++) {
    const s = (p.L * i) / (rings - 1)
    const q = sample(p, Math.min(s, p.L - 1e-4))
    const rx = -q.tz
    const rz = q.tx
    for (let j = 0; j < np; j++) {
      const v = prof[j]
      const o = (i * np + j) * 3
      pos[o] = q.x + rx * v.px
      pos[o + 1] = y + v.py
      pos[o + 2] = q.z + rz * v.px
      nor[o] = rx * v.nx
      nor[o + 1] = v.ny
      nor[o + 2] = rz * v.nx
    }
  }
  const idx: number[] = []
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < np; j++) {
      const a = i * np + j
      const b = i * np + ((j + 1) % np)
      const c = (i + 1) * np + j
      const d = (i + 1) * np + ((j + 1) % np)
      idx.push(a, c, b, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setIndex(idx)
  return { g, perRing: np * 6, rings }
}
/** flat strip on the ground (river) */
function stripGeo(p: Path, w: number, y: number) {
  const rings = Math.ceil(p.L / 0.08) + 1
  const pos = new Float32Array(rings * 2 * 3)
  const idx: number[] = []
  for (let i = 0; i < rings; i++) {
    const q = sample(p, (p.L * i) / (rings - 1))
    const ww = w * (0.85 + 0.15 * Math.sin(i * 0.07))
    pos.set([q.x - q.tz * ww, y, q.z + q.tx * ww, q.x + q.tz * ww, y, q.z - q.tx * ww], i * 6)
    const inside = (k: number) => Math.hypot(pos[k * 6] * 0.5 + pos[k * 6 + 3] * 0.5 - PLATE_C[0], pos[k * 6 + 2] * 0.5 + pos[k * 6 + 5] * 0.5 - PLATE_C[1]) < PLATE_R - 0.5
    if (i > 0 && inside(i) && inside(i - 1)) idx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const PATHS = LINES.map((l) => buildPath(l.way, !!l.loop))

/* ------------------------------------------------------------------ stations */
type Station = { name: string; x: number; z: number; lines: number[]; top: number; inter: boolean; terminal: boolean; prio: number }
const STATIONS: Station[] = Object.keys(ST).map((name) => {
  const lines = LINES.map((l, i) => (l.way.includes(name) ? i : -1)).filter((i) => i >= 0)
  const terminal = lines.some((li) => !LINES[li].loop && (LINES[li].way[0] === name || LINES[li].way[LINES[li].way.length - 1] === name))
  const inter = lines.length > 1
  const [x, z] = P(name)
  return { name, x, z, lines, top: Math.max(...lines.map((l) => LINES[l].h)), inter, terminal, prio: (inter ? 2 : 0) + (terminal ? 1 : 0) + lines.length * 0.1 }
})
const SIDX = new Map(STATIONS.map((s, i) => [s.name, i]))
const INTERS = STATIONS.map((s, i) => (s.inter ? i : -1)).filter((i) => i >= 0)

/* ------------------------------------------------------------------ timetable (deterministic, so countdowns are exact) */
const VMAX = 2.0
const ACC = 1.5
const DWELL = 1.4
const TERM = 2.6
const MAX_TRAINS = 4
function runTime(d: number) {
  const ta = VMAX / ACC
  const da = 0.5 * ACC * ta * ta
  return d >= 2 * da ? 2 * ta + (d - 2 * da) / VMAX : 2 * Math.sqrt(d / ACC)
}
function runDist(d: number, tau: number) {
  const ta = VMAX / ACC
  const da = 0.5 * ACC * ta * ta
  if (d >= 2 * da) {
    const T = 2 * ta + (d - 2 * da) / VMAX
    if (tau < ta) return 0.5 * ACC * tau * tau
    if (tau < T - ta) return da + VMAX * (tau - ta)
    const r = Math.max(0, T - tau)
    return d - 0.5 * ACC * r * r
  }
  const tb = Math.sqrt(d / ACC)
  if (tau < tb) return 0.5 * ACC * tau * tau
  const r = Math.max(0, 2 * tb - tau)
  return d - 0.5 * ACC * r * r
}
type Ev = { t0: number; dur: number; s0: number; s1: number; dwell: boolean; st: number; dir: number }
type Sched = { ev: Ev[]; P: number; stations: number[] }
function buildSched(li: number): Sched {
  const l = LINES[li]
  const p = PATHS[li]
  const names = l.way.filter((w): w is string => typeof w === 'string')
  const S = names.map((n) => p.stS.get(n)!)
  const ids = names.map((n) => SIDX.get(n)!)
  const ev: Ev[] = []
  let t = 0
  const dwell = (k: number, dur: number, dir: number) => {
    ev.push({ t0: t, dur, s0: S[k], s1: S[k], dwell: true, st: ids[k], dir })
    t += dur
  }
  const run = (s0: number, s1: number, dir: number) => {
    const d = Math.abs(s1 - s0)
    const T = runTime(d)
    ev.push({ t0: t, dur: T, s0, s1, dwell: false, st: -1, dir })
    t += T
  }
  const m = S.length
  if (l.loop) {
    for (let k = 0; k < m; k++) {
      dwell(k, DWELL, 1)
      run(S[k], k + 1 < m ? S[k + 1] : p.L, 1)
    }
  } else {
    dwell(0, TERM, 1)
    for (let k = 0; k < m - 1; k++) {
      run(S[k], S[k + 1], 1)
      if (k + 1 < m - 1) dwell(k + 1, DWELL, 1)
    }
    dwell(m - 1, TERM, -1)
    for (let k = m - 1; k > 0; k--) {
      run(S[k], S[k - 1], -1)
      if (k - 1 > 0) dwell(k - 1, DWELL, -1)
    }
  }
  return { ev, P: t, stations: ids }
}
const SCHED = LINES.map((_, i) => buildSched(i))
const TS = { s: 0, dir: 1, dwell: false }
/** where train k of a line is in its cycle; lines are de-synchronised so arrivals don't coincide */
function phase(li: number, k: number, T: number) {
  const P = SCHED[li].P
  const x = T + (k / MAX_TRAINS + li * 0.137) * P
  return ((x % P) + P) % P
}
function trainAt(li: number, k: number, T: number) {
  const sc = SCHED[li]
  const ph = phase(li, k, T)
  for (const e of sc.ev) {
    if (ph < e.t0 + e.dur) {
      const tau = ph - e.t0
      TS.dwell = e.dwell
      TS.dir = e.dir
      TS.s = e.dwell ? e.s0 : e.s0 + Math.sign(e.s1 - e.s0) * runDist(Math.abs(e.s1 - e.s0), tau)
      return TS
    }
  }
  TS.s = sc.ev[0].s0
  return TS
}
type Freq = 'peak' | 'off' | 'night'
const ACTIVE: Record<Freq, number[]> = { peak: [0, 1, 2, 3], off: [0, 2], night: [0] }
/** next arrival (seconds) at a station for every direction of a line */
function countdowns(li: number, st: number, T: number, freq: Freq) {
  const sc = SCHED[li]
  const l = LINES[li]
  const names = l.way.filter((w): w is string => typeof w === 'string')
  const res = new Map<number, { wait: number; here: boolean }>()
  for (const k of ACTIVE[freq]) {
    const ph = phase(li, k, T)
    for (const e of sc.ev) {
      if (!e.dwell || e.st !== st) continue
      const here = ph >= e.t0 && ph < e.t0 + e.dur
      const wait = here ? 0 : (e.t0 - ph + sc.P) % sc.P
      const cur = res.get(e.dir)
      if (!cur || wait < cur.wait) res.set(e.dir, { wait, here })
    }
  }
  const idx = names.indexOf(STATIONS[st].name)
  return [...res.entries()].map(([dir, v]) => {
    let to: string
    if (l.loop) to = `下一站 ${names[(idx + 1) % names.length]}`
    else to = `往 ${dir > 0 ? names[names.length - 1] : names[0]}`
    return { dir, to, ...v }
  })
}

/* ================================================================== palette + shared resources */
const GROUND = { day: new THREE.Color('#ffffff'), night: new THREE.Color('#f3f3fa') }
const DIM = new THREE.Color('#d9dce3')
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  torus: new THREE.TorusGeometry(1, 0.16, 10, 36),
  disc: new THREE.CylinderGeometry(1, 1, 1, 36),
  ring: new THREE.RingGeometry(0.86, 1, 48),
}
G.torus.rotateX(Math.PI / 2)
const lam = (color: string | THREE.Color, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const M = {
  ground: lam('#ffffff'),
  plinth: lam('#e3e5ea'),
  plinth2: lam('#dde0e7'),
  pillar: lam('#e9ebef'),
  white: lam('#ffffff'),
  river: lam('#b9dbf2'),
  park: lam('#cfeacb'),
  lake: lam('#b9dbf2'),
  block: lam('#ffffff'),
  glass: lam('#f6f8fb'),
  window: lam('#36414f'),
  head: lam('#fffbe6', { emissive: new THREE.Color('#fff2b0'), emissiveIntensity: 0 }),
}

/* ================================================================== scene parts */
type World = {
  vis: MotionValue<number>[] // per-line draw progress (0 hidden … 1 drawn)
  dim: number[] // per-line dimming, eased in the driver
  sel: { current: number }
  hover: { current: number }
  freq: { current: Freq }
  clock: { t: number }
  night: MotionValue<number>
  lineMats: THREE.MeshLambertMaterial[]
  carMats: THREE.MeshLambertMaterial[]
  pick: (i: number) => void
  setHover: (i: number) => void
}

function Track({ li, w }: { li: number; w: World }) {
  const l = LINES[li]
  const p = PATHS[li]
  const rib = useMemo(() => ribbonGeo(p, l.h), [p, l.h])
  const pillars = useMemo(() => {
    const out: { x: number; z: number; s: number }[] = []
    const stations = [...p.stS.values()]
    const step = 1.25
    for (let s = 0.3; s < p.L - 0.1; s += step) {
      if (stations.some((q) => Math.abs(q - s) < 0.45)) continue
      const q = sample(p, s)
      out.push({ x: q.x, z: q.z, s })
    }
    return out
  }, [p])
  const pil = useRef<THREE.InstancedMesh>(null)
  const foot = useRef<THREE.InstancedMesh>(null)
  const caps = useRef<THREE.Group>(null)
  const lastV = useRef(-1)
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const ends = useMemo(() => {
    if (p.loop) return []
    const a = sample(p, 0.001)
    const ea = { x: a.x, z: a.z, ang: Math.atan2(-a.tz, a.tx) }
    const b = sample(p, p.L - 0.001)
    return [ea, { x: b.x, z: b.z, ang: Math.atan2(-b.tz, b.tx) }]
  }, [p])

  useFrame(() => {
    const v = w.vis[li].get()
    if (Math.abs(v - lastV.current) < 1e-4) return
    lastV.current = v
    const drawn = Math.round(v * (rib.rings - 1))
    rib.g.setDrawRange(0, drawn * rib.perRing)
    const reach = v * p.L
    const im = pil.current
    const fm = foot.current
    if (im && fm) {
      pillars.forEach((q, k) => {
        const e = Math.max(0.0001, Math.min(1, (reach - q.s + 0.6) / 0.6))
        const hgt = (l.h - 0.04) * e
        m4.makeScale(0.075, Math.max(0.0001, hgt), 0.075).setPosition(q.x, hgt / 2, q.z)
        im.setMatrixAt(k, m4)
        m4.makeScale(0.13 * e, 0.03, 0.13 * e).setPosition(q.x, 0.015, q.z)
        fm.setMatrixAt(k, m4)
      })
      im.instanceMatrix.needsUpdate = true
      fm.instanceMatrix.needsUpdate = true
    }
    if (caps.current) caps.current.visible = v > 0.995
  })

  return (
    <group>
      <mesh geometry={rib.g} material={w.lineMats[li]} castShadow receiveShadow />
      <instancedMesh ref={pil} args={[G.cyl, M.pillar, pillars.length]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={foot} args={[G.cyl, M.plinth, pillars.length]} frustumCulled={false} />
      <group ref={caps}>
        {ends.map((e, k) => (
          <RoundedBox key={k} args={[0.12, RH + 0.05, RW + 0.06]} radius={0.04} smoothness={2} position={[e.x, l.h, e.z]} rotation={[0, e.ang, 0]} material={w.lineMats[li]} />
        ))}
      </group>
    </group>
  )
}

/* ---------------------------------------------------------------- trains */
const CAR_L = 0.46
const CAR_GAP = 0.04
function Car({ mat }: { mat: THREE.Material }) {
  return (
    <group>
      <RoundedBox args={[CAR_L, 0.16, 0.24]} radius={0.05} smoothness={3} position={[0, 0.08, 0]} material={mat} castShadow />
      <RoundedBox args={[CAR_L - 0.08, 0.03, 0.17]} radius={0.012} smoothness={2} position={[0, 0.165, 0]} material={M.glass} />
      <mesh geometry={G.box} material={M.window} position={[0, 0.11, 0]} scale={[CAR_L - 0.1, 0.045, 0.245]} />
      <mesh geometry={G.box} material={M.head} position={[CAR_L / 2 - 0.004, 0.06, 0]} scale={[0.01, 0.03, 0.14]} />
      <mesh geometry={G.box} material={M.head} position={[-CAR_L / 2 + 0.004, 0.06, 0]} scale={[0.01, 0.03, 0.14]} />
    </group>
  )
}
function Train({ li, k, w }: { li: number; k: number; w: World }) {
  const l = LINES[li]
  const p = PATHS[li]
  const ref = useRef<THREE.Group>(null)
  const cars = useRef<(THREE.Group | null)[]>([])
  const vis = useRef(0)
  const y = l.h + RH / 2
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current
    if (!g) return
    const on = ACTIVE[w.freq.current].includes(k) && w.vis[li].get() > 0.999
    vis.current += ((on ? 1 : 0) - vis.current) * Math.min(1, dt * 7)
    g.visible = vis.current > 0.01
    if (!g.visible) return
    const st = trainAt(li, k, w.clock.t)
    const half = (CAR_L + CAR_GAP) / 2
    for (let c = 0; c < 2; c++) {
      const cg = cars.current[c]
      if (!cg) continue
      const q = sample(p, st.s + (c ? -half : half))
      cg.position.set(q.x, y, q.z)
      cg.rotation.y = Math.atan2(-q.tz, q.tx)
      cg.scale.setScalar(Math.max(0.001, vis.current))
    }
  })
  return (
    <group ref={ref} visible={false}>
      {[0, 1].map((c) => (
        <group key={c} ref={(el) => void (cars.current[c] = el)}>
          <Car mat={w.carMats[li]} />
        </group>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- stations */
function StationView({ i, w }: { i: number; w: World }) {
  const s = STATIONS[i]
  const ref = useRef<THREE.Group>(null)
  const rings = useRef<(THREE.Group | null)[]>([])
  const pulse = useRef<THREE.Mesh>(null)
  const pulseMat = useMemo(() => new THREE.MeshBasicMaterial({ color: LINES[s.lines[0]].color, transparent: true, opacity: 0, depthWrite: false }), [s])
  const hov = useSpring(0, { stiffness: 420, damping: 26 })
  const pop = useRef(0)
  const R = s.inter ? 0.3 : 0.22
  const top = s.top
  const sOn = useMemo(() => s.lines.map((li) => PATHS[li].stS.get(s.name)! / PATHS[li].L), [s])

  useFrame((st, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current
    if (!g) return
    hov.set(w.hover.current === i || w.sel.current === i ? 1 : 0)
    // a station appears once one of its lines has been drawn past it
    let any = 0
    s.lines.forEach((li, k) => {
      const v = w.vis[li].get()
      const reached = v >= sOn[k] - 0.002 && v > 0.01 ? 1 : 0
      any = Math.max(any, reached)
      const r = rings.current[k]
      if (r) {
        const cur = r.scale.x
        const tgt = reached ? 1 : 0.0001
        r.scale.setScalar(cur + (tgt - cur) * Math.min(1, dt * 12))
      }
    })
    pop.current += (any - pop.current) * Math.min(1, dt * 9)
    g.visible = pop.current > 0.01
    const h = hov.get()
    g.scale.set(1 + h * 0.15, pop.current, 1 + h * 0.15)
    if (pulse.current) {
      const on = w.sel.current === i
      pulse.current.visible = on
      if (on) {
        const q = (st.clock.elapsedTime * 0.8) % 1
        pulse.current.scale.setScalar(0.4 + q * 1.4)
        pulseMat.opacity = (1 - q) * 0.6
      }
    }
  })
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    w.setHover(i)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    w.setHover(-1)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    w.pick(i)
  }
  return (
    <group position={[s.x, 0, s.z]}>
      <group ref={ref}>
        {/* support column (interchanges get a chunkier one with posts) */}
        {s.inter ? (
          <>
            {[0, 1, 2].map((k) => {
              const a = (k / 3) * Math.PI * 2 + Math.PI / 6
              return <mesh key={k} geometry={G.cyl} material={M.white} position={[Math.cos(a) * (R + 0.06), (top + 0.18) / 2, Math.sin(a) * (R + 0.06)]} scale={[0.05, top + 0.18, 0.05]} castShadow />
            })}
            <mesh geometry={G.disc} material={M.white} position={[0, top + 0.2, 0]} scale={[R + 0.12, 0.05, R + 0.12]} castShadow />
            <mesh geometry={G.disc} material={M.plinth} position={[0, 0.02, 0]} scale={[R + 0.16, 0.04, R + 0.16]} />
          </>
        ) : (
          <mesh geometry={G.cyl} material={M.white} position={[0, (top - 0.06) / 2, 0]} scale={[0.1, top - 0.06, 0.1]} castShadow />
        )}
        {s.lines.map((li, k) => (
          <group key={li} ref={(el) => void (rings.current[k] = el)} position={[0, LINES[li].h, 0]}>
            <mesh geometry={G.torus} material={M.white} scale={[R, 1.4, R]} castShadow />
            <mesh geometry={G.torus} material={w.lineMats[li]} position={[0, 0, 0]} scale={[R + 0.055, 0.7, R + 0.055]} />
          </group>
        ))}
      </group>
      <mesh ref={pulse} geometry={G.ring} material={pulseMat} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false} />
      <mesh geometry={G.box} position={[0, (top + 0.3) / 2, 0]} scale={[0.85, top + 0.5, 0.85]} visible={false} onPointerOver={over} onPointerOut={out} onClick={click} />
    </group>
  )
}

/* ---------------------------------------------------------------- city context */
const RIVER = buildPath([[-12.5, 4.6], [-7, 4.8], [-2.6, 6.1], [2.5, 5.6], [6.2, 2.8], [12.5, 2.0]], false, 4 * K)
function nearTrack(x: number, z: number, d: number) {
  for (const p of PATHS)
    for (let i = 0; i < p.xs.length - 1; i++) {
      const ax = p.xs[i]
      const az = p.zs[i]
      const bx = p.xs[i + 1]
      const bz = p.zs[i + 1]
      const vx = bx - ax
      const vz = bz - az
      const l2 = vx * vx + vz * vz || 1e-6
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2))
      if (Math.hypot(ax + vx * t - x, az + vz * t - z) < d) return true
    }
  return false
}
function nearRiver(x: number, z: number, d: number) {
  for (let i = 0; i < RIVER.xs.length; i++) if (Math.hypot(RIVER.xs[i] - x, RIVER.zs[i] - z) < d) return true
  return false
}
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const PARKS: { x: number; z: number; w: number; d: number; lake?: boolean }[] = [
  { x: -8.0 * K, z: -1.2 * K, w: 2.4, d: 1.7 },
  { x: -3.0 * K, z: -6.2 * K, w: 2.2, d: 1.5, lake: true },
  { x: 6.6 * K, z: 4.6 * K, w: 1.8, d: 1.6 },
  { x: -1.0 * K, z: -1.2 * K, w: 1.3, d: 1.1 },
]
const PLATE_R = 9.3
const PLATE_C: [number, number] = [-0.2, -1.3]
function City({ w }: { w: World }) {
  const blocks = useMemo(() => {
    const out: { x: number; z: number; sx: number; sz: number; h: number; c: number }[] = []
    const cell = 0.78
    for (let gx = -15; gx <= 15; gx++)
      for (let gz = -15; gz <= 15; gz++) {
        const x = gx * cell + (rnd(gx * 31 + gz) - 0.5) * 0.12
        const z = gz * cell + (rnd(gz * 17 + gx) - 0.5) * 0.12
        if (Math.hypot(x - PLATE_C[0], z - PLATE_C[1]) > PLATE_R - 0.7) continue
        if (rnd(gx * 7.3 + gz * 3.1) < 0.38) continue
        if (nearTrack(x, z, 0.62) || nearRiver(x, z, 1.05)) continue
        if (PARKS.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.3 && Math.abs(z - p.z) < p.d / 2 + 0.3)) continue
        const r = rnd(gx * 13.7 + gz * 5.9)
        out.push({ x, z, sx: 0.46 + rnd(gx + gz * 3) * 0.18, sz: 0.46 + rnd(gz + gx * 5) * 0.18, h: 0.06 + r * r * 0.42, c: Math.floor(rnd(gx * 2 + gz) * 4) })
      }
    return out
  }, [])
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const im = ref.current
    if (!im) return
    const m4 = new THREE.Matrix4()
    const cols = ['#ffffff', '#f2f3f6', '#eceef2', '#f6f3ee'].map((c) => new THREE.Color(c))
    blocks.forEach((b, k) => {
      m4.makeScale(b.sx, b.h, b.sz).setPosition(b.x, b.h / 2, b.z)
      im.setMatrixAt(k, m4)
      im.setColorAt(k, cols[b.c])
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [blocks])
  const plate = useMemo(() => {
    const g = new THREE.CylinderGeometry(PLATE_R, PLATE_R - 0.15, 0.4, 96)
    g.translate(0, -0.2, 0)
    return g
  }, [])
  const river = useMemo(() => stripGeo(RIVER, 0.5, 0.012), [])
  useFrame(() => {
    const n = w.night.get()
    M.ground.color.lerpColors(GROUND.day, GROUND.night, n)
  })
  return (
    <group>
      <mesh geometry={plate} material={[M.plinth, M.ground, M.plinth2]} position={[PLATE_C[0], 0, PLATE_C[1]]} receiveShadow />
      <mesh geometry={useMemo(() => new THREE.CylinderGeometry(PLATE_R - 0.15, PLATE_R - 0.6, 0.5, 96), [])} material={M.plinth2} position={[PLATE_C[0], -0.65, PLATE_C[1]]} />
      <mesh geometry={river} material={M.river} receiveShadow />
      {PARKS.map((p, k) => (
        <RoundedBox key={k} args={[p.w, 0.03, p.d]} radius={0.012} smoothness={2} position={[p.x, 0.015, p.z]} material={p.lake ? M.lake : M.park} receiveShadow />
      ))}
      <instancedMesh ref={ref} args={[G.box, undefined, blocks.length]} castShadow receiveShadow>
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  )
}

/* ---------------------------------------------------------------- driver: clock, dimming, night */
function Driver({ w }: { w: World }) {
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    w.clock.t += dt
    const sel = w.sel.current
    const n = w.night.get()
    for (let li = 0; li < NL; li++) {
      const tgt = sel >= 0 && !STATIONS[sel].lines.includes(li) ? 1 : 0
      w.dim[li] += (tgt - w.dim[li]) * Math.min(1, dt * 6)
      const base = LINE_COL[li]
      w.lineMats[li].color.lerpColors(base, DIM, w.dim[li] * 0.85)
      w.carMats[li].color.lerpColors(base, DIM, w.dim[li] * 0.85)
      w.lineMats[li].emissive.copy(w.lineMats[li].color)
    }
    M.head.emissiveIntensity = n * 1.4
  })
  return null
}
const LINE_COL = LINES.map((l) => new THREE.Color(l.color))

/* ---------------------------------------------------------------- camera: an iso rig with spring zoom / focus */
const FIT_D = 26
const FIT_M = 17
type Cam = { k: MotionValue<number>; tx: MotionValue<number>; tz: MotionValue<number>; f: MotionValue<number> }
const HOME: [number, number] = [-0.48, -1.75]
function MetroRig({ cam }: { cam: Cam }) {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    const { width, height } = size
    const mobile = width < 760
    const fit = mobile ? FIT_M : FIT_D
    const k = cam.k.get()
    camera.zoom = (Math.min(width, height * 1.25) / fit) * k
    const tx = cam.tx.get()
    const tz = cam.tz.get()
    const ty = 0.6
    const d = 60
    camera.position.set(tx + d, ty + d, tz + d)
    camera.lookAt(tx, ty, tz)
    const f = cam.f.get()
    const ox = POSTER ? 0 : mobile ? 0 : THREE.MathUtils.lerp(0.19, 0.07, f)
    const oy = POSTER ? 0 : mobile ? THREE.MathUtils.lerp(0.09, 0.1, f) : THREE.MathUtils.lerp(-0.01, 0, f)
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ---------------------------------------------------------------- DOM labels from 3D, with overlap culling */
function Labels({ w, els, mobile }: { w: World; els: React.RefObject<(HTMLDivElement | null)[]>; mobile: boolean }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const order = useMemo(() => STATIONS.map((_, i) => i).sort((a, b) => STATIONS[b].prio - STATIONS[a].prio), [])
  const rects = useMemo(() => [] as number[][], [])
  const sizes = useRef<[number, number][]>([])
  const size = useThree((s) => s.size)
  useEffect(() => {
    sizes.current = STATIONS.map((_, i) => {
      const el = els.current[i]
      return el ? [el.offsetWidth, el.offsetHeight] : [60, 20]
    })
  }, [els, size.width])
  useFrame(({ camera }) => {
    rects.length = 0
    const sel = w.sel.current
    const hov = w.hover.current
    const zoomed = (camera as OrthographicCamera).zoom > (Math.min(size.width, size.height * 1.25) / (mobile ? FIT_M : FIT_D)) * 1.3
    const list = sel >= 0 ? [sel, ...order.filter((i) => i !== sel)] : hov >= 0 ? [hov, ...order.filter((i) => i !== hov)] : order
    for (const i of list) {
      const el = els.current[i]
      if (!el) continue
      const s = STATIONS[i]
      const shown = s.lines.some((li) => w.vis[li].get() > Math.min(0.999, PATHS[li].stS.get(s.name)! / PATHS[li].L))
      v.set(s.x, s.top + 0.12, s.z).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width + 12
      const y = (-v.y * 0.5 + 0.5) * size.height
      const [lw, lh] = sizes.current[i] ?? [60, 20]
      let ok = shown && (!mobile || zoomed || s.prio >= 1 || i === sel)
      const r = [x - 3, y - lh / 2 - 2, x + lw + 3, y + lh / 2 + 2]
      if (ok && x > -lw && x < size.width + 20 && y > 60 && y < size.height + 20) {
        for (const q of rects)
          if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) {
            ok = false
            break
          }
      }
      if (ok) rects.push(r)
      const rel = sel < 0 || i === sel || STATIONS[i].lines.some((li) => STATIONS[sel].lines.includes(li))
      el.style.opacity = ok ? (rel ? '1' : '0.28') : '0'
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - lh / 2).toFixed(1)}px, 0)`
      el.dataset.active = String(i === sel || i === hov)
    }
  })
  return null
}

function Lights({ w }: { w: World }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#ffffff', 1.5)
    l.position.set(4, 12, 7)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera as THREE.OrthographicCamera
    c.left = c.bottom = -13
    c.right = c.top = 13
    c.near = 1
    c.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])
  useFrame(() => {
    const n = w.night.get()
    if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(1.15, 1.05, n)
    sun.intensity = THREE.MathUtils.lerp(1.45, 1.3, n)
    sun.color.setHSL(0.66, n * 0.5, 1 - n * 0.06)
  })
  return (
    <>
      <ambientLight ref={amb} intensity={1.15} />
      <hemisphereLight args={['#ffffff', '#b9c0d0', 0.45]} />
      <primitive object={sun} />
    </>
  )
}

/* ================================================================== page */
const FREQ_COPY: Record<Freq, string> = {
  peak: '早高峰 · 每条线 4 列车，间隔最短',
  off: '平峰 · 每条线 2 列车',
  night: '夜间 · 每条线只剩 1 列车，候车更久',
}
const fmt = (s: number) => {
  const t = Math.ceil(s)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export default function MetroLines() {
  const vis = useMemo(() => LINES.map(() => motionValue(POSTER ? 1 : 0)), [])
  const night = useMemo(() => motionValue(0), [])
  const cam = useMemo<Cam>(
    () => ({ k: motionValue(1), tx: motionValue(HOME[0]), tz: motionValue(HOME[1]), f: motionValue(0) }),
    [],
  )
  const [hidden, setHidden] = useState<boolean[]>(() => LINES.map(() => false))
  const [freq, setFreq] = useState<Freq>('peak')
  const [sel, setSel] = useState(-1)
  const [, setTick] = useState(0)
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760)
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const selRef = useRef(-1)
  const hoverRef = useRef(-1)
  const freqRef = useRef<Freq>('peak')
  const lastTouch = useRef(0)
  const autoSel = useRef(0) // timestamp of an auto-tour selection (0 = user selection / none)
  const tourIdx = useRef(0)

  const w = useMemo<World>(
    () => ({
      vis,
      dim: LINES.map(() => 0),
      sel: selRef,
      hover: hoverRef,
      freq: freqRef,
      clock: { t: 7 },
      night,
      lineMats: LINES.map((l) => lam(l.color, { emissive: new THREE.Color(l.color), emissiveIntensity: 0.12 })),
      carMats: LINES.map((l) => lam(l.color)),
      pick: () => {},
      setHover: () => {},
    }),
    [vis, night],
  )

  const focus = (i: number) => {
    const springy = { type: 'spring' as const, stiffness: 70, damping: 17 }
    if (i < 0) {
      animate(cam.k, 1, springy)
      animate(cam.tx, HOME[0], springy)
      animate(cam.tz, HOME[1], springy)
      animate(cam.f, 0, springy)
    } else {
      const s = STATIONS[i]
      animate(cam.k, mobile ? 1.6 : 1.6, springy)
      animate(cam.tx, s.x, springy)
      animate(cam.tz, s.z, springy)
      animate(cam.f, 1, springy)
    }
  }
  const select = (i: number, auto = false) => {
    if (!auto) {
      lastTouch.current = performance.now()
      autoSel.current = 0
    } else autoSel.current = performance.now()
    selRef.current = i
    setSel(i)
    focus(i)
  }
  w.pick = (i) => select(selRef.current === i ? -1 : i)
  w.setHover = (i) => {
    hoverRef.current = i
  }

  useEffect(() => {
    const onR = () => setMobile(window.innerWidth < 760)
    window.addEventListener('resize', onR)
    return () => window.removeEventListener('resize', onR)
  }, [])

  // intro: lines draw themselves one after another
  useEffect(() => {
    if (POSTER) return
    const ctl = vis.map((v, i) => animate(v, 1, { duration: 1.7, delay: 0.35 + i * 0.28, ease: [0.45, 0, 0.2, 1] }))
    return () => ctl.forEach((c) => c.stop())
  }, [vis])

  // line filter
  const firstHidden = useRef(true)
  useEffect(() => {
    if (firstHidden.current) {
      firstHidden.current = false
      return
    }
    hidden.forEach((h, i) => {
      const tgt = h ? 0 : 1
      if (Math.abs(vis[i].get() - tgt) > 1e-3) animate(vis[i], tgt, { duration: h ? 0.7 : 1.1, ease: [0.45, 0, 0.2, 1] })
    })
    if (selRef.current >= 0 && STATIONS[selRef.current].lines.every((li) => hidden[li])) select(-1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden])

  useEffect(() => {
    freqRef.current = freq
    animate(night, freq === 'night' ? 1 : 0, { duration: 1.2 })
  }, [freq, night])

  // live countdown refresh + idle tour of interchanges
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250)
    const tour = setInterval(() => {
      if (POSTER) return
      const now = performance.now()
      if (now - lastTouch.current < 12000) return
      if (selRef.current >= 0 && autoSel.current && now - autoSel.current > 6500) {
        select(-1, true)
        autoSel.current = 0
        lastTouch.current = now - 7000 // linger in the overview ~5 s before the next stop
        return
      }
      if (selRef.current < 0) {
        const visible = INTERS.filter((i) => STATIONS[i].lines.some((li) => !hiddenRef.current[li]))
        if (!visible.length) return
        select(visible[tourIdx.current++ % visible.length], true)
      }
    }, 1000)
    return () => {
      clearInterval(id)
      clearInterval(tour)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden

  const touch = () => void (lastTouch.current = performance.now())
  const st = sel >= 0 ? STATIONS[sel] : null

  return (
    <div className={`stage mt-root${freq === 'night' ? ' mt-night' : ''}`}>
      <Canvas
        orthographic
        shadows
        flat
        dpr={[1, 2]}
        camera={{ near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          if (selRef.current >= 0) select(-1)
        }}
      >
        <MetroRig cam={cam} />
        <Lights w={w} />
        <City w={w} />
        {LINES.map((_, li) => (
          <Track key={li} li={li} w={w} />
        ))}
        {LINES.map((_, li) => Array.from({ length: MAX_TRAINS }, (_, k) => <Train key={`${li}-${k}`} li={li} k={k} w={w} />))}
        {STATIONS.map((_, i) => (
          <StationView key={i} i={i} w={w} />
        ))}
        <Driver w={w} />
        <Labels w={w} els={labels} mobile={mobile} />
      </Canvas>

      <div className="mt-labels" aria-hidden>
        {STATIONS.map((s, i) => (
          <div key={s.name} ref={(el) => void (labels.current[i] = el)} className="mt-label" data-inter={s.inter}>
            <b>{s.name}</b>
            {s.inter && (
              <span>
                {s.lines.map((li) => (
                  <i key={li} style={{ background: LINES[li].color }} />
                ))}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy mt-copy"
          data-hide={!!st && mobile}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#e2483d' }} /> Isometric · Transit map
          </p>
          <h1>
            五条线路
            <br />
            立体交汇
          </h1>
          <p>环线贴地，其余四条线架在不同高度的高架上，交叉处一眼看出谁在上面。列车进站减速、停靠、再加速驶出。点击任意车站，看换乘和下一班车。</p>
          <div className="mt-legend">
            {LINES.map((l, i) => (
              <span key={l.name} data-off={hidden[i]}>
                <i style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
          </div>
        </motion.div>

        <AnimatePresence>
          {st && (
            <motion.aside
              key="card"
              className="mt-card"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onPointerDown={touch}
            >
              <header>
                <div>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.h2 key={st.name} initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
                      {st.name}
                    </motion.h2>
                  </AnimatePresence>
                  <p>{st.inter ? `${st.lines.length} 线换乘站 · ${st.lines.length} 层站台` : st.terminal ? '终点站' : '中间站'}</p>
                </div>
                <button className="mt-x" onClick={() => select(-1)} aria-label="关闭">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </header>
              <div className="mt-rows">
                {st.lines
                  .slice()
                  .sort((a, b) => LINES[b].h - LINES[a].h)
                  .map((li) => {
                    const l = LINES[li]
                    const rows = hidden[li] ? [] : countdowns(li, sel, w.clock.t, freq)
                    return (
                      <div key={li} className="mt-line" data-off={hidden[li]}>
                        <div className="mt-line-h">
                          <i style={{ background: l.color }}>{l.short}</i>
                          <b>{l.name}</b>
                          <em>{l.loop ? '地面层' : `高架 ${l.h.toFixed(1)} 层`}</em>
                        </div>
                        {hidden[li] ? (
                          <div className="mt-row mt-row-off">已在地图上隐藏</div>
                        ) : (
                          rows.map((r) => (
                            <div key={r.dir} className="mt-row">
                              <span>{r.to}</span>
                              <b data-soon={r.here || r.wait < 3}>{r.here ? '停靠中' : r.wait < 3 ? '即将进站' : fmt(r.wait)}</b>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  })}
              </div>
              {st.inter && (
                <footer>
                  <span>可换乘</span>
                  {st.lines.map((li) => (
                    <i key={li} style={{ background: LINES[li].color }}>
                      {LINES[li].name}
                    </i>
                  ))}
                </footer>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="dock mt-dock" onPointerDown={touch}>
          {LINES.map((l, i) => (
            <button
              key={l.name}
              className="seg mt-tog"
              aria-pressed={!hidden[i]}
              onClick={() => setHidden((h) => (h.filter((x) => !x).length === 1 && !h[i] ? h : h.map((x, j) => (j === i ? !x : x))))}
              title={`${hidden[i] ? '显示' : '隐藏'}${l.name}`}
            >
              <i style={{ background: l.color }}>{l.short}</i>
              <span>{l.loop ? '环线' : '号线'}</span>
            </button>
          ))}
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'peak', label: '早高峰' },
              { value: 'off', label: '平峰' },
              { value: 'night', label: '夜间' },
            ]}
            value={freq}
            onChange={(v) => setFreq(v)}
          />
          <span className="dock-sep" />
          <button className="seg" onClick={() => select(-1)}>
            <span>全览</span>
          </button>
        </div>
        <motion.p key={freq} className="hint" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          {FREQ_COPY[freq]}
          <br />
          点击车站 · 镜头会飞过去
        </motion.p>
      </div>

      <style>{`
        .mt-root { --soft-bg: #f3f4f6; background: radial-gradient(110% 80% at 62% 45%, #fbfbfc 0%, #f1f2f5 55%, #e5e7ec 100%); transition: background .8s; }
        .mt-root::after { content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 1s;
          background: radial-gradient(110% 80% at 62% 45%, #e9ebf3 0%, #dcdfea 55%, #ccd0df 100%); }
        .mt-night::after { opacity: 1; }
        .mt-root > canvas, .mt-root > div:first-child { position: relative; z-index: 1; }
        .mt-night { --soft-bg: #dfe1eb; }
        .mt-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
        .mt-label { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 5px; white-space: nowrap;
          will-change: transform, opacity; transition: opacity .25s; font: 500 12px/1 var(--sans); color: #1f2329;
          text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 6px #fff, 0 0 10px rgba(255,255,255,.9); }
        .mt-label[data-inter='true'] b { font-weight: 700; font-size: 12.5px; }
        .mt-label span { display: inline-flex; gap: 2px; }
        .mt-label span i { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 0 1.5px #fff; }
        .mt-label[data-active='true'] b { padding: 4px 7px; margin: -4px -7px; border-radius: 7px; background: #1f2329; color: #fff; text-shadow: none; }
        .mt-root .overlay { z-index: 2; }
        .mt-copy { transition: opacity .3s; }
        .mt-copy[data-hide='true'] { opacity: 0 !important; pointer-events: none; }
        .mt-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-top: 20px; font: 500 12.5px/1 var(--sans); color: var(--fg-2); }
        .mt-legend span { display: inline-flex; align-items: center; gap: 7px; transition: opacity .3s; }
        .mt-legend span[data-off='true'] { opacity: .35; }
        .mt-legend i { width: 16px; height: 6px; border-radius: 3px; }
        .mt-card { position: absolute; right: 24px; top: 84px; width: 304px; padding: 18px 16px 14px; border-radius: 22px;
          background: rgba(255,255,255,.86); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 1px rgba(20,24,32,.07), 0 28px 56px -30px rgba(20,30,50,.45); color: #1d1f24; }
        .mt-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 0 4px 12px; }
        .mt-card h2 { margin: 0; font: 650 26px/1.1 var(--display); letter-spacing: -.02em; }
        .mt-card header p { margin: 6px 0 0; font-size: 12.5px; color: var(--ink-3); }
        .mt-x { width: 30px; height: 30px; flex: none; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
          background: rgba(20,24,32,.05); color: var(--ink-2); transition: background .2s, transform .15s var(--ease-out); }
        .mt-x:hover { background: rgba(20,24,32,.1); }
        .mt-x:active { transform: scale(.9); }
        .mt-rows { display: flex; flex-direction: column; gap: 8px; }
        .mt-line { padding: 10px 12px; border-radius: 15px; background: rgba(20,24,32,.035); }
        .mt-line[data-off='true'] { opacity: .5; }
        .mt-line-h { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .mt-line-h i { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; font: 700 12px/1 var(--sans); font-style: normal; color: #fff; }
        .mt-line-h b { font: 600 14px/1 var(--sans); }
        .mt-line-h em { margin-left: auto; font: 11px/1 var(--mono); color: var(--ink-3); }
        .mt-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 5px 0 1px 30px; font-size: 13px; color: var(--ink-2); }
        .mt-row b { font: 600 15px/1 var(--mono); color: #1d1f24; font-variant-numeric: tabular-nums; }
        .mt-row b[data-soon='true'] { font: 600 12.5px/1 var(--sans); color: #e2483d; }
        .mt-row-off { font-size: 12px; color: var(--ink-3); }
        .mt-card footer { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 12px 4px 0; font-size: 12px; color: var(--ink-3); }
        .mt-card footer span { margin-right: 2px; }
        .mt-card footer i { font: 600 11.5px/1 var(--sans); font-style: normal; color: #fff; padding: 5px 8px; border-radius: 999px; }
        .mt-tog { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px 0 7px; transition: color .2s, opacity .2s; }
        .mt-tog i { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font: 700 11px/1 var(--sans);
          font-style: normal; color: #fff; transition: filter .25s, opacity .25s, transform .2s var(--ease-out); }
        .mt-tog[aria-pressed='false'] { color: color-mix(in srgb, var(--fg) 40%, transparent); }
        .mt-tog[aria-pressed='false'] i { filter: grayscale(1); opacity: .35; }
        .mt-tog:active i { transform: scale(.9); }
        @media (max-width: 760px) {
          .mt-copy p:not(.kicker), .mt-legend { display: none; }
          .mt-copy h1 { font-size: 32px; }
          .mt-card { left: 12px; right: 12px; top: auto; bottom: 74px; width: auto; padding: 14px 12px 12px; }
          .mt-card h2 { font-size: 22px; }
          .mt-rows { flex-direction: row; overflow-x: auto; scrollbar-width: none; }
          .mt-line { flex: 1 0 200px; }
          .mt-card footer { display: none; }
          .mt-tog { padding: 0 3px; }
          .mt-dock .dock-sep { margin: 0 1px; }
          .mt-tog span { display: none; }
          .mt-dock { bottom: 16px; }
          .mt-dock .seg { padding: 0 8px; }
        }
      `}</style>
    </div>
  )
}
