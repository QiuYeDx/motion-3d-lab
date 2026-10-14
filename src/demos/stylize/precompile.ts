import { useThree } from '@react-three/fiber'
import { useEffect, useState, type RefObject } from 'react'
import * as THREE from 'three'

/**
 * Keeps a group hidden until every material in it has been compiled in the background
 * (renderer.compileAsync → KHR_parallel_shader_compile), so the first frame that draws it doesn't block on
 * shader linking. The programs are compiled for an off-screen float target, because that is where <Stylize>
 * renders the scene (linear output, no tone mapping — a different program from the on-screen variant).
 * Lights must live outside the group (they are taken from the whole scene).
 */
export function usePrecompiled(group: RefObject<THREE.Object3D | null>, onReady?: () => void) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const g = group.current
    if (!g) return
    let dead = false
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(rt)
    const job = gl.compileAsync(g, camera, scene)
    gl.setRenderTarget(prev)
    job
      .catch(() => {})
      .then(() => {
        rt.dispose()
        if (dead) return
        setReady(true)
        onReady?.()
      })
    return () => {
      dead = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])
  return ready
}
