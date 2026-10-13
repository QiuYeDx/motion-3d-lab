import * as THREE from 'three'
import { PH, PW } from './shatterGeo'

/* The printed artwork on the panel — one canvas per material, all sharing the same layout
   so the print reads continuously across every shard. */

export type MatKind = 'frost' | 'acrylic' | 'mirror'

type Palette = {
  bg: (g: CanvasRenderingContext2D, w: number, h: number) => void
  grid: string
  ink: string
  ink2: string
  disc: [string, string]
  dot: string
}

const PAL: Record<MatKind, Palette> = {
  frost: {
    bg: (g, w, h) => {
      g.fillStyle = '#ffffff'
      g.fillRect(0, 0, w, h)
    },
    grid: 'rgba(60, 100, 230, 0.16)',
    ink: '#18214a',
    ink2: '#3f63e8',
    disc: ['#4f7dff', '#a9c0ff'],
    dot: '#ff6b4a',
  },
  acrylic: {
    bg: (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, w * 0.7, h)
      lg.addColorStop(0, '#ffb15c')
      lg.addColorStop(0.45, '#ff5a7a')
      lg.addColorStop(1, '#7b62ff')
      g.fillStyle = lg
      g.fillRect(0, 0, w, h)
    },
    grid: 'rgba(255, 255, 255, 0.22)',
    ink: '#ffffff',
    ink2: 'rgba(255,255,255,0.86)',
    disc: ['#ffe27a', '#ffc24a'],
    dot: '#ffffff',
  },
  mirror: {
    bg: (g, w, h) => {
      g.fillStyle = '#f4f6fa'
      g.fillRect(0, 0, w, h)
    },
    grid: 'rgba(30, 36, 50, 0.12)',
    ink: '#1b1f29',
    ink2: '#4a5470',
    disc: ['#b9c7e6', '#e3e9f6'],
    dot: '#ff6b4a',
  },
}

const SANS = '"Segoe UI", "SF Pro Display", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
const CJK = '"PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
const MONO = '"Cascadia Code", "SF Mono", Consolas, monospace'

function wineGlass(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = color
  g.lineWidth = s * 0.07
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  g.moveTo(-s * 0.32, 0)
  g.lineTo(s * 0.32, 0)
  g.quadraticCurveTo(s * 0.34, s * 0.5, 0, s * 0.58)
  g.quadraticCurveTo(-s * 0.34, s * 0.5, -s * 0.32, 0)
  g.moveTo(0, s * 0.58)
  g.lineTo(0, s * 0.98)
  g.moveTo(-s * 0.22, s * 1.0)
  g.lineTo(s * 0.22, s * 1.0)
  // the crack
  g.moveTo(s * 0.06, s * 0.02)
  g.lineTo(-s * 0.04, s * 0.18)
  g.lineTo(s * 0.08, s * 0.28)
  g.lineTo(-s * 0.02, s * 0.42)
  g.stroke()
  g.restore()
}

function arrows(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = color
  g.lineWidth = s * 0.08
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (const dx of [-s * 0.26, s * 0.26]) {
    g.beginPath()
    g.moveTo(dx, s)
    g.lineTo(dx, 0)
    g.moveTo(dx - s * 0.18, s * 0.2)
    g.lineTo(dx, 0)
    g.lineTo(dx + s * 0.18, s * 0.2)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(-s * 0.5, s * 1.18)
  g.lineTo(s * 0.5, s * 1.18)
  g.stroke()
  g.restore()
}

export function paintPrint(kind: MatKind): THREE.CanvasTexture {
  const w = 1024
  const h = Math.round((w * PH) / PW)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const p = PAL[kind]
  p.bg(g, w, h)

  const m = 78 // margin
  // fine grid — makes the continuity across shards obvious
  g.strokeStyle = p.grid
  g.lineWidth = 2
  for (let x = m; x <= w - m + 1; x += (w - m * 2) / 8) {
    g.beginPath()
    g.moveTo(x, m)
    g.lineTo(x, h - m)
    g.stroke()
  }
  for (let y = m; y <= h - m + 1; y += (w - m * 2) / 8) {
    g.beginPath()
    g.moveTo(m, y)
    g.lineTo(w - m, y)
    g.stroke()
  }

  // big disc
  const cx = w * 0.64
  const cy = h * 0.33
  const r = w * 0.27
  const rg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  rg.addColorStop(0, p.disc[0])
  rg.addColorStop(1, p.disc[1])
  g.fillStyle = rg
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  // orbit ring
  g.strokeStyle = p.ink2
  g.lineWidth = 4
  g.beginPath()
  g.ellipse(cx, cy, r * 1.32, r * 0.42, -0.42, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = p.dot
  g.beginPath()
  g.arc(cx + Math.cos(2.4) * r * 1.32 * Math.cos(-0.42) - Math.sin(2.4) * r * 0.42 * Math.sin(-0.42), cy + Math.cos(2.4) * r * 1.32 * Math.sin(-0.42) + Math.sin(2.4) * r * 0.42 * Math.cos(-0.42), 22, 0, Math.PI * 2)
  g.fill()

  // header
  g.fillStyle = p.ink
  g.font = `600 30px ${MONO}`
  g.textBaseline = 'alphabetic'
  g.fillText('GLASS LAB', m, m + 52)
  g.fillStyle = p.ink2
  g.font = `500 30px ${MONO}`
  g.textAlign = 'right'
  g.fillText('№ 07 / 3MM', w - m, m + 52)
  g.textAlign = 'left'

  // headline
  g.fillStyle = p.ink
  g.font = `900 300px ${CJK}`
  g.fillText('易碎', m - 12, h * 0.73)
  g.font = `800 112px ${SANS}`
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '-3px'
  g.fillText('FRAGILE', m, h * 0.73 + 128)
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'

  // rule + footer
  g.fillStyle = p.ink
  g.fillRect(m, h - m - 92, w - m * 2, 5)
  g.font = `500 28px ${MONO}`
  g.fillStyle = p.ink2
  g.fillText('HANDLE WITH CARE', m, h - m - 30)
  g.font = `600 30px ${CJK}`
  g.textAlign = 'right'
  g.fillText('轻拿 · 轻放', w - m, h - m - 30)
  g.textAlign = 'left'

  // pictograms
  wineGlass(g, w - m - 50, h * 0.6, 120, p.ink)
  arrows(g, w - m - 200, h * 0.6 + 4, 104, p.ink)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}
