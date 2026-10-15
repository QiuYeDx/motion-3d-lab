import * as THREE from 'three'

/* Procedural canvas textures for 篝火. Built lazily (after mount, one per frame) so the first frame stays cheap. */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  else t.wrapS = THREE.RepeatWrapping
  return t
}

/** bark along the log (canvas x = around, y = along; top = the end that sits in the fire), charred + cracked near the top */
export function makeBark() {
  const W = 256
  const H = 512
  const R = rng(7)
  const [c, g] = canvas(W, H)
  const [e, ge] = canvas(W, H)
  g.fillStyle = '#4b3527'
  g.fillRect(0, 0, W, H)
  // furrows running along the log
  for (let i = 0; i < 160; i++) {
    const x = R() * W
    const w = 1 + R() * 4
    const l = R() < 0.5 ? '#2c1f17' : '#6a4d38'
    g.strokeStyle = l
    g.globalAlpha = 0.35 + R() * 0.45
    g.lineWidth = w
    g.beginPath()
    let xx = x
    g.moveTo(xx, 0)
    for (let y = 0; y <= H; y += 24) {
      xx += (R() - 0.5) * 6
      g.lineTo(xx, y)
    }
    g.stroke()
  }
  g.globalAlpha = 1
  // char: black towards the fire end, with a ragged boundary
  const grad = g.createLinearGradient(0, 0, 0, H * 0.5)
  grad.addColorStop(0, 'rgba(10,8,7,1)')
  grad.addColorStop(0.55, 'rgba(18,13,10,0.95)')
  grad.addColorStop(1, 'rgba(25,18,14,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H * 0.5)
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, W, H)
  // alligator cracks in the char: short horizontal + vertical segments, glowing in the emissive map
  ge.shadowColor = '#ff7a20'
  for (let i = 0; i < 260; i++) {
    const y = Math.pow(R(), 1.6) * H * 0.42
    const x = R() * W
    const heat = 1 - y / (H * 0.42)
    const horiz = R() < 0.55
    const len = 6 + R() * 18
    g.strokeStyle = '#050403'
    g.lineWidth = 1.5 + R() * 1.5
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(horiz ? x + len : x + (R() - 0.5) * 3, horiz ? y + (R() - 0.5) * 3 : y + len)
    g.stroke()
    const hot = Math.floor(150 + 105 * heat)
    ge.strokeStyle = `rgb(${hot}, ${Math.floor(hot * 0.42 * heat + 20)}, 10)`
    ge.globalAlpha = 0.35 + 0.65 * heat
    ge.shadowBlur = 6
    ge.lineWidth = 1 + R() * 1.6
    ge.beginPath()
    ge.moveTo(x, y)
    ge.lineTo(horiz ? x + len : x + (R() - 0.5) * 3, horiz ? y + (R() - 0.5) * 3 : y + len)
    ge.stroke()
  }
  // a hot rim right at the burning end
  ge.globalAlpha = 1
  ge.shadowBlur = 0
  const rim = ge.createLinearGradient(0, 0, 0, 40)
  rim.addColorStop(0, 'rgba(255,120,30,0.9)')
  rim.addColorStop(1, 'rgba(255,60,10,0)')
  ge.fillStyle = rim
  ge.fillRect(0, 0, W, 40)
  return { map: tex(c), emissive: tex(e) }
}

/** log end caps: glowing ember (fire end) and sawn wood rings (outer end) */
export function makeCaps() {
  const S = 128
  const R = rng(11)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#1a0d07'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 90; i++) {
    const r = 3 + R() * 9
    const x = R() * S
    const y = R() * S
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    const k = R()
    gr.addColorStop(0, k > 0.5 ? 'rgba(255,190,90,1)' : 'rgba(255,100,30,1)')
    gr.addColorStop(1, 'rgba(120,20,0,0)')
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const [w, gw] = canvas(S, S)
  gw.fillStyle = '#9a7650'
  gw.fillRect(0, 0, S, S)
  for (let r = 4; r < S / 2; r += 3 + R() * 3) {
    gw.strokeStyle = R() < 0.5 ? 'rgba(90,60,38,0.7)' : 'rgba(150,115,80,0.6)'
    gw.lineWidth = 1 + R()
    gw.beginPath()
    gw.arc(S / 2 + (R() - 0.5) * 2, S / 2 + (R() - 0.5) * 2, r, 0, Math.PI * 2)
    gw.stroke()
  }
  gw.strokeStyle = '#3a271a'
  gw.lineWidth = 6
  gw.beginPath()
  gw.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2)
  gw.stroke()
  return { ember: tex(c), wood: tex(w) }
}

/** forest-floor ground (tiling): dark earth, needles, small grass tufts */
export function makeGround() {
  const S = 512
  const R = rng(23)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#231c15'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2600; i++) {
    const x = R() * S
    const y = R() * S
    const r = 1 + R() * 5
    const v = R()
    g.fillStyle = v < 0.4 ? 'rgba(15,11,8,0.5)' : v < 0.75 ? 'rgba(52,40,28,0.45)' : 'rgba(40,46,28,0.45)'
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // pine needles
  g.lineCap = 'round'
  for (let i = 0; i < 1400; i++) {
    const x = R() * S
    const y = R() * S
    const a = R() * Math.PI
    const l = 4 + R() * 9
    g.strokeStyle = R() < 0.5 ? 'rgba(92,66,40,0.55)' : 'rgba(60,44,28,0.6)'
    g.lineWidth = 0.8 + R() * 0.6
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
    g.stroke()
  }
  // grass tufts
  for (let i = 0; i < 160; i++) {
    const x = R() * S
    const y = R() * S
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 1.6
      const l = 5 + R() * 10
      g.strokeStyle = R() < 0.5 ? 'rgba(58,70,36,0.7)' : 'rgba(84,90,48,0.6)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      g.stroke()
    }
  }
  return tex(c, true, true)
}

/** ash bed under the fire: grey ash, dark charcoal chunks and glowing coals (emissive) */
export function makeAsh() {
  const S = 256
  const R = rng(31)
  const [c, g] = canvas(S, S)
  const [e, ge] = canvas(S, S)
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  rg.addColorStop(0, '#2a2522')
  rg.addColorStop(0.6, '#3a3430')
  rg.addColorStop(0.92, 'rgba(40,34,30,0.6)')
  rg.addColorStop(1, 'rgba(35,28,21,0)')
  g.fillStyle = rg
  g.fillRect(0, 0, S, S)
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, S, S)
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2
    const rr = Math.sqrt(R()) * S * 0.36
    const x = S / 2 + Math.cos(a) * rr
    const y = S / 2 + Math.sin(a) * rr
    const r = 2 + R() * 6
    g.fillStyle = R() < 0.6 ? '#0d0b0a' : '#57504a'
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
    if (R() < 0.55) {
      const heat = 1 - rr / (S * 0.36)
      const gr = ge.createRadialGradient(x, y, 0, x, y, r * 1.6)
      gr.addColorStop(0, `rgba(255,${Math.floor(90 + 110 * heat)},30,${0.5 + 0.5 * heat})`)
      gr.addColorStop(1, 'rgba(160,30,0,0)')
      ge.fillStyle = gr
      ge.fillRect(x - r * 2, y - r * 2, r * 4, r * 4)
    }
  }
  return { map: tex(c), emissive: tex(e) }
}

/** canvas fabric for the tent */
export function makeFabric() {
  const S = 128
  const R = rng(41)
  const [c, g] = canvas(S, S)
  g.fillStyle = '#b8582a'
  g.fillRect(0, 0, S, S)
  for (let y = 0; y < S; y += 2) {
    g.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.05})`
    g.fillRect(0, y, S, 1)
  }
  for (let x = 0; x < S; x += 2) {
    g.fillStyle = `rgba(255,255,255,${0.02 + R() * 0.03})`
    g.fillRect(x, 0, 1, S)
  }
  return tex(c, true, true)
}
