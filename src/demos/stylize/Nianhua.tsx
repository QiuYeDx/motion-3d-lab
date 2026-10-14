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
  NIANHUA_BLOCKS,
  createNianhuaEffect,
  nianhuaMeta,
  nianhuaModes,
  nianhuaPrintStage,
  printNianhua,
  setNianhuaMode,
  setNianhuaScale,
  type NianhuaMode,
} from './effects/nianhua'

/*
 * 木版年画 · 连年有余 — a chubby child hugging a big carp among lotus, two lanterns and a 福 diamond, inside a
 * printed border (red band, yellow 回纹, waves along the bottom). Everything is primitives + canvas textures in
 * the reference colours the nianhua effect cuts its blocks for. The carp's tail flicks, lanterns sway.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const C = {
  red: '#d8302a',
  carp: '#e0472b',
  yellow: '#f2c02a',
  pink: '#ec6f9a',
  green: '#2fa060',
  blue: '#3a62d0',
  purple: '#7d55c8',
  skin: '#f6dcc6',
  black: '#0b0a0a',
  cream: '#f4ecda',
}
const NOTE: Record<NianhuaMode, string> = {
  yangliuqing: '细线 · 七色 · 手绘开脸与晕染',
  taohuawu: '桃红明黄 · 对比强烈 · 木纹最重',
  zhuxianzhen: '粗墨线 · 四色 · 套版错位最大',
}
const SWATCH: Record<string, string> = {
  墨线版: '#1d1713',
  黄版: '#f2c02a',
  红版: '#d8302a',
  桃红版: '#ec6f9a',
  绿版: '#2fa060',
  蓝版: '#3a62d0',
  紫版: '#7d55c8',
  开脸: '#f4b7b9',
}
const PANEL = { w: 6.2, h: 5.0, z: -1.3 }

/* ------------------------------------------------------------------ canvas textures */

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  draw(cv.getContext('2d')!)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** the print's border: black rules, red band with a yellow 回纹, corner flowers, waves along the bottom */
function panelTexture() {
  const W = 1240
  const H = 1000
  return canvasTex(W, H, (c) => {
    c.fillStyle = C.cream
    c.fillRect(0, 0, W, H)
    // waves along the bottom of the picture
    const top = H - 210
    c.fillStyle = C.blue
    c.fillRect(0, top, W, H - top)
    c.strokeStyle = C.cream
    c.lineWidth = 7
    c.lineCap = 'round'
    for (let row = 0; row < 4; row++) {
      const y = top + 34 + row * 46
      const s = 66
      for (let x = -s + (row % 2) * (s / 2); x < W + s; x += s) {
        c.beginPath()
        c.arc(x, y, 26, Math.PI * 1.05, Math.PI * 1.95)
        c.stroke()
        c.beginPath()
        c.arc(x, y, 12, Math.PI * 1.1, Math.PI * 1.9)
        c.stroke()
      }
    }
    // white foam crest line on top of the water
    c.fillStyle = C.cream
    for (let x = 0; x < W + 60; x += 60) {
      c.beginPath()
      c.arc(x, top + 2, 22, Math.PI, 0)
      c.fill()
    }
    // border
    const B = 74
    c.fillStyle = C.red
    c.fillRect(0, 0, W, B)
    c.fillRect(0, H - B, W, B)
    c.fillRect(0, 0, B, H)
    c.fillRect(W - B, 0, B, H)
    // 回纹 in yellow along the band
    c.strokeStyle = C.yellow
    c.lineWidth = 7
    c.lineJoin = 'miter'
    const meander = (x: number, y: number, s: number, rot: number) => {
      c.save()
      c.translate(x, y)
      c.rotate(rot)
      c.beginPath()
      c.moveTo(-s, s)
      c.lineTo(-s, -s)
      c.lineTo(s, -s)
      c.lineTo(s, s * 0.4)
      c.lineTo(-s * 0.35, s * 0.4)
      c.lineTo(-s * 0.35, -s * 0.35)
      c.lineTo(s * 0.35, -s * 0.35)
      c.stroke()
      c.restore()
    }
    const step = 64
    for (let x = B + step / 2; x < W - B; x += step) {
      meander(x, B / 2, 20, 0)
      meander(x, H - B / 2, 20, Math.PI)
    }
    for (let y = B + step / 2; y < H - B; y += step) {
      meander(B / 2, y, 20, -Math.PI / 2)
      meander(W - B / 2, y, 20, Math.PI / 2)
    }
    // corner squares with a four-petal flower
    for (const [x, y] of [
      [0, 0],
      [W - B, 0],
      [0, H - B],
      [W - B, H - B],
    ]) {
      c.fillStyle = C.green
      c.fillRect(x, y, B, B)
      c.fillStyle = C.pink
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4
        c.beginPath()
        c.ellipse(x + B / 2 + Math.cos(a) * 15, y + B / 2 + Math.sin(a) * 15, 13, 8, a, 0, Math.PI * 2)
        c.fill()
      }
      c.fillStyle = C.yellow
      c.beginPath()
      c.arc(x + B / 2, y + B / 2, 8, 0, Math.PI * 2)
      c.fill()
    }
    // black rules
    c.strokeStyle = C.black
    c.lineWidth = 6
    c.strokeRect(3, 3, W - 6, H - 6)
    c.strokeRect(B, B, W - 2 * B, H - 2 * B)
    // a thin inner green rule
    c.strokeStyle = C.green
    c.lineWidth = 10
    c.strokeRect(B + 16, B + 16, W - 2 * B - 32, H - 2 * B - 32)
  })
}

function fuTexture() {
  const N = 512
  return canvasTex(N, N, (c) => {
    c.fillStyle = C.red
    c.fillRect(0, 0, N, N)
    c.strokeStyle = C.yellow
    c.lineWidth = 18
    c.strokeRect(30, 30, N - 60, N - 60)
    c.save()
    c.translate(N / 2, N / 2)
    c.rotate(-Math.PI / 4) // the square hangs as a diamond; keep the character upright
    c.fillStyle = C.black
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.font = `900 ${N * 0.6}px "STKaiti", "KaiTi", "Kaiti SC", "楷体", "Noto Serif CJK SC", "SimSun", serif`
    c.fillText('福', 0, N * 0.03)
    c.restore()
  })
}

/** carp skin: red flank with black-edged scales, yellow belly, a gill line. u = around the body, v = head → tail */
function carpTexture() {
  const W = 1024
  const H = 512
  return canvasTex(W, H, (c) => {
    c.fillStyle = C.carp
    c.fillRect(0, 0, W, H)
    // belly (u ≈ 0.5 faces down)
    c.fillStyle = C.yellow
    c.beginPath()
    c.moveTo(W * 0.37, 0)
    for (let y = 0; y <= H; y += 16) c.lineTo(W * (0.37 + 0.012 * Math.sin(y * 0.09)), y)
    c.lineTo(W * 0.63, H)
    for (let y = H; y >= 0; y -= 16) c.lineTo(W * (0.63 - 0.012 * Math.sin(y * 0.09)), y)
    c.closePath()
    c.fill()
    // scales: rows of half-ellipses bulging toward the head (u spans the girth, v the length, so they are
    // drawn ~4× wider in u to come out round on the body)
    c.strokeStyle = C.black
    c.lineWidth = 5
    const rowH = 21
    const colW = 92
    for (let r = 0; r * rowH + H * 0.28 < H * 0.95; r++) {
      const y = H * 0.28 + r * rowH
      for (let x = (r % 2) * (colW / 2); x < W + colW; x += colW) {
        const u = x / W
        if (u > 0.33 && u < 0.67) continue
        c.beginPath()
        c.ellipse(x, y, colW * 0.5, rowH * 0.95, 0, Math.PI * 1.02, Math.PI * 1.98)
        c.stroke()
      }
    }
    // gill line
    c.lineWidth = 7
    for (const [a, b] of [
      [0.04, 0.35],
      [0.65, 0.96],
    ]) {
      c.beginPath()
      for (let i = 0; i <= 20; i++) {
        const u = a + ((b - a) * i) / 20
        const v = 0.2 + 0.03 * Math.sin(((u - a) / (b - a)) * Math.PI)
        if (i === 0) c.moveTo(u * W, v * H)
        else c.lineTo(u * W, v * H)
      }
      c.stroke()
    }
  })
}

/** fins: red root running into yellow tips, black rays */
function finTexture() {
  const N = 256
  return canvasTex(N, N, (c) => {
    const g = c.createLinearGradient(0, 0, N, 0)
    g.addColorStop(0, C.carp)
    g.addColorStop(0.5, C.carp)
    g.addColorStop(0.56, C.yellow)
    g.addColorStop(1, C.yellow)
    c.fillStyle = g
    c.fillRect(0, 0, N, N)
    c.strokeStyle = C.black
    c.lineWidth = 4
    for (let i = 0; i <= 10; i++) {
      c.beginPath()
      c.moveTo(0, N / 2)
      c.lineTo(N, (i / 10) * N)
      c.stroke()
    }
  })
}

function leafTexture() {
  const N = 512
  return canvasTex(N, N, (c) => {
    c.fillStyle = C.green
    c.fillRect(0, 0, N, N)
    c.strokeStyle = C.black
    c.lineWidth = 6
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2
      c.beginPath()
      c.moveTo(N / 2, N / 2)
      c.quadraticCurveTo(
        N / 2 + Math.cos(a + 0.25) * N * 0.22,
        N / 2 + Math.sin(a + 0.25) * N * 0.22,
        N / 2 + Math.cos(a) * N * 0.47,
        N / 2 + Math.sin(a) * N * 0.47,
      )
      c.stroke()
    }
    c.fillStyle = C.yellow
    c.beginPath()
    c.arc(N / 2, N / 2, 16, 0, Math.PI * 2)
    c.fill()
  })
}

/** shape uvs → 0..1 over the bounding box */
function normalizeUv(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  const b = g.boundingBox!
  const uv = g.attributes.uv as THREE.BufferAttribute
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - b.min.x) / (b.max.x - b.min.x), (p.getY(i) - b.min.y) / (b.max.y - b.min.y))
  uv.needsUpdate = true
  return g
}

/* ------------------------------------------------------------------ pieces */

const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra })

const UP = new THREE.Vector3(0, 1, 0)
/** a capsule from a to b (a sleeve / arm / leg) */
function Limb({ a, b, r, m }: { a: [number, number, number]; b: [number, number, number]; r: number; m: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const d = B.clone().sub(A)
    return {
      pos: A.clone().add(B).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()),
      len: d.length(),
    }
  }, [a, b])
  return (
    <mesh position={pos} quaternion={quat} material={m}>
      <capsuleGeometry args={[r, len, 8, 20]} />
    </mesh>
  )
}

function Lantern({ position, phase, M }: { position: [number, number, number]; phase: number; M: Mats }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.z = Math.sin(clock.elapsedTime * 1.25 + phase) * 0.09 + Math.sin(clock.elapsedTime * 0.5 + phase) * 0.03
  })
  return (
    <group position={position} ref={g}>
      <mesh position={[0, -0.25, 0]} material={M.black}>
        <cylinderGeometry args={[0.012, 0.012, 0.5, 6]} />
      </mesh>
      <group position={[0, -0.85, 0]}>
        <mesh scale={[0.46, 0.38, 0.46]} material={M.lantern}>
          <sphereGeometry args={[1, 40, 24]} />
        </mesh>
        <mesh position={[0, 0.36, 0]} material={M.yellow}>
          <cylinderGeometry args={[0.2, 0.24, 0.1, 24]} />
        </mesh>
        <mesh position={[0, -0.36, 0]} material={M.yellow}>
          <cylinderGeometry args={[0.24, 0.2, 0.1, 24]} />
        </mesh>
        <mesh position={[0, -0.62, 0]} material={M.yellow}>
          <cylinderGeometry args={[0.07, 0.13, 0.42, 16]} />
        </mesh>
      </group>
    </group>
  )
}

function Lotus({ position, scale = 1, rot = 0, M }: { position: [number, number, number]; scale?: number; rot?: number; M: Mats }) {
  const petal = useMemo(() => new THREE.SphereGeometry(1, 20, 12).translate(0, 1, 0), [])
  useEffect(() => () => petal.dispose(), [petal])
  const rings: [number, number, number][] = [
    [7, 1.05, 0],
    [6, 0.62, 0.4],
    [4, 0.25, 0.9],
  ]
  return (
    <group position={position} scale={scale} rotation={[0.35, 0, rot]}>
      {rings.map(([n, tilt, off], ri) =>
        Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 + off
          return (
            <group key={`${ri}-${i}`} rotation={[0, a, 0]}>
              <mesh geometry={petal} rotation={[tilt, 0, 0]} scale={[0.16, 0.36 - ri * 0.03, 0.06]} material={M.pink} />
            </group>
          )
        }),
      )}
      <mesh position={[0, 0.2, 0]} material={M.yellow}>
        <cylinderGeometry args={[0.13, 0.09, 0.14, 20]} />
      </mesh>
    </group>
  )
}

type Mats = ReturnType<typeof makeMats>
function makeMats() {
  return {
    skin: mat(C.skin, { roughness: 0.9 }),
    red: mat(C.red),
    yellow: mat(C.yellow),
    pink: mat(C.pink),
    green: mat(C.green),
    blue: mat(C.blue),
    purple: mat(C.purple),
    black: mat(C.black, { roughness: 0.9 }),
    white: new THREE.MeshBasicMaterial({ color: C.cream }),
    lantern: mat(C.red, { roughness: 0.85 }),
  }
}

function Carp({ M }: { M: Mats }) {
  const tail = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const tex = useMemo(() => ({ skin: carpTexture(), fin: finTexture() }), [])
  const geo = useMemo(() => {
    const bodyG = new THREE.SphereGeometry(1, 64, 40).rotateZ(-Math.PI / 2)
    const t = new THREE.Shape()
    t.moveTo(0, 0.16)
    t.quadraticCurveTo(0.45, 0.35, 0.95, 0.78)
    t.quadraticCurveTo(0.72, 0.28, 0.62, 0)
    t.quadraticCurveTo(0.72, -0.28, 0.95, -0.78)
    t.quadraticCurveTo(0.45, -0.35, 0, -0.16)
    t.closePath()
    const tailG = normalizeUv(new THREE.ShapeGeometry(t, 24))
    const d = new THREE.Shape()
    d.moveTo(0, 0)
    d.quadraticCurveTo(0.3, 0.55, 1.2, 0.42)
    d.quadraticCurveTo(1.0, 0.2, 1.25, 0)
    d.closePath()
    const dorsalG = normalizeUv(new THREE.ShapeGeometry(d, 16))
    const f = new THREE.Shape()
    f.moveTo(0, 0)
    f.quadraticCurveTo(0.2, 0.2, 0.5, 0.12)
    f.quadraticCurveTo(0.42, -0.05, 0.5, -0.18)
    f.quadraticCurveTo(0.2, -0.1, 0, 0)
    const finG = normalizeUv(new THREE.ShapeGeometry(f, 12))
    const whisker = (s: number) =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0.18, -0.12 * s, 0.05),
          new THREE.Vector3(0.28, -0.32 * s, 0.1),
          new THREE.Vector3(0.22, -0.5 * s, 0.12),
        ]),
        24,
        0.018,
        6,
      )
    return { bodyG, tailG, dorsalG, finG, w1: whisker(1), w2: whisker(0.8) }
  }, [])
  useEffect(
    () => () => {
      Object.values(geo).forEach((g) => g.dispose())
      Object.values(tex).forEach((t) => t.dispose())
    },
    [geo, tex],
  )
  const skinM = useMemo(() => new THREE.MeshStandardMaterial({ map: tex.skin, roughness: 0.75 }), [tex])
  const finM = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex.fin,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    [tex],
  )
  useEffect(
    () => () => {
      skinM.dispose()
      finM.dispose()
    },
    [skinM, finM],
  )
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // a lazy flick every couple of seconds
    const flick = Math.sin(t * 2.2) * 0.22 + Math.pow(Math.max(0, Math.sin(t * 0.9)), 6) * 0.45 * Math.sin(t * 9)
    if (tail.current) tail.current.rotation.y = flick
    if (body.current) body.current.rotation.z = Math.sin(t * 1.1) * 0.025
  })
  return (
    <group ref={body}>
      <mesh geometry={geo.bodyG} scale={[1.3, 0.6, 0.38]} material={skinM} />
      {/* eye */}
      <mesh position={[0.92, 0.17, 0.26]} scale={[0.13, 0.13, 0.06]} material={M.white}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh position={[0.95, 0.18, 0.31]} scale={[0.07, 0.07, 0.04]} material={M.black}>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      {/* mouth */}
      <mesh position={[1.28, -0.06, 0.06]} scale={[0.07, 0.11, 0.12]} material={M.pink}>
        <sphereGeometry args={[1, 20, 12]} />
      </mesh>
      <mesh geometry={geo.w1} position={[1.2, -0.08, 0.12]} material={M.black} />
      <mesh geometry={geo.w2} position={[1.12, -0.12, 0.2]} rotation={[0, -0.4, 0.3]} material={M.black} />
      {/* dorsal fin along the back */}
      <mesh geometry={geo.dorsalG} position={[-0.75, 0.5, 0]} rotation={[0, 0, -0.05]} material={finM} />
      {/* pectoral + pelvic fins */}
      <mesh geometry={geo.finG} position={[0.55, -0.32, 0.33]} rotation={[0.2, 0.3, -2.4]} material={finM} />
      <mesh geometry={geo.finG} position={[-0.3, -0.5, 0.25]} rotation={[0.2, 0.2, -2.0]} material={finM} />
      {/* tail */}
      <group ref={tail} position={[-1.22, 0, 0]}>
        <mesh geometry={geo.tailG} rotation={[0, Math.PI, 0]} scale={[1.05, 1.05, 1]} material={finM} />
      </group>
    </group>
  )
}

function Child({ M }: { M: Mats }) {
  const g = useRef<THREE.Group>(null)
  const cap = useMemo(() => new THREE.SphereGeometry(0.655, 48, 24, 0, Math.PI * 2, 0, 1.05), [])
  useEffect(() => () => cap.dispose(), [cap])
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = Math.sin(clock.elapsedTime * 1.6) * 0.025
  })
  return (
    <group ref={g}>
      {/* legs: green trousers, crossed in front */}
      <Limb a={[-0.3, -0.62, 0.15]} b={[-0.95, -0.95, 0.75]} r={0.27} m={M.green} />
      <Limb a={[0.3, -0.62, 0.15]} b={[0.95, -0.98, 0.7]} r={0.27} m={M.green} />
      <mesh position={[-1.08, -1.04, 0.95]} scale={[0.2, 0.17, 0.26]} material={M.skin}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      <mesh position={[1.08, -1.06, 0.9]} scale={[0.2, 0.17, 0.26]} material={M.skin}>
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
      {/* body + 肚兜 */}
      <mesh position={[0, -0.05, 0]} scale={[0.72, 0.78, 0.6]} material={M.skin}>
        <sphereGeometry args={[1, 40, 28]} />
      </mesh>
      <mesh position={[0, -0.1, 0.2]} scale={[0.66, 0.66, 0.5]} material={M.red}>
        <sphereGeometry args={[1, 40, 28]} />
      </mesh>
      <mesh position={[0, 0.55, 0.32]} rotation={[1.25, 0, 0]} material={M.yellow}>
        <torusGeometry args={[0.36, 0.045, 12, 40]} />
      </mesh>
      {/* 长命锁 */}
      <mesh position={[0, 0.25, 0.7]} scale={[0.2, 0.13, 0.05]} material={M.yellow}>
        <sphereGeometry args={[1, 24, 12]} />
      </mesh>
      {/* head */}
      <group position={[0, 1.08, 0.12]}>
        <mesh scale={[1.04, 0.96, 0.95]} material={M.skin}>
          <sphereGeometry args={[0.62, 56, 40]} />
        </mesh>
        <mesh geometry={cap} rotation={[-0.42, 0, 0]} scale={[1.04, 0.96, 0.95]} material={M.black} />
        {/* buns with red ribbons */}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 0.44, 0.52, -0.05]}>
            <mesh material={M.black}>
              <sphereGeometry args={[0.2, 24, 16]} />
            </mesh>
            <mesh position={[0, -0.14, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.red}>
              <torusGeometry args={[0.13, 0.045, 10, 28]} />
            </mesh>
          </group>
        ))}
        {/* face */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[s * 0.21, 0.03, 0.55]} scale={[0.055, 0.075, 0.03]} material={M.black}>
              <sphereGeometry args={[1, 16, 12]} />
            </mesh>
            <mesh position={[s * 0.22, 0.17, 0.53]} rotation={[0, 0, s * -0.15]} scale={[0.09, 0.018, 0.02]} material={M.black}>
              <sphereGeometry args={[1, 16, 8]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.2, 0.555]} scale={[0.07, 0.045, 0.03]} material={M.red}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
        <mesh position={[0, 0.3, 0.52]} scale={[0.045, 0.045, 0.02]} material={M.red}>
          <sphereGeometry args={[1, 16, 12]} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

function Scene({ ry, rx, fx, onReady }: { ry: MotionValue<number>; rx: MotionValue<number>; fx: StylizeEffect; onReady: () => void }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const subject = useRef<THREE.Group>(null)
  const M = useMemo(makeMats, [])
  const tex = useMemo(() => ({ panel: panelTexture(), fu: fuTexture(), leaf: leafTexture() }), [])
  useEffect(
    () => () => {
      Object.values(M).forEach((m) => m.dispose())
      Object.values(tex).forEach((t) => t.dispose())
    },
    [M, tex],
  )
  const t = useRef(0)

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    // fit the print into its slot: right of the copy on desktop, above it on phones, centred for posters
    const W = size.width
    const H = size.height
    const mobile = W < 760
    let r: { x: number; y: number; w: number; h: number }
    if (POSTER) r = { x: 40, y: 40, w: W - 80, h: H - 80 }
    else if (mobile) r = { x: 12, y: 70, w: W - 24, h: Math.max(240, H - 70 - 290) }
    else {
      const x0 = Math.max(W * 0.37, 500)
      r = { x: x0, y: 80, w: W - x0 - 48, h: H - 80 - 96 }
    }
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const dH = (PANEL.h * H) / (r.h * 2 * tan)
    const dW = (PANEL.w * H) / (r.w * 2 * tan)
    const D = Math.max(dH, dW) - PANEL.z
    // lines are sized in CSS px: thin them a little when the whole print is small (phones)
    setNianhuaScale(fx, THREE.MathUtils.clamp((PANEL.h * H) / (2 * tan * (D + PANEL.z)) / 560, 0.62, 1))
    camera.position.set(0, 0, D)
    camera.lookAt(0, 0, 0)
    camera.setViewOffset(W, H, -(r.x + r.w / 2 - W / 2), -(r.y + r.h / 2 - H / 2), W, H)
    if (subject.current) {
      const sway = POSTER ? 0 : Math.sin(t.current * 0.35) * 0.12
      subject.current.rotation.set(rx.get(), sway + ry.get(), 0)
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#d9cbb5', 1.1]} />
      <directionalLight position={[-3, 5, 6]} intensity={2.4} />
      <directionalLight position={[4, 1, 3]} intensity={0.6} />

      <group ref={content} visible={ready}>
        {/* the printed border + water */}
        <mesh position={[0, 0, PANEL.z]}>
          <planeGeometry args={[PANEL.w, PANEL.h]} />
          <meshBasicMaterial map={tex.panel} toneMapped={false} />
        </mesh>
        {/* 福 diamond, top left */}
        <mesh position={[-2.05, 1.42, PANEL.z + 0.05]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[1.0, 1.0]} />
          <meshBasicMaterial map={tex.fu} toneMapped={false} />
        </mesh>
        <Lantern position={[1.55, 2.12, PANEL.z + 0.5]} phase={0} M={M} />
        <Lantern position={[2.3, 2.12, PANEL.z + 0.35]} phase={1.7} M={M} />

        {/* lotus leaves riding the water */}
        <mesh position={[-2.05, -1.6, -0.6]} rotation={[-1.05, 0, 0.2]} scale={[1.15, 1.15, 1]}>
          <circleGeometry args={[0.72, 48]} />
          <meshStandardMaterial map={tex.leaf} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[2.0, -1.62, -0.5]} rotation={[-1.0, 0, -0.3]} scale={[1.2, 1.2, 1]}>
          <circleGeometry args={[0.72, 48]} />
          <meshStandardMaterial map={tex.leaf} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <Lotus position={[2.15, -1.35, -0.2]} scale={1.05} rot={-0.15} M={M} />
        <Lotus position={[-2.2, -1.32, -0.3]} scale={0.75} rot={0.2} M={M} />

        <group ref={subject} position={[0, -0.25, 0.2]}>
          <group scale={0.92}>
            <Child M={M} />
            {/* the big carp, hugged across the body, head up to the right */}
            <group position={[0.12, -0.42, 0.95]} rotation={[0, -0.1, 0.2]} scale={0.9}>
              <Carp M={M} />
            </group>
            {/* arms around the carp */}
            <Limb a={[-0.6, 0.42, 0.2]} b={[-0.72, -0.3, 1.2]} r={0.17} m={M.skin} />
            <Limb a={[0.6, 0.42, 0.2]} b={[0.42, 0.05, 1.3]} r={0.17} m={M.skin} />
            <mesh position={[-0.7, -0.38, 1.33]} material={M.skin}>
              <sphereGeometry args={[0.19, 20, 14]} />
            </mesh>
            <mesh position={[0.4, 0.0, 1.43]} material={M.skin}>
              <sphereGeometry args={[0.19, 20, 14]} />
            </mesh>
            {/* bangles */}
            <mesh position={[-0.71, -0.22, 1.11]} rotation={[0.95, 0, -0.1]} material={M.yellow}>
              <torusGeometry args={[0.17, 0.04, 10, 28]} />
            </mesh>
            <mesh position={[0.44, 0.08, 1.16]} rotation={[1.2, 0, 0.2]} material={M.yellow}>
              <torusGeometry args={[0.17, 0.04, 10, 28]} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Nianhua() {
  const fx = useMemo(() => createNianhuaEffect({ mode: 'yangliuqing' }), [])
  const orig = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const [mode, setMode] = useState<NianhuaMode>('yangliuqing')
  const [mobile] = useState(MOBILE)
  const [stage, setStage] = useState({ stage: -1, label: '' })
  const split = useOriginalSplit()
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const ry = useMotionValue(0)
  const rx = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setNianhuaMode(fx, mode), [fx, mode])
  // mirror the print run in the copy
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nianhuaPrintStage(fx)
      setStage((o) => (o.stage === s.stage ? o : s))
    }, 90)
    return () => window.clearInterval(id)
  }, [fx])

  // idle: the next workshop prints a fresh sheet
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => nianhuaModes[(nianhuaModes.findIndex((x) => x.id === m) + 1) % nianhuaModes.length].id)
      printNianhua(fx)
    }, 10000)
    return () => window.clearInterval(id)
  }, [fx])

  // drag to turn the child; coasts on release, then eases home
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.006, -1.3, 1.3))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.35, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(ry, ry.get(), {
        type: 'inertia',
        velocity: ry.getVelocity(),
        power: 0.3,
        timeConstant: 500,
        min: -1.3,
        max: 1.3,
        bounceStiffness: 140,
        bounceDamping: 18,
      }),
      animate(rx, rx.get(), {
        type: 'inertia',
        velocity: rx.getVelocity(),
        power: 0.25,
        timeConstant: 400,
        min: -0.35,
        max: 0.35,
        bounceStiffness: 160,
        bounceDamping: 18,
      }),
    ]
    home.current = window.setTimeout(() => {
      anims.current = [animate(ry, 0, { type: 'spring', stiffness: 30, damping: 12 }), animate(rx, 0, { type: 'spring', stiffness: 30, damping: 12 })]
    }, 4500)
  }
  useEffect(() => () => window.clearTimeout(home.current), [])

  const Mo = nianhuaModes.find((m) => m.id === mode)!
  const printing = stage.stage >= 0

  return (
    <div className="stage nh" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{css}</style>
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 0, 14], fov: 26 }}
      >
        <Stylize effect={split.on ? orig : fx} prev={split.on ? fx : null} wipe={split.wipe} background={nianhuaMeta.background} preload={preload} />
        <Scene ry={ry} rx={rx} fx={fx} onReady={() => !POSTER && printNianhua(fx)} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label="年画" />

        <div className="nh-copy">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <p className="nh-kicker">
              <b>年画</b>
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
              一版墨线
              <br />
              五色套印
            </h1>
            <p className="nh-sub">
              先印浓墨线版，再一版一版套上黄、红、桃红、绿、蓝、紫。每块色版都和墨线错开一点，颜料把木纹吃进纸里；杨柳青还要手绘开脸，给娃娃脸上添两团粉。
            </p>
            <div className="nh-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={printing ? 'printing' : mode}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i
                    style={{
                      background: printing ? SWATCH[stage.label] : undefined,
                    }}
                    className={printing ? 'on' : ''}
                  />
                  {printing ? `正在印 ${stage.stage + 1}/${NIANHUA_BLOCKS.length + 1} · ${stage.label}` : NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={nianhuaModes.map((m) => ({ value: m.id, label: m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg nh-print"
            onClick={() => {
              poke()
              printNianhua(fx)
            }}
          >
            <span>{mobile ? '重印' : '重新印刷'}</span>
          </button>
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="nh-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动娃娃 · 「重新印刷」看一版版套色</p>
      </div>
    </div>
  )
}

const css = `
.nh { background: ${nianhuaMeta.background}; cursor: grab; touch-action: none; --nh-ink: #2a1712; }
.nh:active { cursor: grabbing; }
.nh canvas { display: block; }
.nh-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(400px, calc(100% - 48px)); pointer-events: none !important; color: var(--nh-ink);
}
.nh-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; font: 600 11px/1 var(--mono); letter-spacing: .14em; }
.nh-kicker b {
  padding: 5px 8px 4px; background: #c8262a; color: #fff3d6; font: 700 12px/1 'Songti SC', 'STSong', 'SimSun', serif; letter-spacing: .2em;
  box-shadow: 1.5px 1px 0 #f0b62a;
}
.nh-kicker span { display: inline-block; opacity: .7; letter-spacing: .06em; }
.nh-copy h1 {
  margin: 0; font: 800 clamp(40px, 4.6vw, 64px)/1.08 'STKaiti', 'KaiTi', 'Kaiti SC', 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'SimSun', serif;
  letter-spacing: .02em;
}
.nh-sub { margin: 22px 0 0; max-width: 370px; font-size: 15px; line-height: 1.8; opacity: .8; }
.nh-spec { margin-top: 20px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .03em; }
.nh-spec span { display: inline-flex; align-items: center; gap: 8px; }
.nh-spec i {
  width: 18px; height: 12px; flex: none; border: 1.5px solid var(--nh-ink); border-radius: 2px;
  background: linear-gradient(90deg, #f2c02a 0 33%, #d8302a 33% 66%, #2fa060 66%);
}
.nh-spec i.on { animation: nh-pulse .62s ease-in-out infinite; }
@keyframes nh-pulse { 50% { transform: translateX(3px); } }
.nh .hint { color: var(--nh-ink); opacity: .7; }
@media (max-width: 760px) {
  .nh-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .nh-copy h1 { font-size: 34px; }
  .nh-sub { display: none; }
  .nh-kicker { margin-bottom: 12px; }
  .nh .dock .seg { padding: 0 10px; }
  .nh .hint { display: none; }
}
`
