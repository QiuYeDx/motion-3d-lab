import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import {
  CAUS_FRAG,
  CAUS_VERT,
  COMP_FRAG,
  FS_VERT,
  RAYS_FRAG,
  SIM,
  SNOW_FRAG,
  SNOW_VERT,
  SURF_FRAG,
  SURF_VERT,
  UW_FRAG,
  UW_VERT,
} from './causticsShaders'

/*
 * 水下焦散 — a small deferred pipeline, all hand-driven from one useFrame:
 *   1. CPU ripple heightfield (128², periodic) → half-float DataTexture
 *   2. caustics map: refracted-grid area ratio, R/G/B drawn with three refractive indices (chromatic fringe)
 *   3. scene → half-float MSAA target, alpha = distance (floor, rocks, seagrass, amphora, surface from below)
 *   4. god rays: half-resolution ray march through the water column, lit by the blurred caustics map
 *   5. composite: per-channel absorption + in-scatter fog, rays, filmic shoulder → screen; marine snow on top
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const L = 20
const SURF = 7
const VASE = new THREE.Vector3(0, -0.12, 0)
const CAUS_RES = MOBILE ? 768 : 1024
const SNOW_N = MOBILE ? 700 : 1300
const BASE_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 1.25) : 1

type V3 = [number, number, number]
type Preset = { sigma: V3; fogDeep: V3; fogUp: V3; sun: V3; ambTop: V3; ambBot: V3; rayK: number; causLod: number; lightDepth: number; skyK: number; exposure: number }
const DEPTHS: { label: string; note: string; p: Preset }[] = [
  {
    label: '浅',
    note: '约 3 米 · 红光还在，光网锐利、明亮',
    p: { sigma: [0.2, 0.05, 0.046], fogDeep: [0.006, 0.072, 0.078], fogUp: [0.07, 0.48, 0.46], sun: [2.7, 2.6, 2.3], ambTop: [0.1, 0.3, 0.29], ambBot: [0.025, 0.07, 0.07], rayK: 0.7, causLod: 0, lightDepth: 0.7, skyK: 1.25, exposure: 1.05 },
  },
  {
    label: '中',
    note: '约 8 米 · 红光被吃掉，海水只剩青绿',
    p: { sigma: [0.25, 0.072, 0.06], fogDeep: [0.004, 0.034, 0.042], fogUp: [0.05, 0.28, 0.3], sun: [2.6, 2.55, 2.35], ambTop: [0.05, 0.2, 0.22], ambBot: [0.01, 0.04, 0.05], rayK: 1.0, causLod: 0.1, lightDepth: 1.0, skyK: 1.1, exposure: 1.1 },
  },
  {
    label: '深',
    note: '约 15 米 · 只剩蓝光，焦散变糊，光柱更显',
    p: { sigma: [0.36, 0.105, 0.072], fogDeep: [0.002, 0.012, 0.03], fogUp: [0.018, 0.12, 0.22], sun: [2.5, 2.5, 2.6], ambTop: [0.025, 0.1, 0.16], ambBot: [0.004, 0.015, 0.03], rayK: 1.5, causLod: 0.8, lightDepth: 1.5, skyK: 0.8, exposure: 1.25 },
  },
]
const WAVES = [
  { label: '平静', v: 0 },
  { label: '汹涌', v: 1 },
]

/* ------------------------------------------------------------------ ripple heightfield (CPU, periodic) */

function createRipples() {
  const n = SIM * SIM
  const h = new Float32Array(n)
  const v = new Float32Array(n)
  const tex = new THREE.DataTexture(h, SIM, SIM, THREE.RedFormat, THREE.FloatType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  const step = () => {
    for (let y = 0; y < SIM; y++) {
      const ym = ((y + SIM - 1) % SIM) * SIM
      const yp = ((y + 1) % SIM) * SIM
      const yr = y * SIM
      for (let x = 0; x < SIM; x++) {
        const xm = (x + SIM - 1) % SIM
        const xp = (x + 1) % SIM
        const i = yr + x
        const avg = (h[yr + xm] + h[yr + xp] + h[ym + x] + h[yp + x]) * 0.25
        v[i] = (v[i] + (avg - h[i]) * 0.7) * 0.994
      }
    }
    for (let i = 0; i < n; i++) h[i] += v[i]
  }
  // a cosine dent at world (x, z), radius in world units
  const drop = (x: number, z: number, r: number, amp: number) => {
    const cx = (x / L + 0.5) * SIM
    const cy = (z / L + 0.5) * SIM
    const rc = (r / L) * SIM
    const R = Math.ceil(rc)
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const gx = Math.floor(cx) + dx
        const gy = Math.floor(cy) + dy
        const d = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy) / rc
        if (d >= 1) continue
        const i = (((gy % SIM) + SIM) % SIM) * SIM + (((gx % SIM) + SIM) % SIM)
        h[i] -= amp * 0.5 * (Math.cos(Math.PI * d) + 1)
      }
    }
  }
  const upload = () => void (tex.needsUpdate = true)
  return { tex, step, drop, upload }
}

/* ------------------------------------------------------------------ geometry */

function amphoraGeometry() {
  const prof: [number, number][] = [
    [0.001, 0.0],
    [0.3, 0.0],
    [0.36, 0.06],
    [0.31, 0.2],
    [0.33, 0.38],
    [0.55, 0.75],
    [0.82, 1.25],
    [0.93, 1.75],
    [0.88, 2.15],
    [0.7, 2.48],
    [0.42, 2.75],
    [0.29, 2.95],
    [0.26, 3.2],
    [0.3, 3.36],
    [0.39, 3.44],
    [0.36, 3.5],
    [0.24, 3.47],
    [0.2, 3.2],
  ]
  const curve = new THREE.SplineCurve(prof.map(([r, y]) => new THREE.Vector2(r, y)))
  const lathe = new THREE.LatheGeometry(curve.getPoints(110), 72)
  const handle = (s: number) =>
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.2 * s, 3.12, 0),
        new THREE.Vector3(0.55 * s, 3.2, 0),
        new THREE.Vector3(0.8 * s, 3.0, 0),
        new THREE.Vector3(0.8 * s, 2.62, 0),
        new THREE.Vector3(0.62 * s, 2.36, 0),
      ]),
      48,
      0.07,
      12,
    )
  return [lathe, handle(1), handle(-1)]
}

// faceted boulder: icosahedron pushed around by a few sine octaves
function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const n =
      0.22 * Math.sin(v.x * 2.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.3) +
      0.12 * Math.sin(v.z * 4.3 + v.x * 3.1 + seed * 2.1) +
      0.06 * Math.sin(v.y * 9.0 + v.z * 7.0 + seed)
    v.multiplyScalar(1 + n)
    v.y = v.y < 0 ? v.y * 0.35 : v.y * 0.72
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

const ROCKS: { p: V3; s: V3; seed: number }[] = [
  { p: [-3.1, 0, -1.2], s: [1.25, 1.1, 1.05], seed: 1 },
  { p: [3.3, 0, -3.4], s: [0.9, 0.8, 0.85], seed: 2.6 },
  { p: [-1.55, 0, 2.3], s: [0.48, 0.45, 0.5], seed: 4.1 },
  { p: [4.6, 0, 1.4], s: [0.62, 0.5, 0.58], seed: 5.3 },
  { p: [-6.8, 0, -6.5], s: [2.0, 1.6, 1.8], seed: 6.7 },
  { p: [1.3, 0, 1.6], s: [0.28, 0.25, 0.3], seed: 8.2 },
]
const GRASS: { p: [number, number]; n: number; r: number }[] = [
  { p: [-2.4, -2.2], n: 70, r: 0.9 },
  { p: [-4.2, -0.2], n: 45, r: 0.7 },
  { p: [2.6, -2.5], n: 60, r: 0.8 },
  { p: [4.1, 2.2], n: 35, r: 0.55 },
  { p: [-6.0, -4.6], n: 60, r: 1.2 },
  { p: [1.0, 2.4], n: 22, r: 0.4 },
]

/** GLSL refract() */
function refract(I: THREE.Vector3, N: THREE.Vector3, eta: number) {
  const c = N.dot(I)
  const k = 1 - eta * eta * (1 - c * c)
  return I.clone().multiplyScalar(eta).addScaledVector(N, -(eta * c + Math.sqrt(Math.max(k, 0))))
}

/* ------------------------------------------------------------------ scene + pipeline */

type Dir = { depth: MotionValue<number>; rough: MotionValue<number> }

function Sea({ depth, rough, dropReq, onReady }: Dir & { dropReq: React.RefObject<{ n: number; x: number; y: number }>; onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const ripples = createRipples()
    const sunAir = new THREE.Vector3(-0.3, -1, 0.22).normalize()
    const rdFlat = refract(sunAir, new THREE.Vector3(0, 1, 0), 1 / 1.333)
    const sunUW = rdFlat.clone().negate()
    const flatOff = new THREE.Vector2(rdFlat.x / -rdFlat.y, rdFlat.z / -rdFlat.y)

    const causRT = new THREE.WebGLRenderTarget(CAUS_RES, CAUS_RES, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    })
    const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
    const raysRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false })

    const v3 = () => ({ value: new THREE.Vector3() })
    const U = {
      uTime: { value: 0 },
      uL: { value: L },
      uSurf: { value: SURF },
      uSim: { value: ripples.tex },
      uSimAmp: { value: 0.6 },
      uWaveAmp: { value: 1 },
      uRough: { value: 0 },
      uSunAir: { value: sunAir },
      uCaus: { value: causRT.texture },
      uSunUW: { value: sunUW },
      uSunUp: { value: sunAir.clone().negate() },
      uFlatOff: { value: flatOff },
      uSunCol: v3(),
      uSigma: v3(),
      uLightDepth: { value: 1 },
      uAmbTop: v3(),
      uAmbBot: v3(),
      uCausLod: { value: 0 },
      uVase: { value: VASE },
      uFogDeep: v3(),
      uFogUp: v3(),
      uSkyK: { value: 1 },
      uRayK: { value: 1 },
      uExposure: { value: 1 },
      uFade: { value: 0 },
      uFrame: { value: 0 },
      uCamPos: v3(),
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2(1, 1) },
      tScene: { value: sceneRT.texture },
      tRays: { value: raysRT.texture },
      uPx: { value: 900 },
      uBoxMin: { value: new THREE.Vector3(-12, -0.2, -16) },
      uBoxSize: { value: new THREE.Vector3(24, SURF + 0.2, 26) },
    }
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const disposables: { dispose: () => void }[] = [causRT, sceneRT, raysRT, ripples.tex]
    const own = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

    /* caustics: one grid, three refractive indices → R, G, B */
    const causScene = new THREE.Scene()
    const grid = own(new THREE.PlaneGeometry(L + 4, L + 4, MOBILE ? 170 : 230, MOBILE ? 170 : 230).rotateX(-Math.PI / 2))
    const etas: [number, V3][] = [
      [1 / 1.3, [1, 0, 0]],
      [1 / 1.333, [0, 1, 0]],
      [1 / 1.37, [0, 0, 1]],
    ]
    for (const [eta, mask] of etas) {
      const m = own(
        new THREE.ShaderMaterial({
          vertexShader: CAUS_VERT,
          fragmentShader: CAUS_FRAG,
          uniforms: { ...U, uEta: { value: eta }, uMask: { value: new THREE.Vector3(...mask) } },
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.OneFactor,
          blendDst: THREE.OneFactor,
          // folded (past-focus) triangles flip winding, and they still carry light
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        }),
      )
      const mesh = new THREE.Mesh(grid, m)
      mesh.frustumCulled = false
      causScene.add(mesh)
    }

    /* the sea floor world */
    const scene = new THREE.Scene()
    const uw = (defs: Record<string, string>, albedo: string, side: THREE.Side = THREE.FrontSide) =>
      own(
        new THREE.ShaderMaterial({
          vertexShader: UW_VERT,
          fragmentShader: UW_FRAG,
          defines: defs,
          uniforms: { ...U, uAlbedo: { value: new THREE.Color(albedo) } },
          side,
          toneMapped: false,
        }),
      )
    const floorGeo = own(new THREE.PlaneGeometry(170, 170, MOBILE ? 160 : 240, MOBILE ? 160 : 240).rotateX(-Math.PI / 2))
    const floor = new THREE.Mesh(floorGeo, uw({ FLOOR: '' }, '#d9c7a2'))
    floor.frustumCulled = false
    scene.add(floor)

    const vaseMat = uw({ VASE: '' }, '#e8dcc6')
    const vase = new THREE.Group()
    for (const g of amphoraGeometry()) vase.add(new THREE.Mesh(own(g), vaseMat))
    vase.position.copy(VASE)
    vase.rotation.set(0.05, 0.4, -0.09)
    scene.add(vase)

    const rockMat = uw({}, '#5c6a66')
    for (const r of ROCKS) {
      const m = new THREE.Mesh(own(rockGeometry(r.seed)), rockMat)
      m.position.set(...r.p)
      m.scale.set(...r.s)
      m.rotation.y = r.seed
      scene.add(m)
    }

    const blade = own(new THREE.PlaneGeometry(0.08, 1, 1, 7).translate(0, 0.5, 0))
    const total = GRASS.reduce((n, g) => n + g.n, 0)
    const grass = new THREE.InstancedMesh(blade, uw({ GRASS: '' }, '#3f8a52', THREE.DoubleSide), total)
    const o = new THREE.Object3D()
    let k = 0
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const g of GRASS) {
      for (let i = 0; i < g.n; i++) {
        const a = rnd() * Math.PI * 2
        const rr = Math.sqrt(rnd()) * g.r
        o.position.set(g.p[0] + Math.cos(a) * rr, -0.05, g.p[1] + Math.sin(a) * rr)
        o.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.25)
        const hgt = 0.6 + rnd() * 1.4 * (1 - rr / g.r * 0.5)
        o.scale.set(0.8 + rnd() * 0.6, hgt, 1)
        o.updateMatrix()
        grass.setMatrixAt(k++, o.matrix)
      }
    }
    grass.frustumCulled = false
    scene.add(grass)

    const surf = new THREE.Mesh(
      own(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2)),
      own(new THREE.ShaderMaterial({ vertexShader: SURF_VERT, fragmentShader: SURF_FRAG, uniforms: U, side: THREE.DoubleSide, toneMapped: false })),
    )
    surf.position.y = SURF
    surf.frustumCulled = false
    scene.add(surf)

    /* full-screen passes */
    const quad = own(new THREE.PlaneGeometry(2, 2))
    const fs = (frag: string) => {
      const s = new THREE.Scene()
      const m = new THREE.Mesh(quad, own(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms: U, depthTest: false, depthWrite: false, toneMapped: false })))
      m.frustumCulled = false
      s.add(m)
      return s
    }
    const raysScene = fs(RAYS_FRAG)
    const compScene = fs(COMP_FRAG)

    /* marine snow */
    const snowGeo = own(new THREE.BufferGeometry())
    const sp = new Float32Array(SNOW_N * 3)
    const ss = new Float32Array(SNOW_N)
    for (let i = 0; i < SNOW_N; i++) {
      sp[i * 3] = -12 + Math.random() * 24
      sp[i * 3 + 1] = Math.random() * SURF
      sp[i * 3 + 2] = -16 + Math.random() * 26
      ss[i] = Math.random()
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    snowGeo.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1))
    const snow = new THREE.Points(
      snowGeo,
      own(
        new THREE.ShaderMaterial({
          vertexShader: SNOW_VERT,
          fragmentShader: SNOW_FRAG,
          uniforms: U,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      ),
    )
    snow.frustumCulled = false
    const snowScene = new THREE.Scene()
    snowScene.add(snow)

    const cam = new THREE.PerspectiveCamera(64, 1, 0.1, 400)
    return { ripples, U, causRT, sceneRT, raysRT, causScene, scene, raysScene, compScene, snowScene, ortho, cam, disposables, flatOff }
  }, [])
  useEffect(() => () => R.disposables.forEach((d) => d.dispose()), [R])

  /* async compile of every program against the target it draws into; plain backdrop until then */
  const ready = useRef(false)
  useEffect(() => {
    let dead = false
    const raf = requestAnimationFrame(() => {
      if (dead) return
      const prev = gl.getRenderTarget()
      R.sceneRT.setSize(8, 8)
      R.raysRT.setSize(8, 8)
      const jobs: Promise<unknown>[] = []
      gl.setRenderTarget(R.causRT)
      jobs.push(gl.compileAsync(R.causScene, R.ortho))
      gl.setRenderTarget(R.sceneRT)
      jobs.push(gl.compileAsync(R.scene, R.cam))
      gl.setRenderTarget(R.raysRT)
      jobs.push(gl.compileAsync(R.raysScene, R.ortho))
      gl.setRenderTarget(null)
      jobs.push(gl.compileAsync(R.compScene, R.ortho))
      jobs.push(gl.compileAsync(R.snowScene, R.cam))
      gl.setRenderTarget(prev)
      Promise.all(jobs)
        .catch(() => {})
        .then(() => {
          if (dead) return
          ready.current = true
          onReady()
        })
    })
    return () => {
      dead = true
      cancelAnimationFrame(raf)
    }
  }, [R, gl, onReady])

  const st = useMemo(
    () => ({
      t: POSTER ? 30 : 0,
      clock: 0,
      acc: 0,
      fade: POSTER ? 1 : 0,
      frame: 0,
      lastDrop: 0,
      nextAuto: 2.2,
      buf: new THREE.Vector2(),
      fwd: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      v4: new THREE.Vector4(),
      lastUser: -1e9,
    }),
    [],
  )

  // pointer → world drop (surface hit if the ray goes up, else the floor point mapped to the surface above it)
  const dropAt = useCallback(
    (nx: number, ny: number, amp = 1) => {
      const cam = R.cam
      const v = st.v4.set(nx, ny, 1, 1).applyMatrix4(cam.projectionMatrixInverse)
      const d = st.tmp.set(v.x / v.w, v.y / v.w, v.z / v.w).transformDirection(cam.matrixWorld)
      const o = cam.position
      let x: number, z: number
      if (d.y > 0.02) {
        const t = (SURF - o.y) / d.y
        x = o.x + d.x * t
        z = o.z + d.z * t
      } else {
        const t = Math.min((o.y - 0.0) / Math.max(-d.y, 1e-3), 60)
        x = o.x + d.x * t - R.flatOff.x * SURF
        z = o.z + d.z * t - R.flatOff.y * SURF
      }
      R.ripples.drop(x, z, 0.95, amp)
    },
    [R, st],
  )

  useFrame((_, rawDt) => {
    if (!ready.current) {
      gl.setRenderTarget(null)
      gl.setClearColor(0x041a22, 1)
      gl.clear()
      return
    }
    const dt = Math.min(rawDt, 1 / 30)
    const U = R.U
    st.t += POSTER ? 0 : dt
    st.clock += dt
    st.frame++
    st.fade = Math.min(1, st.fade + dt * 0.8)

    /* parameters: blend the depth presets continuously, waves */
    const dv = THREE.MathUtils.clamp(depth.get(), 0, 2)
    const i0 = Math.min(Math.floor(dv), 1)
    const f = dv - i0
    const A = DEPTHS[i0].p
    const B = DEPTHS[i0 + 1].p
    const mix = (a: number, b: number) => a + (b - a) * f
    const mix3 = (u: { value: THREE.Vector3 }, a: V3, b: V3) => u.value.set(mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2]))
    mix3(U.uSigma, A.sigma, B.sigma)
    mix3(U.uFogDeep, A.fogDeep, B.fogDeep)
    mix3(U.uFogUp, A.fogUp, B.fogUp)
    mix3(U.uSunCol, A.sun, B.sun)
    mix3(U.uAmbTop, A.ambTop, B.ambTop)
    mix3(U.uAmbBot, A.ambBot, B.ambBot)
    U.uRayK.value = mix(A.rayK, B.rayK)
    U.uCausLod.value = mix(A.causLod, B.causLod)
    U.uLightDepth.value = mix(A.lightDepth, B.lightDepth)
    U.uSkyK.value = mix(A.skyK, B.skyK)
    U.uExposure.value = mix(A.exposure, B.exposure)
    const r = rough.get()
    U.uRough.value = r
    U.uWaveAmp.value = 1 + 0.3 * r
    U.uTime.value = st.t
    U.uFade.value = st.fade * st.fade * (3 - 2 * st.fade)
    U.uFrame.value = st.frame % 64

    /* ripples: user drops + an occasional ambient drip; fixed 60 Hz steps */
    const q = dropReq.current
    if (q.n !== st.lastDrop) {
      st.lastDrop = q.n
      st.lastUser = st.clock
      dropAt(q.x, q.y, 1.6)
    }
    if (!POSTER && st.clock > st.nextAuto) {
      st.nextAuto = st.clock + 2.8 + Math.random() * 2.6
      if (st.clock - st.lastUser > 6) {
        const a = Math.random() * Math.PI * 2
        const rr = 0.8 + Math.random() * 3
        R.ripples.drop(Math.cos(a) * rr - R.flatOff.x * SURF, Math.sin(a) * rr - R.flatOff.y * SURF, 0.5, 0.8)
      }
    }
    st.acc += POSTER ? 0 : dt
    let n = 0
    while (st.acc >= 1 / 60 && n < 3) {
      R.ripples.step()
      st.acc -= 1 / 60
      n++
    }
    if (n) R.ripples.upload()

    /* camera: slow drift round the amphora; subject right of the copy on desktop, above it on phones */
    const W = size.width
    const H = size.height
    const mobile = W < 760
    const cam = R.cam
    const t = POSTER ? 0 : st.clock
    const yaw = 0.22 + 0.16 * Math.sin(t * 0.045) + 0.05 * Math.sin(t * 0.11)
    const dist = (mobile ? 8.4 : 6.8) + 0.4 * Math.sin(t * 0.06)
    const camY = 1.1 + 0.15 * Math.sin(t * 0.13 + 1)
    const pitch = (mobile ? 0.36 : 0.37) + 0.08 * Math.sin(t * 0.09 + 2)
    cam.position.set(VASE.x + Math.sin(yaw) * dist, camY, VASE.z + Math.cos(yaw) * dist)
    st.fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    cam.lookAt(st.tmp.copy(cam.position).add(st.fwd))
    cam.fov = mobile ? 82 : 68
    cam.aspect = W / H
    cam.updateProjectionMatrix()
    // off-axis shift (keeps verticals straight): move the subject right on desktop, up on phones
    const sx = POSTER ? 0 : mobile ? 0 : 0.3
    const sy = POSTER ? 0.08 : mobile ? 0.44 : 0.15
    cam.projectionMatrix.elements[8] -= sx
    cam.projectionMatrix.elements[9] -= sy
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert()
    cam.updateMatrixWorld()
    U.uInvProj.value.copy(cam.projectionMatrixInverse)
    U.uCamWorld.value.copy(cam.matrixWorld)
    U.uCamPos.value.copy(cam.position)

    /* targets follow the drawing buffer */
    gl.getDrawingBufferSize(st.buf)
    const bw = Math.max(2, Math.floor(st.buf.x))
    const bh = Math.max(2, Math.floor(st.buf.y))
    if (R.sceneRT.width !== bw || R.sceneRT.height !== bh) {
      R.sceneRT.setSize(bw, bh)
      R.raysRT.setSize(Math.max(2, bw >> 1), Math.max(2, bh >> 1))
    }
    U.uRes.value.set(bw, bh)
    U.uPx.value = bh / (2 * Math.tan((cam.fov * Math.PI) / 360))

    const ac = gl.autoClear
    gl.autoClear = false
    gl.setClearColor(0x000000, 0)
    gl.setRenderTarget(R.causRT)
    gl.clear(true, false, false)
    gl.render(R.causScene, R.ortho)
    gl.setRenderTarget(R.sceneRT)
    gl.clear(true, true, false)
    gl.render(R.scene, cam)
    gl.setRenderTarget(R.raysRT)
    gl.render(R.raysScene, R.ortho)
    gl.setRenderTarget(null)
    gl.render(R.compScene, R.ortho)
    gl.render(R.snowScene, cam)
    gl.autoClear = ac
  }, 1)

  return null
}

/* ------------------------------------------------------------------ page */

export default function Caustics() {
  const [depthIdx, setDepthIdx] = useState(1)
  const [waveIdx, setWaveIdx] = useState(0)
  const [ready, setReady] = useState(false)
  const [dpr, setDpr] = useState(BASE_DPR)
  const [drops, setDrops] = useState(0)
  const depth = useMotionValue(1)
  const rough = useMotionValue(0)
  const dropReq = useRef({ n: 0, x: 0, y: 0 })

  useEffect(() => {
    const a = animate(depth, depthIdx, { duration: 1.6, ease: [0.4, 0, 0.2, 1] })
    return () => a.stop()
  }, [depthIdx, depth])
  useEffect(() => {
    const a = animate(rough, WAVES[waveIdx].v, { duration: 2.2, ease: 'easeInOut' })
    return () => a.stop()
  }, [waveIdx, rough])
  const onReady = useCallback(() => setReady(true), [])

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, button, a, input, .demo-chrome')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const q = dropReq.current
    q.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    q.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    q.n++
    setDrops((n) => n + 1)
  }

  const D = DEPTHS[depthIdx]
  return (
    <div className="stage uc" style={{ background: '#041a22', touchAction: 'manipulation' }} onPointerDown={onDown}>
      <style>{css}</style>
      <Canvas dpr={dpr} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}>
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.6, d * 0.82))} onIncline={() => setDpr((d) => Math.min(BASE_DPR, d * 1.12))} flipflops={3} />
        <Sea depth={depth} rough={rough} dropReq={dropReq} onReady={onReady} />
      </Canvas>
      <motion.div className="uc-veil" initial={{ opacity: 1 }} animate={{ opacity: ready ? 0 : 1 }} transition={{ duration: 1.2, ease: 'easeOut' }} />

      <div className="overlay">
        <motion.div
          className="hero-copy uc-copy"
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Caustics · God rays · Snell's window
          </p>
          <h1>水下焦散</h1>
          <p className="uc-lede">海面的每一道起伏都是一枚小透镜，把阳光聚成游动的光网，投在沙地和陶罐上。抬头看，整片天空被压进头顶一圈明亮的「斯涅尔窗」。</p>
          <div className="uc-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={D.label}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                {D.note}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="uc-count">
            已投下 <b>{drops}</b> 滴
          </p>
        </motion.div>

        <div className="dock uc-dock">
          <span className="uc-label">水深</span>
          <Seg items={DEPTHS.map((d, i) => ({ value: i, label: d.label }))} value={depthIdx} onChange={setDepthIdx} />
          <span className="dock-sep" />
          <span className="uc-label">波浪</span>
          <Seg items={WAVES.map((w, i) => ({ value: i, label: w.label }))} value={waveIdx} onChange={setWaveIdx} />
        </div>
        <p className="hint">
          点击任意处 → 水面落下一滴
          <br />
          光网随涟漪扭动、荡开
        </p>
      </div>
    </div>
  )
}

const css = `
.uc-veil { position: absolute; inset: 0; background: #041a22; pointer-events: none; }
.uc .uc-copy { --soft-bg: rgba(2, 18, 24, .78); }
.uc .kicker i { background: #7ff0e0; box-shadow: 0 0 10px #7ff0e0; }
.uc .uc-copy h1 { font-size: clamp(42px, 5vw, 68px); }
.uc .uc-lede { max-width: 370px; font-size: 15px; }
.uc-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.6 var(--mono); letter-spacing: .02em; color: var(--fg-2); }
.uc-meta span { display: inline-block; }
.uc-count { margin-top: 10px !important; font: 500 12px/1 var(--mono) !important; color: var(--fg-2); }
.uc-count b { color: #7ff0e0; font-weight: 600; }
.uc-label { padding: 0 4px 0 10px; font: 500 12px/1 var(--sans); color: var(--fg-2); }
.uc canvas { cursor: crosshair; }
@media (max-width: 760px) {
  .uc .uc-copy { bottom: 92px; }
  .uc .uc-lede { font-size: 13.5px; margin-top: 12px; }
  .uc-meta, .uc-count { display: none; }
  .uc-dock .seg { padding: 0 11px; }
  .uc-label { display: none; }
}
`
