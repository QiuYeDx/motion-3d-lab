import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { LMAX, LMIN, NW, QuadBuf, beamFrag, beamVert, buildSpectrum, hueOf, makeTrace, trace, type Bounds } from './prismOptics'

/*
 * 棱镜分光 — real 2D geometric optics: every wavelength is traced separately through the prism
 * (Snell's law, Cauchy dispersion n(λ) = A + B/λ², Fresnel losses, total internal reflection).
 * Beams are soft additive quads whose colours sum to exactly white where all wavelengths overlap,
 * so the white beam, the faint internal fan and the outgoing rainbow are the same physics.
 */

const GLASSES = [
  { key: 'crown', zh: '冕牌', en: 'BK7 crown', A: 1.5046, B: 0.0042 },
  { key: 'flint', zh: '火石', en: 'SF11 flint', A: 1.728, B: 0.01342 },
  { key: 'diamond', zh: '钻石', en: 'Diamond', A: 2.3818, B: 0.0121 },
]
const LASER_NM = 532

/* CCW triangles, centroid at the origin */
const EQUI = new Float32Array([-1.6, -0.924, 1.6, -0.924, 0, 1.848])
const RIGHT = new Float32Array([-2.0, -1.0, 1.0, -1.0, 1.0, 2.0])
/* the beam aims at the middle of the entry face; idle orbit sweeps the beam elevation [centre, amplitude] */
const AIM = [
  [-0.62, 0.42],
  [-0.42, 0.46],
]
const ORBIT = [
  [0.5, 0.37],
  [0.2, 0.33],
]

const SPEC = buildSpectrum()
const LASER_RGB = hueOf(LASER_NM)
const REF_NM = 589

type Lay = { zoom: number; cx: number; cy: number; R: number; Rmin: number; sx: number; sy0: number; sy1: number; labels: boolean }

function layout(W: number, H: number): Lay {
  const mobile = W < 760
  if (POSTER) {
    const zoom = Math.min(W / 11.2, H / 8.4)
    return { zoom, cx: 0.55, cy: -0.55, R: 4.0, Rmin: 2.4, sx: 5.4, sy0: -3.9, sy1: 2.2, labels: false }
  }
  if (mobile) {
    const zoom = W / 8.1
    // prism ~31% from the top, copy owns the bottom
    return { zoom, cx: 0.25, cy: -(0.19 * H) / zoom, R: 3.0, Rmin: 2.2, sx: 3.75, sy0: -3.4, sy1: 1.8, labels: false }
  }
  const zoom = Math.min(H / 9.6, W / 15.5)
  return { zoom, cx: -(0.155 * W) / zoom, cy: -0.45, R: 3.3, Rmin: 2.4, sx: 4.45, sy0: -3.9, sy1: 2.2, labels: true }
}

type Ctl = {
  A: MotionValue<number>
  B: MotionValue<number>
  morph: MotionValue<number>
  laser: MotionValue<number>
  inc: MotionValue<number>
  dev: MotionValue<number>
  nRef: MotionValue<number>
}

type Ptr = { down: boolean; x: number; y: number; last: number; touched: boolean }

const bgFrag = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uC;
uniform vec2 uRes;
uniform float uTime;
float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 px = vUv * uRes;
  float d = length(px - uC) / uRes.y;
  vec3 col = vec3(0.0016, 0.0016, 0.0024) + vec3(0.010, 0.010, 0.016) * exp(-d * d * 5.0);
  col += (h(px + fract(uTime) * 97.0) - 0.5) * 0.0018;
  gl_FragColor = vec4(col, 1.0);
}
`

const fillVert = /* glsl */ `
attribute vec3 aBary;
varying vec3 vB;
varying float vY;
void main() {
  vB = aBary;
  vY = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const fillFrag = /* glsl */ `
precision highp float;
varying vec3 vB;
varying float vY;
void main() {
  float e = min(min(vB.x, vB.y), vB.z);
  vec3 c = vec3(0.5, 0.62, 0.9) * (0.0025 + 0.006 * clamp(vY * 0.35 + 0.5, 0.0, 1.0));
  c += vec3(0.75, 0.85, 1.0) * (exp(-e * 70.0) * 0.05 + exp(-e * 16.0) * 0.006);
  gl_FragColor = vec4(c, 1.0);
}
`

function roundedRect(w: number, h: number, r: number, x0: number) {
  const s = new THREE.Shape()
  const y0 = -h / 2
  s.moveTo(x0 + r, y0)
  s.lineTo(x0 + w - r, y0)
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r)
  s.lineTo(x0 + w, y0 + h - r)
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h)
  s.lineTo(x0 + r, y0 + h)
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r)
  s.lineTo(x0, y0 + r)
  s.quadraticCurveTo(x0, y0, x0 + r, y0)
  return new THREE.ShapeGeometry(s, 6)
}

type LabelRefs = {
  inc: React.RefObject<HTMLDivElement | null>
  dev: React.RefObject<HTMLDivElement | null>
  red: React.RefObject<HTMLDivElement | null>
  violet: React.RefObject<HTMLDivElement | null>
  drag: React.RefObject<HTMLDivElement | null>
}

function Optics({ ctl, ptr, labels, onTir }: { ctl: Ctl; ptr: React.RefObject<Ptr>; labels: LabelRefs; onTir: (v: boolean) => void }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)

  const R = useMemo(() => {
    const quads = new QuadBuf(1400)
    const beamMat = new THREE.ShaderMaterial({ vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    const bgMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: bgFrag,
      uniforms: { uC: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    })
    const fillGeo = new THREE.BufferGeometry()
    fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3).setUsage(THREE.DynamicDrawUsage))
    fillGeo.setAttribute('aBary', new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3))
    fillGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100)
    const fillMat = new THREE.ShaderMaterial({ vertexShader: fillVert, fragmentShader: fillFrag, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })
    const body = roundedRect(0.86, 0.48, 0.12, -0.8)
    const rim = roundedRect(0.92, 0.54, 0.15, -0.83)
    const lens = new THREE.CircleGeometry(0.11, 24)
    const ring = new THREE.RingGeometry(0.6, 0.62, 64)
    const screen = roundedRect(1, 0.14, 0.07, -0.5)
    const traces = Array.from({ length: NW }, makeTrace)
    const ref = makeTrace()
    const las = makeTrace()
    return { quads, beamMat, bgMat, fillGeo, fillMat, body, rim, lens, ring, screen, traces, ref, las }
  }, [])

  useEffect(
    () => () => {
      R.quads.dispose()
      ;[R.beamMat, R.bgMat, R.fillMat].forEach((m) => m.dispose())
      ;[R.fillGeo, R.body, R.rim, R.lens, R.ring, R.screen].forEach((g) => g.dispose())
    },
    [R],
  )

  const lamp = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const screenRef = useRef<THREE.Mesh>(null)
  const st = useRef({ t: 0, sx: 0, sy: 0, init: false, tir: false, V: new Float32Array(6), lastLay: '' })
  const B = useRef<Bounds>({ x0: -20, x1: 20, y0: -20, y1: 20, sx: 5, sy0: -3, sy1: 2 })
  const fin = useRef({ dx: new Float32Array(NW), dy: new Float32Array(NW) })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const s = st.current
    s.t += dt
    const W = size.width
    const H = size.height
    const L = layout(W, H)
    const key = `${W}x${H}`
    if (s.lastLay !== key) {
      s.lastLay = key
      camera.zoom = L.zoom
      camera.position.set(L.cx, L.cy, 10)
      camera.updateProjectionMatrix()
    }
    const toScreenX = (x: number) => (x - L.cx) * L.zoom + W / 2
    const toScreenY = (y: number) => H / 2 - (y - L.cy) * L.zoom
    const bounds = B.current
    bounds.x0 = L.cx - W / 2 / L.zoom - 1
    bounds.x1 = L.cx + W / 2 / L.zoom + 1
    bounds.y0 = L.cy - H / 2 / L.zoom - 1
    bounds.y1 = L.cy + H / 2 / L.zoom + 1
    bounds.sx = L.sx
    bounds.sy0 = L.sy0
    bounds.sy1 = L.sy1

    // prism geometry (morphs between the two shapes)
    const m = ctl.morph.get()
    const V = s.V
    for (let i = 0; i < 6; i++) V[i] = EQUI[i] + (RIGHT[i] - EQUI[i]) * m
    const ax = AIM[0][0] + (AIM[1][0] - AIM[0][0]) * m
    const ay = AIM[0][1] + (AIM[1][1] - AIM[0][1]) * m
    const fp = R.fillGeo.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < 3; i++) fp.setXYZ(i, V[i * 2], V[i * 2 + 1], 0)
    fp.needsUpdate = true

    // light source: slow orbit, or follow the pointer
    const p = ptr.current
    const oc = ORBIT[0][0] + (ORBIT[1][0] - ORBIT[0][0]) * m
    const oa = ORBIT[0][1] + (ORBIT[1][1] - ORBIT[0][1]) * m
    const orbit = oc + oa * Math.sin(s.t * 0.32 - 0.6) // beam elevation (rad)
    let tx = ax - Math.cos(orbit) * L.R
    let ty = ay - Math.sin(orbit) * L.R
    let lam = 2.2
    if (p.down || (!POSTER && performance.now() - p.last < 6000)) {
      const wx = L.cx + (p.x - W / 2) / L.zoom
      const wy = L.cy - (p.y - H / 2) / L.zoom
      tx = wx
      ty = wy
      lam = p.down ? 16 : 6
      if (p.down) p.last = performance.now()
    }
    // keep the lamp outside the glass and on screen
    let ox = tx - ax
    let oy = ty - ay
    const od = Math.hypot(ox, oy)
    if (od < L.Rmin) {
      ox = (ox / (od || 1)) * L.Rmin
      oy = (oy / (od || 1)) * L.Rmin
    }
    tx = Math.min(bounds.x1 - 1.6, Math.max(bounds.x0 + 1.6, ax + ox))
    ty = Math.min(bounds.y1 - 1.9, Math.max(bounds.y0 + 2.3, ay + oy))
    if (!s.init) {
      s.init = true
      s.sx = tx
      s.sy = ty
    }
    const k = 1 - Math.exp(-lam * dt)
    s.sx += (tx - s.sx) * k
    s.sy += (ty - s.sy) * k
    let dx = ax - s.sx
    let dy = ay - s.sy
    const dl = Math.hypot(dx, dy)
    dx /= dl
    dy /= dl
    const ang = Math.atan2(dy, dx)
    if (lamp.current) {
      lamp.current.position.set(s.sx, s.sy, 0)
      lamp.current.rotation.z = ang
    }
    if (ringRef.current) {
      const idle = !p.touched && !POSTER
      const pulse = idle ? 0.5 + 0.5 * Math.sin(s.t * 2.4) : 0
      ringRef.current.scale.setScalar(1 + pulse * 0.12)
      ;(ringRef.current.material as THREE.MeshBasicMaterial).opacity = idle ? 0.1 + pulse * 0.16 : p.down ? 0.22 : 0.06
    }
    if (screenRef.current) {
      screenRef.current.position.set(L.sx + 0.07, (L.sy0 + L.sy1) / 2, 0)
      screenRef.current.rotation.z = Math.PI / 2
      screenRef.current.scale.set(L.sy1 - L.sy0, 1, 1)
    }

    // ---- trace
    const A = ctl.A.get()
    const Bc = ctl.B.get()
    const nOf = (l: number) => A + Bc / ((l / 1000) * (l / 1000))
    const laser = ctl.laser.get()
    const white = 1 - laser
    const ox0 = s.sx
    const oy0 = s.sy
    const Q = R.quads
    Q.begin()

    const G = 3.4
    const hw0 = 0.05

    // reference ray (589 nm, or the laser line) drives the readouts and guides
    const refT = R.ref
    trace(ox0, oy0, dx, dy, nOf(laser > 0.5 ? LASER_NM : REF_NM), V, bounds, refT)

    if (white > 0.01) {
      for (let i = 0; i < NW; i++) {
        const T = R.traces[i]
        trace(ox0, oy0, dx, dy, nOf(SPEC.lam[i]), V, bounds, T)
        fin.current.dx[i] = T.dx
        fin.current.dy[i] = T.dy
      }
      for (let i = 0; i < NW; i++) {
        const T = R.traces[i]
        const wr = SPEC.w[i * 3] * G * white
        const wg = SPEC.w[i * 3 + 1] * G * white
        const wb = SPEC.w[i * 3 + 2] * G * white
        // angular gap to the neighbours: widen the outgoing ray so the fan fills in
        const a = Math.max(0, i - 1)
        const b = Math.min(NW - 1, i + 1)
        const gap = Math.min(0.05, Math.abs(Math.atan2(fin.current.dx[a] * fin.current.dy[b] - fin.current.dy[a] * fin.current.dx[b], fin.current.dx[a] * fin.current.dx[b] + fin.current.dy[a] * fin.current.dy[b])) / (b - a))
        for (let j = 1; j < T.ns; j++) {
          const o = j * 6
          const x0 = T.seg[o]
          const y0 = T.seg[o + 1]
          const x1 = T.seg[o + 2]
          const y1 = T.seg[o + 3]
          const I = T.seg[o + 5]
          if (T.seg[o + 4] > 0.5) {
            Q.seg(x0, y0, x1, y1, hw0, hw0, wr, wg, wb, I * 0.7, I * 0.7)
          } else {
            const len = Math.hypot(x1 - x0, y1 - y0)
            const hw1 = hw0 + len * gap * 0.75
            const fall = Math.max(0.16, hw0 / hw1)
            Q.seg(x0, y0, x1, y1, hw0, hw1, wr, wg, wb, I, I * fall * 1.35)
          }
        }
        // the spectrum painted on the screen
        if (T.screen) {
          const lastI = T.seg[(T.ns - 1) * 6 + 5]
          const hh = 0.07 + Math.min(0.2, gap * 6)
          Q.seg(bounds.sx - 0.005, T.sy - hh, bounds.sx - 0.005, T.sy + hh, 0.05, 0.05, wr, wg, wb, lastI * 2.2, lastI * 2.2, 0, 1)
          Q.seg(bounds.sx - 0.005, T.sy - hh * 2.5, bounds.sx - 0.005, T.sy + hh * 2.5, 0.3, 0.3, wr, wg, wb, lastI * 0.35, lastI * 0.35, 0, 1)
        }
      }
    }

    if (laser > 0.01) {
      const T = R.las
      trace(ox0, oy0, dx, dy, nOf(LASER_NM), V, bounds, T)
      const [r, g, b] = LASER_RGB
      const Gl = 2.2 * laser
      for (let j = 1; j < T.ns; j++) {
        const o = j * 6
        const I = T.seg[o + 5] * (T.seg[o + 4] > 0.5 ? 0.75 : 1)
        Q.seg(T.seg[o], T.seg[o + 1], T.seg[o + 2], T.seg[o + 3], hw0 * 0.55, hw0 * 0.55, r, g, b, I * Gl, I * Gl)
      }
      if (T.screen) Q.glow(bounds.sx - 0.01, T.sy, 0.32, r, g, b, Gl * 1.4)
    }

    // incoming beam (white and/or laser), plus the weak Fresnel reflection off the first face
    if (refT.ns > 0) {
      const ex = refT.seg[2]
      const ey = refT.seg[3]
      if (white > 0.01) Q.seg(ox0, oy0, ex, ey, hw0, hw0, 1, 1, 1, G * 0.98 * white, G * white)
      if (laser > 0.01) Q.seg(ox0, oy0, ex, ey, hw0 * 0.55, hw0 * 0.55, LASER_RGB[0], LASER_RGB[1], LASER_RGB[2], 2.2 * laser, 2.2 * laser)
      if (!isNaN(refT.inc)) {
        const ci = Math.cos(refT.inc)
        const rx = dx + 2 * ci * refT.nx
        const ry = dy + 2 * ci * refT.ny
        const c = white > 0.5 ? [1, 1, 1] : LASER_RGB
        Q.seg(ex, ey, ex + rx * 2.2, ey + ry * 2.2, hw0 * 0.7, hw0 * 1.4, c[0], c[1], c[2], G * refT.r0 * 0.8, 0, 0, 0)
        // hot spot where the beam enters
        Q.glow(ex, ey, 0.42, c[0], c[1], c[2], 0.5)
      }
    }
    // the lamp aperture
    Q.glow(ox0 + dx * 0.02, oy0 + dy * 0.02, 0.55, 1, 0.97, 0.92, 1.1)

    // the screen's lit edge
    Q.seg(bounds.sx, bounds.sy0 + 0.1, bounds.sx, bounds.sy1 - 0.1, 0.012, 0.012, 0.7, 0.75, 0.9, 0.05, 0.05, 0, 1)

    // prism edges
    for (let e = 0; e < 3; e++) {
      const x0 = V[e * 2]
      const y0 = V[e * 2 + 1]
      const x1 = V[((e + 1) % 3) * 2]
      const y1 = V[((e + 1) % 3) * 2 + 1]
      Q.seg(x0, y0, x1, y1, 0.016, 0.016, 0.75, 0.85, 1, 0.22, 0.22)
    }

    // geometry guides: face normal + deviation angle
    const refOk = refT.ns >= 2 && refT.exited && !isNaN(refT.inc)
    let devDeg = NaN
    if (refOk) {
      const last = (refT.ns - 1) * 6
      const qx = refT.seg[last]
      const qy = refT.seg[last + 1]
      const odx = refT.dx
      const ody = refT.dy
      devDeg = (Math.acos(Math.max(-1, Math.min(1, dx * odx + dy * ody))) * 180) / Math.PI
      const gi = 0.16
      const px = refT.px
      const py = refT.py
      Q.seg(px - refT.nx * 0.9, py - refT.ny * 0.9, px + refT.nx * 1.1, py + refT.ny * 1.1, 0.012, 0.012, 1, 1, 1, gi, gi, 9, 0)
      // where the incoming line and the (back-extended) outgoing line meet
      const cr = dx * ody - dy * odx
      if (Math.abs(cr) > 0.02) {
        const a = ((qx - px) * ody - (qy - py) * odx) / cr
        if (a > 0 && a < 9) {
          const X = px + dx * a
          const Y = py + dy * a
          Q.seg(px, py, X + dx * 1.6, Y + dy * 1.6, 0.012, 0.012, 1, 1, 1, gi, gi * 0.3, 9, 0)
          Q.seg(X, Y, qx, qy, 0.012, 0.012, 1, 1, 1, gi * 0.6, gi * 0.6, 9, 0)
          const a0 = Math.atan2(dy, dx)
          let a1 = Math.atan2(ody, odx)
          let da = a1 - a0
          while (da > Math.PI) da -= Math.PI * 2
          while (da < -Math.PI) da += Math.PI * 2
          a1 = a0 + da
          const ra = 1.25
          const steps = 28
          for (let k2 = 0; k2 < steps; k2 += 2) {
            const t0 = a0 + (da * k2) / steps
            const t1 = a0 + (da * (k2 + 1)) / steps
            Q.seg(X + Math.cos(t0) * ra, Y + Math.sin(t0) * ra, X + Math.cos(t1) * ra, Y + Math.sin(t1) * ra, 0.014, 0.014, 1, 0.92, 0.75, 0.42, 0.42)
          }
          const mid = a0 + da / 2
          if (labels.dev.current) {
            labels.dev.current.style.opacity = L.labels ? '1' : '0'
            labels.dev.current.style.transform = `translate(${toScreenX(X + Math.cos(mid) * (ra + 0.45))}px, ${toScreenY(Y + Math.sin(mid) * (ra + 0.45))}px) translate(-50%, -50%)`
          }
        } else if (labels.dev.current) labels.dev.current.style.opacity = '0'
      } else if (labels.dev.current) labels.dev.current.style.opacity = '0'
      if (labels.inc.current) {
        const lx = px + refT.nx * 1.35 - dy * 0.0
        const ly = py + refT.ny * 1.35
        labels.inc.current.style.opacity = L.labels ? '1' : '0'
        labels.inc.current.style.transform = `translate(${toScreenX(lx)}px, ${toScreenY(ly)}px) translate(-50%, -50%)`
      }
    } else {
      if (labels.dev.current) labels.dev.current.style.opacity = '0'
      if (labels.inc.current) labels.inc.current.style.opacity = '0'
    }

    // spectrum end labels on the screen
    const T0 = R.traces[0]
    const T1 = R.traces[NW - 1]
    const showBand = L.labels && white > 0.5 && T0.screen && T1.screen && Math.abs(T0.sy - T1.sy) > 0.35
    if (labels.violet.current && labels.red.current) {
      labels.violet.current.style.opacity = showBand ? '1' : '0'
      labels.red.current.style.opacity = showBand ? '1' : '0'
      if (showBand) {
        labels.violet.current.style.transform = `translate(${toScreenX(bounds.sx) + 24}px, ${toScreenY(T0.sy)}px) translate(0, -50%)`
        labels.red.current.style.transform = `translate(${toScreenX(bounds.sx) + 24}px, ${toScreenY(T1.sy)}px) translate(0, -50%)`
      }
    }
    if (labels.drag.current) {
      labels.drag.current.style.opacity = !p.touched && L.labels ? '1' : '0'
      labels.drag.current.style.transform = `translate(${toScreenX(s.sx)}px, ${toScreenY(s.sy - 0.95)}px) translate(-50%, 0)`
    }

    Q.commit()

    // readouts
    ctl.inc.set(isNaN(refT.inc) ? -1 : (refT.inc * 180) / Math.PI)
    ctl.dev.set(isNaN(devDeg) ? -1 : devDeg)
    ctl.nRef.set(nOf(laser > 0.5 ? LASER_NM : REF_NM))
    const tir = refT.tir
    if (tir !== s.tir) {
      s.tir = tir
      onTir(tir)
    }

    R.bgMat.uniforms.uRes.value.set(W, H)
    R.bgMat.uniforms.uC.value.set(toScreenX(0), H - toScreenY(0))
    R.bgMat.uniforms.uTime.value = s.t
  })

  return (
    <>
      <mesh material={R.bgMat} renderOrder={-10} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh ref={screenRef} geometry={R.screen} renderOrder={-5}>
        <meshBasicMaterial color="#121218" toneMapped={false} />
      </mesh>
      <mesh geometry={R.fillGeo} material={R.fillMat} renderOrder={1} frustumCulled={false} />
      <mesh geometry={R.quads.geo} material={R.beamMat} renderOrder={2} frustumCulled={false} />
      <group ref={lamp} renderOrder={5}>
        <mesh geometry={R.rim} renderOrder={5}>
          <meshBasicMaterial color="#4a4a58" toneMapped={false} />
        </mesh>
        <mesh geometry={R.body} renderOrder={6}>
          <meshBasicMaterial color="#1d1d25" toneMapped={false} />
        </mesh>
        <mesh geometry={R.lens} position={[0.0, 0, 0]} renderOrder={7}>
          <meshBasicMaterial color="#fffaf0" toneMapped={false} />
        </mesh>
        <mesh ref={ringRef} geometry={R.ring} position={[-0.36, 0, 0]} renderOrder={4}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.1} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

const fmtDeg = (v: number) => (v < 0 ? '—' : `${v.toFixed(1)}°`)

export default function Prism() {
  const [glass, setGlass] = useState(1)
  const [laser, setLaser] = useState(0)
  const [shape, setShape] = useState(0)
  const [tir, setTir] = useState(false)
  const A = useMotionValue(GLASSES[1].A)
  const B = useMotionValue(GLASSES[1].B)
  const morph = useMotionValue(0)
  const laserMv = useMotionValue(0)
  const inc = useMotionValue(0)
  const dev = useMotionValue(0)
  const nRef = useMotionValue(1.76)
  const ctl = useMemo(() => ({ A, B, morph, laser: laserMv, inc, dev, nRef }), [A, B, morph, laserMv, inc, dev, nRef])
  const incTxt = useTransform(inc, fmtDeg)
  const devTxt = useTransform(dev, fmtDeg)
  const nTxt = useTransform(nRef, (v) => v.toFixed(3))
  const ptr = useRef<Ptr>({ down: false, x: 0, y: 0, last: -1e9, touched: false })
  const stage = useRef<HTMLDivElement>(null)
  const labels: LabelRefs = {
    inc: useRef<HTMLDivElement>(null),
    dev: useRef<HTMLDivElement>(null),
    red: useRef<HTMLDivElement>(null),
    violet: useRef<HTMLDivElement>(null),
    drag: useRef<HTMLDivElement>(null),
  }

  useEffect(() => {
    const g = GLASSES[glass]
    const a = animate(A, g.A, { duration: 1.2, ease: [0.45, 0, 0.2, 1] })
    const b = animate(B, g.B, { duration: 1.2, ease: [0.45, 0, 0.2, 1] })
    return () => {
      a.stop()
      b.stop()
    }
  }, [glass, A, B])
  useEffect(() => {
    const a = animate(morph, shape, { type: 'spring', stiffness: 90, damping: 18 })
    return () => a.stop()
  }, [shape, morph])
  useEffect(() => {
    const a = animate(laserMv, laser, { duration: 0.7, ease: [0.23, 1, 0.32, 1] })
    return () => a.stop()
  }, [laser, laserMv])

  useEffect(() => {
    const el = stage.current!
    const set = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ptr.current.x = e.clientX - r.left
      ptr.current.y = e.clientY - r.top
      ptr.current.last = performance.now()
    }
    const onDown = (e: PointerEvent) => {
      ptr.current.down = true
      ptr.current.touched = true
      set(e)
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (ptr.current.down) set(e)
    }
    const onUp = () => {
      ptr.current.down = false
      ptr.current.last = performance.now()
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const g = GLASSES[glass]

  return (
    <div className="stage pr-root" style={{ background: '#08080b' }}>
      <style>{css}</style>
      <div ref={stage} className="pr-canvas">
        <Canvas orthographic dpr={[1, 2]} gl={{ antialias: true, alpha: false }} camera={{ zoom: 90, position: [0, 0, 10] }}>
          <Optics ctl={ctl} ptr={ptr} labels={labels} onTir={setTir} />
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.12} luminanceSmoothing={0.35} radius={0.72} />
          </EffectComposer>
        </Canvas>
      </div>

      <div className="pr-labels" aria-hidden>
        <div ref={labels.inc} className="pr-tag">
          θ₁ <motion.b>{incTxt}</motion.b>
        </div>
        <div ref={labels.dev} className="pr-tag pr-tag-warm">
          δ <motion.b>{devTxt}</motion.b>
        </div>
        <div ref={labels.violet} className="pr-nm">{LMIN} nm</div>
        <div ref={labels.red} className="pr-nm">{LMAX} nm</div>
        <div ref={labels.drag} className="pr-drag">拖动光源</div>
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy pr-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className="scrim" />
          <p className="kicker">
            <i className="pr-dot" /> Optics · Dispersion
          </p>
          <h1>
            一束白光，
            <br />
            原来藏着整条光谱
          </h1>
          <p className="pr-lead">玻璃对每种波长的折射率都略有不同，两次折射之后，红光偏得少、紫光偏得多。拖动光源改变入射角，看光谱展开、收拢，或被全反射吞没。</p>
          <div className="pr-stats">
            <div>
              <span>入射角 θ₁</span>
              <motion.b>{incTxt}</motion.b>
            </div>
            <div>
              <span>偏向角 δ</span>
              <motion.b>{devTxt}</motion.b>
            </div>
            <div>
              <span>n({laser ? LASER_NM : REF_NM} nm)</span>
              <motion.b>{nTxt}</motion.b>
            </div>
          </div>
          <div className="pr-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={g.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
                {g.en} · A {g.A.toFixed(4)} · B {g.B.toFixed(5)} μm²
              </motion.span>
            </AnimatePresence>
            <AnimatePresence>
              {tir && (
                <motion.em
                  className="pr-tir"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  全内反射
                </motion.em>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="dock">
          <Seg items={GLASSES.map((x, i) => ({ value: i, label: x.zh }))} value={glass} onChange={setGlass} />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 0, label: '白光' },
              { value: 1, label: '激光' },
            ]}
            value={laser}
            onChange={setLaser}
          />
          <span className="dock-sep" />
          <Seg
            items={[
              { value: 0, label: '三棱' },
              { value: 1, label: '直角' },
            ]}
            value={shape}
            onChange={setShape}
          />
        </div>
        <p className="hint">拖动光源 · 改变入射角</p>
      </div>
    </div>
  )
}

const css = `
.pr-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.pr-canvas:active { cursor: grabbing; }
.pr-copy { --soft-bg: #08080b; }
.pr-copy .scrim { opacity: .85; }
.pr-dot { background: conic-gradient(#ff3b3b, #ffd43b, #3bff7a, #3bc8ff, #8a5bff, #ff3b3b) !important; }
.pr-copy h1 { font-weight: 600; font-size: clamp(34px, 3.7vw, 54px); }
.pr-lead { max-width: 410px; font-size: 15px !important; }
.pr-stats {
  display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 28px;
  margin-top: 26px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.09);
}
.pr-stats span { display: block; font: 500 11px/1 var(--mono); letter-spacing: .06em; color: var(--fg-2); }
.pr-stats b { display: block; margin-top: 8px; font: 500 26px/1 var(--display); font-variant-numeric: tabular-nums; letter-spacing: -.02em; min-width: 3.6ch; }
.pr-meta { display: flex; align-items: center; gap: 10px; margin-top: 16px; height: 22px; font: 11px/1 var(--mono); color: var(--fg-2); }
.pr-tir {
  font-style: normal; padding: 5px 8px; border-radius: 999px;
  color: #ffd9a8; background: rgba(255, 170, 80, .12); box-shadow: inset 0 0 0 1px rgba(255, 170, 80, .3);
}
.pr-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.pr-labels > div { position: absolute; left: 0; top: 0; transition: opacity .3s; will-change: transform; }
.pr-tag { font: 500 12px/1 var(--mono); color: rgba(255,255,255,.62); white-space: nowrap; }
.pr-tag b { font-weight: 500; color: rgba(255,255,255,.92); font-variant-numeric: tabular-nums; }
.pr-tag-warm b { color: #ffe6c2; }
.pr-nm { font: 10px/1 var(--mono); color: rgba(255,255,255,.5); letter-spacing: .04em; white-space: nowrap; }
.pr-drag {
  font: 500 11px/1 var(--mono); letter-spacing: .06em; color: rgba(255,255,255,.55); white-space: nowrap;
  padding: 6px 9px; border-radius: 999px; background: rgba(255,255,255,.05); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08);
}
@media (max-width: 760px) {
  .pr-copy h1 { font-size: 30px; }
  .pr-lead { font-size: 13px !important; line-height: 1.6 !important; margin-top: 12px !important; }
  .pr-stats { gap: 18px; margin-top: 14px; padding-top: 12px; }
  .pr-stats b { font-size: 20px; }
  .pr-meta { display: none; }
  .pr-root .dock { gap: 2px; }
  .pr-root .dock .seg { padding: 0 9px; }
}
`
