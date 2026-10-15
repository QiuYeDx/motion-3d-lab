import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { createSandEffect, pourSand, sandMeta, sandModes, sandProgress, sandTable, setSandMode, setSandSize, settleSand, smearSand, type SandMode } from './effects/sand'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 沙画 showcase — a three-act sand-art story on a light table:
 *   一 守夜的灯塔: a striped lighthouse on a cliff, its beam sweeping over rolling waves, birds under the moon
 *   二 月亮下的母子: a mother on a hill holds her child, who reaches up for a huge moon; a shooting star
 *   三 一棵树长大了: a sapling grows branch by branch into a full tree; birds take off from it
 * The scene is a layered diorama (flat silhouettes at different depths, so the depth edges become the finger
 * lines and dragging gives parallax). Between acts the effect's `smearSand` wipes the table with a palm and the
 * next act is poured in (`pourSand` runs on its own after the smear); a DOM hand follows the palm / pour.
 * Effect: ./effects/sand.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const ACTS = [
  { no: '第一幕', name: '守夜的灯塔', line: '海浪一遍遍推上岸，灯光一圈圈扫过夜色。' },
  { no: '第二幕', name: '月亮下的母子', line: '孩子伸手去够月亮，妈妈把他抱得更紧。' },
  { no: '第三幕', name: '一棵树长大了', line: '种子抽枝、长叶，鸟儿从树梢飞走。' },
]

const SPEC: Record<SandMode, { tool: string; note: string }> = {
  warm: { tool: '琥珀灯箱', note: '厚沙近黑 · 薄沙透橙 · 抹开处发亮' },
  cool: { tool: '冷白灯板', note: '蓝灰沙影 · 颗粒更脆 · 像月光' },
  color: { tool: '彩色细沙', note: '赭红 土黄 苔绿 石青 · 每块一种沙' },
}

/* ------------------------------------------------------------------ geometry helpers */

const basic = (color: string, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color, ...extra })

/** a flat shape from a top outline (x, y pairs) closed down to `bottom` */
function ridgeGeometry(pts: [number, number][], bottom = -14) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], bottom)
  for (const [x, y] of pts) s.lineTo(x, y)
  s.lineTo(pts[pts.length - 1][0], bottom)
  s.closePath()
  return new THREE.ShapeGeometry(s)
}

function waveGeometry(amp: number, len: number, seed: number) {
  const pts: [number, number][] = []
  for (let x = -18; x <= 18.001; x += 0.12) {
    const k = (Math.PI * 2) / len
    pts.push([x, amp * Math.sin(k * x + seed) + amp * 0.35 * Math.sin(k * 2.03 * x + seed * 2.1)])
  }
  return ridgeGeometry(pts)
}

/** vertical gradient sky (vertex colours) */
function skyGeometry(top: string, mid: string, low: string) {
  const g = new THREE.PlaneGeometry(70, 44, 1, 24)
  const a = new THREE.Color(top)
  const b = new THREE.Color(mid)
  const c = new THREE.Color(low)
  const col = new THREE.Color()
  const pos = g.attributes.position
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) + 3) / 12, 0, 1) // 0 at the horizon → 1 high up
    if (t < 0.35) col.copy(c).lerp(b, t / 0.35)
    else col.copy(b).lerp(a, (t - 0.35) / 0.65)
    arr.set([col.r, col.g, col.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function Limb({ a, b, r, m }: { a: [number, number]; b: [number, number]; r: number; m: THREE.Material }) {
  const { pos, rot, len } = useMemo(() => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    return { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0] as [number, number, number], rot: Math.atan2(dy, dx) - Math.PI / 2, len: Math.hypot(dx, dy) }
  }, [a, b])
  return (
    <mesh position={pos} rotation={[0, 0, rot]} material={m}>
      <capsuleGeometry args={[r, len, 6, 14]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ birds */

function Bird({ m, phase, scale = 1 }: { m: THREE.Material; phase: number; scale?: number }) {
  const l = useRef<THREE.Group>(null)
  const r = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const f = Math.sin(clock.elapsedTime * 5.2 + phase) * 0.55
    if (l.current) l.current.rotation.z = 0.35 + f
    if (r.current) r.current.rotation.z = -0.35 - f
  })
  return (
    <group scale={scale}>
      <group ref={l}>
        <mesh position={[-0.2, 0, 0]} material={m}>
          <boxGeometry args={[0.4, 0.045, 0.05]} />
        </mesh>
      </group>
      <group ref={r}>
        <mesh position={[0.2, 0, 0]} material={m}>
          <boxGeometry args={[0.4, 0.045, 0.05]} />
        </mesh>
      </group>
      <mesh material={m}>
        <sphereGeometry args={[0.06, 10, 8]} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ act 1 · lighthouse */

function Lighthouse({ t, M }: { t: React.RefObject<number>; M: Mats }) {
  const waves = useRef<(THREE.Mesh | null)[]>([])
  const beam = useRef<THREE.Group>(null)
  const birds = useRef<THREE.Group>(null)
  const glints = useRef<THREE.Group>(null)
  const geo = useMemo(
    () => ({
      waves: [waveGeometry(0.14, 3.1, 0.3), waveGeometry(0.18, 3.7, 1.7), waveGeometry(0.24, 4.4, 4.1), waveGeometry(0.3, 5.2, 2.2)],
      cliff: ridgeGeometry([[0.4, -3], [0.9, -1.1], [1.3, -0.55], [1.7, -0.3], [2.2, -0.2], [3.0, -0.18], [3.7, -0.3], [4.4, 0.0], [5.4, 0.25], [7.5, 0.4], [12, 0.5]]),
      tower: (() => {
        const g = new THREE.CylinderGeometry(0.27, 0.42, 2.1, 40, 14)
        const pos = g.attributes.position
        const arr = new Float32Array(pos.count * 3)
        const red = new THREE.Color('#7e2f28')
        const white = new THREE.Color('#ece6da')
        for (let i = 0; i < pos.count; i++) {
          const band = Math.floor(((pos.getY(i) + 1.05) / 2.1) * 4 - 1e-4)
          const c = band % 2 ? white : red
          arr.set([c.r, c.g, c.b], i * 3)
        }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
        return g
      })(),
      beam: (() => {
        // a flat wedge pointing +x; its x scale is the projected length of the turning beam
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0, 0, -0.05, 0, 1, -0.42, 0, 1, 0.42, 0], 3))
        g.setIndex([0, 1, 2, 0, 2, 3])
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
        return g
      })(),
      sky: skyGeometry('#46546b', '#8d98a8', '#d6d6cf'),
    }),
    [],
  )
  useEffect(() => () => Object.values(geo).flat().forEach((g) => g.dispose()), [geo])

  useFrame(() => {
    const T = t.current ?? 0
    const lens = [3.1, 3.7, 4.4, 5.2]
    waves.current.forEach((w, i) => {
      if (!w) return
      const sp = 0.28 + i * 0.1
      w.position.x = -(((T * sp) % lens[i]) + lens[i] * 0.5) * (i % 2 ? -1 : 1)
      w.position.y = -0.95 - i * 0.42 + Math.sin(T * 0.8 + i) * 0.04
    })
    if (beam.current) {
      const a = POSTER ? 0.75 : T * 0.55
      const [b1, b2] = beam.current.children as THREE.Mesh[]
      // never a zero scale: a singular normal matrix would write NaN into the normal buffer
      const c = Math.cos(a)
      const len = (Math.abs(c) < 0.02 ? 0.02 * Math.sign(c || 1) : c) * 7.5
      b1.scale.set(len, 1 + Math.max(0, Math.sin(a)) * 0.6, 1)
      b2.scale.set(-len, 1 + Math.max(0, -Math.sin(a)) * 0.6, 1)
    }
    if (birds.current) {
      const x = ((T * 0.32 + 3) % 14) - 7
      birds.current.position.set(x, 1.7 + Math.sin(T * 0.4) * 0.2, -1.5)
    }
    if (glints.current) glints.current.children.forEach((c, i) => (c.scale.x = 0.6 + 0.4 * Math.sin(T * 1.7 + i * 1.9)))
  })

  return (
    <group>
      <mesh geometry={geo.sky} position={[0, 0, -6]} material={M.sky} />
      {/* moon + halo */}
      <group position={[-1.6, 2.05, -4.6]}>
        <mesh material={M.moon}>
          <circleGeometry args={[0.62, 64]} />
        </mesh>
        <mesh position={[0, 0, -0.05]} material={M.halo}>
          <circleGeometry args={[1.25, 64]} />
        </mesh>
        <mesh position={[0, 0, -0.08]} material={M.halo2}>
          <circleGeometry args={[2.1, 64]} />
        </mesh>
      </group>
      <Stars M={M} seed={3} />
      {/* moon road on the water */}
      <group ref={glints} position={[-1.6, -1.25, -0.6]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i} position={[Math.sin(i * 2.3) * 0.25, -i * 0.3, i * 0.2]} material={M.glint}>
            <planeGeometry args={[1.2 - i * 0.1, 0.05]} />
          </mesh>
        ))}
      </group>
      {/* sea: back → front */}
      {geo.waves.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, -0.95 - i * 0.42, -1.2 + i * 0.55]} material={M.sea[i]} ref={(el) => (waves.current[i] = el)} />
      ))}
      {/* cliff + lighthouse */}
      <mesh geometry={geo.cliff} position={[0, -0.75, -0.4]} material={M.rock} />
      <group position={[2.6, -0.95 + 1.05, -0.3]}>
        <mesh geometry={geo.tower} material={M.tower} />
        <mesh position={[0, 1.1, 0]} material={M.ink}>
          <cylinderGeometry args={[0.42, 0.42, 0.08, 32]} />
        </mesh>
        <mesh position={[0, 1.35, 0]} material={M.lamp}>
          <cylinderGeometry args={[0.24, 0.24, 0.42, 32]} />
        </mesh>
        <mesh position={[0, 1.74, 0]} material={M.ink}>
          <coneGeometry args={[0.34, 0.38, 32]} />
        </mesh>
        <mesh position={[0, -0.75, 0.38]} material={M.ink}>
          <boxGeometry args={[0.2, 0.36, 0.05]} />
        </mesh>
        <group ref={beam} position={[0, 1.35, 0]}>
          <mesh geometry={geo.beam} material={M.beam} position={[0, 0, -0.35]} />
          <mesh geometry={geo.beam} material={M.beam} position={[0, 0, -0.36]} />
        </group>
      </group>
      <group ref={birds}>
        <group position={[0, 0, 0]}>
          <Bird m={M.ink} phase={0} scale={0.9} />
        </group>
        <group position={[-0.7, -0.25, 0]}>
          <Bird m={M.ink} phase={1.3} scale={0.7} />
        </group>
        <group position={[-1.2, 0.2, 0]}>
          <Bird m={M.ink} phase={2.4} scale={0.6} />
        </group>
      </group>
    </group>
  )
}

function Stars({ M, seed }: { M: Mats; seed: number }) {
  const pts = useMemo(() => {
    const out: [number, number, number][] = []
    let s = seed * 9301
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    for (let i = 0; i < 16; i++) out.push([-6 + rnd() * 13, 1.6 + rnd() * 2.4, 0.025 + rnd() * 0.035])
    return out
  }, [seed])
  return (
    <group position={[0, 0, -5]}>
      {pts.map(([x, y, r], i) => (
        <mesh key={i} position={[x, y, 0]} material={M.moon}>
          <circleGeometry args={[r, 10]} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ act 2 · mother and child */

function MotherChild({ t, M }: { t: React.RefObject<number>; M: Mats }) {
  const head = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const star = useRef<THREE.Mesh>(null)
  const grass = useRef<THREE.Group>(null)
  const geo = useMemo(
    () => ({
      sky: skyGeometry('#3c465a', '#7f8a9c', '#b9b8b0'),
      far: ridgeGeometry([[-12, -1.0], [-6, -0.7], [-3.5, -1.1], [-1, -1.3], [2, -1.0], [4.5, -0.6], [7, -0.9], [12, -0.8]]),
      hill: ridgeGeometry([[-12, -3.2], [-6, -2.7], [-3, -2.0], [-1.2, -1.45], [0.2, -1.22], [1.4, -1.35], [3.2, -1.9], [6, -2.6], [12, -3.0]]),
    }),
    [],
  )
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  useFrame(() => {
    const T = t.current ?? 0
    if (head.current) head.current.rotation.z = -0.12 - Math.sin(T * 0.45) * 0.08
    if (arm.current) arm.current.rotation.z = 0.15 + (0.5 + 0.5 * Math.sin(T * 0.6 - 1.2)) * 0.5
    if (star.current) {
      const p = (T % 9) / 1.4
      star.current.visible = p < 1
      star.current.position.set(-5 + p * 4.5, 3.3 - p * 1.2, -4.5)
      ;(star.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(p, 1) * Math.PI)
    }
    if (grass.current) grass.current.children.forEach((c, i) => (c.rotation.z = Math.sin(i * 2.1) * 0.25 + Math.sin(T * 1.1 + i * 0.7) * 0.12))
  })
  const blades = useMemo(() => {
    const out: [number, number, number, number][] = []
    for (let i = 0; i < 22; i++) {
      const x = -3.4 + i * 0.32 + Math.sin(i * 3.7) * 0.1
      const y = x < -1.2 ? -1.45 - (-1.2 - x) * 0.32 : x < 1.4 ? -1.25 - Math.abs(x - 0.2) * 0.08 : -1.35 - (x - 1.4) * 0.3
      out.push([x, y, 0.16 + Math.abs(Math.sin(i * 1.3)) * 0.22, Math.sin(i * 2.1) * 0.25])
    }
    return out
  }, [])
  return (
    <group>
      <mesh geometry={geo.sky} position={[0, 0, -6]} material={M.sky2} />
      <Stars M={M} seed={7} />
      <group position={[1.2, 1.15, -4.6]}>
        <mesh material={M.moon}>
          <circleGeometry args={[1.85, 96]} />
        </mesh>
        <mesh position={[0, 0, -0.05]} material={M.halo}>
          <circleGeometry args={[2.6, 96]} />
        </mesh>
        {/* a few soft craters (a touch more sand) */}
        <mesh position={[-0.6, 0.5, 0.02]} material={M.crater}>
          <circleGeometry args={[0.38, 40]} />
        </mesh>
        <mesh position={[0.55, -0.4, 0.02]} material={M.crater}>
          <circleGeometry args={[0.52, 40]} />
        </mesh>
        <mesh position={[0.6, 0.85, 0.02]} material={M.crater}>
          <circleGeometry args={[0.2, 30]} />
        </mesh>
      </group>
      <mesh ref={star} material={M.streak} rotation={[0, 0, -0.26]}>
        <planeGeometry args={[0.9, 0.04]} />
      </mesh>
      <mesh geometry={geo.far} position={[0, -0.1, -3]} material={M.farHill} />
      <mesh geometry={geo.hill} position={[0, 0, -1]} material={M.ink} />
      {/* grass behind the hill: only the blades above the crest show against the sky */}
      <group ref={grass} position={[0, 0, -1.08]}>
        {blades.map(([x, y, h, lean], i) => (
          <group key={i} position={[x, y - 0.06, 0]} rotation={[0, 0, lean]}>
            <mesh position={[0, h, 0]} material={M.ink}>
              <coneGeometry args={[0.035, h * 2, 4]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* mother (sitting, facing right) with the child on her lap */}
      <group position={[-0.1, -1.18, -0.6]} scale={1.25}>
        <Limb a={[0, 0.05]} b={[0.12, 0.72]} r={0.2} m={M.ink} />
        <group ref={head} position={[0.16, 0.92, 0]}>
          <mesh position={[0.04, 0.12, 0]} material={M.ink}>
            <sphereGeometry args={[0.19, 24, 16]} />
          </mesh>
          <mesh position={[-0.15, 0.2, 0]} material={M.ink}>
            <sphereGeometry args={[0.1, 16, 12]} />
          </mesh>
        </group>
        <Limb a={[0.05, 0.08]} b={[0.62, 0.32]} r={0.15} m={M.ink} />
        <Limb a={[0.64, 0.3]} b={[0.86, -0.08]} r={0.11} m={M.ink} />
        <Limb a={[0.14, 0.62]} b={[0.5, 0.42]} r={0.07} m={M.ink} />
        {/* child */}
        <Limb a={[0.5, 0.38]} b={[0.56, 0.66]} r={0.12} m={M.ink} />
        <mesh position={[0.6, 0.88, 0]} material={M.ink}>
          <sphereGeometry args={[0.13, 20, 14]} />
        </mesh>
        <group ref={arm} position={[0.6, 0.68, 0]}>
          <Limb a={[0, 0]} b={[0.34, 0.12]} r={0.045} m={M.ink} />
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ act 3 · the tree */

type Branch = { a: THREE.Vector3; b: THREE.Vector3; r: number; delay: number; tip: boolean }

function makeTree(): Branch[] {
  let s = 12345
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const out: Branch[] = []
  const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, delay: number) => {
    const b = a.clone().addScaledVector(dir, len)
    out.push({ a, b, r, delay, tip: depth === 0 })
    if (depth === 0) return
    const n = depth > 2 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const spread = (i / Math.max(1, n - 1) - 0.5) * (0.9 + rnd() * 0.4)
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), spread + (rnd() - 0.5) * 0.25)
      d.y += 0.18
      d.normalize()
      grow(b, d, len * (0.68 + rnd() * 0.12), r * 0.64, depth - 1, delay + 0.9 + rnd() * 0.3)
    }
  }
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, 1, 0).normalize(), 1.35, 0.16, 4, 0)
  return out
}

function Tree({ t, M }: { t: React.RefObject<number>; M: Mats }) {
  const branches = useMemo(makeTree, [])
  const segs = useRef<(THREE.Group | null)[]>([])
  const leaves = useRef<(THREE.Mesh | null)[]>([])
  const birds = useRef<(THREE.Group | null)[]>([])
  const geo = useMemo(
    () => ({
      sky: skyGeometry('#5b5f6a', '#a4a49e', '#d8d2c2'),
      far: ridgeGeometry([[-12, -0.9], [-5, -0.6], [-2, -1.0], [1, -0.7], [4, -1.1], [12, -0.8]]),
      hill: ridgeGeometry([[-12, -2.9], [-5, -2.4], [-2, -1.85], [0, -1.6], [1.5, -1.7], [4, -2.3], [12, -2.8]]),
      branch: new THREE.CylinderGeometry(0.62, 1, 1, 10, 1).translate(0, 0.5, 0),
    }),
    [],
  )
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])
  const tips = useMemo(() => branches.filter((b) => b.tip), [branches])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const T = POSTER ? 30 : (t.current ?? 0)
    branches.forEach((br, i) => {
      const g = segs.current[i]
      if (!g) return
      const k = THREE.MathUtils.clamp((T - 0.8 - br.delay * 1.35) / 1.5, 0, 1)
      const e = 1 - (1 - k) ** 3
      dir.subVectors(br.b, br.a)
      const len = dir.length()
      q.setFromUnitVectors(up, dir.normalize())
      g.position.copy(br.a)
      g.quaternion.copy(q)
      g.scale.set(br.r * (0.4 + 0.6 * e), Math.max(1e-3, len * e), br.r * (0.4 + 0.6 * e))
      g.visible = k > 0
    })
    tips.forEach((_, i) => {
      const m = leaves.current[i]
      if (!m) return
      const k = THREE.MathUtils.clamp((T - 7.2 - (i % 7) * 0.12) / 1.6, 0, 1)
      const e = k * k * (3 - 2 * k)
      m.scale.setScalar(Math.max(1e-3, e * (0.36 + ((i * 37) % 10) * 0.02)))
      m.visible = k > 0
    })
    birds.current.forEach((b, i) => {
      if (!b) return
      const tip = tips[(i * 5 + 3) % tips.length].b
      const k = Math.max(0, T - 10.5 - i * 0.5)
      b.position.set(tip.x + k * (0.9 + i * 0.15), tip.y + k * (0.35 + i * 0.08) + Math.sin(k * 2 + i) * 0.1 * Math.min(1, k), 0.2)
      b.visible = T > 9.5
    })
  })
  return (
    <group>
      <mesh geometry={geo.sky} position={[0, 0, -6]} material={M.sky3} />
      <group position={[3.0, -0.65, -4.6]}>
        <mesh material={M.sun}>
          <circleGeometry args={[0.95, 80]} />
        </mesh>
        <mesh position={[0, 0, -0.05]} material={M.halo}>
          <circleGeometry args={[1.8, 80]} />
        </mesh>
      </group>
      <mesh geometry={geo.far} position={[0, -0.25, -3]} material={M.farHill} />
      <mesh geometry={geo.hill} position={[0, 0, -1]} material={M.ink} />
      <group position={[-0.4, -1.66, -0.7]}>
        {branches.map((_, i) => (
          <group key={i} ref={(el) => (segs.current[i] = el)}>
            <mesh geometry={geo.branch} material={M.trunk} />
          </group>
        ))}
        {/* foliage: flat discs facing the camera, so overlapping clumps merge into one silhouette */}
        {tips.map((tp, i) => (
          <mesh key={i} position={[tp.b.x, tp.b.y, 0.3]} material={M.leaf} ref={(el) => (leaves.current[i] = el)}>
            <circleGeometry args={[1, 28]} />
          </mesh>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <group key={i} ref={(el) => (birds.current[i] = el)}>
            <Bird m={M.ink} phase={i * 1.7} scale={0.55} />
          </group>
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

type Mats = ReturnType<typeof makeMats>
function makeMats() {
  return {
    sky: basic('#ffffff', { vertexColors: true }),
    sky2: basic('#ffffff', { vertexColors: true }),
    sky3: basic('#ffffff', { vertexColors: true }),
    moon: basic('#fff7dc'),
    sun: basic('#ffd9a0'),
    halo: basic('#d3d9e2', { transparent: true, opacity: 0.3, depthWrite: false }),
    halo2: basic('#c3cad6', { transparent: true, opacity: 0.16, depthWrite: false }),
    crater: basic('#d8cfb4'),
    glint: basic('#f4eedc'),
    streak: basic('#fffaf0', { transparent: true, opacity: 1, depthWrite: false }),
    sea: ['#62718a', '#45546c', '#2d3a50', '#1a2333'].map((c) => basic(c)),
    rock: basic('#2a211b'),
    tower: new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true }),
    lamp: basic('#fff3c4'),
    beam: basic('#fff1c8', { transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
    ink: basic('#17110d'),
    farHill: basic('#4d4d47'),
    trunk: basic('#1e1610'),
    leaf: basic('#1f2a19'),
  }
}

function Diorama({ act, actT, ry, onReady }: { act: number; actT: React.RefObject<number>; ry: MotionValue<number>; onReady: () => void }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const M = useMemo(makeMats, [])
  useEffect(
    () => () =>
      Object.values(M)
        .flat()
        .forEach((m) => m.dispose()),
    [M],
  )
  useFrame(() => {
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(1, vw / 9.5) : mobile ? Math.min(0.78, vw / 7.2) : Math.min(1, vh / 7.6, vw / 12)
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? -0.2 * k : vw * 0.13, mobile ? vh * 0.14 : 0, 0)
      rig.current.rotation.y = ry.get() + (POSTER ? 0 : Math.sin((actT.current ?? 0) * 0.12) * 0.04)
    }
  })
  return (
    <group ref={rig}>
      <group ref={content} visible={ready}>
        <group visible={act === 0}>
          <Lighthouse t={actT} M={M} />
        </group>
        <group visible={act === 1}>
          <MotherChild t={actT} M={M} />
        </group>
        <group visible={act === 2}>
          <Tree t={actT} M={M} />
        </group>
      </group>
      <directionalLight position={[-3, 2, 4]} intensity={2.2} />
      <ambientLight intensity={0.5} />
    </group>
  )
}

/** act clock + the hand that does the smearing / pouring + the redraw progress (no React re-renders) */
function Performance({ fx, actT, hand, stream, btn }: {
  fx: StylizeEffect
  actT: React.RefObject<number>
  hand: React.RefObject<HTMLDivElement | null>
  stream: React.RefObject<HTMLDivElement | null>
  btn: React.RefObject<HTMLButtonElement | null>
}) {
  const size = useThree((s) => s.size)
  const t = useRef(0)
  const vis = useRef(0)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    actT.current = (actT.current ?? 0) + dt
    const p = sandProgress(fx)
    const W = size.width
    const H = size.height
    const h = hand.current
    const s = stream.current
    let target = 0
    if (h) {
      if (p.phase === 'smear') {
        // the palm rides just behind the front of the arc the shader sweeps
        const amax = Math.atan2(W * 0.62, H * 0.85)
        const u = p.dir > 0 ? p.front : 1 - p.front
        const ang = (u - 0.5) * 2 * amax - p.dir * 0.035
        const yy = H * (0.5 + Math.sin(t.current * 3.1) * 0.06)
        const qy = H * 1.85 - yy
        const x = W / 2 + Math.tan(ang) * qy
        h.style.transform = `translate(${x.toFixed(1)}px, ${yy.toFixed(1)}px) translate(-50%, -50%) rotate(${((ang * 180) / Math.PI + p.dir * 8).toFixed(1)}deg) scaleX(${p.dir > 0 ? 1 : -1})`
        h.dataset.pose = 'palm'
        target = 1
      } else if (p.phase === 'pour' && p.p < 0.62) {
        // a fist trickling sand along the top, back and forth
        const k = p.p / 0.62
        const x = W * (0.5 + Math.sin(k * Math.PI * 2.2 - 1.2) * 0.34)
        const y = H * (0.2 + Math.sin(k * 7.0) * 0.03)
        h.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -78%) rotate(${(Math.cos(k * Math.PI * 2.2 - 1.2) * -10).toFixed(1)}deg)`
        h.dataset.pose = 'pour'
        target = 1
      }
      vis.current += (target - vis.current) * Math.min(1, dt * 7)
      h.style.opacity = vis.current.toFixed(3)
      if (s) s.style.opacity = h.dataset.pose === 'pour' ? (vis.current * 0.9).toFixed(3) : '0'
    }
    const b = btn.current
    if (b) {
      const prog = p.phase === 'idle' ? 1 : p.phase === 'smear' ? p.p * 0.3 : p.phase === 'rest' ? 0.3 : 0.3 + p.p * 0.7
      b.style.setProperty('--p', prog.toFixed(3))
      b.dataset.busy = p.phase === 'idle' ? '0' : '1'
    }
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function SandArt() {
  const [mode, setMode] = useState<SandMode>('warm')
  const [act, setAct] = useState(0)
  const fx = useMemo(() => {
    const f = createSandEffect()
    if (MOBILE) setSandSize(f, 0.8)
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const actT = useRef(POSTER ? 30 : 0)
  const hand = useRef<HTMLDivElement>(null)
  const stream = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const actRef = useRef(act)
  actRef.current = act

  useEffect(() => setSandMode(fx, mode), [fx, mode])

  const onReady = () => {
    if (POSTER) settleSand(fx)
    else pourSand(fx)
  }
  /** wipe the table; when it is covered, swap to `next` act (or keep it) and the picture pours in */
  const perform = (next: number | null) =>
    smearSand(fx, () => {
      if (next !== null && next !== actRef.current) {
        setAct(next)
        actT.current = 0
      }
    })

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 9000 || splitOpen.current) return
      if (sandProgress(fx).phase !== 'idle' || actT.current < 12) return
      perform((actRef.current + 1) % ACTS.length)
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx])
  const touch = () => (lastInput.current = performance.now())

  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anim.current?.stop()
    drag.current = { x: e.clientX, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.0022, -0.45, 0.45))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    // drift back to the front view after the throw, like a diorama on a turntable spring
    anim.current = animate(ry, ry.get(), {
      type: 'inertia',
      velocity: ry.getVelocity(),
      power: 0.35,
      timeConstant: 500,
      min: -0.45,
      max: 0.45,
      bounceStiffness: 140,
      bounceDamping: 18,
      onComplete: () => {
        anim.current = animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12, delay: 1.2 })
      },
    })
  }

  const S = SPEC[mode]
  const A = ACTS[act]
  const label = sandModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage theme-dark sa sa-${mode}${split.open ? ' sa-split' : ''}`}
      style={{ background: sandTable[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0.2, 14], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0.2, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={sandMeta.background} preload={preload} />
        <Diorama act={act} actT={actT} ry={ry} onReady={onReady} />
        <Performance fx={fx} actT={actT} hand={hand} stream={stream} btn={btn} />
      </Canvas>

      {/* the artist's hand (palm for the smear, a fist trickling sand for the pour) */}
      <div className="sa-hand" ref={hand} aria-hidden>
        <div className="sa-stream" ref={stream} />
        <svg viewBox="0 0 120 170" width="120" height="170">
          <defs>
            <linearGradient id="sa-skin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6b4630" />
              <stop offset="1" stopColor="#3b2416" />
            </linearGradient>
          </defs>
          <g fill="url(#sa-skin)" stroke="rgba(255,214,150,.35)" strokeWidth="1.2">
            <rect className="sa-f f1" x="22" y="22" width="17" height="70" rx="8.5" />
            <rect className="sa-f f2" x="42" y="10" width="18" height="80" rx="9" />
            <rect className="sa-f f3" x="63" y="16" width="17" height="76" rx="8.5" />
            <rect className="sa-f f4" x="82" y="34" width="15" height="62" rx="7.5" />
            <rect className="sa-thumb" x="-4" y="78" width="17" height="56" rx="8.5" transform="rotate(-38 4 106)" />
            <path d="M20 70 Q20 60 34 60 L90 62 Q100 64 99 80 L96 132 Q92 160 62 162 Q30 162 24 134 Z" />
          </g>
        </svg>
      </div>

      {/* light-table frame */}
      <div className="sa-frame" aria-hidden />

      <div className="overlay">
        <div className="hero-copy sa-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Sand Art · 灯箱沙画
            </p>
            <h1>
              一把细沙，
              <br />
              讲完一个故事
            </h1>
            <p className="sa-sub">灯箱从玻璃下面照上来：沙铺得越厚越暗，抹薄的地方透出暖光。手指划过留下亮痕，两边堆起细沙；一幕讲完，手掌把画面抹平，再撒出下一幕。</p>
            <div className="sa-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.tool}</b>
                  {S.note}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="sa-act" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={act}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.7, delay: 0.9, ease: [0.23, 1, 0.32, 1] } }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)', transition: { duration: 0.35 } }}
            >
              <span>{A.no}</span>
              <b>{A.name}</b>
              <em>{A.line}</em>
            </motion.div>
          </AnimatePresence>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg
            items={sandModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(m) => {
              touch()
              if (m === mode) return
              setMode(m)
              perform(null)
            }}
          />
          <span className="dock-sep" />
          <button
            ref={btn}
            className="seg sa-btn"
            onClick={() => {
              touch()
              perform((act + 1) % ACTS.length)
            }}
          >
            <span>重新撒沙</span>
            <i className="sa-bar" />
          </button>
          <button className="seg sa-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="sa-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动看层次 · 闲置时抹平，撒出下一幕</p>
      </div>
    </div>
  )
}

const css = `
.sa { cursor: grab; touch-action: none; transition: background .8s; }
.sa:active { cursor: grabbing; }
.sa canvas { display: block; }
.sa-copy { pointer-events: none !important; --soft-bg: #160e07; }
.sa-cool .sa-copy { --soft-bg: #0a0d12; }
.sa-copy .scrim { opacity: .82; }
.sa-split .sa-copy .scrim { opacity: .95; }
.sa-copy .kicker { color: rgba(255, 236, 205, .7); }
.sa-copy .kicker i { background: #f2c27a; }
.sa-cool .sa-copy .kicker i { background: #a8c6e2; }
.sa-copy h1 { font-size: clamp(36px, 4.2vw, 58px); color: #fff3dc; letter-spacing: -.02em; }
.sa-sub { max-width: 410px; color: rgba(255, 238, 214, .76) !important; }
.sa-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: rgba(255, 236, 205, .72); }
.sa-spec span { display: inline-flex; align-items: center; gap: 10px; }
.sa-spec b { font-weight: 600; color: #fff3dc; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(255, 236, 205, .32); font-family: var(--sans); }

.sa-act {
  position: absolute; right: clamp(28px, 4vw, 64px); top: 86px; text-align: right; pointer-events: none !important;
  color: #fff3dc; text-shadow: 0 1px 14px rgba(20, 10, 2, .7), 0 0 2px rgba(20, 10, 2, .5);
}
.sa-act span { display: block; font: 500 11.5px/1 var(--mono); letter-spacing: .18em; opacity: .7; }
.sa-act b { display: block; margin-top: 8px; font: 600 24px/1.2 var(--display); letter-spacing: .02em; }
.sa-act em { display: block; margin-top: 6px; font: 400 13.5px/1.5 var(--sans); font-style: normal; opacity: .78; }

.sa .dock { bottom: 34px; }
.sa .hint { bottom: 40px; right: 36px; color: rgba(255, 236, 205, .55); }
.sa-split .hint { opacity: 0; }
.sa-btn span { display: inline-flex; align-items: center; gap: 6px; }
.sa-btn { overflow: hidden; }
.sa-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #f2c27a; transform-origin: left; transform: scaleX(var(--p, 1)); opacity: 0; transition: opacity .3s;
}
.sa-cool .sa-bar { background: #a8c6e2; }
.sa-btn[data-busy='1'] .sa-bar { opacity: .9; }

.sa-hand {
  position: absolute; left: 0; top: 0; width: 120px; height: 170px; z-index: 2; pointer-events: none; opacity: 0;
  will-change: transform, opacity; filter: drop-shadow(0 18px 22px rgba(0, 0, 0, .55)) drop-shadow(0 0 1px rgba(255, 210, 150, .3));
}
.sa-hand svg { display: block; overflow: visible; }
.sa-hand .sa-f { transition: transform .35s cubic-bezier(.23, 1, .32, 1); transform-box: fill-box; transform-origin: 50% 100%; }
.sa-hand[data-pose='pour'] .sa-f { transform: scaleY(.42); }
.sa-hand[data-pose='pour'] .sa-f.f1, .sa-hand[data-pose='pour'] .sa-f.f4 { transform: scaleY(.5); }
.sa-stream {
  position: absolute; left: 50%; top: 160px; width: 3px; height: 46vh; margin-left: -1.5px; opacity: 0;
  background:
    repeating-linear-gradient(180deg, rgba(40, 22, 10, .95) 0 3px, rgba(40, 22, 10, .4) 3px 5px, rgba(40, 22, 10, .9) 5px 9px),
    linear-gradient(180deg, rgba(40, 22, 10, 0), rgba(40, 22, 10, 1) 10%);
  background-blend-mode: multiply;
  -webkit-mask: linear-gradient(180deg, #000 70%, transparent);
  mask: linear-gradient(180deg, #000 70%, transparent);
  animation: sa-fall .35s linear infinite;
}
@keyframes sa-fall { to { background-position: 0 9px, 0 0; } }

.sa-frame {
  position: absolute; inset: 0; z-index: 3; pointer-events: none;
  box-shadow: inset 0 0 0 10px #120c07, inset 0 0 0 11px rgba(255, 220, 170, .08), inset 0 0 60px 10px rgba(0, 0, 0, .55);
}
.sa-cool .sa-frame { box-shadow: inset 0 0 0 10px #080a0e, inset 0 0 0 11px rgba(200, 225, 255, .08), inset 0 0 60px 10px rgba(0, 0, 0, .55); }

@media (max-width: 760px) {
  .sa-sub { display: none; }
  .sa-copy h1 { font-size: 32px; }
  .sa-spec { margin-top: 10px; font-size: 11px; }
  .sa-split .sa-copy { opacity: 0; }
  .sa-act { top: 74px; right: 22px; }
  .sa-act b { font-size: 18px; }
  .sa-act em { display: none; }
  .sa .dock .seg { padding: 0 10px; }
  .sa-hand { width: 84px; height: 119px; }
  .sa-hand svg { width: 84px; height: 119px; }
  .sa-stream { top: 112px; }
}
`
