import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { stepRig, wellPoint, type Rig } from './millionRig'
import { GLSL_BG_FRAG, GLSL_BG_VERT, GLSL_POINT_FRAG, GLSL_POINT_VERT, GLSL_POS, GLSL_VEL } from './millionShaders'

/** WebGL fallback: same four fields + gravity well, ping-ponged through GPUComputationRenderer (size² particles). */
function Sim({ size, rig, onStats }: { size: number; rig: Rig; onStats: (fps: number) => void }) {
  const gl = useThree((s) => s.gl)
  const dpr = useThree((s) => s.viewport.dpr)

  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(size, size, gl)
    if (!gl.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType)
    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    const pa = pos0.image.data as Float32Array
    for (let i = 0; i < pa.length; i += 4) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const r = 3.4 * Math.pow(Math.random(), 0.4)
      pa[i] = Math.sin(ph) * Math.cos(th) * r
      pa[i + 1] = Math.cos(ph) * r * 0.8
      pa[i + 2] = Math.sin(ph) * Math.sin(th) * r
      pa[i + 3] = Math.random() * 6
    }
    const velVar = gpu.addVariable('textureVelocity', GLSL_VEL, vel0)
    const posVar = gpu.addVariable('texturePosition', GLSL_POS, pos0)
    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])
    Object.assign(velVar.material.uniforms, {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uW: { value: new THREE.Vector4(1, 0, 0, 0) },
      uWell: { value: new THREE.Vector4() },
      uAxis: { value: new THREE.Vector3(0, 0, -1) },
    })
    Object.assign(posVar.material.uniforms, { uDt: { value: 0 }, uTime: { value: 0 } })
    const err = gpu.init()
    if (err) console.error(err)
    return { gpu, velVar, posVar }
  }, [gl, size])
  useEffect(() => () => sim.gpu.dispose(), [sim])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const ref = new Float32Array(size * size * 3)
    for (let i = 0; i < size * size; i++) {
      ref[i * 3] = ((i % size) + 0.5) / size
      ref[i * 3 + 1] = (Math.floor(i / size) + 0.5) / size
    }
    g.setAttribute('position', new THREE.BufferAttribute(ref, 3))
    return g
  }, [size])
  useEffect(() => () => geo.dispose(), [geo])

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLSL_POINT_VERT,
        fragmentShader: GLSL_POINT_FRAG,
        uniforms: { tPos: { value: null }, tVel: { value: null }, uSize: { value: 30 }, uSpeedNorm: { value: 3.6 }, uIntensity: { value: 0.16 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )
  const bgMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: GLSL_BG_VERT, fragmentShader: GLSL_BG_FRAG, uniforms: { uRes: { value: new THREE.Vector2(1, 1) } }, depthWrite: false, depthTest: false }),
    [],
  )
  useEffect(
    () => () => {
      mat.dispose()
      bgMat.dispose()
    },
    [mat, bgMat],
  )

  const tmp = useMemo(() => ({ well: new THREE.Vector3(), axis: new THREE.Vector3(), time: 0, acc: 0, n: 0, t0: 0 }), [])

  useFrame((state, raw) => {
    const dt = Math.min(raw, 1 / 30)
    tmp.time += dt
    tmp.acc += raw
    tmp.n++
    const now = performance.now()
    if (now - tmp.t0 > 500) {
      onStats(tmp.n / Math.max(tmp.acc, 1e-3))
      tmp.acc = 0
      tmp.n = 0
      tmp.t0 = now
    }
    const cam = state.camera as THREE.PerspectiveCamera
    stepRig(rig, cam, state.size.width, state.size.height, dt)
    wellPoint(rig, cam, tmp.well, tmp.axis)

    const vu = sim.velVar.material.uniforms
    vu.uDt.value = dt
    vu.uTime.value = tmp.time
    ;(vu.uW.value as THREE.Vector4).fromArray(rig.weights())
    const w = rig.weights()
    ;(vu.uWell.value as THREE.Vector4).set(tmp.well.x, tmp.well.y, tmp.well.z, rig.well * (w[0] * 1.8 + w[1] * 1.5 + w[2] * 1.2 + w[3]))
    ;(vu.uAxis.value as THREE.Vector3).copy(tmp.axis)
    const pu = sim.posVar.material.uniforms
    pu.uDt.value = dt
    pu.uTime.value = tmp.time
    sim.gpu.compute()

    mat.uniforms.tPos.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    mat.uniforms.tVel.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
    mat.uniforms.uSpeedNorm.value = w[0] * 6.4 + w[1] * 2.1 + w[2] * 3.2 + w[3] * 2.4
    mat.uniforms.uSize.value = 26 * dpr
    ;(bgMat.uniforms.uRes.value as THREE.Vector2).set(state.size.width, state.size.height)
  })

  return (
    <>
      <mesh material={bgMat} renderOrder={-1} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <points geometry={geo} material={mat} frustumCulled={false} />
    </>
  )
}

export default function MillionFallback({ size, rig, onStats }: { size: number; rig: Rig; onStats: (fps: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 11], fov: 40 }} gl={{ antialias: false, alpha: false }}>
        <Sim size={size} rig={rig} onStats={onStats} />
      </Canvas>
    </div>
  )
}
