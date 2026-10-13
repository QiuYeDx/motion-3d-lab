import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { animate, motion, useMotionValue, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { IsoRig, POSTER } from '../../lib/iso'
import { Seg } from '../../components/Seg'
import { hexToRgb } from '../shader/glsl'

/* ------------------------------------------------------------------ layout (world units) */
const POOL = { x0: -4.4, z0: -3.0, W: 6.2, L: 5.8 }
const X1 = POOL.x0 + POOL.W
const Z1 = POOL.z0 + POOL.L
const DECK = { x0: -6, x1: 6, z0: -4.6, z1: 4.4 }
const WATER_Y = -0.2
const DEPTH = 1.55
const SIM = 256

type Mode = 'calm' | 'rain' | 'wind'
type V3 = [number, number, number]

const C = {
  deck: '#f6e9d8',
  deckSide: '#efd2bd',
  coping: '#fffaf2',
  coping2: '#f4e8d6',
  liner: '#d9f2f0',
  rock: ['#eab3a0', '#d48f92', '#a7708c', '#7c587a'],
  white: '#ffffff',
  coral: '#ff8f7d',
  coralDeep: '#e9705f',
  sun: '#ffd27a',
  teal: '#6cc6c9',
  pot: '#d9846c',
  leaf: '#76c39b',
  leaf2: '#9ad6ae',
  trunk: '#a8786a',
  chrome: '#dfe7ec',
}

/* ------------------------------------------------------------------ simulation shaders */
const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const UPDATE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDelta;
uniform float uDamp;
uniform float uWind;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 info = texture2D(uTex, vUv);
  vec2 dx = vec2(uDelta.x, 0.0);
  vec2 dy = vec2(0.0, uDelta.y);
  float avg = (texture2D(uTex, vUv - dx).r + texture2D(uTex, vUv + dx).r +
               texture2D(uTex, vUv - dy).r + texture2D(uTex, vUv + dy).r) * 0.25;
  info.g += (avg - info.r) * 2.0;
  info.g *= uDamp;
  info.r += info.g;
  info.r *= 0.9992;
  // wave maker along the deep (-x) wall: an oblique travelling swell
  if (uWind > 0.0) {
    float edge = 1.0 - smoothstep(0.0, 3.0 * uDelta.x, vUv.x);
    float swell = sin(uTime * 8.0 - vUv.y * 9.0) * 0.65 + sin(uTime * 11.0 + vUv.y * 5.0) * 0.35;
    info.r = mix(info.r, swell * uWind, edge);
  }
  gl_FragColor = info;
}
`
const DROP_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec4 uDrops[8];
uniform int uCount;
uniform vec2 uAspect;
varying vec2 vUv;
void main() {
  vec4 info = texture2D(uTex, vUv);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 d = uDrops[i];
    float r = length((vUv - d.xy) * uAspect) / d.z;
    float k = max(0.0, 1.0 - r);
    k = 0.5 - cos(k * 3.14159265) * 0.5;
    info.r += k * d.w;
  }
  gl_FragColor = info;
}
`
const CLEAR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform float uKeep;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv) * uKeep; }
`

/* ------------------------------------------------------------------ water surface shader */
const v3 = (hex: string) => `vec3(${hexToRgb(hex).map((n) => n.toFixed(4)).join(',')})`

const WATER_VERT = /* glsl */ `
uniform sampler2D uH;
uniform float uHS;
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += texture2D(uH, uv).r * uHS;
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const WATER_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uH;
uniform vec2 uTexel;
uniform vec4 uPool;     // x0, z0, W, L
uniform float uWaterY;
uniform float uDepth;
uniform float uHS;
uniform float uNS;
uniform vec3 uView;     // direction the camera looks
uniform vec3 uSun;      // direction towards the glint sun
uniform float uTime;
uniform float uRain;
varying vec2 vUv;
varying vec3 vPos;

float H(vec2 uv) { return texture2D(uH, uv).r * uHS; }

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/* distance to the nearest voronoi edge → bright caustic web */
float voro(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(n + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return f2 - f1;
}
float caustic(vec2 p, float t) {
  float a = voro(p * 1.25, t * 0.8);
  float b = voro(p * 2.1 + 3.7, t * 1.1);
  float ca = clamp(1.0 - a / 0.2, 0.0, 1.0);
  float cb = clamp(1.0 - b / 0.14, 0.0, 1.0);
  return ca * ca * ca * 0.65 + cb * cb * 0.45;
}

/* ---- pool interior: shallow steps at the +x end, deep floor elsewhere */
const float STEP_W = 0.62;
float floorDepth(vec2 xz) {
  float fromEnd = (uPool.x + uPool.z) - xz.x;
  float k = floor(fromEnd / STEP_W);
  return k < 3.0 ? 0.3 * (k + 1.0) : uDepth;
}

vec3 tiles(vec2 q, float size, vec3 base, vec3 grout) {
  vec2 g = q / size;
  vec2 f = abs(fract(g) - 0.5);
  float e = smoothstep(0.42, 0.47, max(f.x, f.y));
  float n = hash1(floor(g));
  return mix(base * (0.965 + 0.06 * n), grout, e * 0.85);
}

vec3 floorColor(vec3 p, out float isStep) {
  vec3 col = tiles(p.xz, 0.42, ${v3('#c5eeee')}, ${v3('#f4fffe')});
  float fromEnd = (uPool.x + uPool.z) - p.x;
  float k = floor(fromEnd / STEP_W);
  isStep = k < 3.0 ? 1.0 : 0.0;
  if (k < 3.0) {
    // contrasting nosing on each step edge
    float nose = fract(fromEnd / STEP_W);
    col = tiles(p.xz, 0.42, ${v3('#e2faf8')}, ${v3('#ffffff')});
    col = mix(col, ${v3('#2f93ad')}, smoothstep(0.84, 0.87, nose));
  } else {
    // lane lines with T ends
    float lz = (p.z - uPool.y) / uPool.w;
    float lx = p.x - uPool.x;
    float lane = 0.0;
    for (int i = 1; i <= 2; i++) {
      float c = float(i) / 3.0;
      float d = abs(lz - c) * uPool.w;
      float aa = fwidth(d) + 0.004;
      lane = max(lane, (1.0 - smoothstep(0.09 - aa, 0.09 + aa, d)) * step(0.7, lx) * step(lx, uPool.z - 3.0 * STEP_W - 0.45));
      float tEnd = (1.0 - smoothstep(0.09 - aa, 0.09 + aa, abs(lx - 0.8))) * (1.0 - smoothstep(0.32, 0.34, d));
      lane = max(lane, tEnd);
    }
    col = mix(col, ${v3('#3c9fb5')}, lane);
  }
  return col;
}

vec3 wallColor(vec2 q, float y) {
  vec3 col = tiles(vec2(q.x, y), 0.26, ${v3('#d4f1ef')}, ${v3('#f6fffe')});
  // mosaic band just under the water line
  float band = smoothstep(-0.36, -0.34, y - uWaterY) * (1.0 - smoothstep(-0.06, -0.04, y - uWaterY));
  return mix(col, tiles(vec2(q.x, y), 0.11, ${v3('#4fb2c6')}, ${v3('#8fd3de')}), band);
}

void main() {
  vec2 e = uTexel;
  float hl = H(vUv - vec2(e.x, 0.0));
  float hr = H(vUv + vec2(e.x, 0.0));
  float hd = H(vUv - vec2(0.0, e.y));
  float hu = H(vUv + vec2(0.0, e.y));
  float h0 = H(vUv);
  float dhx = (hr - hl) / (2.0 * e.x * uPool.z);
  float dhv = (hu - hd) / (2.0 * e.y * uPool.w); // v grows toward -z
  vec3 n = normalize(vec3(-dhx * uNS, 1.0, dhv * uNS));

  vec3 v = normalize(uView);
  vec3 r = refract(v, n, 1.0 / 1.333);
  vec3 p = vec3(vPos.x, uWaterY, vPos.z);

  // analytic wall exit, then march the stepped floor
  float tX = r.x > 0.0 ? (uPool.x + uPool.z - p.x) / r.x : (uPool.x - p.x) / r.x;
  float tZ = r.z > 0.0 ? (uPool.y + uPool.w - p.z) / r.z : (uPool.y - p.z) / r.z;
  float tW = min(tX, tZ);
  float tMax = min(tW, uDepth / max(-r.y, 0.05));
  float t = tMax;
  float hitFloor = 0.0;
  float prev = 0.0;
  for (int i = 1; i <= 28; i++) {
    float tt = tMax * float(i) / 28.0;
    vec3 q = p + r * tt;
    if (uWaterY - q.y >= floorDepth(q.xz)) {
      float a = prev;
      float b = tt;
      for (int j = 0; j < 5; j++) {
        float m = 0.5 * (a + b);
        vec3 qm = p + r * m;
        if (uWaterY - qm.y >= floorDepth(qm.xz)) b = m; else a = m;
      }
      t = b;
      hitFloor = 1.0;
      break;
    }
    prev = tt;
  }
  vec3 hit = p + r * t;

  vec3 base;
  float isStep = 0.0;
  float wallK = 0.0;
  if (hitFloor > 0.5) {
    base = floorColor(hit, isStep);
  } else if (tX < tZ) {
    base = wallColor(vec2(hit.z, 0.0), hit.y);
    wallK = 1.0;
  } else {
    base = wallColor(vec2(hit.x, 0.0), hit.y);
    wallK = 1.0;
  }

  // caustics: an ambient web, warped by the surface normal, plus light focused under ripple crests
  vec2 huv = vec2((hit.x - uPool.x) / uPool.z, 1.0 - (hit.z - uPool.y) / uPool.w);
  float lap = H(huv + vec2(e.x, 0.0)) + H(huv - vec2(e.x, 0.0)) + H(huv + vec2(0.0, e.y)) + H(huv - vec2(0.0, e.y)) - 4.0 * H(huv);
  float focus = clamp(-lap * 260.0, 0.0, 1.2);
  float cst = caustic(hit.xz + n.xz * 1.4, uTime) * mix(1.0, 0.45, wallK) + focus;
  base *= 0.8 + cst * 0.5;

  // absorption along the refracted path
  float path = t;
  base *= mix(vec3(1.0), ${v3('#7fd8de')}, clamp(path * 0.8, 0.0, 1.0));
  vec3 col = mix(base, ${v3('#1f95b0')}, 1.0 - exp(-path * 0.5));

  // reflection of a pastel sky + fresnel
  vec3 R = reflect(v, n);
  vec3 sky = mix(${v3('#fff3ea')}, ${v3('#bfe9ee')}, clamp(R.y * 1.2, 0.0, 1.0));
  float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, -v), 0.0), 5.0);
  col = mix(col, sky, clamp(fr * 2.4, 0.0, 0.7));

  // sun glints only where ripples tilt the surface toward the sun
  float sd = max(dot(R, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.97, 0.9) * (pow(sd, 160.0) * 0.9 + pow(sd, 1400.0) * 2.4);

  // soft contact shade against the walls + a light rim where water meets tile
  float ed = min(min(vPos.x - uPool.x, uPool.x + uPool.z - vPos.x), min(vPos.z - uPool.y, uPool.y + uPool.w - vPos.z));
  col *= mix(0.84, 1.0, smoothstep(0.0, 0.5, ed));
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.05, ed)) * 0.35);
  // rain dims the sky reflection a touch
  col = mix(col, col * vec3(0.93, 0.96, 0.98), uRain * 0.6);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

/* ------------------------------------------------------------------ simulation hook */
type Drop = [number, number, number, number] // u, v, radius(uv), strength
type SimApi = {
  drops: Drop[]
  tex: { current: THREE.Texture | null }
  clear: () => void
}

function useWaterSim(mode: React.RefObject<Mode>, wind: React.RefObject<number>) {
  const gl = useThree((s) => s.gl)
  const sim = useMemo(() => {
    const opts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }
    const a = new THREE.WebGLRenderTarget(SIM, SIM, opts)
    const b = new THREE.WebGLRenderTarget(SIM, SIM, opts)
    const scene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
    quad.frustumCulled = false
    scene.add(quad)
    const update = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: UPDATE_FRAG,
      uniforms: {
        uTex: { value: null },
        uDelta: { value: new THREE.Vector2(1 / SIM, 1 / SIM) },
        uDamp: { value: 0.995 },
        uWind: { value: 0 },
        uTime: { value: 0 },
      },
    })
    const drop = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: DROP_FRAG,
      uniforms: {
        uTex: { value: null },
        uDrops: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
        uCount: { value: 0 },
        uAspect: { value: new THREE.Vector2(POOL.W / Math.max(POOL.W, POOL.L), POOL.L / Math.max(POOL.W, POOL.L)) },
      },
    })
    const fade = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: CLEAR_FRAG,
      uniforms: { uTex: { value: null }, uKeep: { value: 0 } },
    })
    return { rt: [a, b], read: 0, scene, cam, quad, update, drop, fade, t: 0, acc: 0, clearReq: 0 }
  }, [])
  useEffect(
    () => () => {
      sim.rt.forEach((r) => r.dispose())
      sim.update.dispose()
      sim.drop.dispose()
      sim.fade.dispose()
      sim.quad.geometry.dispose()
    },
    [sim],
  )

  const api = useMemo<SimApi>(
    () => ({
      drops: [],
      tex: { current: sim.rt[0].texture },
      clear: () => void (sim.clearReq = 1),
    }),
    [sim],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    sim.t += dt
    const pass = (mat: THREE.ShaderMaterial) => {
      mat.uniforms.uTex.value = sim.rt[sim.read].texture
      sim.quad.material = mat
      gl.setRenderTarget(sim.rt[1 - sim.read])
      gl.render(sim.scene, sim.cam)
      sim.read = 1 - sim.read
    }
    const prevTarget = gl.getRenderTarget()
    if (sim.clearReq) {
      sim.clearReq = 0
      sim.fade.uniforms.uKeep.value = 0
      pass(sim.fade)
    }
    // flush queued drops, 8 per pass
    let guard = 0
    while (api.drops.length && guard++ < 4) {
      const n = Math.min(8, api.drops.length)
      const arr = sim.drop.uniforms.uDrops.value as THREE.Vector4[]
      for (let i = 0; i < n; i++) {
        const d = api.drops[i]
        arr[i].set(d[0], d[1], d[2], d[3])
      }
      api.drops.splice(0, n)
      sim.drop.uniforms.uCount.value = n
      pass(sim.drop)
    }
    api.drops.length = 0
    const m = mode.current
    sim.update.uniforms.uDamp.value = m === 'rain' ? 0.985 : m === 'wind' ? 0.988 : 0.995
    sim.update.uniforms.uWind.value = wind.current ?? 0
    // wave-equation steps at a fixed 60 Hz, independent of the display refresh rate
    sim.acc = Math.min(sim.acc + dt * 60, 3)
    while (sim.acc >= 1) {
      sim.acc -= 1
      sim.update.uniforms.uTime.value = sim.t - sim.acc / 60
      pass(sim.update)
    }
    gl.setRenderTarget(prevTarget)
    api.tex.current = sim.rt[sim.read].texture
  })
  return api
}

/* ------------------------------------------------------------------ water mesh */
function Water({ sim, rain, burst }: { sim: SimApi; rain: React.RefObject<number>; burst: React.RefObject<Burst | null> }) {
  const camera = useThree((s) => s.camera)
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: WATER_VERT,
        fragmentShader: WATER_FRAG,
        uniforms: {
          uH: { value: null },
          uTexel: { value: new THREE.Vector2(1 / SIM, 1 / SIM) },
          uPool: { value: new THREE.Vector4(POOL.x0, POOL.z0, POOL.W, POOL.L) },
          uWaterY: { value: WATER_Y },
          uDepth: { value: DEPTH },
          uHS: { value: 0.5 },
          uNS: { value: 9.0 },
          uView: { value: new THREE.Vector3(-1, -1, -1).normalize() },
          uSun: { value: new THREE.Vector3(-0.35, 1.0, -0.95).normalize() },
          uTime: { value: 0 },
          uRain: { value: 0 },
        },
      }),
    [],
  )
  useEffect(() => () => mat.dispose(), [mat])
  const dir = useMemo(() => new THREE.Vector3(), [])
  useFrame((st) => {
    mat.uniforms.uH.value = sim.tex.current
    mat.uniforms.uTime.value = st.clock.elapsedTime
    mat.uniforms.uRain.value = rain.current ?? 0
    camera.getWorldDirection(dir)
    ;(mat.uniforms.uView.value as THREE.Vector3).copy(dir)
  })

  const drag = useRef<{ down: boolean; last: THREE.Vector2 | null; t: number }>({ down: false, last: null, t: 0 })
  useEffect(() => {
    const up = () => {
      drag.current.down = false
      drag.current.last = null
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])
  const strokeTo = (uv: THREE.Vector2, r: number, s: number) => {
    const d = drag.current
    if (d.last) {
      const dist = d.last.distanceTo(uv)
      const n = Math.min(6, Math.floor(dist / 0.018))
      for (let i = 1; i <= n; i++) {
        const k = i / (n + 1)
        sim.drops.push([d.last.x + (uv.x - d.last.x) * k, d.last.y + (uv.y - d.last.y) * k, r, s])
      }
    }
    sim.drops.push([uv.x, uv.y, r, s])
    d.last = uv.clone()
  }
  return (
    <mesh
      position={[POOL.x0 + POOL.W / 2, WATER_Y, POOL.z0 + POOL.L / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={mat}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        if (!e.uv) return
        drag.current.down = true
        drag.current.last = null
        sim.drops.push([e.uv.x, e.uv.y, 0.04, 0.085])
        burst.current?.(e.point.x, e.point.z, 9, 1.9)
        drag.current.last = e.uv.clone()
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!e.uv) return
        const d = drag.current
        if (d.down) strokeTo(e.uv, 0.028, 0.026)
        else {
          // a faint wake follows the cursor even without pressing
          const now = performance.now()
          if (now - d.t > 40) {
            d.t = now
            sim.drops.push([e.uv.x, e.uv.y, 0.02, 0.0035])
          }
        }
      }}
      onPointerEnter={() => void (document.body.style.cursor = 'crosshair')}
      onPointerLeave={() => void (document.body.style.cursor = '')}
    >
      <planeGeometry args={[POOL.W, POOL.L, 160, 150]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ props */
function Block({ p, s, c, cast = true, receive = true }: { p: V3; s: V3; c: string; cast?: boolean; receive?: boolean }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow={receive}>
      <boxGeometry args={s} />
      <meshLambertMaterial color={c} />
    </mesh>
  )
}

function Deck() {
  // deck slab with the pool cut out (four boxes), liner strip above the water line
  const top = -0.6
  const h = -top
  const xl = POOL.x0
  const xr = X1
  return (
    <group>
      <Block p={[(DECK.x0 + xl) / 2, top / 2, (DECK.z0 + DECK.z1) / 2]} s={[xl - DECK.x0, h, DECK.z1 - DECK.z0]} c={C.deck} />
      <Block p={[(xr + DECK.x1) / 2, top / 2, (DECK.z0 + DECK.z1) / 2]} s={[DECK.x1 - xr, h, DECK.z1 - DECK.z0]} c={C.deck} />
      <Block p={[(xl + xr) / 2, top / 2, (DECK.z0 + POOL.z0) / 2]} s={[POOL.W, h, POOL.z0 - DECK.z0]} c={C.deck} />
      <Block p={[(xl + xr) / 2, top / 2, (Z1 + DECK.z1) / 2]} s={[POOL.W, h, DECK.z1 - Z1]} c={C.deck} />
      {/* liner */}
      <Block p={[xl + 0.02, top / 2, POOL.z0 + POOL.L / 2]} s={[0.04, h, POOL.L]} c={C.liner} cast={false} />
      <Block p={[xr - 0.02, top / 2, POOL.z0 + POOL.L / 2]} s={[0.04, h, POOL.L]} c={C.liner} cast={false} />
      <Block p={[xl + POOL.W / 2, top / 2, POOL.z0 + 0.02]} s={[POOL.W, h, 0.04]} c={C.liner} cast={false} />
      <Block p={[xl + POOL.W / 2, top / 2, Z1 - 0.02]} s={[POOL.W, h, 0.04]} c={C.liner} cast={false} />
      {/* body + floating-rock layers */}
      <Block p={[0, -1.1, (DECK.z0 + DECK.z1) / 2]} s={[DECK.x1 - DECK.x0, 1.0, DECK.z1 - DECK.z0]} c={C.deckSide} />
      {[0, 1, 2, 3].map((i) => {
        const inset = 0.62 * (i + 1) + (i > 1 ? 0.5 * (i - 1) : 0)
        return (
          <Block
            key={i}
            p={[0, -2.1 - i * 0.9, (DECK.z0 + DECK.z1) / 2]}
            s={[DECK.x1 - DECK.x0 - inset * 2, 0.9, DECK.z1 - DECK.z0 - inset * 2]}
            c={C.rock[i]}
          />
        )
      })}
    </group>
  )
}

function Coping() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const tiles = useMemo(() => {
    const T = 0.52
    const out: { p: V3; s: V3 }[] = []
    const over = 0.08
    const nx = Math.round((POOL.W + 2 * T) / T)
    const xs = POOL.x0 - T
    const wx = (POOL.W + 2 * T) / nx
    for (let i = 0; i < nx; i++) {
      const x = xs + wx * (i + 0.5)
      out.push({ p: [x, 0.05, POOL.z0 - T / 2 + over / 2], s: [wx - 0.035, 0.1, T + over] })
      out.push({ p: [x, 0.05, Z1 + T / 2 - over / 2], s: [wx - 0.035, 0.1, T + over] })
    }
    const nz = Math.round(POOL.L / T)
    const wz = POOL.L / nz
    for (let j = 0; j < nz; j++) {
      const z = POOL.z0 + wz * (j + 0.5)
      out.push({ p: [POOL.x0 - T / 2 + over / 2, 0.05, z], s: [T + over, 0.1, wz - 0.035] })
      out.push({ p: [X1 + T / 2 - over / 2, 0.05, z], s: [T + over, 0.1, wz - 0.035] })
    }
    return out
  }, [])
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    const a = new THREE.Color(C.coping)
    const b = new THREE.Color(C.coping2)
    tiles.forEach((t, i) => {
      o.position.set(...t.p)
      o.scale.set(...t.s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
      m.setColorAt(i, (i >> 1) % 2 ? a : b)
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [tiles])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshLambertMaterial color="#ffffff" />
    </instancedMesh>
  )
}

/** striped cone (umbrella canopy) via per-face vertex colours */
function useStripedCone(r: number, h: number, seg: number, a: string, b: string) {
  return useMemo(() => {
    const g = new THREE.ConeGeometry(r, h, seg, 1, true).toNonIndexed()
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    const ca = new THREE.Color(a)
    const cb = new THREE.Color(b)
    for (let f = 0; f < n / 3; f++) {
      const c = Math.floor(f / 2) % 2 ? ca : cb
      for (let k = 0; k < 3; k++) c.toArray(col, (f * 3 + k) * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [r, h, seg, a, b])
}

function Umbrella({ p, wind }: { p: V3; wind: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const cone = useStripedCone(1.15, 0.5, 12, C.coral, '#fff6ec')
  useFrame((s) => {
    if (!g.current) return
    const w = Math.abs(wind.current ?? 0) * 6
    const t = s.clock.elapsedTime
    g.current.rotation.z = Math.sin(t * 2.3) * 0.015 * (0.4 + w) + 0.05 * w
    g.current.rotation.x = Math.sin(t * 1.7 + 1) * 0.012 * (0.4 + w)
  })
  return (
    <group position={p}>
      <Block p={[0, 0.06, 0]} s={[0.42, 0.12, 0.42]} c={C.teal} />
      <group ref={g}>
        <mesh position={[0, 1.15, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 2.2, 8]} />
          <meshLambertMaterial color={C.white} />
        </mesh>
        <mesh position={[0, 2.25, 0]} geometry={cone} castShadow>
          <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 2.55, 0]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshLambertMaterial color={C.coralDeep} />
        </mesh>
      </group>
    </group>
  )
}

function Lounger({ p, ry = 0 }: { p: V3; ry?: number }) {
  return (
    <group position={p} rotation={[0, ry, 0]}>
      {[-0.27, 0.27].flatMap((x) => [-0.75, 0.75].map((z) => <Block key={`${x}${z}`} p={[x, 0.14, z]} s={[0.07, 0.28, 0.07]} c={C.white} />))}
      <Block p={[0, 0.31, 0.15]} s={[0.66, 0.08, 1.5]} c={C.white} />
      <Block p={[0, 0.39, 0.15]} s={[0.58, 0.08, 1.42]} c={C.coral} />
      <group position={[0, 0.32, -0.62]} rotation={[0.62, 0, 0]}>
        <Block p={[0, 0, -0.36]} s={[0.66, 0.08, 0.76]} c={C.white} />
        <Block p={[0, 0.08, -0.36]} s={[0.58, 0.08, 0.7]} c={C.coral} />
      </group>
      {/* folded towel */}
      <Block p={[0, 0.47, 0.6]} s={[0.5, 0.06, 0.34]} c={C.sun} />
    </group>
  )
}

function Plant({ p, s = 1, wind }: { p: V3; s?: number; wind: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const leaves = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 + 0.3
        return { a, tilt: 0.75 + (i % 3) * 0.18, len: 0.62 + (i % 2) * 0.16 }
      }),
    [],
  )
  useFrame((st) => {
    if (!g.current) return
    const w = Math.abs(wind.current ?? 0) * 6
    g.current.rotation.z = Math.sin(st.clock.elapsedTime * 2.1 + p[0]) * 0.03 * (0.3 + w) + 0.08 * w
  })
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.26, 0.52, 18]} />
        <meshLambertMaterial color={C.pot} />
      </mesh>
      <mesh position={[0, 0.53, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.03, 18]} />
        <meshLambertMaterial color="#8a6a58" />
      </mesh>
      <group ref={g} position={[0, 0.5, 0]}>
        {leaves.map((l, i) => (
          <group key={i} rotation={[0, l.a, 0]}>
            <group rotation={[0, 0, l.tilt]}>
              <mesh position={[0, l.len / 2 + 0.05, 0]} scale={[0.17, l.len / 2, 0.07]} castShadow>
                <sphereGeometry args={[1, 12, 8]} />
                <meshLambertMaterial color={i % 2 ? C.leaf : C.leaf2} />
              </mesh>
            </group>
          </group>
        ))}
        <mesh position={[0, 0.5, 0]} scale={[0.14, 0.5, 0.06]} castShadow>
          <sphereGeometry args={[1, 12, 8]} />
          <meshLambertMaterial color={C.leaf2} />
        </mesh>
      </group>
    </group>
  )
}

function ConeTree({ p, h = 1 }: { p: V3; h?: number }) {
  return (
    <group position={p}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.3, 6]} />
        <meshLambertMaterial color={C.trunk} />
      </mesh>
      <mesh position={[0, 0.3 + 0.55 * h, 0]} castShadow>
        <coneGeometry args={[0.36 * h, 1.1 * h, 5]} />
        <meshLambertMaterial color={C.leaf} flatShading />
      </mesh>
    </group>
  )
}

function Ladder({ x }: { x: number }) {
  const zIn = POOL.z0 + 0.16
  const zOut = POOL.z0 - 0.4
  const zc = (zIn + zOut) / 2
  const R = (zIn - zOut) / 2
  return (
    <group>
      {[x - 0.3, x + 0.3].map((xx) => (
        <group key={xx}>
          <mesh position={[xx, 0.42, zc]} rotation={[0, Math.PI / 2, 0]} castShadow>
            <torusGeometry args={[R, 0.035, 8, 20, Math.PI]} />
            <meshLambertMaterial color={C.chrome} />
          </mesh>
          <mesh position={[xx, 0.42 - 0.5, zIn]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 1.0, 8]} />
            <meshLambertMaterial color={C.chrome} />
          </mesh>
          <mesh position={[xx, 0.22, zOut]}>
            <cylinderGeometry args={[0.035, 0.035, 0.44, 8]} />
            <meshLambertMaterial color={C.chrome} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

type Burst = (x: number, z: number, n: number, power: number) => void
type DiveCtl = { at: number }
const BOARD_X = DECK.x0 + 1.05
const BOARD_Z = 0.1
const TIP = 2.2
const ENTRY: V3 = [-1.45, WATER_Y, BOARD_Z]

/** springboard + a little swimmer who bounces, flips in and pops back up on the board */
function DivingBoard({ flex, ctl, sim, burst }: { flex: MotionValue<number>; ctl: DiveCtl; sim: SimApi; burst: React.RefObject<Burst | null> }) {
  const board = useRef<THREE.Group>(null)
  const diver = useRef<THREE.Group>(null)
  const st = useMemo(() => ({ splashed: -1 }), [])
  useFrame(() => {
    const a = flex.get() * 0.13
    if (board.current) board.current.rotation.z = a
    const g = diver.current
    if (!g) return
    const tau = ctl.at < 0 ? 99 : (performance.now() - ctl.at) / 1000
    const tipX = BOARD_X + Math.cos(a) * TIP
    const tipY = 0.48 + Math.sin(a) * TIP
    if (tau < 0.3) {
      g.visible = true
      g.position.set(tipX, tipY, BOARD_Z)
      g.rotation.set(0, 0, 0)
      g.scale.set(1, 1 - 0.18 * Math.max(0, -flex.get()), 1)
    } else if (tau < 0.95) {
      const k = (tau - 0.3) / 0.65
      g.visible = true
      g.position.set(THREE.MathUtils.lerp(tipX, ENTRY[0], k), THREE.MathUtils.lerp(tipY, ENTRY[1] - 0.3, k) + 5.2 * k * (1 - k) * 0.42, BOARD_Z)
      g.rotation.set(0, 0, -k * Math.PI * 1.05)
      g.scale.set(1, 1, 1)
    } else if (tau < 3.0) {
      g.visible = false
      if (st.splashed !== ctl.at) {
        st.splashed = ctl.at
        const u = (ENTRY[0] - POOL.x0) / POOL.W
        const v = 1 - (ENTRY[2] - POOL.z0) / POOL.L
        sim.drops.push([u, v, 0.065, 0.15], [u, v, 0.025, -0.06])
        burst.current?.(ENTRY[0], ENTRY[2], 34, 3.4)
      }
    } else {
      const k = Math.min(1, (tau - 3.0) / 0.45)
      const q = k - 1
      const sc = Math.max(0.001, 1 + 2.4 * q * q * q + 1.4 * q * q)
      g.visible = true
      g.position.set(tipX, tipY, BOARD_Z)
      g.rotation.set(0, 0, 0)
      g.scale.setScalar(sc)
    }
  })
  return (
    <group>
      <Block p={[DECK.x0 + 0.8, 0.2, BOARD_Z]} s={[0.7, 0.4, 0.7]} c={C.teal} />
      <group ref={board} position={[BOARD_X, 0.44, BOARD_Z]}>
        <Block p={[1.25, 0, 0]} s={[2.5, 0.08, 0.56]} c={C.white} />
        <Block p={[2.42, 0.045, 0]} s={[0.16, 0.012, 0.56]} c={C.coral} cast={false} />
      </group>
      <group ref={diver}>
        <mesh position={[0, 0.23, 0]} castShadow>
          <coneGeometry args={[0.13, 0.46, 16]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.52, 0]} castShadow>
          <sphereGeometry args={[0.095, 16, 12]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.545, 0]}>
          <sphereGeometry args={[0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshLambertMaterial color={C.coral} />
        </mesh>
      </group>
    </group>
  )
}

/** white droplets thrown up by a splash / a click */
const SPLASH_N = 64
function Splash({ api }: { api: React.RefObject<Burst | null> }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const st = useMemo(
    () => ({ p: new Float32Array(SPLASH_N * 3), v: new Float32Array(SPLASH_N * 3), life: new Float32Array(SPLASH_N), next: 0, m: new THREE.Matrix4() }),
    [],
  )
  useEffect(() => {
    api.current = (x, z, n, power) => {
      for (let k = 0; k < n; k++) {
        const i = st.next++ % SPLASH_N
        const a = Math.random() * Math.PI * 2
        const sp = (0.25 + Math.random() * 0.75) * power * 0.32
        st.p.set([x + Math.cos(a) * 0.08, WATER_Y + 0.02, z + Math.sin(a) * 0.08], i * 3)
        st.v.set([Math.cos(a) * sp, power * (0.55 + Math.random() * 0.6), Math.sin(a) * sp], i * 3)
        st.life[i] = 1
      }
    }
  }, [api, st])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const m = ref.current
    if (!m) return
    let any = false
    for (let i = 0; i < SPLASH_N; i++) {
      let s = 0
      if (st.life[i] > 0) {
        st.v[i * 3 + 1] -= 9.8 * dt
        st.p[i * 3] += st.v[i * 3] * dt
        st.p[i * 3 + 1] += st.v[i * 3 + 1] * dt
        st.p[i * 3 + 2] += st.v[i * 3 + 2] * dt
        if (st.p[i * 3 + 1] < WATER_Y && st.v[i * 3 + 1] < 0) st.life[i] = 0
        else {
          s = 0.6 + 0.4 * Math.min(1, st.v[i * 3 + 1] + 1)
          any = true
        }
      }
      st.m.makeScale(s, s, s).setPosition(st.p[i * 3], st.p[i * 3 + 1], st.p[i * 3 + 2])
      m.setMatrixAt(i, st.m)
    }
    m.visible = any
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, SPLASH_N]} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[0.05, 8, 6]} />
      <meshBasicMaterial color="#ffffff" />
    </instancedMesh>
  )
}

/** an inflatable ring drifting on the water and leaving a faint wake */
function FloatRing({ sim, wind }: { sim: SimApi; wind: React.RefObject<number> }) {
  const g = useRef<THREE.Group>(null)
  const arcs = useMemo(() => Array.from({ length: 8 }, (_, i) => i), [])
  const st = useMemo(() => ({ x: -1.4, z: 0.8, vx: 0.18, vz: 0.1, t: 0, last: 0 }), [])
  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const T = s.clock.elapsedTime
    const w = wind.current ?? 0
    // gentle wander + push by the swell in wind mode
    st.vx += (Math.sin(T * 0.23) * 0.12 + w * 6 - st.vx) * dt * 0.6
    st.vz += (Math.cos(T * 0.31 + 1.2) * 0.12 - st.vz) * dt * 0.6
    st.x += st.vx * dt
    st.z += st.vz * dt
    const m = 0.75
    if (st.x < POOL.x0 + m) (st.x = POOL.x0 + m), (st.vx = Math.abs(st.vx))
    if (st.x > X1 - m - 1.4) (st.x = X1 - m - 1.4), (st.vx = -Math.abs(st.vx) * 0.6)
    if (st.z < POOL.z0 + m) (st.z = POOL.z0 + m), (st.vz = Math.abs(st.vz))
    if (st.z > Z1 - m) (st.z = Z1 - m), (st.vz = -Math.abs(st.vz))
    if (g.current) {
      g.current.position.set(st.x, WATER_Y + 0.06 + Math.sin(T * 1.9) * 0.025, st.z)
      g.current.rotation.set(Math.sin(T * 1.3) * 0.05, T * 0.15, Math.cos(T * 1.1) * 0.05)
    }
    if (T - st.last > 0.12) {
      st.last = T
      const sp = Math.hypot(st.vx, st.vz)
      sim.drops.push([(st.x - POOL.x0) / POOL.W, 1 - (st.z - POOL.z0) / POOL.L, 0.05, 0.0025 + sp * 0.01])
    }
  })
  return (
    <group ref={g}>
      {arcs.map((i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, (i * Math.PI) / 4]} castShadow>
          <torusGeometry args={[0.42, 0.16, 12, 10, Math.PI / 4 + 0.01]} />
          <meshLambertMaterial color={i % 2 ? '#fffaf3' : C.coral} />
        </mesh>
      ))}
    </group>
  )
}

/** falling rain streaks; each one kicks a drop into the sim where it lands */
const RAIN_N = 70
function Rain({ sim, amount }: { sim: SimApi; amount: React.RefObject<number> }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const st = useMemo(() => {
    const p = new Float32Array(RAIN_N * 3)
    for (let i = 0; i < RAIN_N; i++) {
      p[i * 3] = POOL.x0 + Math.random() * POOL.W
      p[i * 3 + 1] = WATER_Y + Math.random() * 8
      p[i * 3 + 2] = POOL.z0 + Math.random() * POOL.L
    }
    return { p, m: new THREE.Matrix4() }
  }, [])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const a = amount.current ?? 0
    const m = ref.current
    if (!m) return
    m.visible = a > 0.02
    if (!m.visible) return
    const active = Math.round(RAIN_N * a)
    for (let i = 0; i < RAIN_N; i++) {
      let y = st.p[i * 3 + 1] - dt * 11
      st.p[i * 3] += dt * 0.6
      if (y < WATER_Y) {
        const x = st.p[i * 3]
        const z = st.p[i * 3 + 2]
        if (i < active && x > POOL.x0 && x < X1) sim.drops.push([(x - POOL.x0) / POOL.W, 1 - (z - POOL.z0) / POOL.L, 0.018, 0.022])
        y += 8
        st.p[i * 3] = POOL.x0 - 0.4 + Math.random() * POOL.W
        st.p[i * 3 + 2] = POOL.z0 + Math.random() * POOL.L
      }
      st.p[i * 3 + 1] = y
      const vis = i < active ? 1 : 0
      st.m.makeScale(vis, vis, vis).setPosition(st.p[i * 3], y + 0.2, st.p[i * 3 + 2])
      m.setMatrixAt(i, st.m)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, RAIN_N]} frustumCulled={false} raycast={() => null}>
      <boxGeometry args={[0.018, 0.42, 0.018]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.75} />
    </instancedMesh>
  )
}

/* ------------------------------------------------------------------ ambient drivers */
function Ambient({ sim, mode }: { sim: SimApi; mode: React.RefObject<Mode> }) {
  const st = useMemo(() => ({ next: 1.2, cat: 0 }), [])
  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const T = s.clock.elapsedTime
    const m = mode.current
    // living micro-ripples everywhere
    sim.drops.push([Math.random(), Math.random(), 0.05, (Math.random() - 0.5) * 0.0024])
    if (m === 'calm' && T > st.next) {
      st.next = T + 2.2 + Math.random() * 2.2
      sim.drops.push([0.12 + Math.random() * 0.62, 0.12 + Math.random() * 0.76, 0.03, 0.04])
    }
    if (m === 'wind') {
      // cat's paws: gusty little patches downwind
      st.cat += dt
      if (st.cat > 0.05) {
        st.cat = 0
        sim.drops.push([0.1 + Math.random() * 0.8, Math.random(), 0.025, (Math.random() - 0.5) * 0.02])
      }
    }
  })
  return null
}

function Lights() {
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight('#fff4e6', 1.6)
    l.position.set(-4, 11, 7)
    l.castShadow = true
    l.shadow.mapSize.set(2048, 2048)
    const cam = l.shadow.camera as THREE.OrthographicCamera
    cam.left = cam.bottom = -10
    cam.right = cam.top = 10
    cam.near = 0.5
    cam.far = 40
    l.shadow.bias = -0.0005
    l.shadow.normalBias = 0.02
    return l
  }, [])
  return (
    <>
      <ambientLight intensity={1.55} color="#fff4ec" />
      <hemisphereLight args={['#fffaf2', '#d7a7b3', 0.6]} />
      <primitive object={sun} />
    </>
  )
}

function Scene({ mode, wind, rain, flex, ctl, simOut }: { mode: React.RefObject<Mode>; wind: React.RefObject<number>; rain: React.RefObject<number>; flex: MotionValue<number>; ctl: DiveCtl; simOut: React.RefObject<SimApi | null> }) {
  const burst = useRef<Burst | null>(null)
  const sim = useWaterSim(mode, wind)
  simOut.current = sim
  useEffect(() => {
    // a few opening drops so the first frame (and the poster) already shows rings
    sim.drops.push([0.3, 0.55, 0.05, 0.09], [0.62, 0.3, 0.04, 0.07], [0.5, 0.8, 0.035, 0.06])
  }, [sim])
  const root = useRef<THREE.Group>(null)
  useFrame((s) => {
    if (root.current) root.current.position.y = Math.sin(s.clock.elapsedTime * 0.7) * 0.08
  })
  return (
    <group ref={root}>
      <Deck />
      <Coping />
      <Water sim={sim} rain={rain} burst={burst} />
      <Ladder x={-1.6} />
      <DivingBoard flex={flex} ctl={ctl} sim={sim} burst={burst} />
      <Splash api={burst} />
      <Lounger p={[3.3, 0, -0.9]} />
      <Lounger p={[4.6, 0, -0.9]} />
      <Umbrella p={[4.0, 0, -3.15]} wind={wind} />
      <Plant p={[5.1, 0, 2.9]} s={1.05} wind={wind} />
      <Plant p={[-5.25, 0, -3.8]} s={0.9} wind={wind} />
      <ConeTree p={[-5.3, 0, 3.6]} h={1.0} />
      <ConeTree p={[-4.7, 0, 3.95]} h={0.7} />
      <ConeTree p={[5.3, 0, -4.0]} h={0.85} />
      {/* towel on the deck */}
      <Block p={[3.0, 0.02, 2.6]} s={[1.1, 0.04, 0.6]} c={C.sun} cast={false} />
      <Block p={[3.0, 0.045, 2.6]} s={[1.1, 0.01, 0.12]} c="#ffffff" cast={false} />
      <FloatRing sim={sim} wind={wind} />
      <Rain sim={sim} amount={rain} />
      <Ambient sim={sim} mode={mode} />
    </group>
  )
}

/* ------------------------------------------------------------------ page */
const MODES: { value: Mode; label: string }[] = [
  { value: 'calm', label: '平静' },
  { value: 'rain', label: '雨滴' },
  { value: 'wind', label: '起风' },
]
const COPY: Record<Mode, string> = {
  calm: '偶尔一滴水落下，圆环一圈圈扩散、撞到池壁再反射回来。',
  rain: '几十条雨丝同时落入水面，波纹彼此叠加、干涉，此起彼伏。',
  wind: '深水端推出斜向的涌浪，水面被风吹出细碎的波纹，泳圈也被推着走。',
}

export default function RipplePool() {
  const [mode, setMode] = useState<Mode>('calm')
  const modeRef = useRef<Mode>('calm')
  modeRef.current = mode
  const windMv = useMotionValue(0)
  const rainMv = useMotionValue(0)
  const flex = useMotionValue(0)
  const wind = useRef(0)
  const rain = useRef(0)
  const simRef = useRef<SimApi | null>(null)
  const lastTouch = useRef(POSTER ? Infinity : -1e9)
  const [dives, setDives] = useState(0)

  useEffect(() => windMv.on('change', (v) => void (wind.current = v)), [windMv])
  useEffect(() => rainMv.on('change', (v) => void (rain.current = v)), [rainMv])
  useEffect(() => {
    const a = animate(windMv, mode === 'wind' ? 0.05 : 0, { duration: 1.6, ease: 'easeInOut' })
    const b = animate(rainMv, mode === 'rain' ? 1 : 0, { duration: 1.4, ease: 'easeInOut' })
    return () => {
      a.stop()
      b.stop()
    }
  }, [mode, windMv, rainMv])

  const ctl = useMemo<DiveCtl>(() => ({ at: -1 }), [])
  const dive = useCallback(() => {
    // the board dips and springs back, the swimmer flips in; the splash itself is fired from the frame loop
    if (ctl.at > 0 && performance.now() - ctl.at < 3500) return
    ctl.at = performance.now()
    flex.stop()
    flex.set(0)
    animate(flex, [0, -1, 0.7, -0.3, 0.1, 0], { duration: 1.1, ease: 'easeOut' })
    setDives((n) => n + 1)
  }, [flex, ctl])

  // idle loop: modes cycle on their own, with a dive now and then
  useEffect(() => {
    if (POSTER) return
    const id = setInterval(() => {
      if (performance.now() - lastTouch.current < 10000 || document.hidden) return
      setMode((m) => MODES[(MODES.findIndex((x) => x.value === m) + 1) % MODES.length].value)
    }, 9000)
    const d = setInterval(() => {
      if (performance.now() - lastTouch.current < 10000 || document.hidden) return
      if (modeRef.current === 'calm') dive()
    }, 5200)
    return () => {
      clearInterval(id)
      clearInterval(d)
    }
  }, [dive])
  useEffect(() => () => void (document.body.style.cursor = ''), [])

  const touch = () => void (lastTouch.current = performance.now())

  return (
    <div className={`stage rp-root rp-${mode}`} style={{ background: 'linear-gradient(180deg, #eaf6f4 0%, #f5f0e8 55%, #f7e2d8 100%)' }}>
      <motion.div aria-hidden className="rp-rainsky" animate={{ opacity: mode === 'rain' ? 1 : 0 }} transition={{ duration: 1.4 }} />
      <div aria-hidden className="rp-sun" />
      <Canvas
        orthographic
        flat
        shadows
        dpr={[1, 2]}
        camera={{ near: 0.1, far: 300 }}
        gl={{ antialias: true, alpha: true }}
        onPointerDown={touch}
      >
        <IsoRig fit={21.5} mobileFit={16.6} mobileOffsetY={0.13} offset={[0.2, -0.02]} target={[0, -1.1, 0]} />
        <Lights />
        <Scene mode={modeRef} wind={wind} rain={rain} flex={flex} ctl={ctl} simOut={simRef} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="scrim" />
          <p className="kicker">
            <i style={{ background: '#2fb3c4' }} /> Isometric · Heightfield
          </p>
          <h1>
            一池
            <br />
            会回应的水
          </h1>
          <p>
            <span className="rp-tech">水面是一张 256×256 的实时高度场，按波动方程以 60 Hz 推进；池底瓷砖随法线折射晃动，焦散光斑在波峰下聚拢。</span>
            <motion.span key={mode} className="rp-mode-line" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {COPY[mode]}
            </motion.span>
          </p>
          <div className="hero-actions">
            <button
              className="btn primary"
              onClick={() => {
                touch()
                dive()
              }}
            >
              跳水
            </button>
            <button
              className="btn"
              onClick={() => {
                touch()
                simRef.current?.clear()
              }}
            >
              抚平水面
            </button>
          </div>
          <p className="rp-meta">已跳水 {dives} 次</p>
        </motion.div>

        <div className="dock">
          <Seg
            items={MODES}
            value={mode}
            onChange={(v) => {
              touch()
              setMode(v)
            }}
          />
          <span className="dock-sep" />
          <button
            className="seg"
            onClick={() => {
              touch()
              dive()
            }}
          >
            <span>跳水</span>
          </button>
        </div>
        <p className="hint">点击或拖过水面 · 激起涟漪</p>
      </div>

      <style>{`
        .rp-root { --soft-bg: #f2f3ee; }
        .rp-rainsky { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, #dfe9ec 0%, #e8ecea 55%, #e9dcd8 100%); }
        .rp-sun { position: absolute; right: 15%; top: 9%; width: min(30vw, 400px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, #fff6df 0%, #fdf0d8 45%, transparent 70%); transition: opacity 1.4s; }
        .rp-rain .rp-sun { opacity: .35; }
        .rp-mode-line { display: block; margin-top: 10px; color: var(--fg); opacity: .8; }
        .rp-meta { margin-top: 14px !important; font: 12px/1 var(--mono) !important; color: var(--fg-2); }
        @media (max-width: 760px) {
          .rp-root .hero-copy > p:not(.kicker):not(.rp-meta) { font-size: 14px; line-height: 1.6; margin-top: 14px; }
          .rp-tech { display: none; }
          .rp-mode-line { margin-top: 0; }
          .rp-meta { display: none; }
          .rp-sun { right: 4%; top: 8%; width: 50vw; }
        }
      `}</style>
    </div>
  )
}
