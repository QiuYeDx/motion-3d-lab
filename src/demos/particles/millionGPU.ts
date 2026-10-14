import * as THREE from 'three'
import { UNIFORM_FLOATS, WGSL_COMPOSITE, WGSL_DRAW, WGSL_SIM } from './millionShaders'
import { stepRig, wellPoint, type Rig } from './millionRig'

export type Engine = { destroy: () => void }

type Opts = {
  canvas: HTMLCanvasElement
  count: number
  rig: Rig
  onStats: (fps: number) => void
  /** device lost for a reason other than our own destroy() */
  onLost: (msg: string) => void
}

const HDR_FORMAT: GPUTextureFormat = 'rgba16float'
// WebGPU usage flags (lib.dom has the types but not the global constant objects)
const BUF = { STORAGE: 0x80, UNIFORM: 0x40, COPY_DST: 0x8 }
const TEX = { TEXTURE_BINDING: 0x4, RENDER_ATTACHMENT: 0x10 }

async function checkModule(m: GPUShaderModule, name: string) {
  const info = await m.getCompilationInfo()
  const errs = info.messages.filter((x) => x.type === 'error')
  if (errs.length) throw new Error(`${name}: ${errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('\n')}`)
}

/** Raw WebGPU: storage buffer of N particles, one compute pass + one instanced quad pass (HDR, additive) + tonemap per frame. */
export async function startWebGPU({ canvas, count, rig, onStats, onLost }: Opts): Promise<Engine> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new Error('navigator.gpu missing')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('no adapter')
  const bytes = count * 32
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, Math.max(bytes, 128 << 20)),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, Math.max(bytes, 256 << 20)),
    },
  })
  let destroyed = false
  device.lost.then((info) => {
    if (!destroyed) onLost(info.message || info.reason || 'lost')
  })

  const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!ctx) {
    device.destroy()
    throw new Error('no webgpu context')
  }
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'opaque' })
  // StrictMode / fast remounts can overlap two engines on one canvas: only the latest owner unconfigures
  const token = {}
  const owned = canvas as HTMLCanvasElement & { __milOwner?: object }
  owned.__milOwner = token
  const release = () => {
    if (owned.__milOwner !== token) return
    owned.__milOwner = undefined
    try {
      ctx.unconfigure()
    } catch {
      /* already gone */
    }
  }

  try {
    /* ---------------- buffers */
    const particles = device.createBuffer({ size: bytes, usage: BUF.STORAGE, mappedAtCreation: true })
    {
      const a = new Float32Array(particles.getMappedRange())
      for (let i = 0; i < count; i++) {
        const o = i * 8
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        const r = 3.4 * Math.pow(Math.random(), 0.4)
        a[o] = Math.sin(ph) * Math.cos(th) * r
        a[o + 1] = Math.cos(ph) * r * 0.8
        a[o + 2] = Math.sin(ph) * Math.sin(th) * r
        const life = 6 + Math.random() * 8
        a[o + 3] = Math.random() * life // age, desynchronised
        a[o + 7] = life
      }
      particles.unmap()
    }
    const uniform = device.createBuffer({ size: UNIFORM_FLOATS * 4, usage: BUF.UNIFORM | BUF.COPY_DST })
    const u = new Float32Array(UNIFORM_FLOATS)

    /* ---------------- pipelines */
    const simMod = device.createShaderModule({ code: WGSL_SIM, label: 'sim' })
    const drawMod = device.createShaderModule({ code: WGSL_DRAW, label: 'draw' })
    const compMod = device.createShaderModule({ code: WGSL_COMPOSITE, label: 'composite' })
    await Promise.all([checkModule(simMod, 'sim'), checkModule(drawMod, 'draw'), checkModule(compMod, 'composite')])

    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
    const [simPipe, drawPipe, compPipe] = await Promise.all([
      device.createComputePipelineAsync({ layout: 'auto', compute: { module: simMod, entryPoint: 'main' } }),
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: drawMod, entryPoint: 'vs' },
        fragment: { module: drawMod, entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: { color: add, alpha: add } }] },
        primitive: { topology: 'triangle-list' },
      }),
      device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: { module: compMod, entryPoint: 'vs' },
        fragment: { module: compMod, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      }),
    ])
    const simBG = device.createBindGroup({
      layout: simPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: particles } },
      ],
    })
    const drawBG = device.createBindGroup({
      layout: drawPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: particles } },
      ],
    })

    /* ---------------- size-dependent targets */
    let hdr: GPUTexture | null = null
    let compBG: GPUBindGroup | null = null
    let W = 0
    let H = 0
    let dpr = 1
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (w === W && h === H && hdr) return
      W = w
      H = h
      canvas.width = w
      canvas.height = h
      hdr?.destroy()
      hdr = device.createTexture({ size: [w, h], format: HDR_FORMAT, usage: TEX.RENDER_ATTACHMENT | TEX.TEXTURE_BINDING })
      compBG = device.createBindGroup({
        layout: compPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: hdr.createView() },
        ],
      })
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    /* ---------------- frame */
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    cam.coordinateSystem = THREE.WebGPUCoordinateSystem
    const vp = new THREE.Matrix4()
    const well = new THREE.Vector3()
    const axis = new THREE.Vector3()
    let raf = 0
    let last = performance.now()
    let time = 0
    let frame = 0
    let fpsAcc = 0
    let fpsN = 0
    let fpsT = 0
    let hidden = false
    const onVis = () => {
      hidden = document.hidden
      last = performance.now()
    }
    document.addEventListener('visibilitychange', onVis)
    const groups = Math.ceil(count / 256)

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (hidden || !hdr || !compBG) return
      const now = performance.now()
      const raw = (now - last) / 1000
      last = now
      const dt = Math.min(raw, 1 / 30)
      time += dt
      frame++
      fpsAcc += raw
      fpsN++
      if (now - fpsT > 500) {
        onStats(fpsN / Math.max(fpsAcc, 1e-3))
        fpsAcc = 0
        fpsN = 0
        fpsT = now
      }

      stepRig(rig, cam, canvas.clientWidth, canvas.clientHeight, dt)
      wellPoint(rig, cam, well, axis)
      vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)

      const w = rig.weights()
      u.set(w, 0)
      u[4] = well.x
      u[5] = well.y
      u[6] = well.z
      u[7] = rig.well * (w[0] * 1.8 + w[1] * 1.5 + w[2] * 1.2 + w[3]) // attractors move fast, the well must out-pull them
      u[8] = axis.x
      u[9] = axis.y
      u[10] = axis.z
      u[12] = dt
      u[13] = time
      u[14] = count
      u[15] = frame
      u.set(vp.elements, 16)
      u[32] = W
      u[33] = H
      u[34] = 1.15 * dpr // point radius (px) at the reference depth
      u[35] = 0.05 // per-particle energy
      u[36] = 1.25 // exposure
      u[37] = w[0] * 6.4 + w[1] * 2.1 + w[2] * 3.2 + w[3] * 2.4 // speed that maps to the hottest colour, per field
      u[38] = 11.4 // reference depth
      u[39] = dpr
      device.queue.writeBuffer(uniform, 0, u)

      const enc = device.createCommandEncoder()
      const cp = enc.beginComputePass()
      cp.setPipeline(simPipe)
      cp.setBindGroup(0, simBG)
      cp.dispatchWorkgroups(groups)
      cp.end()

      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: hdr.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      })
      rp.setPipeline(drawPipe)
      rp.setBindGroup(0, drawBG)
      rp.draw(6, count)
      rp.end()

      const op = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      })
      op.setPipeline(compPipe)
      op.setBindGroup(0, compBG)
      op.draw(3)
      op.end()
      device.queue.submit([enc.finish()])
    }
    raf = requestAnimationFrame(tick)

    return {
      destroy() {
        destroyed = true
        cancelAnimationFrame(raf)
        ro.disconnect()
        document.removeEventListener('visibilitychange', onVis)
        particles.destroy()
        uniform.destroy()
        hdr?.destroy()
        release()
        device.destroy()
      },
    }
  } catch (e) {
    destroyed = true
    release()
    device.destroy()
    throw e
  }
}
