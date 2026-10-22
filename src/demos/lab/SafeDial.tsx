import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, AnimatePresence, motion, motionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { POSTER } from '../../lib/iso'
import { useStagedStudio } from './stagedStudio'
import {
  brushedTexture,
  CODE,
  dialTexture,
  floorGlowTexture,
  ingotGeometry,
  makeSafeSound,
  paperTexture,
  plateTexture,
  roundedRect,
  shadowTexture,
  shellGeometry,
  STEP_DIR,
  TICK,
  TICKS,
  VAULT_BOXES,
  type SafeSound,
} from './safeParts'

/* ------------------------------------------------------------------ layout (world units) */

const BRASS = '#d4a648'
const BY = 1.9 // body centre height
const W = 3.0
const H = 3.5
const D = 2.3
const OW = 2.4
const OH = 2.9
const DW = 2.36
const DH = 2.86
const DD = 0.5
const HX = 1.2 // hinge axis (door's front-right corner) — the door swings out to the right, away from the copy
const HZ = 1.42
const DIAL_Y = 0.55 // door-local
const WHEEL_Y = -0.72
const BOLT_Y = [-0.95, 0, 0.95]
const DOOR_OPEN = 1.74 // rad
const MAG = 0.55
const TAU = Math.PI * 2

const mod = (n: number, m: number) => ((n % m) + m) % m
const magnet = (x: number) => x - (TICK / TAU) * MAG * Math.sin((TAU * x) / TICK)
const tickOf = (raw: number) => Math.round(-raw / TICK)
const pad = (n: number) => String(n).padStart(2, '0')

/* ------------------------------------------------------------------ controller */

type Phase = 'locked' | 'unlocking' | 'open' | 'closing'

type Ctl = {
  raw: MotionValue<number>
  phase: Phase
  phaseAt: number
  entered: number
  lastTick: number
  strokeDir: number
  rest: number
  dragging: boolean
  ghost: boolean
  lastUser: number
  sound: SafeSound | null
  soundOn: boolean
  dialScreen: { x: number; y: number }
  spin: { stop: () => void } | null
  stepTarget: number
  stepAt: number
  shake: MotionValue<number>
  fail: MotionValue<number>
  wheel: MotionValue<number>
  bolts: MotionValue<number>
  door: MotionValue<number>
  light: MotionValue<number>
  dolly: MotionValue<number>
  nudge: number
  // DOM sinks
  numEl: HTMLElement | null
  dirEl: HTMLElement | null
  ghostEl: HTMLDivElement | null
  onEntered: (n: number, fail?: boolean) => void
  onPhase: (p: Phase) => void
}

/** one detent per key / wheel notch; rapid presses accumulate onto the in-flight target instead of being lost */
function stepBy(c: Ctl, steps: number) {
  const now = performance.now()
  const base = now - c.stepAt < 450 ? c.stepTarget : Math.round(c.raw.get() / TICK) * TICK
  c.spin?.stop()
  c.stepTarget = base - steps * TICK
  c.stepAt = now
  c.spin = animate(c.raw, c.stepTarget, {
    type: 'spring',
    stiffness: 520,
    damping: 36,
  })
}

/* ------------------------------------------------------------------ scene */

function Vault({ ctl, api }: { ctl: React.RefObject<Ctl>; api: React.RefObject<{ unlock: () => void } | null> }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const root = useRef<THREE.Group>(null)
  const doorRef = useRef<THREE.Group>(null)
  const dialRef = useRef<THREE.Group>(null)
  const wheelRef = useRef<THREE.Group>(null)
  const boltRefs = useRef<(THREE.Object3D | null)[]>([])
  const rodRefs = useRef<(THREE.Object3D | null)[]>([])
  const lightRef = useRef<THREE.PointLight>(null)
  const lampMats = useRef<THREE.MeshStandardMaterial[]>([])

  const res = useMemo(() => {
    const brushed = brushedTexture()
    brushed.repeat.set(2, 2)
    const dial = dialTexture()
    const plate = plateTexture()
    const mats = {
      body: new THREE.MeshStandardMaterial({
        color: '#5a5c62',
        metalness: 0.55,
        roughness: 0.46,
        roughnessMap: brushed,
        envMapIntensity: 1.2,
      }),
      door: new THREE.MeshStandardMaterial({
        color: '#6b6e74',
        metalness: 0.6,
        roughness: 0.4,
        roughnessMap: brushed,
        envMapIntensity: 1.3,
      }),
      doorInner: new THREE.MeshStandardMaterial({
        color: '#55585e',
        metalness: 0.6,
        roughness: 0.5,
        envMapIntensity: 1,
      }),
      brass: new THREE.MeshStandardMaterial({
        color: BRASS,
        metalness: 1,
        roughness: 0.3,
        envMapIntensity: 1.25,
      }),
      brassDark: new THREE.MeshStandardMaterial({
        color: '#9b7a36',
        metalness: 1,
        roughness: 0.42,
        envMapIntensity: 1,
      }),
      chrome: new THREE.MeshStandardMaterial({
        color: '#d9dce2',
        metalness: 1,
        roughness: 0.16,
        envMapIntensity: 1.3,
      }),
      knurl: new THREE.MeshStandardMaterial({
        color: '#25272c',
        metalness: 0.8,
        roughness: 0.34,
        flatShading: true,
        envMapIntensity: 1.2,
      }),
      dialFace: new THREE.MeshStandardMaterial({
        map: dial,
        metalness: 0.55,
        roughness: 0.38,
        envMapIntensity: 0.9,
      }),
      plate: new THREE.MeshStandardMaterial({
        map: plate,
        metalness: 0.85,
        roughness: 0.32,
        envMapIntensity: 1.2,
      }),
      velvet: new THREE.MeshStandardMaterial({
        color: '#4a1219',
        roughness: 0.95,
        metalness: 0,
        side: THREE.BackSide,
        envMapIntensity: 0.2,
      }),
      shelf: new THREE.MeshStandardMaterial({
        color: '#5a4524',
        metalness: 0.9,
        roughness: 0.45,
        envMapIntensity: 0.7,
      }),
      gold: new THREE.MeshStandardMaterial({
        color: '#f2c14e',
        metalness: 1,
        roughness: 0.22,
        envMapIntensity: 1.4,
      }),
      box: new THREE.MeshStandardMaterial({
        color: '#16171b',
        metalness: 0.3,
        roughness: 0.35,
        envMapIntensity: 0.8,
      }),
      paper: new THREE.MeshStandardMaterial({
        map: paperTexture(),
        roughness: 0.9,
        envMapIntensity: 0.3,
      }),
      paperEdge: new THREE.MeshStandardMaterial({
        color: '#e4d9c1',
        roughness: 0.9,
        envMapIntensity: 0.3,
      }),
      ribbon: new THREE.MeshStandardMaterial({
        color: '#9c1d2b',
        roughness: 0.55,
        envMapIntensity: 0.4,
      }),
      glowLine: new THREE.LineBasicMaterial({
        color: new THREE.Color('#ffd9a0'),
        toneMapped: false,
        transparent: true,
      }),
      glowRing: new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffd28a'),
        toneMapped: false,
        transparent: true,
      }),
      led: new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ffe2b0'),
        toneMapped: false,
      }),
      halo: new THREE.MeshBasicMaterial({
        map: floorGlowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        opacity: 0,
      }),
      shadow: new THREE.MeshBasicMaterial({
        map: shadowTexture(),
        transparent: true,
        depthWrite: false,
      }),
      pool: new THREE.MeshBasicMaterial({
        map: floorGlowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      hit: new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    }
    const lamps = [0, 1, 2].map(
      () =>
        new THREE.MeshStandardMaterial({
          color: '#1c2a22',
          emissive: new THREE.Color('#38ff9a'),
          emissiveIntensity: 0,
          metalness: 0.2,
          roughness: 0.15,
          envMapIntensity: 1,
        }),
    )
    const inlay = roundedRect(2.1, 2.6, 0.08)
    inlay.holes.push(roundedRect(2.06, 2.56, 0.06))
    const productBox = new THREE.BoxGeometry(0.62, 0.5, 0.46)
    const geos = {
      shell: shellGeometry(W, H, D, OW, OH),
      back: new THREE.PlaneGeometry(W - 0.2, H - 0.2),
      lining: new THREE.BoxGeometry(OW - 0.02, OH - 0.02, 2.0),
      door: new RoundedBoxGeometry(DW, DH, DD, 3, 0.05),
      inlay: new THREE.ShapeGeometry(inlay, 8),
      rivet: new THREE.SphereGeometry(0.035, 12, 8),
      bezel: new THREE.TorusGeometry(0.53, 0.035, 14, 72),
      knurl: new THREE.CylinderGeometry(0.47, 0.47, 0.1, 96, 1),
      face: new THREE.CircleGeometry(0.44, 96),
      knob: new THREE.CylinderGeometry(0.15, 0.16, 0.14, 24),
      knobCap: new THREE.CylinderGeometry(0.11, 0.15, 0.03, 32),
      index: new THREE.ConeGeometry(0.045, 0.1, 3),
      lampBezel: new THREE.TorusGeometry(0.055, 0.014, 8, 24),
      lamp: new THREE.SphereGeometry(0.04, 16, 12),
      hub: new THREE.CylinderGeometry(0.13, 0.14, 0.16, 32),
      hubPlate: new THREE.CylinderGeometry(0.21, 0.22, 0.03, 40),
      spoke: new THREE.CylinderGeometry(0.03, 0.034, 0.34, 12),
      spokeKnob: new THREE.SphereGeometry(0.068, 18, 12),
      bolt: new THREE.CylinderGeometry(0.07, 0.07, 0.46, 24),
      keeper: new RoundedBoxGeometry(0.22, 0.26, 0.2, 2, 0.03),
      hinge: new THREE.CylinderGeometry(0.085, 0.085, 0.56, 24),
      hingeLeaf: new THREE.BoxGeometry(0.16, 0.5, 0.2),
      cover: new RoundedBoxGeometry(1.86, 2.36, 0.04, 2, 0.02),
      rod: new THREE.CylinderGeometry(0.035, 0.035, 1.2, 12),
      cam: new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40),
      shelf: new THREE.BoxGeometry(OW - 0.06, 0.05, 1.9),
      ingot: ingotGeometry(),
      productBox,
      productEdges: new THREE.EdgesGeometry(productBox),
      ring: new THREE.TorusGeometry(0.11, 0.012, 10, 48),
      paper: new THREE.BoxGeometry(0.56, 0.012, 0.72),
      ribbon: new THREE.BoxGeometry(0.06, 0.05, 0.74),
      seal: new THREE.CylinderGeometry(0.06, 0.06, 0.025, 24),
      led: new THREE.BoxGeometry(OW - 0.3, 0.025, 0.04),
      foot: new THREE.CylinderGeometry(0.12, 0.14, 0.15, 20),
      plane: new THREE.PlaneGeometry(1, 1),
    }
    // gold: two stepped stacks, front + back row
    const bars: [number, number, number][] = []
    const row = (z: number, n: number, layer: number) => {
      for (let i = 0; i < n; i++) bars.push([(i - (n - 1) / 2) * 0.54 + 0.15, 0.065 + layer * 0.13, z])
    }
    row(0.35, 4, 0)
    row(0.35, 3, 1)
    row(0.35, 2, 2)
    row(-0.05, 4, 0)
    row(-0.05, 3, 1)
    const ingots = new THREE.InstancedMesh(geos.ingot, mats.gold, bars.length)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    bars.forEach(([x, y, z], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i * 7.1) * 0.05)
      ingots.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)))
    })
    return { mats, geos, lamps, ingots }
  }, [])
  lampMats.current = res.lamps

  const st = useMemo(
    () => ({
      v: new THREE.Vector3(),
      look: new THREE.Vector3(),
      lookT: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      flick: 0,
      wasOpen: false,
    }),
    [],
  )

  /* ---- dial drag (angle around the projected dial centre — works for mouse + touch) */
  useEffect(() => {
    const el = gl.domElement
    const org = { x: 0, y: 0 }
    const drag = { on: false, a: 0, t: 0, vel: 0, id: -1 }
    const angle = (e: PointerEvent) => Math.atan2(e.clientY - org.y, e.clientX - org.x)
    const move = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      const c = ctl.current!
      const a = angle(e)
      let d = a - drag.a
      if (d > Math.PI) d -= TAU
      if (d < -Math.PI) d += TAU
      drag.a = a
      const now = performance.now()
      const dt = Math.max(0.008, (now - drag.t) / 1000)
      drag.t = now
      // screen clockwise (+d, y-down) turns the dial clockwise = negative rotation about +z
      c.raw.set(c.raw.get() - d)
      drag.vel = THREE.MathUtils.lerp(drag.vel, -d / dt, 0.45)
      c.lastUser = now
    }
    const up = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      drag.on = false
      const c = ctl.current!
      c.dragging = false
      c.lastUser = performance.now()
      document.body.style.cursor = ''
      const v = performance.now() - drag.t > 110 ? 0 : THREE.MathUtils.clamp(drag.vel, -14, 14)
      const raw = c.raw.get()
      if (Math.abs(v) > 0.6) {
        c.spin = animate(c.raw, raw, {
          type: 'inertia',
          velocity: v,
          power: 0.32,
          timeConstant: 220,
          modifyTarget: (x: number) => Math.round(x / TICK) * TICK,
        })
      } else
        c.spin = animate(c.raw, Math.round(raw / TICK) * TICK, {
          type: 'spring',
          stiffness: 500,
          damping: 34,
        })
    }
    const start = (e: PointerEvent) => {
      const c = ctl.current!
      c.spin?.stop()
      c.ghost = false
      c.dragging = true
      c.lastUser = performance.now()
      const r = el.getBoundingClientRect()
      org.x = r.left + c.dialScreen.x
      org.y = r.top + c.dialScreen.y
      drag.on = true
      drag.id = e.pointerId
      drag.a = angle(e)
      drag.t = performance.now()
      drag.vel = 0
      document.body.style.cursor = 'grabbing'
    }
    // wheel over the canvas = one detent per notch
    const wheel = (e: WheelEvent) => {
      const c = ctl.current!
      if (c.phase !== 'locked' && c.phase !== 'open') return
      e.preventDefault()
      c.spin?.stop()
      c.ghost = false
      c.lastUser = performance.now()
      const steps = Math.sign(e.deltaY) * Math.max(1, Math.min(4, Math.round(Math.abs(e.deltaY) / 60)))
      stepBy(c, steps)
    }
    ;(el as HTMLCanvasElement & { __sdStart?: (e: PointerEvent) => void }).__sdStart = start
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl])

  /* ---- combination logic: strokes end on reversal or when the dial rests */
  const evaluate = (dir: number, num: number, reason: 'reverse' | 'rest') => {
    const c = ctl.current!
    if (c.phase !== 'locked') return
    const k = c.entered
    if (k >= 3) return
    if (dir === STEP_DIR[k] && num === CODE[k]) {
      c.entered = k + 1
      c.onEntered(c.entered)
      if (c.soundOn && !c.ghost) c.sound?.clunk()
      c.nudge = 1
      if (c.entered === 3) api.current?.unlock()
    } else if (k >= 1 && dir === STEP_DIR[k] && reason === 'reverse') {
      c.entered = 0
      c.onEntered(0, true)
      if (c.soundOn && !c.ghost) c.sound?.error()
      animate(c.shake, [0, 1, 0], { duration: 0.5, ease: 'linear' })
      animate(c.fail, [0, 1, 1, 0], { duration: 0.9, times: [0, 0.1, 0.6, 1] })
    }
  }

  const onReady = () => {
    const c = ctl.current!
    c.lastTick = tickOf(c.raw.get())
  }
  useStagedStudio(root, onReady, VAULT_BOXES)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const raw = c.raw.get()
    const disp = magnet(raw)

    // ---- ticks / strokes
    const tk = tickOf(raw)
    if (tk !== c.lastTick) {
      const dir = Math.sign(tk - c.lastTick) // +1 = right (numbers go up)
      if (c.strokeDir !== 0 && dir !== c.strokeDir) evaluate(c.strokeDir, mod(c.lastTick, TICKS), 'reverse')
      c.strokeDir = dir
      const num = mod(tk, TICKS)
      const k = c.entered
      // moving on past a just-entered number in the same direction un-enters it
      if (c.phase === 'locked' && k >= 1 && k < 3 && dir === STEP_DIR[k - 1] && num !== CODE[k - 1]) {
        c.entered = k - 1
        c.onEntered(c.entered)
      }
      if (c.soundOn && !c.ghost && c.sound) {
        const onTarget = c.phase === 'locked' && c.entered < 3 && dir === STEP_DIR[c.entered] && num === CODE[c.entered]
        if (onTarget) c.sound.clunk()
        else c.sound.tick(Math.abs(tk - c.lastTick) > 3 ? 0.6 : 1)
      }
      c.nudge = Math.min(1, c.nudge + 0.35)
      c.lastTick = tk
      c.rest = 0
      if (c.numEl) c.numEl.textContent = pad(num)
    } else {
      c.rest += dt
      if (c.rest > 0.55 && c.strokeDir !== 0) {
        evaluate(c.strokeDir, mod(tk, TICKS), 'rest')
        c.strokeDir = 0
      }
    }
    if (c.dirEl) c.dirEl.dataset.dir = String(c.strokeDir)

    // ---- dial + nudge
    c.nudge = Math.max(0, c.nudge - dt * 7)
    const dial = dialRef.current!
    dial.rotation.z = disp
    dial.position.z = 0.04 - c.nudge * 0.008

    // ---- door, bolts, wheel
    const shake = c.shake.get()
    const fail = c.fail.get()
    const door = doorRef.current!
    door.rotation.y = c.door.get() * DOOR_OPEN
    door.position.x = HX + Math.sin(shake * Math.PI * 7) * 0.025 * shake
    wheelRef.current!.rotation.z = -c.wheel.get()
    const b = c.bolts.get()
    for (let i = 0; i < 3; i++) {
      const bo = boltRefs.current[i]
      if (bo) bo.position.x = -(DW / 2 + 0.05) + b * 0.3
      const ro = rodRefs.current[i]
      if (ro) ro.position.x = -0.62 + b * 0.3
    }
    // ---- lamps
    for (let i = 0; i < 3; i++) {
      const m = lampMats.current[i]
      const on = i < c.entered ? 1 : 0
      m.emissive.setRGB(fail > 0.01 ? 1 : 0.22, fail > 0.01 ? 0.16 : 1, fail > 0.01 ? 0.12 : 0.6)
      m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, fail > 0.01 ? fail * 2.4 : on * 2.2, 14, dt)
    }

    // ---- interior light (flicker comes from the Motion keyframes on `light`)
    const L = c.light.get()
    if (lightRef.current) lightRef.current.intensity = L * 9
    res.mats.led.color.setRGB(1, 0.886, 0.69).multiplyScalar(0.05 + L * 2.2)
    res.mats.glowLine.opacity = 0.15 + L * 0.85
    res.mats.glowRing.opacity = 0.2 + L * 0.8
    res.mats.halo.opacity = L * 0.9

    // ---- camera: dolly in when open
    const k = c.dolly.get()
    const { width, height } = state.size
    const mobile = width < 760
    const cam = camera as THREE.PerspectiveCamera
    const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    let dist = 15
    dist = Math.max(dist, (mobile ? 5.6 + 2.2 * k : 6.2) / (2 * tanH * (width / height)))
    if (POSTER) dist *= 0.9
    if (!mobile) dist *= 1 - 0.14 * k
    const t = state.clock.elapsedTime
    const az = -0.3 - 0.14 * k + (POSTER ? 0 : Math.sin(t * 0.17) * 0.035)
    st.lookT.set(-0.05 + (mobile ? 0.85 : 0.25) * k, 1.85 + 0.05 * k, 0.3 - 0.1 * k)
    st.look.copy(st.lookT)
    cam.position.set(st.look.x + Math.sin(az) * dist, st.look.y + dist * (0.17 - 0.03 * k), st.look.z + Math.cos(az) * dist)
    cam.lookAt(st.look)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.17 : 0.01
    cam.setViewOffset(width, height, -ox * width, oy * height, width, height)
    cam.updateProjectionMatrix()

    // ---- DOM anchors: dial centre (drag origin) + ghost hand fingertip on the knob rim
    dial.updateWorldMatrix(true, false)
    st.v.set(0, 0, 0.1).applyMatrix4(dial.matrixWorld).project(cam)
    c.dialScreen.x = (st.v.x * 0.5 + 0.5) * width
    c.dialScreen.y = (-st.v.y * 0.5 + 0.5) * height
    const gh = c.ghostEl
    if (gh) {
      st.v.set(0.13, -0.1, 0.17).applyMatrix4(dial.matrixWorld).project(cam)
      gh.style.transform = `translate(${(st.v.x * 0.5 + 0.5) * width}px, ${(-st.v.y * 0.5 + 0.5) * height}px)`
      const svg = gh.firstElementChild as SVGElement | null
      if (svg) svg.style.transform = `rotate(${(-disp * 180) / Math.PI}deg)`
    }
  })

  const startDrag = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    if (POSTER) return
    const c = ctl.current!
    if (c.phase !== 'locked' && c.phase !== 'open') return
    e.stopPropagation()
    ;(
      gl.domElement as HTMLCanvasElement & {
        __sdStart?: (e: PointerEvent) => void
      }
    ).__sdStart?.(e.nativeEvent)
  }
  const hover = (on: boolean) => {
    if (!ctl.current!.dragging) document.body.style.cursor = on ? 'grab' : ''
  }

  const { mats, geos } = res
  return (
    <>
      {/* outside the (initially hidden) root: compile() only gathers visible lights, so the programs must see it */}
      <pointLight ref={lightRef} position={[0, BY + 1.15, 0.55]} color="#ffcf8f" intensity={0} distance={5} decay={2} />
      <group ref={root} visible={false}>
        {/* floor */}
        <mesh geometry={geos.plane} material={mats.pool} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 1.5]} scale={[11, 9, 1]} />
        <mesh geometry={geos.plane} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0.2]} scale={[4.6, 3.8, 1]} />
        <mesh geometry={geos.plane} material={mats.halo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 2.6]} scale={[4, 3.2, 1]} />
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={geos.foot} material={mats.body} position={[sx * 1.2, 0.075, sz * 0.85]} />),
        )}

        {/* body */}
        <mesh geometry={geos.shell} material={mats.body} position={[0, BY, 0]} />
        <mesh geometry={geos.back} material={mats.body} position={[0, BY, -D / 2 + 0.01]} />
        <mesh geometry={geos.lining} material={mats.velvet} position={[0, BY, -0.1]} />
        {/* keepers for the bolts + hinge knuckles on the frame */}
        {BOLT_Y.map((y, i) => (
          <mesh key={i} geometry={geos.keeper} material={mats.brassDark} position={[-(DW / 2 + 0.2), BY + y, 1.3]} />
        ))}
        {[-0.95, 0.95].map((y, i) => (
          <group key={i}>
            <mesh geometry={geos.hinge} material={mats.brass} position={[HX, BY + y, HZ - 0.02]} />
            <mesh geometry={geos.hingeLeaf} material={mats.brassDark} position={[HX + 0.08, BY + y, 1.3]} />
          </group>
        ))}

        {/* interior */}
        <group position={[0, BY, 0]}>
          <mesh geometry={geos.shelf} material={mats.shelf} position={[0, 0.06, -0.12]} />
          <mesh geometry={geos.led} material={mats.led} position={[0, OH / 2 - 0.08, 0.7]} />
          {/* gold on the floor of the safe */}
          <primitive object={res.ingots} position={[0, -OH / 2 + 0.01, -0.1]} />
          {/* glowing product box */}
          <group position={[0.45, 0.09 + 0.25, -0.05]} rotation={[0, -0.25, 0]}>
            <mesh geometry={geos.productBox} material={mats.box} />
            <lineSegments geometry={geos.productEdges} material={mats.glowLine} />
            <mesh geometry={geos.ring} material={mats.glowRing} position={[0, 0.02, 0.232]} />
            <mesh geometry={geos.plane} material={mats.halo} position={[0, 0.05, -0.3]} scale={1.6} />
          </group>
          {/* documents */}
          <group position={[-0.55, 0.09, -0.1]} rotation={[0, 0.18, 0]}>
            {[0, 1, 2].map((i) => (
              <mesh
                key={i}
                geometry={geos.paper}
                material={i === 2 ? [mats.paperEdge, mats.paperEdge, mats.paper, mats.paperEdge, mats.paperEdge, mats.paperEdge] : mats.paperEdge}
                position={[i * 0.015, 0.006 + i * 0.013, i * -0.012]}
                rotation={[0, i * 0.06, 0]}
              />
            ))}
            <mesh geometry={geos.ribbon} material={mats.ribbon} position={[0.03, 0.03, -0.02]} rotation={[0, 0.12, 0]} />
            <mesh geometry={geos.seal} material={mats.ribbon} position={[0.04, 0.06, 0.12]} />
          </group>
        </group>

        {/* door (pivots on its front-left corner) */}
        <group ref={doorRef} position={[HX, BY, HZ]}>
          <group position={[-HX, 0, 0]}>
            <mesh geometry={geos.door} material={mats.door} position={[0, 0, -DD / 2]} />
            <mesh geometry={geos.inlay} material={mats.brassDark} position={[0, 0, 0.003]} />
            {[-1, 1].map((sx) =>
              [-1, 1].map((sy) => <mesh key={`${sx}${sy}`} geometry={geos.rivet} material={mats.brass} position={[sx * 0.95, sy * 1.2, 0.006]} />),
            )}
            {/* nameplate */}
            <mesh geometry={geos.plane} material={mats.plate} position={[0, 1.24, 0.008]} scale={[0.94, 0.176, 1]} />
            {/* dial */}
            <group position={[0, DIAL_Y, 0]}>
              <mesh geometry={geos.bezel} material={mats.brass} position={[0, 0, 0.03]} />
              <mesh geometry={geos.index} material={mats.brass} position={[0, 0.6, 0.06]} rotation={[0, 0, Math.PI]} />
              <group ref={dialRef} position={[0, 0, 0.04]}>
                <mesh geometry={geos.knurl} material={mats.knurl} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]} />
                <mesh geometry={geos.face} material={mats.dialFace} position={[0, 0, 0.101]} />
                <mesh geometry={geos.knob} material={mats.brass} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.17]} />
                <mesh geometry={geos.knobCap} material={mats.brassDark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.25]} />
              </group>
              <mesh
                geometry={geos.face}
                material={mats.hit}
                position={[0, 0, 0.32]}
                scale={1.35}
                onPointerDown={startDrag}
                onPointerOver={() => hover(true)}
                onPointerOut={() => hover(false)}
              />
            </group>
            {/* progress lamps */}
            {[0, 1, 2].map((i) => (
              <group key={i} position={[(i - 1) * 0.24, -0.16, 0.0]}>
                <mesh geometry={geos.lampBezel} material={mats.brass} position={[0, 0, 0.012]} />
                <mesh geometry={geos.lamp} material={res.lamps[i]} position={[0, 0, 0.012]} />
              </group>
            ))}
            {/* handle wheel */}
            <group position={[0, WHEEL_Y, 0]}>
              <mesh geometry={geos.hubPlate} material={mats.brassDark} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.015]} />
              <group ref={wheelRef} position={[0, 0, 0.1]}>
                <mesh geometry={geos.hub} material={mats.brass} rotation={[Math.PI / 2, 0, 0]} />
                {[0, 1, 2, 3].map((i) => {
                  const a = (i / 4) * TAU + Math.PI / 4
                  return (
                    <group key={i} rotation={[0, 0, a]}>
                      <mesh geometry={geos.spoke} material={mats.brass} position={[0, 0.27, 0.02]} />
                      <mesh geometry={geos.spokeKnob} material={mats.brass} position={[0, 0.45, 0.02]} />
                    </group>
                  )
                })}
              </group>
            </group>
            {/* bolts: proud part of the door edge, sliding into the keepers */}
            {BOLT_Y.map((y, i) => (
              <mesh
                key={i}
                ref={(e) => void (boltRefs.current[i] = e)}
                geometry={geos.bolt}
                material={mats.chrome}
                position={[-(DW / 2 + 0.05), y, -0.11]}
                rotation={[0, 0, Math.PI / 2]}
              />
            ))}
            {/* bolt work on the inside face */}
            <group position={[0, 0, -DD]}>
              <mesh geometry={geos.cover} material={mats.doorInner} position={[0, 0, -0.02]} />
              {BOLT_Y.map((y, i) => (
                <mesh
                  key={i}
                  ref={(e) => void (rodRefs.current[i] = e)}
                  geometry={geos.rod}
                  material={mats.chrome}
                  position={[-0.62, y, -0.08]}
                  rotation={[0, 0, Math.PI / 2]}
                />
              ))}
              <mesh geometry={geos.cam} material={mats.brass} position={[0, WHEEL_Y, -0.07]} rotation={[Math.PI / 2, 0, 0]} />
            </group>
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function SafeDial() {
  const [entered, setEntered] = useState(0)
  const [failFlash, setFailFlash] = useState(0)
  const [phase, setPhase] = useState<Phase>('locked')
  const [soundOn, setSoundOn] = useState(true)
  const [ghostOn, setGhostOn] = useState(false)
  const api = useRef<{ unlock: () => void } | null>(null)
  const seq = useRef(0) // door timelines
  const gseq = useRef(0) // ghost hand
  const ctl = useRef<Ctl>(null as unknown as Ctl)
  if (!ctl.current) {
    ctl.current = {
      raw: motionValue(0),
      phase: 'locked',
      phaseAt: performance.now(),
      entered: 0,
      lastTick: 0,
      strokeDir: 0,
      rest: 0,
      dragging: false,
      ghost: false,
      lastUser: -1e9,
      sound: null,
      soundOn: true,
      dialScreen: { x: 0, y: 0 },
      spin: null,
      stepTarget: 0,
      stepAt: -1e9,
      shake: motionValue(0),
      fail: motionValue(0),
      wheel: motionValue(0),
      bolts: motionValue(0),
      door: motionValue(POSTER ? 0.74 : 0),
      light: motionValue(POSTER ? 1 : 0),
      dolly: motionValue(POSTER ? 0.4 : 0),
      nudge: 0,
      numEl: null,
      dirEl: null,
      ghostEl: null,
      onEntered: () => {},
      onPhase: () => {},
    }
    if (POSTER) {
      ctl.current.entered = 3
      ctl.current.bolts.set(1)
      ctl.current.wheel.set(2.2)
      ctl.current.phase = 'open'
      ctl.current.raw.set(-CODE[2] * TICK)
    }
  }
  const c = ctl.current
  c.onEntered = (n, fail) => {
    setEntered(n)
    if (fail) setFailFlash((f) => f + 1)
  }
  c.onPhase = setPhase

  const setP = (p: Phase) => {
    c.phase = p
    c.phaseAt = performance.now()
    setPhase(p)
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

  const unlock = async () => {
    if (c.phase !== 'locked') return
    const my = ++seq.current
    setP('unlocking')
    const loud = c.soundOn && !c.ghost
    await wait(260)
    if (my !== seq.current) return
    if (loud) c.sound?.unlock()
    await animate(c.wheel, 2.2, { duration: 0.9, ease: [0.55, 0, 0.25, 1] })
    if (my !== seq.current) return
    await animate(c.bolts, 1, { duration: 0.3, ease: [0.7, 0, 0.3, 1] })
    if (my !== seq.current) return
    if (loud) c.sound?.door()
    animate(c.door, 1, {
      type: 'spring',
      stiffness: 22,
      damping: 6.5,
      mass: 1.6,
    })
    animate(c.dolly, 1, { duration: 2.2, ease: [0.3, 0, 0.2, 1] })
    await wait(420)
    if (my !== seq.current) return
    if (loud) c.sound?.buzz()
    animate(c.light, [0, 0.9, 0.1, 0.05, 1, 0.35, 1], {
      duration: 0.85,
      times: [0, 0.08, 0.16, 0.42, 0.5, 0.62, 1],
      ease: 'linear',
    })
    setP('open')
  }
  api.current = { unlock: () => void unlock() }

  const close = async () => {
    if (c.phase !== 'open') return
    const my = ++seq.current
    setP('closing')
    const loud = c.soundOn && !c.ghost
    animate(c.light, 0, { duration: 0.35 })
    animate(c.dolly, 0, { duration: 1.6, ease: [0.4, 0, 0.2, 1] })
    await animate(c.door, 0, {
      type: 'spring',
      stiffness: 34,
      damping: 11.5,
      mass: 1.4,
      restDelta: 0.002,
    })
    if (my !== seq.current) return
    c.door.set(0)
    if (loud) c.sound?.thud()
    await animate(c.bolts, 0, { duration: 0.28, ease: [0.7, 0, 0.3, 1] })
    if (my !== seq.current) return
    animate(c.wheel, 0, { duration: 0.8, ease: [0.5, 0, 0.3, 1] })
    // scramble the dial back to 0
    c.entered = 0
    setEntered(0)
    const raw = c.raw.get()
    c.strokeDir = 0
    c.spin = animate(c.raw, Math.round(raw / TAU) * TAU - TAU, {
      duration: 1.1,
      ease: [0.4, 0, 0.2, 1],
    })
    await wait(1150)
    if (my !== seq.current) return
    c.strokeDir = 0
    setP('locked')
  }

  /* ---- ghost hand: dials R → L → R and opens; runs when idle */
  const turnTo = (num: number, dir: number, extra: number) => {
    const t0 = tickOf(c.raw.get())
    const cur = mod(t0, TICKS)
    const steps = dir > 0 ? mod(num - cur, TICKS) + extra * TICKS : mod(cur - num, TICKS) + extra * TICKS
    const t1 = t0 + dir * (steps === 0 ? TICKS : steps)
    const dur = 0.55 + Math.abs(t1 - t0) * 0.017
    c.spin = animate(c.raw, -t1 * TICK, {
      duration: dur,
      ease: [0.45, 0, 0.3, 1],
    })
    return c.spin
  }
  const ghost = async () => {
    if (c.phase !== 'locked' || c.dragging) return
    const my = ++gseq.current
    c.ghost = true
    setGhostOn(true)
    const alive = () => my === gseq.current && c.ghost
    try {
      if (c.entered > 0) {
        c.entered = 0
        setEntered(0)
      }
      c.strokeDir = 0
      for (let k = 0; k < 3; k++) {
        await turnTo(CODE[k], STEP_DIR[k], k === 0 ? 1 : 0)
        if (!alive()) return
        if (k === 2) setGhostOn(false)
        await wait(760)
        if (!alive()) return
      }
      // unlock is triggered by the combination logic; wait for the door, hold, then close
      await wait(5200)
      if (!alive()) return
      setGhostOn(false)
      await close()
    } finally {
      if (my === gseq.current) {
        c.ghost = false
        setGhostOn(false)
      }
    }
  }

  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      const now = performance.now()
      if (c.dragging || c.ghost) return
      const idle = now - c.lastUser
      if (c.phase === 'locked' && idle > 7500 && now - c.phaseAt > 2500) void ghost()
      else if (c.phase === 'open' && idle > 9000 && now - c.phaseAt > 6000) void close()
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => () => {
      seq.current++
      gseq.current++
    },
    [],
  )

  const ensureSound = () => {
    c.lastUser = performance.now()
    if (c.ghost) {
      c.ghost = false
      c.spin?.stop()
      gseq.current++
      setGhostOn(false)
    }
    if (c.sound || !c.soundOn) return
    try {
      c.sound = makeSafeSound()
    } catch {
      /* no audio */
    }
  }
  const toggleSound = () => {
    c.soundOn = !c.soundOn
    setSoundOn(c.soundOn)
    if (c.soundOn) {
      ensureSound()
      c.sound?.tick(1)
    }
  }
  const stepKey = (d: number) => {
    ensureSound()
    if (c.phase !== 'locked' && c.phase !== 'open') return
    stepBy(c, d)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') stepKey(1)
      else if (e.key === 'ArrowLeft') stepKey(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = Math.min(entered, 2)
  const stepText =
    phase === 'open'
      ? '已打开'
      : phase === 'unlocking'
        ? '开锁中…'
        : phase === 'closing'
          ? '关门中…'
          : `第 ${entered + 1} 步 · 向${STEP_DIR[step] > 0 ? '右' : '左'}转到 ${pad(CODE[step])}`

  return (
    <div className="stage sd-stage" onPointerDownCapture={ensureSound} onWheelCapture={ensureSound}>
      <style>{`
        .sd-stage { background: radial-gradient(90% 80% at 66% 42%, #262830 0%, #17181c 50%, #0d0e11 100%); touch-action: none; }
        .sd-stage .scrim { --soft-bg: #131418; }
        .sd-stage .hero-copy h1 em { color: ${BRASS}; font-style: normal; }
        .sd-stage .kicker i { background: ${BRASS}; }
        .sd-row { display: flex; align-items: stretch; gap: 14px; margin-top: 26px; }
        .sd-read { position: relative; min-width: 172px; padding: 14px 16px 13px; border-radius: 16px; background: rgba(255,255,255,0.04); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }
        .sd-read small { display: block; font: 500 10.5px/1 var(--mono); letter-spacing: .1em; color: var(--fg-2); text-transform: uppercase; }
        .sd-num { display: flex; align-items: baseline; gap: 10px; margin-top: 8px; }
        .sd-num b { font: 600 54px/0.9 var(--mono); letter-spacing: -0.03em; color: #f4e6c4; font-variant-numeric: tabular-nums; }
        .sd-dir { font: 500 18px/1 var(--mono); color: var(--fg-2); transition: color .2s, transform .25s var(--ease-out); }
        .sd-dir[data-dir='1'] { color: ${BRASS}; transform: rotate(0deg); }
        .sd-dir[data-dir='-1'] { color: ${BRASS}; transform: scaleX(-1); }
        .sd-lights { display: flex; gap: 8px; margin-top: 12px; }
        .sd-lights i { width: 10px; height: 10px; border-radius: 50%; background: #2a2e2b; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12); transition: background .25s, box-shadow .25s; }
        .sd-lights i.on { background: #4dffa6; box-shadow: 0 0 10px 1px rgba(77,255,166,0.6); }
        .sd-lights.fail i { background: #ff5a4a; box-shadow: 0 0 10px rgba(255,90,74,.6); }
        .sd-step { margin-top: 10px; font: 500 12.5px/1.2 var(--sans); color: var(--fg); }
        .sd-note { position: relative; align-self: flex-start; width: 150px; padding: 14px 14px 12px; border-radius: 4px; color: #3b2c18; background: linear-gradient(170deg, #f3e4c2, #e3cfa3); box-shadow: 0 14px 30px -12px rgba(0,0,0,.7), inset 0 0 0 1px rgba(80,55,20,.15); transform: rotate(2.4deg); }
        .sd-note::before { content: ''; position: absolute; top: -7px; left: 50%; width: 46px; height: 14px; transform: translateX(-50%) rotate(-3deg); background: rgba(255,255,255,.28); box-shadow: 0 1px 2px rgba(0,0,0,.15); }
        .sd-note small { display: block; font: 600 10.5px/1 var(--mono); letter-spacing: .1em; color: rgba(59,44,24,.6); }
        .sd-code { display: flex; gap: 8px; margin-top: 9px; }
        .sd-code span { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .sd-code b { font: 700 24px/1 var(--mono); letter-spacing: -0.02em; }
        .sd-code em { font: 600 10px/1 var(--sans); font-style: normal; color: rgba(59,44,24,.65); }
        .sd-code span.done b { color: #1e7d4c; }
        .sd-code i { align-self: flex-start; margin-top: 4px; font: 500 14px/1 var(--mono); font-style: normal; color: rgba(59,44,24,.4); }
        .sd-ghost { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none !important; will-change: transform; transition: opacity .4s; }
        .sd-ghost svg { position: absolute; left: -9px; top: -4px; width: 46px; height: 56px; transform-origin: 9px 4px; filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); }
        .sd-ghost span { position: absolute; left: 30px; top: 44px; white-space: nowrap; font: 500 11px/1 var(--mono); color: rgba(244,230,196,.7); letter-spacing: .06em; }
        .sd-dock .seg[disabled] { opacity: .4; cursor: default; }
        @media (max-width: 760px) {
          .sd-stage .hero-copy h1 { font-size: 30px; }
          .sd-stage .hero-copy > p:not(.kicker) { display: none; }
          .sd-row { margin-top: 14px; gap: 10px; }
          .sd-read { min-width: 0; flex: 1; padding: 11px 12px; }
          .sd-num b { font-size: 40px; }
          .sd-note { width: 132px; padding: 11px 11px 10px; }
          .sd-code b { font-size: 20px; }
        }
      `}</style>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 200, position: [4, 4, 15] }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}
      >
        <hemisphereLight args={['#8d97b5', '#1a1410', 0.35]} />
        <directionalLight position={[-5, 8, 7]} intensity={1.7} color="#ffe6c8" />
        <directionalLight position={[6, 4, -3]} intensity={1.0} color="#9fb4ff" />
        <directionalLight position={[4, 2, 8]} intensity={0.35} color="#ffffff" />
        <Vault ctl={ctl} api={api} />
      </Canvas>

      <div className="overlay">
        <div className="sd-ghost" ref={(e) => void (c.ghostEl = e)} style={{ opacity: ghostOn ? 1 : 0 }}>
          <svg viewBox="0 0 46 56" aria-hidden>
            <path
              d="M12 4.5c0-2 3.6-2 3.6 0v17.2l1.2-.2V15c0-2 3.6-2 3.6 0v7l1.2-.1v-4.6c0-2 3.6-2 3.6 0v5.4l1.2.1v-3c0-2 3.4-2 3.4 0v12.5c0 8.5-4.4 14.2-11.5 14.2-5 0-8-2.6-10.5-7.2L3 28.6c-1-2 1.6-3.8 3.3-2.2L12 32z"
              fill="rgba(244,230,196,0.16)"
              stroke="rgba(244,230,196,0.85)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>演示中</span>
        </div>

        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Rotary input · Detents
          </p>
          <h1>
            转对三个数，
            <br />
            <em>门就开了</em>
          </h1>
          <p>
            拖着密码盘转（触屏、滚轮、← → 键都行），每一格都有磁吸停顿和咔哒声。按 右 → 左 → 右
            依次停在三个数字上，对上后把手转动、门闩缩回，厚重的门缓缓荡开。
          </p>
          <div className="sd-row">
            <div className="sd-read">
              <small>当前</small>
              <div className="sd-num">
                <b ref={(e) => void (c.numEl = e)}>00</b>
                <span className="sd-dir" ref={(e) => void (c.dirEl = e)} data-dir="0">
                  ↻
                </span>
              </div>
              <motion.div
                key={failFlash}
                className={`sd-lights${failFlash ? ' fail' : ''}`}
                initial={failFlash ? { x: 0 } : false}
                animate={failFlash ? { x: [0, -6, 6, -4, 4, 0] } : {}}
                transition={{ duration: 0.45 }}
                onAnimationComplete={() => failFlash && setFailFlash(0)}
              >
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i < entered ? 'on' : ''} />
                ))}
              </motion.div>
              <div className="sd-step">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={stepText}
                    style={{ display: 'inline-block' }}
                    initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
                    transition={{ duration: 0.25 }}
                  >
                    {stepText}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <div className="sd-note">
              <small>密码 · 别告诉别人</small>
              <div className="sd-code">
                {CODE.map((n, i) => (
                  <span key={i} className={i < entered ? 'done' : ''} style={{ display: 'contents' }}>
                    {i > 0 && <i>·</i>}
                    <span className={i < entered ? 'done' : ''}>
                      <b>{pad(n)}</b>
                      <em>{STEP_DIR[i] > 0 ? '右 ↻' : '左 ↺'}</em>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <div className="dock sd-dock">
          <button
            className="seg"
            onClick={() => {
              ensureSound()
              void close()
            }}
            disabled={phase !== 'open'}
          >
            <span>关上</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              c.lastUser = performance.now() - 1e6
              void ghost()
            }}
            disabled={phase !== 'locked' || ghostOn}
          >
            <span>演示开锁</span>
          </button>
          <span className="dock-sep" />
          <button className="seg" onClick={toggleSound} aria-pressed={soundOn}>
            <span>声音 {soundOn ? '开' : '关'}</span>
          </button>
        </div>
        <p className="hint">拖动拨盘 · 滚轮或 ← → 一格一格转 · 右 → 左 → 右</p>
      </div>
    </div>
  )
}
