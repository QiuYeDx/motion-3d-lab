import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  createQinghuaEffect,
  qinghuaMeta,
  qinghuaModes,
  setQinghuaAnchor,
  setQinghuaCell,
  setQinghuaMode,
  type QinghuaEffect,
  type QinghuaMode,
} from './effects/qinghua'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 青花瓷 showcase — a meiping vase and a tea bowl, plain white porcelain, slowly turning on rosewood stands.
 * The effect paints them: value → five cobalt washes, outlines from depth / normals, iron-spot heaps, and
 * registers of decoration (莲瓣 · 回纹 · 缠枝莲 · 回纹 · 卷草) laid on each object's own surface with
 * setQinghuaAnchor (cylindrical coordinates rebuilt from depth), so the painting turns with the pot instead of
 * swimming. The stands are written with scene alpha < 0.97 (custom One/Zero blending) and pass through; the floor
 * is a ShadowMaterial hidden from the normal pass, so only its shadows reach the page.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const BG = qinghuaMeta.background
const FOV = 30
const CYCLE_EVERY = 12000

const DENSITY = [
  { zh: '疏', around: 6, height: 1.05, bowl: 5, bowlH: 0.36, cell: 132 },
  { zh: '中', around: 8, height: 0.84, bowl: 6, bowlH: 0.3, cell: 104 },
  { zh: '密', around: 11, height: 0.62, bowl: 8, bowlH: 0.23, cell: 78 },
]

const SPEC: Record<QinghuaMode, { tag: string; note: string }> = {
  yuan: { tag: '苏麻离青', note: '浓艳发紫 · 铁锈斑堆积 · 晕散' },
  ming: { tag: '浙料', note: '色泽淡雅 · 分水均匀 · 勾线纤细' },
  youlihong: { tag: '铜红 + 钴蓝', note: '花朵用釉里红 · 枝叶仍是青花' },
}

/* ------------------------------------------------------------------ materials + geometry */

/** written to the scene target with alpha < 0.97, which tells the effect to leave it alone */
function passMat(p: THREE.MeshStandardMaterialParameters, alpha = 0.55) {
  return new THREE.MeshStandardMaterial({
    ...p,
    opacity: alpha,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.ZeroFactor,
  })
}

function smoothLathe(ctrl: [number, number][], n = 140, segs = 112) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal')
  const pts = curve.getSpacedPoints(n - 1).map((p) => new THREE.Vector2(Math.max(p.x, 0.001), p.y))
  return new THREE.LatheGeometry(pts, segs)
}

// 梅瓶: small mouth, short neck, broad high shoulder tapering to a narrow foot
const MEIPING: [number, number][] = [
  [0.001, 0.0],
  [0.5, 0.0],
  [0.54, 0.05],
  [0.5, 0.18],
  [0.52, 0.5],
  [0.61, 1.0],
  [0.77, 1.6],
  [0.92, 2.15],
  [0.95, 2.42],
  [0.86, 2.7],
  [0.6, 2.92],
  [0.31, 3.03],
  [0.21, 3.1],
  [0.2, 3.24],
  [0.27, 3.3],
  [0.25, 3.37],
  [0.17, 3.37],
]

// tea bowl: foot ring, flaring wall, thin rim, then back down the inside
const BOWL: [number, number][] = [
  [0.001, 0.07],
  [0.2, 0.07],
  [0.21, 0.0],
  [0.27, 0.0],
  [0.29, 0.07],
  [0.44, 0.2],
  [0.58, 0.4],
  [0.66, 0.6],
  [0.655, 0.625],
  [0.63, 0.6],
  [0.56, 0.43],
  [0.42, 0.25],
  [0.22, 0.14],
  [0.001, 0.12],
]

/* ------------------------------------------------------------------ scene */

function Display({ fx, ry, density }: { fx: QinghuaEffect; ry: MotionValue<number>; density: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const rig = useRef<THREE.Group>(null)
  const vase = useRef<THREE.Group>(null)
  const bowl = useRef<THREE.Group>(null)
  const floor = useRef<THREE.Mesh>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  const t = useRef(POSTER ? 3.4 : 0)

  const R = useMemo(() => {
    const porcelain = new THREE.MeshStandardMaterial({ color: '#f5f7f7', roughness: 0.38, side: THREE.DoubleSide })
    const wood = passMat({ color: '#4a2215', roughness: 0.45 })
    const woodDark = passMat({ color: '#2e140c', roughness: 0.5 })
    return {
      vaseGeo: smoothLathe(MEIPING),
      bowlGeo: new THREE.LatheGeometry(
        BOWL.map(([r, y]) => new THREE.Vector2(r, y)),
        96,
      ),
      porcelain,
      wood,
      woodDark,
      shadow: new THREE.ShadowMaterial({ color: '#25344a', opacity: 0.22 }),
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
    }
  }, [])

  // the floor only catches shadows: keep it out of the normal / coverage pass
  useEffect(() => {
    const prev = scene.onBeforeRender
    scene.onBeforeRender = (...args) => {
      if (floor.current) floor.current.visible = !scene.overrideMaterial
      prev?.(...args)
    }
    return () => {
      scene.onBeforeRender = prev
    }
  }, [scene])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!REDUCED) t.current += dt
    const aspect = size.width / size.height
    const desk = size.width >= 760 && !POSTER
    const dist = 10.5
    const halfW = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * dist
    if (rig.current) {
      const s = aspect < 0.8 ? Math.min(0.95, (halfW * 2) / 3.9) : Math.min(1, aspect * 1.2)
      rig.current.scale.setScalar(s)
      rig.current.position.set(desk ? halfW * 0.3 : aspect < 0.8 ? -0.2 * s : 0, aspect < 0.8 ? 0.22 : 0, 0)
    }
    const spin = t.current * 0.14 + ry.get()
    if (vase.current) vase.current.rotation.y = spin
    if (bowl.current) bowl.current.rotation.y = -spin * 0.7 + 1.2
    if (key.current && rig.current) key.current.target = rig.current

    // lay the decoration on both turning pots
    camera.updateMatrixWorld()
    if (vase.current && bowl.current) {
      vase.current.updateWorldMatrix(true, false)
      bowl.current.updateWorldMatrix(true, false)
      R.m.multiplyMatrices(camera.matrixWorldInverse, vase.current.matrixWorld).invert()
      R.m2.multiplyMatrices(camera.matrixWorldInverse, bowl.current.matrixWorld).invert()
      const d = DENSITY[density]
      setQinghuaAnchor(
        fx,
        { viewToObject: R.m, tanHalfFov: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), around: d.around, height: d.height, offset: 0 },
        { viewToObject: R.m2, around: d.bowl, height: d.bowlH, offset: 1.35 - 0.1 / d.bowlH, radius: 0.75, yMin: -0.05, yMax: 0.7 },
      )
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#aeb6bd', 1.3]} />
      <directionalLight
        ref={key}
        position={[-4.5, 7, 5.5]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={6}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={5}
      />
      <directionalLight position={[5, 2.5, 3]} intensity={0.45} color="#e8f0ff" />
      <group ref={content} visible={ready}>
        <group ref={rig}>
          <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={R.shadow}>
            <planeGeometry args={[30, 30]} />
          </mesh>
          {/* meiping on a rosewood stand */}
          <group position={[-0.62, 0, -0.1]}>
            <mesh position={[0, 0.13, 0]} castShadow receiveShadow material={R.wood}>
              <cylinderGeometry args={[0.78, 0.86, 0.26, 56]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} castShadow material={R.woodDark}>
              <cylinderGeometry args={[0.88, 0.9, 0.04, 56]} />
            </mesh>
            <mesh position={[0, 0.275, 0]} castShadow material={R.woodDark}>
              <cylinderGeometry args={[0.66, 0.74, 0.03, 56]} />
            </mesh>
            <group ref={vase} position={[0, 0.29, 0]}>
              <mesh geometry={R.vaseGeo} material={R.porcelain} castShadow receiveShadow />
            </group>
          </group>
          {/* tea bowl on a low stand */}
          <group position={[1.32, 0, 0.95]}>
            <mesh position={[0, 0.09, 0]} castShadow receiveShadow material={R.wood}>
              <cylinderGeometry args={[0.5, 0.56, 0.18, 48]} />
            </mesh>
            <mesh position={[0, 0.19, 0]} castShadow material={R.woodDark}>
              <cylinderGeometry args={[0.42, 0.48, 0.03, 48]} />
            </mesh>
            <group ref={bowl} position={[0, 0.205, 0]} rotation={[0.12, 0, 0]}>
              <group rotation={[0, 0, 0]}>
                <mesh geometry={R.bowlGeo} material={R.porcelain} castShadow receiveShadow />
              </group>
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

function Aim() {
  useFrame(({ camera, size }) => {
    const aspect = size.width / size.height
    const far = aspect < 0.8 ? 12.5 : 10.5
    camera.position.set(0, 2.5 * (far / 10.5), far)
    camera.lookAt(0, aspect < 0.8 ? 0.6 : 1.6, 0)
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function Qinghua() {
  const [mode, setMode] = useState<QinghuaMode>('yuan')
  const [density, setDensity] = useState(1)
  const fx = useMemo(() => createQinghuaEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())

  useEffect(() => setQinghuaMode(fx, mode), [fx, mode])
  useEffect(() => setQinghuaCell(fx, DENSITY[density].cell), [fx, density])

  // idle: walk through the three wares
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => qinghuaModes[(qinghuaModes.findIndex((o) => o.id === m) + 1) % qinghuaModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
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
    ry.set(ry.get() + (e.clientX - d.x) * 0.008)
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    // a potter's wheel given a push: glides on and settles
    anim.current = animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 700 })
  }

  const label = qinghuaModes.find((m) => m.id === mode)!.label
  const S = SPEC[mode]

  return (
    <div
      className={`stage qh${split.open ? ' qh-split' : ''}`}
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.5, 10.5], fov: FOV, near: 0.5, far: 60 }}>
        <Aim />
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={BG} preload={preload} />
        <Display fx={fx} ry={ry} density={density} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy qh-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Blue &amp; White · 釉下青花
            </p>
            <h1>
              钴料入釉
              <br />
              一火成青
            </h1>
            <p className="qh-sub">
              明暗被画成五层浓淡的钴蓝“分水”，轮廓用细线勾出；平整的亮面上画着莲瓣、回纹、缠枝莲和卷草，纹饰贴在器身上跟着转。浓处积出铁锈斑，最外面罩一层透亮的釉。
            </p>
            <div className="qh-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className={`qh-wash ${mode}`} aria-hidden>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.i
                        key={i}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 28, delay: 0.04 + i * 0.04 }}
                      />
                    ))}
                  </div>
                  <p>
                    <b>{S.tag}</b>
                    {S.note}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={qinghuaModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg qh-cycle" onClick={() => setDensity((d) => (d + 1) % DENSITY.length)}>
              <span>
                纹饰 <b>{DENSITY[density].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="qh-lbl">纹饰密度</span>
              <Seg items={DENSITY.map((d, i) => ({ value: i, label: d.zh }))} value={density} onChange={setDensity} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="qh-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动器物 · 纹饰贴着器身转</p>
      </div>
    </div>
  )
}

const css = `
.qh { cursor: grab; touch-action: none; }
.qh:active { cursor: grabbing; }
.qh canvas { display: block; }
.qh-copy { pointer-events: none !important; }
.qh-copy .scrim { --soft-bg: ${BG}; }
.qh-copy .kicker { color: #4f5d70; }
.qh-copy .kicker i { background: #213f98; box-shadow: 0 0 0 3px rgba(33, 63, 152, .14); }
.qh-copy h1 { font-size: clamp(40px, 4.4vw, 62px); color: #142659; letter-spacing: .02em; }
.qh-sub { max-width: 410px; color: #455164 !important; }
.qh-spec { margin-top: 22px; min-height: 64px; }
.qh-wash { display: flex; gap: 5px; height: 22px; align-items: flex-end; }
.qh-wash i { width: 26px; height: 22px; border-radius: 3px 3px 6px 6px; transform-origin: bottom; }
.qh-wash i:nth-child(1) { background: #c3d3ee; }
.qh-wash i:nth-child(2) { background: #8ea7da; }
.qh-wash i:nth-child(3) { background: #4d74c4; }
.qh-wash i:nth-child(4) { background: #2d4ba6; }
.qh-wash i:nth-child(5) { background: #17207a; }
.qh-wash.yuan i:nth-child(5) { background: radial-gradient(circle at 30% 60%, #0b0d2a 0 3px, transparent 4px), #17207a; }
.qh-wash.youlihong i:nth-child(4) { background: #be4a40; }
.qh-wash.youlihong i:nth-child(5) { background: #7a2023; }
.qh-spec p { display: flex; align-items: center; gap: 10px; margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: #455164; }
.qh-spec b { font-weight: 600; color: #142659; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(33, 63, 152, .32); }
.qh-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.qh-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.qh-cycle b { font-weight: 600; color: var(--fg); }
.qh .hint { transition: opacity .4s; color: #455164; }
.qh-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .qh-copy { transition: opacity .4s; }
  .qh-split .qh-copy { opacity: 0; }
  .qh-sub { display: none; }
  .qh-copy h1 { font-size: 34px; }
  .qh-spec { margin-top: 10px; min-height: 0; }
  .qh-wash { height: 16px; }
  .qh-wash i { width: 18px; height: 16px; }
  .qh .dock .seg { padding: 0 9px; }
  .qh .dock .dock-sep { margin: 0 1px; }
}
`
