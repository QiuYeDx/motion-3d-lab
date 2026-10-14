import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { chalkBoard, chalkMeta, chalkModes, chalkProgress, createChalkEffect, drawChalk, eraseChalk, setChalkMode, setChalkSize, settleChalk, type ChalkMode } from './effects/chalk'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 粉笔板书 showcase — a maths lesson: 正方体、圆锥、球、圆柱 standing on a chalk ground line, with
 * dimension lines (a, h) as thin rods, turning gently. A wooden frame and a chalk tray hold the board.
 * 板书讲解 adds the teacher's handwriting in the page DOM: formulas with hand-drawn arrows pointing at
 * projected 3D anchors (updated every frame without React re-renders), written in after the drawing.
 * 擦除 sweeps a felt eraser across (the effect wipes behind its front and leaves residue), then the
 * drawing is chalked in again. Effect: ./effects/chalk.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 12000
const ERASE_MS = 1250

const SPEC: Record<ChalkMode, { tool: string; note: string }> = {
  board: { tool: '白粉笔', note: '亮处上粉 · 暗处留黑板 · 只在最鲜艳处换色' },
  color: { tool: '彩色粉笔', note: '黄 粉 蓝 绿 橙 · 侧锋铺色 · 高光重按' },
  lecture: { tool: '板书', note: '线条干净 · 公式、箭头和标注写在旁边' },
}

/* ------------------------------------------------------------------ the solids */

type Anchors = { cube: THREE.Object3D | null; cone: THREE.Object3D | null; sphere: THREE.Object3D | null; cyl: THREE.Object3D | null; a: THREE.Object3D | null; h: THREE.Object3D | null }

const mat = (color: string, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness })

function Rod({ from, to, r = 0.018, m }: { from: [number, number, number]; to: [number, number, number]; r?: number; m: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const d = b.clone().sub(a)
    return {
      pos: a.clone().add(b).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
      len: d.length(),
    }
  }, [from, to])
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <cylinderGeometry args={[r, r, len, 6]} />
    </mesh>
  )
}

function Solids({ ry, anchors, onReady }: { ry: MotionValue<number>; anchors: React.RefObject<Anchors>; onReady: () => void }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const cube = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 2.5 : 0)
  const M = useMemo(
    () => ({
      cube: mat('#6fb0e8', 0.55),
      cone: mat('#f2c94c', 0.55),
      sphere: mat('#ea6d93', 0.35),
      cyl: mat('#7ccf86', 0.5),
      dim: mat('#f4f1e8', 0.8),
      ground: mat('#d9d5cc', 0.9),
    }),
    [],
  )
  useEffect(() => () => Object.values(M).forEach((m) => m.dispose()), [M])

  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(1, vw / 8.6, vh / 4.6) : mobile ? Math.min(0.62, vw / 9.6) : Math.min(0.95, vh / 5.4, vw / 12.5)
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.17, POSTER ? -0.35 * k : mobile ? vh * 0.12 : -0.3 * k, 0)
    }
    if (spin.current) spin.current.rotation.y = (POSTER ? 0.18 : Math.sin(t.current * 0.16) * 0.32) + ry.get()
    if (cube.current) cube.current.rotation.y = 0.6 + (POSTER ? 0 : t.current * 0.12)
  })

  const set = (key: keyof Anchors) => (o: THREE.Object3D | null) => {
    if (anchors.current) anchors.current[key] = o
  }

  return (
    <>
      <hemisphereLight args={['#ffffff', '#2a3330', 0.3]} />
      <directionalLight position={[-4, 6, 5]} intensity={3.0} color="#fffaf0" />
      <directionalLight position={[5, 1.5, 3]} intensity={0.35} color="#cfe0ff" />
      <group ref={rig}>
        <group ref={content} visible={ready}>
          <group ref={spin} rotation={[0.12, 0, 0]}>
            {/* ground line */}
            <mesh position={[0, -0.02, 0]} material={M.ground}>
              <boxGeometry args={[8.6, 0.04, 0.04]} />
            </mesh>

            {/* 正方体 with its edge dimension a */}
            <group position={[-2.85, 0, 0.2]}>
              <group ref={cube}>
                <mesh position={[0, 0.6, 0]} material={M.cube}>
                  <boxGeometry args={[1.2, 1.2, 1.2]} />
                </mesh>
                <object3D ref={set('cube')} position={[0.6, 1.2, 0.6]} />
                <Rod from={[-0.6, -0.12, 0.78]} to={[0.6, -0.12, 0.78]} m={M.dim} />
                <Rod from={[-0.6, -0.22, 0.78]} to={[-0.6, -0.02, 0.78]} m={M.dim} />
                <Rod from={[0.6, -0.22, 0.78]} to={[0.6, -0.02, 0.78]} m={M.dim} />
                <object3D ref={set('a')} position={[0, -0.12, 0.78]} />
              </group>
            </group>

            {/* 圆锥 */}
            <group position={[-0.95, 0, -0.25]}>
              <mesh position={[0, 0.85, 0]} material={M.cone}>
                <coneGeometry args={[0.72, 1.7, 64]} />
              </mesh>
              <object3D ref={set('cone')} position={[0, 1.7, 0]} />
            </group>

            {/* 球 */}
            <group position={[0.9, 0, 0.25]}>
              <mesh position={[0, 0.75, 0]} material={M.sphere}>
                <sphereGeometry args={[0.75, 64, 40]} />
              </mesh>
              <object3D ref={set('sphere')} position={[0.53, 1.28, 0]} />
            </group>

            {/* 圆柱 with its height h */}
            <group position={[2.75, 0, -0.1]}>
              <mesh position={[0, 0.7, 0]} material={M.cyl}>
                <cylinderGeometry args={[0.55, 0.55, 1.4, 64]} />
              </mesh>
              <Rod from={[0.82, 0, 0]} to={[0.82, 1.4, 0]} m={M.dim} />
              <Rod from={[0.7, 0, 0]} to={[0.94, 0, 0]} m={M.dim} />
              <Rod from={[0.7, 1.4, 0]} to={[0.94, 1.4, 0]} m={M.dim} />
              <object3D ref={set('cyl')} position={[0.3, 1.4, 0.4]} />
              <object3D ref={set('h')} position={[0.82, 0.7, 0]} />
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ teacher's notes (DOM) */

type NoteDef = { key: 'cube' | 'cone' | 'sphere' | 'cyl'; name: string; formula: string; dx: number; dy: number; mdx?: number; mdy?: number }

const NOTES: NoteDef[] = [
  { key: 'cube', name: '正方体', formula: 'V = a³', dx: -150, dy: -118, mdx: 34, mdy: -150 },
  { key: 'cone', name: '圆锥', formula: 'V = ⅓πr²h', dx: -40, dy: -132, mdx: 0, mdy: -84 },
  { key: 'sphere', name: '球', formula: 'V = ⁴⁄₃πr³', dx: -30, dy: -150, mdx: -10, mdy: -140 },
  { key: 'cyl', name: '圆柱', formula: 'V = πr²h', dx: 40, dy: -150, mdx: -34, mdy: -84 },
]

/** projects the anchors every frame and moves the labels / arrows (no React state) */
function NoteTracker({ anchors, labels, paths, heads, dims }: {
  anchors: React.RefObject<Anchors>
  labels: React.RefObject<(HTMLDivElement | null)[]>
  paths: React.RefObject<(SVGPathElement | null)[]>
  heads: React.RefObject<(SVGPathElement | null)[]>
  dims: React.RefObject<(HTMLDivElement | null)[]>
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const A = anchors.current
    if (!A) return
    const mobile = size.width < 760
    const toScreen = (o: THREE.Object3D) => {
      o.getWorldPosition(v)
      v.project(camera)
      return [(v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height] as const
    }
    NOTES.forEach((n, i) => {
      const o = A[n.key]
      const el = labels.current?.[i]
      const p = paths.current?.[i]
      const h = heads.current?.[i]
      if (!o || !el || !p || !h) return
      const [ax, ay] = toScreen(o)
      const dx = mobile ? (n.mdx ?? n.dx) : n.dx
      const dy = mobile ? (n.mdy ?? n.dy) : n.dy
      const lx = ax + dx
      const ly = ay + dy
      el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -50%)`
      // arrow: from just below the label to just short of the anchor, bowed like a hand-drawn curve
      const sx = lx + (dx < 0 ? 18 : -18) * (Math.abs(dx) > 40 ? 1 : 0)
      const sy = ly + 20
      const ex = ax + (sx - ax) * 0.1
      const ey = ay + (sy - ay) * 0.1
      const mx = (sx + ex) / 2 + (ey - sy) * 0.22
      const my = (sy + ey) / 2 - (ex - sx) * 0.22
      p.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`)
      // arrow head along the end tangent
      const tx = ex - mx
      const ty = ey - my
      const L = Math.hypot(tx, ty) || 1
      const ux = tx / L
      const uy = ty / L
      const hl = 11
      const a1x = ex - ux * hl - uy * hl * 0.55
      const a1y = ey - uy * hl + ux * hl * 0.55
      const a2x = ex - ux * hl + uy * hl * 0.55
      const a2y = ey - uy * hl - ux * hl * 0.55
      h.setAttribute('d', `M${a1x.toFixed(1)} ${a1y.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${a2x.toFixed(1)} ${a2y.toFixed(1)}`)
    })
    ;(['a', 'h'] as const).forEach((key, i) => {
      const o = A[key]
      const el = dims.current?.[i]
      if (!o || !el) return
      const [x, y] = toScreen(o)
      el.style.transform = `translate(${(x + (key === 'h' ? 16 : 0)).toFixed(1)}px, ${(y + (key === 'a' ? 16 : 0)).toFixed(1)}px) translate(-50%, -50%)`
    })
  })
  return null
}

/** drives the felt eraser sprite + the redraw progress bar from the effect's own clock */
function EffectClock({ fx, eraser, drawBtn }: { fx: StylizeEffect; eraser: React.RefObject<HTMLDivElement | null>; drawBtn: React.RefObject<HTMLButtonElement | null> }) {
  const size = useThree((s) => s.size)
  const t = useRef(0)
  useFrame((_, dt) => {
    t.current += dt
    const p = chalkProgress(fx)
    const e = eraser.current
    if (e) {
      if (p.erasing >= 0) {
        const front = -0.06 + p.erasing * (2 - p.erasing) * 1.16
        const x = (front * 0.995 - 0.02) * size.width
        const y = size.height * (0.5 + Math.sin(t.current * 15) * 0.2 + Math.sin(t.current * 4.3) * 0.08)
        e.style.opacity = '1'
        e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${(Math.sin(t.current * 15) * 8).toFixed(1)}deg)`
      } else e.style.opacity = '0'
    }
    const b = drawBtn.current
    if (b) {
      b.style.setProperty('--p', p.draw.toFixed(3))
      b.dataset.drawing = p.draw < 1 || p.erasing >= 0 ? '1' : '0'
    }
  })
  return null
}

/* ------------------------------------------------------------------ page */

const today = () => {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${'日一二三四五六'[d.getDay()]}`
}

export default function Chalkboard() {
  const [mode, setMode] = useState<ChalkMode>(POSTER ? 'lecture' : 'board')
  const fx = useMemo(() => {
    const f = createChalkEffect()
    if (MOBILE) setChalkSize(f, 0.8)
    settleChalk(f)
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const drawBtn = useRef<HTMLButtonElement>(null)
  const eraser = useRef<HTMLDivElement>(null)
  // notes are re-written (remounted) after every redraw; hidden while the eraser passes
  const [noteRun, setNoteRun] = useState(0)
  const [erasing, setErasing] = useState(false)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const anchors = useRef<Anchors>({ cube: null, cone: null, sphere: null, cyl: null, a: null, h: null })
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const paths = useRef<(SVGPathElement | null)[]>([])
  const heads = useRef<(SVGPathElement | null)[]>([])
  const dims = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => setChalkMode(fx, mode), [fx, mode])
  const onReady = () => {
    if (POSTER) return
    drawChalk(fx)
    setNoteRun((n) => n + 1)
  }
  const redraw = () => {
    drawChalk(fx)
    setNoteRun((n) => n + 1)
  }
  const erase = (then?: () => void) => {
    if (erasing) return
    eraseChalk(fx)
    setErasing(true)
    timers.current.push(
      window.setTimeout(() => {
        setErasing(false)
        then?.()
        setNoteRun((n) => n + 1)
      }, ERASE_MS),
    )
  }

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const erasingRef = useRef(false)
  erasingRef.current = erasing
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current || erasingRef.current) return
      const p = chalkProgress(fx)
      if (p.draw < 1) return
      // the next lesson: wipe the board, then draw it in the next style
      eraseChalk(fx)
      setErasing(true)
      timers.current.push(
        window.setTimeout(() => {
          setErasing(false)
          setMode((m) => chalkModes[(chalkModes.findIndex((o) => o.id === m) + 1) % chalkModes.length].id)
          setNoteRun((n) => n + 1)
        }, ERASE_MS),
      )
    }, CYCLE_EVERY)
    return () => clearInterval(id)
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.005, -1.1, 1.1))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 600, min: -1.1, max: 1.1, bounceStiffness: 140, bounceDamping: 18 })
  }

  const S = SPEC[mode]
  const label = chalkModes.find((m) => m.id === mode)!.label
  const lecture = mode === 'lecture'
  const showNotes = lecture && !erasing && !split.open

  return (
    <div
      className={`stage theme-dark ck ck-${mode}${split.open ? ' ck-split' : ''}`}
      style={{ background: chalkBoard[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="ck-chalk" x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.05" result="m" />
          <feComposite in="d" in2="m" operator="in" />
        </filter>
      </svg>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.0, 11], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={chalkMeta.background} preload={preload} />
        <Solids ry={ry} anchors={anchors} onReady={onReady} />
        <NoteTracker anchors={anchors} labels={labels} paths={paths} heads={heads} dims={dims} />
        <EffectClock fx={fx} eraser={eraser} drawBtn={drawBtn} />
      </Canvas>

      {/* the teacher's handwriting, chalk-textured by an SVG filter */}
      <div className="ck-notes" aria-hidden>
        <AnimatePresence>
          {showNotes && (
            <motion.div key={noteRun} className="ck-notes-in" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
              <svg className="ck-arrows">
                {NOTES.map((n, i) => (
                  <g key={n.key}>
                    <motion.path
                      ref={(el) => {
                        paths.current[i] = el
                      }}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: (POSTER ? 0 : 1.9) + i * 0.45 + 0.35, duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                    />
                    <motion.path
                      ref={(el) => {
                        heads.current[i] = el
                      }}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: (POSTER ? 0 : 1.9) + i * 0.45 + 0.78, duration: 0.18 }}
                    />
                  </g>
                ))}
              </svg>
              {NOTES.map((n, i) => (
                <div
                  key={n.key}
                  className="ck-note"
                  ref={(el) => {
                    labels.current[i] = el
                  }}
                >
                  <motion.span
                    initial={{ clipPath: 'inset(0 100% 0 0)' }}
                    animate={{ clipPath: 'inset(0 0% 0 0)' }}
                    transition={{ delay: (POSTER ? 0 : 1.9) + i * 0.45, duration: 0.5, ease: 'linear' }}
                  >
                    <b>{n.name}</b> {n.formula}
                  </motion.span>
                </div>
              ))}
              {(['a', 'h'] as const).map((k, i) => (
                <motion.div
                  key={k}
                  className="ck-dim"
                  ref={(el) => {
                    dims.current[i] = el
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: (POSTER ? 0 : 1.6) + i * 0.2, duration: 0.3 }}
                >
                  {k}
                </motion.div>
              ))}
              <motion.div
                className="ck-date"
                initial={{ clipPath: 'inset(0 100% 0 0)' }}
                animate={{ clipPath: 'inset(0 0% 0 0)' }}
                transition={{ delay: POSTER ? 0 : 0.5, duration: 0.7, ease: 'linear' }}
              >
                {today()}
                <span>值日：小林</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="ck-eraser" ref={eraser} aria-hidden>
        <i />
      </div>

      {/* wooden frame + chalk tray */}
      <div className="ck-frame" aria-hidden />
      <div className="ck-tray" aria-hidden>
        <i className="s1" />
        <i className="s2" />
        <i className="s3" />
        <i className="s4" />
        <b className="ck-tray-eraser" />
      </div>

      <div className="overlay">
        <div className="hero-copy ck-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Chalkboard · 第三节 数学课
            </p>
            <h1>
              粉笔一画，
              <br />
              满手是灰
            </h1>
            <p className="ck-sub">亮的地方上粉，暗的地方留出黑板：轮廓被板面的颗粒打断、偶尔描两遍，阴影用粉笔侧锋一排排铺上去，高光处重重按满。黑板上还留着上节课没擦干净的印子。</p>
            <div className="ck-spec">
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
          <Seg items={chalkModes.map((m) => ({ value: m.id, label: MOBILE && m.id === 'lecture' ? '讲解' : MOBILE && m.id === 'color' ? '彩色' : m.label }))} value={mode} onChange={(m) => {
            touch()
            setMode(m)
          }} />
          <span className="dock-sep" />
          <button ref={drawBtn} className="seg ck-btn ck-draw" onClick={redraw} aria-label="重写">
            <span>重写</span>
            <i className="ck-bar" />
          </button>
          <button className="seg ck-btn" onClick={() => erase()} aria-label="擦除">
            <span>擦除</span>
          </button>
          <button className="seg ck-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="ck-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动几何体 · 闲置时擦掉重画</p>
      </div>
    </div>
  )
}

const HAND = `"STKaiti", "KaiTi", "Kaiti SC", "BiauKai", "楷体", "Xingkai SC", cursive`

const css = `
.ck { cursor: grab; touch-action: none; transition: background .8s; }
.ck:active { cursor: grabbing; }
.ck canvas { display: block; }
.ck-copy { pointer-events: none !important; --soft-bg: #1d2622; }
.ck-lecture .ck-copy { --soft-bg: #22392c; }
.ck-copy .scrim { opacity: .7; }
.ck-split .ck-copy .scrim { opacity: .95; }
.ck-copy .kicker { color: rgba(243, 240, 230, .72); }
.ck-copy .kicker i { background: #f5e07a; }
.ck-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #f3f0e6; font-family: ${HAND}; font-weight: 400; letter-spacing: .03em; }
.ck-sub { max-width: 400px; color: rgba(243, 240, 230, .74) !important; }
.ck-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: rgba(243, 240, 230, .72); }
.ck-spec span { display: inline-flex; align-items: center; gap: 10px; }
.ck-spec b { font-weight: 600; color: #f3f0e6; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(243, 240, 230, .32); font-family: var(--sans); }
.ck .dock { bottom: 40px; }
.ck .hint { bottom: 44px; right: 36px; color: rgba(243, 240, 230, .6); }
.ck-split .hint { opacity: 0; }
.ck-btn span { display: inline-flex; align-items: center; gap: 6px; }
.ck-draw { overflow: hidden; }
.ck-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #f5e07a; transform-origin: left; transform: scaleX(var(--p, 1)); opacity: 0; transition: opacity .3s;
}
.ck-draw[data-drawing='1'] .ck-bar { opacity: .85; }

.ck-notes, .ck-notes-in { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.ck-notes-in { filter: url(#ck-chalk); }
.ck-arrows { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
.ck-arrows path { fill: none; stroke: #f3f0e6; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; opacity: .9; }
.ck-note {
  position: absolute; left: 0; top: 0; white-space: nowrap; will-change: transform;
  font: 400 24px/1.2 ${HAND}; color: #f3f0e6; opacity: .94; text-shadow: 0 0 1px rgba(243,240,230,.6);
}
.ck-note b { font-weight: 400; color: #f5e07a; margin-right: 4px; }
.ck-note span { display: inline-block; padding: 2px 4px; }
.ck-dim { position: absolute; left: 0; top: 0; font: italic 400 22px/1 "Times New Roman", serif; color: #9ccff0; will-change: transform; }
.ck-date {
  position: absolute; top: 88px; right: clamp(28px, 4vw, 64px); text-align: right;
  font: 400 22px/1.5 ${HAND}; color: #f3f0e6; opacity: .88;
}
.ck-date span { display: block; font-size: 17px; color: #f3a3bf; }

.ck-eraser {
  position: absolute; left: 0; top: 0; width: 76px; height: 150px; z-index: 2; pointer-events: none; opacity: 0;
  border-radius: 10px; background: linear-gradient(90deg, #a8743f, #c48a4d 40%, #8f5e31);
  box-shadow: 0 14px 30px -8px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.12);
}
.ck-eraser i { position: absolute; right: -10px; top: 6px; bottom: 6px; width: 14px; border-radius: 4px; background: repeating-linear-gradient(0deg, #e8e5dc 0 2px, #cfcac0 2px 4px); }

.ck-frame {
  position: absolute; inset: 0; z-index: 3; pointer-events: none; padding: 12px;
  background:
    repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 3px, transparent 3px 11px, rgba(255,255,255,.05) 11px 13px, transparent 13px 29px),
    repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 3px, transparent 3px 11px, rgba(255,255,255,.05) 11px 13px, transparent 13px 29px),
    linear-gradient(135deg, #9a6a3d, #7c522c 50%, #a3703f);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
}
.ck::after {
  content: ''; position: absolute; inset: 12px; pointer-events: none; z-index: 2;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.4), inset 0 6px 18px rgba(0,0,0,.45), inset 0 -2px 10px rgba(0,0,0,.3);
}
.ck-tray {
  position: absolute; left: 12px; right: 12px; bottom: 12px; height: 16px; z-index: 3; pointer-events: none;
  background: linear-gradient(180deg, #b07a45, #7a4f2a); box-shadow: 0 -3px 8px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25);
}
.ck-tray i { position: absolute; bottom: 9px; height: 7px; border-radius: 3px; box-shadow: inset 0 -2px 0 rgba(0,0,0,.12); }
.ck-tray .s1 { left: 18%; width: 46px; background: #f3f0e6; }
.ck-tray .s2 { left: calc(18% + 54px); width: 30px; background: #f5e07a; transform: rotate(-4deg); }
.ck-tray .s3 { right: 22%; width: 38px; background: #f3a3bf; }
.ck-tray .s4 { right: calc(22% + 46px); width: 22px; background: #9ccff0; }
.ck-tray-eraser {
  position: absolute; right: 9%; bottom: 9px; width: 70px; height: 13px; border-radius: 4px;
  background: linear-gradient(180deg, #c48a4d 0 55%, #ddd8ce 55%);
}
@media (max-width: 760px) {
  .ck-sub { display: none; }
  .ck-copy h1 { font-size: 34px; }
  .ck-spec { margin-top: 10px; font-size: 11px; }
  .ck .dock .seg { padding: 0 9px; }
  .ck .dock .dock-sep { margin: 0 1px; }
  .ck-split .ck-copy { opacity: 0; }
  .ck-note { font-size: 15px; }
  .ck-dim { font-size: 17px; }
  .ck-date { top: 76px; font-size: 16px; right: 22px; }
  .ck-date span { font-size: 13px; }
  .ck-eraser { width: 56px; height: 110px; }
  .ck .hint { display: none; }
}
`
