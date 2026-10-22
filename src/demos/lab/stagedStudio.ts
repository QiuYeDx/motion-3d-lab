import { useThree } from '@react-three/fiber'
import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'
import { STUDIO, type Softbox } from './studioEnv'

/**
 * Like `useStudioStart` (studioEnv.ts) — procedural softbox PMREM + async shader compile before the subject is
 * shown — but the subject's programs are compiled one material per frame instead of in one `compileAsync(scene)`.
 * On ANGLE/D3D11 the synchronous half of compiling (GLSL → HLSL translation) costs ~20–40 ms per lit program, so a
 * subject with 15–20 distinct programs stalls a single frame for > 0.5 s; staging keeps every frame short.
 */

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

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function useStagedStudio(subject: RefObject<THREE.Object3D | null>, onReady: () => void, boxes: Softbox[] = STUDIO) {
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

    const run = async () => {
      await job.catch(() => {})
      if (dead) return
      tmp.remove(envScene)
      envRT = pmrem.fromScene(envScene, 0, 0.1, 100)
      scene.environment = envRT.texture
      pmrem.dispose()
      await nextFrame()
      // one representative object per distinct (material set × object kind), compiled for the screen target
      const reps: THREE.Object3D[] = []
      const seen = new Set<string>()
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!(mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite)) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const key = mats.map((m) => m.uuid).join(',') + ((o as THREE.InstancedMesh).isInstancedMesh ? ':i' : '') + (mesh.geometry?.attributes.color ? ':c' : '')
        if (seen.has(key)) return
        seen.add(key)
        reps.push(o)
      })
      // issue one per frame (the sync translation cost is spread out), let the driver link them in parallel
      const jobs: Promise<unknown>[] = []
      for (const o of reps) {
        if (dead) return
        jobs.push(gl.compileAsync(o, camera, scene).catch(() => {}))
        await nextFrame()
      }
      await Promise.all(jobs)
      if (dead) return
      obj.visible = true
      onReady()
    }
    void run()
    return () => {
      dead = true
      if (scene.environment === envRT?.texture) scene.environment = null
      envRT?.dispose()
      // never delete programs that are still linking (StrictMode remounts right away): on ANGLE that blocks the
      // GPU thread until the link finishes; the remount reuses the same programs from three's cache meanwhile
      void job.catch(() => {}).then(() => {
        offRT.dispose()
        pmrem.dispose()
        bgBox.geometry.dispose()
        bgBox.material.dispose()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])
}
