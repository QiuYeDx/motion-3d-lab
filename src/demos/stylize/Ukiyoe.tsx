import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import {
  createUkiyoeEffect,
  setUkiyoeDepth,
  setUkiyoeFrame,
  setUkiyoeLineWidth,
  setUkiyoeMode,
  ukiyoeMeta,
  ukiyoeModes,
  type UkiyoeMode,
} from './effects/ukiyoe'

/*
 * 浮世绘 · 浪裏 — a great wave curling over three boats, Fuji small in the trough. The wave is a profile curve
 * (back → crest → lip → curl → hollow face → trough) swept through depth and rebuilt every frame so the lip
 * breathes; instanced foam claws hang from the lip and spray dots fly off the crest. The print sits on its sheet
 * with a border rule and kento marks; the cartouche is a canvas-texture card that rides with the camera.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const C = {
  blue: '#2f5f9e',
  pale: '#a4c6e6',
  foam: '#e6e1d4',
  fuji: '#4e72a2',
  snow: '#e9e5da',
  ochre: '#c8913a',
  skin: '#f1dcbf',
  indigo: '#24406e',
}
const LINE = [
  { zh: '细', css: 0.75 },
  { zh: '中', css: 1.15 },
  { zh: '粗', css: 1.8 },
]
const NOTE: Record<UkiyoeMode, string> = {
  hokusai: '普鲁士蓝 · 三阶平涂 · 天顶晕刷',
  hiroshige: '柔和晕染 · 地平线暖色 · 远景入雾',
  bijinga: '淡彩 · 极细线 · 云母摺底',
}
const SEA_FAR = 70

/* ------------------------------------------------------------------ the wave */

// profile (x, y) from the back base over the crest, round the curl, down the hollow face to the trough
const PROFILE: [number, number][] = [
  [-8.5, -0.3],
  [-6.2, 0.5],
  [-4.4, 1.7],
  [-2.9, 3.0],
  [-1.4, 4.1],
  [0.2, 4.6],
  [1.7, 4.45],
  [2.9, 3.85],
  [3.6, 3.0],
  [3.75, 2.2],
  [3.35, 1.75],
  [2.8, 1.85],
  [2.4, 2.3],
  [1.9, 2.7],
  [1.3, 2.75],
  [0.75, 2.3],
  [0.45, 1.5],
  [0.5, 0.55],
  [0.8, -0.4],
]
const NS = 90 // samples along the profile
const NZ = 70 // samples through depth
const LIP_S = 0.6 // profile parameter of the lip's front

/** the wave's skin, u = profile parameter (back → crest → lip → curl → face), v = depth:
 *  pale flow lines that follow the profile up the back, a pale band under the crest, foam on the lip's tip,
 *  fingers of pale water in the curl's underside */
function waveTexture(seed: number) {
  const W = 2048
  const H = 512
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  let k = seed * 13.7 + 1
  const rnd = () => ((k = (k * 16807) % 2147483647), (k % 10000) / 10000)
  c.fillStyle = C.blue
  c.fillRect(0, 0, W, H)
  c.fillStyle = C.pale
  c.fillRect(W * 0.5, 0, W * 0.1, H)
  // flow lines up the back: each a tapering ribbon at constant depth, ending under the crest
  for (let y = 6; y < H; y += 17 + rnd() * 10) {
    const u0 = 0.06 + rnd() * 0.28
    const u1 = 0.5
    const th = 3 + rnd() * 4
    c.beginPath()
    for (let i = 0; i <= 40; i++) {
      const u = u0 + ((u1 - u0) * i) / 40
      const yy = y + Math.sin(u * 40 + y) * 3
      const w = th * Math.min(1, i / 8)
      if (i === 0) c.moveTo(u * W, yy - w)
      else c.lineTo(u * W, yy - w)
    }
    for (let i = 40; i >= 0; i--) {
      const u = u0 + ((u1 - u0) * i) / 40
      const yy = y + Math.sin(u * 40 + y) * 3
      c.lineTo(u * W, yy + th * Math.min(1, i / 8))
    }
    c.fill()
  }
  // pale tongues reaching from the crest band onto the lip
  for (let y = 0; y < H; y += 22 + rnd() * 16) {
    const len = 0.02 + rnd() * 0.05
    c.beginPath()
    c.moveTo(W * 0.6, y - 6)
    c.quadraticCurveTo(W * (0.6 + len * 0.6), y - 3, W * (0.6 + len), y + 2)
    c.quadraticCurveTo(W * (0.6 + len * 0.5), y + 6, W * 0.6, y + 7)
    c.fill()
  }
  // foam on the tip, with a scalloped edge toward the curl
  c.fillStyle = C.foam
  c.beginPath()
  c.moveTo(W * 0.655, 0)
  for (let y = 0; y <= H; y += 8) c.lineTo(W * (0.655 + 0.008 * Math.sin(y * 0.3)), y)
  for (let y = H; y >= 0; y -= 8) c.lineTo(W * (0.725 + 0.01 * Math.abs(Math.sin(y * 0.15))), y)
  c.closePath()
  c.fill()
  // underside of the curl: pale with blue fingers
  c.fillStyle = C.pale
  c.fillRect(W * 0.725, 0, W * 0.115, H)
  c.fillStyle = C.blue
  for (let y = 4; y < H; y += 26 + rnd() * 10) {
    c.beginPath()
    c.moveTo(W * 0.84, y)
    c.quadraticCurveTo(W * (0.78 + rnd() * 0.02), y + 4, W * (0.745 + rnd() * 0.03), y + 10)
    c.quadraticCurveTo(W * 0.79, y + 14, W * 0.84, y + 16)
    c.fill()
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

type WaveOpts = {
  z0: number
  z1: number
  zPeak: number
  spread: number
  near: number
  slant: number
  scale: number
  phase: number
}

/** wave height through depth: a long tail into the distance, sinking into the sea toward the camera */
const ampOf = (o: WaveOpts, z: number) =>
  z > o.zPeak ? Math.exp(-(((z - o.zPeak) / o.near) ** 2)) : 0.18 + 0.82 * Math.exp(-(((z - o.zPeak) / o.spread) ** 2))

function useWave(o: WaveOpts) {
  return useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      PROFILE.map(([x, y]) => new THREE.Vector3(x, y, 0)),
      false,
      'centripetal',
    )
    const base = curve.getSpacedPoints(NS - 1).map((v) => [v.x, v.y] as [number, number])
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(NS * NZ * 3)
    const uv = new Float32Array(NS * NZ * 2)
    const idx: number[] = []
    for (let j = 0; j < NZ - 1; j++)
      for (let i = 0; i < NS - 1; i++) {
        const a = j * NS + i
        idx.push(a, a + 1, a + NS, a + 1, a + NS + 1, a + NS)
      }
    for (let j = 0; j < NZ; j++)
      for (let i = 0; i < NS; i++) {
        uv[(j * NS + i) * 2] = i / (NS - 1)
        uv[(j * NS + i) * 2 + 1] = j / (NZ - 1)
      }
    g.setIndex(idx)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    const update = (t: number) => {
      for (let j = 0; j < NZ; j++) {
        const z = o.z0 + ((o.z1 - o.z0) * j) / (NZ - 1)
        const a = ampOf(o, z)
        for (let i = 0; i < NS; i++) {
          const s = i / (NS - 1)
          let [x, y] = base[i]
          // the curl breathes: the lip reaches forward and falls back
          const w = Math.max(0, Math.min(1, (s - 0.35) / 0.25)) * (1 - Math.max(0, Math.min(1, (s - 0.86) / 0.08)))
          const br = Math.sin(t * 0.7 + z * 0.35 + o.phase)
          x += w * (0.18 * br + 0.06 * Math.sin(t * 1.7 + z * 1.3 + s * 8))
          y += w * 0.1 * Math.sin(t * 0.7 + z * 0.35 + o.phase + 0.8)
          const X = (x * (0.55 + 0.45 * a) + z * o.slant) * o.scale
          const Y = y * a * o.scale - 0.02 - 0.4 * (1 - Math.min(1, a / 0.2))
          const k = (j * NS + i) * 3
          pos[k] = X
          pos[k + 1] = Y
          pos[k + 2] = z
        }
      }
      ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
      g.computeVertexNormals()
    }
    /** world point on the profile at parameter s, depth z (for claws / spray) */
    const at = (s: number, z: number, t: number, out: THREE.Vector3) => {
      const f = s * (NS - 1)
      const i = Math.min(NS - 2, Math.floor(f))
      const u = f - i
      let x = base[i][0] * (1 - u) + base[i + 1][0] * u
      let y = base[i][1] * (1 - u) + base[i + 1][1] * u
      const a = ampOf(o, z)
      const w = Math.max(0, Math.min(1, (s - 0.35) / 0.25)) * (1 - Math.max(0, Math.min(1, (s - 0.86) / 0.08)))
      x += w * (0.18 * Math.sin(t * 0.7 + z * 0.35 + o.phase) + 0.06 * Math.sin(t * 1.7 + z * 1.3 + s * 8))
      y += w * 0.1 * Math.sin(t * 0.7 + z * 0.35 + o.phase + 0.8)
      return out.set((x * (0.55 + 0.45 * a) + z * o.slant) * o.scale, y * a * o.scale, z)
    }
    update(0)
    return {
      g,
      tex: waveTexture(o.phase),
      update,
      at,
      amp: (z: number) => ampOf(o, z),
    }
  }, [o.z0, o.z1, o.zPeak, o.spread, o.slant, o.scale, o.phase])
}

function Wave({ o, claws = 90, spray = 60, tRef }: { o: WaveOpts; claws?: number; spray?: number; tRef: React.RefObject<number> }) {
  const W = useWave(o)
  const clawRef = useRef<THREE.InstancedMesh>(null)
  const sprayRef = useRef<THREE.InstancedMesh>(null)
  const clawGeo = useMemo(() => {
    // a finger of foam: a tapered, hooked tube
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, -0.18, 0), new THREE.Vector3(0.12, -0.42, 0), new THREE.Vector3(0.0, -0.58, 0)]
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 8, false)
    const p = g.attributes.position as THREE.BufferAttribute
    const c = new THREE.Vector3()
    // taper toward the tip
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / 9)
      const t = ring / 16
      const ct = new THREE.CatmullRomCurve3(pts).getPoint(t, c)
      const k = 1 - t * 0.85
      p.setXYZ(i, ct.x + (p.getX(i) - ct.x) * k, ct.y + (p.getY(i) - ct.y) * k, ct.z + (p.getZ(i) - ct.z) * k)
    }
    g.computeVertexNormals()
    return g
  }, [])
  const seeds = useMemo(() => {
    const r = (n: number) => {
      const x = Math.sin(n * 127.1 + o.phase * 31.7) * 43758.5453
      return x - Math.floor(x)
    }
    return {
      claw: Array.from({ length: claws }, (_, i) => ({
        z: o.z0 + (o.z1 - o.z0) * (0.08 + 0.84 * r(i)),
        s: LIP_S + 0.06 + r(i + 50) * 0.07,
        rot: r(i + 99) * 0.7 - 0.35,
        sc: 0.9 + r(i + 7) * 0.9,
        ph: r(i + 3) * 6,
      })),
      spray: Array.from({ length: spray }, (_, i) => ({
        z: o.z0 + (o.z1 - o.z0) * (0.15 + 0.7 * r(i + 300)),
        up: r(i + 400),
        fw: r(i + 500),
        sc: 0.05 + r(i + 600) * 0.07,
        ph: r(i + 700),
      })),
    }
  }, [claws, spray, o])
  useEffect(
    () => () => {
      W.g.dispose()
      W.tex.dispose()
      clawGeo.dispose()
    },
    [W, clawGeo],
  )
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const v2 = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const t = tRef.current ?? 0
    W.update(t)
    if (clawRef.current) {
      seeds.claw.forEach((c, i) => {
        W.at(c.s, c.z, t, v)
        W.at(c.s + 0.01, c.z, t, v2)
        const a = W.amp(c.z) * o.scale
        dummy.position.copy(v)
        dummy.rotation.set(0, 0, Math.atan2(v2.y - v.y, v2.x - v.x) + Math.PI / 2 + c.rot + Math.sin(t * 1.4 + c.ph) * 0.12)
        dummy.scale.setScalar(c.sc * a * 1.15)
        dummy.updateMatrix()
        clawRef.current!.setMatrixAt(i, dummy.matrix)
      })
      clawRef.current.instanceMatrix.needsUpdate = true
    }
    if (sprayRef.current) {
      seeds.spray.forEach((d, i) => {
        const life = (t * 0.22 + d.ph) % 1
        W.at(LIP_S - 0.08 - d.up * 0.06, d.z, t, v)
        const a = W.amp(d.z) * o.scale
        dummy.position.set(v.x + (0.3 + d.fw * 1.4) * life * a, v.y + (0.25 + d.up * 0.6) * Math.sin(life * Math.PI) * a, v.z)
        dummy.scale.setScalar(d.sc * a * (1 - life * 0.5))
        dummy.updateMatrix()
        sprayRef.current!.setMatrixAt(i, dummy.matrix)
      })
      sprayRef.current.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group>
      <mesh geometry={W.g}>
        <meshStandardMaterial map={W.tex} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={clawRef} args={[clawGeo, undefined, claws]} frustumCulled={false}>
        <meshStandardMaterial color={C.foam} roughness={1} />
      </instancedMesh>
      <instancedMesh ref={sprayRef} args={[undefined, undefined, spray]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={C.foam} roughness={1} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ sea, Fuji, boats, cartouche */

const seaH = (x: number, z: number, t: number) =>
  0.22 * Math.sin(x * 0.45 + z * 0.2 + t * 0.9) +
  0.14 * Math.sin(x * -0.3 + z * 0.55 + t * 0.7 + 1.3) +
  0.1 * Math.sin(x * 1.1 + z * 0.9 + t * 1.6) +
  0.06 * Math.sin(x * -1.7 + z * 1.6 + t * 1.2)

function Sea({ tRef }: { tRef: React.RefObject<number> }) {
  const g = useMemo(() => {
    const geo = new THREE.PlaneGeometry(160, SEA_FAR + 30, 140, 80).rotateX(-Math.PI / 2).translate(0, 0, -(SEA_FAR + 30) / 2 + 28)
    // (created together with the geometry: a separate memo would be run twice under StrictMode and the kept
    // attribute would not be the one on the geometry)
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3))
    return geo
  }, [])
  const col = g.attributes.color as THREE.BufferAttribute
  useEffect(() => () => g.dispose(), [g])
  const cb = useMemo(() => new THREE.Color('#2c5c9a'), [])
  const cp = useMemo(() => new THREE.Color(C.pale), [])
  useFrame(() => {
    const t = tRef.current ?? 0
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const z = p.getZ(i)
      const fade = Math.max(0, Math.min(1, (z + SEA_FAR) / 40))
      const h = seaH(x, z, t)
      p.setY(i, h * fade - 0.15)
      // pale crest lines on the nearer swells
      // contour bands of the swell field read as the net of wave lines in the print
      const band = ((((h + 0.6) * 7) % 1) + 1) % 1
      const crest = z > -40 && band < 0.14 ? cp : cb
      col.setXYZ(i, crest.r, crest.g, crest.b)
    }
    p.needsUpdate = true
    col.needsUpdate = true
    g.computeVertexNormals()
  })
  return (
    <mesh geometry={g}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}

function Fuji() {
  const g = useMemo(() => {
    const geo = new THREE.ConeGeometry(1, 1, 96, 12, true)
    const p = geo.attributes.position as THREE.BufferAttribute
    const uv = geo.attributes.uv as THREE.BufferAttribute
    const col = new Float32Array(p.count * 3)
    const body = new THREE.Color(C.fuji)
    const snow = new THREE.Color(C.snow)
    for (let i = 0; i < p.count; i++) {
      const y = Math.min(p.getY(i) + 0.5, 0.9) // 0 base … 0.9 flat summit
      const a = uv.getX(i) * Math.PI * 2
      const r = Math.pow(1 - y, 1.7) // concave flanks
      p.setXYZ(i, Math.sin(a) * r, y - 0.5, Math.cos(a) * r)
      const line = 0.6 + 0.07 * Math.sin(a * 9) + 0.04 * Math.sin(a * 23 + 1)
      ;(y > line ? snow : body).toArray(col, i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.computeVertexNormals()
    return geo
  }, [])
  useEffect(() => () => g.dispose(), [g])
  return (
    <mesh geometry={g} position={[3.5, 2.0, -58]} scale={[10, 4.6, 10]}>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  )
}

function Boat({ x, z, yaw, tRef }: { x: number; z: number; yaw: number; tRef: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const t = tRef.current ?? 0
    if (!g.current) return
    g.current.position.set(x, seaH(x, z, t) - 0.1, z)
    g.current.scale.setScalar(1.45)
    const d = 0.6
    const fwd = seaH(x + Math.cos(yaw) * d, z - Math.sin(yaw) * d, t) - seaH(x - Math.cos(yaw) * d, z + Math.sin(yaw) * d, t)
    g.current.rotation.set(0, yaw, Math.atan2(fwd, 2 * d) * 1.5)
  })
  return (
    <group ref={g}>
      <mesh scale={[1.9, 0.16, 0.26]}>
        <sphereGeometry args={[1, 32, 12]} />
        <meshStandardMaterial color={C.ochre} roughness={1} />
      </mesh>
      <mesh position={[0, 0.1, 0]} scale={[1.75, 0.04, 0.2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={C.skin} roughness={1} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <group key={i} position={[-1.2 + i * 0.4, 0.2, 0]}>
          <mesh scale={[0.11, 0.13, 0.11]}>
            <sphereGeometry args={[1, 12, 8]} />
            <meshStandardMaterial color={C.indigo} roughness={1} />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <sphereGeometry args={[0.065, 12, 8]} />
            <meshStandardMaterial color={C.skin} roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function cartoucheTexture() {
  const W = 220
  const H = 560
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  c.fillStyle = '#efe2c4'
  c.fillRect(0, 0, W, H)
  c.strokeStyle = '#121212'
  c.lineWidth = 8
  c.strokeRect(10, 10, W - 20, H - 20)
  c.lineWidth = 3
  c.strokeRect(24, 24, W - 48, H - 48)
  c.fillStyle = '#121212'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  const font = (px: number) => `900 ${px}px "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "MS Mincho", "Songti SC", "SimSun", serif`
  c.font = font(66)
  ;['富', '嶽', '浪', '裏'].forEach((ch, i) => c.fillText(ch, W / 2 + 22, 92 + i * 92))
  c.font = font(38)
  ;['三', '景', 'の', '内'].forEach((ch, i) => c.fillText(ch, W / 2 - 52, 112 + i * 46))
  // a small seal
  c.fillStyle = '#b8352a'
  c.fillRect(W / 2 - 74, H - 128, 48, 48)
  c.fillStyle = '#efe2c4'
  c.font = font(22)
  c.fillText('画', W / 2 - 50, H - 104)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ------------------------------------------------------------------ rig */

type Rect = { x: number; y: number; w: number; h: number }
function rectFor(W: number, H: number): Rect {
  if (POSTER) {
    const w = Math.min(W - 120, (H - 120) * 1.48)
    const h = w / 1.48
    return { x: (W - w) / 2, y: (H - h) / 2 - 8, w, h }
  }
  if (W < 760) {
    const w = W - 36
    const h = Math.min(w * 1.15, H - 78 - 300)
    return { x: 18, y: 78 + Math.max(0, (H - 78 - 300 - h) / 2), w, h }
  }
  const x0 = Math.max(W * 0.39, 530)
  const w = Math.min(W - x0 - 64, (H - 230) * 1.48)
  const h = w / 1.48
  const y = 84 + (H - 84 - 128 - h) / 2
  return { x: x0 + (W - x0 - 64 - w) / 2, y, w, h }
}

function Scene({ fx, yaw, pitch }: { fx: StylizeEffect; yaw: MotionValue<number>; pitch: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const tRef = useRef(POSTER ? 3.2 : 0)
  const card = useRef<THREE.Mesh>(null)
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const tex = useMemo(cartoucheTexture, [])
  useEffect(() => () => tex.dispose(), [tex])
  const v = useMemo(() => new THREE.Vector3(), [])
  const big = useMemo<WaveOpts>(
    () => ({
      z0: -18,
      z1: 1,
      zPeak: -6,
      spread: 5.5,
      near: 3.6,
      slant: 0.2,
      scale: 1.9,
      phase: 0,
    }),
    [],
  )
  const small = useMemo<WaveOpts>(
    () => ({
      z0: -6,
      z1: 3.5,
      zPeak: -1,
      spread: 2.6,
      near: 2.2,
      slant: -0.1,
      scale: 0.38,
      phase: 2.1,
    }),
    [],
  )

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) tRef.current += dt
    const W = size.width
    const H = size.height
    const r = rectFor(W, H)
    setUkiyoeFrame(fx, r)
    // the picture keeps ~38° of vertical view (wider for tall phone rects so the wave stays whole)
    const aspect = r.w / r.h
    const vRect = Math.max(38, (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(30)) / aspect) * 180) / Math.PI)
    const fov = (2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(vRect / 2)) * H) / r.h) * 180) / Math.PI
    if (Math.abs(camera.fov - fov) > 0.01) camera.fov = fov
    const yw = yaw.get()
    const pt = pitch.get()
    const R = 23
    const tx = 1.2
    const tz = -4
    camera.position.set(tx + Math.sin(yw) * R, 1.5 + pt * 8, tz + Math.cos(yw) * R)
    camera.lookAt(tx, 3.7 + pt * 2, tz)
    camera.setViewOffset(W, H, -(r.x + r.w / 2 - W / 2), -(r.y + r.h / 2 - H / 2), W, H)
    camera.updateMatrixWorld()
    // cartouche: pinned to the picture's top-left, facing the camera
    if (card.current) {
      const d = 6
      const ch = Math.max(r.h * 0.4, 190)
      const ndcX = ((r.x + r.w - 22 - ch * 0.196) / W) * 2 - 1
      const ndcY = 1 - ((r.y + 20 + ch * 0.5) / H) * 2
      v.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(d).add(camera.position)
      card.current.position.copy(v)
      card.current.quaternion.copy(camera.quaternion)
      const worldPerPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H
      card.current.scale.setScalar(Math.max(r.h * 0.4, 190) * worldPerPx)
    }
  })

  useEffect(() => setUkiyoeDepth(fx, 12, 62, 0.34), [fx])

  return (
    <>
      <hemisphereLight args={['#e6eef5', '#3a4a66', 1.0]} />
      <directionalLight position={[-6, 9, 7]} intensity={2.1} />
      <directionalLight position={[6, 2, -4]} intensity={0.35} />
      <group ref={content} visible={ready}>
        <Sea tRef={tRef} />
        <Fuji />
        <group position={[-6.6, 0, 0]}>
          <Wave o={big} tRef={tRef} claws={120} spray={70} />
        </group>
        <group position={[7.8, 0, 2.5]}>
          <Wave o={small} tRef={tRef} claws={26} spray={0} />
        </group>
        <Boat x={2.6} z={1.5} yaw={0.55} tRef={tRef} />
        <Boat x={5.4} z={-6.5} yaw={0.3} tRef={tRef} />
        <Boat x={-3.2} z={-11} yaw={0.12} tRef={tRef} />
        <mesh ref={card} renderOrder={10}>
          <planeGeometry args={[220 / 560, 1]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Ukiyoe() {
  const fx = useMemo(() => createUkiyoeEffect({ mode: 'hokusai', lineWidth: LINE[1].css }), [])
  const orig = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const [mode, setMode] = useState<UkiyoeMode>('hokusai')
  const [lw, setLw] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit()
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const yaw = useMotionValue(0)
  const pitch = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setUkiyoeMode(fx, mode), [fx, mode])
  useEffect(() => setUkiyoeLineWidth(fx, LINE[lw].css), [fx, lw])

  // idle: walk through the masters
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => ukiyoeModes[(ukiyoeModes.findIndex((x) => x.id === m) + 1) % ukiyoeModes.length].id)
    }, 7000)
    return () => window.clearInterval(id)
  }, [])

  // drag: swing the view round the wave; coasts, then drifts home
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
    yaw.set(THREE.MathUtils.clamp(yaw.get() - (e.clientX - d.x) * 0.0028, -0.6, 0.6))
    pitch.set(THREE.MathUtils.clamp(pitch.get() - (e.clientY - d.y) * 0.0015, -0.12, 0.3))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(yaw, yaw.get(), {
        type: 'inertia',
        velocity: yaw.getVelocity(),
        power: 0.3,
        timeConstant: 450,
        min: -0.6,
        max: 0.6,
        bounceStiffness: 140,
        bounceDamping: 18,
      }),
      animate(pitch, pitch.get(), {
        type: 'inertia',
        velocity: pitch.getVelocity(),
        power: 0.25,
        timeConstant: 380,
        min: -0.12,
        max: 0.3,
        bounceStiffness: 160,
        bounceDamping: 18,
      }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [
        animate(yaw, 0, { type: 'spring', stiffness: 22, damping: 11 }),
        animate(pitch, 0, { type: 'spring', stiffness: 22, damping: 11 }),
      ]
    }, 5000)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const Mo = ukiyoeModes.find((m) => m.id === mode)!

  return (
    <div className="stage uk" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 2, 15], fov: 40, near: 0.5, far: 140 }}
      >
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background={ukiyoeMeta.background} preload={preload} />
        <Scene fx={fx} yaw={yaw} pitch={pitch} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label="浮世绘" />

        <div className="uk-copy">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <p className="uk-kicker">
              <b>浮世絵</b>
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
              细线平涂
              <br />
              天边晕刷
            </h1>
            <p className="uk-sub">
              细而有力的靛蓝轮廓，普鲁士蓝与淡彩只分三阶平涂；天顶一抹ぼかし从深蓝晕进纸白，远海越远越深。富士山很小，就在浪谷里。
            </p>
            <div className="uk-spec">
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
            items={ukiyoeModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          {!mobile && <span className="uk-dock-label">线宽</span>}
          <Seg
            items={LINE.map((d, i) => ({ value: i, label: d.zh }))}
            value={lw}
            onChange={(v) => {
              poke()
              setLw(v)
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
            {split.open && <motion.span layoutId="uk-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动换个角度看浪 · 松手慢慢回正</p>
      </div>
    </div>
  )
}

const css = `
.uk { background: ${ukiyoeMeta.background}; cursor: grab; touch-action: none; --uk-ink: #1b2645; }
.uk:active { cursor: grabbing; }
.uk canvas { display: block; }
.uk-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(390px, calc(100% - 48px)); pointer-events: none !important; color: var(--uk-ink);
}
.uk-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.uk-kicker b {
  padding: 5px 8px 4px; border: 1.5px solid var(--uk-ink); color: var(--uk-ink); background: #f4ead2;
  font: 700 12px/1 'Yu Mincho', 'Hiragino Mincho ProN', 'Songti SC', 'SimSun', serif; letter-spacing: .2em;
}
.uk-kicker span { display: inline-block; opacity: .7; letter-spacing: .06em; }
.uk-copy h1 {
  margin: 0; font: 700 clamp(40px, 4.4vw, 62px)/1.1 'Yu Mincho', 'Hiragino Mincho ProN', 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'SimSun', serif;
  letter-spacing: .03em;
}
.uk-sub { margin: 22px 0 0; max-width: 360px; font-size: 15px; line-height: 1.8; opacity: .8; }
.uk-spec { margin-top: 20px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .03em; }
.uk-spec span { display: inline-flex; align-items: center; gap: 8px; }
.uk-spec i { width: 22px; height: 12px; flex: none; border: 1px solid var(--uk-ink); background: linear-gradient(180deg, #2a4d84, #efe4cc); }
.uk-dock-label { font: 500 11px/1 var(--mono); opacity: .55; padding: 0 2px 0 6px; letter-spacing: .08em; }
.uk .hint { color: var(--uk-ink); opacity: .65; }
@media (max-width: 760px) {
  .uk-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .uk-copy h1 { font-size: 34px; }
  .uk-sub { display: none; }
  .uk-kicker { margin-bottom: 12px; }
  .uk .dock .seg { padding: 0 10px; }
  .uk .hint { display: none; }
}
`
