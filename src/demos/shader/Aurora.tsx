import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { AURORA_FRAG, AURORA_VERT } from './auroraShader'

/*
 * 极光雪山 — the whole scene is one fragment shader (see auroraShader.ts). JS only drives the camera, the
 * intensity / palette cross-fades, the celestial rotation and the substorm pulses (Motion timelines written
 * into a plain object that useFrame copies to uniforms).
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const DEVICE_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
// the march is per pixel; the scene is soft → render below native resolution, adapt down if needed
const BASE_DPR = Math.max(0.75, DEVICE_DPR * (MOBILE ? 0.6 : 0.8))
const CAM_Y = 0.55

type Level = { zh: string; en: string; speed: number; bright: number; rays: number; height: number; wave: number; gain3: number; every: [number, number]; amp: number }
const LEVELS: Level[] = [
  { zh: '平静', en: 'Quiet arc', speed: 0.45, bright: 1.05, rays: 0.5, height: 0.75, wave: 0.6, gain3: 0, every: [13, 20], amp: 0.55 },
  { zh: '活跃', en: 'Active curtains', speed: 1, bright: 1.35, rays: 0.85, height: 1, wave: 1, gain3: 0.55, every: [6, 10], amp: 0.9 },
  { zh: '爆发', en: 'Substorm', speed: 2.2, bright: 1.9, rays: 1, height: 1.4, wave: 1.5, gain3: 1, every: [2.6, 4.8], amp: 1.4 },
]

type Pal = { zh: string; core: string; fringe: string; low: string; dot: string; note: string }
const PALS: Pal[] = [
  { zh: '经典绿', core: '#2bff8f', fringe: '#b13dff', low: '#ff4a9e', dot: '#5cffb0', note: '557.7 nm 氧原子绿光，高处转为紫红' },
  { zh: '罕见红紫', core: '#ff2a55', fringe: '#8a3cff', low: '#ffa0c8', dot: '#ff5a86', note: '630 nm 高空氧红光，只在强磁暴时出现' },
  { zh: '冰蓝', core: '#2ad8ff', fringe: '#5a4bff', low: '#b9f4ff', dot: '#6fe4ff', note: '想象中的冷色帘幕，蓝紫色上缘' },
]

const lin = (hex: string) => {
  const c = new THREE.Color(hex) // sRGB hex → linear working space
  return [c.r, c.g, c.b]
}

type Live = {
  speed: number
  bright: number
  rays: number
  height: number
  wave: number
  gain3: number
  core: number[]
  fringe: number[]
  low: number[]
  pulseX: number
  pulseW: number
  pulseAmp: number
  pulseAll: number
  spin: number // celestial rotation speed (rad/s)
}

/* ------------------------------------------------------------------ scene */

function Sky({ live, px, py }: { live: React.RefObject<Live>; px: MotionValue<number>; py: MotionValue<number> }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uCam: { value: new THREE.Matrix3() },
      uFocal: { value: 2.1 },
      uPix: { value: 0.002 },
      uCamY: { value: CAM_Y },
      uT: { value: POSTER ? 18 : 0 },
      uTime: { value: 0 },
      uStar: { value: new THREE.Matrix3() },
      uBright: { value: 1 },
      uRays: { value: 1 },
      uHeight: { value: 1 },
      uWave: { value: 1 },
      uGain3: { value: 0 },
      uPulse: { value: new THREE.Vector4(0, 20, 0, 0) },
      uCore: { value: new THREE.Vector3() },
      uFringe: { value: new THREE.Vector3() },
      uLow: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Vector3() },
      uFade: { value: 0 },
    }
    const mat = new THREE.ShaderMaterial({ vertexShader: AURORA_VERT, fragmentShader: AURORA_FRAG, uniforms, depthTest: false, depthWrite: false })
    const geo = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(geo, mat)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    return {
      uniforms,
      mat,
      geo,
      scene,
      cam,
      e: new THREE.Euler(0, 0, 0, 'YXZ'),
      m4: new THREE.Matrix4(),
      pole: new THREE.Vector3(-0.25, 0.62, -0.74).normalize(),
      buf: new THREE.Vector2(),
    }
  }, [])
  useEffect(
    () => () => {
      R.mat.dispose()
      R.geo.dispose()
    },
    [R],
  )

  // compile the big shader in the background (KHR_parallel_shader_compile) against the screen target;
  // until then the canvas stays transparent over the CSS night gradient, then fades in
  const st = useRef({ ready: false, t: POSTER ? 18 : 0, time: 0, rot: POSTER ? 0.6 : 0, fade: 0 })
  useEffect(() => {
    let alive = true
    const target = gl.getRenderTarget()
    gl.setRenderTarget(null)
    gl.compileAsync(R.scene, R.cam)
      .catch(() => {})
      .then(() => {
        if (alive) st.current.ready = true
      })
    gl.setRenderTarget(target)
    return () => {
      alive = false
    }
  }, [R, gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    const L = live.current
    const u = R.uniforms

    if (!s.ready) {
      gl.setRenderTarget(null)
      gl.setClearColor(0x000000, 0)
      gl.clear(true, true, false)
      return
    }
    s.fade = POSTER ? 1 : Math.min(1, s.fade + dt / 0.9)
    s.t += dt * L.speed
    s.time += dt
    s.rot += dt * L.spin

    /* camera: subject right of the copy on desktop, centred on phones and posters */
    gl.getDrawingBufferSize(R.buf)
    u.uRes.value.copy(R.buf)
    const mobile = size.width < 760
    const portrait = size.width < size.height
    const focal = portrait ? 1.3 : 2.05
    const yaw0 = POSTER ? -0.1 : mobile ? -0.12 : 0.1
    const pitch0 = portrait ? 0.24 : 0.16
    R.e.set(pitch0 + py.get() * 0.035 + Math.sin(s.time * 0.07) * 0.006, yaw0 - px.get() * 0.07 + Math.sin(s.time * 0.05) * 0.012, 0)
    R.m4.makeRotationFromEuler(R.e)
    u.uCam.value.setFromMatrix4(R.m4)
    u.uFocal.value = focal
    u.uPix.value = 2 / (R.buf.y * focal)

    /* sky: stars turn about the celestial pole */
    R.m4.makeRotationAxis(R.pole, s.rot)
    u.uStar.value.setFromMatrix4(R.m4)

    u.uT.value = s.t
    u.uTime.value = s.time
    u.uBright.value = L.bright
    u.uRays.value = L.rays
    u.uHeight.value = L.height
    u.uWave.value = L.wave
    u.uGain3.value = L.gain3
    u.uPulse.value.set(L.pulseX, L.pulseW, L.pulseAmp, L.pulseAll)
    u.uCore.value.fromArray(L.core)
    u.uFringe.value.fromArray(L.fringe)
    u.uLow.value.fromArray(L.low)
    // light the aurora throws on snow and ice: its core colour, scaled by how bright it is right now
    const g = 0.085 * L.bright * (1 + 0.8 * L.pulseAll + 0.35 * L.pulseAmp)
    u.uGlow.value.set(L.core[0] * g, L.core[1] * g, L.core[2] * g)
    u.uFade.value = s.fade

    gl.setRenderTarget(null)
    gl.render(R.scene, R.cam)
  }, 1)

  return null
}

/* ------------------------------------------------------------------ page */

export default function Aurora() {
  const [lvl, setLvl] = useState(1)
  const [pal, setPal] = useState(0)
  const [spin, setSpin] = useState(true)
  const [dpr, setDpr] = useState(BASE_DPR)

  const live = useRef<Live>({
    ...pick(LEVELS[1]),
    core: lin(PALS[0].core),
    fringe: lin(PALS[0].fringe),
    low: lin(PALS[0].low),
    pulseX: 0,
    pulseW: 24,
    pulseAmp: POSTER ? 0.25 : 0,
    pulseAll: 0,
    spin: 0.012,
  })

  const px = useSpring(0, { stiffness: 16, damping: 11, mass: 1.2 })
  const py = useSpring(0, { stiffness: 16, damping: 11, mass: 1.2 })

  // intensity: every parameter eases from what is on screen
  useEffect(() => {
    const from = pick(live.current)
    const to = pick(LEVELS[lvl])
    const c = animate(0, 1, {
      duration: 2.2,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        for (const key of LKEYS) live.current[key] = from[key] + (to[key] - from[key]) * k
      },
    })
    return () => c.stop()
  }, [lvl])

  // palette cross-fade
  useEffect(() => {
    const L = live.current
    const from = { core: [...L.core], fringe: [...L.fringe], low: [...L.low] }
    const P = PALS[pal]
    const to = { core: lin(P.core), fringe: lin(P.fringe), low: lin(P.low) }
    const c = animate(0, 1, {
      duration: 1.8,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        for (const key of ['core', 'fringe', 'low'] as const) for (let i = 0; i < 3; i++) L[key][i] = from[key][i] + (to[key][i] - from[key][i]) * k
      },
    })
    return () => c.stop()
  }, [pal])

  // star rotation toggle eases in / out instead of snapping
  useEffect(() => {
    const c = animate(live.current.spin, spin ? 0.012 : 0, { duration: 1.6, ease: 'easeInOut', onUpdate: (v) => (live.current.spin = v) })
    return () => c.stop()
  }, [spin])

  // substorm pulse: a brightening that surges along the curtains, and the whole oval flares a little
  const pulseAnim = useRef<ReturnType<typeof animate> | null>(null)
  const surge = (x0: number, strength: number) => {
    const L = live.current
    const dir = Math.random() < 0.5 ? -1 : 1
    pulseAnim.current?.stop()
    const a0 = L.pulseAmp
    const g0 = L.pulseAll
    pulseAnim.current = animate(0, 1, {
      duration: 4.6,
      ease: 'linear',
      onUpdate: (k) => {
        const up = Math.min(1, k / 0.14)
        const env = up * up * (3 - 2 * up) * Math.pow(1 - k, 1.6)
        L.pulseX = x0 + dir * 46 * k
        L.pulseW = 16 + 26 * k
        L.pulseAmp = a0 * (1 - up) + strength * 1.6 * env
        L.pulseAll = g0 * (1 - up) + strength * 0.45 * env
      },
    })
  }
  useEffect(() => () => pulseAnim.current?.stop(), [])

  // ambient substorms on their own clock, faster when the aurora is more active
  useEffect(() => {
    if (POSTER) return
    let id = 0
    const L = LEVELS[lvl]
    const next = () => {
      const w = L.every[0] + Math.random() * (L.every[1] - L.every[0])
      id = window.setTimeout(() => {
        surge(-40 + Math.random() * 80, L.amp * (0.7 + Math.random() * 0.5))
        next()
      }, w * 1000)
    }
    next()
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvl])

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    px.set(((e.clientX - r.left) / r.width) * 2 - 1)
    py.set(-(((e.clientY - r.top) / r.height) * 2 - 1))
  }
  const onLeave = () => {
    px.set(0)
    py.set(0)
  }
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .ar-copy')) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // clicked screen x → roughly the same spot on the main curtain (~50 units away)
    const nx = (e.clientX - r.left - r.width / 2) / (r.height / 2)
    const portrait = r.width < r.height
    const yaw = (POSTER ? -0.1 : r.width < 760 ? -0.12 : 0.1) - px.get() * 0.07
    const ang = Math.atan(nx / (portrait ? 1.3 : 2.05)) - yaw
    surge(Math.tan(ang) * 50, LEVELS[lvl].amp * 1.15 + 0.3)
  }

  const P = PALS[pal]
  const L = LEVELS[lvl]

  return (
    <div className="stage ar" onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onDown}>
      <style>{css}</style>
      <Canvas dpr={dpr} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }} orthographic camera={{ position: [0, 0, 1] }}>
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.5, d * 0.8))} flipflops={3} />
        <Sky live={live} px={px} py={py} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="ar-copy soft-text"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="ar-kicker">
            <i style={{ background: P.dot, boxShadow: `0 0 12px ${P.dot}` }} />
            <span>RAYMARCHED CURTAINS ·</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={L.en}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                {L.en}
              </motion.span>
            </AnimatePresence>
          </p>
          <h1>等一场极光</h1>
          <p className="ar-sub">四道光幕在星空里飘荡，冰湖把它们倒映回来。点一下天空，触发一次亚暴增亮。</p>
          <p className="ar-note">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={P.zh}
                initial={{ opacity: 0, filter: 'blur(4px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.45 }}
              >
                {P.note}
              </motion.span>
            </AnimatePresence>
          </p>
        </motion.div>

        <div className="dock">
          <Seg items={LEVELS.map((l, i) => ({ value: i, label: l.zh }))} value={lvl} onChange={setLvl} />
          <span className="dock-sep" />
          <Seg items={PALS.map((p, i) => ({ value: i, label: p.zh }))} value={pal} onChange={setPal} />
          <span className="dock-sep" />
          <button className="seg ar-tog" aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
            <span>
              <i />
              <b>
                <em>星空</em>旋转
              </b>
            </span>
          </button>
        </div>
        <p className="hint">移动指针 · 视线轻移　点击天空 · 亚暴增亮</p>
      </div>
    </div>
  )
}

const LKEYS = ['speed', 'bright', 'rays', 'height', 'wave', 'gain3'] as const
function pick(o: Pick<Level, (typeof LKEYS)[number]>) {
  return { speed: o.speed, bright: o.bright, rays: o.rays, height: o.height, wave: o.wave, gain3: o.gain3 }
}

const css = `
.ar { background: radial-gradient(120% 80% at 60% 20%, #0a1626 0%, #050b16 55%, #020409 100%); }
.ar-copy {
  --soft-bg: #02050c;
  position: absolute; left: clamp(24px, 6vw, 96px); top: 50%; transform: translateY(-62%);
  max-width: 420px; pointer-events: none !important; isolation: isolate;
}
.ar-copy::before {
  content: ''; position: absolute; z-index: -1; left: -140px; right: -150px; top: -100px; bottom: -90px;
  background: radial-gradient(closest-side, rgba(2, 5, 12, .5), rgba(2, 5, 12, .22) 55%, transparent);
  pointer-events: none;
}
.ar-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.ar-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.6s, box-shadow 1.6s; }
.ar-kicker span { display: inline-block; }
.ar-copy h1 { margin: 0; font: 600 clamp(32px, 3.8vw, 52px)/1.08 var(--display); letter-spacing: -.035em; }
.ar-sub { margin: 14px 0 0; font-size: 14.5px; line-height: 1.75; color: var(--fg-2); }
.ar-note { margin: 16px 0 0; min-height: 18px; font: 500 11.5px/1.5 var(--mono); letter-spacing: .03em; color: var(--fg-2); opacity: .8 }
.ar-note span { display: inline-block }
.ar-tog span { display: inline-flex; align-items: center; gap: 7px; }
.ar-tog b { font-weight: inherit; }
.ar-tog em { font-style: normal; }
.ar-tog i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px currentColor; transition: background .25s, box-shadow .25s; }
.ar-tog[aria-pressed='true'] i { background: #9fffd2; box-shadow: 0 0 8px #5cffb0; }
@media (max-width: 760px) {
  .ar .dock .seg { padding: 0 7px; font-size: 12px; }
  .ar .dock .dock-sep { margin: 0 1px; }
  .ar-tog em { display: none; }
  .ar-copy { top: auto; bottom: 92px; right: 24px; transform: none; }
  .ar-copy h1 { font-size: 30px; }
  .ar-sub { font-size: 13px; }
  .ar-note { display: none }
}
`
