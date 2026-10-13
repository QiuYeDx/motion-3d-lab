import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ data */
type Kind = 'bar' | 'area' | 'donut'
type DS = {
  key: string
  label: string
  unit: string
  max: number
  pct?: boolean
  series: [number[], number[]] // 2024, 2025
  partsTitle: string
  parts: { name: string; v: number }[]
}

const DATA: DS[] = [
  {
    key: 'rev',
    label: '营收',
    unit: '万元',
    max: 280,
    series: [
      [82, 76, 95, 104, 98, 121, 135, 128, 142, 156, 171, 198],
      [104, 97, 126, 141, 133, 162, 181, 170, 193, 212, 231, 266],
    ],
    partsTitle: '营收构成',
    parts: [
      { name: '订阅', v: 42 },
      { name: '广告', v: 23 },
      { name: '电商', v: 18 },
      { name: '授权', v: 10 },
      { name: '其他', v: 7 },
    ],
  },
  {
    key: 'users',
    label: '用户',
    unit: '万人',
    max: 160,
    series: [
      [38, 41, 40, 46, 52, 58, 71, 76, 63, 60, 66, 79],
      [74, 80, 77, 88, 97, 109, 134, 142, 118, 112, 126, 151],
    ],
    partsTitle: '新增来源',
    parts: [
      { name: '自然搜索', v: 34 },
      { name: '社交分享', v: 27 },
      { name: '好友推荐', v: 19 },
      { name: '投放', v: 12 },
      { name: '直接访问', v: 8 },
    ],
  },
  {
    key: 'ret',
    label: '留存',
    unit: '%',
    max: 80,
    pct: true,
    series: [
      [31, 34, 42, 38, 44, 47, 41, 45, 50, 46, 49, 52],
      [40, 44, 53, 49, 56, 60, 54, 59, 65, 61, 66, 71],
    ],
    partsTitle: '活跃分层',
    parts: [
      { name: '高频', v: 38 },
      { name: '中频', v: 29 },
      { name: '低频', v: 18 },
      { name: '回流', v: 10 },
      { name: '新客', v: 5 },
    ],
  },
]
const YEARS = ['2024', '2025']
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)
const N = 12
const NP = 5
const STEP = 1.0
const XS = (i: number) => (i - 5.5) * STEP
/** 2024 sits in front (lighter, usually shorter), 2025 behind it so both rows stay readable in iso */
const ROWZ = [0.3, -0.85]
const HMAX = 3.7
const CAP = 0.07
const WALL = { z: -1.85, x0: -6.3, x1: 6.3, h: 4.05 }
const DONUT_C: [number, number, number] = [0, 0, -0.3]
const R_IN = 1.5
const R_OUT = 2.65
const PAD = 0.04

const COL = { s0: '#a9c2fc', s1: '#3b6cf6', accent: '#ff7a45' }
const DONUT_COL = ['#2a4fd6', '#4b7bf8', '#7c9ffa', '#abc2fd', '#d3e0ff']

const fmtVal = (ds: DS, v: number, digits = 0) => (ds.pct ? `${v.toFixed(digits)}%` : `${v.toFixed(digits)} ${ds.unit}`)

/* ------------------------------------------------------------------ easing */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const backOut = (p: number, s = 1.6) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
const smooth = (v: number) => v * v * (3 - 2 * v)
const inOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2)
/** per-item local progress inside a staggered global progress */
const stag = (p: number, i: number, n: number, S: number) => clamp01(p * (1 + S) - (S * i) / Math.max(1, n - 1))

/* ------------------------------------------------------------------ shared store */
type Hover = { kind: Kind; s: number; i: number } | null
type Store = {
  h: MotionValue<number>[] // 24 bar heights (world units), index s*N+i
  val: MotionValue<number>[] // 24 displayed values (data units)
  share: MotionValue<number>[] // donut shares
  pBar: MotionValue<number>
  pArea: MotionValue<number>
  pDonut: MotionValue<number>
  pWall: MotionValue<number>
  pFloor: MotionValue<number>
  exiting: { bar: boolean; area: boolean; donut: boolean }
  hover: { current: Hover }
  /** written each frame by the charts, read by the DOM label pass */
  topY: Float32Array
  labelA: Float32Array
  tip: THREE.Vector3
  tipA: { v: number }
}

/* ------------------------------------------------------------------ geometry helpers */
function rrect(w: number, d: number, r: number) {
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

/** dynamic geometry with static index; positions/normals rewritten in place */
function dynGeo(verts: number, index: number[]) {
  const g = new THREE.BufferGeometry()
  const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3)
  const nor = new THREE.BufferAttribute(new Float32Array(verts * 3), 3)
  pos.setUsage(THREE.DynamicDrawUsage)
  nor.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('position', pos)
  g.setAttribute('normal', nor)
  g.setIndex(index)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 14)
  return g
}

/* ---------- area ribbon: front face, back face, top strip, two end caps */
const RS = 120 // samples along x
function ribbonGeo() {
  const idx: number[] = []
  const F = 0
  const B = RS * 2
  const T = RS * 4
  const C = RS * 6
  for (let k = 0; k < RS - 1; k++) {
    const fb = F + k * 2
    const ft = fb + 1
    idx.push(fb, fb + 2, ft, ft, fb + 2, ft + 2)
    const bb = B + k * 2
    const bt = bb + 1
    idx.push(bb, bt, bb + 2, bt, bt + 2, bb + 2)
    const tb = T + k * 2 // back edge
    const tf = tb + 1 // front edge
    idx.push(tb, tf, tb + 2, tf, tf + 2, tb + 2)
  }
  // caps: [bb, bf, tf, tb]
  idx.push(C, C + 1, C + 2, C, C + 2, C + 3)
  idx.push(C + 4, C + 6, C + 5, C + 4, C + 7, C + 6)
  return dynGeo(RS * 6 + 8, idx)
}

/** Catmull-Rom through 12 heights, clamped ends; returns y and dy/dx */
function sampleCurve(H: Float32Array, x: number, out: { y: number; d: number }) {
  let u = (x - XS(0)) / STEP
  if (u < 0) u = 0
  if (u > N - 1) u = N - 1
  const i = Math.min(N - 2, Math.floor(u))
  const t = u - i
  const p0 = H[Math.max(0, i - 1)]
  const p1 = H[i]
  const p2 = H[i + 1]
  const p3 = H[Math.min(N - 1, i + 2)]
  const a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3
  const b = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3
  const c = -0.5 * p0 + 0.5 * p2
  out.y = Math.max(0.03, ((a * t + b) * t + c) * t + p1)
  const inside = (x - XS(0)) / STEP >= 0 && (x - XS(0)) / STEP <= N - 1
  out.d = inside ? ((3 * a * t + 2 * b) * t + c) / STEP : 0
}

function writeRibbon(g: THREE.BufferGeometry, H: Float32Array, x0: number, x1: number, zc: number, depth: number, k: number) {
  const P = (g.attributes.position as THREE.BufferAttribute).array as Float32Array
  const Nn = (g.attributes.normal as THREE.BufferAttribute).array as Float32Array
  const zf = zc + depth / 2
  const zb = zc - depth / 2
  const o = { y: 0, d: 0 }
  const set = (v: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    P[v * 3] = x
    P[v * 3 + 1] = y
    P[v * 3 + 2] = z
    Nn[v * 3] = nx
    Nn[v * 3 + 1] = ny
    Nn[v * 3 + 2] = nz
  }
  let y0 = 0
  let yN = 0
  for (let s = 0; s < RS; s++) {
    const x = x0 + ((x1 - x0) * s) / (RS - 1)
    sampleCurve(H, x, o)
    const y = o.y * k
    const sl = o.d * k
    const il = 1 / Math.hypot(sl, 1)
    if (s === 0) y0 = y
    if (s === RS - 1) yN = y
    set(s * 2, x, 0, zf, 0, 0, 1)
    set(s * 2 + 1, x, y, zf, 0, 0, 1)
    set(RS * 2 + s * 2, x, 0, zb, 0, 0, -1)
    set(RS * 2 + s * 2 + 1, x, y, zb, 0, 0, -1)
    set(RS * 4 + s * 2, x, y, zb, -sl * il, il, 0)
    set(RS * 4 + s * 2 + 1, x, y, zf, -sl * il, il, 0)
  }
  const C = RS * 6
  set(C, x0, 0, zb, -1, 0, 0)
  set(C + 1, x0, 0, zf, -1, 0, 0)
  set(C + 2, x0, y0, zf, -1, 0, 0)
  set(C + 3, x0, y0, zb, -1, 0, 0)
  set(C + 4, x1, 0, zb, 1, 0, 0)
  set(C + 5, x1, 0, zf, 1, 0, 0)
  set(C + 6, x1, yN, zf, 1, 0, 0)
  set(C + 7, x1, yN, zb, 1, 0, 0)
  g.attributes.position.needsUpdate = true
  g.attributes.normal.needsUpdate = true
}

/* ---------- donut sector: top, outer wall, inner wall, two caps */
const DS_STEPS = 40
function sectorGeo() {
  const idx: number[] = []
  const S1 = DS_STEPS + 1
  const TOP = 0
  const OUT = S1 * 2
  const INN = S1 * 4
  const CAPS = S1 * 6
  for (let k = 0; k < DS_STEPS; k++) {
    const i0 = TOP + k * 2 // inner
    const o0 = i0 + 1 // outer
    idx.push(i0, i0 + 2, o0, o0, i0 + 2, o0 + 2)
    const b0 = OUT + k * 2
    const t0 = b0 + 1
    idx.push(b0, t0, b0 + 2, t0, t0 + 2, b0 + 2)
    const b1 = INN + k * 2
    const t1 = b1 + 1
    idx.push(b1, b1 + 2, t1, t1, b1 + 2, t1 + 2)
  }
  // caps verts: [ib, ob, ot, it]
  idx.push(CAPS, CAPS + 2, CAPS + 1, CAPS, CAPS + 3, CAPS + 2)
  idx.push(CAPS + 4, CAPS + 5, CAPS + 6, CAPS + 4, CAPS + 6, CAPS + 7)
  const g = dynGeo(S1 * 6 + 8, idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4)
  return g
}

function writeSector(g: THREE.BufferGeometry, a0: number, a1: number, h: number) {
  const P = (g.attributes.position as THREE.BufferAttribute).array as Float32Array
  const Nn = (g.attributes.normal as THREE.BufferAttribute).array as Float32Array
  const set = (v: number, x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    P[v * 3] = x
    P[v * 3 + 1] = y
    P[v * 3 + 2] = z
    Nn[v * 3] = nx
    Nn[v * 3 + 1] = ny
    Nn[v * 3 + 2] = nz
  }
  const S1 = DS_STEPS + 1
  for (let k = 0; k < S1; k++) {
    const a = a0 + ((a1 - a0) * k) / DS_STEPS
    const c = Math.cos(a)
    const s = Math.sin(a)
    set(k * 2, c * R_IN, h, s * R_IN, 0, 1, 0)
    set(k * 2 + 1, c * R_OUT, h, s * R_OUT, 0, 1, 0)
    set(S1 * 2 + k * 2, c * R_OUT, 0, s * R_OUT, c, 0, s)
    set(S1 * 2 + k * 2 + 1, c * R_OUT, h, s * R_OUT, c, 0, s)
    set(S1 * 4 + k * 2, c * R_IN, 0, s * R_IN, -c, 0, -s)
    set(S1 * 4 + k * 2 + 1, c * R_IN, h, s * R_IN, -c, 0, -s)
  }
  const C = S1 * 6
  const c0 = Math.cos(a0)
  const s0 = Math.sin(a0)
  const c1 = Math.cos(a1)
  const s1 = Math.sin(a1)
  set(C, c0 * R_IN, 0, s0 * R_IN, s0, 0, -c0)
  set(C + 1, c0 * R_OUT, 0, s0 * R_OUT, s0, 0, -c0)
  set(C + 2, c0 * R_OUT, h, s0 * R_OUT, s0, 0, -c0)
  set(C + 3, c0 * R_IN, h, s0 * R_IN, s0, 0, -c0)
  set(C + 4, c1 * R_IN, 0, s1 * R_IN, -s1, 0, c1)
  set(C + 5, c1 * R_OUT, 0, s1 * R_OUT, -s1, 0, c1)
  set(C + 6, c1 * R_OUT, h, s1 * R_OUT, -s1, 0, c1)
  set(C + 7, c1 * R_IN, h, s1 * R_IN, -s1, 0, c1)
  g.attributes.position.needsUpdate = true
  g.attributes.normal.needsUpdate = true
}

/* ------------------------------------------------------------------ hover plumbing */
function useHoverHandlers(st: Store, setTip: (h: Hover) => void) {
  return useMemo(
    () => ({
      enter: (h: NonNullable<Hover>) => {
        const c = st.hover.current
        if (c && c.kind === h.kind && c.s === h.s && c.i === h.i) return
        st.hover.current = h
        setTip(h)
        document.body.style.cursor = 'pointer'
      },
      leave: (kind: Kind, s?: number, i?: number) => {
        const c = st.hover.current
        if (!c || c.kind !== kind) return
        if (s !== undefined && (c.s !== s || (i !== undefined && c.i !== i))) return
        st.hover.current = null
        setTip(null)
        document.body.style.cursor = ''
      },
    }),
    [st, setTip],
  )
}
type HoverApi = ReturnType<typeof useHoverHandlers>

/* ------------------------------------------------------------------ bars */
function Bars({ st, hv }: { st: Store; hv: HoverApi }) {
  const body = useRef<THREE.InstancedMesh>(null)
  const cap = useRef<THREE.InstancedMesh>(null)
  const { bodyGeo, capGeo, mat } = useMemo(() => {
    const b = new THREE.ExtrudeGeometry(rrect(0.64, 0.64, 0.16), { depth: 1, bevelEnabled: false, curveSegments: 6 })
    b.rotateX(-Math.PI / 2)
    const c = new THREE.ExtrudeGeometry(rrect(0.64 - CAP * 2, 0.64 - CAP * 2, 0.16 - CAP), {
      depth: 0.001,
      bevelEnabled: true,
      bevelThickness: CAP,
      bevelSize: CAP,
      bevelSegments: 4,
      curveSegments: 6,
    })
    c.rotateX(-Math.PI / 2)
    return { bodyGeo: b, capGeo: c, mat: new THREE.MeshLambertMaterial({ color: '#ffffff' }) }
  }, [])
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      c: new THREE.Color(),
      base: [new THREE.Color(COL.s0), new THREE.Color(COL.s1)],
      acc: new THREE.Color(COL.accent),
      hk: new Float32Array(N * 2),
    }),
    [],
  )
  useLayoutEffect(() => {
    for (const m of [body.current, cap.current]) {
      if (!m) continue
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 14)
      for (let k = 0; k < N * 2; k++) m.setColorAt(k, tmp.base[k < N ? 0 : 1])
    }
  }, [tmp])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const b = body.current
    const c = cap.current
    if (!b || !c) return
    const p = st.pBar.get()
    const vis = p > 0.0005
    b.visible = c.visible = vis
    if (!vis) return
    const hov = st.hover.current
    const ex = st.exiting.bar
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < N; i++) {
        const k = s * N + i
        const order = ex ? N - 1 - i : i
        const l = stag(p, order + s * 0.6, N + 0.6, 0.85)
        const e = ex ? smooth(l) : backOut(l)
        const h = Math.max(0, st.h[k].get()) * e
        const on = hov && hov.kind === 'bar' && hov.s === s && hov.i === i ? 1 : 0
        tmp.hk[k] += (on - tmp.hk[k]) * Math.min(1, dt * 16)
        // footprint shrinks away as a bar sinks to nothing, so no flat caps linger on the floor
        const w = (1 + tmp.hk[k] * 0.1) * smooth(clamp01(h / 0.16))
        const x = XS(i)
        const z = ROWZ[s]
        tmp.m.makeScale(Math.max(w, 0.0001), Math.max(h - CAP, 0.0001), Math.max(w, 0.0001)).setPosition(x, 0, z)
        b.setMatrixAt(k, tmp.m)
        tmp.m.makeScale(Math.max(w, 0.0001), 1, Math.max(w, 0.0001)).setPosition(x, Math.max(h - CAP, 0), z)
        c.setMatrixAt(k, tmp.m)
        tmp.c.copy(tmp.base[s]).lerp(tmp.acc, tmp.hk[k])
        b.setColorAt(k, tmp.c)
        c.setColorAt(k, tmp.c)
        if (s === 1) {
          st.topY[i] = h
          st.labelA[i] = clamp01(l * 1.4 - 0.2)
        }
        if (on) {
          st.tip.set(x, h + 0.15, z)
          st.tipA.v = clamp01(l * 2 - 1)
        }
      }
    }
    b.instanceMatrix.needsUpdate = true
    c.instanceMatrix.needsUpdate = true
    b.instanceColor!.needsUpdate = true
    c.instanceColor!.needsUpdate = true
  })

  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (st.pBar.get() < 0.6 || e.instanceId === undefined) return
    hv.enter({ kind: 'bar', s: e.instanceId < N ? 0 : 1, i: e.instanceId % N })
  }
  const out = () => hv.leave('bar')
  return (
    <group>
      <instancedMesh ref={body} args={[bodyGeo, mat, N * 2]} castShadow receiveShadow frustumCulled={false} onPointerMove={move} onPointerOut={out} />
      <instancedMesh ref={cap} args={[capGeo, mat, N * 2]} castShadow frustumCulled={false} onPointerMove={move} onPointerOut={out} />
    </group>
  )
}

/* ------------------------------------------------------------------ area */
function Area({ st, hv }: { st: Store; hv: HoverApi }) {
  const geos = useMemo(() => [ribbonGeo(), ribbonGeo()], [])
  const mats = useMemo(
    () => [
      new THREE.MeshLambertMaterial({ color: COL.s0 }),
      new THREE.MeshLambertMaterial({ color: COL.s1 }),
    ],
    [],
  )
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const dot = useRef<THREE.Group>(null)
  const pucks = useRef<THREE.InstancedMesh>(null)
  const tmp = useMemo(() => ({ H: new Float32Array(N), o: { y: 0, d: 0 }, k: 0, m: new THREE.Matrix4() }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const p = st.pArea.get()
    const vis = p > 0.0005
    for (const m of meshes.current) if (m) m.visible = vis
    if (pucks.current) pucks.current.visible = vis
    const hov = st.hover.current
    const on = vis && hov && hov.kind === 'area' ? 1 : 0
    tmp.k += (on - tmp.k) * Math.min(1, dt * 14)
    if (dot.current) {
      dot.current.visible = vis && tmp.k > 0.01
      dot.current.scale.setScalar(Math.max(0.0001, tmp.k))
    }
    if (!vis) return
    const ex = st.exiting.area
    // grow: draw left→right, then lift; exit: flatten and retract from the left
    const reveal = ex ? smooth(clamp01(p * 1.4)) : inOut(clamp01(p * 1.35))
    const lift = ex ? smooth(clamp01(p * 1.6 - 0.2)) : backOut(clamp01(p * 1.25 - 0.25), 1.2)
    const xa = XS(0) - 0.32
    const xb = XS(N - 1) + 0.32
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < N; i++) tmp.H[i] = Math.max(0, st.h[s * N + i].get())
      const r = clamp01(reveal - s * 0.08) / (1 - s * 0.08)
      const x0 = ex ? xb - (xb - xa) * r : xa
      const x1 = ex ? xb : xa + (xb - xa) * r
      writeRibbon(geos[s], tmp.H, x0, Math.max(x1, x0 + 0.001), ROWZ[s], 0.78, lift)
      if (s === 1) {
        for (let i = 0; i < N; i++) {
          const inside = XS(i) >= x0 - 0.01 && XS(i) <= x1 + 0.01
          st.topY[i] = tmp.H[i] * lift + 0.16
          st.labelA[i] = inside ? clamp01(lift * 1.3 - 0.3) : 0
          const ps = Math.max(0.0001, st.labelA[i])
          tmp.m.makeScale(ps, ps, ps).setPosition(XS(i), tmp.H[i] * lift + 0.01, ROWZ[1])
          pucks.current?.setMatrixAt(i, tmp.m)
        }
        if (pucks.current) pucks.current.instanceMatrix.needsUpdate = true
      }
      if (hov && hov.kind === 'area' && hov.s === s) {
        sampleCurve(tmp.H, XS(hov.i), tmp.o)
        const y = tmp.o.y * lift
        st.tip.set(XS(hov.i), y + 0.15, ROWZ[s])
        st.tipA.v = clamp01(lift * 2 - 1)
        if (dot.current) dot.current.position.set(XS(hov.i), y, ROWZ[s] + 0.39)
      }
    }
  })

  const move = (s: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (st.pArea.get() < 0.6) return
    const i = Math.max(0, Math.min(N - 1, Math.round(e.point.x / STEP + 5.5)))
    hv.enter({ kind: 'area', s, i })
  }
  return (
    <group>
      {[0, 1].map((s) => (
        <mesh
          key={s}
          ref={(m) => void (meshes.current[s] = m)}
          geometry={geos[s]}
          material={mats[s]}
          castShadow
          receiveShadow
          frustumCulled={false}
          onPointerMove={move(s)}
          onPointerOut={() => hv.leave('area', s)}
        />
      ))}
      <instancedMesh ref={pucks} args={[undefined, undefined, N]} frustumCulled={false} raycast={() => null}>
        <cylinderGeometry args={[0.085, 0.085, 0.03, 20]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
      <group ref={dot} visible={false}>
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.13, 20, 14]} />
          <meshLambertMaterial color={COL.accent} emissive={COL.accent} emissiveIntensity={0.25} />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.22, 20, 14]} />
          <meshBasicMaterial color={COL.accent} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ donut */
function Donut({ st, hv }: { st: Store; hv: HoverApi }) {
  const geos = useMemo(() => Array.from({ length: NP }, sectorGeo), [])
  const mats = useMemo(() => DONUT_COL.map((c) => new THREE.MeshLambertMaterial({ color: c })), [])
  const base = useMemo(() => DONUT_COL.map((c) => new THREE.Color(c)), [])
  const acc = useMemo(() => new THREE.Color(COL.accent), [])
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const root = useRef<THREE.Group>(null)
  const hk = useMemo(() => new Float32Array(NP), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const p = st.pDonut.get()
    const vis = p > 0.0005
    if (root.current) root.current.visible = vis
    if (!vis) return
    const ex = st.exiting.donut
    const sweep = Math.PI * 2 * (ex ? smooth(clamp01(p * 1.15)) : inOut(clamp01(p * 1.2)))
    let sum = 0
    for (let c = 0; c < NP; c++) sum += Math.max(0.5, st.share[c].get())
    const f0 = Math.max(0.5, st.share[0].get()) / sum
    // first (largest, tallest) slice sits at the back (−x −z) so the shorter ones in front never hide it
    let a = (Math.PI * 5) / 4 - (f0 * sweep) / 2 - (1 - sweep / (Math.PI * 2)) * 1.2
    const hov = st.hover.current
    for (let c = 0; c < NP; c++) {
      const f = Math.max(0.5, st.share[c].get()) / sum
      const span = f * sweep
      const lp = stag(p, c, NP, 0.6)
      const h = (0.34 + (st.share[c].get() / 100) * 2.3) * (ex ? smooth(lp) : backOut(lp, 1.3))
      const pad = Math.min(PAD, span * 0.25)
      writeSector(geos[c], a + pad / 2, a + span - pad / 2, Math.max(0.001, h))
      const on = hov && hov.kind === 'donut' && hov.i === c ? 1 : 0
      hk[c] += (on - hk[c]) * Math.min(1, dt * 12)
      const mid = a + span / 2
      const m = meshes.current[c]
      if (m) {
        const lift = hk[c]
        m.position.set(Math.cos(mid) * 0.32 * lift, 0.14 * lift, Math.sin(mid) * 0.32 * lift)
        ;(m.material as THREE.MeshLambertMaterial).color.copy(base[c]).lerp(acc, lift)
      }
      if (on) {
        const rm = (R_IN + R_OUT) / 2 + 0.32
        st.tip.set(DONUT_C[0] + Math.cos(mid) * rm, h + 0.2, DONUT_C[2] + Math.sin(mid) * rm)
        st.tipA.v = clamp01(lp * 2 - 1)
      }
      a += span
    }
  })

  return (
    <group ref={root} position={DONUT_C}>
      {geos.map((g, c) => (
        <mesh
          key={c}
          ref={(m) => void (meshes.current[c] = m)}
          geometry={g}
          material={mats[c]}
          castShadow
          receiveShadow
          frustumCulled={false}
          onPointerMove={(e) => {
            e.stopPropagation()
            if (st.pDonut.get() < 0.6) return
            hv.enter({ kind: 'donut', s: 0, i: c })
          }}
          onPointerOut={() => hv.leave('donut', 0, c)}
        />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ stage: floor + back wall */
function useGridTexture() {
  return useMemo(() => {
    const W = 1536
    const H = 640
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    g.clearRect(0, 0, W, H)
    const ux = W / 13.4
    const uz = H / 5.6
    g.lineWidth = 2
    g.strokeStyle = 'rgba(59,108,246,0.08)'
    for (let i = -6; i <= 6; i++) {
      const x = (i + 6.7) * ux
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, H)
      g.stroke()
    }
    for (let j = -3; j <= 2; j++) {
      const y = (j + 3.1) * uz
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(W, y)
      g.stroke()
    }
    // soft edge fade
    const fade = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.55)
    fade.addColorStop(0, 'rgba(0,0,0,1)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalCompositeOperation = 'destination-in'
    g.fillStyle = fade
    g.fillRect(0, 0, W, H)
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [])
}

/** extruded rounded slab whose width can be stretched without distorting its corners */
function useStretchSlab(w0: number, d: number, h: number, r: number, b: number) {
  return useMemo(() => {
    const g = new THREE.ExtrudeGeometry(rrect(w0 - 2 * b, d - 2 * b, r - b), {
      depth: h - 2 * b,
      bevelEnabled: true,
      bevelThickness: b,
      bevelSize: b,
      bevelSegments: 4,
      curveSegments: 10,
    })
    g.rotateX(-Math.PI / 2)
    g.translate(0, -(h - b), 0)
    const base = (g.attributes.position.array as Float32Array).slice()
    return { g, base, last: -1 }
  }, [w0, d, h, r, b])
}
function stretch(s: ReturnType<typeof useStretchSlab>, w0: number, W: number) {
  const dx = (W - w0) / 2
  if (Math.abs(dx - s.last) < 1e-4) return
  s.last = dx
  const P = s.g.attributes.position.array as Float32Array
  for (let i = 0; i < P.length; i += 3) {
    const x = s.base[i]
    P[i] = x > 1e-4 ? x + dx : x < -1e-4 ? x - dx : x
  }
  s.g.attributes.position.needsUpdate = true
  s.g.computeBoundingSphere()
}
const FLOOR = { wide: 14.2, narrow: 6.9, d: 6.3 }

function Stage({ st }: { st: Store }) {
  const grid = useGridTexture()
  const wall = useRef<THREE.Group>(null)
  const gridMesh = useRef<THREE.Mesh>(null)
  const top = useStretchSlab(FLOOR.narrow, FLOOR.d, 0.7, 0.32, 0.12)
  const base = useStretchSlab(FLOOR.narrow + 0.5, FLOOR.d + 0.5, 0.36, 0.42, 0.1)
  useFrame(() => {
    const w = st.pWall.get()
    const f = st.pFloor.get()
    const W = FLOOR.narrow + (FLOOR.wide - FLOOR.narrow) * f
    stretch(top, FLOOR.narrow, W)
    stretch(base, FLOOR.narrow + 0.5, W + 0.5)
    if (gridMesh.current) gridMesh.current.scale.x = (W - 0.8) / 13.4
    if (!wall.current) return
    wall.current.visible = w > 0.002
    wall.current.scale.y = Math.max(0.001, w)
  })
  const lines = [1, 2, 3, 4]
  return (
    <group>
      <mesh geometry={top.g} position={[0, 0, -0.3]} receiveShadow>
        <meshLambertMaterial color="#fbfcff" />
      </mesh>
      <mesh geometry={base.g} position={[0, -0.62, -0.3]}>
        <meshLambertMaterial color="#d9e2f5" />
      </mesh>
      <mesh ref={gridMesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, -0.3]} receiveShadow>
        <planeGeometry args={[13.4, 5.6]} />
        <meshLambertMaterial map={grid} transparent depthWrite={false} />
      </mesh>
      <group ref={wall} position={[0, 0, WALL.z]}>
        <mesh position={[0, WALL.h / 2, -0.08]} castShadow receiveShadow>
          <boxGeometry args={[WALL.x1 - WALL.x0, WALL.h, 0.12]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        {lines.map((k) => (
          <mesh key={k} position={[0, (HMAX * k) / 4, -0.015]}>
            <boxGeometry args={[WALL.x1 - WALL.x0 - 0.3, 0.022, 0.012]} />
            <meshBasicMaterial color="#d3ddf3" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ DOM labels driven from 3D */
type LabelEls = {
  months: (HTMLDivElement | null)[]
  ticks: (HTMLDivElement | null)[]
  vals: (HTMLDivElement | null)[]
  tip: HTMLDivElement | null
  center: HTMLDivElement | null
}

function Labels({ st, els }: { st: Store; els: React.RefObject<LabelEls> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const last = useMemo(() => ({ txt: Array<string>(N).fill(''), op: new Float32Array(40).fill(-1) }), [])
  useFrame(({ camera, size }) => {
    const E = els.current
    if (!E) return
    const mobile = size.width < 760
    const put = (el: HTMLElement | null, x: number, y: number, z: number, op: number, slot: number) => {
      if (!el) return
      v.set(x, y, z).project(camera)
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
      const o = Math.round(op * 100) / 100
      if (last.op[slot] !== o) {
        last.op[slot] = o
        el.style.opacity = String(o)
        el.style.visibility = o <= 0.01 ? 'hidden' : 'visible'
      }
    }
    const w = clamp01(st.pWall.get())
    for (let i = 0; i < N; i++) put(E.months[i], XS(i), 0, ROWZ[0] + 0.62, w * (mobile && i % 2 ? 0 : 1), i)
    for (let k = 1; k <= 4; k++) put(E.ticks[k], WALL.x0 - 0.3, ((HMAX * k) / 4) * w, WALL.z, w, 12 + k)
    const showVals = st.pBar.get() + st.pArea.get() > 0.02 && !mobile
    for (let i = 0; i < N; i++) {
      const hv = st.hover.current
      const covered = hv && hv.kind !== 'donut' && hv.i === i
      const a = showVals && !covered && st.labelA[i] > 0.15 ? st.labelA[i] : 0
      put(E.vals[i], XS(i), st.topY[i] + 0.12, ROWZ[1], a, 17 + i)
      const el = E.vals[i]
      if (el && a > 0) {
        const t = String(Math.round(st.val[N + i].get() * clamp01(a * 1.2)))
        if (t !== last.txt[i]) {
          last.txt[i] = t
          ;(el.firstChild as HTMLElement).textContent = t
        }
      }
    }
    put(E.tip, st.tip.x, st.tip.y, st.tip.z, st.hover.current ? st.tipA.v : 0, 30)
    put(E.center, DONUT_C[0], 0, DONUT_C[2] + 0.15, clamp01(st.pDonut.get() * 1.6 - 0.6), 31)
  })
  return null
}

/* ------------------------------------------------------------------ count-up number */
function Num({ v, fmt }: { v: number; fmt: (n: number) => string }) {
  const mv = useMotionValue(v)
  const ref = useRef<HTMLSpanElement>(null)
  const fmtRef = useRef(fmt)
  fmtRef.current = fmt
  useEffect(() => {
    const write = (n: number) => {
      if (ref.current) ref.current.textContent = fmtRef.current(n)
    }
    write(mv.get())
    const off = mv.on('change', write)
    const c = animate(mv, v, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })
    return () => {
      off()
      c.stop()
    }
  }, [v, mv])
  return <span ref={ref}>{fmt(v)}</span>
}

/* ------------------------------------------------------------------ lighting */
function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fffaf2', 1.45)
    l.position.set(-3, 12, 9)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -11
    cam.right = cam.top = 11
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.025
    l.shadow.radius = 3
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.65} color="#f6f8ff" />
      <hemisphereLight args={['#ffffff', '#b8c6ea', 0.5]} />
      <primitive object={sun} />
    </>
  )
}

/* ------------------------------------------------------------------ page */
const KINDS: { value: Kind; label: string }[] = [
  { value: 'bar', label: '柱状' },
  { value: 'area', label: '面积' },
  { value: 'donut', label: '环形' },
]

export default function IsoCharts() {
  const [kind, setKind] = useState<Kind>('bar')
  const [dsi, setDsi] = useState(0)
  const [tip, setTip] = useState<Hover>(null)
  const ds = DATA[dsi]

  const st = useMemo<Store>(() => {
    const d = DATA[0]
    const mv = (n: number) => motionValue(n)
    return {
      h: Array.from({ length: N * 2 }, (_, k) => mv((d.series[k < N ? 0 : 1][k % N] / d.max) * HMAX)),
      val: Array.from({ length: N * 2 }, (_, k) => mv(d.series[k < N ? 0 : 1][k % N])),
      share: d.parts.map((p) => mv(p.v)),
      pBar: mv(POSTER ? 1 : 0),
      pArea: mv(0),
      pDonut: mv(0),
      pWall: mv(POSTER ? 1 : 0),
      pFloor: mv(POSTER ? 1 : 0.35),
      exiting: { bar: false, area: false, donut: false },
      hover: { current: null },
      topY: new Float32Array(N),
      labelA: new Float32Array(N),
      tip: new THREE.Vector3(),
      tipA: { v: 0 },
    }
  }, [])

  const els = useRef<LabelEls>({ months: [], ticks: [], vals: [], tip: null, center: null })
  const hv = useHoverHandlers(st, setTip)
  const lastTouch = useRef(POSTER ? Infinity : -1e9)
  const touch = useCallback(() => void (lastTouch.current = performance.now()), [])

  /* dataset change → every bar springs to its new height, left→right */
  const firstDs = useRef(true)
  useEffect(() => {
    if (firstDs.current) {
      firstDs.current = false
      return
    }
    const ctl: { stop: () => void }[] = []
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < N; i++) {
        const k = s * N + i
        const target = (ds.series[s][i] / ds.max) * HMAX
        const delay = i * 0.045 + s * 0.06
        ctl.push(animate(st.h[k], target, { type: 'spring', stiffness: 150, damping: 11, mass: 1, delay }))
        ctl.push(animate(st.val[k], ds.series[s][i], { duration: 0.9, ease: [0.22, 1, 0.36, 1], delay }))
      }
    }
    ds.parts.forEach((p, c) => ctl.push(animate(st.share[c], p.v, { type: 'spring', stiffness: 110, damping: 14, delay: c * 0.05 })))
    return () => ctl.forEach((c) => c.stop())
  }, [ds, st])

  /* chart type change → outgoing sinks / retracts, incoming grows */
  const firstKind = useRef(true)
  useEffect(() => {
    const map: Record<Kind, MotionValue<number>> = { bar: st.pBar, area: st.pArea, donut: st.pDonut }
    const first = firstKind.current
    firstKind.current = false
    if (POSTER && first) return
    const ctl: { stop: () => void }[] = []
    for (const k of Object.keys(map) as Kind[]) {
      const mv = map[k]
      if (k === kind) {
        st.exiting[k] = false
        ctl.push(animate(mv, 1, { duration: k === 'donut' ? 1.25 : 1.35, ease: 'linear', delay: first ? 0.35 : 0.42 }))
      } else if (mv.get() > 0) {
        st.exiting[k] = true
        ctl.push(animate(mv, 0, { duration: 0.6, ease: 'linear' }))
      }
    }
    ctl.push(animate(st.pWall, kind === 'donut' ? 0 : 1, { type: 'spring', stiffness: 120, damping: 17, delay: kind === 'donut' ? 0.05 : 0.45 }))
    ctl.push(animate(st.pFloor, kind === 'donut' ? 0 : 1, { type: 'spring', stiffness: 80, damping: 12, delay: kind === 'donut' ? 0.45 : 0 }))
    return () => ctl.forEach((c) => c.stop())
  }, [kind, st])

  /* idle loop: cycle datasets, and every third step the chart type */
  const step = useRef(0)
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastTouch.current < 9000 || st.hover.current || document.hidden) return
      step.current++
      setDsi((d) => (d + 1) % DATA.length)
      if (step.current % 3 === 0) setKind((k) => KINDS[(KINDS.findIndex((x) => x.value === k) + 1) % KINDS.length].value)
    }, 4200)
    return () => clearInterval(id)
  }, [st])

  // hover is invalid after a type switch
  useEffect(() => {
    st.hover.current = null
    setTip(null)
    document.body.style.cursor = ''
  }, [kind, st])
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const s1 = ds.series[1]
  const s0 = ds.series[0]
  const mean1 = s1.reduce((a, b) => a + b, 0) / N
  const mean0 = s0.reduce((a, b) => a + b, 0) / N
  const yoy = ds.pct ? mean1 - mean0 : (mean1 / mean0 - 1) * 100
  const ticks = [0, 1, 2, 3, 4].map((k) => Math.round((ds.max * k) / 4))
  // (0 is implied by the floor; only 1..4 are drawn)
  const top = ds.parts.reduce((a, b) => (b.v > a.v ? b : a))
  const centerPart = tip && tip.kind === 'donut' ? ds.parts[tip.i] : top

  const tipBody = (() => {
    if (!tip) return null
    if (tip.kind === 'donut') {
      const p = ds.parts[tip.i]
      const total = ds.series[1].reduce((x, y) => x + y, 0)
      const sub = ds.key !== 'rev' ? `排名第 ${tip.i + 1}` : `≈ ${Math.round((total * p.v) / 100).toLocaleString()} ${ds.unit} / 年`
      return { key: `d${tip.i}${dsi}`, title: `${ds.partsTitle} · ${p.name}`, value: `${p.v}%`, sub }
    }
    const v = ds.series[tip.s][tip.i]
    const prev = ds.series[0][tip.i]
    const d = tip.s === 1 ? (ds.pct ? `同比 +${(v - prev).toFixed(0)} pt` : `同比 ${v >= prev ? '+' : ''}${(((v / prev) - 1) * 100).toFixed(1)}%`) : '基期'
    return { key: `${tip.kind}${tip.s}${tip.i}${dsi}`, title: `${YEARS[tip.s]} · ${MONTHS[tip.i]}`, value: fmtVal(ds, v), sub: d }
  })()

  return (
    <div className="stage ic-root" style={{ background: 'linear-gradient(180deg, #f5f7fc 0%, #eaeff8 58%, #dfe6f3 100%)' }}>
      <div aria-hidden className="ic-glow" />
      <Canvas
        orthographic
        flat
        shadows
        dpr={[1, 2]}
        camera={{ near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true }}
        onPointerDown={touch}
        onPointerMissed={() => {
          st.hover.current = null
          setTip(null)
        }}
      >
        <IsoRig fit={22} mobileFit={15.9} mobileOffsetY={0.15} offset={[0.2, -0.02]} target={[0, 1.1, -0.3]} />
        <Lights />
        <Stage st={st} />
        <Bars st={st} hv={hv} />
        <Area st={st} hv={hv} />
        <Donut st={st} hv={hv} />
        <Labels st={st} els={els} />
      </Canvas>

      {/* 3D-anchored DOM labels */}
      <div className="ic-layer" aria-hidden>
        {MONTHS.map((m, i) => (
          <div key={m} ref={(e) => void (els.current.months[i] = e)} className="ic-pin ic-month">
            <span>{m}</span>
          </div>
        ))}
        {ticks.map((t, k) => k > 0 && (
          <div key={k} ref={(e) => void (els.current.ticks[k] = e)} className="ic-pin ic-tick">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${ds.key}${t}`}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                transition={{ duration: 0.35, delay: k * 0.03 }}
              >
                {t}
                {k === 4 && <em>{ds.unit}</em>}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
        {MONTHS.map((m, i) => (
          <div key={`v${m}`} ref={(e) => void (els.current.vals[i] = e)} className="ic-pin ic-val">
            <span />
          </div>
        ))}
        <div ref={(e) => void (els.current.center = e)} className="ic-pin ic-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={`${ds.key}${centerPart.name}`}
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(4px)' }}
              transition={{ duration: 0.3 }}
            >
              <b>{centerPart.v}%</b>
              <span>{centerPart.name}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div ref={(e) => void (els.current.tip = e)} className="ic-pin ic-tipwrap" aria-live="polite">
        <AnimatePresence>
          {tipBody && (
            <motion.div
              key={tipBody.key}
              className="ic-tip"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 34 }}
            >
              <span>{tipBody.title}</span>
              <b>{tipBody.value}</b>
              <em>{tipBody.sub}</em>
            </motion.div>
          )}
        </AnimatePresence>
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
            <i style={{ background: COL.accent }} /> Isometric · Data viz
          </p>
          <h1>
            把数据
            <br />
            立起来看
          </h1>
          <p className="ic-lede">柱状、面积、环形三种图表做成等距立体件。切换数据时每根柱子从左到右弹性生长，数字随之滚动；悬停任意柱子、曲面或扇区查看数值。</p>

          <div className="ic-legend">
            <AnimatePresence mode="popLayout" initial={false}>
              {(kind === 'donut'
                ? ds.parts.map((p, c) => ({ id: `${ds.key}${p.name}`, c: DONUT_COL[c], t: p.name, v: `${p.v}%`, hi: tip?.kind === 'donut' && tip.i === c }))
                : YEARS.map((y, s) => ({ id: `y${y}`, c: s ? COL.s1 : COL.s0, t: y, v: s ? '本期' : '基期', hi: tip?.kind !== 'donut' && tip?.s === s }))
              ).map((it, n) => (
                <motion.span
                  key={it.id}
                  layout
                  className={`ic-chip${it.hi ? ' on' : ''}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, delay: n * 0.04 }}
                >
                  <i style={{ background: it.c }} />
                  {it.t}
                  <em>{it.v}</em>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          <div className="ic-kpis">
            <div>
              <span>12 月 · {ds.label}</span>
              <b>
                <Num v={s1[N - 1]} fmt={(n) => (ds.pct ? `${n.toFixed(0)}%` : n.toFixed(0))} />
                {!ds.pct && <small>{ds.unit}</small>}
              </b>
            </div>
            <div>
              <span>全年均值</span>
              <b>
                <Num v={mean1} fmt={(n) => (ds.pct ? `${n.toFixed(1)}%` : n.toFixed(0))} />
                {!ds.pct && <small>{ds.unit}</small>}
              </b>
            </div>
            <div className="ic-up">
              <span>同比</span>
              <b>
                <Num v={yoy} fmt={(n) => `+${n.toFixed(1)}`} />
                <small>{ds.pct ? 'pt' : '%'}</small>
              </b>
            </div>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={KINDS}
            value={kind}
            onChange={(v) => {
              touch()
              setKind(v)
            }}
          />
          <span className="dock-sep" />
          <Seg
            items={DATA.map((d, i) => ({ value: i, label: d.label }))}
            value={dsi}
            onChange={(v) => {
              touch()
              setDsi(v)
            }}
          />
        </div>
        <p className="hint">悬停查看数值 · 闲置时自动轮播</p>
      </div>

      <style>{`
        .ic-root { --soft-bg: #f1f4fb; --accent: ${COL.accent}; }
        .ic-glow { position: absolute; right: 12%; top: 10%; width: min(42vw, 560px); aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle, rgba(140,170,255,.28) 0%, rgba(140,170,255,.12) 45%, transparent 70%); pointer-events: none; }
        .ic-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .ic-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; will-change: transform; }
        .ic-month span, .ic-val span { position: absolute; left: 0; top: 0; white-space: nowrap; }
        .ic-month span { translate: -50% 4px; font: 500 11px/1 var(--mono); color: #6b7896; }
        .ic-tick { display: flex; justify-content: flex-end; align-items: center; white-space: nowrap; }
        .ic-tick span { display: inline-flex; align-items: baseline; gap: 4px; padding-right: 8px; translate: 0 -50%;
          font: 500 11px/1 var(--mono); color: #7d89a6; }
        .ic-tick em { font-style: normal; font-size: 10px; color: #a1abc4; }
        .ic-val span { translate: -50% calc(-100% - 3px); font: 600 11px/1 var(--mono); color: #2a4fd6; }
        .ic-center { display: flex; justify-content: center; align-items: center; }
        .ic-center > div { display: flex; flex-direction: column; align-items: center; gap: 4px; translate: 0 -50%; white-space: nowrap; }
        .ic-center b { font: 650 22px/1 var(--display); letter-spacing: -0.02em; color: #1b2a55; }
        .ic-center span { font: 500 11px/1 var(--mono); color: #6b7896; }
        .ic-tipwrap { z-index: 3; }
        .ic-tip { position: absolute; left: 0; bottom: 6px; translate: -50% 0; transform-origin: 50% 100%;
          display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 14px 8px; border-radius: 14px; white-space: nowrap;
          background: rgba(255,255,255,.94); color: #18213b; box-shadow: 0 14px 30px -14px rgba(30,50,110,.45), inset 0 0 0 1px rgba(30,50,110,.07); }
        .ic-tip span { font: 500 11px/1 var(--mono); color: #7a86a3; }
        .ic-tip b { font: 650 18px/1.1 var(--display); letter-spacing: -0.01em; }
        .ic-tip em { font: 500 11px/1 var(--mono); font-style: normal; color: ${COL.accent}; }
        .ic-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 22px; min-height: 30px; }
        .ic-chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px 0 10px; border-radius: 999px;
          background: rgba(255,255,255,.7); box-shadow: inset 0 0 0 1px rgba(30,50,110,.08); font-size: 13px; color: var(--fg);
          transition: box-shadow .2s, background .2s; }
        .ic-chip i { width: 10px; height: 10px; border-radius: 3px; }
        .ic-chip em { font: 500 11px/1 var(--mono); font-style: normal; color: var(--fg-2); }
        .ic-chip.on { background: #fff; box-shadow: inset 0 0 0 1.5px ${COL.accent}; }
        .ic-kpis { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 28px; margin-top: 26px; }
        .ic-kpis > div { display: flex; flex-direction: column; gap: 8px; }
        .ic-kpis > div > span { font: 500 11px/1 var(--mono); letter-spacing: .04em; color: var(--fg-2); }
        .ic-kpis b { font: 650 28px/1 var(--display); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
        .ic-kpis small { margin-left: 4px; font: 500 12px/1 var(--sans); color: var(--fg-2); letter-spacing: 0; }
        .ic-up b { color: #2a4fd6; }
        @media (max-width: 760px) {
          .ic-lede { display: none; }
          .ic-kpis { gap: 20px; margin-top: 18px; }
          .ic-kpis b { font-size: 22px; }
          .ic-legend { margin-top: 16px; }
          .ic-glow { right: -10%; top: 8%; width: 80vw; }
          .ic-center b { font-size: 17px; }
          .ic-tick span { font-size: 10px; }
        }
      `}</style>
    </div>
  )
}
