import * as THREE from 'three'

/* Procedural geometry + textures for the configurator headphone. Product space: ear-cup axis = x,
   headband over +y, the visitor looks along −z. */

export const CUP_X = 1.0 // inner rim of the shell
export const CUP_Y = -0.35
export const YOKE_X = 1.2
export const YOKE_R = 0.8
export const BAND_Y = 0.95

/** sweep a closed 2D profile (u → in-plane normal, v → z) along a planar xy curve */
export function sweepPlanar(
  path: (t: number) => [number, number],
  profile: [number, number][],
  segs: number,
  scale: (t: number) => number = () => 1,
  uRepeat = 6,
) {
  const m = profile.length
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const [x, y] = path(t)
    const e = 1e-3
    const [xa, ya] = path(Math.max(0, t - e))
    const [xb, yb] = path(Math.min(1, t + e))
    let tx = xb - xa
    let ty = yb - ya
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const nx = -ty
    const ny = tx
    const s = scale(t)
    for (let k = 0; k <= m; k++) {
      const [u, v] = profile[k % m]
      pos.push(x + nx * u * s, y + ny * u * s, v * Math.max(s, 0.35))
      uv.push(t * uRepeat, k / m)
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < m; k++) {
      const a = i * (m + 1) + k
      const b = a + m + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** rounded-rect cross-section, CCW, centred */
export function roundedProfile(w: number, h: number, r: number, seg = 6): [number, number][] {
  const pts: [number, number][] = []
  const cx = w / 2 - r
  const cy = h / 2 - r
  const corners: [number, number, number][] = [
    [cx, -cy, -Math.PI / 2],
    [cx, cy, 0],
    [-cx, cy, Math.PI / 2],
    [-cx, -cy, Math.PI],
  ]
  for (const [x, y, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
    }
  }
  return pts
}

export function headbandGeo() {
  // u = thickness (radial), v = width (z)
  const prof = roundedProfile(0.085, 0.4, 0.04).map(([a, b]) => [a, b] as [number, number])
  return sweepPlanar((t) => {
    const a = Math.PI * (1 - t)
    return [YOKE_X * Math.cos(a), BAND_Y + 1.0 * Math.sin(a)]
  }, prof, 96)
}

export function bandPadGeo() {
  const prof = roundedProfile(0.13, 0.34, 0.06)
  return sweepPlanar(
    (t) => {
      const a = Math.PI * (0.74 - t * 0.48)
      return [1.07 * Math.cos(a), BAND_Y - 0.02 + 0.88 * Math.sin(a)]
    },
    prof,
    64,
    (t) => Math.pow(Math.sin(Math.PI * t), 0.3),
    4,
  )
}

export function cupGeo() {
  // lathe around +y (→ rotated onto x); h=0 is the inner rim, h≈0.37 the outer face
  const pts: THREE.Vector2[] = []
  const N = 28
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // rim → bulge → flat outer face
    const a = t * Math.PI * 0.5
    const r = 0.6 + 0.06 * Math.sin(t * Math.PI) - 0.12 * Math.pow(t, 3)
    const h = 0.34 * Math.sin(a)
    pts.push(new THREE.Vector2(r, h))
  }
  // round over onto the face
  const last = pts[pts.length - 1]
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2)
    pts.push(new THREE.Vector2(last.x - 0.035 * Math.sin(a), last.y + 0.03 * Math.sin(a) - 0.0))
  }
  pts.push(new THREE.Vector2(0.001, pts[pts.length - 1].y + 0.004))
  pts.unshift(new THREE.Vector2(0.56, 0.0))
  return new THREE.LatheGeometry(pts, 72)
}

export function yokeGeo() {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * i) / 40
    pts.push(new THREE.Vector3(0, YOKE_R * Math.sin(a), YOKE_R * Math.cos(a)))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.048, 14, false)
}

export function cableGeo() {
  const pts = [
    [-1.12, -1.0, 0.12],
    [-1.2, -1.35, 0.3],
    [-1.02, -1.72, 0.55],
    [-0.5, -1.86, 0.62],
    [0.02, -1.74, 0.48],
    [0.2, -1.5, 0.3],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  return { geo: new THREE.TubeGeometry(curve, 96, 0.026, 10, false), curve }
}

/* ------------------------------------------------------------------ textures */

/** tiling pebble-grain normal map (Worley F2−F1 creases) */
export function leatherNormal(size = 256, cells = 18, seed = 3) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const px = new Float32Array(cells * cells)
  const py = new Float32Array(cells * cells)
  for (let i = 0; i < cells * cells; i++) {
    px[i] = rnd()
    py[i] = rnd()
  }
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells
      const fy = (y / size) * cells
      const cx = Math.floor(fx)
      const cy = Math.floor(fy)
      let f1 = 9
      let f2 = 9
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = cx + i
          const gy = cy + j
          const wx = ((gx % cells) + cells) % cells
          const wy = ((gy % cells) + cells) % cells
          const k = wy * cells + wx
          const dx = gx + px[k] - fx
          const dy = gy + py[k] - fy
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < f1) {
            f2 = f1
            f1 = d
          } else if (d < f2) f2 = d
        }
      }
      h[y * size + x] = Math.min(1, (f2 - f1) * 3.2)
    }
  }
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2
      const dy = (H(x, y + 1) - H(x, y - 1)) * 2.2
      const l = Math.hypot(dx, dy, 1)
      const o = (y * size + x) * 4
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255
      img.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255
      img.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}

/** white-on-black logo mark for the outer plate (used as alphaMap) */
export function logoTexture() {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, S, S)
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  // concentric ring
  g.lineWidth = 6
  g.beginPath()
  g.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2)
  g.stroke()
  // the mark: two arcs (sound waves) + dot
  g.lineCap = 'round'
  g.lineWidth = 16
  for (const r of [56, 96]) {
    g.beginPath()
    g.arc(S / 2 - 40, S / 2 - 26, r, -Math.PI * 0.32, Math.PI * 0.32)
    g.stroke()
  }
  g.beginPath()
  g.arc(S / 2 - 40, S / 2 - 26, 18, 0, Math.PI * 2)
  g.fill()
  g.font = `700 54px "Segoe UI", "SF Pro Display", system-ui, sans-serif`
  g.textAlign = 'center'
  ;(g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '14px'
  g.fillText('AURA', S / 2 + 7, S * 0.76)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}
