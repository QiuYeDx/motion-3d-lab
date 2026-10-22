import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { STUDIO, useStudioStart, type Softbox } from './studioEnv'

/* ------------------------------------------------------------------ the apparatus
   Pendulum n completes (N0 + n) swings in one period T, so f_n = (N0+n)/T and L_n = g / (2π f_n)².
   Every ball follows the exact small-angle solution θ_n(t) = A·cos(2π (N0+n) t / T + φ_n): the pattern is
   deterministic, perfectly periodic and freely scrubbable. */

const COUNT = 18
const N0 = 50
const T = 60
const L0 = 3.2 // scene length of pendulum 0 (the scale factor of g)
const LEN = Array.from({ length: COUNT }, (_, n) => L0 * (N0 / (N0 + n)) ** 2)
const DX = 0.36
const XS = Array.from({ length: COUNT }, (_, n) => (n - (COUNT - 1) / 2) * DX)
const TOP = 4.05
const VS = 0.2 // half-spread of the V where both strings meet the rail
const BALL_R = 0.15
const AMP = 0.3
const BASE_Y = 0.32
const BG = '#f2f0eb'
const NAVY = '#2f3a56'

type View = 'side' | 'top' | 'oblique'
const VIEWS: { value: View; label: string }[] = [
  { value: 'side', label: '侧面' },
  { value: 'top', label: '俯视' },
  { value: 'oblique', label: '斜角' },
]
// camera position / target per view (before aspect fitting)
const CAMS: Record<View, { p: [number, number, number]; t: [number, number, number] }> = {
  side: { p: [12.4, 3.0, 2.2], t: [0, 2.15, 0] },
  top: { p: [0, 16.2, 1.5], t: [0, 0.6, 0.1] },
  oblique: { p: [7.4, 5.6, 10.6], t: [0, 2.0, 0] },
}

const TOP_UPRIGHT = { p: [-2.6, 30, 0] as [number, number, number], t: [0, 0.6, 0] as [number, number, number] }

const MARKS: { f: number; label: string; frac: string }[] = [
  { f: 0, label: '对齐', frac: '0' },
  { f: 1 / 4, label: '四组', frac: 'T/4' },
  { f: 1 / 3, label: '三组', frac: 'T/3' },
  { f: 1 / 2, label: '两组交错', frac: 'T/2' },
  { f: 2 / 3, label: '三组', frac: '2T/3' },
  { f: 3 / 4, label: '四组', frac: '3T/4' },
  { f: 1, label: '重新对齐', frac: 'T' },
]

/** "<mark index>|<label>" — the index says which tick on the timeline lights up (-1: none) */
function patternOf(t: number) {
  const f = t / T
  for (let i = 0; i < MARKS.length; i++) if (Math.abs(f - MARKS[i].f) < 0.012) return `${i}|${MARKS[i].label}`
  if (f < 0.17 || f > 0.83) return '-1|蛇形'
  return '-1|乱序'
}

const mod = (a: number, n: number) => ((a % n) + n) % n
const fmt = (t: number) => `${t.toFixed(1).padStart(4, '0')} s`

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d', { willReadFrequently: true })!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const MONO = '"JetBrains Mono", "Cascadia Code", Consolas, monospace'
const SANS = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'

/** base top: pale stone with a centre line, swing gauges and a number under every pendulum */
function baseTopTex(bw: number, bd: number) {
  const W = 2048
  const H = Math.round((W * bd) / bw)
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#e9e4da'
    g.fillRect(0, 0, W, H)
    // faint stone grain
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = `rgba(${120 + Math.random() * 40},${110 + Math.random() * 30},${90 + Math.random() * 30},${Math.random() * 0.05})`
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 2)
    }
    const sx = W / bw
    const cy = H / 2
    // inset border
    g.strokeStyle = 'rgba(47,58,86,0.28)'
    g.lineWidth = 3
    g.strokeRect(26, 26, W - 52, H - 52)
    // centre line
    g.strokeStyle = 'rgba(47,58,86,0.55)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(70, cy)
    g.lineTo(W - 70, cy)
    g.stroke()
    // swing gauges: amplitude of each pendulum (L·sin A) as a short bar + tick
    g.font = `500 22px ${MONO}`
    g.textAlign = 'center'
    for (let n = 0; n < COUNT; n++) {
      const x = W / 2 + XS[n] * sx
      const a = LEN[n] * Math.sin(AMP) * sx
      g.strokeStyle = 'rgba(47,58,86,0.22)'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(x, cy - a)
      g.lineTo(x, cy + a)
      g.stroke()
      g.strokeStyle = 'rgba(47,58,86,0.5)'
      g.lineWidth = 3
      for (const s of [-1, 1]) {
        g.beginPath()
        g.moveTo(x - 9, cy + s * a)
        g.lineTo(x + 9, cy + s * a)
        g.stroke()
      }
      g.fillStyle = 'rgba(47,58,86,0.75)'
      g.beginPath()
      g.arc(x, cy, 5, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(47,58,86,0.6)'
      g.fillText(String(N0 + n), x, H - 52)
    }
    g.textAlign = 'left'
    g.fillStyle = 'rgba(47,58,86,0.55)'
    g.font = `600 22px ${MONO}`
    g.fillText('SWINGS / 60 s', 70, 66)
  })
}

/** front plaque on the plinth */
function plaqueTex() {
  return canvasTex(1536, 96, (g) => {
    g.fillStyle = '#e3ddd1'
    g.fillRect(0, 0, 1536, 96)
    g.fillStyle = NAVY
    g.fillRect(560, 16, 416, 64)
    g.fillStyle = '#efe4c8'
    g.font = `600 30px ${SANS}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('钟摆波  PENDULUM WAVE', 768, 49)
    g.fillStyle = 'rgba(47,58,86,0.7)'
    g.font = `500 22px ${MONO}`
    g.textAlign = 'left'
    g.fillText('L ∝ 1 / (50 + n)²', 60, 50)
    g.textAlign = 'right'
    g.fillText('T = 60 s · n = 0 … 17', 1476, 50)
  })
}

/* ------------------------------------------------------------------ shared state */

type Ctl = {
  time: MotionValue<number>
  pull: MotionValue<number>
  off: MotionValue<number>[]
  flash: Float32Array
  playing: boolean
  scrubbing: boolean
  speed: number
  view: View
  viewFrom: { p: THREE.Vector3; t: THREE.Vector3 }
  cur: { p: THREE.Vector3; t: THREE.Vector3 }
  viewK: MotionValue<number>
  sound: boolean
  audio: AudioContext | null
  lastTick: number
  hover: number
  lastUser: number
}

function tick(ctl: Ctl, n: number) {
  const ac = ctl.audio
  if (!ac || ac.state !== 'running') return
  const now = ac.currentTime
  if (now - ctl.lastTick < 0.012) return
  ctl.lastTick = now
  // pentatonic ladder: long pendulums low, short ones high
  const steps = [0, 2, 4, 7, 9]
  const semi = steps[n % 5] + 12 * Math.floor(n / 5)
  const f = 392 * 2 ** (semi / 12)
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.type = 'sine'
  o.frequency.value = f
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.035, now + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
  o.connect(g).connect(ac.destination)
  o.start(now)
  o.stop(now + 0.1)
}

/* ------------------------------------------------------------------ scene */

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _a = new THREE.Vector3()
const _d = new THREE.Vector3()
const _c = new THREE.Color()
const UP = new THREE.Vector3(0, 1, 0)
const BRASS = new THREE.Color('#c9a256')

/** the shared studio plus a dim warm-grey surround matching the page: polished brass balls mirror the room, and in
    the plain studio its black gaps between softboxes made each ball read as a little face */
const PENDULUM_ENV: Softbox[] = [
  ...STUDIO,
  { pos: [0, 1, 10], size: [26, 12], intensity: 0.32, color: '#efe8dc' },
  { pos: [0, 1, -10], size: [26, 12], intensity: 0.28, color: '#efe8dc' },
  { pos: [10, 1, 0], size: [26, 12], intensity: 0.28, color: '#efe8dc' },
  { pos: [-10, 1, 0], size: [26, 12], intensity: 0.3, color: '#efe8dc' },
  { pos: [0, 9, 0], size: [20, 20], intensity: 0.36, color: '#f4efe6' },
]

function Apparatus({ ctl, onReady, onNudge }: { ctl: Ctl; onReady: () => void; onNudge: (n: number) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const root = useRef<THREE.Group>(null)
  const balls = useRef<THREE.InstancedMesh>(null)
  const strings = useRef<THREE.InstancedMesh>(null)
  useStudioStart(root, onReady, PENDULUM_ENV)

  const res = useMemo(() => {
    const bw = 8.0
    const bd = 2.9
    const side = new THREE.MeshStandardMaterial({ color: '#ddd6c9', roughness: 0.85 })
    const top = new THREE.MeshStandardMaterial({ map: baseTopTex(bw, bd), roughness: 0.8 })
    const front = new THREE.MeshStandardMaterial({ map: plaqueTex(), roughness: 0.8 })
    return {
      bw,
      bd,
      baseMats: [side, side, top, side, front, side],
      navy: new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.38, metalness: 0.45 }),
      brass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28, metalness: 1 }),
      knob: new THREE.MeshStandardMaterial({ color: '#c9a256', roughness: 0.3, metalness: 1 }),
      string: new THREE.MeshStandardMaterial({ color: '#3b3f4a', roughness: 0.7 }),
      sphere: new THREE.SphereGeometry(BALL_R, 40, 28),
      cyl: new THREE.CylinderGeometry(1, 1, 1, 6, 1),
      prev: new Float32Array(COUNT),
      fit: { d: 1 },
      camInit: false,
      cp: new THREE.Vector3(),
      ct: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      upT: new THREE.Vector3(),
    }
  }, [])

  // instance colours (brass, flashed brighter after a nudge)
  useEffect(() => {
    const b = balls.current!
    for (let n = 0; n < COUNT; n++) b.setColorAt(n, BRASS)
    b.instanceColor!.needsUpdate = true
  }, [])

  // leg geometry: an A-frame at each end
  const legs = useMemo(() => {
    const out: { p: [number, number, number]; q: [number, number, number, number]; len: number }[] = []
    for (const x of [-3.78, 3.78]) {
      for (const z of [-1.05, 1.05]) {
        const a = new THREE.Vector3(x, BASE_Y * 2, z)
        const b = new THREE.Vector3(x, TOP + 0.04, 0)
        const d = b.clone().sub(a)
        const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize())
        const m = a.clone().add(b).multiplyScalar(0.5)
        out.push({ p: [m.x, m.y, m.z], q: [q.x, q.y, q.z, q.w], len: d.length() })
      }
    }
    return out
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    // ---- time
    if (ctl.playing && !ctl.scrubbing && !POSTER) ctl.time.set(mod(ctl.time.get() + dt * ctl.speed, T))
    const t = ctl.time.get()
    const pull = ctl.pull.get()

    // ---- pendulums
    const b = balls.current
    const s = strings.current
    if (b && s) {
      for (let n = 0; n < COUNT; n++) {
        const w = (2 * Math.PI * (N0 + n)) / T
        const th = AMP * pull * Math.cos(w * t + ctl.off[n].get())
        const L = LEN[n]
        const bx = XS[n]
        const by = TOP - L * Math.cos(th)
        const bz = L * Math.sin(th)
        // flash decays; colour lerps towards a warm highlight
        ctl.flash[n] = Math.max(0, ctl.flash[n] - dt * 1.4)
        const f = ctl.flash[n] + (ctl.hover === n ? 0.35 : 0)
        _c.copy(BRASS).lerp(_c.set('#ffe7a8'), Math.min(1, f) * 0.7)
        b.setColorAt(n, _c)
        _m.makeTranslation(bx, by, bz)
        b.setMatrixAt(n, _m)
        // the two strings of the V
        for (let k = 0; k < 2; k++) {
          _a.set(bx + (k ? VS : -VS), TOP, 0)
          _p.set(bx, by, bz)
          _d.subVectors(_p, _a)
          const len = _d.length() - BALL_R * 0.6
          _d.normalize()
          _q.setFromUnitVectors(UP, _d)
          _p.copy(_a).addScaledVector(_d, len / 2)
          _s.set(0.0065, len, 0.0065)
          _m.compose(_p, _q, _s)
          s.setMatrixAt(n * 2 + k, _m)
        }
        // tick when a ball crosses the centre line
        if (ctl.sound && ctl.playing && !ctl.scrubbing && Math.sign(th) !== Math.sign(res.prev[n]) && res.prev[n] !== 0) tick(ctl, n)
        res.prev[n] = th
      }
      b.instanceMatrix.needsUpdate = true
      b.instanceColor!.needsUpdate = true
      s.instanceMatrix.needsUpdate = true
      b.computeBoundingSphere()
    }

    // ---- camera: blend from the previous framing to the current view, fit to the aspect
    const { width, height } = state.size
    const aspect = width / height
    const mobile = width < 760
    // portrait phones look down on the row turned upright, so the wave runs down the tall screen
    const upright = mobile && ctl.view === 'top'
    const to = upright ? TOP_UPRIGHT : CAMS[ctl.view]
    const k = ctl.viewK.get()
    _p.set(...to.p)
    _a.set(...to.t)
    const fitK = upright ? Math.max(1, 0.46 / aspect) : mobile ? Math.max(1, 1.08 / aspect) : Math.max(1, 1.6 / aspect) * 1.3
    _d.subVectors(_p, _a).multiplyScalar(fitK * (POSTER ? 0.94 : 1))
    _p.copy(_a).add(_d)
    if (!res.camInit) {
      res.camInit = true
      ctl.viewFrom.p.copy(_p)
      ctl.viewFrom.t.copy(_a)
    }
    res.cp.lerpVectors(ctl.viewFrom.p, _p, k)
    res.ct.lerpVectors(ctl.viewFrom.t, _a, k)
    // arc the move a little so the camera doesn't dive through the frame
    res.cp.y += Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 1.6
    ctl.cur.p.copy(res.cp)
    ctl.cur.t.copy(res.ct)
    const px = POSTER ? 0 : state.pointer.x * 0.35
    const py = POSTER ? 0 : state.pointer.y * 0.2
    camera.position.set(res.cp.x + px, res.cp.y + py, res.cp.z)
    res.upT.set(upright ? 1 : 0, upright ? 0 : 1, 0)
    res.up.lerp(res.upT, 1 - Math.exp(-dt * 5)).normalize()
    camera.up.copy(res.up)
    camera.lookAt(res.ct)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.03 : 0.07
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })

  const ballEvents = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      if (e.instanceId === undefined) return
      ctl.hover = e.instanceId
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      ctl.hover = -1
      document.body.style.cursor = ''
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.instanceId === undefined || e.delta > 6) return
      onNudge(e.instanceId)
    },
  }

  return (
    <group ref={root}>
      {/* plinth */}
      <mesh position={[0, BASE_Y, 0]} material={res.baseMats} castShadow receiveShadow>
        <boxGeometry args={[res.bw, BASE_Y * 2, res.bd]} />
      </mesh>
      {/* feet */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 3.7, 0.03, sz * 1.25]} material={res.navy} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.06, 24]} />
          </mesh>
        )),
      )}
      {/* A-frame legs */}
      {legs.map((l, i) => (
        <mesh key={i} position={l.p} quaternion={l.q} material={res.navy} castShadow>
          <cylinderGeometry args={[0.055, 0.065, l.len, 16]} />
        </mesh>
      ))}
      {/* top rail + end caps */}
      <mesh position={[0, TOP, 0]} rotation-z={Math.PI / 2} material={res.navy} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 7.9, 20]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 3.96, TOP, 0]} material={res.knob}>
          <sphereGeometry args={[0.085, 20, 14]} />
        </mesh>
      ))}
      {/* brass clamps where the strings meet the rail */}
      {XS.map((x, n) => (
        <mesh key={n} position={[x, TOP - 0.02, 0]} rotation-z={Math.PI / 2} material={res.knob}>
          <cylinderGeometry args={[0.075, 0.075, 0.07, 18]} />
        </mesh>
      ))}
      <instancedMesh ref={strings} args={[res.cyl, res.string, COUNT * 2]} frustumCulled={false} castShadow />
      <instancedMesh ref={balls} args={[res.sphere, res.brass, COUNT]} frustumCulled={false} castShadow {...ballEvents} />
    </group>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#e8e2d6', 0.7]} />
      <directionalLight
        position={[2.2, 12, 3]}
        intensity={1.6}
        color="#fff8ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={5}
      />
      <directionalLight position={[-6, 4, -3]} intensity={0.35} color="#dfe6ff" />
    </>
  )
}

function Floor() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <shadowMaterial transparent opacity={0.16} color="#3a3020" />
    </mesh>
  )
}

/* ------------------------------------------------------------------ timeline (DOM) */

function Timeline({ ctl, onUser, pattern }: { ctl: Ctl; onUser: () => void; pattern: string }) {
  const [markOn, label] = [Number(pattern.split('|')[0]), pattern.split('|')[1]]
  const track = useRef<HTMLDivElement>(null)
  const timeEl = useRef<HTMLSpanElement>(null)
  const left = useTransform(ctl.time, (t) => `${(t / T) * 100}%`)
  const fill = useTransform(ctl.time, (t) => t / T)
  useEffect(() => {
    const set = (t: number) => timeEl.current && (timeEl.current.textContent = fmt(t))
    set(ctl.time.get())
    return ctl.time.on('change', set)
  }, [ctl])

  const scrubAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    ctl.time.set(Math.min(f * T, T - 1e-3))
  }
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    onUser()
    ctl.scrubbing = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    scrubAt(e.clientX)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!ctl.scrubbing) return
    scrubAt(e.clientX)
  }
  const onUp = () => {
    ctl.scrubbing = false
    onUser()
  }

  return (
    <div className="pw-tl">
      <div className="pw-tl-head">
        <span className="pw-time" ref={timeEl} />
        <span className="pw-now">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.b
              key={label}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            >
              {label}
            </motion.b>
          </AnimatePresence>
        </span>
        <span className="pw-total">T = {T} s</span>
      </div>
      <div className="pw-track" ref={track} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="pw-rail">
          <span className="pw-snake" style={{ left: '1.2%', width: '15.8%' }} />
          <span className="pw-snake" style={{ left: '83%', width: '15.8%' }} />
          <motion.span className="pw-fill" style={{ scaleX: fill }} />
        </div>
        {MARKS.map((m, i) => (
          <div key={i} className={`pw-mark pw-m${i}${i === markOn ? ' on' : ''}`} style={{ left: `${m.f * 100}%` }}>
            <i />
            <small>{m.frac}</small>
            <span>{m.label}</span>
          </div>
        ))}
        <div className="pw-snake-label" style={{ left: '9%' }}>
          蛇形
        </div>
        <div className="pw-snake-label" style={{ left: '91%' }}>
          蛇形
        </div>
        <motion.div className="pw-head" style={{ left }} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function PendulumWave() {
  const ctl = useMemo<Ctl>(
    () => ({
      time: motionValue(POSTER ? 0.075 * T : 0),
      pull: motionValue(POSTER ? 1 : 0),
      off: Array.from({ length: COUNT }, () => motionValue(0)),
      flash: new Float32Array(COUNT),
      playing: false,
      scrubbing: false,
      speed: 1,
      view: 'oblique',
      viewFrom: { p: new THREE.Vector3(), t: new THREE.Vector3() },
      cur: { p: new THREE.Vector3(), t: new THREE.Vector3() },
      viewK: motionValue(1),
      sound: false,
      audio: null,
      lastTick: 0,
      hover: -1,
      lastUser: 0,
    }),
    [],
  )
  const [view, setView] = useState<View>('oblique')
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState<1 | 4>(1)
  const [nudged, setNudged] = useState(0)
  const [sound, setSound] = useState(false)
  const [label, setLabel] = useState(() => patternOf(ctl.time.get()))
  const viewAnim = useRef<AnimationPlaybackControls | null>(null)
  const user = () => (ctl.lastUser = performance.now())

  useEffect(() => ctl.time.on('change', (t) => setLabel(patternOf(t))), [ctl])
  useEffect(() => void (ctl.speed = speed), [ctl, speed])

  const onReady = () => {
    if (POSTER) return
    // pull every ball back together, hold, release
    animate(ctl.pull, 1, { duration: 1.1, ease: [0.45, 0, 0.2, 1], delay: 0.15 }).then(() => {
      setTimeout(() => {
        ctl.playing = true
      }, 350)
    })
  }

  const changeView = (v: View) => {
    user()
    setView(v)
  }
  // when the view changes, the camera moves from wherever it is now (even mid-move)
  useEffect(() => {
    if (ctl.view === view) return
    ctl.viewFrom.p.copy(ctl.cur.p)
    ctl.viewFrom.t.copy(ctl.cur.t)
    ctl.view = view
    viewAnim.current?.stop()
    ctl.viewK.set(0)
    viewAnim.current = animate(ctl.viewK, 1, { type: 'spring', stiffness: 60, damping: 16, restDelta: 0.0005 })
  }, [ctl, view])

  const togglePlay = () => {
    user()
    const p = !ctl.playing
    ctl.playing = p
    setPlaying(p)
  }

  const nudge = (n: number) => {
    user()
    const o = ctl.off[n]
    animate(o, o.get() + 1.3 + Math.random() * 0.9, { type: 'spring', stiffness: 70, damping: 14 })
    ctl.flash[n] = 1
    setNudged((c) => c + 1)
  }
  const realign = () => {
    user()
    ctl.off.forEach((o, n) => {
      if (Math.abs(o.get()) < 1e-4) return
      // take the short way back to phase 0
      const cur = o.get()
      const wrapped = cur - 2 * Math.PI * Math.round(cur / (2 * Math.PI))
      o.set(wrapped)
      animate(o, 0, { type: 'spring', stiffness: 80, damping: 15, delay: n * 0.025 })
      ctl.flash[n] = 0.7
    })
    setNudged(0)
  }

  const toggleSound = () => {
    user()
    const on = !ctl.sound
    if (on) {
      if (!ctl.audio) ctl.audio = new AudioContext()
      void ctl.audio.resume()
    }
    ctl.sound = on
    setSound(on)
  }

  // ambient: when nobody touches anything, wander through the views; reset playback if left paused for long
  useEffect(() => {
    if (POSTER) return
    const order: View[] = ['oblique', 'top', 'side']
    let i = 0
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      if (now - ctl.lastUser < 15000 || now - last < 14000 || !ctl.playing) return
      last = now
      i = (order.indexOf(ctl.view) + 1) % order.length
      setView(order[i])
    }, 1000)
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      clearInterval(id)
      window.removeEventListener('keydown', key)
      ctl.audio?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl])

  return (
    <div className="stage pw-stage">
      <style>{`
        .pw-stage { background: radial-gradient(120% 90% at 64% 30%, #fbfaf7 0%, ${BG} 48%, #e4e0d7 100%); }
        .pw-stage .scrim { --soft-bg: ${BG}; }
        .pw-stage .hero-copy h1 em { color: ${NAVY}; font-style: normal; background: linear-gradient(90deg, #a87d2c, #d4ad5c); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .pw-stage .hero-copy .kicker i { background: #c9a256; }
        .pw-stage .hero-copy { bottom: 190px; }
        .pw-eq { display: inline-flex; gap: 14px; margin-top: 22px; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,.55); box-shadow: inset 0 0 0 1px rgba(47,58,86,.08); font: 500 12.5px/1.5 var(--mono); color: ${NAVY}; }
        .pw-eq span { color: var(--fg-2); }
        .pw-tl { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); width: min(760px, calc(100% - 32px)); padding: 12px 18px 30px; border-radius: 18px; background: rgba(255,255,255,.6); box-shadow: inset 0 0 0 1px rgba(47,58,86,.07), 0 12px 30px -16px rgba(60,50,30,.3); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3); user-select: none; }
        .pw-tl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
        .pw-time, .pw-total { font: 500 12px/1 var(--mono); color: var(--fg-2); font-variant-numeric: tabular-nums; min-width: 64px; }
        .pw-total { text-align: right; }
        .pw-now { position: relative; display: inline-flex; justify-content: center; min-width: 120px; }
        .pw-now b { display: block; font: 600 16px/1.1 var(--display); color: ${NAVY}; letter-spacing: .02em; white-space: nowrap; }
        .pw-track { position: relative; height: 22px; cursor: ew-resize; touch-action: none; }
        .pw-rail { position: absolute; left: 0; right: 0; top: 9px; height: 4px; border-radius: 2px; background: rgba(47,58,86,.12); overflow: hidden; }
        .pw-fill { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(47,58,86,.5), ${NAVY}); transform-origin: 0 50%; }
        .pw-snake { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, rgba(201,162,86,.55) 0 3px, transparent 3px 6px); }
        .pw-mark { position: absolute; top: 0; height: 22px; transform: translateX(-50%); pointer-events: none; }
        .pw-mark i { position: absolute; left: 50%; top: 4px; width: 2px; height: 14px; margin-left: -1px; border-radius: 1px; background: rgba(47,58,86,.35); }
        .pw-mark small { position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); font: 500 9.5px/1 var(--mono); color: rgba(47,58,86,.45); white-space: nowrap; display: none; }
        .pw-mark span { position: absolute; left: 50%; top: 24px; transform: translateX(-50%); font: 500 11.5px/1 var(--sans); color: var(--fg-2); white-space: nowrap; transition: color .2s; }
        .pw-m0 span { transform: none !important; left: -2px !important; }
        .pw-m6 span { transform: translateX(-100%) !important; left: calc(100% + 2px) !important; }
        .pw-mark.on i { background: #b88a33; }
        .pw-mark.on span { color: ${NAVY}; font-weight: 650; }
        .pw-snake-label { position: absolute; top: 24px; transform: translateX(-50%); font: 500 11.5px/1 var(--sans); color: #a8802f; pointer-events: none; }
        .pw-head { position: absolute; top: 3px; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px ${NAVY}, 0 4px 10px rgba(30,30,50,.3); pointer-events: none; }
        .pw-icon { width: 34px; padding: 0; display: grid; place-items: center; }
        .pw-icon svg { display: block; }
        .pw-realign { color: #fff !important; background: ${NAVY} !important; }
        @media (max-width: 760px) {
          .pw-stage .hero-copy { top: 72px; bottom: auto; justify-content: flex-start; }
          .pw-stage .hero-copy h1 { font-size: 26px; }
          .pw-stage .hero-copy .kicker { margin-bottom: 10px; }
          .pw-stage .hero-copy > p:not(.kicker), .pw-eq { display: none; }
          .pw-stage .scrim { display: none; }
          .pw-tl { bottom: 76px; padding: 10px 14px 28px; }
          .pw-mark span, .pw-snake-label { font-size: 10.5px; }
          .pw-m1 span { transform: translateX(-85%); }
          .pw-m2 span { transform: translateX(-15%); }
          .pw-snake-label { display: none; }
          .pw-stage .dock { bottom: 16px; }
        }
      `}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 120, position: [7, 6, 11] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}>
        <Lights />
        <Floor />
        <Apparatus ctl={ctl} onReady={onReady} onNudge={nudge} />
      </Canvas>

      <div className="overlay">
        <motion.div className="hero-copy" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <div className="scrim" />
          <p className="kicker">
            <i /> Pendulum wave · θ = A cos ωt
          </p>
          <h1>
            十八个钟摆，
            <br />
            <em>一条会走的波</em>
          </h1>
          <p>摆长都按 L ∝ 1/(50+n)² 精确调好：60 秒里第 n 根正好摆 50+n 次。相位一点点错开——蛇形、分组、乱序，一个周期后又整齐归位。拖时间轴随意快进，点一颗球推它一下。</p>
          <div className="pw-eq">
            θₙ(t) = A·cos(2π(50+n)t / T) <span>· T = 60 s</span>
          </div>
        </motion.div>

        <Timeline ctl={ctl} onUser={user} pattern={label} />

        <div className="dock">
          <button className="seg pw-icon" aria-label={playing ? '暂停' : '播放'} onClick={togglePlay}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
                <rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" />
              </svg>
            )}
          </button>
          <Seg
            items={[
              { value: 1, label: '1×' },
              { value: 4, label: '4×' },
            ]}
            value={speed}
            onChange={(v) => {
              user()
              setSpeed(v as 1 | 4)
            }}
          />
          <span className="dock-sep" />
          <Seg items={VIEWS} value={view} onChange={changeView} />
          <span className="dock-sep" />
          <AnimatePresence initial={false} mode="popLayout">
            {nudged > 0 ? (
              <motion.button
                key="re"
                className="seg pw-realign"
                onClick={realign}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              >
                <span>归位 · {nudged}</span>
              </motion.button>
            ) : (
              <motion.button
                key="snd"
                className="seg pw-icon"
                aria-label={sound ? '关闭声音' : '打开声音'}
                aria-pressed={sound}
                onClick={toggleSound}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              >
                {sound && <motion.span layoutId="pw-snd" className="seg-bg" />}
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                  <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" />
                  {sound ? (
                    <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.2 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  ) : (
                    <path d="M10.5 6l3 4M13.5 6l-3 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  )}
                </svg>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <p className="hint">
          点一颗球推它一下 · 空格 播放/暂停
        </p>
      </div>
    </div>
  )
}
