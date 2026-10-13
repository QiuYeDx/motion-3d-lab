import * as THREE from 'three'

/**
 * Card artwork baked into channel-packed data textures (system fonts only).
 * Front:  R text · G foil mask · B chip (1 = pad, .5 = gap) · A emboss height
 * Back:   R text · G foil sticker · B signature panel · A magnetic stripe
 * Packed as raw bytes (DataTexture) so the four channels never get premultiplied together.
 */

export const TEX_W = 1600
export const TEX_H = 1008
const MM = TEX_W / 85.6 // px per millimetre of a real ID-1 card

const SANS = "'SF Pro Display', 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
const MONO = "'JetBrains Mono', 'Cascadia Code', 'SF Mono', Consolas, 'Courier New', monospace"
const SCRIPT = "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'STKaiti', cursive"
const CJK = "'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"

type Ctx = CanvasRenderingContext2D

function layer(draw: (c: Ctx) => void) {
  const cv = document.createElement('canvas')
  cv.width = TEX_W
  cv.height = TEX_H
  const c = cv.getContext('2d', { willReadFrequently: true })!
  c.fillStyle = '#000'
  c.fillRect(0, 0, TEX_W, TEX_H)
  c.fillStyle = '#fff'
  c.strokeStyle = '#fff'
  c.textBaseline = 'alphabetic'
  draw(c)
  return c.getImageData(0, 0, TEX_W, TEX_H).data
}

function pack(chs: Uint8ClampedArray[]) {
  const out = new Uint8Array(TEX_W * TEX_H * 4)
  for (let y = 0; y < TEX_H; y++) {
    const src = y * TEX_W * 4
    const dst = (TEX_H - 1 - y) * TEX_W * 4 // canvas is top-down, GL is bottom-up
    for (let x = 0; x < TEX_W * 4; x += 4) {
      out[dst + x] = chs[0][src + x]
      out[dst + x + 1] = chs[1][src + x]
      out[dst + x + 2] = chs[2][src + x]
      out[dst + x + 3] = chs[3][src + x]
    }
  }
  const t = new THREE.DataTexture(out, TEX_W, TEX_H, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 8
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

const mm = (v: number) => v * MM

function text(c: Ctx, s: string, x: number, y: number, size: number, opts: { font?: string; weight?: number; spacing?: number; align?: CanvasTextAlign; value?: number } = {}) {
  c.save()
  c.font = `${opts.weight ?? 500} ${mm(size)}px ${opts.font ?? SANS}`
  ;(c as Ctx & { letterSpacing?: string }).letterSpacing = `${mm(opts.spacing ?? 0)}px`
  c.textAlign = opts.align ?? 'left'
  const v = Math.round((opts.value ?? 1) * 255)
  c.fillStyle = `rgb(${v},${v},${v})`
  c.fillText(s, mm(x), mm(y))
  c.restore()
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.roundRect(mm(x), mm(y), mm(w), mm(h), mm(r))
}

/* the emblem: a thick halo ring with a hairline orbit and a small satellite */
const EM = { x: 63, y: 21, r0: 12.5, r1: 19.5 }
function emblem(c: Ctx, value = 1) {
  const v = Math.round(value * 255)
  c.fillStyle = `rgb(${v},${v},${v})`
  c.strokeStyle = c.fillStyle
  c.beginPath()
  c.arc(mm(EM.x), mm(EM.y), mm(EM.r1), 0, Math.PI * 2)
  c.arc(mm(EM.x), mm(EM.y), mm(EM.r0), 0, Math.PI * 2, true)
  c.fill('evenodd')
  c.lineWidth = mm(0.35)
  c.beginPath()
  c.ellipse(mm(EM.x), mm(EM.y), mm(26), mm(9), -0.42, 0, Math.PI * 2)
  c.stroke()
  c.beginPath()
  c.arc(mm(EM.x + 24.2 * Math.cos(-0.42 - 0.9)), mm(EM.y + 9 * Math.sin(-0.42 - 0.9) + 1.5), mm(1.3), 0, Math.PI * 2)
  c.fill()
}

function chip(c: Ctx, x: number, y: number) {
  const w = 11.6
  const h = 9
  c.fillStyle = '#fff'
  rrect(c, x, y, w, h, 1.4)
  c.fill()
  // contact gaps
  c.strokeStyle = 'rgb(128,128,128)'
  c.lineWidth = mm(0.32)
  c.beginPath()
  c.moveTo(mm(x), mm(y + h / 3))
  c.lineTo(mm(x + w * 0.34), mm(y + h / 3))
  c.moveTo(mm(x), mm(y + (2 * h) / 3))
  c.lineTo(mm(x + w * 0.34), mm(y + (2 * h) / 3))
  c.moveTo(mm(x + w * 0.66), mm(y + h / 3))
  c.lineTo(mm(x + w), mm(y + h / 3))
  c.moveTo(mm(x + w * 0.66), mm(y + (2 * h) / 3))
  c.lineTo(mm(x + w), mm(y + (2 * h) / 3))
  c.moveTo(mm(x + w * 0.34), mm(y))
  c.lineTo(mm(x + w * 0.34), mm(y + h))
  c.moveTo(mm(x + w * 0.66), mm(y))
  c.lineTo(mm(x + w * 0.66), mm(y + h))
  c.stroke()
  rrect(c, x + w * 0.34, y + h * 0.3, w * 0.32, h * 0.4, 0.8)
  c.stroke()
}

function contactless(c: Ctx, x: number, y: number, value = 1) {
  const v = Math.round(value * 255)
  c.strokeStyle = `rgb(${v},${v},${v})`
  c.lineWidth = mm(0.45)
  c.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    c.beginPath()
    c.arc(mm(x), mm(y), mm(1.2 + i * 1.25), -0.75, 0.75)
    c.stroke()
  }
}

export function makeFront() {
  const R = layer((c) => {
    text(c, 'HALO', 8, 13.2, 6.4, { weight: 700, spacing: 0.9 })
    text(c, 'MEMBERS  CLUB', 8.2, 17.2, 1.75, { font: MONO, spacing: 0.55, value: 0.8 })
    text(c, 'PLATINUM', 77.6, 50.6, 2.0, { font: MONO, weight: 600, spacing: 0.7, align: 'right', value: 0.9 })
    contactless(c, 23.6, 28, 0.85)
    text(c, '6288  1024  7731  0520', 8, 41.5, 4.6, { font: MONO, weight: 500, spacing: 0.25 })
    text(c, 'CARD HOLDER', 8.2, 46.6, 1.5, { font: MONO, spacing: 0.4, value: 0.6 })
    text(c, 'LIN ZHIYUAN', 8, 50.6, 2.9, { weight: 600, spacing: 0.45 })
    text(c, 'VALID THRU', 47, 46.6, 1.5, { font: MONO, spacing: 0.4, value: 0.6 })
    text(c, '08 / 31', 47, 50.6, 2.9, { font: MONO, weight: 500, spacing: 0.2 })
  })
  const G = layer((c) => {
    // a faint foil wash everywhere, the emblem and a slim band at full strength
    c.fillStyle = 'rgb(40,40,40)'
    c.fillRect(0, 0, TEX_W, TEX_H)
    emblem(c, 1)
    c.save()
    c.filter = `blur(${mm(0.25)}px)`
    c.fillStyle = 'rgb(210,210,210)'
    c.beginPath()
    c.moveTo(mm(37), 0)
    c.lineTo(mm(44.5), 0)
    c.lineTo(mm(57), mm(26))
    c.lineTo(mm(50), mm(29))
    c.closePath()
    c.fill()
    c.restore()
    text(c, 'HALO', 8, 13.2, 6.4, { weight: 700, spacing: 0.9 })
  })
  const B = layer((c) => chip(c, 8.2, 21.5))
  const A = layer((c) => {
    c.filter = `blur(${mm(0.45)}px)`
    emblem(c, 0.9)
    c.filter = `blur(${mm(0.12)}px)`
    text(c, 'HALO', 8, 13.2, 6.4, { weight: 700, spacing: 0.9, value: 0.7 })
    text(c, '6288  1024  7731  0520', 8, 41.5, 4.6, { font: MONO, weight: 500, spacing: 0.25, value: 0.55 })
  })
  return pack([R, G, B, A])
}

export function makeBack() {
  const R = layer((c) => {
    text(c, 'AUTHORIZED SIGNATURE · 持卡人签名', 8.2, 22.6, 1.45, { font: MONO, spacing: 0.25, value: 0.65 })
    // signature (drawn on the light panel — the shader inks it dark there)
    text(c, 'Lin Zhiyuan', 11, 30.4, 4.6, { font: SCRIPT, weight: 400 })
    text(c, '731', 61.3, 30.2, 2.6, { font: MONO, weight: 600, spacing: 0.3 })
    text(c, 'CVV', 61.3, 22.6, 1.45, { font: MONO, spacing: 0.3, value: 0.65 })
    const lines = [
      ['本卡仅限持卡人本人使用，不得转借。积分与权益以 HALO 会员条款为准。', CJK],
      ['THIS CARD IS THE PROPERTY OF HALO MEMBERS CLUB.', MONO],
      ['IF FOUND, PLEASE CALL THE NUMBER BELOW.', MONO],
    ] as const
    lines.forEach(([s, f], i) => text(c, s, 8.2, 38.2 + i * 2.9, 1.55, { font: f, spacing: f === MONO ? 0.12 : 0.1, value: 0.62 }))
    text(c, '客服热线 400-820-0520', 8.2, 50.6, 2.1, { font: CJK, weight: 600, value: 0.9 })
    text(c, 'halo.club', 77.6, 50.6, 2.1, { font: MONO, weight: 500, align: 'right', value: 0.9, spacing: 0.15 })
  })
  const G = layer((c) => {
    c.fillStyle = 'rgb(26,26,26)'
    c.fillRect(0, 0, TEX_W, TEX_H)
    // holographic security sticker
    c.fillStyle = '#fff'
    rrect(c, 66.2, 35.4, 11.4, 9.2, 1.2)
    c.fill()
  })
  const B = layer((c) => {
    rrect(c, 8.2, 24.4, 49.5, 8.4, 0.6)
    c.fill()
    // CVV box
    c.fillStyle = 'rgb(150,150,150)'
    rrect(c, 59.6, 24.4, 9, 8.4, 0.6)
    c.fill()
  })
  const A = layer((c) => {
    c.fillRect(0, mm(4.6), TEX_W, mm(11.6))
  })
  return pack([R, G, B, A])
}
