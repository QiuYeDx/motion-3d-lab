import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { createGlowMaterial, quadGeo } from './isoWarmup'

/* ------------------------------------------------------------------ layout */
const BG = '#0a0e16'
const ROWS = [-2.9, 0, 2.9]
const ROW_NAMES = ['A', 'B', 'C']
const COLS = 6
const X0 = -3.0
const DX = 1.0
const RW = 0.92
const RH = 1.75
const RD = 1.1
const TY = 2.42 // cable tray height
const CORE = { x: 4.3, z: -3.85 }
const RISER_TOP = 9.5
const SERVERS = 7
const N = ROWS.length * COLS
const BASE_ACTIVE = 15
const SLAB = { x: 0.4, z: -0.3, w: 10.4, d: 9.1 }

type SlotDef = { x: number; z: number; zr: number; row: number; col: number; name: string }
const SLOTS: SlotDef[] = ROWS.flatMap((z, row) =>
  Array.from({ length: COLS }, (_, col) => ({ x: X0 + col * DX, z, zr: z - 0.25, row, col, name: `${ROW_NAMES[row]}${col + 1}` })),
)

const COL = {
  req: new THREE.Color('#38d0ff'),
  resp: new THREE.Color('#5eead4'),
  mig: new THREE.Color('#ffb547'),
  burst: new THREE.Color('#c4f1ff'),
  ok: new THREE.Color('#38d0ff'),
  warm: new THREE.Color('#ffb547'),
  hot: new THREE.Color('#ff4d5e'),
  body: new THREE.Color('#1e293b'),
  bodyHot: new THREE.Color('#6b2531'),
  plateHot: new THREE.Color('#7a2a36'),
}

/* ------------------------------------------------------------------ paths */
type Path = { pts: THREE.Vector3[]; cum: number[]; len: number }
function mkPath(pts: THREE.Vector3[]): Path {
  const clean = pts.filter((p, i) => i === 0 || p.distanceToSquared(pts[i - 1]) > 1e-6)
  const cum = [0]
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1] + clean[i].distanceTo(clean[i - 1]))
  return { pts: clean, cum, len: cum[cum.length - 1] }
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
function upPath(s: SlotDef) {
  return mkPath([V(CORE.x + 0.21, RISER_TOP - 1, CORE.z + 0.21), V(CORE.x + 0.21, TY + 0.1, CORE.z + 0.21), V(CORE.x, TY, CORE.z), V(CORE.x, TY, s.zr), V(s.x, TY, s.zr), V(s.x, RH + 0.02, s.zr)])
}
function migPath(a: SlotDef, b: SlotDef) {
  const pts = [V(a.x, RH + 0.02, a.zr), V(a.x, TY, a.zr)]
  if (a.row !== b.row) pts.push(V(CORE.x - 0.0, TY, a.zr), V(CORE.x, TY, b.zr))
  pts.push(V(b.x, TY, b.zr), V(b.x, RH + 0.02, b.zr))
  return mkPath(pts)
}
const UP = SLOTS.map(upPath)
const DOWN = UP.map((p) => mkPath([...p.pts].reverse()))

function sample(path: Path, s: number, out: THREE.Vector3, dir: THREE.Vector3) {
  s = Math.max(0, Math.min(path.len, s))
  let k = 1
  while (k < path.cum.length - 1 && path.cum[k] < s) k++
  const a = path.pts[k - 1]
  const b = path.pts[k]
  const seg = path.cum[k] - path.cum[k - 1] || 1
  out.lerpVectors(a, b, (s - path.cum[k - 1]) / seg)
  dir.subVectors(b, a).normalize()
}

/* ------------------------------------------------------------------ simulation */
type Level = 0 | 1 | 2
const LEVEL_BASE = [0.3, 0.5, 0.72]
type Packet = { alive: boolean; path: Path; s: number; speed: number; col: THREE.Color; kind: 0 | 1 | 2 | 3; slot: number; delay: number }
type Heat = { alive: boolean; x: number; y: number; z: number; age: number; life: number; ph: number; s: number }
const MAXP = 560
const MAXH = 160
type DCEvent = { id: number; text: string; kind: 'up' | 'down' }

function makeSim() {
  let seed = 3
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const slots = SLOTS.map((d, i) => {
    const on = d.col < COLS - 1
    return {
      ...d,
      i,
      serving: on,
      rise: on ? 1 : 0,
      riseV: 0,
      want: on ? 1 : 0,
      load: 0.38 + rnd() * 0.1,
      temp: 32,
      burst: 0,
      weight: 0.8 + rnd() * 0.45,
      hot: 0,
      draining: false,
      extra: false,
      acc: rnd(),
      heatAcc: 0,
      flash: 0,
      ledPh: Array.from({ length: SERVERS * 2 }, () => rnd() * 6.28),
    }
  })
  const packets: Packet[] = Array.from({ length: MAXP }, () => ({ alive: false, path: UP[0], s: 0, speed: 5, col: COL.req, kind: 0, slot: 0, delay: 0 }))
  const heat: Heat[] = Array.from({ length: MAXH }, () => ({ alive: false, x: 0, y: 0, z: 0, age: 0, life: 1, ph: 0, s: 1 }))
  const sim = {
    slots,
    packets,
    heat,
    level: 1 as Level,
    time: 0,
    wave: 0,
    waveT: -100,
    cooldown: 3,
    calm: 0,
    hover: -1,
    lastUser: -100,
    evId: 0,
    onEvent: null as null | ((e: DCEvent) => void),
    spawn(path: Path, col: THREE.Color, kind: Packet['kind'], slot: number, speed = 5.2, delay = 0) {
      const p = packets.find((q) => !q.alive)
      if (!p) return
      p.alive = true
      p.path = path
      p.s = 0
      p.col = col
      p.kind = kind
      p.slot = slot
      p.speed = speed
      p.delay = delay
    },
    emitHeat(x: number, y: number, z: number) {
      const h = heat.find((q) => !q.alive)
      if (!h) return
      h.alive = true
      h.x = x
      h.y = y
      h.z = z
      h.age = 0
      h.life = 1.8 + rnd() * 0.9
      h.ph = rnd() * 6.28
      h.s = 0.35 + rnd() * 0.35
    },
    inject(i: number, amount = 0.55, user = true) {
      const s = slots[i]
      if (!s.serving) return
      if (user) sim.lastUser = sim.time
      s.burst = Math.min(1.1, s.burst + amount)
      s.flash = 1
      for (let k = 0; k < 14; k++) sim.spawn(UP[i], COL.burst, 3, i, 7.5, k * 0.06)
    },
    /** the busiest serving rack that is not already draining — the button pushes it over the edge */
    hottest() {
      let best = -1
      for (const s of slots) if (s.serving && !s.draining && (best < 0 || s.load > slots[best].load)) best = s.i
      return best < 0 ? 0 : best
    },
    servingCount() {
      return slots.reduce((n, s) => n + (s.serving ? 1 : 0), 0)
    },
    emit(text: string, kind: DCEvent['kind']) {
      sim.onEvent?.({ id: ++sim.evId, text, kind })
    },
    step(dt: number) {
      sim.time += dt
      sim.cooldown -= dt
      const t = sim.time
      // traffic wave envelope
      const wAge = t - sim.waveT
      sim.wave = wAge > 0 && wAge < 7 ? Math.sin((wAge / 7) * Math.PI) ** 2 * 0.3 : 0
      const demand = LEVEL_BASE[sim.level] * BASE_ACTIVE * (1 + 0.06 * Math.sin(t * 0.45) + sim.wave)
      let wsum = 0
      for (const s of slots) if (s.serving && !s.draining) wsum += s.weight
      let total = 0
      let n = 0
      let hottest = -1
      for (const s of slots) {
        // rack rise / sink spring
        s.riseV += (70 * (s.want - s.rise) - 11 * s.riseV) * dt
        s.rise += s.riseV * dt
        if (s.want === 0 && s.rise < 0.002) {
          s.rise = 0
          s.riseV = 0
        }
        if (!s.serving && s.want === 1 && s.rise > 0.85) {
          s.serving = true
          s.flash = 1
        }
        s.burst *= Math.exp(-dt / 7)
        const share = s.serving && !s.draining && wsum > 0 ? (demand * s.weight) / wsum : 0
        const target = s.serving ? share + s.burst : 0
        s.load += (target - s.load) * Math.min(1, dt * 0.9)
        s.temp += (24 + s.load * 30 - s.temp) * Math.min(1, dt * 0.5)
        s.flash = Math.max(0, s.flash - dt * 1.4)
        if (s.serving) {
          total += s.load
          n++
          s.hot = s.load > 0.95 ? s.hot + dt : Math.max(0, s.hot - dt * 2)
          if (s.hot > 1.1 && (hottest < 0 || s.hot > slots[hottest].hot)) hottest = s.i
          // requests in, responses out
          s.acc += dt * Math.max(0, s.draining ? s.load * 0.5 : share + s.burst) * 3.4
          while (s.acc >= 1) {
            s.acc -= 1
            sim.spawn(UP[s.i], COL.req, 0, s.i, 5.2 + rnd() * 0.8)
          }
          // heat shimmer
          const h = THREE.MathUtils.smoothstep(s.load, 0.72, 1.05)
          s.heatAcc += dt * h * 16
          while (s.heatAcc >= 1) {
            s.heatAcc -= 1
            sim.emitHeat(s.x + (rnd() - 0.5) * 0.7, RH + 0.05, s.z + (rnd() - 0.5) * 0.8)
          }
        }
        // drained extra rack → sink
        if (s.draining && s.load < 0.06 && s.want === 1) {
          s.want = 0
          s.serving = false
          s.draining = false
          s.extra = false
        }
      }
      const avg = n ? total / n : 0
      // autoscale out
      if (hottest >= 0 && sim.cooldown <= 0) {
        const src = slots[hottest]
        const spares = slots.filter((s) => !s.serving && s.want === 0)
        const spare = spares.find((s) => s.row === src.row) ?? spares[0]
        if (spare) {
          spare.want = 1
          spare.extra = true
          spare.load = 0
          spare.burst = 0
          spare.weight = 1.0
          sim.cooldown = 6
          src.hot = 0
          sim.pendingMig.push({ from: src.i, to: spare.i })
          sim.emit(`${src.name} 过载 → 自动扩容 ${spare.name}`, 'up')
        }
      }
      // migrate once the new rack is serving
      sim.pendingMig = sim.pendingMig.filter((m) => {
        const to = slots[m.to]
        if (!to.serving) return true
        const from = slots[m.from]
        const moved = from.burst * 0.5
        from.burst -= moved
        to.burst += moved
        const path = migPath(from, to)
        for (let k = 0; k < 16; k++) sim.spawn(path, COL.mig, 2, m.to, 6, k * 0.09)
        return false
      })
      // scale back in after a calm stretch
      const extra = slots.filter((s) => s.extra && s.serving && !s.draining)
      const projected = n > 1 ? total / (n - 1) : 1
      sim.calm = extra.length && projected < 0.62 && sim.cooldown < 0 && hottest < 0 ? sim.calm + dt : 0
      if (sim.calm > 4) {
        const last = extra[extra.length - 1]
        let to: (typeof slots)[number] | null = null
        for (const s of slots) if (s.serving && !s.draining && s !== last && (!to || s.load < to.load)) to = s
        if (to) {
          last.draining = true
          to.burst += last.burst * 0.8
          last.burst = 0
          const path = migPath(last, to)
          for (let k = 0; k < 12; k++) sim.spawn(path, COL.resp, 2, to.i, 6, k * 0.1)
          sim.calm = 0
          sim.cooldown = 3
          sim.emit(`负载回落 → ${last.name} 迁出并缩容`, 'down')
        }
      }
      sim.avg = avg
      sim.qps = total * 4200
    },
    pendingMig: [] as { from: number; to: number }[],
    avg: 0,
    qps: 0,
  }
  return sim
}
type Sim = ReturnType<typeof makeSim>

/* ------------------------------------------------------------------ floor: raised tiles, cold-aisle perforation, heat + slot glow */
const floorVert = /* glsl */ `
  varying vec3 vW;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`
const floorFrag = /* glsl */ `
  uniform vec4 uSlot[${N}];
  uniform vec4 uHover;
  uniform float uTime;
  varying vec3 vW;
  float grid(vec2 p, float s) { vec2 q = p / s; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
  void main() {
    vec2 p = vW.xz;
    vec3 col = vec3(0.085, 0.105, 0.145);
    float tile = grid(p + vec2(0.0, 0.05), 0.6);
    col += vec3(0.13, 0.18, 0.26) * tile * 0.7;
    // cold aisles in front of each row: perforated tiles, faint blue
    float aisle = 0.0;
    for (int r = 0; r < 3; r++) {
      float zr = ${ROWS[0].toFixed(2)} + float(r) * ${(ROWS[1] - ROWS[0]).toFixed(2)};
      aisle += step(zr + 0.62, p.y) * step(p.y, zr + 1.48) * step(${(X0 - 0.5).toFixed(2)}, p.x) * step(p.x, ${(X0 + (COLS - 1) * DX + 0.5).toFixed(2)});
    }
    vec2 cell = fract(p / 0.1) - 0.5;
    float dots = 1.0 - smoothstep(0.18, 0.3, length(cell));
    col += aisle * (vec3(0.05, 0.12, 0.18) * 0.6 + vec3(0.12, 0.3, 0.42) * dots * 0.18);
    for (int i = 0; i < ${N}; i++) {
      vec4 s = uSlot[i];
      vec2 d = abs(p - s.xy) - vec2(${(RW / 2).toFixed(3)}, ${(RD / 2).toFixed(3)});
      float box = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
      // heat pool spilling into the aisle
      float hz = exp(-max(box, 0.0) * 2.4) * s.z;
      col += vec3(1.0, 0.28, 0.25) * hz * 0.22;
      // opening hatch for a rack on its way up / down
      float inside = 1.0 - smoothstep(-0.01, 0.01, box);
      col = mix(col, vec3(0.012, 0.016, 0.026), inside * s.w);
      float edge = exp(-abs(box) * 40.0) * s.w;
      col += vec3(0.22, 0.82, 1.0) * edge * 0.9;
    }
    // hover ring
    vec2 hd = abs(p - uHover.xy) - vec2(${(RW / 2 + 0.12).toFixed(3)}, ${(RD / 2 + 0.12).toFixed(3)});
    float hb = length(max(hd, 0.0)) + min(max(hd.x, hd.y), 0.0);
    col += vec3(0.22, 0.82, 1.0) * exp(-abs(hb) * 30.0) * uHover.w * 0.8;
    gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
    #include <colorspace_fragment>
  }
`

function Floor({ sim }: { sim: Sim }) {
  const slotU = useMemo(() => SLOTS.map((s) => new THREE.Vector4(s.x, s.z, 0, 0)), [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        uniforms: { uSlot: { value: slotU }, uHover: { value: new THREE.Vector4(0, 0, 0, 0) }, uTime: { value: 0 } },
      }),
    [slotU],
  )
  const hov = useRef(0)
  useFrame((_, dt) => {
    mat.uniforms.uTime.value = sim.time
    sim.slots.forEach((s, i) => {
      const u = slotU[i]
      u.z = s.serving ? THREE.MathUtils.smoothstep(s.load, 0.7, 1.05) * Math.min(1, s.rise) : 0
      // hatch open while the rack is in transit
      const transit = Math.abs(s.want - s.rise) > 0.006 || Math.abs(s.riseV) > 0.02 ? 1 : 0
      u.w += (transit - u.w) * Math.min(1, dt * (transit ? 10 : 3))
    })
    const h = sim.hover
    hov.current += ((h >= 0 ? 1 : 0) - hov.current) * Math.min(1, dt * 12)
    const hu = mat.uniforms.uHover.value as THREE.Vector4
    if (h >= 0) hu.set(SLOTS[h].x, SLOTS[h].z, 0, hov.current)
    else hu.w = hov.current
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[SLAB.x, 0.001, SLAB.z]} material={mat}>
      <planeGeometry args={[SLAB.w, SLAB.d]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ static room: slab, trays, core, labels */
const metal = new THREE.MeshStandardMaterial({ color: '#2f3a50', roughness: 0.45, metalness: 0.55 })
const slabMat = new THREE.MeshStandardMaterial({ color: '#0f141e', roughness: 0.8, metalness: 0.2 })
const boxG = new THREE.BoxGeometry(1, 1, 1)

/** create instanceColor up front so the precompiled program already has USE_INSTANCING_COLOR */
function useInstanceColors(...refs: React.RefObject<THREE.InstancedMesh | null>[]) {
  useLayoutEffect(() => {
    for (const r of refs) {
      const m = r.current
      if (m && !m.instanceColor) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * Compiles every program in the background (KHR_parallel_shader_compile) for the off-screen half-float target the
 * EffectComposer renders into. Meanwhile the camera only sees layer 1 (lights are put on it too, so the compiled
 * programs get the right light count), which keeps the composer drawing an empty frame instead of linking shaders
 * synchronously on the first real draw.
 */
function Warmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const cb = useRef(onReady)
  cb.current = onReady
  useLayoutEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(1)
    })
    camera.layers.set(1)
    let dead = false
    const raf = requestAnimationFrame(() => {
      if (dead) return
      const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType })
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(rt)
      const job = gl.compileAsync(scene, camera)
      gl.setRenderTarget(prev)
      job
        .catch(() => {})
        .then(() => {
          rt.dispose()
          if (dead) return
          camera.layers.set(0)
          cb.current()
        })
    })
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      camera.layers.set(0)
    }
  }, [gl, scene, camera])
  return null
}

function Tray({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const len = a.distanceTo(b)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const alongX = Math.abs(a.x - b.x) > 0.01
  const sx = alongX ? len + 0.3 : 0.34
  const sz = alongX ? 0.34 : len + 0.3
  const cableCols = ['#1d6b86', '#4b3f7a', '#2d3a50']
  return (
    <group position={mid}>
      <mesh geometry={boxG} material={metal} scale={[sx, 0.03, sz]} position={[0, -0.06, 0]} />
      {[-1, 1].map((k) => (
        <mesh key={k} geometry={boxG} material={metal} scale={alongX ? [sx, 0.12, 0.02] : [0.02, 0.12, sz]} position={alongX ? [0, 0, k * 0.16] : [k * 0.16, 0, 0]} />
      ))}
      {cableCols.map((c, k) => (
        <mesh key={c} geometry={boxG} scale={alongX ? [sx - 0.1, 0.035, 0.06] : [0.06, 0.035, sz - 0.1]} position={alongX ? [0, -0.03, -0.09 + k * 0.09] : [-0.09 + k * 0.09, -0.03, 0]}>
          <meshStandardMaterial color={c} roughness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

function labelTex(text: string, color = 'rgba(120,200,255,.55)') {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.font = '600 64px Consolas, "Cascadia Code", monospace'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Room({ sim }: { sim: Sim }) {
  const coreGlow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#38d0ff', toneMapped: false }), [])
  const rowLabels = useMemo(() => ROW_NAMES.map((n) => labelTex(`ROW ${n}`)), [])
  const coreTex = useMemo(() => labelTex('CORE', 'rgba(170,225,255,.85)'), [])
  const edge = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#38d0ff').multiplyScalar(0.55), toneMapped: false }), [])
  useFrame(() => {
    const k = 1.2 + 0.6 * Math.sin(sim.time * 3) + sim.qps / 40000
    coreGlow.color.set('#38d0ff').multiplyScalar(k)
  })
  const zEnd = ROWS[ROWS.length - 1] - 0.25
  return (
    <group>
      {/* slab */}
      <mesh geometry={boxG} material={slabMat} position={[SLAB.x, -0.3, SLAB.z]} scale={[SLAB.w, 0.6, SLAB.d]} />
      <mesh geometry={boxG} material={edge} position={[SLAB.x + SLAB.w / 2, -0.012, SLAB.z]} scale={[0.02, 0.024, SLAB.d]} />
      <mesh geometry={boxG} material={edge} position={[SLAB.x, -0.012, SLAB.z + SLAB.d / 2]} scale={[SLAB.w, 0.024, 0.02]} />
      {/* pedestal posts hinting at the void under the raised floor */}
      {Array.from({ length: 14 }, (_, k) => (
        <mesh key={`px${k}`} geometry={boxG} material={metal} position={[SLAB.x - SLAB.w / 2 + 0.4 + k * 0.72, -0.33, SLAB.z + SLAB.d / 2 - 0.03]} scale={[0.05, 0.5, 0.05]} />
      ))}
      {Array.from({ length: 12 }, (_, k) => (
        <mesh key={`pz${k}`} geometry={boxG} material={metal} position={[SLAB.x + SLAB.w / 2 - 0.03, -0.33, SLAB.z - SLAB.d / 2 + 0.4 + k * 0.72]} scale={[0.05, 0.5, 0.05]} />
      ))}
      {/* trays: riser, spine, row runs */}
      <mesh geometry={boxG} material={metal} position={[CORE.x, (TY + RISER_TOP) / 2, CORE.z]} scale={[0.34, RISER_TOP - TY, 0.34]} />
      <Tray a={V(CORE.x, TY, CORE.z)} b={V(CORE.x, TY, zEnd)} />
      {SLOTS.filter((s) => s.col === 0).map((s) => (
        <Tray key={s.row} a={V(X0 - 0.45, TY, s.zr)} b={V(CORE.x - 0.17, TY, s.zr)} />
      ))}
      {/* tray hangers */}
      {ROWS.flatMap((z) =>
        [X0 - 0.3, X0 + 2.5, CORE.x - 0.6].map((x) => <mesh key={`${x}${z}`} geometry={boxG} material={metal} position={[x, TY + 0.9, z - 0.25]} scale={[0.03, 1.8, 0.03]} />),
      )}
      {/* core switch */}
      <group position={[CORE.x, 0, CORE.z]}>
        <mesh geometry={boxG} position={[0, 1.1, 0]} scale={[1.3, 2.2, 1.3]}>
          <meshStandardMaterial color="#162034" roughness={0.4} metalness={0.5} />
        </mesh>
        {[0.45, 0.9, 1.35, 1.8].map((y) => (
          <group key={y}>
            <mesh geometry={boxG} material={coreGlow} position={[0, y, 0.655]} scale={[1.0, 0.035, 0.01]} />
            <mesh geometry={boxG} material={coreGlow} position={[0.655, y, 0]} scale={[0.01, 0.035, 1.0]} />
          </group>
        ))}
        <mesh position={[0, 2.05, 0.66]}>
          <planeGeometry args={[0.8, 0.4]} />
          <meshBasicMaterial map={coreTex} transparent toneMapped={false} />
        </mesh>
      </group>
      {/* row labels painted on the floor */}
      {rowLabels.map((t, r) => (
        <mesh key={r} position={[X0 - 1.05, 0.004, ROWS[r]]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[1.0, 0.5]} />
          <meshBasicMaterial map={t} transparent toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------------ racks (all instanced) */
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()
const _c2 = new THREE.Color()

function loadColor(load: number, out: THREE.Color) {
  if (load < 0.65) return out.copy(COL.ok)
  if (load < 0.88) return out.copy(COL.ok).lerpHSL(COL.warm, (load - 0.65) / 0.23)
  return out.copy(COL.warm).lerpHSL(COL.hot, Math.min(1, (load - 0.88) / 0.12))
}

function Racks({ sim, onHover, onHit }: { sim: Sim; onHover: (i: number) => void; onHit: (i: number) => void }) {
  const body = useRef<THREE.InstancedMesh>(null)
  const plates = useRef<THREE.InstancedMesh>(null)
  const leds = useRef<THREE.InstancedMesh>(null)
  const strips = useRef<THREE.InstancedMesh>(null)
  const drops = useRef<THREE.InstancedMesh>(null)
  const hoverK = useRef(new Float32Array(N))
  useInstanceColors(body, plates, leds, strips)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const b = body.current
    const pl = plates.current
    const le = leds.current
    const st = strips.current
    const dr = drops.current
    if (!b || !pl || !le || !st || !dr) return
    const t = sim.time
    sim.slots.forEach((s, i) => {
      const hk = (hoverK.current[i] += ((sim.hover === i ? 1 : 0) - hoverK.current[i]) * Math.min(1, dt * 12))
      const y0 = (s.rise - 1) * (RH + 0.15)
      const heat = THREE.MathUtils.smoothstep(s.load, 0.72, 1.05)
      // body
      const bot = Math.max(0, y0)
      const hgt = Math.max(0.0001, y0 + RH - bot)
      _p.set(s.x, bot + hgt / 2, s.z)
      _s.set(RW, hgt, RD)
      b.setMatrixAt(i, _m.compose(_p, _q, _s))
      _c.copy(COL.body).lerp(COL.bodyHot, heat * 0.85)
      _c.offsetHSL(0, 0, hk * 0.05 + s.flash * 0.08)
      b.setColorAt(i, _c)
      // status strip on the top front edge
      const sv = y0 + RH - 0.09 > 0.02 ? 1 : 0
      _p.set(s.x, y0 + RH - 0.09, s.z + RD / 2 + 0.008)
      _s.set((RW - 0.16) * sv, 0.03 * sv, 0.01 * sv)
      st.setMatrixAt(i, _m.compose(_p, _q, _s))
      loadColor(s.load, _c).multiplyScalar(s.serving ? 1.3 + hk * 1.2 + s.flash * 2 + heat * Math.max(0, Math.sin(t * 10)) * 1.4 : 0.2)
      st.setColorAt(i, _c)
      // drop cable from tray
      const vis = s.rise > 0.95 ? 1 : 0
      _p.set(s.x, (RH + TY) / 2, s.zr)
      _s.set(0.06 * vis, (TY - RH) * vis, 0.06 * vis)
      dr.setMatrixAt(i, _m.compose(_p, _q, _s))
      // servers + LEDs
      for (let k = 0; k < SERVERS; k++) {
        const yy = y0 + 0.2 + k * 0.2
        const sh = yy > 0.09 ? 1 : 0
        _p.set(s.x, yy, s.z + RD / 2 + 0.006)
        _s.set((RW - 0.12) * sh, 0.17 * sh, 0.012 * sh)
        pl.setMatrixAt(i * SERVERS + k, _m.compose(_p, _q, _s))
        pl.setColorAt(i * SERVERS + k, _c2.set(k % 3 === 0 ? '#34405a' : '#2a3449').lerp(COL.plateHot, heat * 0.7).offsetHSL(0, 0, hk * 0.04))
        for (let l = 0; l < 2; l++) {
          const li = (i * SERVERS + k) * 2 + l
          _p.set(s.x + 0.24 + l * 0.08, yy, s.z + RD / 2 + 0.014)
          _s.set(0.045 * sh, 0.035 * sh, 0.01 * sh)
          le.setMatrixAt(li, _m.compose(_p, _q, _s))
          if (!s.serving && s.rise < 0.9) {
            le.setColorAt(li, _c2.setRGB(0.05, 0.07, 0.1))
            continue
          }
          const rate = 3 + s.load * 14
          const on = Math.sin(t * rate * (l ? 1.7 : 1) + s.ledPh[k * 2 + l]) > (l ? 0.1 : -0.4)
          if (l === 0) loadColor(s.load, _c2)
          else _c2.copy(COL.resp)
          le.setColorAt(li, _c2.multiplyScalar(on ? 2.4 : 0.18))
        }
      }
    })
    for (const m of [b, pl, le, st, dr]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  })

  const move = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const i = e.instanceId ?? -1
    const ok = i >= 0 && sim.slots[i].rise > 0.6
    onHover(ok ? i : -1)
  }
  return (
    <group>
      <instancedMesh
        ref={body}
        args={[undefined, undefined, N]}
        frustumCulled={false}
        onPointerMove={move}
        onPointerOut={() => onHover(-1)}
        onClick={(e) => {
          e.stopPropagation()
          const i = e.instanceId ?? -1
          if (i >= 0 && sim.slots[i].serving) onHit(i)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.45} />
      </instancedMesh>
      <instancedMesh ref={plates} args={[undefined, undefined, N * SERVERS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, N * SERVERS * 2]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={strips} args={[undefined, undefined, N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={drops} args={[undefined, undefined, N]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#173a4a" roughness={0.6} />
      </instancedMesh>
    </group>
  )
}

/* ------------------------------------------------------------------ packets (instanced, with short trails) */
const TRAIL = 3
function Packets({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const v = useMemo(() => new THREE.Vector3(), [])
  const d = useMemo(() => new THREE.Vector3(), [])
  const X = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  useInstanceColors(ref)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const mesh = ref.current
    if (!mesh) return
    let n = 0
    for (const p of sim.packets) {
      if (!p.alive) continue
      if (p.delay > 0) {
        p.delay -= dt
        continue
      }
      p.s += p.speed * dt
      if (p.s >= p.path.len) {
        p.alive = false
        if (p.kind === 0 && Math.random() < 0.5) sim.spawn(DOWN[p.slot], COL.resp, 1, p.slot, 5.6)
        if (p.kind === 3 || p.kind === 2) sim.slots[p.slot].flash = Math.max(sim.slots[p.slot].flash, 0.5)
        continue
      }
      for (let k = 0; k < TRAIL; k++) {
        const s = p.s - k * 0.14
        if (s < 0) break
        sample(p.path, s, v, d)
        _q.setFromUnitVectors(X, d)
        const f = 1 - k / TRAIL
        const big = p.kind === 3 ? 1.35 : 1
        _s.set((0.17 * f + 0.04) * big, (0.06 * f + 0.01) * big, (0.06 * f + 0.01) * big)
        v.y += 0.02
        mesh.setMatrixAt(n, _m.compose(v, _q, _s))
        _c.copy(p.col).multiplyScalar((k === 0 ? 2.4 : 1.0) * f * (p.kind === 3 ? 0.75 : 1))
        mesh.setColorAt(n, _c)
        n++
      }
      if (n >= MAXP * TRAIL - TRAIL) break
    }
    for (let i = n; i < mesh.count; i++) mesh.setMatrixAt(i, zero)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAXP * TRAIL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ heat shimmer: rising additive wisps that wobble */
function HeatShimmer({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => {
    const m = createGlowMaterial(1)
    m.uniforms.uIntensity.value = 1
    return m
  }, [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])
  const warm = useMemo(() => new THREE.Color('#ff7a45'), [])
  const red = useMemo(() => new THREE.Color('#ff3b4e'), [])
  useInstanceColors(ref)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const mesh = ref.current
    if (!mesh) return
    let n = 0
    for (const h of sim.heat) {
      if (!h.alive) continue
      h.age += dt
      if (h.age > h.life) {
        h.alive = false
        continue
      }
      const k = h.age / h.life
      h.y += dt * (0.55 + k * 0.5)
      const wob = Math.sin(h.age * 4 + h.ph) * 0.12 * k
      _p.set(h.x + wob, h.y, h.z - wob * 0.6)
      const sc = h.s * (0.5 + k * 0.8)
      _s.set(sc, sc, sc)
      mesh.setMatrixAt(n, _m.compose(_p, _q.identity(), _s))
      const a = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.3
      _c.copy(warm).lerp(red, k).multiplyScalar(a)
      mesh.setColorAt(n, _c)
      n++
    }
    for (let i = n; i < mesh.count; i++) mesh.setMatrixAt(i, zero)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[quadGeo, mat, MAXH]} frustumCulled={false} renderOrder={5} />
}

/* ------------------------------------------------------------------ driver + projected tooltip */
function Driver({ sim, tip }: { sim: Sim; tip: React.RefObject<HTMLDivElement | null> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const tick = useRef(0)
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    sim.step(dt)
    const el = tip.current
    if (!el) return
    const h = sim.hover
    if (h < 0) return
    const s = sim.slots[h]
    v.set(s.x, RH + 0.2, s.z + RD / 2).project(camera)
    const x = (v.x * 0.5 + 0.5) * size.width
    const y = (-v.y * 0.5 + 0.5) * size.height
    el.style.transform = `translate3d(${Math.min(size.width - 110, Math.max(110, x)).toFixed(1)}px, ${Math.max(150, y).toFixed(1)}px, 0)`
    tick.current -= dt
    if (tick.current > 0) return
    tick.current = 0.12
    const q = el.querySelectorAll<HTMLElement>('[data-f]')
    q.forEach((n) => {
      const f = n.dataset.f
      if (f === 'name') n.textContent = `机柜 ${s.name}`
      else if (f === 'load') n.textContent = `${Math.round(s.load * 100)}%`
      else if (f === 'temp') n.textContent = `${s.temp.toFixed(1)}°C`
      else if (f === 'qps') n.textContent = `${((s.load * 4200) / 1000).toFixed(1)}k`
      else if (f === 'bar') {
        n.style.transform = `scaleX(${Math.min(1, s.load).toFixed(3)})`
        n.style.background = `#${loadColor(s.load, _c2).getHexString()}`
      } else if (f === 'state') n.textContent = s.draining ? '迁出中' : s.load > 0.95 ? '过载' : s.load > 0.8 ? '偏高' : '健康'
    })
    el.dataset.state = s.load > 0.95 ? 'hot' : s.load > 0.8 ? 'warm' : 'ok'
  })
  return null
}

function CursorReset() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const reset = () => (document.body.style.cursor = '')
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [gl])
  return null
}

const Scene = memo(function Scene({ sim, tip, onHover }: { sim: Sim; tip: React.RefObject<HTMLDivElement | null>; onHover: (i: number) => void }) {
  return (
    <>
      <Room sim={sim} />
      <Floor sim={sim} />
      <Racks sim={sim} onHover={onHover} onHit={(i) => sim.inject(i)} />
      <Packets sim={sim} />
      <HeatShimmer sim={sim} />
      <Driver sim={sim} tip={tip} />
      <CursorReset />
    </>
  )
})

/* ------------------------------------------------------------------ stats panel (Motion springs) */
function Stats({ sim }: { sim: Sim }) {
  const qps = useMotionValue(0)
  const avg = useMotionValue(0)
  const qpsS = useSpring(qps, { stiffness: 60, damping: 18 })
  const avgS = useSpring(avg, { stiffness: 60, damping: 18 })
  const qpsText = useTransform(qpsS, (v) => `${(v / 1000).toFixed(1)}k`)
  const avgText = useTransform(avgS, (v) => `${Math.round(v * 100)}%`)
  const barW = useTransform(avgS, (v) => `${Math.min(100, v * 100)}%`)
  const barC = useTransform(avgS, (v) => `#${loadColor(v, new THREE.Color()).getHexString()}`)
  const [racks, setRacks] = useState(BASE_ACTIVE)
  const [spark, setSpark] = useState<number[]>([])
  useEffect(() => {
    const id = setInterval(() => {
      qps.set(sim.qps)
      avg.set(sim.avg)
      setRacks(sim.servingCount())
      setSpark((s) => [...s.slice(-39), sim.qps])
    }, 250)
    return () => clearInterval(id)
  }, [sim, qps, avg])
  const max = Math.max(60000, ...spark)
  const pts = spark.map((v, i) => `${(i / 39) * 100},${(28 - (v / max) * 26).toFixed(1)}`).join(' ')
  return (
    <div className="dc-stats">
      <div className="dc-stat">
        <span>总 QPS</span>
        <motion.b>{qpsText}</motion.b>
        <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="dc-spark" aria-hidden>
          <polyline points={pts} />
        </svg>
      </div>
      <div className="dc-stat">
        <span>平均负载</span>
        <motion.b>{avgText}</motion.b>
        <i className="dc-bar">
          <motion.i style={{ width: barW, background: barC }} />
        </i>
      </div>
      <div className="dc-stat">
        <span>在线机柜</span>
        <b>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.em key={racks} initial={{ y: 10, opacity: 0, filter: 'blur(4px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -10, opacity: 0, filter: 'blur(4px)' }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
              {racks}
            </motion.em>
          </AnimatePresence>
          <small>/{N}</small>
        </b>
        <i className="dc-pips">
          {Array.from({ length: N - BASE_ACTIVE }, (_, k) => (
            <i key={k} data-on={racks > BASE_ACTIVE + k} />
          ))}
        </i>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */
const LEVELS: { value: Level; label: string }[] = [
  { value: 0, label: '低' },
  { value: 1, label: '中' },
  { value: 2, label: '高' },
]

export default function DataCenter() {
  const sim = useMemo(makeSim, [])
  const [level, setLevel] = useState<Level>(1)
  const [hover, setHover] = useState(-1)
  const [events, setEvents] = useState<DCEvent[]>([])
  const [ready, setReady] = useState(false)
  const tip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sim.level = level
  }, [level, sim])

  useEffect(() => {
    sim.onEvent = (e) => {
      setEvents((l) => [...l.slice(-1), e])
      setTimeout(() => setEvents((l) => l.filter((x) => x.id !== e.id)), 4200)
    }
    // poster: a busy moment — one rack running hot, a new rack mid-rise
    if (POSTER) {
      sim.slots[7].burst = 0.75
      sim.slots[7].load = 1.05
      sim.slots[11].want = 1
      sim.slots[11].rise = 0.62
      sim.slots[11].extra = true
    }
    // ambient: traffic waves + an occasional hot spot while idle
    const wave = setInterval(() => {
      if (sim.time - sim.lastUser < 8) return
      sim.waveT = sim.time
    }, 15000)
    const spot = setInterval(() => {
      if (sim.time - sim.lastUser < 8) return
      const pool = sim.slots.filter((x) => x.serving && !x.extra && !x.draining && x.burst < 0.2)
      const pick = pool[Math.floor(Math.random() * pool.length)]
      if (pick) sim.inject(pick.i, 0.72, false)
    }, 12500)
    const first = setTimeout(() => sim.inject(7, 0.75, false), 2600)
    return () => {
      sim.onEvent = null
      clearInterval(wave)
      clearInterval(spot)
      clearTimeout(first)
    }
  }, [sim])

  const onHover = useMemo(
    () => (i: number) => {
      if (sim.hover === i) return
      sim.hover = i
      setHover(i)
      document.body.style.cursor = i >= 0 ? 'pointer' : ''
    },
    [sim],
  )

  const injectTop = () => sim.inject(sim.hottest(), 0.7)

  return (
    <div className="stage dc-root" style={{ background: BG }}>
      <motion.div className="dc-canvas" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: POSTER ? 0 : 0.8 }}>
        <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: false }} onPointerMissed={() => onHover(-1)}>
          <color attach="background" args={[BG]} />
          <IsoRig fit={17.2} mobileFit={12.6} mobileOffsetY={0.1} offset={[0.18, -0.04]} target={[0.6, 0.9, -0.3]} />
          <ambientLight intensity={0.45} color="#9fb4ff" />
          <hemisphereLight args={['#8fb8ff', '#0b0f1a', 0.6]} />
          <directionalLight position={[6, 10, 4]} intensity={1.5} color="#dbe8ff" />
          <directionalLight position={[-6, 4, 8]} intensity={0.45} color="#38d0ff" />
          <Scene sim={sim} tip={tip} onHover={onHover} />
          <Warmup onReady={() => setReady(true)} />
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.6} luminanceSmoothing={0.25} radius={0.6} />
          </EffectComposer>
        </Canvas>
      </motion.div>

      <div className="dc-tip-layer" aria-hidden>
        <AnimatePresence>
          {hover >= 0 && (
            <motion.div
              key="tip"
              className="dc-tip-pos"
              ref={tip}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <motion.div className="dc-tip" initial={{ y: 6, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 32 }}>
                <header>
                  <b data-f="name">机柜 {SLOTS[hover].name}</b>
                  <em data-f="state">健康</em>
                </header>
                <i className="dc-tip-bar">
                  <i data-f="bar" />
                </i>
                <dl>
                  <div>
                    <dt>负载</dt>
                    <dd data-f="load">—</dd>
                  </div>
                  <div>
                    <dt>温度</dt>
                    <dd data-f="temp">—</dd>
                  </div>
                  <div>
                    <dt>QPS</dt>
                    <dd data-f="qps">—</dd>
                  </div>
                </dl>
                <p>点击注入突发流量</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#38d0ff' }} /> Isometric · Infra
          </p>
          <h1>
            机房会
            <br />
            自己扩容
          </h1>
          <p>请求从核心交换机经架空桥架流进机柜（青色），响应原路返回（绿色）。负载升高时机柜转红、冒出热浪；持续过载会有新机柜从地板升起，琥珀色的流量随之迁移过去。</p>
          <Stats sim={sim} />
        </motion.div>

        <div className="dc-events">
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.div
                key={e.id}
                layout
                className="dc-event"
                data-kind={e.kind}
                initial={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              >
                <i /> {e.kind === 'up' ? 'AUTOSCALE' : 'SCALE-IN'}
                <span>{e.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="dock">
          <span className="dc-dock-label">流量</span>
          <Seg
            items={LEVELS}
            value={level}
            onChange={(v) => {
              sim.lastUser = sim.time
              setLevel(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg dc-inject" onClick={injectTop}>
            <span>注入流量</span>
          </button>
        </div>
        <p className="hint">悬停机柜看负载 · 点击机柜制造热点</p>
      </div>

      <style>{`
        .theme-dark .dc-root .scrim { --soft-bg: ${BG}; }
        .dc-canvas { position: absolute; inset: 0; }
        .dc-stats { display: grid; grid-template-columns: repeat(3, auto); gap: 18px; margin-top: 26px; justify-content: start; }
        .dc-stat { display: flex; flex-direction: column; gap: 6px; min-width: 92px; }
        .dc-stat > span { font: 500 11px/1 var(--mono); letter-spacing: .06em; color: var(--fg-2); }
        .dc-stat > b { font: 600 26px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; letter-spacing: -.02em; display: inline-flex; align-items: baseline; }
        .dc-stat > b em { font-style: normal; display: inline-block; }
        .dc-stat > b small { font: 500 13px/1 var(--mono); color: var(--fg-2); margin-left: 2px; }
        .dc-spark { width: 92px; height: 18px; overflow: visible; }
        .dc-spark polyline { fill: none; stroke: #38d0ff; stroke-width: 1.4; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 4px rgba(56,208,255,.6)); }
        .dc-bar { display: block; width: 92px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.1); overflow: hidden; margin-top: 7px; }
        .dc-bar i { display: block; height: 100%; border-radius: 2px; box-shadow: 0 0 8px currentColor; }
        .dc-pips { display: flex; gap: 4px; margin-top: 7px; }
        .dc-pips i { width: 22px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.1); transition: background .4s, box-shadow .4s; }
        .dc-pips i[data-on='true'] { background: #ffb547; box-shadow: 0 0 8px rgba(255,181,71,.7); }
        .dc-dock-label { font: 500 12px/1 var(--mono); color: var(--fg-2); padding: 0 6px 0 12px; }
        .dc-inject { color: #e9f8ff; }
        .dc-inject span::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #38d0ff; box-shadow: 0 0 10px #38d0ff; margin-right: 8px; vertical-align: 1px; }
        .dc-events { position: absolute; right: 24px; top: 84px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
        .dc-event { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px; font: 600 10.5px/1 var(--mono); letter-spacing: .08em; color: #ffcf8a;
          background: rgba(20,16,12,.62); box-shadow: inset 0 0 0 1px rgba(255,181,71,.35), 0 8px 30px -10px rgba(0,0,0,.6); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); white-space: nowrap; }
        .dc-event span { font: 500 13px/1 var(--sans); letter-spacing: 0; color: #f4f2ee; }
        .dc-event i { width: 7px; height: 7px; border-radius: 50%; background: #ffb547; box-shadow: 0 0 10px #ffb547; }
        .dc-event[data-kind='down'] { color: #8ff0dc; box-shadow: inset 0 0 0 1px rgba(94,234,212,.35), 0 8px 30px -10px rgba(0,0,0,.6); background: rgba(10,20,20,.62); }
        .dc-event[data-kind='down'] i { background: #5eead4; box-shadow: 0 0 10px #5eead4; }
        .dc-tip-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .dc-tip-pos { position: absolute; left: 0; top: 0; will-change: transform; }
        .dc-tip { transform-origin: 50% 100%; translate: -50% calc(-100% - 14px); width: 184px; padding: 12px 14px 11px; border-radius: 14px; background: rgba(12,17,28,.78);
          box-shadow: inset 0 0 0 1px rgba(140,190,255,.16), 0 16px 40px -14px rgba(0,0,0,.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #eaf4ff; }
        .dc-tip header { display: flex; justify-content: space-between; align-items: baseline; }
        .dc-tip header b { font: 600 13px/1 var(--sans); }
        .dc-tip header em { font: 500 11px/1 var(--mono); font-style: normal; color: #38d0ff; }
        .dc-tip-pos[data-state='warm'] .dc-tip header em { color: #ffb547; }
        .dc-tip-pos[data-state='hot'] .dc-tip header em { color: #ff4d5e; }
        .dc-tip-pos[data-state='hot'] .dc-tip { box-shadow: inset 0 0 0 1px rgba(255,77,94,.5), 0 0 30px -6px rgba(255,77,94,.35); }
        .dc-tip-bar { display: block; height: 4px; margin: 10px 0 10px; border-radius: 2px; background: rgba(255,255,255,.08); overflow: hidden; }
        .dc-tip-bar i { display: block; height: 100%; width: 100%; transform-origin: 0 50%; transition: transform .25s, background .3s; }
        .dc-tip dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 0; }
        .dc-tip dt { font: 10px/1 var(--sans); color: rgba(220,232,255,.5); margin-bottom: 5px; }
        .dc-tip dd { margin: 0; font: 600 13px/1 var(--mono); font-variant-numeric: tabular-nums; }
        .dc-tip p { margin: 10px 0 0; font: 10.5px/1 var(--sans); color: rgba(220,232,255,.45); }
        @media (max-width: 760px) {
          .dc-root .hero-copy > p:not(.kicker) { display: none; }
          .dc-stats { gap: 14px; margin-top: 16px; }
          .dc-stat { min-width: 0; }
          .dc-stat > b { font-size: 20px; }
          .dc-spark, .dc-bar { width: 72px; }
          .dc-pips i { width: 16px; }
          .dc-events { right: 12px; left: 12px; top: 76px; align-items: stretch; }
          .dc-event span { white-space: normal; }
          .dc-dock-label { display: none; }
        }
      `}</style>
    </div>
  )
}
