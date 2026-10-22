import * as THREE from 'three'
import type { Softbox } from './studioEnv'

/* ------------------------------------------------------------------ combination */

export const CODE = [24, 63, 7] as const
/** +1 = turn right (clockwise, numbers at the index go up), −1 = turn left */
export const STEP_DIR = [1, -1, 1] as const
export const TICKS = 100
export const TICK = (Math.PI * 2) / TICKS

/** darker softboxes than the shared studio: a dim room with one overhead strip and a cool side card */
export const VAULT_BOXES: Softbox[] = [
  { pos: [0, 6, 3], size: [9, 2.6], intensity: 2.6, color: '#fff1dc' },
  { pos: [-6, 2.5, 4], size: [2, 7], intensity: 1.8, color: '#ffe2c4' },
  { pos: [6, 2, 2], size: [2.4, 7], intensity: 1.4, color: '#cfdcff' },
  { pos: [0, 0, 8], size: [7, 1.2], intensity: 0.8 },
  { pos: [2, 3, -6], size: [3, 3], intensity: 0.6, color: '#ffd9b0' },
  { pos: [0, -6, 0], size: [14, 14], intensity: 0.18 },
]

/* ------------------------------------------------------------------ textures */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const MONO = 'ui-monospace,"Cascadia Code",Consolas,monospace'
const SERIF = 'Georgia,"Times New Roman",serif'

/** dial face: 100 ticks, numbers every 10, increasing counter-clockwise from the top (classic safe dial) */
export function dialTexture() {
  return canvasTex(1024, 1024, (g) => {
    const c = 512
    const grd = g.createRadialGradient(c - 120, c - 160, 40, c, c, 520)
    grd.addColorStop(0, '#34363d')
    grd.addColorStop(0.6, '#1d1e23')
    grd.addColorStop(1, '#141519')
    g.fillStyle = grd
    g.fillRect(0, 0, 1024, 1024)
    // fine concentric machining
    g.globalAlpha = 0.07
    for (let r = 40; r < 510; r += 5) {
      g.strokeStyle = r % 2 ? '#ffffff' : '#000000'
      g.beginPath()
      g.arc(c, c, r, 0, Math.PI * 2)
      g.stroke()
    }
    g.globalAlpha = 1
    for (let n = 0; n < TICKS; n++) {
      const a = (n / TICKS) * Math.PI * 2
      const sx = -Math.sin(a)
      const sy = -Math.cos(a)
      const major = n % 10 === 0
      const mid = n % 5 === 0
      const r0 = 500
      const r1 = major ? 430 : mid ? 450 : 466
      g.strokeStyle = major ? '#e9cf8e' : '#b9a57a'
      g.lineWidth = major ? 7 : mid ? 5 : 3
      g.beginPath()
      g.moveTo(c + sx * r0, c + sy * r0)
      g.lineTo(c + sx * r1, c + sy * r1)
      g.stroke()
      if (major) {
        g.save()
        g.translate(c + sx * 372, c + sy * 372)
        g.rotate(-a)
        g.fillStyle = '#f1dca4'
        g.font = `600 64px ${MONO}`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(String(n), 0, 0)
        g.restore()
      }
    }
    g.strokeStyle = 'rgba(233,207,142,0.35)'
    g.lineWidth = 3
    g.beginPath()
    g.arc(c, c, 318, 0, Math.PI * 2)
    g.stroke()
  })
}

/** brushed-metal roughness streaks (linear data) */
export function brushedTexture() {
  const t = canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = '#8a8a8a'
      g.fillRect(0, 0, 512, 512)
      for (let i = 0; i < 1400; i++) {
        const y = Math.random() * 512
        const x = Math.random() * 512
        const l = 40 + Math.random() * 220
        const v = Math.floor(100 + Math.random() * 90)
        g.strokeStyle = `rgba(${v},${v},${v},${0.12 + Math.random() * 0.25})`
        g.lineWidth = Math.random() * 1.6 + 0.3
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + l, y + (Math.random() - 0.5) * 2)
        g.stroke()
      }
    },
    false,
  )
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function plateTexture() {
  return canvasTex(1024, 192, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 192)
    grd.addColorStop(0, '#e6c77c')
    grd.addColorStop(0.5, '#c79d45')
    grd.addColorStop(1, '#9d772c')
    g.fillStyle = grd
    g.fillRect(0, 0, 1024, 192)
    g.strokeStyle = 'rgba(70,45,10,0.55)'
    g.lineWidth = 4
    g.strokeRect(14, 14, 996, 164)
    g.fillStyle = '#3b2708'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `700 66px ${SERIF}`
    g.fillText('MOTION  &  CO.', 512, 84)
    g.font = `500 30px ${MONO}`
    g.fillText('VAULT  №  07  ·  EST. 1897', 512, 148)
    g.fillStyle = 'rgba(255,240,200,0.35)'
    g.fillRect(14, 16, 996, 3)
  })
}

export function floorGlowTexture() {
  return canvasTex(512, 512, (g) => {
    const grd = g.createRadialGradient(256, 256, 0, 256, 256, 256)
    grd.addColorStop(0, 'rgba(255,214,150,0.16)')
    grd.addColorStop(0.5, 'rgba(255,214,150,0.05)')
    grd.addColorStop(1, 'rgba(255,214,150,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 512)
  })
}

export function shadowTexture() {
  return canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grd.addColorStop(0, 'rgba(0,0,0,0.75)')
    grd.addColorStop(0.55, 'rgba(0,0,0,0.35)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
  })
}

export function paperTexture() {
  return canvasTex(512, 640, (g) => {
    g.fillStyle = '#efe6d2'
    g.fillRect(0, 0, 512, 640)
    g.strokeStyle = 'rgba(120,100,70,0.25)'
    g.lineWidth = 3
    for (let y = 150; y < 600; y += 44) {
      g.beginPath()
      g.moveTo(60, y)
      g.lineTo(60 + 300 + Math.random() * 120, y)
      g.stroke()
    }
    g.fillStyle = '#5b4528'
    g.font = `700 54px ${SERIF}`
    g.fillText('DEED', 60, 100)
  })
}

/* ------------------------------------------------------------------ geometry */

export function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

/** the safe's shell: a rounded tube (frame) around the door opening */
export function shellGeometry(W: number, H: number, D: number, ow: number, oh: number) {
  const outer = roundedRect(W, H, 0.16)
  outer.holes.push(roundedRect(ow, oh, 0.05))
  const g = new THREE.ExtrudeGeometry(outer, { depth: D, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 8 })
  g.translate(0, 0, -D / 2)
  return g
}

/** tapered ingot */
export function ingotGeometry() {
  const g = new THREE.BoxGeometry(0.5, 0.13, 0.24, 1, 1, 1)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      p.setX(i, p.getX(i) * 0.84)
      p.setZ(i, p.getZ(i) * 0.74)
    }
  }
  g.computeVertexNormals()
  return g.toNonIndexed()
}

/* ------------------------------------------------------------------ sound */

export type SafeSound = { tick: (s?: number) => void; clunk: () => void; unlock: () => void; door: () => void; thud: () => void; buzz: () => void; error: () => void }

export function makeSafeSound(): SafeSound {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  const out = ctx.createGain()
  out.gain.value = 0.85
  out.connect(ctx.destination)
  const mk = (dur: number, shape: (i: number, n: number) => number) => {
    const n = Math.floor(ctx.sampleRate * dur)
    const b = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = shape(i, n)
    return b
  }
  const click = mk(0.03, (i, n) => (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6))
  const rumble = mk(0.9, (i, n) => (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4))
  const play = (buf: AudioBuffer, t: number, f: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', rate = 1) => {
    const s = ctx.createBufferSource()
    s.buffer = buf
    s.playbackRate.value = rate
    const bp = ctx.createBiquadFilter()
    bp.type = type
    bp.frequency.value = f
    bp.Q.value = q
    const g = ctx.createGain()
    g.gain.value = gain
    s.connect(bp).connect(g).connect(out)
    s.start(t)
  }
  const tone = (t: number, f0: number, f1: number, gain: number, dur: number, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
  return {
    tick: (s = 1) => {
      const t = ctx.currentTime
      play(click, t, 4200 + Math.random() * 600, 3, 0.22 * s, 'bandpass', 0.9 + Math.random() * 0.2)
      tone(t, 1800, 1200, 0.025 * s, 0.015, 'triangle')
    },
    clunk: () => {
      const t = ctx.currentTime
      play(click, t, 900, 1.2, 0.9, 'bandpass', 0.55)
      tone(t, 210, 90, 0.35, 0.12)
      tone(t, 1250, 900, 0.05, 0.05, 'triangle')
    },
    unlock: () => {
      const t = ctx.currentTime
      // handle ratchet, then three bolts
      for (let i = 0; i < 9; i++) play(click, t + i * 0.08, 2200 - i * 60, 2, 0.25, 'bandpass', 0.8)
      for (let i = 0; i < 3; i++) {
        const tt = t + 0.95 + i * 0.07
        play(click, tt, 700, 1, 0.9, 'bandpass', 0.5)
        tone(tt, 160, 70, 0.3, 0.16)
      }
    },
    door: () => {
      const t = ctx.currentTime
      play(rumble, t, 140, 0.7, 0.55, 'lowpass', 0.8)
      // a slow hinge groan
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(70, t)
      o.frequency.linearRampToValueAtTime(96, t + 0.7)
      o.frequency.linearRampToValueAtTime(62, t + 1.3)
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 520
      f.Q.value = 6
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.2)
      g.gain.exponentialRampToValueAtTime(0.0005, t + 1.4)
      o.connect(f).connect(g).connect(out)
      o.start(t)
      o.stop(t + 1.5)
    },
    thud: () => {
      const t = ctx.currentTime
      tone(t, 120, 45, 0.5, 0.3)
      play(rumble, t, 300, 0.8, 0.5, 'lowpass', 1.4)
    },
    buzz: () => {
      const t = ctx.currentTime
      for (let i = 0; i < 4; i++) tone(t + i * 0.09 + Math.random() * 0.03, 120, 118, 0.04, 0.05, 'square')
    },
    error: () => {
      const t = ctx.currentTime
      tone(t, 180, 150, 0.12, 0.16, 'square')
      tone(t + 0.17, 150, 120, 0.12, 0.2, 'square')
    },
  }
}
