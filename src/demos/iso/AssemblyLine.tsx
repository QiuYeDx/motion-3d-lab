import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ==================================================================== layout
   An L-shaped line: segment A runs along +x, a turntable turns it, segment B runs along +z towards the loading dock.
   Every item lives on a 1-D belt coordinate s ∈ [0, L]. */
const BELT_Y = 0.62
const GAP = 0.95 // min distance between item centres on the belt
const AX0 = -6.6
const CX = 3.6
const CZ = -2.6
const BZ1 = 4.4
const LEN_A = CX - AX0
const L = LEN_A + (BZ1 - CZ)
const SPAWN_S = 0.35
const STATION_S = [2.6, 6.2, 12.2, 15.0]
const BASE_T = [0.85, 1.0, 1.15, 0.7] // seconds per job at tempo 1 — 装箱 is the bottleneck
const MAXI = 44
const DROP_T = 0.45
const DROP_H = 0.95
const FLY_T = 0.55
const TRUCK_Z = 6.0
const DOCK_X = CX + 0.2
const X_IN = -3.6
const X_OUT = 11.5
const ARR_T = 1.9
const LEAVE_T = 1.9
const BED_Y = 0.55
const SLOTS: [number, number][] = [
  [-0.88, 0.34],
  [-0.2, 0.34],
  [0.48, 0.34],
  [-0.88, -0.34],
  [-0.2, -0.34],
  [0.48, -0.34],
]
const FLOOR = { x0: -8.2, x1: 7.3, z0: -5.2, z1: 7.6 }
/** the slab is an L: a wide back hall (z < NOTCH_Z) plus the loading yard in front (x > NOTCH_X) */
const NOTCH_X = 0.8
const NOTCH_Z = 0.6
const RAW_Y = 1.32
const RAW_X = 0.86

const MACH = [
  { zh: '冲压', en: 'build', top: 3.45 },
  { zh: '喷漆', en: 'lint', top: 2.6 },
  { zh: '装箱', en: 'package', top: 2.95 },
  { zh: '贴标', en: 'tag', top: 2.75 },
].map((m, k) => {
  const s = STATION_S[k]
  return { ...m, x: s <= LEN_A ? AX0 + s : CX, z: s <= LEN_A ? CZ : CZ + (s - LEN_A) }
})
const MODE_ZH = ['正常', '加速', '故障']

/* states */
const DROP = 0
const BELT = 1
const FLY = 2
const LOADED = 3
const T_IDLE = 0
const T_ARRIVE = 1
const T_DOCK = 2
const T_LEAVE = 3

/* palette */
const PAINT = ['#ff6b5a', '#3a8dff', '#ffc53d', '#8b6cff', '#1fbf8f', '#ff6fb1'].map((c) => new THREE.Color(c))
const RAW = new THREE.Color('#7f8a9c')
const PRESSED = new THREE.Color('#d0d6df')
const COL = {
  floor: '#eef1f5',
  steel: '#d3d9e2',
  steel2: '#bcc4d0',
  dark: '#3c4454',
  rubber: '#3a4150',
  rail: '#ffc83d',
  press: '#ff8a4c',
  paint: '#4a90f0',
  box: '#2fb592',
  label: '#f2677a',
  card: '#d9a86c',
  card2: '#c48f53',
  white: '#f8f9fb',
}

/* ==================================================================== helpers */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeIn = (u: number) => u * u * u
const easeOut = (u: number) => 1 - (1 - u) ** 3
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)
const backOut = (u: number, s = 1.6) => {
  const q = u - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const _xz = { x: 0, z: 0 }
function pathXZ(s: number) {
  if (s <= LEN_A) {
    _xz.x = AX0 + s
    _xz.z = CZ
  } else {
    _xz.x = CX
    _xz.z = CZ + (s - LEN_A)
  }
  return _xz
}
/** press head bottom height above the belt for job progress p */
function pressH(p: number) {
  const REST = 1.2
  const UP = 1.42
  const LOW = 0.42
  const HOLD = 0.5
  if (p < 0.2) return REST + (UP - REST) * easeOut(p / 0.2)
  if (p < 0.3) return UP + (LOW - UP) * easeIn((p - 0.2) / 0.1)
  if (p < 0.4) return LOW + (HOLD - LOW) * easeOut((p - 0.3) / 0.1)
  if (p < 0.58) return HOLD
  return HOLD + (REST - HOLD) * easeInOut((p - 0.58) / 0.42)
}
/** label stamp height above the box top */
function stampH(p: number) {
  const REST = 0.5
  if (p < 0.3) return REST * (1 - easeIn(p / 0.3))
  if (p < 0.42) return 0
  return REST * easeOut((p - 0.42) / 0.58)
}

/* ==================================================================== simulation (plain mutable state, deterministic) */
type Item = { alive: boolean; s: number; stage: number; state: number; t: number; product: number; color: number; truck: number; slot: number }
type Machine = { mode: number; busy: number; p: number; smokeAcc: number; faultAge: number; mistAcc: number }
type Truck = { phase: number; t: number; x: number; assigned: number; landed: number; dist: number; speed: number; livery: number }
type Particle = { alive: boolean; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: THREE.Color }

function makeSim() {
  const rng = mulberry32(20241014)
  const items: Item[] = Array.from({ length: MAXI }, () => ({ alive: false, s: 0, stage: 0, state: 0, t: 0, product: 0, color: 0, truck: 0, slot: 0 }))
  const line: number[] = []
  const machines: Machine[] = MACH.map(() => ({ mode: 0, busy: -1, p: 0, smokeAcc: 0, faultAge: 0, mistAcc: 0 }))
  const trucks: Truck[] = [
    { phase: T_ARRIVE, t: 0, x: X_IN, assigned: 0, landed: 0, dist: 0, speed: 0, livery: 0 },
    { phase: T_IDLE, t: 0, x: X_IN, assigned: 0, landed: 0, dist: 0, speed: 0, livery: 1 },
  ]
  const mkP = (): Particle => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, color: new THREE.Color() })
  const mist = Array.from({ length: 90 }, mkP)
  const smoke = Array.from({ length: 60 }, mkP)
  const ships = new Float64Array(160).fill(-1e9)
  let mistHead = 0
  let smokeHead = 0
  let shipHead = 0

  const sim = {
    items,
    line,
    machines,
    trucks,
    mist,
    smoke,
    time: 0,
    beltPos: 0,
    tempo: 1,
    product: 0,
    colorSeq: 0,
    lastSpawn: -10,
    lastFly: -10,
    shipped: 0,
    hopperKick: 0,
    nozzle: 0,
    dur(k: number) {
      return BASE_T[k] / sim.tempo / (machines[k].mode === 1 ? 2.2 : 1)
    },
    rate() {
      const W = 20
      let n = 0
      for (let i = 0; i < ships.length; i++) if (sim.time - ships[i] <= W) n++
      return Math.round((n / Math.min(W, Math.max(4, sim.time))) * 60)
    },
    freeTruck(i: number) {
      for (const it of items) if (it.alive && it.truck === i && (it.state === LOADED || it.state === FLY)) it.alive = false
    },
    emitMist() {
      const p = mist[mistHead]
      mistHead = (mistHead + 1) % mist.length
      const m = MACH[1]
      const a = sim.nozzle
      // nozzle tip: pivot under the hood, 0.5 long, swinging across the belt (around x)
      p.alive = true
      p.x = m.x + (rng() - 0.5) * 0.06
      p.y = 1.96 - 0.5 * Math.cos(a)
      p.z = m.z - 0.5 * Math.sin(a)
      const sp = 1.6 + rng() * 0.8
      p.vx = (rng() - 0.5) * 0.9
      p.vy = -Math.cos(a) * sp
      p.vz = -Math.sin(a) * sp + (rng() - 0.5) * 0.5
      p.life = 0
      p.max = 0.45 + rng() * 0.3
      p.size = 0.6 + rng() * 0.6
      const it = machines[1].busy >= 0 ? items[machines[1].busy] : null
      p.color.copy(it ? PAINT[it.color] : PAINT[0])
    },
    emitSmoke(k: number, burst = false) {
      const p = smoke[smokeHead]
      smokeHead = (smokeHead + 1) % smoke.length
      const m = MACH[k]
      p.alive = true
      p.x = m.x + (rng() - 0.5) * 0.5
      p.y = m.top - 0.55 + rng() * 0.2
      p.z = m.z + (rng() - 0.5) * 0.5
      p.vx = (rng() - 0.5) * (burst ? 1.2 : 0.35)
      p.vy = 0.55 + rng() * 0.45
      p.vz = (rng() - 0.5) * (burst ? 1.2 : 0.35)
      p.life = 0
      p.max = 1.7 + rng() * 0.8
      p.size = 0.8 + rng() * 0.5
      p.color.setScalar(0.62 + rng() * 0.18)
    },
    setMode(k: number, mode: number) {
      const m = machines[k]
      if (mode === 2 && m.mode !== 2) for (let i = 0; i < 7; i++) sim.emitSmoke(k, true)
      m.mode = mode
    },
    spawn() {
      const idx = items.findIndex((q) => !q.alive)
      if (idx < 0) return
      const it = items[idx]
      it.alive = true
      it.s = SPAWN_S
      it.stage = 0
      it.state = DROP
      it.t = 0
      it.product = sim.product
      it.color = sim.colorSeq++ % PAINT.length
      line.push(idx)
      sim.lastSpawn = sim.time
      sim.hopperKick = 1
    },
    step(dt: number) {
      sim.time += dt
      const v = 1.25 * sim.tempo
      sim.beltPos += v * dt
      sim.hopperKick = Math.max(0, sim.hopperKick - dt * 3.2)

      // machines
      for (let k = 0; k < machines.length; k++) {
        const m = machines[k]
        if (m.mode === 2) {
          m.faultAge += dt
          m.smokeAcc += dt * 4.5
          while (m.smokeAcc >= 1) {
            m.smokeAcc -= 1
            sim.emitSmoke(k)
          }
          continue
        }
        m.faultAge = 0
        if (m.busy < 0) continue
        m.p += dt / sim.dur(k)
        if (k === 1 && m.p > 0.12 && m.p < 0.86) {
          m.mistAcc += dt * 70
          while (m.mistAcc >= 1) {
            m.mistAcc -= 1
            sim.emitMist()
          }
        }
        if (m.p >= 1) {
          items[m.busy].stage = k + 1
          m.busy = -1
          m.p = 0
        }
      }
      const pm = machines[1]
      sim.nozzle = pm.busy >= 0 && pm.mode !== 2 ? Math.sin(sim.time * 9) * 0.42 : pm.mode === 2 ? 0.25 : Math.sin(sim.time * 1.4) * 0.12

      // belt: front-to-back, nobody passes the item ahead or an unfinished station
      let ahead = Infinity
      for (let n = 0; n < line.length; n++) {
        const idx = line[n]
        const it = items[idx]
        if (it.state === DROP) {
          it.t += dt
          if (it.t >= DROP_T) it.state = BELT
          ahead = it.s
          continue
        }
        const k = it.stage
        if (k < 4 && machines[k].busy === idx) {
          ahead = it.s
          continue
        }
        let limit = ahead - GAP
        const gate = k < 4 ? STATION_S[k] : L
        if (gate < limit) limit = gate
        if (it.s < limit) it.s = Math.min(limit, it.s + v * dt)
        if (k < 4 && it.s >= STATION_S[k] - 1e-4) {
          const m = machines[k]
          if (m.busy < 0 && m.mode !== 2) {
            m.busy = idx
            m.p = 0
          }
        }
        ahead = it.s
      }

      // front item → toss into the docked truck
      const dockI = trucks[0].phase === T_DOCK ? 0 : trucks[1].phase === T_DOCK ? 1 : -1
      if (line.length && dockI >= 0) {
        const idx = line[0]
        const it = items[idx]
        const tr = trucks[dockI]
        if (it.stage === 4 && it.s >= L - 1e-4 && tr.assigned < SLOTS.length && sim.time - sim.lastFly > 0.32) {
          line.shift()
          it.state = FLY
          it.t = 0
          it.truck = dockI
          it.slot = tr.assigned++
          sim.lastFly = sim.time
        }
      }
      for (const it of items) {
        if (!it.alive || it.state !== FLY) continue
        it.t += dt / FLY_T
        if (it.t >= 1) {
          it.t = 1
          it.state = LOADED
          trucks[it.truck].landed++
          sim.shipped++
          ships[shipHead] = sim.time
          shipHead = (shipHead + 1) % ships.length
        }
      }

      // trucks
      for (let i = 0; i < 2; i++) {
        const tr = trucks[i]
        const x0 = tr.x
        if (tr.phase === T_ARRIVE) {
          tr.t += dt
          const u = clamp01(tr.t / ARR_T)
          tr.x = X_IN + (DOCK_X - X_IN) * easeOut(u)
          if (u >= 1) {
            tr.phase = T_DOCK
            tr.t = 0
          }
        } else if (tr.phase === T_DOCK) {
          if (tr.landed >= SLOTS.length) {
            tr.t += dt
            if (tr.t > 0.45) {
              tr.phase = T_LEAVE
              tr.t = 0
              const o = trucks[1 - i]
              sim.freeTruck(1 - i)
              Object.assign(o, { phase: T_ARRIVE, t: 0, x: X_IN, assigned: 0, landed: 0, livery: (tr.livery + 1) % 3 })
            }
          }
        } else if (tr.phase === T_LEAVE) {
          tr.t += dt
          const u = clamp01(tr.t / LEAVE_T)
          tr.x = DOCK_X + (X_OUT - DOCK_X) * easeIn(u)
          if (u >= 1) {
            tr.phase = T_IDLE
            sim.freeTruck(i)
          }
        }
        tr.dist += tr.x - x0
        tr.speed = dt > 0 ? (tr.x - x0) / dt : 0
      }

      // hopper
      let cyc = 0
      for (let k = 0; k < machines.length; k++) if (machines[k].mode !== 2) cyc = Math.max(cyc, sim.dur(k) + GAP / v)
      const interval = Math.max(cyc * 1.05, 0.5)
      const back = line.length ? items[line[line.length - 1]] : null
      if (sim.time - sim.lastSpawn >= interval && (!back || (back.state !== DROP && back.s >= SPAWN_S + GAP))) sim.spawn()

      // particles
      for (const p of mist) {
        if (!p.alive) continue
        p.life += dt
        p.vy -= 2.5 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        if (p.life > p.max || p.y < BELT_Y) p.alive = false
      }
      for (const p of smoke) {
        if (!p.alive) continue
        p.life += dt
        const d = Math.exp(-dt * 1.4)
        p.vx *= d
        p.vz *= d
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        if (p.life > p.max) p.alive = false
      }
    },
  }
  return sim
}
type Sim = ReturnType<typeof makeSim>

/* ==================================================================== shared GPU resources */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
const CLIP = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), FLOOR.x1), new THREE.Plane(new THREE.Vector3(1, 0, 0), -NOTCH_X)]
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })

const hazardTex = canvasTex(256, 64, (g) => {
  g.fillStyle = '#ffc83d'
  g.fillRect(0, 0, 256, 64)
  g.fillStyle = '#2f3644'
  for (let x = -64; x < 256 + 64; x += 40) {
    g.beginPath()
    g.moveTo(x, 64)
    g.lineTo(x + 20, 64)
    g.lineTo(x + 84, 0)
    g.lineTo(x + 64, 0)
    g.closePath()
    g.fill()
  }
})
hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping

const beltTex = canvasTex(128, 128, (g) => {
  g.fillStyle = COL.rubber
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#4b5366'
  g.fillRect(0, 0, 10, 128)
  g.fillStyle = '#323846'
  g.fillRect(10, 0, 3, 128)
  // chevrons
  g.strokeStyle = 'rgba(255,255,255,0.13)'
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(44, 26)
  g.lineTo(76, 64)
  g.lineTo(44, 102)
  g.stroke()
})
beltTex.wrapS = THREE.RepeatWrapping

const glowTex = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  r.addColorStop(0, 'rgba(255,255,255,0.95)')
  r.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
})

const boxTopTex = canvasTex(128, 128, (g) => {
  g.fillStyle = COL.card
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(120,70,20,0.25)'
  g.fillRect(63, 0, 2, 128)
  g.fillStyle = '#e9c48f'
  g.fillRect(52, 0, 24, 128)
  g.fillStyle = 'rgba(255,255,255,0.25)'
  g.fillRect(54, 0, 4, 128)
})
const boxSideTex = canvasTex(128, 128, (g) => {
  g.fillStyle = COL.card
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = 'rgba(120,70,20,0.18)'
  g.fillRect(0, 0, 128, 3)
  g.strokeStyle = 'rgba(90,55,20,0.45)'
  g.lineWidth = 4
  // ↑↑ "this way up" mark
  for (const x of [34, 50]) {
    g.beginPath()
    g.moveTo(x, 92)
    g.lineTo(x, 66)
    g.moveTo(x - 6, 73)
    g.lineTo(x, 66)
    g.lineTo(x + 6, 73)
    g.stroke()
  }
})
const labelTex = canvasTex(128, 96, (g) => {
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.roundRect(2, 2, 124, 92, 12)
  g.fill()
  g.fillStyle = 'rgba(255,255,255,1)'
  g.fillStyle = '#20242c'
  let x = 22
  for (let i = 0; i < 22; i++) {
    const w = [2, 4, 2, 6, 3][i % 5]
    g.fillRect(x, 44, w, 32)
    x += w + 2
  }
  g.fillRect(22, 18, 54, 8)
})

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  ball: new THREE.SphereGeometry(1, 14, 10),
  puff: new THREE.IcosahedronGeometry(1, 1),
}

const M = {
  steel: lam(COL.steel),
  steel2: lam(COL.steel2),
  dark: lam(COL.dark),
  rail: lam(COL.rail),
  white: lam(COL.white),
  press: lam(COL.press),
  paint: lam(COL.paint),
  boxer: lam(COL.box),
  label: lam(COL.label),
  card: lam(COL.card),
  glass: lam('#bfe0f5', { transparent: true, opacity: 0.55 }),
  hazard: lam('#ffffff', { map: hazardTex }),
  rubber: lam('#ffffff', { map: beltTex }),
  plant: lam('#6fbf7d', { flatShading: true }),
  pot: lam('#e7d6c3'),
  wood: lam('#d7b483'),
}

/* products: centred, 0.5 tall */
const PRODUCT_GEO = [
  new RoundedBoxGeometry(0.5, 0.5, 0.5, 3, 0.07),
  new THREE.CylinderGeometry(0.27, 0.27, 0.5, 28),
  new RoundedBoxGeometry(0.48, 0.48, 0.48, 2, 0.035),
]
const RIBBON_GEO = (() => {
  const a = new THREE.BoxGeometry(0.5, 0.505, 0.1)
  const b = new THREE.BoxGeometry(0.1, 0.505, 0.5)
  const k1 = new THREE.TorusGeometry(0.065, 0.024, 8, 16)
  k1.rotateY(Math.PI / 4)
  k1.rotateZ(0.5)
  k1.translate(-0.05, 0.29, 0)
  const k2 = k1.clone()
  k2.rotateY(Math.PI)
  return mergeGeometries([a, b, k1, k2].map((g) => (g.index ? g.toNonIndexed() : g)))
})()
const BOX_GEO = new THREE.BoxGeometry(0.66, 0.6, 0.66)
const LABEL_GEO = new THREE.PlaneGeometry(0.4, 0.3)

/* ==================================================================== small building blocks */
type V3 = [number, number, number]
function B({ p, s, m, rot, cast = true }: { p: V3; s: V3; m: THREE.Material | THREE.Material[]; rot?: V3; cast?: boolean }) {
  return <mesh geometry={G.box} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow />
}
function Cyl({ p, r, h, m, rot, cast = true }: { p: V3; r: number; h: number; m: THREE.Material; rot?: V3; cast?: boolean }) {
  return <mesh geometry={G.cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} castShadow={cast} receiveShadow />
}

/* ==================================================================== floor, walls, decor */
const floorTex = (() => {
  const W = FLOOR.x1 - FLOOR.x0
  const D = FLOOR.z1 - FLOOR.z0
  const ppu = 112
  const X = (x: number) => (x - FLOOR.x0) * ppu
  const Z = (z: number) => (z - FLOOR.z0) * ppu
  return canvasTex(Math.round(W * ppu), Math.round(D * ppu), (g) => {
    g.fillStyle = COL.floor
    g.fillRect(0, 0, W * ppu, D * ppu)
    // tile grid
    g.fillStyle = '#e3e7ee'
    for (let x = Math.ceil(FLOOR.x0); x < FLOOR.x1; x++) g.fillRect(X(x) - 1, 0, 2, D * ppu)
    for (let z = Math.ceil(FLOOR.z0); z < FLOOR.z1; z++) g.fillRect(0, Z(z) - 1, W * ppu, 2)
    // work zone around the L
    g.strokeStyle = '#f4c443'
    g.lineWidth = 7
    g.setLineDash([34, 20])
    g.beginPath()
    g.moveTo(X(-7.6), Z(CZ - 1.45))
    g.lineTo(X(CX + 1.55), Z(CZ - 1.45))
    g.lineTo(X(CX + 1.55), Z(4.75))
    g.moveTo(X(-7.6), Z(CZ + 1.45))
    g.lineTo(X(CX - 1.45), Z(CZ + 1.45))
    g.lineTo(X(CX - 1.45), Z(4.75))
    g.stroke()
    g.setLineDash([])
    // road
    g.fillStyle = '#d5dbe5'
    g.fillRect(X(NOTCH_X), Z(5.15), W * ppu, Z(6.85) - Z(5.15))
    g.fillStyle = '#ffffff'
    g.fillRect(X(NOTCH_X), Z(5.15), W * ppu, 5)
    g.fillRect(X(NOTCH_X), Z(6.85) - 5, W * ppu, 5)
    for (let x = NOTCH_X + 0.3; x < FLOOR.x1; x += 1.4) g.fillRect(X(x), Z(6.0) - 3, 0.7 * ppu, 6)
    // loading bay hazard
    g.save()
    g.beginPath()
    g.rect(X(CX - 1.2), Z(4.62), 2.4 * ppu, 0.45 * ppu)
    g.clip()
    g.fillStyle = '#ffc83d'
    g.fillRect(X(CX - 1.2), Z(4.62), 2.4 * ppu, 0.45 * ppu)
    g.fillStyle = '#2f3644'
    for (let x = X(CX - 1.6); x < X(CX + 1.6); x += 36) {
      g.beginPath()
      g.moveTo(x, Z(5.07))
      g.lineTo(x + 18, Z(5.07))
      g.lineTo(x + 18 + 50, Z(4.62))
      g.lineTo(x + 50, Z(4.62))
      g.fill()
    }
    g.restore()
    // painted labels & flow arrows
    g.fillStyle = 'rgba(60,68,84,0.55)'
    g.font = `600 ${0.42 * ppu}px ui-monospace, Menlo, Consolas, monospace`
    g.fillText('LINE 01', X(-7.6), Z(CZ + 2.2))
    g.fillText('DOCK', X(CX + 1.8), Z(4.95))
    g.fillStyle = 'rgba(244,196,67,0.9)'
    for (const x of [-5.6, -2.2, 1.4]) {
      const cx = X(x)
      const cz = Z(CZ + 1.8)
      g.beginPath()
      g.moveTo(cx - 18, cz - 16)
      g.lineTo(cx + 6, cz)
      g.lineTo(cx - 18, cz + 16)
      g.lineTo(cx - 8, cz)
      g.fill()
    }
  })
})()

function Floor() {
  const W = FLOOR.x1 - FLOOR.x0
  const D = FLOOR.z1 - FLOOR.z0
  const geo = useMemo(() => {
    // shape lives in (x, -z); extruded upwards after the -90° x rotation
    const sh = new THREE.Shape()
    const pts: [number, number][] = [
      [FLOOR.x0, FLOOR.z0],
      [FLOOR.x1, FLOOR.z0],
      [FLOOR.x1, FLOOR.z1],
      [NOTCH_X, FLOOR.z1],
      [NOTCH_X, NOTCH_Z],
      [FLOOR.x0, NOTCH_Z],
    ]
    pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)))
    sh.closePath()
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const mats = useMemo(() => {
    const t = floorTex.clone()
    t.repeat.set(1 / W, 1 / D)
    t.offset.set(-FLOOR.x0 / W, FLOOR.z1 / D)
    t.needsUpdate = true
    return [lam('#ffffff', { map: t }), lam('#cfd5df')]
  }, [W, D])
  return <mesh geometry={geo} material={mats} position={[0, -0.6, 0]} receiveShadow />
}

function wallTexture(len: number, sign: boolean) {
  const ppu = 96
  const H = 2.6
  return canvasTex(Math.round(len * ppu), Math.round(H * ppu), (g) => {
    g.fillStyle = '#e8ecf2'
    g.fillRect(0, 0, len * ppu, H * ppu)
    g.fillStyle = '#dde2ea'
    g.fillRect(0, H * ppu - 0.35 * ppu, len * ppu, 0.35 * ppu)
    const sx = len / 2 - 2
    for (let x = 0.7; x < len - 1.4; x += 2.1) {
      if (sign && x > sx - 1.7 && x < sx + 4.2) continue
      const grd = g.createLinearGradient(0, 0.45 * ppu, 0, 1.45 * ppu)
      grd.addColorStop(0, '#cfe6fb')
      grd.addColorStop(1, '#eaf4fd')
      g.fillStyle = grd
      g.fillRect(x * ppu, 0.42 * ppu, 1.5 * ppu, 1.05 * ppu)
      g.fillStyle = '#c3cbd8'
      g.fillRect(x * ppu + 0.73 * ppu, 0.42 * ppu, 4, 1.05 * ppu)
      g.fillRect(x * ppu, 0.42 * ppu + 0.5 * ppu, 1.5 * ppu, 4)
    }
    if (!sign) return
    g.fillStyle = '#2f3644'
    g.beginPath()
    g.roundRect(sx * ppu, 0.42 * ppu, 4.0 * ppu, 1.0 * ppu, 14)
    g.fill()
    g.fillStyle = '#ffc83d'
    g.fillRect((sx + 0.25) * ppu, 0.64 * ppu, 0.14 * ppu, 0.56 * ppu)
    g.fillStyle = '#ffffff'
    g.font = `600 ${0.4 * ppu}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
    g.fillText('1 号产线', (sx + 0.6) * ppu, 0.92 * ppu)
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.font = `500 ${0.22 * ppu}px ui-monospace, Menlo, Consolas, monospace`
    g.fillText('CI / CD · MAIN', (sx + 0.6) * ppu, 1.24 * ppu)
  })
}

function Walls() {
  const H = 2.6
  const W = FLOOR.x1 - FLOOR.x0
  const zLen = NOTCH_Z - FLOOR.z0
  const back = useMemo(() => {
    const face = lam('#ffffff', { map: wallTexture(W, true) })
    return [M.steel, M.steel, M.steel2, M.steel, face, M.steel]
  }, [W])
  const left = useMemo(() => {
    const face = lam('#ffffff', { map: wallTexture(zLen, false) })
    return [face, M.steel, M.steel2, M.steel, M.steel, M.steel]
  }, [zLen])
  return (
    <group>
      <mesh geometry={G.box} material={back} position={[(FLOOR.x0 + FLOOR.x1) / 2, H / 2, FLOOR.z0 + 0.15]} scale={[W, H, 0.3]} castShadow receiveShadow />
      <mesh geometry={G.box} material={left} position={[FLOOR.x0 + 0.15, H / 2, FLOOR.z0 + 0.3 + (zLen - 0.3) / 2]} scale={[0.3, H, zLen - 0.3]} castShadow receiveShadow />
      {/* gates the trucks drive through */}
      {[NOTCH_X + 0.15, FLOOR.x1 - 0.15].map((x) => (
        <group key={x} position={[x, 0, 6.0]}>
          <B p={[0, 1.05, -0.95]} s={[0.24, 2.1, 0.24]} m={M.dark} />
          <B p={[0, 1.05, 0.95]} s={[0.24, 2.1, 0.24]} m={M.dark} />
          <B p={[0, 2.2, 0]} s={[0.3, 0.26, 2.14]} m={[M.hazard, M.hazard, M.dark, M.dark, M.dark, M.dark]} />
        </group>
      ))}
    </group>
  )
}

function Plant({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.22, 0]} r={0.26} h={0.44} m={M.pot} />
      <mesh geometry={G.ball} material={M.plant} position={[0, 0.72, 0]} scale={[0.36, 0.48, 0.36]} castShadow />
      <mesh geometry={G.ball} material={M.plant} position={[0.18, 0.55, 0.12]} scale={[0.22, 0.26, 0.22]} castShadow />
    </group>
  )
}

function Decor() {
  const boxMats = useMemo(() => {
    const side = lam('#ffffff', { map: boxSideTex })
    const top = lam('#ffffff', { map: boxTopTex })
    return [side, side, top, side, side, side]
  }, [])
  return (
    <group>
      {/* pallet of finished boxes */}
      <group position={[6.0, 0, 3.0]}>
        <B p={[0, 0.07, 0]} s={[1.5, 0.14, 1.5]} m={M.wood} />
        {[
          [-0.36, 0.44, -0.36],
          [0.36, 0.44, -0.36],
          [-0.36, 0.44, 0.36],
          [0.36, 0.44, 0.36],
          [0, 1.04, 0],
        ].map((q, i) => (
          <mesh key={i} geometry={BOX_GEO} material={boxMats} position={q as V3} castShadow receiveShadow />
        ))}
      </group>
      <group position={[5.6, 0, -3.9]}>
        <B p={[0, 0.07, 0]} s={[1.5, 0.14, 1.5]} m={M.wood} />
        <mesh geometry={BOX_GEO} material={boxMats} position={[-0.36, 0.44, 0.36]} castShadow receiveShadow />
      </group>
      <Plant p={[-7.5, 0, -4.5]} s={1.1} />
      <Plant p={[6.6, 0, -4.5]} />
      <Plant p={[1.45, 0, 1.3]} s={0.85} />
      <Plant p={[6.7, 0, 4.4]} s={0.9} />
      {/* raw stock pallet next to the hopper */}
      <group position={[-7.4, 0, -0.35]}>
        <B p={[0, 0.07, 0]} s={[1.2, 0.14, 1.2]} m={M.wood} />
        {[-0.28, 0.28].flatMap((x) => [-0.28, 0.28].map((z) => <B key={`${x}${z}`} p={[x, 0.36, z]} s={[0.46, 0.44, 0.46]} m={M.steel2} />))}
      </group>
    </group>
  )
}

/* ==================================================================== belt */
function BeltSeg({ sim, x, z, len, rotY }: { sim: Sim; x: number; z: number; len: number; rotY: number }) {
  const tex = useMemo(() => {
    const t = beltTex.clone()
    t.repeat.set(len / 0.5, 1)
    t.needsUpdate = true
    return t
  }, [len])
  const mat = useMemo(() => lam('#ffffff', { map: tex }), [tex])
  useFrame(() => {
    tex.offset.x = -((sim.beltPos / 0.5) % 1)
  })
  const legs = Math.max(2, Math.round(len / 1.7) + 1)
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <B p={[0, BELT_Y - 0.12, 0]} s={[len, 0.22, 1.16]} m={M.steel} />
      <mesh material={mat} position={[0, BELT_Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[len, 1.04]} />
      </mesh>
      <B p={[0, BELT_Y + 0.03, 0.6]} s={[len, 0.1, 0.07]} m={M.rail} />
      <B p={[0, BELT_Y + 0.03, -0.6]} s={[len, 0.1, 0.07]} m={M.rail} />
      {Array.from({ length: legs }, (_, i) => {
        const lx = -len / 2 + 0.3 + (i * (len - 0.6)) / (legs - 1)
        return (
          <group key={i}>
            <B p={[lx, (BELT_Y - 0.23) / 2, 0.42]} s={[0.1, BELT_Y - 0.23, 0.1]} m={M.dark} />
            <B p={[lx, (BELT_Y - 0.23) / 2, -0.42]} s={[0.1, BELT_Y - 0.23, 0.1]} m={M.dark} />
          </group>
        )
      })}
      {[-len / 2, len / 2].map((ex) => (
        <Cyl key={ex} p={[ex, BELT_Y - 0.08, 0]} r={0.1} h={1.12} rot={[Math.PI / 2, 0, 0]} m={M.steel2} />
      ))}
    </group>
  )
}

function Turntable({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = -sim.beltPos * 0.6
  })
  return (
    <group position={[CX, 0, CZ]}>
      <Cyl p={[0, (BELT_Y - 0.12) / 2, 0]} r={0.66} h={BELT_Y - 0.12} m={M.steel} />
      <group ref={ref}>
        <Cyl p={[0, BELT_Y - 0.06, 0]} r={0.62} h={0.12} m={M.rubber} />
        {[0, 1, 2].map((i) => (
          <B key={i} p={[0, BELT_Y + 0.003, 0]} s={[1.18, 0.006, 0.05]} rot={[0, (i * Math.PI) / 3, 0]} m={M.steel2} cast={false} />
        ))}
      </group>
      <Cyl p={[0, BELT_Y + 0.004, 0]} r={0.12} h={0.02} m={M.rail} cast={false} />
    </group>
  )
}

function Hopper({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const k = sim.hopperKick
    g.rotation.z = Math.sin(sim.time * 40) * 0.02 * k
    g.position.y = -0.04 * Math.sin(k * Math.PI)
  })
  const x = AX0 + SPAWN_S
  return (
    <group position={[x, 0, CZ]}>
      {[-0.62, 0.62].flatMap((lx) => [-0.62, 0.62].map((lz) => <B key={`${lx}${lz}`} p={[lx, 1.0, lz]} s={[0.1, 2.0, 0.1]} m={M.dark} />))}
      <B p={[0, 1.95, 0.62]} s={[1.34, 0.08, 0.08]} m={M.dark} />
      <B p={[0, 1.95, -0.62]} s={[1.34, 0.08, 0.08]} m={M.dark} />
      <group ref={ref}>
        <mesh material={M.steel} position={[0, 2.25, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.95, 0.32, 0.9, 4, 1, true]} />
        </mesh>
        <mesh position={[0, 2.25, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.93, 0.3, 0.88, 4, 1, true]} />
          <meshLambertMaterial color={COL.dark} side={THREE.BackSide} />
        </mesh>
        <B p={[0, 2.68, 0]} s={[1.36, 0.08, 1.36]} m={M.press} />
        <B p={[0, 1.68, 0]} s={[0.44, 0.22, 0.44]} m={M.steel2} />
        {/* lumps of raw stock */}
        {[
          [-0.2, 2.62, -0.15],
          [0.18, 2.6, 0.1],
          [0.02, 2.66, 0.25],
          [-0.15, 2.58, 0.28],
          [0.26, 2.63, -0.24],
        ].map((q, i) => (
          <mesh key={i} geometry={PRODUCT_GEO[0]} position={q as V3} rotation={[i, i * 2, 0]} scale={0.5}>
            <meshLambertMaterial color={RAW} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ==================================================================== machines */
const STATE_COL = [new THREE.Color('#ffb020'), new THREE.Color('#22d66b'), new THREE.Color('#ff3b3b')]
const _c = new THREE.Color()
const WHITE = new THREE.Color(1, 1, 1)

function MachineShell({
  k,
  sim,
  onHit,
  lamp,
  hit,
  children,
}: {
  k: number
  sim: Sim
  onHit: (k: number) => void
  lamp: V3
  hit: { p: V3; s: V3 }
  children: React.ReactNode
}) {
  const g = useRef<THREE.Group>(null)
  const bulb = useMemo(() => lam('#ffffff', { emissive: new THREE.Color('#ffb020'), emissiveIntensity: 1 }), [])
  const halo = useMemo(() => new THREE.SpriteMaterial({ map: glowTex, color: '#ffb020', transparent: true, depthWrite: false, opacity: 0.6 }), [])
  const hov = useRef(0)
  const hovT = useRef(0)
  useFrame((_, dt) => {
    const m = sim.machines[k]
    const t = sim.time
    hov.current += (hovT.current - hov.current) * Math.min(1, dt * 14)
    if (g.current) {
      let ox = 0
      let oz = 0
      if (m.mode === 1) {
        ox = Math.sin(t * 71) * 0.016
        oz = Math.cos(t * 63) * 0.016
      } else if (m.mode === 2 && m.faultAge < 0.5) {
        const d = 1 - m.faultAge / 0.5
        ox = Math.sin(t * 50) * 0.05 * d
      }
      g.current.position.set(MACH[k].x + ox, hov.current * 0.06, MACH[k].z + oz)
    }
    let on = 1
    if (m.mode === 0) on = m.busy >= 0 ? 1 : 0.65
    if (m.mode === 2) on = Math.sin(t * 13) > 0 ? 1.3 : 0.15
    _c.copy(STATE_COL[m.mode])
    bulb.color.copy(_c).lerp(WHITE, 0.15)
    bulb.emissive.copy(_c)
    bulb.emissiveIntensity = on * 1.1
    halo.color.copy(_c)
    halo.opacity = on * 0.55
  })
  return (
    <group
      ref={g}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onHit(k)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        hovT.current = 1
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        hovT.current = 0
        document.body.style.cursor = ''
      }}
    >
      {children}
      <group position={lamp}>
        <Cyl p={[0, 0.06, 0]} r={0.13} h={0.12} m={M.dark} />
        <mesh geometry={G.ball} material={bulb} position={[0, 0.23, 0]} scale={[0.15, 0.19, 0.15]} />
        <sprite material={halo} position={[0, 0.23, 0]} scale={1.2} />
      </group>
      <mesh geometry={G.box} position={hit.p} scale={hit.s} visible={false} />
    </group>
  )
}

/** 冲压 — two columns, a beam and a heavy head that slams down */
function Press({ sim }: { sim: Sim }) {
  const head = useRef<THREE.Group>(null)
  const rod = useRef<THREE.Mesh>(null)
  const gear = useRef<THREE.Group>(null)
  const BEAM_B = 2.62
  useFrame((_, dt) => {
    const m = sim.machines[0]
    const h = m.busy >= 0 ? pressH(m.p) : 1.2 + Math.sin(sim.time * 2.2) * 0.025
    const bottom = BELT_Y + h
    if (head.current) head.current.position.y = bottom
    if (rod.current) {
      const top = bottom + 0.36
      rod.current.position.y = (top + BEAM_B) / 2
      rod.current.scale.y = Math.max(0.01, BEAM_B - top)
    }
    if (gear.current && m.mode !== 2) gear.current.rotation.z -= dt * (m.mode === 1 ? 6 : 2) * sim.tempo
  })
  const beamMats = useMemo(() => [M.hazard, M.hazard, M.press, M.press, M.press, M.press], [])
  return (
    <group>
      {[-0.86, 0.86].map((z) => (
        <group key={z}>
          <B p={[0, 0.06, z]} s={[0.7, 0.12, 0.5]} m={M.dark} />
          <B p={[0, 1.4, z]} s={[0.38, 2.6, 0.34]} m={M.press} />
        </group>
      ))}
      <mesh geometry={G.box} material={beamMats} position={[0, 2.88, 0]} scale={[0.6, 0.52, 2.1]} castShadow receiveShadow />
      <Cyl p={[0, 3.24, 0]} r={0.24} h={0.22} m={M.dark} />
      <mesh ref={rod} geometry={G.cyl} material={M.steel} scale={[0.08, 1, 0.08]} castShadow />
      <group ref={head}>
        <RoundedBox args={[0.8, 0.3, 0.8]} radius={0.05} smoothness={2} position={[0, 0.2, 0]} material={M.press} castShadow />
        <B p={[0, 0.03, 0]} s={[0.7, 0.06, 0.7]} m={M.dark} />
        <B p={[0, 0.2, 0.41]} s={[0.5, 0.06, 0.02]} m={M.white} cast={false} />
      </group>
      {/* flywheel on the visible column */}
      <group position={[0, 1.6, 1.06]}>
        <group ref={gear}>
          <Cyl p={[0, 0, 0]} r={0.36} h={0.08} rot={[Math.PI / 2, 0, 0]} m={M.dark} />
          <B p={[0, 0, 0.045]} s={[0.62, 0.08, 0.02]} m={M.rail} cast={false} />
          <B p={[0, 0, 0.045]} s={[0.08, 0.62, 0.02]} m={M.rail} cast={false} />
        </group>
      </group>
    </group>
  )
}

/** 喷漆 — booth with a swinging nozzle; tanks show the palette */
function PaintBooth({ sim }: { sim: Sim }) {
  const nozzle = useRef<THREE.Group>(null)
  const tank = useMemo(() => lam('#ffffff'), [])
  const splash = useMemo(() => new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }), [])
  useFrame((_, dt) => {
    if (nozzle.current) nozzle.current.rotation.x = sim.nozzle
    const m = sim.machines[1]
    const on = m.busy >= 0 && m.mode !== 2 && m.p > 0.12 && m.p < 0.9
    if (m.busy >= 0) {
      tank.color.copy(PAINT[sim.items[m.busy].color])
      splash.color.copy(PAINT[sim.items[m.busy].color])
    }
    splash.opacity += ((on ? 0.75 : 0) - splash.opacity) * Math.min(1, dt * 6)
  })
  return (
    <group>
      {/* back panel with a soft splash of the current colour */}
      <B p={[0, 1.05, -0.86]} s={[1.3, 2.1, 0.08]} m={M.white} />
      <B p={[0, 1.05, -0.9]} s={[1.44, 2.24, 0.04]} m={M.paint} />
      <mesh position={[0, 1.15, -0.81]} material={splash}>
        <circleGeometry args={[0.55, 32]} />
      </mesh>
      {/* open frame — keeps the item visible from the iso camera */}
      {[-0.66, 0.66].flatMap((x) =>
        [-0.86, 0.86].map((z) => <B key={`${x}${z}`} p={[x, 1.07, z]} s={[0.12, 2.14, 0.12]} m={M.paint} />),
      )}
      {[-0.86, 0.86].map((z) => (
        <B key={z} p={[0, 2.12, z]} s={[1.46, 0.16, 0.16]} m={M.paint} />
      ))}
      <B p={[0, 2.16, 0]} s={[0.22, 0.14, 1.6]} m={M.dark} />
      <B p={[0, 2.03, 0]} s={[0.3, 0.14, 0.3]} m={M.steel2} />
      <group ref={nozzle} position={[0, 1.96, 0]}>
        <Cyl p={[0, -0.16, 0]} r={0.045} h={0.32} m={M.dark} />
        <mesh material={M.paint} position={[0, -0.4, 0]} castShadow>
          <coneGeometry args={[0.1, 0.18, 16]} />
        </mesh>
      </group>
      {/* paint tanks behind */}
      <group position={[0.0, 0, -1.55]}>
        <B p={[0, 0.06, 0]} s={[1.9, 0.12, 0.6]} m={M.dark} />
        {PAINT.map((c, i) => (
          <mesh key={i} geometry={G.cyl} position={[-0.75 + i * 0.3, 0.32, 0]} scale={[0.12, 0.4, 0.12]} castShadow>
            <meshLambertMaterial color={c} />
          </mesh>
        ))}
        <mesh geometry={G.cyl} material={tank} position={[0, 1.25, 0.3]} scale={[0.3, 0.9, 0.3]} castShadow />
        <Cyl p={[0, 1.75, 0.3]} r={0.31} h={0.08} m={M.steel2} />
        <B p={[0, 2.0, 0.62]} s={[0.07, 0.07, 0.7]} m={M.steel2} />
      </group>
    </group>
  )
}

/** 装箱 — a cardboard blank folds up around the item, a plate presses the flaps, tape runs across */
function Boxer({ sim }: { sim: Sim }) {
  const fold = useRef<THREE.Group>(null)
  const walls = useRef<(THREE.Group | null)[]>([])
  const flaps = useRef<(THREE.Group | null)[]>([])
  const tape = useRef<THREE.Mesh>(null)
  const plate = useRef<THREE.Group>(null)
  const roll = useRef<THREE.Group>(null)
  const S = 0.66
  const H = 0.6
  useFrame((_, dt) => {
    const m = sim.machines[2]
    const busy = m.busy >= 0
    const p = busy ? m.p : 0
    const f = fold.current
    if (f) {
      f.visible = busy
      const ap = clamp01(p / 0.1)
      f.scale.setScalar(0.4 + 0.6 * backOut(ap))
      const w = p < 0.1 ? 1.25 : 1.25 * (1 - backOut(clamp01((p - 0.1) / 0.35), 1.2))
      const [fr, bk, rt, lf] = walls.current
      if (fr) fr.rotation.x = w
      if (bk) bk.rotation.x = -w
      if (rt) rt.rotation.z = -w
      if (lf) lf.rotation.z = w
      const fl = easeInOut(clamp01((p - 0.45) / 0.27)) * (Math.PI / 2)
      const [fa, fb] = flaps.current
      if (fa) fa.rotation.z = fl
      if (fb) fb.rotation.z = -fl
      if (tape.current) {
        const tp = clamp01((p - 0.78) / 0.17)
        tape.current.visible = tp > 0
        tape.current.scale.z = Math.max(0.001, tp) * (S + 0.04)
        tape.current.position.z = -(S + 0.04) / 2 + (tape.current.scale.z) / 2
      }
    }
    if (plate.current) {
      const pp = busy ? clamp01((p - 0.68) / 0.22) : 0
      const d = Math.sin(pp * Math.PI)
      plate.current.position.y = BELT_Y + 1.25 - d * 0.6
    }
    if (roll.current && busy && m.p > 0.78) roll.current.rotation.x -= dt * 12
  })
  const card = M.card
  return (
    <group>
      {[-0.88, 0.88].map((x) => (
        <group key={x}>
          <B p={[x, 0.06, 0]} s={[0.46, 0.12, 0.7]} m={M.dark} />
          <B p={[x, 1.2, 0]} s={[0.26, 2.4, 0.34]} m={M.boxer} />
        </group>
      ))}
      <B p={[0, 2.45, 0]} s={[2.1, 0.36, 0.56]} m={M.boxer} />
      <B p={[0, 2.45, 0.285]} s={[1.4, 0.12, 0.02]} m={M.white} cast={false} />
      <group ref={plate}>
        <B p={[0, 0, 0]} s={[0.6, 0.06, 0.6]} m={M.steel2} />
        <B p={[0, 0.55, 0]} s={[0.07, 1.1, 0.07]} m={M.steel} />
      </group>
      {/* tape roll */}
      <group position={[0.42, 2.12, 0.22]}>
        <group ref={roll} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={card} castShadow>
            <torusGeometry args={[0.13, 0.05, 8, 20]} />
          </mesh>
        </group>
      </group>
      {/* stack of flat blanks */}
      <group position={[1.62, 0, -0.1]}>
        <B p={[0, 0.3, 0]} s={[0.8, 0.6, 0.8]} m={M.steel} />
        {[0, 1, 2, 3, 4].map((i) => (
          <B key={i} p={[0.02 * (i % 2), 0.64 + i * 0.05, 0.02 * ((i + 1) % 2)]} s={[0.74, 0.04, 0.74]} m={i % 2 ? M.card : lam(COL.card2)} />
        ))}
      </group>
      {/* the folding box, sits on the belt */}
      <group ref={fold} position={[0, BELT_Y, 0]} visible={false}>
        <B p={[0, 0.005, 0]} s={[S, 0.01, S]} m={card} cast={false} />
        {/* front (+z), back (-z), right (+x), left (-x) — hinged on the bottom edge */}
        <group ref={(e) => void (walls.current[0] = e)} position={[0, 0, S / 2]}>
          <B p={[0, H / 2, 0]} s={[S, H, 0.02]} m={card} />
        </group>
        <group ref={(e) => void (walls.current[1] = e)} position={[0, 0, -S / 2]}>
          <B p={[0, H / 2, 0]} s={[S, H, 0.02]} m={card} />
        </group>
        <group ref={(e) => void (walls.current[2] = e)} position={[S / 2, 0, 0]}>
          <B p={[0, H / 2, 0]} s={[0.02, H, S]} m={card} />
          <group ref={(e) => void (flaps.current[0] = e)} position={[0, H, 0]}>
            <B p={[0, S / 4, 0]} s={[0.02, S / 2, S]} m={card} />
          </group>
        </group>
        <group ref={(e) => void (walls.current[3] = e)} position={[-S / 2, 0, 0]}>
          <B p={[0, H / 2, 0]} s={[0.02, H, S]} m={card} />
          <group ref={(e) => void (flaps.current[1] = e)} position={[0, H, 0]}>
            <B p={[0, S / 4, 0]} s={[0.02, S / 2, S]} m={card} />
          </group>
        </group>
        <mesh ref={tape} geometry={G.box} position={[0, H + 0.012, 0]} scale={[0.19, 0.008, 0.01]}>
          <meshLambertMaterial color="#e9c48f" />
        </mesh>
      </group>
    </group>
  )
}

/** 贴标 — side post with an arm; the stamp comes down and leaves a label */
function Labeler({ sim }: { sim: Sim }) {
  const head = useRef<THREE.Group>(null)
  const rod = useRef<THREE.Mesh>(null)
  const roll = useRef<THREE.Group>(null)
  const ARM_Y = 2.08
  useFrame((_, dt) => {
    const m = sim.machines[3]
    const busy = m.busy >= 0
    const h = busy ? stampH(m.p) : 0.5 + Math.sin(sim.time * 2.6) * 0.03
    const bottom = BELT_Y + 0.6 + h
    if (head.current) head.current.position.y = bottom
    if (rod.current) {
      const top = bottom + 0.2
      rod.current.position.y = (top + ARM_Y) / 2
      rod.current.scale.y = Math.max(0.01, ARM_Y - top)
    }
    if (roll.current && busy && m.mode !== 2) roll.current.rotation.z -= dt * 5
  })
  return (
    <group>
      <B p={[0.98, 0.06, 0]} s={[0.7, 0.12, 0.7]} m={M.dark} />
      <RoundedBox args={[0.5, 1.95, 0.56]} radius={0.06} smoothness={2} position={[0.98, 1.08, 0]} material={M.label} castShadow />
      <B p={[0.98, 1.3, 0.285]} s={[0.3, 0.42, 0.02]} m={M.white} cast={false} />
      <B p={[0.98, 1.38, 0.3]} s={[0.2, 0.05, 0.01]} m={M.dark} cast={false} />
      <B p={[0.98, 1.24, 0.3]} s={[0.2, 0.05, 0.01]} m={M.dark} cast={false} />
      <B p={[0.45, ARM_Y + 0.08, 0]} s={[1.3, 0.24, 0.3]} m={M.label} />
      <mesh ref={rod} geometry={G.cyl} material={M.steel} scale={[0.05, 1, 0.05]} position={[0, 1.8, 0]} castShadow />
      <group ref={head} position={[0, 0, 0]}>
        <B p={[0, 0.12, 0]} s={[0.46, 0.18, 0.4]} m={M.label} />
        <B p={[0, 0.015, 0]} s={[0.42, 0.03, 0.32]} m={M.dark} />
      </group>
      {/* label roll */}
      <group position={[0.98, 0.62, 0.34]}>
        <group ref={roll}>
          <Cyl p={[0, 0, 0]} r={0.22} h={0.12} rot={[Math.PI / 2, 0, 0]} m={M.white} />
          <Cyl p={[0, 0, 0.01]} r={0.08} h={0.12} rot={[Math.PI / 2, 0, 0]} m={M.label} />
          <B p={[0.13, 0, 0.065]} s={[0.05, 0.05, 0.01]} m={M.label} cast={false} />
        </group>
      </group>
    </group>
  )
}

/* ==================================================================== items (instanced) */
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _col = new THREE.Color()
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const QFLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

function Items({ sim }: { sim: Sim }) {
  const prods = useRef<(THREE.InstancedMesh | null)[]>([])
  const ribbon = useRef<THREE.InstancedMesh>(null)
  const boxes = useRef<THREE.InstancedMesh>(null)
  const labels = useRef<THREE.InstancedMesh>(null)
  const prodMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff' }), [])
  const ribbonMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#fff4dc' }), [])
  const boxMats = useMemo(() => {
    const side = lam('#ffffff', { map: boxSideTex, clippingPlanes: CLIP })
    const top = lam('#ffffff', { map: boxTopTex, clippingPlanes: CLIP })
    return [side, side, top, side, side, side]
  }, [])
  const labelMat = useMemo(() => lam('#ffffff', { map: labelTex, clippingPlanes: CLIP, polygonOffset: true, polygonOffsetFactor: -2 }), [])

  useFrame(() => {
    const np = [0, 0, 0]
    let nr = 0
    let nb = 0
    let nl = 0
    const items = sim.items
    for (let i = 0; i < MAXI; i++) {
      const it = items[i]
      if (!it.alive) continue
      let x: number
      let z: number
      let base: number
      let yaw = 0
      if (it.state === FLY || it.state === LOADED) {
        const tr = sim.trucks[it.truck]
        const bounce = Math.abs(tr.speed) > 0.05 ? Math.abs(Math.sin(sim.time * 17)) * 0.012 : 0
        const sx = tr.x + SLOTS[it.slot][0]
        const sz = TRUCK_Z + SLOTS[it.slot][1]
        const sy = BED_Y + bounce
        if (it.state === FLY) {
          const u = easeInOut(it.t)
          x = CX + (sx - CX) * u
          z = BZ1 + (sz - BZ1) * u
          base = BELT_Y + (sy - BELT_Y) * u + 4 * it.t * (1 - it.t) * 0.85
          yaw = u * Math.PI
        } else {
          x = sx
          z = sz
          base = sy
          yaw = Math.PI
        }
      } else {
        const q = pathXZ(it.s)
        x = q.x
        z = q.z
        base = BELT_Y
        if (it.state === DROP) {
          const u = it.t / 0.32
          base += u < 1 ? DROP_H * (1 - u * u) : 0.07 * Math.sin(((it.t - 0.32) / (DROP_T - 0.32)) * Math.PI)
        }
      }

      const labeling = it.stage === 3 && sim.machines[3].busy === i && sim.machines[3].p >= 0.3
      if (it.stage >= 3) {
        const mesh = boxes.current
        if (mesh) {
          _q.setFromAxisAngle(Y_AXIS, yaw)
          _m.compose(_p.set(x, base + 0.3, z), _q, _s.set(1, 1, 1))
          mesh.setMatrixAt(nb++, _m)
        }
        if ((it.stage === 4 || labeling) && labels.current) {
          _q2.setFromAxisAngle(Y_AXIS, yaw).multiply(QFLAT)
          _m.compose(_p.set(x, base + 0.604, z), _q2, _s.set(1, 1, 1))
          labels.current.setMatrixAt(nl, _m)
          labels.current.setColorAt(nl, PAINT[it.color])
          nl++
        }
        continue
      }

      // product, stages 0..2
      let ys = it.stage >= 1 ? 1 : RAW_Y
      let xs = it.stage >= 1 ? 1 : RAW_X
      const pm = sim.machines[0]
      if (it.stage === 0 && pm.busy === i) {
        const h = pressH(pm.p)
        if (pm.p < 0.3) ys = Math.min(RAW_Y, h / 0.5)
        else {
          const jig = pm.p > 0.42 ? 0.08 * Math.sin((pm.p - 0.42) * 30) * Math.exp(-(pm.p - 0.42) * 7) : 0
          ys = Math.min(1 + jig, h / 0.5)
        }
        xs = Math.sqrt((RAW_Y * RAW_X * RAW_X) / ys)
      }
      if (it.stage >= 2) _col.copy(PAINT[it.color])
      else if (it.stage === 1 && sim.machines[1].busy === i) {
        const u = clamp01((sim.machines[1].p - 0.15) / 0.65)
        _col.copy(PRESSED).lerp(PAINT[it.color], u * u * (3 - 2 * u))
      } else if (it.stage === 1) _col.copy(PRESSED)
      else if (it.stage === 0 && pm.busy === i && pm.p >= 0.3) _col.copy(RAW).lerp(PRESSED, clamp01((pm.p - 0.3) / 0.25))
      else _col.copy(RAW)
      if (it.stage === 0) _col.multiplyScalar(0.92 + ((it.color * 37) % 7) * 0.02)
      _q.identity()
      _m.compose(_p.set(x, base + 0.25 * ys, z), _q, _s.set(xs, ys, xs))
      const mesh = prods.current[it.product]
      if (mesh) {
        const n = np[it.product]++
        mesh.setMatrixAt(n, _m)
        mesh.setColorAt(n, _col)
      }
      if (it.product === 2 && ribbon.current) ribbon.current.setMatrixAt(nr++, _m)
    }
    prods.current.forEach((mesh, k) => {
      if (!mesh) return
      mesh.count = np[k]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    if (ribbon.current) {
      ribbon.current.count = nr
      ribbon.current.instanceMatrix.needsUpdate = true
    }
    if (boxes.current) {
      boxes.current.count = nb
      boxes.current.instanceMatrix.needsUpdate = true
    }
    if (labels.current) {
      labels.current.count = nl
      labels.current.instanceMatrix.needsUpdate = true
      if (labels.current.instanceColor) labels.current.instanceColor.needsUpdate = true
    }
  })

  // seed instanceColor buffers so setColorAt has something to write into from frame 1
  const seed = useCallback((mesh: THREE.InstancedMesh | null) => {
    if (mesh && !mesh.instanceColor) for (let i = 0; i < MAXI; i++) mesh.setColorAt(i, RAW)
  }, [])

  return (
    <group>
      {PRODUCT_GEO.map((geo, k) => (
        <instancedMesh
          key={k}
          ref={(e) => {
            prods.current[k] = e
            seed(e)
          }}
          args={[geo, prodMat, MAXI]}
          frustumCulled={false}
          castShadow
          receiveShadow
        />
      ))}
      <instancedMesh ref={ribbon} args={[RIBBON_GEO, ribbonMat, MAXI]} frustumCulled={false} castShadow />
      <instancedMesh ref={boxes} args={[BOX_GEO, boxMats, MAXI]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={(e) => {
          ;(labels as React.RefObject<THREE.InstancedMesh | null>).current = e
          seed(e)
        }} args={[LABEL_GEO, labelMat, MAXI]} frustumCulled={false} />
    </group>
  )
}

/* ==================================================================== particles */
function Particles({ sim }: { sim: Sim }) {
  const mist = useRef<THREE.InstancedMesh>(null)
  const smoke = useRef<THREE.InstancedMesh>(null)
  const mistMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }), [])
  const smokeMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), [])
  useFrame(() => {
    const a = mist.current
    if (a) {
      let n = 0
      for (const p of sim.mist) {
        if (!p.alive) continue
        const u = p.life / p.max
        const s = 0.085 * p.size * (0.6 + u * 1.4) * (1 - u * u)
        _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s, s))
        a.setMatrixAt(n, _m)
        a.setColorAt(n, p.color)
        n++
      }
      a.count = n
      a.instanceMatrix.needsUpdate = true
      if (a.instanceColor) a.instanceColor.needsUpdate = true
    }
    const b = smoke.current
    if (b) {
      let n = 0
      for (const p of sim.smoke) {
        if (!p.alive) continue
        const u = p.life / p.max
        const s = p.size * (0.14 + u * 0.42) * Math.min(1, (1 - u) * 3) * Math.min(1, u * 8 + 0.3)
        _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s * 0.85, s))
        b.setMatrixAt(n, _m)
        b.setColorAt(n, p.color)
        n++
      }
      b.count = n
      b.instanceMatrix.needsUpdate = true
      if (b.instanceColor) b.instanceColor.needsUpdate = true
    }
  })
  const seed = (mesh: THREE.InstancedMesh | null, n: number) => {
    if (mesh && !mesh.instanceColor) for (let i = 0; i < n; i++) mesh.setColorAt(i, _col.set('#ffffff'))
  }
  return (
    <group>
      <instancedMesh
        ref={(e) => {
          ;(mist as React.RefObject<THREE.InstancedMesh | null>).current = e
          seed(e, 90)
        }}
        args={[G.ball, mistMat, 90]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={(e) => {
          ;(smoke as React.RefObject<THREE.InstancedMesh | null>).current = e
          seed(e, 60)
        }}
        args={[G.puff, smokeMat, 60]}
        frustumCulled={false}
      />
    </group>
  )
}

/* ==================================================================== trucks */
const LIVERY = ['#3a8dff', '#ff8a4c', '#1fbf8f']
function Truck({ sim, i }: { sim: Sim; i: number }) {
  const g = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const wheels = useRef<(THREE.Group | null)[]>([])
  const mats = useMemo(() => {
    const c = (col: string, extra: THREE.MeshLambertMaterialParameters = {}) => lam(col, { clippingPlanes: CLIP, ...extra })
    return {
      cab: c(LIVERY[0]),
      bed: c('#f3f5f8'),
      chassis: c('#3c4454'),
      glass: c('#cfe7f7'),
      tire: c('#2c313c'),
      hub: c('#c9d0da'),
      head: c('#fff6d8', { emissive: new THREE.Color('#ffe9a8'), emissiveIntensity: 0.6 }),
    }
  }, [])
  useFrame(() => {
    const tr = sim.trucks[i]
    if (!g.current) return
    g.current.visible = tr.phase !== T_IDLE
    g.current.position.set(tr.x, 0, TRUCK_Z)
    mats.cab.color.set(LIVERY[tr.livery % LIVERY.length])
    const moving = Math.abs(tr.speed) > 0.05
    if (body.current) {
      body.current.position.y = moving ? Math.abs(Math.sin(sim.time * 17)) * 0.012 : 0
      body.current.rotation.z = THREE.MathUtils.clamp(-tr.speed * 0.004, -0.03, 0.03)
    }
    for (const w of wheels.current) if (w) w.rotation.z = -tr.dist / 0.24
  })
  const B2 = ({ p, s, m }: { p: V3; s: V3; m: THREE.Material }) => <mesh geometry={G.box} material={m} position={p} scale={s} castShadow receiveShadow />
  return (
    <group ref={g} position={[X_IN, 0, TRUCK_Z]}>
      <group ref={body}>
        <B2 p={[0.3, 0.38, 0]} s={[3.1, 0.16, 1.2]} m={mats.chassis} />
        <B2 p={[-0.2, 0.5, 0]} s={[2.24, 0.08, 1.48]} m={mats.bed} />
        <B2 p={[-0.2, 0.62, 0.72]} s={[2.24, 0.16, 0.05]} m={mats.cab} />
        <B2 p={[-0.2, 0.62, -0.72]} s={[2.24, 0.16, 0.05]} m={mats.cab} />
        <B2 p={[-1.3, 0.62, 0]} s={[0.05, 0.16, 1.48]} m={mats.cab} />
        <B2 p={[0.93, 0.85, 0]} s={[0.08, 0.6, 1.4]} m={mats.chassis} />
        <RoundedBox args={[0.92, 1.0, 1.4]} radius={0.1} smoothness={3} position={[1.45, 0.98, 0]} material={mats.cab} castShadow />
        <B2 p={[1.9, 1.16, 0]} s={[0.04, 0.38, 1.12]} m={mats.glass} />
        <B2 p={[1.45, 1.16, 0.705]} s={[0.5, 0.32, 0.02]} m={mats.glass} />
        <B2 p={[1.45, 1.16, -0.705]} s={[0.5, 0.32, 0.02]} m={mats.glass} />
        <B2 p={[1.92, 0.64, 0.46]} s={[0.03, 0.12, 0.2]} m={mats.head} />
        <B2 p={[1.92, 0.64, -0.46]} s={[0.03, 0.12, 0.2]} m={mats.head} />
        <B2 p={[1.94, 0.44, 0]} s={[0.08, 0.1, 1.3]} m={mats.chassis} />
      </group>
      {[-0.85, 1.4].flatMap((wx) =>
        [0.62, -0.62].map((wz, j) => (
          <group key={`${wx}${wz}`} position={[wx, 0.24, wz]} ref={(e) => void (wheels.current[(wx < 0 ? 0 : 2) + j] = e)}>
            <mesh geometry={G.cyl} material={mats.tire} rotation={[Math.PI / 2, 0, 0]} scale={[0.24, 0.2, 0.24]} castShadow />
            <mesh geometry={G.box} material={mats.hub} position={[0, 0, wz > 0 ? 0.105 : -0.105]} scale={[0.22, 0.06, 0.01]} />
          </group>
        )),
      )}
    </group>
  )
}

/* ==================================================================== scene glue */
function Driver({ sim, tempo }: { sim: Sim; tempo: { get(): number } }) {
  useFrame((_, dt) => {
    sim.tempo = tempo.get()
    sim.step(Math.min(dt, 1 / 30))
  })
  return null
}

function TagProjector({ els }: { els: React.RefObject<(HTMLElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    MACH.forEach((m, k) => {
      const el = els.current[k]
      if (!el) return
      v.set(m.x, m.top + 0.35, m.z).project(camera)
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0) translate(-50%, -100%)`
    })
  })
  return null
}

function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 1.65)
    l.position.set(6, 13, 4.5)
    l.target.position.set(0, 0, 1)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -13
    cam.right = cam.top = 13
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.025
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.05} color="#fbfcff" />
      <hemisphereLight args={['#ffffff', '#c3cad8', 0.55]} />
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  )
}

const MACH_HIT: { p: V3; s: V3 }[] = [
  { p: [0, 1.6, 0], s: [1.0, 3.3, 2.3] },
  { p: [0, 1.4, -0.3], s: [1.6, 2.8, 2.6] },
  { p: [0, 1.4, 0], s: [2.3, 2.8, 1.0] },
  { p: [0.5, 1.2, 0], s: [1.6, 2.4, 1.0] },
]
const LAMP: V3[] = [
  [0, 3.35, 0.55],
  [-0.66, 2.2, -0.86],
  [-0.7, 2.63, 0],
  [0.98, 2.4, 0],
]

/* ==================================================================== page */
export default function AssemblyLine() {
  const sim = useMemo(() => {
    const s = makeSim()
    // pre-warm so the line is already running on first paint (and in the poster)
    for (let i = 0; i < 60 * 40; i++) s.step(1 / 60)
    return s
  }, [])
  const tempo = useMotionValue(1)
  const [speed, setSpeed] = useState<'slow' | 'mid' | 'fast'>('mid')
  const [product, setProduct] = useState<'cube' | 'cyl' | 'gift'>('cube')
  const [modes, setModes] = useState<number[]>([0, 0, 0, 0])
  const [stats, setStats] = useState({ shipped: 0, rate: 0 })
  const tags = useRef<(HTMLElement | null)[]>([])
  const lastUser = useRef(-1e9)
  const autoFault = useRef<{ k: number; until: number } | null>(null)

  const touch = () => void (lastUser.current = performance.now())

  const setMode = useCallback(
    (k: number, mode: number) => {
      sim.setMode(k, mode)
      setModes(sim.machines.map((m) => m.mode))
    },
    [sim],
  )
  const cycle = (k: number) => {
    touch()
    autoFault.current = null
    setMode(k, (sim.machines[k].mode + 1) % 3)
  }
  const fixAll = () => {
    touch()
    autoFault.current = null
    sim.machines.forEach((_, k) => sim.setMode(k, 0))
    setModes([0, 0, 0, 0])
  }
  const breakOne = () => {
    touch()
    // break the busiest-looking one: 喷漆 sits mid-line so the pile-up is easy to see
    setMode(1, 2)
  }

  useEffect(() => {
    animate(tempo, speed === 'slow' ? 0.6 : speed === 'fast' ? 1.6 : 1, { duration: 0.9, ease: [0.4, 0, 0.2, 1] })
  }, [speed, tempo])
  useEffect(() => {
    sim.product = product === 'cube' ? 0 : product === 'cyl' ? 1 : 2
  }, [product, sim])

  useEffect(() => {
    const id = setInterval(() => setStats({ shipped: sim.shipped, rate: sim.rate() }), 300)
    // ambient: when nobody is playing, a machine jams now and then and gets fixed a few seconds later
    const amb = setInterval(() => {
      if (POSTER) return
      const now = performance.now()
      const af = autoFault.current
      if (af) {
        if (now > af.until) {
          autoFault.current = null
          if (sim.machines[af.k].mode === 2) setMode(af.k, 0)
        }
        return
      }
      if (now - lastUser.current < 15000) return
      if (sim.machines.some((m) => m.mode !== 0)) return
      if (Math.floor(now / 1000) % 16 !== 0) return
      const k = [1, 2, 0, 3][Math.floor(now / 16000) % 4]
      setMode(k, 2)
      autoFault.current = { k, until: now + 4200 }
    }, 1000)
    return () => {
      clearInterval(id)
      clearInterval(amb)
    }
  }, [sim, setMode])

  const anyFault = modes.includes(2)

  return (
    <div className="stage al-root" style={{ background: 'linear-gradient(180deg, #f3f5f9 0%, #e9edf3 60%, #dfe5ee 100%)' }}>
      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => void (gl.localClippingEnabled = true)}
      >
        <IsoRig fit={21} mobileFit={15.8} mobileOffsetY={0.1} offset={[0.18, -0.03]} target={[1.4, 0.8, -0.45]} />
        <Driver sim={sim} tempo={tempo} />
        <Lights />
        <Floor />
        <Walls />
        <Decor />
        <BeltSeg sim={sim} x={(AX0 - 0.3 + CX - 0.6) / 2} z={CZ} len={CX - 0.6 - (AX0 - 0.3)} rotY={0} />
        <BeltSeg sim={sim} x={CX} z={(CZ + 0.6 + BZ1 + 0.15) / 2} len={BZ1 + 0.15 - (CZ + 0.6)} rotY={-Math.PI / 2} />
        <Turntable sim={sim} />
        <Hopper sim={sim} />
        <MachineShell k={0} sim={sim} onHit={cycle} lamp={LAMP[0]} hit={MACH_HIT[0]}>
          <Press sim={sim} />
        </MachineShell>
        <MachineShell k={1} sim={sim} onHit={cycle} lamp={LAMP[1]} hit={MACH_HIT[1]}>
          <PaintBooth sim={sim} />
        </MachineShell>
        <MachineShell k={2} sim={sim} onHit={cycle} lamp={LAMP[2]} hit={MACH_HIT[2]}>
          <Boxer sim={sim} />
        </MachineShell>
        <MachineShell k={3} sim={sim} onHit={cycle} lamp={LAMP[3]} hit={MACH_HIT[3]}>
          <Labeler sim={sim} />
        </MachineShell>
        <Items sim={sim} />
        <Particles sim={sim} />
        <Truck sim={sim} i={0} />
        <Truck sim={sim} i={1} />
        <TagProjector els={tags} />
      </Canvas>

      {!POSTER && (
        <div className="al-tags">
          {MACH.map((m, k) => (
            <button key={k} ref={(e) => void (tags.current[k] = e)} className="al-tag" data-mode={modes[k]} onClick={() => cycle(k)}>
              <i />
              <b>{m.zh}</b>
              <span>{m.en}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.em
                  key={modes[k]}
                  initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                  transition={{ duration: 0.22 }}
                >
                  {MODE_ZH[modes[k]]}
                </motion.em>
              </AnimatePresence>
            </button>
          ))}
        </div>
      )}

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#f2a541' }} /> Isometric · CI/CD
          </p>
          <h1>
            每一次提交
            <br />
            都走完流水线
          </h1>
          <p>
            原料从料斗落下，依次经过冲压、喷漆、装箱、贴标，最后装车出厂——就像代码走过 build、lint、package、tag、deploy。点一下机器：加速 → 故障 → 恢复，看瓶颈和堆积怎么出现。
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={anyFault ? fixAll : breakOne}>
              {anyFault ? '一键修复' : '制造故障'}
            </button>
            <div className="al-stats">
              <span>
                已出厂 <b>{stats.shipped}</b>
              </span>
              <span>
                吞吐 <b>{stats.rate}</b>/min
              </span>
            </div>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'slow', label: '慢' },
              { value: 'mid', label: '中' },
              { value: 'fast', label: '快' },
            ]}
            value={speed}
            onChange={(v) => {
              touch()
              setSpeed(v)
            }}
          />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'cube', label: '方块' },
              { value: 'cyl', label: '圆柱' },
              { value: 'gift', label: '礼物' },
            ]}
            value={product}
            onChange={(v) => {
              touch()
              setProduct(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg al-fix" data-on={anyFault} onClick={fixAll}>
            <span className="al-long">一键修复</span>
            <span className="al-short">修复</span>
          </button>
        </div>
        <p className="hint">装箱最慢，是瓶颈 · 给它加速，吞吐就会上来</p>
      </div>

      <style>{`
        .al-root { --soft-bg: #f1f4f8; }
        .al-stats { display: flex; align-items: center; gap: 14px; height: 44px; padding: 0 18px; border-radius: 999px;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 14%, transparent); font: 13px/1 var(--sans); color: var(--fg-2); white-space: nowrap; }
        .al-stats b { font: 600 14px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; }
        .al-stats span + span { padding-left: 14px; border-left: 1px solid color-mix(in srgb, var(--fg) 14%, transparent); }
        .al-fix[data-on='true'] { color: #e5484d; }
        .al-short { display: none; }
        .al-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .al-tag { position: absolute; left: 0; top: 0; pointer-events: auto; display: inline-flex; align-items: center; gap: 6px;
          height: 28px; padding: 0 10px 0 9px; border: 0; border-radius: 999px; cursor: pointer; white-space: nowrap;
          background: rgba(255,255,255,.86); color: #1d1f24; font: 500 12px/1 var(--sans);
          box-shadow: 0 6px 18px -8px rgba(30,40,60,.35), inset 0 0 0 1px rgba(20,30,50,.06);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: background .2s, box-shadow .2s; will-change: transform; }
        .al-tag:hover { background: #fff; }
        .al-tag i { width: 7px; height: 7px; border-radius: 50%; background: #ffb020; box-shadow: 0 0 0 3px rgba(255,176,32,.18); }
        .al-tag[data-mode='1'] i { background: #22c55e; box-shadow: 0 0 0 3px rgba(34,197,94,.2); }
        .al-tag[data-mode='2'] i { background: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,.22); animation: al-blink .7s steps(2) infinite; }
        .al-tag[data-mode='2'] { box-shadow: 0 6px 18px -8px rgba(200,40,40,.45), inset 0 0 0 1px rgba(239,68,68,.45); }
        .al-tag span { font: 11px/1 var(--mono); color: #8a909c; }
        .al-tag em { font-style: normal; font-size: 11px; color: #6b7280; padding-left: 6px; border-left: 1px solid rgba(20,30,50,.1); display: inline-block; }
        .al-tag[data-mode='1'] em { color: #16a34a; }
        .al-tag[data-mode='2'] em { color: #dc2626; }
        @keyframes al-blink { 50% { opacity: .3; } }
        @media (max-width: 760px) {
          .al-tag { height: 24px; padding: 0 8px; font-size: 11px; }
          .al-tag span { display: none; }
          .al-root .al-long { display: none; } .al-root .al-short { display: inline; }
          .al-root .dock .seg { padding: 0 10px; }
          .al-root .hero-copy p:not(.kicker) { display: none; }
          .al-stats { padding: 0 14px; gap: 10px; }
          .al-stats span + span { padding-left: 10px; }
        }
      `}</style>
    </div>
  )
}
