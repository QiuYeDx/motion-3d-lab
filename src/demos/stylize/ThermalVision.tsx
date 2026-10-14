import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  createThermalEffect,
  setThermalMode,
  setThermalNuc,
  setThermalRange,
  thermalEmissive,
  thermalMeta,
  thermalModes,
  thermalPaint,
  thermalPaletteCss,
  thermalStatus,
  type ThermalMode,
} from './effects/thermal'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 热成像 showcase — a night street seen through a handheld thermal camera. Hot things are painted with the
 * effect's temperature convention (emissive red → yellow, see ./effects/thermal.ts), so the same numbers
 * drive both the picture and the HUD: the spot reading raycasts the scene under the crosshair and reads the
 * temperature assigned to that object (userData.tempC). A walking figure, a car with a hot engine and
 * exhaust, a cat, a steaming cup and a sodium streetlamp; in 夜视仪 mode the heat paint is switched off and
 * the scene is seen by its (dim) visible light instead.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const IDLE_MS = 4000

const FIXED: [number, number] = [-20, 120]

type Target = { ref: React.RefObject<THREE.Object3D | null>; label: string }

/* ------------------------------------------------------------------ heat materials */

type HeatMat = { mat: THREE.MeshStandardMaterial; k: number; nvKeep: number }

function useHeat() {
  const list = useRef<HeatMat[]>([])
  const make = (celsius: number, albedo = '#16161b', opts: { nvKeep?: number; boost?: number; rough?: number } = {}) => {
    const e = thermalEmissive(celsius)
    const mat = new THREE.MeshStandardMaterial({ color: albedo, roughness: opts.rough ?? 0.7, emissive: e.color, emissiveIntensity: e.intensity * (opts.boost ?? 1) })
    list.current.push({ mat, k: e.intensity * (opts.boost ?? 1), nvKeep: opts.nvKeep ?? 0 })
    return mat
  }
  return { list, make }
}

const tag = (o: THREE.Object3D | null, tempC: number, label: string) => {
  if (o) o.userData = { ...o.userData, tempC, label }
}

/* ------------------------------------------------------------------ scene pieces */

function Person({ heat, t, targetRef }: { heat: ReturnType<typeof useHeat>; t: React.RefObject<number>; targetRef: React.RefObject<THREE.Object3D | null> }) {
  const M = useMemo(
    () => ({
      skin: heat.make(34.5, '#3a2a24'),
      coat: heat.make(23, '#2b3446'),
      legs: heat.make(26, '#22252c'),
      shoe: heat.make(14, '#111'),
      hair: heat.make(29, '#1a1410'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const root = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)

  useFrame(() => {
    const s = t.current
    const L = 18
    const x = 9 - ((s * 1.15) % L)
    const ph = s * 1.15 * 3.2
    if (root.current) {
      root.current.position.set(x, Math.abs(Math.sin(ph)) * 0.05, -2.3)
    }
    const sw = Math.sin(ph) * 0.5
    if (legL.current) legL.current.rotation.z = sw
    if (legR.current) legR.current.rotation.z = -sw
    if (armL.current) armL.current.rotation.z = -sw * 0.8
    if (armR.current) armR.current.rotation.z = sw * 0.8
    if (head.current) head.current.rotation.y = Math.sin(s * 0.5) * 0.3
  })

  useEffect(() => {
    root.current?.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return
      const m = (o as THREE.Mesh).material
      tag(o, m === M.skin ? 34.5 : m === M.coat ? 23.4 : m === M.legs ? 26.1 : m === M.hair ? 29.2 : 14.5, m === M.skin ? '人脸' : '行人')
    })
  }, [M])

  return (
    // faces −x (walking left)
    <group ref={root} rotation={[0, Math.PI, 0]}>
      <group ref={legL} position={[0, 0.92, 0.11]}>
        <mesh position={[0, -0.44, 0]} material={M.legs} castShadow>
          <capsuleGeometry args={[0.075, 0.72, 4, 12]} />
        </mesh>
        <mesh position={[0.06, -0.9, 0]} material={M.shoe}>
          <boxGeometry args={[0.26, 0.08, 0.11]} />
        </mesh>
      </group>
      <group ref={legR} position={[0, 0.92, -0.11]}>
        <mesh position={[0, -0.44, 0]} material={M.legs} castShadow>
          <capsuleGeometry args={[0.075, 0.72, 4, 12]} />
        </mesh>
        <mesh position={[0.06, -0.9, 0]} material={M.shoe}>
          <boxGeometry args={[0.26, 0.08, 0.11]} />
        </mesh>
      </group>
      <mesh position={[0, 1.22, 0]} scale={[0.75, 1, 1]} material={M.coat} castShadow>
        <capsuleGeometry args={[0.2, 0.5, 6, 16]} />
      </mesh>
      <group ref={armL} position={[0, 1.48, 0.27]}>
        <mesh position={[0, -0.3, 0]} material={M.coat}>
          <capsuleGeometry args={[0.06, 0.5, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.64, 0]} material={M.skin}>
          <sphereGeometry args={[0.06, 12, 10]} />
        </mesh>
      </group>
      <group ref={armR} position={[0, 1.48, -0.27]}>
        <mesh position={[0, -0.3, 0]} material={M.coat}>
          <capsuleGeometry args={[0.06, 0.5, 4, 10]} />
        </mesh>
        <mesh position={[0, -0.64, 0]} material={M.skin}>
          <sphereGeometry args={[0.06, 12, 10]} />
        </mesh>
      </group>
      <group ref={head} position={[0, 1.7, 0]}>
        <mesh ref={targetRef as React.RefObject<THREE.Mesh>} material={M.skin}>
          <sphereGeometry args={[0.13, 20, 16]} />
        </mesh>
        <mesh position={[0.02, 0.06, 0]} scale={[1.05, 0.7, 1.05]} material={M.hair}>
          <sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -0.18, 0]} material={M.skin}>
          <cylinderGeometry args={[0.05, 0.06, 0.1, 10]} />
        </mesh>
      </group>
    </group>
  )
}

function Car({ heat, t, engineRef, puffs }: { heat: ReturnType<typeof useHeat>; t: React.RefObject<number>; engineRef: React.RefObject<THREE.Object3D | null>; puffs: React.RefObject<Puffs | null> }) {
  const M = useMemo(
    () => ({
      body: heat.make(9, '#5b6a86', { rough: 0.35 }),
      roof: heat.make(7, '#4f5d78', { rough: 0.35 }),
      hood: heat.make(84, '#5b6a86', { rough: 0.35 }),
      grille: heat.make(96, '#191a1e'),
      glass: new THREE.MeshStandardMaterial({ color: '#0d1118', roughness: 0.1 }),
      tire: heat.make(41, '#121214'),
      pipe: heat.make(118, '#2a2a2a'),
      head: new THREE.MeshStandardMaterial({ color: '#222', emissive: new THREE.Color('#fff2cf'), emissiveIntensity: 2.4 }),
      tail: heat.make(36, '#300', { nvKeep: 1 }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const root = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Group[]>([])
  const pipe = useRef<THREE.Object3D>(null)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, raw) => {
    const s = t.current
    const L = 34
    const v = 7.2
    const x = -17 + ((s * v + 9) % L)
    if (root.current) root.current.position.set(x, 0, 0.9)
    for (const w of wheels.current) if (w) w.rotation.z = -(s * v) / 0.34
    if (pipe.current && puffs.current) {
      pipe.current.getWorldPosition(tmp)
      puffs.current.emit(tmp, Math.min(raw, 1 / 30))
    }
  })

  useEffect(() => {
    const labels = new Map<THREE.Material, [number, string]>([
      [M.body, [9.2, '车身']],
      [M.roof, [7.4, '车顶']],
      [M.hood, [84, '引擎盖']],
      [M.grille, [96, '散热格栅']],
      [M.glass, [5.5, '车窗']],
      [M.tire, [41, '轮胎']],
      [M.pipe, [118, '排气管']],
      [M.head, [38, '车灯']],
      [M.tail, [36, '尾灯']],
    ])
    root.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material
      const l = labels.get(m)
      if (l) tag(o, l[0], l[1])
    })
  }, [M])

  const wheel = (x: number, z: number, i: number) => (
    <group key={i} position={[x, 0.34, z]} ref={(g) => void (wheels.current[i] = g!)}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={M.tire} castShadow>
        <cylinderGeometry args={[0.34, 0.34, 0.24, 24]} />
      </mesh>
    </group>
  )

  return (
    <group ref={root}>
      {/* drives toward +x: front is +x */}
      <mesh position={[0, 0.62, 0]} material={M.body} castShadow>
        <boxGeometry args={[4.1, 0.62, 1.75]} />
      </mesh>
      <mesh ref={engineRef as React.RefObject<THREE.Mesh>} position={[1.38, 0.95, 0]} material={M.hood}>
        <boxGeometry args={[1.3, 0.06, 1.62]} />
      </mesh>
      <mesh position={[2.06, 0.6, 0]} material={M.grille}>
        <boxGeometry args={[0.04, 0.3, 1.2]} />
      </mesh>
      <mesh position={[-0.35, 1.2, 0]} material={M.roof} castShadow>
        <boxGeometry args={[2.1, 0.58, 1.6]} />
      </mesh>
      <mesh position={[0.72, 1.2, 0]} rotation={[0, 0, 0.62]} material={M.glass}>
        <boxGeometry args={[0.04, 0.62, 1.5]} />
      </mesh>
      <mesh position={[-0.35, 1.2, 0.805]} material={M.glass}>
        <boxGeometry args={[1.8, 0.4, 0.02]} />
      </mesh>
      {[-0.6, 0.6].map((z) => (
        <mesh key={z} position={[2.06, 0.72, z]} material={M.head}>
          <boxGeometry args={[0.05, 0.14, 0.3]} />
        </mesh>
      ))}
      {[-0.66, 0.66].map((z) => (
        <mesh key={z} position={[-2.06, 0.74, z]} material={M.tail}>
          <boxGeometry args={[0.05, 0.12, 0.26]} />
        </mesh>
      ))}
      <mesh ref={pipe} position={[-2.12, 0.28, 0.5]} rotation={[0, 0, Math.PI / 2]} material={M.pipe}>
        <cylinderGeometry args={[0.05, 0.05, 0.18, 12]} />
      </mesh>
      {wheel(1.3, 0.8, 0)}
      {wheel(1.3, -0.8, 1)}
      {wheel(-1.3, 0.8, 2)}
      {wheel(-1.3, -0.8, 3)}
      <pointLight name="beam" position={[3.2, 0.7, 0]} intensity={6} distance={9} color="#fff1d0" />
    </group>
  )
}

/** a small pool of warm puffs: exhaust and steam (alpha-blended heat paint → partial warmth) */
type Puffs = { emit: (p: THREE.Vector3, dt: number) => void }

function PuffField({
  apiRef,
  count,
  celsius,
  rate,
  rise,
  drift,
  size,
  life,
  nv,
  label,
  opacity = 0.42,
}: {
  apiRef: React.RefObject<Puffs | null>
  count: number
  celsius: number
  rate: number
  rise: number
  drift: [number, number]
  size: number
  life: number
  nv: MotionValue<number>
  label: string
  opacity?: number
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: thermalPaint(celsius),
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        toneMapped: false,
      }),
    [celsius],
  )
  const S = useMemo(
    () => ({
      p: Array.from({ length: count }, () => new THREE.Vector3(0, -99, 0)),
      v: Array.from({ length: count }, () => new THREE.Vector3()),
      age: new Float32Array(count).fill(99),
      next: 0,
      acc: 0,
      m: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      sc: new THREE.Vector3(),
    }),
    [count],
  )
  useEffect(() => {
    apiRef.current = {
      emit: (pos, dt) => {
        S.acc += dt * rate
        while (S.acc >= 1) {
          S.acc -= 1
          const i = S.next
          S.next = (S.next + 1) % count
          S.p[i].copy(pos)
          S.v[i].set(drift[0] + (Math.random() - 0.5) * 0.25, rise * (0.7 + Math.random() * 0.6), drift[1] + (Math.random() - 0.5) * 0.25)
          S.age[i] = 0
        }
      },
    }
  }, [S, apiRef, count, rate, rise, drift])
  useEffect(() => {
    if (mesh.current) mesh.current.userData = { tempC: celsius * 0.6 + 4, label }
  }, [celsius, label])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const im = mesh.current
    if (!im) return
    for (let i = 0; i < count; i++) {
      S.age[i] += dt
      const a = S.age[i] / life
      if (a >= 1) {
        S.sc.setScalar(0.0001)
      } else {
        S.p[i].addScaledVector(S.v[i], dt)
        S.v[i].multiplyScalar(1 - dt * 0.6)
        S.sc.setScalar(size * (0.4 + a * 1.6) * Math.sin(Math.PI * Math.min(1, a * 1.1 + 0.05)))
      }
      S.m.compose(S.p[i], S.q, S.sc)
      im.setMatrixAt(i, S.m)
    }
    im.instanceMatrix.needsUpdate = true
    mat.opacity = opacity * (1 - nv.get())
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} material={mat} frustumCulled={false}>
      <sphereGeometry args={[1, 12, 8]} />
    </instancedMesh>
  )
}

function Cat({ heat, t, targetRef }: { heat: ReturnType<typeof useHeat>; t: React.RefObject<number>; targetRef: React.RefObject<THREE.Object3D | null> }) {
  const M = useMemo(
    () => ({ fur: heat.make(31, '#3a3530'), face: heat.make(35.5, '#3a3530'), ear: heat.make(28, '#3a3530') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const tail = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const root = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = t.current
    if (tail.current) tail.current.rotation.set(Math.sin(s * 1.7) * 0.5, 0, 0.5 + Math.sin(s * 1.1) * 0.15)
    if (head.current) head.current.rotation.y = Math.sin(s * 0.37) * 0.5 + 0.2
  })
  useEffect(() => {
    root.current?.traverse((o) => {
      const m = (o as THREE.Mesh).material
      if (m) tag(o, m === M.face ? 35.6 : m === M.ear ? 28.3 : 31.4, '猫')
    })
  }, [M])
  return (
    <group ref={root} position={[0.1, 0.15, 3.05]} rotation={[0, -1.1, 0]} scale={0.95}>
      <mesh position={[0, 0.2, 0]} scale={[1, 1.25, 0.82]} material={M.fur} castShadow>
        <sphereGeometry args={[0.17, 20, 16]} />
      </mesh>
      <mesh position={[0.02, 0.06, 0]} scale={[1.25, 0.6, 1]} material={M.fur}>
        <sphereGeometry args={[0.16, 20, 12]} />
      </mesh>
      <group ref={head} position={[0.04, 0.44, 0]}>
        <mesh ref={targetRef as React.RefObject<THREE.Mesh>} material={M.face}>
          <sphereGeometry args={[0.11, 20, 16]} />
        </mesh>
        {[-0.06, 0.06].map((z) => (
          <mesh key={z} position={[0, 0.1, z]} rotation={[z * 4, 0, 0]} material={M.ear}>
            <coneGeometry args={[0.035, 0.08, 8]} />
          </mesh>
        ))}
      </group>
      <group ref={tail} position={[-0.15, 0.06, 0]}>
        <mesh position={[-0.12, 0.12, 0]} rotation={[0, 0, 0.6]} material={M.fur}>
          <capsuleGeometry args={[0.025, 0.3, 4, 8]} />
        </mesh>
      </group>
    </group>
  )
}

function Cafe({ heat, cupRef, steam, t }: { heat: ReturnType<typeof useHeat>; cupRef: React.RefObject<THREE.Object3D | null>; steam: React.RefObject<Puffs | null>; t: React.RefObject<number> }) {
  const M = useMemo(
    () => ({
      metal: heat.make(8, '#8a8f99', { rough: 0.35 }),
      top: heat.make(10, '#c8c4ba', { rough: 0.5 }),
      cup: heat.make(58, '#e8e4dc', { rough: 0.3 }),
      coffee: heat.make(66, '#2a1a12', { rough: 0.2 }),
      saucer: heat.make(31, '#e8e4dc', { rough: 0.3 }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const src = useMemo(() => new THREE.Vector3(), [])
  const root = useRef<THREE.Group>(null)
  const top = useRef<THREE.Object3D>(null)
  useFrame((_, raw) => {
    if (top.current && steam.current) {
      top.current.getWorldPosition(src)
      src.x += Math.sin(t.current * 3.1) * 0.02
      steam.current.emit(src, Math.min(raw, 1 / 30))
    }
  })
  useEffect(() => {
    const L = new Map<THREE.Material, [number, string]>([
      [M.metal, [8.3, '桌腿']],
      [M.top, [10.2, '桌面']],
      [M.cup, [58.4, '咖啡杯']],
      [M.coffee, [66.1, '咖啡']],
      [M.saucer, [31, '杯碟']],
    ])
    root.current?.traverse((o) => {
      const l = L.get((o as THREE.Mesh).material as THREE.Material)
      if (l) tag(o, l[0], l[1])
    })
  }, [M])
  return (
    <group ref={root} position={[0.95, 0.15, 3.3]}>
      <mesh position={[0, 0.36, 0]} material={M.metal} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.72, 10]} />
      </mesh>
      <mesh position={[0, 0.015, 0]} material={M.metal}>
        <cylinderGeometry args={[0.2, 0.22, 0.03, 24]} />
      </mesh>
      <mesh position={[0, 0.73, 0]} material={M.top} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.36, 0.03, 40]} />
      </mesh>
      <group position={[0.04, 0.745, 0.06]}>
        <mesh position={[0, 0.006, 0]} material={M.saucer}>
          <cylinderGeometry args={[0.085, 0.07, 0.012, 24]} />
        </mesh>
        <mesh ref={cupRef as React.RefObject<THREE.Mesh>} position={[0, 0.05, 0]} material={M.cup}>
          <cylinderGeometry args={[0.048, 0.04, 0.085, 20]} />
        </mesh>
        <mesh ref={top} position={[0, 0.093, 0]} material={M.coffee}>
          <cylinderGeometry args={[0.043, 0.043, 0.004, 20]} />
        </mesh>
        <mesh position={[0.055, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.cup}>
          <torusGeometry args={[0.022, 0.007, 8, 16]} />
        </mesh>
      </group>
      {/* chair */}
      <group position={[0.55, 0, 0.35]} rotation={[0, -0.8, 0]}>
        <mesh position={[0, 0.45, 0]} material={M.metal}>
          <boxGeometry args={[0.42, 0.03, 0.42]} />
        </mesh>
        <mesh position={[0, 0.72, -0.2]} material={M.metal}>
          <boxGeometry args={[0.42, 0.5, 0.03]} />
        </mesh>
        {[
          [-0.18, -0.18],
          [0.18, -0.18],
          [-0.18, 0.18],
          [0.18, 0.18],
        ].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} material={M.metal}>
            <cylinderGeometry args={[0.012, 0.012, 0.45, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Street({ heat }: { heat: ReturnType<typeof useHeat> }) {
  const M = useMemo(
    () => ({
      road: heat.make(3.5, '#2a2c31', { rough: 0.9 }),
      walk: heat.make(8.5, '#4a4b50', { rough: 0.9 }),
      curb: heat.make(8, '#6a6b70', { rough: 0.9 }),
      line: heat.make(6, '#a9a9a2', { rough: 0.9 }),
      wall: heat.make(10.5, '#5d5550', { rough: 0.9 }),
      win: heat.make(19, '#111', { nvKeep: 1 }),
      winDark: heat.make(-4, '#10141c', { rough: 0.15 }),
      frame: heat.make(9, '#2c2a28'),
      pole: heat.make(4, '#3a3d44', { rough: 0.4 }),
      bulb: new THREE.MeshStandardMaterial({ color: '#111', emissive: thermalPaint(75), emissiveIntensity: 3 }),
      ac: heat.make(12, '#9a9a96'),
      vent: heat.make(44, '#555'),
      door: heat.make(13, '#3b2a20'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const root = useRef<THREE.Group>(null)
  useEffect(() => {
    const L = new Map<THREE.Material, [number, string]>([
      [M.road, [3.6, '路面']],
      [M.walk, [8.6, '人行道']],
      [M.curb, [8.1, '路沿']],
      [M.line, [6.1, '标线']],
      [M.wall, [10.6, '墙面']],
      [M.win, [19.2, '亮灯的窗']],
      [M.winDark, [-3.8, '玻璃 · 映着夜空']],
      [M.frame, [9.1, '窗框']],
      [M.pole, [4.2, '灯杆']],
      [M.bulb, [75, '钠灯']],
      [M.ac, [12.4, '空调外机']],
      [M.vent, [44.2, '空调出风']],
      [M.door, [13.2, '门']],
    ])
    root.current?.traverse((o) => {
      const l = L.get((o as THREE.Mesh).material as THREE.Material)
      if (l) tag(o, l[0], l[1])
    })
  }, [M])

  const windows: [number, number, boolean][] = [
    [-7, 1.8, false],
    [-4.6, 1.8, true],
    [-2.2, 1.8, false],
    [3.8, 1.8, true],
    [6.2, 1.8, false],
    [-5.8, 4.4, true],
    [-1.0, 4.4, false],
    [1.4, 4.4, true],
    [5.0, 4.4, false],
    [7.4, 4.4, true],
  ]
  return (
    <group ref={root}>
      {/* road z −0.9 … 2.4, far walk −0.9 … −4, near walk 2.4 … 5 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.75]} material={M.road} receiveShadow>
        <planeGeometry args={[60, 3.3]} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-22 + i * 4, 0.003, 0.75]} material={M.line}>
          <planeGeometry args={[1.6, 0.1]} />
        </mesh>
      ))}
      <mesh position={[0, 0.075, -2.45]} material={M.walk} receiveShadow>
        <boxGeometry args={[60, 0.15, 3.1]} />
      </mesh>
      <mesh position={[0, 0.075, -0.92]} material={M.curb}>
        <boxGeometry args={[60, 0.16, 0.08]} />
      </mesh>
      <mesh position={[0, 0.075, 3.9]} material={M.walk} receiveShadow>
        <boxGeometry args={[60, 0.15, 3]} />
      </mesh>
      <mesh position={[0, 0.075, 2.42]} material={M.curb}>
        <boxGeometry args={[60, 0.16, 0.08]} />
      </mesh>
      {/* facade */}
      <mesh position={[0, 3.2, -4.1]} material={M.wall} receiveShadow>
        <boxGeometry args={[60, 6.4, 0.2]} />
      </mesh>
      {windows.map(([x, y, lit], i) => (
        <group key={i} position={[x, y, -3.98]}>
          <mesh material={M.frame}>
            <boxGeometry args={[1.5, 1.5, 0.06]} />
          </mesh>
          <mesh position={[0, 0, 0.035]} material={lit ? M.win : M.winDark}>
            <boxGeometry args={[1.3, 1.3, 0.02]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.6, 1.15, -3.97]} material={M.door}>
        <boxGeometry args={[1.1, 2.1, 0.06]} />
      </mesh>
      {/* AC unit with a warm vent */}
      <group position={[-1.0, 2.9, -3.75]}>
        <mesh material={M.ac}>
          <boxGeometry args={[0.85, 0.6, 0.32]} />
        </mesh>
        <mesh position={[0.12, 0, 0.17]} rotation={[Math.PI / 2, 0, 0]} material={M.vent}>
          <cylinderGeometry args={[0.22, 0.22, 0.02, 24]} />
        </mesh>
      </group>
      {/* sodium streetlamp */}
      <group position={[3.4, 0.15, -1.25]}>
        <mesh position={[0, 2.3, 0]} material={M.pole}>
          <cylinderGeometry args={[0.06, 0.09, 4.6, 12]} />
        </mesh>
        <mesh position={[0.45, 4.55, 0]} rotation={[0, 0, Math.PI / 2]} material={M.pole}>
          <cylinderGeometry args={[0.04, 0.04, 0.9, 8]} />
        </mesh>
        <mesh position={[0.9, 4.48, 0]} material={M.pole}>
          <boxGeometry args={[0.5, 0.12, 0.26]} />
        </mesh>
        <mesh position={[0.9, 4.4, 0]} material={M.bulb}>
          <boxGeometry args={[0.36, 0.05, 0.18]} />
        </mesh>
        <pointLight name="lamp" position={[0.9, 4.1, 0]} intensity={24} distance={11} decay={1.6} color="#ffb766" castShadow shadow-mapSize={[1024, 1024]} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ rig: camera pan, HUD, AGC */

type Hud = {
  pointer: { x: number; y: number }
  auto: boolean
  lastMove: number
  cross: HTMLDivElement | null
  val: HTMLSpanElement | null
  lab: HTMLSpanElement | null
  hi: HTMLSpanElement | null
  lo: HTMLSpanElement | null
  nuc: HTMLSpanElement | null
}

function Rig({
  yaw,
  pitch,
  hud,
  targets,
  fx,
  rangeMode,
  mode,
}: {
  yaw: MotionValue<number>
  pitch: MotionValue<number>
  hud: React.RefObject<Hud>
  targets: Target[]
  fx: ReturnType<typeof createThermalEffect>
  rangeMode: 'auto' | 'fixed'
  mode: ThermalMode
}) {
  const camera = useThree((s) => s.camera as THREE.PerspectiveCamera)
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const S = useMemo(
    () => ({
      t: 0,
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      v: new THREE.Vector3(),
      cross: { x: -1, y: -1 },
      reading: 20,
      lastAgc: 0,
      ti: 0,
      tSwitch: 0,
      label: '',
      list: [] as THREE.Object3D[],
    }),
    [],
  )
  useEffect(() => {
    // pickables: everything but lights and the puffs
    S.list = []
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) S.list.push(o)
    })
  })

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    S.t += dt
    const portrait = size.width < size.height
    const mobile = size.width < 760
    // camera: handheld sway + user pan; shifted so the action sits right of the copy on desktop
    const sway = POSTER ? 0 : Math.sin(S.t * 0.21) * 0.05 + Math.sin(S.t * 0.53) * 0.012
    camera.fov = portrait ? 64 : 40
    const baseX = POSTER ? 0.75 : mobile ? 1.05 : 0.15
    camera.position.set(baseX, portrait ? 2.0 : 1.95, portrait ? 6.9 : 7.1)
    camera.rotation.set((portrait ? -0.2 : -0.19) + pitch.get() + Math.sin(S.t * 0.37) * 0.006, yaw.get() + sway, 0, 'YXZ')
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    const H = hud.current
    if (!H) return
    // crosshair: pointer, or (idle) auto-track the interesting things in turn
    const idle = performance.now() - H.lastMove > IDLE_MS || POSTER
    if (H.lastMove < 0 && H.pointer.x === 0) {
      H.pointer.x = size.width * (mobile ? 0.5 : 0.66)
      H.pointer.y = size.height * 0.5
    }
    let tx = H.pointer.x
    let ty = H.pointer.y
    if (idle) {
      if (S.t - S.tSwitch > 3.6) {
        S.tSwitch = S.t
        S.ti = (S.ti + 1) % targets.length
      }
      // first visible target from the current index
      for (let k = 0; k < targets.length; k++) {
        const obj = targets[(S.ti + k) % targets.length].ref.current
        if (!obj) continue
        obj.getWorldPosition(S.v)
        S.v.project(camera)
        if (Math.abs(S.v.x) < 0.86 && Math.abs(S.v.y) < 0.8 && S.v.z < 1) {
          S.ti = (S.ti + k) % targets.length
          tx = (S.v.x * 0.5 + 0.5) * size.width
          ty = (-S.v.y * 0.5 + 0.5) * size.height
          break
        }
      }
    }
    if (S.cross.x < 0) {
      S.cross.x = tx
      S.cross.y = ty
    }
    const k = idle ? Math.min(1, dt * 9) : Math.min(1, dt * 30)
    S.cross.x += (tx - S.cross.x) * k
    S.cross.y += (ty - S.cross.y) * k
    if (H.cross) H.cross.style.transform = `translate3d(${S.cross.x.toFixed(1)}px, ${S.cross.y.toFixed(1)}px, 0)`

    // spot reading: what's under the crosshair, plus a little sensor noise
    S.ndc.set((S.cross.x / size.width) * 2 - 1, -(S.cross.y / size.height) * 2 + 1)
    S.ray.setFromCamera(S.ndc, camera)
    const hit = S.ray.intersectObjects(S.list, false)[0]
    let temp = -17.5
    let label = '夜空'
    if (hit) {
      let o: THREE.Object3D | null = hit.object
      while (o && o.userData.tempC === undefined) o = o.parent
      if (o) {
        temp = o.userData.tempC
        label = o.userData.label
        // hot engine bay: hotter toward the front; road warmer right behind the car
        if (label === '引擎盖') temp += (hit.point.x - o.getWorldPosition(S.v).x) * 9
      }
    }
    S.reading += (temp - S.reading) * Math.min(1, dt * 7)
    const noisy = S.reading + (Math.random() - 0.5) * 0.18
    const nv = mode === 'night'
    if (H.val) H.val.textContent = nv ? '— —' : `${noisy.toFixed(1)}°C`
    if (H.lab && S.label !== label) {
      S.label = label
      H.lab.textContent = label
    }

    // AGC: span the palette over what's on screen (fixed = a wide constant span)
    if (S.t - S.lastAgc > 0.4) {
      S.lastAgc = S.t
      if (rangeMode === 'fixed') setThermalRange(fx, FIXED)
      else {
        let lo = 40
        let hi = 0
        for (const o of S.list) {
          const tc = o.userData.tempC
          if (tc === undefined) continue
          o.getWorldPosition(S.v)
          S.v.project(camera)
          if (Math.abs(S.v.x) > 1.05 || Math.abs(S.v.y) > 1.05 || S.v.z > 1) continue
          lo = Math.min(lo, tc)
          hi = Math.max(hi, tc)
        }
        setThermalRange(fx, [Math.min(lo, 4) - 3, Math.max(hi, 40) + 4])
      }
    }
    const st = thermalStatus(fx)
    if (H.hi) H.hi.textContent = `${st.range[1].toFixed(0)}°`
    if (H.lo) H.lo.textContent = `${st.range[0].toFixed(0)}°`
    if (H.nuc) H.nuc.style.opacity = st.nuc ? '1' : '0'
  })
  return null
}

/** visible light only matters to the image intensifier; for the thermal modes it's dimmed so lit surfaces
 *  don't read as warm (the effect's ambient term follows luminance) */
function NightLights({ nv }: { nv: MotionValue<number> }) {
  const scene = useThree((s) => s.scene)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const moon = useRef<THREE.DirectionalLight>(null)
  const pts = useRef<{ l: THREE.PointLight; base: number }[] | null>(null)
  useFrame(() => {
    if (!pts.current) {
      pts.current = []
      scene.traverse((o) => {
        if ((o as THREE.PointLight).isPointLight) pts.current!.push({ l: o as THREE.PointLight, base: (o as THREE.PointLight).intensity })
      })
    }
    const k = 0.18 + 0.82 * nv.get()
    if (hemi.current) hemi.current.intensity = 0.55 * k
    if (moon.current) moon.current.intensity = 0.4 * k
    for (const p of pts.current) p.l.intensity = p.base * k
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#33415e', '#141210', 0.5]} />
      <directionalLight ref={moon} position={[6, 9, 5]} intensity={0.35} color="#9fb4ff" />
    </>
  )
}

function NvFade({ heat, nv }: { heat: ReturnType<typeof useHeat>; nv: MotionValue<number> }) {
  useFrame(() => {
    const k = nv.get()
    for (const h of heat.list.current) h.mat.emissiveIntensity = h.k * (1 - k * (1 - h.nvKeep))
  })
  return null
}

/* ------------------------------------------------------------------ page */

function Clock() {
  const [now, setNow] = useState(() => new Date())
  const start = useRef(performance.now())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const el = Math.floor((performance.now() - start.current) / 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    <>
      <span className="th-rec">
        <i />
        REC {p(Math.floor(el / 3600))}:{p(Math.floor(el / 60) % 60)}:{p(el % 60)}
      </span>
      <span className="th-ts">
        {now.getFullYear()}-{p(now.getMonth() + 1)}-{p(now.getDate())} {p(now.getHours())}:{p(now.getMinutes())}:{p(now.getSeconds())}
      </span>
    </>
  )
}

const MODE_NOTE: Record<ThermalMode, string> = {
  iron: '铁红 · 冷黑 → 紫 → 红 → 黄白',
  rainbow: '彩虹 · 感知均匀的色带',
  white: '白热 · 越亮越热',
  night: '夜视仪 · 微光放大，不是热像',
}

export default function ThermalVision() {
  const [mode, setMode] = useState<ThermalMode>('iron')
  const [rangeMode, setRangeMode] = useState<'auto' | 'fixed'>('auto')
  const fx = useMemo(createThermalEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const heat = useHeat()
  const nv = useMotionValue(0)
  const yaw = useMotionValue(0)
  const pitch = useMotionValue(0)
  const personRef = useRef<THREE.Object3D | null>(null)
  const engineRef = useRef<THREE.Object3D | null>(null)
  const cupRef = useRef<THREE.Object3D | null>(null)
  const catRef = useRef<THREE.Object3D | null>(null)
  const exhaust = useRef<Puffs | null>(null)
  const steam = useRef<Puffs | null>(null)
  const t = useRef(POSTER ? 7.2 : 0)
  const targets = useMemo<Target[]>(
    () => [
      { ref: personRef, label: 'person' },
      { ref: engineRef, label: 'engine' },
      { ref: cupRef, label: 'cup' },
      { ref: catRef, label: 'cat' },
    ],
    [],
  )
  const hud = useRef<Hud>({ pointer: { x: 0, y: 0 }, auto: true, lastMove: -1e9, cross: null, val: null, lab: null, hi: null, lo: null, nuc: null })

  useEffect(() => {
    setThermalMode(fx, mode)
    const a = animate(nv, mode === 'night' ? 1 : 0, { duration: 0.6, ease: [0.4, 0, 0.2, 1] })
    return () => a.stop()
  }, [fx, mode, nv])
  useEffect(() => {
    if (POSTER) setThermalNuc(fx, false)
  }, [fx])

  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const setPointer = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    hud.current.pointer.x = e.clientX - r.left
    hud.current.pointer.y = e.clientY - r.top
    hud.current.lastMove = performance.now()
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    setPointer(e)
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob') && !drag.current) return
    setPointer(e)
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    yaw.set(THREE.MathUtils.clamp(yaw.get() + (e.clientX - d.x) * 0.0016, -0.45, 0.45))
    pitch.set(THREE.MathUtils.clamp(pitch.get() + (e.clientY - d.y) * 0.0012, -0.12, 0.12))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(yaw, yaw.get(), { type: 'inertia', velocity: yaw.getVelocity(), power: 0.4, timeConstant: 500, min: -0.45, max: 0.45, bounceStiffness: 120, bounceDamping: 20 }),
      animate(pitch, pitch.get(), { type: 'inertia', velocity: pitch.getVelocity(), power: 0.3, timeConstant: 400, min: -0.12, max: 0.12, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const label = thermalModes.find((m) => m.id === mode)!.label
  const night = mode === 'night'

  return (
    <div
      className={`stage th th-${mode}${split.open ? ' th-split' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 1.9, 8.6], fov: 42, near: 0.1, far: 80 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={thermalMeta.background} />
        <TimeTick t={t} />
        <NightLights nv={nv} />
        <Street heat={heat} />
        <Person heat={heat} t={t} targetRef={personRef} />
        <Car heat={heat} t={t} engineRef={engineRef} puffs={exhaust} />
        <PuffField apiRef={exhaust} count={70} celsius={78} rate={26} rise={0.35} drift={[-0.8, 0.12]} size={0.09} life={1.7} nv={nv} label="尾气" />
        <Cafe heat={heat} cupRef={cupRef} steam={steam} t={t} />
        <PuffField apiRef={steam} count={40} celsius={56} rate={11} rise={0.24} drift={[0.04, 0]} size={0.026} life={2.8} nv={nv} label="蒸汽" opacity={0.6} />
        <Cat heat={heat} t={t} targetRef={catRef} />
        <NvFade heat={heat} nv={nv} />
        <Rig yaw={yaw} pitch={pitch} hud={hud} targets={targets} fx={fx} rangeMode={rangeMode} mode={mode} />
      </Canvas>

      {/* HUD (kept outside .overlay so the poster shows it too) */}
      <div className="th-hud" aria-hidden>
        <div className="th-cross" ref={(el) => void (hud.current.cross = el)}>
          <svg width="64" height="64" viewBox="-32 -32 64 64">
            <g stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M-26 0H-9M9 0H26M0 -26V-9M0 9V26" />
              <rect x="-4" y="-4" width="8" height="8" />
            </g>
          </svg>
          <div className="th-read">
            <span className="th-val" ref={(el) => void (hud.current.val = el)}>
              —
            </span>
            <span className="th-lab" ref={(el) => void (hud.current.lab = el)} />
          </div>
        </div>
        <div className="th-top">
          <Clock />
          <span className="th-nuc" ref={(el) => void (hud.current.nuc = el)}>
            NUC
          </span>
        </div>
        <div className={`th-scale${night ? ' off' : ''}`}>
          <span className="th-hi" ref={(el) => void (hud.current.hi = el)}>
            90°
          </span>
          <motion.div className="th-bar" animate={{ background: thermalPaletteCss(mode) }} transition={{ duration: 0.5 }} />
          <span className="th-lo" ref={(el) => void (hud.current.lo = el)}>
            -5°
          </span>
          <span className="th-meta">{rangeMode === 'auto' ? 'AUTO' : 'FIXED'} · ε 0.95</span>
        </div>
      </div>

      <div className="overlay">
        <div className="hero-copy th-copy">
          <div className="scrim th-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Thermal Vision · 640 × 512
            </p>
            <h1>
              看见温度，
              <br />
              不是光
            </h1>
            <p className="th-sub">画面按温度重新上色：人脸 34°、引擎 90°、刚倒的咖啡 66°，冷的路面沉进黑里。十字线读的是指着的东西，每十秒传感器还会“咔哒”自校一次。</p>
            <div className="th-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {MODE_NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={thermalModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          <button className="seg th-cycle" disabled={night} onClick={() => setRangeMode((r) => (r === 'auto' ? 'fixed' : 'auto'))}>
            <span>
              量程 <b>{rangeMode === 'auto' ? '自动' : '固定'}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button className="seg th-toggle" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="th-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">移动指针测温 · 拖动平移镜头</p>
      </div>
    </div>
  )
}

function TimeTick({ t }: { t: React.RefObject<number> }) {
  useFrame((_, raw) => {
    if (!POSTER) t.current += Math.min(raw, 1 / 30)
  }, -1)
  return null
}

const css = `
.th { cursor: crosshair; touch-action: none; background: ${thermalMeta.background}; }
.th canvas { display: block; }
.th-copy { pointer-events: none !important; }
.th-scrim { --soft-bg: rgba(5, 4, 8, .72); }
.th-copy .kicker i { background: #ffb000; box-shadow: 0 0 10px #ff7a00; }
.th-copy h1 { font-size: clamp(38px, 4.4vw, 60px); }
.th-sub { max-width: 400px; }
.th-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.th-spec span { display: inline-block; }
.th-cycle span, .th-toggle span { display: inline-flex; align-items: center; gap: 7px; }
.th-cycle b { font-weight: 600; color: var(--fg); }
.th-cycle:disabled { opacity: .4; cursor: default; }
.th .hint { transition: opacity .4s; }
.th-split .hint { opacity: 0; }

.th-hud { position: absolute; inset: 0; pointer-events: none; color: #f4f2ee; font: 500 12px/1 var(--mono); z-index: 2; }
.th-cross { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.th-cross svg { position: absolute; left: -32px; top: -32px; filter: drop-shadow(0 0 2px rgba(0,0,0,.9)); }
.th-read {
  position: absolute; left: 22px; top: 14px; display: flex; flex-direction: column; gap: 5px; white-space: nowrap;
  text-shadow: 0 0 3px #000, 0 0 6px rgba(0,0,0,.8);
}
.th-val { font: 600 17px/1 var(--mono); letter-spacing: .02em; }
.th-lab { font: 500 11px/1 var(--sans); opacity: .82; }
.th-top {
  position: absolute; right: clamp(16px, 3vw, 40px); top: 84px; display: flex; gap: 14px; align-items: center;
  text-shadow: 0 0 4px #000;
}
.th-rec { display: inline-flex; align-items: center; gap: 7px; }
.th-rec i { width: 8px; height: 8px; border-radius: 50%; background: #ff3b30; box-shadow: 0 0 8px #ff3b30; animation: th-blink 1s steps(2) infinite; }
@keyframes th-blink { 50% { opacity: .15; } }
.th-ts { opacity: .75; }
.th-nuc { padding: 3px 6px; border-radius: 3px; background: #f4f2ee; color: #111; opacity: 0; transition: opacity .08s; }
.th-scale {
  position: absolute; right: clamp(16px, 3vw, 40px); top: 50%; transform: translateY(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-shadow: 0 0 4px #000;
  transition: opacity .4s;
}
.th-scale.off { opacity: 0; }
.th-bar { width: 12px; height: min(300px, 38vh); border-radius: 3px; box-shadow: 0 0 0 1px rgba(255,255,255,.25); }
.th-meta { writing-mode: vertical-rl; opacity: .6; font-size: 10.5px; letter-spacing: .08em; margin-top: 4px; }
.th-night .th-hud { color: #c9ffbf; }
.poster .th-top, .poster .th-scale .th-meta { display: none; }
@media (max-width: 760px) {
  .th-copy { transition: opacity .4s; }
  .th-split .th-copy { opacity: 0; }
  .th-sub { display: none; }
  .th-copy h1 { font-size: 34px; }
  .th-spec { margin-top: 12px; }
  .th-top { left: 16px; right: auto; top: 76px; font-size: 11px; }
  .th-scale { top: 128px; transform: none; }
  .th-bar { height: 150px; }
  .th-meta { display: none; }
  .th .dock .seg { padding: 0 8px; }
  .th .dock .dock-sep { margin: 0 1px; }
}
`
