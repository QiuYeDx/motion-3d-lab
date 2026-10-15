/* Story timeline + motion paths for OrderJourney. Everything is a pure function of story time t (seconds at 1×),
   so restart / jump-to-station / poster are just "set t". */
import * as THREE from 'three'

export const T_END = 35.5

export type Station = { key: string; zh: string; sub: string; time: string; start: number; at: number }
/** start = where "jump" lands, at = when the status bubble pops / tracker step completes */
export const STATIONS: Station[] = [
  { key: 'order', zh: '订单已提交', sub: '随行保温杯 ×1 · ¥129', time: '10:24', start: 0, at: 3.4 },
  { key: 'pick', zh: '仓库拣货', sub: '智能仓 WH-03 · A2 货架', time: '10:41', start: 5.0, at: 7.2 },
  { key: 'pack', zh: '打包贴单', sub: '运单 SF 2610 1524', time: '11:05', start: 10.6, at: 13.3 },
  { key: 'ship', zh: '运输中', sub: '途经梧桐路 · 等红灯', time: '13:30', start: 14.6, at: 15.2 },
  { key: 'deliver', zh: '派送中', sub: '快递员小周 · 预计 10 分钟', time: '16:12', start: 23.9, at: 25.2 },
  { key: 'done', zh: '已签收', sub: '放在家门口 · 本人签收', time: '16:38', start: 29.0, at: 30.4 },
]

export function stationOf(t: number) {
  let i = 0
  for (let k = 0; k < STATIONS.length; k++) if (t >= STATIONS[k].start) i = k
  return i
}
export function reachedOf(t: number) {
  let n = 0
  for (const s of STATIONS) if (t >= s.at) n++
  return n
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const smooth = (v: number) => v * v * (3 - 2 * v)
export const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2)
export const backOut = (p: number, s = 1.7) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
/** 0→1 over [a, b] with easing */
export const span = (t: number, a: number, b: number, f: (v: number) => number = ease) => f(clamp01((t - a) / (b - a)))

/** piecewise eased keyframes [[t, v], ...] */
export function keys(t: number, k: [number, number][]) {
  if (t <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1]
      const [t1, v1] = k[i]
      return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0))
    }
  }
  return k[k.length - 1][1]
}

/* ------------------------------------------------------------------ polyline path with rounded corners (x, z) */
export type Pose = { x: number; z: number; yaw: number }
export class Path {
  xs: number[] = []
  zs: number[] = []
  cum: number[] = []
  L = 0
  constructor(corners: [number, number][], r = 0.55) {
    const P = corners.map(([x, z]) => new THREE.Vector2(x, z))
    const out: THREE.Vector2[] = [P[0].clone()]
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i].clone().sub(P[i - 1])
      const b = P[i + 1].clone().sub(P[i])
      const rr = Math.min(r, a.length() / 2, b.length() / 2)
      a.normalize()
      b.normalize()
      const p0 = P[i].clone().addScaledVector(a, -rr)
      const p2 = P[i].clone().addScaledVector(b, rr)
      for (let k = 0; k <= 10; k++) {
        const u = k / 10
        const w0 = (1 - u) * (1 - u)
        const w1 = 2 * (1 - u) * u
        const w2 = u * u
        out.push(new THREE.Vector2(p0.x * w0 + P[i].x * w1 + p2.x * w2, p0.y * w0 + P[i].y * w1 + p2.y * w2))
      }
    }
    out.push(P[P.length - 1].clone())
    let acc = 0
    out.forEach((p, i) => {
      if (i > 0) acc += p.distanceTo(out[i - 1])
      this.xs.push(p.x)
      this.zs.push(p.y)
      this.cum.push(acc)
    })
    this.L = acc
  }
  at(s: number, o: Pose) {
    s = Math.max(0, Math.min(this.L, s))
    let i = 1
    while (i < this.cum.length - 1 && this.cum[i] < s) i++
    const s0 = this.cum[i - 1]
    const s1 = this.cum[i]
    const f = s1 > s0 ? (s - s0) / (s1 - s0) : 0
    const dx = this.xs[i] - this.xs[i - 1]
    const dz = this.zs[i] - this.zs[i - 1]
    o.x = this.xs[i - 1] + dx * f
    o.z = this.zs[i - 1] + dz * f
    if (dx || dz) o.yaw = Math.atan2(-dz, dx)
    return o
  }
  /** arc length of the sample nearest to (x, z) */
  nearest(x: number, z: number) {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < this.xs.length; i++) {
      const d = (this.xs[i] - x) ** 2 + (this.zs[i] - z) ** 2
      if (d < bd) {
        bd = d
        best = this.cum[i]
      }
    }
    return best
  }
}

/** local (lx, ly, lz) in a yawed frame → world */
export function local(p: Pose, lx: number, ly: number, lz: number, out: THREE.Vector3) {
  const c = Math.cos(p.yaw)
  const s = Math.sin(p.yaw)
  return out.set(p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c)
}

/* ------------------------------------------------------------------ world layout */
export const PHONE = { x: -5.0, z: -3.2 }
export const TABLE = { x: 2.55, z: -3.35, top: 0.72 }
export const PARCEL_ON_TABLE = new THREE.Vector3(2.45, TABLE.top, -3.35)
export const SHELF_ITEM = new THREE.Vector3(-0.6, 0.47, -3.92)
export const CONVEYOR = { x0: 3.2, x1: 4.45, z: -3.35, top: 0.6 }
export const BED_Y = 0.31
export const RACK_Y = 0.47
export const DOOR = { x: -3.98, z: 4.4 }

export const ROBOT_A = new Path([
  [-2.6, -2.2],
  [-0.6, -2.2],
  [-0.6, -3.38],
])
export const ROBOT_B = new Path([
  [-0.6, -3.38],
  [-0.6, -2.2],
  [1.6, -2.2],
  [1.6, -3.0],
])
export const TRUCK = new Path(
  [
    [5.0, -2.75],
    [5.0, -0.4],
    [2.0, -0.4],
    [2.0, 3.4],
    [1.15, 3.4],
  ],
  0.62,
)
export const SCOOTER = new Path(
  [
    [-0.25, 3.4],
    [-1.6, 3.4],
    [-1.6, 4.4],
    [-3.45, 4.4],
  ],
  0.45,
)
const TRUCK_STOP = TRUCK.nearest(2.0, 0.12)

/* traffic light at (2, 1.6): red while the truck waits */
export function lightState(t: number): 0 | 1 | 2 {
  // 0 green · 1 yellow · 2 red
  if (t >= 15.6 && t < 16.2) return 1
  if (t >= 16.2 && t < 19.9) return 2
  return 0
}

const _pose: Pose = { x: 0, z: 0, yaw: 0 }
export function robotPose(t: number, o: Pose = _pose) {
  if (t < 7.6) {
    const s = keys(t, [
      [5.0, 0],
      [6.7, ROBOT_A.L],
    ])
    ROBOT_A.at(s, o)
  } else {
    const s = keys(t, [
      [7.6, 0],
      [9.7, ROBOT_B.L],
    ])
    ROBOT_B.at(s, o)
  }
  return o
}
/** lift plate height on the robot */
export function robotLift(t: number) {
  return 0.06 * span(t, 6.75, 7.15) * (1 - span(t, 9.8, 10.1))
}

export function truckPose(t: number, o: Pose = _pose) {
  const s = keys(t, [
    [14.95, 0],
    [18.5, TRUCK_STOP],
    [20.05, TRUCK_STOP],
    [23.8, TRUCK.L],
  ])
  return TRUCK.at(s, o)
}
export function truckSpeed(t: number) {
  const a = truckPose(t, { x: 0, z: 0, yaw: 0 })
  const b = truckPose(t + 0.05, { x: 0, z: 0, yaw: 0 })
  return Math.hypot(b.x - a.x, b.z - a.z) / 0.05
}
export function scooterPose(t: number, o: Pose = _pose) {
  const s = keys(t, [
    [25.0, 0],
    [28.8, SCOOTER.L],
  ])
  return SCOOTER.at(s, o)
}

/* courier on foot near the door (after 29.0) */
export function courierWalk(t: number, out: THREE.Vector3) {
  const a = span(t, 29.0, 29.8) * (1 - span(t, 30.9, 31.7))
  const sp = scooterPose(29, { x: 0, z: 0, yaw: 0 })
  const sx = sp.x + 0.05
  const sz = sp.z - 0.32
  return out.set(sx + (DOOR.x + 0.32 - sx) * a, 0, sz + (DOOR.z - sz) * a)
}

/* ------------------------------------------------------------------ where the order is */
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _pa: Pose = { x: 0, z: 0, yaw: 0 }
const _pb: Pose = { x: 0, z: 0, yaw: 0 }

/** the product (picked item) — on the shelf, on the robot, then into the open parcel */
export function productPos(t: number, out: THREE.Vector3) {
  if (t < 6.75) return out.copy(SHELF_ITEM)
  if (t < 7.2) {
    // slide off the shelf onto the lift plate
    const r = robotPose(6.8, _pa)
    local(r, 0, 0.36, 0, _v)
    const u = span(t, 6.75, 7.2)
    return out.copy(SHELF_ITEM).lerp(_v, u).setY(SHELF_ITEM.y + (0.36 - SHELF_ITEM.y) * u + Math.sin(u * Math.PI) * 0.08)
  }
  if (t < 9.85) {
    const r = robotPose(t, _pa)
    return local(r, 0, 0.3 + robotLift(t), 0, out)
  }
  const r = robotPose(9.85, _pa)
  local(r, 0, 0.36, 0, _v)
  const u = span(t, 9.85, 10.55)
  _w.copy(PARCEL_ON_TABLE).setY(TABLE.top + 0.06)
  out.copy(_v).lerp(_w, u)
  out.y += Math.sin(u * Math.PI) * 0.45
  return out
}

/** the parcel box (kraft) */
export function parcelPos(t: number, out: THREE.Vector3) {
  if (t < 13.55) return out.copy(PARCEL_ON_TABLE)
  if (t < 14.15) {
    const u = span(t, 13.55, 14.15, (v) => v)
    return out.set(PARCEL_ON_TABLE.x + (CONVEYOR.x1 - PARCEL_ON_TABLE.x) * u, TABLE.top + (CONVEYOR.top - TABLE.top) * u, PARCEL_ON_TABLE.z + (CONVEYOR.z - PARCEL_ON_TABLE.z) * smooth(clamp01(u * 3)))
  }
  if (t < 14.6) {
    const u = span(t, 14.15, 14.6)
    truckPose(14.6, _pa)
    local(_pa, -0.42, BED_Y, 0, _v)
    out.set(CONVEYOR.x1, CONVEYOR.top, CONVEYOR.z).lerp(_v, u)
    out.y += Math.sin(u * Math.PI) * 0.35
    return out
  }
  if (t < 24.0) return local(truckPose(t, _pa), -0.42, BED_Y, 0, out)
  if (t < 24.8) {
    const u = span(t, 24.0, 24.8)
    local(truckPose(24, _pa), -0.42, BED_Y, 0, _v)
    local(scooterPose(24.8, _pb), -0.27, RACK_Y, 0, _w)
    out.copy(_v).lerp(_w, u)
    out.y += Math.sin(u * Math.PI) * 0.7
    return out
  }
  if (t < 29.0) return local(scooterPose(t, _pa), -0.27, RACK_Y, 0, out)
  if (t < 29.85) {
    // courier carries it in front
    courierWalk(t, _v)
    const sp = scooterPose(29, _pa)
    local(sp, -0.27, RACK_Y, 0, _w)
    const u = span(t, 29.0, 29.25)
    _v.y = 0.42
    _v.x += 0.14
    return out.copy(_w).lerp(_v, u)
  }
  const u = span(t, 29.85, 30.25)
  courierWalk(29.85, _v)
  _v.set(_v.x + 0.14, 0.42, _v.z)
  _w.set(DOOR.x + 0.2, 0.02, DOOR.z + 0.04)
  return out.copy(_v).lerp(_w, u)
}

/** what the camera follows */
export function focusPos(t: number, out: THREE.Vector3) {
  if (t < 4.6) return out.set(PHONE.x + 0.2, 1.0, PHONE.z + 0.2)
  if (t < 5.6) {
    const u = span(t, 4.6, 5.6)
    robotPose(5.0, _pa)
    return out.set(PHONE.x + 0.2 + (_pa.x - PHONE.x - 0.2) * u, 1.0 - 0.6 * u, PHONE.z + 0.2 + (_pa.z - PHONE.z - 0.2) * u)
  }
  if (t < 10.0) {
    robotPose(t, _pa)
    return out.set(_pa.x, 0.4, _pa.z)
  }
  if (t < 14.95) {
    parcelPos(t, out)
    out.y = 0.5
    return out
  }
  if (t < 24.0) {
    truckPose(t, _pa)
    return out.set(_pa.x, 0.4, _pa.z)
  }
  if (t < 29.0) {
    parcelPos(t, out)
    out.y = 0.4
    return out
  }
  return out.set(DOOR.x + 0.4, 0.5, DOOR.z - 0.1)
}

/** status bubble anchor of station i */
export function bubbleAnchor(i: number, t: number, out: THREE.Vector3) {
  switch (i) {
    case 0:
      return out.set(PHONE.x, 2.55, PHONE.z)
    case 1:
      return out.set(SHELF_ITEM.x, 1.6, SHELF_ITEM.z)
    case 2:
      return out.set(TABLE.x, 1.75, TABLE.z)
    case 3:
      truckPose(Math.min(t, 24), _pa)
      return out.set(_pa.x, 1.25, _pa.z)
    case 4:
      scooterPose(Math.min(t, 29), _pa)
      return out.set(_pa.x, 1.25, _pa.z)
    default:
      return out.set(DOOR.x - 0.5, 2.3, DOOR.z - 0.1)
  }
}
