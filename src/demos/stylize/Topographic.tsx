import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import {
  TOPO_RAMP,
  createTopoEffect,
  setTopoDatum,
  setTopoGrid,
  setTopoInterval,
  setTopoMode,
  topoMeta,
  topoModes,
  type TopoMode,
} from './effects/topo'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'

/*
 * 等高线地图 showcase — a procedural volcanic island (warped fBm + ridges, two summits, a caldera-ish
 * saddle) cut at sea level, with a lighthouse on a headland and a fishing boat circling offshore. The camera
 * orbits slowly at a steep angle; the page hands the effect the sea-level plane in view space each frame, so
 * elevation is the true height above the sea and the contours stay glued to the terrain while it turns.
 * The map furniture (neatline with graticule ticks, scale bar, north arrow following the orbit, legend and
 * feature names) is DOM. The effect itself lives in ./effects/topo.ts.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const BG = topoMeta.background
const GRID = MOBILE ? 96 : 128
const MPU = 640 // map metres per world unit
const INTERVALS = [
  { zh: '25 m', m: 25 },
  { zh: '50 m', m: 50 },
  { zh: '100 m', m: 100 },
]

const SPEC: Record<TopoMode, string> = {
  terrain: '分层设色 + 晕渲 · 棕色等高线 · 蓝色海岸线',
  line: '只留线条 · 计曲线加粗 · 留白即海',
  glow: '青色辉光 · 扫描线周期刷新',
}

/* ------------------------------------------------------------------ terrain */

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y)
  const fx = x - ix,
    fy = y - iy
  const ux = fx * fx * (3 - 2 * fx),
    uy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy),
    b = hash(ix + 1, iy),
    c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0,
    a = 0.5,
    f = 1
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f)
    f *= 2.03
    a *= 0.5
  }
  return s
}
function ridged(x: number, y: number) {
  let s = 0,
    a = 0.55,
    f = 1
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1)
    s += a * n * n
    f *= 2.1
    a *= 0.5
  }
  return s
}
const gauss = (x: number, z: number, cx: number, cz: number, r: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r))

/** island height (world units), sea level at 0 */
function heightAt(x: number, z: number) {
  const wx = x + (fbm(x * 0.3 + 7, z * 0.3) - 0.5) * 2.2
  const wz = z + (fbm(x * 0.3, z * 0.3 + 3) - 0.5) * 2.2
  const r = Math.hypot(wx / 4.3, wz / 3.3) + (fbm(x * 0.95 + 11, z * 0.95 - 5) - 0.5) * 0.42
  const mask = 1 - THREE.MathUtils.smoothstep(r, 0.25, 1.0)
  const peaks = gauss(x, z, 0.9, -0.45, 1.45) * 1.05 + gauss(x, z, -1.6, 0.85, 1.15) * 0.62 - gauss(x, z, -0.35, 0.2, 0.5) * 0.2
  const rid = ridged(x * 0.5 + 4, z * 0.5 - 2)
  return mask * (0.3 + fbm(x * 0.6 + 1.3, z * 0.6) * 0.45 + rid * 0.62 * mask + peaks) - 0.3
}

const PEAK = new THREE.Vector3()
const LIGHTHOUSE = new THREE.Vector3()

/** grid of triangles clipped at sea level (so the coastline is smooth); normals and colours per grid vertex */
function islandGeometry() {
  const N = MOBILE ? 150 : 200
  const S = 9.4
  const e = S / N
  const R1 = N + 1
  const H = new Float32Array(R1 * R1)
  let peak = 0
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const x = (i / N - 0.5) * S,
        z = (j / N - 0.5) * S
      const h = heightAt(x, z)
      H[j * R1 + i] = h
      if (h > H[peak]) peak = j * R1 + i
    }
  PEAK.set(((peak % R1) / N - 0.5) * S, H[peak], (Math.floor(peak / R1) / N - 0.5) * S)
  const pos: number[] = []
  const nrm: number[] = []
  const col: number[] = []
  const sand = new THREE.Color('#e3d3a4'),
    grass = new THREE.Color('#6f9a4e'),
    forest = new THREE.Color('#3f6f3a'),
    rock = new THREE.Color('#8a7a68'),
    snow = new THREE.Color('#f2efe8')
  const c = new THREE.Color()
  const v = new THREE.Vector3()
  const at = (i: number, j: number) => H[Math.min(N, Math.max(0, j)) * R1 + Math.min(N, Math.max(0, i))]
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const y = at(i, j)
      pos.push((i / N - 0.5) * S, y, (j / N - 0.5) * S)
      v.set(at(i - 1, j) - at(i + 1, j), 2 * e, at(i, j - 1) - at(i, j + 1)).normalize()
      nrm.push(v.x, v.y, v.z)
      const slope = 1 - v.y
      if (y < 0.06) c.copy(sand)
      else if (y < 0.55) c.copy(grass).lerp(forest, THREE.MathUtils.smoothstep(y, 0.1, 0.5))
      else c.copy(forest).lerp(rock, THREE.MathUtils.smoothstep(y, 0.55, 1.1))
      c.lerp(rock, THREE.MathUtils.smoothstep(slope, 0.25, 0.5) * 0.7)
      if (y > 1.35) c.lerp(snow, THREE.MathUtils.smoothstep(y, 1.35, 1.55))
      col.push(c.r, c.g, c.b)
    }
  const idx: number[] = []
  // a new vertex on the coastline between grid vertices a (above) and b (below)
  const cut = (a: number, b: number) => {
    const t = H[a] / (H[a] - H[b])
    for (const arr of [pos, nrm, col]) for (let k = 0; k < 3; k++) arr.push(arr[a * 3 + k] + (arr[b * 3 + k] - arr[a * 3 + k]) * t)
    const n = pos.length / 3 - 1
    pos[n * 3 + 1] = 0
    return n
  }
  const tri = (a: number, b: number, d: number) => {
    const vs = [a, b, d]
    const up = vs.map((k) => H[k] >= 0)
    const n = up.filter(Boolean).length
    if (n === 0) return
    if (n === 3) return void idx.push(a, b, d)
    const k = up.findIndex((u) => (n === 1 ? u : !u))
    const A = vs[k],
      B = vs[(k + 1) % 3],
      C = vs[(k + 2) % 3]
    if (n === 1) idx.push(A, cut(A, B), cut(A, C))
    else {
      const ab = cut(B, A),
        ac = cut(C, A)
      idx.push(ab, B, C, ab, C, ac)
    }
  }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = j * R1 + i,
        b = a + 1,
        cc = a + R1 + 1,
        d = a + R1
      if (Math.max(H[a], H[b], H[cc], H[d]) < 0) continue
      tri(a, d, cc)
      tri(a, cc, b)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  // a headland for the lighthouse: walk in from the sea along a bearing until there is land
  for (let r = 4.6; r > 0; r -= 0.02) {
    const x = Math.cos(-0.5) * r,
      z = Math.sin(-0.5) * r * 0.9 + 1.2
    const y = heightAt(x, z)
    if (y > 0.04) {
      LIGHTHOUSE.set(x, y, z)
      break
    }
  }
  return g
}

function Lighthouse() {
  const lamp = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    if (lamp.current) lamp.current.emissiveIntensity = 0.8 + Math.max(0, Math.sin(clock.elapsedTime * 2.4)) * 1.6
  })
  const bands = [0, 1, 2, 3]
  return (
    <group position={LIGHTHOUSE} scale={0.95}>
      {bands.map((i) => (
        <mesh key={i} position={[0, 0.06 + i * 0.09, 0]}>
          <cylinderGeometry args={[0.062 - i * 0.006 - 0.006, 0.062 - i * 0.006, 0.09, 20]} />
          <meshStandardMaterial color={i % 2 ? '#f4f1ea' : '#c8372d'} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 20]} />
        <meshStandardMaterial color="#2a2a2e" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.47, 0]}>
        <cylinderGeometry args={[0.032, 0.032, 0.08, 16]} />
        <meshStandardMaterial ref={lamp} color="#fff4c8" emissive="#ffcf6a" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0, 0.54, 0]}>
        <coneGeometry args={[0.045, 0.07, 16]} />
        <meshStandardMaterial color="#c8372d" roughness={0.5} />
      </mesh>
    </group>
  )
}

function Boat() {
  const g = useRef<THREE.Group>(null)
  const hull = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(-0.2, 0.03)
    s.lineTo(0.2, 0.03)
    s.quadraticCurveTo(0.17, -0.05, 0.06, -0.06)
    s.lineTo(-0.16, -0.06)
    s.quadraticCurveTo(-0.2, -0.03, -0.2, 0.03)
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false })
    geo.translate(0, 0, -0.05)
    return geo
  }, [])
  const sail = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0, 0, 0.32, 0, 0.15, 0.05, 0], 3))
    geo.computeVertexNormals()
    return geo
  }, [])
  const t0 = useRef(POSTER ? 3 : 0)
  useFrame((_, raw) => {
    t0.current += Math.min(raw, 1 / 30)
    const t = t0.current
    const a = 2.2 + t * 0.035
    if (g.current) {
      g.current.position.set(Math.cos(a) * 4.15, 0.02 + Math.sin(t * 1.3) * 0.012, Math.sin(a) * 3.7)
      g.current.rotation.set(Math.sin(t * 1.1) * 0.06, -a - Math.PI / 2, Math.sin(t * 0.9) * 0.05)
    }
  })
  return (
    <group ref={g} scale={1.2}>
      <mesh geometry={hull}>
        <meshStandardMaterial color="#7a3b24" roughness={0.6} />
      </mesh>
      <mesh position={[-0.02, 0.17, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.3, 6]} />
        <meshStandardMaterial color="#3a2a20" />
      </mesh>
      <mesh geometry={sail} position={[-0.015, 0, 0]}>
        <meshStandardMaterial color="#f3ead4" roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

type Feature = { el: HTMLDivElement | null }

function Island({
  az,
  tilt,
  fx,
  labels,
  north,
}: {
  az: MotionValue<number>
  tilt: MotionValue<number>
  fx: ReturnType<typeof createTopoEffect>
  labels: { peak: Feature; light: Feature; boat: Feature }
  north: { el: HTMLDivElement | null }
}) {
  // build the terrain a few frames after mount (not in the frame that creates the WebGL context)
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  useEffect(() => {
    let g: THREE.BufferGeometry | null = null
    const id = setTimeout(() => {
      g = islandGeometry()
      setGeo(g)
    }, 60)
    return () => {
      clearTimeout(id)
      g?.dispose()
    }
  }, [])
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const root = useRef<THREE.Group>(null)
  const boatRef = useRef<THREE.Group>(null)
  // compile in parallel a frame after the context exists; show the island once linked
  useLayoutEffect(() => {
    const g = root.current
    if (!g || !geo) return
    let alive = true
    g.visible = false
    const r = requestAnimationFrame(() => {
      const grp = root.current
      if (!alive || !grp) return
      grp.visible = true
      gl.compileAsync(grp, camera, scene)
        .catch(() => {})
        .then(() => {
          if (alive && root.current) root.current.visible = true
        })
      grp.visible = false
    })
    return () => {
      alive = false
      cancelAnimationFrame(r)
    }
  }, [gl, camera, scene, geo])

  const M = useMemo(
    () => ({ plane: new THREE.Vector4(), n: new THREE.Vector3(), o: new THREE.Vector3(), v: new THREE.Vector3(), bw: new THREE.Vector3() }),
    [],
  )
  const t0 = useRef(POSTER ? 14 : 0)
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    t0.current += dt
    const a = az.get() + t0.current * 0.045
    const el = THREE.MathUtils.degToRad(POSTER ? 54 : 52) + tilt.get()
    const R = POSTER ? 13.5 : MOBILE ? 36 : 16.2
    camera.position.set(Math.sin(a) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(a) * Math.cos(el) * R)
    camera.lookAt(0, 0.15, 0)
    // shift the island right of the copy (desktop) / up (phone) with a view offset
    const W = size.width,
      H = size.height
    const dx = POSTER ? 0 : MOBILE ? 0 : Math.min(W * 0.17, 280)
    const dy = POSTER ? 0 : MOBILE ? H * 0.17 : 6
    camera.setViewOffset(W, H, -dx, dy, W, H)
    camera.updateMatrixWorld()
    // sea level as a view-space plane
    M.n.set(0, 1, 0).transformDirection(camera.matrixWorldInverse)
    M.o.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse)
    M.plane.set(M.n.x, M.n.y, M.n.z, -M.n.dot(M.o))
    setTopoDatum(fx, { plane: M.plane, proj: camera.projectionMatrix, metresPerUnit: MPU, relief: 1200 })

    // DOM: feature names + north arrow
    const place = (f: Feature, p: THREE.Vector3, oy: number) => {
      if (!f.el) return
      M.v.copy(p).project(camera)
      const x = (M.v.x * 0.5 + 0.5) * W,
        y = (-M.v.y * 0.5 + 0.5) * H + oy
      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
    place(labels.peak, PEAK, -12)
    place(labels.light, M.bw.copy(LIGHTHOUSE).setY(LIGHTHOUSE.y + 0.62), -4)
    if (boatRef.current) {
      const b = boatRef.current.children[0]
      if (b) place(labels.boat, M.bw.setFromMatrixPosition(b.matrixWorld).setY(0.45), -4)
    }
    if (north.el) north.el.style.transform = `rotate(${THREE.MathUtils.radToDeg(a).toFixed(1)}deg)`
  })
  return (
    <>
      <hemisphereLight args={['#fff6e8', '#4f5866', 0.7]} />
      <directionalLight position={[-6, 9, 4]} intensity={2.6} />
      <group ref={root}>
        {geo && (
          <>
            <mesh geometry={geo}>
              <meshStandardMaterial vertexColors roughness={0.9} />
            </mesh>
            <Lighthouse />
            <group ref={boatRef}>
              <Boat />
            </group>
          </>
        )}
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ map furniture (DOM) */

const fmtDeg = (d: number, hemi: string) => {
  const deg = Math.floor(d)
  const min = Math.round((d - deg) * 60)
  return `${deg}°${String(min).padStart(2, '0')}′${hemi}`
}

function Neatline({ dark }: { dark: boolean }) {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const inset = MOBILE ? { t: 70, r: 10, b: 10, l: 10 } : { t: 76, r: 22, b: 22, l: 22 }
  const xs: { x: number; k: number }[] = []
  const ys: { y: number; k: number }[] = []
  for (let k = -12; k <= 12; k++) {
    const x = vp.w / 2 + k * GRID
    if (x > inset.l + 30 && x < vp.w - inset.r - 30) xs.push({ x, k })
    const y = vp.h / 2 + k * GRID
    if (y > inset.t + 26 && y < vp.h - inset.b - 26) ys.push({ y, k })
  }
  const lon0 = 121.6,
    lat0 = 24.45,
    step = 2 / 60
  return (
    <div className={`tp-neat${dark ? ' dark' : ''}`} style={{ top: inset.t, right: inset.r, bottom: inset.b, left: inset.l }} aria-hidden>
      {xs.map(({ x, k }) => (
        <span key={'x' + k} className="tp-tick x" style={{ left: x - inset.l }}>
          {k % 2 === 0 && <b>{fmtDeg(lon0 + k * step, 'E')}</b>}
        </span>
      ))}
      {ys.map(({ y, k }) => (
        <span key={'y' + k} className="tp-tick y" style={{ top: y - inset.t }}>
          {k % 2 === 0 && <b>{fmtDeg(lat0 - k * step, 'N')}</b>}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function Topographic() {
  const [mode, setMode] = useState<TopoMode>('terrain')
  const [iv, setIv] = useState(1)
  const fx = useMemo(() => createTopoEffect({ interval: 50 }), [])
  const original = useMemo(createOriginalEffect, [])
  const preload = useMemo(() => [fx], [fx])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  useEffect(() => setTopoMode(fx, mode), [fx, mode])
  useEffect(() => setTopoInterval(fx, INTERVALS[iv].m), [fx, iv])
  useEffect(() => setTopoGrid(fx, GRID), [fx])

  const labels = useRef({ peak: { el: null }, light: { el: null }, boat: { el: null } } as { peak: Feature; light: Feature; boat: Feature }).current
  const north = useRef({ el: null as HTMLDivElement | null }).current

  // drag: orbit (x) + tilt (y), with inertia; the slow auto orbit keeps running underneath
  const az = useMotionValue(0)
  const tilt = useMotionValue(0)
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
    az.set(az.get() - (e.clientX - d.x) * 0.006)
    tilt.set(THREE.MathUtils.clamp(tilt.get() + (e.clientY - d.y) * 0.003, -0.3, 0.42))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    const v = az.getVelocity()
    anims.current = [
      animate(az, az.get() + v * 0.35, { type: 'spring', velocity: v, stiffness: 26, damping: 12 }),
      animate(tilt, 0, { type: 'spring', velocity: tilt.getVelocity(), stiffness: 40, damping: 10 }),
    ]
  }

  const dark = mode === 'glow' && !split.open
  const label = topoModes.find((m) => m.id === mode)!.label
  const step = INTERVALS[iv].m

  return (
    <div
      className={`stage tp tp-${mode}${dark ? ' tp-dark' : ''}${split.open ? ' tp-split' : ''}`}
      style={{ background: dark ? '#05090f' : BG }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: false }} camera={{ position: [0, 10, 10], fov: 30, near: 0.5, far: 60 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={BG} preload={preload} />
        <Island az={az} tilt={tilt} fx={fx} labels={labels} north={north} />
      </Canvas>

      <div className="overlay">
        <Neatline dark={dark} />
        <div className="tp-feature peak" ref={(el) => void (labels.peak.el = el)}>
          <span>▲ 鹰嘴峰</span>
        </div>
        <div className="tp-feature light" ref={(el) => void (labels.light.el = el)}>
          <span>灯塔</span>
        </div>
        <div className="tp-feature boat" ref={(el) => void (labels.boat.el = el)}>
          <span>渔船</span>
        </div>

        <div className="hero-copy tp-copy">
          <div className="scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Topographic · 1 : 50 000
            </p>
            <h1>
              把深度
              <br />
              画成地形图
            </h1>
            <p className="tp-sub">
              深度缓冲被读成海拔：每隔一个等高距画一条首曲线，每五条加粗成计曲线并沿线标注高程；再叠上晕渲山影和分层设色。镜头绕岛慢慢转，等高线始终贴在山上。
            </p>
            <div className="tp-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.p
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  {SPEC[mode]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="tp-legend">
          <AnimatePresence initial={false}>
            {mode === 'terrain' && (
              <motion.div
                className="tp-ramp-wrap"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              >
                <div className="tp-ramp" style={{ background: `linear-gradient(90deg, ${TOPO_RAMP.join(', ')})` }} />
                <div className="tp-ramp-ticks">
                  <span>0</span>
                  <span>300</span>
                  <span>600</span>
                  <span>900</span>
                  <span>1200 m</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="tp-keys">
            <span>
              <i className="k-minor" />
              首曲线 {step} m
            </span>
            <span>
              <i className="k-index" />
              计曲线 {step * 5} m
            </span>
            <span>
              <i className="k-coast" />
              海岸线
            </span>
          </div>
        </div>

        <div className="tp-compass">
          <div className="tp-north" ref={(el) => void (north.el = el)}>
            <svg width="34" height="34" viewBox="-17 -17 34 34" aria-hidden>
              <circle r="15.5" fill="none" stroke="currentColor" strokeOpacity=".35" />
              <path d="M0 -13 L5 3 L0 0 L-5 3 Z" fill="currentColor" />
              <path d="M0 13 L5 3 L0 0 L-5 3 Z" fill="currentColor" fillOpacity=".3" />
            </svg>
            <b>N</b>
          </div>
          <div className="tp-scale">
            <div className="tp-bar">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="tp-bar-l">
              <span>0</span>
              <span>1</span>
              <span>2 km</span>
            </div>
          </div>
        </div>

        <OriginalSplit split={split} label={label} />

        <div className="dock">
          <Seg items={topoModes.map((m) => ({ value: m.id, label: m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg tp-cycle" onClick={() => setIv((d) => (d + 1) % INTERVALS.length)}>
              <span>
                等高距 <b>{INTERVALS[iv].zh}</b>
              </span>
            </button>
          ) : (
            <>
              <span className="tp-lbl">等高距</span>
              <Seg items={INTERVALS.map((d, i) => ({ value: i, label: d.zh }))} value={iv} onChange={setIv} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="tp-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动绕岛旋转 · 上下拖改变俯角</p>
      </div>
    </div>
  )
}

const css = `
.tp { cursor: grab; touch-action: none; transition: background .5s; }
.tp:active { cursor: grabbing; }
.tp canvas { display: block; }
.tp-dark { --fg: #e6f7fb; --fg-2: rgba(214, 240, 248, .66); --glass: rgba(14, 26, 34, .6); --glass-line: rgba(140, 230, 255, .14); }
.tp-copy { pointer-events: none !important; }
.tp .hint { transition: opacity .4s; }
.tp-split .hint { opacity: 0; }
.tp-copy .scrim { --soft-bg: #c6dfe7; left: -200px; right: -120px; height: 720px; transition: opacity .5s; }
.tp-dark .tp-copy .scrim { --soft-bg: #05090f; }
.tp-line .tp-copy .scrim { --soft-bg: #f8f6f1; }
.tp-copy .kicker i { background: #9a6233; box-shadow: 0 0 10px rgba(154, 98, 51, .5); }
.tp-dark .tp-copy .kicker i { background: #39e3ff; box-shadow: 0 0 12px #39e3ff; }
.tp-copy h1 { font-size: clamp(40px, 4.6vw, 62px); }
.tp-sub { max-width: 400px; }
.tp-spec { margin-top: 20px; min-height: 24px; }
.tp-spec p { margin: 0; font: 500 12px/1.6 var(--mono); color: var(--fg-2); }

.tp-neat { position: absolute; pointer-events: none; border: 1px solid rgba(60, 50, 40, .55); box-shadow: inset 0 0 0 3px rgba(244, 239, 226, .0), inset 0 0 0 4px rgba(60, 50, 40, .35); }
.tp-neat.dark { border-color: rgba(110, 220, 255, .38); box-shadow: inset 0 0 0 4px rgba(110, 220, 255, .12); }
.tp-tick { position: absolute; }
.tp-tick.x { top: 0; bottom: 0; width: 0; }
.tp-tick.x::before, .tp-tick.x::after { content: ''; position: absolute; left: -.5px; width: 1px; height: 7px; background: currentColor; opacity: .55; }
.tp-tick.x::before { top: 0; } .tp-tick.x::after { bottom: 0; }
.tp-tick.y { left: 0; right: 0; height: 0; }
.tp-tick.y::before, .tp-tick.y::after { content: ''; position: absolute; top: -.5px; height: 1px; width: 7px; background: currentColor; opacity: .55; }
.tp-tick.y::before { left: 0; } .tp-tick.y::after { right: 0; }
.tp-tick b { position: absolute; font: 500 9.5px/1 var(--mono); letter-spacing: .02em; color: var(--fg-2); white-space: nowrap; }
.tp-tick.x b { top: 10px; transform: translateX(-50%); }
.tp-tick.y b { right: 10px; transform: translateY(-50%); }
.tp-neat { color: #4a3d30; }
.tp-neat.dark { color: #7fe6ff; }

.tp-feature { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
.tp-feature span { position: absolute; transform: translate(-50%, -100%); white-space: nowrap; font: 600 11.5px/1 var(--sans); letter-spacing: .08em; color: #3a2a1c; text-shadow: 0 0 3px #f4efe2, 0 0 3px #f4efe2, 0 0 6px #f4efe2; }
.tp-feature.boat span, .tp-feature.light span { font: italic 500 11.5px/1 Georgia, 'Songti SC', serif; color: #1f4f78; }
.tp-dark .tp-feature span { color: #b9f3ff; text-shadow: 0 0 6px rgba(0, 0, 0, .9), 0 0 2px #000; }
.tp-split .tp-feature, .tp-split .tp-legend, .tp-split .tp-compass { opacity: 0; }
.tp-feature, .tp-legend, .tp-compass { transition: opacity .35s; }

.tp-legend { position: absolute; left: clamp(24px, 6vw, 96px); bottom: 44px; width: 250px; pointer-events: none; font: 500 11px/1.3 var(--sans); color: var(--fg-2); }
.tp-ramp-wrap { overflow: hidden; }
.tp-ramp { height: 9px; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
.tp-ramp-ticks { display: flex; justify-content: space-between; margin: 5px 0 10px; font: 500 10px/1 var(--mono); }
.tp-keys { display: flex; gap: 14px; flex-wrap: wrap; }
.tp-keys span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.tp-keys i { display: inline-block; width: 22px; height: 0; border-top: 1px solid #9a6233; }
.tp-keys i.k-index { border-top-width: 2px; border-color: #7e4f28; }
.tp-keys i.k-coast { border-top: 1.5px solid #33709e; }
.tp-line .tp-keys i { border-color: #1b1b1d; }
.tp-dark .tp-keys i { border-color: #39e3ff; box-shadow: 0 0 6px #39e3ff; }
.tp-dark .tp-keys i.k-coast { border-color: #b3f5ff; }

.tp-compass { position: absolute; right: 44px; top: 96px; display: flex; align-items: center; gap: 16px; pointer-events: none; color: #3d3024; }
.tp-dark .tp-compass { color: #8ee9ff; }
.tp-north { position: relative; width: 34px; height: 34px; }
.tp-north b { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); font: 700 10px/1 var(--mono); }
.tp-scale { font: 500 10px/1 var(--mono); }
.tp-bar { display: flex; width: 120px; height: 5px; border: 1px solid currentColor; }
.tp-bar i { flex: 1; }
.tp-bar i:nth-child(odd) { background: currentColor; }
.tp-bar-l { display: flex; justify-content: space-between; width: 136px; margin: 4px 0 0 -4px; }
.tp-lbl { font: 500 12px/1 var(--sans); color: var(--fg-2); margin: 0 4px 0 6px; }
.tp-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.tp-cycle b { font-weight: 600; color: var(--fg); }
@media (max-width: 760px) {
  .tp-copy { transition: opacity .4s; }
  .tp-split .tp-copy { opacity: 0; }
  .tp-sub { display: none; }
  .tp-copy h1 { font-size: 34px; }
  .tp-legend { display: none; }
  .tp-compass { right: 20px; top: 84px; gap: 10px; }
  .tp-scale { display: none; }
  .tp-tick b { display: none; }
  .tp .dock .seg { padding: 0 8px; }
  .tp .dock .dock-sep { margin: 0 1px; }
}
`
