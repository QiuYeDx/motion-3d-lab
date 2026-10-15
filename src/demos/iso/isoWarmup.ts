import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Shared by the iso park / seasons demos.
 *
 * Takes over rendering (useFrame priority 1) and keeps the canvas clear until every material in the scene has been
 * compiled in the background against the SCREEN target (renderer.compileAsync → KHR_parallel_shader_compile), so
 * the first visible frame does not block on shader linking. Everything that will ever be drawn must be mounted
 * (it may be invisible / zero-scaled) when the scene mounts, and lights must not be added later.
 * Use with `<Canvas shadows="percentage">` so the shadow defines do not change after the first shadow render.
 */
export function useScreenWarmup(onReady?: () => void) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const ready = useRef(false)
  const cb = useRef(onReady)
  cb.current = onReady

  useEffect(() => {
    let dead = false
    // wait one frame so every child has mounted and run its layout effects
    const raf = requestAnimationFrame(() => {
      if (dead) return
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(null)
      const job = gl.compileAsync(scene, camera)
      gl.setRenderTarget(prev)
      job
        .catch(() => {})
        .then(() => {
          if (dead) return
          ready.current = true
          cb.current?.()
        })
    })
    return () => {
      dead = true
      cancelAnimationFrame(raf)
    }
  }, [gl, scene, camera])

  useFrame(() => {
    if (!ready.current) {
      gl.setRenderTarget(null)
      gl.clear(true, true, false)
      return
    }
    gl.render(scene, camera)
  }, 1)

  return ready
}

/* ------------------------------------------------------------------ additive glow billboards
   Instanced camera-facing quads with a soft radial falloff. Blending adds colour but leaves the destination alpha
   untouched, so it composites correctly on a transparent (alpha: true) canvas over a CSS background. */
const glowVert = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  c.xy += position.xy * uSize * s;
  gl_Position = projectionMatrix * c;
}`
const glowFrag = /* glsl */ `
uniform float uIntensity;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = exp(-d * d * 5.5) * (1.0 - smoothstep(0.85, 1.0, d));
  float core = exp(-d * d * 40.0);
  vec3 col = vCol * uTint * (a + core * 0.9) * uIntensity;
  gl_FragColor = vec4(col, 1.0);
}`

export function createGlowMaterial(size = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uSize: { value: size }, uIntensity: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: glowVert,
    fragmentShader: glowFrag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  })
}

export const quadGeo = new THREE.PlaneGeometry(1, 1)

/* ------------------------------------------------------------------ soft round dots (snow, smoke)
   Instanced camera-facing quads, normal alpha blending; per-instance alpha comes from the `aAlpha` attribute of the
   geometry returned by createDotGeometry(n). */
const dotVert = /* glsl */ `
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  vUv = uv;
  vA = aAlpha;
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
  c.xy += position.xy * s;
  gl_Position = projectionMatrix * c;
}`
const dotFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uSoft;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = (1.0 - smoothstep(1.0 - uSoft, 1.0, d)) * vA * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * uColor, a);
  #include <colorspace_fragment>
}`
export function createDotMaterial(color = '#ffffff', soft = 0.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uSoft: { value: soft } },
    vertexShader: dotVert,
    fragmentShader: dotFrag,
    transparent: true,
    depthWrite: false,
  })
}
export function createDotGeometry(n: number) {
  const g = quadGeo.clone()
  g.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(n), 1))
  return g
}
