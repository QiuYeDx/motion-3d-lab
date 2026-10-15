import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { drawBack, drawFront, fmtPrice, PRODUCTS, TEX_H, TEX_W } from './coverFlowArt'

/* ------------------------------------------------------------------ constants */

const N = PRODUCTS.length
const CW = 1.6
const CH = 2.2
const CT = 0.05 // slab thickness (without bevel)
const BEV = 0.014
const FACE_Z = CT / 2 + BEV + 0.0015
const LIFT = 0.04 // gap between card bottom and the reflective floor
const BG = '#eef0f5'

type Mode = 'ring' | 'arc' | 'row'
const MODES: { value: Mode; label: string }[] = [
  { value: 'ring', label: '圆环' },
  { value: 'arc', label: '弧形' },
  { value: 'row', label: '平铺列' },
]
const MI: Record<Mode, number> = { ring: 0, arc: 1, row: 2 }

const clamp = THREE.MathUtils.clamp
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
/** signed distance in cards, wrapped into [-N/2, N/2] */
const wrapD = (d: number) => d - N * Math.round(d / N)
const mod = (a: number, n: number) => ((a % n) + n) % n

/* ------------------------------------------------------------------ layouts: card offset d → transform */

type T = { x: number; y: number; z: number; ry: number; s: number }
const RING_R = 3.8

function layout(m: number, d: number, o: T) {
  const ad = Math.abs(d)
  const b = smooth(1, 0, ad) // 1 at centre → 0 one card away
  o.y = 0
  if (m === 0) {
    const a = d * ((Math.PI * 2) / N)
    o.x = RING_R * Math.sin(a)
    o.z = RING_R * (Math.cos(a) - 1)
    o.ry = a
    o.s = 1 + 0.14 * b
  } else if (m === 1) {
    // classic cover flow: centre card square-on, the rest stacked at ~58° on a gentle arc
    const s1 = clamp(d, -1, 1)
    const e = Math.max(ad - 1, 0)
    const sg = Math.sign(d)
    o.x = s1 * 1.32 + sg * e * 0.5
    o.z = -Math.abs(s1) * 1.1 - e * 0.2 - e * e * 0.045
    o.ry = -s1 * 1.02 - sg * e * 0.05
    o.s = (1 + 0.14 * b) * smooth(5.4, 4.2, ad)
  } else {
    // flat shelf: square-on cards, the far ones sink back so the row reads as depth, not a wall
    const e = Math.max(ad - 1, 0)
    o.x = Math.sign(d) * (Math.min(ad, 1) * 1.9 + e * 1.45)
    o.z = -Math.min(ad, 1) * 0.3 - e * 1.6
    o.ry = -clamp(d, -1, 1) * 0.05
    o.s = 1 + 0.1 * b
  }
}

const CAMS = [
  // [camY, dist, lookY, lookZ]
  [2.0, 11.2, 1.0, -1.1],
  [1.7, 10.8, 1.05, -0.6],
  [1.5, 10.6, 1.1, -0.2],
]

/* ------------------------------------------------------------------ resources */

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = 0
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

function radialTex(inner: string, outer: string, size = 128) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gr.addColorStop(0, inner)
  gr.addColorStop(1, outer)
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const REFL_VS = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const REFL_FS = /* glsl */ `
uniform sampler2D map;
uniform vec3 uTint;
uniform float uUseMap;
uniform float uDim;
uniform float uOpacity;
varying vec2 vUv;
varying float vY;
void main() {
  vec3 c = mix(uTint, texture2D(map, vUv).rgb, uUseMap);
  float f = 1.0 - smoothstep(0.0, 1.05, -vY);
  gl_FragColor = vec4(c * uDim, f * f * uOpacity);
  #include <colorspace_fragment>
}`

type CardRes = {
  front: THREE.MeshStandardMaterial
  back: THREE.MeshStandardMaterial
  body: THREE.MeshStandardMaterial
  shadow: THREE.MeshBasicMaterial
  rFront: THREE.ShaderMaterial
  rBack: THREE.ShaderMaterial
  rBody: THREE.ShaderMaterial
  base: THREE.Color
}

function useResources() {
  return useMemo(() => {
    const shape = roundedRect(CW, CH, 0.13)
    const body = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 3, curveSegments: 8 })
    body.translate(0, 0, -CT / 2)
    const face = new THREE.ShapeGeometry(shape, 8)
    const uv = face.attributes.uv as THREE.BufferAttribute
    const pos = face.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + CW / 2) / CW, pos.getY(i) / CH)
    const shadowGeo = new THREE.PlaneGeometry(CW * 1.35, 0.7).rotateX(-Math.PI / 2)
    const shadowTex = radialTex('rgba(30,36,70,0.55)', 'rgba(30,36,70,0)')
    const floorTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 256)
    const placeholder = (() => {
      const c = document.createElement('canvas')
      c.width = c.height = 4
      const g = c.getContext('2d')!
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, 4, 4)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })()

    const reflMat = (map: THREE.Texture, tint: THREE.Color, useMap: number) =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, uTint: { value: tint }, uUseMap: { value: useMap }, uDim: { value: 1 }, uOpacity: { value: 0.3 } },
        vertexShader: REFL_VS,
        fragmentShader: REFL_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })

    const cards: CardRes[] = PRODUCTS.map((p) => {
      const base = new THREE.Color(p.c0).lerp(new THREE.Color('#ffffff'), 0.08)
      const faceMat = () =>
        new THREE.MeshStandardMaterial({ map: placeholder, color: '#ffffff', roughness: 0.34, metalness: 0 })
      return {
        front: faceMat(),
        back: faceMat(),
        body: new THREE.MeshStandardMaterial({ color: base.clone(), roughness: 0.42, metalness: 0 }),
        shadow: new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 1 }),
        rFront: reflMat(placeholder, new THREE.Color('#fff'), 1),
        rBack: reflMat(placeholder, new THREE.Color('#fff'), 1),
        rBody: reflMat(placeholder, base.clone(), 0),
        base,
      }
    })
    return { body, face, shadowGeo, floorTex, cards }
  }, [])
}

/* ------------------------------------------------------------------ shared state */

type Shared = {
  p: MotionValue<number>
  w: MotionValue<number>[][]
  flip: MotionValue<number>[]
  intro: MotionValue<number>
  hover: number
  lastUser: number
  dragging: boolean
}

type Res = ReturnType<typeof useResources>

/* ------------------------------------------------------------------ scene */

function Carousel({ S, res, onPick, titleEl, onReady }: { S: Shared; res: Res; onPick: (i: number) => void; titleEl: React.RefObject<HTMLDivElement | null>; onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const root = useRef<THREE.Group>(null)
  const cards = useRef<(THREE.Group | null)[]>([])
  const refl = useRef<(THREE.Group | null)[]>([])
  const st = useMemo(
    () => ({ t: { x: 0, y: 0, z: 0, ry: 0, s: 1 } as T, acc: { x: 0, y: 0, z: 0, ry: 0, s: 1 } as T, hov: new Float32Array(N), fade: new Float32Array(N), bg: new THREE.Color(BG), v: new THREE.Vector3(), cam: [0, 0, 0, 0], camInit: false }),
    [],
  )
  const ready = useRef(false)

  // paint card faces one per frame (upload immediately), compile programs in the background, then reveal
  useEffect(() => {
    let alive = true
    let painted = 0
    let compiled = false
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => Math.abs(wrapD(a)) - Math.abs(wrapD(b)))
    const tryReveal = () => {
      if (!alive || ready.current || !compiled || painted < N) return
      ready.current = true
      root.current!.visible = true
      onReady()
    }
    const paintOne = () => {
      if (!alive) return
      const i = order[painted]
      const p = PRODUCTS[i]
      const mk = (draw: (c: CanvasRenderingContext2D) => void) => {
        const c = document.createElement('canvas')
        c.width = TEX_W
        c.height = TEX_H
        draw(c.getContext('2d')!)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = aniso
        gl.initTexture(t)
        return t
      }
      const f = mk((c) => drawFront(c, p, i))
      const b = mk((c) => drawBack(c, p, i))
      const r = res.cards[i]
      r.front.map = f
      r.back.map = b
      r.rFront.uniforms.map.value = f
      r.rBack.uniforms.map.value = b
      painted++
      if (painted < N) requestAnimationFrame(paintOne)
      else tryReveal()
    }
    requestAnimationFrame(paintOne)

    const g = root.current!
    g.visible = true
    const job = gl.compileAsync(scene, camera)
    g.visible = false
    job
      .catch(() => {})
      .then(() => {
        compiled = true
        tryReveal()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, res])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const p = S.p.get()
    const intro = S.intro.get()
    const { t, acc } = st

    // ---- camera: blend per-mode framing by the average layout weight
    const mw = [0, 0, 0]
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) mw[k] += Math.max(0, S.w[i][k].get()) / N
    const ws = mw[0] + mw[1] + mw[2] || 1
    const cam = [0, 0, 0, 0]
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) cam[j] += (CAMS[k][j] * mw[k]) / ws
    const { width, height } = state.size
    const aspect = width / height
    const mobile = width < 760
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    // keep ~the centre card plus a sliver of its neighbours on narrow screens
    const fitW = mobile ? 3.1 : 0
    const dist = Math.max(cam[1], fitW / (2 * tanH * aspect)) * (POSTER ? 0.87 : 1)
    if (!st.camInit) {
      st.cam = cam.slice(0, 4)
      st.cam[1] = dist
      st.camInit = true
    }
    st.cam[0] = THREE.MathUtils.damp(st.cam[0], cam[0], 4, dt)
    st.cam[1] = THREE.MathUtils.damp(st.cam[1], dist, 4, dt)
    st.cam[2] = THREE.MathUtils.damp(st.cam[2], cam[2], 4, dt)
    st.cam[3] = THREE.MathUtils.damp(st.cam[3], cam[3], 4, dt)
    const sway = POSTER ? 0 : Math.sin(state.clock.elapsedTime * 0.25) * 0.15
    camera.position.set(sway + (POSTER ? 0 : state.pointer.x * 0.25), st.cam[0] + (POSTER ? 0 : state.pointer.y * 0.12), st.cam[1])
    camera.lookAt(0, st.cam[2], st.cam[3])
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0 : mobile ? 0.14 : 0.02
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    // cards passing under the hero copy (desktop) fade towards the page colour so the text stays readable
    const copyR = mobile || POSTER ? -1e9 : Math.min(width * 0.42, Math.min(Math.max(24, width * 0.06), 96) + 400)

    // ---- cards
    for (let i = 0; i < N; i++) {
      const g = cards.current[i]
      const r = refl.current[i]
      if (!g || !r) continue
      const d = wrapD(i - p)
      acc.x = acc.y = acc.z = acc.ry = acc.s = 0
      let sum = 0
      let wmax = 0
      for (let k = 0; k < 3; k++) {
        const w = Math.max(0, S.w[i][k].get())
        if (w < 1e-4) continue
        layout(k, d, t)
        acc.x += t.x * w
        acc.z += t.z * w
        acc.ry += t.ry * w
        acc.s += t.s * w
        sum += w
        wmax = Math.max(wmax, w)
      }
      sum = sum || 1
      const x = acc.x / sum
      let z = acc.z / sum
      let ry = acc.ry / sum
      let s = acc.s / sum
      // mid-morph hop: cards lift off the floor while they travel between layouts
      const travel = clamp(1 - wmax / sum, 0, 1)
      st.hov[i] = THREE.MathUtils.damp(st.hov[i], S.hover === i && Math.abs(d) > 0.5 ? 1 : 0, 10, dt)
      const f = S.flip[i].get()
      ry += f * Math.PI
      z += Math.sin(f * Math.PI) * 0.6
      // staggered entrance (centre first)
      const k = smooth(0, 1, intro * 1.5 - Math.abs(d) * 0.06)
      s *= 0.82 + 0.18 * k
      const y = LIFT + travel * 0.9 + st.hov[i] * 0.12 - (1 - k) * 0.5
      g.position.set(x, y, z)
      g.rotation.y = ry
      g.scale.setScalar(Math.max(s, 1e-3))
      r.position.copy(g.position)
      r.rotation.y = ry
      r.scale.copy(g.scale)

      // depth falloff: darker + flatter further back
      const depth = clamp(-z / 7.2, 0, 1)
      const dim = (1 - depth * 0.42) * (0.55 + 0.45 * k)
      st.v.set(x, 1.1, z).project(camera)
      const sx = (st.v.x * 0.5 + 0.5) * width
      st.fade[i] = THREE.MathUtils.damp(st.fade[i], smooth(copyR + 140, copyR - 60, sx) * 0.72, 8, dt)
      const fk = st.fade[i]
      const cr = res.cards[i]
      cr.front.color.setScalar(dim * (1 - fk))
      cr.back.color.setScalar(dim * (1 - fk))
      cr.body.color.copy(cr.base).multiplyScalar(dim * (1 - fk))
      cr.front.emissive.copy(st.bg).multiplyScalar(fk)
      cr.back.emissive.copy(st.bg).multiplyScalar(fk)
      cr.body.emissive.copy(st.bg).multiplyScalar(fk)
      cr.shadow.opacity = (1 - travel) * (1 - depth * 0.6) * k * 0.9
      cr.rFront.uniforms.uDim.value = dim
      cr.rBack.uniforms.uDim.value = dim
      cr.rBody.uniforms.uDim.value = dim
      const ro = 0.3 * (1 - travel * 0.7) * k * (1 - fk)
      cr.rFront.uniforms.uOpacity.value = ro
      cr.rBack.uniforms.uOpacity.value = ro
      cr.rBody.uniforms.uOpacity.value = ro
    }

    // ---- DOM title under the centre card
    const el = titleEl.current
    if (el) {
      st.v.set(0, -0.86, 0.2).project(camera)
      const px = (st.v.x * 0.5 + 0.5) * width
      const py = (-st.v.y * 0.5 + 0.5) * height
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, 0)`
    }
  })

  const noRay = () => null

  return (
    <>
      <group ref={root} visible={false}>
        {/* soft floor patch catching the reflections */}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, -2]} renderOrder={-1} raycast={noRay}>
          <circleGeometry args={[9, 48]} />
          <meshBasicMaterial color="#dfe3ed" alphaMap={res.floorTex} transparent depthWrite={false} opacity={0.55} />
        </mesh>
        {res.cards.map((cr, i) => (
          <group
            key={i}
            ref={(g) => void (cards.current[i] = g)}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              if (e.delta > 6) return
              onPick(i)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              S.hover = i
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              if (S.hover === i) S.hover = -1
              document.body.style.cursor = ''
            }}
          >
            <mesh geometry={res.body} material={cr.body} />
            <mesh geometry={res.face} material={cr.front} position-z={FACE_Z} />
            <mesh geometry={res.face} material={cr.back} position-z={-FACE_Z} rotation-y={Math.PI} />
            <mesh geometry={res.shadowGeo} material={cr.shadow} position-y={-LIFT + 0.004} raycast={noRay} />
          </group>
        ))}
        {/* mirrored copies below the floor, faded by depth under it */}
        <group scale={[1, -1, 1]}>
          {res.cards.map((cr, i) => (
            <group key={i} ref={(g) => void (refl.current[i] = g)}>
              <mesh geometry={res.body} material={cr.rBody} raycast={noRay} />
              <mesh geometry={res.face} material={cr.rFront} position-z={FACE_Z} raycast={noRay} />
              <mesh geometry={res.face} material={cr.rBack} position-z={-FACE_Z} rotation-y={Math.PI} raycast={noRay} />
            </group>
          ))}
        </group>
      </group>
    </>
  )
}

function Lights() {
  // no IBL on purpose: PMREM compiles synchronously and costs ~300 ms on first load; a soft key + a glint light
  // that the turning cards sweep through give the slabs their sheen instead
  return (
    <>
      <hemisphereLight args={['#ffffff', '#dfe2ea', 2.1]} />
      <directionalLight position={[-4, 6, 6]} intensity={1.25} color="#fffaf2" />
      <directionalLight position={[3.5, 2.5, 9]} intensity={0.9} color="#ffffff" />
      <directionalLight position={[5, 3, -3]} intensity={0.5} color="#e3e9ff" />
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function CoverFlow() {
  const res = useResources()
  const [mode, setMode] = useState<Mode>(POSTER ? 'arc' : 'ring')
  const [active, setActive] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const titleEl = useRef<HTMLDivElement>(null)
  const S = useMemo<Shared>(
    () => ({
      p: motionValue(POSTER ? 0 : -2.4),
      w: Array.from({ length: N }, () => [0, 1, 2].map((k) => motionValue(k === MI[POSTER ? 'arc' : 'ring'] ? 1 : 0))),
      flip: Array.from({ length: N }, () => motionValue(0)),
      intro: motionValue(POSTER ? 1 : 0),
      hover: -1,
      lastUser: performance.now(),
      dragging: false,
    }),
    [],
  )
  const pAnim = useRef<AnimationPlaybackControls | null>(null)
  const readyRef = useRef(false)
  const modeRef = useRef(mode)
  modeRef.current = mode

  const user = () => (S.lastUser = performance.now())

  const snapTo = (target: number, velocity = 0) => {
    pAnim.current?.stop()
    pAnim.current = animate(S.p, target, { type: 'spring', stiffness: 150, damping: 24, mass: 1, velocity, restDelta: 0.0005 })
  }
  const unflipAll = () => {
    S.flip.forEach((f) => {
      if (f.get() > 0.001 || f.get() < -0.001) animate(f, 0, { type: 'spring', stiffness: 160, damping: 20 })
    })
    setFlipped(false)
  }
  const target = useRef(0)
  const go = (dir: number) => {
    target.current = Math.round(target.current) + dir
    snapTo(target.current)
  }
  const goToCard = (i: number) => {
    const cur = Math.round(S.p.get())
    target.current = cur + wrapD(i - mod(cur, N))
    snapTo(target.current)
  }
  const toggleFlip = () => {
    const i = mod(Math.round(S.p.get()), N)
    const f = S.flip[i]
    const to = f.get() > 0.5 ? 0 : 1
    animate(f, to, { type: 'spring', stiffness: 120, damping: 15 })
    setFlipped(to === 1)
  }

  // active card for the DOM caption; flipping resets when the centre changes
  useEffect(() => {
    let cur = 0
    return S.p.on('change', (v) => {
      const a = mod(Math.round(v), N)
      if (a === cur) return
      cur = a
      setActive(a)
      unflipAll()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S])

  const onReady = () => {
    readyRef.current = true
    if (POSTER) return
    animate(S.intro, 1, { duration: 1.4, ease: [0.23, 1, 0.32, 1] })
    target.current = 0
    snapTo(0)
  }

  // layout morph: each card rides its own spring, centre first
  const firstMode = useRef(true)
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false
      return
    }
    const p = S.p.get()
    const anims: AnimationPlaybackControls[] = []
    for (let i = 0; i < N; i++) {
      const rank = Math.abs(wrapD(i - p))
      for (let k = 0; k < 3; k++)
        anims.push(animate(S.w[i][k], k === MI[mode] ? 1 : 0, { type: 'spring', stiffness: 95, damping: 17, delay: rank * 0.05 }))
    }
    return () => anims.forEach((a) => a.stop())
  }, [mode, S])

  // idle auto-advance
  useEffect(() => {
    if (POSTER) return
    let last = 0
    const id = setInterval(() => {
      const now = performance.now()
      if (!readyRef.current || S.dragging || now - S.lastUser < 6000 || now - last < 3400) return
      if (S.flip.some((f) => f.get() > 0.5)) {
        unflipAll()
        last = now
        return
      }
      last = now
      go(1)
    }, 400)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (POSTER) return
      if (e.key === 'ArrowRight') {
        user()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        user()
        go(-1)
      } else if (e.key === 'Enter' || e.key === ' ') {
        user()
        toggleFlip()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // drag with inertia → spring snap to the nearest card
  const onDown = (e: React.PointerEvent) => {
    if (POSTER || e.button !== 0 || (e.target as HTMLElement).tagName !== 'CANVAS') return
    user()
    pAnim.current?.stop()
    const W = (e.currentTarget as HTMLElement).clientWidth
    const pxPer = clamp(W * (modeRef.current === 'ring' ? 0.16 : 0.13), 110, 230)
    const d = { x0: e.clientX, p0: S.p.get(), lx: e.clientX, lt: performance.now(), v: 0, moved: false }
    S.dragging = true
    const move = (ev: PointerEvent) => {
      const now = performance.now()
      if (Math.abs(ev.clientX - d.x0) > 5) d.moved = true
      const p = d.p0 - (ev.clientX - d.x0) / pxPer
      S.p.set(p)
      const dtt = Math.max(8, now - d.lt) / 1000
      const inst = -(ev.clientX - d.lx) / pxPer / dtt
      d.v = d.v * 0.4 + inst * 0.6
      d.lx = ev.clientX
      d.lt = now
      user()
      if (d.moved) document.body.style.cursor = 'grabbing'
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      S.dragging = false
      document.body.style.cursor = ''
      user()
      let v = performance.now() - d.lt > 90 ? 0 : clamp(d.v, -14, 14)
      if (!d.moved) v = 0
      const proj = S.p.get() + v * 0.3
      target.current = Math.round(proj)
      snapTo(target.current, v)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const wheel = useRef({ acc: 0, t: 0 as ReturnType<typeof setTimeout> | 0 })
  const onWheel = (e: React.WheelEvent) => {
    if (POSTER) return
    user()
    const dlt = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (Math.abs(dlt) >= 50 && e.deltaMode === 0 && Math.abs(e.deltaX) < 1) {
      // notched mouse wheel: one card per notch
      go(Math.sign(dlt))
      return
    }
    pAnim.current?.stop()
    S.p.set(S.p.get() + dlt / 220)
    const w = wheel.current
    if (w.t) clearTimeout(w.t)
    w.t = setTimeout(() => {
      target.current = Math.round(S.p.get())
      snapTo(target.current)
    }, 120)
  }

  const onPick = (i: number) => {
    user()
    if (i === mod(Math.round(S.p.get()), N) && Math.abs(S.p.get() - Math.round(S.p.get())) < 0.2) toggleFlip()
    else goToCard(i)
  }

  const prod = PRODUCTS[active]

  return (
    <div className="stage cfl-stage" onPointerDown={onDown} onWheel={onWheel}>
      <style>{`
        .cfl-stage { background: radial-gradient(120% 80% at 62% 18%, #fbfcfe 0%, ${BG} 52%, #e2e5ed 100%); touch-action: none; cursor: grab; }
        .cfl-stage .overlay { cursor: default; }
        .cfl-stage .scrim { --soft-bg: #f3f4f8; }
        .cfl-stage .hero-copy h1 em { color: #4c6fff; }
        @media (min-width: 761px) { .cfl-stage .hero-copy { width: min(400px, calc(100% - 48px)); } }
        .cfl-title { position: absolute; z-index: 2; left: 0; top: 0; width: 320px; height: 96px; pointer-events: none !important; will-change: transform; }
        .cfl-title::before { content: ''; position: absolute; left: -40px; right: -40px; top: -26px; bottom: -18px; background: radial-gradient(closest-side, rgba(238,240,245,0.92), rgba(238,240,245,0)); }
        .cfl-title > div { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
        .cfl-title .cfl-meta { font: 500 11px/1 var(--mono); letter-spacing: .1em; color: var(--fg-2); }
        .cfl-title .cfl-meta b { color: #4c6fff; font-weight: 600; }
        .cfl-title h2 { margin: 10px 0 0; font: 600 22px/1.1 var(--display); letter-spacing: -0.015em; color: var(--fg); white-space: nowrap; }
        .cfl-title p { margin: 8px 0 0; font: 500 14px/1 var(--sans); color: var(--fg-2); }
        .cfl-title p b { color: var(--fg); font-weight: 600; font-variant-numeric: tabular-nums; }
        .cfl-arrow { width: 34px; padding: 0; display: grid; place-items: center; }
        .cfl-arrow svg { display: block; }
        @media (max-width: 760px) {
          .cfl-stage .hero-copy { bottom: 84px; }
          .cfl-stage .hero-copy h1 { font-size: 26px; }
          .cfl-stage .hero-copy .kicker { margin-bottom: 10px; }
          .cfl-stage .hero-copy > p:not(.kicker) { display: none; }
          .cfl-stage .hero-actions { display: none; }
          .cfl-title h2 { font-size: 19px; margin-top: 8px; }
          .cfl-flipbtn { display: none; }
        }
      `}</style>
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 80, position: [0, 1.6, 11] }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}
      >
        <fog attach="fog" args={[BG, 13, 26]} />
        <Lights />
        <Carousel S={S} res={res} onPick={onPick} titleEl={titleEl} onReady={onReady} />
      </Canvas>

      <div className="overlay">
        <div className="cfl-title" ref={titleEl}>
          <AnimatePresence initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={{ duration: 0.36, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="cfl-meta">
                {String(active + 1).padStart(2, '0')} / {N} · <b>{prod.tag}</b>
              </span>
              <h2>{prod.name}</h2>
              <p>
                <b>{fmtPrice(prod.price)}</b> · {flipped ? '正在看参数' : '点卡片看参数'}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div className="hero-copy" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}>
          <div className="scrim" />
          <p className="kicker">
            <i /> Cover Flow · Spring snap
          </p>
          <h1>
            转一圈，
            <br />
            <em>挑中那一件</em>
          </h1>
          <p>拖动卡片环，松手带惯性滑行并吸附到最近一张；点正中的卡片翻面看参数，点两侧的卡片把它请到中间。</p>
        </motion.div>

        <div className="dock">
          <button className="seg cfl-arrow" aria-label="上一个" onClick={() => (user(), go(-1))}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <Seg
            items={MODES}
            value={mode}
            onChange={(v) => {
              user()
              setMode(v)
            }}
          />
          <button className="seg cfl-arrow" aria-label="下一个" onClick={() => (user(), go(1))}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="dock-sep cfl-flipbtn" />
          <button className="seg cfl-flipbtn" aria-pressed={flipped} onClick={() => (user(), toggleFlip())}>
            {flipped && <motion.span layoutId="cfl-flip" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>翻面</span>
          </button>
        </div>
        <p className="hint">拖拽 / 滚轮 / ← → 切换 · 点正中卡片翻面</p>
      </div>
    </div>
  )
}
