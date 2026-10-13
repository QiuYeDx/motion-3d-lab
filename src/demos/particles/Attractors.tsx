import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'

type Vec = [number, number, number]
type Attractor = {
  zh: string
  en: string
  eq: string
  dt: number
  f: (x: number, y: number, z: number, out: Vec) => void
  /** attractor space → world */
  map: (x: number, y: number, z: number, out: Vec) => void
  seed: Vec
  cool: string
  hot: string
}

const ATTRACTORS: Attractor[] = [
  {
    zh: '洛伦兹',
    en: 'Lorenz',
    eq: 'σ=10  ρ=28  β=8/3',
    dt: 0.0045,
    f: (x, y, z, o) => {
      o[0] = 10 * (y - x)
      o[1] = x * (28 - z) - y
      o[2] = x * y - (8 / 3) * z
    },
    map: (x, y, z, o) => {
      o[0] = x * 0.085
      o[1] = (z - 25) * 0.085
      o[2] = y * 0.085
    },
    seed: [0.1, 0, 0],
    cool: '#f2c46d',
    hot: '#ff5f7a',
  },
  {
    zh: '相泽',
    en: 'Aizawa',
    eq: 'a=.95 b=.7 c=.6 d=3.5',
    dt: 0.012,
    f: (x, y, z, o) => {
      o[0] = (z - 0.7) * x - 3.5 * y
      o[1] = 3.5 * x + (z - 0.7) * y
      o[2] = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x
    },
    map: (x, y, z, o) => {
      o[0] = x * 1.45
      o[1] = (z - 0.6) * 1.45
      o[2] = y * 1.45
    },
    seed: [0.1, 0, 0],
    cool: '#6bd2ff',
    hot: '#d9a6ff',
  },
  {
    zh: '托马斯',
    en: 'Thomas',
    eq: "x' = sin y − bx,  b=0.208",
    dt: 0.06,
    f: (x, y, z, o) => {
      const b = 0.208186
      o[0] = Math.sin(y) - b * x
      o[1] = Math.sin(z) - b * y
      o[2] = Math.sin(x) - b * z
    },
    map: (x, y, z, o) => {
      o[0] = x * 0.48
      o[1] = y * 0.48
      o[2] = z * 0.48
    },
    seed: [0.1, 0.3, 0.2],
    cool: '#8be0a4',
    hot: '#f2f08b',
  },
  {
    zh: '哈尔沃森',
    en: 'Halvorsen',
    eq: 'a = 1.89',
    dt: 0.005,
    f: (x, y, z, o) => {
      const a = 1.89
      o[0] = -a * x - 4 * y - 4 * z - y * y
      o[1] = -a * y - 4 * z - 4 * x - z * z
      o[2] = -a * z - 4 * x - 4 * y - x * x
    },
    map: (x, y, z, o) => {
      o[0] = (x + 2.5) * 0.36
      o[1] = (y + 2.5) * 0.36
      o[2] = (z + 2.5) * 0.36
    },
    seed: [-1.48, -1.51, 2.04],
    cool: '#ff9a6b',
    hot: '#ffe9c9',
  },
  {
    zh: '若斯勒',
    en: 'Rössler',
    eq: 'a=.2  b=.2  c=5.7',
    dt: 0.03,
    f: (x, y, z, o) => {
      o[0] = -y - z
      o[1] = x + 0.2 * y
      o[2] = 0.2 + z * (x - 5.7)
    },
    map: (x, y, z, o) => {
      o[0] = x * 0.2
      o[1] = (z - 4) * 0.12
      o[2] = y * 0.2
    },
    seed: [1, 1, 0],
    cool: '#7a8cff',
    hot: '#ff7bd5',
  },
]

const N = typeof window !== 'undefined' && window.innerWidth < 760 ? 9000 : 18000

/** particles spread along a long trajectory, so they start on the attractor */
function seedStates(a: Attractor) {
  const s = new Float32Array(N * 3)
  const d: Vec = [0, 0, 0]
  let [x, y, z] = a.seed
  for (let i = 0; i < 3000; i++) {
    a.f(x, y, z, d)
    x += d[0] * a.dt
    y += d[1] * a.dt
    z += d[2] * a.dt
  }
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 6; k++) {
      a.f(x, y, z, d)
      x += d[0] * a.dt
      y += d[1] * a.dt
      z += d[2] * a.dt
    }
    const j = Math.random() * 0.02
    s[i * 3] = x + j
    s[i * 3 + 1] = y + j
    s[i * 3 + 2] = z + j
  }
  return s
}

function step(a: Attractor, s: Float32Array, speed: Float32Array | null, dtScale: number) {
  const d: Vec = [0, 0, 0]
  const m: Vec = [0, 0, 0]
  const h = a.dt * dtScale
  for (let i = 0; i < N; i++) {
    const x = s[i * 3]
    const y = s[i * 3 + 1]
    const z = s[i * 3 + 2]
    // midpoint (RK2)
    a.f(x, y, z, d)
    a.f(x + d[0] * h * 0.5, y + d[1] * h * 0.5, z + d[2] * h * 0.5, m)
    s[i * 3] = x + m[0] * h
    s[i * 3 + 1] = y + m[1] * h
    s[i * 3 + 2] = z + m[2] * h
    if (speed) speed[i] = Math.hypot(m[0], m[1], m[2])
  }
}

const vert = /* glsl */ `
uniform float uSize;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize / -mv.z;
  vColor = color;
}
`
const frag = /* glsl */ `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * a * a, a);
}
`

function Swarm({ idx }: { idx: number }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const fit = usePortraitScale()
  const cur = useRef({ a: ATTRACTORS[idx], s: seedStates(ATTRACTORS[idx]) })
  const prev = useRef<{ a: Attractor; s: Float32Array } | null>(null)
  const blend = useRef(1)
  const speed = useMemo(() => new Float32Array(N), [])
  const cool = useMemo(() => new THREE.Color(), [])
  const hot = useMemo(() => new THREE.Color(), [])
  const tmp = useMemo(() => new THREE.Color(), [])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uSize: { value: 20 } },
      }),
    [],
  )

  useEffect(() => {
    if (cur.current.a === ATTRACTORS[idx]) return
    prev.current = cur.current
    cur.current = { a: ATTRACTORS[idx], s: seedStates(ATTRACTORS[idx]) }
    blend.current = 0
  }, [idx])

  useFrame((st, dt) => {
    const scale = Math.min(dt, 1 / 30) * 60
    const c = cur.current
    step(c.a, c.s, speed, scale)
    if (prev.current) step(prev.current.a, prev.current.s, null, scale)
    blend.current = Math.min(1, blend.current + dt / 2.4)
    const b = blend.current
    if (b >= 1) prev.current = null

    const pos = geo.attributes.position.array as Float32Array
    const col = geo.attributes.color.array as Float32Array
    const o: Vec = [0, 0, 0]
    const q: Vec = [0, 0, 0]
    cool.set(c.a.cool)
    hot.set(c.a.hot)
    let vmax = 0
    for (let i = 0; i < N; i += 7) vmax = Math.max(vmax, speed[i])
    for (let i = 0; i < N; i++) {
      c.a.map(c.s[i * 3], c.s[i * 3 + 1], c.s[i * 3 + 2], o)
      if (prev.current) {
        // staggered hand-over: each particle leaves the old orbit at its own moment
        const k = THREE.MathUtils.clamp((b - (i / N) * 0.5) / 0.5, 0, 1)
        const e = k * k * (3 - 2 * k)
        const p = prev.current
        p.a.map(p.s[i * 3], p.s[i * 3 + 1], p.s[i * 3 + 2], q)
        const lift = Math.sin(e * Math.PI) * 0.6
        o[0] = q[0] + (o[0] - q[0]) * e
        o[1] = q[1] + (o[1] - q[1]) * e + lift * ((i % 13) / 13 - 0.5)
        o[2] = q[2] + (o[2] - q[2]) * e
      }
      pos[i * 3] = o[0]
      pos[i * 3 + 1] = o[1]
      pos[i * 3 + 2] = o[2]
      tmp.copy(cool).lerp(hot, Math.min(1, speed[i] / (vmax || 1)) ** 1.5)
      col[i * 3] = tmp.r * 0.75
      col[i * 3 + 1] = tmp.g * 0.75
      col[i * 3 + 2] = tmp.b * 0.75
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    mat.uniforms.uSize.value = 28 * dpr * (st.size.height / 900)
  })

  return <points geometry={geo} material={mat} frustumCulled={false} scale={fit} />
}

export default function Attractors() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % ATTRACTORS.length), 7000)
    return () => clearInterval(id)
  }, [auto])
  const a = ATTRACTORS[idx]
  return (
    <div className="stage" style={{ background: 'radial-gradient(90% 75% at 50% 45%, #1a1520 0%, #09080c 72%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 7.5], fov: 45 }} gl={{ antialias: false, alpha: true }}>
        <Swarm idx={idx} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} enableDamping />
      </Canvas>
      <div className="overlay">
        <BigLabel id={String(idx)} meta={`${N.toLocaleString()} particles · RK2 · integrated live`} title={a.zh} sub={a.en} aside={a.eq} />
        <div className="dock">
          <Seg
            items={ATTRACTORS.map((x, i) => ({ value: i, label: x.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((x) => !x)}>
            <span>{auto ? '暂停' : '播放'}</span>
          </button>
        </div>
        <p className="hint">拖动旋转视角</p>
      </div>
    </div>
  )
}
