import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { animate, motion, motionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ cloth constants */

const NX = 40
const NY = 26
const N = NX * NY
const FW = 4.0
const FH = 2.6
const SX = FW / (NX - 1)
const SY = FH / (NY - 1)
const TOP = 2.15
const GROUND = -2.75
const POLE_R = 0.055
const POLE_TOP = TOP + 0.38
const RING_R = 0.085
const RINGS = [0, 8, 17, 25] // hoist rows held by a ring on the pole
const H = 1 / 120 // fixed sim step
const ITER = 5
const DRAG = 185 // aerodynamic drag per unit area
const GRAV = -9.8

const CORAL = '#ff6b4a'
const NAVY = '#1f2a44'
const CREAM = '#fbf6ee'
const FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
const MONO = '"Cascadia Code", Consolas, "SF Mono", monospace'

type Wind = 'calm' | 'breeze' | 'gale'
const WIND_SPEED: Record<Wind, number> = { calm: 0, breeze: 5.6, gale: 11 }

/* ------------------------------------------------------------------ banner texture (front + back reading correctly) */

function bannerTexture(back: boolean) {
  const W = 1280
  const Hh = Math.round((W * FH) / FW)
  const c = document.createElement('canvas')
  c.width = W
  c.height = Hh
  const x = c.getContext('2d')!
  // the back is seen mirrored: draw the layout mirrored, then un-mirror each text block locally
  const fx = (px: number) => (back ? W - px : px)
  const block = (cx: number, cy: number, fn: () => void) => {
    x.save()
    x.translate(fx(cx), cy)
    fn()
    x.restore()
  }
  x.fillStyle = CORAL
  x.fillRect(0, 0, W, Hh)
  // subtle woven texture
  for (let yy = 0; yy < Hh; yy += 4) {
    x.fillStyle = yy % 8 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'
    x.fillRect(0, yy, W, 2)
  }
  // hoist band + header tape
  const band = 330
  x.fillStyle = NAVY
  x.fillRect(back ? W - band : 0, 0, band, Hh)
  x.fillStyle = '#efe9de'
  x.fillRect(back ? W - 26 : 0, 0, 26, Hh)
  // stitched hem lines
  x.strokeStyle = 'rgba(255,255,255,0.45)'
  x.setLineDash([12, 9])
  x.lineWidth = 3
  x.strokeRect(14, 14, W - 28, Hh - 28)
  x.setLineDash([])
  // logo: wind swoosh in a circle
  block(band / 2 + 13, Hh * 0.36, () => {
    x.fillStyle = CREAM
    x.beginPath()
    x.arc(0, 0, 92, 0, Math.PI * 2)
    x.fill()
    x.strokeStyle = CORAL
    x.lineCap = 'round'
    x.lineWidth = 15
    for (let k = 0; k < 3; k++) {
      const yy = -32 + k * 32
      const len = [70, 96, 58][k]
      x.beginPath()
      x.moveTo(-58, yy)
      x.lineTo(-58 + len - 18, yy)
      x.arc(-58 + len - 18, yy - 16, 16, Math.PI / 2, -Math.PI * 0.75, true)
      x.stroke()
    }
  })
  block(band / 2 + 13, Hh * 0.64, () => {
    x.fillStyle = CREAM
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `800 40px ${FONT}`
    x.fillText('KITE', 0, 0)
    x.font = `600 22px ${MONO}`
    x.fillStyle = 'rgba(251,246,238,0.6)'
    x.fillText('EST · 2026', 0, 44)
  })
  // fly side: big type
  const cx = band + (W - band) / 2
  block(cx, Hh * 0.4, () => {
    x.fillStyle = CREAM
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `900 330px ${FONT}`
    x.fillText('乘风', 0, 0)
  })
  block(cx, Hh * 0.74, () => {
    x.fillStyle = NAVY
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.font = `900 72px ${FONT}`
    x.fillText('RIDE THE WIND', 0, 0)
    x.font = `600 26px ${MONO}`
    x.fillStyle = 'rgba(251,246,238,0.85)'
    x.fillText('MOTION · 3D · LAB  —  NO. 31', 0, 66)
  })
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ------------------------------------------------------------------ simulation */

type Sim = ReturnType<typeof makeSim>

function makeSim() {
  const pos = new Float32Array(N * 3)
  const prev = new Float32Array(N * 3)
  const acc = new Float32Array(N * 3)
  const ca: number[] = []
  const cb: number[] = []
  const cr: number[] = []
  const ck: number[] = []
  const add = (a: number, b: number, k: number) => {
    ca.push(a)
    cb.push(b)
    ck.push(k)
    cr.push(0)
  }
  const id = (c: number, r: number) => r * NX + c
  for (let r = 0; r < NY; r++)
    for (let c = 0; c < NX; c++) {
      if (c < NX - 1) add(id(c, r), id(c + 1, r), 1)
      if (r < NY - 1) add(id(c, r), id(c, r + 1), 1)
      if (c < NX - 1 && r < NY - 1) {
        add(id(c, r), id(c + 1, r + 1), 0.85)
        add(id(c + 1, r), id(c, r + 1), 0.85)
      }
      if (c < NX - 2) add(id(c, r), id(c + 2, r), 0.4)
      if (r < NY - 2) add(id(c, r), id(c, r + 2), 0.4)
    }
  const CA = Int32Array.from(ca)
  const CB = Int32Array.from(cb)
  const CK = Float32Array.from(ck)
  const CR = new Float32Array(cr.length)
  const tris: number[] = []
  for (let r = 0; r < NY - 1; r++)
    for (let c = 0; c < NX - 1; c++) {
      const i = id(c, r)
      tris.push(i, i + NX, i + 1, i + 1, i + NX, i + NX + 1)
    }
  const TR = Int32Array.from(tris)

  const restPos = (i: number, out: number[] | Float32Array, o = 0) => {
    const c = i % NX
    const r = (i / NX) | 0
    out[o] = RING_R + c * SX
    out[o + 1] = TOP - r * SY
    out[o + 2] = 0
  }
  for (let i = 0; i < N; i++) {
    restPos(i, pos, i * 3)
    prev[i * 3] = pos[i * 3]
    prev[i * 3 + 1] = pos[i * 3 + 1]
    prev[i * 3 + 2] = pos[i * 3 + 2]
  }
  for (let k = 0; k < CA.length; k++) {
    const a = CA[k] * 3
    const b = CB[k] * 3
    CR[k] = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2])
  }

  // ring pins: 0 pinned, 1 free, 2 returning (spring from `from` to anchor, weight = pin mv)
  const ringMode = new Uint8Array(RINGS.length)
  const ringFrom = new Float32Array(RINGS.length * 3)
  const ringW = new Float32Array(RINGS.length)
  const anchor = (k: number, out: Float32Array, o: number) => {
    out[o] = RING_R
    out[o + 1] = TOP - RINGS[k] * SY
    out[o + 2] = 0
  }
  const anc = new Float32Array(RINGS.length * 3)
  RINGS.forEach((_, k) => anchor(k, anc, k * 3))

  const grab = { i: -1, x: 0, y: 0, z: 0 }
  let time = 0

  const enforce = () => {
    for (let k = 0; k < RINGS.length; k++) {
      const m = ringMode[k]
      if (m === 1) continue
      const i = RINGS[k] * NX * 3
      if (m === 0) {
        pos[i] = anc[k * 3]
        pos[i + 1] = anc[k * 3 + 1]
        pos[i + 2] = anc[k * 3 + 2]
      } else {
        const w = ringW[k]
        pos[i] = ringFrom[k * 3] + (anc[k * 3] - ringFrom[k * 3]) * w
        pos[i + 1] = ringFrom[k * 3 + 1] + (anc[k * 3 + 1] - ringFrom[k * 3 + 1]) * w
        pos[i + 2] = ringFrom[k * 3 + 2] + (anc[k * 3 + 2] - ringFrom[k * 3 + 2]) * w
      }
    }
    if (grab.i >= 0) {
      const i = grab.i * 3
      pos[i] = grab.x
      pos[i + 1] = grab.y
      pos[i + 2] = grab.z
    }
  }

  const step = (wind: number) => {
    time += H
    const t = time
    acc.fill(0)
    for (let i = 1; i < N * 3; i += 3) acc[i] = GRAV
    // wind field: noisy gusts + travelling waves along the fly
    const gust = 1 + 0.32 * Math.sin(t * 0.73) + 0.22 * Math.sin(t * 1.91 + 1.3) + 0.12 * Math.sin(t * 4.3 + 0.4)
    const base = wind * gust
    const inv = 1 / H
    for (let k = 0; k < TR.length; k += 3) {
      const a = TR[k] * 3
      const b = TR[k + 1] * 3
      const c = TR[k + 2] * 3
      const cx = (pos[a] + pos[b] + pos[c]) / 3
      const cy = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3
      const wx = base * (1 + 0.28 * Math.sin(cx * 1.7 - t * 5.3 + cy * 0.6))
      const wy = base * 0.1 * Math.sin(cx * 1.1 - t * 3.1)
      const wz = base * (0.34 * Math.sin(cx * 2.2 + cy * 1.3 - t * 4.2) + 0.12 * Math.sin(t * 2.3 + cy))
      // relative air velocity
      const vx = wx - ((pos[a] - prev[a] + pos[b] - prev[b] + pos[c] - prev[c]) * inv) / 3
      const vy = wy - ((pos[a + 1] - prev[a + 1] + pos[b + 1] - prev[b + 1] + pos[c + 1] - prev[c + 1]) * inv) / 3
      const vz = wz - ((pos[a + 2] - prev[a + 2] + pos[b + 2] - prev[b + 2] + pos[c + 2] - prev[c + 2]) * inv) / 3
      const e1x = pos[b] - pos[a]
      const e1y = pos[b + 1] - pos[a + 1]
      const e1z = pos[b + 2] - pos[a + 2]
      const e2x = pos[c] - pos[a]
      const e2y = pos[c + 1] - pos[a + 1]
      const e2z = pos[c + 2] - pos[a + 2]
      const nx = e1y * e2z - e1z * e2y
      const ny = e1z * e2x - e1x * e2z
      const nz = e1x * e2y - e1y * e2x
      const nl = Math.hypot(nx, ny, nz)
      if (nl < 1e-9) continue
      const s = ((nx * vx + ny * vy + nz * vz) / (2 * nl)) * (DRAG / 3)
      const fx = nx * s
      const fy = ny * s
      const fz = nz * s
      acc[a] += fx
      acc[a + 1] += fy
      acc[a + 2] += fz
      acc[b] += fx
      acc[b + 1] += fy
      acc[b + 2] += fz
      acc[c] += fx
      acc[c + 1] += fy
      acc[c + 2] += fz
    }
    // verlet integrate (unit mass per particle)
    const h2 = H * H
    for (let i = 0; i < N * 3; i += 3) {
      for (let j = 0; j < 3; j++) {
        const p = pos[i + j]
        const v = (p - prev[i + j]) * 0.993
        prev[i + j] = p
        pos[i + j] = p + v + acc[i + j] * h2
      }
    }
    enforce()
    // relax constraints
    for (let it = 0; it < ITER; it++) {
      for (let k = 0; k < CA.length; k++) {
        const a = CA[k] * 3
        const b = CB[k] * 3
        const dx = pos[b] - pos[a]
        const dy = pos[b + 1] - pos[a + 1]
        const dz = pos[b + 2] - pos[a + 2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < 1e-9) continue
        const diff = ((d - CR[k]) / d) * 0.5 * CK[k]
        pos[a] += dx * diff
        pos[a + 1] += dy * diff
        pos[a + 2] += dz * diff
        pos[b] -= dx * diff
        pos[b + 1] -= dy * diff
        pos[b + 2] -= dz * diff
      }
      enforce()
    }
    // collisions: ground + pole
    const R2 = (POLE_R + 0.02) ** 2
    for (let i = 0; i < N * 3; i += 3) {
      if (pos[i + 1] < GROUND + 0.02) {
        pos[i + 1] = GROUND + 0.02
        prev[i] = pos[i] - (pos[i] - prev[i]) * 0.6
        prev[i + 2] = pos[i + 2] - (pos[i + 2] - prev[i + 2]) * 0.6
      }
      const x = pos[i]
      const z = pos[i + 2]
      const d2 = x * x + z * z
      if (d2 < R2 && pos[i + 1] < POLE_TOP) {
        const d = Math.sqrt(d2) || 1e-4
        const k = Math.sqrt(R2) / d
        pos[i] = d2 > 0 ? x * k : Math.sqrt(R2)
        pos[i + 2] = z * k
      }
    }
  }

  return { pos, prev, grab, ringMode, ringFrom, ringW, anc, step, enforce, TR }
}

/* ------------------------------------------------------------------ scene */

type Ctl = {
  sim: Sim
  wind: MotionValue<number>
  ringPin: MotionValue<number>[]
  ringVis: MotionValue<number>[]
  px: number
  py: number
  lastUser: number
  dragging: boolean
}

function Cloth({ ctl, onRingClick }: { ctl: Ctl; onRingClick: (k: number) => void }) {
  const { sim } = ctl
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(FW, FH, NX - 1, NY - 1)
    const p = g.attributes.position as THREE.BufferAttribute
    p.setUsage(THREE.DynamicDrawUsage)
    p.array.set(sim.pos)
    p.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [sim])
  const mats = useMemo(() => {
    const common = { roughness: 0.78, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffffff') }
    const front = new THREE.MeshPhysicalMaterial({ ...common, map: bannerTexture(false), side: THREE.FrontSide })
    front.shadowSide = THREE.DoubleSide
    const back = new THREE.MeshPhysicalMaterial({ ...common, map: bannerTexture(true), side: THREE.BackSide })
    return { front, back }
  }, [])
  const st = useMemo(
    () => ({
      acc: 0,
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(),
      ndc: new THREE.Vector2(),
      hit: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      target: new THREE.Vector3(),
      hover: false,
      grabbed: false,
    }),
    [],
  )
  const ringRefs = useRef<(THREE.Group | null)[]>([])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    st.acc += dt
    const wind = ctl.wind.get()
    for (let k = 0; k < RINGS.length; k++) sim.ringW[k] = ctl.ringPin[k].get()
    // grabbed particle follows the pointer on a camera-facing plane (smoothed)
    if (st.grabbed) {
      st.ray.setFromCamera(st.ndc, camera)
      if (st.ray.ray.intersectPlane(st.plane, st.hit)) {
        st.hit.y = Math.max(st.hit.y, GROUND + 0.05)
        st.target.lerp(st.hit, 1 - Math.exp(-dt * 24))
        sim.grab.x = st.target.x
        sim.grab.y = st.target.y
        sim.grab.z = st.target.z
      }
    }
    let n = 0
    while (st.acc >= H && n < 5) {
      sim.step(wind)
      st.acc -= H
      n++
    }
    if (n === 5) st.acc = 0
    const p = geo.attributes.position as THREE.BufferAttribute
    ;(p.array as Float32Array).set(sim.pos)
    p.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    for (let k = 0; k < RINGS.length; k++) {
      const g = ringRefs.current[k]
      if (!g) continue
      const v = ctl.ringVis[k].get()
      g.scale.setScalar(Math.max(0.0001, v))
      g.rotation.z = (1 - Math.min(1, v)) * 0.9
    }
  })

  const toNdc = (cx: number, cy: number) => {
    const r = gl.domElement.getBoundingClientRect()
    st.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (st.grabbed) toNdc(e.clientX, e.clientY)
    }
    const up = () => {
      if (!st.grabbed) return
      st.grabbed = false
      sim.grab.i = -1
      ctl.dragging = false
      ctl.lastUser = performance.now()
      document.body.style.cursor = st.hover ? 'grab' : ''
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
  }, [])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    // nearest particle of the hit triangle
    const f = e.face
    let best = -1
    let bd = Infinity
    for (const i of f ? [f.a, f.b, f.c] : []) {
      const d = (sim.pos[i * 3] - e.point.x) ** 2 + (sim.pos[i * 3 + 1] - e.point.y) ** 2 + (sim.pos[i * 3 + 2] - e.point.z) ** 2
      if (d < bd) {
        bd = d
        best = i
      }
    }
    if (best < 0) return
    st.grabbed = true
    ctl.dragging = true
    ctl.lastUser = performance.now()
    sim.grab.i = best
    st.target.set(sim.pos[best * 3], sim.pos[best * 3 + 1], sim.pos[best * 3 + 2])
    sim.grab.x = st.target.x
    sim.grab.y = st.target.y
    sim.grab.z = st.target.z
    camera.getWorldDirection(st.tmp)
    st.plane.setFromNormalAndCoplanarPoint(st.tmp, st.target)
    toNdc(e.nativeEvent.clientX, e.nativeEvent.clientY)
    document.body.style.cursor = 'grabbing'
  }

  return (
    <>
      <mesh
        geometry={geo}
        material={mats.front}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerDown={onDown}
        onPointerOver={() => {
          st.hover = true
          if (!st.grabbed) document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          st.hover = false
          if (!st.grabbed) document.body.style.cursor = ''
        }}
      />
      <mesh geometry={geo} material={mats.back} receiveShadow frustumCulled={false} raycast={() => null} />
      {RINGS.map((r, k) => (
        <group key={k} position={[0, TOP - r * SY, 0]}>
          <group ref={(g) => void (ringRefs.current[k] = g)}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <torusGeometry args={[RING_R, 0.016, 10, 28]} />
              <meshStandardMaterial color="#f4b63f" roughness={0.35} metalness={0.3} />
            </mesh>
          </group>
          {/* generous invisible hit target: click a ring to snip / re-hang it */}
          <mesh
            visible={false}
            onPointerDown={(e) => {
              if (POSTER) return
              e.stopPropagation()
              onRingClick(k)
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <sphereGeometry args={[0.2, 12, 8]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

function Pole() {
  return (
    <group>
      <mesh position={[0, (GROUND + POLE_TOP) / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[POLE_R, POLE_R * 1.15, POLE_TOP - GROUND, 24]} />
        <meshStandardMaterial color={NAVY} roughness={0.38} metalness={0.15} />
      </mesh>
      <mesh position={[0, POLE_TOP + 0.08, 0]} castShadow>
        <sphereGeometry args={[0.11, 24, 16]} />
        <meshStandardMaterial color="#f4b63f" roughness={0.3} metalness={0.35} />
      </mesh>
      <mesh position={[0, GROUND + 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.68, 0.18, 48]} />
        <meshStandardMaterial color="#e1e5ea" roughness={0.85} />
      </mesh>
      <mesh position={[0, GROUND + 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.42, 0.14, 40]} />
        <meshStandardMaterial color="#ccd3db" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Ground() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(214,222,230,0.95)')
    g.addColorStop(0.55, 'rgba(222,229,236,0.6)')
    g.addColorStop(1, 'rgba(230,236,242,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <group position={[0, GROUND, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[1.6, 0.4, 0]} scale={[1.6, 1, 1]}>
        <circleGeometry args={[5.2, 64]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <shadowMaterial opacity={0.16} color="#33415a" />
      </mesh>
    </group>
  )
}

/** horizontal streaks that travel with the wind */
function WindStreaks({ wind }: { wind: MotionValue<number> }) {
  const COUNT = 30
  const { geo, mat } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.attributes.position)
    g.setAttribute('uv', base.attributes.uv)
    const off = new Float32Array(COUNT * 4)
    let s = 3
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647
    for (let i = 0; i < COUNT; i++) {
      off[i * 4] = r() * 16
      off[i * 4 + 1] = -2.2 + r() * 5.4
      off[i * 4 + 2] = -4.5 + r() * 3.8
      off[i * 4 + 3] = 0.6 + r() * 0.9
    }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4))
    g.instanceCount = COUNT
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTravel: { value: 0 }, uAmt: { value: 0 }, uColor: { value: new THREE.Color('#8ea3bd') } },
      vertexShader: /* glsl */ `
        attribute vec4 aOff;
        uniform float uTravel;
        uniform float uAmt;
        varying float vA;
        varying vec2 vUv;
        void main() {
          float span = 16.0;
          float x = mod(aOff.x + uTravel * aOff.w, span);
          vA = smoothstep(0.0, 3.0, x) * smoothstep(span, span - 4.0, x);
          vec3 p = vec3(x - 6.0, aOff.y + sin(uTravel * 0.7 + aOff.x) * 0.08, aOff.z);
          float len = (0.4 + uAmt * 1.4) * aOff.w;
          p.x += position.x * len;
          p.y += position.y * 0.014;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAmt;
        varying float vA;
        varying vec2 vUv;
        void main() {
          float a = vA * uAmt * 0.38 * smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
          gl_FragColor = vec4(uColor, a);
        }`,
    })
    return { geo: g, mat: m }
  }, [])
  const travel = useRef(0)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const w = wind.get()
    travel.current += dt * (0.4 + w * 0.55)
    mat.uniforms.uTravel.value = travel.current
    mat.uniforms.uAmt.value = Math.min(1, w / 9)
  })
  return <mesh geometry={geo} material={mat} frustumCulled={false} raycast={() => null} />
}

function Lights() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff7ee', 2.4)
    l.position.set(-3.5, 6.5, 7)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = -6
    cam.right = 8
    cam.top = 6
    cam.bottom = -6
    cam.near = 1
    cam.far = 30
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.035
    l.shadow.radius = 4
    l.target.position.set(1.8, -0.5, 0)
    return l
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9d3de', 1.15]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 2, -5]} intensity={0.8} color="#dfe8ff" />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

function Rig({ ctl }: { ctl: Ctl }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  const st = useMemo(() => ({ yaw: 0.32, pitch: 0.06, target: new THREE.Vector3(1.75, -0.05, 0) }), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const mobile = width < 760
    const yawT = 0.32 + (POSTER || ctl.dragging ? 0 : ctl.px * 0.1)
    const pitchT = 0.06 + (POSTER || ctl.dragging ? 0 : ctl.py * 0.05)
    st.yaw = THREE.MathUtils.damp(st.yaw, yawT, 3, dt)
    st.pitch = THREE.MathUtils.damp(st.pitch, pitchT, 3, dt)
    const aspect = width / height
    const portrait = 1 / Math.min(1, aspect * (mobile ? 1.3 : 1.3))
    const d = 11.6 * portrait
    const cp = Math.cos(st.pitch)
    camera.position.set(st.target.x + d * cp * Math.sin(st.yaw), st.target.y + d * Math.sin(st.pitch), st.target.z + d * cp * Math.cos(st.yaw))
    camera.lookAt(st.target)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.17 : 0
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ page */

const WINDS: { value: Wind; label: string }[] = [
  { value: 'calm', label: '无风' },
  { value: 'breeze', label: '微风' },
  { value: 'gale', label: '强风' },
]

export default function ClothBanner() {
  const [wind, setWind] = useState<Wind>(POSTER ? 'breeze' : 'breeze')
  const [pinned, setPinned] = useState<boolean[]>(RINGS.map(() => true))
  const ctl = useMemo<Ctl>(
    () => ({
      sim: makeSim(),
      wind: motionValue(WIND_SPEED.breeze),
      ringPin: RINGS.map(() => motionValue(1)),
      ringVis: RINGS.map(() => motionValue(1)),
      px: 0,
      py: 0,
      lastUser: -1e9,
      dragging: false,
    }),
    [],
  )
  const windText = useTransform(ctl.wind, (v) => v.toFixed(1))
  const anims = useRef<AnimationPlaybackControls[]>([])
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned

  // pre-roll the cloth so the first frame already shows a flag in the wind
  useMemo(() => {
    for (let i = 0; i < 360; i++) ctl.sim.step(WIND_SPEED.breeze)
  }, [ctl])

  const setRing = (k: number, on: boolean, delay = 0) => {
    const sim = ctl.sim
    if (!on) {
      if (sim.ringMode[k] === 1) return
      sim.ringMode[k] = 1
      anims.current.push(animate(ctl.ringVis[k], 0, { duration: 0.22, ease: [0.4, 0, 1, 1], delay }))
    } else {
      if (sim.ringMode[k] === 0) return
      const i = RINGS[k] * NX * 3
      // spring the loose corner back from wherever it is now
      const startIt = () => {
        sim.ringFrom[k * 3] = sim.pos[i]
        sim.ringFrom[k * 3 + 1] = sim.pos[i + 1]
        sim.ringFrom[k * 3 + 2] = sim.pos[i + 2]
        ctl.ringPin[k].jump(0)
        sim.ringW[k] = 0
        sim.ringMode[k] = 2
        const a = animate(ctl.ringPin[k], 1, { type: 'spring', stiffness: 70, damping: 9, restDelta: 0.002 })
        anims.current.push(a)
        a.finished.then(() => {
          if (sim.ringMode[k] === 2) sim.ringMode[k] = 0
        })
      }
      if (delay) setTimeout(startIt, delay * 1000)
      else startIt()
      anims.current.push(animate(ctl.ringVis[k], 1, { type: 'spring', stiffness: 420, damping: 14, delay: delay + 0.35 }))
    }
    setPinned((p) => p.map((v, j) => (j === k ? on : v)))
  }

  const cutCorner = () => {
    const free = pinnedRef.current
    const lower = [RINGS.length - 1, RINGS.length - 2].filter((k) => free[k])
    lower.forEach((k, n) => setRing(k, false, n * 0.28))
  }
  const rehang = () => {
    let n = 0
    for (let k = 0; k < RINGS.length; k++) if (!pinnedRef.current[k]) setRing(k, true, n++ * 0.18)
  }
  const user = () => (ctl.lastUser = performance.now())

  // ambient loop: snip the corner every so often, then re-hang it
  useEffect(() => {
    if (POSTER) return
    let cutAt = performance.now() - 7000
    const id = window.setInterval(() => {
      const idle = performance.now() - ctl.lastUser > 9000
      const anyCut = pinnedRef.current.some((v) => !v)
      const now = performance.now()
      if (!idle || ctl.dragging) return
      if (!anyCut && now - cutAt > 13000) {
        cutAt = now
        cutCorner()
      } else if (anyCut && now - cutAt > 6500) {
        cutAt = now - 1000
        rehang()
      }
    }, 500)
    return () => {
      window.clearInterval(id)
      anims.current.forEach((a) => a.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      ctl.px = (e.clientX / window.innerWidth) * 2 - 1
      ctl.py = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [ctl])

  const pickWind = (w: Wind) => {
    user()
    setWind(w)
    anims.current.push(animate(ctl.wind, WIND_SPEED[w], { duration: 1.8, ease: [0.45, 0, 0.2, 1] }))
  }

  const held = pinned.filter(Boolean).length
  const anyCut = held < RINGS.length

  return (
    <div className="stage cloth-stage">
      <style>{`
        .cloth-stage { background: linear-gradient(180deg, #dfe8f2 0%, #eaf0f5 46%, #f3f2ee 72%, #eceae4 100%); touch-action: none; }
        .cloth-stage .scrim { --soft-bg: #eef2f6; }
        .cloth-stage .hero-copy h1 em { color: ${CORAL}; }
        .cloth-sun { position: absolute; right: 12%; top: 11%; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,247,232,0.95), rgba(255,236,214,0.35) 55%, transparent); pointer-events: none; }
        .cloth-cloud { position: absolute; border-radius: 999px; background: rgba(255,255,255,0.7); filter: blur(18px); pointer-events: none; }
        .cloth-stat { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-top: 22px !important; font: 500 12px/1 var(--mono) !important; letter-spacing: .04em; color: var(--fg-2); }
        .cloth-stat span { display: inline-flex; align-items: center; gap: 8px; }
        .cloth-rings { display: inline-flex; gap: 4px; }
        .cloth-rings i { width: 8px; height: 8px; border-radius: 50%; box-shadow: inset 0 0 0 2px #f4b63f; transition: background .25s; }
        .cloth-rings i.on { background: #f4b63f; }
        @media (max-width: 760px) {
          .cloth-stage .hero-copy p:not(.kicker):not(.cloth-stat) { font-size: 14px; line-height: 1.65; }
          .cloth-stage .hero-actions { display: none; }
          .cloth-sun { right: -40px; top: 60px; width: 200px; height: 200px; }
        }
      `}</style>
      <div className="cloth-sun" />
      <motion.div
        className="cloth-cloud"
        style={{ width: 340, height: 70, left: '48%', top: '14%' }}
        animate={{ x: [0, 60, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="cloth-cloud"
        style={{ width: 220, height: 50, left: '70%', top: '30%' }}
        animate={{ x: [0, -40, 0] }}
        transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, near: 0.1, far: 100, position: [4, 0, 11] }} gl={{ antialias: true, alpha: true }}>
        <Rig ctl={ctl} />
        <Lights />
        <Pole />
        <Ground />
        <WindStreaks wind={ctl.wind} />
        <Cloth
          ctl={ctl}
          onRingClick={(k) => {
            user()
            setRing(k, !pinnedRef.current[k])
          }}
        />
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
            <i /> Verlet cloth · 1,040 particles
          </p>
          <h1>
            让品牌
            <br />
            <em>迎风</em>招展
          </h1>
          <p>40×26 个质点、约 6,000 条约束，每个固定步长松弛 5 轮；风是带阵风的噪声场。按住旗面能把它拽起来甩，剪断下面的挂环，它就只剩一角在风里乱舞。</p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                user()
                if (anyCut) rehang()
                else cutCorner()
              }}
            >
              {anyCut ? '重新挂好' : '剪断一角'}
            </button>
            <button className="btn" onClick={() => pickWind(wind === 'gale' ? 'breeze' : 'gale')}>
              {wind === 'gale' ? '风小一点' : '来阵强风'}
            </button>
          </div>
          <p className="cloth-stat">
            <span>
              风速 <motion.b style={{ fontWeight: 600, color: 'var(--fg)' }}>{windText}</motion.b> m/s
            </span>
            <span>
              挂环
              <span className="cloth-rings">
                {pinned.map((v, k) => (
                  <i key={k} className={v ? 'on' : ''} />
                ))}
              </span>
              {held}/{RINGS.length}
            </span>
          </p>
        </motion.div>

        <div className="dock">
          <Seg items={WINDS} value={wind} onChange={pickWind} />
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              user()
              cutCorner()
            }}
            disabled={!pinned[RINGS.length - 1] && !pinned[RINGS.length - 2]}
            style={{ opacity: !pinned[RINGS.length - 1] && !pinned[RINGS.length - 2] ? 0.45 : 1 }}
          >
            <span>剪断一角</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              rehang()
            }}
            disabled={!anyCut}
            style={{ opacity: anyCut ? 1 : 0.45 }}
          >
            <span>重新挂好</span>
          </button>
        </div>
        <p className="hint">按住旗面拖拽 · 点击金色挂环可单独剪断 / 挂回</p>
      </div>
    </div>
  )
}
