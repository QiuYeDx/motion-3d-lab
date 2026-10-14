import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { Stylize, createOriginalEffect } from '../../lib/stylize'
import { OriginalSplit, useOriginalSplit } from './OriginalSplit'
import { usePrecompiled } from './precompile'
import {
  captureVectorPersistence,
  createVectorEffect,
  disposeVectorPersistence,
  setVectorMode,
  setVectorPersistence,
  vectorBeam,
  vectorMeta,
  vectorModes,
  type VectorMode,
} from './effects/vector'

/*
 * 街机矢量屏 showcase — an attract-mode loop of a made-up vector shooter: a delta-wing fighter skims a scrolling
 * grid towards a jagged mountain range and a crescent moon; pyramids, tanks and saucers come at it, it weaves and
 * fires, hits burst into tumbling line fragments. Everything is plain flat-shaded geometry (unlit colours, used
 * only as hues in 彩色矢量 mode); the effect (./effects/vector.ts) keeps only the visible edges and draws them as
 * a beam. The ground grid is a texture on a `vectorBeam` material. After <Stylize> draws, the page copies the
 * screen into the effect's afterglow history (captureVectorPersistence) — the trails are real.
 * DOM: bezel + tube shadow, score / high score, blinking INSERT COIN, a radar scope with live blips.
 */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const PERSIST = [
  { zh: '短', s: 0.035 },
  { zh: '中', s: 0.08 },
  { zh: '长', s: 0.22 },
]
const NOTE: Record<VectorMode, string> = {
  green: 'P39 绿色荧光粉 · 余辉偏绿 · 终极战区',
  white: 'P4 白色荧光粉 · 余辉偏蓝 · 爆破彗星',
  color: '每个物体自带颜色 · 中性面变蓝 · 暴风雨',
}
const SHORT: Record<VectorMode, string> = { green: '绿色', white: '白色', color: '彩色' }
const BEAM: Record<VectorMode, string> = { green: '#6dff86', white: '#e6eeff', color: '#ffe23a' }

const SPEED = 20 // world units / s
const N_ENEMY = 9
const N_SHOT = 6
const N_DEBRIS = 36
const SHIP_Z = 2.4

/* ------------------------------------------------------------------ geometry */

function flat(tris: number[][]) {
  // non-indexed triangles → flat normals (every facet edge becomes a crease line)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3))
  g.computeVertexNormals()
  return g
}

function shipGeo() {
  const N = [0, 0.05, -1.7]
  const C = [0, 0.34, -0.15]
  const L = [-1.55, -0.04, 0.78]
  const R = [1.55, -0.04, 0.78]
  const B = [0, -0.24, 0.55]
  const E = [0, 0.14, 0.78]
  const body = flat([N, L, C, N, C, R, C, L, E, C, E, R, N, B, L, N, R, B, L, B, E, E, B, R])
  const fin = flat([
    [0, 0.14, 0.15],
    [0, 0.7, 0.95],
    [0, 0.14, 0.78],
  ])
  return { body, fin }
}

function mountainGeo() {
  // a jagged ridge: front faces split into two facets per segment so the inner lines show, like the arcade
  const tris: number[][] = []
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const pts: [number, number][] = []
  for (let x = -260; x <= 260; x += 7 + rnd() * 16) {
    const big = 0.5 + 0.5 * Math.sin(x * 0.021 + 1.3) * Math.sin(x * 0.047)
    pts.push([x, pts.length % 2 ? 2 + rnd() * 8 * big : 6 + (8 + rnd() * 22) * big])
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, h0] = pts[i]
    const [x1, h1] = pts[i + 1]
    const xm = (x0 + x1) / 2
    const a = [x0, h0, -6]
    const b = [x1, h1, -6]
    const m = [xm, 0, 4]
    const l = [x0, 0, 4]
    const r = [x1, 0, 4]
    tris.push(l, m, a, a, m, b, m, r, b)
  }
  return flat(tris)
}

function moonGeo() {
  const s = new THREE.Shape()
  s.absarc(0, 0, 7, -Math.PI * 0.62, Math.PI * 0.62, false)
  s.absarc(-3.2, 0, 6.2, Math.PI * 0.52, -Math.PI * 0.52, true)
  return new THREE.ShapeGeometry(s, 24)
}

function gridTexture(color: string) {
  // lanes run toward the horizon (they don't move while flying straight, so they stay crisp); cross lines only
  // every 4th tile, so their afterglow reads as speed streaks. Hand-made mip levels fade the lines out where they
  // get thinner than a pixel — a far grid at a grazing angle would otherwise alias into moiré bands, and the
  // beam would trace those bands as bright fills.
  const levels: HTMLCanvasElement[] = []
  let w = 128
  let h = 512
  for (let L = 0; ; L++) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')!
    x.fillStyle = '#000'
    x.fillRect(0, 0, w, h)
    const b = L <= 1 ? 1 : L === 2 ? 0.8 : L === 3 ? 0.35 : 0
    if (b > 0) {
      x.globalAlpha = b
      x.fillStyle = color
      const k = w / 128
      x.fillRect(0, 0, w, Math.max(1, 3.5 * k))
      x.fillRect(0, 0, Math.max(1, 3 * k), h)
    }
    levels.push(c)
    if (w === 1 && h === 1) break
    w = Math.max(1, w >> 1)
    h = Math.max(1, h >> 1)
  }
  const t = new THREE.CanvasTexture(levels[0])
  t.mipmaps = levels
  t.generateMipmaps = false
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ------------------------------------------------------------------ game state */

type Enemy = { type: number; x: number; z: number; alive: boolean; spin: number; bob: number }
type Shot = { x: number; z: number; live: boolean }
type Debris = { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Vector3; w: THREE.Vector3; life: number; color: number }
const ENEMY_COLORS = ['#ff3a4a', '#3cff6a', '#ff4dff']
const SCORES = [250, 1000, 5000]

export type Hud = {
  score: number
  high: number
  blips: { x: number; y: number; on: boolean }[]
  near: boolean
  dirty: boolean
}

function World({ steer, fire, hud, auto }: { steer: MotionValue<number>; fire: React.RefObject<number>; hud: React.RefObject<Hud>; auto: React.RefObject<boolean> }) {
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const content = useRef<THREE.Group>(null)
  const ready = usePrecompiled(content)

  const g = useMemo(() => {
    const ship = shipGeo()
    return {
      ship,
      flame: new THREE.ConeGeometry(0.16, 0.7, 5, 1),
      mountains: mountainGeo(),
      moon: moonGeo(),
      ground: new THREE.PlaneGeometry(320, 320),
      pyramid: new THREE.ConeGeometry(1.1, 1.8, 4, 1),
      hull: new THREE.BoxGeometry(1.7, 0.6, 2.3),
      turret: new THREE.BoxGeometry(0.95, 0.45, 1.05),
      barrel: new THREE.BoxGeometry(0.16, 0.16, 1.3),
      saucer: new THREE.LatheGeometry(
        [
          [0, -0.25],
          [0.7, -0.18],
          [1.25, 0],
          [0.7, 0.2],
          [0.45, 0.5],
          [0, 0.58],
        ].map(([r, y]) => new THREE.Vector2(r, y)),
        8,
      ),
      shot: new THREE.BoxGeometry(0.09, 0.09, 1.4),
      shard: flat([
        [-0.28, 0, 0],
        [0.28, 0.05, 0],
        [0, 0.4, 0.05],
      ]),
    }
  }, [])
  const grid = useMemo(() => {
    const t = gridTexture('#7a6cff')
    t.repeat.set(320 / 2.6, 320 / (2.6 * 4))
    return t
  }, [])
  const m = useMemo(() => {
    const basic = (c: string) => new THREE.MeshBasicMaterial({ color: c, fog: false, side: THREE.DoubleSide })
    return {
      ship: basic('#36e2ff'),
      flame: basic('#ff9a2a'),
      mountains: basic('#4f7dff'),
      moon: basic('#ffe066'),
      ground: vectorBeam(new THREE.MeshBasicMaterial({ map: grid, fog: true })),
      enemy: ENEMY_COLORS.map(basic),
      shot: basic('#ffffff'),
      shard: ENEMY_COLORS.map(basic),
    }
  }, [grid])
  useEffect(
    () => () => {
      Object.values(g).forEach((x) => ('dispose' in x ? (x as THREE.BufferGeometry).dispose() : Object.values(x).forEach((y) => (y as THREE.BufferGeometry).dispose())))
      grid.dispose()
      ;[m.ship, m.flame, m.mountains, m.moon, m.ground, m.shot, ...m.enemy, ...m.shard].forEach((x) => x.dispose())
    },
    [g, m, grid],
  )

  const scene = useThree((s) => s.scene)
  useEffect(() => {
    scene.fog = new THREE.Fog('#000000', 18, 120)
    return () => {
      scene.fog = null
    }
  }, [scene])

  // simulation state (no React state per frame)
  const S = useMemo(() => {
    let seed = 11
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const enemies: Enemy[] = Array.from({ length: N_ENEMY }, (_, i) => ({
      type: i % 3,
      x: (rnd() - 0.5) * 26,
      z: -14 - i * 11 - rnd() * 6,
      alive: true,
      spin: rnd() * 6,
      bob: rnd() * 6,
    }))
    return {
      rnd,
      enemies,
      shots: Array.from({ length: N_SHOT }, () => ({ x: 0, z: 0, live: false }) as Shot),
      debris: Array.from({ length: N_DEBRIS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, color: 0 }) as Debris),
      di: 0,
      shipX: 0,
      shipV: 0,
      t: 0,
      cool: 0,
      fired: 0,
      scroll: 0,
      warm: POSTER ? 0 : 1,
    }
  }, [])

  const shipRef = useRef<THREE.Group>(null)
  const flameRef = useRef<THREE.Mesh>(null)
  const mountRef = useRef<THREE.Group>(null)
  const enemyRefs = useRef<(THREE.Group | null)[]>([])
  const shotRefs = useRef<(THREE.Mesh | null)[]>([])
  const debrisRefs = useRef<(THREE.Mesh | null)[]>([])

  const shoot = () => {
    const s = S.shots.find((x) => !x.live)
    if (!s) return
    s.live = true
    s.x = S.shipX
    s.z = SHIP_Z - 1.6
  }
  const explode = (e: Enemy) => {
    for (let k = 0; k < 12; k++) {
      const d = S.debris[S.di]
      S.di = (S.di + 1) % N_DEBRIS
      d.p.set(e.x + (S.rnd() - 0.5), 0.6 + S.rnd() * 0.8, e.z + (S.rnd() - 0.5))
      d.v.set((S.rnd() - 0.5) * 9, 3 + S.rnd() * 6, (S.rnd() - 0.5) * 6)
      d.r.set(S.rnd() * 6, S.rnd() * 6, S.rnd() * 6)
      d.w.set((S.rnd() - 0.5) * 14, (S.rnd() - 0.5) * 14, (S.rnd() - 0.5) * 14)
      d.life = 1.2 + S.rnd() * 0.5
      d.color = e.type
    }
  }

  const step = (dt: number) => {
    S.t += dt
    const H = hud.current
    // steering: the visitor's target, or the autopilot (chase the closest enemy ahead, weave a little)
    let ahead: Enemy | null = null
    for (const e of S.enemies) if (e.alive && e.z < SHIP_Z - 6 && e.z > -70 && (!ahead || e.z > ahead.z)) ahead = e
    if (auto.current) {
      const goal = (ahead ? THREE.MathUtils.clamp(ahead.x, -5, 5) : 0) + Math.sin(S.t * 0.9) * 1.0
      steer.set(steer.get() + (goal - steer.get()) * Math.min(1, dt * 1.6))
      if (ahead && Math.abs(ahead.x - S.shipX) < 0.9 && S.cool <= 0) {
        shoot()
        S.cool = 0.5
      }
    }
    if (fire.current !== S.fired) {
      S.fired = fire.current
      shoot()
    }
    S.cool -= dt
    const target = THREE.MathUtils.clamp(steer.get(), -7, 7)
    const nx = S.shipX + (target - S.shipX) * (1 - Math.exp(-dt * 4))
    S.shipV = (nx - S.shipX) / Math.max(dt, 1e-3)
    S.shipX = nx

    S.scroll += SPEED * dt
    for (const e of S.enemies) {
      e.z += SPEED * dt
      e.spin += dt
      if (e.z > 12) {
        e.z = -95 - S.rnd() * 25
        e.x = (S.rnd() - 0.5) * 22
        e.type = Math.floor(S.rnd() * 3)
        e.alive = true
      }
    }
    for (const s of S.shots) {
      if (!s.live) continue
      s.z -= 75 * dt
      if (s.z < -130) s.live = false
      for (const e of S.enemies) {
        if (!e.alive || Math.abs(e.x - s.x) > 1.3 || Math.abs(e.z - s.z) > 1.8) continue
        e.alive = false
        s.live = false
        explode(e)
        if (H) {
          H.score += SCORES[e.type]
          H.high = Math.max(H.high, H.score)
          H.dirty = true
        }
        break
      }
    }
    for (const d of S.debris) {
      if (d.life <= 0) continue
      d.life -= dt
      d.v.y -= 9 * dt
      d.p.addScaledVector(d.v, dt)
      d.p.z += SPEED * dt
      if (d.p.y < 0.05) {
        d.p.y = 0.05
        d.v.y *= -0.35
        d.v.x *= 0.7
      }
      d.r.addScaledVector(d.w, dt)
    }
    // radar + "enemy in range"
    if (H) {
      S.enemies.forEach((e, i) => {
        const b = H.blips[i]
        b.x = (e.x - S.shipX) / 34
        b.y = (e.z - SHIP_Z) / 100
        b.on = e.alive && b.y > -1 && b.y < 0.1
      })
      H.near = !!ahead && ahead.z > -18
    }
  }

  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame((_, raw) => {
    const dt = Math.min(raw, 1 / 30)
    if (POSTER) {
      // a fixed, staged frame: advance the attract loop to a good moment once
      if (S.warm === 0) {
        for (let i = 0; i < 150; i++) step(1 / 60)
        S.warm = 1
      }
    } else step(dt)

    // frame the scene: on wide screens the action sits right of the copy, on phones above it
    const W = size.width
    const H = size.height
    const mobile = W < 760
    const ox = POSTER || mobile ? 0 : -W * 0.13
    const oy = POSTER ? 0 : mobile ? H * 0.12 : 0
    if (!camera.view || camera.view.offsetX !== ox || camera.view.offsetY !== oy || camera.view.fullWidth !== W || camera.view.fullHeight !== H) {
      camera.setViewOffset(W, H, ox, oy, W, H)
    }
    camera.fov = mobile ? 56 : 50
    const follow = mobile ? 0.85 : 0.4
    camera.position.set(S.shipX * follow, mobile ? 3.1 : 2.5, mobile ? 11.5 : 8.2)
    look.set(S.shipX * (mobile ? 0.9 : 0.6), mobile ? 0.6 : 0.85, -12)
    camera.lookAt(look)
    camera.updateProjectionMatrix()

    if (shipRef.current) {
      shipRef.current.position.set(S.shipX, 1.25 + Math.sin(S.t * 2.1) * 0.06, SHIP_Z)
      shipRef.current.rotation.set(0.05, -S.shipV * 0.025, THREE.MathUtils.clamp(-S.shipV * 0.07, -0.7, 0.7))
    }
    if (flameRef.current) flameRef.current.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(S.t * 37)), 1)
    if (mountRef.current) mountRef.current.position.x = -S.shipX * 0.5
    grid.offset.set(0, (S.scroll / (2.6 * 4)) % 1)
    S.enemies.forEach((e, i) => {
      const o = enemyRefs.current[i]
      if (!o) return
      o.visible = e.alive
      o.position.set(e.x, e.type === 2 ? 1.6 + Math.sin(S.t * 2 + e.bob) * 0.3 : 0, e.z)
      o.rotation.y = e.type === 1 ? Math.sin(e.spin * 0.6) * 0.8 : e.spin * (e.type === 2 ? 1.8 : 0.5)
      o.children.forEach((c, k) => (c.visible = k === e.type))
    })
    S.shots.forEach((s, i) => {
      const o = shotRefs.current[i]
      if (!o) return
      o.visible = s.live
      o.position.set(s.x, 1.2, s.z)
    })
    S.debris.forEach((d, i) => {
      const o = debrisRefs.current[i]
      if (!o) return
      o.visible = d.life > 0
      o.position.copy(d.p)
      o.rotation.set(d.r.x, d.r.y, d.r.z)
      o.scale.setScalar(Math.min(1, d.life * 2))
      o.material = m.shard[d.color]
    })
  })

  return (
    <group ref={content} visible={ready}>
      <mesh geometry={g.ground} material={m.ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -150]} />
      <group ref={mountRef} position={[0, 0, -230]}>
        <mesh geometry={g.mountains} material={m.mountains} />
        <mesh geometry={g.moon} material={m.moon} position={[70, 52, 0]} rotation={[0, 0, 0.3]} />
      </group>
      <group ref={shipRef} scale={0.62}>
        <mesh geometry={g.ship.body} material={m.ship} />
        <mesh geometry={g.ship.fin} material={m.ship} />
        <mesh ref={flameRef} geometry={g.flame} material={m.flame} position={[0, 0.0, 1.05]} rotation={[-Math.PI / 2, 0, 0]} />
      </group>
      {Array.from({ length: N_ENEMY }, (_, i) => (
        <group key={i} ref={(o) => void (enemyRefs.current[i] = o)}>
          <mesh geometry={g.pyramid} material={m.enemy[0]} position={[0, 0.9, 0]} />
          <group>
            <mesh geometry={g.hull} material={m.enemy[1]} position={[0, 0.3, 0]} />
            <mesh geometry={g.turret} material={m.enemy[1]} position={[0, 0.82, 0.15]} />
            <mesh geometry={g.barrel} material={m.enemy[1]} position={[0, 0.85, -0.9]} />
          </group>
          <mesh geometry={g.saucer} material={m.enemy[2]} />
        </group>
      ))}
      {Array.from({ length: N_SHOT }, (_, i) => (
        <mesh key={i} ref={(o) => void (shotRefs.current[i] = o)} geometry={g.shot} material={m.shot} visible={false} />
      ))}
      {Array.from({ length: N_DEBRIS }, (_, i) => (
        <mesh key={i} ref={(o) => void (debrisRefs.current[i] = o)} geometry={g.shard} material={m.shard[0]} visible={false} />
      ))}
    </group>
  )
}

/** copies the finished screen into the effect's afterglow history (after <Stylize>, priority 1) */
function Afterglow({ fx }: { fx: ReturnType<typeof createVectorEffect> }) {
  useFrame(({ gl }) => captureVectorPersistence(fx, gl), 2)
  useEffect(() => () => disposeVectorPersistence(fx), [fx])
  return null
}

/* ------------------------------------------------------------------ HUD */

function HudLayer({ hud, mode }: { hud: React.RefObject<Hud>; mode: VectorMode }) {
  const score = useRef<HTMLSpanElement>(null)
  const high = useRef<HTMLSpanElement>(null)
  const near = useRef<HTMLDivElement>(null)
  const blips = useRef<(SVGCircleElement | null)[]>([])
  useEffect(() => {
    let raf = 0
    const pad = (n: number) => String(n).padStart(6, '0')
    const tick = () => {
      const H = hud.current
      if (H) {
        if (H.dirty || !score.current?.textContent) {
          if (score.current) score.current.textContent = pad(H.score)
          if (high.current) high.current.textContent = pad(H.high)
          H.dirty = false
        }
        H.blips.forEach((b, i) => {
          const c = blips.current[i]
          if (!c) return
          const r = Math.hypot(b.x, b.y)
          const on = b.on && r < 0.95
          c.setAttribute('cx', String(50 + b.x * 44))
          c.setAttribute('cy', String(50 + b.y * 44))
          c.style.opacity = on ? '1' : '0'
        })
        if (near.current) near.current.style.opacity = H.near ? '1' : '0'
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [hud])
  return (
    <div className="va-hud" style={{ ['--va-beam' as string]: BEAM[mode] }}>
      <div className="va-tube" />
      <div className="va-score">
        <span className="va-lbl">SCORE</span> <span ref={score}>001250</span>
        <span className="va-gap" />
        <span className="va-lbl">HIGH SCORE</span> <span ref={high}>015000</span>
      </div>
      <div className="va-radar">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" className="va-ring" />
          <circle cx="50" cy="50" r="23" className="va-ring dim" />
          <path d="M50 50 L50 4" className="va-sweep" />
          <path d="M50 50 L84 12 M50 50 L16 12" className="va-fov" />
          {Array.from({ length: N_ENEMY }, (_, i) => (
            <circle key={i} ref={(c) => void (blips.current[i] = c)} r="2.6" className="va-blip" cx="50" cy="50" />
          ))}
        </svg>
      </div>
      <div ref={near} className="va-near">
        ENEMY IN RANGE
      </div>
      <div className="va-coin">INSERT COIN</div>
      <div className="va-legal">© 1981 MOTION LAB · 1 COIN 1 PLAY</div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function VectorArcade() {
  const fx = useMemo(() => createVectorEffect(), [])
  const preload = useMemo(() => [fx], [fx])
  const original = useMemo(createOriginalEffect, [])
  const [mode, setMode] = useState<VectorMode>('green')
  const [pi, setPi] = useState(1)
  const [mobile] = useState(MOBILE)
  const split = useOriginalSplit(MOBILE ? 0.5 : 0.62)
  const splitOpen = useRef(false)
  splitOpen.current = split.open

  const steer = useMotionValue(0)
  const fire = useRef(0)
  const auto = useRef(true)
  const hud = useRef<Hud>({ score: 1250, high: 15000, blips: Array.from({ length: N_ENEMY }, () => ({ x: 0, y: 0, on: false })), near: false, dirty: true })
  const lastInput = useRef(POSTER ? Infinity : 0)
  useEffect(() => {
    if (!POSTER) lastInput.current = performance.now() - 4000
  }, [])
  const poke = () => {
    lastInput.current = performance.now()
    auto.current = false
  }

  useEffect(() => setVectorMode(fx, mode), [fx, mode])
  // the afterglow would smear the original image across the split line, so it pauses while comparing
  useEffect(() => setVectorPersistence(fx, split.on ? 0 : PERSIST[pi].s), [fx, pi, split.on])

  // idle: autopilot back on after a few seconds, modes cycle after longer
  useEffect(() => {
    if (POSTER) return
    const id = window.setInterval(() => {
      const idle = performance.now() - lastInput.current
      if (idle > 3500) auto.current = true
      if (idle < 14000 || splitOpen.current) return
      setMode((m) => vectorModes[(vectorModes.findIndex((x) => x.id === m) + 1) % vectorModes.length].id)
      lastInput.current = performance.now() - 6000
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  // keyboard: ← → steer, space fires
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        poke()
        steer.set(THREE.MathUtils.clamp(steer.get() + (e.key === 'ArrowLeft' ? -1.6 : 1.6), -7, 7))
      } else if (e.key === ' ') {
        e.preventDefault()
        poke()
        fire.current++
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // drag steers (Motion inertia on release), a tap fires
  const drag = useRef<{ x: number; id: number; moved: number } | null>(null)
  const anim = useRef<{ stop: () => void } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.dock, .osplit-knob')) return
    poke()
    anim.current?.stop()
    drag.current = { x: e.clientX, id: e.pointerId, moved: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    poke()
    d.moved += Math.abs(e.clientX - d.x)
    steer.set(THREE.MathUtils.clamp(steer.get() + (e.clientX - d.x) * (mobile ? 0.05 : 0.028), -7, 7))
    d.x = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    poke()
    if (d.moved < 6) {
      fire.current++
      return
    }
    anim.current = animate(steer, steer.get(), {
      type: 'inertia',
      velocity: steer.getVelocity(),
      power: 0.3,
      timeConstant: 300,
      min: -7,
      max: 7,
      bounceStiffness: 200,
      bounceDamping: 22,
    })
  }

  const label = vectorModes.find((m) => m.id === mode)!.label

  return (
    <div
      className={`stage va va-${mode}${split.open ? ' va-split' : ''}`}
      style={{ ['--va-beam' as string]: BEAM[mode] }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <style>{css}</style>
      <Canvas dpr={[1, 2]} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }} camera={{ position: [0, 2.5, 8.2], fov: 50, near: 1, far: 400 }}>
        <Stylize effect={split.on ? original : fx} prev={split.on ? fx : null} wipe={split.wipe} background={vectorMeta.background} preload={preload} />
        <World steer={steer} fire={fire} hud={hud} auto={auto} />
        <Afterglow fx={fx} />
      </Canvas>

      <HudLayer hud={hud} mode={mode} />

      <div className="overlay">
        <OriginalSplit split={split} label={label} />

        <div className="hero-copy va-copy">
          <div className="scrim va-scrim" />
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i />
              Vector Arcade ·{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  className="va-kmode"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                  {label}
                </motion.span>
              </AnimatePresence>
            </p>
            <h1>
              没有像素，
              <br />
              <span className="va-glow">只有电子束</span>
            </h1>
            <p className="va-sub">屏幕上只剩看得见的边：轮廓、折痕和被挡住后剩下的线。光束在顶点停留更久所以更亮，移动的线条拖着荧光余辉慢慢熄灭。</p>
            <div className="va-spec">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={mode}
                  initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                >
                  <i />
                  {NOTE[mode]}
                </motion.span>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg
            items={vectorModes.map((m) => ({ value: m.id, label: mobile ? SHORT[m.id] : m.label }))}
            value={mode}
            onChange={(v) => {
              poke()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg va-cycle"
            onClick={() => {
              poke()
              setPi((i) => (i + 1) % PERSIST.length)
            }}
          >
            <span>
              {mobile ? '余辉' : '余辉长度'} <b>{PERSIST[pi].zh}</b>
            </span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            aria-pressed={split.open}
            onClick={() => {
              poke()
              split.toggle()
            }}
          >
            {split.open && <motion.span layoutId="va-split-bg" className="seg-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>原图</span>
          </button>
        </div>
        <p className="hint">左右拖动驾驶 · 单击或空格开火</p>
      </div>
    </div>
  )
}

const css = `
.va { cursor: ew-resize; touch-action: none; background: #000; overflow: hidden; }
.va canvas { display: block; }
.va-hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--mono); color: var(--va-beam); }
.va-tube {
  position: absolute; inset: 8px; border-radius: 30px;
  box-shadow: 0 0 0 40px #050606, 0 0 0 41px #1a1c1d, inset 0 0 70px 10px rgba(0, 0, 0, .9), inset 0 0 0 1px rgba(255, 255, 255, .05);
}
.va-score, .va-coin, .va-near, .va-legal {
  position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; letter-spacing: .14em;
  text-shadow: 0 0 2px #fff, 0 0 8px var(--va-beam), 0 0 22px var(--va-beam);
  transition: color .6s, text-shadow .6s;
}
.va-score { top: 24px; font-size: 15px; font-weight: 700; }
.va-lbl { opacity: .7; }
.va-gap { display: inline-block; width: 34px; }
.va-near { top: 52px; font-size: 11px; opacity: 0; color: #ff5a5a; text-shadow: 0 0 2px #fff, 0 0 10px #ff3a3a; transition: opacity .15s; }
.va-coin { bottom: 92px; font-size: 16px; font-weight: 700; animation: va-blink 1.1s steps(1) infinite; }
.va-legal { bottom: 74px; font-size: 10px; opacity: .55; text-shadow: 0 0 6px var(--va-beam); }
@keyframes va-blink { 55% { opacity: 0; } }
.va-radar { position: absolute; right: clamp(28px, 4vw, 60px); top: 84px; width: 104px; height: 104px; opacity: .9; }
.va-radar svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 3px var(--va-beam)); }
.va-ring { fill: none; stroke: var(--va-beam); stroke-width: 1.2; }
.va-ring.dim { opacity: .35; }
.va-fov { fill: none; stroke: var(--va-beam); stroke-width: .8; opacity: .35; }
.va-sweep { stroke: var(--va-beam); stroke-width: 1.4; transform-origin: 50px 50px; animation: va-sweep 2.4s linear infinite; }
@keyframes va-sweep { to { transform: rotate(360deg); } }
.va-blip { fill: #fff; stroke: var(--va-beam); stroke-width: 1.2; transition: opacity .2s; }
.va-copy { pointer-events: none !important; left: clamp(40px, 6vw, 96px); }
.va-scrim { --soft-bg: rgba(0, 4, 2, .7); }
.va-copy .kicker i { background: var(--va-beam); box-shadow: 0 0 10px var(--va-beam), 0 0 3px #fff; transition: background .6s, box-shadow .6s; }
.va-kmode { display: inline-block; color: var(--fg); }
.va-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.va-glow { color: #fff; text-shadow: 0 0 2px #fff, 0 0 12px var(--va-beam), 0 0 30px var(--va-beam); transition: text-shadow .6s; }
.va-sub { max-width: 400px; }
.va-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.va-spec span { display: inline-flex; align-items: center; gap: 9px; }
.va-spec i { width: 18px; height: 2px; border-radius: 2px; background: #fff; box-shadow: 0 0 6px var(--va-beam), 0 0 12px var(--va-beam); }
.va-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.va-cycle b { font-weight: 600; color: var(--fg); }
.va .hint { transition: opacity .4s; }
.va-split .hint, .va-split .va-coin, .va-split .va-legal { opacity: 0; }
@media (max-width: 760px) {
  .va-tube { inset: 4px; border-radius: 22px; }
  .va-score { top: 78px; font-size: 12px; }
  .va-gap { width: 16px; }
  .va-near { top: 100px; }
  .va-radar { width: 70px; height: 70px; top: 112px; right: 18px; }
  .va-coin { bottom: auto; top: 46%; font-size: 14px; }
  .va-legal { display: none; }
  .va-copy { left: 24px; transition: opacity .4s; }
  .va-split .va-copy { opacity: 0; }
  .va-sub { display: none; }
  .va-copy h1 { font-size: 36px; }
  .va-spec { margin-top: 12px; font-size: 11px; }
  .va .dock .seg { padding: 0 9px; }
  .va .dock .dock-sep { margin: 0 1px; }
}
`
