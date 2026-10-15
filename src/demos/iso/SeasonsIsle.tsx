import { Canvas, useFrame } from '@react-three/fiber'
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { createDotGeometry, createDotMaterial, createGlowMaterial, quadGeo, useScreenWarmup } from './isoWarmup'

/* ================================================================== helpers */
type V3 = [number, number, number]
const TAU = Math.PI * 2
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number) => v * v * (3 - 2 * v)
const lerp = THREE.MathUtils.lerp

/* ================================================================== seasons / weather model */
type Season = 0 | 1 | 2 | 3
type Weather = 'sun' | 'rain' | 'snow' | 'storm'
const SEASONS: { value: Season; label: string }[] = [
  { value: 0, label: '春' },
  { value: 1, label: '夏' },
  { value: 2, label: '秋' },
  { value: 3, label: '冬' },
]
const WEATHERS: { value: Weather; label: string }[] = [
  { value: 'sun', label: '晴' },
  { value: 'rain', label: '雨' },
  { value: 'snow', label: '雪' },
  { value: 'storm', label: '雷暴' },
]
/** weights of the four seasons for a continuous (cyclic) season value */
function seasonWeights(s: number, out: number[]) {
  for (let i = 0; i < 4; i++) {
    let d = Math.abs((((s - i) % 4) + 4) % 4)
    d = Math.min(d, 4 - d)
    out[i] = Math.max(0, 1 - d)
  }
  return out
}
const pal = (...c: string[]) => c.map((x) => new THREE.Color(x))
const PAL = {
  grass: pal('#a8dc82', '#7fc467', '#d3bd70', '#b6c7a8'),
  tuft: pal('#8fd06c', '#62ad52', '#c4a258', '#9fb293'),
  cherryA: pal('#ffaccb', '#69b85c', '#e2603e', '#8a6a5a'),
  cherryB: pal('#ffd5e3', '#87ca6f', '#f08c45', '#8a6a5a'),
  leafA: pal('#a6dd84', '#5aab55', '#f2a53a', '#8a6a5a'),
  leafB: pal('#c3e99a', '#4a994b', '#e0583a', '#8a6a5a'),
  water: pal('#86d3ea', '#6fc6e2', '#7eb8cc', '#dcf0fa'),
  sun: pal('#fff4ea', '#fff3d8', '#ffdcb0', '#e9f0ff'),
  amb: pal('#fff6f3', '#fffaf0', '#fff1e4', '#eef3ff'),
  ground: pal('#e6d3c7', '#d8d6b6', '#e6cdb3', '#d7dbe6'),
}
const SCALE = {
  crown: [0.92, 1.0, 0.86, 0.0],
  cherry: [1.06, 1.0, 0.8, 0.0],
  sunflower: [0.32, 1.0, 0.2, 0.0],
  pumpkin: [0.0, 0.0, 1.0, 0.0],
  flower: [1.0, 0.55, 0.0, 0.0],
  snowman: [0, 0, 0, 1],
}
const TEMP = [16, 29, 14, -4]
const MONTH = [4, 7, 10, 1]
const TERMS = ['清明', '小暑', '寒露', '大寒']
const mix4 = (vals: number[], w: number[]) => vals[0] * w[0] + vals[1] * w[1] + vals[2] * w[2] + vals[3] * w[3]
function mixColor(cols: THREE.Color[], w: number[], out: THREE.Color) {
  out.setRGB(0, 0, 0)
  for (let i = 0; i < 4; i++) {
    out.r += cols[i].r * w[i]
    out.g += cols[i].g * w[i]
    out.b += cols[i].b * w[i]
  }
  return out
}

/** per-frame environment, written by <Driver/> before anything else reads it */
type Env = {
  w: number[]
  rainfall: number
  snowfall: number
  storm: number
  cover: number
  frozen: number
  snowAmt: number
  flash: number
  dark: number
  wind: number
  t: number
}
const makeEnv = (): Env => ({ w: [1, 0, 0, 0], rainfall: 0, snowfall: 0, storm: 0, cover: 0, frozen: 0, snowAmt: 0, flash: 0, dark: 0, wind: 0.25, t: 0 })

/* ================================================================== snow-mask material
   Lambert + a world-up normal mask: surfaces facing up turn white first, slopes later, walls never. One shared
   uniform drives every material, and all of them share one program (same cache key). */
const SNOW_U = { uSnow: { value: 0 }, uSnowCol: { value: new THREE.Color('#f7fbff') } }
const snowCompile = (sh: THREE.WebGLProgramParametersWithUniforms) => {
  sh.uniforms.uSnow = SNOW_U.uSnow
  sh.uniforms.uSnowCol = SNOW_U.uSnowCol
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSnN;\nvarying vec3 vSnP;')
    .replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vSnP = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n  vSnN = transpose(mat3(viewMatrix)) * transformedNormal;',
    )
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uSnow;
uniform vec3 uSnowCol;
varying vec3 vSnN;
varying vec3 vSnP;
float snH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snN(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snH(i), snH(i + vec2(1.0, 0.0)), f.x), mix(snH(i + vec2(0.0, 1.0)), snH(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  {
    float up = normalize(vSnN).y;
    float n = snN(vSnP.xz * 2.7) * 0.6 + snN(vSnP.xz * 7.3 + 3.1) * 0.4;
    float thr = mix(1.2, 0.2, uSnow);
    float cv = smoothstep(thr, thr + 0.16, up + (n - 0.5) * 0.42) * smoothstep(0.0, 0.12, uSnow);
    diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCol, cv);
  }`,
    )
}
function snowify<T extends THREE.MeshLambertMaterial>(m: T) {
  m.onBeforeCompile = snowCompile
  m.customProgramCacheKey = () => 'si-snow'
  return m
}
const sCache = new Map<string, THREE.MeshLambertMaterial>()
/** cached snowy Lambert (static colour) */
function slam(color: string) {
  let m = sCache.get(color)
  if (!m) {
    m = snowify(new THREE.MeshLambertMaterial({ color }))
    sCache.set(color, m)
  }
  return m
}
/* seasonal (animated) materials */
const MAT = {
  grass: snowify(new THREE.MeshLambertMaterial({ color: '#a8dc82' })),
  tuft: snowify(new THREE.MeshLambertMaterial({ color: '#8fd06c' })),
  cherryA: snowify(new THREE.MeshLambertMaterial({ color: '#ffaccb' })),
  cherryB: snowify(new THREE.MeshLambertMaterial({ color: '#ffd5e3' })),
  leafA: snowify(new THREE.MeshLambertMaterial({ color: '#a6dd84' })),
  leafB: snowify(new THREE.MeshLambertMaterial({ color: '#c3e99a' })),
  window: new THREE.MeshLambertMaterial({ color: '#a9c9dc', emissive: new THREE.Color('#ffc977'), emissiveIntensity: 0 }),
  water: new THREE.MeshLambertMaterial({ color: '#86d3ea' }),
  cloud: new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.32 }),
  white: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
}

/* ================================================================== shared geometry */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  ball: new THREE.SphereGeometry(1, 16, 12),
  blob: new THREE.IcosahedronGeometry(1, 2),
  cone: new THREE.ConeGeometry(1, 1, 14),
}
function beamGeo(a: V3, b: V3, r0: number, r1: number) {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const d = vb.clone().sub(va)
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), 6)
  g.translate(0, d.length() / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
  g.translate(...a)
  return g
}

/* ================================================================== layout (isle-local) */
const ISLE_R = 4.0
const isleRadius = (a: number) => ISLE_R * (1 + 0.055 * Math.sin(3 * a + 0.7) + 0.04 * Math.sin(5 * a + 2.1) + 0.02 * Math.sin(9 * a + 4.0))
const COTTAGE: V3 = [-1.35, 0, -1.3]
const CHIMNEY_TOP: V3 = [COTTAGE[0] + 0.42, 1.98, COTTAGE[2] - 0.25]
const POND = { x: 1.25, z: 1.45, rx: 1.15, rz: 0.8 }
type TreeDef = { p: V3; trunk: number; blobs: [number, number, number, number][]; cherry?: boolean }
const TREES: TreeDef[] = [
  {
    p: [1.75, 0, -1.55],
    trunk: 0.95,
    cherry: true,
    blobs: [
      [0, 1.6, 0, 0.62],
      [0.5, 1.42, 0.22, 0.45],
      [-0.45, 1.48, -0.12, 0.47],
      [0.12, 2.0, -0.08, 0.42],
      [-0.12, 1.36, 0.48, 0.4],
      [0.32, 1.38, -0.48, 0.4],
    ],
  },
  {
    p: [2.85, 0, 0.35],
    trunk: 0.7,
    blobs: [
      [0, 1.08, 0, 0.5],
      [0.26, 0.92, 0.2, 0.34],
      [-0.2, 1.26, -0.1, 0.32],
    ],
  },
  {
    p: [0.3, 0, -3.0],
    trunk: 0.6,
    blobs: [
      [0, 0.96, 0, 0.44],
      [0.22, 0.82, 0.16, 0.3],
    ],
  },
  {
    p: [3.0, 0, 1.8],
    trunk: 0.55,
    blobs: [
      [0, 0.9, 0, 0.42],
      [-0.18, 0.78, 0.2, 0.3],
    ],
  },
]

/* ================================================================== isle body */
function blobShape(scale: number, n = 72) {
  const s = new THREE.Shape()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU
    const r = isleRadius(a) * scale
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  return s
}
function Layer({ scale, h, y, mat, bevel = 0 }: { scale: number; h: number; y: number; mat: THREE.Material; bevel?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(blobShape(scale), {
      depth: h - bevel * 2,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 3,
      curveSegments: 4,
    })
    g.rotateX(Math.PI / 2)
    g.translate(0, -bevel, 0)
    return g
  }, [scale, h, bevel])
  return <mesh geometry={geo} material={mat} position={[0, y, 0]} castShadow receiveShadow />
}

function IsleBody() {
  return (
    <group>
      <Layer scale={1} h={0.34} y={0} mat={MAT.grass} bevel={0.07} />
      <Layer scale={0.975} h={0.3} y={-0.3} mat={slam('#c99a73')} />
      <Layer scale={0.9} h={0.75} y={-0.58} mat={slam('#ad8470')} />
      <Layer scale={0.72} h={0.8} y={-1.3} mat={slam('#957064')} />
      <Layer scale={0.5} h={0.85} y={-2.06} mat={slam('#7f5f5c')} />
      <Layer scale={0.27} h={0.75} y={-2.86} mat={slam('#6b5157')} />
    </group>
  )
}

/* ================================================================== cottage */
function Cottage() {
  const roofGeo = useMemo(() => {
    const W = 1.62
    const D = 1.3
    const H = 0.62
    // gable prism: triangle in xy (ridge along x after rotation), extruded along x
    const sh = new THREE.Shape()
    sh.moveTo(-D / 2, 0)
    sh.lineTo(D / 2, 0)
    sh.lineTo(0, H)
    sh.lineTo(-D / 2, 0)
    const g = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: false })
    g.translate(0, 0, -W / 2)
    g.rotateY(Math.PI / 2)
    return g
  }, [])
  const roofSlabs = useMemo(() => {
    // two thin slabs following the slopes so the roof has an overhang and a clean snow surface
    const D = 1.42
    const H = 0.66
    const len = Math.hypot(D / 2, H) + 0.06
    const ang = Math.atan2(H, D / 2)
    const mk = (s: number) => {
      const g = new THREE.BoxGeometry(1.78, 0.07, len)
      g.translate(0, 0.035, 0)
      g.rotateX(-s * ang)
      g.translate(0, H / 2 - 0.02, (-s * D) / 4)
      return g
    }
    return mergeGeometries([mk(1), mk(-1)])
  }, [])
  const [x, , z] = COTTAGE
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={G.box} material={slam('#f6ead6')} position={[0, 0.43, 0]} scale={[1.5, 0.86, 1.18]} castShadow receiveShadow />
      <mesh geometry={G.box} material={slam('#d9c2a6')} position={[0, 0.05, 0]} scale={[1.58, 0.1, 1.26]} castShadow receiveShadow />
      <mesh geometry={roofGeo} material={slam('#f6ead6')} position={[0, 0.86, 0]} castShadow />
      <mesh geometry={roofSlabs} material={slam('#cf6a52')} position={[0, 0.86, 0]} castShadow receiveShadow />
      {/* chimney */}
      <mesh geometry={G.box} material={slam('#b9644e')} position={[0.42, 1.55, -0.25]} scale={[0.2, 0.75, 0.2]} castShadow />
      <mesh geometry={G.box} material={slam('#8f4c3c')} position={[0.42, 1.94, -0.25]} scale={[0.25, 0.06, 0.25]} />
      {/* door + windows on the front (+z) and side (+x) */}
      <mesh geometry={G.box} material={slam('#86563f')} position={[-0.3, 0.3, 0.595]} scale={[0.3, 0.5, 0.03]} />
      <mesh geometry={G.box} material={slam('#86563f')} position={[-0.3, 0.07, 0.68]} scale={[0.42, 0.06, 0.16]} />
      <mesh geometry={G.box} material={MAT.window} position={[0.32, 0.5, 0.595]} scale={[0.3, 0.26, 0.03]} />
      <mesh geometry={G.box} material={MAT.window} position={[0.755, 0.5, 0.1]} scale={[0.03, 0.26, 0.3]} />
      <mesh geometry={G.box} material={slam('#ffffff')} position={[0.32, 0.36, 0.62]} scale={[0.36, 0.04, 0.07]} />
      {/* flower box under the window */}
      <mesh geometry={G.box} material={slam('#a66a4c')} position={[0.32, 0.32, 0.65]} scale={[0.34, 0.07, 0.09]} />
    </group>
  )
}

/* ================================================================== trees */
const _c = new THREE.Color()
function Tree({ def, idx, env }: { def: TreeDef; idx: number; env: Env }) {
  const blobs = useRef<(THREE.Mesh | null)[]>([])
  const sway = useRef<THREE.Group>(null)
  const wood = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [beamGeo([0, 0, 0], [0, def.trunk, 0], 0.09 + def.trunk * 0.04, 0.06)]
    def.blobs.forEach(([x, y, z, r], k) => {
      const from: V3 = [0, def.trunk * 0.82, 0]
      const to: V3 = [x * 0.95, y - r * 0.15, z * 0.95]
      parts.push(beamGeo(from, to, 0.045, 0.025))
      // a couple of twigs per branch, visible once the leaves are gone
      for (let t = 0; t < 2; t++) {
        const a = rnd(idx * 31 + k * 7 + t) * TAU
        const tip: V3 = [to[0] + Math.cos(a) * r * 0.6, to[1] + 0.12 + rnd(k + t + idx) * r * 0.5, to[2] + Math.sin(a) * r * 0.6]
        parts.push(beamGeo(to, tip, 0.022, 0.01))
      }
    })
    return mergeGeometries(parts)
  }, [def, idx])
  useFrame(() => {
    const w = env.w
    const base = def.cherry ? mix4(SCALE.cherry, w) : mix4(SCALE.crown, w)
    const k = 1 + env.storm * 0.06 * Math.sin(env.t * 9 + idx)
    def.blobs.forEach(([, , , r], j) => {
      const m = blobs.current[j]
      if (!m) return
      // blobs drop their leaves one after another
      const stag = clamp01(base * 1.25 - (j / def.blobs.length) * 0.25)
      const s = r * Math.max(0.0001, smooth(stag)) * k
      m.scale.set(s, s * 0.92, s)
      m.visible = s > 0.002
    })
    if (sway.current) sway.current.rotation.z = Math.sin(env.t * (1.2 + env.storm * 3) + idx) * (0.015 + env.storm * 0.05 + env.rainfall * 0.01)
  })
  return (
    <group position={def.p}>
      <group ref={sway}>
        <mesh geometry={wood} material={slam('#8b6650')} castShadow receiveShadow />
        {def.blobs.map(([x, y, z], j) => (
          <mesh
            key={j}
            ref={(m) => void (blobs.current[j] = m)}
            geometry={G.blob}
            material={def.cherry ? (j % 2 ? MAT.cherryB : MAT.cherryA) : j % 2 ? MAT.leafB : MAT.leafA}
            position={[x, y, z]}
            castShadow
            receiveShadow
          />
        ))}
      </group>
    </group>
  )
}

function Pine({ p, s = 1 }: { p: V3; s?: number }) {
  return (
    <group position={p} scale={s}>
      <mesh geometry={G.cyl6} material={slam('#7b5a48')} position={[0, 0.15, 0]} scale={[0.07, 0.3, 0.07]} castShadow />
      {[
        [0.5, 0.48, 0.62],
        [0.85, 0.38, 0.5],
        [1.15, 0.27, 0.4],
      ].map(([y, r, h], i) => (
        <mesh key={i} geometry={G.cone} material={slam(i % 2 ? '#5d9c72' : '#4f8e66')} position={[0, y, 0]} scale={[r, h, r]} castShadow receiveShadow />
      ))}
    </group>
  )
}

/* ================================================================== garden bits */
function Pond({ env }: { env: Env }) {
  useFrame(() => {
    mixColor(PAL.water, env.w, MAT.water.color)
    MAT.water.color.lerp(_c.set('#e6f4fb'), env.frozen * 0.65)
    MAT.water.color.multiplyScalar(1 - env.storm * 0.25)
  })
  const stones = useRef<THREE.InstancedMesh>(null)
  const N = 22
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rnd(i) * 0.1
      const s = 0.09 + rnd(i * 3) * 0.07
      q.setFromEuler(new THREE.Euler(0, rnd(i * 5) * 3, 0))
      m.compose(new THREE.Vector3(POND.x + Math.cos(a) * (POND.rx + 0.06), 0.03, POND.z + Math.sin(a) * (POND.rz + 0.06)), q, new THREE.Vector3(s * 1.3, s * 0.6, s))
      stones.current!.setMatrixAt(i, m)
    }
    stones.current!.instanceMatrix.needsUpdate = true
    stones.current!.computeBoundingSphere()
  }, [])
  return (
    <group>
      <mesh geometry={G.cyl} material={slam('#c5b49c')} position={[POND.x, 0.005, POND.z]} scale={[POND.rx + 0.05, 0.03, POND.rz + 0.05]} receiveShadow />
      <mesh geometry={G.cyl} material={MAT.water} position={[POND.x, 0.02, POND.z]} scale={[POND.rx, 0.03, POND.rz]} receiveShadow />
      <instancedMesh ref={stones} args={[G.ball, slam('#c9c3ba'), N]} castShadow receiveShadow />
      {/* lily pads (sink once the pond freezes) */}
      {[
        [0.5, 0.15],
        [-0.35, -0.2],
        [0.15, 0.42],
      ].map(([dx, dz], i) => (
        <mesh key={i} geometry={G.cyl} material={slam('#6cb35c')} position={[POND.x + dx, 0.04, POND.z + dz]} scale={[0.13, 0.01, 0.13]} />
      ))}
    </group>
  )
}

function PathStones() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const pts = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(COTTAGE[0] - 0.3, 0, COTTAGE[2] + 0.95),
      new THREE.Vector3(-1.0, 0, 0.3),
      new THREE.Vector3(-0.35, 0, 1.3),
      new THREE.Vector3(-0.35, 0, 2.4),
      new THREE.Vector3(0.05, 0, 3.55),
    ])
    return Array.from({ length: 11 }, (_, i) => curve.getPointAt(i / 10))
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    pts.forEach((p, i) => {
      const s = 0.17 + rnd(i * 2.3) * 0.05
      q.setFromEuler(new THREE.Euler(0, rnd(i) * 3, 0))
      m.compose(new THREE.Vector3(p.x + (rnd(i * 7) - 0.5) * 0.12, 0.03, p.z), q, new THREE.Vector3(s * 1.2, 0.035, s))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
    ref.current!.computeBoundingSphere()
  }, [pts])
  return <instancedMesh ref={ref} args={[G.cyl, slam('#e4dccd'), pts.length]} receiveShadow />
}

const FENCE: V3[] = [
  [-3.45, 0, 0.35],
  [-3.2, 0, 1.15],
  [-2.85, 0, 1.95],
  [-2.3, 0, 2.6],
  [-1.6, 0, 3.05],
  [-0.85, 0, 3.3],
]
function Fence() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    FENCE.forEach((p) => {
      const g = new THREE.BoxGeometry(0.09, 0.5, 0.09)
      g.translate(p[0], 0.25, p[2])
      parts.push(g)
      const cap = new THREE.ConeGeometry(0.07, 0.08, 4)
      cap.rotateY(Math.PI / 4)
      cap.translate(p[0], 0.54, p[2])
      parts.push(cap)
    })
    for (let i = 0; i < FENCE.length - 1; i++) {
      const a = FENCE[i]
      const b = FENCE[i + 1]
      const len = Math.hypot(b[0] - a[0], b[2] - a[2])
      const ang = Math.atan2(b[2] - a[2], b[0] - a[0])
      for (const y of [0.2, 0.38]) {
        const g = new THREE.BoxGeometry(len, 0.06, 0.04)
        g.rotateY(-ang)
        g.translate((a[0] + b[0]) / 2, y, (a[2] + b[2]) / 2)
        parts.push(g)
      }
    }
    return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))
  }, [])
  return <mesh geometry={geo} material={slam('#f3e7d3')} castShadow receiveShadow />
}

/** garden bed inside the fence: sunflowers (summer) and pumpkins (autumn) */
const BED: [number, number][] = [
  [-2.75, 0.75],
  [-2.45, 1.45],
  [-2.0, 2.05],
  [-1.4, 2.5],
  [-2.05, 1.0],
  [-1.6, 1.65],
]
function Garden({ env }: { env: Env }) {
  const flowers = useRef<(THREE.Group | null)[]>([])
  const heads = useRef<(THREE.Group | null)[]>([])
  const pumpkins = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const sf = mix4(SCALE.sunflower, env.w)
    const pk = mix4(SCALE.pumpkin, env.w)
    flowers.current.forEach((g, i) => {
      if (!g) return
      const s = smooth(clamp01(sf * 1.3 - i * 0.05))
      g.scale.set(Math.max(0.001, 0.4 + 0.6 * s), Math.max(0.001, s), Math.max(0.001, 0.4 + 0.6 * s))
      g.visible = s > 0.01
      g.rotation.z = Math.sin(env.t * 1.3 + i) * 0.04 * (1 + env.storm * 3)
      // spring: only seedlings; the heads open as summer arrives
      const h = heads.current[i]
      if (h) h.scale.setScalar(Math.max(0.001, smooth(clamp01((s - 0.55) / 0.35))))
    })
    pumpkins.current.forEach((g, i) => {
      if (!g) return
      const s = smooth(clamp01(pk * 1.25 - i * 0.05))
      g.scale.setScalar(Math.max(0.001, s))
      g.visible = s > 0.01
    })
  })
  return (
    <group>
      <mesh geometry={G.cyl} material={slam('#b48a66')} position={[-2.2, 0.012, 1.6]} rotation={[0, -0.75, 0]} scale={[0.55, 0.04, 1.15]} receiveShadow />
      {BED.slice(0, 5).map(([x, z], i) => (
        <group key={i} ref={(g) => void (flowers.current[i] = g)} position={[x, 0, z]}>
          <mesh geometry={G.cyl6} material={slam('#5c9b4a')} position={[0, 0.38, 0]} scale={[0.022, 0.76, 0.022]} castShadow />
          <mesh geometry={G.box} material={slam('#6aa955')} position={[0.07, 0.35, 0]} rotation={[0, 0, -0.6]} scale={[0.14, 0.02, 0.07]} />
          <group ref={(g) => void (heads.current[i] = g)} position={[0, 0.8, 0]} rotation={[0.5, 0.78, 0]}>
            <mesh geometry={G.cyl} material={slam('#ffc928')} scale={[0.15, 0.025, 0.15]} castShadow />
            <mesh geometry={G.cyl} material={slam('#7a4a2a')} position={[0, 0.016, 0]} scale={[0.075, 0.025, 0.075]} />
          </group>
        </group>
      ))}
      {[
        [-2.3, 1.15, 0.2],
        [-1.75, 1.95, 0.16],
        [-2.65, 1.95, 0.13],
        [-1.25, 2.85, 0.14],
        [-0.55, 0.15, 0.12],
      ].map(([x, z, r], i) => (
        <group key={i} ref={(g) => void (pumpkins.current[i] = g)} position={[x, 0, z]}>
          <mesh geometry={G.ball} material={slam(i % 2 ? '#f08a2c' : '#e9781f')} position={[0, r * 0.7, 0]} scale={[r, r * 0.72, r]} castShadow />
          <mesh geometry={G.cyl6} material={slam('#5b7a3a')} position={[0, r * 1.45, 0]} rotation={[0, 0, 0.3]} scale={[0.02, r * 0.5, 0.02]} />
        </group>
      ))}
    </group>
  )
}

function Snowman({ env }: { env: Env }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = smooth(clamp01(mix4(SCALE.snowman, env.w) * 1.6 - 0.45))
    if (ref.current) {
      ref.current.scale.setScalar(Math.max(0.001, s))
      ref.current.visible = s > 0.01
    }
  })
  return (
    <group ref={ref} position={[0.55, 0, -0.05]} rotation={[0, 0.7, 0]}>
      <mesh geometry={G.ball} material={MAT.white} position={[0, 0.22, 0]} scale={0.26} castShadow />
      <mesh geometry={G.ball} material={MAT.white} position={[0, 0.55, 0]} scale={0.18} castShadow />
      <mesh geometry={G.ball} material={MAT.white} position={[0, 0.8, 0]} scale={0.13} castShadow />
      <mesh geometry={G.cone} material={slam('#f08a2c')} position={[0, 0.8, 0.16]} rotation={[Math.PI / 2, 0, 0]} scale={[0.03, 0.14, 0.03]} />
      <mesh material={slam('#e2483d')} position={[0, 0.67, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.035, 6, 20]} />
      </mesh>
      <mesh geometry={G.cyl} material={slam('#3b3540')} position={[0, 0.95, 0]} scale={[0.1, 0.12, 0.1]} />
      <mesh geometry={G.cyl} material={slam('#3b3540')} position={[0, 0.89, 0]} scale={[0.15, 0.015, 0.15]} />
      {[-0.05, 0.05].map((x) => (
        <mesh key={x} geometry={G.ball} material={slam('#3b3540')} position={[x, 0.84, 0.115]} scale={0.016} />
      ))}
    </group>
  )
}

/** grass tufts + spring flowers scattered over the lawn */
function Lawn({ env }: { env: Env }) {
  const tufts = useRef<THREE.InstancedMesh>(null)
  const flowers = useRef<THREE.InstancedMesh>(null)
  const spots = useMemo(() => {
    const out: [number, number, number][] = []
    let k = 0
    while (out.length < 110 && k < 2000) {
      k++
      const a = rnd(k * 1.3) * TAU
      const r = Math.sqrt(rnd(k * 2.7)) * isleRadius(a) * 0.9
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (Math.hypot(x - COTTAGE[0], z - COTTAGE[2]) < 1.1) continue
      if (((x - POND.x) / (POND.rx + 0.25)) ** 2 + ((z - POND.z) / (POND.rz + 0.25)) ** 2 < 1) continue
      if (Math.hypot(x + 2.15, z - 1.55) < 0.9) continue
      out.push([x, z, rnd(k * 9.1)])
    }
    return out
  }, [])
  const fl = spots.slice(0, 46)
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const FC = ['#ffffff', '#ffd84a', '#ff9cc0', '#c8a8ff', '#ffffff']
    spots.forEach(([x, z, r], i) => {
      m.makeScale(0.06 + r * 0.04, 0.12 + r * 0.1, 0.06 + r * 0.04).setPosition(x, 0.06, z)
      tufts.current!.setMatrixAt(i, m)
    })
    fl.forEach((_, i) => flowers.current!.setColorAt(i, c.set(FC[i % FC.length])))
    tufts.current!.instanceMatrix.needsUpdate = true
    tufts.current!.computeBoundingSphere()
    flowers.current!.instanceColor!.needsUpdate = true
  }, [spots, fl])
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame(() => {
    const f = mix4(SCALE.flower, env.w)
    fl.forEach(([x, z, r], i) => {
      const s = smooth(clamp01(f * 1.4 - r * 0.4)) * 0.045
      m.makeScale(s, s * 0.8, s).setPosition(x + 0.07, 0.07, z + 0.05)
      flowers.current!.setMatrixAt(i, m)
    })
    flowers.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <>
      <instancedMesh ref={tufts} args={[G.cone, MAT.tuft, spots.length]} castShadow />
      <instancedMesh ref={flowers} args={[G.ball, slam('#ffffff'), fl.length]} frustumCulled={false} />
    </>
  )
}

/* ================================================================== particles */
const FALL_N = 200
const petalGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(0, -1)
  s.quadraticCurveTo(0.85, -0.1, 0, 1)
  s.quadraticCurveTo(-0.85, -0.1, 0, -1)
  return new THREE.ShapeGeometry(s, 4)
})()
const fallMat = new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide })
const PETAL_COLS = ['#ffb3cc', '#ffd1df', '#fff0f5', '#ff9fbe']
const LEAF_COLS = ['#f2a53a', '#e0583a', '#f5c94a', '#c94a30']
/** cherry petals (spring) and leaves (autumn): spawned in the crowns, flutter down, settle on the lawn or the pond */
function FallingFoliage({ env }: { env: Env }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const P = useMemo(
    () => ({
      p: new Float32Array(FALL_N * 3),
      v: new Float32Array(FALL_N * 3),
      r: new Float32Array(FALL_N * 3),
      spin: new Float32Array(FALL_N * 3),
      life: new Float32Array(FALL_N),
      land: new Float32Array(FALL_N),
      kind: new Uint8Array(FALL_N),
      size: new Float32Array(FALL_N),
      acc: [0, 0],
      t: 0,
    }),
    [],
  )
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() }), [])

  const spawn = useCallback(
    (kind: 0 | 1) => {
      let i = -1
      for (let k = 0; k < FALL_N; k++)
        if (P.life[k] <= 0) {
          i = k
          break
        }
      if (i < 0) return
      const tree = kind === 0 ? TREES[0] : TREES[Math.floor(Math.random() * TREES.length)]
      const b = tree.blobs[Math.floor(Math.random() * tree.blobs.length)]
      const a = Math.random() * TAU
      const rr = b[3] * (0.4 + Math.random() * 0.6)
      P.p.set([tree.p[0] + b[0] + Math.cos(a) * rr, b[1] + (Math.random() - 0.4) * b[3], tree.p[2] + b[2] + Math.sin(a) * rr], i * 3)
      P.v.set([0, 0, 0], i * 3)
      P.r.set([Math.random() * TAU, Math.random() * TAU, Math.random() * TAU], i * 3)
      P.spin.set([(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6], i * 3)
      P.life[i] = 1
      P.land[i] = 0
      P.kind[i] = kind
      P.size[i] = kind === 0 ? 0.05 + Math.random() * 0.025 : 0.065 + Math.random() * 0.03
      const cols = kind === 0 ? PETAL_COLS : LEAF_COLS
      ref.current!.setColorAt(i, tmp.c.set(cols[Math.floor(Math.random() * cols.length)]))
      ref.current!.instanceColor!.needsUpdate = true
    },
    [P, tmp],
  )

  const step = useCallback(
    (dt: number) => {
      P.t += dt
      const w = env.w
      const rate0 = w[0] * 24 * (1 - env.rainfall * 0.5) * (1 - env.snowfall * 0.8)
      const rate1 = w[2] * 20 * (1 + env.storm) + w[3] * 4 * (1 - w[3])
      P.acc[0] += rate0 * dt
      P.acc[1] += rate1 * dt
      while (P.acc[0] >= 1) {
        P.acc[0]--
        spawn(0)
      }
      while (P.acc[1] >= 1) {
        P.acc[1]--
        spawn(1)
      }
      const wind = env.wind
      for (let i = 0; i < FALL_N; i++) {
        if (P.life[i] <= 0) continue
        const o = i * 3
        if (P.land[i] > 0) {
          P.land[i] += dt
          // floating on the pond: drift slowly
          if (P.p[o + 1] > 0.02) {
            P.p[o] += Math.sin(P.t * 0.4 + i) * 0.03 * dt
            P.p[o + 2] += Math.cos(P.t * 0.3 + i) * 0.03 * dt
          }
          if (P.land[i] > 4 + (i % 5) * 0.8 || (env.rainfall > 0.5 && P.land[i] > 1.5) || env.snowAmt > 0.35) P.life[i] -= dt * 1.2
          continue
        }
        const k = P.kind[i]
        const fall = k === 0 ? 0.32 : 0.48
        const flut = Math.sin(P.t * (2.2 + (i % 7) * 0.2) + i) * (k === 0 ? 0.45 : 0.3)
        P.v[o] += (wind * 0.8 + flut - P.v[o]) * Math.min(1, dt * 2)
        P.v[o + 1] += (-fall - env.rainfall * 0.8 - P.v[o + 1]) * Math.min(1, dt * 3)
        P.v[o + 2] += (wind * 0.35 + Math.cos(P.t * 1.7 + i) * 0.25 - P.v[o + 2]) * Math.min(1, dt * 2)
        P.p[o] += P.v[o] * dt
        P.p[o + 1] += P.v[o + 1] * dt
        P.p[o + 2] += P.v[o + 2] * dt
        P.r[o] += P.spin[o] * dt
        P.r[o + 1] += P.spin[o + 1] * dt
        P.r[o + 2] += P.spin[o + 2] * dt
        const x = P.p[o]
        const z = P.p[o + 2]
        const inside = Math.hypot(x, z) < isleRadius(Math.atan2(z, x)) * 0.97
        const ground = 0.03
        if (inside && P.p[o + 1] <= ground) {
          const onPond = ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2 < 1
          P.p[o + 1] = onPond ? 0.045 : ground
          P.land[i] = 0.001
          P.r[o] = -Math.PI / 2
          P.r[o + 1] = 0
        }
        if (P.p[o + 1] < -6) P.life[i] = 0
      }
    },
    [P, env, spawn],
  )

  useLayoutEffect(() => {
    const g = ref.current!
    const m = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < FALL_N; i++) {
      g.setMatrixAt(i, m)
      g.setColorAt(i, tmp.c.set('#ffffff'))
    }
    g.instanceMatrix.needsUpdate = true
    // pre-roll so the first frame (and the poster) already has petals in the air
    for (let k = 0; k < 150; k++) step(1 / 30)
  }, [step, tmp])

  useFrame((_, dt) => {
    step(Math.min(dt, 1 / 30))
    const g = ref.current!
    const { m, q, e, s, v } = tmp
    for (let i = 0; i < FALL_N; i++) {
      const o = i * 3
      const l = P.life[i]
      if (l <= 0) {
        m.makeScale(0, 0, 0)
      } else {
        e.set(P.r[o], P.r[o + 1], P.r[o + 2])
        q.setFromEuler(e)
        const sz = P.size[i] * Math.min(1, l * 3)
        s.set(sz, sz * (P.kind[i] === 0 ? 1 : 1.3), sz)
        v.set(P.p[o], P.p[o + 1], P.p[o + 2])
        m.compose(v, q, s)
      }
      g.setMatrixAt(i, m)
    }
    g.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[petalGeo, fallMat, FALL_N]} frustumCulled={false} castShadow />
}

const SNOW_N = 520
function Snowfall({ env }: { env: Env }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => createDotGeometry(SNOW_N), [])
  const mat = useMemo(() => createDotMaterial('#ffffff', 0.7), [])
  const P = useMemo(() => {
    const p = new Float32Array(SNOW_N * 4)
    for (let i = 0; i < SNOW_N; i++) p.set([(rnd(i) - 0.5) * 12, rnd(i * 3.3) * 12 - 4, (rnd(i * 7.1) - 0.5) * 12, 0.05 + rnd(i * 1.9) * 0.06], i * 4)
    return p
  }, [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current!
    const amt = env.snowfall
    const alpha = geo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute
    const t = env.t
    for (let i = 0; i < SNOW_N; i++) {
      const o = i * 4
      const sz = P[o + 3]
      P[o + 1] -= (0.55 + sz * 6 + env.storm * 1.5) * dt
      P[o] += (Math.sin(t * 0.9 + i) * 0.25 + env.wind * 0.6) * dt
      P[o + 2] += Math.cos(t * 0.7 + i * 1.3) * 0.2 * dt
      if (P[o + 1] < -4) {
        P[o + 1] += 12
        P[o] = (Math.random() - 0.5) * 12
        P[o + 2] = (Math.random() - 0.5) * 12
      }
      if (P[o] > 6) P[o] -= 12
      const vis = i / SNOW_N < amt ? 1 : 0
      alpha.setX(i, vis * (0.75 + (i % 4) * 0.06))
      m.makeScale(sz * 2, sz * 2, sz * 2).setPosition(P[o], P[o + 1], P[o + 2])
      g.setMatrixAt(i, m)
    }
    alpha.needsUpdate = true
    g.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, SNOW_N]} frustumCulled={false} renderOrder={4} />
}

const RAIN_N = 700
const rainMat = new THREE.MeshBasicMaterial({ color: '#8ea7c4', transparent: true, opacity: 0.55, depthWrite: false })
function Rain({ env }: { env: Env }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const P = useMemo(() => {
    const p = new Float32Array(RAIN_N * 3)
    for (let i = 0; i < RAIN_N; i++) p.set([(rnd(i * 2.1) - 0.5) * 12, rnd(i * 5.3) * 13 - 4, (rnd(i * 8.7) - 0.5) * 12], i * 3)
    return p
  }, [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), e: new THREE.Euler() }), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current!
    const amt = env.rainfall
    const slant = 0.12 + env.storm * 0.25
    const { m, q, s, v, e } = tmp
    e.set(0, 0, -slant)
    q.setFromEuler(e)
    rainMat.color.set(env.storm > 0.5 ? '#c7d3e6' : '#8ea7c4')
    rainMat.opacity = 0.35 + 0.25 * amt
    for (let i = 0; i < RAIN_N; i++) {
      const o = i * 3
      P[o + 1] -= (9 + (i % 5)) * dt
      P[o] += (9 + (i % 5)) * dt * slant
      if (P[o + 1] < -4) {
        P[o + 1] += 13
        P[o] = (Math.random() - 0.5) * 12 - 1
        P[o + 2] = (Math.random() - 0.5) * 12
      }
      const vis = i / RAIN_N < amt
      s.set(vis ? 0.011 : 0, vis ? 0.34 : 0, vis ? 0.011 : 0)
      v.set(P[o], P[o + 1], P[o + 2])
      m.compose(v, q, s)
      g.setMatrixAt(i, m)
    }
    g.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[G.box, rainMat, RAIN_N]} frustumCulled={false} renderOrder={3} />
}

const RIP_N = 14
const ripGeo = (() => {
  const g = new THREE.RingGeometry(0.82, 1, 32)
  g.rotateX(-Math.PI / 2)
  return g
})()
const ripMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
function Ripples({ env }: { env: Env }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const st = useMemo(() => ({ age: new Float32Array(RIP_N).fill(2), x: new Float32Array(RIP_N), z: new Float32Array(RIP_N), acc: 0 }), [])
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), c: new THREE.Color(), w: new THREE.Color('#ffffff') }), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const g = ref.current!
    st.acc += env.rainfall * (1 - env.frozen) * 11 * dt
    while (st.acc >= 1) {
      st.acc--
      let i = 0
      for (let k = 1; k < RIP_N; k++) if (st.age[k] > st.age[i]) i = k
      const a = Math.random() * TAU
      const r = Math.sqrt(Math.random()) * 0.8
      st.x[i] = POND.x + Math.cos(a) * r * POND.rx
      st.z[i] = POND.z + Math.sin(a) * r * POND.rz
      st.age[i] = 0
    }
    const { m, c, w } = tmp
    for (let i = 0; i < RIP_N; i++) {
      st.age[i] += dt
      const k = st.age[i] / 1.1
      const s = k < 1 ? 0.03 + k * 0.26 : 0
      m.makeScale(s, 1, s).setPosition(st.x[i], 0.04, st.z[i])
      g.setMatrixAt(i, m)
      c.copy(w).lerp(MAT.water.color, clamp01(k))
      g.setColorAt(i, c)
    }
    g.instanceMatrix.needsUpdate = true
    g.instanceColor!.needsUpdate = true
  })
  useLayoutEffect(() => {
    const g = ref.current!
    for (let i = 0; i < RIP_N; i++) {
      g.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0))
      g.setColorAt(i, new THREE.Color('#ffffff'))
    }
  }, [])
  return <instancedMesh ref={ref} args={[ripGeo, ripMat, RIP_N]} frustumCulled={false} />
}

const SMOKE_N = 18
function Smoke({ env }: { env: Env }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => createDotGeometry(SMOKE_N), [])
  const mat = useMemo(() => createDotMaterial('#e3e7ee', 0.9), [])
  const st = useMemo(() => ({ age: new Float32Array(SMOKE_N).fill(9), ox: new Float32Array(SMOKE_N), acc: 0 }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const amt = clamp01(env.w[3] + env.w[2] * 0.35 + env.snowfall * 0.5)
    st.acc += dt * 3.2 * (amt > 0.05 ? 1 : 0)
    while (st.acc >= 1) {
      st.acc--
      let i = 0
      for (let k = 1; k < SMOKE_N; k++) if (st.age[k] > st.age[i]) i = k
      st.age[i] = 0
      st.ox[i] = (Math.random() - 0.5) * 0.08
    }
    const alpha = geo.getAttribute('aAlpha') as THREE.InstancedBufferAttribute
    const g = ref.current!
    for (let i = 0; i < SMOKE_N; i++) {
      st.age[i] += dt
      const k = st.age[i] / 4.2
      const live = k < 1
      const s = live ? 0.16 + k * 0.62 : 0
      const y = CHIMNEY_TOP[1] + k * 1.6
      m.makeScale(s, s, s).setPosition(CHIMNEY_TOP[0] + st.ox[i] + k * k * (0.9 + env.wind), y, CHIMNEY_TOP[2] - k * 0.3)
      g.setMatrixAt(i, m)
      alpha.setX(i, live ? amt * 0.8 * Math.sin(Math.PI * Math.min(1, k * 1.25 + 0.08)) : 0)
    }
    mat.uniforms.uColor.value.set(env.storm > 0.4 ? '#c3c8d2' : env.snowAmt > 0.4 ? '#cfd5df' : '#e9ecf1')
    alpha.needsUpdate = true
    g.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geo, mat, SMOKE_N]} frustumCulled={false} renderOrder={4} />
}

/* ================================================================== clouds + lightning */
// placed from their intended screen spot (iso: sx = (x − z)/√2, sy = (2y − x − z)/√6) so they frame the isle
const CLOUDS: { p: V3; s: number }[] = [
  { p: [-3.56, 1.2, -2.86], s: 1.0 },
  { p: [-1.97, -1.8, 4.25], s: 0.85 },
  { p: [-0.27, 1.0, -5.08], s: 1.05 },
  { p: [-4.42, 0.3, 2.08], s: 0.85 },
  { p: [4.34, -1.6, -1.17], s: 0.9 },
  { p: [1.89, 0.6, -4.61], s: 0.85 },
  { p: [-4.2, 1.4, -0.83], s: 0.95 },
]
const cloudGeo = (() => {
  const parts = [
    [0, 0, 0, 0.9, 0.5, 0.7],
    [0.75, -0.08, 0.1, 0.62, 0.4, 0.52],
    [-0.72, -0.1, 0, 0.58, 0.36, 0.48],
    [0.2, 0.25, -0.1, 0.55, 0.42, 0.5],
  ].map(([x, y, z, sx, sy, sz]) => {
    const g = new THREE.SphereGeometry(1, 14, 10)
    g.scale(sx, sy, sz)
    g.translate(x, y, z)
    return g
  })
  return mergeGeometries(parts)
})()
const CLOUD_COL = { white: new THREE.Color('#ffffff'), rain: new THREE.Color('#a9b3c2'), storm: new THREE.Color('#5b6274') }
function Clouds({ env }: { env: Env }) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  useFrame(() => {
    const c = MAT.cloud.color
    c.copy(CLOUD_COL.white).lerp(CLOUD_COL.rain, clamp01(env.cover * 1.2 - env.storm)).lerp(CLOUD_COL.storm, env.storm)
    c.lerp(CLOUD_COL.white, env.flash * 0.6)
    MAT.cloud.emissiveIntensity = 0.32 * (1 - env.storm * 0.75) + env.flash * 0.5
    CLOUDS.forEach((cl, i) => {
      const m = refs.current[i]
      if (!m) return
      const on = i < 2 ? Math.max(0.55, env.cover) : smooth(clamp01((env.cover - 0.2 - i * 0.07) / 0.3))
      const s = cl.s * (0.55 + 0.45 * on) * Math.max(0.001, i < 2 ? 1 : on)
      m.scale.set(s, s * (1 + env.storm * 0.25), s)
      m.position.set(cl.p[0] + Math.sin(env.t * 0.12 + i * 2) * 0.5, cl.p[1], cl.p[2] + Math.cos(env.t * 0.1 + i) * 0.4)
      m.visible = s > 0.01
    })
  })
  return (
    <group>
      {CLOUDS.map((c, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={cloudGeo} material={MAT.cloud} position={c.p} />
      ))}
    </group>
  )
}

const boltMat = new THREE.MeshBasicMaterial({ color: '#f6f2ff' })
function Lightning({ env, flashEl }: { env: Env; flashEl: React.RefObject<HTMLDivElement | null> }) {
  const bolt = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.InstancedMesh>(null)
  const gmat = useMemo(() => createGlowMaterial(1), [])
  const st = useMemo(() => ({ next: 1.2, t: 9, pts: [] as THREE.Vector3[] }), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const strike = useCallback(() => {
    const a = Math.random() * TAU
    const r = 1 + Math.random() * 3.6
    const end = new THREE.Vector3(Math.cos(a) * r, r < isleRadius(a) * 0.9 ? 0.05 : -3.5, Math.sin(a) * r)
    const start = new THREE.Vector3(end.x - 1.5 + Math.random() * 3, 11, end.z - 1.5 + Math.random() * 3)
    const pts: THREE.Vector3[] = [start]
    const n = 12
    for (let i = 1; i < n; i++) {
      const p = start.clone().lerp(end, i / n)
      p.x += (Math.random() - 0.5) * 0.7
      p.z += (Math.random() - 0.5) * 0.7
      pts.push(p)
    }
    pts.push(end)
    const path = new THREE.CurvePath<THREE.Vector3>()
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
    const g = new THREE.TubeGeometry(path, 60, 0.035, 4, false)
    if (bolt.current) {
      bolt.current.geometry.dispose()
      bolt.current.geometry = g
    }
    st.pts = pts
    st.t = 0
  }, [st])
  useLayoutEffect(() => {
    const g = glow.current!
    for (let i = 0; i < 8; i++) g.setMatrixAt(i, m.makeScale(0, 0, 0))
  }, [m])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    st.t += dt
    if (env.storm > 0.6 && !POSTER) {
      st.next -= dt
      if (st.next <= 0) {
        strike()
        st.next = 2.2 + Math.random() * 3.8
      }
    } else st.next = Math.max(st.next, 0.8)
    const t = st.t
    const f = t < 0.06 ? t / 0.06 : t < 0.16 ? 1 - ((t - 0.06) / 0.1) * 0.8 : t < 0.22 ? 0.2 + ((t - 0.16) / 0.06) * 0.7 : Math.max(0, 0.9 * (1 - (t - 0.22) / 0.45))
    env.flash = f * env.storm
    if (bolt.current) bolt.current.visible = t < 0.38 && env.storm > 0.3
    const g = glow.current!
    for (let i = 0; i < 8; i++) {
      const p = st.pts[Math.min(st.pts.length - 1, Math.round((i / 7) * (st.pts.length - 1)))]
      const s = p && t < 0.38 ? 1.6 * f : 0
      m.makeScale(s, s, s)
      if (p) m.setPosition(p)
      g.setMatrixAt(i, m)
    }
    g.instanceMatrix.needsUpdate = true
    gmat.uniforms.uIntensity.value = 0.9
    gmat.uniforms.uTint.value.set('#cfc6ff')
    if (flashEl.current) flashEl.current.style.opacity = String(env.flash * 0.32)
  })
  return (
    <>
      <mesh ref={bolt} material={boltMat} visible={false} frustumCulled={false}>
        <cylinderGeometry args={[0.03, 0.03, 1, 4]} />
      </mesh>
      <instancedMesh ref={glow} args={[quadGeo, gmat, 8]} frustumCulled={false} renderOrder={6} />
    </>
  )
}

/* ================================================================== driver + lighting */
function Driver({ env, season, rain, snow, storm }: { env: Env; season: MotionValue<number>; rain: MotionValue<number>; snow: MotionValue<number>; storm: MotionValue<number> }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4ea', 1.6)
    l.position.set(5, 11, 4)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -7
    cam.right = cam.top = 7
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0006
    l.shadow.normalBias = 0.025
    return l
  }, [])
  const col = useMemo(() => ({ a: new THREE.Color(), b: new THREE.Color(), grey: new THREE.Color('#c3cad6'), storm: new THREE.Color('#7d86a3'), flash: new THREE.Color('#e6e2ff') }), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    env.t += dt
    seasonWeights(season.get(), env.w)
    const w = env.w
    const r = rain.get()
    const sn = snow.get()
    const st = storm.get()
    env.storm = st
    env.rainfall = clamp01(r + st)
    env.snowfall = clamp01(Math.max(sn, w[3] * 0.42 * (1 - env.rainfall)))
    env.cover = clamp01(Math.max(r * 0.8, sn * 0.65, st, 0.12))
    env.frozen = smooth(clamp01(w[3] * 1.3 - 0.2))
    env.wind = 0.22 + st * 1.4 + r * 0.2
    env.dark = clamp01(st * 0.8 + r * 0.3 + sn * 0.12)
    const target = clamp01(Math.max(w[3] * 0.96, sn * 0.75)) * (1 - env.rainfall * 0.4 * (1 - w[3]))
    env.snowAmt += (target - env.snowAmt) * (1 - Math.exp(-dt * (target > env.snowAmt ? 0.9 : 1.6)))
    SNOW_U.uSnow.value = env.snowAmt

    // seasonal colours
    mixColor(PAL.grass, w, MAT.grass.color)
    mixColor(PAL.tuft, w, MAT.tuft.color)
    mixColor(PAL.cherryA, w, MAT.cherryA.color)
    mixColor(PAL.cherryB, w, MAT.cherryB.color)
    mixColor(PAL.leafA, w, MAT.leafA.color)
    mixColor(PAL.leafB, w, MAT.leafB.color)
    MAT.window.emissiveIntensity = clamp01(env.dark * 1.1 + w[3] * 0.45) * 0.95

    // light
    const f = env.flash
    mixColor(PAL.amb, w, col.a).lerp(col.grey, env.cover * 0.5).lerp(col.storm, st * 0.7).lerp(col.flash, f)
    amb.current!.color.copy(col.a)
    amb.current!.intensity = lerp(1.32, 0.95, env.dark) + f * 2.2
    hemi.current!.color.copy(col.a)
    mixColor(PAL.ground, w, hemi.current!.groundColor)
    hemi.current!.intensity = 0.65 + f * 0.8
    mixColor(PAL.sun, w, sun.color)
    sun.intensity = mix4([1.55, 1.75, 1.5, 1.35], w) * (1 - env.cover * 0.62) * (1 - st * 0.25)
    sun.position.set(5, mix4([11, 13, 9, 8], w), 4)
  }, -2)
  return (
    <>
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <primitive object={sun} />
    </>
  )
}

/* ================================================================== scene */
function Isle({ env, rot }: { env: Env; rot: MotionValue<number> }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const g = ref.current
    if (!g) return
    g.rotation.y = rot.get()
    g.position.y = Math.sin(env.t * 0.7) * 0.08
  })
  return (
    <group ref={ref}>
      <IsleBody />
      <Lawn env={env} />
      <Cottage />
      {TREES.map((t, i) => (
        <Tree key={i} def={t} idx={i} env={env} />
      ))}
      <Pine p={[-3.0, 0, -1.25]} s={1.05} />
      <Pine p={[-2.25, 0, -2.75]} s={0.8} />
      <Pond env={env} />
      <PathStones />
      <Fence />
      <Garden env={env} />
      <Snowman env={env} />
      <FallingFoliage env={env} />
      <Ripples env={env} />
      <Smoke env={env} />
    </group>
  )
}

function Scene(props: { env: Env; rot: MotionValue<number>; season: MotionValue<number>; rain: MotionValue<number>; snow: MotionValue<number>; storm: MotionValue<number>; flashEl: React.RefObject<HTMLDivElement | null>; onReady: () => void }) {
  const { env, rot, flashEl, onReady } = props
  useScreenWarmup(onReady)
  return (
    <>
      <Driver env={env} season={props.season} rain={props.rain} snow={props.snow} storm={props.storm} />
      <Isle env={env} rot={rot} />
      <Clouds env={env} />
      <Rain env={env} />
      <Snowfall env={env} />
      <Lightning env={env} flashEl={flashEl} />
    </>
  )
}

/* ================================================================== page */
const STEPS: { s: Season; w: Weather; t: number; turn?: boolean }[] = [
  { s: 0, w: 'sun', t: 7 },
  { s: 0, w: 'rain', t: 5 },
  { s: 1, w: 'sun', t: 6 },
  { s: 1, w: 'storm', t: 6, turn: true },
  { s: 2, w: 'sun', t: 6 },
  { s: 2, w: 'rain', t: 5 },
  { s: 3, w: 'snow', t: 7, turn: true },
  { s: 3, w: 'sun', t: 5 },
]
const WEATHER_TEXT: Record<Weather, string> = { sun: '晴', rain: '小雨', snow: '降雪', storm: '雷暴' }

export default function SeasonsIsle() {
  const env = useMemo(makeEnv, [])
  const season = useMotionValue(0)
  const rain = useMotionValue(0)
  const snow = useMotionValue(0)
  const storm = useMotionValue(0)
  const rot = useMotionValue(0)
  const [s, setS] = useState<Season>(0)
  const [w, setW] = useState<Weather>('sun')
  const [auto, setAuto] = useState(!POSTER)
  const [ready, setReady] = useState(false)
  const flashEl = useRef<HTMLDivElement>(null)
  const rotTarget = useRef(0)

  // season: animate along the shortest way round the year
  useEffect(() => {
    const cur = season.get()
    let d = (s - (((cur % 4) + 4) % 4) + 4) % 4
    if (d > 2) d -= 4
    const base = cur
    const ctl = animate(season, base + d, {
      duration: 2.4,
      ease: [0.45, 0, 0.2, 1],
      onComplete: () => season.set((((season.get() % 4) + 4) % 4) as number),
    })
    return () => ctl.stop()
  }, [s, season])
  useEffect(() => {
    const opts = { duration: 1.6, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }
    const a = animate(rain, w === 'rain' ? 1 : 0, opts)
    const b = animate(snow, w === 'snow' ? 1 : 0, opts)
    const c = animate(storm, w === 'storm' ? 1 : 0, opts)
    return () => {
      a.stop()
      b.stop()
      c.stop()
    }
  }, [w, rain, snow, storm])

  const turn = useCallback(
    (dir: number, velocity = 0) => {
      rotTarget.current += (dir * Math.PI) / 2
      animate(rot, rotTarget.current, { type: 'spring', stiffness: 110, damping: 15, velocity })
    },
    [rot],
  )

  // auto loop through the year
  useEffect(() => {
    if (!auto) return
    let i = 0
    let left = STEPS[0].t
    const id = setInterval(() => {
      if (document.hidden) return
      left -= 0.5
      if (left > 0) return
      i = (i + 1) % STEPS.length
      const st = STEPS[i]
      setS(st.s)
      setW(st.w)
      if (st.turn) turn(1)
      left = st.t
    }, 500)
    return () => clearInterval(id)
  }, [auto, turn])

  // drag to rotate, snapping to 90° with a spring
  const drag = useRef<{ x: number; base: number; lastX: number; lastT: number; v: number; moved: boolean } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, .hero-copy, .dock')) return
    rot.stop()
    drag.current = { x: e.clientX, base: rot.get(), lastX: e.clientX, lastT: performance.now(), v: 0, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const now = performance.now()
    const dx = e.clientX - d.x
    if (Math.abs(dx) > 4) d.moved = true
    rot.set(d.base + dx * 0.009)
    const inst = ((e.clientX - d.lastX) * 0.009) / Math.max(1, now - d.lastT)
    d.v = d.v * 0.6 + inst * 1000 * 0.4
    d.lastX = e.clientX
    d.lastT = now
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.moved) return
    const q = Math.PI / 2
    const proj = rot.get() + d.v * 0.18
    rotTarget.current = Math.round(proj / q) * q
    animate(rot, rotTarget.current, { type: 'spring', stiffness: 110, damping: 15, velocity: d.v })
  }

  // readouts
  const temp = useTransform(() => {
    const ww = seasonWeights(season.get(), [0, 0, 0, 0])
    return mix4(TEMP, ww) - 3 * rain.get() - 6 * snow.get() - 5 * storm.get()
  })
  const tempText = useTransform(temp, (v) => `${Math.round(v)}°C`)
  const fill = useTransform(temp, (v) => `${(clamp01((v + 12) / 46) * 100).toFixed(1)}%`)
  const month = useTransform(() => {
    const v = ((season.get() % 4) + 4) % 4
    const m = Math.round(MONTH[0] - 1 + v * 3) % 12
    return `${m + 1}月`
  })
  const term = useTransform(() => TERMS[Math.round(((season.get() % 4) + 4) % 4) % 4])
  const dark = w === 'storm'

  const onReady = useCallback(() => setReady(true), [])
  const scene = useMemo(
    () => <Scene env={env} rot={rot} season={season} rain={rain} snow={snow} storm={storm} flashEl={flashEl} onReady={onReady} />,
    [env, rot, season, rain, snow, storm, onReady],
  )

  return (
    <div
      className={`stage si-root si-s${s} si-w-${w}${dark ? ' si-dark' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
    >
      <div aria-hidden className="si-sky si-sky-0" />
      <div aria-hidden className="si-sky si-sky-1" />
      <div aria-hidden className="si-sky si-sky-2" />
      <div aria-hidden className="si-sky si-sky-3" />
      <div aria-hidden className="si-wx si-wx-rain" />
      <div aria-hidden className="si-wx si-wx-snow" />
      <div aria-hidden className="si-wx si-wx-storm" />
      <div aria-hidden className="si-sun" />

      <motion.div className="si-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.6 }}>
        <Canvas orthographic flat shadows="percentage" dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
          <IsoRig fit={13.2} mobileFit={9.6} mobileOffsetY={0.18} offset={[0.2, -0.02]} target={[0, 0.2, 0]} />
          {scene}
        </Canvas>
      </motion.div>
      <div aria-hidden ref={flashEl} className="si-flash" />

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#e88fb0' }} /> Isometric · Seasons
          </p>
          <h1>
            一座小岛
            <br />
            四季轮转
          </h1>
          <p>
            樱花、绿荫、落叶、积雪在同一座岛上流转。<span className="si-long">积雪按表面朝向堆积：平台和屋顶先白，墙面不沾；雨点在池塘激起涟漪，雷暴时闪电把整座岛照亮。</span>拖动小岛可以换个面看。
          </p>
          <div className="si-readout" aria-live="polite">
            <div className="si-cal">
              <motion.b>{month}</motion.b>
              <motion.span>{term}</motion.span>
            </div>
            <div className="si-therm" aria-hidden>
              <motion.i style={{ height: fill }} />
            </div>
            <div className="si-temp">
              <motion.b>{tempText}</motion.b>
              <span>{WEATHER_TEXT[w]}</span>
            </div>
          </div>
        </motion.div>

        <div className="dock si-dock">
          <div className="si-group">
            <Seg
              items={SEASONS}
              value={s}
              onChange={(v) => {
                setAuto(false)
                setS(v)
              }}
            />
          </div>
          <span className="dock-sep" />
          <div className="si-group">
            <Seg
              items={WEATHERS}
              value={w}
              onChange={(v) => {
                setAuto(false)
                setW(v)
              }}
            />
          </div>
          <span className="dock-sep si-sep2" />
          <button className="seg si-auto" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>
              <i className="si-dot" />
              自动轮转
            </span>
          </button>
        </div>
        <p className="hint">拖动小岛旋转 · 松手吸附到 90°</p>
      </div>

      <style>{`
        .si-root { --soft-bg: #f3f5ef; cursor: grab; touch-action: pan-y; }
        .si-root:active { cursor: grabbing; }
        .si-root .hero-copy h1, .si-root .hero-copy p, .si-root .hint { transition: color .8s ease; }
        .si-dark { --fg: #f3f4f8; --fg-2: rgba(243,244,248,.7); --glass: rgba(40,44,60,.55); --glass-line: rgba(255,255,255,.1); --soft-bg: #3a4052; }
        .si-dark .btn.primary { color: #222; }
        .si-sky, .si-wx { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 2.2s ease; }
        .si-sky-0 { background: linear-gradient(180deg, #f6f9f0 0%, #f5f2ee 50%, #fde6ee 100%); }
        .si-sky-1 { background: linear-gradient(180deg, #e9f6fc 0%, #f3f7ec 55%, #f7f0d9 100%); }
        .si-sky-2 { background: linear-gradient(180deg, #fbf3e6 0%, #f8e9dc 55%, #f3d6c2 100%); }
        .si-sky-3 { background: linear-gradient(180deg, #eef3f8 0%, #e8edf4 55%, #dce5ef 100%); }
        .si-s0 .si-sky-0, .si-s1 .si-sky-1, .si-s2 .si-sky-2, .si-s3 .si-sky-3 { opacity: 1; }
        .si-wx { transition-duration: 1.6s; }
        .si-wx-rain { background: linear-gradient(180deg, #d5dde4 0%, #dfe3e6 55%, #d6d9dc 100%); }
        .si-wx-snow { background: linear-gradient(180deg, #e4e9ef 0%, #edf0f4 55%, #e2e7ee 100%); }
        .si-wx-storm { background: linear-gradient(180deg, #3e4558 0%, #555c70 55%, #6b6f80 100%); }
        .si-w-rain .si-wx-rain, .si-w-snow .si-wx-snow, .si-w-storm .si-wx-storm { opacity: 1; }
        .si-sun { position: absolute; right: 15%; top: 10%; width: min(30vw, 380px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, #fff6dc 0%, #fff1d6 42%, transparent 70%); transition: opacity 1.6s, transform 2s; }
        .si-s1 .si-sun { transform: scale(1.15); background: radial-gradient(circle, #fff3c9 0%, #fff0c8 42%, transparent 70%); }
        .si-s3 .si-sun { opacity: .6; }
        .si-w-rain .si-sun, .si-w-snow .si-sun, .si-w-storm .si-sun { opacity: 0; }
        .si-canvas { position: absolute; inset: 0; }
        .si-flash { position: absolute; inset: 0; pointer-events: none; opacity: 0; background: #eef0ff; mix-blend-mode: screen; }
        .si-readout { display: flex; align-items: center; gap: 14px; margin-top: 26px; padding: 10px 16px 10px 10px; width: max-content; border-radius: 18px;
          background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .si-cal { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 12px; overflow: hidden;
          background: #fff; box-shadow: 0 6px 16px -10px rgba(0,0,0,.4); color: #2b2b2b; position: relative; padding-top: 10px; }
        .si-cal::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 13px; background: #e8708f; }
        .si-cal b { font: 600 18px/1.1 var(--display); font-variant-numeric: tabular-nums; }
        .si-cal span { font: 11px/1.2 var(--sans); color: #8a857c; }
        .si-therm { position: relative; width: 10px; height: 52px; border-radius: 6px; background: color-mix(in srgb, var(--fg) 12%, transparent); overflow: hidden; }
        .si-therm i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 6px; background: linear-gradient(0deg, #5aa8e8, #f2c14e 55%, #ef6b4a); background-size: 100% 52px; background-position: bottom; }
        .si-temp { display: flex; flex-direction: column; gap: 4px; }
        .si-temp b { font: 600 24px/1 var(--display); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
        .si-temp span { font: 12px/1 var(--sans); color: var(--fg-2); }
        .si-group { display: contents; }
        @media (max-width: 760px) { .si-group { display: flex; gap: 2px; } }
        .si-dot { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: color-mix(in srgb, var(--fg) 30%, transparent); vertical-align: 1px; transition: background .2s; }
        .si-auto[aria-pressed='true'] .si-dot { background: #4cc38a; box-shadow: 0 0 0 3px rgba(76,195,138,.2); }
        .si-auto[aria-pressed='true'] { background: color-mix(in srgb, var(--fg) 8%, transparent); }
        @media (max-width: 760px) {
          .si-long { display: none; }
          .si-root .hero-copy { bottom: 128px; }
          .si-root .hero-copy > p:not(.kicker) { font-size: 14px; line-height: 1.6; margin-top: 12px; }
          .si-readout { margin-top: 14px; padding: 8px 14px 8px 8px; gap: 12px; }
          .si-cal { width: 48px; height: 48px; }
          .si-cal b { font-size: 15px; }
          .si-dock { flex-wrap: wrap; justify-content: center; width: max-content; border-radius: 22px; row-gap: 2px; }
          .si-sep2 { display: none; }
          .si-root .seg { padding: 0 12px; }
          .si-sun { right: 4%; top: 8%; width: 50vw; }
        }
      `}</style>
    </div>
  )
}
