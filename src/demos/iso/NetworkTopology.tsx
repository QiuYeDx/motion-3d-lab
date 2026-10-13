import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig } from '../../lib/iso'
import { Seg } from '../../components/Seg'

/* ------------------------------------------------------------------ topology */
type Kind = 'edge' | 'gateway' | 'app' | 'db' | 'cache' | 'queue' | 'store'
type NodeDef = { name: string; zh: string; kind: Kind; x: number; z: number }
const NODES: NodeDef[] = [
  { name: 'edge-sh', zh: '边缘 · 上海', kind: 'edge', x: -7, z: -2 }, // 0
  { name: 'edge-sg', zh: '边缘 · 新加坡', kind: 'edge', x: -2, z: -7 }, // 1
  { name: 'gateway', zh: 'API 网关', kind: 'gateway', x: -2, z: -2 }, // 2
  { name: 'svc-order', zh: '订单服务', kind: 'app', x: 3, z: -2 }, // 3
  { name: 'svc-user', zh: '用户服务', kind: 'app', x: -2, z: 3 }, // 4
  { name: 'redis', zh: '缓存', kind: 'cache', x: 7, z: -5 }, // 5
  { name: 'pg-main', zh: '主库', kind: 'db', x: 3, z: 3 }, // 6
  { name: 'pg-replica', zh: '只读副本', kind: 'db', x: 7, z: 6 }, // 7
  { name: 'kafka', zh: '消息队列', kind: 'queue', x: -5, z: 6 }, // 8
  { name: 's3-backup', zh: '冷备份', kind: 'store', x: 0, z: 7 }, // 9
  { name: 'edge-fra', zh: '边缘 · 法兰克福', kind: 'edge', x: 3, z: -7 }, // 10
]

type Traffic = 'req' | 'cache' | 'query' | 'event'
const TCOL: Record<Traffic, string> = { req: '#4cc9f0', cache: '#fbbf24', query: '#a78bfa', event: '#34d399' }
const NODE_ACCENT: Record<Kind, string> = { edge: '#4cc9f0', gateway: '#4cc9f0', app: '#5eead4', db: '#a78bfa', cache: '#fbbf24', queue: '#34d399', store: '#94a3b8' }

// bend: which axis the pipe travels along first
const LINKS: { a: number; b: number; t: Traffic; bend: 'x' | 'z' }[] = [
  { a: 0, b: 2, t: 'req', bend: 'x' },
  { a: 1, b: 2, t: 'req', bend: 'z' },
  { a: 10, b: 3, t: 'req', bend: 'z' }, // 2
  { a: 2, b: 3, t: 'req', bend: 'x' }, // 3 — breaks in 故障
  { a: 2, b: 4, t: 'req', bend: 'z' },
  { a: 3, b: 5, t: 'cache', bend: 'x' },
  { a: 3, b: 6, t: 'query', bend: 'z' },
  { a: 4, b: 6, t: 'query', bend: 'x' },
  { a: 6, b: 7, t: 'query', bend: 'x' },
  { a: 4, b: 8, t: 'event', bend: 'x' },
  { a: 6, b: 9, t: 'query', bend: 'z' },
]
const BROKEN = 3

type Path = { pts: THREE.Vector3[]; cum: number[]; len: number }
const PIPE_Y = 0.12
const PATHS: Path[] = LINKS.map(({ a, b, bend }) => {
  const A = NODES[a]
  const B = NODES[b]
  const pts = [new THREE.Vector3(A.x, PIPE_Y, A.z)]
  const corner = bend === 'x' ? new THREE.Vector3(B.x, PIPE_Y, A.z) : new THREE.Vector3(A.x, PIPE_Y, B.z)
  if (!corner.equals(pts[0]) && !(corner.x === B.x && corner.z === B.z)) pts.push(corner)
  pts.push(new THREE.Vector3(B.x, PIPE_Y, B.z))
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
  return { pts, cum, len: cum[cum.length - 1] }
})
const OUT: number[][] = NODES.map((_, n) => LINKS.map((l, i) => (l.a === n ? i : -1)).filter((i) => i >= 0))
const INCIDENT: number[][] = NODES.map((_, n) => LINKS.map((l, i) => (l.a === n || l.b === n ? i : -1)).filter((i) => i >= 0))

const _v = new THREE.Vector3()
const _d = new THREE.Vector3()
function sample(path: Path, s: number, out: THREE.Vector3, dir: THREE.Vector3) {
  s = Math.max(0, Math.min(path.len, s))
  let k = 1
  while (k < path.cum.length - 1 && path.cum[k] < s) k++
  const a = path.pts[k - 1]
  const b = path.pts[k]
  const seg = path.cum[k] - path.cum[k - 1] || 1
  out.lerpVectors(a, b, (s - path.cum[k - 1]) / seg)
  dir.subVectors(b, a).normalize()
}

/* ------------------------------------------------------------------ simulation (plain mutable state, read in useFrame) */
type Mode = 'normal' | 'high' | 'fault'
type Packet = { link: number; s: number; dir: 1 | -1; speed: number; col: THREE.Color; wave: number; alive: boolean; drop: number }
const MAX = 260
const RIPPLES = 8

function makeSim() {
  const packets: Packet[] = Array.from({ length: MAX }, () => ({ link: 0, s: 0, dir: 1, speed: 3, col: new THREE.Color(), wave: -1, alive: false, drop: 0 }))
  const pulse = new Float32Array(NODES.length)
  const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0))
  const rippleCol = Array.from({ length: RIPPLES }, () => new THREE.Color())
  const waves = new Map<number, Set<number>>()
  const sim = {
    packets,
    pulse,
    ripples,
    rippleCol,
    mode: 'normal' as Mode,
    time: 0,
    rippleHead: 0,
    waveId: 0,
    spawned: 0,
    acc: new Float32Array(NODES.length),
    lastUser: -100,
    spawn(link: number, dir: 1 | -1, col: THREE.Color | string, speed: number, wave = -1, s0 = 0) {
      const p = packets.find((q) => !q.alive)
      if (!p) return
      p.alive = true
      p.link = link
      p.dir = dir
      p.s = s0
      p.speed = speed
      p.wave = wave
      p.drop = 0
      p.col.set(col as THREE.ColorRepresentation)
      sim.spawned++
    },
    ripple(n: number, strength: number, col: string) {
      const r = ripples[sim.rippleHead]
      r.set(NODES[n].x, NODES[n].z, sim.time, strength)
      rippleCol[sim.rippleHead].set(col)
      sim.rippleHead = (sim.rippleHead + 1) % RIPPLES
    },
    linkOk(i: number) {
      return i !== BROKEN || sim.mode !== 'fault'
    },
    broadcast(n: number, wave = -1, from = -1) {
      if (wave < 0) {
        wave = ++sim.waveId
        waves.set(wave, new Set([n]))
        if (waves.size > 6) waves.delete(waves.keys().next().value!)
        sim.ripple(n, 1, '#7dd3fc')
      } else sim.ripple(n, 0.45, '#7dd3fc')
      pulse[n] = 1.4
      const seen = waves.get(wave)
      for (const li of INCIDENT[n]) {
        if (li === from || !sim.linkOk(li)) continue
        const l = LINKS[li]
        const other = l.a === n ? l.b : l.a
        if (seen?.has(other)) continue
        const dir: 1 | -1 = l.a === n ? 1 : -1
        for (let k = 0; k < 3; k++) {
          const s0 = dir === 1 ? -k * 0.32 : PATHS[li].len + k * 0.32
          sim.spawn(li, dir, '#e0f7ff', 7.5, k === 0 ? wave : -2, s0)
        }
      }
    },
    arrive(p: Packet) {
      const l = LINKS[p.link]
      const n = p.dir === 1 ? l.b : l.a
      if (p.wave === -2) return // burst tail
      if (p.wave >= 0) {
        const seen = waves.get(p.wave)
        if (seen && !seen.has(n)) {
          seen.add(n)
          sim.broadcast(n, p.wave, p.link)
        }
        return
      }
      pulse[n] = Math.max(pulse[n], 0.7)
      // forward regular traffic downstream
      const outs = OUT[n].filter((i) => sim.linkOk(i))
      if (!outs.length) return
      const kind = NODES[n].kind
      const pass = kind === 'db' ? 0.45 : 0.9
      if (Math.random() > pass) return
      const li = outs[Math.floor(Math.random() * outs.length)]
      sim.spawn(li, 1, TCOL[LINKS[li].t], sim.mode === 'high' ? 4.4 : 3.2)
    },
  }
  return sim
}
type Sim = ReturnType<typeof makeSim>

/* ------------------------------------------------------------------ floor: grid + ripples */
const floorVert = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const floorFrag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uFar;
  uniform vec3 uLine;
  uniform vec4 uR[${RIPPLES}];
  uniform vec3 uRC[${RIPPLES}];
  varying vec3 vW;
  float grid(vec2 p, float s) {
    vec2 q = p / s;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main() {
    vec2 p = vW.xz;
    float d = length(p - vec2(0.5, 0.0));
    float fade = 1.0 - smoothstep(7.0, 17.0, d);
    vec3 col = mix(uFar, uBase, fade);
    float minor = grid(p + 0.5, 1.0);
    float major = grid(p + 0.5, 5.0);
    col += uLine * (minor * 0.06 + major * 0.1) * fade;
    for (int i = 0; i < ${RIPPLES}; i++) {
      float age = uTime - uR[i].z;
      if (age < 0.0 || age > 2.2) continue;
      float r = age * 4.6;
      float dd = length(p - uR[i].xy);
      float k = (1.0 - age / 2.2);
      float ring = exp(-pow((dd - r) * 3.2, 2.0)) * k * k * uR[i].w;
      float inner = smoothstep(r, r * 0.4, dd) * k * k * 0.25 * uR[i].w;
      col += uRC[i] * (ring * (0.22 + minor * 0.9) + inner * minor);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

function Floor({ sim, onMiss }: { sim: Sim; onMiss: () => void }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: floorVert,
        fragmentShader: floorFrag,
        uniforms: {
          uTime: { value: 0 },
          uBase: { value: new THREE.Color('#0f1727') },
          uFar: { value: new THREE.Color('#070a12') },
          uLine: { value: new THREE.Color('#4f9fd0') },
          uR: { value: sim.ripples },
          uRC: { value: sim.rippleCol },
        },
      }),
    [sim],
  )
  useFrame(() => {
    mat.uniforms.uTime.value = sim.time
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={mat} onClick={onMiss}>
      <planeGeometry args={[120, 120]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ pipes */
const pipeMat = new THREE.MeshStandardMaterial({ color: '#1a2436', roughness: 0.55, metalness: 0.35 })
const boxG = new THREE.BoxGeometry(1, 1, 1)

function Pipe({ i, sim }: { i: number; sim: Sim }) {
  const path = PATHS[i]
  const col = TCOL[LINKS[i].t]
  const line = useMemo(() => new THREE.MeshBasicMaterial({ color: col, toneMapped: false, transparent: true, opacity: 0.6 }), [col])
  const red = useMemo(() => new THREE.Color('#ff4d5e').multiplyScalar(2.2), [])
  const base = useMemo(() => new THREE.Color(col), [col])
  const mark = useRef<THREE.Mesh>(null)
  const segs = useMemo(() => {
    const out: { p: THREE.Vector3; s: [number, number, number] }[] = []
    for (let k = 1; k < path.pts.length; k++) {
      const a = path.pts[k - 1]
      const b = path.pts[k]
      const len = a.distanceTo(b)
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const alongX = Math.abs(a.x - b.x) > 0.01
      out.push({ p: mid, s: alongX ? [len + 0.22, 1, 0.22] : [0.22, 1, len + 0.22] })
    }
    return out
  }, [path])
  const mid = useMemo(() => {
    const v = new THREE.Vector3()
    sample(path, path.len / 2, v, _d)
    return v
  }, [path])

  useFrame(() => {
    const ok = sim.linkOk(i)
    const fault = i === BROKEN && !ok
    if (fault) {
      line.color.copy(red)
      line.opacity = 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(sim.time * 9))
    } else {
      line.color.copy(base)
      line.opacity = sim.mode === 'high' ? 0.75 : 0.5
    }
    if (mark.current) {
      mark.current.visible = fault
      mark.current.rotation.y = sim.time * 2
    }
  })

  return (
    <group>
      {segs.map((sg, k) => (
        <group key={k} position={sg.p}>
          <mesh geometry={boxG} material={pipeMat} position={[0, 0.06, 0]} scale={[sg.s[0], 0.12, sg.s[2]]} />
          <mesh
            geometry={boxG}
            material={line}
            position={[0, 0.125, 0]}
            scale={[sg.s[0] === 0.22 ? 0.05 : sg.s[0] - 0.2, 0.01, sg.s[2] === 0.22 ? 0.05 : sg.s[2] - 0.2]}
          />
        </group>
      ))}
      {i === BROKEN && (
        <mesh ref={mark} position={[mid.x, 0.55, mid.z]} visible={false}>
          <octahedronGeometry args={[0.2]} />
          <meshBasicMaterial color={red} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ packets (instanced, with short trails) */
const TRAIL = 3
function Packets({ sim }: { sim: Sim }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const sc = useMemo(() => new THREE.Vector3(), [])
  const c = useMemo(() => new THREE.Color(), [])
  const X = useMemo(() => new THREE.Vector3(1, 0, 0), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const mesh = ref.current
    if (!mesh) return
    let n = 0
    for (const p of sim.packets) {
      if (!p.alive) continue
      const path = PATHS[p.link]
      if (!sim.linkOk(p.link) && p.drop === 0) p.drop = 0.001
      if (p.drop > 0) {
        p.drop += dt
        if (p.drop > 0.5) {
          p.alive = false
          continue
        }
      } else p.s += p.dir * p.speed * dt
      if ((p.dir === 1 && p.s >= path.len) || (p.dir === -1 && p.s <= 0)) {
        p.alive = false
        sim.arrive(p)
        continue
      }
      for (let k = 0; k < TRAIL; k++) {
        const s = p.s - p.dir * k * 0.16
        if (s < 0 || s > path.len) continue
        sample(path, s, _v, _d)
        q.setFromUnitVectors(X, _d)
        const f = 1 - k / TRAIL
        const dropF = p.drop > 0 ? 1 - p.drop / 0.5 : 1
        sc.set(0.26 * f + 0.06, 0.09 * f * dropF + 0.01, 0.09 * f * dropF + 0.01)
        _v.y = PIPE_Y + 0.2 + (p.drop > 0 ? p.drop * 0.8 : 0)
        m.compose(_v, q, sc)
        mesh.setMatrixAt(n, m)
        c.copy(p.drop > 0 ? c.set('#ff4d5e') : p.col).multiplyScalar((k === 0 ? 3.2 : 1.6) * f)
        mesh.setColorAt(n, c)
        n++
        if (n >= MAX * TRAIL) break
      }
    }
    for (let i = n; i < mesh.count; i++) mesh.setMatrixAt(i, zero)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, MAX * TRAIL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ nodes */
const padTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = 3
  g.shadowColor = '#fff'
  g.shadowBlur = 10
  g.beginPath()
  g.roundRect(14, 14, 100, 100, 18)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  return t
})()
const darkMat = new THREE.MeshStandardMaterial({ color: '#1c2638', roughness: 0.5, metalness: 0.4 })
const darkMat2 = new THREE.MeshStandardMaterial({ color: '#253149', roughness: 0.45, metalness: 0.4 })
const padMat = new THREE.MeshStandardMaterial({ color: '#141c2b', roughness: 0.6, metalness: 0.3 })

function NodeView({ i, sim, hovered, setHovered, onHit }: { i: number; sim: Sim; hovered: number; setHovered: (n: number) => void; onHit: (n: number) => void }) {
  const def = NODES[i]
  const accent = NODE_ACCENT[def.kind]
  const body = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), [accent])
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ map: padTex, color: accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [accent])
  const ledA = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), [accent])
  const ledB = useMemo(() => new THREE.MeshBasicMaterial({ color: '#4ade80', toneMapped: false }), [])
  const base = useMemo(() => new THREE.Color(accent), [accent])
  const tmp = useMemo(() => new THREE.Color(), [])
  const hov = useRef(0)

  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    const t = sim.time
    sim.pulse[i] = Math.max(0, sim.pulse[i] - dt * 2.4)
    const pz = sim.pulse[i]
    hov.current += ((hovered === i ? 1 : 0) - hov.current) * Math.min(1, dt * 12)
    const high = sim.mode === 'high'
    tmp.copy(base)
    glow.color.copy(tmp).multiplyScalar(1.6 + pz * 2.6 + hov.current * 0.8)
    ring.color.copy(tmp).multiplyScalar(0.35 + pz * 1.6 + hov.current * 0.6)
    const rate = high ? 14 : 5
    ledA.color.copy(tmp).multiplyScalar(Math.sin(t * rate + i) > 0 ? 2.2 : 0.25)
    ledB.color.set(high ? '#fbbf24' : '#4ade80').multiplyScalar(Math.sin(t * rate * 0.7 + i * 2) > -0.3 ? 2 : 0.3)
    if (body.current) {
      const s = 1 + pz * 0.07
      body.current.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s))
      body.current.position.y = hov.current * 0.12 + pz * 0.05
    }
    if (spin.current) spin.current.rotation.y = t * (high ? 1.6 : 0.7) + i
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(i)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    setHovered(-1)
    document.body.style.cursor = ''
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onHit(i)
  }

  let model: React.ReactNode = null
  switch (def.kind) {
    case 'edge':
      model = (
        <>
          <mesh geometry={boxG} material={darkMat} position={[0, 0.15, 0]} scale={[0.7, 0.3, 0.7]} />
          <group ref={spin} position={[0, 0.82, 0]}>
            <mesh>
              <octahedronGeometry args={[0.38, 0]} />
              <meshStandardMaterial color="#2a3a57" roughness={0.3} metalness={0.5} flatShading transparent opacity={0.85} />
            </mesh>
            <mesh material={glow} scale={0.13}>
              <icosahedronGeometry args={[1, 1]} />
            </mesh>
          </group>
        </>
      )
      break
    case 'gateway':
      model = (
        <>
          <mesh material={darkMat} position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.72, 0.8, 0.9, 6]} />
          </mesh>
          <mesh material={glow} position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.745, 0.745, 0.06, 6]} />
          </mesh>
          <mesh material={darkMat2} position={[0, 0.95, 0]}>
            <cylinderGeometry args={[0.45, 0.6, 0.12, 6]} />
          </mesh>
          <mesh material={darkMat} position={[0, 1.15, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 6]} />
          </mesh>
          <mesh material={glow} position={[0, 1.38, 0]}>
            <sphereGeometry args={[0.07, 12, 8]} />
          </mesh>
        </>
      )
      break
    case 'app':
      model = (
        <>
          {[0, 1, 2].map((k) => (
            <group key={k} position={[0, 0.2 + k * 0.36, 0]}>
              <RoundedBox args={[0.92, 0.3, 0.92]} radius={0.04} smoothness={2} material={k % 2 ? darkMat2 : darkMat} />
              <mesh geometry={boxG} material={k === 1 ? ledB : ledA} position={[0.15, 0, 0.465]} scale={[0.4, 0.05, 0.01]} />
              <mesh geometry={boxG} material={k === 1 ? ledA : ledB} position={[0.465, 0, -0.1]} scale={[0.01, 0.05, 0.45]} />
              <mesh geometry={boxG} material={glow} position={[-0.3, 0, 0.465]} scale={[0.06, 0.06, 0.01]} />
            </group>
          ))}
        </>
      )
      break
    case 'db':
      model = (
        <>
          {[0, 1, 2].map((k) => (
            <group key={k} position={[0, 0.17 + k * 0.32, 0]}>
              <mesh material={darkMat}>
                <cylinderGeometry args={[0.55, 0.55, 0.26, 28]} />
              </mesh>
              <mesh material={glow} position={[0, 0.145, 0]}>
                <cylinderGeometry args={[0.5, 0.5, 0.03, 28]} />
              </mesh>
            </group>
          ))}
        </>
      )
      break
    case 'cache':
      model = (
        <>
          <RoundedBox args={[0.8, 0.8, 0.8]} radius={0.1} smoothness={3} position={[0, 0.42, 0]} material={darkMat} />
          <mesh geometry={boxG} material={glow} position={[0, 0.42, 0]} scale={[0.82, 0.06, 0.82]} />
          <group ref={spin} position={[0, 1.0, 0]}>
            <mesh material={glow}>
              <torusGeometry args={[0.18, 0.025, 8, 24]} />
            </mesh>
          </group>
        </>
      )
      break
    case 'queue':
      model = (
        <>
          <mesh geometry={boxG} material={darkMat} position={[0, 0.2, 0]} scale={[0.7, 0.4, 1.5]} />
          <group ref={spin}>{null}</group>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} geometry={boxG} material={k % 2 ? ledA : ledB} position={[0, 0.46, -0.5 + k * 0.33]} scale={[0.4, 0.12, 0.22]} />
          ))}
        </>
      )
      break
    case 'store':
      model = (
        <>
          <RoundedBox args={[1.1, 0.5, 0.8]} radius={0.06} smoothness={2} position={[0, 0.26, 0]} material={darkMat} />
          <mesh geometry={boxG} material={glow} position={[0, 0.3, 0.405]} scale={[0.7, 0.04, 0.01]} />
          <mesh geometry={boxG} material={ledB} position={[0.555, 0.3, 0]} scale={[0.01, 0.04, 0.4]} />
        </>
      )
      break
  }

  return (
    <group position={[def.x, 0, def.z]}>
      <mesh geometry={boxG} material={padMat} position={[0, 0.04, 0]} scale={[1.5, 0.08, 1.5]} />
      <mesh material={ring} position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={1.9}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <group onPointerOver={over} onPointerOut={out} onClick={click}>
        <group ref={body} position={[0, 0.08, 0]}>
          {model}
        </group>
        {/* generous invisible hit box */}
        <mesh geometry={boxG} position={[0, 0.7, 0]} scale={[1.5, 1.4, 1.5]} visible={false} />
      </group>
    </group>
  )
}

const TOP: Record<Kind, number> = { edge: 1.35, gateway: 1.55, app: 1.45, db: 1.35, cache: 1.25, queue: 1.0, store: 1.0 }

/** projects node anchors to screen and moves the DOM tags (cheaper and calmer than one React root per label) */
function TagProjector({ tags }: { tags: React.RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ camera, size }) => {
    NODES.forEach((n, i) => {
      const el = tags.current[i]
      if (!el) return
      v.set(n.x, TOP[n.kind] + 0.3, n.z).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`
    })
  })
  return null
}

/* ------------------------------------------------------------------ driver */
function Driver({ sim }: { sim: Sim }) {
  const sources = useMemo(() => NODES.map((n, i) => (n.kind === 'edge' ? i : -1)).filter((i) => i >= 0), [])
  useFrame((_, dt) => {
    dt = Math.min(dt, 1 / 30)
    sim.time += dt
    const high = sim.mode === 'high'
    const rate = high ? 3.6 : 1.1
    for (const n of sources) {
      sim.acc[n] += dt * rate * (0.7 + Math.random() * 0.6)
      while (sim.acc[n] >= 1) {
        sim.acc[n] -= 1
        const outs = OUT[n].filter((li) => sim.linkOk(li))
        if (outs.length) sim.spawn(outs[0], 1, TCOL.req, high ? 4.4 : 3.2)
      }
    }
    // background chatter on internal links so the graph never looks idle
    if (Math.random() < dt * (high ? 2.2 : 0.7)) {
      const li = 5 + Math.floor(Math.random() * 6)
      if (sim.linkOk(li)) sim.spawn(li, 1, TCOL[LINKS[li].t], high ? 4.4 : 3.2)
    }
  })
  return null
}

/** keep pointer cursor sane when leaving canvas */
function CursorReset() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const reset = () => (document.body.style.cursor = '')
    el.addEventListener('pointerleave', reset)
    return () => {
      el.removeEventListener('pointerleave', reset)
      reset()
    }
  }, [gl])
  return null
}

/* ------------------------------------------------------------------ page */
const MODE_COPY: Record<Mode, string> = {
  normal: '所有链路健康，请求从三个边缘节点进入网关，再分发到服务与数据库。',
  high: '流量翻三倍：数据包更密更快，机柜指示灯转为琥珀色。',
  fault: '网关 → 订单服务链路中断（红色），网关把请求全部改派给用户服务。',
}

export default function NetworkTopology() {
  const sim = useMemo(makeSim, [])
  const [mode, setMode] = useState<Mode>('normal')
  const [hovered, setHovered] = useState(-1)
  const [rps, setRps] = useState(0)
  const tags = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    sim.mode = mode
  }, [mode, sim])

  useEffect(() => {
    let last = sim.spawned
    const id = setInterval(() => {
      setRps(Math.round((sim.spawned - last) * 12.5))
      last = sim.spawned
    }, 800)
    // ambient: an occasional broadcast while idle
    const amb = setInterval(() => {
      if (sim.time - sim.lastUser < 8) return
      const pick = [2, 6, 3, 4][Math.floor(Math.random() * 4)]
      sim.broadcast(pick)
    }, 6500)
    const first = setTimeout(() => sim.broadcast(2), 1400)
    return () => {
      clearInterval(id)
      clearInterval(amb)
      clearTimeout(first)
    }
  }, [sim])

  const hit = (n: number) => {
    sim.lastUser = sim.time
    sim.broadcast(n)
  }

  return (
    <div className="stage" style={{ background: '#070a12' }}>
      <Canvas orthographic dpr={[1, 2]} camera={{ near: 0.1, far: 300 }} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={['#070a12']} />
        <IsoRig fit={26.5} mobileFit={21} mobileOffsetY={0.2} offset={[0.19, -0.02]} target={[0.4, 0, 0.2]} />
        <ambientLight intensity={0.5} color="#9fb4ff" />
        <hemisphereLight args={['#8fb8ff', '#0b0f1a', 0.7]} />
        <directionalLight position={[6, 10, 3]} intensity={1.6} color="#dbe8ff" />
        <directionalLight position={[-6, 4, 8]} intensity={0.5} color="#4cc9f0" />
        <Floor sim={sim} onMiss={() => setHovered(-1)} />
        {LINKS.map((_, i) => (
          <Pipe key={i} i={i} sim={sim} />
        ))}
        {NODES.map((_, i) => (
          <NodeView key={i} i={i} sim={sim} hovered={hovered} setHovered={setHovered} onHit={hit} />
        ))}
        <Packets sim={sim} />
        <Driver sim={sim} />
        <CursorReset />
        <TagProjector tags={tags} />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.55} luminanceSmoothing={0.25} radius={0.6} />
        </EffectComposer>
      </Canvas>

      <div className="nt-tags" aria-hidden>
        {NODES.map((n, i) => (
          <div key={n.name} ref={(el) => void (tags.current[i] = el)} className="nt-tag" data-hover={hovered === i}>
            <b>{n.name}</b>
            <span>{n.zh}</span>
          </div>
        ))}
      </div>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#4cc9f0' }} /> Isometric · Infra
          </p>
          <h1>
            让流量
            <br />
            看得见
          </h1>
          <p>十一个节点由等距管线相连，青色是请求、紫色是查询、琥珀是缓存、绿色是事件。点击任意节点发起一次广播，涟漪会沿拓扑逐跳扩散。</p>
          <div className="nt-legend">
            {(Object.keys(TCOL) as Traffic[]).map((k) => (
              <span key={k}>
                <i style={{ background: TCOL[k], boxShadow: `0 0 10px ${TCOL[k]}` }} />
                {{ req: '请求', cache: '缓存', query: '查询', event: '事件' }[k]}
              </span>
            ))}
          </div>
          <div className="hero-actions">
            <button className="btn primary" onClick={() => hit(2)}>
              从网关广播
            </button>
            <span className="btn nt-rps" style={{ cursor: 'default' }}>
              <i data-mode={mode} /> {rps} pkt/s
            </span>
          </div>
        </motion.div>

        <div className="dock">
          <Seg
            items={[
              { value: 'normal', label: '正常' },
              { value: 'high', label: '高负载' },
              { value: 'fault', label: '故障' },
            ]}
            value={mode}
            onChange={(v) => {
              sim.lastUser = sim.time
              setMode(v)
            }}
          />
        </div>
        <motion.p key={mode} className="hint nt-hint" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
          {MODE_COPY[mode]}
        </motion.p>
      </div>

      <style>{`
        .theme-dark .stage .scrim { --soft-bg: #070a12; }
        .nt-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 18px; font: 12px/1 var(--mono); color: var(--fg-2); }
        .nt-legend span { display: inline-flex; align-items: center; gap: 7px; }
        .nt-legend i { width: 14px; height: 4px; border-radius: 2px; }
        .nt-rps { font-family: var(--mono); font-size: 13px; min-width: 120px; }
        .nt-rps i { width: 7px; height: 7px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; }
        .nt-rps i[data-mode='high'] { background: #fbbf24; box-shadow: 0 0 8px #fbbf24; }
        .nt-rps i[data-mode='fault'] { background: #ff4d5e; box-shadow: 0 0 8px #ff4d5e; animation: nt-blink .6s steps(2) infinite; }
        @keyframes nt-blink { 50% { opacity: .25; } }
        .nt-hint { max-width: 300px; }
        .nt-tag { display: flex; flex-direction: column; align-items: center; gap: 3px; white-space: nowrap; user-select: none;
          padding: 4px 8px; border-radius: 7px; background: rgba(10,14,24,.62); box-shadow: inset 0 0 0 1px rgba(140,180,255,.14);
          backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); transition: box-shadow .2s, background .2s; }
        .nt-tag b { font: 500 10.5px/1 var(--mono); color: #e6f1ff; letter-spacing: .02em; }
        .nt-tag span { font: 10px/1 var(--sans); color: rgba(220,232,255,.55); }
        .nt-tag[data-hover='true'] { background: rgba(12,30,48,.8); box-shadow: inset 0 0 0 1px rgba(76,201,240,.7), 0 0 18px rgba(76,201,240,.25); }
        .nt-tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
        .nt-tags .nt-tag { position: absolute; left: 0; top: 0; will-change: transform; }
        @media (max-width: 760px) { .nt-tag span { display: none; } .nt-legend { display: none; } }
      `}</style>
    </div>
  )
}
