import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { FireworksAudio, FireworksEngine, PALETTE_COUNT, TYPES, type Flash, type TypeId } from './fireworksEngine'

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const MAX = MOBILE ? 14000 : 30000
const QUALITY = MOBILE ? 0.7 : 1
const LAUNCH_Z = -42
const BANK_Z = -175
const CYCLE = 40
const BEAT = 0.62

type Sel = 'random' | TypeId

/* ------------------------------------------------------------------ show director (auto sequence) */

// [beat, x (-1..1), height (0..1)]
const PHRASES: [number, number, number][][] = [
  [[0, 0, 0.78]],
  [[0, -0.6, 0.55], [0, 0.6, 0.55]],
  [[0, -0.75, 0.42], [1, -0.25, 0.62], [2, 0.25, 0.62], [3, 0.75, 0.42]],
  [[0, 0, 0.92], [1.5, -0.56, 0.52], [1.5, 0.56, 0.52]],
  [[0, -0.35, 0.6], [0.5, 0.35, 0.74]],
  [[0, 0.72, 0.5], [1, 0.25, 0.66], [2, -0.25, 0.66], [3, -0.72, 0.5]],
  [[0, -0.5, 0.82], [0.75, 0.5, 0.82], [1.5, 0, 0.5]],
]
const FINALE: TypeId[] = ['chrys', 'peony', 'crackle', 'ring', 'chrys', 'peony']

class Director {
  t = POSTER ? 30.6 : 0
  next = 0.25
  last = -1
  wall = false
  auto = true
  sel: Sel = 'random'
  view = { xr: 30, yMin: 14, yMax: 34 }
  clicks: { x: number; y: number }[] = []
  eng: FireworksEngine
  constructor(eng: FireworksEngine) {
    this.eng = eng
  }
  pick(pool?: TypeId[]): TypeId {
    if (this.sel !== 'random') return this.sel
    const list = pool ?? TYPES.map((t) => t.id)
    return list[Math.floor(Math.random() * list.length)]
  }
  fire(xn: number, hn: number, type: TypeId, pal: number, delay: number) {
    const v = this.view
    const h = Math.min(1, Math.max(0, hn))
    this.eng.launch(xn * v.xr, v.yMin + h * (v.yMax - v.yMin), LAUNCH_Z + (Math.random() - 0.5) * 10, type, pal, delay)
  }
  salvo() {
    const type = this.pick(['chrys', 'peony', 'crackle', 'ring', 'willow'])
    const pal = Math.floor(Math.random() * PALETTE_COUNT)
    for (let i = 0; i < 7; i++) {
      const k = i / 6
      this.fire(-0.85 + 1.7 * k, 0.35 + 0.5 * Math.sin(Math.PI * k), type, (pal + (i % 2) * 2) % PALETTE_COUNT, Math.abs(i - 3) * 0.09)
    }
  }
  update(dt: number) {
    if (!this.auto) return
    this.t += dt
    if (this.t >= CYCLE) {
      this.t -= CYCLE
      this.next = 0.3
      this.wall = false
    }
    const t = this.t
    const rnd = Math.random
    if (t < 30.5) {
      if (t < this.next) return
      let k = 0
      do k = Math.floor(rnd() * PHRASES.length)
      while (k === this.last)
      this.last = k
      const ph = PHRASES[k]
      const type = this.pick()
      const alt = this.sel === 'random' && rnd() < 0.4 ? this.pick() : type
      const pal = Math.floor(rnd() * PALETTE_COUNT)
      const pal2 = (pal + 1 + Math.floor(rnd() * (PALETTE_COUNT - 1))) % PALETTE_COUNT
      let end = 0
      ph.forEach(([b, x, h], i) => {
        // mirrored pairs share colour; sequences alternate
        const sym = ph.some(([b2, x2], j) => j !== i && b2 === b && Math.abs(x2 + x) < 0.01)
        this.fire(x + (rnd() - 0.5) * 0.08, h + (rnd() - 0.5) * 0.08, i % 2 ? alt : type, sym || i % 2 === 0 ? pal : pal2, b * BEAT)
        end = Math.max(end, b)
      })
      this.next = t + (end + 2.4 + rnd() * 1.4) * BEAT
    } else if (t < 36.4) {
      if (t < this.next) return
      this.fire((rnd() * 2 - 1) * 0.92, 0.15 + rnd() * 0.85, this.pick(FINALE), Math.floor(rnd() * PALETTE_COUNT), 0)
      if (rnd() < 0.35) this.fire((rnd() * 2 - 1) * 0.92, 0.15 + rnd() * 0.85, this.pick(FINALE), Math.floor(rnd() * PALETTE_COUNT), 0.05)
      this.next = t + 0.13 + rnd() * 0.17
    } else if (!this.wall) {
      // grand finale: a wall of willows
      this.wall = true
      const type = this.sel === 'random' ? 'willow' : this.sel
      for (let i = 0; i < 5; i++) this.fire(-0.8 + i * 0.4, 0.82 + (i % 2) * 0.1, type, 3, i * 0.04)
    }
  }
}

/* ------------------------------------------------------------------ shaders */

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const BG_FRAG = /* glsl */ `
uniform float uTime, uAspect, uBank, uS, uPx;
uniform vec4 uF0, uF1, uF2, uF3;
uniform vec3 uC0, uC1, uC2, uC3;
uniform sampler2D tRefl;
varying vec2 vUv;

float h11(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
vec3 L(vec3 c) { return c * c * (c * 0.305 + 0.682) + c * 0.0125; } // ~ sRGB → linear
float cov(float d) { return clamp(d / uPx + 0.5, 0.0, 1.0); }

vec3 glow(vec2 uv, vec4 F, vec3 C) {
  vec2 d = (uv - F.xy) * vec2(uAspect, 1.0);
  float r2 = dot(d, d) / (F.w * F.w);
  float k = F.z / (1.0 + F.z * 0.35);
  return C * k * (exp(-r2 * 1.6) * 0.045 + exp(-r2 * 0.15) * 0.012);
}
float lx(float x, vec4 F) { float d = (x - F.x) * uAspect / F.w; return F.z / (1.0 + F.z * 0.35) / (1.0 + d * d * 0.8); }

vec3 sky(vec2 uv) {
  float h = uv.y - uBank;
  vec3 c = mix(L(vec3(0.20, 0.10, 0.15)), L(vec3(0.06, 0.06, 0.13)), smoothstep(0.0, 0.2, h));
  c = mix(c, L(vec3(0.014, 0.016, 0.04)), smoothstep(0.15, 0.8, h));
  vec2 sp = vec2(uv.x * uAspect, uv.y) * 200.0;
  vec2 cell = floor(sp);
  float hs = h21(cell);
  if (hs > 0.992) {
    float d = length(fract(sp) - 0.5);
    float tw = 0.55 + 0.45 * sin(uTime * (1.0 + hs * 3.0) + hs * 80.0);
    c += vec3(0.55, 0.6, 0.8) * smoothstep(0.25, 0.0, d) * tw * smoothstep(0.1, 0.45, h);
  }
  c += glow(uv, uF0, uC0) + glow(uv, uF1, uC1) + glow(uv, uF2, uC2) + glow(uv, uF3, uC3);
  return c;
}

// q.x: horizontal in screen-height units, q.y: height above the waterline (screen-height units)
vec4 city(vec2 q, vec3 lit) {
  vec3 col = vec3(0.0);
  float a = 0.0;
  float s = uS;
  float emb = 0.007 * s;
  // embankment with a row of lamps
  if (q.y < emb) {
    col = L(vec3(0.035, 0.032, 0.045)) + lit * 0.006;
    a = 1.0;
    float lp = fract(q.x / (0.05 * s)) - 0.5;
    float lamp = exp(-(lp * lp * 2500.0 + pow((q.y - emb * 0.7) / s, 2.0) * 9e5));
    col += L(vec3(1.0, 0.68, 0.36)) * lamp * 1.6;
  }
  float y = q.y - emb;
  // far layer: hazy, bluish
  {
    float w = 0.026 * s;
    float id = floor(q.x / w);
    float r = h11(id);
    float h = (0.024 + 0.05 * r * r + step(0.9, r) * 0.05) * s;
    float fx = fract(q.x / w);
    float c = cov(min(h - y, min((fx - 0.06) * w, (0.97 - fx) * w))) * step(0.0, y);
    if (c > 0.0) {
      vec3 b = L(vec3(0.085, 0.085, 0.14)) + lit * 0.012;
      vec2 g = vec2(fx * 6.0, y / (0.0055 * s));
      vec2 cf = fract(g);
      float on = step(0.8, h21(floor(g) + id * 13.7)) * step(0.3, cf.x) * step(cf.x, 0.7) * step(0.3, cf.y) * step(cf.y, 0.72) * step(y, h - 0.004 * s);
      b += on * L(vec3(1.0, 0.8, 0.55)) * 0.28;
      col = mix(col, b, c);
      a = max(a, c);
    }
  }
  // near layer: darker, taller, warm windows
  {
    float w = 0.046 * s;
    float xx = q.x + 0.31;
    float id = floor(xx / w);
    float r = h11(id + 17.0);
    float h = (0.01 + 0.07 * r * r * r + step(0.86, r) * 0.045) * s;
    float fx = fract(xx / w);
    float tier = step(0.55, h11(id + 3.0)) * step(abs(fx - 0.5), 0.2) * 0.018 * s;
    float hh = h + tier;
    float c = cov(min(hh - y, min((fx - 0.04) * w, (0.985 - fx) * w))) * step(0.0, y);
    if (c > 0.0) {
      vec3 b = L(vec3(0.032, 0.032, 0.05)) + lit * (0.006 + 0.02 * smoothstep(0.0, hh, y));
      vec2 g = vec2(fx * 9.0, y / (0.0062 * s));
      vec2 cell = floor(g);
      vec2 cf = fract(g);
      float hw = h21(cell + id * 7.3);
      float on = step(0.72, hw) * step(0.25, cf.x) * step(cf.x, 0.75) * step(0.25, cf.y) * step(cf.y, 0.7) * step(y, h - 0.005 * s) * step(0.004 * s, y);
      vec3 wc = mix(L(vec3(1.0, 0.7, 0.4)), L(vec3(0.75, 0.86, 1.0)), step(0.88, hw));
      b += on * wc * (0.35 + 0.45 * h21(cell.yx + id));
      col = mix(col, b, c);
      a = max(a, c);
    }
  }
  // landmark tower with two pearls and a blinking beacon
  {
    float tx = (q.x - uAspect * 0.76) / s;
    float ty = y / s;
    float d = min(abs(tx) - 0.0032, 0.0) + max(abs(tx) - 0.0032, ty - 0.2);
    d = min(d, max(abs(tx) - (0.013 - ty * 0.17), ty - 0.07));
    d = min(d, length(vec2(tx, ty - 0.085)) - 0.012);
    d = min(d, length(vec2(tx, ty - 0.165)) - 0.008);
    d = min(d, max(abs(tx) - 0.0011, ty - 0.265));
    float c = cov(-d * s) * step(0.0, ty);
    if (c > 0.0) {
      float pearl = step(length(vec2(tx, ty - 0.085)), 0.013) + step(length(vec2(tx, ty - 0.165)), 0.009);
      vec3 b = L(vec3(0.05, 0.04, 0.07)) + lit * 0.02 + pearl * L(vec3(0.75, 0.22, 0.5)) * (0.12 + 0.06 * sin(uTime * 1.3 + ty * 40.0));
      col = mix(col, b, c);
      a = max(a, c);
    }
    vec2 bp = vec2(tx, ty - 0.268) * 900.0;
    float bea = exp(-dot(bp, bp)) * step(0.55, fract(uTime * 0.6));
    col += L(vec3(1.0, 0.12, 0.1)) * bea * 3.0;
    a = max(a, min(1.0, bea));
  }
  return vec4(col, a);
}

void main() {
  vec2 uv = vUv;
  bool water = uv.y < uBank;
  vec2 dist = vec2(0.0);
  float depth = 0.0;
  vec2 suv = uv;
  if (water) {
    depth = clamp((uBank - uv.y) / max(uBank, 1e-3), 0.0, 1.0);
    float persp = 1.0 / (depth + 0.03);
    vec2 wq = vec2((uv.x - 0.5) * uAspect * persp * 0.7, persp);
    float n = vnoise(wq * vec2(1.6, 1.1) + vec2(0.0, uTime * 0.8)) * 0.65 + vnoise(wq * vec2(4.6, 2.9) + vec2(uTime * 0.25, uTime * 1.6)) * 0.35 - 0.5;
    dist = vec2(n * (0.003 + 0.03 * depth), n * 0.006 * depth);
    suv = vec2(uv.x + dist.x, 2.0 * uBank - uv.y + dist.y);
  }
  float fx = suv.x;
  vec3 lit = uC0 * lx(fx, uF0) + uC1 * lx(fx, uF1) + uC2 * lx(fx, uF2) + uC3 * lx(fx, uF3);
  vec3 col = sky(suv);
  vec4 c = city(vec2(suv.x * uAspect, suv.y - uBank), lit);
  col = mix(col, c.rgb, c.a);
  if (water) {
    float refl = mix(0.55, 0.22, smoothstep(0.0, 0.8, depth));
    col *= refl;
    // firework reflections (mirrored particle pass), smeared vertically like wind-ruffled water
    vec2 ruv = uv + dist * vec2(1.4, 0.6);
    float sm = 0.003 + 0.016 * depth;
    vec3 pr = textureLod(tRefl, ruv, 0.0).rgb * 0.4
            + textureLod(tRefl, ruv + vec2(0.0, sm), 0.0).rgb * 0.25
            + textureLod(tRefl, ruv - vec2(0.0, sm), 0.0).rgb * 0.22
            + textureLod(tRefl, ruv + vec2(0.0, sm * 2.2), 0.0).rgb * 0.13;
    col += pr * (0.12 + refl * 0.85);
    // lamp glints stretched down the water
    float lp = fract(suv.x * uAspect / (0.05 * uS)) - 0.5;
    float brk = smoothstep(0.05, 0.3, dist.x / (0.003 + 0.03 * depth));
    float lq = lp - dist.x * uAspect / (0.05 * uS) * -0.6;
    col += L(vec3(1.0, 0.62, 0.3)) * exp(-lq * lq * 1600.0) * exp(-depth * 9.0) * 0.45 * brk;
    col += L(vec3(0.012, 0.016, 0.03)) + lit * 0.004 * (1.0 - depth);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

const PT_VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
uniform float uScale, uMirror;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.y *= uMirror;
  // artistic: mirror squashed toward the waterline so high bursts still land on the visible river
  if (uMirror < 0.0) p.y *= 0.55;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale / -mv.z;
  // sub-pixel points keep their energy instead of shimmering
  vCol = aCol * min(1.0, s / 2.0);
  gl_PointSize = max(s, 2.0);
}
`
const PT_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 4.0) * 0.55 + exp(-d2 * 22.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}
`

const SMOKE_VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec3 iSz;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSz.y), s = sin(iSz.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iSz.x;
  gl_Position = projectionMatrix * mv;
  vUv = (uv + vec2(mod(iSz.z, 2.0), floor(iSz.z / 2.0))) * 0.5;
  vCol = iCol;
}
`
const SMOKE_FRAG = /* glsl */ `
uniform sampler2D tSmoke;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  float a = texture2D(tSmoke, vUv).r * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`

function smokeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  g.globalCompositeOperation = 'lighter'
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * 128 + 64
    const oy = Math.floor(t / 2) * 128 + 64
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 26
      const x = ox + Math.cos(a) * r
      const y = oy + Math.sin(a) * r
      const s = 14 + Math.random() * 26
      const gr = g.createRadialGradient(x, y, 0, x, y, s)
      const k = 0.07 + Math.random() * 0.09
      gr.addColorStop(0, `rgba(255,255,255,${k})`)
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(ox - 64, oy - 64, 128, 128)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

/* ------------------------------------------------------------------ scene */

function Show({ eng, dir }: { eng: FireworksEngine; dir: Director }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const scene = useThree((s) => s.scene)

  const R = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const aPos = new THREE.BufferAttribute(eng.outPos, 3).setUsage(THREE.DynamicDrawUsage)
    const aCol = new THREE.BufferAttribute(eng.outCol, 3).setUsage(THREE.DynamicDrawUsage)
    const aSize = new THREE.BufferAttribute(eng.outSize, 1).setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('position', aPos)
    geo.setAttribute('aCol', aCol)
    geo.setAttribute('aSize', aSize)
    geo.setDrawRange(0, 0)
    const ptParams = (mirror: number): THREE.ShaderMaterialParameters => ({
      vertexShader: PT_VERT,
      fragmentShader: PT_FRAG,
      uniforms: { uScale: { value: 900 }, uMirror: { value: mirror } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    })
    const ptMat = new THREE.ShaderMaterial(ptParams(1))
    const reflMat = new THREE.ShaderMaterial(ptParams(-1))
    const points = new THREE.Points(geo, ptMat)
    points.frustumCulled = false
    points.renderOrder = 2
    const reflPoints = new THREE.Points(geo, reflMat)
    reflPoints.frustumCulled = false
    const reflScene = new THREE.Scene()
    reflScene.add(reflPoints)
    const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false })

    const bgMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: BG_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uBank: { value: 0.3 },
        uS: { value: 1 },
        uPx: { value: 0.001 },
        uF0: { value: new THREE.Vector4() },
        uF1: { value: new THREE.Vector4() },
        uF2: { value: new THREE.Vector4() },
        uF3: { value: new THREE.Vector4() },
        uC0: { value: new THREE.Vector3() },
        uC1: { value: new THREE.Vector3() },
        uC2: { value: new THREE.Vector3() },
        uC3: { value: new THREE.Vector3() },
        tRefl: { value: reflRT.texture },
      },
      depthTest: false,
      depthWrite: false,
    })
    const bgGeo = new THREE.PlaneGeometry(2, 2)
    const bg = new THREE.Mesh(bgGeo, bgMat)
    bg.frustumCulled = false
    bg.renderOrder = -1

    const sGeo = new THREE.InstancedBufferGeometry()
    const quad = new THREE.PlaneGeometry(1, 1)
    sGeo.index = quad.index
    sGeo.setAttribute('position', quad.getAttribute('position'))
    sGeo.setAttribute('uv', quad.getAttribute('uv'))
    const iPos = new THREE.InstancedBufferAttribute(eng.smokePos, 3).setUsage(THREE.DynamicDrawUsage)
    const iCol = new THREE.InstancedBufferAttribute(eng.smokeCol, 4).setUsage(THREE.DynamicDrawUsage)
    const iSz = new THREE.InstancedBufferAttribute(eng.smokeSize, 3).setUsage(THREE.DynamicDrawUsage)
    sGeo.setAttribute('iPos', iPos)
    sGeo.setAttribute('iCol', iCol)
    sGeo.setAttribute('iSz', iSz)
    sGeo.instanceCount = 0
    const tSmoke = smokeTexture()
    const sMat = new THREE.ShaderMaterial({
      vertexShader: SMOKE_VERT,
      fragmentShader: SMOKE_FRAG,
      uniforms: { tSmoke: { value: tSmoke } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const smoke = new THREE.Mesh(sGeo, sMat)
    smoke.frustumCulled = false
    smoke.renderOrder = 1

    return { geo, aPos, aCol, aSize, ptMat, reflMat, points, reflScene, reflRT, bg, bgMat, bgGeo, sGeo, quad, iPos, iCol, iSz, sMat, smoke, tSmoke, buf: new THREE.Vector2(), v: new THREE.Vector3(), ray: new THREE.Raycaster(), plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -LAUNCH_Z), hit: new THREE.Vector3(), ndc: new THREE.Vector2(), top: [] as Flash[] }
  }, [eng])

  useEffect(
    () => () => {
      R.geo.dispose()
      R.ptMat.dispose()
      R.reflMat.dispose()
      R.reflRT.dispose()
      R.bgMat.dispose()
      R.bgGeo.dispose()
      R.sGeo.dispose()
      R.quad.dispose()
      R.sMat.dispose()
      R.tSmoke.dispose()
    },
    [R],
  )

  // compile our programs asynchronously (against a linear render target — the variant the composer draws into)
  const ready = useRef(false)
  useEffect(() => {
    let alive = true
    const objs = [R.points, R.bg, R.smoke]
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(R.reflRT)
    const p1 = gl.compileAsync(scene, camera)
    const p2 = gl.compileAsync(R.reflScene, camera)
    gl.setRenderTarget(prev)
    objs.forEach((o) => (o.visible = false))
    Promise.all([p1, p2])
      .catch(() => {})
      .then(() => {
        if (!alive) return
        ready.current = true
        objs.forEach((o) => (o.visible = true))
      })
    return () => {
      alive = false
    }
  }, [R, gl, scene, camera])

  const st = useRef({ time: 0, px: 0 })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    s.time += dt
    const size = state.size
    const aspect = size.width / size.height

    // camera: wider lens on portrait screens, slight pointer parallax
    const fov = aspect < 1 ? 64 : 50
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    s.px = THREE.MathUtils.damp(s.px, POSTER ? 0 : state.pointer.x, 1.5, dt)
    camera.position.set(s.px * 1.2, 3.2, 20)
    camera.lookAt(s.px * 0.6, 10, LAUNCH_Z)
    camera.updateMatrixWorld()

    // show area on the launch plane
    const at = (nx: number, ny: number) => {
      R.ray.setFromCamera(R.ndc.set(nx, ny), camera)
      R.ray.ray.intersectPlane(R.plane, R.hit)
      return R.hit
    }
    const halfW = Math.abs(at(1, 0.3).x)
    const yTop = at(0, 0.84).y
    eng.scale = THREE.MathUtils.clamp(halfW / 34, 0.55, 1)
    dir.view.xr = halfW * 0.72
    dir.view.yMin = Math.max(13, at(0, -0.05).y + 8 * eng.scale)
    dir.view.yMax = Math.max(dir.view.yMin + 4, yTop - 13 * eng.scale)

    // clicks → aim a shell at that point of the sky
    while (dir.clicks.length) {
      const c = dir.clicks.shift()!
      const h = at(c.x, c.y)
      const x = THREE.MathUtils.clamp(h.x, -halfW * 0.92, halfW * 0.92)
      const y = THREE.MathUtils.clamp(h.y, dir.view.yMin * 0.8, dir.view.yMax + 4)
      eng.launch(x, y, LAUNCH_Z, dir.pick())
    }

    dir.update(dt)
    eng.step(dt)
    eng.writeOutputs(s.time)
    eng.writeSmoke()

    // upload
    const n = eng.outCount
    R.geo.setDrawRange(0, n)
    for (const [a, k] of [[R.aPos, 3], [R.aCol, 3], [R.aSize, 1]] as const) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, Math.max(1, n * k))
      a.needsUpdate = true
    }
    const m = eng.smokeCount
    R.sGeo.instanceCount = m
    for (const [a, k] of [[R.iPos, 3], [R.iCol, 4], [R.iSz, 3]] as const) {
      a.clearUpdateRanges()
      a.addUpdateRange(0, Math.max(1, m * k))
      a.needsUpdate = true
    }

    gl.getDrawingBufferSize(R.buf)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    R.ptMat.uniforms.uScale.value = R.buf.y / (2 * tanHalf)

    // sky / skyline / water uniforms
    const u = R.bgMat.uniforms
    u.uTime.value = s.time
    u.uAspect.value = aspect
    u.uPx.value = 1 / R.buf.y
    u.uS.value = Math.tan(THREE.MathUtils.degToRad(25)) / tanHalf
    R.v.set(0, 0, BANK_Z).project(camera)
    u.uBank.value = R.v.y * 0.5 + 0.5
    const top = eng.topFlashes(R.top, 4)
    const keysF = ['uF0', 'uF1', 'uF2', 'uF3'] as const
    const keysC = ['uC0', 'uC1', 'uC2', 'uC3'] as const
    for (let i = 0; i < 4; i++) {
      const F = u[keysF[i]].value as THREE.Vector4
      const C = u[keysC[i]].value as THREE.Vector3
      const f = top[i]
      if (!f) {
        F.set(0, 0, 0, 0.2)
        continue
      }
      R.v.set(f.x, f.y, f.z).project(camera)
      F.set(R.v.x * 0.5 + 0.5, R.v.y * 0.5 + 0.5, f.fast + f.slow, (18 * eng.scale) / (Math.abs(f.z - camera.position.z) * 2 * tanHalf))
      C.set(f.r, f.g, f.b)
    }

    // mirrored particle pass for the river (half resolution)
    const w = Math.max(2, Math.round(R.buf.x * 0.5))
    const h = Math.max(2, Math.round(R.buf.y * 0.5))
    if (R.reflRT.width !== w || R.reflRT.height !== h) R.reflRT.setSize(w, h)
    R.reflMat.uniforms.uScale.value = h / (2 * tanHalf)
    if (!ready.current) return
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(R.reflRT)
    gl.setClearColor(0x000000, 1)
    gl.clear(true, false, false)
    gl.render(R.reflScene, camera)
    gl.setRenderTarget(prev)
  })

  return (
    <>
      <primitive object={R.bg} />
      <primitive object={R.smoke} />
      <primitive object={R.points} />
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function Fireworks() {
  const eng = useMemo(() => new FireworksEngine(MAX, QUALITY), [])
  const dir = useMemo(() => new Director(eng), [eng])
  const [auto, setAuto] = useState(true)
  const [sel, setSel] = useState<Sel>('random')
  const [sound, setSound] = useState(false)
  const [label, setLabel] = useState<{ type: TypeId; stars: number; n: number }>({ type: 'chrys', stars: 130, n: 0 })
  const [dpr, setDpr] = useState(MOBILE ? 1.5 : 1.75)
  const audio = useRef<FireworksAudio | null>(null)
  const lastLabel = useRef(0)

  useEffect(() => {
    dir.auto = auto
  }, [auto, dir])
  useEffect(() => {
    dir.sel = sel
  }, [sel, dir])

  useEffect(() => {
    eng.onBurst = (type, stars) => {
      const now = performance.now()
      if (now - lastLabel.current < 1400) return
      lastLabel.current = now
      setLabel({ type, stars, n: eng.shells })
    }
    return () => {
      eng.onBurst = null
    }
  }, [eng])

  useEffect(() => {
    if (sound) {
      if (!audio.current) audio.current = new FireworksAudio()
      void audio.current.ctx.resume()
      eng.audio = audio.current
    } else {
      eng.audio = null
      void audio.current?.ctx.suspend()
    }
  }, [sound, eng])
  useEffect(() => () => void audio.current?.ctx.close(), [])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    dir.clicks.push({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) })
  }

  const T = TYPES.find((t) => t.id === label.type)!
  const typeItems = [{ value: 'random' as Sel, label: '随机' }, ...TYPES.map((t) => ({ value: t.id as Sel, label: t.zh }))]

  const autoBtn = (
    <button className="seg" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
      {auto && <span className="seg-bg" />}
      <span>
        <i className="fw-dot" data-on={auto} />
        自动表演
      </span>
    </button>
  )
  const salvoBtn = (
    <button className="seg fw-salvo" onClick={() => dir.salvo()}>
      <span>齐射</span>
    </button>
  )
  const soundBtn = (
    <button className="seg" aria-pressed={sound} onClick={() => setSound((v) => !v)}>
      {sound && <span className="seg-bg" />}
      <span>{sound ? '声音 · 开' : '声音 · 关'}</span>
    </button>
  )

  return (
    <div className="stage fw" style={{ background: '#05060d' }}>
      <style>{css}</style>
      <div className="fw-canvas" onPointerDown={onDown}>
        <Canvas
          dpr={dpr}
          flat
          gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
          camera={{ position: [0, 3.2, 20], fov: 50, near: 0.5, far: 600 }}
          onCreated={({ gl }) => gl.setClearColor('#05060d', 1)}
        >
          <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d * 0.8))} flipflops={3} />
          <Show eng={eng} dir={dir} />
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.42} luminanceSmoothing={0.3} radius={0.72} />
          </EffectComposer>
        </Canvas>
      </div>

      <div className="overlay fw-overlay">
        <div className="fw-label soft-text">
          <BigLabel
            id={`${label.type}-${label.n}`}
            meta={`SHELL ${String(label.n).padStart(3, '0')} · ${label.stars} STARS · ${(MAX / 1000).toFixed(0)}K POOL`}
            title={T.zh}
            sub={T.en}
            aside={T.aside}
          />
        </div>
        <AnimatePresence>
          {!auto && (
            <motion.p className="fw-paused" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
              自动表演已暂停 · 点击夜空自己放
            </motion.p>
          )}
        </AnimatePresence>
        {MOBILE ? (
          <>
            <div className="dock fw-dock-types">
              <Seg items={typeItems} value={sel} onChange={setSel} />
            </div>
            <div className="dock">
              {autoBtn}
              {salvoBtn}
              {soundBtn}
            </div>
          </>
        ) : (
          <div className="dock">
            {autoBtn}
            <span className="dock-sep" />
            <Seg items={typeItems} value={sel} onChange={setSel} />
            <span className="dock-sep" />
            {salvoBtn}
            {soundBtn}
          </div>
        )}
        <p className="hint">
          点击夜空 · 朝那里发射
          <br />
          每 40 秒一轮压轴
        </p>
      </div>
    </div>
  )
}

const css = `
.fw-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.fw-label { --soft-bg: #05060d; }
.fw-label .big-label-meta { font-size: 11px; letter-spacing: .1em; }
.fw-dot { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; vertical-align: 1px; background: rgba(255,255,255,.3); transition: background .3s, box-shadow .3s; }
.fw-dot[data-on='true'] { background: #ffcf5a; box-shadow: 0 0 10px #ffcf5a; }
.fw-salvo span { color: #ffd88a; }
.fw-salvo:active { transform: scale(.96); }
.fw-paused {
  position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); margin: 0;
  font: 500 12px/1 var(--mono); letter-spacing: .06em; color: var(--fg-2); white-space: nowrap; pointer-events: none !important;
}
@media (max-width: 760px) {
  .fw-dock-types { bottom: 72px; }
  .fw .big-label { bottom: 132px; }
  .fw-label .big-label p span { display: none; }
  .fw-label .big-label-meta { font-size: 10px; }
  .fw-paused { bottom: 122px; }
  .fw .dock .seg { padding: 0 11px; }
}
`
