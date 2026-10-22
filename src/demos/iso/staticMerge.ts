import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Bakes every plain-coloured Lambert mesh under `root` into ONE vertex-coloured mesh (transforms relative to root).
 * Textured, transparent, emissive, flat-shaded and instanced meshes are left alone. Hundreds of tiny static boxes
 * then cost one draw call per pass instead of hundreds, which keeps the first frame (and shadow pass) cheap.
 */
const bakedMat = new THREE.MeshLambertMaterial({ vertexColors: true })
export function bakeColoured(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const geos: THREE.BufferGeometry[] = []
  const victims: THREE.Mesh[] = []
  const m = new THREE.Matrix4()
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.visible) return
    const mat = o.material
    if (!(mat instanceof THREE.MeshLambertMaterial) || mat === bakedMat) return
    if (mat.map || mat.transparent || mat.flatShading || mat.vertexColors || mat.emissive.getHex() !== 0) return
    if (o.userData.keep) return
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    g.clearGroups()
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = mat.color.r
      col[i * 3 + 1] = mat.color.g
      col[i * 3 + 2] = mat.color.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geos.push(g)
    victims.push(o)
  })
  if (!geos.length) return null
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  if (!merged) return null
  const parents = victims.map((v) => v.parent!)
  victims.forEach((v, i) => parents[i].remove(v))
  const mesh = new THREE.Mesh(merged, bakedMat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  return {
    mesh,
    undo() {
      root.remove(mesh)
      merged.dispose()
      victims.forEach((v, i) => parents[i].add(v))
    },
  }
}

/** bake a static subtree once, after its children have mounted */
export function useBakeStatic(ref: RefObject<THREE.Object3D | null>) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const baked = bakeColoured(root)
    return () => baked?.undo()
  }, [ref])
}

/** like isoWarmup's useScreenWarmup, but only starts compiling once `go` is true (the scene mounts in stages) */
export function useStagedWarmup(go: boolean, onReady: () => void) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const ready = useRef(false)
  const cb = useRef(onReady)
  cb.current = onReady
  useEffect(() => {
    if (!go) return
    let dead = false
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
          cb.current()
        })
    })
    return () => {
      dead = true
      cancelAnimationFrame(raf)
    }
  }, [go, gl, scene, camera])
  useFrame(() => {
    if (!ready.current) {
      gl.setRenderTarget(null)
      gl.clear(true, true, false)
      return
    }
    gl.render(scene, camera)
  }, 1)
}

