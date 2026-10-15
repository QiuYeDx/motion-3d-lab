import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { POSTER } from '../../lib/iso'
import { useStudioStart } from './studioEnv'
import {
  FACE_HEX,
  applyMove,
  facelets,
  isSolved,
  makeCube,
  moveName,
  pushHistory,
  randomScramble,
  type Cubie,
  type Move,
} from './rubikModel'

const Q = Math.PI / 2
const ACCENT = '#ff5a3c'

/* ------------------------------------------------------------------ click sound (opt-in, created on a user gesture) */

function makeClicker() {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  const len = Math.floor(ctx.sampleRate * 0.04)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  return (strength = 1) => {
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = 0.85 + Math.random() * 0.3
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 2600 + Math.random() * 500
    bp.Q.value = 1.4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.32 * strength, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(bp).connect(g).connect(ctx.destination)
    src.start(t)
    // a tiny low "thock" under the tick
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(240, t)
    o.frequency.exponentialRampToValueAtTime(120, t + 0.04)
    const og = ctx.createGain()
    og.gain.setValueAtTime(0.12 * strength, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    o.connect(og).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.06)
  }
}

/* ------------------------------------------------------------------ controller (shared by the scene and the DOM) */

type Turn = { axis: 0 | 1 | 2; layer: number; member: boolean[] }

type Ctl = {
  cubies: Cubie[]
  history: Move[]
  angle: MotionValue<number>
  turn: Turn | null
  busy: boolean // a layer is animating (snap or scripted)
  seq: number // running scripted sequence token (0 = none)
  dirty: boolean // model changed → rebuild base transforms
  lastUser: number
  orbiting: boolean
  intro: MotionValue<number>
  click: ((s?: number) => void) | null
  onCommit: (m: Move | null, src: Source) => void
}

type Source = 'user' | 'scramble' | 'solve' | 'undo'

function commitTurn(ctl: Ctl, quarters: number, src: Source) {
  const t = ctl.turn
  if (!t) return
  const q = (((quarters % 4) + 4) % 4) as 0 | 1 | 2 | 3
  let m: Move | null = null
  if (q) {
    m = { axis: t.axis, layer: t.layer, q }
    applyMove(ctl.cubies, m)
    if (src === 'user' || src === 'scramble') pushHistory(ctl.history, m)
    ctl.dirty = true
    ctl.click?.(src === 'scramble' || src === 'solve' ? 0.7 : 1)
  }
  ctl.turn = null
  ctl.angle.jump(0)
  ctl.busy = false
  ctl.onCommit(m, src)
}

function beginTurn(ctl: Ctl, axis: 0 | 1 | 2, layer: number) {
  ctl.turn = { axis, layer, member: ctl.cubies.map((c) => c.pos[axis] === layer) }
  ctl.angle.jump(0)
  ctl.busy = true
}

/* ------------------------------------------------------------------ geometry + materials */

function roundedRect(w: number, r: number) {
  const s = new THREE.Shape()
  const h = w / 2
  s.moveTo(-h + r, -h)
  s.lineTo(h - r, -h)
  s.quadraticCurveTo(h, -h, h, -h + r)
  s.lineTo(h, h - r)
  s.quadraticCurveTo(h, h, h - r, h)
  s.lineTo(-h + r, h)
  s.quadraticCurveTo(-h, h, -h, h - r)
  s.lineTo(-h, -h + r)
  s.quadraticCurveTo(-h, -h, -h + r, -h)
  return s
}

function useCubeAssets() {
  return useMemo(() => {
    const body = new RoundedBoxGeometry(0.95, 0.95, 0.95, 4, 0.1)
    const sticker = new THREE.ExtrudeGeometry(roundedRect(0.76, 0.14), {
      depth: 0.012,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 6,
    })
    sticker.computeVertexNormals()
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#141519',
      roughness: 0.38,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.32,
    })
    const stickerMats = FACE_HEX.map(
      (c) =>
        new THREE.MeshPhysicalMaterial({
          color: c,
          roughness: 0.3,
          metalness: 0,
          clearcoat: 1,
          clearcoatRoughness: 0.14,
        }),
    )
    const core = new THREE.SphereGeometry(1.32, 24, 16)
    return { body, sticker, bodyMat, stickerMats, core }
  }, [])
}

// orientation of a sticker whose outward normal is the given face (0..5 = +x −x +y −y +z −z)
const STICKER_ROT: [number, number, number][] = [
  [0, Math.PI / 2, 0],
  [0, -Math.PI / 2, 0],
  [-Math.PI / 2, 0, 0],
  [Math.PI / 2, 0, 0],
  [0, 0, 0],
  [0, Math.PI, 0],
]
const FACE_N: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]

/* ------------------------------------------------------------------ the cube */

function Cube({ ctl, rootRef, pickRef }: { ctl: Ctl; rootRef: React.RefObject<THREE.Group | null>; pickRef: React.RefObject<THREE.Object3D[]> }) {
  const a = useCubeAssets()
  const refs = useRef<(THREE.Group | null)[]>([])
  const shadowRef = useRef<THREE.Mesh>(null)
  const st = useMemo(
    () => ({
      basePos: ctl.cubies.map(() => new THREE.Vector3()),
      baseQ: ctl.cubies.map(() => new THREE.Quaternion()),
      m4: new THREE.Matrix4(),
      vx: new THREE.Vector3(),
      vy: new THREE.Vector3(),
      vz: new THREE.Vector3(),
      tq: new THREE.Quaternion(),
      axis: new THREE.Vector3(),
    }),
    [ctl],
  )
  const rebuild = () => {
    ctl.cubies.forEach((c, i) => {
      st.basePos[i].set(c.pos[0], c.pos[1], c.pos[2])
      const [r0, r1, r2] = c.rot
      st.vx.set(r0[0], r0[1], r0[2])
      st.vy.set(r1[0], r1[1], r1[2])
      st.vz.set(r2[0], r2[1], r2[2])
      st.m4.makeBasis(st.vx, st.vy, st.vz)
      st.baseQ[i].setFromRotationMatrix(st.m4)
    })
  }
  useMemo(rebuild, [ctl])

  useFrame(() => {
    if (ctl.dirty) {
      rebuild()
      ctl.dirty = false
    }
    const t = ctl.turn
    if (t) {
      st.axis.set(t.axis === 0 ? 1 : 0, t.axis === 1 ? 1 : 0, t.axis === 2 ? 1 : 0)
      st.tq.setFromAxisAngle(st.axis, ctl.angle.get())
    }
    for (let i = 0; i < ctl.cubies.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      g.position.copy(st.basePos[i])
      g.quaternion.copy(st.baseQ[i])
      if (t && t.member[i]) {
        g.position.applyQuaternion(st.tq)
        g.quaternion.premultiply(st.tq)
      }
    }
    if (shadowRef.current) {
      const s = ctl.intro.get()
      ;(shadowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, s)
    }
  })

  const shadowTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(30,34,48,0.55)')
    g.addColorStop(0.45, 'rgba(30,34,48,0.22)')
    g.addColorStop(1, 'rgba(30,34,48,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 128, 128)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  return (
    <>
      <mesh ref={shadowRef} position={[0, -3.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[6.4, 6.4]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0} />
      </mesh>
      <group ref={rootRef}>
        <mesh geometry={a.core} material={a.bodyMat} raycast={() => null} />
        {ctl.cubies.map((c, i) => (
          <group key={i} ref={(g) => void (refs.current[i] = g)}>
            <mesh
              geometry={a.body}
              material={a.bodyMat}
              userData={{ ci: i }}
              ref={(m) => {
                if (m && !pickRef.current.includes(m)) pickRef.current.push(m)
              }}
            />
            {c.stickers.map((s) => {
              const n = FACE_N[s]
              return (
                <mesh
                  key={s}
                  geometry={a.sticker}
                  material={a.stickerMats[s]}
                  position={[n[0] * 0.468, n[1] * 0.468, n[2] * 0.468]}
                  rotation={STICKER_ROT[s]}
                  userData={{ ci: i }}
                  ref={(m) => {
                    if (m && !pickRef.current.includes(m)) pickRef.current.push(m)
                  }}
                />
              )
            })}
          </group>
        ))}
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ interaction + camera rig */

const REST = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.52, -0.68, 0, 'XYZ'))

function Rig({ ctl, rootRef, pickRef, onReady }: { ctl: Ctl; rootRef: React.RefObject<THREE.Group | null>; pickRef: React.RefObject<THREE.Object3D[]>; onReady: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const { width, height } = useThree((s) => s.size)
  const st = useMemo(
    () => ({
      q: REST.clone(),
      wx: 0,
      wy: 0,
      autoYaw: 0,
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      mode: 'none' as 'none' | 'orbit' | 'pending' | 'turn',
      pid: -1,
      x0: 0,
      y0: 0,
      lx: 0,
      ly: 0,
      lt: 0,
      ci: -1,
      n: [0, 0, 0] as [number, number, number],
      pLocal: new THREE.Vector3(),
      hitW: new THREE.Vector3(),
      dirX: 0,
      dirY: 0,
      ppu: 1,
      sign: 1,
      vel: 0,
      lastA: 0,
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      camUp: new THREE.Vector3(),
      camRight: new THREE.Vector3(),
      rq: new THREE.Quaternion(),
      target: new THREE.Quaternion(),
      yawQ: new THREE.Quaternion(),
      time: 0,
      snap: null as AnimationPlaybackControls | null,
    }),
    [],
  )

  // procedural studio env + async shader compile before the cube is shown (no first-draw stall)
  useStudioStart(rootRef, onReady)

  // pointer handling (manual raycast so sticker drags vs. orbit drags are decided by us)
  useEffect(() => {
    const el = gl.domElement
    const toNdc = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect()
      st.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    }
    const toScreen = (v: THREE.Vector3, out: THREE.Vector3) => {
      const r = el.getBoundingClientRect()
      out.copy(v).project(camera)
      out.set(((out.x + 1) / 2) * r.width, ((1 - out.y) / 2) * r.height, 0)
      return out
    }
    const down = (e: PointerEvent) => {
      if (POSTER || st.pid !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return
      st.pid = e.pointerId
      el.setPointerCapture(e.pointerId)
      st.x0 = st.lx = e.clientX
      st.y0 = st.ly = e.clientY
      st.lt = performance.now()
      st.wx = st.wy = 0
      ctl.lastUser = performance.now()
      toNdc(e.clientX, e.clientY)
      st.ray.setFromCamera(st.ndc, camera)
      const hit = rootRef.current?.visible ? st.ray.intersectObjects(pickRef.current, false)[0] : undefined
      if (hit && !ctl.busy && !ctl.seq) {
        st.mode = 'pending'
        st.ci = hit.object.userData.ci as number
        st.hitW.copy(hit.point)
        st.pLocal.copy(hit.point)
        rootRef.current!.worldToLocal(st.pLocal)
        const p = st.pLocal
        const ax = Math.abs(p.x) >= Math.abs(p.y) && Math.abs(p.x) >= Math.abs(p.z) ? 0 : Math.abs(p.y) >= Math.abs(p.z) ? 1 : 2
        st.n = [0, 0, 0]
        st.n[ax] = Math.sign(p.getComponent(ax)) || 1
        el.style.cursor = 'grabbing'
      } else {
        st.mode = 'orbit'
        ctl.orbiting = true
        el.style.cursor = 'grabbing'
      }
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== st.pid) {
        if (st.pid === -1 && e.pointerType === 'mouse' && !POSTER) {
          toNdc(e.clientX, e.clientY)
          st.ray.setFromCamera(st.ndc, camera)
          const hit = rootRef.current?.visible && st.ray.intersectObjects(pickRef.current, false).length > 0
          el.style.cursor = hit ? 'grab' : 'default'
        }
        return
      }
      const now = performance.now()
      const dt = Math.max(1, now - st.lt) / 1000
      const dx = e.clientX - st.lx
      const dy = e.clientY - st.ly
      st.lx = e.clientX
      st.ly = e.clientY
      st.lt = now
      ctl.lastUser = now
      if (st.mode === 'orbit') {
        const k = 0.0085
        spin(dx * k, dy * k)
        st.wy = THREE.MathUtils.lerp(st.wy, (dx * k) / dt, 0.5)
        st.wx = THREE.MathUtils.lerp(st.wx, (dy * k) / dt, 0.5)
        return
      }
      const tx = e.clientX - st.x0
      const ty = e.clientY - st.y0
      if (st.mode === 'pending') {
        if (tx * tx + ty * ty < 64) return
        // candidate in-plane directions (±u, ±v): pick the one whose screen projection best matches the drag
        const len = Math.hypot(tx, ty)
        let best = -Infinity
        let bt = 0
        let bs = 1
        const A = toScreen(st.hitW, new THREE.Vector3())
        for (let axis = 0; axis < 3; axis++) {
          if (st.n[axis] !== 0) continue
          for (const s of [1, -1]) {
            st.tmp.copy(st.pLocal)
            st.tmp.setComponent(axis, st.tmp.getComponent(axis) + s * 0.5)
            rootRef.current!.localToWorld(st.tmp)
            toScreen(st.tmp, st.tmp2)
            const sx = st.tmp2.x - A.x
            const sy = st.tmp2.y - A.y
            const sl = Math.hypot(sx, sy) || 1e-6
            const score = (sx * tx + sy * ty) / (sl * len)
            if (score > best) {
              best = score
              bt = axis
              bs = s
              st.dirX = sx / sl
              st.dirY = sy / sl
              st.ppu = sl / 0.5
            }
          }
        }
        // rotation axis = n × t
        const n = st.n
        const t = [0, 0, 0]
        t[bt] = bs
        const ax = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]]
        const k = (ax[0] !== 0 ? 0 : ax[1] !== 0 ? 1 : 2) as 0 | 1 | 2
        st.sign = ax[k]
        const layer = ctl.cubies[st.ci].pos[k]
        beginTurn(ctl, k, layer)
        st.mode = 'turn'
        st.vel = 0
        st.lastA = 0
      }
      if (st.mode === 'turn') {
        const proj = tx * st.dirX + ty * st.dirY
        const a = (st.sign * proj) / st.ppu / 2.1
        ctl.angle.jump(a)
        st.vel = THREE.MathUtils.lerp(st.vel, (a - st.lastA) / dt, 0.45)
        st.lastA = a
      }
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== st.pid) return
      st.pid = -1
      el.style.cursor = 'default'
      ctl.lastUser = performance.now()
      if (performance.now() - st.lt > 80) st.wx = st.wy = 0
      if (st.mode === 'turn') {
        const a = ctl.angle.get()
        let n = Math.round((a + THREE.MathUtils.clamp(st.vel * 0.1, -0.7, 0.7)) / Q)
        n = Math.max(-2, Math.min(2, n))
        st.snap = animate(ctl.angle, n * Q, {
          type: 'spring',
          stiffness: 380,
          damping: 23,
          velocity: st.vel,
          restDelta: 0.0008,
          restSpeed: 0.02,
        })
        st.snap.finished.then(() => commitTurn(ctl, n, 'user'))
      }
      st.mode = 'none'
      ctl.orbiting = false
    }
    const spin = (ay: number, ax: number) => {
      camera.updateMatrixWorld()
      st.camUp.setFromMatrixColumn(camera.matrixWorld, 1)
      st.camRight.setFromMatrixColumn(camera.matrixWorld, 0)
      st.rq.setFromAxisAngle(st.camUp, ay)
      st.q.premultiply(st.rq)
      st.rq.setFromAxisAngle(st.camRight, ax)
      st.q.premultiply(st.rq)
      st.q.normalize()
    }
    ;(st as unknown as { spin: typeof spin }).spin = spin
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      st.snap?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    st.time += dt
    const root = rootRef.current
    // camera: fixed, the cube turns. Fit and offset for the hero column / phones.
    const mobile = width < 760
    const aspect = width / height
    const portrait = 1 / Math.min(1, aspect * (mobile ? 1.25 : 1.25))
    const d = 15.5 * portrait
    camera.position.set(0, 0.35 * d * 0.12, d)
    camera.lookAt(0, 0, 0)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.19 : 0.02
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()

    if (!root) return
    const spin = (st as unknown as { spin?: (a: number, b: number) => void }).spin
    const idle = performance.now() - ctl.lastUser > 4500
    if (!ctl.orbiting && spin && !POSTER) {
      // inertia
      if (Math.abs(st.wx) + Math.abs(st.wy) > 1e-4) {
        spin(st.wy * dt, st.wx * dt)
        const k = Math.exp(-dt * 3.2)
        st.wx *= k
        st.wy *= k
      }
      if (idle) {
        // drift back to a three-quarter view that slowly turns around the vertical
        st.autoYaw += dt * 0.22
        st.yawQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(st.autoYaw) * 0.55)
        st.target.copy(REST).premultiply(st.yawQ)
        st.q.slerp(st.target, 1 - Math.exp(-dt * 0.9))
      }
    }
    root.quaternion.copy(st.q)
    const s = ctl.intro.get()
    root.scale.setScalar(Math.max(0.001, s))
    root.position.y = POSTER ? 0 : Math.sin(st.time * 1.1) * 0.06
  })
  return null
}

/* ------------------------------------------------------------------ 2D net of the sticker model */

// face id → cell of the unfolded net:   U / L F R B / D
const NET_POS: Record<number, [number, number]> = { 2: [1, 0], 1: [0, 1], 4: [1, 1], 0: [2, 1], 5: [3, 1], 3: [1, 2] }

function Net({ cubies, version }: { cubies: Cubie[]; version: number }) {
  const f = useMemo(() => facelets(cubies), [cubies, version])
  return (
    <div className="rk-net" aria-hidden>
      {Object.entries(NET_POS).map(([face, [gx, gy]]) => (
        <div key={face} className="rk-face" style={{ gridColumn: gx + 1, gridRow: gy + 1 }}>
          {f[Number(face)].map((c, i) => (
            <i key={i} style={{ background: FACE_HEX[c] }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

export default function RubikCube() {
  const [version, setVersion] = useState(0)
  const [moves, setMoves] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'scramble' | 'solve' | 'undo'>('idle')
  const [solved, setSolved] = useState(true)
  const [histLen, setHistLen] = useState(0)
  const [ticker, setTicker] = useState<{ names: string[]; at: number; kind: string } | null>(null)
  const [sound, setSound] = useState(false)
  const timerRef = useRef<HTMLElement>(null)
  const rootRef = useRef<THREE.Group>(null)
  const pickRef = useRef<THREE.Object3D[]>([])
  const clock = useRef({ start: 0, end: 0, running: false })
  const ctl = useMemo<Ctl>(() => {
    const c: Ctl = {
      cubies: makeCube(),
      history: [],
      angle: motionValue(0),
      turn: null,
      busy: false,
      seq: 0,
      dirty: true,
      lastUser: -1e9,
      orbiting: false,
      intro: motionValue(POSTER ? 1 : 0),
      click: null,
      onCommit: () => {},
    }
    if (POSTER) {
      for (const m of randomScramble(7, 11)) applyMove(c.cubies, m)
      beginTurn(c, 1, 1)
      c.angle.jump(-0.42)
    }
    return c
  }, [])

  ctl.onCommit = (m, src) => {
    setVersion((v) => v + 1)
    setHistLen(ctl.history.length)
    const done = isSolved(ctl.cubies)
    setSolved(done)
    if (m && src !== 'scramble') {
      setMoves((n) => n + 1)
      if (!clock.current.running && !done && src === 'user' && clock.current.start === 0) {
        clock.current = { start: performance.now(), end: 0, running: true }
      }
    }
    if (done && clock.current.running) {
      clock.current.running = false
      clock.current.end = performance.now()
    }
  }

  // timer text without re-rendering
  useEffect(() => {
    let id = 0
    const tick = () => {
      const c = clock.current
      if (timerRef.current) timerRef.current.textContent = fmtTime(c.start ? (c.running ? performance.now() : c.end) - c.start : 0)
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  const runSeq = async (list: Move[], kind: 'scramble' | 'solve' | 'undo') => {
    if (ctl.seq || ctl.busy || !list.length) return
    const token = Math.random() + 1
    ctl.seq = token
    setPhase(kind)
    setTicker({ names: list.map(moveName), at: 0, kind })
    for (let i = 0; i < list.length; i++) {
      if (ctl.seq !== token) break
      const m = list[i]
      const signed = m.q === 3 ? -1 : m.q === 2 ? (Math.random() < 0.5 ? 2 : -2) : 1
      // scramble: quick with an accelerating cadence; solve: a touch slower so you can follow it
      const p = i / Math.max(1, list.length - 1)
      const base = kind === 'scramble' ? 0.2 - 0.09 * Math.sin(p * Math.PI) : kind === 'solve' ? 0.26 : 0.3
      const dur = base * (Math.abs(signed) === 2 ? 1.35 : 1)
      setTicker((t) => (t ? { ...t, at: i } : t))
      beginTurn(ctl, m.axis, m.layer)
      await animate(ctl.angle, signed * Q, { duration: dur, ease: [0.3, 1.32, 0.55, 1] }).finished
      commitTurn(ctl, signed, kind)
      if (kind !== 'undo') await new Promise((r) => setTimeout(r, kind === 'scramble' ? 22 : 60))
    }
    if (ctl.seq === token) ctl.seq = 0
    setPhase('idle')
    setTicker((t) => (t ? { ...t, at: list.length } : t))
    return true
  }

  const scramble = async () => {
    const list = randomScramble(20)
    clock.current = { start: 0, end: 0, running: false }
    setMoves(0)
    await runSeq(list, 'scramble')
    if (!isSolved(ctl.cubies)) clock.current = { start: performance.now(), end: 0, running: true }
  }
  const solve = async () => {
    const list = ctl.history
      .slice()
      .reverse()
      .map((m) => ({ ...m, q: (4 - m.q) as 1 | 2 | 3 }))
    ctl.history.length = 0
    setHistLen(0)
    await runSeq(list, 'solve')
  }
  const undo = async () => {
    const m = ctl.history.pop()
    if (!m) return
    setHistLen(ctl.history.length)
    await runSeq([{ ...m, q: (4 - m.q) as 1 | 2 | 3 }], 'undo')
  }

  const user = () => (ctl.lastUser = performance.now())

  // intro + idle loop: scramble → pause → rewind-solve → pause → …
  useEffect(() => {
    if (POSTER) return
    const anims: AnimationPlaybackControls[] = []
    let lastAuto = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      if (ctl.seq || ctl.busy || ctl.orbiting) return
      if (now - ctl.lastUser < 8000 || now - lastAuto < 3200) return
      lastAuto = now + 1e9 // block until this run finishes
      const run = isSolved(ctl.cubies) ? scramble() : solve()
      run.finally(() => (lastAuto = performance.now()))
    }, 300)
    return () => {
      window.clearInterval(id)
      anims.forEach((a) => a.stop())
      ctl.seq = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onReady = () => {
    if (POSTER) return
    animate(ctl.intro, 1, { type: 'spring', stiffness: 160, damping: 15 })
    // first idle scramble a little sooner than the normal idle wait
    ctl.lastUser = performance.now() - 6000
  }

  const clicker = useRef<((s?: number) => void) | null>(null)
  const toggleSound = () => {
    user()
    if (sound) {
      ctl.click = null
      setSound(false)
      return
    }
    try {
      clicker.current ??= makeClicker()
    } catch {
      return
    }
    ctl.click = clicker.current
    setSound(true)
    ctl.click(0.8)
  }

  const busy = phase !== 'idle'
  const status = phase === 'scramble' ? '打乱中…' : phase === 'solve' ? '倒放还原中…' : solved ? '已还原' : '待还原'

  return (
    <div className="stage rk-stage">
      <style>{`
        .rk-stage { background: radial-gradient(90% 80% at 68% 46%, #ffffff 0%, #f2f3f6 42%, #e6e9ee 100%); touch-action: none; }
        .rk-stage .scrim { --soft-bg: #f1f2f5; }
        .rk-stage .hero-copy h1 em { color: ${ACCENT}; }
        .rk-stage canvas { touch-action: none; }
        .rk-ring { position: absolute; left: 67%; top: 50%; width: min(58vh, 640px); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; border: 1px dashed rgba(40,46,60,0.12); pointer-events: none; }
        .rk-ring::after { content: ''; position: absolute; inset: 9%; border-radius: 50%; border: 1px solid rgba(40,46,60,0.06); }
        .rk-stats { display: flex; gap: 28px; margin-top: 26px; }
        .rk-stats div { display: flex; flex-direction: column; gap: 8px; }
        .rk-stats small { font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2); text-transform: uppercase; }
        .rk-stats b { font: 600 28px/1 var(--mono); letter-spacing: -0.02em; color: var(--fg); font-variant-numeric: tabular-nums; }
        .rk-status { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 999px; font: 500 13px/1 var(--sans) !important; background: rgba(255,255,255,.75); box-shadow: inset 0 0 0 1px rgba(30,30,40,.08); }
        .rk-status i { width: 7px; height: 7px; border-radius: 50%; background: #c3c7cf; }
        .rk-status.ok i { background: #19b46a; box-shadow: 0 0 0 3px rgba(25,180,106,.18); }
        .rk-status.run i { background: ${ACCENT}; animation: rk-pulse .7s ease-in-out infinite alternate; }
        @keyframes rk-pulse { to { opacity: .35; } }
        .rk-row { display: flex; align-items: center; gap: 18px; margin-top: 24px; }
        .rk-net { display: grid; grid-template-columns: repeat(4, auto); grid-template-rows: repeat(3, auto); gap: 3px; }
        .rk-face { display: grid; grid-template-columns: repeat(3, 9px); grid-auto-rows: 9px; gap: 1.5px; padding: 2px; border-radius: 4px; background: #17181c; }
        .rk-face i { border-radius: 2px; transition: background-color .1s; }
        .rk-ticker { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 18px; min-height: 22px; font: 500 12px/1 var(--mono); }
        .rk-ticker span { padding: 5px 6px; border-radius: 6px; color: var(--fg-2); background: rgba(30,32,40,.05); transition: background .15s, color .15s; }
        .rk-ticker span.done { color: rgba(40,40,50,.35); }
        .rk-ticker span.now { color: #fff; background: ${ACCENT}; }
        .rk-ticker em { align-self: center; margin-right: 4px; color: var(--fg-2); font-size: 11px; letter-spacing: .06em; }
        .rk-dock .seg[disabled] { opacity: .4; cursor: default; }
        .rk-dock .seg.on { color: var(--fg); background: color-mix(in srgb, var(--fg) 10%, transparent); }
        body.poster .rk-ring { left: 50%; }
        @media (max-width: 760px) {
          .rk-ring { left: 50%; top: 31%; width: 86vw; }
          .rk-stage .hero-copy p.rk-lede { display: none; }
          .rk-stage .hero-copy h1 { font-size: 34px; }
          .rk-net { display: none; }
          .rk-stats { gap: 20px; margin-top: 16px; }
          .rk-stats b { font-size: 22px; }
          .rk-row { margin-top: 14px; }
          .rk-ticker { display: none; }
        }
      `}</style>
      <div className="rk-ring" />
      <Canvas dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 200, position: [0, 0.5, 16] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[-4, 7, 6]} intensity={1.6} color="#fff8f0" />
        <directionalLight position={[7, 1.5, 4]} intensity={0.9} color="#eef2ff" />
        <directionalLight position={[2, -5, 4]} intensity={0.3} color="#dfe7ff" />
        <Cube ctl={ctl} rootRef={rootRef} pickRef={pickRef} />
        <Rig ctl={ctl} rootRef={rootRef} pickRef={pickRef} onReady={onReady} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> 3×3×3 · 26 块 · 54 张贴纸
          </p>
          <h1>
            拧一层，
            <br />
            再<em>倒放</em>回来
          </h1>
          <p className="rk-lede">按住任意色块朝一个方向拖，那一层就跟着手指转，松手后弹簧把它吸到最近的 90°。拖空白处转动整个魔方。每一步都被记下来，还原就是把它们反过来倒放。</p>
          <div className="rk-row">
            <span className={`rk-status ${busy ? 'run' : solved ? 'ok' : ''}`}>
              <i /> {status}
            </span>
          </div>
          <div className="rk-stats">
            <div>
              <small>步数</small>
              <b>{String(moves).padStart(2, '0')}</b>
            </div>
            <div>
              <small>用时</small>
              <b ref={timerRef}>00:00.0</b>
            </div>
            <div>
              <small>记录</small>
              <b>{String(histLen).padStart(2, '0')}</b>
            </div>
          </div>
          <div className="rk-ticker">
            {ticker && (
              <>
                <em>{ticker.kind === 'scramble' ? '打乱' : ticker.kind === 'solve' ? '倒放' : '撤销'}</em>
                {ticker.names.map((n, i) => (
                  <span key={i} className={i < ticker.at ? 'done' : i === ticker.at ? 'now' : ''}>
                    {n}
                  </span>
                ))}
              </>
            )}
          </div>
          <div className="rk-row">
            <Net cubies={ctl.cubies} version={version} />
          </div>
        </motion.div>

        <div className="dock rk-dock">
          <button
            className="seg"
            disabled={busy}
            onClick={() => {
              user()
              void scramble()
            }}
          >
            <span>打乱</span>
          </button>
          <button
            className="seg"
            disabled={busy || histLen === 0}
            onClick={() => {
              user()
              void solve()
            }}
          >
            <span>倒放还原{histLen ? ` · ${histLen} 步` : ''}</span>
          </button>
          <button
            className="seg"
            disabled={busy || histLen === 0}
            onClick={() => {
              user()
              void undo()
            }}
          >
            <span>撤销</span>
          </button>
          <span className="dock-sep" />
          <button className={`seg ${sound ? 'on' : ''}`} aria-pressed={sound} onClick={toggleSound}>
            <span>音效 {sound ? '开' : '关'}</span>
          </button>
        </div>
        <p className="hint">拖色块转层 · 拖空白处转魔方 · 闲置时自动打乱再倒放</p>
      </div>
    </div>
  )
}
