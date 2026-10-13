// Env: CDP_PORT (default 9333), PROFILE (dir name, default edge-cdp-profile), FORMAT, CLIP
// Usage: node --experimental-websocket shot.mjs <outDir> <width>x<height> <waitMs> name=url[|asyncIIFE][||CLICKS:x,y@ms;x1,y1>x2,y2@ms] ...
// Launches Edge (headful, off-screen so the real GPU/WebGPU is used), screenshots each URL via CDP.
import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, basename } from 'node:path'

const [outDir, size, waitMs, ...jobs] = process.argv.slice(2)
const [W, H] = size.split('x').map(Number)
mkdirSync(outDir, { recursive: true })

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const port = Number(process.env.CDP_PORT) || 9333
const profile = join(process.cwd(), process.env.PROFILE || 'edge-cdp-profile')
// fresh profile every run: a reused one serves stale Vite modules from its HTTP cache
rmSync(profile, { recursive: true, force: true })
const proc = spawn(edge, [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--enable-unsafe-webgpu',
  '--no-first-run',
  '--window-position=-2400,0',
  `--window-size=${W + 16},${H + 120}`,
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-extensions',
  'about:blank',
], { stdio: 'ignore' })


const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let targets
for (let i = 0; i < 150; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await sleep(200) }
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', m.params.exceptionDetails.exception?.description?.slice(0, 300))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') console.log('CONSOLE.ERROR', JSON.stringify(m.params.args.map((a) => a.value ?? a.description)).slice(0, 300))
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await send('Page.enable')
await send('Runtime.enable')
for (const job of jobs) {
  const eq = job.indexOf('=')
  const name = job.slice(0, eq)
  let url = job.slice(eq + 1)
  let script = ''
  // real mouse input (R3F ignores synthetic dispatchEvent coords): "...||CLICKS:x,y@waitMs;x1,y1>x2,y2@waitMs"
  let clicks = ''
  const ci = url.indexOf('||CLICKS:')
  if (ci >= 0) { clicks = url.slice(ci + 9); url = url.slice(0, ci) }
  const bar = url.indexOf('|')
  if (bar > 0) { script = url.slice(bar + 1); url = url.slice(0, bar) }
  await send('Page.navigate', { url })
  await sleep(1500)
  if (script) { const r = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true }); if (r.result?.result?.value !== undefined) console.log('EVAL', name, JSON.stringify(r.result.result.value)) }
  for (const step of clicks ? clicks.split(';') : []) {
    const [pos, wait] = step.split('@')
    const [from, to] = pos.split('>')
    const [x, y] = from.split(',').map(Number)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    if (to) {
      const [x2, y2] = to.split(',').map(Number)
      for (let k = 1; k <= 12; k++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + ((x2 - x) * k) / 12, y: y + ((y2 - y) * k) / 12, button: 'left', buttons: 1 })
        await sleep(16)
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 })
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    }
    await sleep(Number(wait) || 300)
  }
  await sleep(Number(waitMs))
  try {
    const fmt = process.env.FORMAT || 'png'
    const params = { format: fmt, ...(fmt !== 'png' ? { quality: 84 } : {}) }
    if (process.env.CLIP) {
      const r = await send('Runtime.evaluate', { expression: `(()=>{const r=document.querySelector(${JSON.stringify(process.env.CLIP)}).getBoundingClientRect();return JSON.stringify({x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height})})()`, returnByValue: true })
      const b = JSON.parse(r.result.result.value)
      params.clip = { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 }
    }
    const shot = await send('Page.captureScreenshot', params)
    writeFileSync(join(outDir, `${name}.${fmt}`), Buffer.from(shot.result.data, 'base64'))
    console.log('saved', name)
  } catch (e) {
    console.log('FAILED', name, e.message)
  }
}
ws.close()
proc.kill()
spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*' + $env:SHOT_PROFILE + '*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"], { env: { ...process.env, SHOT_PROFILE: basename(profile) } })
process.exit(0)
