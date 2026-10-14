import { Canvas, useFrame } from '@react-three/fiber'
import { animate, motion, useMotionValue, useMotionValueEvent, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { createOriginalEffect, Stylize, type StylizeEffect } from '../../lib/stylize'
import { STYLE_CATS, STYLES, type StyleDef } from './styles'

/*
 * 风格切换 — one still life, every stylize effect. Switching wipes the new style across the old one
 * (diagonal, left → right). The draggable split shows the untouched render on the left of the line.
 * Both use the lib's `prev` + `wipe`, whose clip coordinate is wipeCoord(px) = 0.84·x/W + 0.16·y/H
 * (y measured down from the top in CSS terms), so the DOM divider is drawn along that same slanted line.
 */

const ROTATE_EVERY = 6.5

/* ------------------------------------------------------------------ scene */

function StillLife({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const spin = useRef<THREE.Group>(null)
  const ball = useRef<THREE.Mesh>(null)
  const t = useRef(POSTER ? 2.2 : 0)
  useFrame((_, dt) => {
    t.current += Math.min(dt, 1 / 30)
    if (spin.current) spin.current.rotation.set(rx.get(), t.current * 0.18 + ry.get(), 0)
    if (ball.current) ball.current.position.y = 0.55 + Math.abs(Math.sin(t.current * 1.6)) * 0.55
  })
  return (
    <group ref={spin} position={[0, -0.35, 0]}>
      <mesh rotation={[0.35, 0.2, 0]} position={[0, 0.95, 0]} castShadow receiveShadow>
        <torusKnotGeometry args={[0.62, 0.22, 220, 36]} />
        <meshStandardMaterial color="#e2483d" roughness={0.35} />
      </mesh>
      <mesh ref={ball} position={[1.45, 0.55, 0.55]} castShadow>
        <sphereGeometry args={[0.42, 48, 32]} />
        <meshStandardMaterial color="#f2b632" roughness={0.3} />
      </mesh>
      <mesh position={[-1.4, 0.36, 0.5]} rotation={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.72, 0.72]} />
        <meshStandardMaterial color="#3b6cf6" roughness={0.45} />
      </mesh>
      <mesh position={[-0.45, 0.42, -1.25]} castShadow>
        <coneGeometry args={[0.38, 0.85, 40]} />
        <meshStandardMaterial color="#7c5cd6" roughness={0.5} />
      </mesh>
      <mesh position={[0.9, 0.17, -1.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.36, 0.13, 24, 64]} />
        <meshStandardMaterial color="#18a999" roughness={0.4} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.6, 96]} />
        <meshStandardMaterial color="#efe6d6" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <cylinderGeometry args={[2.6, 2.6, 0.3, 96]} />
        <meshStandardMaterial color="#d8ccb8" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ page */

type Phase = { cur: number; from: number | null }

export default function StyleSwitcher() {
  const fxs = useMemo(() => STYLES.map((s) => s.create()), [])
  const original = useMemo(createOriginalEffect, [])
  // compile every style's shader in the background once the first frames are on screen
  const [preload, setPreload] = useState<StylizeEffect[] | undefined>()
  useEffect(() => {
    const id = setTimeout(() => setPreload(fxs), 1500)
    return () => clearTimeout(id)
  }, [fxs])
  const [phase, setPhase] = useState<Phase>({ cur: 0, from: null })
  const [mode, setMode] = useState<string[]>(() => STYLES.map((s) => s.modes?.[0]?.id ?? ''))
  const wipe = useMotionValue(1)
  const split = useMotionValue(POSTER ? 0.47 : 0)
  const ry = useMotionValue(0)
  const rx = useMotionValue(0.08)
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1, h: 1 })
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const busy = useRef(false)
  // where the visitor left the split (the idle "teach" sweep doesn't count)
  const userSplit = useRef(POSTER ? 0.47 : 0)
  const teaching = useRef<ReturnType<typeof animate> | null>(null)

  const style: StyleDef = STYLES[phase.cur]
  const toneOf = (i: number) => {
    const m = STYLES[i].modes?.find((x) => x.id === mode[i])
    return m?.tone ?? (m?.dark ? 'dark' : STYLES[i].meta.theme)
  }
  // the wipe uncovers the left side first, so the bottom-left copy sits over the incoming style
  const tone = toneOf(phase.cur)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = async (next: number) => {
    if (busy.current || next === phase.cur) return
    busy.current = true
    teaching.current?.stop()
    const keep = userSplit.current
    if (split.get() > 0.001) await animate(split, 0, { duration: 0.25, ease: [0.4, 0, 0.2, 1] })
    wipe.set(0)
    STYLES[next].onEnter?.(fxs[next])
    setPhase({ cur: next, from: phase.cur })
    await animate(wipe, 1, { duration: 1.05, ease: [0.65, 0, 0.35, 1] })
    setPhase({ cur: next, from: null })
    if (keep > 0.001) animate(split, keep, { type: 'spring', stiffness: 160, damping: 22 })
    busy.current = false
  }

  // idle: walk through the styles; the first time, sweep the split once to show it exists
  useEffect(() => {
    if (POSTER) return
    const teach = setTimeout(async () => {
      if (performance.now() - lastInput.current < 4000) return
      teaching.current = animate(split, 0.55, { type: 'spring', stiffness: 60, damping: 16 })
      await teaching.current
      if (busy.current || performance.now() - lastInput.current < 1500) return
      await new Promise((r) => setTimeout(r, 900))
      if (busy.current || performance.now() - lastInput.current < 1500) return
      teaching.current = animate(split, 0, { type: 'spring', stiffness: 80, damping: 18 })
    }, 1600)
    return () => clearTimeout(teach)
  }, [split])
  const goRef = useRef(go)
  goRef.current = go
  const curRef = useRef(phase.cur)
  curRef.current = phase.cur
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 9000 || split.get() > 0.01) return
      goRef.current((curRef.current + 1) % STYLES.length)
    }, ROTATE_EVERY * 1000)
    return () => clearInterval(id)
  }, [split])

  // keep the active style visible in the rail (it scrolls once there are many styles)
  useEffect(() => {
    const el = stageRef.current?.querySelector<HTMLElement>('.ss-item[aria-pressed="true"]')
    const rail = el?.parentElement
    if (!el || !rail) return
    const vertical = getComputedStyle(rail).flexDirection === 'column'
    if (vertical) rail.scrollTo({ top: el.offsetTop - rail.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' })
    else rail.scrollTo({ left: el.offsetLeft - rail.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' })
  }, [phase.cur])

  const pickMode = (i: number, id: string) => {
    lastInput.current = performance.now()
    const s = STYLES[i]
    s.setMode?.(fxs[i], id)
    setMode((m) => m.map((v, k) => (k === i ? id : v)))
  }

  /* split divider geometry (CSS px): e = 0.84·x/W + 0.16·y/H */
  const [p, setP] = useState(split.get())
  useMotionValueEvent(split, 'change', setP)
  const xAt = (y: number) => (size.w * (p - (0.16 * y) / size.h)) / 0.84
  const dragSplit = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    teaching.current?.stop()
    const v = THREE.MathUtils.clamp((0.84 * x) / r.width + (0.16 * y) / r.height, 0, 1)
    userSplit.current = v
    split.set(v)
  }

  /* drag on the stage rotates the still life */
  const drag = useRef<{ x: number; y: number; ry: number; rx: number; vx: number; t: number } | null>(null)

  const transitioning = phase.from !== null
  const effect: StylizeEffect = transitioning ? fxs[phase.cur] : original
  const prev: StylizeEffect = transitioning ? fxs[phase.from!] : fxs[phase.cur]
  const background = (transitioning ? STYLES[phase.cur] : style).meta.background
  const wipeMv = transitioning ? wipe : split

  return (
    <div
      ref={stageRef}
      className="stage ss-root"
      data-tone={tone}
      style={{ background: style.meta.background, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button, .ss-handle')) return
        lastInput.current = performance.now()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, ry: ry.get(), rx: rx.get(), vx: 0, t: performance.now() }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const now = performance.now()
        const nry = d.ry + (e.clientX - d.x) * 0.008
        d.vx = (nry - ry.get()) / Math.max(1, now - d.t)
        d.t = now
        ry.set(nry)
        rx.set(THREE.MathUtils.clamp(d.rx + (e.clientY - d.y) * 0.004, -0.25, 0.5))
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        lastInput.current = performance.now()
        if (d) animate(ry, ry.get() + d.vx * 260, { type: 'spring', stiffness: 40, damping: 18 })
        animate(rx, 0.08, { type: 'spring', stiffness: 60, damping: 14 })
      }}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 2.3, 6.2], fov: 36 }} gl={{ antialias: false }}>
        <CameraFrame />
        <Stylize effect={effect} prev={prev} wipe={wipeMv} background={background} preload={preload} />
        <hemisphereLight args={['#fff6ea', '#5a5048', 0.55]} />
        <directionalLight
          position={[-3.5, 6, 4]}
          intensity={3.2}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[4, 2, -3]} intensity={0.9} color="#bcd4ff" />
        <StillLife ry={ry} rx={rx} />
      </Canvas>

      {/* split divider */}
      <div className="ss-split" style={{ opacity: transitioning ? 0 : 1 }}>
        <svg width={size.w} height={size.h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={xAt(0)} y1={0} x2={xAt(size.h)} y2={size.h} stroke="var(--ss-line)" strokeWidth={1.5} opacity={p > 0.004 ? 1 : 0} />
        </svg>
        <motion.div
          className="ss-handle"
          style={{ left: Math.max(14, xAt(size.h * 0.5)), top: size.h * 0.5 }}
          onPointerDown={(e) => {
            e.stopPropagation()
            lastInput.current = performance.now()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            dragSplit(e)
          }}
          onPointerMove={(e) => {
            if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
            lastInput.current = performance.now()
            dragSplit(e)
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.94 }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path d="M6.5 4.5 2 9l4.5 4.5M11.5 4.5 16 9l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
        {p > 0.06 && (
          <span className="ss-tag" style={{ left: Math.max(16, xAt(size.h * 0.18) - 64), top: size.h * 0.18 }}>
            原图
          </span>
        )}
      </div>

      <div className="overlay">
        {/* a soft local backdrop in the style's own paper colour keeps the label legible over busy patterns */}
        <motion.div
          className="ss-scrim"
          animate={{ background: `radial-gradient(closest-side, ${hexA(toneOf(phase.cur) === 'dark' ? STYLES[phase.cur].meta.background : '#f6f3ec', 0.92)}, ${hexA(toneOf(phase.cur) === 'dark' ? STYLES[phase.cur].meta.background : '#f6f3ec', 0)})` }}
          transition={{ duration: 0.6 }}
        />
        <BigLabel
          id={style.id}
          meta={`${String(phase.cur + 1).padStart(2, '0')} / ${String(STYLES.length).padStart(2, '0')} · 同一个场景`}
          title={style.meta.title}
          sub={style.meta.en}
          aside={style.note}
        />
        {/* style picker: a vertical rail on the right (desktop), a scrollable chip row (phones) */}
        <nav className="ss-rail" aria-label="画风">
          {STYLES.map((st, i) => [
            (i === 0 || STYLES[i - 1].cat !== st.cat) && (
              <span key={`cat-${st.cat}`} className="ss-cat">
                {STYLE_CATS.find((c) => c.id === st.cat)?.label}
              </span>
            ),
            <button
              key={st.id}
              className="ss-item"
              aria-pressed={i === phase.cur}
              onClick={() => {
                lastInput.current = performance.now()
                go(i)
              }}
            >
              {i === phase.cur && <motion.span layoutId="ss-item-bg" className="ss-item-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className="ss-item-no">{String(i + 1).padStart(2, '0')}</span>
              <span className="ss-item-name">{st.meta.title}</span>
            </button>,
          ])}
        </nav>
        {style.modes && style.modes.length > 1 && (
          <div className="dock">
            <Seg items={style.modes.map((m) => ({ value: m.id, label: m.label }))} value={mode[phase.cur]} onChange={(id) => pickMode(phase.cur, id)} />
          </div>
        )}
        <p className="hint">拖动把手对比原图 · 拖动画面旋转</p>
      </div>

      <style>{`
        .ss-root { --ss-line: rgba(30, 28, 26, 0.85); }
        .ss-root[data-tone='dark'] { --ss-line: rgba(255, 255, 255, 0.85); }
        .demo-page:has(.ss-root[data-tone='dark']) {
          --fg: #f4f2ee; --fg-2: rgba(244, 242, 238, 0.62); --glass: rgba(20, 20, 24, 0.55); --line: rgba(255,255,255,0.12);
        }
        .demo-page:has(.ss-root[data-tone='light']) {
          --fg: #1c1b19; --fg-2: rgba(28, 27, 25, 0.6); --glass: rgba(255, 255, 255, 0.62); --line: rgba(0,0,0,0.08);
        }
        .ss-split { position: absolute; inset: 0; pointer-events: none; transition: opacity 0.2s; z-index: 5; }
        .ss-handle {
          position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 40px;
          display: grid; place-items: center; pointer-events: auto; cursor: ew-resize; touch-action: none;
          background: var(--glass); color: var(--fg); backdrop-filter: blur(14px) saturate(1.4);
          -webkit-backdrop-filter: blur(14px) saturate(1.4);
          box-shadow: 0 6px 22px rgba(0,0,0,0.18), inset 0 0 0 1px var(--line);
        }
        .ss-tag {
          position: absolute; padding: 4px 10px; border-radius: 99px; font: 500 12px/1.4 var(--mono);
          background: var(--glass); color: var(--fg); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          box-shadow: inset 0 0 0 1px var(--line);
        }
        .poster .ss-split { display: none; }
        .ss-rail {
          position: absolute; right: clamp(16px, 2.4vw, 32px); top: 50%; transform: translateY(-50%);
          display: flex; flex-direction: column; gap: 2px; padding: 6px; border-radius: 18px; pointer-events: auto;
          max-height: calc(100% - 200px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
          background: var(--glass); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
          box-shadow: 0 10px 34px rgba(0,0,0,0.12), inset 0 0 0 1px var(--line);
        }
        .ss-item {
          position: relative; display: flex; align-items: baseline; gap: 10px; padding: 6px 14px 6px 10px; border: 0; flex: none;
          border-radius: 12px; background: none; color: var(--fg-2); font: 500 13px/1.3 var(--sans, inherit); text-align: left;
          cursor: pointer; white-space: nowrap; transition: color 0.2s;
        }
        .ss-item:hover, .ss-item[aria-pressed='true'] { color: var(--fg); }
        .ss-item-bg { position: absolute; inset: 0; border-radius: 12px; background: color-mix(in srgb, var(--fg) 10%, transparent); }
        .ss-item-no { position: relative; font: 500 10px/1 var(--mono); opacity: 0.6; }
        .ss-item-name { position: relative; }
        .ss-cat {
          flex: none; padding: 10px 10px 3px; font: 500 10px/1.2 var(--mono); letter-spacing: 0.06em;
          color: var(--fg-2); opacity: 0.75; white-space: nowrap;
        }
        .ss-cat:first-child { padding-top: 4px; }
        @media (max-width: 759px) {
          .ss-rail {
            top: auto; bottom: 74px; right: 12px; left: 12px; transform: none; flex-direction: row; overflow-x: auto;
            max-height: none; overflow-y: hidden;
            scrollbar-width: none; border-radius: 14px;
          }
          .ss-rail::-webkit-scrollbar { display: none; }
          .ss-item { padding: 7px 11px; }
          .ss-item-no { display: none; }
          .ss-cat { align-self: center; padding: 0 4px 0 10px; border-left: 1px solid var(--line); }
          .ss-cat:first-child { border-left: 0; padding-left: 6px; }
          .ss-root .big-label { bottom: 132px; }
        }
        .ss-scrim { position: absolute; left: -12vw; bottom: -10vh; width: min(760px, 70vw); height: 380px; pointer-events: none; }
        .ss-root .big-label { z-index: 1; }
        @media (max-width: 759px) { .ss-root .dock { max-width: calc(100vw - 24px); overflow-x: auto; } }
        .poster .ss-rail { display: none; }
      `}</style>
    </div>
  )
}

/** keeps the still life framed on any aspect: pulls back on narrow screens */
function CameraFrame() {
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    // keep the objects (±2.1 wide) inside the frame horizontally; the floor disc may crop
    const halfW = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect
    const dist = Math.max(6.2, 2.1 / halfW)
    cam.position.set(0, 2.3 * (dist / 6.2), dist)
    cam.lookAt(0, aspect < 1 ? 0.15 : 0.35, 0)
  })
  return null
}

/** '#rrggbb' + alpha → rgba() (so Motion can interpolate the gradient stops) */
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
