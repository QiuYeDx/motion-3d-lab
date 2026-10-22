import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { POSTER } from '../../lib/iso'
import { useScreenWarmup } from '../iso/isoWarmup'
import { DECK, drawBack, drawFelt, drawFront, drawGlowCard, drawRing, drawSoftDot, TEX_H, TEX_W, type FeltSpec } from './cardHandArt'

/* ------------------------------------------------------------------ constants */

const CW = 1
const CH = 1.4
const CT = 0.008
const POOL = 26
const MAX_HAND = 8
const MAX_TABLE = 6
const MAX_DISCARD = 9
const TABLE_S = 1.12 // cards look a touch bigger once they're on the table
const DRAG_Y = 0.9 // height of the dragged card over the felt
const BG = '#06120d'
const IDLE_MS = 5200

type Layout = {
  mobile: boolean
  zone: { x: number; z: number; w: number; d: number }
  deck: { x: number; z: number }
  pile: { x: number; z: number }
  tableW: number
  felt: { tw: number; td: number }
}
function makeLayout(mobile: boolean): Layout {
  return mobile
    ? { mobile, zone: { x: 0, z: -0.9, w: 4.6, d: 2.3 }, deck: { x: 1.55, z: 1.55 }, pile: { x: -1.55, z: 1.55 }, tableW: 3.9, felt: { tw: 24, td: 28 } }
    : { mobile, zone: { x: 0, z: -0.45, w: 6.9, d: 2.25 }, deck: { x: 3.75, z: 1.65 }, pile: { x: -2.35, z: -2.9 }, tableW: 6.4, felt: { tw: 28, td: 22 } }
}

const clamp = THREE.MathUtils.clamp
const lerp = THREE.MathUtils.lerp
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ game model (mutable, read in useFrame) */

type Zone = 'free' | 'hand' | 'table' | 'discard' | 'script'
type Card = {
  i: number
  design: number
  zone: Zone
  p: THREE.Vector3
  v: THREE.Vector3
  r: THREE.Vector3
  w: THREE.Vector3
  s: number
  sv: number
  tp: THREE.Vector3
  tr: THREE.Vector3
  ts: number
  lp: THREE.Vector3 // script target in hand-frame coordinates
  lr: THREE.Vector3
  k: number
  c: number
  delay: number
  landed: boolean
  rest: number // resting yaw on the table
  lift: number
}

type Impact = { age: number; x: number; z: number; str: number; ry: number }

type Game = {
  cards: Card[]
  hand: number[]
  table: number[]
  discard: number[]
  hover: number
  drag: number
  dragU: number
  insert: number
  busy: boolean
  ptr: { x: number; y: number; inside: boolean; touch: boolean }
  ghost: { on: boolean; x: number; y: number; a: number; token: number; drag: boolean }
  lastUser: number
  impacts: Impact[]
  shake: number
  deckKick: number
  deckKickV: number
  snap: boolean
  lastDesigns: number[]
  layout: Layout
  // filled by the scene so DOM code can project points
  project: (x: number, y: number, z: number, out: THREE.Vector2) => void
  handSlotNdc: (id: number, out: THREE.Vector2) => void
  tableSlotNdc: (out: THREE.Vector2) => void
  pick: (x: number, y: number) => number
  emit: () => void
}

function newCard(i: number): Card {
  return {
    i,
    design: 0,
    zone: 'free',
    p: new THREE.Vector3(0, -5, 0),
    v: new THREE.Vector3(),
    r: new THREE.Vector3(),
    w: new THREE.Vector3(),
    s: 1,
    sv: 0,
    tp: new THREE.Vector3(),
    tr: new THREE.Vector3(),
    ts: 1,
    lp: new THREE.Vector3(),
    lr: new THREE.Vector3(),
    k: 190,
    c: 20,
    delay: 0,
    landed: true,
    rest: 0,
    lift: 0,
  }
}

function pickDesign(G: Game) {
  let d = 0
  for (let k = 0; k < 12; k++) {
    d = Math.floor(Math.random() * DECK.length)
    if (!G.lastDesigns.includes(d) && !G.hand.some((id) => G.cards[id].design === d)) break
  }
  G.lastDesigns.push(d)
  if (G.lastDesigns.length > 3) G.lastDesigns.shift()
  return d
}

function freeCard(G: Game) {
  let c = G.cards.find((c) => c.zone === 'free')
  if (!c && G.discard.length) {
    // recycle the bottom of the discard pile (it's covered anyway)
    c = G.cards[G.discard.shift()!]
    c.zone = 'free'
  }
  return c
}

const DECK_H = 0.2
const deckTopY = () => DECK_H + 0.006

/** spawn a card on top of the deck and send it into the hand (flips face-up on the way) */
function draw(G: Game, design?: number, delay = 0) {
  if (G.hand.length >= MAX_HAND) return false
  const c = freeCard(G)
  if (!c) return false
  const { deck } = G.layout
  c.design = design ?? pickDesign(G)
  c.zone = 'hand'
  c.p.set(deck.x, deckTopY(), deck.z)
  c.v.set(-0.8, 5.5, 1.5)
  c.r.set(-Math.PI / 2, Math.PI, 0.06)
  c.w.set(0, 0, 0)
  c.s = TABLE_S
  c.sv = 0
  c.k = 70
  c.c = 12.5
  c.delay = delay
  c.landed = true
  c.lift = 0
  G.hand.push(c.i)
  G.deckKick = 1
  G.emit()
  return true
}

function sendToDiscard(G: Game, id: number, delay = 0) {
  const c = G.cards[id]
  c.zone = 'discard'
  c.k = 95
  c.c = 14
  c.delay = delay
  c.landed = true
  c.rest = (Math.random() - 0.5) * 0.5
  if (delay <= 0) c.v.y += 3.2
  else c.v.y = 3.2
  G.discard.push(id)
  while (G.discard.length > MAX_DISCARD) {
    const old = G.cards[G.discard.shift()!]
    old.zone = 'free'
  }
}

function play(G: Game, id: number) {
  const c = G.cards[id]
  G.hand = G.hand.filter((h) => h !== id)
  if (G.table.length >= MAX_TABLE) sendToDiscard(G, G.table.shift()!)
  c.zone = 'table'
  c.k = 420
  c.c = 30
  c.delay = 0
  c.landed = false
  c.rest = (Math.random() - 0.5) * 0.14
  c.v.y = Math.min(c.v.y, 0) - 3.5
  G.table.push(id)
  G.emit()
}

function clearTable(G: Game) {
  if (!G.table.length) return false
  G.table.forEach((id, j) => sendToDiscard(G, id, j * 0.07))
  G.table = []
  G.emit()
  return true
}

async function shuffle(G: Game) {
  if (G.busy) return
  G.busy = true
  G.hover = -1
  G.emit()
  // top the hand up to at least five cards
  while (G.hand.length < 5) draw(G, undefined, 0)
  const ids = [...G.hand]
  const n = ids.length
  const STACK_Y = 1.3
  const STACK_Z = -1.4
  const dz = 0.022
  // 1 · gather into a face-down stack in front of the hand
  ids.forEach((id, j) => {
    const c = G.cards[id]
    c.zone = 'script'
    c.k = 210
    c.c = 22
    c.delay = j * 0.035
    c.lp.set(0, STACK_Y, STACK_Z + j * dz)
    c.lr.set(0, Math.PI, 0)
  })
  await wait(620)
  // 2 · cut into two halves, tilted towards each other
  const half = Math.ceil(n / 2)
  const L = ids.slice(0, half)
  const R = ids.slice(half)
  L.forEach((id, j) => {
    const c = G.cards[id]
    c.k = 260
    c.c = 24
    c.delay = 0
    c.lp.set(-0.72, STACK_Y - 0.05, STACK_Z + j * dz)
    c.lr.set(0, Math.PI, 0.16)
  })
  R.forEach((id, j) => {
    const c = G.cards[id]
    c.k = 260
    c.c = 24
    c.delay = 0.04
    c.lp.set(0.72, STACK_Y - 0.05, STACK_Z + j * dz)
    c.lr.set(0, Math.PI, -0.16)
  })
  await wait(420)
  // 3 · riffle: alternate from the bottom of each half into the middle (new faces while they're hidden)
  const order: number[] = []
  for (let j = 0; j < Math.max(L.length, R.length); j++) {
    if (L[j] !== undefined) order.push(L[j])
    if (R[j] !== undefined) order.push(R[j])
  }
  order.forEach((id, m) => {
    const c = G.cards[id]
    c.k = 330
    c.c = 26
    c.delay = m * 0.075
    c.lp.set(0, STACK_Y, STACK_Z + m * dz)
    c.lr.set(0, Math.PI, (m % 2 ? -1 : 1) * 0.03)
    c.design = pickDesign(G)
  })
  await wait(order.length * 75 + 260)
  // 4 · square up with a tap
  order.forEach((id, m) => {
    const c = G.cards[id]
    c.delay = 0
    c.lp.set(0, STACK_Y - 0.08, STACK_Z + m * dz)
    c.lr.set(0, Math.PI, 0)
  })
  await wait(170)
  order.forEach((id, m) => G.cards[id].lp.set(0, STACK_Y, STACK_Z + m * dz))
  await wait(220)
  // 5 · deal back into the hand, top of the stack first, each flipping face-up in flight
  G.hand = [...order].reverse()
  G.hand.forEach((id, j) => {
    const c = G.cards[id]
    c.zone = 'hand'
    c.k = 170
    c.c = 19
    c.delay = j * 0.09
  })
  G.emit()
  await wait(G.hand.length * 90 + 450)
  G.busy = false
  G.emit()
}

/* ------------------------------------------------------------------ resources */

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d', { willReadFrequently: true })!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function useResources(layout: Layout) {
  return useMemo(() => {
    const shape = roundedRect(CW, CH, 0.075)
    const face = new THREE.ShapeGeometry(shape, 6)
    const uv = face.attributes.uv as THREE.BufferAttribute
    const pos = face.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / CW + 0.5, pos.getY(i) / CH + 0.5)
    const body = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: false, curveSegments: 6 })
    body.translate(0, 0, -CT / 2)
    const placeholder = canvasTex(4, 4, (g) => {
      g.fillStyle = '#2a2218'
      g.fillRect(0, 0, 4, 4)
    })
    const faceMat = () =>
      new THREE.MeshStandardMaterial({ map: placeholder, emissiveMap: placeholder, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.48, metalness: 0 })
    const fronts = DECK.map(faceMat)
    const back = faceMat()
    const edge = new THREE.MeshStandardMaterial({ color: '#efe3c4', roughness: 0.7 })

    const GW = 160
    const GH = Math.round((GW * (CH + 0.5)) / (CW + 0.5))
    const glowTex = canvasTex(GW, GH, (g) => drawGlowCard(g, GW, GH, (GW * 0.25) / (CW + 0.5), (GH * 0.25) / (CH + 0.5)))
    const glowGeo = new THREE.PlaneGeometry(CW + 0.5, CH + 0.5)
    const glows = Array.from(
      { length: POOL },
      () => new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffc94d', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    )

    // felt
    const spec: FeltSpec = {
      tw: layout.felt.tw,
      td: layout.felt.td,
      zone: layout.zone,
      trays: [
        { ...layout.deck, label: '牌库' },
        { ...layout.pile, label: '弃牌堆' },
      ],
      cardW: CW * TABLE_S,
      cardH: CH * TABLE_S,
    }
    const FW = 2048
    const FH = Math.round((FW * spec.td) / spec.tw)
    const feltTex = canvasTex(FW, FH, (g) => drawFelt(g, FW, FH, spec))
    feltTex.anisotropy = 8
    const felt = new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.95, metalness: 0 })

    // deck sides: stacked card edges
    const edgeTex = canvasTex(256, 64, (g) => {
      g.fillStyle = '#e9dcbc'
      g.fillRect(0, 0, 256, 64)
      for (let y = 0; y < 64; y += 3) {
        g.fillStyle = `rgba(90,70,40,${0.18 + Math.random() * 0.12})`
        g.fillRect(0, y, 256, 1)
      }
    })
    const deckSide = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.8 })

    // fx
    const ringTex = canvasTex(256, 256, (g) => drawRing(g, 256), false)
    const dotTex = canvasTex(64, 64, (g) => drawSoftDot(g, 64), false)
    const ringMats = Array.from({ length: 3 }, () => new THREE.MeshBasicMaterial({ map: ringTex, color: '#ffd77a', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
    const dustMats = Array.from({ length: 3 }, () => new THREE.MeshBasicMaterial({ map: dotTex, color: '#cfe6c4', transparent: true, opacity: 0, depthWrite: false }))
    const flashMats = Array.from({ length: 3 }, () => new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffc94d', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))

    return { face, body, fronts, back, edge, glowGeo, glows, felt, deckSide, ringMats, dustMats, flashMats, dotTex }
  }, [layout])
}
type Res = ReturnType<typeof useResources>

/* ------------------------------------------------------------------ dust particles: one Points cloud, per-point alpha */

const DUST_N = 3 * 36
const DUST_VS = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const DUST_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = texture2D(map, gl_PointCoord).a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`

/* ------------------------------------------------------------------ scene */

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _o = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qi = new THREE.Quaternion()
const _e = new THREE.Euler()
const _n2 = new THREE.Vector2()
const _plane = new THREE.Plane()
const UPY = new THREE.Vector3(0, 1, 0)

type Slot = { x: number; y: number; z: number; rz: number; s: number }

function Scene({ G, res, onReady, ghostEl, stageEl }: { G: Game; res: Res; onReady: () => void; ghostEl: React.RefObject<HTMLDivElement | null>; stageEl: React.RefObject<HTMLDivElement | null> }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const groups = useRef<(THREE.Group | null)[]>([])
  const fronts = useRef<(THREE.Mesh | null)[]>([])
  const bodies = useRef<(THREE.Mesh | null)[]>([])
  const deckRef = useRef<THREE.Group>(null)
  const rings = useRef<(THREE.Mesh | null)[]>([])
  const dusts = useRef<(THREE.Mesh | null)[]>([])
  const flashes = useRef<(THREE.Mesh | null)[]>([])
  const pointsRef = useRef<THREE.Points>(null)
  const ready = useScreenWarmup(() => {
    // paint the faces after the programs are compiled, one per frame
    let k = 0
    const backTex = paint((g) => drawBack(g))
    res.back.map = backTex
    res.back.emissiveMap = backTex
    const step = () => {
      if (k >= DECK.length) {
        onReady()
        return
      }
      const t = paint((g) => drawFront(g, DECK[k]))
      res.fronts[k].map = t
      res.fronts[k].emissiveMap = t
      k++
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  function paint(fn: (g: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas')
    c.width = TEX_W
    c.height = TEX_H
    fn(c.getContext('2d', { willReadFrequently: true })!)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    gl.initTexture(t)
    return t
  }

  const st = useMemo(
    () => ({
      handC: new THREE.Vector3(),
      qH: new THREE.Quaternion(),
      rxH: -0.9,
      ray: new THREE.Raycaster(),
      slots: Array.from({ length: MAX_HAND + 1 }, () => ({ x: 0, y: 0, z: 0, rz: 0, s: 1 }) as Slot),
      order: [] as number[],
      camBase: new THREE.Vector3(),
      look: new THREE.Vector3(),
      dust: {
        pos: new Float32Array(DUST_N * 3),
        vel: new Float32Array(DUST_N * 3),
        alpha: new Float32Array(DUST_N),
        size: new Float32Array(DUST_N),
        life: new Float32Array(DUST_N),
        next: 0,
      },
      dustMat: new THREE.ShaderMaterial({
        uniforms: { map: { value: res.dotTex }, uColor: { value: new THREE.Color('#fff0c4') } },
        vertexShader: DUST_VS,
        fragmentShader: DUST_FS,
        transparent: true,
        depthWrite: false,
      }),
      cursor: '',
      hy: -0.7,
      dH: 8.6,
    }),
    [res],
  )

  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(st.dust.pos, 3))
    g.setAttribute('aAlpha', new THREE.BufferAttribute(st.dust.alpha, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(st.dust.size, 1))
    return g
  }, [st])

  /* ---- fan slot j of n (hand-frame coordinates) */
  const fan = (j: number, n: number, h: number, o: Slot) => {
    const mobile = G.layout.mobile
    const da = Math.min(mobile ? 0.052 : 0.074, (mobile ? 0.3 : 0.44) / Math.max(1, n - 1))
    const R = mobile ? 6.5 : 9
    let a = (j - (n - 1) / 2) * da
    if (h >= 0 && j !== h) {
      const dj = Math.abs(j - h)
      a += Math.sign(j - h) * da * (dj === 1 ? 0.62 : dj === 2 ? 0.34 : 0.18)
    }
    o.x = R * Math.sin(a)
    o.y = R * (Math.cos(a) - 1)
    o.z = j * 0.022
    o.rz = -a
    o.s = 1
    if (j === h) {
      o.y += mobile ? 0.55 : 0.68
      o.z += 0.45
      o.rz = 0
      o.s = mobile ? 1.18 : 1.22
    }
  }

  const toWorld = (sl: { x: number; y: number; z: number }, out: THREE.Vector3) => out.set(sl.x, sl.y, sl.z).applyQuaternion(st.qH).add(st.handC)

  /** ray ↔ card rectangle test in the card's local frame */
  const hitCard = (pos: THREE.Vector3, rx: number, rz: number, s: number, extraDown: number) => {
    _e.set(rx, 0, rz)
    _q.setFromEuler(_e)
    _qi.copy(_q).invert()
    _o.copy(st.ray.ray.origin).sub(pos).applyQuaternion(_qi)
    _d.copy(st.ray.ray.direction).applyQuaternion(_qi)
    if (Math.abs(_d.z) < 1e-5) return false
    const t = -_o.z / _d.z
    if (t < 0) return false
    const x = _o.x + _d.x * t
    const y = _o.y + _d.y * t
    return Math.abs(x) <= (CW / 2) * s && y <= (CH / 2) * s && y >= -(CH / 2) * s - extraDown
  }

  /** which hand card is under the current ray (the raised card keeps it while the pointer is on it or below it) */
  const handHit = () => {
    const n = G.hand.length
    if (G.hover >= 0) {
      const j = G.hand.indexOf(G.hover)
      if (j >= 0) {
        fan(j, n, j, st.slots[0])
        toWorld(st.slots[0], _v2)
        if (hitCard(_v2, st.rxH, st.slots[0].rz, st.slots[0].s, 1.2)) return G.hover
      }
    }
    for (let j = n - 1; j >= 0; j--) {
      if (G.cards[G.hand[j]].zone !== 'hand') continue
      fan(j, n, -1, st.slots[0])
      toWorld(st.slots[0], _v2)
      if (hitCard(_v2, st.rxH, st.slots[0].rz, 1, 0.6)) return G.hand[j]
    }
    return -1
  }

  // expose projection helpers for the ghost hand
  useEffect(() => {
    G.project = (x, y, z, out) => {
      _v.set(x, y, z).project(camera)
      out.set(_v.x, _v.y)
    }
    G.handSlotNdc = (id, out) => {
      const j = G.hand.indexOf(id)
      const sl = st.slots[0]
      fan(j, G.hand.length, -1, sl)
      toWorld(sl, _v2)
      G.project(_v2.x, _v2.y, _v2.z, out)
    }
    G.pick = (x, y) => {
      _n2.set(x, y)
      st.ray.setFromCamera(_n2, camera)
      return handHit()
    }
    G.tableSlotNdc = (out) => {
      const n = Math.min(G.table.length + 1, MAX_TABLE)
      const sp = Math.min(1.3, G.layout.tableW / n)
      G.project((n - 1 - (n - 1) / 2) * sp + G.layout.zone.x, DRAG_Y, G.layout.zone.z, out)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G, camera, st])

  const triggerImpact = (x: number, z: number, str: number, ry: number) => {
    const imp = G.impacts.find((i) => i.age > 1.2) ?? G.impacts[0]
    imp.age = 0
    imp.x = x
    imp.z = z
    imp.str = str
    imp.ry = ry
    G.shake = Math.max(G.shake, 0.5 * str)
    // dust puff from the card's outline
    const D = st.dust
    for (let k = 0; k < 36; k++) {
      const i = D.next
      D.next = (D.next + 1) % DUST_N
      const a = (k / 36) * Math.PI * 2 + Math.random() * 0.2
      const ex = Math.cos(a) * 0.62 * TABLE_S
      const ez = Math.sin(a) * 0.82 * TABLE_S
      D.pos[i * 3] = x + ex
      D.pos[i * 3 + 1] = 0.03
      D.pos[i * 3 + 2] = z + ez
      const sp = (0.9 + Math.random() * 1.6) * str
      D.vel[i * 3] = Math.cos(a) * sp
      D.vel[i * 3 + 1] = (0.4 + Math.random() * 0.9) * str
      D.vel[i * 3 + 2] = Math.sin(a) * sp
      D.life[i] = 1
      D.size[i] = 0.35 + Math.random() * 0.55
    }
    // neighbours on the table hop
    for (const id of G.table) {
      const c = G.cards[id]
      if (!c.landed) continue
      const dist = Math.hypot(c.p.x - x, c.p.z - z)
      if (dist < 0.05 || dist > 2.6) continue
      const f = (1 - dist / 2.6) * str
      c.v.y += 1.5 * f
      c.w.z += (Math.random() - 0.5) * 2 * f
      c.w.y += (Math.random() - 0.5) * 1.5 * f
    }
  }

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const { width, height } = state.size
    const warm = ready.current
    const aspect = width / height
    const mobile = G.layout.mobile

    /* ---- camera */
    const fitK = mobile ? Math.max(1, 0.8 / aspect) : Math.max(1, 1.55 / aspect)
    st.camBase.set(0, 10.4, 8.6).multiplyScalar(fitK)
    st.look.set(0, 0, mobile ? 0.4 : 0.55)
    G.shake = Math.max(0, G.shake - dt * 3.2)
    const sh = G.shake * G.shake * 0.06
    const tt = state.clock.elapsedTime
    camera.position.set(st.camBase.x + Math.sin(tt * 61) * sh, st.camBase.y + Math.sin(tt * 47 + 1) * sh, st.camBase.z + Math.cos(tt * 53) * sh)
    camera.lookAt(st.look)
    const ox = mobile || POSTER ? 0 : 0.13
    const oy = POSTER ? 0.02 : mobile ? 0.1 : 0.0
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    /* ---- hand frame: a plane hung in front of the camera, low on screen, leaning back a little */
    st.hy = mobile ? -0.5 : -0.6
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    // fit the hand's width on narrow screens
    st.dH = mobile ? Math.max(9.6, 3.4 / (2 * tanH * aspect)) : 9.6
    // centre the hand under the (offset) table, not under the canvas centre
    _v.set(ox * 2, st.hy, 0.5).unproject(camera).sub(camera.position).normalize()
    st.handC.copy(camera.position).addScaledVector(_v, st.dH)
    const pitch = Math.atan2(camera.position.y - st.look.y, camera.position.z - st.look.z)
    st.rxH = -pitch + 0.06
    _e.set(st.rxH, 0, 0)
    st.qH.setFromEuler(_e)

    // until every program is compiled keep the pool's first card / fx visible so the warm-up covers them
    if (!warm) return

    /* ---- pointer ray */
    const usingGhost = G.ghost.on
    const px = usingGhost ? G.ghost.x : G.ptr.x
    const py = usingGhost ? G.ghost.y : G.ptr.y
    _n2.set(px, py)
    st.ray.setFromCamera(_n2, camera)

    /* ---- drag target / hover */
    let dragP: THREE.Vector3 | null = null
    if (G.drag >= 0) {
      // 0 while the pointer is over the hand → 1 once it is up over the table
      const u = smooth(st.hy + 0.36, st.hy + 0.78, py)
      G.dragU = u
      _plane.setFromNormalAndCoplanarPoint(_v.set(0, 0, 1).applyQuaternion(st.qH), _v2.copy(st.handC).addScaledVector(_v, 0.5))
      const a = st.ray.ray.intersectPlane(_plane, _o) ? _o.clone() : st.handC.clone()
      _plane.set(UPY, -DRAG_Y)
      const b = st.ray.ray.intersectPlane(_plane, _d) ?? a
      dragP = a.lerp(b, u)
      // where would it slot in if dropped back into the hand?
      const n = G.hand.length
      if (u < 0.5) {
        const lx = _o.copy(a).sub(st.handC).applyQuaternion(_qi.copy(st.qH).invert()).x
        let best = 0
        let bd = 1e9
        for (let j = 0; j < n; j++) {
          fan(j, n, -1, st.slots[0])
          const dd = Math.abs(st.slots[0].x - lx)
          if (dd < bd) {
            bd = dd
            best = j
          }
        }
        G.insert = best
      } else G.insert = -1
    } else if (!POSTER && !G.busy && (G.ptr.inside || usingGhost) && !G.ptr.touch) {
      const hit = handHit()
      if (!usingGhost) G.hover = hit
    } else if (!POSTER && !usingGhost && G.drag < 0) G.hover = G.ptr.touch ? G.hover : -1

    // cursor
    const cur = G.drag >= 0 && !usingGhost ? 'grabbing' : G.hover >= 0 && !usingGhost ? 'grab' : ''
    if (cur !== st.cursor && stageEl.current) {
      st.cursor = cur
      stageEl.current.style.cursor = cur
    }

    /* ---- targets: hand */
    const order = st.order
    order.length = 0
    for (const id of G.hand) if (id !== G.drag) order.push(id)
    if (G.drag >= 0 && G.insert >= 0) order.splice(Math.min(G.insert, order.length), 0, -1)
    const n = order.length
    const hj = G.drag < 0 ? order.indexOf(G.hover) : -1
    for (let j = 0; j < n; j++) {
      const id = order[j]
      if (id < 0) continue
      const c = G.cards[id]
      if (c.zone !== 'hand') continue
      const sl = st.slots[j]
      fan(j, n, hj, sl)
      toWorld(sl, c.tp)
      c.tr.set(st.rxH, 0, sl.rz)
      c.ts = sl.s
      // settle every hand card on the same spring once it is (nearly) home: drags come in stiff, draws come in soft
      if (c.delay <= 0 && c.k !== 190 && c.p.distanceToSquared(c.tp) < 0.09) {
        c.k = 190
        c.c = 20
      }
    }
    /* ---- targets: table row */
    const tn = G.table.length
    const sp = Math.min(1.3, G.layout.tableW / Math.max(1, tn))
    G.table.forEach((id, j) => {
      const c = G.cards[id]
      c.tp.set((j - (tn - 1) / 2) * sp + G.layout.zone.x, CT / 2 + 0.002 + j * 0.0015, G.layout.zone.z)
      c.tr.set(-Math.PI / 2, 0, c.rest)
      c.ts = TABLE_S
    })
    /* ---- targets: discard pile */
    G.discard.forEach((id, j) => {
      const c = G.cards[id]
      c.tp.set(G.layout.pile.x, CT / 2 + 0.002 + j * 0.006, G.layout.pile.z)
      c.tr.set(-Math.PI / 2, 0, c.rest)
      c.ts = TABLE_S
    })
    /* ---- targets: dragged card */
    if (G.drag >= 0 && dragP) {
      const c = G.cards[G.drag]
      const u = G.dragU
      c.tp.copy(dragP)
      // lean into the motion: bank with sideways speed, pitch with forward speed
      const vx = clamp(c.v.x, -9, 9)
      const vz = clamp(c.v.z + c.v.y * 0.5, -9, 9)
      c.tr.set(lerp(st.rxH, -Math.PI / 2, u) + vz * 0.035, -vx * 0.055, -vx * 0.02)
      c.ts = lerp(1.16, TABLE_S * 1.08, u)
      c.k = 700
      c.c = 48
    }

    /* ---- integrate */
    const H = dt / 4
    for (const c of G.cards) {
      const g = groups.current[c.i]
      if (!g) continue
      if (c.zone === 'free') {
        g.visible = false
        continue
      }
      g.visible = true
      if (c.zone === 'script') {
        toWorld(c.lp, c.tp)
        c.tr.set(st.rxH + c.lr.x, c.lr.y, c.lr.z)
        c.ts = 1
      }
      if (G.snap) {
        c.p.copy(c.tp)
        c.r.copy(c.tr)
        c.s = c.ts
        c.v.set(0, 0, 0)
        c.w.set(0, 0, 0)
        c.landed = true
      }
      if (c.delay > 0) {
        c.delay -= dt
      } else {
        const k = c.k
        const cc = c.c
        for (let s = 0; s < 4; s++) {
          c.v.x += (k * (c.tp.x - c.p.x) - cc * c.v.x) * H
          c.v.y += (k * (c.tp.y - c.p.y) - cc * c.v.y) * H
          c.v.z += (k * (c.tp.z - c.p.z) - cc * c.v.z) * H
          c.p.addScaledVector(c.v, H)
          const kr = k * 0.85
          c.w.x += (kr * (c.tr.x - c.r.x) - cc * c.w.x) * H
          c.w.y += (kr * (c.tr.y - c.r.y) - cc * c.w.y) * H
          c.w.z += (kr * (c.tr.z - c.r.z) - cc * c.w.z) * H
          c.r.addScaledVector(c.w, H)
          c.sv += (260 * (c.ts - c.s) - 24 * c.sv) * H
          c.s += c.sv * H
        }
        // the felt is solid: slam, tiny bounce, no tunnelling
        if (c.zone === 'table' || c.zone === 'discard') {
          if (c.p.y < c.tp.y) {
            if (!c.landed && c.zone === 'table') {
              c.landed = true
              triggerImpact(c.p.x, c.p.z, clamp(-c.v.y / 4.5, 0.55, 1.3), c.r.z)
              c.k = 230
              c.c = 24
            }
            c.p.y = c.tp.y
            if (c.v.y < 0) c.v.y *= -0.12
          }
        }
      }
      g.position.copy(c.p)
      g.rotation.set(c.r.x, c.r.y, c.r.z)
      g.scale.setScalar(Math.max(0.01, c.s))
      // halo for the raised / dragged card
      const want = (c.i === G.hover && c.zone === 'hand' && G.drag < 0) || c.i === G.drag ? 1 : 0
      c.lift = THREE.MathUtils.damp(c.lift, want, 12, dt)
      res.glows[c.i].opacity = c.lift * 0.8
      // only cards near the felt cast shadows (the hand hovers far above it)
      const b = bodies.current[c.i]
      if (b) b.castShadow = (c.zone !== 'hand' && c.zone !== 'script') || c.i === G.drag
      const f = fronts.current[c.i]
      if (f && f.material !== res.fronts[c.design]) f.material = res.fronts[c.design]
    }
    G.snap = false

    /* ---- deck pile: nudge when a card leaves it */
    const dk = deckRef.current
    if (dk) {
      if (G.deckKick > 0) {
        G.deckKickV += G.deckKick * 6
        G.deckKick = 0
      }
      const kk = dk.userData.k ?? 0
      G.deckKickV += (-260 * kk - 14 * G.deckKickV) * dt
      dk.userData.k = kk + G.deckKickV * dt
      dk.rotation.y = 0.08 + dk.userData.k * 0.05
      dk.position.y = Math.max(0, dk.userData.k) * 0.01
    }

    /* ---- impacts */
    for (let i = 0; i < G.impacts.length; i++) {
      const imp = G.impacts[i]
      imp.age += dt
      const r = rings.current[i]
      const du = dusts.current[i]
      const fl = flashes.current[i]
      if (!r || !du || !fl) continue
      const a = imp.age
      const on = a < 1.2
      r.visible = du.visible = fl.visible = on
      if (!on) continue
      const e = 1 - Math.pow(1 - Math.min(1, a / 0.55), 3)
      r.position.set(imp.x, 0.012, imp.z)
      r.scale.setScalar((2.0 + e * 3.4) * imp.str)
      res.ringMats[i].opacity = Math.pow(Math.max(0, 1 - a / 0.7), 1.5) * 1.2
      du.position.set(imp.x, 0.01, imp.z)
      du.scale.setScalar((2.2 + e * 2.6) * imp.str)
      res.dustMats[i].opacity = Math.max(0, 1 - a / 0.9) * 0.2
      fl.position.set(imp.x, 0.004, imp.z)
      fl.rotation.set(-Math.PI / 2, 0, imp.ry)
      fl.scale.setScalar(TABLE_S * (1 + e * 0.18))
      res.flashMats[i].opacity = Math.pow(Math.max(0, 1 - a / 0.8), 2) * 0.95
    }
    const D = st.dust
    for (let i = 0; i < DUST_N; i++) {
      if (D.life[i] <= 0) {
        D.alpha[i] = 0
        continue
      }
      D.life[i] -= dt * 1.25
      const k = i * 3
      D.vel[k + 1] -= 2.2 * dt
      const drag = Math.exp(-dt * 3.2)
      D.vel[k] *= drag
      D.vel[k + 2] *= drag
      D.pos[k] += D.vel[k] * dt
      D.pos[k + 1] = Math.max(0.02, D.pos[k + 1] + D.vel[k + 1] * dt)
      D.pos[k + 2] += D.vel[k + 2] * dt
      D.alpha[i] = Math.pow(Math.max(0, D.life[i]), 1.5) * 0.8
    }
    const pg = pointsRef.current?.geometry
    if (pg) {
      pg.attributes.position.needsUpdate = true
      pg.attributes.aAlpha.needsUpdate = true
      pg.attributes.aSize.needsUpdate = true
    }

    /* ---- ghost cursor (DOM) */
    const ge = ghostEl.current
    if (ge) {
      G.ghost.a = THREE.MathUtils.damp(G.ghost.a, G.ghost.on ? 1 : 0, 10, dt)
      const gx = (G.ghost.x * 0.5 + 0.5) * width
      const gy = (-G.ghost.y * 0.5 + 0.5) * height
      ge.style.opacity = G.ghost.a.toFixed(3)
      ge.style.transform = `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px) scale(${G.ghost.drag ? 0.86 : 1})`
    }
  })

  const noRay = () => null
  const { deck, pile } = G.layout
  void pile

  return (
    <>
      {/* felt */}
      <mesh rotation-x={-Math.PI / 2} material={res.felt} receiveShadow raycast={noRay}>
        <planeGeometry args={[G.layout.felt.tw, G.layout.felt.td]} />
      </mesh>
      {/* deck pile */}
      <group position={[deck.x, 0, deck.z]}>
        <group ref={deckRef} rotation-y={0.08}>
          <mesh position-y={DECK_H / 2} castShadow receiveShadow material={[res.deckSide, res.deckSide, res.back, res.edge, res.deckSide, res.deckSide]}>
            <boxGeometry args={[CW * TABLE_S, DECK_H, CH * TABLE_S]} />
          </mesh>
        </group>
      </group>
      {/* cards */}
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} visible={i === 0}>
          <mesh ref={(m) => void (bodies.current[i] = m)} geometry={res.body} material={res.edge} castShadow raycast={noRay} />
          <mesh ref={(m) => void (fronts.current[i] = m)} geometry={res.face} material={res.fronts[0]} position-z={CT / 2 + 0.0012} raycast={noRay} />
          <mesh geometry={res.face} material={res.back} position-z={-CT / 2 - 0.0012} rotation-y={Math.PI} raycast={noRay} />
          <mesh geometry={res.glowGeo} material={res.glows[i]} position-z={-0.012} raycast={noRay} renderOrder={-1} />
        </group>
      ))}
      {/* slam fx */}
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <mesh ref={(m) => void (flashes.current[i] = m)} geometry={res.glowGeo} material={res.flashMats[i]} visible={i === 0} raycast={noRay} />
          <mesh ref={(m) => void (dusts.current[i] = m)} rotation-x={-Math.PI / 2} material={res.dustMats[i]} visible={i === 0} raycast={noRay}>
            <planeGeometry args={[1, 1]} />
          </mesh>
          <mesh ref={(m) => void (rings.current[i] = m)} rotation-x={-Math.PI / 2} material={res.ringMats[i]} visible={i === 0} raycast={noRay}>
            <planeGeometry args={[1, 1]} />
          </mesh>
        </group>
      ))}
      <points ref={pointsRef} geometry={dustGeo} material={st.dustMat} frustumCulled={false} raycast={noRay} />
    </>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffe6bf', '#0b2018', 0.55]} />
      <spotLight
        position={[0.4, 9.5, 2.2]}
        angle={0.62}
        penumbra={0.8}
        intensity={190}
        decay={2}
        color="#ffe8c2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={4}
        shadow-camera-near={2}
        shadow-camera-far={20}
      />
      {/* frontal fill so the hand (which faces the camera) reads */}
      <directionalLight position={[0, 6, 12]} intensity={0.7} color="#fff3dd" />
    </>
  )
}

function SpotTarget() {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.SpotLight).isSpotLight) {
        const l = o as THREE.SpotLight
        l.target.position.set(0.2, 0, -0.2)
        l.target.updateMatrixWorld()
      }
    })
  }, [scene])
  return null
}

/* ------------------------------------------------------------------ page */

export default function CardHand() {
  const layout = useMemo(() => makeLayout(typeof window !== 'undefined' && window.innerWidth < 760), [])
  const res = useResources(layout)
  const [ui, setUi] = useState({ hand: 0, table: 0, busy: false })
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const stageEl = useRef<HTMLDivElement>(null)
  const ghostEl = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)

  const G = useMemo<Game>(() => {
    const g: Game = {
      cards: Array.from({ length: POOL }, (_, i) => newCard(i)),
      hand: [],
      table: [],
      discard: [],
      hover: -1,
      drag: -1,
      dragU: 0,
      insert: -1,
      busy: false,
      ptr: { x: 0, y: -2, inside: false, touch: false },
      ghost: { on: false, x: 0.4, y: -0.4, a: 0, token: 0, drag: false },
      lastUser: performance.now(),
      impacts: Array.from({ length: 3 }, () => ({ age: 9, x: 0, z: 0, str: 1, ry: 0 })),
      shake: 0,
      deckKick: 0,
      deckKickV: 0,
      snap: false,
      lastDesigns: [],
      layout,
      project: () => {},
      handSlotNdc: () => {},
      tableSlotNdc: () => {},
      pick: () => -1,
      emit: () => {},
    }
    return g
  }, [layout])
  G.emit = () => setUi((u) => (u.hand === G.hand.length && u.table === G.table.length && u.busy === G.busy ? u : { hand: G.hand.length, table: G.table.length, busy: G.busy }))

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = (text: string) => {
    setToast({ id: performance.now(), text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1900)
  }

  const cancelGhost = () => {
    G.ghost.token++
    if (G.ghost.on && G.ghost.drag && G.drag >= 0) {
      // the ghost was mid-drag: put its card back
      G.drag = -1
    }
    G.ghost.on = false
    G.ghost.drag = false
  }
  const user = () => {
    G.lastUser = performance.now()
    if (G.ghost.on) cancelGhost()
  }

  /* ---- dock actions */
  const doDraw = () => {
    user()
    if (G.busy) return
    if (G.hand.length >= MAX_HAND) {
      say(`手牌已满（${MAX_HAND}/${MAX_HAND}）· 先打出一张`)
      G.deckKick = 1.6
      return
    }
    draw(G)
  }
  const doShuffle = () => {
    user()
    if (G.busy) return
    void shuffle(G)
  }
  const doDiscard = () => {
    user()
    if (G.busy) return
    if (!clearTable(G)) say('桌面上还没有牌')
  }

  const onReady = () => {
    readyRef.current = true
    if (POSTER) {
      ;[2, 0, 7, 4, 9, 5].forEach((d) => draw(G, d))
      for (const d of [3, 8, 6]) {
        const c = freeCard(G)!
        c.design = d
        c.zone = 'table'
        c.rest = (Math.random() - 0.5) * 0.1
        G.table.push(c.i)
      }
      for (const d of [1, 4]) {
        const c = freeCard(G)!
        c.design = d
        c.zone = 'discard'
        c.rest = (Math.random() - 0.5) * 0.4
        G.discard.push(c.i)
      }
      G.hover = G.hand[2]
      G.ghost.on = false
      G.snap = true
      G.emit()
      return
    }
    // deal an opening hand, then let the ghost start soon after
    for (let k = 0; k < 5; k++) setTimeout(() => draw(G), 250 + k * 170)
    G.lastUser = performance.now() - IDLE_MS + 2600
  }

  /* ---- pointer */
  useEffect(() => {
    if (POSTER) return
    const el = stageEl.current!
    const canvas = () => el.querySelector('canvas')
    const setPtr = (e: PointerEvent) => {
      const c = canvas()
      if (!c) return
      const r = c.getBoundingClientRect()
      G.ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1
      G.ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1
      G.ptr.touch = e.pointerType === 'touch'
    }
    let pid = -1
    const move = (e: PointerEvent) => {
      setPtr(e)
      // only hover cards when the pointer is actually over the canvas (not the dock / copy)
      G.ptr.inside = (e.target as HTMLElement).tagName === 'CANVAS'
      if (pid !== -1 || e.pointerType === 'mouse') {
        if (G.ghost.on && (pid !== -1 || Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) user()
        if (pid !== -1) G.lastUser = performance.now()
      }
    }
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).tagName !== 'CANVAS' || (e.pointerType === 'mouse' && e.button !== 0)) return
      setPtr(e)
      G.ptr.inside = true
      user()
      if (G.busy) return
      // resolve the card under the pointer right now (touch has no hover; the mouse may not have moved yet)
      const id = G.pick(G.ptr.x, G.ptr.y)
      if (id < 0) return
      G.hover = id
      G.drag = id
      pid = e.pointerId
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return
      pid = -1
      const id = G.drag
      G.drag = -1
      if (id < 0) return
      G.lastUser = performance.now()
      if (G.dragU > 0.5) {
        play(G, id)
      } else if (G.insert >= 0) {
        // dropped back into the hand: reorder
        const rest = G.hand.filter((h) => h !== id)
        rest.splice(Math.min(G.insert, rest.length), 0, id)
        G.hand = rest
        G.cards[id].k = 190
        G.cards[id].c = 20
      }
      G.insert = -1
      if (e.pointerType !== 'mouse') G.hover = -1
    }
    const leave = () => {
      G.ptr.inside = false
    }
    window.addEventListener('pointermove', move)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    document.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G])

  /* ---- ghost player: plays a card, draws a new one, clears the table when it fills up */
  useEffect(() => {
    if (POSTER) return
    const gx = motionValue(0.4)
    const gy = motionValue(-0.4)
    const unsub = [gx.on('change', (v) => (G.ghost.x = v)), gy.on('change', (v) => (G.ghost.y = v))]
    const glide = (x: number, y: number, duration: number, token: number) =>
      new Promise<boolean>((resolve) => {
        if (token !== G.ghost.token) return resolve(false)
        let done = 0
        const fin = () => ++done === 2 && resolve(token === G.ghost.token)
        animate(gx, x, { duration, ease: [0.45, 0, 0.2, 1] }).then(fin)
        animate(gy, y, { duration, ease: [0.3, 0, 0.25, 1] }).then(fin)
      })
    const n2 = new THREE.Vector2()
    let running = false
    const turn = async () => {
      running = true
      const token = ++G.ghost.token
      const alive = () => token === G.ghost.token
      try {
        if (G.table.length >= 5) {
          clearTable(G)
          await wait(900)
          return
        }
        if (G.hand.length <= 3) {
          draw(G)
          await wait(500)
          if (alive()) draw(G)
          await wait(700)
          return
        }
        const id = G.hand[Math.floor(Math.random() * G.hand.length)]
        G.handSlotNdc(id, n2)
        // enter from below-right of the card
        gx.jump(n2.x + 0.22)
        gy.jump(n2.y - 0.32)
        G.ghost.x = gx.get()
        G.ghost.y = gy.get()
        G.ghost.on = true
        if (!(await glide(n2.x, n2.y + 0.02, 0.55, token))) return
        G.hover = id
        await wait(420)
        if (!alive() || !G.hand.includes(id)) return
        G.ghost.drag = true
        G.drag = id
        G.hover = -1
        G.tableSlotNdc(n2)
        if (!(await glide(n2.x, n2.y, 0.8, token))) return
        await wait(90)
        if (!alive()) return
        G.drag = -1
        G.ghost.drag = false
        play(G, id)
        await wait(260)
        G.ghost.on = false
        await wait(700)
        if (alive()) draw(G)
      } finally {
        if (token === G.ghost.token) {
          G.ghost.on = false
          G.ghost.drag = false
        }
        running = false
      }
    }
    let last = 0
    const id = setInterval(() => {
      const now = performance.now()
      if (!readyRef.current || running || G.busy || G.drag >= 0 || now - G.lastUser < IDLE_MS || now - last < 3600 || document.hidden) return
      last = now
      void turn()
    }, 250)
    return () => {
      clearInterval(id)
      unsub.forEach((u) => u())
      G.ghost.token++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [G])

  useEffect(() => {
    if (POSTER) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') doDraw()
      else if (e.key === 's' || e.key === 'S') doShuffle()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const full = ui.hand >= MAX_HAND

  return (
    <div className="stage ch-stage" ref={stageEl}>
      <style>{`
        .ch-stage { background: ${BG}; touch-action: none; }
        .ch-stage canvas { touch-action: none; }
        .ch-stage .scrim { --soft-bg: #071610; }
        .ch-stage .hero-copy h1 em { background: linear-gradient(90deg, #f6dc95, #d6a843); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .ch-stage .hero-copy .kicker i { background: #e8c46a; }
        .ch-stage .hero-copy { top: 72px; bottom: auto; height: calc(100% - 72px - 300px); justify-content: center; }
        .ch-stage .dock { --fg: #f6ecd2; }
        .ch-btn { display: inline-flex; align-items: center; gap: 7px; }
        .ch-btn svg { display: block; opacity: .85; }
        .ch-btn[disabled] { opacity: .45; cursor: default; }
        .ch-count { display: inline-flex; align-items: baseline; gap: 4px; padding: 0 12px 0 6px; font: 500 12px/1 var(--mono); color: var(--fg-2); white-space: nowrap; }
        .ch-count b { display: inline-block; min-width: 9px; text-align: right; font: 600 14px/1 var(--mono); color: #f1d27d; }
        .ch-count.full b { color: #ff8a6a; }
        .ch-toast { position: absolute; left: 50%; bottom: 82px; padding: 9px 16px; border-radius: 999px; background: rgba(28,22,10,.82); box-shadow: inset 0 0 0 1px rgba(232,196,106,.35), 0 10px 30px -10px rgba(0,0,0,.6); color: #f6e3ae; font: 500 13px/1 var(--sans); white-space: nowrap; pointer-events: none !important; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .ch-ghost { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none !important; opacity: 0; will-change: transform, opacity; z-index: 3; }
        .ch-ghost i { position: absolute; left: -15px; top: -15px; width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(circle, rgba(255,231,160,.55) 0 30%, rgba(255,231,160,.12) 31% 100%); box-shadow: 0 0 0 1.5px rgba(255,231,160,.85), 0 0 24px rgba(255,214,120,.55); }
        .ch-ghost span { position: absolute; left: 20px; top: 14px; padding: 4px 8px; border-radius: 6px; background: rgba(20,16,8,.7); color: #f6e3ae; font: 500 11px/1 var(--sans); white-space: nowrap; }
        .ch-stage .hint { top: 84px; bottom: auto; color: rgba(246,236,210,.5); }
        @media (max-width: 760px) {
          .ch-stage .hero-copy { height: auto; top: 72px; bottom: auto; justify-content: flex-start; }
          .ch-stage .hero-copy h1 { font-size: 26px; }
          .ch-stage .hero-copy .kicker { margin-bottom: 10px; }
          .ch-stage .hero-copy > p:not(.kicker) { display: none; }
          .ch-stage .scrim { display: none; }
          .ch-stage .dock { bottom: 16px; }
          .ch-toast { bottom: 70px; }
          .ch-count { padding-right: 8px; }
        }
      `}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 34, near: 0.1, far: 120, position: [0, 10, 8] }} gl={{ antialias: true, alpha: false }} onCreated={({ gl }) => void (gl.toneMapping = THREE.ACESFilmicToneMapping)}>
        <color attach="background" args={[BG]} />
        <Lights />
        <SpotTarget />
        <Scene G={G} res={res} onReady={onReady} ghostEl={ghostEl} stageEl={stageEl} />
      </Canvas>

      <div className="overlay">
        <div className="ch-ghost" ref={ghostEl}>
          <i />
          <span>自动演示</span>
        </div>
        <motion.div className="hero-copy" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <div className="scrim" />
          <p className="kicker">
            <i /> Card hand · Springs
          </p>
          <h1>
            一手好牌，
            <br />
            <em>啪地拍上桌</em>
          </h1>
          <p>悬停一张牌，它会抬起、放大、摆正，两边的牌让开位置。把它拖上桌面松手——重重拍下；没拖够高就弹回原位，在手里左右拖还能换顺序。</p>
        </motion.div>

        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className="ch-toast"
              initial={{ opacity: 0, y: 8, x: '-50%', scale: 0.96 }}
              animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: -6, x: '-50%', scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            >
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="dock">
          <button className="seg ch-btn" onClick={doDraw} disabled={ui.busy} aria-disabled={full}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="3" y="1.5" width="8" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7 5v4M5 7h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>抽一张</span>
          </button>
          <button className="seg ch-btn" onClick={doShuffle} disabled={ui.busy}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M1.5 4h2.2c2.6 0 4 6 6.6 6h2.2M1.5 10h2.2c1.1 0 1.9-1 2.6-2.2M8.6 6.2C9.2 5 10 4 11.1 4h1.4M11 2.4 12.6 4 11 5.6M11 8.4l1.6 1.6L11 11.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>洗牌</span>
          </button>
          <button className="seg ch-btn" onClick={doDiscard} disabled={ui.busy}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path d="M2.5 4h9M5.5 4V2.6h3V4M3.8 4l.6 7.6h5.2l.6-7.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>弃牌</span>
          </button>
          <span className="dock-sep" />
          <span className={`ch-count${full ? ' full' : ''}`}>
            手牌
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={ui.hand} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 32 }}>
                {ui.hand}
              </motion.b>
            </AnimatePresence>
            /{MAX_HAND}
          </span>
        </div>
        <p className="hint">拖牌到桌面出牌 · 手里左右拖换位置 · D 抽牌 / S 洗牌</p>
      </div>
    </div>
  )
}
