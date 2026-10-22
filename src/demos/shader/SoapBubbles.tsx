import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { BG_FRAG, BG_VERT, BUBBLE_FRAG, BUBBLE_VERT, DISC_VERT, DROP_FRAG, DROP_VERT, WAND_FRAG, WAND_VERT } from './soapBubbleShaders'

/*
 * 肥皂泡 — every bubble is a wobbling sphere whose colour is computed from thin-film interference (see
 * soapBubbleShaders.ts). The bubbles live in a small CPU simulation: buoyancy + wander + wind, soft walls,
 * squash springs on contact, sticky links that flatten both films onto a shared wall (a contact plane clamps the
 * vertices), occasional merges, and pops that tear the film open from the poke and fling droplets.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const MAXB = 9
const NDROP = 700
const BOUNDS = { x0: -3, x1: 3, y0: -1.85, y1: 2.7, z0: -1.1, z1: 1.1 }
const WAND = new THREE.Vector3(0.35, -2.55, 0.25)
const WAND_N = new THREE.Vector3(0.1, 0.78, 0.62).normalize()
const WAND_R = 0.56
const POP_T = 0.26
const MERGE_T = 0.42

const THICK = [
  { v: 0.55, label: '薄', note: '膜更薄：一级干涉的金、品红、靛蓝最浓，顶部很快出现黑膜' },
  { v: 1, label: '中', note: '几百纳米：上薄下厚，颜色一圈圈从品红过渡到青绿' },
  { v: 1.75, label: '厚', note: '膜更厚：高级次干涉叠在一起，颜色变得粉绿、柔和' },
]

type U = { value: number }
type BU = {
  uTime: U
  uThick: U
  uGain: U
  uWob: U
  uSeed: U
  uDrain: U
  uPop: U
  uFade: U
  uSquash: { value: THREE.Vector4 }
  uPlaneA: { value: THREE.Vector4 }
  uPlaneB: { value: THREE.Vector4 }
  uPopDir: { value: THREE.Vector3 }
}
type Bub = {
  on: boolean
  phase: 0 | 1 | 2 | 3 // grow · free · pop · merge
  t: number
  p: THREE.Vector3
  v: THREE.Vector3
  r: number
  rT: number
  seed: number
  age: number
  life: number
  sq: number
  sqV: number
  sqT: number
  ax: THREE.Vector3
  into: number
  links: number
  planes: number
  u: BU
  front: THREE.Mesh
  back: THREE.Mesh
}
type Link = { a: number; b: number; t: number; mergeAt: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)

/* ------------------------------------------------------------------ scene */

function Bubbles({
  thick,
  wind,
  blowReq,
  onPop,
  onReady,
}: {
  thick: MotionValue<number>
  wind: MotionValue<number>
  blowReq: React.RefObject<number>
  onPop: () => void
  onReady: () => void
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const G = { uTime: { value: 0 }, uThick: { value: 1 }, uGain: { value: 2.0 } }
    const sphere = new THREE.SphereGeometry(1, MOBILE ? 64 : 88, MOBILE ? 44 : 60)
    const root = new THREE.Group()
    const mkBubbleMat = (u: object, side: THREE.Side) =>
      new THREE.ShaderMaterial({
        vertexShader: BUBBLE_VERT,
        fragmentShader: BUBBLE_FRAG,
        uniforms: u as Record<string, THREE.IUniform>,
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
        side,
      })
    const bubs: Bub[] = []
    for (let i = 0; i < MAXB; i++) {
      const u: BU = {
        ...G,
        uWob: { value: 0.03 },
        uSeed: { value: Math.random() * 50 },
        uDrain: { value: 0 },
        uPop: { value: 0 },
        uFade: { value: 1 },
        uSquash: { value: new THREE.Vector4(0, 1, 0, 0) },
        uPlaneA: { value: new THREE.Vector4(1, 0, 0, 10) },
        uPlaneB: { value: new THREE.Vector4(1, 0, 0, 10) },
        uPopDir: { value: new THREE.Vector3(0, 1, 0) },
      }
      const back = new THREE.Mesh(sphere, mkBubbleMat(u, THREE.BackSide))
      const front = new THREE.Mesh(sphere, mkBubbleMat(u, THREE.FrontSide))
      front.userData.slot = i
      back.raycast = () => {}
      root.add(back, front)
      bubs.push({
        on: false,
        phase: 1,
        t: 0,
        p: new THREE.Vector3(),
        v: new THREE.Vector3(),
        r: 0.7,
        rT: 0.7,
        seed: u.uSeed.value,
        age: 0,
        life: 20,
        sq: 0,
        sqV: 0,
        sqT: 0,
        ax: new THREE.Vector3(0, 1, 0),
        into: -1,
        links: 0,
        planes: 0,
        u,
        front,
        back,
      })
    }

    /* wand: ring + handle + its own film */
    const wand = new THREE.Group()
    wand.position.copy(WAND)
    wand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), WAND_N)
    const wandMat = new THREE.ShaderMaterial({ vertexShader: WAND_VERT, fragmentShader: WAND_FRAG, uniforms: { uColor: { value: new THREE.Color('#ff7f9e') } } })
    const ringGeo = new THREE.TorusGeometry(WAND_R + 0.04, 0.05, 16, 96)
    const ring = new THREE.Mesh(ringGeo, wandMat)
    const handleGeo = new THREE.CylinderGeometry(0.055, 0.07, 3.4, 20)
    const handle = new THREE.Mesh(handleGeo, wandMat)
    handle.position.set(0.08, -WAND_R - 1.75, -0.02)
    handle.rotation.z = 0.045
    const discU = { ...G, uRad: { value: WAND_R }, uSeed: { value: 3.3 }, uDrain: { value: 0.35 }, uPop: { value: 0 }, uFade: { value: 1 }, uPopDir: { value: new THREE.Vector3(0, 1, 0) } }
    const discGeo = new THREE.CircleGeometry(WAND_R, 64)
    const disc = new THREE.Mesh(
      discGeo,
      new THREE.ShaderMaterial({
        vertexShader: DISC_VERT,
        fragmentShader: BUBBLE_FRAG,
        uniforms: discU,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    disc.raycast = () => {}
    wand.add(ring, handle, disc)
    root.add(wand)

    /* droplets */
    const dropGeo = new THREE.BufferGeometry()
    const dPos = new Float32Array(NDROP * 3)
    const dA = new Float32Array(NDROP)
    const dS = new Float32Array(NDROP)
    dropGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage))
    dropGeo.setAttribute('aA', new THREE.BufferAttribute(dA, 1).setUsage(THREE.DynamicDrawUsage))
    dropGeo.setAttribute('aS', new THREE.BufferAttribute(dS, 1).setUsage(THREE.DynamicDrawUsage))
    const dropMat = new THREE.ShaderMaterial({
      vertexShader: DROP_VERT,
      fragmentShader: DROP_FRAG,
      uniforms: { uPx: { value: 400 } },
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    })
    const drops = new THREE.Points(dropGeo, dropMat)
    drops.frustumCulled = false
    drops.renderOrder = 100
    drops.raycast = () => {}
    root.add(drops)
    const D = { pos: dPos, a: dA, s: dS, vel: new Float32Array(NDROP * 3), life: new Float32Array(NDROP), max: new Float32Array(NDROP), size: new Float32Array(NDROP), head: 0 }

    /* backdrop */
    const bgU = { uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector2() }, uSpread: { value: 1 }, uTime: G.uTime }
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: bgU, depthTest: false, depthWrite: false }))
    bg.frustumCulled = false
    bg.renderOrder = -100
    bg.raycast = () => {}

    return { G, sphere, root, bubs, links: [] as Link[], wand, wandMat, ringGeo, handleGeo, discGeo, disc, discU, dropGeo, dropMat, drops, D, bg, bgU }
  }, [])

  useEffect(() => {
    scene.add(R.bg)
    return () => {
      scene.remove(R.bg)
    }
  }, [scene, R])
  useEffect(
    () => () => {
      R.sphere.dispose()
      R.bubs.forEach((b) => {
        ;(b.front.material as THREE.Material).dispose()
        ;(b.back.material as THREE.Material).dispose()
      })
      R.wandMat.dispose()
      R.ringGeo.dispose()
      R.handleGeo.dispose()
      R.discGeo.dispose()
      ;(R.disc.material as THREE.Material).dispose()
      R.dropGeo.dispose()
      R.dropMat.dispose()
      R.bg.geometry.dispose()
      ;(R.bg.material as THREE.Material).dispose()
    },
    [R],
  )

  /* simulation state */
  const S = useMemo(
    () => ({
      t: 0,
      blowT: 0,
      lastBlowReq: 0,
      discFade: 1,
      wobT: 0,
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      t1: new THREE.Vector3(),
      t2: new THREE.Vector3(),
      order: [] as number[],
      ready: false,
      readyAt: 0,
    }),
    [],
  )

  const spawnDrop = useCallback(
    (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number) => {
      const D = R.D
      const i = D.head
      D.head = (D.head + 1) % NDROP
      D.pos[i * 3] = x
      D.pos[i * 3 + 1] = y
      D.pos[i * 3 + 2] = z
      D.vel[i * 3] = vx
      D.vel[i * 3 + 1] = vy
      D.vel[i * 3 + 2] = vz
      D.life[i] = life
      D.max[i] = life
      D.size[i] = size
    },
    [R],
  )

  const unlink = useCallback(
    (i: number) => {
      const L = R.links
      for (let k = L.length - 1; k >= 0; k--) {
        const l = L[k]
        if (l.a !== i && l.b !== i) continue
        const o = R.bubs[l.a === i ? l.b : l.a]
        o.links--
        // the partner springs back round
        o.sqV += 1.6
        o.ax.copy(o.p).sub(R.bubs[i].p).normalize()
        R.bubs[i].links--
        L.splice(k, 1)
      }
    },
    [R],
  )

  const pop = useCallback(
    (i: number, dir: THREE.Vector3) => {
      const b = R.bubs[i]
      if (!b.on || b.phase === 2 || b.phase === 3) return
      unlink(i)
      b.phase = 2
      b.t = 0
      b.u.uPopDir.value.copy(dir).normalize()
      onPop()
    },
    [R, unlink, onPop],
  )

  const place = useCallback(
    (x: number, y: number, z: number, r: number, drain: number) => {
      const i = R.bubs.findIndex((b) => !b.on)
      if (i < 0) return -1
      const b = R.bubs[i]
      // a recycled slot must not inherit an old partner
      for (let k = R.links.length - 1; k >= 0; k--) {
        const l = R.links[k]
        if (l.a !== i && l.b !== i) continue
        R.bubs[l.a === i ? l.b : l.a].links--
        R.links.splice(k, 1)
      }
      b.on = true
      b.phase = 1
      b.t = 0
      b.p.set(x, y, z)
      b.v.set(rand(-0.1, 0.1), rand(-0.05, 0.1), 0)
      b.r = b.rT = r
      b.life = rand(17, 28)
      b.age = drain * b.life
      b.sq = 0
      b.sqV = rand(-0.5, 0.5)
      b.sqT = 0
      b.links = 0
      b.into = -1
      b.u.uPop.value = 0
      b.u.uFade.value = 1
      return i
    },
    [R],
  )

  const blow = useCallback(() => {
    if (R.bubs.some((b) => b.on && b.phase === 0)) return false
    const i = place(WAND.x, WAND.y, WAND.z, rand(0.55, 0.98), 0)
    if (i < 0) return false
    const b = R.bubs[i]
    b.phase = 0
    b.t = 0
    b.r = 0.2
    b.sqT = -0.16
    b.ax.copy(WAND_N)
    S.discFade = 0
    return true
  }, [R, S, place])

  /* initial composition (also the poster) */
  useEffect(() => {
    R.bubs.forEach((b) => (b.on = false))
    R.links.length = 0
    place(-1.25, 0.95, 0.05, 0.98, 0.55)
    place(0.3, 1.25, -0.1, 0.72, 0.32)
    place(1.65, -0.55, 0.45, 0.86, 0.78)
    place(-0.85, -1.05, -0.55, 0.58, 0.12)
    if (!MOBILE || POSTER) place(2.15, 1.95, -0.6, 0.5, 0.42)
    if (POSTER) {
      R.G.uTime.value = 7
      blow()
      const g = R.bubs.find((b) => b.phase === 0)
      if (g) g.t = 0.72
    }
  }, [R, place, blow])

  /* compile every program against the screen before the first draw */
  useEffect(() => {
    let dead = false
    const raf = requestAnimationFrame(() => {
      if (dead) return
      const vis = R.bubs.map((b) => b.front.visible)
      R.bubs.forEach((b) => (b.front.visible = b.back.visible = true))
      const prev = gl.getRenderTarget()
      gl.setRenderTarget(null)
      const job = gl.compileAsync(scene, camera)
      gl.setRenderTarget(prev)
      R.bubs.forEach((b, i) => (b.front.visible = b.back.visible = vis[i]))
      job
        .catch(() => {})
        .then(() => {
          if (dead) return
          S.ready = true
          onReady()
        })
    })
    return () => {
      dead = true
      cancelAnimationFrame(raf)
    }
  }, [R, S, gl, scene, camera, onReady])

  /* click → pop: the poke direction (from the bubble centre) is where the film tears first */
  const onDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const i = e.object.userData.slot as number | undefined
      if (i === undefined) return
      const b = R.bubs[i]
      if (!b.on || b.phase === 2 || b.phase === 3) return
      e.stopPropagation()
      const wp = S.tmp.copy(b.p)
      R.root.localToWorld(wp)
      pop(i, S.tmp2.copy(e.point).sub(wp).normalize())
    },
    [R, S, pop],
  )

  useFrame((state, rawDt) => {
    if (!S.ready) {
      gl.setRenderTarget(null)
      gl.setClearColor(0x05070c, 1)
      gl.clear()
      return
    }
    const dt = POSTER ? 0 : Math.min(rawDt, 1 / 30)
    S.t += dt
    const G = R.G
    G.uTime.value += dt
    G.uThick.value = thick.get()
    const w = wind.get()
    const bubs = R.bubs

    /* layout: bubbles right of the copy on desktop, above it on phones, centred for the poster */
    const W = size.width
    const H = size.height
    const cam = state.camera as THREE.PerspectiveCamera
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * cam.position.z
    const halfW = halfH * (W / H)
    let sc: number, cx: number, cy: number
    if (POSTER) {
      sc = 0.9
      cx = 0
      cy = 0.1
    } else if (W < 760) {
      sc = Math.min(0.62, (halfW * 0.96) / 3.0)
      cx = 0
      cy = halfH * 0.98 - 2.75 * sc - (72 / H) * 2 * halfH
    } else {
      sc = Math.min(0.95, halfH / 3.6)
      cx = Math.min(halfW * 0.42, halfW - 3.25 * sc)
      cx = Math.max(cx, halfW * 0.18)
      cy = -0.12
    }
    R.root.position.set(cx, cy, 0)
    R.root.scale.setScalar(sc)
    R.bgU.uRes.value.set(W, H)
    R.bgU.uCenter.value.set((cx / halfW) * 0.5 * (W / H), (cy / halfH) * 0.5)
    R.bgU.uSpread.value = sc * 1.05
    R.dropMat.uniforms.uPx.value = (H * gl.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360))

    /* wand: gentle sway; blow on request or to keep the air populated */
    R.wand.rotation.set(0, 0, 0)
    R.wand.quaternion.setFromUnitVectors(S.t1.set(0, 0, 1), WAND_N)
    R.wand.rotateY(Math.sin(S.t * 0.6) * 0.06)
    R.wand.rotateX(Math.sin(S.t * 0.45 + 1) * 0.04)
    const nOn = bubs.reduce((n, b) => n + (b.on ? 1 : 0), 0)
    if (blowReq.current !== S.lastBlowReq) {
      S.lastBlowReq = blowReq.current
      blow()
    }
    S.blowT += dt
    const target = MOBILE ? 4 : 6
    if (!POSTER && S.blowT > (w > 0.5 ? 1.3 : 2.6) && (nOn < target || (w > 0.5 && nOn < MAXB - 1))) {
      if (blow()) S.blowT = 0
    }
    const growing = bubs.some((b) => b.on && b.phase === 0)
    S.discFade = growing ? 0 : Math.min(1, S.discFade + dt * 1.4)
    R.discU.uFade.value = S.discFade
    R.discU.uDrain.value = 0.3 + 0.1 * Math.sin(S.t * 0.3)

    /* per-bubble update */
    const B = BOUNDS
    for (let i = 0; i < MAXB; i++) {
      const b = bubs[i]
      if (!b.on) continue
      b.age += dt
      if (b.phase === 0) {
        b.t += dt / 1.05
        const k = Math.min(b.t, 1)
        b.r = b.rT * (0.22 + 0.78 * easeOut(k))
        b.p.copy(WAND).addScaledVector(WAND_N, b.r * 0.9)
        b.sqT = -0.16 * (1 - k)
        b.ax.copy(WAND_N)
        if (k >= 1) {
          b.phase = 1
          b.sqT = 0
          b.sqV += 1.4
          b.v.copy(WAND_N).multiplyScalar(0.75).add(S.tmp.set(rand(-0.15, 0.15) + w * 0.4, 0.1, rand(-0.05, 0.05)))
        }
      } else if (b.phase === 1) {
        // wander + buoyancy + wind, soft walls, gentle pull back to the middle
        const s = b.seed
        const fx = 0.2 * (Math.sin(S.t * 0.37 + s * 5.1) + 0.5 * Math.sin(S.t * 0.71 + s * 2.3)) - (b.p.x - 0.1) * 0.04
        const fy = 0.05 + 0.16 * Math.sin(S.t * 0.29 + s * 3.7) - (b.p.y - 0.45) * 0.05
        const fz = 0.1 * Math.sin(S.t * 0.23 + s * 1.9) - b.p.z * 0.1
        const gust = 0.65 + 0.35 * Math.sin(S.t * 1.3 + s) * Math.sin(S.t * 0.37)
        b.v.x += (fx + w * 1.1 * gust) * dt
        b.v.y += (fy + w * 0.12 * Math.sin(S.t * 2.1 + s)) * dt
        b.v.z += fz * dt
        const kw = 3
        if (b.p.x - b.r < B.x0) b.v.x += (B.x0 - b.p.x + b.r) * kw * dt
        if (b.p.x + b.r > B.x1) b.v.x -= (b.p.x + b.r - B.x1) * kw * (1 - w) * dt
        if (b.p.y - b.r < B.y0) b.v.y += (B.y0 - b.p.y + b.r) * kw * dt
        if (b.p.y + b.r > B.y1) b.v.y -= (b.p.y + b.r - B.y1) * kw * dt
        if (b.p.z - b.r < B.z0) b.v.z += (B.z0 - b.p.z + b.r) * kw * dt
        if (b.p.z + b.r > B.z1) b.v.z -= (b.p.z + b.r - B.z1) * kw * dt
        // keep clear of the wand
        const wd = S.tmp.copy(b.p).sub(WAND)
        const wl = wd.length()
        if (wl < b.r + WAND_R * 0.9) b.v.addScaledVector(wd.normalize(), (b.r + WAND_R * 0.9 - wl) * 4 * dt)
        b.v.multiplyScalar(Math.exp(-dt * 0.9))
        // blown off-screen: just let it go
        if (w > 0.3 && b.p.x - b.r > B.x1 + 0.6) {
          unlink(i)
          b.on = false
          continue
        }
        if (b.age > b.life) pop(i, S.tmp.set(rand(-0.3, 0.3), 1, rand(-0.2, 0.3)))
      } else if (b.phase === 2) {
        b.t += dt
        const k = b.t / POP_T
        b.u.uPop.value = Math.min(k, 1)
        // droplets ride off the retracting rim
        const dir = b.u.uPopDir.value
        S.t1.set(0, 1, 0).cross(dir)
        if (S.t1.lengthSq() < 1e-3) S.t1.set(1, 0, 0)
        S.t1.normalize()
        S.t2.copy(dir).cross(S.t1)
        const th = Math.min(k * 1.2, 1) * Math.PI
        const n = Math.round(9 * b.r + 3)
        for (let j = 0; j < n; j++) {
          const ph = Math.random() * Math.PI * 2
          const c = Math.cos(ph)
          const sn = Math.sin(ph)
          // point on the rim and its outward tangent (away from the poke)
          const px = dir.x * Math.cos(th) + (S.t1.x * c + S.t2.x * sn) * Math.sin(th)
          const py = dir.y * Math.cos(th) + (S.t1.y * c + S.t2.y * sn) * Math.sin(th)
          const pz = dir.z * Math.cos(th) + (S.t1.z * c + S.t2.z * sn) * Math.sin(th)
          const tx = -dir.x * Math.sin(th) + (S.t1.x * c + S.t2.x * sn) * Math.cos(th)
          const ty = -dir.y * Math.sin(th) + (S.t1.y * c + S.t2.y * sn) * Math.cos(th)
          const tz = -dir.z * Math.sin(th) + (S.t1.z * c + S.t2.z * sn) * Math.cos(th)
          const sp = rand(1.2, 3.4) * (0.6 + b.r)
          spawnDrop(b.p.x + px * b.r, b.p.y + py * b.r, b.p.z + pz * b.r, tx * sp + px * 0.5 + b.v.x, ty * sp + py * 0.5 + b.v.y, tz * sp + pz * 0.5, rand(0.35, 0.75), rand(0.02, 0.055))
        }
        if (k >= 1) {
          b.on = false
          continue
        }
      } else if (b.phase === 3) {
        b.t += dt
        const k = Math.min(b.t / MERGE_T, 1)
        const o = bubs[b.into]
        b.r = b.rT * (1 - easeOut(k))
        if (o?.on) b.p.lerp(o.p, 1 - Math.exp(-dt * 9))
        b.u.uFade.value = 1 - k * k
        if (k >= 1) {
          b.on = false
          continue
        }
      }
      // radius eases to target (after merging), squash spring
      if (b.phase === 1) b.r = THREE.MathUtils.damp(b.r, b.rT, 5, dt)
      b.sqV += (-(b.sq - b.sqT) * 95 - b.sqV * 6.5) * dt
      b.sq += b.sqV * dt
      b.sq = THREE.MathUtils.clamp(b.sq, -0.3, 0.3)
    }

    /* pairs: contact → stick (shared flat wall) with a squash; long-stuck pairs sometimes merge */
    for (let i = 0; i < MAXB; i++) {
      const a = bubs[i]
      if (!a.on || a.phase === 2 || a.phase === 3) continue
      for (let j = i + 1; j < MAXB; j++) {
        const b = bubs[j]
        if (!b.on || b.phase === 2 || b.phase === 3) continue
        const d = S.tmp.copy(b.p).sub(a.p)
        const D = d.length()
        const sum = a.r + b.r
        if (D >= sum || D < 1e-4) continue
        const n = d.divideScalar(D)
        let link = R.links.find((l) => (l.a === i && l.b === j) || (l.a === j && l.b === i))
        if (!link && a.phase === 1 && b.phase === 1 && a.links < 2 && b.links < 2) {
          link = { a: i, b: j, t: 0, mergeAt: Math.random() < 0.4 ? rand(3.5, 8) : Infinity }
          R.links.push(link)
          a.links++
          b.links++
          const vn = S.tmp2.copy(a.v).sub(b.v).dot(n)
          const imp = 0.9 + Math.max(vn, 0) * 2.5
          a.ax.copy(n)
          b.ax.copy(n)
          a.sqV += imp
          b.sqV += imp
        }
        if (!link) {
          // not sticky (a bubble on the wand, or one that already has two walls): resolve the overlap directly
          const pen = (sum - D) * Math.min(1, dt * 12)
          const wa = a.phase === 1 ? (b.phase === 1 ? 0.5 : 1) : 0
          const wb = b.phase === 1 ? 1 - wa : 0
          a.p.addScaledVector(n, -pen * wa)
          b.p.addScaledVector(n, pen * wb)
          const vn = S.tmp2.copy(b.v).sub(a.v).dot(n)
          if (vn < 0) {
            a.v.addScaledVector(n, vn * wa)
            b.v.addScaledVector(n, -vn * wb)
          }
        }
      }
    }
    for (let k = R.links.length - 1; k >= 0; k--) {
      const l = R.links[k]
      const a = bubs[l.a]
      const b = bubs[l.b]
      const d = S.tmp.copy(b.p).sub(a.p)
      const D = Math.max(d.length(), 1e-4)
      const sum = a.r + b.r
      const alive = a.on && b.on && a.phase < 2 && b.phase < 2
      if (!alive || D > sum * 1.04) {
        a.links--
        b.links--
        R.links.splice(k, 1)
        continue
      }
      l.t += dt
      const n = d.divideScalar(D)
      // spring to a comfortable overlap, damped along the normal
      const rest = sum * 0.84
      const rel = S.tmp2.copy(b.v).sub(a.v).dot(n)
      const f = ((D - rest) * 2.2 + rel * 1.4) * dt
      const ma = a.r * a.r * a.r
      const mb = b.r * b.r * b.r
      a.v.addScaledVector(n, (f * mb) / (ma + mb) * 2)
      b.v.addScaledVector(n, (-f * ma) / (ma + mb) * 2)
      if (l.t > l.mergeAt && !POSTER) {
        // the shared wall bursts: the smaller bubble drains into the bigger one
        const [sm, bg, si, bi] = a.r < b.r ? [a, b, l.a, l.b] : [b, a, l.b, l.a]
        a.links--
        b.links--
        R.links.splice(k, 1)
        unlink(si)
        sm.phase = 3
        sm.t = 0
        sm.rT = sm.r
        sm.into = bi
        bg.rT = Math.min(Math.cbrt(bg.r ** 3 + sm.r ** 3), 1.3)
        bg.ax.copy(n)
        bg.sqV -= 2
        const wx = (a.p.x + b.p.x) / 2
        const wy = (a.p.y + b.p.y) / 2
        const wz = (a.p.z + b.p.z) / 2
        for (let j = 0; j < 26; j++) spawnDrop(wx, wy, wz, rand(-1.2, 1.2), rand(-0.6, 1.4), rand(-1.2, 1.2), rand(0.35, 0.7), rand(0.02, 0.05))
      }
    }

    /* integrate + write uniforms */
    for (const b of bubs) b.planes = 0
    for (const l of R.links) {
      const a = bubs[l.a]
      const b = bubs[l.b]
      if (!a.on || !b.on) continue
      const d = S.tmp.copy(b.p).sub(a.p)
      const D = Math.max(d.length(), 1e-4)
      if (D >= a.r + b.r) continue
      d.divideScalar(D)
      // flat wall where the two spheres intersect
      const xa = (D * D + a.r * a.r - b.r * b.r) / (2 * D)
      const xb = D - xa
      const setPlane = (o: Bub, nx: number, ny: number, nz: number, w: number) => {
        const v = o.planes === 0 ? o.u.uPlaneA.value : o.u.uPlaneB.value
        if (o.planes < 2) v.set(nx, ny, nz, THREE.MathUtils.clamp(w, 0.15, 1))
        o.planes++
      }
      setPlane(a, d.x, d.y, d.z, xa / a.r)
      setPlane(b, -d.x, -d.y, -d.z, xb / b.r)
    }
    S.order.length = 0
    for (let i = 0; i < MAXB; i++) {
      const b = bubs[i]
      const vis = b.on
      b.front.visible = b.back.visible = vis
      if (!vis) continue
      if (b.phase === 1) b.p.addScaledVector(b.v, dt)
      if (b.planes < 1) b.u.uPlaneA.value.w = 10
      if (b.planes < 2) b.u.uPlaneB.value.w = 10
      b.front.position.copy(b.p)
      b.back.position.copy(b.p)
      b.front.scale.setScalar(b.r)
      b.back.scale.setScalar(b.r)
      b.u.uSquash.value.set(b.ax.x, b.ax.y, b.ax.z, b.sq)
      b.u.uDrain.value = THREE.MathUtils.clamp(b.age / b.life, 0, 1)
      b.u.uWob.value = 0.022 + w * 0.022 + Math.abs(b.sqV) * 0.004
      S.order.push(i)
    }
    // back films first, then front films, far → near
    S.order.sort((x, y) => bubs[x].p.z - bubs[y].p.z)
    S.order.forEach((i, k) => {
      bubs[i].back.renderOrder = 10 + k * 2
      bubs[i].front.renderOrder = 11 + k * 2
    })
    let dk = 0
    while (dk < S.order.length && bubs[S.order[dk]].p.z < WAND.z) dk++
    R.disc.renderOrder = 9 + dk * 2

    /* droplets */
    const Dd = R.D
    for (let i = 0; i < NDROP; i++) {
      if (Dd.life[i] <= 0) {
        Dd.a[i] = 0
        continue
      }
      Dd.life[i] -= dt
      const i3 = i * 3
      Dd.vel[i3 + 1] -= 4.2 * dt
      const k = Math.exp(-dt * 2.2)
      Dd.vel[i3] *= k
      Dd.vel[i3 + 1] *= k
      Dd.vel[i3 + 2] *= k
      Dd.pos[i3] += Dd.vel[i3] * dt
      Dd.pos[i3 + 1] += Dd.vel[i3 + 1] * dt
      Dd.pos[i3 + 2] += Dd.vel[i3 + 2] * dt
      const f = Math.max(Dd.life[i] / Dd.max[i], 0)
      Dd.a[i] = Math.min(f * 1.6, 1)
      Dd.s[i] = Dd.size[i] * (0.6 + 0.4 * f)
    }
    R.dropGeo.attributes.position.needsUpdate = true
    R.dropGeo.attributes.aA.needsUpdate = true
    R.dropGeo.attributes.aS.needsUpdate = true

    gl.setRenderTarget(null)
    gl.render(scene, camera)
  }, 1)

  return (
<primitive object={R.root} onPointerDown={onDown} />
  )
}

/* ------------------------------------------------------------------ page */

export default function SoapBubbles() {
  const [thickIdx, setThickIdx] = useState(1)
  const [windOn, setWindOn] = useState(false)
  const [popped, setPopped] = useState(0)
  const [ready, setReady] = useState(false)
  const thick = useMotionValue(THICK[1].v)
  const wind = useMotionValue(0)
  const blowReq = useRef(0)

  useEffect(() => {
    const a = animate(thick, THICK[thickIdx].v, { duration: 1.4, ease: [0.4, 0, 0.2, 1] })
    return () => a.stop()
  }, [thickIdx, thick])
  useEffect(() => {
    const a = animate(wind, windOn ? 1 : 0, { duration: windOn ? 1.2 : 1.8, ease: 'easeInOut' })
    return () => a.stop()
  }, [windOn, wind])

  const onPop = useCallback(() => setPopped((n) => n + 1), [])
  const onReady = useCallback(() => setReady(true), [])
  const T = THICK[thickIdx]

  return (
    <div className="stage sb" style={{ background: '#05070c' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 12], fov: 32 }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
        <Bubbles thick={thick} wind={wind} blowReq={blowReq} onPop={onPop} onReady={onReady} />
      </Canvas>
      <motion.div className="sb-veil" initial={{ opacity: 1 }} animate={{ opacity: ready ? 0 : 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />

      <div className="overlay">
        <motion.div
          className="hero-copy sb-copy"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Thin-film interference
          </p>
          <h1>肥皂泡</h1>
          <p className="sb-lede">泡膜只有几百纳米厚，前后两个面反射的光彼此加强或抵消——颜色于是随膜厚流动。水往下流，顶部越来越薄，变黑时它就快破了。</p>
          <div className="sb-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={T.label}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                {T.note}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="sb-count">
            已戳破 <b>{popped}</b> 个
          </p>
        </motion.div>

        <div className="dock sb-dock">
          <button className="seg sb-blow" onClick={() => void (blowReq.current += 1)}>
            <span>吹泡泡</span>
          </button>
          <span className="dock-sep" />
          <button className="seg sb-tog" aria-pressed={windOn} onClick={() => setWindOn((v) => !v)}>
            <span>风</span>
          </button>
          <span className="dock-sep" />
          <span className="sb-label">膜厚</span>
          <Seg items={THICK.map((t, i) => ({ value: i, label: t.label }))} value={thickIdx} onChange={setThickIdx} />
        </div>
        <p className="hint">
          点泡泡 → 啪地破掉
          <br />
          碰到一起会粘成一面平墙
        </p>
      </div>
    </div>
  )
}

const css = `
.sb-veil { position: absolute; inset: 0; background: #05070c; pointer-events: none; }
.sb .sb-copy { --soft-bg: rgba(5, 7, 12, .8); }
.sb .kicker i { background: #9fe6ff; box-shadow: 0 0 10px #9fe6ff; }
.sb .sb-copy h1 { font-size: clamp(42px, 5vw, 68px); background: linear-gradient(100deg, #f4f2ee 30%, #ffd6f0 55%, #b9f1ff 75%, #f4f2ee 95%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sb .sb-lede { max-width: 370px; font-size: 15px; }
.sb-meta { margin-top: 22px; min-height: 40px; max-width: 360px; font: 500 12px/1.6 var(--mono); letter-spacing: .02em; color: var(--fg-2); }
.sb-meta span { display: inline-block; }
.sb-count { margin-top: 10px !important; font: 500 12px/1 var(--mono) !important; color: var(--fg-2); }
.sb-count b { color: #9fe6ff; font-weight: 600; }
.sb-label { padding: 0 6px 0 8px; font: 500 12px/1 var(--sans); color: var(--fg-2); }
.sb-blow { color: var(--fg) !important; background: linear-gradient(100deg, rgba(255,127,158,.28), rgba(159,230,255,.24)) !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }
.sb-blow:active { transform: scale(.96); }
.sb-tog { transition: background .25s, color .2s; }
.sb-tog[aria-pressed='true'] { background: color-mix(in srgb, #9fe6ff 22%, transparent); }
.sb canvas { cursor: pointer; }
@media (max-width: 760px) {
  .sb .sb-copy { bottom: 92px; }
  .sb .sb-lede { font-size: 13.5px; margin-top: 12px; }
  .sb-meta { display: none; }
  .sb-count { display: none; }
  .sb-dock .seg { padding: 0 11px; }
  .sb-label { display: none; }
}
`
