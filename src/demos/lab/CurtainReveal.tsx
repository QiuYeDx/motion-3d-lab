import { Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { AnimatePresence, animate, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { CH, CN, CSIZE, FLOOR, makeCurtain, PED, SPK, type Curtain } from './curtainSim'

/* ------------------------------------------------------------------ look */

const BG = '#141218'
const GOLD = '#c9a45c'
const FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'

type Tint = 'wine' | 'green' | 'navy'
const TINTS: Record<Tint, { base: string; deep: string; label: string }> = {
  wine: { base: '#7a1830', deep: '#3e0a18', label: '酒红' },
  green: { base: '#145244', deep: '#06261f', label: '墨绿' },
  navy: { base: '#22336b', deep: '#0c1430', label: '午夜蓝' },
}

type Phase = 'drop' | 'covered' | 'reveal' | 'revealed'

type Ctl = {
  phase: Phase
  t: number // seconds in phase (sim clock)
  lastUser: number
  req: null | 'reveal' | 'cover'
  flare: MotionValue<number> // spotlight flare 0..1
  glow: MotionValue<number> // product light ring 0..1
  spin: MotionValue<number> // product turn speed rad/s
  px: number
  py: number
  firstCover: boolean
}

/* ------------------------------------------------------------------ textures */

function velvetTexture(t: Tint) {
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x = c.getContext('2d')!
  const { base, deep } = TINTS[t]
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.72)
  g.addColorStop(0, base)
  g.addColorStop(1, deep)
  x.fillStyle = g
  x.fillRect(0, 0, S, S)
  // pile: fine noise
  const img = x.getImageData(0, 0, S, S)
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < img.data.length; i += 4) {
    const k = (rnd() - 0.5) * 14
    img.data[i] += k
    img.data[i + 1] += k
    img.data[i + 2] += k
  }
  x.putImageData(img, 0, 0)
  // gold trim: a wide band and a thin inner line
  const gold = x.createLinearGradient(0, 0, S, S)
  gold.addColorStop(0, '#f1d9a0')
  gold.addColorStop(0.5, GOLD)
  gold.addColorStop(1, '#e6c27e')
  x.strokeStyle = gold
  x.lineWidth = 20
  x.strokeRect(26, 26, S - 52, S - 52)
  x.lineWidth = 3
  x.strokeRect(62, 62, S - 124, S - 124)
  // tassel dots along the hem
  x.fillStyle = gold
  for (let k = 0; k <= 24; k++) {
    const p = 26 + ((S - 52) * k) / 24
    for (const [cx, cy] of [[p, 8], [p, S - 8], [8, p], [S - 8, p]]) {
      x.beginPath()
      x.arc(cx, cy, 6, 0, Math.PI * 2)
      x.fill()
    }
  }
  // embroidered seal in the middle (lands on top of the product)
  x.save()
  x.translate(S / 2, S / 2)
  x.strokeStyle = gold
  x.lineWidth = 4
  x.beginPath()
  x.arc(0, 0, 92, 0, Math.PI * 2)
  x.stroke()
  x.lineWidth = 2
  x.beginPath()
  x.arc(0, 0, 80, 0, Math.PI * 2)
  x.stroke()
  x.fillStyle = gold
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.font = `700 92px ${FONT}`
  x.fillText('A', 0, 4)
  x.restore()
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function knitTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const x = c.getContext('2d')!
  x.fillStyle = '#808080'
  x.fillRect(0, 0, 64, 256)
  for (let y = 0; y < 256; y += 4) {
    const g = x.createLinearGradient(0, y, 0, y + 4)
    g.addColorStop(0, '#5a5a5a')
    g.addColorStop(0.5, '#c8c8c8')
    g.addColorStop(1, '#5a5a5a')
    x.fillStyle = g
    x.fillRect(0, y, 64, 4)
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(24, 1)
  return t
}

/* ------------------------------------------------------------------ cloth */

const X_GONE = 7.5

function Cloth({ ctl, sim, tint, onPhase }: { ctl: React.RefObject<Ctl>; sim: Curtain; tint: Tint; onPhase: (p: Phase) => void }) {
  const mesh = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(CSIZE, CSIZE, CN - 1, CN - 1)
    const p = g.attributes.position as THREE.BufferAttribute
    p.setUsage(THREE.DynamicDrawUsage)
    p.array.set(sim.pos)
    g.computeVertexNormals()
    return g
  }, [sim])
  const texs = useMemo(() => ({} as Partial<Record<Tint, THREE.Texture>>), [])
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        side: THREE.DoubleSide,
        roughness: 0.82,
        sheen: 1,
        sheenRoughness: 0.32,
        sheenColor: new THREE.Color('#f3cf8e'),
        envMapIntensity: 0.6,
      }),
    [],
  )
  useEffect(() => {
    texs[tint] ??= velvetTexture(tint)
    mat.map = texs[tint]!
    mat.needsUpdate = true
  }, [tint, mat, texs])

  const st = useMemo(() => ({ acc: 0, env: { draft: 0.6, gust: 0, gustT: 0, collide: true } }), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const m = mesh.current!
    if (c.phase === 'revealed') {
      m.visible = false
      return
    }
    m.visible = true
    st.acc += dt
    let n = 0
    while (st.acc >= CH && n < 4) {
      const e = st.env
      e.collide = true
      if (c.phase === 'reveal') {
        e.gust = Math.min(1, c.t / 0.85)
        e.gustT = c.t
        e.draft = 0
      } else {
        e.gust = 0
        e.gustT = 0
        e.draft = c.phase === 'drop' ? 0.25 : 0.7
      }
      sim.step(e)
      st.acc -= CH
      c.t += CH
      n++
    }
    if (n === 4) st.acc = 0
    if (c.phase === 'reveal') {
      // gone once every particle has left the stage (or after a safety timeout)
      let minX = Infinity
      for (let i = 0; i < sim.N; i += 7) minX = Math.min(minX, sim.pos[i * 3])
      if (minX > X_GONE || c.t > 5) {
        c.phase = 'revealed'
        c.t = 0
        onPhase('revealed')
      }
    } else if (c.phase === 'drop' && c.t > 3.4) {
      c.phase = 'covered'
      c.t = 0
      onPhase('covered')
    }
    const p = geo.attributes.position as THREE.BufferAttribute
    ;(p.array as Float32Array).set(sim.pos)
    p.needsUpdate = true
    geo.computeVertexNormals()
  })

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (POSTER) return
    const c = ctl.current!
    if (c.phase !== 'covered' && c.phase !== 'drop') return
    e.stopPropagation()
    c.lastUser = performance.now()
    c.req = 'reveal'
  }

  return (
    <mesh
      ref={mesh}
      geometry={geo}
      material={mat}
      castShadow
      receiveShadow
      frustumCulled={false}
      onPointerDown={onDown}
      onPointerOver={() => {
        const c = ctl.current!
        if (c.phase === 'covered' || c.phase === 'drop') document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    />
  )
}

/* ------------------------------------------------------------------ product: a smart speaker */

const TOP = SPK.y1 - 0.02
const CAP0 = TOP - 0.22

function Speaker({ ctl }: { ctl: React.RefObject<Ctl> }) {
  const group = useRef<THREE.Group>(null)
  const parts = useMemo(() => {
    // two lathes: a knit body with a soft foot, and a champagne cap with a rounded shoulder
    const R = SPK.r - 0.02
    const body: THREE.Vector2[] = [new THREE.Vector2(0, 0.0)]
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2)
      body.push(new THREE.Vector2(R - 0.08 + Math.cos(a) * 0.08, 0.08 + Math.sin(a) * 0.08))
    }
    body.push(new THREE.Vector2(R, CAP0))
    body.push(new THREE.Vector2(R - 0.01, CAP0 + 0.005))
    const cap: THREE.Vector2[] = [new THREE.Vector2(R + 0.004, CAP0)]
    const f = 0.1
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * (Math.PI / 2)
      cap.push(new THREE.Vector2(R + 0.004 - f + Math.cos(a) * f, TOP - f + Math.sin(a) * f))
    }
    cap.push(new THREE.Vector2(0, TOP))
    const knit = knitTexture()
    return {
      body: new THREE.LatheGeometry(body, 96),
      cap: new THREE.LatheGeometry(cap, 96),
      fabric: new THREE.MeshPhysicalMaterial({
        color: '#a79d8f',
        roughness: 0.95,
        sheen: 0.8,
        sheenRoughness: 0.45,
        sheenColor: new THREE.Color('#fff2dc'),
        bumpMap: knit,
        bumpScale: 3,
        envMapIntensity: 0.6,
      }),
      metal: new THREE.MeshPhysicalMaterial({ color: '#d9bc84', metalness: 1, roughness: 0.24, envMapIntensity: 1.5, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#0d0c10', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }),
      ring: new THREE.MeshStandardMaterial({ color: '#241c10', emissive: new THREE.Color('#ffc46a'), emissiveIntensity: 0, roughness: 0.4 }),
      halo: new THREE.MeshBasicMaterial({ color: '#ffcf86', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: haloTexture() }),
    }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const g = group.current!
    g.rotation.y += c.spin.get() * dt
    const k = c.glow.get()
    parts.ring.emissiveIntensity = k * 3.4
    parts.halo.opacity = k * 0.85
  })

  return (
    <group ref={group} rotation-y={0.5}>
      <mesh geometry={parts.body} material={parts.fabric} castShadow receiveShadow />
      <mesh geometry={parts.cap} material={parts.metal} castShadow receiveShadow />
      {/* top: smoked glass with a light ring that wakes up on reveal */}
      <mesh position={[0, TOP + 0.002, 0]} rotation-x={-Math.PI / 2} material={parts.glass}>
        <circleGeometry args={[0.34, 64]} />
      </mesh>
      <mesh position={[0, TOP + 0.003, 0]} rotation-x={-Math.PI / 2} material={parts.ring}>
        <ringGeometry args={[0.345, 0.375, 96]} />
      </mesh>
      {/* foot glow on the plinth */}
      <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} material={parts.halo} renderOrder={1}>
        <planeGeometry args={[2.1, 2.1]} />
      </mesh>
      {/* front badge */}
      <mesh position={[0, 0.36, SPK.r - 0.016]} material={parts.metal}>
        <boxGeometry args={[0.12, 0.018, 0.012]} />
      </mesh>
    </group>
  )
}

function haloTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(128, 128, 50, 128, 128, 128)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.08, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.3, 'rgba(255,255,255,0.25)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  return t
}

function Pedestal() {
  const mats = useMemo(
    () => ({
      stone: new THREE.MeshPhysicalMaterial({ color: '#2a2630', roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.22, envMapIntensity: 0.9 }),
      top: new THREE.MeshPhysicalMaterial({ color: '#2a2630', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.7 }),
      gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.3, envMapIntensity: 1.4 }),
    }),
    [],
  )
  const h = PED.y1 - PED.y0
  return (
    <group>
      <mesh position={[0, (PED.y0 + PED.y1) / 2 - 0.004, 0]} material={mats.stone} castShadow receiveShadow>
        <cylinderGeometry args={[PED.r - 0.01, PED.r + 0.02, h - 0.008, 96]} />
      </mesh>
      <mesh position={[0, -0.002, 0]} rotation-x={-Math.PI / 2} material={mats.top} receiveShadow>
        <circleGeometry args={[PED.r - 0.01, 96]} />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation-x={Math.PI / 2} material={mats.gold}>
        <torusGeometry args={[PED.r - 0.004, 0.016, 12, 128]} />
      </mesh>
      <mesh position={[0, PED.y0 + 0.07, 0]} material={mats.stone} castShadow receiveShadow>
        <cylinderGeometry args={[PED.r + 0.16, PED.r + 0.18, 0.14, 96]} />
      </mesh>
      <mesh position={[0, PED.y0 + 0.145, 0]} rotation-x={Math.PI / 2} material={mats.gold}>
        <torusGeometry args={[PED.r + 0.16, 0.008, 10, 128]} />
      </mesh>
    </group>
  )
}

function Floor() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const x = c.getContext('2d')!
    const g = x.createRadialGradient(256, 256, 0, 256, 256, 256)
    g.addColorStop(0, 'rgba(255,236,200,0.22)')
    g.addColorStop(0.45, 'rgba(255,226,180,0.07)')
    g.addColorStop(1, 'rgba(255,226,180,0)')
    x.fillStyle = g
    x.fillRect(0, 0, 512, 512)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  return (
    <group position={[0, FLOOR, 0]}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#1a181e" roughness={0.88} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.003, 0]}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ light: spot + visible beam + dust */

const SPOT_POS = new THREE.Vector3(0.9, 7.4, 2.2)
const SPOT_TGT = new THREE.Vector3(0, 0.2, 0)
const SPOT_ANGLE = 0.33

function Stagelight({ ctl }: { ctl: React.RefObject<Ctl> }) {
  const spot = useMemo(() => {
    const s = new THREE.SpotLight('#ffefd2', 240, 0, SPOT_ANGLE, 0.55, 2)
    s.position.copy(SPOT_POS)
    s.target.position.copy(SPOT_TGT)
    s.castShadow = true
    s.shadow.mapSize.set(2048, 2048)
    s.shadow.bias = -0.0002
    s.shadow.normalBias = 0.02
    s.shadow.camera.near = 3
    s.shadow.camera.far = 14
    return s
  }, [])

  const beam = useMemo(() => {
    const dir = SPOT_TGT.clone().sub(SPOT_POS)
    const len = dir.length() + 1.6
    dir.normalize()
    const r = Math.tan(SPOT_ANGLE) * len
    const g = new THREE.CylinderGeometry(0.06, r, len, 64, 1, true)
    g.translate(0, -len / 2, 0)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      uniforms: { uOp: { value: 0.1 }, uColor: { value: new THREE.Color('#ffdca8') }, uLen: { value: len } },
      vertexShader: /* glsl */ `
        varying float vH;
        varying vec3 vN;
        varying vec3 vV;
        uniform float uLen;
        void main() {
          vH = -position.y / uLen;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vH;
        varying vec3 vN;
        varying vec3 vV;
        uniform float uOp;
        uniform vec3 uColor;
        void main() {
          float edge = pow(abs(dot(vN, vV)), 2.2);
          float fall = smoothstep(0.0, 0.08, vH) * pow(1.0 - vH, 1.4);
          gl_FragColor = vec4(uColor * edge * fall * uOp, 1.0);
        }`,
    })
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
    return { g, m, q }
  }, [])

  const dust = useMemo(() => {
    const COUNT = 220
    const a = new Float32Array(COUNT * 4)
    let s = 5
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < COUNT; i++) {
      a[i * 4] = rnd() // along beam
      a[i * 4 + 1] = rnd() * Math.PI * 2
      a[i * 4 + 2] = Math.sqrt(rnd())
      a[i * 4 + 3] = rnd()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(a, 4))
    const dir = SPOT_TGT.clone().sub(SPOT_POS)
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 },
        uOp: { value: 0.5 },
        uFrom: { value: SPOT_POS.clone() },
        uDir: { value: dir },
        uTan: { value: Math.tan(SPOT_ANGLE) * 0.85 },
        uPx: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uT;
        uniform vec3 uFrom;
        uniform vec3 uDir;
        uniform float uTan;
        uniform float uPx;
        varying float vA;
        void main() {
          float h = fract(aSeed.x + uT * (0.006 + aSeed.w * 0.01));
          h = 0.18 + h * 0.8;
          vec3 axis = normalize(uDir);
          vec3 side = normalize(cross(axis, vec3(0.0, 0.0, 1.0)));
          vec3 up = cross(side, axis);
          float L = length(uDir);
          float ang = aSeed.y + uT * 0.05 * (aSeed.w - 0.5);
          float rad = aSeed.z * uTan * h * L;
          vec3 p = uFrom + axis * h * L + (side * cos(ang) + up * sin(ang)) * rad;
          p.y += sin(uT * 0.6 + aSeed.y * 3.0) * 0.05;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.2 + aSeed.w * 2.4) * (8.0 / -mv.z);
          vA = (0.35 + 0.65 * sin(uT * (0.7 + aSeed.w) + aSeed.y * 5.0) * 0.5 + 0.5) * (1.0 - aSeed.z * 0.6) * smoothstep(1.0, 0.75, h);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOp;
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(d));
          gl_FragColor = vec4(vec3(1.0, 0.88, 0.68) * a * vA * uOp, 1.0);
        }`,
    })
    return { g, m }
  }, [])

  const dpr = useThree((s) => s.viewport.dpr)
  useFrame((state) => {
    const c = ctl.current!
    const f = c.flare.get()
    spot.intensity = 240 * (1 + f * 0.9)
    beam.m.uniforms.uOp.value = 0.075 * (1 + f * 1.8)
    dust.m.uniforms.uT.value = state.clock.elapsedTime
    dust.m.uniforms.uOp.value = 0.55 * (1 + f * 1.2)
    dust.m.uniforms.uPx.value = dpr
  })

  return (
    <>
      <primitive object={spot} />
      <primitive object={spot.target} />
      <mesh geometry={beam.g} material={beam.m} position={SPOT_POS} quaternion={beam.q} raycast={() => null} renderOrder={2} />
      <points geometry={dust.g} material={dust.m} frustumCulled={false} renderOrder={3} />
      {/* faint fills: a cool rim from behind, warm kick from the right */}
      <hemisphereLight args={['#4a4458', '#0c0b0f', 0.35]} />
      <directionalLight position={[-4, 3, -5]} intensity={0.8} color="#8c9cff" />
      <directionalLight position={[5, 2, -3]} intensity={0.9} color={GOLD} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={1.6} color="#ffe6c4" position={[0, 6, 2]} scale={[5, 2, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.9} color="#ffffff" position={[-5, 2, 3]} scale={[1.5, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.7} color="#a8b4ff" position={[5, 2, -3]} scale={[1.5, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color={GOLD} position={[2, 3, 5]} scale={1.4} target={[0, 0, 0]} />
      </Environment>
    </>
  )
}

/* ------------------------------------------------------------------ camera + director */

function Rig({ ctl }: { ctl: React.RefObject<Ctl> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const st = useMemo(() => ({ yaw: 0, pitch: 0.19, push: 0 }), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const c = ctl.current!
    const { width, height } = state.size
    const mobile = width < 760
    const aspect = width / height
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    st.yaw = THREE.MathUtils.damp(st.yaw, POSTER ? -0.1 : -0.1 + c.px * 0.08, 2.5, dt)
    st.pitch = THREE.MathUtils.damp(st.pitch, POSTER ? 0.19 : 0.19 - c.py * 0.04, 2.5, dt)
    // a slow push-in once revealed
    st.push = THREE.MathUtils.damp(st.push, c.phase === 'revealed' || c.phase === 'reveal' ? 1 : 0, 0.6, dt)
    let dist = (11 - st.push * 0.7) * (POSTER ? 0.86 : 1)
    dist = Math.max(dist, 2.5 / (tanV * aspect * (mobile ? 0.98 : 1)))
    if (mobile) dist = Math.max(dist, 3.3 / (tanV * 0.6))
    const ty = 0.72
    const cp = Math.cos(st.pitch)
    camera.position.set(Math.sin(st.yaw) * cp * dist, ty + Math.sin(st.pitch) * dist, Math.cos(st.yaw) * cp * dist)
    camera.lookAt(0, ty, 0)
    const ox = mobile || POSTER ? 0 : 0.17
    const oy = POSTER ? 0.02 : mobile ? 0.17 : 0.02
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  })
  return null
}

/* ------------------------------------------------------------------ page */

const TITLE = ['全', '新', ' ', 'A', 'U', 'R', 'A']

export default function CurtainReveal() {
  const sim = useMemo(() => makeCurtain(), [])
  const ctl = useRef<Ctl>({
    phase: 'drop',
    t: 0,
    lastUser: -1e9,
    req: null,
    flare: motionValue(0),
    glow: motionValue(0),
    spin: motionValue(0),
    px: 0,
    py: 0,
    firstCover: true,
  })
  const [phase, setPhase] = useState<Phase>('drop')
  const [tint, setTint] = useState<Tint>('wine')
  const anims = useRef<AnimationPlaybackControls[]>([])
  const run = (a: AnimationPlaybackControls) => {
    anims.current.push(a)
    if (anims.current.length > 24) anims.current.splice(0, anims.current.length - 24)
  }

  // the poster is the draped cloth under the spot (deterministic pre-roll)
  useMemo(() => {
    sim.reset(2.4, 0.42, 1)
    if (POSTER) {
      for (let i = 0; i < 120 * 5; i++) sim.step({ draft: 0.6, gust: 0, gustT: 0, collide: true })
      ctl.current.phase = 'covered'
    }
  }, [sim])

  const reveal = () => {
    const c = ctl.current
    if (c.phase !== 'covered' && c.phase !== 'drop') return
    c.phase = 'reveal'
    c.t = 0
    setPhase('reveal')
    // the spot flares as the cloth leaves, the product wakes up and starts to turn
    run(animate(c.flare, [0, 1, 0.38], { duration: 2.6, times: [0, 0.35, 1], ease: 'easeInOut', delay: 0.55 }))
    run(animate(c.glow, 1, { duration: 1.2, delay: 1.1, ease: [0.3, 0, 0.2, 1] }))
    run(animate(c.spin, 0.32, { duration: 2.5, delay: 0.9, ease: 'easeInOut' }))
  }
  const cover = () => {
    const c = ctl.current
    if (c.phase !== 'revealed' && c.phase !== 'reveal') return
    sim.reset(3.5, 0.3 + Math.random() * 0.5, Math.random() * 6)
    c.phase = 'drop'
    c.t = 0
    setPhase('drop')
    run(animate(c.flare, 0, { duration: 1.2 }))
    run(animate(c.glow, 0, { duration: 1.4, delay: 0.6 }))
    run(animate(c.spin, 0, { duration: 2.2, ease: 'easeOut' }))
  }

  // requests from the scene (cloth click) + ambient loop
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      const c = ctl.current
      if (c.req === 'reveal') {
        c.req = null
        reveal()
      }
      const idle = performance.now() - c.lastUser > 8000
      if (!idle) return
      if (c.phase === 'covered' && c.t > (c.firstCover ? 3 : 2.5)) {
        c.firstCover = false
        reveal()
      } else if (c.phase === 'revealed' && c.t > 4) cover()
    }, 100)
    return () => {
      window.clearInterval(id)
      anims.current.forEach((a) => a.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      ctl.current.px = (e.clientX / window.innerWidth) * 2 - 1
      ctl.current.py = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])

  // the revealed clock also has to tick (the cloth component stops stepping once it's gone)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const c = ctl.current
      if (c.phase === 'revealed') c.t += Math.min(0.1, (now - last) / 1000)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const user = () => (ctl.current.lastUser = performance.now())
  const shown = phase === 'revealed' || phase === 'reveal'
  const covered = phase === 'covered' || phase === 'drop'

  return (
    <div className="stage cr-stage">
      <style>{`
        .cr-stage { background: ${BG}; }
        .cr-stage .scrim { --soft-bg: ${BG}; }
        .cr-stage .hero-copy h1 em { color: ${GOLD}; }
        .cr-stage .kicker i { background: ${GOLD} !important; }
        .cr-stat { display: inline-flex; align-items: center; gap: 10px; margin-top: 22px !important; height: 18px; font: 500 12px/1 var(--mono) !important; letter-spacing: .04em; color: var(--fg-2); }
        .cr-stat b { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.25); transition: background .4s, box-shadow .4s; }
        .cr-stat b.on { background: ${GOLD}; box-shadow: 0 0 12px ${GOLD}; }
        .cr-title { position: absolute; left: 67%; top: max(76px, 9%); transform: translateX(-50%); text-align: center; pointer-events: none !important; white-space: nowrap; }
        .cr-title .cr-new { margin: 0 0 10px; font: 500 12px/1 var(--mono); letter-spacing: .32em; color: ${GOLD}; }
        .cr-title h2 { margin: 0; font: 600 clamp(40px, 5vw, 72px)/1 var(--display); letter-spacing: .02em; }
        .cr-title h2 span { display: inline-block; background: linear-gradient(180deg, #fff3d6 0%, #e7c98b 45%, #a8803e 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .cr-title h2 span.sp { width: .32em; }
        .cr-title .cr-sub { margin: 14px 0 0; font-size: 14px; letter-spacing: .12em; color: rgba(244,242,238,.66); }
        .cr-stage .btn.primary { background: linear-gradient(180deg, #e3c582, ${GOLD}); color: #1a1408; }
        @media (max-width: 760px) {
          .cr-title { left: 50%; top: 76px; }
          .cr-title h2 { font-size: 40px; }
          .cr-title .cr-sub { margin-top: 10px; font-size: 12px; }
          .cr-stage .hero-copy p:not(.kicker):not(.cr-stat) { font-size: 14px; line-height: 1.65; }
          .cr-stage .hero-actions { display: none; }
        }
      `}</style>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 30, near: 0.1, far: 120, position: [0, 1.6, 11] }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 13, 28]} />
        <Rig ctl={ctl} />
        <Stagelight ctl={ctl} />
        <Floor />
        <Pedestal />
        <Speaker ctl={ctl} />
        <Cloth ctl={ctl} sim={sim} tint={tint} onPhase={setPhase} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.9} luminanceSmoothing={0.25} radius={0.62} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.6} />
        </EffectComposer>
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
            <i /> Verlet cloth · 48×48
          </p>
          <h1>
            一阵风，
            <br />
            揭晓<em>新品</em>
          </h1>
          <p>一块 2,304 个质点的丝绒从上方落下，靠和产品、展台的碰撞自然垂坠。点布料或「揭晓」，风从左侧卷起，把它掀起吹出舞台。</p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                user()
                if (covered) reveal()
                else cover()
              }}
            >
              {covered ? '揭晓' : '重新盖上'}
            </button>
          </div>
          <p className="cr-stat">
            <b className={shown ? 'on' : ''} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={phase}
                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
                transition={{ duration: 0.2 }}
              >
                {phase === 'drop' ? '布料落下中…' : phase === 'covered' ? '已盖好 · 微风轻拂' : phase === 'reveal' ? '起风了' : '已揭晓 · 产品缓慢转台'}
              </motion.span>
            </AnimatePresence>
          </p>
        </motion.div>

        <AnimatePresence>
          {shown && (
            <motion.div
              key="title"
              className="cr-title"
              initial="hide"
              animate="show"
              exit="hide"
              variants={{ hide: { opacity: 0, transition: { duration: 0.4 } }, show: { opacity: 1, transition: { delayChildren: phase === 'reveal' ? 1.15 : 0, staggerChildren: 0.07 } } }}
            >
              <motion.p className="cr-new" variants={{ hide: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.6 } } }}>
                NEW · 2026
              </motion.p>
              <h2>
                {TITLE.map((ch, i) => (
                  <motion.span
                    key={i}
                    className={ch === ' ' ? 'sp' : ''}
                    variants={{
                      hide: { opacity: 0, y: 26, filter: 'blur(10px)' },
                      show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 160, damping: 20 } },
                    }}
                  >
                    {ch === ' ' ? ' ' : ch}
                  </motion.span>
                ))}
              </h2>
              <motion.p className="cr-sub" variants={{ hide: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.8 } } }}>
                360° 空间音频 · 智能音箱
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="dock">
          <button
            className="seg"
            onClick={() => {
              user()
              reveal()
            }}
            disabled={!covered}
            style={{ opacity: covered ? 1 : 0.45 }}
          >
            <span>揭晓</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              cover()
            }}
            disabled={covered}
            style={{ opacity: covered ? 0.45 : 1 }}
          >
            <span>重新盖上</span>
          </button>
          <span className="dock-sep" />
          <Seg
            items={(Object.keys(TINTS) as Tint[]).map((k) => ({ value: k, label: TINTS[k].label }))}
            value={tint}
            onChange={(v) => {
              user()
              setTint(v)
            }}
          />
        </div>
        <p className="hint">点击布料或「揭晓」· 闲置时自动揭晓、再盖上</p>
      </div>
    </div>
  )
}
