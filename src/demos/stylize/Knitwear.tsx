import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  KNIT_PALETTES,
  createKnitEffect,
  knitIn,
  knitMeta,
  knitModes,
  setKnitHem,
  setKnitMode,
  setKnitMotif,
  setKnitStitch,
  type KnitMode,
} from './effects/knit'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 毛线编织 showcase — a Fair Isle jumper whose front shows a ginger cat in a red scarf, curled up on a cushion
 * beside a ball of yarn with two needles stuck through it and a little fir tree. The objects are ordinary lit
 * primitives; the effect (./effects/knit.ts) charts them onto the stitch grid, knits the background as
 * Fair Isle bands, sets a 2 × 2 ribbed hem along the bottom, and a loose yarn end (DOM SVG) sways over it.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const SIZES = [
  { zh: '细', v: 0.8 },
  { zh: '中', v: 1 },
  { zh: '粗', v: 1.3 },
]

const NOTE: Record<KnitMode, string> = {
  fairisle: '设得兰羊毛 · 8 色提花 · 平针 V 形针目',
  chunky: '粗棒针 · 马卡龙色 · 平整处自动起麻花',
  crochet: '棉线钩针 · 三针一簇的祖母针 · 背景拼祖母方格',
}

const BG = knitMeta.background
const hemFor = (w: number) => (w < 760 ? 44 : 58)

/** subject area in CSS px */
function areaFor(W: number, H: number) {
  if (POSTER) return { x: W * 0.1, y: H * 0.08, w: W * 0.8, h: H * 0.78 }
  if (W < 760) return { x: 12, y: 84, w: W - 24, h: Math.min(H * 0.48, W * 1.05) }
  const left = Math.min(W * 0.4, 560)
  return { x: left, y: 80, w: W - left - 40, h: H - 80 - 120 }
}

/* ------------------------------------------------------------------ scene */

function Std({ color, rough = 0.75 }: { color: string; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} />
}

function Cat() {
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const scarf = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 1.2 : 0)
  const tailGeo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.55, 0.05, 0.1),
      new THREE.Vector3(0.95, 0.35, 0.25),
      new THREE.Vector3(1.08, 0.85, 0.3),
      new THREE.Vector3(0.9, 1.15, 0.32),
    ])
    return new THREE.TubeGeometry(c, 40, 0.15, 14)
  }, [])
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    const s = t.current
    const k = POSTER ? 0 : 1
    if (head.current) head.current.rotation.set(Math.sin(s * 0.6) * 0.05 * k, Math.sin(s * 0.35) * 0.22 * k, 0.12 + Math.sin(s * 0.5) * 0.1 * k)
    if (tail.current) tail.current.rotation.set(0, Math.sin(s * 1.1) * 0.25 * k, Math.sin(s * 1.6) * 0.18 * k)
    if (eyes.current) {
      const b = s % 4.2
      eyes.current.scale.y = b < 0.14 && k ? 0.15 : 1
    }
    if (scarf.current) scarf.current.rotation.x = 0.1 + Math.sin(s * 1.4) * 0.12 * k
  })
  const mustard = '#e8a63a'
  const cream = '#f6ead2'
  return (
    <group position={[0, 0.55, 0]}>
      {/* body */}
      <mesh position={[0, 0.82, 0]} scale={[1, 1.08, 0.88]}>
        <sphereGeometry args={[0.86, 40, 28]} />
        <Std color={mustard} />
      </mesh>
      <mesh position={[0.05, 0.72, 0.58]} scale={[0.6, 0.72, 0.4]}>
        <sphereGeometry args={[0.8, 32, 20]} />
        <Std color={cream} />
      </mesh>
      {/* paws */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x, 0.12, 0.62]} scale={[1, 0.7, 1.25]}>
          <sphereGeometry args={[0.22, 20, 14]} />
          <Std color={cream} />
        </mesh>
      ))}
      {/* tail */}
      <group ref={tail} position={[0.55, 0.25, -0.25]}>
        <mesh geometry={tailGeo}>
          <Std color={mustard} />
        </mesh>
        <mesh position={[0.9, 1.15, 0.32]}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <Std color={cream} />
        </mesh>
      </group>
      {/* scarf */}
      <group ref={scarf} position={[0, 1.58, 0.05]}>
        <mesh rotation={[Math.PI / 2 - 0.12, 0, 0]}>
          <torusGeometry args={[0.52, 0.16, 16, 40]} />
          <Std color="#cf3a2f" />
        </mesh>
        <mesh position={[-0.32, -0.42, 0.42]} rotation={[0.18, 0, 0.18]}>
          <boxGeometry args={[0.28, 0.72, 0.12]} />
          <Std color="#cf3a2f" />
        </mesh>
      </group>
      {/* head */}
      <group ref={head} position={[0, 2.12, 0.05]}>
        <mesh scale={[1.1, 0.95, 0.95]}>
          <sphereGeometry args={[0.66, 40, 28]} />
          <Std color={mustard} />
        </mesh>
        {[-1, 1].map((sd) => (
          <group key={sd} position={[0.42 * sd, 0.52, 0]} rotation={[0, 0, -0.42 * sd]} scale={[1, 1, 0.55]}>
            <mesh>
              <coneGeometry args={[0.28, 0.56, 16]} />
              <Std color={mustard} />
            </mesh>
            <mesh position={[0, -0.06, 0.14]} scale={[0.55, 0.6, 0.5]}>
              <coneGeometry args={[0.28, 0.56, 16]} />
              <Std color="#c9443a" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.2, 0.5]} scale={[1.15, 0.72, 0.7]}>
          <sphereGeometry args={[0.3, 24, 16]} />
          <Std color={cream} />
        </mesh>
        <mesh position={[0, -0.08, 0.68]} scale={[1.2, 0.8, 0.8]}>
          <sphereGeometry args={[0.075, 14, 10]} />
          <Std color="#b8322c" />
        </mesh>
        <group ref={eyes} position={[0, 0.08, 0.56]}>
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[x, 0, 0]} scale={[0.85, 1.25, 0.6]}>
              <sphereGeometry args={[0.12, 14, 10]} />
              <Std color="#1c2a44" rough={0.4} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  )
}

function YarnBall() {
  const g = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 1 : 0)
  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    if (g.current && !POSTER) g.current.rotation.z = Math.sin(t.current * 0.8) * 0.06
  })
  const wood = '#d39a52'
  return (
    <group ref={g} position={[1.9, 0.62, 1.0]}>
      <mesh>
        <sphereGeometry args={[0.62, 40, 28]} />
        <Std color="#86b4dc" />
      </mesh>
      {/* a few wraps of yarn around it */}
      {[0.3, 1.2, 2.2].map((a, i) => (
        <mesh key={i} rotation={[a, a * 0.7, 0.4 * i]}>
          <torusGeometry args={[0.62, 0.035, 8, 64]} />
          <Std color="#6f9fca" />
        </mesh>
      ))}
      {/* needles stuck through */}
      {[
        [0.32, 0.4],
        [-0.42, -0.3],
      ].map(([rz, ry], i) => (
        <group key={i} rotation={[0.25, ry, rz]}>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.085, 0.085, 2.1, 12]} />
            <Std color={wood} rough={0.5} />
          </mesh>
          <mesh position={[0, 1.65, 0]}>
            <sphereGeometry args={[0.17, 14, 10]} />
            <Std color={i ? '#2d6b4a' : '#c8352c'} rough={0.4} />
          </mesh>
          <mesh position={[0, -0.47, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.085, 0.22, 12]} />
            <Std color={wood} rough={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Tree() {
  const star = useRef<THREE.Mesh>(null)
  useFrame((_, raw) => {
    if (star.current && !POSTER) star.current.rotation.y += Math.min(raw, 1 / 30) * 1.2
  })
  return (
    <group position={[-2.05, 0, -0.6]}>
      {[
        [0.95, 1.0, 0.55],
        [0.75, 0.85, 1.15],
        [0.52, 0.7, 1.7],
      ].map(([r, h, y], i) => (
        <mesh key={i} position={[0, y, 0]}>
          <coneGeometry args={[r, h, 28]} />
          <Std color="#2f7a50" />
        </mesh>
      ))}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.3, 14]} />
        <Std color="#7a4a2c" />
      </mesh>
      <mesh ref={star} position={[0, 2.2, 0]} rotation={[0, 0, 0]}>
        <octahedronGeometry args={[0.2, 0]} />
        <Std color="#f0b43a" rough={0.4} />
      </mesh>
      {[
        [0.42, 0.75, 0.62],
        [-0.38, 1.2, 0.5],
        [0.26, 1.55, 0.4],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.1, 12, 8]} />
          <Std color={i === 1 ? '#f0b43a' : '#c8352c'} rough={0.4} />
        </mesh>
      ))}
    </group>
  )
}

function Scene({ ry, rx, onReady }: { ry: MotionValue<number>; rx: MotionValue<number>; onReady: () => void }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 0.6 : 0)
  useFrame((_, raw) => {
    t.current += Math.min(raw, 1 / 30)
    const W = size.width
    const H = size.height
    const A = areaFor(W, H)
    const SPAN = 4.7
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const D = (SPAN * H) / (Math.min(A.h, A.w * 0.9) * 2 * tan)
    camera.position.set(0, 1.3, D)
    camera.lookAt(0, 1.05, 0)
    camera.setViewOffset(W, H, -(A.x + A.w / 2 - W / 2), -(A.y + A.h / 2 - H / 2), W, H)
    if (spin.current) {
      const s = t.current
      const k = POSTER ? 0 : 1
      spin.current.rotation.set(0.12 + rx.get(), -0.18 + ry.get() + Math.sin(s * 0.25) * 0.28 * k, 0)
    }
  })
  return (
    <>
      <hemisphereLight args={['#fff8ee', '#d9cbb4', 0.9]} />
      <directionalLight position={[-4, 5, 6]} intensity={2.6} />
      <directionalLight position={[5, 1, -2]} intensity={0.6} />
      <group ref={content} visible={ready}>
        <group ref={spin}>
          {/* cushion */}
          <mesh position={[0, 0.32, 0]} scale={[1.75, 0.42, 1.25]}>
            <sphereGeometry args={[1, 48, 24]} />
            <Std color="#c63a30" />
          </mesh>
          <Cat />
          <YarnBall />
          <Tree />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ loose yarn end (DOM) */

function YarnEnd({ color, hem }: { color: string; hem: number }) {
  const base = useRef<SVGPathElement>(null)
  const ply = useRef<SVGPathElement>(null)
  const fuzz = useRef<SVGPathElement>(null)
  const tip = useRef<SVGGElement>(null)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const x0 = vp.w < 760 ? vp.w * 0.88 : Math.max(40, vp.w * 0.045)
    const y0 = vp.h - hem - 44
    const L = hem + 22
    const tick = () => {
      const s = (performance.now() - t0) / 1000
      const sw = POSTER ? 0.2 : Math.sin(s * 1.25) * 0.32 + Math.sin(s * 2.7) * 0.06
      // a hanging strand: anchored, bends with the sway, the free end lags behind
      const a1 = sw * 0.5
      const a2 = sw * 1.1 + Math.sin(s * 1.25 - 0.8) * 0.12
      const x1 = x0 + Math.sin(a1) * L * 0.45 + 6
      const y1 = y0 + Math.cos(a1) * L * 0.45
      const x2 = x1 + Math.sin(a2) * L * 0.55
      const y2 = y1 + Math.cos(a2) * L * 0.55
      const d = `M${x0} ${y0} C${x0 + 8} ${y0 + 10}, ${x1 - (x2 - x0) * 0.25} ${y1 - 10}, ${x1} ${y1} S${x2 - Math.sin(a2) * 10} ${y2 - 12}, ${x2} ${y2}`
      base.current?.setAttribute('d', d)
      ply.current?.setAttribute('d', d)
      fuzz.current?.setAttribute('d', d)
      tip.current?.setAttribute('transform', `translate(${x2} ${y2}) rotate(${(-a2 * 180) / Math.PI})`)
      if (!POSTER) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [vp, hem])
  return (
    <svg className="kn-yarn" width={vp.w} height={vp.h} aria-hidden>
      <defs>
        <filter id="kn-fuzz" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="5" />
        </filter>
      </defs>
      <path ref={fuzz} fill="none" stroke={color} strokeWidth={9} strokeLinecap="round" opacity={0.35} filter="url(#kn-fuzz)" />
      <path ref={base} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" />
      <path ref={ply} fill="none" stroke="rgba(255,255,255,.32)" strokeWidth={7} strokeDasharray="2 3.4" />
      <g ref={tip}>
        {[-0.5, 0, 0.45].map((a, i) => (
          <path key={i} d={`M0 0 q${a * 5} 5 ${a * 9} ${9 - Math.abs(a) * 2}`} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" opacity={0.85} />
        ))}
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ page */

export default function Knitwear() {
  const fx = useMemo(() => createKnitEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo<StylizeEffect[]>(() => [fx], [fx])
  const [mode, setMode] = useState<KnitMode>('fairisle')
  const [size, setSize] = useState(1)
  const [mobile] = useState(MOBILE)
  const [hem, setHem] = useState(() => hemFor(window.innerWidth))
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())
  const first = useRef(true)

  useEffect(() => {
    setKnitMotif(fx, true)
    const on = () => {
      const h = hemFor(window.innerWidth)
      setHem(h)
      setKnitHem(fx, h)
    }
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fx])
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setKnitMode(fx, mode)
  }, [fx, mode])
  useEffect(() => setKnitStitch(fx, SIZES[size].v), [fx, size])

  // idle: cycle through the yarns (each one is knitted in from the bottom)
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => knitModes[(knitModes.findIndex((x) => x.id === m) + 1) % knitModes.length].id)
    }, 9000)
    return () => window.clearInterval(id)
  }, [])

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const home = useRef<number | undefined>(undefined)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    window.clearTimeout(home.current)
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.007, -1.4, 1.4))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.35, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.3, timeConstant: 520, min: -1.4, max: 1.4, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.25, timeConstant: 400, min: -0.35, max: 0.35, bounceStiffness: 160, bounceDamping: 18 }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12 }), animate(rx, 0, { type: 'spring', stiffness: 30, damping: 12 })]
    }, 4500)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const pal = KNIT_PALETTES[mode]
  const label = knitModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage kn${split.open ? ' kn-split' : ''}`}
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 1.3, 14], fov: 26 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={BG} preload={preload} />
        <Scene ry={ry} rx={rx} onReady={() => !POSTER && knitIn(fx, 2.8)} />
      </Canvas>

      <YarnEnd color={pal[1]} hem={hem} />

      <div className="overlay">
        <div className="hero-copy kn-copy">
          <motion.div className="kn-patch" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Knitwear · 8 色毛线
            </p>
            <h1>
              一针一针，
              <br />
              织成毛衣
            </h1>
            <p className="kn-sub">画面先排成针目格子，每一针只取一种毛线颜色，像提花图表那样；V 形线圈带着捻度、绒毛和一点点松紧不匀，圆滚滚的东西会鼓起来，像毛线玩偶。</p>
            <div className="kn-spec">
              <div className="kn-balls" aria-hidden>
                {pal.map((c, i) => (
                  <motion.i key={c} layout initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.035, type: 'spring', stiffness: 420, damping: 24 }} style={{ background: c }} />
                ))}
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {NOTE[mode]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg
            items={knitModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(m) => {
              poke()
              setMode(m)
            }}
          />
          <span className="dock-sep" />
          {mobile ? (
            <button
              className="seg kn-cycle"
              onClick={() => {
                poke()
                setSize((d) => (d + 1) % SIZES.length)
              }}
            >
              <span>
                针目 <b>{SIZES[size].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="kn-lab">针目</span>
              <Seg
                items={SIZES.map((d, i) => ({ value: i, label: d.zh }))}
                value={size}
                onChange={(v) => {
                  poke()
                  setSize(v)
                }}
              />
            </>
          )}
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              poke()
              knitIn(fx, 2.4)
            }}
          >
            <span>织起来</span>
          </button>
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="kn-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动 · 换线会从下往上重新织</p>
      </div>
    </div>
  )
}

const css = `
.kn { cursor: grab; touch-action: none; }
.kn:active { cursor: grabbing; }
.kn canvas { display: block; }
.kn-yarn { position: absolute; left: 0; top: 0; pointer-events: none; }
.kn-copy { pointer-events: none !important; }
.kn .hint { transition: opacity .4s; bottom: 78px; padding: 6px 11px; border-radius: 999px; background: rgba(250,245,236,.86); color: #4a4038; }
.kn-split .hint { opacity: 0; }
.kn-patch {
  position: relative; margin-left: -28px; padding: 26px 28px 24px; border-radius: 10px;
  background:
    repeating-linear-gradient(90deg, rgba(120,90,60,.035) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(0deg, rgba(120,90,60,.03) 0 1px, transparent 1px 3px),
    #f7f0e3;
  box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 14px 30px -14px rgba(70,45,20,.45), 0 2px 6px rgba(70,45,20,.18);
  transform: rotate(-0.6deg);
}
.kn-patch::before {
  content: ''; position: absolute; inset: 8px; border-radius: 6px; pointer-events: none;
  border: 2px dashed rgba(200,53,44,.55);
}
.kn-copy .kicker { margin-bottom: 14px; }
.kn-copy .kicker i { background: #c8352c; }
.kn-copy h1 { font-size: clamp(36px, 4vw, 54px); }
.kn-sub { max-width: 390px; margin-top: 14px !important; font-size: 15px !important; }
.kn-spec { margin-top: 18px; min-height: 60px; }
.kn-balls { display: flex; gap: 6px; }
.kn-balls i {
  width: 22px; height: 22px; border-radius: 50%;
  background-image:
    repeating-linear-gradient(62deg, rgba(255,255,255,.22) 0 1.5px, transparent 1.5px 4px),
    repeating-linear-gradient(-28deg, rgba(0,0,0,.12) 0 1px, transparent 1px 5px) !important;
  background-blend-mode: normal;
  box-shadow: inset -3px -4px 6px rgba(0,0,0,.22), 0 2px 4px rgba(60,40,20,.18);
}
.kn-spec p { margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.kn-lab { font: 500 12px/1 var(--mono); color: var(--fg-2); margin: 0 2px 0 8px; }
.kn-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.kn-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .kn-copy { transition: opacity .4s; bottom: 128px; }
  .kn-patch { margin-left: -6px; padding: 18px 18px 16px; }
  .kn-split .kn-copy { opacity: 0; }
  .kn-sub { display: none; }
  .kn-copy h1 { font-size: 34px; }
  .kn-spec { margin-top: 12px; min-height: 0; }
  .kn-balls i { width: 16px; height: 16px; }
  .kn .dock { bottom: 64px; }
  .kn .dock .seg { padding: 0 8px; }
  .kn .dock .dock-sep { margin: 0 1px; }
}
`
