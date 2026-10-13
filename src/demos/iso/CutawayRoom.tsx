import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ room metrics */
const R = 2.5 // interior half-size
const T = 0.25 // wall thickness
const H = 3 // wall height
const WIN = { z0: -0.25, z1: 1.35, y0: 1.0, y1: 2.3 } // window hole in the left (x = -R) wall

/* ------------------------------------------------------------------ palette */
const C = {
  wall: '#f3e4d6',
  trim: '#c97b5a',
  skirting: '#e6cdb8',
  floorSide: '#c97b5a',
  floorSide2: '#a9614a',
  wood: '#e9d3b5',
  woodDark: '#b98a66',
  leg: '#4b4352',
  sage: '#86ada6',
  teal: '#9fbdb6',
  mustard: '#e8b04b',
  pot: '#c97b5a',
  leaf: '#5f9e6e',
  leaf2: '#7cb584',
  cat: '#ea9f68',
  catBelly: '#f8e0c8',
  rug: '#ead0b4',
  rug2: '#c97b5a',
  bezel: '#2c303b',
}
const BOOKS = ['#c97b5a', '#86ada6', '#e8c170', '#5b6b8c', '#f2e4d0', '#a8665a', '#7f9bb8', '#d9a07a']

const box = new THREE.BoxGeometry(1, 1, 1)
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
const M = {
  wall: std(C.wall),
  trim: std(C.trim),
  skirting: std(C.skirting),
  floorSide: std(C.floorSide),
  floorSide2: std(C.floorSide2),
  wood: std(C.wood),
  woodDark: std(C.woodDark),
  leg: std(C.leg, { roughness: 0.6 }),
  sage: std(C.sage),
  teal: std(C.teal),
  pot: std(C.pot),
  leaf: std(C.leaf, { flatShading: true, side: THREE.DoubleSide }),
  leaf2: std(C.leaf2, { flatShading: true, side: THREE.DoubleSide }),
  cat: std(C.cat),
  catBelly: std(C.catBelly),
  rug: std(C.rug),
  rug2: std(C.rug2),
  bezel: std(C.bezel, { roughness: 0.5 }),
  white: std('#fbf6ef'),
  frame: std('#fffaf2'),
  ghost: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  books: BOOKS.map((c) => std(c)),
}

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
const floorTex = tex(512, 512, (g) => {
  g.fillStyle = '#efd9bc'
  g.fillRect(0, 0, 512, 512)
  const rows = 9
  for (let r = 0; r < rows; r++) {
    const y = (r * 512) / rows
    const off = (r % 3) * 150
    g.fillStyle = r % 2 ? '#ebd3b3' : '#f1dcc0'
    g.fillRect(0, y, 512, 512 / rows)
    g.fillStyle = 'rgba(150,100,60,.22)'
    g.fillRect(0, y, 512, 2)
    for (let x = off % 230; x < 512; x += 230) g.fillRect(x, y, 2, 512 / rows)
  }
})
const artTex = tex(256, 320, (g) => {
  g.fillStyle = '#f6efe4'
  g.fillRect(0, 0, 256, 320)
  g.fillStyle = '#e8b04b'
  g.beginPath()
  g.arc(150, 120, 62, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#c97b5a'
  g.fillRect(40, 170, 120, 110)
  g.fillStyle = '#86ada6'
  g.beginPath()
  g.moveTo(110, 280)
  g.lineTo(220, 280)
  g.lineTo(220, 150)
  g.closePath()
  g.fill()
})

/* ------------------------------------------------------------------ time of day presets (0 day · 1 dusk · 2 night) */
type Preset = { amb: string; ambI: number; sky: string; ground: string; hemiI: number; sun: string; sunI: number; el: number; fill: string; fillI: number; beam: string; beamI: number; screen: number }
const PRESETS: Preset[] = [
  { amb: '#fff1e6', ambI: 0.66, sky: '#ffffff', ground: '#d9b9a0', hemiI: 0.48, sun: '#fff0d6', sunI: 6.4, el: 0.66, fill: '#ffeadf', fillI: 1.0, beam: '#fff1cc', beamI: 1, screen: 0.85 },
  { amb: '#ffd2bd', ambI: 0.55, sky: '#ffd6c0', ground: '#b0807a', hemiI: 0.4, sun: '#ff9858', sunI: 4.6, el: 0.36, fill: '#ffbea0', fillI: 0.6, beam: '#ffad6b', beamI: 1.15, screen: 1 },
  { amb: '#7d86c0', ambI: 0.42, sky: '#7684c0', ground: '#2b2d48', hemiI: 0.3, sun: '#a9bdff', sunI: 1.6, el: 0.9, fill: '#8b95d8', fillI: 0.25, beam: '#a8c0ff', beamI: 0.55, screen: 1.25 },
]
const _ca = new THREE.Color()
const _cb = new THREE.Color()
function mixColor(out: THREE.Color, key: 'amb' | 'sky' | 'ground' | 'sun' | 'fill' | 'beam', tod: number) {
  const i = Math.min(1, Math.floor(tod))
  const k = Math.min(1, tod - i)
  _ca.set(PRESETS[i][key])
  _cb.set(PRESETS[i + 1][key])
  return out.lerpColors(_ca, _cb, k)
}
function mixNum(key: 'ambI' | 'hemiI' | 'sunI' | 'el' | 'fillI' | 'beamI' | 'screen', tod: number) {
  const i = Math.min(1, Math.floor(tod))
  const k = Math.min(1, tod - i)
  return PRESETS[i][key] + (PRESETS[i + 1][key] - PRESETS[i][key]) * k
}

/* ------------------------------------------------------------------ helpers */
type V3 = [number, number, number]
function B({ p, s, m, cast = true, receive = true, rot }: { p: V3; s: V3; m: THREE.Material; cast?: boolean; receive?: boolean; rot?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={rot} castShadow={cast} receiveShadow={receive} />
}

function useClickable(onClick: () => void) {
  const hover = useSpring(0, { stiffness: 500, damping: 30 })
  return {
    hover,
    handlers: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        hover.set(1)
        document.body.style.cursor = 'pointer'
      },
      onPointerOut: () => {
        hover.set(0)
        document.body.style.cursor = ''
      },
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onClick()
      },
    },
  }
}

/* ------------------------------------------------------------------ shell */
function Shell() {
  const floorMat = useMemo(() => std('#ffffff', { map: floorTex }), [])
  const floorMats = useMemo(() => [M.floorSide, M.floorSide, floorMat, M.floorSide2, M.floorSide2, M.floorSide], [floorMat])
  const lx = -R - T / 2
  const bz = -R - T / 2
  const zMid = (WIN.z0 + WIN.z1) / 2
  const zw = WIN.z1 - WIN.z0
  return (
    <group>
      {/* floor slab */}
      <mesh geometry={box} material={floorMats} position={[-T / 2, -0.2, -T / 2]} scale={[2 * R + T, 0.4, 2 * R + T]} receiveShadow />
      {/* left wall, built around the window hole */}
      <B p={[lx, WIN.y0 / 2, -T / 2]} s={[T, WIN.y0, 2 * R + T]} m={M.wall} />
      <B p={[lx, (WIN.y1 + H) / 2, -T / 2]} s={[T, H - WIN.y1, 2 * R + T]} m={M.wall} />
      <B p={[lx, (WIN.y0 + WIN.y1) / 2, (-R - T + WIN.z0) / 2]} s={[T, WIN.y1 - WIN.y0, WIN.z0 + R + T]} m={M.wall} />
      <B p={[lx, (WIN.y0 + WIN.y1) / 2, (WIN.z1 + R) / 2]} s={[T, WIN.y1 - WIN.y0, R - WIN.z1]} m={M.wall} />
      {/* back wall */}
      <B p={[0, H / 2, bz]} s={[2 * R, H, T]} m={M.wall} />
      {/* cut edges + skirting */}
      <B p={[lx, H + 0.03, -T / 2]} s={[T + 0.02, 0.06, 2 * R + T + 0.02]} m={M.trim} cast={false} />
      <B p={[0, H + 0.03, bz]} s={[2 * R + 0.02, 0.06, T + 0.02]} m={M.trim} cast={false} />
      <B p={[-R + 0.02, 0.06, 0]} s={[0.04, 0.12, 2 * R]} m={M.skirting} cast={false} />
      <B p={[0, 0.06, -R + 0.02]} s={[2 * R, 0.12, 0.04]} m={M.skirting} cast={false} />
      {/* window frame, mullions, sill */}
      <group position={[-R, 0, zMid]}>
        <B p={[-0.02, WIN.y0 - 0.03, 0]} s={[0.3, 0.06, zw + 0.2]} m={M.frame} />
        <B p={[-0.08, WIN.y1, 0]} s={[0.12, 0.06, zw]} m={M.frame} />
        <B p={[-0.08, (WIN.y0 + WIN.y1) / 2, -zw / 2]} s={[0.12, WIN.y1 - WIN.y0, 0.06]} m={M.frame} />
        <B p={[-0.08, (WIN.y0 + WIN.y1) / 2, zw / 2]} s={[0.12, WIN.y1 - WIN.y0, 0.06]} m={M.frame} />
        <B p={[-0.12, (WIN.y0 + WIN.y1) / 2, 0]} s={[0.04, WIN.y1 - WIN.y0, 0.04]} m={M.frame} />
        <B p={[-0.12, (WIN.y0 + WIN.y1) / 2 + 0.1, 0]} s={[0.04, 0.04, zw]} m={M.frame} />
        {/* curtains */}
        <RoundedBox args={[0.1, 1.75, 0.34]} radius={0.04} smoothness={2} position={[0.07, 1.62, -zw / 2 - 0.2]} material={M.teal} castShadow receiveShadow />
        <RoundedBox args={[0.1, 1.75, 0.34]} radius={0.04} smoothness={2} position={[0.07, 1.62, zw / 2 + 0.2]} material={M.teal} castShadow receiveShadow />
        <mesh position={[0.1, 2.52, 0]} rotation={[Math.PI / 2, 0, 0]} material={M.leg}>
          <cylinderGeometry args={[0.018, 0.018, zw + 1.0, 8]} />
        </mesh>
      </group>
      <WindowSky />
      {/* invisible shadow casters: ceiling + the two cut-away walls, so sunlight only enters through the window */}
      <mesh geometry={box} material={M.ghost} position={[0, H + 0.08, 0]} scale={[2 * R + 2, 0.2, 2 * R + 2]} castShadow />
      <mesh geometry={box} material={M.ghost} position={[R + 0.1, H / 2, 0]} scale={[0.2, H + 0.6, 2 * R + 2]} castShadow />
      <mesh geometry={box} material={M.ghost} position={[0, H / 2, R + 0.1]} scale={[2 * R + 2, H + 0.6, 0.2]} castShadow />
      {/* wall art + clock on the back wall */}
      <group position={[-1.15, 1.85, -R + 0.03]}>
        <B p={[0, 0, 0]} s={[0.78, 0.96, 0.04]} m={M.frame} />
        <mesh position={[0, 0, 0.024]}>
          <planeGeometry args={[0.64, 0.8]} />
          <meshStandardMaterial map={artTex} roughness={0.9} />
        </mesh>
      </group>
      <Clock />
    </group>
  )
}

/* what you see through the window: a sky card that follows the time of day */
const skyTex = tex(64, 128, (g) => {
  const lg = g.createLinearGradient(0, 0, 0, 128)
  lg.addColorStop(0, '#ffffff')
  lg.addColorStop(1, '#bdbdbd')
  g.fillStyle = lg
  g.fillRect(0, 0, 64, 128)
})
const SKY = [new THREE.Color('#bfe0f0'), new THREE.Color('#ffb48a'), new THREE.Color('#2b3566')]
const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false })
const hillMat = new THREE.MeshBasicMaterial({ color: '#9cc39a', toneMapped: false })
function WindowSky() {
  return (
    <group position={[-R - T - 0.35, 0, (WIN.z0 + WIN.z1) / 2]}>
      <mesh material={skyMat} position={[0, (WIN.y0 + WIN.y1) / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[WIN.z1 - WIN.z0 + 0.6, WIN.y1 - WIN.y0 + 0.4]} />
      </mesh>
      <mesh material={hillMat} position={[0.02, WIN.y0 + 0.05, 0.15]} rotation={[0, Math.PI / 2, 0]} scale={[1.2, 0.35, 1]}>
        <circleGeometry args={[1, 32, 0, Math.PI]} />
      </mesh>
    </group>
  )
}

function Clock() {
  const h = useRef<THREE.Group>(null)
  const m = useRef<THREE.Group>(null)
  const s = useRef<THREE.Group>(null)
  useFrame(() => {
    const d = new Date()
    const sec = d.getSeconds() + d.getMilliseconds() / 1000
    const min = d.getMinutes() + sec / 60
    const hr = (d.getHours() % 12) + min / 60
    if (s.current) s.current.rotation.z = -(sec / 60) * Math.PI * 2
    if (m.current) m.current.rotation.z = -(min / 60) * Math.PI * 2
    if (h.current) h.current.rotation.z = -(hr / 12) * Math.PI * 2
  })
  return (
    <group position={[1.75, 2.2, -R + 0.03]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={M.trim} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.05, 40]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]} material={M.white}>
        <cylinderGeometry args={[0.27, 0.27, 0.03, 40]} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} geometry={box} material={M.leg} position={[Math.sin((i / 12) * Math.PI * 2) * 0.22, Math.cos((i / 12) * Math.PI * 2) * 0.22, 0.04]} scale={i % 3 ? [0.012, 0.012, 0.01] : [0.02, 0.04, 0.01]} rotation={[0, 0, -(i / 12) * Math.PI * 2]} />
      ))}
      <group ref={h} position={[0, 0, 0.045]}>
        <mesh geometry={box} material={M.leg} position={[0, 0.065, 0]} scale={[0.024, 0.13, 0.01]} />
      </group>
      <group ref={m} position={[0, 0, 0.05]}>
        <mesh geometry={box} material={M.leg} position={[0, 0.09, 0]} scale={[0.016, 0.19, 0.01]} />
      </group>
      <group ref={s} position={[0, 0, 0.055]}>
        <mesh geometry={box} material={M.trim} position={[0, 0.08, 0]} scale={[0.008, 0.2, 0.008]} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ sunlight: real shadow through the window + a soft beam with dust */
const beamVert = /* glsl */ `
  varying vec3 vL;
  varying vec3 vW;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uI;
  varying vec3 vL;
  varying vec3 vW;
  void main() {
    if (vW.y < 0.0 || vW.x > ${R.toFixed(2)} || vW.z > ${R.toFixed(2)}) discard;
    float along = pow(1.0 - clamp(vL.z, 0.0, 1.0), 1.4);
    float edge = smoothstep(0.0, 0.18, vL.x) * smoothstep(1.0, 0.82, vL.x) * smoothstep(0.0, 0.18, vL.y) * smoothstep(1.0, 0.82, vL.y);
    gl_FragColor = vec4(uColor * uI * along * (0.35 + 0.65 * edge) * 0.16, 1.0);
  }
`

function Sun({ tod }: { tod: MotionValue<number> }) {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff', 3)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -5
    cam.right = cam.top = 5
    cam.near = 0.5
    cam.far = 30
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.025
    l.shadow.radius = 3
    return l
  }, [])
  const beam = useRef<THREE.Mesh>(null)
  const dust = useRef<THREE.Points>(null)
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uColor: { value: new THREE.Color() }, uI: { value: 1 } },
        transparent: true,
        depthWrite: false,
        // add light to colour only — leave canvas alpha alone so the beam never darkens the page behind it
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        side: THREE.DoubleSide,
      }),
    [],
  )
  const unit = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5), [])
  const D = 50
  const dustData = useMemo(() => {
    const seed = new Float32Array(D * 3)
    for (let i = 0; i < D * 3; i++) seed[i] = Math.random()
    const pos = new Float32Array(D * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { seed, pos, g }
  }, [])
  const dustMat = useMemo(() => new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: '#fff6dc', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }), [])
  const toL = useMemo(() => new THREE.Vector3(), [])
  const a = useMemo(() => new THREE.Vector3(0, 0, WIN.z1 - WIN.z0), [])
  const b = useMemo(() => new THREE.Vector3(0, WIN.y1 - WIN.y0, 0), [])
  const c = useMemo(() => new THREE.Vector3(), [])
  const mat = useMemo(() => new THREE.Matrix4(), [])

  useFrame((st) => {
    const t = st.clock.elapsedTime
    const td = tod.get()
    const el = mixNum('el', td)
    const az = Math.sin(t * 0.22) * 0.32 - 0.12
    toL.set(-Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize()
    light.position.copy(toL).multiplyScalar(12)
    mixColor(light.color, 'sun', td)
    {
      const i = Math.min(1, Math.floor(td))
      skyMat.color.lerpColors(SKY[i], SKY[i + 1], Math.min(1, td - i))
      hillMat.color.copy(skyMat.color).multiplyScalar(0.55).lerp(_ca.set('#7fae86'), 0.5 * (1 - Math.min(1, td / 2)))
    }
    light.intensity = mixNum('sunI', td)
    // beam = window rectangle swept along the light's travel direction
    const L = WIN.y1 / Math.max(0.15, toL.y)
    c.copy(toL).multiplyScalar(-L)
    mat.makeBasis(a, b, c).setPosition(-R - 0.02, WIN.y0, WIN.z0)
    const bi = mixNum('beamI', td)
    if (beam.current) {
      beam.current.matrix.copy(mat)
      mixColor(beamMat.uniforms.uColor.value, 'beam', td)
      beamMat.uniforms.uI.value = bi
    }
    if (dust.current) {
      dust.current.matrix.copy(mat)
      const { seed, pos } = dustData
      for (let i = 0; i < D; i++) {
        const sx = seed[i * 3]
        const sy = seed[i * 3 + 1]
        const sz = seed[i * 3 + 2]
        pos[i * 3] = (sx + Math.sin(t * 0.13 + sy * 20) * 0.08 + 1) % 1
        pos[i * 3 + 1] = (sy + t * 0.012 * (0.5 + sz) + Math.sin(t * 0.2 + sx * 9) * 0.04 + 1) % 1
        pos[i * 3 + 2] = 0.05 + sz * 0.5
      }
      dustData.g.attributes.position.needsUpdate = true
      dustMat.color.copy(beamMat.uniforms.uColor.value)
      dustMat.opacity = 0.55 * bi
    }
  })
  return (
    <>
      <primitive object={light} />
      <mesh ref={beam} geometry={unit} material={beamMat} matrixAutoUpdate={false} renderOrder={5} frustumCulled={false} />
      <points ref={dust} geometry={dustData.g} material={dustMat} matrixAutoUpdate={false} frustumCulled={false} renderOrder={6} />
    </>
  )
}

function Ambient({ tod, lamp }: { tod: MotionValue<number>; lamp: MotionValue<number> }) {
  const amb = useRef<THREE.AmbientLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const fill = useRef<THREE.DirectionalLight>(null)
  useFrame(() => {
    const td = tod.get()
    const dim = 1 - lamp.get() * 0.18 * Math.min(1, td) // lamp pools read stronger as it gets dark
    if (amb.current) {
      mixColor(amb.current.color, 'amb', td)
      amb.current.intensity = mixNum('ambI', td) * dim
    }
    if (hemi.current) {
      mixColor(hemi.current.color, 'sky', td)
      mixColor(hemi.current.groundColor, 'ground', td)
      hemi.current.intensity = mixNum('hemiI', td) * dim
    }
    if (fill.current) {
      mixColor(fill.current.color, 'fill', td)
      fill.current.intensity = mixNum('fillI', td) * dim
    }
  })
  return (
    <>
      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />
      <directionalLight ref={fill} position={[6, 8, 9]} />
    </>
  )
}

/* ------------------------------------------------------------------ furniture */
function Bookshelf() {
  const books = useMemo(() => {
    const out: { p: V3; s: V3; m: THREE.Material; r: number }[] = []
    let k = 0
    for (let shelf = 0; shelf < 4; shelf++) {
      let z = -0.42
      const y = 0.08 + shelf * 0.48
      while (z < 0.36) {
        const w = 0.06 + ((k * 37) % 5) * 0.012
        const h = 0.26 + ((k * 53) % 7) * 0.022
        if ((k * 7) % 11 === 3 && z < 0.2) {
          z += 0.12 // gap
          k++
          continue
        }
        const lean = (k * 13) % 17 === 5 ? 0.22 : 0
        out.push({ p: [0.02, y + h / 2, z + w / 2], s: [0.24, h, w], m: M.books[k % M.books.length], r: lean })
        z += w + 0.008
        k++
      }
    }
    return out
  }, [])
  return (
    <group position={[-R + 0.2, 0, -1.65]}>
      <B p={[-0.17, 1.0, 0]} s={[0.04, 2.0, 1.0]} m={M.woodDark} />
      <B p={[0, 1.0, -0.48]} s={[0.36, 2.0, 0.04]} m={M.wood} />
      <B p={[0, 1.0, 0.48]} s={[0.36, 2.0, 0.04]} m={M.wood} />
      {[0, 1, 2, 3, 4].map((i) => (
        <B key={i} p={[0, 0.04 + i * 0.48, 0]} s={[0.36, 0.04, 0.96]} m={M.wood} />
      ))}
      {books.map((bk, i) => (
        <mesh key={i} geometry={box} material={bk.m} position={bk.p} scale={bk.s} rotation={[bk.r, 0, 0]} castShadow receiveShadow />
      ))}
      {/* tiny plant + globe on top */}
      <mesh position={[0, 2.12, -0.25]} material={M.pot} castShadow>
        <cylinderGeometry args={[0.08, 0.06, 0.14, 12]} />
      </mesh>
      <mesh position={[0, 2.26, -0.25]} material={M.leaf2} castShadow>
        <icosahedronGeometry args={[0.12, 0]} />
      </mesh>
      <mesh position={[0, 2.18, 0.22]} material={M.sage} castShadow>
        <sphereGeometry args={[0.12, 18, 12]} />
      </mesh>
    </group>
  )
}

function Desk() {
  return (
    <group position={[0.45, 0, -R + 0.42]}>
      <RoundedBox args={[1.9, 0.07, 0.8]} radius={0.025} smoothness={2} position={[0, 0.8, 0]} material={M.wood} castShadow receiveShadow />
      {[-0.88, 0.88].flatMap((x) => [-0.32, 0.32].map((z) => <B key={`${x}${z}`} p={[x, 0.39, z]} s={[0.05, 0.78, 0.05]} m={M.leg} />))}
      <B p={[0.55, 0.62, 0]} s={[0.6, 0.3, 0.72]} m={M.white} />
      <B p={[0.55, 0.62, 0.362]} s={[0.12, 0.03, 0.01]} m={M.leg} cast={false} />
      {/* keyboard, mouse, mug, notebook */}
      <RoundedBox args={[0.62, 0.025, 0.2]} radius={0.01} smoothness={2} position={[-0.08, 0.85, 0.15]} material={M.white} castShadow />
      <RoundedBox args={[0.07, 0.025, 0.1]} radius={0.012} smoothness={2} position={[0.34, 0.85, 0.17]} material={M.white} castShadow />
      <group position={[-0.68, 0.835, 0.2]}>
        <mesh material={M.trim} position={[0, 0.07, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.055, 0.14, 18]} />
        </mesh>
        <mesh material={M.trim} position={[0.07, 0.075, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.035, 0.012, 8, 16]} />
        </mesh>
        <Steam />
      </group>
      <RoundedBox args={[0.26, 0.03, 0.34]} radius={0.01} smoothness={2} position={[-0.62, 0.85, -0.12]} rotation={[0, 0.25, 0]} material={M.sage} castShadow />
    </group>
  )
}

function Steam() {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), [])
  const mats = useMemo(() => [0, 1, 2].map(() => mat.clone()), [mat])
  useFrame((s) => {
    const t = s.clock.elapsedTime
    refs.current.forEach((m, i) => {
      if (!m) return
      const k = (t * 0.45 + i / 3) % 1
      m.position.set(Math.sin(t * 2 + i * 2) * 0.02, 0.18 + k * 0.32, 0)
      m.scale.setScalar(0.02 + k * 0.035)
      mats[i].opacity = Math.sin(k * Math.PI) * 0.55
    })
  })
  return (
    <>
      {mats.map((m, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)} material={m}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      ))}
    </>
  )
}

/* monitor with an animated canvas screen: a code editor that types itself, or a live chart */
function Monitor({ tod, screenMode, onToggle }: { tod: MotionValue<number>; screenMode: 'code' | 'chart'; onToggle: () => void }) {
  const W = 384
  const Hh = 232
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = Hh
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { canvas, texture }
  }, [])
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture])
  const acc = useRef(0)
  const { hover, handlers } = useClickable(onToggle)
  const grp = useRef<THREE.Group>(null)
  const switchT = useRef(-10)
  const lastMode = useRef(screenMode)

  const lines = useMemo(() => {
    const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b', '#eeffff']
    return Array.from({ length: 40 }, (_, i) => {
      const indent = [0, 1, 1, 2, 2, 1, 0, 1, 2, 3, 2, 1][i % 12]
      const toks: [number, string][] = []
      const n = 1 + ((i * 7) % 4)
      for (let k = 0; k < n; k++) toks.push([18 + ((i * 13 + k * 29) % 46), cols[(i + k * 3) % cols.length]])
      return { indent, toks }
    })
  }, [])

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime
    if (lastMode.current !== screenMode) {
      lastMode.current = screenMode
      switchT.current = t
    }
    if (grp.current) grp.current.scale.setScalar(1 + hover.get() * 0.03)
    acc.current += dt
    if (acc.current < 1 / 15) return
    acc.current = 0
    const g = canvas.getContext('2d')!
    const glow = mixNum('screen', tod.get())
    g.fillStyle = '#1e2230'
    g.fillRect(0, 0, W, Hh)
    // title bar
    g.fillStyle = '#272c3d'
    g.fillRect(0, 0, W, 20)
    ;['#ff6b5a', '#ffbf47', '#3fc66b'].forEach((c, i) => {
      g.fillStyle = c
      g.beginPath()
      g.arc(12 + i * 13, 10, 4, 0, Math.PI * 2)
      g.fill()
    })
    if (screenMode === 'code') {
      g.fillStyle = '#232838'
      g.fillRect(0, 20, 34, Hh - 20)
      const typed = (t * 9) % 260
      const scroll = Math.max(0, Math.floor(typed / 20) - 9)
      for (let r = 0; r < 11; r++) {
        const li = (r + scroll) % lines.length
        const L = lines[li]
        const y = 30 + r * 18
        g.fillStyle = '#4b526b'
        g.fillRect(12, y + 3, 12, 5)
        let x = 44 + L.indent * 16
        const lineStart = (r + scroll) * 20
        const visible = typed - lineStart
        if (visible <= 0) continue
        let used = 0
        for (const [w, c] of L.toks) {
          const ww = Math.min(w, Math.max(0, visible * 6 - used))
          if (ww <= 0) break
          g.fillStyle = c
          g.globalAlpha = 0.9
          g.fillRect(x, y, ww, 9)
          x += w + 7
          used += w + 7
        }
        g.globalAlpha = 1
        if (visible < 20 && Math.sin(t * 9) > 0) {
          g.fillStyle = '#ffffff'
          g.fillRect(Math.min(x, 44 + L.indent * 16 + visible * 6) + 2, y - 2, 2, 13)
        }
      }
    } else {
      g.fillStyle = '#e8eefc'
      g.font = '600 13px system-ui, sans-serif'
      g.fillText('Weekly visitors', 16, 42)
      g.fillStyle = '#8fd3b5'
      g.font = '600 22px system-ui, sans-serif'
      g.fillText((12840 + Math.floor(t * 7) % 400).toLocaleString(), 16, 70)
      const n = 12
      for (let i = 0; i < n; i++) {
        const v = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(i * 0.9 + t * 1.3)) * (0.6 + 0.4 * Math.sin(i * 2.1))
        const bh = v * 120
        g.fillStyle = i === n - 1 ? '#ffbf47' : '#5b8cff'
        g.globalAlpha = i === n - 1 ? 1 : 0.85
        g.fillRect(18 + i * 29, 214 - bh, 18, bh)
      }
      g.globalAlpha = 1
      g.strokeStyle = '#ff7a8a'
      g.lineWidth = 2.5
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const y = 150 - 40 * Math.sin(i * 0.6 + t * 0.9) - i * 3
        const x = 27 + i * 29
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
    }
    // switch flash
    const sf = Math.max(0, 1 - (t - switchT.current) * 3)
    if (sf > 0) {
      g.fillStyle = `rgba(255,255,255,${sf * 0.8})`
      g.fillRect(0, 0, W, Hh)
    }
    texture.needsUpdate = true
    screenMat.color.setScalar(glow)
  })

  return (
    <group position={[0.4, 0.835, -R + 0.24]} {...handlers}>
      <group ref={grp}>
        <B p={[0, 0.015, 0]} s={[0.3, 0.03, 0.2]} m={M.bezel} />
        <B p={[0, 0.2, -0.02]} s={[0.06, 0.36, 0.04]} m={M.bezel} />
        <RoundedBox args={[0.98, 0.6, 0.05]} radius={0.02} smoothness={2} position={[0, 0.52, 0]} material={M.bezel} castShadow />
        <mesh position={[0, 0.53, 0.027]} material={screenMat}>
          <planeGeometry args={[0.92, 0.555]} />
        </mesh>
      </group>
    </group>
  )
}

function Lamp({ lamp, onToggle }: { lamp: MotionValue<number>; onToggle: () => void }) {
  const head = useRef<THREE.Group>(null)
  const nod = useMotionValue(0)
  const shade = useMemo(() => std(C.mustard, { emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0 }), [])
  const bulb = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false }), [])
  const pt = useRef<THREE.PointLight>(null)
  const pool = useRef<THREE.Mesh>(null)
  const poolMat = useMemo(() => {
    const t = tex(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      r.addColorStop(0, 'rgba(255,255,255,1)')
      r.addColorStop(0.5, 'rgba(255,255,255,.35)')
      r.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 128, 128)
    })
    return new THREE.MeshBasicMaterial({ map: t, color: '#ffc879', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
  }, [])
  const { hover, handlers } = useClickable(() => {
    onToggle()
    animate(nod, [0, 0.32, -0.1, 0], { duration: 0.7, ease: 'easeOut' })
  })
  const grp = useRef<THREE.Group>(null)
  const spotObj = useMemo(() => {
    const l = new THREE.SpotLight('#ffc27a', 0, 4, 0.75, 0.7, 1.6)
    l.position.set(0, 0.75, 0.42)
    l.target.position.set(-0.4, -1, 0.75)
    return l
  }, [])

  useFrame(() => {
    const on = lamp.get()
    if (head.current) head.current.rotation.x = -0.75 + nod.get()
    shade.emissiveIntensity = on * 0.9
    bulb.color.setRGB(1, 0.95, 0.84).multiplyScalar(0.25 + on * 2.2)
    spotObj.intensity = on * 9
    if (pt.current) pt.current.intensity = on * 2.6
    poolMat.opacity = on * 0.55
    if (grp.current) grp.current.scale.setScalar(1 + hover.get() * 0.06)
    if (pool.current) pool.current.visible = on > 0.01
  })

  return (
    <group position={[1.18, 0.835, -R + 0.3]} {...handlers}>
      {/* generous invisible hit area — the arm is thin */}
      <mesh geometry={box} position={[0, 0.42, 0.12]} scale={[0.5, 0.9, 0.55]} visible={false} />
      <group ref={grp}>
        <mesh material={M.leg} position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry args={[0.12, 0.13, 0.04, 20]} />
        </mesh>
        <group position={[0, 0.04, 0]} rotation={[0.35, 0, 0]}>
          <mesh material={M.leg} position={[0, 0.25, 0]} castShadow>
            <cylinderGeometry args={[0.015, 0.015, 0.5, 8]} />
          </mesh>
          <group position={[0, 0.5, 0]} rotation={[-0.9, 0, 0]}>
            <mesh material={M.leg} position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
            </mesh>
            <group ref={head} position={[0, 0.4, 0]}>
              <mesh material={shade} position={[0, -0.07, 0]} castShadow>
                <coneGeometry args={[0.14, 0.2, 24, 1, true]} />
              </mesh>
              <mesh material={shade} position={[0, 0.03, 0]}>
                <sphereGeometry args={[0.05, 12, 8]} />
              </mesh>
              <mesh material={bulb} position={[0, -0.13, 0]}>
                <sphereGeometry args={[0.05, 12, 8]} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
      <primitive object={spotObj} />
      <primitive object={spotObj.target} />
      <pointLight ref={pt} position={[0, 0.7, 0.45]} distance={4.5} decay={1.4} color="#ffb76b" />
      <mesh ref={pool} material={poolMat} position={[-0.5, 0.012, 0.6]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, 1.6, 1]} />
    </group>
  )
}

function Chair() {
  const ref = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = 0.18 + Math.sin(s.clock.elapsedTime * 0.5) * 0.12
  })
  return (
    <group position={[0.35, 0, -1.25]}>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} geometry={box} material={M.leg} position={[Math.cos((i / 5) * Math.PI * 2) * 0.17, 0.04, Math.sin((i / 5) * Math.PI * 2) * 0.17]} rotation={[0, -(i / 5) * Math.PI * 2, 0]} scale={[0.34, 0.03, 0.04]} castShadow />
      ))}
      <mesh material={M.leg} position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.4, 8]} />
      </mesh>
      <group ref={ref}>
        <RoundedBox args={[0.52, 0.09, 0.5]} radius={0.04} smoothness={2} position={[0, 0.49, 0]} material={M.sage} castShadow receiveShadow />
        <RoundedBox args={[0.5, 0.56, 0.08]} radius={0.04} smoothness={2} position={[0, 0.84, 0.25]} rotation={[-0.1, 0, 0]} material={M.sage} castShadow receiveShadow />
        <B p={[0, 0.6, 0.27]} s={[0.05, 0.2, 0.03]} m={M.leg} />
      </group>
    </group>
  )
}

function Rug() {
  return (
    <group position={[0.15, 0, 0.55]}>
      <mesh material={M.rug} position={[0, 0.01, 0]} receiveShadow>
        <cylinderGeometry args={[1.35, 1.35, 0.02, 48]} />
      </mesh>
      <mesh material={M.rug2} position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[1.05, 1.15, 48]} />
      </mesh>
      <mesh material={M.rug2} position={[0, 0.022, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[0.5, 0.55, 48]} />
      </mesh>
    </group>
  )
}

/* plant: leaves sway on their own; a click shakes them */
function Plant() {
  const leaves = useRef<(THREE.Group | null)[]>([])
  const shake = useMotionValue(0)
  const { hover, handlers } = useClickable(() => {
    animate(shake, [1, 0], { duration: 1.6, ease: 'easeOut' })
  })
  const grp = useRef<THREE.Group>(null)
  const defs = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        yaw: (i / 9) * Math.PI * 2 + (i % 2) * 0.3,
        tilt: 0.45 + (i % 3) * 0.22,
        len: 0.55 + (i % 4) * 0.1,
        h: 0.45 + (i % 3) * 0.12,
        m: i % 2 ? M.leaf : M.leaf2,
      })),
    [],
  )
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const sh = shake.get()
    leaves.current.forEach((l, i) => {
      if (!l) return
      const d = defs[i]
      l.rotation.set(d.tilt + Math.sin(t * 1.4 + i * 1.7) * 0.06 + Math.sin(t * 18 + i) * sh * 0.25, d.yaw + Math.sin(t * 0.9 + i) * 0.05, 0, 'YXZ')
    })
    if (grp.current) grp.current.scale.setScalar(1 + hover.get() * 0.04)
  })
  return (
    <group position={[-1.85, 0, 1.9]} {...handlers}>
      <group ref={grp}>
        <mesh material={M.pot} position={[0, 0.25, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.22, 0.5, 20]} />
        </mesh>
        <mesh material={M.leg} position={[0, 0.49, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.02, 20]} />
        </mesh>
        {defs.map((d, i) => (
          <group key={i} ref={(el) => void (leaves.current[i] = el)} position={[0, d.h, 0]}>
            <mesh material={M.leg} position={[0, d.len * 0.4, 0]}>
              <cylinderGeometry args={[0.008, 0.01, d.len * 0.8, 5]} />
            </mesh>
            <mesh material={d.m} position={[0, d.len, 0]} scale={[0.17, 0.3 * (d.len / 0.6), 0.03]} castShadow>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

/* cat: breathes while asleep in the sun; click to wake it (head lifts, tail flicks, says hi) */
function Cat({ awake, onPoke }: { awake: MotionValue<number>; onPoke: () => void }) {
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const ears = useRef<(THREE.Mesh | null)[]>([])
  const { hover, handlers } = useClickable(onPoke)
  const root = useRef<THREE.Group>(null)
  useFrame((s) => {
    const t = s.clock.elapsedTime
    const a = awake.get()
    if (body.current) body.current.scale.set(1, 1 + Math.sin(t * 1.8) * 0.04 * (1 - a), 1)
    if (head.current) {
      head.current.position.set(0.27, 0.13 + a * 0.12, 0.05 - a * 0.02)
      head.current.rotation.set(0, -0.3 + a * 0.5, -0.35 * (1 - a) + Math.sin(t * 3) * 0.05 * a)
    }
    if (tail.current) tail.current.rotation.y = 0.3 + Math.sin(t * (a > 0.5 ? 7 : 0.8)) * (0.12 + a * 0.35)
    ears.current.forEach((e, i) => e && (e.rotation.z = (i ? -0.25 : 0.25) + Math.sin(t * 13 + i) * 0.15 * a))
    if (root.current) root.current.position.y = hover.get() * 0.03
  })
  return (
    <group position={[-0.55, 0.02, 0.85]} rotation={[0, 0.5, 0]} {...handlers}>
      <group ref={root}>
        <group ref={body}>
          <mesh material={M.cat} position={[0, 0.12, 0]} scale={[0.34, 0.15, 0.22]} castShadow receiveShadow>
            <sphereGeometry args={[1, 24, 16]} />
          </mesh>
          <mesh material={M.catBelly} position={[0.06, 0.06, 0.1]} scale={[0.22, 0.08, 0.12]}>
            <sphereGeometry args={[1, 18, 12]} />
          </mesh>
          {/* stripes */}
          {[-0.12, 0, 0.12].map((x) => (
            <mesh key={x} material={M.trim} position={[x, 0.24, -0.02]} scale={[0.035, 0.035, 0.16]}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          ))}
        </group>
        <group ref={head}>
          <mesh material={M.cat} scale={[0.13, 0.115, 0.13]} castShadow>
            <sphereGeometry args={[1, 20, 14]} />
          </mesh>
          <mesh material={M.catBelly} position={[0.08, -0.03, 0.04]} scale={[0.06, 0.05, 0.07]}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
          {[-1, 1].map((sd, i) => (
            <mesh key={sd} ref={(el) => void (ears.current[i] = el)} material={M.cat} position={[0.01, 0.1, sd * 0.07]} castShadow>
              <coneGeometry args={[0.045, 0.09, 4]} />
            </mesh>
          ))}
          {[-1, 1].map((sd) => (
            <mesh key={sd} material={M.leg} position={[0.115, 0.02, sd * 0.045]} scale={[0.01, 0.012, 0.018]}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          ))}
        </group>
        <group ref={tail} position={[-0.3, 0.06, 0]}>
          <mesh material={M.cat} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0.2]} castShadow>
            <torusGeometry args={[0.2, 0.035, 8, 20, Math.PI * 0.9]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** pins DOM elements to world points */
function Pins({ items }: { items: { el: React.RefObject<HTMLElement | null>; at: V3 }[] }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    for (const it of items) {
      const e = it.el.current
      if (!e) continue
      v.set(it.at[0], it.at[1], it.at[2]).project(camera)
      e.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
    }
  })
  return null
}

/* ------------------------------------------------------------------ page */
type Tod = 'day' | 'dusk' | 'night'
const TOD_V: Record<Tod, number> = { day: 0, dusk: 1, night: 2 }
const ORDER: Tod[] = ['day', 'dusk', 'night']

export default function CutawayRoom() {
  const tod = useMotionValue(0)
  const lamp = useSpring(0, { stiffness: 170, damping: 16 })
  const awake = useSpring(0, { stiffness: 220, damping: 14 })
  const [mode, setMode] = useState<Tod>('day')
  const [lampOn, setLampOn] = useState(false)
  const [screenMode, setScreenMode] = useState<'code' | 'chart'>('code')
  const [meow, setMeow] = useState(0)
  const auto = useRef(true)
  const lampManual = useRef(false)
  const catEl = useRef<HTMLDivElement>(null)
  const meowTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const ctl = animate(tod, TOD_V[mode], { duration: 2.4, ease: [0.45, 0, 0.25, 1] })
    if (!lampManual.current) setLampOn(mode !== 'day')
    return () => ctl.stop()
  }, [mode, tod])

  useEffect(() => lamp.set(lampOn ? 1 : 0), [lampOn, lamp])

  // ambient loop: day → dusk → night → day, monitor flips between editor and dashboard
  useEffect(() => {
    const id = setInterval(() => {
      if (!auto.current) return
      lampManual.current = false
      setMode((m) => ORDER[(ORDER.indexOf(m) + 1) % 3])
    }, 7000)
    const scr = setInterval(() => setScreenMode((s) => (s === 'code' ? 'chart' : 'code')), 11000)
    return () => {
      clearInterval(id)
      clearInterval(scr)
    }
  }, [])

  const pokeCat = () => {
    awake.set(1)
    setMeow((n) => n + 1)
    clearTimeout(meowTimer.current)
    meowTimer.current = setTimeout(() => {
      awake.set(0)
      setMeow(0)
    }, 2600)
  }
  const toggleLamp = () => {
    lampManual.current = true
    setLampOn((v) => !v)
  }

  const isNight = mode === 'night'
  const dayO = useTransform(tod, [0, 1], [1, 0])
  const duskO = useTransform(tod, [0, 1, 2], [0, 1, 0])
  const nightO = useTransform(tod, [1, 2], [0, 1])
  const pins = useMemo(() => [{ el: catEl, at: [-0.4, 0.55, 0.95] as V3 }], [])

  return (
    <div className={`stage cr-root${isNight ? ' cr-night' : mode === 'dusk' ? ' cr-dusk' : ''}`} style={{ background: '#f4ece6' }}>
      <motion.div aria-hidden className="cr-bg" style={{ opacity: dayO, background: 'linear-gradient(180deg, #f8f1ea 0%, #f4e6da 60%, #efd9ca 100%)' }} />
      <motion.div aria-hidden className="cr-bg" style={{ opacity: duskO, background: 'linear-gradient(180deg, #f6d7c3 0%, #eab7a6 55%, #c99aa8 100%)' }} />
      <motion.div aria-hidden className="cr-bg" style={{ opacity: nightO, background: 'linear-gradient(180deg, #232640 0%, #2b2e4d 55%, #3a3a5e 100%)' }} />

      <Canvas orthographic shadows dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: true }}>
        <IsoRig fit={12.6} mobileFit={9.8} mobileOffsetY={0.2} offset={[0.19, 0.0]} target={[0, 1.15, 0]} />
        <Ambient tod={tod} lamp={lamp} />
        <Sun tod={tod} />
        <Shell />
        <Rug />
        <Bookshelf />
        <Desk />
        <Monitor tod={tod} screenMode={screenMode} onToggle={() => setScreenMode((s) => (s === 'code' ? 'chart' : 'code'))} />
        <Lamp lamp={lamp} onToggle={toggleLamp} />
        <Chair />
        <Plant />
        <Cat awake={awake} onPoke={pokeCat} />
        <Pins items={pins} />
      </Canvas>

      <div ref={catEl} className="cr-pin" aria-live="polite">
        <AnimatePresence mode="popLayout">
          {meow > 0 ? (
            <motion.div
              key={`m${meow}`}
              className="cr-bubble"
              initial={{ opacity: 0, y: 10, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            >
              {meow > 2 ? '喵！！' : meow > 1 ? '喵～喵' : '喵～'}
            </motion.div>
          ) : (
            <motion.div key="z" className="cr-z" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span>z</span>
              <span>z</span>
              <span>z</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#c97b5a' }} /> Isometric · Diorama
          </p>
          <h1>
            把房间
            <br />
            切开来看
          </h1>
          <p>拆掉朝向你的两面墙，阳光穿过窗户在地板上慢慢挪动。点台灯开关灯，点显示器切换屏幕，点一下打盹的猫。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={toggleLamp}>
              {lampOn ? '关掉台灯' : '打开台灯'}
            </button>
            <button className="btn" onClick={pokeCat}>
              叫醒猫咪
            </button>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'day', label: '白天' },
              { value: 'dusk', label: '黄昏' },
              { value: 'night', label: '夜晚' },
            ]}
            value={mode}
            onChange={(v) => {
              auto.current = false
              lampManual.current = false
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg" aria-pressed={lampOn} onClick={toggleLamp}>
            {lampOn && <motion.span layoutId="cr-lamp" className="seg-bg" />}
            <span>台灯</span>
          </button>
        </div>
        <p className="hint">点台灯 · 显示器 · 猫 · 植物</p>
      </div>

      <style>{`
        .cr-root { --soft-bg: #f6ede5; }
        .cr-bg { position: absolute; inset: 0; pointer-events: none; }
        .cr-root .hero-copy h1, .cr-root .hero-copy > p, .cr-root .hint { transition: color .8s ease; }
        .cr-dusk { --soft-bg: #f1d0c1; }
        .cr-night { --fg: #f6f1e6; --fg-2: rgba(246,241,230,.68); --glass: rgba(34,36,64,.55); --glass-line: rgba(255,255,255,.1); --soft-bg: #262942; }
        .cr-night .btn.primary { color: #262942; }
        .cr-pin { position: absolute; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 1; }
        .cr-bubble { position: absolute; left: 0; bottom: 6px; translate: -50% 0; padding: 7px 12px; border-radius: 14px 14px 14px 4px;
          background: #fff; color: #3a2f2a; font: 600 14px/1 var(--sans); white-space: nowrap; transform-origin: 0% 100%;
          box-shadow: 0 10px 24px -10px rgba(80,40,20,.45); }
        .cr-z { position: absolute; left: 0; bottom: 0; width: 40px; height: 50px; font: italic 600 13px/1 var(--display); color: #a8836c; }
        .cr-night .cr-z { color: #c9cdf0; }
        .cr-z span { position: absolute; left: 0; bottom: 0; opacity: 0; animation: cr-z 3s ease-in infinite; }
        .cr-z span:nth-child(2) { animation-delay: 1s; font-size: 16px; }
        .cr-z span:nth-child(3) { animation-delay: 2s; font-size: 19px; }
        @keyframes cr-z { 0% { opacity: 0; transform: translate(0, 0); } 20% { opacity: .9; } 100% { opacity: 0; transform: translate(22px, -42px); } }
        @media (prefers-reduced-motion: reduce) { .cr-z span { animation: none; opacity: .7; } }
      `}</style>
    </div>
  )
}
