/// Runs the hourglass granular sim off the main thread. The page asks for a tick whenever it has
/// consumed the previous result, so the sim self-paces to whichever of (render, sim) is slower.
import { SandSim } from './hourglassSim'

export type InitMsg = { type: 'init'; n: number; r: number; fracLower: number; neck: number; flow: number; warm: number }
export type TickMsg = { type: 'tick'; dt: number; gx: number; gy: number; neck: number; flow: number; up: number; buf?: Float32Array }
export type StateMsg = { type: 'state'; buf: Float32Array; upper: number; passed: number }

const H = 1 / 180
const MAX_STEPS = 6
let sim: SandSim | null = null
let acc = 0
let passed = 0

const post = (m: StateMsg) => (self as unknown as Worker).postMessage(m, [m.buf.buffer])

function pack(buf: Float32Array | undefined, up: number): StateMsg {
  const s = sim!
  const out = buf && buf.length === s.n * 4 ? buf : new Float32Array(s.n * 4)
  const inv = 1 / H
  for (let i = 0; i < s.n; i++) {
    out[i * 4] = s.px[i]
    out[i * 4 + 1] = s.py[i]
    out[i * 4 + 2] = Math.hypot(s.px[i] - s.ox[i], s.py[i] - s.oy[i]) * inv
    out[i * 4 + 3] = s.rad[i] / s.r
  }
  return { type: 'state', buf: out, upper: s.countUpper(up), passed }
}

self.onmessage = (e: MessageEvent<InitMsg | TickMsg>) => {
  const m = e.data
  if (m.type === 'init') {
    sim = new SandSim(m.n, m.r)
    sim.neck = m.neck
    sim.flow = m.flow
    sim.init(m.fracLower)
    // settle the packing and get the stream going before the first frame is shown
    sim.step(H, Math.round(m.warm / H))
    acc = 0
    post(pack(undefined, 1))
    return
  }
  const s = sim
  if (!s) return
  s.gx = m.gx
  s.gy = m.gy
  s.neck = m.neck
  s.flow = m.flow
  acc += Math.min(m.dt, 0.1)
  let steps = Math.floor(acc / H)
  if (steps > MAX_STEPS) {
    steps = MAX_STEPS
    acc = 0
  } else acc -= steps * H
  const before = s.countUpper(m.up)
  s.step(H, steps)
  const st = pack(m.buf, m.up)
  passed += Math.max(0, before - st.upper)
  st.passed = passed
  post(st)
}
