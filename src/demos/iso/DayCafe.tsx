import { Canvas, useFrame } from '@react-three/fiber'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { createDotGeometry, createDotMaterial, createGlowMaterial, quadGeo } from './isoWarmup'
import { useBakeStatic, useStagedWarmup } from './staticMerge'
import {
  baristaPose,
  buildDay,
  cupsSold,
  DAY,
  demand,
  hourOf,
  personPose,
  SEATS,
  SHOP,
  uOf,
  CLOSE_H,
  OPEN_H,
  type Day,
  type Pose,
} from './dayCafeCore'

/* ================================================================== palette — cream, caramel, espresso, sage */
const C = {
  paving: '#e4dccf',
  paving2: '#d8cebf',
  curb: '#cfc4b4',
  road: '#a7a3a6',
  roadLine: '#f2ead9',
  floor: '#efe3d0',
  wall: '#f5ece0',
  wainscot: '#9fb3a2',
  cap: '#b8743a',
  caramel: '#b8743a',
  caramel2: '#cf8e52',
  espresso: '#5b3a29',
  marble: '#efebe4',
  sage: '#8fae9b',
  terracotta: '#cf7f5c',
  mustard: '#e2b25a',
  chrome: '#c9c6c0',
  dark: '#3a302b',
  glass: '#3f4650',
  leaf: '#7fa274',
  leaf2: '#97b886',
  neighbour: '#dccab4',
  neighbour2: '#c9b39b',
  slate: '#77808c',
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 18),
  ball: new THREE.SphereGeometry(1, 14, 10),
  ico: new THREE.IcosahedronGeometry(1, 0),
  body: new THREE.CapsuleGeometry(0.085, 0.24, 4, 10),
  hair: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
}
const matCache = new Map<string, THREE.MeshLambertMaterial>()
const lam = (c: string) => {
  let m = matCache.get(c)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c })
    matCache.set(c, m)
  }
  return m
}
const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const sstep = (a: number, b: number, v: number) => {
  const k = clamp01((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
type V3 = [number, number, number]
const FLOOR_Y = 0.08
const WALL_H = 2.1
const SLAB = { x0: -5.9, x1: 4.45, z0: -3.95, z1: 4.4 }

/* ================================================================== environment as a function of the hour */
type Key = { h: number; c: string[] }
const BG: Key[] = [
  { h: 0, c: ['#1b1f3a', '#2c3157'] },
  { h: 5.6, c: ['#1d2140', '#343660'] },
  { h: 6.3, c: ['#5d5a86', '#efbfa6'] },
  { h: 7.3, c: ['#f5e4d4', '#f6d6bf'] },
  { h: 9.5, c: ['#f7f0e7', '#efe2d1'] },
  { h: 16.3, c: ['#f7f0e7', '#efe2d1'] },
  { h: 18.2, c: ['#f6d9bf', '#efb48f'] },
  { h: 19.3, c: ['#8b6f92', '#e39d86'] },
  { h: 20.3, c: ['#2f3159', '#56507b'] },
  { h: 22, c: ['#1e2242', '#30345a'] },
  { h: 24, c: ['#1b1f3a', '#2c3157'] },
]
const SKY: Key[] = [
  { h: 0, c: ['#4b5488', '#262842'] },
  { h: 5.8, c: ['#4b5488', '#262842'] },
  { h: 6.6, c: ['#f2c6b6', '#8a7f8c'] },
  { h: 8.5, c: ['#fbf6ee', '#d8c8b4'] },
  { h: 16.5, c: ['#fbf6ee', '#d8c8b4'] },
  { h: 18.6, c: ['#ffd2b0', '#b58c7c'] },
  { h: 19.8, c: ['#8d7aa8', '#4a3e58'] },
  { h: 20.8, c: ['#56609a', '#272a46'] },
  { h: 24, c: ['#4b5488', '#262842'] },
]
const _ka = new THREE.Color()
const _kb = new THREE.Color()
function keyColor(keys: Key[], h: number, i: number, out: THREE.Color) {
  let k = 0
  while (k < keys.length - 2 && keys[k + 1].h <= h) k++
  const a = keys[k]
  const b = keys[k + 1]
  const t = clamp01((h - a.h) / (b.h - a.h))
  _ka.set(a.c[i])
  _kb.set(b.c[i])
  return out.lerpColors(_ka, _kb, t)
}

export type Env = {
  h: number
  el: number
  day: number
  night: number
  shop: number
  sign: number
  street: number
  open: boolean
  sunDir: THREE.Vector3
  sunCol: THREE.Color
  sunI: number
}
function computeEnv(h: number, e: Env) {
  e.h = h
  const el = Math.max(-0.35, Math.sin((Math.PI * (h - 6)) / 13) * 1.05)
  e.el = el
  e.day = sstep(-0.1, 0.3, el)
  e.night = 1 - e.day
  const az = lerp(1.5, -0.3, clamp01((h - 6) / 13))
  if (el > 0) {
    e.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
    e.sunCol.set('#ffa766').lerp(_ka.set('#fff3e3'), sstep(0.08, 0.7, el))
    e.sunI = lerp(1.15, 1.9, sstep(0.2, 1.0, el)) * sstep(-0.01, 0.18, el)
  } else {
    e.sunDir.set(0.55, 0.75, 0.38).normalize()
    e.sunCol.set('#9fb0ff')
    e.sunI = 0.45 * sstep(0, 0.25, -el)
  }
  e.shop = sstep(6.12, 6.22, h) * (1 - sstep(22.85, 23.0, h))
  e.sign = e.shop * sstep(0.85, 0.3, e.day)
  e.street = sstep(0.65, 0.2, e.day)
  e.open = h >= OPEN_H && h < CLOSE_H
  return e
}

/* ================================================================== textures */
const floorTex = canvasTex(256, 256, (g) => {
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#efe3d0' : '#e2d2bb'
      g.fillRect(x * 32, y * 32, 32, 32)
    }
})
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping
floorTex.repeat.set(2.4, 2)
const awningTex = (() => {
  const t = canvasTex(256, 64, (g) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4ead9' : '#b8743a'
      g.fillRect(i * 32, 0, 32, 46)
    }
    // scalloped edge
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4ead9' : '#b8743a'
      g.beginPath()
      g.arc(i * 32 + 16, 46, 16, 0, Math.PI)
      g.fill()
    }
  })
  t.wrapS = THREE.RepeatWrapping
  return t
})()
const menuTex = canvasTex(512, 200, (g) => {
  g.fillStyle = '#2f3431'
  g.fillRect(0, 0, 512, 200)
  g.strokeStyle = '#b8743a'
  g.lineWidth = 10
  g.strokeRect(5, 5, 502, 190)
  g.fillStyle = '#f3ecdf'
  g.font = '600 34px "PingFang SC","Microsoft YaHei",sans-serif'
  g.fillText('MENU', 30, 52)
  g.font = '24px "PingFang SC","Microsoft YaHei",sans-serif'
  const items = [
    ['美式', '18'],
    ['拿铁', '24'],
    ['燕麦拿铁', '26'],
    ['手冲', '32'],
    ['可颂', '15'],
    ['肉桂卷', '18'],
  ]
  items.forEach(([n, p], i) => {
    const x = 30 + (i % 2) * 240
    const y = 98 + Math.floor(i / 2) * 36
    g.fillStyle = '#f3ecdf'
    g.fillText(n, x, y)
    g.fillStyle = '#e2b25a'
    g.fillText(p, x + 160, y)
  })
})
const signTex = canvasTex(512, 128, (g) => {
  g.fillStyle = '#3a302b'
  g.fillRect(0, 0, 512, 128)
  g.fillStyle = '#f6e7c8'
  g.font = '600 56px "PingFang SC","Microsoft YaHei",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('晨光咖啡', 200, 66)
  g.font = '600 34px Georgia, serif'
  g.fillStyle = '#e2b25a'
  g.fillText('CAFÉ', 412, 68)
})
function plateTex(text: string, bg: string, fg: string) {
  return canvasTex(128, 64, (g) => {
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(2, 2, 124, 60, 12)
    g.fill()
    g.fillStyle = fg
    g.font = '700 30px Helvetica, Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 64, 34)
  })
}
const openTex = plateTex('OPEN', '#5f9b74', '#f8f3ea')
const closedTex = plateTex('CLOSED', '#c4574a', '#f8f3ea')

/* ================================================================== helpers */
function B({ p, s, c, rot, cast = true, m, keep }: { p: V3; s: V3; c?: string; rot?: V3; cast?: boolean; m?: THREE.Material; keep?: boolean }) {
  return <mesh geometry={G.box} material={m ?? lam(c!)} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow userData={keep ? { keep: true } : undefined} />
}
function Cyl({ p, r, h, c, cast = true, rot }: { p: V3; r: number; h: number; c: string; cast?: boolean; rot?: V3 }) {
  return <mesh geometry={G.cyl} material={lam(c)} position={p} scale={[r, h, r]} rotation={rot} castShadow={cast} receiveShadow />
}
function Plant({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <Cyl p={[0, 0.11, 0]} r={0.12} h={0.22} c={C.terracotta} />
      <mesh geometry={G.ico} material={lam(C.leaf)} position={[0, 0.36, 0]} scale={[0.2, 0.24, 0.2]} castShadow />
      <mesh geometry={G.ico} material={lam(C.leaf2)} position={[0.07, 0.5, 0.03]} scale={[0.13, 0.15, 0.13]} castShadow />
    </group>
  )
}

/* ================================================================== the street corner */
function Street() {
  const W = SLAB.x1 - SLAB.x0
  const D = SLAB.z1 - SLAB.z0
  return (
    <group>
      {/* slab + road surface */}
      <B p={[(SLAB.x0 + SLAB.x1) / 2, -0.2, (SLAB.z0 + SLAB.z1) / 2]} s={[W, 0.4, D]} c={C.road} cast={false} />
      <B p={[(SLAB.x0 + SLAB.x1) / 2, -0.5, (SLAB.z0 + SLAB.z1) / 2]} s={[W - 0.25, 0.25, D - 0.25]} c="#8d898d" cast={false} />
      {/* sidewalks */}
      <B p={[(SLAB.x0 + 3.0) / 2, 0.03, 1.75]} s={[3.0 - SLAB.x0, 0.06, 1.5]} c={C.paving} cast={false} />
      <B p={[2.25, 0.03, (SLAB.z0 + 1.0) / 2]} s={[1.5, 0.06, 1.0 - SLAB.z0]} c={C.paving} cast={false} />
      <B p={[(SLAB.x0 + 1.5) / 2, 0.03, -3.8]} s={[1.5 - SLAB.x0, 0.06, 0.3]} c={C.paving} cast={false} />
      {/* curbs */}
      <B p={[(SLAB.x0 + 3.0) / 2, 0.035, 2.52]} s={[3.0 - SLAB.x0, 0.07, 0.06]} c={C.curb} cast={false} />
      <B p={[3.02, 0.035, (SLAB.z0 + 2.55) / 2]} s={[0.06, 0.07, 2.55 - SLAB.z0]} c={C.curb} cast={false} />
      {/* paving joints */}
      {Array.from({ length: 12 }, (_, i) => (
        <B key={`j${i}`} p={[SLAB.x0 + 0.4 + i * 0.75, 0.062, 1.75]} s={[0.02, 0.004, 1.5]} c={C.paving2} cast={false} />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <B key={`k${i}`} p={[2.25, 0.062, -3.5 + i * 0.75]} s={[1.5, 0.004, 0.02]} c={C.paving2} cast={false} />
      ))}
      {/* road markings */}
      {Array.from({ length: 7 }, (_, i) => (
        <B key={`d${i}`} p={[SLAB.x0 + 0.5 + i * 1.1, 0.004, 3.45]} s={[0.5, 0.008, 0.06]} c={C.roadLine} cast={false} />
      ))}
      {Array.from({ length: 4 }, (_, i) => (
        <B key={`e${i}`} p={[3.72, 0.004, -3.4 + i * 1.1]} s={[0.06, 0.008, 0.5]} c={C.roadLine} cast={false} />
      ))}
      {/* zebra crossings at the corner */}
      {Array.from({ length: 6 }, (_, i) => (
        <B key={`z${i}`} p={[1.0 + i * 0.3 - 0.75, 0.004, 3.45]} s={[0.16, 0.008, 1.6]} c={C.roadLine} cast={false} />
      ))}
      {Array.from({ length: 5 }, (_, i) => (
        <B key={`y${i}`} p={[3.72, 0.004, 0.9 + i * 0.3 - 0.6]} s={[1.2, 0.008, 0.16]} c={C.roadLine} cast={false} />
      ))}
      {/* street trees + bench */}
      <group position={[-0.5, 0.06, 2.36]}>
        <B p={[0, 0.04, 0]} s={[0.34, 0.08, 0.26]} c={C.curb} />
        <Cyl p={[0, 0.4, 0]} r={0.03} h={0.75} c="#8a6a52" />
        <mesh geometry={G.ico} material={lam(C.leaf)} position={[0, 0.95, 0]} scale={[0.36, 0.34, 0.36]} castShadow />
        <mesh geometry={G.ico} material={lam(C.leaf2)} position={[0.12, 1.12, 0.08]} scale={[0.22, 0.2, 0.22]} castShadow />
      </group>
      <group position={[2.82, 0.06, -1.9]}>
        <B p={[0, 0.04, 0]} s={[0.26, 0.08, 0.34]} c={C.curb} />
        <Cyl p={[0, 0.4, 0]} r={0.03} h={0.75} c="#8a6a52" />
        <mesh geometry={G.ico} material={lam(C.leaf2)} position={[0, 0.95, 0]} scale={[0.34, 0.32, 0.34]} castShadow />
      </group>
      <group position={[-4.9, 0.06, 2.36]}>
        <B p={[0, 0.16, 0]} s={[0.7, 0.04, 0.18]} c={C.caramel} />
        <B p={[0, 0.27, -0.08]} s={[0.7, 0.16, 0.03]} c={C.caramel} />
        <B p={[-0.3, 0.08, 0]} s={[0.04, 0.16, 0.16]} c={C.dark} />
        <B p={[0.3, 0.08, 0]} s={[0.04, 0.16, 0.16]} c={C.dark} />
      </group>
      {/* a-board sign by the door */}
      <group position={[-1.65, 0.06, 1.38]} rotation={[0, 0.3, 0]}>
        <B p={[0, 0.17, 0.03]} s={[0.26, 0.34, 0.02]} rot={[-0.18, 0, 0]} c="#2f3431" />
        <B p={[0, 0.17, -0.03]} s={[0.26, 0.34, 0.02]} rot={[0.18, 0, 0]} c="#2f3431" />
      </group>
    </group>
  )
}

function Neighbour({ env, wins }: { env: React.RefObject<Env>; wins: THREE.MeshLambertMaterial[] }) {
  const x0 = SLAB.x0
  const x1 = -4.22
  const z0 = SLAB.z0
  const z1 = 0.95
  const H = 2.9
  const cx = (x0 + x1) / 2
  const plan = useMemo(() => wins.map((_, i) => ({ on: 18.2 + rnd(i * 3.1) * 1.8, off: 22.3 + rnd(i * 5.7) * 1.6, mOn: 6.0 + rnd(i * 2.2) * 0.6, mOff: 6.9 + rnd(i * 7.3) * 0.9 })), [wins])
  useFrame(() => {
    const h = env.current!.h
    wins.forEach((m, i) => {
      const p = plan[i]
      const lit = (h > p.on && h < p.off) || (h > p.mOn && h < p.mOff) ? 1 : 0
      m.emissiveIntensity += (lit * 0.95 - m.emissiveIntensity) * 0.2
    })
  })
  return (
    <group>
      <B p={[cx, H / 2, (z0 + z1) / 2]} s={[x1 - x0, H, z1 - z0]} c={C.neighbour} />
      <B p={[cx, H + 0.05, (z0 + z1) / 2]} s={[x1 - x0 + 0.08, 0.1, z1 - z0 + 0.08]} c={C.neighbour2} />
      <B p={[cx, 0.95, z1 + 0.01]} s={[x1 - x0, 0.06, 0.04]} c={C.neighbour2} cast={false} />
      {/* upper windows (lit at night) */}
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <mesh key={`${r}${c}`} geometry={G.box} material={wins[r * 2 + c]} position={[x0 + 0.45 + c * 0.8, 1.45 + r * 0.8, z1 + 0.01]} scale={[0.36, 0.44, 0.03]} />
        )),
      )}
      {/* ground floor: a little bakery with a window + door */}
      <mesh geometry={G.box} material={wins[4]} position={[x0 + 0.55, 0.45, z1 + 0.01]} scale={[0.7, 0.5, 0.03]} />
      <B p={[x0 + 1.3, 0.35, z1 + 0.01]} s={[0.3, 0.6, 0.03]} c="#6d5848" cast={false} />
      <mesh position={[x0 + 0.85, 0.85, z1 + 0.12]} rotation={[0.5, 0, 0]} scale={[1.5, 0.22, 0.02]} geometry={G.box} material={lam(C.sage)} castShadow />
      {/* chimney */}
      <B p={[x0 + 0.4, H + 0.3, z0 + 0.8]} s={[0.22, 0.5, 0.22]} c={C.neighbour2} />
    </group>
  )
}

/* ================================================================== the café */
function Chair({ x, z, face, stool }: { x: number; z: number; face: number; stool?: boolean }) {
  if (stool)
    return (
      <group position={[x, FLOOR_Y, z]}>
        <Cyl p={[0, 0.27, 0]} r={0.08} h={0.03} c={C.espresso} />
        <Cyl p={[0, 0.13, 0]} r={0.015} h={0.26} c={C.dark} />
      </group>
    )
  return (
    <group position={[x, FLOOR_Y, z]} rotation={[0, face, 0]}>
      <B p={[0, 0.17, 0]} s={[0.2, 0.03, 0.2]} c={C.caramel} />
      <B p={[-0.09, 0.3, 0]} s={[0.03, 0.24, 0.2]} c={C.caramel} />
      <B p={[0, 0.08, 0]} s={[0.04, 0.16, 0.04]} c={C.dark} />
    </group>
  )
}
function Table({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, FLOOR_Y, z]}>
      <Cyl p={[0, 0.3, 0]} r={0.27} h={0.03} c={C.marble} />
      <Cyl p={[0, 0.15, 0]} r={0.025} h={0.3} c={C.dark} />
      <Cyl p={[0, 0.01, 0]} r={0.12} h={0.02} c={C.dark} />
    </group>
  )
}

function Cafe({ env, lamps, signMat }: { env: React.RefObject<Env>; lamps: THREE.MeshLambertMaterial; signMat: THREE.MeshLambertMaterial }) {
  const { x0, x1, z0, z1 } = SHOP
  const T = 0.2
  const floorMat = useMemo(() => new THREE.MeshLambertMaterial({ map: floorTex }), [])
  const awnMat = useMemo(() => new THREE.MeshLambertMaterial({ map: awningTex, alphaTest: 0.5, side: THREE.DoubleSide }), [])
  const awnMat2 = useMemo(() => {
    const t = awningTex.clone()
    t.repeat.set(1.1, 1)
    t.needsUpdate = true
    return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide })
  }, [])
  useMemo(() => {
    awningTex.repeat.set(1.4, 1)
  }, [])
  const menuMat = useMemo(() => new THREE.MeshLambertMaterial({ map: menuTex }), [])
  const plate = useRef<THREE.Group>(null)
  const hourHand = useRef<THREE.Group>(null)
  const minHand = useRef<THREE.Group>(null)
  const openMat = useMemo(() => new THREE.MeshLambertMaterial({ map: openTex, emissive: new THREE.Color('#ffffff'), emissiveMap: openTex, emissiveIntensity: 0 }), [])
  const closedMat = useMemo(() => new THREE.MeshLambertMaterial({ map: closedTex }), [])
  useFrame(() => {
    const e = env.current!
    // OPEN ↔ CLOSED: flips over ~6 clock minutes at opening and closing time
    const k = sstep(OPEN_H - 0.05, OPEN_H + 0.05, e.h) * (1 - sstep(CLOSE_H - 0.05, CLOSE_H + 0.05, e.h))
    if (plate.current) plate.current.rotation.y = (1 - k) * Math.PI
    openMat.emissiveIntensity = 0.35 * e.sign
    if (hourHand.current) hourHand.current.rotation.x = -((e.h % 12) / 12) * Math.PI * 2
    if (minHand.current) minHand.current.rotation.x = -(e.h % 1) * Math.PI * 2
  })
  const posts: V3[] = [
    [-2.15, 0, z1],
    [-0.6, 0, z1],
    [0.45, 0, z1],
    [x1, 0, z1],
    [x1, 0, -2.4],
    [x1, 0, -1.2],
    [x1, 0, 0.0],
    [-3.78, 0, z1],
  ]
  return (
    <group>
      {/* floor */}
      <mesh geometry={G.box} material={[lam(C.caramel), lam(C.caramel), floorMat, lam(C.caramel), lam(C.caramel), lam(C.caramel)]} position={[(x0 + x1) / 2 - T / 2, FLOOR_Y / 2, (z0 + z1) / 2 - T / 2]} scale={[x1 - x0 + T, FLOOR_Y, z1 - z0 + T]} receiveShadow />
      {/* back walls with wainscot and cut caps */}
      <B p={[x0 - T / 2, WALL_H / 2, (z0 + z1) / 2 - T / 2]} s={[T, WALL_H, z1 - z0 + T]} c={C.wall} />
      <B p={[(x0 + x1) / 2, WALL_H / 2, z0 - T / 2]} s={[x1 - x0, WALL_H, T]} c={C.wall} />
      <B p={[x0 + 0.01, FLOOR_Y + 0.3, (z0 + z1) / 2]} s={[0.02, 0.6, z1 - z0]} c={C.wainscot} cast={false} />
      <B p={[(x0 + x1) / 2, FLOOR_Y + 0.3, z0 + 0.01]} s={[x1 - x0, 0.6, 0.02]} c={C.wainscot} cast={false} />
      <B p={[x0 + 0.02, FLOOR_Y + 0.61, (z0 + z1) / 2]} s={[0.04, 0.03, z1 - z0]} c={C.caramel} cast={false} />
      <B p={[(x0 + x1) / 2, FLOOR_Y + 0.61, z0 + 0.02]} s={[x1 - x0, 0.03, 0.04]} c={C.caramel} cast={false} />
      <B p={[x0 - T / 2, WALL_H + 0.03, (z0 + z1) / 2 - T / 2]} s={[T + 0.02, 0.06, z1 - z0 + T + 0.02]} c={C.cap} cast={false} />
      <B p={[(x0 + x1) / 2, WALL_H + 0.03, z0 - T / 2]} s={[x1 - x0 + 0.02, 0.06, T + 0.02]} c={C.cap} cast={false} />
      {/* invisible ceiling + side caster so the sun only reaches in through the shopfront */}
      <mesh geometry={G.box} material={ghost} position={[(x0 + x1) / 2, WALL_H + 0.1, (z0 + z1) / 2]} scale={[x1 - x0 + 0.4, 0.1, z1 - z0 + 0.4]} castShadow />
      {/* shopfront: low sills, mullions, header beams, awning valance */}
      <B p={[(-2.15 + x1) / 2, FLOOR_Y + 0.17, z1 - 0.06]} s={[x1 + 2.15, 0.34, 0.12]} c={C.espresso} />
      <B p={[(-2.15 + x1) / 2, FLOOR_Y + 0.35, z1 - 0.06]} s={[x1 + 2.15 + 0.04, 0.03, 0.18]} c={C.caramel2} />
      <B p={[x1 - 0.06, FLOOR_Y + 0.17, (z0 + z1) / 2]} s={[0.12, 0.34, z1 - z0]} c={C.espresso} />
      <B p={[x1 - 0.06, FLOOR_Y + 0.35, (z0 + z1) / 2]} s={[0.18, 0.03, z1 - z0]} c={C.caramel2} />
      {posts.map((p, i) => (
        <B key={i} p={[p[0] - (p[0] === x1 ? 0.03 : 0), WALL_H / 2, p[2] - (p[2] === z1 ? 0.03 : 0)]} s={[0.06, WALL_H, 0.06]} c={C.espresso} />
      ))}
      <B p={[(x0 + x1) / 2, WALL_H - 0.06, z1 - 0.03]} s={[x1 - x0, 0.12, 0.08]} c={C.espresso} />
      <B p={[x1 - 0.03, WALL_H - 0.06, (z0 + z1) / 2]} s={[0.08, 0.12, z1 - z0]} c={C.espresso} />
      <mesh material={awnMat} position={[-2.95, WALL_H - 0.36, z1 + 0.2]} rotation={[-0.62, 0, 0]} castShadow>
        <planeGeometry args={[1.9, 0.5]} />
      </mesh>
      <group position={[x1 + 0.2, WALL_H - 0.36, -1.75]} rotation={[0, Math.PI / 2, 0]}>
        <mesh material={awnMat2} rotation={[-0.62, 0, 0]} castShadow>
          <planeGeometry args={[1.5, 0.5]} />
        </mesh>
      </group>
      {/* shop sign over the door */}
      <mesh geometry={G.box} material={[lam(C.dark), lam(C.dark), lam(C.dark), lam(C.dark), signMat, lam(C.dark)]} position={[-2.0, WALL_H + 0.24, z1 + 0.02]} scale={[1.6, 0.4, 0.06]} castShadow />
      {/* OPEN / CLOSED plate in the door frame */}
      <group position={[-2.3, 1.15, z1 + 0.03]}>
        <B p={[0, 0.2, 0]} s={[0.01, 0.14, 0.01]} c={C.dark} cast={false} />
        <group ref={plate}>
          <mesh material={openMat} position={[0, 0, 0.006]}>
            <planeGeometry args={[0.32, 0.16]} />
          </mesh>
          <mesh material={closedMat} position={[0, 0, -0.006]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.32, 0.16]} />
          </mesh>
        </group>
      </group>
      {/* door mat */}
      <B p={[-2.95, FLOOR_Y + 0.004, 0.7]} s={[0.9, 0.008, 0.4]} c="#a68a6c" cast={false} />

      {/* counter */}
      <B p={[-2.075, FLOOR_Y + 0.2, -2.52]} s={[2.95, 0.4, 0.45]} c={C.caramel} />
      <B p={[-2.075, FLOOR_Y + 0.08, -2.29]} s={[2.95, 0.16, 0.02]} c={C.espresso} cast={false} />
      <B p={[-2.075, FLOOR_Y + 0.415, -2.52]} s={[3.02, 0.03, 0.52]} c={C.marble} />
      {/* till */}
      <group position={[-3.05, FLOOR_Y + 0.43, -2.5]}>
        <B p={[0, 0.04, 0]} s={[0.2, 0.08, 0.16]} c={C.dark} />
        <B p={[0, 0.13, -0.02]} s={[0.16, 0.1, 0.02]} rot={[-0.4, 0, 0]} c="#5b6b72" />
      </group>
      {/* espresso machine */}
      <group position={[-2.1, FLOOR_Y + 0.43, -2.6]}>
        <B p={[0, 0.14, 0]} s={[0.46, 0.28, 0.26]} c={C.chrome} />
        <B p={[0, 0.3, 0]} s={[0.48, 0.03, 0.28]} c={C.espresso} />
        <B p={[0, 0.17, 0.135]} s={[0.4, 0.08, 0.02]} c={C.terracotta} cast={false} />
        {[-0.12, 0.12].map((x) => (
          <Cyl key={x} p={[x, 0.07, 0.15]} r={0.03} h={0.05} c={C.dark} />
        ))}
        {[0, 1, 2].map((i) => (
          <Cyl key={i} p={[-0.15 + i * 0.15, 0.34, -0.05]} r={0.035} h={0.06} c="#fbf6ee" />
        ))}
      </group>
      {/* pastry case */}
      <group position={[-1.1, FLOOR_Y + 0.43, -2.5]}>
        <mesh geometry={G.box} position={[0, 0.12, 0]} scale={[0.8, 0.24, 0.4]}>
          <meshLambertMaterial color="#dfeff0" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        {[-0.26, -0.09, 0.08, 0.25].map((x, i) => (
          <mesh key={x} geometry={G.ball} material={lam(i % 2 ? C.mustard : C.caramel2)} position={[x, 0.05, 0.03]} scale={[0.065, 0.04, 0.05]} />
        ))}
      </group>
      {/* cups stack at the pick-up end */}
      {[0, 1, 2, 3].map((i) => (
        <Cyl key={i} p={[-1.75 + (i % 2) * 0.08, FLOOR_Y + 0.46 + Math.floor(i / 2) * 0.06, -2.6 + (i % 2) * 0.05]} r={0.035} h={0.06} c="#fbf6ee" />
      ))}
      {/* back shelves + menu */}
      {[0.95, 1.3].map((y) => (
        <group key={y}>
          <B p={[-2.1, y, z0 + 0.1]} s={[2.4, 0.03, 0.2]} c={C.espresso} />
          {Array.from({ length: 7 }, (_, i) => (
            <Cyl key={i} p={[-3.1 + i * 0.32, y + 0.08, z0 + 0.1]} r={0.05} h={0.13} c={[C.terracotta, '#fbf6ee', C.sage, C.mustard][(i + Math.round(y * 10)) % 4]} />
          ))}
        </group>
      ))}
      <mesh geometry={G.box} material={[lam(C.caramel), lam(C.caramel), lam(C.caramel), lam(C.caramel), menuMat, lam(C.caramel)]} position={[-2.1, 1.72, z0 + 0.03]} scale={[1.7, 0.66, 0.04]} />
      {/* beam + pendant lamps */}
      <B p={[(x0 + x1) / 2, WALL_H - 0.04, -2.5]} s={[x1 - x0, 0.08, 0.08]} c={C.espresso} />
      {[-3.0, -2.0, -1.0, 0.45].map((x) => (
        <group key={x} position={[x, 0, x > 0 ? -0.6 : -2.5]}>
          <Cyl p={[0, WALL_H - 0.3, 0]} r={0.006} h={0.55} c={C.dark} cast={false} />
          <mesh geometry={G.cyl} material={lam(C.dark)} position={[0, WALL_H - 0.6, 0]} scale={[0.13, 0.08, 0.13]} castShadow />
          <mesh geometry={G.ball} material={lamps} position={[0, WALL_H - 0.66, 0]} scale={0.055} />
        </group>
      ))}
      {x1 > 0 && <B p={[0.45, WALL_H - 0.04, -0.6]} s={[0.08, 0.08, 0.08]} c={C.espresso} cast={false} />}

      {/* left wall: clock that follows the day, art, plants */}
      <group position={[x0 + 0.03, 1.5, -1.1]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={lam(C.espresso)} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.04, 32]} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0.02, 0, 0]} material={lam('#fbf6ee')}>
          <cylinderGeometry args={[0.22, 0.22, 0.02, 32]} />
        </mesh>
        <group ref={hourHand} position={[0.04, 0, 0]}>
          <B p={[0, 0.06, 0]} s={[0.01, 0.13, 0.025]} c={C.dark} cast={false} keep />
        </group>
        <group ref={minHand} position={[0.045, 0, 0]}>
          <B p={[0, 0.09, 0]} s={[0.01, 0.18, 0.016]} c={C.dark} cast={false} keep />
        </group>
      </group>
      <group position={[x0 + 0.03, 1.45, 0.2]}>
        <B p={[0, 0, 0]} s={[0.03, 0.62, 0.48]} c={C.caramel} />
        <B p={[0.02, 0, 0]} s={[0.02, 0.52, 0.38]} c={C.sage} cast={false} />
        <mesh geometry={G.ball} material={lam(C.mustard)} position={[0.03, 0.06, 0.04]} scale={[0.01, 0.1, 0.1]} />
      </group>
      <Plant p={[x0 + 0.3, FLOOR_Y, 0.65]} s={1.1} />
      <Plant p={[x0 + 0.3, FLOOR_Y, -2.0]} s={0.9} />
      <Plant p={[x1 - 0.3, FLOOR_Y, 0.7]} s={0.9} />
      <Plant p={[0.2, FLOOR_Y + 0.43, z1 - 0.06]} s={0.55} />
      <Plant p={[x1 - 0.06, FLOOR_Y + 0.37, -0.6]} s={0.5} />

      {/* seating */}
      <Table x={-1.2} z={-0.68} />
      <Table x={0.45} z={-1.5} />
      <Table x={0.45} z={0.22} />
      <B p={[1.28, FLOOR_Y + 0.37, -2.77]} s={[0.28, 0.03, 1.0]} c={C.marble} />
      <B p={[1.32, FLOOR_Y + 0.18, -2.77]} s={[0.16, 0.36, 0.9]} c={C.espresso} />
      {SEATS.map((s, i) => (
        <Chair key={i} x={s.x} z={s.z} face={s.face + Math.PI} stool={s.stool} />
      ))}
    </group>
  )
}

/* ================================================================== people, cups, steam */
const SHIRTS = ['#c4574a', '#5f8f7d', '#e2b25a', '#6b84a8', '#efe7da', '#8c6a9c', '#7fa274', '#cf8e52', '#4f5a66', '#d9a8a0']
const SKIN = ['#f3d2bd', '#e7bea0', '#c99572', '#f7dfcf']
const HAIR = ['#3a2c25', '#6b4a32', '#c9a26b', '#8d8a86']
const MAXP = 72
const STEAM_SRC = 24
const STEAM_PER = 3

function Crowd({ day, u, env }: { day: Day; u: MotionValue<number>; env: React.RefObject<Env> }) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const hair = useRef<THREE.InstancedMesh>(null)
  const cups = useRef<THREE.InstancedMesh>(null)
  const steam = useRef<THREE.InstancedMesh>(null)
  const steamGeo = useMemo(() => createDotGeometry(STEAM_SRC * STEAM_PER), [])
  const steamMat = useMemo(() => createDotMaterial('#ffffff', 0.8), [])
  const bar = useRef<THREE.Group>(null)
  const pose = useMemo<Pose>(() => ({ vis: 0, x: 0, z: 0, head: 0, moving: false, sit: false, cup: 0, cx: 0, cz: 0, hot: 0 }), [])
  const bpose = useMemo(() => ({ ...pose, act: 0, cupOut: false }), [pose])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() }), [])
  useLayoutEffect(() => {
    // colours are assigned per frame (slots are reused), so mark them all dirty once
    for (let i = 0; i < MAXP; i++) {
      bodies.current!.setColorAt(i, tmp.c.set('#ffffff'))
      heads.current!.setColorAt(i, tmp.c.set('#ffffff'))
      hair.current!.setColorAt(i, tmp.c.set('#ffffff'))
    }
  }, [tmp])
  const sources = useMemo(() => Array.from({ length: STEAM_SRC }, () => ({ x: 0, y: 0, z: 0, k: 0 })), [])

  useFrame((state) => {
    const t = u.get()
    const clock = state.clock.elapsedTime
    const { m, q, e, p, s, c } = tmp
    let n = 0
    let ns = 0
    const zero = () => m.makeScale(0, 0, 0)
    for (const person of day.people) {
      if (t < person.a || t > person.end || n >= MAXP) continue
      personPose(person, t, pose)
      if (pose.vis <= 0) continue
      const k = pose.vis * person.tall
      const bob = pose.moving ? Math.abs(Math.sin(clock * 9 + person.id)) * 0.03 : 0
      const sitDrop = pose.sit ? 0.13 : 0
      const baseY = pose.x > SHOP.x0 && pose.x < SHOP.x1 && pose.z < SHOP.z1 ? FLOOR_Y : 0.06
      e.set(0, pose.head, pose.moving ? Math.sin(clock * 9 + person.id) * 0.05 : 0)
      q.setFromEuler(e)
      p.set(pose.x, baseY + (0.205 + bob - sitDrop) * k, pose.z)
      m.compose(p, q, s.set(k, pose.sit ? k * 0.8 : k, k))
      bodies.current!.setMatrixAt(n, m)
      p.y = baseY + (0.5 + bob - sitDrop * 1.25) * k
      m.compose(p, q, s.set(0.085 * k, 0.085 * k, 0.085 * k))
      heads.current!.setMatrixAt(n, m)
      p.y += 0.012 * k
      m.compose(p, q, s.set(0.092 * k, 0.092 * k, 0.092 * k))
      hair.current!.setMatrixAt(n, m)
      bodies.current!.setColorAt(n, c.set(SHIRTS[person.shirt]))
      heads.current!.setColorAt(n, c.set(SKIN[person.skin]))
      hair.current!.setColorAt(n, c.set(HAIR[person.hair]))
      // cup in hand / on the table
      if (pose.cup) {
        const fx = Math.cos(pose.head)
        const fz = -Math.sin(pose.head)
        if (pose.cup === 2) p.set(pose.cx, FLOOR_Y + 0.345, pose.cz)
        else p.set(pose.x + fx * 0.11 - fz * 0.07, baseY + 0.3 * k + bob, pose.z + fz * 0.11 + fx * 0.07)
        m.compose(p, q.identity(), s.set(0.032, 0.075, 0.032))
        cups.current!.setMatrixAt(n, m)
        if (pose.hot > 0 && ns < STEAM_SRC) {
          const src = sources[ns++]
          src.x = p.x
          src.y = p.y + 0.05
          src.z = p.z
          src.k = pose.hot
        }
      } else cups.current!.setMatrixAt(n, zero())
      n++
    }
    for (let i = n; i < MAXP; i++) {
      zero()
      bodies.current!.setMatrixAt(i, m)
      heads.current!.setMatrixAt(i, m)
      hair.current!.setMatrixAt(i, m)
      cups.current!.setMatrixAt(i, m)
    }
    bodies.current!.instanceMatrix.needsUpdate = true
    heads.current!.instanceMatrix.needsUpdate = true
    hair.current!.instanceMatrix.needsUpdate = true
    cups.current!.instanceMatrix.needsUpdate = true
    bodies.current!.instanceColor!.needsUpdate = true
    heads.current!.instanceColor!.needsUpdate = true
    hair.current!.instanceColor!.needsUpdate = true

    // barista
    baristaPose(day, t, bpose)
    const g = bar.current!
    g.visible = bpose.vis > 0
    if (g.visible) {
      const sway = bpose.act === 2 ? Math.sin(clock * 5) * 0.06 : bpose.act === 3 ? Math.sin(clock * 14) * 0.012 : 0
      const bob = bpose.moving ? Math.abs(Math.sin(clock * 9)) * 0.03 : 0
      const inside = bpose.x > SHOP.x0 && bpose.x < SHOP.x1 && bpose.z < SHOP.z1
      g.position.set(bpose.x + sway, (inside ? FLOOR_Y : 0.06) + bob, bpose.z)
      g.rotation.y = bpose.head
      g.scale.setScalar(bpose.vis)
      const cupMesh = g.children[g.children.length - 1]
      cupMesh.visible = bpose.cupOut
      // machine steam while pulling a shot
      if (bpose.act === 3 && ns < STEAM_SRC) {
        const src = sources[ns++]
        src.x = -2.1
        src.y = FLOOR_Y + 0.62
        src.z = -2.55
        src.k = 1
      }
    }
    // steam wisps (procedural, no state)
    const alpha = steamGeo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute
    for (let i = 0; i < STEAM_SRC; i++) {
      for (let j = 0; j < STEAM_PER; j++) {
        const idx = i * STEAM_PER + j
        if (i >= ns) {
          alpha.setX(idx, 0)
          steam.current!.setMatrixAt(idx, zero())
          continue
        }
        const src = sources[i]
        const age = (clock * 0.7 + j / STEAM_PER + i * 0.37) % 1
        const sc = 0.035 + age * 0.07
        p.set(src.x + Math.sin(age * 6 + i + j) * 0.025, src.y + age * 0.32, src.z + Math.cos(age * 5 + j) * 0.02)
        m.compose(p, q.identity(), s.set(sc, sc, sc))
        steam.current!.setMatrixAt(idx, m)
        alpha.setX(idx, Math.sin(age * Math.PI) * 0.55 * src.k)
      }
    }
    steam.current!.instanceMatrix.needsUpdate = true
    alpha.needsUpdate = true
    void env
  })
  return (
    <>
      <instancedMesh ref={bodies} args={[G.body, lam('#ffffff'), MAXP]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} args={[G.ball, lam('#ffffff'), MAXP]} castShadow frustumCulled={false} />
      <instancedMesh ref={hair} args={[G.hair, lam('#ffffff'), MAXP]} frustumCulled={false} />
      <instancedMesh ref={cups} args={[G.cyl, lam('#fbf6ee'), MAXP]} castShadow frustumCulled={false} />
      <instancedMesh ref={steam} args={[steamGeo, steamMat, STEAM_SRC * STEAM_PER]} frustumCulled={false} renderOrder={4} />
      <group ref={bar}>
        <mesh geometry={G.body} material={lam('#f4efe6')} position={[0, 0.205, 0]} castShadow />
        <mesh geometry={G.box} material={lam(C.espresso)} position={[0.075, 0.17, 0]} scale={[0.04, 0.26, 0.15]} />
        <mesh geometry={G.ball} material={lam(SKIN[1])} position={[0, 0.5, 0]} scale={0.085} castShadow />
        <mesh geometry={G.hair} material={lam(C.espresso)} position={[0, 0.515, 0]} scale={0.093} />
        <mesh geometry={G.cyl} material={lam('#fbf6ee')} position={[0.13, 0.32, 0.05]} scale={[0.032, 0.075, 0.032]} />
      </group>
    </>
  )
}

/* ================================================================== cars */
const CAR_COLS = ['#c4574a', '#6b84a8', '#efe7da', '#5f8f7d', '#e2b25a']
const CAR_V = 2.4
function Cars({ day, u, env }: { day: Day; u: MotionValue<number>; env: React.RefObject<Env> }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const bodyMats = useMemo(() => [0, 1, 2].map(() => new THREE.MeshLambertMaterial({ color: '#ffffff' })), [])
  const headMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#fff6dc', emissive: new THREE.Color('#ffe7a8'), emissiveIntensity: 0 }), [])
  const tailMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#b5463d', emissive: new THREE.Color('#ff3b2e'), emissiveIntensity: 0 }), [])
  // path: along the front road (+x), round the corner, up the side road (−z)
  const path = useMemo(() => {
    const pts: [number, number][] = []
    for (let x = SLAB.x0 - 0.6; x < 2.9; x += 0.2) pts.push([x, 3.1])
    const r = 0.8
    for (let a = 0; a <= 16; a++) {
      const th = (a / 16) * (Math.PI / 2)
      pts.push([2.9 + r * Math.sin(th), 3.1 - r + r * Math.cos(th)])
    }
    for (let z = 3.1 - r - 0.2; z > SLAB.z0 - 0.8; z -= 0.2) pts.push([2.9 + r, z])
    return pts
  }, [])
  const cum = useMemo(() => {
    const c = [0]
    for (let i = 1; i < path.length; i++) c.push(c[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
    return c
  }, [path])
  useFrame(() => {
    const t = u.get()
    const L = cum[cum.length - 1]
    let slot = 0
    for (const car of day.cars) {
      const s = (t - car.t0) * CAR_V
      if (s < 0 || s > L || slot >= 3) continue
      let i = 1
      while (i < cum.length - 1 && cum[i] < s) i++
      const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1])
      const x = path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k
      const z = path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k
      const g = refs.current[slot]!
      g.visible = true
      g.position.set(x, 0, z)
      g.rotation.y = Math.atan2(-(path[i][1] - path[i - 1][1]), path[i][0] - path[i - 1][0])
      bodyMats[slot].color.set(CAR_COLS[car.c])
      slot++
    }
    for (let i = slot; i < 3; i++) refs.current[i]!.visible = false
    const e = env.current!
    headMat.emissiveIntensity = e.street * 1.2
    tailMat.emissiveIntensity = e.street * 0.9
  })
  return (
    <>
      {[0, 1, 2].map((i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} visible={false}>
          <mesh geometry={G.box} material={bodyMats[i]} position={[0, 0.2, 0]} scale={[0.95, 0.2, 0.46]} castShadow />
          <mesh geometry={G.box} material={bodyMats[i]} position={[-0.06, 0.36, 0]} scale={[0.52, 0.16, 0.42]} castShadow />
          <mesh geometry={G.box} material={lam(C.glass)} position={[-0.06, 0.36, 0]} scale={[0.5, 0.11, 0.425]} />
          {[-0.3, 0.3].map((x) =>
            [-0.22, 0.22].map((z) => <mesh key={`${x}${z}`} geometry={G.cyl} material={lam('#2f2b2a')} position={[x, 0.09, z]} rotation={[Math.PI / 2, 0, 0]} scale={[0.09, 0.06, 0.09]} />),
          )}
          <mesh geometry={G.box} material={headMat} position={[0.48, 0.22, 0]} scale={[0.02, 0.06, 0.34]} />
          <mesh geometry={G.box} material={tailMat} position={[-0.48, 0.22, 0]} scale={[0.02, 0.06, 0.34]} />
        </group>
      ))}
    </>
  )
}

/* ================================================================== street lamp + lights */
function Lighting({ env }: { env: React.RefObject<Env> }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const in1 = useRef<THREE.PointLight>(null)
  const in2 = useRef<THREE.PointLight>(null)
  const street = useRef<THREE.PointLight>(null)
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#ffffff', 2)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -9
    cam.right = cam.top = 9
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.02
    l.target.position.set(-1, 0, 0)
    return l
  }, [])
  const AMB_D = useMemo(() => new THREE.Color('#f6eee4'), [])
  const AMB_N = useMemo(() => new THREE.Color('#5b6494'), [])
  useFrame(() => {
    const e = env.current!
    sun.position.set(-1 + e.sunDir.x * 18, e.sunDir.y * 18, e.sunDir.z * 18)
    sun.color.copy(e.sunCol)
    sun.intensity = e.sunI
    amb.current!.color.lerpColors(AMB_N, AMB_D, e.day)
    amb.current!.intensity = lerp(0.62, 0.95, e.day)
    keyColor(SKY, e.h, 0, hemi.current!.color)
    keyColor(SKY, e.h, 1, hemi.current!.groundColor)
    hemi.current!.intensity = lerp(0.55, 0.7, e.day)
    in1.current!.intensity = e.shop * (1.2 + 5 * e.night)
    in2.current!.intensity = e.shop * (1.0 + 4.5 * e.night)
    street.current!.intensity = e.street * 5
  })
  return (
    <>
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <primitive object={sun} />
      <primitive object={sun.target} />
      <pointLight ref={in1} position={[-2.1, 1.4, -1.6]} color="#ffc98a" distance={6} decay={1.3} intensity={0} />
      <pointLight ref={in2} position={[0.3, 1.4, -0.4]} color="#ffcf94" distance={5.5} decay={1.3} intensity={0} />
      <pointLight ref={street} position={[2.85, 1.55, 2.3]} color="#ffd9a0" distance={4.5} decay={1.3} intensity={0} />
    </>
  )
}

function StreetLamp({ env, bulb }: { env: React.RefObject<Env>; bulb: THREE.MeshLambertMaterial }) {
  void env
  return (
    <group position={[2.85, 0.06, 2.35]}>
      <Cyl p={[0, 0.85, 0]} r={0.028} h={1.7} c="#4a4e55" />
      <Cyl p={[0, 0.03, 0]} r={0.08} h={0.06} c="#4a4e55" />
      <mesh geometry={G.box} material={lam('#4a4e55')} position={[0, 1.7, 0]} scale={[0.2, 0.05, 0.2]} castShadow />
      <mesh geometry={G.ball} material={bulb} position={[0, 1.63, 0]} scale={[0.08, 0.07, 0.08]} />
    </group>
  )
}

/* ================================================================== driver: time → env, background, HUD */
function Driver({
  u,
  env,
  ctl,
  day,
  root,
  hud,
  mats,
}: {
  u: MotionValue<number>
  env: React.RefObject<Env>
  ctl: React.RefObject<{ playing: boolean; dragging: boolean; speed: number }>
  day: Day
  root: React.RefObject<HTMLDivElement | null>
  hud: React.RefObject<{ clock: HTMLElement | null; cups: HTMLElement | null; state: HTMLElement | null; queue: HTMLElement | null; inside: HTMLElement | null }>
  mats: { lamps: THREE.MeshLambertMaterial; sign: THREE.MeshLambertMaterial; bulb: THREE.MeshLambertMaterial; glow: THREE.ShaderMaterial }
}) {
  const last = useRef({ bg: '', clock: '', cups: -1, open: -1, q: -1, inside: -1, night: -1 })
  const ca = useMemo(() => new THREE.Color(), [])
  const cb = useMemo(() => new THREE.Color(), [])
  const pose = useMemo<Pose>(() => ({ vis: 0, x: 0, z: 0, head: 0, moving: false, sit: false, cup: 0, cx: 0, cz: 0, hot: 0 }), [])
  useFrame((_, rdt) => {
    const c = ctl.current!
    if (c.playing && !c.dragging) u.set((u.get() + Math.min(rdt, 1 / 30) * c.speed) % DAY)
    const t = u.get()
    const e = computeEnv(hourOf(t), env.current!)
    mats.lamps.emissiveIntensity = e.shop * (0.5 + 1.1 * e.night)
    mats.sign.emissiveIntensity = e.sign * 1.9
    mats.bulb.emissiveIntensity = e.street * 1.6
    mats.glow.uniforms.uIntensity.value = e.shop * e.night * 0.9
    const L = last.current
    // background gradient
    keyColor(BG, e.h, 0, ca)
    keyColor(BG, e.h, 1, cb)
    const bg = `linear-gradient(180deg, #${ca.getHexString()} 0%, #${cb.getHexString()} 100%)`
    if (bg !== L.bg && root.current) {
      L.bg = bg
      root.current.style.background = bg
      root.current.style.setProperty('--soft-bg', `#${ca.lerp(cb, 0.35).getHexString()}`)
      const lum = ca.r * 0.3 + ca.g * 0.59 + ca.b * 0.11
      const night = lum < 0.42 ? 1 : 0
      if (night !== L.night) {
        L.night = night
        root.current.classList.toggle('dc-night', !!night)
      }
    }
    const H = hud.current!
    const mins = Math.floor(e.h * 60) % (24 * 60)
    const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    if (clock !== L.clock && H.clock) {
      L.clock = clock
      H.clock.textContent = clock
    }
    const cups = cupsSold(day, t)
    if (cups !== L.cups && H.cups) {
      L.cups = cups
      H.cups.textContent = String(cups)
    }
    const open = e.open ? 1 : 0
    if (open !== L.open && H.state) {
      L.open = open
      H.state.textContent = open ? 'OPEN' : 'CLOSED'
      H.state.dataset.open = String(open)
    }
    // queue + people inside
    let q = 0
    let inside = 0
    for (const p of day.served) {
      if (t < p.J || t > p.end) continue
      if (t < p.lr) q++
      personPose(p, t, pose)
      if (pose.x > SHOP.x0 && pose.x < SHOP.x1 && pose.z < SHOP.z1) inside++
    }
    if (q !== L.q && H.queue) {
      L.q = q
      H.queue.textContent = String(q)
    }
    if (inside !== L.inside && H.inside) {
      L.inside = inside
      H.inside.textContent = String(inside)
    }
  })
  return null
}

function Statics({ env, mats }: { env: React.RefObject<Env>; mats: { lamps: THREE.MeshLambertMaterial; sign: THREE.MeshLambertMaterial; bulb: THREE.MeshLambertMaterial; wins: THREE.MeshLambertMaterial[] } }) {
  const ref = useRef<THREE.Group>(null)
  useBakeStatic(ref)
  return (
    <group ref={ref}>
      <Street />
      <Neighbour env={env} wins={mats.wins} />
      <Cafe env={env} lamps={mats.lamps} signMat={mats.sign} />
      <StreetLamp env={env} bulb={mats.bulb} />
    </group>
  )
}

function Scene({ day, u, env, onReady, mats }: { day: Day; u: MotionValue<number>; env: React.RefObject<Env>; onReady: () => void; mats: { lamps: THREE.MeshLambertMaterial; sign: THREE.MeshLambertMaterial; bulb: THREE.MeshLambertMaterial; glow: THREE.ShaderMaterial; wins: THREE.MeshLambertMaterial[] } }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (stage >= 2) return
    const r = requestAnimationFrame(() => setStage((n) => n + 1))
    return () => cancelAnimationFrame(r)
  }, [stage])
  useStagedWarmup(stage >= 2, onReady)
  const glowRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const pts: V3[] = [
      [-3.0, WALL_H - 0.66, -2.5],
      [-2.0, WALL_H - 0.66, -2.5],
      [-1.0, WALL_H - 0.66, -2.5],
      [0.45, WALL_H - 0.66, -0.6],
      [2.85, 1.69, 2.35],
    ]
    pts.forEach((p, i) => {
      m.compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(i === 4 ? 1.6 : 1, i === 4 ? 1.6 : 1, 1))
      glowRef.current!.setMatrixAt(i, m)
    })
    glowRef.current!.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <group>
      {stage >= 1 && <Statics env={env} mats={mats} />}
      {stage >= 2 && (
        <>
          <Crowd day={day} u={u} env={env} />
          <Cars day={day} u={u} env={env} />
        </>
      )}
      <instancedMesh ref={glowRef} args={[quadGeo, mats.glow, 5]} frustumCulled={false} renderOrder={5} />
    </group>
  )
}

/* ================================================================== time scrubber */
const SCRUB_PATH = (() => {
  const W = 300
  const H = 34
  let d = `M0 ${H}`
  for (let i = 0; i <= 180; i++) {
    const h = 6 + (i / 180) * 18
    d += ` L${((i / 180) * W).toFixed(1)} ${(H - (demand(h) / 1.35) * (H - 4)).toFixed(1)}`
  }
  return d + ` L${W} ${H} Z`
})()

function Scrubber({ u, onScrub, onEnd }: { u: MotionValue<number>; onScrub: (v: number, jump: boolean) => void; onEnd: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const left = useTransform(u, (v) => `${(v / DAY) * 100}%`)
  const drag = useRef(false)
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    return clamp01((clientX - r.left) / r.width) * DAY
  }
  return (
    <div
      ref={track}
      className="dc-scrub"
      role="slider"
      tabIndex={0}
      aria-label="一天中的时间"
      aria-valuemin={6}
      aria-valuemax={24}
      onPointerDown={(e) => {
        drag.current = true
        track.current!.setPointerCapture(e.pointerId)
        onScrub(at(e.clientX), true)
      }}
      onPointerMove={(e) => drag.current && onScrub(at(e.clientX), false)}
      onPointerUp={() => {
        drag.current = false
        onEnd()
      }}
      onPointerCancel={() => {
        drag.current = false
        onEnd()
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          onScrub(Math.min(DAY - 0.01, Math.max(0, u.get() + (e.key === 'ArrowRight' ? 1 : -1) * (DAY / 36))), true)
          onEnd()
        }
      }}
    >
      <svg viewBox="0 0 300 34" preserveAspectRatio="none" aria-hidden>
        <path d={SCRUB_PATH} />
      </svg>
      <div className="dc-ticks" aria-hidden>
        {[6, 12, 18, 24].map((h) => (
          <span key={h} style={{ left: `${((h - 6) / 18) * 100}%` }}>
            {h}
          </span>
        ))}
      </div>
      <motion.div className="dc-head" style={{ left }} />
    </div>
  )
}

/* ================================================================== page */
const START_U = POSTER ? uOf(18.85) : uOf(7.7)
export default function DayCafe() {
  const day = useMemo(() => buildDay(7), [])
  const u = useMotionValue(START_U)
  const env = useRef<Env>(computeEnv(hourOf(START_U), { h: 0, el: 0, day: 1, night: 0, shop: 0, sign: 0, street: 0, open: true, sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), sunI: 0 }))
  const [playing, setPlaying] = useState(!POSTER)
  const [speed, setSpeed] = useState(1)
  const [ready, setReady] = useState(false)
  const ctl = useRef({ playing: !POSTER, dragging: false, speed: 1 })
  const root = useRef<HTMLDivElement>(null)
  const hud = useRef<{ clock: HTMLElement | null; cups: HTMLElement | null; state: HTMLElement | null; queue: HTMLElement | null; inside: HTMLElement | null }>({ clock: null, cups: null, state: null, queue: null, inside: null })
  const jump = useRef<ReturnType<typeof animate> | null>(null)

  useEffect(() => {
    ctl.current.playing = playing
    ctl.current.speed = speed
  }, [playing, speed])

  const mats = useMemo(
    () => ({
      lamps: new THREE.MeshLambertMaterial({ color: '#fff3dc', emissive: new THREE.Color('#ffc46e'), emissiveIntensity: 0 }),
      sign: new THREE.MeshLambertMaterial({ map: signTex, emissive: new THREE.Color('#ffffff'), emissiveMap: signTex, emissiveIntensity: 0 }),
      bulb: new THREE.MeshLambertMaterial({ color: '#fff3dc', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0 }),
      glow: (() => {
        const g = createGlowMaterial(0.9)
        g.uniforms.uTint.value.set('#ffc27a')
        return g
      })(),
      wins: Array.from({ length: 5 }, () => new THREE.MeshLambertMaterial({ color: '#5c6470', emissive: new THREE.Color('#ffcf7f'), emissiveIntensity: 0 })),
    }),
    [],
  )

  const onScrub = useCallback(
    (v: number, isJump: boolean) => {
      ctl.current.dragging = true
      jump.current?.stop()
      if (isJump && Math.abs(v - u.get()) > 1.5) {
        // glide to the new time so the crowd visibly fast-forwards / rewinds
        jump.current = animate(u, v, { type: 'spring', stiffness: 120, damping: 22, mass: 1 })
      } else u.set(v)
    },
    [u],
  )
  const onEnd = useCallback(() => {
    ctl.current.dragging = false
  }, [])
  const onReady = useCallback(() => setReady(true), [])
  const scene = useMemo(() => <Scene day={day} u={u} env={env} onReady={onReady} mats={mats} />, [day, u, onReady, mats])
  const goto = (h: number) => {
    jump.current?.stop()
    jump.current = animate(u, uOf(h), { type: 'spring', stiffness: 90, damping: 22 })
  }

  return (
    <div ref={root} className="stage dc-root" style={{ background: 'linear-gradient(180deg, #f7f0e7 0%, #efe2d1 100%)' }}>
      <motion.div className="dc-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.6 }}>
        <Canvas orthographic flat shadows="percentage" dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
          <IsoRig fit={14.2} mobileFit={11.6} mobileOffsetY={0.1} offset={[0.2, -0.02]} target={[-0.7, 0.9, 0.2]} />
          <Lighting env={env} />
          {scene}
          <Driver u={u} env={env} ctl={ctl} day={day} root={root} hud={hud} mats={mats} />
        </Canvas>
      </motion.div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: C.caramel }} /> Isometric · Time of day
          </p>
          <h1>
            街角小店的
            <br />
            一天
          </h1>
          <p>
            <span className="dc-long">从清晨开门到深夜打烊，阳光角度、影子长度、客流和灯光都跟着时间走：早高峰排队排到门外，午后冷清，入夜招牌亮起。</span>
            拖动下方时间轴，可以快进，也可以倒回去重看。
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => goto(8.3)}>
              看早高峰
            </button>
            <button className="btn" onClick={() => goto(19.4)}>
              跳到黄昏
            </button>
          </div>
        </motion.div>

        <div className="dc-hud" aria-live="off">
          <div className="dc-clock" ref={(el) => void (hud.current.clock = el)}>
            07:42
          </div>
          <span className="dc-state" data-open="1" ref={(el) => void (hud.current.state = el)}>
            OPEN
          </span>
          <div className="dc-stats">
            <span>
              今日售出 <b ref={(el) => void (hud.current.cups = el)}>0</b> 杯
            </span>
            <span>
              排队 <b ref={(el) => void (hud.current.queue = el)}>0</b> · 店内 <b ref={(el) => void (hud.current.inside = el)}>0</b>
            </span>
          </div>
        </div>

        <div className="dock dc-dock">
          <button className="seg dc-play" aria-pressed={playing} aria-label={playing ? '暂停' : '播放'} onClick={() => setPlaying((p) => !p)}>
            <span>{playing ? '❚❚' : '▶'}</span>
          </button>
          <Scrubber u={u} onScrub={onScrub} onEnd={onEnd} />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 0.5, label: '0.5×' },
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
            ]}
            value={speed}
            onChange={setSpeed}
          />
        </div>
        <p className="hint">拖动时间轴 · 可前进也可倒放</p>
      </div>

      <style>{`
        .dc-root { --soft-bg: #f5ede3; }
        .dc-root .hero-copy h1, .dc-root .hero-copy p, .dc-root .hint, .dc-root .kicker { transition: color .8s ease; }
        .dc-night { --fg: #f7f0e6; --fg-2: rgba(247,240,230,.7); --glass: rgba(30,32,62,.55); --glass-line: rgba(255,255,255,.12); }
        .dc-night .btn.primary { color: #222546; }
        .dc-canvas { position: absolute; inset: 0; }
        .dc-hud { position: absolute; right: 24px; top: 84px; min-width: 168px; padding: 12px 16px 12px; border-radius: 16px; color: var(--fg);
          background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
          display: grid; grid-template-columns: 1fr auto; align-items: center; row-gap: 8px; column-gap: 12px; transition: color .8s; }
        .dc-clock { font: 600 30px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .dc-state { justify-self: end; padding: 4px 8px; border-radius: 6px; font: 700 10px/1 var(--mono); letter-spacing: .08em; color: #fff; background: #5f9b74; transition: background .3s; }
        .dc-state[data-open='0'] { background: #c4574a; }
        .dc-stats { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; font: 12px/1.3 var(--sans); color: var(--fg-2); }
        .dc-stats b { color: var(--fg); font: 600 13px/1 var(--mono); font-variant-numeric: tabular-nums; }
        .dc-dock { gap: 6px; padding: 4px 6px 4px 4px; }
        .dc-play { width: 38px; padding: 0; font-size: 12px; }
        .dc-scrub { position: relative; width: 300px; height: 34px; margin: 0 6px; cursor: ew-resize; touch-action: none; user-select: none; -webkit-user-select: none; border-radius: 8px; outline: none;
          background: linear-gradient(90deg, #39406e 0%, #f0bfa6 3%, #f3e4cf 16%, #f6eee2 50%, #f1c7a4 70%, #a07b9a 77%, #3a3d6c 84%, #262a4a 100%); }
        .dc-scrub:focus-visible { box-shadow: 0 0 0 2px var(--fg); }
        .dc-scrub svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .dc-scrub path { fill: rgba(91,58,41,.32); }
        .dc-ticks span { position: absolute; bottom: 2px; translate: -50% 0; font: 9px/1 var(--mono); color: rgba(40,30,25,.55); pointer-events: none; }
        .dc-ticks span:first-child { translate: 3px 0; }
        .dc-ticks span:last-child { translate: calc(-100% - 3px) 0; color: rgba(255,255,255,.7); }
        .dc-head { position: absolute; top: -4px; bottom: -4px; width: 4px; margin-left: -2px; border-radius: 2px; background: var(--fg);
          box-shadow: 0 0 0 2px rgba(255,255,255,.75); pointer-events: none; }
        @media (max-width: 760px) {
          .dc-long { display: none; }
          .dc-root .hero-copy > p:not(.kicker) { font-size: 14px; line-height: 1.6; margin-top: 12px; }
          .dc-root .hero-actions { margin-top: 16px; }
          .dc-hud { right: 16px; top: 76px; min-width: 0; padding: 8px 12px; row-gap: 4px; }
          .dc-clock { font-size: 20px; }
          .dc-stats { font-size: 11px; }
          .dc-scrub { width: 168px; }
          .dc-root .seg { padding: 0 9px; }
          .dc-root .hint { display: none; }
        }
      `}</style>
    </div>
  )
}
