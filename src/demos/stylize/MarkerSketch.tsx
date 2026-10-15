import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { createMarkerEffect, drawMarker, markerMeta, markerModes, markerPaper, markerProgress, setMarkerMode, setMarkerWidth, settleMarker, type MarkerMode } from './effects/marker'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 马克笔速写 showcase — a concept sketch of a rangefinder camera (cobalt body, brushed top plate, black lens)
 * turning slowly on a sheet of marker paper. Pencil construction ellipses (ground + lens axis) and the
 * designer's handwritten call-outs are page DOM, positioned every frame from projected 3D anchors (no React
 * re-renders). The floor only catches the cast shadow (a transparent shadow material that writes no depth and
 * is skipped in the normal pass), so the shadow becomes one quick horizontal marker swipe without an outline.
 * 画一遍 replays the drawing: fineliner first, then marker passes light → dark, highlights last.
 * Effect: ./effects/marker.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 15000

const SPEC: Record<MarkerMode, { tool: string; note: string }> = {
  product: { tool: '冷灰 CG2–CG6', note: '钴蓝一支 · 受光面留白 · 白笔提高光' },
  arch: { tool: '暖灰 WG1–WG6', note: '淡彩 · 构造线拉长 · 一笔天空' },
  comic: { tool: '同色系叠色', note: '饱和色 · 柔和过渡 · 粗勾线' },
}

const WIDTHS = [
  { value: 12, label: '细' },
  { value: 18, label: '中' },
  { value: 26, label: '粗' },
]

/* ------------------------------------------------------------------ the camera */

type Anchors = Record<'top' | 'dial' | 'lens' | 'grip' | 'finder' | 'center' | 'lensRing', THREE.Object3D | null>

function std(color: string, roughness = 0.5, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

function CameraModel({ ry, anchors, onReady }: { ry: MotionValue<number>; anchors: React.RefObject<Anchors>; onReady: () => void }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 0 : 0)
  const M = useMemo(
    () => ({
      body: std('#2f6fd6', 0.55),
      plate: std('#d4d8dc', 0.38, 0.15),
      dark: std('#202124', 0.5),
      black: std('#141517', 0.35),
      glass: std('#16263d', 0.08, 0.2),
      chrome: std('#e6e8ea', 0.3, 0.2),
      leather: std('#26282c', 0.85),
      floor: new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }),
    }),
    [],
  )
  useEffect(() => () => Object.values(M).forEach((m) => m.dispose()), [M])
  const floorGeo = useMemo(() => new THREE.CircleGeometry(9, 64), [])
  useEffect(() => () => floorGeo.dispose(), [floorGeo])

  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(1.05, vw / 6.4, vh / 4.6) : mobile ? Math.min(0.85, vw / 5.0) : Math.min(1.05, vh / 5.4, vw / 10)
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.15, POSTER ? -0.1 : mobile ? vh * 0.13 : -0.05, 0)
    }
    if (spin.current) spin.current.rotation.y = (POSTER ? -0.55 : -0.55 + Math.sin(t.current * 0.22) * 0.42) + ry.get()
  })

  const set = (key: keyof Anchors) => (o: THREE.Object3D | null) => {
    if (anchors.current) anchors.current[key] = o
  }

  return (
    <>
      <hemisphereLight args={['#ffffff', '#b8b4ac', 0.55]} />
      <directionalLight
        position={[-4, 7, 5]}
        intensity={3.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[5, 1.5, -2]} intensity={0.6} color="#dfe8ff" />
      <group ref={rig}>
        <group ref={content} visible={ready}>
          {/* floor: only the cast shadow; skipped in the normal pass and writes no depth, so it gets no outline */}
          <mesh
            geometry={floorGeo}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -1.02, 0]}
            material={M.floor}
            receiveShadow
            onBeforeRender={(_r, scene) => floorGeo.setDrawRange(0, scene.overrideMaterial ? 0 : Infinity)}
          />
          <group ref={spin}>
            <object3D ref={set('center')} position={[0, -1.02, 0]} />
            {/* body */}
            <RoundedBox args={[3.2, 1.75, 1.0]} radius={0.14} smoothness={4} position={[0, 0, 0]} material={M.body} castShadow receiveShadow />
            {/* top plate */}
            <RoundedBox args={[3.24, 0.42, 1.04]} radius={0.1} smoothness={4} position={[0, 1.06, 0]} material={M.plate} castShadow receiveShadow />
            <RoundedBox args={[3.24, 0.12, 1.04]} radius={0.05} smoothness={3} position={[0, -0.92, 0]} material={M.plate} castShadow />
            <object3D ref={set('top')} position={[-0.55, 1.27, 0.25]} />
            {/* viewfinder + rangefinder windows */}
            <mesh position={[-1.02, 1.08, 0.52]} material={M.glass}>
              <boxGeometry args={[0.56, 0.24, 0.04]} />
            </mesh>
            <mesh position={[0.2, 1.08, 0.52]} material={M.glass}>
              <boxGeometry args={[0.22, 0.2, 0.04]} />
            </mesh>
            <object3D ref={set('finder')} position={[-1.02, 1.1, 0.55]} />
            {/* shutter dial, release, hot shoe */}
            <mesh position={[0.62, 1.36, 0.02]} material={M.chrome} castShadow>
              <cylinderGeometry args={[0.3, 0.3, 0.16, 48]} />
            </mesh>
            <mesh position={[0.62, 1.45, 0.02]} material={M.dark} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.03, 40]} />
            </mesh>
            <object3D ref={set('dial')} position={[0.62, 1.44, 0.02]} />
            <mesh position={[1.18, 1.34, 0.18]} material={M.chrome} castShadow>
              <cylinderGeometry args={[0.11, 0.11, 0.14, 32]} />
            </mesh>
            <mesh position={[-0.35, 1.31, 0]} material={M.dark} castShadow>
              <boxGeometry args={[0.5, 0.07, 0.42]} />
            </mesh>
            {/* strap lugs */}
            <mesh position={[-1.66, 0.82, 0]} rotation={[0, 0, Math.PI / 2]} material={M.chrome}>
              <cylinderGeometry args={[0.07, 0.07, 0.14, 20]} />
            </mesh>
            <mesh position={[1.66, 0.82, 0]} rotation={[0, 0, Math.PI / 2]} material={M.chrome}>
              <cylinderGeometry args={[0.07, 0.07, 0.14, 20]} />
            </mesh>
            {/* grip */}
            <RoundedBox args={[0.5, 1.4, 0.2]} radius={0.09} smoothness={4} position={[1.2, -0.06, 0.54]} material={M.leather} castShadow />
            <object3D ref={set('grip')} position={[1.32, -0.35, 0.66]} />
            {/* lens */}
            <group position={[-0.18, -0.06, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh position={[0, 0.08, 0]} material={M.chrome} castShadow>
                <cylinderGeometry args={[0.74, 0.74, 0.16, 64]} />
              </mesh>
              <mesh position={[0, 0.48, 0]} material={M.black} castShadow>
                <cylinderGeometry args={[0.62, 0.66, 0.66, 64]} />
              </mesh>
              <mesh position={[0, 0.5, 0]} material={M.dark}>
                <cylinderGeometry args={[0.68, 0.68, 0.2, 48]} />
              </mesh>
              <mesh position={[0, 0.84, 0]} material={M.chrome} castShadow>
                <cylinderGeometry args={[0.6, 0.62, 0.1, 64]} />
              </mesh>
              <mesh position={[0, 0.9, 0]} material={M.glass}>
                <cylinderGeometry args={[0.47, 0.47, 0.03, 64]} />
              </mesh>
            </group>
            <object3D ref={set('lens')} position={[-0.18, 0.3, 1.42]} />
            <object3D ref={set('lensRing')} position={[-0.18, -0.06, 1.42]} />
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ designer's notes (DOM) */

type NoteDef = { key: 'top' | 'dial' | 'lens' | 'grip' | 'finder'; text: string; sub: string; dx: number; dy: number; mdx: number; mdy: number }

const NOTES: NoteDef[] = [
  { key: 'dial', text: '快门拨盘', sub: '滚花 · 1/4000', dx: 70, dy: -120, mdx: 40, mdy: -88 },
  { key: 'finder', text: '光学取景窗', sub: '0.72× 亮框', dx: -150, dy: -110, mdx: -40, mdy: -96 },
  { key: 'top', text: '铝顶盖', sub: '喷砂阳极氧化', dx: -70, dy: -170, mdx: -10, mdy: -150 },
  { key: 'lens', text: '35mm F2', sub: '定焦 · 黑漆', dx: -180, dy: 120, mdx: -60, mdy: 120 },
  { key: 'grip', text: '皮纹握把', sub: 'R = 4', dx: 150, dy: 90, mdx: 40, mdy: 110 },
]

function NoteTracker({ anchors, labels, paths, heads, ell }: {
  anchors: React.RefObject<Anchors>
  labels: React.RefObject<(HTMLDivElement | null)[]>
  paths: React.RefObject<(SVGPathElement | null)[]>
  heads: React.RefObject<(SVGPathElement | null)[]>
  ell: React.RefObject<(SVGPathElement | SVGLineElement | null)[]>
}) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  const w = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const A = anchors.current
    if (!A) return
    const mobile = size.width < 760
    const toScreen = (o: THREE.Object3D, local?: THREE.Vector3) => {
      if (local) v.copy(local).applyMatrix4(o.matrixWorld)
      else o.getWorldPosition(v)
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
      const dx = mobile ? n.mdx : n.dx
      const dy = mobile ? n.mdy : n.dy
      const lx = ax + dx
      const ly = ay + dy
      el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -50%)`
      const sx = lx + Math.sign(-dx) * Math.min(26, Math.abs(dx) * 0.4)
      const sy = ly + (dy < 0 ? 22 : -22)
      const ex = ax + (sx - ax) * 0.08
      const ey = ay + (sy - ay) * 0.08
      const mx = (sx + ex) / 2 + (ey - sy) * 0.2
      const my = (sy + ey) / 2 - (ex - sx) * 0.2
      p.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`)
      const tx = ex - mx
      const ty = ey - my
      const L = Math.hypot(tx, ty) || 1
      const ux = tx / L
      const uy = ty / L
      const hl = 9
      h.setAttribute('d', `M${(ex - ux * hl - uy * hl * 0.5).toFixed(1)} ${(ey - uy * hl + ux * hl * 0.5).toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${(ex - ux * hl + uy * hl * 0.5).toFixed(1)} ${(ey - uy * hl - ux * hl * 0.5).toFixed(1)}`)
    })
    // construction ellipses: the ground circle under the camera and the lens front ring, as projected polylines
    const ring = (o: THREE.Object3D | null, r: number, plane: 'xz' | 'xy', el: SVGPathElement | SVGLineElement | null) => {
      if (!o || !el) return
      let d = ''
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2
        w.set(Math.cos(a) * r, plane === 'xy' ? Math.sin(a) * r : 0, plane === 'xz' ? Math.sin(a) * r : 0)
        const [x, y] = toScreen(o, w)
        d += `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
      }
      el.setAttribute('d', d + 'Z')
    }
    const E = ell.current
    if (!E) return
    ring(A.center, 2.5, 'xz', E[0])
    ring(A.center, 1.6, 'xz', E[1])
    ring(A.lensRing, 0.95, 'xy', E[2])
    // lens axis: a long line through the lens centre, along the optical axis
    const axis = E[3] as SVGLineElement | null
    if (axis && A.lensRing) {
      w.set(0, 0, -3.4)
      const [x1, y1] = toScreen(A.lensRing, w)
      w.set(0, 0, 2.2)
      const [x2, y2] = toScreen(A.lensRing, w)
      axis.setAttribute('x1', x1.toFixed(1))
      axis.setAttribute('y1', y1.toFixed(1))
      axis.setAttribute('x2', x2.toFixed(1))
      axis.setAttribute('y2', y2.toFixed(1))
    }
  })
  return null
}

/** drives the 画一遍 progress bar from the effect's clock */
function DrawClock({ fx, btn }: { fx: StylizeEffect; btn: React.RefObject<HTMLButtonElement | null> }) {
  useFrame(() => {
    const b = btn.current
    if (!b) return
    const p = markerProgress(fx)
    b.style.setProperty('--p', p.toFixed(3))
    b.dataset.drawing = p < 1 ? '1' : '0'
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function MarkerSketch() {
  const [mode, setMode] = useState<MarkerMode>('product')
  const [width, setWidth] = useState(MOBILE ? 12 : 18)
  const fx = useMemo(() => {
    const f = createMarkerEffect()
    setMarkerWidth(f, MOBILE ? 12 : 18)
    settleMarker(f)
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const btn = useRef<HTMLButtonElement>(null)
  const [noteRun, setNoteRun] = useState(0)

  const anchors = useRef<Anchors>({ top: null, dial: null, lens: null, grip: null, finder: null, center: null, lensRing: null })
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const paths = useRef<(SVGPathElement | null)[]>([])
  const heads = useRef<(SVGPathElement | null)[]>([])
  const ell = useRef<(SVGPathElement | SVGLineElement | null)[]>([])

  useEffect(() => setMarkerMode(fx, mode), [fx, mode])
  useEffect(() => setMarkerWidth(fx, width), [fx, width])

  const redraw = () => {
    drawMarker(fx)
    setNoteRun((n) => n + 1)
  }
  const onReady = () => {
    if (!POSTER) redraw()
  }

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 10000 || splitOpen.current || markerProgress(fx) < 1) return
      // next sheet: another rendering style, drawn from scratch
      setMode((m) => markerModes[(markerModes.findIndex((o) => o.id === m) + 1) % markerModes.length].id)
      drawMarker(fx)
      setNoteRun((n) => n + 1)
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.006, -1.6, 1.6))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.4, timeConstant: 650, min: -1.6, max: 1.6, bounceStiffness: 140, bounceDamping: 18 })
  }

  const S = SPEC[mode]
  const label = markerModes.find((m) => m.id === mode)!.label
  // call-outs are written once the marker passes are down (immediately on posters)
  const delay = POSTER ? -4.4 : 1.6

  return (
    <div
      className={`stage mk mk-${mode}${split.open ? ' mk-split' : ''}`}
      style={{ background: markerPaper[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false }}
        camera={{ position: [0, 3.1, 10.5], fov: 32, far: 60 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.1, 0)}
      >
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={markerMeta.background} preload={preload} />
        <CameraModel ry={ry} anchors={anchors} onReady={onReady} />
        <NoteTracker anchors={anchors} labels={labels} paths={paths} heads={heads} ell={ell} />
        <DrawClock fx={fx} btn={btn} />
      </Canvas>

      <svg className="mk-construct" aria-hidden>
        <path ref={(el) => {
          ell.current[0] = el
        }} />
        <path ref={(el) => {
          ell.current[1] = el
        }} className="b" />
        <path ref={(el) => {
          ell.current[2] = el
        }} />
        <line ref={(el) => {
          ell.current[3] = el
        }} className="b" />
      </svg>

      <div className="mk-notes" aria-hidden>
        <AnimatePresence>
          {!split.open && (
            <motion.div key={noteRun} className="mk-notes-in" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }}>
              <svg className="mk-arrows">
                {NOTES.map((n, i) => (
                  <g key={n.key}>
                    <motion.path
                      ref={(el) => {
                        paths.current[i] = el
                      }}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: delay + 4.4 + i * 0.35 + 0.3, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    />
                    <motion.path
                      ref={(el) => {
                        heads.current[i] = el
                      }}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: delay + 4.4 + i * 0.35 + 0.7, duration: 0.15 }}
                    />
                  </g>
                ))}
              </svg>
              {NOTES.map((n, i) => (
                <div
                  key={n.key}
                  className="mk-note"
                  ref={(el) => {
                    labels.current[i] = el
                  }}
                >
                  <motion.span
                    initial={{ clipPath: 'inset(0 100% 0 0)' }}
                    animate={{ clipPath: 'inset(0 0% 0 0)' }}
                    transition={{ delay: delay + 4.4 + i * 0.35, duration: 0.45, ease: 'linear' }}
                  >
                    {n.text}
                    <small>{n.sub}</small>
                  </motion.span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* title block, bottom right of the sheet */}
      <div className="mk-title" aria-hidden>
        <div>
          <b>CAM-01</b> 旁轴相机 · 概念草图
        </div>
        <div className="mk-title-row">
          <span>2026.10</span>
          <span>1 : 1</span>
          <span className="mk-sw">
            <i /> 钴蓝 B29
          </span>
        </div>
      </div>

      <div className="overlay">
        <div className="hero-copy mk-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Marker Sketch · 设计速写
            </p>
            <h1>
              三支灰，一支蓝，
              <br />
              画完一台相机
            </h1>
            <p className="mk-sub">酒精马克笔一排排平行扫过：受光面留白，暗面叠两三遍灰，重叠处留下深色接缝，收笔处墨水积得更深。针管笔勾出轮廓、在转角多拉出去一截，最后用白色高光笔点亮迎光的边。</p>
            <div className="mk-spec">
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
          <Seg items={markerModes.map((m) => ({ value: m.id, label: MOBILE ? m.label.slice(0, 2) : m.label }))} value={mode} onChange={(m) => {
            touch()
            setMode(m)
          }} />
          <span className="dock-sep" />
          <Seg items={WIDTHS} value={width} onChange={(w) => {
            touch()
            setWidth(w)
          }} />
          <span className="dock-sep" />
          <button ref={btn} className="seg mk-btn" onClick={() => {
            touch()
            redraw()
          }}>
            <span>画一遍</span>
            <i className="mk-bar" />
          </button>
          <button className="seg mk-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="mk-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动相机 · 闲置时换一种画法重画</p>
      </div>
    </div>
  )
}

const HAND = `"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "STKaiti", "KaiTi", "Kaiti SC", cursive`

const css = `
.mk { cursor: grab; touch-action: none; transition: background .6s; }
.mk:active { cursor: grabbing; }
.mk canvas { display: block; }
.mk-copy { pointer-events: none !important; --soft-bg: #f7f7f4; }
.mk-arch .mk-copy { --soft-bg: #f6f3ec; }
.mk-copy .scrim { opacity: .9; }
.mk-copy .kicker i { background: #2f6fd6; }
.mk-copy h1 { font-size: clamp(34px, 3.9vw, 54px); color: #17181b; }
.mk-sub { max-width: 410px; }
.mk-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.mk-spec span { display: inline-flex; align-items: center; gap: 10px; }
.mk-spec b { font-weight: 600; color: var(--fg); padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); font-family: var(--sans); }
.mk .dock { bottom: 30px; }
.mk .hint { bottom: 36px; right: 32px; }
.mk-split .hint, .mk-split .mk-title { opacity: 0; }
.mk-btn { overflow: hidden; }
.mk-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #2f6fd6; transform-origin: left; transform: scaleX(var(--p, 1)); opacity: 0; transition: opacity .3s;
}
.mk-btn[data-drawing='1'] .mk-bar { opacity: .85; }

.mk-construct { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; mix-blend-mode: multiply; }
.mk-construct path, .mk-construct line { fill: none; stroke: rgba(70, 92, 130, .3); stroke-width: 1; }
.mk-construct .b { stroke-dasharray: 10 6; stroke: rgba(70, 92, 130, .22); }
.mk-split .mk-construct { opacity: 0; }

.mk-notes, .mk-notes-in { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.mk-arrows { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; }
.mk-arrows path { fill: none; stroke: #2a3b5c; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; opacity: .85; }
.mk-note {
  position: absolute; left: 0; top: 0; white-space: nowrap; will-change: transform;
  font: 400 19px/1.15 ${HAND}; color: #22324f; transform-origin: center;
}
.mk-note span { display: inline-block; padding: 2px 4px; transform: rotate(-2deg); }
.mk-note small { display: block; font-size: 13px; color: #5a6a86; margin-top: 1px; }

.mk-title {
  position: absolute; right: clamp(24px, 3.4vw, 52px); top: 84px; z-index: 1; pointer-events: none;
  padding: 9px 12px; border: 1px solid rgba(30, 40, 60, .32); font: 400 13px/1.5 ${HAND}; color: #2a3346;
  background: rgba(255, 255, 255, .35); transition: opacity .3s;
}
.mk-title b { font: 600 12px/1 var(--mono); letter-spacing: .06em; margin-right: 6px; }
.mk-title-row { display: flex; gap: 12px; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(30, 40, 60, .2); font-size: 12px; color: #4b566c; }
.mk-sw { display: inline-flex; align-items: center; gap: 5px; }
.mk-sw i { width: 18px; height: 9px; background: #2f6fd6; border-radius: 1px; opacity: .85; }
.mk-arch .mk-sw i { background: #8fa7c9; }
.mk-comic .mk-sw i { background: #2f6fd6; }

@media (max-width: 760px) {
  .mk-sub { display: none; }
  .mk-copy h1 { font-size: 30px; }
  .mk-spec { margin-top: 10px; font-size: 11px; }
  .mk-split .mk-copy { opacity: 0; }
  .mk .dock .seg { padding: 0 8px; }
  .mk .dock .dock-sep { margin: 0 1px; }
  .mk-note { font-size: 14px; }
  .mk-note small { font-size: 11px; }
  .mk-title { display: none; }
}
`
