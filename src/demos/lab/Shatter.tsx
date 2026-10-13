import { Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BallCollider, CapsuleCollider, ConvexHullCollider, CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { AnimatePresence, animate, motion, motionValue } from 'motion/react'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { fracture, panelGeometry, PH, PR, PT, PW, sdPanel, type Fracture, type V2 } from './shatterGeo'
import { paintPrint, type MatKind } from './shatterPrint'

/* ------------------------------------------------------------------ constants */

const BG = '#eef1f5'
const BLUE = '#4f7dff'
const BASE_H = 0.14
const PC = new THREE.Vector3(0, BASE_H + 0.004 + PH / 2, 0) // panel centre (world)
const CRACK_T = 0.17 // crack-line reveal before the shards let go
const FLY_T = 2.5 // time on the floor before rewinding
type Count = 'few' | 'mid' | 'many'
const COUNTS: Record<Count, number> = { few: 16, mid: 32, many: 60 }
type Phase = 'intact' | 'crack' | 'fly' | 'rewind'

type Ctl = {
  lastUser: number
  req: null | { type: 'shatter'; user: boolean; count?: Count } | { type: 'restore' }
}

/* ------------------------------------------------------------------ tiny procedural audio: crash + tinkles */

let actx: AudioContext | null = null
let lastPing = 0
function unlockAudio() {
  try {
    if (!actx) actx = new AudioContext()
    if (actx.state === 'suspended') void actx.resume()
  } catch {
    actx = null
  }
}
function crash() {
  if (!actx || actx.state !== 'running') return
  const t = actx.currentTime
  const len = Math.floor(actx.sampleRate * 0.5)
  const buf = actx.createBuffer(1, len, actx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5)
  const src = actx.createBufferSource()
  src.buffer = buf
  const hp = actx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 2200
  const g = actx.createGain()
  g.gain.value = 0.16
  src.connect(hp).connect(g).connect(actx.destination)
  src.start(t)
}
function ping(strength: number) {
  if (!actx || actx.state !== 'running') return
  const now = performance.now()
  if (now - lastPing < 28) return
  lastPing = now
  const t = actx.currentTime
  const f = 2300 + Math.random() * 3400
  const out = actx.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(0.045 * strength, t + 0.003)
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.32 + Math.random() * 0.2)
  const pan = actx.createStereoPanner()
  pan.pan.value = Math.random() * 1.4 - 0.7
  for (const [mul, amp] of [
    [1, 1],
    [2.76, 0.4],
  ]) {
    const o = actx.createOscillator()
    o.frequency.value = f * mul
    const g = actx.createGain()
    g.gain.value = amp
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + 0.6)
  }
  out.connect(pan).connect(actx.destination)
}

/* ------------------------------------------------------------------ easing */

function bezierEase(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 6; i++) {
      const fx = ((ax * t + bx) * t + cx) * t - x
      const d = (3 * ax * t + 2 * bx) * t + cx
      if (Math.abs(d) < 1e-6) break
      t -= fx / d
    }
    return ((ay * t + by) * t + cy) * t
  }
}
const pathEase = bezierEase(0.45, 0, 0.12, 1)
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)

/* ------------------------------------------------------------------ materials */

type MatSet = { mats: [THREE.Material, THREE.Material]; crack: THREE.Color; flash: THREE.Color; shadow: number }

function makeMats(): Record<MatKind, MatSet> {
  const frostMap = paintPrint('frost')
  const acrMap = paintPrint('acrylic')
  const mirMap = paintPrint('mirror')
  return {
    frost: {
      mats: [
        new THREE.MeshPhysicalMaterial({
          map: frostMap,
          transmission: 0.62,
          roughness: 0.42,
          thickness: 0.35,
          ior: 1.45,
          clearcoat: 1,
          clearcoatRoughness: 0.1,
          attenuationColor: new THREE.Color('#dce6ff'),
          attenuationDistance: 1.2,
          envMapIntensity: 1.1,
        }),
        new THREE.MeshPhysicalMaterial({ color: '#d5e9ef', transmission: 0.6, roughness: 0.14, thickness: 0.4, ior: 1.5, envMapIntensity: 1.3 }),
      ],
      crack: new THREE.Color('#2c3f8f'),
      flash: new THREE.Color(BLUE),
      shadow: 0.42,
    },
    acrylic: {
      mats: [
        new THREE.MeshPhysicalMaterial({
          map: acrMap,
          transmission: 0.4,
          roughness: 0.12,
          thickness: 0.3,
          ior: 1.49,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: 1.1,
        }),
        new THREE.MeshPhysicalMaterial({ color: '#ff8aa0', emissive: '#ff4f6d', emissiveIntensity: 0.35, transmission: 0.5, roughness: 0.08, thickness: 0.3 }),
      ],
      crack: new THREE.Color('#ffffff'),
      flash: new THREE.Color('#fff2c4'),
      shadow: 0.55,
    },
    mirror: {
      mats: [
        new THREE.MeshPhysicalMaterial({ map: mirMap, metalness: 1, roughness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 1.25 }),
        new THREE.MeshPhysicalMaterial({ color: '#9aa1ae', metalness: 0.9, roughness: 0.3, envMapIntensity: 1.2 }),
      ],
      crack: new THREE.Color('#ffffff'),
      flash: new THREE.Color('#dfe8ff'),
      shadow: 0.7,
    },
  }
}

const crackMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uR: { value: 0 }, uA: { value: 0 }, uCol: { value: new THREE.Color('#2c3f8f') } },
  vertexShader: /* glsl */ `
    attribute float aD; attribute float aS;
    varying float vD; varying float vS;
    void main() { vD = aD; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uR; uniform float uA; uniform vec3 uCol;
    varying float vD; varying float vS;
    void main() {
      float rev = 1.0 - smoothstep(uR - 0.25, uR, vD);
      float front = exp(-pow((uR - vD) * 4.0, 2.0));
      float core = 1.0 - smoothstep(0.25, 1.0, abs(vS));
      vec3 col = mix(uCol, vec3(1.0), clamp(front * 1.3, 0.0, 1.0));
      float a = rev * core * uA * (0.8 + 0.5 * front);
      gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    }
  `,
})

const flashMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uT: { value: 1 }, uCol: { value: new THREE.Color(BLUE) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uT; uniform vec3 uCol; varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float k = 1.0 - uT;
      float ring = exp(-pow((r - (0.15 + uT * 0.85)) * 12.0, 2.0)) * k;
      float core = exp(-r * r * 26.0) * k * k * 1.6;
      float a = clamp(ring * 0.8 + core, 0.0, 1.0);
      gl_FragColor = vec4(mix(uCol, vec3(1.0), clamp(core, 0.0, 1.0)), a);
    }
  `,
})

const glintMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uP: { value: -1 }, uA: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uP; uniform float uA; varying vec2 vUv;
    float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
    void main() {
      vec2 q = (vUv - 0.5) * vec2(${PW.toFixed(3)}, ${PH.toFixed(3)});
      float m = 1.0 - smoothstep(-0.004, 0.0, sdRR(q, vec2(${(PW / 2).toFixed(3)}, ${(PH / 2).toFixed(3)}), ${PR.toFixed(3)}));
      float x = vUv.x * 0.75 + vUv.y * 0.55;
      float band = exp(-pow((x - uP) * 7.0, 2.0)) + 0.5 * exp(-pow((x - uP + 0.16) * 18.0, 2.0));
      gl_FragColor = vec4(vec3(1.0), clamp(band * m * uA * 0.6, 0.0, 1.0));
    }
  `,
})

/* ------------------------------------------------------------------ run (one fracture) */

type Run = {
  id: number
  f: Fracture
  impact: V2
  meshes: (THREE.Mesh | null)[]
  bodies: (RapierRigidBody | null)[]
  kicked: Uint8Array
  p0: THREE.Vector3[]
  ctrl: THREE.Vector3[]
  axis: THREE.Vector3[]
  th: Float32Array
  delay: Float32Array
  dur: Float32Array
  total: number
  user: boolean
}

let runId = 0
function makeRun(impact: V2, n: number, seed: number, user: boolean): Run {
  const f = fracture(impact, n, seed)
  const N = f.shards.length
  return {
    id: ++runId,
    f,
    impact,
    meshes: new Array(N).fill(null),
    bodies: new Array(N).fill(null),
    kicked: new Uint8Array(N),
    p0: f.shards.map(() => new THREE.Vector3()),
    ctrl: f.shards.map(() => new THREE.Vector3()),
    axis: f.shards.map(() => new THREE.Vector3(0, 0, 1)),
    th: new Float32Array(N),
    delay: new Float32Array(N),
    dur: new Float32Array(N),
    total: 0,
    user,
  }
}

function randomImpact(): V2 {
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * PW * 0.72
    const y = (Math.random() - 0.5) * PH * 0.7
    if (sdPanel(x, y) < -0.35) return [x, y]
  }
  return [0.2, 0.3]
}

/* ------------------------------------------------------------------ the panel + shards */

function Panel({
  ctl,
  count,
  kind,
  onPhase,
  onPieces,
}: {
  ctl: React.RefObject<Ctl>
  count: Count
  kind: MatKind
  onPhase: (p: Phase) => void
  onPieces: (n: number) => void
}) {
  const sets = useMemo(makeMats, [])
  const set = sets[kind]
  const intactGeo = useMemo(panelGeometry, [])
  const glintGeo = useMemo(() => new THREE.PlaneGeometry(PW, PH), [])
  const [run, setRun] = useState<Run | null>(null)
  const [live, setLive] = useState(false)
  const intact = useRef<THREE.Mesh>(null)
  const shardGroup = useRef<THREE.Group>(null)
  const crackMesh = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Mesh>(null)
  const countRef = useRef(count)
  countRef.current = count
  const S = useMemo(
    () => ({
      phase: 'intact' as Phase | 'poster',
      t0: 0,
      clock: 0,
      intactSince: 0,
      first: true,
      run: null as Run | null,
      rewind: motionValue(0),
      glintP: motionValue(-1),
      glintA: motionValue(0),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      e: new THREE.Euler(),
    }),
    [],
  )
  const light = useThree((s) => s.scene)

  // material-dependent uniforms + shadow strength
  useEffect(() => {
    ;(crackMat.uniforms.uCol.value as THREE.Color).copy(set.crack)
    ;(flashMat.uniforms.uCol.value as THREE.Color).copy(set.flash)
    light.traverse((o) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight && (o as THREE.DirectionalLight).castShadow) (o as THREE.DirectionalLight).shadow.intensity = set.shadow
    })
    if (S.phase === 'intact') glint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set])

  useEffect(() => () => {
    if (!run) return
    run.f.shards.forEach((s) => s.geo.dispose())
    run.f.cracks.dispose()
  }, [run])

  const glint = () => {
    S.glintP.set(-0.35)
    S.glintA.set(1)
    animate(S.glintP, 1.75, { duration: 1.1, ease: [0.4, 0, 0.2, 1] })
  }

  const setPhase = (p: Phase) => {
    S.phase = p
    S.t0 = S.clock
    onPhase(p)
  }

  const shatter = (impact: V2, user: boolean, n = COUNTS[countRef.current]) => {
    if (S.phase !== 'intact') return
    const r = makeRun(impact, n, (Math.random() * 1e9) | 0, user)
    S.run = r
    S.first = false
    setRun(r)
    setLive(false)
    onPieces(r.f.shards.length)
    flash.current!.position.set(PC.x + impact[0], PC.y + impact[1], PT / 2 + 0.008)
    setPhase('crack')
    if (user) crash()
  }

  const startRewind = () => {
    const r = S.run
    if (!r || (S.phase !== 'fly' && S.phase !== 'crack')) return
    const { shards, maxD } = r.f
    let total = 0
    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i]
      const m = r.meshes[i]
      const p0 = r.p0[i]
      if (m) {
        p0.copy(m.position)
        S.q.copy(m.quaternion)
      } else {
        p0.set(PC.x + sh.c[0], PC.y + sh.c[1], PC.z)
        S.q.identity()
      }
      if (S.q.w < 0) S.q.set(-S.q.x, -S.q.y, -S.q.z, -S.q.w)
      const w = Math.min(1, S.q.w)
      const sinH = Math.sqrt(1 - w * w)
      let th = 2 * Math.acos(w)
      if (sinH > 1e-4) r.axis[i].set(S.q.x / sinH, S.q.y / sinH, S.q.z / sinH)
      else r.axis[i].set(0, 0, 1)
      // some shards unwind an extra full turn on the way home
      if (sh.r1 < 0.3 && th > 0.05) th += Math.PI * 2
      r.th[i] = th
      const hx = PC.x + sh.c[0]
      const hy = PC.y + sh.c[1]
      const hz = PC.z
      const far = Math.hypot(p0.x - hx, p0.y - hy, p0.z - hz)
      r.ctrl[i].set((p0.x + hx) / 2 + sh.dir[0] * 0.25, Math.max(p0.y, hy) + 0.15 + sh.r3 * 0.35 + far * 0.05, (p0.z + hz) / 2 + 0.6 + sh.r2 * 0.6)
      r.delay[i] = (1 - sh.d / maxD) * 0.5 + sh.r2 * 0.08
      r.dur[i] = 0.95 + sh.r3 * 0.3
      total = Math.max(total, r.delay[i] + r.dur[i])
    }
    r.total = total
    setLive(false)
    S.rewind.set(0)
    animate(S.rewind, total, { duration: total, ease: 'linear' })
    setPhase('rewind')
  }

  // poster: a frozen, deterministic burst
  useLayoutEffect(() => {
    if (!POSTER) return
    const r = makeRun([0.42, 0.62], 40, 11, false)
    S.run = r
    S.phase = 'poster'
    setRun(r)
    onPieces(r.f.shards.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    S.clock += dt
    const c = ctl.current!
    const r = S.run
    const mounted = !!r && r.meshes.every((m) => m)

    // requests from the DOM
    if (c.req) {
      const q = c.req
      c.req = null
      if (q.type === 'shatter') shatter(randomImpact(), q.user, q.count ? COUNTS[q.count] : undefined)
      else if (q.type === 'restore') startRewind()
    }

    // ambient loop: intact → shatter every ~8 s while nobody is touching it
    if (S.phase === 'intact') {
      const hold = S.first ? 2.2 : 4.2
      if (S.clock - S.intactSince > hold && performance.now() - c.lastUser > 5000) shatter(randomImpact(), false)
    }

    const tt = S.clock - S.t0
    if (S.phase === 'crack' && tt > CRACK_T && mounted) {
      setLive(true)
      setPhase('fly')
    } else if (S.phase === 'fly' && tt > FLY_T) {
      startRewind()
    }

    // shard transforms
    if (r && mounted) {
      const sh = r.f.shards
      if (S.phase === 'crack' || (S.phase === 'fly' && !live)) {
        const open = easeOut(tt / CRACK_T) * 0.012
        for (let i = 0; i < sh.length; i++) {
          const m = r.meshes[i]!
          const k = open / (1 + sh[i].d * 2)
          m.position.set(PC.x + sh[i].c[0] + sh[i].dir[0] * k, PC.y + sh[i].c[1] + sh[i].dir[1] * k, PC.z + k * 0.5)
          m.quaternion.identity()
        }
      } else if (S.phase === 'fly') {
        for (let i = 0; i < sh.length; i++) {
          const rb = r.bodies[i]
          const m = r.meshes[i]!
          if (!rb) continue
          if (!r.kicked[i]) {
            r.kicked[i] = 1
            const s = sh[i]
            const k = 3.4 / (1 + s.d * 1.3) + 0.45
            rb.setLinvel(
              {
                x: s.dir[0] * k * 0.8 + (s.r1 - 0.5) * 0.4,
                y: s.dir[1] * k * 0.85 + 1.3 + s.r2 * 1.5,
                z: (0.9 + s.r3 * 1.9) / (1 + s.d * 0.8) - 0.25,
              },
              true,
            )
            const a = 9 / (1 + s.d)
            rb.setAngvel({ x: (s.r2 - 0.5) * a, y: (s.r3 - 0.5) * a, z: (s.r1 - 0.5) * a * 0.7 }, true)
          }
          const t = rb.translation()
          const q = rb.rotation()
          m.position.set(t.x, t.y, t.z)
          m.quaternion.set(q.x, q.y, q.z, q.w)
        }
      } else if (S.phase === 'rewind') {
        const T = S.rewind.get()
        for (let i = 0; i < sh.length; i++) {
          const m = r.meshes[i]!
          const lt = Math.min(1, Math.max(0, (T - r.delay[i]) / r.dur[i]))
          const e = pathEase(lt)
          const er = pathEase(Math.min(1, lt * 1.12))
          const u = 1 - e
          const p0 = r.p0[i]
          const cp = r.ctrl[i]
          const hx = PC.x + sh[i].c[0]
          const hy = PC.y + sh[i].c[1]
          m.position.set(
            u * u * p0.x + 2 * u * e * cp.x + e * e * hx,
            u * u * p0.y + 2 * u * e * cp.y + e * e * hy,
            u * u * p0.z + 2 * u * e * cp.z + e * e * PC.z,
          )
          m.quaternion.setFromAxisAngle(r.axis[i], r.th[i] * (1 - er))
        }
        if (T >= r.total - 1e-4) {
          // every shard is home: swap back to the single intact slab in the same frame
          for (const m of r.meshes) m!.quaternion.identity()
          S.run = null
          setPhase('intact')
          S.intactSince = S.clock
          setRun(null)
          glint()
        }
      } else if (S.phase === 'poster') {
        for (let i = 0; i < sh.length; i++) {
          const s = sh[i]
          const m = r.meshes[i]!
          const k = 1.2 * Math.exp(-s.d * 0.7)
          const sp = 0.1 + 0.5 * k
          m.position.set(PC.x + s.c[0] + s.dir[0] * s.d * sp, PC.y + s.c[1] + s.dir[1] * s.d * sp, PC.z + k * 1.5 + s.r1 * 0.25 * k)
          S.e.set((s.r1 - 0.5) * k * 1.6, (s.r2 - 0.5) * k * 1.6, (s.r3 - 0.5) * k * 0.9)
          m.quaternion.setFromEuler(S.e)
        }
      }
    }

    const showShards = !!r && mounted && S.phase !== 'intact'
    if (intact.current) intact.current.visible = !showShards
    if (shardGroup.current) shardGroup.current.visible = showShards

    // crack lines + impact flash
    const cu = crackMat.uniforms
    if (S.phase === 'crack' || S.phase === 'fly') {
      const maxD = r ? r.f.maxD : 3
      cu.uR.value = easeOut(tt / (CRACK_T * 0.9)) * (maxD + 0.6)
      cu.uA.value = S.phase === 'crack' ? 1 : Math.max(0, 1 - (S.clock - S.t0) / 0.32)
    } else cu.uA.value = 0
    if (crackMesh.current) crackMesh.current.visible = cu.uA.value > 0.001
    const ft = S.phase === 'crack' ? tt / 0.6 : S.phase === 'fly' ? (tt + CRACK_T) / 0.6 : 1
    flashMat.uniforms.uT.value = Math.min(1, ft)
    if (flash.current) {
      flash.current.visible = ft < 1
      flash.current.scale.setScalar(0.6 + easeOut(ft) * 1.2)
    }
    // glint
    glintMat.uniforms.uP.value = S.glintP.get()
    glintMat.uniforms.uA.value = S.phase === 'intact' && S.glintP.get() < 1.7 ? S.glintA.get() : 0
  })

  const onPanelDown = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    unlockAudio()
    ctl.current!.lastUser = performance.now()
    if (S.phase !== 'intact') return
    const x = THREE.MathUtils.clamp(e.point.x - PC.x, -PW / 2 + 0.15, PW / 2 - 0.15)
    const y = THREE.MathUtils.clamp(e.point.y - PC.y, -PH / 2 + 0.15, PH / 2 - 0.15)
    shatter([x, y], true)
  }
  const onShardDown = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER || e.nativeEvent.button !== 0) return
    e.stopPropagation()
    ctl.current!.lastUser = performance.now()
    if (S.phase === 'fly') startRewind()
  }
  const hover = (on: boolean) => () => {
    if (!POSTER) document.body.style.cursor = on ? 'pointer' : ''
  }
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  return (
    <>
      <mesh
        ref={intact}
        geometry={intactGeo}
        material={set.mats}
        position={PC}
        castShadow
        onPointerDown={onPanelDown}
        onPointerOver={hover(true)}
        onPointerOut={hover(false)}
      />
      <mesh geometry={glintGeo} material={glintMat} position={[PC.x, PC.y, PT / 2 + 0.004]} renderOrder={3} raycast={() => null} />
      <group ref={shardGroup} visible={false} onPointerDown={onShardDown}>
        {run?.f.shards.map((s, i) => (
          <mesh
            key={`${run.id}-${i}`}
            ref={(m) => void (run.meshes[i] = m)}
            geometry={s.geo}
            material={set.mats}
            position={[PC.x + s.c[0], PC.y + s.c[1], PC.z]}
            castShadow
          />
        ))}
      </group>
      {run && (
        <mesh ref={crackMesh} geometry={run.f.cracks} material={crackMat} position={[PC.x, PC.y, PT / 2 + 0.003]} renderOrder={4} visible={false} raycast={() => null} />
      )}
      <mesh ref={flash} material={flashMat} renderOrder={5} visible={false} raycast={() => null}>
        <planeGeometry args={[2.2, 2.2]} />
      </mesh>
      {run &&
        live &&
        run.f.shards.map((s, i) => (
          <RigidBody
            key={`${run.id}-b${i}`}
            ref={(rb) => void (run.bodies[i] = rb)}
            colliders={false}
            position={[PC.x + s.c[0], PC.y + s.c[1], PC.z]}
            linearDamping={0.25}
            angularDamping={0.35}
            ccd
            onCollisionEnter={({ target }) => {
              if (!run.user) return
              const v = target.rigidBody?.linvel()
              if (!v) return
              const sp = Math.hypot(v.x, v.y, v.z)
              if (sp > 1.2) ping(Math.min(1, sp / 7) * (0.4 + Math.min(1, s.area * 3) * 0.6))
            }}
          >
            {s.ball ? (
              <BallCollider args={[s.ball]} friction={0.75} restitution={0.28} density={2.5} />
            ) : (
              <ConvexHullCollider args={[s.hull]} friction={0.75} restitution={0.28} density={2.5} />
            )}
          </RigidBody>
        ))}
    </>
  )
}

/* ------------------------------------------------------------------ studio */

function sweepGeometry() {
  // floor running back into a curved cyclorama wall
  const rows: [number, number][] = []
  const R = 5
  const z0 = -4.5
  for (let i = 0; i <= 10; i++) rows.push([0, 20 - (i / 10) * (20 - z0)])
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2)
    rows.push([R - Math.cos(a) * R, z0 - Math.sin(a) * R])
  }
  for (let i = 1; i <= 4; i++) rows.push([R + (i / 4) * 30, z0 - R])
  const pos: number[] = []
  const idx: number[] = []
  rows.forEach(([y, z]) => pos.push(-40, y, z, 40, y, z))
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function Studio() {
  const sweep = useMemo(sweepGeometry, [])
  const base = useMemo(() => new RoundedBoxGeometry(2.3, BASE_H, 0.78, 3, 0.05), [])
  return (
    <>
      <mesh geometry={sweep} receiveShadow>
        <meshStandardMaterial color="#e8ecf2" roughness={0.95} envMapIntensity={0.4} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[30, 0.5, 30]} position={[0, -0.5, 0]} friction={0.6} restitution={0.3} />
        <CuboidCollider args={[30, 20, 0.5]} position={[0, 20, -10]} />
      </RigidBody>
      {/* stand */}
      <RigidBody type="fixed" colliders={false} position={[0, BASE_H / 2, 0]}>
        <CuboidCollider args={[1.15, BASE_H / 2, 0.39]} friction={0.6} restitution={0.25} />
        <mesh geometry={base} castShadow receiveShadow>
          <meshStandardMaterial color="#f8f9fb" roughness={0.55} />
        </mesh>
        <mesh position={[0, BASE_H / 2 + 0.001, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2.0, PT + 0.03]} />
          <meshStandardMaterial color="#c9d0db" roughness={0.8} />
        </mesh>
      </RigidBody>
      {/* props behind the glass — they make the frosting / refraction readable */}
      <RigidBody type="fixed" colliders={false} position={[-2.1, 0.62, -2.4]}>
        <BallCollider args={[0.62]} restitution={0.3} />
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.62, 48, 32]} />
          <meshStandardMaterial color="#ff6b4a" roughness={0.45} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders={false} position={[2.15, 1.1, -3.3]}>
        <CapsuleCollider args={[0.75, 0.36]} />
        <mesh castShadow receiveShadow>
          <capsuleGeometry args={[0.36, 1.5, 12, 32]} />
          <meshStandardMaterial color={BLUE} roughness={0.4} />
        </mesh>
      </RigidBody>
      <mesh position={[0.35, 0.16, -2.2]} rotation-x={-Math.PI / 2} castShadow receiveShadow>
        <torusGeometry args={[0.42, 0.16, 24, 48]} />
        <meshStandardMaterial color="#ffc94a" roughness={0.5} />
      </mesh>
    </>
  )
}

function Lights() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff8f0', 2.2)
    l.position.set(-4, 9, 6)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -8
    cam.right = cam.top = 8
    cam.near = 1
    cam.far = 30
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    l.shadow.radius = 5
    l.shadow.intensity = 0.42
    return l
  }, [])
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d3dae6', 1.15]} />
      <primitive object={light} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#c5ccd8']} />
        <Lightformer form="rect" intensity={3} position={[0, 8, 3]} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[-4.2, 2.5, 9]} scale={[1.6, 9, 1]} />
        <Lightformer form="rect" intensity={2} position={[-1.4, 2, 10]} scale={[0.45, 9, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#d3deff" position={[4.2, 2, 9]} scale={[2.6, 9, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ffd9c7" position={[1.4, 4.2, 10]} scale={1.3} />
        <Lightformer form="rect" intensity={0.9} position={[0, -4, 3]} scale={[14, 4, 1]} />
      </Environment>
    </>
  )
}

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const st = useMemo(() => ({ yaw: 0.24, pitch: 0.17 }), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const { width, height } = state.size
    const mobile = width < 760
    const aspect = width / height
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    let dist = 13.4
    if (aspect < 1.2) dist = Math.max(dist, 5.9 / (2 * tanH * aspect))
    const px = POSTER ? 0 : state.pointer.x
    const py = POSTER ? 0 : state.pointer.y
    st.yaw = THREE.MathUtils.damp(st.yaw, 0.24 + px * 0.06, 3, dt)
    st.pitch = THREE.MathUtils.damp(st.pitch, 0.17 + py * 0.03, 3, dt)
    const ty = 1.8
    const cp = Math.cos(st.pitch)
    camera.position.set(dist * cp * Math.sin(st.yaw), ty + dist * Math.sin(st.pitch), dist * cp * Math.cos(st.yaw))
    camera.lookAt(0, ty, 0)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? -0.02 : mobile ? 0.19 : 0.0
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ page */

const PHASE_TEXT: Record<Phase, string> = {
  intact: '完整',
  crack: '裂开！',
  fly: '飞散 · 落地',
  rewind: '沿曲线复原…',
}
const MATS: { value: MatKind; label: string; short: string }[] = [
  { value: 'frost', label: '磨砂玻璃', short: '磨砂' },
  { value: 'acrylic', label: '彩色亚克力', short: '亚克力' },
  { value: 'mirror', label: '镜面', short: '镜面' },
]
const COUNT_ITEMS: { value: Count; label: string }[] = [
  { value: 'few', label: '少' },
  { value: 'mid', label: '中' },
  { value: 'many', label: '多' },
]

function useNarrow() {
  const [n, setN] = useState(() => typeof window !== 'undefined' && window.innerWidth < 760)
  useEffect(() => {
    const on = () => setN(window.innerWidth < 760)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return n
}

export default function Shatter() {
  const narrow = useNarrow()
  const ctl = useRef<Ctl>({ lastUser: -1e9, req: null })
  const [phase, setPhase] = useState<Phase>('intact')
  const [pieces, setPieces] = useState(0)
  const [count, setCount] = useState<Count>('mid')
  const [kind, setKind] = useState<MatKind>('frost')

  const user = () => {
    unlockAudio()
    ctl.current.lastUser = performance.now()
  }
  const broken = phase === 'fly' || phase === 'crack'

  return (
    <div className="stage sh-stage">
      <style>{`
        .sh-stage { background: ${BG}; }
        .sh-stage .scrim { --soft-bg: ${BG}; }
        .sh-stage .hero-copy h1 em { color: ${BLUE}; }
        .sh-stat { display: inline-flex; align-items: center; gap: 10px; margin-top: 22px !important; height: 18px; font: 500 12px/1 var(--mono) !important; letter-spacing: .04em; color: var(--fg-2); }
        .sh-stat b { width: 8px; height: 8px; border-radius: 50%; background: ${BLUE}; transition: background .3s, transform .3s; }
        .sh-stat b.hot { background: #ff6b4a; transform: scale(1.3); }
        .sh-toggle { min-width: 112px; }
        .sh-dock-label { padding: 0 6px 0 10px; font: 500 11px/1 var(--mono); color: var(--fg-2); letter-spacing: .04em; white-space: nowrap; }
        @media (max-width: 760px) {
          .sh-stage .hero-copy p:not(.kicker):not(.sh-stat) { font-size: 14px; line-height: 1.65; }
          .sh-stage .hero-actions { display: none; }
          .sh-dock-label { display: none; }
          .sh-stage .dock .seg { padding: 0 10px; }
        }
      `}</style>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 200, position: [3, 4, 13] }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping
        }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 24, 46]} />
        <Rig />
        <Lights />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]}>
            <Studio />
            <Panel ctl={ctl} count={count} kind={kind} onPhase={setPhase} onPieces={setPieces} />
          </Physics>
        </Suspense>
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
            <i /> Voronoi · Rapier · Rewind
          </p>
          <h1>
            碎了，
            <br />
            也能<em>拼回来</em>
          </h1>
          <p>点哪儿，就从哪儿裂开：落点附近碎得最细，碎片带着冲量飞散、落地弹跳。2.5 秒后它们沿平滑曲线依次飞回，印刷图案严丝合缝。</p>
          <div className="hero-actions">
            <button
              className="btn primary sh-toggle"
              onClick={() => {
                user()
                ctl.current.req = broken ? { type: 'restore' } : { type: 'shatter', user: true }
              }}
            >
              {broken ? '复原' : '敲碎它'}
            </button>
          </div>
          <p className="sh-stat">
            <b className={broken ? 'hot' : ''} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={phase}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                transition={{ duration: 0.2 }}
              >
                {phase === 'intact' ? `${COUNTS[count]} 片待命` : `${pieces} 片`} · {MATS.find((m) => m.value === kind)!.label} · {PHASE_TEXT[phase]}
              </motion.span>
            </AnimatePresence>
          </p>
        </motion.div>

        <div className="dock">
          <span className="sh-dock-label">碎片</span>
          <Seg
            items={COUNT_ITEMS}
            value={count}
            onChange={(v) => {
              user()
              setCount(v)
              if (phase === 'intact') ctl.current.req = { type: 'shatter', user: true, count: v }
            }}
          />
          <span className="dock-sep" />
          <Seg
            items={narrow ? MATS.map((m) => ({ ...m, label: m.short })) : MATS}
            value={kind}
            onChange={(v) => {
              user()
              setKind(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              user()
              ctl.current.req = { type: 'restore' }
            }}
          >
            <span>复原</span>
          </button>
        </div>
        <p className="hint">点击面板任意位置敲碎 · 碎开后点碎片可提前复原</p>
      </div>
    </div>
  )
}
