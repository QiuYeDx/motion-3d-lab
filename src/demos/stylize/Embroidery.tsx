import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  THREAD_PALETTE,
  createEmbroideryEffect,
  embroideryMeta,
  embroideryModes,
  setEmbroideryDensity,
  setEmbroideryHoop,
  setEmbroideryMode,
  stitchInEmbroidery,
  type EmbroideryMode,
} from './effects/embroidery'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 刺绣针脚 showcase — a koi-and-lotus pond (the classic 苏绣 subject) stretched in an embroidery hoop on a
 * table. Two koi circle under the lily pads, the lotus sways. Flat, saturated colours and one strong key
 * light give every form a clear thread colour + shading band. Fins, pads and petals carry authored
 * normals that fan out from their roots, so the satin stitches run along fin rays and pad veins.
 * The effect (hoop, cloth, stitches) lives in ./effects/embroidery.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760

const DENS = [
  { zh: '疏', v: 1.3 },
  { zh: '中', v: 1 },
  { zh: '密', v: 0.76 },
]

const SPEC: Record<EmbroideryMode, { thread: string; cloth: string }> = {
  satin: { thread: '六股丝光绣线 · 针长 ≤ 4 mm', cloth: '亚麻底布 · 茎针勾边' },
  suzhou: { thread: '劈丝 1/2 股 · 两色交替长短针晕色', cloth: '真丝缎底 · 回针细勾' },
  denim: { thread: '粗棉线 · 针孔明显', cloth: '牛仔布 + 毛毡补丁 · 锁边' },
}

const TABLE = '#e9dfcf'

/** hoop placement in CSS px (shared by the effect and the scene rig) */
function hoopFor(w: number, h: number) {
  if (POSTER) {
    const r = Math.min(h * 0.4, w * 0.36)
    return { x: w / 2, y: h / 2, r }
  }
  if (w < 760) {
    const r = Math.min(w * 0.4, h * 0.26)
    return { x: w / 2, y: 72 + 16 + r + r * 0.075, r }
  }
  const r = Math.min(h * 0.38, w * 0.26)
  return { x: Math.max(w * 0.64, Math.min(w - r * 1.25 - 24, 560 + r)), y: h * 0.53, r }
}

/* ------------------------------------------------------------------ geometry helpers */

const col = (hex: string) => new THREE.Color(hex)

function setColors(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => THREE.Color) {
  const p = geo.attributes.position
  const arr = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i))
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
}

/** flat shape whose normals fan out from `root` — steers the satin direction along rays */
function fanGeometry(shape: THREE.Shape, root: [number, number], k = 0.9, segs = 24) {
  const g = new THREE.ShapeGeometry(shape, segs)
  const p = g.attributes.position
  const n = g.attributes.normal
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - root[0]
    const dy = p.getY(i) - root[1]
    const l = Math.hypot(dx, dy) || 1
    const v = new THREE.Vector3((dx / l) * k, (dy / l) * k, 1).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  return g
}

function koiGeometry(kind: 'kohaku' | 'gold') {
  // radius along the length, tail (-1) → head (+1)
  const prof: [number, number][] = [
    [0.0, -1.0],
    [0.05, -0.95],
    [0.075, -0.8],
    [0.12, -0.55],
    [0.19, -0.25],
    [0.235, 0.05],
    [0.245, 0.3],
    [0.225, 0.55],
    [0.17, 0.78],
    [0.1, 0.93],
    [0.0, 1.0],
  ]
  const curve = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)))
  const pts = curve.getPoints(44).map((v) => new THREE.Vector2(Math.max(v.x, 0), v.y))
  pts[0].x = 0
  pts[pts.length - 1].x = 0
  const g = new THREE.LatheGeometry(pts, 40)
  g.rotateZ(-Math.PI / 2) // length → +x (head)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i)
    p.setZ(i, z * (z > 0 ? 0.8 : 0.5))
  }
  g.computeVertexNormals()
  const white = col('#f8f4ec')
  const red = col('#e8432c')
  const orange = col('#f28a22')
  const pale = col('#fbd08a')
  setColors(g, (x, y, z) => {
    if (kind === 'gold') return z < -0.02 ? pale : x > 0.82 ? pale : orange
    if (z < -0.03) return white
    const n = Math.sin(x * 6.2 + 0.5) * 0.7 + Math.sin(x * 2.1 + y * 9.0) * 0.45 + Math.sin(x * 11.0 - 1.4) * 0.2
    const head = x > 0.6 && x < 0.86 && Math.abs(y) < 0.16
    return head || (x > -0.62 && x < 0.5 && n > 0.12) ? red : white
  })
  return g
}

function petalGeometry(len: number) {
  const g = new THREE.SphereGeometry(1, 22, 16)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const t = (y + 1) / 2
    const w = 0.4 * (1 - 0.55 * Math.pow(Math.max(t - 0.35, 0) / 0.65, 2.2))
    const nx = x * w
    p.setXYZ(i, nx, y + 1, z * 0.11 + nx * nx * 2.2)
  }
  g.scale(len / 2, len / 2, len / 2)
  g.computeVertexNormals()
  // lean the normals toward the tip (and fan them a little) so the satin runs along the petal
  const n = g.attributes.normal
  const q = g.attributes.position
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i), n.getY(i), n.getZ(i)).add(new THREE.Vector3((q.getX(i) / len) * 1.6, 1.1, 0)).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  const base = col('#fdd9e3')
  const tip = col('#e9578a')
  setColors(g, (_x, y) => base.clone().lerp(tip, THREE.MathUtils.smoothstep(y / len, 0.3, 0.95)))
  return g
}

function padGeometry(r: number) {
  const g = new THREE.RingGeometry(r * 0.03, r, 72, 5, 0.35, Math.PI * 2 - 0.42)
  const p = g.attributes.position
  const n = g.attributes.normal
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const rr = Math.hypot(x, y) / r
    p.setZ(i, (1 - rr * rr) * r * 0.08)
    const k = 1.8 * Math.pow(rr, 0.5)
    const v = new THREE.Vector3((x / (rr * r || 1)) * k, (y / (rr * r || 1)) * k, 1).normalize()
    n.setXYZ(i, v.x, v.y, v.z)
  }
  const c0 = col('#b8da6a')
  const c1 = col('#5fa844')
  const c2 = col('#2f7d38')
  setColors(g, (x, y) => {
    const rr = Math.hypot(x, y) / r
    return rr < 0.5 ? c0.clone().lerp(c1, rr / 0.5) : rr < 0.9 ? c1.clone().lerp(c2, (rr - 0.5) / 0.4) : c2
  })
  return g
}

/* ------------------------------------------------------------------ scene */

function Koi({ kind, phase, radius, speed }: { kind: 'kohaku' | 'gold'; phase: number; radius: number; speed: number }) {
  const geo = useMemo(() => koiGeometry(kind), [kind])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo])
  const tail = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(-0.22, 0.24, -0.62, 0.4)
    s.quadraticCurveTo(-0.5, 0.12, -0.44, 0)
    s.quadraticCurveTo(-0.5, -0.12, -0.62, -0.4)
    s.quadraticCurveTo(-0.22, -0.24, 0, 0)
    return fanGeometry(s, [0.05, 0])
  }, [])
  const fin = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.02, 0.2, -0.16, 0.34)
    s.quadraticCurveTo(-0.2, 0.18, -0.12, 0)
    s.quadraticCurveTo(-0.06, -0.02, 0, 0)
    return fanGeometry(s, [-0.04, -0.02])
  }, [])
  const finCol = kind === 'gold' ? '#fbd08a' : '#f6efe4'
  const g = useRef<THREE.Group>(null)
  const tailRef = useRef<THREE.Group>(null)
  const finL = useRef<THREE.Mesh>(null)
  const finR = useRef<THREE.Mesh>(null)
  const t0 = useRef(0)

  const lat = (x: number, t: number) => 0.11 * Math.pow((1 - x) / 2, 1.5) * Math.sin(2.6 * x - t * 5.2)

  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    const p = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3]
      p.setY(i, base[i * 3 + 1] + lat(x, t))
    }
    p.needsUpdate = true
    geo.computeVertexNormals()
    const a = phase + (POSTER ? 4.5 : t) * speed // poster: both koi in open water
    const R = radius + Math.sin(t * 0.37 + phase) * 0.05
    if (g.current) {
      g.current.position.set(Math.cos(a) * R, Math.sin(a) * R, -0.07)
      g.current.rotation.z = a + Math.PI / 2 + Math.sin(t * 2.6) * 0.04
    }
    if (tailRef.current) {
      const slope = (lat(-0.98, t) - lat(-1, t)) / 0.02
      tailRef.current.position.y = lat(-1, t)
      tailRef.current.rotation.z = -Math.atan(slope) * 1.6
    }
    const flap = 0.35 + Math.sin(t * 3.1) * 0.25
    if (finL.current) finL.current.rotation.z = flap
    if (finR.current) finR.current.rotation.z = -flap
  })

  return (
    <group ref={g} scale={0.34}>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </mesh>
      <group ref={tailRef} position={[-0.96, 0, 0]}>
        <mesh geometry={tail}>
          <meshStandardMaterial color={finCol} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group position={[0.42, 0.18, -0.03]}>
        <mesh ref={finL} geometry={fin}>
          <meshStandardMaterial color={finCol} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <group position={[0.42, -0.18, -0.03]} scale={[1, -1, 1]}>
        <mesh ref={finR} geometry={fin}>
          <meshStandardMaterial color={finCol} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0.8, 0.105 * s, 0.07]}>
          <sphereGeometry args={[0.035, 12, 8]} />
          <meshStandardMaterial color="#1d1b1a" roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

const RINGS = [
  { n: 10, len: 0.4, elev: 0.32, off: 0 },
  { n: 8, len: 0.36, elev: 0.78, off: 0.39 },
  { n: 5, len: 0.26, elev: 1.0, off: 0.2 },
]

function Lotus() {
  const geos = useMemo(() => RINGS.map((r) => petalGeometry(r.len)), [])
  const bud = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 20, 16)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      const k = y > 0 ? 1 - 0.75 * Math.pow(y, 2) : 1
      p.setXYZ(i, p.getX(i) * k * 0.55, y, p.getZ(i) * k * 0.55)
    }
    g.computeVertexNormals()
    const a = col('#fbe3ea')
    const b = col('#e65a8b')
    setColors(g, (_x, y) => a.clone().lerp(b, THREE.MathUtils.smoothstep(y, -0.4, 0.9)))
    return g
  }, [])
  const petals = useRef<(THREE.Mesh | null)[]>([])
  const flower = useRef<THREE.Group>(null)
  const budRef = useRef<THREE.Group>(null)
  const t0 = useRef(POSTER ? 4 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    if (flower.current) flower.current.rotation.set(Math.sin(t * 0.7) * 0.06, Math.sin(t * 0.53 + 1) * 0.06, Math.sin(t * 0.2) * 0.08)
    let k = 0
    RINGS.forEach((r, ri) => {
      for (let i = 0; i < r.n; i++) {
        const m = petals.current[k++]
        if (m) m.rotation.x = r.elev + Math.sin(t * 1.3 + i * 1.7 + ri) * 0.05
      }
    })
    if (budRef.current) budRef.current.rotation.set(0.5 + Math.sin(t * 0.9) * 0.06, Math.sin(t * 0.6) * 0.08, 0)
  })
  let k = 0
  return (
    <>
      <group ref={flower} position={[0.04, 0.08, 0.04]} scale={1.18}>
        {RINGS.map((r, ri) =>
          Array.from({ length: r.n }, (_, i) => {
            const idx = k++
            return (
              <group key={`${ri}-${i}`} rotation={[0, 0, (i / r.n) * Math.PI * 2 + r.off]}>
                <mesh
                  ref={(m) => {
                    petals.current[idx] = m
                  }}
                  geometry={geos[ri]}
                  rotation={[r.elev, 0, 0]}
                >
                  <meshStandardMaterial vertexColors roughness={0.55} side={THREE.DoubleSide} />
                </mesh>
              </group>
            )
          }),
        )}
        <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.07, 0.08, 32]} />
          <meshStandardMaterial color="#d3cf3e" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, 0.11]}>
          <torusGeometry args={[0.105, 0.028, 10, 32]} />
          <meshStandardMaterial color="#f8c22e" roughness={0.6} />
        </mesh>
      </group>
      {/* a bud on its stem */}
      <group position={[-0.66, -0.3, 0]}>
        <group ref={budRef}>
          <mesh position={[0, 0.0, 0.17]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.016, 0.02, 0.34, 10]} />
            <meshStandardMaterial color="#4f9a3c" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.42]} rotation={[Math.PI / 2, 0, 0]} scale={0.17} geometry={bud}>
            <meshStandardMaterial vertexColors roughness={0.55} />
          </mesh>
        </group>
      </group>
    </>
  )
}

const PADS: [number, number, number, number][] = [
  [-0.68, 0.42, 0.27, 0.6],
  [0.72, -0.4, 0.29, 2.2],
  [0.56, 0.68, 0.17, 4.0],
  [-0.24, -0.86, 0.15, 5.3],
]

function Pads() {
  const geos = useMemo(() => PADS.map(([, , r]) => padGeometry(r)), [])
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const t0 = useRef(POSTER ? 4 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    refs.current.forEach((m, i) => {
      if (!m) return
      m.rotation.set(Math.sin(t * 0.8 + i) * 0.05, Math.cos(t * 0.7 + i * 2) * 0.05, PADS[i][3] + Math.sin(t * 0.25 + i) * 0.06)
    })
  })
  return (
    <>
      {PADS.map(([x, y], i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          geometry={geos[i]}
          position={[x, y, 0.0]}
        >
          <meshStandardMaterial vertexColors roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

function Pond({ ry, rx }: { ry: MotionValue<number>; rx: MotionValue<number> }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const rig = useRef<THREE.Group>(null)
  const yaw = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const t0 = useRef(0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    const h = hoopFor(size.width, size.height)
    if (rig.current) {
      rig.current.position.set((h.x / size.width - 0.5) * viewport.width, (0.5 - h.y / size.height) * viewport.height, 0)
      rig.current.scale.setScalar(((h.r / size.width) * viewport.width) / 1.12)
    }
    if (yaw.current) yaw.current.rotation.y = ry.get() + (POSTER ? 0 : Math.sin(t * 0.22) * 0.12)
    if (tilt.current) tilt.current.rotation.x = -0.45 + rx.get()
  })
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#fff6ee', '#e9e2ff', 0.7]} />
      <directionalLight position={[-3, 4, 6]} intensity={2.5} />
      <directionalLight position={[4, -3, 2]} intensity={0.35} />
      <group ref={rig}>
        <group ref={yaw}>
          <group ref={tilt}>
            <Pads />
            <Lotus />
            <Koi kind="kohaku" phase={0.3} radius={0.64} speed={0.3} />
            <Koi kind="gold" phase={Math.PI * 1.1} radius={0.6} speed={0.3} />
          </group>
        </group>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Embroidery() {
  const [mode, setMode] = useState<EmbroideryMode>('satin')
  const [dens, setDens] = useState(1)
  const [mobile] = useState(MOBILE)
  const fx = useMemo(() => createEmbroideryEffect(), [])
  const original = useMemo(createOriginalEffect, [])
  // start the shader's background compile from an effect (before the first frame), so it is compiled for
  // the screen; the in-frame isReady() path compiles it while a render target is bound (linear-output
  // variant), which then forces a second, blocking compile at the first real draw
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      if (!POSTER) stitchInEmbroidery(fx, 3.2)
      return
    }
    setEmbroideryMode(fx, mode)
  }, [fx, mode])
  useEffect(() => setEmbroideryDensity(fx, DENS[dens].v), [fx, dens])
  useEffect(() => {
    const on = () => setEmbroideryHoop(fx, hoopFor(window.innerWidth, window.innerHeight))
    on()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [fx])

  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    ry.set(THREE.MathUtils.clamp(ry.get() + (e.clientX - d.x) * 0.006, -1.1, 1.1))
    rx.set(THREE.MathUtils.clamp(rx.get() + (e.clientY - d.y) * 0.004, -0.5, 0.5))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    anims.current = [
      // the hoop swings back to face you after the throw
      animate(ry, 0, { type: 'spring', velocity: ry.getVelocity(), stiffness: 26, damping: 7 }),
      animate(rx, 0, { type: 'spring', velocity: rx.getVelocity(), stiffness: 40, damping: 9 }),
    ]
  }

  const I = SPEC[mode]
  const label = embroideryModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage emb${split.open ? ' emb-split' : ''}`}
      style={{ background: TABLE }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 0, 12], fov: 30 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={embroideryMeta.background} preload={preload} />
        <Pond rx={rx} ry={ry} />
      </Canvas>

      <div className="overlay">
        <div className="hero-copy emb-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Embroidery · {THREAD_PALETTE.length} 色绣线
            </p>
            <h1>
              一针一线，
              <br />
              绣在布上
            </h1>
            <p className="emb-sub">
              画面先按绣线色卡分区，再一针一针铺满：缎面针沿形体走向排线，长区拆成长短针，丝线的捻度高光随光流动；轮廓用深色线勾边。
            </p>
            <div className="emb-spec">
              <div className="emb-card" aria-hidden>
                {THREAD_PALETTE.map((p, i) => (
                  <i key={p.hex} style={{ background: p.hex, marginLeft: i > 0 && THREAD_PALETTE[i - 1].fam !== p.fam ? 5 : 0 }} />
                ))}
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <p>
                    {I.thread}
                    <br />
                    {I.cloth}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={embroideryModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {mobile ? (
            <button className="seg emb-cycle" onClick={() => setDens((d) => (d + 1) % DENS.length)}>
              <span>
                针脚 <b>{DENS[dens].zh}</b>
              </span>
            </button>
          ) : (
            <Seg items={DENS.map((d, i) => ({ value: i, label: d.zh }))} value={dens} onChange={setDens} />
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="emb-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转动绣绷 · 切换绣法会重新穿针</p>
      </div>
    </div>
  )
}

const css = `
.emb { cursor: grab; touch-action: none; }
.emb:active { cursor: grabbing; }
.emb canvas { display: block; }
.emb-copy { pointer-events: none !important; }
.emb .hint { transition: opacity .4s; }
.emb-split .hint { opacity: 0; }
.emb-copy .scrim { --soft-bg: ${TABLE}; left: -200px; right: -120px; height: 760px; }
.emb-copy .kicker i { background: #c8344a; }
.emb-copy h1 { font-size: clamp(38px, 4.4vw, 60px); }
.emb-sub { max-width: 400px; }
.emb-spec { margin-top: 24px; min-height: 74px; }
.emb-card { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; max-width: 460px; }
.emb-card i {
  width: 9px; height: 16px; border-radius: 2px;
  background-image: repeating-linear-gradient(115deg, rgba(255,255,255,.28) 0 1px, transparent 1px 3px) !important;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.1), inset 0 -3px 4px rgba(0,0,0,.12);
}
.emb-spec p { margin: 12px 0 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }
.emb-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.emb-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .emb-copy { transition: opacity .4s; }
  .emb-split .emb-copy { opacity: 0; }
  .emb-sub { display: none; }
  .emb-copy h1 { font-size: 34px; }
  .emb-spec { margin-top: 12px; min-height: 0; }
  .emb-card { max-width: 320px; }
  .emb-card i { width: 7px; height: 12px; }
  .emb .dock .seg { padding: 0 8px; }
  .emb .dock .dock-sep { margin: 0 1px; }
}
`
