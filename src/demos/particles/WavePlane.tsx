import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { usePortraitScale } from '../../lib/fit'

/*
 * One particle grid, many parametrisations. Every particle keeps its (u, v) and the shader
 * evaluates the "from" and "to" surfaces for it, blending with a sweep that travels along u.
 * Because the parametrisations share (u, v), the plane visibly rolls, folds and unfolds.
 */

const SIDE = typeof window !== 'undefined' && window.innerWidth < 760 ? 150 : 230

const MODES = [
  { zh: '涟漪', en: 'Ripple', aside: 'y = sin(kd − ωt) · e^(−d)' },
  { zh: '干涉', en: 'Interference', aside: 'two point sources' },
  { zh: '螺旋面', en: 'Helicoid', aside: 'twisting ribbon' },
  { zh: '圆筒', en: 'Rolled Cylinder', aside: 'x = r·sin(πu)' },
  { zh: '球面', en: 'Folded Sphere', aside: 'lat = πv/2, lon = πu' },
  { zh: '环面', en: 'Torus', aside: 'R = 1.7, r = 0.75' },
]

const vert = /* glsl */ `
uniform float uTime;
uniform float uFrom;
uniform float uTo;
uniform float uProg;
uniform float uSize;
attribute vec2 aUv;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;

const float PI = 3.14159265;
const float R = 3.2;

vec3 surf(float m, vec2 uv, float t) {
  float u = uv.x, v = uv.y;
  if (m < 0.5) {
    float d = length(uv) * R;
    return vec3(u * R, sin(d * 2.4 - t * 2.2) * 0.32 * exp(-d * 0.25), v * R);
  } else if (m < 1.5) {
    vec2 p = uv * R;
    float d1 = length(p - vec2(-1.3, 0.0));
    float d2 = length(p - vec2(1.3, 0.0));
    return vec3(p.x, (sin(d1 * 4.2 - t * 2.6) + sin(d2 * 4.2 - t * 2.6)) * 0.12, p.y);
  } else if (m < 2.5) {
    float a = u * PI * 1.25 + t * 0.6;
    return vec3(u * R, v * 1.5 * sin(a), v * 1.5 * cos(a));
  } else if (m < 3.5) {
    float r = R / PI;
    float a = u * PI + t * 0.25;
    float wob = 1.0 + 0.06 * sin(v * 9.0 - t * 2.0);
    return vec3(sin(a) * r * 1.35 * wob, cos(a) * r * 1.35 * wob, v * R);
  } else if (m < 4.5) {
    float lat = v * PI * 0.5;
    float lon = u * PI + t * 0.25;
    float r = 2.05 + 0.05 * sin(lat * 10.0 + t * 2.0);
    return vec3(cos(lat) * sin(lon) * r, sin(lat) * r, cos(lat) * cos(lon) * r);
  }
  float a = u * PI + t * 0.2;
  float b = v * PI + t * 0.5;
  float rr = 1.7 + 0.75 * cos(b);
  return vec3(cos(a) * rr, 0.75 * sin(b), sin(a) * rr);
}

void main() {
  float sweep = (aUv.x * 0.5 + 0.5) * 0.45;
  float k = clamp((uProg - sweep) / 0.55, 0.0, 1.0);
  float e = k * k * (3.0 - 2.0 * k);
  vec3 p = mix(surf(uFrom, aUv, uTime), surf(uTo, aUv, uTime), e);
  float flight = sin(e * PI);
  p.y += flight * 0.25 * sin(aUv.x * 6.0 + uTime * 3.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.7 + aRand * 0.6) / -mv.z;
  float h = clamp(p.y * 0.9 + 0.5, 0.0, 1.0);
  vec3 deep = vec3(0.10, 0.36, 0.62);
  vec3 teal = vec3(0.25, 0.85, 0.78);
  vec3 crest = vec3(0.92, 1.0, 0.97);
  vColor = mix(mix(deep, teal, h), crest, smoothstep(0.75, 1.0, h) * 0.8 + flight * 0.25);
  vAlpha = mix(0.25, 1.0, smoothstep(-13.0, -5.5, mv.z));
}
`

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`

function Plane({ mode }: { mode: number }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const prog = useMotionValue(1)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const group = useRef<THREE.Group>(null)
  const scale = usePortraitScale(1.05)

  const geo = useMemo(() => {
    const n = SIDE * SIDE
    const g = new THREE.BufferGeometry()
    const uv = new Float32Array(n * 2)
    const r = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      uv[i * 2] = ((i % SIDE) / (SIDE - 1)) * 2 - 1
      uv[i * 2 + 1] = (Math.floor(i / SIDE) / (SIDE - 1)) * 2 - 1
      r[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('aRand', new THREE.BufferAttribute(r, 1))
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
        uniforms: { uTime: { value: 0 }, uFrom: { value: 0 }, uTo: { value: 0 }, uProg: { value: 1 }, uSize: { value: 30 } },
      }),
    [],
  )

  useEffect(() => {
    const u = mat.uniforms
    if (u.uTo.value === mode) return
    // if we're interrupted mid-flight, start from wherever the majority currently is
    u.uFrom.value = prog.get() > 0.5 ? u.uTo.value : u.uFrom.value
    u.uTo.value = mode
    anim.current?.stop()
    prog.set(0)
    anim.current = animate(prog, 1, { duration: 2.4, ease: 'linear' })
  }, [mode, mat, prog])

  useFrame((s, dt) => {
    mat.uniforms.uTime.value = s.clock.elapsedTime
    mat.uniforms.uProg.value = prog.get()
    mat.uniforms.uSize.value = 26 * dpr * (s.size.height / 900)
    const g = group.current
    if (g) {
      g.rotation.y += dt * 0.08
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, 0.42 - s.pointer.y * 0.2, 2, dt)
    }
  })

  return (
    <group ref={group} scale={scale}>
      <points geometry={geo} material={mat} frustumCulled={false} />
    </group>
  )
}

export default function WavePlane() {
  const [mode, setMode] = useState(0)
  const [auto, setAuto] = useState(true)

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setMode((m) => (m + 1) % MODES.length), 5600)
    return () => clearInterval(id)
  }, [auto])

  const m = MODES[mode]
  return (
    <div className="stage" style={{ background: 'radial-gradient(100% 80% at 50% 40%, #0c2230 0%, #050c12 75%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 8], fov: 42 }} gl={{ antialias: false, alpha: true }}>
        <Plane mode={mode} />
      </Canvas>
      <div className="overlay">
        <BigLabel
          id={String(mode)}
          meta={`${String(mode + 1).padStart(2, '0')} / ${String(MODES.length).padStart(2, '0')} · ${(SIDE * SIDE).toLocaleString()} particles · one (u, v) grid`}
          title={m.zh}
          sub={m.en}
          aside={m.aside}
        />
        <div className="dock">
          <Seg
            items={MODES.map((x, i) => ({ value: i, label: x.zh }))}
            value={mode}
            onChange={(v) => {
              setMode(v)
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
