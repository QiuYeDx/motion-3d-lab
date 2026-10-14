import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { createEngraveEffect, engraveModes, setEngraveCenter, setEngraveDensity, setEngraveMode, type EngraveMode } from './effects/engrave'

/*
 * 版画雕刻 — a classical still life (fluted amphora, fruit, a struck coin with a raised relief) on a plinth,
 * one hard key light, turning slowly so the engraved line field visibly bends over every form.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const DENSITY = [
  { zh: '细', css: 3.6 },
  { zh: '中', css: 5 },
  { zh: '粗', css: 7 },
]
const NOTE: Record<EngraveMode, string> = {
  copper: '线宽随明暗 · 暗部交叉 · 扭索纹底',
  woodcut: '白色刀痕切进黑版 · 刀口参差',
  linocut: '红版 + 黑版 · 套印错位 1.5px',
}
const SHORT: Record<EngraveMode, string> = { copper: '铜版', woodcut: '木刻', linocut: '麻胶' }

/* ------------------------------------------------------------------ geometry */

const lathe = (pts: [number, number][], seg = 64) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  )

/** average the normals of coincident vertices (the lathe seam would otherwise show up as a crease line) */
function weldNormals(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute
  const n = g.attributes.normal as THREE.BufferAttribute
  const groups = new Map<string, number[]>()
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`
    const a = groups.get(k)
    if (a) a.push(i)
    else groups.set(k, [i])
  }
  const v = new THREE.Vector3()
  groups.forEach((ids) => {
    if (ids.length < 2) return
    v.set(0, 0, 0)
    for (const i of ids) v.add(new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)))
    v.normalize()
    for (const i of ids) n.setXYZ(i, v.x, v.y, v.z)
  })
  n.needsUpdate = true
  return g
}

function amphoraGeo() {
  const g = lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.24, 0.025],
      [0.235, 0.06],
      [0.15, 0.1],
      [0.13, 0.16],
      [0.22, 0.26],
      [0.34, 0.42],
      [0.42, 0.62],
      [0.45, 0.82],
      [0.43, 0.98],
      [0.36, 1.12],
      [0.24, 1.22],
      [0.17, 1.3],
      [0.15, 1.42],
      [0.155, 1.52],
      [0.21, 1.58],
      [0.22, 1.62],
      [0.2, 1.65],
      [0.16, 1.64],
      [0.13, 1.5],
    ],
    128,
  )
  // flutes on the belly
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const w = THREE.MathUtils.smoothstep(y, 0.3, 0.45) * (1 - THREE.MathUtils.smoothstep(y, 0.9, 1.05))
    if (w <= 0) continue
    const a = Math.atan2(z, x)
    const k = 1 - 0.035 * w * Math.pow(Math.abs(Math.cos(a * 11)), 0.6)
    p.setX(i, x * k)
    p.setZ(i, z * k)
  }
  g.computeVertexNormals()
  return weldNormals(g)
}

function appleGeo() {
  return lathe(
    [
      [0, 0.03],
      [0.07, 0.0],
      [0.15, 0.025],
      [0.2, 0.09],
      [0.215, 0.17],
      [0.2, 0.26],
      [0.15, 0.32],
      [0.07, 0.335],
      [0.02, 0.3],
      [0, 0.29],
    ],
    48,
  )
}

function pearGeo() {
  return lathe(
    [
      [0, 0],
      [0.09, 0.005],
      [0.16, 0.05],
      [0.18, 0.13],
      [0.155, 0.23],
      [0.105, 0.31],
      [0.08, 0.39],
      [0.065, 0.45],
      [0.03, 0.49],
      [0, 0.49],
    ],
    48,
  )
}

/** coin: a polar grid displaced by a canvas-drawn height map (rim, beads, laurel, a big 壹) */
function coinGeo(R: number) {
  const N = 512
  const a = document.createElement('canvas')
  a.width = a.height = N
  const c = a.getContext('2d')!
  const cx = N / 2
  c.fillStyle = '#000'
  c.fillRect(0, 0, N, N)
  // raised rim
  c.fillStyle = '#fff'
  c.beginPath()
  c.arc(cx, cx, N / 2, 0, Math.PI * 2)
  c.fill()
  c.fillStyle = '#000'
  c.beginPath()
  c.arc(cx, cx, N * 0.455, 0, Math.PI * 2)
  c.fill()
  // beads
  c.fillStyle = '#bbb'
  for (let i = 0; i < 80; i++) {
    const t = (i / 80) * Math.PI * 2
    c.beginPath()
    c.arc(cx + Math.cos(t) * N * 0.415, cx + Math.sin(t) * N * 0.415, N * 0.0085, 0, Math.PI * 2)
    c.fill()
  }
  // laurel branches up both sides
  c.fillStyle = '#d0d0d0'
  for (const side of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const t = Math.PI / 2 + side * (0.35 + i * 0.2)
      const r = N * 0.335
      const x = cx + Math.cos(t) * r
      const y = cx + Math.sin(t) * r
      for (const o of [-1, 1]) {
        c.save()
        c.translate(x, y)
        c.rotate(t + side * Math.PI / 2 + o * 0.55 * side)
        c.beginPath()
        c.ellipse(0, (o * N) / 40, N / 85, N / 34, 0, 0, Math.PI * 2)
        c.fill()
        c.restore()
      }
    }
  }
  // the numeral
  c.fillStyle = '#fff'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = `900 ${N * 0.36}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`
  c.fillText('壹', cx, cx - N * 0.02)
  c.font = `700 ${N * 0.05}px Georgia, "Times New Roman", serif`
  c.fillText('★  MMXXVI  ★', cx, cx + N * 0.25)
  // soften into a relief
  const b = document.createElement('canvas')
  b.width = b.height = N
  const d = b.getContext('2d')!
  d.filter = 'blur(1.6px)'
  d.drawImage(a, 0, 0)
  const px = d.getImageData(0, 0, N, N).data
  const height = (u: number, v: number) => {
    const x = Math.min(N - 1, Math.max(0, Math.round(u * (N - 1))))
    const y = Math.min(N - 1, Math.max(0, Math.round(v * (N - 1))))
    return px[(y * N + x) * 4] / 255
  }

  const rings = 110
  const segs = 220
  const pos: number[] = []
  const idx: number[] = []
  const relief = R * 0.1
  pos.push(0, 0, height(0.5, 0.5) * relief)
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * R
    for (let j = 0; j < segs; j++) {
      const t = (j / segs) * Math.PI * 2
      const x = Math.cos(t) * r
      const y = Math.sin(t) * r
      pos.push(x, y, height(0.5 + x / (2 * R), 0.5 - y / (2 * R)) * relief)
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + j, 1 + ((j + 1) % segs))
  for (let i = 1; i < rings; i++) {
    const o0 = 1 + (i - 1) * segs
    const o1 = 1 + i * segs
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs
      idx.push(o0 + j, o1 + j, o1 + j1, o0 + j, o1 + j1, o0 + j1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ------------------------------------------------------------------ scene */

function StillLife({ ry, rx, fx }: { ry: MotionValue<number>; rx: MotionValue<number>; fx: StylizeEffect }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const camera = useThree((s) => s.camera)
  const rig = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const st = useRef({ t: POSTER ? 2.4 : 0, v: new THREE.Vector3() })
  const geo = useMemo(() => ({ amphora: amphoraGeo(), apple: appleGeo(), pear: pearGeo(), coin: coinGeo(0.42) }), [])
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    s.t += dt
    const mobile = size.width < 760
    if (rig.current) {
      const vw = viewport.width
      const vh = viewport.height
      const k = mobile ? Math.min(0.85, vw / 3.7) : Math.min(0.95, vh / 4.5)
      rig.current.scale.setScalar(POSTER ? 1.08 : k)
      rig.current.position.set(POSTER || mobile ? 0 : vw * 0.17, POSTER ? -0.05 : mobile ? vh * 0.15 : -0.02, 0)
    }
    if (turn.current) {
      const auto = POSTER ? 0.12 : Math.sin(s.t * 0.21) * 0.62 - 0.15
      turn.current.rotation.set(rx.get(), auto + ry.get(), 0)
    }
    // the guilloché medallion / linocut sun sits behind the subject
    if (rig.current) {
      s.v.set(0.05, 0.85, 0)
      rig.current.localToWorld(s.v)
      s.v.project(camera)
      setEngraveCenter(fx, s.v.x * 0.5 + 0.5, s.v.y * 0.5 + 0.5)
    }
  })

  const grapes = useMemo(() => {
    const out: [number, number, number][] = []
    const r = 0.068
    const layers: [number, number][] = [
      [7, 0.21],
      [5, 0.15],
      [3, 0.08],
      [1, 0],
    ]
    layers.forEach(([n, rad], l) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + l * 0.5
        out.push([Math.cos(a) * rad, r + l * r * 1.35, Math.sin(a) * rad * 0.7])
      }
    })
    return out
  }, [])

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9c0b0', 0.35]} />
      <directionalLight
        position={[-3.0, 4.2, 5.0]}
        intensity={4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[3.5, 1.5, -3]} intensity={0.7} />
      <group ref={rig}>
        <group ref={turn}>
          {/* plinth */}
          <mesh position={[0, -0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.7, 0.42, 1.5]} />
            <meshStandardMaterial color="#d6cdbb" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.0, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.84, 0.06, 1.62]} />
            <meshStandardMaterial color="#efe9de" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.45, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.84, 0.06, 1.62]} />
            <meshStandardMaterial color="#efe9de" roughness={0.9} />
          </mesh>

          {/* amphora with handles */}
          <group position={[0.05, 0.03, -0.15]}>
            <mesh geometry={geo.amphora} castShadow receiveShadow>
              <meshStandardMaterial color="#dccdb3" roughness={0.55} />
            </mesh>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.24, 1.3, 0]} rotation={[0, sx < 0 ? Math.PI : 0, -0.1 * sx]} castShadow receiveShadow>
                <torusGeometry args={[0.15, 0.028, 12, 32, Math.PI * 1.15]} />
                <meshStandardMaterial color="#dccdb3" roughness={0.55} />
              </mesh>
            ))}
          </group>

          {/* fruit */}
          <mesh geometry={geo.apple} position={[-0.72, 0.03, 0.3]} rotation={[0.12, 0, -0.18]} castShadow receiveShadow>
            <meshStandardMaterial color="#b4574a" roughness={0.45} />
          </mesh>
          <mesh position={[-0.75, 0.37, 0.3]} rotation={[0, 0, 0.3]} castShadow>
            <cylinderGeometry args={[0.008, 0.012, 0.12, 6]} />
            <meshStandardMaterial color="#5a4632" />
          </mesh>
          <mesh geometry={geo.pear} position={[-0.42, 0.03, -0.32]} rotation={[0, 0, 0.12]} castShadow receiveShadow>
            <meshStandardMaterial color="#cdb46e" roughness={0.5} />
          </mesh>
          <group position={[-1.02, 0.03, -0.1]} rotation={[0, 0.6, 0]}>
            {grapes.map((p, i) => (
              <mesh key={i} position={p} castShadow receiveShadow>
                <sphereGeometry args={[0.068, 24, 16]} />
                <meshStandardMaterial color="#6f5f80" roughness={0.3} />
              </mesh>
            ))}
          </group>

          {/* the coin, standing and leaning back a little */}
          <group position={[0.78, 0.44, 0.38]} rotation={[-0.16, -0.42, 0]}>
            <mesh geometry={geo.coin} position={[0, 0, 0.022]} castShadow receiveShadow>
              <meshStandardMaterial color="#d6bb83" roughness={0.38} metalness={0.15} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.42, 0.42, 0.044, 96, 1, true]} />
              <meshStandardMaterial color="#b89c66" roughness={0.4} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0, -0.022]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
              <circleGeometry args={[0.42, 96]} />
              <meshStandardMaterial color="#c9ae78" roughness={0.4} metalness={0.15} />
            </mesh>
          </group>
          {/* a small wedge holding the coin */}
          <mesh position={[0.86, 0.06, 0.52]} rotation={[0, -0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.26, 0.06, 0.1]} />
            <meshStandardMaterial color="#8a6f4e" roughness={0.8} />
          </mesh>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Engraving() {
  const fx = useMemo(() => createEngraveEffect({ mode: 'copper', spacing: DENSITY[1].css }), [])
  const orig = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<EngraveMode>('copper')
  const [dens, setDens] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit()
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const ry = useMotionValue(0)
  const rx = useMotionValue(0.08)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setEngraveMode(fx, mode), [fx, mode])
  useEffect(() => setEngraveDensity(fx, DENSITY[dens].css), [fx, dens])

  // idle: cycle the techniques
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => engraveModes[(engraveModes.findIndex((x) => x.id === m) + 1) % engraveModes.length].id)
    }, 6500)
    return () => window.clearInterval(id)
  }, [])

  // drag to turn the still life; it coasts on release (Motion inertia)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(ry.get() + (e.clientX - d.x) * 0.006)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.2, 0.45))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.35, timeConstant: 600 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 420, min: -0.2, max: 0.45, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const M = engraveModes.find((m) => m.id === mode)!

  return (
    <div
      className="stage eg"
      style={{ background: M.paper, ['--eg-ink' as string]: M.ink }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 1.55, 7.6], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.62, 0)}>
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background="#f4efe4" />
        <StillLife ry={ry} rx={rx} fx={fx} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label="版画" />

        <div className="eg-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="eg-kicker">
              <b>ENGRAVING</b>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {M.en} · {M.label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              顺着形体
              <br />
              刻下每一条线
            </h1>
            <p className="eg-sub">每条刻线都是一组斜切平面和物体的交线：遇到隆起就弯，转到背光处就加粗，最暗处再交叉一遍——像钞票上的肖像，只用线就刻出体积。</p>
            <div className="eg-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={engraveModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <Seg
            items={DENSITY.map((d, i) => ({ value: i, label: d.zh }))}
            value={dens}
            onChange={(v) => {
              poke()
              setDens(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="eg-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动静物 · 松手会惯性滑行</p>
      </div>
    </div>
  )
}

const css = `
.eg { cursor: grab; touch-action: none; transition: background .8s; }
.eg:active { cursor: grabbing; }
.eg canvas { display: block; }
.eg-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(420px, calc(100% - 48px)); pointer-events: none !important; color: var(--eg-ink);
}
.eg-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.eg-kicker b { padding: 5px 7px 4px; background: var(--eg-ink); color: #f6f1e6; font-weight: 600; transition: background .8s; }
.eg-kicker span { display: inline-block; opacity: .7; letter-spacing: .06em; }
.eg-copy h1 {
  margin: 0; font: 700 clamp(40px, 4.6vw, 64px)/1.08 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif;
  letter-spacing: -.01em; transition: color .8s;
}
.eg-sub { margin: 22px 0 0; max-width: 380px; font-size: 15px; line-height: 1.8; opacity: .78; }
.eg-spec { margin-top: 20px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .03em; }
.eg-spec span { display: inline-flex; align-items: center; gap: 8px; }
.eg-spec i {
  width: 22px; height: 10px; flex: none;
  background: repeating-linear-gradient(-8deg, var(--eg-ink) 0 1.2px, transparent 1.2px 3.6px);
}
.eg .hint { color: var(--eg-ink); opacity: .7; }
@media (max-width: 760px) {
  .eg-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .eg-copy h1 { font-size: 36px; }
  .eg-sub { display: none; }
  .eg-kicker { margin-bottom: 14px; }
  .eg .dock .seg { padding: 0 10px; }
}
`
