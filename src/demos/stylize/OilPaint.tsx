import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { createOilEffect, oilMeta, oilModes, setOilFocus, setOilMode, setOilStrokeSize, type OilMode } from './effects/oil'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 油画笔触 showcase — a flower still life (instanced petals in a celadon vase, a porcelain fruit bowl, a
 * lemon) on a round table under a draped slate-blue cloth, lit by one warm spotlight from the upper left
 * with a cool fill: clear value structure and saturated, simple colour masses that read well as paint.
 * The effect lives in ./effects/oil.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 7000

const SIZES = [
  { zh: '细', v: 0.72 },
  { zh: '中', v: 1 },
  { zh: '粗', v: 1.38 },
]

const SPEC: Record<OilMode, { tool: string; note: string }> = {
  classic: { tool: '生褐底色', note: '伦勃朗暖调 · 长笔顺着形体走' },
  impression: { tool: '白色底子', note: '短笔点彩 · 阴影里是紫和蓝' },
  impasto: { tool: '调色刀', note: '厚涂平面 · 刀口留下颜料脊' },
}

/* ------------------------------------------------------------------ helpers */

const lathe = (pts: [number, number][], seg = 64) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    seg,
  )

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------------ props */

/** round table under a cloth whose hanging part falls into folds */
function DrapedTable() {
  const geo = useMemo(() => {
    const g = lathe(
      [
        [0, 0],
        [1.0, 0],
        [1.85, 0],
        [1.95, -0.03],
        [2.02, -0.14],
        [2.06, -0.4],
        [2.09, -0.75],
        [2.12, -1.1],
        [2.16, -1.42],
        [2.17, -1.5],
      ],
      160,
    )
    const p = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      if (v.y < -0.02) {
        const drop = Math.min(1, -v.y / 1.5)
        const th = Math.atan2(v.z, v.x)
        const fold = Math.sin(th * 7 + 0.6) * 0.6 + Math.sin(th * 13 + 2.1) * 0.3 + Math.sin(th * 3 - 0.4) * 0.35
        const r = Math.hypot(v.x, v.z) + fold * 0.13 * Math.pow(drop, 0.8)
        v.x = Math.cos(th) * r
        v.z = Math.sin(th) * r
        if (v.y < -1.38) v.y += fold * 0.06 // uneven hem
      }
      p.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  }, [])
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#35587a" roughness={0.88} side={THREE.DoubleSide} />
    </mesh>
  )
}

type Flower = { pos: [number, number, number]; color: string; size: number; centre: string }

const PALETTE: [string, string][] = [
  ['#e7849a', '#f0c24a'],
  ['#c8323a', '#2a1a14'],
  ['#f1ebdd', '#e8b832'],
  ['#ee8a3a', '#5a2a14'],
  ['#a8325e', '#2a1a14'],
  ['#f0c54a', '#8a4a14'],
]
// a loose dome of blooms above the vase mouth (seeded, so it's the same every load)
const FLOWERS: Flower[] = (() => {
  const rnd = mulberry(1889)
  const out: Flower[] = []
  const N = 17
  for (let i = 0; i < N; i++) {
    const a = i * 2.39996 + rnd() * 0.3
    const r = 0.92 * Math.sqrt((i + 0.5) / N)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r * 0.75 + 0.1
    const y = 2.85 - r * r * 1.05 + (rnd() - 0.5) * 0.12
    const [color, centre] = PALETTE[(i * 5 + Math.floor(rnd() * 2)) % PALETTE.length]
    out.push({ pos: [x, y, z], color, centre, size: 0.72 + rnd() * 0.36 })
  }
  return out
})()

function Bouquet() {
  const MOUTH = new THREE.Vector3(0, 1.3, 0)
  const { petals, centres, stems, leaves } = useMemo(() => {
    const rnd = mulberry(7)
    const o = new THREE.Object3D()
    const petalGeo = new THREE.SphereGeometry(1, 14, 8)
    petalGeo.translate(1, 0, 0)
    const nPetals = FLOWERS.length * 21
    const petals = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ roughness: 0.62, side: THREE.DoubleSide }), nPetals)
    const centres = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ roughness: 0.8 }), FLOWERS.length)
    const col = new THREE.Color()
    const up = new THREE.Vector3(0, 1, 0)
    const q = new THREE.Quaternion()
    const qa = new THREE.Quaternion()
    let n = 0
    const stems: { pos: THREE.Vector3; quat: THREE.Quaternion; len: number }[] = []
    FLOWERS.forEach((f, fi) => {
      const head = new THREE.Vector3(...f.pos)
      // the flower faces away from the bouquet's centre, a little upward
      const face = head.clone().sub(new THREE.Vector3(0, 1.9, -0.1)).normalize().lerp(up, 0.2).normalize()
      q.setFromUnitVectors(up, face)
      const s = f.size * 0.26
      const rings = [
        { n: 9, r: 1, tilt: 0.5, w: 0.66, h: 0.12 },
        { n: 7, r: 0.72, tilt: 0.95, w: 0.6, h: 0.11 },
        { n: 5, r: 0.45, tilt: 1.3, w: 0.55, h: 0.1 },
      ]
      for (const ring of rings) {
        for (let i = 0; i < ring.n; i++) {
          const a = (i / ring.n) * Math.PI * 2 + rnd() * 0.3 + fi
          o.position.copy(head)
          o.quaternion.copy(q)
          qa.setFromAxisAngle(up, a)
          o.quaternion.multiply(qa)
          qa.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ring.tilt + (rnd() - 0.5) * 0.2)
          o.quaternion.multiply(qa)
          o.scale.set(s * ring.r * 0.55, s * ring.h, s * ring.w * ring.r)
          o.updateMatrix()
          petals.setMatrixAt(n, o.matrix)
          col.set(f.color).offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.08 - (ring.r < 1 ? 0.05 : 0))
          petals.setColorAt(n, col)
          n++
        }
      }
      o.position.copy(head).addScaledVector(face, s * 0.12)
      o.quaternion.copy(q)
      o.scale.set(s * 0.28, s * 0.16, s * 0.28)
      o.updateMatrix()
      centres.setMatrixAt(fi, o.matrix)
      centres.setColorAt(fi, col.set(f.centre))
      // stem from the vase mouth to the head
      const dir = head.clone().sub(MOUTH)
      const len = dir.length()
      stems.push({
        pos: MOUTH.clone().addScaledVector(dir, 0.5),
        quat: new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()),
        len,
      })
    })
    petals.count = n
    petals.instanceMatrix.needsUpdate = true
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true
    petals.castShadow = true
    petals.receiveShadow = true
    centres.castShadow = true
    // leaves drooping out of the mouth
    const leafGeo = new THREE.SphereGeometry(1, 14, 8)
    leafGeo.translate(1, 0, 0)
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), 14)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.4
      o.position.set(Math.cos(a) * 0.12, 1.36 + rnd() * 0.35, Math.sin(a) * 0.12)
      o.rotation.set(0, -a, -0.15 - rnd() * 0.5)
      o.scale.set(0.2 + rnd() * 0.08, 0.014, 0.1 + rnd() * 0.03)
      o.updateMatrix()
      leaves.setMatrixAt(i, o.matrix)
      leaves.setColorAt(i, col.set(i % 3 ? '#4d7a38' : '#6d9440').offsetHSL(0, 0, (rnd() - 0.5) * 0.08))
    }
    leaves.castShadow = true
    leaves.receiveShadow = true
    return { petals, centres, stems, leaves }
  }, [])

  return (
    <group>
      <primitive object={petals} />
      <primitive object={centres} />
      <primitive object={leaves} />
      {stems.map((s, i) => (
        <mesh key={i} position={s.pos} quaternion={s.quat} castShadow>
          <cylinderGeometry args={[0.014, 0.02, s.len, 6]} />
          <meshStandardMaterial color="#557a34" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Vase() {
  const geo = useMemo(
    () =>
      lathe([
        [0, 0],
        [0.26, 0],
        [0.3, 0.05],
        [0.28, 0.12],
        [0.38, 0.38],
        [0.44, 0.62],
        [0.42, 0.84],
        [0.32, 1.04],
        [0.2, 1.16],
        [0.18, 1.24],
        [0.24, 1.32],
        [0.21, 1.34],
        [0.15, 1.28],
        [0, 1.26],
      ]),
    [],
  )
  return (
    <mesh geometry={geo} castShadow receiveShadow>
      <meshStandardMaterial color="#9fbaa6" roughness={0.28} />
    </mesh>
  )
}

function FruitBowl() {
  const G = useMemo(() => {
    const bowl = lathe([
      [0, 0],
      [0.18, 0],
      [0.2, 0.06],
      [0.17, 0.08],
      [0.36, 0.14],
      [0.55, 0.28],
      [0.66, 0.42],
      [0.68, 0.45],
      [0.64, 0.44],
      [0.52, 0.31],
      [0.32, 0.18],
      [0, 0.14],
    ])
    const pear = lathe([
      [0, 0],
      [0.12, 0.01],
      [0.17, 0.08],
      [0.17, 0.17],
      [0.13, 0.26],
      [0.09, 0.34],
      [0.07, 0.42],
      [0.04, 0.47],
      [0, 0.48],
    ])
    return { bowl, pear }
  }, [])
  const grapes = useMemo(() => {
    const rnd = mulberry(31)
    const out: [number, number, number][] = []
    for (let i = 0; i < 20; i++) {
      const t = i / 20
      out.push([0.5 + t * 0.32 + (rnd() - 0.5) * 0.12, 0.5 - t * 0.38 + (rnd() - 0.5) * 0.06, 0.18 + (rnd() - 0.5) * 0.2 + t * 0.1])
    }
    return out
  }, [])
  return (
    <group position={[0.98, 0, 0.42]} rotation={[0, -0.4, 0]}>
      <mesh geometry={G.bowl} castShadow receiveShadow>
        <meshStandardMaterial color="#efe8dc" roughness={0.22} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-0.2, 0.42, 0.05]} castShadow receiveShadow>
        <sphereGeometry args={[0.19, 32, 20]} />
        <meshStandardMaterial color="#e8852a" roughness={0.55} />
      </mesh>
      <mesh position={[0.14, 0.43, -0.16]} castShadow receiveShadow>
        <sphereGeometry args={[0.18, 32, 20]} />
        <meshStandardMaterial color="#ec8f2e" roughness={0.55} />
      </mesh>
      <mesh position={[0.1, 0.44, 0.2]} scale={[1, 0.9, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.19, 32, 20]} />
        <meshStandardMaterial color="#b52c26" roughness={0.4} />
      </mesh>
      <mesh position={[-0.1, 0.58, -0.12]} scale={[1, 0.9, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.17, 32, 20]} />
        <meshStandardMaterial color="#a8281f" roughness={0.4} />
      </mesh>
      <mesh geometry={G.pear} position={[-0.32, 0.3, -0.2]} rotation={[0.25, 0, 0.3]} castShadow receiveShadow>
        <meshStandardMaterial color="#c7b94a" roughness={0.55} />
      </mesh>
      {grapes.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <sphereGeometry args={[0.062, 14, 10]} />
          <meshStandardMaterial color={i % 4 ? '#4b2b5c' : '#5f3a70'} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

function Lemon() {
  return (
    <group position={[-0.35, 0.12, 1.12]} rotation={[0, 0.7, 0.1]}>
      <mesh scale={[1.35, 1, 1]} castShadow receiveShadow>
        <sphereGeometry args={[0.13, 32, 20]} />
        <meshStandardMaterial color="#f0cc35" roughness={0.5} />
      </mesh>
      <mesh position={[0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <coneGeometry args={[0.035, 0.06, 12]} />
        <meshStandardMaterial color="#e2bb2c" roughness={0.5} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

function Scene({ rx, ry, onFocus }: { rx: MotionValue<number>; ry: MotionValue<number>; onFocus: (x: number, y: number) => void }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const spot = useRef<THREE.SpotLight>(null)
  const st = useRef({ t: POSTER ? 2.4 : 0, fx: -1, fy: -1 })

  useLayoutEffect(() => {
    if (spot.current && rig.current) spot.current.target = rig.current
  }, [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    const s = st.current
    s.t += dt
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = POSTER ? Math.min(1, vh / 5.0) : mobile ? Math.min(0.8, vw / 5.6, vh / 7.4) : Math.min(0.98, vh / 5.5, vw / 9.4)
    const x = POSTER ? 0 : mobile ? -0.12 * k : vw * 0.15
    const y = POSTER ? -0.15 : mobile ? vh * 0.12 - 0.1 : -0.2
    if (rig.current) {
      rig.current.scale.setScalar(k)
      rig.current.position.set(x, y, 0)
    }
    if (spin.current) spin.current.rotation.set(rx.get(), Math.sin(s.t * 0.13) * 0.5 + ry.get(), 0)
    // vignette focus on the subject (uv, y up); the subject's middle sits ≈ 0.9 units above the rig origin
    const fx = 0.5 + x / vw
    const fy = 0.5 + (y + 0.9 * k) / vh
    if (Math.abs(fx - s.fx) > 0.002 || Math.abs(fy - s.fy) > 0.002) {
      s.fx = fx
      s.fy = fy
      onFocus(fx, fy)
    }
  })

  return (
    <>
      <hemisphereLight args={['#fff4e2', '#5a4838', 0.95]} />
      <spotLight
        ref={spot}
        position={[-4, 6.5, 8.5]}
        angle={0.5}
        penumbra={0.9}
        intensity={3.6}
        decay={0}
        color="#ffe2b8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[6, 2.5, 3]} intensity={0.55} color="#9fb8e0" />
      <group ref={rig}>
        {/* back wall + floor (don't turn with the table) */}
        <mesh position={[0, 3, -3.4]} receiveShadow>
          <planeGeometry args={[40, 20]} />
          <meshStandardMaterial color="#dccaa6" roughness={0.95} />
        </mesh>
        <mesh position={[0, -1.52, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 20]} />
          <meshStandardMaterial color="#7a5c40" roughness={0.9} />
        </mesh>
        <group ref={spin}>
          <DrapedTable />
          <group position={[-0.45, 0, -0.3]}>
            <Vase />
            <Bouquet />
          </group>
          <FruitBowl />
          <Lemon />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function OilPaint() {
  const [mode, setMode] = useState<OilMode>('classic')
  const [sizeI, setSizeI] = useState(1)
  const fx = useMemo(createOilEffect, [])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())

  useEffect(() => setOilMode(fx, mode), [fx, mode])
  useEffect(() => setOilStrokeSize(fx, SIZES[sizeI].v), [fx, sizeI])

  // idle: walk through the three ways of painting
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 9000 || splitOpen.current) return
      setMode((m) => oilModes[(oilModes.findIndex((o) => o.id === m) + 1) % oilModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  const rx = useMotionValue(0.02)
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
    ry.set(ry.get() + (e.clientX - d.x) * 0.008)
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.003, -0.12, 0.28))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 650 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.3, timeConstant: 400, min: -0.12, max: 0.28, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const S = SPEC[mode]
  const label = oilModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage op${split.open ? ' op-split' : ''}`}
      style={{ background: '#e6dbc4' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 1.7, 9.6], fov: 30 }} onCreated={({ camera }) => camera.lookAt(0, 0.75, 0)}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={oilMeta.background} />
        <Scene rx={rx} ry={ry} onFocus={(x, y) => setOilFocus(fx, x, y)} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy op-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Oil Paint · Anisotropic Kuwahara
            </p>
            <h1>
              把渲染画面
              <br />
              揉成颜料
            </h1>
            <p className="op-sub">Kuwahara 滤波沿形体拉长取样窗口，把画面揉成一块块色面；每一笔都顺着结构走，带着笔毛纹理、干笔飞白和厚涂起伏，被左上方的暖光照亮。</p>
            <div className="op-spec">
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
          <Seg items={oilModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg op-cycle" onClick={() => setSizeI((d) => (d + 1) % SIZES.length)}>
              <span>
                笔触 <b>{SIZES[sizeI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="op-lab">笔触</span>
              <Seg items={SIZES.map((d, i) => ({ value: i, label: d.zh }))} value={sizeI} onChange={setSizeI} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg op-toggle" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="op-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动静物 · 闲置时自动换一种画法</p>
      </div>
    </div>
  )
}

const css = `
.op { cursor: grab; touch-action: none; }
.op:active { cursor: grabbing; }
.op canvas { display: block; }
.op-copy { pointer-events: none !important; --soft-bg: #eadcc0; }
.op-copy .scrim { opacity: .8; }
.op-copy .kicker { color: #5e4c3a; }
.op-copy .kicker i { background: #b4502c; }
.op-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #2a2018; }
.op-sub { max-width: 400px; color: #3f3428 !important; }
.op-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4c4033; }
.op-spec span { display: inline-flex; align-items: center; gap: 10px; }
.op-spec b {
  font-weight: 600; color: #2a2018; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(42, 32, 24, .3);
}
.op-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.op-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.op-cycle b { font-weight: 600; color: var(--fg); }
.op .hint { transition: opacity .4s; color: #3f3428; padding: 4px 10px; border-radius: 999px; background: rgba(236, 224, 200, .78); }
.op-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .op-copy { transition: opacity .4s; }
  .op-split .op-copy { opacity: 0; }
  .op-sub { display: none; }
  .op-copy h1 { font-size: 32px; }
  .op-spec { margin-top: 10px; }
  .op .dock .seg { padding: 0 9px; }
  .op .dock .dock-sep { margin: 0 1px; }
}
`
