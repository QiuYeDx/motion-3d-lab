import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  TIEDYE_MODE_PATTERN,
  bloomTieDye,
  createTieDyeEffect,
  redyeTieDye,
  setTieDyeAnchor,
  setTieDyeGround,
  setTieDyeMode,
  setTieDyePattern,
  tiedyeModes,
  tiedyePatterns,
  tiedyeProgress,
  type TieDyeEffect,
  type TieDyeMode,
  type TieDyePattern,
} from './effects/tiedye'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 扎染 showcase — a dye yard: a long cotton banner hanging from a bamboo frame, waving in the breeze (vertices
 * moved on the CPU, normals rebuilt), a glazed indigo vat with its coppery foam, and a stool with folded shirts and
 * a bound bundle. The effect dyes the cloth; its pattern is laid on the banner's own plane and on the stool's top
 * (setTieDyeAnchor, object space rebuilt from depth), so it waves with the banner instead of swimming. The frame,
 * vat and stool are written with scene alpha < 0.97 and pass through; the floor only catches shadows.
 * 染一次 dips everything again: the vat colour rises over the cloth, drains, the pattern blooms open and the
 * fresh yellow-green indigo oxidises to blue; the banner sinks a little while it is "under".
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const BG = '#ebe8e2'
const FOV = 32
const CYCLE_EVERY = 15000
const BW = 3.0 // banner width
const BH = 4.1 // banner height
const SEG_X = 40
const SEG_Y = 56

const SPEC: Record<TieDyeMode, { tag: string; note: string }> = {
  indigo: { tag: '板蓝根 · 蓼蓝', note: '出缸时黄绿 · 见空气氧化成蓝' },
  rainbow: { tag: '活性染料', note: '扭成圆饼 · 分区挤染 · 颜色互相渗开' },
  jiaoxie: { tag: '撮晕 · 鹿胎缬', note: '一粒粒捏起扎紧 · 每粒留一圈白晕' },
}
const STAGES = ['', '浸入染缸', '出缸', '显花 · 氧化']

/* ------------------------------------------------------------------ materials */

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

const VAT: [number, number][] = [
  [0.001, 0.0],
  [0.55, 0.0],
  [0.72, 0.18],
  [0.86, 0.55],
  [0.9, 0.9],
  [0.84, 1.18],
  [0.74, 1.3],
  [0.76, 1.36],
  [0.7, 1.38],
  [0.66, 1.3],
]

/* ------------------------------------------------------------------ scene */

function Yard({ fx, ry, dip }: { fx: TieDyeEffect; ry: MotionValue<number>; dip: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const rig = useRef<THREE.Group>(null)
  const banner = useRef<THREE.Group>(null)
  const stool = useRef<THREE.Group>(null)
  const floor = useRef<THREE.Mesh>(null)
  const t = useRef(POSTER ? 2.6 : 0)
  const sink = useRef(0)
  const lastStage = useRef(-1)

  const R = useMemo(() => {
    const cloth = new THREE.PlaneGeometry(BW, BH, SEG_X, SEG_Y)
    cloth.translate(0, -BH / 2, 0) // hangs from y = 0
    const rest = Float32Array.from(cloth.attributes.position.array as Float32Array)
    const vatPts = VAT.map(([r, y]) => new THREE.Vector2(r, y))
    return {
      cloth,
      rest,
      vat: new THREE.LatheGeometry(vatPts, 64),
      white: new THREE.MeshStandardMaterial({ color: '#f5f3ee', roughness: 0.95, side: THREE.DoubleSide }),
      bamboo: passMat({ color: '#b89a5c', roughness: 0.55 }),
      wood: passMat({ color: '#6d4a2e', roughness: 0.7 }),
      glaze: passMat({ color: '#4a3226', roughness: 0.28, metalness: 0.05, side: THREE.DoubleSide }),
      liquid: passMat({ color: '#18294a', roughness: 0.15 }),
      foam: passMat({ color: '#5d4f78', roughness: 0.35, metalness: 0.3 }),
      thread: passMat({ color: '#efe6cf', roughness: 0.8 }),
      shadow: new THREE.ShadowMaterial({ color: '#2a2a3a', opacity: 0.2 }),
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
    const k = t.current
    const aspect = size.width / size.height
    const desk = size.width >= 760 && !POSTER
    const dist = 11.5
    const halfW = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * dist
    if (rig.current) {
      const s = aspect < 0.8 ? Math.min(0.8, (halfW * 2) / 4.6) : Math.min(POSTER ? 0.96 : 0.86, aspect * 1.0)
      rig.current.scale.setScalar(s)
      rig.current.position.set(desk ? halfW * 0.3 : 0, aspect < 0.8 ? 0.15 : 0, 0)
      rig.current.rotation.y = ry.get()
    }

    // the banner waves: a travelling wave across, a slower billow, pinned along the top, freer at the hem
    const pos = R.cloth.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < pos.count; i++) {
      const x = R.rest[i * 3]
      const y = R.rest[i * 3 + 1]
      const down = -y / BH // 0 top → 1 hem
      const free = Math.min(1, down * 1.6) ** 1.3
      const z =
        free * (0.24 * Math.sin(x * 2.1 - k * 1.5 + down * 2.2) + 0.12 * Math.sin(x * 4.3 + k * 2.1 - down * 3.1)) +
        free * 0.22 * Math.sin(k * 0.6 + down * 1.4) +
        0.05 * Math.sin(x * 9.0 + k * 0.4) * (1 - free) // gathered folds under the pole
      arr[i * 3 + 2] = z
      arr[i * 3] = x + free * 0.03 * Math.sin(k * 0.9 + down * 3.0)
    }
    pos.needsUpdate = true
    R.cloth.computeVertexNormals()

    // while it is "under", the banner sinks a little
    const front = (fx.uniforms!.uDip.value as THREE.Vector4).x
    const want = front > -0.5 ? -0.5 * Math.min(1, Math.max(0, front)) : 0
    sink.current += (want - sink.current) * (1 - Math.exp(-dt * 6))
    if (banner.current) banner.current.position.y = 4.95 + sink.current

    // dye status in the copy (DOM writes only when the stage changes)
    const box = dip.current
    if (box) {
      const { p, stage } = tiedyeProgress(fx)
      const bar = box.querySelector<HTMLElement>('b')
      if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`
      if (stage !== lastStage.current) {
        lastStage.current = stage
        box.style.opacity = stage === 0 ? '0' : '1'
        const lab = box.querySelector<HTMLElement>('span')
        if (lab && stage > 0) lab.textContent = STAGES[stage]
      }
    }

    // lay the pattern on the banner's plane and on the stool top
    camera.updateMatrixWorld()
    if (banner.current && stool.current) {
      banner.current.updateWorldMatrix(true, false)
      stool.current.updateWorldMatrix(true, false)
      R.m.multiplyMatrices(camera.matrixWorldInverse, banner.current.matrixWorld).invert()
      R.m2.multiplyMatrices(camera.matrixWorldInverse, stool.current.matrixWorld).invert()
      setTieDyeAnchor(
        fx,
        {
          viewToObject: R.m,
          tanHalfFov: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
          scale: 0.66,
          plane: 'xy',
          threads: 70,
          offset: [0.5, 0.06],
          center: [0, -BH * 0.46],
        },
        { viewToObject: R.m2, scale: 1.25, plane: 'xz', threads: 40, offset: [0.5, 0.5], center: [-0.1, 0], halfX: 1.0, yMin: 0.0, yMax: 1.2, halfZ: 0.9 },
      )
    }
  })

  return (
    <>
      <hemisphereLight args={['#fffaf2', '#a59c90', 0.95]} />
      <directionalLight
        position={[-7, 7, 4.5]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={8}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
      />
      <directionalLight position={[6, 3, 4]} intensity={0.5} color="#e6eeff" />
      <group ref={content} visible={ready}>
        <group ref={rig}>
          <mesh ref={floor} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={R.shadow}>
            <planeGeometry args={[40, 40]} />
          </mesh>
          {/* bamboo drying frame */}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 1.85, 2.6, -0.5]} castShadow material={R.bamboo}>
              <cylinderGeometry args={[0.06, 0.07, 5.2, 14]} />
            </mesh>
          ))}
          <mesh position={[0, 5.05, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow material={R.bamboo}>
            <cylinderGeometry args={[0.065, 0.065, 4.3, 14]} />
          </mesh>
          {[-1.6, -0.8, 0, 0.8, 1.6].map((x) => (
            <mesh key={x} position={[x, 5.05, -0.5]} rotation={[0, 0, Math.PI / 2]} material={R.bamboo}>
              <cylinderGeometry args={[0.075, 0.075, 0.03, 14]} />
            </mesh>
          ))}
          <group ref={banner} position={[0, 4.95, -0.5]}>
            <mesh geometry={R.cloth} material={R.white} castShadow receiveShadow />
          </group>
          {/* the indigo vat, foam (靛花) floating on top */}
          <group position={[-1.45, 0, 1.55]} scale={0.72}>
            <mesh geometry={R.vat} material={R.glaze} castShadow receiveShadow />
            <mesh position={[0, 1.24, 0]} rotation={[-Math.PI / 2, 0, 0]} material={R.liquid}>
              <circleGeometry args={[0.7, 48]} />
            </mesh>
            {[
              [0.1, 0.05, 0.16],
              [-0.18, 0.12, 0.11],
              [0.05, -0.2, 0.09],
              [0.25, -0.1, 0.07],
            ].map(([x, z, r], i) => (
              <mesh key={i} position={[x, 1.25, z]} scale={[1, 0.35, 1]} material={R.foam}>
                <sphereGeometry args={[r, 16, 10]} />
              </mesh>
            ))}
          </group>
          {/* stool with folded shirts and a bound bundle */}
          <group position={[1.15, 0, 2.15]} rotation={[0, -0.3, 0]} scale={0.85}>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow material={R.wood}>
              <boxGeometry args={[1.6, 0.1, 1.15]} />
            </mesh>
            {[
              [-0.68, -0.48],
              [0.68, -0.48],
              [-0.68, 0.48],
              [0.68, 0.48],
            ].map(([x, z], i) => (
              <mesh key={i} position={[x, 0.19, z]} castShadow material={R.wood}>
                <boxGeometry args={[0.09, 0.38, 0.09]} />
              </mesh>
            ))}
            <group ref={stool} position={[0, 0.47, 0]}>
              <RoundedBox args={[1.1, 0.16, 0.86]} radius={0.06} smoothness={3} position={[-0.12, 0.08, 0]} castShadow receiveShadow material={R.white} />
              <RoundedBox args={[1.04, 0.15, 0.8]} radius={0.06} smoothness={3} position={[-0.1, 0.235, 0.02]} rotation={[0, 0.06, 0]} castShadow receiveShadow material={R.white} />
              {/* collar and the centre fold of the top shirt */}
              <mesh position={[-0.1, 0.315, -0.28]} rotation={[-Math.PI / 2, 0, 0]} material={R.white} castShadow>
                <torusGeometry args={[0.15, 0.025, 8, 24, Math.PI]} />
              </mesh>
              <mesh position={[-0.1, 0.312, 0.08]} material={R.white}>
                <boxGeometry args={[0.03, 0.01, 0.6]} />
              </mesh>
              {/* a bound bundle waiting to be dyed */}
              <group position={[0.58, 0.17, 0.12]}>
                <mesh scale={[1, 0.8, 1]} castShadow material={R.white}>
                  <icosahedronGeometry args={[0.17, 3]} />
                </mesh>
                {[-0.05, 0.05].map((y) => (
                  <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={R.thread}>
                    <torusGeometry args={[0.16, 0.012, 6, 28]} />
                  </mesh>
                ))}
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
    const far = aspect < 0.8 ? 13.5 : 11.5
    camera.position.set(0, 2.8 * (far / 11.5), far)
    camera.lookAt(0, aspect < 0.8 ? 0.95 : 2.05, 0)
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function TieDye() {
  const [mode, setMode] = useState<TieDyeMode>('indigo')
  const [pat, setPat] = useState<TieDyePattern>(TIEDYE_MODE_PATTERN.indigo)
  const fx = useMemo(() => {
    const f = createTieDyeEffect()
    setTieDyeGround(f, false, BG)
    // first view: the cloth has just come out of the vat — the pattern blooms and the indigo turns blue
    if (!POSTER && !REDUCED) bloomTieDye(f)
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const dip = useRef<HTMLDivElement>(null)

  const chooseMode = (m: TieDyeMode) => {
    setMode(m)
    setPat(TIEDYE_MODE_PATTERN[m])
  }
  useEffect(() => setTieDyeMode(fx, mode), [fx, mode])
  useEffect(() => setTieDyePattern(fx, pat), [fx, pat])

  // idle: a new pattern every so often (and, once round, the next dye)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const step = useRef(0)
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 14000 || splitOpen.current) return
      step.current++
      if (step.current % 3 === 0) {
        setMode((m) => {
          const n = tiedyeModes[(tiedyeModes.findIndex((o) => o.id === m) + 1) % tiedyeModes.length].id
          setPat(TIEDYE_MODE_PATTERN[n])
          return n
        })
      } else {
        setPat((p) => tiedyePatterns[(tiedyePatterns.findIndex((o) => o.id === p) + 1) % tiedyePatterns.length].id)
      }
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.004, -0.55, 0.55))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(ry, ry.get(), {
      type: 'inertia',
      velocity: ry.getVelocity(),
      power: 0.4,
      timeConstant: 600,
      min: -0.55,
      max: 0.55,
      bounceStiffness: 140,
      bounceDamping: 18,
    })
  }

  const label = tiedyeModes.find((m) => m.id === mode)!.label
  const S = SPEC[mode]

  return (
    <div
      className={`stage td${split.open ? ' td-split' : ''}`}
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.6, 11.5], fov: FOV, near: 0.5, far: 60 }}>
        <Aim />
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={BG} preload={preload} />
        <Yard fx={fx} ry={ry} dip={dip} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy td-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Shibori · 扎染
            </p>
            <h1>
              扎紧的地方
              <br />
              留下白花
            </h1>
            <p className="td-sub">
              布被捏起、折叠、夹板、缝线扎紧，再浸进靛蓝染缸。染料进不去的地方留白：放射的蜘蛛纹、方格、同心圈或螺旋，边缘顺着纱线晕开，布纹清晰可见。
            </p>
            <div className="td-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b className={mode}>{S.tag}</b>
                  {S.note}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="td-dip" ref={dip} style={{ opacity: 0 }}>
              <span>浸入染缸</span>
              <i>
                <b />
              </i>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={tiedyeModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={chooseMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button
              className="seg td-cycle"
              onClick={() => setPat((p) => tiedyePatterns[(tiedyePatterns.findIndex((o) => o.id === p) + 1) % tiedyePatterns.length].id)}
            >
              <span>
                <b>{tiedyePatterns.find((p) => p.id === pat)!.label}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="td-lbl">花纹</span>
              <Seg items={tiedyePatterns.map((p) => ({ value: p.id, label: p.label }))} value={pat} onChange={setPat} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg td-btn" onClick={() => redyeTieDye(fx)} aria-label="再染一次">
            <span>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 1.5C5 4.2 3.4 6.2 3.4 8.4a3.6 3.6 0 0 0 7.2 0C10.6 6.2 9 4.2 7 1.5Z" fill="currentColor" />
              </svg>
              {MOBILE ? '染' : '染一次'}
            </span>
          </button>
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="td-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动染坊 · 换花纹会重新下缸</p>
      </div>
    </div>
  )
}

const css = `
.td { cursor: grab; touch-action: none; }
.td:active { cursor: grabbing; }
.td canvas { display: block; }
.td-copy { pointer-events: none !important; }
.td-copy .scrim { --soft-bg: ${BG}; }
.td-copy .kicker { color: #5a6270; }
.td-copy .kicker i { background: #1d3c6b; box-shadow: 0 0 0 3px rgba(29, 60, 107, .14); }
.td-copy h1 { font-size: clamp(40px, 4.4vw, 62px); color: #15284a; }
.td-sub { max-width: 410px; color: #4a5260 !important; }
.td-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4a5260; }
.td-spec span { display: inline-flex; align-items: center; gap: 10px; }
.td-spec b { font-weight: 600; color: #15284a; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(29, 60, 107, .32); }
.td-spec b.rainbow { color: #fff; box-shadow: none; background: linear-gradient(90deg, #e8177a, #f6731c, #f8cd17, #35b04a, #0fa7b5, #2856d6, #7a3cc0); }
.td-dip { display: flex; align-items: center; gap: 10px; margin-top: 14px; height: 14px; font: 500 11px/1 var(--mono); color: #4a5260; transition: opacity .6s; }
.td-dip i { position: relative; width: 120px; height: 2px; border-radius: 2px; background: rgba(29, 60, 107, .16); overflow: hidden; }
.td-dip b { position: absolute; inset: 0; background: #1d3c6b; transform-origin: left; transform: scaleX(0); }
.td-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.td-btn span, .td-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.td-btn svg { color: #1d3c6b; }
.td-cycle b { font-weight: 600; color: var(--fg); }
.td .hint { transition: opacity .4s; color: #4a5260; }
.td-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .td-copy { transition: opacity .4s; }
  .td-split .td-copy { opacity: 0; }
  .td-sub { display: none; }
  .td-copy h1 { font-size: 32px; }
  .td-spec { margin-top: 10px; }
  .td-dip { margin-top: 8px; }
  .td .dock .seg { padding: 0 8px; }
  .td .dock .dock-sep { margin: 0 1px; }
}
`
