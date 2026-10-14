import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { createManualEffect, manualMeta, manualModes, setManualLineScale, setManualMode, setManualPanel, type ManualMode } from './effects/manual'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 说明书线图 showcase — a manual page. A little brick car is assembled step by step (steps 12–17): the step's
 * parts appear above / beside the model, slide into place and seat with a "click". The DOM is the page: a
 * big step number, a parts box with small isometric part drawings and counts, a green curved arrow + "click!"
 * projected from the 3D anchor, a page number and the little helper man. 爆炸图 pulls every placed part
 * apart along its assembly direction with dashed guide lines, part letters and a dimension line.
 * The look (uniform outlines, two flat tones, edge hairline) is ./effects/manual.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

/* ------------------------------------------------------------------ the model */

type IconKind = 'plate' | 'wheel' | 'brick' | 'wind' | 'steer' | 'round' | 'fig' | 'seat'
type V3 = [number, number, number]
type MeshDef = { geo: THREE.BufferGeometry; color: string; glass?: boolean; pos?: V3; rot?: V3 }
type Part = { step: number; pos: V3; from: V3; anchor: V3; meshes: MeshDef[] }

const C = {
  grey: '#6f747a',
  light: '#b9bfc5',
  black: '#26272b',
  red: '#d4302b',
  yellow: '#f6c21c',
  blue: '#1f62c4',
  glass: '#a9dcf5',
  skin: '#f6cf2f',
  tan: '#d9bf8a',
}

function brickGeo(w: number, d: number, h: number, studs = true) {
  const parts: THREE.BufferGeometry[] = []
  const b = new THREE.BoxGeometry(w - 0.05, h, d - 0.05)
  b.translate(0, h / 2, 0)
  parts.push(b)
  if (studs)
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const s = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20)
        s.translate(-w / 2 + 0.5 + i, h + 0.1, -d / 2 + 0.5 + j)
        parts.push(s)
      }
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()))
  parts.forEach((p) => p.dispose())
  return g
}

function makeParts(): Part[] {
  const wheel = new THREE.CylinderGeometry(0.82, 0.82, 0.62, 36).rotateX(Math.PI / 2)
  const hub = new THREE.CylinderGeometry(0.42, 0.42, 0.7, 24).rotateX(Math.PI / 2)
  const round = new THREE.CylinderGeometry(0.46, 0.46, 0.5, 28).rotateZ(Math.PI / 2)
  const glass = new THREE.BoxGeometry(0.14, 1.35, 3.6)
  const steer = new THREE.TorusGeometry(0.3, 0.07, 10, 28).rotateY(Math.PI / 2)
  const column = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10)
  const torso = new THREE.BoxGeometry(0.75, 1.0, 1.5)
  torso.translate(0, 0.5, 0)
  const head = new THREE.CylinderGeometry(0.42, 0.42, 0.7, 28)
  const stud = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 18)
  const parts: Part[] = [
    { step: 0, pos: [0, 0, 0], from: [0, 2.6, 0], anchor: [0, 0.4, 0], meshes: [{ geo: brickGeo(6, 4, 0.4), color: C.grey }] },
  ]
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      parts.push({
        step: 1,
        pos: [1.95 * sx, 0.05, 2.32 * sz],
        from: [0, 0, 1.9 * sz],
        anchor: [0, 0, 0.3 * sz],
        meshes: [
          { geo: wheel, color: C.black },
          { geo: hub, color: C.light },
        ],
      })
  for (const sx of [-1, 1]) parts.push({ step: 2, pos: [2 * sx, 0.4, 0], from: [0.4 * sx, 2.4, 0], anchor: [0, 1.4, 0], meshes: [{ geo: brickGeo(2, 4, 1.2), color: C.red }] })
  parts.push({
    step: 3,
    pos: [0.5, 0.4, 0],
    from: [0.2, 2.6, 0],
    anchor: [0.1, 1.8, 0],
    meshes: [
      { geo: brickGeo(1, 4, 0.4, false), color: C.black },
      { geo: glass, color: C.glass, glass: true, pos: [-0.05, 1.05, 0], rot: [0, 0, 0.38] },
    ],
  })
  parts.push({
    step: 3,
    pos: [-0.25, 0.4, 0],
    from: [-0.6, 2.2, 0],
    anchor: [0, 1.1, 0],
    meshes: [
      { geo: column, color: C.black, pos: [0, 0.35, 0], rot: [0, 0, 0.6] },
      { geo: steer, color: C.black, pos: [-0.2, 0.75, 0], rot: [0, 0, 0.6] },
    ],
  })
  for (const sz of [-1, 1]) {
    parts.push({ step: 4, pos: [3.2, 1.0, 1.25 * sz], from: [1.6, 0, 0], anchor: [0.25, 0, 0], meshes: [{ geo: round, color: C.yellow }] })
    parts.push({ step: 4, pos: [-3.2, 1.0, 1.25 * sz], from: [-1.6, 0, 0], anchor: [-0.25, 0, 0], meshes: [{ geo: round, color: C.red }] })
  }
  parts.push({
    step: 5,
    pos: [-1.05, 0.4, 0],
    from: [0, 2.8, 0],
    anchor: [0, 2.3, 0],
    meshes: [
      { geo: brickGeo(1, 2, 0.4, false), color: C.black, pos: [0.25, 0, 0] },
      { geo: torso, color: C.blue, pos: [0.15, 0.4, 0] },
      { geo: head, color: C.skin, pos: [0.15, 1.75, 0] },
      { geo: stud, color: C.skin, pos: [0.15, 2.2, 0] },
    ],
  })
  return parts
}

const STEPS: { n: number; parts: { kind: IconKind; color: string; count: number }[]; say: string }[] = [
  { n: 12, parts: [{ kind: 'plate', color: C.grey, count: 1 }], say: '先放底板' },
  { n: 13, parts: [{ kind: 'wheel', color: C.black, count: 4 }], say: '四个轮子从两侧推进去' },
  { n: 14, parts: [{ kind: 'brick', color: C.red, count: 2 }], say: '前后车身对准凸点按下' },
  {
    n: 15,
    parts: [
      { kind: 'wind', color: C.glass, count: 1 },
      { kind: 'steer', color: C.black, count: 1 },
    ],
    say: '挡风玻璃和方向盘',
  },
  {
    n: 16,
    parts: [
      { kind: 'round', color: C.yellow, count: 2 },
      { kind: 'round', color: C.red, count: 2 },
    ],
    say: '前灯黄，尾灯红',
  },
  {
    n: 17,
    parts: [
      { kind: 'seat', color: C.black, count: 1 },
      { kind: 'fig', color: C.blue, count: 1 },
    ],
    say: '司机就位',
  },
]
const LAST = STEPS.length - 1
const SLIDE0 = 0.35
const SLIDE = 0.75
const CLICK = SLIDE0 + SLIDE + 0.1

/** manual page area in CSS px (the LEGO panel) */
function areaFor(W: number, H: number) {
  if (POSTER) return { x: 28, y: 28, w: W - 56, h: H - 56 }
  if (W < 760) return { x: 12, y: 78, w: W - 24, h: Math.min(H * 0.6, W * 1.35) }
  const left = Math.min(Math.max(W * 0.33, 420), 520)
  return { x: left, y: 78, w: W - left - 28, h: H - 78 - 100 }
}

/* ------------------------------------------------------------------ 3D scene */

type Ui = {
  arrow: RefObject<SVGPathElement | null>
  head: RefObject<SVGPathElement | null>
  click: RefObject<HTMLDivElement | null>
  guides: RefObject<(SVGLineElement | null)[]>
  tags: RefObject<(HTMLDivElement | null)[]>
  dim: RefObject<SVGGElement | null>
  dimLine: RefObject<SVGLineElement | null>
  dimA: RefObject<SVGLineElement | null>
  dimB: RefObject<SVGLineElement | null>
  dimText: RefObject<SVGTextElement | null>
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

function Model({
  step,
  stepT,
  explode,
  ry,
  rx,
  ui,
  onReady,
}: {
  step: number
  stepT: RefObject<number>
  explode: MotionValue<number>
  ry: MotionValue<number>
  rx: MotionValue<number>
  ui: Ui
  onReady: () => void
}) {
  const parts = useMemo(makeParts, [])
  const firstOf = useMemo(() => STEPS.map((_, s) => parts.findIndex((q) => q.step === s)), [parts])
  const mats = useMemo(() => {
    const m = new Map<string, THREE.Material>()
    for (const p of parts)
      for (const d of p.meshes) {
        const key = d.color + (d.glass ? 'g' : '')
        if (!m.has(key))
          m.set(
            key,
            d.glass
              ? new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.15, transparent: true, opacity: 0.82 })
              : new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.5 }),
          )
      }
    return m
  }, [parts])
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats])

  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const model = useRef<THREE.Group>(null)
  const refs = useRef<(THREE.Group | null)[]>([])
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() }), [])
  const t = useRef(0)

  const toScreen = (v: THREE.Vector3, out: THREE.Vector3) => {
    out.copy(v).project(camera)
    out.set(((out.x + 1) / 2) * size.width, ((1 - out.y) / 2) * size.height, 0)
    return out
  }

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    if (!POSTER) stepT.current += dt
    const ts = stepT.current
    const W = size.width
    const H = size.height
    const A = areaFor(W, H)
    // fit the car into the page area (orthographic), a little below centre to leave room for the step header
    const fit = Math.min(A.w * 0.92, A.h * 1.15)
    camera.zoom = fit / (W < 760 ? 6.6 : 8.2)
    camera.position.set(9, 7.2, 11)
    camera.lookAt(0, 0.6, 0)
    camera.setViewOffset(W, H, -(A.x + A.w / 2 - W / 2), -(A.y + A.h * (W < 760 ? 0.55 : 0.56) - H / 2), W, H)
    camera.updateProjectionMatrix()

    const m = model.current
    if (!m) return
    const idle = POSTER ? 0 : Math.sin(t.current * 0.3) * 0.12
    m.rotation.set(rx.get(), ry.get() + idle, 0)
    m.updateMatrixWorld()

    const ex = explode.get()
    parts.forEach((p, i) => {
      const g = refs.current[i]
      if (!g) return
      g.visible = p.step <= step
      if (!g.visible) return
      let k = 1 // 1 = seated
      let pop = 1
      let bounce = 0
      if (p.step === step) {
        const stagger = (i - firstOf[step]) * 0.05
        k = ease(clamp01((ts - SLIDE0 - stagger) / SLIDE))
        pop = 0.7 + 0.3 * ease(clamp01(ts / 0.3))
        const since = ts - SLIDE0 - stagger - SLIDE
        if (since > 0) bounce = Math.exp(-since * 9) * Math.sin(since * 30) * 0.08
      }
      const e = p.step === 0 ? 0 : ex * 0.85
      const off = 1 - k + e
      g.position.set(p.pos[0] + p.from[0] * off, p.pos[1] + p.from[1] * off - bounce, p.pos[2] + p.from[2] * off)
      g.scale.setScalar(pop)
    })

    // --- DOM: click arrow for the current step's first part
    const P = parts[firstOf[step]]
    const arrowOn = ex < 0.5 && step > 0 ? 1 - ex * 2 : 0
    if (P && ui.arrow.current && ui.head.current) {
      const at = tmp.a.set(P.pos[0] + P.anchor[0], P.pos[1] + P.anchor[1], P.pos[2] + P.anchor[2])
      const from = tmp.b.set(at.x + P.from[0] * 0.92, at.y + P.from[1] * 0.92, at.z + P.from[2] * 0.92)
      const to = tmp.c.set(at.x + P.from[0] * 0.2, at.y + P.from[1] * 0.2, at.z + P.from[2] * 0.2)
      m.localToWorld(from)
      m.localToWorld(to)
      const s0 = toScreen(from, tmp.b)
      const s1 = toScreen(to, tmp.c)
      const dx = s1.x - s0.x
      const dy = s1.y - s0.y
      const len = Math.hypot(dx, dy) || 1
      // bow the arrow to the right of its direction, like a hand-drawn manual arrow
      const bx = (s0.x + s1.x) / 2 + (-dy / len) * len * 0.35
      const by = (s0.y + s1.y) / 2 + (dx / len) * len * 0.35
      // draw it on while the part travels
      const grow = POSTER ? 1 : clamp01((ts - 0.05) / 0.45)
      ui.arrow.current.setAttribute('d', `M${s0.x.toFixed(1)} ${s0.y.toFixed(1)} Q${bx.toFixed(1)} ${by.toFixed(1)} ${s1.x.toFixed(1)} ${s1.y.toFixed(1)}`)
      ui.arrow.current.style.strokeDashoffset = String(1 - grow)
      ui.arrow.current.style.opacity = String(arrowOn)
      // arrow head along the curve's end tangent
      const tx = s1.x - bx
      const ty = s1.y - by
      const tl = Math.hypot(tx, ty) || 1
      const ux = tx / tl
      const uy = ty / tl
      const hs = 13
      ui.head.current.setAttribute(
        'd',
        `M${(s1.x + ux * 4).toFixed(1)} ${(s1.y + uy * 4).toFixed(1)} L${(s1.x - ux * hs - uy * hs * 0.62).toFixed(1)} ${(s1.y - uy * hs + ux * hs * 0.62).toFixed(1)} L${(s1.x - ux * hs + uy * hs * 0.62).toFixed(1)} ${(s1.y - uy * hs - ux * hs * 0.62).toFixed(1)} Z`,
      )
      ui.head.current.style.opacity = String(arrowOn * (grow > 0.95 ? 1 : 0))
      if (ui.click.current) {
        const since = ts - CLICK
        const on = POSTER ? 1 : since > 0 ? Math.min(1, since * 6) * (1 - clamp01((since - 2.2) / 0.4)) : 0
        const sc = POSTER ? 1 : since > 0 ? 1 + Math.exp(-since * 7) * Math.sin(since * 22) * 0.25 : 0.6
        const atS = toScreen(m.localToWorld(tmp.d.set(P.pos[0] + P.anchor[0], P.pos[1] + P.anchor[1], P.pos[2] + P.anchor[2])), tmp.d)
        ui.click.current.style.transform = `translate(${(atS.x + 14).toFixed(1)}px, ${(atS.y - 40).toFixed(1)}px) scale(${sc.toFixed(3)})`
        ui.click.current.style.opacity = String(on * arrowOn)
      }
    }

    // --- DOM: exploded-view guides, part letters, dimension line
    parts.forEach((p, i) => {
      const line = ui.guides.current?.[i]
      const tag = ui.tags.current?.[i]
      const vis = p.step <= step && p.step > 0 && ex > 0.02
      if (!line || !tag) return
      if (!vis) {
        line.style.opacity = '0'
        tag.style.opacity = '0'
        return
      }
      const g = refs.current[i]!
      const a = tmp.a.set(p.pos[0] + p.anchor[0], p.pos[1] + p.anchor[1], p.pos[2] + p.anchor[2])
      const b = tmp.b.set(g.position.x + p.anchor[0], g.position.y + p.anchor[1], g.position.z + p.anchor[2])
      const sa = toScreen(m.localToWorld(a), tmp.a)
      const sb = toScreen(m.localToWorld(b), tmp.b)
      line.setAttribute('x1', sa.x.toFixed(1))
      line.setAttribute('y1', sa.y.toFixed(1))
      line.setAttribute('x2', sb.x.toFixed(1))
      line.setAttribute('y2', sb.y.toFixed(1))
      line.style.opacity = String(Math.min(1, ex * 1.5) * 0.9)
      tag.style.transform = `translate(${(sb.x - 11).toFixed(1)}px, ${(sb.y - 11).toFixed(1)}px)`
      tag.style.opacity = String(clamp01((ex - 0.4) * 3))
    })
    if (ui.dim.current && ui.dimLine.current && ui.dimA.current && ui.dimB.current && ui.dimText.current) {
      const a = toScreen(m.localToWorld(tmp.a.set(-3.0, -0.85, 3.1)), tmp.a)
      const b = toScreen(m.localToWorld(tmp.b.set(3.0, -0.85, 3.1)), tmp.b)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const l = Math.hypot(dx, dy) || 1
      const nx = (-dy / l) * 26
      const ny = (dx / l) * 26
      ui.dimLine.current.setAttribute('x1', (a.x + nx).toFixed(1))
      ui.dimLine.current.setAttribute('y1', (a.y + ny).toFixed(1))
      ui.dimLine.current.setAttribute('x2', (b.x + nx).toFixed(1))
      ui.dimLine.current.setAttribute('y2', (b.y + ny).toFixed(1))
      for (const [el, p] of [
        [ui.dimA.current, a],
        [ui.dimB.current, b],
      ] as const) {
        el.setAttribute('x1', (p.x + nx * 0.2).toFixed(1))
        el.setAttribute('y1', (p.y + ny * 0.2).toFixed(1))
        el.setAttribute('x2', (p.x + nx * 1.25).toFixed(1))
        el.setAttribute('y2', (p.y + ny * 1.25).toFixed(1))
      }
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI
      ui.dimText.current.setAttribute('transform', `translate(${((a.x + b.x) / 2 + nx * 1.55).toFixed(1)} ${((a.y + b.y) / 2 + ny * 1.55).toFixed(1)}) rotate(${ang.toFixed(1)})`)
      ui.dim.current.style.opacity = String(clamp01((ex - 0.3) * 2))
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#d5d9e0', 1.6]} />
      <directionalLight position={[-3, 8, 6]} intensity={1.6} />
      <directionalLight position={[6, 2, 3]} intensity={0.6} />
      <group ref={content} visible={ready}>
        <group ref={model} scale={0.62}>
          {parts.map((p, i) => (
            <group
              key={i}
              ref={(g) => {
                refs.current[i] = g
              }}
              position={p.pos}
            >
              {p.meshes.map((d, j) => (
                <mesh key={j} geometry={d.geo} material={mats.get(d.color + (d.glass ? 'g' : ''))} position={d.pos} rotation={d.rot} />
              ))}
            </group>
          ))}
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ part icons (isometric SVG) */

const ISO_C = Math.cos(Math.PI / 6)
const iso = (x: number, y: number, z: number, s: number): [number, number] => [(x - z) * ISO_C * s, (x + z) * 0.5 * s - y * s]
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex)
  c.multiplyScalar(k)
  return `#${c.getHexString()}`
}

function iconFill(color: string, mode: ManualMode, face: 'top' | 'l' | 'r') {
  if (mode === 'flatpack') return face === 'r' ? '#d4d4d2' : '#ffffff'
  if (mode === 'exploded') return face === 'r' ? '#cfdcf0' : '#e8eff9'
  return face === 'r' ? shade(color, 0.72) : face === 'l' ? shade(color, 0.92) : color
}

function IsoBox({ w, h, d, color, mode, studs = true, s = 7 }: { w: number; h: number; d: number; color: string; mode: ManualMode; studs?: boolean; s?: number }) {
  const P = (x: number, y: number, z: number) => iso(x, y, z, s)
  const top = [P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)]
  const right = [P(w, h, 0), P(w, 0, 0), P(w, 0, d), P(w, h, d)]
  const left = [P(0, h, d), P(w, h, d), P(w, 0, d), P(0, 0, d)]
  const stroke = mode === 'exploded' ? '#1d3c74' : '#151517'
  const out: React.ReactNode[] = [
    <polygon key="l" points={pts(left)} fill={iconFill(color, mode, 'l')} />,
    <polygon key="r" points={pts(right)} fill={iconFill(color, mode, 'r')} />,
    <polygon key="t" points={pts(top)} fill={iconFill(color, mode, 'top')} />,
  ]
  if (studs)
    for (let i = 0; i < w; i++)
      for (let j = 0; j < d; j++) {
        const [cx, cy] = P(i + 0.5, h, j + 0.5)
        out.push(
          <g key={`${i}-${j}`}>
            <path d={`M${cx - 0.3 * s * 1.22} ${cy} v${-0.2 * s} a${0.3 * s * 1.22} ${0.3 * s * 0.7} 0 0 0 ${0.6 * s * 1.22} 0 v${0.2 * s} a${0.3 * s * 1.22} ${0.3 * s * 0.7} 0 0 1 ${-0.6 * s * 1.22} 0 z`} fill={iconFill(color, mode, 'r')} />
            <ellipse cx={cx} cy={cy - 0.2 * s} rx={0.3 * s * 1.22} ry={0.3 * s * 0.7} fill={iconFill(color, mode, 'top')} />
          </g>,
        )
      }
  return (
    <g stroke={stroke} strokeWidth={1.2} strokeLinejoin="round">
      {out}
    </g>
  )
}

function PartIcon({ kind, color, mode }: { kind: IconKind; color: string; mode: ManualMode }) {
  const stroke = mode === 'exploded' ? '#1d3c74' : '#151517'
  const f = (face: 'top' | 'l' | 'r') => iconFill(color, mode, face)
  let body: React.ReactNode
  let vb = '-34 -34 68 68'
  switch (kind) {
    case 'plate':
      vb = '-30 -26 64 52'
      body = (
        <g transform="translate(-3 -6)">
          <IsoBox w={6} h={0.4} d={4} color={color} mode={mode} s={5.6} />
        </g>
      )
      break
    case 'brick':
      vb = '-22 -26 44 52'
      body = (
        <g transform="translate(-4 -6)">
          <IsoBox w={2} h={1.2} d={4} color={color} mode={mode} s={7.2} />
        </g>
      )
      break
    case 'seat':
      vb = '-20 -20 40 40'
      body = (
        <g transform="translate(0 -4)">
          <IsoBox w={2} h={0.4} d={2} color={color} mode={mode} s={9} />
        </g>
      )
      break
    case 'round':
      vb = '-18 -20 36 40'
      body = (
        <g stroke={stroke} strokeWidth={1.3}>
          <path d="M-11 -2 v10 a11 6 0 0 0 22 0 v-10" fill={f('r')} />
          <ellipse cx={0} cy={-2} rx={11} ry={6} fill={f('top')} />
          <path d="M-5 -6 v-4 a5 2.8 0 0 0 10 0 v4" fill={f('r')} transform="translate(0 2)" />
          <ellipse cx={0} cy={-8} rx={5} ry={2.8} fill={f('top')} />
        </g>
      )
      break
    case 'wheel':
      body = (
        <g stroke={stroke} strokeWidth={1.3}>
          <ellipse cx={5} cy={3} rx={15} ry={20} fill={mode === 'brick' ? '#18191c' : f('r')} />
          <ellipse cx={0} cy={0} rx={15} ry={20} fill={mode === 'brick' ? '#2c2d31' : f('top')} />
          <ellipse cx={0} cy={0} rx={7.5} ry={10} fill={mode === 'brick' ? C.light : mode === 'flatpack' ? '#eee' : '#f4f8fd'} />
          <ellipse cx={0} cy={0} rx={2.4} ry={3.2} fill={mode === 'brick' ? '#7d838a' : '#ccc'} />
        </g>
      )
      break
    case 'wind':
      vb = '-26 -30 52 60'
      body = (
        <g transform="translate(-2 4)">
          <IsoBox w={1} h={0.4} d={4} color={C.black} mode={mode} studs={false} s={7} />
          <polygon points={pts([iso(0.3, 0.4, 0, 7), iso(0.3, 0.4, 4, 7), iso(-0.4, 2.2, 4, 7), iso(-0.4, 2.2, 0, 7)])} fill={mode === 'brick' ? '#bfe6f8' : f('top')} fillOpacity={0.9} stroke={stroke} strokeWidth={1.2} />
          <line x1={iso(0.2, 1.8, 0.6, 7)[0]} y1={iso(0.2, 1.8, 0.6, 7)[1]} x2={iso(0.2, 1.0, 1.6, 7)[0]} y2={iso(0.2, 1.0, 1.6, 7)[1]} stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </g>
      )
      break
    case 'steer':
      vb = '-20 -22 40 44'
      body = (
        <g stroke={stroke} strokeLinecap="round" fill="none" transform="rotate(-18)">
          <line x1={0} y1={2} x2={9} y2={17} strokeWidth={3.2} />
          <ellipse cx={0} cy={0} rx={7.5} ry={12} strokeWidth={3.4} />
          <path d="M0 0 L-6 -6 M0 0 L6 -6 M0 0 L0 11" strokeWidth={1.6} />
          <circle cx={0} cy={0} r={2.2} fill={stroke} />
        </g>
      )
      break
    case 'fig':
      vb = '-18 -26 36 52'
      body = (
        <g stroke={stroke} strokeWidth={1.2}>
          <path d="M-10 4 L10 4 L12 22 L-12 22 Z" fill={f('top')} />
          <rect x={-6} y={-12} width={12} height={15} rx={4} fill={mode === 'brick' ? C.skin : f('l')} />
          <rect x={-3} y={-16} width={6} height={4} rx={1} fill={mode === 'brick' ? C.skin : f('l')} />
          <circle cx={-2.2} cy={-6} r={0.9} fill={stroke} />
          <circle cx={2.2} cy={-6} r={0.9} fill={stroke} />
          <path d="M-2.6 -2.2 q2.6 2 5.2 0" fill="none" />
        </g>
      )
      break
  }
  return (
    <svg viewBox={vb} width={46} height={46} aria-hidden>
      {body}
    </svg>
  )
}

/* ------------------------------------------------------------------ helper man */

function Helper({ happy, mode }: { happy: boolean; mode: ManualMode }) {
  const ink = mode === 'exploded' ? '#1d3c74' : '#151517'
  return (
    <div className="im-man" aria-hidden>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={happy ? 'ok' : 'think'}
          className="im-bubble"
          initial={{ opacity: 0, scale: 0.6, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: -4 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          <svg viewBox="0 0 44 36" width={44} height={36}>
            <path d="M6 3 H38 a4 4 0 0 1 4 4 V22 a4 4 0 0 1 -4 4 H18 L10 33 L12 26 H6 a4 4 0 0 1 -4 -4 V7 a4 4 0 0 1 4 -4 Z" fill="#fff" stroke={ink} strokeWidth={1.6} strokeLinejoin="round" />
            {happy ? (
              <path d="M14 15 L20 20 L31 9" fill="none" stroke="#25a249" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <text x={22} y={21} textAnchor="middle" fontSize={16} fontWeight={700} fill={ink} fontFamily="var(--sans)">
                ?
              </text>
            )}
          </svg>
        </motion.div>
      </AnimatePresence>
      <motion.svg viewBox="0 0 60 92" width={52} height={80} animate={happy ? { y: [0, -6, 0] } : { y: 0, rotate: [0, -2, 0, 2, 0] }} transition={happy ? { duration: 0.45, ease: 'easeOut' } : { duration: 3, repeat: Infinity }}>
        <g fill="#fff" stroke={ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={30} cy={14} r={10} />
          <path d="M16 36 C16 28 22 25 30 25 C38 25 44 28 44 36 L46 60 C46 64 14 64 14 60 Z" />
          <path d="M22 62 L21 86 M38 62 L39 86" />
          <path d="M17 86 h8 M35 86 h8" />
          {happy ? <path d="M44 36 L54 22" /> : <path d="M44 38 C50 42 50 50 46 54" />}
          <path d="M16 38 C10 44 10 52 14 56" />
          {happy && <circle cx={54} cy={20} r={3} fill={ink} />}
        </g>
      </motion.svg>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

const LETTERS = 'ABCDEFGHIJKLMN'

export default function InstructionManual() {
  const fx = useMemo(() => createManualEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo<StylizeEffect[]>(() => [fx], [fx])
  const [mode, setMode] = useState<ManualMode>('brick')
  const [step, setStep] = useState(POSTER ? LAST : 0)
  const [happy, setHappy] = useState(POSTER)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const stepT = useRef(POSTER ? 0.78 : 0)
  const explode = useMotionValue(0)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())
  const parts = useMemo(makeParts, [])

  const ui: Ui = {
    arrow: useRef<SVGPathElement>(null),
    head: useRef<SVGPathElement>(null),
    click: useRef<HTMLDivElement>(null),
    guides: useRef<(SVGLineElement | null)[]>([]),
    tags: useRef<(HTMLDivElement | null)[]>([]),
    dim: useRef<SVGGElement>(null),
    dimLine: useRef<SVGLineElement>(null),
    dimA: useRef<SVGLineElement>(null),
    dimB: useRef<SVGLineElement>(null),
    dimText: useRef<SVGTextElement>(null),
  }

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const A = areaFor(vp.w, vp.h)
  useEffect(() => setManualPanel(fx, A), [fx, A.x, A.y, A.w, A.h])
  useEffect(() => setManualLineScale(fx, vp.w < 760 ? 0.85 : 1), [fx, vp.w])
  useEffect(() => {
    setManualMode(fx, mode)
    const a = animate(explode, mode === 'exploded' ? 1 : 0, { type: 'spring', stiffness: 70, damping: 15 })
    return () => a.stop()
  }, [fx, mode, explode])

  const go = (n: number) => {
    stepT.current = 0
    setHappy(false)
    setStep(((n % STEPS.length) + STEPS.length) % STEPS.length)
  }
  // the helper is pleased once the part clicks in
  useEffect(() => {
    if (POSTER) return
    const id = window.setTimeout(() => setHappy(true), CLICK * 1000)
    return () => window.clearTimeout(id)
  }, [step])
  // idle: next step every few seconds; the exploded view lingers a little longer
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (splitOpen.current || performance.now() - lastInput.current < 9000) return
      if (stepT.current < (mode === 'exploded' ? 4.6 : 3.6)) return
      go(step + 1)
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mode])

  // drag to turn the model; coasts, then eases home
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const home = useRef<number | undefined>(undefined)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob, .im-parts')) return
    poke()
    anims.current.forEach((a) => a.stop())
    window.clearTimeout(home.current)
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.008, -2.4, 2.4))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.3, 0.45))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.3, timeConstant: 520, min: -2.4, max: 2.4, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.25, timeConstant: 400, min: -0.3, max: 0.45, bounceStiffness: 160, bounceDamping: 18 }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12 }), animate(rx, 0, { type: 'spring', stiffness: 30, damping: 12 })]
    }, 4000)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const S = STEPS[step]
  const label = manualModes.find((m) => m.id === mode)!.label
  const small = vp.w < 760

  return (
    <div className={`stage im im-${mode}${split.open ? ' im-split' : ''}`} style={{ background: manualMeta.background }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas orthographic dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [9, 7.2, 11], zoom: 60, near: 0.1, far: 60 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={manualMeta.background} preload={preload} />
        <Model step={step} stepT={stepT} explode={explode} ry={ry} rx={rx} ui={ui} onReady={() => (stepT.current = POSTER ? 0.78 : 0)} />
      </Canvas>

      {/* the manual page itself (stays in the gallery poster) */}
      <div className="im-page">
        <svg className="im-svg" width={vp.w} height={vp.h} aria-hidden>
          <g className="im-guides">
            {parts.map((_, i) => (
              <line
                key={i}
                ref={(el) => {
                  ui.guides.current[i] = el
                }}
                style={{ opacity: 0 }}
              />
            ))}
          </g>
          <g ref={ui.dim} className="im-dim" style={{ opacity: 0 }}>
            <line ref={ui.dimLine} markerStart="url(#im-tick)" markerEnd="url(#im-tick)" />
            <line ref={ui.dimA} />
            <line ref={ui.dimB} />
            <text ref={ui.dimText} textAnchor="middle" dy={-4}>
              192 mm
            </text>
          </g>
          <defs>
            <marker id="im-tick" viewBox="-6 -6 12 12" markerWidth={10} markerHeight={10} orient="auto-start-reverse">
              <path d="M-5 -3.5 L0 0 L-5 3.5" fill="none" stroke="#1d3c74" strokeWidth={1.4} />
            </marker>
          </defs>
          <path ref={ui.arrow} className="im-arrow" pathLength={1} style={{ opacity: 0 }} />
          <path ref={ui.head} className="im-arrow-head" style={{ opacity: 0 }} />
        </svg>
        {parts.map((_, i) => (
          <div
            key={i}
            className="im-tag"
            ref={(el) => {
              ui.tags.current[i] = el
            }}
            style={{ opacity: 0 }}
          >
            {LETTERS[Math.max(0, Math.min(i - 1, LETTERS.length - 1))]}
          </div>
        ))}
        <div ref={ui.click} className="im-click" style={{ opacity: 0 }}>
          <svg viewBox="-20 -20 40 40" width={30} height={30} aria-hidden>
            {[0, 1, 2, 3, 4].map((k) => {
              const a = -2.4 + k * 0.42
              return <line key={k} x1={Math.cos(a) * 8} y1={Math.sin(a) * 8} x2={Math.cos(a) * 15} y2={Math.sin(a) * 15} />
            })}
          </svg>
          <b>click!</b>
        </div>

        <div className="im-head" style={{ left: A.x + (small ? 14 : 26), top: A.y + (small ? 10 : 16) }}>
          <div className="im-step">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={S.n} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
                {S.n}
              </motion.span>
            </AnimatePresence>
          </div>
          <motion.div className="im-parts" layout transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {S.parts.map((p, i) => (
                <motion.div
                  key={`${S.n}-${i}`}
                  className="im-part"
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 28, delay: i * 0.06 }}
                >
                  <PartIcon kind={p.kind} color={p.color} mode={mode} />
                  <b>{p.count}x</b>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="im-foot" style={{ left: A.x + (small ? 8 : 18), top: A.y + A.h - (small ? 92 : 104) }}>
          <Helper happy={happy} mode={mode} />
          {!small && (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={S.n} className="im-say" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {S.say}
              </motion.p>
            </AnimatePresence>
          )}
        </div>
        <div className="im-pageno" style={{ right: vp.w - A.x - A.w + (small ? 14 : 22), top: A.y + A.h - (small ? 34 : 44) }}>
          <span>{24 + Math.floor(step / 2)}</span>
          <i />
          <em>{STEPS.map((_, i) => <u key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />)}</em>
        </div>
      </div>

      <div className="overlay">
        <div className="hero-copy im-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Instruction Manual
            </p>
            <h1>
              照着图，
              <br />
              咔嗒一声
            </h1>
            <p className="im-sub">拼装说明书的画法：轮廓一样粗、折角的线细一点，每个面只有亮、暗两块平涂色，边上一道白色高光。零件框写着这一步要几个，绿箭头指着装在哪。</p>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <button
            className="seg"
            onClick={() => {
              poke()
              go(step - 1)
            }}
          >
            <span>{small ? '‹' : '上一步'}</span>
          </button>
          <button
            className="seg im-next"
            onClick={() => {
              poke()
              go(step + 1)
            }}
          >
            <span>{small ? '›' : '下一步'}</span>
          </button>
          <span className="dock-sep" />
          <Seg
            items={manualModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(m) => {
              poke()
              setMode(m)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="im-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动模型 · 空闲时自动翻到下一步</p>
      </div>
    </div>
  )
}

const css = `
.im { cursor: grab; touch-action: none; --im-ink: #151517; --im-green: #23a548; }
.im:active { cursor: grabbing; }
.im canvas { display: block; }
.im-exploded { --im-ink: #1d3c74; }
.im-page { position: absolute; inset: 0; pointer-events: none; color: var(--im-ink); }
.im-svg { position: absolute; left: 0; top: 0; overflow: visible; }
.im-arrow { fill: none; stroke: var(--im-green); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 1 1; }
.im-arrow-head { fill: var(--im-green); stroke: var(--im-green); stroke-width: 2; stroke-linejoin: round; }
.im-guides line { stroke: #1d3c74; stroke-width: 1.3; stroke-dasharray: 5 4; }
.im-dim line { stroke: #1d3c74; stroke-width: 1.2; }
.im-dim text { font: 600 12px/1 var(--mono); fill: #1d3c74; letter-spacing: .04em; }
.im-tag {
  position: absolute; left: 0; top: 0; width: 22px; height: 22px; border-radius: 50%;
  display: grid; place-items: center; font: 700 11px/1 var(--mono); color: #1d3c74;
  background: #fbfaf7; border: 1.4px solid #1d3c74;
}
.im-click { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 0; transform-origin: 0 50%; }
.im-click svg line { stroke: var(--im-green); stroke-width: 2.6; stroke-linecap: round; }
.im-click b {
  font: italic 800 22px/1 var(--sans); color: var(--im-green); letter-spacing: -.01em;
  text-shadow: 0 0 0 #fff, 2px 2px 0 #fff, -2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff;
}
.im-head { position: absolute; display: flex; align-items: flex-start; gap: 18px; }
.im-step { position: relative; font: 800 92px/0.9 var(--sans); letter-spacing: -.05em; min-width: 1.2em; height: 84px; overflow: hidden; }
.im-step span { display: block; }
.im-parts {
  display: flex; gap: 10px; padding: 8px 12px 6px; margin-top: 6px; border-radius: 10px;
  background: #ffffff; border: 2px solid #151517; box-shadow: 3px 3px 0 rgba(21,21,23,.12);
}
.im-flatpack .im-parts { border-width: 1.5px; border-radius: 4px; box-shadow: none; }
.im-exploded .im-parts { background: rgba(251,250,247,.9); border: 1.5px dashed #1d3c74; box-shadow: none; }
.im-brick .im-parts { background: #f7fbff; border-color: #151517; }
.im-part { display: flex; flex-direction: column; align-items: center; gap: 0; }
.im-part svg { display: block; }
.im-part b { font: 800 15px/1 var(--sans); margin-top: 2px; }
.im-foot { position: absolute; display: flex; align-items: flex-end; gap: 6px; }
.im-man { position: relative; width: 56px; height: 84px; }
.im-man > svg { position: absolute; left: 0; bottom: 0; }
.im-bubble { position: absolute; left: 34px; top: -30px; transform-origin: 0 100%; }
.im-say { margin: 0 0 10px 30px; font: 600 13px/1.4 var(--sans); color: var(--im-ink); white-space: nowrap; }
.im-pageno { position: absolute; display: flex; align-items: center; gap: 10px; font: 700 15px/1 var(--mono); }
.im-pageno i { width: 1px; height: 14px; background: currentColor; opacity: .35; }
.im-pageno em { display: flex; gap: 3px; }
.im-pageno u { width: 6px; height: 6px; border-radius: 50%; border: 1.3px solid currentColor; opacity: .5; }
.im-pageno u.done { background: currentColor; opacity: .35; }
.im-pageno u.on { background: var(--im-green); border-color: var(--im-green); opacity: 1; }
.im-copy { width: min(360px, calc(100% - 48px)); pointer-events: none !important; }
.im-copy .kicker i { background: #23a548; }
.im-copy h1 { font-size: clamp(36px, 3.8vw, 54px); }
.im-sub { max-width: 330px; }
.im .hint { transition: opacity .4s; }
.im-split .hint { opacity: 0; }
.im-next { font-weight: 600; }
@media (max-width: 760px) {
  .im-copy { transition: opacity .4s; }
  .im-split .im-copy { opacity: 0; }
  .im-sub { display: none; }
  .im-copy h1 { font-size: 32px; }
  .im-step { font-size: 60px; height: 56px; }
  .im-head { gap: 10px; }
  .im-parts { padding: 4px 8px 4px; gap: 4px; }
  .im-part svg { width: 34px; height: 34px; }
  .im-part b { font-size: 13px; }
  .im-click b { font-size: 18px; }
  .im .dock .seg { padding: 0 9px; }
  .im .dock .dock-sep { margin: 0 1px; }
}
`
