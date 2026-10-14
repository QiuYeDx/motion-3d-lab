import * as THREE from 'three'
import { POSTER } from '../../lib/iso'

/** orbit + pointer state shared by the WebGPU engine and the WebGL fallback (mutated by DOM handlers) */
export type Rig = {
  yaw: number
  pitch: number
  vyaw: number
  vpitch: number
  dragging: boolean
  lastX: number
  lastY: number
  /** pointer in NDC */
  px: number
  py: number
  inside: boolean
  lastMove: number
  well: number
  weights: () => [number, number, number, number]
}

export function createRig(weights: Rig['weights']): Rig {
  return { yaw: 0.22, pitch: 0.32, vyaw: 0, vpitch: 0, dragging: false, lastX: 0, lastY: 0, px: 0, py: 0, inside: false, lastMove: -1e9, well: 0, weights }
}

const AUTO_SPIN = 0.07

/** advance orbit (auto-rotate + drag inertia) and place the camera; returns the well target strength */
export function stepRig(rig: Rig, cam: THREE.PerspectiveCamera, width: number, height: number, dt: number) {
  if (!rig.dragging) {
    rig.yaw += (rig.vyaw + AUTO_SPIN) * dt
    rig.pitch += rig.vpitch * dt
    const k = Math.exp(-dt * 2.6)
    rig.vyaw *= k
    rig.vpitch *= k
    // pitch eases back toward a pleasant 3/4 view when released
    rig.pitch += (0.32 - rig.pitch) * (1 - Math.exp(-dt * 0.25))
  }
  rig.pitch = THREE.MathUtils.clamp(rig.pitch, -1.25, 1.25)
  const aspect = width / height
  const mobile = width < 760
  const dist = 11.4 / Math.min(1, aspect * 1.4)
  cam.aspect = aspect
  cam.fov = 40
  const cp = Math.cos(rig.pitch)
  cam.position.set(Math.sin(rig.yaw) * cp * dist, Math.sin(rig.pitch) * dist, Math.cos(rig.yaw) * cp * dist)
  cam.lookAt(0, 0, 0)
  // phones: lift the cloud above the bottom label + dock
  const oy = mobile && !POSTER ? 0.09 : 0
  if (oy) cam.setViewOffset(width, height, 0, oy * height, width, height)
  else cam.clearViewOffset()
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld()

  const active = rig.inside && !rig.dragging && performance.now() - rig.lastMove < 2500
  rig.well = THREE.MathUtils.damp(rig.well, active ? 1 : 0, active ? 3 : 1.6, dt)
}

const tmpV = new THREE.Vector3()
const tmpN = new THREE.Vector3()
/** pointer ray ∩ plane through the origin facing the camera */
export function wellPoint(rig: Rig, cam: THREE.PerspectiveCamera, out: THREE.Vector3, axis: THREE.Vector3) {
  cam.getWorldDirection(axis)
  tmpV.set(rig.px, rig.py, 0.5).unproject(cam).sub(cam.position).normalize()
  tmpN.copy(axis)
  const denom = tmpV.dot(tmpN)
  if (Math.abs(denom) < 1e-4) return
  const t = -cam.position.dot(tmpN) / denom
  out.copy(cam.position).addScaledVector(tmpV, t)
}

/** attach drag-to-orbit + hover tracking to an element; returns cleanup */
export function bindRig(el: HTMLElement, rig: Rig) {
  const ndc = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    rig.px = ((e.clientX - r.left) / r.width) * 2 - 1
    rig.py = -((e.clientY - r.top) / r.height) * 2 + 1
  }
  let lastT = 0
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, .dock')) return
    ndc(e)
    if (e.pointerType === 'touch') {
      // phones: a finger is the gravity well (no hover there); the camera keeps auto-orbiting
      rig.inside = true
      rig.lastMove = performance.now()
      return
    }
    rig.dragging = true
    rig.lastX = e.clientX
    rig.lastY = e.clientY
    rig.vyaw = 0
    rig.vpitch = 0
    lastT = performance.now()
    el.setPointerCapture?.(e.pointerId)
    ndc(e)
  }
  const move = (e: PointerEvent) => {
    ndc(e)
    rig.inside = true
    rig.lastMove = performance.now()
    if (!rig.dragging) return
    const now = performance.now()
    const dtt = Math.max(1, now - lastT) / 1000
    lastT = now
    const dx = e.clientX - rig.lastX
    const dy = e.clientY - rig.lastY
    rig.lastX = e.clientX
    rig.lastY = e.clientY
    rig.yaw -= dx * 0.0062
    rig.pitch += dy * 0.0052
    rig.vyaw = THREE.MathUtils.lerp(rig.vyaw, (-dx * 0.0062) / dtt, 0.5)
    rig.vpitch = THREE.MathUtils.lerp(rig.vpitch, (dy * 0.0052) / dtt, 0.5)
  }
  const up = (e: PointerEvent) => {
    if (e.pointerType === 'touch') rig.inside = false
    if (!rig.dragging) return
    rig.dragging = false
    rig.lastMove = performance.now()
    // a stationary release should not fling
    if (performance.now() - lastT > 80) {
      rig.vyaw = 0
      rig.vpitch = 0
    }
    rig.vyaw = THREE.MathUtils.clamp(rig.vyaw, -3, 3)
    rig.vpitch = THREE.MathUtils.clamp(rig.vpitch, -2, 2)
    el.releasePointerCapture?.(e.pointerId)
  }
  const leave = () => {
    rig.inside = false
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('pointerleave', leave)
  return () => {
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
    el.removeEventListener('pointerleave', leave)
  }
}
