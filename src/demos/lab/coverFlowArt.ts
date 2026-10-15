/* Canvas art for the Cover Flow product cards: front (gradient + stylised product + name/price) and back (spec sheet). */

export type Product = {
  name: string
  en: string
  price: number
  tag: string
  c0: string // deep tone
  c1: string // light tone
  ink: string // illustration dark
  specs: [string, string][]
  draw: (ctx: CanvasRenderingContext2D, cx: number, cy: number, p: Product) => void
}

export const TEX_W = 576
export const TEX_H = 792

const SANS = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Inter", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "Cascadia Code", Consolas, monospace'

/* ------------------------------------------------------------------ helpers */

function lin(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}
function rad(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}
function groundShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a = 0.32) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  ctx.fillStyle = rad(ctx, 0, 0, 0, rx, [
    [0, `rgba(10,14,40,${a})`],
    [1, 'rgba(10,14,40,0)'],
  ])
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
function soft(ctx: CanvasRenderingContext2D, blur = 30, y = 16, a = 0.28) {
  ctx.shadowColor = `rgba(12,16,44,${a})`
  ctx.shadowBlur = blur
  ctx.shadowOffsetY = y
}
function noSoft(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

/* ------------------------------------------------------------------ illustrations (drawn around cx, cy; ~280px tall) */

const headphones: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 150, 150, 18)
  ctx.lineCap = 'round'
  soft(ctx)
  // band
  ctx.strokeStyle = lin(ctx, cx - 120, 0, cx + 120, 0, [
    [0, '#ffffff'],
    [1, '#dfe5ff'],
  ])
  ctx.lineWidth = 30
  ctx.beginPath()
  ctx.arc(cx, cy + 10, 112, Math.PI * 1.08, Math.PI * 1.92)
  ctx.stroke()
  noSoft(ctx)
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 10
  ctx.beginPath()
  ctx.arc(cx, cy + 10, 112, Math.PI * 1.2, Math.PI * 1.8)
  ctx.stroke()
  for (const s of [-1, 1]) {
    const x = cx + s * 112
    // yoke
    ctx.fillStyle = '#e8ecfb'
    rr(ctx, x - 8, cy - 20, 16, 60, 8)
    ctx.fill()
    soft(ctx, 24, 12)
    ctx.fillStyle = lin(ctx, x - 40, cy, x + 40, cy + 120, [
      [0, '#ffffff'],
      [1, '#d9e0fb'],
    ])
    rr(ctx, x - 44, cy + 20, 88, 124, 40)
    ctx.fill()
    noSoft(ctx)
    ctx.fillStyle = p.ink
    rr(ctx, x - 44 + (s < 0 ? 52 : 0), cy + 28, 36, 108, 18)
    ctx.fill()
    ctx.fillStyle = p.c0
    ctx.beginPath()
    ctx.arc(x - s * 8, cy + 82, 13, 0, Math.PI * 2)
    ctx.fill()
  }
}

const watch: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 156, 110, 16)
  ctx.fillStyle = lin(ctx, 0, cy - 160, 0, cy + 160, [
    [0, p.ink],
    [0.5, '#3a2a28'],
    [1, p.ink],
  ])
  rr(ctx, cx - 52, cy - 160, 104, 320, 40)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  for (let i = 0; i < 5; i++) {
    rr(ctx, cx - 4, cy + 86 + i * 14, 8, 8, 4)
    ctx.fill()
  }
  soft(ctx, 34, 18, 0.35)
  ctx.fillStyle = lin(ctx, cx - 90, cy - 90, cx + 90, cy + 90, [
    [0, '#ffffff'],
    [1, '#e9e2df'],
  ])
  rr(ctx, cx - 92, cy - 96, 184, 192, 58)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = '#ffffff'
  rr(ctx, cx + 88, cy - 24, 16, 36, 6)
  ctx.fill()
  ctx.fillStyle = '#1b1c22'
  rr(ctx, cx - 76, cy - 80, 152, 160, 44)
  ctx.fill()
  // rings
  const rings: [number, string][] = [
    [56, p.c0],
    [42, '#ffd166'],
    [28, '#5ee0a8'],
  ]
  ctx.lineCap = 'round'
  rings.forEach(([r, c], i) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 11
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = c
    ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.82 - i * 0.18))
    ctx.stroke()
  })
}

const speaker: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 140, 150, 18)
  // top face
  ctx.fillStyle = lin(ctx, 0, cy - 150, 0, cy - 90, [
    [0, '#ffffff'],
    [1, '#dff5ec'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx - 120, cy - 96)
  ctx.lineTo(cx - 70, cy - 140)
  ctx.lineTo(cx + 150, cy - 140)
  ctx.lineTo(cx + 120, cy - 96)
  ctx.closePath()
  ctx.fill()
  // side face
  ctx.fillStyle = p.ink
  ctx.beginPath()
  ctx.moveTo(cx + 120, cy - 96)
  ctx.lineTo(cx + 150, cy - 140)
  ctx.lineTo(cx + 150, cy + 90)
  ctx.lineTo(cx + 120, cy + 136)
  ctx.closePath()
  ctx.fill()
  soft(ctx, 26, 14)
  ctx.fillStyle = lin(ctx, cx - 120, cy - 96, cx + 120, cy + 136, [
    [0, '#ffffff'],
    [1, '#d5efe5'],
  ])
  rr(ctx, cx - 122, cy - 98, 244, 236, 26)
  ctx.fill()
  noSoft(ctx)
  // grille dots
  ctx.fillStyle = 'rgba(16,60,48,0.22)'
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 11; x++) {
      const px = cx - 100 + x * 20
      const py = cy - 76 + y * 20
      const d = Math.hypot(px - cx, py - cy - 20)
      if (d > 108) continue
      ctx.beginPath()
      ctx.arc(px, py, 4.2, 0, Math.PI * 2)
      ctx.fill()
    }
  ctx.fillStyle = p.c0
  rr(ctx, cx - 30, cy + 112, 60, 8, 4)
  ctx.fill()
}

const lamp: Product['draw'] = (ctx, cx, cy, p) => {
  // light cone
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = lin(ctx, cx + 40, cy - 40, cx - 20, cy + 160, [
    [0, 'rgba(255,248,220,0.55)'],
    [1, 'rgba(255,248,220,0)'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx + 34, cy - 66)
  ctx.lineTo(cx + 110, cy - 30)
  ctx.lineTo(cx + 40, cy + 160)
  ctx.lineTo(cx - 120, cy + 160)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  groundShadow(ctx, cx - 70, cy + 160, 110, 14)
  ctx.lineCap = 'round'
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.moveTo(cx - 80, cy + 140)
  ctx.lineTo(cx - 40, cy - 10)
  ctx.lineTo(cx + 40, cy - 110)
  ctx.stroke()
  ctx.fillStyle = '#fff'
  for (const [x, y] of [
    [cx - 40, cy - 10],
    [cx + 40, cy - 110],
  ]) {
    ctx.beginPath()
    ctx.arc(x, y, 14, 0, Math.PI * 2)
    ctx.fill()
  }
  // base
  soft(ctx, 22, 10)
  ctx.fillStyle = lin(ctx, 0, cy + 130, 0, cy + 166, [
    [0, '#ffffff'],
    [1, '#f4e3bd'],
  ])
  ctx.beginPath()
  ctx.ellipse(cx - 76, cy + 148, 84, 22, 0, 0, Math.PI * 2)
  ctx.fill()
  noSoft(ctx)
  // head
  ctx.save()
  ctx.translate(cx + 66, cy - 96)
  ctx.rotate(0.62)
  soft(ctx, 26, 12)
  ctx.fillStyle = lin(ctx, -60, 0, 60, 0, [
    [0, '#ffffff'],
    [1, '#f1dcae'],
  ])
  ctx.beginPath()
  ctx.moveTo(-34, -40)
  ctx.lineTo(34, -40)
  ctx.lineTo(70, 30)
  ctx.lineTo(-70, 30)
  ctx.closePath()
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = '#fffbe9'
  ctx.beginPath()
  ctx.ellipse(0, 30, 70, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const camera: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 116, 170, 18, 0.4)
  soft(ctx, 34, 18, 0.4)
  ctx.fillStyle = lin(ctx, 0, cy - 90, 0, cy + 100, [
    [0, '#f4f5fa'],
    [1, '#c9cede'],
  ])
  rr(ctx, cx - 150, cy - 70, 300, 172, 26)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = '#e9ecf5'
  rr(ctx, cx - 110, cy - 104, 92, 44, 12)
  ctx.fill()
  ctx.fillStyle = p.c0
  rr(ctx, cx + 78, cy - 92, 46, 26, 10)
  ctx.fill()
  // leather band
  ctx.fillStyle = '#2a2d3d'
  ctx.fillRect(cx - 150, cy - 26, 300, 92)
  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 40; i++) ctx.fillRect(cx - 150 + i * 7.5, cy - 26, 2, 92)
  // lens
  const l = cy + 16
  const rings: [number, string][] = [
    [80, '#dfe3ee'],
    [66, '#1c1f2c'],
    [52, '#343a55'],
    [36, '#111320'],
  ]
  soft(ctx, 20, 8, 0.4)
  rings.forEach(([r, c], i) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(cx + 10, l, r, 0, Math.PI * 2)
    ctx.fill()
    if (i === 0) noSoft(ctx)
  })
  ctx.fillStyle = rad(ctx, cx - 4, l - 14, 0, 30, [
    [0, 'rgba(160,190,255,0.8)'],
    [1, 'rgba(160,190,255,0)'],
  ])
  ctx.beginPath()
  ctx.arc(cx + 10, l, 36, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(cx - 2, l - 12, 7, 0, Math.PI * 2)
  ctx.fill()
}

const sneaker: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 108, 190, 18, 0.4)
  ctx.save()
  ctx.translate(cx - 10, cy + 10)
  ctx.rotate(-0.08)
  soft(ctx, 30, 16, 0.35)
  // upper
  ctx.fillStyle = lin(ctx, -160, -80, 160, 80, [
    [0, '#ffffff'],
    [1, '#ffe1ea'],
  ])
  ctx.beginPath()
  ctx.moveTo(-170, 60)
  ctx.bezierCurveTo(-176, 0, -150, -40, -110, -60)
  ctx.lineTo(-60, -96)
  ctx.bezierCurveTo(-30, -70, 0, -40, 40, -20)
  ctx.bezierCurveTo(100, 0, 170, 6, 186, 40)
  ctx.bezierCurveTo(196, 62, 190, 80, 170, 84)
  ctx.lineTo(-160, 84)
  ctx.closePath()
  ctx.fill()
  noSoft(ctx)
  // sole
  ctx.fillStyle = '#ffffff'
  rr(ctx, -176, 64, 372, 36, 18)
  ctx.fill()
  ctx.fillStyle = p.c0
  rr(ctx, -176, 88, 372, 12, 6)
  ctx.fill()
  // stripe
  ctx.strokeStyle = p.c0
  ctx.lineWidth = 16
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-120, 40)
  ctx.bezierCurveTo(-40, 50, 40, 20, 110, -2)
  ctx.stroke()
  // laces
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 6
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(-50 + i * 24, -74 + i * 16)
    ctx.lineTo(-30 + i * 24, -60 + i * 16)
    ctx.stroke()
  }
  ctx.fillStyle = p.ink
  rr(ctx, -150, -30, 26, 60, 12)
  ctx.fill()
  ctx.restore()
}

const bottle: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 160, 90, 14, 0.38)
  soft(ctx, 30, 16, 0.32)
  ctx.fillStyle = lin(ctx, cx - 70, 0, cx + 70, 0, [
    [0, '#c9ecfb'],
    [0.35, '#ffffff'],
    [1, '#9fd5ee'],
  ])
  rr(ctx, cx - 70, cy - 108, 140, 266, 46)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = lin(ctx, cx - 56, 0, cx + 56, 0, [
    [0, '#1f3a4f'],
    [0.4, '#3a6683'],
    [1, '#16293a'],
  ])
  rr(ctx, cx - 56, cy - 168, 112, 66, 22)
  ctx.fill()
  ctx.fillStyle = p.c0
  ctx.fillRect(cx - 70, cy + 44, 140, 30)
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  rr(ctx, cx - 44, cy - 84, 16, 210, 8)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `600 15px ${MONO}`
  ctx.textAlign = 'center'
  ctx.fillText('500ML', cx + 6, cy + 65)
  ctx.textAlign = 'left'
}

const keyboard: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 110, 200, 20, 0.36)
  ctx.save()
  ctx.translate(cx, cy + 10)
  ctx.transform(1, 0, -0.32, 0.62, 0, 0)
  soft(ctx, 30, 22, 0.38)
  ctx.fillStyle = '#e9e5ff'
  rr(ctx, -200, -150, 400, 250, 26)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = '#f7f5ff'
  rr(ctx, -200, -158, 400, 250, 26)
  ctx.fill()
  const keyW = 26
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 12; c++) {
      let w = keyW
      if (r === 4 && c === 4) w = keyW * 5 + 4 * 6
      if (r === 4 && c > 4 && c < 9) continue
      const x = -178 + c * 30
      const y = -138 + r * 44
      const acc = (r === 0 && c === 0) || (r === 2 && c === 11) || (r === 4 && c === 4)
      ctx.fillStyle = acc ? p.c0 : r === 4 || c === 11 ? '#cfc7f7' : '#ffffff'
      rr(ctx, x, y, w, 36, 7)
      ctx.fill()
      ctx.fillStyle = 'rgba(60,40,140,0.12)'
      rr(ctx, x, y + 30, w, 6, 3)
      ctx.fill()
    }
  ctx.restore()
}

const kettle: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx + 10, cy + 144, 140, 16, 0.38)
  // spout
  ctx.strokeStyle = lin(ctx, cx - 160, 0, cx - 40, 0, [
    [0, '#f1d8c6'],
    [1, '#ffffff'],
  ])
  ctx.lineCap = 'round'
  ctx.lineWidth = 16
  ctx.beginPath()
  ctx.moveTo(cx - 50, cy + 100)
  ctx.bezierCurveTo(cx - 130, cy + 90, cx - 140, cy - 20, cx - 170, cy - 60)
  ctx.stroke()
  // handle
  ctx.strokeStyle = p.ink
  ctx.lineWidth = 20
  ctx.beginPath()
  ctx.moveTo(cx + 74, cy - 38)
  ctx.bezierCurveTo(cx + 170, cy - 40, cx + 160, cy + 90, cx + 92, cy + 100)
  ctx.stroke()
  soft(ctx, 30, 16, 0.32)
  ctx.fillStyle = lin(ctx, cx - 100, 0, cx + 100, 0, [
    [0, '#f8e7da'],
    [0.4, '#ffffff'],
    [1, '#e5c2aa'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx - 70, cy - 50)
  ctx.lineTo(cx + 74, cy - 50)
  ctx.bezierCurveTo(cx + 100, cy + 40, cx + 108, cy + 110, cx + 100, cy + 140)
  ctx.lineTo(cx - 96, cy + 140)
  ctx.bezierCurveTo(cx - 104, cy + 110, cx - 96, cy + 40, cx - 70, cy - 50)
  ctx.closePath()
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = p.ink
  rr(ctx, cx - 76, cy - 64, 156, 18, 9)
  ctx.fill()
  ctx.fillStyle = p.c0
  rr(ctx, cx - 14, cy - 92, 30, 30, 15)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  rr(ctx, cx - 60, cy - 30, 12, 150, 6)
  ctx.fill()
}

const projector: Product['draw'] = (ctx, cx, cy, p) => {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = lin(ctx, cx + 30, 0, cx + 260, 0, [
    [0, 'rgba(180,210,255,0.5)'],
    [1, 'rgba(180,210,255,0)'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx + 40, cy - 20)
  ctx.lineTo(cx + 290, cy - 150)
  ctx.lineTo(cx + 290, cy + 120)
  ctx.lineTo(cx + 40, cy + 40)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  groundShadow(ctx, cx - 30, cy + 110, 140, 16, 0.42)
  soft(ctx, 30, 18, 0.45)
  ctx.fillStyle = lin(ctx, 0, cy - 100, 0, cy + 100, [
    [0, '#f1f4f9'],
    [1, '#b8c2d1'],
  ])
  rr(ctx, cx - 150, cy - 90, 210, 190, 46)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = 'rgba(30,40,60,0.12)'
  for (let i = 0; i < 6; i++) {
    rr(ctx, cx - 126, cy - 62 + i * 14, 90, 5, 2.5)
    ctx.fill()
  }
  ctx.fillStyle = '#1a2130'
  ctx.beginPath()
  ctx.arc(cx + 6, cy + 10, 56, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rad(ctx, cx + 14, cy + 4, 0, 40, [
    [0, '#ffffff'],
    [0.3, '#9ec2ff'],
    [1, '#24324d'],
  ])
  ctx.beginPath()
  ctx.arc(cx + 6, cy + 10, 38, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = p.c1
  ctx.beginPath()
  ctx.arc(cx - 110, cy + 62, 7, 0, Math.PI * 2)
  ctx.fill()
}

const diffuser: Product['draw'] = (ctx, cx, cy, p) => {
  // mist
  ctx.lineCap = 'round'
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.55 - i * 0.1})`
    ctx.lineWidth = 16 - i * 3
    ctx.beginPath()
    const x = cx - 12 + i * 8
    ctx.moveTo(x, cy - 70)
    ctx.bezierCurveTo(x - 40, cy - 110, x + 40, cy - 140, x - 6 + i * 6, cy - 190 + i * 6)
    ctx.stroke()
  }
  groundShadow(ctx, cx, cy + 150, 120, 16, 0.34)
  soft(ctx, 30, 16, 0.3)
  ctx.fillStyle = lin(ctx, cx - 110, 0, cx + 110, 0, [
    [0, '#ffffff'],
    [1, '#d7e7cb'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx - 20, cy - 70)
  ctx.bezierCurveTo(cx - 120, cy - 10, cx - 120, cy + 140, cx - 60, cy + 140)
  ctx.lineTo(cx + 60, cy + 140)
  ctx.bezierCurveTo(cx + 120, cy + 140, cx + 120, cy - 10, cx + 20, cy - 70)
  ctx.closePath()
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = p.ink
  ctx.beginPath()
  ctx.moveTo(cx - 103, cy + 92)
  ctx.bezierCurveTo(cx - 103, cy + 130, cx - 92, cy + 140, cx - 60, cy + 140)
  ctx.lineTo(cx + 60, cy + 140)
  ctx.bezierCurveTo(cx + 92, cy + 140, cx + 103, cy + 130, cx + 103, cy + 92)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffe9a8'
  ctx.beginPath()
  ctx.arc(cx, cy + 116, 6, 0, Math.PI * 2)
  ctx.fill()
}

const gamepad: Product['draw'] = (ctx, cx, cy, p) => {
  groundShadow(ctx, cx, cy + 120, 180, 18, 0.38)
  soft(ctx, 30, 18, 0.35)
  ctx.fillStyle = lin(ctx, 0, cy - 80, 0, cy + 110, [
    [0, '#ffffff'],
    [1, '#ffd6cf'],
  ])
  ctx.beginPath()
  ctx.moveTo(cx - 110, cy - 70)
  ctx.lineTo(cx + 110, cy - 70)
  ctx.bezierCurveTo(cx + 190, cy - 70, cx + 210, cy + 60, cx + 186, cy + 100)
  ctx.bezierCurveTo(cx + 166, cy + 132, cx + 120, cy + 120, cx + 90, cy + 60)
  ctx.lineTo(cx - 90, cy + 60)
  ctx.bezierCurveTo(cx - 120, cy + 120, cx - 166, cy + 132, cx - 186, cy + 100)
  ctx.bezierCurveTo(cx - 210, cy + 60, cx - 190, cy - 70, cx - 110, cy - 70)
  ctx.closePath()
  ctx.fill()
  noSoft(ctx)
  // d-pad
  ctx.fillStyle = p.ink
  rr(ctx, cx - 130, cy - 22, 66, 22, 5)
  ctx.fill()
  rr(ctx, cx - 108, cy - 44, 22, 66, 5)
  ctx.fill()
  // buttons
  const b: [number, number, string][] = [
    [cx + 98, cy - 40, p.c0],
    [cx + 128, cy - 12, '#ffb020'],
    [cx + 68, cy - 12, '#3aa7d9'],
    [cx + 98, cy + 16, '#20b486'],
  ]
  for (const [x, y, c] of b) {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(x, y, 13, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#2a2b33'
    ctx.beginPath()
    ctx.arc(cx + s * 40, cy + 30, 26, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#4a4c58'
    ctx.beginPath()
    ctx.arc(cx + s * 40, cy + 26, 17, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ------------------------------------------------------------------ catalogue */

export const PRODUCTS: Product[] = [
  { name: 'Halo 头戴耳机', en: 'Halo Headphones', price: 1299, tag: '新品', c0: '#4c6fff', c1: '#aebcff', ink: '#1d2550', draw: headphones,
    specs: [['驱动单元', '40 mm 动圈'], ['降噪深度', '−42 dB'], ['续航', '50 小时'], ['重量', '238 g'], ['连接', '蓝牙 5.4 · 多点']] },
  { name: 'Orbit 智能手表', en: 'Orbit Watch', price: 1899, tag: '热卖', c0: '#ff6a4d', c1: '#ffc4ad', ink: '#4a1d16', draw: watch,
    specs: [['屏幕', '1.43″ AMOLED'], ['续航', '14 天'], ['防水', '5 ATM'], ['传感器', '心率 · 血氧 · 体温'], ['表壳', '钛合金 42 mm']] },
  { name: 'Cube 便携音箱', en: 'Cube Speaker', price: 699, tag: '户外', c0: '#18a77b', c1: '#a3e6cd', ink: '#0d3b2d', draw: speaker,
    specs: [['功率', '2 × 15 W'], ['防护', 'IP67 防尘防水'], ['续航', '24 小时'], ['重量', '540 g'], ['串联', '最多 8 台']] },
  { name: 'Lumen 台灯', en: 'Lumen Lamp', price: 459, tag: '护眼', c0: '#f5a00f', c1: '#ffe0a0', ink: '#3b2a10', draw: lamp,
    specs: [['色温', '2700 – 6500 K'], ['显色', 'Ra 97'], ['照度', '1200 lx'], ['调光', '无频闪 · 无级'], ['材质', '铝合金臂']] },
  { name: 'Frame 胶片相机', en: 'Frame Camera', price: 2480, tag: '限量', c0: '#2f3a66', c1: '#7d88b8', ink: '#141828', draw: camera,
    specs: [['画幅', '135 全幅'], ['镜头', '35 mm f/2.8'], ['快门', '1/500 s'], ['测光', 'TTL 中央重点'], ['重量', '412 g']] },
  { name: 'Stride 跑鞋', en: 'Stride Runner', price: 899, tag: '轻量', c0: '#ff4f86', c1: '#ffc0d4', ink: '#4a1027', draw: sneaker,
    specs: [['中底', '超临界发泡'], ['落差', '8 mm'], ['重量', '218 g / 只'], ['鞋面', '单层工程网'], ['适用', '日常 · 长距离']] },
  { name: 'Thermo 保温杯', en: 'Thermo Bottle', price: 199, tag: '日常', c0: '#2b9ed6', c1: '#b3e2f6', ink: '#0f3247', draw: bottle,
    specs: [['容量', '500 ml'], ['保温', '12 小时 ≥ 60℃'], ['保冷', '24 小时'], ['内胆', '316 不锈钢'], ['重量', '286 g']] },
  { name: 'Key75 机械键盘', en: 'Key75 Keyboard', price: 999, tag: '客制', c0: '#7c5cf0', c1: '#cfc2ff', ink: '#271a5c', draw: keyboard,
    specs: [['配列', '75% · 82 键'], ['轴体', '线性 · 热插拔'], ['结构', 'Gasket 垫片'], ['连接', '三模 2.4G / 蓝牙'], ['电池', '4000 mAh']] },
  { name: 'Drip 手冲壶', en: 'Drip Kettle', price: 329, tag: '咖啡', c0: '#c2612f', c1: '#f3c4a2', ink: '#3f1d0d', draw: kettle,
    specs: [['容量', '600 ml'], ['控温', '40 – 100℃ ±1'], ['壶嘴', '鹅颈 · 8 mm'], ['加热', '1200 W'], ['保温', '60 分钟']] },
  { name: 'Beam 微型投影', en: 'Beam Projector', price: 2199, tag: '影院', c0: '#33435c', c1: '#8195b3', ink: '#0f1622', draw: projector,
    specs: [['分辨率', '1080P 原生'], ['亮度', '800 ANSI'], ['投射比', '1.2 : 1'], ['音响', '2 × 5 W'], ['尺寸', '11 cm 立方']] },
  { name: 'Mist 香薰机', en: 'Mist Diffuser', price: 269, tag: '助眠', c0: '#5f9c4c', c1: '#d0e7c2', ink: '#203a17', draw: diffuser,
    specs: [['容量', '300 ml'], ['雾化', '超声波 · 静音'], ['运行', '10 小时'], ['灯光', '暖光 3 档'], ['定时', '1 / 3 / 6 h']] },
  { name: 'Pad 游戏手柄', en: 'Pad Controller', price: 549, tag: '电竞', c0: '#ea3d3d', c1: '#ffb7ab', ink: '#4a1111', draw: gamepad,
    specs: [['摇杆', '霍尔 · 无漂移'], ['回报率', '1000 Hz'], ['续航', '30 小时'], ['震动', '双马达 HD'], ['平台', 'PC · 主机 · 手机']] },
]

export const fmtPrice = (n: number) => '¥' + n.toLocaleString('en-US')

/* ------------------------------------------------------------------ card faces */

export function drawFront(ctx: CanvasRenderingContext2D, p: Product, i: number) {
  const W = TEX_W
  const H = TEX_H
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = lin(ctx, 0, 0, W * 0.6, H, [
    [0, p.c1],
    [1, p.c0],
  ])
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = rad(ctx, W * 0.78, H * 0.12, 0, W * 0.9, [
    [0, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ])
  ctx.fillRect(0, 0, W, H)
  // decorative orbit rings behind the product
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 2
  for (const r of [140, 200, 260]) {
    ctx.beginPath()
    ctx.arc(W / 2, 318, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  // header
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `700 22px ${MONO}`
  ctx.letterSpacing = '6px'
  ctx.fillText('NOMA', 40, 62)
  ctx.letterSpacing = '0px'
  ctx.font = `500 18px ${MONO}`
  ctx.textAlign = 'right'
  ctx.fillText(`${String(i + 1).padStart(2, '0')} / ${PRODUCTS.length}`, W - 40, 62)
  ctx.textAlign = 'left'

  p.draw(ctx, W / 2, 318, p)
  noSoft(ctx)

  // info panel
  soft(ctx, 30, 10, 0.18)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'
  rr(ctx, 26, 548, W - 52, 218, 30)
  ctx.fill()
  noSoft(ctx)
  ctx.fillStyle = p.c0
  rr(ctx, 54, 578, ctx.measureText(p.tag).width + 70, 34, 17)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `600 18px ${SANS}`
  ctx.fillText(p.tag, 70, 601)
  ctx.fillStyle = '#16171d'
  ctx.font = `700 40px ${SANS}`
  ctx.fillText(p.name, 54, 664)
  ctx.fillStyle = '#7b7f8e'
  ctx.font = `500 19px ${MONO}`
  ctx.fillText(p.en.toUpperCase(), 56, 698)
  ctx.fillStyle = p.c0
  ctx.font = `700 36px ${SANS}`
  ctx.fillText(fmtPrice(p.price), 54, 744)
  // arrow chip
  ctx.fillStyle = '#16171d'
  ctx.beginPath()
  ctx.arc(W - 74, 724, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W - 84, 724)
  ctx.lineTo(W - 64, 724)
  ctx.moveTo(W - 72, 715)
  ctx.lineTo(W - 63, 724)
  ctx.lineTo(W - 72, 733)
  ctx.stroke()
}

export function drawBack(ctx: CanvasRenderingContext2D, p: Product, i: number) {
  const W = TEX_W
  const H = TEX_H
  ctx.fillStyle = '#fbfbfd'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = lin(ctx, 0, 0, W, 200, [
    [0, p.c0],
    [1, p.c1],
  ])
  ctx.fillRect(0, 0, W, 196)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.font = `600 18px ${MONO}`
  ctx.letterSpacing = '4px'
  ctx.fillText(`SPECS · ${String(i + 1).padStart(2, '0')}`, 40, 64)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = '#fff'
  ctx.font = `700 42px ${SANS}`
  ctx.fillText(p.name, 40, 132)
  ctx.font = `500 22px ${SANS}`
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText(fmtPrice(p.price) + ' 起', 40, 170)

  ctx.fillStyle = '#9a9eab'
  ctx.font = `600 17px ${SANS}`
  ctx.fillText('规格参数', 40, 250)
  p.specs.forEach(([k, v], r) => {
    const y = 306 + r * 74
    ctx.fillStyle = '#8a8e9b'
    ctx.font = `500 22px ${SANS}`
    ctx.fillText(k, 40, y)
    ctx.fillStyle = '#16171d'
    ctx.font = `600 24px ${SANS}`
    ctx.textAlign = 'right'
    ctx.fillText(v, W - 40, y)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(20,24,40,0.08)'
    ctx.fillRect(40, y + 28, W - 80, 2)
  })
  // swatches + hint
  const sw = [p.c0, p.c1, '#16171d', '#e9ebf1']
  sw.forEach((c, k) => {
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.arc(58 + k * 44, 714, 15, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
  })
  ctx.fillStyle = '#a3a7b3'
  ctx.font = `500 18px ${SANS}`
  ctx.textAlign = 'right'
  ctx.fillText('再点一下翻回 ↺', W - 40, 721)
  ctx.textAlign = 'left'
}
