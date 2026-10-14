import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize } from '../../lib/stylize'
import {
  createNewspaperEffect,
  createNewspaperOriginal,
  newspaperMeta,
  newspaperModes,
  setNewspaperFrame,
  setNewspaperMode,
  setNewspaperQuality,
  type NewspaperEffect,
  type NewspaperMode,
  type NewspaperQuality,
} from './effects/newspaper'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'

/*
 * 老报纸 showcase — a whole front page of MOTION DAILY 动效日报. The DOM lays out the masthead, date line,
 * banner headline, deck, ruled columns and the caption (multiplied onto the canvas, so the paper, the fold and
 * the stains run through the type); the canvas behind it is the paper itself, with the news photo printed into
 * the box that `.np-photo` reserves. The photo is a "living" one: a 1950s rocket clears its gantry in a
 * billow of smoke, climbs out of frame, and while the smoke drifts off the next one is on the pad.
 * The camera's projection is shifted so the subject is framed inside the box; the page slides in hot off the
 * press once the print shader is ready.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const REDUCED = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const STILL = POSTER || REDUCED
const CYCLE_EVERY = 15000

/* rocket timeline (s) */
const CYCLE = 16
const IGNITE = 2.6
const LIFT = 3.6
const RESET = 12.6
const POSTER_T = 6.1
const rocketY = (ct: number) => {
  if (ct < LIFT || ct >= RESET) return 0
  const t = ct - LIFT
  return 0.42 * t * t + 0.25 * t
}

type Edition = { kicker: string; date: string; no: string; banner: string; deck: string; caption: string; short: string }
const ED: Record<NewspaperMode, Edition> = {
  extra: {
    kicker: '号外 · EXTRA',
    date: '一九四七年十月四日 星期六',
    no: '第 1024 号',
    banner: '火箭升空！',
    deck: '试验火箭今晨点火 · 拖着白烟直上云霄',
    caption: '▲ 火箭离开发射塔的一瞬。黑白号外只有一块黑版，网点粗、墨色重，暗部糊成一片。（本报记者 摄）',
    short: '号外',
  },
  colour: {
    kicker: '彩色周末版 · SUNDAY COLOUR',
    date: '一九六二年七月十五日 星期日',
    no: '周末画报 第 88 期',
    banner: '飞向群星',
    deck: '画报特辑：发射场的一天 · 本刊记者随队目击',
    caption: '▲ 白烟翻滚，火箭冲出发射塔。四色网点各自错开了一点，油墨也褪了色。（彩色胶印）',
    short: '周末版',
  },
  wire: {
    kicker: '传真照片 · WIREPHOTO',
    date: '一九五七年十一月三日 星期日',
    no: '第 3561 号',
    banner: '发射成功',
    deck: '本报专电：照片经电话线逐行传真，今晨抵达编辑部',
    caption: '▲ 本照片由传真机逐行扫描传送，每张需时八分钟，横纹与颗粒为传输所致。（合众社传真）',
    short: '传真',
  },
}

const QUAL: { id: NewspaperQuality; label: string }[] = [
  { id: 'poor', label: '粗印' },
  { id: 'good', label: '精印' },
]

const BODY: { h?: string; p: string }[] = [
  { p: '【本报讯】这张新闻照片是实时渲染的三维场景：火箭、发射塔和翻滚的白烟都在动。它被印上一张泛黄的新闻纸——网点很粗，每英寸只有六七十线，墨一上纸就向四周洇开，暗部糊成一片，亮部干脆不着墨。' },
  { p: '细看纸面：对页的文字反着透了过来，四边泛黄、生出锈斑，角上留着沾了油墨的指纹。正中一道折痕，是报纸叠起来送到读者手里时压出的；有一条横带颜色发浅，那是印到这里时墨斗快干了。' },
  { h: '三种版本', p: '黑白号外是四十年代的赶印，只有一块黑版；彩色周末版是六十年代的四色画报，青、品、黄、黑四块版没有对准，颜色也褪了；传真照片则是经电话线逐行传来的，扫描线、条纹和颗粒都看得到。' },
  { p: '「印刷质量」一栏可以换成精印：网点收紧、套准、墨色匀净。按住照片左右拖动，可以绕着发射塔转一转；点「原图」，比较印刷之前的样子。' },
  { h: '本市简讯', p: '城东新建百货大楼昨日开业，顾客络绎不绝，三楼新设的电视机柜台前尤其拥挤。据店方介绍，首批到货的收音机已经售罄，下一批月底运到。' },
  { p: '气象台预报：明日晴转多云，偏北风三到四级，早晚较凉，请市民注意添衣。另讯，环城电车第二路自下周一起延长运营至晚十一时。' },
  { h: '读者来信', p: '编辑同志：我家孩子每天放学都要看一眼贵报的照片版，说火箭会动。我们全家都笑他，昨天凑近一看，真是在动。特此来信，望贵报多登此类照片。——一位老读者' },
  { p: '市图书馆本周起延长开放时间，阅览室增设报刊合订本专架，自一九三零年起的本报均可查阅。馆方提醒，翻阅旧报请轻拿轻放，纸张已经发脆。' },
  { h: '广告', p: '动效牌钢笔墨水 · 书写流利 · 经久不褪 · 各大文具店均有出售。另有蓝黑、纯黑两色，学生优惠。' },
  { p: '体育：昨日市运动会田径赛场上，二中选手以十一秒二的成绩夺得百米冠军，打破保持了九年的市纪录。观众席上掌声雷动，教练说这孩子平时就爱追着电车跑。' },
  { p: '文化：新排话剧《灯塔》将于下月在人民剧场首演，票价分甲乙丙三等，学生凭证半价。剧团负责人表示，布景全部由团员自己动手绘制。' },
]

/* ------------------------------------------------------------------ helpers */

function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** V-2 style roll pattern painted in (u around, y up) space */
function rocketTexture(H: number) {
  const W = 256
  const S = 512
  const c = document.createElement('canvas')
  c.width = W
  c.height = S
  const x = c.getContext('2d')!
  const Y = (y: number) => S - (y / H) * S // canvas row of height y
  x.fillStyle = '#f4f1ea'
  x.fillRect(0, 0, W, S)
  x.fillStyle = '#16140f'
  // lower band: alternating quadrants, then the inverse above it
  for (let q = 0; q < 4; q++) {
    if (q % 2 === 0) x.fillRect((q * W) / 4, Y(1.5), W / 4, Y(0) - Y(1.5))
    else x.fillRect((q * W) / 4, Y(3.0), W / 4, Y(1.5) - Y(3.0))
  }
  // a red ring (shows in the colour edition) and a black ring under the nose
  x.fillStyle = '#c4302a'
  x.fillRect(0, Y(3.55), W, Y(3.3) - Y(3.55))
  x.fillStyle = '#16140f'
  x.fillRect(0, Y(4.5), W, Y(4.36) - Y(4.5))
  x.fillRect(0, Y(H), W, Y(H - 0.35) - Y(H))
  // stencilled letters on the white band
  x.save()
  x.translate(W * 0.62, Y(2.3))
  x.rotate(-Math.PI / 2)
  x.font = '700 30px Georgia, serif'
  x.fillStyle = '#16140f'
  x.textAlign = 'center'
  x.fillText('M · D', 0, 10)
  x.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/* ------------------------------------------------------------------ smoke */

const N_SMOKE = 300

type Smoke = {
  mesh: THREE.InstancedMesh
  p: Float32Array
  v: Float32Array
  age: Float32Array
  life: Float32Array
  rmax: Float32Array
  grow: Float32Array
  squash: Float32Array
  rot: Float32Array
  alive: Uint8Array
  next: number
  acc: [number, number, number]
  rnd: () => number
  dummy: THREE.Object3D
  col: THREE.Color
}

function makeSmoke(): Smoke {
  // a lumpy, cauliflower-ish puff (shared by all instances, each one rotated differently)
  const ico = new THREE.IcosahedronGeometry(1, 3)
  ico.deleteAttribute('normal')
  ico.deleteAttribute('uv')
  const geo = mergeVertices(ico)
  ico.dispose()
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    const n =
      (Math.sin(v.x * 3.1 + 1.3) + Math.sin(v.y * 2.7 + 0.4) + Math.sin(v.z * 3.6 + 2.2)) / 3 +
      0.5 * Math.sin(v.x * 7.3 + v.y * 5.1 + 0.9) * Math.sin(v.z * 6.7 - v.y * 3.3 + 1.7)
    v.multiplyScalar(1 + 0.16 * n)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  const mat = new THREE.MeshStandardMaterial({ color: '#f3f1ec', roughness: 1 })
  const mesh = new THREE.InstancedMesh(geo, mat, N_SMOKE)
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  const S: Smoke = {
    mesh,
    p: new Float32Array(N_SMOKE * 3),
    v: new Float32Array(N_SMOKE * 3),
    age: new Float32Array(N_SMOKE),
    life: new Float32Array(N_SMOKE),
    rmax: new Float32Array(N_SMOKE),
    grow: new Float32Array(N_SMOKE),
    squash: new Float32Array(N_SMOKE),
    rot: new Float32Array(N_SMOKE),
    alive: new Uint8Array(N_SMOKE),
    next: 0,
    acc: [0, 0, 0],
    rnd: mulberry(11),
    dummy: new THREE.Object3D(),
    col: new THREE.Color(),
  }
  // colours exist from the start, so the program compiled up front is the one that draws
  for (let i = 0; i < N_SMOKE; i++) {
    mesh.setColorAt(i, S.col.setScalar(1))
    S.dummy.scale.setScalar(0)
    S.dummy.updateMatrix()
    mesh.setMatrixAt(i, S.dummy.matrix)
  }
  return S
}

function spawn(S: Smoke, x: number, y: number, z: number, vx: number, vy: number, vz: number, rmax: number, life: number, grow: number, squash = 1) {
  const i = S.next
  S.next = (S.next + 1) % N_SMOKE
  S.p.set([x, y, z], i * 3)
  S.v.set([vx, vy, vz], i * 3)
  S.age[i] = 0
  S.life[i] = life
  S.rmax[i] = rmax
  S.grow[i] = grow
  S.squash[i] = squash
  S.rot[i] = S.rnd() * 6.28
  S.alive[i] = 1
  // older, sootier puffs are a touch greyer
  S.mesh.setColorAt(i, S.col.setScalar(0.8 + S.rnd() * 0.2))
  if (S.mesh.instanceColor) S.mesh.instanceColor.needsUpdate = true
}

function stepSmoke(S: Smoke, dt: number, ct: number) {
  const r = S.rnd
  const ry = rocketY(ct)
  const burning = ct >= IGNITE && ct < RESET
  // 0 · ground billow out of the flame trench, both ways and toward the camera
  if (ct >= IGNITE && ct < 6.4) {
    S.acc[0] += dt * (ct < LIFT ? 26 : 42)
    while (S.acc[0] >= 1) {
      S.acc[0] -= 1
      const side = r() < 0.5 ? -1 : 1
      const sp = 4 + r() * 5
      spawn(S, side * 1.2, 0.6, 0.6 + r() * 0.6, side * sp, 0.4 + r() * 1.6, -0.5 + r() * 3.2, 0.9 + r() * 1.4, 8 + r() * 2.5, 0.55 + r() * 0.4, 0.86)
    }
  }
  // 1 · exhaust trail behind the climbing rocket
  if (ct >= LIFT && burning && ry < 26) {
    S.acc[1] += dt * 46
    while (S.acc[1] >= 1) {
      S.acc[1] -= 1
      spawn(S, (r() - 0.5) * 0.5, ry - 0.4 - r() * 1.4, (r() - 0.5) * 0.5, (r() - 0.5) * 1.8, -1.2 - r() * 1.6, (r() - 0.5) * 1.8, 0.5 + r() * 0.65, 4.5 + r() * 2, 0.5 + r() * 0.3, 1)
    }
  }
  // 2 · LOX boil-off venting on the pad before ignition
  if (ct < IGNITE - 0.2 || ct > RESET + 1.2) {
    S.acc[2] += dt * 4
    while (S.acc[2] >= 1) {
      S.acc[2] -= 1
      spawn(S, 0.45, 3.2 + r() * 0.8, 0.1, 0.5 + r() * 0.4, 0.25 + r() * 0.3, 0.2, 0.35 + r() * 0.25, 2.6 + r(), 1.2, 1)
    }
  }
  const d = S.dummy
  for (let i = 0; i < N_SMOKE; i++) {
    if (!S.alive[i]) continue
    S.age[i] += dt
    const a = S.age[i]
    if (a >= S.life[i]) {
      S.alive[i] = 0
      d.scale.setScalar(0)
      d.updateMatrix()
      S.mesh.setMatrixAt(i, d.matrix)
      continue
    }
    const k = i * 3
    const drag = Math.exp(-dt * 0.85)
    S.v[k] *= drag
    S.v[k + 1] = S.v[k + 1] * drag + dt * 0.22
    S.v[k + 2] *= drag
    S.p[k] += S.v[k] * dt
    S.p[k + 1] += S.v[k + 1] * dt
    S.p[k + 2] += S.v[k + 2] * dt
    const rad = S.rmax[i] * (0.25 + 0.75 * (1 - Math.exp(-a * S.grow[i])))
    const fade = Math.min(1, (S.life[i] - a) / 2.2)
    const s = rad * (fade * fade * (3 - 2 * fade))
    if (S.p[k + 1] < s * 0.55) S.p[k + 1] = s * 0.55
    d.position.set(S.p[k], S.p[k + 1], S.p[k + 2])
    d.rotation.set(0, S.rot[i] + a * 0.1, 0)
    d.scale.set(s, s * S.squash[i], s)
    d.updateMatrix()
    S.mesh.setMatrixAt(i, d.matrix)
  }
  S.mesh.instanceMatrix.needsUpdate = true
}

/* ------------------------------------------------------------------ scene */

function strutMatrix(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Matrix4) {
  const dir = b.clone().sub(a)
  const len = dir.length()
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  return out.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(t, len, t))
}

function towerMesh(mat: THREE.Material) {
  const H = 9.6
  const h = 0.65
  const levels = 10
  const mats: THREE.Matrix4[] = []
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const corners = [V(-h, 0, -h), V(h, 0, -h), V(h, 0, h), V(-h, 0, h)]
  for (const c of corners) mats.push(strutMatrix(c, V(c.x, H, c.z), 0.13, new THREE.Matrix4()))
  for (let l = 0; l <= levels; l++) {
    const y = (l / levels) * H
    for (let s = 0; s < 4; s++) {
      const a = corners[s]
      const b = corners[(s + 1) % 4]
      mats.push(strutMatrix(V(a.x, y, a.z), V(b.x, y, b.z), 0.08, new THREE.Matrix4()))
      if (l < levels) {
        const y2 = ((l + 1) / levels) * H
        const flip = (l + s) % 2 === 0
        mats.push(strutMatrix(V(a.x, flip ? y : y2, a.z), V(b.x, flip ? y2 : y, b.z), 0.06, new THREE.Matrix4()))
      }
    }
  }
  // top platform + mast
  mats.push(new THREE.Matrix4().compose(V(0, H + 0.05, 0), new THREE.Quaternion(), V(1.9, 0.12, 1.9)))
  mats.push(strutMatrix(V(0, H, 0), V(0, H + 1.6, 0), 0.07, new THREE.Matrix4()))
  const box = new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.InstancedMesh(box, mat, mats.length)
  mats.forEach((m, i) => mesh.setMatrixAt(i, m))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function skyGeometry() {
  const g = new THREE.SphereGeometry(300, 32, 16)
  const pos = g.attributes.position
  const cols = new Float32Array(pos.count * 3)
  const lo = new THREE.Color('#b9c6cc')
  const hi = new THREE.Color('#3d6aa3')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const k = THREE.MathUtils.clamp(pos.getY(i) / 300, 0, 1)
    c.copy(lo).lerp(hi, Math.pow(k, 0.55))
    cols.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  return g
}

function ridgeGeometry() {
  const s = new THREE.Shape()
  const rnd = mulberry(5)
  s.moveTo(-260, -2)
  for (let i = 0; i <= 60; i++) {
    const x = -260 + (i / 60) * 520
    const y = 7 + Math.sin(i * 0.37) * 4 + Math.sin(i * 1.3) * 2 + rnd() * 2.5
    s.lineTo(x, y)
  }
  s.lineTo(260, -2)
  s.closePath()
  return new THREE.ShapeGeometry(s)
}

function LaunchSite({ az, el, clock }: { az: MotionValue<number>; el: MotionValue<number>; clock: React.RefObject<number> }) {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)
  const ready = usePrecompiled(group)
  const rocket = useRef<THREE.Group>(null)
  const flame = useRef<THREE.Group>(null)
  const glow = useRef<THREE.PointLight>(null)
  const arms = useRef<(THREE.Group | null)[]>([])
  const look = useRef(new THREE.Vector3(0.4, 4.6, 0))
  const R = useMemo(() => {
    const H = 6.15
    const prof: [number, number][] = [
      [0, 0],
      [0.4, 0],
      [0.44, 0.12],
      [0.45, 0.4],
      [0.45, 4.45],
      [0.43, 4.75],
      [0.37, 5.15],
      [0.27, 5.55],
      [0.15, 5.88],
      [0.05, 6.08],
      [0, H],
    ]
    const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40)
    // v = height fraction, so the roll pattern is painted in plain height units
    const uv = body.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setY(i, body.attributes.position.getY(i) / H)
    const fin = new THREE.Shape()
    fin.moveTo(0, 0)
    fin.lineTo(0.95, -0.25)
    fin.lineTo(0.85, 0.35)
    fin.lineTo(0, 1.5)
    fin.closePath()
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false })
    finGeo.translate(0.36, 0, -0.025)
    const steel = new THREE.MeshStandardMaterial({ color: '#8f3a2a', roughness: 0.6, metalness: 0.2 })
    const smoke = makeSmoke()
    return {
      body,
      finGeo,
      tex: rocketTexture(H),
      steel,
      tower: towerMesh(steel),
      smoke,
      sky: skyGeometry(),
      ridge: ridgeGeometry(),
    }
  }, [])

  // posters / reduced motion: run the launch up to the money shot once
  const ct = useRef(0)
  useMemo(() => {
    if (!STILL) return
    for (let t = 0; t < POSTER_T; t += 1 / 30) stepSmoke(R.smoke, 1 / 30, t)
    ct.current = POSTER_T
  }, [R])

  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (ready && !STILL) {
      const prev = ct.current
      ct.current = (ct.current + dt) % CYCLE
      if (ct.current < prev) R.smoke.acc = [0, 0, 0]
      stepSmoke(R.smoke, dt, ct.current)
    }
    const t = ct.current
    clock.current = t
    const ry = rocketY(t)
    if (rocket.current) {
      rocket.current.position.y = 0.62 + ry
      // a slight pitch-over program once it's clear of the tower
      rocket.current.rotation.z = -Math.max(0, ry - 8) * 0.012
      rocket.current.visible = ry < 40
    }
    const burning = t >= IGNITE && t < RESET
    if (flame.current) {
      flame.current.visible = burning
      const f = 0.9 + Math.sin(t * 47) * 0.06 + Math.sin(t * 31) * 0.05
      const k = THREE.MathUtils.smoothstep(t, IGNITE, IGNITE + 0.5) * (1 + Math.min(ry, 10) * 0.05)
      flame.current.scale.set(f, k * (0.8 + f * 0.4), f)
    }
    if (glow.current) glow.current.intensity = burning ? (ry < 14 ? 60 : 0) * (0.85 + Math.sin(t * 40) * 0.15) : 0
    // umbilical arms swing clear at ignition, back after the smoke covers the pad
    const open = t < IGNITE - 0.4 ? 0 : t < RESET ? Math.min(1, (t - IGNITE + 0.4) / 1.2) : Math.max(0, 1 - (t - RESET) / 2.5)
    arms.current.forEach((a, i) => {
      if (a) a.rotation.y = -(open * open * (3 - 2 * open)) * (1.1 + i * 0.25)
    })

    // camera: low, looking up at the pad; tilts up a little to follow the climb
    const follow = Math.min(ry * 0.42, 5.5)
    look.current.set(0.4, 4.6 + follow, 0)
    const a = 0.32 + az.get()
    const R0 = 27
    const camY = 1.6 + follow * 0.35 + el.get() * 10
    camera.position.set(Math.sin(a) * R0, camY, Math.cos(a) * R0)
    camera.lookAt(look.current)
  })

  return (
    <>
      <hemisphereLight args={['#f4f1ea', '#a39b8b', 1.05]} />
      <directionalLight
        position={[15, 16, 12]}
        intensity={3.2}
        color="#fff7ea"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={18}
        shadow-camera-bottom={-6}
        shadow-camera-far={60}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
      <pointLight ref={glow} position={[0, 0.4, 1.2]} color="#ffc27a" intensity={0} distance={18} decay={1.6} />
      <group ref={group} visible={ready}>
        <mesh geometry={R.sky} renderOrder={-1}>
          <meshBasicMaterial vertexColors side={THREE.BackSide} depthWrite={false} />
        </mesh>
        <mesh geometry={R.ridge} position={[0, 0, -150]}>
          <meshBasicMaterial color="#5f6660" />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#596040" roughness={1} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <circleGeometry args={[11, 48]} />
          <meshStandardMaterial color="#aaa69b" roughness={1} />
        </mesh>
        {/* pad + flame trench */}
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[3, 0.6, 3]} />
          <meshStandardMaterial color="#bdb8ac" roughness={1} />
        </mesh>
        <mesh position={[0, 0.31, 0]}>
          <boxGeometry args={[3.02, 0.4, 1.0]} />
          <meshStandardMaterial color="#2f2c27" roughness={1} />
        </mesh>
        <group position={[-2.05, 0, 0]}>
          <primitive object={R.tower} />
          {[3.6, 5.3].map((y, i) => (
            <group key={y} position={[0.65, y, 0]} ref={(g) => void (arms.current[i] = g)}>
              <mesh position={[0.55, 0, 0]} material={R.steel} castShadow>
                <boxGeometry args={[1.1, 0.14, 0.32]} />
              </mesh>
              <mesh position={[0.45, -0.3, 0]} rotation={[0, 0, 0.55]} material={R.steel} castShadow>
                <boxGeometry args={[0.9, 0.07, 0.07]} />
              </mesh>
            </group>
          ))}
        </group>
        <group ref={rocket} position={[0, 0.62, 0]}>
          <mesh geometry={R.body} castShadow receiveShadow>
            <meshStandardMaterial map={R.tex} roughness={0.45} metalness={0.05} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} geometry={R.finGeo} rotation={[0, (i * Math.PI) / 2 + Math.PI / 4, 0]} castShadow>
              <meshStandardMaterial color="#1d1b17" roughness={0.6} />
            </mesh>
          ))}
          <group ref={flame} visible={false}>
            <mesh position={[0, -1.3, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.42, 2.6, 20, 1, true]} />
              <meshBasicMaterial color={new THREE.Color(2.2, 1.7, 1.0)} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.75, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.3, 1.3, 16, 1, true]} />
              <meshBasicMaterial color={new THREE.Color(3, 2.9, 2.6)} toneMapped={false} />
            </mesh>
          </group>
        </group>
        <primitive object={R.smoke.mesh} />
      </group>
    </>
  )
}

/** offset of `el` inside `root`, in layout px (ignores CSS transforms — the sheet slides in) */
function layoutBox(el: HTMLElement, root: HTMLElement) {
  let x = 0
  let y = 0
  let n: HTMLElement | null = el
  while (n && n !== root) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

/**
 * keeps the print box on `.np-photo` and frames the camera inside it: a full-canvas perspective whose
 * projection centre is shifted to the box centre and whose fov makes the box show the intended view
 */
function PhotoBox({ fx, photo, sheet }: { fx: NewspaperEffect; photo: React.RefObject<HTMLDivElement | null>; sheet: React.RefObject<HTMLDivElement | null> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const last = useRef('')
  useFrame(() => {
    const el = photo.current
    const root = sheet.current
    if (!el || !root) return
    const W = root.offsetWidth
    const H = root.offsetHeight
    const b = layoutBox(el, root)
    if (W < 2 || H < 2 || b.w < 2) return
    const key = `${W}x${H}:${b.x},${b.y},${b.w},${b.h}`
    if (key !== last.current) {
      last.current = key
      // the fold runs through the middle of the sheet; the low-ink band across the lower body text
      setNewspaperFrame(fx, { x0: b.x / W, top: b.y / H, x1: (b.x + b.w) / W, bottom: (b.y + b.h) / H }, 1.4, 0.5, MOBILE ? 0.78 : 0.68)
    }
    const boxAspect = b.w / b.h
    const fovBox = Math.max(THREE.MathUtils.degToRad(33), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(27)) / boxAspect))
    camera.aspect = W / H
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(fovBox / 2) * H) / b.h))
    camera.updateProjectionMatrix()
    const cx = ((b.x + b.w / 2) / W) * 2 - 1
    const cy = 1 - ((b.y + b.h / 2) / H) * 2
    camera.projectionMatrix.elements[8] = -cx
    camera.projectionMatrix.elements[9] = -cy
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  })
  return null
}

/* ------------------------------------------------------------------ page */

export default function OldNewspaper() {
  const [mode, setMode] = useState<NewspaperMode>('extra')
  const [quality, setQuality] = useState<NewspaperQuality>('poor')
  const fx = useMemo(() => createNewspaperEffect(), [])
  const original = useMemo(() => createNewspaperOriginal(fx), [fx])
  const preload = useMemo(() => [fx, original], [fx, original])
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const lastInput = useRef(POSTER ? Infinity : performance.now())
  const sheet = useRef<HTMLDivElement>(null)
  const photo = useRef<HTMLDivElement>(null)
  const clock = useRef(0)
  const [printed, setPrinted] = useState(STILL)

  useEffect(() => setNewspaperMode(fx, mode), [fx, mode])
  useEffect(() => setNewspaperQuality(fx, quality), [fx, quality])

  // the page slides in once the print shader is on screen (and its reveal wipe has run under cover)
  useEffect(() => {
    if (printed) return
    let id = 0
    const t0 = performance.now()
    const poll = () => {
      const st = (fx as NewspaperEffect).np
      if (st.shown !== undefined && performance.now() - st.shown > 950) setPrinted(true)
      else if (performance.now() - t0 > 6000) setPrinted(true)
      else id = requestAnimationFrame(poll)
    }
    id = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(id)
  }, [fx, printed])

  const splitOpen = useRef(false)
  splitOpen.current = split.open
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastInput.current < 12000 || splitOpen.current) return
      setMode((m) => newspaperModes[(newspaperModes.findIndex((o) => o.id === m) + 1) % newspaperModes.length].id)
    }, CYCLE_EVERY)
    return () => clearInterval(id)
  }, [])
  const touch = () => (lastInput.current = performance.now())

  // drag: walk around the gantry (Motion inertia on release)
  const az = useMotionValue(0)
  const el = useMotionValue(0)
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const anims = useRef<{ stop: () => void }[]>([])
  const onDown = (e: React.PointerEvent) => {
    touch()
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    anims.current.forEach((a) => a.stop())
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    az.set(THREE.MathUtils.clamp(az.get() - (e.clientX - d.x) * 0.004, -1.1, 1.1))
    el.set(THREE.MathUtils.clamp(el.get() - (e.clientY - d.y) * 0.0012, -0.08, 0.35))
    d.x = e.clientX
    d.y = e.clientY
  }
  const onUp = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.id !== e.pointerId) return
    drag.current = null
    touch()
    anims.current = [
      animate(az, az.get(), { type: 'inertia', velocity: az.getVelocity(), power: 0.35, timeConstant: 550, min: -1.1, max: 1.1, bounceStiffness: 140, bounceDamping: 18 }),
      animate(el, el.get(), { type: 'inertia', velocity: el.getVelocity(), power: 0.3, timeConstant: 400, min: -0.08, max: 0.35, bounceStiffness: 160, bounceDamping: 18 }),
    ]
  }

  const E = ED[mode]
  const label = newspaperModes.find((m) => m.id === mode)!.label
  const ink = { initial: { opacity: 0, filter: 'blur(3px)' }, animate: { opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(3px)' }, transition: { duration: 0.45 } }

  return (
    <div
      className={`stage np np-${mode} np-q-${quality}${split.open ? ' np-split' : ''}${POSTER ? ' np-poster' : ''}`}
      style={{ background: '#2a2723' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="np-rough" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="1.8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {!printed && <div className="np-press">滚筒印刷中…</div>}
      <motion.div
        ref={sheet}
        className="np-sheet"
        initial={STILL ? false : { y: '108%', rotate: -5, scale: 1.03 }}
        animate={printed ? { y: 0, rotate: 0, scale: 1 } : undefined}
        transition={{ type: 'spring', stiffness: 70, damping: 16, mass: 1.1 }}
      >
        <Canvas
          shadows="percentage"
          dpr={[1, 2]}
          resize={{ offsetSize: true }}
          gl={{ antialias: false, alpha: false }}
          camera={{ position: [8, 2, 26], fov: 40, near: 0.5, far: 800 }}
        >
          <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={newspaperMeta.background} preload={preload} />
          <LaunchSite az={az} el={el} clock={clock} />
          <PhotoBox fx={fx} photo={photo} sheet={sheet} />
        </Canvas>

        <div className="np-page">
          <header className="np-mast">
            <div className="np-ear l">
              <b>今日四版</b>
              <span>本埠零售 每份五分</span>
            </div>
            <div className="np-title">
              <span className="np-en">Motion Daily</span>
              <span className="np-dot">·</span>
              <span className="np-zh">动效日报</span>
            </div>
            <div className="np-ear r">
              <b>天气 晴</b>
              <span>偏北风 三到四级</span>
            </div>
          </header>
          <div className="np-dateline">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={mode + 'n'} {...ink}>
                {E.no}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={mode + 'd'} className="np-date" {...ink}>
                {E.date}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={mode + 'k'} {...ink}>
                {E.kicker}
              </motion.b>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1
              key={mode}
              className="np-banner"
              initial={{ opacity: 0, scale: 1.06, filter: 'blur(4px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <span>{E.banner}</span>
            </motion.h1>
          </AnimatePresence>
          <div className="np-deck">
            <i />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={mode} {...ink}>
                {E.deck}
              </motion.span>
            </AnimatePresence>
            <i />
          </div>
          <div className="np-body">
            <div className="np-cols">
              {BODY.map((b, i) => (
                <div key={i} className="np-para">
                  {b.h && <h3>{b.h}</h3>}
                  <p>{b.p}</p>
                </div>
              ))}
            </div>
            <span className="np-vrule" />
            <figure className="np-fig">
              <div className="np-photo" ref={photo} />
              <figcaption>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={mode} {...ink}>
                    {E.caption}
                  </motion.span>
                </AnimatePresence>
              </figcaption>
            </figure>
          </div>
        </div>
      </motion.div>

      <div className="overlay">
        <OriginalSplit split={split} label={label} />
        <div className="dock" onPointerDown={touch}>
          <Seg items={newspaperModes.map((m) => ({ value: m.id, label: MOBILE ? ED[m.id].short : m.label }))} value={mode} onChange={setMode} />
          <span className="dock-sep" />
          {MOBILE ? (
            <button className="seg np-cycle" onClick={() => setQuality((q) => (q === 'poor' ? 'good' : 'poor'))}>
              <span>{QUAL.find((q) => q.id === quality)!.label}</span>
            </button>
          ) : (
            <>
              <span className="np-lab">印刷质量</span>
              <Seg items={QUAL.map((q) => ({ value: q.id, label: q.label }))} value={quality} onChange={setQuality} />
            </>
          )}
          <span className="dock-sep" />
          <button className="seg np-btn" aria-pressed={split.open} onClick={split.toggle}>
            {split.open && <motion.span layoutId="np-split" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">拖动转到发射塔另一侧 · 闲置时自动换版</p>
      </div>
    </div>
  )
}

const css = `
.np { cursor: grab; touch-action: none; overflow: hidden; }
.np:active { cursor: grabbing; }
.np canvas { display: block; }
.np-press {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  font: 500 13px/1 var(--mono); letter-spacing: .2em; color: rgba(236, 228, 210, .55);
  animation: np-blink 1.2s ease-in-out infinite;
}
@keyframes np-blink { 50% { opacity: .35; } }
.np-sheet {
  position: absolute; inset: 0; overflow: hidden; transform-origin: 50% 100%;
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, .6);
}
.np-sheet > div:first-child { position: absolute !important; inset: 0; }
.np-page {
  position: absolute; inset: 0; pointer-events: none;
  display: flex; flex-direction: column;
  padding: 74px clamp(24px, 3.4vw, 54px) 104px;
  color: #1d1a16; mix-blend-mode: multiply;
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(var(--band) - 46px), rgba(0,0,0,var(--low)) var(--band), #000 calc(var(--band) + 46px));
          mask-image: linear-gradient(to bottom, #000 calc(var(--band) - 46px), rgba(0,0,0,var(--low)) var(--band), #000 calc(var(--band) + 46px));
  --band: 68%; --low: .5;
}
.np-q-good .np-page { --low: .82; }
.np-poster .np-page { padding-top: 28px; padding-bottom: 34px; }
.np-page * { text-shadow: 0 0 .7px rgba(29, 26, 22, .55); }
.np-mast { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 18px; }
.np-ear {
  justify-self: start; display: flex; flex-direction: column; gap: 3px; padding: 5px 10px;
  border: 1px solid currentColor; font-size: 11px; line-height: 1.25;
}
.np-ear b { font-size: 13px; letter-spacing: .1em; }
.np-ear.r { justify-self: end; text-align: right; }
.np-title { display: flex; align-items: baseline; gap: 14px; white-space: nowrap; filter: url(#np-rough); }
.np-en {
  font: 400 clamp(36px, 5.6vh, 58px)/1 "Old English Text MT", "Engravers Old English BT", "UnifrakturMaguntia", "Times New Roman", serif;
  letter-spacing: .01em;
}
.np-dot { font: 700 26px/1 Georgia, serif; }
.np-zh { font: 700 clamp(30px, 4.6vh, 46px)/1 "STXingkai", "华文行楷", "STKaiti", "KaiTi", "楷体", serif; letter-spacing: .06em; }
.np-dateline {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; padding: 4px 2px;
  border-top: 3px double currentColor; border-bottom: 1px solid currentColor;
  font: 500 12px/1.3 Georgia, "Songti SC", "SimSun", serif; letter-spacing: .06em; white-space: nowrap;
}
.np-dateline b { letter-spacing: .14em; }
.np-banner {
  margin: 4px 0 0; text-align: center; white-space: nowrap; filter: url(#np-rough);
  font: 900 clamp(56px, 11vh, 108px)/1.08 "Microsoft YaHei", "PingFang SC", "Heiti SC", "SimHei", sans-serif;
  letter-spacing: -.02em;
}
.np-banner span { display: inline-block; transform: scaleX(.84); }
.np-deck { display: flex; align-items: center; gap: 14px; margin: 0 0 10px; font: 700 16px/1.4 "Songti SC", "STSong", "SimSun", serif; letter-spacing: .08em; }
.np-deck i { flex: 1; height: 0; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; padding-top: 2px; }
.np-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1.62fr); gap: 18px; border-top: 1px solid currentColor; padding-top: 10px; }
.np-cols { columns: 2; column-gap: 18px; column-rule: 1px solid rgba(29, 26, 22, .8); column-fill: auto; height: 100%; overflow: hidden; }
.np-para h3 { margin: 2px 0 4px; font: 900 15px/1.3 "Microsoft YaHei", "SimHei", sans-serif; letter-spacing: .12em; text-align: center; border-bottom: 1px solid currentColor; padding-bottom: 3px; }
.np-para p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.62; text-align: justify; text-indent: 2em; }
.np-vrule { background: currentColor; }
.np-fig { margin: 0; display: flex; flex-direction: column; min-height: 0; }
.np-photo { flex: 1; min-height: 0; }
.np-fig figcaption { margin-top: 8px; min-height: 2.9em; font: 600 12.5px/1.45 "Songti SC", "STSong", "SimSun", serif; }
.np-fig figcaption span { display: block; }
.np-lab { font: 500 12px/1 var(--sans); color: var(--fg-2); padding: 0 2px 0 8px; }
.np-btn span, .np-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.np .hint { transition: opacity .4s; color: #3b352c; padding: 4px 10px; border-radius: 999px; background: rgba(233, 223, 199, .82); }
.np-split .hint { opacity: 0; }
@media (max-width: 760px) {
  .np-page { padding: 74px 16px 92px; --band: 78%; }
  .np-mast { grid-template-columns: 1fr; }
  .np-ear { display: none; }
  .np-title { justify-self: center; gap: 8px; }
  .np-en { font-size: 30px; }
  .np-zh { font-size: 24px; }
  .np-dot { font-size: 18px; }
  .np-dateline { font-size: 10px; letter-spacing: .02em; margin-top: 6px; }
  .np-date { display: none; }
  .np-banner { font-size: 54px; }
  .np-deck { font-size: 12px; letter-spacing: .02em; margin-bottom: 8px; }
  .np-deck i { display: none; }
  .np-deck span { text-align: center; width: 100%; }
  .np-body { display: flex; flex-direction: column; gap: 10px; }
  .np-vrule { display: none; }
  .np-fig { order: -1; flex: 0 0 auto; }
  .np-photo { flex: 0 0 auto; height: min(40vh, 330px); }
  .np-fig figcaption { font-size: 11px; min-height: 0; }
  .np-cols { columns: 1; flex: 1; min-height: 0; }
  .np-para:nth-child(n + 3) { display: none; }
  .np-para p { font-size: 12px; }
  .np .dock .seg { padding: 0 9px; }
  .np .dock .dock-sep { margin: 0 1px; }
}
`
