import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { usePrecompiled } from '../stylize/precompile'
import {
  BILL_VERT,
  EMBER_PULSE,
  FIRE_FRAG,
  GLOW_FRAG,
  POST_FRAG,
  POST_VERT,
  SKY_FRAG,
  SKY_VERT,
  SMOKE_FRAG,
  SPARK_FRAG,
  SPARK_VERT,
} from './campfireShaders'
import { makeAsh, makeBark, makeCaps, makeFabric, makeGround } from './campfireTex'

/*
 * 篝火 — a small lit R3F scene rendered into an MSAA half-float target, then composited: screen-space heat
 * haze refracts the target above the flames, the target's own mip chain gives a cheap bloom, ACES + sRGB.
 * The fire is a camera-facing noise shader (tongues + advected turbulence → temperature ramp); sparks are
 * stateless GPU particles (position is a function of time and a seed); one flickering point light with
 * shadows does all the warm lighting. Motion drives level / wind / flare / thrown logs; useFrame reads them.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const TARGET = new THREE.Vector3(0, 0.62, 0)
const BASE_AZ = 0.38
const BASE_EL = 0.2
const FIRE_W = 1.7
const FIRE_H = 2.7
const SMOKE_W = 2.6
const SMOKE_H = 4.2
const SMOKE_Y = 0.85
const N_SPARK = 320
const N_BURST = 200
const N_PINE = 70

type Lvl = { zh: string; en: string; height: number; width: number; light: number; rate: number; int: number; smoke: number; ember: number }
const LEVELS: Lvl[] = [
  { zh: '小火', en: 'Embers', height: 0.5, width: 0.78, light: 3.2, rate: 0.22, int: 0.85, smoke: 0.75, ember: 1.25 },
  { zh: '中火', en: 'Steady', height: 1.0, width: 1.05, light: 6, rate: 0.5, int: 1, smoke: 1, ember: 1 },
  { zh: '旺火', en: 'Roaring', height: 1.38, width: 1.24, light: 10, rate: 1, int: 1.15, smoke: 1.3, ember: 1.1 },
]
const LKEYS = ['height', 'width', 'light', 'rate', 'int', 'smoke', 'ember'] as const

type Live = Record<(typeof LKEYS)[number], number> & {
  lean: number
  flare: number
  burstT: number
  burstAmt: number
  time: number
}

type Tex = ReturnType<typeof buildTextures>
function buildTextures(parts: Partial<{ bark: ReturnType<typeof makeBark>; caps: ReturnType<typeof makeCaps>; ground: THREE.Texture; ash: ReturnType<typeof makeAsh>; fabric: THREE.Texture }>) {
  return parts as Required<typeof parts>
}

/* ------------------------------------------------------------------ geometry helpers */

function makeStone(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 1)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const h = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = Math.round(v.x * 100) * 7 + Math.round(v.y * 100) * 13 + Math.round(v.z * 100) * 17
    v.multiplyScalar(0.82 + 0.3 * h(k))
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

function makePine() {
  const parts: THREE.BufferGeometry[] = []
  const trunk = new THREE.CylinderGeometry(0.07, 0.1, 0.8, 6)
  trunk.translate(0, 0.4, 0)
  parts.push(trunk)
  const tiers: [number, number, number][] = [
    [0.95, 1.5, 0.65],
    [0.75, 1.3, 1.35],
    [0.55, 1.1, 1.95],
    [0.33, 0.9, 2.5],
  ]
  for (const [r, hh, y] of tiers) {
    const c = new THREE.ConeGeometry(r, hh, 7)
    c.translate(0, y + hh / 2 - 0.2, 0)
    parts.push(c)
  }
  const g = mergeGeometries(parts.map((x) => x.toNonIndexed()))!
  g.computeVertexNormals()
  return g
}

function makeTent() {
  const W = 0.78
  const H = 1.08
  const L = 1.7
  const z0 = -L / 2
  const z1 = L / 2
  const tri: number[] = []
  const q = (a: number[], b: number[], c: number[], d: number[]) => tri.push(...a, ...b, ...c, ...a, ...c, ...d)
  const t = (a: number[], b: number[], c: number[]) => tri.push(...a, ...b, ...c)
  q([-W, 0, z0], [-W, 0, z1], [0, H, z1], [0, H, z0])
  q([W, 0, z1], [W, 0, z0], [0, H, z0], [0, H, z1])
  t([-W, 0, z0], [0, H, z0], [W, 0, z0])
  // front: two flaps, the right one tied back so the lit inside shows
  t([-W, 0, z1], [-0.1, 0, z1 + 0.05], [0, H, z1])
  t([W, 0, z1], [0, H, z1], [0.42, 0, z1 + 0.28])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
  // simple planar uvs
  const uv: number[] = []
  for (let i = 0; i < tri.length; i += 3) uv.push(tri[i] * 1.5 + tri[i + 2] * 1.5, tri[i + 1] * 1.5)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  const inner = new THREE.BufferGeometry()
  inner.setAttribute('position', new THREE.Float32BufferAttribute([-W * 0.9, 0.02, z0 + 0.03, 0, H * 0.94, z0 + 0.03, W * 0.9, 0.02, z0 + 0.03], 3))
  inner.computeVertexNormals()
  return { shell: g, inner }
}

function withEmbers(m: THREE.MeshStandardMaterial, u: { uEmberTime: { value: number }; uEmberGain: { value: number } }, key: string) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEmberTime = u.uEmberTime
    sh.uniforms.uEmberGain = u.uEmberGain
    sh.fragmentShader = 'uniform float uEmberTime;\nuniform float uEmberGain;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', EMBER_PULSE)
  }
  m.customProgramCacheKey = () => key
  return m
}

/* ------------------------------------------------------------------ people */

type V3 = [number, number, number]
const UP = new THREE.Vector3(0, 1, 0)

function Limb({ a, b, r, mat }: { a: V3; b: V3; r: number; mat: THREE.Material }) {
  const { pos, quat, len } = useMemo(() => {
    const A = new THREE.Vector3(...a)
    const B = new THREE.Vector3(...b)
    const d = B.clone().sub(A)
    const l = d.length()
    return { pos: A.add(B).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), len: l }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.join(), b.join()])
  return (
    <mesh position={pos} quaternion={quat} material={mat} castShadow receiveShadow>
      <capsuleGeometry args={[r, len, 2, 7]} />
    </mesh>
  )
}

type PersonProps = { at: [number, number]; seat: number; jacket: THREE.Material; pants: THREE.Material; hat: THREE.Material; scarf: THREE.Material; pose: 'stick' | 'mug'; M: Mats }

function Person({ at, seat, jacket, pants, hat, scarf, pose, M }: PersonProps) {
  const rotY = Math.atan2(-at[0], -at[1])
  const y = seat + 0.07
  const arms =
    pose === 'mug' ? (
      <>
        <Limb a={[0.19, y + 0.45, 0.07]} b={[0.21, y + 0.22, 0.23]} r={0.055} mat={jacket} />
        <Limb a={[0.21, y + 0.22, 0.23]} b={[0.06, y + 0.31, 0.36]} r={0.05} mat={jacket} />
        <Limb a={[-0.19, y + 0.45, 0.07]} b={[-0.21, y + 0.22, 0.23]} r={0.055} mat={jacket} />
        <Limb a={[-0.21, y + 0.22, 0.23]} b={[-0.06, y + 0.31, 0.36]} r={0.05} mat={jacket} />
        <mesh position={[0, y + 0.33, 0.4]} material={M.enamel} castShadow>
          <cylinderGeometry args={[0.042, 0.038, 0.1, 12]} />
        </mesh>
        <mesh position={[0, y + 0.378, 0.4]} rotation-x={-Math.PI / 2} material={M.coffee}>
          <circleGeometry args={[0.036, 12]} />
        </mesh>
      </>
    ) : (
      <>
        <Limb a={[-0.19, y + 0.45, 0.07]} b={[-0.22, y + 0.26, 0.28]} r={0.055} mat={jacket} />
        <Limb a={[-0.22, y + 0.26, 0.28]} b={[-0.12, y + 0.32, 0.52]} r={0.05} mat={jacket} />
        <Limb a={[0.19, y + 0.45, 0.07]} b={[0.21, y + 0.22, 0.22]} r={0.055} mat={jacket} />
        <Limb a={[0.21, y + 0.22, 0.22]} b={[0.12, y + 0.1, 0.42]} r={0.05} mat={jacket} />
        <mesh position={[-0.12, y + 0.32, 0.52]} material={M.skin}>
          <icosahedronGeometry args={[0.042, 0]} />
        </mesh>
        <Limb a={[-0.12, y + 0.3, 0.5]} b={[-0.06, y + 0.6, 1.5]} r={0.009} mat={M.stick} />
        <mesh position={[-0.06, y + 0.61, 1.52]} material={M.marsh}>
          <cylinderGeometry args={[0.028, 0.028, 0.05, 8]} />
        </mesh>
      </>
    )
  return (
    <group position={[at[0], 0, at[1]]} rotation-y={rotY}>
      <mesh position={[0, y, 0]} scale={[1, 0.62, 0.95]} material={pants} castShadow>
        <icosahedronGeometry args={[0.17, 1]} />
      </mesh>
      <mesh position={[0, y + 0.27, 0.03]} rotation-x={0.18} material={jacket} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.185, 0.52, 7]} />
      </mesh>
      <mesh position={[0, y + 0.53, 0.08]} rotation-x={Math.PI / 2 + 0.18} material={scarf} castShadow>
        <torusGeometry args={[0.085, 0.038, 6, 10]} />
      </mesh>
      <mesh position={[0, y + 0.68, 0.11]} material={M.skin} castShadow>
        <icosahedronGeometry args={[0.112, 1]} />
      </mesh>
      <mesh position={[0, y + 0.71, 0.1]} rotation-x={-0.25} material={hat} castShadow>
        <sphereGeometry args={[0.122, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
      </mesh>
      <mesh position={[0, y + 0.84, 0.07]} material={hat}>
        <icosahedronGeometry args={[0.034, 0]} />
      </mesh>
      <Limb a={[0.09, y, 0.03]} b={[0.1, y + 0.03, 0.4]} r={0.075} mat={pants} />
      <Limb a={[-0.09, y, 0.03]} b={[-0.1, y + 0.03, 0.4]} r={0.075} mat={pants} />
      <Limb a={[0.1, y + 0.02, 0.42]} b={[0.12, 0.08, 0.5]} r={0.062} mat={pants} />
      <Limb a={[-0.1, y + 0.02, 0.42]} b={[-0.12, 0.08, 0.5]} r={0.062} mat={pants} />
      <mesh position={[0.12, 0.045, 0.55]} material={M.boot} castShadow>
        <boxGeometry args={[0.11, 0.09, 0.22]} />
      </mesh>
      <mesh position={[-0.12, 0.045, 0.55]} material={M.boot} castShadow>
        <boxGeometry args={[0.11, 0.09, 0.22]} />
      </mesh>
      {arms}
    </group>
  )
}

/* ------------------------------------------------------------------ scene */

type Mats = ReturnType<typeof useMats>

function useMats(T: Tex) {
  const M = useMemo(() => {
    const ember = { uEmberTime: { value: 0 }, uEmberGain: { value: 1 } }
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true, ...p })
    const bark = withEmbers(new THREE.MeshStandardMaterial({ map: T.bark.map, emissiveMap: T.bark.emissive, emissive: new THREE.Color('#ff6a1c'), emissiveIntensity: 3, roughness: 0.95 }), ember, 'cf-bark')
    const emberCap = withEmbers(new THREE.MeshStandardMaterial({ map: T.caps.ember, emissiveMap: T.caps.ember, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 3.2, roughness: 1 }), ember, 'cf-cap')
    const woodCap = new THREE.MeshStandardMaterial({ map: T.caps.wood, roughness: 0.9 })
    const plainBark = new THREE.MeshStandardMaterial({ map: T.bark.map, color: '#b9a493', roughness: 0.95 })
    plainBark.map = T.bark.map
    const ash = withEmbers(new THREE.MeshStandardMaterial({ map: T.ash.map, emissiveMap: T.ash.emissive, emissive: new THREE.Color('#ff5a14'), emissiveIntensity: 2.4, transparent: true, depthWrite: false, roughness: 1 }), ember, 'cf-ash')
    return {
      ember,
      bark,
      emberCap,
      woodCap,
      plainBark,
      ash,
      ground: new THREE.MeshStandardMaterial({ map: T.ground, roughness: 1, color: '#d8ccc0' }),
      stone: std({ color: '#77716b', roughness: 0.85 }),
      stoneDark: std({ color: '#55504b', roughness: 0.9 }),
      skin: std({ color: '#d9a07a', roughness: 0.75 }),
      boot: std({ color: '#2a211c' }),
      stick: std({ color: '#7a5a3a' }),
      marsh: new THREE.MeshStandardMaterial({ color: '#f4eadb', emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 0.25, roughness: 0.7 }),
      enamel: std({ color: '#e9e6df', roughness: 0.35, flatShading: false }),
      enamelRim: std({ color: '#1f3550', roughness: 0.4 }),
      coffee: std({ color: '#2a170c', roughness: 0.2 }),
      jacketA: std({ color: '#c4432c' }),
      pantsA: std({ color: '#2b3240' }),
      hatA: std({ color: '#e2b23b' }),
      scarfA: std({ color: '#2d7276' }),
      jacketB: std({ color: '#3b6e8f' }),
      pantsB: std({ color: '#3d322b' }),
      hatB: std({ color: '#ddd5c6' }),
      scarfB: std({ color: '#b9442e' }),
      fabric: new THREE.MeshStandardMaterial({ map: T.fabric, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }),
      tentGlow: new THREE.MeshStandardMaterial({ color: '#2a1408', emissive: new THREE.Color('#ffae5a'), emissiveIntensity: 0.4, side: THREE.DoubleSide }),
      pine: new THREE.MeshStandardMaterial({ color: '#0d1712', roughness: 1, flatShading: true }),
      lantern: new THREE.MeshStandardMaterial({ color: '#000', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 4 }),
    }
  }, [T])
  useEffect(() => () => Object.values(M).forEach((m) => m instanceof THREE.Material && m.dispose()), [M])
  return M
}

type Toss = { mesh: THREE.Mesh | null; active: boolean; k: number; burn: number; from: THREE.Vector3; to: THREE.Vector3; q0: THREE.Quaternion; q1: THREE.Quaternion; spin: number; anims: { stop: () => void }[] }

function Camp({ T, live, yaw, pitch, tossRef, onReady }: { T: Tex; live: React.RefObject<Live>; yaw: MotionValue<number>; pitch: MotionValue<number>; tossRef: React.RefObject<(() => void) | null>; onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const M = useMats(T)

  /* ---- static geometry */
  const G = useMemo(() => {
    const log = new THREE.CylinderGeometry(0.072, 0.08, 0.86, 10, 1)
    const toss = new THREE.CylinderGeometry(0.07, 0.074, 0.72, 10, 1)
    const stones = [makeStone(1), makeStone(2), makeStone(3)]
    const pine = makePine()
    const tent = makeTent()
    const bench = new THREE.CylinderGeometry(0.15, 0.16, 1.5, 10, 1)
    const stump = new THREE.CylinderGeometry(0.2, 0.23, 0.42, 10, 1)
    const fire = new THREE.PlaneGeometry(FIRE_W, FIRE_H).translate(0, FIRE_H / 2, 0)
    const smoke = new THREE.PlaneGeometry(SMOKE_W, SMOKE_H).translate(0, SMOKE_H / 2, 0)
    const glow = new THREE.PlaneGeometry(2.6, 2.6)
    // sparks: one seed per particle, positions live entirely in the vertex shader
    const sparkGeo = (n: number, salt: number) => {
      const g = new THREE.BufferGeometry()
      const seeds = new Float32Array(n * 4)
      let s = salt
      const r = () => {
        s = (s * 16807) % 2147483647
        return s / 2147483647
      }
      for (let i = 0; i < n * 4; i++) seeds[i] = r()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 6)
      return g
    }
    return { log, toss, stones, pine, tent, bench, stump, fire, smoke, glow, sparks: sparkGeo(N_SPARK, 12345), burst: sparkGeo(N_BURST, 777) }
  }, [])
  useEffect(
    () => () => {
      for (const v of Object.values(G)) {
        if (Array.isArray(v)) v.forEach((g) => g.dispose())
        else if (v instanceof THREE.BufferGeometry) v.dispose()
        else Object.values(v).forEach((g) => (g as THREE.BufferGeometry).dispose())
      }
    },
    [G],
  )

  /* ---- shader materials */
  const S = useMemo(() => {
    const fireU = { uSize: { value: new THREE.Vector2(FIRE_W, FIRE_H) }, uTime: { value: 0 }, uHeight: { value: 1 }, uWidth: { value: 1 }, uLean: { value: 0 }, uFlare: { value: 0 }, uInt: { value: 1 } }
    const fire = new THREE.ShaderMaterial({ vertexShader: BILL_VERT, fragmentShader: FIRE_FRAG, uniforms: fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const glowU = { uInt: { value: 1 } }
    const glow = new THREE.ShaderMaterial({ vertexShader: BILL_VERT, fragmentShader: GLOW_FRAG, uniforms: glowU, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })
    const smokeU = { uSize: { value: new THREE.Vector2(SMOKE_W, SMOKE_H) }, uTime: { value: 0 }, uLean: { value: 0 }, uAmt: { value: 1 }, uBase: { value: SMOKE_Y } }
    const smoke = new THREE.ShaderMaterial({ vertexShader: BILL_VERT, fragmentShader: SMOKE_FRAG, uniforms: smokeU, transparent: true, depthWrite: false })
    const sparkU = (mode: number) => ({
      uTime: { value: 0 },
      uRate: { value: 0.5 },
      uLean: { value: 0 },
      uBurstT: { value: -100 },
      uBurstAmt: { value: 1 },
      uMode: { value: mode },
      uPx: { value: 800 },
      uLift: { value: 1 },
      uInt: { value: 1 },
    })
    const spark = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: sparkU(0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const burst = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: sparkU(1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    const skyU = { uTime: { value: 0 }, uPix: { value: 0.002 } }
    const sky = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false })
    return { fire, glow, smoke, spark, burst, sky }
  }, [])
  useEffect(() => () => Object.values(S).forEach((m) => m.dispose()), [S])

  /* ---- composite pass */
  const P = useMemo(() => {
    const fbo = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
    const uniforms = {
      tScene: { value: fbo.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uFireA: { value: new THREE.Vector2(0.5, 0.4) },
      uFireB: { value: new THREE.Vector2(0.5, 0.6) },
      uHazeW: { value: 0.1 },
      uHaze: { value: 1 },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uExposure: { value: 1.05 },
      uBloom: { value: 0.32 },
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, uniforms, depthTest: false, depthWrite: false })
    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false
    const post = new THREE.Scene()
    post.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return { fbo, uniforms, mat, geo, post, cam, buf: new THREE.Vector2() }
  }, [])
  useEffect(
    () => () => {
      P.fbo.dispose()
      P.mat.dispose()
      P.geo.dispose()
    },
    [P],
  )

  const root = useRef<THREE.Group>(null)
  const sceneReady = usePrecompiled(root)
  const postReady = useRef(false)
  useEffect(() => {
    let alive = true
    const t = gl.getRenderTarget()
    gl.setRenderTarget(null)
    gl.compileAsync(P.post, P.cam)
      .catch(() => {})
      .then(() => {
        if (alive) postReady.current = true
      })
    gl.setRenderTarget(t)
    return () => {
      alive = false
    }
  }, [gl, P])
  const readyOnce = useRef(false)

  /* ---- layout of the static props */
  const logs = useMemo(() => {
    const out: { p: THREE.Vector3; q: THREE.Quaternion }[] = []
    for (let i = 0; i < 5; i++) {
      const th = (i / 5) * Math.PI * 2 + 0.4 + Math.sin(i * 3.1) * 0.15
      const tilt = 0.2 + (i % 2) * 0.12
      const d = new THREE.Vector3(-Math.cos(th) * Math.cos(tilt), Math.sin(tilt), -Math.sin(th) * Math.cos(tilt))
      const p = new THREE.Vector3(Math.cos(th) * 0.32, 0.1 + (i % 2) * 0.05, Math.sin(th) * 0.32)
      out.push({ p, q: new THREE.Quaternion().setFromUnitVectors(UP, d) })
    }
    return out
  }, [])
  const stones = useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2 + Math.sin(i * 7.7) * 0.08
        const r = 0.7 + Math.sin(i * 3.3) * 0.04
        const s = 0.12 + ((i * 37) % 7) * 0.008
        return { p: [Math.cos(a) * r, s * 0.45, Math.sin(a) * r] as V3, s: [s * 1.1, s * 0.75, s * 0.95] as V3, ry: a * 1.7 + i, g: i % 3 }
      }),
    [],
  )
  // treeline transforms, applied whenever the instanced mesh is (re)attached
  const pineMats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    const p = new THREE.Vector3()
    let s = 99
    const r = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
    while (out.length < N_PINE) {
      const a = r() * Math.PI * 2
      // keep the sector behind the camera open
      const da = Math.atan2(Math.sin(a - BASE_AZ), Math.cos(a - BASE_AZ))
      if (Math.abs(da) < 1.35) continue
      // a jagged treeline far away, a few big trunks closer in to frame the clearing
      const near = out.length < 6
      const rad = near ? 7 + r() * 3 : 15 + r() * 9
      p.set(Math.sin(a) * rad, 0, Math.cos(a) * rad)
      const k = near ? 1.6 + r() * 0.6 : 1.0 + r() * 0.9
      sc.set(k * (0.85 + r() * 0.3), k, k * (0.85 + r() * 0.3))
      q.setFromAxisAngle(UP, r() * 6.28)
      out.push(new THREE.Matrix4().compose(p, q, sc))
    }
    return out
  }, [])
  const setPines = (im: THREE.InstancedMesh | null) => {
    if (!im) return
    pineMats.forEach((m, i) => im.setMatrixAt(i, m))
    im.instanceMatrix.needsUpdate = true
  }

  /* ---- thrown logs */
  const tosses = useRef<Toss[]>(
    Array.from({ length: 3 }, () => ({ mesh: null, active: false, k: 0, burn: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), spin: 0, anims: [] })),
  )
  const flareAnim = useRef<{ stop: () => void } | null>(null)
  useEffect(() => {
    const list = tosses.current
    tossRef.current = () => {
      const L = live.current
      // reuse the free (or the most burnt-down) log
      let tt = list.find((x) => !x.active)
      if (!tt) tt = list.reduce((a, b) => (b.burn > a.burn ? b : a))
      tt.anims.forEach((a) => a.stop())
      const fwd = new THREE.Vector3()
      camera.getWorldDirection(fwd)
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize()
      tt.from.copy(camera.position).addScaledVector(fwd, 1.1).addScaledVector(right, 0.55).addScaledVector(UP, -0.65)
      const a = Math.random() * Math.PI * 2
      tt.to.set(Math.cos(a) * 0.08, 0.3, Math.sin(a) * 0.08)
      tt.q0.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0.4))
      tt.q1.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, Math.PI / 2 + (Math.random() - 0.5) * 0.3, 'YXZ'))
      tt.spin = (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3)
      tt.active = true
      tt.k = 0
      tt.burn = 0
      const t = tt
      const fly = animate(0, 1, {
        duration: 0.8,
        ease: [0.35, 0, 0.65, 1],
        onUpdate: (v) => (t.k = v),
        onComplete: () => {
          // catch: the fire flares, a fountain of sparks, then the log slowly burns down
          L.burstT = L.time
          L.burstAmt = 1
          flareAnim.current?.stop()
          const f0 = L.flare
          flareAnim.current = animate(0, 1, {
            duration: 5,
            ease: 'linear',
            onUpdate: (k) => {
              const up = Math.min(1, k / 0.06)
              L.flare = f0 * (1 - up) + up * Math.pow(1 - k, 1.8)
            },
          })
          const burn = animate(0, 1, { duration: 14, ease: [0.3, 0, 0.7, 1], onUpdate: (v) => (t.burn = v), onComplete: () => (t.active = false) })
          t.anims.push(burn)
        },
      })
      tt.anims = [fly]
    }
    return () => {
      tossRef.current = null
      list.forEach((x) => x.anims.forEach((a) => a.stop()))
      flareAnim.current?.stop()
    }
  }, [camera, live, tossRef])

  /* ---- refs for per-frame updates */
  const fireLight = useRef<THREE.PointLight>(null)
  const fireMesh = useRef<THREE.Mesh>(null)
  const glowMesh = useRef<THREE.Mesh>(null)
  const smokeMesh = useRef<THREE.Mesh>(null)
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), w: new THREE.Vector3(), key: '', fade: 0, sway: 0, popAt: 3 + Math.random() * 3 }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const L = live.current
    L.time += dt
    const t = L.time + (POSTER ? 30 : 0)
    tmp.sway += dt

    /* ambient crackle: small spontaneous bursts of sparks */
    if (!POSTER && L.time > tmp.popAt) {
      tmp.popAt = L.time + 2.5 + Math.random() * 4
      if (L.time - L.burstT > 3) {
        L.burstT = L.time
        L.burstAmt = 0.18 + Math.random() * 0.15 * L.rate
      }
    }

    /* ---- camera: orbit + layout (fire right of the copy on desktop, high on phones, centred poster) */
    const mobile = size.width < 760
    const portrait = size.width < size.height
    const fov = portrait ? 56 : 42
    const rad = POSTER ? 4.6 : portrait ? 7.2 : 4.9
    const az = BASE_AZ + yaw.get() + (POSTER ? 0 : Math.sin(tmp.sway * 0.11) * 0.04)
    const el = BASE_EL + pitch.get() + (portrait ? 0.04 : 0)
    camera.position.set(TARGET.x + Math.sin(az) * Math.cos(el) * rad, TARGET.y + Math.sin(el) * rad, TARGET.z + Math.cos(az) * Math.cos(el) * rad)
    camera.lookAt(TARGET)
    const ox = POSTER || mobile ? 0 : -0.17 * size.width
    const oy = POSTER ? 0.02 * size.height : mobile ? 0.11 * size.height : 0.02 * size.height
    const key = `${size.width}x${size.height}:${fov}:${ox}:${oy}`
    if (tmp.key !== key) {
      tmp.key = key
      camera.fov = fov
      camera.far = 120
      camera.setViewOffset(size.width, size.height, ox, oy, size.width, size.height)
      camera.updateProjectionMatrix()
    }

    /* ---- fire parameters */
    const flare = L.flare
    const h = L.height
    const flick = 1 + 0.09 * Math.sin(t * 11.7) + 0.06 * Math.sin(t * 17.3 + 1.3) + 0.08 * Math.sin(t * 5.1 + 0.4) * Math.sin(t * 2.3)
    const fu = (S.fire.uniforms as Record<string, THREE.IUniform>)
    fu.uTime.value = t
    fu.uHeight.value = h
    fu.uWidth.value = L.width * (1 + 0.15 * flare)
    fu.uLean.value = L.lean
    fu.uFlare.value = flare
    fu.uInt.value = L.int * (1 + 0.35 * flare)
    ;(S.glow.uniforms.uInt as THREE.IUniform).value = L.int * flick * (0.55 + 0.4 * h) * (1 + 0.8 * flare)
    const su = S.smoke.uniforms as Record<string, THREE.IUniform>
    su.uTime.value = t
    su.uLean.value = L.lean
    su.uAmt.value = L.smoke * (1 + 0.6 * flare)
    gl.getDrawingBufferSize(P.buf)
    const pxPerM = (P.buf.y * camera.projectionMatrix.elements[5]) / 2
    for (const m of [S.spark, S.burst]) {
      const u = m.uniforms as Record<string, THREE.IUniform>
      u.uTime.value = t
      u.uRate.value = L.rate
      u.uLean.value = L.lean
      u.uBurstT.value = L.burstT + (POSTER ? 30 : 0)
      u.uBurstAmt.value = L.burstAmt
      u.uPx.value = pxPerM
      u.uLift.value = 0.75 + 0.35 * h + 0.3 * flare
      u.uInt.value = 0.8 + 0.3 * h
    }
    ;(S.sky.uniforms.uTime as THREE.IUniform).value = t
    ;(S.sky.uniforms.uPix as THREE.IUniform).value = 2 / (P.buf.y * camera.projectionMatrix.elements[5])
    M.ember.uEmberTime.value = t
    M.ember.uEmberGain.value = L.ember * (0.8 + 0.25 * flick) * (1 + 0.5 * flare)

    /* billboards face the camera around Y; the flame plane sits a little in front of the logs */
    tmp.v.set(camera.position.x, 0, camera.position.z).normalize()
    const yawB = Math.atan2(tmp.v.x, tmp.v.z)
    if (fireMesh.current) {
      fireMesh.current.position.set(tmp.v.x * 0.3, 0.08, tmp.v.z * 0.3)
      fireMesh.current.rotation.set(0, yawB, 0)
    }
    if (smokeMesh.current) {
      smokeMesh.current.position.set(-tmp.v.x * 0.2, SMOKE_Y, -tmp.v.z * 0.2)
      smokeMesh.current.rotation.set(0, yawB, 0)
    }
    if (glowMesh.current) {
      glowMesh.current.position.set(tmp.v.x * 0.5, 0.35 + 0.3 * h, tmp.v.z * 0.5)
      glowMesh.current.quaternion.copy(camera.quaternion)
      glowMesh.current.scale.setScalar(0.8 + 0.5 * h + 0.3 * flare)
    }

    /* the light: flickers, breathes with the fire's size and wanders a few cm (shadows dance) */
    const fl = fireLight.current
    if (fl) {
      fl.intensity = L.light * flick * (1 + 0.9 * flare)
      fl.position.set(Math.sin(t * 3.7) * 0.04 + L.lean * 0.15, 0.5 + 0.18 * h + Math.sin(t * 5.3) * 0.03, Math.cos(t * 4.1) * 0.04)
    }

    /* thrown logs */
    for (const tt of tosses.current) {
      const m = tt.mesh
      if (!m) continue
      m.visible = tt.active
      if (!tt.active) continue
      const k = tt.k
      m.position.lerpVectors(tt.from, tt.to, k)
      m.position.y += Math.sin(Math.PI * k) * 0.85 - tt.burn * 0.14
      m.quaternion.slerpQuaternions(tt.q0, tt.q1, Math.min(1, k * 1.15))
      if (k < 1) m.rotateY(tt.spin * (1 - k) * 0.4)
      const sc = 1 - tt.burn * 0.65
      m.scale.set(sc, Math.max(0.05, 1 - tt.burn * 0.45), sc)
    }

    /* heat haze anchors in screen uv */
    tmp.w.set(0, 0.25, 0).project(camera)
    P.uniforms.uFireA.value.set(tmp.w.x * 0.5 + 0.5, tmp.w.y * 0.5 + 0.5)
    tmp.w.set(L.lean * 0.35 * h, 0.25 + h * (1.05 + 0.45 * flare), 0).project(camera)
    P.uniforms.uFireB.value.set(tmp.w.x * 0.5 + 0.5, tmp.w.y * 0.5 + 0.5)
    P.uniforms.uHazeW.value = Math.max(0.03, (P.uniforms.uFireB.value.y - P.uniforms.uFireA.value.y) * 0.32 * L.width)
    P.uniforms.uHaze.value = 0.6 + 0.5 * h + 0.6 * flare
    P.uniforms.uTime.value = t
    P.uniforms.uRes.value.copy(P.buf)

    /* ---- render */
    const ready = sceneReady && postReady.current
    if (!ready) {
      gl.setRenderTarget(null)
      gl.setClearColor(0x000000, 0)
      gl.clear(true, true, false)
      return
    }
    if (!readyOnce.current) {
      readyOnce.current = true
      onReady()
    }
    tmp.fade = POSTER ? 1 : Math.min(1, tmp.fade + dt / 0.8)
    P.uniforms.uFade.value = tmp.fade
    if (P.fbo.width !== P.buf.x || P.fbo.height !== P.buf.y) P.fbo.setSize(P.buf.x, P.buf.y)
    gl.setRenderTarget(P.fbo)
    gl.setClearColor(0x000000, 1)
    gl.clear(true, true, false)
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    gl.render(P.post, P.cam)
  }, 1)

  return (
    <>
      <hemisphereLight args={['#33467a', '#120c09', 0.9]} />
      <directionalLight position={[-6, 9, -7]} intensity={0.6} color="#8aa2e6" />
      <pointLight
        ref={fireLight}
        color="#ff8a3c"
        intensity={6}
        distance={0}
        decay={2}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-bias={-0.004}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
      />
      <fog attach="fog" args={['#030409', 6, 30]} />

      <group ref={root}>
        <mesh material={S.sky} renderOrder={-10} frustumCulled={false}>
          <sphereGeometry args={[60, 32, 16]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} material={M.ground} receiveShadow>
          <circleGeometry args={[30, 48]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={M.ash} renderOrder={0}>
          <circleGeometry args={[0.62, 32]} />
        </mesh>

        {/* fire logs: inner ends charred and cracked, embers pulse inside the cracks */}
        {logs.map((l, i) => (
          <mesh key={i} geometry={G.log} position={l.p} quaternion={l.q} material={[M.bark, M.emberCap, M.woodCap]} receiveShadow />
        ))}
        {stones.map((s, i) => (
          <mesh key={i} geometry={G.stones[s.g]} position={s.p} scale={s.s} rotation-y={s.ry} material={i % 4 === 0 ? M.stoneDark : M.stone} castShadow receiveShadow />
        ))}

        {/* people, bench, stump */}
        <mesh geometry={G.bench} position={[-1.62, 0.15, 0.28]} rotation={[0, Math.atan2(-1.62, 0.28) + Math.PI / 2, Math.PI / 2]} material={[M.plainBark, M.woodCap, M.woodCap]} castShadow receiveShadow />
        <Person at={[-1.62, 0.28]} seat={0.3} jacket={M.jacketA} pants={M.pantsA} hat={M.hatA} scarf={M.scarfA} pose="stick" M={M} />
        <mesh geometry={G.stump} position={[1.25, 0.21, -1.32]} material={[M.plainBark, M.woodCap, M.woodCap]} castShadow receiveShadow />
        <Person at={[1.25, -1.32]} seat={0.42} jacket={M.jacketB} pants={M.pantsB} hat={M.hatB} scarf={M.scarfB} pose="mug" M={M} />

        {/* mugs on a flat stone */}
        <group position={[1.05, 0, 0.92]}>
          <mesh geometry={G.stones[1]} scale={[0.28, 0.09, 0.22]} position-y={0.05} material={M.stone} castShadow receiveShadow />
          {[
            [-0.07, 0.02],
            [0.09, -0.05],
          ].map(([x, z], i) => (
            <group key={i} position={[x, 0.17, z]} rotation-y={i * 2.2 + 0.6}>
              <mesh material={M.enamel} castShadow>
                <cylinderGeometry args={[0.042, 0.038, 0.1, 14]} />
              </mesh>
              <mesh position-y={0.048} material={M.enamelRim}>
                <torusGeometry args={[0.042, 0.004, 4, 16]} />
              </mesh>
              <mesh position={[0.05, 0, 0]} rotation-x={Math.PI / 2} material={M.enamel}>
                <torusGeometry args={[0.024, 0.006, 5, 10, Math.PI * 1.2]} />
              </mesh>
            </group>
          ))}
        </group>

        {/* tent, lit from inside by a lantern */}
        <group position={[-0.95, 0, -3.4]} rotation-y={Math.atan2(0.95, 3.4) + 0.25}>
          <mesh geometry={G.tent.shell} material={M.fabric} castShadow receiveShadow />
          <mesh geometry={G.tent.inner} material={M.tentGlow} />
          <mesh position={[0.15, 0.12, -0.3]} material={M.lantern}>
            <boxGeometry args={[0.07, 0.11, 0.07]} />
          </mesh>
        </group>

        {/* treeline */}
        <instancedMesh ref={setPines} args={[G.pine, M.pine, N_PINE]} frustumCulled={false} />

        {/* thrown logs (pool) */}
        {tosses.current.map((tt, i) => (
          <mesh
            key={i}
            ref={(m) => {
              tt.mesh = m
            }}
            geometry={G.toss}
            material={[M.bark, M.emberCap, M.woodCap]}
            visible={false}
          />
        ))}

        {/* the fire itself */}
        <mesh ref={smokeMesh} geometry={G.smoke} material={S.smoke} renderOrder={1} frustumCulled={false} />
        <mesh ref={glowMesh} geometry={G.glow} material={S.glow} renderOrder={2} frustumCulled={false} />
        <mesh ref={fireMesh} geometry={G.fire} material={S.fire} renderOrder={3} frustumCulled={false} />
        <points geometry={G.sparks} material={S.spark} renderOrder={4} frustumCulled={false} />
        <points geometry={G.burst} material={S.burst} renderOrder={4} frustumCulled={false} />
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Campfire() {
  const [lvl, setLvl] = useState(1)
  const [wind, setWind] = useState(false)
  const [dpr, setDpr] = useState(() => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MOBILE ? 1.5 : 1.75))
  const [tex, setTex] = useState<Tex | null>(null)
  const [shown, setShown] = useState(false)
  const tossRef = useRef<(() => void) | null>(null)

  const live = useRef<Live>({ ...pick(LEVELS[1]), lean: 0, flare: POSTER ? 0.35 : 0, burstT: POSTER ? -0.6 : -100, burstAmt: 1, time: 0 })

  // procedural textures: one per animation frame, so mounting the page never blocks for long
  useEffect(() => {
    let id = 0
    const parts: Parameters<typeof buildTextures>[0] = {}
    const steps = [() => (parts.bark = makeBark()), () => (parts.caps = makeCaps()), () => (parts.ground = makeGround()), () => (parts.ash = makeAsh()), () => (parts.fabric = makeFabric())]
    let i = 0
    const tick = () => {
      steps[i++]()
      if (i < steps.length) id = requestAnimationFrame(tick)
      else setTex(buildTextures(parts))
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  useEffect(
    () => () => {
      if (!tex) return
      ;[tex.bark.map, tex.bark.emissive, tex.caps.ember, tex.caps.wood, tex.ground, tex.ash.map, tex.ash.emissive, tex.fabric].forEach((t) => t.dispose())
    },
    [tex],
  )
  useEffect(() => {
    if (!tex) return
    tex.ground.repeat.set(16, 16)
  }, [tex])

  // fire level: everything eases from what is burning now
  useEffect(() => {
    const from = pick(live.current)
    const to = pick(LEVELS[lvl])
    const c = animate(0, 1, {
      duration: 1.8,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        for (const key of LKEYS) live.current[key] = from[key] + (to[key] - from[key]) * k
      },
    })
    return () => c.stop()
  }, [lvl])

  // wind: flames, sparks and smoke lean over with a gusty spring
  useEffect(() => {
    const c = animate(live.current.lean, wind ? 0.5 : 0, { type: 'spring', stiffness: 30, damping: 9, onUpdate: (v) => (live.current.lean = v) })
    return () => c.stop()
  }, [wind])
  useEffect(() => {
    if (!wind) return
    // gusts on top of the steady lean
    let id = 0
    const gust = () => {
      animate(live.current.lean, 0.5 + (Math.random() - 0.3) * 0.3, { type: 'spring', stiffness: 26, damping: 7, onUpdate: (v) => (live.current.lean = v) })
      id = window.setTimeout(gust, 1400 + Math.random() * 2200)
    }
    id = window.setTimeout(gust, 1800)
    return () => window.clearTimeout(id)
  }, [wind])

  // drag to orbit a little (springs give it weight); a click without a drag tosses a log
  const yaw = useSpring(0, { stiffness: 70, damping: 18, mass: 1 })
  const pitch = useSpring(0, { stiffness: 70, damping: 18, mass: 1 })
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean; id: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .btn, .demo-chrome')) return
    drag.current = { x: e.clientX, y: e.clientY, yaw: yaw.get(), pitch: pitch.get(), moved: false, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true
    if (d.moved) {
      yaw.set(THREE.MathUtils.clamp(d.yaw - dx * 0.0045, -0.75, 0.75))
      pitch.set(THREE.MathUtils.clamp(d.pitch + dy * 0.0025, -0.14, 0.22))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (!d.moved) tossRef.current?.()
  }

  const L = LEVELS[lvl]

  return (
    <div className="stage cf" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)}>
      <style>{css}</style>
      <Canvas
        shadows="percentage"
        dpr={dpr}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 42, near: 0.1, far: 120, position: [2, 2, 4.5] }}
      >
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.75, d * 0.8))} flipflops={3} />
        {tex && <Camp T={tex} live={live} yaw={yaw} pitch={pitch} tossRef={tossRef} onReady={() => setShown(true)} />}
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy cf-copy soft-text"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.25, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i className="cf-dot" /> Procedural fire ·{' '}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={L.en}
                className="cf-lv"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
              >
                {L.en}
              </motion.span>
            </AnimatePresence>
          </p>
          <h1>
            围炉，
            <br />
            是最古老的界面
          </h1>
          <p className="cf-lede">火焰是一张按温度上色的噪声着色器，火星是 GPU 粒子，热浪在后期里扭曲身后的夜色；一盏会闪的点光源，照亮每张围坐的脸。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => tossRef.current?.()} disabled={!shown}>
              添一根柴
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg items={LEVELS.map((l, i) => ({ value: i, label: l.zh }))} value={lvl} onChange={setLvl} />
          <span className="dock-sep" />
          <button className="seg cf-tog" aria-pressed={wind} onClick={() => setWind((v) => !v)}>
            <span>
              <i />风
            </span>
          </button>
        </div>
        <p className="hint">
          点击场景 · 添柴
          <br />
          拖动 · 绕火转一点
        </p>
      </div>
    </div>
  )
}

function pick(o: Pick<Lvl, (typeof LKEYS)[number]>) {
  return { height: o.height, width: o.width, light: o.light, rate: o.rate, int: o.int, smoke: o.smoke, ember: o.ember }
}

const css = `
.cf { background: radial-gradient(90% 70% at 66% 60%, #2a1308 0%, #0f0805 45%, #050304 100%); cursor: grab; touch-action: none; }
.cf:active { cursor: grabbing; }
.cf-copy { --soft-bg: #070404; }
.cf-copy h1 { font-size: clamp(34px, 4.2vw, 58px); }
.cf-dot { background: #ff8a2a !important; box-shadow: 0 0 10px #ff8a2a; }
.cf-lv { display: inline-block; }
.cf-lede { max-width: 400px; font-size: 15px !important; }
.cf .btn.primary { background: #ffb36b; color: #2a1406; }
.cf .btn.primary:disabled { opacity: .5; }
.cf-tog span { display: inline-flex; align-items: center; gap: 7px; }
.cf-tog i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px currentColor; transition: background .25s, box-shadow .25s; }
.cf-tog[aria-pressed='true'] i { background: #ffc58a; box-shadow: 0 0 8px #ff8a2a; }
@media (max-width: 760px) {
  .cf-copy h1 { font-size: 30px; }
  .cf-lede { display: none; }
  .cf .hero-actions { margin-top: 16px; }
}
`
