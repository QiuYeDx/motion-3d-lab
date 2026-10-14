import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  PUPPET_DYES,
  createPuppetEffect,
  puppetMeta,
  puppetModes,
  setPuppetFlicker,
  setPuppetMode,
  setPuppetRig,
  setPuppetRods,
  type PuppetMode,
  type PuppetRigLayer,
} from './effects/puppet'
import { useOriginalSplit, type SplitState } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 皮影 showcase — a 皮影戏 stage: a Monkey-King-like warrior built from flat jointed pieces (head with
 * pheasant plumes, armour, tiger-skin skirt, legs, two arms, golden-banded cudgel) acts out a short loop —
 * walks in, twirls the cudgel, somersaults, strikes, turns and walks back — in front of a willow-ish tree and a
 * pavilion. Every piece lies on its own depth layer of an orthographic camera and reports its 2D frame to the
 * effect each frame (setPuppetRig), so the lattice cut-work rides with the swinging limbs. The rods' shadows
 * follow the neck and both hands. Red curtains and the lacquered frame are DOM.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const BG = '#110905'
const CAM_Z = 50
const STEP = 0.1
const FEET = 0.45 // above the bottom edge of the screen
const PUP_SCALE = 1.25

const FLICKERS = [
  { zh: '静', k: 0 },
  { zh: '微', k: 0.55 },
  { zh: '强', k: 1 },
]

const SPEC: Record<PuppetMode, string> = {
  lamp: '彩染驴皮 · 透光如琉璃 · 刻线为墨',
  silhouette: '纯黑剪影 · 只剩镂空与刻缝透光',
  lantern: '人物绕灯旋转 · 拖影 · 灯骨不动',
}

/** the screen (CSS px) inside the stage frame */
function stageRect(w: number, h: number) {
  if (POSTER) {
    const sh = h * 0.78
    const sw = Math.min(w * 0.84, sh * 1.6)
    return { x: (w - sw) / 2, y: h * 0.15, w: sw, h: sh }
  }
  if (w < 760) {
    const sw = w - 28
    const sh = Math.min(h * 0.5, sw * 1.12)
    return { x: 14, y: 116, w: sw, h: sh }
  }
  const left = Math.max(570, w * 0.4)
  const right = w - Math.max(56, w * 0.05)
  const top = 150
  const bottom = h - 130
  return { x: left, y: top, w: right - left, h: bottom - top }
}

/* ------------------------------------------------------------------ flat pieces */

type P = [number, number]

function shapeOf(pts: P[], smooth = false) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  if (smooth) s.splineThru([...pts.slice(1), pts[0]].map((p) => new THREE.Vector2(p[0], p[1])))
  else pts.slice(1).forEach((p) => s.lineTo(p[0], p[1]))
  s.closePath()
  return s
}
const geo = (pts: P[], smooth = false) => new THREE.ShapeGeometry(shapeOf(pts, smooth), 18)

/** a tapered stroke along a smooth curve */
function ribbon(pts: P[], w0: number, w1: number, n = 40) {
  const c = new THREE.SplineCurve(pts.map((p) => new THREE.Vector2(p[0], p[1])))
  const L: P[] = []
  const R: P[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = c.getPoint(t)
    const d = c.getTangent(t)
    const w = (w0 + (w1 - w0) * t) / 2
    L.push([p.x - d.y * w, p.y + d.x * w])
    R.push([p.x + d.y * w, p.y - d.x * w])
  }
  return geo([...L, ...R.reverse()])
}

/** scalloped round clump (foliage) */
function clump(r: number, lobes: number, amp: number, seed: number) {
  const pts: P[] = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2
    const k = 1 + amp * Math.abs(Math.sin((a * lobes) / 2 + seed)) - amp * 0.5 + 0.05 * Math.sin(a * 3 + seed * 2)
    pts.push([Math.cos(a) * r * k, Math.sin(a) * r * k * 0.82])
  }
  return geo(pts)
}

const DYE = {
  red: '#c8322a',
  yellow: '#e2a92a',
  tiger: '#e08a2a',
  green: '#3f8f3a',
  cyan: '#1e7f7a',
  black: '#241a14',
  hide: '#e6dccb',
}
type DyeKey = keyof typeof DYE

function useMats() {
  return useMemo(() => {
    const m = {} as Record<DyeKey, THREE.MeshBasicMaterial>
    ;(Object.keys(DYE) as DyeKey[]).forEach((k) => (m[k] = new THREE.MeshBasicMaterial({ color: DYE[k], side: THREE.DoubleSide })))
    return m
  }, [])
}

function usePieces() {
  return useMemo(() => {
    // torso (pivot: waist)
    const torso = geo(
      [
        [-0.42, 0.04],
        [-0.5, 0.6],
        [-0.46, 1.2],
        [-0.3, 1.56],
        [-0.04, 1.73],
        [0.24, 1.67],
        [0.44, 1.42],
        [0.52, 0.98],
        [0.44, 0.44],
        [0.36, 0.04],
      ],
      true,
    )
    const sash = geo([
      [-0.47, 0.3],
      [0.47, 1.0],
      [0.49, 1.22],
      [-0.49, 0.54],
    ])
    const collar = geo(
      [
        [-0.22, 1.58],
        [0.05, 1.48],
        [0.3, 1.58],
        [0.05, 1.76],
      ],
      true,
    )
    const belt = geo([
      [-0.44, -0.02],
      [0.38, -0.02],
      [0.4, 0.16],
      [-0.45, 0.16],
    ])
    // tiger-skin skirt (pivot: waist)
    const skirt = geo(
      [
        [-0.44, 0.08],
        [0.38, 0.08],
        [0.56, -0.48],
        [0.7, -1.06],
        [0.22, -1.2],
        [-0.24, -1.13],
        [-0.68, -1.02],
        [-0.56, -0.44],
      ],
      true,
    )
    const stripes = [
      ribbon([[-0.5, -1.0], [-0.42, -0.72], [-0.3, -0.55]], 0.11, 0.02),
      ribbon([[-0.12, -1.12], [-0.08, -0.82], [0.02, -0.62]], 0.12, 0.02),
      ribbon([[0.3, -1.14], [0.3, -0.86], [0.38, -0.7]], 0.11, 0.02),
      ribbon([[0.6, -1.0], [0.52, -0.8], [0.44, -0.6]], 0.1, 0.02),
      ribbon([[-0.38, -0.12], [-0.2, -0.3], [-0.04, -0.34]], 0.09, 0.02),
      ribbon([[0.42, -0.2], [0.24, -0.38], [0.12, -0.4]], 0.09, 0.02),
    ]
    const tail = ribbon([[-0.5, -0.55], [-0.95, -0.6], [-1.22, -0.25], [-1.12, 0.12], [-0.92, 0.18]], 0.12, 0.05)
    // leg (pivot: hip)
    const trousers = geo([
      [-0.17, 0.12],
      [0.19, 0.12],
      [0.16, -1.3],
      [-0.14, -1.3],
    ])
    const boot = geo(
      [
        [-0.16, -1.24],
        [0.15, -1.24],
        [0.18, -1.52],
        [0.42, -1.58],
        [0.5, -1.72],
        [-0.18, -1.72],
      ],
      false,
    )
    const cuff = geo([
      [-0.17, -1.18],
      [0.18, -1.18],
      [0.18, -1.3],
      [-0.17, -1.3],
    ])
    // arm (pivot: shoulder) + forearm (pivot: elbow)
    const sleeve = geo(
      [
        [-0.18, 0.14],
        [0.18, 0.14],
        [0.22, -0.5],
        [0.2, -0.78],
        [-0.16, -0.82],
        [-0.17, -0.4],
      ],
      true,
    )
    const fore = geo([
      [-0.13, 0.06],
      [0.14, 0.06],
      [0.12, -0.52],
      [-0.11, -0.52],
    ])
    const band = geo([
      [-0.12, -0.42],
      [0.13, -0.42],
      [0.13, -0.54],
      [-0.12, -0.54],
    ])
    const hand = geo(
      [
        [-0.12, -0.52],
        [0.12, -0.52],
        [0.16, -0.66],
        [0.08, -0.8],
        [-0.08, -0.79],
        [-0.14, -0.66],
      ],
      true,
    )
    // cudgel (pivot: in the hand)
    const staff = geo([
      [-1.55, -0.045],
      [1.55, -0.045],
      [1.55, 0.045],
      [-1.55, 0.045],
    ])
    const staffEnd = (s: number) =>
      geo([
        [s * 1.5, -0.075],
        [s * 1.98, -0.075],
        [s * 1.98, 0.075],
        [s * 1.5, 0.075],
      ])
    // head (pivot: neck), profile facing +x
    const face = geo(
      [
        [-0.28, 0.06],
        [-0.38, 0.44],
        [-0.28, 0.78],
        [0.0, 0.93],
        [0.26, 0.85],
        [0.36, 0.62],
        [0.43, 0.43],
        [0.54, 0.3],
        [0.5, 0.14],
        [0.36, 0.08],
        [0.3, -0.02],
        [0.04, -0.06],
      ],
      true,
    )
    const mask = geo(
      [
        [0.06, 0.33],
        [0.18, 0.62],
        [0.42, 0.52],
        [0.44, 0.34],
        [0.26, 0.22],
      ],
      true,
    )
    const eye = geo(
      [
        [0.22, 0.46],
        [0.3, 0.5],
        [0.36, 0.45],
        [0.29, 0.41],
      ],
      true,
    )
    const fillet = geo([
      [-0.36, 0.5],
      [0.31, 0.7],
      [0.3, 0.8],
      [-0.34, 0.62],
    ])
    const cap = geo(
      [
        [-0.28, 0.06],
        [-0.38, 0.44],
        [-0.33, 0.56],
        [-0.12, 0.46],
        [-0.1, 0.12],
      ],
      true,
    )
    const plumeA = ribbon([[-0.05, 0.84], [-0.3, 1.5], [-0.8, 2.0], [-1.4, 2.15], [-1.95, 1.92]], 0.1, 0.02, 60)
    const plumeB = ribbon([[0.05, 0.88], [0.02, 1.6], [-0.32, 2.25], [-0.9, 2.58], [-1.45, 2.5]], 0.1, 0.02, 60)
    return { torso, sash, collar, belt, skirt, stripes, tail, trousers, boot, cuff, sleeve, fore, band, hand, staff, staffEnds: [staffEnd(1), staffEnd(-1)], face, mask, eye, fillet, cap, plumeA, plumeB }
  }, [])
}

function useProps() {
  return useMemo(() => {
    // tree (origin on the ground)
    const trunk = ribbon([[0, 0], [-0.25, 1.4], [0.25, 2.8], [0.05, 4.2]], 0.55, 0.22)
    const branch = ribbon([[0.1, 2.5], [0.7, 3.0], [1.35, 3.1]], 0.2, 0.08)
    const clumps = [
      { g: clump(1.25, 9, 0.16, 0.3), x: -0.15, y: 4.5, c: 'green' as DyeKey },
      { g: clump(0.95, 8, 0.18, 1.1), x: 1.35, y: 3.35, c: 'cyan' as DyeKey },
      { g: clump(0.85, 7, 0.18, 2.0), x: -1.05, y: 3.45, c: 'cyan' as DyeKey },
      { g: clump(0.8, 7, 0.2, 2.7), x: 0.75, y: 5.25, c: 'green' as DyeKey },
    ]
    // pavilion (origin: centre of the base on the ground)
    const base = geo([
      [-1.45, 0],
      [1.45, 0],
      [1.3, 0.45],
      [-1.3, 0.45],
    ])
    const pillar = (x: number) =>
      geo([
        [x - 0.09, 0.45],
        [x + 0.09, 0.45],
        [x + 0.09, 3.3],
        [x - 0.09, 3.3],
      ])
    const rail = geo([
      [-0.86, 0.45],
      [0.86, 0.45],
      [0.86, 1.45],
      [-0.86, 1.45],
    ])
    const frieze = geo([
      [-0.86, 2.7],
      [0.86, 2.7],
      [0.86, 3.25],
      [-0.86, 3.25],
    ])
    const half: P[] = [
      [0, 4.85],
      [0.45, 4.45],
      [1.0, 3.92],
      [1.55, 3.62],
      [2.1, 3.72],
      [1.82, 3.36],
      [1.0, 3.28],
    ]
    const roof = geo([...half, ...half.slice(1).reverse().map((p) => [-p[0], p[1]] as P)])
    const finial = geo(
      [
        [-0.12, 4.7],
        [0.12, 4.7],
        [0.08, 5.05],
        [0, 5.2],
        [-0.08, 5.05],
      ],
      true,
    )
    const ridge = ribbon([[-1.7, 3.5], [-0.8, 3.62], [0.8, 3.62], [1.7, 3.5]], 0.1, 0.1)
    return { trunk, branch, clumps, base, pillars: [pillar(-0.96), pillar(0.96)], rail, frieze, roof, finial, ridge }
  }, [])
}

/* ------------------------------------------------------------------ performance */

// pose channels
const X = 0,
  Y = 1,
  ROT = 2,
  FACE = 3,
  LEGN = 4,
  LEGF = 5,
  ANU = 6,
  ANL = 7,
  AFU = 8,
  AFL = 9,
  STAFF = 10,
  HEAD = 11,
  TORSO = 12,
  NCH = 13
const LOOP = 13
type K = [number, number][]
// keyframes (seconds → value); x is linear (constant walking speed), the rest ease
const KEYS: Record<number, K> = {
  [X]: [[0, -3], [4, 1], [6.5, 1], [8, 2.2], [9.75, 2.2], [12.5, -3], [13, -3]],
  [FACE]: [[0, 1], [9.5, 1], [9.78, -1], [12.55, -1], [12.85, 1], [13, 1]],
  [LEGN]: [[0, 0], [4, 0], [4.3, 0.34], [6.4, 0.34], [6.7, 1.0], [7.8, 1.0], [8.1, 0.62], [9.4, 0.62], [9.75, 0], [13, 0]],
  [LEGF]: [[0, 0], [4, 0], [4.3, -0.3], [6.4, -0.3], [6.7, 0.55], [7.8, 0.55], [8.1, -0.55], [9.4, -0.55], [9.75, 0], [13, 0]],
  [ANU]: [[0, 0.55], [4, 0.55], [4.3, 1.35], [6.4, 1.35], [6.7, 0.5], [7.8, 0.5], [8.1, 1.52], [9.4, 1.52], [9.75, 0.55], [13, 0.55]],
  [ANL]: [[0, 0.95], [4, 0.95], [4.3, 0.4], [6.4, 0.4], [6.7, 1.25], [7.8, 1.25], [8.1, 0.05], [9.4, 0.05], [9.75, 0.95], [13, 0.95]],
  [AFU]: [[0, -0.1], [4, -0.1], [4.3, 0.9], [6.4, 0.9], [6.7, 1.7], [7.8, 1.7], [8.1, -0.65], [9.4, -0.65], [9.75, -0.1], [13, -0.1]],
  [AFL]: [[0, 0.45], [4, 0.45], [4.3, 1.2], [6.4, 1.2], [6.7, 0.8], [7.8, 0.8], [8.1, 0.55], [9.4, 0.55], [9.75, 0.45], [13, 0.45]],
  [STAFF]: [[0, 1.25], [4, 1.25], [4.3, 1.6], [6.4, 1.6], [6.7, 1.45], [7.8, 1.45], [8.1, 0.06], [9.4, 0.06], [9.75, 1.25], [13, 1.25]],
  [TORSO]: [[0, -0.06], [4, -0.06], [4.3, 0.06], [6.4, 0.06], [6.7, -0.32], [7.8, -0.32], [8.1, -0.2], [9.4, -0.2], [9.75, -0.06], [13, -0.06]],
}
const WALK: K = [[0, 1], [3.75, 1], [4.05, 0], [9.75, 0], [10.0, 1], [12.3, 1], [12.55, 0], [12.85, 0], [13, 1]]

const ease = (t: number) => t * t * (3 - 2 * t)
function key(k: K, t: number, linear = false) {
  if (t <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1]
      const [t1, v1] = k[i]
      const s = (t - t0) / Math.max(t1 - t0, 1e-6)
      return v0 + (v1 - v0) * (linear ? s : ease(s))
    }
  }
  return k[k.length - 1][1]
}

/** pose of the loop at time t (s); also the walk phase it implies */
function timeline(t: number, out: Float32Array) {
  for (const c of [X, FACE, LEGN, LEGF, ANU, ANL, AFU, AFL, STAFF, TORSO]) out[c] = key(KEYS[c], t, c === X)
  out[Y] = 0
  out[ROT] = 0
  out[HEAD] = 0
  // walking: legs scissor, the free arm swings, a little bob and nod
  const w = key(WALK, t)
  const ph = t * Math.PI * 2 * 1.05
  out[LEGN] += w * 0.42 * Math.sin(ph)
  out[LEGF] -= w * 0.42 * Math.sin(ph)
  out[AFU] += w * 0.35 * Math.sin(ph)
  out[Y] += w * 0.07 * Math.abs(Math.cos(ph))
  out[HEAD] += w * 0.05 * Math.sin(ph * 2)
  // twirl: the cudgel spins two full turns in the raised hand
  if (t > 4.3 && t < 6.4) {
    const s = (t - 4.3) / 2.1
    out[STAFF] += Math.PI * 4 * ease(s)
    out[HEAD] += 0.08 * Math.sin(s * Math.PI)
  }
  // leap: an arc with a forward somersault
  if (t > 6.5 && t < 8) {
    const s = (t - 6.5) / 1.5
    out[Y] += 2.1 * Math.sin(Math.PI * s)
    out[ROT] = -Math.PI * 2 * ease(Math.min(1, Math.max(0, (s - 0.12) / 0.76)))
  }
  // strike: lunge, jabs, the quick head shake of a 皮影 warrior
  if (t > 8 && t < 9.75) {
    const s = Math.min(1, (t - 8) / 0.25) * Math.min(1, (9.75 - t) / 0.35)
    out[Y] -= 0.16 * s
    const jab = Math.max(0, Math.sin((t - 8.1) * 9)) * s
    out[ANL] += -0.18 * jab
    out[ANU] += 0.12 * jab
    out[HEAD] += 0.13 * Math.sin(t * 15) * s
  }
}

/** pick a loop time that continues from where the puppet was put down */
function resumeAt(x: number, face: number) {
  if (face > 0) return x <= 1 ? Math.max(0, x + 3) : 8
  return x >= -3 ? 9.75 + (Math.min(2.2, x) * -1 + 2.2) / 5.2 * 2.75 : 12.5
}

type Ctl = {
  dragging: boolean
  play: boolean
  t: number
  blend: number
  from: Float32Array
  walk: number
  face: number
  lastX: number
}

/* ------------------------------------------------------------------ scene */

function Show({ fx, ctl, px, py, onReady }: { fx: ReturnType<typeof createPuppetEffect>; ctl: React.MutableRefObject<Ctl>; px: MotionValue<number>; py: MotionValue<number>; onReady: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const M = useMats()
  const G = usePieces()
  const PR = useProps()
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)

  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const legN = useRef<THREE.Group>(null)
  const legF = useRef<THREE.Group>(null)
  const armNU = useRef<THREE.Group>(null)
  const armNL = useRef<THREE.Group>(null)
  const armFU = useRef<THREE.Group>(null)
  const armFL = useRef<THREE.Group>(null)
  const staff = useRef<THREE.Group>(null)
  const tree = useRef<THREE.Group>(null)
  const pav = useRef<THREE.Group>(null)
  const skirt = useRef<THREE.Group>(null)
  const handN = useRef<THREE.Object3D>(null)
  const handF = useRef<THREE.Object3D>(null)
  const neck = useRef<THREE.Object3D>(null)

  const T = useMemo(
    () => ({
      pose: new Float32Array(NCH),
      tl: new Float32Array(NCH),
      v: new THREE.Vector3(),
      o: new THREE.Vector3(),
      ax: new THREE.Vector3(),
      ay: new THREE.Vector3(),
      layers: Array.from({ length: 14 }, () => null as PuppetRigLayer | null),
      rods: [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ] as [number, number, number, number][],
      walkPh: 0,
    }),
    [],
  )

  // the layer each rigid group sits on, with its motif (-1 = by dye) and whether it is cut
  const RIG: { ref: React.RefObject<THREE.Object3D | null>; k: number; motif: number; cut: boolean }[] = [
    { ref: tree, k: 1, motif: -1, cut: true },
    { ref: pav, k: 2, motif: -1, cut: true },
    { ref: armFU, k: 3, motif: 3, cut: true },
    { ref: armFL, k: 4, motif: 3, cut: false },
    { ref: legF, k: 5, motif: 3, cut: true },
    { ref: legN, k: 6, motif: 3, cut: true },
    { ref: skirt, k: 7, motif: 2, cut: true },
    { ref: torso, k: 8, motif: 0, cut: true },
    { ref: head, k: 9, motif: 1, cut: false },
    { ref: staff, k: 10, motif: 3, cut: false },
    { ref: armNU, k: 11, motif: 1, cut: true },
    { ref: armNL, k: 12, motif: 3, cut: false },
  ]

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const c = ctl.current
    // fit ~10 units of height (and ≥ 10.5 of width) into the screen
    const zoom = Math.min(size.height / 10, size.width / 10.5)
    if (camera.zoom !== zoom) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
    }
    const halfW = size.width / zoom / 2
    const feet = -size.height / zoom / 2 + FEET
    if (tree.current) tree.current.position.set(-halfW + Math.min(2.0, halfW * 0.3), feet - 0.05, 0)
    if (pav.current) pav.current.position.set(halfW - Math.min(2.9, halfW * 0.42), feet - 0.05, 0)

    /* pose: the loop, or the visitor's hand */
    const pose = T.pose
    if (c.play) {
      if (!POSTER || c.t < 8.55) c.t = (c.t + dt) % LOOP
      timeline(c.t, T.tl)
      if (c.blend < 1) {
        c.blend = Math.min(1, c.blend + dt / 0.7)
        const b = ease(c.blend)
        for (let i = 0; i < NCH; i++) pose[i] = c.from[i] + (T.tl[i] - c.from[i]) * b
      } else pose.set(T.tl)
    } else {
      const x = px.get()
      const y = py.get()
      const vx = (x - c.lastX) / Math.max(dt, 1e-3)
      c.lastX = x
      if (Math.abs(vx) > 0.4) c.face = Math.sign(vx)
      T.walkPh += Math.abs(vx) * dt * 2.4
      const lifted = Math.min(1, Math.max(0, y / 0.6))
      c.walk += (Math.min(1, Math.abs(vx) / 2) * (1 - lifted) - c.walk) * (1 - Math.exp(-dt * 8))
      pose[X] = x
      pose[Y] = y
      pose[ROT] = THREE.MathUtils.clamp(-vx * 0.02, -0.25, 0.25) * c.face
      pose[FACE] += (c.face - pose[FACE]) * (1 - Math.exp(-dt * 14))
      const sw = Math.sin(T.walkPh)
      const dangle = Math.sin(performance.now() / 1000 * 3) * 0.15 * lifted
      pose[LEGN] = c.walk * 0.42 * sw + dangle + lifted * 0.15
      pose[LEGF] = -c.walk * 0.42 * sw - dangle - lifted * 0.1
      pose[ANU] = 0.55 + lifted * 0.6
      pose[ANL] = 0.95 - lifted * 0.4
      pose[AFU] = -0.1 + c.walk * 0.35 * sw + lifted * 1.2
      pose[AFL] = 0.45
      pose[STAFF] = 1.25
      pose[HEAD] = 0.05 * Math.sin(T.walkPh * 2) - lifted * 0.12
      pose[TORSO] = -0.06 - lifted * 0.1
      c.from.set(pose)
    }

    /* apply */
    const f = Math.sign(pose[FACE] || 1) * Math.max(Math.abs(pose[FACE]), 0.06)
    if (root.current) {
      root.current.position.set(pose[X], feet + 2.07 * PUP_SCALE + pose[Y], 0)
      root.current.rotation.z = pose[ROT] * Math.sign(f)
      root.current.scale.set(PUP_SCALE * f, PUP_SCALE, 1)
    }
    if (torso.current) torso.current.rotation.z = pose[TORSO]
    if (head.current) head.current.rotation.z = pose[HEAD]
    if (legN.current) legN.current.rotation.z = pose[LEGN]
    if (legF.current) legF.current.rotation.z = pose[LEGF]
    if (armNU.current) armNU.current.rotation.z = pose[ANU]
    if (armNL.current) armNL.current.rotation.z = pose[ANL]
    if (armFU.current) armFU.current.rotation.z = pose[AFU]
    if (armFL.current) armFL.current.rotation.z = pose[AFL]
    // the cudgel's angle is given in the puppet's frame; undo the arm chain
    if (staff.current) staff.current.rotation.z = pose[STAFF] - pose[TORSO] - pose[ANU] - pose[ANL]
    // the skirt sways a little behind the walk
    if (skirt.current) skirt.current.rotation.z = (pose[LEGN] + pose[LEGF]) * 0.06

    /* report each layer's 2D frame (CSS px, y up) and the rods to the effect */
    root.current?.updateWorldMatrix(true, true)
    tree.current?.updateWorldMatrix(true, false)
    pav.current?.updateWorldMatrix(true, false)
    const W = size.width
    const H = size.height
    const toPx = (v: THREE.Vector3) => {
      v.project(camera)
      v.set((v.x * 0.5 + 0.5) * W, (v.y * 0.5 + 0.5) * H, 0)
      return v
    }
    for (const r of RIG) {
      const o = r.ref.current
      if (!o) continue
      const e = o.matrixWorld.elements
      toPx(T.o.set(e[12], e[13], e[14]))
      toPx(T.ax.set(e[12] + e[0], e[13] + e[1], e[14] + e[2])).sub(T.o)
      toPx(T.ay.set(e[12] + e[4], e[13] + e[5], e[14] + e[6])).sub(T.o)
      const s = Math.max(T.ay.length(), 1e-3)
      const ex = T.ax.multiplyScalar(1 / s)
      const ey = T.ay.multiplyScalar(1 / s)
      const det = ex.x * ey.y - ey.x * ex.y || 1e-3
      const l = (T.layers[r.k] ??= { x: 0, y: 0, a: 1, b: 0, c: 0, d: 1, motif: 0, cut: true })
      l.x = T.o.x
      l.y = T.o.y
      l.a = ey.y / det
      l.b = -ey.x / det
      l.c = -ex.y / det
      l.d = ex.x / det
      l.motif = r.motif
      l.cut = r.cut
    }
    setPuppetRig(fx, { depth0: CAM_Z, step: STEP, layers: T.layers })
    const rod = (i: number, o: THREE.Object3D | null, lean: number) => {
      if (!o) return
      o.getWorldPosition(T.v)
      toPx(T.v)
      const r = T.rods[i]
      r[0] = T.v.x
      r[1] = H - T.v.y
      r[2] = T.v.x - lean * Math.sign(f) * H * 0.35
      r[3] = H + 40
    }
    rod(0, neck.current, 0.25)
    rod(1, handN.current, -0.1)
    rod(2, handF.current, 0.45)
    setPuppetRods(fx, T.rods)
  })

  const z = (k: number, d = 0) => k * STEP + d
  const m = (g: THREE.BufferGeometry, mat: THREE.Material, k: number, d = 0, key?: string | number) => (
    <mesh key={key} geometry={g} material={mat} position-z={z(k, d)} />
  )

  return (
    <group ref={content} visible={ready}>
      {/* tree */}
      <group ref={tree}>
        {m(PR.trunk, M.black, 1)}
        {m(PR.branch, M.black, 1, 0.001)}
        {PR.clumps.map((c, i) => (
          <mesh key={i} geometry={c.g} material={M[c.c]} position={[c.x, c.y, z(1, 0.004 + i * 0.002)]} />
        ))}
      </group>
      {/* pavilion */}
      <group ref={pav} scale={[1.3, 1.3, 1]}>
        {m(PR.base, M.cyan, 2)}
        {PR.pillars.map((g, i) => m(g, M.black, 2, 0.002, i))}
        {m(PR.rail, M.yellow, 2, 0.004)}
        {m(PR.frieze, M.yellow, 2, 0.004)}
        {m(PR.roof, M.red, 2, 0.006)}
        {m(PR.ridge, M.black, 2, 0.008)}
        {m(PR.finial, M.yellow, 2, 0.008)}
      </group>

      {/* the puppet: every rigid piece on its own layer */}
      <group ref={root}>
        {/* far arm */}
        <group position={[0.05, 1.42, 0]}>
          <group ref={armFU}>
            {m(G.sleeve, M.red, 3)}
            <group ref={armFL} position={[0.02, -0.72, 0]}>
              {m(G.fore, M.green, 4)}
              {m(G.band, M.yellow, 4, 0.002)}
              {m(G.hand, M.hide, 4, 0.004)}
              <object3D ref={handF} position={[0, -0.66, 0]} />
            </group>
          </group>
        </group>
        {/* legs */}
        <group position={[-0.06, -0.35, 0]}>
          <group ref={legF}>
            {m(G.trousers, M.red, 5)}
            {m(G.boot, M.black, 5, 0.002)}
            {m(G.cuff, M.yellow, 5, 0.004)}
          </group>
        </group>
        <group position={[0.1, -0.35, 0]}>
          <group ref={legN}>
            {m(G.trousers, M.red, 6)}
            {m(G.boot, M.black, 6, 0.002)}
            {m(G.cuff, M.yellow, 6, 0.004)}
          </group>
        </group>
        {/* tiger-skin skirt + tail */}
        <group ref={skirt}>
          {m(G.skirt, M.tiger, 7)}
          {m(G.tail, M.tiger, 7, -0.002)}
          {G.stripes.map((g, i) => m(g, M.black, 7, 0.002, i))}
          {m(G.belt, M.red, 7, 0.004)}
        </group>
        {/* torso, head, near arm + cudgel */}
        <group ref={torso}>
          {m(G.torso, M.yellow, 8)}
          {m(G.sash, M.red, 8, 0.002)}
          {m(G.collar, M.black, 8, 0.004)}
          {m(G.belt, M.black, 8, 0.004)}
          <object3D ref={neck} position={[0.04, 1.6, 0]} />
          <group position={[0.06, 1.68, 0]}>
            <group ref={head}>
              {m(G.plumeA, M.red, 9, -0.004)}
              {m(G.plumeB, M.yellow, 9, -0.003)}
              {m(G.face, M.hide, 9)}
              {m(G.cap, M.black, 9, 0.002)}
              {m(G.mask, M.red, 9, 0.002)}
              {m(G.fillet, M.yellow, 9, 0.004)}
              {m(G.eye, M.black, 9, 0.006)}
            </group>
          </group>
          <group position={[0.05, 1.42, 0]}>
            <group ref={armNU}>
              {m(G.sleeve, M.red, 11)}
              <group ref={armNL} position={[0.02, -0.72, 0]}>
                {m(G.fore, M.green, 12)}
                {m(G.band, M.yellow, 12, 0.002)}
                {m(G.hand, M.hide, 12, 0.004)}
                <object3D ref={handN} position={[0, -0.66, 0]} />
                <group ref={staff} position={[0, -0.66, 0]}>
                  {m(G.staff, M.black, 10)}
                  {G.staffEnds.map((g, i) => m(g, M.yellow, 10, 0.002, i))}
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ 原图 split, mapped to the stage */

/**
 * Same behaviour and look as <OriginalSplit>, but for a canvas that only fills the stage screen: the shared one
 * draws the lib's wipe line across the whole viewport, which is off by the screen's offset here.
 */
function StageSplit({ split, rect, label }: { split: SplitState; rect: { x: number; y: number; w: number; h: number }; label: string }) {
  const { wipe } = split
  const x1 = useTransform(wipe, (w) => (rect.w * w) / 0.84)
  const x2 = useTransform(wipe, (w) => (rect.w * (w - 0.16)) / 0.84)
  const kx = useTransform(wipe, (w) => (rect.w * (w - 0.08)) / 0.84)
  const drag = useRef<number | null>(null)
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
  return (
    <AnimatePresence>
      {split.open && (
        <motion.div
          className="sp-osplit"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <svg className="sp-osplit-line" width={rect.w} height={rect.h}>
            <motion.line x1={x1} y1={0} x2={x2} y2={rect.h} stroke="rgba(0,0,0,.22)" strokeWidth={4} />
            <motion.line x1={x1} y1={0} x2={x2} y2={rect.h} stroke="#fff" strokeWidth={1.5} />
          </svg>
          <motion.div
            className="sp-osplit-knob"
            style={{ x: kx, y: rect.h / 2 }}
            onPointerDown={(e) => {
              e.stopPropagation()
              drag.current = e.pointerId
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (drag.current !== e.pointerId) return
              wipe.set(clamp((0.84 * (e.clientX - rect.x)) / rect.w + 0.08, 0.06, 0.94))
            }}
            onPointerUp={(e) => {
              if (drag.current === e.pointerId) drag.current = null
            }}
            onPointerCancel={() => (drag.current = null)}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
          >
            <span className="sp-osplit-tag l">原图</span>
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
              <path d="M8 6 L3 11 L8 16 M14 6 L19 11 L14 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sp-osplit-tag r">{label}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ page */

export default function ShadowPuppet() {
  const [mode, setMode] = useState<PuppetMode>('lamp')
  const [flick, setFlick] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createPuppetEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.66)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const rect = stageRect(vp.w, vp.h)

  useEffect(() => setPuppetMode(fx, mode), [fx, mode])
  useEffect(() => setPuppetFlicker(fx, FLICKERS[flick].k), [fx, flick])

  // drag the puppet: it follows the hand (walking / dangling), then glides, lands and picks the show up again
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const ctl = useRef<Ctl>({ dragging: false, play: true, t: POSTER ? 8.3 : 0, blend: 1, from: new Float32Array(NCH), walk: 0, face: 1, lastX: 0 })
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const resume = useRef<number | null>(null)
  const zoomOf = () => Math.min(rect.h / 10, rect.w / 10.5)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    if (resume.current) clearTimeout(resume.current)
    const c = ctl.current
    if (c.play) {
      // start from the current pose
      timeline(c.t, c.from)
      px.set(c.from[X])
      py.set(Math.max(0, c.from[Y]))
      c.face = Math.sign(c.from[FACE]) || 1
      c.lastX = c.from[X]
    }
    c.play = false
    c.dragging = true
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const z = zoomOf()
    const halfW = rect.w / z / 2
    px.set(THREE.MathUtils.clamp(px.get() + (e.clientX - d.x) / z, -halfW + 0.8, halfW - 0.8))
    py.set(THREE.MathUtils.clamp(py.get() - (e.clientY - d.y) / z, -0.2, 3.2))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    const c = ctl.current
    c.dragging = false
    const z = zoomOf()
    const halfW = rect.w / z / 2
    anims.current = [
      animate(px, px.get(), {
        type: 'inertia',
        velocity: px.getVelocity(),
        power: 0.35,
        timeConstant: 320,
        min: -halfW + 0.8,
        max: halfW - 0.8,
        bounceStiffness: 220,
        bounceDamping: 22,
      }),
      animate(py, 0, { type: 'spring', stiffness: 160, damping: 13 }),
    ]
    resume.current = window.setTimeout(() => {
      const cc = ctl.current
      if (cc.dragging) return
      cc.t = resumeAt(px.get(), cc.face)
      cc.blend = 0
      cc.play = true
    }, 1300)
  }
  useEffect(() => () => {
    anims.current.forEach((a) => a.stop())
    if (resume.current) clearTimeout(resume.current)
  }, [])

  const [ready, setReady] = useState(false)
  // mount the WebGL canvas a couple of frames after the stage DOM: the frame / curtains get rasterized first,
  // instead of waiting behind the GPU process while it compiles the shaders (measured: ~300 → ~100 ms stall)
  const [go, setGo] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setGo(true), 320)
    return () => clearTimeout(id)
  }, [])
  const label = puppetModes.find((m) => m.id === mode)!.label

  return (
    <div className={`stage sp${split.open ? ' sp-split' : ''}`} style={{ background: BG }}>
      <style>{css}</style>
      <div className="sp-glow" style={{ left: rect.x + rect.w / 2, top: rect.y + rect.h * 0.45 }} />
      <div
        className="sp-screen"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {go && <Canvas
          orthographic
          dpr={[1, 2]}
          gl={{ antialias: false, alpha: false }}
          camera={{ position: [0, 0, CAM_Z], zoom: 50, near: 0.1, far: 100 }}
        >
          <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={puppetMeta.background} preload={preload} />
          <Show fx={fx} ctl={ctl} px={px} py={py} onReady={() => setReady(true)} />
        </Canvas>}
      </div>
      {/* the stage: lacquered frame, valance, tied-back curtains */}
      <div className="sp-frame" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} aria-hidden>
        <div className="sp-valance">
          {Array.from({ length: Math.max(5, Math.round(rect.w / 70)) }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="sp-curtain l">
          <i className="u" />
          <i className="d" />
        </div>
        <div className="sp-curtain r">
          <i className="u" />
          <i className="d" />
        </div>
        <div className="sp-sill" />
      </div>

      <div className="overlay">
        <div className="hero-copy sp-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Shadow Puppet · 灯影戏
            </p>
            <h1>
              一盏油灯
              <br />
              一块白布
            </h1>
            <p className="sp-sub">
              驴皮刻成的人偶贴着幕布演：大块皮面上镂出网格、团花、云纹，灯光从孔里透过来；染了色的皮子半透明，被灯一照像琉璃一样发亮。
            </p>
            <div className="sp-spec">
              <div className="sp-dyes" aria-hidden>
                {PUPPET_DYES.map((d) => (
                  <span key={d.id}>
                    <i style={{ background: d.hex }} />
                    {d.zh}
                  </span>
                ))}
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {SPEC[mode]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <StageSplit split={split} rect={rect} label={label} />

        <div className="dock">
          <Seg items={puppetModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg sp-cycle" onClick={() => setFlick((d) => (d + 1) % FLICKERS.length)}>
              <span>
                摇曳 <b>{FLICKERS[flick].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="sp-lbl">灯光摇曳</span>
              <Seg items={FLICKERS.map((d, i) => ({ value: i, label: d.zh }))} value={flick} onChange={setFlick} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="sp-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className={`hint${ready ? '' : ' sp-wait'}`}>拖动幕上的人偶 · 松手后接着演</p>
      </div>
    </div>
  )
}

const css = `
.sp { overflow: hidden; }
.sp canvas { display: block; }
.sp-glow {
  position: absolute; width: 1200px; height: 900px; transform: translate(-50%, -50%); pointer-events: none;
  background: radial-gradient(closest-side, rgba(255, 150, 60, .2), rgba(255, 120, 40, .06) 55%, transparent);
}
.sp-screen { position: absolute; cursor: grab; touch-action: none; background: #2a1509; }
.sp-screen:active { cursor: grabbing; }
.sp-frame { position: absolute; pointer-events: none; }
.sp-frame::before {
  /* lacquered frame with a gold line */
  content: ''; position: absolute; inset: -16px; border-radius: 4px;
  /* solid rings only: blurred shadows over the WebGL canvas cost a long first frame (new GPU raster shaders) */
  box-shadow: inset 0 0 0 16px #3a0f0a, inset 0 0 0 17.5px #b8862e, inset 0 0 0 19px #2a0805, 0 0 0 1px #1c0604;
}
.sp-valance {
  position: absolute; left: -26px; right: -26px; top: -58px; height: 58px; display: flex; justify-content: space-around;
  /* tiled (not repeating-) gradients: one small tile is rasterized and reused */
  background:
    linear-gradient(#e0a640, #e0a640) left 0 bottom 9px / 100% 2px no-repeat,
    linear-gradient(90deg, rgba(0,0,0,.18) 2px, transparent 2px) 0 0 / 34px 100% repeat-x,
    linear-gradient(#8e1712, #b3241a 55%, #7a120e);
  border-radius: 6px 6px 0 0;
  box-shadow: inset 0 2px 0 rgba(255,210,140,.25), inset 0 -3px 0 rgba(40,0,0,.35);
  z-index: 2;
}
.sp-valance i {
  position: relative; width: 2px; height: 100%;
}
.sp-valance i::after {
  /* tassels */
  content: ''; position: absolute; left: -4px; top: 100%; width: 10px; height: 22px;
  border-radius: 3px 3px 6px 6px;
  background: linear-gradient(#f1c24e, #c3802a);
}
.sp-curtain { position: absolute; top: -8px; bottom: -6px; width: 10%; z-index: 1; }
.sp-curtain i {
  /* tied back: full width at the top, pinched at the cord, flaring a little to the floor */
  position: absolute; display: block;
  background:
    linear-gradient(90deg, rgba(0,0,0,.34) 0, rgba(0,0,0,0) 12px, rgba(255,140,110,.13) 18px, rgba(0,0,0,0) 24px, rgba(0,0,0,.3) 32px) 0 0 / 32px 100% repeat-x,
    linear-gradient(#9b1c14, #6e100b);
}
.sp-curtain .u { top: 0; height: 50%; width: 100%; }
.sp-curtain .d { top: 50%; bottom: 0; width: 55%; }
.sp-curtain.l { left: -18px; }
.sp-curtain.r { right: -18px; }
.sp-curtain.l .u { left: 0; border-bottom-right-radius: 65% 100%; }
.sp-curtain.l .d { left: 0; border-top-right-radius: 36% 100%; }
.sp-curtain.r .u { right: 0; border-bottom-left-radius: 65% 100%; }
.sp-curtain.r .d { right: 0; border-top-left-radius: 36% 100%; }
.sp-curtain::after {
  /* tie-back cord */
  content: ''; position: absolute; top: 49%; width: 60%; height: 7px; border-radius: 4px;
  background: linear-gradient(#f0c050, #b07020);
}
.sp-curtain.l::after { left: 0; transform: rotate(-8deg); }
.sp-curtain.r::after { right: 0; transform: rotate(8deg); }
.sp-sill {
  position: absolute; left: -30px; right: -30px; bottom: -36px; height: 22px; border-radius: 3px;
  background: linear-gradient(#5a1a0e, #2a0a05); box-shadow: inset 0 1px 0 rgba(255,190,120,.25);
}
.sp-osplit { position: absolute; pointer-events: none !important; }
.sp-osplit-line { position: absolute; left: 0; top: 0; pointer-events: none; }
.sp-osplit-knob {
  position: absolute; left: -22px; top: -22px; width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; pointer-events: auto; cursor: ew-resize; touch-action: none;
  background: #fff; color: #1d1c1a; box-shadow: 0 6px 20px -6px rgba(0,0,0,.4), 0 0 0 1px rgba(0,0,0,.06);
}
.sp-osplit-tag {
  position: absolute; top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
  padding: 5px 9px; border-radius: 999px; font: 500 11.5px/1 var(--sans); letter-spacing: .02em;
  background: rgba(20, 20, 22, .72); color: #fff;
}
.sp-osplit-tag.l { right: 54px; }
.sp-osplit-tag.r { left: 54px; }
.sp-copy { pointer-events: none !important; }
.sp-copy .scrim { --soft-bg: ${BG}; }
.sp-copy .kicker i { background: #f0a040; box-shadow: 0 0 10px #f0a040; }
.sp-copy h1 { font-size: clamp(40px, 4.4vw, 62px); }
.sp-sub { max-width: 400px; }
.sp-spec { margin-top: 24px; min-height: 72px; }
.sp-dyes { display: flex; flex-wrap: wrap; gap: 6px 14px; font: 500 12px/1 var(--sans); color: var(--fg-2); }
.sp-dyes span { display: inline-flex; align-items: center; gap: 6px; }
.sp-dyes i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 10px -1px currentColor, inset 0 0 0 1px rgba(255,255,255,.15); }
.sp-spec p { margin: 14px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.sp-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.sp-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.sp-cycle b { font-weight: 600; color: var(--fg); }
.sp .hint { transition: opacity .4s; }
.sp-split .hint, .sp .hint.sp-wait { opacity: 0; }
@media (max-width: 760px) {
  .sp-copy { transition: opacity .4s; }
  .sp-split .sp-copy { opacity: 0; }
  .sp-sub { display: none; }
  .sp-copy h1 { font-size: 34px; }
  .sp-spec { margin-top: 12px; min-height: 0; }
  .sp-valance { top: -40px; height: 40px; left: -12px; right: -12px; }
  .sp-valance i::after { height: 14px; width: 8px; left: -3px; }
  .sp-frame::before { inset: -10px; box-shadow: inset 0 0 0 10px #3a0f0a, inset 0 0 0 11.5px #b8862e, inset 0 0 0 13px #2a0805; }
  .sp-curtain { width: 13%; left: -8px; }
  .sp-curtain.r { right: -8px; left: auto; }
  .sp-sill { display: none; }
  .sp .dock .seg { padding: 0 9px; }
  .sp .dock .dock-sep { margin: 0 1px; }
}
`
