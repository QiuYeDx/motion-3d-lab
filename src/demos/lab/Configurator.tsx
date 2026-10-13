import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import {
  BAND_Y,
  bandPadGeo,
  cableGeo,
  CUP_X,
  CUP_Y,
  cupGeo,
  headbandGeo,
  leatherNormal,
  logoTexture,
  YOKE_R,
  YOKE_X,
  yokeGeo,
} from './configuratorParts'

/* ------------------------------------------------------------------ options */

type ColorKey = 'navy' | 'silver' | 'sand' | 'sage' | 'black'
type Way = { key: ColorKey; name: string; shell: string; metal: string; pad: string; cable: string }
const WAYS: Way[] = [
  { key: 'navy', name: '星夜蓝', shell: '#24345f', metal: '#c8ced9', pad: '#1c2234', cable: '#1f2638' },
  { key: 'silver', name: '月光银', shell: '#d5d7dc', metal: '#8d939d', pad: '#3a3c43', cable: '#c9cbd0' },
  { key: 'sand', name: '砂岩粉', shell: '#e2bba8', metal: '#cf9f80', pad: '#f0e5dc', cable: '#dcb4a2' },
  { key: 'sage', name: '鼠尾草', shell: '#9db49c', metal: '#d4cfbd', pad: '#ece8dc', cable: '#97ad96' },
  { key: 'black', name: '曜石黑', shell: '#29292d', metal: '#5a5c62', pad: '#1c1c1f', cable: '#26262a' },
]
type Finish = 'matte' | 'metal' | 'leather'
const FINISHES: { value: Finish; label: string }[] = [
  { value: 'matte', label: '哑光' },
  { value: 'metal', label: '金属' },
  { value: 'leather', label: '皮革' },
]
const FINISH_P: Record<Finish, { rough: number; metal: number; coat: number; normal: number; sheen: number; price: number; weight: number; note: string }> = {
  matte: { rough: 0.72, metal: 0, coat: 0.0, normal: 0, sheen: 0, price: 1999, weight: 248, note: '细砂喷涂 · 抗指纹' },
  metal: { rough: 0.26, metal: 0.82, coat: 0.35, normal: 0, sheen: 0, price: 2399, weight: 268, note: '阳极氧化铝 · CNC' },
  leather: { rough: 0.58, metal: 0, coat: 0.0, normal: 0.65, sheen: 0.6, price: 2699, weight: 256, note: '头层小羊皮 · 手工包覆' },
}

/* ------------------------------------------------------------------ parts + explode offsets */

// part ids; offsets are for the right-hand (+x) side, mirrored on the left
const P_BAND = 0
const P_PAD = 1
const P_SLIDER = 2
const P_YOKE = 3
const P_CUP = 4
const P_CUSHION = 5
const P_PLATE = 6
const P_CABLE = 7
const NPARTS = 8
const OFFSET: [number, number, number][] = [
  [0, 0.95, 0],
  [0, 0.42, 0],
  [0.22, 0.5, 0],
  [0.5, 0, 0],
  [1.0, 0, 0],
  [0.3, -0.05, 0],
  [1.45, 0, 0],
  [-0.2, -0.22, 0.5],
]

type Callout = { part: number; side: 1 | -1; at: [number, number, number]; title: string; sub: string }
const CALLOUTS: Callout[] = [
  { part: P_BAND, side: 1, at: [0, BAND_Y + 1.04, 0], title: '头梁', sub: '铝镁合金骨架' },
  { part: P_PAD, side: 1, at: [-0.35, BAND_Y + 0.8, 0.12], title: '头梁软垫', sub: '记忆棉 · 分压' },
  { part: P_SLIDER, side: -1, at: [-YOKE_X, 0.72, 0], title: '伸缩滑杆', sub: '11 档无级调节' },
  { part: P_YOKE, side: 1, at: [YOKE_X, CUP_Y + YOKE_R * 0.7, YOKE_R * 0.7], title: '转轴支架', sub: '双轴折叠' },
  { part: P_CUP, side: 1, at: [CUP_X + 0.3, CUP_Y - 0.5, 0.3], title: '耳罩壳体', sub: '40mm 动圈单元' },
  { part: P_CUSHION, side: -1, at: [-CUP_X + 0.1, CUP_Y - 0.42, 0.25], title: '耳垫', sub: '慢回弹 · 蛋白皮' },
  { part: P_PLATE, side: 1, at: [CUP_X + 0.38, CUP_Y + 0.25, 0.1], title: '触控面板', sub: '滑动调音量' },
  { part: P_CABLE, side: -1, at: [-0.5, -1.86, 0.62], title: '编织线缆', sub: '3.5mm · 1.2m' },
]

/* ------------------------------------------------------------------ shared state */

type Shared = {
  yaw: number
  vel: number
  pitch: number
  pitchT: number
  drag: { on: boolean; x: number; y: number; t: number }
  lastUser: number
  exploded: boolean
  hop: MotionValue<number>
  explode: MotionValue<number>[]
  way: Way
  finish: Finish
}

/* ------------------------------------------------------------------ headphone */

type Mats = {
  shell: THREE.MeshPhysicalMaterial
  metal: THREE.MeshStandardMaterial
  pad: THREE.MeshPhysicalMaterial
  fabric: THREE.MeshStandardMaterial
  cable: THREE.MeshStandardMaterial
  logo: THREE.MeshStandardMaterial
}

function useMats(): Mats {
  return useMemo(() => {
    const grainA = leatherNormal(256, 22, 5)
    grainA.repeat.set(3, 3)
    const grainB = grainA.clone()
    grainB.repeat.set(6, 2)
    grainB.needsUpdate = true
    const w = WAYS[0]
    const f = FINISH_P.metal
    return {
      shell: new THREE.MeshPhysicalMaterial({
        color: w.shell,
        roughness: f.rough,
        metalness: f.metal,
        clearcoat: f.coat,
        clearcoatRoughness: 0.25,
        normalMap: grainA,
        normalScale: new THREE.Vector2(0, 0),
        sheenColor: new THREE.Color('#ffffff'),
        sheenRoughness: 0.6,
        side: THREE.DoubleSide,
        envMapIntensity: 1.1,
      }),
      metal: new THREE.MeshStandardMaterial({ color: w.metal, metalness: 1, roughness: 0.24, envMapIntensity: 1.3 }),
      pad: new THREE.MeshPhysicalMaterial({
        color: w.pad,
        roughness: 0.72,
        sheen: 0.8,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#9a9aa8'),
        normalMap: grainB,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
      fabric: new THREE.MeshStandardMaterial({ color: '#25262b', roughness: 1 }),
      cable: new THREE.MeshStandardMaterial({ color: w.cable, roughness: 0.5 }),
      logo: new THREE.MeshStandardMaterial({ color: w.metal, metalness: 1, roughness: 0.22, alphaMap: logoTexture(), transparent: true, depthWrite: false }),
    }
  }, [])
}

function Part({ id, side, reg, children }: { id: number; side: 1 | -1; reg: React.RefObject<{ g: THREE.Group; id: number; side: number }[]>; children: React.ReactNode }) {
  return (
    <group
      ref={(g) => {
        if (!g) return
        const list = reg.current!
        if (!list.some((r) => r.g === g)) list.push({ g, id, side })
      }}
    >
      {children}
    </group>
  )
}

function CupSide({ side, mats, reg, geos }: { side: 1 | -1; mats: Mats; reg: React.RefObject<{ g: THREE.Group; id: number; side: number }[]>; geos: Geos }) {
  const s = side
  return (
    <>
      <Part id={P_SLIDER} side={s} reg={reg}>
        {/* slider rod + block */}
        <mesh geometry={geos.rod} material={mats.metal} position={[s * YOKE_X, (CUP_Y + YOKE_R + BAND_Y) / 2 + 0.02, 0]} castShadow />
        <mesh geometry={geos.block} material={mats.shell} position={[s * YOKE_X, BAND_Y + 0.02, 0]} castShadow />
      </Part>
      <Part id={P_YOKE} side={s} reg={reg}>
        <mesh geometry={geos.yoke} material={mats.metal} position={[s * YOKE_X, CUP_Y, 0]} castShadow />
        {/* hinge at the top + pivots at the cup */}
        <mesh geometry={geos.hinge} material={mats.metal} position={[s * YOKE_X, CUP_Y + YOKE_R + 0.02, 0]} castShadow />
        {[1, -1].map((z) => (
          <mesh key={z} geometry={geos.pivot} material={mats.metal} position={[s * YOKE_X, CUP_Y, z * (YOKE_R - 0.1)]} rotation-x={Math.PI / 2} castShadow />
        ))}
      </Part>
      <Part id={P_CUP} side={s} reg={reg}>
        <mesh geometry={geos.cup} material={mats.shell} position={[s * CUP_X, CUP_Y, 0]} rotation-z={-s * (Math.PI / 2)} scale={[1.1, 1, 1]} castShadow receiveShadow />
        <mesh geometry={geos.grill} material={mats.fabric} position={[s * (CUP_X + 0.012), CUP_Y, 0]} rotation-y={s * (Math.PI / 2)} scale={[1, 1.1, 1]} />
      </Part>
      <Part id={P_PLATE} side={s} reg={reg}>
        <group position={[s * (CUP_X + 0.385), CUP_Y, 0]} rotation-y={s * (Math.PI / 2)}>
          <mesh geometry={geos.plate} material={mats.shell} scale={[1, 1.1, 1]} castShadow />
          <mesh geometry={geos.plateRing} material={mats.metal} scale={[1, 1.1, 1]} />
          <mesh geometry={geos.logo} material={mats.logo} position={[0, 0, 0.031]} />
        </group>
      </Part>
      <Part id={P_CUSHION} side={s} reg={reg}>
        <mesh geometry={geos.cushion} material={mats.pad} position={[s * (CUP_X - 0.1), CUP_Y, 0]} rotation-y={Math.PI / 2} scale={[1.1, 1, 0.78]} castShadow />
      </Part>
    </>
  )
}

type Geos = ReturnType<typeof makeGeos>
function makeGeos() {
  const cab = cableGeo()
  const end = cab.curve.getPoint(1)
  const tan = cab.curve.getTangent(1)
  return {
    band: headbandGeo(),
    pad: bandPadGeo(),
    cup: cupGeo(),
    yoke: yokeGeo(),
    rod: new THREE.CylinderGeometry(0.034, 0.034, BAND_Y - (CUP_Y + YOKE_R) + 0.04, 16),
    block: new RoundedBoxGeometry(0.16, 0.22, 0.46, 3, 0.04),
    hinge: new THREE.CylinderGeometry(0.075, 0.075, 0.12, 24),
    pivot: new THREE.CylinderGeometry(0.06, 0.06, 0.2, 20),
    grill: new THREE.CircleGeometry(0.56, 48),
    plate: new THREE.CylinderGeometry(0.42, 0.42, 0.05, 64).rotateX(Math.PI / 2),
    plateRing: new THREE.TorusGeometry(0.425, 0.014, 10, 72),
    logo: new THREE.CircleGeometry(0.3, 48),
    cushion: new THREE.TorusGeometry(0.45, 0.14, 24, 64),
    cable: cab.geo,
    plugPos: end,
    plugQuat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize()),
    plug: new THREE.CylinderGeometry(0.05, 0.05, 0.26, 20).translate(0, 0.13, 0),
    jack: new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12).translate(0, 0.36, 0),
    boot: new THREE.CylinderGeometry(0.03, 0.05, 0.08, 16).translate(0, -0.02, 0),
  }
}

function Headphone({ S, labelSink }: { S: React.RefObject<Shared>; labelSink: React.RefObject<LabelSink | null> }) {
  const mats = useMats()
  const geos = useMemo(makeGeos, [])
  const turn = useRef<THREE.Group>(null)
  const reg = useRef<{ g: THREE.Group; id: number; side: number }[]>([])
  const camera = useThree((s) => s.camera)
  const tmp = useMemo(
    () => ({
      shell: new THREE.Color(),
      metal: new THREE.Color(),
      pad: new THREE.Color(),
      cable: new THREE.Color(),
      v: new THREE.Vector3(),
      c: new THREE.Vector3(),
      init: false,
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = S.current!
    const now = performance.now()

    // ---- turntable: drag → velocity, inertia, idle auto-rotate (or settle to the showcase angle when exploded)
    const idle = !s.drag.on && now - s.lastUser > 2600
    if (!s.drag.on) {
      if (POSTER) {
        s.yaw = SHOW_YAW
        s.vel = 0
      } else if (s.exploded && idle) {
        s.vel = THREE.MathUtils.damp(s.vel, 0, 3, dt)
        const show = SHOW_YAW
        const k = Math.round((s.yaw - show) / (Math.PI * 2))
        s.yaw = THREE.MathUtils.damp(s.yaw, show + k * Math.PI * 2, 1.8, dt)
      } else {
        s.vel = THREE.MathUtils.damp(s.vel, idle ? 0.32 : 0, idle ? 0.8 : 2.2, dt)
      }
      s.pitchT = THREE.MathUtils.damp(s.pitchT, idle ? 0.12 : s.pitchT, 1.5, dt)
    }
    s.yaw += s.vel * dt
    s.pitch = THREE.MathUtils.damp(s.pitch, s.pitchT, 6, dt)
    const g = turn.current!
    g.rotation.y = s.yaw
    g.position.y = s.hop.get() * 0.12

    // ---- explode: each part rides its own staggered spring
    for (const r of reg.current) {
      const e = s.explode[r.id].get()
      const o = OFFSET[r.id]
      r.g.position.set(o[0] * r.side * e, o[1] * e, o[2] * e)
    }

    // ---- colourway / finish lerp
    const w = s.way
    const f = FINISH_P[s.finish]
    const k = tmp.init ? 1 - Math.exp(-dt * 5) : 1
    tmp.init = true
    mats.shell.color.lerp(tmp.shell.set(w.shell), k)
    mats.metal.color.lerp(tmp.metal.set(w.metal), k)
    mats.logo.color.copy(mats.metal.color)
    mats.pad.color.lerp(tmp.pad.set(w.pad), k)
    mats.cable.color.lerp(tmp.cable.set(w.cable), k)
    mats.shell.roughness += (f.rough - mats.shell.roughness) * k
    mats.shell.metalness += (f.metal - mats.shell.metalness) * k
    mats.shell.clearcoat += (f.coat - mats.shell.clearcoat) * k
    mats.shell.sheen += (f.sheen - mats.shell.sheen) * k
    const ns = mats.shell.normalScale.x + (f.normal - mats.shell.normalScale.x) * k
    mats.shell.normalScale.set(ns, ns)

    // ---- callout anchors → screen
    const sink = labelSink.current
    if (sink) {
      g.updateMatrixWorld()
      const { w: W, h: H } = sink.size()
      tmp.c.set(0, 0.1, 0)
      g.localToWorld(tmp.c).project(camera)
      const cx = (tmp.c.x * 0.5 + 0.5) * W
      const cy = (-tmp.c.y * 0.5 + 0.5) * H
      CALLOUTS.forEach((co, i) => {
        const e = s.explode[co.part].get()
        const o = OFFSET[co.part]
        tmp.v.set(co.at[0] + o[0] * co.side * e, co.at[1] + o[1] * e, co.at[2] + o[2] * e)
        g.localToWorld(tmp.v).project(camera)
        sink.place(i, (tmp.v.x * 0.5 + 0.5) * W, (-tmp.v.y * 0.5 + 0.5) * H, cx, cy, Math.min(1, Math.max(0, (e - 0.55) / 0.4)))
      })
    }
  })

  return (
    <group ref={turn}>
      <Part id={P_BAND} side={1} reg={reg}>
        <mesh geometry={geos.band} material={mats.shell} castShadow />
      </Part>
      <Part id={P_PAD} side={1} reg={reg}>
        <mesh geometry={geos.pad} material={mats.pad} castShadow />
      </Part>
      <CupSide side={1} mats={mats} reg={reg} geos={geos} />
      <CupSide side={-1} mats={mats} reg={reg} geos={geos} />
      <Part id={P_CABLE} side={-1} reg={reg}>
        <mesh geometry={geos.cable} material={mats.cable} castShadow />
        <group position={geos.plugPos} quaternion={geos.plugQuat}>
          <mesh geometry={geos.boot} material={mats.cable} />
          <mesh geometry={geos.plug} material={mats.shell} castShadow />
          <mesh geometry={geos.jack} material={mats.metal} />
        </group>
      </Part>
    </group>
  )
}

/* ------------------------------------------------------------------ studio, lights, camera */

function sweepGeometry() {
  const rows: [number, number][] = []
  const R = 6
  const z0 = -5
  for (let i = 0; i <= 10; i++) rows.push([0, 24 - (i / 10) * (24 - z0)])
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * (Math.PI / 2)
    rows.push([R - Math.cos(a) * R, z0 - Math.sin(a) * R])
  }
  for (let i = 1; i <= 4; i++) rows.push([R + (i / 4) * 30, z0 - R])
  const pos: number[] = []
  const idx: number[] = []
  rows.forEach(([y, z]) => pos.push(-50, y, z, 50, y, z))
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

const FLOOR_Y = -2.25
const SHOW_YAW = -0.66

function Studio() {
  const sweep = useMemo(sweepGeometry, [])
  return (
    <>
      <mesh geometry={sweep} position={[0, FLOOR_Y, 0]}>
        <meshStandardMaterial color="#f1efeb" roughness={1} envMapIntensity={0.3} />
      </mesh>
      <ContactShadows position={[0, FLOOR_Y + 0.005, 0]} scale={9} resolution={512} blur={2.6} far={4.5} opacity={0.5} color="#4a4038" frames={POSTER ? 40 : Infinity} />
      <hemisphereLight args={['#ffffff', '#ddd6cc', 0.9]} />
      <directionalLight position={[-3, 6, 5]} intensity={1.4} color="#fff7ee" />
      <directionalLight position={[5, 2, -4]} intensity={0.8} color="#e6ecff" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#a9acb3']} />
        <Lightformer form="rect" intensity={3.2} position={[0, 7, 2]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={2.4} position={[-6, 2, 4]} scale={[2, 8, 1]} />
        <Lightformer form="rect" intensity={1.8} color="#dfe6ff" position={[6, 2.5, 3]} scale={[2.5, 8, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[0, 1, 8]} scale={[8, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffe2cf" position={[3, -1, -7]} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={2} position={[-3, 4, -6]} scale={2} />
        <Lightformer form="rect" intensity={0.8} position={[0, -6, 0]} scale={[14, 14, 1]} />
      </Environment>
    </>
  )
}

function Rig({ S }: { S: React.RefObject<Shared> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const st = useMemo(() => ({ k: 0 }), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = S.current!
    const avg = s.explode.reduce((a, m) => a + m.get(), 0) / NPARTS
    st.k = THREE.MathUtils.damp(st.k, avg, 4, dt)
    const { width, height } = state.size
    const mobile = width < 760
    const aspect = width / height
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    let dist = THREE.MathUtils.lerp(11.8, 15.2, st.k)
    const fitW = THREE.MathUtils.lerp(4.4, 6.6, st.k)
    dist = Math.max(dist, fitW / (2 * tanH * aspect))
    if (POSTER) dist *= 0.86
    const el = s.pitch
    const ty = THREE.MathUtils.lerp(-0.05, 0.3, st.k)
    camera.position.set(0, ty + Math.sin(el) * dist, Math.cos(el) * dist)
    camera.lookAt(0, ty, 0)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.2 : 0.01
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ DOM callouts */

type LabelSink = { size: () => { w: number; h: number }; place: (i: number, ax: number, ay: number, cx: number, cy: number, a: number) => void }

function Callouts({ sinkRef }: { sinkRef: React.RefObject<LabelSink | null> }) {
  const root = useRef<HTMLDivElement>(null)
  const lines = useRef<(SVGLineElement | null)[]>([])
  const dots = useRef<(SVGCircleElement | null)[]>([])
  const labels = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    sinkRef.current = {
      size: () => ({ w: root.current?.clientWidth ?? 1, h: root.current?.clientHeight ?? 1 }),
      place: (i, ax, ay, cx, cy, a) => {
        const el = labels.current[i]
        const ln = lines.current[i]
        const dt = dots.current[i]
        if (!el || !ln || !dt) return
        const W = root.current!.clientWidth
        const H = root.current!.clientHeight
        let dx = ax - cx
        let dy = ay - cy
        const l = Math.hypot(dx, dy) || 1
        dx /= l
        dy /= l
        const len = W < 760 ? 34 : 84
        let lx = ax + dx * len
        let ly = ay + dy * len * 0.8
        const right = dx >= 0
        const bw = el.offsetWidth
        // keep labels on screen and clear of the top chrome
        lx = right ? Math.min(lx, W - bw - 12) : Math.max(lx, bw + 12)
        ly = Math.min(Math.max(ly, 84), H - 120)
        ln.setAttribute('x1', String(ax))
        ln.setAttribute('y1', String(ay))
        ln.setAttribute('x2', String(lx))
        ln.setAttribute('y2', String(ly))
        ln.style.opacity = String(a)
        dt.setAttribute('cx', String(ax))
        dt.setAttribute('cy', String(ay))
        dt.style.opacity = String(a)
        el.style.opacity = String(a)
        el.style.transform = `translate(${right ? lx + 6 : lx - bw - 6}px, ${ly - 16}px) scale(${0.92 + a * 0.08})`
        el.style.transformOrigin = right ? 'left center' : 'right center'
        el.style.visibility = a > 0.01 ? 'visible' : 'hidden'
      },
    }
    return () => void (sinkRef.current = null)
  }, [sinkRef])

  return (
    <div className="cf-callouts" ref={root} aria-hidden>
      <svg width="100%" height="100%">
        {CALLOUTS.map((_, i) => (
          <g key={i}>
            <line ref={(e) => void (lines.current[i] = e)} className="cf-lead" />
            <circle ref={(e) => void (dots.current[i] = e)} r="3.5" className="cf-dot" />
          </g>
        ))}
      </svg>
      {CALLOUTS.map((c, i) => (
        <div key={i} className="cf-label" ref={(e) => void (labels.current[i] = e)}>
          <b>{c.title}</b>
          <span>{c.sub}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ page */

const fmt = (n: number) => '¥' + Math.round(n).toLocaleString('en-US')

function Price({ value }: { value: number }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, fmt)
  useEffect(() => {
    const a = animate(mv, value, { duration: 0.7, ease: [0.23, 1, 0.32, 1] })
    return () => a.stop()
  }, [value, mv])
  return <motion.span className="cf-price">{text}</motion.span>
}

export default function Configurator() {
  const [wayKey, setWayKey] = useState<ColorKey>('navy')
  const [finish, setFinish] = useState<Finish>('metal')
  const [exploded, setExploded] = useState(POSTER)
  const way = WAYS.find((w) => w.key === wayKey)!
  const sinkRef = useRef<LabelSink | null>(null)
  const S = useRef<Shared>({
    yaw: POSTER ? SHOW_YAW : -0.2,
    vel: 0,
    pitch: 0.12,
    pitchT: 0.12,
    drag: { on: false, x: 0, y: 0, t: 0 },
    lastUser: -1e9,
    exploded: POSTER,
    hop: motionValue(0),
    explode: Array.from({ length: NPARTS }, () => motionValue(POSTER ? 1 : 0)),
    way: WAYS[0],
    finish: 'metal',
  })
  const first = useRef(true)

  S.current.way = way
  S.current.finish = finish

  // turntable flourish whenever the configuration changes
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const s = S.current
    s.vel += 3.2
    const a = animate(s.hop, [0, 1, 0], { duration: 0.7, ease: [0.3, 0, 0.2, 1] })
    return () => a.stop()
  }, [wayKey, finish])

  // exploded view: staggered springs (out: band first; in: reverse order)
  useEffect(() => {
    const s = S.current
    s.exploded = exploded
    if (POSTER) return
    const order = exploded ? [P_BAND, P_PAD, P_SLIDER, P_YOKE, P_PLATE, P_CUP, P_CUSHION, P_CABLE] : [P_CABLE, P_CUSHION, P_CUP, P_PLATE, P_YOKE, P_SLIDER, P_PAD, P_BAND]
    const anims = order.map((id, i) =>
      animate(s.explode[id], exploded ? 1 : 0, { type: 'spring', stiffness: 150, damping: exploded ? 15 : 20, delay: i * 0.055 }),
    )
    return () => anims.forEach((a) => a.stop())
  }, [exploded])

  // ambient: cycle colourways while nobody is touching anything
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - S.current.lastUser < 9000 || S.current.drag.on) return
      setWayKey((k) => WAYS[(WAYS.findIndex((w) => w.key === k) + 1) % WAYS.length].key)
    }, 5200)
    return () => clearInterval(id)
  }, [])

  const user = () => (S.current.lastUser = performance.now())

  // drag-to-rotate with inertia
  const onDown = (e: React.PointerEvent) => {
    if (POSTER || (e.target as HTMLElement).tagName !== 'CANVAS' || e.button !== 0) return
    const s = S.current
    s.drag = { on: true, x: e.clientX, y: e.clientY, t: performance.now() }
    s.vel = 0
    user()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    document.body.style.cursor = 'grabbing'
  }
  const onMove = (e: React.PointerEvent) => {
    const s = S.current
    if (!s.drag.on) return
    const now = performance.now()
    const dx = e.clientX - s.drag.x
    const dy = e.clientY - s.drag.y
    const dtt = Math.max(8, now - s.drag.t) / 1000
    const dyaw = dx * 0.0085
    s.yaw += dyaw
    s.vel = THREE.MathUtils.lerp(s.vel, dyaw / dtt, 0.5)
    s.pitchT = THREE.MathUtils.clamp(s.pitchT + dy * 0.003, -0.12, 0.42)
    s.drag.x = e.clientX
    s.drag.y = e.clientY
    s.drag.t = now
    user()
  }
  const onUp = () => {
    const s = S.current
    if (!s.drag.on) return
    s.drag.on = false
    if (performance.now() - s.drag.t > 90) s.vel = 0
    s.vel = THREE.MathUtils.clamp(s.vel, -9, 9)
    user()
    document.body.style.cursor = ''
  }

  const p = FINISH_P[finish]
  const swatches = (
    <div className="cf-swatches" role="radiogroup" aria-label="配色">
      {WAYS.map((w) => (
        <button
          key={w.key}
          className="cf-swatch"
          role="radio"
          aria-checked={w.key === wayKey}
          aria-label={w.name}
          title={w.name}
          onClick={() => {
            user()
            setWayKey(w.key)
          }}
        >
          {w.key === wayKey && <motion.span layoutId="cf-ring" className="cf-ring" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
          <i style={{ background: `linear-gradient(135deg, ${w.shell} 0 55%, ${w.metal} 55% 100%)` }} />
        </button>
      ))}
    </div>
  )

  return (
    <div className="stage cf-stage" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <style>{`
        .cf-stage { background: #f2f1ee; touch-action: none; cursor: grab; }
        .cf-stage .overlay { cursor: default; }
        .cf-stage .scrim { --soft-bg: #f2f1ee; }
        .cf-stage .hero-copy h1 em { color: #3b4f8f; }
        .cf-card { margin-top: 26px; padding: 18px 20px 16px; border-radius: 18px; background: rgba(255,255,255,0.62); box-shadow: inset 0 0 0 1px rgba(29,28,26,0.07), 0 18px 40px -24px rgba(40,30,20,0.35); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3); max-width: 400px; }
        .cf-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .cf-card-name { margin: 0 !important; font: 500 11px/1 var(--mono) !important; letter-spacing: .08em; color: var(--fg-2); }
        .cf-sel { position: relative; height: 26px; margin-top: 10px; overflow: hidden; }
        .cf-sel > div { position: absolute; inset: 0; display: flex; align-items: center; gap: 8px; font: 600 19px/1 var(--display); letter-spacing: -0.01em; color: var(--fg); white-space: nowrap; }
        .cf-sel em { color: var(--fg-2); font-weight: 400; }
        .cf-price { font: 600 22px/1 var(--display); letter-spacing: -0.02em; color: var(--fg); font-variant-numeric: tabular-nums; }
        .cf-specs { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }
        .cf-specs span { padding: 6px 9px; border-radius: 8px; background: rgba(29,28,26,0.05); font: 500 11.5px/1 var(--mono); color: var(--fg-2); white-space: nowrap; }
        .cf-specs span b { color: var(--fg); font-weight: 600; }
        .cf-swatches { display: flex; align-items: center; gap: 2px; padding: 0 4px; }
        .cf-swatch { position: relative; width: 34px; height: 34px; border: 0; padding: 0; background: transparent; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
        .cf-swatch i { position: relative; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.15); transition: transform .2s var(--ease-out); }
        .cf-swatch:hover i { transform: scale(1.08); }
        .cf-ring { position: absolute; inset: 2px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--fg); }
        .cf-xbtn { display: inline-flex; align-items: center; gap: 8px; }
        .cf-xbtn svg { transition: transform .45s var(--ease-out); }
        .cf-xbtn[aria-pressed='true'] svg { transform: rotate(45deg); }
        .cf-callouts { position: absolute; inset: 0; pointer-events: none !important; }
        .cf-callouts svg { position: absolute; inset: 0; overflow: visible; }
        .cf-lead { stroke: rgba(29,28,26,0.42); stroke-width: 1; }
        .cf-dot { fill: #fff; stroke: #1d1c1a; stroke-width: 1.5; }
        .cf-label { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; gap: 3px; padding: 7px 10px 8px; border-radius: 10px; background: rgba(255,255,255,0.78); box-shadow: inset 0 0 0 1px rgba(29,28,26,0.07), 0 6px 18px -10px rgba(40,30,20,0.4); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); white-space: nowrap; visibility: hidden; opacity: 0; will-change: transform, opacity; }
        .cf-label b { font: 600 12.5px/1.1 var(--sans); color: var(--fg); }
        .cf-label span { font: 400 11px/1.1 var(--sans); color: var(--fg-2); }
        @media (max-width: 760px) {
          .cf-stage .hero-copy { bottom: 136px; }
          .cf-stage .hero-copy h1 { font-size: 32px; }
          .cf-stage .hero-copy > p:not(.kicker) { display: none; }
          .cf-stage .hero-actions { display: none; }
          .cf-card { margin-top: 14px; padding: 14px 16px 12px; }
          .cf-specs { display: none; }
          .cf-stage .dock { flex-wrap: wrap; justify-content: center; border-radius: 22px; row-gap: 2px; width: calc(100% - 32px); }
          .cf-stage .dock .dock-sep.cf-row { flex-basis: 100%; height: 0; margin: 0; background: none; }
          .cf-label { padding: 5px 8px 6px; }
          .cf-label span { display: none; }
        }
      `}</style>
      <Canvas dpr={[1, 2]} camera={{ fov: 28, near: 0.1, far: 200, position: [0, 1, 12] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}>
        <fog attach="fog" args={['#f2f1ee', 26, 50]} />
        <Rig S={S} />
        <Studio />
        <Headphone S={S} labelSink={sinkRef} />
      </Canvas>

      <div className="overlay">
        <Callouts sinkRef={sinkRef} />
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Configurator · Exploded view
          </p>
          <h1>
            配出属于你的
            <br />
            <em>那一副</em>
          </h1>
          <p>拖动产品 360° 旋转；换配色、换材质，颜色平滑过渡；打开爆炸视图，看清每个部件在哪、用的什么料。</p>
          <div className="cf-card">
            <div className="cf-card-top">
              <p className="cf-card-name">AURA STUDIO · 头戴式降噪耳机</p>
            </div>
            <div className="cf-card-top">
              <div className="cf-sel" style={{ flex: 1 }}>
                <AnimatePresence initial={false}>
                  <motion.div
                    key={wayKey + finish}
                    initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -14, filter: 'blur(4px)' }}
                    transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                  >
                    {way.name} <em>·</em> {FINISHES.find((f) => f.value === finish)!.label}
                  </motion.div>
                </AnimatePresence>
              </div>
              <Price value={p.price} />
            </div>
            <div className="cf-specs">
              <span>{p.note}</span>
              <span>
                重量 <b>{p.weight}</b> g
              </span>
              <span>
                续航 <b>40</b> h
              </span>
            </div>
          </div>
          <div className="hero-actions">
            <button
              className="btn primary cf-xbtn"
              aria-pressed={exploded}
              onClick={() => {
                user()
                setExploded((v) => !v)
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {exploded ? '组装回去' : '爆炸视图'}
            </button>
          </div>
        </motion.div>

        <div className="dock">
          {swatches}
          <span className="dock-sep cf-row" />
          <Seg
            items={FINISHES}
            value={finish}
            onChange={(v) => {
              user()
              setFinish(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg cf-xbtn"
            aria-pressed={exploded}
            onClick={() => {
              user()
              setExploded((v) => !v)
            }}
          >
            {exploded && <motion.span layoutId="cf-x" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>爆炸视图</span>
          </button>
        </div>
        <p className="hint">拖动旋转 · 松手有惯性 · 闲置时自动转台</p>
      </div>
    </div>
  )
}
