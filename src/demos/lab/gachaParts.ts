import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/* ------------------------------------------------------------------ palette + prize table */

export const CAP_R = 0.24

/** capsule colourways: [top (pale, "clear" half), bottom (candy)] */
export const CAPSULE_COLORS: [string, string][] = [
  ['#fff1f4', '#ff5c84'],
  ['#ecfbf6', '#2fc39d'],
  ['#fff8e2', '#ffbe2e'],
  ['#eaf4ff', '#4a9dff'],
  ['#f3efff', '#9677ff'],
  ['#fff0e8', '#ff7a45'],
]

export type Rarity = 0 | 1 | 2
export const RARITY_LABEL = ['普通', '稀有', '传说'] as const
export const RARITY_EN = ['COMMON', 'RARE', 'LEGENDARY'] as const

export type PrizeId = 'duck' | 'coupon' | 'shroom' | 'rocket' | 'star' | 'gem'
export type Prize = { id: PrizeId; name: string; rarity: Rarity; desc: string }

export const PRIZES: Prize[] = [
  { id: 'duck', name: '小黄鸭', rarity: 0, desc: '洗澡搭子 · 捏一下会叫' },
  { id: 'coupon', name: '九折优惠券', rarity: 0, desc: '全场通用 · 7 天内有效' },
  { id: 'shroom', name: '红帽小蘑菇', rarity: 0, desc: '桌面摆件 · 越看越顺眼' },
  { id: 'rocket', name: '小火箭', rarity: 1, desc: '限定涂装 · 尾焰会发光' },
  { id: 'star', name: '星星徽章', rarity: 1, desc: '金属珐琅 · 可以别在包上' },
  { id: 'gem', name: '彩虹钻石', rarity: 2, desc: '传说款 · 抽中概率 8%' },
]

/** rarity roll with a small pity: a legendary is guaranteed within 6 pulls */
export function rollPrize(sinceLegend: number): Prize {
  const r = Math.random()
  const rarity: Rarity = sinceLegend >= 5 || r < 0.08 ? 2 : r < 0.36 ? 1 : 0
  const pool = PRIZES.filter((p) => p.rarity === rarity)
  return pool[Math.floor(Math.random() * pool.length)]
}

/* ------------------------------------------------------------------ materials */

/** one draw call for every capsule: per-instance top/bottom colour, split by local y, with a darker seam */
export function capsuleMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0, envMapIntensity: 0.9 })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTop;\nattribute vec3 aBot;\nvarying vec3 vTop;\nvarying vec3 vBot;\nvarying float vSide;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTop = aTop; vBot = aBot; vSide = position.y;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTop;\nvarying vec3 vBot;\nvarying float vSide;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sd = vSide / ${CAP_R.toFixed(3)};
        vec3 cc = sd > 0.0 ? vTop : vBot;
        cc *= mix(0.58, 1.0, smoothstep(0.03, 0.075, abs(sd)));
        diffuseColor.rgb = cc;`,
      )
  }
  m.customProgramCacheKey = () => 'gacha-capsule-2tone'
  return m
}

/**
 * Cheap glass: no transmission pass. Mostly see-through, the alpha rises with fresnel and with the reflected
 * softboxes, so the globe reads as a glossy shell around the capsules.
 */
export function glassMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#eef4ff',
    roughness: 0.035,
    metalness: 0,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
    specularIntensity: 1,
  })
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float gFres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      float gSpec = dot(totalSpecular, vec3(0.3333));
      diffuseColor.a = clamp(opacity + gFres * 0.34 + gSpec * 0.85, 0.0, 0.9);
      outgoingLight = mix(outgoingLight, vec3(0.86, 0.89, 0.95), gFres * 0.35);
      #include <opaque_fragment>`,
    )
  }
  m.customProgramCacheKey = () => 'gacha-glass'
  return m
}

/** camera-facing reveal backdrop: soft glow + light rays + an expanding ring (all optional by uniform) */
export function fxMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uRays: { value: 0 },
      uRing: { value: 0 },
      uRingA: { value: 0 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') },
      uColor2: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uGlow, uRays, uRing, uRingA, uAlpha;
      uniform vec3 uColor, uColor2;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float glow = exp(-r * r * 7.0) * uGlow;
        float rays = pow(0.5 + 0.5 * sin(a * 8.0 + uTime * 0.5), 5.0) * 0.75
                   + pow(0.5 + 0.5 * sin(a * 13.0 - uTime * 0.35 + 1.7), 9.0) * 0.45;
        rays *= smoothstep(1.0, 0.15, r) * smoothstep(0.05, 0.3, r) * uRays;
        float ring = exp(-pow((r - uRing) * 16.0, 2.0)) * uRingA;
        float k = clamp(glow + rays, 0.0, 1.0);
        vec3 col = mix(uColor2, uColor, k);
        col = mix(col, uColor, ring);
        float alpha = clamp(glow * 0.85 + rays * 0.8 + ring * 0.85, 0.0, 1.0) * uAlpha;
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  })
}

/* ------------------------------------------------------------------ canvas textures */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const FONT = '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif'

export function plaqueTexture() {
  return canvasTex(1024, 256, (g) => {
    g.fillStyle = '#fff6ea'
    g.fillRect(0, 0, 1024, 256)
    g.fillStyle = '#e8435f'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `800 112px ${FONT}`
    g.fillText('扭 蛋', 512, 112)
    g.font = `600 34px ui-monospace,Consolas,monospace`
    g.fillStyle = '#b77a86'
    g.fillText('C A P S U L E   T O Y S', 512, 204)
    // little stars either side
    g.fillStyle = '#ffbe2e'
    for (const x of [250, 774]) {
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const rr = i % 2 ? 14 : 34
        g.lineTo(x + Math.cos(a) * rr, 112 + Math.sin(a) * rr)
      }
      g.fill()
    }
  })
}

export function priceTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffbe2e'
    g.beginPath()
    g.arc(128, 128, 124, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#fff6df'
    g.beginPath()
    g.arc(128, 128, 104, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#e8435f'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `800 92px ${FONT}`
    g.fillText('¥2', 128, 120)
    g.font = `700 30px ${FONT}`
    g.fillText('一次', 128, 188)
  })
}

function couponTexture() {
  return canvasTex(512, 300, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 300)
    grd.addColorStop(0, '#ff6d8f')
    grd.addColorStop(1, '#ff4f6e')
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 300)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.setLineDash([10, 10])
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(352, 24)
    g.lineTo(352, 276)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = '#ffffff'
    g.textBaseline = 'middle'
    g.textAlign = 'left'
    g.font = `800 150px ${FONT}`
    g.fillText('9', 40, 146)
    g.font = `800 64px ${FONT}`
    g.fillText('折', 138, 176)
    g.font = `600 30px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.86)'
    g.fillText('全场通用', 46, 250)
    g.textAlign = 'center'
    g.font = `700 32px ui-monospace,Consolas,monospace`
    g.fillStyle = '#ffffff'
    g.save()
    g.translate(432, 150)
    g.rotate(-Math.PI / 2)
    g.fillText('COUPON', 0, 0)
    g.restore()
  })
}

/* ------------------------------------------------------------------ prizes (≈1 unit tall, facing +z) */

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...o })

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(...p)
  if (s) m.scale.set(...s)
  if (r) m.rotation.set(...r)
  g.add(m)
  return m
}

function starShape(R: number, r: number, n = 5) {
  const s = new THREE.Shape()
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n
    const rr = i % 2 ? r : R
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  s.closePath()
  return s
}

export type PrizeObj = { root: THREE.Group; spin?: THREE.Object3D; flame?: THREE.Object3D; sparkles?: THREE.Object3D }

export function buildPrizes(): Record<PrizeId, PrizeObj> {
  const sph = new THREE.SphereGeometry(1, 32, 20)

  // duck
  const duck = new THREE.Group()
  {
    const yellow = std('#ffd23f', { roughness: 0.32 })
    const orange = std('#ff8a2b', { roughness: 0.4 })
    const ink = std('#1e1a22', { roughness: 0.2 })
    add(duck, sph, yellow, [0, -0.16, 0], [0.46, 0.36, 0.4])
    add(duck, sph, yellow, [0, 0.26, 0.1], [0.27, 0.27, 0.27])
    add(duck, sph, orange, [0, 0.22, 0.38], [0.13, 0.055, 0.12])
    add(duck, sph, ink, [0.11, 0.33, 0.31], [0.035, 0.035, 0.035])
    add(duck, sph, ink, [-0.11, 0.33, 0.31], [0.035, 0.035, 0.035])
    add(duck, sph, yellow, [0, -0.02, -0.38], [0.12, 0.16, 0.12], [0.7, 0, 0])
    add(duck, sph, yellow, [0.4, -0.1, -0.02], [0.08, 0.17, 0.26], [0, 0, -0.5])
    add(duck, sph, yellow, [-0.4, -0.1, -0.02], [0.08, 0.17, 0.26], [0, 0, 0.5])
    add(duck, sph, std('#ff9db5', { roughness: 0.5 }), [0.19, 0.2, 0.24], [0.05, 0.03, 0.02])
    add(duck, sph, std('#ff9db5', { roughness: 0.5 }), [-0.19, 0.2, 0.24], [0.05, 0.03, 0.02])
  }

  // coupon (extruded ticket with side notches)
  const coupon = new THREE.Group()
  {
    const W = 1.1
    const H = 0.64
    const s = new THREE.Shape()
    const rr = 0.07
    const n = 0.08
    s.moveTo(-W / 2 + rr, -H / 2)
    s.lineTo(W / 2 - rr, -H / 2)
    s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + rr)
    s.lineTo(W / 2, -n)
    s.absarc(W / 2, 0, n, -Math.PI / 2, Math.PI / 2, true)
    s.lineTo(W / 2, H / 2 - rr)
    s.quadraticCurveTo(W / 2, H / 2, W / 2 - rr, H / 2)
    s.lineTo(-W / 2 + rr, H / 2)
    s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - rr)
    s.lineTo(-W / 2, n)
    s.absarc(-W / 2, 0, n, Math.PI / 2, -Math.PI / 2, true)
    s.lineTo(-W / 2, -H / 2 + rr)
    s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + rr, -H / 2)
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 12 })
    geo.translate(0, 0, -0.0175)
    const tex = couponTexture()
    tex.repeat.set(1 / W, 1 / H)
    tex.offset.set(0.5, 0.5)
    const face = std('#ffffff', { map: tex, roughness: 0.38 })
    const side = std('#ff8fa6', { roughness: 0.5 })
    const m = new THREE.Mesh(geo, [face, side])
    m.rotation.z = 0.12
    coupon.add(m)
  }

  // mushroom
  const shroom = new THREE.Group()
  {
    const cap = new THREE.SphereGeometry(0.46, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)
    const red = std('#ef3b4c', { roughness: 0.36 })
    const cream = std('#fff1dc', { roughness: 0.6 })
    add(shroom, cap, red, [0, 0.02, 0], [1, 0.78, 1])
    add(shroom, new THREE.CircleGeometry(0.46, 40), cream, [0, 0.02, 0], undefined, [Math.PI / 2, 0, 0])
    add(shroom, new THREE.CylinderGeometry(0.15, 0.2, 0.48, 28), cream, [0, -0.22, 0])
    const dots: [number, number][] = [
      [0.15, 0.2],
      [0.6, 1.4],
      [0.62, 3.0],
      [0.55, 4.5],
      [0.9, 0.6],
      [0.95, 2.3],
      [0.92, 3.9],
      [0.88, 5.4],
    ]
    for (const [el, az] of dots) {
      const th = el * 1.15
      const x = Math.sin(th) * Math.cos(az) * 0.46
      const z = Math.sin(th) * Math.sin(az) * 0.46
      const y = Math.cos(th) * 0.46 * 0.78 + 0.02
      const d = add(shroom, sph, cream, [x, y, z], [0.07, 0.025, 0.07])
      d.lookAt(x * 2, y * 2 + 0.02, z * 2)
      d.rotateX(Math.PI / 2)
    }
    add(shroom, sph, std('#1e1a22', { roughness: 0.2 }), [0.07, -0.16, 0.19], [0.022, 0.03, 0.02])
    add(shroom, sph, std('#1e1a22', { roughness: 0.2 }), [-0.07, -0.16, 0.19], [0.022, 0.03, 0.02])
  }

  // rocket
  const rocket = new THREE.Group()
  let flame: THREE.Object3D
  {
    const body = new THREE.Group()
    const pts = [
      [0, -0.42],
      [0.14, -0.42],
      [0.2, -0.3],
      [0.22, -0.05],
      [0.2, 0.15],
      [0.14, 0.32],
      [0.0, 0.46],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const white = std('#f7f4f0', { roughness: 0.3 })
    const red = std('#ff4f6e', { roughness: 0.32 })
    add(body, new THREE.LatheGeometry(pts, 40), white, [0, 0, 0])
    const nose = [
      [0.145, 0.3],
      [0.1, 0.38],
      [0.0, 0.465],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    add(body, new THREE.LatheGeometry([new THREE.Vector2(0.152, 0.29), ...nose], 40), red, [0, 0.002, 0])
    add(body, new THREE.TorusGeometry(0.085, 0.022, 12, 32), std('#2b2a33', { roughness: 0.3, metalness: 0.4 }), [0, 0.08, 0.2])
    add(body, new THREE.CircleGeometry(0.075, 32), std('#7cc8ff', { roughness: 0.05, metalness: 0.2, emissive: '#2a6cff', emissiveIntensity: 0.25 }), [0, 0.08, 0.212])
    const fin = new THREE.Shape()
    fin.moveTo(0, 0)
    fin.lineTo(0.17, -0.12)
    fin.lineTo(0.17, -0.2)
    fin.lineTo(0, -0.12)
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.035, bevelEnabled: false })
    finGeo.translate(0.17, -0.18, -0.0175)
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(finGeo, red)
      f.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 2
      body.add(f)
    }
    const fl = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.34, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb02e').multiplyScalar(1.4), transparent: true, opacity: 0.92, toneMapped: false }),
    )
    fl.rotation.x = Math.PI
    fl.position.y = -0.58
    body.add(fl)
    flame = fl
    body.rotation.z = -0.38
    rocket.add(body)
  }

  // star badge
  const star = new THREE.Group()
  {
    const gold = new THREE.MeshStandardMaterial({ color: '#f5c04a', metalness: 0.9, roughness: 0.22, envMapIntensity: 1.4 })
    const outer = new THREE.ExtrudeGeometry(starShape(0.5, 0.22), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 3 })
    outer.translate(0, 0, -0.04)
    add(star, outer, gold, [0, 0, 0])
    const inner = new THREE.ExtrudeGeometry(starShape(0.34, 0.15), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 })
    add(star, inner, std('#4f6bff', { roughness: 0.15, metalness: 0.1 }), [0, -0.005, 0.07])
    add(star, sph, std('#ffffff', { roughness: 0.1 }), [-0.07, 0.1, 0.11], [0.04, 0.04, 0.012])
  }

  // gem
  const gem = new THREE.Group()
  let sparkles: THREE.Object3D
  {
    const prof = [
      [0, -0.52],
      [0.48, 0.02],
      [0.42, 0.16],
      [0.24, 0.27],
      [0, 0.27],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    const geo = new THREE.LatheGeometry(prof, 10).toNonIndexed()
    geo.computeVertexNormals()
    // per-facet rainbow tint (pastel), so every face reads as a different colour of light
    const pos = geo.getAttribute('position')
    const cols = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    for (let f = 0; f < pos.count; f += 3) {
      const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3
      const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3
      const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3
      const h = (Math.atan2(z, x) / (Math.PI * 2) + 1 + y * 0.35) % 1
      c.setHSL(h, 0.85, y > 0.2 ? 0.86 : 0.72)
      for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (f + k) * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    const m = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.05,
      metalness: 0.25,
      iridescence: 1,
      iridescenceIOR: 1.7,
      iridescenceThicknessRange: [200, 700],
      flatShading: true,
      envMapIntensity: 2.2,
      emissive: '#7d6bff',
      emissiveIntensity: 0.18,
    })
    const g = add(gem, geo, m, [0, 0.05, 0])
    g.rotation.x = 0.22
    // 4-point sparkles
    const sp = new THREE.Group()
    const spark = new THREE.Shape()
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const rr = i % 2 ? 0.025 : 0.11
      if (i === 0) spark.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else spark.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    const sg = new THREE.ShapeGeometry(spark)
    const sm = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, side: THREE.DoubleSide })
    const at: [number, number, number, number][] = [
      [0.55, 0.42, 0.1, 1],
      [-0.5, 0.25, 0.2, 0.7],
      [0.38, -0.38, 0.25, 0.6],
      [-0.3, 0.55, -0.1, 0.5],
    ]
    for (const [x, y, z, s] of at) add(sp, sg, sm, [x, y, z], [s, s, s])
    gem.add(sp)
    sparkles = sp
  }

  return {
    duck: { root: duck },
    coupon: { root: coupon },
    shroom: { root: shroom },
    rocket: { root: rocket, flame },
    star: { root: star },
    gem: { root: gem, sparkles },
  }
}

/* ------------------------------------------------------------------ machine shells */

export function roundedBox(w: number, h: number, d: number, r: number, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, r)
}

export function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2)
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r)
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2)
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r)
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

export function blobShadowTexture() {
  return canvasTex(256, 256, (g) => {
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grd.addColorStop(0, 'rgba(90,40,55,0.55)')
    grd.addColorStop(0.45, 'rgba(90,40,55,0.22)')
    grd.addColorStop(1, 'rgba(90,40,55,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 256, 256)
  })
}

/* ------------------------------------------------------------------ sound (WebAudio, created on first gesture) */

export type GachaSound = { tick: (s?: number) => void; thunk: () => void; pop: () => void; chime: (rarity: Rarity) => void }

export function makeGachaSound(): GachaSound {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AC()
  const out = ctx.createGain()
  out.gain.value = 0.8
  out.connect(ctx.destination)
  const len = Math.floor(ctx.sampleRate * 0.05)
  const noise = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)

  const burst = (t: number, freq: number, q: number, gain: number, dur: number, rate = 1) => {
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.playbackRate.value = rate
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq
    bp.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    src.connect(bp).connect(g).connect(out)
    src.start(t)
  }
  const tone = (t: number, f0: number, f1: number, gain: number, dur: number, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }
  return {
    tick: (s = 1) => {
      const t = ctx.currentTime
      burst(t, 3200 + Math.random() * 400, 2, 0.28 * s, 0.035, 0.9 + Math.random() * 0.2)
      tone(t, 900, 500, 0.05 * s, 0.03, 'triangle')
    },
    thunk: () => {
      const t = ctx.currentTime
      tone(t, 170, 70, 0.32, 0.18)
      burst(t, 900, 1, 0.2, 0.08, 0.6)
      // the capsule bouncing in the chute
      tone(t + 0.32, 520, 380, 0.07, 0.06, 'triangle')
      tone(t + 0.44, 520, 400, 0.04, 0.05, 'triangle')
    },
    pop: () => {
      const t = ctx.currentTime
      burst(t, 1800, 0.8, 0.35, 0.06, 0.7)
      tone(t, 620, 1500, 0.12, 0.09)
    },
    chime: (rarity) => {
      const t = ctx.currentTime + 0.05
      const notes = rarity === 2 ? [784, 988, 1175, 1568, 1976] : rarity === 1 ? [659, 880, 1175] : [880, 1319]
      notes.forEach((f, i) => tone(t + i * 0.075, f, f * 0.998, rarity === 2 ? 0.09 : 0.07, 0.5 + i * 0.05, 'sine'))
    },
  }
}
