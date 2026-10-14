import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { createXrayEffect, setXrayDose, setXrayLens, setXrayMode, xrayMeta, xrayModes, xrayPaint, xrayScanY, type XrayMode } from './effects/xray'

/*
 * X 光 showcase — a hand built from primitives: white "bone" capsules (painted with the effect's density
 * convention, brighter at grazing angles like cortical bone) inside translucent "flesh" capsules that only blend
 * their front surface (depth pre-pass). The effect sees the flesh in the normal buffer (silhouette + rims) and
 * the bones through it in the colour buffer. The fingers flex in a slow wave; a watch and a ring are metal.
 * In 安检机 mode the hand slides away and bags ride a conveyor through the scanner: a suitcase and a backpack
 * whose contents are painted organic / mixed / metal.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const FLESH_A = 0.45
const SHELL_A = 0.35
const DOSES = [
  { zh: '低', k: 0.7, kv: 46, ma: 2.5, s: 0.12 },
  { zh: '中', k: 1, kv: 55, ma: 4, s: 0.08 },
  { zh: '高', k: 1.45, kv: 68, ma: 8, s: 0.05 },
]
const NOTE: Record<XrayMode, string> = {
  film: '越厚越白 · 边缘增强 · 灯箱背光不均',
  ct: '伪彩查找表 · 切片带扫过 · 实时密度曲线',
  scan: '橙＝有机物 · 绿＝混合 · 蓝＝金属，越厚越深',
}
const SHORT: Record<XrayMode, string> = { film: '胶片', ct: 'CT', scan: '安检' }

/* ------------------------------------------------------------------ materials */

/** bone / metal: unlit over-bright grey, brighter toward the silhouette (a hollow cortex reads as a bright rim) */
function boneMat(d: number, shell: number) {
  return new THREE.ShaderMaterial({
    // the effect reads density from (L − 1.15) / 1.6 after the shell's alpha → paint L = (1.15 + 1.6·d) / (1 − α)
    uniforms: { uA: { value: 1.15 / (1 - shell) }, uB: { value: (1.6 * d) / (1 - shell) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uA; uniform float uB; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vn(vec3 p) {
        vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float rim = 1.0 - f;
        // cortex: dense shell → bright toward the silhouette; marrow: spongy (trabecular) texture inside
        float trab = 0.8 + 0.4 * vn(vP * 26.0) * vn(vP * 9.0 + 3.0);
        gl_FragColor = vec4(vec3(uA + uB * (0.55 * trab + 1.1 * pow(rim, 1.5))), 1.0);
      }`,
  })
}
const paintMat = (d: number, shell = SHELL_A) => new THREE.MeshBasicMaterial({ color: xrayPaint(d, shell), toneMapped: false })
/** a solid item: the ray crosses more of it through the middle than at the edges → denser where it faces you */
function solidMat(d: number, shell = SHELL_A) {
  const lo = xrayPaint(d * 0.55, shell).r
  const hi = xrayPaint(d * 1.15, shell).r
  return new THREE.ShaderMaterial({
    uniforms: { uLo: { value: lo }, uHi: { value: hi } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLo; uniform float uHi; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(vec3(mix(uLo, uHi, sqrt(f))), 1.0);
      }`,
  })
}

type Flesh = { depth: THREE.Material; color: THREE.Material }
function fleshMats(color: string, opacity: number): Flesh {
  return {
    depth: new THREE.MeshBasicMaterial({ colorWrite: false }),
    color: new THREE.MeshStandardMaterial({ color, roughness: 0.55, transparent: true, opacity, depthWrite: false }),
  }
}
/** translucent shell: a depth-only pass first, then the colour pass that only blends the front-most surface */
function FleshMesh({ geometry, flesh, ...rest }: { geometry: THREE.BufferGeometry; flesh: Flesh } & Omit<React.ComponentProps<'mesh'>, 'geometry'>) {
  return (
    <group {...(rest as React.ComponentProps<'group'>)}>
      <mesh geometry={geometry} material={flesh.depth} renderOrder={1} />
      <mesh geometry={geometry} material={flesh.color} renderOrder={2} />
    </group>
  )
}

/* ------------------------------------------------------------------ hand */

type Finger = { base: [number, number]; ang: number; len: number[]; k: number; thumb?: boolean }
const FINGERS: Finger[] = [
  { base: [-0.4, 0.3], ang: 0.17, len: [0.56, 0.34, 0.25], k: 1 },
  { base: [-0.13, 0.38], ang: 0.05, len: [0.62, 0.38, 0.26], k: 1.04 },
  { base: [0.14, 0.33], ang: -0.08, len: [0.58, 0.36, 0.25], k: 1 },
  { base: [0.4, 0.18], ang: -0.22, len: [0.46, 0.28, 0.22], k: 0.86 },
  { base: [-0.64, -0.36], ang: 0.72, len: [0.42, 0.33], k: 1.12, thumb: true },
]
const CARPALS: [number, number, number][] = [
  [-0.3, -0.8, 0.1],
  [-0.1, -0.84, 0.1],
  [0.1, -0.83, 0.095],
  [0.29, -0.78, 0.09],
  [-0.36, -0.6, 0.095],
  [-0.14, -0.62, 0.105],
  [0.08, -0.6, 0.1],
  [0.28, -0.58, 0.095],
]

function useHandAssets() {
  return useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const keep = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g)
    const capsule = (r: number, len: number) => keep(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, 16))
    const sphere = keep(new THREE.SphereGeometry(1, 20, 14))
    // palm: a rounded-box ellipsoid (smooth normals → it gets thicker toward the middle, rims at the sides)
    const palm = keep(new THREE.SphereGeometry(1, 48, 32))
    const pp = palm.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i)
      const y = pp.getY(i)
      const z = pp.getZ(i)
      const bx = Math.sign(x) * Math.pow(Math.abs(x), 0.55)
      const by = Math.sign(y) * Math.pow(Math.abs(y), 0.7)
      // narrower at the wrist, wider across the knuckles
      const w = 0.5 + 0.1 * (by + 1) * 0.5
      pp.setXYZ(i, bx * w + 0.0, by * 0.62 - 0.2, z * 0.2)
    }
    palm.computeVertexNormals()
    const mats = {
      bone: boneMat(0.5, FLESH_A),
      boneDense: boneMat(0.56, FLESH_A),
      metal: paintMat(1.25, 0),
      leather: paintMat(0.1, 0),
      flesh: fleshMats('#d39a86', FLESH_A),
    }
    return { geos, capsule, sphere, palm, mats }
  }, [])
}

/** a bone (capsule + knobbly ends) and its flesh along +y from 0 to len; children hang off the far end */
function Segment({
  A,
  len,
  boneR,
  fleshR,
  joint,
  children,
}: {
  A: ReturnType<typeof useHandAssets>
  len: number
  boneR: number
  fleshR: number
  joint?: (g: THREE.Group | null) => void
  children?: React.ReactNode
}) {
  const gap = 0.045
  const bl = len - gap - boneR * 2
  const bone = useMemo(() => A.capsule(boneR, bl), [A, boneR, bl])
  const flesh = useMemo(() => A.capsule(fleshR, len), [A, fleshR, len])
  return (
    <>
      <mesh geometry={bone} material={A.mats.bone} position={[0, len / 2, 0]} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[0, gap / 2 + boneR * 1.1, 0]} scale={[boneR * 1.32, boneR * 1.05, boneR * 1.15]} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[0, len - gap / 2 - boneR * 1.1, 0]} scale={[boneR * 1.25, boneR * 1.0, boneR * 1.1]} />
      <FleshMesh geometry={flesh} flesh={A.mats.flesh} position={[0, len / 2, 0]} />
      <group ref={joint} position={[0, len, 0]}>
        {children}
      </group>
    </>
  )
}

/** a bone between two points in the hand plane */
function BoneBetween({ A, a, b, r, flesh }: { A: ReturnType<typeof useHandAssets>; a: [number, number]; b: [number, number]; r: number; flesh?: number }) {
  const { len, mid, rot } = useMemo(() => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    return { len: Math.hypot(dx, dy), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0] as [number, number, number], rot: Math.atan2(-dx, dy) }
  }, [a, b])
  const g = useMemo(() => A.capsule(r, Math.max(0.01, len - r * 2 - 0.04)), [A, r, len])
  const f = useMemo(() => (flesh ? A.capsule(flesh, len) : null), [A, flesh, len])
  return (
    <group position={mid} rotation={[0, 0, rot]}>
      <mesh geometry={g} material={A.mats.bone} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[0, len / 2 - r * 1.2, 0]} scale={[r * 1.45, r * 1.15, r * 1.25]} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[0, -len / 2 + r * 1.2, 0]} scale={[r * 1.3, r * 1.0, r * 1.15]} />
      {f && <FleshMesh geometry={f} flesh={A.mats.flesh} />}
    </group>
  )
}

function Hand({ t }: { t: React.RefObject<number> }) {
  const A = useHandAssets()
  useEffect(
    () => () => {
      A.geos.forEach((g) => g.dispose())
      const { flesh, ...rest } = A.mats
      Object.values(rest).forEach((m) => m.dispose())
      flesh.depth.dispose()
      flesh.color.dispose()
    },
    [A],
  )
  // joints: [finger][0..2]
  const joints = useRef<(THREE.Group | null)[][]>(FINGERS.map(() => [null, null, null]))
  const forearm = useMemo(() => {
    const g = A.capsule(0.46, 2.6)
    return g
  }, [A])
  const radius = useMemo(() => A.capsule(0.1, 1.9), [A])
  const ulna = useMemo(() => A.capsule(0.078, 1.95), [A])

  useFrame(() => {
    const T = t.current
    FINGERS.forEach((f, i) => {
      const j = joints.current[i]
      // a slow wave of flexion across the fingers (flexion bends toward the camera → foreshortening)
      const w = 0.5 + 0.5 * Math.sin(T * 0.9 - i * 0.7)
      const flex = f.thumb ? 0.25 * w : 0.55 * w * w
      if (j[0]) j[0].rotation.x = flex * 0.55
      if (j[1]) j[1].rotation.x = flex * 0.9
      if (j[2]) j[2].rotation.x = flex * 0.7
    })
  })

  return (
    <group>
      {/* forearm + wrist */}
      <FleshMesh geometry={forearm} flesh={A.mats.flesh} position={[0.0, -2.35, 0]} scale={[1, 1, 0.62]} />
      <mesh geometry={radius} material={A.mats.bone} position={[-0.24, -2.2, 0]} rotation={[0, 0, 0.04]} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[-0.25, -1.1, 0]} scale={[0.19, 0.12, 0.14]} />
      <mesh geometry={ulna} material={A.mats.bone} position={[0.25, -2.25, -0.02]} rotation={[0, 0, -0.03]} />
      <mesh geometry={A.sphere} material={A.mats.boneDense} position={[0.25, -1.16, -0.02]} scale={[0.12, 0.1, 0.11]} />
      {/* carpals */}
      {CARPALS.map(([x, y, r], i) => (
        <mesh key={i} geometry={A.sphere} material={A.mats.boneDense} position={[x, y, 0]} scale={[r * 1.05, r, r * 0.9]} rotation={[0, 0, i * 0.7]} />
      ))}
      {/* palm */}
      <FleshMesh geometry={A.palm} flesh={A.mats.flesh} />
      {/* metacarpals */}
      {FINGERS.map((f, i) => (
        <BoneBetween key={i} A={A} a={f.thumb ? [-0.34, -0.66] : [f.base[0] * 0.62, -0.5]} b={f.base} r={f.thumb ? 0.07 : 0.062} flesh={f.thumb ? 0.17 : undefined} />
      ))}
      {/* fingers */}
      {FINGERS.map((f, i) => {
        const br = [0.058, 0.05, 0.043].map((r) => r * f.k)
        const fr = [0.13, 0.12, 0.11].map((r) => r * f.k)
        const L = f.len
        return (
          <group key={i} position={[f.base[0], f.base[1], 0]} rotation={[0, 0, f.ang]}>
            <group ref={(g) => void (joints.current[i][0] = g)}>
              <Segment A={A} len={L[0]} boneR={br[0]} fleshR={fr[0]} joint={(g) => void (joints.current[i][1] = g)}>
                {L.length > 2 ? (
                  <Segment A={A} len={L[1]} boneR={br[1]} fleshR={fr[1]} joint={(g) => void (joints.current[i][2] = g)}>
                    <Segment A={A} len={L[2]} boneR={br[2]} fleshR={fr[2]} />
                  </Segment>
                ) : (
                  <Segment A={A} len={L[1]} boneR={br[2]} fleshR={fr[1]} />
                )}
              </Segment>
              {/* a ring on the ring finger */}
              {i === 2 && (
                <mesh material={A.mats.metal} position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[fr[0] + 0.012, 0.024, 10, 40]} />
                </mesh>
              )}
            </group>
          </group>
        )
      })}
      {/* wristwatch: metal case + crown on the back of the wrist, a leather strap */}
      <group position={[0, -1.62, 0]}>
        <mesh material={A.mats.metal} position={[0, 0, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.1, 40]} />
        </mesh>
        <mesh material={A.mats.metal} position={[0.3, 0, 0.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 0.08, 12]} />
        </mesh>
        <mesh material={A.mats.leather} scale={[1, 1, 0.64]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.48, 0.035, 8, 48]} />
        </mesh>
      </group>
      {/* lead side marker "L" */}
      <group position={[-1.35, 1.05, 0.1]}>
        <mesh material={A.mats.metal} position={[0, 0, 0]}>
          <boxGeometry args={[0.07, 0.38, 0.04]} />
        </mesh>
        <mesh material={A.mats.metal} position={[0.1, -0.155, 0]}>
          <boxGeometry args={[0.2, 0.07, 0.04]} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ bags */

function useBagAssets() {
  return useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const keep = <T extends THREE.BufferGeometry>(g: T) => (geos.push(g), g)
    const rounded = (w: number, h: number, d: number, r: number) => {
      const s = new THREE.Shape()
      const x = -w / 2 + r
      const y = -h / 2 + r
      s.moveTo(x, -h / 2)
      s.lineTo(w / 2 - r, -h / 2)
      s.quadraticCurveTo(w / 2, -h / 2, w / 2, y)
      s.lineTo(w / 2, h / 2 - r)
      s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
      s.lineTo(x, h / 2)
      s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
      s.lineTo(-w / 2, y)
      s.quadraticCurveTo(-w / 2, -h / 2, x, -h / 2)
      const g = keep(new THREE.ExtrudeGeometry(s, { depth: d - 0.2, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 4, curveSegments: 10 }))
      g.translate(0, 0, -(d - 0.2) / 2)
      return g
    }
    // zip running round the suitcase seam
    const zp: THREE.Vector3[] = []
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2
      const c = Math.cos(t)
      const sn = Math.sin(t)
      // superellipse ≈ the rounded rectangle of the shell
      zp.push(new THREE.Vector3(Math.sign(c) * Math.pow(Math.abs(c), 0.25) * 1.33, Math.sign(sn) * Math.pow(Math.abs(sn), 0.25) * 0.85, 0))
    }
    const zip = keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zp, true), 200, 0.022, 6, true))
    return {
      geos,
      zip,
      suitcase: rounded(2.7, 1.75, 0.7, 0.22),
      backpack: rounded(1.75, 1.55, 0.6, 0.45),
      shellA: fleshMats('#3b4a5c', SHELL_A),
      shellB: fleshMats('#5a3d3a', SHELL_A),
      m: {
        organic: solidMat(0.16),
        organic2: solidMat(0.2),
        mixed: solidMat(0.45),
        mixed2: solidMat(0.55),
        metal: solidMat(1.0),
        metal2: solidMat(1.25),
        handle: solidMat(0.22, 0),
      },
    }
  }, [])
}

function Suitcase({ B }: { B: ReturnType<typeof useBagAssets> }) {
  const m = B.m
  return (
    <group>
      <FleshMesh geometry={B.suitcase} flesh={B.shellA} />
      <mesh geometry={B.zip} material={m.mixed} position={[0, 0, 0.22]} />
      {/* carry handle */}
      <mesh material={m.handle} position={[0, 0.98, 0.0]}>
        <torusGeometry args={[0.32, 0.05, 8, 24, Math.PI]} />
      </mesh>
      {/* telescopic handle rails + wheels */}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} material={m.metal} position={[x, 0, -0.28]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 1]}>
          <cylinderGeometry args={[0.035, 0.035, 2.2, 10]} />
        </mesh>
      ))}
      {[-1.18, 1.18].map((x) => (
        <mesh key={x} material={m.mixed2} position={[x, -0.78, -0.25]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 16]} />
        </mesh>
      ))}
      {/* laptop with its battery and board */}
      <group position={[-0.55, 0.28, 0.0]} rotation={[0, 0, 0.06]}>
        <mesh material={m.mixed}>
          <boxGeometry args={[1.25, 0.82, 0.05]} />
        </mesh>
        <mesh material={m.metal} position={[0.0, -0.22, 0.04]}>
          <boxGeometry args={[0.8, 0.22, 0.03]} />
        </mesh>
        <mesh material={m.mixed2} position={[-0.25, 0.15, 0.04]}>
          <boxGeometry args={[0.45, 0.25, 0.02]} />
        </mesh>
      </group>
      {/* water bottle */}
      <group position={[0.68, 0.2, 0.05]} rotation={[0, 0, 1.35]}>
        <mesh material={m.organic}>
          <cylinderGeometry args={[0.15, 0.15, 0.78, 24]} />
        </mesh>
        <mesh material={m.organic2} position={[0, 0.46, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.14, 16]} />
        </mesh>
      </group>
      {/* folded clothes */}
      <mesh material={m.organic} position={[0.75, -0.42, 0.0]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.95, 0.52, 0.18]} />
      </mesh>
      {/* scissors */}
      <group position={[-0.35, -0.5, 0.15]} rotation={[0, 0, 0.5]}>
        <mesh material={m.metal2} position={[0.22, 0.02, 0]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[0.5, 0.04, 0.02]} />
        </mesh>
        <mesh material={m.metal2} position={[0.22, -0.02, 0]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[0.5, 0.04, 0.02]} />
        </mesh>
        {[0.06, -0.06].map((y) => (
          <mesh key={y} material={m.mixed2} position={[-0.1, y * 1.6, 0]}>
            <torusGeometry args={[0.07, 0.02, 8, 24]} />
          </mesh>
        ))}
      </group>
      {/* keys */}
      <group position={[-1.05, -0.45, 0.2]}>
        <mesh material={m.metal}>
          <torusGeometry args={[0.07, 0.012, 6, 24]} />
        </mesh>
        <mesh material={m.metal} position={[0.1, -0.1, 0]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.05, 0.2, 0.015]} />
        </mesh>
        <mesh material={m.metal} position={[-0.04, -0.14, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.05, 0.18, 0.015]} />
        </mesh>
      </group>
    </group>
  )
}

function Backpack({ B }: { B: ReturnType<typeof useBagAssets> }) {
  const m = B.m
  return (
    <group>
      <FleshMesh geometry={B.backpack} flesh={B.shellB} />
      {/* zip pull + buckles */}
      <mesh material={m.metal} position={[0, 0.66, 0.31]}>
        <boxGeometry args={[0.06, 0.12, 0.02]} />
      </mesh>
      {/* headphones */}
      <group position={[-0.3, 0.22, 0.05]}>
        <mesh material={m.mixed}>
          <torusGeometry args={[0.32, 0.035, 8, 40, Math.PI]} />
        </mesh>
        {[-0.32, 0.32].map((x) => (
          <mesh key={x} material={m.mixed2} position={[x, -0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.08, 20]} />
          </mesh>
        ))}
      </group>
      {/* apple + book + power bank + coins */}
      <mesh material={m.organic2} position={[0.42, 0.3, 0.05]}>
        <sphereGeometry args={[0.2, 20, 14]} />
      </mesh>
      <mesh material={m.organic} position={[0.0, -0.35, -0.05]} rotation={[0, 0, 0.1]}>
        <boxGeometry args={[1.05, 0.5, 0.12]} />
      </mesh>
      <mesh material={m.metal} position={[0.45, -0.3, 0.15]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.3, 0.16, 0.06]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={m.metal2} position={[-0.45 + i * 0.09, -0.05, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.015, 18]} />
        </mesh>
      ))}
    </group>
  )
}

const BELT_SPAN = 9

function Conveyor({ t }: { t: React.RefObject<number> }) {
  const B = useBagAssets()
  useEffect(
    () => () => {
      B.geos.forEach((g) => g.dispose())
      Object.values(B.m).forEach((m) => m.dispose())
      for (const f of [B.shellA, B.shellB]) {
        f.depth.dispose()
        f.color.dispose()
      }
    },
    [B],
  )
  const a = useRef<THREE.Group>(null)
  const b = useRef<THREE.Group>(null)
  useFrame(() => {
    const T = t.current
    const x = (o: number) => ((((o - T * 0.75) % BELT_SPAN) + BELT_SPAN) % BELT_SPAN) - BELT_SPAN / 2
    if (a.current) a.current.position.x = x(POSTER ? 4.5 : 1.2)
    if (b.current) b.current.position.x = x(POSTER ? 0 : 1.2 + BELT_SPAN / 2)
  })
  return (
    <group>
      <group ref={a} rotation={[0, 0, 0.04]}>
        <Suitcase B={B} />
      </group>
      <group ref={b} rotation={[0, 0, -0.05]}>
        <Backpack B={B} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ rig */

function Rig({
  yaw,
  pitch,
  bagK,
  fx,
  lens,
  t,
}: {
  yaw: MotionValue<number>
  pitch: MotionValue<number>
  bagK: MotionValue<number>
  fx: StylizeEffect
  lens: React.RefObject<{ on: boolean; x: number; y: number; last: number; scan: HTMLElement | null }>
  t: React.RefObject<number>
}) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const hand = useRef<THREE.Group>(null)
  const bags = useRef<THREE.Group>(null)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (!POSTER) t.current += dt
    const T = t.current
    const mobile = size.width < 760
    const vw = viewport.width
    const vh = viewport.height
    const k = bagK.get()
    if (hand.current) {
      const s = POSTER ? (vh * 0.86) / 4.4 : mobile ? Math.min((vw * 0.9) / 3.0, (vh * 0.56) / 4.4) : Math.min((vh * 0.84) / 4.4, (vw * 0.5) / 3.0)
      hand.current.scale.setScalar(s)
      const x0 = POSTER || mobile ? 0.05 * s : vw * 0.17
      const y0 = POSTER ? 0.05 * s : mobile ? vh * 0.13 - 0.05 * s : 0.08 * s
      hand.current.position.set(x0 - k * vw * 0.25, y0 - k * vh * 1.1, 0)
      hand.current.rotation.set(pitch.get() + 0.05, yaw.get() + Math.sin(T * 0.4) * 0.22, Math.sin(T * 0.3) * 0.04)
      hand.current.visible = k < 0.999
    }
    if (bags.current) {
      const s = mobile ? Math.min((vw * 0.92) / 2.9, 1) : Math.min((vh * 0.5) / 2.4, (vw * 0.42) / 2.9)
      bags.current.scale.setScalar(s)
      bags.current.position.set(mobile ? 0 : vw * 0.17, (mobile ? vh * 0.14 : 0) + (1 - k) * vh * 1.1, 0)
      bags.current.rotation.set(pitch.get() * 0.5, yaw.get() * 0.5, 0)
      bags.current.visible = k > 0.001
    }
    // the handheld scanner: follows the pointer, wanders over the subject when idle
    const L = lens.current
    let lx = L.x
    let ly = L.y
    if (performance.now() - L.last > 2500 || !L.last) {
      const cx = mobile ? size.width * 0.5 : size.width * 0.67
      const cy = mobile ? size.height * 0.36 : size.height * 0.46
      lx = cx + Math.sin(T * 0.55) * size.width * (mobile ? 0.22 : 0.1)
      ly = cy + Math.sin(T * 0.83 + 1) * size.height * 0.18
    }
    const r = mobile ? 92 : 128
    setXrayLens(fx, { x: lx, y: ly, r, on: L.on })
    if (L.scan) L.scan.style.transform = `translate(${lx}px, ${ly}px)`
  })
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[-3, 4, 6]} intensity={2.2} />
      <group ref={hand}>
        <Hand t={t} />
      </group>
      <group ref={bags}>
        <Conveyor t={t} />
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

function Ruler() {
  const ticks = Array.from({ length: 21 }, (_, i) => i)
  return (
    <div className="xr-ruler">
      {ticks.map((i) => (
        <span key={i} className={i % 5 === 0 ? 'big' : ''} style={{ top: `${(i / 20) * 100}%` }}>
          {i % 5 === 0 && <b>{i}</b>}
        </span>
      ))}
      <em>cm</em>
    </div>
  )
}

export default function XRay() {
  const fx = useMemo(createXrayEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<XrayMode>('film')
  const [di, setDi] = useState(1)
  const [lensOn, setLensOn] = useState(false)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const splitOpen = useRef(false)
  splitOpen.current = split.open
  const yaw = useMotionValue(0)
  const pitch = useMotionValue(0)
  const bagK = useMotionValue(0)
  const t = useRef(POSTER ? 3.4 : 0)
  const lens = useRef({ on: false, x: 0, y: 0, last: 0, scan: null as HTMLElement | null })
  const band = useRef<HTMLDivElement>(null)
  const lastInput = useRef(POSTER ? Infinity : -1e9)
  const poke = () => (lastInput.current = performance.now())

  useEffect(() => {
    setXrayMode(fx, mode)
    const a = animate(bagK, mode === 'scan' ? 1 : 0, { type: 'spring', stiffness: 60, damping: 16 })
    return () => a.stop()
  }, [fx, mode, bagK])
  useEffect(() => setXrayDose(fx, DOSES[di].k), [fx, di])
  useEffect(() => {
    lens.current.on = lensOn
  }, [lensOn])

  // idle: cycle the modes
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => xrayModes[(xrayModes.findIndex((x) => x.id === m) + 1) % xrayModes.length].id)
    }, 8000)
    return () => window.clearInterval(id)
  }, [])

  // CT slice label follows the band
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (band.current) band.current.style.transform = `translateY(${xrayScanY(fx) * window.innerHeight}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [fx])

  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const setPointer = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    lens.current.x = e.clientX - r.left
    lens.current.y = e.clientY - r.top
    lens.current.last = performance.now()
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    setPointer(e)
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob') && !drag.current) return
    if (e.pointerType === 'mouse' || drag.current) setPointer(e)
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    // with the scanner on, a touch drag moves the lens instead of turning the subject
    if (lensOn && e.pointerType !== 'mouse') return
    yaw.set(THREE.MathUtils.clamp(yaw.get() + (e.clientX - d.x) * 0.004, -0.8, 0.8))
    pitch.set(THREE.MathUtils.clamp(pitch.get() + (e.clientY - d.y) * 0.003, -0.4, 0.4))
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
        power: 0.35,
        timeConstant: 480,
        min: -0.8,
        max: 0.8,
        bounceStiffness: 140,
        bounceDamping: 18,
        onComplete: () => void anims.current.push(animate(yaw, 0, { type: 'spring', stiffness: 16, damping: 9, delay: 2 })),
      }),
      animate(pitch, pitch.get(), {
        type: 'inertia',
        velocity: pitch.getVelocity(),
        power: 0.3,
        timeConstant: 400,
        min: -0.4,
        max: 0.4,
        bounceStiffness: 160,
        bounceDamping: 18,
        onComplete: () => void anims.current.push(animate(pitch, 0, { type: 'spring', stiffness: 16, damping: 9, delay: 2 })),
      }),
    ]
  }

  const D = DOSES[di]
  const label = xrayModes.find((m) => m.id === mode)!.label
  const light = mode === 'scan'

  return (
    <div
      className={`stage xr xr-${mode}${light ? ' xr-light' : ''}${split.open ? ' xr-split' : ''}${lensOn ? ' xr-lens' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 10], fov: 30, near: 0.5, far: 40 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={xrayMeta.background} preload={preload} />
        <Rig yaw={yaw} pitch={pitch} bagK={bagK} fx={fx} lens={lens} t={t} />
      </Canvas>

      {/* HUD (outside .overlay so the poster keeps it) */}
      <div className="xr-hud" aria-hidden>
        <div className="xr-id">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={light ? 'bag' : 'pt'} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.35 }}>
              {light ? (
                <>
                  <b>LANE 03 · BAG 0417</b>
                  <span>DUAL-ENERGY · TOP VIEW</span>
                </>
              ) : (
                <>
                  <b>PT 0723-114 · L HAND PA</b>
                  <span>{mode === 'ct' ? 'AXIAL · 3.0 mm · W 400 L 40' : 'SID 100 cm · GRID — · 24 × 30'}</span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <Ruler />
        <div className="xr-kv">
          <span>
            <i>kV</i>
            <b>{light ? 160 : D.kv}</b>
          </span>
          <span>
            <i>mA</i>
            <b>{light ? '1.0' : D.ma.toFixed(1)}</b>
          </span>
          <span>
            <i>s</i>
            <b>{light ? 'LIVE' : D.s.toFixed(2)}</b>
          </span>
        </div>
        <div className="xr-band" ref={band}>
          <span>SLICE {String(96 + di * 7).padStart(3, '0')}</span>
        </div>
        <div className="xr-legend">
          <span>
            <i style={{ background: '#f78f1f' }} />
            有机物
          </span>
          <span>
            <i style={{ background: '#38b348' }} />
            混合
          </span>
          <span>
            <i style={{ background: '#2a56d8' }} />
            金属
          </span>
        </div>
        <div className="xr-scanner" ref={(el) => void (lens.current.scan = el)}>
          <span>SCAN</span>
        </div>
      </div>

      <div className="overlay">
        <OriginalSplit split={split} label={label} />
        <div className="hero-copy xr-copy">
          <div className="scrim xr-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              X-Ray ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="xr-kmode"
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
              越厚越白，
              <br />
              骨头藏不住
            </h1>
            <p className="xr-sub">物体被当成半透明的组织来“拍片”：表面越斜，射线擦着皮穿过的路越长，所以轮廓发亮；涂成过曝白色的部分算骨头和金属，隔着皮肉也透出来。</p>
            <div className="xr-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={xrayModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg xr-cycle"
            onClick={() => {
              poke()
              setDi((i) => (i + 1) % DOSES.length)
            }}
          >
            <span>
              {mobile ? '剂' : '剂量'} <b>{D.zh}</b>
            </span>
          </button>
          <button
            className="seg"
            aria-pressed={lensOn}
            onClick={() => {
              poke()
              setLensOn((v) => !v)
            }}
          >
            {lensOn && <motion.span layoutId="xr-lens-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>{mobile ? '扫描' : '手持扫描'}</span>
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
            {split.open && <motion.span layoutId="xr-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">{lensOn ? '移动指针扫描 · 拖动转动' : '拖动转动 · 打开手持扫描看局部'}</p>
      </div>
    </div>
  )
}

const css = `
.xr { cursor: grab; touch-action: none; background: ${xrayMeta.background}; transition: background .6s; }
.xr:active { cursor: grabbing; }
.xr-lens { cursor: crosshair; }
.xr canvas { display: block; }
.xr-light { background: #eef0ec; }
.demo-page:has(.xr-light) {
  --fg: #16191c; --fg-2: rgba(22, 25, 28, 0.62); --glass: rgba(255, 255, 255, 0.66); --glass-line: rgba(0, 0, 0, 0.08);
}
.xr-copy { pointer-events: none !important; }
.xr-scrim { --soft-bg: rgba(5, 8, 12, .7); transition: opacity .6s; }
.xr-light .xr-scrim { --soft-bg: rgba(242, 243, 240, .9); }
.xr-copy .kicker i { background: #9fd8ff; box-shadow: 0 0 10px #9fd8ff; }
.xr-light .xr-copy .kicker i { background: #2a56d8; box-shadow: none; }
.xr-kmode { display: inline-block; color: var(--fg); }
.xr-copy h1 { font-size: clamp(40px, 4.6vw, 62px); }
.xr-sub { max-width: 410px; }
.xr-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.xr-spec span { display: inline-block; }
.xr-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.xr-cycle b { font-weight: 600; color: var(--fg); }
.xr .hint { transition: opacity .4s; }
.xr-split .hint { opacity: 0; }

.xr-hud { position: absolute; inset: 0; pointer-events: none; z-index: 2; color: #cfe6f7; font: 500 11px/1.4 var(--mono); letter-spacing: .06em; }
.xr-light .xr-hud { color: #1f2a36; }
.xr-id { position: absolute; right: clamp(16px, 3vw, 40px); top: 84px; text-align: right; }
.xr-id div { display: flex; flex-direction: column; gap: 3px; }
.xr-id b { font-weight: 600; font-size: 12px; }
.xr-id span { opacity: .62; }
.xr-ruler {
  position: absolute; right: clamp(16px, 3vw, 40px); top: 50%; height: min(320px, 40vh); width: 14px;
  transform: translateY(-50%); border-right: 1px solid currentColor; opacity: .7;
}
.xr-ruler span { position: absolute; right: 0; width: 6px; height: 1px; background: currentColor; }
.xr-ruler span.big { width: 12px; }
.xr-ruler b { position: absolute; right: 18px; top: -6px; font-weight: 500; font-size: 10px; }
.xr-ruler em { position: absolute; right: 18px; bottom: -22px; font-style: normal; font-size: 10px; opacity: .7; }
.xr-kv { position: absolute; right: clamp(16px, 3vw, 40px); bottom: 64px; display: flex; gap: 16px; }
.xr-kv span { display: inline-flex; align-items: baseline; gap: 5px; }
.xr-kv i { font-style: normal; opacity: .55; }
.xr-kv b { font-weight: 600; font-size: 15px; letter-spacing: .02em; }
.xr-band {
  position: absolute; left: 0; right: clamp(16px, 3vw, 40px); top: 0; height: 0; opacity: 0; transition: opacity .5s;
  display: flex; justify-content: flex-end; color: #7ff2ff;
}
.xr-band span { transform: translateY(-50%) translateX(-34px); padding: 2px 6px; background: rgba(4, 20, 26, .7); box-shadow: inset 0 0 0 1px rgba(127, 242, 255, .4); }
.xr-ct .xr-band { opacity: 1; }
.xr-legend {
  position: absolute; right: clamp(16px, 3vw, 40px); top: 128px; display: flex; gap: 12px; opacity: 0; transition: opacity .5s;
  font-family: var(--sans); letter-spacing: 0;
}
.xr-legend span { display: inline-flex; align-items: center; gap: 5px; }
.xr-legend i { width: 9px; height: 9px; border-radius: 2px; }
.xr-light .xr-legend { opacity: 1; }
.xr-scanner { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity .3s; will-change: transform; }
.xr-scanner span {
  position: absolute; left: 96px; top: -112px; padding: 2px 6px; color: #dff3ff; background: rgba(5, 12, 20, .7);
  box-shadow: inset 0 0 0 1px rgba(200, 235, 255, .4);
}
.xr-lens .xr-scanner { opacity: 1; }
.xr-split .xr-scanner { opacity: 0; }
.poster .xr-kv, .poster .xr-ruler, .poster .xr-scanner { display: none; }
@media (max-width: 760px) {
  .xr-copy { transition: opacity .4s; }
  .xr-split .xr-copy { opacity: 0; }
  .xr-sub { display: none; }
  .xr-copy h1 { font-size: 36px; }
  .xr-spec { margin-top: 12px; font-size: 11px; }
  .xr-id { left: 16px; right: auto; top: 76px; text-align: left; font-size: 10px; }
  .xr-ruler { display: none; }
  .xr-kv { top: 76px; bottom: auto; right: 16px; gap: 10px; }
  .xr-kv b { font-size: 12px; }
  .xr-legend { top: 118px; left: 16px; right: auto; }
  .xr-band span { transform: translateY(-50%) translateX(-4px); font-size: 10px; }
  .xr-scanner span { left: 70px; top: -84px; }
  .xr .dock .seg { padding: 0 9px; }
  .xr .dock .dock-sep { margin: 0 1px; }
}
`
