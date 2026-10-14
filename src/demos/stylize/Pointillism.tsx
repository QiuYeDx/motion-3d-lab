import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  createPointillismEffect,
  pointillismGround,
  pointillismMeta,
  pointillismModes,
  setPointillismLens,
  setPointillismMode,
  setPointillismSize,
  setPointillismView,
  type PointillismEffect,
  type PointillismMode,
} from './effects/pointillism'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 点彩派 showcase — a Sunday afternoon on a river island (a nod to "La Grande Jatte"): a sunny lawn crossed
 * by the long shadows of tall trees, a couple under an orange parasol, a woman in white sitting on the
 * grass, a child, a little black dog trotting about, sailboats drifting on the river and the far bank in
 * the haze. Warm sun from behind, cool sky fill — exactly the warm/cool contrast divisionism splits into
 * dabs. On load the view dollies out from the canvas, so the dots blend into the picture before your eyes.
 * The effect lives in ./effects/pointillism.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 10000

const SIZES = [
  { zh: '小', v: 0.72 },
  { zh: '中', v: 1 },
  { zh: '大', v: 1.42 },
]

const SPEC: Record<PointillismMode, { tool: string; note: string }> = {
  seurat: { tool: '修拉 · 1884', note: '小圆点 · 冷暖并置 · 阴影里点补色' },
  signac: { tool: '西涅克 · 1890s', note: '方块笔触 · 顺着形体铺 · 更鲜亮' },
  modern: { tool: '现代波点', note: '六角网格 · 纯色大圆点 · 暗处点更大' },
}

/* ------------------------------------------------------------------ scene */

const std = (color: string, roughness = 0.85, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

function Sky() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 256
    const g = c.getContext('2d')!
    const gr = g.createLinearGradient(0, 0, 0, 256)
    gr.addColorStop(0, '#6f9fd4')
    gr.addColorStop(0.55, '#a9c8e6')
    gr.addColorStop(0.85, '#e8e4cc')
    gr.addColorStop(1, '#f1e2b8')
    g.fillStyle = gr
    g.fillRect(0, 0, 4, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <mesh position={[0, 6, -40]}>
      <planeGeometry args={[220, 70]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  )
}

function Clouds({ t }: { t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const m = useMemo(() => std('#fbf6ea', 1, { emissive: new THREE.Color('#fff4dc'), emissiveIntensity: 0.35 }), [])
  const puffs: [number, number, number, number][] = [
    [-10, 9, -30, 1.0],
    [6, 11, -32, 1.3],
    [18, 8.5, -30, 0.9],
  ]
  useFrame(() => {
    if (!g.current) return
    g.current.children.forEach((c, i) => {
      const p = puffs[i]
      c.position.x = ((((p[0] + t.current * 0.35 + 30) % 60) + 60) % 60) - 30
    })
  })
  return (
    <group ref={g}>
      {puffs.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={[s * 3.2, s, s]}>
          <mesh material={m}>
            <sphereGeometry args={[1, 20, 12]} />
          </mesh>
          <mesh position={[0.7, -0.15, 0.2]} scale={0.75} material={m}>
            <sphereGeometry args={[1, 20, 12]} />
          </mesh>
          <mesh position={[-0.7, -0.2, 0.1]} scale={0.7} material={m}>
            <sphereGeometry args={[1, 20, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Lawn() {
  const geo = useMemo(() => {
    const s = new THREE.Shape()
    // XY here → XZ after rotating (y → −z); the bank edge recedes to the left
    const pts: [number, number][] = [
      [-0.6, -8],
      [-1.4, -3],
      [-2.4, 1],
      [-3.6, 5],
      [-5.0, 9.5],
      [20, 9.5],
      [20, -8],
    ]
    s.moveTo(pts[0][0], pts[0][1])
    pts.slice(1).forEach(([x, y]) => s.lineTo(x, y))
    const g = new THREE.ShapeGeometry(s, 24)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const grass = useMemo(() => std('#78b24c', 0.95), [])
  return (
    <>
      <mesh geometry={geo} position={[0, 0.02, 0]} material={grass} receiveShadow />
    </>
  )
}

function Tree({ pos, h, s }: { pos: [number, number]; h: number; s: number }) {
  const M = useMemo(() => ({ bark: std('#4a3426', 0.9), leaf: std('#3d7d43', 0.9), leaf2: std('#4f9248', 0.9) }), [])
  const blobs: [number, number, number, number][] = [
    [0, 0, 0, 1.5],
    [-1.1, -0.4, 0.3, 1.1],
    [1.0, -0.3, -0.2, 1.15],
    [0.3, 0.9, 0.1, 1.0],
    [-0.4, -0.6, -0.9, 0.95],
  ]
  return (
    <group position={[pos[0], 0, pos[1]]} scale={s}>
      <mesh position={[0, h / 2, 0]} material={M.bark} castShadow receiveShadow>
        <cylinderGeometry args={[0.13, 0.22, h, 10]} />
      </mesh>
      {blobs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, h + y, z]} material={i % 2 ? M.leaf2 : M.leaf} castShadow receiveShadow>
          <sphereGeometry args={[r, 24, 16]} />
        </mesh>
      ))}
    </group>
  )
}

function Lady({ t }: { t: React.RefObject<number> }) {
  const parasol = useRef<THREE.Group>(null)
  const M = useMemo(
    () => ({
      dress: std('#3c2f4a', 0.8),
      skin: std('#e8c4a0', 0.7),
      hat: std('#2a2430', 0.7),
      para: std('#e2632f', 0.7, { side: THREE.DoubleSide }),
      stick: std('#3a2a20', 0.6),
      coat: std('#2b2a33', 0.8),
      trousers: std('#3a3946', 0.8),
    }),
    [],
  )
  useFrame(() => {
    if (parasol.current) parasol.current.rotation.y = t.current * 0.6
  })
  return (
    <group position={[1.7, 0, 3.6]} rotation={[0, -0.15, 0]}>
      {/* lady, in profile, with a bustle */}
      <group>
        <mesh position={[0, 0.55, 0]} material={M.dress} castShadow receiveShadow>
          <coneGeometry args={[0.46, 1.1, 24]} />
        </mesh>
        <mesh position={[0.32, 0.72, 0]} scale={[0.9, 0.8, 0.8]} material={M.dress} castShadow>
          <sphereGeometry args={[0.28, 16, 12]} />
        </mesh>
        <mesh position={[0, 1.3, 0]} material={M.dress} castShadow>
          <cylinderGeometry args={[0.13, 0.18, 0.5, 14]} />
        </mesh>
        <mesh position={[0, 1.68, 0]} material={M.skin} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        <mesh position={[0, 1.8, 0]} material={M.hat} castShadow>
          <cylinderGeometry args={[0.1, 0.18, 0.08, 16]} />
        </mesh>
        <group ref={parasol} position={[-0.12, 2.15, 0.05]} rotation={[0, 0, 0.12]}>
          <mesh position={[0, -0.45, 0]} material={M.stick}>
            <cylinderGeometry args={[0.012, 0.012, 0.9, 6]} />
          </mesh>
          <mesh material={M.para} castShadow>
            <coneGeometry args={[0.62, 0.22, 16, 1, true]} />
          </mesh>
        </group>
      </group>
      {/* gentleman, top hat and cane */}
      <group position={[0.75, 0, 0.15]}>
        <mesh position={[-0.07, 0.42, 0]} material={M.trousers} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.84, 8]} />
        </mesh>
        <mesh position={[0.07, 0.42, 0]} material={M.trousers} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.84, 8]} />
        </mesh>
        <mesh position={[0, 1.22, 0]} material={M.coat} castShadow>
          <cylinderGeometry args={[0.2, 0.24, 0.85, 14]} />
        </mesh>
        <mesh position={[0, 1.75, 0]} material={M.skin} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        <mesh position={[0, 1.95, 0]} material={M.hat} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.26, 16]} />
        </mesh>
        <mesh position={[0, 1.83, 0]} material={M.hat}>
          <cylinderGeometry args={[0.17, 0.17, 0.02, 16]} />
        </mesh>
        <mesh position={[0.28, 0.45, 0.05]} rotation={[0, 0, -0.12]} material={M.stick}>
          <cylinderGeometry args={[0.015, 0.015, 0.92, 6]} />
        </mesh>
      </group>
    </group>
  )
}

function SittingWoman() {
  const M = useMemo(() => ({ white: std('#f3efe4', 0.8), skin: std('#e8c4a0', 0.7), para: std('#e98aa6', 0.7, { side: THREE.DoubleSide }), hat: std('#d9b46a', 0.8) }), [])
  return (
    <group position={[4.3, 0, 2.0]} rotation={[0, -0.6, 0]}>
      <mesh position={[0, 0.2, 0]} scale={[1, 0.42, 0.75]} material={M.white} castShadow receiveShadow>
        <sphereGeometry args={[0.55, 24, 14]} />
      </mesh>
      <mesh position={[-0.12, 0.6, 0]} material={M.white} castShadow>
        <cylinderGeometry args={[0.12, 0.17, 0.5, 14]} />
      </mesh>
      <mesh position={[-0.12, 0.97, 0]} material={M.skin} castShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
      </mesh>
      <mesh position={[-0.12, 1.07, 0]} material={M.hat} castShadow>
        <cylinderGeometry args={[0.2, 0.22, 0.04, 18]} />
      </mesh>
      <group position={[0.25, 1.15, -0.1]} rotation={[0.3, 0, -0.5]}>
        <mesh position={[0, -0.35, 0]} material={M.hat}>
          <cylinderGeometry args={[0.01, 0.01, 0.7, 6]} />
        </mesh>
        <mesh material={M.para} castShadow>
          <coneGeometry args={[0.5, 0.18, 16, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}

function Child() {
  const M = useMemo(() => ({ white: std('#f5f1e6', 0.8), skin: std('#e8c4a0', 0.7), sash: std('#d64a3a', 0.7) }), [])
  return (
    <group position={[6.0, 0, -1.0]}>
      <mesh position={[0, 0.38, 0]} material={M.white} castShadow>
        <coneGeometry args={[0.28, 0.7, 18]} />
      </mesh>
      <mesh position={[0, 0.66, 0]} material={M.sash}>
        <cylinderGeometry args={[0.12, 0.13, 0.06, 14]} />
      </mesh>
      <mesh position={[0, 0.88, 0]} material={M.skin} castShadow>
        <sphereGeometry args={[0.11, 14, 10]} />
      </mesh>
    </group>
  )
}

function Dog({ t }: { t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const m = useMemo(() => std('#1d1b20', 0.6), [])
  useFrame(() => {
    if (!g.current) return
    const s = t.current * 0.32
    const x = 1.0 + Math.sin(s) * 1.3
    g.current.position.set(x, Math.abs(Math.sin(t.current * 7)) * 0.04, 5.0 + Math.sin(s * 2) * 0.3)
    g.current.rotation.y = Math.cos(s) > 0 ? 0 : Math.PI
  })
  return (
    <group ref={g}>
      <mesh position={[0, 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={m} castShadow>
        <capsuleGeometry args={[0.09, 0.28, 6, 10]} />
      </mesh>
      <mesh position={[0.22, 0.3, 0]} material={m} castShadow>
        <sphereGeometry args={[0.08, 12, 8]} />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.07, 0]} material={m} castShadow>
          <boxGeometry args={[0.035, 0.14, 0.12]} />
        </mesh>
      ))}
      <mesh position={[-0.22, 0.28, 0]} rotation={[0, 0, 0.8]} material={m}>
        <cylinderGeometry args={[0.015, 0.02, 0.16, 6]} />
      </mesh>
    </group>
  )
}

function Boat({ t, z, speed, phase, sail, s }: { t: React.RefObject<number>; z: number; speed: number; phase: number; sail: string; s: number }) {
  const g = useRef<THREE.Group>(null)
  const M = useMemo(() => {
    const tri = new THREE.Shape()
    tri.moveTo(0, 0)
    tri.lineTo(0, 1.6)
    tri.lineTo(-0.95, 0.05)
    tri.closePath()
    return { hull: std('#f2ede0', 0.6), sail: std(sail, 0.85, { side: THREE.DoubleSide }), mast: std('#5a4030', 0.7), tri: new THREE.ShapeGeometry(tri) }
  }, [sail])
  useFrame(() => {
    if (!g.current) return
    const x = ((((t.current * speed + phase) % 18) + 18) % 18) - 14
    g.current.position.set(x, Math.sin(t.current * 1.3 + phase) * 0.03, z)
    g.current.rotation.z = Math.sin(t.current * 1.1 + phase) * 0.04
  })
  return (
    <group ref={g} scale={s}>
      <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.6, 1, 0.45]} material={M.hull} castShadow>
        <capsuleGeometry args={[0.16, 0.9, 6, 12]} />
      </mesh>
      <mesh position={[0.1, 0.9, 0]} material={M.mast}>
        <cylinderGeometry args={[0.018, 0.018, 1.7, 6]} />
      </mesh>
      <mesh geometry={M.tri} position={[0.08, 0.2, 0]} material={M.sail} castShadow />
    </group>
  )
}

function FarBank() {
  const M = useMemo(() => ({ land: std('#6f9a58', 0.95), tree: std('#3f6f4a', 0.95), wall: std('#e7dcc4', 0.9), roof: std('#b8664a', 0.9) }), [])
  const trees = useMemo(() => Array.from({ length: 18 }, (_, i) => [-22 + i * 2.1 + Math.sin(i * 7.3) * 0.6, 0.6 + Math.abs(Math.sin(i * 3.1)) * 0.7] as [number, number]), [])
  return (
    <group position={[0, 0, -11]}>
      <mesh position={[0, 0.15, 0]} material={M.land} receiveShadow>
        <boxGeometry args={[60, 0.4, 3]} />
      </mesh>
      {trees.map(([x, r], i) => (
        <mesh key={i} position={[x, 0.4 + r, -0.4]} scale={[1, 1.25, 1]} material={M.tree}>
          <sphereGeometry args={[r, 16, 10]} />
        </mesh>
      ))}
      {[-7, -4.6, 1.2].map((x, i) => (
        <group key={i} position={[x, 0.35, 0.6]}>
          <mesh position={[0, 0.4, 0]} material={M.wall}>
            <boxGeometry args={[1.2, 0.8, 0.6]} />
          </mesh>
          <mesh position={[0, 0.95, 0]} rotation={[0, 0, Math.PI / 4]} scale={[1, 1, 0.62]} material={M.roof}>
            <boxGeometry args={[0.6, 0.6, 1]} />
          </mesh>
        </group>
      ))}
      {/* a factory chimney, as in Seurat's river views */}
      <mesh position={[-2.6, 1.5, -0.2]} material={M.roof}>
        <cylinderGeometry args={[0.12, 0.18, 2.6, 10]} />
      </mesh>
    </group>
  )
}

function Park({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 5 : 0)
  const water = useMemo(() => std('#2479c4', 0.8), [])

  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    if (rig.current) {
      const k = mobile ? 0.82 : Math.min(1, vw / 11.5)
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER ? -1.2 * k : mobile ? -2.1 * k : 0, mobile ? 0.7 : 0, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get(), Math.sin(t.current * 0.1) * 0.05 + ry.get(), 0)
  })

  return (
    <>
      <hemisphereLight args={['#b4cdee', '#7f9a5a', 1.15]} />
      <directionalLight
        position={[-4, 7.5, -10]}
        intensity={3.1}
        color="#ffe6bd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[3, 3, 8]} intensity={0.55} color="#dfe8ff" />
      <Sky />
      <Clouds t={t} />
      <group ref={rig}>
        <group ref={spin} position={[0, 0, 0]}>
          <mesh position={[0, -0.03, -2]} rotation={[-Math.PI / 2, 0, 0]} material={water} receiveShadow>
            <planeGeometry args={[80, 26]} />
          </mesh>
          <FarBank />
          <Lawn />
          <Tree pos={[6.6, -5.2]} h={4.1} s={0.92} />
          <Tree pos={[10.2, -7.6]} h={4.6} s={1} />
          <Tree pos={[2.4, -9.6]} h={3.4} s={0.8} />
          <Tree pos={[8.2, 1.2]} h={5.2} s={1.15} />
          <Lady t={t} />
          <SittingWoman />
          <Child />
          <Dog t={t} />
          <Boat t={t} z={-4.5} speed={0.35} phase={2} sail="#f4ead2" s={1.1} />
          <Boat t={t} z={-7.5} speed={0.22} phase={11} sail="#f2b45a" s={0.8} />
          <Boat t={t} z={-2.4} speed={0.28} phase={7} sail="#fbf6ea" s={1.25} />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Pointillism() {
  const [mode, setMode] = useState<PointillismMode>('seurat')
  const [sizeI, setSizeI] = useState(MOBILE ? 0 : 1)
  const [view, setView] = useState<'far' | 'near'>('far')
  const fx = useMemo(() => {
    const f = createPointillismEffect()
    // start up close: once the style is on screen the view dollies out and the dots blend together
    if (!POSTER) (f as PointillismEffect).pt.view = 2.7
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())

  useEffect(() => setPointillismMode(fx, mode), [fx, mode])
  useEffect(() => setPointillismSize(fx, SIZES[sizeI].v), [fx, sizeI])
  useEffect(() => setPointillismView(fx, view), [fx, view])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => pointillismModes[(pointillismModes.findIndex((o) => o.id === m) + 1) % pointillismModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const lensOk = (e: React.PointerEvent) => e.pointerType === 'mouse' && !split.open && !(e.target as HTMLElement).closest('.dock, .osplit-knob')
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    setPointillismLens(fx, e.clientX, e.clientY, lensOk(e) && !drag.current, MOBILE ? 90 : 118, 3.2)
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.0035, -0.45, 0.45))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.0018, -0.05, 0.12))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    setPointillismLens(fx, e.clientX, e.clientY, lensOk(e))
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600, min: -0.45, max: 0.45, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.05, max: 0.12, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }
  const onLeave = (e: React.PointerEvent) => setPointillismLens(fx, e.clientX, e.clientY, false)

  const S = SPEC[mode]
  const label = pointillismModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage pt pt-${mode}${split.open ? ' pt-split' : ''}`}
      style={{ background: pointillismGround[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onLeave}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 3.4, 14.5], fov: 33 }} onCreated={({ camera }) => camera.lookAt(0, 1.1, -1)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={pointillismMeta.background} />
        <Park ry={ry} rx={rx} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy pt-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Pointillism · Optical Mixing
            </p>
            <h1>
              颜色不在画布上，
              <br />
              在你眼睛里混合
            </h1>
            <p className="pt-sub">每一点都是不调和的纯色：绿草是黄点和蓝点并排，阴影里还藏着橙色的补色点。凑近看是一粒粒颜料，退远一步，它们才融成午后的阳光。</p>
            <div className="pt-spec">
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

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={pointillismModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg pt-cycle" onClick={() => setSizeI((d) => (d + 1) % SIZES.length)}>
              <span>
                点 <b>{SIZES[sizeI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="pt-lab">点大小</span>
              <Seg items={SIZES.map((d, i) => ({ value: i, label: d.zh }))} value={sizeI} onChange={setSizeI} />
            </>
          )}
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'far', label: '远看' },
              { value: 'near', label: '近看' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'far' | 'near')}
          />
          <span className="dock-sep" />
          <button className="seg pt-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="pt-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">鼠标移到画上看放大的点 · 拖动转动</p>
      </div>
    </div>
  )
}

const css = `
.pt { cursor: grab; touch-action: none; transition: background .7s; }
.pt:active { cursor: grabbing; }
.pt canvas { display: block; }
.pt-copy { pointer-events: none !important; --soft-bg: #f1ead9; }
.pt-modern .pt-copy { --soft-bg: #fbfaf6; }
.pt-copy .scrim { opacity: .9; }
.pt-copy .kicker { color: #4f4a40; }
.pt-copy .kicker i { background: #e2802f; box-shadow: 9px 0 0 #2e47a3, 18px 0 0 #a4c24a; margin-right: 18px; }
.pt-copy h1 { font-size: clamp(36px, 4.1vw, 56px); color: #22201c; }
.pt-sub { max-width: 400px; color: #3f3b34 !important; }
.pt-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #3f3b34; }
.pt-spec span { display: inline-flex; align-items: center; gap: 10px; }
.pt-spec b {
  font-weight: 600; color: #22201c; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(34, 32, 28, .28);
}
.pt-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.pt-btn span, .pt-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.pt-cycle b { font-weight: 600; color: var(--fg); }
.pt .hint { transition: opacity .4s; color: #3f3b34; padding: 4px 10px; border-radius: 999px; background: rgba(241, 234, 217, .8); }
.pt-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .pt-copy { transition: opacity .4s; }
  .pt-split .pt-copy { opacity: 0; }
  .pt-sub { display: none; }
  .pt-copy h1 { font-size: 30px; }
  .pt-spec { margin-top: 10px; font-size: 11px; }
  .pt .dock .seg { padding: 0 8px; }
  .pt .dock .dock-sep { margin: 0 1px; }
}
`
