import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { ALGOS, WATER_COST, generate, search, summarize, type Algo, type Grid, type Summary, type Trace } from './pathMazeCore'

/* ------------------------------------------------------------------ constants */
const MOBILE0 = typeof window !== 'undefined' && window.innerWidth < 760
const N = MOBILE0 ? 15 : 19
const N2 = N * N
const HALF = (N - 1) / 2
const WALL_H = 0.46
const POSTER_SEED = 20261015

type Phase = 'build' | 'search' | 'path' | 'walk' | 'arrive' | 'live'
type Speed = 'slow' | 'mid' | 'fast'
const RATE: Record<Speed, number> = { slow: 12, mid: 30, fast: 80 } // expansions per second
const PACE: Record<Speed, number> = { slow: 0.7, mid: 1, fast: 1.7 }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const backOut = (p: number, s = 1.7) => {
  const q = p - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
const smooth = (v: number) => v * v * (3 - 2 * v)
const cx = (i: number) => (i % N) - HALF
const cz = (i: number) => ((i / N) | 0) - HALF
const border = (i: number) => {
  const x = i % N
  const y = (i / N) | 0
  return x === 0 || y === 0 || x === N - 1 || y === N - 1
}

/* ------------------------------------------------------------------ palette */
const COL = {
  floorA: new THREE.Color('#fbfaff'),
  floorB: new THREE.Color('#f2f0fb'),
  water: new THREE.Color('#9fd4f2'),
  water2: new THREE.Color('#bfe4f7'),
  vis0: new THREE.Color('#ddd6ff'),
  vis1: new THREE.Color('#bdb1ff'),
  flash: new THREE.Color('#ffffff'),
  frontFloor: new THREE.Color('#ffe7bd'),
  front: new THREE.Color('#ffb547'),
  path: new THREE.Color('#6b5cff'),
  path2: new THREE.Color('#a79dff'),
  hover: new THREE.Color('#ffffff'),
}
const WALL_PAL = ['#b2a8ff', '#f0a6d2', '#ffb39c', '#ffd68c', '#a6e0bf', '#98c4ff'].map((c) => new THREE.Color(c))
const CONFETTI = ['#6b5cff', '#ffb547', '#ff7a8a', '#5cc8a8', '#58a6ff'].map((c) => new THREE.Color(c))

/* ------------------------------------------------------------------ shared GPU resources */
const GEO = {
  floor: new RoundedBoxGeometry(0.95, 0.16, 0.95, 2, 0.05),
  wall: new RoundedBoxGeometry(0.97, 1, 0.97, 2, 0.1),
  glow: new RoundedBoxGeometry(0.76, 0.04, 0.76, 1, 0.018),
  trail: new THREE.BoxGeometry(1, 0.04, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
  ball: new THREE.SphereGeometry(1, 16, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const MAT = {
  floor: lam('#ffffff'),
  wall: lam('#ffffff'),
  glow: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  trail: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  confetti: new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
  slab: lam('#fdfcff'),
  slab2: lam('#ddd8f5'),
  slab3: lam('#c9c2ee'),
  body: lam('#6b5cff'),
  skin: lam('#ffe1cc'),
  hat: lam('#f3b64a'),
  pack: lam('#ff8a63'),
  leg: lam('#3e3a5c'),
  eye: lam('#2a2740'),
  pole: lam('#6c6884'),
  flag: lam('#ff6b6b', { side: THREE.DoubleSide }),
  stone: lam('#f2eefc'),
  pad: new THREE.MeshBasicMaterial({ color: '#6b5cff', transparent: true, opacity: 0.9, depthWrite: false }),
  padGoal: new THREE.MeshBasicMaterial({ color: '#ff8a4c', transparent: true, opacity: 0.9, depthWrite: false }),
  ring: new THREE.MeshBasicMaterial({ color: '#6b5cff', transparent: true, opacity: 0, depthWrite: false }),
  hover: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }),
  proxy: new THREE.MeshBasicMaterial({ visible: false }),
}

/* ------------------------------------------------------------------ simulation (plain object, no React state per frame) */
class Sim {
  grid!: Grid
  trace!: Trace
  all = {} as Record<Algo, Summary>
  algo: Algo = 'astar'
  speed: Speed = 'mid'
  phase: Phase = 'build'
  now = 0
  k = -1
  pathP = 0
  walkS = 0
  lastEdit = -10
  lastTouch = -100
  userAlgo = false
  arriveAt = -100
  buildEnd = 0
  hover = -1
  drag: null | 'start' | 'goal' | 'add' | 'erase' = null
  version = 0
  hA = new Float32Array(N2)
  hB = new Float32Array(N2)
  ts = new Float32Array(N2)
  tr = new Float32Array(N2)
  onAuto?: (a: Algo) => void
  private algoIdx = 0

  height(i: number, t = this.now) {
    const ps = clamp01((t - this.ts[i]) / 0.3)
    const pr = clamp01((t - this.tr[i]) / 0.5)
    return Math.max(this.hA[i] * (1 - ps * ps), this.hB[i] * (pr <= 0 ? 0 : backOut(pr)))
  }

  newMaze(seed = (Math.random() * 1e9) | 0) {
    const first = !this.grid
    const T = this.now
    this.grid = generate(N, seed)
    const lag = first ? 0.05 : 0.45
    for (let i = 0; i < N2; i++) {
      const d = ((i % N) + ((i / N) | 0)) / (2 * (N - 1))
      this.hA[i] = first ? 0 : this.height(i, T)
      this.ts[i] = T + d * 0.4
      this.hB[i] = this.grid.wall[i]
      this.tr[i] = T + lag + d * 0.95
    }
    this.buildEnd = T + lag + 0.95 + 0.35
    this.phase = 'build'
    this.k = -1
    this.pathP = 0
    this.walkS = 0
    this.replan()
  }

  replan() {
    this.trace = search(this.grid, this.algo)
    for (const a of ALGOS) this.all[a.value] = a.value === this.algo ? summarize(this.trace) : summarize(search(this.grid, a.value))
    this.version++
  }

  restartSearch() {
    this.replan()
    if (this.phase === 'build') return
    this.phase = 'search'
    this.k = 0
    this.pathP = 0
    this.walkS = 0
  }

  /** after an edit: show the finished search immediately, then walk again once the user pauses */
  live() {
    this.replan()
    if (this.phase === 'build') return
    this.phase = 'live'
    this.k = this.trace.steps
    this.pathP = this.trace.path.length
    this.walkS = 0
    this.lastEdit = this.now
  }

  editable(i: number) {
    return i >= 0 && !border(i) && i !== this.grid.start && i !== this.grid.goal
  }

  setWall(i: number, on: boolean) {
    if (!this.editable(i)) return false
    const w = this.grid.wall
    if (!!w[i] === on) return false
    this.hA[i] = this.height(i)
    this.ts[i] = this.now
    this.hB[i] = on ? 1 : 0
    this.tr[i] = this.now
    w[i] = on ? 1 : 0
    return true
  }

  moveMarker(which: 'start' | 'goal', i: number) {
    const g = this.grid
    if (i < 0 || border(i) || g.wall[i] || i === g.start || i === g.goal) return false
    if (which === 'start') g.start = i
    else g.goal = i
    return true
  }

  touch() {
    this.lastTouch = this.now
  }

  tick(dt: number) {
    this.now += dt
    if (POSTER) return
    const tr = this.trace
    const pace = PACE[this.speed]
    switch (this.phase) {
      case 'build':
        if (this.now >= this.buildEnd) {
          this.phase = 'search'
          this.k = 0
        }
        break
      case 'search':
        this.k += dt * RATE[this.speed]
        if (this.k >= tr.steps) {
          this.k = tr.steps
          if (tr.found) {
            this.phase = 'path'
            this.pathP = 0
          } else {
            this.phase = 'arrive'
            this.arriveAt = this.now
          }
        }
        break
      case 'path':
        this.pathP += dt * 26 * pace
        if (this.pathP >= tr.path.length) {
          this.pathP = tr.path.length
          this.phase = 'walk'
          this.walkS = 0
        }
        break
      case 'walk':
        this.walkS += dt * 3.3 * pace
        if (this.walkS >= tr.path.length - 1) {
          this.walkS = Math.max(0, tr.path.length - 1)
          this.phase = 'arrive'
          this.arriveAt = this.now
        }
        break
      case 'arrive':
        if (this.now - this.arriveAt > 3.6 && this.now - this.lastTouch > 9 && !this.drag) {
          if (!this.userAlgo) {
            this.algoIdx = (this.algoIdx + 1) % ALGOS.length
            this.algo = ALGOS[this.algoIdx].value
            this.onAuto?.(this.algo)
          }
          this.newMaze()
        }
        break
      case 'live':
        if (this.now - this.lastEdit > 0.9 && !this.drag) {
          if (tr.found) {
            this.phase = 'walk'
            this.walkS = 0
          } else {
            this.phase = 'arrive'
            this.arriveAt = this.now
          }
        }
        break
    }
  }
}

function makeSim() {
  const s = new Sim()
  const q = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('seed')) : 0
  s.newMaze(POSTER ? POSTER_SEED : q || undefined)
  if (POSTER) {
    // finished A* search with the explorer half-way down the trail
    s.now = 10
    for (let i = 0; i < N2; i++) {
      s.hA[i] = 0
      s.tr[i] = 0
    }
    s.k = s.trace.steps
    s.pathP = s.trace.path.length
    s.phase = 'walk'
    s.walkS = Math.floor((s.trace.path.length - 1) * 0.42)
  }
  return s
}

/* ------------------------------------------------------------------ helpers */
function useCompiled(ref: RefObject<THREE.Object3D | null>) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    let dead = false
    gl.compileAsync(g, camera, scene)
      .catch(() => {})
      .then(() => {
        if (!dead) setReady(true)
      })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ready
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _c = new THREE.Color()
const _c2 = new THREE.Color()
const _e = new THREE.Euler()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

function put(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  _p.set(x, y, z)
  _s.set(sx, sy, sz)
  if (ry) _q.setFromEuler(_e.set(0, ry, 0))
  else _q.identity()
  _m.compose(_p, _q, _s)
  mesh.setMatrixAt(i, _m)
}

/* ------------------------------------------------------------------ board */
function Board() {
  const S = N + 1.1
  return (
    <group>
      <mesh geometry={GEO.box} material={MAT.slab} position={[0, -0.24, 0]} scale={[S, 0.3, S]} receiveShadow />
      <mesh material={MAT.slab2} position={[0, -0.72, 0]} receiveShadow>
        <boxGeometry args={[S - 0.3, 0.66, S - 0.3]} />
      </mesh>
      <mesh material={MAT.slab3} position={[0, -1.3, 0]}>
        <boxGeometry args={[S - 1.4, 0.5, S - 1.4]} />
      </mesh>
    </group>
  )
}

/** little floating cubes around the platform */
function Floaters() {
  const ref = useRef<THREE.Group>(null)
  const items = useMemo(
    () => [
      { p: [-HALF - 3.2, -1.6, HALF - 2], s: 0.7, c: WALL_PAL[0] },
      { p: [HALF + 2.6, -2.4, -HALF + 3], s: 0.5, c: WALL_PAL[2] },
      { p: [HALF - 1, -2.9, HALF + 3.4], s: 0.85, c: WALL_PAL[3] },
      { p: [-HALF + 2, -2.2, -HALF - 3], s: 0.45, c: WALL_PAL[1] },
      { p: [HALF + 3.6, -0.6, HALF - 4], s: 0.35, c: WALL_PAL[4] },
    ],
    [],
  )
  const mats = useMemo(() => items.map((it) => lam('#' + it.c.getHexString())), [items])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const t = performance.now() / 1000
    g.children.forEach((c, k) => {
      c.position.y = items[k].p[1] + Math.sin(t * 0.7 + k * 1.7) * 0.18
      c.rotation.y = t * 0.15 + k
    })
  })
  return (
    <group ref={ref}>
      {items.map((it, k) => (
        <mesh key={k} material={mats[k]} position={it.p as [number, number, number]} scale={it.s}>
          <primitive object={GEO.wall} attach="geometry" />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ floor + frontier glow + walls */
function Cells({ sim, floorRef, wallRef }: { sim: Sim; floorRef: RefObject<THREE.InstancedMesh | null>; wallRef: RefObject<THREE.InstancedMesh | null> }) {
  const glow = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const f = floorRef.current!
    const w = wallRef.current!
    const g = glow.current!
    for (let i = 0; i < N2; i++) {
      put(f, i, cx(i), -0.08, cz(i), 1, 1, 1)
      f.setColorAt(i, COL.floorA)
      w.setMatrixAt(i, ZERO)
      w.setColorAt(i, WALL_PAL[0])
      g.setMatrixAt(i, ZERO)
      g.setColorAt(i, COL.front)
    }
  }, [floorRef, wallRef])

  useFrame(() => {
    const f = floorRef.current
    const w = wallRef.current
    const g = glow.current
    if (!f || !w || !g) return
    const t = sim.now
    const tr = sim.trace
    const k = sim.phase === 'build' ? -1 : sim.k
    const steps = Math.max(1, tr.steps)
    const { wall, cost } = sim.grid
    for (let i = 0; i < N2; i++) {
      const x = cx(i)
      const z = cz(i)
      const water = cost[i] > 1
      let y = water ? -0.115 : -0.08
      if (water) _c.copy(COL.water).lerp(COL.water2, 0.5 + 0.5 * Math.sin(t * 2.2 + x * 0.9 + z * 0.6))
      else _c.copy((x + z) & 1 ? COL.floorB : COL.floorA)
      const ca = tr.closedAt[i]
      const oa = tr.openAt[i]
      let gs = 0
      if (ca > 0 && ca <= k) {
        const flash = clamp01(1 - (k - ca) / 7)
        _c2.copy(COL.vis0).lerp(COL.vis1, ca / steps)
        _c.lerp(_c2, water ? 0.55 : 1)
        _c.lerp(COL.flash, flash * 0.55)
        y += flash * 0.07
        // the glow tile shrinks away as the cell closes
        const q = clamp01((k - ca) / 2.2)
        gs = k >= steps ? 0 : 1 - smooth(q)
      } else if (oa >= 0 && oa <= k) {
        _c.lerp(COL.frontFloor, 0.8)
        y += 0.03
        const p = clamp01((k - oa) / 1.6)
        gs = Math.max(0.001, backOut(p, 2.2))
      }
      if (i === sim.hover && !wall[i] && sim.editable(i)) _c.lerp(COL.hover, 0.5)
      put(f, i, x, y, z, 1, 1, 1)
      f.setColorAt(i, _c)

      if (gs > 0.01) {
        put(g, i, x, y + 0.1, z, gs, 1, gs)
        _c.copy(COL.front)
        g.setColorAt(i, _c)
      } else g.setMatrixAt(i, ZERO)

      const h = sim.height(i, t)
      if (h < 0.003) w.setMatrixAt(i, ZERO)
      else {
        const sx = 0.82 + 0.18 * Math.min(1, h)
        put(w, i, x, (h * WALL_H) / 2, z, sx, h * WALL_H, sx)
        const d = ((i % N) + ((i / N) | 0)) / (2 * (N - 1))
        const u = d * (WALL_PAL.length - 1)
        const a = Math.min(WALL_PAL.length - 2, Math.floor(u))
        _c.copy(WALL_PAL[a]).lerp(WALL_PAL[a + 1], u - a)
        if (i === sim.hover && sim.editable(i)) _c.lerp(COL.hover, 0.45)
        w.setColorAt(i, _c)
      }
    }
    f.instanceMatrix.needsUpdate = true
    w.instanceMatrix.needsUpdate = true
    g.instanceMatrix.needsUpdate = true
    if (f.instanceColor) f.instanceColor.needsUpdate = true
    if (w.instanceColor) w.instanceColor.needsUpdate = true
    if (g.instanceColor) g.instanceColor.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={floorRef} args={[GEO.floor, MAT.floor, N2]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={glow} args={[GEO.glow, MAT.glow, N2]} frustumCulled={false} />
      <instancedMesh ref={wallRef} args={[GEO.wall, MAT.wall, N2]} castShadow receiveShadow frustumCulled={false} />
    </>
  )
}

/* ------------------------------------------------------------------ glowing trail along the final path */
function Trail({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const MAX = N2 * 2
  useLayoutEffect(() => {
    const m = ref.current!
    for (let i = 0; i < MAX; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, COL.path)
    }
  }, [MAX])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const path = sim.trace.path
    const show = sim.phase === 'path' || sim.phase === 'walk' || sim.phase === 'arrive' || sim.phase === 'live'
    const P = show ? sim.pathP : 0
    const t = sim.now
    let n = 0
    for (let i = 0; i < path.length && i < P + 1; i++) {
      const a = path[i]
      const ax = cx(a)
      const az = cz(a)
      const lit = clamp01(P - i)
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.55)
      _c.copy(COL.path).lerp(COL.path2, pulse * 0.6)
      if (lit > 0) {
        const s = 0.42 * backOut(clamp01(lit * 1.6), 2)
        put(m, n, ax, 0.05, az, s, 1, s)
        m.setColorAt(n++, _c)
      }
      if (i > 0) {
        const b = path[i - 1]
        const bx = cx(b)
        const bz = cz(b)
        const len = clamp01(P - (i - 1))
        if (len > 0) {
          const dx = ax - bx
          const dz = az - bz
          put(m, n, bx + (dx * len) / 2, 0.045, bz + (dz * len) / 2, dx ? Math.abs(dx) * len : 0.2, 1, dz ? Math.abs(dz) * len : 0.2)
          m.setColorAt(n++, _c)
        }
      }
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[GEO.trail, MAT.trail, MAX]} frustumCulled={false} />
}

/* ------------------------------------------------------------------ explorer, markers, confetti */
function Explorer({ sim, proxy }: { sim: Sim; proxy: RefObject<THREE.Mesh | null> }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Mesh>(null)
  const legR = useRef<THREE.Mesh>(null)
  const pad = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const st = useRef({ yaw: Math.PI / 4, x: 0, z: 0 })
  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    dt = Math.min(dt, 1 / 30)
    const path = sim.trace.path
    const start = sim.grid.start
    let x = cx(start)
    let z = cz(start)
    let yawT = st.current.yaw
    let walking = false
    let hop = 0
    if ((sim.phase === 'walk' || sim.phase === 'arrive') && path.length > 1) {
      const s = sim.walkS
      const i0 = Math.min(path.length - 2, Math.floor(s))
      const f = s - i0
      const a = path[i0]
      const b = path[i0 + 1]
      x = cx(a) + (cx(b) - cx(a)) * f
      z = cz(a) + (cz(b) - cz(a)) * f
      yawT = Math.atan2(cx(b) - cx(a), cz(b) - cz(a))
      walking = sim.phase === 'walk'
      if (sim.phase === 'arrive') {
        const u = sim.now - sim.arriveAt
        hop = u < 1.3 ? Math.abs(Math.sin(u * Math.PI * 2.3)) * 0.32 * (1 - u / 1.3) : 0
        if (u > 0.2) yawT = Math.PI / 4 // turn to the camera and celebrate
      }
    } else if (path.length > 1) {
      yawT = Math.atan2(cx(path[1]) - cx(path[0]), cz(path[1]) - cz(path[0]))
    } else if (sim.phase === 'arrive') yawT = Math.PI / 4
    // shortest-arc damp of the heading
    let d = yawT - st.current.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    st.current.yaw += d * Math.min(1, dt * 12)
    g.position.set(x, 0, z)
    g.rotation.y = st.current.yaw
    const ph = sim.walkS * Math.PI
    if (body.current) body.current.position.y = (walking ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(sim.now * 2.4) * 0.012) + hop
    const sw = walking ? Math.sin(ph) * 0.6 : 0
    if (legL.current) legL.current.rotation.x = sw
    if (legR.current) legR.current.rotation.x = -sw
    if (pad.current) pad.current.position.set(cx(start), 0.012, cz(start))
    if (proxy.current) proxy.current.position.set(cx(start), 0.5, cz(start))
    if (ring.current) {
      const u = (sim.now * 0.8) % 1
      ring.current.scale.setScalar(0.5 + u * 0.5)
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.55
    }
  })
  return (
    <>
      <group ref={pad}>
        <mesh material={MAT.pad} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.42, 40]} />
        </mesh>
        <mesh ref={ring} material={MAT.ring} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.78, 40]} />
        </mesh>
      </group>
      <mesh ref={proxy} material={MAT.proxy}>
        <cylinderGeometry args={[0.48, 0.48, 1.3, 12]} />
      </mesh>
      <group ref={root} scale={1.45}>
        <group ref={body}>
          <mesh ref={legL} geometry={GEO.box} material={MAT.leg} position={[-0.075, 0.13, 0]} scale={[0.09, 0.22, 0.1]} castShadow />
          <mesh ref={legR} geometry={GEO.box} material={MAT.leg} position={[0.075, 0.13, 0]} scale={[0.09, 0.22, 0.1]} castShadow />
          <mesh material={MAT.body} position={[0, 0.38, 0]} castShadow>
            <capsuleGeometry args={[0.15, 0.16, 6, 14]} />
          </mesh>
          <mesh geometry={GEO.box} material={MAT.pack} position={[0, 0.4, -0.15]} scale={[0.22, 0.24, 0.11]} castShadow />
          <mesh geometry={GEO.ball} material={MAT.skin} position={[0, 0.66, 0]} scale={0.135} castShadow />
          <mesh geometry={GEO.ball} material={MAT.eye} position={[-0.05, 0.67, 0.122]} scale={0.018} />
          <mesh geometry={GEO.ball} material={MAT.eye} position={[0.05, 0.67, 0.122]} scale={0.018} />
          <mesh geometry={GEO.cyl} material={MAT.hat} position={[0, 0.735, 0]} scale={[0.19, 0.022, 0.19]} castShadow />
          <mesh material={MAT.hat} position={[0, 0.745, 0]} castShadow>
            <sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
        </group>
      </group>
    </>
  )
}

function Flag({ sim, proxy }: { sim: Sim; proxy: RefObject<THREE.Mesh | null> }) {
  const root = useRef<THREE.Group>(null)
  const cloth = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.52, 0.32, 10, 4)
    g.translate(0.26, 0, 0)
    return g
  }, [])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo])
  useFrame(() => {
    const g = root.current
    if (!g) return
    const goal = sim.grid.goal
    g.position.set(cx(goal), 0, cz(goal))
    if (proxy.current) proxy.current.position.set(cx(goal), 0.5, cz(goal))
    const t = sim.now
    const excited = sim.phase === 'arrive' && t - sim.arriveAt < 2.5 ? 1 : 0
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let v = 0; v < pos.count; v++) {
      const x = base[v * 3]
      pos.setZ(v, Math.sin(x * 10 - t * (5 + excited * 5)) * 0.06 * (x / 0.52) * (1 + excited))
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    if (cloth.current) cloth.current.rotation.y = -Math.PI / 4 + Math.sin(t * 1.3) * 0.12
  })
  return (
    <>
      <mesh ref={proxy} material={MAT.proxy}>
        <cylinderGeometry args={[0.48, 0.48, 1.6, 12]} />
      </mesh>
      <group ref={root}>
        <mesh material={MAT.padGoal} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.42, 40]} />
        </mesh>
        <group scale={1.45}>
          <mesh geometry={GEO.cyl} material={MAT.stone} position={[0, 0.05, 0]} scale={[0.16, 0.1, 0.16]} castShadow />
          <mesh geometry={GEO.cyl} material={MAT.pole} position={[0, 0.62, 0]} scale={[0.03, 1.15, 0.03]} castShadow />
          <mesh geometry={GEO.ball} material={MAT.hat} position={[0, 1.21, 0]} scale={0.05} />
          <group position={[0, 1.02, 0]}>
            <mesh ref={cloth} geometry={geo} material={MAT.flag} castShadow />
          </group>
        </group>
      </group>
    </>
  )
}

function Confetti({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const COUNT = 46
  const seeds = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, k) => {
        const a = (k / COUNT) * Math.PI * 2 + Math.sin(k * 12.9) * 0.4
        const sp = 0.9 + ((Math.sin(k * 78.2) * 43758.5) % 1 + 1) % 1 * 1.4
        return { vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3.2 + ((k * 0.618) % 1) * 2, spin: 4 + (k % 5) * 2, c: CONFETTI[k % CONFETTI.length] }
      }),
    [],
  )
  useLayoutEffect(() => {
    const m = ref.current!
    for (let i = 0; i < COUNT; i++) {
      m.setMatrixAt(i, ZERO)
      m.setColorAt(i, seeds[i].c)
    }
  }, [seeds])
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const u = sim.now - sim.arriveAt
    const on = sim.phase === 'arrive' && sim.trace.found && u < 2.2
    m.visible = on
    if (!on) return
    const goal = sim.grid.goal
    const gx = cx(goal)
    const gz = cz(goal)
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]
      const y = 0.9 + s.vy * u - 4.6 * u * u
      const fade = 1 - smooth(clamp01((u - 1.4) / 0.8))
      _p.set(gx + s.vx * u, Math.max(0.05, y), gz + s.vz * u)
      _q.setFromEuler(_e.set(u * s.spin, u * s.spin * 0.7, i))
      _s.set(0.09 * fade, 0.09 * fade, 0.05 * fade)
      _m.compose(_p, _q, _s)
      m.setMatrixAt(i, _m)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[GEO.box, MAT.confetti, COUNT]} frustumCulled={false} />
}

function Hover({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const i = sim.hover
    const ok = i >= 0 && sim.editable(i) && (!sim.drag || sim.drag === 'add' || sim.drag === 'erase')
    m.visible = ok
    if (!ok) return
    const h = sim.height(i)
    m.position.set(cx(i), h > 0.01 ? h * WALL_H + 0.012 : 0.03, cz(i))
  })
  return (
    <mesh ref={ref} material={MAT.hover} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.36, 0.47, 4, 1, Math.PI / 4]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ pointer: paint walls, drag markers */
function Pointer({
  sim,
  floor,
  walls,
  startProxy,
  goalProxy,
  world,
}: {
  sim: Sim
  floor: RefObject<THREE.InstancedMesh | null>
  walls: RefObject<THREE.InstancedMesh | null>
  startProxy: RefObject<THREE.Mesh | null>
  goalProxy: RefObject<THREE.Mesh | null>
  world: RefObject<THREE.Group | null>
}) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (POSTER) return
    const el = gl.domElement
    el.style.touchAction = 'none'
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()
    let pid = -1
    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
    }
    const cellAt = () => {
      const f = floor.current
      const w = walls.current
      if (!f || !w) return -1
      const hits = ray.intersectObjects([w, f], false)
      for (const h of hits) {
        if (h.instanceId == null) continue
        if (h.object === w && sim.height(h.instanceId) < 0.05) continue
        return h.instanceId
      }
      return -1
    }
    const planeCell = () => {
      plane.constant = -(world.current?.position.y ?? 0)
      if (!ray.ray.intersectPlane(plane, hit)) return -1
      const x = Math.round(hit.x + HALF)
      const y = Math.round(hit.z + HALF)
      if (x < 1 || y < 1 || x > N - 2 || y > N - 2) return -1
      return y * N + x
    }
    const markerAt = (): 'start' | 'goal' | null => {
      const list = [startProxy.current, goalProxy.current].filter(Boolean) as THREE.Object3D[]
      const h = ray.intersectObjects(list, false)[0]
      if (!h) return null
      return h.object === startProxy.current ? 'start' : 'goal'
    }
    const paint = (c: number) => {
      if (c < 0 || !sim.drag || (sim.drag !== 'add' && sim.drag !== 'erase')) return
      if (sim.setWall(c, sim.drag === 'add')) sim.live()
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      aim(e)
      sim.touch()
      const mk = markerAt()
      if (mk) {
        sim.drag = mk
        sim.hover = -1
      } else {
        const c = cellAt()
        if (!sim.editable(c)) return
        sim.drag = sim.grid.wall[c] ? 'erase' : 'add'
        sim.hover = c
        paint(c)
      }
      pid = e.pointerId
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      el.style.cursor = mk ? 'grabbing' : 'crosshair'
      e.preventDefault()
    }
    const move = (e: PointerEvent) => {
      aim(e)
      if (sim.drag === 'start' || sim.drag === 'goal') {
        sim.touch()
        const c = planeCell()
        if (sim.moveMarker(sim.drag, c)) sim.live()
        return
      }
      if (sim.drag) {
        sim.touch()
        const c = cellAt()
        sim.hover = c
        paint(c)
        return
      }
      const mk = markerAt()
      const c = mk ? -1 : cellAt()
      sim.hover = c
      el.style.cursor = mk ? 'grab' : sim.editable(c) ? 'pointer' : ''
    }
    const up = () => {
      if (!sim.drag) return
      sim.drag = null
      sim.touch()
      if (pid >= 0) {
        try {
          el.releasePointerCapture(pid)
        } catch {
          /* ignore */
        }
      }
      pid = -1
      el.style.cursor = ''
    }
    const leave = () => {
      if (!sim.drag) sim.hover = -1
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
  }, [gl, camera, sim, floor, walls, startProxy, goalProxy, world])
  return null
}

/* ------------------------------------------------------------------ lights + scene */
function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fffaf2', 1.75)
    l.position.set(5, 8.3, 2.5)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const c = l.shadow.camera as THREE.OrthographicCamera
    c.left = c.bottom = -N * 0.78
    c.right = c.top = N * 0.78
    c.near = 1
    c.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.42} color="#fbf8ff" />
      <hemisphereLight args={['#ffffff', '#cfc8ee', 0.36]} />
      <primitive object={sun} />
    </>
  )
}

function Scene({ sim }: { sim: Sim }) {
  const world = useRef<THREE.Group>(null)
  const floor = useRef<THREE.InstancedMesh>(null)
  const walls = useRef<THREE.InstancedMesh>(null)
  const startProxy = useRef<THREE.Mesh>(null)
  const goalProxy = useRef<THREE.Mesh>(null)
  const ready = useCompiled(world)
  const intro = useRef(0)
  useFrame((_, dt) => {
    if (!ready) return
    dt = Math.min(dt, 1 / 30)
    sim.tick(dt)
    const g = world.current
    if (!g) return
    intro.current = POSTER ? 1 : Math.min(1, intro.current + dt / 0.9)
    const e = backOut(intro.current, 1.3)
    g.position.y = (1 - e) * -2.5 + (POSTER ? 0 : Math.sin(sim.now * 0.6) * 0.06)
  })
  return (
    <group ref={world} visible={ready}>
      <Board />
      <Floaters />
      <Cells sim={sim} floorRef={floor} wallRef={walls} />
      <Trail sim={sim} />
      <Hover sim={sim} />
      <Explorer sim={sim} proxy={startProxy} />
      <Flag sim={sim} proxy={goalProxy} />
      <Confetti sim={sim} />
      <Pointer sim={sim} floor={floor} walls={walls} startProxy={startProxy} goalProxy={goalProxy} world={world} />
    </group>
  )
}

/* ------------------------------------------------------------------ page */
type Stats = { disc: number; exp: number; len: number | null; cost: number; phase: Phase; found: boolean; v: number }
const PHASE_ZH: Record<Phase, string> = {
  build: '生成迷宫',
  search: '搜索中',
  path: '回溯路径',
  walk: '出发',
  arrive: '到达',
  live: '重新规划',
}

export default function PathMaze() {
  const sim = useMemo(makeSim, [])
  const [algo, setAlgo] = useState<Algo>(sim.algo)
  const [speed, setSpeed] = useState<Speed>('mid')
  const [stats, setStats] = useState<Stats>({ disc: 0, exp: 0, len: null, cost: 0, phase: 'build', found: true, v: 0 })
  const [all, setAll] = useState(sim.all)

  useEffect(() => {
    sim.onAuto = (a) => setAlgo(a)
    let lastV = -1
    const id = setInterval(() => {
      const tr = sim.trace
      const k = sim.phase === 'build' ? -1 : Math.min(sim.k, tr.steps)
      const exp = k < 0 ? 0 : Math.floor(k)
      const disc = k < 0 ? 0 : tr.discCum[Math.max(0, exp)] ?? 0
      const done = sim.phase === 'path' || sim.phase === 'walk' || sim.phase === 'arrive' || sim.phase === 'live'
      const next: Stats = { disc, exp, len: done && tr.found ? tr.path.length - 1 : null, cost: tr.cost, phase: sim.phase, found: tr.found, v: sim.version }
      setStats((s) => (s.disc === next.disc && s.exp === next.exp && s.len === next.len && s.phase === next.phase && s.v === next.v ? s : next))
      if (sim.version !== lastV) {
        lastV = sim.version
        setAll({ ...sim.all })
      }
    }, 90)
    return () => clearInterval(id)
  }, [sim])

  const pickAlgo = (a: Algo) => {
    sim.touch()
    sim.userAlgo = true
    sim.algo = a
    setAlgo(a)
    sim.restartSearch()
  }
  const pickSpeed = (s: Speed) => {
    sim.touch()
    sim.speed = s
    setSpeed(s)
  }
  const newMaze = () => {
    sim.touch()
    sim.newMaze()
  }
  const rerun = () => {
    sim.touch()
    sim.restartSearch()
  }

  const maxDisc = Math.max(1, ...ALGOS.map((a) => all[a.value]?.disc ?? 0))
  const bestCost = Math.min(...ALGOS.map((a) => (all[a.value]?.found ? all[a.value].cost : Infinity)))
  const noPath = !stats.found && (stats.phase === 'arrive' || stats.phase === 'live')

  return (
    <div className="stage pm-root">
      <div aria-hidden className="pm-halo" />
      <Canvas orthographic flat shadows="percentage" dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={MOBILE0 ? 30 : 38} mobileFit={MOBILE0 ? 22.5 : 28} mobileOffsetY={0.1} offset={[0.2, 0.0]} target={[0, -0.6, 0]} />
        <Lights />
        <Scene sim={sim} />
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
            <i style={{ background: '#6b5cff' }} /> Isometric · Pathfinding
          </p>
          <h1>
            一格一格
            <br />
            找到出口
          </h1>
          <p className="pm-desc">
            迷宫由递归回溯随机生成。<em className="pm-k pm-k-f">琥珀色</em>是待扩展的边界，<em className="pm-k pm-k-v">淡紫</em>是已访问的格子，最后亮起的
            <em className="pm-k pm-k-p">紫色小路</em>就是最短路径。蓝色水洼更难走（代价 ×{WATER_COST}），BFS 和贪心不在乎，A* 与 Dijkstra 会绕开。
          </p>

          <div className="pm-stats" data-nopath={noPath}>
            <span className="pm-phase">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.em
                  key={noPath ? 'none' : stats.phase}
                  initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                  transition={{ duration: 0.2 }}
                >
                  {noPath ? '无路可走' : PHASE_ZH[stats.phase]}
                </motion.em>
              </AnimatePresence>
            </span>
            <span>
              已访问 <b>{stats.disc}</b> 格
            </span>
            <span>
              路径长度 <b>{stats.len ?? '—'}</b>
            </span>
            <span>
              用时 <b>{stats.exp}</b> 步
            </span>
          </div>

          <div className="pm-compare" aria-label="四种算法在当前迷宫上的对比">
            {ALGOS.map((a) => {
              const s = all[a.value]
              if (!s) return null
              const subopt = s.found && s.cost > bestCost
              return (
                <button key={a.value} className="pm-row" data-on={a.value === algo} onClick={() => pickAlgo(a.value)}>
                  <b>{a.label}</b>
                  <span className="pm-bar">
                    <motion.i animate={{ width: `${(s.disc / maxDisc) * 100}%` }} transition={{ type: 'spring', stiffness: 260, damping: 30 }} />
                  </span>
                  <span className="pm-num">
                    访问 <em>{s.disc}</em> · 路径 <em>{s.found ? s.len : '—'}</em> · 代价{' '}
                    <em data-bad={subopt}>{s.found ? s.cost : '—'}</em>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="hero-actions">
            <button className="btn primary" onClick={newMaze}>
              新迷宫
            </button>
            <button className="btn" onClick={rerun}>
              重新搜索
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg items={ALGOS.map((a) => ({ value: a.value, label: a.label }))} value={algo} onChange={pickAlgo} />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'slow', label: '慢' },
              { value: 'mid', label: '中' },
              { value: 'fast', label: '快' },
            ]}
            value={speed}
            onChange={pickSpeed}
          />
        </div>
        <p className="hint">
          点 / 拖地面加墙 · 拖墙块擦除
          <br />
          拖起点小人或旗子换位置，路线实时重算
        </p>
      </div>

      <style>{`
        .pm-root { --soft-bg: #f1f0f9; background: linear-gradient(180deg, #f5f4fb 0%, #eceaf6 58%, #e2e0f1 100%); }
        .pm-halo { position: absolute; right: 8%; top: 14%; width: min(56vw, 760px); aspect-ratio: 1; border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(255,255,255,.35) 45%, transparent 70%); pointer-events: none; }
        .poster .pm-halo { right: 50%; translate: 50% 0; }
        .pm-root .hero-copy p.pm-desc { font-size: 15px; line-height: 1.75; }
        .pm-k { font-weight: 600; color: var(--fg); padding: 0 2px; border-radius: 4px; }
        .pm-k-f { background: rgba(255,181,71,.32); }
        .pm-k-v { background: rgba(200,191,255,.55); }
        .pm-k-p { background: rgba(107,92,255,.16); color: #5546e8; }
        .pm-stats { display: flex; align-items: center; gap: 12px; margin-top: 22px; height: 42px; padding: 0 16px 0 6px; border-radius: 999px;
          width: max-content; max-width: 100%; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 13%, transparent);
          font: 13px/1 var(--sans); color: var(--fg-2); white-space: nowrap; background: rgba(255,255,255,.5); }
        .pm-stats b { font: 600 14px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; display: inline-block; min-width: 2ch; text-align: center; }
        .pm-stats > span + span:not(.pm-phase) { padding-left: 12px; border-left: 1px solid color-mix(in srgb, var(--fg) 12%, transparent); }
        .pm-phase { display: inline-flex; align-items: center; height: 30px; padding: 0 11px; border-radius: 999px; background: #6b5cff; color: #fff; font-size: 12px; font-weight: 500; overflow: hidden; }
        .pm-phase em { display: inline-block; }
        .pm-stats[data-nopath='true'] .pm-phase { background: #e5484d; }
        .pm-compare { display: grid; gap: 2px; margin-top: 14px; }
        .pm-row { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 10px; height: 26px; padding: 0 8px; margin: 0 -8px;
          border: 0; border-radius: 8px; background: transparent; color: var(--fg-2); font: 12px/1 var(--sans); cursor: pointer; text-align: left;
          transition: background .2s, color .2s; }
        .pm-row:hover { background: rgba(107,92,255,.06); }
        .pm-row[data-on='true'] { color: var(--fg); background: rgba(107,92,255,.09); }
        .pm-row b { font: 600 12px/1 var(--mono); }
        .pm-bar { height: 6px; border-radius: 3px; background: rgba(107,92,255,.1); overflow: hidden; }
        .pm-bar i { display: block; height: 100%; border-radius: 3px; background: #c8bfff; }
        .pm-row[data-on='true'] .pm-bar i { background: #6b5cff; }
        .pm-num { font: 11px/1 var(--mono); white-space: nowrap; }
        .pm-num em { color: var(--fg); font-variant-numeric: tabular-nums; }
        .pm-num em[data-bad='true'] { color: #e0603a; }
        .pm-root .hero-actions { margin-top: 22px; }
        @media (max-width: 760px) {
          .pm-root .hero-copy p.pm-desc, .pm-compare { display: none; }
          .pm-root .hero-copy h1 { font-size: 34px; }
          .pm-stats { gap: 9px; padding-right: 12px; font-size: 12px; margin-top: 16px; }
          .pm-stats > span + span:not(.pm-phase) { padding-left: 9px; }
          .pm-root .hero-actions { margin-top: 14px; }
          .pm-root .dock .seg { padding: 0 10px; }
          .pm-halo { right: -20%; top: 6%; width: 120vw; }
        }
      `}</style>
    </div>
  )
}
