import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect, type StylizeEffect } from '../../lib/stylize'
import { SIMPLEX_3D } from '../shader/glsl'
import {
  createInkwashEffect,
  inkwashMeta,
  inkwashModes,
  inkwashProgress,
  paintInkwash,
  setInkwashDensity,
  setInkwashFog,
  setInkwashMist,
  setInkwashMode,
  settleInkwash,
  type InkwashMode,
} from './effects/inkwash'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 水墨 showcase — 溪山渔隐: layered karst peaks stepping back into mist, pines clinging to the near cliff,
 * a fisherman in a straw hat on a small boat, a few birds. The near peaks carry the strong value
 * structure (lit faces → 留白, shadow faces → 浓墨 with 皴 dabs), the far ranges dissolve into pale wet
 * washes by depth, and mist bands drift between the layers. Effect: ./effects/inkwash.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const CYCLE_EVERY = 11000
const PAPER = inkwashMeta.background

const DENSITY = [
  { zh: '淡', v: 0.72 },
  { zh: '中', v: 1 },
  { zh: '浓', v: 1.3 },
]

const SPEC: Record<InkwashMode, { tool: string; note: string }> = {
  xieyi: { tool: '写意', note: '大片水墨 · 线少而活 · 飞白皴擦' },
  gongbi: { tool: '工笔', note: '细匀铁线 · 淡彩罩染：花青 赭石 朱砂' },
  pomo: { tool: '泼墨', note: '墨块泼洒 · 浓淡对撞 · 溅点' },
}

const TONES = [
  { zh: '焦', v: '#15130f' },
  { zh: '浓', v: '#3a3834' },
  { zh: '重', v: '#67655f' },
  { zh: '淡', v: '#a19e96' },
  { zh: '清', v: '#cdc8bd' },
]

/* ------------------------------------------------------------------ procedural terrain */

function hash2(x: number, y: number, s: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
  return h - Math.floor(h)
}
function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy, s)
  const b = hash2(ix + 1, iy, s)
  const c = hash2(ix, iy + 1, s)
  const d = hash2(ix + 1, iy + 1, s)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
function fbm(x: number, y: number, s: number) {
  let v = 0
  let a = 0.5
  for (let i = 0; i < 4; i++) {
    v += a * vnoise(x, y, s + i * 7)
    x *= 2.03
    y *= 2.03
    a *= 0.5
  }
  return v / 0.9375
}

type Peak = [x: number, z: number, h: number, w: number]
type Range = { w: number; d: number; segX: number; segZ: number; peaks: Peak[]; seed: number; ridge: number }

/** height of a range at local (x, z): steep rounded karst peaks with radial ridges (where 皴 will land) */
function rangeHeight(R: Range, x: number, z: number) {
  let h = 0
  const wob = fbm(x * 0.6, z * 0.6, R.seed) * 4
  for (const [px, pz, H, w] of R.peaks) {
    const dx = x - px
    const dz = (z - pz) * 1.25
    const d = Math.hypot(dx, dz)
    const a = Math.atan2(dz, dx)
    const ridge = Math.abs(Math.sin(a * 5 + wob))
    const p = H * Math.exp(-Math.pow(d / w, 1.65)) * (1 - R.ridge * ridge * Math.min(1, d / w))
    h = Math.max(h, p)
  }
  const n = fbm(x * 0.9, z * 0.9, R.seed + 3)
  h += (n - 0.45) * 0.35 * Math.min(1, h)
  // fade to below the water at the back / sides so the range never shows a cut edge
  const ex = 1 - Math.pow(Math.min(1, Math.abs(x) / (R.w / 2)), 6)
  const ez = 1 - Math.pow(Math.min(1, Math.abs(z) / (R.d / 2)), 6)
  return h * ex * ez - 0.15
}

function rangeGeometry(R: Range) {
  const g = new THREE.PlaneGeometry(R.w, R.d, R.segX, R.segZ)
  g.rotateX(-Math.PI / 2)
  const pos = g.attributes.position as THREE.BufferAttribute
  let top = 0
  for (let i = 0; i < pos.count; i++) {
    const y = rangeHeight(R, pos.getX(i), pos.getZ(i))
    pos.setY(i, y)
    top = Math.max(top, y)
  }
  // 青绿 / 浅绛 colouring: ochre earth at the feet, blue-green mineral towards the peaks (only 工笔 shows it as
  // colour; the other modes read value alone)
  const lo = new THREE.Color('#ad9473')
  const hi = new THREE.Color('#869c99')
  const c = new THREE.Color()
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const n = fbm(pos.getX(i) * 0.7, pos.getZ(i) * 0.7, R.seed + 9)
    const k = THREE.MathUtils.smoothstep(pos.getY(i) / top + (n - 0.5) * 0.35, 0.3, 0.7)
    c.copy(lo).lerp(hi, k)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  return g
}

// built once (in slices, between frames) and kept for later visits — ~100 ms of terrain maths would
// otherwise land in the page's first frame
let geoCache: THREE.BufferGeometry[] | null = null
function useRangeGeometries() {
  const [geos, setGeos] = useState<THREE.BufferGeometry[] | null>(geoCache)
  useEffect(() => {
    if (geoCache) return setGeos(geoCache)
    let dead = false
    ;(async () => {
      const out: THREE.BufferGeometry[] = []
      for (const r of RANGES) {
        await new Promise((res) => setTimeout(res, 0))
        if (dead) return
        out.push(rangeGeometry(r.R))
      }
      geoCache = out
      setGeos(out)
    })()
    return () => {
      dead = true
    }
  }, [])
  return geos
}

const RANGES: { R: Range; at: [number, number, number] }[] = [
  // near cliff on the right (pines on its shoulder)
  {
    R: { w: 7, d: 4.4, segX: 150, segZ: 90, seed: 11, ridge: 0.22, peaks: [[0.9, -0.3, 5.4, 1.15], [2.3, 0.3, 3.3, 0.95], [-0.7, 0.5, 2.1, 0.85], [-1.9, 0.9, 1.0, 0.7]] },
    at: [3.6, 0, -0.6],
  },
  // middle peaks, left
  {
    R: { w: 11, d: 5, segX: 130, segZ: 56, seed: 23, ridge: 0.2, peaks: [[-1.8, 0, 5.8, 1.35], [-0.2, 0.4, 4.2, 1.1], [1.6, -0.2, 3.0, 1.0], [-3.6, 0.3, 3.4, 1.1], [3.4, 0.2, 1.8, 1.0]] },
    at: [-3.4, 0, -8],
  },
  // far range
  {
    R: { w: 26, d: 6, segX: 110, segZ: 28, seed: 37, ridge: 0.16, peaks: [[-6, 0, 6.2, 2.0], [-1.5, 0.5, 7.6, 2.2], [3.5, 0, 6.0, 2.0], [8.0, 0.4, 7.2, 2.3], [-10, 0.2, 4.0, 2.2]] },
    at: [3, 0, -19],
  },
  // farthest silhouettes
  {
    R: { w: 46, d: 6, segX: 96, segZ: 16, seed: 53, ridge: 0.1, peaks: [[-14, 0, 7.5, 3.4], [-4, 0, 9.5, 3.6], [6, 0.3, 8.0, 3.2], [16, 0, 9.0, 3.8]] },
    at: [-2, 0, -32],
  },
]

/* ------------------------------------------------------------------ props */

function Pine({ position, scale = 1, lean = 0, M }: { position: [number, number, number]; scale?: number; lean?: number; M: Mats }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.06 + lean * 0.2, 0.35, 0),
      new THREE.Vector3(-0.05 + lean * 0.5, 0.7, 0.02),
      new THREE.Vector3(0.08 + lean * 0.8, 1.05, 0),
    ])
    return new THREE.TubeGeometry(curve, 24, 0.035, 6, false)
  }, [lean])
  // flat canopy pads, the way pines are painted: stacked horizontal clouds of needles
  const pads: [number, number, number, number][] = [
    [0.1 + lean * 0.8, 1.06, 0, 0.36],
    [-0.22 + lean * 0.55, 0.82, 0.05, 0.3],
    [0.3 + lean * 0.4, 0.66, -0.03, 0.26],
    [-0.08 + lean * 0.3, 0.48, 0.06, 0.2],
  ]
  return (
    <group position={position} scale={scale}>
      <mesh geometry={geo} material={M.bark} />
      {pads.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} scale={[r, r * 0.32, r * 0.75]} material={M.needles}>
          <sphereGeometry args={[1, 16, 10]} />
        </mesh>
      ))}
    </group>
  )
}

function Boat({ t, M }: { t: React.RefObject<number>; M: Mats }) {
  const g = useRef<THREE.Group>(null)
  const ripples = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = t.current
    if (g.current) {
      g.current.position.y = Math.sin(s * 1.1) * 0.015
      g.current.rotation.z = Math.sin(s * 0.9) * 0.025
    }
    ripples.current?.children.forEach((c, i) => {
      const k = ((s * 0.12 + i * 0.5) % 1 + 1) % 1
      c.scale.setScalar(0.7 + k * 1.1)
      c.visible = k < 0.92
    })
  })
  return (
    <group position={[-1.2, 0, 2.8]} rotation={[0, 0.3, 0]} scale={0.8}>
      <group ref={g}>
        {/* hull: a slim canoe, the lower half of a stretched sphere */}
        <mesh position={[0, 0.07, 0]} scale={[0.85, 0.16, 0.2]} material={M.hull}>
          <sphereGeometry args={[1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        </mesh>
        {/* a low reed awning at the stern */}
        <mesh position={[-0.42, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.9]} material={M.hat}>
          <cylinderGeometry args={[0.15, 0.15, 0.36, 14, 1, true, 0, Math.PI]} />
        </mesh>
        {/* the fisherman: robe, head, straw hat */}
        <mesh position={[0.25, 0.2, 0]} material={M.robe}>
          <coneGeometry args={[0.1, 0.28, 12]} />
        </mesh>
        <mesh position={[0.25, 0.36, 0]} material={M.skin}>
          <sphereGeometry args={[0.042, 12, 8]} />
        </mesh>
        <mesh position={[0.25, 0.405, 0]} material={M.hat}>
          <coneGeometry args={[0.15, 0.07, 18]} />
        </mesh>
        {/* rod + line */}
        <mesh position={[0.72, 0.52, 0.02]} rotation={[0, 0, -1.1]} material={M.hull}>
          <cylinderGeometry args={[0.005, 0.009, 1.05, 5]} />
        </mesh>
        <mesh position={[1.17, 0.36, 0.02]} material={M.line}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.72, 4]} />
        </mesh>
      </group>
      {/* ripples: short arcs, not full rings */}
      <group ref={ripples} position={[0, 0.005, 0]}>
        {[0, 1].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, i * Math.PI + 0.5]} material={M.ripple}>
            <torusGeometry args={[1, 0.008, 4, 48, Math.PI * 0.55]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Birds({ t, M }: { t: React.RefObject<number>; M: Mats }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = t.current
    if (!g.current) return
    g.current.position.set(-6.2 + Math.sin(s * 0.05) * 1.0, 7.2 + Math.sin(s * 0.3) * 0.15, -4)
    g.current.children.forEach((b, i) => {
      const f = Math.sin(s * 5 + i * 1.9) * 0.5
      b.children[0].rotation.z = 0.35 + f
      b.children[1].rotation.z = -0.35 - f
    })
  })
  const birds: [number, number, number][] = [
    [0, 0, 0],
    [0.9, -0.35, 0.2],
  ]
  return (
    <group ref={g}>
      {birds.map((p, i) => (
        <group key={i} position={p} scale={0.9 - i * 0.12}>
          <mesh position={[-0.15, 0, 0]} material={M.bird}>
            <boxGeometry args={[0.3, 0.025, 0.06]} />
          </mesh>
          <mesh position={[0.15, 0, 0]} material={M.bird}>
            <boxGeometry args={[0.3, 0.025, 0.06]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** a band of drifting mist; hidden from the normal pass so its rectangle never becomes a contour */
function Mist({ position, size, speed, seed, opacity }: { position: [number, number, number]; size: [number, number]; speed: number; seed: number; opacity: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uT: { value: seed * 10 }, uOp: { value: opacity }, uSeed: { value: seed } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          ${SIMPLEX_3D}
          uniform float uT; uniform float uOp; uniform float uSeed;
          varying vec2 vUv;
          void main() {
            vec2 p = vec2(vUv.x * 6.0 + uT, vUv.y * 1.4);
            float n = snoise(vec3(p, uSeed)) * 0.6 + snoise(vec3(p * 2.3, uSeed + 4.0)) * 0.3 + 0.2;
            float band = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
            float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            float a = smoothstep(0.05, 0.75, n) * band * edge * uOp;
            gl_FragColor = vec4(0.89, 0.845, 0.765, a); // the paper, in linear light
          }
        `,
      }),
    [seed, opacity],
  )
  const ref = useRef<THREE.Mesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    // onBeforeRender runs before modelViewMatrix is built from matrixWorld, so this collapses the draw
    m.onBeforeRender = (_r, scene) => {
      if (scene.overrideMaterial) m.matrixWorld.copy(zero)
    }
  }, [])
  useFrame((_, dt) => {
    mat.uniforms.uT.value += Math.min(dt, 1 / 30) * speed
  })
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh ref={ref} position={position} material={mat} renderOrder={2}>
      <planeGeometry args={size} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ scene */

type Mats = Record<'rock' | 'rockFar' | 'water' | 'bark' | 'needles' | 'hull' | 'robe' | 'skin' | 'hat' | 'line' | 'ripple' | 'bird', THREE.Material>

const makeMats = (): Mats => {
  const m = (color: string, roughness = 1) => new THREE.MeshStandardMaterial({ color, roughness })
  return {
    rock: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, vertexColors: true }),
    rockFar: new THREE.MeshStandardMaterial({ color: '#fbfaf8', roughness: 1, vertexColors: true }),
    water: new THREE.MeshBasicMaterial({ color: PAPER }),
    bark: m('#3b3229'),
    needles: m('#27302a'),
    hull: m('#3a3027'),
    robe: m('#3f4a5c'),
    skin: m('#c8b49a'),
    hat: m('#c9ad7a'),
    line: m('#2a2a2a'),
    ripple: m('#55524c'),
    bird: m('#24221f'),
  }
}

function Landscape(props: { ry: MotionValue<number>; fx: StylizeEffect; onReady: () => void }) {
  const geos = useRangeGeometries()
  return geos ? <LandscapeScene {...props} geos={geos} /> : null
}

function LandscapeScene({ ry, fx, onReady, geos }: { ry: MotionValue<number>; fx: StylizeEffect; onReady: () => void; geos: THREE.BufferGeometry[] }) {
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content, onReady)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const spin = useRef<THREE.Group>(null)
  const t = useRef(POSTER ? 6 : 0)
  const M = useMemo(makeMats, [])
  // (the terrain geometries are cached for the next visit; their GPU buffers are freed with the renderer)
  useEffect(() => () => Object.values(M).forEach((m) => m.dispose()), [M])
  // pines on the near cliff's shoulder (heights read from the same terrain function)
  const pines = useMemo(() => {
    const R = RANGES[0]
    const spots: [number, number, number, number][] = [
      [-0.55, 0.55, 0.62, -0.2],
      [-0.15, 0.75, 0.5, 0.25],
      [-1.4, 1.0, 0.42, -0.35],
      [1.85, 1.0, 0.48, 0.15],
    ]
    return spots.map(([x, z, s, lean]) => ({ p: [x + R.at[0], rangeHeight(R.R, x, z) - 0.04, z + R.at[2]] as [number, number, number], s, lean }))
  }, [])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t.current += dt
    // fit the painting into its slot: right of the copy on desktop, above it on phones, centred for posters
    const W = size.width
    const H = size.height
    const mobile = W < 760
    let r: { x: number; y: number; w: number; h: number }
    if (POSTER) r = { x: 0, y: 30, w: W, h: H - 40 }
    else if (mobile) r = { x: 0, y: 64, w: W, h: Math.max(280, H - 64 - 250) }
    else {
      const x0 = Math.max(W * 0.3, 400)
      r = { x: x0, y: 72, w: W - x0, h: H - 72 - 70 }
    }
    // the composition spans about 15 × 8.4 world units around (0.3, 3.4, -3)
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const bw = mobile ? 10.5 : 15
    const dH = (8.4 * H) / (r.h * 2 * tan)
    const dW = (bw * H) / (r.w * 2 * tan)
    const D = Math.max(dH, dW) * (POSTER ? 1.22 : 1)
    camera.position.set(mobile ? 1.2 : 0.3, 4.1, -3 + D)
    camera.lookAt(mobile ? 1.2 : 0.3, 3.4, -3)
    camera.setViewOffset(W, H, -(r.x + r.w / 2 - W / 2), -(r.y + r.h / 2 - H / 2), W, H)
    camera.far = 200
    camera.updateProjectionMatrix()
    // atmospheric perspective follows the camera distance
    setInkwashFog(fx, D - 1.5, D + 26, 1)
    if (spin.current) spin.current.rotation.y = (POSTER ? 0 : Math.sin(t.current * 0.08) * 0.06) + ry.get()
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#5f5c56', 0.2]} />
      <directionalLight position={[-10, 6.5, 5]} intensity={3.4} color="#fffaf0" />
      <directionalLight position={[6, 3, 4]} intensity={0.12} />
      <group ref={content} visible={ready}>
        <group ref={spin} position={[0, 0, -5]}>
          <group position={[0, 0, 5]}>
            {RANGES.map((r, i) => (
              <mesh key={i} geometry={geos[i]} position={r.at} material={i < 2 ? M.rock : M.rockFar} />
            ))}
            {pines.map((p, i) => (
              <Pine key={i} position={p.p} scale={p.s} lean={p.lean} M={M} />
            ))}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]} material={M.water}>
              <planeGeometry args={[600, 600]} />
            </mesh>
            <Boat t={t} M={M} />
            <Birds t={t} M={M} />
            <Mist position={[-1, 1.0, -4.2]} size={[22, 2.6]} speed={0.05} seed={1} opacity={0.85} />
            <Mist position={[2, 1.3, -12.5]} size={[34, 3.4]} speed={0.035} seed={2} opacity={0.9} />
            <Mist position={[0, 2.2, -24]} size={[60, 5]} speed={0.025} seed={3} opacity={0.8} />
          </group>
        </group>
      </group>
    </>
  )
}

function Progress({ fx, el }: { fx: StylizeEffect; el: React.RefObject<HTMLButtonElement | null> }) {
  useFrame(() => {
    const b = el.current
    if (!b) return
    const p = inkwashProgress(fx)
    b.style.setProperty('--p', p.toFixed(3))
    b.dataset.painting = p < 1 ? '1' : '0'
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function InkWash() {
  const [mode, setMode] = useState<InkwashMode>('xieyi')
  const [densI, setDensI] = useState(1)
  const fx = useMemo(() => {
    const f = createInkwashEffect()
    setInkwashMist(f, 0.55)
    settleInkwash(f)
    return f
  }, [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.6)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const paintBtn = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(POSTER)

  useEffect(() => setInkwashMode(fx, mode), [fx, mode])
  useEffect(() => setInkwashDensity(fx, DENSITY[densI].v), [fx, densI])
  const onReady = () => {
    setShown(true)
    if (!POSTER) paintInkwash(fx)
  }

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current || inkwashProgress(fx) < 1) return
      setMode((m) => inkwashModes[(inkwashModes.findIndex((o) => o.id === m) + 1) % inkwashModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [fx])
  const touch = () => (lastInput.current = performance.now())

  const ry = useMotionValue(0)
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
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.0012, -0.22, 0.22))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anim.current = animate(ry, ry.get(), {
      type: 'inertia',
      velocity: ry.getVelocity(),
      power: 0.35,
      timeConstant: 700,
      min: -0.22,
      max: 0.22,
      bounceStiffness: 120,
      bounceDamping: 18,
    })
  }

  const S = SPEC[mode]
  const label = inkwashModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage iw iw-${mode}${split.open ? ' iw-split' : ''}`}
      style={{ background: PAPER }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 4, 16], fov: 30, near: 0.5, far: 200 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={PAPER} preload={preload} />
        <Landscape ry={ry} fx={fx} onReady={onReady} />
        <Progress fx={fx} el={paintBtn} />
      </Canvas>

      {/* 题款 + 印章, in the painting's top-right corner */}
      <motion.div
        className="iw-colophon"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: shown ? 1 : 0 }}
        transition={{ duration: 1.2, delay: POSTER ? 0 : 1.4 }}
      >
        <div className="iw-title">溪山渔隐</div>
        <div className="iw-signcol">
        <div className="iw-sign">丙午秋日 写于云水间</div>
        <motion.div
          className="iw-seal"
          initial={{ scale: 1.5, opacity: 0, rotate: -8 }}
          animate={shown ? { scale: 1, opacity: 1, rotate: -2 } : {}}
          transition={{ delay: POSTER ? 0 : 2.6, type: 'spring', stiffness: 420, damping: 18 }}
        >
          <svg viewBox="0 0 40 40" width="100%" height="100%">
            <defs>
              <filter id="iw-rough" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
                <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.6" />
                <feComposite in="SourceGraphic" operator="in" />
              </filter>
            </defs>
            <g filter="url(#iw-rough)">
              <rect x="1.5" y="1.5" width="37" height="37" rx="2.5" fill="#b8322a" />
              <text x="28.5" y="18" className="iw-seal-ch">墨</text>
              <text x="28.5" y="35" className="iw-seal-ch">戏</text>
              <text x="11.5" y="18" className="iw-seal-ch">山</text>
              <text x="11.5" y="35" className="iw-seal-ch">人</text>
            </g>
          </svg>
        </motion.div>
        </div>
      </motion.div>

      <div className="overlay">
        <div className="hero-copy iw-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Ink Wash · 墨分五色
            </p>
            <h1>
              一点墨，
              <br />
              化开千山
            </h1>
            <p className="iw-sub">画面的明暗换成焦、浓、重、淡、清五种墨色，亮处直接留白。轮廓是一笔一笔写出来的：有粗有细，笔干处拉出飞白，湿笔在宣纸纤维里洇开；山越远，墨越淡越湿。</p>
            <div className="iw-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{S.tool}</b>
                  {S.note}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="iw-tones" aria-hidden>
              {TONES.map((c, i) => (
                <motion.span key={c.zh} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 + i * 0.07, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}>
                  <i style={{ background: c.v }} />
                  {c.zh}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock" onPointerDown={touch}>
          <Seg items={inkwashModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg iw-cycle" onClick={() => setDensI((d) => (d + 1) % DENSITY.length)}>
              <span>
                墨色 <b>{DENSITY[densI].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="iw-lab">墨色</span>
              <Seg items={DENSITY.map((d, i) => ({ value: i, label: d.zh }))} value={densI} onChange={setDensI} />
            </>
          )}
          <span className="dock-sep" />
          <button ref={paintBtn} className="seg iw-btn iw-paint" onClick={() => paintInkwash(fx)} aria-label="重新落墨">
            <span>
              <svg width="14" height="15" viewBox="0 0 14 16" aria-hidden>
                <path d="M6.2 1h1.6v6.2H6.2z" fill="currentColor" opacity=".55" />
                <path d="M4.6 7.2h4.8l.4 1.6c.5 2.4-.6 4.6-2.8 6.4-2.2-1.8-3.3-4-2.8-6.4Z" fill="currentColor" />
              </svg>
              落墨
            </span>
            <i className="iw-bar" />
          </button>
          <button className="seg iw-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="iw-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动看山的前后层次 · 闲置时自动换笔法</p>
      </div>
    </div>
  )
}

const css = `
.iw { cursor: grab; touch-action: none; }
.iw:active { cursor: grabbing; }
.iw canvas { display: block; }
.iw-copy { pointer-events: none !important; --soft-bg: ${PAPER}; }
.iw-copy .scrim { opacity: .8; transition: opacity .5s; }
.iw-split .iw-copy .scrim { opacity: .96; }
.iw-copy .kicker { color: #5d5850; }
.iw-copy .kicker i { background: #b8322a; }
.iw-copy h1 {
  font-size: clamp(38px, 4.4vw, 60px); color: #1d1b17; letter-spacing: .02em;
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif SC", "Source Han Serif SC", serif; font-weight: 700;
}
.iw-sub { max-width: 410px; color: #4b4740 !important; }
.iw-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: #4b4740; }
.iw-spec span { display: inline-flex; align-items: center; gap: 10px; }
.iw-spec b { font-weight: 600; color: #1d1b17; padding: 0 8px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(29, 27, 23, .3); font-family: var(--sans); }
.iw-tones { display: flex; gap: 14px; margin-top: 16px; font: 500 12px/1 var(--sans); color: #5d5850; }
.iw-tones span { display: inline-flex; align-items: center; gap: 6px; }
.iw-tones i { width: 14px; height: 14px; border-radius: 50%; display: block; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
.iw-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.iw-btn span, .iw-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.iw-btn svg { color: #1d1b17; }
.iw-cycle b { font-weight: 600; color: var(--fg); }
.iw-paint { overflow: hidden; }
.iw-bar {
  position: absolute; left: 12px; right: 12px; bottom: 5px; height: 2px; border-radius: 2px;
  background: #1d1b17; transform-origin: left; transform: scaleX(var(--p, 1)); opacity: 0; transition: opacity .3s;
}
.iw-paint[data-painting='1'] .iw-bar { opacity: .7; }
.iw .hint { color: #5d5850; padding: 4px 10px; border-radius: 999px; background: rgba(242, 237, 226, .78); transition: opacity .4s; }
.iw-split .hint { opacity: 0; }

.iw-colophon {
  position: absolute; top: 92px; right: clamp(28px, 5vw, 84px); z-index: 1; pointer-events: none;
  display: flex; flex-direction: row-reverse; align-items: flex-start; gap: 10px;
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "BiauKai", "楷体", "Songti SC", serif;
}
.iw-title { writing-mode: vertical-rl; font-size: 30px; letter-spacing: .22em; color: #1d1b17; opacity: .9; }
.iw-signcol { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-top: 46px; }
.iw-sign { writing-mode: vertical-rl; font-size: 14px; letter-spacing: .3em; color: #3b3832; opacity: .75; }
.iw-seal { width: 34px; height: 34px; opacity: .92; mix-blend-mode: multiply; }
.iw-seal-ch { font: 700 15px/1 "STKaiti", "KaiTi", "Kaiti SC", serif; fill: #f2ede2; text-anchor: middle; }
@media (max-width: 760px) {
  .iw-colophon { top: 80px; right: 16px; gap: 6px; }
  .iw-title { font-size: 21px; }
  .iw-signcol { margin-top: 112px; gap: 8px; }
  .iw-sign { display: none; }
  .iw-seal { width: 26px; height: 26px; }
  .iw-sub, .iw-tones { display: none; }
  .iw-copy h1 { font-size: 32px; }
  .iw-spec { margin-top: 10px; font-size: 11px; }
  .iw .dock .seg { padding: 0 8px; }
  .iw .dock .dock-sep { margin: 0 1px; }
  .iw-btn svg { display: none; }
  .iw-split .iw-copy { opacity: 0; }
}
.poster .iw-colophon { top: 40px; right: 56px; }
`
