import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { NETS, PLANE_N, SIDE, TILT, buildNet, classify, forward, inputCell, labelProbs, renderDigit, type Net } from './neuralModel'

/* ------------------------------------------------------------------ constants */

const UNIT = 0.6 // seconds per layer transition at 1×
const MORPH = 0.75 // input morph before the pass (in transition units)
const HOLD = 2.8 // answer stays up (in transition units)
const SPEEDS = [
  { value: 0.6, label: '慢' },
  { value: 1, label: '中' },
  { value: 1.7, label: '快' },
]
const MAX_PULSES = 6 * 150
const TRAIL = 4

type Result = { winner: number; probs: number[]; custom: boolean } | null

type Ctl = {
  speed: React.MutableRefObject<number>
  lines: MotionValue<number>
  runReq: React.MutableRefObject<number>
  drawReq: React.MutableRefObject<number>
  drawMode: React.MutableRefObject<boolean>
  drag: React.MutableRefObject<{ yaw: number; pitch: number; vy: number; vp: number; down: boolean; last: number }>
  pointer: React.MutableRefObject<{ x: number; y: number; drawing: boolean; lastUp: number; strokes: number }>
  labels: React.MutableRefObject<(HTMLDivElement | null)[]>
  view: { cam: THREE.Camera | null; w: number; h: number; x0: number; half: number }
  onResult: (r: Result) => void
  onDrawMode: (on: boolean) => void
}

/* ------------------------------------------------------------------ GLSL */

const NEURON_VERT = /* glsl */ `
attribute float aAct;
attribute float aHue;
varying float vAct;
varying float vHue;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vAct = aAct;
  vHue = aHue;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const NEURON_FRAG = /* glsl */ `
uniform vec3 uC0, uC1, uC2;
uniform float uFlat;
varying float vAct;
varying float vHue;
varying vec3 vN;
varying vec3 vV;
void main() {
  float ndv = max(dot(normalize(vN), normalize(vV)), 0.0);
  float fr = pow(1.0 - ndv, 2.0);
  vec3 hue = vHue < 0.5 ? mix(uC0, uC1, vHue * 2.0) : mix(uC1, uC2, vHue * 2.0 - 1.0);
  float a = vAct;
  vec3 off = vec3(0.018, 0.03, 0.06) + hue * 0.035;
  vec3 col = off * (mix(0.7, 0.5, uFlat) + mix(1.6, 0.5, uFlat) * fr);
  col += hue * a * (1.1 + mix(1.4, 0.8, uFlat) * ndv);
  col += vec3(1.0) * pow(a, 3.0) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}
`

const LINE_VERT = /* glsl */ `
attribute float aT;
attribute float aLayer;
attribute float aW;
attribute float aSeed;
uniform float uProg, uLines, uFade;
varying float vI;
void main() {
  float w = uProg - aLayer;
  float head = exp(-pow((aT - w) * 5.0, 2.0)) * step(-0.2, w) * (1.0 - smoothstep(1.0, 1.25, w));
  float lit = step(aT, w) * smoothstep(-0.1, 0.4, w);
  vI = uLines * (0.03 + 0.03 * aSeed + aW * uFade * (head * 1.6 + lit * 0.32));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const LINE_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vI;
void main() { gl_FragColor = vec4(uCol * vI, 1.0); }
`

const PULSE_VERT = /* glsl */ `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aLayer;
attribute float aStr;
attribute float aLag;
uniform float uProg, uPR, uSize;
varying float vA;
void main() {
  float w = uProg - aLayer - aLag * 0.04;
  float s = clamp(w, 0.0, 1.0);
  float e = s * s * (3.0 - 2.0 * s);
  vec3 p = mix(aFrom, aTo, e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float vis = step(0.0, w) * (1.0 - smoothstep(0.9, 1.02, w));
  vA = vis * aStr * (1.0 - aLag * 0.22);
  gl_PointSize = vis > 0.0 ? uSize * uPR * (1.0 - aLag * 0.17) * (11.0 / -mv.z) * (0.55 + 0.6 * aStr) : 0.0;
}
`
const PULSE_FRAG = /* glsl */ `
uniform vec3 uCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(uCol * vA * (exp(-d * 3.5) * 2.2), 1.0);
}
`

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`
const BG_FRAG = /* glsl */ `
uniform vec2 uAspect;
uniform vec2 uCentre;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - uCentre) * uAspect;
  float r = length(p);
  vec3 col = mix(vec3(0.0042, 0.0085, 0.02), vec3(0.0009, 0.0016, 0.0045), smoothstep(0.0, 0.95, r));
  // faint dot grid for a "lab instrument" feel
  vec2 g = fract(vUv * uAspect * 38.0) - 0.5;
  col += vec3(0.004, 0.009, 0.016) * smoothstep(0.08, 0.0, length(g)) * (1.0 - smoothstep(0.2, 0.9, r));
  gl_FragColor = vec4(col, 1.0);
}
`

const lin = (hex: string) => new THREE.Color(hex)

/* ------------------------------------------------------------------ network */

function Network({ net, ctl }: { net: Net; ctl: Ctl }) {
  const { L, N } = net
  const inputN = net.count[0]
  const outStart = net.start[L - 1]

  /* geometry ----------------------------------------------------------- */

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NEURON_VERT,
        fragmentShader: NEURON_FRAG,
        uniforms: { uC0: { value: lin('#4de1ff') }, uC1: { value: lin('#5e86ff') }, uC2: { value: lin('#a689ff') }, uFlat: { value: 0 } },
      }),
    [],
  )
  const pixMat = useMemo(() => {
    const m = mat.clone()
    m.uniforms.uFlat.value = 1
    return m
  }, [mat])

  const pixels = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.03, 0.158, 0.158)
    geo.rotateY(TILT)
    const mesh = new THREE.InstancedMesh(geo, pixMat, inputN)
    const act = new THREE.InstancedBufferAttribute(new Float32Array(inputN), 1)
    act.setUsage(THREE.DynamicDrawUsage)
    const hue = new THREE.InstancedBufferAttribute(new Float32Array(inputN), 1)
    geo.setAttribute('aAct', act)
    geo.setAttribute('aHue', hue)
    const m4 = new THREE.Matrix4()
    for (let i = 0; i < inputN; i++) {
      m4.makeTranslation(net.pos[i * 3], net.pos[i * 3 + 1], net.pos[i * 3 + 2])
      mesh.setMatrixAt(i, m4)
    }
    mesh.frustumCulled = false
    return { mesh, act }
  }, [net, inputN, pixMat])

  const spheres = useMemo(() => {
    const n = N - inputN
    const geo = new THREE.IcosahedronGeometry(1, 2)
    const mesh = new THREE.InstancedMesh(geo, mat, n)
    const act = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
    act.setUsage(THREE.DynamicDrawUsage)
    const hue = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
    geo.setAttribute('aAct', act)
    geo.setAttribute('aHue', hue)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let k = 0; k < n; k++) {
      const g = k + inputN
      const l = net.layerOf[g]
      const r = l === L - 1 ? 0.125 : net.count[l] > 80 ? 0.062 : 0.078
      p.set(net.pos[g * 3], net.pos[g * 3 + 1], net.pos[g * 3 + 2])
      s.setScalar(r)
      m4.compose(p, q, s)
      mesh.setMatrixAt(k, m4)
      hue.array[k] = l === L - 1 ? 0.35 : l / (L - 1)
    }
    mesh.frustumCulled = false
    return { mesh, act }
  }, [net, N, L, inputN, mat])

  const lines = useMemo(() => {
    const n = net.lineSrc.length
    const pos = new Float32Array(n * 6)
    const t = new Float32Array(n * 2)
    const layer = new Float32Array(n * 2)
    const w = new Float32Array(n * 2)
    const seed = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const a = net.lineSrc[i]
      const b = net.lineDst[i]
      pos.set([net.pos[a * 3], net.pos[a * 3 + 1], net.pos[a * 3 + 2], net.pos[b * 3], net.pos[b * 3 + 1], net.pos[b * 3 + 2]], i * 6)
      t[i * 2] = 0
      t[i * 2 + 1] = 1
      layer[i * 2] = layer[i * 2 + 1] = net.lineLayer[i]
      seed[i * 2] = seed[i * 2 + 1] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1))
    g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1))
    const wAttr = new THREE.BufferAttribute(w, 1)
    wAttr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aW', wAttr)
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { uProg: { value: -1 }, uLines: { value: 1 }, uFade: { value: 1 }, uCol: { value: lin('#6fd8ff') } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { g, m, wAttr }
  }, [net])

  const pulses = useMemo(() => {
    const n = MAX_PULSES * TRAIL
    const g = new THREE.BufferGeometry()
    const mk = (k: number) => {
      const a = new THREE.BufferAttribute(new Float32Array(n * k), k)
      a.setUsage(THREE.DynamicDrawUsage)
      return a
    }
    const from = mk(3)
    const to = mk(3)
    const layer = mk(1)
    const str = mk(1)
    const lag = mk(1)
    g.setAttribute('position', mk(3))
    g.setAttribute('aFrom', from)
    g.setAttribute('aTo', to)
    g.setAttribute('aLayer', layer)
    g.setAttribute('aStr', str)
    g.setAttribute('aLag', lag)
    g.setDrawRange(0, 0)
    const m = new THREE.ShaderMaterial({
      vertexShader: PULSE_VERT,
      fragmentShader: PULSE_FRAG,
      uniforms: { uProg: { value: -1 }, uPR: { value: 1 }, uSize: { value: 6 }, uCol: { value: lin('#bff3ff') } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { g, m, from, to, layer, str, lag }
  }, [])

  useEffect(
    () => () => {
      pixels.mesh.geometry.dispose()
      spheres.mesh.geometry.dispose()
      lines.g.dispose()
      lines.m.dispose()
    },
    [pixels, spheres, lines],
  )

  /* state -------------------------------------------------------------- */

  const st = useMemo(() => {
    const rnd = Math.random
    return {
      rnd,
      prog: POSTER ? 3.25 : -MORPH,
      mode: 'pass' as 'pass' | 'draw',
      digit: 3,
      custom: false,
      fromImg: new Float32Array(inputN),
      img: new Float32Array(inputN),
      user: new Float32Array(inputN),
      acts: [] as Float32Array[],
      probs: new Float32Array(10),
      winner: 0,
      disp: new Float32Array(N),
      posted: false,
      runReq: ctl.runReq.current,
      drawReq: ctl.drawReq.current,
      lastPaint: new THREE.Vector2(-99, -99),
      clock: 0,
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...PLANE_N), new THREE.Vector3(net.x[0], 0, 0)),
      hit: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
      v: new THREE.Vector3(),
      hold: HOLD,
      drawIdle: 0,
      started: false,
      swayT: 0,
    }
  }, [net, N, inputN, ctl])

  /** activations + line weights + pulse paths for one pass */
  const startPass = (img: Float32Array, label: number | null) => {
    st.fromImg.set(st.mode === 'draw' ? img : st.img)
    st.img.set(img)
    st.custom = label === null
    if (label === null) st.winner = classify(img, st.probs)
    else {
      labelProbs(label, st.rnd, st.probs)
      st.winner = label
    }
    st.acts = forward(net, img, st.probs, st.winner, Math.floor(st.rnd() * 1e9))
    st.mode = 'pass'
    st.prog = label === null ? -0.25 : -MORPH
    st.posted = false
    st.hold = label === null ? HOLD * 2.2 : HOLD
    st.drawIdle = 0
    ctl.onResult(null)
    if (label === null) {
      ctl.drawMode.current = false
      ctl.onDrawMode(false)
    }

    const actOf = (g: number) => st.acts[net.layerOf[g]][g - net.start[net.layerOf[g]]]
    // line weights
    const nL = net.lineSrc.length
    const w = lines.wAttr.array as Float32Array
    for (let i = 0; i < nL; i++) {
      const s = actOf(net.lineSrc[i]) * actOf(net.lineDst[i])
      w[i * 2] = w[i * 2 + 1] = Math.min(1, s * 1.6)
    }
    lines.wAttr.needsUpdate = true
    // pulses: strongest active connections per transition
    const cand: { i: number; s: number }[][] = Array.from({ length: L - 1 }, () => [])
    for (let i = 0; i < nL; i++) {
      const s = actOf(net.lineSrc[i]) * actOf(net.lineDst[i])
      if (s > 0.06) cand[net.lineLayer[i]].push({ i, s })
    }
    let k = 0
    const fa = pulses.from.array as Float32Array
    const ta = pulses.to.array as Float32Array
    const la = pulses.layer.array as Float32Array
    const sa = pulses.str.array as Float32Array
    const ga = pulses.lag.array as Float32Array
    for (let l = 0; l < L - 1; l++) {
      const list = cand[l].sort((a, b) => b.s - a.s).slice(0, 150)
      for (const { i, s } of list) {
        const a = net.lineSrc[i]
        const b = net.lineDst[i]
        const delay = st.rnd() * 0.12
        for (let tr = 0; tr < TRAIL; tr++) {
          fa.set([net.pos[a * 3], net.pos[a * 3 + 1], net.pos[a * 3 + 2]], k * 3)
          ta.set([net.pos[b * 3], net.pos[b * 3 + 1], net.pos[b * 3 + 2]], k * 3)
          la[k] = l + delay
          sa[k] = Math.min(1, 0.35 + s * 1.2)
          ga[k] = tr
          k++
        }
      }
    }
    for (const a of [pulses.from, pulses.to, pulses.layer, pulses.str, pulses.lag]) a.needsUpdate = true
    pulses.g.setDrawRange(0, k)
  }

  const nextDigit = () => {
    let d = Math.floor(st.rnd() * 10)
    if (d === st.digit) d = (d + 1 + Math.floor(st.rnd() * 9)) % 10
    st.digit = d
    startPass(renderDigit(d, 1, st.rnd), d)
  }

  useEffect(() => {
    // warm the template classifier off the critical path
    const id = window.setTimeout(() => classify(new Float32Array(SIDE * SIDE), new Float32Array(10)), 2500)
    return () => window.clearTimeout(id)
  }, [])

  /* painting ----------------------------------------------------------- */

  const paintAt = (c: number, r: number) => {
    const g = st.user
    for (let rr = Math.floor(r - 2); rr <= Math.ceil(r + 2); rr++)
      for (let cc = Math.floor(c - 2); cc <= Math.ceil(c + 2); cc++) {
        if (rr < 0 || cc < 0 || rr >= SIDE || cc >= SIDE) continue
        const d = Math.hypot(cc + 0.5 - c, rr + 0.5 - r)
        const v = THREE.MathUtils.smoothstep(1.2, 0.35, d)
        g[rr * SIDE + cc] = Math.max(g[rr * SIDE + cc], v)
      }
  }

  /* frame -------------------------------------------------------------- */

  useFrame((state, raw) => {
    const dt = Math.min(raw, 1 / 30)
    st.clock += dt
    const cam = state.camera as THREE.PerspectiveCamera
    const { width, height } = state.size
    ctl.view.cam = cam
    ctl.view.w = width
    ctl.view.h = height
    ctl.view.x0 = net.x[0]
    ctl.view.half = (SIDE / 2) * 0.2

    /* first pass (poster: caught mid-flight, answer already up) */
    if (!st.started) {
      st.started = true
      st.mode = 'draw' // first image appears without a morph from blank
      st.digit = POSTER ? 7 : Math.floor(Math.random() * 10)
      startPass(renderDigit(st.digit, POSTER ? 0.4 : 1, st.rnd), st.digit)
      if (POSTER) {
        st.prog = L - 1.45
        st.posted = true
        ctl.onResult({ winner: st.winner, probs: Array.from(st.probs), custom: false })
      }
    }

    /* requests from the page */
    if (ctl.runReq.current !== st.runReq) {
      st.runReq = ctl.runReq.current
      if (st.mode === 'draw' && st.user.some((v) => v > 0.2)) startPass(st.user.slice(), null)
      else {
        ctl.drawMode.current = false
        ctl.onDrawMode(false)
        if (st.mode === 'draw') st.mode = 'pass'
        nextDigit()
      }
    }
    if (ctl.drawReq.current !== st.drawReq) {
      st.drawReq = ctl.drawReq.current
      st.mode = 'draw'
      st.user.fill(0)
      st.fromImg.set(st.img)
      st.prog = -MORPH
      ctl.onResult(null)
    }

    /* drawing */
    const P = ctl.pointer.current
    if (P.drawing) {
      if (st.mode !== 'draw') {
        st.mode = 'draw'
        st.user.fill(0)
        st.fromImg.set(st.img)
        st.prog = -MORPH
        ctl.onResult(null)
        ctl.drawMode.current = true
        ctl.onDrawMode(true)
      }
      st.ndc.set((P.x / width) * 2 - 1, -(P.y / height) * 2 + 1)
      st.ray.setFromCamera(st.ndc, cam)
      if (st.ray.ray.intersectPlane(st.plane, st.hit)) {
        const { c, r } = inputCell(net.x[0], st.hit.x, st.hit.y, st.hit.z, 0.2)
        const last = st.lastPaint
        const dist = last.x < -50 ? 0 : Math.hypot(c - last.x, r - last.y)
        const steps = Math.max(1, Math.ceil(dist / 0.3))
        for (let s = 1; s <= steps; s++) {
          const k = s / steps
          paintAt(last.x < -50 ? c : last.x + (c - last.x) * k, last.x < -50 ? r : last.y + (r - last.y) * k)
        }
        last.set(c, r)
      }
    } else {
      st.lastPaint.set(-99, -99)
      if (st.mode === 'draw' && P.strokes > 0 && performance.now() - P.lastUp > 850 && st.user.some((v) => v > 0.2)) {
        P.strokes = 0
        startPass(st.user.slice(), null)
      }
    }

    /* timeline */
    const speed = ctl.speed.current
    if (st.mode === 'pass') {
      st.prog += (dt * speed) / UNIT
      if (POSTER) st.prog = Math.min(st.prog, L - 1.3)
      if (!st.posted && st.prog >= L - 1 - 0.05) {
        st.posted = true
        ctl.onResult({ winner: st.winner, probs: Array.from(st.probs), custom: st.custom })
      }
      if (st.prog > L - 1 + st.hold && !ctl.drawMode.current) nextDigit()
    } else {
      st.prog = Math.min(st.prog + (dt * speed) / UNIT, 0)
      // nobody drew anything for a while → back to the auto loop
      st.drawIdle = P.drawing ? 0 : st.drawIdle + dt
      if (st.drawIdle > 14 && !st.user.some((v) => v > 0.2)) {
        ctl.drawMode.current = false
        ctl.onDrawMode(false)
        nextDigit()
      }
    }

    /* displayed activations */
    const d = st.disp
    const prog = st.prog
    const morph = THREE.MathUtils.smoothstep(prog, -MORPH, -0.05)
    const kUp = 1 - Math.exp(-dt * 14)
    const kDown = 1 - Math.exp(-dt * 5)
    for (let i = 0; i < inputN; i++) {
      const target = st.mode === 'draw' ? THREE.MathUtils.lerp(st.fromImg[i] * 0.25, st.user[i], Math.max(morph, st.user[i])) : THREE.MathUtils.lerp(st.fromImg[i], st.img[i], morph)
      d[i] += (target - d[i]) * (target > d[i] ? kUp : kDown)
    }
    const pa = pixels.act.array as Float32Array
    for (let i = 0; i < inputN; i++) pa[i] = d[i]
    pixels.act.needsUpdate = true

    const sa = spheres.act.array as Float32Array
    for (let g = inputN; g < N; g++) {
      const l = net.layerOf[g]
      const on = st.mode === 'pass' ? THREE.MathUtils.smoothstep(prog, l - 0.22, l + 0.04) : 0
      const a = st.acts[l]?.[g - net.start[l]] ?? 0
      const target = a * on
      d[g] += (target - d[g]) * (target > d[g] ? kUp : kDown)
      sa[g - inputN] = d[g]
    }
    spheres.act.needsUpdate = true

    lines.m.uniforms.uProg.value = st.mode === 'pass' ? prog : -5
    lines.m.uniforms.uLines.value = ctl.lines.get()
    lines.m.uniforms.uFade.value = st.mode === 'pass' ? 1 - THREE.MathUtils.smoothstep(prog, L - 1 + st.hold - 0.8, L - 1 + st.hold) : 0
    pulses.m.uniforms.uProg.value = st.mode === 'pass' ? prog : -5
    pulses.m.uniforms.uPR.value = state.viewport.dpr

    /* camera */
    const dr = ctl.drag.current
    if (!dr.down) {
      dr.yaw += dr.vy * dt
      dr.pitch += dr.vp * dt
      const k = Math.exp(-dt * 3.2)
      dr.vy *= k
      dr.vp *= k
    }
    dr.pitch = THREE.MathUtils.clamp(dr.pitch, -0.6, 0.85)
    const idle = !dr.down && performance.now() - dr.last > 3000 && !P.drawing && st.mode !== 'draw'
    if (idle) {
      // ease the drag offset home, then sway
      dr.yaw *= Math.exp(-dt * 0.35)
      dr.pitch *= Math.exp(-dt * 0.35)
    }
    const mobile = width < 760
    const aspect = width / height
    if (st.mode !== 'draw' && !P.drawing) st.swayT += dt
    const sway = POSTER ? 0 : Math.sin(st.swayT * 0.13) * 0.16
    const yaw = (mobile ? -0.7 : -0.6) + sway + dr.yaw
    const pitch = (mobile ? 0.3 : 0.2) + dr.pitch
    const span = (L - 1) * 1.85 + 3.4
    const R = ((span * (mobile ? 1.6 : 1.18) + 4.8) / Math.min(1, aspect / (mobile ? 0.75 : 1.45))) * (POSTER ? 0.86 : 1)
    // the input image sits nearest the camera and reads bigger: aim a little toward it to balance the frame
    const cx = mobile ? -0.3 : POSTER ? -0.5 : 0
    cam.position.set(cx + Math.sin(yaw) * Math.cos(pitch) * R, Math.sin(pitch) * R, Math.cos(yaw) * Math.cos(pitch) * R)
    cam.lookAt(cx, 0, 0)
    const ox = POSTER || mobile ? 0 : 0.185
    const oy = POSTER ? 0 : mobile ? 0.15 : 0
    if (ox || oy) cam.setViewOffset(width, height, -ox * width, oy * height, width, height)
    else cam.clearViewOffset()
    cam.updateProjectionMatrix()

    /* output labels */
    const labs = ctl.labels.current
    for (let k = 0; k < 10; k++) {
      const el = labs[k]
      if (!el) continue
      const g = outStart + k
      st.v.set(net.pos[g * 3], net.pos[g * 3 + 1], net.pos[g * 3 + 2]).project(cam)
      const x = (st.v.x * 0.5 + 0.5) * width
      const y = (-st.v.y * 0.5 + 0.5) * height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
  })

  return (
    <>
      <primitive object={pixels.mesh} />
      <primitive object={spheres.mesh} />
      <lineSegments geometry={lines.g} material={lines.m} frustumCulled={false} renderOrder={2} />
      <points geometry={pulses.g} material={pulses.m} frustumCulled={false} renderOrder={3} />
    </>
  )
}

function Backdrop() {
  const size = useThree((s) => s.size)
  const bg = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BG_VERT,
        fragmentShader: BG_FRAG,
        uniforms: { uAspect: { value: new THREE.Vector2(1, 1) }, uCentre: { value: new THREE.Vector2(0.6, 0.5) } },
        depthWrite: false,
        depthTest: false,
      }),
    [],
  )
  useFrame(() => {
    const a = size.width / size.height
    bg.uniforms.uAspect.value.set(Math.max(a, 1), Math.max(1 / a, 1))
    const mobile = size.width < 760
    bg.uniforms.uCentre.value.set(POSTER || mobile ? 0.5 : 0.62, mobile && !POSTER ? 0.66 : 0.5)
  })
  return (
    <mesh material={bg} frustumCulled={false} renderOrder={-2}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ page */

export default function NeuralNet() {
  const phone = useMemo(() => typeof window !== 'undefined' && window.innerWidth < 760, [])
  const [netIdx, setNetIdx] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [linesOn, setLinesOn] = useState(true)
  const [result, setResult] = useState<Result>(null)
  const [drawing, setDrawing] = useState(false)

  const net = useMemo(() => buildNet(NETS[netIdx]), [netIdx])
  const speedRef = useRef(1)
  const linesMv = useMotionValue(1)
  const runReq = useRef(0)
  const drawReq = useRef(0)
  const drawMode = useRef(false)
  const drag = useRef({ yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, last: -1e9 })
  const pointer = useRef({ x: 0, y: 0, drawing: false, lastUp: 0, strokes: 0 })
  const labels = useRef<(HTMLDivElement | null)[]>([])
  const press = useRef({ x: 0, y: 0, t: 0, id: -1, moved: 0 })

  const ctl = useMemo<Ctl>(
    () => ({
      speed: speedRef,
      lines: linesMv,
      runReq,
      drawReq,
      drawMode,
      drag,
      pointer,
      labels,
      view: { cam: null, w: 1, h: 1, x0: 0, half: 1.6 },
      onResult: (r) => setResult(r),
      onDrawMode: (on) => setDrawing(on),
    }),
    [linesMv],
  )

  useEffect(() => {
    const c = animate(linesMv, linesOn ? 1 : 0, { duration: 0.6, ease: [0.23, 1, 0.32, 1] })
    return () => c.stop()
  }, [linesOn, linesMv])

  /** does a client point land on the input image (with a margin)? */
  const onGrid = (x: number, y: number, rect: DOMRect) => {
    const v = ctl.view
    if (!v.cam) return false
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, v.cam)
    const hit = new THREE.Vector3()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...PLANE_N), new THREE.Vector3(v.x0, 0, 0))
    if (!ray.ray.intersectPlane(plane, hit)) return false
    const { c, r } = inputCell(v.x0, hit.x, hit.y, hit.z, 0.2)
    return c > -1.5 && c < SIDE + 1.5 && r > -1.5 && r < SIDE + 1.5
  }

  const winner = result?.winner ?? -1
  // keep the last numbers on screen while the labels fade out between passes
  const lastRes = useRef<Result>(null)
  if (result) lastRes.current = result
  const shown = lastRes.current

  return (
    <div
      className="stage nn-stage"
      style={{ background: '#050812', touchAction: 'none' }}
      onPointerDown={(e) => {
        const el = e.target as HTMLElement
        if (el.closest?.('.dock, .hero-copy, .demo-chrome, button')) return
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        press.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: 0 }
        if (onGrid(e.clientX, e.clientY, rect)) {
          pointer.current.drawing = true
          pointer.current.strokes++
          pointer.current.x = e.clientX - rect.left
          pointer.current.y = e.clientY - rect.top
          drawMode.current = true
          setDrawing(true)
          return
        }
        const d = drag.current
        d.down = true
        d.vy = d.vp = 0
        d.last = performance.now()
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== press.current.id) return
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const P = pointer.current
        if (P.drawing) {
          P.x = e.clientX - rect.left
          P.y = e.clientY - rect.top
          return
        }
        const d = drag.current
        if (!d.down) return
        const now = performance.now()
        const dx = e.clientX - press.current.x
        const dy = e.clientY - press.current.y
        press.current.moved += Math.abs(dx) + Math.abs(dy)
        const dts = Math.max((now - press.current.t) / 1000, 1 / 240)
        const k = 3.2 / Math.max(window.innerWidth, 600)
        d.yaw -= dx * k
        d.pitch += dy * k
        d.vy = THREE.MathUtils.lerp(d.vy, (-dx * k) / dts, 0.5)
        d.vp = THREE.MathUtils.lerp(d.vp, (dy * k) / dts, 0.5)
        d.last = now
        press.current.x = e.clientX
        press.current.y = e.clientY
        press.current.t = now
      }}
      onPointerUp={(e) => {
        if (e.pointerId !== press.current.id) return
        press.current.id = -1
        const P = pointer.current
        if (P.drawing) {
          P.drawing = false
          P.lastUp = performance.now()
          return
        }
        const d = drag.current
        d.down = false
        d.last = performance.now()
        if (performance.now() - press.current.t > 80) d.vy = d.vp = 0
        if (press.current.moved < 6) runReq.current++ // a click (not a drag) runs a pass
      }}
      onPointerCancel={() => {
        drag.current.down = false
        pointer.current.drawing = false
      }}
    >
      <style>{`
        .nn-stage canvas { cursor: grab; }
        .nn-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .nn-lab { position: absolute; left: 0; top: 0; will-change: transform; }
        .nn-lab > div { display: flex; align-items: center; gap: 8px; transform: translate(16px, -50%); font: 500 12px/1 var(--mono); color: rgba(200, 225, 255, 0.42); transition: color .4s; white-space: nowrap; }
        .nn-lab b { width: 10px; font-weight: 600; text-align: center; font-size: 13px; }
        .nn-lab .bar { position: relative; width: 54px; height: 3px; border-radius: 2px; background: rgba(140, 190, 255, 0.12); overflow: hidden; }
        .nn-lab .bar i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: #6fd8ff; transition: width .7s cubic-bezier(.23,1,.32,1); }
        .nn-lab em { font-style: normal; opacity: 0; transition: opacity .4s; font-variant-numeric: tabular-nums; }
        .nn-lab.on > div { color: #f2fbff; }
        .nn-lab.on b { font-size: 17px; text-shadow: 0 0 14px rgba(111, 216, 255, 0.9); }
        .nn-lab.on .bar { width: 64px; height: 4px; }
        .nn-lab.on .bar i { background: linear-gradient(90deg, #4de1ff, #e9fbff); box-shadow: 0 0 10px #4de1ff; }
        .nn-lab.on em { opacity: 1; color: #bff3ff; }
        .nn-draw-tip { position: absolute; left: 50%; top: 84px; transform: translateX(-50%); padding: 9px 16px; border-radius: 999px; font: 500 13px/1 var(--sans); color: #dff7ff; background: rgba(20, 40, 70, 0.55); box-shadow: inset 0 0 0 1px rgba(111, 216, 255, 0.28); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); pointer-events: none !important; white-space: nowrap; }
        .nn-stage .hero-copy .kicker i { background: #4de1ff; box-shadow: 0 0 10px #4de1ff; }
        .nn-pred { display: inline-flex; align-items: baseline; gap: 10px; margin-top: 22px; font: 500 12px/1 var(--mono); color: var(--fg-2); letter-spacing: .04em; min-height: 28px; }
        .nn-pred b { font: 600 28px/1 var(--display); color: #e9fbff; letter-spacing: 0; text-shadow: 0 0 18px rgba(77, 225, 255, 0.55); }
        .nn-toggle i { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; vertical-align: 1px; background: currentColor; opacity: .35; transition: opacity .2s, background .2s; }
        .nn-toggle[aria-pressed='true'] i { opacity: 1; background: #4de1ff; box-shadow: 0 0 8px #4de1ff; }
        .nn-toggle .seg-bg { position: absolute; inset: 0; border-radius: inherit; background: color-mix(in srgb, var(--fg) 10%, transparent); z-index: -1; }
        @media (max-width: 760px) {
          .nn-stage .hero-copy h1 { font-size: 34px; }
          .nn-stage .hero-copy p { font-size: 14px; line-height: 1.65; margin-top: 12px; }
          .nn-stage .hero-actions { margin-top: 18px; }
          .nn-stage .btn { height: 40px; padding: 0 16px; }
          .nn-pred { display: none; }
          .nn-lab > div { gap: 6px; font-size: 10px; transform: translate(11px, -50%); }
          .nn-lab .bar { width: 26px; }
          .nn-lab:not(.on) .bar { opacity: 0; }
          .nn-lab.on .bar { width: 40px; }
          .nn-lab.on b { font-size: 14px; }
          .nn-stage .dock .seg { padding: 0 10px; }
          .nn-stage .dock .dock-sep { margin: 0 2px; }
        }
      `}</style>

      <Canvas dpr={[1, 2]} camera={{ position: [-8, 3, 12], fov: 36, near: 0.1, far: 200 }} gl={{ antialias: true, alpha: false }}>
        <Backdrop />
        <Network key={netIdx} net={net} ctl={ctl} />
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.5} luminanceSmoothing={0.3} radius={0.62} />
          <ToneMapping mode={ToneMappingMode.AGX} />
        </EffectComposer>
      </Canvas>

      <div className="nn-labels" aria-hidden>
        {Array.from({ length: 10 }, (_, k) => {
          const p = result?.probs[k] ?? 0
          const q = shown?.probs[k] ?? 0
          return (
            <div key={k} ref={(el) => void (labels.current[k] = el)} className={`nn-lab${k === winner ? ' on' : ''}`}>
              <div>
                <b>{k}</b>
                <span className="bar">
                  <i style={{ width: `${Math.round(Math.max(p, result ? 0.015 : 0) * 100)}%` }} />
                </span>
                <em>{(q * 100).toFixed(1)}%</em>
              </div>
            </div>
          )
        })}
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" style={{ ['--soft-bg' as string]: 'rgba(5, 8, 18, 0.72)' }} />
          <p className="kicker">
            <i /> Forward pass · {NETS[netIdx].layers.length} layers
          </p>
          <h1>
            一次推理，
            <br />
            从像素到答案
          </h1>
          <p>左边是一张 16×16 的手写数字。信号沿连接逐层向右传，被激活的神经元依次点亮，最后汇聚到 0–9 中的一个答案。</p>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => runReq.current++}>
              {drawing ? '识别我写的' : '再推理一次'}
            </button>
            <button
              className="btn"
              onClick={() => {
                drawReq.current++
                drawMode.current = true
                setDrawing(true)
              }}
            >
              手写一个
            </button>
          </div>
          <div className="nn-pred">
            {result ? (
              <>
                {result.custom ? '你写的是' : '预测'} <b>{result.winner}</b> 置信度 {(result.probs[result.winner] * 100).toFixed(1)}%
              </>
            ) : (
              <span>{drawing ? '在输入网格上写一个 0–9' : '推理中…'}</span>
            )}
          </div>
        </motion.div>

        {drawing && <div className="nn-draw-tip">在左侧像素网格上写一个 0–9，松手后自动识别</div>}

        <div className="dock">
          <Seg items={NETS.map((n, i) => ({ value: i, label: phone ? `${n.layers.length}层` : `${n.label} ${n.layers.length}层` }))} value={netIdx} onChange={setNetIdx} />
          <span className="dock-sep" />
          <Seg
            items={SPEEDS}
            value={speed}
            onChange={(v) => {
              speedRef.current = v
              setSpeed(v)
            }}
          />
          <span className="dock-sep" />
          <button className="seg nn-toggle" aria-pressed={linesOn} onClick={() => setLinesOn((v) => !v)}>
            {linesOn && <span className="seg-bg" />}
            <span>
              <i />
              连线
            </span>
          </button>
        </div>
        <p className="hint">
          点击空白处推理下一张 · 拖动旋转
          <br />
          可以直接在像素网格上手写
        </p>
      </div>
    </div>
  )
}
