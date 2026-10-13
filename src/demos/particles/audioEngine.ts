import * as THREE from 'three'

/* ------------------------------------------------------------------ synth + analysis graph */

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

/** i – VI – III – VII in A minor, voiced as 7ths / 6ths so the pad stays lush */
const PROG = [
  { root: 33, notes: [57, 60, 64, 67] }, // Am7
  { root: 29, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 36, notes: [55, 59, 60, 64] }, // Cmaj7
  { root: 31, notes: [55, 59, 62, 64] }, // G6
]
/** bass: offset from the chord root per 16th step (classic offbeat house line + a little bounce) */
const BASS: Record<number, number> = { 2: 12, 6: 12, 10: 12, 11: 24, 14: 12, 15: 19 }
const ARP = [0, 1, 2, 3, 2, 1, 3, 2]

export type Source = 'demo' | 'mic'

/**
 * Procedural 116 BPM loop (kick / clap / hats / bass / pad / arp) scheduled with a lookahead timer,
 * plus an optional microphone input. Everything feeds one AnalyserNode (fftSize 2048).
 * The analyser taps the mix *before* the volume stage, so muting keeps the visuals alive.
 */
export class AudioEngine {
  readonly ctx: AudioContext
  readonly analyser: AnalyserNode
  readonly bpm = 116
  private out: GainNode
  private comp: DynamicsCompressorNode
  private music: GainNode
  private drums: GainNode
  private padDuck: GainNode
  private padFilter: BiquadFilterNode
  private arpBus: GainNode
  private lfo: OscillatorNode
  private noise: AudioBuffer
  private timer = 0
  private step = 0
  private nextTime = 0
  private running = false
  private compTap = true
  private mic: MediaStream | null = null
  private micSrc: MediaStreamAudioSourceNode | null = null
  private micGain: GainNode
  private closed = false

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }))

    const an = (this.analyser = c.createAnalyser())
    an.fftSize = 2048
    an.smoothingTimeConstant = 0.35
    an.minDecibels = -78
    an.maxDecibels = -14
    // keep the analyser in the pulled graph without making it audible
    const sink = c.createGain()
    sink.gain.value = 0
    an.connect(sink).connect(c.destination)

    this.out = c.createGain()
    this.out.gain.value = 0.8
    this.out.connect(c.destination)

    const comp = (this.comp = c.createDynamicsCompressor())
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 3.5
    comp.attack.value = 0.004
    comp.release.value = 0.18
    comp.connect(this.out)
    comp.connect(an)

    this.music = c.createGain()
    this.music.connect(comp)
    this.drums = c.createGain()
    this.drums.connect(this.music)

    // pad: detuned saws → slowly breathing low-pass → sidechain duck (pumped by the kick)
    this.padDuck = c.createGain()
    this.padDuck.connect(this.music)
    this.padFilter = c.createBiquadFilter()
    this.padFilter.type = 'lowpass'
    this.padFilter.frequency.value = 1500
    this.padFilter.Q.value = 0.8
    this.padFilter.connect(this.padDuck)
    this.lfo = c.createOscillator()
    this.lfo.frequency.value = 0.07
    const lfoAmt = c.createGain()
    lfoAmt.gain.value = 700
    this.lfo.connect(lfoAmt).connect(this.padFilter.frequency)
    this.lfo.start()

    // arp: dry + dotted-8th feedback echo
    this.arpBus = c.createGain()
    this.arpBus.gain.value = 0.7
    this.arpBus.connect(this.music)
    const delay = c.createDelay(1)
    delay.delayTime.value = (3 * 60) / this.bpm / 4
    const fb = c.createGain()
    fb.gain.value = 0.4
    const dlp = c.createBiquadFilter()
    dlp.type = 'lowpass'
    dlp.frequency.value = 2800
    const wet = c.createGain()
    wet.gain.value = 0.55
    this.arpBus.connect(delay)
    delay.connect(dlp).connect(fb).connect(delay)
    dlp.connect(wet).connect(this.music)

    this.micGain = c.createGain()
    this.micGain.gain.value = 2.2

    const len = c.sampleRate
    this.noise = c.createBuffer(1, len, c.sampleRate)
    const d = this.noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }

  /* ---------------------------------------------------------------- transport */

  private tick = () => {
    const c = this.ctx
    if (c.state !== 'running') return
    // after a throttled background tab, skip ahead instead of firing a burst of stale notes
    if (this.nextTime < c.currentTime - 0.05) this.nextTime = c.currentTime + 0.03
    const s16 = 60 / this.bpm / 4
    while (this.nextTime < c.currentTime + 0.12) {
      this.stepAt(this.step, this.nextTime)
      this.nextTime += s16
      this.step = (this.step + 1) % 64
    }
  }

  startMusic() {
    if (this.running || this.closed) return
    this.running = true
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.06
    this.timer = window.setInterval(this.tick, 25)
    this.tick()
  }

  stopMusic() {
    this.running = false
    clearInterval(this.timer)
  }

  setMuted(m: boolean) {
    this.out.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.04)
  }

  useDemo() {
    this.stopMic()
    if (!this.compTap) {
      this.comp.connect(this.analyser)
      this.compTap = true
    }
    this.music.gain.cancelScheduledValues(this.ctx.currentTime)
    this.music.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05)
    this.startMusic()
  }

  /** resolves false on denial / no device / insecure origin — caller falls back to the demo loop */
  async useMic(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } })
    } catch {
      return false
    }
    if (this.closed) {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    this.stopMic()
    this.stopMusic()
    this.music.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05)
    if (this.compTap) {
      this.comp.disconnect(this.analyser)
      this.compTap = false
    }
    this.mic = stream
    this.micSrc = this.ctx.createMediaStreamSource(stream)
    // analysis only — never routed to the speakers (no feedback)
    this.micSrc.connect(this.micGain).connect(this.analyser)
    return true
  }

  private stopMic() {
    this.micSrc?.disconnect()
    this.micGain.disconnect()
    this.micSrc = null
    this.mic?.getTracks().forEach((t) => t.stop())
    this.mic = null
  }

  dispose() {
    this.closed = true
    this.stopMusic()
    this.stopMic()
    try {
      this.lfo.stop()
    } catch {
      /* already stopped */
    }
    void this.ctx.close()
  }

  /* ---------------------------------------------------------------- sequence */

  private stepAt(step: number, t: number) {
    const bar = step >> 4
    const s = step & 15
    const ch = PROG[bar]
    const s16 = 60 / this.bpm / 4

    if (s % 4 === 0) this.kick(t)
    if (s === 4 || s === 12) this.clap(t)
    if (s % 4 === 2) this.hat(t, 0.3, 0.05)
    else if (s % 2 === 1 && bar >= 2) this.hat(t, 0.07, 0.025)
    if (s === 14 && bar === 3) this.hat(t, 0.16, 0.28)

    const b = BASS[s]
    if (b !== undefined) this.bass(t, ch.root + b, s16 * (s === 11 || s === 15 ? 0.8 : 1.6))
    if (s === 0) this.pad(t, ch.notes, s16 * 16)
    this.arp(t, ch.notes[ARP[s % 8]] + 12 + (s >= 12 && bar % 2 === 1 ? 12 : 0), s % 4 === 0 ? 0.075 : 0.045)
  }

  private kick(t: number) {
    const c = this.ctx
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(165, t)
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09)
    o.frequency.exponentialRampToValueAtTime(43, t + 0.4)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.95, t + 0.003)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34)
    o.connect(g).connect(this.drums)
    o.start(t)
    o.stop(t + 0.38)
    // sidechain pump
    const d = this.padDuck.gain
    d.setValueAtTime(1, t)
    d.linearRampToValueAtTime(0.22, t + 0.012)
    d.linearRampToValueAtTime(1, t + 0.34)
  }

  private noiseHit(t: number, filter: BiquadFilterNode, g: GainNode, dur: number) {
    const src = this.ctx.createBufferSource()
    src.buffer = this.noise
    src.connect(filter).connect(g).connect(this.drums)
    src.start(t, Math.random() * 0.5)
    src.stop(t + dur)
  }

  private hat(t: number, vel: number, decay: number) {
    const c = this.ctx
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7200
    const g = c.createGain()
    g.gain.setValueAtTime(vel, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + decay)
    this.noiseHit(t, f, g, decay + 0.02)
  }

  private clap(t: number) {
    const c = this.ctx
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1350
    f.Q.value = 0.9
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    for (let k = 0; k < 3; k++) {
      const tk = t + k * 0.011
      g.gain.setValueAtTime(0.6, tk)
      g.gain.exponentialRampToValueAtTime(0.08, tk + 0.009)
    }
    g.gain.setValueAtTime(0.5, t + 0.033)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24)
    this.noiseHit(t, f, g, 0.26)
  }

  private bass(t: number, midi: number, dur: number) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = mtof(midi)
    const sub = c.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = mtof(midi)
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 6
    f.frequency.setValueAtTime(170, t)
    f.frequency.exponentialRampToValueAtTime(1250, t + 0.02)
    f.frequency.exponentialRampToValueAtTime(240, t + dur)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.32, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.14, t + dur)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.04)
    const sg = c.createGain()
    sg.gain.value = 0.45
    o.connect(f).connect(g).connect(this.music)
    sub.connect(sg).connect(g)
    o.start(t)
    sub.start(t)
    o.stop(t + dur + 0.06)
    sub.stop(t + dur + 0.06)
  }

  private pad(t: number, notes: number[], dur: number) {
    const c = this.ctx
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.075, t + 0.35)
    g.gain.setValueAtTime(0.075, t + dur - 0.1)
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6)
    g.connect(this.padFilter)
    for (const n of notes) {
      for (const det of [-9, 9]) {
        const o = c.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(n)
        o.detune.value = det
        o.connect(g)
        o.start(t)
        o.stop(t + dur + 0.7)
      }
    }
  }

  private arp(t: number, midi: number, vel: number) {
    const c = this.ctx
    const o = c.createOscillator()
    o.type = 'square'
    o.frequency.value = mtof(midi)
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(3400, t)
    f.frequency.exponentialRampToValueAtTime(900, t + 0.16)
    const g = c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vel, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    o.connect(f).connect(g).connect(this.arpBus)
    o.start(t)
    o.stop(t + 0.22)
  }
}

/* ------------------------------------------------------------------ spectrum texture + bands + beats */

export const BINS = 256
export const HIST = 128
const F_MIN = 30
const F_MAX = 14000
const PUSH = 1 / 40 // spectrogram rows per second → 128 rows ≈ 3.2 s of history
const binOf = (f: number) => Math.round(((BINS - 1) * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN))
const RANGES = { sub: [0, binOf(60)], bass: [binOf(60), binOf(250)], mid: [binOf(250), binOf(2000)], high: [binOf(2000), binOf(12000)] } as const
const avgRange = (a: Float32Array, [lo, hi]: readonly [number, number] | readonly number[]) => {
  let s = 0
  for (let i = lo; i < hi; i++) s += a[i]
  return s / (hi - lo)
}

/**
 * 256 log-spaced bands (30 Hz – 14 kHz) mixed between the live analyser and an idle simulation,
 * written into a 256×128 R8 texture whose rows are the scrolling history (row 0 = now).
 */
export class Spectrum {
  readonly data = new Uint8Array(BINS * HIST)
  readonly texture: THREE.DataTexture
  readonly cur = new Float32Array(BINS)
  private raw = new Float32Array(BINS)
  private fft = new Uint8Array(1024)
  private lo = new Float32Array(BINS)
  private hi = new Float32Array(BINS)
  private mappedRate = 0
  sub = 0
  bass = 0
  mid = 0
  high = 0
  /** high band normalised against its own slowly-decaying peak (auto gain — works for mic and synth alike) */
  highN = 0
  private highPeak = 0.12
  /** fractional progress toward the next history row (0..1) — lets the terrain scroll smoothly */
  scroll = 0
  beatCount = 0
  private acc = 0
  private avg = 0.25
  private prevE = 0
  private lastBeat = -9
  private idleKickAt = 0
  private time = 0

  constructor() {
    const t = new THREE.DataTexture(this.data, BINS, HIST, THREE.RedFormat, THREE.UnsignedByteType)
    t.minFilter = THREE.LinearFilter
    t.magFilter = THREE.LinearFilter
    t.wrapS = THREE.ClampToEdgeWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
    t.needsUpdate = true
    this.texture = t
  }

  private map(rate: number) {
    const nyq = rate / 2
    const n = this.fft.length
    for (let i = 0; i < BINS; i++) {
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, (i - 0.5) / (BINS - 1))
      const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (i + 0.5) / (BINS - 1))
      this.lo[i] = (f0 / nyq) * n
      this.hi[i] = (f1 / nyq) * n
    }
    this.mappedRate = rate
  }

  /** returns beat strength (0..1) on an onset frame, else 0 */
  update(dt: number, analyser: AnalyserNode | null, live: number): number {
    this.time += dt
    const t = this.time
    const raw = this.raw

    // idle simulation: a tilted noise spectrum with a soft 63 BPM "heartbeat" so it's never dead
    if (t - this.idleKickAt > 0.95) this.idleKickAt = t
    const ik = Math.exp(-(t - this.idleKickAt) * 6)
    for (let i = 0; i < BINS; i++) {
      const x = i / (BINS - 1)
      const n = 0.5 + 0.3 * Math.sin(i * 0.13 + t * 1.7) + 0.2 * Math.sin(i * 0.051 - t * 0.9 + 1.3) * Math.sin(t * 0.37 + i * 0.02)
      const base = 0.5 * Math.exp(-x * 2.0) + 0.1
      let v = base * (0.45 + 0.7 * n) + ik * 0.5 * Math.exp(-x * 9)
      if (x > 0.62) v += 0.14 * Math.max(0, Math.sin(i * 1.7 + t * 9.0) * Math.sin(i * 0.31 - t * 5.3))
      raw[i] = v * (1 - live)
    }

    if (analyser && live > 0) {
      if (analyser.context.sampleRate !== this.mappedRate) this.map(analyser.context.sampleRate)
      analyser.getByteFrequencyData(this.fft)
      const fft = this.fft
      const last = fft.length - 1
      for (let i = 0; i < BINS; i++) {
        const lo = this.lo[i]
        const hi = this.hi[i]
        let v: number
        if (hi - lo < 1) {
          const k = Math.min((lo + hi) / 2, last - 1)
          const k0 = Math.floor(k)
          v = fft[k0] + (fft[k0 + 1] - fft[k0]) * (k - k0)
        } else {
          v = 0
          for (let k = Math.floor(lo), e = Math.min(Math.ceil(hi), last); k <= e; k++) v = Math.max(v, fft[k])
        }
        const x = i / (BINS - 1)
        v = (v / 255) * (0.88 + 0.7 * x)
        v = Math.max(0, (v - 0.14) / 0.86)
        raw[i] += Math.pow(v, 1.45) * live
      }
    }

    // per-band attack / release
    const att = 1 - Math.exp(-dt * 30)
    const rel = 1 - Math.exp(-dt * 7)
    const cur = this.cur
    for (let i = 0; i < BINS; i++) {
      const v = Math.min(1, raw[i])
      cur[i] += (v - cur[i]) * (v > cur[i] ? att : rel)
    }

    const sub = avgRange(cur, RANGES.sub)
    const bass = avgRange(cur, RANGES.bass)
    const sm = 1 - Math.exp(-dt * 12)
    this.sub += (sub - this.sub) * sm
    this.bass += (bass - this.bass) * sm
    this.mid += (avgRange(cur, RANGES.mid) - this.mid) * sm
    this.high += (avgRange(cur, RANGES.high) - this.high) * sm
    this.highPeak = Math.max(this.high, this.highPeak * Math.exp(-dt / 5), 0.1)
    this.highN = this.high / this.highPeak

    // onset: instantaneous low-end energy (unsmoothed) vs its own moving average, rising edge only,
    // with a refractory window so the offbeat bass doesn't double-trigger
    const e = avgRange(raw, RANGES.sub) * 0.6 + avgRange(raw, RANGES.bass) * 0.4
    let beat = 0
    if (e > this.avg * 1.15 + 0.035 && e - this.prevE > 0.012 && t - this.lastBeat > 0.3) {
      beat = Math.min(1, Math.max(0.3, (e - this.avg) * 3))
      this.lastBeat = t
      this.beatCount++
    }
    this.prevE = e
    this.avg += (e - this.avg) * (1 - Math.exp(-dt / 0.5))

    // history scroll + current row
    this.acc += dt
    while (this.acc >= PUSH) {
      this.data.copyWithin(BINS, 0, BINS * (HIST - 1))
      this.acc -= PUSH
    }
    this.scroll = this.acc / PUSH
    for (let i = 0; i < BINS; i++) this.data[i] = Math.round(cur[i] * 255)
    this.texture.needsUpdate = true
    return beat
  }
}
