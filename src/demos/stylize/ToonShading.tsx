import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { createToonEffect, setToonLineWidth, setToonMode, toonMeta, toonModes, type ToonMode } from './effects/toon'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 卡通描边 showcase — a little robot on a floating island, holding a balloon and waving, under one strong
 * key light from the upper left so every volume splits cleanly into a lit and a shadow side. The scene uses
 * ordinary PBR materials; all of the cel look comes from ./effects/toon.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const IDLE_MS = 9000
const CYCLE_MS = 7000

const WIDTHS = [
  { zh: '细', v: 0.6 },
  { zh: '中', v: 1 },
  { zh: '粗', v: 1.55 },
]

const SPEC: Record<ToonMode, { a: string; b: string }> = {
  anime: { a: '2 档分色', b: '冷紫阴影 · 边缘光 · 星形高光' },
  comic: { a: '3 档分色', b: '网点阴影 · 粗黑描边 · 网点天空' },
  flat: { a: '平涂色块', b: '色阶天空 · 只描外轮廓 · 纸面颗粒' },
}

/* ------------------------------------------------------------------ scene */

function useMats() {
  return useMemo(
    () => ({
      shell: new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.6 }),
      orange: new THREE.MeshStandardMaterial({ color: '#ff5a3c', roughness: 0.5 }),
      navy: new THREE.MeshStandardMaterial({ color: '#1f2a4a', roughness: 0.3 }),
      eye: new THREE.MeshBasicMaterial({ color: '#7ff3ff', toneMapped: false }),
      cheek: new THREE.MeshStandardMaterial({ color: '#ff8fa6', roughness: 0.6 }),
      yellow: new THREE.MeshStandardMaterial({ color: '#ffc928', roughness: 0.35 }),
      grey: new THREE.MeshStandardMaterial({ color: '#8b93a8', roughness: 0.45 }),
      balloon: new THREE.MeshStandardMaterial({ color: '#ff3d63', roughness: 0.22 }),
      string: new THREE.MeshStandardMaterial({ color: '#c9c3d6', roughness: 0.8 }),
      grass: new THREE.MeshStandardMaterial({ color: '#79cc4f', roughness: 0.85 }),
      dirt: new THREE.MeshStandardMaterial({ color: '#c98552', roughness: 0.9 }),
      rock: new THREE.MeshStandardMaterial({ color: '#a8a39a', roughness: 0.8 }),
      leaf: new THREE.MeshStandardMaterial({ color: '#3fae5a', roughness: 0.75 }),
      leaf2: new THREE.MeshStandardMaterial({ color: '#2f9a6a', roughness: 0.75 }),
      trunk: new THREE.MeshStandardMaterial({ color: '#8a5634', roughness: 0.85 }),
      pink: new THREE.MeshStandardMaterial({ color: '#ff7eb6', roughness: 0.6 }),
      cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    }),
    [],
  )
}
type Mats = ReturnType<typeof useMats>

function Robot({ m, t }: { m: Mats; t: React.RefObject<number> }) {
  const root = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const foreL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const balloon = useRef<THREE.Group>(null)
  const antenna = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)

  useFrame(() => {
    const s = t.current
    const hop = Math.abs(Math.sin(s * 2.1))
    if (root.current) {
      root.current.position.y = hop * 0.16
      const sq = 1 - (1 - hop) ** 6 * 0.06
      root.current.scale.set(2 - sq, sq, 2 - sq)
    }
    if (head.current) head.current.rotation.set(Math.sin(s * 1.05) * 0.06, Math.sin(s * 0.7) * 0.18, Math.sin(s * 1.4) * 0.08)
    // wave: the whole arm up, the forearm swinging
    if (armL.current) armL.current.rotation.z = 2.35 + Math.sin(s * 1.3) * 0.08
    if (foreL.current) foreL.current.rotation.z = Math.sin(s * 6.2) * 0.55 - 0.15
    if (armR.current) armR.current.rotation.z = -0.55 + Math.sin(s * 2.1 + 0.6) * 0.05
    if (balloon.current) balloon.current.rotation.set(Math.sin(s * 0.9 + 1) * 0.12, 0, -0.32 + Math.sin(s * 1.1) * 0.13)
    if (antenna.current) antenna.current.rotation.z = Math.sin(s * 4.2 - 0.6) * 0.18 * (0.4 + hop)
    // blink
    if (eyes.current) {
      const b = (s % 3.7) / 3.7
      eyes.current.scale.y = b > 0.95 ? 0.12 : 1
    }
  })

  return (
    <group ref={root}>
      {/* legs + feet */}
      {[-0.26, 0.26].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.3, 0]} material={m.grey} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.42, 24]} />
          </mesh>
          <RoundedBox args={[0.34, 0.16, 0.46]} radius={0.07} smoothness={3} position={[0, 0.08, 0.06]} material={m.orange} castShadow receiveShadow />
        </group>
      ))}
      {/* body */}
      <group position={[0, 0.95, 0]}>
        <mesh material={m.shell} castShadow receiveShadow>
          <capsuleGeometry args={[0.5, 0.32, 12, 40]} />
        </mesh>
        <mesh position={[0, 0.02, 0.47]} rotation={[Math.PI / 2, 0, 0]} material={m.orange} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.08, 40]} />
        </mesh>
        <mesh position={[0, 0.02, 0.52]} rotation={[Math.PI / 2, 0, 0]} material={m.yellow}>
          <cylinderGeometry args={[0.09, 0.09, 0.04, 32]} />
        </mesh>
      </group>
      {/* left arm, waving (screen-left = robot's right) */}
      <group ref={armL} position={[-0.5, 1.18, 0]}>
        <mesh position={[0, -0.22, 0]} material={m.grey} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.44, 16]} />
        </mesh>
        <group ref={foreL} position={[0, -0.44, 0]}>
          <mesh position={[0, -0.16, 0]} material={m.grey} castShadow>
            <cylinderGeometry args={[0.065, 0.065, 0.32, 16]} />
          </mesh>
          <mesh position={[0, -0.36, 0]} material={m.orange} castShadow>
            <sphereGeometry args={[0.14, 28, 20]} />
          </mesh>
        </group>
      </group>
      {/* right arm, holding the balloon */}
      <group ref={armR} position={[0.5, 1.18, 0]}>
        <mesh position={[0, -0.25, 0]} material={m.grey} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.5, 16]} />
        </mesh>
        <group position={[0, -0.56, 0]}>
          <mesh material={m.orange} castShadow>
            <sphereGeometry args={[0.14, 28, 20]} />
          </mesh>
          <group ref={balloon}>
            <mesh position={[0, 0.85, 0]} material={m.string}>
              <cylinderGeometry args={[0.02, 0.02, 1.7, 8]} />
            </mesh>
            <mesh position={[0, 1.72, 0]} material={m.balloon} castShadow>
              <coneGeometry args={[0.07, 0.12, 16]} />
            </mesh>
            <mesh position={[0, 2.18, 0]} scale={[1, 1.15, 1]} material={m.balloon} castShadow>
              <sphereGeometry args={[0.46, 48, 32]} />
            </mesh>
          </group>
        </group>
      </group>
      {/* head */}
      <group ref={head} position={[0, 1.72, 0]}>
        <RoundedBox args={[1.12, 0.84, 0.86]} radius={0.24} smoothness={5} position={[0, 0.38, 0]} material={m.shell} castShadow receiveShadow />
        <RoundedBox args={[0.86, 0.54, 0.1]} radius={0.12} smoothness={4} position={[0, 0.38, 0.4]} material={m.navy} />
        <group ref={eyes} position={[0, 0.42, 0.46]}>
          {[-0.19, 0.19].map((x) => (
            <mesh key={x} position={[x, 0, 0]} material={m.eye}>
              <capsuleGeometry args={[0.055, 0.1, 6, 16]} />
            </mesh>
          ))}
        </group>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 0.25, 0.46]} rotation={[Math.PI / 2, 0, 0]} material={m.cheek}>
            <cylinderGeometry args={[0.055, 0.055, 0.02, 20]} />
          </mesh>
        ))}
        {/* ears */}
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.38, 0]} rotation={[0, 0, Math.PI / 2]} material={m.orange} castShadow>
            <cylinderGeometry args={[0.17, 0.17, 0.12, 32]} />
          </mesh>
        ))}
        {/* antenna */}
        <group ref={antenna} position={[0.18, 0.8, 0]}>
          <mesh position={[0, 0.17, 0]} material={m.grey}>
            <cylinderGeometry args={[0.025, 0.025, 0.34, 10]} />
          </mesh>
          <mesh position={[0, 0.38, 0]} material={m.yellow} castShadow>
            <sphereGeometry args={[0.1, 24, 16]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

function Tree({ m, position, s = 1, tall = false }: { m: Mats; position: [number, number, number]; s?: number; tall?: boolean }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.4, 0]} material={m.trunk} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.8, 12]} />
      </mesh>
      {tall ? (
        <>
          <mesh position={[0, 1.0, 0]} material={m.leaf2} castShadow receiveShadow>
            <coneGeometry args={[0.55, 0.9, 28]} />
          </mesh>
          <mesh position={[0, 1.5, 0]} material={m.leaf2} castShadow receiveShadow>
            <coneGeometry args={[0.42, 0.75, 28]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 1.08, 0]} material={m.leaf} castShadow receiveShadow>
            <sphereGeometry args={[0.5, 32, 24]} />
          </mesh>
          <mesh position={[0.28, 0.9, 0.18]} material={m.leaf} castShadow receiveShadow>
            <sphereGeometry args={[0.32, 28, 20]} />
          </mesh>
          <mesh position={[-0.26, 0.86, 0.1]} material={m.leaf} castShadow receiveShadow>
            <sphereGeometry args={[0.3, 28, 20]} />
          </mesh>
        </>
      )}
    </group>
  )
}

function Flower({ m, position, c }: { m: Mats; position: [number, number, number]; c: THREE.Material }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} material={m.leaf}>
        <cylinderGeometry args={[0.015, 0.015, 0.24, 6]} />
      </mesh>
      <mesh position={[0, 0.26, 0]} material={c} castShadow>
        <sphereGeometry args={[0.07, 16, 12]} />
      </mesh>
    </group>
  )
}

function Cloud({ m, position, s = 1, speed = 0.1, t }: { m: Mats; position: [number, number, number]; s?: number; speed?: number; t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    if (g.current) g.current.position.x = position[0] + Math.sin(t.current * speed + position[2]) * 0.6
  })
  return (
    <group ref={g} position={position} scale={s}>
      <mesh material={m.cloud}>
        <sphereGeometry args={[0.6, 28, 20]} />
      </mesh>
      <mesh position={[0.62, -0.12, 0.05]} material={m.cloud}>
        <sphereGeometry args={[0.44, 28, 20]} />
      </mesh>
      <mesh position={[-0.6, -0.16, 0]} material={m.cloud}>
        <sphereGeometry args={[0.4, 28, 20]} />
      </mesh>
      <mesh position={[0.2, -0.28, 0.3]} material={m.cloud}>
        <sphereGeometry args={[0.36, 24, 16]} />
      </mesh>
    </group>
  )
}

function Island({ rx, ry }: { rx: MotionValue<number>; ry: MotionValue<number> }) {
  const m = useMats()
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 1.1 : 0)

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += POSTER ? 0 : dt
    const s = t.current
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = POSTER ? Math.min(1.05, vh / 6.4) : mobile ? Math.min(0.9, vw / 6.3) : Math.min(1.08, vh / 6.6, vw / 9)
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.17, (POSTER ? -0.25 : mobile ? vh * 0.19 : -0.15) + Math.sin(s * 0.8) * 0.06, 0)
    }
    if (spin.current) spin.current.rotation.set(0.04 + rx.get(), Math.sin(s * 0.23) * 0.42 - 0.12 + ry.get(), 0)
  })

  return (
    <group ref={rig}>
      <group ref={spin}>
        {/* floating island */}
        <mesh position={[0, -0.12, 0]} material={m.grass} receiveShadow castShadow>
          <cylinderGeometry args={[2.3, 2.25, 0.26, 72]} />
        </mesh>
        <mesh position={[0, -0.9, 0]} rotation={[Math.PI, 0, 0]} material={m.dirt} castShadow>
          <coneGeometry args={[2.22, 1.3, 9]} />
        </mesh>
        <mesh position={[1.25, -0.02, 1.1]} rotation={[0.3, 0.6, 0.1]} material={m.rock} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.22, 0]} />
        </mesh>
        <mesh position={[-1.55, -0.02, 0.9]} rotation={[0.1, 0.2, 0.4]} material={m.rock} castShadow receiveShadow>
          <dodecahedronGeometry args={[0.14, 0]} />
        </mesh>
        <Tree m={m} position={[-1.35, 0, -0.6]} s={1.15} />
        <Tree m={m} position={[1.45, 0, -0.9]} s={1.25} tall />
        <Tree m={m} position={[-0.55, 0, -1.55]} s={0.8} tall />
        <Flower m={m} position={[0.9, 0, 0.9]} c={m.pink} />
        <Flower m={m} position={[1.05, 0, 0.7]} c={m.yellow} />
        <Flower m={m} position={[-0.95, 0, 1.25]} c={m.pink} />
        <Flower m={m} position={[-1.15, 0, 1.0]} c={m.yellow} />
        <Flower m={m} position={[0.35, 0, 1.6]} c={m.pink} />
        <group position={[0.05, 0.01, 0.2]}>
          <Robot m={m} t={t} />
        </group>
      </group>
      <Cloud m={m} t={t} position={[-3.6, 3.3, -3]} s={0.9} speed={0.21} />
      <Cloud m={m} t={t} position={[3.4, 4.2, -4]} s={1.1} speed={0.16} />
      <Cloud m={m} t={t} position={[4.2, 0.6, -3.5]} s={0.7} speed={0.27} />
    </group>
  )
}

/* ------------------------------------------------------------------ page */

export default function ToonShading() {
  const [mode, setMode] = useState<ToonMode>('anime')
  const [w, setW] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(createToonEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(performance.now())

  useEffect(() => setToonMode(fx, mode), [fx, mode])
  useEffect(() => setToonLineWidth(fx, WIDTHS[w].v), [fx, w])

  // idle: walk through the three ways of drawing
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < IDLE_MS || splitOpen.current) return
      setMode((m) => toonModes[(toonModes.findIndex((x) => x.id === m) + 1) % toonModes.length].id)
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    touch()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    touch()
    ry.set(ry.get() + (e.clientX - d.x) * 0.008)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.2, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 650 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.2, max: 0.35, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const label = toonModes.find((m) => m.id === mode)!.label
  const S = SPEC[mode]

  return (
    <div
      className={`stage tn tn-${mode}${split.open ? ' tn-split' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.2, 11.5], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 1.0, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={toonMeta.background} />
        <hemisphereLight args={['#eef4ff', '#b7a68e', 0.55]} />
        <directionalLight
          position={[-6.5, 6, 2.6]}
          intensity={3}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={6}
          shadow-camera-bottom={-4}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
        />
        <directionalLight position={[5, 2.5, -3]} intensity={0.35} color="#ffe2c8" />
        <Island rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy tn-copy">
          <div className="scrim tn-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Toon Shading · 后期描边
            </p>
            <h1>
              一帧渲染，
              <br />
              画成赛璐璐
            </h1>
            <p className="tn-sub">材质一点没改：每块颜色按自己的明暗切成两三档，阴影往冷紫偏；墨线来自深度和法线，外轮廓粗、折痕细，线头自然收尖。</p>
            <div className="tn-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.a}</b>
                  {S.b}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={toonModes.map((m) => ({ value: m.id, label: mobile ? m.label.slice(0, 2) : m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg tn-cycle" onClick={() => setW((d) => (d + 1) % WIDTHS.length)}>
              <span>
                线 <b>{WIDTHS[w].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="tn-lbl">线宽</span>
              <Seg items={WIDTHS.map((d, i) => ({ value: i, label: d.zh }))} value={w} onChange={setW} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg tn-toggle" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="tn-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动小岛 · 松手惯性滑行</p>
      </div>
    </div>
  )
}

const css = `
.tn { cursor: grab; touch-action: none; background: ${toonMeta.background}; }
.tn:active { cursor: grabbing; }
.tn canvas { display: block; }
.tn-copy { pointer-events: none !important; }
.tn-copy .kicker i { background: #ff5a3c; }
.tn-scrim { --soft-bg: rgba(214, 236, 255, .78); transition: opacity .6s; }
.tn-comic .tn-scrim { --soft-bg: #fbf5e6; }
.tn-flat .tn-scrim { --soft-bg: rgba(206, 230, 252, .6); }
.tn-copy h1 { font-size: clamp(38px, 4.4vw, 60px); }
.tn-sub { max-width: 400px; }
.tn-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.tn-spec span { display: inline-flex; align-items: center; gap: 10px; }
.tn-spec b {
  font-weight: 600; color: var(--fg); padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--fg) 30%, transparent);
}
.tn-lbl { font: 500 12px/1 var(--mono); color: var(--fg-2); padding: 0 4px 0 6px; }
.tn-toggle span, .tn-cycle span { display: inline-flex; align-items: center; gap: 7px; }
.tn-cycle b { font-weight: 600; color: var(--fg); }
.tn .hint { transition: opacity .4s; }
.tn-split .hint { opacity: 0; }
@media (max-width: 760px) {
  `
