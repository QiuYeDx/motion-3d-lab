import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, motionValue, type AnimationPlaybackControls, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { POSTER } from '../../lib/iso'
import { CARD_D, CARD_H, CARD_W, EYE, H, N, PER, RAIL_Y, ROPE_L, SEG, anchorX, cardFrame, cardST, makeSim, type Sim } from './ropeSim'
import { useStudioStart } from './studioEnv'

/* ------------------------------------------------------------------ content */

type Icon = 'home' | 'work' | 'about' | 'blog' | 'mail'
type Section = { label: string; en: string; bg: string; ink: string; accent: string; icon: Icon; title: string; body: string; items: [string, string][] }

const SECTIONS: Section[] = [
  {
    label: '首页',
    en: 'HOME',
    bg: '#2d2d33',
    ink: '#f7f2e9',
    accent: '#ff6b4a',
    icon: 'home',
    title: '欢迎来到 Motion Lab',
    body: '这里收集了一些让界面“有重量”的小实验：会摆的菜单、会塌的积木、会被风吹皱的旗子。',
    items: [
      ['最近更新', '绳索菜单 · 魔方'],
      ['实验数量', '110+'],
      ['技术栈', 'R3F · Motion · Verlet'],
    ],
  },
  {
    label: '作品',
    en: 'WORK',
    bg: '#ff6b4a',
    ink: '#fffaf3',
    accent: '#2d2d33',
    icon: 'work',
    title: '精选作品',
    body: '把物理感带进产品界面的几次尝试，从落地页首屏到可交互的产品配置器。',
    items: [
      ['产品配置器', '2026'],
      ['布料旗帜 · 品牌首屏', '2026'],
      ['多米诺 · 引导动画', '2025'],
      ['等距小岛 · 插画站', '2025'],
    ],
  },
  {
    label: '关于',
    en: 'ABOUT',
    bg: '#fbf7ef',
    ink: '#2d2d33',
    accent: '#3b6cf6',
    icon: 'about',
    title: '关于这个实验室',
    body: '一个做界面动效的小角落。相信好的动效不是装饰，而是让人一眼看懂“这个东西怎么动、能拿它做什么”。',
    items: [
      ['坐标', '上海 · 远程'],
      ['在做', '物理驱动的界面组件'],
      ['喜欢', '弹簧、绳子、纸'],
    ],
  },
  {
    label: '博客',
    en: 'BLOG',
    bg: '#f4b63f',
    ink: '#2d2d33',
    accent: '#2d2d33',
    icon: 'blog',
    title: '最近的文章',
    body: '写一些做动效时踩过的坑，和那些让它看起来“对了”的小参数。',
    items: [
      ['Verlet 绳子为什么不会断', '10-08'],
      ['给弹簧选阻尼的直觉', '09-21'],
      ['固定步长：60 fps 也要稳', '09-02'],
    ],
  },
  {
    label: '联系',
    en: 'CONTACT',
    bg: '#3b6cf6',
    ink: '#f5f8ff',
    accent: '#ffd45c',
    icon: 'mail',
    title: '打个招呼',
    body: '有想一起做的动效、想聊的项目，或者只是发现了一个 bug，都欢迎来信。',
    items: [
      ['邮箱', 'hello@example.com'],
      ['即刻 / 微博', '@motionlab'],
      ['回复时间', '通常 1–2 天'],
    ],
  },
]

const FONT = '"Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif'
const MONO = '"Cascadia Code", Consolas, "SF Mono", monospace'

/* ------------------------------------------------------------------ card textures */

function drawIcon(x: CanvasRenderingContext2D, icon: Icon, col: string) {
  x.strokeStyle = col
  x.fillStyle = col
  x.lineWidth = 16
  x.lineCap = 'round'
  x.lineJoin = 'round'
  x.beginPath()
  if (icon === 'home') {
    x.moveTo(-70, -8)
    x.lineTo(0, -70)
    x.lineTo(70, -8)
    x.moveTo(-50, -26)
    x.lineTo(-50, 62)
    x.lineTo(50, 62)
    x.lineTo(50, -26)
    x.stroke()
    x.beginPath()
    x.roundRect(-16, 18, 32, 44, 8)
    x.fill()
  } else if (icon === 'work') {
    for (let i = 0; i < 4; i++) {
      const gx = (i % 2) * 74 - 64
      const gy = Math.floor(i / 2) * 74 - 64
      x.beginPath()
      x.roundRect(gx, gy, 54, 54, 14)
      if (i === 1) x.fill()
      else x.stroke()
    }
  } else if (icon === 'about') {
    x.arc(0, -30, 32, 0, Math.PI * 2)
    x.stroke()
    x.beginPath()
    x.moveTo(-62, 68)
    x.bezierCurveTo(-58, 18, 58, 18, 62, 68)
    x.stroke()
  } else if (icon === 'blog') {
    x.roundRect(-56, -70, 112, 140, 14)
    x.stroke()
    for (let i = 0; i < 3; i++) {
      x.beginPath()
      x.moveTo(-30, -30 + i * 30)
      x.lineTo(i === 2 ? 6 : 30, -30 + i * 30)
      x.stroke()
    }
  } else {
    x.roundRect(-74, -50, 148, 100, 14)
    x.stroke()
    x.beginPath()
    x.moveTo(-60, -36)
    x.lineTo(0, 10)
    x.lineTo(60, -36)
    x.stroke()
  }
}

function cardTexture(s: Section, i: number) {
  const W = 600
  const Hh = Math.round((W * CARD_H) / CARD_W)
  const c = document.createElement('canvas')
  c.width = W
  c.height = Hh
  const x = c.getContext('2d')!
  x.fillStyle = s.bg
  x.fillRect(0, 0, W, Hh)
  // fine paper grain
  let seed = 11 + i * 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let k = 0; k < 2600; k++) {
    x.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)'
    x.fillRect(rnd() * W, rnd() * Hh, 2, 2)
  }
  // eyelet (the rope's ring hooks here)
  const ey = (EYE / CARD_H) * Hh
  x.fillStyle = 'rgba(0,0,0,0.28)'
  x.beginPath()
  x.arc(W / 2, ey, 22, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = '#d9a441'
  x.lineWidth = 7
  x.beginPath()
  x.arc(W / 2, ey, 24, 0, Math.PI * 2)
  x.stroke()
  // index + english
  x.fillStyle = s.ink
  x.globalAlpha = 0.7
  x.font = `600 30px ${MONO}`
  x.textBaseline = 'middle'
  x.fillText(String(i + 1).padStart(2, '0'), 44, ey)
  x.textAlign = 'right'
  x.fillText(s.en, W - 44, ey)
  x.globalAlpha = 1
  x.textAlign = 'left'
  // icon
  x.save()
  x.translate(W / 2, Hh * 0.43)
  drawIcon(x, s.icon, s.ink)
  x.restore()
  // accent dot on the icon
  x.fillStyle = s.accent
  x.beginPath()
  x.arc(W / 2 + 78, Hh * 0.43 - 74, 14, 0, Math.PI * 2)
  x.fill()
  // label
  x.fillStyle = s.ink
  x.font = `800 150px ${FONT}`
  x.textAlign = 'center'
  x.textBaseline = 'alphabetic'
  x.fillText(s.label, W / 2, Hh * 0.86)
  // bottom rule
  x.globalAlpha = 0.35
  x.fillRect(W / 2 - 40, Hh * 0.92, 80, 5)
  x.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(64, 64, 10, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ------------------------------------------------------------------ controller */

type Mode = 'sim' | 'open' | 'closing'

type Ctl = {
  sim: Sim
  mode: Mode[]
  open: MotionValue<number>[]
  hover: MotionValue<number>[]
  gust: MotionValue<number>
  fromPos: THREE.Vector3[]
  fromQ: THREE.Quaternion[]
  lastUser: number
  openCard: number
  setOpenCard: (c: number) => void
  anims: AnimationPlaybackControls[]
}

/* ------------------------------------------------------------------ scene */

const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _bx = new THREE.Vector3()
const _by = new THREE.Vector3()
const _bz = new THREE.Vector3()
const UPY = new THREE.Vector3(0, 1, 0)

function Scene({ ctl, onReady }: { ctl: Ctl; onReady: () => void }) {
  const { sim } = ctl
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const { width, height } = useThree((s) => s.size)
  const rootRef = useRef<THREE.Group>(null)
  const cardRefs = useRef<(THREE.Group | null)[]>([])
  const meshRefs = useRef<(THREE.Mesh | null)[]>([])
  const glowRefs = useRef<(THREE.Mesh | null)[]>([])
  const ropeRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)

  useStudioStart(rootRef, onReady)

  const assets = useMemo(() => {
    const geo = new RoundedBoxGeometry(CARD_W, CARD_H, CARD_D, 3, 0.035)
    const mats = SECTIONS.map((s, i) => {
      const map = cardTexture(s, i)
      const side = new THREE.MeshStandardMaterial({ color: s.bg, roughness: 0.6 })
      const front = new THREE.MeshStandardMaterial({ map, roughness: 0.55, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0 })
      const back = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.bg).multiplyScalar(0.9), roughness: 0.65 })
      return { arr: [side, side, side, side, front, back], front }
    })
    const glowMap = glowTexture()
    const glows = SECTIONS.map((s) => new THREE.MeshBasicMaterial({ map: glowMap, color: s.bg === '#fbf7ef' ? '#ffd27a' : s.bg, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }))
    const rope = new THREE.CylinderGeometry(0.02, 0.02, 1, 6, 1)
    const ropeMat = new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.9 })
    const ring = new THREE.TorusGeometry(0.06, 0.016, 8, 20)
    const brass = new THREE.MeshStandardMaterial({ color: '#d9a441', roughness: 0.3, metalness: 0.7 })
    return { geo, mats, glows, rope, ropeMat, ring, brass }
  }, [])

  const st = useMemo(
    () => ({
      acc: 0,
      ray: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      plane0: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hit: new THREE.Vector3(),
      pid: -1,
      downX: 0,
      downY: 0,
      downT: 0,
      downCard: -1,
      hoverCard: -1,
      hopAt: new Array(N).fill(0),
      bpx: 0,
      bpy: 0,
      bt: 0,
      breezeOn: false,
      frame: { p: [0, 0, 0] as [number, number, number], x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] },
      presentP: new THREE.Vector3(),
      presentQ: new THREE.Quaternion(),
      tmpQ: new THREE.Quaternion(),
      swingQ: new THREE.Quaternion(),
      hangP: new THREE.Vector3(),
      ident: new THREE.Quaternion(),
      fit: { d: 20, y: 0.4 },
    }),
    [],
  )

  // pointer: grab / click / hover / breeze
  useEffect(() => {
    const el = gl.domElement
    const toNdc = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect()
      st.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      st.ray.setFromCamera(st.ndc, camera)
    }
    const pick = () => {
      if (!rootRef.current?.visible) return null
      const meshes = meshRefs.current.filter(Boolean) as THREE.Mesh[]
      const h = st.ray.intersectObjects(meshes, false)[0]
      return h ? { card: h.object.userData.card as number, point: h.point } : null
    }
    const down = (e: PointerEvent) => {
      if (POSTER || st.pid !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return
      st.pid = e.pointerId
      el.setPointerCapture(e.pointerId)
      ctl.lastUser = performance.now()
      st.downX = e.clientX
      st.downY = e.clientY
      st.downT = performance.now()
      toNdc(e.clientX, e.clientY)
      const h = pick()
      st.downCard = -1
      if (ctl.openCard >= 0) {
        // any press while a card is open closes it
        close()
        return
      }
      if (h && ctl.mode[h.card] === 'sim') {
        const { s, t } = cardST(sim, h.card, h.point.x, h.point.y, h.point.z)
        sim.grab.card = h.card
        sim.grab.s = s
        sim.grab.t = t
        sim.grab.x = h.point.x
        sim.grab.y = h.point.y
        sim.grab.z = h.point.z
        st.plane.constant = -h.point.z
        st.downCard = h.card
        el.style.cursor = 'grabbing'
      }
    }
    const move = (e: PointerEvent) => {
      toNdc(e.clientX, e.clientY)
      const now = performance.now()
      // breeze from pointer motion (plane z = 0)
      if (st.ray.ray.intersectPlane(st.plane0, st.hit)) {
        const dt = Math.max(0.008, (now - st.bt) / 1000)
        if (st.bt) {
          const vx = (st.hit.x - st.bpx) / dt
          const vy = (st.hit.y - st.bpy) / dt
          sim.env.bvx = THREE.MathUtils.lerp(sim.env.bvx, THREE.MathUtils.clamp(vx, -14, 14), 0.35)
          sim.env.bvy = THREE.MathUtils.lerp(sim.env.bvy, THREE.MathUtils.clamp(vy, -14, 14), 0.35)
        }
        st.bpx = sim.env.bx = st.hit.x
        st.bpy = sim.env.by = st.hit.y
        st.bt = now
        st.breezeOn = sim.grab.card < 0
      }
      if (e.pointerId === st.pid && sim.grab.card >= 0) {
        ctl.lastUser = now
        if (st.ray.ray.intersectPlane(st.plane, st.hit)) {
          sim.grab.x = st.hit.x
          sim.grab.y = Math.max(st.hit.y, -6)
          sim.grab.z = st.hit.z
        }
        return
      }
      if (e.pointerType !== 'mouse' || POSTER) return
      const h = pick()
      const c = h && ctl.mode[h.card] === 'sim' && ctl.openCard < 0 ? h.card : -1
      if (c !== st.hoverCard) {
        if (st.hoverCard >= 0) ctl.anims.push(animate(ctl.hover[st.hoverCard], 0, { duration: 0.35 }))
        st.hoverCard = c
        if (c >= 0) {
          ctl.anims.push(animate(ctl.hover[c], 1, { type: 'spring', stiffness: 300, damping: 22 }))
          if (now - st.hopAt[c] > 600) {
            st.hopAt[c] = now
            sim.kick(c, 0, 2.6, 0, 0)
          }
        }
      }
      el.style.cursor = c >= 0 ? 'pointer' : ctl.openCard >= 0 ? 'pointer' : 'default'
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== st.pid) return
      st.pid = -1
      const c = sim.grab.card
      sim.grab.card = -1
      if (c >= 0) sim.clampVel(c, 6.5)
      el.style.cursor = 'default'
      ctl.lastUser = performance.now()
      const moved = Math.hypot(e.clientX - st.downX, e.clientY - st.downY)
      if (c >= 0 && st.downCard === c && moved < 7 && performance.now() - st.downT < 400) openCard(c)
      if (e.pointerType !== 'mouse') st.breezeOn = false
    }
    const leave = () => {
      st.breezeOn = false
      if (st.hoverCard >= 0) ctl.anims.push(animate(ctl.hover[st.hoverCard], 0, { duration: 0.35 }))
      st.hoverCard = -1
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera])

  // open / close (kinematic flight between the rope and the camera)
  const cardPose = (c: number, outP: THREE.Vector3, outQ: THREE.Quaternion) => {
    const g = cardRefs.current[c]
    if (g) {
      outP.copy(g.position)
      outQ.copy(g.quaternion)
    }
  }
  const openCard = (c: number) => {
    if (ctl.mode[c] !== 'sim') return
    if (st.hoverCard >= 0) ctl.anims.push(animate(ctl.hover[st.hoverCard], 0, { duration: 0.3 }))
    st.hoverCard = -1
    cardPose(c, ctl.fromPos[c], ctl.fromQ[c])
    sim.frozen[c] = 1
    ctl.mode[c] = 'open'
    ctl.openCard = c
    ctl.setOpenCard(c)
    ctl.open[c].jump(0)
    ctl.anims.push(animate(ctl.open[c], 1, { type: 'spring', stiffness: 95, damping: 15.5, restDelta: 0.001 }))
  }
  const close = () => {
    const c = ctl.openCard
    if (c < 0 || ctl.mode[c] !== 'open') return
    ctl.openCard = -1
    ctl.setOpenCard(-1)
    cardPose(c, ctl.fromPos[c], ctl.fromQ[c])
    ctl.mode[c] = 'closing'
    ctl.open[c].stop()
    ctl.open[c].jump(1)
    const a = animate(ctl.open[c], 0, { duration: 0.75, ease: [0.55, 0, 0.35, 1] })
    ctl.anims.push(a)
    a.finished.then(() => {
      if (ctl.mode[c] !== 'closing') return
      // hook it back on its rope and let it swing in
      const e = (c * PER + SEG) * 3
      sim.place(c, sim.pos[e], sim.pos[e + 1], sim.pos[e + 2])
      sim.frozen[c] = 0
      ctl.mode[c] = 'sim'
      sim.kick(c, (Math.random() - 0.5) * 2.5, 0, -2.6, 0)
    })
  }
  ;(ctl as unknown as { close: () => void }).close = close
  ;(ctl as unknown as { openFn: (c: number) => void }).openFn = openCard

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    // camera: fit the rail + cards, leave room for the copy (desktop) or lift above it (phones)
    const mobile = width < 760
    const aspect = width / height
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const sceneW = (N - 1) * 1.74 + CARD_W + 0.9
    const sceneTop = RAIL_Y + 0.35
    const sceneBot = RAIL_Y - Math.max(...ROPE_L) - CARD_H + EYE - 0.2
    const sceneH = sceneTop - sceneBot
    const fracW = POSTER ? 0.8 : mobile ? 1.03 : 0.56
    const fracH = POSTER ? 0.82 : mobile ? 0.5 : 0.8
    const d = Math.max(sceneW / fracW / (2 * tanH * aspect), sceneH / fracH / (2 * tanH))
    const cy = (sceneTop + sceneBot) / 2
    camera.position.set(0, cy + d * 0.05, d)
    camera.lookAt(0, cy, 0)
    const ox = mobile || POSTER ? 0 : 0.2
    const oy = POSTER ? 0 : mobile ? 0.165 : -0.045
    camera.setViewOffset(width, height, -ox * width, oy * height, width, height)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    // physics
    sim.env.wind = ctl.gust.get()
    sim.env.breeze = st.breezeOn ? 1 : 0
    sim.env.bvx *= Math.exp(-dt * 6)
    sim.env.bvy *= Math.exp(-dt * 6)
    st.acc += dt
    let n = 0
    while (st.acc >= H && n < 6) {
      sim.step()
      st.acc -= H
      n++
    }
    if (n === 6) st.acc = 0

    // presented pose (in front of the camera, beside the DOM panel)
    const f = mobile ? 0.28 : 0.42
    let D = CARD_H / (2 * f * tanH)
    D = Math.max(D, CARD_W / (2 * 0.62 * tanH * aspect))
    _v.set(mobile ? 0 : -0.36, mobile ? 0.52 : 0.02, 0.5).unproject(camera)
    _v.sub(camera.position).normalize()
    st.presentP.copy(camera.position).addScaledVector(_v, D)
    st.presentQ.copy(camera.quaternion)
    st.tmpQ.setFromAxisAngle(UPY, mobile ? 0 : 0.2)
    st.presentQ.multiply(st.tmpQ)

    // cards
    for (let c = 0; c < N; c++) {
      const g = cardRefs.current[c]
      if (!g) continue
      const mode = ctl.mode[c]
      if (mode === 'sim') {
        cardFrame(sim, c, st.frame)
        const fr = st.frame
        _bx.set(fr.x[0], fr.x[1], fr.x[2])
        _by.set(fr.y[0], fr.y[1], fr.y[2])
        _bz.set(fr.z[0], fr.z[1], fr.z[2])
        _m.makeBasis(_bx, _by, _bz)
        g.quaternion.setFromRotationMatrix(_m)
        g.position.set(fr.p[0], fr.p[1], fr.p[2])
      } else {
        const t = ctl.open[c].get()
        // where the card would hang on its rope right now
        const e = (c * PER + SEG) * 3
        st.hangP.set(sim.pos[e], sim.pos[e + 1] + EYE - CARD_H / 2, sim.pos[e + 2])
        if (mode === 'open') {
          g.position.lerpVectors(ctl.fromPos[c], st.presentP, t)
          g.position.y += Math.sin(Math.min(1, t) * Math.PI) * 0.6
          g.quaternion.slerpQuaternions(ctl.fromQ[c], st.presentQ, Math.min(1, Math.max(0, t)))
        } else {
          g.position.lerpVectors(st.hangP, ctl.fromPos[c], t)
          g.position.y += Math.sin(t * Math.PI) * 0.5
          g.quaternion.slerpQuaternions(st.ident, ctl.fromQ[c], t)
        }
        // swing forward on the way (bottom leads toward the camera)
        st.swingQ.setFromAxisAngle(_bx.set(1, 0, 0), -Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.75)
        g.quaternion.multiply(st.swingQ)
      }
      // hover glow
      const h = ctl.hover[c].get()
      assets.mats[c].front.emissiveIntensity = h * 0.1
      const glow = glowRefs.current[c]
      if (glow) {
        ;(glow.material as THREE.MeshBasicMaterial).opacity = h * 0.75
        glow.scale.setScalar(1 + h * 0.08)
      }
    }

    // ropes as instanced segments, rings at the rope ends
    const rope = ropeRef.current
    if (rope) {
      for (let c = 0; c < N; c++) {
        const b = c * PER
        for (let k = 0; k < SEG; k++) {
          const i = (b + k) * 3
          const j = (b + k + 1) * 3
          _bx.set(sim.pos[i], sim.pos[i + 1], sim.pos[i + 2])
          _by.set(sim.pos[j], sim.pos[j + 1], sim.pos[j + 2])
          _bz.subVectors(_by, _bx)
          const len = _bz.length()
          _q.setFromUnitVectors(UPY, _bz.divideScalar(len || 1))
          _v.addVectors(_bx, _by).multiplyScalar(0.5)
          _m.compose(_v, _q, _bz.set(1, len + 0.012, 1))
          rope.setMatrixAt(c * SEG + k, _m)
        }
      }
      rope.instanceMatrix.needsUpdate = true
      rope.computeBoundingSphere()
    }
    const ring = ringRef.current
    if (ring) {
      for (let c = 0; c < N; c++) {
        const e = (c * PER + SEG) * 3
        const prevE = (c * PER + SEG - 1) * 3
        _bx.set(sim.pos[e], sim.pos[e + 1], sim.pos[e + 2])
        _bz.set(sim.pos[prevE] - sim.pos[e], sim.pos[prevE + 1] - sim.pos[e + 1], sim.pos[prevE + 2] - sim.pos[e + 2]).normalize()
        _q.setFromUnitVectors(UPY, _bz)
        // ring hangs in the card plane, its top through the rope end
        _v.copy(_bx).addScaledVector(_bz, -0.045)
        _m.compose(_v, _q, _by.set(1, 1, 1))
        ring.setMatrixAt(c, _m)
      }
      ring.instanceMatrix.needsUpdate = true
      ring.computeBoundingSphere()
    }
  })

  const railW = (N - 1) * 1.74 + CARD_W + 0.7
  return (
    <>
      <group ref={rootRef}>
        {/* rail + mounts */}
        <mesh position={[0, RAIL_Y, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, railW, 24]} />
          <meshStandardMaterial color="#2d2d33" roughness={0.35} metalness={0.4} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh position={[(s * railW) / 2, RAIL_Y, 0]} castShadow>
              <sphereGeometry args={[0.1, 20, 14]} />
              <meshStandardMaterial color="#d9a441" roughness={0.3} metalness={0.7} />
            </mesh>
            {/* wall bracket: arm back to the wall + a round plate */}
            <mesh position={[s * (railW / 2 - 0.32), RAIL_Y, -0.27]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.028, 0.028, 0.56, 12]} />
              <meshStandardMaterial color="#2d2d33" roughness={0.45} metalness={0.4} />
            </mesh>
            <mesh position={[s * (railW / 2 - 0.32), RAIL_Y, -0.53]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 0.04, 28]} />
              <meshStandardMaterial color="#2d2d33" roughness={0.45} metalness={0.4} />
            </mesh>
          </group>
        ))}
        {Array.from({ length: N }, (_, c) => (
          <mesh key={c} position={[anchorX(c), RAIL_Y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[0.075, 0.018, 8, 20]} />
            <meshStandardMaterial color="#d9a441" roughness={0.3} metalness={0.7} />
          </mesh>
        ))}
        <instancedMesh ref={ropeRef} args={[assets.rope, assets.ropeMat, N * SEG]} castShadow frustumCulled={false} raycast={() => null} />
        <instancedMesh ref={ringRef} args={[assets.ring, assets.brass, N]} castShadow frustumCulled={false} raycast={() => null} />
        {SECTIONS.map((_, c) => (
          <group key={c} ref={(g) => void (cardRefs.current[c] = g)}>
            <mesh
              ref={(m) => void (glowRefs.current[c] = m)}
              position={[0, 0, -CARD_D / 2 - 0.02]}
              material={assets.glows[c]}
              raycast={() => null}
            >
              <planeGeometry args={[CARD_W * 1.9, CARD_H * 1.75]} />
            </mesh>
            <mesh
              ref={(m) => void (meshRefs.current[c] = m)}
              geometry={assets.geo}
              material={assets.mats[c].arr}
              userData={{ card: c }}
              castShadow
            />
          </group>
        ))}
      </group>
      {/* wall that catches the shadows */}
      <mesh position={[0, 0, -0.55]} receiveShadow raycast={() => null}>
        <planeGeometry args={[60, 40]} />
        <shadowMaterial opacity={0.13} color="#3b3226" />
      </mesh>
    </>
  )
}

function Lights() {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff6ea', 2.2)
    l.position.set(-4, 7, 9)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = -7
    cam.right = 7
    cam.top = 7
    cam.bottom = -7
    cam.near = 1
    cam.far = 30
    l.shadow.bias = -0.0004
    l.shadow.normalBias = 0.02
    l.target.position.set(0, 0.5, 0)
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#ffffff', '#e9dfcf', 0.6]} />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  )
}

/* ------------------------------------------------------------------ page */

export default function RopeMenu() {
  const [openCard, setOpenCard] = useState(-1)
  const ctl = useMemo<Ctl>(() => {
    const sim = makeSim()
    for (let i = 0; i < 120; i++) sim.step()
    return {
      sim,
      mode: SECTIONS.map(() => 'sim' as Mode),
      open: SECTIONS.map(() => motionValue(0)),
      hover: SECTIONS.map(() => motionValue(0)),
      gust: motionValue(0),
      fromPos: SECTIONS.map(() => new THREE.Vector3()),
      fromQ: SECTIONS.map(() => new THREE.Quaternion()),
      lastUser: -1e9,
      openCard: -1,
      setOpenCard: () => {},
      anims: [],
    }
  }, [])
  ctl.setOpenCard = setOpenCard
  const fns = ctl as unknown as { close?: () => void; openFn?: (c: number) => void }

  const user = () => (ctl.lastUser = performance.now())
  const gust = (strength = 1) => {
    ctl.anims.push(
      animate(ctl.gust, [ctl.gust.get(), strength, strength * 0.55, strength * 0.8, 0], {
        duration: 3.2,
        times: [0, 0.18, 0.45, 0.6, 1],
        ease: 'easeInOut',
      }),
    )
  }
  const pluck = () => {
    // swing the end card into its neighbours (Newton's-cradle style)
    const left = Math.random() < 0.5
    const c = left ? 0 : N - 1
    if (ctl.mode[c] === 'sim') ctl.sim.kick(c, left ? 7.5 : -7.5, 1.5, 0, 0)
  }
  const hopAll = () => {
    for (let c = 0; c < N; c++) setTimeout(() => ctl.mode[c] === 'sim' && ctl.sim.kick(c, 0, 3.2, 0, (c % 2 ? 1 : -1) * 0.8), c * 90)
  }

  const onReady = () => {
    if (POSTER) {
      ctl.sim.kick(0, 6.5, 1, 0, 0)
      return
    }
    // entrance: a ripple of hops along the rail, then a little swing
    for (let c = 0; c < N; c++) setTimeout(() => ctl.sim.kick(c, (c % 2 ? -1 : 1) * 1.6, 3.4, 0, 0), 120 + c * 110)
  }

  // ambient loop when idle: alternate a gentle gust and a pluck
  useEffect(() => {
    if (POSTER) return
    let k = 0
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      if (now - ctl.lastUser < 7000 || ctl.openCard >= 0 || now - last < 6500) return
      last = now
      if (k++ % 2 === 0) gust(0.45)
      else pluck()
    }, 500)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && fns.close?.()
    window.addEventListener('keydown', key)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('keydown', key)
      ctl.anims.forEach((a) => a.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sec = openCard >= 0 ? SECTIONS[openCard] : null
  const narrow = typeof window !== 'undefined' && window.innerWidth < 760

  return (
    <div className="stage rope-stage">
      <style>{`
        .rope-stage { background: radial-gradient(110% 90% at 66% 30%, #fbf9f4 0%, #f4f1ea 50%, #e9e4da 100%); touch-action: none; }
        .rope-stage canvas { touch-action: none; }
        .rope-stage .scrim { --soft-bg: #f4f1ea; }
        .rope-stage .hero-copy h1 em { color: #ff6b4a; }
        .rope-legend { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 22px; }
        .rope-legend button { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 12px 0 9px; border: 0; border-radius: 999px; background: rgba(255,255,255,.7); box-shadow: inset 0 0 0 1px rgba(45,45,51,.09); font: 500 13px/1 var(--sans); color: var(--fg); cursor: pointer; transition: background .2s, transform .15s var(--ease-out); }
        .rope-legend button:hover { background: #fff; }
        .rope-legend button:active { transform: scale(.96); }
        .rope-legend i { width: 10px; height: 10px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
        .rope-panel-wrap { position: absolute; inset: 72px clamp(20px, 5vw, 80px) 24px auto; display: flex; align-items: center; pointer-events: none !important; }
        .rope-panel { position: relative; pointer-events: auto; width: min(420px, 38vw); border-radius: 26px; background: rgba(255,255,255,.88); backdrop-filter: blur(18px) saturate(1.3); -webkit-backdrop-filter: blur(18px) saturate(1.3); box-shadow: 0 30px 80px -30px rgba(50,40,30,.45), inset 0 0 0 1px rgba(45,45,51,.07); padding: 30px 30px 26px; color: #2d2d33; }
        .rope-panel .bar { height: 6px; width: 54px; border-radius: 3px; margin-bottom: 22px; }
        .rope-panel small { font: 500 12px/1 var(--mono); letter-spacing: .1em; color: #8a8478; }
        .rope-panel h2 { margin: 12px 0 0; font: 650 32px/1.15 var(--display); letter-spacing: -.02em; }
        .rope-panel p { margin: 14px 0 0; font-size: 15px; line-height: 1.75; color: #5a554d; }
        .rope-panel ul { list-style: none; margin: 22px 0 0; padding: 0; border-top: 1px solid rgba(45,45,51,.08); }
        .rope-panel li { display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-bottom: 1px solid rgba(45,45,51,.08); font-size: 14px; }
        .rope-panel li span:last-child { font: 500 13px/1.4 var(--mono); color: #8a8478; text-align: right; }
        .rope-panel .close { position: absolute; right: 16px; top: 16px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(45,45,51,.06); color: #2d2d33; font-size: 18px; cursor: pointer; transition: background .2s; }
        .rope-panel .close:hover { background: rgba(45,45,51,.12); }
        .rope-panel .go { margin-top: 22px; }
        @media (max-width: 760px) {
          .rope-stage .hero-copy p.rope-lede { font-size: 14px; line-height: 1.65; }
          .rope-stage .hero-actions { display: none; }
          .rope-legend { display: none; }
          .rope-panel-wrap { inset: auto 12px 12px 12px; height: 58%; align-items: flex-end; }
          .rope-panel { width: 100%; max-height: 100%; overflow: auto; padding: 24px 22px 20px; border-radius: 24px; }
          .rope-panel h2 { font-size: 26px; }
        }
      `}</style>
      <Canvas shadows="percentage" dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 200, position: [0, 1, 24] }} gl={{ antialias: true, alpha: true }} onCreated={({ gl }) => void (gl.toneMapping = THREE.NeutralToneMapping)}>
        <Lights />
        <Scene ctl={ctl} onReady={onReady} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: openCard >= 0 ? 0 : 1, x: openCard >= 0 ? -16 : 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          style={{ pointerEvents: openCard >= 0 ? 'none' : 'auto' }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i /> Verlet ropes · 5 × 12 段
          </p>
          <h1>
            会<em>摆荡</em>的
            <br />
            导航菜单
          </h1>
          <p className="rope-lede">每张卡片吊在一根 12 段的 Verlet 绳上。拽住甩一下，它会荡回来撞上邻居，再慢慢停稳；鼠标划过会带起一点风，悬停的卡片轻轻一跳，点一下把它拉到眼前打开。</p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                user()
                gust(1)
              }}
            >
              吹一阵风
            </button>
            <button
              className="btn"
              onClick={() => {
                user()
                pluck()
              }}
            >
              拨一下
            </button>
          </div>
          <div className="rope-legend">
            {SECTIONS.map((s, c) => (
              <button
                key={c}
                onClick={() => {
                  user()
                  fns.openFn?.(c)
                }}
              >
                <i style={{ background: s.bg }} /> {s.label}
              </button>
            ))}
          </div>
        </motion.div>

        <div className="rope-panel-wrap">
        <AnimatePresence>
          {sec && (
            <motion.aside
              key={openCard}
              className="rope-panel"
              initial={narrow ? { opacity: 0, y: 60 } : { opacity: 0, x: 40, scale: 0.98 }}
              animate={narrow ? { opacity: 1, y: 0 } : { opacity: 1, x: 0, scale: 1 }}
              exit={narrow ? { opacity: 0, y: 50, transition: { duration: 0.22 } } : { opacity: 0, x: 30, scale: 0.98, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.18 }}
            >
              <button className="close" aria-label="关闭" onClick={() => fns.close?.()}>
                ×
              </button>
              <div className="bar" style={{ background: sec.bg === '#fbf7ef' ? '#2d2d33' : sec.bg }} />
              <small>
                {String(openCard + 1).padStart(2, '0')} · {sec.en}
              </small>
              <h2>{sec.title}</h2>
              <p>{sec.body}</p>
              <ul>
                {sec.items.map(([a, b]) => (
                  <li key={a}>
                    <span>{a}</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button className="btn primary go" onClick={() => fns.close?.()}>
                挂回去
              </button>
            </motion.aside>
          )}
        </AnimatePresence>
        </div>

        <div className="dock" style={{ opacity: openCard >= 0 ? 0 : 1, pointerEvents: openCard >= 0 ? 'none' : 'auto', transition: 'opacity .3s' }}>
          <button
            className="seg"
            onClick={() => {
              user()
              gust(1)
            }}
          >
            <span>吹一阵风</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              pluck()
            }}
          >
            <span>拨一下</span>
          </button>
          <button
            className="seg"
            onClick={() => {
              user()
              hopAll()
            }}
          >
            <span>全部跳一下</span>
          </button>
        </div>
        <p className="hint" style={{ opacity: openCard >= 0 ? 0 : 1, transition: 'opacity .3s' }}>
          拖动卡片甩一甩 · 点击打开 · Esc / 点空白处收回
        </p>
      </div>
    </div>
  )
}
