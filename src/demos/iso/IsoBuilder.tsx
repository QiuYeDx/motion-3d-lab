import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { DX, DZ, Editor, GRASS, HALF, HOUSE, N, PUFFS, ROAD, TREE, WATER, clock, hash, mulberry, type Kind } from './isoBuilderCore'

/* ------------------------------------------------------------------ palette */
const C = {
  grass: '#b4d69a',
  grass2: '#a8cd8e',
  sand: '#f1e0b6',
  soil: '#e6cda1',
  road: '#a19bab',
  curb: '#f3ece0',
  dash: '#fffaf0',
  water: '#79c5e0',
  trunk: '#a0705a',
  door: '#6b4a45',
  win: '#7d8ca0',
  stone: '#f4ede2',
}
// ring depth (cumulative) — each outer step > 1 unit so the stepped underside stays visible in true iso
const RING = [0.3, 1.95, 3.4, 4.55, 5.35, 5.9]
const ROCK = ['#dcb68e', '#cda07f', '#b98a78', '#a27677', '#8c6878', '#775c76'].map((c) => new THREE.Color(c))
const WALLS = ['#f8f0e0', '#f5dccb', '#e3edf0', '#f6e6bb', '#f3e2e6'].map((c) => new THREE.Color(c))
const ROOFS = ['#d4694f', '#c75a5e', '#6f97ad', '#e39e4c', '#6fa684', '#8a7fb5'].map((c) => new THREE.Color(c))
const LEAVES = ['#7cb87c', '#97c98a', '#88c07e', '#a5cf86'].map((c) => new THREE.Color(c))
const PINES = ['#5f9f78', '#6aa982'].map((c) => new THREE.Color(c))
const COL = {
  grass: new THREE.Color(C.grass),
  grass2: new THREE.Color(C.grass2),
  sand: new THREE.Color(C.sand),
}

const TOOLS: { t: Kind; label: string; color: string; key: string }[] = [
  { t: ROAD, label: '道路', color: '#8f8a9c', key: '1' },
  { t: HOUSE, label: '房屋', color: '#e0765b', key: '2' },
  { t: TREE, label: '树木', color: '#5fae6a', key: '3' },
  { t: WATER, label: '水面', color: '#4fb3d6', key: '4' },
  { t: GRASS, label: '草地', color: '#c3dea4', key: '5' },
]
const PAINTS = new Set<Kind>([ROAD, TREE, WATER, GRASS])

/* ------------------------------------------------------------------ easing */
const springIn = (t: number) => (t <= 0 ? 0 : t > 1.6 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(13 * t))
const shrinkOut = (t: number) => {
  if (t <= 0) return 1
  const p = t / 0.26
  if (p >= 1) return 0
  return 1 - p * p * (2.7 * p - 1.7)
}
const backOut = (p: number, s = 1.6) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}

/* ------------------------------------------------------------------ shared geometry / materials */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 28),
  trunk: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  puff: new THREE.IcosahedronGeometry(0.5, 1),
  prism: (() => {
    const s = new THREE.Shape()
    s.moveTo(-0.5, 0)
    s.lineTo(0.5, 0)
    s.lineTo(0, 1)
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
    g.translate(0, 0, -0.5)
    g.rotateY(Math.PI / 2) // ridge along x, slopes face ±z (the door side)
    return g
  })(),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })

function makeWater() {
  const m = lam(C.water)
  const uTime = { value: 0 }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime
    sh.vertexShader =
      'varying vec3 vIbW;\n' +
      sh.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 ibW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          ibW = instanceMatrix * ibW;
        #endif
        vIbW = (modelMatrix * ibW).xyz;`,
      )
    sh.fragmentShader =
      'uniform float uTime;\nvarying vec3 vIbW;\n' +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float wa = sin(vIbW.x * 5.6 + uTime * 1.2 + sin(vIbW.z * 3.1 + uTime * 0.6) * 1.6);
        float wb = sin(vIbW.z * 6.3 - uTime * 0.9 + sin(vIbW.x * 2.7 - uTime * 0.7) * 1.4);
        float glint = smoothstep(0.6, 0.95, wa * wb);
        diffuseColor.rgb *= 0.95 + 0.06 * wa;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glint * 0.55);`,
      )
  }
  m.customProgramCacheKey = () => 'ib-water'
  return { m, uTime }
}

/* ------------------------------------------------------------------ instanced layers */
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

class Layer {
  im: THREE.InstancedMesh
  n = 0
  max: number
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, o: { cast?: boolean; recv?: boolean; color?: boolean } = {}) {
    this.max = max
    this.im = new THREE.InstancedMesh(geo, mat, max)
    this.im.castShadow = !!o.cast
    this.im.receiveShadow = o.recv !== false
    this.im.frustumCulled = false
    this.im.count = 0
    if (o.color) this.im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3)
  }
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, color?: THREE.Color, rx = 0, rz = 0) {
    if (this.n >= this.max || sx < 1e-4) return
    _e.set(rx, ry, rz)
    _q.setFromEuler(_e)
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))
    this.im.setMatrixAt(this.n, _m)
    if (color) this.im.setColorAt(this.n, color)
    this.n++
  }
  end() {
    this.im.count = this.n
    this.im.instanceMatrix.needsUpdate = true
    if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true
    this.n = 0
  }
}

/* ------------------------------------------------------------------ interaction state shared with the page */
type IO = {
  tool: Kind
  lastUser: number
  hover: number
  onStats: (s: ReturnType<Editor['stats']>) => void
}

const ROAD_W = 0.56
const CURB_W = 0.72
const WATER_W = 0.74

function Scene({ ed, io }: { ed: Editor; io: IO }) {
  const { gl, camera } = useThree()
  const root = useRef<THREE.Group>(null)
  const bob = useRef(0)
  const water = useMemo(makeWater, [])

  const L = useMemo(() => {
    const white = lam('#ffffff')
    const leaf = lam('#ffffff', { flatShading: true })
    return {
      top: new Layer(G.box, white, N * N, { color: true }),
      soil: new Layer(G.box, lam(C.soil), N * N),
      rock: new Layer(G.box, lam('#ffffff'), N * N, { color: true }),
      curbBox: new Layer(G.box, lam(C.curb), 1300),
      curbCyl: new Layer(G.cyl, lam(C.curb), 300),
      roadBox: new Layer(G.box, lam(C.road), 1300),
      roadCyl: new Layer(G.cyl, lam(C.road), 300),
      dash: new Layer(G.box, lam(C.dash), 4000),
      waterBox: new Layer(G.box, water.m, 2600),
      waterCyl: new Layer(G.cyl, water.m, 300),
      wall: new Layer(G.box, lam('#ffffff'), 300, { cast: true, color: true }),
      roof: new Layer(G.prism, lam('#ffffff', { flatShading: true }), 300, { cast: true, color: true }),
      door: new Layer(G.box, lam(C.door), 300),
      win: new Layer(G.box, lam(C.win), 1800),
      chimney: new Layer(G.box, lam(C.stone), 300, { cast: true }),
      trunk: new Layer(G.trunk, lam(C.trunk), 900, { cast: true }),
      crown: new Layer(G.ico, leaf, 900, { cast: true, color: true }),
      pine: new Layer(G.cone, lam('#ffffff', { flatShading: true }), 1800, { cast: true, color: true }),
      puff: new Layer(G.puff, lam('#fbf5e8', { emissive: new THREE.Color('#fff8ea'), emissiveIntensity: 0.35, transparent: true, opacity: 0.88, depthWrite: false }), PUFFS, { recv: false }),
    }
  }, [water])
  useEffect(() => () => Object.values(L).forEach((l) => l.im.dispose()), [L])

  /* static per-column data: rock depth + tone, so the underside reads as a stepped floating rock */
  const cols = useMemo(() => {
    const depth = new Float32Array(N * N)
    const tone: THREE.Color[] = []
    for (let k = 0; k < N * N; k++) {
      const i = k % N
      const j = (k / N) | 0
      const e = Math.min(i, j, N - 1 - i, N - 1 - j)
      depth[k] = RING[e] + hash(k * 1.7) * 0.5 - (e ? 0.2 : 0)
      tone.push(ROCK[Math.min(ROCK.length - 1, e)])
    }
    return { depth, tone }
  }, [])

  /* ---------------- pointer → cell (ray vs ground plane; no per-mesh hit tests) */
  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    let stroke: { last: number; changed: boolean; snap: ReturnType<Editor['snap']> } | null = null

    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      camera.updateMatrixWorld()
      ray.setFromCamera(ndc, camera)
      plane.constant = -bob.current
      if (!ray.ray.intersectPlane(plane, hit)) return -1
      const i = Math.floor(hit.x + N / 2)
      const j = Math.floor(hit.z + N / 2)
      return i >= 0 && i < N && j >= 0 && j < N ? j * N + i : -1
    }
    const paint = (k: number, first: boolean) => {
      if (!stroke) return
      const t = io.tool
      if (ed.set(k, t, Math.random(), clock(), 5, first && t === HOUSE)) stroke.changed = true
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      io.lastUser = clock()
      const k = pick(e)
      io.hover = k
      if (k < 0 || ed.busy(clock())) return
      el.setPointerCapture(e.pointerId)
      stroke = { last: k, changed: false, snap: ed.snap() }
      paint(k, true)
    }
    const move = (e: PointerEvent) => {
      io.lastUser = clock()
      const k = pick(e)
      io.hover = k
      el.style.cursor = k >= 0 ? 'pointer' : ''
      if (!stroke || k < 0 || k === stroke.last || !PAINTS.has(io.tool)) return
      // walk 4-connected from the last cell so painted roads / rivers never skip diagonally
      let i = stroke.last % N
      let j = (stroke.last / N) | 0
      const i1 = k % N
      const j1 = (k / N) | 0
      while (i !== i1 || j !== j1) {
        if (Math.abs(i1 - i) >= Math.abs(j1 - j)) i += Math.sign(i1 - i)
        else j += Math.sign(j1 - j)
        paint(j * N + i, false)
      }
      stroke.last = k
    }
    const up = () => {
      if (stroke?.changed) ed.push(stroke.snap)
      stroke = null
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !stroke) io.hover = -1
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
  }, [gl, camera, ed, io])

  /* ---------------- ghost preview + idle ghost cursor */
  const ghost = useRef<THREE.Group>(null)
  const ghostParts = useRef<(THREE.Group | null)[]>([])
  const ring = useRef<THREE.Mesh>(null)
  const auto = useRef({ plan: null as { t: Kind; cells: number[] } | null, idx: 0, stepAt: 0, nextAt: 0, count: 0, rnd: mulberry(7) })
  const gs = useRef({ x: 0, z: 0, y: 0, vis: 0, k: -1, t: ROAD as Kind })

  const ringTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    g.strokeStyle = '#fff'
    g.lineWidth = 9
    g.beginPath()
    g.roundRect(8, 8, 112, 112, 22)
    g.stroke()
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const ghostMats = useMemo(
    () => TOOLS.map((tl) => lam(tl.color, { transparent: true, opacity: 0.62, depthWrite: false, emissive: new THREE.Color(tl.color), emissiveIntensity: 0.25 })),
    [],
  )
  const gm = (t: Kind) => ghostMats[TOOLS.findIndex((x) => x.t === t)]

  /* ---------------- per-frame: write every instance from the editor state */
  useFrame((state, dtRaw) => {
    const now = clock()
    const dt = Math.min(dtRaw, 1 / 30)
    const time = state.clock.elapsedTime
    water.uTime.value = time
    ed.step(now)

    bob.current = POSTER ? 0 : Math.sin(time * 0.7) * 0.05
    if (root.current) root.current.position.y = bob.current

    // ghost cursor: while nobody is around, someone invisible keeps tinkering
    const a = auto.current
    const idle = !POSTER && now - io.lastUser > (io.lastUser > 0 ? 9 : 3.2)
    if (!idle) {
      a.plan = null
      a.nextAt = now + 1.2
    } else if (!ed.busy(now)) {
      if (!a.plan && now >= a.nextAt) {
        if (a.count >= 9) {
          a.count = 0
          ed.generate(now)
          a.nextAt = now + 3
        } else {
          a.plan = ed.pickAction(a.rnd)
          a.idx = 0
          a.stepAt = now + 0.75
          if (!a.plan) a.nextAt = now + 1
        }
      } else if (a.plan && now >= a.stepAt) {
        const k = a.plan.cells[a.idx++]
        ed.set(k, a.plan.t, a.rnd(), now)
        a.stepAt = now + 0.32
        if (a.idx >= a.plan.cells.length) {
          a.plan = null
          a.count++
          a.nextAt = now + 1.3 + a.rnd() * 0.9
        }
      }
    }
    const g = gs.current
    let gk = -1
    let gt: Kind = io.tool
    if (a.plan && idle) {
      gk = a.plan.cells[Math.min(a.idx, a.plan.cells.length - 1)]
      gt = a.plan.t
    } else if (!idle || io.hover >= 0) gk = io.hover
    if (POSTER) gk = -1
    if (gk >= 0) {
      const tx = (gk % N) - HALF
      const tz = ((gk / N) | 0) - HALF
      if (g.vis < 0.02 || g.t !== gt) {
        g.x = tx
        g.z = tz
      }
      const f = 1 - Math.exp(-dt * 22)
      g.x += (tx - g.x) * f
      g.z += (tz - g.z) * f
      g.k = gk
      g.t = gt
    }
    g.vis += ((gk >= 0 ? 1 : 0) - g.vis) * (1 - Math.exp(-dt * 14))
    if (ghost.current) {
      // nothing to preview where the cell already holds what the tool would place
      ghost.current.visible = g.vis > 0.02 && !(g.k >= 0 && ed.t[g.k] === g.t)
      ghost.current.position.set(g.x, 0.16 + Math.sin(time * 4.2) * 0.045, g.z)
      ghost.current.scale.setScalar(0.6 + 0.4 * g.vis)
      ghost.current.rotation.y = g.t === HOUSE && g.k >= 0 ? (ed.facing(g.k) ?? 0) : 0
      ghostParts.current.forEach((p, n) => p && (p.visible = TOOLS[n].t === g.t))
    }
    if (ring.current) {
      ring.current.visible = g.vis > 0.02
      ring.current.position.set(g.x, 0.07, g.z)
      const rm = ring.current.material as THREE.MeshBasicMaterial
      rm.opacity = g.vis * 0.95
      rm.color.set(g.t === GRASS ? '#ffffff' : TOOLS.find((x) => x.t === g.t)!.color)
    }

    /* columns */
    for (let k = 0; k < N * N; k++) {
      const i = k % N
      const j = (k / N) | 0
      const cx = i - HALF
      const cz = j - HALF
      let cy = 0
      let shown = true
      const tf = now - ed.fallAt[k]
      const tr = now - ed.riseAt[k]
      const falling = tf >= 0 && tr < 0
      if (falling) {
        cy = -0.5 * 20 * tf * tf - tf * 0.6
        shown = cy > -14
      } else if (tr >= 0 && tr < 0.85) {
        cy = -(1 - backOut(tr / 0.85, 1.8)) * 4.5
      }
      const kind = falling ? ed.oT[k] : ed.t[k]
      const topY = kind === WATER ? -0.045 : 0
      if (shown) {
        const tc = kind === WATER ? COL.sand : (i + j) % 2 ? COL.grass : COL.grass2
        L.top.add(cx, cy + topY - 0.06, cz, 0.985, 0.12, 0.985, 0, tc)
        L.soil.add(cx, cy - 0.28, cz, 0.985, 0.32, 0.985)
        const d = cols.depth[k]
        L.rock.add(cx, cy - 0.44 - d / 2, cz, 0.985, d, 0.985, 0, cols.tone[k])
      }
      if (!shown) continue
      // current occupant pops in, the previous one shrinks out
      const sCur = springIn(now - ed.born[k])
      if (ed.t[k] !== GRASS && !falling) drawThing(ed.t[k], ed.v[k], k, cx, cy, cz, sCur, time, dt)
      if (ed.oT[k] !== GRASS && now - ed.died[k] < 0.3) {
        const sOld = falling ? 1 : shrinkOut(now - ed.died[k])
        if (sOld > 0.001) drawThing(ed.oT[k], ed.oV[k], k, cx, cy, cz, sOld, time, dt, true)
      }
    }

    /* dust puffs */
    const p = ed.puffs
    for (let q = 0; q < PUFFS; q++) {
      const age = now - p.born[q]
      if (age < 0 || age > 0.7) continue
      const u = age / 0.7
      const drag = 1 - Math.exp(-age * 5)
      const sc = p.size[q] * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (0.8 + u * 0.6)
      L.puff.add(p.x[q] + (p.vx[q] * drag) / 5, p.y[q] + (p.vy[q] * drag) / 5 + age * 0.1, p.z[q] + (p.vz[q] * drag) / 5, sc, sc, sc)
    }

    for (const l of Object.values(L)) l.end()

    if (ed.dirty) {
      ed.dirty = false
      io.onStats(ed.stats())
    }
  })

  /* ---------------- drawing helpers (closures over the layers) */
  const flat = (l: Layer, cx: number, cy: number, cz: number, s: number, ox: number, oz: number, sx: number, sy: number, yc: number, sz: number) =>
    l.add(cx + ox * s, cy + yc * s, cz + oz * s, sx * s, sy * s, sz * s)

  function blob(lc: Layer, lb: Layer, cx: number, cy: number, cz: number, s: number, m: number, w: number, yc: number, h: number) {
    flat(lc, cx, cy, cz, s, 0, 0, w, h, yc, w)
    for (let d = 0; d < 4; d++) {
      if (!(m & (1 << d))) continue
      flat(lb, cx, cy, cz, s, DX[d] * 0.25, DZ[d] * 0.25, DX[d] ? 0.5 : w, h, yc, DZ[d] ? 0.5 : w)
    }
  }

  const ROT = [Math.PI, Math.PI / 2, 0, -Math.PI / 2]
  function drawThing(t: number, v: number, k: number, cx: number, cy: number, cz: number, s: number, time: number, dt: number, old = false) {
    if (t === ROAD) {
      const m = ed.mask(k, ROAD)
      blob(L.curbCyl, L.curbBox, cx, cy, cz, s, m, CURB_W, 0.012, 0.03)
      blob(L.roadCyl, L.roadBox, cx, cy, cz, s, m, ROAD_W, 0.02, 0.032)
      let n = 0
      for (let d = 0; d < 4; d++) if (m & (1 << d)) n++
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue
        const ax = DX[d]
        const az = DZ[d]
        if (n <= 2) {
          // centre-line dashes, 0.5 apart across tiles
          flat(L.dash, cx, cy, cz, s, ax * 0.25, az * 0.25, ax ? 0.17 : 0.036, 0.008, 0.038, az ? 0.17 : 0.036)
        } else {
          // zebra crossing on every arm of a T / cross junction
          for (let z = -1.5; z <= 1.5; z++) {
            const off = z * 0.12
            flat(L.dash, cx, cy, cz, s, ax * 0.39 + (az ? off : 0), az * 0.39 + (ax ? off : 0), ax ? 0.13 : 0.065, 0.008, 0.038, az ? 0.13 : 0.065)
          }
        }
      }
      return
    }
    if (t === WATER) {
      const m = ed.mask(k, WATER)
      const i = k % N
      const j = (k / N) | 0
      blob(L.waterCyl, L.waterBox, cx, cy, cz, s, m, WATER_W, -0.045, 0.05)
      // fill inner corners where the diagonal is water too → ponds become one sheet
      const e = (1 - WATER_W) / 2
      const o = WATER_W / 2 + e / 2
      if (m & 1 && m & 2 && ed.is(i + 1, j - 1, WATER)) flat(L.waterBox, cx, cy, cz, s, o, -o, e, 0.05, -0.045, e)
      if (m & 2 && m & 4 && ed.is(i + 1, j + 1, WATER)) flat(L.waterBox, cx, cy, cz, s, o, o, e, 0.05, -0.045, e)
      if (m & 4 && m & 8 && ed.is(i - 1, j + 1, WATER)) flat(L.waterBox, cx, cy, cz, s, -o, o, e, 0.05, -0.045, e)
      if (m & 8 && m & 1 && ed.is(i - 1, j - 1, WATER)) flat(L.waterBox, cx, cy, cz, s, -o, -o, e, 0.05, -0.045, e)
      return
    }
    if (t === HOUSE) {
      // ease toward the adjacent road (houses turn when you lay a street next to them)
      let yaw = ed.yaw[k]
      if (!old) {
        const f = ed.facing(k)
        if (f !== null) {
          let dlt = f - yaw
          dlt = Math.atan2(Math.sin(dlt), Math.cos(dlt))
          yaw += dlt * (1 - Math.exp(-dt * 9))
          ed.yaw[k] = yaw
        }
      }
      const floors = hash(v * 977 + 1) < 0.34 ? 2 : 1
      const w = 0.54 + hash(v * 977 + 2) * 0.12
      const d = w * (0.8 + hash(v * 977 + 3) * 0.14)
      const hh = floors === 2 ? 0.66 : 0.4
      const rh = 0.26 + hash(v * 977 + 4) * 0.12
      const wall = WALLS[Math.floor(hash(v * 977 + 5) * WALLS.length)]
      const roof = ROOFS[Math.floor(hash(v * 977 + 6) * ROOFS.length)]
      const co = Math.cos(yaw)
      const si = Math.sin(yaw)
      const part = (l: Layer, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, c?: THREE.Color) =>
        l.add(cx + (lx * co + lz * si) * s, cy + ly * s, cz + (-lx * si + lz * co) * s, sx * s, sy * s, sz * s, yaw, c)
      part(L.wall, 0, hh / 2, 0, w, hh, d, wall)
      part(L.roof, 0, hh, 0, w + 0.1, rh, d + 0.14, roof)
      part(L.chimney, w * 0.26, hh + rh * 0.5, -d * 0.14, 0.08, 0.24, 0.08)
      part(L.door, -w * 0.2, 0.12, d / 2 + 0.008, 0.13, 0.24, 0.02)
      part(L.win, w * 0.2, 0.22, d / 2 + 0.008, 0.13, 0.11, 0.02)
      part(L.win, w / 2 + 0.008, 0.22, 0, 0.02, 0.11, 0.14)
      if (floors === 2) {
        part(L.win, -w * 0.2, 0.5, d / 2 + 0.008, 0.13, 0.11, 0.02)
        part(L.win, w * 0.2, 0.5, d / 2 + 0.008, 0.13, 0.11, 0.02)
        part(L.win, w / 2 + 0.008, 0.5, 0, 0.02, 0.11, 0.14)
      }
      return
    }
    if (t === TREE) {
      const n = 1 + Math.floor(hash(v * 331 + 1) * 2.99)
      const spots = n === 1 ? SPOT1 : n === 2 ? SPOT2 : SPOT3
      const rot = ROT[Math.floor(hash(v * 331 + 9) * 4)]
      const co = Math.cos(rot)
      const sn = Math.sin(rot)
      for (let q = 0; q < n; q++) {
        const lx0 = spots[q][0]
        const lz0 = spots[q][1]
        const lx = lx0 * co + lz0 * sn
        const lz = -lx0 * sn + lz0 * co
        const pine = hash(v * 331 + q * 7 + 3) < 0.34
        const sc = (n === 1 ? 1.12 : 0.86) * (0.85 + hash(v * 331 + q * 5 + 4) * 0.3) * s
        const sway = Math.sin(time * 1.3 + v * 20 + q * 1.7) * 0.04
        const tx = cx + lx * s
        const tz = cz + lz * s
        L.trunk.add(tx, cy + 0.12 * sc, tz, 0.09 * sc, 0.24 * sc, 0.09 * sc)
        if (pine) {
          const c = PINES[Math.floor(hash(v * 331 + q) * PINES.length)]
          L.pine.add(tx - sway * 0.4 * sc, cy + 0.42 * sc, tz, 0.56 * sc, 0.46 * sc, 0.56 * sc, 0, c, 0, sway)
          L.pine.add(tx - sway * 0.65 * sc, cy + 0.67 * sc, tz, 0.4 * sc, 0.38 * sc, 0.4 * sc, 0, c, 0, sway)
        } else {
          const c = LEAVES[Math.floor(hash(v * 331 + q * 3) * LEAVES.length)]
          L.crown.add(tx - sway * 0.45 * sc, cy + 0.47 * sc, tz, 0.56 * sc, 0.6 * sc, 0.56 * sc, hash(v + q) * 3, c, 0, sway)
        }
      }
    }
  }

  return (
    <group ref={root}>
      {Object.entries(L).map(([key, l]) => (
        <primitive key={key} object={l.im} />
      ))}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} visible={false}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial map={ringTex} transparent depthWrite={false} />
      </mesh>
      <group ref={ghost} visible={false}>
        {TOOLS.map((tl, n) => (
          <group key={tl.t} ref={(el) => void (ghostParts.current[n] = el)}>
            {tl.t === ROAD && (
              <>
                <mesh geometry={G.box} material={gm(ROAD)} scale={[0.66, 0.05, 0.66]} renderOrder={6} />
                <mesh geometry={G.box} material={gm(GRASS)} position={[0, 0.03, 0]} scale={[0.04, 0.01, 0.3]} renderOrder={6} />
              </>
            )}
            {tl.t === HOUSE && (
              <>
                <mesh geometry={G.box} material={gm(HOUSE)} position={[0, 0.2, 0]} scale={[0.58, 0.4, 0.5]} renderOrder={6} />
                <mesh geometry={G.prism} material={gm(HOUSE)} position={[0, 0.4, 0]} scale={[0.68, 0.32, 0.64]} renderOrder={6} />
              </>
            )}
            {tl.t === TREE && (
              <>
                <mesh geometry={G.trunk} material={gm(TREE)} position={[0, 0.12, 0]} scale={[0.09, 0.24, 0.09]} renderOrder={6} />
                <mesh geometry={G.ico} material={gm(TREE)} position={[0, 0.47, 0]} scale={[0.56, 0.6, 0.56]} renderOrder={6} />
              </>
            )}
            {tl.t === WATER && <mesh geometry={G.cyl} material={gm(WATER)} scale={[0.8, 0.05, 0.8]} renderOrder={6} />}
            {tl.t === GRASS && <mesh geometry={G.box} material={gm(GRASS)} scale={[0.86, 0.06, 0.86]} renderOrder={6} />}
          </group>
        ))}
      </group>
    </group>
  )
}

const SPOT1 = [[0, 0]]
const SPOT2 = [
  [-0.18, -0.13],
  [0.2, 0.17],
]
const SPOT3 = [
  [-0.2, -0.19],
  [0.23, -0.06],
  [-0.06, 0.22],
]

/* ------------------------------------------------------------------ lights + ambience */
function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff0d8', 1.75)
    l.position.set(5, 11, 3)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -10
    cam.right = cam.top = 10
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.15} color="#fff4e6" />
      <hemisphereLight args={['#ffffff', '#b8cfa0', 0.55]} />
      <primitive object={sun} />
    </>
  )
}

/* ------------------------------------------------------------------ stat pill */
function Stat({ label, value, unit = '' }: { label: string; value: number; unit?: string }) {
  return (
    <span className="ib-stat">
      {label}
      <span className="ib-num">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.b
            key={value}
            initial={{ y: 9, opacity: 0, filter: 'blur(2px)' }}
            animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: -9, opacity: 0, filter: 'blur(2px)' }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          >
            {value}
            {unit}
          </motion.b>
        </AnimatePresence>
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------ page */
export default function IsoBuilder() {
  const ed = useMemo(() => new Editor(), [])
  const [tool, setTool] = useState<Kind>(ROAD)
  const [stats, setStats] = useState(() => ed.stats())
  const io = useMemo<IO>(() => ({ tool: ROAD, lastUser: 0, hover: -1, onStats: () => {} }), [])
  io.onStats = (s) =>
    setStats((p) => (p.road === s.road && p.house === s.house && p.green === s.green && p.undo === s.undo ? p : s))

  const touch = useCallback(() => void (io.lastUser = clock()), [io])
  const pickTool = useCallback(
    (t: Kind) => {
      touch()
      io.tool = t
      setTool(t)
    },
    [io, touch],
  )
  const undo = useCallback(() => {
    touch()
    const now = clock()
    if (ed.busy(now)) return
    ed.restore(now)
  }, [ed, touch])
  const clear = useCallback(() => {
    touch()
    const now = clock()
    if (ed.busy(now)) return
    ed.push(ed.snap())
    ed.clear(now)
  }, [ed, touch])
  const generate = useCallback(() => {
    touch()
    const now = clock()
    if (now < ed.busyUntil && ed.qi >= ed.queue.length) return // mid clear-wave
    ed.push(ed.snap())
    ed.generate(now)
  }, [ed, touch])

  // on load: a town builds itself
  useEffect(() => {
    const id = setTimeout(() => ed.generate(clock(), POSTER ? 20261014 : undefined), POSTER ? 50 : 450)
    return () => clearTimeout(id)
  }, [ed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      const tl = TOOLS.find((x) => x.key === e.key)
      if (tl && !e.ctrlKey && !e.metaKey && !e.altKey) pickTool(tl.t)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, pickTool])

  return (
    <div className="stage ib-root" style={{ background: 'linear-gradient(180deg, #f5f9f1 0%, #e7f1e3 55%, #d4e7d6 100%)' }}>
      <div aria-hidden className={`ib-sun${POSTER ? ' ib-sun-c' : ''}`} />
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={26} mobileFit={18.6} mobileOffsetY={0.125} offset={[0.19, 0]} target={[0, -0.6, 0]} />
        <Lights />
        <Scene ed={ed} io={io} />
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
            <i style={{ background: '#5fae6a' }} /> Isometric · Map editor
          </p>
          <h1>
            搭一座小镇
            <br />
            像搭积木一样
          </h1>
          <p className="ib-desc">选一种地块，在网格上点一下或按住拖动来画。道路会自己接成弯道和路口，水面连成池塘与河流，房子会转身朝向门前的路。</p>
          <div className="ib-stats" aria-live="polite">
            <Stat label="道路" value={stats.road} />
            <i />
            <Stat label="房屋" value={stats.house} />
            <i />
            <Stat label="绿化" value={stats.green} unit="%" />
          </div>
          <div className="hero-actions">
            <button className="btn primary" onClick={generate}>
              随机生成
            </button>
            <button className="btn" onClick={clear}>
              清空
            </button>
          </div>
        </motion.div>

        <div className="dock ib-dock">
          {TOOLS.map((tl) => (
            <button key={tl.t} className="seg" aria-pressed={tool === tl.t} title={`${tl.label}（${tl.key}）${tl.t === GRASS ? ' · 擦除' : ''}`} onClick={() => pickTool(tl.t)}>
              {tool === tl.t && <motion.span layoutId="ib-tool" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="ib-lbl">
                <i style={{ background: tl.color }} className={tl.t === GRASS ? 'ib-erase' : undefined} />
                {tl.label}
              </span>
            </button>
          ))}
          <span className="dock-sep" />
          <button className="seg" disabled={!stats.undo} onClick={undo} title="撤销（Ctrl/⌘ + Z）">
            <span className="ib-lbl">
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M4.5 4.5H9a3 3 0 0 1 0 6H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M6.5 2.5l-2 2 2 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              撤销
            </span>
          </button>
          <button className="seg" onClick={clear}>
            <span>清空</span>
          </button>
          <button className="seg" onClick={generate}>
            <span>随机生成</span>
          </button>
        </div>
        <p className="hint">
          点击或拖动绘制 · 1–5 切换工具
          <br />
          Ctrl / ⌘ + Z 撤销
        </p>
      </div>

      <style>{`
        .ib-root { --soft-bg: #eef5ea; }
        .ib-sun { position: absolute; right: 15%; top: 10%; width: min(32vw, 420px); aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle, #fffbe2 0%, #f8f6d8 42%, transparent 70%); pointer-events: none; }
        .ib-sun-c { right: auto; left: 50%; top: 6%; translate: -50% 0; }
        .ib-root canvas { -webkit-tap-highlight-color: transparent; }
        .ib-stats { display: flex; align-items: center; gap: 12px; margin-top: 22px; font: 500 13px/1 var(--sans); color: var(--fg-2); }
        .ib-stats > i { width: 3px; height: 3px; border-radius: 50%; background: currentColor; opacity: .5; }
        .ib-stat { display: inline-flex; align-items: baseline; gap: 6px; }
        .ib-num { position: relative; display: inline-flex; min-width: 2.2ch; }
        .ib-num b { display: inline-block; font: 600 20px/1 var(--mono); letter-spacing: -0.02em; color: var(--fg); font-variant-numeric: tabular-nums; }
        .ib-lbl { display: inline-flex; align-items: center; gap: 7px; }
        .ib-lbl i { width: 10px; height: 10px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.08); }
        .ib-lbl i.ib-erase { background-image: linear-gradient(135deg, transparent 44%, rgba(29,28,26,.55) 44% 56%, transparent 56%) !important; }
        .ib-dock .seg:disabled { opacity: .38; cursor: default; }
        @media (max-width: 760px) {
          .ib-root .hero-copy .hero-actions { display: none; }
          .ib-root .hero-copy h1 { font-size: 32px; }
          .ib-root .hero-copy .ib-desc { margin-top: 12px; font-size: 14px; line-height: 1.65; }
          .ib-stats { margin-top: 14px; }
          .ib-dock { left: 16px; right: 16px; transform: none; justify-content: flex-start; }
          .ib-sun { top: 8%; right: 4%; width: 52vw; }
        }
      `}</style>
    </div>
  )
}
