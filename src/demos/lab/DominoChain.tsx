import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Physics, useRapier, type RapierContext, type RapierRigidBody } from '@react-three/rapier'
import { AnimatePresence, motion } from 'motion/react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { buildCourse, createBodies, DH, DT, DW, GRAVITY, push, resetBody, SEG, upY, type Course } from './dominoCourse'

/* ------------------------------------------------------------------ look */

const BG = '#f2efe8'
const GROUND = '#e8e2d7'
const INK = '#2b2a31'
const FACE = '#35343d'
const CREAM = '#f7f3eb'
const FACE_CREAM = '#fcfaf5'
const HEART = '#ee4a57'
const CORAL = '#ff6b4a'

const SEG_LABEL: Record<number, string> = {
  [SEG.spiral]: '螺旋',
  [SEG.s]: 'S 弯',
  [SEG.stairs]: '上下楼梯',
  [SEG.uturn]: '回头弯',
  [SEG.branchA]: '分叉',
  [SEG.branchB]: '分叉',
  [SEG.lead]: '汇合',
  [SEG.field]: '图案阵列',
}

type Phase = 'ready' | 'running' | 'done' | 'rewind'
type View = 'follow' | 'top'
type Ctl = {
  phase: Phase
  view: View
  slow: boolean
  lastUser: number
  req: null | 'start' | 'reset'
  phaseAt: number
  // written by the scene, read by the camera
  focus: THREE.Vector3
  heading: number
  fieldK: number // 0..1 how deep the wave is into the field
  seg: number
}

const COURSE = buildCourse()
const N = COURSE.doms.length
const FIELD_N = N - COURSE.field.start
const MAX_ORDER = COURSE.doms.reduce((m, d) => Math.max(m, d.order), 0)

/* ------------------------------------------------------------------ pip atlas: 8 cells (7 pip pairs + blank) */

const CELLS = 8
const RW_DUR = 0.62
function pipAtlas() {
  const cw = 128
  const ch = 256
  const c = document.createElement('canvas')
  c.width = cw * CELLS
  c.height = ch
  const x = c.getContext('2d')!
  const spots: Record<number, [number, number][]> = {
    0: [],
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
  }
  const pairs: [number, number][] = [[6, 4], [3, 5], [1, 2], [5, 5], [2, 6], [4, 1], [6, 3]]
  x.fillStyle = '#fff'
  pairs.forEach(([a, b], k) => {
    const ox = k * cw
    // divider bar
    x.fillRect(ox + cw * 0.16, ch / 2 - 3, cw * 0.68, 6)
    for (const [half, n] of [[0, a], [1, b]] as const)
      for (const [u, v] of spots[n]) {
        x.beginPath()
        x.arc(ox + cw * (0.14 + u * 0.72), half * (ch / 2) + (ch / 2) * (0.12 + v * 0.76), 11, 0, Math.PI * 2)
        x.fill()
      }
  })
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}

function plateMaterial() {
  const m = new THREE.MeshStandardMaterial({ map: pipAtlas(), roughness: 0.38, metalness: 0 })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n  vMapUv.x = (vMapUv.x + aCell) / ${CELLS.toFixed(1)};`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', 'vec4 pipTx = texture2D( map, vMapUv );')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.95, 0.93, 0.88 ), pipTx.a );')
  }
  return m
}

/* ------------------------------------------------------------------ scene */

function Dominoes({ ctl, onStatus, progressRef }: { ctl: React.RefObject<Ctl>; onStatus: (p: Phase, seg: number) => void; progressRef: React.RefObject<HTMLDivElement | null> }) {
  // <Physics> only loads the wasm; this demo owns its own world so it can step it at any rate
  const { rapier } = useRapier()
  const worldRef = useRef<RapierContext['world'] | null>(null)
  const course: Course = COURSE
  const bodies = useRef<RapierRigidBody[]>([])
  const body = useRef<THREE.InstancedMesh>(null)
  const plate = useRef<THREE.InstancedMesh>(null)
  const marker = useRef<THREE.Group>(null)

  const geos = useMemo(() => {
    const b = new RoundedBoxGeometry(DW, DH, DT, 2, 0.028)
    const p = new THREE.PlaneGeometry(DW * 0.82, DH * 0.88)
    const cell = new Float32Array(N)
    course.doms.forEach((d, i) => (cell[i] = d.seg === SEG.field ? CELLS - 1 : (i * 5 + (i >> 2)) % (CELLS - 1)))
    p.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1))
    return { b, p }
  }, [course])
  const mats = useMemo(() => ({ body: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 }), plate: plateMaterial() }), [])

  const st = useMemo(
    () => ({
      acc: 0,
      sim: 0,
      lastFall: 0,
      fallen: new Uint8Array(N),
      count: 0,
      front: 0,
      frontOrder: -1,
      seg: -1,
      phase: 'ready' as Phase,
      rw: 0,
      rwTotal: 0,
      runs: [] as number[],
      rwPos: new Float32Array(N * 3),
      rwQuat: new Float32Array(N * 4),
      rwDelay: new Float32Array(N),
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      local: new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -DT / 2 - 0.0035),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      one: new THREE.Vector3(1, 1, 1),
      homeQ: course.doms.map((d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw)),
    }),
    [course],
  )

  useEffect(() => {
    const b = body.current!
    const p = plate.current!
    const c = new THREE.Color()
    course.doms.forEach((d, i) => {
      b.setColorAt(i, c.set(i === 0 ? CORAL : d.seg === SEG.field ? CREAM : INK))
      p.setColorAt(i, c.set(d.seg === SEG.field ? (d.heart ? HEART : FACE_CREAM) : i === 0 ? CORAL : FACE))
    })
    b.instanceColor!.needsUpdate = true
    p.instanceColor!.needsUpdate = true
  }, [course])

  const setPhase = (ph: Phase) => {
    st.phase = ph
    const c = ctl.current!
    c.phase = ph
    c.phaseAt = performance.now()
    onStatus(ph, st.seg)
  }

  const clearTracking = () => {
    st.fallen.fill(0)
    st.count = 0
    st.front = 0
    st.frontOrder = -1
    st.seg = -1
    st.lastFall = st.sim
    ctl.current!.fieldK = 0
  }

  const start = (i = 0) => {
    const rb = bodies.current[i]
    if (!rb || st.fallen[i]) return
    if (st.phase === 'ready') {
      clearTracking()
      st.lastFall = st.sim
      setPhase('running')
    }
    if (st.phase !== 'running') return
    push(rb, course.doms[i])
  }

  const step = (h: number) => {
    const world = worldRef.current!
    world.timestep = h
    world.step()
    st.sim += h
  }

  // bodies live in the raw Rapier world; the <Physics> wrapper is paused and we step it ourselves
  useEffect(() => {
    const world = new rapier.World({ x: 0, y: GRAVITY, z: 0 })
    worldRef.current = world
    const { list } = createBodies(rapier, world, course)
    bodies.current = list
    st.sim = 0
    clearTracking()
    if (POSTER) {
      // deterministic mid-chain still for the gallery poster
      setPhase('running')
      push(list[0], course.doms[0])
      for (let k = 0; k < 120 * 17.1; k++) step(1 / 120)
    } else setPhase('ready')
    return () => {
      bodies.current = []
      worldRef.current = null
      world.free()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rapier, course])

  const beginRewind = () => {
    const list = bodies.current
    // only rewind as far as the wave got
    const maxO = Math.max(1, st.frontOrder + 2)
    const span = 2.1 * Math.min(1, maxO / MAX_ORDER) + 0.3
    st.rwTotal = span + 0.18 + RW_DUR + 0.05
    for (let i = 0; i < N; i++) {
      const rb = list[i]
      const t = rb.translation()
      const r = rb.rotation()
      st.rwPos.set([t.x, t.y, t.z], i * 3)
      st.rwQuat.set([r.x, r.y, r.z, r.w], i * 4)
      rb.setEnabled(false)
      const d = course.doms[i]
      // reverse order: the pattern lifts first, then the course rewinds back to the start
      st.rwDelay[i] = Math.max(0, 1 - d.order / maxO) * span + (d.seg === SEG.field ? Math.abs(Math.sin(i * 12.99)) * 0.18 : 0)
    }
    st.rw = 0
    setPhase('rewind')
  }

  const endRewind = () => {
    const list = bodies.current
    for (let i = 0; i < N; i++) {
      list[i].setEnabled(true)
      resetBody(list[i], course.doms[i])
    }
    clearTracking()
    setPhase('ready')
  }


  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const list = bodies.current
    if (!list.length || !worldRef.current) return

    // requests from the DOM
    if (c.req === 'start') {
      c.req = null
      if (st.phase === 'ready') start(0)
    } else if (c.req === 'reset') {
      c.req = null
      if (st.phase === 'running' || st.phase === 'done') beginRewind()
    }

    const now = performance.now()
    const idle = now - c.lastUser > 6000
    if (!POSTER) {
      if (st.phase === 'ready' && idle && now - c.phaseAt > 3800) start(0)
      if (st.phase === 'done' && idle && now - c.phaseAt > 5200) beginRewind()
    }

    // physics (fixed step; slow motion = quarter speed with a 4× finer step)
    if (st.phase !== 'rewind' && !POSTER) {
      const h = c.slow ? 1 / 480 : 1 / 120
      st.acc += dt * (c.slow ? 0.25 : 1)
      let n = 0
      while (st.acc >= h && n < 8) {
        step(h)
        st.acc -= h
        n++
      }
      if (n === 8) st.acc = 0
    }

    // wavefront tracking
    if (st.phase === 'running' || POSTER) {
      const thr = 0.93
      for (let i = 0; i < N; i++) {
        if (st.fallen[i]) continue
        if (upY(list[i]) < thr) {
          st.fallen[i] = 1
          st.count++
          st.lastFall = st.sim
          const o = course.doms[i].order
          if (o > st.frontOrder || (o === st.frontOrder && i > st.front)) {
            st.frontOrder = o
            st.front = i
          }
        }
      }
      const fd = course.doms[st.front]
      c.seg = st.frontOrder < 0 ? -1 : fd.seg
      if (fd.seg !== st.seg) {
        st.seg = fd.seg
        onStatus(st.phase, st.seg)
      }
      c.fieldK = fd.seg === SEG.field ? Math.min(1, (fd.order - course.doms[course.field.start].order) / 22) : 0
      if (st.phase === 'running' && (st.count === N ? st.sim - st.lastFall > 0.9 : st.sim - st.lastFall > 2.6)) {
        st.runs.push(st.count)
        setPhase('done')
      }
      if (progressRef.current) progressRef.current.style.setProperty('--k', String(st.count / N))
    }

    // camera focus: just ahead of the front
    {
      const fd = course.doms[st.front]
      const ahead = course.doms[Math.min(N - 1, st.front + 3)]
      if (st.phase === 'ready' || st.phase === 'rewind' || st.frontOrder < 0) {
        c.focus.set(course.doms[0].x, 0.5, course.doms[0].z)
        c.heading = course.doms[0].yaw
      } else {
        c.focus.set((fd.x + ahead.x) / 2, fd.y + 0.5, (fd.z + ahead.z) / 2)
        c.heading = fd.yaw
      }
    }

    // render
    const b = body.current!
    const p = plate.current!
    if (st.phase === 'rewind') {
      st.rw += dt
      for (let i = 0; i < N; i++) {
        const d = course.doms[i]
        let k = (st.rw - st.rwDelay[i]) / RW_DUR
        k = k <= 0 ? 0 : k >= 1 ? 1 : k
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
        st.p.set(
          st.rwPos[i * 3] + (d.x - st.rwPos[i * 3]) * e,
          st.rwPos[i * 3 + 1] + (d.y + DH / 2 - st.rwPos[i * 3 + 1]) * e + Math.sin(Math.PI * e) * 0.45,
          st.rwPos[i * 3 + 2] + (d.z - st.rwPos[i * 3 + 2]) * e,
        )
        st.q.set(st.rwQuat[i * 4], st.rwQuat[i * 4 + 1], st.rwQuat[i * 4 + 2], st.rwQuat[i * 4 + 3]).slerp(st.homeQ[i], e)
        st.m.compose(st.p, st.q, st.one)
        b.setMatrixAt(i, st.m)
        p.setMatrixAt(i, st.m2.multiplyMatrices(st.m, st.local))
      }
      if (st.rw > st.rwTotal) endRewind()
    } else {
      for (let i = 0; i < N; i++) {
        const rb = list[i]
        const t = rb.translation()
        const r = rb.rotation()
        st.p.set(t.x, t.y, t.z)
        st.q.set(r.x, r.y, r.z, r.w)
        st.m.compose(st.p, st.q, st.one)
        b.setMatrixAt(i, st.m)
        p.setMatrixAt(i, st.m2.multiplyMatrices(st.m, st.local))
      }
    }
    b.instanceMatrix.needsUpdate = true
    p.instanceMatrix.needsUpdate = true
    b.boundingSphere = null

    // start marker pulses while waiting
    const mk = marker.current
    if (mk) {
      const show = st.phase === 'ready' && !POSTER ? 1 : 0
      const s = THREE.MathUtils.damp(mk.scale.x, show ? 1 : 0.001, 8, dt)
      mk.scale.setScalar(s)
      mk.visible = s > 0.01
      const ring = mk.children[1] as THREE.Mesh
      const k = (now / 1400) % 1
      ring.scale.setScalar(1 + k * 1.4)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k)
    }

    if (import.meta.env.DEV) (window as unknown as { __domino: object }).__domino = { phase: st.phase, fallen: st.count, total: N, sim: +st.sim.toFixed(2), seg: st.seg, runs: st.runs }
  })

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER || e.instanceId == null) return
    const i = e.instanceId
    if (st.phase !== 'ready' && st.phase !== 'running') return
    if (st.fallen[i]) return
    e.stopPropagation()
    ctl.current!.lastUser = performance.now()
    start(i)
  }

  const d0 = course.doms[0]
  return (
    <>
      <instancedMesh
        ref={body}
        args={[geos.b, mats.body, N]}
        castShadow
        receiveShadow
        frustumCulled={false}
        onPointerDown={onDown}
        onPointerOver={(e) => {
          if (e.instanceId != null && !st.fallen[e.instanceId] && (st.phase === 'ready' || st.phase === 'running')) document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
      <instancedMesh ref={plate} args={[geos.p, mats.plate, N]} receiveShadow frustumCulled={false} raycast={() => null} />
      <group ref={marker} position={[d0.x, 0.012, d0.z]}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.52, 0.6, 48]} />
          <meshBasicMaterial color={CORAL} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.56, 0.62, 48]} />
          <meshBasicMaterial color={CORAL} transparent depthWrite={false} />
        </mesh>
      </group>
      {course.blocks.map((bl, i) => (
        <mesh key={i} position={[bl.x, bl.y, bl.z]} rotation-y={bl.yaw} castShadow receiveShadow>
          <boxGeometry args={[bl.hx * 2, bl.hy * 2, bl.hz * 2 + 0.002]} />
          <meshStandardMaterial color={i % 2 ? '#ddd5c7' : '#e3dccf'} roughness={0.85} />
        </mesh>
      ))}
    </>
  )
}

function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[220, 220]} />
      <meshStandardMaterial color={GROUND} roughness={0.95} />
    </mesh>
  )
}

function Lights({ ctl }: { ctl: React.RefObject<Ctl> }) {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 2.3)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -17
    cam.right = cam.top = 17
    cam.near = 1
    cam.far = 70
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.025
    l.shadow.radius = 4
    l.shadow.intensity = 0.62
    return l
  }, [])
  const tgt = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const overview = c.view === 'top' || c.phase === 'rewind'
    const want = overview ? CENTER : c.focus
    tgt.x = THREE.MathUtils.damp(tgt.x, want.x, 3, dt)
    tgt.z = THREE.MathUtils.damp(tgt.z, want.z, 3, dt)
    light.position.set(tgt.x - 9, 22, tgt.z + 12)
    light.target.position.set(tgt.x, 0, tgt.z)
    light.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#ffffff', '#d8cdbb', 1.25]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 6, -10]} intensity={0.45} color="#e3ebff" />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

const CENTER = new THREE.Vector3((COURSE.bounds.minX + COURSE.bounds.maxX) / 2, 0, (COURSE.bounds.minZ + COURSE.bounds.maxZ) / 2)
const SPIRAL = new THREE.Vector3(-10.4, 0, -0.6)
const FIELD_C = new THREE.Vector3(COURSE.field.x, 0, COURSE.field.z)

function dampAngle(a: number, b: number, l: number, dt: number) {
  let d = b - a
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return a + d * (1 - Math.exp(-l * dt))
}

function Rig({ ctl }: { ctl: React.RefObject<Ctl> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const st = useMemo(() => ({ t: new THREE.Vector3(CENTER.x, 0, CENTER.z), az: Math.PI, pitch: 1.0, dist: 30, ox: 0.16, init: false, want: new THREE.Vector3() }), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const { width, height } = state.size
    const mobile = width < 760
    const aspect = width / height
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const overview = c.phase !== 'done' && (c.view === 'top' || c.phase === 'rewind')
    const usable = POSTER ? 1 : overview ? 0.58 : 0.7

    let az: number
    let pitch: number
    let lam = 2.2
    // each framing = a base distance plus the half-extents that must stay on screen
    let base = 0
    let hw = 0
    let hh = 0
    const F = COURSE.field
    if (c.phase === 'done') {
      // finale: look down the field so the heart reads upright
      st.want.set(F.x, 0, F.z)
      az = F.yaw
      pitch = 1.22
      hw = F.half + 1.5
      hh = (F.len / 2 + 1.5) * Math.sin(pitch)
      lam = 1.4
    } else if (overview) {
      // whole course; on portrait phones run the long axis down the screen
      const b = COURSE.bounds
      const portrait = aspect < 1
      st.want.set(CENTER.x, 0, CENTER.z + 0.6)
      az = portrait ? -Math.PI / 2 : Math.PI
      pitch = 1.22
      const ex = (b.maxX - b.minX) / 2 + 1.2
      const ez = (b.maxZ - b.minZ) / 2 + 1.2
      hw = (portrait ? ez : ex) * 1.06
      hh = (portrait ? ex : ez) * Math.sin(pitch) + 1.2
      lam = 1.6
    } else if (c.phase === 'ready' || c.seg <= SEG.spiral) {
      // the spiral is watched as a whole rather than chased round and round
      st.want.set(SPIRAL.x, 0, SPIRAL.z)
      az = 2.6
      pitch = 0.82 + (c.phase === 'ready' ? 0 : 0.12)
      base = c.phase === 'ready' ? 16 : 17.5
      hw = 5
      hh = 4.4
    } else {
      st.want.copy(c.focus)
      // widen as the wave enters the field
      if (c.fieldK > 0) st.want.lerp(FIELD_C, Math.min(1, c.fieldK * 1.3))
      az = c.heading + 0.62
      pitch = 0.72 + c.fieldK * 0.3
      base = 13.5 + c.fieldK * 6
      hw = 4.4 + c.fieldK * 3
      hh = 3
    }
    const ux = mobile ? 0.94 : usable
    const uy = mobile ? 0.46 : 0.84
    let dist = Math.max(base, hw / (tanV * aspect * ux), hh / (tanV * uy))
    if (POSTER) {
      st.want.set(FIELD_C.x + Math.sin(F.yaw) * -2.2, 0, FIELD_C.z + Math.cos(F.yaw) * -2.2)
      az = F.yaw + 0.62
      pitch = 0.62
      dist = 21
    }
    if (!st.init || POSTER) {
      st.init = true
      st.t.copy(st.want)
      st.az = az
      st.pitch = pitch
      st.dist = dist
    }
    const k = 1 - Math.exp(-lam * dt)
    st.t.lerp(st.want, k)
    st.az = dampAngle(st.az, az, lam * 0.6, dt)
    st.pitch = THREE.MathUtils.damp(st.pitch, pitch, lam * 0.8, dt)
    st.dist = THREE.MathUtils.damp(st.dist, dist, lam * 0.8, dt)
    const cp = Math.cos(st.pitch)
    camera.position.set(st.t.x - Math.sin(st.az) * cp * st.dist, st.t.y + Math.sin(st.pitch) * st.dist, st.t.z - Math.cos(st.az) * cp * st.dist)
    camera.lookAt(st.t)
    const fog = state.scene.fog as THREE.Fog | null
    if (fog) {
      fog.near = st.dist * 1.3
      fog.far = st.dist * 3.2
    }
    st.ox = THREE.MathUtils.damp(st.ox, mobile || POSTER ? 0 : overview ? 0.205 : 0.16, lam, dt)
    const oy = POSTER ? 0 : mobile ? 0.2 : 0
    camera.setViewOffset(width, height, -st.ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function DominoChain() {
  const ctl = useRef<Ctl>({
    phase: 'ready',
    view: 'follow',
    slow: false,
    lastUser: -1e9,
    req: null,
    phaseAt: performance.now(),
    focus: new THREE.Vector3(),
    heading: 0,
    fieldK: 0,
    seg: -1,
  })
  const [phase, setPhase] = useState<Phase>('ready')
  const [seg, setSeg] = useState(-1)
  const [view, setView] = useState<View>('follow')
  const [slow, setSlow] = useState(false)
  const progress = useRef<HTMLDivElement>(null)

  const user = () => (ctl.current.lastUser = performance.now())
  const onStatus = (p: Phase, s: number) => {
    setPhase(p)
    setSeg(s)
  }
  const toggleSlow = () => {
    user()
    ctl.current.slow = !ctl.current.slow
    setSlow(ctl.current.slow)
  }
  const doStart = () => {
    user()
    ctl.current.req = 'start'
  }
  const doReset = () => {
    user()
    ctl.current.req = 'reset'
  }

  const status =
    phase === 'ready'
      ? '就位 · 等你推第一块'
      : phase === 'running'
        ? `正在倒下 · ${SEG_LABEL[seg] ?? '螺旋'}`
        : phase === 'done'
          ? '全部倒下 · 图案出现'
          : '倒带复位中…'

  return (
    <div className="stage dom-stage">
      <style>{`
        .dom-stage { background: ${BG}; }
        .dom-stage .scrim { --soft-bg: ${BG}; }
        .dom-stage .hero-copy h1 em { color: ${HEART}; }
        .dom-stat { margin-top: 24px; font: 500 12px/1 var(--mono); letter-spacing: .04em; color: var(--fg-2); }
        .dom-stat-row { display: flex; align-items: center; gap: 10px; height: 16px; }
        .dom-stat-row b { width: 8px; height: 8px; border-radius: 2px; background: ${INK}; transition: background .3s; }
        .dom-stat-row b.on { background: ${CORAL}; }
        .dom-bar { --k: 0; position: relative; width: min(300px, 100%); height: 3px; margin-top: 12px; border-radius: 3px; background: rgba(43,42,49,.1); overflow: hidden; }
        .dom-bar::after { content: ''; position: absolute; inset: 0; background: ${INK}; transform-origin: 0 50%; transform: scaleX(var(--k)); }
        .dom-count { font-variant-numeric: tabular-nums; color: var(--fg); }
        .dom-slow { min-width: 0; }
        .dom-stage .seg[data-on='true'] { color: ${CORAL}; }
        @media (max-width: 760px) {
          .dom-stage .hero-copy p:not(.kicker) { font-size: 14px; line-height: 1.65; }
          .dom-stage .hero-actions { display: none; }
          .dom-stage .dock .seg { padding: 0 11px; }
        }
      `}</style>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.1, far: 300, position: [0, 20, 30] }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 38, 90]} />
        <Rig ctl={ctl} />
        <Lights ctl={ctl} />
        <Ground />
        <Suspense fallback={null}>
          <Physics paused gravity={[0, GRAVITY, 0]}>
            <Dominoes ctl={ctl} onStatus={onStatus} progressRef={progress} />
          </Physics>
        </Suspense>
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Rapier · {N} rigid bodies
          </p>
          <h1>
            推倒第一块
            <br />
            就<em>够了</em>
          </h1>
          <p>
            {N} 块骨牌沿螺旋、S 弯、上下楼梯和一段分叉排开，最后冲进 {FIELD_N} 块的扇形阵列，倒下后拼出一颗心。每块都是真刚体，镜头一路追着倒下的波前。
          </p>
          <div className="hero-actions">
            <button className="btn primary" onClick={phase === 'ready' ? doStart : doReset} disabled={phase === 'rewind'}>
              {phase === 'ready' || phase === 'rewind' ? '推倒' : '重置'}
            </button>
            <button className="btn" onClick={toggleSlow} aria-pressed={slow}>
              {slow ? '恢复速度' : '慢动作'}
            </button>
          </div>
          <div className="dom-stat">
            <div className="dom-stat-row">
              <b className={phase === 'running' ? 'on' : ''} />
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={status}
                  initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
                  transition={{ duration: 0.18 }}
                >
                  {status}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="dom-bar" ref={progress} />
          </div>
        </motion.div>

        <div className="dock">
          <button className="seg" onClick={doStart} disabled={phase !== 'ready'} style={{ opacity: phase === 'ready' ? 1 : 0.45 }}>
            <span>推倒</span>
          </button>
          <button className="seg" onClick={doReset} disabled={phase === 'ready' || phase === 'rewind'} style={{ opacity: phase === 'ready' || phase === 'rewind' ? 0.45 : 1 }}>
            <span>重置</span>
          </button>
          <span className="dock-sep" />
          <button className="seg dom-slow" data-on={slow} aria-pressed={slow} onClick={toggleSlow}>
            <span>慢动作</span>
          </button>
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 'follow', label: '跟随' },
              { value: 'top', label: '俯视' },
            ]}
            value={view}
            onChange={(v) => {
              user()
              ctl.current.view = v
              setView(v)
            }}
          />
        </div>
        <p className="hint">点击珊瑚色的起点骨牌推倒 · 慢动作 = 物理步长 ÷4</p>
      </div>
    </div>
  )
}
