import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  PAPERS,
  createPapercutEffect,
  papercutModes,
  setPapercutBox,
  setPapercutDepth,
  setPapercutLayers,
  setPapercutMode,
  type PapercutMode,
} from './effects/papercut'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 剪纸叠层 showcase — a moonlit valley built from flat cut-outs at five depths (moon & clouds, far peaks,
 * pine ridge, a hill with a little house, the front meadow with a deer). The stack order comes mostly
 * from depth, so the camera's slow sway slides the sheets against each other (real parallax), and the
 * effect re-cuts them every frame. The effect (sheets, shadows, shadow box) lives in ./effects/papercut.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const PAGE = '#efe7da'
const CAM_Z = 10
const DESIGN_H = 4.4 // world units (at z = 0) that fill the box height

const LAYERS = [4, 5, 6, 7]

const SPEC: Record<PapercutMode, { paper: string; light: string }> = {
  lightbox: { paper: '青 → 橙 渐变卡纸 · 前景最亮', light: '背光透出 · 每层投下柔影' },
  chinese: { paper: '一张红宣纸 · 亮处刻月牙纹', light: '贴在米色底上 · 薄薄一层影' },
  kirigami: { paper: '只有白卡纸', light: '明暗全靠层与层之间的阴影' },
}

/** the shadow box (CSS px): centre, half width, half height — shared by the effect and the camera */
function boxFor(w: number, h: number) {
  if (POSTER) return { x: w / 2, y: h / 2, halfWidth: w * 0.42, halfHeight: h * 0.41 }
  if (w < 760) {
    const halfWidth = w / 2 - 18
    const halfHeight = Math.min(h * 0.27, halfWidth * 1.15)
    return { x: w / 2, y: 86 + halfHeight, halfWidth, halfHeight }
  }
  const halfHeight = Math.min((h - 220) / 2, 340)
  const halfWidth = Math.min(halfHeight * 1.18, w * 0.3)
  const x = Math.min(Math.max(w * 0.64, 560 + halfWidth + 30), w - halfWidth - 64)
  return { x, y: 96 + halfHeight, halfWidth, halfHeight }
}

/* ------------------------------------------------------------------ shapes */

function ridgeShape(pts: [number, number][], bottom = -6) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], bottom)
  pts.forEach(([x, y]) => s.lineTo(x, y))
  s.lineTo(pts[pts.length - 1][0], bottom)
  s.closePath()
  return s
}

function wave(x0: number, x1: number, n: number, f: (x: number) => number): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / n
    return [x, f(x)]
  })
}

function cloudShape(w: number) {
  const s = new THREE.Shape()
  s.moveTo(-w, 0)
  s.absarc(-w * 0.55, 0.12, 0.2, Math.PI, Math.PI * 0.35, true)
  s.absarc(-w * 0.1, 0.22, 0.3, Math.PI * 0.9, Math.PI * 0.15, true)
  s.absarc(w * 0.45, 0.12, 0.24, Math.PI * 0.75, 0, true)
  s.lineTo(w * 0.7, 0)
  s.closePath()
  return s
}

function deerShape() {
  const P: [number, number][] = [
    [-0.45, 0.42], [-0.2, 0.47], [0.05, 0.48], [0.28, 0.45], [0.36, 0.58], [0.42, 0.78], [0.44, 0.88],
    [0.43, 0.97], [0.5, 0.92], [0.56, 0.9], [0.69, 0.83], [0.69, 0.78], [0.54, 0.77], [0.47, 0.6],
    [0.41, 0.4], [0.37, 0.3], [0.38, 0.0], [0.33, 0.0], [0.31, 0.27], [0.25, 0.26], [0.23, 0.0],
    [0.18, 0.0], [0.17, 0.27], [-0.29, 0.29], [-0.31, 0.0], [-0.36, 0.0], [-0.37, 0.22], [-0.41, 0.0],
    [-0.46, 0.0], [-0.45, 0.3], [-0.52, 0.38],
  ]
  const s = new THREE.Shape()
  P.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
  s.closePath()
  return s
}

/** thin quad strip along a polyline (antlers, chimney smoke stems …) */
function strokeGeometry(segs: [number, number][][], w: number) {
  const pos: number[] = []
  segs.forEach((pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      const l = Math.hypot(bx - ax, by - ay) || 1
      const nx = (-(by - ay) / l) * w
      const ny = ((bx - ax) / l) * w
      pos.push(ax - nx, ay - ny, 0, bx - nx, by - ny, 0, bx + nx, by + ny, 0, ax - nx, ay - ny, 0, bx + nx, by + ny, 0, ax + nx, ay + ny, 0)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

/** a cut-out sheet at depth z, authored in "apparent" units (as seen at z = 0) */
function Sheet({ z, children }: { z: number; children: React.ReactNode }) {
  const s = (CAM_Z - z) / CAM_Z
  return (
    <group position={[0, 0, z]} scale={[s, s, 1]}>
      {children}
    </group>
  )
}

const Flat = ({ color }: { color: string }) => <meshBasicMaterial color={color} side={THREE.DoubleSide} />

/* ------------------------------------------------------------------ scene */

function Valley({ sx, sy }: { sx: MotionValue<number>; sy: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const cloudA = useRef<THREE.Group>(null)
  const cloudB = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const smoke = useRef<(THREE.Mesh | null)[]>([])
  const t0 = useRef(POSTER ? 6 : 0)

  const G = useMemo(() => {
    const far = ridgeShape([
      ...wave(-7, -2.4, 10, (x) => 0.35 + Math.sin(x * 1.1) * 0.25),
      [-1.9, 1.15], [-1.35, 0.55], [-0.9, 0.95], [-0.2, 0.25], [0.5, 0.75], [1.05, 0.35],
      ...wave(1.4, 7, 12, (x) => 0.5 + Math.sin(x * 1.4) * 0.3),
    ])
    const ridge = ridgeShape(wave(-7, 7, 60, (x) => -0.22 + Math.sin(x * 0.9 + 0.6) * 0.24 + Math.sin(x * 2.3) * 0.07))
    const hill = ridgeShape(wave(-7, 7, 60, (x) => -0.85 + Math.sin(x * 0.75 - 0.9) * 0.3 + Math.sin(x * 1.9) * 0.05))
    const meadow = ridgeShape(wave(-7, 7, 60, (x) => -1.45 + Math.sin(x * 0.6 + 1.8) * 0.22 + Math.sin(x * 3.1) * 0.04))
    const pine = new THREE.Shape()
    pine.moveTo(0, 0.62)
    ;[
      [0.16, 0.36], [0.09, 0.36], [0.22, 0.14], [0.12, 0.14], [0.27, -0.08], [0.04, -0.08], [0.04, -0.2],
      [-0.04, -0.2], [-0.04, -0.08], [-0.27, -0.08], [-0.12, 0.14], [-0.22, 0.14], [-0.09, 0.36], [-0.16, 0.36],
    ].forEach(([x, y]) => pine.lineTo(x, y))
    pine.closePath()
    const roundTree = new THREE.Shape()
    roundTree.moveTo(0.03, -0.25)
    roundTree.lineTo(0.03, 0.02)
    roundTree.absarc(0, 0.2, 0.2, -Math.PI * 0.42, Math.PI * 1.42, false)
    roundTree.lineTo(-0.03, 0.02)
    roundTree.lineTo(-0.03, -0.25)
    roundTree.closePath()
    const house = new THREE.Shape()
    ;[
      [-0.3, 0], [0.3, 0], [0.3, 0.32], [0.36, 0.3], [0, 0.6], [-0.36, 0.3], [-0.3, 0.32],
    ].forEach(([x, y], i) => (i ? house.lineTo(x, y) : house.moveTo(x, y)))
    house.closePath()
    const antlers = strokeGeometry(
      [
        [[0.46, 0.92], [0.42, 1.06], [0.34, 1.18], [0.3, 1.3]],
        [[0.42, 1.06], [0.5, 1.15]],
        [[0.36, 1.16], [0.4, 1.27]],
        [[0.49, 0.93], [0.52, 1.07], [0.5, 1.2]],
        [[0.52, 1.07], [0.6, 1.13]],
      ],
      0.016,
    )
    return {
      far: new THREE.ShapeGeometry(far, 2),
      ridge: new THREE.ShapeGeometry(ridge, 2),
      hill: new THREE.ShapeGeometry(hill, 2),
      meadow: new THREE.ShapeGeometry(meadow, 2),
      pine: new THREE.ShapeGeometry(pine, 1),
      roundTree: new THREE.ShapeGeometry(roundTree, 12),
      house: new THREE.ShapeGeometry(house, 1),
      cloud: new THREE.ShapeGeometry(cloudShape(0.62), 16),
      deer: new THREE.ShapeGeometry(deerShape(), 1),
      antlers,
    }
  }, [])

  useFrame(({ camera }, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    const cam = camera as THREE.PerspectiveCamera
    // camera aimed so the stack is centred in the box: shift the principal point with a view offset
    const W = size.width
    const H = size.height
    const b = boxFor(W, H)
    const fw = 2 * Math.max(b.x, W - b.x)
    const fh = 2 * Math.max(b.y, H - b.y)
    const visH = (DESIGN_H * fh) / (2 * b.halfHeight)
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visH / 2 / CAM_Z))
    cam.aspect = fw / fh
    cam.setViewOffset(fw, fh, fw / 2 - b.x, fh / 2 - b.y, W, H)
    // the sway: idle drift + the visitor's drag
    const swayX = (POSTER ? 0 : Math.sin(t * 0.23) * 0.55) + sx.get()
    const swayY = (POSTER ? 0 : Math.sin(t * 0.17 + 1) * 0.18) + sy.get()
    cam.position.set(swayX, swayY, CAM_Z)
    cam.lookAt(swayX * 0.15, swayY * 0.15, 0)
    cam.updateProjectionMatrix()

    if (cloudA.current) cloudA.current.position.x = -1.3 + Math.sin(t * 0.05) * 0.6
    if (cloudB.current) cloudB.current.position.x = 1.0 + Math.sin(t * 0.04 + 2) * 0.5
    if (head.current) head.current.rotation.z = Math.sin(t * 0.9) * 0.03
    smoke.current.forEach((m, i) => {
      if (!m) return
      const p = (t * 0.12 + i / 4) % 1
      m.position.set(0.18 + Math.sin(p * 5 + i) * 0.05 + p * 0.12, 0.62 + p * 0.65, 0)
      m.scale.setScalar(0.035 + p * 0.07)
    })
  })

  return (
    <>
      {/* moon + a few stars */}
      <Sheet z={-7.76}>
        <mesh position={[1.25, 1.35, 0]}>
          <circleGeometry args={[0.42, 64]} />
          <Flat color="#f3ead0" />
        </mesh>
        {[[-1.6, 1.6], [-0.6, 1.85], [0.3, 1.45], [2.0, 0.9], [-2.1, 0.9]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]} rotation={[0, 0, i]}>
            <circleGeometry args={[0.05, 5]} />
            <Flat color="#e9e2c2" />
          </mesh>
        ))}
      </Sheet>
      <Sheet z={-7.57}>
        <group ref={cloudA} position={[-1.3, 1.25, 0]}>
          <mesh geometry={G.cloud}>
            <Flat color="#8ea6bb" />
          </mesh>
        </group>
      </Sheet>
      {/* far peaks */}
      <Sheet z={-6.41}>
        <mesh geometry={G.far}>
          <Flat color="#4f6c88" />
        </mesh>
      </Sheet>
      <Sheet z={-5.8}>
        <group ref={cloudB} position={[1.0, 0.75, 0]} scale={0.8}>
          <mesh geometry={G.cloud}>
            <Flat color="#b7c8d6" />
          </mesh>
        </group>
      </Sheet>
      {/* pine ridge */}
      <Sheet z={-4.31}>
        <mesh geometry={G.ridge}>
          <Flat color="#5b8a7a" />
        </mesh>
        {[-2.2, -1.75, -1.45, 1.35, 1.7, 2.15, 2.5].map((x, i) => (
          <mesh key={i} geometry={G.pine} position={[x, -0.22 + Math.sin(x * 0.9 + 0.6) * 0.24 + Math.sin(x * 2.3) * 0.07 + 0.12, 0]} scale={0.6 + (i % 3) * 0.16}>
            <Flat color="#5b8a7a" />
          </mesh>
        ))}
      </Sheet>
      {/* hill with a little house */}
      <Sheet z={-2.61}>
        <mesh geometry={G.hill}>
          <Flat color="#8fb37a" />
        </mesh>
        <group position={[0.7, -0.62, 0]}>
          <mesh geometry={G.house}>
            <Flat color="#8fb37a" />
          </mesh>
          <mesh position={[0.17, 0.5, 0]}>
            <planeGeometry args={[0.08, 0.2]} />
            <Flat color="#8fb37a" />
          </mesh>
          {/* lit window */}
          <mesh position={[-0.1, 0.17, 0.01]}>
            <planeGeometry args={[0.13, 0.12]} />
            <Flat color="#ffe39a" />
          </mesh>
          {Array.from({ length: 4 }, (_, i) => (
            <mesh
              key={i}
              ref={(m) => {
                smoke.current[i] = m
              }}
            >
              <circleGeometry args={[1, 24]} />
              <Flat color="#c9d6dd" />
            </mesh>
          ))}
        </group>
        {[-0.2, 1.45, 1.85].map((x, i) => (
          <mesh key={i} geometry={G.roundTree} position={[x, -0.85 + Math.sin(x * 0.75 - 0.9) * 0.3 + 0.22, 0]} scale={0.8 + i * 0.12}>
            <Flat color="#8fb37a" />
          </mesh>
        ))}
      </Sheet>
      {/* front meadow with the deer */}
      <Sheet z={-1.9}>
        <mesh geometry={G.meadow}>
          <Flat color="#cdbf82" />
        </mesh>
      </Sheet>
      <Sheet z={0.06}>
        <group position={[-1.15, -1.36, 0]} scale={0.95}>
          <mesh geometry={G.deer}>
            <Flat color="#f0e4b0" />
          </mesh>
          <group ref={head} position={[0.42, 0.62, 0]}>
            <group position={[-0.42, -0.62, 0]}>
              <mesh geometry={G.antlers}>
                <Flat color="#f0e4b0" />
              </mesh>
            </group>
          </group>
        </group>
      </Sheet>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function PaperCut() {
  const [mode, setMode] = useState<PapercutMode>('lightbox')
  const [layers, setLayers] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createPapercutEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)

  useEffect(() => setPapercutMode(fx, mode), [fx, mode])
  useEffect(() => setPapercutLayers(fx, LAYERS[layers]), [fx, layers])
  useEffect(() => {
    // stack order from depth alone: the sheets sit at depths chosen to fall mid-band for 4–7 layers
    // (v = 0.08 sky, 0.225 peaks, 0.45 pines, 0.63 hill, 0.71 meadow, 0.92 deer)
    setPapercutDepth(fx, 1, CAM_Z - 0.8, CAM_Z + 8.5)
    const on = () => setPapercutBox(fx, boxFor(window.innerWidth, window.innerHeight))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fx])

  const sx = useMotionValue(0)
  const sy = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    sx.set(THREE.MathUtils.clamp(sx.get() - (e.clientX - d.x) * 0.006, -2.2, 2.2))
    sy.set(THREE.MathUtils.clamp(sy.get() + (e.clientY - d.y) * 0.004, -1.0, 1.0))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(sx, 0, { type: 'spring', velocity: sx.getVelocity(), stiffness: 26, damping: 8 }),
      animate(sy, 0, { type: 'spring', velocity: sy.getVelocity(), stiffness: 30, damping: 8 }),
    ]
  }

  const I = SPEC[mode]
  const label = papercutModes.find((m) => m.id === mode)!.label
  const n = LAYERS[layers]
  const swatch = PAPERS[mode]
  const chips = Array.from({ length: n }, (_, i) => swatch[Math.round((i / (n - 1)) * 7)])

  return (
    <div
      className={`stage pc${split.open ? ' pc-split' : ''}`}
      style={{ background: PAGE }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, CAM_Z], fov: 30, near: 1, far: 40 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background="#cdd9e2" preload={preload} />
        <Valley sx={sx} sy={sy} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy pc-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Paper Cut · {n} 层纸
            </p>
            <h1>
              一层一层，
              <br />
              剪出远近
            </h1>
            <p className="pc-sub">
              画面按远近和深浅分成几层，每层是一张沿等值线手剪的彩纸，剪口有点抖、偶尔有剪刀豁口；上层给下层投下柔影，光线慢慢转过来，层与层跟着镜头轻轻错动。
            </p>
            <div className="pc-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="pc-stack" aria-hidden>
                    {chips.map((c, i) => (
                      <motion.i
                        key={i}
                        layout
                        style={{ background: c, zIndex: i }}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30, delay: i * 0.03 }}
                      />
                    ))}
                  </div>
                  <p>
                    {I.paper}
                    <br />
                    {I.light}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={papercutModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg pc-cycle" onClick={() => setLayers((d) => (d + 1) % LAYERS.length)}>
              <span>
                层数 <b>{n}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="pc-lbl">层数</span>
              <Seg items={LAYERS.map((d, i) => ({ value: i, label: String(d) }))} value={layers} onChange={setLayers} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="pc-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动镜头看层与层错动 · 光线缓缓转动</p>
      </div>
    </div>
  )
}

const css = `
.pc { cursor: grab; touch-action: none; }
.pc:active { cursor: grabbing; }
.pc canvas { display: block; }
.pc-copy { pointer-events: none !important; }
.pc .hint { transition: opacity .4s; }
.pc-split .hint { opacity: 0; }
.pc-copy .scrim { --soft-bg: ${PAGE}; left: -200px; right: -120px; height: 760px; }
.pc-copy .kicker i { background: #e8603c; }
.pc-copy h1 { font-size: clamp(40px, 4.6vw, 62px); }
.pc-sub { max-width: 400px; }
.pc-spec { margin-top: 24px; min-height: 80px; }
.pc-stack { display: flex; align-items: flex-end; height: 30px; }
.pc-stack i {
  position: relative; width: 26px; height: 22px; margin-right: -9px; border-radius: 3px 10px 3px 3px;
  box-shadow: 2px -1px 4px rgba(40, 28, 10, .28), inset 0 0 0 1px rgba(0,0,0,.06);
}
.pc-stack i:nth-child(odd) { height: 26px; }
.pc-spec p { margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.pc-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.pc-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.pc-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .pc-copy { transition: opacity .4s; }
  .pc-split .pc-copy { opacity: 0; }
  .pc-sub { display: none; }
  .pc-copy h1 { font-size: 34px; }
  .pc-spec { margin-top: 12px; min-height: 0; }
  .pc .dock .seg { padding: 0 8px; }
  .pc .dock .dock-sep { margin: 0 1px; }
}
`
