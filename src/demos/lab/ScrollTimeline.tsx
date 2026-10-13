import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react'
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { POSTER } from '../../lib/iso'

/* ================================================================== story */
const STOPS = [
  { year: '2019', title: '第一行代码', tag: '起点', text: '深夜的书桌和一台旧笔记本。第一个 commit 只有 200 行，却决定了后来的一切。' },
  { year: '2020', title: '车库里的工作室', tag: '三个人', text: '租下一间车库，白天写代码，晚上在卷帘门上画产品草图。' },
  { year: '2021', title: '第一个用户', tag: '被需要', text: '一位陌生人连续用了一周，然后发来一句：「它真的帮到我了。」' },
  { year: '2022', title: '种子轮', tag: '点火', text: '拿到第一笔投资，产品从「能用」走向「好用」，火箭开始升空。' },
  { year: '2023', title: '团队 20 人', tag: '新办公室', text: '搬进有窗户的小楼，二十个人、三个小组，第一次开周会。' },
  { year: '2024', title: '出海', tag: '40+ 国家', text: '上线英文版，用户来自四十多个国家，客服开始倒时差。' },
  { year: '2025', title: '下一站', tag: '未完待续', text: '小路还在往前延伸。下一座小模型会是什么样子？由你来写。' },
]
const N = STOPS.length
const SECTION_VH = 90 // scroll distance between two stations

/* ================================================================== helpers */
type V3 = [number, number, number]
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const sstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
/** scroll progress (0..1) → "station float" with a dwell plateau around every station */
const stationFloat = (p: number) => {
  const s = clamp01(p) * (N - 1)
  const i = Math.min(Math.floor(s), N - 2)
  return i + sstep(0.16, 0.84, s - i)
}

/* ================================================================== palette */
const ACC = '#d9653b'
const C = {
  grass: '#bddb9f',
  grass2: '#b2d394',
  soil: '#e8cba0',
  soil2: '#dbb98b',
  stone: '#f3ece1',
  tileUp: '#e7e0d3',
  tileNear: '#e8764c',
  tileFar: '#f2a983',
  tree: '#86c08a',
  tree2: '#9fcd8c',
  pine: '#68a883',
  trunk: '#b07c5f',
  cloud: '#ffffff',
  rock: '#dcd3c6',
}

/* ================================================================== path + island */
// control points (x, z): two lead-in points, seven stations, two tail points
const CTRL: [number, number][] = [
  [-10, -3.4],
  [-5, -2.2],
  [0, 0],
  [7.5, 3.6],
  [15, -0.6],
  [22.5, 3.4],
  [30, -0.8],
  [37.5, 3.2],
  [45, 0.2],
  [50.5, -1.6],
  [56, -2.8],
]
const LEAD = 2
const curve = new THREE.CatmullRomCurve3(
  CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal',
)
const uOfF = (f: number) => (f + LEAD) / (CTRL.length - 1)
const ARC_N = 1500
const ARC = curve.getLengths(ARC_N)
const LEN = ARC[ARC_N]
const arcAt = (t: number) => {
  const x = clamp01(t) * ARC_N
  const i = Math.min(Math.floor(x), ARC_N - 1)
  return ARC[i] + (ARC[i + 1] - ARC[i]) * (x - i)
}

const STATIONS = STOPS.map((_, i) => {
  const t = uOfF(i)
  const p = curve.getPoint(t)
  const tan = curve.getTangent(t)
  const n = new THREE.Vector3(tan.z, 0, -tan.x).normalize() // +1 → "behind" the path (up on screen)
  const side = i % 2 === 0 ? 1 : -1
  const c = p.clone().addScaledVector(n, side * 3.15)
  const label = p.clone().addScaledVector(n, -side * 1.75)
  return { t, p, c, label, side, labelAng: Math.atan2(-tan.z, tan.x) }
})

const key = (x: number, z: number) => `${x},${z}`
const ISLAND = (() => {
  const tEnd = uOfF(N - 1) + 0.035
  const samples: THREE.Vector3[] = []
  for (let k = 0; k <= 520; k++) samples.push(curve.getPoint((k / 520) * tEnd))
  const cells: { x: number; z: number; depth: number; tone: number }[] = []
  const set = new Set<string>()
  for (let gx = -16; gx < 54; gx++)
    for (let gz = -14; gz < 14; gz++) {
      const cx = gx + 0.5
      const cz = gz + 0.5
      let d = 1e9
      for (const s of samples) {
        const dx = s.x - cx
        const dz = s.z - cz
        const q = dx * dx + dz * dz
        if (q < d) d = q
      }
      d = Math.sqrt(d)
      const wob = 0.5 + 0.5 * Math.sin(cx * 0.42 + Math.sin(cz * 0.55) * 1.4) * Math.cos(cz * 0.37 - cx * 0.13)
      const r = 3.5 + wob * 1.7
      let near = false
      for (const st of STATIONS) if (Math.hypot(st.c.x - cx, st.c.z - cz) < 3.0) near = true
      if (d < r || near) {
        const inner = Math.max(0, r - d)
        cells.push({ x: cx, z: cz, depth: 0.9 + Math.min(inner, 5) * 0.62 + rnd(gx * 7.3 + gz * 1.9) * 0.7, tone: rnd(gx * 3.1 + gz * 11.7) })
        set.add(key(gx, gz))
      }
    }
  return { cells, set }
})()
const onIsland = (x: number, z: number) => ISLAND.set.has(key(Math.floor(x), Math.floor(z)))

const TILE_STEP = 0.9
const TILES = (() => {
  const out: { x: number; z: number; ang: number; a: number; w: number; float: number }[] = []
  const tan = new THREE.Vector3()
  const p = new THREE.Vector3()
  let tail = 0
  for (let a = 0.6; a < LEN - 0.2; a += TILE_STEP) {
    const t = curve.getUtoTmapping(0, a)
    curve.getPoint(t, p)
    curve.getTangent(t, tan)
    const k = out.length
    const floating = !onIsland(p.x, p.z) && p.x > 40
    out.push({ x: p.x, z: p.z, ang: Math.atan2(tan.x, tan.z) + (rnd(k * 2.3) - 0.5) * 0.3, a, w: 0.8 + rnd(k) * 0.14, float: floating ? ++tail : 0 })
  }
  return out
})()

/* scatter: trees, flowers, rocks — kept off the path, pads and labels */
const SCATTER = (() => {
  const trees: { x: number; z: number; s: number; kind: number }[] = []
  const flowers: { x: number; z: number; c: number }[] = []
  const rocks: { x: number; z: number; s: number }[] = []
  const pts: THREE.Vector3[] = []
  for (let k = 0; k <= 400; k++) pts.push(curve.getPoint(k / 400))
  const clear = (x: number, z: number, rp: number, rs: number) => {
    for (const q of pts) if ((q.x - x) ** 2 + (q.z - z) ** 2 < rp * rp) return false
    for (const st of STATIONS) {
      if (Math.hypot(st.c.x - x, st.c.z - z) < rs) return false
      if (Math.hypot(st.label.x - x, st.label.z - z) < 1.5) return false
    }
    return true
  }
  ISLAND.cells.forEach((c, k) => {
    const r = rnd(k * 5.17)
    const x = c.x + (rnd(k * 9.1) - 0.5) * 0.5
    const z = c.z + (rnd(k * 3.3) - 0.5) * 0.5
    if (r < 0.13 && clear(x, z, 1.35, 2.6)) trees.push({ x, z, s: 0.75 + rnd(k * 1.7) * 0.5, kind: rnd(k * 8.8) < 0.4 ? 1 : 0 })
    else if (r < 0.3 && clear(x, z, 0.75, 2.2)) flowers.push({ x, z, c: Math.floor(rnd(k * 4.4) * 4) })
    else if (r < 0.34 && clear(x, z, 0.9, 2.2)) rocks.push({ x, z, s: 0.14 + rnd(k * 6.1) * 0.16 })
  })
  return { trees, flowers, rocks }
})()

/* ================================================================== shared GPU resources */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.1),
  tile: new RoundedBoxGeometry(1, 0.12, 1, 2, 0.05).translate(0, 0.06, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  cone: new THREE.ConeGeometry(1, 1, 24),
  ball: new THREE.SphereGeometry(1, 20, 14),
  ico: new THREE.IcosahedronGeometry(1, 0),
  gem: new THREE.OctahedronGeometry(1, 0),
  pine: new THREE.ConeGeometry(1, 1, 7),
  body: new THREE.CapsuleGeometry(0.13, 0.22, 4, 12),
  disk: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.89, 1, 48).rotateX(-Math.PI / 2),
}
const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra })
const gemMat = lam('#f2a983', { flatShading: true, emissive: new THREE.Color('#f7b28c'), emissiveIntensity: 0.35 })

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const codeTex = canvasTex(160, 112, (g) => {
  g.fillStyle = '#2e2c40'
  g.fillRect(0, 0, 160, 112)
  const cols = ['#f2a983', '#9fd3b9', '#a9c4f0', '#f5d27a', '#d9c8f5']
  let y = 12
  for (let l = 0; l < 9; l++) {
    let x = 12 + (l % 3 === 1 ? 14 : l % 3 === 2 ? 26 : 0)
    const parts = 1 + Math.floor(rnd(l * 3.3) * 3)
    for (let k = 0; k < parts; k++) {
      const w = 12 + rnd(l * 7 + k) * 36
      g.fillStyle = cols[(l + k) % cols.length]
      g.fillRect(x, y, w, 5)
      x += w + 6
    }
    y += 11
  }
})
const globeTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#86c3e6'
  g.fillRect(0, 0, 256, 128)
  g.fillStyle = '#a9d68f'
  for (let k = 0; k < 16; k++) {
    g.beginPath()
    g.ellipse(rnd(k) * 256, 22 + rnd(k * 2.7) * 84, 10 + rnd(k * 5.1) * 26, 8 + rnd(k * 1.3) * 16, rnd(k * 9) * 3, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#f7f3ea'
  g.fillRect(0, 0, 256, 8)
  g.fillRect(0, 120, 256, 8)
})
const glowTex = canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,255,255,0.95)')
  r.addColorStop(0.45, 'rgba(255,255,255,0.4)')
  r.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
})
const yearTex = STOPS.map((s) =>
  canvasTex(512, 180, (g) => {
    g.fillStyle = '#ffffff'
    g.font = '800 150px "SF Pro Display", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(s.year, 256, 96)
  }),
)

const heartGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(5, 5)
  s.bezierCurveTo(5, 5, 4, 0, 0, 0)
  s.bezierCurveTo(-6, 0, -6, 7, -6, 7)
  s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19)
  s.bezierCurveTo(12, 15.4, 16, 11, 16, 7)
  s.bezierCurveTo(16, 7, 16, 0, 10, 0)
  s.bezierCurveTo(7, 0, 5, 5, 5, 5)
  const g = new THREE.ExtrudeGeometry(s, { depth: 4, bevelEnabled: true, bevelSize: 1.4, bevelThickness: 1.4, bevelSegments: 3, curveSegments: 16 })
  g.center()
  g.rotateZ(Math.PI)
  g.scale(0.028, 0.028, 0.028)
  return g
})()
const sailGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.lineTo(0.5, 0)
  s.lineTo(0, 0.72)
  s.lineTo(0, 0)
  return new THREE.ShapeGeometry(s)
})()
const roofGeo = (() => {
  const s = new THREE.Shape()
  s.moveTo(-0.8, 0)
  s.lineTo(0.8, 0)
  s.lineTo(0, 0.62)
  s.lineTo(-0.8, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false })
  g.translate(0, 0, -0.8)
  return g
})()
const qGeo = new THREE.TorusGeometry(0.22, 0.075, 10, 32, Math.PI * 1.5).rotateZ(-Math.PI / 2)

/* water: display-referred shader with a moving shimmer */
function makeWater() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGrey: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uGrey;
      varying vec3 vW;
      void main() {
        vec2 p = vW.xz;
        float a = sin(p.x * 3.4 + uTime * 1.4) * sin(p.y * 2.9 - uTime * 1.1);
        float b = sin((p.x + p.y) * 4.7 - uTime * 1.9) * 0.5 + 0.5;
        float glint = smoothstep(0.72, 0.98, a * 0.55 + b * 0.5);
        vec3 deep = vec3(0.48, 0.74, 0.86);
        vec3 light = vec3(0.66, 0.86, 0.93);
        vec3 c = mix(deep, light, 0.45 + 0.3 * a) + glint * 0.32;
        float l = dot(c, vec3(0.3, 0.59, 0.11));
        c = mix(c, vec3(l) * 0.9 + 0.08, uGrey);
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
}

/* per-station palette that can fade toward a soft grey once the station is passed */
type MatObj = { c: string; map?: THREE.Texture; basic?: boolean; flat?: boolean; side?: THREE.Side }
type MatSpec = string | MatObj
const GREY_TO = new THREE.Color('#e9e3d8')
function makePal<K extends string>(spec: Record<K, MatSpec>) {
  const m = {} as Record<K, THREE.MeshLambertMaterial>
  const items: { mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial; c0: THREE.Color; cg: THREE.Color }[] = []
  for (const k in spec) {
    const raw: MatSpec = spec[k]
    const sp: MatObj = typeof raw === 'string' ? { c: raw } : raw
    const mat = sp.basic
      ? new THREE.MeshBasicMaterial({ color: sp.c, map: sp.map ?? null, side: sp.side ?? THREE.FrontSide })
      : new THREE.MeshLambertMaterial({ color: sp.c, map: sp.map ?? null, flatShading: !!sp.flat, side: sp.side ?? THREE.FrontSide })
    const c0 = mat.color.clone()
    const l = c0.r * 0.3 + c0.g * 0.59 + c0.b * 0.11
    items.push({ mat, c0, cg: new THREE.Color(l, l, l).lerp(GREY_TO, 0.55) })
    m[k] = mat as THREE.MeshLambertMaterial
  }
  let last = -1
  const grey = (g: number) => {
    if (Math.abs(g - last) < 0.002) return
    last = g
    for (const it of items) it.mat.color.copy(it.c0).lerp(it.cg, g)
  }
  return { m, grey }
}

/* the gallery poster frames the garage stop, with the coloured trail behind and the road ahead */
const POSTER_P = 0.55 / (N - 1)

/* ================================================================== shared frame state */
type Shared = {
  f: number
  u: number
  arc: number
  pos: THREE.Vector3
  tan: THREE.Vector3
  target: THREE.Vector3
  speed: number
  dir: number
  walk: number
  init: boolean
}
const SCtx = createContext<Shared>(null!)
const useS = () => useContext(SCtx)

/** first child of the Canvas → its useFrame runs before everyone else's */
function Driver({ progress }: { progress: MotionValue<number> }) {
  const S = useS()
  const bias = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const p = POSTER ? POSTER_P : progress.get()
    S.f = stationFloat(p)
    S.u = uOfF(S.f)
    curve.getPoint(S.u, S.pos)
    curve.getTangent(S.u, S.tan)
    const arc = arcAt(S.u)
    const dA = S.init ? arc - S.arc : 0
    S.init = true
    S.arc = arc
    S.walk += dA
    if (Math.abs(dA) > 1e-4) S.dir = Math.sign(dA)
    S.speed += ((dt > 0 ? Math.abs(dA) / dt : 0) - S.speed) * Math.min(1, dt * 10)
    // camera target: the walker, leaning a little toward the station diorama while dwelling there
    const k = Math.round(S.f)
    const close = 1 - Math.min(1, Math.abs(S.f - k) * 2.5)
    const st = STATIONS[k]
    bias.subVectors(st.c, st.p).multiplyScalar(0.32 * close)
    // at the last stop, lean forward so the floating stepping stones ahead stay in frame
    if (k === N - 1) bias.addScaledVector(S.tan, 2.2 * close)
    S.target.set(S.pos.x + bias.x, 0.4, S.pos.z + bias.z)
  })
  return null
}

function Rig() {
  const S = useS()
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const { width, height } = useThree((s) => s.size)
  useLayoutEffect(() => {
    const mobile = width < 760
    const fit = POSTER ? 18 : mobile ? 11.6 : 19
    camera.zoom = Math.min(width, height * 1.25) / fit
    const ox = POSTER || mobile ? 0 : 0.09
    const oy = POSTER ? 0 : mobile ? 0.085 : 0
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])
  useFrame(() => {
    const t = S.target
    camera.position.set(t.x + 60, t.y + 60, t.z + 60)
    camera.lookAt(t)
  })
  return null
}

function Lights() {
  const S = useS()
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff1dc', 1.75)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -20
    cam.right = cam.top = 20
    cam.near = 1
    cam.far = 60
    l.shadow.bias = -0.0007
    l.shadow.normalBias = 0.025
    return l
  }, [])
  useFrame(() => {
    // follow the camera in coarse steps so the shadow map does not swim every frame
    const sx = Math.round(S.target.x / 4) * 4
    const sz = Math.round(S.target.z / 4) * 4
    sun.position.set(sx + 7, 14, sz + 4)
    sun.target.position.set(sx, 0, sz)
    sun.target.updateMatrixWorld()
  })
  return (
    <>
      <ambientLight color="#fff5e8" intensity={1.05} />
      <hemisphereLight color="#ffffff" groundColor="#c9dcb0" intensity={0.5} />
      <primitive object={sun} />
      <primitive object={sun.target} />
    </>
  )
}

/* ================================================================== island */
function Island() {
  const caps = useRef<THREE.InstancedMesh>(null)
  const cols = useRef<THREE.InstancedMesh>(null)
  const capMat = useMemo(() => lam('#ffffff'), [])
  const soilMat = useMemo(() => lam('#ffffff'), [])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    const g1 = new THREE.Color(C.grass)
    const g2 = new THREE.Color(C.grass2)
    const s1 = new THREE.Color(C.soil)
    const s2 = new THREE.Color(C.soil2)
    ISLAND.cells.forEach((cell, i) => {
      o.position.set(cell.x, -0.15, cell.z)
      o.scale.set(1, 0.3, 1)
      o.updateMatrix()
      caps.current!.setMatrixAt(i, o.matrix)
      const chk = (Math.floor(cell.x) + Math.floor(cell.z)) & 1
      caps.current!.setColorAt(i, c.copy(chk ? g1 : g2).lerp(g1, cell.tone * 0.4))
      o.position.set(cell.x, -0.3 - cell.depth / 2, cell.z)
      o.scale.set(1, cell.depth, 1)
      o.updateMatrix()
      cols.current!.setMatrixAt(i, o.matrix)
      cols.current!.setColorAt(i, c.copy(s1).lerp(s2, cell.tone))
    })
    caps.current!.instanceMatrix.needsUpdate = true
    cols.current!.instanceMatrix.needsUpdate = true
    caps.current!.instanceColor!.needsUpdate = true
    cols.current!.instanceColor!.needsUpdate = true
  }, [])
  return (
    <group>
      <instancedMesh ref={caps} args={[G.box, capMat, ISLAND.cells.length]} receiveShadow />
      <instancedMesh ref={cols} args={[G.box, soilMat, ISLAND.cells.length]} receiveShadow />
      <Scatter />
    </group>
  )
}

function Scatter() {
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const pines = useRef<THREE.InstancedMesh>(null)
  const flowers = useRef<THREE.InstancedMesh>(null)
  const rocks = useRef<THREE.InstancedMesh>(null)
  const mats = useMemo(
    () => ({
      trunk: lam(C.trunk),
      crown: lam('#ffffff', { flatShading: true }),
      pine: lam(C.pine, { flatShading: true }),
      flower: lam('#ffffff'),
      rock: lam(C.rock, { flatShading: true }),
    }),
    [],
  )
  const round = SCATTER.trees.filter((t) => t.kind === 0)
  const pine = SCATTER.trees.filter((t) => t.kind === 1)
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    const c = new THREE.Color()
    SCATTER.trees.forEach((t, i) => {
      o.position.set(t.x, 0.18 * t.s, t.z)
      o.rotation.set(0, 0, 0)
      o.scale.set(0.07 * t.s, 0.36 * t.s, 0.07 * t.s)
      o.updateMatrix()
      trunks.current!.setMatrixAt(i, o.matrix)
    })
    round.forEach((t, i) => {
      o.position.set(t.x, 0.62 * t.s, t.z)
      o.rotation.set(rnd(i) * 3, rnd(i * 2) * 3, 0)
      o.scale.setScalar(0.4 * t.s)
      o.updateMatrix()
      crowns.current!.setMatrixAt(i, o.matrix)
      crowns.current!.setColorAt(i, c.set(rnd(i * 4.1) < 0.5 ? C.tree : C.tree2))
    })
    pine.forEach((t, i) => {
      o.position.set(t.x, 0.72 * t.s, t.z)
      o.rotation.set(0, rnd(i) * 3, 0)
      o.scale.set(0.36 * t.s, 0.95 * t.s, 0.36 * t.s)
      o.updateMatrix()
      pines.current!.setMatrixAt(i, o.matrix)
    })
    const fc = ['#f4a6b8', '#f7d474', '#ffffff', '#c9b6ee']
    SCATTER.flowers.forEach((f, i) => {
      o.position.set(f.x, 0.06, f.z)
      o.rotation.set(0, 0, 0)
      o.scale.setScalar(0.07)
      o.updateMatrix()
      flowers.current!.setMatrixAt(i, o.matrix)
      flowers.current!.setColorAt(i, c.set(fc[f.c]))
    })
    SCATTER.rocks.forEach((r, i) => {
      o.position.set(r.x, r.s * 0.4, r.z)
      o.rotation.set(rnd(i) * 3, rnd(i * 3) * 3, 0)
      o.scale.set(r.s * 1.3, r.s, r.s * 1.1)
      o.updateMatrix()
      rocks.current!.setMatrixAt(i, o.matrix)
    })
    for (const m of [trunks, crowns, pines, flowers, rocks]) {
      m.current!.instanceMatrix.needsUpdate = true
      if (m.current!.instanceColor) m.current!.instanceColor.needsUpdate = true
    }
  }, [])
  return (
    <>
      <instancedMesh ref={trunks} args={[G.cyl, mats.trunk, SCATTER.trees.length]} castShadow />
      <instancedMesh ref={crowns} args={[G.ico, mats.crown, round.length]} castShadow />
      <instancedMesh ref={pines} args={[G.pine, mats.pine, pine.length]} castShadow />
      <instancedMesh ref={flowers} args={[G.ball, mats.flower, SCATTER.flowers.length]} />
      <instancedMesh ref={rocks} args={[G.ico, mats.rock, SCATTER.rocks.length]} castShadow receiveShadow />
    </>
  )
}

/* ================================================================== path tiles (coloured by progress) */
function PathTiles() {
  const S = useS()
  const tiles = useRef<THREE.InstancedMesh>(null)
  const islets = useRef<THREE.InstancedMesh>(null)
  const rocks = useRef<THREE.InstancedMesh>(null)
  const tailCount = TILES.filter((t) => t.float).length
  const mats = useMemo(() => ({ tile: lam('#ffffff'), islet: lam(C.grass), rock: lam(C.soil2, { flatShading: true }) }), [])
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Color(), up: new THREE.Color(C.tileUp), near: new THREE.Color(C.tileNear), far: new THREE.Color(C.tileFar) }), [])
  useFrame(({ clock }) => {
    const { o, c, up, near, far } = tmp
    const t = clock.elapsedTime
    let j = 0
    TILES.forEach((tl, k) => {
      const d = tl.a - S.arc
      const lift = Math.exp(-d * d * 2.5) * 0.06
      let y = lift
      if (tl.float) {
        y += -0.12 * tl.float + Math.sin(t * 1.1 + k * 0.9) * 0.07
        o.position.set(tl.x, y - 0.1, tl.z)
        o.rotation.set(0, tl.ang, 0)
        o.scale.set(0.62, 0.16, 0.62)
        o.updateMatrix()
        islets.current!.setMatrixAt(j, o.matrix)
        o.position.set(tl.x, y - 0.18 - 0.42, tl.z)
        o.rotation.set(Math.PI, tl.ang, 0)
        o.scale.set(0.55, 0.85, 0.55)
        o.updateMatrix()
        rocks.current!.setMatrixAt(j, o.matrix)
        j++
      }
      o.position.set(tl.x, y, tl.z)
      o.rotation.set(0, tl.ang, 0)
      o.scale.set(tl.w, 1, 0.64)
      o.updateMatrix()
      tiles.current!.setMatrixAt(k, o.matrix)
      if (d <= 0) c.copy(near).lerp(far, sstep(0, 16, -d))
      else c.copy(near).lerp(up, sstep(0, 0.9, d))
      tiles.current!.setColorAt(k, c)
    })
    tiles.current!.instanceMatrix.needsUpdate = true
    tiles.current!.instanceColor!.needsUpdate = true
    if (j) {
      islets.current!.instanceMatrix.needsUpdate = true
      rocks.current!.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <>
      <instancedMesh ref={tiles} args={[G.tile, mats.tile, TILES.length]} castShadow receiveShadow />
      <instancedMesh ref={islets} args={[G.cyl, mats.islet, Math.max(1, tailCount)]} receiveShadow />
      <instancedMesh ref={rocks} args={[G.pine, mats.rock, Math.max(1, tailCount)]} />
    </>
  )
}

/* ================================================================== walker */
function Walker() {
  const S = useS()
  const g = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const st = useRef({ ang: 0, init: false })
  const mats = useMemo(
    () => ({
      body: lam('#e8704a'),
      head: lam('#fff4e6'),
      eye: lam('#3b3646'),
      pack: lam('#f5c95f'),
      leg: lam('#5d5568'),
      halo: new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffb48c', transparent: true, opacity: 0.75, depthWrite: false }),
    }),
    [],
  )
  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    if (!g.current) return
    const t = clock.elapsedTime
    g.current.position.set(S.pos.x, 0.12, S.pos.z)
    const want = Math.atan2(S.tan.x * S.dir, S.tan.z * S.dir)
    const s = st.current
    if (!s.init) {
      s.ang = want
      s.init = true
    }
    let diff = want - s.ang
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    s.ang += diff * Math.min(1, dt * 9)
    g.current.rotation.y = s.ang
    const amp = clamp01(S.speed / 2.2)
    const ph = S.walk * 5.2
    if (body.current) {
      body.current.position.y = 0.17 + Math.abs(Math.sin(ph)) * 0.08 * amp + Math.sin(t * 2.4) * 0.012 * (1 - amp)
      body.current.rotation.x = 0.12 * amp
    }
    if (legL.current) legL.current.rotation.x = Math.sin(ph) * 0.7 * amp
    if (legR.current) legR.current.rotation.x = -Math.sin(ph) * 0.7 * amp
    if (halo.current) halo.current.scale.setScalar(0.75 + Math.sin(t * 2.2) * 0.06)
  })
  return (
    <group ref={g} scale={1.3}>
      <mesh ref={halo} geometry={G.disk} material={mats.halo} position={[0, 0.02, 0]} renderOrder={2} />
      <group ref={legL} position={[-0.075, 0.2, 0]}>
        <mesh geometry={G.box} material={mats.leg} position={[0, -0.1, 0]} scale={[0.08, 0.2, 0.08]} castShadow />
      </group>
      <group ref={legR} position={[0.075, 0.2, 0]}>
        <mesh geometry={G.box} material={mats.leg} position={[0, -0.1, 0]} scale={[0.08, 0.2, 0.08]} castShadow />
      </group>
      <group ref={body}>
        <mesh geometry={G.body} material={mats.body} position={[0, 0.2, 0]} scale={[1.05, 1, 1]} castShadow />
        <mesh geometry={G.rbox} material={mats.pack} position={[0, 0.24, -0.14]} scale={[0.2, 0.24, 0.12]} castShadow />
        <mesh geometry={G.ball} material={mats.head} position={[0, 0.6, 0]} scale={0.15} castShadow />
        <mesh geometry={G.ball} material={mats.eye} position={[-0.055, 0.62, 0.135]} scale={0.022} />
        <mesh geometry={G.ball} material={mats.eye} position={[0.055, 0.62, 0.135]} scale={0.022} />
      </group>
    </group>
  )
}

/* ================================================================== building blocks */
type PartProps = { g?: THREE.BufferGeometry; m: THREE.Material; p?: V3; s?: V3 | number; r?: V3; cast?: boolean }
function P({ g = G.box, m, p, s, r, cast = true }: PartProps) {
  return <mesh geometry={g} material={m} position={p} scale={s} rotation={r} castShadow={cast} receiveShadow />
}

function Person({ p, body, head, s = 1, phase = 0, ry = 0, hop = 0.035, sway = 0 }: { p: V3; body: THREE.Material; head: THREE.Material; s?: number; phase?: number; ry?: number; hop?: number; sway?: number }) {
  const g = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!g.current) return
    const t = clock.elapsedTime * 2.1 + phase
    g.current.position.y = p[1] + Math.max(0, Math.sin(t)) * hop
    if (sway) {
      g.current.position.x = p[0] + Math.sin(t * 0.35) * sway
      g.current.rotation.y = ry + (Math.cos(t * 0.35) > 0 ? 0.6 : -0.6)
    }
  })
  return (
    <group ref={g} position={p} scale={s} rotation={[0, ry, 0]}>
      <mesh geometry={G.body} material={body} position={[0, 0.25, 0]} castShadow />
      <mesh geometry={G.ball} material={head} position={[0, 0.6, 0]} scale={0.13} castShadow />
    </group>
  )
}

function Flag({ p, m, w = 0.5, h = 0.3, phase = 0 }: { p: V3; m: THREE.Material; w?: number; h?: number; phase?: number }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(w, h, 10, 2).translate(w / 2, 0, 0), [w, h])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo])
  useFrame(({ clock }) => {
    const pos = geo.attributes.position
    const a = pos.array as Float32Array
    const t = clock.elapsedTime
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]
      a[i * 3 + 2] = Math.sin(x * 11 - t * 5.5 + phase) * 0.07 * (x / w)
      a[i * 3 + 1] = base[i * 3 + 1] - (x / w) * 0.03
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
  })
  return <mesh geometry={geo} material={m} position={p} castShadow />
}

function useGrey(i: number, grey: (g: number) => void) {
  const S = useS()
  useFrame(() => grey(POSTER ? 0 : sstep(0.45, 0.95, S.f - i) * 0.72))
}

/** pad + rising diorama; the diorama springs out of the ground as the camera approaches */
function Station({ i, H, water, children }: { i: number; H: number; water?: boolean; children: ReactNode }) {
  const S = useS()
  const st = STATIONS[i]
  const rise = useSpring(0, { stiffness: 150, damping: 11, mass: 0.9 })
  const lastT = useRef(-1)
  const g = useRef<THREE.Group>(null)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#dcd2c2' }), [])
  const labelMat = useMemo(() => new THREE.MeshBasicMaterial({ map: yearTex[i], color: '#9cc184', transparent: true, depthWrite: false }), [i])
  const waterMat = useMemo(() => (water ? makeWater() : null), [water])
  const padMat = useMemo(() => lam(C.stone), [])
  const gem = useRef<THREE.Mesh>(null)
  const cols = useMemo(() => ({ up: new THREE.Color('#dcd2c2'), on: new THREE.Color(ACC), past: new THREE.Color('#efb49a'), lblUp: new THREE.Color('#9cc184'), lblOn: new THREE.Color('#ffffff') }), [])
  useFrame(({ clock }) => {
    const d = S.f - i
    const target = d < -0.62 ? 0 : d > 0.55 && !POSTER ? 0.8 : 1
    if (target !== lastT.current) {
      lastT.current = target
      rise.set(target)
    }
    const r = rise.get()
    if (g.current) {
      g.current.visible = r > 0.004
      g.current.position.y = -(1 - r) * H
      const sc = 0.8 + 0.2 * Math.min(r, 1.1)
      g.current.scale.set(sc, 1, sc)
    }
    if (gem.current) {
      const k = clamp01(1 - r * 2.5)
      gem.current.visible = k > 0.01
      gem.current.scale.set(0.28 * k, 0.4 * k, 0.28 * k)
      gem.current.position.y = 0.55 + Math.sin(clock.elapsedTime * 1.8 + i) * 0.08
      gem.current.rotation.y = clock.elapsedTime * 1.2 + i
    }
    const act = 1 - sstep(0.3, 0.6, Math.abs(d))
    if (d > 0.3) ringMat.color.copy(cols.past).lerp(cols.on, act)
    else ringMat.color.copy(cols.up).lerp(cols.on, act)
    labelMat.color.copy(cols.lblUp).lerp(cols.lblOn, sstep(-0.6, -0.2, d))
    if (waterMat) {
      waterMat.uniforms.uTime.value = clock.elapsedTime
      waterMat.uniforms.uGrey.value = sstep(0.45, 0.95, d) * 0.5
    }
  })
  return (
    <>
      <group position={[st.label.x, 0.012, st.label.z]} rotation={[0, st.labelAng, 0]}>
        <mesh material={labelMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[2.3, 0.81]} />
        </mesh>
      </group>
      <group position={[st.c.x, 0, st.c.z]}>
        <P g={G.cyl} m={padMat} p={[0, 0.06, 0]} s={[2.0, 0.12, 2.0]} cast={false} />
        <mesh geometry={G.ring} material={ringMat} position={[0, 0.125, 0]} scale={1.86} />
        <mesh ref={gem} geometry={G.gem} material={gemMat} castShadow />
        {waterMat && <mesh geometry={G.disk} material={waterMat} position={[0, 0.13, 0]} scale={1.64} />}
        <group rotation={[0, Math.PI / 4, 0]} scale={1.28}>
          <group ref={g} visible={false}>
            {children}
          </group>
        </group>
      </group>
    </>
  )
}

/* ================================================================== dioramas */
const SKIN = '#fde7d3'

function Desk() {
  const pal = useMemo(
    () =>
      makePal({
        rug: '#f4c9b5',
        wood: '#dcae7d',
        woodDk: '#b98a5e',
        metal: '#e7e4ee',
        lid: '#4a465c',
        screen: { c: '#ffffff', map: codeTex, basic: true },
        mug: '#ec8a63',
        steam: { c: '#ffffff', basic: true },
        ink: '#4a4656',
        shade: '#f5c95f',
        bulb: { c: '#fff4c9', basic: true },
        chair: '#8db6d9',
        pot: '#d98b62',
        leaf: { c: '#86c08a', flat: true },
        book1: '#94cfb4',
        book2: '#b8a8e3',
        cursor: { c: '#ffe08a', basic: true },
      }),
    [],
  )
  useGrey(0, pal.grey)
  const m = pal.m
  const steam = useRef<THREE.Mesh[]>([])
  const cursor = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    steam.current.forEach((s, k) => {
      if (!s) return
      const q = (t * 0.45 + k / 3) % 1
      s.position.set(0.52 + Math.sin(q * 6 + k) * 0.03, 0.98 + q * 0.42, 0.12)
      s.scale.setScalar(0.045 * Math.sin(q * Math.PI))
    })
    if (cursor.current) cursor.current.visible = Math.sin(t * 6) > 0
  })
  return (
    <group position={[0, 0.12, 0]}>
      <P m={m.rug} p={[0, 0.012, 0]} s={[2.3, 0.025, 1.7]} cast={false} />
      <P g={G.rbox} m={m.wood} p={[0, 0.76, 0]} s={[1.55, 0.08, 0.78]} />
      {[
        [-0.68, -0.31],
        [0.68, -0.31],
        [-0.68, 0.31],
        [0.68, 0.31],
      ].map(([x, z], k) => (
        <P key={k} m={m.woodDk} p={[x, 0.36, z]} s={[0.06, 0.72, 0.06]} />
      ))}
      <P g={G.rbox} m={m.metal} p={[0, 0.818, 0.06]} s={[0.66, 0.035, 0.44]} />
      <group position={[0, 0.83, -0.15]} rotation={[-0.22, 0, 0]}>
        <P g={G.rbox} m={m.lid} p={[0, 0.22, 0]} s={[0.66, 0.44, 0.035]} />
        <mesh material={m.screen} position={[0, 0.225, 0.019]}>
          <planeGeometry args={[0.58, 0.38]} />
        </mesh>
        <mesh ref={cursor} geometry={G.box} material={m.cursor} position={[0.12, 0.1, 0.022]} scale={[0.03, 0.04, 0.002]} />
      </group>
      <P g={G.cyl} m={m.mug} p={[0.52, 0.87, 0.12]} s={[0.07, 0.13, 0.07]} />
      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(el) => void (steam.current[k] = el!)} geometry={G.ball} material={m.steam} />
      ))}
      <P m={m.book1} p={[-0.5, 0.83, 0.18]} s={[0.3, 0.06, 0.22]} r={[0, 0.2, 0]} />
      <P m={m.book2} p={[-0.5, 0.885, 0.18]} s={[0.27, 0.05, 0.2]} r={[0, -0.1, 0]} />
      <P g={G.cyl} m={m.ink} p={[-0.56, 0.815, -0.2]} s={[0.09, 0.03, 0.09]} />
      <P m={m.ink} p={[-0.56, 1.02, -0.2]} s={[0.025, 0.4, 0.025]} />
      <P g={G.cone} m={m.shade} p={[-0.46, 1.22, -0.12]} s={[0.14, 0.17, 0.14]} r={[0.5, 0, -0.6]} />
      <P g={G.ball} m={m.bulb} p={[-0.42, 1.16, -0.08]} s={0.045} cast={false} />
      {/* chair, turned toward the desk */}
      <group position={[-1.0, 0, 0.35]} rotation={[0, 1.1, 0]}>
        <P g={G.rbox} m={m.chair} p={[0, 0.45, 0]} s={[0.46, 0.07, 0.44]} />
        <P g={G.rbox} m={m.chair} p={[0, 0.74, -0.2]} s={[0.46, 0.5, 0.07]} />
        <P g={G.cyl} m={m.ink} p={[0, 0.22, 0]} s={[0.035, 0.42, 0.035]} />
        <P g={G.cyl} m={m.ink} p={[0, 0.02, 0]} s={[0.22, 0.03, 0.22]} />
      </group>
      <P g={G.cyl} m={m.pot} p={[0.95, 0.15, -0.55]} s={[0.15, 0.3, 0.15]} />
      <P g={G.ico} m={m.leaf} p={[0.95, 0.46, -0.55]} s={0.24} />
      <P g={G.ico} m={m.leaf} p={[1.0, 0.64, -0.5]} s={0.15} />
    </group>
  )
}

function Garage() {
  const pal = useMemo(
    () =>
      makePal({
        floor: '#e3dcd0',
        wall: '#f3e2c6',
        roof: '#e0775a',
        dark: '#4c4660',
        door: '#cfd9e2',
        doorLine: '#a9b8c6',
        sign: '#8db6d9',
        bulb: { c: '#ffe7a3', basic: true },
        wood: '#d3a06f',
        box: '#d8b287',
        p1: '#94cfb4',
        p2: '#f5c95f',
        p3: '#b8a8e3',
        skin: SKIN,
        tool: '#6f6a7c',
      }),
    [],
  )
  useGrey(1, pal.grey)
  const m = pal.m
  const bulb = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (bulb.current) bulb.current.scale.setScalar(0.07 + Math.sin(clock.elapsedTime * 3.1) * 0.008)
  })
  return (
    <group position={[0, 0.12, 0]}>
      <P m={m.floor} p={[0, 0.02, 0.15]} s={[2.3, 0.04, 2.0]} cast={false} />
      <P m={m.wall} p={[0, 0.52, -0.15]} s={[1.6, 1.0, 1.6]} />
      <mesh geometry={roofGeo} material={m.wall} position={[0, 1.02, -0.15]} castShadow receiveShadow />
      <group position={[0, 1.02, -0.15]}>
        <P m={m.roof} p={[-0.41, 0.33, 0]} s={[1.04, 0.08, 1.78]} r={[0, 0, 0.66]} />
        <P m={m.roof} p={[0.41, 0.33, 0]} s={[1.04, 0.08, 1.78]} r={[0, 0, -0.66]} />
      </group>
      <P m={m.dark} p={[0, 0.42, 0.655]} s={[1.08, 0.82, 0.02]} cast={false} />
      <group position={[0, 0.66, 0.67]}>
        <P m={m.door} p={[0, 0.06, 0]} s={[1.12, 0.36, 0.03]} />
        {[-0.06, 0.04, 0.14].map((y, k) => (
          <P key={k} m={m.doorLine} p={[0, y, 0.017]} s={[1.1, 0.014, 0.005]} cast={false} />
        ))}
      </group>
      <mesh ref={bulb} geometry={G.ball} material={m.bulb} position={[0, 0.62, 0.45]} />
      <P g={G.rbox} m={m.sign} p={[0, 1.03, 0.68]} s={[0.62, 0.14, 0.04]} />
      {/* workbench + boxes */}
      <P g={G.rbox} m={m.wood} p={[-1.0, 0.42, 0.55]} s={[0.4, 0.05, 0.75]} />
      <P m={m.tool} p={[-1.0, 0.2, 0.25]} s={[0.04, 0.4, 0.04]} />
      <P m={m.tool} p={[-1.0, 0.2, 0.85]} s={[0.04, 0.4, 0.04]} />
      <P m={m.tool} p={[-1.0, 0.47, 0.45]} s={[0.12, 0.05, 0.1]} />
      <P m={m.box} p={[0.98, 0.17, 0.62]} s={[0.36, 0.34, 0.36]} />
      <P m={m.box} p={[0.98, 0.47, 0.62]} s={[0.28, 0.26, 0.28]} r={[0, 0.4, 0]} />
      <P m={m.box} p={[1.0, 0.12, 0.98]} s={[0.24, 0.24, 0.24]} r={[0, -0.3, 0]} />
      <Person p={[-0.42, 0, 1.0]} body={m.p1} head={m.skin} s={0.85} phase={0} />
      <Person p={[0.4, 0, 1.08]} body={m.p2} head={m.skin} s={0.85} phase={1.7} />
      <Person p={[-0.62, 0, 0.62]} body={m.p3} head={m.skin} s={0.85} phase={3.1} ry={0.5} />
    </group>
  )
}

function FirstUser() {
  const pal = useMemo(
    () =>
      makePal({
        heart: '#f2788f',
        spark: { c: '#ffd36e', basic: true },
        body: '#8db6d9',
        skin: SKIN,
        phone: '#4a4656',
        phoneScr: { c: '#bfe3f2', basic: true },
        wood: '#dcae7d',
        woodDk: '#b98a5e',
        lamp: '#5d5a66',
        glow: { c: '#fff1c4', basic: true },
        bush: { c: '#9fcd8c', flat: true },
        fl1: '#f4a6b8',
        fl2: '#f7d474',
      }),
    [],
  )
  useGrey(2, pal.grey)
  const m = pal.m
  const heart = useRef<THREE.Group>(null)
  const sparks = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (heart.current) {
      heart.current.position.y = 1.55 + Math.sin(t * 1.8) * 0.08
      heart.current.rotation.y = Math.sin(t * 0.9) * 0.5
      const beat = 1 + Math.max(0, Math.sin(t * 5.5)) ** 6 * 0.14
      heart.current.scale.setScalar(beat)
    }
    sparks.current.forEach((s, k) => {
      if (!s) return
      const a = t * 1.2 + (k * Math.PI * 2) / 3
      s.position.set(-0.3 + Math.cos(a) * 0.5, 1.55 + Math.sin(a * 1.3) * 0.18, Math.sin(a) * 0.5)
    })
  })
  return (
    <group position={[0, 0.12, 0]}>
      {/* bench */}
      <P g={G.rbox} m={m.wood} p={[0.45, 0.4, -0.25]} s={[1.0, 0.07, 0.34]} />
      <P g={G.rbox} m={m.wood} p={[0.45, 0.62, -0.42]} s={[1.0, 0.3, 0.06]} />
      <P m={m.woodDk} p={[0.05, 0.2, -0.25]} s={[0.06, 0.4, 0.3]} />
      <P m={m.woodDk} p={[0.85, 0.2, -0.25]} s={[0.06, 0.4, 0.3]} />
      {/* the user, holding a phone */}
      <group position={[-0.3, 0, 0.25]} scale={1.35}>
        <mesh geometry={G.body} material={m.body} position={[0, 0.25, 0]} castShadow />
        <mesh geometry={G.ball} material={m.skin} position={[0, 0.6, 0]} scale={0.13} castShadow />
        <P g={G.rbox} m={m.phone} p={[0.1, 0.36, 0.14]} s={[0.1, 0.16, 0.025]} r={[-0.5, 0.3, 0]} />
        <mesh material={m.phoneScr} position={[0.104, 0.364, 0.155]} rotation={[-0.5, 0.3, 0]}>
          <planeGeometry args={[0.075, 0.12]} />
        </mesh>
      </group>
      <group ref={heart} position={[-0.3, 1.55, 0.25]}>
        <mesh geometry={heartGeo} material={m.heart} castShadow />
      </group>
      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(el) => void (sparks.current[k] = el!)} geometry={G.ico} material={m.spark} scale={0.05} />
      ))}
      {/* lamp + bushes */}
      <P g={G.cyl} m={m.lamp} p={[1.05, 0.65, 0.45]} s={[0.03, 1.3, 0.03]} />
      <P g={G.ball} m={m.glow} p={[1.05, 1.34, 0.45]} s={0.11} cast={false} />
      <P g={G.ico} m={m.bush} p={[-0.95, 0.2, -0.55]} s={0.28} />
      <P g={G.ico} m={m.bush} p={[-0.7, 0.15, -0.85]} s={0.2} />
      {[
        [0.7, 0.85, 0],
        [0.95, 0.65, 1],
        [-1.0, 0.45, 0],
        [-0.85, 0.75, 1],
        [0.2, 1.05, 1],
      ].map(([x, z, c], k) => (
        <P key={k} g={G.ball} m={c ? m.fl2 : m.fl1} p={[x, 0.07, z]} s={0.07} cast={false} />
      ))}
    </group>
  )
}

function SeedRound() {
  const pal = useMemo(
    () =>
      makePal({
        pad: '#d6d9e2',
        padDk: '#b9bdca',
        tower: '#b8a8e3',
        body: '#fbf7f0',
        accent: '#e4704b',
        window: '#8db6d9',
        flame: { c: '#ffc861', basic: true },
        flame2: { c: '#ff8a4c', basic: true },
        smoke: '#ffffff',
        coin: '#f2c14e',
        coinDk: '#dba935',
      }),
    [],
  )
  useGrey(3, pal.grey)
  const m = pal.m
  const rocket = useRef<THREE.Group>(null)
  const flame = useRef<THREE.Group>(null)
  const coin = useRef<THREE.Mesh>(null)
  const puffs = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (rocket.current) {
      rocket.current.position.y = 0.42 + Math.sin(t * 2.2) * 0.06
      rocket.current.rotation.z = Math.sin(t * 1.3) * 0.025
    }
    if (flame.current) flame.current.scale.set(1, 0.85 + Math.sin(t * 31) * 0.12 + Math.sin(t * 17) * 0.08, 1)
    if (coin.current) {
      coin.current.rotation.y = t * 2.4
      coin.current.position.y = 1.0 + Math.sin(t * 1.7) * 0.06
    }
    puffs.current.forEach((p, k) => {
      if (!p) return
      const q = (t * 0.5 + k / 4) % 1
      const a = (k / 4) * Math.PI * 2
      p.position.set(Math.cos(a) * (0.3 + q * 0.4), 0.2 + q * 0.1, Math.sin(a) * (0.3 + q * 0.4))
      p.scale.setScalar(0.16 * Math.sin(q * Math.PI))
    })
  })
  return (
    <group position={[0, 0.12, 0]}>
      <P g={G.cyl} m={m.pad} p={[0, 0.07, 0]} s={[0.72, 0.14, 0.72]} />
      <P g={G.cyl} m={m.padDk} p={[0, 0.15, 0]} s={[0.42, 0.04, 0.42]} cast={false} />
      <P m={m.tower} p={[-0.62, 0.85, -0.3]} s={[0.12, 1.7, 0.12]} />
      <P m={m.tower} p={[-0.42, 1.25, -0.2]} s={[0.36, 0.06, 0.06]} r={[0, 0.45, 0]} />
      <P m={m.tower} p={[-0.42, 0.75, -0.2]} s={[0.36, 0.06, 0.06]} r={[0, 0.45, 0]} />
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} ref={(el) => void (puffs.current[k] = el!)} geometry={G.ball} material={m.smoke} />
      ))}
      <group ref={rocket}>
        <group ref={flame} position={[0, 0.02, 0]}>
          <P g={G.cone} m={m.flame} p={[0, -0.12, 0]} s={[0.13, 0.32, 0.13]} r={[Math.PI, 0, 0]} cast={false} />
          <P g={G.cone} m={m.flame2} p={[0, -0.06, 0]} s={[0.08, 0.2, 0.08]} r={[Math.PI, 0, 0]} cast={false} />
        </group>
        <P g={G.cone} m={m.accent} p={[0, 0.1, 0]} s={[0.17, 0.16, 0.17]} />
        <P g={G.cyl} m={m.body} p={[0, 0.65, 0]} s={[0.26, 1.0, 0.26]} />
        <P g={G.cyl} m={m.accent} p={[0, 0.4, 0]} s={[0.268, 0.09, 0.268]} />
        <P g={G.cone} m={m.accent} p={[0, 1.36, 0]} s={[0.26, 0.42, 0.26]} />
        <P g={G.ball} m={m.window} p={[0, 0.86, 0.22]} s={[0.1, 0.1, 0.06]} />
        <P g={G.ball} m={m.body} p={[0, 0.86, 0.205]} s={[0.125, 0.125, 0.05]} />
        {[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2 + Math.PI / 6
          return <P key={k} g={G.rbox} m={m.accent} p={[Math.sin(a) * 0.3, 0.3, Math.cos(a) * 0.3]} s={[0.05, 0.36, 0.24]} r={[0, a, 0]} />
        })}
      </group>
      {[
        [0.78, 0.42, 6],
        [1.02, -0.02, 9],
        [0.42, 0.85, 4],
      ].map(([x, z, n], k) => (
        <group key={k} position={[x, 0, z]}>
          <P g={G.cyl} m={m.coinDk} p={[0, (n * 0.055) / 2, 0]} s={[0.17, n * 0.055, 0.17]} />
          <P g={G.cyl} m={m.coin} p={[0, n * 0.055 + 0.012, 0]} s={[0.17, 0.025, 0.17]} cast={false} />
        </group>
      ))}
      <group position={[0.9, 0, 0.5]}>
        <mesh ref={coin} geometry={G.cyl} material={m.coin} rotation={[Math.PI / 2, 0, 0]} scale={[0.17, 0.04, 0.17]} castShadow />
      </group>
    </group>
  )
}

function Office() {
  const pal = useMemo(
    () =>
      makePal({
        wall: '#e6eef4',
        base: '#c9d6e2',
        roof: '#7fa6c4',
        glass: '#9cbedd',
        lit: { c: '#ffe2a0', basic: true },
        door: '#5c5870',
        pole: '#6f6a7c',
        flag: { c: '#e8704a', side: THREE.DoubleSide },
        skin: SKIN,
        a: '#f2788f',
        b: '#94cfb4',
        c: '#f5c95f',
        d: '#b8a8e3',
        e: '#8db6d9',
        f: '#ec8a63',
        tree: { c: '#86c08a', flat: true },
        trunk: '#b07c5f',
      }),
    [],
  )
  useGrey(4, pal.grey)
  const m = pal.m
  const W = 1.7
  const D = 1.3
  const Hh = 1.55
  const z0 = -0.2
  const front = z0 + D / 2 + 0.012
  const right = W / 2 + 0.012
  const lit = (k: number) => rnd(k * 3.7 + 1) < 0.45
  return (
    <group position={[0, 0.12, 0]}>
      <P m={m.base} p={[0, 0.06, z0]} s={[W + 0.12, 0.12, D + 0.12]} />
      <P m={m.wall} p={[0, Hh / 2 + 0.1, z0]} s={[W, Hh, D]} />
      <P m={m.roof} p={[0, Hh + 0.14, z0]} s={[W + 0.1, 0.08, D + 0.1]} />
      <P m={m.roof} p={[-0.35, Hh + 0.28, z0 - 0.2]} s={[0.5, 0.22, 0.4]} />
      {/* front windows (2 rows) + door */}
      {[0, 1].map((row) =>
        [-0.55, 0, 0.55].map((x, k) =>
          row === 0 && k === 1 ? (
            <P key={`${row}${k}`} m={m.door} p={[x, 0.36, front]} s={[0.3, 0.5, 0.02]} cast={false} />
          ) : (
            <P key={`${row}${k}`} m={lit(row * 3 + k) ? m.lit : m.glass} p={[x, 0.5 + row * 0.6, front]} s={[0.32, 0.32, 0.02]} cast={false} />
          ),
        ),
      )}
      {[0, 1].map((row) =>
        [-0.2, 0.3].map((z, k) => (
          <P key={`r${row}${k}`} m={lit(10 + row * 2 + k) ? m.lit : m.glass} p={[right, 0.5 + row * 0.6, z0 + z - 0.05]} s={[0.02, 0.32, 0.32]} cast={false} />
        )),
      )}
      <P g={G.cyl} m={m.pole} p={[0.6, Hh + 0.55, z0 - 0.35]} s={[0.018, 0.8, 0.018]} />
      <Flag p={[0.6, Hh + 0.8, z0 - 0.35]} m={m.flag} w={0.48} h={0.28} />
      <Person p={[-0.75, 0, 0.75]} body={m.a} head={m.skin} s={0.7} phase={0.3} sway={0.18} />
      <Person p={[-0.2, 0, 0.95]} body={m.b} head={m.skin} s={0.7} phase={1.4} />
      <Person p={[0.3, 0, 0.78]} body={m.c} head={m.skin} s={0.7} phase={2.6} sway={0.15} />
      <Person p={[0.82, 0, 0.98]} body={m.d} head={m.skin} s={0.7} phase={3.5} />
      <Person p={[1.12, 0, 0.35]} body={m.e} head={m.skin} s={0.7} phase={4.4} ry={0.8} />
      <Person p={[1.12, 0, -0.25]} body={m.f} head={m.skin} s={0.7} phase={5.2} ry={1.2} />
      <P g={G.cyl} m={m.trunk} p={[-1.12, 0.18, -0.65]} s={[0.05, 0.36, 0.05]} />
      <P g={G.ico} m={m.tree} p={[-1.12, 0.55, -0.65]} s={0.3} />
    </group>
  )
}

function Overseas() {
  const pal = useMemo(
    () =>
      makePal({
        hull: '#e4704b',
        hullW: '#fbf7f0',
        cabin: '#fbf7f0',
        roof: '#8db6d9',
        mast: '#8a6a55',
        sail: { c: '#ffffff', side: THREE.DoubleSide },
        flag: { c: '#f5c95f', side: THREE.DoubleSide },
        globe: { c: '#ffffff', map: globeTex },
        stand: '#b98a5e',
        brass: '#e2b860',
        rock: { c: '#e2d8c8', flat: true },
        grass: '#bddb9f',
        palm: { c: '#86c08a', flat: true },
      }),
    [],
  )
  useGrey(5, pal.grey)
  const m = pal.m
  const ship = useRef<THREE.Group>(null)
  const globe = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ship.current) {
      ship.current.position.y = 0.06 + Math.sin(t * 1.6) * 0.035
      ship.current.rotation.z = Math.sin(t * 1.3) * 0.06
      ship.current.rotation.x = Math.sin(t * 1.1 + 1) * 0.04
    }
    if (globe.current) globe.current.rotation.y = t * 0.6
  })
  return (
    <group position={[0, 0.12, 0]}>
      <group ref={ship} position={[-0.3, 0.06, 0.32]} rotation={[0, -0.5, 0]}>
        <P g={G.rbox} m={m.hull} p={[0, 0.07, 0]} s={[0.95, 0.2, 0.4]} />
        <P g={G.rbox} m={m.hull} p={[0.48, 0.09, 0]} s={[0.3, 0.2, 0.3]} r={[0, Math.PI / 4, 0]} />
        <P m={m.hullW} p={[0.05, 0.18, 0]} s={[0.96, 0.03, 0.41]} cast={false} />
        <P g={G.rbox} m={m.cabin} p={[-0.22, 0.28, 0]} s={[0.32, 0.2, 0.28]} />
        <P m={m.roof} p={[-0.22, 0.39, 0]} s={[0.36, 0.04, 0.32]} />
        <P g={G.cyl} m={m.mast} p={[0.12, 0.62, 0]} s={[0.02, 0.9, 0.02]} />
        <mesh geometry={sailGeo} material={m.sail} position={[0.14, 0.26, 0]} castShadow />
        <Flag p={[0.12, 1.05, 0]} m={m.flag} w={0.24} h={0.13} phase={1} />
      </group>
      {/* islet with a globe */}
      <group position={[0.72, 0, -0.62]}>
        <P g={G.ico} m={m.rock} p={[0, 0.05, 0]} s={[0.5, 0.22, 0.45]} />
        <P g={G.cyl} m={m.grass} p={[0, 0.17, 0]} s={[0.36, 0.06, 0.36]} />
        <P g={G.cyl} m={m.stand} p={[0, 0.27, 0]} s={[0.16, 0.06, 0.16]} />
        <P g={G.cyl} m={m.stand} p={[0, 0.42, 0]} s={[0.03, 0.26, 0.03]} />
        <mesh geometry={G.ring} material={m.brass} position={[0, 0.88, 0]} rotation={[Math.PI / 2, 0.41, 0]} scale={0.44} />
        <group position={[0, 0.88, 0]} rotation={[0, 0, 0.41]}>
          <mesh ref={globe} geometry={G.ball} material={m.globe} scale={0.38} castShadow />
        </group>
      </group>
      <P g={G.cyl} m={m.mast} p={[-0.9, 0.35, -0.6]} s={[0.035, 0.7, 0.035]} r={[0, 0, 0.12]} />
      <P g={G.ico} m={m.palm} p={[-0.86, 0.74, -0.6]} s={[0.32, 0.12, 0.32]} />
    </group>
  )
}

function NextStop() {
  const pal = useMemo(
    () =>
      makePal({
        pole: '#b98a5e',
        a: '#e4704b',
        b: '#94cfb4',
        c: '#b8a8e3',
        q: '#f5b54a',
        glow: { c: '#fff1c4', basic: true },
        stone: '#e2d8c8',
        b1: '#8db6d9',
        b2: '#f5c95f',
        b3: '#f2a983',
      }),
    [],
  )
  useGrey(6, pal.grey)
  const m = pal.m
  const ghostMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f2a983', transparent: true, opacity: 0.22, depthWrite: false }), [])
  const q = useRef<THREE.Group>(null)
  const motes = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (q.current) {
      q.current.position.y = 1.75 + Math.sin(t * 1.6) * 0.1
      q.current.rotation.y = Math.sin(t * 0.8) * 0.6
    }
    motes.current.forEach((s, k) => {
      if (!s) return
      const u = (t * 0.22 + k / 5) % 1
      s.position.set(Math.sin(k * 2.1 + t * 0.4) * 0.9, 0.2 + u * 1.9, Math.cos(k * 1.7 + t * 0.3) * 0.7)
      s.scale.setScalar(0.04 * Math.sin(u * Math.PI))
    })
  })
  const boards: [number, number, THREE.Material][] = [
    [1.32, 0.5, m.a],
    [1.06, -0.75, m.b],
    [0.8, 2.3, m.c],
  ]
  return (
    <group position={[0, 0.12, 0]}>
      <P g={G.ico} m={m.stone} p={[-0.55, 0.08, 0.5]} s={[0.22, 0.14, 0.2]} />
      <P g={G.ico} m={m.stone} p={[0.6, 0.06, 0.62]} s={[0.16, 0.1, 0.14]} />
      <P g={G.cyl} m={m.pole} p={[0, 0.75, 0]} s={[0.05, 1.5, 0.05]} />
      <P g={G.cone} m={m.pole} p={[0, 1.54, 0]} s={[0.07, 0.1, 0.07]} />
      {boards.map(([y, a, mat], k) => (
        <group key={k} position={[0, y, 0]} rotation={[0, a, 0]}>
          <P g={G.rbox} m={mat} p={[0.36, 0, 0]} s={[0.62, 0.17, 0.05]} />
          <P m={mat} p={[0.67, 0, 0]} s={[0.12, 0.12, 0.05]} r={[0, 0, Math.PI / 4]} />
        </group>
      ))}
      {/* the next model — blocks waiting to be stacked inside a faint outline */}
      <group position={[-0.62, 0, -0.55]}>
        <mesh geometry={G.box} material={ghostMat} position={[0, 0.5, 0]} scale={[0.9, 1.0, 0.9]} />
        <P g={G.rbox} m={m.b1} p={[-0.18, 0.15, 0.15]} s={0.3} />
        <P g={G.rbox} m={m.b2} p={[0.17, 0.15, 0.12]} s={0.3} />
        <P g={G.rbox} m={m.b3} p={[0, 0.45, 0.12]} s={0.3} r={[0, 0.3, 0]} />
      </group>
      <P g={G.rbox} m={m.b2} p={[0.55, 0.12, -0.75]} s={0.24} r={[0, 0.6, 0]} />
      <P g={G.rbox} m={m.b1} p={[-0.95, 0.12, 0.35]} s={0.24} r={[0, -0.4, 0]} />
      <group ref={q} position={[0.75, 1.75, 0.2]} scale={1.35}>
        <mesh geometry={qGeo} material={m.q} position={[0, 0.16, 0]} castShadow />
        <P g={G.cyl} m={m.q} p={[0, -0.13, 0]} s={[0.075, 0.18, 0.075]} />
        <P g={G.ball} m={m.q} p={[0, -0.36, 0]} s={0.085} />
      </group>
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh key={k} ref={(el) => void (motes.current[k] = el!)} geometry={G.ball} material={m.glow} />
      ))}
    </group>
  )
}

/* ================================================================== ambient: clouds + start flag */
const CLOUDS = Array.from({ length: 14 }, (_, k) => ({
  x: rnd(k * 3.1) * 80 - 20,
  y: -3 - rnd(k * 5.3) * 4,
  z: (k % 2 ? 1 : -1) * (7 + rnd(k * 7.7) * 9),
  s: 0.45 + rnd(k * 2.2) * 0.5,
  v: 0.25 + rnd(k * 9.4) * 0.35,
  puffs: [0, 1, 2, 3].map((j) => [(j - 1.5) * 0.8 + rnd(k + j) * 0.3, rnd(k * j + 1) * 0.35, (rnd(k * 1.3 + j) - 0.5) * 0.8, 0.55 + rnd(k * 4 + j) * 0.45] as [number, number, number, number]),
}))
function Clouds() {
  const S = useS()
  const refs = useRef<THREE.Group[]>([])
  const mat = useMemo(() => lam(C.cloud, { emissive: new THREE.Color('#fbf6ef'), emissiveIntensity: 0.85 }), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const span = 80
    CLOUDS.forEach((c, k) => {
      const g = refs.current[k]
      if (!g) return
      const base = c.x + t * c.v - (S.target.x - 40)
      const x = S.target.x - 40 + (((base % span) + span) % span)
      g.position.set(x, c.y + Math.sin(t * 0.4 + k) * 0.15, S.target.z * 0.6 + c.z)
    })
  })
  return (
    <>
      {CLOUDS.map((c, k) => (
        <group key={k} ref={(el) => void (refs.current[k] = el!)} scale={c.s}>
          {c.puffs.map(([x, y, z, r], j) => (
            <mesh key={j} geometry={G.ball} material={mat} position={[x, y, z]} scale={[r, r * 0.7, r]} />
          ))}
        </group>
      ))}
    </>
  )
}

function StartFlag() {
  const mats = useMemo(() => ({ pole: lam('#8a6a55'), flag: lam('#e8704a', { side: THREE.DoubleSide }), stone: lam(C.stone) }), [])
  const p = curve.getPoint(0.004)
  return (
    <group position={[p.x - 0.7, 0, p.z + 0.4]}>
      <P g={G.cyl} m={mats.stone} p={[0, 0.06, 0]} s={[0.22, 0.12, 0.22]} />
      <P g={G.cyl} m={mats.pole} p={[0, 0.6, 0]} s={[0.025, 1.1, 0.025]} />
      <Flag p={[0, 1.02, 0]} m={mats.flag} w={0.46} h={0.28} phase={2} />
    </group>
  )
}

function Scene({ progress }: { progress: MotionValue<number> }) {
  return (
    <>
      <Driver progress={progress} />
      <Rig />
      <Lights />
      <Island />
      <PathTiles />
      <StartFlag />
      <Station i={0} H={1.4}>
        <Desk />
      </Station>
      <Station i={1} H={1.9}>
        <Garage />
      </Station>
      <Station i={2} H={2.0}>
        <FirstUser />
      </Station>
      <Station i={3} H={2.1}>
        <SeedRound />
      </Station>
      <Station i={4} H={2.2}>
        <Office />
      </Station>
      <Station i={5} H={1.5} water>
        <Overseas />
      </Station>
      <Station i={6} H={2.2}>
        <NextStop />
      </Station>
      <Walker />
      <Clouds />
    </>
  )
}

/* ================================================================== page */
const cardV = {
  enter: (d: number) => ({ opacity: 0, y: d * 34, filter: 'blur(6px)' }),
  center: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, y: d * -34, filter: 'blur(6px)' }),
}

export default function ScrollTimeline() {
  const scroller = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ container: scroller })
  const smooth = useSpring(scrollYProgress, { stiffness: 70, damping: 20, mass: 0.7 })
  const shared = useMemo<Shared>(
    () => ({ f: 0, u: uOfF(0), arc: 0, pos: new THREE.Vector3(), tan: new THREE.Vector3(1, 0, 0), target: new THREE.Vector3(), speed: 0, dir: 1, walk: 0, init: false }),
    [],
  )
  const [active, setActive] = useState(0)
  const dir = useRef(1)
  useMotionValueEvent(smooth, 'change', (v) => {
    rail.current?.style.setProperty('--p', String(clamp01(v)))
    const k = Math.round(stationFloat(v))
    setActive((prev) => {
      if (prev !== k) dir.current = k > prev ? 1 : -1
      return k
    })
  })
  const hint = useTransform(scrollYProgress, [0, 0.03], [1, 0])

  const goTo = (i: number) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ top: (i / (N - 1)) * (el.scrollHeight - el.clientHeight), behavior: 'smooth' })
  }
  const s = STOPS[active]

  return (
    <div ref={scroller} className="stage st-root" style={{ overflowY: 'auto', overflowX: 'hidden' }}>
      <div className="st-sticky">
        <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 400, position: [60, 60, 60] }} gl={{ antialias: true, alpha: true }}>
          <SCtx.Provider value={shared}>
            <Scene progress={smooth} />
          </SCtx.Provider>
        </Canvas>

        <div className="overlay st-ui">
          <div className="st-panel">
            <p className="st-kicker">
              <i /> 一家小公司的七年
            </p>
            <div className="st-deck">
              <AnimatePresence initial={false} custom={dir.current}>
                <motion.article
                  key={active}
                  className="st-card"
                  custom={dir.current}
                  variants={cardV}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="st-meta">
                    <span>
                      第 {String(active + 1).padStart(2, '0')} 站<em> / {String(N).padStart(2, '0')}</em>
                    </span>
                    <b>{s.tag}</b>
                  </div>
                  <div className="st-head">
                    <div className="st-year">{s.year}</div>
                    <h2>{s.title}</h2>
                  </div>
                  <p>{s.text}</p>
                </motion.article>
              </AnimatePresence>
            </div>
          </div>

          <nav ref={rail} className="st-rail" aria-label="年份">
            <div className="st-track">
              <div className="st-fill" />
            </div>
            <div className="st-knob" />
            {STOPS.map((st, i) => (
              <button
                key={st.year}
                className="st-tick"
                data-on={i === active || undefined}
                data-past={i < active || undefined}
                style={{ ['--k' as string]: i / (N - 1) }}
                onClick={() => goTo(i)}
                aria-label={`跳到 ${st.year} ${st.title}`}
              >
                <i />
                <span>{st.year}</span>
              </button>
            ))}
          </nav>

          <motion.div className="st-hint" style={{ opacity: hint }}>
            <span>向下滚动</span>
            <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden>
              <rect x="1" y="1" width="12" height="18" rx="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <rect className="st-wheel" x="6" y="4.5" width="2" height="4" rx="1" fill="currentColor" />
            </svg>
          </motion.div>
        </div>
      </div>
      <div style={{ height: `calc(100dvh + ${(N - 1) * SECTION_VH}vh)` }} />

      <style>{`
        .st-root { --soft-bg: #f6f0e7; --st-acc: ${ACC};
          background: radial-gradient(120% 80% at 70% 18%, #fbf7f1 0%, #f4eee5 45%, #ebe1d4 100%); scrollbar-width: none; }
        .st-root::-webkit-scrollbar { display: none; }
        .st-sticky { position: sticky; top: 0; height: 100dvh; margin-bottom: -100dvh; }
        .st-ui { z-index: 2; }
        .st-ui > * { pointer-events: none; }
        .st-panel { position: absolute; left: clamp(24px, 6vw, 96px); top: 50%; transform: translateY(-50%);
          width: min(400px, calc(100% - 48px)); }
        .st-kicker { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 12px; padding: 8px 12px; border-radius: 999px;
          background: rgba(255, 252, 247, .72); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 0 0 1px rgba(60, 45, 30, .06); font: 500 12px/1 var(--sans); letter-spacing: .02em; color: var(--ink-2); }
        .st-kicker i { width: 6px; height: 6px; border-radius: 50%; background: var(--st-acc); }
        .st-deck { position: relative; height: 292px; }
        .st-card { position: absolute; inset: 0 0 auto 0; padding: 24px 26px 26px; border-radius: 22px;
          background: rgba(255, 252, 247, .8); backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3);
          box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 0 0 1px rgba(60, 45, 30, .06), 0 24px 48px -28px rgba(90, 60, 30, .35);
          color: var(--ink); will-change: transform, opacity, filter; }
        .st-meta { display: flex; align-items: center; justify-content: space-between; font: 500 12px/1 var(--mono); color: var(--ink-2); }
        .st-meta em { color: var(--ink-3); }
        .st-meta b { font: 500 12px/1 var(--sans); padding: 6px 10px; border-radius: 999px; color: var(--st-acc);
          background: color-mix(in srgb, var(--st-acc) 11%, transparent); }
        .st-year { margin-top: 18px; font: 700 64px/1 var(--display); letter-spacing: -.04em; color: var(--st-acc);
          font-variant-numeric: tabular-nums; }
        .st-card h2 { margin: 10px 0 0; font: 600 28px/1.15 var(--display); letter-spacing: -.02em; }
        .st-card p { margin: 12px 0 0; font-size: 15px; line-height: 1.7; color: var(--ink-2); }

        .st-rail { --p: 0; position: absolute; right: clamp(20px, 3vw, 44px); top: 50%; transform: translateY(-50%);
          width: 64px; height: min(52vh, 440px); }
        .st-rail::before { content: ''; position: absolute; inset: -22px -12px -22px -14px; border-radius: 20px;
          background: rgba(255, 252, 247, .62); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 0 0 1px rgba(60, 45, 30, .06); }
        .st-track { position: absolute; right: 7px; top: 0; bottom: 0; width: 2px; border-radius: 2px; background: rgba(60, 45, 30, .12); overflow: hidden; }
        .st-fill { position: absolute; inset: 0; background: var(--st-acc); transform-origin: top; transform: scaleY(var(--p)); }
        .st-knob { position: absolute; right: 2px; top: calc(var(--p) * 100%); width: 12px; height: 12px; margin-top: -6px; border-radius: 50%;
          background: #fff; box-shadow: 0 0 0 3px var(--st-acc), 0 4px 12px rgba(217, 101, 59, .4); }
        .st-tick { pointer-events: auto; position: absolute; right: 0; top: calc(var(--k) * 100%); transform: translateY(-50%);
          display: flex; align-items: center; flex-direction: row-reverse; gap: 10px; height: 28px; padding: 0 0 0 8px; border: 0;
          background: none; cursor: pointer; color: var(--ink-3); font: 500 12px/1 var(--mono); }
        .st-tick i { width: 16px; height: 16px; display: grid; place-items: center; }
        .st-tick i::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #fff;
          box-shadow: 0 0 0 1.5px rgba(60, 45, 30, .25); transition: transform .3s var(--ease-out), background .3s, box-shadow .3s; }
        .st-tick[data-past] i::after { background: var(--st-acc); box-shadow: 0 0 0 1.5px var(--st-acc); }
        .st-tick span { transition: color .25s, transform .3s var(--ease-out); }
        .st-tick:hover span { color: var(--ink); transform: translateX(-2px); }
        .st-tick[data-on] span { color: var(--ink); font-weight: 600; }
        .st-tick:focus-visible { outline: 2px solid var(--st-acc); outline-offset: 2px; border-radius: 6px; }

        .st-hint { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
          padding: 9px 14px; border-radius: 999px; background: rgba(255, 252, 247, .7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 0 0 1px rgba(60, 45, 30, .07); font: 500 13px/1 var(--sans); color: var(--ink-2); }
        .st-wheel { animation: st-wheel 1.6s var(--ease-out) infinite; }
        @keyframes st-wheel { 0% { transform: translateY(0); opacity: 1 } 70% { transform: translateY(5px); opacity: 0 } 100% { transform: translateY(0); opacity: 0 } }

        @media (max-width: 760px) {
          .st-panel { left: 16px; right: 16px; top: auto; bottom: 16px; transform: none; width: auto; }
          .st-kicker { display: none; }
          .st-deck { height: 156px; }
          .st-card { inset: auto 0 0 0; padding: 16px 18px 18px; border-radius: 18px; }
          .st-head { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; }
          .st-year { margin: 0; font-size: 30px; }
          .st-card h2 { margin: 0; font-size: 20px; }
          .st-card p { margin-top: 8px; font-size: 13.5px; line-height: 1.65; }
          .st-meta b { padding: 5px 9px; font-size: 11px; }
          .st-rail { right: 34px; left: 34px; top: auto; bottom: 186px; transform: none; width: auto; height: 34px; }
          .st-track { right: 0; left: 0; top: 7px; bottom: auto; width: auto; height: 2px; }
          .st-fill { transform-origin: left; transform: scaleX(var(--p)); }
          .st-knob { right: auto; top: 2px; left: calc(var(--p) * 100%); margin: 0 0 0 -6px; }
          .st-tick { right: auto; top: 0; left: calc(var(--k) * 100%); transform: translateX(-50%); flex-direction: column; gap: 4px;
            height: auto; padding: 0; font-size: 10px; }
          .st-tick:hover span { transform: none; }
          .st-rail::before { inset: -10px -18px -8px; border-radius: 16px; }
          .st-hint { bottom: auto; top: 80px; padding: 7px 12px; font-size: 12px; }
        }
        @media (prefers-reduced-motion: reduce) { .st-wheel { animation: none; } }
      `}</style>
    </div>
  )
}
