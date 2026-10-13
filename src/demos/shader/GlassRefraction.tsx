import { Environment, Float, Lightformer, MeshTransmissionMaterial, RoundedBox, useFBO } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ material presets */

type Mat = { frost: number; thickness: number; roughness: number; chroma: number; aniso: number; ior: number; distortion: number; dScale: number; tDist: number }
const PRESETS: { key: string; zh: string; en: string; desc: string; m: Mat }[] = [
  { key: 'clear', zh: '清透', en: 'Clear', desc: '低粗糙度与轻微色散，标题在玻璃里被放大、翻转和折弯。', m: { frost: 0, thickness: 0.9, roughness: 0.0, chroma: 0.06, aniso: 0.0, ior: 1.5, distortion: 0, dScale: 0.3, tDist: 0 } },
  { key: 'frost', zh: '磨砂', en: 'Frosted', desc: '折射源换成预模糊的背景，再叠一点粗糙度，像喷砂玻璃。', m: { frost: 1, thickness: 1.4, roughness: 0.08, chroma: 0.04, aniso: 0.05, ior: 1.3, distortion: 0.05, dScale: 0.3, tDist: 0 } },
  { key: 'prism', zh: '色散', en: 'Dispersion', desc: 'RGB 三通道按不同折射率采样，边缘拆出彩虹并轻微流动。', m: { frost: 0, thickness: 1.8, roughness: 0.03, chroma: 1.1, aniso: 0.4, ior: 1.75, distortion: 0.35, dScale: 0.45, tDist: 0.12 } },
]
const MKEYS = Object.keys(PRESETS[0].m) as (keyof Mat)[]

const MOBILE = typeof window !== 'undefined' && window.innerWidth < 760

/* ------------------------------------------------------------------ backdrop: headline painted into the scene */

const FONT = `"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif`
const MONO = `"JetBrains Mono", "Cascadia Code", Consolas, monospace`

function paintBackdrop(w: number, h: number, dpr: number) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const mobile = w < 760

  // paper
  const bg = g.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#f1f2f6')
  bg.addColorStop(1, '#e6e8ef')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)

  // two soft colour fields — these are what the dispersion splits into rainbows
  const blob = (x: number, y: number, r: number, col: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, col)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, w, h)
  }
  blob(w * 0.74, h * 0.3, Math.max(w, h) * 0.38, 'rgba(122,140,255,0.32)')
  blob(w * 0.22, h * 0.78, Math.max(w, h) * 0.34, 'rgba(255,143,112,0.22)')

  // hairline grid — makes the bending visible everywhere, not only on the type
  const step = mobile ? 36 : 48
  g.strokeStyle = 'rgba(29,28,26,0.055)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = ((w / 2) % step) + 0.5; x < w; x += step) {
    g.moveTo(x, 0)
    g.lineTo(x, h)
  }
  for (let y = ((h / 2) % step) + 0.5; y < h; y += step) {
    g.moveTo(0, y)
    g.lineTo(w, y)
  }
  g.stroke()

  // headline
  const em = mobile ? Math.min(w * 0.215, h * 0.12) : Math.min(w * 0.165, h * 0.27)
  const cy = mobile ? h * 0.43 : h * 0.47
  g.fillStyle = '#16171c'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.font = `700 ${em}px ${FONT}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${-em * 0.04}px`
  const x0 = w / 2 - em * 1.92
  g.fillText('透明，', x0, cy - em * 0.56)
  g.fillText('也有厚度', x0, cy + em * 0.56)
  g.textAlign = 'center'

  // fine print under the headline (tiny detail that refracts nicely)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '2px'
  g.font = `500 ${mobile ? 10 : 12}px ${MONO}`
  g.fillStyle = 'rgba(29,28,26,0.5)'
  g.fillText(mobile ? 'IOR · THICKNESS · DISPERSION' : 'MESH TRANSMISSION · IOR · THICKNESS · CHROMATIC ABERRATION', w / 2, cy + em * 1.32)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4

  // a pre-blurred copy: frosted glass refracts this instead of sampling noisy roughness blur
  const sw = Math.max(32, Math.round(w / 3))
  const sh = Math.max(32, Math.round(h / 3))
  const b = document.createElement('canvas')
  b.width = sw
  b.height = sh
  const bg2 = b.getContext('2d') as CanvasRenderingContext2D
  if (typeof (bg2 as { filter?: string }).filter === 'string') {
    bg2.filter = `blur(${Math.round(sw / 70)}px)`
    bg2.drawImage(c, -sw * 0.05, -sh * 0.05, sw * 1.1, sh * 1.1)
  } else {
    bg2.drawImage(c, 0, 0, sw / 8, sh / 8)
    bg2.drawImage(b, 0, 0, sw / 8, sh / 8, 0, 0, sw, sh)
  }
  const blur = new THREE.CanvasTexture(b)
  blur.colorSpace = THREE.SRGBColorSpace
  return { tex, blur }
}

function Backdrop({ z, frostRef }: { z: number; frostRef: React.RefObject<THREE.Mesh | null> }) {
  const { size, camera } = useThree()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const { tex, blur } = useMemo(() => paintBackdrop(size.width, size.height, dpr), [size.width, size.height, dpr])
  useEffect(
    () => () => {
      tex.dispose()
      blur.dispose()
    },
    [tex, blur],
  )
  const cam = camera as THREE.PerspectiveCamera
  const dist = cam.position.z - z
  const hh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
  return (
    <>
      <mesh position={[0, 0, z]}>
        <planeGeometry args={[hh * (size.width / size.height), hh]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* only drawn into the refraction buffer, faded in by the frost amount */}
      <mesh ref={frostRef} position={[0, 0, z + 0.01]} visible={false}>
        <planeGeometry args={[hh * (size.width / size.height), hh]} />
        <meshBasicMaterial map={blur} toneMapped={false} transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}

/* ------------------------------------------------------------------ glass shapes */

type ShapeKind = 'torus' | 'box' | 'sphere' | 'cone' | 'ico'
const SHAPES: { kind: ShapeKind; p: [number, number, number]; pm: [number, number, number]; s: number; rot: [number, number, number]; speed: number }[] = [
  { kind: 'torus', p: [-0.56, 0.3, 0.6], pm: [0.42, 0.6, 0.4], s: 1, rot: [0.6, 0.3, 0], speed: 0.9 },
  { kind: 'box', p: [0.6, 0.46, -0.2], pm: [-0.48, 0.52, -0.2], s: 1, rot: [0.5, 0.7, 0.2], speed: 1.1 },
  { kind: 'sphere', p: [0.08, -0.16, 1.4], pm: [0.12, 0.08, 1.2], s: 1, rot: [0, 0, 0], speed: 1.3 },
  { kind: 'cone', p: [-0.2, -0.56, 0.2], pm: [-0.42, -0.36, 0.2], s: 1, rot: [0.3, 0, 0.5], speed: 1 },
  { kind: 'ico', p: [0.68, -0.42, 0.5], pm: [0.44, -0.46, 0.4], s: 1, rot: [0.2, 0.4, 0], speed: 0.8 },
]

function Geometry({ kind }: { kind: ShapeKind }) {
  switch (kind) {
    case 'torus':
      return <torusGeometry args={[0.62, 0.27, 48, 128]} />
    case 'sphere':
      return <sphereGeometry args={[0.66, 96, 64]} />
    case 'cone':
      return <coneGeometry args={[0.62, 1.15, 96, 1]} />
    case 'ico':
      return <icosahedronGeometry args={[0.72, 0]} />
    default:
      return null
  }
}

function GlassShape({
  cfg,
  i,
  buffer,
  mats,
  pointer,
}: {
  cfg: (typeof SHAPES)[number]
  i: number
  buffer: THREE.Texture
  mats: React.RefObject<(THREE.MeshPhysicalMaterial & Record<string, unknown>)[]>
  pointer: React.RefObject<THREE.Vector2>
}) {
  const { viewport, size } = useThree()
  const mobile = size.width < 760
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const spin = useMotionValue(0)
  const hover = useMotionValue(1)
  const vp = viewport.getCurrentViewport(undefined, new THREE.Vector3(0, 0, 0))
  const rel = mobile ? cfg.pm : cfg.p
  const base = useMemo(() => new THREE.Vector3(rel[0] * vp.width * 0.5, rel[1] * vp.height * 0.5, rel[2]), [rel, vp.width, vp.height])
  const scale = mobile ? 0.62 : Math.min(1.15, Math.max(0.8, vp.width / 8.6))
  const depth = 0.25 + rel[2] * 0.25
  const dir = i % 2 ? -1 : 1

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const o = outer.current
    const n = inner.current
    if (!o || !n) return
    const p = pointer.current
    o.position.x = THREE.MathUtils.damp(o.position.x, base.x + p.x * depth * 0.6, 3, dt)
    o.position.y = THREE.MathUtils.damp(o.position.y, base.y + p.y * depth * 0.4, 3, dt)
    o.position.z = base.z
    n.rotation.x += dt * 0.12 * cfg.speed * dir
    n.rotation.y += dt * 0.22 * cfg.speed
    // spring spin on click, layered on the ambient rotation
    n.rotation.z = cfg.rot[2] + spin.get() * 0.25
    o.rotation.y = spin.get() + p.x * 0.35
    o.rotation.x = -p.y * 0.25
    o.scale.setScalar(scale * hover.get())
  })

  const onClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    animate(spin, spin.get() + Math.PI * 2, { type: 'spring', stiffness: 42, damping: 9 })
    animate(hover, [1.14, 1], { duration: 0.6, ease: [0.23, 1, 0.32, 1] })
  }

  const material = (
    <MeshTransmissionMaterial
      ref={(m) => {
        if (m) mats.current[i] = m as unknown as THREE.MeshPhysicalMaterial & Record<string, unknown>
      }}
      buffer={buffer}
      resolution={16}
      backsideResolution={16}
      samples={MOBILE ? 5 : 10}
      transmission={1}
      thickness={0.9}
      roughness={0.02}
      chromaticAberration={0.06}
      anisotropy={0.1}
      anisotropicBlur={0.1}
      ior={1.5}
      distortion={0}
      distortionScale={0.3}
      temporalDistortion={0}
      color="#ffffff"
      attenuationColor="#eef0ff"
      attenuationDistance={2.5}
      envMapIntensity={0.9}
    />
  )

  return (
    <group ref={outer}>
      <Float speed={cfg.speed * 1.4} rotationIntensity={0.35} floatIntensity={0.7} floatingRange={[-0.12, 0.12]}>
        <group ref={inner} rotation={cfg.rot}>
          {cfg.kind === 'box' ? (
            <RoundedBox
              args={[1.05, 1.05, 1.05]}
              radius={0.16}
              smoothness={6}
              onClick={onClick}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer'
                animate(hover, 1.06, { type: 'spring', stiffness: 300, damping: 20 })
              }}
              onPointerOut={() => {
                document.body.style.cursor = ''
                animate(hover, 1, { type: 'spring', stiffness: 300, damping: 20 })
              }}
            >
              {material}
            </RoundedBox>
          ) : (
            <mesh
              onClick={onClick}
              onPointerOver={() => {
                document.body.style.cursor = 'pointer'
                animate(hover, 1.06, { type: 'spring', stiffness: 300, damping: 20 })
              }}
              onPointerOut={() => {
                document.body.style.cursor = ''
                animate(hover, 1, { type: 'spring', stiffness: 300, damping: 20 })
              }}
            >
              <Geometry kind={cfg.kind} />
              {material}
            </mesh>
          )}
        </group>
      </Float>
    </group>
  )
}

/* ------------------------------------------------------------------ scene: one shared refraction buffer */

function Scene({ mix, from, to }: { mix: MotionValue<number>; from: React.RefObject<Mat>; to: React.RefObject<Mat> }) {
  const { size, viewport } = useThree()
  const k = MOBILE ? 0.75 : 0.85
  const fbo = useFBO(Math.round(size.width * viewport.dpr * k), Math.round(size.height * viewport.dpr * k), { samples: 0 })
  const glass = useRef<THREE.Group>(null)
  const mats = useRef<(THREE.MeshPhysicalMaterial & Record<string, unknown>)[]>([])
  const pointer = useRef(new THREE.Vector2())
  const cur = useMemo(() => ({ ...PRESETS[0].m }), [])
  const frost = useRef<THREE.Mesh>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent) => pointer.current.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.body.style.cursor = ''
    }
  }, [])

  useFrame((state) => {
    // material preset tween (Motion owns the 0..1 progress)
    const t = mix.get()
    for (const key of MKEYS) cur[key] = from.current[key] + (to.current[key] - from.current[key]) * t
    for (const m of mats.current) {
      if (!m) continue
      m.thickness = cur.thickness
      m.roughness = cur.roughness
      m.chromaticAberration = cur.chroma
      m.anisotropicBlur = cur.aniso
      m.ior = cur.ior
      m.distortion = cur.distortion
      m.distortionScale = cur.dScale
      m.temporalDistortion = cur.tDist
    }

    // render everything except the glass once into a shared buffer; every glass shape refracts it
    const g = glass.current
    if (!g) return
    const { gl, scene, camera } = state
    const tone = gl.toneMapping
    const f = frost.current
    if (f) {
      ;(f.material as THREE.MeshBasicMaterial).opacity = cur.frost
      f.visible = cur.frost > 0.001
    }
    g.visible = false
    gl.toneMapping = THREE.NoToneMapping
    gl.setRenderTarget(fbo)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.toneMapping = tone
    g.visible = true
    if (f) f.visible = false
  })

  return (
    <>
      <Backdrop z={-2.5} frostRef={frost} />
      <group ref={glass}>
        {SHAPES.map((s, i) => (
          <GlassShape key={s.kind} cfg={s} i={i} buffer={fbo.texture} mats={mats} pointer={pointer} />
        ))}
      </group>
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#14151a']} />
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 6, 1]} rotation-x={Math.PI / 2} scale={[8, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[1.2, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#aab6ff" position={[6, 0, 1]} rotation-y={-Math.PI / 2} scale={[2, 5, 1]} />
        <Lightformer form="ring" intensity={2} color="#ffd2c0" position={[3, 3, 6]} scale={1.6} />
        <Lightformer form="rect" intensity={0.25} color="#ffffff" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function GlassRefraction() {
  const [idx, setIdx] = useState(0)
  const mix = useMotionValue(1)
  const from = useRef<Mat>({ ...PRESETS[0].m })
  const to = useRef<Mat>({ ...PRESETS[0].m })
  const touched = useRef(false)

  useEffect(() => {
    const k = mix.get()
    const snap = { ...from.current }
    for (const key of MKEYS) snap[key] = from.current[key] + (to.current[key] - from.current[key]) * k
    from.current = snap
    to.current = { ...PRESETS[idx].m }
    mix.set(0)
    const a = animate(mix, 1, { duration: 1.4, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [idx, mix])

  // ambient: cycle the presets until the visitor picks one
  useEffect(() => {
    const id = setInterval(() => {
      if (!touched.current) setIdx((i) => (i + 1) % PRESETS.length)
    }, 6000)
    return () => clearInterval(id)
  }, [])

  const p = PRESETS[idx]

  return (
    <div className="stage" style={{ background: '#eceef3' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} flat camera={{ position: [0, 0, 9], fov: 32 }} gl={{ antialias: true, alpha: false }}>
        <Scene mix={mix} from={from} to={to} />
      </Canvas>

      <div className="overlay">
        <div className="gr-caption">
          <p className="gr-meta">
            <i /> Glass · {String(idx + 1).padStart(2, '0')} / 03
          </p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <h2>
                {p.zh}
                <span>{p.en}</span>
              </h2>
              <p>{p.desc}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="dock">
          <Seg
            items={PRESETS.map((s, i) => ({ value: i, label: s.zh }))}
            value={idx}
            onChange={(v) => {
              touched.current = true
              setIdx(v)
            }}
          />
        </div>
        <p className="hint">点击玻璃体 · 转一圈</p>
      </div>
    </div>
  )
}

const css = `
.gr-caption {
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 32px; width: min(370px, calc(100% - 48px));
  pointer-events: none !important;
}
.gr-meta {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font: 500 11.5px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-2);
}
.gr-meta i { width: 6px; height: 6px; border-radius: 50%; background: #7a8cff }
.gr-caption h2 { margin: 0; font: 600 22px/1.2 var(--display); letter-spacing: -.01em }
.gr-caption h2 span { margin-left: 10px; font: 400 13px var(--sans); color: var(--fg-2) }
.gr-caption p:not(.gr-meta) { margin: 6px 0 0; font-size: 13.5px; line-height: 1.65; color: var(--fg-2) }
@media (max-width: 1100px) { .gr-caption { display: none } }
`
