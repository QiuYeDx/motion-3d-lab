import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import type { ChromaticAberrationEffect } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ tunnel constants */

const RINGS = 64
const SPACING = 2.4
const LEN = RINGS * SPACING
const R = 3.4
const RAILS = 12
const MOBILE = typeof window !== 'undefined' && window.innerWidth < 760
const STREAKS = MOBILE ? 900 : 2000

type Palette = { key: string; label: string; ring: string; ringWarp: string; head: string; tail: string; tailWarp: string; bg: string }
const PALETTES: Palette[] = [
  { key: 'aurora', label: '极光', ring: '#6bffd8', ringWarp: '#7f8bff', head: '#e8fff8', tail: '#3fd2c7', tailWarp: '#ff4fd8', bg: '#04070a' },
  { key: 'sunset', label: '日落', ring: '#ffad5c', ringWarp: '#ff4f86', head: '#fff3dc', tail: '#ff8a5c', tailWarp: '#6b7bff', bg: '#0a0506' },
  { key: 'volt', label: '电光', ring: '#5b8cff', ringWarp: '#c46bff', head: '#eef3ff', tail: '#5b8cff', tailWarp: '#3fffd2', bg: '#05050c' },
]

/* the tunnel's centre-line: a sum of slow sines. Everything is drawn relative to where the camera is on it,
   minus the tangent, so the tunnel always starts dead ahead and bends away. */
const PATH_GLSL = /* glsl */ `
  uniform float uTravel;
  vec2 path(float s) {
    return vec2(sin(s * 0.019) * 9.0 + sin(s * 0.043 + 1.7) * 3.0, sin(s * 0.015 + 0.6) * 6.0 + cos(s * 0.037) * 2.4);
  }
  vec2 dpath(float s) {
    return vec2(cos(s * 0.019) * 0.171 + cos(s * 0.043 + 1.7) * 0.129, cos(s * 0.015 + 0.6) * 0.09 - sin(s * 0.037) * 0.0888);
  }
  vec2 bend(float z) {
    float s = uTravel - z;
    return path(s) - path(uTravel) - dpath(uTravel) * (-z);
  }
  float depthFade(float d) {
    return smoothstep(0.6, 5.0, d) * exp(-d * 0.021);
  }
`

const ringVert = /* glsl */ `
  ${PATH_GLSL}
  attribute float aSlot;
  uniform float uTwist;
  varying float vBand;
  varying float vDepth;
  void main() {
    float z = -mod(aSlot * ${SPACING.toFixed(2)} - uTravel, ${LEN.toFixed(2)});
    float s = uTravel - z;
    float a = s * uTwist;
    vec2 p = position.xy;
    vBand = length(p);
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p * ${R.toFixed(2)};
    vDepth = -z;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + bend(z), z, 1.0);
  }
`
const ringFrag = /* glsl */ `
  uniform vec3 uRing;
  uniform vec3 uRingWarp;
  uniform float uWarp;
  uniform float uPulse;
  varying float vBand;
  varying float vDepth;
  float depthFade(float d) { return smoothstep(0.6, 5.0, d) * exp(-d * 0.021); }
  void main() {
    float prof = 1.0 - abs(vBand - 0.988) / 0.012;
    prof = clamp(prof, 0.0, 1.0);
    prof *= prof;
    // a travelling brightness wave along the tunnel
    float wave = 0.65 + 0.35 * sin(vDepth * 0.35 - uPulse * 6.0);
    vec3 c = mix(uRing, uRingWarp, uWarp) * (1.3 + uWarp * 1.4) * wave;
    gl_FragColor = vec4(c * prof * depthFade(vDepth), 1.0);
  }
`

const railVert = /* glsl */ `
  ${PATH_GLSL}
  attribute vec3 aRail; // slot, angle, end
  uniform float uTwist;
  varying float vDepth;
  void main() {
    float z = -mod(aRail.x * ${SPACING.toFixed(2)} - uTravel, ${LEN.toFixed(2)}) - aRail.z * ${SPACING.toFixed(2)};
    float s = uTravel - z;
    float a = aRail.y + s * uTwist;
    vDepth = -z;
    gl_Position = projectionMatrix * viewMatrix * vec4(vec2(cos(a), sin(a)) * ${R.toFixed(2)} + bend(z), z, 1.0);
  }
`
const railFrag = /* glsl */ `
  uniform vec3 uRing;
  uniform vec3 uRingWarp;
  uniform float uWarp;
  varying float vDepth;
  float depthFade(float d) { return smoothstep(0.6, 5.0, d) * exp(-d * 0.021); }
  void main() {
    gl_FragColor = vec4(mix(uRing, uRingWarp, uWarp) * 0.32 * depthFade(vDepth), 1.0);
  }
`

const streakVert = /* glsl */ `
  ${PATH_GLSL}
  attribute vec4 aSeed; // angle, radius, offset, speed
  uniform float uSpeedTravel;
  uniform float uStreak;
  uniform vec2 uRes;
  uniform float uDpr;
  varying float vEnd;
  varying float vSide;
  varying float vFade;
  vec3 at(float z) {
    float r = aSeed.y * ${(R * 0.96).toFixed(2)};
    return vec3(vec2(cos(aSeed.x), sin(aSeed.x)) * r + bend(z), z);
  }
  void main() {
    float zh = -mod(aSeed.z - uSpeedTravel * aSeed.w, ${LEN.toFixed(2)});
    zh = min(zh, -0.35);
    float zt = zh - uStreak * (0.55 + 0.45 * aSeed.w);
    vec4 ch = projectionMatrix * viewMatrix * vec4(at(zh), 1.0);
    vec4 ct = projectionMatrix * viewMatrix * vec4(at(zt), 1.0);
    vec2 sh = ch.xy / ch.w * uRes;
    vec2 st = ct.xy / ct.w * uRes;
    vec2 dir = sh - st;
    float l = length(dir);
    dir = l > 0.001 ? dir / l : vec2(0.0, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = clamp(7.0 / -zh, 0.7, 3.2) * uDpr;
    vec4 c = position.y < 0.5 ? ch : ct;
    vec2 off = nrm * position.x * w + dir * (position.y < 0.5 ? w : -w * 0.5);
    c.xy += off / uRes * c.w;
    gl_Position = c;
    vEnd = position.y;
    vSide = position.x;
    vFade = depthFade(-zh) * (0.5 + 0.5 * aSeed.w);
  }
`
const streakFrag = /* glsl */ `
  uniform vec3 uHead;
  uniform vec3 uTail;
  uniform vec3 uTailWarp;
  uniform float uChroma;
  varying float vEnd;
  varying float vSide;
  varying float vFade;
  void main() {
    float across = 1.0 - vSide * vSide;
    float along = pow(1.0 - vEnd, 1.4);
    vec3 tail = mix(uTail, uTailWarp, uChroma);
    // chromatic split: the trailing part of the streak drifts toward the warp hue
    vec3 c = mix(uHead, tail, smoothstep(0.0, 0.7, vEnd + uChroma * 0.25));
    gl_FragColor = vec4(c * across * along * vFade * 1.8, 1.0);
  }
`

/* ------------------------------------------------------------------ scene */

type Springs = { speed: MotionValue<number>; fov: MotionValue<number>; streak: MotionValue<number>; chroma: MotionValue<number> }

function Tunnel({ springs, palette, hex, pointer }: { springs: Springs; palette: Palette; hex: boolean; pointer: React.RefObject<THREE.Vector2> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const rig = useRef({ travel: 0, streakTravel: 0, pulse: 0, yaw: 0, pitch: 0 })

  const shared = useMemo(
    () => ({
      uTravel: { value: 0 },
      uTwist: { value: 0.012 },
      uWarp: { value: 0 },
      uPulse: { value: 0 },
      uRing: { value: new THREE.Color(PALETTES[0].ring) },
      uRingWarp: { value: new THREE.Color(PALETTES[0].ringWarp) },
    }),
    [],
  )
  const streakU = useMemo(
    () => ({
      uTravel: shared.uTravel,
      uSpeedTravel: { value: 0 },
      uStreak: { value: 0.3 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uChroma: { value: 0 },
      uHead: { value: new THREE.Color(PALETTES[0].head) },
      uTail: { value: new THREE.Color(PALETTES[0].tail) },
      uTailWarp: { value: new THREE.Color(PALETTES[0].tailWarp) },
    }),
    [shared],
  )

  const ringGeo = useMemo(() => {
    const g = new THREE.RingGeometry(0.976, 1, hex ? 6 : 128, 1)
    g.setAttribute('aSlot', new THREE.InstancedBufferAttribute(Float32Array.from({ length: RINGS }, (_, i) => i), 1))
    return g
  }, [hex])
  const ringMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [shared],
  )

  const railGeo = useMemo(() => {
    const n = hex ? 6 : RAILS
    const arr = new Float32Array(RINGS * n * 2 * 3)
    let k = 0
    for (let i = 0; i < RINGS; i++)
      for (let j = 0; j < n; j++)
        for (let e = 0; e < 2; e++) {
          arr[k++] = i
          arr[k++] = (j / n) * Math.PI * 2
          arr[k++] = e
        }
    const g = new THREE.BufferGeometry()
    g.setAttribute('aRail', new THREE.BufferAttribute(arr, 3))
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr.length), 3))
    return g
  }, [hex])
  const railMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: shared,
        vertexShader: railVert,
        fragmentShader: railFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [shared],
  )

  const streakGeo = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3))
    g.setIndex([0, 2, 1, 1, 2, 3])
    const seed = new Float32Array(STREAKS * 4)
    for (let i = 0; i < STREAKS; i++) {
      seed[i * 4] = Math.random() * Math.PI * 2
      seed[i * 4 + 1] = 0.18 + Math.pow(Math.random(), 0.45) * 0.82
      seed[i * 4 + 2] = Math.random() * LEN
      seed[i * 4 + 3] = 0.55 + Math.random() * 0.9
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
    g.instanceCount = STREAKS
    return g
  }, [])
  const streakMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: streakU,
        vertexShader: streakVert,
        fragmentShader: streakFrag,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [streakU],
  )

  const target = useMemo(
    () => ({
      ring: new THREE.Color(),
      ringWarp: new THREE.Color(),
      head: new THREE.Color(),
      tail: new THREE.Color(),
      tailWarp: new THREE.Color(),
    }),
    [],
  )

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const r = rig.current
    const warp = THREE.MathUtils.clamp(springs.speed.get(), -0.2, 1.4)
    const speed = 7 + warp * 78
    r.travel += dt * speed
    r.pulse += dt * (0.4 + warp * 1.6)
    shared.uTravel.value = r.travel
    shared.uWarp.value = THREE.MathUtils.clamp(springs.chroma.get(), 0, 1)
    shared.uPulse.value = r.pulse
    shared.uTwist.value = hex ? 0.012 + warp * 0.01 : 0.004
    streakU.uSpeedTravel.value = r.travel * 1.15
    streakU.uStreak.value = 0.25 + Math.max(0, springs.streak.get()) * 11
    streakU.uChroma.value = THREE.MathUtils.clamp(springs.chroma.get(), 0, 1)
    streakU.uRes.value.set(size.width * dpr * 0.5, size.height * dpr * 0.5)
    streakU.uDpr.value = dpr

    // palette crossfade
    const k = 1 - Math.exp(-dt * 3)
    shared.uRing.value.lerp(target.ring.set(palette.ring), k)
    shared.uRingWarp.value.lerp(target.ringWarp.set(palette.ringWarp), k)
    streakU.uHead.value.lerp(target.head.set(palette.head), k)
    streakU.uTail.value.lerp(target.tail.set(palette.tail), k)
    streakU.uTailWarp.value.lerp(target.tailWarp.set(palette.tailWarp), k)

    // FOV punches out with the warp, the pointer steers a little, and a faint shake at full speed
    const fov = 58 + springs.fov.get() * 40
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    r.yaw = THREE.MathUtils.damp(r.yaw, -pointer.current.x * 0.22, 2.5, dt)
    r.pitch = THREE.MathUtils.damp(r.pitch, pointer.current.y * 0.16, 2.5, dt)
    const shake = Math.max(0, warp - 0.6) * 0.012
    camera.rotation.set(r.pitch + (Math.random() - 0.5) * shake, r.yaw + (Math.random() - 0.5) * shake, -r.yaw * 0.35 + Math.sin(s.clock.elapsedTime * 0.3) * 0.05)
  })

  return (
    <>
      <instancedMesh args={[ringGeo, ringMat, RINGS]} frustumCulled={false} />
      <lineSegments geometry={railGeo} material={railMat} frustumCulled={false} />
      <mesh geometry={streakGeo} material={streakMat} frustumCulled={false} />
    </>
  )
}

function Post({ chroma }: { chroma: MotionValue<number> }) {
  const ca = useRef<ChromaticAberrationEffect>(null)
  const off = useMemo(() => new THREE.Vector2(0.0004, 0.0004), [])
  useFrame(() => {
    const c = Math.max(0, chroma.get())
    if (ca.current) ca.current.offset.set(0.0004 + c * 0.0035, 0.0003 + c * 0.002)
  })
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.18} luminanceSmoothing={0.3} radius={0.72} />
      <ChromaticAberration ref={ca} offset={off} radialModulation modulationOffset={0.25} />
      <Vignette eskil={false} offset={0.22} darkness={0.75} />
    </EffectComposer>
  )
}

/* ------------------------------------------------------------------ page */

export default function WarpTunnel() {
  const hold = useMotionValue(0)
  // each parameter gets its own spring personality: the speed builds slowly, the FOV punches and overshoots
  const speed = useSpring(hold, { stiffness: 38, damping: 13, mass: 1 })
  const fov = useSpring(hold, { stiffness: 120, damping: 11, mass: 0.9 })
  const streak = useSpring(hold, { stiffness: 70, damping: 16 })
  const chroma = useSpring(hold, { stiffness: 55, damping: 15 })
  const springs = useMemo(() => ({ speed, fov, streak, chroma }), [speed, fov, streak, chroma])

  const readout = useTransform(speed, (v) => (0.08 + Math.max(0, v) * 0.91).toFixed(2))
  const bar = useTransform(speed, (v) => Math.min(1, Math.max(0.04, 0.04 + v * 0.96)))

  const [held, setHeld] = useState(false)
  const [pal, setPal] = useState(PALETTES[0].key)
  const [shape, setShape] = useState<'ring' | 'hex'>('ring')
  const lastUser = useRef(0)
  const pointer = useRef(new THREE.Vector2())
  const palette = PALETTES.find((p) => p.key === pal)!

  const press = (on: boolean) => {
    lastUser.current = performance.now()
    hold.set(on ? 1 : 0)
    setHeld(on)
  }

  useEffect(() => {
    const move = (e: PointerEvent) => pointer.current.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])

  // keyboard: hold space
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target as HTMLElement)?.closest('input, textarea, button')) {
        e.preventDefault()
        press(true)
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && press(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ambient: when nobody is driving, the ship surges on its own every few seconds
  useEffect(() => {
    let off: ReturnType<typeof setTimeout> | undefined
    const id = setInterval(() => {
      if (performance.now() - lastUser.current < 8000 || hold.get() >= 1) return
      hold.set(0.42)
      off = setTimeout(() => hold.get() < 1 && hold.set(0), 1500)
    }, 7000)
    return () => {
      clearInterval(id)
      clearTimeout(off)
    }
  }, [hold])

  return (
    <div
      className="stage warp-stage"
      style={{ background: palette.bg }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        } catch {
          /* synthetic / already-released pointers */
        }
        press(true)
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <style>{`
        .warp-stage { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: crosshair; transition: background .8s; }
        .warp-hud { position: absolute; left: 50%; bottom: 104px; transform: translateX(-50%); text-align: center; pointer-events: none !important; width: max-content; max-width: calc(100% - 32px); }
        .warp-hud { isolation: isolate; }
        .warp-hud::before { content: ''; position: absolute; z-index: -1; inset: -70px -160px -50px; background: radial-gradient(closest-side, rgba(0,0,0,.62), rgba(0,0,0,.3) 55%, transparent); }
        .warp-hud .k { margin: 0 0 12px; font: 500 11px/1 var(--mono); letter-spacing: .22em; color: var(--fg-2); text-transform: uppercase; }
        .warp-hud h1 { margin: 0; font: 600 clamp(30px, 4.2vw, 52px)/1.05 var(--display); letter-spacing: -.02em; text-shadow: 0 2px 30px rgba(0,0,0,.6); }
        .warp-speed { display: inline-flex; align-items: baseline; gap: 8px; margin-top: 16px; font: 500 13px/1 var(--mono); color: var(--fg-2); }
        .warp-speed b { font: 600 22px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; min-width: 3.2ch; text-align: right; }
        .warp-meter { width: 180px; height: 2px; margin: 14px auto 0; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
        .warp-meter i { display: block; height: 100%; transform-origin: 0 50%; background: var(--warp-accent); box-shadow: 0 0 12px var(--warp-accent); }
        .warp-stage .dock { cursor: default; }
      `}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 0], fov: 58, near: 0.05, far: 400 }} gl={{ antialias: false, alpha: false }}>
        <color attach="background" args={[palette.bg]} />
        <Tunnel springs={springs} palette={palette} hex={shape === 'hex'} pointer={pointer} />
        <Post chroma={chroma} />
      </Canvas>

      <div className="overlay" style={{ ['--warp-accent' as string]: palette.ring }}>
        <div className="warp-hud">
          <p className="k">Warp drive · Hold to engage</p>
          <h1>{held ? '曲速航行中' : '按住 进入曲速'}</h1>
          <div className="warp-speed">
            <motion.b>{readout}</motion.b> c
          </div>
          <div className="warp-meter">
            <motion.i style={{ scaleX: bar }} />
          </div>
        </div>

        <div className="dock" onPointerDown={(e) => e.stopPropagation()}>
          <Seg items={PALETTES.map((p) => ({ value: p.key, label: p.label }))} value={pal} onChange={setPal} />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'ring', label: '圆环' },
              { value: 'hex', label: '六边' },
            ]}
            value={shape}
            onChange={setShape}
          />
        </div>
        <p className="hint">按住任意位置 · 空格键同样有效</p>
      </div>
    </div>
  )
}
