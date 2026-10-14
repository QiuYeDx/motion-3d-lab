import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  PBN_SETS,
  createPbnEffect,
  fillPaintByNumber,
  pbnCounts,
  pbnCurrent,
  pbnMeta,
  pbnModes,
  pbnPotDone,
  pbnProgress,
  setPbnColors,
  setPbnMode,
  setPbnPaused,
  setPbnProgress,
  type PbnCount,
  type PbnMode,
} from './effects/paintbynumber'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 数字填色 showcase — a hot-air balloon over rolling hills, painted from a numbered kit. Flat, cheerful colour
 * masses under one clear key light, so every object splits into a lit and a shaded region; a gradient sky gives
 * a few bands of blue. The pots of the kit sit along the bottom; the one being painted is lifted and a brush dips
 * into it. Effect: ./effects/paintbynumber.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const SPEC: Record<PbnMode, string> = {
  fill: '按编号一罐一罐地涂 · 涂完歇一会儿再来一张',
  done: '整幅涂满 · 平整的丙烯色块',
  lines: '只剩印好的细线和编号 · 一页填色本',
}

/* ------------------------------------------------------------------ scene */

const mat = (color: string, roughness = 0.85, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

function Sky() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(60, 32, 24)
    const pos = g.attributes.position
    const col = new Float32Array(pos.count * 3)
    const top = new THREE.Color('#62a8e2')
    const mid = new THREE.Color('#84c1ea')
    const low = new THREE.Color('#c4e3f5')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 60
      if (y > 0.07) c.copy(mid).lerp(top, Math.min(1, (y - 0.07) / 0.2))
      else c.copy(low).lerp(mid, Math.max(0, (y + 0.03) / 0.1))
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [])
  const m = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }), [])
  return <mesh geometry={geo} material={m} />
}

function Balloon({ t }: { t: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const gores = useMemo(() => {
    const pts = new THREE.SplineCurve(
      [
        [0.24, -1.25],
        [0.4, -1.02],
        [0.68, -0.7],
        [0.98, -0.34],
        [1.2, 0.04],
        [1.27, 0.4],
        [1.2, 0.76],
        [1.02, 1.06],
        [0.74, 1.3],
        [0.4, 1.45],
        [0.0, 1.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    ).getPoints(48)
    const n = 12
    return Array.from({ length: n }, (_, i) => new THREE.LatheGeometry(pts, 5, (i / n) * Math.PI * 2, (Math.PI * 2) / n))
  }, [])
  const M = useMemo(
    () => ({
      a: mat('#e2412f', 0.7),
      b: mat('#f2b01a', 0.7),
      c: mat('#2f68c8', 0.7),
      d: mat('#fbf6ea', 0.7),
      basket: mat('#8a5a34', 0.95),
      rim: mat('#5e3b22', 0.95),
      rope: mat('#4a3020', 0.9),
    }),
    [],
  )
  const order = [M.a, M.b, M.a, M.d, M.c, M.d, M.a, M.b, M.a, M.d, M.c, M.d]
  useFrame(() => {
    if (!g.current) return
    const s = t.current
    g.current.position.set(2.1 + Math.sin(s * 0.11) * 0.25, 2.55 + Math.sin(s * 0.5) * 0.09, 0.4)
    g.current.rotation.set(0, 0.35 + Math.sin(s * 0.07) * 0.12, Math.sin(s * 0.33) * 0.025)
  })
  return (
    <group ref={g}>
      {gores.map((geo, i) => (
        <mesh key={i} geometry={geo} material={order[i]} castShadow />
      ))}
      {/* skirt and basket */}
      <mesh position={[0, -1.32, 0]} material={M.rim} castShadow>
        <cylinderGeometry args={[0.26, 0.22, 0.16, 20]} />
      </mesh>
      {[
        [0.2, 0.2],
        [-0.2, 0.2],
        [0.2, -0.2],
        [-0.2, -0.2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x * 0.75, -1.62, z * 0.75]} rotation={[z * 0.3, 0, -x * 0.3]} material={M.rope}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 5]} />
        </mesh>
      ))}
      <mesh position={[0, -2.0, 0]} material={M.basket} castShadow>
        <boxGeometry args={[0.5, 0.38, 0.5]} />
      </mesh>
      <mesh position={[0, -1.8, 0]} material={M.rim}>
        <boxGeometry args={[0.56, 0.07, 0.56]} />
      </mesh>
    </group>
  )
}

function Cloud({ t, x0, y, z, s, speed }: { t: React.RefObject<number>; x0: number; y: number; z: number; s: number; speed: number }) {
  const g = useRef<THREE.Group>(null)
  const m = useMemo(() => mat('#ffffff', 1), [])
  useFrame(() => {
    if (!g.current) return
    const x = ((((x0 + t.current * speed + 9) % 18) + 18) % 18) - 9
    g.current.position.set(x, y, z)
  })
  return (
    <group ref={g} scale={s}>
      {[
        [0, 0, 0, 0.62],
        [0.62, -0.12, 0.05, 0.46],
        [-0.64, -0.14, 0, 0.44],
        [0.2, 0.32, -0.05, 0.42],
        [-0.25, 0.22, 0.1, 0.36],
      ].map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]} material={m}>
          <sphereGeometry args={[r, 24, 16]} />
        </mesh>
      ))}
    </group>
  )
}

function Tree({ p, s = 1 }: { p: [number, number, number]; s?: number }) {
  const M = useMemo(() => ({ trunk: mat('#6e4a2e', 0.95), crown: mat('#3a9446', 0.9) }), [])
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.25, 0]} material={M.trunk} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.5, 8]} />
      </mesh>
      <mesh position={[0, 0.72, 0]} material={M.crown} castShadow receiveShadow>
        <sphereGeometry args={[0.38, 20, 14]} />
      </mesh>
    </group>
  )
}

function House({ p, r = 0, s = 1 }: { p: [number, number, number]; r?: number; s?: number }) {
  const M = useMemo(() => ({ wall: mat('#fbf4e4', 0.9), roof: mat('#d4432f', 0.8), door: mat('#7a4a2a', 0.9) }), [])
  return (
    <group position={p} rotation={[0, r, 0]} scale={s}>
      <mesh position={[0, 0.25, 0]} material={M.wall} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.5, 0.5]} />
      </mesh>
      <mesh position={[0, 0.66, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.05, 1, 0.78]} material={M.roof} castShadow>
        <coneGeometry args={[0.56, 0.36, 4]} />
      </mesh>
      <mesh position={[0.12, 0.17, 0.255]} material={M.door}>
        <boxGeometry args={[0.15, 0.3, 0.02]} />
      </mesh>
    </group>
  )
}

function Landscape({ ry, onReady }: { ry: MotionValue<number>; onReady: () => void }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const world = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 4 : 0)
  const ready = usePrecompiled(world, onReady)
  const M = useMemo(
    () => ({
      far: mat('#3f9a86', 0.95),
      mid: mat('#4e9e46', 0.95),
      near: mat('#5fae4c', 0.95),
      field: mat('#f2c94a', 0.95),
      path: mat('#e7cf9f', 0.95),
      sun: mat('#ffd23a', 0.6, { emissive: new THREE.Color('#ffb21a'), emissiveIntensity: 0.6 }),
    }),
    [],
  )
  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(0.85, vw / 13) : mobile ? Math.min(0.62, vw / 7.4) : Math.min(0.8, vw / 15, vh / 8.6)
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER ? -0.8 * k : mobile ? -1.3 * k : vw * 0.1, mobile ? vh * 0.12 : -vh * 0.06, 0)
    }
    if (world.current) world.current.rotation.y = ry.get() + Math.sin(t.current * 0.05) * 0.04
  })
  return (
    <group ref={rig}>
      <group ref={world} visible={ready}>
        {/* hills, back to front */}
        <mesh position={[-3.5, -2.4, -6]} scale={[7, 3.2, 3]} material={M.far} receiveShadow>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
        <mesh position={[5, -2.6, -5]} scale={[6.5, 3.4, 3]} material={M.far} receiveShadow>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
        <mesh position={[2.5, -2.9, -1.6]} scale={[6.2, 2.9, 2.8]} material={M.mid} receiveShadow castShadow>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
        <mesh position={[-1.2, -2.3, -2.6]} scale={[2.2, 2.6, 1.6]} material={M.field} receiveShadow castShadow>
          <sphereGeometry args={[1, 40, 20]} />
        </mesh>
        <mesh position={[-4.2, -3.1, 0.6]} scale={[6.2, 2.85, 2.6]} material={M.near} receiveShadow castShadow>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
        <mesh position={[4.5, -3.4, 1.6]} scale={[5.5, 2.6, 2.4]} material={M.near} receiveShadow castShadow>
          <sphereGeometry args={[1, 48, 24]} />
        </mesh>
        {/* sun */}
        <mesh position={[-3.2, 4.4, -9]} material={M.sun}>
          <sphereGeometry args={[0.85, 32, 20]} />
        </mesh>
        <House p={[-2.4, -0.38, 1.2]} r={0.4} />
        <House p={[-0.9, -0.62, 0.9]} r={-0.3} s={0.8} />
        <House p={[4.4, -0.85, 2.0]} r={-0.5} s={0.9} />
        <Tree p={[-3.6, -0.45, 1.6]} s={1.1} />
        <Tree p={[-1.6, -0.35, 0.4]} s={0.9} />
        <Tree p={[0.6, -0.55, -0.5]} s={1.0} />
        <Tree p={[3.2, -0.55, 0.6]} s={1.15} />
        <Tree p={[5.6, -1.0, 2.2]} s={0.95} />
        <Tree p={[-5.4, -0.95, 1.8]} s={1.0} />
        <Balloon t={t} />
        <Cloud t={t} x0={-4} y={3.2} z={-4} s={1.1} speed={0.06} />
        <Cloud t={t} x0={4} y={4.1} z={-5} s={0.9} speed={0.045} />
        <Cloud t={t} x0={0} y={1.6} z={-6} s={0.8} speed={0.05} />
      </group>
    </group>
  )
}

/** reads the effect's progress each frame and writes it to the DOM pots / button (no React re-render) */
function Progress({ fx, pots, btn }: { fx: StylizeEffect; pots: React.RefObject<HTMLDivElement | null>; btn: React.RefObject<HTMLButtonElement | null> }) {
  useFrame(() => {
    const el = pots.current
    if (el) {
      const cur = pbnCurrent(fx)
      const kids = el.children
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i] as HTMLElement
        const on = i === cur ? '1' : '0'
        if (k.dataset.on !== on) k.dataset.on = on
        k.style.setProperty('--p', pbnPotDone(fx, i).toFixed(3))
      }
    }
    const b = btn.current
    if (b) {
      const p = pbnProgress(fx)
      b.style.setProperty('--p', p.toFixed(3))
    }
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function PaintByNumber() {
  const [mode, setMode] = useState<PbnMode>('fill')
  const [count, setCount] = useState<PbnCount>(16)
  const fx = useMemo(() => {
    const f = createPbnEffect({ colors: 16 })
    if (POSTER) {
      setPbnProgress(f, 0.8)
      setPbnPaused(f, true)
    }
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const pots = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)

  useEffect(() => setPbnMode(fx, mode), [fx, mode])
  useEffect(() => setPbnColors(fx, count), [fx, count])

  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob, .pbn-pots')) return
    anim.current?.stop()
    drag.current = { x: e.clientX, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.003, -0.45, 0.45))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anim.current = animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.35, timeConstant: 500, min: -0.45, max: 0.45, bounceStiffness: 140, bounceDamping: 18 })
  }
  useEffect(() => () => anim.current?.stop(), [])

  const [ready, setReady] = useState(false)
  const kit = PBN_SETS[count]
  const label = pbnModes.find((m) => m.id === mode)!.label
  const restart = () => {
    if (mode !== 'fill') setMode('fill')
    fillPaintByNumber(fx)
  }

  return (
    <div
      className={`stage pbn pbn-${mode}${split.open ? ' pbn-split' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 1.0, 13], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={pbnMeta.background} preload={preload} />
        <hemisphereLight args={['#eef4ff', '#b8c4d4', 1.35]} />
        <directionalLight
          position={[-6, 8, 7]}
          intensity={1.45}
          color="#fff4e0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-9}
          shadow-camera-right={9}
          shadow-camera-top={7}
          shadow-camera-bottom={-5}
          shadow-bias={-0.0004}
          shadow-normalBias={0.03}
        />
        <directionalLight position={[7, 2, 6]} intensity={0.75} color="#e2ebff" />
        <Sky />
        <Landscape ry={ry} onReady={() => setReady(true)} />
        <Progress fx={fx} pots={pots} btn={btn} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy pbn-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Paint by Number · {count} 色
            </p>
            <h1>
              照着编号
              <br />
              一格一格涂
            </h1>
            <p className="pbn-sub">
              画面先拆成一块块色区，亮面和暗面各算一块，每块印上颜料的编号。再一罐一罐地涂：没涂到的地方还是白画布、细线和数字，涂过的是平整的丙烯色，偶尔压线、偶尔漏白。
            </p>
            <div className="pbn-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{label}</b>
                  {SPEC[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        {/* the kit: numbered pots, the open one lifted with a brush in it */}
        <motion.div
          className="pbn-pots"
          ref={pots}
          key={count}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: ready || POSTER ? 1 : 0, y: 0 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          // phones: two even rows
          style={{ x: '-50%', gridTemplateColumns: MOBILE ? `repeat(${kit.length / 2}, 19px)` : undefined }}
        >
          {kit.map((p, i) => (
            <div key={p.hex} className="pbn-pot" title={p.zh} style={{ ['--c' as string]: p.hex }}>
              <i className="pbn-paint" />
              <span>{i + 1}</span>
              <svg className="pbn-brush" viewBox="0 0 16 40" aria-hidden>
                <rect x="6.5" y="0" width="3" height="22" rx="1.5" fill="#b88a5a" />
                <rect x="5.5" y="21" width="5" height="6" rx="1" fill="#9aa0a8" />
                <path d="M5.5 27 h5 l-.6 8 q-1.9 4 -3.8 0 z" fill="var(--c)" stroke="rgba(0,0,0,.25)" strokeWidth=".6" />
              </svg>
            </div>
          ))}
        </motion.div>

        <div className="dock">
          <Seg items={pbnModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {!MOBILE && <span className="pbn-lab">色数</span>}
          <Seg items={pbnCounts.map((n) => ({ value: n, label: String(n) }))} value={count} onChange={setCount} />
          <span className="dock-sep" />
          <button ref={btn} className="seg pbn-btn pbn-again" onClick={restart} aria-label="重新填色">
            <span>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.7-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12.6 1.2v3.4H9.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {MOBILE ? '重涂' : '重新填色'}
            </span>
            <i className="pbn-bar" />
          </button>
          <button className="seg pbn-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="pbn-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动画面 · 点「重新填色」从 1 号颜料开始</p>
      </div>
    </div>
  )
}

const css = `
.pbn { background: #f7f5ef; cursor: grab; touch-action: none; }
.pbn:active { cursor: grabbing; }
.pbn canvas { display: block; }
.pbn-copy { pointer-events: none !important; --soft-bg: #f7f5ef; }
.pbn-copy .scrim { opacity: .5; }
.pbn-split .pbn-copy .scrim { opacity: .95; }
.pbn-copy .kicker { color: #5a6577; }
.pbn-copy .kicker i { background: #2f8f6b; }
.pbn-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #1f2733; }
.pbn-sub { max-width: 400px; color: #46505e !important; }
.pbn-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4d5868; }
.pbn-spec span { display: inline-flex; align-items: center; gap: 10px; }
.pbn-spec b {
  font-weight: 600; color: #1f2733; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(31, 39, 51, .26);
}
.pbn-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.pbn-btn span { display: inline-flex; align-items: center; gap: 6px; }
.pbn-again { overflow: hidden; }
.pbn-again svg { color: #2f8f6b; }
.pbn-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #2f8f6b; transform-origin: left; transform: scaleX(var(--p, 0)); opacity: .75;
}
.pbn .hint { color: #4d5868; padding: 4px 10px; border-radius: 999px; background: rgba(247, 245, 239, .72); }
.pbn-split .hint { opacity: 0; }

/* the kit */
.pbn-pots {
  position: absolute; left: 50%; bottom: 84px;
  display: flex; gap: 6px; padding: 8px 10px 7px; border-radius: 14px; pointer-events: auto;
  background: rgba(255, 255, 255, .78); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px -12px rgba(30, 40, 60, .35), 0 0 0 1px rgba(30, 40, 60, .06);
}
.pbn-pot {
  position: relative; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: #fff; box-shadow: inset 0 0 0 1.5px rgba(70, 85, 110, .35);
  transition: transform .35s cubic-bezier(.23,1,.32,1), box-shadow .35s;
}
.pbn-paint {
  position: absolute; inset: 3px; border-radius: 50%; background: var(--c);
  box-shadow: inset 0 -2px 0 rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.35);
  clip-path: inset(calc((1 - var(--p, 0)) * 100%) 0 0 0);
}
.pbn-pot span {
  position: relative; font: 600 10px/1 var(--sans); color: #5b6d8c; mix-blend-mode: multiply;
  font-variant-numeric: tabular-nums;
}
.pbn-pot .pbn-brush {
  position: absolute; width: 10px; height: 25px; left: 50%; bottom: 13px; margin-left: -5px;
  opacity: 0; transform: translateY(-6px) rotate(14deg); transform-origin: 50% 100%;
  transition: opacity .25s, transform .35s cubic-bezier(.23,1,.32,1); pointer-events: none;
}
.pbn-pot[data-on='1'] { transform: translateY(-5px) scale(1.18); box-shadow: inset 0 0 0 2px #2f8f6b, 0 6px 14px -6px rgba(30,40,60,.5); }
.pbn-pot[data-on='1'] .pbn-brush { opacity: 1; animation: pbn-dip 1.1s ease-in-out infinite; }
@keyframes pbn-dip {
  0%, 100% { transform: translateY(-8px) rotate(14deg); }
  45% { transform: translateY(1px) rotate(4deg); }
  60% { transform: translateY(-1px) rotate(8deg); }
}

@media (max-width: 760px) {
  .pbn-copy { transition: opacity .4s; bottom: 146px !important; }
  .pbn-split .pbn-copy { opacity: 0; }
  .pbn-sub { display: none; }
  .pbn-copy h1 { font-size: 32px; }
  .pbn-spec { margin-top: 10px; font-size: 11px; }
  .pbn .dock .seg { padding: 0 8px; }
  .pbn .dock .dock-sep { margin: 0 1px; }
  .pbn-again svg { display: none; }
  .pbn-pots { display: grid; bottom: 78px; gap: 4px 3px; padding: 6px 7px; }
  .pbn-pot { width: 19px; height: 19px; }
  .pbn-pot span { font-size: 8.5px; }
  .pbn-pot .pbn-brush { width: 8px; height: 20px; margin-left: -4px; bottom: 10px; }
}
`
