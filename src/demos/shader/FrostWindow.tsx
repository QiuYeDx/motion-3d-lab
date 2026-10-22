import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { MAX_DROPS, WARP, compositeFrag, frostBrushFrag, frostInitFrag, frostStepFrag, glassFrag, quadVert, streetFrag } from './frostShaders'

/*
 * 窗上结霜 — a hexagonal snow-crystal automaton (Reiter 2005) on float ping-pong targets grows six-fold fern
 * dendrites from nuclei along the frame and from dust specks on the glass; a domain warp makes them curve and lean.
 * A warm fingertip melts the ice and leaves the glass warm and wet; while it is warm nothing refreezes, then the
 * ferns creep back over the wipe from its edges. Melt water gathers into drops (CPU) that run down and carve their
 * own channels. The street outside is procedural: sharp through clear glass, blurred + glowing through the ice.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const MAXB = 16

/** β = ambient vapour (denser, plate-like crystals when high), γ = condensation on the ice, ρ = humidity refill */
/** sps = automaton steps per second (growth speed), warm = seconds a wipe keeps the glass from refreezing */
type TempPreset = { zh: string; beta: number; gamma: number; rho: number; sps: number; nuc: number; warm: number }
const TEMPS: TempPreset[] = [
  { zh: '−2°', beta: 0.36, gamma: 0.0003, rho: 0.00002, sps: 26, nuc: 0.03, warm: 4.5 },
  { zh: '−10°', beta: 0.42, gamma: 0.0005, rho: 0.00004, sps: 62, nuc: 0.12, warm: 3.2 },
  { zh: '−20°', beta: 0.5, gamma: 0.0008, rho: 0.00008, sps: 95, nuc: 0.4, warm: 2.2 },
]

/** one brush capsule in pane units: type 0 wipe · 1 drop channel · 2 breath · 3 nucleus */
type Brush = { x0: number; y0: number; x1: number; y1: number; r: number; type: number; s: number }
type Cmd = { clear: number; breath: number }

/** screen pane → frost-lattice pane (same warp as the composite shader) */
const warpK = (x: number, y: number, A: number) => {
  const d = Math.min(x, A - x, y, 1 - y)
  const t = Math.min(1, Math.max(0, d / 0.12))
  return t * t * (3 - 2 * t)
}
const warpX = (x: number, y: number, A: number) => x + warpK(x, y, A) * WARP.amp * Math.sin(y * WARP.f1 + x * WARP.g1 + 1.7)
const warpY = (x: number, y: number, A: number) => y + warpK(x, y, A) * WARP.amp * Math.sin(x * WARP.f2 - y * WARP.g2 + 0.4)

/* ------------------------------------------------------------------ melt-water drops */

type Drop = { x: number; y: number; r: number; vy: number; stick: number; a: number; moving: boolean; lx: number; ly: number; seed: number; age: number }
const R_MOVE = 0.0062

class Drops {
  list: Drop[] = []

  add(x: number, y: number, r: number) {
    for (const d of this.list) {
      if (Math.hypot(d.x - x, d.y - y) < d.r + r) {
        d.r = Math.min(0.016, Math.hypot(d.r, r))
        return
      }
    }
    if (this.list.length >= MAX_DROPS) return
    this.list.push({ x, y, r, vy: 0, stick: 0.3 + Math.random() * 0.6, a: 0, moving: false, lx: x, ly: y, seed: Math.random() * 100, age: 0 })
  }

  step(dt: number, out: Brush[]) {
    const L = this.list
    for (const d of L) {
      d.age += dt
      d.a = Math.min(1, d.a + dt * 4)
      if (!d.moving && d.r > R_MOVE && d.stick <= 0) d.moving = true
      d.stick -= dt
      if (d.moving) {
        const k = Math.min(1, (d.r - R_MOVE * 0.8) / 0.008)
        let vt = 0.025 + 0.16 * k
        if (d.stick > 0) vt = 0
        else if (Math.random() < dt * 1.4) d.stick = 0.08 + Math.random() * 0.5 // stick-slip
        d.vy += (vt - d.vy) * Math.min(1, dt * 6)
        d.y -= d.vy * dt
        d.x += Math.sin(d.y * 50 + d.seed) * d.vy * dt * 0.25
        d.r -= d.vy * dt * 0.012 // water left behind in the channel
        if (Math.hypot(d.x - d.lx, d.y - d.ly) > d.r * 0.6) {
          out.push({ x0: d.lx, y0: d.ly, x1: d.x, y1: d.y, r: d.r * 1.15, type: 1, s: 1 })
          d.lx = d.x
          d.ly = d.y
        }
        if (d.r < R_MOVE * 0.75) d.moving = false
      } else if (d.age > 4) {
        d.a -= dt * 0.12 // a resting drop slowly freezes into the frost / evaporates
      }
    }
    // merge touching drops
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i]
        const b = L[j]
        if (a.a <= 0 || b.a <= 0) continue
        if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.85) {
          const big = a.r >= b.r ? a : b
          const small = big === a ? b : a
          big.r = Math.min(0.016, Math.hypot(big.r, small.r))
          big.vy = Math.max(big.vy, small.vy)
          big.stick = Math.min(big.stick, 0)
          small.a = 0
        }
      }
    }
    this.list = L.filter((d) => d.a > 0 && d.y > -0.03)
  }
}

/* ------------------------------------------------------------------ the ghost finger's drawings (unit box, y up) */

type Path = [number, number][][]
const heart: Path = [
  Array.from({ length: 48 }, (_, i) => {
    const t = (i / 47) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    return [x / 34, (y + 2.5) / 34] as [number, number]
  }),
]
const smile: Path = [
  Array.from({ length: 40 }, (_, i) => {
    const t = (i / 39) * Math.PI * 2 + Math.PI / 2
    return [Math.cos(t) * 0.48, Math.sin(t) * 0.48] as [number, number]
  }),
  [
    [-0.17, 0.14],
    [-0.16, 0.06],
  ],
  [
    [0.17, 0.14],
    [0.16, 0.06],
  ],
  Array.from({ length: 14 }, (_, i) => {
    const t = Math.PI * (1.15 + (i / 13) * 0.7)
    return [Math.cos(t) * 0.28, Math.sin(t) * 0.28 + 0.02] as [number, number]
  }),
]
// 你好 — two characters, simplified brush strokes (each character in a 1×1 box, then placed side by side)
const ni: Path = [
  [[0.3, 0.95], [0.12, 0.6]],
  [[0.22, 0.72], [0.22, 0.04]],
  [[0.52, 0.95], [0.42, 0.74]],
  [[0.46, 0.8], [0.92, 0.8], [0.86, 0.66]],
  [[0.68, 0.7], [0.68, 0.06], [0.58, 0.13]],
  [[0.53, 0.52], [0.42, 0.3]],
  [[0.82, 0.52], [0.93, 0.3]],
]
const hao: Path = [
  [[0.3, 0.96], [0.16, 0.5], [0.44, 0.3]],
  [[0.4, 0.78], [0.33, 0.4], [0.08, 0.1]],
  [[0.04, 0.62], [0.48, 0.64]],
  [[0.56, 0.88], [0.9, 0.88], [0.72, 0.72]],
  [[0.72, 0.72], [0.72, 0.06], [0.63, 0.13]],
  [[0.5, 0.5], [0.97, 0.5]],
]
const nihao: Path = [...ni.map((s) => s.map(([x, y]) => [x * 0.5 - 0.53, y * 0.5 - 0.25] as [number, number])), ...hao.map((s) => s.map(([x, y]) => [x * 0.5 + 0.03, y * 0.5 - 0.25] as [number, number]))]
const DRAWINGS: { path: Path; size: number; r: number }[] = [
  { path: heart, size: 0.42, r: 0.026 },
  { path: nihao, size: 0.62, r: 0.019 },
  { path: smile, size: 0.36, r: 0.024 },
]

/** flatten a drawing into a list of timed points (speed in pane units / s, pen lifts between strokes) */
function plan(path: Path, cx: number, cy: number, size: number, speed: number) {
  const pts: { x: number; y: number; t: number; down: boolean }[] = []
  let t = 0
  for (const stroke of path) {
    let px = cx + stroke[0][0] * size
    let py = cy + stroke[0][1] * size
    t += 0.18
    pts.push({ x: px, y: py, t, down: false })
    for (let i = 1; i < stroke.length; i++) {
      const x = cx + stroke[i][0] * size
      const y = cy + stroke[i][1] * size
      t += Math.hypot(x - px, y - py) / speed
      pts.push({ x, y, t, down: true })
      px = x
      py = y
    }
  }
  return pts
}

/* ------------------------------------------------------------------ renderer */

type Targets = {
  w: number
  h: number
  cell: number
  street: THREE.WebGLRenderTarget
  s: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  g: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
}

function rt(w: number, h: number, type: THREE.TextureDataType, filter: THREE.MagnificationTextureFilter, mip = false) {
  return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
    type,
    format: THREE.RGBAFormat,
    minFilter: mip ? THREE.LinearMipmapLinearFilter : filter,
    magFilter: filter,
    generateMipmaps: mip,
    depthBuffer: false,
    stencilBuffer: false,
  })
}

function Frost({ tempRef, beta, brushes, cmd, lastTouch, onReady }: { tempRef: React.RefObject<number>; beta: MotionValue<number>; brushes: React.RefObject<Brush[]>; cmd: React.RefObject<Cmd>; lastTouch: React.RefObject<number>; onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false })
    const brushU = () => ({
      uB0: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
      uB1: { value: Array.from({ length: MAXB }, () => new THREE.Vector4()) },
      uN: { value: 0 },
      uA: { value: 1 },
    })
    const street = mk(streetFrag, { uA: { value: 1 }, uTime: { value: 0 }, uMobile: { value: MOBILE ? 1 : 0 } })
    const init = mk(frostInitFrag, { uSimRes: { value: new THREE.Vector2() }, uSeed: { value: 0 }, uCell: { value: 2 }, uBeta: { value: 0.4 }, uInterior: { value: POSTER ? 0.3 : 0.11 } })
    const step = mk(frostStepFrag, {
      tS: { value: null },
      uSimRes: { value: new THREE.Vector2() },
      uBeta: { value: 0.4 },
      uGamma: { value: 0.0006 },
      uRho: { value: 0.001 },
      uWarmK: { value: 0.99 },
      uRimeK: { value: 0.0001 },
    })
    const brush = mk(frostBrushFrag, { tS: { value: null }, uBeta: { value: 0.4 }, ...brushU() })
    const glass = mk(glassFrag, { tG: { value: null }, uDt: { value: 0 }, uMist: { value: 0.25 }, ...brushU() })
    const comp = mk(compositeFrag, {
      tStreet: { value: null },
      tS: { value: null },
      tG: { value: null },
      uSimTx: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2() },
      uDpr: { value: 1 },
      uA: { value: 1 },
      uTime: { value: 0 },
      uFade: { value: 0 },
      uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
      uGhost: { value: new THREE.Vector3() },
    })
    const quad = new THREE.Mesh(geo, comp)
    quad.frustumCulled = false
    const scene = new THREE.Scene()
    scene.add(quad)
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const full = gl.extensions.has('EXT_color_buffer_float')
    const simType = full ? THREE.FloatType : THREE.HalfFloatType
    const simFilter = !full || gl.extensions.has('OES_texture_float_linear') ? THREE.LinearFilter : THREE.NearestFilter
    return { geo, street, init, step, brush, glass, comp, quad, scene, cam, simType, simFilter, mats: [street, init, step, brush, glass, comp] }
  }, [gl])

  const T = useRef<Targets | null>(null)
  const drops = useMemo(() => new Drops(), [])
  const st = useRef({
    ready: false,
    t: 0,
    fade: 0,
    inited: false,
    boost: 0,
    acc: 0,
    lastClear: 0,
    lastBreath: 0,
    breathT: -1,
    breathX: 0,
    breathY: 0,
    nucAcc: 0,
    // ghost finger
    ghost: null as null | { pts: ReturnType<typeof plan>; t: number; i: number; r: number; lx: number; ly: number },
    ghostIdx: 0,
    ghostNext: 0,
    ghostA: 0,
    posterPhase: 0, // poster: 0 growing · 1 drawing baked, let the drops run · 2 done
  })

  useEffect(() => {
    dropsProxy.current = drops
    return () => {
      dropsProxy.current = null
    }
  }, [drops])

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
        if (dead) return
        st.current.ready = true
        onReady()
      })
    gl.setRenderTarget(prev)
    return () => {
      dead = true
    }
  }, [gl, R]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      const t = T.current
      if (t) [t.street, ...t.s, ...t.g].forEach((x) => x.dispose())
      R.mats.forEach((m) => m.dispose())
      R.geo.dispose()
    },
    [R],
  )

  const queue = useRef<Brush[]>([])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    const prevTarget = gl.getRenderTarget()
    if (!s.ready) {
      gl.setRenderTarget(null)
      gl.setClearColor('#0b111b', 1)
      gl.clear(true, false, false)
      return
    }
    s.t += dt
    const W = size.width
    const H = size.height
    const A = W / H
    const P = TEMPS[tempRef.current]

    // targets: frost lattice at ~2 CSS px per cell (hex rows 0.866 apart), glass state at ~4, street at half
    // resolution (mipmapped for the blur)
    let t = T.current
    const cell = Math.max(MOBILE ? 1.6 : 2, Math.max(W, H) / 960)
    const sw = Math.round(W / cell)
    const sh = Math.round(H / (cell * 0.866))
    if (!t || t.w !== sw || t.h !== sh) {
      if (t) [t.street, ...t.s, ...t.g].forEach((x) => x.dispose())
      t = T.current = {
        w: sw,
        h: sh,
        cell,
        street: rt(Math.round(W * 0.5), Math.round(H * 0.5), THREE.HalfFloatType, THREE.LinearFilter, true),
        s: [rt(sw, sh, R.simType, R.simFilter), rt(sw, sh, R.simType, R.simFilter)],
        g: [rt(Math.round(sw / 2), Math.round(sh / 2), THREE.HalfFloatType, THREE.LinearFilter), rt(Math.round(sw / 2), Math.round(sh / 2), THREE.HalfFloatType, THREE.LinearFilter)],
      }
      s.inited = false
    }
    const tt = t
    const flipS = () => (tt.s = [tt.s[1], tt.s[0]])
    const flipG = () => (tt.g = [tt.g[1], tt.g[0]])
    const draw = (m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
      R.quad.material = m
      gl.setRenderTarget(target)
      gl.render(R.scene, R.cam)
    }

    const c = cmd.current
    if (!s.inited || c.clear !== s.lastClear) {
      // first start fast-forwards so the glass is already frosting over; 清空 starts from clean glass
      s.boost = s.inited && c.clear !== s.lastClear ? 0 : POSTER ? 50 : 45
      s.inited = true
      s.lastClear = c.clear
      R.init.uniforms.uSimRes.value.set(sw, sh)
      R.init.uniforms.uSeed.value = Math.random() * 50
      R.init.uniforms.uCell.value = cell
      R.init.uniforms.uBeta.value = beta.get()
      draw(R.init, t.s[0])
      gl.setClearColor(0x000000, 0)
      for (const g of t.g) {
        gl.setRenderTarget(g)
        gl.clear(true, false, false)
      }
      drops.list.length = 0
      s.ghost = null
      s.ghostNext = s.t + (POSTER ? 0 : 14)
    }

    const q = queue.current
    q.push(...brushes.current)
    brushes.current.length = 0

    // breath: a warm puff that spreads for ~0.9 s
    if (c.breath !== s.lastBreath) {
      s.lastBreath = c.breath
      s.breathT = 0
      s.breathX = A * (MOBILE || A < 1 ? 0.5 : 0.64) + (Math.random() - 0.5) * 0.08
      s.breathY = (MOBILE || A < 1 ? 0.6 : 0.55) + (Math.random() - 0.5) * 0.06
    }
    if (s.breathT >= 0) {
      s.breathT += dt
      const k = Math.min(1, s.breathT / 0.9)
      const r = (MOBILE || A < 1 ? 0.16 : 0.22) * (0.45 + 0.55 * Math.sqrt(k))
      q.push({ x0: s.breathX, y0: s.breathY, x1: s.breathX, y1: s.breathY, r, type: 2, s: dt * 3.2 * (1 - k * 0.6) })
      if (k >= 1) s.breathT = -1
    }

    // ghost finger: when nobody has touched the glass for a while, it draws something
    const idle = performance.now() - lastTouch.current > 6500
    if (!s.ghost && s.boost <= 0 && (POSTER ? s.posterPhase === 0 : idle && s.t > s.ghostNext)) {
      const D = DRAWINGS[s.ghostIdx % DRAWINGS.length]
      s.ghostIdx++
      const portrait = MOBILE || A < 1
      const sz = D.size * (portrait ? Math.min(1, (A * 0.9) / (D.size * 1.25)) : 1)
      const cx = POSTER ? A * 0.5 : A * (portrait ? 0.5 : 0.66)
      const cy = POSTER ? 0.52 : portrait ? 0.6 : 0.56
      s.ghost = { pts: plan(D.path, cx, cy, sz, 0.55), t: 0, i: 0, r: D.r * (portrait ? 0.85 : 1), lx: 0, ly: 0 }
    }
    if (s.ghost) {
      const g = s.ghost
      // the poster bakes the whole drawing in one frame
      g.t += POSTER ? 1e3 : dt
      while (g.i < g.pts.length && g.pts[g.i].t <= g.t) {
        const p = g.pts[g.i]
        if (p.down) wipe(q, drops, g.lx, g.ly, p.x, p.y, g.r)
        g.lx = p.x
        g.ly = p.y
        g.i++
      }
      // interpolate inside the current segment
      let gx = g.lx
      let gy = g.ly
      if (g.i < g.pts.length && g.pts[g.i].down) {
        const a = g.pts[g.i - 1]
        const b = g.pts[g.i]
        const k = (g.t - a.t) / Math.max(1e-4, b.t - a.t)
        gx = a.x + (b.x - a.x) * k
        gy = a.y + (b.y - a.y) * k
        wipe(q, drops, g.lx, g.ly, gx, gy, g.r)
        g.lx = gx
        g.ly = gy
      }
      s.ghostA = Math.min(1, s.ghostA + dt * 3)
      R.comp.uniforms.uGhost.value.set(gx, gy, s.ghostA * (g.i < g.pts.length && g.pts[g.i].down ? 1 : 0.4))
      if (g.i >= g.pts.length) {
        s.ghost = null
        if (POSTER) s.posterPhase = 1
        s.ghostNext = s.t + 22
      }
      if (!idle && !POSTER) s.ghost = null // the visitor took over
    } else {
      s.ghostA = Math.max(0, s.ghostA - dt * 2)
      R.comp.uniforms.uGhost.value.z = s.ghostA * 0.4
    }

    // dust specks on the glass nucleate new crystals now and then
    s.nucAcc += dt * P.nuc
    while (s.nucAcc >= 1) {
      s.nucAcc -= 1
      const x = Math.random() * A
      const y = 0.08 + Math.random() * 0.84
      q.push({ x0: x, y0: y, x1: x, y1: y, r: 0.0045, type: 3, s: 1 })
    }

    // melt-water drops (poster: let them run for a while first)
    if (s.posterPhase === 1) {
      s.posterPhase = 2
      for (let k = 0; k < 75; k++) drops.step(1 / 30, q)
    } else drops.step(dt, q)

    // 1 · street
    R.street.uniforms.uA.value = A
    R.street.uniforms.uTime.value = s.t
    draw(R.street, t.street)

    // 2 · brushes into the frost field and the glass state, 16 capsules per pass (the glass pass also decays)
    const bS = R.brush.uniforms
    const bG = R.glass.uniforms
    bS.uA.value = bG.uA.value = A
    bG.uMist.value = 0.13
    let first = true
    let off = 0
    do {
      const n = Math.min(MAXB, q.length - off)
      for (let i = 0; i < n; i++) {
        const b = q[off + i]
        // brushes are queued in screen pane units; the lattice is seen through the warp
        bS.uB0.value[i].set(warpX(b.x0, b.y0, A), warpY(b.x0, b.y0, A), warpX(b.x1, b.y1, A), warpY(b.x1, b.y1, A))
        bS.uB1.value[i].set(b.r, b.type, b.s, 0)
        bG.uB0.value[i].copy(bS.uB0.value[i])
        bG.uB1.value[i].set(b.r, b.type, b.s, 0)
      }
      bS.uN.value = bG.uN.value = n
      if (n > 0) {
        bS.tS.value = t.s[0].texture
        draw(R.brush, t.s[1])
        flipS()
      }
      bG.tG.value = t.g[0].texture
      bG.uDt.value = first ? dt : 0
      draw(R.glass, t.g[1])
      flipG()
      first = false
      off += n
    } while (off < q.length)
    q.length = 0

    // 3 · grow
    const u = R.step.uniforms
    const b = beta.get()
    const k = (b - TEMPS[0].beta) / (TEMPS[2].beta - TEMPS[0].beta) // 0..1 across the presets, eased by Motion
    u.uSimRes.value.set(sw, sh)
    u.uBeta.value = b
    R.brush.uniforms.uBeta.value = b
    u.uGamma.value = THREE.MathUtils.lerp(TEMPS[0].gamma, TEMPS[2].gamma, k)
    u.uRho.value = THREE.MathUtils.lerp(TEMPS[0].rho, TEMPS[2].rho, k)
    // warmth from a wipe lasts P.warm seconds; rime takes ~25 s to settle
    const sps = P.sps
    u.uWarmK.value = Math.pow(0.04, 1 / (P.warm * sps))
    u.uRimeK.value = 1 - Math.pow(0.4, 1 / (25 * sps))
    s.acc += P.sps * dt
    let n = Math.floor(s.acc)
    s.acc -= n
    if (s.boost > 0) {
      // fast-forward: the glass is already frosting over when it fades in
      n = POSTER ? 100 : 40
      s.boost--
    }
    for (let i = 0; i < n; i++) {
      u.tS.value = t.s[0].texture
      draw(R.step, t.s[1])
      flipS()
    }

    // 4 · composite
    s.fade = Math.min(1, s.fade + dt / 1.1)
    const cu = R.comp.uniforms
    cu.tStreet.value = t.street.texture
    cu.tS.value = t.s[0].texture
    cu.tG.value = t.g[0].texture
    cu.uSimTx.value.set(1 / sw, 1 / sh)
    gl.getDrawingBufferSize(cu.uRes.value)
    cu.uDpr.value = gl.getPixelRatio()
    cu.uA.value = A
    cu.uTime.value = s.t
    cu.uFade.value = s.fade * s.fade * (3 - 2 * s.fade)
    const dv = cu.uDrops.value as THREE.Vector4[]
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = drops.list[i]
      if (d) dv[i].set(d.x, d.y, d.r, Math.min(1, d.a))
      else dv[i].set(0, 0, 0, 0)
    }
    draw(R.comp, prevTarget)
  }, 1)

  return null
}

/** queue a finger wipe from a → b and shed melt water along its lower edge */
function wipe(q: Brush[], drops: Drops, x0: number, y0: number, x1: number, y1: number, r: number) {
  q.push({ x0, y0, x1, y1, r, type: 0, s: 1 })
  const len = Math.hypot(x1 - x0, y1 - y0)
  const n = Math.floor(len / 0.012 + Math.random())
  for (let i = 0; i < n; i++) {
    if (Math.random() > 0.3) continue
    const k = Math.random()
    drops.add(x0 + (x1 - x0) * k + (Math.random() - 0.5) * r, y0 + (y1 - y0) * k - r * (0.55 + Math.random() * 0.3), 0.003 + Math.random() * 0.004)
  }
}

export default function FrostWindow() {
  const [temp, setTemp] = useState(1)
  const [ready, setReady] = useState(false)
  const tempRef = useRef(temp)
  tempRef.current = temp
  const beta = useMotionValue(TEMPS[1].beta)
  const brushes = useRef<Brush[]>([])
  const cmd = useRef<Cmd>({ clear: 0, breath: 0 })
  const lastTouch = useRef(performance.now() - 4000)
  const stage = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const a = animate(beta, TEMPS[temp].beta, { duration: 1.6, ease: [0.45, 0, 0.2, 1] })
    return () => a.stop()
  }, [temp, beta])

  // drag = a warm fingertip on the glass
  useEffect(() => {
    const el = stage.current!
    let down = -1
    let lx = 0
    let ly = 0
    const pane = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return [(e.clientX - r.left) / r.height, 1 - (e.clientY - r.top) / r.height] as const
    }
    const rad = () => (MOBILE ? 0.034 : 0.04)
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      down = e.pointerId
      lastTouch.current = performance.now()
      const [x, y] = pane(e)
      lx = x
      ly = y
      brushes.current.push({ x0: x, y0: y, x1: x + 1e-4, y1: y, r: rad(), type: 0, s: 1 })
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== down) return
      lastTouch.current = performance.now()
      const [x, y] = pane(e)
      const q: Brush[] = []
      const d = dropsProxy.current
      if (d) wipe(q, d, lx, ly, x, y, rad())
      else q.push({ x0: lx, y0: ly, x1: x, y1: y, r: rad(), type: 0, s: 1 })
      brushes.current.push(...q)
      lx = x
      ly = y
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === down) down = -1
    }
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

  const T = TEMPS[temp]

  return (
    <div className="stage fw-root" style={{ background: '#0b111b' }}>
      <style>{css}</style>
      <div ref={stage} className="fw-canvas">
        <Canvas linear flat dpr={[1, 1.75]} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
          <Frost tempRef={tempRef} beta={beta} brushes={brushes} cmd={cmd} lastTouch={lastTouch} onReady={() => setReady(true)} />
        </Canvas>
      </div>

      <div className="overlay">
        <motion.div
          className="fw-copy soft-text"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={ready ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim fw-scrim" />
          <p className="fw-kicker">
            <i />
            <span>FROST ·</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={T.zh}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
              >
                {T.zh}C
              </motion.span>
            </AnimatePresence>
          </p>
          <h1>一夜冰花</h1>
          <p className="fw-sub">冰晶从窗框上的晶核出发，沿六个方向分叉生长。用指尖擦开一道，街灯就透进来；停手，它又慢慢冻回去。</p>
        </motion.div>

        <div className="dock">
          <Seg items={TEMPS.map((p, i) => ({ value: i, label: p.zh }))} value={temp} onChange={setTemp} />
          <span className="dock-sep" />
          <button className="seg" onClick={() => { cmd.current.breath++; lastTouch.current = performance.now() }}>
            <span>哈一口气</span>
          </button>
          <button className="seg" onClick={() => { cmd.current.clear++; lastTouch.current = performance.now() - 3000 }}>
            <span>清空</span>
          </button>
        </div>
        <p className="hint">按住拖动 · 用指尖融开冰花</p>
      </div>
    </div>
  )
}

// the pointer handler needs the drop sim to shed water while wiping; it lives inside the canvas component
const dropsProxy: { current: Drops | null } = { current: null }

const css = `
.fw-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.fw-canvas:active { cursor: grabbing; }
.fw-canvas canvas { display: block; }
.fw-copy {
  --soft-bg: #04070d;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 104px;
  max-width: 400px; pointer-events: none !important;
}
.fw-copy { isolation: isolate; }
.fw-scrim { --soft-bg: rgba(4, 7, 13, 0.82); left: -160px; right: -200px; height: 420px; }
.fw-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 14px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.fw-kicker i { width: 6px; height: 6px; border-radius: 50%; background: #9fd0ff; box-shadow: 0 0 10px #9fd0ff; }
.fw-kicker span { display: inline-block; }
.fw-copy h1 { margin: 0; font: 600 clamp(32px, 3.6vw, 50px)/1.06 var(--display); letter-spacing: -.03em; }
.fw-sub { margin: 12px 0 0; font-size: 14px; line-height: 1.75; color: var(--fg-2); }
@media (max-width: 760px) {
  .fw-copy { bottom: 92px; right: 24px; }
  .fw-copy h1 { font-size: 30px; }
  .fw-sub { font-size: 13px; }
}
`
