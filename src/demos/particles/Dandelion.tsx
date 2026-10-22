import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, AnimatePresence, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BigLabel } from '../../components/BigLabel'
import { POSTER } from '../../lib/iso'
import { useScreenWarmup } from '../iso/isoWarmup'

/* ------------------------------------------------------------------ config */

const PHONE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const N = PHONE ? 180 : 240
const TOTAL = N * 2 // head slots + a pool of the same size for seeds in flight
const R_REC = 0.13 // receptacle radius
const PAP_Y = 0.62 // pappus apex along the seed axis
const PAP_R = 0.2
const STEM_L = 4.8
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

const ATTACHED = 0
const EMPTY = 1
const GROWING = 2

const UP = new THREE.Vector3(0, 1, 0)

/* ------------------------------------------------------------------ textures + geometry */

function pappusTexture() {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = S
  cv.height = S
  const ctx = cv.getContext('2d')!
  const c = S / 2
  const R = S * 0.48
  ctx.lineCap = 'round'
  const n = 64
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.05
    const len = R * (0.86 + Math.random() * 0.14)
    const bend = (Math.random() - 0.5) * 0.08
    const ex = c + Math.cos(a + bend) * len
    const ey = c + Math.sin(a + bend) * len
    const g = ctx.createLinearGradient(c, c, ex, ey)
    g.addColorStop(0, 'rgba(255,255,255,0.15)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.75)')
    g.addColorStop(1, 'rgba(255,255,255,0.95)')
    ctx.strokeStyle = g
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(c, c)
    ctx.quadraticCurveTo(c + Math.cos(a) * len * 0.55, c + Math.sin(a) * len * 0.55, ex, ey)
    ctx.stroke()
    // fine barbs on the outer half: what makes the pappus look like down
    ctx.lineWidth = 0.7
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    for (let b = 0; b < 9; b++) {
      const t = 0.42 + Math.random() * 0.56
      const px = c + Math.cos(a + bend * t) * len * t
      const py = c + Math.sin(a + bend * t) * len * t
      const side = Math.random() < 0.5 ? -1 : 1
      const ba = a + side * (0.5 + Math.random() * 0.4)
      const bl = 4 + Math.random() * 9
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + Math.cos(ba) * bl, py + Math.sin(ba) * bl)
      ctx.stroke()
    }
  }
  // hub
  const hub = ctx.createRadialGradient(c, c, 0, c, c, 10)
  hub.addColorStop(0, 'rgba(240,236,220,0.9)')
  hub.addColorStop(1, 'rgba(240,236,220,0)')
  ctx.fillStyle = hub
  ctx.fillRect(c - 12, c - 12, 24, 24)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

/** achene + beak in one geometry, with a per-vertex colour (local +Y = outward) */
function seedGeometry() {
  const body = new THREE.SphereGeometry(1, 8, 6)
  body.scale(0.014, 0.05, 0.014)
  body.translate(0, 0.062, 0)
  const beak = new THREE.CylinderGeometry(0.0034, 0.0034, 1, 4, 1, true)
  beak.scale(1, PAP_Y - 0.11, 1)
  beak.translate(0, 0.11 + (PAP_Y - 0.11) / 2, 0)
  const paint = (g: THREE.BufferGeometry, c: [number, number, number]) => {
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) a.set(c, i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    g.deleteAttribute('uv')
    return g
  }
  const g = mergeGeometries([paint(body, [0.5, 0.42, 0.28]), paint(beak, [0.88, 0.86, 0.78])])!
  return g
}

/** shallow umbrella: a cone fan with the apex at the origin, opening toward +Y */
function pappusGeometry() {
  const g = new THREE.CircleGeometry(PAP_R, 40)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i)) / PAP_R
    p.setY(i, 0.075 * r)
  }
  g.computeVertexNormals()
  return g
}

function bractGeometry() {
  const pos: number[] = []
  const idx: number[] = []
  const nB = 14
  const seg = 6
  for (let k = 0; k < nB; k++) {
    const a = (k / nB) * Math.PI * 2 + (k % 2) * 0.2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const len = 0.85 + ((k * 37) % 10) / 30
    const base = pos.length / 3
    for (let s = 0; s <= seg; s++) {
      const t = s / seg
      const r = 0.07 + 0.2 * t * len
      const y = -0.07 - 0.36 * t * t * len
      const w = 0.026 * (1 - t * 0.92)
      // tangent direction around the stem
      pos.push(ca * r - sa * w, y, sa * r + ca * w)
      pos.push(ca * r + sa * w, y, sa * r - ca * w)
      if (s < seg) {
        const i0 = base + s * 2
        idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/* ------------------------------------------------------------------ GLSL */

const SEED_VERT = /* glsl */ `
attribute vec3 color;
attribute float aFade;
attribute float aBlur;
varying vec3 vCol;
varying vec3 vN;
varying float vFade;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vN = normalize(mat3(m) * normal);
  vCol = color;
  vFade = aFade * (1.0 - aBlur * 0.55);
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}
`
const SEED_FRAG = /* glsl */ `
uniform vec3 uLight;
varying vec3 vCol;
varying vec3 vN;
varying float vFade;
void main() {
  if (vFade < 0.01) discard;
  float l = 0.62 + 0.38 * max(dot(normalize(vN), uLight), 0.0);
  gl_FragColor = vec4(vCol * l, vFade);
}
`

const PAP_VERT = /* glsl */ `
attribute float aFade;
attribute float aBlur;
varying vec2 vUv;
varying float vFade;
varying float vBlur;
varying float vFacing;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vec3 n = normalize(mat3(m) * vec3(0.0, 1.0, 0.0));
  vFacing = abs(dot(n, normalize(cameraPosition - w.xyz)));
  vUv = uv;
  vFade = aFade;
  vBlur = aBlur;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const PAP_FRAG = /* glsl */ `
uniform sampler2D tPap;
uniform vec3 uTint;
varying vec2 vUv;
varying float vFade;
varying float vBlur;
varying float vFacing;
void main() {
  if (vFade < 0.01) discard;
  float a = texture2D(tPap, vUv, vBlur * 3.5).a;
  // seen edge-on the filaments stack up: a touch denser
  a *= mix(1.25, 0.9, vFacing);
  a *= vFade * (1.0 - vBlur * 0.45);
  if (a < 0.004) discard;
  vec3 col = gl_FrontFacing ? vec3(1.0) : uTint;
  gl_FragColor = vec4(col, min(a, 1.0));
}
`

const STEM_VERT = /* glsl */ `
uniform vec2 uBend;
uniform float uLen;
varying vec3 vN;
varying float vS;
void main() {
  vec3 p = position;
  float s = clamp(p.y / uLen, 0.0, 1.0);
  p.x += uBend.x * s * s;
  p.z += uBend.y * s * s;
  vS = s;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`
const STEM_FRAG = /* glsl */ `
uniform vec3 uLow, uHigh;
varying vec3 vN;
varying float vS;
void main() {
  vec3 n = normalize(vN);
  float l = 0.55 + 0.45 * max(dot(n, normalize(vec3(-0.5, 0.4, 0.8))), 0.0);
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.18;
  vec3 col = mix(uLow, uHigh, smoothstep(0.0, 1.0, vS)) * l + rim;
  gl_FragColor = vec4(col, 1.0);
}
`

const LIT_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const REC_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 n = normalize(vN);
  float l = 0.5 + 0.5 * max(dot(n, normalize(vec3(-0.5, 0.6, 0.7))), 0.0);
  // pitted surface where the seeds sat
  vec3 d = normalize(vP);
  vec2 sph = vec2(atan(d.z, d.x) * 9.0, acos(clamp(d.y, -1.0, 1.0)) * 9.0);
  vec2 cell = fract(sph) - 0.5;
  float pit = smoothstep(0.24, 0.12, length(cell)) * step(0.25, hash12(floor(sph)));
  vec3 col = mix(vec3(0.82, 0.74, 0.55), vec3(0.55, 0.45, 0.3), pit * 0.8);
  gl_FragColor = vec4(col * l, 1.0);
}
`
const BRACT_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  float l = 0.6 + 0.4 * abs(dot(n, normalize(vec3(-0.5, 0.6, 0.7))));
  vec3 col = mix(vec3(0.36, 0.45, 0.22), vec3(0.5, 0.58, 0.3), smoothstep(-0.4, -0.05, vP.y));
  gl_FragColor = vec4(col * l, 1.0);
}
`

/* ------------------------------------------------------------------ sim */

type Ptr = { x: number; y: number; vx: number; vy: number; t: number }
type Ctl = {
  gust: MotionValue<number>
  gustDir: React.MutableRefObject<THREE.Vector3>
  gustS: React.MutableRefObject<number>
  ptr: React.MutableRefObject<Ptr>
  regrow: React.MutableRefObject<number>
  mic: React.MutableRefObject<{ an: AnalyserNode | null; buf: Float32Array<ArrayBuffer> | null; level: number }>
  micBar: React.MutableRefObject<HTMLElement | null>
  blow: (s: number) => void
  lastUser: React.MutableRefObject<number>
  onStats: (attached: number, phase: number) => void
}

function easeOutBack(x: number) {
  const c1 = 1.5
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function Plant({ ctl }: { ctl: Ctl }) {
  const size = useThree((s) => s.size)
  // compile the handful of programs in the background before the first visible frame
  useScreenWarmup()

  const res = useMemo(() => {
    const seedGeo = seedGeometry()
    const papGeo = pappusGeometry()
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL), 1)
    const blur = new THREE.InstancedBufferAttribute(new Float32Array(TOTAL), 1)
    fade.setUsage(THREE.DynamicDrawUsage)
    blur.setUsage(THREE.DynamicDrawUsage)
    seedGeo.setAttribute('aFade', fade)
    seedGeo.setAttribute('aBlur', blur)
    papGeo.setAttribute('aFade', fade)
    papGeo.setAttribute('aBlur', blur)
    const papTex = pappusTexture()
    const seedMat = new THREE.ShaderMaterial({
      vertexShader: SEED_VERT,
      fragmentShader: SEED_FRAG,
      uniforms: { uLight: { value: new THREE.Vector3(-0.5, 0.7, 0.6).normalize() } },
      transparent: true,
    })
    const papMat = new THREE.ShaderMaterial({
      vertexShader: PAP_VERT,
      fragmentShader: PAP_FRAG,
      uniforms: { tPap: { value: papTex }, uTint: { value: new THREE.Vector3(0.86, 0.87, 0.82) } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const stemGeo = new THREE.CylinderGeometry(0.026, 0.034, STEM_L, 10, 30, true)
    stemGeo.translate(0, STEM_L / 2, 0)
    const stemMat = new THREE.ShaderMaterial({
      vertexShader: STEM_VERT,
      fragmentShader: STEM_FRAG,
      uniforms: {
        uBend: { value: new THREE.Vector2() },
        uLen: { value: STEM_L },
        uLow: { value: new THREE.Vector3(0.36, 0.46, 0.24) },
        uHigh: { value: new THREE.Vector3(0.55, 0.6, 0.36) },
      },
    })
    const recGeo = new THREE.SphereGeometry(R_REC, 24, 16)
    const recMat = new THREE.ShaderMaterial({ vertexShader: LIT_VERT, fragmentShader: REC_FRAG })
    const bractGeo = bractGeometry()
    const bractMat = new THREE.ShaderMaterial({ vertexShader: LIT_VERT, fragmentShader: BRACT_FRAG, side: THREE.DoubleSide })
    return { seedGeo, papGeo, fade, blur, papTex, seedMat, papMat, stemGeo, stemMat, recGeo, recMat, bractGeo, bractMat }
  }, [])

  useEffect(
    () => () => {
      for (const v of Object.values(res)) if ('dispose' in v && typeof v.dispose === 'function') v.dispose()
    },
    [res],
  )

  /* seed state */
  const st = useMemo(() => {
    const n = new Float32Array(N * 3) // outward normals (head-local)
    const q = [] as THREE.Quaternion[]
    const thr = new Float32Array(N)
    const state = new Uint8Array(N)
    const growT = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const y = 1 - 2 * ((i + 0.5) / (N / 0.95))
      const r = Math.sqrt(1 - y * y)
      const a = i * GOLDEN
      n[i * 3] = Math.cos(a) * r
      n[i * 3 + 1] = y
      n[i * 3 + 2] = Math.sin(a) * r
      const nv = new THREE.Vector3(n[i * 3], n[i * 3 + 1], n[i * 3 + 2])
      q.push(new THREE.Quaternion().setFromUnitVectors(UP, nv).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.random() * Math.PI * 2)))
      thr[i] = 0.18 + 0.82 * Math.pow(Math.random(), 0.8)
      state[i] = ATTACHED
      growT[i] = 1e9
    }
    // flyers
    const fp = new Float32Array(N * 3)
    const fv = new Float32Array(N * 3)
    const fa = new Float32Array(N * 3)
    const fspin = new Float32Array(N)
    const fspinR = new Float32Array(N)
    const fk = new Float32Array(N)
    const fage = new Float32Array(N)
    const fon = new Uint8Array(N)
    const flean = new Float32Array(N * 2)
    return { n, q, thr, state, growT, fp, fv, fa, fspin, fspinR, fk, fage, fon, flean }
  }, [])

  const seedRef = useRef<THREE.InstancedMesh>(null)
  const papRef = useRef<THREE.InstancedMesh>(null)
  const head = useRef<THREE.Group>(null)
  const stem = useRef<THREE.Mesh>(null)

  const tmp = useMemo(
    () => ({
      time: 0,
      bend: new THREE.Vector2(),
      bendV: new THREE.Vector2(),
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      pm: new THREE.Matrix4(),
      zero: new THREE.Matrix4().makeScale(0, 0, 0),
      v: new THREE.Vector3(),
      v2: new THREE.Vector3(),
      w: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      headPos: new THREE.Vector3(),
      headQ: new THREE.Quaternion(),
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      ndc: new THREE.Vector2(),
      ptrP: new THREE.Vector3(99, 99, 0),
      ptrDir: new THREE.Vector3(1, 0, 0),
      ptrLevel: 0,
      micLevel: 0,
      nextPuff: 3,
      nextGust: POSTER ? 1e9 : 9,
      posterPuff: POSTER,
      regrowAt: -1,
      regrowSeen: 0,
      lastStats: 0,
      camDist: 7,
      base: new THREE.Vector3(),
    }),
    [],
  )

  const detach = (i: number, dir: THREE.Vector3, strength: number) => {
    // find a free flyer slot (or recycle the oldest)
    let j = -1
    let oldest = -1
    let oldAge = -1
    for (let k = 0; k < N; k++) {
      if (!st.fon[k]) {
        j = k
        break
      }
      if (st.fage[k] > oldAge) {
        oldAge = st.fage[k]
        oldest = k
      }
    }
    if (j < 0) j = oldest
    const hm = head.current!.matrixWorld
    tmp.v.set(st.n[i * 3], st.n[i * 3 + 1], st.n[i * 3 + 2]).transformDirection(hm)
    tmp.w.copy(tmp.v).multiplyScalar(R_REC).add(tmp.headPos)
    st.fp[j * 3] = tmp.w.x
    st.fp[j * 3 + 1] = tmp.w.y
    st.fp[j * 3 + 2] = tmp.w.z
    // every seed leaves on its own heading: spread the release cone and speed
    const sp = strength * (0.3 + Math.random() * 1.0)
    const jx = (Math.random() - 0.5) * 0.9
    const jy = (Math.random() - 0.4) * 0.9
    const jz = (Math.random() - 0.5) * 1.4
    st.fv[j * 3] = (dir.x + jx) * sp + tmp.v.x * 0.45
    st.fv[j * 3 + 1] = (dir.y + jy) * sp + tmp.v.y * 0.45
    st.fv[j * 3 + 2] = (dir.z + jz) * sp + tmp.v.z * 0.45
    st.fa[j * 3] = tmp.v.x
    st.fa[j * 3 + 1] = tmp.v.y
    st.fa[j * 3 + 2] = tmp.v.z
    st.fspin[j] = Math.random() * 6.28
    st.fspinR[j] = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 2.2)
    st.fk[j] = 0.9 + Math.random() * 2.0
    // each parachute trims a little differently: a permanent lean
    const la = Math.random() * Math.PI * 2
    const lm = 0.15 + Math.random() * 0.4
    st.flean[j * 2] = Math.cos(la) * lm
    st.flean[j * 2 + 1] = Math.sin(la) * lm
    st.fage[j] = 0
    st.fon[j] = 1
    st.state[i] = EMPTY
    st.growT[i] = 1e9
  }

  useFrame((state, raw) => {
    const dt = Math.min(raw, 1 / 30)
    tmp.time += dt
    const t = tmp.time
    const cam = state.camera as THREE.PerspectiveCamera
    const { width, height } = size
    const aspect = width / height
    const now = performance.now()
    const mobile = width < 760

    /* camera + layout */
    const dist = 7 / Math.min(1, aspect * 1.25)
    tmp.camDist = dist
    cam.position.set(Math.sin(t * 0.07) * 0.25, 0.15 + Math.sin(t * 0.05) * 0.08, dist)
    cam.lookAt(0, 0, 0)
    const hx = POSTER || mobile ? 0 : 0.35
    const hy = POSTER ? 0.15 : mobile ? 0.95 : 0.35
    tmp.base.set(hx - 0.25, hy - STEM_L, 0)

    /* wind sources */
    const gust = ctl.gust.get() * ctl.gustS.current
    const gd = ctl.gustDir.current
    // pointer swipe → local impulse
    const p = ctl.ptr.current
    const pSpeed = Math.hypot(p.vx, p.vy)
    if (now - p.t < 90 && pSpeed > 260) {
      tmp.ray.setFromCamera(tmp.ndc.set(p.x, p.y), cam)
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.v)) {
        const s = Math.min(1.5, (pSpeed - 260) / 1500)
        if (s > tmp.ptrLevel * 0.7) {
          tmp.ptrP.copy(tmp.v)
          tmp.ptrDir.set(p.vx, -p.vy, -0.15 * pSpeed).normalize()
        }
        tmp.ptrLevel = Math.max(tmp.ptrLevel, s)
      }
    }
    tmp.ptrLevel *= Math.exp(-dt * 3.2)
    // microphone
    const mic = ctl.mic.current
    if (mic.an && mic.buf) {
      mic.an.getFloatTimeDomainData(mic.buf)
      let sum = 0
      for (let k = 0; k < mic.buf.length; k++) sum += mic.buf[k] * mic.buf[k]
      const rms = Math.sqrt(sum / mic.buf.length)
      mic.level += (rms - mic.level) * (rms > mic.level ? 0.5 : 0.08)
      if (ctl.micBar.current) ctl.micBar.current.style.transform = `scaleX(${Math.min(1, mic.level * 6).toFixed(3)})`
    }
    const micWind = mic.an ? THREE.MathUtils.clamp((mic.level - 0.035) * 9, 0, 1.6) : 0
    tmp.micLevel = micWind
    if (micWind > 0.05) ctl.lastUser.current = now

    /* stem: damped spring pushed by the wind */
    const breezeX = 0.5 + Math.sin(t * 0.37) * 0.35 + Math.sin(t * 1.13) * 0.15
    const fx = breezeX * 0.08 + gust * gd.x * 0.9 + micWind * 0.55 + tmp.ptrLevel * tmp.ptrDir.x * 0.7 * Math.exp(-tmp.ptrP.distanceToSquared(tmp.headPos) * 0.4)
    const fz = Math.sin(t * 0.29 + 1) * 0.05 + gust * gd.z * 0.6 - micWind * 0.35
    tmp.bendV.x += (-tmp.bend.x * 9 - tmp.bendV.x * 2.2 + fx * 9) * dt
    tmp.bendV.y += (-tmp.bend.y * 9 - tmp.bendV.y * 2.2 + fz * 9) * dt
    tmp.bend.x += tmp.bendV.x * dt
    tmp.bend.y += tmp.bendV.y * dt
    res.stemMat.uniforms.uBend.value.copy(tmp.bend)
    if (stem.current) stem.current.position.copy(tmp.base)
    const h = head.current!
    const L = STEM_L
    tmp.headPos.set(tmp.base.x + tmp.bend.x, tmp.base.y + L - Math.abs(tmp.bend.x) * 0.12, tmp.base.z + tmp.bend.y)
    h.position.copy(tmp.headPos)
    h.rotation.set(Math.atan((2 * tmp.bend.y) / L), 0, -Math.atan((2 * tmp.bend.x) / L))
    h.updateMatrixWorld()
    tmp.headQ.setFromRotationMatrix(h.matrixWorld)

    /* regrow requests */
    if (ctl.regrow.current !== tmp.regrowSeen) {
      tmp.regrowSeen = ctl.regrow.current
      tmp.regrowAt = t
    }
    let attached = 0
    let growing = 0
    for (let i = 0; i < N; i++) {
      if (st.state[i] === ATTACHED) attached++
      else if (st.state[i] === GROWING) growing++
    }
    if (tmp.regrowAt < 0 && attached + growing < N * 0.12) tmp.regrowAt = t + 2.5
    if (tmp.regrowAt >= 0 && t >= tmp.regrowAt) {
      tmp.regrowAt = -1
      // spiral order from the crown down: the Fibonacci index is already that order
      for (let i = 0; i < N; i++) if (st.state[i] === EMPTY) {
        st.state[i] = GROWING
        st.growT[i] = t + (i / N) * 2.8 + Math.random() * 0.12
      }
    }

    /* poster: a handful of seeds already aloft beside the head */
    if (tmp.posterPuff && t > 0.4) {
      tmp.posterPuff = false
      tmp.v2.set(1, 0.6, 0.1).normalize()
      for (let c = 0, i = 7; c < 14 && i < N; i += 17, c++) detach(i, tmp.v2, 0.55)
    }

    /* auto-loop: breeze puffs + periodic big gust when idle */
    const idle = now - ctl.lastUser.current > 6000
    if (t > tmp.nextPuff) {
      tmp.nextPuff = t + 2.5 + Math.random() * 3
      if (attached > N * 0.3 && !POSTER) {
        const k = 1 + Math.floor(Math.random() * 2.4)
        tmp.v2.set(1, 0.3, (Math.random() - 0.5) * 0.6).normalize()
        for (let c = 0; c < k; c++) {
          // the loosest seeds on the windward side go first
          let best = -1
          let bestS = 1e9
          for (let tries = 0; tries < 24; tries++) {
            const i = Math.floor(Math.random() * N)
            if (st.state[i] !== ATTACHED) continue
            const sc = st.thr[i] - (-st.n[i * 3]) * 0.2
            if (sc < bestS) {
              bestS = sc
              best = i
            }
          }
          if (best >= 0) detach(best, tmp.v2, 0.6)
        }
      }
    }
    if (idle && t > tmp.nextGust && !mic.an) {
      tmp.nextGust = t + 14 + Math.random() * 3
      // what is left is the stubborn seeds: blow harder the balder the head
      if (attached > N * 0.12) ctl.blow(0.8 + (1 - attached / N) * 0.7 + Math.random() * 0.2)
    }
    if (!idle) tmp.nextGust = Math.max(tmp.nextGust, t + 8)

    /* head seeds: detach test + matrices */
    const seeds = seedRef.current!
    const paps = papRef.current!
    const fadeA = res.fade.array as Float32Array
    const blurA = res.blur.array as Float32Array
    const shake = Math.min(1, gust + micWind * 0.6 + tmp.ptrLevel * 0.5)
    for (let i = 0; i < N; i++) {
      const s = st.state[i]
      if (s === EMPTY || (s === GROWING && t < st.growT[i])) {
        seeds.setMatrixAt(i, tmp.zero)
        paps.setMatrixAt(i, tmp.zero)
        fadeA[i] = 0
        continue
      }
      let g = 1
      let open = 1
      if (s === GROWING) {
        const k = (t - st.growT[i]) / 0.9
        g = k >= 1 ? 1 : Math.max(0.001, easeOutBack(Math.min(1, k)))
        open = THREE.MathUtils.smoothstep(k, 0.35, 1.25)
        if (k >= 1.3) st.state[i] = ATTACHED
      }
      // world-space direction of this seed
      tmp.v.set(st.n[i * 3], st.n[i * 3 + 1], st.n[i * 3 + 2])
      tmp.w.copy(tmp.v).applyQuaternion(tmp.headQ)
      if (s === ATTACHED) {
        // windward seeds feel the wind first; a swipe only reaches seeds near it
        let eff = 0
        if (gust > 0.01) eff += gust * (0.65 + 0.45 * -tmp.w.dot(gd))
        if (micWind > 0.01) eff += micWind * (0.65 + 0.45 * tmp.w.z)
        if (tmp.ptrLevel > 0.02) {
          tmp.v2.copy(tmp.v).multiplyScalar(PAP_Y).applyQuaternion(tmp.headQ).add(tmp.headPos)
          const d2 = tmp.v2.distanceToSquared(tmp.ptrP)
          eff += tmp.ptrLevel * Math.exp(-d2 * 2.2) * (0.7 + 0.5 * -tmp.w.dot(tmp.ptrDir)) * 1.4
        }
        if (eff > st.thr[i] && Math.random() < (eff - st.thr[i]) * dt * 4 + 0.006) {
          const dir = tmp.ptrLevel * Math.exp(-tmp.ptrP.distanceToSquared(tmp.headPos)) > gust + micWind ? tmp.ptrDir : micWind > gust ? tmp.v2.set(0.55, 0.35, -1).normalize() : gd
          detach(i, dir, 0.7 + eff * 0.9)
          seeds.setMatrixAt(i, tmp.zero)
          paps.setMatrixAt(i, tmp.zero)
          fadeA[i] = 0
          continue
        }
      }
      // local seed matrix (+ a little flutter under wind)
      tmp.q.copy(st.q[i])
      if (shake > 0.01) {
        tmp.q2.setFromAxisAngle(tmp.v2.set(Math.sin(i * 1.7), 0, Math.cos(i * 2.3)).normalize(), Math.sin(t * 17 + i) * 0.06 * shake)
        tmp.q.premultiply(tmp.q2)
      }
      tmp.s.setScalar(g)
      tmp.m.compose(tmp.v.multiplyScalar(R_REC * 0.92), tmp.q, tmp.s)
      tmp.m.premultiply(h.matrixWorld)
      seeds.setMatrixAt(i, tmp.m)
      const ob = 0.2 + 0.8 * open
      tmp.pm.makeScale(ob, 0.4 + 0.6 * open, ob)
      tmp.pm.setPosition(0, PAP_Y, 0)
      tmp.m2.multiplyMatrices(tmp.m, tmp.pm)
      paps.setMatrixAt(i, tmp.m2)
      fadeA[i] = Math.min(1, g * 1.4)
      blurA[i] = 0
    }

    /* flyers: drag-dominated flight with a parachute that rights itself */
    const breeze = 0.32 + Math.sin(t * 0.21) * 0.1
    const tv = t
    for (let j = 0; j < N; j++) {
      const idx = N + j
      if (!st.fon[j]) {
        seeds.setMatrixAt(idx, tmp.zero)
        paps.setMatrixAt(idx, tmp.zero)
        fadeA[idx] = 0
        continue
      }
      const j3 = j * 3
      const x = st.fp[j3]
      const y = st.fp[j3 + 1]
      const z = st.fp[j3 + 2]
      // divergence-free turbulence (each component ignores its own axis)
      // (+ a per-seed phase so neighbours decorrelate instead of flying as a clump)
      const o = j * 2.399
      const tx = Math.sin(1.3 * y + 0.7 * tv + 1.7 + o) + 0.5 * Math.sin(2.9 * z - 0.5 * tv + o * 0.7)
      const ty = Math.sin(1.1 * z + 0.6 * tv + 0.3 + o) + 0.5 * Math.sin(2.7 * x + 0.8 * tv - o)
      const tz = Math.sin(1.2 * x - 0.5 * tv + 2.1 + o) + 0.5 * Math.sin(2.3 * y + 0.4 * tv + o * 1.3)
      let wx = breeze + tx * 0.36 + gust * gd.x * 1.25 + micWind * 0.8
      let wy = 0.05 + ty * 0.36 + gust * gd.y * 1.25 + micWind * 0.4
      let wz = tz * 0.3 + gust * gd.z * 1.25 - micWind * 0.9
      if (tmp.ptrLevel > 0.02) {
        const dx = x - tmp.ptrP.x
        const dy = y - tmp.ptrP.y
        const fall = Math.exp(-(dx * dx + dy * dy) * 0.9) * tmp.ptrLevel * 3
        wx += tmp.ptrDir.x * fall
        wy += tmp.ptrDir.y * fall
        wz += tmp.ptrDir.z * fall
      }
      const k = st.fk[j]
      st.fv[j3] += ((wx - st.fv[j3]) * k) * dt
      st.fv[j3 + 1] += ((wy - st.fv[j3 + 1]) * k - 0.55) * dt
      st.fv[j3 + 2] += ((wz - st.fv[j3 + 2]) * k) * dt
      st.fp[j3] += st.fv[j3] * dt
      st.fp[j3 + 1] += st.fv[j3 + 1] * dt
      st.fp[j3 + 2] += st.fv[j3 + 2] * dt
      st.fage[j] += dt
      // orientation: pappus turns up and leans into the relative wind, with a little wobble
      tmp.v.set((wx - st.fv[j3]) * 0.6 + st.flean[j * 2] + Math.sin(tv * (1.6 + (j % 7) * 0.21) + j) * 0.3, 1, (wz - st.fv[j3 + 2]) * 0.6 + st.flean[j * 2 + 1] + Math.cos(tv * (1.3 + (j % 5) * 0.27) + j) * 0.3).normalize()
      tmp.w.set(st.fa[j3], st.fa[j3 + 1], st.fa[j3 + 2])
      tmp.w.lerp(tmp.v, 1 - Math.exp(-dt * 0.8)).normalize()
      st.fa[j3] = tmp.w.x
      st.fa[j3 + 1] = tmp.w.y
      st.fa[j3 + 2] = tmp.w.z
      st.fspin[j] += st.fspinR[j] * dt
      tmp.q.setFromUnitVectors(UP, tmp.w)
      tmp.q2.setFromAxisAngle(UP, st.fspin[j])
      tmp.q.multiply(tmp.q2)
      tmp.v.set(st.fp[j3], st.fp[j3 + 1], st.fp[j3 + 2])
      // retire seeds that left the frame
      const viewH = Math.tan(THREE.MathUtils.degToRad(17.5)) * (dist - tmp.v.z)
      const viewW = viewH * aspect
      const out = Math.abs(tmp.v.x) > viewW + 0.8 || tmp.v.y > viewH + 0.8 || tmp.v.y < -viewH - 0.8 || tmp.v.z > dist - 0.6 || st.fage[j] > 22
      if (out) {
        st.fon[j] = 0
        seeds.setMatrixAt(idx, tmp.zero)
        paps.setMatrixAt(idx, tmp.zero)
        fadeA[idx] = 0
        continue
      }
      tmp.s.setScalar(1)
      tmp.m.compose(tmp.v, tmp.q, tmp.s)
      seeds.setMatrixAt(idx, tmp.m)
      const breathe = 1 + Math.sin(tv * 3 + j) * 0.04
      // aloft the pappus opens into a deeper cup, so side-on it still reads as an umbrella
      const cup = Math.min(1, st.fage[j] * 1.5)
      tmp.pm.makeScale(breathe, 1 + cup * 1.6, breathe)
      tmp.pm.setPosition(0, PAP_Y, 0)
      tmp.m2.multiplyMatrices(tmp.m, tmp.pm)
      paps.setMatrixAt(idx, tmp.m2)
      fadeA[idx] = Math.min(1, (22 - st.fage[j]) / 2)
      // depth of field: distance from the focus plane (the head)
      const dz = Math.abs(tmp.v.z)
      blurA[idx] = THREE.MathUtils.clamp((dz - 0.4) * 0.45, 0, 1)
    }
    seeds.instanceMatrix.needsUpdate = true
    paps.instanceMatrix.needsUpdate = true
    res.fade.needsUpdate = true
    res.blur.needsUpdate = true

    /* overlay stats */
    if (now - tmp.lastStats > 200) {
      tmp.lastStats = now
      let flying = 0
      for (let j = 0; j < N; j++) flying += st.fon[j]
      const phase = growing > 0 ? 2 : attached < N * 0.96 || flying > 6 ? 1 : 0
      ctl.onStats(attached, phase)
    }
  })

  return (
    <>
      <mesh ref={stem} geometry={res.stemGeo} material={res.stemMat} frustumCulled={false} />
      <group ref={head}>
        <mesh geometry={res.recGeo} material={res.recMat} />
        <mesh geometry={res.bractGeo} material={res.bractMat} />
      </group>
      <instancedMesh ref={seedRef} args={[res.seedGeo, res.seedMat, TOTAL]} frustumCulled={false} />
      <instancedMesh ref={papRef} args={[res.papGeo, res.papMat, TOTAL]} frustumCulled={false} renderOrder={2} />
    </>
  )
}

/* ------------------------------------------------------------------ backdrop (soft, out-of-focus meadow) */

function Backdrop() {
  const blades = useMemo(() => {
    let s = 17
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    let d = ''
    for (let x = -20; x < 1620; x += 6 + r() * 14) {
      const h = 60 + r() * 170
      const lean = (r() - 0.5) * 60
      const w = 3 + r() * 6
      d += `M${(x - w).toFixed(1)} 300 Q${(x + lean * 0.3).toFixed(1)} ${(300 - h * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(300 - h).toFixed(1)} Q${(x + lean * 0.3 + w).toFixed(1)} ${(300 - h * 0.6).toFixed(1)} ${(x + w).toFixed(1)} 300 Z `
    }
    return d
  }, [])
  return (
    <>
      <div className="dl-bokeh" aria-hidden />
      <svg className="dl-grass" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <path d={blades} fill="#7d8f5a" opacity={0.5} />
      </svg>
    </>
  )
}

/* ------------------------------------------------------------------ page */

const PHASES = [
  { zh: '绒球', en: 'Seed head', aside: `${N} seeds · 137.5°` },
  { zh: '随风飘散', en: 'Dispersal', aside: 'drag ≫ gravity' },
  { zh: '重新长出', en: 'Regrowth', aside: 'spiral, crown first' },
]

type MicState = 'off' | 'asking' | 'on' | 'denied'

export default function Dandelion() {
  const gust = useMotionValue(0)
  const gustDir = useRef(new THREE.Vector3(1, 0.3, -0.3).normalize())
  const gustS = useRef(1)
  const ptr = useRef<Ptr>({ x: 0, y: 0, vx: 0, vy: 0, t: -1e9 })
  const regrow = useRef(0)
  const mic = useRef<{ an: AnalyserNode | null; buf: Float32Array<ArrayBuffer> | null; level: number }>({ an: null, buf: null, level: 0 })
  const micBar = useRef<HTMLElement | null>(null)
  const lastUser = useRef(-1e9)
  const [stats, setStats] = useState({ attached: N, phase: 0 })
  const [micState, setMicState] = useState<MicState>('off')
  const [toast, setToast] = useState<string | null>(null)
  const stream = useRef<{ s: MediaStream; ctx: AudioContext } | null>(null)

  const blow = useCallback(
    (s: number) => {
      gustDir.current.set(1, 0.45 + Math.random() * 0.2, (Math.random() - 0.5) * 0.8).normalize()
      gustS.current = s
      animate(gust, [0, 1, 0.7, 0], { duration: 2.2, times: [0, 0.18, 0.5, 1], ease: 'easeInOut' })
    },
    [gust],
  )

  const onStats = useCallback((attached: number, phase: number) => {
    setStats((o) => (o.attached === attached && o.phase === phase ? o : { attached, phase }))
  }, [])

  const ctl = useMemo<Ctl>(() => ({ gust, gustDir, gustS, ptr, regrow, mic, micBar, blow, lastUser, onStats }), [gust, blow, onStats])

  const stopMic = useCallback(() => {
    stream.current?.s.getTracks().forEach((t) => t.stop())
    stream.current?.ctx.close()
    stream.current = null
    mic.current.an = null
    mic.current.level = 0
  }, [])
  useEffect(() => stopMic, [stopMic])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(id)
  }, [toast])

  const toggleMic = async () => {
    if (micState === 'on') {
      stopMic()
      setMicState('off')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState('denied')
      setToast('这个浏览器不支持麦克风 · 点「吹一口」试试')
      return
    }
    setMicState('asking')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(s)
      const an = ctx.createAnalyser()
      an.fftSize = 1024
      src.connect(an)
      stream.current = { s, ctx }
      mic.current.an = an
      mic.current.buf = new Float32Array(an.fftSize)
      setMicState('on')
      setToast('对着麦克风吹气 · 越用力种子飞得越多')
    } catch {
      setMicState('denied')
      setToast('没有拿到麦克风权限 · 点「吹一口」也一样')
    }
  }

  const onUi = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest?.('.dock')
  const ph = PHASES[stats.phase]

  return (
    <div
      className="stage dl-stage"
      style={{ touchAction: 'none' }}
      onPointerMove={(e) => {
        if (onUi(e)) return
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = ((e.clientX - r.left) / r.width) * 2 - 1
        const y = -((e.clientY - r.top) / r.height) * 2 + 1
        const P = ptr.current
        const now = performance.now()
        const dtp = Math.max(8, now - P.t) / 1000
        if (now - P.t < 150) {
          // px/s, smoothed
          P.vx = P.vx * 0.4 + (((x - P.x) * r.width) / 2 / dtp) * 0.6
          P.vy = P.vy * 0.4 + ((-(y - P.y) * r.height) / 2 / dtp) * 0.6
        } else {
          P.vx = 0
          P.vy = 0
        }
        P.x = x
        P.y = y
        P.t = now
        lastUser.current = now
      }}
    >
      <style>{`
        .dl-stage { background:
          radial-gradient(46% 52% at 60% 40%, #aebd98 0%, rgba(174,189,152,0.55) 45%, rgba(174,189,152,0) 100%),
          radial-gradient(120% 90% at 50% 110%, #c3cdb1 0%, #dbe2d1 45%, #eef1ea 80%); }
        .dl-bokeh { position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(circle at 12% 30%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 7%),
            radial-gradient(circle at 86% 22%, rgba(255,255,255,0.45) 0, rgba(255,255,255,0) 9%),
            radial-gradient(circle at 78% 70%, rgba(240,214,92,0.55) 0, rgba(240,214,92,0) 4.5%),
            radial-gradient(circle at 22% 78%, rgba(240,214,92,0.45) 0, rgba(240,214,92,0) 3.5%),
            radial-gradient(circle at 93% 84%, rgba(240,214,92,0.4) 0, rgba(240,214,92,0) 3%),
            radial-gradient(circle at 40% 18%, rgba(255,255,255,0.35) 0, rgba(255,255,255,0) 6%);
          filter: blur(6px); }
        .dl-grass { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: min(260px, 30vh); pointer-events: none; filter: blur(5px); }
        .dl-stage canvas { position: relative; }
        .dl-stage .big-label h1 { color: #2d3524; }
        .dl-stage .big-label-meta, .dl-stage .big-label p { color: #56604a; }
        .dl-mic { display: inline-flex; align-items: center; gap: 8px; }
        .dl-meter { position: relative; display: inline-block; width: 26px; height: 4px; border-radius: 2px; overflow: hidden;
          background: color-mix(in srgb, var(--fg) 14%, transparent); }
        .dl-meter b { position: absolute; inset: 0; background: #7d8f5a; transform-origin: left center; transform: scaleX(0); }
        .dl-mic i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .35; }
        .dl-mic[data-state='on'] i { opacity: 1; background: #d2553a; }
        .dl-toast { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); padding: 9px 16px; border-radius: 999px;
          font: 500 13px/1 var(--sans); color: var(--fg); background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); white-space: nowrap; pointer-events: none; }
        @media (max-width: 760px) {
          .dl-stage .dock .seg { padding: 0 11px; }
          .dl-meter { width: 18px; }
        }
      `}</style>

      <Backdrop />
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.15, 7], fov: 35, near: 0.1, far: 60 }} gl={{ antialias: true, alpha: true }}>
        <Plant ctl={ctl} />
      </Canvas>

      <div className="overlay">
        <BigLabel id={String(stats.phase)} meta={`${stats.attached} / ${N} 颗种子还在`} title={ph.zh} sub={ph.en} aside={ph.aside} />

        <AnimatePresence>
          {toast && (
            <motion.p
              key={toast}
              className="dl-toast"
              initial={{ opacity: 0, y: 8, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 4, x: '-50%' }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {toast}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="dock">
          <button
            className="seg"
            onClick={() => {
              lastUser.current = performance.now()
              blow(1.15)
            }}
          >
            <span>吹一口</span>
          </button>
          <button className="seg dl-mic" data-state={micState} aria-pressed={micState === 'on'} onClick={toggleMic}>
            {micState === 'on' && <span className="seg-bg" />}
            <span className="dl-mic">
              <i />
              {micState === 'asking' ? '请求中…' : micState === 'denied' ? '麦克风不可用' : '麦克风'}
              {micState === 'on' && (
                <span className="dl-meter">
                  <b ref={(el) => void (micBar.current = el)} />
                </span>
              )}
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              lastUser.current = performance.now()
              regrow.current++
            }}
          >
            <span>重新长出</span>
          </button>
        </div>
        <p className="hint">
          划过绒球扬起一阵风
          <br />
          静置时微风会带走几颗
        </p>
      </div>
    </div>
  )
}
