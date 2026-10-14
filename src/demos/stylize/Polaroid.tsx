import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize } from '../../lib/stylize'
import {
  createPolaroidEffect,
  createPolaroidOriginal,
  developPolaroid,
  finishPolaroid,
  polaroidMeta,
  polaroidModes,
  polaroidProgress,
  setPolaroidFrame,
  setPolaroidMode,
  setPolaroidSlot,
  type PolaroidEffect,
  type PolaroidMode,
} from './effects/polaroid'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 拍立得 showcase — a summer still life on a striped beach towel at golden hour (sundae cup, beach ball,
 * sunglasses, starfish, a soda bottle), shot on instant film. The print itself is drawn by the effect (frame,
 * picture, oak table, contact shadow) at a position this page animates: a DOM camera drops in, flashes,
 * the print slides out of its slot (the effect hides the part still inside), the camera leaves, the print
 * settles with a tilt and develops (grey-blue → cyan → full colour). The previous print is grabbed from the
 * canvas (2D drawImage right after the frame is drawn) and tossed onto the pile of finished prints.
 * Changing the film shoots a new print with it.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const CYCLE_EVERY = 17000
const PILE_MAX = 5

const FILM: Record<PolaroidMode, { tag: string; note: string; captions: string[] }> = {
  sx70: { tag: 'SX-70', note: '暖调 · 柔焦 · 像隔着一层夏天', captions: ['1987 夏 · 海边', '午后三点的冰淇淋', '那年的毛巾和墨镜'] },
  p600: { tag: '600', note: '反差更足 · 色调偏冷 · 闪光直打', captions: ['冰淇淋化得比我吃得快', '海风 · 8 月 14 日', '球是借隔壁的'] },
  expired: { tag: '过期相纸', note: '偏品红橙 · 斑驳 · 药液边缘失控', captions: ['过期相纸 也挺好看', '颜色全乱了 哈哈', '最后一张 · 1999'] },
}

/* ------------------------------------------------------------------ layout */

type Layout = {
  W: number
  H: number
  s: number // half image size
  rx: number // print rest centre (image centre)
  ry: number
  rest: number // rest tilt, rad
  camW: number
  camH: number
  camTop: number
  card: number // pile card scale
  slots: { x: number; y: number; r: number }[]
}

function layoutFor(W: number, H: number): Layout {
  if (POSTER) {
    const s = Math.min(205, (H - 60) / 2.71)
    return { W, H, s, rx: W / 2, ry: H / 2 - 0.205 * s, rest: -0.035, camW: 0, camH: 0, camTop: 0, card: 0.44, slots: posterSlots(W, H) }
  }
  if (W < 760) {
    const s = Math.min((W - 76) / 2.24 / 1, (H * 0.5 - 70) / 2.71, 170)
    const frameTop = 84
    const ry = frameTop + 1.15 * s
    const camW = Math.min(W - 40, 2.6 * s)
    return {
      W,
      H,
      s,
      rx: W / 2,
      ry,
      rest: -0.03,
      camW,
      camH: camW * 0.5,
      camTop: -camW * 0.12,
      card: 0.3,
      // in the gap between the print and the copy
      slots: [
        { x: W * 0.17, y: ry + 1.97 * s + 10, r: -11 },
        { x: W * 0.83, y: ry + 1.97 * s + 6, r: 9 },
        { x: W * 0.51, y: ry + 1.97 * s + 18, r: -3 },
      ],
    }
  }
  const left = Math.min(560, W * 0.4) + 40
  const s = Math.min(240, (H - 200) / 2.71, (W - left - 60) / 2.4)
  const rx = (left + W - 40) / 2
  const frameMid = (76 + H - 110) / 2
  const ry = frameMid - 0.205 * s
  const camW = 2.7 * s
  return {
    W,
    H,
    s,
    rx,
    ry,
    rest: -0.04,
    camW,
    camH: camW * 0.5,
    camTop: -camW * 0.1,
    card: 0.44,
    slots: [
      { x: W - 70, y: H * 0.2, r: 11 },
      { x: W - 50, y: H * 0.72, r: -8 },
      { x: 120, y: H - 60, r: -13 },
      { x: rx - 1.55 * s, y: H - 40, r: 6 },
      { x: W - 120, y: H - 20, r: 4 },
    ],
  }
}
function posterSlots(W: number, H: number) {
  return [
    { x: W * 0.16, y: H * 0.3, r: -12 },
    { x: W * 0.84, y: H * 0.28, r: 10 },
    { x: W * 0.13, y: H * 0.86, r: 7 },
    { x: W * 0.86, y: H * 0.8, r: -6 },
    { x: W * 0.3, y: H * 1.02, r: 3 },
  ]
}

/* ------------------------------------------------------------------ textures */

function stripeTexture(cols: string[], n: number, w = 512, h = 64) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  for (let i = 0; i < n; i++) {
    x.fillStyle = cols[i % cols.length]
    x.fillRect((i / n) * w, 0, w / n + 1, h)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function towelTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const x = c.getContext('2d')!
  x.fillStyle = '#f3ead8'
  x.fillRect(0, 0, 512, 512)
  const bands: [number, number, string][] = [
    [0, 70, '#e9775b'],
    [96, 22, '#2f8f9d'],
    [140, 70, '#e9775b'],
    [236, 40, '#f6c453'],
    [300, 70, '#e9775b'],
    [396, 22, '#2f8f9d'],
    [440, 70, '#e9775b'],
  ]
  for (const [y, h, col] of bands) {
    x.fillStyle = col
    x.fillRect(0, y, 512, h)
  }
  // terry-cloth weave
  x.globalAlpha = 0.08
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = i % 2 ? '#000' : '#fff'
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function cupTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const x = c.getContext('2d')!
  x.fillStyle = '#fbf6ee'
  x.fillRect(0, 0, 256, 64)
  x.fillStyle = '#e04a4a'
  for (let i = 0; i < 12; i += 2) x.fillRect((i / 12) * 256, 0, 256 / 12, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* little film-look pictures for the prints already on the table */
function pileImage(kind: number) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  // a CPU canvas: no GPU round trip when it is encoded
  const x = c.getContext('2d', { willReadFrequently: true })!
  const g = x.createLinearGradient(0, 0, 0, S)
  if (kind === 0) {
    // sunset over the sea
    g.addColorStop(0, '#5f7f9a')
    g.addColorStop(0.45, '#f0a77a')
    g.addColorStop(0.58, '#f7d49a')
    g.addColorStop(0.6, '#3f6f84')
    g.addColorStop(1, '#244a5a')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
    x.fillStyle = '#fff1c9'
    x.beginPath()
    x.arc(S * 0.62, S * 0.5, 22, 0, Math.PI * 2)
    x.fill()
    x.fillStyle = 'rgba(255, 228, 170, .55)'
    for (let i = 0; i < 14; i++) x.fillRect(S * 0.62 - 30 + Math.random() * 60, S * 0.63 + i * 6, 10 + Math.random() * 30, 2)
  } else if (kind === 1) {
    // beach umbrella
    g.addColorStop(0, '#8fb9c9')
    g.addColorStop(0.5, '#cfe0dc')
    g.addColorStop(0.52, '#e8d6ad')
    g.addColorStop(1, '#d9bf8a')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
    x.fillStyle = '#5b4a3a'
    x.fillRect(S * 0.48, S * 0.35, 4, S * 0.45)
    for (let i = 0; i < 6; i++) {
      x.fillStyle = i % 2 ? '#f4efe6' : '#d9534f'
      x.beginPath()
      x.moveTo(S * 0.49, S * 0.25)
      x.arc(S * 0.49, S * 0.4, S * 0.3, Math.PI + (i / 6) * Math.PI, Math.PI + ((i + 1) / 6) * Math.PI)
      x.fill()
    }
    x.fillStyle = 'rgba(70, 50, 30, .25)'
    x.beginPath()
    x.ellipse(S * 0.6, S * 0.82, 60, 12, 0, 0, Math.PI * 2)
    x.fill()
  } else {
    // lighthouse
    g.addColorStop(0, '#a9c4d6')
    g.addColorStop(0.7, '#e3e7dc')
    g.addColorStop(0.72, '#6f8f7a')
    g.addColorStop(1, '#4e6b58')
    x.fillStyle = g
    x.fillRect(0, 0, S, S)
    x.fillStyle = '#f2ede2'
    x.beginPath()
    x.moveTo(S * 0.4, S * 0.75)
    x.lineTo(S * 0.46, S * 0.28)
    x.lineTo(S * 0.54, S * 0.28)
    x.lineTo(S * 0.6, S * 0.75)
    x.fill()
    x.fillStyle = '#c94a3d'
    x.fillRect(S * 0.43, S * 0.45, S * 0.14, S * 0.07)
    x.fillRect(S * 0.415, S * 0.6, S * 0.17, S * 0.07)
    x.fillStyle = '#3a3a3a'
    x.fillRect(S * 0.45, S * 0.22, S * 0.1, S * 0.06)
  }
  // instant-film treatment: lifted teal blacks, cream highlights, vignette
  x.globalCompositeOperation = 'soft-light'
  x.fillStyle = 'rgba(255, 214, 150, .5)'
  x.fillRect(0, 0, S, S)
  x.globalCompositeOperation = 'lighten'
  x.fillStyle = 'rgb(38, 52, 52)'
  x.fillRect(0, 0, S, S)
  x.globalCompositeOperation = 'source-over'
  const v = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(20, 30, 40, .55)')
  x.fillStyle = v
  x.fillRect(0, 0, S, S)
  return toUrl(c)
}

/** async encode (off the main thread) → object URL */
function toUrl(c: HTMLCanvasElement) {
  return new Promise<string>((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), 'image/jpeg', 0.88))
}

/* ------------------------------------------------------------------ scene */

function StillLife({ spin, clock }: { spin: MotionValue<number>; clock: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const ready = usePrecompiled(group)
  const turn = useRef<THREE.Group>(null)
  const ball = useRef<THREE.Group>(null)
  const M = useMemo(() => {
    // towel with a few soft folds
    const towel = new THREE.PlaneGeometry(6.4, 4.4, 64, 44)
    const p = towel.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      p.setZ(i, Math.sin(x * 1.3 + y * 0.6) * 0.035 + Math.sin(y * 2.4 - x * 0.4) * 0.025 + Math.exp(-((x + 2.6) ** 2) * 3) * 0.06)
    }
    towel.computeVertexNormals()
    // starfish
    const star = new THREE.Shape()
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2
      const r = i % 2 === 0 ? 0.52 : 0.2
      const px = Math.cos(a) * r
      const py = Math.sin(a) * r
      if (i === 0) star.moveTo(px, py)
      else star.lineTo(px, py)
    }
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3 })
    // soda bottle
    const prof = [
      [0, 0],
      [0.26, 0],
      [0.28, 0.04],
      [0.28, 0.9],
      [0.22, 1.15],
      [0.11, 1.45],
      [0.1, 1.75],
      [0.12, 1.8],
      [0.1, 1.84],
      [0, 1.84],
    ].map(([a, b]) => new THREE.Vector2(a, b))
    const bottle = new THREE.LatheGeometry(prof, 40)
    return {
      towel,
      towelTex: towelTexture(),
      ballTex: stripeTexture(['#e8473c', '#f6f1e6', '#2f7fd0', '#f6c443', '#f6f1e6', '#3fae6a'], 6),
      cupTex: cupTexture(),
      starGeo,
      bottle,
    }
  }, [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER && !REDUCED) clock.current = (clock.current ?? 0) + dt
    const t = clock.current ?? 0
    if (turn.current) turn.current.rotation.y = spin.get()
    // the beach ball rocks a little in the breeze
    if (ball.current) ball.current.rotation.set(Math.sin(t * 0.7) * 0.06, t * 0.05, Math.sin(t * 0.9 + 1) * 0.05)
  })

  return (
    <>
      <hemisphereLight args={['#c9dcff', '#e9cf9e', 0.95]} />
      <directionalLight
        position={[6.5, 4.2, -2.5]}
        intensity={3.4}
        color="#ffe0b6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <group ref={group} visible={ready}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#efe3c6" roughness={1} />
        </mesh>
        <group ref={turn}>
          <mesh geometry={M.towel} rotation={[-Math.PI / 2, 0, 0.32]} position={[0, 0.02, 0]} receiveShadow>
            <meshStandardMaterial map={M.towelTex} roughness={0.95} />
          </mesh>
          {/* beach ball */}
          <group ref={ball} position={[-1.6, 0.72, -0.9]}>
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[0.72, 48, 32]} />
              <meshStandardMaterial map={M.ballTex} roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.715, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.1, 0.03, 20]} />
              <meshStandardMaterial color="#f6f1e6" roughness={0.4} />
            </mesh>
          </group>
          {/* sundae cup */}
          <group position={[0.9, 0.02, -0.45]}>
            <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[0.46, 0.32, 0.84, 36, 1, true]} />
              <meshStandardMaterial map={M.cupTex} roughness={0.7} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.86, 0]} scale={[1, 0.85, 1]} castShadow receiveShadow>
              <sphereGeometry args={[0.42, 32, 24]} />
              <meshStandardMaterial color="#f5a8b8" roughness={0.6} />
            </mesh>
            <mesh position={[0.08, 1.22, 0.04]} scale={[1, 0.85, 1]} castShadow receiveShadow>
              <sphereGeometry args={[0.33, 32, 24]} />
              <meshStandardMaterial color="#a9e2c9" roughness={0.6} />
            </mesh>
            <mesh position={[0.12, 1.53, 0.06]} castShadow>
              <sphereGeometry args={[0.09, 20, 14]} />
              <meshStandardMaterial color="#c21f32" roughness={0.25} />
            </mesh>
            <mesh position={[-0.2, 1.25, -0.08]} rotation={[0.2, 0.3, 0.45]} castShadow>
              <boxGeometry args={[0.1, 0.55, 0.16]} />
              <meshStandardMaterial color="#d9a35e" roughness={0.8} />
            </mesh>
            {/* a drip running down the cup */}
            <mesh position={[0.36, 0.66, 0.18]} rotation={[0, 0, 0.18]} castShadow>
              <capsuleGeometry args={[0.045, 0.22, 4, 10]} />
              <meshStandardMaterial color="#f5a8b8" roughness={0.5} />
            </mesh>
          </group>
          {/* sunglasses */}
          <group position={[0.1, 0.06, 1.0]} rotation={[0, -0.35, 0]}>
            {[-0.33, 0.33].map((x) => (
              <group key={x} position={[x, 0, 0]}>
                <mesh rotation={[-Math.PI / 2 + 0.25, 0, 0]} castShadow>
                  <torusGeometry args={[0.24, 0.035, 10, 40]} />
                  <meshStandardMaterial color="#232120" roughness={0.35} />
                </mesh>
                <mesh rotation={[0.25, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.235, 0.235, 0.02, 40]} />
                  <meshStandardMaterial color="#1d3238" roughness={0.08} metalness={0.4} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 0.05, 0.02]} rotation={[Math.PI / 2 - 0.25, 0, 0]}>
              <torusGeometry args={[0.1, 0.025, 8, 16, Math.PI]} />
              <meshStandardMaterial color="#232120" roughness={0.35} />
            </mesh>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.4, 0.02, -0.33]} rotation={[0, sx * 0.25, 0]} castShadow>
                <boxGeometry args={[0.035, 0.035, 0.68]} />
                <meshStandardMaterial color="#232120" roughness={0.35} />
              </mesh>
            ))}
          </group>
          {/* starfish */}
          <mesh geometry={M.starGeo} position={[-1.35, 0.06, 0.95]} rotation={[-Math.PI / 2, 0, 0.6]} castShadow receiveShadow>
            <meshStandardMaterial color="#ea8a4e" roughness={0.75} />
          </mesh>
          {/* soda bottle, lying down */}
          <mesh geometry={M.bottle} position={[2.15, 0.3, 0.75]} rotation={[0, 0.5, Math.PI / 2 - 0.02]} castShadow receiveShadow>
            <meshStandardMaterial color="#5fae8f" roughness={0.12} metalness={0.15} />
          </mesh>
        </group>
      </group>
    </>
  )
}

/** frames the still life in the print's rest box (shifted projection) and sways the camera */
function PrintCam({ lay, clock }: { lay: Layout; clock: React.RefObject<number> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const look = useMemo(() => new THREE.Vector3(0.1, 0.35, 0.1), [])
  useFrame(() => {
    const t = clock.current ?? 0
    const az = 0.08 + Math.sin(t * 0.21) * 0.08
    const el = 0.92 + Math.sin(t * 0.17 + 1) * 0.035
    const R = 7.6
    camera.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R)
    camera.lookAt(look)
    const { W, H, s, rx, ry } = lay
    const fovBox = THREE.MathUtils.degToRad(39)
    camera.aspect = W / H
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(fovBox / 2) * H) / (2 * s)))
    camera.updateProjectionMatrix()
    camera.projectionMatrix.elements[8] = -((rx / W) * 2 - 1)
    camera.projectionMatrix.elements[9] = -(1 - (ry / H) * 2)
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  })
  return null
}

type Pose = { x: MotionValue<number>; y: MotionValue<number>; a: MotionValue<number> }

/** feeds the animated print pose to the effect; also grabs the print out of the canvas when asked */
function PrintDriver({ fx, lay, pose, slot, grab, dev }: { fx: PolaroidEffect; lay: Layout; pose: Pose; slot: React.RefObject<number | null>; grab: React.RefObject<((url: string) => void) | null>; dev: React.RefObject<HTMLDivElement | null> }) {
  const gl = useThree((s) => s.gl)
  const cv = useMemo(() => document.createElement('canvas'), [])
  const lastP = useRef(-1)
  useFrame(() => {
    setPolaroidFrame(fx, { x: pose.x.get(), y: pose.y.get(), s: lay.s, angle: pose.a.get() }, { x: lay.rx, y: lay.ry, s: lay.s })
    setPolaroidSlot(fx, slot.current)
    const box = dev.current
    if (box) {
      const p = polaroidProgress(fx)
      if (Math.abs(p - lastP.current) > 0.004) {
        lastP.current = p
        box.style.opacity = p < 1 ? '1' : '0'
        const bar = box.querySelector<HTMLElement>('b')
        if (bar) bar.style.transform = `scaleX(${p.toFixed(3)})`
        const lab = box.querySelector<HTMLElement>('span')
        if (lab) lab.textContent = p < 0.3 ? '显影中 · 灰蓝' : p < 0.65 ? '显影中 · 青色浮现' : '显影中 · 暖色到位'
      }
    }
  })
  // runs after <Stylize> (priority 1) drew the frame, while the drawing buffer is still valid
  useFrame(() => {
    const done = grab.current
    if (!done) return
    grab.current = null
    const N = 320
    cv.width = N
    cv.height = N
    const x = cv.getContext('2d')!
    const dpr = gl.getPixelRatio()
    x.setTransform(1, 0, 0, 1, 0, 0)
    x.translate(N / 2, N / 2)
    x.scale(N / (2 * lay.s), N / (2 * lay.s))
    x.rotate(-pose.a.get())
    x.translate(-pose.x.get(), -pose.y.get())
    x.scale(1 / dpr, 1 / dpr)
    x.drawImage(gl.domElement, 0, 0)
    toUrl(cv).then(done)
  }, 2)
  return null
}

/* ------------------------------------------------------------------ DOM pieces */

type Card = { id: number; src: string; caption: string; from?: { x: number; y: number; r: number }; slot: number }

function PrintCard({ c, lay }: { c: Card; lay: Layout }) {
  const sl = lay.slots[c.slot % lay.slots.length]
  const w = 2.24 * lay.s
  const h = 2.71 * lay.s
  // the card's centre is the frame centre; slots are given for the frame centre
  const off = 0.205 * lay.s
  return (
    <motion.div
      className="pl-card"
      style={{ width: w, height: h, left: -w / 2, top: -h / 2, zIndex: c.id }}
      initial={
        c.from
          ? { x: c.from.x, y: c.from.y + off, rotate: c.from.r, scale: 1 }
          : POSTER
            ? false
            : { x: sl.x, y: sl.y - 40, rotate: sl.r - 8, scale: lay.card * 1.12, opacity: 0 }
      }
      animate={{ x: sl.x, y: sl.y, rotate: sl.r, scale: lay.card, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 90, damping: 17, mass: 1 }}
    >
      <div className="pl-card-img" style={{ backgroundImage: `url(${c.src})`, left: 0.12 * lay.s, top: 0.15 * lay.s, width: 2 * lay.s, height: 2 * lay.s }} />
      <span className="pl-hand" style={{ top: 2.27 * lay.s, fontSize: lay.s * 0.15 }}>
        {c.caption}
      </span>
    </motion.div>
  )
}

function Camera({ lay, y, shutter }: { lay: Layout; y: MotionValue<number>; shutter: number }) {
  const { camW: w, camH: h } = lay
  return (
    <motion.div className="pl-cam" style={{ width: w, height: h, left: lay.rx - w / 2, top: lay.camTop, y }} aria-hidden>
      <div className="pl-cam-top" />
      <div className="pl-cam-stripe">
        <i style={{ background: '#e2483d' }} />
        <i style={{ background: '#f08c2e' }} />
        <i style={{ background: '#f4c63d' }} />
        <i style={{ background: '#5fae5b' }} />
        <i style={{ background: '#3f84c9' }} />
      </div>
      <div className="pl-cam-flash" />
      <div className="pl-cam-vf" />
      <div className="pl-cam-btn" />
      <div className="pl-cam-lens" style={{ width: h * 0.56, height: h * 0.56 }}>
        <motion.div key={shutter} className="pl-cam-iris" initial={{ scale: 0 }} animate={{ scale: [0, 1, 1, 0] }} transition={{ duration: 0.28, times: [0, 0.35, 0.6, 1] }} />
      </div>
      <div className="pl-cam-slot" />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Polaroid() {
  const [mode, setMode] = useState<PolaroidMode>('sx70')
  const fx = useMemo(() => {
    const f = createPolaroidEffect()
    if (POSTER || REDUCED) finishPolaroid(f)
    return f
  }, [])
  const original = useMemo(() => createPolaroidOriginal(fx), [fx])
  const preload = useMemo(() => [fx, original], [fx, original])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.66)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const lay = useMemo(() => layoutFor(vp.w, vp.h), [vp.w, vp.h])
  const layRef = useRef(lay)
  layRef.current = lay

  const clock = useRef(POSTER ? 3 : 0)
  const spin = useMotionValue(0)
  // print pose (CSS px / rad); parked off-screen until the first shot
  const still = POSTER || REDUCED
  const pose: Pose = {
    x: useMotionValue(lay.rx),
    y: useMotionValue(still ? lay.ry : -2000),
    a: useMotionValue(still ? lay.rest : 0),
  }
  const camY = useMotionValue(-lay.camH * 1.6)
  const flash = useMotionValue(0)
  const slot = useRef<number | null>(null)
  const grab = useRef<((url: string) => void) | null>(null)
  const dev = useRef<HTMLDivElement>(null)
  const [shutter, setShutter] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const hasPrint = useRef(still)
  // the prints already on the table are painted after the first frames (keeps the mount light) and drop in
  const [cards, setCards] = useState<Card[]>([])
  useEffect(() => {
    let dead = false
    const ids = [0, 1, 2].map((k) =>
      setTimeout(
        async () => {
          const src = await pileImage(k)
          if (!dead) setCards((cs) => [{ id: k + 1, src, caption: ['海边 · 黄昏', '借来的遮阳伞', '灯塔 8.14'][k], slot: k }, ...cs])
        },
        POSTER ? 0 : 700 + k * 220,
      ),
    )
    return () => {
      dead = true
      ids.forEach(clearTimeout)
    }
  }, [])
  const nextId = useRef(4)
  const shots = useRef(0)
  const [caption, setCaption] = useState(FILM.sx70.captions[0])
  const [captionOn, setCaptionOn] = useState(still)
  const captionRef = useRef(caption)
  captionRef.current = caption
  // hides the plain render the lib shows while the film shader compiles (and its reveal wipe)
  const [veil, setVeil] = useState(!still)
  const capRot = useTransform(pose.a, (a) => (a * 180) / Math.PI)

  // keep the parked / resting print in place when the window changes size
  useEffect(() => {
    if (busyRef.current) return
    pose.x.set(lay.rx)
    if (hasPrint.current) pose.y.set(lay.ry)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lay])

  const shoot = async (film: PolaroidMode) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const L = layRef.current
    // 1 · the current print goes onto the pile
    if (hasPrint.current) {
      const url = await new Promise<string>((res) => (grab.current = res))
      const id = nextId.current++
      const cap = captionRef.current
      setCards((cs) => [...cs.slice(-(PILE_MAX - 1)), { id, src: url, caption: cap, from: { x: pose.x.get(), y: pose.y.get(), r: (pose.a.get() * 180) / Math.PI }, slot: id }])
      pose.y.set(-2000)
      hasPrint.current = false
    }
    setCaptionOn(false)
    // 2 · camera in
    await animate(camY, 0, { type: 'spring', stiffness: 170, damping: 22 })
    // 3 · flash + shutter, the new film is loaded
    setPolaroidMode(fx, film)
    setShutter((n) => n + 1)
    animate(flash, [0, 0.92, 0], { duration: 0.6, times: [0, 0.08, 1], ease: 'easeOut' })
    await new Promise((r) => setTimeout(r, 260))
    // 4 · eject out of the slot
    const slotY = L.camTop + L.camH * 0.86
    slot.current = slotY
    developPolaroid(fx)
    hasPrint.current = true
    pose.x.set(L.rx)
    pose.a.set(0)
    pose.y.set(slotY - 1.56 * L.s - 2)
    await animate(pose.y, slotY + 1.15 * L.s + 6, { duration: 1.25, ease: [0.3, 0.6, 0.35, 1] })
    // 5 · camera away, print settles where it lies
    animate(camY, -L.camH * 1.6, { duration: 0.55, ease: [0.5, 0, 0.75, 0] }).then(() => (slot.current = null))
    await new Promise((r) => setTimeout(r, 160))
    const n = shots.current++
    animate(pose.a, L.rest + (n % 2 ? 0.05 : -0.015), { type: 'spring', stiffness: 60, damping: 14 })
    animate(pose.x, L.rx + (n % 2 ? -8 : 6), { type: 'spring', stiffness: 60, damping: 16 })
    await animate(pose.y, L.ry, { type: 'spring', stiffness: 55, damping: 15 })
    const caps = FILM[film].captions
    setCaption(caps[n % caps.length])
    setTimeout(() => setCaptionOn(true), 1600)
    busyRef.current = false
    setBusy(false)
  }

  const modeRef = useRef(mode)
  modeRef.current = mode
  const pickFilm = (m: PolaroidMode) => {
    if (busyRef.current || m === modeRef.current) return
    setMode(m)
    shoot(m)
  }

  // first shot once the print shader is on screen
  useEffect(() => {
    if (still) return
    let id = 0
    const t0 = performance.now()
    const poll = () => {
      // update() only ticks while the effect is drawn; its uniforms move once it has
      const shown = fx.pol.shown
      if ((shown !== undefined && performance.now() - shown > 950) || performance.now() - t0 > 8000) {
        setVeil(false)
        setTimeout(() => shoot('sx70'), 350)
      } else id = requestAnimationFrame(poll)
    }
    id = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx])

  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 14000 || splitOpen.current || busyRef.current) return
      const next = polaroidModes[(polaroidModes.findIndex((o) => o.id === modeRef.current) + 1) % polaroidModes.length].id
      pickFilm(next)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const touch = () => (lastInput.current = performance.now())

  // drag turns the still life (Motion inertia on release)
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
    spin.set(spin.get() + (e.clientX - d.x) * 0.006)
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(spin, spin.get(), { type: 'inertia', velocity: spin.getVelocity(), power: 0.4, timeConstant: 650 })
  }

  const label = polaroidModes.find((m) => m.id === mode)!.label
  const F = FILM[mode]

  return (
    <div
      className={`stage pl${split.open ? ' pl-split' : ''}`}
      style={{ background: '#dcc7a3' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 7, 6], fov: 40, near: 0.3, far: 120 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={polaroidMeta.background} preload={preload} />
        <StillLife spin={spin} clock={clock} />
        <PrintCam lay={lay} clock={clock} />
        <PrintDriver fx={fx} lay={lay} pose={pose} slot={slot} grab={grab} dev={dev} />
      </Canvas>

      <AnimatePresence>{veil && <motion.div className="pl-veil" exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />}</AnimatePresence>

      <div className="pl-pile">
        {cards.map((c) => (
          <PrintCard key={c.id} c={c} lay={lay} />
        ))}
      </div>

      <motion.div className="pl-capbox" style={{ x: pose.x, y: pose.y, rotate: capRot }}>
        <AnimatePresence>
          {captionOn && (
            <motion.span
              key={caption}
              className="pl-hand pl-cap"
              style={{ top: 1.28 * lay.s, fontSize: Math.max(13, lay.s * 0.13) }}
              initial={{ clipPath: 'inset(0 100% 0 0)', opacity: 1 }}
              animate={{ clipPath: 'inset(0 0% 0 0)', opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeInOut' }}
            >
              {caption}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {!still && <Camera lay={lay} y={camY} shutter={shutter} />}

      <div className="overlay">
        <motion.div className="pl-flash" style={{ opacity: flash }} />
        <div className="hero-copy pl-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Instant Film · 一次成像
            </p>
            <h1>
              按下快门，
              <br />
              等它慢慢显影
            </h1>
            <p className="pl-sub">相纸刚吐出来只有一片灰蓝，青色先浮上来，暖色最后才到。偏青的黑位、奶油色的高光、暗角、漏光和药液没铺匀的边，都是一次成像相纸的脾气。</p>
            <div className="pl-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{F.tag}</b>
                  {F.note}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="pl-dev" ref={dev} style={{ opacity: 0 }}>
              <span>显影中</span>
              <i>
                <b />
              </i>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <button className="seg pl-shoot" disabled={busy} onClick={() => shoot(modeRef.current)} aria-label="拍一张">
            <span>
              <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
                <rect x="1.5" y="3.5" width="13" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="8" cy="8.6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 3.5 L6 1.8 H10 L11 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              拍一张
            </span>
          </button>
          <span className="dock-sep" />
          <Seg items={polaroidModes.map((m) => ({ value: m.id, label: MOBILE && m.id === 'expired' ? '过期' : m.label }))} value={mode} onChange={pickFilm} />
          <span className="dock-sep" />
          <button className="seg pl-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="pl-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动桌上的小物 · 换相纸会重拍一张</p>
      </div>
    </div>
  )
}

const css = `
.pl { cursor: grab; touch-action: none; overflow: hidden; }
.pl:active { cursor: grabbing; }
.pl canvas { display: block; }
.pl-veil { position: absolute; inset: 0; background: #dcc7a3; pointer-events: none; }
.pl-pile, .pl-capbox { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 0; }
.pl-card {
  position: absolute; background: #f4f1ea; border-radius: 3px;
  box-shadow: 0 1px 2px rgba(60, 40, 20, .25), 0 14px 30px -10px rgba(60, 40, 20, .45);
}
.pl-card-img { position: absolute; background-size: cover; background-position: center; box-shadow: inset 1px 1px 3px rgba(0,0,0,.25); }
.pl-hand {
  position: absolute; left: 0; right: 0; text-align: center; white-space: nowrap;
  font-family: "Segoe Print", "Bradley Hand", "Comic Sans MS", "KaiTi", "STKaiti", "Kaiti SC", cursive;
  color: #2c3550; letter-spacing: .02em; transform: rotate(-1.5deg);
}
.pl-cap { left: -200px; right: -200px; transform: translate(0, -50%) rotate(-1.5deg); }
.pl-cam {
  position: absolute; border-radius: 22px; pointer-events: none;
  background: linear-gradient(#f6f3ec, #e4ded1 62%, #2f2d2a 62.5%, #24221f);
  box-shadow: 0 2px 0 rgba(255,255,255,.6) inset, 0 -3px 0 rgba(0,0,0,.25) inset, 0 30px 60px -18px rgba(40, 25, 10, .55);
}
.pl-cam-top { position: absolute; left: 6%; right: 6%; top: 5%; height: 10%; border-radius: 8px; background: linear-gradient(#ebe6da, #f7f4ee); }
.pl-cam-stripe { position: absolute; left: 21%; top: 0; bottom: 37.5%; width: 7%; display: flex; }
.pl-cam-stripe i { flex: 1; }
.pl-cam-flash {
  position: absolute; right: 7%; top: 18%; width: 24%; height: 20%; border-radius: 6px;
  background: repeating-linear-gradient(90deg, #f7f6f2 0 3px, #d9d6cf 3px 5px); box-shadow: inset 0 0 0 2px #c9c3b6;
}
.pl-cam-vf { position: absolute; left: 6%; top: 18%; width: 10%; height: 16%; border-radius: 5px; background: radial-gradient(circle at 35% 35%, #6c7a86, #1c2026 70%); }
.pl-cam-btn { position: absolute; left: 6.5%; top: 44%; width: 7%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #ff7b6b, #c9281c); box-shadow: 0 2px 0 rgba(0,0,0,.25); }
.pl-cam-lens {
  position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); border-radius: 50%; overflow: hidden;
  background: radial-gradient(circle at 50% 50%, #0d1116 0 30%, #2a3540 31% 46%, #0e1115 47% 60%, #3b3936 61% 70%, #1d1c1a 71%);
  box-shadow: 0 0 0 5px #2d2b28, 0 0 0 8px #d9d3c6, 0 8px 18px rgba(0,0,0,.4);
}
.pl-cam-lens::after { content: ''; position: absolute; left: 22%; top: 18%; width: 24%; height: 16%; border-radius: 50%; background: rgba(255,255,255,.35); filter: blur(2px); transform: rotate(-30deg); }
.pl-cam-iris { position: absolute; inset: 0; border-radius: 50%; background: #050608; }
.pl-cam-slot { position: absolute; left: 9%; right: 9%; bottom: 12%; height: 3.2%; min-height: 5px; border-radius: 3px; background: #0b0a09; box-shadow: 0 1px 0 rgba(255,255,255,.12); }
.overlay > .pl-flash { position: absolute; inset: 0; background: #fffdf6; pointer-events: none; }
.pl-copy { pointer-events: none !important; --soft-bg: #e2cfab; }
.pl-copy .kicker { color: #7a5f43; }
.pl-copy .kicker i { background: #e0874a; }
.pl-copy h1 { font-size: clamp(36px, 4.2vw, 58px); color: #2b2117; }
.pl-sub { max-width: 400px; color: #4f4030 !important; }
.pl-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4f4030; }
.pl-spec span { display: inline-flex; align-items: center; gap: 10px; }
.pl-spec b { font-weight: 600; color: #2b2117; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(224, 135, 74, .55); }
.pl-dev { display: flex; align-items: center; gap: 10px; margin-top: 14px; height: 14px; font: 500 11px/1 var(--mono); color: #6b5640; transition: opacity .6s; }
.pl-dev i { position: relative; width: 120px; height: 2px; border-radius: 2px; background: rgba(224, 135, 74, .2); overflow: hidden; }
.pl-dev b { position: absolute; inset: 0; background: #e0874a; transform-origin: left; transform: scaleX(0); }
.pl-shoot span, .pl-btn span { display: inline-flex; align-items: center; gap: 6px; }
.pl-shoot svg { color: #d0632a; }
.pl-shoot:disabled { opacity: .5; cursor: default; }
.pl .hint { transition: opacity .4s; color: #4f4030; padding: 4px 10px; border-radius: 999px; background: rgba(240, 228, 205, .82); }
.pl-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .pl-sub { display: none; }
  .pl-copy h1 { font-size: 30px; }
  .pl-spec { margin-top: 10px; }
  .pl-dev { margin-top: 8px; }
  .pl-copy { transition: opacity .4s; }
  .pl-split .pl-copy { opacity: 0; }
  .pl .dock .seg { padding: 0 8px; }
  .pl .dock .dock-sep { margin: 0 1px; }
}
`
