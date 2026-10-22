import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics, useRapier, type RapierContext, type RapierRigidBody } from '@react-three/rapier'
import { animate, AnimatePresence, motion, motionValue, type MotionValue } from 'motion/react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { POSTER } from '../../lib/iso'
import { useStagedStudio } from './stagedStudio'
import {
  blobShadowTexture,
  buildPrizes,
  CAP_R,
  CAPSULE_COLORS,
  capsuleMaterial,
  fxMaterial,
  glassMaterial,
  makeGachaSound,
  plaqueTexture,
  priceTexture,
  RARITY_EN,
  RARITY_LABEL,
  rollPrize,
  roundedBox,
  roundedRectShape,
  type GachaSound,
  type Prize,
  type PrizeId,
} from './gachaParts'

/* ------------------------------------------------------------------ layout constants (world units) */

const RED = '#ec4a63'
const CREAM = '#fff5ea'
const INK = '#2c1b24'
const ACCENT = '#ff4f7b'

const BASE_TOP = 2.52
const FRONT_Z = 1.1
const GLOBE_Y = 3.72
const GLOBE_R = 1.5
const GLOBE_RIN = 1.42
const FLOOR_Y = 2.78
const HOLE = new THREE.Vector3(0, FLOOR_Y, 0.5)
const CRANK = new THREE.Vector3(0, 1.5, FRONT_Z)
const DOOR_Y = 0.62
const N = 48
const DET = Math.PI / 3 // six clicks per turn
const TAU = Math.PI * 2
const MAG = 0.62 // magnetic detent strength
const REVEAL_SCALE = 2.45
const P_REVEAL = new THREE.Vector3(0, 3.0, 6.3) // recomputed per frame from the camera
const LOOK = new THREE.Vector3(0, 2.75, 0)
const AZ = 0.4
const STEP = 1 / 120

const RARITY_FX = [
  { glow: 0.6, rays: 0, ring: 0.45, c1: '#ffffff', c2: '#ffc7d5', confetti: 70 },
  { glow: 0.85, rays: 0.32, ring: 1, c1: '#f1ecff', c2: '#7a5cff', confetti: 110 },
  { glow: 0.9, rays: 1, ring: 1, c1: '#fff7d6', c2: '#ffad14', confetti: 160 },
]
const CONFETTI_COLORS = ['#ff5c84', '#2fc39d', '#ffbe2e', '#4a9dff', '#9677ff', '#ff7a45', '#ffffff']

const magnet = (x: number) => x - (DET / TAU) * MAG * Math.sin((TAU * x) / DET)

/* ------------------------------------------------------------------ controller shared by scene + DOM */

type Phase = 'pour' | 'idle' | 'drop' | 'tray' | 'ready' | 'reveal' | 'shown' | 'collect'

type Ctl = {
  phase: Phase
  phaseAt: number
  raw: MotionValue<number>
  ratchet: number
  turns: number
  detent: number
  userTurn: boolean
  dragging: boolean
  lastUser: number
  auto: boolean
  sound: GachaSound | null
  soundOn: boolean
  sinceLegend: number
  pulls: number
  crankScreen: { x: number; y: number }
  turnAnim: { stop: () => void } | null
}

type Api = { autoTurn: (auto: boolean) => void; open: (auto: boolean) => void; collect: () => void }
type Sinks = { card: HTMLDivElement | null; bubble: HTMLDivElement | null }

/* ------------------------------------------------------------------ scene */

const B_WAIT = 0
const B_GLOBE = 1
const B_SINK = 2
const B_HIDDEN = 3
const B_TRAY = 4
const B_REVEAL = 5

type World = RapierContext['world']

function Machine({
  ctl,
  api,
  sinks,
  onPhase,
  onPrize,
}: {
  ctl: React.RefObject<Ctl>
  api: React.RefObject<Api | null>
  sinks: React.RefObject<Sinks>
  onPhase: (p: Phase) => void
  onPrize: (p: Prize | null, collected: boolean) => void
}) {
  const { rapier } = useRapier()
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const root = useRef<THREE.Group>(null)
  const machine = useRef<THREE.Group>(null)
  const capsMesh = useRef<THREE.InstancedMesh>(null)
  const crankRef = useRef<THREE.Group>(null)
  const agitRef = useRef<THREE.Group>(null)
  const flapRef = useRef<THREE.Group>(null)
  const lidRef = useRef<THREE.Group>(null)
  const revealRef = useRef<THREE.Group>(null)
  const topHalf = useRef<THREE.Group>(null)
  const botHalf = useRef<THREE.Group>(null)
  const prizeRef = useRef<THREE.Group>(null)
  const fxRef = useRef<THREE.Mesh>(null)
  const veilRef = useRef<THREE.Mesh>(null)
  const confRef = useRef<THREE.InstancedMesh>(null)
  const worldRef = useRef<World | null>(null)
  const bodies = useRef<RapierRigidBody[]>([])
  const agitBody = useRef<RapierRigidBody | null>(null)

  /* ---- static resources */
  const res = useMemo(() => {
    const capGeo = new THREE.SphereGeometry(CAP_R, 28, 18)
    const aTop = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3)
    const aBot = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3)
    capGeo.setAttribute('aTop', aTop)
    capGeo.setAttribute('aBot', aBot)
    const plaque = plaqueTexture()
    const price = priceTexture()
    const shadow = blobShadowTexture()
    const confGeo = new THREE.PlaneGeometry(0.075, 0.13)
    const confMat = new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.6 })
    const conf = new THREE.InstancedMesh(confGeo, confMat, 170)
    conf.frustumCulled = false
    const col = new THREE.Color()
    for (let i = 0; i < 170; i++) {
      conf.setColorAt(i, col.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]))
      conf.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0))
    }
    const caps = new THREE.InstancedMesh(capGeo, capsuleMaterial(), N)
    caps.frustumCulled = false
    for (let i = 0; i < N; i++) caps.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0))
    return {
      capGeo,
      aTop,
      aBot,
      caps,
      conf,
      mats: {
        red: new THREE.MeshPhysicalMaterial({ color: RED, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.9 }),
        redDeep: new THREE.MeshStandardMaterial({ color: '#c8344f', roughness: 0.4, envMapIntensity: 0.8 }),
        cream: new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.42, envMapIntensity: 0.85 }),
        floor: new THREE.MeshStandardMaterial({ color: '#ffe3ea', roughness: 0.6, envMapIntensity: 0.6 }),
        ink: new THREE.MeshStandardMaterial({ color: INK, roughness: 0.7, envMapIntensity: 0.4 }),
        plinth: new THREE.MeshStandardMaterial({ color: '#5a2c3c', roughness: 0.55, envMapIntensity: 0.6 }),
        yellow: new THREE.MeshStandardMaterial({ color: '#ffc93d', roughness: 0.35, envMapIntensity: 0.9 }),
        steel: new THREE.MeshStandardMaterial({ color: '#d9d6dc', metalness: 0.85, roughness: 0.28, envMapIntensity: 1.2 }),
        glass: glassMaterial(),
        flap: new THREE.MeshStandardMaterial({ color: '#4b2433', roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
        plaque: new THREE.MeshStandardMaterial({ map: plaque, roughness: 0.5, envMapIntensity: 0.6 }),
        price: new THREE.MeshStandardMaterial({ map: price, roughness: 0.5, transparent: true, envMapIntensity: 0.6 }),
        shadow: new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthWrite: false, toneMapped: false }),
        hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
        veil: new THREE.MeshBasicMaterial({ color: '#fbf4f6', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        fx: fxMaterial(),
        halfTop: new THREE.MeshStandardMaterial({ roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.9 }),
        halfBot: new THREE.MeshStandardMaterial({ roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.9 }),
        seam: new THREE.MeshStandardMaterial({ color: '#8a6d78', roughness: 0.4 }),
      },
      geos: {
        base: roundedBox(2.6, 2.4, 2.2, 0.2),
        plinth: roundedBox(2.36, 0.16, 2.0, 0.06),
        trim: roundedBox(2.72, 0.14, 2.32, 0.07),
        plaqueFrame: roundedBox(1.76, 0.5, 0.06, 0.05),
        doorFrame: roundedBox(1.0, 0.8, 0.06, 0.08),
        doorHole: new THREE.ShapeGeometry(roundedRectShape(0.82, 0.62, 0.1), 6),
        flap: new THREE.ShapeGeometry(roundedRectShape(0.8, 0.6, 0.09), 6),
        trayBed: roundedBox(1.22, 0.2, 0.8, 0.07),
        trayLip: roundedBox(1.22, 0.3, 0.1, 0.05),
        trayCheek: roundedBox(0.1, 0.3, 0.8, 0.05),
        crankPlate: new THREE.CylinderGeometry(0.46, 0.48, 0.08, 56),
        crankRing: new THREE.TorusGeometry(0.475, 0.032, 12, 64),
        crankBar: roundedBox(0.92, 0.22, 0.18, 0.09),
        crankCap: new THREE.CylinderGeometry(0.17, 0.19, 0.14, 40),
        crankDot: new THREE.SphereGeometry(0.05, 16, 12),
        slotPlate: roundedBox(0.34, 0.54, 0.06, 0.05),
        slot: roundedBox(0.06, 0.28, 0.04, 0.02),
        collar: new THREE.CylinderGeometry(1.1, 1.22, 0.16, 64),
        globe: new THREE.SphereGeometry(GLOBE_R, 64, 40),
        floor: new THREE.CylinderGeometry(1.08, 1.08, 0.1, 56),
        hole: new THREE.CircleGeometry(0.27, 40),
        arm: roundedBox(0.92, 0.18, 0.1, 0.04),
        hub: new THREE.CylinderGeometry(0.15, 0.17, 0.24, 32),
        lid: new THREE.CylinderGeometry(0.44, 0.48, 0.16, 48),
        knob: new THREE.SphereGeometry(0.13, 24, 16),
        circle: new THREE.CircleGeometry(1, 48),
        plane: new THREE.PlaneGeometry(1, 1),
        halfTop: new THREE.SphereGeometry(CAP_R, 36, 14, 0, TAU, 0, Math.PI / 2),
        halfBot: new THREE.SphereGeometry(CAP_R, 36, 14, 0, TAU, Math.PI / 2, Math.PI / 2),
        seam: new THREE.TorusGeometry(CAP_R, 0.008, 8, 48),
      },
      prizes: buildPrizes(),
    }
  }, [])

  /* ---- per-frame state (no React) */
  const st = useMemo(
    () => ({
      clock: 0,
      acc: 0,
      state: new Uint8Array(N),
      t: new Float32Array(N),
      spawnAt: new Float32Array(N),
      scale: new Float32Array(N),
      colour: new Uint8Array(N),
      sinkFrom: new Float32Array(N * 3),
      sinkQ: new Float32Array(N * 4),
      tray: -1,
      trayStill: 0,
      trayT: 0,
      revealFrom: new THREE.Vector3(),
      revealQ: new THREE.Quaternion(),
      popAt: -1,
      rarity: 0,
      prizeId: 'duck' as PrizeId,
      seq: 0,
      disp: 0,
      prevDisp: 0,
      flap: 0,
      flapV: 0,
      nudge: 0,
      nudgeV: 0,
      lid: 0,
      lidV: 0,
      // confetti
      cPos: new Float32Array(170 * 3),
      cVel: new Float32Array(170 * 3),
      cAxis: new Float32Array(170 * 3),
      cRot: new Float32Array(170),
      cSpin: new Float32Array(170),
      cLife: new Float32Array(170),
      cCount: 0,
      // reveal timelines (Motion owns them; read in useFrame)
      lift: motionValue(0),
      twist: motionValue(0),
      open: motionValue(0),
      pop: motionValue(0),
      out: motionValue(0),
      veil: motionValue(0),
      // scratch
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      v: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      e: new THREE.Euler(),
      faceQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0.0, 0.06)),
      yAxis: new THREE.Vector3(0, 1, 0),
      col: new THREE.Color(),
    }),
    [],
  )

  const setPhase = (p: Phase) => {
    const c = ctl.current!
    if (c.phase === p) return
    c.phase = p
    c.phaseAt = performance.now()
    onPhase(p)
  }

  const paint = (i: number, k: number) => {
    st.colour[i] = k
    const [top, bot] = CAPSULE_COLORS[k]
    st.col.set(top)
    res.aTop.setXYZ(i, st.col.r, st.col.g, st.col.b)
    st.col.set(bot)
    res.aBot.setXYZ(i, st.col.r, st.col.g, st.col.b)
    res.aTop.needsUpdate = true
    res.aBot.needsUpdate = true
  }

  /* ---- physics world (owned here; <Physics paused> only loads the wasm) */
  useEffect(() => {
    const R = rapier
    const world = new R.World({ x: 0, y: -16, z: 0 })
    worldRef.current = world
    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed())
    const q = new THREE.Quaternion()
    const box = (hx: number, hy: number, hz: number, x: number, y: number, z: number, rot?: THREE.Quaternion, fr = 0.3) => {
      const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setRestitution(0.2)
      if (rot) d.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
      world.createCollider(d, fixed)
    }
    // globe shell: tangent tiles from the pole down to the floor
    const BANDS = 9
    const LON = 18
    const th = 0.12
    const n = new THREE.Vector3()
    const tp = new THREE.Vector3()
    const tt = new THREE.Vector3()
    const mb = new THREE.Matrix4()
    for (let b = 0; b < BANDS; b++) {
      const t0 = (b / BANDS) * THREE.MathUtils.degToRad(138)
      const t1 = ((b + 1) / BANDS) * THREE.MathUtils.degToRad(138)
      const tc = (t0 + t1) / 2
      const hh = GLOBE_RIN * (t1 - t0) * 0.5 * 1.15
      const hw = GLOBE_RIN * Math.max(Math.sin(t0), Math.sin(t1), Math.sin(tc)) * (Math.PI / LON) * 1.2
      for (let l = 0; l < LON; l++) {
        const ph = ((l + (b % 2) * 0.5) / LON) * TAU
        n.set(Math.sin(tc) * Math.cos(ph), Math.cos(tc), Math.sin(tc) * Math.sin(ph))
        tp.set(-Math.sin(ph), 0, Math.cos(ph))
        tt.crossVectors(n, tp)
        mb.makeBasis(tp, tt, n)
        q.setFromRotationMatrix(mb)
        const r = GLOBE_RIN + th
        box(Math.max(hw, 0.06), hh, th, n.x * r, GLOBE_Y + n.y * r, n.z * r, q, 0.2)
      }
    }
    box(0.4, th, 0.4, 0, GLOBE_Y + GLOBE_RIN + th, 0)
    // globe floor
    world.createCollider(R.ColliderDesc.cylinder(0.1, 1.12).setTranslation(0, FLOOR_Y - 0.1, 0).setFriction(0.35), fixed)
    // hidden chute inside the base + the front tray
    box(0.42, 0.05, 0.5, 0, 0.29, 0.7)
    box(0.42, 0.05, 0.5, 0, 0.98, 0.7)
    box(0.05, 0.4, 0.5, 0.47, 0.62, 0.7)
    box(0.05, 0.4, 0.5, -0.47, 0.62, 0.7)
    box(0.42, 0.4, 0.05, 0, 0.62, 0.22)
    q.setFromEuler(new THREE.Euler(0.05, 0, 0))
    box(0.56, 0.1, 0.42, 0, 0.2, 1.45, q, 0.6)
    box(0.56, 0.16, 0.05, 0, 0.4, 1.8)
    box(0.05, 0.2, 0.42, 0.56, 0.4, 1.45)
    box(0.05, 0.2, 0.42, -0.56, 0.4, 1.45)
    box(10, 0.5, 10, 0, -0.5, 0)

    // agitator: kinematic three-arm paddle on the globe floor
    const ag = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, FLOOR_Y, 0))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU
      q.setFromAxisAngle(st.yAxis, a)
      world.createCollider(
        R.ColliderDesc.cuboid(0.46, 0.09, 0.05)
          .setTranslation(Math.cos(a) * 0.5, 0.09, -Math.sin(a) * 0.5)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.5),
        ag,
      )
    }
    world.createCollider(R.ColliderDesc.cylinder(0.12, 0.16).setTranslation(0, 0.12, 0), ag)
    agitBody.current = ag

    // capsules
    const list: RapierRigidBody[] = []
    for (let i = 0; i < N; i++) {
      const rb = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(0, -20 - i, 0)
          .setLinearDamping(0.12)
          .setAngularDamping(0.5)
          .setCcdEnabled(true),
      )
      world.createCollider(R.ColliderDesc.ball(CAP_R).setFriction(0.32).setRestitution(0.32).setDensity(1), rb)
      rb.setEnabled(false)
      list.push(rb)
      paint(i, (i * 5 + (i >> 1)) % CAPSULE_COLORS.length)
      st.state[i] = B_WAIT
      st.spawnAt[i] = 0.25 + i * 0.045
    }
    bodies.current = list
    st.clock = 0
    st.acc = 0

    if (POSTER) {
      for (let k = 0; k < 120 * 4.5; k++) simulate(STEP)
      // one capsule waiting in the tray for the poster
      let best = 0
      for (let i = 0; i < N; i++) if (bodies.current[i].translation().y < bodies.current[best].translation().y) best = i
      paint(best, 0)
      toTray(best, 1.46)
      for (let k = 0; k < 120 * 1.5; k++) simulate(STEP)
    }
    return () => {
      bodies.current = []
      agitBody.current = null
      worldRef.current = null
      world.free()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapier])

  const spawnTop = (i: number, refill = false) => {
    const rb = bodies.current[i]
    const a = Math.random() * TAU
    const r = Math.random() * (refill ? 0.25 : 0.62)
    rb.setTranslation({ x: Math.cos(a) * r, y: GLOBE_Y + (refill ? 1.05 : 0.95), z: Math.sin(a) * r }, true)
    st.q.setFromEuler(st.e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6))
    rb.setRotation(st.q, true)
    rb.setLinvel({ x: (Math.random() - 0.5) * 0.6, y: -2.5, z: (Math.random() - 0.5) * 0.6 }, true)
    rb.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 6 }, true)
    rb.setEnabled(true)
    st.state[i] = B_GLOBE
    st.scale[i] = 0.2
  }

  const toTray = (i: number, z = 0.5) => {
    const rb = bodies.current[i]
    rb.setTranslation({ x: 0, y: 0.58, z }, true)
    rb.setLinvel({ x: 0, y: 0, z: z > 1 ? 0 : 2.7 }, true)
    rb.setAngvel({ x: z > 1 ? 0 : 9, y: 0, z: 0 }, true)
    rb.setEnabled(true)
    st.state[i] = B_TRAY
    st.scale[i] = 1
    st.tray = i
    st.trayStill = 0
    st.trayT = 0
  }

  const simulate = (dt: number) => {
    const world = worldRef.current
    if (!world) return
    st.clock += dt
    const list = bodies.current
    let waiting = 0
    for (let i = 0; i < N; i++) {
      const s = st.state[i]
      if (s === B_WAIT) {
        if (st.clock >= st.spawnAt[i]) spawnTop(i)
        else waiting++
      } else if (s === B_GLOBE) {
        st.scale[i] = Math.min(1, st.scale[i] + dt * 5)
      } else if (s === B_SINK) {
        st.t[i] += dt
        if (st.t[i] > 0.5) {
          st.state[i] = B_HIDDEN
          st.t[i] = 0
        }
      } else if (s === B_HIDDEN) {
        st.t[i] += dt
        if (st.t[i] > 0.3) {
          toTray(i)
          setPhase('tray')
        }
      }
    }
    if (ctl.current!.phase === 'pour' && waiting === 0 && st.clock > 0.25 + N * 0.045 + 1.2) setPhase('idle')

    // tray capsule: settle → clickable
    if (st.tray >= 0 && st.state[st.tray] === B_TRAY) {
      const rb = list[st.tray]
      const v = rb.linvel()
      st.trayT += dt
      st.trayStill = Math.hypot(v.x, v.y, v.z) < 0.08 ? st.trayStill + dt : 0
      if (ctl.current!.phase === 'tray' && (st.trayStill > 0.25 || st.trayT > 2.6)) setPhase('ready')
    }

    // agitator follows the crank
    const ag = agitBody.current
    if (ag) {
      st.q.setFromAxisAngle(st.yAxis, -st.disp * 1.15)
      ag.setNextKinematicRotation(st.q)
    }
    world.timestep = dt
    world.step()
  }

  const dispense = () => {
    if (ctl.current!.phase !== 'idle') return false
    const list = bodies.current
    let best = -1
    let bd = 1e9
    for (let i = 0; i < N; i++) {
      if (st.state[i] !== B_GLOBE) continue
      const t = list[i].translation()
      const d = Math.hypot(t.x - HOLE.x, t.z - HOLE.z) + (t.y - FLOOR_Y) * 1.4
      if (d < bd) {
        bd = d
        best = i
      }
    }
    if (best < 0) return false
    const rb = list[best]
    const t = rb.translation()
    const r = rb.rotation()
    st.sinkFrom.set([t.x, t.y, t.z], best * 3)
    st.sinkQ.set([r.x, r.y, r.z, r.w], best * 4)
    rb.setEnabled(false)
    st.state[best] = B_SINK
    st.t[best] = 0
    setPhase('drop')
    const c = ctl.current!
    if (c.userTurn && c.soundOn) c.sound?.thunk()
    st.nudgeV -= 2.5
    return true
  }

  /* ---- confetti */
  const burst = (count: number, gold: boolean) => {
    const cam = camera.position
    st.cCount = count
    for (let i = 0; i < 170; i++) {
      if (i >= count) {
        st.cLife[i] = -1
        continue
      }
      const a = Math.random() * TAU
      const up = 0.35 + Math.random() * 0.9
      const sp = 2.2 + Math.random() * 3.6
      st.cPos.set([P_REVEAL.x, P_REVEAL.y, P_REVEAL.z], i * 3)
      // spray mostly sideways + up, a little toward the camera
      st.v.set(Math.cos(a), up, Math.sin(a) * 0.45).normalize().multiplyScalar(sp)
      st.v2.copy(cam).sub(P_REVEAL).normalize().multiplyScalar(0.6 * Math.random())
      st.cVel.set([st.v.x + st.v2.x, st.v.y + st.v2.y, st.v.z + st.v2.z], i * 3)
      st.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      st.cAxis.set([st.v.x, st.v.y, st.v.z], i * 3)
      st.cRot[i] = Math.random() * TAU
      st.cSpin[i] = (Math.random() - 0.5) * 22
      st.cLife[i] = 1.9 + Math.random() * 0.9
      const k = gold && i % 3 === 0 ? '#ffcf4a' : CONFETTI_COLORS[(i * 3 + (i >> 2)) % CONFETTI_COLORS.length]
      res.conf.setColorAt(i, st.col.set(k))
    }
    res.conf.instanceColor!.needsUpdate = true
  }

  /* ---- actions */
  const autoTurn = (auto: boolean) => {
    const c = ctl.current!
    if (c.dragging) return
    c.auto = auto
    c.userTurn = !auto
    c.turnAnim?.stop()
    const raw = c.raw.get()
    const target = (Math.floor(raw / TAU + 0.04) + 1) * TAU
    c.turnAnim = animate(c.raw, target, { duration: 1.55, ease: [0.42, 0, 0.3, 1] })
  }

  const open = async (auto: boolean) => {
    const c = ctl.current!
    if (c.phase !== 'ready' || st.tray < 0) return
    c.auto = auto
    const i = st.tray
    const rb = bodies.current[i]
    const t = rb.translation()
    const r = rb.rotation()
    st.revealFrom.set(t.x, t.y, t.z)
    st.revealQ.set(r.x, r.y, r.z, r.w)
    rb.setEnabled(false)
    st.state[i] = B_REVEAL
    st.tray = -1
    const [top, bot] = CAPSULE_COLORS[st.colour[i]]
    res.mats.halfTop.color.set(top)
    res.mats.halfBot.color.set(bot)
    const prize = rollPrize(c.sinceLegend)
    c.sinceLegend = prize.rarity === 2 ? 0 : c.sinceLegend + 1
    st.rarity = prize.rarity
    st.prizeId = prize.id
    for (const k of Object.keys(res.prizes) as PrizeId[]) res.prizes[k].root.visible = k === prize.id
    const seq = ++st.seq
    st.popAt = -1
    st.lift.set(0)
    st.twist.set(0)
    st.open.set(0)
    st.pop.set(0)
    st.out.set(0)
    setPhase('reveal')
    animate(st.veil, 1, { duration: 0.7, ease: [0.23, 1, 0.32, 1] })
    await animate(st.lift, 1, { type: 'spring', duration: 0.85, bounce: 0.18 })
    if (seq !== st.seq) return
    await animate(st.twist, 1, { duration: 0.62, ease: [0.55, 0, 0.45, 1] })
    if (seq !== st.seq) return
    st.popAt = st.clock
    const fx = RARITY_FX[prize.rarity]
    burst(fx.confetti, prize.rarity === 2)
    if (!c.auto && c.soundOn && c.sound) {
      c.sound.pop()
      c.sound.chime(prize.rarity)
    }
    animate(st.open, 1, { duration: 0.95, ease: [0.16, 1, 0.3, 1] })
    animate(st.pop, 1, { type: 'spring', stiffness: 230, damping: 13 })
    c.pulls++
    onPrize(prize, false)
    setPhase('shown')
  }

  const collect = async () => {
    const c = ctl.current!
    if (c.phase !== 'shown') return
    const seq = ++st.seq
    setPhase('collect')
    onPrize(null, true)
    animate(st.veil, 0, { duration: 0.7, ease: [0.4, 0, 0.2, 1] })
    await animate(st.out, 1, { duration: 0.5, ease: [0.55, 0, 0.75, 0.2] })
    if (seq !== st.seq) return
    // refill: the opened capsule drops back in through the lid with a new colour
    for (let i = 0; i < N; i++) {
      if (st.state[i] !== B_REVEAL) continue
      paint(i, Math.floor(Math.random() * CAPSULE_COLORS.length))
      spawnTop(i, true)
      st.lidV += 6
    }
    st.popAt = -1
    setPhase('idle')
  }

  api.current = { autoTurn, open: (a) => void open(a), collect: () => void collect() }
  useEffect(
    () => () => {
      api.current = null
      st.seq++
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /* ---- crank drag (angle around the projected crank centre; works for touch) */
  useEffect(() => {
    const el = gl.domElement
    const drag = { on: false, a: 0, t: 0, vel: 0, moved: 0, x0: 0, y0: 0, id: -1 }
    const org = { x: 0, y: 0 }
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
      drag.moved += Math.abs(d)
      let raw = c.raw.get() + d
      c.ratchet = Math.max(c.ratchet, Math.floor(raw / DET + 1e-4) * DET)
      raw = Math.max(raw, c.ratchet - 0.14)
      c.raw.set(raw)
      drag.vel = THREE.MathUtils.lerp(drag.vel, d / dt, 0.45)
      c.lastUser = now
    }
    const up = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      drag.on = false
      const c = ctl.current!
      c.dragging = false
      c.lastUser = performance.now()
      document.body.style.cursor = ''
      const tap = drag.moved < 0.12 && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8
      if (tap) {
        autoTurn(false)
        return
      }
      const raw = c.raw.get()
      const v = performance.now() - drag.t > 120 ? 0 : THREE.MathUtils.clamp(drag.vel, -4, 16)
      if (v > 0.8) {
        c.turnAnim = animate(c.raw, raw, {
          type: 'inertia',
          velocity: v,
          power: 0.55,
          timeConstant: 240,
          min: c.ratchet - 0.14,
          modifyTarget: (x: number) => Math.ceil(x / DET) * DET,
          bounceStiffness: 400,
          bounceDamping: 30,
        })
      } else {
        const tgt = Math.max(c.ratchet, Math.round(raw / DET) * DET)
        c.turnAnim = animate(c.raw, tgt, { type: 'spring', stiffness: 380, damping: 28 })
      }
    }
    const start = (e: PointerEvent) => {
      const c = ctl.current!
      c.turnAnim?.stop()
      c.dragging = true
      c.userTurn = true
      c.auto = false
      c.lastUser = performance.now()
      const r = el.getBoundingClientRect()
      org.x = r.left + c.crankScreen.x
      org.y = r.top + c.crankScreen.y
      drag.on = true
      drag.id = e.pointerId
      drag.a = angle(e)
      drag.t = performance.now()
      drag.vel = 0
      drag.moved = 0
      drag.x0 = e.clientX
      drag.y0 = e.clientY
      document.body.style.cursor = 'grabbing'
    }
    ;(el as HTMLCanvasElement & { __gcStart?: (e: PointerEvent) => void }).__gcStart = start
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl])

  const onReady = () => {
    if (POSTER) return
    ctl.current!.phaseAt = performance.now()
  }
  useStagedStudio(root, onReady)

  /* ---- frame */
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const list = bodies.current
    if (!worldRef.current || list.length === 0) return
    // the reveal spot sits between the camera and the machine, a little above centre
    st.v.copy(camera.position).sub(LOOK).normalize()
    P_REVEAL.copy(LOOK).addScaledVector(st.v, 6.4)
    P_REVEAL.y += 0.35

    // crank → display angle with magnetic detents; ticks + full turns
    const raw = c.raw.get()
    st.prevDisp = st.disp
    st.disp = magnet(raw)
    const det = Math.floor(raw / DET + 1e-4)
    if (det !== c.detent) {
      if (det > c.detent) {
        if (c.userTurn && c.soundOn) c.sound?.tick(0.9)
        st.nudgeV += 1.6
        // a detent knocks the bottom of the pile
        for (let i = 0; i < N; i++) {
          if (st.state[i] !== B_GLOBE || Math.random() > 0.35) continue
          const t = list[i].translation()
          if (t.y > FLOOR_Y + 0.8) continue
          list[i].applyImpulse({ x: (Math.random() - 0.5) * 0.05, y: 0.05 + Math.random() * 0.07, z: (Math.random() - 0.5) * 0.05 }, true)
        }
      }
      c.detent = det
    }
    const turn = Math.floor(raw / TAU + 1e-4)
    if (turn > c.turns) {
      c.turns = turn
      dispense()
    }
    c.ratchet = Math.max(c.ratchet, det * DET)

    // fixed-step physics
    if (!POSTER) {
      st.acc = Math.min(st.acc + dt, STEP * 4)
      while (st.acc >= STEP) {
        simulate(STEP)
        st.acc -= STEP
      }
    }

    // springs: machine nudge, flap, lid
    st.nudgeV += (-st.nudge * 260 - st.nudgeV * 14) * dt
    st.nudge += st.nudgeV * dt
    st.lidV += (-st.lid * 200 - st.lidV * 9) * dt
    st.lid += st.lidV * dt
    let flapT = 0
    if (st.tray >= 0) {
      const t = list[st.tray].translation()
      if (t.y < 1) flapT = THREE.MathUtils.clamp((t.z + CAP_R - 1.12) / 0.45, 0, 1) * (t.z < 1.36 ? 1.25 : 0)
    }
    st.flapV += ((flapT - st.flap) * 140 - st.flapV * 9) * dt
    st.flap += st.flapV * dt

    if (machine.current) {
      machine.current.rotation.z = st.nudge * 0.006
      machine.current.position.y = Math.min(0, st.nudge) * 0.012
    }
    if (crankRef.current) crankRef.current.rotation.z = -st.disp
    if (agitRef.current) agitRef.current.rotation.y = -st.disp * 1.15
    if (flapRef.current) flapRef.current.rotation.x = -Math.max(0, st.flap)
    if (lidRef.current) lidRef.current.position.y = GLOBE_Y + GLOBE_R - 0.04 + Math.max(0, st.lid) * 0.02

    // capsules
    const m = capsMesh.current!
    for (let i = 0; i < N; i++) {
      const s = st.state[i]
      if (s === B_GLOBE || s === B_TRAY) {
        const t = list[i].translation()
        const r = list[i].rotation()
        const sc = st.scale[i]
        st.p.set(t.x, t.y, t.z)
        st.q.set(r.x, r.y, r.z, r.w)
        st.s.setScalar(sc < 1 ? 1 - Math.pow(1 - sc, 3) : 1)
        st.m.compose(st.p, st.q, st.s)
      } else if (s === B_SINK) {
        const k = Math.min(1, st.t[i] / 0.5)
        const a = Math.min(1, k / 0.55)
        const e = a * a * (3 - 2 * a)
        const fx = st.sinkFrom[i * 3]
        const fy = st.sinkFrom[i * 3 + 1]
        const fz = st.sinkFrom[i * 3 + 2]
        const down = k < 0.55 ? 0 : Math.pow((k - 0.55) / 0.45, 2) * 0.75
        st.p.set(THREE.MathUtils.lerp(fx, HOLE.x, e), THREE.MathUtils.lerp(fy, FLOOR_Y + CAP_R * 0.9, e) - down, THREE.MathUtils.lerp(fz, HOLE.z, e))
        st.q.set(st.sinkQ[i * 4], st.sinkQ[i * 4 + 1], st.sinkQ[i * 4 + 2], st.sinkQ[i * 4 + 3])
        st.s.setScalar(1)
        st.m.compose(st.p, st.q, st.s)
      } else st.m.makeScale(0, 0, 0)
      m.setMatrixAt(i, st.m)
    }
    m.instanceMatrix.needsUpdate = true
    m.boundingSphere = null

    // reveal capsule + prize
    const rg = revealRef.current!
    const lift = st.lift.get()
    const inReveal = c.phase === 'reveal' || c.phase === 'shown' || c.phase === 'collect'
    rg.visible = inReveal && st.open.get() < 0.999
    if (rg.visible) {
      const k = Math.min(1, Math.max(0, lift))
      st.p.lerpVectors(st.revealFrom, P_REVEAL, lift)
      st.p.y += Math.sin(Math.PI * k) * 0.9
      const tw = st.twist.get()
      const shake = Math.sin(Math.PI * tw) * 0.03
      st.p.x += Math.sin(state.clock.elapsedTime * 57) * shake
      st.p.y += Math.cos(state.clock.elapsedTime * 49) * shake * 0.6
      rg.position.copy(st.p)
      rg.quaternion.slerpQuaternions(st.revealQ, st.faceQ, k)
      rg.scale.setScalar(THREE.MathUtils.lerp(1, REVEAL_SCALE, lift))
      const o = st.open.get()
      const fade = 1 - THREE.MathUtils.smoothstep(o, 0.4, 0.95)
      const th = topHalf.current!
      const bh = botHalf.current!
      th.rotation.set(-o * 1.3, tw * 2.4 + o * 0.6, o * 0.4)
      th.position.set(o * 0.12, o * 0.62, -o * 0.25)
      th.scale.setScalar(Math.max(0.001, fade))
      bh.rotation.set(o * 0.8, -tw * 0.7, -o * 0.3)
      bh.position.set(-o * 0.05, -o * 0.5, -o * 0.1)
      bh.scale.setScalar(Math.max(0.001, fade))
    }
    const pg = prizeRef.current!
    const pop = st.pop.get()
    const out = st.out.get()
    pg.visible = inReveal && pop > 0.001
    const time = state.clock.elapsedTime
    if (pg.visible) {
      st.v2.setFromMatrixColumn(camera.matrixWorld, 0)
      pg.position.copy(P_REVEAL).addScaledVector(st.v2, -out * 2.6)
      pg.position.y += Math.sin(time * 1.7) * 0.05 - out * 1.2
      pg.quaternion.copy(camera.quaternion)
      st.q.setFromEuler(st.e.set(-0.1, Math.sin(time * 0.8) * 0.55 + out * 4, 0))
      pg.quaternion.multiply(st.q)
      pg.scale.setScalar(Math.max(0.001, pop * (1 - out) * 0.8))
      const pr = res.prizes[st.prizeId]
      if (pr.flame) {
        const f = 0.85 + Math.sin(time * 31) * 0.1 + Math.sin(time * 17) * 0.08
        pr.flame.scale.set(1, f, 1)
      }
      if (pr.sparkles) {
        pr.sparkles.children.forEach((ch, j) => {
          const s = Math.max(0, Math.sin(time * 3.1 + j * 1.7)) * 1.2
          ch.scale.setScalar(s * [1, 0.7, 0.6, 0.5][j])
          ch.rotation.z = time * 0.8 + j
        })
      }
    }

    // fx backdrop + veil face the camera
    const fxm = fxRef.current!
    const veil = veilRef.current!
    st.v.copy(camera.position).sub(P_REVEAL).normalize()
    fxm.position.copy(P_REVEAL).addScaledVector(st.v, -0.6)
    fxm.quaternion.copy(camera.quaternion)
    veil.position.copy(P_REVEAL).addScaledVector(st.v, -1.4)
    veil.quaternion.copy(camera.quaternion)
    const vk = st.veil.get()
    res.mats.veil.opacity = vk * 0.66
    veil.visible = vk > 0.002
    const u = res.mats.fx.uniforms
    const since = st.popAt < 0 ? -1 : st.clock - st.popAt
    const fxd = RARITY_FX[st.rarity]
    const show = since < 0 ? 0 : Math.min(1, since * 4) * (1 - out)
    fxm.visible = show > 0.002
    if (fxm.visible) {
      u.uTime.value = time
      u.uAlpha.value = show
      u.uGlow.value = fxd.glow
      u.uRays.value = fxd.rays * Math.min(1, since * 1.5)
      u.uRing.value = Math.min(1.2, since * 1.15)
      u.uRingA.value = fxd.ring * Math.max(0, 1 - since * 0.95)
      u.uColor.value.set(fxd.c1)
      u.uColor2.value.set(fxd.c2)
      fxm.scale.setScalar(4.6 + (st.rarity === 2 ? 1.2 : 0))
    }

    // confetti
    const cm = confRef.current!
    if (st.cCount > 0) {
      let alive = 0
      for (let i = 0; i < st.cCount; i++) {
        let life = st.cLife[i]
        if (life <= 0) {
          cm.setMatrixAt(i, st.m.makeScale(0, 0, 0))
          continue
        }
        alive++
        life -= dt
        st.cLife[i] = life
        const j = i * 3
        const drag = Math.exp(-dt * 2.2)
        st.cVel[j] *= drag
        st.cVel[j + 1] = st.cVel[j + 1] * drag - 5.5 * dt
        st.cVel[j + 2] *= drag
        st.cPos[j] += st.cVel[j] * dt + Math.sin(time * 6 + i) * dt * 0.25
        st.cPos[j + 1] += st.cVel[j + 1] * dt
        st.cPos[j + 2] += st.cVel[j + 2] * dt
        st.cRot[i] += st.cSpin[i] * dt
        st.p.set(st.cPos[j], st.cPos[j + 1], st.cPos[j + 2])
        st.v2.set(st.cAxis[j], st.cAxis[j + 1], st.cAxis[j + 2])
        st.q.setFromAxisAngle(st.v2, st.cRot[i])
        st.s.setScalar(Math.min(1, life * 2.5))
        cm.setMatrixAt(i, st.m.compose(st.p, st.q, st.s))
      }
      cm.instanceMatrix.needsUpdate = true
      if (alive === 0) st.cCount = 0
    }

    // DOM anchors: crank centre (for the rotary drag), tray bubble, prize card
    const W = state.size.width
    const H = state.size.height
    st.p.copy(CRANK).project(camera)
    c.crankScreen.x = (st.p.x * 0.5 + 0.5) * W
    c.crankScreen.y = (-st.p.y * 0.5 + 0.5) * H
    const sk = sinks.current
    if (sk.bubble) {
      if (st.tray >= 0 && c.phase === 'ready') {
        const t = list[st.tray].translation()
        st.p.set(t.x, t.y + 0.5, t.z).project(camera)
        sk.bubble.style.transform = `translate(${(st.p.x * 0.5 + 0.5) * W}px, ${(-st.p.y * 0.5 + 0.5) * H}px)`
        sk.bubble.style.visibility = 'visible'
      } else sk.bubble.style.visibility = 'hidden'
    }
    if (sk.card) {
      st.p.set(P_REVEAL.x, P_REVEAL.y - 0.92, P_REVEAL.z).project(camera)
      sk.card.style.transform = `translate(${(st.p.x * 0.5 + 0.5) * W}px, ${(-st.p.y * 0.5 + 0.5) * H}px)`
    }
  })

  const startCrank = (e: { nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    if (POSTER) return
    e.stopPropagation()
    const el = gl.domElement as HTMLCanvasElement & { __gcStart?: (e: PointerEvent) => void }
    el.__gcStart?.(e.nativeEvent)
  }
  const hover = (on: boolean) => {
    if (!ctl.current!.dragging) document.body.style.cursor = on ? 'grab' : ''
  }
  const { mats, geos } = res

  return (
    <group ref={root} visible={false}>
      {/* soft floor shadow */}
      <mesh geometry={geos.plane} material={mats.shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0.25]} scale={[5.4, 4.4, 1]} />
      <group ref={machine}>
        {/* base */}
        <mesh geometry={geos.plinth} material={mats.plinth} position={[0, 0.08, 0]} />
        <mesh geometry={geos.base} material={mats.red} position={[0, 0.12 + 1.2, 0]} />
        <mesh geometry={geos.trim} material={mats.cream} position={[0, BASE_TOP - 0.05, 0]} />
        <mesh geometry={geos.collar} material={mats.cream} position={[0, BASE_TOP + 0.08, 0]} />
        {/* plaque */}
        <mesh geometry={geos.plaqueFrame} material={mats.cream} position={[0, 2.21, FRONT_Z + 0.01]} />
        <mesh geometry={geos.plane} material={mats.plaque} position={[0, 2.21, FRONT_Z + 0.042]} scale={[1.64, 0.41, 1]} />
        {/* price + coin slot */}
        <mesh geometry={geos.circle} material={mats.price} position={[-0.88, 1.5, FRONT_Z + 0.004]} scale={0.27} />
        <mesh geometry={geos.slotPlate} material={mats.steel} position={[0.88, 1.5, FRONT_Z + 0.01]} />
        <mesh geometry={geos.slot} material={mats.ink} position={[0.88, 1.53, FRONT_Z + 0.04]} />
        {/* crank */}
        <mesh geometry={geos.crankPlate} material={mats.cream} position={[CRANK.x, CRANK.y, FRONT_Z + 0.04]} rotation={[Math.PI / 2, 0, 0]} />
        <mesh geometry={geos.crankRing} material={mats.redDeep} position={[CRANK.x, CRANK.y, FRONT_Z + 0.08]} />
        <group ref={crankRef} position={[CRANK.x, CRANK.y, FRONT_Z + 0.17]}>
          <mesh geometry={geos.crankBar} material={mats.cream} />
          <mesh geometry={geos.crankCap} material={mats.red} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.06]} />
          <mesh geometry={geos.crankDot} material={mats.red} position={[0.35, 0, 0.09]} />
        </group>
        <mesh
          geometry={geos.circle}
          material={mats.hit}
          position={[CRANK.x, CRANK.y, FRONT_Z + 0.3]}
          scale={0.6}
          onPointerDown={startCrank}
          onPointerOver={() => hover(true)}
          onPointerOut={() => hover(false)}
        />
        {/* door, flap, tray */}
        <mesh geometry={geos.doorFrame} material={mats.cream} position={[0, DOOR_Y, FRONT_Z + 0.0]} />
        <mesh geometry={geos.doorHole} material={mats.ink} position={[0, DOOR_Y, FRONT_Z + 0.032]} />
        <group ref={flapRef} position={[0, DOOR_Y + 0.31, FRONT_Z + 0.05]}>
          <mesh geometry={geos.flap} material={mats.flap} position={[0, -0.31, 0]} />
        </group>
        <mesh geometry={geos.trayBed} material={mats.cream} position={[0, 0.2, 1.45]} />
        <mesh geometry={geos.trayLip} material={mats.red} position={[0, 0.4, 1.8]} />
        <mesh geometry={geos.trayCheek} material={mats.cream} position={[0.56, 0.4, 1.45]} />
        <mesh geometry={geos.trayCheek} material={mats.cream} position={[-0.56, 0.4, 1.45]} />
        {/* globe */}
        <mesh geometry={geos.floor} material={mats.floor} position={[0, FLOOR_Y - 0.05, 0]} />
        <mesh geometry={geos.hole} material={mats.ink} position={[HOLE.x, FLOOR_Y + 0.002, HOLE.z]} rotation={[-Math.PI / 2, 0, 0]} />
        <group ref={agitRef} position={[0, FLOOR_Y, 0]}>
          {[0, 1, 2].map((k) => {
            const a = (k / 3) * TAU
            return <mesh key={k} geometry={geos.arm} material={mats.yellow} position={[Math.cos(a) * 0.5, 0.09, -Math.sin(a) * 0.5]} rotation={[0, a, 0]} />
          })}
          <mesh geometry={geos.hub} material={mats.cream} position={[0, 0.12, 0]} />
        </group>
        <primitive
          object={res.caps}
          ref={capsMesh}
          onClick={(e: { instanceId?: number; stopPropagation: () => void }) => {
            if (e.instanceId == null || e.instanceId !== st.tray || ctl.current!.phase !== 'ready') return
            e.stopPropagation()
            ctl.current!.lastUser = performance.now()
            void open(false)
          }}
          onPointerMove={(e: { instanceId?: number }) => {
            if (ctl.current!.dragging) return
            const on = e.instanceId != null && e.instanceId === st.tray && ctl.current!.phase === 'ready'
            document.body.style.cursor = on ? 'pointer' : ''
          }}
          onPointerOut={() => !ctl.current!.dragging && (document.body.style.cursor = '')}
        />
        <mesh geometry={geos.globe} material={mats.glass} position={[0, GLOBE_Y, 0]} renderOrder={1} />
        <group ref={lidRef} position={[0, GLOBE_Y + GLOBE_R - 0.04, 0]}>
          <mesh geometry={geos.lid} material={mats.red} />
          <mesh geometry={geos.knob} material={mats.cream} position={[0, 0.13, 0]} />
        </group>
      </group>

      {/* reveal */}
      <mesh ref={veilRef} geometry={geos.plane} material={mats.veil} scale={60} renderOrder={2} visible={false} />
      <mesh ref={fxRef} geometry={geos.plane} material={mats.fx} renderOrder={3} visible={false} />
      <group ref={revealRef} visible={false}>
        <group ref={topHalf}>
          <mesh geometry={geos.halfTop} material={mats.halfTop} />
          <mesh geometry={geos.seam} material={mats.seam} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        <group ref={botHalf}>
          <mesh geometry={geos.halfBot} material={mats.halfBot} />
        </group>
      </group>
      <group ref={prizeRef} visible={false}>
        {(Object.keys(res.prizes) as PrizeId[]).map((k) => (
          <primitive key={k} object={res.prizes[k].root} />
        ))}
      </group>
      <primitive object={res.conf} ref={confRef} />
    </group>
  )
}

/* ------------------------------------------------------------------ camera rig */

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useFrame((state) => {
    const { width, height } = state.size
    const mobile = width < 760
    const aspect = width / height
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    let dist = 17.2
    dist = Math.max(dist, (mobile ? 5.3 : 5.4) / (2 * tanH * aspect))
    if (POSTER) dist *= 0.86
    const t = state.clock.elapsedTime
    const az = AZ + (POSTER ? 0 : Math.sin(t * 0.21) * 0.06)
    camera.position.set(Math.sin(az) * dist, LOOK.y + dist * 0.2, Math.cos(az) * dist)
    camera.lookAt(LOOK)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.155 : 0.0
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ DOM bits */

function PrizeIcon({ id }: { id: PrizeId }) {
  switch (id) {
    case 'duck':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <ellipse cx="11" cy="15" rx="7.5" ry="5.5" fill="#ffd23f" />
          <circle cx="13.5" cy="8.5" r="4.2" fill="#ffd23f" />
          <path d="M17.2 8.6l3.6 1-3.6 1.2z" fill="#ff8a2b" />
          <circle cx="14.6" cy="7.6" r="0.9" fill="#1e1a22" />
        </svg>
      )
    case 'coupon':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 7a1.5 1.5 0 011.5-1.5h15A1.5 1.5 0 0121 7v3a2 2 0 000 4v3a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17v-3a2 2 0 000-4z" fill="#ff5c7c" />
          <path d="M15.5 6.5v11" stroke="#fff" strokeOpacity=".6" strokeDasharray="1.4 1.4" />
          <text x="9" y="15.6" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff" fontFamily="system-ui">9</text>
        </svg>
      )
    case 'shroom':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M3 13a9 8 0 0118 0z" fill="#ef3b4c" />
          <circle cx="8" cy="9.5" r="1.3" fill="#fff1dc" />
          <circle cx="14.5" cy="8" r="1.6" fill="#fff1dc" />
          <circle cx="17.5" cy="11.5" r="1" fill="#fff1dc" />
          <path d="M9 13h6l.6 6.5a1.5 1.5 0 01-1.5 1.5h-4.2a1.5 1.5 0 01-1.5-1.5z" fill="#fff1dc" />
        </svg>
      )
    case 'rocket':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2.5c3 2.6 4 6.2 3.6 10.5H8.4C8 8.7 9 5.1 12 2.5z" fill="#f4f1ec" stroke="#d9d3cc" strokeWidth=".6" />
          <path d="M12 2.5c1.3 1.1 2.2 2.4 2.8 3.8H9.2c.6-1.4 1.5-2.7 2.8-3.8z" fill="#ff4f6e" />
          <circle cx="12" cy="9" r="1.7" fill="#7cc8ff" stroke="#2b2a33" strokeWidth=".8" />
          <path d="M8.4 11l-2.9 3.6v1.6l3.2-1.4zM15.6 11l2.9 3.6v1.6l-3.2-1.4z" fill="#ff4f6e" />
          <path d="M10 14h4l-2 6.5z" fill="#ffb02e" />
        </svg>
      )
    case 'star':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z" fill="#f5c04a" stroke="#d99e25" strokeWidth=".8" strokeLinejoin="round" />
          <path d="M12 7l1.5 3.2 3.4.4-2.6 2.3.7 3.4-3-1.7-3 1.7.7-3.4-2.6-2.3 3.4-.4z" fill="#4f6bff" />
        </svg>
      )
    case 'gem':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="gc-gem" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#9ff0ff" />
              <stop offset=".5" stopColor="#b9a4ff" />
              <stop offset="1" stopColor="#ff9fd0" />
            </linearGradient>
          </defs>
          <path d="M6.5 4h11l4 5.2L12 21 2.5 9.2z" fill="url(#gc-gem)" />
          <path d="M2.5 9.2h19M9 4l-1.6 5.2L12 21l4.6-11.8L15 4" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth=".7" />
        </svg>
      )
  }
}

type Pull = { n: number; prize: Prize }

/* ------------------------------------------------------------------ page */

export default function GachaMachine() {
  const ctl = useRef<Ctl>({
    phase: 'pour',
    phaseAt: performance.now(),
    raw: motionValue(0),
    ratchet: 0,
    turns: 0,
    detent: 0,
    userTurn: false,
    dragging: false,
    lastUser: -1e9,
    auto: false,
    sound: null,
    soundOn: true,
    sinceLegend: 2,
    pulls: 0,
    crankScreen: { x: 0, y: 0 },
    turnAnim: null,
  })
  const api = useRef<Api | null>(null)
  const sinks = useRef<Sinks>({ card: null, bubble: null })
  const [phase, setPhase] = useState<Phase>('pour')
  const [prize, setPrize] = useState<Prize | null>(null)
  const [pulls, setPulls] = useState<Pull[]>([])
  const [soundOn, setSoundOn] = useState(true)
  const pending = useRef<Prize | null>(null)
  const pullNo = useRef(0)

  const onPrize = (p: Prize | null, collected: boolean) => {
    if (p) {
      pending.current = p
      setPrize(p)
    } else if (collected) {
      const got = pending.current
      setPrize(null)
      if (got) {
        pullNo.current++
        const n = pullNo.current
        setPulls((h) => [{ n, prize: got }, ...h].slice(0, 9))
      }
      pending.current = null
    }
  }

  // first gesture unlocks audio
  const ensureSound = () => {
    const c = ctl.current
    c.lastUser = performance.now()
    if (c.sound || !c.soundOn) return
    try {
      c.sound = makeGachaSound()
    } catch {
      /* no audio */
    }
  }

  // idle loop: turn → open → collect, every ~8 s of inactivity
  useEffect(() => {
    if (POSTER) return
    let firstDone = false
    const id = window.setInterval(() => {
      const c = ctl.current
      const a = api.current
      if (!a || c.dragging) return
      const now = performance.now()
      const idle = now - c.lastUser
      const since = now - c.phaseAt
      if (c.phase === 'idle' && idle > 8000 && since > (firstDone ? 7000 : 1600)) {
        firstDone = true
        a.autoTurn(true)
      } else if (c.phase === 'ready' && (c.auto || idle > 7000) && since > 900) a.open(true)
      else if (c.phase === 'shown' && since > (c.auto ? 3600 : 9000)) a.collect()
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const user = () => {
    ensureSound()
    ctl.current.auto = false
  }
  const turnOnce = () => {
    user()
    api.current?.autoTurn(false)
  }
  const openNow = () => {
    user()
    api.current?.open(false)
  }
  const collectNow = () => {
    user()
    api.current?.collect()
  }
  const toggleSound = () => {
    const c = ctl.current
    c.soundOn = !c.soundOn
    setSoundOn(c.soundOn)
    c.lastUser = performance.now()
    if (c.soundOn) {
      ensureSound()
      c.sound?.tick(1)
    }
  }

  const legend = pulls.filter((p) => p.prize.rarity === 2).length
  const status =
    phase === 'pour'
      ? '扭蛋入仓中…'
      : phase === 'idle'
        ? '顺时针拖动把手转一圈'
        : phase === 'drop' || phase === 'tray'
          ? '咕咚——掉出来了'
          : phase === 'ready'
            ? '点托盘里的扭蛋打开'
            : phase === 'reveal'
              ? '拧开中…'
              : phase === 'shown'
                ? '点「收下」放进收藏'
                : '已收进收藏'
  const busy = phase !== 'idle'

  return (
    <div className="stage gc-stage" onPointerDownCapture={ensureSound}>
      <style>{`
        .gc-stage { background: radial-gradient(110% 90% at 68% 42%, #fffafb 0%, #f8edf0 48%, #f0dfe5 100%); touch-action: none; }
        .gc-stage .scrim { --soft-bg: #f6ebee; }
        .gc-stage .hero-copy h1 em { color: ${ACCENT}; font-style: normal; }
        .gc-stage .hero-copy h1 { font-size: clamp(36px, 4.2vw, 58px); }
        .gc-status { display: inline-flex; align-items: center; gap: 8px; height: 30px; margin-top: 22px; padding: 0 13px; border-radius: 999px; align-self: flex-start; font: 500 13px/1 var(--sans); color: var(--fg); background: rgba(255,255,255,.72); box-shadow: inset 0 0 0 1px rgba(60,20,35,.08); }
        .gc-status i { width: 7px; height: 7px; border-radius: 50%; background: ${ACCENT}; }
        .gc-status.busy i { animation: gc-pulse .7s ease-in-out infinite alternate; }
        @keyframes gc-pulse { to { opacity: .3; } }
        .gc-shelf { margin-top: 22px; }
        .gc-shelf-head { display: flex; align-items: baseline; gap: 10px; font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2); text-transform: uppercase; }
        .gc-shelf-head b { font: 600 13px/1 var(--mono); color: var(--fg); letter-spacing: 0; }
        .gc-row { display: flex; gap: 6px; margin-top: 12px; min-height: 40px; flex-wrap: wrap; }
        .gc-chip { position: relative; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(255,255,255,.8); box-shadow: inset 0 0 0 1px rgba(60,20,35,.08), 0 6px 14px -10px rgba(80,20,40,.5); }
        .gc-chip svg { width: 24px; height: 24px; }
        .gc-chip[data-r='1'] { box-shadow: inset 0 0 0 1.5px #8f78ff, 0 6px 14px -8px rgba(110,80,255,.6); }
        .gc-chip[data-r='2'] { background: linear-gradient(140deg, #fff8dc, #ffe7a8); box-shadow: inset 0 0 0 1.5px #f2b322, 0 6px 16px -6px rgba(255,170,20,.7); }
        .gc-chip[data-r='2']::after { content: ''; position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border-radius: 50%; background: #ffb21e; box-shadow: 0 0 0 2px #fff; }
        .gc-empty { width: 40px; height: 40px; border-radius: 12px; border: 1.5px dashed rgba(60,20,35,.14); }
        .gc-anchor { position: absolute; left: 0; top: 0; pointer-events: none !important; will-change: transform; }
        .gc-bubble { position: absolute; transform: translate(-50%, -100%); pointer-events: auto; cursor: pointer; padding: 7px 12px; border: 0; border-radius: 999px; font: 600 12.5px/1 var(--sans); color: #fff; background: ${INK}; white-space: nowrap; box-shadow: 0 8px 18px -8px rgba(40,10,20,.6); animation: gc-bob 1.1s ease-in-out infinite; }
        .gc-bubble::after { content: ''; position: absolute; left: 50%; bottom: -4px; width: 8px; height: 8px; background: ${INK}; transform: translateX(-50%) rotate(45deg); border-radius: 1px; }
        @keyframes gc-bob { 50% { margin-top: -5px; } }
        .gc-card { position: absolute; left: 0; top: 0; width: 248px; padding: 14px 16px 14px; border-radius: 18px; text-align: center; pointer-events: auto; background: rgba(255,255,255,.82); box-shadow: inset 0 0 0 1px rgba(60,20,35,.07), 0 22px 44px -22px rgba(80,20,40,.55); backdrop-filter: blur(14px) saturate(1.4); -webkit-backdrop-filter: blur(14px) saturate(1.4); }
        .gc-rar { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 10px; border-radius: 999px; font: 600 11px/1 var(--mono); letter-spacing: .06em; color: #6b5a62; background: rgba(60,20,35,.06); }
        .gc-card[data-r='1'] .gc-rar { color: #fff; background: linear-gradient(90deg, #8a6cff, #5f7bff); }
        .gc-card[data-r='2'] .gc-rar { color: #5a3a00; background: linear-gradient(90deg, #ffd85a, #ffb21e, #ffd85a); }
        .gc-card[data-r='2'] { box-shadow: inset 0 0 0 1.5px rgba(255,178,30,.6), 0 22px 50px -18px rgba(255,160,20,.65); }
        .gc-card b { display: block; margin-top: 10px; font: 650 22px/1.15 var(--display); letter-spacing: -0.01em; color: ${INK}; }
        .gc-card small { display: block; margin-top: 6px; font: 400 12.5px/1.4 var(--sans); color: #7a6870; }
        .gc-card .btn { height: 36px; margin-top: 12px; padding: 0 22px; font-size: 13px; }
        .gc-dock .seg[disabled] { opacity: .4; cursor: default; }
        @media (max-width: 760px) {
          .gc-stage .hero-copy h1 { font-size: 30px; }
          .gc-stage .hero-copy > p:not(.kicker) { display: none; }
          .gc-stage .hero-actions { display: none; }
          .gc-status { margin-top: 12px; }
          .gc-shelf { margin-top: 12px; }
          .gc-row { min-height: 34px; flex-wrap: nowrap; overflow: hidden; }
          .gc-chip, .gc-empty { width: 34px; height: 34px; flex: none; border-radius: 10px; }
          .gc-chip svg { width: 20px; height: 20px; }
          .gc-card { width: 220px; padding: 12px 14px; }
          .gc-card b { font-size: 19px; }
        }
      `}</style>
      <Canvas dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 200, position: [0, 4, 17] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}>
        <hemisphereLight args={['#ffffff', '#f0d6dd', 0.7]} />
        <directionalLight position={[-4, 8, 7]} intensity={1.5} color="#fff6ee" />
        <directionalLight position={[6, 3, 4]} intensity={0.55} color="#eef0ff" />
        <Rig />
        <Suspense fallback={null}>
          <Physics paused>
            <Machine ctl={ctl} api={api} sinks={sinks} onPhase={setPhase} onPrize={onPrize} />
          </Physics>
        </Suspense>
      </Canvas>

      <div className="overlay">
        <div className="gc-anchor" ref={(e) => void (sinks.current.bubble = e)} style={{ visibility: 'hidden' }}>
          <button className="gc-bubble" onClick={openNow}>
            点我拧开
          </button>
        </div>
        <div className="gc-anchor" ref={(e) => void (sinks.current.card = e)}>
          <AnimatePresence>
            {prize && (
              <motion.div
                key={pullNo.current + prize.id}
                className="gc-card"
                data-r={prize.rarity}
                style={{ x: '-50%' }}
                initial={{ opacity: 0, y: 18, scale: 0.92, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: 10, scale: 0.96, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 0.12 }}
              >
                <span className="gc-rar">
                  {prize.rarity === 2 ? '★ ' : prize.rarity === 1 ? '◆ ' : ''}
                  {RARITY_LABEL[prize.rarity]} · {RARITY_EN[prize.rarity]}
                </span>
                <b>{prize.name}</b>
                <small>{prize.desc}</small>
                <button className="btn primary" onClick={collectNow}>
                  收下
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Rapier · Capsule toys
          </p>
          <h1>
            转一圈，
            <br />
            看看<em>今天的运气</em>
          </h1>
          <p>
            {N} 颗物理扭蛋挤在玻璃仓里。顺时针拖动把手（或点一下自动转），底部拨片搅动整仓扭蛋，一颗从出口滚进托盘；点开它，普通 / 稀有 / 传说各有不同的揭晓光效。
          </p>
          <span className={`gc-status${busy ? ' busy' : ''}`}>
            <i />
            {status}
          </span>
          <div className="hero-actions">
            <button className="btn primary" onClick={phase === 'ready' ? openNow : phase === 'shown' ? collectNow : turnOnce} disabled={phase === 'pour'}>
              {phase === 'ready' ? '拧开扭蛋' : phase === 'shown' ? '收下' : '扭一次'}
            </button>
            <button className="btn" onClick={toggleSound}>
              声音：{soundOn ? '开' : '关'}
            </button>
          </div>
          <div className="gc-shelf">
            <div className="gc-shelf-head">
              收藏 <b>{pulls.length > 0 ? pullNo.current : 0}</b> 次 · 传说 <b>{legend}</b>
            </div>
            <div className="gc-row">
              <AnimatePresence initial={false} mode="popLayout">
                {pulls.map((p) => (
                  <motion.span
                    key={p.n}
                    layout
                    className="gc-chip"
                    data-r={p.prize.rarity}
                    title={`${p.prize.name} · ${RARITY_LABEL[p.prize.rarity]}`}
                    initial={{ opacity: 0, scale: 0.4, x: 40, rotate: -20 }}
                    animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  >
                    <PrizeIcon id={p.prize.id} />
                  </motion.span>
                ))}
              </AnimatePresence>
              {pulls.length === 0 && [0, 1, 2].map((k) => <span key={k} className="gc-empty" />)}
            </div>
          </div>
        </motion.div>

        <div className="dock gc-dock">
          <button className="seg" onClick={turnOnce} disabled={phase === 'pour'}>
            <span>扭一次</span>
          </button>
          <button className="seg" onClick={openNow} disabled={phase !== 'ready'}>
            <span>拧开</span>
          </button>
          <button className="seg" onClick={collectNow} disabled={phase !== 'shown'}>
            <span>收下</span>
          </button>
          <span className="dock-sep" />
          <button className="seg" onClick={toggleSound} aria-pressed={soundOn}>
            <span>声音 {soundOn ? '开' : '关'}</span>
          </button>
        </div>
        <p className="hint">拖动把手转一圈 · 点把手自动扭 · 每格有咔哒手感</p>
      </div>
    </div>
  )
}
