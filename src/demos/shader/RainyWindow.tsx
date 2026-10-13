import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { cityFrag, clearFrag, compositeFrag, dropFrag, dropVert, quadVert, wipeFrag } from './rainyShaders'

/*
 * 雨窗 — a CPU drop simulation (sliding, wobbling, trail-leaving, merging drops) is splatted as a
 * metaball "lens field" into a half-float target. The composite refracts a SHARP procedural city
 * through every drop (inverted, zoomed-out — the way real drops act as ball lenses) while the glass
 * itself shows the BOKEH version of the same city, under a layer of condensation you can wipe away.
 * Wipes and drop tracks are stored as max-blended timestamps, so the fog creeps back on its own.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const M = 0.14 // background margin around the pane (pane-height units)
const KR = 1.5 // drop kernel radius / visual radius
const T0 = 100 // sim clock start: older than every fog / regrow window, so the glass starts fogged

const RAIN = [
  { zh: '小雨', rate: 1.5, dens: 0.55, fog: 0.62 },
  { zh: '中雨', rate: 3.8, dens: 0.8, fog: 0.72 },
  { zh: '暴雨', rate: 10, dens: 1.0, fog: 0.84 },
]
const TIMES = [
  { zh: '黄昏', clock: '18:47', dot: '#ffb86b' },
  { zh: '深夜', clock: '02:13', dot: '#7fb8ff' },
]

/* ------------------------------------------------------------------ drop simulation */

type Drop = { x: number; y: number; r: number; vy: number; drift: number; stick: number; trail: number; seed: number; moving: boolean; dead: boolean }
type Trail = { x: number; y: number; r: number; life: number; age: number }

const MAXD = 170
const MAXT = 900
const R_MOVE = 0.012
const R_MAX = 0.036

class RainSim {
  drops: Drop[] = []
  nd = 0
  trails: Trail[] = []
  nt = 0
  A = 1.6
  acc = 0

  constructor() {
    for (let i = 0; i < MAXD; i++) this.drops.push({ x: 0, y: 0, r: 0, vy: 0, drift: 0, stick: 0, trail: 0, seed: 0, moving: false, dead: false })
    for (let i = 0; i < MAXT; i++) this.trails.push({ x: 0, y: 0, r: 0, life: 0, age: 0 })
  }

  addDrop(x: number, y: number, r: number) {
    if (this.nd >= MAXD) return
    const d = this.drops[this.nd++]
    d.x = x
    d.y = y
    d.r = r
    d.vy = 0
    d.drift = (Math.random() - 0.5) * 0.4
    d.stick = 0
    d.trail = r
    d.seed = Math.random() * 100
    d.moving = false
    d.dead = false
  }

  addTrail(x: number, y: number, r: number, life: number) {
    if (this.nt >= MAXT) return
    const t = this.trails[this.nt++]
    t.x = x
    t.y = y
    t.r = r
    t.life = life
    t.age = 0
  }

  spawn(rate: number, dt: number) {
    this.acc += rate * dt
    while (this.acc >= 1) {
      this.acc -= 1
      const x = Math.random() * this.A
      const y = 0.03 + Math.random() * 1.0
      const r = Math.random() < 0.22 ? 0.012 + Math.random() * 0.014 : 0.0045 + Math.pow(Math.random(), 2.2) * 0.016
      let merged = false
      for (let i = 0; i < this.nd; i++) {
        const d = this.drops[i]
        const dx = d.x - x
        const dy = d.y - y
        if (dx * dx + dy * dy < (d.r + r * 0.5) ** 2) {
          d.r = Math.min(R_MAX, Math.hypot(d.r, r))
          merged = true
          break
        }
      }
      if (!merged) this.addDrop(x, y, r)
    }
  }

  step(dt: number, t: number) {
    const A = this.A
    for (let i = 0; i < this.nd; i++) {
      const d = this.drops[i]
      if (!d.moving && d.r > R_MOVE) {
        d.moving = true
        d.stick = Math.random() * 0.5
      }
      if (d.moving) {
        const k = Math.min(1, Math.max(0, (d.r - R_MOVE * 0.9) / 0.014))
        let vt = 0.035 + 0.24 * k
        if (d.stick > 0) {
          d.stick -= dt
          vt = 0
        } else if (Math.random() < dt * (1.1 - k * 0.8)) {
          // drops move in jerks: catch on the glass, then let go in a new direction
          d.stick = 0.1 + Math.random() * (0.9 - k * 0.6)
          d.drift = (Math.random() - 0.5) * 0.7
        }
        d.vy += (vt - d.vy) * Math.min(1, dt * 7)
        d.y -= d.vy * dt
        d.x += (d.drift + 0.4 * Math.sin(d.y * 42 + d.seed)) * d.vy * dt * 0.45
        d.trail -= d.vy * dt
        if (d.trail <= 0 && d.vy > 0.03) {
          const tr = d.r * (0.2 + Math.random() * 0.24)
          this.addTrail(d.x + (Math.random() - 0.5) * d.r * 0.5, d.y + d.r * (0.9 + Math.random() * 0.5), tr, 6 + Math.random() * 14)
          d.r = Math.sqrt(Math.max(R_MOVE * R_MOVE * 0.7, d.r * d.r - tr * tr * 0.5))
          d.trail = d.r * (0.6 + Math.random() * 1.8)
        }
        if (d.r < R_MOVE * 0.86 && d.stick <= 0) {
          d.moving = false
          d.vy = 0
        }
        // sweep up the trail droplets of earlier drops
        for (let j = 0; j < this.nt; j++) {
          const tr = this.trails[j]
          if (tr.age < 0.6 || tr.life <= 0) continue
          const dx = tr.x - d.x
          const dy = tr.y - d.y
          const rr = d.r * 0.95 + tr.r
          if (dx * dx + dy * dy < rr * rr) {
            d.r = Math.min(R_MAX, Math.sqrt(d.r * d.r + tr.r * tr.r * 0.8))
            tr.life = 0
          }
        }
      } else {
        d.r -= dt * 0.00007 // evaporation keeps the static population turning over
      }
      if (d.y < -0.06 || d.x < -0.05 || d.x > A + 0.05 || d.r < 0.002) d.dead = true
    }

    // merge touching drops (larger one absorbs, keeps the speed of the faster)
    for (let i = 0; i < this.nd; i++) {
      const a = this.drops[i]
      if (a.dead) continue
      for (let j = i + 1; j < this.nd; j++) {
        const b = this.drops[j]
        if (b.dead) continue
        const dx = a.x - b.x
        const dy = a.y - b.y
        const rr = (a.r + b.r) * 0.8
        if (dx * dx + dy * dy < rr * rr) {
          const big = a.r >= b.r ? a : b
          const small = big === a ? b : a
          const wa = big.r * big.r
          const wb = small.r * small.r
          big.x = (big.x * wa + small.x * wb * 0.4) / (wa + wb * 0.4)
          big.r = Math.min(R_MAX, Math.sqrt(wa + wb))
          big.vy = Math.max(big.vy, small.vy)
          if (small.moving) big.stick = 0
          small.dead = true
        }
      }
    }
    for (let i = this.nd - 1; i >= 0; i--) {
      if (this.drops[i].dead) {
        const last = this.drops[this.nd - 1]
        this.drops[this.nd - 1] = this.drops[i]
        this.drops[i] = last
        this.nd--
      }
    }
    for (let j = this.nt - 1; j >= 0; j--) {
      const tr = this.trails[j]
      tr.age += dt
      tr.life -= dt
      if (tr.life <= 0) {
        const last = this.trails[this.nt - 1]
        this.trails[this.nt - 1] = tr
        this.trails[j] = last
        this.nt--
      }
    }
    void t
  }
}

/* ------------------------------------------------------------------ renderer */

type Seg4 = [number, number, number, number]

function makeRT(w: number, h: number, mip: boolean) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: mip,
    depthBuffer: false,
    stencilBuffer: false,
  })
}

function Window({ levelRef, dusk, density, fog, wipes, touched }: { levelRef: React.RefObject<number>; dusk: MotionValue<number>; density: MotionValue<number>; fog: MotionValue<number>; wipes: React.RefObject<Seg4[]>; touched: React.RefObject<boolean> }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const plane = new THREE.PlaneGeometry(2, 2)
    const pass = (frag: string, uniforms: Record<string, THREE.IUniform>, blend?: 'max') => {
      const m = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false })
      if (blend === 'max') {
        m.blending = THREE.CustomBlending
        m.blendEquation = THREE.MaxEquation
        m.blendEquationAlpha = THREE.MaxEquation
        m.blendSrc = m.blendDst = THREE.OneFactor
      }
      return m
    }
    const city = pass(cityFrag, { uA: { value: 1 }, uM: { value: M }, uTime: { value: 0 }, uFocus: { value: 0 }, uDusk: { value: 1 }, uYOff: { value: 0 } })
    const wipe = pass(wipeFrag, { uA: { value: 1 }, uTime: { value: 0 }, uP0: { value: new THREE.Vector2() }, uP1: { value: new THREE.Vector2() }, uRad: { value: 0.06 } }, 'max')
    const comp = pass(compositeFrag, {
      tSharp: { value: null },
      tBlur: { value: null },
      tDrops: { value: null },
      tState: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uA: { value: 1 },
      uM: { value: M },
      uTime: { value: 0 },
      uKR: { value: KR },
      uDensity: { value: 0.8 },
      uFog: { value: 0.7 },
      uDusk: { value: 1 },
      uSharpK: { value: 500 },
    })
    const quad = new THREE.Mesh(plane, comp)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)

    // instanced drops
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = plane.index
    geo.setAttribute('position', plane.getAttribute('position'))
    const N = MAXD + MAXT
    const aDrop = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4)
    const aKind = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
    aDrop.setUsage(THREE.DynamicDrawUsage)
    aKind.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aDrop', aDrop)
    geo.setAttribute('aKind', aKind)
    geo.instanceCount = 0
    const dropU = { uA: { value: 1 }, uKR: { value: KR }, uTime: { value: 0 } }
    const dropMat = new THREE.ShaderMaterial({
      vertexShader: dropVert,
      fragmentShader: dropFrag,
      uniforms: dropU,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    const clearMat = new THREE.ShaderMaterial({ vertexShader: dropVert, fragmentShader: clearFrag, uniforms: dropU, depthTest: false, depthWrite: false })
    clearMat.blending = THREE.CustomBlending
    clearMat.blendEquation = THREE.MaxEquation
    clearMat.blendEquationAlpha = THREE.MaxEquation
    const drops = new THREE.Mesh(geo, dropMat)
    drops.frustumCulled = false
    const dropScene = new THREE.Scene()
    dropScene.add(drops)

    return { cam, city, wipe, comp, quad, scene, geo, aDrop, aKind, dropU, dropMat, clearMat, drops, dropScene, plane }
  }, [])

  const rts = useRef<{ w: number; h: number; sharp: THREE.WebGLRenderTarget; blur: THREE.WebGLRenderTarget; drops: THREE.WebGLRenderTarget; state: THREE.WebGLRenderTarget } | null>(null)
  const sim = useMemo(() => new RainSim(), [])
  const st = useRef({ t: T0, frame: 0, prewarmed: false, intro: 0, ix: -1, iy: -1, clear: true })

  useEffect(
    () => () => {
      const r = rts.current
      if (r) [r.sharp, r.blur, r.drops, r.state].forEach((t) => t.dispose())
      ;[R.city, R.wipe, R.comp, R.dropMat, R.clearMat].forEach((m) => m.dispose())
      R.geo.dispose()
      R.plane.dispose()
    },
    [R],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    s.t += dt
    const W = size.width
    const H = size.height
    const A = W / H
    sim.A = A

    // (re)allocate targets at sizes tied to CSS pixels
    let r = rts.current
    if (!r || r.w !== W || r.h !== H) {
      if (r) [r.sharp, r.blur, r.drops, r.state].forEach((t) => t.dispose())
      const k = 1 + 2 * M
      const sharpS = MOBILE ? 0.7 : 0.6
      const dropS = Math.min(1, (MOBILE ? 1100 : 1700) / Math.max(W, H))
      r = rts.current = {
        w: W,
        h: H,
        sharp: makeRT(Math.round(W * sharpS * k), Math.round(H * sharpS * k), true),
        blur: makeRT(Math.round(W * 0.36 * k), Math.round(H * 0.36 * k), true),
        drops: makeRT(Math.round(W * dropS), Math.round(H * dropS), false),
        state: makeRT(Math.round(W * 0.34), Math.round(H * 0.34), false),
      }
      s.clear = true
    }

    if (!s.prewarmed) {
      s.prewarmed = true
      for (let i = 0; i < (POSTER ? 1100 : 750); i++) {
        sim.spawn(RAIN[levelRef.current].rate, 1 / 30)
        sim.step(1 / 30, i / 30)
      }
    }
    sim.spawn(RAIN[levelRef.current].rate, dt)
    sim.step(dt, s.t)

    // intro: a scripted wipe shows the interaction once (and is baked into the poster)
    const q = wipes.current
    if (!touched.current && s.intro < 1) {
      const start = POSTER ? 0 : 1.3
      const dur = POSTER ? 0.001 : 1.5
      const el = s.t - T0 - start
      if (el > 0) {
        const steps = POSTER ? 40 : 1
        for (let k = 0; k < steps; k++) {
          s.intro = POSTER ? (k + 1) / steps : Math.min(1, el / dur)
          const u = s.intro
          const e = u * u * (3 - 2 * u)
          const x = A * (MOBILE || A < 1 ? 0.14 + 0.72 * e : 0.5 + 0.36 * e)
          const y = (A < 1 ? 0.6 : 0.5) + 0.05 * Math.sin(e * Math.PI * 2.1) - 0.06 * e
          if (s.ix >= 0) q.push([s.ix, s.iy, x, y])
          s.ix = x
          s.iy = y
        }
      }
    }

    // instance data
    const ad = R.aDrop.array as Float32Array
    const ak = R.aKind.array as Float32Array
    let n = 0
    for (let i = 0; i < sim.nd; i++) {
      const d = sim.drops[i]
      ad[n * 4] = d.x
      ad[n * 4 + 1] = d.y
      ad[n * 4 + 2] = d.r
      ad[n * 4 + 3] = Math.min(0.5, d.vy * 2.2)
      ak[n] = d.moving && d.vy > 0.02 ? 1 : 0
      n++
    }
    for (let j = 0; j < sim.nt; j++) {
      const tr = sim.trails[j]
      const fade = Math.min(1, tr.life / 1.5)
      ad[n * 4] = tr.x
      ad[n * 4 + 1] = tr.y
      ad[n * 4 + 2] = tr.r * (0.4 + 0.6 * fade) * Math.min(1, tr.age * 6)
      ad[n * 4 + 3] = 0
      ak[n] = 0
      n++
    }
    R.geo.instanceCount = n
    R.aDrop.needsUpdate = true
    R.aKind.needsUpdate = true
    R.aDrop.clearUpdateRanges()
    R.aDrop.addUpdateRange(0, n * 4)
    R.aKind.clearUpdateRanges()
    R.aKind.addUpdateRange(0, n)

    const time = s.t
    const prevAuto = gl.autoClear
    gl.autoClear = false
    const prevTarget = gl.getRenderTarget()

    // 1 · city, sharp + bokeh (every other frame — it only drifts slowly)
    if (s.frame++ % 2 === 0 || s.clear) {
      R.quad.material = R.city
      R.city.uniforms.uA.value = A
      R.city.uniforms.uTime.value = time
      R.city.uniforms.uDusk.value = dusk.get()
      R.city.uniforms.uYOff.value = A < 1 ? 0.13 : 0.05
      R.city.uniforms.uFocus.value = 0
      gl.setRenderTarget(r.sharp)
      gl.render(R.scene, R.cam)
      R.city.uniforms.uFocus.value = 1
      gl.setRenderTarget(r.blur)
      gl.render(R.scene, R.cam)
    }

    // 2 · lens field
    R.dropU.uA.value = A
    R.dropU.uTime.value = time
    R.drops.material = R.dropMat
    gl.setRenderTarget(r.drops)
    gl.setClearColor(0x000000, 0)
    gl.clear(true, false, false)
    gl.render(R.dropScene, R.cam)

    // 3 · glass state (timestamps of the last wipe / drop pass)
    gl.setRenderTarget(r.state)
    if (s.clear) {
      gl.clear(true, false, false)
      s.clear = false
    }
    R.drops.material = R.clearMat
    gl.render(R.dropScene, R.cam)
    if (q.length) {
      R.quad.material = R.wipe
      R.wipe.uniforms.uA.value = A
      R.wipe.uniforms.uTime.value = time
      R.wipe.uniforms.uRad.value = A < 1 ? 0.05 : 0.058
      for (const w of q) {
        R.wipe.uniforms.uP0.value.set(w[0], w[1])
        R.wipe.uniforms.uP1.value.set(w[2], w[3])
        gl.render(R.scene, R.cam)
      }
      q.length = 0
    }

    // 4 · composite
    const u = R.comp.uniforms
    u.tSharp.value = r.sharp.texture
    u.tBlur.value = r.blur.texture
    u.tDrops.value = r.drops.texture
    u.tState.value = r.state.texture
    u.uRes.value.set(W, H)
    u.uA.value = A
    u.uTime.value = time
    u.uDensity.value = density.get()
    u.uFog.value = fog.get()
    u.uDusk.value = dusk.get()
    u.uSharpK.value = r.sharp.height / (1 + 2 * M)
    R.quad.material = R.comp
    gl.setRenderTarget(prevTarget)
    gl.render(R.scene, R.cam)
    gl.autoClear = prevAuto
  }, 1)

  return null
}

export default function RainyWindow() {
  const [level, setLevel] = useState(1)
  const [time, setTime] = useState(0)
  const levelRef = useRef(level)
  const dusk = useMotionValue(1)
  const density = useMotionValue(RAIN[1].dens)
  const fog = useMotionValue(RAIN[1].fog)
  const wipes = useRef<Seg4[]>([])
  const touched = useRef(false)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    levelRef.current = level
    const a = animate(density, RAIN[level].dens, { duration: 1.4, ease: [0.45, 0, 0.2, 1] })
    const b = animate(fog, RAIN[level].fog, { duration: 2.4, ease: [0.45, 0, 0.2, 1] })
    return () => {
      a.stop()
      b.stop()
    }
  }, [level, density, fog])

  useEffect(() => {
    const a = animate(dusk, time === 0 ? 1 : 0, { duration: 1.8, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [time, dusk])

  // pointer drag wipes the condensation
  useEffect(() => {
    const el = stage.current!
    let down = false
    let lx = 0
    let ly = 0
    const pane = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return [((e.clientX - r.left) / r.height), 1 - (e.clientY - r.top) / r.height] as const
    }
    const onDown = (e: PointerEvent) => {
      down = true
      touched.current = true
      const [x, y] = pane(e)
      lx = x
      ly = y
      wipes.current.push([x, y, x + 1e-4, y])
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const [x, y] = pane(e)
      wipes.current.push([lx, ly, x, y])
      lx = x
      ly = y
    }
    const onUp = () => (down = false)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const tm = TIMES[time]

  return (
    <div className="stage rw-root" style={{ background: '#0b0f17' }}>
      <style>{css}</style>
      <div ref={stage} className="rw-canvas">
        <Canvas dpr={[1, 1.75]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, 0, 1] }}>
          <Window levelRef={levelRef} dusk={dusk} density={density} fog={fog} wipes={wipes} touched={touched} />
        </Canvas>
      </div>

      <div className="overlay">
        <motion.div
          className="rw-copy soft-text"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="rw-kicker">
            <i style={{ background: tm.dot }} />
            <span>RAIN ON GLASS ·</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={tm.clock}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                {tm.clock}
              </motion.span>
            </AnimatePresence>
          </p>
          <h1>窗外是整座城市</h1>
          <p className="rw-sub">每颗雨滴都是一枚小透镜，把虚焦的街灯重新对准、倒着装进去。</p>
        </motion.div>

        <div className="dock">
          <Seg items={RAIN.map((r, i) => ({ value: i, label: r.zh }))} value={level} onChange={setLevel} />
          <span className="dock-sep" />
          <Seg items={TIMES.map((t, i) => ({ value: i, label: t.zh }))} value={time} onChange={setTime} />
        </div>
        <p className="hint">按住拖动 · 擦掉玻璃上的雾</p>
      </div>
    </div>
  )
}

const css = `
.rw-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.rw-canvas:active { cursor: grabbing; }
.rw-copy {
  --soft-bg: #05070c;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 104px;
  max-width: 420px; pointer-events: none !important;
}
.rw-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 14px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.rw-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.2s; box-shadow: 0 0 10px currentColor; }
.rw-kicker span { display: inline-block; }
.rw-copy h1 {
  margin: 0; font: 600 clamp(30px, 3.4vw, 46px)/1.08 var(--display); letter-spacing: -.03em;
}
.rw-sub { margin: 12px 0 0; font-size: 14px; line-height: 1.7; color: var(--fg-2); }
@media (max-width: 760px) {
  .rw-copy { bottom: 92px; right: 24px; }
  .rw-copy h1 { font-size: 30px; }
  .rw-sub { font-size: 13px; }
}
`
