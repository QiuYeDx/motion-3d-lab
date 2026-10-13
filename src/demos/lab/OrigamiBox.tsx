import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { animate, AnimatePresence, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ palette */

const RED = '#e0573a'
const CREAM = '#f8f0e2'
const INK = '#1f1c19'
const SUN = '#f3b43f'
const PINK = '#f6c2b2'
const KRAFT = '#c99f72'
const EDGE = '#f1e6d2'
const FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
const MONO = '"Cascadia Code", Consolas, "SF Mono", monospace'

const T = 0.022 // paper thickness
const PPU = 260 // canvas px per world unit

/* ------------------------------------------------------------------ net definitions (flat 2D, u → x, v → z) */

type V2 = [number, number]
type Art = 'hero' | 'dots' | 'stripes' | 'arrows' | 'lid' | 'flap' | 'base' | 'wave' | 'glue'
type FaceDef = {
  name: string
  poly: V2[]
  parent: number
  edge?: [V2, V2] // shared crease with the parent
  angle?: number // fold angle in degrees (upward)
  delay?: number // stagger (s)
  art: Art
  artRot?: number
  lift?: boolean // tuck / glue tab: slides just inside the wall it tucks behind
}
type ShapeId = 'cube' | 'prism' | 'pyramid'
type NetDef = {
  faces: FaceDef[]
  height: number
  sticker: { face: number; at: V2; size: number; tilt: number }
  distFlat: number
  distClosed: number
}

const rect = (u0: number, v0: number, u1: number, v1: number): V2[] => [
  [u0, v0],
  [u1, v0],
  [u1, v1],
  [u0, v1],
]

function cubeNet(): NetDef {
  const s = 1.3
  const f = 0.34
  return {
    height: s,
    distFlat: 12.5,
    distClosed: 7.6,
    sticker: { face: 1, at: [s * 0.79, s * 1.8], size: 0.46, tilt: -0.22 },
    faces: [
      { name: '底', poly: rect(0, 0, s, s), parent: -1, art: 'base' },
      { name: '前', poly: rect(0, s, s, 2 * s), parent: 0, edge: [[0, s], [s, s]], angle: 90, delay: 0, art: 'hero' },
      { name: '右', poly: rect(s, 0, 2 * s, s), parent: 0, edge: [[s, 0], [s, s]], angle: 90, delay: 0.1, art: 'arrows' },
      { name: '后', poly: rect(0, -s, s, 0), parent: 0, edge: [[0, 0], [s, 0]], angle: 90, delay: 0.2, art: 'stripes' },
      { name: '左', poly: rect(-s, 0, 0, s), parent: 0, edge: [[0, 0], [0, s]], angle: 90, delay: 0.3, art: 'dots' },
      { name: '盖', poly: rect(0, -2 * s, s, -s), parent: 3, edge: [[0, -s], [s, -s]], angle: 90, delay: 0.78, art: 'lid', artRot: Math.PI },
      {
        name: '插舌',
        poly: [
          [0, -2 * s],
          [s, -2 * s],
          [s - 0.12, -2 * s - f],
          [0.12, -2 * s - f],
        ],
        parent: 5,
        edge: [[0, -2 * s], [s, -2 * s]],
        angle: 90,
        delay: 1.08,
        art: 'flap',
        artRot: Math.PI,
        lift: true,
      },
    ],
  }
}

function prismNet(): NetDef {
  const w = 1.5
  const L = 2.5
  const h = (w * Math.sqrt(3)) / 2
  return {
    height: h,
    distFlat: 12.6,
    distClosed: 8.8,
    sticker: { face: 3, at: [w + w * 0.72, L * 0.22], size: 0.46, tilt: 0.2 },
    faces: [
      { name: '底', poly: rect(0, 0, w, L), parent: -1, art: 'base' },
      { name: '前端', poly: [[0, L], [w, L], [w / 2, L + h]], parent: 0, edge: [[0, L], [w, L]], angle: 90, delay: 0, art: 'lid' },
      { name: '后端', poly: [[0, 0], [w, 0], [w / 2, -h]], parent: 0, edge: [[0, 0], [w, 0]], angle: 90, delay: 0.09, art: 'dots' },
      { name: '右坡', poly: rect(w, 0, 2 * w, L), parent: 0, edge: [[w, 0], [w, L]], angle: 120, delay: 0.38, art: 'hero' },
      { name: '左坡', poly: rect(-w, 0, 0, L), parent: 0, edge: [[0, 0], [0, L]], angle: 120, delay: 0.66, art: 'stripes' },
      {
        name: '粘口',
        poly: [
          [-w, 0],
          [-w, L],
          [-w - 0.28, L - 0.14],
          [-w - 0.28, 0.14],
        ],
        parent: 4,
        edge: [[-w, 0], [-w, L]],
        angle: 120,
        delay: 0.98,
        art: 'glue',
        lift: true,
      },
    ],
  }
}

function pyramidNet(): NetDef {
  const s = 1.6
  const H = 1.25
  const l = Math.hypot(H, s / 2)
  const fold = 180 - THREE.MathUtils.radToDeg(Math.atan2(H, s / 2))
  return {
    height: H,
    distFlat: 12.4,
    distClosed: 8.2,
    sticker: { face: 2, at: [s + l * 0.3, s * 0.42], size: 0.42, tilt: -0.15 },
    faces: [
      { name: '底', poly: rect(0, 0, s, s), parent: -1, art: 'base' },
      { name: '前', poly: [[0, s], [s, s], [s / 2, s + l]], parent: 0, edge: [[0, s], [s, s]], angle: fold, delay: 0, art: 'hero' },
      { name: '右', poly: [[s, 0], [s, s], [s + l, s / 2]], parent: 0, edge: [[s, 0], [s, s]], angle: fold, delay: 0.14, art: 'dots' },
      { name: '后', poly: [[0, 0], [s, 0], [s / 2, -l]], parent: 0, edge: [[0, 0], [s, 0]], angle: fold, delay: 0.28, art: 'stripes' },
      { name: '左', poly: [[0, 0], [0, s], [-l, s / 2]], parent: 0, edge: [[0, 0], [0, s]], angle: fold, delay: 0.42, art: 'wave' },
    ],
  }
}

const NETS: Record<ShapeId, NetDef> = { cube: cubeNet(), prism: prismNet(), pyramid: pyramidNet() }
const ORDER: ShapeId[] = ['cube', 'prism', 'pyramid']
const MAX_FACES = 8

/* ------------------------------------------------------------------ build: frames, geometry, textures */

type Frame = { a: V2; d: V2; n: V2 }
type BuiltFace = {
  def: FaceDef
  frame: Frame
  geo: THREE.BufferGeometry
  hingePos: [number, number, number]
  hingeRotY: number
  angle: number
  children: number[]
}
type Built = {
  faces: BuiltFace[]
  mats: THREE.Material[]
  rootOffset: [number, number, number]
  flatCenter: THREE.Vector3
  closedCenter: THREE.Vector3
  sticker: { pos: [number, number, number]; size: number; tilt: number; face: number }
}

const sub = (p: V2, q: V2): V2 => [p[0] - q[0], p[1] - q[1]]
const dot = (p: V2, q: V2) => p[0] * q[0] + p[1] * q[1]
const centroid = (poly: V2[]): V2 => {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p[0]
    y += p[1]
  }
  return [x / poly.length, y / poly.length]
}
/** world-net point → face frame (x along crease, z away from crease) */
const toLocal = (f: Frame, p: V2): V2 => {
  const r = sub(p, f.a)
  return [dot(r, f.d), dot(r, f.n)]
}

function frameOf(face: FaceDef, root: FaceDef): Frame {
  if (!face.edge) {
    const [u0, v0] = root.poly[0]
    return { a: [u0, v0], d: [1, 0], n: [0, 1] }
  }
  let [a, b] = face.edge
  let d = sub(b, a)
  const len = Math.hypot(d[0], d[1])
  d = [d[0] / len, d[1] / len]
  let n: V2 = [-d[1], d[0]]
  // orient so the face lies on the +n side of the crease
  if (dot(sub(centroid(face.poly), a), n) < 0) {
    ;[a, b] = [b, a]
    d = [-d[0], -d[1]]
    n = [-d[1], d[0]]
  }
  return { a, d, n }
}

/** a thin two-sided paper slab: group 0 top/inside (kraft), 1 bottom/outside (print), 2 edges */
function slabGeometry(local: V2[], net: V2[], uv: (p: V2) => V2): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const h = T / 2
  const k = local.length
  const tri = (i0: number, i1: number, i2: number, y: number, ny: number) => {
    const A = local[i0]
    const B = local[i1]
    const C = local[i2]
    // y-component of (B-A)x(C-A) in (x, z) → (x, 0, z) space
    const cy = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1])
    const order = cy * ny > 0 ? [i0, i1, i2] : [i0, i2, i1]
    for (const i of order) {
      pos.push(local[i][0], y, local[i][1])
      nor.push(0, ny, 0)
      const t = uv(net[i])
      uvs.push(t[0], t[1])
    }
  }
  for (let i = 1; i < k - 1; i++) tri(0, i, i + 1, h, 1)
  const topCount = pos.length / 3
  for (let i = 1; i < k - 1; i++) tri(0, i, i + 1, -h, -1)
  const botCount = pos.length / 3 - topCount
  // edges
  let area = 0
  for (let i = 0; i < k; i++) {
    const p = local[i]
    const q = local[(i + 1) % k]
    area += p[0] * q[1] - q[0] * p[1]
  }
  for (let i = 0; i < k; i++) {
    const p = local[i]
    const q = local[(i + 1) % k]
    let nx = q[1] - p[1]
    let nz = -(q[0] - p[0])
    if (area < 0) {
      nx = -nx
      nz = -nz
    }
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    const quad: [V2, number][] = [
      [p, h],
      [q, h],
      [q, -h],
      [p, h],
      [q, -h],
      [p, -h],
    ]
    // winding: outward normal (nx, 0, nz)
    const e1 = [q[0] - p[0], 0, q[1] - p[1]]
    const e2 = [0, -2 * h, 0]
    const cx = e1[1] * e2[2] - e1[2] * e2[1]
    const cz = e1[0] * e2[1] - e1[1] * e2[0]
    const flip = cx * nx + cz * nz < 0
    const seq = flip ? [0, 2, 1, 3, 5, 4] : [0, 1, 2, 3, 4, 5]
    for (const j of seq) {
      const [pt, y] = quad[j]
      pos.push(pt[0], y, pt[1])
      nor.push(nx, 0, nz)
      uvs.push(0, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.addGroup(0, topCount, 0)
  g.addGroup(topCount, botCount, 1)
  g.addGroup(topCount + botCount, pos.length / 3 - topCount - botCount, 2)
  g.computeBoundingSphere()
  return g
}

/* ------------------------------------------------------------------ print art (outside) */

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function smiley(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, bg: string, fg: string) {
  ctx.fillStyle = bg
  roundRect(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.28)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.beginPath()
  ctx.arc(cx - s * 0.17, cy - s * 0.08, s * 0.065, 0, Math.PI * 2)
  ctx.arc(cx + s * 0.17, cy - s * 0.08, s * 0.065, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = fg
  ctx.lineWidth = s * 0.075
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy + s * 0.02, s * 0.22, Math.PI * 0.18, Math.PI * 0.82)
  ctx.stroke()
}

function wordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
  ctx.fillStyle = color
  ctx.font = `900 ${size}px ${FONT}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText('boxo', x, y)
  const w = ctx.measureText('boxo').width
  const ex = align === 'center' ? x + w / 2 : align === 'left' ? x + w : x
  ctx.fillStyle = color === CREAM ? SUN : RED
  ctx.beginPath()
  ctx.arc(ex + size * 0.16, y + size * 0.26, size * 0.11, 0, Math.PI * 2)
  ctx.fill()
}

/** draws one face's art in a local frame centred on the face, y down = "down" when seen from outside */
function paintArt(ctx: CanvasRenderingContext2D, art: Art, w: number, h: number, tri: boolean, seed: number) {
  const r = rng(seed)
  const m = Math.min(w, h)
  const oy = tri ? h * 0.14 : 0 // triangles: push content towards the wide end
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fill = (c: string) => {
    ctx.fillStyle = c
    ctx.fillRect(-w, -h, w * 2, h * 2)
  }
  if (art === 'base') {
    fill(RED)
    ctx.fillStyle = CREAM
    for (let i = 0; i < 26; i++) {
      const bw = r() < 0.5 ? 3 : 7
      ctx.fillRect(-m * 0.3 + i * m * 0.023, -m * 0.08, bw, m * 0.16)
    }
    return
  }
  if (art === 'hero') {
    fill(RED)
    // confetti
    const cols = [SUN, CREAM, PINK, INK]
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = cols[i % 4]
      ctx.globalAlpha = 0.9
      const x = (r() - 0.5) * w
      const y = (r() - 0.5) * h
      if (Math.abs(x) < m * 0.36 && Math.abs(y - oy) < m * 0.36) continue
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(r() * Math.PI)
      if (i % 3 === 0) ctx.fillRect(-m * 0.035, -m * 0.012, m * 0.07, m * 0.024)
      else {
        ctx.beginPath()
        ctx.arc(0, 0, m * (0.012 + r() * 0.014), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.globalAlpha = 1
    const k = tri ? 0.8 : 1
    smiley(ctx, 0, oy - m * 0.13 * k, m * 0.3 * k, CREAM, RED)
    wordmark(ctx, -m * 0.03, oy + m * 0.16 * k, m * 0.2 * k, CREAM)
    ctx.fillStyle = 'rgba(248,240,226,0.85)'
    ctx.font = `600 ${m * 0.05 * k}px ${MONO}`
    ctx.fillText('FOLDED WITH CARE', 0, oy + m * 0.31 * k)
    return
  }
  if (art === 'dots') {
    fill(CREAM)
    const step = m * 0.16
    for (let y = -h; y < h; y += step) {
      const row = Math.round(y / step)
      for (let x = -w + (row % 2 ? step / 2 : 0); x < w; x += step) {
        ctx.fillStyle = (Math.round(x / step) + row) % 5 === 0 ? SUN : RED
        ctx.beginPath()
        ctx.arc(x, y, step * 0.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (!tri) {
      ctx.fillStyle = CREAM
      roundRect(ctx, -m * 0.3, -m * 0.09, m * 0.6, m * 0.18, m * 0.09)
      ctx.fill()
      wordmark(ctx, -m * 0.02, 0, m * 0.11, RED)
    }
    return
  }
  if (art === 'stripes') {
    fill(RED)
    ctx.save()
    ctx.rotate(-Math.PI / 4)
    ctx.fillStyle = '#ea7454'
    const st = m * 0.13
    for (let x = -w * 2; x < w * 2; x += st * 2) ctx.fillRect(x, -h * 2, st, h * 4)
    ctx.restore()
    ctx.fillStyle = INK
    roundRect(ctx, -m * 0.36, oy - m * 0.085, m * 0.72, m * 0.17, m * 0.085)
    ctx.fill()
    ctx.fillStyle = CREAM
    ctx.font = `700 ${m * (tri ? 0.05 : 0.062)}px ${MONO}`
    ctx.fillText('HANDLE WITH JOY', 0, oy + 2)
    return
  }
  if (art === 'arrows') {
    fill(SUN)
    ctx.fillStyle = INK
    for (const dx of [-0.13, 0.13]) {
      const x = dx * m
      ctx.beginPath()
      ctx.moveTo(x, -m * 0.28)
      ctx.lineTo(x + m * 0.1, -m * 0.12)
      ctx.lineTo(x + m * 0.035, -m * 0.12)
      ctx.lineTo(x + m * 0.035, m * 0.06)
      ctx.lineTo(x - m * 0.035, m * 0.06)
      ctx.lineTo(x - m * 0.035, -m * 0.12)
      ctx.lineTo(x - m * 0.1, -m * 0.12)
      ctx.closePath()
      ctx.fill()
    }
    ctx.font = `800 ${m * 0.075}px ${MONO}`
    ctx.fillText('THIS SIDE UP', 0, m * 0.17)
    ctx.font = `700 ${m * 0.07}px ${FONT}`
    ctx.fillStyle = RED
    ctx.fillText('向上 · 轻放', 0, m * 0.29)
    return
  }
  if (art === 'lid') {
    fill(CREAM)
    ctx.strokeStyle = RED
    ctx.lineWidth = m * 0.018
    ctx.setLineDash([m * 0.03, m * 0.03])
    ctx.beginPath()
    ctx.arc(0, oy, m * (tri ? 0.27 : 0.36), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.arc(0, oy, m * (tri ? 0.22 : 0.29), 0, Math.PI * 2)
    ctx.fill()
    smiley(ctx, 0, oy - m * 0.05, m * (tri ? 0.15 : 0.2), CREAM, RED)
    ctx.fillStyle = CREAM
    ctx.font = `800 ${m * (tri ? 0.045 : 0.06)}px ${MONO}`
    ctx.fillText('BOXO CO.', 0, oy + m * (tri ? 0.11 : 0.15))
    return
  }
  if (art === 'wave') {
    fill(CREAM)
    ctx.strokeStyle = RED
    ctx.lineWidth = m * 0.04
    ctx.lineCap = 'round'
    for (let y = -h; y < h; y += m * 0.13) {
      ctx.beginPath()
      for (let x = -w; x <= w; x += 6) {
        const yy = y + Math.sin(x / (m * 0.06)) * m * 0.03
        if (x === -w) ctx.moveTo(x, yy)
        else ctx.lineTo(x, yy)
      }
      ctx.stroke()
    }
    return
  }
  if (art === 'glue') {
    fill(RED)
    ctx.strokeStyle = 'rgba(248,240,226,0.35)'
    ctx.lineWidth = 3
    for (let x = -w; x < w; x += 14) {
      ctx.beginPath()
      ctx.moveTo(x, -h)
      ctx.lineTo(x + h * 2, h)
      ctx.stroke()
    }
    ctx.fillStyle = CREAM
    ctx.font = `700 ${Math.min(h * 0.36, 34)}px ${MONO}`
    ctx.fillText('GLUE HERE · 粘合', 0, 0)
    return
  }
  // flap
  fill(INK)
  ctx.fillStyle = CREAM
  ctx.font = `700 ${Math.min(h * 0.32, 40)}px ${MONO}`
  ctx.fillText('PUSH IN  ·  插入', 0, 0)
}

function polyPath(ctx: CanvasRenderingContext2D, pts: V2[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
}

function buildNet(def: NetDef): Built {
  const root = def.faces[0]
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (const f of def.faces)
    for (const [u, v] of f.poly) {
      minU = Math.min(minU, u)
      minV = Math.min(minV, v)
      maxU = Math.max(maxU, u)
      maxV = Math.max(maxV, v)
    }
  const M = 0.1
  const W = maxU - minU + 2 * M
  const H = maxV - minV + 2 * M
  const cw = Math.ceil(W * PPU)
  const chh = Math.ceil(H * PPU)
  const toC = (p: V2): V2 => [(p[0] - minU + M) * PPU, (p[1] - minV + M) * PPU]
  const uv = (p: V2): V2 => [(p[0] - minU + M) / W, 1 - (p[1] - minV + M) / H]
  const frames = def.faces.map((f) => frameOf(f, root))

  /* ---------- print canvas (outside) */
  const pc = document.createElement('canvas')
  pc.width = cw
  pc.height = chh
  const px = pc.getContext('2d')!
  px.fillStyle = RED
  px.fillRect(0, 0, cw, chh)
  def.faces.forEach((f, i) => {
    const fr = frames[i]
    const [ax, ay] = toC(fr.a)
    px.save()
    // art x → crease direction, art y-down → −n (mirrored on the canvas: the outside is the underside)
    px.setTransform(fr.d[0], fr.d[1], -fr.n[0], -fr.n[1], ax, ay)
    const art = f.poly.map((p): V2 => {
      const l = toLocal(fr, p)
      return [l[0] * PPU, -l[1] * PPU]
    })
    // slightly grown clip so texture filtering never shows the canvas base at the cut edge
    const c = centroid(art)
    const grown = art.map((p): V2 => {
      const dx = p[0] - c[0]
      const dy = p[1] - c[1]
      const l = Math.hypot(dx, dy) || 1
      return [p[0] + (dx / l) * 6, p[1] + (dy / l) * 6]
    })
    polyPath(px, grown)
    px.clip()
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const [x, y] of art) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
    const tri = f.poly.length === 3
    // triangles: centre on the bbox centre (art shifts toward the wide end via `tri`)
    px.translate((x0 + x1) / 2, (y0 + y1) / 2)
    if (f.artRot) px.rotate(f.artRot)
    const rw = f.artRot && Math.abs(Math.sin(f.artRot)) > 0.5 ? y1 - y0 : x1 - x0
    const rh = f.artRot && Math.abs(Math.sin(f.artRot)) > 0.5 ? x1 - x0 : y1 - y0
    paintArt(px, f.art, rw, rh, tri, 11 + i * 7)
    px.restore()
    // print-side crease: a faint light score line
    if (f.edge) {
      px.save()
      px.strokeStyle = 'rgba(255,255,255,0.35)'
      px.lineWidth = 2
      const [p, q] = f.edge.map(toC)
      px.beginPath()
      px.moveTo(p[0], p[1])
      px.lineTo(q[0], q[1])
      px.stroke()
      px.restore()
    }
  })

  /* ---------- kraft canvas (inside, seen from above while flat) */
  const kc = document.createElement('canvas')
  kc.width = cw
  kc.height = chh
  const kx = kc.getContext('2d')!
  kx.fillStyle = KRAFT
  kx.fillRect(0, 0, cw, chh)
  const r = rng(5)
  for (let i = 0; i < (cw * chh) / 90; i++) {
    const l = r()
    kx.fillStyle = l < 0.5 ? `rgba(120,80,40,${0.05 + r() * 0.08})` : `rgba(255,240,215,${0.06 + r() * 0.1})`
    kx.fillRect(r() * cw, r() * chh, 1 + r() * 2.5, 1 + r() * 1.2)
  }
  def.faces.forEach((f, i) => {
    const c = toC(centroid(f.poly))
    kx.fillStyle = 'rgba(92,60,30,0.55)'
    kx.textAlign = 'center'
    kx.textBaseline = 'middle'
    kx.font = `600 ${f.lift ? 26 : f.poly.length === 3 ? 34 : 46}px ${FONT}`
    kx.fillText(f.name, c[0], c[1] - (f.lift ? 0 : 8))
    if (!f.lift) {
      kx.font = `600 19px ${MONO}`
      kx.fillStyle = 'rgba(92,60,30,0.4)'
      kx.fillText(`F${i + 1}${f.angle ? ` · ${Math.round(f.angle)}°` : ' · BASE'}`, c[0], c[1] + 30)
    }
    if (f.edge) {
      const [p, q] = f.edge.map(toC)
      kx.save()
      kx.strokeStyle = 'rgba(110,70,35,0.6)'
      kx.lineWidth = 2.5
      kx.setLineDash([14, 9])
      kx.beginPath()
      kx.moveTo(p[0], p[1])
      kx.lineTo(q[0], q[1])
      kx.stroke()
      kx.restore()
    }
  })
  // registration marks
  kx.strokeStyle = 'rgba(224,87,58,0.7)'
  kx.lineWidth = 2
  const baseC = toC(centroid(root.poly))
  kx.beginPath()
  kx.arc(baseC[0], baseC[1] + 60, 10, 0, Math.PI * 2)
  kx.moveTo(baseC[0] - 18, baseC[1] + 60)
  kx.lineTo(baseC[0] + 18, baseC[1] + 60)
  kx.moveTo(baseC[0], baseC[1] + 42)
  kx.lineTo(baseC[0], baseC[1] + 78)
  kx.stroke()

  const mk = (cv: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(cv)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  const mats: THREE.Material[] = [
    new THREE.MeshStandardMaterial({ map: mk(kc), roughness: 0.95, metalness: 0 }),
    new THREE.MeshStandardMaterial({ map: mk(pc), roughness: 0.5, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: EDGE, roughness: 0.9 }),
  ]

  const faces: BuiltFace[] = def.faces.map((f, i) => {
    const fr = frames[i]
    const local = f.poly.map((p) => toLocal(fr, p))
    const geo = slabGeometry(local, f.poly, uv)
    let hingePos: [number, number, number] = [0, 0, 0]
    let hingeRotY = 0
    if (f.parent >= 0) {
      const pf = frames[f.parent]
      const hl = toLocal(pf, fr.a)
      hingePos = [hl[0], 0, hl[1]]
      const phi = Math.atan2(fr.d[1], fr.d[0]) - Math.atan2(pf.d[1], pf.d[0])
      hingeRotY = -phi
    }
    return {
      def: f,
      frame: fr,
      geo,
      hingePos,
      hingeRotY,
      angle: THREE.MathUtils.degToRad(f.angle ?? 0),
      children: [],
    }
  })
  def.faces.forEach((f, i) => f.parent >= 0 && faces[f.parent].children.push(i))

  const bc = centroid(root.poly)
  // root frame origin sits at root.poly[0]; shift so the base centre is at the world origin
  const rootOffset: [number, number, number] = [-(bc[0] - frames[0].a[0]), T / 2 + 0.003, -(bc[1] - frames[0].a[1])]
  const flatCenter = new THREE.Vector3((minU + maxU) / 2 - bc[0], 0, (minV + maxV) / 2 - bc[1])
  const closedCenter = new THREE.Vector3(0, def.height * 0.45, 0)
  const sf = frames[def.sticker.face]
  const sl = toLocal(sf, def.sticker.at)
  return {
    faces,
    mats,
    rootOffset,
    flatCenter,
    closedCenter,
    sticker: { pos: [sl[0], -T / 2 - 0.004, sl[1]], size: def.sticker.size, tilt: def.sticker.tilt, face: def.sticker.face },
  }
}

const builtCache = new Map<ShapeId, Built>()
const getBuilt = (id: ShapeId) => {
  let b = builtCache.get(id)
  if (!b) {
    b = buildNet(NETS[id])
    builtCache.set(id, b)
  }
  return b
}

let stickerTex: THREE.CanvasTexture | null = null
function getStickerTex() {
  if (stickerTex) return stickerTex
  const c = document.createElement('canvas')
  c.width = c.height = 320
  const x = c.getContext('2d')!
  const R = 160
  // scalloped seal
  x.fillStyle = SUN
  x.beginPath()
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2
    const rr = R - 8 - (i % 2 ? 9 : 0)
    x.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr)
  }
  x.fill()
  x.fillStyle = INK
  x.beginPath()
  x.arc(R, R, R - 40, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = SUN
  x.lineWidth = 3
  x.setLineDash([7, 7])
  x.beginPath()
  x.arc(R, R, R - 54, 0, Math.PI * 2)
  x.stroke()
  x.setLineDash([])
  x.fillStyle = CREAM
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = `800 58px ${FONT}`
  x.fillText('已打包', R, R - 14)
  x.font = `700 22px ${MONO}`
  x.fillStyle = SUN
  x.fillText('PACKED ✓', R, R + 40)
  stickerTex = new THREE.CanvasTexture(c)
  stickerTex.colorSpace = THREE.SRGBColorSpace
  stickerTex.anisotropy = 8
  return stickerTex
}

/* ------------------------------------------------------------------ shared state */

type Drag = { mode: 'none' | 'scrub' | 'orbit'; x0: number; y0: number; g0: number; yaw0: number; pitch0: number; g: number }
type Shared = {
  avg: number
  yaw: number
  pitch: number
  px: number
  py: number
  drag: Drag
  hoverPaper: boolean
}
type MVs = { prog: MotionValue<number>[]; hop: MotionValue<number>; sticker: MotionValue<number>; swap: MotionValue<number> }

/* ------------------------------------------------------------------ scene */

function FaceNode({ b, i, refs, mvs }: { b: Built; i: number; refs: React.RefObject<(THREE.Object3D | null)[]>; mvs: MVs }) {
  const f = b.faces[i]
  const isSticker = b.sticker.face === i
  const tex = isSticker ? getStickerTex() : null
  return (
    <group position={f.hingePos} rotation={[0, f.hingeRotY, 0]}>
      <group ref={(o) => void (refs.current[i] = o)}>
        <mesh geometry={f.geo} material={b.mats} castShadow receiveShadow ref={(o) => void (refs.current[MAX_FACES + i] = o)} />
        {isSticker && (
          <group position={b.sticker.pos} rotation={[Math.PI / 2, 0, 0]}>
            <mesh rotation={[0, 0, b.sticker.tilt]} ref={(o) => void (refs.current[MAX_FACES * 2] = o)} scale={mvs.sticker.get() || 0.0001}>
              <circleGeometry args={[b.sticker.size / 2, 48]} />
              <meshStandardMaterial map={tex} transparent alphaTest={0.5} roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          </group>
        )}
        {f.children.map((c) => (
          <FaceNode key={c} b={b} i={c} refs={refs} mvs={mvs} />
        ))}
      </group>
    </group>
  )
}

function Net({ shape, mvs, S, onGrab }: { shape: ShapeId; mvs: MVs; S: React.RefObject<Shared>; onGrab: (e: ThreeEvent<PointerEvent>) => void }) {
  const b = useMemo(() => getBuilt(shape), [shape])
  const outer = useRef<THREE.Group>(null)
  const refs = useRef<(THREE.Object3D | null)[]>([])
  const height = NETS[shape].height

  useFrame(() => {
    let sum = 0
    let cnt = 0
    for (let i = 1; i < b.faces.length; i++) {
      const p = mvs.prog[i].get()
      const g = refs.current[i]
      if (g) g.rotation.x = -b.faces[i].angle * p
      if (b.faces[i].def.lift) {
        const m = refs.current[MAX_FACES + i]
        if (m) m.position.y = T * 1.25 * THREE.MathUtils.clamp(p, 0, 1)
      }
      sum += THREE.MathUtils.clamp(p, 0, 1)
      cnt++
    }
    S.current.avg = cnt ? sum / cnt : 0
    const o = outer.current
    if (o) {
      const hop = mvs.hop.get()
      o.position.y = Math.sin(hop * Math.PI * 0.5) * height * 0.42
      o.rotation.y = hop * 0.35
      const sw = Math.max(0.0001, mvs.swap.get())
      o.scale.setScalar(sw)
    }
    const st = refs.current[MAX_FACES * 2]
    if (st) st.scale.setScalar(Math.max(0.0001, mvs.sticker.get()))
  })

  return (
    <group ref={outer}>
      <group
        position={b.rootOffset}
        onPointerDown={onGrab}
        onPointerOver={() => {
          S.current.hoverPaper = true
          if (S.current.drag.mode === 'none') document.body.style.cursor = 'ns-resize'
        }}
        onPointerOut={() => {
          S.current.hoverPaper = false
          if (S.current.drag.mode === 'none') document.body.style.cursor = ''
        }}
      >
        <mesh geometry={b.faces[0].geo} material={b.mats} castShadow receiveShadow />
        {b.faces[0].children.map((c) => (
          <FaceNode key={c} b={b} i={c} refs={refs} mvs={mvs} />
        ))}
      </group>
    </group>
  )
}

function CuttingMat() {
  const { geo, mats } = useMemo(() => {
    const W = 15
    const D = 11
    const R = 0.35
    const shape = new THREE.Shape()
    shape.moveTo(-W / 2 + R, -D / 2)
    shape.lineTo(W / 2 - R, -D / 2)
    shape.quadraticCurveTo(W / 2, -D / 2, W / 2, -D / 2 + R)
    shape.lineTo(W / 2, D / 2 - R)
    shape.quadraticCurveTo(W / 2, D / 2, W / 2 - R, D / 2)
    shape.lineTo(-W / 2 + R, D / 2)
    shape.quadraticCurveTo(-W / 2, D / 2, -W / 2, D / 2 - R)
    shape.lineTo(-W / 2, -D / 2 + R)
    shape.quadraticCurveTo(-W / 2, -D / 2, -W / 2 + R, -D / 2)
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 6 })
    geo.rotateX(-Math.PI / 2)
    const P = 90
    const c = document.createElement('canvas')
    c.width = W * P
    c.height = D * P
    const x = c.getContext('2d')!
    x.fillStyle = '#e3ddd0'
    x.fillRect(0, 0, c.width, c.height)
    for (let gx = 0; gx <= W * 4; gx++) {
      const major = gx % 4 === 0
      x.fillStyle = major ? 'rgba(150,135,110,0.28)' : 'rgba(150,135,110,0.13)'
      x.fillRect(gx * (P / 4) - (major ? 1 : 0.5), 0, major ? 2 : 1, c.height)
    }
    for (let gy = 0; gy <= D * 4; gy++) {
      const major = gy % 4 === 0
      x.fillStyle = major ? 'rgba(150,135,110,0.28)' : 'rgba(150,135,110,0.13)'
      x.fillRect(0, gy * (P / 4) - (major ? 1 : 0.5), c.width, major ? 2 : 1)
    }
    // 45° guide lines + ruler numbers
    x.strokeStyle = 'rgba(150,135,110,0.18)'
    x.lineWidth = 1.5
    x.beginPath()
    x.moveTo(0, 0)
    x.lineTo(c.height, c.height)
    x.moveTo(c.width, 0)
    x.lineTo(c.width - c.height, c.height)
    x.stroke()
    x.fillStyle = 'rgba(224,87,58,0.75)'
    x.font = `600 15px ${MONO}`
    x.textAlign = 'center'
    for (let i = 1; i < W; i++) x.fillText(String(i), i * P, 22)
    x.textAlign = 'left'
    x.fillStyle = 'rgba(120,105,85,0.6)'
    x.font = `600 16px ${MONO}`
    x.fillText('BOXO · SELF-HEALING MAT · A3', 26, c.height - 22)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    // extrude caps use raw shape coords as UVs
    tex.repeat.set(1 / W, 1 / D)
    tex.offset.set(0.5, 0.5)
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    const mats = [
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#d2cabb', roughness: 0.9 }),
    ]
    return { geo, mats }
  }, [])
  return <mesh geometry={geo} material={mats} position={[0.6, -0.08, -0.6]} receiveShadow castShadow />
}

function Lights() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e6', 2.3)
    l.position.set(-4.5, 9, 5.5)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -8
    cam.right = cam.top = 8
    cam.near = 1
    cam.far = 30
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    l.shadow.radius = 5
    return l
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d8c9b2', 1.0]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 4, -3]} intensity={0.55} color="#e9eefc" />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

/** perspective orbit rig: frames the flat net, dollies in as the solid closes */
function Rig({ shape, S }: { shape: ShapeId; S: React.RefObject<Shared> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  const st = useMemo(() => ({ k: POSTER ? 0.6 : 0, yaw: 0.42, pitch: 0.86, t: 0, target: new THREE.Vector3(), tmp: new THREE.Vector3() }), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    st.t += dt
    const s = S.current
    const b = getBuilt(shape)
    const def = NETS[shape]
    st.k = THREE.MathUtils.damp(st.k, s.avg, 2.6, dt)
    const dragging = s.drag.mode !== 'none'
    const sway = dragging || POSTER ? 0 : Math.sin(st.t * 0.22) * 0.12
    const yawT = s.yaw + sway + (POSTER ? 0 : s.px * 0.08)
    const pitchT = s.pitch + (POSTER ? 0 : s.py * 0.05)
    st.yaw = THREE.MathUtils.damp(st.yaw, yawT, 5, dt)
    st.pitch = THREE.MathUtils.damp(st.pitch, pitchT, 5, dt)
    const mobile = width < 760
    const aspect = width / height
    const portrait = 1 / Math.min(1, aspect * (mobile ? 1.25 : 1.25))
    const dist = THREE.MathUtils.lerp(def.distFlat, def.distClosed, st.k) * portrait
    st.tmp.lerpVectors(b.flatCenter, b.closedCenter, st.k)
    st.target.copy(st.tmp)
    const cp = Math.cos(st.pitch)
    camera.position.set(st.target.x + dist * cp * Math.sin(st.yaw), st.target.y + dist * Math.sin(st.pitch), st.target.z + dist * cp * Math.cos(st.yaw))
    camera.lookAt(st.target)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.2 : 0.01
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ page */

type Phase = 'flat' | 'folding' | 'closed' | 'unfolding'
const PHASE_TEXT: Record<Phase, string> = {
  flat: '平铺 · 内侧朝上',
  folding: '沿折痕依次折起…',
  closed: '已封箱',
  unfolding: '原路展开…',
}
const SHAPES: { value: ShapeId; label: string }[] = [
  { value: 'cube', label: '立方体' },
  { value: 'prism', label: '三棱柱' },
  { value: 'pyramid', label: '金字塔' },
]

export default function OrigamiBox() {
  const [shape, setShape] = useState<ShapeId>('cube')
  const [phase, setPhase] = useState<Phase>('flat')
  const shapeRef = useRef<ShapeId>('cube')
  const foldedRef = useRef(false)
  const lastUser = useRef(-1e9)
  const S = useRef<Shared>({
    avg: 0,
    yaw: 0.42,
    pitch: 0.86,
    px: 0,
    py: 0,
    drag: { mode: 'none', x0: 0, y0: 0, g0: 0, yaw0: 0, pitch0: 0, g: 0 },
    hoverPaper: false,
  })
  const mvs = useMemo<MVs>(
    () => ({
      prog: Array.from({ length: MAX_FACES }, () => motionValue(0)),
      hop: motionValue(0),
      sticker: motionValue(0),
      swap: motionValue(POSTER ? 1 : 0),
    }),
    [],
  )

  /* ---------- director (Motion timelines, cancellable by generation) */
  const gen = useRef(0)
  const cancelers = useRef(new Set<() => void>())
  const anims = useRef<AnimationPlaybackControls[]>([])
  const stopAnims = () => {
    anims.current.forEach((a) => a.stop())
    anims.current = []
  }
  const cancelRun = () => {
    gen.current++
    cancelers.current.forEach((f) => f())
    cancelers.current.clear()
  }
  const wait = (g: number, p: Promise<unknown> | number) =>
    new Promise<boolean>((res) => {
      let done = false
      const fin = (alive: boolean) => {
        if (done) return
        done = true
        cancelers.current.delete(cancel)
        res(alive)
      }
      const cancel = () => fin(false)
      cancelers.current.add(cancel)
      const pr = typeof p === 'number' ? new Promise((r) => setTimeout(r, p)) : p
      pr.then(() => fin(g === gen.current))
    })

  const foldTo = (target: 0 | 1) => {
    stopAnims()
    const net = NETS[shapeRef.current]
    foldedRef.current = target === 1
    setPhase(target ? 'folding' : 'unfolding')
    const maxD = Math.max(...net.faces.map((f) => f.delay ?? 0))
    if (!target) anims.current.push(animate(mvs.sticker, 0, { duration: 0.18, ease: 'easeIn' }))
    const list: AnimationPlaybackControls[] = []
    net.faces.forEach((f, i) => {
      if (f.parent < 0) return
      list.push(
        animate(
          mvs.prog[i],
          target,
          target
            ? { type: 'spring', stiffness: 170, damping: 16.5, restDelta: 0.001, delay: (f.delay ?? 0) * 1.15 }
            : { type: 'spring', stiffness: 130, damping: 18, restDelta: 0.001, delay: 0.12 + (maxD - (f.delay ?? 0)) * 0.7 },
        ),
      )
    })
    anims.current.push(...list)
    return Promise.all(list.map((a) => a.finished)).then(() => setPhase(target ? 'closed' : 'flat'))
  }

  const celebrate = () => {
    anims.current.push(animate(mvs.hop, [0, 1, 0], { duration: 0.66, times: [0, 0.45, 1], ease: ['easeOut', 'easeIn'] }))
    anims.current.push(animate(mvs.sticker, 1, { type: 'spring', stiffness: 420, damping: 15, delay: 0.62 }))
  }

  const swapTo = async (next: ShapeId) => {
    stopAnims()
    await animate(mvs.swap, 0, { duration: 0.22, ease: [0.5, 0, 0.75, 0] }).finished
    mvs.prog.forEach((p) => p.jump(0))
    mvs.sticker.jump(0)
    foldedRef.current = false
    shapeRef.current = next
    setShape(next)
    setPhase('flat')
    anims.current.push(animate(mvs.swap, 1, { type: 'spring', stiffness: 260, damping: 18 }))
  }

  const runLoop = async (startDelay: number) => {
    cancelRun()
    const g = gen.current
    if (!(await wait(g, startDelay))) return
    for (;;) {
      if (!foldedRef.current) {
        if (!(await wait(g, foldTo(1)))) return
        celebrate()
        if (!(await wait(g, 3000))) return
      } else if (!(await wait(g, 1600))) return
      if (!(await wait(g, foldTo(0)))) return
      if (!(await wait(g, 1100))) return
      if (performance.now() - lastUser.current > 16000) {
        const next = ORDER[(ORDER.indexOf(shapeRef.current) + 1) % ORDER.length]
        if (!(await wait(g, swapTo(next)))) return
        if (!(await wait(g, 700))) return
      }
    }
  }

  // user-driven action, then resume the ambient loop after a pause
  const userRun = (fn: () => Promise<unknown> | void, resumeAfter = 6500) => {
    lastUser.current = performance.now()
    cancelRun()
    const g = gen.current
    ;(async () => {
      const r = fn()
      if (r && !(await wait(g, r))) return
      if (!(await wait(g, resumeAfter))) return
      runLoop(0)
    })()
  }

  const toggle = () =>
    userRun(() => {
      const t = foldedRef.current ? 0 : 1
      return foldTo(t).then(() => t && celebrate())
    })

  const pickShape = (v: ShapeId) => {
    if (v === shapeRef.current) return
    userRun(() => swapTo(v).then(() => new Promise((r) => setTimeout(r, 450))).then(() => foldTo(1).then(() => celebrate())), 4000)
  }

  useEffect(() => {
    if (POSTER) {
      // frozen mid-fold: walls up, lid swinging shut
      const net = NETS.cube
      net.faces.forEach((f, i) => {
        if (f.parent < 0) return
        mvs.prog[i].jump(f.name === '盖' ? 0.62 : f.name === '插舌' ? 0.35 : 1)
      })
      return
    }
    anims.current.push(animate(mvs.swap, 1, { type: 'spring', stiffness: 200, damping: 18, delay: 0.25 }))
    runLoop(1300)
    return () => {
      cancelRun()
      stopAnims()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- pointer: scrub on paper, orbit elsewhere */
  const net = NETS[shape]
  const scrubTo = (g: number) => {
    const maxD = Math.max(...net.faces.map((f) => f.delay ?? 0)) || 1
    const span = 0.5
    net.faces.forEach((f, i) => {
      if (f.parent < 0) return
      const dn = (f.delay ?? 0) / maxD
      const x = THREE.MathUtils.clamp((g - dn * span) / (1 - span), 0, 1)
      mvs.prog[i].set(x * x * (3 - 2 * x))
    })
  }

  const onGrab = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    lastUser.current = performance.now()
    cancelRun()
    stopAnims()
    if (mvs.sticker.get() > 0) anims.current.push(animate(mvs.sticker, 0, { duration: 0.15 }))
    if (mvs.swap.get() < 1) mvs.swap.set(1)
    const d = S.current.drag
    d.mode = 'scrub'
    d.x0 = e.nativeEvent.clientX
    d.y0 = e.nativeEvent.clientY
    d.g0 = S.current.avg
    d.g = d.g0
    setPhase(d.g0 > 0.5 ? 'unfolding' : 'folding')
    document.body.style.cursor = 'grabbing'
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = S.current
      s.px = (e.clientX / window.innerWidth) * 2 - 1
      s.py = (e.clientY / window.innerHeight) * 2 - 1
      const d = s.drag
      if (d.mode === 'scrub') {
        d.g = THREE.MathUtils.clamp(d.g0 + (d.y0 - e.clientY) / Math.min(260, window.innerHeight * 0.32), 0, 1)
        scrubTo(d.g)
      } else if (d.mode === 'orbit') {
        s.yaw = d.yaw0 - (e.clientX - d.x0) * 0.006
        s.pitch = THREE.MathUtils.clamp(d.pitch0 + (e.clientY - d.y0) * 0.004, 0.32, 1.32)
      }
    }
    const up = () => {
      const s = S.current
      const d = s.drag
      if (d.mode === 'scrub') {
        const t = d.g > 0.5 ? 1 : 0
        d.mode = 'none'
        userRun(() => foldTo(t as 0 | 1).then(() => t && celebrate()))
      } else if (d.mode === 'orbit') {
        d.mode = 'none'
        lastUser.current = performance.now()
      }
      document.body.style.cursor = s.hoverPaper ? 'ns-resize' : ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape])

  const onStageDown = (e: React.PointerEvent) => {
    // R3F's handler runs first (native listener on the canvas container); paper grabs set mode = 'scrub'
    const d = S.current.drag
    if (d.mode !== 'none' || POSTER || e.button !== 0) return
    if ((e.target as HTMLElement).closest('.overlay > *')) return
    d.mode = 'orbit'
    d.x0 = e.clientX
    d.y0 = e.clientY
    d.yaw0 = S.current.yaw
    d.pitch0 = S.current.pitch
    document.body.style.cursor = 'grabbing'
  }

  const folded = phase === 'folding' || phase === 'closed'

  return (
    <div className="stage ori-stage" onPointerDown={onStageDown}>
      <style>{`
        .ori-stage { background: radial-gradient(110% 90% at 68% 42%, #faf7f1 0%, #f1ece2 55%, #e7e0d3 100%); touch-action: none; }
        .ori-stage .scrim { --soft-bg: #f4f0e8; }
        .ori-stage .hero-copy { width: min(520px, calc(100% - 48px)); }
        .ori-stage .hero-copy h1 { font-size: clamp(32px, 3.75vw, 54px); }
        .ori-stage .hero-copy h1 em { color: ${RED}; }
        .ori-stat { display: inline-flex; align-items: center; gap: 10px; margin-top: 22px !important; height: 18px; font: 500 12px/1 var(--mono) !important; letter-spacing: .04em; color: var(--fg-2); }
        .ori-stat b { width: 8px; height: 8px; border-radius: 2px; background: ${RED}; transition: background .3s; }
        .ori-stat b.on { background: #3f9a72; }
        .ori-toggle { min-width: 104px; }
        @media (max-width: 760px) {
          .ori-stage .hero-copy p:not(.kicker):not(.ori-stat) { font-size: 14px; line-height: 1.65; }
          .ori-stage .hero-actions { display: none; }
        }
      `}</style>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 120, position: [4, 8, 9] }} gl={{ antialias: true, alpha: true }}>
        <Rig shape={shape} S={S} />
        <Lights />
        <CuttingMat />
        <Net shape={shape} mvs={mvs} S={S} onGrab={onGrab} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Hinged faces · Spring stagger
          </p>
          <h1>
            从一张纸，
            <br />
            到一个<em>可交付</em>的盒子
          </h1>
          <p>每一面都挂在父面的折痕上：先立四壁，再合上盖，最后插好插舌，一气呵成；展开时原路退回。在纸面上上下拖动，可以亲手把它折起来。</p>
          <div className="hero-actions">
            <button className="btn primary ori-toggle" onClick={toggle}>
              {folded ? '展开' : '折叠'}
            </button>
            <button className="btn" onClick={() => pickShape(ORDER[(ORDER.indexOf(shape) + 1) % ORDER.length])}>
              换个形状
            </button>
          </div>
          <p className="ori-stat">
            <b className={phase === 'closed' ? 'on' : ''} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={phase + shape}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                transition={{ duration: 0.22 }}
              >
                {SHAPES.find((s) => s.value === shape)!.label} · {net.faces.length} 面 · {PHASE_TEXT[phase]}
              </motion.span>
            </AnimatePresence>
          </p>
        </motion.div>

        <div className="dock">
          <Seg items={SHAPES} value={shape} onChange={pickShape} />
          <span className="dock-sep" />
          <button className="seg ori-dock-toggle" onClick={toggle}>
            <span>{folded ? '展开' : '折叠'}</span>
          </button>
        </div>
        <p className="hint">纸面上下拖动：手动折叠 · 空白处拖动：旋转视角</p>
      </div>
    </div>
  )
}
