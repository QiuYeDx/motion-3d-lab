import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { CENSER_FRAG, CENSER_VERT, COMP_FRAG, FS_VERT, LIGHT_FRAG, LIGHT_VERT, POS_FRAG, SMOKE_FRAG, SMOKE_VERT, TIP_FRAG, TIP_VERT, VEL_FRAG } from './smokeShaders'

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const SIZE = MOBILE ? 144 : 192
const COUNT = SIZE * SIZE
const LMAP = MOBILE ? 192 : 256
const RAY_STEPS = MOBILE ? 14 : 24
const CAM_Y = 2.3
const CAM_Z = 11
const FOV = 40
const VOL_C = new THREE.Vector3(0, 3.1, 0) // centre of the smoke volume (sim space)
const VOL_R = 4.4
const TIPS: [number, number, number][] = [
  [-0.13, 0, 0.05],
  [0, 0.07, -0.05],
  [0.12, -0.03, 0.06],
]

/* ------------------------------------------------------------------ looks */

type V3 = [number, number, number]
const hex = (h: string): V3 => {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const LIGHTS = [
  { key: 'side', zh: '侧光', en: 'Side light', dir: [1, 0.32, 0.38] as V3, keyI: 2.3, glowI: 0.42, rays: 0.9, g: 0.45 },
  { key: 'back', zh: '逆光', en: 'Back light', dir: [0.18, 0.28, -1] as V3, keyI: 1.2, glowI: 0.55, rays: 0.9, g: 0.62 },
  { key: 'top', zh: '顶光', en: 'Top light', dir: [0.15, 1, 0.22] as V3, keyI: 2.1, glowI: 0.38, rays: 0.8, g: 0.45 },
]

const PALS = [
  { key: 'ash', zh: '烟灰', bg0: '#101117', bg1: '#060609', keyCol: '#ffeedd', ambLo: '#2e3038', ambHi: '#343a48', glow: '#ffdcb0', base: '#5b4632', stick: '#5a2a1a', rays: 1, glowMul: 1, ink: 0 },
  { key: 'neon', zh: '霓虹', bg0: '#0d0718', bg1: '#05030a', keyCol: '#ff3fae', ambLo: '#0a5a8a', ambHi: '#3a1f9a', glow: '#ff58c0', base: '#3a2a52', stick: '#3a1a40', rays: 0.8, glowMul: 0.45, ink: 0 },
  { key: 'ink', zh: '水墨', bg0: '#f3ede2', bg1: '#e7ddcb', keyCol: '#ffffff', ambLo: '#4a4a4a', ambHi: '#6a6a6a', glow: '#fff6e6', base: '#2a2622', stick: '#2a1a14', rays: 0, glowMul: 0.25, ink: 1 },
]

const DENS = [
  { value: 0, label: '淡', k: 0.55 },
  { value: 1, label: '中', k: 1 },
  { value: 2, label: '浓', k: 1.7 },
]

type Look = {
  L: V3; keyI: number; glowI: number; rays: number; g: number; ink: number; dens: number
  bg0: V3; bg1: V3; key: V3; ambLo: V3; ambHi: V3; glow: V3; base: V3; stick: V3
}
const VEC_KEYS = ['L', 'bg0', 'bg1', 'key', 'ambLo', 'ambHi', 'glow', 'base', 'stick'] as const
const NUM_KEYS = ['keyI', 'glowI', 'rays', 'g', 'ink', 'dens'] as const

function lookOf(li: number, pi: number, di: number): Look {
  const l = LIGHTS[li]
  const p = PALS[pi]
  const d = new THREE.Vector3(...l.dir).normalize()
  return {
    L: [d.x, d.y, d.z],
    keyI: l.keyI,
    glowI: l.glowI * p.glowMul,
    rays: l.rays * p.rays,
    g: l.g,
    ink: p.ink,
    dens: DENS[di].k,
    bg0: hex(p.bg0),
    bg1: hex(p.bg1),
    key: hex(p.keyCol),
    ambLo: hex(p.ambLo),
    ambHi: hex(p.ambHi),
    glow: hex(p.glow),
    base: hex(p.base),
    stick: hex(p.stick),
  }
}
const cloneLook = (l: Look): Look => {
  const o = { ...l } as Look
  for (const k of VEC_KEYS) o[k] = [...l[k]] as V3
  return o
}

/* ------------------------------------------------------------------ helpers */

function spriteTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.globalCompositeOperation = 'lighter'
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * 128 + 64
    const oy = Math.floor(t / 2) * 128 + 64
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.pow(Math.random(), 0.7) * 30
      const x = ox + Math.cos(a) * r
      const y = oy + Math.sin(a) * r
      const s = 10 + Math.random() * 26
      const gr = g.createRadialGradient(x, y, 0, x, y, s)
      const k = 0.06 + Math.random() * 0.1
      gr.addColorStop(0, `rgba(255,255,255,${k})`)
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(ox - 64, oy - 64, 128, 128)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

function censerGeometry() {
  const prof: [number, number][] = [
    [0.001, 0], [0.3, 0], [0.33, 0.04], [0.27, 0.09], [0.3, 0.13], [0.48, 0.2], [0.58, 0.33], [0.62, 0.48],
    [0.6, 0.54], [0.66, 0.57], [0.66, 0.61], [0.6, 0.62], [0.57, 0.58], [0.56, 0.5],
  ]
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y - 1.85)), 64)
  g.computeVertexNormals()
  return g
}

type Ptr = { x: number; y: number; t: number }

/* ------------------------------------------------------------------ scene */

function Smoke({ look, ptr }: { look: React.RefObject<Look>; ptr: React.RefObject<Ptr> }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  /* GPGPU */
  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(SIZE, SIZE, gl)
    if (!gl.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType)
    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    const pa = pos0.image.data as Float32Array
    const va = vel0.image.data as Float32Array
    for (let i = 0; i < pa.length; i += 4) {
      // start as a rough plume (ages < shortest life) so the first frame already has a column of smoke
      const tip = TIPS[Math.floor(Math.random() * 3)]
      const age = Math.random() < 0.15 ? -Math.random() * 2 : Math.random() * 5.2
      const y = Math.max(0, age) * 0.72
      const spread = 0.03 + y * y * 0.025
      pa[i] = tip[0] + (Math.random() - 0.5) * 2 * spread
      pa[i + 1] = tip[1] + y
      pa[i + 2] = tip[2] + (Math.random() - 0.5) * 2 * spread
      pa[i + 3] = age
      va[i + 1] = 0.6
    }
    const velVar = gpu.addVariable('textureVelocity', VEL_FRAG, vel0)
    const posVar = gpu.addVariable('texturePosition', POS_FRAG, pos0)
    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])
    Object.assign(velVar.material.uniforms, {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uTurb: { value: 1 },
      uPS: { value: 0 },
      uPtr: { value: new THREE.Vector3(99, 99, 0) },
      uPtrVel: { value: new THREE.Vector3() },
    })
    Object.assign(posVar.material.uniforms, { uDt: { value: 0 }, uTime: { value: 0 } })
    const err = gpu.init()
    if (err) console.error(err)
    return { gpu, velVar, posVar }
  }, [gl])
  useEffect(() => () => sim.gpu.dispose(), [sim])

  /* render resources */
  const R = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const ref = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      ref[i * 3] = ((i % SIZE) + 0.5) / SIZE
      ref[i * 3 + 1] = (Math.floor(i / SIZE) + 0.5) / SIZE
    }
    geo.setAttribute('position', new THREE.BufferAttribute(ref, 3))

    const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }
    const L0 = new THREE.WebGLRenderTarget(LMAP, LMAP, rtOpts)
    const L1 = new THREE.WebGLRenderTarget(LMAP, LMAP, rtOpts)
    const smokeRT = new THREE.WebGLRenderTarget(4, 4, rtOpts)
    const lightVP = new THREE.Matrix4()

    const lightMat = new THREE.ShaderMaterial({
      vertexShader: LIGHT_VERT,
      fragmentShader: LIGHT_FRAG,
      uniforms: {
        tPos: { value: null },
        uSizeK: { value: 1 },
        uDensity: { value: 1 },
        uLightVP: { value: lightVP },
        uLScale: { value: LMAP / (2 * VOL_R) },
        uBase: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    })
    const lightPts = new THREE.Points(geo, lightMat)
    lightPts.frustumCulled = false
    const lightScene = new THREE.Scene()
    lightScene.add(lightPts)
    const lightCam = new THREE.OrthographicCamera(-VOL_R, VOL_R, VOL_R, -VOL_R, 0.1, VOL_R * 4)

    const sprite = spriteTexture()
    const smokeMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: {
        tPos: { value: null },
        tL0: { value: L0.texture },
        tL1: { value: L1.texture },
        tSprite: { value: sprite },
        uLightVP: { value: lightVP },
        uSizeK: { value: 1 },
        uDensity: { value: 1 },
        uScale: { value: 500 },
        uExt: { value: 0.35 },
        uKeyI: { value: 1.5 },
        uG: { value: 0.5 },
        uInk: { value: 0 },
        uL: { value: new THREE.Vector3(1, 0, 0) },
        uKey: { value: new THREE.Vector3(1, 1, 1) },
        uAmbLo: { value: new THREE.Vector3() },
        uAmbHi: { value: new THREE.Vector3() },
        uCam: { value: new THREE.Vector3() },
        uInkCol: { value: new THREE.Vector3(0.13, 0.125, 0.14) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const smokePts = new THREE.Points(geo, smokeMat)
    smokePts.frustumCulled = false
    smokePts.matrixAutoUpdate = false
    const smokeScene = new THREE.Scene()
    smokeScene.add(smokePts)

    const compMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: COMP_FRAG,
      defines: { RAY_STEPS },
      uniforms: {
        tSmoke: { value: smokeRT.texture },
        uBg0: { value: new THREE.Vector3() },
        uBg1: { value: new THREE.Vector3() },
        uGlowCol: { value: new THREE.Vector3() },
        uLightUV: { value: new THREE.Vector2(1.1, 0.6) },
        uBaseUV: { value: new THREE.Vector2(0.7, 0.1) },
        uGlowI: { value: 0.5 },
        uAspect: { value: 1 },
        uRays: { value: 1 },
        uInk: { value: 0 },
        uTime: { value: 0 },
        uReady: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const compGeo = new THREE.PlaneGeometry(2, 2)
    const comp = new THREE.Mesh(compGeo, compMat)
    comp.frustumCulled = false
    comp.renderOrder = -1

    // censer + three incense sticks + glowing tips
    const censerUniforms = () => ({
      uL: { value: new THREE.Vector3(1, 0, 0) },
      uKey: { value: new THREE.Vector3(1, 1, 1) },
      uBase: { value: new THREE.Vector3(0.3, 0.25, 0.2) },
      uCamW: { value: new THREE.Vector3() },
      uInkCol: { value: new THREE.Vector3(0.1, 0.095, 0.1) },
      uInk: { value: 0 },
      uKeyI: { value: 1 },
    })
    const bowlMat = new THREE.ShaderMaterial({ vertexShader: CENSER_VERT, fragmentShader: CENSER_FRAG, uniforms: censerUniforms(), side: THREE.DoubleSide })
    const stickMat = new THREE.ShaderMaterial({ vertexShader: CENSER_VERT, fragmentShader: CENSER_FRAG, uniforms: censerUniforms() })
    const bowlGeo = censerGeometry()
    const bowl = new THREE.Mesh(bowlGeo, bowlMat)
    const ashGeo = new THREE.CircleGeometry(0.57, 48).rotateX(-Math.PI / 2).translate(0, -1.31, 0)
    const ashMat = new THREE.ShaderMaterial({ vertexShader: CENSER_VERT, fragmentShader: CENSER_FRAG, uniforms: censerUniforms() })
    const ash = new THREE.Mesh(ashGeo, ashMat)
    const stickGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 6, 1)
    const sticks = TIPS.map((tip, i) => {
      const base = new THREE.Vector3(tip[0] * 0.55 + (i - 1) * 0.02, -1.3, tip[2] * 0.6)
      const top = new THREE.Vector3(...tip).add(new THREE.Vector3(0, -0.02, 0))
      const dir = top.clone().sub(base)
      const m = new THREE.Mesh(stickGeo, stickMat)
      m.scale.set(1, dir.length(), 1)
      m.position.copy(base).addScaledVector(dir, 0.5)
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
      return m
    })
    const tipGeo = new THREE.BufferGeometry()
    tipGeo.setAttribute('position', new THREE.Float32BufferAttribute(TIPS.flat(), 3))
    tipGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute([0.3, 1.7, 2.9], 1))
    const tipMat = new THREE.ShaderMaterial({
      vertexShader: TIP_VERT,
      fragmentShader: TIP_FRAG,
      uniforms: { uScale: { value: 500 }, uTime: { value: 0 }, uInk: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const tips = new THREE.Points(tipGeo, tipMat)
    tips.frustumCulled = false
    tips.renderOrder = 3

    const group = new THREE.Group()
    group.add(bowl, ash, ...sticks, tips)

    return {
      geo, L0, L1, smokeRT, lightVP, lightMat, lightScene, lightCam, sprite, smokeMat, smokePts, smokeScene,
      compMat, compGeo, comp, bowlMat, stickMat, ashMat, bowlGeo, ashGeo, stickGeo, tipGeo, tipMat, group,
      buf: new THREE.Vector2(), v: new THREE.Vector3(), L: new THREE.Vector3(), lp: new THREE.Vector3(), inv: new THREE.Matrix4(), ray: new THREE.Raycaster(), ndc: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit: new THREE.Vector3(),
    }
  }, [])

  useEffect(
    () => () => {
      for (const d of [R.geo, R.L0, R.L1, R.smokeRT, R.lightMat, R.sprite, R.smokeMat, R.compMat, R.compGeo, R.bowlMat, R.stickMat, R.ashMat, R.bowlGeo, R.ashGeo, R.stickGeo, R.tipGeo, R.tipMat]) d.dispose()
    },
    [R],
  )

  /* async compile of every program before the first draw (each against the target it is drawn into) */
  const ready = useRef(false)
  useEffect(() => {
    let alive = true
    const prev = gl.getRenderTarget()
    const tmp = new THREE.Scene()
    const plane = new THREE.PlaneGeometry(2, 2)
    tmp.add(new THREE.Mesh(plane, sim.velVar.material), new THREE.Mesh(plane, sim.posVar.material))
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const jobs: Promise<unknown>[] = []
    gl.setRenderTarget(sim.gpu.getCurrentRenderTarget(sim.posVar) as THREE.WebGLRenderTarget)
    jobs.push(gl.compileAsync(tmp, ortho))
    gl.setRenderTarget(R.L0)
    jobs.push(gl.compileAsync(R.lightScene, R.lightCam))
    gl.setRenderTarget(R.smokeRT)
    jobs.push(gl.compileAsync(R.smokeScene, camera))
    gl.setRenderTarget(null)
    jobs.push(gl.compileAsync(scene, camera))
    gl.setRenderTarget(prev)
    Promise.all(jobs)
      .catch(() => {})
      .then(() => {
        plane.dispose()
        if (alive) ready.current = true
      })
    return () => {
      alive = false
    }
  }, [gl, sim, R, scene, camera])

  const st = useRef({ t: 0, ff: POSTER ? 5 : 1.6, ghost: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), ps: 0, hasPrev: false, lastPtr: -1 })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    const lk = look.current
    const { width, height } = state.size
    const aspect = width / height
    const mobile = width < 760

    /* layout: plume right of the copy on desktop, above the copy on phones, centred for posters */
    camera.position.set(0, CAM_Y, CAM_Z)
    camera.lookAt(0, CAM_Y, 0)
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z
    const visW = visH * aspect
    const sc = mobile && !POSTER ? Math.min(0.8, visW / 4.6) : 1
    const gx = POSTER || mobile ? 0 : Math.min(visW * 0.2, visW / 2 - 2.6)
    const baseY = mobile && !POSTER ? CAM_Y - visH / 2 + visH * 0.36 : CAM_Y - visH / 2 + 1.05
    R.group.position.set(gx, baseY + 1.85 * sc, 0)
    R.group.scale.setScalar(sc)
    R.group.updateMatrixWorld()
    R.smokePts.matrix.copy(R.group.matrixWorld)
    R.smokePts.matrixWorld.copy(R.group.matrixWorld)
    R.inv.copy(R.group.matrixWorld).invert()

    if (!ready.current) {
      gl.setRenderTarget(null)
      gl.setClearColor(new THREE.Color().setRGB(lk.bg1[0], lk.bg1[1], lk.bg1[2], THREE.SRGBColorSpace), 1)
      gl.clear(true, true, false)
      return
    }

    /* pointer → sim space; idle → a breeze sweeps through the plume now and then */
    const p = ptr.current
    const now = performance.now()
    const active = now - p.t < 450
    let target: THREE.Vector3 | null = null
    if (active) {
      R.ray.setFromCamera(R.ndc.set(p.x, p.y), camera)
      if (R.ray.ray.intersectPlane(R.plane, R.hit)) target = R.hit.applyMatrix4(R.inv)
      s.ghost = 0
    } else if (now - p.t > 5000 && !POSTER) {
      s.ghost += dt
      const ph = s.ghost % 11
      if (ph > 3 && ph < 5.6) {
        const k = (ph - 3) / 2.6
        const e = k * k * (3 - 2 * k)
        const dirx = Math.floor(s.ghost / 11) % 2 ? -1 : 1
        target = R.hit.set(dirx * (-2.8 + 5.6 * e), 3.0 + Math.sin(k * 3.1) * 0.7, 0)
      }
    }
    if (target) {
      if (s.hasPrev) {
        R.v.copy(target).sub(s.prev).divideScalar(Math.max(dt, 1e-3))
        if (R.v.length() > 14) R.v.setLength(14)
        s.vel.lerp(R.v, 1 - Math.exp(-dt * 18))
      }
      s.prev.copy(target)
      s.hasPrev = true
    } else {
      s.hasPrev = false
      s.vel.multiplyScalar(Math.exp(-dt * 6))
    }
    s.ps = THREE.MathUtils.damp(s.ps, target ? 1 : 0, 10, dt)

    /* simulate (a few extra steps at start so the plume is already developed) */
    const steps = s.ff > 0 ? 3 : 1
    s.ff -= dt
    const vu = sim.velVar.material.uniforms
    const pu = sim.posVar.material.uniforms
    for (let i = 0; i < steps; i++) {
      s.t += dt
      vu.uDt.value = dt
      vu.uTime.value = s.t
      vu.uPS.value = s.ps
      ;(vu.uPtr.value as THREE.Vector3).copy(s.prev)
      ;(vu.uPtrVel.value as THREE.Vector3).copy(s.vel)
      pu.uDt.value = dt
      pu.uTime.value = s.t
      sim.gpu.compute()
    }
    const posTex = sim.gpu.getCurrentRenderTarget(sim.posVar).texture

    /* light camera (sim space) */
    const L = R.L.set(lk.L[0], lk.L[1], lk.L[2]).normalize()
    R.lightCam.position.copy(VOL_C).addScaledVector(L, VOL_R * 2)
    R.lightCam.up.set(0, 1, 0)
    if (Math.abs(L.y) > 0.92) R.lightCam.up.set(0, 0, -1)
    R.lightCam.lookAt(VOL_C)
    R.lightCam.updateMatrixWorld()
    R.lightVP.multiplyMatrices(R.lightCam.projectionMatrix, R.lightCam.matrixWorldInverse)

    /* 1 · opacity shadow map: 8 slices in two RGBA targets */
    const lu = R.lightMat.uniforms
    lu.tPos.value = posTex
    lu.uDensity.value = lk.dens
    gl.setClearColor(0x000000, 0)
    for (let k = 0; k < 2; k++) {
      lu.uBase.value = k * 4
      gl.setRenderTarget(k ? R.L1 : R.L0)
      gl.clear(true, false, false)
      gl.render(R.lightScene, R.lightCam)
    }

    /* 2 · lit particles → half-resolution premultiplied target */
    gl.getDrawingBufferSize(R.buf)
    const w = Math.max(2, Math.round(R.buf.x * 0.5))
    const h = Math.max(2, Math.round(R.buf.y * 0.5))
    if (R.smokeRT.width !== w || R.smokeRT.height !== h) R.smokeRT.setSize(w, h)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const su = R.smokeMat.uniforms
    su.tPos.value = posTex
    su.uDensity.value = lk.dens
    su.uScale.value = (h / (2 * tanHalf)) * sc
    su.uKeyI.value = lk.keyI
    su.uG.value = lk.g
    su.uInk.value = lk.ink
    ;(su.uL.value as THREE.Vector3).copy(L)
    ;(su.uKey.value as THREE.Vector3).fromArray(lk.key)
    ;(su.uAmbLo.value as THREE.Vector3).fromArray(lk.ambLo)
    ;(su.uAmbHi.value as THREE.Vector3).fromArray(lk.ambHi)
    ;(su.uCam.value as THREE.Vector3).copy(camera.position).applyMatrix4(R.inv)
    gl.setRenderTarget(R.smokeRT)
    gl.clear(true, false, false)
    gl.render(R.smokeScene, camera)

    /* 3 · screen: background + smoke + light shafts, then the censer */
    const cu = R.compMat.uniforms
    ;(cu.uBg0.value as THREE.Vector3).fromArray(lk.bg0)
    ;(cu.uBg1.value as THREE.Vector3).fromArray(lk.bg1)
    ;(cu.uGlowCol.value as THREE.Vector3).fromArray(lk.glow)
    cu.uGlowI.value = lk.glowI
    cu.uRays.value = lk.rays
    cu.uInk.value = lk.ink
    cu.uAspect.value = aspect
    cu.uTime.value = s.t
    const lp = R.lp.copy(VOL_C).addScaledVector(L, 7).applyMatrix4(R.group.matrixWorld).project(camera)
    ;(cu.uLightUV.value as THREE.Vector2).set(THREE.MathUtils.clamp(lp.x * 0.5 + 0.5, -0.25, 1.25), THREE.MathUtils.clamp(lp.y * 0.5 + 0.5, -0.25, 1.25))
    const bp = R.v.set(0, -1.85, 0).applyMatrix4(R.group.matrixWorld).project(camera)
    ;(cu.uBaseUV.value as THREE.Vector2).set(bp.x * 0.5 + 0.5, bp.y * 0.5 + 0.5)
    for (const [m, col] of [[R.bowlMat, lk.base], [R.stickMat, lk.stick], [R.ashMat, [0.2, 0.19, 0.18] as V3]] as const) {
      const u = m.uniforms
      ;(u.uL.value as THREE.Vector3).copy(L)
      ;(u.uKey.value as THREE.Vector3).fromArray(lk.key)
      ;(u.uBase.value as THREE.Vector3).fromArray(col)
      ;(u.uCamW.value as THREE.Vector3).copy(camera.position)
      u.uInk.value = lk.ink
      u.uKeyI.value = Math.min(1.2, lk.keyI * 0.6) * (m === R.ashMat ? 0.3 : 1)
    }
    R.tipMat.uniforms.uScale.value = (R.buf.y / (2 * tanHalf)) * sc
    R.tipMat.uniforms.uTime.value = s.t
    R.tipMat.uniforms.uInk.value = lk.ink
    gl.setRenderTarget(null)
    gl.render(scene, camera)
  }, 1)

  return (
    <>
      <primitive object={R.comp} />
      <primitive object={R.group} />
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function VolumetricSmoke() {
  const [li, setLi] = useState(POSTER ? 1 : 0)
  const [pi, setPi] = useState(0)
  const [di, setDi] = useState(1)
  const [autoLight, setAutoLight] = useState(!POSTER)
  const [dpr, setDpr] = useState(MOBILE ? 1.5 : 1.5)
  const look = useRef<Look>(lookOf(li, pi, di))
  const ptr = useRef<Ptr>({ x: 0, y: 0, t: -1e9 })
  const stage = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  // cross-fade every lighting / palette parameter from whatever is on screen
  useEffect(() => {
    const to = lookOf(li, pi, di)
    if (first.current) {
      first.current = false
      look.current = to
      return
    }
    const from = cloneLook(look.current)
    const c = animate(0, 1, {
      duration: 1.4,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        const cur = look.current
        for (const key of NUM_KEYS) cur[key] = from[key] + (to[key] - from[key]) * k
        for (const key of VEC_KEYS) for (let i = 0; i < 3; i++) cur[key][i] = from[key][i] + (to[key][i] - from[key][i]) * k
      },
    })
    return () => c.stop()
  }, [li, pi, di])

  // idle: cycle the light direction until the visitor picks one
  useEffect(() => {
    if (!autoLight) return
    const id = setInterval(() => setLi((i) => (i + 1) % LIGHTS.length), 9000)
    return () => clearInterval(id)
  }, [autoLight])

  useEffect(() => {
    const el = stage.current!
    const set = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ptr.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
      ptr.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
      ptr.current.t = performance.now()
    }
    const onMove = (e: PointerEvent) => {
      // touch: only while dragging; mouse: any hover
      if (e.pointerType !== 'mouse' && e.buttons === 0) return
      set(e)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', set)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', set)
    }
  }, [])

  const pal = PALS[pi]
  const light = LIGHTS[li]

  return (
    <div className="stage vs-root" data-mode={pal.key} style={{ background: pal.bg1 }}>
      <style>{css}</style>
      <div ref={stage} className="vs-canvas">
        <Canvas dpr={dpr} flat gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} camera={{ position: [0, CAM_Y, CAM_Z], fov: FOV, near: 0.1, far: 100 }}>
          <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.85, d * 0.8))} flipflops={3} />
          <Smoke look={look} ptr={ptr} />
        </Canvas>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy vs-copy"
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i />
            {light.en} · {COUNT.toLocaleString()} soft particles
          </p>
          <h1>让光穿过烟</h1>
          <p>烟会给自己投下阴影。逆光时，只剩一圈发亮的边。划过去，把它搅开。</p>
        </motion.div>

        <div className="dock vs-dock">
          <Seg
            items={LIGHTS.map((l, i) => ({ value: i, label: l.zh }))}
            value={li}
            onChange={(v) => {
              setLi(v)
              setAutoLight(false)
            }}
          />
          <span className="dock-sep" />
          <Seg items={PALS.map((p, i) => ({ value: i, label: p.zh }))} value={pi} onChange={setPi} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg vs-dens" aria-label={`浓度 ${DENS[di].label}`} onClick={() => setDi((d) => (d + 1) % DENS.length)}>
              <span>
                {DENS.map((d) => (
                  <i key={d.value} data-on={d.value <= di} />
                ))}
                {DENS[di].label}
              </span>
            </button>
          ) : (
            <Seg items={DENS.map((d) => ({ value: d.value, label: d.label }))} value={di} onChange={setDi} />
          )}
        </div>
        <p className="hint">
          划过烟雾把它搅开
          <br />
          静置时会有一阵风吹过
        </p>
      </div>
    </div>
  )
}

const css = `
.vs-canvas { position: absolute; inset: 0; touch-action: none; }
.vs-root { transition: background .8s; }
.vs-copy { --soft-bg: #08080c; pointer-events: none !important; }
.vs-copy h1 { font-size: clamp(40px, 5vw, 68px); }
.vs-copy p:not(.kicker) { max-width: 360px; }
.vs-copy .kicker i { background: #ffcf9a; box-shadow: 0 0 10px #ffcf9a; }
.vs-root[data-mode='neon'] .vs-copy .kicker i { background: #ff58c0; box-shadow: 0 0 10px #ff58c0; }
.vs-root[data-mode='ink'] .vs-copy { --soft-bg: #f0e9dd; }
.vs-root[data-mode='ink'] .vs-copy .kicker i { background: #b8322a; box-shadow: none; }
.vs-copy .scrim { opacity: .55; transition: opacity .8s; }
.demo-page:has(.vs-root[data-mode='ink']) {
  --fg: #1f1c18;
  --fg-2: rgba(31, 28, 24, .62);
  --glass: rgba(250, 245, 236, .6);
  --glass-line: rgba(31, 28, 24, .1);
  color-scheme: light;
}
.demo-page:has(.vs-root) .chip, .demo-page:has(.vs-root) .overlay { transition: background .6s, color .6s; }
@media (max-width: 760px) {
  .vs-copy { bottom: 84px; }
  .vs-copy h1 { font-size: 34px; }
  .vs-copy p:not(.kicker) { font-size: 13.5px; margin-top: 10px; }
  .vs-copy .kicker { margin-bottom: 12px; font-size: 11px; }
  .vs-dock .seg { padding: 0 9px; }
  .vs-dock .dock-sep { margin: 0 1px; }
  .vs-dens i { display: inline-block; width: 3px; height: 10px; margin-right: 2px; border-radius: 2px; background: currentColor; opacity: .25; vertical-align: -1px; }
  .vs-dens i:nth-of-type(3) { margin-right: 6px; }
  .vs-dens i[data-on='true'] { opacity: 1; }
}
`
