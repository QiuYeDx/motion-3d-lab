import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { createCrayonEffect, crayonMeta, crayonModes, crayonPaper, crayonProgress, drawCrayon, setCrayonMode, setCrayonSize, type CrayonMode } from './effects/crayon'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 蜡笔粉彩 showcase — the picture every child draws: a yellow house with a red roof on a green hill, a tree
 * with apples, a dog wagging its tail, a rainbow, flowers and a smiling sun whose rays turn. Flat, bright
 * colour masses with a sunlit side and a shadow side, so the crayon box gets a light and a hard press.
 * The sky is left as bare paper, the way it is in a real crayon drawing. Effect: ./effects/crayon.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 10000

const SIZES = [
  { zh: '细', v: 0.74 },
  { zh: '中', v: 1 },
  { zh: '粗', v: 1.42 },
]

const SPEC: Record<CrayonMode, { tool: string; note: string }> = {
  crayon: { tool: '24 色蜡笔', note: '白卡纸 · 纸纹凹处留白 · 越深越用力' },
  soft: { tool: '软粉彩', note: '灰蓝粉彩纸 · 指腹揉开 · 粉尘' },
  oil: { tool: '油画棒', note: '厚涂叠色 · 刮出下层的颜色' },
}

/* ------------------------------------------------------------------ props */

const mat = (color: string, roughness = 0.75, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

function House() {
  const M = useMemo(
    () => ({
      wall: mat('#ffd23f'),
      roof: mat('#e2412f'),
      door: mat('#8b4b26'),
      glass: mat('#7cc8f2', 0.4),
      frame: mat('#fbfaf3'),
      brick: mat('#b8452b'),
      knob: mat('#ffb31f', 0.4),
    }),
    [],
  )
  return (
    <group position={[-0.95, 0.42, -0.1]} rotation={[0, 0.32, 0]}>
      <mesh position={[0, 0.62, 0]} material={M.wall} castShadow receiveShadow>
        <boxGeometry args={[1.7, 1.24, 1.25]} />
      </mesh>
      {/* roof: a triangular prism */}
      <mesh position={[0, 1.55, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1.18]} material={M.roof} castShadow receiveShadow>
        <cylinderGeometry args={[0.75, 0.75, 2.0, 3]} />
      </mesh>
      <mesh position={[0.48, 1.85, -0.25]} material={M.brick} castShadow>
        <boxGeometry args={[0.24, 0.62, 0.24]} />
      </mesh>
      {/* door + knob */}
      <mesh position={[-0.32, 0.4, 0.63]} material={M.door} castShadow>
        <boxGeometry args={[0.42, 0.8, 0.04]} />
      </mesh>
      <mesh position={[-0.2, 0.4, 0.66]} material={M.knob}>
        <sphereGeometry args={[0.035, 12, 8]} />
      </mesh>
      {/* window with a cross */}
      <group position={[0.38, 0.72, 0.63]}>
        <mesh material={M.frame}>
          <boxGeometry args={[0.6, 0.52, 0.03]} />
        </mesh>
        <mesh position={[0, 0, 0.02]} material={M.glass}>
          <boxGeometry args={[0.5, 0.42, 0.02]} />
        </mesh>
        <mesh position={[0, 0, 0.035]} material={M.frame}>
          <boxGeometry args={[0.05, 0.44, 0.02]} />
        </mesh>
        <mesh position={[0, 0, 0.035]} material={M.frame}>
          <boxGeometry args={[0.52, 0.05, 0.02]} />
        </mesh>
      </group>
      {/* a round attic window */}
      <mesh position={[0, 1.45, 0.66]} rotation={[Math.PI / 2, 0, 0]} material={M.glass}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 24]} />
      </mesh>
    </group>
  )
}

function Tree({ t }: { t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const M = useMemo(() => ({ bark: mat('#8b4b26', 0.9), leaf: mat('#2f9f4c', 0.8), leaf2: mat('#4cb84a', 0.8), apple: mat('#e0352c', 0.45) }), [])
  useFrame(() => {
    if (g.current) g.current.rotation.z = Math.sin(t.current * 0.9) * 0.025
  })
  const apples: [number, number, number][] = [
    [-0.42, 2.05, 0.48],
    [0.35, 1.8, 0.55],
    [0.05, 2.5, 0.55],
    [0.55, 2.35, 0.25],
    [-0.2, 1.65, 0.6],
  ]
  return (
    <group position={[1.75, 0.3, -0.45]}>
      <group ref={g}>
        <mesh position={[0, 0.7, 0]} material={M.bark} castShadow receiveShadow>
          <cylinderGeometry args={[0.13, 0.2, 1.5, 12]} />
        </mesh>
        <mesh position={[0, 2.05, 0]} material={M.leaf} castShadow receiveShadow>
          <sphereGeometry args={[0.72, 32, 20]} />
        </mesh>
        <mesh position={[-0.48, 1.8, 0.1]} material={M.leaf2} castShadow receiveShadow>
          <sphereGeometry args={[0.5, 28, 18]} />
        </mesh>
        <mesh position={[0.5, 1.75, 0.05]} material={M.leaf2} castShadow receiveShadow>
          <sphereGeometry args={[0.52, 28, 18]} />
        </mesh>
        <mesh position={[0.1, 2.6, -0.05]} material={M.leaf} castShadow>
          <sphereGeometry args={[0.45, 28, 18]} />
        </mesh>
        {apples.map((p, i) => (
          <mesh key={i} position={p} material={M.apple} castShadow>
            <sphereGeometry args={[0.1, 16, 12]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Dog({ t }: { t: React.RefObject<number> }) {
  const body = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const M = useMemo(() => ({ fur: mat('#d98a3d', 0.85), dark: mat('#5a3320', 0.85), nose: mat('#2a2626', 0.4), white: mat('#fbfaf3', 0.8), collar: mat('#2b58d2', 0.5) }), [])
  useFrame(() => {
    const s = t.current
    if (body.current) body.current.position.y = Math.abs(Math.sin(s * 2.4)) * 0.07
    if (tail.current) tail.current.rotation.x = Math.sin(s * 11) * 0.55
    if (head.current) head.current.rotation.z = Math.sin(s * 1.3) * 0.12
  })
  return (
    <group position={[0.55, 0.38, 1.0]} rotation={[0, -0.35, 0]} scale={0.95}>
      <group ref={body}>
        <mesh position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} material={M.fur} castShadow receiveShadow>
          <capsuleGeometry args={[0.22, 0.5, 8, 16]} />
        </mesh>
        <mesh position={[-0.05, 0.56, 0.12]} scale={[1.2, 0.6, 0.6]} material={M.dark} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        {[
          [-0.28, 0.12],
          [0.28, 0.12],
          [-0.28, -0.12],
          [0.28, -0.12],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.16, z]} material={M.fur} castShadow>
            <cylinderGeometry args={[0.065, 0.06, 0.34, 10]} />
          </mesh>
        ))}
        <group ref={head} position={[0.5, 0.72, 0]}>
          <mesh material={M.fur} castShadow>
            <sphereGeometry args={[0.24, 24, 18]} />
          </mesh>
          <mesh position={[0.2, -0.06, 0]} scale={[1.2, 0.8, 0.9]} material={M.white} castShadow>
            <sphereGeometry args={[0.12, 16, 12]} />
          </mesh>
          <mesh position={[0.34, -0.03, 0]} material={M.nose}>
            <sphereGeometry args={[0.05, 12, 8]} />
          </mesh>
          <mesh position={[0.15, 0.08, 0.12]} material={M.nose}>
            <sphereGeometry args={[0.032, 10, 8]} />
          </mesh>
          <mesh position={[0.15, 0.08, -0.12]} material={M.nose}>
            <sphereGeometry args={[0.032, 10, 8]} />
          </mesh>
          <mesh position={[-0.04, 0.05, 0.22]} rotation={[0.5, 0, 0.2]} scale={[0.6, 1.3, 0.3]} material={M.dark} castShadow>
            <sphereGeometry args={[0.13, 14, 10]} />
          </mesh>
          <mesh position={[-0.04, 0.05, -0.22]} rotation={[-0.5, 0, 0.2]} scale={[0.6, 1.3, 0.3]} material={M.dark} castShadow>
            <sphereGeometry args={[0.13, 14, 10]} />
          </mesh>
          <mesh position={[-0.05, -0.18, 0]} rotation={[0, 0, Math.PI / 2]} material={M.collar}>
            <torusGeometry args={[0.16, 0.035, 8, 24]} />
          </mesh>
        </group>
        <group ref={tail} position={[-0.45, 0.55, 0]}>
          <mesh position={[-0.12, 0.14, 0]} rotation={[0, 0, 0.75]} material={M.fur} castShadow>
            <capsuleGeometry args={[0.045, 0.28, 6, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Sun({ t }: { t: React.RefObject<number> }) {
  const rays = useRef<THREE.Group>(null)
  const face = useRef<THREE.Group>(null)
  const M = useMemo(
    () => ({
      sun: mat('#ffd426', 0.5, { emissive: new THREE.Color('#ffb000'), emissiveIntensity: 0.35 }),
      ray: mat('#ffb31f', 0.5, { emissive: new THREE.Color('#ff9a10'), emissiveIntensity: 0.75 }),
      ink: mat('#55301c', 0.6),
    }),
    [],
  )
  useFrame(() => {
    if (rays.current) rays.current.rotation.z = -t.current * 0.35
    if (face.current) face.current.position.y = Math.sin(t.current * 1.1) * 0.04
  })
  return (
    <group position={[2.9, 3.45, -1.6]}>
      <group ref={face}>
        <mesh material={M.sun}>
          <sphereGeometry args={[0.55, 32, 24]} />
        </mesh>
        <mesh position={[-0.17, 0.12, 0.5]} material={M.ink}>
          <sphereGeometry args={[0.055, 10, 8]} />
        </mesh>
        <mesh position={[0.17, 0.12, 0.5]} material={M.ink}>
          <sphereGeometry args={[0.055, 10, 8]} />
        </mesh>
        <mesh position={[0, -0.02, 0.48]} rotation={[0, 0, Math.PI * 1.15]} material={M.ink}>
          <torusGeometry args={[0.22, 0.03, 8, 24, Math.PI * 0.7]} />
        </mesh>
      </group>
      <group ref={rays}>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0]} rotation={[0, 0, a - Math.PI / 2]} material={M.ray}>
              <coneGeometry args={[0.09, 0.42, 10]} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

const RAINBOW = ['#e0352c', '#ff8a1e', '#ffdc26', '#2f9f4c', '#1e8dd6', '#7a43b8']

function Rainbow() {
  // flat bands on one plane: one outline around the whole arc, none between the colours (as drawn by hand)
  const M = useMemo(() => RAINBOW.map((c) => mat(c, 0.8, { side: THREE.DoubleSide })), [])
  return (
    <group position={[0.15, 0.2, -2.6]}>
      {M.map((m, i) => (
        <mesh key={i} material={m}>
          <ringGeometry args={[3.45 - i * 0.2 - 0.1, 3.45 - i * 0.2 + 0.1, 96, 1, 0, Math.PI]} />
        </mesh>
      ))}
    </group>
  )
}

function Cloud({ t, y, z, speed, phase, s }: { t: React.RefObject<number>; y: number; z: number; speed: number; phase: number; s: number }) {
  const g = useRef<THREE.Group>(null)
  const m = useMemo(() => mat('#ffffff', 0.9), [])
  useFrame(() => {
    if (!g.current) return
    const x = ((((t.current * speed + phase) % 9) + 9) % 9) - 4.5
    g.current.position.set(x, y + Math.sin(t.current * 0.5 + phase) * 0.05, z)
  })
  return (
    <group ref={g} scale={s}>
      <mesh material={m}>
        <sphereGeometry args={[0.36, 20, 14]} />
      </mesh>
      <mesh position={[0.36, -0.06, 0]} material={m}>
        <sphereGeometry args={[0.28, 20, 14]} />
      </mesh>
      <mesh position={[-0.36, -0.08, 0]} material={m}>
        <sphereGeometry args={[0.26, 20, 14]} />
      </mesh>
      <mesh position={[0.1, 0.2, 0]} material={m}>
        <sphereGeometry args={[0.26, 20, 14]} />
      </mesh>
    </group>
  )
}

function Flowers({ t }: { t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const M = useMemo(() => ({ stem: mat('#1e6a3f', 0.8), heads: ['#f25b9e', '#7a43b8', '#ffdc26', '#e0352c', '#72c6f0'].map((c) => mat(c, 0.6)), mid: mat('#ffb31f', 0.5) }), [])
  const spots: [number, number, number][] = [
    [-2.2, 0.22, 1.2],
    [-1.75, 0.3, 1.55],
    [-0.35, 0.36, 1.75],
    [1.45, 0.3, 1.45],
    [2.2, 0.2, 1.05],
  ]
  useFrame(() => {
    g.current?.children.forEach((c, i) => (c.rotation.z = Math.sin(t.current * 1.4 + i * 1.7) * 0.08))
  })
  return (
    <group ref={g}>
      {spots.map((p, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.2, 0]} material={M.stem} castShadow>
            <cylinderGeometry args={[0.025, 0.025, 0.4, 6]} />
          </mesh>
          <mesh position={[0, 0.44, 0]} scale={[1, 1, 0.5]} material={M.heads[i % M.heads.length]} castShadow>
            <sphereGeometry args={[0.13, 16, 12]} />
          </mesh>
          <mesh position={[0, 0.44, 0.07]} material={M.mid}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Drawing({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 3.2 : 0)
  const grass = useMemo(() => mat('#58b947', 0.95), [])
  const path = useMemo(() => mat('#d3a266', 0.95), [])

  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(0.86, vw / 8.8, vh / 6.0) : mobile ? Math.min(0.62, vw / 6.9) : Math.min(0.76, vh / 6.9, vw / 12.4)
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.18, POSTER ? -0.5 * k : mobile ? vh * 0.09 : -0.38 * k, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get(), Math.sin(t.current * 0.13) * 0.14 + ry.get(), 0)
  })

  return (
    <>
      <hemisphereLight args={['#fff7e8', '#7f9a6a', 1.05]} />
      <directionalLight
        position={[-3.2, 6.5, 8.5]}
        intensity={2.5}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[5, 2, -3]} intensity={0.4} color="#b9d4ff" />
      <group ref={rig}>
        <Sun t={t} />
        <Cloud t={t} y={3.2} z={-2.2} speed={0.22} phase={1.5} s={1} />
        <Cloud t={t} y={2.55} z={-2.0} speed={0.16} phase={6.2} s={0.8} />
        <group ref={spin}>
          {/* the hill */}
          <mesh position={[0, -0.92, 0]} scale={[4.3, 1.27, 1.95]} material={grass} receiveShadow castShadow>
            <sphereGeometry args={[1, 64, 32]} />
          </mesh>
          {/* a path from the door */}
          <mesh position={[-0.65, 0.33, 1.15]} rotation={[-1.25, 0, 0.25]} scale={[0.35, 1.05, 1]} material={path} receiveShadow>
            <circleGeometry args={[1, 32]} />
          </mesh>
          <Rainbow />
          <House />
          <Tree t={t} />
          <Dog t={t} />
          <Flowers t={t} />
        </group>
      </group>
    </>
  )
}

function DrawProgress({ fx, el }: { fx: StylizeEffect; el: React.RefObject<HTMLButtonElement | null> }) {
  useFrame(() => {
    const b = el.current
    if (!b) return
    const p = crayonProgress(fx)
    b.style.setProperty('--p', p.toFixed(3))
    b.dataset.drawing = p < 1 ? '1' : '0'
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function CrayonPastel() {
  const [mode, setMode] = useState<CrayonMode>('crayon')
  const [sizeI, setSizeI] = useState(1)
  const fx = useMemo(createCrayonEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const drawBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!POSTER) drawCrayon(fx)
  }, [fx])
  useEffect(() => setCrayonMode(fx, mode), [fx, mode])
  useEffect(() => setCrayonSize(fx, SIZES[sizeI].v), [fx, sizeI])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current || crayonProgress(fx) < 1) return
      setMode((m) => crayonModes[(crayonModes.findIndex((o) => o.id === m) + 1) % crayonModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [fx])
  const touch = () => (lastInput.current = performance.now())

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.005, -0.8, 0.8))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.0025, -0.1, 0.24))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600, min: -0.8, max: 0.8, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.1, max: 0.24, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const S = SPEC[mode]
  const label = crayonModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage cr cr-${mode}${split.open ? ' cr-split' : ''}`}
      style={{ background: crayonPaper[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 1.7, 10], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={crayonMeta.background} />
        <Drawing ry={ry} rx={rx} />
        <DrawProgress fx={fx} el={drawBtn} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy cr-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Crayon &amp; Pastel · 24 色
            </p>
            <h1>
              一盒蜡笔，
              <br />
              涂一个下午
            </h1>
            <p className="cr-sub">每块颜色先对到盒子里最接近的那支笔，越深越用力：轻轻涂只蹭到纸纹的凸起，用力压才把凹处填满、泛出蜡光。线条画歪一点，颜色涂出界一点。</p>
            <div className="cr-spec">
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
            <div className="cr-box" aria-hidden>
              {['#e0352c', '#ff8a1e', '#ffdc26', '#84c440', '#2f9f4c', '#72c6f0', '#2b58d2', '#7a43b8', '#f25b9e', '#8b4b26', '#2a2626'].map((c, i) => (
                <motion.i key={c} style={{ background: c }} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 + i * 0.04, type: 'spring', stiffness: 380, damping: 22 }} />
              ))}
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={crayonModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg cr-cycle" onClick={() => setSizeI((d) => (d + 1) % SIZES.length)}>
              <span>
                笔触 <b>{SIZES[sizeI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="cr-lab">笔触</span>
              <Seg items={SIZES.map((d, i) => ({ value: i, label: d.zh }))} value={sizeI} onChange={setSizeI} />
            </>
          )}
          <span className="dock-sep" />
          <button ref={drawBtn} className="seg cr-btn cr-draw" onClick={() => drawCrayon(fx)} aria-label="画一遍">
            <span>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
                <path d="M2.5 13.5 4 9.6 11.2 2.4a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L6.4 12Z" fill="currentColor" opacity=".9" />
                <path d="M2.5 13.5 4 9.6l2.4 2.4Z" fill="#fff" opacity=".7" />
              </svg>
              画一遍
            </span>
            <i className="cr-bar" />
          </button>
          <button className="seg cr-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="cr-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动画面 · 闲置时自动换画材</p>
      </div>
    </div>
  )
}

const css = `
.cr { cursor: grab; touch-action: none; transition: background .7s; }
.cr:active { cursor: grabbing; }
.cr canvas { display: block; }
.cr-copy { pointer-events: none !important; --soft-bg: #fbf8f1; }
.cr-soft .cr-copy { --soft-bg: #9fadbb; }
.cr-oil .cr-copy { --soft-bg: #f0e5cd; }
.cr-copy .scrim { opacity: .75; transition: opacity .5s; }
.cr-split .cr-copy .scrim { opacity: .95; }
.cr-split .cr-copy { --soft-bg: #fbf8f1 !important; }
.cr-copy .kicker { color: #5c554c; transition: color .6s; }
.cr-copy .kicker i { background: #e0352c; }
.cr-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #24211e; }
.cr-sub { max-width: 400px; color: #4a453f !important; transition: color .6s; }
.cr-soft .cr-sub, .cr-soft .cr-copy .kicker, .cr-soft .cr-spec { color: #2c3440 !important; }
.cr-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4a453f; }
.cr-spec span { display: inline-flex; align-items: center; gap: 10px; }
.cr-spec b {
  font-weight: 600; color: #24211e; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(36, 33, 30, .28);
}
.cr-box { display: flex; gap: 5px; margin-top: 16px; height: 22px; align-items: flex-end; }
.cr-box i {
  width: 9px; height: 22px; border-radius: 4px 4px 2px 2px; display: block;
  box-shadow: inset 0 -6px 0 rgba(255,255,255,.28), inset 0 1px 0 rgba(255,255,255,.35);
  clip-path: polygon(0 26%, 50% 0, 100% 26%, 100% 100%, 0 100%);
}
.cr-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.cr-btn span, .cr-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.cr-btn svg { color: #e0352c; }
.cr-cycle b { font-weight: 600; color: var(--fg); }
.cr-draw { overflow: hidden; }
.cr-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #e0352c; transform-origin: left; transform: scaleX(var(--p, 1)); opacity: 0; transition: opacity .3s;
}
.cr-draw[data-drawing='1'] .cr-bar { opacity: .8; }
.cr-draw[data-drawing='1'] svg { animation: cr-scribble .32s ease-in-out infinite alternate; }
@keyframes cr-scribble { from { transform: translate(-1px, 1px) rotate(-8deg); } to { transform: translate(1px, -1px) rotate(6deg); } }
.cr .hint { transition: opacity .4s; color: #4a453f; padding: 4px 10px; border-radius: 999px; background: rgba(251, 248, 241, .72); }
.cr-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .cr-copy { transition: opacity .4s; }
  .cr-split .cr-copy { opacity: 0; }
  .cr-sub { display: none; }
  .cr-copy h1 { font-size: 32px; }
  .cr-spec { margin-top: 10px; font-size: 11px; }
  .cr-box { display: none; }
  .cr .dock .seg { padding: 0 8px; }
  .cr .dock .dock-sep { margin: 0 1px; }
  .cr-btn svg { display: none; }
}
`
