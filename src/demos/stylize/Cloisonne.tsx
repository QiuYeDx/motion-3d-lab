import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  ENAMELS,
  cloisonneMeta,
  cloisonneModes,
  createCloisonneEffect,
  setCloisonneAnchor,
  setCloisonneCell,
  setCloisonneGround,
  setCloisonneMode,
  type CloisonneMode,
} from './effects/cloisonne'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 景泰蓝 showcase — a baluster vase (lathe) painted in bands — lotus panels at the foot, a lotus scroll on
 * turquoise round the belly, a ruyi collar on the shoulder, banana leaves up the neck — with gilt rims, and a
 * small tripod censer beside it, both slowly turning on rosewood stands in a dark velvet case under two
 * spotlights. The effect turns their painted colours into wire-bounded enamel cells; the scroll wire is laid on
 * each object's own surface (setCloisonneAnchor, rebuilt from depth), so it turns with them. Stands, case and
 * gilt mounts are written with scene alpha < 0.75 (custom One/Zero blending) and pass through untouched.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const BG = '#0b0f17'
const FOV = 30

const DENSITY = [
  { zh: '疏', around: 10, height: 0.42, cell: 96 },
  { zh: '中', around: 14, height: 0.3, cell: 76 },
  { zh: '密', around: 19, height: 0.22, cell: 56 },
]

const SPEC: Record<CloisonneMode, string> = {
  jingtai: '铜胎掐丝 · 鎏金 · 孔雀蓝地缠枝莲',
  painted: '画珐琅 · 白釉地上直接彩绘 · 只在边缘描金',
  silver: '银丝 · 钴蓝 / 墨地 · 冷色釉',
}

/* ------------------------------------------------------------------ materials */

/** written to the scene target with alpha < 1, which tells the effect to leave it alone */
function passMat(p: THREE.MeshStandardMaterialParameters, alpha: number) {
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

/* ------------------------------------------------------------------ lathe with arc-length uv */

type Lathe = { geo: THREE.LatheGeometry; vOfY: (y: number) => number; rOfY: (y: number) => number; top: number }

function lathe(ctrl: [number, number][], n = 120, segs = 96): Lathe {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal')
  const pts = curve.getSpacedPoints(n - 1).map((p) => new THREE.Vector2(p.x, p.y))
  const geo = new THREE.LatheGeometry(pts, segs)
  const ys = pts.map((p) => p.y)
  const interp = (y: number, f: (i: number) => number) => {
    if (y <= ys[0]) return f(0)
    for (let i = 1; i < ys.length; i++) {
      if (y <= ys[i]) {
        const t = (y - ys[i - 1]) / Math.max(ys[i] - ys[i - 1], 1e-6)
        return f(i - 1) + (f(i) - f(i - 1)) * t
      }
    }
    return f(ys.length - 1)
  }
  return {
    geo,
    vOfY: (y) => interp(y, (i) => i / (n - 1)),
    rOfY: (y) => interp(y, (i) => pts[i].x),
    top: ys[ys.length - 1],
  }
}

/* ------------------------------------------------------------------ painted textures (colours the effect snaps to enamel) */

const C = {
  turq: '#2fa3d6',
  lapis: '#2d3fc0',
  red: '#d6382c',
  rose: '#ee6f8f',
  yellow: '#efc42a',
  white: '#f2efe6',
  green: '#38a04a',
  lime: '#9cc23a',
  dark: '#1a1a22',
}

type Ctx = CanvasRenderingContext2D

function vaseTexture(L: Lathe) {
  const W = 2048
  const H = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  const yPx = (y: number) => (1 - L.vOfY(y)) * H
  const band = (y0: number, y1: number, col: string) => {
    g.fillStyle = col
    g.fillRect(0, yPx(y1), W, yPx(y0) - yPx(y1) + 1)
  }
  // draw `fn` in surface units centred at (u, y), repeated across the wrap
  const at = (u: number, y: number, fn: (g: Ctx) => void) => {
    const r = Math.max(L.rOfY(y), 0.2)
    const sx = W / (Math.PI * 2 * r)
    const dy = 0.02
    const sy = (yPx(y - dy) - yPx(y + dy)) / (2 * dy)
    for (const off of [-W, 0, W]) {
      g.setTransform(sx, 0, 0, -sy, u * W + off, yPx(y))
      fn(g)
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
  }
  const blob = (pts: [number, number][], col: string) => (c: Ctx) => {
    c.fillStyle = col
    c.beginPath()
    c.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i += 2) c.quadraticCurveTo(pts[i][0], pts[i][1], pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1])
    c.closePath()
    c.fill()
  }
  const ellipse = (x: number, y: number, rx: number, ry: number, rot: number, col: string) => (c: Ctx) => {
    c.fillStyle = col
    c.beginPath()
    c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
    c.fill()
  }

  // grounds
  band(0, 0.3, C.lapis)
  band(0.3, 1.95, C.turq)
  band(1.95, 2.36, C.lapis)
  band(2.36, 2.98, C.turq)
  band(2.98, 3.3, C.red)

  // foot: upright lotus-petal panels
  const petalCols = [C.red, C.yellow, C.green, C.white]
  for (let i = 0; i < 16; i++) {
    at(i / 16, 0.03, (c) => {
      c.fillStyle = petalCols[i % 4]
      c.beginPath()
      c.moveTo(-0.15, 0)
      c.bezierCurveTo(-0.17, 0.14, -0.06, 0.22, 0, 0.25)
      c.bezierCurveTo(0.06, 0.22, 0.17, 0.14, 0.15, 0)
      c.closePath()
      c.fill()
    })
  }

  // belly: scrolling vine with big lotus flowers and leaves
  const nF = 5
  for (let i = 0; i < nF; i++) {
    const u = i / nF
    const up = i % 2 === 0
    const fy = up ? 1.3 : 0.95
    // vine to the next flower
    at(u, fy, (c) => {
      c.strokeStyle = C.green
      c.lineWidth = 0.07
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(0, -0.1)
      const dx = 1.26 // ≈ surface distance to the next flower at r≈1
      const ny = up ? -0.35 : 0.35
      c.bezierCurveTo(dx * 0.3, -0.55 * (up ? 1 : -1) - 0.1, dx * 0.6, ny + 0.5 * (up ? 1 : -1), dx, ny - 0.1)
      c.stroke()
    })
    // leaves on the vine
    at(u + 0.07, fy + (up ? -0.32 : 0.3), ellipse(0, 0, 0.2, 0.085, up ? 0.6 : -0.6, C.green))
    at(u + 0.13, fy + (up ? -0.1 : 0.1), ellipse(0, 0, 0.16, 0.07, up ? -0.5 : 0.5, C.lime))
    at(u - 0.06, fy + (up ? 0.32 : -0.34), ellipse(0, 0, 0.18, 0.08, up ? -0.9 : 0.9, C.green))
    // a small bud between flowers
    at(u + 0.1, fy + (up ? -0.52 : 0.5), (c) => {
      ellipse(0, 0, 0.07, 0.1, 0, C.white)(c)
      ellipse(0, -0.02, 0.035, 0.035, 0, C.red)(c)
    })
    // the lotus
    at(u, fy, (c) => {
      for (let k = -2; k <= 2; k++) {
        c.save()
        c.rotate(k * 0.42)
        blob([[0, 0], [0.16, 0.12], [0.1, 0.34], [0.03, 0.42], [0, 0.44], [-0.03, 0.42], [-0.1, 0.34], [-0.16, 0.12]], C.red)(c)
        c.restore()
      }
      for (let k = -1; k <= 1; k++) {
        c.save()
        c.rotate(k * 0.45)
        blob([[0, 0.02], [0.1, 0.1], [0.07, 0.26], [0.02, 0.3], [0, 0.31], [-0.02, 0.3], [-0.07, 0.26], [-0.1, 0.1]], C.rose)(c)
        c.restore()
      }
      ellipse(0, 0.08, 0.13, 0.065, 0, C.yellow)(c)
      blob([[-0.22, -0.02], [0, -0.16], [0.22, -0.02], [0, 0.04]], C.white)(c)
    })
  }

  // shoulder: ruyi cloud collar hanging down
  for (let i = 0; i < 8; i++) {
    at((i + 0.5) / 8, 2.32, (c) => {
      c.fillStyle = C.red
      c.beginPath()
      c.moveTo(-0.32, 0)
      c.bezierCurveTo(-0.36, -0.12, -0.18, -0.2, -0.1, -0.14)
      c.bezierCurveTo(-0.14, -0.28, 0.14, -0.28, 0.1, -0.14)
      c.bezierCurveTo(0.18, -0.2, 0.36, -0.12, 0.32, 0)
      c.closePath()
      c.fill()
      ellipse(0, -0.1, 0.07, 0.05, 0, C.yellow)(c)
    })
  }

  // neck: banana leaves
  for (let i = 0; i < 10; i++) {
    at(i / 10, 2.4, (c) => {
      c.fillStyle = C.green
      c.beginPath()
      c.moveTo(-0.1, 0)
      c.quadraticCurveTo(-0.08, 0.32, 0, 0.55)
      c.quadraticCurveTo(0.08, 0.32, 0.1, 0)
      c.closePath()
      c.fill()
      c.strokeStyle = C.lime
      c.lineWidth = 0.035
      c.beginPath()
      c.moveTo(0, 0.02)
      c.lineTo(0, 0.42)
      c.stroke()
    })
  }
  // lip: a white wave band
  for (let i = 0; i < 12; i++) at(i / 12, 3.08, ellipse(0, 0, 0.08, 0.05, 0, C.white))

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

function censerTexture(L: Lathe) {
  const W = 1024
  const H = 512
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  const yPx = (y: number) => (1 - L.vOfY(y)) * H
  g.fillStyle = C.lapis
  g.fillRect(0, 0, W, H)
  g.fillStyle = C.turq
  g.fillRect(0, yPx(0.62), W, yPx(0.5) - yPx(0.62))
  for (let i = 0; i < 6; i++) {
    const x = ((i + 0.5) / 6) * W
    const y = yPx(0.26)
    g.fillStyle = C.green
    g.beginPath()
    g.ellipse(x - 52, y + 6, 40, 16, -0.4, 0, Math.PI * 2)
    g.ellipse(x + 52, y + 6, 40, 16, 0.4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = i % 2 ? C.yellow : C.red
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.ellipse(x + Math.cos((k / 5) * Math.PI * 2) * 22, y + Math.sin((k / 5) * Math.PI * 2) * 22, 17, 13, (k / 5) * Math.PI * 2, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = C.white
    g.beginPath()
    g.arc(x, y, 12, 0, Math.PI * 2)
    g.fill()
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/* ------------------------------------------------------------------ scene */

const VASE: [number, number][] = [
  [0.5, 0.0],
  [0.56, 0.06],
  [0.62, 0.22],
  [0.78, 0.55],
  [0.94, 0.95],
  [1.02, 1.35],
  [1.0, 1.7],
  [0.88, 2.02],
  [0.66, 2.28],
  [0.44, 2.45],
  [0.33, 2.62],
  [0.31, 2.82],
  [0.35, 3.0],
  [0.45, 3.14],
  [0.48, 3.22],
]
const CENSER: [number, number][] = [
  [0.3, 0.0],
  [0.42, 0.06],
  [0.56, 0.2],
  [0.6, 0.36],
  [0.56, 0.52],
  [0.5, 0.6],
  [0.52, 0.64],
]
const LID: [number, number][] = [
  [0.54, 0.0],
  [0.5, 0.08],
  [0.38, 0.2],
  [0.2, 0.28],
  [0.02, 0.3],
]

function Display({ fx, ry, density }: { fx: ReturnType<typeof createCloisonneEffect>; ry: MotionValue<number>; density: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const rig = useRef<THREE.Group>(null)
  const vase = useRef<THREE.Group>(null)
  const censer = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 2.2 : 0)
  const key = useRef<THREE.SpotLight>(null)
  const lights = useRef<THREE.Group>(null)
  const rim = useRef<THREE.SpotLight>(null)

  const R = useMemo(() => {
    const v = lathe(VASE)
    const c = lathe(CENSER, 60, 72)
    const lid = lathe(LID, 30, 72)
    const vaseTex = vaseTexture(v)
    const censerTex = censerTexture(c)
    const lidTex = censerTexture(lid)
    const gilt = passMat({ color: '#d8a548', metalness: 0.35, roughness: 0.32 }, 0.3)
    const wood = passMat({ color: '#3b1810', roughness: 0.42 }, 0.55)
    const velvet = passMat({ color: '#18213a', roughness: 1, side: THREE.DoubleSide }, 0.55)
    const enamel = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, roughness: 0.8, side: THREE.DoubleSide })
    const ring = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 10, 96)
    // gilt rims where the painted bands meet
    const rims = [0.02, 0.3, 1.95, 2.36, 2.98].map((y) => ({ y, geo: ring(v.rOfY(y) + 0.012, y < 0.1 ? 0.035 : 0.02) }))
    rims.push({ y: v.top, geo: ring(v.rOfY(v.top), 0.03) })
    // tripod legs + handles of the censer
    const leg = new THREE.CylinderGeometry(0.06, 0.035, 0.34, 12)
    const handle = new THREE.TorusGeometry(0.13, 0.03, 8, 24, Math.PI)
    return {
      v,
      c,
      lid,
      vaseMat: enamel(vaseTex),
      censerMat: enamel(censerTex),
      lidMat: enamel(lidTex),
      inside: new THREE.MeshStandardMaterial({ color: '#16161c', roughness: 0.9, side: THREE.BackSide }),
      gilt,
      wood,
      velvet,
      rims,
      leg,
      handle,
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      target: new THREE.Object3D(),
    }
  }, [])
  useEffect(() => {
    if (key.current) key.current.target = R.target
    if (rim.current) rim.current.target = R.target
  }, [R])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    const aspect = size.width / size.height
    const desk = size.width >= 760 && !POSTER
    // frame: subject on the right on desktop, centred and lifted on phones
    const dist = 10.5
    const halfW = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * dist
    if (rig.current && lights.current) {
      const s = aspect < 0.8 ? 0.72 : Math.min(1, aspect * 1.25)
      rig.current.scale.setScalar(s)
      rig.current.position.set(desk ? halfW * 0.34 : aspect < 0.8 ? -0.15 : 0, 0, 0)
      lights.current.position.copy(rig.current.position)
    }
    const spin = t.current * 0.16 + ry.get()
    if (vase.current) vase.current.rotation.y = spin
    if (censer.current) censer.current.rotation.y = -spin * 0.8 + 0.6
    // lay the scroll wire on both turning objects
    camera.updateMatrixWorld()
    if (vase.current && censer.current) {
      vase.current.updateWorldMatrix(true, false)
      censer.current.updateWorldMatrix(true, false)
      R.m.multiplyMatrices(camera.matrixWorldInverse, vase.current.matrixWorld).invert()
      R.m2.multiplyMatrices(camera.matrixWorldInverse, censer.current.matrixWorld).invert()
      const d = DENSITY[density]
      setCloisonneAnchor(
        fx,
        { viewToObject: R.m, tanHalfFov: Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), around: d.around, height: d.height },
        { viewToObject: R.m2, around: Math.round(d.around * 0.7), height: d.height * 0.8, radius: 0.9, yMin: -0.4, yMax: 1.4 },
      )
    }
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#c8d4ff', '#2a1a14', 0.35]} />
      <group ref={lights}>
      <primitive object={R.target} position={[0, 1.4, 0]} />
      <spotLight
        ref={key}
        position={[-3.5, 7.5, 6]}
        angle={0.42}
        penumbra={0.75}
        decay={0}
        intensity={3.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <spotLight ref={rim} position={[4.5, 5, -4]} angle={0.5} penumbra={0.8} decay={0} intensity={1.6} color="#bcd0ff" />
      </group>
      <directionalLight position={[2, 3, 6]} intensity={0.45} color="#fff2e0" />
      <group ref={content} visible={ready}>
        <group ref={rig}>
          {/* the case: velvet back wall and floor */}
          <mesh position={[0, 8, -3.2]} receiveShadow material={R.velvet}>
            <cylinderGeometry args={[9, 9, 24, 72, 1, true, Math.PI * 0.45, Math.PI * 1.1]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow material={R.velvet}>
            <circleGeometry args={[12, 64]} />
          </mesh>
          {/* vase on a rosewood stand */}
          <group position={[-0.55, 0, 0]}>
            <mesh position={[0, 0.16, 0]} castShadow receiveShadow material={R.wood}>
              <cylinderGeometry args={[0.95, 1.08, 0.32, 48]} />
            </mesh>
            <mesh position={[0, 0.34, 0]} castShadow material={R.wood}>
              <cylinderGeometry args={[0.82, 0.92, 0.06, 48]} />
            </mesh>
            <group ref={vase} position={[0, 0.37, 0]}>
              <mesh geometry={R.v.geo} material={R.vaseMat} castShadow receiveShadow />
              <mesh geometry={R.v.geo} material={R.inside} scale={[0.96, 1, 0.96]} />
              {R.rims.map((r, i) => (
                <mesh key={i} geometry={r.geo} material={R.gilt} position={[0, r.y, 0]} rotation={[Math.PI / 2, 0, 0]} />
              ))}
            </group>
          </group>
          {/* tripod censer on a small stand */}
          <group position={[1.35, 0, 1.05]}>
            <mesh position={[0, 0.11, 0]} castShadow receiveShadow material={R.wood}>
              <cylinderGeometry args={[0.66, 0.74, 0.22, 40]} />
            </mesh>
            <group ref={censer} position={[0, 0.22 + 0.3, 0]}>
              {[0, 1, 2].map((i) => {
                const a = (i / 3) * Math.PI * 2
                return <mesh key={i} geometry={R.leg} material={R.gilt} position={[Math.cos(a) * 0.36, -0.13, Math.sin(a) * 0.36]} castShadow />
              })}
              <mesh geometry={R.c.geo} material={R.censerMat} castShadow />
              <mesh geometry={R.lid.geo} material={R.lidMat} position={[0, 0.62, 0]} castShadow />
              <mesh material={R.gilt} position={[0, 0.62 + 0.36, 0]}>
                <sphereGeometry args={[0.09, 20, 14]} />
              </mesh>
              <mesh material={R.gilt} position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.54, 0.025, 8, 72]} />
              </mesh>
              {[-1, 1].map((s) => (
                <mesh key={s} geometry={R.handle} material={R.gilt} position={[s * 0.5, 0.66, 0]} rotation={[0, Math.PI / 2, 0]} />
              ))}
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
    const far = aspect < 0.8 ? 12 : 10.5
    camera.position.set(0, 2.6 * (far / 10.5), far)
    // phones: look lower so the display sits in the upper part, clear of the copy
    camera.lookAt(0, aspect < 0.8 ? 0.45 : 1.65, 0)
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function Cloisonne() {
  const [mode, setMode] = useState<CloisonneMode>('jingtai')
  const [density, setDensity] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createCloisonneEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.66)

  useEffect(() => setCloisonneMode(fx, mode), [fx, mode])
  useEffect(() => setCloisonneCell(fx, DENSITY[density].cell), [fx, density])
  // only the vase and censer are enamel; the case and stands pass through
  useEffect(() => setCloisonneGround(fx, false), [fx])

  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; id: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
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
    // glide on, like a turntable given a push
    anim.current = animate(ry, ry.get(), { type: 'inertia', velocity: ry.getVelocity(), power: 0.5, timeConstant: 700 })
  }

  const label = cloisonneModes.find((m) => m.id === mode)!.label
  const pal = ENAMELS[mode]

  return (
    <div
      className={`stage cl${split.open ? ' cl-split' : ''}`}
      style={{ background: BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 2.6, 10.5], fov: FOV, near: 0.5, far: 60 }}>
        <Aim />
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={cloisonneMeta.background} preload={preload} />
        <Display fx={fx} ry={ry} density={density} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy cl-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Cloisonné · 掐丝珐琅
            </p>
            <h1>
              铜丝为界
              <br />
              彩釉为色
            </h1>
            <p className="cl-sub">
              每条轮廓、每处色界都焊上一道鎏金铜丝，大块的地子再用缠枝卷草分成小格；格里填进宝石般的釉料，烧好磨平，釉面有气泡、积釉，高光缓缓扫过。
            </p>
            <div className="cl-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className={`cl-chart ${mode}`} aria-hidden>
                    {[7, 0, 8, 4, 12, 2, 11, 6].map((k, i) => (
                      <motion.i
                        key={k}
                        style={{ background: pal[k] }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 26, delay: 0.06 + i * 0.03 }}
                      />
                    ))}
                  </div>
                  <p>{SPEC[mode]}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={cloisonneModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg cl-cycle" onClick={() => setDensity((d) => (d + 1) % DENSITY.length)}>
              <span>
                掐丝 <b>{DENSITY[density].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="cl-lbl">掐丝密度</span>
              <Seg items={DENSITY.map((d, i) => ({ value: i, label: d.zh }))} value={density} onChange={setDensity} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="cl-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动展台 · 釉面高光缓缓扫过</p>
      </div>
    </div>
  )
}

const css = `
.cl { cursor: grab; touch-action: none; }
.cl:active { cursor: grabbing; }
.cl canvas { display: block; }
.cl-copy { pointer-events: none !important; }
.cl-copy .scrim { --soft-bg: ${BG}; }
.cl-copy .kicker i { background: #e2b04a; box-shadow: 0 0 10px #e2b04a; }
.cl-copy h1 { font-size: clamp(40px, 4.4vw, 62px); }
.cl-sub { max-width: 410px; }
.cl-spec { margin-top: 24px; min-height: 76px; }
.cl-chart { display: flex; gap: 6px; }
.cl-chart i {
  width: 22px; height: 22px; border-radius: 6px;
  box-shadow: 0 0 0 2px #d9a84a, inset 0 2px 3px rgba(255,255,255,.35), inset 0 -3px 5px rgba(0,0,0,.25);
}
.cl-chart.silver i { box-shadow: 0 0 0 2px #c9ced8, inset 0 2px 3px rgba(255,255,255,.35), inset 0 -3px 5px rgba(0,0,0,.25); }
.cl-chart.painted i { border-radius: 50%; box-shadow: 0 0 0 1px rgba(255,255,255,.25), inset 0 2px 3px rgba(255,255,255,.35); }
.cl-spec p { margin: 14px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.cl-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.cl-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.cl-cycle b { font-weight: 600; color: var(--fg); }
.cl .hint { transition: opacity .4s; }
.cl-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .cl-copy { transition: opacity .4s; }
  .cl-split .cl-copy { opacity: 0; }
  .cl-sub { display: none; }
  .cl-copy h1 { font-size: 34px; }
  .cl-spec { margin-top: 12px; min-height: 0; }
  .cl-chart i { width: 16px; height: 16px; }
  .cl .dock .seg { padding: 0 9px; }
  .cl .dock .dock-sep { margin: 0 1px; }
}
`
