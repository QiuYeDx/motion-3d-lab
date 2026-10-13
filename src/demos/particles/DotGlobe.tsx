import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { CITIES, isLand } from './globeData'

const R = 2
const D2R = Math.PI / 180
const AUTO = 0.075 // rad/s ambient spin
const SLOTS = 16

const VIEWS = [
  { value: 'asia', label: '亚洲', lon: 108, lat: 24 },
  { value: 'europe', label: '欧洲', lon: 14, lat: 40 },
  { value: 'america', label: '美洲', lon: -88, lat: 22 },
] as const
type ViewKey = (typeof VIEWS)[number]['value']

function ll(lat: number, lon: number, r = 1, out = new THREE.Vector3()) {
  const la = lat * D2R
  const lo = lon * D2R
  return out.set(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r)
}

/* ------------------------------------------------------------------ shaders */

const DOT_VERT = /* glsl */ `
attribute float aRand;
uniform float uTime;
varying float vFacing;
varying float vLight;
varying float vTw;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * instanceMatrix[3].xyz);
  vFacing = dot(n, normalize(cameraPosition - wp.xyz));
  vLight = dot(n, normalize(vec3(-0.55, 0.6, 0.6))) * 0.5 + 0.5;
  vTw = pow(max(0.0, sin(uTime * (0.6 + aRand * 1.4) + aRand * 60.0)), 24.0) * step(0.82, aRand);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const DOT_FRAG = /* glsl */ `
varying float vFacing;
varying float vLight;
varying float vTw;
void main() {
  vec3 deep = vec3(0.16, 0.27, 0.58);
  vec3 lit = vec3(0.56, 0.72, 1.0);
  vec3 c = mix(deep, lit, smoothstep(0.15, 0.95, vLight));
  c = mix(c, vec3(0.75, 0.97, 1.0), vTw);
  float a = smoothstep(-0.05, 0.35, vFacing);
  gl_FragColor = vec4(c * (0.55 + 0.45 * a), 1.0);
}
`

const CORE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWN;
void main() {
  vN = normalize(normalMatrix * normal);
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const CORE_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vWN;
void main() {
  float fres = pow(1.0 - max(vN.z, 0.0), 2.6);
  float lit = dot(vWN, normalize(vec3(-0.55, 0.6, 0.6))) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.016, 0.03, 0.075), vec3(0.04, 0.075, 0.17), lit);
  c += vec3(0.22, 0.42, 1.0) * fres * 0.55;
  gl_FragColor = vec4(c, 1.0);
}
`
const ATMO_FRAG = /* glsl */ `
uniform float uEdge;
varying vec3 vN;
varying vec3 vWN;
void main() {
  float k = clamp(-vN.z / uEdge, 0.0, 1.0);
  float i = pow(k, 3.0);
  gl_FragColor = vec4(vec3(0.3, 0.55, 1.0), i * 0.75);
}
`

const ARC_VERT = /* glsl */ `
uniform float uRev;
varying float vU;
void main() {
  vU = mix(uv.x, 1.0 - uv.x, uRev);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const ARC_FRAG = /* glsl */ `
uniform float uHead, uTail, uFade;
uniform vec3 uColor;
varying float vU;
void main() {
  if (vU > uHead || vU < uTail) discard;
  float k = (vU - uTail) / max(uHead - uTail, 1e-3);
  float a = pow(k, 1.6);
  vec3 c = mix(uColor, vec3(1.0), smoothstep(0.85, 1.0, k) * 0.8);
  gl_FragColor = vec4(c, a * uFade);
}
`

/* ------------------------------------------------------------------ helpers */

class ArcCurve extends THREE.Curve<THREE.Vector3> {
  a: THREE.Vector3
  b: THREE.Vector3
  theta: number
  lift: number
  constructor(a: THREE.Vector3, b: THREE.Vector3) {
    super()
    this.a = a
    this.b = b
    this.theta = a.angleTo(b)
    this.lift = R * (0.04 + 0.22 * (this.theta / Math.PI))
  }
  getPoint(t: number, out = new THREE.Vector3()) {
    const s = Math.sin(this.theta)
    const wa = Math.sin((1 - t) * this.theta) / s
    const wb = Math.sin(t * this.theta) / s
    out.set(this.a.x * wa + this.b.x * wb, this.a.y * wa + this.b.y * wb, this.a.z * wa + this.b.z * wb).normalize()
    return out.multiplyScalar(R * 1.004 + this.lift * Math.sin(Math.PI * t))
  }
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)')
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const ARC_COLORS = [new THREE.Color('#6f9bff'), new THREE.Color('#7fe8ff'), new THREE.Color('#a98bff')]

type Slot = {
  on: boolean
  pair: number
  rev: boolean
  t: number
  speed: number
  len: number
  landed: boolean
  delay: number
}

type Api = { broadcast: (from: number) => void }

/* ------------------------------------------------------------------ globe */

function Globe({
  rotX,
  rotY,
  stateRef,
  arcsOn,
  api,
}: {
  rotX: MotionValue<number>
  rotY: MotionValue<number>
  stateRef: React.MutableRefObject<{ dragging: boolean; springing: boolean; vel: number; tilt: number }>
  arcsOn: boolean
  api: React.MutableRefObject<Api | null>
}) {
  const group = useRef<THREE.Group>(null)
  const { width } = useThree((s) => s.size)
  const vp = useThree((s) => s.viewport)
  const mobile = width < 760
  const scale = mobile ? Math.min(0.6, (vp.width * 0.42) / R) : Math.min(1, (vp.width * 0.3) / R)
  const pos: [number, number, number] = mobile ? [0, vp.height * 0.175, 0] : [vp.width * 0.205, -0.08, 0]

  /* dots on land: fibonacci sphere filtered by the continent mask */
  const dots = useMemo(() => {
    const N = mobile ? 22000 : 34000
    const ga = Math.PI * (3 - Math.sqrt(5))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const z = new THREE.Vector3(0, 0, 1)
    const n = new THREE.Vector3()
    const s = new THREE.Vector3(1, 1, 1)
    const mats: number[] = []
    const rand: number[] = []
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N
      const r = Math.sqrt(1 - y * y)
      const th = i * ga
      n.set(Math.cos(th) * r, y, Math.sin(th) * r)
      const lat = Math.asin(y) / D2R
      const lon = Math.atan2(n.x, n.z) / D2R
      if (!isLand(lon, lat)) continue
      q.setFromUnitVectors(z, n)
      m.compose(n.clone().multiplyScalar(R * 1.002), q, s)
      mats.push(...m.elements)
      rand.push(Math.random())
    }
    const count = rand.length
    const geo = new THREE.CircleGeometry(mobile ? 0.0145 : 0.0118, 6)
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(rand), 1))
    const mat = new THREE.ShaderMaterial({ vertexShader: DOT_VERT, fragmentShader: DOT_FRAG, uniforms: { uTime: { value: 0 } } })
    const mesh = new THREE.InstancedMesh(geo, mat, count)
    mesh.instanceMatrix.array.set(mats)
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false
    return { mesh, mat, geo }
  }, [mobile])
  useEffect(() => () => (dots.geo.dispose(), dots.mat.dispose()), [dots])

  const coreMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG }), [])
  const atmoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: CORE_VERT,
        fragmentShader: ATMO_FRAG,
        uniforms: { uEdge: { value: Math.sqrt(1 - 1 / (1.2 * 1.2)) } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  /* cities */
  const cityDirs = useMemo(() => CITIES.map((c) => ll(c.lat, c.lon)), [])
  const cityQuats = useMemo(() => cityDirs.map((d) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d)), [cityDirs])
  const ringRefs = useRef<(THREE.Mesh | null)[]>([])
  const flashRefs = useRef<(THREE.Mesh | null)[]>([])
  const flash = useMemo(() => new Float32Array(CITIES.length), [])

  /* arcs: one tube per city pair, slots reuse them */
  const pairs = useMemo(() => {
    const list: { i: number; j: number; curve: ArcCurve; geo: THREE.TubeGeometry }[] = []
    for (let i = 0; i < CITIES.length; i++)
      for (let j = i + 1; j < CITIES.length; j++) {
        const ang = cityDirs[i].angleTo(cityDirs[j])
        if (ang > 2.35 || ang < 0.12) continue
        const curve = new ArcCurve(cityDirs[i], cityDirs[j])
        list.push({ i, j, curve, geo: new THREE.TubeGeometry(curve, 72, 0.0065, 5, false) })
      }
    return list
  }, [cityDirs])
  useEffect(() => () => pairs.forEach((p) => p.geo.dispose()), [pairs])

  const fade = useMemo(() => ({ value: 1 }), [])
  const glow = useMemo(() => glowTexture(), [])
  const slotObjs = useMemo(
    () =>
      Array.from({ length: SLOTS }, (_, k) => {
        const col = ARC_COLORS[k % ARC_COLORS.length]
        const mat = new THREE.ShaderMaterial({
          vertexShader: ARC_VERT,
          fragmentShader: ARC_FRAG,
          uniforms: { uHead: { value: 0 }, uTail: { value: 0 }, uFade: fade, uColor: { value: col }, uRev: { value: 0 } },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
        const mesh = new THREE.Mesh(pairs[0].geo, mat)
        mesh.visible = false
        mesh.frustumCulled = false
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col.clone().lerp(new THREE.Color('#fff'), 0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
        sprite.scale.setScalar(0.16)
        sprite.visible = false
        const slot: Slot = { on: false, pair: 0, rev: false, t: 0, speed: 0.5, len: 0.4, landed: false, delay: k * 0.35 }
        return { mesh, mat, sprite, slot }
      }),
    [pairs, fade, glow],
  )
  useEffect(() => () => slotObjs.forEach((o) => (o.mat.dispose(), o.sprite.material.dispose())), [slotObjs])

  const arcsOnRef = useRef(arcsOn)
  arcsOnRef.current = arcsOn
  useEffect(() => {
    const c = animate(fade.value, arcsOn ? 1 : 0, { duration: 0.6, onUpdate: (v) => (fade.value = v) })
    return () => c.stop()
  }, [arcsOn, fade])

  const launch = (o: (typeof slotObjs)[number], pi: number, rev: boolean, delay = 0) => {
    const p = pairs[pi]
    o.slot.on = true
    o.slot.pair = pi
    o.slot.rev = rev
    o.slot.t = 0
    o.slot.delay = delay
    o.slot.landed = false
    o.slot.len = 0.35 + Math.random() * 0.2
    o.slot.speed = 0.75 / (0.5 + p.curve.theta * 0.55) // longer arcs fly a bit longer
    o.mesh.geometry = p.geo
    o.mat.uniforms.uRev.value = rev ? 1 : 0
  }

  useEffect(() => {
    api.current = {
      broadcast: (from: number) => {
        let k = 0
        pairs.forEach((p, pi) => {
          if (p.i !== from && p.j !== from) return
          const o = slotObjs.find((s) => !s.slot.on)
          if (!o) return
          launch(o, pi, p.j === from, k++ * 0.09)
        })
        flash[from] = 1
      },
    }
  })

  const tmp = useMemo(() => new THREE.Vector3(), [])
  const clock = useRef(0)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    clock.current += dt
    const t = clock.current
    const st = stateRef.current

    // rotation: inertia decays toward the ambient spin; tilt eases back
    if (!st.dragging && !st.springing) {
      st.vel = THREE.MathUtils.damp(st.vel, AUTO, 0.7, dt)
      rotY.set(rotY.get() + st.vel * dt)
      rotX.set(THREE.MathUtils.damp(rotX.get(), st.tilt, 1.4, dt))
    }
    const g = group.current
    if (g) g.rotation.set(rotX.get(), rotY.get(), 0, 'XYZ')

    dots.mat.uniforms.uTime.value = t

    // city pulses
    for (let i = 0; i < CITIES.length; i++) {
      const ph = (t * 0.42 + i * 0.173) % 1
      const ring = ringRefs.current[i]
      if (ring) {
        ring.scale.setScalar(0.03 + ph * 0.13)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - ph, 1.6) * 0.85
      }
      flash[i] = Math.max(0, flash[i] - dt * 1.1)
      const fr = flashRefs.current[i]
      if (fr) {
        const f = flash[i]
        fr.visible = f > 0.001
        fr.scale.setScalar(0.04 + (1 - f) * 0.3)
        ;(fr.material as THREE.MeshBasicMaterial).opacity = f * f * 0.9
      }
    }

    // arcs
    let active = 0
    for (const o of slotObjs) if (o.slot.on && o.slot.delay <= 0) active++
    for (const o of slotObjs) {
      const s = o.slot
      if (!s.on) {
        s.delay -= dt
        if (s.delay <= 0 && arcsOnRef.current && active < (state.size.width < 760 ? 5 : 7)) {
          launch(o, Math.floor(Math.random() * pairs.length), Math.random() < 0.5, 0)
          active++
        }
        o.mesh.visible = false
        o.sprite.visible = false
        continue
      }
      if (s.delay > 0) {
        s.delay -= dt
        o.mesh.visible = false
        o.sprite.visible = false
        continue
      }
      s.t += dt * s.speed
      const head = Math.min(s.t, 1)
      const tail = s.t - s.len
      o.mat.uniforms.uHead.value = head
      o.mat.uniforms.uTail.value = Math.max(tail, 0)
      o.mesh.visible = fade.value > 0.01
      const p = pairs[s.pair]
      if (s.t < 1) {
        p.curve.getPoint(s.rev ? 1 - head : head, tmp)
        o.sprite.position.copy(tmp)
        o.sprite.visible = fade.value > 0.01
        o.sprite.material.opacity = fade.value
      } else {
        o.sprite.visible = false
        if (!s.landed) {
          s.landed = true
          flash[s.rev ? p.i : p.j] = 1
        }
      }
      if (tail >= 1) {
        s.on = false
        s.delay = 0.2 + Math.random() * 1.4
      }
    }
  })

  return (
    <group position={pos} scale={scale}>
      <group ref={group}>
        <mesh material={coreMat}>
          <sphereGeometry args={[R * 0.996, 96, 64]} />
        </mesh>
        <primitive object={dots.mesh} />
        {cityDirs.map((d, i) => (
          <group key={i} position={d.clone().multiplyScalar(R * 1.006)} quaternion={cityQuats[i]}>
            <mesh>
              <circleGeometry args={[0.028, 20]} />
              <meshBasicMaterial color="#e6f0ff" toneMapped={false} />
            </mesh>
            <mesh ref={(m) => void (ringRefs.current[i] = m)}>
              <ringGeometry args={[0.82, 1, 48]} />
              <meshBasicMaterial color="#8fb8ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
            <mesh ref={(m) => void (flashRefs.current[i] = m)} visible={false}>
              <ringGeometry args={[0.9, 1, 48]} />
              <meshBasicMaterial color="#bff4ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
          </group>
        ))}
        {slotObjs.map((o, k) => (
          <group key={k}>
            <primitive object={o.mesh} />
            <primitive object={o.sprite} />
          </group>
        ))}
      </group>
      <mesh material={atmoMat}>
        <sphereGeometry args={[R * 1.2, 64, 48]} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ page */

const nearestAngle = (target: number, cur: number) => {
  let t = target
  while (t - cur > Math.PI) t -= Math.PI * 2
  while (t - cur < -Math.PI) t += Math.PI * 2
  return t
}

export default function DotGlobe() {
  const [view, setView] = useState<ViewKey | null>('asia')
  const [arcsOn, setArcsOn] = useState(true)
  const rotY = useMotionValue(-VIEWS[0].lon * D2R - 0.35)
  const rotX = useMotionValue(VIEWS[0].lat * D2R * 0.85)
  const st = useRef({ dragging: false, springing: false, vel: AUTO, tilt: VIEWS[0].lat * D2R * 0.85 })
  const api = useRef<Api | null>(null)
  const ctrls = useRef<{ stop: () => void }[]>([])
  const drag = useRef({ x: 0, y: 0, t: 0, v: 0 })

  const goTo = (key: ViewKey) => {
    const v = VIEWS.find((x) => x.value === key)!
    setView(key)
    ctrls.current.forEach((c) => c.stop())
    const s = st.current
    s.springing = true
    s.tilt = v.lat * D2R * 0.85
    const spring = { type: 'spring' as const, stiffness: 46, damping: 15, mass: 1 }
    ctrls.current = [
      animate(rotY, nearestAngle(-v.lon * D2R, rotY.get()), {
        ...spring,
        velocity: s.vel,
        onComplete: () => {
          s.springing = false
          s.vel = 0
        },
      }),
      animate(rotX, s.tilt, spring),
    ]
  }

  const facingCity = () => {
    // the city closest to the globe's front (+z after rotation)
    const e = new THREE.Euler(rotX.get(), rotY.get(), 0, 'XYZ')
    const v = new THREE.Vector3()
    let best = 0
    let bz = -2
    CITIES.forEach((c, i) => {
      ll(c.lat, c.lon, 1, v).applyEuler(e)
      if (v.z > bz) (bz = v.z), (best = i)
    })
    return best
  }

  useEffect(() => () => ctrls.current.forEach((c) => c.stop()), [])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic pointers */
    }
    ctrls.current.forEach((c) => c.stop())
    const s = st.current
    s.dragging = true
    s.springing = false
    setView(null)
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), v: 0 }
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (!s.dragging) return
    const d = drag.current
    const now = performance.now()
    const k = 3.2 / Math.min(window.innerHeight, window.innerWidth * 0.9)
    const dx = (e.clientX - d.x) * k
    const dy = (e.clientY - d.y) * k
    rotY.set(rotY.get() + dx)
    const tilt = THREE.MathUtils.clamp(rotX.get() + dy, -0.7, 1.0)
    rotX.set(tilt)
    s.tilt = tilt
    const dtm = Math.max(now - d.t, 1) / 1000
    d.v = THREE.MathUtils.lerp(d.v, dx / dtm, 0.5)
    d.x = e.clientX
    d.y = e.clientY
    d.t = now
  }
  const onUp = () => {
    const s = st.current
    if (!s.dragging) return
    s.dragging = false
    const idle = performance.now() - drag.current.t > 90
    s.vel = idle ? 0 : THREE.MathUtils.clamp(drag.current.v, -5, 5)
  }

  return (
    <div className="stage" style={{ background: 'radial-gradient(70% 80% at 72% 50%, #0f1d44 0%, #081028 45%, #050913 100%)' }}>
      <style>{`
        .dg-drag { position: absolute; inset: 0; cursor: grab; touch-action: none; }
        .dg-drag:active { cursor: grabbing; }
        .dg-stats { display: flex; gap: 32px; margin: 34px 0 0; padding: 22px 0 0; border-top: 1px solid rgba(255,255,255,0.08); }
        .dg-stats b { display: block; font: 600 24px/1 var(--display); letter-spacing: -0.02em; color: var(--fg); }
        .dg-stats b em { color: #7fb0ff; }
        .dg-stats span { display: block; margin-top: 8px; font: 12px/1.2 var(--mono); color: var(--fg-2); }
        .dg-live { display: inline-flex; align-items: center; gap: 8px; }
        .dg-live i { width: 7px; height: 7px; border-radius: 50%; background: #5cf2b0; box-shadow: 0 0 0 0 rgba(92,242,176,0.6); animation: dg-ping 1.8s infinite; }
        @keyframes dg-ping { 0% { box-shadow: 0 0 0 0 rgba(92,242,176,0.55); } 100% { box-shadow: 0 0 0 9px rgba(92,242,176,0); } }
        .dg-copy .kicker i { background: #6f9bff !important; }
        @media (max-width: 760px) {
          .dg-stats { display: none; }
          .dg-copy p.dg-lede { font-size: 14.5px; line-height: 1.65; margin-top: 14px; }
          .dg-copy .hero-actions { margin-top: 20px; }
        }
      `}</style>
      <div className="dg-drag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 10], fov: 35 }} gl={{ antialias: true, alpha: true }}>
          <Globe rotX={rotX} rotY={rotY} stateRef={st} arcsOn={arcsOn} api={api} />
        </Canvas>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy dg-copy"
          style={{ ['--soft-bg' as string]: '#060b1a' }}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Global Edge · 实时同步
          </p>
          <h1 className="soft-text">
            全球 30+ 区域，
            <br />
            毫秒级同步
          </h1>
          <p className="dg-lede soft-text">写入落在离用户最近的节点，再沿骨干网复制到全球。每一道飞线，都是一次跨区域同步。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => api.current?.broadcast(facingCity())}>
              从正面节点广播
            </button>
            <span className="btn dg-live" style={{ cursor: 'default' }}>
              <i /> {CITIES.length} 个节点在线
            </span>
          </div>
          <div className="dg-stats">
            <div>
              <b>32</b>
              <span>可用区域</span>
            </div>
            <div>
              <b>
                &lt;<em>48</em>ms
              </b>
              <span>跨洲 P99</span>
            </div>
            <div>
              <b>99.99%</b>
              <span>SLA</span>
            </div>
          </div>
        </motion.div>

        <div className="dock">
          <button className="seg" aria-pressed={arcsOn} onClick={() => setArcsOn((a) => !a)}>
            <span>{arcsOn ? '飞线 开' : '飞线 关'}</span>
          </button>
          <span className="dock-sep" />
          <Seg items={VIEWS.map((v) => ({ value: v.value, label: v.label }))} value={view ?? ('' as ViewKey)} onChange={goTo} />
        </div>
        <p className="hint">
          拖动旋转地球 · 松手带惯性
          <br />
          飞线落地时目标节点闪烁
        </p>
      </div>
    </div>
  )
}
