import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  createHologramEffect,
  glitchHologram,
  hologramAccent,
  hologramMeta,
  hologramModes,
  hologramSolid,
  hologramStatus,
  setHologramEvents,
  setHologramMode,
  setHologramProjector,
  setHologramSliceRange,
  setHologramStability,
  type HologramEffect,
  type HologramMode,
} from './effects/hologram'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 全息投影 showcase — a ringed planet with two moons, projected from a round emitter on a dark table.
 * The planet, rings, orbits and moons are ordinary lit meshes (the effect turns them into light); the table
 * and the projector are marked `hologramSolid`, so they stay real. Every frame the projector lens and the
 * planet are projected to screen space to aim the effect's light cone and the DOM HUD.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const STABILITY = [
  { zh: '稳定', s: 0.95 },
  { zh: '一般', s: 0.6 },
  { zh: '很差', s: 0.08 },
]
const NOTE: Record<HologramMode, string> = {
  starwars: '蓝白低清 · 粗扫描线 · 频闪与颗粒噪点',
  cyber: '青品双色 · 折痕线框 · 等法线经纬网',
  medical: '青绿解剖 · 切片平面扫过 · 断面等深线',
}
const SHORT: Record<HologramMode, string> = { starwars: '星战', cyber: '赛博', medical: '医疗' }

const LENS_Y = 0.29
const PLANET_Y = 2.15
const PLANET_R = 0.78

/* ------------------------------------------------------------------ geometry */

// small deterministic 3D value noise for the continents
function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise3(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const h = (i: number, j: number, k: number) => hash3(xi + i, yi + j, zi + k)
  return l(l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v), l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w)
}
const fbm = (x: number, y: number, z: number) => {
  let a = 0.5
  let s = 0
  let f = 1
  for (let i = 0; i < 4; i++) {
    s += a * vnoise3(x * f, y * f, z * f)
    f *= 2.03
    a *= 0.5
  }
  return s
}

function planetGeo() {
  // an indexed UV sphere (cheap to build — no vertex merging); the seam is welded after computing normals
  const WS = 96
  const HS = 64
  const g = new THREE.SphereGeometry(1, WS, HS)
  g.deleteAttribute('uv')
  const pos = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(pos.count * 3)
  const p = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).normalize()
    const n = fbm(p.x * 1.7 + 4.1, p.y * 1.7 - 1.3, p.z * 1.7 + 2.2)
    const land = THREE.MathUtils.smoothstep(n, 0.5, 0.56)
    const ridge = Math.max(0, n - 0.56)
    const lat = Math.abs(p.y)
    const ice = THREE.MathUtils.smoothstep(lat, 0.8, 0.9)
    const r = 1 + land * 0.022 + ridge * 0.18 + ice * 0.012
    pos.setXYZ(i, p.x * r, p.y * r, p.z * r)
    c.setRGB(0.04, 0.09, 0.2)
    c.lerp(new THREE.Color(0.45, 0.55, 0.3), land)
    c.lerp(new THREE.Color(0.55, 0.5, 0.42), Math.min(1, ridge * 6))
    c.lerp(new THREE.Color(0.9, 0.93, 0.95), ice)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  // weld the seam (first / last column share positions) and the poles so the normal buffer has no crease
  const nrm = g.attributes.normal as THREE.BufferAttribute
  const n = new THREE.Vector3()
  const m2 = new THREE.Vector3()
  for (let y = 0; y <= HS; y++) {
    const a = y * (WS + 1)
    const b = a + WS
    n.fromBufferAttribute(nrm, a).add(m2.fromBufferAttribute(nrm, b)).normalize()
    nrm.setXYZ(a, n.x, n.y, n.z)
    nrm.setXYZ(b, n.x, n.y, n.z)
  }
  for (const y of [0, HS]) {
    n.set(0, 0, 0)
    for (let x = 0; x <= WS; x++) n.add(m2.fromBufferAttribute(nrm, y * (WS + 1) + x))
    n.normalize()
    for (let x = 0; x <= WS; x++) nrm.setXYZ(y * (WS + 1) + x, n.x, n.y, n.z)
  }
  return g
}

/** flat ring band, both faces (the normal pass renders front faces only) */
function ringGeo(r0: number, r1: number, seg = 200) {
  const a = new THREE.RingGeometry(r0, r1, seg, 1)
  const b = a.clone()
  b.rotateX(Math.PI)
  const out = mergeGeos([a, b])
  a.dispose()
  b.dispose()
  return out
}
function mergeGeos(gs: THREE.BufferGeometry[]) {
  const pos: number[] = []
  const nrm: number[] = []
  const idx: number[] = []
  let base = 0
  for (const g of gs) {
    const p = g.attributes.position.array
    const n = g.attributes.normal.array
    for (let i = 0; i < p.length; i++) pos.push(p[i])
    for (let i = 0; i < n.length; i++) nrm.push(n[i])
    const ix = g.index!.array
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base)
    base += p.length / 3
  }
  const o = new THREE.BufferGeometry()
  o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  o.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  o.setIndex(idx)
  return o
}

/* ------------------------------------------------------------------ scene */

type Hud = {
  planet: { x: number; y: number; r: number }
  spin: number
  ready: boolean
}

function Scene({
  fx,
  ry,
  rx,
  hud,
  mode,
}: {
  fx: HologramEffect
  ry: MotionValue<number>
  rx: MotionValue<number>
  hud: React.MutableRefObject<Hud>
  mode: HologramMode
}) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, () => (hud.current.ready = true))
  const sys = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const moonA = useRef<THREE.Group>(null)
  const moonB = useRef<THREE.Group>(null)
  const station = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 4.2 : 0)
  const g = useMemo(
    () => ({
      planet: planetGeo(),
      rings: [ringGeo(1.18, 1.46), ringGeo(1.52, 1.86), ringGeo(1.9, 1.98)],
      orbitA: new THREE.TorusGeometry(2.25, 0.007, 6, 220),
      orbitB: new THREE.TorusGeometry(1.42, 0.006, 6, 160),
    }),
    [],
  )
  const m = useMemo(() => {
    const solid = (o: THREE.MeshStandardMaterialParameters) => hologramSolid(new THREE.MeshStandardMaterial(o))
    return {
      planet: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      ring: new THREE.MeshStandardMaterial({ color: '#8a857a', roughness: 0.8, side: THREE.DoubleSide }),
      ringDim: new THREE.MeshStandardMaterial({ color: '#4f4b44', roughness: 0.8, side: THREE.DoubleSide }),
      moon: new THREE.MeshStandardMaterial({ color: '#c8c4bb', roughness: 0.9 }),
      moon2: new THREE.MeshStandardMaterial({ color: '#8a8ea0', roughness: 0.9 }),
      orbit: new THREE.MeshBasicMaterial({ color: '#8a8a8a' }),
      table: solid({ color: '#0d141c', roughness: 0.62, metalness: 0.45 }),
      tableEdge: solid({ color: '#16202b', roughness: 0.5, metalness: 0.6 }),
      body: solid({ color: '#222a33', roughness: 0.38, metalness: 0.8 }),
      bevel: solid({ color: '#5d6b78', roughness: 0.25, metalness: 0.9 }),
      lens: solid({ color: '#0a0f14', roughness: 0.1, metalness: 0.3 }),
      led: solid({ color: '#000000', emissive: hologramAccent.starwars, emissiveIntensity: 2.2 }),
      panel: solid({ color: '#11171e', roughness: 0.6, metalness: 0.4 }),
    }
  }, [])
  useEffect(() => {
    m.led.emissive.set(hologramAccent[mode])
  }, [m, mode])
  useEffect(
    () => () => {
      g.planet.dispose()
      g.rings.forEach((r) => r.dispose())
      g.orbitA.dispose()
      g.orbitB.dispose()
      Object.values(m).forEach((x) => x.dispose())
    },
    [g, m],
  )
  const v = useMemo(() => new THREE.Vector3(), [])
  const v2 = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const W = size.width
    const H = size.height
    const mobile = W < 760

    /* camera: subject centred on the right half (desktop), raised above the copy (phones), centred (poster) */
    const aspect = W / H
    const halfW = mobile ? 2.25 : 2.9 // world half-width the system needs at the subject distance
    const dist = 8.6
    const fitV = (2 * Math.atan(halfW / dist / aspect) * 180) / Math.PI
    const fov = Math.max(mobile ? 36 : 33, fitV)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.position.set(0, mobile ? 1.45 : 2.05, dist)
    camera.lookAt(0, 1.55, 0)
    const cx = POSTER ? W / 2 : mobile ? W / 2 : Math.max(W * 0.64, Math.min(W - 330, 470 + (W - 470) / 2))
    const cy = POSTER ? H * 0.5 : mobile ? H * 0.4 : H * 0.52
    camera.setViewOffset(W, H, -(cx - W / 2), -(cy - H / 2), W, H)
    camera.updateMatrixWorld()

    /* the projected system: slow spin, drag adds yaw / tilt, moons orbit */
    if (sys.current) sys.current.rotation.set(0.12 + rx.get(), ry.get() + Math.sin(T * 0.21) * 0.25, 0)
    if (sys.current) sys.current.position.y = PLANET_Y + Math.sin(T * 0.8) * 0.05
    const sp = T * 0.22
    if (spin.current) spin.current.rotation.y = sp
    if (moonA.current) moonA.current.rotation.y = T * 0.42 + 1.2
    if (moonB.current) moonB.current.rotation.y = -T * 0.7 + 0.4
    if (station.current) station.current.rotation.y = T * 1.6
    hud.current.spin = sp

    /* aim the light cone and the HUD */
    v.set(0, PLANET_Y + (sys.current?.position.y ?? PLANET_Y) - PLANET_Y, 0).project(camera)
    const px = ((v.x + 1) / 2) * W
    const py = ((1 - v.y) / 2) * H
    v2.set(0, (sys.current?.position.y ?? PLANET_Y) + PLANET_R, 0).project(camera)
    const pr = Math.abs(((1 - v2.y) / 2) * H - py)
    hud.current.planet = { x: px, y: py, r: pr }
    v.set(0, LENS_Y, 0).project(camera)
    const lx = ((v.x + 1) / 2) * W
    const ly = ((1 - v.y) / 2) * H
    v2.set(0.5, LENS_Y, 0).project(camera)
    const rxp = Math.abs(((v2.x + 1) / 2) * W - lx)
    v2.set(0, LENS_Y, 0.5).project(camera)
    const ryp = Math.abs(((1 - v2.y) / 2) * H - ly)
    setHologramProjector(fx, {
      x: lx,
      y: ly,
      lens: rxp * 0.35,
      top: pr * 1.75,
      height: ly - (py - pr * 1.25),
      rx: rxp,
      ry: Math.max(ryp, 3),
      on: ready ? 1 : 0,
      viewH: H,
    })
    setHologramSliceRange(fx, (py - pr * 1.15) / H, (py + pr * 1.15) / H, (px - pr * 2.7) / W, (px + pr * 2.7) / W)
  })

  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight args={['#9fc4ff', '#0a0c10', 0.5]} />
      <directionalLight position={[-3, 5, 4]} intensity={2.4} />
      <directionalLight position={[4, 2, -3]} intensity={1.1} color="#9cc8ff" />
      <pointLight position={[0, 0.6, 0]} intensity={2} distance={3.5} color={hologramAccent[mode]} />
      <group ref={content} visible={ready}>
        {/* table */}
        <mesh position={[0, -0.12, 0]} material={m.table}>
          <cylinderGeometry args={[5.2, 5.2, 0.24, 96]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.tableEdge}>
          <torusGeometry args={[5.2, 0.12, 12, 128]} />
        </mesh>
        {/* projector */}
        <group>
          <mesh position={[0, 0.07, 0]} material={m.body}>
            <cylinderGeometry args={[0.82, 0.9, 0.14, 72]} />
          </mesh>
          <mesh position={[0, 0.19, 0]} material={m.bevel}>
            <cylinderGeometry args={[0.66, 0.8, 0.1, 72]} />
          </mesh>
          <mesh position={[0, 0.25, 0]} material={m.lens}>
            <cylinderGeometry args={[0.56, 0.62, 0.04, 72]} />
          </mesh>
          <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]} material={m.bevel}>
            <torusGeometry args={[0.56, 0.018, 8, 72]} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => {
            const a = -0.9 + i * 0.22
            return (
              <mesh key={i} position={[Math.sin(a) * 0.865, 0.07, Math.cos(a) * 0.865]} rotation={[0, a, 0]} material={m.led}>
                <boxGeometry args={[0.07, 0.025, 0.02]} />
              </mesh>
            )
          })}
          <mesh position={[1.25, 0.03, 0.55]} rotation={[0, -0.5, 0]} material={m.panel}>
            <boxGeometry args={[0.6, 0.06, 0.38]} />
          </mesh>
        </group>
        {/* the projected system */}
        <group ref={sys} position={[0, PLANET_Y, 0]}>
          <group rotation={[0, 0, 0.42]}>
            <group ref={spin}>
              <mesh geometry={g.planet} material={m.planet} scale={PLANET_R} />
            </group>
            <group rotation={[-Math.PI / 2 + 0.26, 0, 0]}>
              <mesh geometry={g.rings[0]} material={m.ringDim} />
              <mesh geometry={g.rings[1]} material={m.ring} />
              <mesh geometry={g.rings[2]} material={m.ringDim} />
            </group>
            <group ref={station} rotation={[0.3, 0, 0]}>
              <mesh geometry={g.orbitB} material={m.orbit} rotation={[Math.PI / 2, 0, 0]} />
              <mesh position={[1.42, 0, 0]} material={m.moon2}>
                <octahedronGeometry args={[0.06, 0]} />
              </mesh>
            </group>
          </group>
          <group rotation={[0.22, 0, -0.12]}>
            <mesh geometry={g.orbitA} material={m.orbit} rotation={[Math.PI / 2, 0, 0]} />
            <group ref={moonA}>
              <mesh position={[2.25, 0, 0]} material={m.moon}>
                <sphereGeometry args={[0.19, 40, 28]} />
              </mesh>
            </group>
          </group>
          <group rotation={[-0.35, 0, 0.3]}>
            <group ref={moonB}>
              <mesh position={[0, 0, 2.05]} material={m.moon2}>
                <icosahedronGeometry args={[0.11, 2]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ HUD */

function HudLayer({ fx, hud, stab }: { fx: HologramEffect; hud: React.MutableRefObject<Hud>; stab: number }) {
  const tag = useRef<HTMLDivElement>(null)
  const line = useRef<SVGPolylineElement>(null)
  const rot = useRef<HTMLElement>(null)
  const sig = useRef<HTMLElement>(null)
  const sigBar = useRef<HTMLDivElement>(null)
  const sync = useRef<HTMLElement>(null)
  const slice = useRef<HTMLElement>(null)
  const bars = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const stabRef = useRef(stab)
  stabRef.current = stab

  useEffect(() => {
    let raf = 0
    let sm = 0.9
    let frame = 0
    const hist: number[] = Array(24).fill(0.9)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const h = hud.current
      const st = hologramStatus(fx)
      frame++
      const target = (0.55 + 0.42 * stabRef.current) * (1 - 0.6 * st.level) + (Math.random() - 0.5) * 0.04
      sm += (target - sm) * 0.12
      const { x, y, r } = h.planet
      const W = window.innerWidth
      const mobile = W < 760
      // label: up-right of the planet with a leader line
      const ax = x + r * 0.62
      const ay = y - r * 0.62
      const tw = tag.current?.offsetWidth ?? 160
      const tx = Math.min(x + r * 1.55 + 20, W - tw - 12)
      const ty = Math.max(mobile ? 96 : 84, y - r * 1.45 - (mobile ? 40 : 10))
      if (tag.current) tag.current.style.transform = `translate(${tx}px, ${ty}px)`
      if (line.current) line.current.setAttribute('points', `${ax},${ay} ${ax + Math.min(30, (tx - ax) * 0.4)},${ty + 26} ${tx},${ty + 26}`)
      if (panel.current && !mobile) panel.current.style.transform = `translate(${Math.min(W - 222, x + r * 2.9)}px, ${y + r * 1.3}px)`
      if (frame % 4 === 0) {
        if (rot.current) rot.current.textContent = `${(((h.spin * 180) / Math.PI) % 360).toFixed(1).padStart(5, '0')}°`
        if (sig.current) sig.current.textContent = `${Math.round(sm * 100)}%`
        if (sigBar.current) sigBar.current.style.transform = `scaleX(${sm.toFixed(3)})`
        if (sync.current) sync.current.textContent = st.glitching ? '重新同步…' : '锁定'
        if (sync.current) sync.current.dataset.bad = st.glitching ? '1' : '0'
        if (slice.current) slice.current.textContent = st.mode === 'medical' ? `${Math.round((st.slice * 100 - 50) * 4.2)} mm` : '—'
        hist.push(sm)
        hist.shift()
        if (bars.current) {
          const kids = bars.current.children
          for (let i = 0; i < kids.length; i++) (kids[i] as HTMLElement).style.transform = `scaleY(${Math.max(0.06, hist[i]).toFixed(3)})`
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fx, hud])

  return (
    <div className="ho-hud">
      <svg className="ho-lead" width="100%" height="100%">
        <polyline ref={line} fill="none" stroke="var(--ho-accent)" strokeOpacity="0.7" strokeWidth="1" />
      </svg>
      <div className="ho-tag" ref={tag}>
        <b>KPL-442 b</b>
        <span>宜居带类地行星 · 2 卫星</span>
      </div>
      <div className="ho-panel" ref={panel}>
        <div className="ho-row">
          <span>自转相位</span>
          <b ref={rot}>000.0°</b>
        </div>
        <div className="ho-row">
          <span>信号强度</span>
          <b ref={sig}>90%</b>
        </div>
        <div className="ho-meter">
          <div ref={sigBar} />
        </div>
        <div className="ho-bars" ref={bars}>
          {Array.from({ length: 24 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="ho-row">
          <span>帧同步</span>
          <b ref={sync}>锁定</b>
        </div>
        <div className="ho-row">
          <span>切片深度</span>
          <b ref={slice}>—</b>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Hologram() {
  const fx = useMemo(() => {
    const f = createHologramEffect()
    if (POSTER) setHologramEvents(f, false)
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<HologramMode>('starwars')
  const [si, setSi] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const hud = useRef<Hud>({ planet: { x: -999, y: -999, r: 0 }, spin: 0, ready: false })

  const ry = useMotionValue(0)
  const rx = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setHologramMode(fx, mode), [fx, mode])
  useEffect(() => setHologramStability(fx, STABILITY[si].s), [fx, si])

  // idle: cycle the modes
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => hologramModes[(hologramModes.findIndex((x) => x.id === m) + 1) % hologramModes.length].id)
    }, 8000)
    return () => window.clearInterval(id)
  }, [])

  // drag turns the system (Motion inertia on release); a click without a drag scrambles the signal
  const drag = useRef<{ x: number; y: number; id: number; moved: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.moved += Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y)
    ry.set(ry.get() + (e.clientX - d.x) * 0.006)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.5, 0.5))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved < 6) {
      glitchHologram(fx)
      return
    }
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600 }),
      animate(rx, rx.get(), {
        type: 'inertia',
        velocity: rx.getVelocity(),
        power: 0.3,
        timeConstant: 400,
        min: -0.5,
        max: 0.5,
        bounceStiffness: 160,
        bounceDamping: 18,
        onComplete: () => {
          anims.current.push(animate(rx, 0, { type: 'spring', stiffness: 20, damping: 9, delay: 1.2 }))
        },
      }),
    ]
  }

  const label = hologramModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage ho ho-${mode}${split.open ? ' ho-split' : ''}`}
      style={{ ['--ho-accent' as string]: hologramAccent[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 2, 8.6], fov: 30, near: 0.5, far: 40 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={hologramMeta.background} preload={preload} />
        <Scene fx={fx} ry={ry} rx={rx} hud={hud} mode={mode} />
      </Canvas>

      <div className="overlay">
        <HudLayer fx={fx} hud={hud} stab={STABILITY[si].s} />
        <OriginalSplit split={split} label={label} />

        <div className="hero-copy ho-copy">
          <div className="scrim ho-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Hologram ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="ho-kmode"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              一束光里
              <br />
              <span className="ho-glow">浮起的行星</span>
            </h1>
            <p className="ho-sub">没有一块实体：边缘按菲涅尔发亮，正面半透明、能看见身后的房间。扫描线不停上滚，边缘色散，偶尔一段画面被横向扯开，再重新同步。</p>
            <div className="ho-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={hologramModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg ho-cycle"
            onClick={() => {
              poke()
              setSi((i) => (i + 1) % STABILITY.length)
            }}
          >
            <span>
              {mobile ? '信号' : '信号稳定度'} <b>{STABILITY[si].zh}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="ho-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动旋转星系 · 单击制造信号干扰</p>
      </div>
    </div>
  )
}

const css = `
.ho { cursor: grab; touch-action: none; background: ${hologramMeta.background}; }
.ho:active { cursor: grabbing; }
.ho canvas { display: block; }
.ho-copy { pointer-events: none !important; }
.ho-scrim { --soft-bg: rgba(2, 7, 13, .72); }
.ho-copy .kicker i { background: var(--ho-accent); box-shadow: 0 0 10px var(--ho-accent); transition: background .6s, box-shadow .6s; }
.ho-kmode { display: inline-block; color: var(--fg); }
.ho-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.ho-glow {
  color: color-mix(in srgb, var(--ho-accent) 45%, #fff);
  text-shadow: 0 0 14px color-mix(in srgb, var(--ho-accent) 70%, transparent), 0 0 34px color-mix(in srgb, var(--ho-accent) 40%, transparent);
  background: repeating-linear-gradient(to bottom, transparent 0 3px, rgba(0,0,0,.28) 3px 4px);
  -webkit-background-clip: text; background-clip: text;
  transition: color .6s, text-shadow .6s;
}
.ho-sub { max-width: 400px; }
.ho-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.ho-spec span { display: inline-flex; align-items: center; gap: 9px; }
.ho-spec i { width: 18px; height: 2px; background: var(--ho-accent); box-shadow: 0 0 8px var(--ho-accent); }
.ho-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.ho-cycle b { font-weight: 600; color: var(--fg); }

.ho-hud { position: absolute; inset: 0; pointer-events: none; transition: opacity .4s; }
.ho-split .ho-hud { opacity: 0; }
.ho-lead { position: absolute; inset: 0; overflow: visible; }
.ho-tag, .ho-panel {
  position: absolute; left: 0; top: 0; will-change: transform;
  font: 500 11px/1.4 var(--mono); color: color-mix(in srgb, var(--ho-accent) 55%, #fff);
  transition: color .6s;
}
.ho-tag { padding: 6px 10px 6px 10px; border-left: 1px solid var(--ho-accent); background: linear-gradient(90deg, color-mix(in srgb, var(--ho-accent) 14%, transparent), transparent); }
.ho-tag b { display: block; font-size: 13px; letter-spacing: .08em; color: #fff; text-shadow: 0 0 10px var(--ho-accent); }
.ho-tag span { opacity: .8; }
.ho-panel {
  width: 168px; padding: 10px 12px; border-radius: 4px;
  background: color-mix(in srgb, var(--ho-accent) 7%, rgba(2, 8, 14, .55));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ho-accent) 30%, transparent), 0 0 24px -8px var(--ho-accent);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.ho-panel::before, .ho-panel::after { content: ''; position: absolute; width: 8px; height: 8px; border: 1px solid var(--ho-accent); }
.ho-panel::before { left: -3px; top: -3px; border-right: 0; border-bottom: 0; }
.ho-panel::after { right: -3px; bottom: -3px; border-left: 0; border-top: 0; }
.ho-row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.ho-row span { opacity: .7; }
.ho-row b { font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; }
.ho-row b[data-bad='1'] { color: #ff8a8a; }
.ho-meter { height: 3px; margin: 3px 0 7px; background: color-mix(in srgb, var(--ho-accent) 18%, transparent); }
.ho-meter div { height: 100%; transform-origin: left; background: var(--ho-accent); box-shadow: 0 0 6px var(--ho-accent); }
.ho-bars { display: flex; align-items: flex-end; gap: 2px; height: 22px; margin-bottom: 6px; }
.ho-bars i { flex: 1; height: 100%; transform-origin: bottom; background: color-mix(in srgb, var(--ho-accent) 60%, transparent); }
.ho .hint { transition: opacity .4s; }
.ho-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .ho-copy { transition: opacity .4s; }
  .ho-split .ho-copy { opacity: 0; }
  .ho-sub { display: none; }
  .ho-copy h1 { font-size: 36px; }
  .ho-spec { margin-top: 12px; font-size: 11px; }
  .ho-panel { display: none; }
  .ho .dock .seg { padding: 0 10px; }
}
body.poster .ho-hud { display: none; }
`
