import { useThree } from '@react-three/fiber'
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'

/**
 * Procedural "softbox" studio environment + stall-free start-up.
 *
 * drei's <Environment> converts its cube render to a PMREM on the first draw, which links the PMREM GGX/blur
 * programs synchronously (≈350 ms on ANGLE/D3D11). Here the PMREM programs and the scene's own programs are all
 * compiled with renderer.compileAsync (KHR_parallel_shader_compile) first; only then is the PMREM rendered and the
 * subject revealed, so no frame blocks on shader linking.
 */

export type Softbox = { pos: [number, number, number]; size: [number, number]; intensity: number; color?: string; ring?: boolean }

export const STUDIO: Softbox[] = [
  { pos: [0, 6, 3], size: [10, 3], intensity: 3 },
  { pos: [-6, 2, 4], size: [2, 8], intensity: 2.2 },
  { pos: [6, 2, 3], size: [2.5, 8], intensity: 1.6, color: '#e4ebff' },
  { pos: [0, 0, 8], size: [8, 1.4], intensity: 1.2 },
  { pos: [3, 3, -6], size: [2, 2], intensity: 1.6, color: '#ffe6d6', ring: true },
  { pos: [0, -6, 0], size: [14, 14], intensity: 0.6 },
]

function buildEnvScene(boxes: Softbox[]) {
  const s = new THREE.Scene()
  s.background = new THREE.Color('#000000')
  const plane = new THREE.PlaneGeometry(1, 1)
  const ring = new THREE.RingGeometry(0.42, 0.5, 48)
  for (const b of boxes) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color ?? '#ffffff').multiplyScalar(b.intensity), side: THREE.DoubleSide, toneMapped: false })
    const mesh = new THREE.Mesh(b.ring ? ring : plane, m)
    mesh.position.set(...b.pos)
    mesh.scale.set(b.size[0], b.size[1], 1)
    mesh.lookAt(0, 0, 0)
    s.add(mesh)
  }
  return s
}

type PmremInternals = {
  _setSize(n: number): void
  _allocateTargets(): THREE.WebGLRenderTarget
  _ggxMaterial: THREE.Material | null
  _blurMaterial: THREE.Material | null
  _lodMeshes: THREE.Mesh[]
}

/**
 * Hides `subject` until (1) the studio env map is ready and set as scene.environment and (2) every program in the
 * scene is compiled for the screen. Calls onReady once visible.
 */
export function useStudioStart(subject: RefObject<THREE.Object3D | null>, onReady: () => void, boxes: Softbox[] = STUDIO) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const obj = subject.current
    if (!obj) return
    obj.visible = false
    let dead = false
    let envRT: THREE.WebGLRenderTarget | null = null
    const pmrem = new THREE.PMREMGenerator(gl)
    const p = pmrem as unknown as PmremInternals
    const envScene = buildEnvScene(boxes)
    const flatCam = new THREE.OrthographicCamera()
    const offRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })

    // 1) compile the PMREM + env-scene programs off-screen, as the exact variants PMREM will use (the program key
    //    depends on the geometry's attributes, so reuse PMREM's own lod plane geometry and a box for the backdrop)
    p._setSize(256)
    p._allocateTargets().dispose()
    const tmp = new THREE.Scene()
    const lodGeo = p._lodMeshes[0].geometry
    for (const m of [p._ggxMaterial, p._blurMaterial]) if (m) tmp.add(new THREE.Mesh(lodGeo, m))
    const bgBox = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ name: 'PMREM.Background', side: THREE.BackSide, depthWrite: false, depthTest: false }),
    )
    tmp.add(bgBox)
    tmp.add(envScene)
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(offRT)
    const job = gl.compileAsync(tmp, flatCam)
    gl.setRenderTarget(prev)

    job
      .catch(() => {})
      .then(() => {
        if (dead) return
        tmp.remove(envScene)
        // 2) render the PMREM (its programs are linked by now) and light the scene with it
        envRT = pmrem.fromScene(envScene, 0, 0.1, 100)
        scene.environment = envRT.texture
        pmrem.dispose()
        // 3) compile the visible scene for the screen with that environment
        return gl.compileAsync(scene, camera)
      })
      .catch(() => {})
      .then(() => {
        if (dead) return
        obj.visible = true
        onReady()
      })
    return () => {
      dead = true
      if (scene.environment === envRT?.texture) scene.environment = null
      envRT?.dispose()
      offRT.dispose()
      pmrem.dispose()
      bgBox.geometry.dispose()
      bgBox.material.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])
}
