import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'

const VS = 0.23 // voxel pitch (world units)

/* ------------------------------------------------------------------ shapes (voxel units, bottom at y = 0) */

type V = [number, number, number]
type ShapeDef = {
  key: string
  zh: string
  en: string
  aside: string
  build: () => V[]
  paint: (v: V, h: number, rnd: number) => string
}

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grid(n: number, test: (x: number, y: number, z: number) => boolean): V[] {
  const out: V[] = []
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) if (test(x, y, z)) out.push([x, y, z])
  return out
}

const grad = (stops: string[]) => {
  const cs = stops.map((s) => new THREE.Color(s))
  const c = new THREE.Color()
  return (t: number) => {
    const f = THREE.MathUtils.clamp(t, 0, 0.9999) * (cs.length - 1)
    const i = Math.floor(f)
    return '#' + c.copy(cs[i]).lerp(cs[i + 1], f - i).getHexString()
  }
}

const sphereG = grad(['#e8553a', '#ff8a5c', '#ffc39b', '#fff0e2'])
const heartG = grad(['#a3173f', '#e23d64', '#ff8fae'])
const monoG = grad(['#2e2c6e', '#4f4cc9', '#8f8cff'])
const sprinkles = ['#fff6dc', '#4fb7f0', '#ffcf4d', '#6fd39c']

const SHAPES: ShapeDef[] = [
  {
    key: 'sphere',
    zh: '球体',
    en: 'Voxel Sphere',
    aside: 'r = 8.8',
    build: () => grid(10, (x, y, z) => x * x + y * y + z * z <= 8.8 * 8.8),
    paint: (_v, h, r) => sphereG(h * 0.92 + r * 0.08),
  },
  {
    key: 'donut',
    zh: '甜甜圈',
    en: 'Glazed Torus',
    aside: 'R 8.4 · r 3.5',
    build: () => {
      const a = -0.9 // lean toward the camera so the hole reads
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      return grid(13, (x, y, z) => {
        const ry = y * ca - z * sa
        const rz = y * sa + z * ca
        const q = Math.hypot(x, rz) - 8.4
        return q * q + ry * ry <= 3.5 * 3.5
      })
    },
    paint: (v, _h, r) => {
      // glaze on the top cap of the tube (with drips), dough on the rims; sprinkles on the glaze
      const a = -0.9
      const ry = v[1] * Math.cos(a) - v[2] * Math.sin(a)
      const rz = v[1] * Math.sin(a) + v[2] * Math.cos(a)
      const q = Math.hypot(v[0], rz) - 8.4
      const phi = Math.atan2(ry, q) / Math.PI // 0 = outer rim, 0.5 = top, 1 = inner rim
      const drip = (Math.sin(Math.atan2(rz, v[0]) * 9) * 0.5 + 0.5) * 0.14
      if (phi > 0.16 - drip && phi < 0.9 + drip * 0.5) return r > 0.93 ? sprinkles[Math.floor(r * 1000) % 4] : r > 0.5 ? '#ff7aa6' : '#ff8db3'
      return r > 0.5 ? '#d99a5b' : '#e5ad70'
    },
  },
  {
    key: 'heart',
    zh: '心形',
    en: 'Implicit Heart',
    aside: '(x²+9/4z²+y²−1)³ = x²y³',
    build: () => {
      const s = 1 / 9.5
      return grid(13, (x, y, z) => {
        const X = x * s
        const Y = y * s + 0.08
        const Z = z * s * 1.15
        const a = X * X + (9 / 4) * Z * Z + Y * Y - 1
        return a * a * a - X * X * Y * Y * Y - (9 / 80) * Z * Z * Y * Y * Y <= 0
      })
    },
    paint: (_v, h, r) => heartG(h * 0.9 + r * 0.1),
  },
  {
    key: 'ziggurat',
    zh: '阶梯塔',
    en: 'Stepped Ziggurat',
    aside: '4 tiers · 3 high',
    build: () => {
      const out: V[] = []
      const tiers = [9, 7, 5, 3]
      tiers.forEach((half, ti) => {
        for (let y = ti * 3; y < ti * 3 + 3; y++)
          for (let x = -half; x <= half; x++) for (let z = -half; z <= half; z++) {
            // carve a staircase into the front face
            if (z > half - 2 && Math.abs(x) <= 1 && y >= ti * 3 + 1 && ti < 3) continue
            out.push([x, y, z])
          }
      })
      // shrine on top: four pillars + roof
      for (let y = 12; y < 15; y++) for (const x of [-2, 2]) for (const z of [-2, 2]) out.push([x, y, z])
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) out.push([x, 15, z])
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) out.push([x, 16, z])
      return out
    },
    paint: (v, _h, r) => {
      if (v[1] >= 12) return v[1] >= 15 ? '#2f8f83' : '#e9e1d2'
      const tier = Math.floor(v[1] / 3)
      const top = v[1] % 3 === 2
      const base = ['#c9a57a', '#d6b68d', '#e2c8a3', '#eddcbf'][tier]
      return top ? '#f6ecd9' : r > 0.85 ? '#bf9a6e' : base
    },
  },
  {
    key: 'mono',
    zh: '字母 M',
    en: 'Monogram',
    aside: 'extruded · 6 deep',
    build: () => {
      const out: V[] = []
      const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const dx = bx - ax
        const dy = by - ay
        const t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        return Math.hypot(px - ax - dx * t, py - ay - dy * t)
      }
      for (let u = 0; u < 24; u++)
        for (let v = 0; v < 20; v++) {
          const cx = u + 0.5
          const cy = v + 0.5
          const leg = cx < 4.5 || cx > 19.5
          const diag = seg(cx, cy, 2.5, 18.2, 12, 6.5) < 2.2 || seg(cx, cy, 21.5, 18.2, 12, 6.5) < 2.2
          if (!leg && !diag) continue
          for (let z = -3; z < 3; z++) out.push([u - 11.5, v, z + 0.5])
        }
      return out
    },
    paint: (v, h, r) => (v[2] > 2 ? monoG(0.85 + r * 0.15) : monoG(h * 0.8 + r * 0.08)),
  },
]

type Built = { pos: Float32Array; col: Float32Array; vis: Uint8Array; count: number }

/** Lay out every shape on the same N slots: slot s gets the voxel at the same height-rank fraction. */
function buildAll(): { N: number; shapes: Built[] } {
  const raw = SHAPES.map((s, si) => {
    const r = rng(17 + si * 101)
    let vs = s.build()
    let minY = Infinity
    let maxY = -Infinity
    for (const v of vs) (minY = Math.min(minY, v[1])), (maxY = Math.max(maxY, v[1]))
    const span = Math.max(1, maxY - minY)
    // o = original coords (for painting), v = resting on the floor
    const keyed = vs.map((o) => ({ o, v: [o[0], o[1] - minY, o[2]] as V, k: o[1] + r() * 0.95, rnd: r() }))
    keyed.sort((a, b) => a.k - b.k)
    return { keyed, span, def: s }
  })
  const N = Math.max(...raw.map((r) => r.keyed.length))
  const c = new THREE.Color()
  const shapes = raw.map(({ keyed, span, def }) => {
    const n = keyed.length
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const vis = new Uint8Array(N)
    for (let s = 0; s < N; s++) {
      // nearest voxel by rank — hidden slots park on (and grow out of) a real voxel
      const j = Math.min(n - 1, Math.floor(((s + 0.5) * n) / N))
      const { v, o, rnd } = keyed[j]
      pos[s * 3] = v[0] * VS
      pos[s * 3 + 1] = (v[1] + 0.5) * VS
      pos[s * 3 + 2] = v[2] * VS
      c.set(def.paint(o, v[1] / span, rnd))
      col[s * 3] = c.r
      col[s * 3 + 1] = c.g
      col[s * 3 + 2] = c.b
    }
    for (let j = 0; j < n; j++) vis[Math.min(N - 1, Math.floor(((j + 0.5) * N) / n))] = 1
    return { pos, col, vis, count: n }
  })
  return { N, shapes }
}

/* ------------------------------------------------------------------ voxels */

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function Voxels({ target, busy }: { target: number; busy: React.MutableRefObject<boolean> }) {
  const data = useMemo(buildAll, [])
  const N = data.N
  const mesh = useRef<THREE.InstancedMesh>(null)
  const group = useRef<THREE.Group>(null)
  const scale = usePortraitScale(1.4)

  const geo = useMemo(() => new RoundedBoxGeometry(VS * 0.86, VS * 0.86, VS * 0.86, 2, VS * 0.14), [])
  useEffect(() => () => geo.dispose(), [geo])

  const sim = useMemo(() => {
    const r = rng(7)
    const axis = new Float32Array(N * 3)
    const v = new THREE.Vector3()
    const rand = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      v.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      axis.set([v.x, v.y, v.z], i * 3)
      rand[i] = r()
    }
    const s0 = data.shapes[0]
    return {
      axis,
      rand,
      fromP: new Float32Array(s0.pos),
      toP: new Float32Array(s0.pos),
      curP: new Float32Array(s0.pos),
      fromC: new Float32Array(s0.col),
      toC: new Float32Array(s0.col),
      curC: new Float32Array(s0.col),
      fromS: Float32Array.from(s0.vis),
      toS: Float32Array.from(s0.vis),
      curS: Float32Array.from(s0.vis),
      fromQ: new Float32Array(N * 4).fill(0).map((_, i) => (i % 4 === 3 ? 1 : 0)),
      curQ: new Float32Array(N * 4).fill(0).map((_, i) => (i % 4 === 3 ? 1 : 0)),
      delay: new Float32Array(N),
      dur: new Float32Array(N),
      lift: new Float32Array(N),
      spin: new Float32Array(N),
      t: 0,
      start: -1,
      end: 0,
      dirty: true,
    }
  }, [data, N])

  // kick off a transition whenever the target changes (interruptible: starts from the current pose)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const s = sim
    const tgt = data.shapes[target]
    s.fromP.set(s.curP)
    s.fromC.set(s.curC)
    s.fromS.set(s.curS)
    s.fromQ.set(s.curQ)
    s.toP.set(tgt.pos)
    s.toC.set(tgt.col)
    for (let i = 0; i < N; i++) s.toS[i] = tgt.vis[i]
    let end = 0
    for (let i = 0; i < N; i++) {
      const rk = i / N // slots are height-ranked: the base leaves first and lands first
      const r = s.rand[i]
      s.delay[i] = rk * 0.95 + r * 0.4
      s.dur[i] = 1.05 + ((r * 7.31) % 1) * 0.35
      s.lift[i] = 0.6 + ((r * 13.7) % 1) * 1.4 + rk * 0.6
      s.spin[i] = 1 + Math.floor(((r * 3.7) % 1) * 2)
      end = Math.max(end, s.delay[i] + s.dur[i])
    }
    s.start = s.t
    s.end = s.t + end + 0.05
    busy.current = true
  }, [target, data, sim, N, busy])

  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q0: new THREE.Quaternion(),
      qs: new THREE.Quaternion(),
      ax: new THREE.Vector3(),
      sc: new THREE.Vector3(),
      c: new THREE.Color(),
      id: new THREE.Quaternion(),
    }),
    [],
  )

  // initial pose + colours
  useEffect(() => {
    const m = mesh.current
    if (!m) return
    for (let i = 0; i < N; i++) {
      tmp.sc.setScalar(sim.curS[i] ? 1 : 0)
      tmp.p.fromArray(sim.curP, i * 3)
      m.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.id, tmp.sc))
      m.setColorAt(i, tmp.c.fromArray(sim.curC, i * 3))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [N, sim, tmp])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = sim
    s.t += dt
    const g = group.current
    if (g) {
      g.rotation.y = Math.sin(s.t * 0.32) * 0.5 + state.pointer.x * 0.3
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -state.pointer.y * 0.12, 3, dt)
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, -state.pointer.x * 0.08, 3, dt)
      g.position.x = THREE.MathUtils.damp(g.position.x, state.pointer.x * 0.25, 3, dt)
    }
    const m = mesh.current
    if (!m || s.start < 0) return

    const el = s.t - s.start
    const done = s.t >= s.end
    for (let i = 0; i < N; i++) {
      const i3 = i * 3
      const i4 = i * 4
      let k = (el - s.delay[i]) / s.dur[i]
      k = k < 0 ? 0 : k > 1 ? 1 : k
      if (done) k = 1
      const e = easeInOut(k) + 0.07 * Math.sin(Math.PI * THREE.MathUtils.clamp((k - 0.72) / 0.28, 0, 1)) // tiny overshoot on landing
      const arc = Math.sin(Math.PI * k) * s.lift[i]
      // position: straight lerp + vertical arc
      const px = s.fromP[i3] + (s.toP[i3] - s.fromP[i3]) * e
      const py = s.fromP[i3 + 1] + (s.toP[i3 + 1] - s.fromP[i3 + 1]) * e + arc
      const pz = s.fromP[i3 + 2] + (s.toP[i3 + 2] - s.fromP[i3 + 2]) * e
      s.curP[i3] = k >= 1 ? s.toP[i3] : px
      s.curP[i3 + 1] = k >= 1 ? s.toP[i3 + 1] : py
      s.curP[i3 + 2] = k >= 1 ? s.toP[i3 + 2] : pz
      // scale: grow / shrink for slots that appear or vanish, plus a landing pop
      const a = s.fromS[i]
      const b = s.toS[i]
      let sc = a + (b - a) * THREE.MathUtils.smoothstep(k, b > a ? 0 : 0.35, b > a ? 0.55 : 0.9)
      sc *= 1 + 0.22 * Math.sin(Math.PI * THREE.MathUtils.clamp((k - 0.8) / 0.2, 0, 1)) * b
      s.curS[i] = k >= 1 ? b : sc
      // rotation: unwind the start pose while tumbling whole turns about a random axis
      tmp.q0.fromArray(s.fromQ, i4)
      tmp.q.copy(tmp.q0).slerp(tmp.id, Math.min(e, 1))
      tmp.ax.fromArray(s.axis, i3)
      tmp.qs.setFromAxisAngle(tmp.ax, Math.PI * 2 * s.spin[i] * e)
      tmp.q.multiply(tmp.qs)
      if (k >= 1) tmp.q.identity()
      tmp.q.toArray(s.curQ, i4)
      // colour
      const ck = THREE.MathUtils.smoothstep(k, 0.25, 0.85)
      s.curC[i3] = s.fromC[i3] + (s.toC[i3] - s.fromC[i3]) * ck
      s.curC[i3 + 1] = s.fromC[i3 + 1] + (s.toC[i3 + 1] - s.fromC[i3 + 1]) * ck
      s.curC[i3 + 2] = s.fromC[i3 + 2] + (s.toC[i3 + 2] - s.fromC[i3 + 2]) * ck

      tmp.p.set(s.curP[i3], s.curP[i3 + 1], s.curP[i3 + 2])
      tmp.sc.setScalar(Math.max(s.curS[i], 1e-4))
      m.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.sc))
      m.setColorAt(i, tmp.c.setRGB(s.curC[i3], s.curC[i3 + 1], s.curC[i3 + 2]))
    }
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    if (done) {
      s.start = -1
      busy.current = false
    }
  })

  return (
    <group scale={scale}>
      <group ref={group}>
        <instancedMesh ref={mesh} args={[geo, undefined, N]} castShadow receiveShadow frustumCulled={false}>
          <meshStandardMaterial roughness={0.48} metalness={0} envMapIntensity={0.55} />
        </instancedMesh>
      </group>
    </group>
  )
}

/** look slightly lower on portrait screens so the (scaled-down) shape sits above the label */
function Aim() {
  const camera = useThree((s) => s.camera)
  const { width, height } = useThree((s) => s.size)
  useEffect(() => {
    const portrait = width / height < 0.8
    camera.lookAt(0, portrait ? 0.75 : 2.05, 0)
  }, [camera, width, height])
  return null
}

/* ------------------------------------------------------------------ page */

export default function VoxelRebuild() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const busy = useRef(false)
  const counts = useMemo(() => buildAll().shapes.map((s) => s.count), [])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      if (!busy.current) setIdx((i) => (i + 1) % SHAPES.length)
    }, 5200)
    return () => clearInterval(id)
  }, [auto])

  const shape = SHAPES[idx]

  return (
    <div className="stage" style={{ background: 'radial-gradient(90% 75% at 55% 40%, #fbf8f3 0%, #f3eee6 55%, #e9e1d5 100%)' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 3.9, 14.6], fov: 32 }}
        gl={{ antialias: true, alpha: true }}
      >
        <Aim />
        <ambientLight intensity={0.35} color="#fff4ea" />
        <hemisphereLight args={['#fff8f0', '#d8b8a0', 0.85]} />
        <directionalLight
          position={[-5, 9, 6]}
          intensity={2.1}
          color="#fff3e4"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0006}
          shadow-normalBias={0.06}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={6}
          shadow-camera-bottom={-3}
          shadow-camera-near={1}
          shadow-camera-far={30}
        />
        <directionalLight position={[6, 3, -4]} intensity={0.6} color="#ffd9c2" />
        <Environment resolution={128} frames={1}>
          <Lightformer form="rect" intensity={2.4} color="#fff1e0" position={[-4, 5, 4]} scale={[6, 4, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.2} color="#ffd7c4" position={[5, 2, 3]} scale={[4, 6, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={0.8} color="#ffffff" position={[0, 6, -6]} scale={4} target={[0, 0, 0]} />
        </Environment>
        <Voxels target={idx} busy={busy} />
        <ContactShadows position={[0, -0.005, 0]} scale={14} blur={2.6} far={5} opacity={0.42} resolution={512} color="#6b4630" />
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={shape.key}
          meta={`${String(idx + 1).padStart(2, '0')} / ${String(SHAPES.length).padStart(2, '0')} · ${counts[idx].toLocaleString()} voxels`}
          title={shape.zh}
          sub={shape.en}
          aside={shape.aside}
        />
        <div className="dock">
          <Seg
            items={SHAPES.map((s, i) => ({ value: i, label: s.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '播放'}</span>
          </button>
        </div>
        <p className="hint">
          方块按高度依次起飞、翻滚、落位
          <br />
          移动指针倾斜视角
        </p>
      </div>
    </div>
  )
}
