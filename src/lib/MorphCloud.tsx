import { useFrame, useThree } from '@react-three/fiber'
import { animate, useMotionValue, type AnimationPlaybackControls } from 'motion/react'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'

export type MorphCloudHandle = {
  morphTo: (next: Float32Array, opts?: { duration?: number; scatter?: number }) => void
  points: THREE.Points | null
}

const vert = /* glsl */ `
uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uScatter;
uniform float uStagger;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
attribute vec3 aTo;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;

vec3 swirl(vec3 p, float t) {
  return vec3(
    sin(p.y * 1.9 + t) + sin(p.z * 1.3 - t * 0.7),
    sin(p.z * 1.7 + t * 1.1) + sin(p.x * 1.1 + t * 0.6),
    sin(p.x * 1.5 - t * 0.9) + sin(p.y * 1.2 + t * 0.8)
  );
}

void main() {
  float delay = aRand.x * uStagger;
  float k = clamp((uProgress - delay) / (1.0 - uStagger), 0.0, 1.0);
  float e = k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0;
  vec3 p = mix(position, aTo, e);
  float mid = sin(e * 3.14159265);
  p += swirl(p * 0.8, uTime * 0.6 + aRand.y * 6.2831) * mid * uScatter * (0.35 + aRand.z * 0.5);
  p += swirl(p * 1.3 + aRand.xyz, uTime * 0.5) * 0.018;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.5 + aRand.w * 0.9) * (1.0 + mid * 0.5) / -mv.z;
  float rim = smoothstep(1.2, 2.8, length(p));
  vColor = mix(mix(uColA, uColB, aRand.y), uColC, clamp(mid * 0.8 + rim * 0.35, 0.0, 1.0));
  vAlpha = (0.45 + aRand.z * 0.55) * mix(0.3, 1.0, smoothstep(-11.0, -6.0, mv.z));
}
`

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor * a * vAlpha * 1.7, a * vAlpha);
}
`

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

type Props = {
  count: number
  initial: Float32Array
  colors?: [string, string, string]
  size?: number
  stagger?: number
}

/**
 * A point cloud that morphs between target arrays on the GPU. Progress is a Motion value, so
 * timing/easing lives in Motion while the per-particle stagger & swirl live in the shader.
 */
export const MorphCloud = forwardRef<MorphCloudHandle, Props>(function MorphCloud(
  { count, initial, colors = ['#6b8cff', '#b48cff', '#ffffff'], size = 26, stagger = 0.45 },
  ref,
) {
  const dpr = useThree((s) => s.viewport.dpr)
  const pts = useRef<THREE.Points>(null)
  const progress = useMotionValue(1)
  const anim = useRef<AnimationPlaybackControls | null>(null)

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const from = new Float32Array(count * 3)
    from.set(initial.subarray(0, count * 3))
    const to = from.slice()
    const rand = new Float32Array(count * 4)
    for (let i = 0; i < rand.length; i++) rand[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(from, 3))
    g.setAttribute('aTo', new THREE.BufferAttribute(to, 3))
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: 1 },
          uTime: { value: 0 },
          uSize: { value: size },
          uScatter: { value: 1 },
          uStagger: { value: stagger },
          uColA: { value: new THREE.Color(colors[0]) },
          uColB: { value: new THREE.Color(colors[1]) },
          uColC: { value: new THREE.Color(colors[2]) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // colours can change between morphs; damp towards the requested palette
  const targetCols = useMemo(() => colors.map((c) => new THREE.Color(c)), [colors[0], colors[1], colors[2]])

  useFrame((state, dt) => {
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uProgress.value = progress.get()
    u.uSize.value = size * dpr * (state.size.height / 900)
    const a = 1 - Math.exp(-dt * 3)
    ;(u.uColA.value as THREE.Color).lerp(targetCols[0], a)
    ;(u.uColB.value as THREE.Color).lerp(targetCols[1], a)
    ;(u.uColC.value as THREE.Color).lerp(targetCols[2], a)
  })

  useImperativeHandle(
    ref,
    () => ({
      get points() {
        return pts.current
      },
      morphTo(next, opts = {}) {
        const from = geometry.attributes.position as THREE.BufferAttribute
        const to = geometry.attributes.aTo as THREE.BufferAttribute
        const rand = geometry.attributes.aRand as THREE.BufferAttribute
        const f = from.array as Float32Array
        const t = to.array as Float32Array
        const r = rand.array as Float32Array
        const p = progress.get()
        // bake the current (possibly mid-flight) state into `from`
        if (p < 1) {
          for (let i = 0; i < count; i++) {
            const k = Math.min(1, Math.max(0, (p - r[i * 4] * stagger) / (1 - stagger)))
            const e = ease(k)
            for (let c = 0; c < 3; c++) f[i * 3 + c] += (t[i * 3 + c] - f[i * 3 + c]) * e
          }
        } else {
          f.set(t)
        }
        t.set(next.subarray(0, count * 3))
        from.needsUpdate = true
        to.needsUpdate = true
        material.uniforms.uScatter.value = opts.scatter ?? 1
        anim.current?.stop()
        progress.set(0)
        anim.current = animate(progress, 1, { duration: opts.duration ?? 2.6, ease: 'linear' })
      },
    }),
    [geometry, material, count, progress, stagger],
  )

  return <points ref={pts} geometry={geometry} material={material} frustumCulled={false} />
})
