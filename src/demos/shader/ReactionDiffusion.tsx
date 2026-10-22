import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { hexToRgb } from './glsl'
import { rdBrushFrag, rdInitFrag, rdShowFrag, rdStepFrag, rdVert } from './rdShaders'

/*
 * 反应扩散 — Gray-Scott on the GPU: two float (or half-float) ping-pong targets, ~14 steps per frame at ~2 CSS px per
 * texel. F / k are Motion values, so switching recipes morphs the living pattern instead of restarting it. The V
 * field is shown as a glazed ceramic relief (normals from its gradient, key light, tight specular, cast shadow).
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const STEPS = 8

type Preset = { zh: string; en: string; F: number; k: number; note: string }
const PRESETS: Preset[] = [
  { zh: '斑点', en: 'Spots', F: 0.03, k: 0.0625, note: '一颗颗独立的斑点，挤满就停' },
  { zh: '迷宫', en: 'Maze', F: 0.029, k: 0.057, note: '条纹不断延长、拐弯，铺成迷宫' },
  { zh: '珊瑚', en: 'Coral', F: 0.0545, k: 0.062, note: '枝杈从边缘向外分叉生长' },
  { zh: '细胞分裂', en: 'Mitosis', F: 0.0367, k: 0.0649, note: '斑点长大后一分为二，再分裂' },
  { zh: '波纹', en: 'Waves', F: 0.014, k: 0.045, note: '一圈圈波前相撞、湮灭、再生' },
]

type Palette = { zh: string; ground: string; glaze: string; deep: string; rim: string; dot: string }
const PALETTES: Palette[] = [
  { zh: '青釉', ground: '#f3efe7', glaze: '#1f6f6a', deep: '#123f45', rim: '#7fb7aa', dot: '#1f6f6a' },
  { zh: '赤陶', ground: '#f5ede3', glaze: '#b4492f', deep: '#6e2417', rim: '#e3a27f', dot: '#b4492f' },
  { zh: '靛蓝', ground: '#f1efea', glaze: '#27407a', deep: '#141f45', rim: '#8ea4cf', dot: '#27407a' },
]

// raw sRGB values: the Canvas is `linear flat` and the shader writes display values directly
const toVec = (hex: string) => new THREE.Vector3(...hexToRgb(hex))
const PAL_VECS = PALETTES.map((p) => ({ ground: toVec(p.ground), glaze: toVec(p.glaze), deep: toVec(p.deep), rim: toVec(p.rim) }))

type Stroke = [number, number, number, number, number] // x0 y0 x1 y1 (0..1 uv) erase
type Cmd = { reset: number; field: boolean; free: boolean }

function makeRT(w: number, h: number, type: THREE.TextureDataType, linear: boolean) {
  const t = new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  })
  return t
}

/** the seed: a word drawn on a canvas at sim resolution */
function makeMask(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, w, h)
  const portrait = h > w
  const size = Math.round(portrait ? Math.min(w * 0.46, h * 0.22) : Math.min(h * 0.46, w * 0.25))
  g.font = `900 ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.lineJoin = 'round'
  g.lineWidth = size * 0.1 // embolden: each stroke must hold a few pattern wavelengths
  const cx = POSTER ? w * 0.5 : portrait ? w * 0.5 : w * 0.655
  const cy = POSTER ? h * 0.5 : portrait ? h * 0.35 : h * 0.48
  const draw = (t: string, x: number, y: number) => {
    g.fillText(t, x, y)
    g.strokeText(t, x, y)
  }
  if (portrait && !POSTER) {
    draw('生', cx, cy - size * 0.56)
    draw('长', cx, cy + size * 0.56)
  } else draw('生长', cx, cy)
  const tex = new THREE.CanvasTexture(c)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  return tex
}

function Sim({
  F,
  K,
  map,
  pal,
  palFrom,
  palTo,
  strokes,
  cmd,
}: {
  F: MotionValue<number>
  K: MotionValue<number>
  map: MotionValue<number>
  pal: MotionValue<number>
  palFrom: React.RefObject<number>
  palTo: React.RefObject<number>
  strokes: React.RefObject<Stroke[]>
  cmd: React.RefObject<Cmd>
}) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: rdVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false })
    const step = mk(rdStepFrag, { tState: { value: null }, tMask: { value: null }, uContain: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uFK: { value: new THREE.Vector2(0.0545, 0.062) }, uMap: { value: 0 } })
    const init = mk(rdInitFrag, { tMask: { value: null }, uMaskK: { value: 1 }, uSimRes: { value: new THREE.Vector2() }, uSprinkle: { value: 0 }, uSeed: { value: 0 } })
    const brush = mk(rdBrushFrag, {
      tState: { value: null },
      uSimRes: { value: new THREE.Vector2() },
      uP0: { value: new THREE.Vector2() },
      uP1: { value: new THREE.Vector2() },
      uRad: { value: 8 },
      uErase: { value: 0 },
      uSeed: { value: 0 },
    })
    const show = mk(rdShowFrag, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2() },
      uDpr: { value: 1 },
      uFK: { value: new THREE.Vector2() },
      uMap: { value: 0 },
      uGround: { value: new THREE.Vector3() },
      uGlaze: { value: new THREE.Vector3() },
      uDeep: { value: new THREE.Vector3() },
      uRim: { value: new THREE.Vector3() },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uVeil: { value: new THREE.Vector4(0.2, 0.5, 0.3, 0.4) },
      uVeilK: { value: 0 },
    })
    const quad = new THREE.Mesh(geo, step)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    // float state if the GPU can render to it (Gray-Scott drifts in half precision), else half-float
    const full = gl.capabilities.isWebGL2 && gl.extensions.has('EXT_color_buffer_float')
    const type = full ? THREE.FloatType : THREE.HalfFloatType
    const linear = full ? gl.extensions.has('OES_texture_float_linear') : true
    return { geo, step, init, brush, show, quad, scene, cam, type, linear, mats: [step, init, brush, show] }
  }, [gl])

  const T = useRef<{ w: number; h: number; cell: number; a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget; mask: THREE.CanvasTexture } | null>(null)
  const st = useRef({ ready: false, t: 0, fade: 0, seeded: false, born: 0, boost: POSTER ? 34 : 0, seed: 1, lastReset: 0 })

  // compile every program in the background before the first draw (KHR_parallel_shader_compile)
  useEffect(() => {
    let dead = false
    const tmp = new THREE.Scene()
    for (const m of R.mats) {
      const q = new THREE.Mesh(R.geo, m)
      q.frustumCulled = false
      tmp.add(q)
    }
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(null)
    gl.compileAsync(tmp, R.cam)
      .catch(() => {})
      .then(() => {
        if (!dead) st.current.ready = true
      })
    gl.setRenderTarget(prev)
    return () => {
      dead = true
    }
  }, [gl, R])

  useEffect(
    () => () => {
      const t = T.current
      if (t) [t.a, t.b, t.mask].forEach((x) => x.dispose())
      R.mats.forEach((m) => m.dispose())
      R.geo.dispose()
    },
    [R],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    const prevTarget = gl.getRenderTarget()
    if (!s.ready) {
      gl.setRenderTarget(null)
      gl.setClearColor(PALETTES[0].ground, 1)
      gl.clear(true, false, false)
      return
    }
    s.t += dt
    const W = size.width
    const H = size.height

    // ~2 CSS px per texel, longest side ≤ 1024
    let t = T.current
    const cell = Math.max(POSTER ? 1.6 : MOBILE ? 1.4 : 2, Math.max(W, H) / 1024)
    const sw = Math.max(16, Math.round(W / cell))
    const sh = Math.max(16, Math.round(H / cell))
    if (!t || t.w !== sw || t.h !== sh) {
      if (t) [t.a, t.b, t.mask].forEach((x) => x.dispose())
      t = T.current = { w: sw, h: sh, cell, a: makeRT(sw, sh, R.type, R.linear), b: makeRT(sw, sh, R.type, R.linear), mask: makeMask(sw, sh) }
      s.seeded = false
    }

    const swap = () => {
      const x = t!.a
      t!.a = t!.b
      t!.b = x
    }
    const pass = (m: THREE.ShaderMaterial) => {
      R.quad.material = m
      gl.setRenderTarget(t!.b)
      gl.render(R.scene, R.cam)
      swap()
    }

    const c = cmd.current
    if (!s.seeded || c.reset !== s.lastReset) {
      s.seeded = true
      s.lastReset = c.reset
      s.seed = Math.random() * 100
      s.born = s.t
      c.free = false
      R.init.uniforms.tMask.value = t.mask
      R.init.uniforms.uSimRes.value.set(sw, sh)
      R.init.uniforms.uSprinkle.value = c.field ? 0.2 : 0
      R.init.uniforms.uMaskK.value = c.field ? 0 : 1
      R.init.uniforms.uSeed.value = s.seed
      pass(R.init)
    }

    // brush strokes
    const b = R.brush.uniforms
    b.tState.value = null
    b.uSimRes.value.set(sw, sh)
    b.uRad.value = (MOBILE ? 16 : 13) / cell
    const q = strokes.current
    for (const k of q) {
      b.tState.value = t.a.texture
      b.uP0.value.set(k[0] * sw, k[1] * sh)
      b.uP1.value.set(k[2] * sw, k[3] * sh)
      b.uErase.value = k[4]
      b.uRad.value = ((MOBILE ? 16 : 13) * (k[4] ? 2.8 : 1)) / cell
      b.uSeed.value = Math.random() * 100
      pass(R.brush)
    }
    q.length = 0

    // simulate
    const u = R.step.uniforms
    u.uTexel.value.set(1 / sw, 1 / sh)
    u.uFK.value.set(F.get(), K.get())
    u.uMap.value = map.get()
    // intro: the pattern first fills the seed word, then breaks out of it
    const age = s.t - s.born
    const hold = POSTER ? 1e9 : 3.2
    // painting releases the word at once (seeds outside it would otherwise be starved)
    if (c.free) s.born = Math.min(s.born, s.t - hold - 2.5)
    u.uContain.value = map.get() > 0.5 ? 0 : 1 - THREE.MathUtils.smoothstep(age, hold, hold + 2.5)
    u.tMask.value = t.mask
    let n = STEPS
    if (s.boost > 0) {
      n = 160
      s.boost--
    }
    for (let i = 0; i < n; i++) {
      u.tState.value = t.a.texture
      pass(R.step)
    }

    // show
    s.fade = Math.min(1, s.fade + dt / 0.7)
    const v = R.show.uniforms
    v.tState.value = t.a.texture
    v.uTexel.value.set(1 / sw, 1 / sh)
    gl.getDrawingBufferSize(v.uRes.value)
    v.uDpr.value = gl.getPixelRatio()
    v.uFade.value = s.fade * s.fade * (3 - 2 * s.fade)
    v.uTime.value = s.t
    // flatten the relief behind the copy (left column on desktop, bottom block on phones)
    if (POSTER) v.uVeilK.value = 0
    else if (W < 760) {
      v.uVeil.value.set(0.5, 220 / H, 0.8, 210 / H)
      v.uVeilK.value = 0.8
    } else {
      const cx = Math.min(96, W * 0.06) + 230
      v.uVeil.value.set(cx / W, 0.5, 400 / W, 330 / H)
      v.uVeilK.value = 0.9
    }
    const pa = PAL_VECS[palFrom.current]
    const pb = PAL_VECS[palTo.current]
    const pk = pal.get()
    v.uGround.value.lerpVectors(pa.ground, pb.ground, pk)
    v.uGlaze.value.lerpVectors(pa.glaze, pb.glaze, pk)
    v.uDeep.value.lerpVectors(pa.deep, pb.deep, pk)
    v.uRim.value.lerpVectors(pa.rim, pb.rim, pk)
    R.quad.material = R.show
    gl.setRenderTarget(prevTarget)
    gl.render(R.scene, R.cam)
  }, 1)

  return null
}

const Icon = {
  erase: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.2 13.5 2.6 9.9a1.2 1.2 0 0 1 0-1.7l5.6-5.6a1.2 1.2 0 0 1 1.7 0l3.6 3.6a1.2 1.2 0 0 1 0 1.7L8 13.5Z" />
      <path d="M5 6.2 10 11.2M8 13.5h5.5" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5" />
      <path d="M2.5 10.5c2.5-.2 4.6-2.2 5.4-4.6.6-1.6 2.2-3 5.6-3.4" />
      <circle cx="5.2" cy="5.4" r=".9" fill="currentColor" stroke="none" />
      <circle cx="10.8" cy="10.6" r=".9" fill="currentColor" stroke="none" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8a5 5 0 1 0 1.6-3.7" />
      <path d="M3.2 2.4v2.8H6" />
    </svg>
  ),
}

export default function ReactionDiffusion() {
  const [preset, setPreset] = useState(2)
  const [palette, setPalette] = useState(0)
  const [mapOn, setMapOn] = useState(false)
  const [erase, setErase] = useState(false)
  const F = useMotionValue(PRESETS[2].F)
  const K = useMotionValue(PRESETS[2].k)
  const map = useMotionValue(0)
  const pal = useMotionValue(1)
  const palFrom = useRef(0)
  const palTo = useRef(0)
  const strokes = useRef<Stroke[]>([])
  const cmd = useRef<Cmd>({ reset: 0, field: false, free: false })
  const lastTouch = useRef(performance.now())
  const eraseRef = useRef(erase)
  eraseRef.current = erase
  const fkText = useRef<HTMLSpanElement>(null)

  // recipe change: glide F / k so the living pattern morphs into the new regime
  useEffect(() => {
    const p = PRESETS[preset]
    const ease = [0.45, 0, 0.2, 1] as const
    const a = animate(F, p.F, { duration: 1.5, ease })
    const b = animate(K, p.k, { duration: 1.5, ease })
    return () => {
      a.stop()
      b.stop()
    }
  }, [preset, F, K])

  useEffect(() => {
    // turning the map on restarts from a field of seeds so every regime grows from the same start;
    // turning it off morphs the living pattern back into the current recipe
    cmd.current.field = mapOn
    if (mapOn) {
      map.set(1)
      cmd.current.reset++
      return
    }
    const a = animate(map, 0, { duration: 1.6, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [mapOn, map])

  useEffect(() => {
    if (palTo.current === palette) return
    palFrom.current = palTo.current
    palTo.current = palette
    pal.set(0)
    const a = animate(pal, 1, { duration: 0.9, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [palette, pal])

  // live F / k readout without re-rendering React
  useEffect(() => {
    const write = () => {
      const el = fkText.current
      if (el) el.textContent = mapOn ? 'F · k  ⟶ 全谱' : `F ${F.get().toFixed(4)} · k ${K.get().toFixed(4)}`
    }
    write()
    const a = F.on('change', write)
    const b = K.on('change', write)
    return () => {
      a()
      b()
    }
  }, [F, K, mapOn])

  // idle: walk through the recipes on its own
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastTouch.current < 14000) return
      setPreset((p) => (p + 1) % PRESETS.length)
      lastTouch.current = performance.now() - 14000 + 9000
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // brush
  const drag = useRef<{ id: number; x: number; y: number; erase: number } | null>(null)
  const toUv = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height] as const
  }
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    lastTouch.current = performance.now()
    const [x, y] = toUv(e)
    const er = e.button === 2 || eraseRef.current ? 1 : 0
    drag.current = { id: e.pointerId, x, y, erase: er }
    cmd.current.free = true
    strokes.current.push([x, y, x + 1e-4, y, er])
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    lastTouch.current = performance.now()
    const [x, y] = toUv(e)
    strokes.current.push([d.x, d.y, x, y, d.erase])
    d.x = x
    d.y = y
  }
  const onUp = (e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  const touch = () => (lastTouch.current = performance.now())
  const P = PRESETS[preset]
  const PL = PALETTES[palette]

  return (
    <div className="stage rd" style={{ background: PL.ground, transition: 'background .9s' }}>
      <style>{css}</style>
      <div className="rd-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
        <Canvas linear flat dpr={[1, 2]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
          <Sim F={F} K={K} map={map} pal={pal} palFrom={palFrom} palTo={palTo} strokes={strokes} cmd={cmd} />
        </Canvas>
      </div>

      <AnimatePresence>
        {mapOn && (
          <motion.div className="rd-axes" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
            <span className="rd-ax-k">k 0.045 → 0.068 · 消耗率</span>
            <span className="rd-ax-f">F 低 → 高 · 补给率</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="overlay">
        <div className="hero-copy rd-copy">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i style={{ background: PL.dot, transition: 'background .9s' }} />
              <span ref={fkText}>F · k</span>
            </p>
            <h1>
              两种物质，
              <br />
              长出一整片纹样
            </h1>
            <p>
              Gray-Scott 反应扩散：一种物质被补给、一种被消耗，彼此扩散又相互吞食。只改两个数 F 与 k，图案就在斑点、迷宫和珊瑚之间变形。
            </p>
            <div className="rd-recipe">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mapOn ? 'map' : P.en}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                >
                  <b>{mapOn ? '全谱' : P.zh}</b>
                  {mapOn ? '横向 k、纵向 F 逐渐变化，所有形态并排生长' : P.note}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock rd-dock" onPointerDown={touch} onClick={touch}>
          <Seg items={PRESETS.map((p, i) => ({ value: i, label: MOBILE && p.zh.length > 2 ? '分裂' : p.zh }))} value={preset} onChange={(v) => { touch(); setPreset(v); if (mapOn) setMapOn(false) }} />
          <span className="dock-sep" />
          <button className="seg rd-pal" onClick={() => setPalette((p) => (p + 1) % PALETTES.length)} aria-label={`配色：${PL.zh}`} title={`配色：${PL.zh}`}>
            <span>
              <i style={{ background: PL.glaze, boxShadow: `0 0 0 3px ${PL.ground}, 0 0 0 4px ${PL.glaze}55` }} />
              {!MOBILE && PL.zh}
            </span>
          </button>
          <Toggle on={mapOn} onClick={() => setMapOn((v) => !v)} label="全谱" icon={Icon.map} id="rd-map" />
          <Toggle on={erase} onClick={() => setErase((v) => !v)} label="橡皮" icon={Icon.erase} id="rd-erase" />
          <button className="seg rd-icon" onClick={() => { cmd.current.reset++; touch() }} aria-label="重置" title="重置">
            <span>
              {Icon.reset}
              {!MOBILE && '重置'}
            </span>
          </button>
        </div>
        <p className="hint">拖动播种 · 右键擦除</p>
      </div>
    </div>
  )
}

function Toggle({ on, onClick, label, icon, id }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode; id: string }) {
  return (
    <button className="seg rd-icon" aria-pressed={on} onClick={onClick} aria-label={label} title={label}>
      {on && <motion.span layoutId={id} className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
      <span>
        {icon}
        {!MOBILE && label}
      </span>
    </button>
  )
}

const css = `
.rd { color: #1d1c1a; }
.rd-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.rd-canvas canvas { display: block; }
.rd-copy { pointer-events: none !important; }
.rd-copy h1 { font-size: clamp(34px, 4vw, 54px); }
.rd-copy p { color: #4f4b45; }
.rd-copy .kicker { color: #4f4b45; font-variant-numeric: tabular-nums; }
.rd-recipe { margin-top: 22px; min-height: 22px; font-size: 13.5px; color: #4f4b45; }
.rd-recipe span { display: inline-flex; align-items: baseline; gap: 10px; }
.rd-recipe b { font-weight: 600; color: #1d1c1a; }
.rd-dock .seg span { display: inline-flex; align-items: center; gap: 7px; }
.rd-pal i { width: 10px; height: 10px; border-radius: 50%; transition: background .6s, box-shadow .6s; }
.rd-axes { position: absolute; inset: 0; pointer-events: none; font: 500 11px/1 var(--mono); letter-spacing: .06em; color: #4f4b45; }
.rd-ax-k { position: absolute; right: 24px; bottom: 76px; padding: 6px 9px; border-radius: 999px; background: color-mix(in srgb, #fff 55%, transparent); backdrop-filter: blur(8px); }
.rd-ax-f { position: absolute; right: 24px; top: 84px; padding: 6px 9px; border-radius: 999px; background: color-mix(in srgb, #fff 55%, transparent); backdrop-filter: blur(8px); }
@media (max-width: 760px) {
  .rd-copy h1 { font-size: 30px; }
  .rd-copy p { font-size: 13.5px; margin-top: 12px; }
  .rd-recipe { margin-top: 12px; font-size: 12.5px; }
  .rd-dock { gap: 0; }
  .rd-dock .seg { padding: 0 8px; }
  .rd-dock .dock-sep { margin: 0 3px; }
  .rd-ax-k { bottom: 74px; right: 16px; }
  .rd-ax-f { top: 80px; right: 16px; }
}
`
