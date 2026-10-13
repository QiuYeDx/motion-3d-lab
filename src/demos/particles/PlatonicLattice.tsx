import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'

const MAX_EDGES = 30

type Solid = { zh: string; en: string; faces: string; make: () => THREE.BufferGeometry; dual: number }
const SOLIDS: Solid[] = [
  { zh: '正四面体', en: 'Tetrahedron', faces: 'V4 · E6 · F4', make: () => new THREE.TetrahedronGeometry(1), dual: 0 },
  { zh: '立方体', en: 'Cube', faces: 'V8 · E12 · F6', make: () => new THREE.BoxGeometry(1, 1, 1), dual: 2 },
  { zh: '正八面体', en: 'Octahedron', faces: 'V6 · E12 · F8', make: () => new THREE.OctahedronGeometry(1), dual: 1 },
  { zh: '正十二面体', en: 'Dodecahedron', faces: 'V20 · E30 · F12', make: () => new THREE.DodecahedronGeometry(1), dual: 4 },
  { zh: '正二十面体', en: 'Icosahedron', faces: 'V12 · E30 · F20', make: () => new THREE.IcosahedronGeometry(1), dual: 3 },
]

/** unique edges of a solid, normalised to unit circumradius */
function edgesOf(s: Solid) {
  const eg = new THREE.EdgesGeometry(s.make(), 1)
  const p = eg.attributes.position.array as Float32Array
  let max = 0
  for (let i = 0; i < p.length; i += 3) max = Math.max(max, Math.hypot(p[i], p[i + 1], p[i + 2]))
  const a: THREE.Vector3[] = []
  const b: THREE.Vector3[] = []
  for (let i = 0; i < p.length; i += 6) {
    a.push(new THREE.Vector3(p[i], p[i + 1], p[i + 2]).divideScalar(max))
    b.push(new THREE.Vector3(p[i + 3], p[i + 4], p[i + 5]).divideScalar(max))
  }
  while (a.length < MAX_EDGES) {
    a.push(new THREE.Vector3())
    b.push(new THREE.Vector3())
  }
  return { a, b, n: p.length / 6 }
}

const EDGES = SOLIDS.map(edgesOf)

const vert = /* glsl */ `
#define MAX_EDGES ${MAX_EDGES}
uniform vec3 uA0[MAX_EDGES];
uniform vec3 uA1[MAX_EDGES];
uniform vec3 uB0[MAX_EDGES];
uniform vec3 uB1[MAX_EDGES];
uniform float uNA;
uniform float uNB;
uniform float uProg;
uniform float uTime;
uniform float uSize;
uniform float uScale;
uniform vec3 uColA;
uniform vec3 uColB;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;

vec3 onEdge(vec3 a, vec3 b, float t) { return mix(a, b, t); }

void main() {
  // most particles stream along an edge, a few sit on the vertices as glowing nodes
  bool node = aRand.z < 0.07;
  float t = node ? step(0.5, aRand.w) : fract(aRand.y + uTime * (0.05 + aRand.w * 0.09));
  int ia = int(floor(aRand.x * uNA));
  int ib = int(floor(aRand.x * uNB));
  vec3 pa = onEdge(uA0[ia], uA1[ia], t);
  vec3 pb = onEdge(uB0[ib], uB1[ib], t);
  float delay = aRand.x * 0.4;
  float k = clamp((uProg - delay) / 0.6, 0.0, 1.0);
  float e = k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0;
  vec3 p = mix(pa, pb, e);
  float flight = sin(e * 3.14159);
  p *= 1.0 + flight * 0.35 * (aRand.w - 0.3);
  p += (node ? 0.012 : 0.006) * vec3(sin(aRand.y * 90.0), cos(aRand.w * 70.0), sin(aRand.x * 50.0));
  p *= uScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (node ? 2.4 : 0.6 + aRand.w * 0.7) / -mv.z;
  vColor = mix(uColA, uColB, node ? 1.0 : t * 0.6 + flight * 0.4);
  vAlpha = (node ? 0.9 : 0.55) * mix(0.35, 1.0, smoothstep(-11.0, -6.0, mv.z));
}
`

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`

function Lattice({ solid, count, scale, spin, colors }: { solid: number; count: number; scale: number; spin: number; colors: [string, string] }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const prog = useMotionValue(1)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const ref = useRef<THREE.Points>(null)
  const current = useRef(solid)

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const r = new Float32Array(count * 4)
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 0.9999
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(r, 4))
    return g
  }, [count])

  const mat = useMemo(() => {
    const e = EDGES[solid]
    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uA0: { value: e.a.map((v) => v.clone()) },
        uA1: { value: e.b.map((v) => v.clone()) },
        uB0: { value: e.a.map((v) => v.clone()) },
        uB1: { value: e.b.map((v) => v.clone()) },
        uNA: { value: e.n },
        uNB: { value: e.n },
        uProg: { value: 1 },
        uTime: { value: 0 },
        uSize: { value: 30 },
        uScale: { value: scale },
        uColA: { value: new THREE.Color(colors[0]) },
        uColB: { value: new THREE.Color(colors[1]) },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (current.current === solid) return
    const u = mat.uniforms
    // the old target becomes the new source
    const from = EDGES[current.current]
    const to = EDGES[solid]
    ;(u.uA0.value as THREE.Vector3[]).forEach((v, i) => v.copy(from.a[i]))
    ;(u.uA1.value as THREE.Vector3[]).forEach((v, i) => v.copy(from.b[i]))
    ;(u.uB0.value as THREE.Vector3[]).forEach((v, i) => v.copy(to.a[i]))
    ;(u.uB1.value as THREE.Vector3[]).forEach((v, i) => v.copy(to.b[i]))
    u.uNA.value = from.n
    u.uNB.value = to.n
    current.current = solid
    anim.current?.stop()
    prog.set(0)
    anim.current = animate(prog, 1, { duration: 2.2, ease: 'linear' })
  }, [solid, mat, prog])

  useFrame((s, dt) => {
    const u = mat.uniforms
    u.uTime.value = s.clock.elapsedTime
    u.uProg.value = prog.get()
    u.uSize.value = 40 * dpr * (s.size.height / 900)
    if (ref.current) {
      ref.current.rotation.y += dt * spin
      ref.current.rotation.x += dt * spin * 0.37
    }
  })

  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />
}

function Tilt({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const scale = usePortraitScale()
  useFrame((s, dt) => {
    if (!g.current) return
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -s.pointer.y * 0.35, 2, dt)
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, s.pointer.x * 0.45, 2, dt)
  })
  return (
    <group ref={g} scale={scale}>
      {children}
    </group>
  )
}

export default function PlatonicLattice() {
  const [idx, setIdx] = useState(0)
  const [auto, setAuto] = useState(true)
  const mobile = typeof window !== 'undefined' && window.innerWidth < 760

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIdx((i) => (i + 1) % SOLIDS.length), 4800)
    return () => clearInterval(id)
  }, [auto])

  const s = SOLIDS[idx]
  return (
    <div className="stage" style={{ background: 'radial-gradient(90% 75% at 50% 45%, #22141f 0%, #0d080e 72%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8.5], fov: 42 }} gl={{ antialias: false, alpha: true }}>
        <Tilt>
          <Lattice solid={idx} count={mobile ? 14000 : 26000} scale={2.4} spin={0.16} colors={['#ff7a4f', '#ffe2b8']} />
          <Lattice solid={s.dual} count={mobile ? 5000 : 9000} scale={1.05} spin={-0.3} colors={['#7a6bff', '#d8d2ff']} />
        </Tilt>
      </Canvas>
      <div className="overlay">
        <BigLabel
          id={String(idx)}
          meta={`${String(idx + 1).padStart(2, '0')} / 05 · outer + dual inside`}
          title={s.zh}
          sub={`${s.en} ↔ ${SOLIDS[s.dual].en}`}
          aside={s.faces}
        />
        <div className="dock">
          <Seg
            items={SOLIDS.map((x, i) => ({ value: i, label: x.zh }))}
            value={idx}
            onChange={(v) => {
              setIdx(v)
              setAuto(false)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '播放'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
