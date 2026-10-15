/* Canvas art for the Flip Book: a fictional brand lookbook (MUYE 暮野 · AW26). Every spread is painted as one
 * 2-page canvas (so photos can bleed across the gutter) and then split into its left / right page. */

export const PAGE_W = 704
export const PAGE_H = 972
export const SPREADS = 11

const SERIF = '"Songti SC", "STSong", "Noto Serif SC", "Source Han Serif SC", "SimSun", Georgia, serif'
const LATIN = 'Georgia, "Times New Roman", "Songti SC", serif'
const SANS = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
const MONO = '"JetBrains Mono", "Cascadia Code", Consolas, monospace'

const PAPER = '#f7f2e9'
const INK = '#2b2520'
const INK2 = '#7d7266'
const RUST = '#b4552e'

export const SPREAD_LABELS = ['扉页', '目录 · 序', '晨雾', 'Look 01', '组图', '风', '原野', '面料 · 单品', '静物', 'Look 07–08', '版权页']

/* ------------------------------------------------------------------ utilities */

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

type Ctx = CanvasRenderingContext2D

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}
function rad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

let grainCanvas: HTMLCanvasElement | null = null
function grain() {
  if (grainCanvas) return grainCanvas
  const c = document.createElement('canvas')
  c.width = c.height = 160
  const g = c.getContext('2d')!
  const img = g.createImageData(160, 160)
  const r = rng(7)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + r() * 40
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  grainCanvas = c
  return c
}
function addGrain(ctx: Ctx, x: number, y: number, w: number, h: number, a = 0.12) {
  ctx.save()
  ctx.globalAlpha = a
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = ctx.createPattern(grain(), 'repeat')!
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

function clipRect(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
}

function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string | CanvasGradient, align: CanvasTextAlign = 'left', spacing = 0) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.letterSpacing = `${spacing}px`
  ctx.fillText(s, x, y)
  ctx.letterSpacing = '0px'
  ctx.textAlign = 'left'
}

/** wrap CJK/latin text by character into lines of max width */
function para(ctx: Ctx, s: string, x: number, y: number, w: number, lh: number, font: string, color: string) {
  ctx.font = font
  ctx.fillStyle = color
  let line = ''
  let yy = y
  for (const ch of s) {
    const t = line + ch
    if (ctx.measureText(t).width > w && line) {
      ctx.fillText(line, x, yy)
      line = ch
      yy += lh
    } else line = t
  }
  if (line) ctx.fillText(line, x, yy)
  return yy
}

/* ------------------------------------------------------------------ "photos" */

type Land = { sky: [string, string]; sun: string; sunY: number; hills: string[]; mist: number; seed: number }
function landscape(ctx: Ctx, x: number, y: number, w: number, h: number, o: Land) {
  clipRect(ctx, x, y, w, h)
  ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [
    [0, o.sky[0]],
    [1, o.sky[1]],
  ])
  ctx.fillRect(x, y, w, h)
  const sx = x + w * 0.68
  const sy = y + h * o.sunY
  ctx.fillStyle = rad(ctx, sx, sy, 0, h * 0.5, [
    [0, 'rgba(255,240,210,0.65)'],
    [1, 'rgba(255,240,210,0)'],
  ])
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = o.sun
  ctx.beginPath()
  ctx.arc(sx, sy, h * 0.065, 0, Math.PI * 2)
  ctx.fill()
  const r = rng(o.seed)
  o.hills.forEach((c, i) => {
    const base = y + h * (0.5 + i * 0.13)
    const amp = h * (0.07 - i * 0.012)
    const f1 = 1.5 + r() * 2
    const f2 = 4 + r() * 4
    const ph = r() * 6
    ctx.fillStyle = c
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    for (let k = 0; k <= 64; k++) {
      const u = k / 64
      const yy = base - Math.sin(u * f1 * Math.PI + ph) * amp - Math.sin(u * f2 * Math.PI + ph * 2) * amp * 0.3
      ctx.lineTo(x + u * w, yy)
    }
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    ctx.fill()
    if (o.mist > 0) {
      ctx.fillStyle = lin(ctx, 0, base - amp, 0, base + h * 0.12, [
        [0, `rgba(255,248,238,0)`],
        [1, `rgba(255,248,238,${o.mist * (1 - i * 0.2)})`],
      ])
      ctx.fillRect(x, base - amp, w, h * 0.14)
    }
  })
  addGrain(ctx, x, y, w, h, 0.14)
  ctx.restore()
}

type Fig = { bare?: boolean; bg: [string, string]; coat: string; inner: string; pants: string; hair: string; skin: string; scarf?: string; long?: boolean; hat?: boolean }
function figure(ctx: Ctx, x: number, y: number, w: number, h: number, o: Fig, scale = 1, cxu = 0.5) {
  clipRect(ctx, x, y, w, h)
  if (!o.bare) {
    // studio sweep
    ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [
      [0, o.bg[0]],
      [0.78, o.bg[1]],
      [1, o.bg[1]],
    ])
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = rad(ctx, x + w * 0.35, y + h * 0.3, 0, h * 0.8, [
      [0, 'rgba(255,255,255,0.28)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    ctx.fillRect(x, y, w, h)
  }
  const H = h * 0.86 * scale
  const cx = x + w * cxu
  const top = y + h * 0.93 - H
  const P = (u: number) => top + u * H
  // floor shadow
  ctx.fillStyle = rad(ctx, cx + H * 0.05, P(1), 0, H * 0.22, [
    [0, 'rgba(40,25,15,0.35)'],
    [1, 'rgba(40,25,15,0)'],
  ])
  ctx.save()
  ctx.translate(cx + H * 0.05, P(1))
  ctx.scale(1, 0.16)
  ctx.beginPath()
  ctx.arc(0, 0, H * 0.22, 0, Math.PI * 2)
  ctx.restore()
  ctx.fill()
  // legs + shoes
  ctx.fillStyle = o.pants
  ctx.beginPath()
  ctx.roundRect(cx - H * 0.05, P(0.6), H * 0.045, H * 0.37, H * 0.01)
  ctx.roundRect(cx + H * 0.008, P(0.6), H * 0.045, H * 0.37, H * 0.01)
  ctx.fill()
  ctx.fillStyle = '#231b16'
  ctx.beginPath()
  ctx.ellipse(cx - H * 0.032, P(0.975), H * 0.04, H * 0.014, 0, 0, Math.PI * 2)
  ctx.ellipse(cx + H * 0.04, P(0.975), H * 0.04, H * 0.014, 0, 0, Math.PI * 2)
  ctx.fill()
  // neck + head
  ctx.fillStyle = o.skin
  ctx.fillRect(cx - H * 0.014, P(0.11), H * 0.028, H * 0.06)
  ctx.beginPath()
  ctx.ellipse(cx, P(0.075), H * 0.038, H * 0.048, 0, 0, Math.PI * 2)
  ctx.fill()
  // hair
  ctx.fillStyle = o.hair
  ctx.beginPath()
  ctx.ellipse(cx - H * 0.004, P(0.06), H * 0.042, H * 0.04, -0.1, Math.PI * 0.95, Math.PI * 2.08)
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(cx - H * 0.046, P(0.05), H * 0.024, H * 0.085, H * 0.012)
  ctx.fill()
  if (o.hat) {
    ctx.fillStyle = '#2d241e'
    ctx.beginPath()
    ctx.ellipse(cx, P(0.04), H * 0.09, H * 0.014, -0.05, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(cx - H * 0.045, P(0.0), H * 0.09, H * 0.042, [H * 0.03, H * 0.03, 2, 2])
    ctx.fill()
  }
  // coat
  const hem = o.long ? 0.74 : 0.62
  const coatG = lin(ctx, cx - H * 0.14, 0, cx + H * 0.14, 0, [
    [0, o.coat],
    [0.6, o.coat],
    [1, shade(o.coat, -0.18)],
  ])
  ctx.fillStyle = coatG
  ctx.beginPath()
  ctx.moveTo(cx - H * 0.075, P(0.155))
  ctx.quadraticCurveTo(cx - H * 0.11, P(0.16), cx - H * 0.11, P(0.21))
  ctx.lineTo(cx - H * 0.13, P(hem))
  ctx.quadraticCurveTo(cx, P(hem + 0.02), cx + H * 0.13, P(hem))
  ctx.lineTo(cx + H * 0.11, P(0.21))
  ctx.quadraticCurveTo(cx + H * 0.11, P(0.16), cx + H * 0.075, P(0.155))
  ctx.closePath()
  ctx.fill()
  // inner + lapels
  ctx.fillStyle = o.inner
  ctx.beginPath()
  ctx.moveTo(cx - H * 0.035, P(0.155))
  ctx.lineTo(cx + H * 0.035, P(0.155))
  ctx.lineTo(cx + H * 0.006, P(0.4))
  ctx.lineTo(cx - H * 0.006, P(0.4))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = shade(o.coat, -0.25)
  ctx.lineWidth = Math.max(1, H * 0.004)
  ctx.beginPath()
  ctx.moveTo(cx - H * 0.035, P(0.155))
  ctx.lineTo(cx - H * 0.006, P(0.4))
  ctx.lineTo(cx - H * 0.01, P(hem))
  ctx.moveTo(cx + H * 0.035, P(0.155))
  ctx.lineTo(cx + H * 0.006, P(0.4))
  ctx.stroke()
  if (o.scarf) {
    ctx.fillStyle = o.scarf
    ctx.beginPath()
    ctx.roundRect(cx - H * 0.045, P(0.145), H * 0.09, H * 0.035, H * 0.015)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(cx + H * 0.012, P(0.16), H * 0.03, H * 0.2, H * 0.01)
    ctx.fill()
  }
  // arms
  ctx.fillStyle = shade(o.coat, -0.08)
  ctx.beginPath()
  ctx.roundRect(cx - H * 0.135, P(0.18), H * 0.04, H * 0.33, H * 0.02)
  ctx.roundRect(cx + H * 0.098, P(0.18), H * 0.04, H * 0.31, H * 0.02)
  ctx.fill()
  ctx.fillStyle = o.skin
  ctx.beginPath()
  ctx.arc(cx - H * 0.115, P(0.52), H * 0.017, 0, Math.PI * 2)
  ctx.arc(cx + H * 0.118, P(0.5), H * 0.017, 0, Math.PI * 2)
  ctx.fill()
  if (!o.bare) addGrain(ctx, x, y, w, h, 0.13)
  ctx.restore()
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(Math.min(255, Math.max(0, k < 0 ? c * (1 + k) : c + (255 - c) * k)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `rgb(${r},${g},${b})`
}

function stillLife(ctx: Ctx, x: number, y: number, w: number, h: number, warm = true) {
  clipRect(ctx, x, y, w, h)
  ctx.fillStyle = lin(ctx, 0, y, 0, y + h * 0.62, [
    [0, warm ? '#d9b998' : '#c9c3b5'],
    [1, warm ? '#c79c76' : '#b4ac9a'],
  ])
  ctx.fillRect(x, y, w, h)
  // window light patch
  ctx.save()
  ctx.globalCompositeOperation = 'soft-light'
  ctx.fillStyle = 'rgba(255,240,215,0.9)'
  ctx.beginPath()
  ctx.moveTo(x + w * 0.1, y)
  ctx.lineTo(x + w * 0.45, y)
  ctx.lineTo(x + w * 0.7, y + h * 0.62)
  ctx.lineTo(x + w * 0.3, y + h * 0.62)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  // table
  const ty = y + h * 0.62
  ctx.fillStyle = lin(ctx, 0, ty, 0, y + h, [
    [0, warm ? '#8e5d3d' : '#6f6455'],
    [1, warm ? '#6b4128' : '#4e463c'],
  ])
  ctx.fillRect(x, ty, w, h - h * 0.62)
  ctx.fillStyle = 'rgba(255,230,200,0.25)'
  ctx.fillRect(x, ty, w, h * 0.008)
  const items: [number, number, number, string, 'vase' | 'ball' | 'cup'][] = [
    [0.3, 0.3, 0.2, warm ? '#efe4d2' : '#e8e2d6', 'vase'],
    [0.52, 0.16, 0.12, warm ? '#c4552d' : '#8a9a7b', 'ball'],
    [0.7, 0.2, 0.13, warm ? '#3f3a35' : '#d9c6a5', 'cup'],
  ]
  for (const [u, hh, ww, c, kind] of items) {
    const cx = x + w * u
    const H = h * hh * (kind === 'vase' ? 2 : 1)
    const W = w * ww
    // shadow
    ctx.fillStyle = 'rgba(30,15,5,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx + W * 0.5, ty + h * 0.06, W * 0.75, h * 0.018, 0, 0, Math.PI * 2)
    ctx.fill()
    const g = lin(ctx, cx - W / 2, 0, cx + W / 2, 0, [
      [0, shade(c, 0.25)],
      [0.45, c],
      [1, shade(c, -0.35)],
    ])
    ctx.fillStyle = g
    ctx.beginPath()
    const base = ty + h * 0.06
    if (kind === 'vase') {
      ctx.moveTo(cx - W * 0.16, base - H)
      ctx.lineTo(cx + W * 0.16, base - H)
      ctx.bezierCurveTo(cx + W * 0.1, base - H * 0.7, cx + W * 0.62, base - H * 0.55, cx + W * 0.42, base)
      ctx.lineTo(cx - W * 0.42, base)
      ctx.bezierCurveTo(cx - W * 0.62, base - H * 0.55, cx - W * 0.1, base - H * 0.7, cx - W * 0.16, base - H)
      // branch
      ctx.fill()
      ctx.strokeStyle = '#4a3a2a'
      ctx.lineWidth = Math.max(1.5, w * 0.004)
      ctx.beginPath()
      ctx.moveTo(cx, base - H)
      ctx.quadraticCurveTo(cx - W * 0.2, base - H * 1.4, cx - W * 0.6, base - H * 1.7)
      ctx.moveTo(cx, base - H * 1.1)
      ctx.quadraticCurveTo(cx + W * 0.4, base - H * 1.35, cx + W * 0.5, base - H * 1.6)
      ctx.stroke()
      ctx.fillStyle = warm ? '#c98a4e' : '#9aa77f'
      for (let k = 0; k < 9; k++) {
        const t = k / 8
        ctx.beginPath()
        ctx.ellipse(cx - W * 0.6 * t + Math.sin(k) * W * 0.05, base - H * (1.1 + 0.6 * t), W * 0.06, W * 0.025, k, 0, Math.PI * 2)
        ctx.fill()
      }
      continue
    } else if (kind === 'ball') {
      ctx.arc(cx, base - W / 2, W / 2, 0, Math.PI * 2)
    } else {
      ctx.roundRect(cx - W / 2, base - H, W, H, [W * 0.08, W * 0.08, W * 0.2, W * 0.2])
    }
    ctx.fill()
  }
  addGrain(ctx, x, y, w, h, 0.14)
  ctx.restore()
}

function fabric(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, kind: number) {
  clipRect(ctx, x, y, w, h)
  ctx.fillStyle = base
  ctx.fillRect(x, y, w, h)
  const dark = shade(base, -0.22)
  const light = shade(base, 0.18)
  if (kind === 0) {
    // herringbone
    ctx.strokeStyle = dark
    ctx.lineWidth = 3
    for (let col = 0; col < w / 24 + 1; col++)
      for (let row = -2; row < h / 10 + 2; row++) {
        const xx = x + col * 24
        const yy = y + row * 10
        ctx.beginPath()
        if (col % 2) {
          ctx.moveTo(xx, yy)
          ctx.lineTo(xx + 24, yy + 12)
        } else {
          ctx.moveTo(xx, yy + 12)
          ctx.lineTo(xx + 24, yy)
        }
        ctx.stroke()
      }
  } else if (kind === 1) {
    // rib knit
    for (let i = 0; i < w / 14 + 1; i++) {
      ctx.fillStyle = i % 2 ? dark : light
      ctx.fillRect(x + i * 14, y, 7, h)
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    for (let j = 0; j < h / 10; j++) ctx.fillRect(x, y + j * 10, w, 2)
  } else if (kind === 2) {
    // houndstooth-ish check
    const s = 26
    for (let i = 0; i < w / s + 1; i++)
      for (let j = 0; j < h / s + 1; j++) {
        if ((i + j) % 2) continue
        ctx.fillStyle = dark
        ctx.beginPath()
        const xx = x + i * s
        const yy = y + j * s
        ctx.moveTo(xx, yy)
        ctx.lineTo(xx + s, yy)
        ctx.lineTo(xx + s * 1.3, yy + s * 0.5)
        ctx.lineTo(xx + s, yy + s)
        ctx.lineTo(xx, yy + s)
        ctx.closePath()
        ctx.fill()
      }
  } else {
    // brushed wool
    const r = rng(kind * 31 + 5)
    for (let i = 0; i < 900; i++) {
      ctx.strokeStyle = r() > 0.5 ? dark : light
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1.2
      const xx = x + r() * w
      const yy = y + r() * h
      ctx.beginPath()
      ctx.moveTo(xx, yy)
      ctx.lineTo(xx + 10 + r() * 16, yy + (r() - 0.5) * 5)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = lin(ctx, x, y, x + w, y + h, [
    [0, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(0,0,0,0.18)'],
  ])
  ctx.fillRect(x, y, w, h)
  addGrain(ctx, x, y, w, h, 0.12)
  ctx.restore()
}

/* ------------------------------------------------------------------ page furniture */

function folio(ctx: Ctx, n: number, side: 'l' | 'r', light = false) {
  const x = side === 'l' ? 64 : PAGE_W * 2 - 64
  text(ctx, String(n).padStart(2, '0'), x, PAGE_H - 46, `500 17px ${MONO}`, light ? 'rgba(255,255,255,0.85)' : INK2, side === 'l' ? 'left' : 'right')
  text(ctx, 'MUYE · AW26', side === 'l' ? x + 46 : x - 46, PAGE_H - 46, `500 13px ${MONO}`, light ? 'rgba(255,255,255,0.6)' : '#b0a596', side === 'l' ? 'left' : 'right', 3)
}

function paper(ctx: Ctx, x: number, w: number, color = PAPER) {
  ctx.fillStyle = color
  ctx.fillRect(x, 0, w, PAGE_H)
}

function gutter(ctx: Ctx) {
  // binding shade either side of the fold
  ctx.fillStyle = lin(ctx, PAGE_W - 90, 0, PAGE_W + 90, 0, [
    [0, 'rgba(60,40,20,0)'],
    [0.42, 'rgba(60,40,20,0.12)'],
    [0.5, 'rgba(60,40,20,0.26)'],
    [0.58, 'rgba(60,40,20,0.12)'],
    [1, 'rgba(60,40,20,0)'],
  ])
  ctx.fillRect(PAGE_W - 90, 0, 180, PAGE_H)
}

function endpaper(ctx: Ctx, x: number, w: number) {
  ctx.fillStyle = '#c7a27c'
  ctx.fillRect(x, 0, w, PAGE_H)
  clipRect(ctx, x, 0, w, PAGE_H)
  ctx.strokeStyle = 'rgba(122,79,51,0.55)'
  ctx.lineWidth = 3
  const s = 64
  for (let j = 0; j < PAGE_H / s + 1; j++)
    for (let i = 0; i < w / s + 1; i++) {
      const cx = x + i * s + (j % 2 ? s / 2 : 0)
      const cy = j * s
      ctx.beginPath()
      ctx.arc(cx, cy + s * 0.5, s * 0.32, Math.PI, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, cy + s * 0.18)
      ctx.lineTo(cx, cy + s * 0.5)
      ctx.stroke()
    }
  addGrain(ctx, x, 0, w, PAGE_H, 0.18)
  ctx.restore()
}

/* ------------------------------------------------------------------ spreads */

const W2 = PAGE_W * 2
const L0 = 0
const R0 = PAGE_W

const spreadPainters: ((ctx: Ctx) => void)[] = [
  // 0 · endpaper | title page
  (ctx) => {
    endpaper(ctx, L0, PAGE_W)
    paper(ctx, R0, PAGE_W)
    const cx = R0 + PAGE_W / 2
    ctx.strokeStyle = RUST
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, 300, 34, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 22, 312)
    ctx.quadraticCurveTo(cx, 260, cx + 22, 312)
    ctx.stroke()
    text(ctx, 'MUYE', cx, 446, `400 96px ${LATIN}`, INK, 'center', 22)
    text(ctx, '暮  野', cx, 512, `500 34px ${SERIF}`, INK, 'center', 6)
    ctx.fillStyle = RUST
    ctx.fillRect(cx - 30, 560, 60, 2)
    text(ctx, 'AUTUMN / WINTER 2026', cx, 616, `500 18px ${MONO}`, INK2, 'center', 5)
    text(ctx, 'L O O K B O O K', cx, 650, `500 18px ${MONO}`, INK2, 'center', 2)
    text(ctx, 'Vol. 07 — 关于风、羊毛与慢下来的季节', cx, PAGE_H - 120, `italic 400 20px ${LATIN}`, '#9b8f80', 'center')
  },
  // 1 · contents | letter
  (ctx) => {
    paper(ctx, 0, W2)
    text(ctx, 'CONTENTS', 80, 150, `500 16px ${MONO}`, RUST, 'left', 5)
    text(ctx, '目录', 80, 222, `600 54px ${SERIF}`, INK)
    const rows: [string, string, string, number][] = [
      ['01', '晨雾', 'Morning Mist', 4],
      ['02', 'Look 01 · 驼色大衣', 'Camel Coat', 6],
      ['03', '组图 · 山间', 'In the Hills', 8],
      ['04', '风', 'The Wind', 10],
      ['05', '原野', 'Open Field', 12],
      ['06', '面料与单品', 'Fabrics & Pieces', 14],
      ['07', '静物', 'Still Life', 16],
      ['08', 'Look 07 – 08', 'Two Looks', 18],
    ]
    rows.forEach(([n, zh, en, p], i) => {
      const y = 330 + i * 70
      text(ctx, n, 80, y, `500 16px ${MONO}`, '#b0a596')
      text(ctx, zh, 130, y, `500 26px ${SERIF}`, INK)
      text(ctx, en, 130, y + 26, `italic 400 16px ${LATIN}`, INK2)
      ctx.fillStyle = 'rgba(43,37,32,0.18)'
      for (let k = 0; k < 14; k++) ctx.fillRect(420 + k * 12, y - 6, 3, 2)
      text(ctx, String(p).padStart(2, '0'), PAGE_W - 80, y, `500 18px ${MONO}`, INK, 'right')
    })
    folio(ctx, 2, 'l')
    // letter
    landscape(ctx, R0 + 80, 110, PAGE_W - 160, 300, { sky: ['#e9d9c3', '#f3e8d8'], sun: '#fff4e2', sunY: 0.42, hills: ['#c9b49a', '#a98f72', '#7c6650'], mist: 0.5, seed: 3 })
    text(ctx, '写在前面', R0 + 80, 500, `600 40px ${SERIF}`, INK)
    text(ctx, 'A LETTER', R0 + 80, 536, `500 14px ${MONO}`, RUST, 'left', 4)
    const body =
      '这一季我们回到山里。清晨的雾很低，羊群在坡上慢慢走，风从山那边吹过来。我们想做一些让人愿意慢下来的衣服：厚一点的羊毛，宽一点的肩线，颜色借给土地和枯草。'
    const y2 = para(ctx, body, R0 + 80, 600, PAGE_W - 160, 40, `400 22px ${SERIF}`, '#4a4038')
    para(ctx, '愿你也在这个冬天，找到一件可以穿很多年的衣服。', R0 + 80, y2 + 60, PAGE_W - 160, 40, `400 22px ${SERIF}`, '#4a4038')
    text(ctx, '— 暮野设计室', PAGE_W * 2 - 80, PAGE_H - 120, `italic 400 22px ${LATIN}`, INK2, 'right')
    folio(ctx, 3, 'r')
  },
  // 2 · full-bleed landscape "01 晨雾"
  (ctx) => {
    landscape(ctx, 0, 0, W2, PAGE_H, { sky: ['#cfd5d6', '#efe2cf'], sun: '#fff7ea', sunY: 0.36, hills: ['#a9b2ad', '#8c968e', '#6f7a70', '#4f5850'], mist: 0.65, seed: 11 })
    text(ctx, '01', 80, PAGE_H - 210, `400 120px ${LATIN}`, 'rgba(255,255,255,0.92)')
    text(ctx, '晨雾', 80, PAGE_H - 130, `600 46px ${SERIF}`, '#fff')
    text(ctx, 'MORNING MIST', 82, PAGE_H - 92, `500 16px ${MONO}`, 'rgba(255,255,255,0.8)', 'left', 6)
    folio(ctx, 4, 'l', true)
    folio(ctx, 5, 'r', true)
  },
  // 3 · figure | Look 01 detail
  (ctx) => {
    figure(ctx, 0, 0, PAGE_W, PAGE_H, { bg: ['#e8dccb', '#d6c4ab'], coat: '#b98a5c', inner: '#efe6d8', pants: '#3b302a', hair: '#2a1f18', skin: '#e2b896', long: true }, 1, 0.52)
    folio(ctx, 6, 'l', true)
    paper(ctx, R0, PAGE_W)
    text(ctx, 'LOOK 01', R0 + 80, 150, `500 16px ${MONO}`, RUST, 'left', 5)
    text(ctx, '驼色双面', R0 + 80, 230, `600 52px ${SERIF}`, INK)
    text(ctx, '羊绒大衣', R0 + 80, 298, `600 52px ${SERIF}`, INK)
    para(ctx, '双面手工缝制，没有里布，也没有多余的线。肩线放宽两厘米，抬手时不会被拉住。', R0 + 80, 370, PAGE_W - 220, 38, `400 22px ${SERIF}`, '#4a4038')
    const specs: [string, string][] = [
      ['面料', '100% 羊绒'],
      ['颜色', '驼 / 燕麦 / 炭灰'],
      ['尺码', 'XS — L'],
    ]
    specs.forEach(([k, v], i) => {
      const y = 540 + i * 50
      text(ctx, k, R0 + 80, y, `400 18px ${SANS}`, INK2)
      text(ctx, v, PAGE_W * 2 - 80, y, `500 20px ${SANS}`, INK, 'right')
      ctx.fillStyle = 'rgba(43,37,32,0.1)'
      ctx.fillRect(R0 + 80, y + 18, PAGE_W - 160, 1.5)
    })
    text(ctx, '¥ 4,980', R0 + 80, 740, `400 46px ${LATIN}`, INK)
    const sw = ['#b98a5c', '#e3d6c2', '#4b4743']
    sw.forEach((c, i) => {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(R0 + 100 + i * 52, 800, 18, 0, Math.PI * 2)
      ctx.fill()
    })
    fabric(ctx, PAGE_W * 2 - 80 - 210, 700, 210, 150, '#b98a5c', 3)
    folio(ctx, 7, 'r')
  },
  // 4 · photo grid
  (ctx) => {
    paper(ctx, 0, W2)
    figure(ctx, 80, 100, PAGE_W - 160, 640, { bg: ['#d7d9cf', '#bfc3b4'], coat: '#7c8a6c', inner: '#e8e4d8', pants: '#2f2b27', hair: '#3b2a1f', skin: '#e0b591', scarf: '#c4552d' }, 0.9)
    text(ctx, '03 · 山间', 80, 800, `600 30px ${SERIF}`, INK)
    para(ctx, '鼠尾草绿短大衣，配铁锈色围巾。雾散之前的二十分钟，是这一季最好的光。', 80, 846, PAGE_W - 160, 34, `400 19px ${SERIF}`, INK2)
    folio(ctx, 8, 'l')
    stillLife(ctx, R0 + 80, 100, PAGE_W - 160, 400, false)
    landscape(ctx, R0 + 80, 520, PAGE_W - 160, 260, { sky: ['#d9c9b0', '#eadcc6'], sun: '#fff1db', sunY: 0.5, hills: ['#b59c7c', '#8d7559', '#5f4d3b'], mist: 0.3, seed: 21 })
    text(ctx, '左：燕麦色陶罐，客厅一角。右：下午四点的坡地。', R0 + 80, 830, `400 18px ${SERIF}`, INK2)
    folio(ctx, 9, 'r')
  },
  // 5 · quote | figure
  (ctx) => {
    paper(ctx, 0, PAGE_W, '#efe5d6')
    text(ctx, '“', 80, 300, `400 200px ${LATIN}`, RUST)
    const q = '风从山那边吹过来，衣服要先懂得风。'
    para(ctx, q, 80, 360, PAGE_W - 170, 72, `600 50px ${SERIF}`, INK)
    ctx.fillStyle = RUST
    ctx.fillRect(80, 640, 48, 2)
    text(ctx, '主理人 · 林暮', 80, 690, `500 22px ${SERIF}`, INK2)
    text(ctx, 'ON THE WIND, 2026', 80, 724, `500 14px ${MONO}`, '#b0a596', 'left', 4)
    folio(ctx, 10, 'l')
    figure(ctx, R0, 0, PAGE_W, PAGE_H, { bg: ['#c9d0cf', '#aab3b0'], coat: '#3e4a52', inner: '#d9d2c4', pants: '#26221f', hair: '#1f1712', skin: '#dcb08b', long: true, hat: true }, 1, 0.48)
    folio(ctx, 11, 'r', true)
  },
  // 6 · full-bleed "02 原野"
  (ctx) => {
    landscape(ctx, 0, 0, W2, PAGE_H, { sky: ['#f0c99a', '#f7e5c8'], sun: '#fff3dc', sunY: 0.55, hills: ['#d9a868', '#c48a4c', '#a26a35', '#7d4f26'], mist: 0.3, seed: 41 })
    // tiny figure in the field
    figure(ctx, W2 * 0.62, PAGE_H * 0.5, 120, 260, { bare: true, bg: ['#000', '#000'], coat: '#3e2c22', inner: '#d9d2c4', pants: '#26221f', hair: '#1f1712', skin: '#c99a76', long: true }, 0.9)
    text(ctx, '02', 80, 200, `400 120px ${LATIN}`, 'rgba(255,255,255,0.92)')
    text(ctx, '原野', 80, 280, `600 46px ${SERIF}`, '#fff')
    text(ctx, 'OPEN FIELD', 82, 318, `500 16px ${MONO}`, 'rgba(255,255,255,0.85)', 'left', 6)
    folio(ctx, 12, 'l', true)
    folio(ctx, 13, 'r', true)
  },
  // 7 · fabrics | pieces list
  (ctx) => {
    paper(ctx, 0, W2)
    text(ctx, 'FABRICS', 80, 150, `500 16px ${MONO}`, RUST, 'left', 5)
    text(ctx, '本季面料', 80, 216, `600 48px ${SERIF}`, INK)
    const fabs: [string, string, number][] = [
      ['#b98a5c', '驼色人字纹', 0],
      ['#7c8a6c', '鼠尾草罗纹', 1],
      ['#4b4743', '炭灰千鸟格', 2],
      ['#c4552d', '铁锈粗纺', 3],
      ['#e3d6c2', '燕麦人字纹', 0],
      ['#3e4a52', '雾蓝罗纹', 1],
    ]
    fabs.forEach(([c, name, k], i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = 80 + col * 280
      const y = 270 + row * 210
      fabric(ctx, x, y, 250, 150, c, k)
      text(ctx, name, x, y + 180, `500 19px ${SERIF}`, INK)
    })
    folio(ctx, 14, 'l')
    text(ctx, 'PIECES', R0 + 80, 150, `500 16px ${MONO}`, RUST, 'left', 5)
    text(ctx, '本季单品', R0 + 80, 216, `600 48px ${SERIF}`, INK)
    const items: [string, string][] = [
      ['驼色双面羊绒大衣', '4,980'],
      ['鼠尾草短大衣', '3,280'],
      ['铁锈色粗纺围巾', '680'],
      ['雾蓝风衣', '2,860'],
      ['燕麦罗纹高领', '1,180'],
      ['炭灰阔腿羊毛裤', '1,460'],
      ['铁锈色粗针开衫', '1,880'],
    ]
    items.forEach(([n, p], i) => {
      const y = 320 + i * 76
      text(ctx, String(i + 1).padStart(2, '0'), R0 + 80, y, `500 15px ${MONO}`, '#b0a596')
      text(ctx, n, R0 + 124, y, `500 24px ${SERIF}`, INK)
      text(ctx, '¥ ' + p, PAGE_W * 2 - 80, y, `400 24px ${LATIN}`, INK, 'right')
      ctx.fillStyle = 'rgba(43,37,32,0.1)'
      ctx.fillRect(R0 + 80, y + 26, PAGE_W - 160, 1.5)
    })
    text(ctx, '全系列门店与线上同步发售', R0 + 80, PAGE_H - 120, `400 18px ${SERIF}`, INK2)
    folio(ctx, 15, 'r')
  },
  // 8 · full-bleed still life
  (ctx) => {
    stillLife(ctx, 0, 0, W2, PAGE_H, true)
    text(ctx, '03', W2 - 80, 200, `400 120px ${LATIN}`, 'rgba(255,255,255,0.92)', 'right')
    text(ctx, '静物', W2 - 80, 280, `600 46px ${SERIF}`, '#fff', 'right')
    text(ctx, 'STILL LIFE', W2 - 82, 318, `500 16px ${MONO}`, 'rgba(255,255,255,0.85)', 'right', 6)
    folio(ctx, 16, 'l', true)
    folio(ctx, 17, 'r', true)
  },
  // 9 · two looks
  (ctx) => {
    figure(ctx, 0, 0, PAGE_W, PAGE_H, { bg: ['#ead7c3', '#d9bfa3'], coat: '#b4552e', inner: '#efe6d8', pants: '#3a2c24', hair: '#2a1f18', skin: '#e2b896' }, 1, 0.5)
    figure(ctx, R0, 0, PAGE_W, PAGE_H, { bg: ['#dedbd4', '#c6c1b7'], coat: '#4b4743', inner: '#d6cdbd', pants: '#1f1c1a', hair: '#15100c', skin: '#d8a986', long: true, scarf: '#e3d6c2' }, 1, 0.5)
    text(ctx, 'LOOK 07 · 铁锈色粗针开衫', 80, 120, `500 18px ${SERIF}`, 'rgba(43,37,32,0.85)')
    text(ctx, 'LOOK 08 · 炭灰大衣', W2 - 80, 120, `500 18px ${SERIF}`, 'rgba(43,37,32,0.85)', 'right')
    folio(ctx, 18, 'l', true)
    folio(ctx, 19, 'r', true)
  },
  // 10 · colophon | back endpaper
  (ctx) => {
    paper(ctx, 0, PAGE_W)
    const cx = PAGE_W / 2
    text(ctx, '谢谢翻阅', cx, 360, `600 52px ${SERIF}`, INK, 'center')
    text(ctx, 'THANK YOU FOR READING', cx, 404, `500 15px ${MONO}`, RUST, 'center', 5)
    const credits: [string, string][] = [
      ['摄影', '苏远 · 山野工作室'],
      ['造型', '何晴'],
      ['设计', '暮野设计室'],
      ['拍摄地', '浙西 · 天目山'],
    ]
    credits.forEach(([k, v], i) => {
      const y = 520 + i * 48
      text(ctx, k, cx - 20, y, `400 18px ${SANS}`, INK2, 'right')
      text(ctx, v, cx + 20, y, `500 19px ${SERIF}`, INK)
    })
    text(ctx, 'MUYE', cx, PAGE_H - 150, `400 40px ${LATIN}`, INK, 'center', 10)
    text(ctx, '© 2026 暮野 · 本画册内容均为虚构示例', cx, PAGE_H - 100, `400 14px ${SANS}`, '#b0a596', 'center')
    folio(ctx, 20, 'l')
    endpaper(ctx, R0, PAGE_W)
  },
]

const spreadCache: (HTMLCanvasElement | null)[] = Array(SPREADS).fill(null)

/** paints spread s (cached) and returns [full, left, right] canvases */
export function paintSpread(s: number) {
  let full = spreadCache[s]
  if (!full) {
    full = document.createElement('canvas')
    full.width = W2
    full.height = PAGE_H
    const ctx = full.getContext('2d')!
    spreadPainters[s](ctx)
    if (s !== 2 && s !== 6 && s !== 8) gutter(ctx)
    else {
      // full-bleed photos still get a softer fold shadow
      ctx.globalAlpha = 0.6
      gutter(ctx)
      ctx.globalAlpha = 1
    }
    spreadCache[s] = full
  }
  const half = (x: number) => {
    const c = document.createElement('canvas')
    c.width = PAGE_W
    c.height = PAGE_H
    c.getContext('2d')!.drawImage(full!, x, 0, PAGE_W, PAGE_H, 0, 0, PAGE_W, PAGE_H)
    return c
  }
  return { full, left: half(0), right: half(PAGE_W) }
}

let coverCache: HTMLCanvasElement | null = null
export function paintCover() {
  if (coverCache) return coverCache
  const c = document.createElement('canvas')
  // the board is a little larger than the page; same aspect is close enough
  c.width = PAGE_W
  c.height = PAGE_H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = lin(ctx, 0, 0, PAGE_W, PAGE_H, [
    [0, '#8b5e3c'],
    [1, '#6e472c'],
  ])
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  // cloth weave
  ctx.globalAlpha = 0.09
  for (let i = 0; i < PAGE_W; i += 3) {
    ctx.fillStyle = i % 6 ? '#000' : '#fff'
    ctx.fillRect(i, 0, 1, PAGE_H)
  }
  for (let j = 0; j < PAGE_H; j += 3) {
    ctx.fillStyle = j % 6 ? '#000' : '#fff'
    ctx.fillRect(0, j, PAGE_W, 1)
  }
  ctx.globalAlpha = 1
  addGrain(ctx, 0, 0, PAGE_W, PAGE_H, 0.25)
  // spine hinge groove
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, 0, 34, PAGE_H)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(34, 0, 3, PAGE_H)
  // foil
  const foil = lin(ctx, 200, 300, 520, 640, [
    [0, '#f3d79a'],
    [0.5, '#c79b52'],
    [1, '#f0d08c'],
  ])
  const cx = PAGE_W / 2 + 14
  ctx.strokeStyle = foil
  ctx.lineWidth = 2
  ctx.strokeRect(70, 70, PAGE_W - 120, PAGE_H - 140)
  ctx.beginPath()
  ctx.arc(cx, 330, 40, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 26, 344)
  ctx.quadraticCurveTo(cx, 284, cx + 26, 344)
  ctx.stroke()
  text(ctx, 'MUYE', cx, 480, `400 92px ${LATIN}`, foil, 'center', 20)
  ctx.fillStyle = foil
  ctx.fillRect(cx - 30, 530, 60, 2)
  text(ctx, '暮野 · 秋冬 2026', cx, 590, `500 28px ${SERIF}`, foil, 'center', 4)
  text(ctx, 'L O O K B O O K', cx, PAGE_H - 130, `500 18px ${MONO}`, foil, 'center', 2)
  coverCache = c
  return c
}

/** fine stacked-paper lines for the page-block edges (tiles vertically) */
export function edgeCanvas() {
  const c = document.createElement('canvas')
  c.width = 8
  c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#f3ede2'
  g.fillRect(0, 0, 8, 64)
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 4 === 0 ? 'rgba(120,96,70,0.32)' : 'rgba(120,96,70,0.2)'
    g.fillRect(0, i * 4 + 3, 8, 1)
  }
  return c
}

/** pale linen tablecloth (tiles) */
export function tableCanvas() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#ece2d3'
  g.fillRect(0, 0, 256, 256)
  const r = rng(99)
  // irregular slub threads, both directions
  for (let i = 0; i < 256; i += 2) {
    g.fillStyle = `rgba(120,96,70,${0.012 + r() * 0.018})`
    g.fillRect(0, i, 256, 1)
    g.fillRect(i, 0, 1, 256)
  }
  addGrain(g, 0, 0, 256, 256, 0.18)
  return c
}

/** a board's inner face: the page-sized endpaper glued inside the cloth turn-ins (the board overhangs the block) */
export function boardInside(page: HTMLCanvasElement, mx: number, my: number, spineLeft: boolean) {
  const c = document.createElement('canvas')
  const w = Math.round(PAGE_W / (1 - mx))
  const h = Math.round(PAGE_H / (1 - 2 * my))
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#7a5034'
  g.fillRect(0, 0, w, h)
  addGrain(g, 0, 0, w, h, 0.2)
  const ox = spineLeft ? 0 : w - PAGE_W
  g.drawImage(page, ox, (h - PAGE_H) / 2)
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.fillRect(ox, (h - PAGE_H) / 2, PAGE_W, 2)
  return c
}

/** already-painted spread canvas (for DOM thumbnails), or null */
export const paintedSpread = (s: number) => spreadCache[s]
