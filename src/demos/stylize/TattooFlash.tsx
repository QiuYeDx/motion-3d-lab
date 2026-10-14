import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import { TATTOO_INKS, createTattooEffect, setTattooGeo, setTattooLineScale, setTattooMode, setTattooSkin, tattooMeta, tattooModes, type TattooMode } from './effects/tattoo'

/*
 * 刺青线稿 — a classic flash motif: a rose pierced by a dagger, a "TRUE LOVE" banner wrapped round the blade,
 * a swallow and three stars, all primitives in the flash palette, swaying gently on a tea-stained sheet with
 * pencil notes in the margin (DOM). "上皮肤" shows the same design healed on skin.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const WEIGHTS = [
  { zh: '细', k: 0.7 },
  { zh: '中', k: 1 },
  { zh: '粗', k: 1.4 },
]
const NOTE: Record<TattooMode, string> = {
  traditional: '粗黑描边 · 胡椒点阴影 · 红黄绿平涂',
  blackgrey: '细线 · 灰阶晕染 · 无彩色',
  dotwork: '只用黑点 · 细几何线 · 曼陀罗底纹',
}
const SHORT: Record<TattooMode, string> = { traditional: '传统', blackgrey: '黑灰', dotwork: '点刺' }
type Rect = { x: number; y: number; w: number; h: number }

function areaFor(W: number, H: number): Rect {
  if (POSTER) return { x: 30, y: 30, w: W - 60, h: H - 60 }
  if (W < 760) return { x: 10, y: 74, w: W - 20, h: Math.max(240, H - 74 - 290) }
  const x0 = Math.max(W * 0.37, 500)
  return { x: x0, y: 80, w: W - x0 - 40, h: H - 80 - 100 }
}

/* ------------------------------------------------------------------ geometry */

function shapeGeo(pts: [number, number][], depth: number, bevel: number, curve = true) {
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  if (curve) s.splineThru(pts.slice(1).map(([x, y]) => new THREE.Vector2(x, y)))
  else pts.slice(1).forEach(([x, y]) => s.lineTo(x, y))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 24 })
  g.translate(0, 0, -depth / 2)
  g.computeVertexNormals()
  return g
}

function bladeGeo() {
  // a straight double-edged blade, point down; the bevel gives it a lit and a shaded facet
  const s = new THREE.Shape()
  s.moveTo(-0.17, 0)
  s.lineTo(0.17, 0)
  s.lineTo(0.15, -1.75)
  s.quadraticCurveTo(0.1, -2.15, 0, -2.38)
  s.quadraticCurveTo(-0.1, -2.15, -0.15, -1.75)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.12, bevelSegments: 1, curveSegments: 12 })
  g.translate(0, 0, -0.01)
  g.computeVertexNormals()
  return g
}

function leafGeo() {
  return shapeGeo(
    [
      [0, 0],
      [0.18, 0.16],
      [0.26, 0.42],
      [0.18, 0.7],
      [0, 0.9],
      [-0.18, 0.7],
      [-0.26, 0.42],
      [-0.18, 0.16],
    ],
    0.02,
    0.03,
  )
}

function wingGeo() {
  // a swept swallow wing, root at the origin, pointing up-back
  return shapeGeo(
    [
      [0, 0],
      [0.26, 0.02],
      [0.56, 0.2],
      [0.88, 0.56],
      [1.0, 0.9],
      [0.76, 0.8],
      [0.48, 0.64],
      [0.22, 0.46],
      [0.0, 0.3],
      [-0.14, 0.14],
    ],
    0.02,
    0.02,
  )
}

function tailGeo() {
  return shapeGeo(
    [
      [0, 0.05],
      [0.3, 0.05],
      [0.62, 0.0],
      [0.95, -0.12],
      [0.62, -0.06],
      [0.3, -0.06],
      [0, -0.05],
    ],
    0.015,
    0.015,
  )
}

function starGeo() {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? 0.42 : 1
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return shapeGeo(pts, 0.1, 0.05, false)
}

/** ribbon with folded, notched ends; canvas lettering */
function bannerParts() {
  const W = 1600
  const H = 220
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, W, H)
  const notch = 70
  c.fillStyle = '#f2e8d0'
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(W, 0)
  c.lineTo(W - notch, H / 2)
  c.lineTo(W, H)
  c.lineTo(0, H)
  c.lineTo(notch, H / 2)
  c.closePath()
  c.fill()
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillStyle = '#16120f'
  c.font = `900 ${H * 0.62}px Georgia, "Times New Roman", "Songti SC", serif`
  c.fillText('TRUE  LOVE', W / 2, H * 0.54)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4

  const geo = new THREE.PlaneGeometry(3.0, 0.4, 96, 2)
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const ax = Math.abs(x)
    let z = 0.16 * Math.cos(x * 1.9)
    let yy = y + 0.07 * Math.sin(x * 2.1)
    // ends fold back and down behind the ribbon
    if (ax > 1.12) {
      const t = ax - 1.12
      z -= t * 0.9
      yy -= t * 0.35
    }
    p.setXYZ(i, x, yy, z)
  }
  geo.computeVertexNormals()
  return { tex, geo }
}

/* ------------------------------------------------------------------ motif */

function makeMats(banner: THREE.Texture) {
  const std = (color: string, roughness = 0.55, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  return {
    red: std('#c9271f', 0.36),
    redDeep: std('#9e1c16', 0.6),
    green: std('#3a8f42', 0.55),
    steel: std('#d6dce2', 0.32, 0.25),
    steelDark: std('#7c8590', 0.4, 0.2),
    gold: std('#e8ac24', 0.35, 0.2),
    brown: std('#7a4320', 0.6),
    blue: std('#2756b3', 0.45),
    belly: std('#e0462a', 0.5),
    cream: std('#f4ecd9', 0.6),
    black: std('#121012', 0.5),
    star: std('#f0bd28', 0.4),
    banner: new THREE.MeshStandardMaterial({ map: banner, roughness: 0.7, side: THREE.DoubleSide, alphaTest: 0.5 }),
  }
}
type Mats = ReturnType<typeof makeMats>

function Rose({ M }: { M: Mats }) {
  // flash-style rose: five outer petals with rolled lips, a cup with a front lip, a spiral heart
  const outer = useMemo(() => Array.from({ length: 5 }, (_, i) => (i / 5) * Math.PI * 2 + 0.35), [])
  const T = (p: [number, number, number], r: number, tube: number, arc: number, rotZ: number, m: THREE.Material, rotX = 0) => (
    <mesh position={p} rotation={[rotX, 0, rotZ]} material={m} castShadow receiveShadow>
      <torusGeometry args={[r, tube, 14, 40, arc]} />
    </mesh>
  )
  return (
    <group>
      {outer.map((a, i) => (
        <group key={i} rotation={[0, 0, a]}>
          <mesh position={[0.42, 0, -0.04]} scale={[0.26, 0.33, 0.1]} material={M.red} castShadow receiveShadow>
            <sphereGeometry args={[1, 28, 18]} />
          </mesh>
          {/* the rolled lip along the petal's outer edge */}
          {T([0.4, 0, 0.04], 0.26, 0.045, Math.PI * 0.9, -Math.PI * 0.45, M.red)}
        </group>
      ))}
      {/* cup */}
      <mesh position={[0, 0.03, 0.04]} scale={[0.38, 0.34, 0.2]} material={M.red} castShadow receiveShadow>
        <sphereGeometry args={[1, 32, 20]} />
      </mesh>
      {/* front lip of the cup, opening upward */}
      {T([0, 0.02, 0.2], 0.3, 0.07, Math.PI * 1.08, Math.PI * 1.46 - Math.PI * 0.04, M.red, -0.35)}
      {/* spiral heart */}
      {T([0.02, 0.1, 0.24], 0.17, 0.05, Math.PI * 1.3, 0.3, M.red)}
      {T([-0.01, 0.12, 0.29], 0.09, 0.045, Math.PI * 1.5, 2.4, M.red)}
    </group>
  )
}

function Swallow({ M, flap }: { M: Mats; flap: React.RefObject<THREE.Group[]> }) {
  const g = useMemo(() => ({ wing: wingGeo(), tail: tailGeo() }), [])
  useEffect(() => () => Object.values(g).forEach((x) => x.dispose()), [g])
  const S = (p: [number, number, number], s: [number, number, number], m: THREE.Material) => (
    <mesh position={p} scale={s} material={m} castShadow receiveShadow>
      <sphereGeometry args={[1, 28, 18]} />
    </mesh>
  )
  return (
    <group>
      {/* body faces −x (flying left) */}
      {S([0, 0, 0], [0.34, 0.15, 0.15], M.blue)}
      {S([-0.04, -0.06, 0.03], [0.27, 0.1, 0.13], M.belly)}
      {S([-0.33, 0.04, 0], [0.13, 0.12, 0.12], M.blue)}
      {S([-0.36, -0.04, 0.05], [0.09, 0.06, 0.08], M.belly)}
      {S([-0.39, 0.08, 0.1], [0.025, 0.025, 0.02], M.black)}
      <mesh position={[-0.5, 0.03, 0]} rotation={[0, 0, Math.PI / 2]} material={M.black} castShadow>
        <coneGeometry args={[0.035, 0.12, 12]} />
      </mesh>
      {/* tail streamers */}
      <mesh geometry={g.tail} position={[0.28, 0.02, 0.02]} rotation={[0, 0, -0.15]} material={M.blue} castShadow />
      <mesh geometry={g.tail} position={[0.28, 0.0, -0.04]} rotation={[0, 0, -0.45]} material={M.blue} castShadow />
      {/* wings */}
      {[1, -1].map((s, i) => (
        <group
          key={s}
          position={[-0.05, 0.08, s * 0.06]}
          ref={(el) => {
            if (el && flap.current) flap.current[i] = el
          }}
        >
          <mesh geometry={g.wing} rotation={s > 0 ? [0.25, 0, 0.1] : [Math.PI - 0.5, 0, 0.35]} material={M.blue} castShadow receiveShadow />
        </group>
      ))}
    </group>
  )
}

function Motif({ M, flap }: { M: Mats; flap: React.RefObject<THREE.Group[]> }) {
  const geo = useMemo(() => ({ blade: bladeGeo(), leaf: leafGeo(), star: starGeo() }), [])
  const banner = useMemo(bannerParts, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      banner.geo.dispose()
      banner.tex.dispose()
    },
    [geo, banner],
  )
  M.banner.map = banner.tex
  return (
    <group>
      {/* dagger, point down, a little tilted */}
      <group position={[0.05, 0.85, -0.25]} rotation={[0, 0, 0.16]}>
        <mesh geometry={geo.blade} material={M.steel} castShadow receiveShadow />
        <mesh position={[0, -0.95, 0.075]} material={M.steelDark}>
          <boxGeometry args={[0.035, 1.6, 0.01]} />
        </mesh>
        <mesh position={[0, 0.06, 0]} material={M.gold} castShadow receiveShadow>
          <boxGeometry args={[0.96, 0.13, 0.17]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.5, 0.06, 0]} material={M.gold} castShadow>
            <sphereGeometry args={[0.11, 20, 14]} />
          </mesh>
        ))}
        <mesh position={[0, 0.48, 0]} material={M.brown} castShadow receiveShadow>
          <cylinderGeometry args={[0.1, 0.11, 0.72, 24]} />
        </mesh>
        {[0.25, 0.42, 0.59].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.gold} castShadow>
            <torusGeometry args={[0.11, 0.025, 10, 28]} />
          </mesh>
        ))}
        <mesh position={[0, 0.93, 0]} material={M.gold} castShadow>
          <sphereGeometry args={[0.17, 24, 16]} />
        </mesh>
      </group>

      {/* leaves behind the rose */}
      <mesh geometry={geo.leaf} position={[-0.32, -0.28, -0.05]} rotation={[0.25, 0.2, 2.3]} material={M.green} castShadow receiveShadow />
      <mesh geometry={geo.leaf} position={[0.36, -0.22, -0.06]} rotation={[0.25, -0.2, -2.15]} material={M.green} castShadow receiveShadow />
      <mesh geometry={geo.leaf} position={[0.42, 0.34, -0.08]} rotation={[-0.2, -0.3, -0.75]} scale={0.8} material={M.green} castShadow receiveShadow />

      {/* the rose */}
      <group position={[0, 0.05, 0.12]} scale={1.1}>
        <Rose M={M} />
      </group>

      {/* banner round the blade */}
      <mesh geometry={banner.geo} material={M.banner} position={[0.02, -0.92, 0.2]} rotation={[0, 0, 0.04]} castShadow receiveShadow />

      {/* swallow, top right */}
      <group position={[1.02, 1.18, 0.1]} rotation={[0.15, 0.25, 0.3]} scale={0.92}>
        <Swallow M={M} flap={flap} />
      </group>

      {/* filler stars */}
      {(
        [
          [-1.1, 1.25, 0.13],
          [-1.35, 0.55, 0.09],
          [1.25, -0.25, 0.1],
        ] as [number, number, number][]
      ).map(([x, y, s], i) => (
        <mesh key={i} geometry={geo.star} position={[x, y, 0]} rotation={[0.2, -0.3 + i * 0.3, i * 0.4]} scale={s} material={M.star} castShadow receiveShadow />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

function Scene({ ry, rx, fx, weight }: { ry: MotionValue<number>; rx: MotionValue<number>; fx: StylizeEffect; weight: number }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const sway = useRef<THREE.Group>(null)
  const flap = useRef<THREE.Group[]>([])
  const M = useMemo(() => makeMats(new THREE.Texture()), [])
  useEffect(() => () => Object.values(M).forEach((m) => m.dispose()), [M])
  const t = useRef(POSTER ? 0.8 : 0)

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    const W = size.width
    const H = size.height
    const A = areaFor(W, H)
    const SPAN = POSTER ? 3.9 : 4.5
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const D = (SPAN * H) / (Math.min(A.h, A.w * 1.05) * 0.94 * 2 * tan)
    camera.position.set(0, 0, D)
    camera.lookAt(0, 0, 0)
    camera.setViewOffset(W, H, -(A.x + A.w / 2 - W / 2), -(A.y + A.h / 2 - H / 2), W, H)
    // lines are sized in CSS px: a little thinner when the whole sheet is small (phones)
    setTattooLineScale(fx, weight * THREE.MathUtils.clamp(Math.min(A.h, A.w * 1.05) / 680, 0.62, 1.05))
    setTattooGeo(fx, { x: A.x + A.w / 2, y: A.y + A.h / 2, r: Math.min(A.h, A.w * 1.05) * (W < 760 ? 0.4 : 0.44) })
    if (sway.current) {
      const s = t.current
      const k = POSTER ? 0 : 1
      sway.current.rotation.set(rx.get() + Math.sin(s * 0.37) * 0.07 * k, ry.get() + Math.sin(s * 0.5) * 0.2 * k + (POSTER ? 0.1 : 0), Math.sin(s * 0.43 + 1) * 0.035 * k)
      sway.current.position.y = Math.sin(s * 0.6) * 0.04 * k - 0.02
    }
    const f = Math.sin(t.current * 2.4)
    flap.current.forEach((w, i) => w && (w.rotation.x = (i ? -1 : 1) * (0.15 + f * 0.22)))
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#d2c3a8', 0.6]} />
      <directionalLight
        position={[-3.5, 4.5, 5]}
        intensity={3.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-2.6}
        shadow-camera-right={2.6}
        shadow-camera-top={2.6}
        shadow-camera-bottom={-2.6}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[4, 1, 3]} intensity={0.45} />
      <group ref={content} visible={ready}>
        <group ref={sway}>
          <Motif M={M} flap={flap} />
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ margin notes (DOM) */

function Margin({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="tf-margin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
          <div className="tf-stamp">
            <b>FLASH</b>
            <span>No. 27</span>
          </div>
          <div className="tf-price">
            <svg viewBox="0 0 90 56" aria-hidden>
              <path d="M8 30 C6 12, 40 4, 66 8 C88 12, 88 44, 56 50 C30 54, 6 46, 10 26" fill="none" stroke="#5b544c" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span>$40</span>
          </div>
          <div className="tf-note n1">
            玫瑰 + 匕首
            <br />
            <small>"真爱至死"</small>
          </div>
          <div className="tf-note n2">
            bold will hold →
            <br />
            <small>描边 ≥ 1.2mm</small>
          </div>
          <svg className="tf-sketch" viewBox="0 0 120 150" aria-hidden>
            {/* a quick pencil anchor */}
            <g fill="none" stroke="#5b544c" strokeLinecap="round" strokeWidth="1.1" opacity=".85">
              <circle cx="60" cy="18" r="9" />
              <circle cx="61" cy="18.5" r="8.4" opacity=".5" />
              <path d="M60 27 L60 128 M59 28 L61.5 127" />
              <path d="M38 44 L82 44 M39 46 L81 45" />
              <path d="M18 98 C24 128, 50 136, 60 128 C70 136, 96 128, 102 98" />
              <path d="M19 99 C26 126, 52 134, 60 127" opacity=".5" />
              <path d="M10 104 L18 96 L26 104 M94 104 L102 96 L110 104" />
            </g>
            <path d="M14 140 C40 136, 80 138, 108 141" fill="none" stroke="#5b544c" strokeWidth=".8" opacity=".5" strokeDasharray="3 4" />
          </svg>
          <div className="tf-swatches">
            {TATTOO_INKS.slice(0, 5).map((c, i) => (
              <i key={c} style={{ background: c, transform: `rotate(${(i - 2) * 7}deg)`, borderRadius: `${46 + i * 3}% ${54 - i * 2}% ${50 + i * 4}% ${48 - i}% / ${52 - i * 3}% ${47 + i}% ${53 - i * 2}% ${50 + i * 3}%` }} />
            ))}
            <span>色卡 · 红 棕 黄 绿 蓝</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ page */

export default function TattooFlash() {
  const fx = useMemo(() => createTattooEffect({ mode: 'traditional' }), [])
  const orig = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const [mode, setMode] = useState<TattooMode>('traditional')
  const [weight, setWeight] = useState(1)
  const [skin, setSkin] = useState(false)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit()
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const ry = useMotionValue(0)
  const rx = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setTattooMode(fx, mode), [fx, mode])
  useEffect(() => setTattooSkin(fx, skin), [fx, skin])

  // idle: flip through the three styles
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => tattooModes[(tattooModes.findIndex((x) => x.id === m) + 1) % tattooModes.length].id)
    }, 7000)
    return () => window.clearInterval(id)
  }, [])

  // drag to turn the motif; coasts on release, then eases home
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.006, -1.2, 1.2))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.4, 0.4))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.3, timeConstant: 500, min: -1.2, max: 1.2, bounceStiffness: 140, bounceDamping: 18 }),
      animate(rx, rx.get(), { type: 'inertia', velocity: rx.getVelocity(), power: 0.25, timeConstant: 400, min: -0.4, max: 0.4, bounceStiffness: 160, bounceDamping: 18 }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12 }), animate(rx, 0, { type: 'spring', stiffness: 30, damping: 12 })]
    }, 4500)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const Mo = tattooModes.find((m) => m.id === mode)!

  return (
    <div className={`stage tf${skin ? ' on-skin' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 12], fov: 26 }}>
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background={tattooMeta.background} preload={preload} />
        <Scene ry={ry} rx={rx} fx={fx} weight={WEIGHTS[weight].k} />
      </Canvas>

      <div className="overlay">
        <Margin show={!skin && !mobile && !POSTER} />
        <OriginalSplit split={split} label="刺青" />

        <div className="tf-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="tf-kicker">
              <b>TATTOO FLASH</b>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {Mo.en} · {Mo.label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              粗线条
              <br />
              才扎得住
            </h1>
            <p className="tf-sub">老派美式刺青的规矩：一样粗的黑色描边、阴影用针一点点扎出来、只用几种颜色平涂，亮处直接留出皮肤。描边宽度是按到边缘的真实距离画的，所以转起来线条始终一样粗。</p>
            <div className="tf-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={mode} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}>
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={tattooModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          {mobile ? (
            <button
              className="seg"
              onClick={() => {
                poke()
                setWeight((w) => (w + 1) % WEIGHTS.length)
              }}
            >
              <span>线 {WEIGHTS[weight].zh}</span>
            </button>
          ) : (
            <Seg
              items={WEIGHTS.map((w, i) => ({ value: i, label: w.zh }))}
              value={weight}
              onChange={(v) => {
                poke()
                setWeight(v)
              }}
            />
          )}
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={skin}
            onClick={() => {
              poke()
              setSkin((s) => !s)
            }}
          >
            {skin && <motion.span layoutId="tf-skin-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>{mobile ? '皮肤' : '上皮肤'}</span>
          </button>
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="tf-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动图样 · 松手回摆</p>
      </div>
    </div>
  )
}

const css = `
.tf { background: #efe2c8; cursor: grab; touch-action: none; color: #1b1612; }
.tf:active { cursor: grabbing; }
.tf canvas { display: block; }
.tf-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(390px, calc(100% - 48px)); pointer-events: none !important;
}
.tf-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.tf-kicker b { padding: 5px 8px 4px; background: #1b1612; color: #efe2c8; font-weight: 700; border-radius: 2px; box-shadow: 2px 2px 0 #c4281c; }
.tf-kicker span { display: inline-block; opacity: .7; letter-spacing: .06em; }
.tf-copy h1 {
  margin: 0; font: 900 clamp(42px, 4.8vw, 68px)/1.06 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif;
  letter-spacing: -.01em;
}
.tf-sub { margin: 22px 0 0; max-width: 370px; font-size: 15px; line-height: 1.8; opacity: .8; }
.tf-spec { margin-top: 20px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .03em; }
.tf-spec span { display: inline-flex; align-items: center; gap: 8px; }
.tf-spec i { width: 22px; height: 10px; flex: none; border: 2px solid #1b1612; border-radius: 2px; background: radial-gradient(circle, #1b1612 0.9px, transparent 1.2px) 0 0 / 3.5px 3.5px, #c4281c; }
.tf.on-skin .tf-copy { color: #2a1a12; }
.tf .hint { color: #1b1612; opacity: .65; }

.overlay > .tf-margin { position: absolute; inset: 0; pointer-events: none; }
.tf-margin { font-family: 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Kaiti SC', 'KaiTi', cursive; color: #4d463f; }
.tf-stamp {
  position: absolute; right: 56px; top: 92px; transform: rotate(4deg);
  display: flex; flex-direction: column; align-items: center; padding: 6px 12px 5px;
  border: 2px solid rgba(196, 40, 28, .75); color: rgba(196, 40, 28, .82); border-radius: 3px;
  font: 800 12px/1.1 var(--mono); letter-spacing: .18em;
}
.tf-stamp span { font-size: 10px; letter-spacing: .1em; }
.tf-price { position: absolute; right: 64px; top: 150px; width: 84px; height: 52px; display: grid; place-items: center; transform: rotate(-6deg); }
.tf-price svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.tf-price span { font-size: 19px; }
.tf-note { position: absolute; font-size: 13px; line-height: 1.35; }
.tf-note small { font-size: 11px; opacity: .8; }
.tf-note.n1 { left: max(37vw, 500px); top: 104px; transform: rotate(-4deg); }
.tf-note.n2 { left: max(37vw, 500px); bottom: 140px; transform: rotate(-3deg); }
.tf-sketch { position: absolute; right: 70px; bottom: 150px; width: 74px; transform: rotate(8deg); }
.tf-swatches { position: absolute; right: 56px; bottom: 110px; display: flex; align-items: center; gap: 5px; transform: rotate(-2deg); }
.tf-swatches i { width: 16px; height: 13px; opacity: .88; mix-blend-mode: multiply; }
.tf-swatches span { margin-left: 6px; font-size: 11px; }
@media (max-width: 1100px) { .tf-note.n1, .tf-note.n2 { display: none; } }
@media (max-width: 760px) {
  .tf-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .tf-copy h1 { font-size: 36px; }
  .tf-sub, .tf-spec { display: none; }
  .tf-kicker { margin-bottom: 12px; }
  .tf .dock .seg { padding: 0 8px; }
  .tf .dock .dock-sep { margin: 0 2px; }
}
`
