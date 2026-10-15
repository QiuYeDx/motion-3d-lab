import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { boardInside, edgeCanvas, paintCover, paintedSpread, paintSpread, SPREAD_LABELS, SPREADS, tableCanvas } from './flipBookArt'

/* ------------------------------------------------------------------ book dimensions (book space: spine on Y, pages along ±X, up = +Z) */

const NL = 10 // paper leaves
const NLEAF = NL + 1 // + rigid front cover at index 0
const PW = 1
const PH = 1.38
const TH = 0.0075 // one leaf of paper
const BRD = 0.026 // board thickness
const MRG = 0.035 // board overhang
const STACK = NL * TH
const ZP = BRD + STACK / 2 // cover hinge height
const SX = 30
const SY = 12
const BOW = 0.24 // gutter curve of an open book
const BG = '#efe6d8'

const clamp = THREE.MathUtils.clamp
const zr = (j: number) => BRD + (NL - j) * TH // paper leaf j resting on the right stack (spine height)
const zl = (j: number) => BRD + (j + 1) * TH // … and on the left stack

/* ------------------------------------------------------------------ page-turn model
 * Each row of the sheet (along the spine) is a curve integrated from the spine outward. Its tangent angle is
 *   α(s) = π·f + bow·(1−s)³·(1−2f),   f = smooth(τ_row·(1+λ) − λ·(1−s))
 * so the free edge leads the turn (λ) — a cylindrical curl that travels across the sheet. Rows lag behind the
 * row under the pointer (`lead`) in proportion to their distance, which tilts the curl axis → a conical,
 * corner-first page turn. τ = 0 rests on the right stack, τ = 1 on the left. */

type Pose = { tau: number; lead: number; curl: number; lam: number; bow: number; z0: number; z1: number }

function poseSheet(pos: Float32Array, p: Pose) {
  const { tau, lead, curl, lam, bow } = p
  const zb = p.z0 + (p.z1 - p.z0) * tau + Math.sin(Math.PI * tau) * 0.014
  const c = curl * Math.pow(Math.sin(Math.PI * tau), 0.7)
  const ds = PW / SX
  for (let iy = 0; iy <= SY; iy++) {
    const v = iy / SY - 0.5
    const y = v * PH
    const tr = clamp(tau + c * (0.3 - Math.abs(v - lead)), 0, 1)
    let x = 0
    let z = zb
    let k = iy * (SX + 1) * 3
    pos[k] = 0
    pos[k + 1] = y
    pos[k + 2] = zb
    for (let ix = 1; ix <= SX; ix++) {
      const sm = (ix - 0.5) / SX
      let f = clamp(tr * (1 + lam) - lam * (1 - sm), 0, 1)
      f = f * f * (3 - 2 * f)
      const r = 1 - sm
      const a = Math.PI * f + bow * r * r * r * (1 - 2 * f)
      x += Math.cos(a) * ds
      z += Math.sin(a) * ds
      k += 3
      pos[k] = x
      pos[k + 1] = y
      pos[k + 2] = z
    }
  }
}

/** edge x of the lead row as a function of τ, inverted by table lookup so a dragged page tracks the pointer */
function makeEdgeTable(curl: number, lam: number) {
  const n = 96
  const xs = new Float32Array(n + 1)
  const ds = PW / SX
  for (let k = 0; k <= n; k++) {
    const tau = k / n
    const c = curl * Math.pow(Math.sin(Math.PI * tau), 0.7)
    const tr = clamp(tau + c * 0.3, 0, 1)
    let x = 0
    for (let ix = 1; ix <= SX; ix++) {
      const sm = (ix - 0.5) / SX
      let f = clamp(tr * (1 + lam) - lam * (1 - sm), 0, 1)
      f = f * f * (3 - 2 * f)
      const r = 1 - sm
      x += Math.cos(Math.PI * f + BOW * r * r * r * (1 - 2 * f)) * ds
    }
    xs[k] = x
  }
  return (edge: number) => {
    // xs is (nearly) monotone decreasing from +PW to −PW
    if (edge >= xs[0]) return 0
    for (let k = 1; k <= n; k++) {
      if (xs[k] <= edge) {
        const a = xs[k - 1]
        const b = xs[k]
        return (k - 1 + (a - edge) / Math.max(1e-6, a - b)) / n
      }
    }
    return 1
  }
}

const DRAG_CURL = 0.5
const DRAG_LAM = 0.55
const edgeToTau = makeEdgeTable(DRAG_CURL, DRAG_LAM)

/* ------------------------------------------------------------------ geometry helpers */

function sheetGeometry() {
  const n = (SX + 1) * (SY + 1)
  const pos = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  const idx: number[] = []
  for (let iy = 0; iy <= SY; iy++)
    for (let ix = 0; ix <= SX; ix++) {
      const i = iy * (SX + 1) + ix
      uv[i * 2] = ix / SX
      uv[i * 2 + 1] = iy / SY
    }
  for (let iy = 0; iy < SY; iy++)
    for (let ix = 0; ix < SX; ix++) {
      const a = iy * (SX + 1) + ix
      const b = a + 1
      const c = a + SX + 2
      const d = a + SX + 1
      idx.push(a, b, d, b, c, d)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** page-block edges: near face, far face and fore-edge, top following the resting (bowed) sheet profile */
function blockGeometry() {
  const nv = (SX + 1) * 2 * 2 + 4
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2).setUsage(THREE.DynamicDrawUsage))
  const idx: number[] = []
  for (let f = 0; f < 2; f++) {
    const o = f * (SX + 1) * 2
    for (let ix = 0; ix < SX; ix++) {
      const b0 = o + ix * 2
      idx.push(b0, b0 + 2, b0 + 3, b0, b0 + 3, b0 + 1)
    }
  }
  const e = (SX + 1) * 4
  idx.push(e, e + 2, e + 3, e, e + 3, e + 1)
  g.setIndex(idx)
  return g
}

function writeBlock(g: THREE.BufferGeometry, rx: Float32Array, rz: Float32Array, sign: number, top: number) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  const P = pos.array as Float32Array
  const U = uv.array as Float32Array
  const vs = 1 / (TH * 16) // edge texture: 16 sheets per tile
  let k = 0
  const put = (x: number, y: number, z: number, u: number) => {
    P[k * 3] = x
    P[k * 3 + 1] = y
    P[k * 3 + 2] = z
    U[k * 2] = u
    U[k * 2 + 1] = (z - BRD) * vs
    k++
  }
  for (const y of [-PH / 2, PH / 2])
    for (let ix = 0; ix <= SX; ix++) {
      const x = rx[ix] * sign
      put(x, y, BRD, ix / SX)
      put(x, y, Math.max(BRD, top + rz[ix]), ix / SX)
    }
  const xe = rx[SX] * sign
  const ze = Math.max(BRD, top + rz[SX])
  put(xe, -PH / 2, BRD, 0)
  put(xe, -PH / 2, ze, 0)
  put(xe, PH / 2, BRD, 1)
  put(xe, PH / 2, ze, 1)
  pos.needsUpdate = true
  uv.needsUpdate = true
  g.computeVertexNormals()
}

function canvasTex(c: HTMLCanvasElement, aniso: number) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  return t
}

/* ------------------------------------------------------------------ book state */

type Leaf = {
  t: MotionValue<number>
  anim: AnimationPlaybackControls | null
  target: number
  lead: number
  leadT: number
  curl: number
  lam: number
  peel: number
  peelT: number
  last: Pose
}

type Book = {
  leaves: Leaf[]
  speed: number
  lastUser: number
  drag: null | { leaf: number; sGrab: number; x0: number; y0: number; moved: boolean; t: number; tau: number; vel: number; lt: number; lx: number; vx: number }
  hoverPeel: { leaf: number; amt: number; lead: number }
  ready: boolean
}

const newLeaf = (t: number): Leaf => ({
  t: motionValue(t),
  anim: null,
  target: t,
  lead: -0.3,
  leadT: -0.3,
  curl: 0.35,
  lam: 0.45,
  peel: 0,
  peelT: 0,
  last: { tau: -1, lead: 0, curl: 0, lam: 0, bow: -1, z0: 0, z1: 0 },
})

const posOf = (b: Book) => b.leaves.reduce((n, l) => n + (l.target > 0.5 ? 1 : 0), 0)

function springFor(b: Book, i: number) {
  const sp = b.speed
  return i === 0 ? { stiffness: 34 * sp * sp, damping: 10 * sp } : { stiffness: 40 * sp * sp, damping: 10.5 * sp }
}

function turnLeaf(b: Book, i: number, target: number, opts: { velocity?: number; delay?: number; lead?: number } = {}) {
  const L = b.leaves[i]
  L.anim?.stop()
  L.target = target
  if (opts.lead !== undefined) L.leadT = opts.lead
  if (b.drag?.leaf !== i) {
    L.curl = 0.36
    L.lam = 0.42
  }
  L.anim = animate(L.t, target, { type: 'spring', ...springFor(b, i), velocity: (opts.velocity ?? 0) * 1, delay: opts.delay ?? 0, restDelta: 0.0005, restSpeed: 0.002 })
}

/** turn to spread position p (0 = closed, k = k leaves turned), staggering leaves like a riffle */
function goTo(b: Book, p: number, stagger = 0.09) {
  p = clamp(Math.round(p), 0, NLEAF)
  const cur = posOf(b)
  if (p === cur) return
  const st = stagger / Math.max(0.35, b.speed)
  if (p > cur) for (let i = cur, k = 0; i < p; i++, k++) turnLeaf(b, i, 1, { delay: k * st, lead: -0.32 + Math.sin(i * 1.7) * 0.06 })
  else for (let i = cur - 1, k = 0; i >= p; i--, k++) turnLeaf(b, i, 0, { delay: k * st, lead: -0.32 + Math.sin(i * 1.3) * 0.06 })
}

/* ------------------------------------------------------------------ scene */

type Res = ReturnType<typeof useResources>

function useResources() {
  return useMemo(() => {
    const ph = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 4
      const g = c.getContext('2d')!
      g.fillStyle = '#f7f2e9'
      g.fillRect(0, 0, 4, 4)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })()
    const paperMat = (side: THREE.Side) => {
      const m = new THREE.MeshStandardMaterial({ map: ph, roughness: 0.88, metalness: 0, side })
      m.shadowSide = THREE.DoubleSide
      return m
    }
    const sheets = Array.from({ length: NL }, () => ({ geo: sheetGeometry(), front: paperMat(THREE.FrontSide), back: paperMat(THREE.BackSide) }))
    const cloth = new THREE.MeshStandardMaterial({ color: '#6f4a30', roughness: 0.75 })
    const coverOut = new THREE.MeshStandardMaterial({ map: ph, roughness: 0.62, metalness: 0 })
    const coverIn = new THREE.MeshStandardMaterial({ map: ph, roughness: 0.9 })
    const backIn = new THREE.MeshStandardMaterial({ map: ph, roughness: 0.9 })
    const edgeTex = new THREE.CanvasTexture(edgeCanvas())
    edgeTex.colorSpace = THREE.SRGBColorSpace
    edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95, side: THREE.DoubleSide })
    const tableTex = new THREE.CanvasTexture(tableCanvas())
    tableTex.colorSpace = THREE.SRGBColorSpace
    tableTex.wrapS = tableTex.wrapT = THREE.RepeatWrapping
    tableTex.repeat.set(14, 14)
    tableTex.anisotropy = 8
    const table = new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.95, color: '#ffffff' })
    const boardGeo = new THREE.BoxGeometry(PW + MRG, PH + 2 * MRG, BRD)
    return {
      ph,
      sheets,
      cloth,
      coverOut,
      coverIn,
      backIn,
      edgeMat,
      table,
      boardGeo,
      // box face order: +x −x +y −y +z −z
      coverMats: [cloth, cloth, cloth, cloth, coverOut, coverIn],
      backMats: [cloth, cloth, cloth, cloth, backIn, cloth],
      blockR: blockGeometry(),
      blockL: blockGeometry(),
    }
  }, [])
}

function BookScene({ B, res, onReady, onPainted }: { B: Book; res: Res; onReady: () => void; onPainted: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const root = useRef<THREE.Group>(null)
  const cover = useRef<THREE.Group>(null)
  const spine = useRef<THREE.Mesh>(null)
  const meshes = useRef<{ f: THREE.Mesh | null; b: THREE.Mesh | null }[]>(Array.from({ length: NL }, () => ({ f: null, b: null })))
  const blockR = useRef<THREE.Mesh>(null)
  const blockL = useRef<THREE.Mesh>(null)
  const st = useMemo(() => ({ rx: new Float32Array(SX + 1), rz: new Float32Array(SX + 1), bow: -1, cam: null as null | number[], blk: [-1, -1] }), [])

  // paint textures (one spread per frame, uploaded right away), compile programs in the background, then reveal
  useEffect(() => {
    let alive = true
    let compiled = false
    let painted = 0
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    const reveal = () => {
      if (!alive || B.ready || !compiled || painted < 3) return
      B.ready = true
      root.current!.visible = true
      onReady()
    }
    const jobs: (() => void)[] = []
    jobs.push(() => {
      const t = canvasTex(paintCover(), aniso)
      gl.initTexture(t)
      res.coverOut.map = t
    })
    for (let s = 0; s < SPREADS; s++)
      jobs.push(() => {
        const { left, right } = paintSpread(s)
        const mx = MRG / (PW + MRG)
        const my = MRG / (PH + 2 * MRG)
        const tl = canvasTex(s === 0 ? boardInside(left, mx, my, false) : left, aniso)
        const tr = canvasTex(s === SPREADS - 1 ? boardInside(right, mx, my, true) : right, aniso)
        if (s === 0) res.coverIn.map = tl
        else {
          // verso of leaf s−1: seen from below the sheet's front, so mirror u
          tl.repeat.set(-1, 1)
          tl.offset.set(1, 0)
          res.sheets[s - 1].back.map = tl
        }
        if (s < NL) res.sheets[s].front.map = tr
        else res.backIn.map = tr
        gl.initTexture(tl)
        gl.initTexture(tr)
      })
    const step = () => {
      if (!alive) return
      jobs[painted]()
      painted++
      onPainted()
      reveal()
      if (painted < jobs.length) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)

    const g = root.current!
    g.visible = true
    const job = gl.compileAsync(scene, camera)
    g.visible = false
    job
      .catch(() => {})
      .then(() => {
        compiled = true
        reveal()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, res])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const { width, height } = state.size
    const aspect = width / height
    const mobile = width < 760

    // ---- camera
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const el = mobile ? 1.2 : 0.98
    const fitW = POSTER ? 2.3 : mobile ? 2.2 : 2.45 / 0.66
    let dist = Math.max(mobile || POSTER ? 0 : 4.7, fitW / (2 * tanH * aspect))
    dist = Math.max(dist, (POSTER ? 2.05 : 2.2) / (2 * tanH))
    const t = state.clock.elapsedTime
    const breathe = POSTER ? 0 : Math.sin(t * 0.2) * 0.04
    const px = POSTER ? 0 : state.pointer.x * 0.05
    const target = [px + breathe, el + (POSTER ? 0 : state.pointer.y * 0.03), dist]
    if (!st.cam) st.cam = target.slice()
    for (let k = 0; k < 3; k++) st.cam[k] = THREE.MathUtils.damp(st.cam[k], target[k], 3, dt)
    const [az, e, d] = st.cam
    // a closed book sits right of the spine: pan so whatever is lying on the table stays centred
    const shift = (1 - clamp(B.leaves[0].t.get(), 0, 1)) * (PW + MRG) * 0.5
    camera.position.set(shift + Math.sin(az) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(az) * Math.cos(e) * d)
    camera.lookAt(shift, 0.05, 0.06)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.07 : 0.02
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()

    // ---- leaves
    const leaves = B.leaves
    const open = clamp(leaves[0].t.get(), 0, 1)
    const bow = BOW * Math.min(1, open * 1.4)
    if (Math.abs(bow - st.bow) > 1e-5) {
      // resting sheet profile (for the page-block tops)
      st.bow = bow
      const ds = PW / SX
      let x = 0
      let z = 0
      st.rx[0] = 0
      st.rz[0] = 0
      for (let ix = 1; ix <= SX; ix++) {
        const r = 1 - (ix - 0.5) / SX
        const a = bow * r * r * r
        x += Math.cos(a) * ds
        z += Math.sin(a) * ds
        st.rx[ix] = x
        st.rz[ix] = z
      }
      st.blk[0] = st.blk[1] = -1
    }

    // hover peel follows the pointer gently
    for (let i = 0; i < NLEAF; i++) {
      const L = leaves[i]
      const hp = B.hoverPeel
      L.peelT = hp.leaf === i && L.anim?.state !== 'running' && B.drag?.leaf !== i ? hp.amt : 0
      L.peel = THREE.MathUtils.damp(L.peel, L.peelT, 9, dt)
      if (hp.leaf === i) L.leadT = hp.lead
      L.lead = THREE.MathUtils.damp(L.lead, L.leadT, 7, dt)
    }

    // effective τ (with peel) and stack tops
    let jr = NL // first paper leaf still flat on the right
    let jl = -1 // last paper leaf flat on the left
    for (let j = 0; j < NL; j++) {
      const L = leaves[j + 1]
      const tau = L.t.get() + L.peel
      if (tau <= 1e-4 && jr === NL) jr = j
      if (tau >= 1 - 1e-4) jl = j
    }

    // cover: rigid board on a hinge (+ spine strip that flattens as it opens)
    const tc = clamp(leaves[0].t.get() + leaves[0].peel, -0.05, 1.05)
    cover.current!.rotation.y = -Math.PI * tc
    const sh = THREE.MathUtils.lerp(2 * BRD + STACK, BRD * 0.6, clamp(tc * 1.6, 0, 1))
    spine.current!.scale.z = sh
    spine.current!.position.z = sh / 2

    for (let j = 0; j < NL; j++) {
      const L = leaves[j + 1]
      const m = meshes.current[j]
      if (!m.f || !m.b) continue
      const tau = clamp(L.t.get() + L.peel, 0, 1)
      const flying = tau > 1e-4 && tau < 1 - 1e-4
      const vis = flying || j === jr || j === jl
      m.f.visible = m.b.visible = vis
      if (!vis) continue
      const lp = L.last
      if (Math.abs(lp.tau - tau) < 1e-6 && Math.abs(lp.lead - L.lead) < 1e-5 && lp.bow === bow && lp.curl === L.curl && lp.lam === L.lam) continue
      lp.tau = tau
      lp.lead = L.lead
      lp.curl = L.curl
      lp.lam = L.lam
      lp.bow = bow
      lp.z0 = zr(j)
      lp.z1 = zl(j)
      const geo = res.sheets[j].geo
      poseSheet(geo.attributes.position.array as Float32Array, lp)
      geo.attributes.position.needsUpdate = true
      geo.computeVertexNormals()
    }

    // page blocks under the top sheets
    const rTop = jr < NL ? zr(jr) - 0.0016 : -1
    const lTop = jl >= 0 ? zl(jl) - 0.0016 : -1
    blockR.current!.visible = rTop > BRD + 0.001
    blockL.current!.visible = lTop > BRD + 0.001
    if (blockR.current!.visible && st.blk[0] !== rTop) {
      writeBlock(res.blockR, st.rx, st.rz, 1, rTop)
      st.blk[0] = rTop
    }
    if (blockL.current!.visible && st.blk[1] !== lTop) {
      writeBlock(res.blockL, st.rx, st.rz, -1, lTop)
      st.blk[1] = lTop
    }
  })

  return (
    <group ref={root} visible={false}>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001} material={res.table} receiveShadow>
        <planeGeometry args={[30, 30]} />
      </mesh>
      <group rotation-x={-Math.PI / 2}>
        {/* back board (static, right) */}
        <mesh geometry={res.boardGeo} material={res.backMats} position={[(PW + MRG) / 2, 0, BRD / 2]} castShadow receiveShadow />
        {/* spine strip */}
        <mesh ref={spine} position={[-0.004, 0, 0]} castShadow material={res.cloth}>
          <boxGeometry args={[0.012, PH + 2 * MRG, 1]} />
        </mesh>
        {/* front cover on its hinge */}
        <group ref={cover} position={[0, 0, ZP]}>
          <mesh geometry={res.boardGeo} material={res.coverMats} position={[(PW + MRG) / 2, 0, STACK / 2 + BRD / 2]} castShadow receiveShadow />
        </group>
        {/* page blocks */}
        <mesh ref={blockR} geometry={res.blockR} material={res.edgeMat} castShadow receiveShadow frustumCulled={false} />
        <mesh ref={blockL} geometry={res.blockL} material={res.edgeMat} castShadow receiveShadow frustumCulled={false} />
        {/* sheets */}
        {res.sheets.map((s, j) => (
          <group key={j}>
            <mesh ref={(m) => void (meshes.current[j].f = m)} geometry={s.geo} material={s.front} castShadow receiveShadow frustumCulled={false} />
            <mesh ref={(m) => void (meshes.current[j].b = m)} geometry={s.geo} material={s.back} receiveShadow frustumCulled={false} />
          </group>
        ))}
      </group>
    </group>
  )
}

function Lights() {
  return (
    <>
      <hemisphereLight args={['#fff4e6', '#c9b49a', 1.25]} />
      <directionalLight
        position={[-1.7, 3.4, 1.6]}
        intensity={2.3}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={9}
        shadow-radius={5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
      />
      <directionalLight position={[2.5, 2, 3]} intensity={0.35} color="#e8eeff" />
    </>
  )
}

/* ------------------------------------------------------------------ DOM: table of contents strip */

function Thumb({ s, painted }: { s: number; painted: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const g = c.getContext('2d')!
    const src = s < 0 ? (painted > 0 ? paintCover() : null) : paintedSpread(s)
    g.fillStyle = '#efe7da'
    g.fillRect(0, 0, c.width, c.height)
    if (src) g.drawImage(src, 0, 0, c.width, c.height)
  }, [s, painted])
  return <canvas ref={ref} width={s < 0 ? 48 : 96} height={66} />
}

/* ------------------------------------------------------------------ page */

const pageLabel = (p: number) => {
  if (p <= 0) return '封面'
  const s = p - 1
  if (s === 0) return '扉页 · 01'
  if (s === SPREADS - 1) return '20 · 完'
  return `${String(2 * s).padStart(2, '0')} – ${String(2 * s + 1).padStart(2, '0')}`
}

export default function FlipBook() {
  const res = useResources()
  const B = useMemo<Book>(() => {
    const leaves = Array.from({ length: NLEAF }, (_, i) => newLeaf(POSTER ? (i < 4 ? 1 : 0) : 0))
    if (POSTER) {
      const L = leaves[4]
      L.t.set(0.36)
      L.lead = L.leadT = -0.5
      L.curl = 0.32
      L.lam = 0.5
    }
    return { leaves, speed: 1, lastUser: performance.now(), drag: null, hoverPeel: { leaf: -1, amt: 0, lead: 0 }, ready: false }
  }, [])
  const [pos, setPos] = useState(POSTER ? 4 : 0)
  const [toc, setToc] = useState(false)
  const [slow, setSlow] = useState<'n' | 's'>('n')
  const [painted, setPainted] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)

  const user = () => (B.lastUser = performance.now())
  const sync = () => setPos(posOf(B))
  const go = (p: number, stagger?: number) => {
    goTo(B, p, stagger)
    sync()
  }

  useEffect(() => {
    B.speed = slow === 's' ? 0.33 : 1
  }, [slow, B])

  // keep the DOM page label in step when leaves are turned by drags / flicks
  useEffect(() => {
    const id = setInterval(() => setPos(posOf(B)), 200)
    return () => clearInterval(id)
  }, [B])

  const onReady = () => {
    if (POSTER) return
    setTimeout(() => go(1), 450)
  }

  // idle: keep leafing through, riffle back at the end
  useEffect(() => {
    if (POSTER) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      if (!B.ready || B.drag || now - B.lastUser < 7000 || now - last < 3400 / B.speed) return
      last = now
      const p = posOf(B)
      if (p >= NLEAF) go(1, 0.06)
      else go(p + 1)
    }, 300)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [B])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (POSTER || !B.ready) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        user()
        go(posOf(B) + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        user()
        go(posOf(B) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [B])

  // ---- pointer → book plane (book space x along pages, y along spine)
  const camRef = useRef<THREE.PerspectiveCamera | null>(null)
  const ray = useMemo(() => ({ rc: new THREE.Raycaster(), v: new THREE.Vector2(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BRD + STACK / 2 + 0.03)), hit: new THREE.Vector3() }), [])
  const toBook = (e: { clientX: number; clientY: number }) => {
    const cam = camRef.current
    const el = stageRef.current
    if (!cam || !el) return null
    const r = el.getBoundingClientRect()
    ray.v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.rc.setFromCamera(ray.v, cam)
    if (!ray.rc.ray.intersectPlane(ray.plane, ray.hit)) return null
    return { x: ray.hit.x, y: -ray.hit.z }
  }
  const onBook = (h: { x: number; y: number } | null) => !!h && Math.abs(h.y) < PH / 2 + MRG + 0.04 && Math.abs(h.x) < PW + MRG + 0.06

  const onDown = (e: React.PointerEvent) => {
    if (POSTER || !B.ready || e.button !== 0 || (e.target as HTMLElement).tagName !== 'CANVAS') return
    const h = toBook(e)
    if (!onBook(h)) return
    user()
    const p = posOf(B)
    const right = h!.x >= 0
    const i = right ? p : p - 1
    if (i < 0 || i >= NLEAF) return
    const L = B.leaves[i]
    const down = performance.now()
    B.drag = { leaf: i, sGrab: clamp(Math.abs(h!.x) / PW, 0.32, 1), x0: e.clientX, y0: e.clientY, moved: false, t: down, tau: L.t.get(), vel: 0, lt: down, lx: e.clientX, vx: 0 }
    B.hoverPeel.leaf = -1
    const move = (ev: PointerEvent) => {
      const d = B.drag
      if (!d) return
      user()
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      if (!d.moved) {
        d.moved = true
        L.anim?.stop()
        L.anim = null
        L.curl = i === 0 ? 0 : DRAG_CURL
        L.lam = i === 0 ? 0 : DRAG_LAM
        document.body.style.cursor = 'grabbing'
      }
      const hh = toBook(ev)
      if (!hh) return
      const edge = clamp(hh.x / d.sGrab, -PW, PW)
      const tau = i === 0 ? Math.acos(edge / PW) / Math.PI : edgeToTau(edge)
      const now = performance.now()
      const dtt = Math.max(8, now - d.lt) / 1000
      d.vel = d.vel * 0.35 + ((tau - d.tau) / dtt) * 0.65
      d.vx = d.vx * 0.35 + ((ev.clientX - d.lx) / dtt) * 0.65
      d.lx = ev.clientX
      d.tau = tau
      d.lt = now
      L.t.set(tau)
      L.leadT = clamp(hh.y / PH, -0.5, 0.5)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.style.cursor = ''
      const d = B.drag
      B.drag = null
      if (!d) return
      user()
      if (!d.moved) {
        // a click: left half goes back, right half goes forward
        go(right ? p + 1 : p - 1)
        return
      }
      const stale = performance.now() - d.lt > 110
      let v = stale ? 0 : clamp(d.vel, -9, 9)
      // flick speed in stage widths per second (leftward = forward)
      const vxN = stale ? 0 : -d.vx / Math.max(320, stageRef.current?.clientWidth ?? 1000)
      const tau = L.t.get()
      const FLICK = 0.9
      if (Math.abs(vxN) > FLICK && Math.sign(vxN) === Math.sign(v || vxN)) {
        // flick: finish this leaf and riffle a few more ("拨页")
        const fwd = vxN > 0
        v = fwd ? Math.max(v, 2) : Math.min(v, -2)
        const extra = clamp(Math.floor((Math.abs(vxN) - FLICK) / 0.3), 0, 4)
        turnLeaf(B, i, fwd ? 1 : 0, { velocity: v })
        for (let k = 1; k <= extra; k++) {
          const j = fwd ? i + k : i - k
          if (j < 0 || j >= NLEAF) break
          if (fwd && B.leaves[j].target > 0.5) continue
          turnLeaf(B, j, fwd ? 1 : 0, { delay: k * 0.07, lead: L.leadT + Math.sin(k) * 0.05 })
        }
      } else {
        if (Math.abs(v) < 0.3) v = 0
        turnLeaf(B, i, tau + v * 0.15 > 0.5 ? 1 : 0, { velocity: v })
      }
      sync()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // hover: lift the corner of the page under the pointer a touch
  const onHover = (e: React.PointerEvent) => {
    if (POSTER || B.drag || !B.ready || e.pointerType !== 'mouse') return
    const h = toBook(e)
    const hp = B.hoverPeel
    hp.leaf = -1
    if (!onBook(h) || (e.target as HTMLElement).tagName !== 'CANVAS') {
      if (stageRef.current) stageRef.current.style.cursor = ''
      return
    }
    const p = posOf(B)
    const ax = Math.abs(h!.x) / PW
    if (stageRef.current) stageRef.current.style.cursor = 'pointer'
    if (ax < 0.68 || Math.abs(h!.y) > PH / 2 + 0.02) return
    const right = h!.x >= 0
    const i = right ? p : p - 1
    if (i < 0 || i >= NLEAF || B.leaves[i].anim?.state === 'running') return
    if (stageRef.current) stageRef.current.style.cursor = 'grab'
    const k = clamp((ax - 0.68) / 0.32, 0, 1)
    hp.leaf = i
    const L = B.leaves[i]
    if (i > 0) {
      // a corner peel wants a tighter, edge-only curl than a full turn
      L.curl = 0.6
      L.lam = 0.9
    }
    hp.amt = (right ? 1 : -1) * (i === 0 ? 0.025 : 0.15) * (0.4 + 0.6 * k)
    hp.lead = clamp(h!.y / PH, -0.5, 0.5)
  }

  const items = useMemo(() => [{ s: -1, p: 0, label: '封面' }, ...Array.from({ length: SPREADS }, (_, s) => ({ s, p: s + 1, label: SPREAD_LABELS[s] }))], [])

  return (
    <div className="stage fb-stage" ref={stageRef} onPointerDown={onDown} onPointerMove={onHover} onPointerLeave={() => (B.hoverPeel.leaf = -1)}>
      <style>{`
        .fb-stage { background: radial-gradient(110% 80% at 60% 30%, #f6efe4 0%, ${BG} 55%, #e2d5c2 100%); touch-action: none; }
        .fb-stage .overlay { cursor: default; }
        .fb-stage .scrim { --soft-bg: #eadfcf; }
        .fb-stage .hero-copy h1 em { color: #8b5e3c; }
        .fb-stage .kicker i { background: #b4552e !important; }
        @media (min-width: 761px) { .fb-stage .hero-copy { width: min(390px, calc(100% - 48px)); } }
        .fb-page { min-width: 92px; text-align: center; font: 500 12px/34px var(--mono); letter-spacing: .04em; color: var(--fg); font-variant-numeric: tabular-nums; position: relative; overflow: hidden; height: 34px; }
        .fb-page span { display: block; }
        .fb-arrow { display: inline-flex; align-items: center; gap: 6px; }
        .fb-arrow svg { display: block; }
        .fb-toc { position: absolute; left: 50%; bottom: 82px; transform: translateX(-50%); max-width: calc(100% - 32px); padding: 10px; border-radius: 20px; background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line), 0 18px 40px -18px rgba(60,40,20,.35); backdrop-filter: blur(16px) saturate(1.3); -webkit-backdrop-filter: blur(16px) saturate(1.3); }
        .fb-toc-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px; }
        .fb-toc button { position: relative; flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 6px; border: 0; border-radius: 12px; background: transparent; cursor: pointer; font: 500 11px/1 var(--sans); color: var(--fg-2); }
        .fb-toc button:hover { color: var(--fg); }
        .fb-toc button[aria-current='true'] { color: var(--fg); }
        .fb-toc canvas { display: block; height: 66px; border-radius: 3px; box-shadow: 0 1px 0 rgba(0,0,0,.05), 0 6px 14px -8px rgba(60,40,20,.5); position: relative; }
        .fb-toc .fb-ring { position: absolute; inset: 0; border-radius: 12px; background: rgba(139,94,60,.12); box-shadow: inset 0 0 0 1.5px rgba(139,94,60,.55); }
        .fb-toc span { position: relative; white-space: nowrap; }
        @media (max-width: 760px) {
          .fb-stage .hero-copy { bottom: 84px; }
          .fb-stage .hero-copy h1 { font-size: 28px; }
          .fb-stage .hero-copy .kicker { margin-bottom: 10px; }
          .fb-stage .hero-copy > p:not(.kicker) { display: none; }
          .fb-word { display: none; }
          .fb-page { min-width: 70px; }
          .fb-stage .dock { gap: 2px; }
          .fb-stage .dock .seg { padding: 0 10px; }
          .fb-stage .dock .dock-sep { margin: 0 2px; }
          .fb-toc { bottom: 76px; }
        }
      `}</style>
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 60, position: [0, 3.5, 3] }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl, camera }) => {
          gl.toneMapping = THREE.NeutralToneMapping
          camRef.current = camera as THREE.PerspectiveCamera
        }}
      >
        <fog attach="fog" args={[BG, 9, 22]} />
        <Lights />
        <BookScene B={B} res={res} onReady={onReady} onPainted={() => setPainted((n) => n + 1)} />
      </Canvas>

      <div className="overlay">
        <motion.div className="hero-copy" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <div className="scrim" />
          <p className="kicker">
            <i /> Lookbook · Page curl
          </p>
          <h1>
            翻开
            <br />
            <em>这一季</em>
          </h1>
          <p>拖住书页的角往另一边带，纸会顺着手卷起、透出背面并在下一页投下影子；快速一甩能连翻几页，点左右两侧也能翻。</p>
        </motion.div>

        <AnimatePresence>
          {toc && (
            <motion.div
              className="fb-toc"
              initial={{ opacity: 0, y: 12, scale: 0.98, x: '-50%' }}
              animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
              exit={{ opacity: 0, y: 8, scale: 0.98, x: '-50%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <div className="fb-toc-row">
                {items.map((it) => (
                  <button
                    key={it.p}
                    aria-current={it.p === pos}
                    onClick={() => {
                      user()
                      go(it.p, 0.05)
                    }}
                  >
                    {it.p === pos && <motion.i layoutId="fb-ring" className="fb-ring" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
                    <Thumb s={it.s} painted={painted} />
                    <span>{it.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="dock">
          <button className="seg fb-arrow" aria-label="上一页" onClick={() => (user(), go(pos - 1))}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="fb-word">上一页</span>
          </button>
          <div className="fb-page" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={pos} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
                {pageLabel(pos)}
              </motion.span>
            </AnimatePresence>
          </div>
          <button className="seg fb-arrow" aria-label="下一页" onClick={() => (user(), go(pos + 1))}>
            <span className="fb-word">下一页</span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="dock-sep" />
          <button className="seg" aria-pressed={toc} onClick={() => (user(), setToc((v) => !v))}>
            {toc && <motion.span layoutId="fb-toc-on" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>目录</span>
          </button>
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'n', label: '原速' },
              { value: 's', label: '慢速' },
            ]}
            value={slow}
            onChange={(v) => {
              user()
              setSlow(v)
            }}
          />
        </div>
        <p className="hint">拖动书角翻页 · 快甩连翻 · ← → 键</p>
      </div>
    </div>
  )
}
