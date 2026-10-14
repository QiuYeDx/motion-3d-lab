import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import {
  createReinigerEffect,
  reinigerMeta,
  reinigerModes,
  setReinigerDepth,
  setReinigerDunes,
  setReinigerFilm,
  setReinigerLace,
  setReinigerMode,
  setReinigerPan,
  type ReinigerMode,
} from './effects/reiniger'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import * as ART from './silhouetteArt'

/*
 * 剪影动画 showcase — a scene from a Reiniger-style fairy tale on a multiplane stand: a prince on a flying carpet
 * crosses the sky in front of a palace, a palm grove and a far city, each on its own glass plane (nearer =
 * black, farther = lighter grey in the tint). The camera dollies, so the planes slide past each other; a winged
 * horse and a flock of birds cross now and then; the lantern swings. Every piece is a flat cut-out (canvas
 * alpha, ./silhouetteArt.ts); the effect (./effects/reiniger.ts) turns them into black paper, grows the lacy
 * edges, tints the film and adds the projector's flicker. Opens on an intertitle.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const FOV = 30
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const CYCLE_EVERY = 13000

// multiplane: distance of each glass plane from the camera (the effect's haze steps sit at 10 → 36)
const D = { fg: 6.5, carpet: 9, grove: 18.67, palace: 27.33, city: 36 }

const ACTS: Record<ReinigerMode, { act: string; title: string; en: string; note: string }> = {
  amber: { act: '第一幕', title: '飞毯', en: 'The Flying Carpet', note: '琥珀色片 · 白昼' },
  night: { act: '第二幕', title: '月夜', en: 'By Moonlight', note: '蓝色片 · 夜景' },
  rose: { act: '第三幕', title: '宫殿', en: 'The Palace', note: '玫瑰色片 · 抒情' },
}

/* ------------------------------------------------------------------ cut-out textures (built in stages) */

type ArtKey = 'city' | 'palace' | 'grove' | 'fg' | 'vine' | 'lantern' | 'carpet' | 'rider' | 'arm' | 'cloak' | 'horse' | 'wing' | 'bird'
const BUILD: [ArtKey, () => HTMLCanvasElement][] = [
  ['carpet', () => ART.drawCarpet()],
  ['rider', () => ART.drawRider()],
  ['arm', () => ART.drawArm()],
  ['cloak', () => ART.drawCloak()],
  ['palace', () => ART.drawPalace()],
  ['grove', () => ART.drawGrove()],
  ['city', () => ART.drawSkyline()],
  ['fg', () => ART.drawForeground()],
  ['vine', () => ART.drawVine()],
  ['lantern', () => ART.drawLantern()],
  ['horse', () => ART.drawHorse()],
  ['wing', () => ART.drawWing()],
  ['bird', () => ART.drawBird()],
]
// the paper's own colour only picks the ornament family the effect grows on its edges
const HUE: Record<ArtKey, string> = {
  city: '#c2412d', // lace
  palace: '#6a4fd0', // curls
  grove: '#3f8f3a', // leaves
  fg: '#3f8f3a',
  vine: '#0a0a0a',
  lantern: '#e8b020', // tassels
  carpet: '#0a0a0a',
  rider: '#0a0a0a', // plain: figures keep a clean outline
  arm: '#0a0a0a',
  cloak: '#d03a2a',
  horse: '#0a0a0a',
  wing: '#8a8a8a',
  bird: '#0a0a0a',
}

type Art = Partial<Record<ArtKey, THREE.MeshBasicMaterial>>

const paperMat = (map: THREE.Texture | null, color: string) =>
  new THREE.MeshBasicMaterial({ map, color, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide })

function useArt() {
  const gl = useThree((s) => s.gl)
  const [art, setArt] = useState<Art>({})
  useEffect(() => {
    let dead = false
    let i = 0
    const made: THREE.Texture[] = []
    const step = () => {
      if (dead || i >= BUILD.length) return
      const [key, draw] = BUILD[i++]
      const tex = new THREE.CanvasTexture(draw())
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 4
      gl.initTexture(tex)
      made.push(tex)
      setArt((a) => ({ ...a, [key]: paperMat(tex, HUE[key]) }))
      setTimeout(step, 40)
    }
    step()
    return () => {
      dead = true
      made.forEach((t) => t.dispose())
    }
  }, [gl])
  return art
}

/** a cut-out plane: width w (layer units), height from the texture's aspect; pivot offset (px, py) in plane units */
function Piece({ mat, w, pivot = [0, 0], position = [0, 0, 0] }: { mat?: THREE.MeshBasicMaterial; w: number; pivot?: [number, number]; position?: [number, number, number] }) {
  if (!mat?.map) return null
  const img = mat.map.image as HTMLCanvasElement
  const h = (w * img.height) / img.width
  return (
    <mesh material={mat} position={[position[0] + pivot[0] * w, position[1] + pivot[1] * h, position[2]]}>
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ scene */

function Layer({ depth, children, at }: { depth: number; children: React.ReactNode; at: React.RefObject<THREE.Group | null> }) {
  const k = depth * TAN
  return (
    <group ref={at} position={[0, 0, -depth]} scale={k}>
      {children}
    </group>
  )
}

function Film({ fx, pan, onReady }: { fx: StylizeEffect; pan: MotionValue<number>; onReady: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const art = useArt()
  // warm the cut-out program (map + alpha-to-coverage, double sided) before the first piece appears
  const proto = useRef<THREE.Group>(null)
  const protoMat = useMemo(() => {
    const t = new THREE.CanvasTexture(document.createElement('canvas'))
    return paperMat(t, '#fff')
  }, [])
  usePrecompiled(proto, onReady)

  const L = {
    fg: useRef<THREE.Group>(null),
    carpet: useRef<THREE.Group>(null),
    grove: useRef<THREE.Group>(null),
    palace: useRef<THREE.Group>(null),
    city: useRef<THREE.Group>(null),
  }
  const carpet = useRef<THREE.Group>(null)
  const carpetMesh = useRef<THREE.Mesh>(null)
  const rider = useRef<THREE.Group>(null)
  const arm = useRef<THREE.Group>(null)
  const cloak = useRef<THREE.Group>(null)
  const horse = useRef<THREE.Group>(null)
  const wingN = useRef<THREE.Group>(null)
  const wingF = useRef<THREE.Group>(null)
  const birds = useRef<THREE.Group>(null)
  const lantern = useRef<THREE.Group>(null)
  const vine = useRef<THREE.Group>(null)
  const laceK = useRef(0)
  const t = useRef(POSTER ? 6.4 : 0)

  // the carpet ripples: a plane with segments, displaced in y each frame
  const carpetGeo = useMemo(() => new THREE.PlaneGeometry(1, 0.25, 28, 2), [])
  const carpetBase = useMemo(() => Float32Array.from(carpetGeo.attributes.position.array as Float32Array), [carpetGeo])
  useEffect(() => () => carpetGeo.dispose(), [carpetGeo])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    const s = t.current
    const aspect = size.width / size.height
    const mobile = size.width < 760

    // camera dolly: a slow drift + the visitor's drag
    const p = (POSTER ? 0 : (Math.sin(s * 0.07) * 1.1 + Math.sin(s * 0.023) * 0.6) * (mobile ? 0.3 : 1)) + pan.get()
    camera.position.set(p, 0, 0)
    camera.rotation.set(0, 0, 0)
    if (camera.fov !== FOV) {
      camera.fov = FOV
      camera.updateProjectionMatrix()
    }
    setReinigerPan(fx, p * 0.35)
    // ornaments are sized in CSS px: on a phone the cut-outs are smaller, so the lace is finer too
    const lace = mobile ? 1.05 : 1.45
    if (laceK.current !== lace) {
      laceK.current = lace
      setReinigerLace(fx, lace)
    }

    // layout per layer (in that layer's units: 1 = half the screen height)
    // phones: the copy sits at the bottom, so the set is smaller and lifted
    const place = (g: THREE.Group | null, depth: number, x: number, y: number, m = 1) => {
      if (!g) return
      const k = depth * TAN
      g.position.set(x * k, y * k, -depth)
      g.scale.setScalar(k * m)
    }
    if (mobile) {
      place(L.city.current, D.city, -0.1, 0.02, 0.7)
      place(L.palace.current, D.palace, -0.4, 0.06, 0.62)
      place(L.grove.current, D.grove, 0, 0.06, 0.8)
      place(L.fg.current, D.fg, 0, 0)
      place(L.carpet.current, D.carpet, 0, 0.3)
    } else {
      place(L.city.current, D.city, 0, -0.3)
      place(L.palace.current, D.palace, 0.05, -0.02)
      place(L.grove.current, D.grove, 0, 0.05)
      place(L.fg.current, D.fg, 0, 0)
      place(L.carpet.current, D.carpet, 0, 0)
    }

    // the flight: a lazy figure-of-eight across the right of the frame
    const cx = POSTER ? 0.15 : mobile ? 0 : aspect * 0.32
    const amp = mobile ? 0.12 : 0.45
    const fxp = cx + amp * Math.sin(s * 0.19)
    const fyp = 0.16 + 0.1 * Math.sin(s * 0.38) + 0.025 * Math.sin(s * 1.3)
    const sc = mobile ? 0.62 : 1
    if (carpet.current) {
      carpet.current.position.set(fxp, fyp, 0)
      carpet.current.rotation.z = 0.06 * Math.cos(s * 0.38) - 0.03
      carpet.current.scale.setScalar(sc)
    }
    // ripple travelling back along the carpet
    const pos = carpetGeo.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const x = carpetBase[i]
      const env = 0.35 + 0.65 * Math.abs(x * 2)
      arr[i + 1] = carpetBase[i + 1] + Math.sin(x * 11 - s * 4.2) * 0.022 * env
    }
    pos.needsUpdate = true
    const bob = Math.sin(-0.08 * 11 - s * 4.2) * 0.022 * 0.5
    if (rider.current) rider.current.position.set(-0.07, 0.235 + bob, 0.002)
    if (arm.current) arm.current.rotation.z = 0.28 + 0.22 * Math.sin(s * 0.7) + 0.05 * Math.sin(s * 2.3)
    if (cloak.current) {
      cloak.current.rotation.z = -0.05 + 0.05 * Math.sin(s * 6.1)
      cloak.current.scale.set(1 + 0.05 * Math.sin(s * 7.3), 1 + 0.04 * Math.sin(s * 5.1 + 1), 1)
    }

    // a winged horse crosses the grove plane every ~24 s, right → left
    if (horse.current) {
      const period = 24
      const u = POSTER ? 0.62 : ((s + 9) % period) / 14
      const visible = u <= 1
      horse.current.visible = visible
      if (visible) {
        const span = aspect + 1.2
        horse.current.position.set(span - u * span * 2 + (mobile ? 0 : 0.3), 0.42 + 0.06 * Math.sin(s * 1.7) + (1 - u) * 0.08, 0)
        horse.current.rotation.z = 0.05 * Math.sin(s * 1.7 + 1)
        const flap = Math.sin(s * 4.6)
        if (wingN.current) wingN.current.rotation.z = 0.15 + flap * 0.6
        if (wingF.current) wingF.current.rotation.z = 0.3 + Math.sin(s * 4.6 - 0.35) * 0.55
      }
    }
    // a flock on the palace plane, drifting left
    if (birds.current) {
      const span = aspect * 1.4 + 1.6
      const u = POSTER ? 0.4 : ((s * 0.035 + 0.3) % 1)
      birds.current.position.set(span / 2 - u * span, 0.55 + 0.04 * Math.sin(s * 0.5), 0)
      birds.current.children.forEach((b, i) => {
        b.scale.y = 0.3 + 0.7 * Math.cos(s * (5.2 + i * 0.4) + i * 1.7)
      })
    }
    if (lantern.current) {
      lantern.current.position.set(aspect - (mobile ? 0.09 : 0.34), mobile ? 1.04 : 1.0, 0)
      lantern.current.rotation.z = 0.07 * Math.sin(s * 1.05)
    }
    if (vine.current) {
      vine.current.visible = !mobile
      vine.current.position.set(aspect - 0.42, 0.74, 0)
    }
  })

  const birdsAt: [number, number, number][] = [
    [0, 0, 0.1],
    [0.13, 0.05, 0.08],
    [0.24, -0.03, 0.09],
    [0.32, 0.07, 0.07],
    [0.42, 0.01, 0.075],
    [-0.12, 0.08, 0.07],
  ]

  return (
    <>
      <group ref={proto} visible={false}>
        <mesh material={protoMat}>
          <planeGeometry args={[0.01, 0.01]} />
        </mesh>
      </group>
      <Layer depth={D.city} at={L.city}>
        <Piece mat={art.city} w={5.6} position={[0, -0.25, 0]} />
      </Layer>
      <Layer depth={D.palace} at={L.palace}>
        <Piece mat={art.palace} w={5.6} position={[0, -0.03, 0]} />
        <group ref={birds}>
          {birdsAt.map(([x, y, w], i) => (
            <group key={i} position={[x, y, 0]}>
              <Piece mat={art.bird} w={w} />
            </group>
          ))}
        </group>
      </Layer>
      <Layer depth={D.grove} at={L.grove}>
        <Piece mat={art.grove} w={5.8} position={[0, -0.13, 0]} />
        <group ref={horse} visible={false} scale={0.9}>
          {/* far wing behind the body, near wing in front */}
          <group ref={wingF} position={[0.03, 0.06, -0.02]}>
            <Piece mat={art.wing} w={0.36} pivot={[0.5, 0.5]} />
          </group>
          <Piece mat={art.horse} w={0.7} />
          <group ref={wingN} position={[0, 0.04, 0.02]}>
            <Piece mat={art.wing} w={0.4} pivot={[0.5, 0.5]} />
          </group>
        </group>
      </Layer>
      <Layer depth={D.carpet} at={L.carpet}>
        <group ref={carpet}>
          {art.carpet && <mesh ref={carpetMesh} geometry={carpetGeo} material={art.carpet} />}
          <group ref={rider}>
            <group ref={cloak} position={[-0.02, 0.02, -0.004]}>
              <Piece mat={art.cloak} w={0.26} pivot={[-0.5, -0.1]} />
            </group>
            <Piece mat={art.rider} w={0.4} />
            <group ref={arm} position={[0.035, 0.005, 0.004]}>
              <Piece mat={art.arm} w={0.19} pivot={[0.47, 0]} />
            </group>
          </group>
        </group>
      </Layer>
      <Layer depth={D.fg} at={L.fg}>
        <Piece mat={art.fg} w={6} position={[0, -0.31, 0]} />
        <group ref={vine}>
          <Piece mat={art.vine} w={1.05} />
        </group>
        <group ref={lantern}>
          <Piece mat={art.lantern} w={0.13} pivot={[0, -0.5]} />
        </group>
      </Layer>
    </>
  )
}

/* ------------------------------------------------------------------ intertitle */

function Intertitle({ act, onDone }: { act: (typeof ACTS)[ReinigerMode]; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2600)
    return () => clearTimeout(id)
  }, [onDone])
  return (
    <motion.div
      className="sf-card"
      initial={{ opacity: 1 }}
      exit={{ opacity: [1, 0.86, 1, 0], transition: { duration: 0.75, times: [0, 0.2, 0.35, 1] } }}
      onPointerDown={onDone}
    >
      <div className="sf-card-in">
        <svg className="sf-frame" viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden>
          <rect x="6" y="6" width="388" height="228" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <rect x="13" y="13" width="374" height="214" rx="2" fill="none" stroke="currentColor" strokeWidth="0.6" />
        </svg>
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <svg key={c} className={`sf-corner ${c}`} viewBox="0 0 60 60" aria-hidden>
            <path d="M4 56 C4 26 26 4 56 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 56 C12 32 32 12 56 12" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <path d="M20 40 c-8 -2 -10 -12 -2 -14 c6 -1 8 6 3 8" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M40 20 c-2 -8 -12 -10 -14 -2 c-1 6 6 8 8 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="26" cy="26" r="3" fill="currentColor" />
            <path d="M26 26 L8 8" stroke="currentColor" strokeWidth="1" />
          </svg>
        ))}
        <p className="sf-card-act">{act.act}</p>
        <h2>{act.title}</h2>
        <i className="sf-rule" />
        <p className="sf-card-en">{act.en}</p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ page */

export default function SilhouetteFilm() {
  const [mode, setMode] = useState<ReinigerMode>('amber')
  const [film, setFilm] = useState(true)
  const [card, setCard] = useState(!POSTER)
  const fx = useMemo(() => {
    const f = createReinigerEffect()
    setReinigerDepth(f, 10, 36, 3, 0.78)
    setReinigerDunes(f, 0)
    setReinigerLace(f, 1.45)
    return f
  }, [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())

  useEffect(() => setReinigerMode(fx, mode), [fx, mode])
  useEffect(() => setReinigerFilm(fx, film ? 1 : 0.12), [fx, film])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 14000 || splitOpen.current) return
      setMode((m) => reinigerModes[(reinigerModes.findIndex((o) => o.id === m) + 1) % reinigerModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  // drag: dolly the camera along the multiplane stand (nearer planes slide faster)
  const pan = useMotionValue(0)
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob, .sf-card')) return
    anim.current?.stop()
    drag.current = { x: e.clientX, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    pan.set(THREE.MathUtils.clamp(pan.get() - (e.clientX - d.x) * 0.006, -2.4, 2.4))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(pan, pan.get(), { type: 'inertia', velocity: pan.getVelocity(), power: 0.5, timeConstant: 700, min: -2.4, max: 2.4, bounceStiffness: 120, bounceDamping: 20 })
  }
  useEffect(() => () => anim.current?.stop(), [])

  // mount the WebGL canvas a moment after the stage DOM (the intertitle paints first)
  const [go, setGo] = useState(POSTER)
  useEffect(() => {
    const id = window.setTimeout(() => setGo(true), 260)
    return () => clearTimeout(id)
  }, [])
  const [ready, setReady] = useState(false)

  const A = ACTS[mode]
  const label = reinigerModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage sf sf-${mode}${split.open ? ' sf-split' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      {go && (
        <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 0], fov: FOV, near: 0.5, far: 80 }}>
          <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={reinigerMeta.background} preload={preload} />
          <Film fx={fx} pan={pan} onReady={() => setReady(true)} />
        </Canvas>
      )}

      <div className="overlay">
        <div className="hero-copy sf-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: POSTER ? 0 : 2.4, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Silhouette Film · 1926
            </p>
            <h1>
              黑纸剪出的
              <br />
              一千零一夜
            </h1>
            <p className="sf-sub">
              每样东西都成了剪刀剪出的黑纸：边上长出叶片、花边、卷须和流苏，身上打着一排排小孔。远处的纸层更淡，像隔着几层薄纱；整格画面染成默片的颜色，带着闪烁、划痕和抖动。
            </p>
            <div className="sf-act">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>
                    {A.act} · {A.title}
                  </b>
                  {A.note}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={reinigerModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          <button className="seg sf-btn" aria-pressed={film} onClick={() => setFilm((f) => !f)}>
            {film && <motion.span layoutId="sf-film" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>{MOBILE ? '胶片' : '胶片质感'}</span>
          </button>
          <button className="seg sf-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="sf-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动平移镜头 · 闲置时自动换幕</p>
      </div>

      <AnimatePresence>{card && <Intertitle act={ACTS.amber} onDone={() => setCard(false)} />}</AnimatePresence>
      {!ready && !card && <div className="sf-wait" />}
    </div>
  )
}

const css = `
.sf { background: #0d0906; cursor: grab; touch-action: none; }
.sf:active { cursor: grabbing; }
.sf canvas { display: block; }
.sf-copy { pointer-events: none !important; --soft-bg: #120b06; }
.sf-night .sf-copy { --soft-bg: #03070f; }
.sf-rose .sf-copy { --soft-bg: #13050b; }
.sf-copy .scrim { opacity: .62; }
.sf-split .sf-copy .scrim { opacity: .9; }
.sf-copy .kicker { color: rgba(250, 232, 200, .72); }
.sf-copy .kicker i { background: #e8a24a; transition: background .8s; }
.sf-night .sf-copy .kicker i { background: #9cc8ea; }
.sf-rose .sf-copy .kicker i { background: #f0a0b0; }
.sf-copy h1 { font-size: clamp(38px, 4.4vw, 60px); color: #fbf0dc; font-family: "Songti SC", "STSong", "SimSun", serif; letter-spacing: .02em; }
.sf-sub { max-width: 410px; color: rgba(251, 240, 220, .74) !important; }
.sf-act { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: rgba(251, 240, 220, .66); }
.sf-act span { display: inline-flex; align-items: center; gap: 10px; }
.sf-act b {
  font-weight: 600; color: #fbf0dc; padding: 0 8px; border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(251, 240, 220, .3);
}
.sf-btn span { display: inline-flex; align-items: center; gap: 6px; }
.sf .hint { color: rgba(251, 240, 220, .6); }
.sf-split .hint { opacity: 0; }
.sf-wait { position: absolute; inset: 0; background: #0d0906; pointer-events: none; }

.sf-card {
  position: absolute; inset: 0; z-index: 5; display: grid; place-items: center;
  background: radial-gradient(120% 90% at 50% 50%, #1d140c 0%, #0b0705 70%);
  color: #e9c88f; cursor: pointer;
}
.sf-card::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .35; mix-blend-mode: screen;
  background-image: repeating-linear-gradient(90deg, transparent 0 37%, rgba(233,200,143,.18) 37.1%, transparent 37.25%, transparent 81%, rgba(233,200,143,.12) 81.1%, transparent 81.2%);
  animation: sf-flick .18s steps(2) infinite;
}
.sf-card-in {
  position: relative; width: min(560px, 84vw); aspect-ratio: 5 / 3; display: grid; place-content: center; text-align: center;
  animation: sf-weave .12s steps(2) infinite;
}
.sf-frame { position: absolute; inset: 0; width: 100%; height: 100%; }
.sf-corner { position: absolute; width: 58px; height: 58px; }
.sf-corner.tl { left: 2px; top: 2px; }
.sf-corner.tr { right: 2px; top: 2px; transform: scaleX(-1); }
.sf-corner.bl { left: 2px; bottom: 2px; transform: scaleY(-1); }
.sf-corner.br { right: 2px; bottom: 2px; transform: scale(-1, -1); }
.sf-card-act { margin: 0; font: 500 15px/1 "Songti SC", "STSong", "SimSun", serif; letter-spacing: .5em; opacity: .8; padding-left: .5em; }
.sf-card h2 { margin: 14px 0 0; font: 400 clamp(46px, 8vw, 72px)/1.1 "Songti SC", "STSong", "SimSun", serif; letter-spacing: .3em; padding-left: .3em; color: #f3dcae; }
.sf-rule { display: block; width: 120px; height: 9px; margin: 16px auto 12px; background:
  radial-gradient(circle, currentColor 0 2.5px, transparent 3px) center / 9px 9px no-repeat,
  linear-gradient(currentColor, currentColor) left center / 50px 1px no-repeat,
  linear-gradient(currentColor, currentColor) right center / 50px 1px no-repeat; opacity: .8; }
.sf-card-en { margin: 0; font: italic 400 14px/1 Georgia, "Times New Roman", serif; letter-spacing: .12em; opacity: .7; }
@keyframes sf-weave { 0% { transform: translate(0, 0); } 100% { transform: translate(.6px, -.8px); } }
@keyframes sf-flick { 0% { opacity: .28; } 100% { opacity: .4; } }

@media (max-width: 760px) {
  .sf-sub { display: none; }
  .sf-copy h1 { font-size: 32px; }
  .sf-act { margin-top: 10px; font-size: 11px; }
  .sf .dock .seg { padding: 0 9px; }
}
`
