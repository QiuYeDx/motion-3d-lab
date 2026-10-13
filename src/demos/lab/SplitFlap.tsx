import { Environment, Lightformer, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BigLabel } from '../../components/BigLabel'
import { POSTER } from '../../lib/iso'

/* ------------------------------------------------------------------ board geometry */

const COLS = 16
const ROWS = 4
const N = COLS * ROWS
const CW = 0.72 // card width
const CH = 1.0 // card height (two halves)
const GAP = 0.012 // half of the hinge slit
const PX = CW + 0.085
const PY = CH + 0.2
const BOARD_W = COLS * PX - 0.085
const BOARD_H = ROWS * PY - 0.2

/* ------------------------------------------------------------------ glyph atlas */

const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/·'
const EXTRA = "!?'&@#+%()→×，、。"
const AT_COLS = 16
const AT_ROWS = 16
const TW = 108
const TH = 150
const AMBER = 512 // tint flag encoded into the glyph index

type Atlas = { tex: THREE.CanvasTexture; index: (ch: string) => number; ensure: (s: string) => void }

function makeAtlas(): Atlas {
  const canvas = document.createElement('canvas')
  canvas.width = AT_COLS * TW
  canvas.height = AT_ROWS * TH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  const map = new Map<string, number>()
  const LATIN = `600 ${Math.round(TH * 0.74)}px Bahnschrift, "DIN Alternate", "Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`
  const CJK = `700 ${Math.round(TW * 0.8)}px "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif`
  ctx.font = LATIN
  const capH = ctx.measureText('H').actualBoundingBoxAscent

  const draw = (ch: string, i: number) => {
    const x0 = (i % AT_COLS) * TW
    const y0 = Math.floor(i / AT_COLS) * TH
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0, y0, TW, TH)
    ctx.clip()
    ctx.fillStyle = '#000'
    ctx.fillRect(x0, y0, TW, TH)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    const wide = ch.charCodeAt(0) > 0x2e80
    ctx.font = wide ? CJK : LATIN
    const m = ctx.measureText(ch)
    let baseline: number
    if (wide) baseline = y0 + TH / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
    else baseline = y0 + TH / 2 + capH / 2
    const maxW = TW * (wide ? 0.9 : 0.8)
    const sx = Math.min(wide ? 1 : 0.86, maxW / Math.max(1, m.width))
    ctx.translate(x0 + TW / 2, 0)
    ctx.scale(sx, 1)
    ctx.fillText(ch, 0, baseline)
    ctx.restore()
  }

  const ensure = (s: string) => {
    let dirty = false
    for (const ch of Array.from(s)) {
      if (map.has(ch) || map.size >= AT_COLS * AT_ROWS) continue
      const i = map.size
      map.set(ch, i)
      draw(ch, i)
      dirty = true
    }
    if (dirty) tex.needsUpdate = true
  }
  ensure(DRUM + EXTRA)
  return { tex, ensure, index: (ch) => map.get(ch) ?? map.get('?') ?? 0 }
}

/* ------------------------------------------------------------------ messages */

type Line = [text: string, amber?: boolean]
type Msg = { key: string; title: string; sub: string; aside: string; lines: Line[] }

const center = (s: string) => {
  const a = Array.from(s)
  const pad = Math.max(0, Math.floor((COLS - a.length) / 2))
  return ' '.repeat(pad) + s
}
const row = (l: string, r: string) => {
  const n = COLS - Array.from(l).length - Array.from(r).length
  return l + ' '.repeat(Math.max(1, n)) + r
}

const MESSAGES: Msg[] = [
  {
    key: 'dep',
    title: '出发',
    sub: 'Departures',
    aside: '逐列错落 · 50ms',
    lines: [[row('DEPARTURES', '出发'), true], [row('MU5101', 'SHANGHAI')], [row('GATE 12', '08:45')], [row('ON TIME', '准点'), true]],
  },
  {
    key: 'motion',
    title: '动效',
    sub: 'Kinetic type',
    aside: '每格 3 个面',
    lines: [[''], [center('动效 · 3D · 粒子'), true], [center('MOTION × WEBGL')], ['']],
  },
  {
    key: 'arr',
    title: '到达',
    sub: 'Arrivals',
    aside: '64 片翻牌',
    lines: [[row('ARRIVALS', '到达'), true], [row('NH919', 'TOKYO')], [row('BELT 5', '21:30')], [row('LANDED', '已到达'), true]],
  },
  {
    key: 'ship',
    title: '交付',
    sub: 'Design → Code',
    aside: '重力缓动 + 回弹',
    lines: [[''], [center('DESIGN → CODE')], [center('设计 → 代码 → 上线'), true], ['']],
  },
  {
    key: 'hello',
    title: '你好',
    sub: 'Hello, world',
    aside: '试试输入你自己的话',
    lines: [[''], [center('HELLO, WORLD!')], [center('你好，世界'), true], ['']],
  },
]

function wrapText(s: string): Line[] {
  const words = s.trim().toUpperCase().split(/\s+/).filter(Boolean)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    let word = w
    while (Array.from(word).length > COLS) {
      if (cur) out.push(cur), (cur = '')
      out.push(Array.from(word).slice(0, COLS).join(''))
      word = Array.from(word).slice(COLS).join('')
    }
    const next = cur ? `${cur} ${word}` : word
    if (Array.from(next).length > COLS) {
      out.push(cur)
      cur = word
    } else cur = next
  }
  if (cur) out.push(cur)
  const lines = out.slice(0, ROWS).map(center)
  const top = Math.floor((ROWS - lines.length) / 2)
  return Array.from({ length: ROWS }, (_, r) => [lines[r - top] ?? '', r - top === 0 && lines.length > 1] as Line)
}

/* ------------------------------------------------------------------ shader */

const vert = /* glsl */ `
  #define PI 3.14159265
  attribute float aA;
  attribute float aB;
  attribute float aAngle;
  uniform float uPart; // 0 top, 1 bottom, 2 flap
  varying vec2 vCell;
  varying vec2 vCellBack;
  varying float vA;
  varying float vB;
  varying float vShadeF;
  varying float vShadeB;
  varying float vDrop;
  void main() {
    vec3 p = position;
    vCell = vec2(p.x / ${CW.toFixed(3)} + 0.5, p.y + 0.5);
    vCellBack = vec2(vCell.x, 0.5 - p.y);
    vec3 n = vec3(0.0, 0.0, 1.0);
    if (uPart > 1.5) {
      float c = cos(aAngle), s = sin(aAngle);
      p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
      n = vec3(0.0, -s, c);
      p.z += 0.006;
    }
    vec3 L = normalize(vec3(-0.25, 0.85, 0.75));
    vShadeF = 0.5 + 0.62 * max(dot(n, L), 0.0);
    vShadeB = 0.5 + 0.62 * max(dot(-n, L), 0.0);
    // the falling flap darkens the half it is about to cover
    vDrop = uPart > 0.5 && uPart < 1.5 ? smoothstep(0.35, 1.0, aAngle / PI) * (1.0 - smoothstep(0.92, 1.0, aAngle / PI)) : 0.0;
    vA = aA;
    vB = aB;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`

const frag = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uPart;
  varying vec2 vCell;
  varying vec2 vCellBack;
  varying float vA;
  varying float vB;
  varying float vShadeF;
  varying float vShadeB;
  varying float vDrop;

  vec3 card(float code, vec2 cell, float shade, float lower) {
    float amber = step(${AMBER}.0 - 0.5, code);
    float idx = floor(code - amber * ${AMBER}.0 + 0.5);
    float row = floor((idx + 0.5) / ${AT_COLS}.0);
    float col = idx - row * ${AT_COLS}.0;
    vec2 uv = vec2((col + cell.x) / ${AT_COLS}.0, 1.0 - (row + 1.0 - cell.y) / ${AT_ROWS}.0);
    float ink = texture2D(uAtlas, uv).r;
    vec3 base = mix(vec3(0.085, 0.085, 0.095), vec3(0.13, 0.13, 0.145), cell.y);
    // a faint bevel at the card edges and a dark slit at the hinge
    float ex = min(cell.x, 1.0 - cell.x);
    base *= 0.82 + 0.18 * smoothstep(0.0, 0.06, ex);
    float hinge = abs(cell.y - 0.5);
    base *= 0.55 + 0.45 * smoothstep(0.0, 0.05, hinge);
    vec3 glyph = mix(vec3(0.95, 0.93, 0.88), vec3(1.0, 0.76, 0.33), amber);
    vec3 c = mix(base, glyph * (0.82 + 0.18 * cell.y), ink);
    c *= shade * mix(1.0, 0.86, lower);
    return c;
  }

  void main() {
    // rounded card corners
    vec2 q = abs(vCell - 0.5) * vec2(${CW.toFixed(3)}, 1.0);
    vec2 d = q - vec2(${CW / 2 - 0.05}, 0.45);
    if (length(max(d, 0.0)) > 0.05) discard;

    vec3 c;
    if (uPart < 0.5) c = card(vB, vCell, vShadeF, 0.0);
    else if (uPart < 1.5) c = card(vA, vCell, vShadeF, 1.0) * (1.0 - 0.45 * vDrop);
    else c = gl_FrontFacing ? card(vA, vCell, vShadeF, 0.0) : card(vB, vCellBack, vShadeB, 1.0);
    gl_FragColor = vec4(c, 1.0);
  }
`

/* ------------------------------------------------------------------ the board */

type Cell = { cur: number; queue: number[]; t: number; delay: number }

const FALL = 0.72

function Flaps({ atlas, target }: { atlas: Atlas; target: number[] }) {
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([])
  const cells = useMemo<Cell[]>(() => Array.from({ length: N }, () => ({ cur: 0, queue: [], t: 0, delay: 0 })), [])
  const attrs = useMemo(
    () => ({
      a: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
      b: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
      angle: new THREE.InstancedBufferAttribute(new Float32Array(N), 1),
    }),
    [],
  )
  const parts = useMemo(() => {
    const mk = (y0: number, y1: number) => {
      const g = new THREE.PlaneGeometry(CW, y1 - y0)
      g.translate(0, (y0 + y1) / 2, 0)
      g.setAttribute('aA', attrs.a)
      g.setAttribute('aB', attrs.b)
      g.setAttribute('aAngle', attrs.angle)
      return g
    }
    const top = mk(GAP, 0.5)
    const bottom = mk(-0.5, -GAP)
    const flap = mk(GAP, 0.5)
    const mat = (part: number) =>
      new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: atlas.tex }, uPart: { value: part } },
        vertexShader: vert,
        fragmentShader: frag,
        side: part === 2 ? THREE.DoubleSide : THREE.FrontSide,
      })
    return [
      { geo: top, mat: mat(0) },
      { geo: bottom, mat: mat(1) },
      { geo: flap, mat: mat(2) },
    ]
  }, [atlas, attrs])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    for (const mesh of meshes.current) {
      if (!mesh) continue
      for (let i = 0; i < N; i++) {
        const c = i % COLS
        const r = Math.floor(i / COLS)
        m.makeTranslation(-BOARD_W / 2 + CW / 2 + c * PX, BOARD_H / 2 - CH / 2 - r * PY, 0)
        mesh.setMatrixAt(i, m)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [])

  // new target → each cell gets a short run of intermediate characters, staggered by column / row
  useEffect(() => {
    const drumIdx = (code: number) => {
      const i = code % AMBER
      return i < DRUM.length ? i : Math.floor(Math.random() * DRUM.length)
    }
    for (let i = 0; i < N; i++) {
      const cell = cells[i]
      const to = target[i]
      const last = cell.queue.length ? cell.queue[cell.queue.length - 1] : cell.cur
      if (last === to) continue
      const amber = to >= AMBER ? AMBER : 0
      const steps = 2 + Math.floor(Math.random() * 5)
      const start = drumIdx(cell.queue.length ? cell.queue[0] : cell.cur)
      const keep = cell.queue.length ? [cell.queue[0]] : []
      const run: number[] = []
      for (let k = 1; k <= steps; k++) run.push(((start + k) % DRUM.length) + amber)
      cell.queue = [...keep, ...run, to]
      if (!keep.length) {
        const c = i % COLS
        const r = Math.floor(i / COLS)
        cell.delay = c * 0.05 + r * 0.11 + Math.random() * 0.06
        cell.t = 0
      }
    }
  }, [target, cells])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const A = attrs.a.array as Float32Array
    const B = attrs.b.array as Float32Array
    const ANG = attrs.angle.array as Float32Array
    for (let i = 0; i < N; i++) {
      const cell = cells[i]
      if (!cell.queue.length) {
        A[i] = B[i] = cell.cur
        ANG[i] = 0
        continue
      }
      if (cell.delay > 0) {
        cell.delay -= dt
        A[i] = B[i] = cell.cur
        ANG[i] = 0
        continue
      }
      const final = cell.queue.length === 1
      const dur = final ? 0.34 : 0.105
      cell.t += dt / dur
      if (cell.t >= 1) {
        cell.cur = cell.queue.shift()!
        cell.t = cell.queue.length ? Math.min(cell.t - 1, 0.5) : 0
        A[i] = B[i] = cell.cur
        ANG[i] = 0
        continue
      }
      const next = cell.queue[0]
      const t = cell.t
      if (t < FALL) {
        const k = t / FALL
        // released from the top and accelerating, like a card falling on its hinge
        A[i] = cell.cur
        B[i] = next
        ANG[i] = Math.PI * (0.18 * k + 0.82 * k * k)
      } else {
        // it hits the stop and bounces a little
        const u = (t - FALL) / (1 - FALL)
        A[i] = B[i] = next
        ANG[i] = Math.PI - Math.sin(Math.PI * u) * (1 - u) * (final ? 0.42 : 0.16)
      }
    }
    attrs.a.needsUpdate = attrs.b.needsUpdate = attrs.angle.needsUpdate = true
  })

  return (
    <>
      {parts.map((p, k) => (
        <instancedMesh key={k} ref={(m) => void (meshes.current[k] = m)} args={[p.geo, p.mat, N]} frustumCulled={false} />
      ))}
    </>
  )
}

function Frame() {
  const W = BOARD_W + 0.9
  const H = BOARD_H + 1.1
  return (
    <group>
      {/* brushed metal bezel */}
      <RoundedBox args={[W, H, 0.5]} radius={0.16} smoothness={5} position={[0, 0, -0.32]}>
        <meshStandardMaterial color="#5a5a62" metalness={0.92} roughness={0.3} />
      </RoundedBox>
      {/* recessed black field */}
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[BOARD_W + 0.3, BOARD_H + 0.42]} />
        <meshStandardMaterial color="#060607" roughness={0.7} metalness={0.2} />
      </mesh>
      {/* chrome rails between rows */}
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <mesh key={r} position={[0, BOARD_H / 2 + 0.1 - r * PY, -0.02]}>
          <boxGeometry args={[BOARD_W + 0.24, 0.05, 0.05]} />
          <meshStandardMaterial color="#8a8a92" metalness={1} roughness={0.22} />
        </mesh>
      ))}
      {/* top status strip */}
      <mesh position={[-BOARD_W / 2 + 0.3, H / 2 - 0.27, -0.05]}>
        <circleGeometry args={[0.06, 20]} />
        <meshBasicMaterial color="#ffb547" toneMapped={false} />
      </mesh>
      <mesh position={[-BOARD_W / 2 + 0.52, H / 2 - 0.27, -0.05]}>
        <circleGeometry args={[0.06, 20]} />
        <meshBasicMaterial color="#3c3c42" />
      </mesh>
    </group>
  )
}

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { width, height } = useThree((s) => s.size)

  useLayoutEffect(() => {
    const mobile = width < 760
    const aspect = width / height
    const vf = THREE.MathUtils.degToRad(camera.fov / 2)
    const wantW = BOARD_W + 1.2
    const wantH = BOARD_H + 1.4
    const fracW = mobile ? 0.9 : 0.74
    const fracH = mobile ? 0.5 : 0.56
    const d = Math.max(wantW / 2 / (Math.tan(vf) * aspect * fracW), wantH / 2 / (Math.tan(vf) * fracH))
    camera.position.set(0, 0, d)
    camera.lookAt(0, 0, 0)
    const oy = POSTER ? 0 : mobile ? 0.1 : 0.07
    camera.setViewOffset(width, height, 0, oy * height, width, height)
    camera.updateProjectionMatrix()
  }, [camera, width, height])

  useFrame((s, dt) => {
    if (!g.current) return
    const k = Math.min(dt, 1 / 30)
    const t = s.clock.elapsedTime
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, -0.16 + s.pointer.x * 0.14 + Math.sin(t * 0.25) * 0.03, 3, k)
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -0.1 - s.pointer.y * 0.1, 3, k)
  })
  return <group ref={g}>{children}</group>
}

export default function SplitFlap() {
  const atlas = useMemo(makeAtlas, [])
  const [idx, setIdx] = useState(0)
  const [custom, setCustom] = useState<Line[] | null>(null)
  const [draft, setDraft] = useState('')
  const [auto, setAuto] = useState(true)
  const holdUntil = useRef(0)

  const lines = custom ?? MESSAGES[idx].lines
  const target = useMemo(() => {
    const out: number[] = []
    for (let r = 0; r < ROWS; r++) {
      const [text, amber] = lines[r] ?? ['']
      atlas.ensure(text)
      const chars = Array.from(text)
      for (let c = 0; c < COLS; c++) out.push(atlas.index(chars[c] ?? ' ') + (amber && chars[c] && chars[c] !== ' ' ? AMBER : 0))
    }
    return out
  }, [lines, atlas])

  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => {
      if (performance.now() < holdUntil.current) return
      setCustom(null)
      setIdx((i) => (i + 1) % MESSAGES.length)
    }, 6500)
    return () => clearInterval(id)
  }, [auto])

  const submit = () => {
    const s = draft.trim()
    if (!s) return
    setCustom(wrapText(s))
    holdUntil.current = performance.now() + 12000
  }

  const msg = MESSAGES[idx]

  return (
    <div className="stage flap-stage">
      <style>{`
        .flap-stage { background: radial-gradient(80% 70% at 50% 38%, #1f1d1b 0%, #121214 55%, #0b0b0c 100%); }
        .flap-stage .flap-glow { position: absolute; left: 50%; top: 40%; width: min(90vw, 1100px); height: 46vh; transform: translate(-50%, -50%);
          background: radial-gradient(closest-side, rgba(242, 196, 109, 0.12), transparent 70%); pointer-events: none; }
        .flap-input { width: clamp(150px, 26vw, 280px); height: 34px; padding: 0 14px; border: 0; border-radius: 999px; outline: none;
          background: rgba(255, 255, 255, 0.06); color: var(--fg); font: 500 13px/1 var(--sans); }
        .flap-input::placeholder { color: var(--fg-2); }
        .flap-input:focus { box-shadow: inset 0 0 0 1px rgba(242, 196, 109, 0.55); }
        .flap-go { color: #f2c46d !important; }
        @media (max-width: 760px) { .flap-stage .flap-glow { top: 30%; } }
      `}</style>
      <div className="flap-glow" aria-hidden />
      <Canvas dpr={[1, 2]} camera={{ fov: 30, near: 0.1, far: 200 }} gl={{ antialias: true, alpha: true }}>
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2.2} color="#fff3df" position={[0, 6, 4]} scale={[14, 2.4, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.4} color="#ffd59a" position={[-8, 1, 3]} scale={[3, 8, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.9} color="#9fb6ff" position={[8, -2, 3]} scale={[3, 8, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[0, 3.2, 12]} scale={[40, 1.1, 1]} target={[0, 0, 0]} />
          <Lightformer form="rect" intensity={0.5} color="#ffe2b8" position={[0, -4, 12]} scale={[40, 3, 1]} target={[0, 0, 0]} />
          <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[3, 3, 6]} scale={2} target={[0, 0, 0]} />
        </Environment>
        <ambientLight intensity={0.25} />
        <Rig>
          <Frame />
          <Flaps atlas={atlas} target={target} />
        </Rig>
      </Canvas>

      <div className="overlay">
        <BigLabel
          id={custom ? 'custom' : msg.key}
          meta={custom ? 'CUSTOM · 64 FLAPS' : `${String(idx + 1).padStart(2, '0')} / ${String(MESSAGES.length).padStart(2, '0')} · 64 FLAPS`}
          title={custom ? '你的文字' : msg.title}
          sub={custom ? 'Your message' : msg.sub}
          aside={custom ? '12 秒后继续轮播' : msg.aside}
        />
        <form
          className="dock"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            className="flap-input"
            value={draft}
            maxLength={64}
            placeholder="输入一句话，回车翻牌…"
            onChange={(e) => setDraft(e.target.value)}
            aria-label="翻牌内容"
          />
          <button className="seg flap-go" type="submit">
            <span>翻牌</span>
          </button>
          <span className="dock-sep" />
          <button
            className="seg"
            type="button"
            onClick={() => {
              setCustom(null)
              setIdx((i) => (i + 1) % MESSAGES.length)
              holdUntil.current = performance.now() + 4000
            }}
          >
            <span>下一条</span>
          </button>
          <button className="seg" type="button" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
            <span>{auto ? '暂停' : '轮播'}</span>
          </button>
        </form>
        <p className="hint">移动指针改变视角 · 中英文都能翻</p>
      </div>
    </div>
  )
}
