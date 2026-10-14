/*
 * Procedural paper cut-outs for the 剪影动画 page (SilhouetteFilm.tsx): every piece is drawn white on a
 * transparent canvas (only the alpha matters — the effect turns it into black paper), with windows, lattice and
 * eyelets cut out using destination-out. Seeded so the set looks the same on every visit.
 */

type G = CanvasRenderingContext2D

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function mk(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.strokeStyle = '#fff'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  return { c, g }
}

const cut = (g: G, fn: () => void) => {
  g.save()
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = '#000'
  g.strokeStyle = '#000'
  fn()
  g.restore()
}

/* ------------------------------------------------------------------ primitives */

/** onion dome standing on (cx, by): half-width r, height h */
function onion(g: G, cx: number, by: number, r: number, h: number) {
  g.beginPath()
  g.moveTo(cx - r * 0.82, by)
  g.bezierCurveTo(cx - r * 1.12, by - h * 0.18, cx - r * 1.12, by - h * 0.5, cx - r * 0.55, by - h * 0.7)
  g.bezierCurveTo(cx - r * 0.18, by - h * 0.82, cx - r * 0.06, by - h * 0.9, cx, by - h)
  g.bezierCurveTo(cx + r * 0.06, by - h * 0.9, cx + r * 0.18, by - h * 0.82, cx + r * 0.55, by - h * 0.7)
  g.bezierCurveTo(cx + r * 1.12, by - h * 0.5, cx + r * 1.12, by - h * 0.18, cx + r * 0.82, by)
  g.closePath()
  g.fill()
}

/** finial: rod, two beads and a crescent on top of (cx, ty) */
function finial(g: G, cx: number, ty: number, s: number) {
  g.fillRect(cx - s * 0.06, ty - s * 0.9, s * 0.12, s * 0.9)
  g.beginPath()
  g.arc(cx, ty - s * 0.35, s * 0.13, 0, Math.PI * 2)
  g.arc(cx, ty - s * 0.65, s * 0.1, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(cx, ty - s * 1.12, s * 0.26, 0, Math.PI * 2)
  g.fill()
  cut(g, () => {
    g.beginPath()
    g.arc(cx + s * 0.11, ty - s * 1.18, s * 0.22, 0, Math.PI * 2)
    g.fill()
  })
}

/** pointed (ogee-ish) arch window, bottom at (cx, by) */
function arch(g: G, cx: number, by: number, w: number, h: number) {
  g.beginPath()
  g.moveTo(cx - w / 2, by)
  g.lineTo(cx - w / 2, by - h * 0.62)
  g.quadraticCurveTo(cx - w / 2, by - h * 0.9, cx, by - h)
  g.quadraticCurveTo(cx + w / 2, by - h * 0.9, cx + w / 2, by - h * 0.62)
  g.lineTo(cx + w / 2, by)
  g.closePath()
  g.fill()
}

function minaret(g: G, cx: number, by: number, w: number, h: number, r: () => number) {
  g.fillRect(cx - w / 2, by - h, w, h)
  // balconies
  const n = 2 + Math.floor(r() * 2)
  for (let i = 1; i <= n; i++) {
    const y = by - h * (i / (n + 0.6))
    g.fillRect(cx - w * 0.85, y - w * 0.18, w * 1.7, w * 0.22)
    g.beginPath()
    g.moveTo(cx - w * 0.85, y + w * 0.04)
    g.lineTo(cx - w / 2, y + w * 0.5)
    g.lineTo(cx + w / 2, y + w * 0.5)
    g.lineTo(cx + w * 0.85, y + w * 0.04)
    g.fill()
  }
  // top: a small onion or a cone
  if (r() < 0.6) onion(g, cx, by - h, w * 0.75, w * 1.7)
  else {
    g.beginPath()
    g.moveTo(cx - w * 0.62, by - h)
    g.lineTo(cx, by - h - w * 2.6)
    g.lineTo(cx + w * 0.62, by - h)
    g.fill()
  }
  finial(g, cx, by - h - (w * 1.7), w * 0.9)
  // slit windows
  cut(g, () => {
    for (let i = 0; i < n + 1; i++) {
      const y = by - h * ((i + 0.45) / (n + 0.6))
      arch(g, cx, y, w * 0.32, w * 0.9)
    }
  })
}

/** sand dunes filling to the bottom; top line around y0 */
function dunes(g: G, w: number, h: number, y0: number, amp: number, seed: number) {
  const r = rng(seed)
  const ph = [r() * 6, r() * 6, r() * 6]
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 4) {
    const u = x / w
    const y = y0 - amp * (Math.sin(u * 7.1 + ph[0]) * 0.55 + Math.sin(u * 15.3 + ph[1]) * 0.3 + Math.sin(u * 37.0 + ph[2]) * 0.08)
    g.lineTo(x, y)
  }
  g.lineTo(w, h)
  g.closePath()
  g.fill()
}

/** a date palm: curved notched trunk and a crown of drooping fronds with leaflets */
function palm(g: G, bx: number, by: number, H: number, lean: number, seed: number) {
  const r = rng(seed)
  const tx = bx + lean * H
  const ty = by - H
  const cx = bx + lean * H * 0.25
  const cy = by - H * 0.55
  const P = (t: number) => {
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const c = t * t
    return [a * bx + b * cx + c * tx, a * by + b * cy + c * ty]
  }
  // trunk: tapered, with leaf-scar notches on both sides
  const W0 = H * 0.045
  const W1 = H * 0.022
  const N = 40
  const L: number[][] = []
  const R: number[][] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const [x, y] = P(t)
    const [x2, y2] = P(Math.min(1, t + 0.01))
    let nx = -(y2 - y)
    let ny = x2 - x
    const l = Math.hypot(nx, ny) || 1
    nx /= l
    ny /= l
    const notch = i % 2 === 0 ? 1 : 0.72
    const w = (W0 + (W1 - W0) * t) * notch
    L.push([x + nx * w, y + ny * w])
    R.push([x - nx * w, y - ny * w])
  }
  g.beginPath()
  g.moveTo(L[0][0], L[0][1])
  for (const p of L) g.lineTo(p[0], p[1])
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1])
  g.closePath()
  g.fill()
  // fronds
  const nf = 11
  for (let f = 0; f < nf; f++) {
    const a = -Math.PI / 2 + (f / (nf - 1) - 0.5) * Math.PI * 1.55 + (r() - 0.5) * 0.2
    const len = H * (0.38 + r() * 0.16)
    const droop = 0.9 + r() * 0.5
    // spine: start up/out, then droop under gravity
    const sx = tx
    const sy = ty
    const ex = sx + Math.cos(a) * len
    const ey = sy + Math.sin(a) * len * 0.55 + len * 0.35 * droop * Math.abs(Math.cos(a))
    const mx = sx + Math.cos(a) * len * 0.55
    const my = sy + Math.sin(a) * len * 0.7
    const S = (t: number) => {
      const p = (1 - t) * (1 - t)
      const q = 2 * (1 - t) * t
      const s2 = t * t
      return [p * sx + q * mx + s2 * ex, p * sy + q * my + s2 * ey]
    }
    g.lineWidth = H * 0.008
    g.beginPath()
    g.moveTo(sx, sy)
    g.quadraticCurveTo(mx, my, ex, ey)
    g.stroke()
    // leaflets on both sides, swept toward the tip, shorter near the tip
    const M = 26
    for (let i = 2; i < M; i++) {
      const t = i / M
      const [x, y] = S(t)
      const [x2, y2] = S(Math.min(1, t + 0.02))
      const dx = x2 - x
      const dy = y2 - y
      const dl = Math.hypot(dx, dy) || 1
      const ux = dx / dl
      const uy = dy / dl
      const ll = len * 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (0.8 + 0.4 * r())
      for (const side of [-1, 1]) {
        const ang = 0.75 * side
        const lx = ux * Math.cos(ang) - uy * Math.sin(ang)
        const ly = ux * Math.sin(ang) + uy * Math.cos(ang)
        const gx = 0.25 // leaflets hang a little
        const tipx = x + (lx * 0.85) * ll
        const tipy = y + (ly * 0.85 + gx) * ll
        g.beginPath()
        g.moveTo(x - ux * ll * 0.06, y - uy * ll * 0.06)
        g.quadraticCurveTo(x + lx * ll * 0.5 + uy * side * ll * 0.07, y + ly * ll * 0.5 - ux * side * ll * 0.07, tipx, tipy)
        g.quadraticCurveTo(x + lx * ll * 0.45, y + ly * ll * 0.45 + ll * 0.08, x + ux * ll * 0.12, y + uy * ll * 0.12)
        g.fill()
      }
    }
  }
  // date clusters
  g.beginPath()
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI
    const d = H * (0.02 + r() * 0.035)
    g.arc(tx + Math.cos(a) * d * 1.4, ty + H * 0.03 + Math.sin(a) * d, H * 0.009, 0, Math.PI * 2)
  }
  g.fill()
}

/* ------------------------------------------------------------------ layers */

/** far city: a long skyline of domes, towers and minarets */
export function drawSkyline(w = 2048, h = 360) {
  const { c, g } = mk(w, h)
  const r = rng(11)
  const base = h * 0.72
  g.fillRect(0, base, w, h - base)
  let x = -20
  while (x < w + 40) {
    const kind = r()
    const bw = 40 + r() * 90
    const bh = h * (0.08 + r() * 0.22)
    g.fillRect(x, base - bh, bw, bh + 2)
    if (kind < 0.45) {
      onion(g, x + bw / 2, base - bh, bw * (0.32 + r() * 0.12), bw * (0.6 + r() * 0.35))
      finial(g, x + bw / 2, base - bh - bw * 0.8, bw * 0.16)
    } else if (kind < 0.7) {
      minaret(g, x + bw * (0.2 + r() * 0.6), base - bh * 0.5, 9 + r() * 5, h * (0.3 + r() * 0.2), r)
    } else {
      // crenellated wall
      for (let k = 0; k < bw; k += 12) g.fillRect(x + k, base - bh - 8, 7, 9)
    }
    cut(g, () => {
      const nw = Math.floor(bw / 22)
      for (let k = 0; k < nw; k++) arch(g, x + 11 + k * 22, base - bh * 0.25, 7, 16)
    })
    x += bw + r() * 30
  }
  return c
}

/** the palace on its hill, with dunes */
export function drawPalace(w = 2048, h = 640) {
  const { c, g } = mk(w, h)
  const r = rng(23)
  dunes(g, w, h, h * 0.84, h * 0.06, 5)
  const cx = w * 0.61
  const by = h * 0.86
  g.save()
  g.translate(cx, by)
  g.scale(0.7, 0.7)
  g.translate(-cx, -by)
  // terrace and main hall
  g.fillRect(cx - 330, by - 40, 660, 60)
  g.fillRect(cx - 230, by - 190, 460, 160)
  // drum + great dome
  g.fillRect(cx - 105, by - 250, 210, 70)
  onion(g, cx, by - 248, 128, 250)
  finial(g, cx, by - 498, 40)
  // side domes on drums
  for (const s of [-1, 1]) {
    g.fillRect(cx + s * 175 - 45, by - 230, 90, 50)
    onion(g, cx + s * 175, by - 228, 58, 118)
    finial(g, cx + s * 175, by - 346, 22)
    minaret(g, cx + s * 300, by - 30, 26, 330, r)
    // outer pavilions
    g.fillRect(cx + s * 420 - 60, by - 110, 120, 110)
    onion(g, cx + s * 420, by - 110, 46, 90)
    finial(g, cx + s * 420, by - 200, 18)
  }
  // crenellations on the hall
  for (let k = -230; k < 230; k += 18) g.fillRect(cx + k, by - 202, 10, 14)
  cut(g, () => {
    // arcade of pointed arches + a big gate, round windows in the drum
    for (let k = -4; k <= 4; k++) if (k !== 0) arch(g, cx + k * 46, by - 50, 26, 92)
    arch(g, cx, by - 36, 62, 132)
    for (let k = -3; k <= 3; k++) {
      g.beginPath()
      g.arc(cx + k * 26, by - 215, 7, 0, Math.PI * 2)
      g.fill()
    }
    for (const s of [-1, 1]) {
      arch(g, cx + s * 420, by - 18, 30, 64)
      for (let k = -1; k <= 1; k++) arch(g, cx + s * 175 + k * 26, by - 186, 10, 30)
    }
    // lattice band on the great dome
    for (let k = -4; k <= 4; k++) {
      g.beginPath()
      g.arc(cx + k * 22, by - 300, 6, 0, Math.PI * 2)
      g.fill()
    }
  })
  g.restore()
  // a few palms on the far dunes
  palm(g, w * 0.18, h * 0.86, 210, 0.12, 3)
  palm(g, w * 0.24, h * 0.87, 160, -0.18, 4)
  palm(g, w * 0.9, h * 0.86, 190, -0.1, 6)
  return c
}

/** palm grove + dunes (mid layer) */
export function drawGrove(w = 2048, h = 640) {
  const { c, g } = mk(w, h)
  dunes(g, w, h, h * 0.9, h * 0.07, 9)
  palm(g, w * 0.06, h * 0.92, 470, 0.14, 21)
  palm(g, w * 0.13, h * 0.93, 360, -0.2, 22)
  palm(g, w * 0.21, h * 0.93, 300, 0.25, 26)
  palm(g, w * 0.79, h * 0.93, 330, 0.18, 23)
  palm(g, w * 0.87, h * 0.92, 450, -0.12, 24)
  palm(g, w * 0.95, h * 0.94, 300, 0.22, 25)
  // a small domed tomb between the palms
  g.fillRect(w * 0.33 - 40, h * 0.9 - 70, 80, 72)
  onion(g, w * 0.33, h * 0.9 - 70, 34, 70)
  finial(g, w * 0.33, h * 0.9 - 140, 14)
  cut(g, () => arch(g, w * 0.33, h * 0.9, 22, 46))
  return c
}

/** foreground: uneven ground with ornamental plants massed at the corners */
export function drawForeground(w = 2048, h = 480) {
  const { c, g } = mk(w, h)
  const r = rng(41)
  const gy = (x: number) => h * 0.86 - h * 0.05 * Math.sin((x / w) * 9 + 1) - h * 0.03 * Math.sin((x / w) * 23)
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 4) g.lineTo(x, gy(x))
  g.lineTo(w, h)
  g.fill()
  const dense = (u: number) => Math.max(0, 1 - Math.abs(u - 0.5) * 2.6) // 0 at the corners zone, 1 mid
  // grass blades everywhere (fewer in the middle)
  for (let i = 0; i < 360; i++) {
    const x = r() * w
    if (r() < dense(x / w) * 0.85) continue
    const y = gy(x) + 2
    const l = h * (0.05 + r() * 0.14) * (1 - dense(x / w) * 0.6)
    const bend = (r() - 0.5) * l * 0.8
    g.beginPath()
    g.moveTo(x - 2.4, y)
    g.quadraticCurveTo(x + bend * 0.3, y - l * 0.6, x + bend, y - l)
    g.quadraticCurveTo(x + bend * 0.3 + 1.5, y - l * 0.55, x + 2.4, y)
    g.fill()
  }
  // ornamental flowers: stem, curling leaves, a fan blossom
  const flower = (x: number, H: number, s: number) => {
    const y = gy(x)
    const top = [x + s * H * 0.12, y - H]
    g.lineWidth = Math.max(3, H * 0.022)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x - s * H * 0.1, y - H * 0.5, top[0], top[1])
    g.stroke()
    for (let k = 0; k < 3; k++) {
      const t = 0.3 + k * 0.2
      const lx = x - s * H * 0.06 * t
      const ly = y - H * t
      const d = k % 2 ? 1 : -1
      g.beginPath()
      g.moveTo(lx, ly)
      g.bezierCurveTo(lx + d * H * 0.14, ly - H * 0.14, lx + d * H * 0.3, ly - H * 0.02, lx + d * H * 0.24, ly + H * 0.08)
      g.bezierCurveTo(lx + d * H * 0.18, ly + H * 0.0, lx + d * H * 0.08, ly - H * 0.02, lx, ly)
      g.fill()
      // a tendril curl
      g.lineWidth = Math.max(2, H * 0.01)
      g.beginPath()
      const cx2 = lx + d * H * 0.24
      const cy2 = ly + H * 0.08
      g.moveTo(cx2, cy2)
      for (let a = 0; a < 8; a += 0.3) {
        const rr = H * 0.05 * (1 - a / 9)
        g.lineTo(cx2 + d * (rr * Math.cos(a) - H * 0.05), cy2 + rr * Math.sin(a))
      }
      g.stroke()
    }
    // fan blossom of petals
    for (let k = -3; k <= 3; k++) {
      const a = -Math.PI / 2 + k * 0.32
      const px = top[0] + Math.cos(a) * H * 0.13
      const py = top[1] + Math.sin(a) * H * 0.13
      g.beginPath()
      g.ellipse(px, py, H * 0.03, H * 0.08, a + Math.PI / 2, 0, Math.PI * 2)
      g.fill()
    }
    g.beginPath()
    g.arc(top[0], top[1], H * 0.05, 0, Math.PI * 2)
    g.fill()
    cut(g, () => {
      g.beginPath()
      g.arc(top[0], top[1], H * 0.022, 0, Math.PI * 2)
      g.fill()
    })
  }
  for (const [u, H, s] of [
    [0.03, 330, 1],
    [0.08, 250, -1],
    [0.14, 190, 1],
    [0.2, 120, -1],
    [0.8, 140, 1],
    [0.86, 230, -1],
    [0.92, 320, 1],
    [0.97, 210, -1],
  ] as const)
    flower(u * w, H, s)
  return c
}

/** a branch reaching in from the top edge with leaves and curls (hangs at the top right) */
export function drawVine(w = 768, h = 512) {
  const { c, g } = mk(w, h)
  const r = rng(77)
  g.lineWidth = 16
  g.beginPath()
  g.moveTo(w + 10, 30)
  g.bezierCurveTo(w * 0.7, 10, w * 0.45, 90, w * 0.12, 70)
  g.stroke()
  g.lineWidth = 9
  g.beginPath()
  g.moveTo(w * 0.62, 40)
  g.bezierCurveTo(w * 0.55, 140, w * 0.42, 210, w * 0.36, 300)
  g.stroke()
  const leaf = (x: number, y: number, a: number, l: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(a)
    g.beginPath()
    g.moveTo(0, 0)
    g.quadraticCurveTo(l * 0.5, -l * 0.28, l, 0)
    g.quadraticCurveTo(l * 0.5, l * 0.28, 0, 0)
    g.fill()
    g.restore()
  }
  for (let i = 0; i < 26; i++) {
    const t = i / 26
    const x = w * (1 - t * 0.85)
    const y = 30 + Math.sin(t * 3.2) * 30 + t * 30
    leaf(x, y, Math.PI / 2 + (r() - 0.5) * 1.2 + (i % 2 ? 0.6 : -0.6), 40 + r() * 34)
  }
  for (let i = 0; i < 12; i++) {
    const t = i / 12
    const x = w * (0.6 - t * 0.24)
    const y = 40 + t * 260
    leaf(x, y, (i % 2 ? 0.3 : Math.PI - 0.3) + (r() - 0.5) * 0.5, 30 + r() * 26)
  }
  // curls
  g.lineWidth = 4
  for (const [x, y, s] of [
    [w * 0.3, 80, 1],
    [w * 0.5, 60, -1],
    [w * 0.36, 300, 1],
    [w * 0.8, 50, -1],
  ] as const) {
    g.beginPath()
    for (let a = 0; a < 10; a += 0.2) {
      const rr = 26 * (1 - a / 11)
      const px = x + s * rr * Math.cos(a)
      const py = y + 26 + rr * Math.sin(a)
      if (a === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.stroke()
  }
  return c
}

/** pierced-metal lantern on its chain (pivot at the top centre) */
export function drawLantern(w = 160, h = 420) {
  const { c, g } = mk(w, h)
  const cx = w / 2
  g.lineWidth = 3
  for (let y = 0; y < 170; y += 14) {
    g.beginPath()
    g.ellipse(cx, y + 7, 3.5, 6.5, 0, 0, Math.PI * 2)
    g.stroke()
  }
  // cap, body (onion-ish), bottom drop
  onion(g, cx, 200, 34, 40)
  g.beginPath()
  g.moveTo(cx - 40, 196)
  g.bezierCurveTo(cx - 70, 240, cx - 62, 300, cx - 26, 330)
  g.lineTo(cx + 26, 330)
  g.bezierCurveTo(cx + 62, 300, cx + 70, 240, cx + 40, 196)
  g.closePath()
  g.fill()
  g.beginPath()
  g.moveTo(cx - 26, 328)
  g.quadraticCurveTo(cx, 360, cx, 400)
  g.quadraticCurveTo(cx, 360, cx + 26, 328)
  g.fill()
  g.beginPath()
  g.arc(cx, 404, 7, 0, Math.PI * 2)
  g.fill()
  cut(g, () => {
    for (let k = -1; k <= 1; k++) arch(g, cx + k * 26, 310, 13, 70)
    for (let k = -2; k <= 2; k++) {
      g.beginPath()
      g.arc(cx + k * 13, 222, 3.2, 0, Math.PI * 2)
      g.fill()
    }
  })
  return c
}

/** the flying carpet, flat, with a pierced border and tasselled ends */
export function drawCarpet(w = 640, h = 160) {
  const { c, g } = mk(w, h)
  const x0 = 46
  const x1 = w - 46
  const y0 = h * 0.3
  const y1 = h * 0.7
  g.fillRect(x0, y0, x1 - x0, y1 - y0)
  // tassels
  for (const [xe, d] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    for (let i = 0; i <= 8; i++) {
      const y = y0 + ((y1 - y0) * i) / 8
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(xe, y)
      g.lineTo(xe + d * 28, y + (i - 4) * 1.5)
      g.stroke()
      g.beginPath()
      g.ellipse(xe + d * 33, y + (i - 4) * 1.5, 6, 3.5, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  cut(g, () => {
    // border of small diamonds, a medallion and two eight-point stars
    for (let x = x0 + 16; x < x1 - 8; x += 18)
      for (const y of [y0 + 9, y1 - 9]) {
        g.beginPath()
        g.moveTo(x, y - 4.5)
        g.lineTo(x + 4.5, y)
        g.lineTo(x, y + 4.5)
        g.lineTo(x - 4.5, y)
        g.fill()
      }
    const cy = (y0 + y1) / 2
    const star = (sx: number, R: number, ri: number) => {
      g.beginPath()
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8
        const rr = i % 2 ? ri : R
        g.lineTo(sx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      }
      g.closePath()
      g.fill()
    }
    star(w / 2, 20, 11)
    star(w * 0.28, 13, 7)
    star(w * 0.72, 13, 7)
  })
  // keep the medallion's centre (a ring of paper with a dot)
  g.beginPath()
  g.arc(w / 2, (y0 + y1) / 2, 7, 0, Math.PI * 2)
  g.fill()
  return c
}

/** the prince seated cross-legged, facing right (no near arm, no cape) */
export function drawRider(w = 400, h = 500) {
  const { c, g } = mk(w, h)
  const cx = w * 0.46
  // crossed legs / lap: a long rounded lump with the knee forward
  g.beginPath()
  g.moveTo(cx - w * 0.3, h * 0.985)
  g.bezierCurveTo(cx - w * 0.34, h * 0.86, cx - w * 0.1, h * 0.82, cx + w * 0.14, h * 0.84)
  g.bezierCurveTo(cx + w * 0.32, h * 0.83, cx + w * 0.4, h * 0.9, cx + w * 0.36, h * 0.985)
  g.closePath()
  g.fill()
  // slipper with a curled toe
  g.beginPath()
  g.moveTo(cx + w * 0.3, h * 0.985)
  g.quadraticCurveTo(cx + w * 0.46, h * 0.99, cx + w * 0.5, h * 0.9)
  g.quadraticCurveTo(cx + w * 0.47, h * 0.95, cx + w * 0.33, h * 0.93)
  g.fill()
  // torso, leaning a little forward
  g.beginPath()
  g.moveTo(cx - w * 0.22, h * 0.9)
  g.bezierCurveTo(cx - w * 0.21, h * 0.72, cx - w * 0.13, h * 0.55, cx - w * 0.05, h * 0.47)
  g.lineTo(cx + w * 0.11, h * 0.46)
  g.bezierCurveTo(cx + w * 0.19, h * 0.56, cx + w * 0.2, h * 0.7, cx + w * 0.22, h * 0.86)
  g.closePath()
  g.fill()
  // scimitar hanging from the sash
  g.lineWidth = 9
  g.beginPath()
  g.moveTo(cx - w * 0.12, h * 0.72)
  g.quadraticCurveTo(cx - w * 0.36, h * 0.8, cx - w * 0.46, h * 0.68)
  g.stroke()
  g.fillRect(cx - w * 0.16, h * 0.69, w * 0.1, h * 0.02)
  // neck and head in profile
  g.fillRect(cx - w * 0.02, h * 0.38, w * 0.08, h * 0.1)
  g.beginPath()
  g.ellipse(cx + w * 0.03, h * 0.335, w * 0.085, h * 0.072, 0.15, 0, Math.PI * 2)
  g.fill()
  // nose and a pointed beard
  g.beginPath()
  g.moveTo(cx + w * 0.1, h * 0.31)
  g.lineTo(cx + w * 0.155, h * 0.35)
  g.lineTo(cx + w * 0.1, h * 0.36)
  g.fill()
  g.beginPath()
  g.moveTo(cx + w * 0.1, h * 0.37)
  g.quadraticCurveTo(cx + w * 0.12, h * 0.43, cx + w * 0.06, h * 0.475)
  g.lineTo(cx - w * 0.0, h * 0.4)
  g.fill()
  // turban: a big wrapped bulb, a pointed top, a jewel and a plume
  g.beginPath()
  g.ellipse(cx + w * 0.02, h * 0.255, w * 0.13, h * 0.085, -0.12, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(cx - w * 0.06, h * 0.2)
  g.quadraticCurveTo(cx - w * 0.01, h * 0.1, cx + w * 0.05, h * 0.18)
  g.fill()
  // plume: a curved feather with barbs, sweeping back
  const P = [
    [cx - w * 0.03, h * 0.19],
    [cx - w * 0.06, h * 0.06],
    [cx - w * 0.2, h * 0.02],
    [cx - w * 0.34, h * 0.07],
  ]
  g.lineWidth = 6
  g.beginPath()
  g.moveTo(P[0][0], P[0][1])
  g.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1])
  g.stroke()
  for (let i = 1; i < 14; i++) {
    const t = i / 14
    const it = 1 - t
    const k0 = it * it * it
    const k1 = 3 * it * it * t
    const k2 = 3 * it * t * t
    const k3 = t * t * t
    const x = k0 * P[0][0] + k1 * P[1][0] + k2 * P[2][0] + k3 * P[3][0]
    const y = k0 * P[0][1] + k1 * P[1][1] + k2 * P[2][1] + k3 * P[3][1]
    const l = 18 * Math.sin(Math.PI * (0.25 + t * 0.75))
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x - l * 0.5, y - l)
    g.stroke()
  }
  cut(g, () => {
    // eye, turban folds and jewel, a column of buttons, the sash
    g.beginPath()
    g.arc(cx + w * 0.07, h * 0.32, 4.5, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = 4
    for (let k = 0; k < 3; k++) {
      g.beginPath()
      g.ellipse(cx + w * 0.02, h * 0.262 + k * 11, w * 0.11, h * 0.024, -0.15, Math.PI * 0.12, Math.PI * 0.88)
      g.stroke()
    }
    g.beginPath()
    g.arc(cx + w * 0.02, h * 0.215, 6, 0, Math.PI * 2)
    g.fill()
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.arc(cx + w * 0.085, h * 0.52 + k * 20, 4.5, 0, Math.PI * 2)
      g.fill()
    }
    g.fillRect(cx - w * 0.17, h * 0.655, w * 0.36, 6)
  })
  return c
}

/** his near arm, pointing; pivot at the shoulder (left middle) */
export function drawArm(w = 220, h = 70) {
  const { c, g } = mk(w, h)
  const y = h / 2
  g.beginPath()
  g.moveTo(8, y - 13)
  g.quadraticCurveTo(w * 0.45, y - 16, w * 0.72, y - 7)
  g.lineTo(w * 0.72, y + 7)
  g.quadraticCurveTo(w * 0.45, y + 18, 8, y + 14)
  g.closePath()
  g.fill()
  // sleeve cuff and a pointing hand
  g.fillRect(w * 0.66, y - 10, 12, 20)
  g.beginPath()
  g.moveTo(w * 0.72, y - 8)
  g.lineTo(w * 0.97, y - 4)
  g.lineTo(w * 0.97, y + 1)
  g.lineTo(w * 0.84, y + 2)
  g.lineTo(w * 0.85, y + 9)
  g.lineTo(w * 0.72, y + 8)
  g.closePath()
  g.fill()
  g.beginPath()
  g.arc(10, y, 15, 0, Math.PI * 2)
  g.fill()
  return c
}

/** cloak streaming behind (pivot at the right middle) */
export function drawCloak(w = 260, h = 200) {
  const { c, g } = mk(w, h)
  g.beginPath()
  g.moveTo(w, h * 0.2)
  g.bezierCurveTo(w * 0.6, h * 0.15, w * 0.3, h * 0.3, 0, h * 0.42)
  // scalloped trailing edge
  const n = 6
  for (let i = 0; i < n; i++) {
    const x = (i / n) * w * 0.55
    const y = h * (0.42 + (i / n) * 0.35)
    g.quadraticCurveTo(x + w * 0.02, y + h * 0.12, x + w * 0.09, y + h * 0.06)
  }
  g.bezierCurveTo(w * 0.7, h * 0.85, w * 0.85, h * 0.7, w, h * 0.62)
  g.closePath()
  g.fill()
  cut(g, () => {
    for (let k = 0; k < 7; k++) {
      g.beginPath()
      g.arc(w * (0.2 + k * 0.1), h * (0.5 + k * 0.01), 3.5, 0, Math.PI * 2)
      g.fill()
    }
  })
  return c
}

/** winged horse, galloping to the left (wings are separate) */
export function drawHorse(w = 520, h = 340) {
  const { c, g } = mk(w, h)
  // body
  g.beginPath()
  g.ellipse(w * 0.52, h * 0.5, w * 0.22, h * 0.13, -0.08, 0, Math.PI * 2)
  g.fill()
  // neck + head (to the left, raised)
  g.beginPath()
  g.moveTo(w * 0.38, h * 0.42)
  g.bezierCurveTo(w * 0.3, h * 0.3, w * 0.27, h * 0.2, w * 0.24, h * 0.12)
  g.lineTo(w * 0.1, h * 0.2)
  g.quadraticCurveTo(w * 0.06, h * 0.24, w * 0.09, h * 0.27)
  g.lineTo(w * 0.2, h * 0.27)
  g.bezierCurveTo(w * 0.24, h * 0.36, w * 0.3, h * 0.5, w * 0.36, h * 0.58)
  g.closePath()
  g.fill()
  // ears
  g.beginPath()
  g.moveTo(w * 0.22, h * 0.13)
  g.lineTo(w * 0.24, h * 0.03)
  g.lineTo(w * 0.27, h * 0.13)
  g.fill()
  // mane: a row of flame-like locks along the neck
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const x = w * (0.26 + t * 0.13)
    const y = h * (0.14 + t * 0.26)
    g.beginPath()
    g.moveTo(x - 6, y)
    g.quadraticCurveTo(x + 14, y - 10, x + 22, y + 4)
    g.quadraticCurveTo(x + 10, y + 2, x + 4, y + 10)
    g.fill()
  }
  // legs: front pair stretched forward, hind pair back (flying gallop)
  const leg = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    g.lineWidth = 11
    g.beginPath()
    g.moveTo(x0, y0)
    g.quadraticCurveTo(x1, y1, x2, y2)
    g.stroke()
    g.beginPath()
    g.ellipse(x2, y2, 8, 6, 0, 0, Math.PI * 2)
    g.fill()
  }
  leg(w * 0.36, h * 0.56, w * 0.24, h * 0.6, w * 0.13, h * 0.52)
  leg(w * 0.4, h * 0.58, w * 0.3, h * 0.72, w * 0.18, h * 0.7)
  leg(w * 0.66, h * 0.56, w * 0.76, h * 0.7, w * 0.88, h * 0.72)
  leg(w * 0.62, h * 0.58, w * 0.7, h * 0.78, w * 0.82, h * 0.86)
  // tail: streaming curls
  g.lineWidth = 7
  for (let k = 0; k < 4; k++) {
    g.beginPath()
    g.moveTo(w * 0.72, h * 0.44)
    g.bezierCurveTo(w * 0.82, h * (0.36 + k * 0.04), w * 0.9, h * (0.42 + k * 0.06), w * (0.97 - k * 0.02), h * (0.36 + k * 0.08))
    g.stroke()
  }
  cut(g, () => {
    g.beginPath()
    g.arc(w * 0.2, h * 0.17, 4, 0, Math.PI * 2)
    g.fill()
    // saddle cloth eyelets
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.arc(w * (0.46 + k * 0.035), h * 0.52, 3.5, 0, Math.PI * 2)
      g.fill()
    }
  })
  return c
}

/** one feathered wing; pivot at the bottom-left (shoulder) */
export function drawWing(w = 300, h = 220) {
  const { c, g } = mk(w, h)
  g.beginPath()
  g.moveTo(0, h)
  g.bezierCurveTo(w * 0.15, h * 0.55, w * 0.45, h * 0.15, w, 0)
  // feather tips along the trailing edge
  const n = 9
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const x = w * (1 - t) * 0.95
    const y = h * 0.12 + t * h * 0.88
    g.quadraticCurveTo(x + w * 0.1, y - h * 0.02, x + w * 0.02, y + h * 0.06)
    g.lineTo(x, y + h * 0.02)
  }
  g.closePath()
  g.fill()
  cut(g, () => {
    g.lineWidth = 2
    for (let i = 1; i < n; i++) {
      const t = i / n
      g.beginPath()
      g.moveTo(w * 0.1 + t * w * 0.2, h * (0.9 - t * 0.4))
      g.lineTo(w * (1 - t) * 0.95 + w * 0.06, h * 0.12 + t * h * 0.88)
      g.stroke()
    }
  })
  return c
}

/** a bird with raised wings (flap by scaling y) */
export function drawBird(w = 160, h = 80) {
  const { c, g } = mk(w, h)
  const cx = w / 2
  const cy = h * 0.62
  g.beginPath()
  g.ellipse(cx, cy, w * 0.13, h * 0.08, 0, 0, Math.PI * 2)
  g.fill()
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(cx, cy)
    g.quadraticCurveTo(cx + s * w * 0.2, h * 0.1, cx + s * w * 0.48, h * 0.16)
    g.quadraticCurveTo(cx + s * w * 0.3, h * 0.3, cx + s * w * 0.06, cy + h * 0.06)
    g.fill()
  }
  g.beginPath()
  g.moveTo(cx + w * 0.12, cy - 2)
  g.lineTo(cx + w * 0.2, cy + 1)
  g.lineTo(cx + w * 0.12, cy + 4)
  g.fill()
  return c
}
