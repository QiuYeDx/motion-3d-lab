import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  createWatercolorEffect,
  rebloomWatercolor,
  setWatercolorBleed,
  setWatercolorMode,
  setWatercolorVignette,
  settleWatercolor,
  watercolorMeta,
  watercolorModes,
  watercolorProgress,
  type WatercolorMode,
} from './effects/watercolor'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 水彩晕染 showcase — a little harbour: a row of pastel houses with tiled roofs, a church spire, trees and
 * hills, a sailing boat bobbing on the water, clouds drifting across a soft sky. Lots of flat, light colour
 * masses and a sunlit side / shadow side on every house, which is what watercolour washes love.
 * The painting fades into bare paper around the subject. The effect lives in ./effects/watercolor.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 10000

const BLEED = [
  { zh: '轻', v: 0.55 },
  { zh: '中', v: 1 },
  { zh: '重', v: 1.6 },
]

const SPEC: Record<WatercolorMode, { tool: string; note: string }> = {
  wet: { tool: '湿中湿', note: '柔边渗化 · 未干处颜色互相洇开' },
  dry: { tool: '干叠色', note: '几层透明罩染 · 每层边缘积色' },
  sketch: { tool: '钢笔淡彩', note: '墨线勾形 · 一层轻快的淡彩' },
}

/* ------------------------------------------------------------------ scene pieces */

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** gable roof prism: ridge along x, width w (x), depth d (z), height h */
function roofGeo(w: number, d: number, h: number) {
  const s = new THREE.Shape()
  s.moveTo(-d / 2 - 0.06, 0)
  s.lineTo(d / 2 + 0.06, 0)
  s.lineTo(0, h)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: w + 0.1, bevelEnabled: false })
  g.translate(0, 0, -(w + 0.1) / 2)
  g.rotateY(Math.PI / 2)
  return g
}

type House = { x: number; z: number; w: number; d: number; h: number; wall: string; roof: string; ry: number }

const HOUSES: House[] = [
  { x: -2.25, z: -0.95, w: 0.7, d: 0.75, h: 1.05, wall: '#f2e6cc', roof: '#b4482f', ry: 0.05 },
  { x: -1.55, z: -1.0, w: 0.62, d: 0.75, h: 1.45, wall: '#e9b949', roof: '#7b4b3a', ry: 0 },
  { x: -0.9, z: -0.95, w: 0.66, d: 0.75, h: 1.2, wall: '#e27d60', roof: '#5f6f80', ry: -0.04 },
  { x: -0.24, z: -1.02, w: 0.62, d: 0.75, h: 1.6, wall: '#f4ecd8', roof: '#b4482f', ry: 0 },
  { x: 0.42, z: -0.96, w: 0.68, d: 0.75, h: 1.25, wall: '#9fcbe0', roof: '#a04030', ry: 0.03 },
  { x: 1.08, z: -1.0, w: 0.6, d: 0.75, h: 1.5, wall: '#f2a7a0', roof: '#5f6f80', ry: 0 },
  { x: 1.72, z: -0.95, w: 0.66, d: 0.75, h: 1.12, wall: '#cfdcae', roof: '#b4482f', ry: -0.05 },
  { x: 2.36, z: -0.98, w: 0.62, d: 0.75, h: 1.35, wall: '#f6c46a', roof: '#7b4b3a', ry: 0.02 },
]

function Houses() {
  const parts = useMemo(() => {
    const dark = new THREE.MeshStandardMaterial({ color: '#33414e', roughness: 0.6 })
    const trim = new THREE.MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.7 })
    return { dark, trim }
  }, [])
  return (
    <group>
      {HOUSES.map((h, i) => {
        const floors = Math.max(2, Math.round(h.h / 0.45))
        const roofH = 0.32 + (i % 3) * 0.06
        const windows: [number, number][] = []
        for (let f = 0; f < floors; f++) for (const c of [-0.17, 0.17]) windows.push([c * (h.w / 0.66), 0.32 + f * ((h.h - 0.45) / Math.max(1, floors - 1))])
        return (
          <group key={i} position={[h.x, 0.35, h.z]} rotation={[0, h.ry, 0]}>
            <mesh position={[0, h.h / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[h.w, h.h, h.d]} />
              <meshStandardMaterial color={h.wall} roughness={0.85} />
            </mesh>
            <mesh geometry={roofGeo(h.w, h.d, roofH)} position={[0, h.h, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={h.roof} roughness={0.75} />
            </mesh>
            {i % 2 === 0 && (
              <mesh position={[h.w * 0.25, h.h + roofH * 0.7, -0.1]} castShadow>
                <boxGeometry args={[0.09, 0.3, 0.09]} />
                <meshStandardMaterial color="#8a5a44" roughness={0.8} />
              </mesh>
            )}
            {windows.map(([x, y], k) =>
              y < 0.4 && Math.abs(x) < 0.2 && k % 2 === 1 ? null : (
                <group key={k} position={[x, y, h.d / 2 + 0.005]}>
                  <mesh material={parts.trim}>
                    <boxGeometry args={[0.15, 0.2, 0.012]} />
                  </mesh>
                  <mesh material={parts.dark} position={[0, 0, 0.004]}>
                    <boxGeometry args={[0.11, 0.16, 0.012]} />
                  </mesh>
                </group>
              ),
            )}
            {/* door */}
            <mesh position={[h.w * 0.17, 0.17, h.d / 2 + 0.006]}>
              <boxGeometry args={[0.15, 0.32, 0.012]} />
              <meshStandardMaterial color={i % 2 ? '#2f5d62' : '#7b3f2e'} roughness={0.6} />
            </mesh>
          </group>
        )
      })}
      {/* church tower behind the row */}
      <group position={[0.1, 0.35, -2.0]}>
        <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.55, 2.5, 0.55]} />
          <meshStandardMaterial color="#efe3c8" roughness={0.85} />
        </mesh>
        <mesh position={[0, 2.95, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.45, 0.95, 4]} />
          <meshStandardMaterial color="#4f8580" roughness={0.6} />
        </mesh>
        <mesh position={[0, 2.0, 0.28]}>
          <circleGeometry args={[0.12, 24]} />
          <meshStandardMaterial color="#fbf6ea" roughness={0.5} />
        </mesh>
        <mesh position={[0, 1.45, 0.28]}>
          <boxGeometry args={[0.14, 0.36, 0.01]} />
          <meshStandardMaterial color="#33414e" roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

function Trees() {
  const trees = useMemo(() => {
    const rnd = mulberry(4)
    const round: { p: [number, number, number]; s: number; c: string }[] = []
    const spots: [number, number][] = [
      [-2.85, -1.55],
      [-1.95, -1.8],
      [-0.65, -1.75],
      [0.95, -1.8],
      [2.0, -1.75],
      [2.95, -1.45],
      [-2.9, -0.4],
    ]
    for (const [x, z] of spots) {
      const s = 0.38 + rnd() * 0.2
      round.push({ p: [x, 0.35 + s * 1.35, z], s, c: rnd() > 0.5 ? '#6a994e' : '#88b04b' })
    }
    const cypress: [number, number][] = [
      [-1.25, -1.6],
      [0.72, -1.55],
      [2.65, -1.3],
    ]
    return { round, cypress }
  }, [])
  return (
    <group>
      {trees.round.map((t, i) => (
        <group key={i} position={t.p}>
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[t.s, 20, 14]} />
            <meshStandardMaterial color={t.c} roughness={0.9} />
          </mesh>
          <mesh position={[t.s * 0.5, -t.s * 0.25, t.s * 0.2]} castShadow>
            <sphereGeometry args={[t.s * 0.7, 18, 12]} />
            <meshStandardMaterial color={t.c} roughness={0.9} />
          </mesh>
          <mesh position={[0, -t.s * 1.1, 0]}>
            <cylinderGeometry args={[0.04, 0.06, t.s * 1.2, 8]} />
            <meshStandardMaterial color="#6b4a33" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {trees.cypress.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.35 + 0.85, z]} castShadow>
          <coneGeometry args={[0.2, 1.7, 14]} />
          <meshStandardMaterial color="#3f6b45" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Boat({ t }: { t: React.MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null)
  const G = useMemo(() => {
    const hull = new THREE.CylinderGeometry(0.22, 0.22, 1.1, 24, 1, false, Math.PI / 2, Math.PI)
    hull.rotateZ(Math.PI / 2)
    hull.scale(1, 1, 1.25)
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(0.52, 0)
    s.lineTo(0, 1.05)
    s.closePath()
    const sail = new THREE.ShapeGeometry(s)
    const s2 = new THREE.Shape()
    s2.moveTo(0, 0)
    s2.lineTo(-0.36, 0)
    s2.lineTo(0, 0.82)
    s2.closePath()
    const jib = new THREE.ShapeGeometry(s2)
    return { hull, sail, jib }
  }, [])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const k = t.current
    g.position.set(0.55 + Math.sin(k * 0.11) * 0.9, 0.04 + Math.sin(k * 1.3) * 0.025, 1.25)
    g.rotation.set(Math.sin(k * 1.1 + 0.4) * 0.03, -0.25 + Math.sin(k * 0.11) * 0.08, Math.sin(k * 0.9) * 0.06)
  })
  return (
    <group ref={ref}>
      <mesh geometry={G.hull} castShadow receiveShadow>
        <meshStandardMaterial color="#c4402f" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.62, 1]}>
        <planeGeometry args={[1.08, 0.44]} />
        <meshStandardMaterial color="#d8b98a" roughness={0.8} />
      </mesh>
      <mesh position={[0.05, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.018, 1.2, 8]} />
        <meshStandardMaterial color="#5a3d2b" roughness={0.7} />
      </mesh>
      <mesh geometry={G.sail} position={[0.08, 0.12, 0]} castShadow>
        <meshStandardMaterial color="#fbf3e2" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={G.jib} position={[0.02, 0.12, 0.01]} castShadow>
        <meshStandardMaterial color="#e9b949" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Clouds({ t }: { t: React.MutableRefObject<number> }) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const defs = useMemo(() => {
    const rnd = mulberry(77)
    return [
      { x: -3.2, y: 3.3, z: -4.5, s: 0.8 },
      { x: 1.4, y: 3.9, z: -5.5, s: 0.95 },
      { x: 4.6, y: 3.0, z: -4.8, s: 0.7 },
      { x: -7.0, y: 3.7, z: -6, s: 0.85 },
    ].map((c) => ({
      ...c,
      puffs: Array.from({ length: 5 }, (_, i) => ({ p: [(i - 2) * 0.42 + (rnd() - 0.5) * 0.2, Math.sin(i * 1.3) * 0.12 + (i === 2 ? 0.18 : 0), (rnd() - 0.5) * 0.3] as [number, number, number], r: 0.32 + rnd() * 0.18 + (i === 2 ? 0.12 : 0) })),
    }))
  }, [])
  useFrame(() => {
    defs.forEach((c, i) => {
      const g = groups.current[i]
      if (!g) return
      const x = ((c.x + t.current * 0.12 + 8) % 16) - 8
      g.position.set(x, c.y, c.z)
    })
  })
  return (
    <group>
      {defs.map((c, i) => (
        <group key={i} ref={(el) => {
            groups.current[i] = el
          }} scale={c.s}>
          {c.puffs.map((p, k) => (
            <mesh key={k} position={p.p}>
              <sphereGeometry args={[p.r, 18, 12]} />
              <meshStandardMaterial color="#ffffff" emissive="#fff7ea" emissiveIntensity={0.35} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function Sky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(40, 32, 16)
    const p = g.attributes.position as THREE.BufferAttribute
    const col = new Float32Array(p.count * 3)
    const top = new THREE.Color('#5592cc')
    const hor = new THREE.Color('#f4e4c6')
    const c = new THREE.Color()
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 40
      c.copy(hor).lerp(top, THREE.MathUtils.smoothstep(y, -0.04, 0.22))
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ scene */

function Harbour({ ry, rx, onFocus }: { ry: MotionValue<number>; rx: MotionValue<number>; onFocus: (x: number, y: number, r: number) => void }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 6 : 0)
  const last = useRef({ x: -1, y: -1, r: -1 })

  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(0.9, vw / 8.2, vh / 5.4) : mobile ? Math.min(0.56, vw / 7.6) : Math.min(0.8, vh / 6.3, vw / 11.6)
    const x = POSTER || mobile ? 0 : vw * 0.18
    const y = POSTER ? -0.45 : mobile ? vh * 0.1 : -0.35
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(x, y, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get(), Math.sin(t.current * 0.09) * 0.16 + ry.get(), 0)
    // the painting fades into paper around the subject
    const fx = 0.5 + x / vw
    const fy = 0.5 + (y + 1.0 * k) / vh
    const r = POSTER ? 0.55 : mobile ? 0.66 : 0.5
    const L = last.current
    if (Math.abs(fx - L.x) > 0.002 || Math.abs(fy - L.y) > 0.002 || r !== L.r) {
      last.current = { x: fx, y: fy, r }
      onFocus(fx, fy, r)
    }
  })

  return (
    <>
      <hemisphereLight args={['#fff6e6', '#8a9bb0', 1.0]} />
      <directionalLight
        position={[-5, 6.5, 5]}
        intensity={2.6}
        color="#fff0d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[5, 2, 2]} intensity={0.45} color="#a9c3e6" />
      <Sky />
      <group ref={rig}>
        <Clouds t={t} />
        <group ref={spin}>
          {/* hills far behind */}
          <mesh position={[-2.2, -0.6, -5.2]} scale={[4.2, 1.9, 1.6]}>
            <sphereGeometry args={[1, 32, 16]} />
            <meshStandardMaterial color="#9fb98a" roughness={1} />
          </mesh>
          <mesh position={[2.8, -0.8, -6]} scale={[4.6, 2.2, 1.6]}>
            <sphereGeometry args={[1, 32, 16]} />
            <meshStandardMaterial color="#8aa9a6" roughness={1} />
          </mesh>
          {/* quay: stone wall + cobbled top + grass behind */}
          <mesh position={[0, 0.1, -1.35]} castShadow receiveShadow>
            <boxGeometry args={[7.4, 0.5, 2.2]} />
            <meshStandardMaterial color="#cdbb98" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.2, -3.1]} receiveShadow>
            <boxGeometry args={[16, 0.5, 1.6]} />
            <meshStandardMaterial color="#9cbf6e" roughness={1} />
          </mesh>
          <Houses />
          <Trees />
          {/* mooring posts */}
          {[-1.9, -0.5, 1.4].map((x) => (
            <mesh key={x} position={[x, 0.2, -0.18]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.5, 10]} />
              <meshStandardMaterial color="#5a3d2b" roughness={0.8} />
            </mesh>
          ))}
          {/* water */}
          <mesh position={[0, 0, 9.8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[40, 24]} />
            <meshStandardMaterial color="#5d9cc4" roughness={0.3} metalness={0.05} />
          </mesh>
          <Boat t={t} />
        </group>
      </group>
    </>
  )
}

/** thin "drying" bar driven from the effect's own clock (no React re-render per frame) */
function DryProgress({ fx, bar }: { fx: StylizeEffect; bar: React.RefObject<HTMLDivElement | null> }) {
  useFrame(() => {
    const el = bar.current
    if (!el) return
    const p = watercolorProgress(fx)
    el.style.transform = `scaleX(${p.toFixed(3)})`
    el.parentElement!.parentElement!.style.opacity = p >= 1 ? '0' : '1'
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function Watercolor() {
  const [mode, setMode] = useState<WatercolorMode>('wet')
  const [bleedI, setBleedI] = useState(1)
  const fx = useMemo(() => {
    const f = createWatercolorEffect()
    if (POSTER) settleWatercolor(f)
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => setWatercolorMode(fx, mode), [fx, mode])
  useEffect(() => setWatercolorBleed(fx, BLEED[bleedI].v), [fx, bleedI])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => watercolorModes[(watercolorModes.findIndex((o) => o.id === m) + 1) % watercolorModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.005, -0.75, 0.75))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.0025, -0.08, 0.22))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600, min: -0.75, max: 0.75, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.08, max: 0.22, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const S = SPEC[mode]
  const label = watercolorModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage wc${split.open ? ' wc-split' : ''}`}
      style={{ background: watercolorMeta.background }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.4, 9.2], fov: 31 }} onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={watercolorMeta.background} />
        <Harbour ry={ry} rx={rx} onFocus={(x, y, r) => setWatercolorVignette(fx, x, y, r, 1)} />
        <DryProgress fx={fx} bar={bar} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy wc-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Watercolor · Pigment on Paper
            </p>
            <h1>
              颜料在纸上
              <br />
              慢慢洇开
            </h1>
            <p className="wc-sub">画面先被简化成几层透明的颜色，再模拟水彩的物理：边缘积色、颗粒沉进纸纹的凹处、湿画法的渗化，最亮处直接留出纸白。每次换画法都从湿纸开始，慢慢晾干。</p>
            <div className="wc-spec">
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
            <div className="wc-dry">
              <span>晾干中</span>
              <i>
                <b ref={bar} />
              </i>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={watercolorModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg wc-cycle" onClick={() => setBleedI((d) => (d + 1) % BLEED.length)}>
              <span>
                晕染 <b>{BLEED[bleedI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="wc-lab">晕染</span>
              <Seg items={BLEED.map((d, i) => ({ value: i, label: d.zh }))} value={bleedI} onChange={setBleedI} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg wc-btn" onClick={() => rebloomWatercolor(fx)} aria-label="重新晕染">
            <span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 1.5C7 1.5 2.8 6.2 2.8 8.8a4.2 4.2 0 0 0 8.4 0C11.2 6.2 7 1.5 7 1.5Z" fill="currentColor" opacity=".85" />
              </svg>
              {MOBILE ? '重画' : '重新晕染'}
            </span>
          </button>
          <button className="seg wc-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="wc-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动小镇 · 闲置时自动换画法</p>
      </div>
    </div>
  )
}

const css = `
.wc { cursor: grab; touch-action: none; }
.wc:active { cursor: grabbing; }
.wc canvas { display: block; }
.wc-copy { pointer-events: none !important; --soft-bg: #f6f2ea; }
.wc-copy .scrim { opacity: 0; transition: opacity .5s; }
.wc-split .wc-copy .scrim { opacity: .92; }
.wc-copy .kicker { color: #6a6358; }
.wc-copy .kicker i { background: #4f8fbf; }
.wc-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #24282c; }
.wc-sub { max-width: 400px; color: #4d4a44 !important; }
.wc-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4d4a44; }
.wc-spec span { display: inline-flex; align-items: center; gap: 10px; }
.wc-spec b {
  font-weight: 600; color: #24282c; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(36, 40, 44, .28);
}
.wc-dry {
  display: flex; align-items: center; gap: 10px; margin-top: 14px; height: 14px;
  font: 500 11px/1 var(--mono); color: #6a6358; transition: opacity .6s;
}
.wc-dry i { position: relative; width: 120px; height: 2px; border-radius: 2px; background: rgba(79, 143, 191, .18); overflow: hidden; }
.wc-dry b { position: absolute; inset: 0; background: #4f8fbf; transform-origin: left; transform: scaleX(0); }
.wc-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.wc-btn span, .wc-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.wc-btn svg { color: #4f8fbf; }
.wc-cycle b { font-weight: 600; color: var(--fg); }
.wc .hint { transition: opacity .4s; color: #4d4a44; padding: 4px 10px; border-radius: 999px; background: rgba(246, 242, 234, .72); }
.wc-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .wc-copy { transition: opacity .4s; }
  .wc-split .wc-copy { opacity: 0; }
  .wc-sub { display: none; }
  .wc-copy h1 { font-size: 32px; }
  .wc-spec { margin-top: 10px; }
  .wc-dry { margin-top: 8px; }
  .wc .dock .seg { padding: 0 8px; }
  .wc .dock .dock-sep { margin: 0 1px; }
}
`
