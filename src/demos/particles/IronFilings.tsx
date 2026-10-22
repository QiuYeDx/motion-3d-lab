import { RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ constants */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const PORTRAIT = typeof window !== 'undefined' && window.innerWidth < window.innerHeight * 0.85
const NF = MOBILE ? 20000 : 44000
/** paper sheet (world units, desk = XZ plane) */
const PW = PORTRAIT ? 7.4 : 12.4
const PH = PORTRAIT ? 12 : 8.2
/** paper centre (the magnets live around the origin; on desktop the sheet reaches left under the copy) */
const PCX = PORTRAIT ? 0 : -0.9
/** the sprinkle is densest around the magnets */
const SIG_X = PORTRAIT ? 1.7 : 2.4
const SIG_Z = PORTRAIT ? 2.7 : 1.9
/** bar magnet */
const ML = 1.7
const MH = 0.3
const MWd = 0.44
const POLE = 0.78
const HL = ML / 2
const HW = MWd / 2
const FILING_Y = 0.02
const TRACE_Y = 0.07

const TAU = Math.PI * 2
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU)
const rand = Math.random

/* ------------------------------------------------------------------ magnets */

type Mag = {
  x: number
  z: number
  th: number
  tx: number
  tz: number
  tth: number
  /** how quickly x/z/th follow their targets */
  lam: number
  flip: MotionValue<number>
  flipping: boolean
}

type Pose = [number, number, number]
type Layout = { a: Pose; b: Pose }

/** layouts are authored for landscape; portrait rotates them a quarter turn so the pair runs up the screen */
function orient([x, z, th]: Pose): Pose {
  return PORTRAIT ? [-z, x, th + Math.PI / 2] : [x, z, th]
}
const ATTRACT: Layout = { a: [-1.45, 0, 0], b: [1.45, 0, 0] }
const REPEL: Layout = { a: [-1.45, 0, 0], b: [1.45, 0, Math.PI] }
/** idle choreography: glide / flip steps */
const AUTO: ({ kind: 'go'; l: Layout; hold: number } | { kind: 'flip'; hold: number })[] = [
  { kind: 'go', l: ATTRACT, hold: 4.2 },
  { kind: 'flip', hold: 4.2 },
  { kind: 'go', l: { a: [-0.15, -0.62, 0.12], b: [0.15, 0.62, Math.PI + 0.12] }, hold: 4.4 },
  { kind: 'flip', hold: 4.2 },
  { kind: 'go', l: { a: [-1.2, 0.45, -0.2], b: [1.0, -0.35, Math.PI / 2] }, hold: 4.4 },
  { kind: 'go', l: { a: [-1.6, -0.3, 0.5], b: [1.4, 0.4, 0.5 + Math.PI * 0.85] }, hold: 4.2 },
]

/** world positions & charges of the four poles (N = +1 at the local +x end), honouring the flip-over animation */
function poles(m: Mag, out: Float32Array, o: number) {
  const ph = m.flip.get()
  const c = Math.cos(m.th)
  const s = Math.sin(m.th)
  const along = Math.cos(ph) * POLE
  const up = Math.sin(ph) * POLE
  const lift = Math.sin(ph) * (POLE + 0.12)
  const y = MH / 2 + lift
  out[o] = m.x + c * along
  out[o + 1] = y + up
  out[o + 2] = m.z + s * along
  out[o + 3] = 1
  out[o + 4] = m.x - c * along
  out[o + 5] = y - up
  out[o + 6] = m.z - s * along
  out[o + 7] = -1
}

function fieldAt(P: Float32Array, x: number, y: number, z: number, out: number[]) {
  let bx = 0
  let by = 0
  let bz = 0
  for (let p = 0; p < 4; p++) {
    const dx = x - P[p * 4]
    const dy = y - P[p * 4 + 1]
    const dz = z - P[p * 4 + 2]
    const r2 = dx * dx + dy * dy + dz * dz + 1e-4
    const inv = P[p * 4 + 3] / (r2 * Math.sqrt(r2))
    bx += dx * inv
    by += dy * inv
    bz += dz * inv
  }
  out[0] = bx
  out[1] = by
  out[2] = bz
}

/* ------------------------------------------------------------------ filings simulation */

function createFilings() {
  const hx = new Float32Array(NF)
  const hz = new Float32Array(NF)
  const sx = new Float32Array(NF)
  const sz = new Float32Array(NF)
  const dx = new Float32Array(NF) // direction (unit, axis)
  const dz = new Float32Array(NF)
  const om = new Float32Array(NF)
  const tilt = new Float32Array(NF)
  const lift = new Float32Array(NF)
  // cached field: horizontal unit dir, alignment weight, signed tilt target, shift / lift targets
  const fx = new Float32Array(NF)
  const fz = new Float32Array(NF)
  const fw = new Float32Array(NF)
  const ft = new Float32Array(NF)
  const tsx = new Float32Array(NF)
  const tsz = new Float32Array(NF)
  const tl = new Float32Array(NF)
  // sprinkle flight
  const d0 = new Float32Array(NF).fill(-1)
  const fromX = new Float32Array(NF)
  const fromZ = new Float32Array(NF)
  const peak = new Float32Array(NF)
  const upA = new Float32Array(NF).fill(-1)
  const stat = new Float32Array(NF * 4) // len, width, tone, rnd
  const aA = new Float32Array(NF * 4) // x, z, dirx, dirz
  const aB = new Float32Array(NF * 2) // tilt (sin), lift

  const FLIGHT = 0.55

  function scatterHome(i: number) {
    // like a real sprinkle: heaped around the magnets, thinning out towards the edges of the sheet
    let x: number
    let z: number
    do {
      if (rand() < 0.14) {
        x = PCX + (rand() - 0.5) * PW
        z = (rand() - 0.5) * PH
      } else {
        const r = Math.sqrt(-2 * Math.log(1 - rand() * 0.999))
        const a = rand() * TAU
        x = Math.cos(a) * r * SIG_X
        z = Math.sin(a) * r * SIG_Z
      }
    } while (Math.abs(x - PCX) > PW / 2 - 0.2 || Math.abs(z) > PH / 2 - 0.2)
    hx[i] = x
    hz[i] = z
  }

  for (let i = 0; i < NF; i++) {
    scatterHome(i)
    const a = rand() * TAU
    dx[i] = Math.cos(a)
    dz[i] = Math.sin(a)
    const L = 0.028 + Math.pow(rand(), 1.8) * 0.075
    stat[i * 4] = L
    stat[i * 4 + 1] = 0.0045 + rand() * 0.0045
    stat[i * 4 + 2] = rand()
    stat[i * 4 + 3] = rand()
    fromX[i] = hx[i]
    fromZ[i] = hz[i]
  }

  let t = 0
  let dirty = 2
  let parity = 0
  let busyUntil = 0
  const prevP = new Float32Array(16)

  /** throw every filing up and let it rain down on a new random spot, sweeping across the sheet */
  function sprinkle(intro: boolean) {
    for (let i = 0; i < NF; i++) {
      // the old grains are whisked up out of view (a sweep across the sheet) …
      const u0 = PORTRAIT ? (hz[i] + sz[i] + PH / 2) / PH : (hx[i] + sx[i] - PCX + PW / 2) / PW
      fromX[i] = hx[i] + sx[i]
      fromZ[i] = hz[i] + sz[i]
      upA[i] = intro ? -1 : t + u0 * 0.45 + rand() * 0.15
      // … and new ones rain down onto fresh random spots, sweeping the same way
      scatterHome(i)
      sx[i] = 0
      sz[i] = 0
      const u = PORTRAIT ? (hz[i] + PH / 2) / PH : (hx[i] - PCX + PW / 2) / PW
      d0[i] = t + (intro ? 0.15 : 0.7) + u * 1.05 + rand() * 0.35
      peak[i] = 2.8 + rand() * 2.4
      om[i] = (rand() - 0.5) * 30
    }
    busyUntil = t + 3
    dirty = 2
  }

  /** jump straight to the equilibrium (used for the poster) */
  function settle(P: Float32Array, mags: Mag[]) {
    for (let k = 0; k < 2; k++) computeField(P, mags, k)
    for (let i = 0; i < NF; i++) {
      d0[i] = -1
      const s = dx[i] * fx[i] + dz[i] * fz[i] >= 0 ? 1 : -1
      if (fw[i] > 0.15) {
        dx[i] = fx[i] * s
        dz[i] = fz[i] * s
      }
      tilt[i] = ft[i]
      sx[i] = tsx[i]
      sz[i] = tsz[i]
      lift[i] = tl[i]
    }
  }

  function computeField(P: Float32Array, mags: Mag[], par: number) {
    const ex: number[] = []
    for (const m of mags) {
      const f = Math.sin(m.flip.get())
      ex.push(m.x, m.z, Math.cos(m.th), Math.sin(m.th), 1 - f)
    }
    for (let i = par; i < NF; i += 2) {
      const x = hx[i]
      const z = hz[i]
      let bx = 0
      let by = 0
      let bz = 0
      let px = 0
      let pz = 0
      for (let p = 0; p < 4; p++) {
        const ddx = x - P[p * 4]
        const ddy = FILING_Y - P[p * 4 + 1]
        const ddz = z - P[p * 4 + 2]
        const h2 = ddx * ddx + ddz * ddz
        const r2 = h2 + ddy * ddy + 1e-4
        const inv = P[p * 4 + 3] / (r2 * Math.sqrt(r2))
        bx += ddx * inv
        by += ddy * inv
        bz += ddz * inv
        // filings close to a pole creep towards it
        if (h2 < 1.0) {
          const h = Math.sqrt(h2) + 1e-4
          const near = Math.max(0, 1 - (P[p * 4 + 1] - MH / 2) * 2.5)
          let f = 1 - h
          f = f * f * 0.5 * near
          const m = Math.min(f, h - 0.05)
          if (m > 0) {
            px -= (ddx / h) * m
            pz -= (ddz / h) * m
          }
        }
      }
      const bh2 = bx * bx + bz * bz
      const B2 = bh2 + by * by
      const B = Math.sqrt(B2)
      const bh = Math.sqrt(bh2) + 1e-6
      fx[i] = bx / bh
      fz[i] = bz / bh
      fw[i] = B2 / (B2 + 0.006)
      // near a pole the field turns vertical: filings stand up into spiky tufts
      let st = (B - 3) / 10
      st = st <= 0 ? 0 : st >= 1 ? 1 : st * st * (3 - 2 * st)
      // (sign chosen so the outer end rises: chains bristle away from the pole like a hedgehog)
      ft[i] = (by >= 0 ? -1 : 1) * (0.35 + 0.6 * Math.abs(by) / (B + 1e-6)) * st
      tl[i] = st * st * (0.004 + Math.pow(stat[i * 4 + 3], 2) * 0.1)
      // keep out from under the magnets (they plough filings aside)
      let qx = x + px
      let qz = z + pz
      for (let k = 0; k < ex.length; k += 5) {
        if (ex[k + 4] < 0.2) continue
        const rx = qx - ex[k]
        const rz = qz - ex[k + 1]
        const c = ex[k + 2]
        const s = ex[k + 3]
        let lx = rx * c + rz * s
        let lz = -rx * s + rz * c
        const ax = HL + 0.03
        const az = HW + 0.03
        if (Math.abs(lx) < ax && Math.abs(lz) < az) {
          if (az - Math.abs(lz) < ax - Math.abs(lx)) lz = lz >= 0 ? az : -az
          else lx = lx >= 0 ? ax : -ax
          qx = ex[k] + lx * c - lz * s
          qz = ex[k + 1] + lx * s + lz * c
        }
      }
      tsx[i] = qx - x
      tsz[i] = qz - z
    }
  }

  function update(dtIn: number, P: Float32Array, mags: Mag[]) {
    const dt = Math.min(dtIn, 1 / 30)
    t += dt
    let moved = 0
    for (let k = 0; k < 16; k++) {
      moved += Math.abs(P[k] - prevP[k])
      prevP[k] = P[k]
    }
    if (moved > 1e-5) {
      dirty = 2
      busyUntil = Math.max(busyUntil, t + 1.6)
    }
    if (dirty > 0) {
      computeField(P, mags, parity)
      parity ^= 1
      dirty--
    }
    if (t > busyUntil) return false

    const ka = 46
    const ca = 7.5
    const kt = 1 - Math.exp(-dt * 7)
    const ks = 1 - Math.exp(-dt * 6)
    for (let i = 0; i < NF; i++) {
      let x: number
      let z: number
      let tt: number
      let ll: number
      let cx = dx[i]
      let cz = dz[i]
      const s0 = d0[i]
      if (s0 >= 0 && t < s0 + FLIGHT) {
        // waiting / in the air
        x = fromX[i]
        z = fromZ[i]
        tt = tilt[i]
        const ua = upA[i]
        if (t < s0) {
          if (ua < 0 || t >= ua + 0.45) ll = 80 // waiting far above the view
          else if (t < ua) ll = lift[i] // still resting on the sheet
          else {
            const k = (t - ua) / 0.45
            ll = lift[i] + 9 * k * k
            tt = Math.sin(t * 11 + stat[i * 4 + 3] * 20) * 0.8 * k
          }
        } else {
          const k = (t - s0) / FLIGHT
          const r = stat[i * 4 + 3] - 0.5
          x = hx[i] + r * 0.7 * (1 - k)
          z = hz[i] - (0.35 + r * r) * (1 - k)
          ll = peak[i] * (1 - k * k)
          const a = om[i] * dt
          const nx = cx - cz * a
          cz = cz + cx * a
          cx = nx
          tt = Math.sin(t * 9 + stat[i * 4 + 3] * 20) * 0.8 * (1 - k)
          tilt[i] = 0
          lift[i] = 0
        }
      } else {
        if (s0 >= 0) {
          d0[i] = -1
          om[i] = (rand() - 0.5) * 6
        }
        // align the filing's axis with the field (mod π): torque ∝ sin 2Δ
        const bx = fx[i]
        const bz = fz[i]
        const sn = cx * bz - cz * bx
        const cs = cx * bx + cz * bz
        let w = om[i]
        w += (ka * fw[i] * sn * cs - ca * w) * dt
        om[i] = w
        const a = w * dt
        const nx = cx - cz * a
        cz = cz + cx * a
        cx = nx
        tilt[i] += ((cs >= 0 ? ft[i] : -ft[i]) - tilt[i]) * kt
        lift[i] += (tl[i] - lift[i]) * ks
        sx[i] += (tsx[i] - sx[i]) * ks
        sz[i] += (tsz[i] - sz[i]) * ks
        x = hx[i] + sx[i]
        z = hz[i] + sz[i]
        tt = tilt[i]
        ll = lift[i]
      }
      // cheap renormalisation
      const n = (3 - (cx * cx + cz * cz)) * 0.5
      cx *= n
      cz *= n
      dx[i] = cx
      dz[i] = cz
      aA[i * 4] = x
      aA[i * 4 + 1] = z
      aA[i * 4 + 2] = cx
      aA[i * 4 + 3] = cz
      aB[i * 2] = tt
      aB[i * 2 + 1] = ll
    }
    return true
  }

  return { aA, aB, stat, update, sprinkle, settle }
}

type Filings = ReturnType<typeof createFilings>

/* ------------------------------------------------------------------ GLSL */

const FILING_VERT = /* glsl */ `
attribute vec4 aA;
attribute vec2 aB;
attribute vec4 aR;
varying vec3 vN;
varying vec3 vV;
varying float vTone;
varying float vUp;
void main() {
  // grains that stand up in a tuft read as longer spikes (they clump end to end)
  vec3 p = position * vec3(aR.x * (1.0 + abs(aB.x) * 1.1), aR.y * 0.75, aR.y);
  vec3 n = normal;
  float st = clamp(aB.x, -0.99, 0.99);
  float ct = sqrt(1.0 - st * st);
  p = vec3(p.x * ct - p.y * st, p.x * st + p.y * ct, p.z);
  n = vec3(n.x * ct - n.y * st, n.x * st + n.y * ct, n.z);
  vec2 d = aA.zw;
  p = vec3(p.x * d.x - p.z * d.y, p.y, p.x * d.y + p.z * d.x);
  n = vec3(n.x * d.x - n.z * d.y, n.y, n.x * d.y + n.z * d.x);
  float lift = abs(st) * aR.x * (1.0 + abs(aB.x) * 1.1) * 0.5 + aR.y * 0.375 + aB.y;
  vec4 wp = modelMatrix * vec4(p + vec3(aA.x, lift, aA.y), 1.0);
  vN = normalize(mat3(modelMatrix) * n);
  vV = cameraPosition - wp.xyz;
  vTone = aR.z;
  vUp = abs(st);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FILING_FRAG = /* glsl */ `
uniform vec3 uLight;
varying vec3 vN;
varying vec3 vV;
varying float vTone;
varying float vUp;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  vec3 l = normalize(uLight);
  float lam = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0);
  vec3 base = mix(vec3(0.085, 0.085, 0.095), vec3(0.2, 0.2, 0.215), vTone);
  vec3 col = base * (0.5 + 0.75 * lam) + vec3(0.78, 0.8, 0.86) * spec * (0.25 + 0.55 * vTone);
  col += vec3(0.05) * vUp * max(n.y, 0.0);
  gl_FragColor = vec4(col, 1.0);
}
`

const LINE_VERT = /* glsl */ `
attribute float aS;
attribute float aT;
varying float vS;
varying float vT;
void main() {
  vS = aS;
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const LINE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
varying float vS;
varying float vT;
void main() {
  float dash = smoothstep(0.0, 0.25, fract(vS * 2.2 - uTime * 0.7)) * (1.0 - smoothstep(0.55, 0.75, fract(vS * 2.2 - uTime * 0.7)));
  vec3 col = mix(vec3(0.80, 0.20, 0.20), vec3(0.17, 0.36, 0.74), smoothstep(0.15, 0.85, vT));
  float a = (0.3 + 0.62 * dash) * uOpacity * smoothstep(0.0, 0.04, vT) ;
  gl_FragColor = vec4(col * a, a);
}
`

/* ------------------------------------------------------------------ canvas textures */

function paperTexture() {
  const W = 1024
  const H = Math.round((W * PH) / PW)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#f5f2ea'
  g.fillRect(0, 0, W, H)
  // faint graph grid
  const cell = W / (PW * 2)
  g.strokeStyle = 'rgba(90,120,150,0.07)'
  g.lineWidth = 1
  for (let x = 0; x < W; x += cell) {
    g.beginPath()
    g.moveTo(x + 0.5, 0)
    g.lineTo(x + 0.5, H)
    g.stroke()
  }
  for (let y = 0; y < H; y += cell) {
    g.beginPath()
    g.moveTo(0, y + 0.5)
    g.lineTo(W, y + 0.5)
    g.stroke()
  }
  // fibres & speckles
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = rand() < 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.35)'
    const x = rand() * W
    const y = rand() * H
    const a = rand() * TAU
    const l = 2 + rand() * 9
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(90,70,40,0.07)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function blobTexture(w: number, h: number, blur: number, alpha: number) {
  const s = 128 / Math.max(w, h)
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * s) + 64
  c.height = Math.ceil(h * s) + 64
  const g = c.getContext('2d')!
  g.filter = `blur(${blur}px)`
  g.fillStyle = `rgba(40,30,20,${alpha})`
  const r = Math.min(w, h) * s * 0.3
  g.beginPath()
  g.roundRect(32, 32, w * s, h * s, r)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  return { tex: t, sx: c.width / s, sz: c.height / s }
}

function letterTexture(ch: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(255,255,255,0.94)'
  g.font = '700 92px "SF Pro Display", "Segoe UI", Arial, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(ch, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function handleTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.shadowColor = 'rgba(0,0,0,0.25)'
  g.shadowBlur = 10
  g.shadowOffsetY = 3
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.beginPath()
  g.arc(64, 64, 46, 0, TAU)
  g.fill()
  g.shadowColor = 'transparent'
  g.strokeStyle = '#3a3733'
  g.lineWidth = 7
  g.lineCap = 'round'
  g.beginPath()
  g.arc(64, 64, 24, -Math.PI * 0.15, Math.PI * 1.35)
  g.stroke()
  // arrow head at the start of the arc
  const a = -Math.PI * 0.15
  const ex = 64 + Math.cos(a) * 24
  const ey = 64 + Math.sin(a) * 24
  g.fillStyle = '#3a3733'
  g.beginPath()
  g.moveTo(ex + 11, ey + 2)
  g.lineTo(ex - 7, ey - 6)
  g.lineTo(ex - 2, ey + 13)
  g.closePath()
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ------------------------------------------------------------------ scene pieces */

const LIGHT = new THREE.Vector3(-0.45, 1, 0.55).normalize()

function FilingsMesh({ sim, P, mags, live }: { sim: Filings; P: Float32Array; mags: Mag[]; live: { current: boolean } }) {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = box.index
    g.setAttribute('position', box.getAttribute('position'))
    g.setAttribute('normal', box.getAttribute('normal'))
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(sim.aA, 4).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(sim.aB, 2).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aR', new THREE.InstancedBufferAttribute(sim.stat, 4))
    g.instanceCount = NF
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)
    return g
  }, [sim])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: FILING_VERT,
        fragmentShader: FILING_FRAG,
        uniforms: { uLight: { value: LIGHT } },
      }),
    [],
  )
  useFrame((_, dt) => {
    if (live.current && sim.update(dt, P, mags)) {
      geometry.attributes.aA.needsUpdate = true
      geometry.attributes.aB.needsUpdate = true
    }
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

const SEEDS = 18
const STEPS = 200
const H_STEP = 0.055

function FieldLines({ P, show }: { P: Float32Array; show: MotionValue<number> }) {
  const maxV = 2 * SEEDS * STEPS * 2
  const { geometry, pos, aS, aT } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(maxV * 3)
    const aS = new Float32Array(maxV)
    const aT = new Float32Array(maxV)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1).setUsage(THREE.DynamicDrawUsage))
    g.setDrawRange(0, 0)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)
    return { geometry: g, pos, aS, aT }
  }, [maxV])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LINE_VERT,
        fragmentShader: LINE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      }),
    [],
  )
  const line = useRef<THREE.LineSegments>(null)
  const scratch = useMemo(() => [0, 0, 0], [])
  const last = useMemo(() => new Float32Array(16), [])

  useFrame((state) => {
    const op = show.get()
    material.uniforms.uOpacity.value = op
    material.uniforms.uTime.value = state.clock.elapsedTime
    if (line.current) line.current.visible = op > 0.01
    if (op <= 0.01) return
    let same = true
    for (let k = 0; k < 16; k++) if (Math.abs(last[k] - P[k]) > 1e-5) same = false
    if (same && geometry.drawRange.count > 0) return
    last.set(P)
    let v = 0
    const B = scratch
    for (let p = 0; p < 4; p++) {
      if (P[p * 4 + 3] < 0) continue
      const px = P[p * 4]
      const pz = P[p * 4 + 2]
      for (let k = 0; k < SEEDS; k++) {
        const a = ((k + 0.5) / SEEDS) * TAU
        let x = px + Math.cos(a) * 0.12
        let z = pz + Math.sin(a) * 0.12
        const start = v
        let s = 0
        for (let n = 0; n < STEPS; n++) {
          fieldAt(P, x, TRACE_Y, z, B)
          let l = Math.hypot(B[0], B[2]) + 1e-9
          const mx = x + (B[0] / l) * H_STEP * 0.5
          const mz = z + (B[2] / l) * H_STEP * 0.5
          fieldAt(P, mx, TRACE_Y, mz, B)
          l = Math.hypot(B[0], B[2]) + 1e-9
          const nx = x + (B[0] / l) * H_STEP
          const nz = z + (B[2] / l) * H_STEP
          pos[v * 3] = x
          pos[v * 3 + 1] = 0.035
          pos[v * 3 + 2] = z
          aS[v] = s
          s += H_STEP
          pos[v * 3 + 3] = nx
          pos[v * 3 + 4] = 0.035
          pos[v * 3 + 5] = nz
          aS[v + 1] = s
          v += 2
          x = nx
          z = nz
          if (Math.abs(x - PCX) > PW / 2 || Math.abs(z) > PH / 2) break
          let hitS = false
          for (let q = 0; q < 4; q++) {
            if (P[q * 4 + 3] > 0) continue
            const ex = x - P[q * 4]
            const ez = z - P[q * 4 + 2]
            if (ex * ex + ez * ez < 0.012) hitS = true
          }
          if (hitS) break
        }
        for (let j = start; j < v; j++) aT[j] = aS[j] / Math.max(s, 1e-3)
      }
    }
    geometry.setDrawRange(0, v)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aS.needsUpdate = true
    geometry.attributes.aT.needsUpdate = true
  })
  return <lineSegments ref={line} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />
}

function Magnet({ m }: { m: Mag }) {
  const yaw = useRef<THREE.Group>(null)
  const roll = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const handle = useRef<THREE.Mesh>(null)
  const texN = useMemo(() => letterTexture('N'), [])
  const texS = useMemo(() => letterTexture('S'), [])
  const blob = useMemo(() => blobTexture(ML + 0.3, MWd + 0.3, 9, 0.55), [])
  const hTex = useMemo(() => handleTexture(), [])
  useFrame(() => {
    const ph = m.flip.get()
    const lift = Math.sin(ph) * (POLE + 0.12)
    yaw.current?.position.set(m.x, 0, m.z)
    if (yaw.current) yaw.current.rotation.y = -m.th
    if (roll.current) {
      roll.current.position.y = MH / 2 + lift
      roll.current.rotation.z = ph
    }
    if (shadow.current) {
      const k = 1 - Math.sin(ph) * 0.55
      shadow.current.scale.set(Math.max(0.35, Math.abs(Math.cos(ph))) * blob.sx + 0.15 * (1 - k), blob.sz, 1)
      ;(shadow.current.material as THREE.MeshBasicMaterial).opacity = k
    }
    if (handle.current) handle.current.visible = !POSTER && ph < 0.05
  })
  return (
    <group ref={yaw}>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} position-y={0.004} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={blob.tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={roll}>
        <RoundedBox args={[ML / 2 - 0.004, MH, MWd]} radius={0.035} smoothness={3} position-x={ML / 4 + 0.002}>
          <meshPhongMaterial color="#cf3b3b" shininess={70} specular="#5a4a4a" />
        </RoundedBox>
        <RoundedBox args={[ML / 2 - 0.004, MH, MWd]} radius={0.035} smoothness={3} position-x={-ML / 4 - 0.002}>
          <meshPhongMaterial color="#2f5fb8" shininess={70} specular="#4a4f5a" />
        </RoundedBox>
        <mesh position={[ML / 4 + 0.08, MH / 2 + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshBasicMaterial map={texN} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[-ML / 4 - 0.08, MH / 2 + 0.002, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshBasicMaterial map={texS} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={handle} position={[0, 0.03, -(HW + 0.42)]} rotation-x={-Math.PI / 2} renderOrder={3}>
        <planeGeometry args={[0.36, 0.36]} />
        <meshBasicMaterial map={hTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Paper() {
  const tex = useMemo(() => paperTexture(), [])
  const sh = useMemo(() => blobTexture(PW, PH, 18, 0.32), [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[PCX + 0.08, -0.004, 0.14]} scale={[sh.sx, sh.sz, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={sh.tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-x={PCX}>
        <planeGeometry args={[PW, PH]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** keeps its children hidden until every program in them has been compiled off the main thread */
function Reveal({ children, onReady }: { children: React.ReactNode; onReady: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const root = useRef<THREE.Group>(null)
  useEffect(() => {
    const g = root.current
    if (!g) return
    let alive = true
    const hidden: THREE.Object3D[] = []
    g.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
    })
    g.visible = true
    const job = gl.compileAsync(scene, camera)
    g.visible = false
    for (const o of hidden) o.visible = false
    job
      .catch(() => {})
      .then(() => {
        if (!alive) return
        g.visible = true
        onReady()
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])
  return (
    <group ref={root} visible={false}>
      {children}
    </group>
  )
}

/* ------------------------------------------------------------------ interaction + autopilot */

type Ctl = {
  mags: Mag[]
  P: Float32Array
  lastUser: number
  step: number
  stepAt: number
  onRelation: (r: 'attract' | 'repel') => void
  flip: (m: Mag) => void
}

function Rig() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useEffect(() => {
    const portrait = size.width < size.height * 0.85
    const target = POSTER
      ? new THREE.Vector3(0, 0, 0.3)
      : portrait
        ? new THREE.Vector3(0, 0, 2.15)
        : new THREE.Vector3(-1.5, 0, 0.3)
    const off = portrait ? new THREE.Vector3(0, 19.5, 8.4) : POSTER ? new THREE.Vector3(0, 8.6, 6.4) : new THREE.Vector3(0, 9.6, 7.2)
    camera.position.copy(target).add(off)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Controller({ ctl }: { ctl: Ctl }) {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const tmp = useMemo(
    () => ({ rc: new THREE.Raycaster(), ndc: new THREE.Vector2(), plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -MH / 2), hit: new THREE.Vector3() }),
    [],
  )
  const rel = useRef<'attract' | 'repel' | null>(null)

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    let drag: { m: Mag; kind: 'move' | 'rotate'; ox: number; oz: number; id: number } | null = null
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      tmp.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      tmp.rc.setFromCamera(tmp.ndc, camera)
      return tmp.rc.ray.intersectPlane(tmp.plane, tmp.hit)
    }
    const hitMag = (x: number, z: number): { m: Mag; kind: 'move' | 'rotate' } | null => {
      for (const m of ctl.mags) {
        const c = Math.cos(m.th)
        const s = Math.sin(m.th)
        const hx = m.x + s * (HW + 0.42)
        const hz = m.z - c * (HW + 0.42)
        if ((x - hx) ** 2 + (z - hz) ** 2 < 0.23 ** 2 && m.flip.get() < 0.05) return { m, kind: 'rotate' }
      }
      for (const m of ctl.mags) {
        const rx = x - m.x
        const rz = z - m.z
        const lx = rx * Math.cos(m.th) + rz * Math.sin(m.th)
        const lz = -rx * Math.sin(m.th) + rz * Math.cos(m.th)
        if (Math.abs(lx) < HL + 0.08 && Math.abs(lz) < HW + 0.12) return { m, kind: 'move' }
      }
      return null
    }
    const blocked = (m: Mag, x: number, z: number, th: number) => {
      const o = ctl.mags.find((q) => q !== m)!
      const c = Math.cos(th)
      const s = Math.sin(th)
      const oc = Math.cos(o.th)
      const os = Math.sin(o.th)
      for (let k = -4; k <= 4; k++) {
        for (const w of [-HW, HW]) {
          const px = x + c * (k / 4) * HL - s * w
          const pz = z + s * (k / 4) * HL + c * w
          const rx = px - o.x
          const rz = pz - o.z
          const lx = rx * oc + rz * os
          const lz = -rx * os + rz * oc
          if (Math.abs(lx) < HL + 0.04 && Math.abs(lz) < HW + 0.04) return true
        }
      }
      return Math.abs(x - PCX) > PW / 2 - 0.9 || Math.abs(z) > PH / 2 - 0.5
    }
    const down = (e: PointerEvent) => {
      const p = pick(e)
      if (!p) return
      const h = hitMag(p.x, p.z)
      if (!h) return
      ctl.lastUser = performance.now()
      el.setPointerCapture(e.pointerId)
      drag = { m: h.m, kind: h.kind, ox: h.m.tx - p.x, oz: h.m.tz - p.z, id: e.pointerId }
      h.m.lam = 22
      el.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent) => {
      const p = pick(e)
      if (!drag) {
        if (p) el.style.cursor = hitMag(p.x, p.z) ? 'grab' : ''
        return
      }
      if (!p || e.pointerId !== drag.id) return
      ctl.lastUser = performance.now()
      const m = drag.m
      if (drag.kind === 'move') {
        const nx = p.x + drag.ox
        const nz = p.z + drag.oz
        if (!blocked(m, nx, nz, m.tth)) {
          m.tx = nx
          m.tz = nz
        } else if (!blocked(m, nx, m.tz, m.tth)) m.tx = nx
        else if (!blocked(m, m.tx, nz, m.tth)) m.tz = nz
      } else {
        const th = Math.atan2(p.z - m.z, p.x - m.x) + Math.PI / 2
        const nth = m.tth + wrap(th - m.tth)
        if (!blocked(m, m.tx, m.tz, nth)) m.tth = nth
      }
    }
    const up = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        drag.m.lam = 10
        drag = null
        el.style.cursor = ''
      }
    }
    const wheel = (e: WheelEvent) => {
      const p = pick(e as unknown as PointerEvent)
      if (!p) return
      const h = hitMag(p.x, p.z)
      if (!h) return
      e.preventDefault()
      ctl.lastUser = performance.now()
      const nth = h.m.tth + Math.sign(e.deltaY) * (Math.PI / 12)
      if (!blocked(h.m, h.m.tx, h.m.tz, nth)) {
        h.m.tth = nth
        h.m.lam = 10
      }
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [gl, camera, ctl, tmp])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const now = performance.now()
    // idle choreography
    if (!POSTER && now - ctl.lastUser > 7000) {
      const t = state.clock.elapsedTime
      if (ctl.stepAt < 0 || t > ctl.stepAt) {
        const st = AUTO[ctl.step % AUTO.length]
        ctl.step++
        ctl.stepAt = t + st.hold
        if (st.kind === 'go') {
          const [A, B] = ctl.mags
          const a = orient(st.l.a)
          const b = orient(st.l.b)
          A.tx = a[0]
          A.tz = a[1]
          A.tth = A.th + wrap(a[2] - A.th)
          B.tx = b[0]
          B.tz = b[1]
          B.tth = B.th + wrap(b[2] - B.th)
          A.lam = B.lam = 1.6
        } else ctl.flip(ctl.mags[1])
      }
    } else if (now - ctl.lastUser <= 7000) {
      ctl.stepAt = -1
      ctl.step = 0
    }
    for (const m of ctl.mags) {
      const k = 1 - Math.exp(-dt * m.lam)
      m.x += (m.tx - m.x) * k
      m.z += (m.tz - m.z) * k
      m.th += (m.tth - m.th) * k
    }
    poles(ctl.mags[0], ctl.P, 0)
    poles(ctl.mags[1], ctl.P, 8)
    // attraction or repulsion? compare which poles face each other
    const [A, B] = ctl.mags
    const ddx = B.x - A.x
    const ddz = B.z - A.z
    const fa = Math.cos(A.th) * ddx + Math.sin(A.th) * ddz
    const fb = -(Math.cos(B.th) * ddx + Math.sin(B.th) * ddz) * Math.cos(B.flip.get())
    const r = fa >= 0 === fb >= 0 ? 'repel' : 'attract'
    if (r !== rel.current) {
      rel.current = r
      ctl.onRelation(r)
    }
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function IronFilings() {
  const flipA = useMotionValue(0)
  const flipB = useMotionValue(0)
  const lines = useMotionValue(0)
  const [relation, setRelation] = useState<'attract' | 'repel'>('attract')
  const [showLines, setShowLines] = useState(false)
  const sim = useMemo(() => createFilings(), [])

  const ctl = useMemo<Ctl>(() => {
    const mk = (p: Pose, flip: MotionValue<number>): Mag => {
      const [x, z, th] = orient(p)
      return { x, z, th, tx: x, tz: z, tth: th, lam: 8, flip, flipping: false }
    }
    const start = POSTER ? { a: [-1.35, 0.05, 0.08] as Pose, b: [1.4, -0.05, -0.06] as Pose } : ATTRACT
    const c: Ctl = {
      mags: [mk(start.a, flipA), mk(start.b, flipB)],
      P: new Float32Array(16),
      lastUser: -1e9,
      step: 1,
      stepAt: POSTER ? -1 : 4,
      onRelation: () => {},
      flip: () => {},
    }
    return c
  }, [flipA, flipB])

  ctl.onRelation = setRelation
  ctl.flip = (m: Mag) => {
    if (m.flipping) return
    m.flipping = true
    animate(m.flip, Math.PI, {
      duration: 1.05,
      ease: [0.65, 0, 0.35, 1],
      onComplete: () => {
        m.th += Math.PI
        m.tth += Math.PI
        m.flip.set(0)
        m.flipping = false
      },
    })
  }

  // first sprinkle (or settle straight away for the poster) once the shaders are ready
  const live = useRef(false)
  const start = () => {
    if (live.current) return
    live.current = true
    poles(ctl.mags[0], ctl.P, 0)
    poles(ctl.mags[1], ctl.P, 8)
    if (POSTER) sim.settle(ctl.P, ctl.mags)
    else sim.sprinkle(true)
  }

  useEffect(() => {
    animate(lines, showLines ? 1 : 0, { duration: 0.5 })
  }, [showLines, lines])

  const user = () => (ctl.lastUser = performance.now())

  const preset = (r: 'attract' | 'repel') => {
    user()
    const [A, B] = ctl.mags
    const l = r === 'attract' ? ATTRACT : REPEL
    const a = orient(l.a)
    const b = orient(l.b)
    A.tx = a[0]
    A.tz = a[1]
    A.tth = A.th + wrap(a[2] - A.th)
    A.lam = 3
    B.tx = b[0]
    B.tz = b[1]
    B.lam = 3
    const d = wrap(b[2] - B.th)
    if (Math.abs(d) > Math.PI / 2 && !B.flipping) {
      // reverse it the way a hand would: flip it over
      B.tth = B.th + wrap(b[2] - Math.PI - B.th)
      ctl.flip(B)
    } else B.tth = B.th + d
  }

  return (
    <div className="stage" style={{ background: 'radial-gradient(120% 90% at 55% 40%, #e9e4d9 0%, #d9d2c4 70%, #cfc6b5 100%)' }}>
      <Canvas flat dpr={[1, 2]} camera={{ fov: 30, near: 0.5, far: 60, position: [0, 9, 6] }} gl={{ antialias: true, alpha: true }}>
        <Rig />
        <ambientLight intensity={1.15} />
        <directionalLight position={[LIGHT.x * 10, LIGHT.y * 10, LIGHT.z * 10]} intensity={2.1} />
        <Reveal onReady={start}>
          <Paper />
          <FilingsMesh sim={sim} P={ctl.P} mags={ctl.mags} live={live} />
          <FieldLines P={ctl.P} show={lines} />
          <Magnet m={ctl.mags[0]} />
          <Magnet m={ctl.mags[1]} />
        </Reveal>
        <Controller ctl={ctl} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy imf-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Magnetic field · 铁屑显形
          </p>
          <h1>磁铁与铁屑</h1>
          <p>
            拖动磁铁，滚轮或拖动 <b className="imf-key">↻</b> 旋转。每粒铁屑都转向当地的磁场方向，在磁极附近竖起一簇簇毛刺；翻转一块磁铁，图样就在吸引与排斥之间切换。
          </p>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'attract', label: '吸引' },
              { value: 'repel', label: '排斥' },
            ]}
            value={relation}
            onChange={preset}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              user()
              ctl.flip(ctl.mags[1])
            }}
          >
            <span>翻转</span>
          </button>
          <button className="seg" aria-pressed={showLines} onClick={() => setShowLines((s) => !s)}>
            {showLines && <motion.span layoutId="imf-lines" className="seg-bg" />}
            <span>磁力线</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              sim.sprinkle(false)
            }}
          >
            <span>撒新铁屑</span>
          </button>
        </div>
        <p className="hint imf-hint">
          拖动磁铁 · 滚轮旋转
          <br />
          闲置时自动演示
        </p>
      </div>
      <style>{`
        .imf-copy { --soft-bg: #f3f0e8; }
        .imf-hint { padding: 6px 10px; border-radius: 10px; color: var(--fg);
          background: color-mix(in srgb, #f3f0e8 82%, transparent); backdrop-filter: blur(6px); }
        .imf-copy .scrim { left: -200px; right: -220px; height: 640px;
          background: radial-gradient(closest-side, var(--soft-bg) 0%, color-mix(in srgb, var(--soft-bg) 92%, transparent) 50%, transparent 100%); }
        .imf-copy p:not(.kicker) { max-width: 400px; }
        .imf-key { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
          background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.18); font: 600 13px/1 var(--sans); color: var(--ink); }
        @media (max-width: 760px) {
          .imf-copy h1 { font-size: 34px; }
          .imf-copy p:not(.kicker) { margin-top: 12px; font-size: 14px; line-height: 1.65; }
          .imf-copy .kicker { margin-bottom: 12px; }
          .imf-copy .scrim { height: 380px; top: 62%; }
        }
      `}</style>
    </div>
  )
}
