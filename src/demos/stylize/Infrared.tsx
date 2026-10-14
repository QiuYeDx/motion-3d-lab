import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { createInfraredEffect, infraredMeta, infraredModes, setInfraredHalation, setInfraredMode, type InfraredMode } from './effects/infrared'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 红外摄影 showcase — a summer landscape built to show the Wood effect: lots of foliage (trees, hedges, grass),
 * a lake, a blue sky with white clouds, a small red house and a sandy path. The breeze sways the trees and
 * the grass, the camera drifts slowly; drag to look around. Everything is plain lit geometry — the effect
 * decides what reflects infrared.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const HALATION = [
  { zh: '弱', k: 0.45 },
  { zh: '中', k: 1 },
  { zh: '强', k: 1.75 },
]
const NOTE: Record<InfraredMode, string> = {
  aero: '红外→红 · 红→绿 · 绿→蓝 · 植物变洋红',
  bw: '树叶雪白 · 天空近黑 · 柔光晕',
  gold: '590 nm 滤镜 · 通道互换 · 金叶蓝天',
}
const SHORT: Record<InfraredMode, string> = {
  aero: '彩红外',
  bw: '黑白',
  gold: '金色',
}
const ACCENT: Record<InfraredMode, string> = {
  aero: '#e0306a',
  bw: '#2a2a2e',
  gold: '#d98a1c',
}

/* ------------------------------------------------------------------ helpers */

let seed = 7
const rnd = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}
const lin = (hex: string) => new THREE.Color(hex)

function grassTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const g = cv.getContext('2d')!
  g.fillStyle = '#5f8f34'
  g.fillRect(0, 0, S, S)
  const cols = ['#4f7f2a', '#6d9c3a', '#7aa845', '#557f2e', '#86ad4a', '#46722a']
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = cols[i % cols.length]
    g.globalAlpha = 0.35 + rnd() * 0.4
    const x = rnd() * S
    const y = rnd() * S
    g.fillRect(x, y, 1 + rnd() * 2, 2 + rnd() * 5)
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(40, 40)
  t.anisotropy = 4
  return t
}

function cloudTexture() {
  const W = 512
  const H = 256
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')!
  for (let i = 0; i < 22; i++) {
    const x = W * (0.18 + rnd() * 0.64)
    const y = H * (0.42 + rnd() * 0.25) - Math.sin(((x / W - 0.18) / 0.64) * Math.PI) * H * 0.14
    const r = H * (0.12 + rnd() * 0.18)
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(255,255,255,0.85)')
    gr.addColorStop(0.55, 'rgba(255,255,255,0.55)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // flat-ish grey underside
  g.globalCompositeOperation = 'source-atop'
  const sh = g.createLinearGradient(0, H * 0.4, 0, H * 0.75)
  sh.addColorStop(0, 'rgba(200,210,225,0)')
  sh.addColorStop(1, 'rgba(178,190,208,0.75)')
  g.fillStyle = sh
  g.fillRect(0, 0, W, H)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function skyGeo() {
  const g = new THREE.SphereGeometry(120, 48, 24)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  const top = lin('#2f66c4')
  const mid = lin('#5b93dc')
  const hor = lin('#b9d3ee')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 120
    if (y < 0.08) c.copy(hor)
    else if (y < 0.35) c.copy(hor).lerp(mid, (y - 0.08) / 0.27)
    else c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.5))
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

const PATH = [
  new THREE.Vector3(-2.2, 0, 15),
  new THREE.Vector3(-2.6, 0, 9.5),
  new THREE.Vector3(-4.2, 0, 4.5),
  new THREE.Vector3(-3.0, 0, -0.6),
  new THREE.Vector3(0.6, 0, -2.6),
  new THREE.Vector3(3.8, 0, -3.5),
  new THREE.Vector3(5.9, 0, -4.3),
]

/** a gently curved sandy path from the foreground to the house door */
function pathGeo() {
  const curve = new THREE.CatmullRomCurve3(PATH)
  const N = 120
  const pos: number[] = []
  const idx: number[] = []
  const up = new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3()
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const p = curve.getPoint(t)
    const tg = curve.getTangent(t)
    side.crossVectors(tg, up).normalize()
    const w = THREE.MathUtils.lerp(1.0, 0.42, t)
    pos.push(p.x - side.x * w, 0.015, p.z - side.z * w, p.x + side.x * w, 0.015, p.z + side.z * w)
    if (i < N) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function lakeGeo() {
  const s = new THREE.Shape()
  const N = 64
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const r = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.07 * Math.sin(a * 5 + 2)
    const x = Math.cos(a) * 5.6 * r
    const y = Math.sin(a) * 2.6 * r
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  const g = new THREE.ShapeGeometry(s, 4)
  g.rotateX(-Math.PI / 2)
  return g
}

function roofGeo() {
  const s = new THREE.Shape()
  s.moveTo(-1.35, 0)
  s.lineTo(1.35, 0)
  s.lineTo(0, 1.05)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.3, bevelEnabled: false })
  g.translate(0, 0, -1.15)
  return g
}

type TreeKind = 'round' | 'pine' | 'poplar'
type TreeDef = {
  x: number
  z: number
  s: number
  kind: TreeKind
  tint: number
  ph: number
}

function makeTrees(): TreeDef[] {
  const out: TreeDef[] = []
  const add = (x: number, z: number, s: number, kind: TreeKind) => out.push({ x, z, s, kind, tint: rnd(), ph: rnd() * 6.28 })
  // big framing tree, left
  add(-7.5, 3, 1.55, 'round')
  add(-10.5, -1, 1.2, 'round')
  // grove behind the house
  add(7.8, -8.5, 1.3, 'round')
  add(4.2, -9.5, 1.1, 'round')
  add(9.8, -6.2, 0.95, 'round')
  add(2.2, -11, 1.0, 'poplar')
  add(0.8, -12, 1.15, 'poplar')
  add(11.5, -10, 1.2, 'pine')
  add(13.5, -7.5, 1.0, 'pine')
  // line along the far shore
  for (let i = 0; i < 9; i++)
    add(-12 + i * 2.1 + rnd() * 0.8, -13.5 - rnd() * 3, 0.8 + rnd() * 0.5, rnd() < 0.45 ? 'pine' : rnd() < 0.5 ? 'poplar' : 'round')
  // left woods
  for (let i = 0; i < 7; i++) add(-16 + rnd() * 6, -4 - rnd() * 9, 0.9 + rnd() * 0.5, rnd() < 0.5 ? 'pine' : 'round')
  // right edge
  add(14, 1.5, 1.2, 'round')
  add(16.5, -3, 1.1, 'pine')
  return out
}

/* ------------------------------------------------------------------ scene */

const GREENS = ['#3f7a2a', '#4f8a2e', '#2f6a2a', '#5b9440', '#46803a']

function Landscape({ yaw, pitch }: { yaw: MotionValue<number>; pitch: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)
  const t = useRef(POSTER ? 3 : 0)
  const treeRefs = useRef<(THREE.Group | null)[]>([])
  const clouds = useRef<THREE.Group>(null)
  const tufts = useRef<THREE.InstancedMesh>(null)

  const assets = useMemo(() => {
    seed = 7
    const grass = grassTexture()
    const cloud = cloudTexture()
    const trees = makeTrees()
    const foliage = GREENS.map(
      (c) =>
        new THREE.MeshStandardMaterial({
          color: c,
          roughness: 0.85,
          flatShading: true,
        }),
    )
    // grass tufts in the foreground
    const TN = 1800
    const tuftData: {
      x: number
      z: number
      s: number
      r: number
      ph: number
    }[] = []
    const pathPts = new THREE.CatmullRomCurve3(PATH).getSpacedPoints(80)
    for (let i = 0; i < TN; i++) {
      const x = -14 + rnd() * 26
      const z = -3 + rnd() * 10.5
      // keep the lake and the path clear
      const lx = (x - 3.2) / 6.2
      const lz = (z - 1.2) / 3.0
      if (lx * lx + lz * lz < 1) continue
      if (pathPts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 1.1)) continue
      tuftData.push({
        x,
        z,
        s: 0.55 + rnd() * 0.7,
        r: rnd() * 6.28,
        ph: rnd() * 6.28,
      })
    }
    return {
      grass,
      cloud,
      trees,
      foliage,
      tuftData,
      sky: skyGeo(),
      path: pathGeo(),
      lake: lakeGeo(),
      roof: roofGeo(),
      crown: new THREE.IcosahedronGeometry(1, 1),
      cone: new THREE.ConeGeometry(1, 1, 7),
      trunk: new THREE.CylinderGeometry(0.09, 0.14, 1, 7),
      tuft: new THREE.ConeGeometry(0.028, 0.2, 3),
      bush: new THREE.IcosahedronGeometry(0.55, 1),
      hill: new THREE.SphereGeometry(1, 40, 20),
      mat: {
        ground: new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }),
        path: new THREE.MeshStandardMaterial({
          color: '#cdb68c',
          roughness: 1,
        }),
        lake: new THREE.MeshStandardMaterial({
          color: '#2a5d8e',
          roughness: 0.12,
          metalness: 0.35,
        }),
        shore: new THREE.MeshStandardMaterial({
          color: '#8f8a6a',
          roughness: 1,
        }),
        trunk: new THREE.MeshStandardMaterial({
          color: '#5a4030',
          roughness: 0.9,
        }),
        wall: new THREE.MeshStandardMaterial({
          color: '#b42a22',
          roughness: 0.75,
        }),
        roof: new THREE.MeshStandardMaterial({
          color: '#3a3433',
          roughness: 0.7,
        }),
        trim: new THREE.MeshStandardMaterial({
          color: '#f2efe8',
          roughness: 0.6,
        }),
        glass: new THREE.MeshStandardMaterial({
          color: '#25303a',
          roughness: 0.2,
          metalness: 0.4,
        }),
        hillNear: new THREE.MeshStandardMaterial({
          color: '#4c7f3a',
          roughness: 1,
        }),
        hillFar: new THREE.MeshStandardMaterial({
          color: '#6c9257',
          roughness: 1,
        }),
        tuft: new THREE.MeshStandardMaterial({
          color: '#ffffff',
          roughness: 0.9,
        }),
        sky: new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.BackSide,
          fog: false,
          depthWrite: false,
        }),
        cloud: new THREE.MeshBasicMaterial({
          map: cloud,
          transparent: true,
          depthWrite: false,
          fog: false,
          color: new THREE.Color(1.15, 1.15, 1.15),
        }),
        flower: new THREE.MeshStandardMaterial({
          color: '#f4f0e6',
          roughness: 0.6,
        }),
      },
    }
  }, [])
  useEffect(
    () => () => {
      assets.grass.dispose()
      assets.cloud.dispose()
      assets.foliage.forEach((m) => m.dispose())
      ;[assets.sky, assets.path, assets.lake, assets.roof, assets.crown, assets.cone, assets.trunk, assets.tuft, assets.bush, assets.hill].forEach(
        (g) => g.dispose(),
      )
      Object.values(assets.mat).forEach((m) => m.dispose())
    },
    [assets],
  )

  // tuft colours + static part of their transforms
  const tuftBase = useMemo(() => assets.tuftData.map((d) => new THREE.Vector3(d.x, 0.09 * d.s, d.z)), [assets])
  // layout effect: runs before usePrecompiled compiles the group, so the instance-colour variant is the one compiled
  useLayoutEffect(() => {
    const im = tufts.current
    if (!im) return
    const c = new THREE.Color()
    assets.tuftData.forEach((_, i) => {
      c.set(GREENS[i % GREENS.length]).multiplyScalar(0.85 + ((i * 37) % 10) / 25)
      im.setColorAt(i, c)
    })
    if (im.instanceColor) im.instanceColor.needsUpdate = true
  }, [assets])

  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const mtx = useMemo(() => new THREE.Matrix4(), [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const W = size.width
    const H = size.height
    const mobile = W < 760

    /* camera: slow drift (pan) + drag; on desktop the view is offset so the house/lake sit right of the copy */
    const fov = mobile ? 60 : 40
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const drift = POSTER ? 0.04 : Math.sin(T * 0.07) * 0.16
    const yw = drift + yaw.get() + (mobile ? 0.12 : 0)
    const pt = pitch.get()
    const R = 15
    const cx = 2.2
    const cz = -1
    camera.position.set(cx + Math.sin(yw) * R, 2.3 + pt * 4 + Math.sin(T * 0.11) * 0.08, cz + Math.cos(yw) * R)
    camera.lookAt(cx + Math.sin(yw) * 2 + (mobile ? 1.6 : 0), 1.7 + pt * 3, cz)
    const ox = POSTER || mobile ? 0 : -W * 0.08
    const oy = mobile ? H * 0.1 : 0
    camera.setViewOffset(W, H, ox, oy, W, H)
    camera.updateMatrixWorld()

    /* breeze: gusts travel across the scene (phase by x), trees lean, grass waves */
    const gust = 0.5 + 0.5 * Math.sin(T * 0.45) * Math.sin(T * 0.19 + 1)
    assets.trees.forEach((d, i) => {
      const g = treeRefs.current[i]
      if (!g) return
      const w = Math.sin(T * 1.6 + d.ph + d.x * 0.25) * (0.012 + 0.03 * gust) + 0.012 * gust
      g.rotation.z = w / d.s
      g.rotation.x = Math.sin(T * 1.2 + d.ph) * 0.008
    })
    const im = tufts.current
    if (im) {
      assets.tuftData.forEach((d, i) => {
        const w = Math.sin(T * 2.4 + d.x * 0.6 + d.z * 0.3) * (0.08 + 0.18 * gust) + 0.1 * gust
        e.set(w * 0.4, d.r, w)
        q.setFromEuler(e)
        sc.set(d.s, d.s, d.s)
        mtx.compose(tuftBase[i], q, sc)
        im.setMatrixAt(i, mtx)
      })
      im.instanceMatrix.needsUpdate = true
    }
    if (clouds.current) clouds.current.position.x = POSTER ? 0 : ((T * 0.25) % 60) - 6
  })

  const { mat } = assets
  return (
    <>
      <hemisphereLight args={['#cfe3ff', '#4a5a30', 1.1]} />
      <directionalLight
        position={[-14, 20, 10]}
        intensity={3}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={80}
        shadow-bias={-0.0006}
      />
      <fog attach="fog" args={['#c4d8ee', 40, 140]} />
      <group ref={content} visible={ready}>
        {/* sky, sun, clouds */}
        <mesh geometry={assets.sky} material={mat.sky} renderOrder={-1} />
        <group ref={clouds}>
          {[
            [-30, 22, -80, 34],
            [8, 26, -95, 40],
            [40, 19, -85, 30],
            [-60, 16, -75, 28],
            [22, 14, -70, 22],
          ].map(([x, y, z, w], i) => (
            <mesh key={i} position={[x, y, z]} material={mat.cloud}>
              <planeGeometry args={[w, w / 2]} />
            </mesh>
          ))}
        </group>
        {/* distant hills */}
        <mesh geometry={assets.hill} material={mat.hillFar} position={[-30, -6, -60]} scale={[40, 14, 16]} />
        <mesh geometry={assets.hill} material={mat.hillFar} position={[28, -8, -66]} scale={[46, 16, 18]} />
        <mesh geometry={assets.hill} material={mat.hillNear} position={[4, -5, -42]} scale={[30, 8, 12]} receiveShadow />
        {/* ground, lake, path */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat.ground} receiveShadow>
          <planeGeometry args={[220, 220]} />
        </mesh>
        <mesh geometry={assets.lake} material={mat.shore} position={[3.2, 0.006, 1.2]} scale={[1.07, 1, 1.12]} receiveShadow />
        <mesh geometry={assets.lake} material={mat.lake} position={[3.2, 0.02, 1.2]} receiveShadow />
        <mesh geometry={assets.path} material={mat.path} receiveShadow />
        {/* the red house */}
        <group position={[6.6, 0, -5.4]} rotation={[0, -0.45, 0]}>
          <mesh position={[0, 0.8, 0]} material={mat.wall} castShadow receiveShadow>
            <boxGeometry args={[2.5, 1.6, 2.1]} />
          </mesh>
          <mesh geometry={assets.roof} material={mat.roof} position={[0, 1.6, 0]} castShadow />
          <mesh position={[0.7, 2.25, -0.4]} material={mat.wall} castShadow>
            <boxGeometry args={[0.26, 0.7, 0.26]} />
          </mesh>
          {/* door + windows on the front (+z) */}
          <mesh position={[-0.55, 0.52, 1.06]} material={mat.trim}>
            <boxGeometry args={[0.56, 1.04, 0.04]} />
          </mesh>
          <mesh position={[-0.55, 0.5, 1.08]} material={mat.roof}>
            <boxGeometry args={[0.44, 0.92, 0.03]} />
          </mesh>
          {[0.55].map((x) => (
            <group key={x} position={[x, 0.95, 1.06]}>
              <mesh material={mat.trim}>
                <boxGeometry args={[0.7, 0.62, 0.04]} />
              </mesh>
              <mesh position={[0, 0, 0.02]} material={mat.glass}>
                <boxGeometry args={[0.56, 0.48, 0.03]} />
              </mesh>
            </group>
          ))}
          <group position={[1.26, 0.95, 0]} rotation={[0, Math.PI / 2, 0]}>
            <mesh material={mat.trim}>
              <boxGeometry args={[0.7, 0.62, 0.04]} />
            </mesh>
            <mesh position={[0, 0, 0.02]} material={mat.glass}>
              <boxGeometry args={[0.56, 0.48, 0.03]} />
            </mesh>
          </group>
          {/* white corner boards */}
          {[
            [-1.25, 1.05],
            [1.25, 1.05],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.8, z]} material={mat.trim}>
              <boxGeometry args={[0.08, 1.6, 0.08]} />
            </mesh>
          ))}
        </group>
        {/* trees */}
        {assets.trees.map((d, i) => (
          <group key={i} position={[d.x, 0, d.z]} scale={d.s}>
            <group ref={(el) => void (treeRefs.current[i] = el)}>
              {d.kind === 'round' && (
                <>
                  <mesh geometry={assets.trunk} material={mat.trunk} position={[0, 0.9, 0]} scale={[1, 1.8, 1]} castShadow />
                  <mesh
                    geometry={assets.crown}
                    material={assets.foliage[i % 5]}
                    position={[0, 2.5, 0]}
                    scale={[1.35, 1.15, 1.35]}
                    castShadow
                    receiveShadow
                  />
                  <mesh
                    geometry={assets.crown}
                    material={assets.foliage[(i + 2) % 5]}
                    position={[0.75, 2.1, 0.3]}
                    scale={0.85}
                    castShadow
                    receiveShadow
                  />
                  <mesh
                    geometry={assets.crown}
                    material={assets.foliage[(i + 3) % 5]}
                    position={[-0.7, 2.2, -0.2]}
                    scale={0.8}
                    castShadow
                    receiveShadow
                  />
                  <mesh
                    geometry={assets.crown}
                    material={assets.foliage[(i + 1) % 5]}
                    position={[0.1, 3.3, 0.1]}
                    scale={0.75}
                    castShadow
                    receiveShadow
                  />
                </>
              )}
              {d.kind === 'pine' && (
                <>
                  <mesh geometry={assets.trunk} material={mat.trunk} position={[0, 0.4, 0]} scale={[0.8, 0.8, 0.8]} castShadow />
                  <mesh geometry={assets.cone} material={assets.foliage[2]} position={[0, 1.4, 0]} scale={[1.1, 1.6, 1.1]} castShadow receiveShadow />
                  <mesh
                    geometry={assets.cone}
                    material={assets.foliage[2]}
                    position={[0, 2.3, 0]}
                    scale={[0.85, 1.4, 0.85]}
                    castShadow
                    receiveShadow
                  />
                  <mesh geometry={assets.cone} material={assets.foliage[0]} position={[0, 3.1, 0]} scale={[0.6, 1.2, 0.6]} castShadow receiveShadow />
                </>
              )}
              {d.kind === 'poplar' && (
                <>
                  <mesh geometry={assets.trunk} material={mat.trunk} position={[0, 0.6, 0]} scale={[0.8, 1.2, 0.8]} castShadow />
                  <mesh
                    geometry={assets.crown}
                    material={assets.foliage[3]}
                    position={[0, 2.8, 0]}
                    scale={[0.7, 2.3, 0.7]}
                    castShadow
                    receiveShadow
                  />
                </>
              )}
            </group>
          </group>
        ))}
        {/* bushes: hedge by the house, clumps on the shore */}
        {[
          [4.6, -3.6, 0.9],
          [5.4, -3.2, 0.75],
          [8.8, -3.9, 1],
          [9.6, -4.8, 0.8],
          [-2.8, 0.4, 1.1],
          [-2.0, 1.4, 0.8],
          [8.6, 2.4, 0.9],
          [9.5, 1.6, 0.7],
          [-4.8, 6.5, 1.2],
          [6.5, 7.5, 1],
          [-0.8, -2.6, 0.7],
        ].map(([x, z, s], i) => (
          <mesh
            key={i}
            geometry={assets.bush}
            material={assets.foliage[(i * 3) % 5]}
            position={[x, 0.32 * s, z]}
            scale={[s * 1.2, s * 0.85, s]}
            castShadow
            receiveShadow
          />
        ))}
        {/* a few white flowers in the grass */}
        {Array.from({ length: 26 }, (_, i) => (
          <mesh key={i} material={mat.flower} position={[-6 + ((i * 7.3) % 12), 0.12, 7 + ((i * 3.7) % 7)]} scale={0.045}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        ))}
        <instancedMesh ref={tufts} args={[assets.tuft, mat.tuft, assets.tuftData.length]} castShadow={false} receiveShadow />
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Infrared() {
  const fx = useMemo(createInfraredEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<InfraredMode>('aero')
  const [hi, setHi] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const yaw = useMotionValue(0)
  const pitch = useMotionValue(0)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => setInfraredMode(fx, mode), [fx, mode])
  useEffect(() => setInfraredHalation(fx, HALATION[hi].k), [fx, hi])

  // idle: cycle the films
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => infraredModes[(infraredModes.findIndex((x) => x.id === m) + 1) % infraredModes.length].id)
    }, 7500)
    return () => window.clearInterval(id)
  }, [])

  // drag looks around (Motion inertia, springs back to the framed view)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    yaw.set(THREE.MathUtils.clamp(yaw.get() - (e.clientX - d.x) * 0.0022, -0.55, 0.55))
    pitch.set(THREE.MathUtils.clamp(pitch.get() + (e.clientY - d.y) * 0.0012, -0.15, 0.3))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      animate(yaw, yaw.get(), {
        type: 'inertia',
        velocity: yaw.getVelocity(),
        power: 0.3,
        timeConstant: 480,
        min: -0.55,
        max: 0.55,
        bounceStiffness: 120,
        bounceDamping: 18,
        onComplete: () => {
          anims.current.push(
            animate(yaw, 0, {
              type: 'spring',
              stiffness: 10,
              damping: 7,
              delay: 2.5,
            }),
          )
        },
      }),
      animate(pitch, pitch.get(), {
        type: 'inertia',
        velocity: pitch.getVelocity(),
        power: 0.3,
        timeConstant: 400,
        min: -0.15,
        max: 0.3,
        bounceStiffness: 140,
        bounceDamping: 18,
        onComplete: () => {
          anims.current.push(
            animate(pitch, 0, {
              type: 'spring',
              stiffness: 12,
              damping: 7,
              delay: 2.5,
            }),
          )
        },
      }),
    ]
  }

  const label = infraredModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage ir ir-${mode}${split.open ? ' ir-split' : ''}`}
      style={{ ['--ir-accent' as string]: ACCENT[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        camera={{ position: [0, 2.3, 15], fov: 40, near: 0.3, far: 300 }}
      >
        <Stylize
          effect={split.on ? original : fx}
          prev={split.on ? fx : null}
          wipe={split.wipe}
          background={infraredMeta.background}
          preload={preload}
        />
        <Landscape yaw={yaw} pitch={pitch} />
      </Canvas>

      <div className="overlay">
        <OriginalSplit split={split} label={label} />

        <div className="hero-copy ir-copy">
          <div className="scrim ir-scrim" />
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.15,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <p className="kicker">
              <i />
              Infrared ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="ir-kmode"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              看见叶子
              <br />
              <span className="ir-hl">反射的红外光</span>
            </h1>
            <p className="ir-sub">
              叶绿素强烈反射近红外，于是树和草在红外胶片上发亮、变成粉红或雪白；蓝天和湖水几乎不反射，沉成深青或近黑。亮处带着胶片光晕和颗粒。
            </p>
            <div className="ir-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
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
            items={infraredModes.map((m) => ({
              value: m.id,
              label: mobile ? SHORT[m.id] : m.label,
            }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg ir-cycle"
            onClick={() => {
              poke()
              setHi((i) => (i + 1) % HALATION.length)
            }}
          >
            <span>
              {mobile ? '光晕' : '光晕强度'} <b>{HALATION[hi].zh}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="ir-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动环顾四周</p>
      </div>
    </div>
  )
}

const css = `
.ir { cursor: grab; touch-action: none; background: ${infraredMeta.background}; }
.ir:active { cursor: grabbing; }
.ir canvas { display: block; }
.ir-copy { pointer-events: none !important; }
.ir-scrim { --soft-bg: rgba(250, 247, 244, .86); }
.ir-copy .kicker i { background: var(--ir-accent); transition: background .6s; }
.ir-kmode { display: inline-block; color: var(--fg); }
.ir-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.ir-hl { color: var(--ir-accent); transition: color .6s; }
.ir-sub { max-width: 400px; }
.ir-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.ir-spec span { display: inline-flex; align-items: center; gap: 9px; }
.ir-spec i { width: 18px; height: 3px; border-radius: 3px; background: var(--ir-accent); transition: background .6s; }
.ir-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.ir-cycle b { font-weight: 600; color: var(--fg); }
.ir .hint { transition: opacity .4s; color: rgba(255,255,255,.85); text-shadow: 0 1px 6px rgba(0,0,0,.35); }
.ir-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .ir-copy { transition: opacity .4s; }
  .ir-split .ir-copy { opacity: 0; }
  .ir-sub { display: none; }
  .ir-copy h1 { font-size: 36px; }
  .ir-spec { margin-top: 12px; font-size: 11px; }
  .ir .dock .seg { padding: 0 10px; }
}
`
