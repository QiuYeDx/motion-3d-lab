import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ budget & layout */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
/** particles per digit slot / colon / ambient dust */
const PD = MOBILE ? 3000 : 6600
const PC = MOBILE ? 420 : 900
const PA = MOBILE ? 1200 : 2800
/** particles that take part in the layouts (six digits + two colons) */
const M = 6 * PD + 2 * PC
const N = M + PA

const DW = 1.06 // digit cell width
const CW = 0.5 // colon cell width
const GH = 1.5 // height of the '0' glyph
const CLOCK_W = 6 * DW + 2 * CW
/** portrait phones stack HH:MM over SS so the digits stay large */
const PORTRAIT = typeof window !== 'undefined' && window.innerWidth < window.innerHeight * 0.85
const ROW = 0.98
const SLOT_X: number[] = []
const SLOT_Y = [0, 0, 0, 0, 0, 0]
const COLON_X: number[] = []
{
  const seq = PORTRAIT ? 'DDCDD' : 'DDCDDCDD'
  let x = PORTRAIT ? -(4 * DW + CW) / 2 : -CLOCK_W / 2
  for (const c of seq) {
    const w = c === 'D' ? DW : CW
    ;(c === 'D' ? SLOT_X : COLON_X).push(x + w / 2)
    x += w
  }
  if (PORTRAIT) {
    SLOT_X.push(-DW / 2, DW / 2)
    COLON_X.push(0)
    for (let s = 0; s < 6; s++) SLOT_Y[s] = s < 4 ? ROW : -ROW
  }
}

/** analog dial / countdown ring radii */
const R_DIAL = 2.3
const R_CD = 2.75
const CD_S = 1.9 // countdown digit scale
const CD_DX = DW * CD_S * 0.5

const Md = { Scatter: 0, Digital: 1, Analog: 2, Count: 3, Free: 4, Ambient: 5 } as const
type Md = (typeof Md)[keyof typeof Md]
export type ClockMode = 'digital' | 'analog' | 'countdown'
const MODE_ID: Record<ClockMode, Md> = { digital: Md.Digital, analog: Md.Analog, countdown: Md.Count }

const IMPLODE = 0.42
const RING = 255 // countdown glyph id: "be part of the progress ring"
const POSTER_TIME = [1, 0, 0, 8, 3, 0]

/* ------------------------------------------------------------------ glyph sampling */

const FONT = '800 300px "SF Pro Display", "Segoe UI", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", Arial, sans-serif'
const GW = 240
const GHpx = 340

function rand() {
  return Math.random()
}
function gauss() {
  return (rand() + rand() + rand() - 1.5) * 0.82
}

type GlyphCtx = { ctx: CanvasRenderingContext2D; base: number; cy: number; sc: number }

function glyphCtx(): GlyphCtx {
  const c = document.createElement('canvas')
  c.width = GW
  c.height = GHpx
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.font = FONT
  const m = ctx.measureText('0')
  const asc = m.actualBoundingBoxAscent || 216
  const desc = m.actualBoundingBoxDescent || 4
  const base = Math.round((GHpx + asc - desc) / 2)
  const cy = base - (asc - desc) / 2
  return { ctx, base, cy, sc: GH / (asc + desc) }
}

/**
 * 2·PD points of one digit (x, y in clock units), 70 % from the fill and 30 % from the outline so the shapes stay
 * crisp, sorted by angle around the glyph centre — particle k of '3' and particle k of '4' sit at the same angle,
 * so a change reads as one shape flowing into the next instead of a random shuffle.
 */
function sampleDigit(g: GlyphCtx, d: number) {
  const { ctx } = g
  ctx.clearRect(0, 0, GW, GHpx)
  ctx.font = FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fff'
  ctx.fillText(String(d), GW / 2, g.base)
  const data = ctx.getImageData(0, 0, GW, GHpx).data
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < GW && y < GHpx && data[(y * GW + x) * 4 + 3] > 128
  const fill: number[] = []
  const edge: number[] = []
  for (let y = 0; y < GHpx; y++)
    for (let x = 0; x < GW; x++) {
      if (!on(x, y)) continue
      fill.push(x, y)
      if (!on(x - 2, y) || !on(x + 2, y) || !on(x, y - 2) || !on(x, y + 2)) edge.push(x, y)
    }
  const n = 2 * PD
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  const ang = new Float32Array(n)
  const nf = fill.length / 2
  const ne = edge.length / 2
  for (let k = 0; k < n; k++) {
    const src = rand() < 0.3 && ne ? edge : fill
    const j = ((rand() * (src === edge ? ne : nf)) | 0) * 2
    const x = (src[j] + rand() - GW / 2) * g.sc
    const y = (g.cy - src[j + 1] - rand()) * g.sc
    xs[k] = x
    ys[k] = y
    ang[k] = Math.atan2(y, x * 1.3)
  }
  const idx = new Uint32Array(n)
  for (let k = 0; k < n; k++) idx[k] = k
  idx.sort((a, b) => ang[a] - ang[b])
  const out = new Float32Array(n * 2)
  for (let k = 0; k < n; k++) {
    out[k * 2] = xs[idx[k]]
    out[k * 2 + 1] = ys[idx[k]]
  }
  return out
}

/* ------------------------------------------------------------------ simulation (CPU, typed arrays) */

type Pointer = { x: number; y: number; vx: number; vy: number; active: boolean; r: number }

function createSim() {
  const pos = new Float32Array(N * 3)
  const vel = new Float32Array(N * 3)
  const info = new Float32Array(N * 2) // → attribute: glow, energy
  const rnd = new Float32Array(N * 4) // → attribute
  const glow = new Float32Array(N)
  const energy = new Float32Array(N)
  const mode = new Uint8Array(N)
  const glyph = new Uint8Array(N)
  const pStart = new Float32Array(N).fill(Infinity)
  const pMode = new Uint8Array(N)
  const pGlyph = new Uint8Array(N)
  const pKick = new Float32Array(N)
  const home = new Float32Array(N * 3)
  // analog roles: 0 ring 1 hour tick 2 minute tick 3 hour hand 4 minute hand 5 second hand 6 hub 7 face
  const aRole = new Uint8Array(N)
  const aX = new Float32Array(N)
  const aY = new Float32Array(N)
  const aZ = new Float32Array(N)
  const aAng = new Float32Array(N)
  // countdown ring
  const cU = new Float32Array(N)
  const cS = new Float32Array(N)
  const cC = new Float32Array(N)
  const cW = new Float32Array(N)
  const digits: (Float32Array | null)[] = new Array(10).fill(null)
  const colon = new Float32Array(PC * 2)

  for (let i = 0; i < N; i++) {
    for (let c = 0; c < 4; c++) rnd[i * 4 + c] = rand()
    if (i < M) {
      // a soft nebula the clock assembles from
      const u = rand() * Math.PI * 2
      const v = Math.acos(2 * rand() - 1)
      const r = 2.2 + Math.pow(rand(), 0.6) * 3.4
      home[i * 3] = Math.sin(v) * Math.cos(u) * r * 1.4
      home[i * 3 + 1] = Math.sin(v) * Math.sin(u) * r * 0.75
      home[i * 3 + 2] = Math.cos(v) * r * 0.6 - 1
      mode[i] = Md.Scatter
      glow[i] = 0.05
    } else {
      const spread = MOBILE ? 2.3 : 1
      home[i * 3] = (rand() * 2 - 1) * 7.5 * spread
      home[i * 3 + 1] = (rand() * 2 - 1) * 4.2 * spread
      home[i * 3 + 2] = -0.8 - rand() * 5
      mode[i] = Md.Ambient
      glow[i] = 0
    }
    pos.set(home.subarray(i * 3, i * 3 + 3), i * 3)
  }

  // analog roles — a random permutation so a mode switch sends every particle somewhere new
  const cuts = [0.17, 0.32, 0.41, 0.53, 0.67, 0.735, 0.765, 1]
  for (let i = 0; i < M; i++) {
    const q = rand()
    let role = 0
    while (q > cuts[role]) role++
    aRole[i] = role
    if (role === 0) {
      const a = rand() * Math.PI * 2
      const r = R_DIAL + gauss() * 0.022
      aX[i] = Math.sin(a) * r
      aY[i] = Math.cos(a) * r
      aZ[i] = gauss() * 0.03
      aAng[i] = a
    } else if (role === 1 || role === 2) {
      let t: number
      let rad: number
      let lat: number
      if (role === 1) {
        t = (rand() * 12) | 0
        rad = R_DIAL - 0.12 - rand() * (t % 3 === 0 ? 0.42 : 0.3)
        lat = (rand() - 0.5) * (t % 3 === 0 ? 0.11 : 0.07)
        t *= 5
      } else {
        t = (rand() * 60) | 0
        if (t % 5 === 0) t = (t + 1 + ((rand() * 4) | 0)) % 60
        rad = R_DIAL - 0.1 - rand() * 0.11
        lat = (rand() - 0.5) * 0.024
      }
      const a = (t / 60) * Math.PI * 2
      aX[i] = Math.sin(a) * rad + Math.cos(a) * lat
      aY[i] = Math.cos(a) * rad - Math.sin(a) * lat
      aZ[i] = gauss() * 0.03
      aAng[i] = a
    } else if (role >= 3 && role <= 5) {
      const L = role === 3 ? 1.28 : role === 4 ? 1.9 : 2.12
      const tail = role === 3 ? 0.22 : role === 4 ? 0.28 : 0.48
      const w = role === 3 ? 0.08 : role === 4 ? 0.055 : 0.014
      if (role === 5 && rand() < 0.16) {
        // counterweight on the seconds hand
        const a = rand() * Math.PI * 2
        const r = Math.sqrt(rand()) * 0.065
        aX[i] = -0.36 + Math.cos(a) * r
        aY[i] = Math.sin(a) * r
      } else {
        const along = -tail + Math.pow(rand(), 0.9) * (L + tail)
        aX[i] = along
        aY[i] = (rand() * 2 - 1) * w * (1 - 0.55 * Math.max(0, along) / L)
      }
      aZ[i] = (role - 2) * 0.06 + gauss() * 0.015
    } else if (role === 6) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 0.11
      aX[i] = Math.cos(a) * r
      aY[i] = Math.sin(a) * r
      aZ[i] = 0.26 + gauss() * 0.02
    } else {
      // guilloché rings on the dial face
      const k = (rand() * 6) | 0
      const r = 0.48 + k * 0.27 + gauss() * 0.012
      const a = rand() * Math.PI * 2
      aX[i] = Math.sin(a) * r
      aY[i] = Math.cos(a) * r
      aZ[i] = -0.12 + gauss() * 0.02
    }
    // countdown ring slot
    const u = rand()
    cU[i] = u
    cS[i] = Math.sin(u * Math.PI * 2)
    cC[i] = Math.cos(u * Math.PI * 2)
    cW[i] = gauss()
  }

  for (let j = 0; j < PC; j++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 0.105
    colon[j * 2] = Math.cos(a) * r
    colon[j * 2 + 1] = Math.sin(a) * r + (j < PC / 2 ? 0.36 : -0.36)
  }

  /* ---------------- global state */
  let t = 0
  let ready = false
  let gctx: GlyphCtx | null = null
  let nextDigit = 0
  let want: Md = Md.Digital
  let shownMode: Md = Md.Scatter
  let requested = true
  const shown = [-1, -1, -1, -1, -1, -1]
  const now6 = [0, 0, 0, 0, 0, 0]
  let secFrac = 0
  let thH = 0
  let thM = 0
  let thS = 0
  let colonPulse = 0
  // countdown
  let cdDur = 10
  let cdEnd = 0
  let cdPhase: 'run' | 'implode' | 'boom' = 'run'
  let cdBoomAt = 0
  let cdShown = -1
  let cdF = 1
  let kickSign = 1
  const listeners = { boom: () => {}, reform: () => {} }

  // target scratch
  let TX = 0
  let TY = 0
  let TZ = 0
  let TG = 0

  function target(i: number) {
    const m = mode[i]
    const zr = (rnd[i * 4] - 0.5) * 0.16
    if (m === Md.Digital) {
      if (i < 6 * PD) {
        const s = (i / PD) | 0
        const j = i - s * PD
        const pts = digits[glyph[i]]!
        TX = SLOT_X[s] + pts[j * 4]
        TY = SLOT_Y[s] + pts[j * 4 + 1]
        TZ = zr
        TG = 1
      } else {
        const c = i - 6 * PD >= PC ? 1 : 0
        const j = i - 6 * PD - c * PC
        if (PORTRAIT && c === 1) {
          // between the two rows the second colon lies down: a pulsing divider
          TX = colon[j * 2 + 1] * 0.8
          TY = colon[j * 2] * 0.8
        } else {
          TX = COLON_X[c] + colon[j * 2]
          TY = colon[j * 2 + 1] + (PORTRAIT ? ROW : 0)
        }
        TZ = zr
        TG = 0.55 + 0.75 * colonPulse
      }
    } else if (m === Md.Analog) {
      const role = aRole[i]
      if (role >= 3 && role <= 5) {
        const th = role === 3 ? thH : role === 4 ? thM : thS
        const s = Math.sin(th)
        const c = Math.cos(th)
        TX = s * aX[i] + c * aY[i]
        TY = c * aX[i] - s * aY[i]
        TZ = aZ[i]
        TG = role === 5 ? 1.3 : 1.02
      } else {
        TX = aX[i]
        TY = aY[i]
        TZ = aZ[i]
        if (role === 1 || role === 2) {
          // ticks light up as the seconds hand passes
          let d = Math.abs(aAng[i] - thS)
          if (d > Math.PI) d = Math.PI * 2 - d
          const near = Math.max(0, 1 - d / 0.22)
          TG = (role === 1 ? 0.95 : 0.5) + near * near * 0.9
        } else TG = role === 0 ? 0.7 : role === 6 ? 1.4 : 0.13
      }
    } else if (m === Md.Count) {
      const g = glyph[i]
      if (g !== RING) {
        const pair = i < 2 * PD ? 0 : 1
        const j = i - pair * 2 * PD
        const k = j < PD ? j * 2 : (j - PD) * 2 + 1
        const pts = digits[g & 15]!
        const cx = g & 16 ? 0 : pair === 0 ? -CD_DX : CD_DX
        TX = cx + pts[k * 2] * CD_S
        TY = pts[k * 2 + 1] * CD_S
        TZ = zr * 1.6
        TG = 1
      } else {
        const inner = i < 2 * PD
        const u = cU[i]
        if (u <= cdF) {
          const r = (inner ? R_CD - 0.19 : R_CD) + cW[i] * (inner ? 0.018 : 0.03)
          TX = cS[i] * r
          TY = cC[i] * r
          TZ = zr * 0.5
          const head = Math.max(0, 1 - (cdF - u) / 0.025)
          TG = (inner ? 0.42 : 0.85) + head * 1.2
        } else {
          // spent: drift outward as faint embers
          const r = R_CD + 0.3 + Math.abs(cW[i]) * 0.7 + (u - cdF) * 0.6
          TX = cS[i] * r
          TY = cC[i] * r
          TZ = -0.35 + zr * 3
          TG = 0.07
        }
      }
    } else if (m === Md.Ambient) {
      const ph = rnd[i * 4 + 1] * 6.283
      TX = home[i * 3] + Math.sin(t * 0.07 + ph) * 0.5
      TY = home[i * 3 + 1] + Math.cos(t * 0.05 + ph * 1.3) * 0.35
      TZ = home[i * 3 + 2]
      TG = 0.1 + rnd[i * 4 + 2] * 0.22
    } else {
      TX = home[i * 3]
      TY = home[i * 3 + 1]
      TZ = home[i * 3 + 2]
      TG = 0.05
    }
  }

  function schedule(i: number, delay: number, m: Md, g: number, kick: number) {
    pStart[i] = t + delay
    pMode[i] = m
    pGlyph[i] = g
    pKick[i] = kick
  }

  function digitGlyphs(): number[] {
    return POSTER ? POSTER_TIME : now6
  }

  function applyMode(m: Md, intro: boolean) {
    shownMode = m
    kickSign = -kickSign
    if (m === Md.Count) startCountdown(false)
    const d6 = digitGlyphs()
    for (let i = 0; i < M; i++) {
      let g = 0
      if (m === Md.Digital && i < 6 * PD) g = d6[(i / PD) | 0]
      if (m === Md.Count) g = cdGlyph(i, cdDur)
      const x = pos[i * 3]
      const delay = intro ? 0.05 + (x + 6) * 0.08 + rand() * 0.35 : 0.05 + (x + 4) * 0.06 + rand() * 0.55
      schedule(i, Math.max(0, delay), m, g, intro ? 0.5 * kickSign : 0.8 * kickSign)
    }
    if (m === Md.Digital) for (let s = 0; s < 6; s++) shown[s] = d6[s]
  }

  function cdGlyph(i: number, v: number) {
    if (i >= 4 * PD) return RING
    if (v >= 10) return i < 2 * PD ? Math.floor(v / 10) % 10 : v % 10
    return i < 2 * PD ? RING : (v % 10) | 16
  }

  function startCountdown(reschedule: boolean) {
    cdPhase = 'run'
    cdEnd = t + 1.3 + cdDur
    cdShown = cdDur
    cdF = 1
    if (reschedule) {
      kickSign = -kickSign
      for (let i = 0; i < M; i++) schedule(i, 0.05 + rand() * 0.6, Md.Count, cdGlyph(i, cdDur), 0.7 * kickSign)
    }
  }

  function countdownTick(v: number) {
    kickSign = -kickSign
    for (let i = 0; i < 4 * PD; i++) {
      const g = cdGlyph(i, v)
      if (g === glyph[i] && pStart[i] === Infinity) continue
      const pair = i < 2 * PD ? 0 : 1
      const j = i - pair * 2 * PD
      const k = j < PD ? j * 2 : (j - PD) * 2 + 1
      schedule(i, (k / (2 * PD)) * 0.3 + rand() * 0.06, Md.Count, g, 1.0 * kickSign)
    }
  }

  /** at zero everything first collapses into a hot core … */
  function implode() {
    cdPhase = 'implode'
    cdBoomAt = t
    for (let i = 0; i < M; i++) {
      const o = i * 3
      pStart[i] = Infinity
      mode[i] = Md.Free
      const T = IMPLODE * (0.85 + rand() * 0.15)
      vel[o] = (gauss() * 0.08 - pos[o]) / T
      vel[o + 1] = (gauss() * 0.08 - pos[o + 1]) / T
      vel[o + 2] = (gauss() * 0.08 - pos[o + 2]) / T
      energy[i] = Math.min(1.6, energy[i] + 0.5)
    }
  }

  /** … then bursts like a firework peony */
  function boom() {
    cdPhase = 'boom'
    cdBoomAt = t
    for (let i = 0; i < M; i++) {
      const o = i * 3
      let dx = gauss()
      let dy = gauss()
      let dz = gauss() * 0.45
      const l = Math.hypot(dx, dy, dz) + 1e-4
      dx /= l
      dy /= l
      dz /= l
      // three shells, like a firework peony, plus a few fast stars
      const q = rand()
      const sp = (q < 0.35 ? 2.5 : q < 0.9 ? 4.5 : 6.9) * (0.95 + rand() * 0.1)
      vel[o] = dx * sp
      vel[o + 1] = dy * sp + 0.4
      vel[o + 2] = dz * sp
      energy[i] = 1.2 + rand() * 0.6
    }
    listeners.boom()
  }

  function onSecond(d6: number[]) {
    // which slots changed? minute / hour roll-overs are bigger events
    let first = -1
    for (let s = 0; s < 6; s++) if (d6[s] !== shown[s]) { if (first < 0) first = s }
    if (first < 0) return
    const level = first <= 1 ? 3 : first <= 3 ? 2 : 1
    const mult = level === 3 ? 2.2 : level === 2 ? 1.7 : 1
    kickSign = -kickSign
    for (let s = 0; s < 6; s++) {
      const changed = d6[s] !== shown[s]
      const base = s * PD
      if (changed) {
        const cascade = level > 1 ? (s - first) * 0.07 : 0
        for (let j = 0; j < PD; j++) schedule(base + j, cascade + (j / PD) * 0.28 + rand() * 0.06, Md.Digital, d6[s], mult * kickSign)
      } else if (level > 1) {
        // a ripple runs through the digits that stay
        for (let j = 0; j < PD; j++) {
          const i = base + j
          if (pStart[i] !== Infinity || mode[i] !== Md.Digital) continue
          schedule(i, Math.abs(SLOT_X[s] - SLOT_X[first]) * 0.07 + rand() * 0.08, Md.Digital, d6[s], (level === 3 ? 0.8 : 0.45) * kickSign)
        }
      }
      shown[s] = d6[s]
    }
    if (level > 1)
      for (let i = 6 * PD; i < M; i++) if (mode[i] === Md.Digital && pStart[i] === Infinity) schedule(i, 0.1 + rand() * 0.1, Md.Digital, 0, 0.5 * kickSign)
  }

  const K = 95
  const C = 12.5

  function update(dtIn: number, ptr: Pointer) {
    const dt = Math.min(dtIn, 1 / 30)
    t += dt

    // glyphs are sampled one per frame so the first frame stays light
    if (!ready) {
      if (!gctx) gctx = glyphCtx()
      else if (nextDigit < 10) {
        digits[nextDigit] = sampleDigit(gctx, nextDigit)
        nextDigit++
      } else {
        ready = true
        gctx = null
      }
    }

    // clock
    if (POSTER) {
      thH = ((10 + 8 / 60 + 30 / 3600) / 12) * Math.PI * 2
      thM = ((8 + 30 / 60) / 60) * Math.PI * 2
      thS = (30 / 60) * Math.PI * 2
      secFrac = 0.15
    } else {
      const d = new Date()
      const h = d.getHours()
      const mi = d.getMinutes()
      const s = d.getSeconds()
      const ms = d.getMilliseconds()
      now6[0] = (h / 10) | 0
      now6[1] = h % 10
      now6[2] = (mi / 10) | 0
      now6[3] = mi % 10
      now6[4] = (s / 10) | 0
      now6[5] = s % 10
      secFrac = ms / 1000
      const sec = s + secFrac
      thS = (sec / 60) * Math.PI * 2
      thM = ((mi + sec / 60) / 60) * Math.PI * 2
      thH = (((h % 12) + mi / 60 + sec / 3600) / 12) * Math.PI * 2
    }
    colonPulse = Math.exp(-secFrac * 5)

    if (ready && requested) {
      requested = false
      if (POSTER) {
        shownMode = want
        for (let i = 0; i < M; i++) {
          mode[i] = want
          glyph[i] = i < 6 * PD ? POSTER_TIME[(i / PD) | 0] : 0
          target(i)
          pos[i * 3] = TX
          pos[i * 3 + 1] = TY
          pos[i * 3 + 2] = TZ
          glow[i] = TG
        }
        for (let s = 0; s < 6; s++) shown[s] = POSTER_TIME[s]
      } else applyMode(want, shownMode === Md.Scatter)
    }
    if (ready && shownMode === Md.Digital && !POSTER) onSecond(now6)
    if (ready && shownMode === Md.Count) {
      if (cdPhase === 'run') {
        const rem = cdEnd - t
        cdF = Math.min(1, Math.max(0, rem / cdDur))
        if (rem <= 0) implode()
        else {
          const v = Math.min(cdDur, Math.ceil(rem))
          if (v !== cdShown) {
            cdShown = v
            countdownTick(v)
          }
        }
      } else if (cdPhase === 'implode') {
        if (t - cdBoomAt > IMPLODE) boom()
      } else if (t - cdBoomAt > 2.7) {
        startCountdown(true)
        listeners.reform()
      }
    }

    const imploding = shownMode === Md.Count && cdPhase === 'implode'
    const kd = 1 - Math.exp(-dt * 6)
    const ed = Math.exp(-dt * (shownMode === Md.Count && cdPhase === 'boom' ? 0.9 : 2.4))
    const R = ptr.r
    const R2 = R * R
    const px0 = ptr.x
    const py0 = ptr.y
    const act = ptr.active
    for (let i = 0; i < N; i++) {
      const o = i * 3
      if (pStart[i] <= t) {
        pStart[i] = Infinity
        mode[i] = pMode[i]
        glyph[i] = pGlyph[i]
        const k = pKick[i]
        if (k !== 0) {
          target(i)
          const dx = TX - pos[o]
          const dy = TY - pos[o + 1]
          const curve = k * 1.6
          vel[o] += -dy * curve
          vel[o + 1] += dx * curve
          vel[o + 2] += Math.abs(k) * (0.6 + rnd[i * 4 + 3] * 1.4)
          energy[i] = Math.min(1.6, energy[i] + Math.min(0.9, Math.abs(k) * 0.55))
        }
      }
      let vx = vel[o]
      let vy = vel[o + 1]
      let vz = vel[o + 2]
      const m = mode[i]
      if (m === Md.Free && imploding) {
        TG = 0.6
      } else if (m === Md.Free) {
        vy -= 0.9 * dt
        const dr = 1 - 1.7 * dt
        vx *= dr
        vy *= dr
        vz *= dr
        TG = 0.25
      } else {
        target(i)
        const k = m === Md.Scatter || m === Md.Ambient ? K * 0.12 : K
        const c = m === Md.Scatter || m === Md.Ambient ? C * 0.4 : C
        vx += ((TX - pos[o]) * k - vx * c) * dt
        vy += ((TY - pos[o + 1]) * k - vy * c) * dt
        vz += ((TZ - pos[o + 2]) * k - vz * c) * dt
      }
      if (act && i < M) {
        const dx = pos[o] - px0
        const dy = pos[o + 1] - py0
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 1e-3
          let f = 1 - d / R
          f *= f
          vx += (dx / d) * f * 70 * dt + ptr.vx * f * 6 * dt
          vy += (dy / d) * f * 70 * dt + ptr.vy * f * 6 * dt
          vz += f * 26 * dt
          energy[i] = Math.min(1.2, energy[i] + f * dt * 4)
        }
      }
      vel[o] = vx
      vel[o + 1] = vy
      vel[o + 2] = vz
      pos[o] += vx * dt
      pos[o + 1] += vy * dt
      pos[o + 2] += vz * dt
      glow[i] += (TG - glow[i]) * kd
      const e = energy[i] * ed
      energy[i] = e
      const s2 = vx * vx + vy * vy + vz * vz
      info[i * 2] = glow[i]
      info[i * 2 + 1] = e + Math.min(0.8, s2 * 0.004)
    }
  }

  return {
    pos,
    info,
    rnd,
    update,
    listeners,
    setMode(m: ClockMode) {
      want = MODE_ID[m]
      requested = true
    },
    setDuration(d: number) {
      cdDur = d
      if (ready && shownMode === Md.Count) startCountdown(true)
    },
    restart() {
      if (ready && shownMode === Md.Count) startCountdown(true)
    },
    get mode() {
      return shownMode
    },
  }
}

type Sim = ReturnType<typeof createSim>

/* ------------------------------------------------------------------ rendering */

const VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
uniform float uFire;
attribute vec2 aInfo;
attribute vec4 aRnd;
varying vec3 vCol;
varying float vA;
float h12(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 p = position;
  float ph = aRnd.x * 6.2831;
  p += vec3(sin(uTime * 1.3 + ph), cos(uTime * 1.1 + ph * 1.7), sin(uTime * 0.9 + ph * 2.3)) * 0.007;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float g = aInfo.x;
  float e = aInfo.y;
  float tw = step(0.94, h12(aRnd.xy * 91.7 + floor(uTime * 14.0 + aRnd.z * 7.0))) * clamp(e * 1.3 - 0.1, 0.0, 1.0);
  vec3 deep = vec3(1.0, 0.34, 0.09);
  vec3 amber = vec3(1.0, 0.64, 0.22);
  vec3 pale = vec3(1.0, 0.86, 0.6);
  vec3 hot = vec3(1.0, 0.97, 0.9);
  vec3 c = mix(deep, amber, smoothstep(0.0, 0.6, aRnd.z));
  c = mix(c, pale, smoothstep(0.8, 1.0, aRnd.z));
  c = mix(c, hot, clamp(e * 0.5 + max(g - 1.05, 0.0) * 1.2 + tw, 0.0, 1.0));
  float q = aRnd.w;
  vec3 fc = q < 0.3 ? vec3(1.0, 0.36, 0.42) : q < 0.6 ? vec3(1.0, 0.76, 0.3) : q < 0.8 ? vec3(0.58, 0.76, 1.0) : vec3(1.0, 0.96, 0.88);
  c = mix(c, fc, uFire * 0.85);
  float b = g + e * 0.7 + tw * 1.5;
  vCol = c * b;
  vA = clamp(b, 0.0, 1.0);
  gl_PointSize = uSize * (0.55 + aRnd.y * 0.9) * (1.0 + e * 0.3 + tw * 0.9) / -mv.z;
#ifdef HALO
  vCol = c * min(b, 1.6);
  gl_PointSize = uSize * 6.0 / -mv.z;
#endif
}
`

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.06, d);
  a *= a;
#ifdef HALO
  gl_FragColor = vec4(vCol * a * 0.045, 0.0);
#else
  gl_FragColor = vec4(vCol * a * 0.75, a * vA * 0.3);
#endif
}
`

const FIT = { [Md.Digital]: PORTRAIT ? [4 * DW + CW, 2 * ROW + GH] : [CLOCK_W, GH], [Md.Analog]: [4.9, 4.9], [Md.Count]: [5.9, 5.9] } as Record<number, [number, number]>

function ClockPoints({ sim, fire }: { sim: Sim; fire: MotionValue<number> }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const pts = useRef<THREE.Points>(null)
  const scale = useRef(0)
  const lastMove = useRef(0)

  useEffect(() => {
    const mv = () => (lastMove.current = performance.now())
    const off = () => (lastMove.current = 0)
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerdown', mv)
    document.documentElement.addEventListener('pointerleave', off)
    window.addEventListener('blur', off)
    return () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerdown', mv)
      document.documentElement.removeEventListener('pointerleave', off)
      window.removeEventListener('blur', off)
    }
  }, [])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aInfo', new THREE.BufferAttribute(sim.info, 2).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aRnd', new THREE.BufferAttribute(sim.rnd, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30)
    return g
  }, [sim])

  // a sparse second pass of big, faint sprites reads as bloom without a post-processing chain
  const haloGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', geometry.attributes.position)
    g.setAttribute('aInfo', geometry.attributes.aInfo)
    g.setAttribute('aRnd', geometry.attributes.aRnd)
    const idx = new Uint32Array(Math.floor(M / 6))
    for (let k = 0; k < idx.length; k++) idx[k] = k * 6
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30)
    return g
  }, [geometry])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        uniforms: { uSize: { value: 30 }, uTime: { value: 0 }, uFire: { value: 0 } },
      }),
    [],
  )
  const haloMaterial = useMemo(() => {
    const m = material.clone()
    m.defines = { HALO: 1 }
    m.uniforms = material.uniforms
    return m
  }, [material])

  const tmp = useMemo(
    () => ({
      inv: new THREE.Matrix4(),
      ray: new THREE.Ray(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hit: new THREE.Vector3(),
      ptr: { x: 0, y: 0, vx: 0, vy: 0, active: false, r: 0.6 } as Pointer,
      has: false,
    }),
    [],
  )

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30)
    const o = outer.current
    const g = inner.current
    const p = pts.current
    if (!o || !g || !p) return
    const time = POSTER ? 0 : state.clock.elapsedTime

    // fit the current layout into the view (perspective, camera at z=10)
    const cam = state.camera as THREE.PerspectiveCamera
    const visH = 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const visW = visH * cam.aspect
    const portrait = cam.aspect < 0.9
    const [fw, fh] = FIT[sim.mode] ?? FIT[Md.Digital]
    const fit = Math.min(1.08, (visW * (portrait ? 0.92 : 0.8)) / fw, (visH * (sim.mode === Md.Digital && !portrait ? 0.42 : 0.7)) / fh)
    scale.current = scale.current ? THREE.MathUtils.damp(scale.current, fit, 2.2, dt) : fit
    const s = scale.current
    g.scale.setScalar(s)
    const lift = POSTER ? 0 : portrait ? visH * 0.1 : 0.22
    g.position.y = THREE.MathUtils.damp(g.position.y, lift, 3, dt)

    // slow drift so the layout reads as a 3D object
    const px = POSTER ? 0 : state.pointer.x
    const py = POSTER ? 0 : state.pointer.y
    o.rotation.y = THREE.MathUtils.damp(o.rotation.y, Math.sin(time * 0.11) * 0.2 + px * 0.12 + (POSTER ? -0.12 : 0), 2, dt)
    o.rotation.x = THREE.MathUtils.damp(o.rotation.x, Math.sin(time * 0.083) * 0.07 - py * 0.08 + (POSTER ? 0.06 : 0), 2, dt)

    // pointer → local plane of the clock
    const ptr = tmp.ptr
    const active = !POSTER && performance.now() - lastMove.current < 1800
    if (active) {
      p.updateWorldMatrix(true, false)
      state.raycaster.setFromCamera(state.pointer, cam)
      tmp.inv.copy(p.matrixWorld).invert()
      tmp.ray.copy(state.raycaster.ray).applyMatrix4(tmp.inv)
      if (tmp.ray.intersectPlane(tmp.plane, tmp.hit)) {
        if (tmp.has) {
          ptr.vx = THREE.MathUtils.damp(ptr.vx, (tmp.hit.x - ptr.x) / Math.max(dt, 1e-3), 10, dt)
          ptr.vy = THREE.MathUtils.damp(ptr.vy, (tmp.hit.y - ptr.y) / Math.max(dt, 1e-3), 10, dt)
        }
        ptr.x = tmp.hit.x
        ptr.y = tmp.hit.y
        tmp.has = true
      }
    } else tmp.has = false
    ptr.active = active && tmp.has
    ptr.r = 0.62 / s

    sim.update(dtRaw, ptr)
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aInfo.needsUpdate = true

    const u = material.uniforms
    u.uTime.value = time
    u.uFire.value = fire.get()
    u.uSize.value = 30 * dpr * (state.size.height / 900) * Math.pow(s, 0.55)
  })

  return (
    <group ref={outer}>
      <group ref={inner}>
        <points geometry={haloGeometry} material={haloMaterial} frustumCulled={false} renderOrder={-1} />
        <points ref={pts} geometry={geometry} material={material} frustumCulled={false} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ page */

const MODES: { value: ClockMode; label: string; en: string; aside: string }[] = [
  { value: 'digital', label: '数字', en: 'Digital', aside: '只有变化的那一位会重排' },
  { value: 'analog', label: '指针', en: 'Analog dial', aside: '刻度与指针都是粒子' },
  { value: 'countdown', label: '倒计时', en: 'Countdown', aside: '归零时炸成烟花再重组' },
]
const DURS = [10, 30, 60]

export default function ParticleClock() {
  const [mode, setMode] = useState<ClockMode>('digital')
  const [dur, setDur] = useState(10)
  const sim = useMemo(() => createSim(), [])
  const fire = useMotionValue(0)

  useEffect(() => {
    sim.listeners.boom = () => {
      animate(fire, 1, { duration: 0.12 })
    }
    sim.listeners.reform = () => {
      animate(fire, 0, { duration: 1.6, ease: [0.23, 1, 0.32, 1] })
    }
  }, [sim, fire])

  useEffect(() => {
    sim.setMode(mode)
    if (mode !== 'countdown') animate(fire, 0, { duration: 0.6 })
  }, [mode, sim, fire])

  const m = MODES.find((x) => x.value === mode)!

  return (
    <div className="stage" style={{ background: 'radial-gradient(80% 70% at 50% 42%, #1b1510 0%, #0d0d12 68%)' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 10], fov: 35 }} gl={{ antialias: false, alpha: true }}>
        <ClockPoints sim={sim} fire={fire} />
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={mode}
          meta={`${N.toLocaleString()} particles · ${mode === 'countdown' ? `${dur}s` : 'live'}`}
          title={m.label}
          sub={m.en}
          aside={m.aside}
        />
        <div className="dock pclk-dock">
          <Seg items={MODES.map((x) => ({ value: x.value, label: x.label }))} value={mode} onChange={setMode} />
          <AnimatePresence initial={false}>
            {mode === 'countdown' && (
              <motion.div
                key="cd"
                className="pclk-extra"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
              >
                <span className="dock-sep" />
                <Seg
                  items={DURS.map((d) => ({ value: d, label: `${d}s` }))}
                  value={dur}
                  onChange={(d) => {
                    // tapping the current duration restarts it
                    setDur(d)
                    sim.setDuration(d)
                  }}
                />
                <button className="seg pclk-restart" onClick={() => sim.restart()}>
                  <span>重来</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="hint">
          移动指针拨开粒子
          <br />
          松开后它们会弹回原位
        </p>
      </div>
      <style>{`
        .pclk-extra { display: flex; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
        @media (max-width: 760px) {
          .pclk-restart { display: none; }
          .pclk-dock .seg { padding: 0 11px; }
        }
      `}</style>
    </div>
  )
}
