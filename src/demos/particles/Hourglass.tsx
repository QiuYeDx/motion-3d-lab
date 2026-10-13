import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { BULB_GLSL, HALF } from './hourglassSim'
import type { StateMsg, TickMsg } from './hourglassWorker'

/* ------------------------------------------------------------------ constants */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
/** simulated grains (multiple of TEX_W) and how many rendered grains each one spawns around the axis */
const TEX_W = 128
const N = MOBILE ? 3584 : 5120
const REPLICAS = 6
const GRAIN_R = 0.0084 * Math.sqrt(5120 / N)
const G = 14
const CAP_R = 1.1
const CAP_H = 0.2
/** half extents of the whole object (for flip lift + shadow) */
const EXT_A = CAP_R
const EXT_B = HALF + CAP_H

const NECKS = [
  { value: 0, label: '细颈', neck: 0.036, flow: 62 },
  { value: 1, label: '标准', neck: 0.05, flow: 112 },
  { value: 2, label: '宽颈', neck: 0.068, flow: 200 },
]

type Pal = { a: string; b: string; c: string; glint: number }
const SANDS: { value: number; label: string; en: string; pal: Pal; bg: string }[] = [
  { value: 0, label: '金沙', en: 'Gold', pal: { a: '#f4d095', b: '#d59a4e', c: '#9c5f2a', glint: 0 }, bg: '#f3ede4' },
  { value: 1, label: '粉沙', en: 'Rose', pal: { a: '#f8d3c9', b: '#e49c96', c: '#b5636d', glint: 0 }, bg: '#f5ebe6' },
  { value: 2, label: '星砂', en: 'Star', pal: { a: '#b4b3e6', b: '#5d5ea8', c: '#1f2150', glint: 1 }, bg: '#eeeaf0' },
]

/* ------------------------------------------------------------------ GLSL */

const SAND_VERT = /* glsl */ `
uniform highp sampler2D tSim;
uniform float uScale, uSize, uTime, uGlint;
uniform vec3 uA, uB, uC;
varying vec3 vCol;
varying float vGl;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float idx = position.x;
  float phi = position.y;
  float s = position.z;
  vec4 t = texelFetch(tSim, ivec2(int(mod(idx, ${TEX_W}.0)), int(floor(idx / ${TEX_W}.0))), 0);
  // each replica gets a little jitter so the copies never line up
  vec2 j = (vec2(h11(s * 3.7), h11(s * 9.1 + 1.3)) - 0.5) * uSize * 1.3;
  vec2 q = t.xy + j;
  float rr = abs(q.x);
  // revolve the cross-section grain around the hourglass axis (x → radius)
  vec3 p = vec3(q.x * cos(phi), q.y, rr * sin(phi));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;

  // pile surface normal ≈ radial with an upward lean (angle of repose); lit from the upper left
  vec3 radial = vec3(sign(q.x) * cos(phi), 0.0, sin(phi));
  vec3 up = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vec3 n = normalize(mat3(modelMatrix) * radial * 0.8 + vec3(0.0, 0.62, 0.0));
  float lam = clamp(dot(n, normalize(vec3(-0.45, 0.85, 0.5))), 0.0, 1.0);
  float tone = h11(s * 17.3 + 4.1);
  // mostly mid-tone grains, a share of pale ones and a sprinkle of dark minerals
  vec3 col = mix(uB, uA, smoothstep(0.35, 1.0, tone) * 0.85);
  col = mix(col, uC, step(tone, 0.07) * 0.75);
  // fast grains (the stream) catch a bit more light
  float moving = smoothstep(0.4, 1.6, t.z);
  col *= 0.58 + 0.55 * lam + 0.1 * moving;
  // a few glittering grains
  float g = step(0.955, h11(s * 5.3 + 7.7)) * uGlint;
  float tw = pow(max(sin(uTime * (1.3 + tone * 2.4) + s * 61.0), 0.0), 12.0);
  vGl = g * tw;
  vCol = col;
  // outer rings hold fewer grains per arc length: draw them a touch larger so the pile surface stays closed
  float size = uSize * (0.75 + 0.5 * t.w) * (1.0 + vGl * 0.5) * (1.0 + 0.45 * smoothstep(0.15, 0.75, rr));
  gl_PointSize = max(1.5, 2.0 * size * uScale / -mv.z);
}
`

const SAND_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vGl;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  vec3 col = vCol * (1.08 - d * 1.3);
  col = mix(col, vec3(1.0, 0.93, 0.7), clamp(vGl * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`

const GLASS_VERT = /* glsl */ `
uniform float uNeck, uOff;
varying vec3 vN;
varying vec3 vV;
varying vec3 vNv;
varying float vY;
${BULB_GLSL}
void main() {
  float y = position.y;
  vec2 dir = normalize(position.xz);
  float R = profileR(y, uNeck) + uOff;
  float e = 0.004;
  float dR = (profileR(y + e, uNeck) - profileR(y - e, uNeck)) / (2.0 * e);
  vec3 p = vec3(dir.x * R, y, dir.y * R);
  vec3 n = normalize(vec3(dir.x, -dR, dir.y));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  vNv = normalize(normalMatrix * n);
  vY = y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const GLASS_FRAG = /* glsl */ `
uniform float uBack;
varying vec3 vN;
varying vec3 vV;
varying vec3 vNv;
varying float vY;
void main() {
  float sgn = uBack > 0.5 ? -1.0 : 1.0;
  vec3 n = normalize(vN) * sgn;
  vec3 v = normalize(vV);
  vec3 nv = normalize(vNv) * sgn;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.2);
  // on a light backdrop glass reads by its darker, warm-grey silhouette plus crisp window reflections
  vec3 edge = vec3(0.42, 0.36, 0.31);
  vec3 col = mix(vec3(1.0), edge, smoothstep(0.1, 0.9, fr));
  float a = 0.035 + fr * 0.62;
  // studio softboxes (fixed to the view, so they slide over the glass while it turns)
  float s1 = smoothstep(0.14, 0.03, abs(nv.x + 0.5)) * smoothstep(-0.7, 0.2, nv.y);
  float s2 = smoothstep(0.05, 0.0, abs(nv.x - 0.66)) * 0.85;
  float s3 = smoothstep(0.55, 0.85, nv.y) * 0.5;
  float hl = max(max(s1, s2), s3) * (uBack > 0.5 ? 0.3 : 1.0);
  col = mix(col, vec3(1.0), hl);
  a = max(a, hl * 0.9);
  // ends fade into the wooden caps
  a *= smoothstep(${HALF.toFixed(3)}, ${(HALF - 0.04).toFixed(3)}, abs(vY));
  gl_FragColor = vec4(col, a * (uBack > 0.5 ? 0.55 : 1.0));
}
`

const SHADOW_VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const SHADOW_FRAG = /* glsl */ `
uniform vec2 uExt;
uniform float uLift;
uniform float uCap;
varying vec2 vP;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  // plane is rotated so local y is world -z; nudge the shadow away from the key light (upper left front)
  vec2 p = vP - vec2(0.28, 0.18) * (1.0 + uLift * 0.6);
  float blur = 0.3 + uLift * 0.7;
  float d = sdBox(p, uExt, min(uExt.x, uExt.y) * 0.9);
  float a = (1.0 - smoothstep(-blur, blur * 1.5, d)) * 0.34 / (1.0 + uLift * 1.4);
  // tight contact shadow under the resting cap
  float dc = length(vP - vec2(0.05, 0.03)) - ${CAP_R.toFixed(2)};
  a += (1.0 - smoothstep(-0.18, 0.12, dc)) * 0.28 * uCap;
  gl_FragColor = vec4(vec3(0.33, 0.22, 0.13), a);
}
`

/* ------------------------------------------------------------------ helpers */

function hexRgb(h: string) {
  const n = parseInt(h.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function woodTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 512, 0)
  grd.addColorStop(0, '#8a5532')
  grd.addColorStop(0.5, '#a0663b')
  grd.addColorStop(1, '#8a5532')
  g.fillStyle = grd
  g.fillRect(0, 0, 512, 256)
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 260; i++) {
    const x = rnd() * 512
    const w = 0.6 + rnd() * 2.4
    g.strokeStyle = rnd() < 0.5 ? `rgba(70,38,18,${0.08 + rnd() * 0.22})` : `rgba(200,140,90,${0.05 + rnd() * 0.12})`
    g.lineWidth = w
    g.beginPath()
    g.moveTo(x, 0)
    for (let y = 0; y <= 256; y += 16) g.lineTo(x + Math.sin(y * 0.03 + i) * 3 * rnd(), y)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

function capGeometry() {
  // turned cap: flat inner face, rounded rim, a small step on the outer face
  const pts: THREE.Vector2[] = []
  const h = CAP_H / 2
  pts.push(new THREE.Vector2(0, -h))
  pts.push(new THREE.Vector2(CAP_R - 0.08, -h))
  for (let k = 0; k <= 8; k++) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI
    pts.push(new THREE.Vector2(CAP_R - 0.08 + Math.cos(a) * 0.08, Math.sin(a) * (h - 0.0) * 0.999))
  }
  pts.push(new THREE.Vector2(CAP_R - 0.12, h))
  pts.push(new THREE.Vector2(CAP_R - 0.14, h + 0.025))
  pts.push(new THREE.Vector2(0, h + 0.025))
  return new THREE.LatheGeometry(pts, 72)
}

function pillarGeometry() {
  // spindle: beads near both ends and a slim belly
  const pts: THREE.Vector2[] = []
  const prof = (t: number) => {
    const u = Math.abs(t)
    let r = 0.034 + 0.006 * Math.cos(u * Math.PI * 0.5)
    r += 0.028 * Math.exp(-Math.pow((u - 0.86) / 0.035, 2))
    r += 0.016 * Math.exp(-Math.pow((u - 0.74) / 0.03, 2))
    r += 0.02 * Math.exp(-Math.pow(u / 0.05, 2))
    return r
  }
  pts.push(new THREE.Vector2(0, -HALF))
  for (let k = 0; k <= 120; k++) {
    const t = -1 + (2 * k) / 120
    pts.push(new THREE.Vector2(prof(t), t * HALF))
  }
  pts.push(new THREE.Vector2(0, HALF))
  return new THREE.LatheGeometry(pts, 20)
}

/* ------------------------------------------------------------------ camera */

function Rig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  useLayoutEffect(() => {
    const aspect = width / height
    const mobile = width < 760
    const fitH = aspect < 0.9 ? Math.max(8, 4.05 / aspect) : 5.1
    camera.fov = 28
    const d = fitH / (2 * Math.tan(THREE.MathUtils.degToRad(14)))
    camera.position.set(0, d * 0.13, d)
    camera.lookAt(0, -0.05, 0)
    camera.near = 0.5
    camera.far = 80
    const ox = POSTER || mobile ? 0 : 0.14
    const oy = POSTER ? 0 : mobile ? 0.17 : 0.01
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])
  return null
}

/* ------------------------------------------------------------------ scene */

type Stats = { upper: number; passed: number; shown: number }

function Scene({
  theta,
  neckMv,
  flowRef,
  pal,
  stats,
  onFlip,
}: {
  theta: MotionValue<number>
  neckMv: MotionValue<number>
  flowRef: React.RefObject<number>
  pal: React.RefObject<{ a: number[]; b: number[]; c: number[]; glint: number }>
  stats: React.RefObject<Stats>
  onFlip: () => void
}) {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const group = useRef<THREE.Group>(null)

  /* sim texture + worker */
  const rows = N / TEX_W
  const tex = useMemo(() => {
    const t = new THREE.DataTexture(new Float32Array(N * 4), TEX_W, rows, THREE.RGBAFormat, THREE.FloatType)
    t.minFilter = t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }, [rows])
  useEffect(() => () => tex.dispose(), [tex])

  const io = useRef<{ worker: Worker | null; busy: boolean; latest: StateMsg | null; spare: Float32Array | undefined; dt: number; ready: boolean }>({
    worker: null,
    busy: true,
    latest: null,
    spare: undefined,
    dt: 0,
    ready: false,
  })
  useEffect(() => {
    const w = new Worker(new URL('./hourglassWorker.ts', import.meta.url), { type: 'module' })
    const s = io.current
    s.worker = w
    w.onmessage = (e: MessageEvent<StateMsg>) => {
      s.latest = e.data
      s.busy = false
    }
    w.postMessage({ type: 'init', n: N, r: GRAIN_R, fracLower: POSTER ? 0.42 : 0.3, neck: neckMv.get(), flow: flowRef.current, warm: POSTER ? 1.2 : 0.7 })
    return () => {
      w.terminate()
      s.worker = null
    }
  }, [neckMv, flowRef])

  /* grains */
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const a = new Float32Array(N * REPLICAS * 3)
    let seed = 99
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < REPLICAS; k++) {
        const o = (i * REPLICAS + k) * 3
        a[o] = i
        // stratified angles over the front half-turn: every simulated grain becomes a little arc of grains
        a[o + 1] = -Math.PI / 2 + ((k + rnd()) / REPLICAS) * Math.PI
        a[o + 2] = rnd() * 100
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3))
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])

  const sandMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SAND_VERT,
        fragmentShader: SAND_FRAG,
        uniforms: {
          tSim: { value: tex },
          uScale: { value: 400 },
          uSize: { value: GRAIN_R * 1.3 },
          uTime: { value: 0 },
          uGlint: { value: 0 },
          uA: { value: new THREE.Color() },
          uB: { value: new THREE.Color() },
          uC: { value: new THREE.Color() },
        },
      }),
    [tex],
  )
  useEffect(() => () => sandMat.dispose(), [sandMat])

  /* glass */
  const glassUniforms = useMemo(() => ({ uNeck: { value: neckMv.get() }, uOff: { value: 0.012 } }), [neckMv])
  const glassBack = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: { ...glassUniforms, uBack: { value: 1 } },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    [glassUniforms],
  )
  const glassFront = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: GLASS_VERT,
        fragmentShader: GLASS_FRAG,
        uniforms: { ...glassUniforms, uBack: { value: 0 } },
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    [glassUniforms],
  )
  const glassGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, HALF * 2, 72, 180, true), [])

  /* wood */
  const wood = useMemo(() => {
    const map = woodTexture()
    return {
      cap: new THREE.MeshStandardMaterial({ map, color: '#ffffff', roughness: 0.52, metalness: 0 }),
      pillar: new THREE.MeshStandardMaterial({ map, color: '#f2e2d2', roughness: 0.45, metalness: 0 }),
      capGeo: capGeometry(),
      pillarGeo: pillarGeometry(),
    }
  }, [])

  /* shadow */
  const shadowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        uniforms: { uExt: { value: new THREE.Vector2(1, 1) }, uLift: { value: 0 }, uCap: { value: 1 } },
        transparent: true,
        depthWrite: false,
      }),
    [],
  )

  const clock = useRef(0)
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    clock.current += dt
    const th = theta.get()
    const g = group.current
    const sinT = Math.abs(Math.sin(th))
    const cosT = Math.abs(Math.cos(th))
    // lift while turning so the caps clear the table; distance from the nearest rest pose
    const rest = Math.abs(th - Math.round(th / Math.PI) * Math.PI)
    const lift = 0.42 * Math.pow(Math.sin(Math.min(rest, Math.PI / 2)), 0.8)
    const yc = Math.max(0, EXT_A * sinT + EXT_B * cosT - EXT_B) + lift
    if (g) {
      g.rotation.z = th
      g.position.y = yc
      // a breath of idle sway keeps the object alive
      g.rotation.y = Math.sin(clock.current * 0.35) * 0.06
    }

    /* worker I/O */
    const s = io.current
    s.dt += dt
    if (s.latest) {
      const m = s.latest
      s.latest = null
      s.spare = tex.image.data as unknown as Float32Array
      ;(tex.image as { data: Float32Array }).data = m.buf
      tex.needsUpdate = true
      const st = stats.current
      st.upper = m.upper
      st.passed = m.passed
      s.ready = true
    }
    if (!s.busy && s.worker) {
      const neck = neckMv.get()
      // a quick flip carries the packed sand along with the glass (inertia); model it by easing off
      // gravity while the glass spins fast, so the sand lands as a block and then avalanches down
      const w = Math.abs(theta.getVelocity())
      const gs = G * (1 - 0.82 * THREE.MathUtils.smoothstep(w, 0.4, 2.2))
      const msg: TickMsg = {
        type: 'tick',
        dt: s.ready ? s.dt : 0,
        gx: -gs * Math.sin(th),
        gy: -gs * Math.cos(th),
        neck,
        flow: flowRef.current,
        up: Math.cos(th) >= 0 ? 1 : -1,
      }
      const spare = s.spare
      if (spare && spare.length === N * 4) {
        msg.buf = spare
        s.worker.postMessage(msg, [spare.buffer])
      } else s.worker.postMessage(msg)
      s.spare = undefined
      s.busy = true
      s.dt = 0
    }

    /* uniforms */
    const u = sandMat.uniforms
    u.uScale.value = (size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad((state.camera as THREE.PerspectiveCamera).fov / 2)))
    u.uTime.value = clock.current
    const p = pal.current
    ;(u.uA.value as THREE.Color).setRGB(p.a[0], p.a[1], p.a[2])
    ;(u.uB.value as THREE.Color).setRGB(p.b[0], p.b[1], p.b[2])
    ;(u.uC.value as THREE.Color).setRGB(p.c[0], p.c[1], p.c[2])
    u.uGlint.value = p.glint
    glassUniforms.uNeck.value = neckMv.get()

    const su = shadowMat.uniforms
    ;(su.uExt.value as THREE.Vector2).set(EXT_A * cosT + EXT_B * sinT * 0.92, EXT_A * 0.92)
    su.uLift.value = yc
    su.uCap.value = Math.max(0, 1 - yc * 6)
  })

  const pillars = [Math.PI / 2 + Math.PI / 3, Math.PI / 2 - Math.PI / 3, -Math.PI / 2]

  return (
    <>
      <ambientLight intensity={1.15} color="#fff4e8" />
      <hemisphereLight args={['#fff8ef', '#d9b28c', 0.7]} />
      <directionalLight position={[-3.5, 5, 4]} intensity={2.1} color="#fff1df" />
      <directionalLight position={[4, 1.5, 2]} intensity={0.55} color="#ffd9b8" />

      <mesh rotation-x={-Math.PI / 2} position-y={-EXT_B - 0.002} material={shadowMat} renderOrder={-1}>
        <planeGeometry args={[9, 9]} />
      </mesh>

      <group ref={group}>
        <points geometry={geo} material={sandMat} frustumCulled={false} />
        <mesh geometry={glassGeo} material={glassBack} renderOrder={2} frustumCulled={false} />
        <mesh geometry={glassGeo} material={glassFront} renderOrder={3} frustumCulled={false} />
        <mesh geometry={wood.capGeo} material={wood.cap} position-y={HALF + CAP_H / 2} />
        <mesh geometry={wood.capGeo} material={wood.cap} position-y={-HALF - CAP_H / 2} rotation-x={Math.PI} />
        {pillars.map((a, i) => (
          <mesh key={i} geometry={wood.pillarGeo} material={wood.pillar} position={[Math.cos(a) * 0.98, 0, Math.sin(a) * 0.98]} />
        ))}
        {/* invisible hit volume for click-to-flip */}
        <mesh
          onClick={(e) => {
            e.stopPropagation()
            onFlip()
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <cylinderGeometry args={[CAP_R, CAP_R, EXT_B * 2, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
    </>
  )
}

/* ------------------------------------------------------------------ page */

const fmt = (s: number) => {
  s = Math.max(0, s)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`
}

export default function Hourglass() {
  const [sand, setSand] = useState(0)
  const [neckIdx, setNeckIdx] = useState(1)
  const [flips, setFlips] = useState(0)
  const theta = useMotionValue(0)
  const neckMv = useMotionValue(NECKS[1].neck)
  const flowRef = useRef(NECKS[1].flow)
  const stats = useRef<Stats>({ upper: N, passed: 0, shown: -1 })
  const pal = useRef({ a: hexRgb(SANDS[0].pal.a), b: hexRgb(SANDS[0].pal.b), c: hexRgb(SANDS[0].pal.c), glint: 0 })
  const target = useRef(0)

  const timerEl = useRef<HTMLSpanElement>(null)
  const barEl = useRef<HTMLSpanElement>(null)
  const countEl = useRef<HTMLSpanElement>(null)
  const stateEl = useRef<HTMLSpanElement>(null)

  const flip = useCallback(() => {
    target.current = Math.round(theta.get() / Math.PI) * Math.PI + Math.PI
    // springy turn with a small overshoot — the sand keeps reacting to world-space gravity throughout
    animate(theta, target.current, { type: 'spring', stiffness: 62, damping: 10.5, mass: 1 })
    setFlips((f) => f + 1)
  }, [theta])

  // neck width + flow
  useEffect(() => {
    const n = NECKS[neckIdx]
    flowRef.current = n.flow
    const c = animate(neckMv, n.neck, { type: 'spring', stiffness: 120, damping: 18 })
    return () => c.stop()
  }, [neckIdx, neckMv])

  // sand palette tween (Motion drives a 0→1 progress; colours are mixed from whatever is on screen now)
  useEffect(() => {
    const from = { a: [...pal.current.a], b: [...pal.current.b], c: [...pal.current.c], glint: pal.current.glint }
    const to = SANDS[sand].pal
    const ta = hexRgb(to.a)
    const tb = hexRgb(to.b)
    const tc = hexRgb(to.c)
    const c = animate(0, 1, {
      duration: 0.9,
      ease: [0.23, 1, 0.32, 1],
      onUpdate: (k) => {
        const p = pal.current
        for (let i = 0; i < 3; i++) {
          p.a[i] = from.a[i] + (ta[i] - from.a[i]) * k
          p.b[i] = from.b[i] + (tb[i] - from.b[i]) * k
          p.c[i] = from.c[i] + (tc[i] - from.c[i]) * k
        }
        p.glint = from.glint + (to.glint - from.glint) * k
      },
    })
    return () => c.stop()
  }, [sand])

  // timer readout + auto flip, without per-frame React renders
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let emptyFor = 0
    let lastText = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const st = stats.current
      // the throat meters grains at a fixed rate, so the nominal flow predicts the remaining time well
      const rate = flowRef.current * 0.985
      const est = st.upper / rate
      const settling = Math.abs(theta.get() - target.current) > 0.05
      if (st.shown < 0) st.shown = est
      else {
        st.shown -= settling ? 0 : dt
        st.shown += (est - st.shown) * Math.min(1, dt * (settling ? 4 : 0.8))
      }
      if (st.upper === 0) st.shown = Math.max(0, st.shown - dt * 4)
      const txt = fmt(st.shown)
      if (txt !== lastText && timerEl.current) {
        timerEl.current.textContent = txt
        lastText = txt
      }
      if (barEl.current) barEl.current.style.transform = `scaleX(${(st.upper / N).toFixed(4)})`
      if (countEl.current) countEl.current.textContent = `${st.upper.toLocaleString()} / ${N.toLocaleString()}`
      const empty = st.upper <= 2 && !settling
      emptyFor = empty ? emptyFor + dt : 0
      if (stateEl.current) stateEl.current.textContent = empty ? '已流尽 · 即将翻转' : settling ? '翻转中' : '流动中'
      if (emptyFor > 2.4 && !POSTER) {
        emptyFor = -10
        flip()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [flip, theta])

  const bg = SANDS[sand].bg

  return (
    <div className="stage hg" style={{ background: `radial-gradient(90% 80% at 62% 42%, #fffaf3 0%, ${bg} 55%, #e6dccd 100%)`, transition: 'background 0.9s' }}>
      <style>{css}</style>
      <Canvas flat dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 28, position: [0, 1.3, 10] }}>
        <Rig />
        <Scene theta={theta} neckMv={neckMv} flowRef={flowRef} pal={pal} stats={stats} onFlip={flip} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" style={{ ['--soft-bg' as string]: '#f6f0e7' }} />
          <p className="kicker">
            <i /> Granular · 2.5D
          </p>
          <h1>
            时间，
            <br />
            一粒一粒地落下
          </h1>
          <p className="hg-lede">
            {N.toLocaleString()} 粒沙在沙漏截面里做带摩擦的位置约束模拟，再绕轴旋转成 {(N * REPLICAS).toLocaleString()} 粒立体的沙堆。点一下沙漏把它翻过来，重力始终朝下。
          </p>
          <div className="hg-timer">
            <div className="hg-timer-row">
              <span className="hg-time" ref={timerEl}>
                00:00.0
              </span>
              <span className="hg-state">
                <i />
                <span ref={stateEl}>流动中</span>
              </span>
            </div>
            <span className="hg-bar">
              <span ref={barEl} />
            </span>
            <p className="hg-meta">
              上层剩余 <span ref={countEl}>—</span> 粒 · 已翻转 {flips} 次
            </p>
          </div>
        </motion.div>

        <div className="dock hg-dock">
          <button className="seg hg-flip" onClick={flip} aria-label="翻转沙漏">
            <motion.svg key={flips} width="14" height="14" viewBox="0 0 14 14" aria-hidden initial={{ rotate: -180 }} animate={{ rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
              <path d="M3.5 1.8h7M3.5 12.2h7M4.2 2c0 3 5.6 3.4 5.6 5s-5.6 2-5.6 5M9.8 2c0 3-5.6 3.4-5.6 5s5.6 2 5.6 5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </motion.svg>
            <span className="hg-flip-label">翻转</span>
          </button>
          <span className="dock-sep" />
          <Seg items={NECKS.map((n) => ({ value: n.value, label: n.label }))} value={neckIdx} onChange={setNeckIdx} />
          <span className="dock-sep" />
          <Seg items={SANDS.map((s) => ({ value: s.value, label: s.label }))} value={sand} onChange={setSand} />
        </div>
        <p className="hint">
          点击沙漏翻转
          <br />
          颈口越宽，沙流越快
        </p>
      </div>
    </div>
  )
}

const css = `
.hg .hg-lede { max-width: 400px }
.hg-timer { margin-top: 30px; width: min(320px, 100%) }
.hg-timer-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px }
.hg-time {
  font: 500 44px/1 var(--mono); letter-spacing: -0.02em; color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.hg-state { display: inline-flex; align-items: center; gap: 7px; font: 500 12px/1 var(--sans); color: var(--fg-2); white-space: nowrap }
.hg-state i { width: 6px; height: 6px; border-radius: 50%; background: #c98a4b; animation: hg-blink 1.6s ease-in-out infinite }
@keyframes hg-blink { 50% { opacity: .3 } }
.hg-bar { position: relative; display: block; height: 3px; margin-top: 14px; border-radius: 3px; background: rgba(29,28,26,.09); overflow: hidden }
.hg-bar span { position: absolute; inset: 0; background: linear-gradient(90deg, #b9783c, #e2b06b); transform-origin: left; border-radius: inherit }
.hg-meta { margin: 10px 0 0 !important; font: 12px/1.4 var(--mono) !important; color: var(--fg-2) }
.hg-flip { display: inline-flex; align-items: center; gap: 6px; color: var(--fg) !important; background: color-mix(in srgb, var(--fg) 7%, transparent) }
.hg-flip:active { transform: scale(.96) }
@media (max-width: 760px) {
  .hg .hg-lede { display: none }
  .hg-timer { margin-top: 18px }
  .hg-time { font-size: 34px }
  .hg-dock .seg { padding: 0 9px }
  .hg-flip-label { display: none }
  .hg-dock .dock-sep { margin: 0 2px }
}
`
