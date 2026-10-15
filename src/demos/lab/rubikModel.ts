/**
 * Exact 3×3×3 cube model. Every cubie has an integer position in {-1,0,1}³ and an integer rotation
 * (columns = where its local x / y / z axes point now). A move turns one layer by q quarter turns
 * (positive = counter-clockwise looking down the +axis), so the state never drifts.
 *
 * Face ids: 0 +x (R), 1 −x (L), 2 +y (U), 3 −y (D), 4 +z (F), 5 −z (B).
 */

export type V3 = [number, number, number]
export type Cubie = { home: V3; pos: V3; rot: [V3, V3, V3]; stickers: number[] }
export type Move = { axis: 0 | 1 | 2; layer: number; q: 1 | 2 | 3 }

// R red · L orange · U white · D yellow · F green · B blue
export const FACE_HEX = ['#e42d33', '#ff7f1f', '#f6f5ef', '#ffd02e', '#13a85c', '#1d63e3']

export function makeCube(): Cubie[] {
  const out: Cubie[] = []
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue
        const stickers: number[] = []
        if (x) stickers.push(x > 0 ? 0 : 1)
        if (y) stickers.push(y > 0 ? 2 : 3)
        if (z) stickers.push(z > 0 ? 4 : 5)
        out.push({
          home: [x, y, z],
          pos: [x, y, z],
          rot: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          stickers,
        })
      }
  return out
}

function rot90(v: V3, axis: number): V3 {
  const [x, y, z] = v
  if (axis === 0) return [x, -z, y]
  if (axis === 1) return [z, y, -x]
  return [-y, x, z]
}

function rotQ(v: V3, axis: number, q: number): V3 {
  let r = v
  for (let i = 0; i < q; i++) r = rot90(r, axis)
  return r
}

export function applyMove(cubies: Cubie[], m: Move) {
  for (const c of cubies) {
    if (c.pos[m.axis] !== m.layer) continue
    c.pos = rotQ(c.pos, m.axis, m.q)
    c.rot = [rotQ(c.rot[0], m.axis, m.q), rotQ(c.rot[1], m.axis, m.q), rotQ(c.rot[2], m.axis, m.q)]
  }
}

const faceOf = (n: V3) => (n[0] ? (n[0] > 0 ? 0 : 1) : n[1] ? (n[1] > 0 ? 2 : 3) : n[2] > 0 ? 4 : 5)

/** sticker colours per face (6 × 9, reading order as seen from outside with U on top) */
export function facelets(cubies: Cubie[]): number[][] {
  const f = Array.from({ length: 6 }, () => new Array<number>(9).fill(-1))
  for (const c of cubies) {
    for (const s of c.stickers) {
      const axis = s >> 1
      const sign = s & 1 ? -1 : 1
      const col = c.rot[axis]
      const n: V3 = [col[0] * sign, col[1] * sign, col[2] * sign]
      const face = faceOf(n)
      const [x, y, z] = c.pos
      let r = 0
      let k = 0
      switch (face) {
        case 2: // U
          k = x + 1
          r = z + 1
          break
        case 3: // D
          k = x + 1
          r = 1 - z
          break
        case 4: // F
          k = x + 1
          r = 1 - y
          break
        case 5: // B
          k = 1 - x
          r = 1 - y
          break
        case 0: // R
          k = 1 - z
          r = 1 - y
          break
        default: // L
          k = z + 1
          r = 1 - y
      }
      f[face][r * 3 + k] = s
    }
  }
  return f
}

export function isSolved(cubies: Cubie[]) {
  return facelets(cubies).every((face) => face.every((c) => c === face[0]))
}

/** push with cancellation: merges with an earlier move on the same layer across commuting same-axis moves */
export function pushHistory(h: Move[], m: Move) {
  for (let i = h.length - 1; i >= 0 && h[i].axis === m.axis; i--) {
    if (h[i].layer !== m.layer) continue
    const q = (h[i].q + m.q) % 4
    if (q === 0) h.splice(i, 1)
    else h[i] = { ...h[i], q: q as 1 | 2 | 3 }
    return
  }
  h.push(m)
}

/** random face-turn scramble, no two consecutive moves on the same axis */
export function randomScramble(n: number, seed?: number): Move[] {
  let s = seed ?? Math.floor(Math.random() * 2147483646) + 1
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const out: Move[] = []
  let last = -1
  while (out.length < n) {
    const axis = Math.floor(rnd() * 3) as 0 | 1 | 2
    if (axis === last) continue
    last = axis
    out.push({ axis, layer: rnd() < 0.5 ? -1 : 1, q: (1 + Math.floor(rnd() * 3)) as 1 | 2 | 3 })
  }
  return out
}

const NAMES = [
  ['L', 'M', 'R'],
  ['D', 'E', 'U'],
  ['B', 'S', 'F'],
]
// angle sign that reads as "clockwise" for that layer's letter
const CW = [
  [1, 1, -1],
  [1, 1, -1],
  [1, -1, -1],
]

/** standard notation (R, U', F2, M …) */
export function moveName(m: Move) {
  const name = NAMES[m.axis][m.layer + 1]
  if (m.q === 2) return name + '2'
  const signed = m.q === 1 ? 1 : -1
  return signed === CW[m.axis][m.layer + 1] ? name : name + "'"
}
