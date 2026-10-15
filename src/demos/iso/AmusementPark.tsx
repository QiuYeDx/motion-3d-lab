import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { createGlowMaterial, quadGeo, useScreenWarmup } from './isoWarmup'

/* ================================================================== helpers */
type V2 = [number, number]
type V3 = [number, number, number]
const TAU = Math.PI * 2
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number) => v * v * (3 - 2 * v)
const lerp = THREE.MathUtils.lerp

/* ================================================================== palette — candy pastels */
const C = {
  grass: '#c2e8b4',
  grass2: '#b5e0ad',
  hedge: '#8fd4a8',
  path: '#fff5e8',
  queue: '#ffe0e8',
  cake1: '#ffc6d8',
  cake2: '#f6b2d4',
  cake3: '#d9aef2',
  cake4: '#b89cf0',
  pink: '#ff86ab',
  hot: '#ff5d8f',
  mint: '#74d8bd',
  lemon: '#ffd66b',
  sky: '#86c9f5',
  lilac: '#b9a0f4',
  peach: '#ffb58c',
  cream: '#fff8ee',
  white: '#ffffff',
  trunk: '#c0907a',
  steel: '#9a90b6',
  dark: '#5b5170',
}
const CANDY = [C.hot, C.mint, C.lemon, C.sky, C.lilac, C.peach]
const SHIRTS = ['#ff7aa2', '#6fcfb4', '#ffcf5c', '#7cbff0', '#b39af2', '#ffa57a', '#ffffff', '#f06c6c', '#5c8fe0', '#8fd46a']
const SKIN = ['#f6d3bd', '#eec1a2', '#d9a283', '#f9dfcf']

/* ================================================================== shared GPU resources */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  ball: new THREE.SphereGeometry(1, 16, 12),
  cone: new THREE.ConeGeometry(1, 1, 18),
}
const lamCache = new Map<string, THREE.MeshLambertMaterial>()
function lam(color: string) {
  let m = lamCache.get(color)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color })
    lamCache.set(color, m)
  }
  return m
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const texCache = new Map<string, THREE.Texture>()
function stripeTex(a: string, b: string, n: number) {
  const key = `${a}${b}${n}`
  let t = texCache.get(key)
  if (!t) {
    t = canvasTex(256, 16, (g) => {
      for (let i = 0; i < n * 2; i++) {
        g.fillStyle = i % 2 ? b : a
        g.fillRect((i * 256) / (n * 2), 0, 256 / (n * 2) + 1, 16)
      }
    })
    texCache.set(key, t)
  }
  return t
}
const stripeMatCache = new Map<string, THREE.MeshLambertMaterial>()
function stripeMat(a: string, b: string, n: number) {
  const key = `${a}${b}${n}`
  let m = stripeMatCache.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ map: stripeTex(a, b, n) })
    stripeMatCache.set(key, m)
  }
  return m
}

/* night-driven materials (updated by <Lighting/>) */
const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const glowMat = createGlowMaterial(1)
const signMats: THREE.MeshLambertMaterial[] = []
function signMat(map: THREE.Texture) {
  const m = new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 })
  signMats.push(m)
  return m
}

/* ================================================================== layout */
type RideId = 'coaster' | 'ferris' | 'carousel' | 'swing'
type SpokeId = 'S' | 'E' | 'NW' | 'W' | 'SE' | 'P'
const FERRIS_C: V2 = [-3.5, -3.5]
const CAROUSEL_C: V2 = [-3.5, 2.55]
const SWING_C: V2 = [3.75, 3.6]
const unit = (x: number, z: number): V2 => {
  const l = Math.hypot(x, z)
  return [x / l, z / l]
}
const SPOKE_DIR: Record<Exclude<SpokeId, 'P'>, V2> = {
  S: [0, 1],
  E: unit(1, -0.06),
  NW: unit(-1, -1),
  W: unit(CAROUSEL_C[0], CAROUSEL_C[1]),
  SE: unit(SWING_C[0], SWING_C[1]),
}
const SPOKE_LEN: Record<Exclude<SpokeId, 'P'>, number> = { S: 6.3, E: 4.7, NW: 4.15, W: 2.7, SE: 2.9 }
const SPOKE_W: Record<Exclude<SpokeId, 'P'>, number> = { S: 1.25, E: 1.15, NW: 1.0, W: 0.95, SE: 0.95 }
const HUB = (s: SpokeId): V2 => (s === 'P' ? [0, 0] : [SPOKE_DIR[s][0] * 1.4, SPOKE_DIR[s][1] * 1.4])
const PLAZA_R = 1.6

function arcPts(c: V2, r: number, a0: number, a1: number, n: number): V2[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = lerp(a0, a1, i / n)
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as V2
  })
}
const fAx = unit(1, 1) // ferris axis, toward the plaza
const fLat: V2 = [fAx[1], -fAx[0]]
const carA = Math.atan2(-SPOKE_DIR.W[1], -SPOKE_DIR.W[0]) // angle on the carousel facing the plaza
const swA = Math.atan2(-SPOKE_DIR.SE[1], -SPOKE_DIR.SE[0])

type RideDef = {
  name: string
  spoke: Exclude<SpokeId, 'P'>
  queue: V2[] // polyline, head → tail
  exit: V2
  cap: number
  focus: V3
  zoom: number
  label: V3
}
const RIDES: Record<RideId, RideDef> = {
  coaster: {
    name: '彩虹过山车',
    spoke: 'E',
    queue: [
      [3.8, -0.58],
      [1.8, -0.58],
      [1.8, -0.3],
      [3.6, -0.3],
    ],
    exit: [4.35, -0.45],
    cap: 8,
    focus: [3.3, 1.5, -3.4],
    zoom: 2.0,
    label: [4.9, 4.7, -5.4],
  },
  ferris: {
    name: '棉花糖摩天轮',
    spoke: 'NW',
    queue: [0.95, 3.4].map((d) => [FERRIS_C[0] + fAx[0] * d + fLat[0] * 0.22, FERRIS_C[1] + fAx[1] * d + fLat[1] * 0.22] as V2),
    exit: [FERRIS_C[0] + fAx[0] * 0.95 - fLat[0] * 0.25, FERRIS_C[1] + fAx[1] * 0.95 - fLat[1] * 0.25],
    cap: 2,
    focus: [-3.5, 2.9, -3.5],
    zoom: 1.9,
    label: [-3.5, 6.25, -3.5],
  },
  carousel: {
    name: '旋转木马',
    spoke: 'W',
    queue: [...arcPts(CAROUSEL_C, 1.95, carA - 1.75, carA, 10), [CAROUSEL_C[0] + Math.cos(carA) * 2.55, CAROUSEL_C[1] + Math.sin(carA) * 2.55] as V2],
    exit: [CAROUSEL_C[0] + Math.cos(carA + 0.42) * 1.85, CAROUSEL_C[1] + Math.sin(carA + 0.42) * 1.85],
    cap: 8,
    focus: [-3.5, 1.0, 2.55],
    zoom: 2.6,
    label: [-3.5, 2.95, 2.55],
  },
  swing: {
    name: '旋转飞椅',
    spoke: 'SE',
    queue: [...arcPts(SWING_C, 2.32, swA + 1.45, swA, 10), [SWING_C[0] + Math.cos(swA) * 2.75, SWING_C[1] + Math.sin(swA) * 2.75] as V2],
    exit: [SWING_C[0] + Math.cos(swA - 0.35) * 2.3, SWING_C[1] + Math.sin(swA - 0.35) * 2.3],
    cap: 12,
    focus: [3.75, 1.4, 3.6],
    zoom: 2.4,
    label: [3.75, 3.55, 3.6],
  },
}
const RIDE_IDS: RideId[] = ['coaster', 'ferris', 'carousel', 'swing']
const STALLS: { kind: 'ice' | 'pop' | 'candy'; p: V2; face: number; stand: V2 }[] = [
  { kind: 'ice', p: [1.3, 2.75], face: -Math.PI / 2, stand: [0.48, 2.75] },
  { kind: 'pop', p: [-1.3, 3.55], face: Math.PI / 2, stand: [-0.48, 3.55] },
  { kind: 'candy', p: [1.3, 4.4], face: -Math.PI / 2, stand: [0.48, 4.4] },
]
const GATE_Z = 5.55
const SLOT = 0.27

/* queue polyline lookup */
const QUEUE_GEOM = Object.fromEntries(
  RIDE_IDS.map((id) => {
    const pts = RIDES[id].queue
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return [id, { pts, cum, total: cum[cum.length - 1], max: Math.floor(cum[cum.length - 1] / SLOT) + 1 }]
  }),
) as Record<RideId, { pts: V2[]; cum: number[]; total: number; max: number }>
function slotPos(id: RideId, k: number, out: V2) {
  const q = QUEUE_GEOM[id]
  const d = Math.min(k * SLOT, q.total)
  let i = 1
  while (i < q.cum.length - 1 && q.cum[i] < d) i++
  const t = (d - q.cum[i - 1]) / (q.cum[i] - q.cum[i - 1] || 1)
  out[0] = lerp(q.pts[i - 1][0], q.pts[i][0], t)
  out[1] = lerp(q.pts[i - 1][1], q.pts[i][1], t)
  return out
}

/* ================================================================== crowd simulation */
const MAX_P = 80
const St = { Off: 0, Decide: 1, Walk: 2, Queue: 3, Ride: 4, Browse: 5 } as const
type St = (typeof St)[keyof typeof St]
type Goal = { kind: 'queue'; ride: RideId } | { kind: 'browse'; t: number; face: number; balloon?: boolean } | { kind: 'gate' } | { kind: 'none' }
type Person = {
  st: St
  x: number
  z: number
  head: number
  spoke: SpokeId
  wp: V2[]
  goal: Goal
  ride: RideId | null
  timer: number
  speed: number
  kid: boolean
  phase: number
  balloon: number
  leaving: boolean
  moving: boolean
}

class ParkSim {
  people: Person[] = []
  queues: Record<RideId, number[]> = { coaster: [], ferris: [], carousel: [], swing: [] }
  target = 60
  coasterV = 0
  running: Record<RideId, boolean> = { coaster: false, ferris: true, carousel: false, swing: false }
  private tmp: V2 = [0, 0]

  constructor(count: number) {
    this.target = count
    for (let i = 0; i < MAX_P; i++) {
      this.people.push({
        st: St.Off,
        x: 0,
        z: 6.2,
        head: 0,
        spoke: 'S',
        wp: [],
        goal: { kind: 'none' },
        ride: null,
        timer: 0,
        speed: 0.5 + rnd(i * 3.1) * 0.22,
        kid: rnd(i * 7.3) < 0.28,
        phase: rnd(i * 1.7) * TAU,
        balloon: -1,
        leaving: false,
        moving: false,
      })
    }
    // a lively opening: queues already filled, people spread along every path
    const ids = Array.from({ length: count }, (_, i) => i)
    const fill: Record<RideId, number> = { coaster: 9, ferris: 6, carousel: 6, swing: 7 }
    let k = 0
    for (const id of RIDE_IDS) {
      const n = Math.round((fill[id] * count) / 60)
      for (let j = 0; j < n && k < ids.length; j++, k++) {
        const p = this.people[ids[k]]
        p.st = St.Queue
        p.ride = id
        p.spoke = RIDES[id].spoke
        this.queues[id].push(ids[k])
        slotPos(id, j, this.tmp)
        p.x = this.tmp[0]
        p.z = this.tmp[1]
      }
    }
    for (; k < ids.length; k++) {
      const p = this.people[ids[k]]
      const r = rnd(k * 5.7)
      if (r < 0.15) {
        const s = STALLS[k % 3]
        p.x = s.stand[0] + (rnd(k) - 0.5) * 0.3
        p.z = s.stand[1] + (rnd(k + 1) - 0.5) * 0.4
        p.spoke = 'S'
        p.st = St.Browse
        p.timer = 1 + rnd(k + 2) * 3
        p.goal = { kind: 'browse', t: 0, face: s.face + Math.PI }
      } else if (r < 0.27) {
        const a = rnd(k + 9) * TAU
        p.x = Math.cos(a) * 0.85
        p.z = Math.sin(a) * 0.85
        p.spoke = 'P'
        p.st = St.Browse
        p.timer = 1 + rnd(k + 3) * 3
        p.goal = { kind: 'browse', t: 0, face: Math.atan2(-Math.cos(a), -Math.sin(a)), balloon: true }
      } else {
        const sp = (['S', 'E', 'NW', 'W', 'SE'] as const)[k % 5]
        const d = 1.5 + rnd(k + 4) * (SPOKE_LEN[sp] - 2)
        const o = (rnd(k + 6) - 0.5) * SPOKE_W[sp] * 0.6
        p.x = SPOKE_DIR[sp][0] * d - SPOKE_DIR[sp][1] * o
        p.z = SPOKE_DIR[sp][1] * d + SPOKE_DIR[sp][0] * o
        p.spoke = sp
        p.st = St.Decide
      }
      if (rnd(k * 2.3) < 0.3) p.balloon = Math.floor(rnd(k * 4.1) * CANDY.length)
    }
  }

  active() {
    let n = 0
    for (const p of this.people) if (p.st !== St.Off && !p.leaving) n++
    return n
  }

  /** pull up to `max` people who are standing at the head of the line */
  take(id: RideId, max: number): number[] {
    const q = this.queues[id]
    const out: number[] = []
    while (out.length < max && q.length) {
      const i = q[0]
      const p = this.people[i]
      slotPos(id, 0, this.tmp)
      if (Math.hypot(p.x - this.tmp[0], p.z - this.tmp[1]) > 0.16) break
      q.shift()
      p.st = St.Ride
      p.timer = -1
      out.push(i)
    }
    return out
  }

  drop(id: RideId, ids: number[]) {
    const e = RIDES[id].exit
    ids.forEach((i, k) => {
      const p = this.people[i]
      if (p.st !== St.Ride) return
      p.x = e[0] + (rnd(i + k) - 0.5) * 0.3
      p.z = e[1] + (rnd(i * 2 + k) - 0.5) * 0.3
      p.spoke = RIDES[id].spoke
      p.st = St.Decide
      p.ride = null
      p.timer = 0.2 + k * 0.25 // trickle out
    })
  }

  private jit(v: V2, s = 0.28): V2 {
    return [v[0] + (Math.random() - 0.5) * s, v[1] + (Math.random() - 0.5) * s]
  }

  private route(p: Person, to: SpokeId, pts: V2[]) {
    p.wp.length = 0
    if (p.spoke !== to) {
      if (p.spoke !== 'P') p.wp.push(this.jit(HUB(p.spoke)))
      if (to !== 'P' && p.spoke !== 'P') {
        const a = Math.atan2(HUB(p.spoke)[1], HUB(p.spoke)[0])
        const b = Math.atan2(HUB(to)[1], HUB(to)[0])
        let d = b - a
        d = Math.atan2(Math.sin(d), Math.cos(d))
        if (Math.abs(d) > 1.5) {
          const m = a + d / 2
          p.wp.push(this.jit([Math.cos(m) * 1.1, Math.sin(m) * 1.1], 0.2))
        }
      }
      if (to !== 'P') p.wp.push(this.jit(HUB(to)))
    }
    p.wp.push(...pts)
    p.spoke = to
  }

  private decide(i: number) {
    const p = this.people[i]
    if (p.leaving) {
      this.route(p, 'S', [this.jit([0, 6.25], 0.5)])
      p.goal = { kind: 'gate' }
      p.st = St.Walk
      return
    }
    const r = Math.random()
    if (r < 0.62) {
      // a ride, preferring shorter lines
      let best: RideId | null = null
      let wsum = 0
      const base: Record<RideId, number> = { coaster: 1.4, ferris: 1, carousel: 0.9, swing: 1 }
      for (const id of RIDE_IDS) {
        const q = this.queues[id].length
        if (q >= QUEUE_GEOM[id].max) continue
        const w = base[id] / (1 + q / 7)
        wsum += w
        if (Math.random() * wsum < w) best = id
      }
      if (best) {
        const k = this.queues[best].length
        this.queues[best].push(i)
        p.ride = best
        const tail = slotPos(best, k, [0, 0])
        this.route(p, RIDES[best].spoke, [tail])
        p.goal = { kind: 'queue', ride: best }
        p.st = St.Walk
        return
      }
    }
    if (r < 0.78) {
      const s = STALLS[Math.floor(Math.random() * STALLS.length)]
      this.route(p, 'S', [this.jit(s.stand, 0.35)])
      p.goal = { kind: 'browse', t: 2 + Math.random() * 3, face: s.face + Math.PI }
    } else if (r < 0.88) {
      const a = Math.random() * TAU
      this.route(p, 'P', [[Math.cos(a) * 0.82, Math.sin(a) * 0.82]])
      p.goal = { kind: 'browse', t: 1.5 + Math.random() * 2, face: Math.atan2(-Math.cos(a), -Math.sin(a)), balloon: true }
    } else {
      const sp = (['S', 'E', 'NW', 'W', 'SE'] as const)[Math.floor(Math.random() * 5)]
      const d = 1.8 + Math.random() * (SPOKE_LEN[sp] - 2.4)
      const o = (Math.random() - 0.5) * SPOKE_W[sp] * 0.6
      this.route(p, sp, [[SPOKE_DIR[sp][0] * d - SPOKE_DIR[sp][1] * o, SPOKE_DIR[sp][1] * d + SPOKE_DIR[sp][0] * o]])
      p.goal = { kind: 'browse', t: 0.8 + Math.random() * 1.6, face: Math.random() * TAU }
    }
    p.st = St.Walk
  }

  private step(p: Person, tx: number, tz: number, v: number, dt: number) {
    const dx = tx - p.x
    const dz = tz - p.z
    const d = Math.hypot(dx, dz)
    const s = v * dt
    if (d <= s || d < 1e-4) {
      p.x = tx
      p.z = tz
      return true
    }
    p.x += (dx / d) * s
    p.z += (dz / d) * s
    const h = Math.atan2(dx, dz)
    let dh = h - p.head
    dh = Math.atan2(Math.sin(dh), Math.cos(dh))
    p.head += dh * Math.min(1, dt * 10)
    p.moving = true
    return false
  }

  update(dt: number) {
    // population control: enter / leave through the gate
    let act = this.active()
    if (act < this.target) {
      for (const p of this.people) {
        if (act >= this.target) break
        if (p.st !== St.Off) continue
        p.st = St.Decide
        p.x = (Math.random() - 0.5) * 0.7
        p.z = 6.25
        p.spoke = 'S'
        p.leaving = false
        p.timer = Math.random() * 3
        p.balloon = -1
        act++
      }
    } else if (act > this.target) {
      for (const p of this.people) {
        if (act <= this.target) break
        if (p.leaving || (p.st !== St.Walk && p.st !== St.Decide && p.st !== St.Browse) || p.goal.kind === 'queue') continue
        p.leaving = true
        p.st = St.Decide
        p.timer = 0
        act--
      }
    }

    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i]
      p.moving = false
      switch (p.st) {
        case St.Decide:
          p.timer -= dt
          if (p.timer <= 0) this.decide(i)
          break
        case St.Walk: {
          const w = p.wp[0]
          if (!w) {
            this.arrive(i)
            break
          }
          if (this.step(p, w[0], w[1], p.speed, dt)) p.wp.shift()
          break
        }
        case St.Queue: {
          const k = this.queues[p.ride!].indexOf(i)
          slotPos(p.ride!, k, this.tmp)
          this.step(p, this.tmp[0], this.tmp[1], 0.42, dt)
          break
        }
        case St.Browse:
          p.timer -= dt
          if (p.goal.kind === 'browse') {
            let dh = p.goal.face - p.head
            dh = Math.atan2(Math.sin(dh), Math.cos(dh))
            p.head += dh * Math.min(1, dt * 6)
          }
          if (p.timer <= 0) {
            if (p.goal.kind === 'browse' && p.goal.balloon && p.balloon < 0 && Math.random() < 0.75) p.balloon = Math.floor(Math.random() * CANDY.length)
            p.st = St.Decide
            p.timer = 0
          }
          break
      }
    }
  }

  private arrive(i: number) {
    const p = this.people[i]
    const g = p.goal
    if (g.kind === 'queue') p.st = St.Queue
    else if (g.kind === 'browse') {
      p.st = St.Browse
      p.timer = g.t
    } else if (g.kind === 'gate') {
      p.st = St.Off
      p.leaving = false
    } else p.st = St.Decide
  }

  stats(id: RideId) {
    const q = this.queues[id].length
    const per: Record<RideId, [number, number]> = { coaster: [8, 3], ferris: [2, 1.5], carousel: [8, 4], swing: [12, 3] }
    const [cap, min] = per[id]
    return { q, wait: Math.ceil(q / cap) * min }
  }
}

/* ================================================================== context */
type Ctx = {
  sim: ParkSim
  night: MotionValue<number>
  pick: (id: RideId) => void
}
const ParkCtx = createContext<Ctx>(null!)

function useHover() {
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => void (document.body.style.cursor = ''),
  }
}

/* ================================================================== primitives */
function Part({ p, s, m, rot, cast = true }: { p: V3; s: V3; m: THREE.Material; rot?: V3; cast?: boolean }) {
  return <mesh geometry={G.box} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}
function Cyl({ p, r, h, m, cast = true, rot }: { p: V3; r: number; h: number; m: THREE.Material; cast?: boolean; rot?: V3 }) {
  return <mesh geometry={G.cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} castShadow={cast} receiveShadow />
}
/** a thin cylinder between two points */
function Beam({ a, b, r, m }: { a: V3; b: V3; r: number; m: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a)
    const vb = new THREE.Vector3(...b)
    const d = vb.clone().sub(va)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())
    return { pos: va.add(vb).multiplyScalar(0.5), quat: q, len: d.length() }
  }, [a, b])
  return <mesh geometry={G.cyl8} material={m} position={pos} quaternion={quat} scale={[r, len, r]} castShadow />
}

/** static bulbs + glow billboards (positions in the parent's space) */
function Bulbs({ pts, colors, size = 0.045, glow = 0.55 }: { pts: V3[]; colors: string[]; size?: number; glow?: number }) {
  const bulbs = useRef<THREE.InstancedMesh>(null)
  const glows = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    pts.forEach((p, i) => {
      c.set(colors[i % colors.length])
      m.makeScale(size, size, size).setPosition(p[0], p[1], p[2])
      bulbs.current!.setMatrixAt(i, m)
      bulbs.current!.setColorAt(i, c)
      m.makeScale(glow, glow, glow).setPosition(p[0], p[1], p[2])
      glows.current!.setMatrixAt(i, m)
      glows.current!.setColorAt(i, c)
    })
    for (const r of [bulbs, glows]) {
      r.current!.instanceMatrix.needsUpdate = true
      if (r.current!.instanceColor) r.current!.instanceColor.needsUpdate = true
      r.current!.computeBoundingSphere()
    }
  }, [pts, colors, size, glow])
  return (
    <>
      <instancedMesh ref={bulbs} args={[G.ball, bulbMat, pts.length]} frustumCulled={false} />
      <instancedMesh ref={glows} args={[quadGeo, glowMat, pts.length]} frustumCulled={false} renderOrder={5} />
    </>
  )
}
const BULB_COLS = ['#ffd36b', '#ff7aa2', '#8ce6cf', '#ffffff', '#9fd2ff']
const WARM_COLS = ['#ffd27a', '#ffe9b0', '#ffc2d4']

function catenary(a: V3, b: V3, sag: number, n: number, skipEnds = true): V3[] {
  const out: V3[] = []
  for (let i = skipEnds ? 1 : 0; i <= (skipEnds ? n - 1 : n); i++) {
    const t = i / n
    out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)])
  }
  return out
}

/* ================================================================== plot */
function roundedRectShape(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function Slab({ w, d, r, h, y, color }: { w: number; d: number; r: number; h: number; y: number; color: string }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), { depth: h, bevelEnabled: false, curveSegments: 10 })
    g.rotateX(Math.PI / 2)
    return g
  }, [w, d, r, h])
  return <mesh geometry={geo} material={lam(color)} position={[0, y, 0]} receiveShadow castShadow />
}

function PathStrip({ a, b, w, color, y = 0.015, h = 0.03 }: { a: V2; b: V2; w: number; color: string; y?: number; h?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  return <Part p={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} s={[len, h, w]} rot={[0, -ang, 0]} m={lam(color)} cast={false} />
}

function Plot() {
  return (
    <group>
      <Slab w={13} d={13} r={1.4} h={0.36} y={0} color={C.grass} />
      <Slab w={12.6} d={12.6} r={1.25} h={0.55} y={-0.36} color={C.cake1} />
      <Slab w={11.2} d={11.2} r={1.1} h={0.7} y={-0.91} color={C.cake2} />
      <Slab w={9.2} d={9.2} r={0.9} h={0.8} y={-1.61} color={C.cake3} />
      <Slab w={6.6} d={6.6} r={0.7} h={0.9} y={-2.41} color={C.cake4} />
      <Slab w={3.6} d={3.6} r={0.5} h={0.8} y={-3.31} color={C.lilac} />
      {/* icing drips on the first layer */}
      {Array.from({ length: 18 }, (_, i) => {
        const side = i % 4
        const t = (Math.floor(i / 4) + 0.5 + rnd(i) * 0.4) / 5 - 0.5
        const L = 6.3
        const pos: V3 = side === 0 ? [t * 11, -0.5, L] : side === 1 ? [L, -0.5, t * 11] : side === 2 ? [t * 11, -0.5, -L] : [-L, -0.5, t * 11]
        const h = 0.14 + rnd(i * 3) * 0.2
        return <mesh key={i} geometry={G.ball} material={lam(C.cake1)} position={[pos[0], -0.86, pos[2]]} scale={[0.2, h, 0.2]} />
      })}
      {/* paving */}
      <mesh geometry={G.cyl} material={lam(C.path)} position={[0, 0.015, 0]} scale={[PLAZA_R, 0.03, PLAZA_R]} receiveShadow />
      <mesh geometry={G.cyl} material={lam(C.pink)} position={[0, 0.02, 0]} scale={[PLAZA_R * 0.42, 0.031, PLAZA_R * 0.42]} receiveShadow />
      {(Object.keys(SPOKE_DIR) as Exclude<SpokeId, 'P'>[]).map((s) => (
        <PathStrip key={s} a={[SPOKE_DIR[s][0] * 1.2, SPOKE_DIR[s][1] * 1.2]} b={[SPOKE_DIR[s][0] * SPOKE_LEN[s], SPOKE_DIR[s][1] * SPOKE_LEN[s]]} w={SPOKE_W[s]} color={C.path} />
      ))}
      {RIDE_IDS.flatMap((id) =>
        RIDES[id].queue.slice(1).map((b, k) => {
          const a = RIDES[id].queue[k]
          const dx = b[0] - a[0]
          const dz = b[1] - a[1]
          const l = Math.hypot(dx, dz)
          const ext = 0.17 / l
          return <PathStrip key={`${id}${k}`} a={[a[0] - dx * ext, a[1] - dz * ext]} b={[b[0] + dx * ext, b[1] + dz * ext]} w={0.34} color={C.queue} y={0.022} h={0.03} />
        }),
      )}
      {/* coaster infield pond */}
      <mesh geometry={G.cyl} material={lam('#9edcf0')} position={[3.35, 0.012, -3.45]} scale={[1.05, 0.025, 0.8]} />
      <mesh geometry={G.cyl} material={lam('#e7f7fb')} position={[3.35, 0.008, -3.45]} scale={[1.18, 0.02, 0.93]} />
      <Hedges />
      <QueuePosts />
    </group>
  )
}

function Hedges() {
  const L = 6.15
  const segs: [V3, V3][] = [
    [[-L, 0.14, -4.6], [0.25, 0.28, 3.0]],
    [[-L, 0.14, 0.4], [0.25, 0.28, 3.2]],
    [[-L, 0.14, 4.4], [0.25, 0.28, 2.4]],
    [[-3.7, 0.14, L], [3.4, 0.28, 0.25]],
    [[3.6, 0.14, L], [3.6, 0.28, 0.25]],
    [[L, 0.14, 4.0], [0.25, 0.28, 3.4]],
    [[L, 0.14, 0.4], [0.25, 0.28, 1.4]],
    [[-1.6, 0.14, -L], [3.0, 0.28, 0.25]],
  ]
  return (
    <group>
      {segs.map(([p, s], i) => (
        <mesh key={i} geometry={G.box} material={lam(C.hedge)} position={p} scale={s} castShadow receiveShadow />
      ))}
    </group>
  )
}

function QueuePosts() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const pts = useMemo(() => {
    const out: V3[] = []
    for (const id of RIDE_IDS) {
      const q = RIDES[id].queue
      for (let i = 0; i < q.length; i++) {
        const a = q[Math.max(0, i - 1)]
        const b = q[Math.min(q.length - 1, i + 1)]
        const d = unit(b[0] - a[0], b[1] - a[1])
        for (const s of [-1, 1]) out.push([q[i][0] - d[1] * 0.2 * s, 0.12, q[i][1] + d[0] * 0.2 * s])
      }
    }
    return out
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    pts.forEach((p, i) => ref.current!.setMatrixAt(i, m.makeScale(0.025, 0.2, 0.025).setPosition(p[0], p[1], p[2])))
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [pts])
  return <instancedMesh ref={ref} args={[G.cyl8, lam(C.steel), pts.length]} castShadow />
}

/* ================================================================== trees */
const TREES: [number, number, number, number][] = [
  // x, z, scale, colour index
  [-5.4, -0.9, 1.1, 0],
  [-4.9, 0.3, 0.8, 1],
  [-5.5, 5.4, 1.0, 2],
  [-2.2, 5.3, 0.9, 0],
  [-1.6, -5.2, 1.0, 1],
  [-0.4, -5.5, 0.8, 0],
  [-0.5, -3.6, 0.75, 2],
  [-5.6, -5.3, 0.9, 0],
  [0.3, -2.95, 0.7, 1],
  [2.15, -2.55, 0.6, 0],
  [3.4, -4.5, 0.6, 2],
  [4.6, -2.7, 0.65, 1],
  [5.5, -0.4, 0.85, 0],
  [5.5, 1.3, 0.75, 2],
  [2.15, 5.45, 0.8, 1],
  [5.6, 5.6, 0.95, 0],
  [-2.3, -0.6, 0.7, 0],
  [-1.9, 2.75, 0.6, 2],
  [2.2, 1.1, 0.55, 1],
  [-5.6, 3.3, 0.7, 1],
]
const TREE_COLS = ['#8fd6a0', '#a6e3a1', '#ffb3cc']
function Trees() {
  const crowns = useRef<THREE.InstancedMesh>(null)
  const trunks = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1, 2), [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    TREES.forEach(([x, z, s, ci], i) => {
      m.makeScale(0.42 * s, 0.48 * s, 0.42 * s).setPosition(x, 0.62 * s, z)
      crowns.current!.setMatrixAt(i, m)
      crowns.current!.setColorAt(i, c.set(TREE_COLS[ci]))
      m.makeScale(0.06 * s, 0.4 * s, 0.06 * s).setPosition(x, 0.2 * s, z)
      trunks.current!.setMatrixAt(i, m)
    })
    crowns.current!.instanceMatrix.needsUpdate = true
    crowns.current!.instanceColor!.needsUpdate = true
    trunks.current!.instanceMatrix.needsUpdate = true
    crowns.current!.computeBoundingSphere()
    trunks.current!.computeBoundingSphere()
  }, [])
  return (
    <>
      <instancedMesh ref={crowns} args={[geo, lam('#ffffff'), TREES.length]} castShadow receiveShadow />
      <instancedMesh ref={trunks} args={[G.cyl8, lam(C.trunk), TREES.length]} castShadow />
    </>
  )
}

/* ================================================================== ferris wheel */
const FW = { hub: 3.2, R: 2.45, n: 10, period: 36 }
function FerrisWheel() {
  const { sim, pick } = useContext(ParkCtx)
  const hover = useHover()
  const wheel = useRef<THREE.Group>(null)
  const gond = useRef<(THREE.Group | null)[]>([])
  const riders = useRef<(THREE.Group | null)[]>([])
  const st = useRef({ a: 0, last: -1, loads: Array.from({ length: FW.n }, () => [] as number[]) })

  const rimPts = useMemo(() => {
    const out: V3[] = []
    for (const z of [-0.32, 0.32]) for (let i = 0; i < 30; i++) out.push([Math.cos((i / 30) * TAU) * FW.R, Math.sin((i / 30) * TAU) * FW.R, z])
    for (let i = 0; i < 16; i++) out.push([Math.cos((i / 16) * TAU) * FW.R * 0.45, Math.sin((i / 16) * TAU) * FW.R * 0.45, 0.36])
    return out
  }, [])
  const spokes = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const z of [-0.32, 0.32])
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU
        const g = new THREE.BoxGeometry(FW.R, 0.035, 0.035)
        g.translate(FW.R / 2, 0, 0)
        g.rotateZ(a)
        g.translate(0, 0, z)
        parts.push(g)
      }
    for (let i = 0; i < FW.n; i++) {
      const a = (i / FW.n) * TAU
      const g = new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6)
      g.rotateX(Math.PI / 2)
      g.translate(Math.cos(a) * FW.R, Math.sin(a) * FW.R, 0)
      parts.push(g)
    }
    return mergeGeometries(parts)
  }, [])
  const rimGeo = useMemo(() => new THREE.TorusGeometry(FW.R, 0.06, 8, 96), [])
  const innerGeo = useMemo(() => new THREE.TorusGeometry(FW.R * 0.45, 0.045, 8, 48), [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const s = st.current
    s.a += (dt * TAU) / FW.period
    if (wheel.current) wheel.current.rotation.z = s.a
    for (let k = 0; k < FW.n; k++) {
      const g = gond.current[k]
      if (!g) continue
      const a = s.a + (k / FW.n) * TAU
      g.position.set(Math.cos(a) * FW.R, FW.hub + Math.sin(a) * FW.R, 0)
      g.rotation.z = Math.sin(s.a * 3 + k) * 0.05
      const r = riders.current[k]
      if (r) {
        const n = s.loads[k].length
        r.children.forEach((c, j) => (c.visible = j < n))
      }
    }
    // which gondola is at the bottom (angle ≡ -π/2)?
    const bottom = ((Math.round(((-Math.PI / 2 - s.a) / TAU) * FW.n) % FW.n) + FW.n) % FW.n
    if (bottom !== s.last) {
      s.last = bottom
      sim.drop('ferris', s.loads[bottom])
      s.loads[bottom] = sim.take('ferris', 2)
    }
  })

  const legM = lam(C.white)
  return (
    <group position={[FERRIS_C[0], 0, FERRIS_C[1]]} rotation={[0, Math.PI / 4, 0]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          pick('ferris')
        }}
        {...hover}
      >
        <mesh visible={false} geometry={G.cyl} position={[0, FW.hub, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[FW.R + 0.4, 1.2, FW.R + 0.4]} />
        <mesh visible={false} geometry={G.box} position={[0, 0.5, 0.4]} scale={[3.6, 1, 2]} />
      </group>
      {/* base */}
      <Part p={[0, 0.1, 0.15]} s={[3.8, 0.2, 1.7]} m={lam(C.cake3)} />
      <Part p={[0, 0.22, 0.15]} s={[3.5, 0.06, 1.45]} m={lam(C.cream)} />
      <Part p={[0, 0.27, 0.6]} s={[1.0, 0.04, 0.5]} m={lam(C.pink)} cast={false} />
      {/* A-frames */}
      {[-0.5, 0.5].map((z) => (
        <group key={z}>
          <Beam a={[-1.55, 0.2, z]} b={[0, FW.hub, z * 0.8]} r={0.075} m={legM} />
          <Beam a={[1.55, 0.2, z]} b={[0, FW.hub, z * 0.8]} r={0.075} m={legM} />
          <Beam a={[-0.8, 1.7, z * 0.9]} b={[0.8, 1.7, z * 0.9]} r={0.04} m={legM} />
        </group>
      ))}
      <mesh geometry={G.cyl} material={lam(C.steel)} position={[0, FW.hub, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.09, 1.1, 0.09]} />
      {/* rotating wheel */}
      <group ref={wheel} position={[0, FW.hub, 0]}>
        <mesh geometry={rimGeo} material={lam(C.hot)} position={[0, 0, 0.32]} castShadow />
        <mesh geometry={rimGeo} material={lam(C.hot)} position={[0, 0, -0.32]} castShadow />
        <mesh geometry={innerGeo} material={lam(C.lemon)} position={[0, 0, 0.36]} />
        <mesh geometry={spokes} material={lam(C.white)} castShadow />
        <mesh geometry={G.cyl} material={lam(C.lemon)} rotation={[Math.PI / 2, 0, 0]} scale={[0.32, 0.82, 0.32]} />
        <mesh geometry={G.cyl} material={lam(C.hot)} position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 0.06, 0.18]} />
        <Bulbs pts={rimPts} colors={BULB_COLS} size={0.05} glow={0.6} />
      </group>
      {/* gondolas stay upright: positioned on the rim each frame, never rotated with it */}
      {Array.from({ length: FW.n }, (_, k) => {
        const col = CANDY[k % CANDY.length]
        return (
          <group key={k} ref={(g) => void (gond.current[k] = g)}>
            <mesh geometry={G.cyl8} material={lam(C.steel)} position={[0, -0.16, 0]} scale={[0.018, 0.32, 0.018]} />
            <mesh geometry={G.cyl} material={lam(col)} position={[0, -0.4, 0]} scale={[0.2, 0.17, 0.2]} castShadow />
            <mesh geometry={G.cyl} material={lam(C.white)} position={[0, -0.3, 0]} scale={[0.21, 0.03, 0.21]} />
            <mesh geometry={G.cone} material={lam(col)} position={[0, -0.04, 0]} scale={[0.23, 0.12, 0.23]} castShadow />
            <group ref={(g) => void (riders.current[k] = g)}>
              {[-0.07, 0.07].map((x, j) => (
                <mesh key={j} geometry={G.ball} material={lam(SKIN[(k + j) % 4])} position={[x, -0.24, 0]} scale={0.055} visible={false} />
              ))}
            </group>
          </group>
        )
      })}
    </group>
  )
}

/* ================================================================== roller coaster */
const TRACK: V3[] = [
  [1.75, 0.45, -1.5],
  [2.9, 0.45, -1.5],
  [4.0, 0.45, -1.5],
  [4.9, 0.55, -1.72],
  [5.42, 0.95, -2.45],
  [5.5, 2.2, -3.55],
  [5.42, 3.55, -4.7],
  [5.0, 4.05, -5.4],
  [4.2, 3.75, -5.72],
  [3.3, 1.5, -5.68],
  [2.4, 0.5, -5.3],
  [1.6, 1.35, -4.75],
  [1.12, 1.9, -3.85],
  [1.18, 1.35, -2.95],
  [0.98, 0.68, -2.2],
  [1.18, 0.47, -1.65],
]
const CAR_GAP = 0.5
const N_CARS = 4
const TS = 900
type TrackData = {
  L: number
  P: Float32Array
  T: Float32Array
  U: Float32Array
  S: Float32Array
  sStop: number
  sLift0: number
  sCrest: number
  yCrest: number
}
function buildTrack(): TrackData {
  const curve = new THREE.CatmullRomCurve3(
    TRACK.map((p) => new THREE.Vector3(...p)),
    true,
    'centripetal',
  )
  curve.arcLengthDivisions = 3000
  const L = curve.getLength()
  const P = new Float32Array(TS * 3)
  const T = new Float32Array(TS * 3)
  const U = new Float32Array(TS * 3)
  const S = new Float32Array(TS * 3)
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  const tans: THREE.Vector3[] = []
  for (let i = 0; i < TS; i++) {
    curve.getPointAt(i / TS, p)
    curve.getTangentAt(i / TS, t)
    P.set([p.x, p.y, p.z], i * 3)
    tans.push(t.clone())
  }
  const up = new THREE.Vector3()
  const side = new THREE.Vector3()
  const bend = new THREE.Vector3()
  const ds = L / TS
  for (let i = 0; i < TS; i++) {
    const a = tans[(i - 6 + TS) % TS]
    const b = tans[(i + 6) % TS]
    bend.subVectors(b, a).divideScalar(12 * ds)
    bend.y = 0
    const tt = tans[i]
    // bank into horizontal turns
    up.set(0, 1, 0).addScaledVector(bend, 0.32)
    up.addScaledVector(tt, -up.dot(tt)).normalize()
    side.crossVectors(tt, up).normalize()
    T.set([tt.x, tt.y, tt.z], i * 3)
    U.set([up.x, up.y, up.z], i * 3)
    S.set([side.x, side.y, side.z], i * 3)
  }
  let sStop = 0
  let best = 1e9
  for (let i = 0; i < TS; i++) {
    const d = Math.hypot(P[i * 3] - 3.75, P[i * 3 + 2] + 1.5) + (P[i * 3 + 1] > 0.6 ? 10 : 0)
    if (d < best) {
      best = d
      sStop = (i / TS) * L
    }
  }
  let yCrest = 0
  let sCrest = 0
  for (let i = 0; i < TS; i++)
    if (P[i * 3 + 1] > yCrest) {
      yCrest = P[i * 3 + 1]
      sCrest = (i / TS) * L
    }
  // the chain starts where the climb starts after the station
  let sLift0 = sStop
  for (let i = 0; i < TS; i++) {
    const s = (i / TS) * L
    const rel = (s - sStop + L) % L
    if (rel > 0 && rel < (sCrest - sStop + L) % L && P[i * 3 + 1] > 0.62) {
      sLift0 = s
      break
    }
  }
  return { L, P, T, U, S, sStop, sLift0, sCrest, yCrest }
}
const _tq = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), s: new THREE.Vector3() }
function sampleTrack(d: TrackData, s: number) {
  s = ((s % d.L) + d.L) % d.L
  const f = (s / d.L) * TS
  const i = Math.floor(f) % TS
  const j = (i + 1) % TS
  const k = f - Math.floor(f)
  const L3 = (arr: Float32Array, out: THREE.Vector3) =>
    out.set(lerp(arr[i * 3], arr[j * 3], k), lerp(arr[i * 3 + 1], arr[j * 3 + 1], k), lerp(arr[i * 3 + 2], arr[j * 3 + 2], k))
  L3(d.P, _tq.p)
  L3(d.T, _tq.t).normalize()
  L3(d.U, _tq.u).normalize()
  L3(d.S, _tq.s).normalize()
  return _tq
}

/** tube along the track, offset in the (side, up) frame */
function trackTube(d: TrackData, side: number, upOff: number, radius: number, radial: number, from = 0, to = TS, uvScale = 1) {
  const rings = to - from + 1
  const pos = new Float32Array(rings * radial * 3)
  const nor = new Float32Array(rings * radial * 3)
  const uv = new Float32Array(rings * radial * 2)
  const idx: number[] = []
  for (let r = 0; r < rings; r++) {
    const i = (from + r) % TS
    const cx = d.P[i * 3] + d.S[i * 3] * side + d.U[i * 3] * upOff
    const cy = d.P[i * 3 + 1] + d.S[i * 3 + 1] * side + d.U[i * 3 + 1] * upOff
    const cz = d.P[i * 3 + 2] + d.S[i * 3 + 2] * side + d.U[i * 3 + 2] * upOff
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU + (radial === 4 ? Math.PI / 4 : 0)
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const nx = d.S[i * 3] * ca + d.U[i * 3] * sa
      const ny = d.S[i * 3 + 1] * ca + d.U[i * 3 + 1] * sa
      const nz = d.S[i * 3 + 2] * ca + d.U[i * 3 + 2] * sa
      const o = (r * radial + j) * 3
      pos[o] = cx + nx * radius
      pos[o + 1] = cy + ny * radius
      pos[o + 2] = cz + nz * radius
      nor[o] = nx
      nor[o + 1] = ny
      nor[o + 2] = nz
      uv[(r * radial + j) * 2] = ((r / TS) * d.L) / uvScale
      uv[(r * radial + j) * 2 + 1] = j / radial
    }
    if (r < rings - 1)
      for (let j = 0; j < radial; j++) {
        const a = r * radial + j
        const b = r * radial + ((j + 1) % radial)
        const c = (r + 1) * radial + j
        const e = (r + 1) * radial + ((j + 1) % radial)
        idx.push(a, c, b, b, c, e)
      }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

const chainTex = canvasTex(64, 16, (g) => {
  g.fillStyle = '#4c4560'
  g.fillRect(0, 0, 64, 16)
  g.fillStyle = '#c8c0dc'
  for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 2, 3, 9, 10)
})
chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping
const chainMat = new THREE.MeshLambertMaterial({ map: chainTex })

function Coaster() {
  const { sim, pick } = useContext(ParkCtx)
  const hover = useHover()
  const d = useMemo(buildTrack, [])
  const geos = useMemo(() => {
    const iL = Math.round((d.sLift0 / d.L) * TS)
    const iC = Math.round((d.sCrest / d.L) * TS)
    return {
      railL: trackTube(d, 0.12, 0, 0.03, 6),
      railR: trackTube(d, -0.12, 0, 0.03, 6),
      spine: trackTube(d, 0, -0.1, 0.06, 4),
      chain: trackTube(d, 0, 0.01, 0.045, 4, iL, iC, 0.25),
    }
  }, [d])
  const stationSign = useMemo(() => signMat(signTex('过山车', C.hot)), [])
  const ties = useRef<THREE.InstancedMesh>(null)
  const posts = useRef<THREE.InstancedMesh>(null)
  const { nTies, postList, bulbPts } = useMemo(() => {
    const nTies = Math.floor(d.L / 0.2)
    const postList: [number, number, number, number][] = []
    for (let s = 0.3; s < d.L; s += 0.62) {
      const q = sampleTrack(d, s)
      if (q.p.y < 0.6) continue
      const rel = (s - d.sStop + d.L) % d.L
      if (rel > d.L - 2.6 || rel < 0.3) continue
      postList.push([q.p.x, q.p.y - 0.12, q.p.z, 0])
    }
    const bulbPts: V3[] = []
    for (let s = 0.2; s < d.L; s += 0.42) {
      const q = sampleTrack(d, s)
      bulbPts.push([q.p.x + q.s.x * 0.2 - q.u.x * 0.1, q.p.y + q.s.y * 0.2 - q.u.y * 0.1, q.p.z + q.s.z * 0.2 - q.u.z * 0.1])
    }
    return { nTies, postList, bulbPts }
  }, [d])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const sc = new THREE.Matrix4()
    for (let i = 0; i < nTies; i++) {
      const q = sampleTrack(d, (i / nTies) * d.L)
      m.makeBasis(q.t, q.u, q.s).setPosition(q.p.x - q.u.x * 0.03, q.p.y - q.u.y * 0.03, q.p.z - q.u.z * 0.03)
      m.multiply(sc.makeScale(0.04, 0.035, 0.3))
      ties.current!.setMatrixAt(i, m)
    }
    ties.current!.instanceMatrix.needsUpdate = true
    ties.current!.computeBoundingSphere()
    postList.forEach(([x, y, z], i) => {
      m.makeScale(0.045, y, 0.045).setPosition(x, y / 2, z)
      posts.current!.setMatrixAt(i, m)
    })
    posts.current!.instanceMatrix.needsUpdate = true
    posts.current!.computeBoundingSphere()
  }, [d, nTies, postList])

  /* train */
  const cars = useRef<(THREE.Group | null)[]>([])
  const heads = useRef<(THREE.Group | null)[]>([])
  const st = useRef({ s: d.sStop, dist: 0, v: 0, phase: 'dwell' as 'dwell' | 'run', t: 2.2, load: [] as number[], boards: 0 })
  const mtx = useMemo(() => new THREE.Matrix4(), [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const s = st.current
    chainTex.offset.x -= dt * 0.9 * 4
    if (s.phase === 'dwell') {
      s.v = 0
      s.t -= dt
      if (s.t < 2.0 && s.boards === 0) {
        s.load.push(...sim.take('coaster', 8 - s.load.length))
        s.boards = 1
      } else if (s.t < 1.0 && s.boards === 1) {
        s.load.push(...sim.take('coaster', 8 - s.load.length))
        s.boards = 2
      }
      if (s.t <= 0) {
        s.phase = 'run'
        s.v = 0.2
        sim.running.coaster = true
      }
    } else {
      const g = 2.4
      const vLift = 0.9
      const half = (CAR_GAP * (N_CARS - 1)) / 2
      const relCrest = (d.sCrest - d.sStop + d.L) % d.L
      const rel = s.dist
      let v: number
      if (rel < relCrest + half) {
        // station tyres + chain lift: driven at a constant speed until the train's centre is over the crest
        v = Math.min(vLift, s.v + dt * 1.2)
      } else {
        // free run: speed from energy (crest height → current height of the train's centre), minus friction
        const q = sampleTrack(d, d.sStop + rel - half)
        const e = vLift * vLift + 2 * g * (d.yCrest - q.p.y) - 0.42 * (rel - half - relCrest)
        v = Math.sqrt(Math.max(0.09, e))
      }
      // brake run into the station
      if (rel > d.L - 2.8) v = Math.min(v, Math.max(0.14, (d.L - rel) * 1.2))
      s.v = v
      s.dist += v * dt
      s.s = d.sStop + Math.min(s.dist, d.L)
      if (s.dist >= d.L) {
        s.s = d.sStop
        s.dist = 0
        s.phase = 'dwell'
        s.t = 3.2
        s.boards = 0
        s.v = 0
        sim.drop('coaster', s.load)
        s.load = []
        sim.running.coaster = false
      }
    }
    sim.coasterV = s.v
    for (let k = 0; k < N_CARS; k++) {
      const g = cars.current[k]
      if (!g) continue
      const q = sampleTrack(d, s.s - k * CAR_GAP)
      mtx.makeBasis(q.t, q.u, q.s).setPosition(q.p)
      g.matrix.copy(mtx)
      g.matrixWorldNeedsUpdate = true
      const h = heads.current[k]
      if (h) h.children.forEach((c, j) => (c.visible = k * 2 + j < s.load.length))
    }
  })

  return (
    <group>
      <group
        onClick={(e) => {
          e.stopPropagation()
          pick('coaster')
        }}
        {...hover}
      >
        <mesh visible={false} geometry={G.box} position={[3.4, 1.6, -3.6]} scale={[4.8, 3.4, 4.6]} />
      </group>
      <mesh geometry={geos.railL} material={lam(C.white)} castShadow />
      <mesh geometry={geos.railR} material={lam(C.white)} castShadow />
      <mesh geometry={geos.spine} material={lam(C.hot)} castShadow />
      <mesh geometry={geos.chain} material={chainMat} />
      <instancedMesh ref={ties} args={[G.box, lam(C.lilac), nTies]} castShadow />
      <instancedMesh ref={posts} args={[G.cyl8, lam(C.cream), postList.length]} castShadow />
      <Bulbs pts={bulbPts} colors={BULB_COLS} size={0.035} glow={0.45} />
      {/* station */}
      <Part p={[2.85, 0.15, -1.05]} s={[2.6, 0.3, 0.42]} m={lam(C.cream)} />
      {[1.65, 4.05].map((x) => (
        <Cyl key={x} p={[x, 0.75, -0.95]} r={0.04} h={1.2} m={lam(C.white)} />
      ))}
      <mesh geometry={G.box} material={stripeMat(C.hot, C.white, 9)} position={[2.85, 1.38, -1.12]} rotation={[0.28, 0, 0]} scale={[2.8, 0.06, 0.75]} castShadow />
      <Part p={[2.85, 1.48, -0.78]} s={[1.0, 0.24, 0.04]} m={stationSign} cast={false} />
      {/* train */}
      {Array.from({ length: N_CARS }, (_, k) => (
        <group key={k} ref={(g) => void (cars.current[k] = g)} matrixAutoUpdate={false}>
          <mesh geometry={G.box} material={lam(k % 2 ? C.lemon : C.hot)} position={[0, 0.12, 0]} scale={[0.4, 0.13, 0.3]} castShadow />
          <mesh geometry={G.box} material={lam(C.white)} position={[-0.12, 0.22, 0]} scale={[0.05, 0.12, 0.28]} />
          <mesh geometry={G.box} material={lam(C.white)} position={[0.06, 0.22, 0]} scale={[0.05, 0.12, 0.28]} />
          {k === 0 && <mesh geometry={G.ball} material={lam(C.hot)} position={[0.2, 0.12, 0]} scale={[0.1, 0.065, 0.15]} />}
          <group ref={(g) => void (heads.current[k] = g)}>
            {[-0.075, 0.075].map((z, j) => (
              <mesh key={j} geometry={G.ball} material={lam(SKIN[(k + j) % 4])} position={[-0.03, 0.27, z]} scale={0.055} visible={false} />
            ))}
          </group>
        </group>
      ))}
    </group>
  )
}

function signTex(text: string, bg: string) {
  return canvasTex(256, 64, (g) => {
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(0, 0, 256, 64, 18)
    g.fill()
    g.fillStyle = '#ffffff'
    g.font = '600 36px "PingFang SC","Microsoft YaHei UI","Microsoft YaHei",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 128, 34)
  })
}

/* ================================================================== carousel */
function Carousel() {
  const { sim, pick } = useContext(ParkCtx)
  const hover = useHover()
  const spin = useRef<THREE.Group>(null)
  const horses = useRef<(THREE.Group | null)[]>([])
  const riders = useRef<(THREE.Object3D | null)[]>([])
  const st = useRef({ phase: 'load' as 'load' | 'run', t: 4.5, a: 0, w: 0, list: [] as number[], boards: 0 })
  const horseGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) => {
      const g = new THREE.BoxGeometry(sx, sy, sz)
      g.rotateZ(rz)
      g.translate(x, y, z)
      parts.push(g)
    }
    box(0, 0, 0, 0.36, 0.15, 0.12) // body
    box(0.19, 0.11, 0, 0.09, 0.2, 0.085, -0.45) // neck
    box(0.26, 0.2, 0, 0.15, 0.08, 0.075, -0.2) // head
    box(0.12, -0.13, 0.035, 0.04, 0.16, 0.04, 0.5) // legs
    box(0.12, -0.13, -0.035, 0.04, 0.16, 0.04, 0.3)
    box(-0.13, -0.13, 0.035, 0.04, 0.16, 0.04, -0.5)
    box(-0.13, -0.13, -0.035, 0.04, 0.16, 0.04, -0.3)
    box(-0.2, 0.0, 0, 0.12, 0.05, 0.04, 0.8) // tail
    return mergeGeometries(parts)
  }, [])
  const rimPts = useMemo(() => Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * TAU) * 1.42, 1.5, Math.sin((i / 24) * TAU) * 1.42] as V3), [])

  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    const s = st.current
    s.t -= dt
    if (s.phase === 'load') {
      s.w = Math.max(0, s.w - dt * 0.6)
      if (s.t < 3 && s.boards === 0) (s.list.push(...sim.take('carousel', 8 - s.list.length)), (s.boards = 1))
      if (s.t < 1.5 && s.boards === 1) (s.list.push(...sim.take('carousel', 8 - s.list.length)), (s.boards = 2))
      if (s.t <= 0) {
        s.phase = 'run'
        s.t = 13
        sim.running.carousel = true
      }
    } else {
      const target = s.t > 3 ? 0.85 : 0
      s.w += (target - s.w) * Math.min(1, dt * (s.t > 3 ? 0.7 : 1.1))
      if (s.t <= 0) {
        s.phase = 'load'
        s.t = 5
        s.boards = 0
        sim.drop('carousel', s.list)
        s.list = []
        sim.running.carousel = false
      }
    }
    s.a += s.w * dt
    if (spin.current) spin.current.rotation.y = s.a
    const tt = state.clock.elapsedTime
    for (let k = 0; k < 8; k++) {
      const h = horses.current[k]
      if (h) h.position.y = 0.62 + Math.sin(tt * 2.6 * (0.3 + s.w) + k * 1.3) * 0.12 * Math.min(1, s.w * 2 + 0.25)
      const r = riders.current[k]
      if (r) r.visible = k < s.list.length
    }
  })

  return (
    <group position={[CAROUSEL_C[0], 0, CAROUSEL_C[1]]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          pick('carousel')
        }}
        {...hover}
      >
        <mesh visible={false} geometry={G.cyl} position={[0, 1.1, 0]} scale={[1.6, 2.4, 1.6]} />
      </group>
      <Cyl p={[0, 0.1, 0]} r={1.42} h={0.2} m={lam(C.cream)} />
      <Cyl p={[0, 0.1, 0]} r={1.46} h={0.12} m={lam(C.pink)} />
      {/* fence */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.24, 0]} material={lam(C.white)}>
        <torusGeometry args={[1.7, 0.025, 6, 64, TAU - 0.5]} />
      </mesh>
      <group ref={spin}>
        <mesh geometry={G.cyl} material={stripeMat(C.cream, '#ffe1ea', 16)} position={[0, 0.23, 0]} scale={[1.32, 0.06, 1.32]} receiveShadow />
        <Cyl p={[0, 0.9, 0]} r={0.24} h={1.35} m={stripeMat(C.lemon, C.white, 6)} />
        <mesh geometry={G.cone} material={stripeMat(C.hot, C.white, 8)} position={[0, 1.95, 0]} scale={[1.62, 0.72, 1.62]} castShadow />
        <Cyl p={[0, 1.5, 0]} r={1.5} h={0.2} m={lam(C.lemon)} />
        <mesh geometry={G.ball} material={lam(C.hot)} position={[0, 2.38, 0]} scale={0.12} />
        <Bulbs pts={rimPts} colors={WARM_COLS} size={0.04} glow={0.5} />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * TAU
          const col = [C.white, C.pink, C.mint, C.lemon][k % 4]
          return (
            <group key={k} position={[Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95]} rotation={[0, -a - Math.PI / 2, 0]}>
              <Cyl p={[0, 0.85, 0]} r={0.018} h={1.3} m={lam(C.lemon)} cast={false} />
              <group ref={(g) => void (horses.current[k] = g)} position={[0, 0.62, 0]}>
                <mesh geometry={horseGeo} material={lam(col)} castShadow />
                <group ref={(g) => void (riders.current[k] = g)} visible={false}>
                  <mesh geometry={G.cyl} material={lam(SHIRTS[k % SHIRTS.length])} position={[0, 0.16, 0]} scale={[0.05, 0.14, 0.05]} />
                  <mesh geometry={G.ball} material={lam(SKIN[k % 4])} position={[0, 0.28, 0]} scale={0.05} />
                </group>
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
}

/* ================================================================== swing ride */
const SW = { r: 1.05, chain: 1.0, n: 12, top: 2.65 }
function SwingRide() {
  const { sim, pick } = useContext(ParkCtx)
  const hover = useHover()
  const spin = useRef<THREE.Group>(null)
  const pivots = useRef<(THREE.Group | null)[]>([])
  const riders = useRef<(THREE.Object3D | null)[]>([])
  const st = useRef({ phase: 'load' as 'load' | 'run', t: 2.5, a: 0, w: 0, tilt: 0, tv: 0, list: [] as number[], boards: 0 })
  const rimPts = useMemo(() => Array.from({ length: 18 }, (_, i) => [Math.cos((i / 18) * TAU) * 1.22, -0.05, Math.sin((i / 18) * TAU) * 1.22] as V3), [])

  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    const s = st.current
    s.t -= dt
    if (s.phase === 'load') {
      s.w = Math.max(0, s.w - dt * 0.5)
      if (s.t < 3 && s.boards === 0) (s.list.push(...sim.take('swing', SW.n - s.list.length)), (s.boards = 1))
      if (s.t < 1.4 && s.boards === 1) (s.list.push(...sim.take('swing', SW.n - s.list.length)), (s.boards = 2))
      if (s.t <= 0) {
        s.phase = 'run'
        s.t = 12
        sim.running.swing = true
      }
    } else {
      const target = s.t > 3.5 ? 1.55 : 0
      s.w += (target - s.w) * Math.min(1, dt * (s.t > 3.5 ? 0.55 : 0.9))
      if (s.t <= 0) {
        s.phase = 'load'
        s.t = 5
        s.boards = 0
        sim.drop('swing', s.list)
        s.list = []
        sim.running.swing = false
      }
    }
    s.a += s.w * dt
    // chairs fly out: tan θ = ω² r / g, followed by a damped pendulum
    const rEff = SW.r + Math.sin(s.tilt) * SW.chain
    const target = Math.atan((s.w * s.w * rEff) / 2.6)
    s.tv += ((target - s.tilt) * 18 - s.tv * 4.2) * dt
    s.tilt += s.tv * dt
    if (spin.current) spin.current.rotation.y = s.a
    const tt = state.clock.elapsedTime
    for (let k = 0; k < SW.n; k++) {
      const p = pivots.current[k]
      if (p) p.rotation.z = s.tilt + Math.sin(tt * 2.1 + k) * 0.03 * (s.w + 0.2)
      const r = riders.current[k]
      if (r) r.visible = k < s.list.length
    }
  })

  return (
    <group position={[SWING_C[0], 0, SWING_C[1]]}>
      <group
        onClick={(e) => {
          e.stopPropagation()
          pick('swing')
        }}
        {...hover}
      >
        <mesh visible={false} geometry={G.cyl} position={[0, 1.4, 0]} scale={[2.0, 2.8, 2.0]} />
      </group>
      <Cyl p={[0, 0.08, 0]} r={2.05} h={0.16} m={lam('#cdeedf')} />
      <Cyl p={[0, 0.085, 0]} r={1.62} h={0.165} m={lam(C.cream)} cast={false} />
      <Cyl p={[0, 0.09, 0]} r={1.5} h={0.17} m={lam('#bfe8d5')} cast={false} />
      <Cyl p={[0, 0.12, 0]} r={0.6} h={0.24} m={lam(C.lilac)} />
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} material={lam(C.white)}>
        <torusGeometry args={[2.05, 0.025, 6, 72, TAU - 0.45]} />
      </mesh>
      <Cyl p={[0, 1.4, 0]} r={0.13} h={2.6} m={stripeMat(C.sky, C.white, 5)} />
      <group ref={spin} position={[0, SW.top, 0]}>
        <mesh geometry={G.cone} material={stripeMat(C.mint, C.white, 8)} position={[0, 0.3, 0]} scale={[1.32, 0.5, 1.32]} castShadow />
        <Cyl p={[0, 0, 0]} r={1.25} h={0.14} m={lam(C.hot)} />
        <mesh geometry={G.ball} material={lam(C.lemon)} position={[0, 0.62, 0]} scale={0.11} />
        <Bulbs pts={rimPts} colors={BULB_COLS} size={0.04} glow={0.5} />
        {Array.from({ length: SW.n }, (_, k) => {
          const a = (k / SW.n) * TAU
          return (
            <group key={k} position={[Math.cos(a) * SW.r, -0.05, Math.sin(a) * SW.r]} rotation={[0, -a, 0]}>
              <group ref={(g) => void (pivots.current[k] = g)}>
                <mesh geometry={G.cyl8} material={lam(C.steel)} position={[0, -SW.chain / 2, 0]} scale={[0.012, SW.chain, 0.012]} />
                <mesh geometry={G.box} material={lam(CANDY[k % CANDY.length])} position={[0, -SW.chain, 0]} scale={[0.16, 0.05, 0.16]} castShadow />
                <mesh geometry={G.box} material={lam(CANDY[k % CANDY.length])} position={[-0.07, -SW.chain + 0.08, 0]} scale={[0.03, 0.14, 0.16]} />
                <group ref={(g) => void (riders.current[k] = g)} visible={false}>
                  <mesh geometry={G.cyl} material={lam(SHIRTS[(k + 3) % SHIRTS.length])} position={[0, -SW.chain + 0.1, 0]} scale={[0.045, 0.12, 0.045]} />
                  <mesh geometry={G.ball} material={lam(SKIN[k % 4])} position={[0, -SW.chain + 0.21, 0]} scale={0.048} />
                </group>
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
}

/* ================================================================== balloon stand, stalls, gate */
function BalloonStand() {
  const cluster = useRef<THREE.Group>(null)
  const loose = useRef<THREE.Group>(null)
  const st = useRef({ t: 2, col: 0 })
  const balloons = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * TAU * 1.7
        const r = 0.12 + rnd(i) * 0.14
        return { p: [Math.cos(a) * r, 1.35 + rnd(i + 3) * 0.32, Math.sin(a) * r] as V3, c: CANDY[i % CANDY.length] }
      }),
    [],
  )
  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    const t = state.clock.elapsedTime
    if (cluster.current) {
      cluster.current.rotation.z = Math.sin(t * 0.9) * 0.04
      cluster.current.rotation.x = Math.cos(t * 0.7) * 0.04
    }
    // every few seconds one balloon slips away and drifts up
    const s = st.current
    s.t += dt
    const g = loose.current
    if (g) {
      const k = s.t / 7
      g.visible = k < 1
      g.position.set(0.15 + Math.sin(s.t * 1.3) * 0.25 + s.t * 0.12, 1.6 + s.t * s.t * 0.12 + s.t * 0.35, -0.1 - s.t * 0.15)
      g.scale.setScalar(Math.max(0.001, 1 - smooth(clamp01((k - 0.7) / 0.3))))
      if (s.t > 11) s.t = 0
    }
  })
  return (
    <group position={[0, 0.03, 0]}>
      {/* cart */}
      <Part p={[0, 0.25, 0]} s={[0.5, 0.26, 0.34]} m={lam(C.sky)} />
      <Part p={[0, 0.39, 0]} s={[0.54, 0.03, 0.38]} m={lam(C.white)} />
      {[-0.17, 0.17].map((x) => (
        <mesh key={x} geometry={G.cyl} material={lam(C.dark)} position={[x, 0.09, 0.18]} rotation={[Math.PI / 2, 0, 0]} scale={[0.08, 0.03, 0.08]} />
      ))}
      <Cyl p={[0.18, 0.8, 0]} r={0.015} h={0.8} m={lam(C.white)} cast={false} />
      <mesh geometry={G.cone} material={stripeMat(C.lemon, C.white, 6)} position={[0.18, 1.22, 0]} scale={[0.36, 0.16, 0.36]} castShadow />
      <group ref={cluster} position={[-0.1, 0.4, 0]}>
        {balloons.map((b, i) => (
          <group key={i}>
            <Beam a={[0, 0, 0]} b={[b.p[0], b.p[1] - 0.4 - 0.13, b.p[2]]} r={0.005} m={lam(C.white)} />
            <mesh geometry={G.ball} material={lam(b.c)} position={[b.p[0], b.p[1] - 0.4, b.p[2]]} scale={[0.11, 0.13, 0.11]} castShadow />
          </group>
        ))}
      </group>
      <group ref={loose}>
        <mesh geometry={G.ball} material={lam(C.hot)} scale={[0.11, 0.13, 0.11]} />
        <mesh geometry={G.cyl8} material={lam(C.white)} position={[0, -0.28, 0]} scale={[0.005, 0.32, 0.005]} />
      </group>
    </group>
  )
}

function Stall({ kind, p, face }: (typeof STALLS)[number]) {
  const col = kind === 'ice' ? C.sky : kind === 'pop' ? C.hot : C.lilac
  const label = kind === 'ice' ? '冰淇淋' : kind === 'pop' ? '爆米花' : '棉花糖'
  const sign = useMemo(() => signMat(signTex(label, col)), [label, col])
  return (
    <group position={[p[0], 0.03, p[1]]} rotation={[0, face, 0]}>
      <Part p={[0, 0.27, 0]} s={[0.78, 0.54, 0.6]} m={lam(C.cream)} />
      <Part p={[0, 0.3, 0.31]} s={[0.78, 0.08, 0.04]} m={lam(col)} cast={false} />
      <Part p={[0, 0.56, 0.18]} s={[0.84, 0.04, 0.24]} m={lam(C.white)} />
      <mesh geometry={G.box} material={stripeMat(col, C.white, 5)} position={[0, 0.82, 0.24]} rotation={[0.5, 0, 0]} scale={[0.86, 0.03, 0.42]} castShadow />
      <Part p={[0, 0.72, -0.18]} s={[0.84, 0.32, 0.3]} m={lam(C.cream)} />
      <mesh geometry={G.box} material={sign} position={[0, 1.06, -0.1]} scale={[0.68, 0.18, 0.03]} />
      {kind === 'ice' && (
        <group position={[0.0, 1.2, -0.1]}>
          <mesh geometry={G.cone} material={lam('#e8b07a')} position={[0, 0.06, 0]} rotation={[Math.PI, 0, 0]} scale={[0.07, 0.16, 0.07]} />
          <mesh geometry={G.ball} material={lam(C.pink)} position={[0, 0.18, 0]} scale={0.085} />
          <mesh geometry={G.ball} material={lam(C.mint)} position={[0, 0.29, 0]} scale={0.07} />
        </group>
      )}
      {kind === 'pop' && (
        <group position={[0, 1.2, -0.1]}>
          <mesh geometry={G.cyl} material={stripeMat(C.hot, C.white, 4)} position={[0, 0.08, 0]} scale={[0.09, 0.16, 0.09]} />
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} geometry={G.ball} material={lam('#fff3c4')} position={[Math.cos(i * 1.3) * 0.05, 0.18 + (i % 2) * 0.03, Math.sin(i * 1.3) * 0.05]} scale={0.045} />
          ))}
        </group>
      )}
      {kind === 'candy' && (
        <group position={[0, 1.18, -0.1]}>
          <Cyl p={[0, 0.06, 0]} r={0.01} h={0.14} m={lam(C.white)} />
          <mesh geometry={G.ball} material={lam('#ffc4dc')} position={[0, 0.2, 0]} scale={[0.12, 0.11, 0.12]} />
        </group>
      )}
    </group>
  )
}

function Gate() {
  const sign = useMemo(() => signMat(signTex('糖果乐园', C.hot)), [])
  const archPts = useMemo(() => {
    const out: V3[] = []
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI
      out.push([Math.cos(a) * 0.95, 1.55 + Math.sin(a) * 0.32, GATE_Z + 0.12])
    }
    return out
  }, [])
  return (
    <group>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.98, 0, GATE_Z]}>
          <Cyl p={[0, 0.75, 0]} r={0.2} h={1.5} m={stripeMat(C.pink, C.white, 6)} />
          <mesh geometry={G.cone} material={lam(C.hot)} position={[0, 1.78, 0]} scale={[0.27, 0.48, 0.27]} castShadow />
          <mesh geometry={G.ball} material={lam(C.lemon)} position={[0, 2.06, 0]} scale={0.06} />
          {/* ticket booth */}
          <group position={[sx * 0.62, 0, 0.1]}>
            <Part p={[0, 0.3, 0]} s={[0.46, 0.6, 0.46]} m={lam(C.cream)} />
            <Part p={[0, 0.34, 0.235]} s={[0.3, 0.2, 0.02]} m={lam('#b8dbf0')} cast={false} />
            <mesh geometry={G.cone} material={lam(C.mint)} position={[0, 0.74, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.4, 0.28, 0.4]} castShadow />
          </group>
        </group>
      ))}
      <mesh position={[0, 1.55, GATE_Z]} rotation={[0, 0, 0]} material={lam(C.hot)} castShadow>
        <torusGeometry args={[0.98, 0.07, 8, 40, Math.PI]} />
      </mesh>
      <mesh geometry={G.box} material={sign} position={[0, 1.92, GATE_Z + 0.04]} scale={[1.2, 0.3, 0.05]} />
      {/* turnstiles */}
      {[-0.35, 0, 0.35].map((x) => (
        <Part key={x} p={[x, 0.16, GATE_Z]} s={[0.06, 0.32, 0.3]} m={lam(C.steel)} />
      ))}
      <Bulbs pts={archPts} colors={WARM_COLS} size={0.035} glow={0.42} />
    </group>
  )
}

/* ================================================================== string lights */
function StringLights() {
  const { pts, poles } = useMemo(() => {
    const poles: V3[] = []
    const pts: V3[] = []
    const H = 1.25
    const zs = [1.85, 3.0, 4.15, 5.05]
    for (const sx of [-1, 1]) zs.forEach((z) => poles.push([sx * 0.74, H, z]))
    for (const sx of [-1, 1]) for (let i = 0; i < zs.length - 1; i++) pts.push(...catenary([sx * 0.74, H, zs[i]], [sx * 0.74, H, zs[i + 1]], 0.16, 6))
    for (let i = 0; i < zs.length; i++) pts.push(...catenary([-0.74, H, zs[i]], [0.74, H, zs[i]], 0.2, 6))
    const ring = [18, 66, 118, 166, 202, 250, 288, 322].map((d) => (d * Math.PI) / 180)
    const ringP = ring.map((a) => [Math.cos(a) * 1.72, H, Math.sin(a) * 1.72] as V3)
    poles.push(...ringP)
    for (let i = 0; i < ringP.length; i++) pts.push(...catenary(ringP[i], ringP[(i + 1) % ringP.length], 0.18, 6))
    // coaster path
    const ex = [1.9, 3.0, 4.1]
    ex.forEach((x) => poles.push([x, H, 0.5]))
    for (let i = 0; i < ex.length - 1; i++) pts.push(...catenary([ex[i], H, 0.5], [ex[i + 1], H, 0.5], 0.16, 6))
    // ferris path
    const fw = [1.9, 2.9].map((d) => [-fAx[0] * d - fLat[0] * 0.62, H, -fAx[1] * d - fLat[1] * 0.62] as V3)
    poles.push(...fw)
    pts.push(...catenary(fw[0], fw[1], 0.16, 6))
    return { pts, poles }
  }, [])
  const poleRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    poles.forEach((p, i) => poleRef.current!.setMatrixAt(i, m.makeScale(0.02, p[1], 0.02).setPosition(p[0], p[1] / 2, p[2])))
    poleRef.current!.instanceMatrix.needsUpdate = true
    poleRef.current!.computeBoundingSphere()
  }, [poles])
  return (
    <group>
      <instancedMesh ref={poleRef} args={[G.cyl8, lam(C.steel), poles.length]} castShadow />
      <Bulbs pts={pts} colors={BULB_COLS} size={0.032} glow={0.42} />
    </group>
  )
}

/* ================================================================== crowd */
function Crowd() {
  const { sim } = useContext(ParkCtx)
  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const balls = useRef<THREE.InstancedMesh>(null)
  const strings = useRef<THREE.InstancedMesh>(null)
  const bodyGeo = useMemo(() => new THREE.CapsuleGeometry(0.055, 0.1, 3, 10), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), col: new THREE.Color() }), [])
  const ballColorSet = useRef<number[]>([])

  useLayoutEffect(() => {
    const c = new THREE.Color()
    for (let i = 0; i < MAX_P; i++) {
      bodies.current!.setColorAt(i, c.set(SHIRTS[Math.floor(rnd(i * 9.7) * SHIRTS.length)]))
      heads.current!.setColorAt(i, c.set(SKIN[Math.floor(rnd(i * 3.3) * SKIN.length)]))
      balls.current!.setColorAt(i, c.set(C.hot))
    }
    bodies.current!.instanceColor!.needsUpdate = true
    heads.current!.instanceColor!.needsUpdate = true
    balls.current!.instanceColor!.needsUpdate = true
  }, [])

  useFrame((state, dt) => {
    dt = Math.min(dt, 1 / 30)
    sim.update(dt)
    const t = state.clock.elapsedTime
    const { m, q, e, p, s, col } = tmp
    let colDirty = false
    sim.people.forEach((pp, i) => {
      const vis = pp.st !== St.Off && pp.st !== St.Ride
      const k = pp.kid ? 0.9 : 1.2
      const bob = pp.moving ? Math.abs(Math.sin(t * 10 + pp.phase)) * 0.025 : 0
      if (!vis) s.set(0, 0, 0)
      else s.set(k, k, k)
      e.set(0, pp.head, pp.moving ? Math.sin(t * 10 + pp.phase) * 0.06 : 0)
      q.setFromEuler(e)
      p.set(pp.x, 0.03 + (0.11 + bob) * k, pp.z)
      m.compose(p, q, s)
      bodies.current!.setMatrixAt(i, m)
      p.y = 0.03 + (0.245 + bob) * k
      m.compose(p, q, vis ? s.set(0.058 * k, 0.058 * k, 0.058 * k) : s.set(0, 0, 0))
      heads.current!.setMatrixAt(i, m)
      const hb = vis && pp.balloon >= 0
      // balloon on a string, bobbing above a hand
      const hx = pp.x + Math.cos(pp.head) * 0.08 * k
      const hz = pp.z - Math.sin(pp.head) * 0.08 * k
      const sway = Math.sin(t * 1.6 + pp.phase) * 0.03
      p.set(hx + sway, 0.03 + 0.62 * k + Math.sin(t * 2 + pp.phase) * 0.015, hz)
      m.compose(p, q.identity(), hb ? s.set(0.075, 0.09, 0.075) : s.set(0, 0, 0))
      balls.current!.setMatrixAt(i, m)
      p.set(hx + sway / 2, 0.03 + 0.38 * k, hz)
      m.compose(p, q, hb ? s.set(0.004, 0.36 * k, 0.004) : s.set(0, 0, 0))
      strings.current!.setMatrixAt(i, m)
      if (hb && ballColorSet.current[i] !== pp.balloon) {
        ballColorSet.current[i] = pp.balloon
        balls.current!.setColorAt(i, col.set(CANDY[pp.balloon]))
        colDirty = true
      }
    })
    bodies.current!.instanceMatrix.needsUpdate = true
    heads.current!.instanceMatrix.needsUpdate = true
    balls.current!.instanceMatrix.needsUpdate = true
    strings.current!.instanceMatrix.needsUpdate = true
    if (colDirty) balls.current!.instanceColor!.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={bodies} args={[bodyGeo, lam('#ffffff'), MAX_P]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[G.ball, lam('#ffffff'), MAX_P]} castShadow frustumCulled={false} />
      <instancedMesh ref={balls} args={[G.ball, lam('#ffffff'), MAX_P]} frustumCulled={false} />
      <instancedMesh ref={strings} args={[G.cyl8, lam(C.white), MAX_P]} frustumCulled={false} />
    </>
  )
}

/* ================================================================== fireworks */
const FW_N = 4
const FW_SPARKS = 44
function Fireworks({ night }: { night: MotionValue<number> }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => createGlowMaterial(1), [])
  const st = useMemo(
    () =>
      Array.from({ length: FW_N }, (_, i) => ({
        t: -1 - i * 1.3,
        o: new THREE.Vector3(),
        col: new THREE.Color(),
        v: Array.from({ length: FW_SPARKS }, () => new THREE.Vector3()),
      })),
    [],
  )
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), p: new THREE.Vector3() }), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current
    if (!g) return
    const n = night.get()
    mat.uniforms.uIntensity.value = 1.4
    const on = n > 0.75 && !POSTER
    const { m, c, p } = tmp
    st.forEach((f, k) => {
      f.t += dt
      if (f.t > 3.2) {
        if (!on) {
          f.t = -0.5 - Math.random() * 2
        } else {
          f.t = 0
          f.o.set(-4 + Math.random() * 8, 7 + Math.random() * 2.2, -6 + Math.random() * 3)
          f.col.set(['#ff7aa2', '#ffd66b', '#8ce6cf', '#9fd2ff', '#c7a6ff'][Math.floor(Math.random() * 5)])
          for (const v of f.v) v.randomDirection().multiplyScalar(1.6 + Math.random() * 0.5)
        }
      }
      for (let i = 0; i < FW_SPARKS; i++) {
        const idx = k * (FW_SPARKS + 1) + i
        const tt = f.t - 0.9
        let sc = 0
        if (f.t >= 0 && tt > 0) {
          const drag = 1 - Math.exp(-2.2 * tt)
          p.copy(f.v[i]).multiplyScalar(drag / 2.2).add(f.o)
          p.y -= 0.55 * tt * tt
          const life = 1 - tt / 2.3
          sc = life > 0 ? 0.32 * life : 0
          c.copy(f.col).multiplyScalar(Math.max(0, life) * (0.7 + 0.3 * Math.sin(tt * 30 + i)))
        } else c.setRGB(0, 0, 0)
        m.makeScale(sc, sc, sc).setPosition(p)
        g.setMatrixAt(idx, m)
        g.setColorAt(idx, c)
      }
      // the rocket trail
      const ridx = k * (FW_SPARKS + 1) + FW_SPARKS
      if (f.t >= 0 && f.t < 0.9) {
        const u = f.t / 0.9
        p.set(f.o.x, lerp(0.5, f.o.y, 1 - (1 - u) * (1 - u)), f.o.z)
        m.makeScale(0.28, 0.28, 0.28).setPosition(p)
        c.set('#fff2cf')
      } else {
        m.makeScale(0, 0, 0)
        c.setRGB(0, 0, 0)
      }
      g.setMatrixAt(ridx, m)
      g.setColorAt(ridx, c)
    })
    g.instanceMatrix.needsUpdate = true
    g.instanceColor!.needsUpdate = true
  })
  useLayoutEffect(() => {
    const g = ref.current!
    const m = new THREE.Matrix4().makeScale(0, 0, 0)
    const c = new THREE.Color(0, 0, 0)
    for (let i = 0; i < g.count; i++) {
      g.setMatrixAt(i, m)
      g.setColorAt(i, c)
    }
  }, [])
  return <instancedMesh ref={ref} args={[quadGeo, mat, FW_N * (FW_SPARKS + 1)]} frustumCulled={false} renderOrder={6} />
}

/* ================================================================== clouds */
function Cloud({ p, s = 1, speed = 0.12 }: { p: V3; s?: number; speed?: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((st) => {
    if (!ref.current) return
    const t = st.clock.elapsedTime * speed
    ref.current.position.x = p[0] + Math.sin(t) * 1.4
    ref.current.position.z = p[2] - Math.sin(t) * 1.4
  })
  const m = lam('#ffffff')
  return (
    <group ref={ref} position={p} scale={s}>
      <mesh geometry={G.ball} material={m} scale={[0.9, 0.5, 0.7]} />
      <mesh geometry={G.ball} material={m} position={[0.7, -0.1, 0.1]} scale={[0.6, 0.38, 0.5]} />
      <mesh geometry={G.ball} material={m} position={[-0.7, -0.12, 0]} scale={[0.55, 0.34, 0.45]} />
    </group>
  )
}

/* ================================================================== lighting */
const DAY = { amb: new THREE.Color('#fff4f2'), sky: new THREE.Color('#ffffff'), ground: new THREE.Color('#e9cde6'), sun: new THREE.Color('#fff0e0') }
const NIGHT = { amb: new THREE.Color('#6f6bb0'), sky: new THREE.Color('#8681cc'), ground: new THREE.Color('#2b2552'), sun: new THREE.Color('#b0b8ff') }
function Lighting({ night }: { night: MotionValue<number> }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const warm = useRef<THREE.PointLight>(null)
  const warm2 = useRef<THREE.PointLight>(null)
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff0e0', 1.5)
    l.position.set(6, 12, 4)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -10
    cam.right = cam.top = 10
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.025
    return l
  }, [])
  useFrame(() => {
    const n = night.get()
    amb.current!.color.lerpColors(DAY.amb, NIGHT.amb, n)
    amb.current!.intensity = lerp(1.38, 0.95, n)
    hemi.current!.color.lerpColors(DAY.sky, NIGHT.sky, n)
    hemi.current!.groundColor.lerpColors(DAY.ground, NIGHT.ground, n)
    hemi.current!.intensity = lerp(0.7, 0.6, n)
    sun.color.lerpColors(DAY.sun, NIGHT.sun, n)
    sun.intensity = lerp(1.55, 0.5, n)
    sun.position.set(lerp(6, -4, n), 12, lerp(4, 7, n))
    const lights = smooth(clamp01((n - 0.15) / 0.55))
    warm.current!.intensity = lights * 9
    warm2.current!.intensity = lights * 6
    glowMat.uniforms.uIntensity.value = lights * 1.15
    bulbMat.color.setScalar(lerp(0.88, 1, lights))
    for (const m of signMats) m.emissiveIntensity = lights * 0.75
  })
  return (
    <>
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <primitive object={sun} />
      <pointLight ref={warm} position={[0, 1.6, 1.6]} color="#ffb877" distance={7.5} decay={1.4} intensity={0} />
      <pointLight ref={warm2} position={[-3.5, 1.3, 2.55]} color="#ffc4dd" distance={5} decay={1.4} intensity={0} />
    </>
  )
}

/* ================================================================== ride cam (spring zoom on top of IsoRig) */
const FIT = 23.5
const MOBILE_FIT = 18
const BASE_TARGET: V3 = [0.2, 0.9, 0]
function RideCam({ zoom, tx, ty, tz }: { zoom: MotionValue<number>; tx: MotionValue<number>; ty: MotionValue<number>; tz: MotionValue<number> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  useFrame(() => {
    const f = size.width < 760 ? MOBILE_FIT : FIT
    const base = Math.min(size.width, size.height * 1.25) / f
    camera.zoom = base * zoom.get()
    camera.position.set(tx.get() + 60, ty.get() + 60, tz.get() + 60)
    camera.updateProjectionMatrix()
  })
  return null
}

/** pins the stats card to a world point */
function LabelAnchor({ pos, el }: { pos: React.RefObject<V3 | null>; el: React.RefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    const p = pos.current
    const e = el.current
    if (!p || !e) return
    v.set(p[0], p[1], p[2]).project(camera)
    const x = (v.x * 0.5 + 0.5) * size.width
    const y = (-v.y * 0.5 + 0.5) * size.height
    e.style.transform = `translate3d(${Math.min(size.width - 120, Math.max(120, x)).toFixed(1)}px, ${Math.max(150, y).toFixed(1)}px, 0)`
  })
  return null
}

function Scene({ onReady }: { onReady: () => void }) {
  useScreenWarmup(onReady)
  const root = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (root.current) root.current.position.y = Math.sin(s.clock.elapsedTime * 0.6) * 0.08
  })
  return (
    <group ref={root}>
      <Plot />
      <Trees />
      <FerrisWheel />
      <Coaster />
      <Carousel />
      <SwingRide />
      <BalloonStand />
      {STALLS.map((s) => (
        <Stall key={s.kind} {...s} />
      ))}
      <Gate />
      <StringLights />
      <Crowd />
    </group>
  )
}

/* ================================================================== stats card */
function RideCard({ sel, sim }: { sel: RideId | null; sim: ParkSim }) {
  const [stats, setStats] = useState<{ q: number; wait: number; extra: string } | null>(null)
  useEffect(() => {
    if (!sel) return
    const read = () => {
      const s = sim.stats(sel)
      const extra =
        sel === 'coaster'
          ? `时速 ${Math.round(sim.coasterV * 5 * 3.6)} km/h · ${sim.running.coaster ? '运行中' : '上客中'}`
          : sel === 'ferris'
            ? '高 32 m · 转一圈 36 秒'
            : sel === 'carousel'
              ? `${sim.running.carousel ? '运行中' : '上客中'} · 8 匹木马`
              : `${sim.running.swing ? '运行中' : '上客中'} · 12 个座位`
      setStats({ ...s, extra })
    }
    read()
    const id = setInterval(read, 250)
    return () => clearInterval(id)
  }, [sel, sim])
  return (
    <AnimatePresence>
      {sel && stats && (
        <motion.div
          key={sel}
          className="ap-card"
          initial={{ opacity: 0, y: 10, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.95, transition: { duration: 0.18 } }}
          transition={{ type: 'spring', stiffness: 480, damping: 30, delay: 0.25 }}
        >
          <b>{RIDES[sel].name}</b>
          <span className="ap-q">
            排队 <em>{stats.q}</em> 人 · 等待 <em>{stats.wait}</em> 分钟
          </span>
          <span className="ap-x">{stats.extra}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ================================================================== page */
const COUNTS = [
  { value: 40, label: '40' },
  { value: 60, label: '60' },
  { value: 80, label: '80' },
]
const TOUR: { mode?: 'day' | 'night'; ride: RideId | null; t: number }[] = [
  { mode: 'day', ride: null, t: 8 },
  { ride: 'coaster', t: 7 },
  { ride: null, t: 4 },
  { mode: 'night', ride: null, t: 8 },
  { ride: 'ferris', t: 6 },
  { ride: null, t: 5 },
  { ride: 'carousel', t: 6 },
  { ride: null, t: 4 },
]

export default function AmusementPark() {
  const night = useMotionValue(0)
  const [mode, setMode] = useState<'day' | 'night'>('day')
  const [count, setCount] = useState(60)
  const [sel, setSel] = useState<RideId | null>(null)
  const [ready, setReady] = useState(false)
  const sim = useMemo(() => new ParkSim(60), [])
  const lastTouch = useRef(POSTER ? 0 : -1e9)
  const labelPos = useRef<V3 | null>(null)
  const anchor = useRef<HTMLDivElement>(null)

  const spring = { stiffness: 90, damping: 20, mass: 1 }
  const zoom = useSpring(1, spring)
  const tx = useSpring(BASE_TARGET[0], spring)
  const ty = useSpring(BASE_TARGET[1], spring)
  const tz = useSpring(BASE_TARGET[2], spring)

  useEffect(() => {
    const ctl = animate(night, mode === 'night' ? 1 : 0, { duration: 2.4, ease: [0.45, 0, 0.25, 1] })
    return () => ctl.stop()
  }, [mode, night])
  useEffect(() => void (sim.target = count), [count, sim])

  useEffect(() => {
    const r = sel ? RIDES[sel] : null
    zoom.set(r ? r.zoom : 1)
    tx.set(r ? r.focus[0] : BASE_TARGET[0])
    ty.set(r ? r.focus[1] : BASE_TARGET[1])
    tz.set(r ? r.focus[2] : BASE_TARGET[2])
    labelPos.current = r ? r.label : null
  }, [sel, zoom, tx, ty, tz])

  const touch = useCallback(() => void (lastTouch.current = performance.now()), [])
  const pick = useCallback(
    (id: RideId) => {
      touch()
      setSel((s) => (s === id ? null : id))
    },
    [touch],
  )

  // idle director: day → follow the coaster → night → ferris wheel → carousel …
  useEffect(() => {
    if (POSTER) return
    let step = 0
    let left = 6
    const id = setInterval(() => {
      if (document.hidden || performance.now() - lastTouch.current < 16000) return
      left -= 0.5
      if (left > 0) return
      step = (step + 1) % TOUR.length
      const s = TOUR[step]
      if (s.mode) setMode(s.mode)
      setSel(s.ride)
      left = s.t
    }, 500)
    return () => clearInterval(id)
  }, [])
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const ctx = useMemo<Ctx>(() => ({ sim, night, pick }), [sim, night, pick])
  const onReady = useCallback(() => setReady(true), [])
  const scene = useMemo(
    () => (
      <ParkCtx.Provider value={ctx}>
        <Scene onReady={onReady} />
      </ParkCtx.Provider>
    ),
    [ctx, onReady],
  )
  const isNight = mode === 'night'

  return (
    <div className={`stage ap-root${isNight ? ' ap-night' : ''}${sel ? ' ap-zoomed' : ''}`} style={{ background: 'linear-gradient(180deg, #f7f2fc 0%, #f3eaf8 52%, #fbe4ee 100%)' }}>
      <div aria-hidden className="ap-sun" />
      <motion.div aria-hidden className="ap-sky-night" style={{ opacity: night }}>
        <div className="ap-stars" />
      </motion.div>

      <motion.div className="ap-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.6 }}>
        <Canvas
          orthographic
          flat
          shadows="percentage"
          dpr={[1, 2]}
          camera={{ near: 0.1, far: 300 }}
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => {
            if (sel) {
              touch()
              setSel(null)
            }
          }}
        >
          <IsoRig fit={FIT} mobileFit={MOBILE_FIT} mobileOffsetY={0.12} offset={[0.2, -0.035]} target={BASE_TARGET} />
          <RideCam zoom={zoom} tx={tx} ty={ty} tz={tz} />
          <Lighting night={night} />
          {scene}
          <Fireworks night={night} />
          <Cloud p={[-6, 3.2, 5]} s={1.0} />
          <Cloud p={[7, 4.6, -4]} s={0.8} speed={0.09} />
          <Cloud p={[4, -3.8, 8]} s={1.2} speed={0.1} />
          <LabelAnchor pos={labelPos} el={anchor} />
        </Canvas>
      </motion.div>

      <div ref={anchor} className="ap-anchor" aria-live="polite">
        <RideCard sel={sel} sim={sim} />
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#ff5d8f' }} /> Isometric · Crowd sim
          </p>
          <h1>
            糖果色
            <br />
            小游乐园
          </h1>
          <p>
            <span className="ap-long">摩天轮匀速转，吊舱始终朝上；过山车被链条拖上坡，再按能量守恒俯冲。</span>
            {count} 位小游客各自挑项目、排队、上车、散场。点任意设施，镜头会跟过去报出排队人数。
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => pick('coaster')}>
              跟拍过山车
            </button>
            <button
              className="btn"
              onClick={() => {
                touch()
                setMode(isNight ? 'day' : 'night')
              }}
            >
              {isNight ? '天亮了' : '入夜'}
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'day', label: '白天' },
              { value: 'night', label: '夜晚' },
            ]}
            value={mode}
            onChange={(v) => {
              touch()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <span className="ap-dock-label">游客</span>
          <Seg
            items={COUNTS}
            value={count}
            onChange={(v) => {
              touch()
              setCount(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={sel === null}
            onClick={() => {
              touch()
              setSel(null)
            }}
          >
            <span>全览</span>
          </button>
        </div>
        <p className="hint">点击设施 · 镜头跟拍并显示排队</p>
      </div>

      <style>{`
        .ap-root { --soft-bg: #f6eefa; }
        .ap-root .hero-copy h1, .ap-root .hero-copy p, .ap-root .hint { transition: color .8s ease; }
        .ap-night { --fg: #fbf3ff; --fg-2: rgba(251,243,255,.68); --glass: rgba(36,30,72,.55); --glass-line: rgba(255,255,255,.1); --soft-bg: #221c4a; }
        .ap-night .btn.primary { color: #221c4a; }
        .ap-canvas { position: absolute; inset: 0; }
        .ap-root .scrim { transition: opacity .6s; }
        .ap-zoomed .scrim { opacity: 1; background: radial-gradient(closest-side, var(--soft-bg) 0%, color-mix(in srgb, var(--soft-bg) 88%, transparent) 55%, transparent 100%); }
        .ap-sun { position: absolute; right: 14%; top: 10%; width: min(32vw, 420px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, #fff6dc 0%, #ffeedd 42%, transparent 70%); }
        .ap-sky-night { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, #17143a 0%, #2a2160 52%, #4a3274 100%); }
        .ap-stars { position: absolute; inset: 0; opacity: .85;
          background-image: radial-gradient(1.4px 1.4px at 12% 18%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 28% 9%, #fff 50%, transparent 51%),
            radial-gradient(1.2px 1.2px at 47% 22%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 66% 12%, #fff 50%, transparent 51%),
            radial-gradient(1.6px 1.6px at 83% 26%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 92% 8%, #fff 50%, transparent 51%),
            radial-gradient(1.1px 1.1px at 57% 36%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 8% 42%, #fff 50%, transparent 51%),
            radial-gradient(1.3px 1.3px at 38% 48%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 74% 44%, #fff 50%, transparent 51%); }
        .ap-anchor { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
        .ap-card { position: absolute; left: 0; bottom: 12px; translate: -50% 0; display: flex; flex-direction: column; align-items: center; gap: 5px;
          padding: 10px 16px 9px; border-radius: 16px; background: rgba(255,255,255,.94); color: #2a2238; white-space: nowrap; transform-origin: 50% 100%;
          box-shadow: 0 14px 30px -12px rgba(80,40,90,.45), inset 0 0 0 1px rgba(0,0,0,.05); font-family: var(--sans); }
        .ap-card b { font-size: 15px; font-weight: 600; }
        .ap-q { font-size: 13px; color: #4b4258; }
        .ap-q em { font: 600 15px/1 var(--mono); font-style: normal; color: #ff4f86; font-variant-numeric: tabular-nums; }
        .ap-x { font: 11px/1 var(--mono); color: #8a809a; font-variant-numeric: tabular-nums; }
        .ap-dock-label { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 6px; }
        @media (max-width: 760px) {
          .ap-long { display: none; }
          .ap-root .hero-copy > p:not(.kicker) { font-size: 14px; line-height: 1.6; margin-top: 12px; }
          .ap-root .hero-actions { margin-top: 16px; }
          .ap-sun { right: 2%; top: 8%; width: 52vw; }
          .ap-root .seg { padding: 0 11px; }
          .ap-dock-label { display: none; }
        }
      `}</style>
    </div>
  )
}
