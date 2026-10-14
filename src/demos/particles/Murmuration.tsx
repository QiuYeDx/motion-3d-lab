import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { BIRD_FRAG, BIRD_VERT, GRID, GRID_TEX, POS_FRAG, SPLAT_FRAG, SPLAT_VERT, VEL_FRAG } from './murmurationShaders'

/* ------------------------------------------------------------------ config */

const PHONE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const TEX_W = 128
const TEX_H = PHONE ? 64 : 128
const N = TEX_W * TEX_H
const COUNTS = PHONE ? [2048, 4096, 8192] : [4096, 8192, 16384]

type Behaviour = { ali: number; coh: number; sep: number; speed: number; noise: number; targetK: number; densRef: number }
const BEHAVIOURS: { key: string; label: string; u: Behaviour; dive: number }[] = [
  { key: 'loose', label: '松散', u: { ali: 1.3, coh: 1.4, sep: 1.5, speed: 4.4, noise: 2.0, targetK: 1.7, densRef: 15 }, dive: 11 },
  { key: 'tight', label: '紧密', u: { ali: 3.0, coh: 2.6, sep: 1.0, speed: 5.2, noise: 2.2, targetK: 1.8, densRef: 28 }, dive: 10 },
  { key: 'startle', label: '惊散', u: { ali: 2.4, coh: 1.7, sep: 1.8, speed: 5.8, noise: 2.4, targetK: 2.0, densRef: 16 }, dive: 4.2 },
]
type BKey = keyof Behaviour
const BKEYS = Object.keys(BEHAVIOURS[0].u) as BKey[]

const INK = new THREE.Color('#2b2630')
const HAZE = new THREE.Color('#b8aeb6')

/** the roost path the flock drifts along (world units) */
function targetAt(t: number, out: THREE.Vector3, cx = 0) {
  return out.set(cx + Math.sin(t * 0.23) * 4.2 + Math.sin(t * 0.53) * 1.4, 7.6 + Math.sin(t * 0.37 + 1.1) * 1.8, Math.sin(t * 0.29 + 0.6) * 3.5 - 2)
}

/* ------------------------------------------------------------------ hawk silhouette (seen from below) */

function hawkGeometry() {
  const half: [number, number][] = [
    [0, 0.62], [0.08, 0.52], [0.13, 0.3], [0.5, 0.26], [0.9, 0.16], [1.14, 0.04], [1.2, -0.03],
    [1.06, -0.06], [1.1, -0.12], [0.96, -0.12], [0.98, -0.18], [0.78, -0.16], [0.5, -0.16],
    [0.22, -0.22], [0.13, -0.36], [0.26, -0.66], [0, -0.7],
  ]
  const s = new THREE.Shape()
  s.moveTo(half[0][0], half[0][1])
  for (let i = 1; i < half.length; i++) s.lineTo(half[i][0], half[i][1])
  for (let i = half.length - 2; i > 0; i--) s.lineTo(-half[i][0], half[i][1])
  s.closePath()
  return new THREE.ShapeGeometry(s)
}

/* ------------------------------------------------------------------ sim + render */

type Ctl = {
  b: Record<BKey, MotionValue<number>>
  count: MotionValue<number>
  pred: React.MutableRefObject<boolean>
  dive: React.MutableRefObject<number>
  diveEvery: React.MutableRefObject<number>
  lastMove: React.MutableRefObject<number>
  inside: React.MutableRefObject<boolean>
  stats: React.MutableRefObject<HTMLSpanElement | null>
}

function Flock({ ctl }: { ctl: Ctl }) {
  const gl = useThree((s) => s.gl)

  const sim = useMemo(() => {
    const gpu = new GPUComputationRenderer(TEX_W, TEX_H, gl)
    if (!gl.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType)
    const pos0 = gpu.createTexture()
    const vel0 = gpu.createTexture()
    const pa = pos0.image.data as Float32Array
    const va = vel0.image.data as Float32Array
    const c = targetAt(0, new THREE.Vector3())
    for (let i = 0; i < N; i++) {
      // a loose lens of birds heading roughly the same way
      const u = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random())
      pa[i * 4] = c.x + Math.cos(u) * r * 7
      pa[i * 4 + 1] = c.y + (Math.random() - 0.5) * 2.4
      pa[i * 4 + 2] = c.z + Math.sin(u) * r * 4
      pa[i * 4 + 3] = Math.random() * Math.PI * 2
      va[i * 4] = 3.5 + Math.random()
      va[i * 4 + 1] = (Math.random() - 0.5) * 0.6
      va[i * 4 + 2] = 1 + (Math.random() - 0.5) * 1.5
    }
    const velVar = gpu.addVariable('textureVelocity', VEL_FRAG, vel0)
    const posVar = gpu.addVariable('texturePosition', POS_FRAG, pos0)
    gpu.setVariableDependencies(velVar, [velVar, posVar])
    gpu.setVariableDependencies(posVar, [velVar, posVar])

    const grid = new THREE.WebGLRenderTarget(GRID_TEX[0], GRID_TEX[1], {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    const gridU = {
      tGrid: { value: grid.texture },
      uMin: { value: new THREE.Vector3(...GRID.min) },
      uDim: { value: new THREE.Vector3(...GRID.dim) },
      uCell: { value: GRID.cell },
      uTilesX: { value: GRID.tilesX },
      uGridTex: { value: new THREE.Vector2(GRID_TEX[0], GRID_TEX[1]) },
    }
    Object.assign(velVar.material.uniforms, gridU, {
      uDt: { value: 0 },
      uTime: { value: 0 },
      uAli: { value: 1 },
      uCoh: { value: 1 },
      uSep: { value: 1 },
      uSpeed: { value: 4 },
      uNoise: { value: 1 },
      uTargetK: { value: 1 },
      uDensRef: { value: 6 },
      uTarget: { value: new THREE.Vector3() },
      uBMin: { value: new THREE.Vector3(-11, 1.5, -10) },
      uBMax: { value: new THREE.Vector3(11, 15, 6) },
      uPred: { value: new THREE.Vector4() },
      uPredR: { value: 5 },
    })
    Object.assign(posVar.material.uniforms, { uDt: { value: 0 } })
    const err = gpu.init()
    if (err) console.error(err)

    // splat pass: one 1px point per bird into the tiled grid
    const ref = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      ref[i * 3] = ((i % TEX_W) + 0.5) / TEX_W
      ref[i * 3 + 1] = (Math.floor(i / TEX_W) + 0.5) / TEX_H
      ref[i * 3 + 2] = i
    }
    const splatGeo = new THREE.BufferGeometry()
    splatGeo.setAttribute('position', new THREE.BufferAttribute(ref, 3))
    const splatMat = new THREE.ShaderMaterial({
      vertexShader: SPLAT_VERT,
      fragmentShader: SPLAT_FRAG,
      uniforms: { ...gridU, tPos: { value: null }, tVel: { value: null }, uCount: { value: N } },
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    })
    const splatPts = new THREE.Points(splatGeo, splatMat)
    splatPts.frustumCulled = false
    const splatScene = new THREE.Scene()
    splatScene.add(splatPts)
    const splatCam = new THREE.Camera()

    return { gpu, velVar, posVar, grid, splatGeo, splatMat, splatScene, splatCam, ref }
  }, [gl])

  const bird = useMemo(() => {
    // chevron: thin body + two swept wings (local: +z forward, +x span, +y up)
    const P = [
      [0, 0, 0.6], [-0.07, 0, -0.45], [0.07, 0, -0.45],
      [0, 0, 0.14], [0, 0, -0.16], [-0.8, 0, -0.22],
      [0, 0, 0.14], [0.8, 0, -0.22], [0, 0, -0.16],
    ]
    const wing = [0, 0, 0, 0, 0, 1, 0, 1, 0]
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3))
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1))
    g.setAttribute('aRef', new THREE.InstancedBufferAttribute(sim.ref, 3))
    g.instanceCount = N
    const m = new THREE.ShaderMaterial({
      vertexShader: BIRD_VERT,
      fragmentShader: BIRD_FRAG,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        uSize: { value: PHONE ? 0.22 : 0.17 },
        uCount: { value: N },
        uReveal: { value: N * 0.06 },
        uInk: { value: INK },
        uHaze: { value: HAZE },
        uAlpha: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    return { g, m }
  }, [sim])

  const hawk = useMemo(() => {
    const g = hawkGeometry()
    const m = new THREE.MeshBasicMaterial({ color: '#221d26', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    return { g, m }
  }, [])
  const hawkRef = useRef<THREE.Mesh>(null)

  useEffect(
    () => () => {
      sim.gpu.dispose()
      sim.grid.dispose()
      sim.splatGeo.dispose()
      sim.splatMat.dispose()
      bird.g.dispose()
      bird.m.dispose()
      hawk.g.dispose()
      hawk.m.dispose()
    },
    [sim, bird, hawk],
  )

  const tmp = useMemo(
    () => ({
      time: 0,
      target: new THREE.Vector3(),
      pred: new THREE.Vector3(0, 30, 0),
      predGoal: new THREE.Vector3(),
      predPrev: new THREE.Vector3(),
      strength: 0,
      heading: 0,
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hit: new THREE.Vector3(),
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      sp: new THREE.Vector3(),
      sp2: new THREE.Vector3(),
      clear: new THREE.Color(),
      nextDive: 3.5,
      diveT: -1,
      lastDiveReq: 0,
      acc: 0,
      n: 0,
      t0: 0,
    }),
    [],
  )

  useFrame((state, raw) => {
    const dt = Math.min(raw, 1 / 30)
    tmp.time += dt
    const t = tmp.time
    const cam = state.camera as THREE.PerspectiveCamera
    const { width, height } = state.size

    /* camera: slow sway; desktop shifts the sky right of the copy, phones lift it above the copy */
    cam.fov = 40
    const aspect = width / height
    const back = 40 / Math.min(1, aspect * 0.95)
    cam.position.set(Math.sin(t * 0.045) * 3, 2 + Math.sin(t * 0.06) * 0.6, back)
    cam.lookAt(0, 7, 0)
    const mobile = width < 760
    const ox = POSTER || mobile ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.17 : 0
    if (ox || oy) cam.setViewOffset(width, height, -ox * width, oy * height, width, height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()

    // desktop: keep the flock in the sky right of the copy; phones / poster: centred
    const cx = ox ? 0.6 : 0
    targetAt(t, tmp.target, cx)

    /* predator: pointer (if enabled and recently moved) or scheduled dives */
    const now = performance.now()
    const pointerActive = ctl.pred.current && ctl.inside.current && now - ctl.lastMove.current < 2500
    if (ctl.dive.current !== tmp.lastDiveReq) {
      tmp.lastDiveReq = ctl.dive.current
      tmp.nextDive = t
    }
    if (tmp.diveT < 0 && ctl.pred.current && !pointerActive && t >= tmp.nextDive) {
      // pick a line through the flock from off-screen-ish
      const ang = Math.random() * Math.PI * 2
      tmp.a.set(Math.cos(ang) * 15, Math.sin(ang) * 6 + 2, 3).add(tmp.target)
      tmp.b.set(-Math.cos(ang) * 15, -Math.sin(ang) * 6 - 2, -2).add(tmp.target)
      tmp.diveT = 0
    }
    let active = pointerActive
    if (pointerActive) {
      tmp.diveT = -1
      tmp.ray.setFromCamera(state.pointer, cam)
      tmp.plane.constant = -tmp.target.z
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) tmp.predGoal.copy(tmp.hit)
    } else if (tmp.diveT >= 0) {
      tmp.diveT += dt / 2.6
      const k = tmp.diveT
      // ease-in-out pass with a slight swoop
      const e = k * k * (3 - 2 * k)
      tmp.predGoal.lerpVectors(tmp.a, tmp.b, e)
      tmp.predGoal.y -= Math.sin(k * Math.PI) * 2.5
      active = k < 1
      if (k >= 1) {
        tmp.diveT = -1
        tmp.nextDive = t + ctl.diveEvery.current * (0.8 + Math.random() * 0.4)
      }
    } else if (!ctl.pred.current) {
      tmp.nextDive = Math.max(tmp.nextDive, t + 2)
    }
    tmp.predPrev.copy(tmp.pred)
    if (tmp.strength < 0.02 && active) tmp.pred.copy(tmp.predGoal)
    else tmp.pred.lerp(tmp.predGoal, 1 - Math.exp(-dt * (pointerActive ? 9 : 14)))
    tmp.strength = THREE.MathUtils.damp(tmp.strength, active ? 1 : 0, active ? 5 : 2.5, dt)

    /* uniforms */
    const vu = sim.velVar.material.uniforms
    vu.uDt.value = dt
    vu.uTime.value = t
    vu.uAli.value = ctl.b.ali.get()
    vu.uCoh.value = ctl.b.coh.get()
    vu.uSep.value = ctl.b.sep.get()
    vu.uSpeed.value = ctl.b.speed.get()
    vu.uNoise.value = ctl.b.noise.get()
    vu.uTargetK.value = ctl.b.targetK.get()
    vu.uDensRef.value = ctl.b.densRef.get()
    ;(vu.uTarget.value as THREE.Vector3).copy(tmp.target)
    ;(vu.uBMin.value as THREE.Vector3).set(cx - 8, 2.5, -9)
    ;(vu.uBMax.value as THREE.Vector3).set(cx + 7.5, 13, 5)
    ;(vu.uPred.value as THREE.Vector4).set(tmp.pred.x, tmp.pred.y, tmp.pred.z, tmp.strength)
    sim.posVar.material.uniforms.uDt.value = dt

    /* 1) splat birds into the neighbourhood grid */
    const count = ctl.count.get()
    const posTex = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    const velTex = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
    sim.splatMat.uniforms.tPos.value = posTex
    sim.splatMat.uniforms.tVel.value = velTex
    sim.splatMat.uniforms.uCount.value = count
    const prevTarget = gl.getRenderTarget()
    gl.getClearColor(tmp.clear)
    const prevAlpha = gl.getClearAlpha()
    gl.setRenderTarget(sim.grid)
    gl.setClearColor(0x000000, 0)
    gl.clear(true, false, false)
    gl.render(sim.splatScene, sim.splatCam)
    gl.setRenderTarget(prevTarget)
    gl.setClearColor(tmp.clear, prevAlpha)

    /* 2) boids step */
    sim.gpu.compute()

    /* 3) draw */
    bird.m.uniforms.tPos.value = sim.gpu.getCurrentRenderTarget(sim.posVar).texture
    bird.m.uniforms.tVel.value = sim.gpu.getCurrentRenderTarget(sim.velVar).texture
    bird.m.uniforms.uCount.value = count

    const h = hawkRef.current
    if (h) {
      h.position.copy(tmp.pred)
      // heading in screen space from the hawk's motion
      tmp.sp.copy(tmp.pred).project(cam)
      tmp.sp2.copy(tmp.predPrev).project(cam)
      const dx = (tmp.sp.x - tmp.sp2.x) * aspect
      const dy = tmp.sp.y - tmp.sp2.y
      if (dx * dx + dy * dy > 1e-8) {
        const goal = Math.atan2(dy, dx) - Math.PI / 2
        let d = goal - tmp.heading
        d = Math.atan2(Math.sin(d), Math.cos(d))
        tmp.heading += d * (1 - Math.exp(-dt * 6))
      }
      h.quaternion.copy(cam.quaternion)
      h.rotateZ(tmp.heading)
      const flap = Math.sin(t * 7)
      h.scale.set(0.95 * (1 - 0.18 * Math.max(0, flap)), 0.95, 0.95)
      hawk.m.opacity = THREE.MathUtils.damp(hawk.m.opacity, active ? 0.92 : 0, 6, dt)
      h.visible = hawk.m.opacity > 0.01
    }

    /* stats readout (DOM write, no re-render) */
    tmp.acc += raw
    tmp.n++
    if (now - tmp.t0 > 500 && ctl.stats.current) {
      ctl.stats.current.textContent = `${Math.round(count).toLocaleString()} 只 · ${Math.round(tmp.n / Math.max(tmp.acc, 1e-3))} fps`
      tmp.acc = 0
      tmp.n = 0
      tmp.t0 = now
    }
  })

  return (
    <>
      <mesh geometry={bird.g} material={bird.m} frustumCulled={false} />
      <mesh ref={hawkRef} geometry={hawk.g} material={hawk.m} renderOrder={2} visible={false} />
    </>
  )
}

/* ------------------------------------------------------------------ ground silhouette */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function useGroundPaths() {
  return useMemo(() => {
    const W = 1600
    const H = 220
    const r = rng(7)
    // far: rolling treeline (soft canopies)
    let far = `M0 ${H} L0 150`
    for (let x = 0; x <= W; x += 6) {
      const y = 150 - Math.sin(x * 0.004) * 10 - Math.sin(x * 0.011 + 1) * 6
      far += ` L${x} ${y.toFixed(1)}`
    }
    far += ` L${W} ${H} Z`
    let trees = ''
    // canopy band: many overlapping crowns along the far ridge, a few taller poplars poking out
    for (let x = -10; x < W + 10; x += 5 + r() * 9) {
      const base = 150 - Math.sin(x * 0.004) * 10 - Math.sin(x * 0.011 + 1) * 6
      const grove = 0.5 + 0.5 * Math.sin(x * 0.0065 + 0.8) * Math.sin(x * 0.0021 + 2)
      const rr = 5 + r() * 9 * (0.4 + grove)
      const cy = base - rr * (0.5 + r() * 0.6) * (0.5 + grove)
      trees += `M${(x - rr).toFixed(1)} ${(base + 2).toFixed(1)} L${(x - rr).toFixed(1)} ${cy.toFixed(1)} a${rr.toFixed(1)} ${(rr * 1.05).toFixed(1)} 0 0 1 ${(rr * 2).toFixed(1)} 0 L${(x + rr).toFixed(1)} ${(base + 2).toFixed(1)} Z `
      if (r() < 0.07) {
        const h = 34 + r() * 26
        const w = 4 + r() * 3
        trees += `M${(x - w).toFixed(1)} ${base.toFixed(1)} Q${(x - w * 1.2).toFixed(1)} ${(base - h * 0.6).toFixed(1)} ${x.toFixed(1)} ${(base - h).toFixed(1)} Q${(x + w * 1.2).toFixed(1)} ${(base - h * 0.6).toFixed(1)} ${(x + w).toFixed(1)} ${base.toFixed(1)} Z `
      }
    }
    // near: reed bed — tapered blades and a few seed heads
    let near = `M0 ${H} L0 196`
    for (let x = 0; x <= W; x += 8) near += ` L${x} ${(196 - Math.sin(x * 0.006) * 4).toFixed(1)}`
    near += ` L${W} ${H} Z `
    for (let x = 0; x < W; x += 2 + r() * 7) {
      const base = 198 - Math.sin(x * 0.006) * 4
      const h = 14 + r() * 46 * (0.6 + 0.4 * Math.sin(x * 0.003 + 2))
      const lean = (r() - 0.35) * 14
      const w = 1 + r() * 1.4
      near += `M${(x - w).toFixed(1)} ${base.toFixed(1)} Q${(x + lean * 0.3).toFixed(1)} ${(base - h * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(base - h).toFixed(1)} Q${(x + lean * 0.3 + w).toFixed(1)} ${(base - h * 0.6).toFixed(1)} ${(x + w).toFixed(1)} ${base.toFixed(1)} Z `
      if (r() < 0.12) {
        const tx = x + lean
        const ty = base - h
        near += `M${(tx - 1.6).toFixed(1)} ${(ty + 9).toFixed(1)} q1.6 -12 3.2 0 q-1.6 4 -3.2 0 Z `
      }
    }
    return { W, H, far, trees, near }
  }, [])
}

/* ------------------------------------------------------------------ page */

export default function Murmuration() {
  const [countIdx, setCountIdx] = useState(2)
  const [beh, setBeh] = useState(1)
  const [pred, setPred] = useState(true)
  const predRef = useRef(true)
  const dive = useRef(0)
  const diveEvery = useRef(BEHAVIOURS[1].dive)
  const lastMove = useRef(-1e9)
  const inside = useRef(false)
  const stats = useRef<HTMLSpanElement>(null)

  const mv = {
    ali: useMotionValue(BEHAVIOURS[1].u.ali),
    coh: useMotionValue(BEHAVIOURS[1].u.coh),
    sep: useMotionValue(BEHAVIOURS[1].u.sep),
    speed: useMotionValue(BEHAVIOURS[1].u.speed),
    noise: useMotionValue(BEHAVIOURS[1].u.noise),
    targetK: useMotionValue(BEHAVIOURS[1].u.targetK),
    densRef: useMotionValue(BEHAVIOURS[1].u.densRef),
  }
  const count = useMotionValue(COUNTS[2])
  const b = useRef(mv).current
  const ctl = useMemo<Ctl>(() => ({ b, count, pred: predRef, dive, diveEvery, lastMove, inside, stats }), [b, count])

  useEffect(() => {
    const u = BEHAVIOURS[beh].u
    diveEvery.current = BEHAVIOURS[beh].dive
    const ctrls = BKEYS.map((k) => animate(b[k], u[k], { duration: 1.6, ease: [0.45, 0, 0.2, 1] }))
    // switching to 惊散 should show itself right away
    if (BEHAVIOURS[beh].key === 'startle' && predRef.current) dive.current++
    return () => ctrls.forEach((c) => c.stop())
  }, [beh, b])

  useEffect(() => {
    const c = animate(count, COUNTS[countIdx], { duration: 1.4, ease: [0.23, 1, 0.32, 1] })
    return () => c.stop()
  }, [countIdx, count])

  useEffect(() => {
    predRef.current = pred
  }, [pred])

  const g = useGroundPaths()
  const fmt = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n % 10000 ? 1 : 0)} 万` : n.toLocaleString())

  return (
    <div
      className="stage mur-stage"
      style={{
        background:
          'radial-gradient(60% 42% at 68% 96%, rgba(255, 196, 150, 0.85) 0%, rgba(255, 206, 166, 0) 70%), linear-gradient(180deg, #d5d5e3 0%, #e7dfe3 34%, #f4e3d6 62%, #f6d6bd 84%, #f2c7a6 100%)',
        touchAction: 'none',
      }}
      onPointerMove={(e) => {
        lastMove.current = performance.now()
        inside.current = !(e.target as HTMLElement).closest?.('.dock, .hero-copy')
      }}
      onPointerDown={(e) => {
        lastMove.current = performance.now()
        inside.current = !(e.target as HTMLElement).closest?.('.dock, .hero-copy')
      }}
      onPointerLeave={() => (inside.current = false)}
    >
      <style>{`
        .mur-ground { position: absolute; left: 0; right: 0; bottom: 0; height: min(190px, 24vh); width: 100%; pointer-events: none; }
        .mur-stage .hero-copy h1 { color: #26212b; }
        .mur-stage .hero-copy p { color: #5a5058; }
        .mur-stat { font: 500 13px/1 var(--mono); font-variant-numeric: tabular-nums; }
        .mur-toggle .seg-bg { position: absolute; inset: 0; border-radius: inherit; background: color-mix(in srgb, var(--fg) 10%, transparent); z-index: -1; }
        .mur-toggle i { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; vertical-align: 1px; background: currentColor; opacity: .35; transition: opacity .2s, background .2s; }
        .mur-toggle[aria-pressed='true'] i { opacity: 1; background: #d2553a; }
        @media (max-width: 760px) {
          .mur-stage .dock .seg { padding: 0 10px; }
          .mur-stage .dock .dock-sep { margin: 0 2px; }
          .mur-stage .hero-copy p { font-size: 14px; line-height: 1.65; }
        }
      `}</style>

      <Canvas dpr={[1, 2]} camera={{ position: [0, 2, 40], fov: 40, near: 0.5, far: 200 }} gl={{ antialias: true, alpha: true }}>
        <Flock ctl={ctl} />
      </Canvas>

      <svg className="mur-ground" viewBox={`0 0 ${g.W} ${g.H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
        <path d={g.far + g.trees} fill="#6a5866" opacity={0.13} />
        <path d={g.near} fill="#3a3038" opacity={0.24} />
      </svg>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" style={{ ['--soft-bg' as string]: 'rgba(240, 230, 228, 0.55)' }} />
          <p className="kicker">
            <i /> Boids · GPGPU · {fmt(COUNTS[2])}
          </p>
          <h1>
            一万只鸟，
            <br />
            没有指挥
          </h1>
          <p>每只鸟只看身边：别撞上、跟着飞、别掉队。三条局部规则叠在一起，整群就像椋鸟一样流动变形。指针是一只鹰，靠近看鸟群裂开又合拢。</p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                setPred(true)
                predRef.current = true
                dive.current++
              }}
            >
              放一只鹰
            </button>
            <span className="btn" style={{ cursor: 'default' }}>
              <span ref={stats} className="mur-stat">
                {COUNTS[2].toLocaleString()} 只
              </span>
            </span>
          </div>
        </motion.div>

        <div className="dock">
          <Seg items={['少', '中', '多'].map((l, i) => ({ value: i, label: l }))} value={countIdx} onChange={setCountIdx} />
          <span className="dock-sep" />
          <Seg items={BEHAVIOURS.map((x, i) => ({ value: i, label: x.label }))} value={beh} onChange={setBeh} />
          <span className="dock-sep" />
          <button className="seg mur-toggle" aria-pressed={pred} onClick={() => setPred((p) => !p)}>
            {pred && <span className="seg-bg" />}
            <span>
              <i />
              捕食者
            </span>
          </button>
        </div>
        <p className="hint">
          {pred ? '指针是一只鹰 · 掠过鸟群' : '捕食者已关闭'}
          <br />
          {pred ? '静置时它会自己俯冲' : '鸟群只按三条规则飞'}
        </p>
      </div>
    </div>
  )
}
