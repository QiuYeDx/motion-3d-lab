import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { useScreenWarmup } from '../iso/isoWarmup'

/* ------------------------------------------------------------------ config */

const PHONE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const N = PHONE ? 1500 : 2600
/** firefly volume (world units) */
const B = PHONE ? { x0: -5.6, x1: 5.6, y0: 0.35, y1: 5.6, z0: -7, z1: 2.6 } : { x0: -12, x1: 12, y0: 0.3, y1: 5.4, z0: -7.5, z1: 2.8 }
/** spatial hash for the Kuramoto neighbourhood */
const CELL = 1.25
const GX = Math.ceil((B.x1 - B.x0) / CELL) + 1
const GY = Math.ceil((B.y1 - B.y0) / CELL) + 1
const GZ = Math.ceil((B.z1 - B.z0) / CELL) + 1
const GN = GX * GY * GZ

const OMEGA0 = (Math.PI * 2) / 1.55
const TAU = Math.PI * 2
/** [local, global] coupling per level: neighbours dominate, a faint far-sight term lets the whole field lock eventually */
const K_LEVELS = [0, 0.32, 1.7]
const KG_LEVELS = [0, 0, 0.24]

/** light map (top-down x/z) that lets the flashes light grass, ground and fog */
const LW = 56
const LH = 24
const L = { x0: -17, x1: 17, z0: -11, z1: 6 }

const BG = '#05090a'
const GLOW: [number, number, number] = [0.62, 0.95, 0.24]
const CORE: [number, number, number] = [0.96, 1.0, 0.78]

/* ------------------------------------------------------------------ helpers */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** flash envelope over the oscillator phase: sharp rise just before 2π, ~0.3 s afterglow */
function flash(theta: number) {
  let p = theta % TAU
  if (p < 0) p += TAU
  if (p < 1.8) return Math.exp(-p * 2.5)
  const rise = TAU - 0.16
  if (p > rise) {
    const k = (p - rise) / 0.16
    return k * k
  }
  return 0
}

/** white-on-transparent silhouette masks drawn on a canvas */
function forestMask(w: number, h: number, seed: number, o: { trunks: number; wMin: number; wMax: number; canopy: number; ground: number; lean: number }) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const r = rng(seed)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  // canopy mass along the top edge
  for (let x = -40; x < w + 40; x += 10 + r() * 26) {
    const rr = h * (0.05 + r() * 0.09)
    const cy = h * o.canopy * (0.15 + r() * 0.85)
    ctx.beginPath()
    ctx.ellipse(x, cy, rr * (1 + r() * 0.8), rr, 0, 0, TAU)
    ctx.fill()
  }
  ctx.fillRect(0, 0, w, h * o.canopy * 0.35)
  // trunks
  for (let k = 0; k < o.trunks; k++) {
    const x = (k + 0.15 + r() * 0.7) * (w / o.trunks)
    const tw = o.wMin + r() * (o.wMax - o.wMin)
    const lean = (r() - 0.5) * o.lean * tw
    const top = h * o.canopy * (0.3 + r() * 0.6)
    const base = h * (1 - o.ground * 0.6)
    ctx.beginPath()
    ctx.moveTo(x - tw * 0.5 - tw * 0.45, base)
    ctx.quadraticCurveTo(x - tw * 0.52, base - tw * 0.6, x - tw * 0.5, base - tw * 1.4)
    ctx.lineTo(x - tw * 0.32 + lean, top)
    ctx.lineTo(x + tw * 0.32 + lean, top)
    ctx.lineTo(x + tw * 0.5, base - tw * 1.4)
    ctx.quadraticCurveTo(x + tw * 0.52, base - tw * 0.6, x + tw * 0.5 + tw * 0.5, base)
    ctx.closePath()
    ctx.fill()
    // a few branches reaching into the canopy
    const nb = 1 + Math.floor(r() * 3)
    for (let b = 0; b < nb; b++) {
      const by = top + (base - top) * (0.05 + r() * 0.4)
      const side = r() < 0.5 ? -1 : 1
      const len = tw * (2 + r() * 4)
      ctx.lineWidth = Math.max(1.5, tw * (0.12 + r() * 0.12))
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x + lean * ((by - base) / (top - base)), by)
      ctx.quadraticCurveTo(x + side * len * 0.5, by - len * 0.2, x + side * len, by - len * (0.5 + r() * 0.6))
      ctx.stroke()
    }
  }
  // ground strip
  if (o.ground > 0) {
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, h * (1 - o.ground) + Math.sin(x * 0.01) * h * o.ground * 0.25 + r() * 3)
    ctx.lineTo(w, h)
    ctx.closePath()
    ctx.fill()
  }
  return tex(cv)
}

function grassMask(w: number, h: number, seed: number, density: number, tall: number) {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d')!
  const r = rng(seed)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, h - 6, w, 6)
  for (let x = 0; x < w; x += density * (0.3 + r())) {
    const clump = 0.55 + 0.45 * Math.sin(x * 0.006 + 1.3) * Math.sin(x * 0.017)
    const bh = h * (0.18 + r() * 0.62 * (0.5 + clump * 0.5)) * tall
    const lean = (r() - 0.45) * bh * 0.45
    const bw = 1.4 + r() * 3.2
    ctx.beginPath()
    ctx.moveTo(x - bw, h)
    ctx.quadraticCurveTo(x + lean * 0.25, h - bh * 0.62, x + lean, h - bh)
    ctx.quadraticCurveTo(x + lean * 0.25 + bw, h - bh * 0.62, x + bw, h)
    ctx.closePath()
    ctx.fill()
    if (r() < 0.05) {
      // a seed stalk
      const sh = bh * 1.25
      ctx.lineWidth = 1.4
      ctx.strokeStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.quadraticCurveTo(x + lean * 0.2, h - sh * 0.6, x + lean * 0.8, h - sh)
      ctx.stroke()
      ctx.beginPath()
      ctx.ellipse(x + lean * 0.8, h - sh, 3, 9, lean * 0.004, 0, TAU)
      ctx.fill()
    }
  }
  return tex(cv)
}

function tex(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

/* ------------------------------------------------------------------ GLSL */

const PLANE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const LIGHT = /* glsl */ `
uniform sampler2D tLight;
uniform vec4 uLRect; // x0, z0, 1/w, 1/h
float lightAt(vec2 xz) {
  vec2 uv = (xz - uLRect.xy) * uLRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(tLight, uv).r;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
`

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop, uHorizon, uMoonCol;
uniform vec2 uMoon;
varying vec3 vW;
${LIGHT}
void main() {
  float t = clamp((vW.y + 2.0) / 30.0, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.7));
  float d = length(vW.xy - uMoon);
  col += uMoonCol * (0.20 * exp(-d * 0.16) + 0.10 * exp(-d * 0.55));
  float disc = smoothstep(1.55, 1.4, d);
  col = mix(col, vec3(0.86, 0.92, 0.9), disc);
  // a few faint stars
  vec2 g = floor(vW.xy * 1.6);
  float s = hash12(g);
  float star = step(0.985, s) * smoothstep(0.35, 0.0, length(fract(vW.xy * 1.6) - 0.5)) * t;
  col += vec3(0.5, 0.6, 0.62) * star * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`

const SIL_FRAG = /* glsl */ `
uniform sampler2D tMask;
uniform vec3 uColor, uGlow, uRim;
uniform float uLightK, uLightZ, uSway, uTime, uGust, uGustX;
varying vec2 vUv;
varying vec3 vW;
${LIGHT}
void main() {
  float h = vUv.y;
  vec2 uv = vUv;
  float sway = sin(uTime * 1.1 + vW.x * 0.9) * 0.6 + sin(uTime * 2.3 + vW.x * 2.1) * 0.25;
  float gust = uGust * exp(-pow((vW.x - uGustX) / 5.0, 2.0));
  uv.x += (sway * 0.0016 + gust * 0.01) * h * h * uSway;
  float a = texture2D(tMask, uv).a;
  if (a < 0.01) discard;
  float l = lightAt(vec2(vW.x, uLightZ));
  vec3 col = uColor + uRim * smoothstep(0.0, 1.0, h);
  col += uGlow * l * uLightK * (0.25 + 0.75 * h);
  gl_FragColor = vec4(col, a);
}
`

const GROUND_FRAG = /* glsl */ `
uniform vec3 uColor, uGlow, uFar;
uniform float uLightK;
varying vec3 vW;
${LIGHT}
void main() {
  float l = lightAt(vW.xz);
  float far = smoothstep(2.0, -11.0, vW.z);
  vec3 col = mix(uColor, uFar, far);
  col *= 0.8 + 0.4 * vnoise(vW.xz * 1.7);
  col += uGlow * l * uLightK;
  gl_FragColor = vec4(col, 1.0);
}
`

const FOG_FRAG = /* glsl */ `
uniform vec3 uColor, uGlow;
uniform float uAlpha, uLightK, uTime, uTop, uLightZ;
varying vec3 vW;
${LIGHT}
void main() {
  float band = smoothstep(uTop, uTop * 0.15, vW.y) * smoothstep(-0.9, 0.2, vW.y);
  vec2 p = vec2(vW.x * 0.18 + uTime * 0.035, vW.y * 0.5);
  float n = vnoise(p) * 0.6 + vnoise(p * 2.3 - uTime * 0.05) * 0.4;
  float a = band * (0.35 + 0.65 * n) * uAlpha;
  float l = lightAt(vec2(vW.x, uLightZ));
  vec3 col = uColor + uGlow * l * uLightK;
  gl_FragColor = vec4(col, a * (1.0 + l * uLightK * 1.6));
}
`

const FF_VERT = /* glsl */ `
attribute float aB;
uniform float uSize, uPR, uFocus;
varying float vB;
varying float vCoc;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float coc = clamp(abs(dist - uFocus) * 0.085, 0.0, 1.0);
  vCoc = coc;
  vB = aB;
  gl_PointSize = uSize * uPR * (0.12 + aB * 0.95 + coc * 0.22) / dist;
}
`

const FF_FRAG = /* glsl */ `
uniform vec3 uGlow, uCore;
varying float vB;
varying float vCoc;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float k = mix(170.0, 14.0, vCoc);
  float core = exp(-d * d * k);
  float halo = (exp(-d * 6.0) * 0.55 + exp(-d * 2.2) * 0.12) * (1.0 - d);
  // between flashes a faint ember stays visible so the drifting swarm still reads
  float ember = exp(-d * d * mix(60.0, 9.0, vCoc)) * 0.22;
  float I = vB * (core * 1.6 + halo) + ember * (1.0 - vB);
  I *= mix(1.0, 0.6, vCoc);
  vec3 col = mix(uGlow, uCore, clamp(core * vB * 1.3, 0.0, 1.0));
  gl_FragColor = vec4(col * I, 1.0);
}
`

const LANTERN_FRAG = /* glsl */ `
uniform float uI;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 140.0);
  float halo = (exp(-d * 7.0) * 0.9 + exp(-d * 2.6) * 0.3) * (1.0 - d);
  vec3 col = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.96, 0.84), clamp(core * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (core * 1.8 + halo) * uI, 1.0);
}
`

/* ------------------------------------------------------------------ sim */

type Ctl = {
  k: MotionValue<number>
  kg: MotionValue<number>
  ptr: React.MutableRefObject<{ x: number; y: number; vx: number; vy: number; t: number }>
  clicks: React.MutableRefObject<{ x: number; y: number }[]>
  reset: React.MutableRefObject<number>
  meter: React.MutableRefObject<{ value: HTMLSpanElement | null; spark: HTMLCanvasElement | null; pulse: HTMLElement | null }>
  onState: (s: number) => void
}

const v3 = (c: [number, number, number]) => new THREE.Vector3(...c)

function Field({ ctl }: { ctl: Ctl }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const gl = useThree((s) => s.gl)
  // shaders link in the background (KHR_parallel_shader_compile); the canvas stays clear until they are ready
  useScreenWarmup()
  const texQ = useRef(0)

  /* ---------- simulation state */
  const sim = useMemo(() => {
    const r = Math.random
    const pos = new Float32Array(N * 3)
    const vel = new Float32Array(N * 3)
    const th = new Float32Array(N)
    const om = new Float32Array(N)
    const yaw = new Float32Array(N)
    const pitch = new Float32Array(N)
    const speed = new Float32Array(N)
    const bright = new Float32Array(N)
    const cs = new Float32Array(N)
    const sn = new Float32Array(N)
    const cell = new Int32Array(N)
    for (let i = 0; i < N; i++) {
      // denser near the ground and toward the clearing centre
      const x = B.x0 + (B.x1 - B.x0) * (0.5 + (r() - 0.5) * (0.6 + 0.4 * r()))
      pos[i * 3] = x
      pos[i * 3 + 1] = B.y0 + (B.y1 - B.y0) * Math.pow(r(), 1.5)
      pos[i * 3 + 2] = B.z0 + (B.z1 - B.z0) * r()
      yaw[i] = r() * TAU
      pitch[i] = (r() - 0.5) * 0.6
      speed[i] = 0.18 + r() * 0.32
      // narrow spread of natural frequencies (Gaussian-ish)
      const g = (r() + r() + r() - 1.5) * 1.15
      om[i] = OMEGA0 * (1 + 0.045 * g)
      th[i] = POSTER ? x * (TAU / 13) + (r() - 0.5) * 0.5 : r() * TAU
    }
    const C = new Float32Array(GN)
    const S = new Float32Array(GN)
    const Cn = new Float32Array(GN)
    const bufA = new Float32Array(GN)
    const bufB = new Float32Array(GN)
    const BC = new Float32Array(GN)
    const BS = new Float32Array(GN)
    const BN = new Float32Array(GN)
    const lAcc = new Float32Array(LW * LH)
    const lTmp = new Float32Array(LW * LH)
    const lData = new Uint8Array(LW * LH)
    const lightTex = new THREE.DataTexture(lData, LW, LH, THREE.RedFormat, THREE.UnsignedByteType)
    lightTex.minFilter = THREE.LinearFilter
    lightTex.magFilter = THREE.LinearFilter
    lightTex.needsUpdate = true
    return { pos, vel, th, om, yaw, pitch, speed, bright, cs, sn, cell, C, S, Cn, bufA, bufB, BC, BS, BN, lAcc, lTmp, lData, lightTex }
  }, [])

  /* ---------- materials */
  const mats = useMemo(() => {
    const lightU = () => ({
      tLight: { value: sim.lightTex },
      uLRect: { value: new THREE.Vector4(L.x0, L.z0, 1 / (L.x1 - L.x0), 1 / (L.z1 - L.z0)) },
    })
    const sky = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        ...lightU(),
        uTop: { value: new THREE.Vector3(0.012, 0.024, 0.03) },
        uHorizon: { value: new THREE.Vector3(0.05, 0.1, 0.105) },
        uMoonCol: { value: new THREE.Vector3(0.55, 0.7, 0.72) },
        uMoon: { value: new THREE.Vector2(-6, 17) },
      },
      depthWrite: false,
    })
    const sil = (mask: THREE.Texture, color: [number, number, number], o: { lightK?: number; lightZ: number; sway?: number; rim?: [number, number, number] }) =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: SIL_FRAG,
        uniforms: {
          ...lightU(),
          tMask: { value: mask },
          uColor: { value: v3(color) },
          uRim: { value: v3(o.rim ?? [0, 0, 0]) },
          uGlow: { value: v3(GLOW) },
          uLightK: { value: o.lightK ?? 0 },
          uLightZ: { value: o.lightZ },
          uSway: { value: o.sway ?? 0 },
          uTime: { value: 0 },
          uGust: { value: 0 },
          uGustX: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      })
    const fog = (color: [number, number, number], alpha: number, top: number, lightZ: number, lightK: number) =>
      new THREE.ShaderMaterial({
        vertexShader: PLANE_VERT,
        fragmentShader: FOG_FRAG,
        uniforms: {
          ...lightU(),
          uColor: { value: v3(color) },
          uGlow: { value: v3(GLOW) },
          uAlpha: { value: alpha },
          uTop: { value: top },
          uLightZ: { value: lightZ },
          uLightK: { value: lightK },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      })
    const farMask = forestMask(2048, 560, 11, { trunks: 34, wMin: 6, wMax: 16, canopy: 0.42, ground: 0.05, lean: 0.4 })
    const midMask = forestMask(2048, 760, 23, { trunks: 11, wMin: 26, wMax: 54, canopy: 0.36, ground: 0.07, lean: 0.6 })
    const grassFar = grassMask(2048, 200, 5, 7, 0.8)
    const grassNear = grassMask(2048, 300, 9, 5, 1)
    const nearTrunk = forestMask(256, 1024, 41, { trunks: 1, wMin: 120, wMax: 130, canopy: 0.12, ground: 0, lean: 0.2 })
    const ground = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERT,
      fragmentShader: GROUND_FRAG,
      uniforms: {
        ...lightU(),
        uColor: { value: new THREE.Vector3(0.018, 0.03, 0.026) },
        uFar: { value: new THREE.Vector3(0.03, 0.05, 0.05) },
        uGlow: { value: v3(GLOW) },
        uLightK: { value: 0.32 },
      },
      depthWrite: false,
    })
    const ff = new THREE.ShaderMaterial({
      vertexShader: FF_VERT,
      fragmentShader: FF_FRAG,
      uniforms: {
        uSize: { value: PHONE ? 640 : 600 },
        uPR: { value: 1 },
        uFocus: { value: 15 },
        uGlow: { value: v3(GLOW) },
        uCore: { value: v3(CORE) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    const lantern = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERT,
      fragmentShader: LANTERN_FRAG,
      uniforms: { uI: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    return {
      sky,
      far: sil(farMask, [0.028, 0.05, 0.053], { lightZ: -9, rim: [0.0, 0.01, 0.012] }),
      farFog: fog([0.36, 0.48, 0.5], 0.16, 7, -9, 0.3),
      mid: sil(midMask, [0.012, 0.022, 0.022], { lightZ: -8.5, lightK: 0.22 }),
      grassFar: sil(grassFar, [0.01, 0.02, 0.017], { lightZ: -5.5, lightK: 0.5, sway: 1, rim: [0.0, 0.012, 0.008] }),
      midFog: fog([0.3, 0.42, 0.44], 0.1, 3.2, -3, 0.6),
      ground,
      ff,
      nearFog: fog([0.24, 0.34, 0.35], 0.08, 1.6, 1.5, 0.8),
      grassNear: sil(grassNear, [0.006, 0.011, 0.009], { lightZ: 2.2, lightK: 0.7, sway: 1.4, rim: [0.004, 0.012, 0.004] }),
      trunk: sil(nearTrunk, [0.004, 0.007, 0.007], { lightZ: 3, lightK: 0.12 }),
      lantern,
      textures: [farMask, midMask, grassFar, grassNear, nearTrunk],
    }
  }, [sim])

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new THREE.BufferAttribute(sim.pos, 3)
    p.setUsage(THREE.DynamicDrawUsage)
    const b = new THREE.BufferAttribute(sim.bright, 1)
    b.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', p)
    g.setAttribute('aB', b)
    return g
  }, [sim])

  useEffect(
    () => () => {
      geo.dispose()
      sim.lightTex.dispose()
      for (const m of Object.values(mats)) if (m instanceof THREE.Material) m.dispose()
      mats.textures.forEach((t) => t.dispose())
    },
    [geo, mats, sim],
  )

  const trunkL = useRef<THREE.Mesh>(null)
  const trunkR = useRef<THREE.Mesh>(null)
  const lanternRef = useRef<THREE.Mesh>(null)

  const tmp = useMemo(
    () => ({
      time: 0,
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 1),
      hit: new THREE.Vector3(),
      o: new THREE.Vector3(),
      d: new THREE.Vector3(),
      look: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
      camX: 0,
      camY: 0,
      lanterns: [] as { x: number; y: number; z: number; ph: number; life: number }[],
      gust: 0,
      gustX: 0,
      gustDir: 1,
      nextGust: 18,
      lastPtr: -1e9,
      resetSeen: 0,
      r: 0,
      rSmooth: 0,
      hist: new Float32Array(150),
      histN: 0,
      lastMeter: 0,
      state: -1,
    }),
    [],
  )

  useFrame((state, raw) => {
    // upload the big silhouette masks one per frame instead of all on the first draw
    if (texQ.current < mats.textures.length) gl.initTexture(mats.textures[texQ.current++])
    const dt = Math.min(raw, 1 / 30)
    tmp.time += dt
    const t = tmp.time
    const cam = state.camera as THREE.PerspectiveCamera
    const { width, height } = state.size
    const aspect = width / height
    const now = performance.now()

    /* camera: slow drift + pointer parallax; phones step back a little */
    const p = ctl.ptr.current
    const ptrActive = now - p.t < 3000
    tmp.camX = THREE.MathUtils.damp(tmp.camX, ptrActive ? p.x * 0.7 : Math.sin(t * 0.05) * 0.8, 1.2, dt)
    tmp.camY = THREE.MathUtils.damp(tmp.camY, ptrActive ? p.y * 0.25 : 0, 1.2, dt)
    const back = aspect < 1 ? 13.5 : 12
    cam.position.set(tmp.camX, 1.9 + tmp.camY, back)
    tmp.look.set(tmp.camX * 0.3, aspect < 1 ? 3.1 : 2.6, -4)
    cam.lookAt(tmp.look)
    if (cam.fov !== 42) {
      cam.fov = 42
      cam.updateProjectionMatrix()
    }

    /* framing trunks hug the screen edges at z = 6.5 */
    const halfW = Math.tan(THREE.MathUtils.degToRad(21)) * (back - 6.5) * aspect
    if (trunkL.current) trunkL.current.position.x = -halfW - (aspect < 1 ? 0.4 : -0.2) + tmp.camX
    if (trunkR.current) trunkR.current.position.x = halfW + (aspect < 1 ? 0.36 : 0.0) + tmp.camX
    ;(mats.sky.uniforms.uMoon.value as THREE.Vector2).set(aspect < 1 ? -3.5 : -9, aspect < 1 ? 19 : 17)

    /* reset */
    if (ctl.reset.current !== tmp.resetSeen) {
      tmp.resetSeen = ctl.reset.current
      for (let i = 0; i < N; i++) sim.th[i] = Math.random() * TAU
      tmp.hist.fill(0)
      tmp.histN = 0
      tmp.nextGust = t + 20
    }

    /* pointer ray: scatter + desync */
    const sp = Math.hypot(p.vx, p.vy)
    const scatter = now - p.t < 120 ? Math.min(sp * 0.55, 1.6) : 0
    if (scatter > 0.05) {
      tmp.lastPtr = t
      tmp.ray.setFromCamera(tmp.ndc.set(p.x, p.y), cam)
      tmp.o.copy(tmp.ray.ray.origin)
      tmp.d.copy(tmp.ray.ray.direction)
    }

    /* clicks: a lantern that flashes now and keeps pulsing as a pacemaker */
    while (ctl.clicks.current.length) {
      const c = ctl.clicks.current.shift()!
      tmp.ray.setFromCamera(tmp.ndc.set(c.x, c.y), cam)
      tmp.plane.set(new THREE.Vector3(0, 0, 1), 2)
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.hit)) {
        tmp.hit.y = THREE.MathUtils.clamp(tmp.hit.y, 0.6, 4.5)
        if (tmp.lanterns.length > 2) tmp.lanterns.shift()
        const L0 = { x: tmp.hit.x, y: tmp.hit.y, z: tmp.hit.z, ph: -0.12, life: 0 }
        tmp.lanterns.push(L0)
        // phase-set the neighbourhood so the flash rolls outward as a ring
        for (let i = 0; i < N; i++) {
          const dx = sim.pos[i * 3] - L0.x
          const dy = sim.pos[i * 3 + 1] - L0.y
          const dz = sim.pos[i * 3 + 2] - L0.z
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < 4.2) {
            const w = 1 - d / 4.2
            const target = L0.ph - d * 0.55
            let diff = target - sim.th[i]
            diff = Math.atan2(Math.sin(diff), Math.cos(diff))
            sim.th[i] += diff * Math.min(1, w * 1.6)
          }
        }
      }
      tmp.lastPtr = t
    }

    /* gust: the auto-loop that knocks a region out of sync again */
    const idle = t - tmp.lastPtr > 6
    if (idle && t > tmp.nextGust && (tmp.rSmooth > 0.75 || t > tmp.nextGust + 10)) {
      const j = Math.floor(Math.random() * N)
      tmp.gustX = sim.pos[j * 3]
      tmp.gustDir = Math.random() < 0.5 ? -1 : 1
      const gz = sim.pos[j * 3 + 2]
      const R = PHONE ? 4.5 : 8
      for (let i = 0; i < N; i++) {
        const dx = sim.pos[i * 3] - tmp.gustX
        const dz = sim.pos[i * 3 + 2] - gz
        const d = Math.sqrt(dx * dx + dz * dz)
        if (d < R) {
          const w = 1 - d / R
          if (Math.random() < 0.6 + w) sim.th[i] = Math.random() * TAU
          sim.vel[i * 3] += tmp.gustDir * (0.6 + w * 1.6)
          sim.vel[i * 3 + 1] += w * 0.5
        }
      }
      tmp.gust = 1
      tmp.nextGust = t + 15 + Math.random() * 6
    }
    tmp.gust = Math.max(0, tmp.gust - dt * 0.45)
    tmp.gustX += tmp.gustDir * dt * 2.5

    /* lanterns */
    let lanternI = 0
    for (let k = tmp.lanterns.length - 1; k >= 0; k--) {
      const ln = tmp.lanterns[k]
      ln.life += dt
      ln.ph += OMEGA0 * dt
      if (ln.life > 7) tmp.lanterns.splice(k, 1)
    }
    const lastL = tmp.lanterns[tmp.lanterns.length - 1]
    if (lastL && lanternRef.current) {
      const fade = Math.min(1, lastL.life * 8) * (1 - THREE.MathUtils.smoothstep(lastL.life, 5.5, 7))
      const fl = flash(lastL.ph)
      lanternI = (0.55 + fl * 1.2) * fade
      lanternRef.current.position.set(lastL.x, lastL.y + Math.sin(lastL.life * 1.7) * 0.06, lastL.z)
      lanternRef.current.quaternion.copy(cam.quaternion)
      lanternRef.current.scale.setScalar(2.6 + fl * 2.2)
    }
    mats.lantern.uniforms.uI.value = lanternI
    if (lanternRef.current) lanternRef.current.visible = lanternI > 0.005

    /* 1) hash phases into cells */
    const { pos, vel, th, om, cs, sn, cell, C, S, Cn, BC, BS, BN, bufA, bufB } = sim
    C.fill(0)
    S.fill(0)
    Cn.fill(0)
    let sumC = 0
    let sumS = 0
    for (let i = 0; i < N; i++) {
      const c = Math.cos(th[i])
      const s = Math.sin(th[i])
      cs[i] = c
      sn[i] = s
      sumC += c
      sumS += s
      const cx = Math.min(GX - 1, Math.max(0, ((pos[i * 3] - B.x0) / CELL) | 0))
      const cy = Math.min(GY - 1, Math.max(0, ((pos[i * 3 + 1] - B.y0) / CELL) | 0))
      const cz = Math.min(GZ - 1, Math.max(0, ((pos[i * 3 + 2] - B.z0) / CELL) | 0))
      const ci = cx + GX * (cy + GY * cz)
      cell[i] = ci
      C[ci] += c
      S[ci] += s
      Cn[ci] += 1
    }
    tmp.r = Math.hypot(sumC, sumS) / N
    // 3×3×3 neighbourhood sums (separable box filter)
    boxSum(C, BC, bufA, bufB)
    boxSum(S, BS, bufA, bufB)
    boxSum(Cn, BN, bufA, bufB)

    /* 2) Kuramoto step + wander */
    const K = ctl.k.get()
    const KG = ctl.kg.get()
    const gC = sumC / N
    const gS = sumS / N
    const sx = B.x1 - B.x0
    let sumB = 0
    for (let i = 0; i < N; i++) {
      const ci = cell[i]
      const n = BN[ci]
      let dth = om[i]
      if (n > 1 && K > 0) dth += (K * (BS[ci] * cs[i] - BC[ci] * sn[i])) / n
      if (KG > 0) dth += KG * (gS * cs[i] - gC * sn[i])
      const i3 = i * 3
      let x = pos[i3]
      let y = pos[i3 + 1]
      let z = pos[i3 + 2]
      for (let k = 0; k < tmp.lanterns.length; k++) {
        const ln = tmp.lanterns[k]
        const dx = x - ln.x
        const dy = y - ln.y
        const dz = z - ln.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 16) dth += 3.2 * (1 - Math.sqrt(d2) / 4) * Math.sin(ln.ph - th[i])
      }
      th[i] += dth * dt
      if (th[i] > 1e4) th[i] -= TAU * 1000

      // pointer: push away from the ray and scramble phases
      if (scatter > 0.05) {
        const wx = x - tmp.o.x
        const wy = y - tmp.o.y
        const wz = z - tmp.o.z
        const tt = wx * tmp.d.x + wy * tmp.d.y + wz * tmp.d.z
        const qx = wx - tmp.d.x * tt
        const qy = wy - tmp.d.y * tt
        const qz = wz - tmp.d.z * tt
        const q2 = qx * qx + qy * qy + qz * qz
        const rad = 1.5
        if (q2 < rad * rad) {
          const q = Math.sqrt(q2) + 1e-3
          const f = (1 - q / rad) * scatter
          vel[i3] += (qx / q) * f * 7 * dt * 4
          vel[i3 + 1] += (qy / q) * f * 7 * dt * 4
          vel[i3 + 2] += (qz / q) * f * 7 * dt * 4
          if (Math.random() < f * dt * 14) th[i] = Math.random() * TAU
        }
      }

      // wander: smooth random heading
      sim.yaw[i] += (Math.random() - 0.5) * dt * 2.2
      sim.pitch[i] = THREE.MathUtils.clamp(sim.pitch[i] + (Math.random() - 0.5) * dt * 1.4, -0.7, 0.7)
      const s0 = sim.speed[i]
      const tx = Math.cos(sim.yaw[i]) * s0
      const tz = Math.sin(sim.yaw[i]) * s0 * 0.7
      const ty = Math.sin(sim.pitch[i]) * s0 * 0.55 + Math.sin(t * 1.3 + i) * 0.04
      const kk = 1 - Math.exp(-dt * 1.1)
      vel[i3] += (tx - vel[i3]) * kk
      vel[i3 + 1] += (ty - vel[i3 + 1]) * kk
      vel[i3 + 2] += (tz - vel[i3 + 2]) * kk
      // soft bounds
      if (x < B.x0) vel[i3] += (B.x0 - x) * 2 * dt
      else if (x > B.x1) vel[i3] -= (x - B.x1) * 2 * dt
      if (y < B.y0) vel[i3 + 1] += (B.y0 - y) * 3 * dt
      else if (y > B.y1) vel[i3 + 1] -= (y - B.y1) * 2 * dt
      if (z < B.z0) vel[i3 + 2] += (B.z0 - z) * 2 * dt
      else if (z > B.z1) vel[i3 + 2] -= (z - B.z1) * 2 * dt
      x += vel[i3] * dt
      y += vel[i3 + 1] * dt
      z += vel[i3 + 2] * dt
      // never wander far: wrap gently along x if a gust carried them off
      if (x < B.x0 - 3) x += sx
      else if (x > B.x1 + 3) x -= sx
      pos[i3] = x
      pos[i3 + 1] = y
      pos[i3 + 2] = z
      // poster: every firefly keeps a glow so the thumbnail reads as a full field, the wave rides on top
      const fb = POSTER ? 0.4 + 0.6 * flash(th[i]) : flash(th[i])
      sim.bright[i] = fb
      sumB += fb
    }

    /* 3) light map: splat flashes top-down, blur, upload */
    const { lAcc, lTmp, lData } = sim
    lAcc.fill(0)
    const fx = (LW - 1) / (L.x1 - L.x0)
    const fz = (LH - 1) / (L.z1 - L.z0)
    for (let i = 0; i < N; i++) {
      const b = sim.bright[i]
      if (b < 0.05) continue
      const gx = (pos[i * 3] - L.x0) * fx
      const gz = (pos[i * 3 + 2] - L.z0) * fz
      const ix = gx | 0
      const iz = gz | 0
      if (ix < 0 || iz < 0 || ix >= LW - 1 || iz >= LH - 1) continue
      const ax = gx - ix
      const az = gz - iz
      const w = b / (1 + pos[i * 3 + 1] * 0.35)
      const o = ix + iz * LW
      lAcc[o] += w * (1 - ax) * (1 - az)
      lAcc[o + 1] += w * ax * (1 - az)
      lAcc[o + LW] += w * (1 - ax) * az
      lAcc[o + LW + 1] += w * ax * az
    }
    for (const ln of tmp.lanterns) {
      const ix = Math.round((ln.x - L.x0) * fx)
      const iz = Math.round((ln.z - L.z0) * fz)
      if (ix >= 0 && iz >= 0 && ix < LW && iz < LH) lAcc[ix + iz * LW] += lanternI * 40
    }
    blur2(lAcc, lTmp)
    blur2(lAcc, lTmp)
    const gain = PHONE ? 0.22 : 0.16
    for (let k = 0; k < LW * LH; k++) {
      const v = 1 - Math.exp(-lAcc[k] * gain)
      lData[k] = (v * 255) | 0
    }
    sim.lightTex.needsUpdate = true

    geo.attributes.position.needsUpdate = true
    geo.attributes.aB.needsUpdate = true

    /* uniforms */
    mats.ff.uniforms.uPR.value = dpr
    for (const m of [mats.grassFar, mats.grassNear, mats.far, mats.mid, mats.trunk]) {
      m.uniforms.uTime.value = t
      m.uniforms.uGust.value = tmp.gust * tmp.gustDir
      m.uniforms.uGustX.value = tmp.gustX
    }
    for (const m of [mats.farFog, mats.midFog, mats.nearFog]) m.uniforms.uTime.value = t

    /* meter (DOM writes, no re-render) */
    const pulse = ctl.meter.current.pulse
    if (pulse) {
      const v = Math.min(1, (sumB / N) * 3)
      pulse.style.opacity = (0.18 + 0.82 * v).toFixed(3)
      pulse.style.transform = `scale(${(0.8 + v * 0.5).toFixed(3)})`
    }
    tmp.rSmooth += (tmp.r - tmp.rSmooth) * (1 - Math.exp(-dt * 2.5))
    if (now - tmp.lastMeter > 100) {
      tmp.lastMeter = now
      tmp.hist.copyWithin(0, 1)
      tmp.hist[tmp.hist.length - 1] = tmp.rSmooth
      tmp.histN = Math.min(tmp.hist.length, tmp.histN + 1)
      const m = ctl.meter.current
      if (m.value) m.value.textContent = tmp.rSmooth.toFixed(2)
      if (m.spark) drawSpark(m.spark, tmp.hist, tmp.histN)
      const rs = tmp.rSmooth
      let st = tmp.state
      const up = [0.3, 0.62, 0.9]
      const down = [0.24, 0.55, 0.84]
      if (st < 0) st = rs > up[2] ? 3 : rs > up[1] ? 2 : rs > up[0] ? 1 : 0
      else {
        while (st < 3 && rs > up[st]) st++
        while (st > 0 && rs < down[st - 1]) st--
      }
      if (st !== tmp.state) {
        tmp.state = st
        ctl.onState(st)
      }
    }
  })

  return (
    <>
      <color attach="background" args={[BG]} />
      <mesh material={mats.sky} position={[0, 14, -40]} renderOrder={0}>
        <planeGeometry args={[170, 70]} />
      </mesh>
      <mesh material={mats.far} position={[0, 13, -26]} renderOrder={1}>
        <planeGeometry args={[110, 30]} />
      </mesh>
      <mesh material={mats.farFog} position={[0, 3, -18]} renderOrder={2}>
        <planeGeometry args={[100, 10]} />
      </mesh>
      <mesh material={mats.mid} position={[0, 11.5, -12]} renderOrder={3}>
        <planeGeometry args={[74, 25]} />
      </mesh>
      <mesh material={mats.ground} position={[0, 0, 0.5]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
        <planeGeometry args={[60, 25]} />
      </mesh>
      <mesh material={mats.grassFar} position={[0, 0.7, -6]} renderOrder={5}>
        <planeGeometry args={[46, 1.6]} />
      </mesh>
      <mesh material={mats.midFog} position={[0, 1.1, -3]} renderOrder={6}>
        <planeGeometry args={[60, 4.2]} />
      </mesh>
      <points geometry={geo} material={mats.ff} frustumCulled={false} renderOrder={7} />
      <mesh ref={lanternRef} material={mats.lantern} renderOrder={8} visible={false}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh material={mats.nearFog} position={[0, 0.3, 1.5]} renderOrder={9}>
        <planeGeometry args={[40, 2.6]} />
      </mesh>
      <mesh material={mats.grassNear} position={[0, 0.85, 4.6]} renderOrder={10}>
        <planeGeometry args={[22, 2.0]} />
      </mesh>
      <mesh ref={trunkL} material={mats.trunk} position={[-6, 4.5, 6.5]} renderOrder={11}>
        <planeGeometry args={[1.1, 10]} />
      </mesh>
      <mesh ref={trunkR} material={mats.trunk} position={[6, 4.5, 6.5]} rotation={[0, 0, 0.04]} scale={[0.7, 1, 1]} renderOrder={11}>
        <planeGeometry args={[1.1, 10]} />
      </mesh>
    </>
  )
}

function boxSum(src: Float32Array, dst: Float32Array, a: Float32Array, b: Float32Array) {
  // x
  for (let z = 0; z < GZ; z++)
    for (let y = 0; y < GY; y++) {
      const row = GX * (y + GY * z)
      for (let x = 0; x < GX; x++) {
        const i = row + x
        a[i] = src[i] + (x > 0 ? src[i - 1] : 0) + (x < GX - 1 ? src[i + 1] : 0)
      }
    }
  // y
  for (let z = 0; z < GZ; z++)
    for (let y = 0; y < GY; y++)
      for (let x = 0; x < GX; x++) {
        const i = x + GX * (y + GY * z)
        b[i] = a[i] + (y > 0 ? a[i - GX] : 0) + (y < GY - 1 ? a[i + GX] : 0)
      }
  // z
  const sz = GX * GY
  for (let z = 0; z < GZ; z++)
    for (let i0 = 0; i0 < sz; i0++) {
      const i = i0 + sz * z
      dst[i] = b[i] + (z > 0 ? b[i - sz] : 0) + (z < GZ - 1 ? b[i + sz] : 0)
    }
}

function blur2(a: Float32Array, t: Float32Array) {
  for (let z = 0; z < LH; z++)
    for (let x = 0; x < LW; x++) {
      const i = x + z * LW
      t[i] = (a[i] * 2 + (x > 0 ? a[i - 1] : 0) + (x < LW - 1 ? a[i + 1] : 0)) * 0.25
    }
  for (let z = 0; z < LH; z++)
    for (let x = 0; x < LW; x++) {
      const i = x + z * LW
      a[i] = (t[i] * 2 + (z > 0 ? t[i - LW] : 0) + (z < LH - 1 ? t[i + LW] : 0)) * 0.25
    }
}

function drawSpark(cv: HTMLCanvasElement, hist: Float32Array, n: number) {
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = cv.clientWidth
  const h = cv.clientHeight
  if (cv.width !== Math.round(w * dpr)) {
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  // guide lines
  ctx.strokeStyle = 'rgba(216,255,106,0.12)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 3])
  for (const g of [0.5, 1]) {
    const y = Math.round(h - 2 - g * (h - 4)) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.setLineDash([])
  if (n < 2) return
  const L0 = hist.length
  const step = w / (L0 - 1)
  ctx.beginPath()
  for (let k = L0 - n; k < L0; k++) {
    const x = k * step
    const y = h - 2 - hist[k] * (h - 4)
    if (k === L0 - n) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = '#d8ff6a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.lineTo(w, h)
  ctx.lineTo((L0 - n) * step, h)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(216,255,106,0.28)')
  g.addColorStop(1, 'rgba(216,255,106,0)')
  ctx.fillStyle = g
  ctx.fill()
  const y = h - 2 - hist[L0 - 1] * (h - 4)
  ctx.fillStyle = '#f4ffc8'
  ctx.beginPath()
  ctx.arc(w - 2.5, y, 2.5, 0, TAU)
  ctx.fill()
}

/* ------------------------------------------------------------------ page */

const STATES = [
  { zh: '各自闪烁', en: 'Incoherent', aside: 'phases random' },
  { zh: '局部成团', en: 'Local clusters', aside: 'neighbours lock in' },
  { zh: '同步波', en: 'Travelling waves', aside: 'phase gradients sweep' },
  { zh: '齐声明灭', en: 'Global sync', aside: 'r → 1' },
]
const COUPLING = [
  { value: 0, label: '无耦合' },
  { value: 1, label: '弱' },
  { value: 2, label: '强' },
]

export default function FireflySync() {
  const [kIdx, setKIdx] = useState(2)
  const [st, setSt] = useState(0)
  const k = useMotionValue(K_LEVELS[2])
  const kg = useMotionValue(KG_LEVELS[2])
  const ptr = useRef({ x: 0, y: 0, vx: 0, vy: 0, t: -1e9 })
  const clicks = useRef<{ x: number; y: number }[]>([])
  const reset = useRef(0)
  const meter = useRef<{ value: HTMLSpanElement | null; spark: HTMLCanvasElement | null; pulse: HTMLElement | null }>({ value: null, spark: null, pulse: null })
  const down = useRef<{ x: number; y: number; moved: number } | null>(null)
  const ctl = useMemo<Ctl>(() => ({ k, kg, ptr, clicks, reset, meter, onState: setSt }), [k, kg])

  useEffect(() => {
    const c = animate(k, K_LEVELS[kIdx], { duration: 1.2, ease: [0.23, 1, 0.32, 1] })
    const c2 = animate(kg, KG_LEVELS[kIdx], { duration: 1.2, ease: [0.23, 1, 0.32, 1] })
    return () => {
      c.stop()
      c2.stop()
    }
  }, [kIdx, k, kg])

  const toNdc = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }
  }
  const onUi = (e: React.PointerEvent) => !!(e.target as HTMLElement).closest?.('.dock, .ff-meter')

  const s = STATES[st]

  return (
    <div
      className="stage ff-stage"
      style={{ background: BG, touchAction: 'none' }}
      onPointerMove={(e) => {
        if (onUi(e)) return
        const n = toNdc(e)
        const P = ptr.current
        const now = performance.now()
        const dtp = Math.max(8, now - P.t) / 1000
        if (now - P.t < 200) {
          // ndc velocity, smoothed
          P.vx = P.vx * 0.5 + ((n.x - P.x) / dtp) * 0.5
          P.vy = P.vy * 0.5 + ((n.y - P.y) / dtp) * 0.5
        } else {
          P.vx = 0
          P.vy = 0
        }
        P.x = n.x
        P.y = n.y
        P.t = now
        if (down.current) down.current.moved += Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y)
      }}
      onPointerDown={(e) => {
        if (onUi(e)) return
        down.current = { x: e.clientX, y: e.clientY, moved: 0 }
        const n = toNdc(e)
        Object.assign(ptr.current, { x: n.x, y: n.y, vx: 0, vy: 0, t: performance.now() })
      }}
      onPointerUp={(e) => {
        const d = down.current
        down.current = null
        if (!d || onUi(e)) return
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && d.moved < 24) clicks.current.push(toNdc(e))
      }}
    >
      <style>{`
        .ff-meter { position: absolute; top: 84px; right: 24px; width: 216px; padding: 14px 16px 12px; border-radius: 18px;
          background: rgba(10, 18, 16, 0.42); box-shadow: inset 0 0 0 1px rgba(216, 255, 106, 0.12); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px); color: var(--fg); pointer-events: none !important; }
        .ff-meter-row { display: flex; align-items: baseline; justify-content: space-between; }
        .ff-pulse { display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; vertical-align: 0; background: #e6ffb0; box-shadow: 0 0 10px 2px rgba(216,255,106,.7); opacity: .2; }
        .ff-meter-label { font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2); text-transform: uppercase; }
        .ff-meter-value { font: 600 26px/1 var(--mono); font-variant-numeric: tabular-nums; color: #e6ffb0; text-shadow: 0 0 14px rgba(216,255,106,.45); }
        .ff-meter canvas { display: block; width: 100%; height: 40px; margin-top: 10px; }
        .ff-meter-foot { display: flex; justify-content: space-between; margin-top: 6px; font: 10px/1 var(--mono); color: var(--fg-2); opacity: .7; }
        .ff-stage .big-label h1 { text-shadow: 0 0 40px rgba(5, 9, 10, 0.9); }
        @media (max-width: 760px) {
          .ff-meter { top: 76px; right: 16px; width: 150px; padding: 10px 12px 9px; border-radius: 14px; }
          .ff-meter-value { font-size: 20px; }
          .ff-meter canvas { height: 28px; margin-top: 7px; }
          .ff-meter-foot { display: none; }
          .ff-stage .dock .seg { padding: 0 12px; }
        }
      `}</style>

      <Canvas dpr={[1, 2]} camera={{ position: [0, 1.9, 12], fov: 42, near: 0.1, far: 120 }} gl={{ antialias: true, alpha: false }}>
        <Field ctl={ctl} />
      </Canvas>

      <div className="overlay">
        <BigLabel id={String(st)} meta={`${N.toLocaleString()} 只萤火虫 · Kuramoto 耦合`} title={s.zh} sub={s.en} aside={s.aside} />

        <div className="ff-meter" aria-live="off">
          <div className="ff-meter-row">
            <span className="ff-meter-label">
              <i className="ff-pulse" ref={(el) => void (meter.current.pulse = el)} />
              同步度 r
            </span>
            <span className="ff-meter-value" ref={(el) => void (meter.current.value = el)}>
              0.00
            </span>
          </div>
          <canvas ref={(el) => void (meter.current.spark = el)} />
          <div className="ff-meter-foot">
            <span>−15 s</span>
            <span>|⟨e^iθ⟩|</span>
          </div>
        </div>

        <div className="dock">
          <Seg items={COUPLING} value={kIdx} onChange={setKIdx} />
          <span className="dock-sep" />
          <button className="seg" onClick={() => reset.current++}>
            <span>重置</span>
          </button>
        </div>
        <p className="hint">
          划过萤火虫打乱节奏 · 点击点一盏灯笼
          <br />
          静置时偶尔起风，同步再次浮现
        </p>
      </div>
    </div>
  )
}
