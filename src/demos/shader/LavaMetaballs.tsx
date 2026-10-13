import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { AnimatePresence, animate, motion, useSpring } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { hexToRgb, useShaderMaterial } from './glsl'

/* ------------------------------------------------------------------ palettes */

type PalRgb = Record<'waxA' | 'waxB' | 'liquid' | 'glow' | 'bg', number[]>
const palRgb = (p: Pal): PalRgb => ({ waxA: hexToRgb(p.waxA), waxB: hexToRgb(p.waxB), liquid: hexToRgb(p.liquid), glow: hexToRgb(p.glow), bg: hexToRgb(p.bg) })
type Pal = { waxA: string; waxB: string; liquid: string; glow: string; bg: string }
const PALS: { key: string; zh: string; en: string; desc: string; p: Pal }[] = [
  { key: 'lava', zh: '熔岩', en: 'Molten', desc: '橙红的蜡在琥珀色的液体里翻涌', p: { waxA: '#c4231a', waxB: '#ffb04a', liquid: '#4a1410', glow: '#ff6a2c', bg: '#120a12' } },
  { key: 'mint', zh: '薄荷', en: 'Mint', desc: '冷绿的蜡，像一杯会动的薄荷冰', p: { waxA: '#19b394', waxB: '#c4fff0', liquid: '#062b2c', glow: '#39dcb4', bg: '#061112' } },
  { key: 'amethyst', zh: '紫晶', en: 'Amethyst', desc: '紫色蜡团带着粉色的透光边缘', p: { waxA: '#7436e6', waxB: '#ffa3f1', liquid: '#1c0d38', glow: '#a86bff', bg: '#0c0817' } },
]
const PKEYS = ['waxA', 'waxB', 'liquid', 'glow', 'bg'] as const

/* ------------------------------------------------------------------ lamp geometry (shared JS ↔ GLSL) */

const Y0 = -0.62 // glass bottom
const Y1 = 0.98 // glass top
const NB = 9 // 8 buoyant blobs + 1 pointer blob
const FOCAL = 1.38
const CAM = new THREE.Vector3(0, 0.22, 4.6)
const LOOK = new THREE.Vector3(0, 0, 0)

function glassR(y: number) {
  const s = Math.min(Math.max((y - Y0) / (Y1 - Y0), 0), 1)
  if (s < 0.3) return 0.265 + 0.08 * Math.sin((s / 0.3) * Math.PI * 0.5)
  return 0.345 - 0.17 * Math.pow((s - 0.3) / 0.7, 1.1)
}

/* ------------------------------------------------------------------ shader */

const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uZoom;
uniform float uTime;
uniform vec3 uRo;
uniform vec4 uBlob[${NB}];
uniform float uStr[${NB}];
uniform float uK;
uniform float uKp;
uniform vec3 uWaxA, uWaxB, uLiquid, uGlow, uBg;

#define Y0 ${Y0.toFixed(3)}
#define Y1 ${Y1.toFixed(3)}
#define YB -1.30
#define YT 1.30
#define FOCAL ${FOCAL.toFixed(3)}

float glassR(float y) {
  float s = clamp((y - Y0) / (Y1 - Y0), 0.0, 1.0);
  if (s < 0.3) return 0.265 + 0.08 * sin((s / 0.3) * 1.5707963);
  return 0.345 - 0.17 * pow((s - 0.3) / 0.7, 1.1);
}
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float sdEll(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)) + 1e-5; return k0 * (k0 - 1.0) / k1; }

/* ---- lamp body ---- */
float sdGlass(vec3 p, float off) {
  float d = (length(p.xz) - glassR(p.y) - off) * 0.9;
  return max(d, max(Y0 - p.y, p.y - Y1));
}
float sdBase(vec3 p) {
  float t = clamp((p.y - YB) / (Y0 - YB), 0.0, 1.0);
  float rb = 0.272 + 0.2 * pow(1.0 - t, 1.25);
  float d = (length(p.xz) - rb) * 0.82;
  return max(d, max(YB - p.y, p.y - Y0)) - 0.004;
}
float sdCap(vec3 p) {
  float t = clamp((p.y - Y1) / (YT - Y1), 0.0, 1.0);
  float rc = mix(0.19, 0.082, pow(t, 0.9));
  float d = (length(p.xz) - rc) * 0.9;
  return max(d, max(Y1 - p.y, p.y - YT)) - 0.006;
}
float sdCollar(vec3 p, float y, float r) { vec2 q = vec2(length(p.xz) - r, p.y - y); return length(q) - 0.02; }

float mapBody(vec3 p, out float id) {
  float g = sdGlass(p, 0.012);
  float m = min(sdBase(p), sdCap(p));
  m = min(m, sdCollar(p, Y0 + 0.01, glassR(Y0) + 0.012));
  m = min(m, sdCollar(p, Y1 - 0.01, glassR(Y1) + 0.012));
  id = g < m ? 2.0 : 1.0;
  return min(g, m);
}
vec3 nBody(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  float i;
  return normalize(e.xyy * mapBody(p + e.xyy, i) + e.yyx * mapBody(p + e.yyx, i) + e.yxy * mapBody(p + e.yxy, i) + e.xxx * mapBody(p + e.xxx, i));
}

/* ---- wax ---- */
float wax(vec3 p) {
  // a resting pool on the heated bottom and a little cooled cap of wax at the top
  float d = sdEll(p - vec3(0.0, Y0 + 0.015, 0.0), vec3(0.25, 0.11, 0.25));
  d = smin(d, sdEll(p - vec3(0.0, Y1 - 0.01, 0.0), vec3(0.13, 0.045, 0.13)), 0.08);
  for (int i = 0; i < ${NB}; i++) {
    vec4 b = uBlob[i];
    float s = uStr[i];
    float sq = inversesqrt(s);
    d = smin(d, sdEll(p - b.xyz, vec3(b.w * sq, b.w * s, b.w * sq)), i == ${NB - 1} ? uKp : uK);
  }
  // the glass holds it in
  return max(d, sdGlass(p, -0.004));
}
vec3 nWax(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.002;
  return normalize(e.xyy * wax(p + e.xyy) + e.yyx * wax(p + e.yyx) + e.yxy * wax(p + e.yxy) + e.xxx * wax(p + e.xxx));
}

/* ---- room ---- */
float lampGlow() { return 0.92 + 0.08 * sin(uTime * 0.7) * sin(uTime * 1.13); }

vec3 wallCol(vec2 w, float lg) {
  vec2 q = vec2(w.x, w.y - 0.15);
  float d2 = dot(q, q);
  vec3 c = uBg + uGlow * (0.34 * exp(-d2 * 0.55) + 0.12 * exp(-d2 * 0.12)) * lg;
  // soft corner where wall meets table
  return c * (0.75 + 0.25 * smoothstep(YB, YB + 0.9, w.y));
}

vec3 room(vec3 ro, vec3 rd) {
  float lg = lampGlow();
  // floor (table) at the base of the lamp
  if (rd.y < 0.0) {
    float t = (YB - ro.y) / rd.y;
    vec3 p = ro + rd * t;
    if (p.z > -2.2) {
      float r = length(p.xz);
      vec3 f = uBg * 0.85;
      f += uGlow * (0.42 * exp(-r * r * 2.2) + 0.12 * exp(-r * 0.9)) * lg;
      // contact darkening right under the base
      f *= 0.35 + 0.65 * smoothstep(0.42, 0.62, r);
      // glossy streak: a blurry reflection of the lamp toward the camera
      f += uGlow * 0.16 * exp(-p.x * p.x * 30.0) * smoothstep(0.4, 1.8, p.z) * exp(-max(p.z - 1.8, 0.0)) * lg;
      // fade into the dark far away and into the wall's corner tone, so there is no hard horizon
      f = mix(f, uBg * 0.6, smoothstep(2.0, 6.0, length(p.xz)));
      f = mix(f, wallCol(vec2(p.x, YB), lg), smoothstep(-0.4, -2.2, p.z));
      return f;
    }
  }
  // wall
  float t = (-2.2 - ro.z) / rd.z;
  vec3 p = ro + rd * t;
  return wallCol(p.xy, lg);
}

vec3 env(vec3 r) {
  // studio-ish reflection: a soft top softbox, a side strip, the warm glow of the room
  vec3 c = uBg * 1.4;
  c += vec3(0.85, 0.82, 0.8) * smoothstep(0.55, 0.95, r.y) * 0.55;
  c += vec3(0.9) * smoothstep(0.07, 0.0, abs(r.x + 0.62)) * smoothstep(-0.3, 0.4, r.y) * 0.6;
  c += uGlow * 0.45 * exp(-r.y * r.y * 6.0) * smoothstep(0.6, -0.4, r.z);
  return c;
}

/* ---- shading ---- */
vec3 shadeMetal(vec3 p, vec3 n, vec3 rd) {
  vec3 r = reflect(rd, n);
  float fr = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
  vec3 col = env(r) * vec3(0.78, 0.76, 0.74) * (0.55 + 0.45 * fr);
  // satin finish: a broad key-light lobe so the cone reads as turned metal
  vec3 K = normalize(vec3(-0.55, 0.5, 0.65));
  col += vec3(0.2, 0.19, 0.19) * pow(max(dot(n, K), 0.0), 1.5);
  col += vec3(0.5) * pow(max(dot(r, K), 0.0), 24.0);
  // light pouring out of the glass onto the metal next to it
  float nearBase = smoothstep(Y0 - 0.45, Y0, p.y) * step(p.y, Y0 + 0.05);
  float nearCap = smoothstep(Y1 + 0.3, Y1, p.y) * step(Y1 - 0.05, p.y);
  col += uGlow * (nearBase * 0.55 * max(n.y + 0.3, 0.0) + nearCap * 0.4 * max(-n.y + 0.4, 0.0)) * lampGlow();
  return col;
}

vec3 liquidAt(vec3 p) {
  // the liquid is lit from the bulb in the base: brighter low down
  float h = smoothstep(Y1, Y0, p.y);
  return uLiquid * (0.55 + 1.1 * h * h) * lampGlow();
}

vec3 shadeWax(vec3 p, vec3 rd) {
  vec3 n = nWax(p);
  vec3 L = normalize(vec3(0.0, Y0 - 0.25, 0.0) - p);
  float heat = smoothstep(0.85, Y0, p.y);
  float diff = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  // thickness probe along the inward normal: thin lobes and necks let the bulb light through
  float thin = 0.0;
  for (int k = 1; k <= 3; k++) {
    float dk = 0.045 * float(k);
    thin += clamp((wax(p - n * dk) + dk) / dk, 0.0, 1.0);
  }
  thin /= 3.0;
  float ndv = max(dot(n, -rd), 0.0);
  float fr = pow(1.0 - ndv, 3.0);
  float mixT = clamp(heat * 0.3 + thin * 0.5 + fr * 0.2 - 0.12, 0.0, 1.0);
  vec3 col = mix(uWaxA, uWaxB, mixT * mixT);
  col *= 0.34 + 1.0 * diff;
  // subsurface-ish glow: rims and thin necks pass the bulb light, hotter low down
  col += uWaxB * (fr * 0.42 + thin * thin * 0.55 * (0.3 + heat)) * (0.5 + 0.5 * heat);
  // a soft room highlight on top
  vec3 h = normalize(normalize(vec3(-0.45, 0.8, 0.55)) - rd);
  col += pow(max(dot(n, h), 0.0), 40.0) * 0.32;
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv = (uv - uShift) / uZoom;
  vec3 ro = uRo;
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * FOCAL + uv.x * rt + uv.y * up);

  vec3 col = room(ro, rd);

  // bounding cylinder around the whole lamp — most pixels never march
  float a = dot(rd.xz, rd.xz);
  float b = dot(ro.xz, rd.xz);
  float c = dot(ro.xz, ro.xz) - 0.5 * 0.5;
  float disc = b * b - a * c;
  if (disc > 0.0) {
    float t0 = (-b - sqrt(disc)) / a;
    float t1 = (-b + sqrt(disc)) / a;
    float t = max(t0, 0.0);
    float id = 0.0;
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      if (p.y < YB - 0.05 || p.y > YT + 0.05) { if ((p.y - ro.y) * rd.y > 0.0 && t > t1) break; }
      float d = mapBody(p, id);
      if (d < 0.0008) { hit = true; break; }
      t += d;
      if (t > t1 + 0.05) break;
    }
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = nBody(p);
      if (id < 1.5) {
        col = shadeMetal(p, n, rd);
      } else {
        // ---- through the glass into the liquid ----
        vec3 rd2 = refract(rd, n, 1.0 / 1.33);
        vec3 q = p + rd2 * 0.02;
        float tt = 0.0;
        float haze = 0.0;
        bool onWax = false;
        for (int i = 0; i < 52; i++) {
          float g = sdGlass(q, -0.004);
          if (g > 0.003) break;
          float d = wax(q);
          haze += exp(-max(d, 0.0) * 16.0) * 0.035;
          if (d < 0.0015) { onWax = true; break; }
          float st = clamp(d * 0.92, 0.006, 0.12);
          q += rd2 * st;
          tt += st;
        }
        vec3 inside;
        vec3 liq = liquidAt(q);
        if (onWax) {
          inside = shadeWax(q, rd2);
        } else if (q.y < Y0 + 0.03) {
          // looking down into the heated base: the bulb
          inside = mix(uWaxB, vec3(1.0, 0.95, 0.85), 0.3) * 1.15;
        } else if (q.y > Y1 - 0.03) {
          inside = uLiquid * 0.6;
        } else {
          // out through the back wall: the room, tinted by the liquid
          inside = room(q, normalize(mix(rd2, rd, 0.5))) * (uLiquid * 2.2 + 0.25) ;
        }
        float absorb = 1.0 - exp(-tt * 1.4);
        inside = mix(inside, liq, onWax ? absorb * 0.35 : 0.55 + 0.25 * absorb);
        inside += uWaxB * haze * 0.35;
        // glass surface
        float ndv = max(dot(n, -rd), 0.0);
        float F = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        vec3 refl = env(reflect(rd, n));
        col = mix(inside, refl, F);
        // crisp softbox strips on the glass
        vec3 nv = n;
        col += vec3(1.0) * smoothstep(0.06, 0.0, abs(nv.x + 0.55)) * smoothstep(0.0, 0.3, nv.z) * 0.45;
        col += vec3(1.0) * smoothstep(0.03, 0.0, abs(nv.x - 0.7)) * 0.25;
      }
    }
  }

  // vignette + tiny dither against banding in the dark gradients
  vec2 sv = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.55;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

/* ------------------------------------------------------------------ blobs (JS side) */

type Blob = { T: number; ph: number; r: number; ax: number; az: number; w: number; s: number }
const BLOBS: Blob[] = [
  { T: 21, ph: 0.0, r: 0.125, ax: 0.07, az: 0.05, w: 0.31, s: 0.2 },
  { T: 26, ph: 0.37, r: 0.105, ax: 0.09, az: 0.06, w: 0.23, s: 1.7 },
  { T: 17, ph: 0.62, r: 0.085, ax: 0.1, az: 0.07, w: 0.41, s: 3.1 },
  { T: 30, ph: 0.15, r: 0.145, ax: 0.05, az: 0.04, w: 0.19, s: 4.4 },
  { T: 23, ph: 0.81, r: 0.095, ax: 0.11, az: 0.05, w: 0.27, s: 5.3 },
  { T: 19, ph: 0.5, r: 0.075, ax: 0.08, az: 0.08, w: 0.37, s: 6.6 },
  { T: 28, ph: 0.71, r: 0.11, ax: 0.07, az: 0.06, w: 0.25, s: 7.9 },
  { T: 24, ph: 0.26, r: 0.09, ax: 0.1, az: 0.05, w: 0.33, s: 9.2 },
  { T: 22, ph: 0.92, r: 0.1, ax: 0.08, az: 0.05, w: 0.29, s: 10.5 }, // the pointer's blob when idle
]

const ss = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

function blobPath(b: Blob, t: number, out: THREE.Vector4) {
  // rise from the heated pool, linger near the top while it cools, sink back
  const u = (t / b.T + b.ph) % 1
  const tri = 1 - Math.abs(2 * u - 1)
  const e = ss(0.06, 0.94, tri)
  const y = -0.56 + e * 1.38
  const x = b.ax * Math.sin(t * b.w + b.s) + 0.04 * Math.sin(t * b.w * 2.3 + b.s * 2.1)
  const z = b.az * Math.cos(t * b.w * 0.8 + b.s * 1.3)
  // hot blobs heading up are a little bigger than cooled ones heading down
  const r = b.r * (1 + 0.1 * Math.sin(t * 0.9 + b.s) + (u < 0.5 ? 0.08 : -0.06))
  out.set(x, y, z, r)
}

function clampInside(v: THREE.Vector4) {
  const lim = Math.max(0.02, glassR(v.y) - v.w * 0.55)
  const rr = Math.hypot(v.x, v.z)
  if (rr > lim) {
    v.x *= lim / rr
    v.z *= lim / rr
  }
}

/* ------------------------------------------------------------------ scene */

function Lamp({ pal, ptr }: { pal: React.RefObject<PalRgb>; ptr: React.RefObject<{ x: number; y: number; t: number }> }) {
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const uniforms = useMemo(
    () => ({
      uRes: { value: new THREE.Vector2() },
      uShift: { value: new THREE.Vector2() },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uRo: { value: CAM.clone() },
      uBlob: { value: Array.from({ length: NB }, () => new THREE.Vector4()) },
      uStr: { value: new Array(NB).fill(1) as number[] },
      uK: { value: 0.16 },
      uKp: { value: 0.22 },
      uWaxA: { value: new THREE.Vector3() },
      uWaxB: { value: new THREE.Vector3() },
      uLiquid: { value: new THREE.Vector3() },
      uGlow: { value: new THREE.Vector3() },
      uBg: { value: new THREE.Vector3() },
    }),
    [],
  )
  const mat = useShaderMaterial(() => ({ vertexShader: VERT, fragmentShader: FRAG, uniforms, depthTest: false, depthWrite: false }))

  // pointer blob follows the cursor through Motion springs (retargeted every frame)
  const sx = useSpring(0, { stiffness: 26, damping: 9, mass: 1 })
  const sy = useSpring(-0.5, { stiffness: 26, damping: 9, mass: 1 })
  const sz = useSpring(0, { stiffness: 26, damping: 9, mass: 1 })

  const tmp = useMemo(
    () => ({ v: new THREE.Vector4(), prevY: new Float32Array(NB), t: 0, ray: new THREE.Vector3(), fw: new THREE.Vector3(), rt: new THREE.Vector3(), up: new THREE.Vector3(), cam: CAM.clone(), sway: new THREE.Vector2(), pull: 0 }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    tmp.t += dt
    const t = tmp.t + (POSTER ? 9 : 0)
    const u = uniforms

    /* framing: lamp to the right of the copy on desktop, high and smaller on phones */
    gl.getDrawingBufferSize(u.uRes.value)
    const aspect = size.width / size.height
    const mobile = size.width < 760
    if (POSTER) {
      u.uShift.value.set(0, 0)
      u.uZoom.value = 0.9
    } else if (mobile) {
      u.uShift.value.set(0, 0.17)
      u.uZoom.value = Math.min(0.62, aspect * 1.35)
    } else {
      u.uShift.value.set(Math.min(0.15 * aspect, 0.3), -0.01)
      u.uZoom.value = 0.88
    }

    /* pointer → plane z = 0 in lamp space (same camera maths as the shader) */
    const p = ptr.current
    const active = performance.now() - p.t < 2600 && !POSTER
    tmp.sway.x = THREE.MathUtils.damp(tmp.sway.x, active ? p.x * 0.35 : Math.sin(t * 0.12) * 0.25, 1.6, dt)
    tmp.sway.y = THREE.MathUtils.damp(tmp.sway.y, active ? p.y * 0.15 : 0, 1.6, dt)
    tmp.cam.set(CAM.x + tmp.sway.x, CAM.y + tmp.sway.y, CAM.z)
    u.uRo.value.copy(tmp.cam)

    const pv = tmp.v
    if (active) {
      const ux = ((p.x * 0.5 * aspect) - u.uShift.value.x) / u.uZoom.value
      const uy = ((p.y * 0.5) - u.uShift.value.y) / u.uZoom.value
      tmp.fw.copy(LOOK).sub(tmp.cam).normalize()
      tmp.rt.crossVectors(tmp.fw, THREE.Object3D.DEFAULT_UP).normalize()
      tmp.up.crossVectors(tmp.rt, tmp.fw)
      tmp.ray.copy(tmp.fw).multiplyScalar(FOCAL).addScaledVector(tmp.rt, ux).addScaledVector(tmp.up, uy).normalize()
      const k = -tmp.cam.z / tmp.ray.z
      const hx = tmp.cam.x + tmp.ray.x * k
      const hy = THREE.MathUtils.clamp(tmp.cam.y + tmp.ray.y * k, Y0 + 0.12, Y1 - 0.1)
      const lim = glassR(hy) - 0.07
      sx.set(THREE.MathUtils.clamp(hx, -lim, lim))
      sy.set(hy)
      sz.set(0.05)
    } else {
      blobPath(BLOBS[NB - 1], t, pv)
      sx.set(pv.x)
      sy.set(pv.y)
      sz.set(pv.z)
    }
    tmp.pull = THREE.MathUtils.damp(tmp.pull, active ? 1 : 0, 3, dt)

    for (let i = 0; i < NB; i++) {
      const out = u.uBlob.value[i]
      if (i === NB - 1) {
        out.set(sx.get(), sy.get(), sz.get(), BLOBS[i].r * (1 + 0.15 * tmp.pull))
      } else blobPath(BLOBS[i], t, out)
      clampInside(out)
      // stretch along the direction of travel (velocity from the previous frame)
      const vy = (out.y - tmp.prevY[i]) / Math.max(dt, 1e-3)
      tmp.prevY[i] = out.y
      const target = 1 + Math.min(Math.abs(vy) * 0.9, 0.45)
      u.uStr.value[i] = THREE.MathUtils.damp(u.uStr.value[i], target, 4, dt)
    }
    u.uKp.value = 0.2 + 0.08 * tmp.pull
    u.uTime.value = t

    const c = pal.current
    u.uWaxA.value.fromArray(c.waxA)
    u.uWaxB.value.fromArray(c.waxB)
    u.uLiquid.value.fromArray(c.liquid)
    u.uGlow.value.fromArray(c.glow)
    u.uBg.value.fromArray(c.bg)
  })

  return (
    <mesh material={mat} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ page */

const MOBILE = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 760
const DEVICE_DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
// render below native resolution on dense / small screens: the scene is soft, the march is not
const BASE_DPR = MOBILE || DEVICE_DPR > 1.3 ? Math.max(0.75, DEVICE_DPR * 0.6) : 1

export default function LavaMetaballs() {
  const [idx, setIdx] = useState(0)
  const [dpr, setDpr] = useState(BASE_DPR)
  const ptr = useRef({ x: 0, y: 0, t: -1e9 })
  const pal = useRef<PalRgb>(palRgb(PALS[0].p))

  // palette cross-fade: Motion drives 0 → 1, colours mix from whatever is on screen right now
  useEffect(() => {
    const from = palRgb(PALS[0].p)
    for (const k of PKEYS) from[k] = [...pal.current[k]]
    const to = palRgb(PALS[idx].p)
    const c = animate(0, 1, {
      duration: 1.4,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (k) => {
        for (const key of PKEYS) for (let i = 0; i < 3; i++) pal.current[key][i] = from[key][i] + (to[key][i] - from[key][i]) * k
      },
    })
    return () => c.stop()
  }, [idx])

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    ptr.current.x = ((e.clientX - r.left) / r.width) * 2 - 1
    ptr.current.y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    ptr.current.t = performance.now()
  }

  const cur = PALS[idx]

  return (
    <div className="stage lv" style={{ background: cur.p.bg, transition: 'background 1.4s' }} onPointerMove={onMove} onPointerDown={onMove}>
      <style>{css}</style>
      <Canvas dpr={dpr} gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }} orthographic camera={{ position: [0, 0, 1] }}>
        <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(0.5, d * 0.75))} flipflops={3} />
        <Lamp pal={pal} ptr={ptr} />
      </Canvas>

      <div className="overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
          <p className="kicker">
            <i style={{ background: cur.p.glow, boxShadow: `0 0 10px ${cur.p.glow}`, transition: 'background 1.4s, box-shadow 1.4s' }} /> Raymarching · Smooth-min
          </p>
          <h1>
            慢慢融化的
            <br />
            一盏光
          </h1>
          <p className="lv-lede">
            整盏灯是一个片元着色器：九团蜡由距离场的 smooth-min 融成一体，被底部的灯加热上浮、冷却下沉，在途中分裂又合并。把指针移进灯里，会从蜡团中拉出一颗液滴。
          </p>
          <div className="lv-meta">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={cur.key}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
              >
                <b style={{ color: cur.p.waxB }}>{cur.en}</b> · {cur.desc}
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="dock">
          <Seg items={PALS.map((p, i) => ({ value: i, label: p.zh }))} value={idx} onChange={setIdx} />
        </div>
        <p className="hint">
          {NB} blobs · k = 0.16 · ≤ 116 steps
          <br />
          在灯里移动指针，拉出一颗液滴
        </p>
      </div>
    </div>
  )
}

const css = `
.lv .lv-lede { max-width: 410px }
.lv-meta { margin-top: 26px; min-height: 22px; font: 13px/1.5 var(--sans); color: var(--fg-2) }
.lv-meta span { display: inline-block }
.lv-meta b { font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; transition: color 1.4s }
@media (max-width: 760px) {
  .lv .lv-lede { display: none }
  .lv-meta { margin-top: 14px }
}
`
