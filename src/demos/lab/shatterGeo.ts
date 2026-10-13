import * as THREE from 'three'

/* Panel dimensions (world units) and the Voronoi fracture that turns it into extruded shards. */

export const PW = 3.0
export const PH = 3.9
export const PT = 0.12
export const PR = 0.26

export type V2 = [number, number]

export function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** signed distance to the rounded panel outline (negative inside) */
export function sdPanel(x: number, y: number) {
  const qx = Math.abs(x) - (PW / 2 - PR)
  const qy = Math.abs(y) - (PH / 2 - PR)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PR
}

/** convex CCW outline of the rounded rect */
export function outline(seg = 7): V2[] {
  const pts: V2[] = []
  const cx = PW / 2 - PR
  const cy = PH / 2 - PR
  const corners: [number, number, number][] = [
    [cx, -cy, -Math.PI / 2],
    [cx, cy, 0],
    [-cx, cy, Math.PI / 2],
    [-cx, -cy, Math.PI],
  ]
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push([x + Math.cos(a) * PR, y + Math.sin(a) * PR])
    }
  }
  return pts
}

/** Sutherland–Hodgman: keep the part of `poly` where n·p <= d */
function clip(poly: V2[], nx: number, ny: number, d: number): V2[] {
  const out: V2[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const da = nx * a[0] + ny * a[1] - d
    const db = nx * b[0] + ny * b[1] - d
    if (da <= 0) out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  // drop (near-)duplicate vertices — degenerate input upsets the convex-hull builder
  const clean: V2[] = []
  for (const p of out) {
    const q = clean[clean.length - 1]
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 2e-4) clean.push(p)
  }
  while (clean.length > 1 && Math.hypot(clean[0][0] - clean[clean.length - 1][0], clean[0][1] - clean[clean.length - 1][1]) <= 2e-4) clean.pop()
  return clean
}

function centroid(poly: V2[]): { c: V2; area: number } {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % poly.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  a *= 0.5
  if (Math.abs(a) < 1e-9) return { c: poly[0], area: 0 }
  return { c: [cx / (6 * a), cy / (6 * a)], area: a }
}

/** seed points: dense around the impact, sparse elsewhere */
function seeds(impact: V2, n: number, rnd: () => number): V2[] {
  const pts: V2[] = []
  const [ix, iy] = impact
  // a tight ring of tiny cells right at the impact
  const ring = Math.max(4, Math.round(n * 0.14))
  const a0 = rnd() * Math.PI * 2
  for (let i = 0; i < ring; i++) {
    const a = a0 + (i / ring) * Math.PI * 2 + (rnd() - 0.5) * 0.4
    const r = 0.09 + rnd() * 0.08
    const x = ix + Math.cos(a) * r
    const y = iy + Math.sin(a) * r
    if (sdPanel(x, y) < -0.03) pts.push([x, y])
  }
  let tries = 0
  while (pts.length < n && tries < n * 120) {
    tries++
    let x: number
    let y: number
    if (rnd() < 0.74) {
      const a = rnd() * Math.PI * 2
      const r = 0.12 + Math.pow(rnd(), 1.55) * 3.1
      x = ix + Math.cos(a) * r
      y = iy + Math.sin(a) * r * 1.15
    } else {
      x = (rnd() - 0.5) * PW
      y = (rnd() - 0.5) * PH
    }
    if (sdPanel(x, y) > -0.05) continue
    const d = Math.hypot(x - ix, y - iy)
    const minD = 0.07 + d * 0.16
    let ok = true
    for (const p of pts) {
      if (Math.hypot(p[0] - x, p[1] - y) < minD) {
        ok = false
        break
      }
    }
    if (ok) pts.push([x, y])
  }
  return pts
}

/** extrude a convex polygon (panel coords) into a slab; vertices relative to `c`; caps get panel UVs */
export function extrude(poly: V2[], c: V2): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const t = PT / 2
  const n = poly.length
  const U = (x: number) => x / PW + 0.5
  const V = (y: number) => y / PH + 0.5
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number) => {
    pos.push(x - c[0], y - c[1], z)
    nor.push(nx, ny, nz)
    uv.push(u, v)
  }
  // front + back caps (group 0)
  for (let k = 1; k < n - 1; k++) {
    for (const p of [poly[0], poly[k], poly[k + 1]]) push(p[0], p[1], t, 0, 0, 1, U(p[0]), V(p[1]))
  }
  for (let k = 1; k < n - 1; k++) {
    for (const p of [poly[0], poly[k + 1], poly[k]]) push(p[0], p[1], -t, 0, 0, -1, U(p[0]), V(p[1]))
  }
  const capCount = pos.length / 3
  // side walls (group 1)
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    let nx = b[1] - a[1]
    let ny = -(b[0] - a[0])
    const l = Math.hypot(nx, ny) || 1
    nx /= l
    ny /= l
    const ua = U(a[0])
    const ub = U(b[0])
    push(a[0], a[1], t, nx, ny, 0, ua, 1)
    push(a[0], a[1], -t, nx, ny, 0, ua, 0)
    push(b[0], b[1], -t, nx, ny, 0, ub, 0)
    push(a[0], a[1], t, nx, ny, 0, ua, 1)
    push(b[0], b[1], -t, nx, ny, 0, ub, 0)
    push(b[0], b[1], t, nx, ny, 0, ub, 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.addGroup(0, capCount, 0)
  g.addGroup(capCount, pos.length / 3 - capCount, 1)
  g.computeBoundingSphere()
  return g
}

export type Shard = {
  geo: THREE.BufferGeometry
  hull: Float32Array
  /** radius of a ball collider to use instead of the hull for slivers */
  ball: number
  c: V2 // centroid in panel coords
  d: number // distance from impact
  dir: V2 // unit direction away from impact
  area: number
  r1: number
  r2: number
  r3: number
}

export type Fracture = { shards: Shard[]; cracks: THREE.BufferGeometry; maxD: number }

export function fracture(impact: V2, n: number, seed: number): Fracture {
  const rnd = mulberry32(seed)
  const base = outline()
  const pts = seeds(impact, n, rnd)
  const shards: Shard[] = []
  const cracks: number[] = []
  const crackD: number[] = []
  const crackS: number[] = []
  const seen = new Set<string>()
  let maxD = 0
  const key = (x: number, y: number) => `${Math.round(x * 500)},${Math.round(y * 500)}`

  for (let i = 0; i < pts.length; i++) {
    const [sx, sy] = pts[i]
    let poly = base
    for (let j = 0; j < pts.length && poly.length >= 3; j++) {
      if (j === i) continue
      const [tx, ty] = pts[j]
      const nx = tx - sx
      const ny = ty - sy
      // quick reject: the bisector can't touch the cell if it is beyond the farthest vertex
      const d = (nx * (sx + tx) + ny * (sy + ty)) / 2
      poly = clip(poly, nx, ny, d)
    }
    if (poly.length < 3) continue
    const { c, area } = centroid(poly)
    if (area < 1e-5) continue
    const dx = c[0] - impact[0]
    const dy = c[1] - impact[1]
    const dist = Math.hypot(dx, dy)
    maxD = Math.max(maxD, dist)
    // collider hull: shrink slightly so neighbours don't start in contact
    const hull = new Float32Array(poly.length * 6)
    poly.forEach((p, k) => {
      const x = (p[0] - c[0]) * 0.94
      const y = (p[1] - c[1]) * 0.94
      hull.set([x, y, PT * 0.46, x, y, -PT * 0.46], k * 6)
    })
    let minR = Infinity
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]
      const b = poly[(k + 1) % poly.length]
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const el = Math.hypot(ex, ey) || 1
      minR = Math.min(minR, Math.abs((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / el)
    }
    shards.push({
      geo: extrude(poly, c),
      hull,
      ball: minR < 0.03 || area < 0.004 ? Math.max(0.03, Math.sqrt(area / Math.PI)) : 0,
      c,
      d: dist,
      dir: dist > 1e-4 ? [dx / dist, dy / dist] : [0, 1],
      area,
      r1: rnd(),
      r2: rnd(),
      r3: rnd(),
    })
    // crack segments = interior edges, each once
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k]
      const b = poly[(k + 1) % poly.length]
      const mx = (a[0] + b[0]) / 2
      const my = (a[1] + b[1]) / 2
      if (sdPanel(mx, my) > -0.012) continue
      const ka = key(a[0], a[1])
      const kb = key(b[0], b[1])
      const kk = ka < kb ? ka + '|' + kb : kb + '|' + ka
      if (seen.has(kk)) continue
      seen.add(kk)
      const ex = b[0] - a[0]
      const ey = b[1] - a[1]
      const el = Math.hypot(ex, ey) || 1
      const da = Math.hypot(a[0] - impact[0], a[1] - impact[1])
      const db = Math.hypot(b[0] - impact[0], b[1] - impact[1])
      const wa = THREE.MathUtils.lerp(0.026, 0.008, Math.min(1, da / 2.2))
      const wb = THREE.MathUtils.lerp(0.026, 0.008, Math.min(1, db / 2.2))
      const px = -ey / el
      const py = ex / el
      const quad: [number, number, number, number][] = [
        [a[0] + px * wa, a[1] + py * wa, da, 1],
        [a[0] - px * wa, a[1] - py * wa, da, -1],
        [b[0] - px * wb, b[1] - py * wb, db, -1],
        [a[0] + px * wa, a[1] + py * wa, da, 1],
        [b[0] - px * wb, b[1] - py * wb, db, -1],
        [b[0] + px * wb, b[1] + py * wb, db, 1],
      ]
      for (const [x, y, d, s] of quad) {
        cracks.push(x, y, 0)
        crackD.push(d)
        crackS.push(s)
      }
    }
  }
  const cg = new THREE.BufferGeometry()
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cracks, 3))
  cg.setAttribute('aD', new THREE.Float32BufferAttribute(crackD, 1))
  cg.setAttribute('aS', new THREE.Float32BufferAttribute(crackS, 1))
  cg.computeBoundingSphere()
  return { shards, cracks: cg, maxD: Math.max(maxD, 0.5) }
}

/** the intact panel: the whole outline extruded with the same UV mapping as the shards */
export function panelGeometry() {
  return extrude(outline(), [0, 0])
}
