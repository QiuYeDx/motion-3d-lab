/* Canvas art for the Card Hand demo: a small fantasy deck (front faces), the card back, the felt table and FX sprites. */

export const TEX_W = 512
export const TEX_H = 716

const SANS = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Inter", system-ui, sans-serif'
const SERIF = 'Georgia, "Times New Roman", "Songti SC", serif'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type CardDef = {
  name: string
  type: string
  text: [string, string]
  cost: number
  rarity: Rarity
  stats?: [number, number]
  bg: [string, string]
  art: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void
}

const FRAME: Record<Rarity, { a: string; b: string; c: string; gem: string; label: string }> = {
  common: { a: '#eef0f3', b: '#a7adb6', c: '#666c76', gem: '#d9dde3', label: '普通' },
  rare: { a: '#cfe2ff', b: '#5d86d6', c: '#2a4688', gem: '#4f8dff', label: '稀有' },
  epic: { a: '#ead6ff', b: '#9a62e0', c: '#4f2a8c', gem: '#b46bff', label: '史诗' },
  legendary: { a: '#fff1c4', b: '#d9a845', c: '#7d5514', gem: '#ffb02e', label: '传说' },
}

/* ------------------------------------------------------------------ helpers */

function lin(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) gr.addColorStop(o, c)
  return gr
}
function rad(g: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: [number, string][]) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1)
  for (const [o, c] of stops) gr.addColorStop(o, c)
  return gr
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}
function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | CanvasGradient) {
  g.fillStyle = fill
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}
function poly(g: CanvasRenderingContext2D, pts: number[], fill: string | CanvasGradient) {
  g.fillStyle = fill
  g.beginPath()
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.closePath()
  g.fill()
}
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string, a = 0.6) {
  g.save()
  g.globalCompositeOperation = 'lighter'
  g.globalAlpha = a
  circle(g, x, y, r, rad(g, x, y, 0, r, [
    [0, c],
    [1, 'rgba(0,0,0,0)'],
  ]))
  g.restore()
}
/** deterministic pseudo-random for repeatable art */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
function stars(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number, seed: number, a = 0.8) {
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w
    const sy = y + r() * h
    const s = 0.6 + r() * 1.8
    g.fillStyle = `rgba(255,255,240,${(0.3 + r() * 0.7) * a})`
    g.beginPath()
    g.arc(sx, sy, s, 0, Math.PI * 2)
    g.fill()
  }
}

/* ------------------------------------------------------------------ illustrations (art window x,y,w,h) */

const fireball: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.55
  const r = rng(3)
  // flame tongues trailing up-left
  for (let i = 0; i < 9; i++) {
    const a = -2.2 + i * 0.16 + r() * 0.1
    const L = 120 + r() * 90
    g.save()
    g.translate(cx, cy)
    g.rotate(a)
    g.fillStyle = lin(g, 0, 0, L, 0, [
      [0, 'rgba(255,214,120,0.95)'],
      [0.5, 'rgba(255,110,40,0.7)'],
      [1, 'rgba(160,20,10,0)'],
    ])
    g.beginPath()
    g.moveTo(0, -38)
    g.quadraticCurveTo(L * 0.5, -30 + r() * 20, L, 0)
    g.quadraticCurveTo(L * 0.5, 30 - r() * 20, 0, 38)
    g.fill()
    g.restore()
  }
  glow(g, cx, cy, 150, '#ff7a2a', 0.8)
  circle(g, cx, cy, 62, rad(g, cx - 12, cy - 14, 4, 66, [
    [0, '#fffbe6'],
    [0.35, '#ffd36a'],
    [0.75, '#ff7b23'],
    [1, '#c2310e'],
  ]))
  // sparks
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2
    const d = 80 + r() * 90
    circle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 1.5 + r() * 2.5, `rgba(255,${180 + r() * 60},90,${0.5 + r() * 0.5})`)
  }
}

const iceShield: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.52
  glow(g, cx, cy, 170, '#7fd3ff', 0.5)
  // crystal shards behind
  const r = rng(11)
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42
    const L = 120 + r() * 50
    const bx = cx + Math.cos(a) * 30
    const by = cy + Math.sin(a) * 30
    const tx = cx + Math.cos(a) * L
    const ty = cy + Math.sin(a) * L
    const nx = -Math.sin(a) * 14
    const ny = Math.cos(a) * 14
    poly(g, [bx + nx, by + ny, tx, ty, bx - nx, by - ny], lin(g, bx, by, tx, ty, [
      [0, 'rgba(180,235,255,0.9)'],
      [1, 'rgba(230,250,255,0.3)'],
    ]))
  }
  // hex shield with facets
  const R = 78
  const pts: number[] = []
  for (let k = 0; k < 6; k++) pts.push(cx + R * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), cy + R * Math.sin(Math.PI / 6 + (k * Math.PI) / 3))
  poly(g, pts, lin(g, cx - R, cy - R, cx + R, cy + R, [
    [0, '#e8fbff'],
    [0.5, '#7cc8f2'],
    [1, '#2c6fb4'],
  ]))
  for (let k = 0; k < 6; k++) {
    const i0 = k * 2
    const i1 = ((k + 1) % 6) * 2
    poly(g, [cx, cy, pts[i0], pts[i0 + 1], pts[i1], pts[i1 + 1]], `rgba(255,255,255,${0.06 + (k % 3) * 0.08})`)
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < 12; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.closePath()
  g.stroke()
  stars(g, x, y, w, h, 40, 5, 0.7)
}

const forest: CardDef['art'] = (g, x, y, w, h) => {
  circle(g, x + w * 0.68, y + h * 0.34, 54, rad(g, x + w * 0.68, y + h * 0.34, 0, 54, [
    [0, '#fff6cf'],
    [1, '#f3d27a'],
  ]))
  glow(g, x + w * 0.68, y + h * 0.34, 140, '#ffe9a0', 0.4)
  const hill = (y0: number, amp: number, c: string, seed: number) => {
    const r = rng(seed)
    g.fillStyle = c
    g.beginPath()
    g.moveTo(x, y + h)
    for (let i = 0; i <= 8; i++) g.lineTo(x + (w * i) / 8, y0 - Math.sin(i * 0.9 + seed) * amp - r() * 10)
    g.lineTo(x + w, y + h)
    g.fill()
  }
  hill(y + h * 0.62, 26, '#3f8a55', 1)
  // pines
  const r = rng(7)
  for (let i = 0; i < 9; i++) {
    const px = x + 20 + i * (w / 8.6) + r() * 10
    const ph = 70 + r() * 70
    const py = y + h * 0.82 - r() * 18
    const c = i % 2 ? '#1f5a37' : '#256b40'
    for (let k = 0; k < 3; k++) poly(g, [px, py - ph + k * ph * 0.22, px - 26 + k * 3, py - ph * 0.35 + k * ph * 0.22, px + 26 - k * 3, py - ph * 0.35 + k * ph * 0.22], c)
    g.fillStyle = '#3b2b1a'
    g.fillRect(px - 4, py - ph * 0.15, 8, ph * 0.2)
  }
  hill(y + h * 0.9, 12, '#17402a', 4)
}

const starsArt: CardDef['art'] = (g, x, y, w, h) => {
  stars(g, x, y, w, h, 120, 23)
  // crescent
  const mx = x + w * 0.3
  const my = y + h * 0.32
  glow(g, mx, my, 120, '#c7a8ff', 0.45)
  circle(g, mx, my, 46, '#fff4d6')
  g.save()
  g.globalCompositeOperation = 'destination-out'
  circle(g, mx + 20, my - 12, 42, '#000')
  g.restore()
  // constellation
  const P = [
    [0.52, 0.62],
    [0.62, 0.48],
    [0.74, 0.55],
    [0.83, 0.38],
    [0.7, 0.75],
    [0.58, 0.84],
  ]
  g.strokeStyle = 'rgba(230,215,255,0.7)'
  g.lineWidth = 2
  g.beginPath()
  P.forEach(([px, py], i) => (i ? g.lineTo(x + px * w, y + py * h) : g.moveTo(x + px * w, y + py * h)))
  g.stroke()
  for (const [px, py] of P) {
    glow(g, x + px * w, y + py * h, 22, '#e8dcff', 0.8)
    circle(g, x + px * w, y + py * h, 4.5, '#ffffff')
  }
}

const hammer: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.5
  glow(g, cx, cy - 20, 170, '#9fb6ff', 0.55)
  // lightning bolts
  const bolt = (bx: number, s: number, flip: number) =>
    poly(g, [bx, y + 10, bx + 24 * s * flip, cy - 40, bx + 6 * s * flip, cy - 34, bx + 34 * s * flip, cy + 50, bx - 6 * s * flip, cy - 16, bx + 12 * s * flip, cy - 22], 'rgba(235,240,255,0.92)')
  bolt(x + 70, 1, 1)
  bolt(x + w - 70, 1, -1)
  g.save()
  g.translate(cx, cy)
  g.rotate(-0.35)
  // handle
  g.fillStyle = lin(g, -10, 0, 10, 0, [
    [0, '#5a3a20'],
    [0.5, '#a0703c'],
    [1, '#4a2e18'],
  ])
  rr(g, -9, -10, 18, 150, 6)
  g.fill()
  // head
  g.fillStyle = lin(g, 0, -80, 0, 0, [
    [0, '#f2f4fa'],
    [0.5, '#a9b2c8'],
    [1, '#5c6684'],
  ])
  rr(g, -78, -78, 156, 70, 10)
  g.fill()
  g.fillStyle = '#e7c66a'
  g.fillRect(-12, -78, 24, 70)
  circle(g, 0, -43, 11, '#6aa8ff')
  g.restore()
}

const fountain: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.5
  // rays
  g.save()
  g.translate(cx, cy - 10)
  for (let i = 0; i < 16; i++) {
    g.rotate((Math.PI * 2) / 16)
    poly(g, [0, 0, 220, -16, 220, 16], `rgba(255,240,190,${i % 2 ? 0.12 : 0.22})`)
  }
  g.restore()
  glow(g, cx, cy, 130, '#fff1b8', 0.7)
  // droplet
  g.fillStyle = lin(g, cx, cy - 90, cx, cy + 60, [
    [0, '#ffffff'],
    [0.5, '#a8ecff'],
    [1, '#3fa6d8'],
  ])
  g.beginPath()
  g.moveTo(cx, cy - 92)
  g.bezierCurveTo(cx + 18, cy - 50, cx + 62, cy - 10, cx + 62, cy + 22)
  g.arc(cx, cy + 22, 62, 0, Math.PI)
  g.bezierCurveTo(cx - 62, cy - 10, cx - 18, cy - 50, cx, cy - 92)
  g.fill()
  circle(g, cx - 22, cy + 6, 12, 'rgba(255,255,255,0.75)')
  // ripples
  g.strokeStyle = 'rgba(255,248,220,0.6)'
  g.lineWidth = 2.5
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.ellipse(cx, y + h * 0.9, 70 + i * 40, 12 + i * 6, 0, 0, Math.PI * 2)
    g.stroke()
  }
}

const assassin: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.55
  stars(g, x, y, w, h * 0.5, 30, 41, 0.4)
  glow(g, cx, cy, 150, '#8a4fd0', 0.5)
  // hood
  g.fillStyle = lin(g, cx, cy - 110, cx, cy + 110, [
    [0, '#2a2036'],
    [1, '#0b0910'],
  ])
  g.beginPath()
  g.moveTo(cx, cy - 112)
  g.bezierCurveTo(cx + 90, cy - 90, cx + 110, cy + 40, cx + 120, cy + 120)
  g.lineTo(cx - 120, cy + 120)
  g.bezierCurveTo(cx - 110, cy + 40, cx - 90, cy - 90, cx, cy - 112)
  g.fill()
  g.fillStyle = '#050407'
  g.beginPath()
  g.ellipse(cx, cy - 6, 46, 58, 0, 0, Math.PI * 2)
  g.fill()
  // eyes
  for (const s of [-1, 1]) {
    glow(g, cx + s * 18, cy - 12, 26, '#d48bff', 0.9)
    g.fillStyle = '#f3dcff'
    g.beginPath()
    g.ellipse(cx + s * 18, cy - 12, 9, 3.4, s * 0.25, 0, Math.PI * 2)
    g.fill()
  }
  // daggers
  for (const s of [-1, 1]) {
    g.save()
    g.translate(cx + s * 120, cy + 40)
    g.rotate(s * 0.7)
    poly(g, [0, -110, 12, -20, 0, -8, -12, -20], lin(g, 0, -110, 0, 0, [
      [0, '#ffffff'],
      [1, '#8d97b0'],
    ]))
    g.fillStyle = '#c9a256'
    g.fillRect(-20, -12, 40, 7)
    g.fillStyle = '#3a2a1a'
    g.fillRect(-5, -5, 10, 34)
    g.restore()
  }
}

const chest: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.6
  glow(g, cx, cy - 40, 180, '#ffd36a', 0.8)
  // coins burst
  const r = rng(77)
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4
    const d = 70 + r() * 110
    const px = cx + Math.cos(a) * d
    const py = cy - 40 + Math.sin(a) * d
    g.save()
    g.translate(px, py)
    g.scale(1, 0.55 + r() * 0.45)
    circle(g, 0, 0, 13, '#b8862b')
    circle(g, 0, -2, 12, '#ffd96b')
    g.restore()
  }
  // chest body
  g.fillStyle = lin(g, 0, cy - 10, 0, cy + 90, [
    [0, '#9a5a24'],
    [1, '#5c3212'],
  ])
  rr(g, cx - 110, cy - 10, 220, 100, 8)
  g.fill()
  // lid (open, tilted back)
  g.fillStyle = lin(g, 0, cy - 90, 0, cy - 10, [
    [0, '#b8722e'],
    [1, '#7a441a'],
  ])
  g.beginPath()
  g.moveTo(cx - 112, cy - 12)
  g.lineTo(cx - 100, cy - 80)
  g.quadraticCurveTo(cx, cy - 112, cx + 100, cy - 80)
  g.lineTo(cx + 112, cy - 12)
  g.closePath()
  g.fill()
  // gold inside
  g.fillStyle = lin(g, 0, cy - 30, 0, cy, [
    [0, '#fff3b0'],
    [1, '#e0a83a'],
  ])
  g.beginPath()
  g.ellipse(cx, cy - 8, 104, 18, 0, 0, Math.PI * 2)
  g.fill()
  // bands
  g.fillStyle = '#e8c46a'
  for (const s of [-1, 1]) g.fillRect(cx + s * 70 - 9, cy - 10, 18, 100)
  rr(g, cx - 16, cy + 18, 32, 36, 5)
  g.fill()
  circle(g, cx, cy + 34, 6, '#5c3212')
}

const dragon: CardDef['art'] = (g, x, y, w, h) => {
  const cx = x + w / 2
  const cy = y + h * 0.5
  // scales
  g.strokeStyle = 'rgba(255,170,90,0.28)'
  g.lineWidth = 3
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 10; col++) {
      const sx = x + col * 52 + (row % 2) * 26
      const sy = y + row * 40
      g.beginPath()
      g.arc(sx, sy, 28, 0.15 * Math.PI, 0.85 * Math.PI)
      g.stroke()
    }
  glow(g, cx, cy, 170, '#ff8a2a', 0.7)
  // eye
  g.fillStyle = rad(g, cx, cy, 6, 120, [
    [0, '#fff3b0'],
    [0.4, '#ffb52e'],
    [0.85, '#d2410f'],
    [1, '#6a1406'],
  ])
  g.beginPath()
  g.moveTo(cx - 140, cy)
  g.quadraticCurveTo(cx, cy - 110, cx + 140, cy)
  g.quadraticCurveTo(cx, cy + 110, cx - 140, cy)
  g.fill()
  g.fillStyle = '#140302'
  g.beginPath()
  g.ellipse(cx, cy, 14, 52, 0, 0, Math.PI * 2)
  g.fill()
  circle(g, cx - 34, cy - 22, 9, 'rgba(255,255,255,0.75)')
  g.strokeStyle = '#3a0a04'
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(cx - 140, cy)
  g.quadraticCurveTo(cx, cy - 110, cx + 140, cy)
  g.quadraticCurveTo(cx, cy + 110, cx - 140, cy)
  g.stroke()
}

const spirit: CardDef['art'] = (g, x, y, w, h) => {
  stars(g, x, y, w, h, 70, 99, 0.7)
  const mx = x + w * 0.5
  const my = y + h * 0.36
  glow(g, mx, my, 160, '#bfeaff', 0.55)
  circle(g, mx, my, 70, rad(g, mx - 16, my - 18, 4, 74, [
    [0, '#ffffff'],
    [0.7, '#e3f4ff'],
    [1, '#a9d8f0'],
  ]))
  // craters
  for (const [dx, dy, r] of [
    [-20, 10, 12],
    [22, -16, 8],
    [16, 26, 6],
  ])
    circle(g, mx + dx, my + dy, r, 'rgba(150,190,215,0.35)')
  // wisps
  const r = rng(5)
  for (let i = 0; i < 6; i++) {
    const wx = x + 60 + r() * (w - 120)
    const wy = y + h * 0.62 + r() * h * 0.3
    g.strokeStyle = 'rgba(170,255,240,0.35)'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(wx, wy)
    g.bezierCurveTo(wx - 20, wy + 20, wx + 20, wy + 30, wx - 6, wy + 54)
    g.stroke()
    glow(g, wx, wy, 26, '#9ffff0', 0.9)
    circle(g, wx, wy, 6, '#f0fffb')
  }
}

/* ------------------------------------------------------------------ the deck */

export const DECK: CardDef[] = [
  { name: '火球术', type: '法术 · 火焰', text: ['造成 6 点伤害，', '溅射相邻目标。'], cost: 4, rarity: 'rare', bg: ['#3a0d06', '#b8361a'], art: fireball },
  { name: '寒冰护盾', type: '法术 · 冰霜', text: ['获得 5 点护甲，', '冻结一个攻击者。'], cost: 2, rarity: 'common', bg: ['#0b2440', '#4b9fd6'], art: iceShield },
  { name: '森林守卫', type: '随从 · 树人', text: ['嘲讽。', '回合结束时恢复 2 点。'], cost: 4, rarity: 'rare', stats: [3, 6], bg: ['#0d2c1c', '#5fa76c'], art: forest },
  { name: '星辰占卜', type: '法术 · 奥术', text: ['查看牌库顶的 3 张牌，', '选一张加入手牌。'], cost: 1, rarity: 'epic', bg: ['#0f0a2b', '#47308a'], art: starsArt },
  { name: '雷霆之锤', type: '武器 · 风暴', text: ['攻击时，对随机敌人', '造成 2 点闪电伤害。'], cost: 5, rarity: 'epic', stats: [4, 2], bg: ['#141833', '#5363a8'], art: hammer },
  { name: '治愈之泉', type: '法术 · 神圣', text: ['恢复 8 点生命，', '抽一张牌。'], cost: 2, rarity: 'common', bg: ['#3a2a0a', '#e4c06a'], art: fountain },
  { name: '暗影刺客', type: '随从 · 盗贼', text: ['潜行。首次攻击', '造成双倍伤害。'], cost: 3, rarity: 'rare', stats: [4, 2], bg: ['#100d16', '#4a3060'], art: assassin },
  { name: '黄金宝箱', type: '宝物 · 传说', text: ['打开：获得 3 枚金币', '和一张随机传说牌。'], cost: 4, rarity: 'legendary', bg: ['#2e1a06', '#a8742a'], art: chest },
  { name: '龙之吐息', type: '法术 · 龙族', text: ['对所有敌人造成', '4 点火焰伤害。'], cost: 7, rarity: 'legendary', bg: ['#2a0806', '#d0502a'], art: dragon },
  { name: '月光精灵', type: '随从 · 精灵', text: ['夜幕降临时，', '获得 +2/+2。'], cost: 3, rarity: 'epic', stats: [2, 3], bg: ['#0b1b2e', '#2f6f86'], art: spirit },
]

/* ------------------------------------------------------------------ front */

function costGem(g: CanvasRenderingContext2D, x: number, y: number, n: number) {
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.45)'
  g.shadowBlur = 14
  g.shadowOffsetY = 4
  circle(g, x, y, 44, lin(g, x - 44, y - 44, x + 44, y + 44, [
    [0, '#fff1c4'],
    [0.5, '#d9a845'],
    [1, '#7d5514'],
  ]))
  g.restore()
  // faceted sapphire
  const R = 36
  const pts: number[] = []
  for (let k = 0; k < 8; k++) pts.push(x + R * Math.cos((k * Math.PI) / 4 + Math.PI / 8), y + R * Math.sin((k * Math.PI) / 4 + Math.PI / 8))
  poly(g, pts, lin(g, x, y - R, x, y + R, [
    [0, '#8fd0ff'],
    [0.55, '#2d6fe0'],
    [1, '#123a8a'],
  ]))
  for (let k = 0; k < 8; k++) {
    const i0 = k * 2
    const i1 = ((k + 1) % 8) * 2
    poly(g, [x, y, pts[i0], pts[i0 + 1], pts[i1], pts[i1 + 1]], `rgba(255,255,255,${[0.18, 0.05, 0.12, 0.0, 0.08, 0.02, 0.14, 0.04][k]})`)
  }
  g.fillStyle = '#ffffff'
  g.font = `700 52px ${SERIF}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 6
  g.strokeStyle = 'rgba(10,30,80,0.85)'
  g.strokeText(String(n), x, y + 3)
  g.fillText(String(n), x, y + 3)
}

function statBadge(g: CanvasRenderingContext2D, x: number, y: number, n: number, kind: 'atk' | 'hp') {
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.5)'
  g.shadowBlur = 10
  g.shadowOffsetY = 3
  if (kind === 'atk') {
    poly(g, [x, y - 40, x + 38, y - 4, x + 26, y + 36, x - 26, y + 36, x - 38, y - 4], lin(g, x, y - 40, x, y + 36, [
      [0, '#ffd27a'],
      [1, '#c4561c'],
    ]))
  } else {
    g.fillStyle = lin(g, x, y - 36, x, y + 36, [
      [0, '#ff9a9a'],
      [1, '#a51f2a'],
    ])
    g.beginPath()
    g.moveTo(x, y + 36)
    g.bezierCurveTo(x - 50, y + 4, x - 36, y - 40, x, y - 18)
    g.bezierCurveTo(x + 36, y - 40, x + 50, y + 4, x, y + 36)
    g.fill()
  }
  g.restore()
  g.fillStyle = '#fff'
  g.font = `700 36px ${SERIF}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineWidth = 5
  g.strokeStyle = 'rgba(40,10,0,0.8)'
  g.strokeText(String(n), x, y + 2)
  g.fillText(String(n), x, y + 2)
}

export function drawFront(g: CanvasRenderingContext2D, d: CardDef) {
  const W = TEX_W
  const H = TEX_H
  const F = FRAME[d.rarity]
  g.clearRect(0, 0, W, H)
  // outer frame (metal)
  rr(g, 0, 0, W, H, 34)
  g.fillStyle = lin(g, 0, 0, W, H, [
    [0, F.a],
    [0.45, F.b],
    [0.55, F.a],
    [1, F.c],
  ])
  g.fill()
  rr(g, 9, 9, W - 18, H - 18, 27)
  g.fillStyle = '#17130e'
  g.fill()
  // body
  rr(g, 14, 14, W - 28, H - 28, 23)
  g.fillStyle = lin(g, 0, 0, 0, H, [
    [0, '#2a2218'],
    [1, '#16120c'],
  ])
  g.fill()

  // art window
  const ax = 34
  const ay = 46
  const aw = W - 68
  const ah = 342
  g.save()
  rr(g, ax, ay, aw, ah, 16)
  g.clip()
  g.fillStyle = lin(g, 0, ay, 0, ay + ah, [
    [0, d.bg[0]],
    [1, d.bg[1]],
  ])
  g.fillRect(ax, ay, aw, ah)
  d.art(g, ax, ay, aw, ah)
  // vignette in the window
  g.fillStyle = rad(g, ax + aw / 2, ay + ah / 2, ah * 0.35, ah * 0.85, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.45)'],
  ])
  g.fillRect(ax, ay, aw, ah)
  g.restore()
  rr(g, ax, ay, aw, ah, 16)
  g.lineWidth = 4
  g.strokeStyle = F.b
  g.stroke()

  // title ribbon
  const ry = ay + ah - 6
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.5)'
  g.shadowBlur = 12
  g.shadowOffsetY = 4
  g.fillStyle = lin(g, 0, ry, 0, ry + 60, [
    [0, '#3c3022'],
    [1, '#231b12'],
  ])
  g.beginPath()
  g.moveTo(22, ry + 4)
  g.lineTo(W - 22, ry + 4)
  g.lineTo(W - 38, ry + 32)
  g.lineTo(W - 22, ry + 60)
  g.lineTo(22, ry + 60)
  g.lineTo(38, ry + 32)
  g.closePath()
  g.fill()
  g.restore()
  g.strokeStyle = '#d9b25c'
  g.lineWidth = 2.5
  g.stroke()
  g.fillStyle = '#f7e6bd'
  g.font = `700 36px ${SANS}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(d.name, W / 2, ry + 33)

  // type line
  g.fillStyle = 'rgba(232,212,164,0.7)'
  g.font = `500 20px ${SANS}`
  g.fillText(d.type, W / 2, ry + 88)

  // rules text on parchment
  const px = 40
  const py = ry + 110
  const pw = W - 80
  const ph = 150
  rr(g, px, py, pw, ph, 14)
  g.fillStyle = lin(g, 0, py, 0, py + ph, [
    [0, '#f1e4c3'],
    [1, '#dcc89a'],
  ])
  g.fill()
  g.fillStyle = '#3a2c18'
  g.font = `500 26px ${SANS}`
  g.fillText(d.text[0], W / 2, py + 52)
  g.fillText(d.text[1], W / 2, py + 92)

  // rarity gem
  const gx = W / 2
  const gy = ay + ah - 20
  g.save()
  g.translate(gx, gy)
  g.rotate(Math.PI / 4)
  g.fillStyle = '#17130e'
  g.fillRect(-15, -15, 30, 30)
  g.fillStyle = lin(g, -12, -12, 12, 12, [
    [0, '#ffffff'],
    [0.4, F.gem],
    [1, F.c],
  ])
  g.fillRect(-11, -11, 22, 22)
  g.restore()

  costGem(g, 58, 58, d.cost)
  if (d.stats) {
    statBadge(g, 58, H - 56, d.stats[0], 'atk')
    statBadge(g, W - 58, H - 56, d.stats[1], 'hp')
  } else {
    g.fillStyle = 'rgba(232,212,164,0.55)'
    g.font = `600 17px ${SANS}`
    g.fillText(`${F.label} · ARCANA`, W / 2, H - 40)
  }
  if (d.stats) {
    g.fillStyle = 'rgba(232,212,164,0.55)'
    g.font = `600 17px ${SANS}`
    g.fillText(F.label, W / 2, H - 40)
  }
}

/* ------------------------------------------------------------------ back */

export function drawBack(g: CanvasRenderingContext2D) {
  const W = TEX_W
  const H = TEX_H
  g.clearRect(0, 0, W, H)
  rr(g, 0, 0, W, H, 34)
  g.fillStyle = lin(g, 0, 0, W, H, [
    [0, '#fff1c4'],
    [0.45, '#c99a3e'],
    [0.55, '#fff1c4'],
    [1, '#7d5514'],
  ])
  g.fill()
  rr(g, 10, 10, W - 20, H - 20, 26)
  g.fillStyle = rad(g, W / 2, H / 2, 20, H * 0.62, [
    [0, '#1d5a45'],
    [0.6, '#0f3326'],
    [1, '#081c15'],
  ])
  g.fill()
  // lattice
  g.save()
  rr(g, 10, 10, W - 20, H - 20, 26)
  g.clip()
  g.strokeStyle = 'rgba(232,196,106,0.13)'
  g.lineWidth = 2
  for (let i = -H; i < W + H; i += 34) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + H, H)
    g.stroke()
    g.beginPath()
    g.moveTo(i, H)
    g.lineTo(i + H, 0)
    g.stroke()
  }
  g.restore()
  // inner border
  rr(g, 34, 34, W - 68, H - 68, 18)
  g.strokeStyle = '#e8c46a'
  g.lineWidth = 3
  g.stroke()
  rr(g, 44, 44, W - 88, H - 88, 14)
  g.strokeStyle = 'rgba(232,196,106,0.5)'
  g.lineWidth = 1.5
  g.stroke()
  // central mandala
  const cx = W / 2
  const cy = H / 2
  glow(g, cx, cy, 200, '#e8c46a', 0.25)
  g.save()
  g.translate(cx, cy)
  for (let ring = 0; ring < 3; ring++) {
    const n = [16, 12, 8][ring]
    const r0 = [70, 112, 150][ring]
    const L = [44, 40, 36][ring]
    for (let k = 0; k < n; k++) {
      g.save()
      g.rotate((k / n) * Math.PI * 2 + ring * 0.2)
      g.fillStyle = ring === 1 ? 'rgba(232,196,106,0.85)' : 'rgba(232,196,106,0.5)'
      g.beginPath()
      g.moveTo(0, -r0)
      g.quadraticCurveTo(L * 0.42, -r0 - L * 0.5, 0, -r0 - L)
      g.quadraticCurveTo(-L * 0.42, -r0 - L * 0.5, 0, -r0)
      g.fill()
      g.restore()
    }
  }
  for (const [r, a] of [
    [64, 0.9],
    [104, 0.5],
    [196, 0.35],
  ]) {
    g.strokeStyle = `rgba(232,196,106,${a})`
    g.lineWidth = 2.5
    g.beginPath()
    g.arc(0, 0, r, 0, Math.PI * 2)
    g.stroke()
  }
  // star in the middle
  const pts: number[] = []
  for (let k = 0; k < 16; k++) {
    const r = k % 2 ? 22 : 56
    const a = (k / 16) * Math.PI * 2 - Math.PI / 2
    pts.push(Math.cos(a) * r, Math.sin(a) * r)
  }
  poly(g, pts, lin(g, -56, -56, 56, 56, [
    [0, '#fff1c4'],
    [0.5, '#e8c46a'],
    [1, '#a8762a'],
  ]))
  circle(g, 0, 0, 12, '#0f3326')
  circle(g, 0, 0, 6, '#e8c46a')
  g.restore()
  // corner pips
  for (const [x, y] of [
    [70, 70],
    [W - 70, 70],
    [70, H - 70],
    [W - 70, H - 70],
  ]) {
    g.save()
    g.translate(x, y)
    g.rotate(Math.PI / 4)
    g.fillStyle = '#e8c46a'
    g.fillRect(-8, -8, 16, 16)
    g.restore()
  }
}

/* ------------------------------------------------------------------ felt table
   The texture covers TW × TD world units centred on the table origin; gold inlays mark the play zone and the
   deck / discard trays (positions passed in world units). */

export type FeltSpec = {
  tw: number
  td: number
  zone: { x: number; z: number; w: number; d: number }
  trays: { x: number; z: number; label: string }[]
  cardW: number
  cardH: number
}

export function drawFelt(g: CanvasRenderingContext2D, W: number, H: number, s: FeltSpec) {
  const px = W / s.tw
  const X = (x: number) => W / 2 + x * px
  const Z = (z: number) => H / 2 + z * px
  // base + lamp pool
  g.fillStyle = '#123a2a'
  g.fillRect(0, 0, W, H)
  g.fillStyle = rad(g, W / 2, H * 0.52, 0, W * 0.4, [
    [0, '#2c7656'],
    [0.45, '#1c5a40'],
    [1, '#0b2219'],
  ])
  g.fillRect(0, 0, W, H)
  // felt grain from a small noise tile
  const T = 256
  const tile = document.createElement('canvas')
  tile.width = tile.height = T
  const tg = tile.getContext('2d', { willReadFrequently: true })!
  const img = tg.createImageData(T, T)
  const r = rng(12345)
  for (let i = 0; i < T * T; i++) {
    const v = r()
    const k = i * 4
    const c = v > 0.5 ? 255 : 0
    img.data[k] = c
    img.data[k + 1] = c
    img.data[k + 2] = c
    img.data[k + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 26)
  }
  tg.putImageData(img, 0, 0)
  g.fillStyle = g.createPattern(tile, 'repeat')!
  g.fillRect(0, 0, W, H)

  const gold = 'rgba(232,196,106,0.75)'
  const goldSoft = 'rgba(232,196,106,0.28)'
  // play zone: double rounded rectangle with corner flourishes
  const zx = X(s.zone.x - s.zone.w / 2)
  const zy = Z(s.zone.z - s.zone.d / 2)
  const zw = s.zone.w * px
  const zh = s.zone.d * px
  g.lineWidth = 3
  g.strokeStyle = gold
  rr(g, zx, zy, zw, zh, 0.25 * px)
  g.stroke()
  g.lineWidth = 1.5
  g.strokeStyle = goldSoft
  rr(g, zx + 0.09 * px, zy + 0.09 * px, zw - 0.18 * px, zh - 0.18 * px, 0.18 * px)
  g.stroke()
  for (const [cx, cy, sx, sy] of [
    [zx, zy, 1, 1],
    [zx + zw, zy, -1, 1],
    [zx, zy + zh, 1, -1],
    [zx + zw, zy + zh, -1, -1],
  ]) {
    g.save()
    g.translate(cx + sx * 0.32 * px, cy + sy * 0.32 * px)
    g.rotate(Math.PI / 4)
    g.fillStyle = gold
    g.fillRect(-7, -7, 14, 14)
    g.restore()
  }
  // centre label
  g.fillStyle = 'rgba(232,196,106,0.22)'
  g.font = `600 ${Math.round(0.34 * px)}px ${SANS}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('出 牌 区', X(s.zone.x), Z(s.zone.z))
  // trays
  for (const t of s.trays) {
    const w = (s.cardW + 0.3) * px
    const h = (s.cardH + 0.3) * px
    g.lineWidth = 2.5
    g.strokeStyle = goldSoft
    g.setLineDash([10, 9])
    rr(g, X(t.x) - w / 2, Z(t.z) - h / 2, w, h, 0.12 * px)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = 'rgba(232,196,106,0.4)'
    g.font = `500 ${Math.round(0.17 * px)}px ${SANS}`
    g.fillText(t.label, X(t.x), Z(t.z) + h / 2 + 0.22 * px)
  }
  // outer pinstripe
  g.lineWidth = 2
  g.strokeStyle = 'rgba(232,196,106,0.16)'
  rr(g, X(-s.tw / 2 + 0.9), Z(-s.td / 2 + 0.9), (s.tw - 1.8) * px, (s.td - 1.8) * px, 0.6 * px)
  g.stroke()
  // vignette towards the edges so the plane dissolves into the background
  g.fillStyle = rad(g, W / 2, H * 0.52, W * 0.2, W * 0.46, [
    [0, 'rgba(6,18,13,0)'],
    [1, 'rgba(6,18,13,1)'],
  ])
  g.fillRect(0, 0, W, H)
}

/* ------------------------------------------------------------------ fx sprites */

export function drawGlowCard(g: CanvasRenderingContext2D, W: number, H: number, padX: number, padY: number) {
  // soft rounded-rect halo: the card shape drawn off-canvas, only its blurred shadow lands on the canvas
  g.clearRect(0, 0, W, H)
  g.save()
  g.shadowColor = '#ffffff'
  g.shadowBlur = padX * 0.9
  g.shadowOffsetX = W * 2
  g.fillStyle = '#ffffff'
  rr(g, padX - W * 2, padY, W - padX * 2, H - padY * 2, padX * 0.6)
  g.fill()
  g.fill()
  g.restore()
}

export function drawSoftDot(g: CanvasRenderingContext2D, S: number) {
  g.clearRect(0, 0, S, S)
  circle(g, S / 2, S / 2, S / 2, rad(g, S / 2, S / 2, 0, S / 2, [
    [0, 'rgba(255,255,255,1)'],
    [0.4, 'rgba(255,255,255,0.55)'],
    [1, 'rgba(255,255,255,0)'],
  ]))
}

export function drawRing(g: CanvasRenderingContext2D, S: number) {
  g.clearRect(0, 0, S, S)
  const c = S / 2
  g.fillStyle = rad(g, c, c, 0, c, [
    [0, 'rgba(255,255,255,0)'],
    [0.62, 'rgba(255,255,255,0)'],
    [0.8, 'rgba(255,255,255,1)'],
    [0.86, 'rgba(255,255,255,0.6)'],
    [1, 'rgba(255,255,255,0)'],
  ])
  g.fillRect(0, 0, S, S)
}
