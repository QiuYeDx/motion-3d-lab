import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import type { OrthographicCamera } from 'three'

export const POSTER = typeof location !== 'undefined' && location.search.includes('poster')

/** true isometric direction (camera sits on +x +y +z) */
export const ISO_DIR: [number, number, number] = [1, 1, 1]

/**
 * Fits an orthographic camera so `fit` world units span the shorter viewport side,
 * then shifts the projection by a fraction of the viewport (offset[0] → right, offset[1] → up)
 * so the scene can sit beside hero copy without moving the world.
 */
export function IsoRig({
  fit = 16,
  offset = [0, 0],
  target = [0, 0, 0],
  mobileFit,
  mobileOffsetY = 0.12,
}: {
  fit?: number
  offset?: [number, number]
  target?: [number, number, number]
  mobileFit?: number
  mobileOffsetY?: number
}) {
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const { width, height } = useThree((s) => s.size)

  useLayoutEffect(() => {
    const mobile = width < 760
    // gallery posters are captured with ?poster — centre the scene there
    const centred = POSTER
    const f = mobile && mobileFit ? mobileFit : fit
    camera.zoom = Math.min(width, height * 1.25) / f
    const d = 60
    camera.position.set(target[0] + d, target[1] + d, target[2] + d)
    camera.lookAt(target[0], target[1], target[2])
    const ox = mobile || centred ? 0 : offset[0]
    const oy = centred ? 0 : mobile ? mobileOffsetY : offset[1]
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height, fit, mobileFit, mobileOffsetY, offset[0], offset[1], target[0], target[1], target[2]])

  return null
}
