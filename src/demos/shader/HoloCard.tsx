import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { animate, motion, useMotionValue, useSpring, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Seg } from '../../components/Seg'
import { POSTER } from '../../lib/iso'
import { hexToRgb, useShaderMaterial } from './glsl'
import { makeBack, makeFront } from './holoCardTex'

/* ---------------------------------------------------------------- foil styles */

type Style = {
  key: string
  zh: string
  baseA: string
  baseB: string
  text: string
  edge: string
  chip: string
  textFoil: number
  foil: number
  glitter: number
  glitterAll: number
  /** cosine palette a + b·cos(2π(c·t + d)) — the thin-film colour ramp */
  pa: [number, number, number]
  pb: [number, number, number]
  pc: [number, number, number]
  pd: [number, number, number]
  /** emboss pattern weights: guilloche rings, sunburst rays, diamond lattice */
  pat: [number, number, number]
  light: number
  bg: string
}

const STYLES: Style[] = [
  {
    key: 'aurora',
    zh: '极光',
    baseA: '#e4e7ef',
    baseB: '#b3bccf',
    text: '#171b2a',
    edge: '#cfd5e2',
    chip: '#dcbc78',
    textFoil: 0,
    foil: 1,
    glitter: 0.7,
    glitterAll: 0.12,
    pa: [0.68, 0.68, 0.72],
    pb: [0.34, 0.34, 0.32],
    pc: [1, 1, 1],
    pd: [0.0, 0.33, 0.67],
    pat: [1, 0, 0],
    light: 1,
    bg: '#9ef0ff',
  },
  {
    key: 'gold',
    zh: '金箔',
    baseA: '#14110c',
    baseB: '#2b2218',
    text: '#ead29a',
    edge: '#b8955a',
    chip: '#e3c47e',
    textFoil: 1,
    foil: 1,
    glitter: 0.9,
    glitterAll: 0.12,
    pa: [0.8, 0.62, 0.36],
    pb: [0.2, 0.17, 0.14],
    pc: [1, 1, 1],
    pd: [0.0, 0.07, 0.17],
    pat: [0, 1, 0],
    light: 0,
    bg: '#ffcf7a',
  },
  {
    key: 'night',
    zh: '暗夜',
    baseA: '#060609',
    baseB: '#14121e',
    text: '#dcdeea',
    edge: '#2c2a3a',
    chip: '#c8ccd8',
    textFoil: 0.35,
    foil: 0.9,
    glitter: 1.1,
    glitterAll: 0.6,
    pa: [0.32, 0.3, 0.46],
    pb: [0.32, 0.28, 0.38],
    pc: [1, 1, 1],
    pd: [0.62, 0.72, 0.88],
    pat: [0, 0, 1],
    light: 0,
    bg: '#a78bff',
  },
]

type Vec = number[]
const flat = (s: Style): Vec => [
  ...hexToRgb(s.baseA),
  ...hexToRgb(s.baseB),
  ...hexToRgb(s.text),
  ...hexToRgb(s.edge),
  ...hexToRgb(s.chip),
  s.textFoil,
  s.foil,
  s.glitter,
  s.glitterAll,
  ...s.pa,
  ...s.pb,
  ...s.pc,
  ...s.pd,
  ...s.pat,
  s.light,
  ...hexToRgb(s.bg),
]

/* ---------------------------------------------------------------- shaders */

const faceVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vN = normalize(m * vec3(0.0, 0.0, 1.0));
  vT = normalize(m * vec3(1.0, 0.0, 0.0));
  vB = normalize(m * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const faceFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform vec3 uBaseA;
uniform vec3 uBaseB;
uniform vec3 uText;
uniform vec3 uEdge;
uniform vec3 uChip;
uniform float uTextFoil;
uniform float uFoil;
uniform float uGlitter;
uniform float uGlitterAll;
uniform vec3 uPa;
uniform vec3 uPb;
uniform vec3 uPc;
uniform vec3 uPd;
uniform vec3 uPat;
uniform float uLight;
varying vec2 vUv;
varying vec3 vWPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;

const float ASP = 1.5873;

vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

vec3 film(float t) { return uPa + uPb * cos(6.28318 * (uPc * t + uPd)); }

// emboss micro-pattern in card space (x: -ASP/2..ASP/2, y: -.5...5)
float pattern(vec2 p) {
  vec2 c1 = vec2(0.26, 0.12);
  vec2 c2 = vec2(0.30, 0.05);
  float rings = 0.5 + 0.5 * sin(length(p - c1) * 150.0) * sin(length(p - c2) * 150.0 + 1.0);
  vec2 d = p - vec2(0.26, 0.11);
  float rays = 0.5 + 0.5 * sin(atan(d.y, d.x) * 56.0 + sin(length(d) * 40.0) * 0.6);
  vec2 g = vec2(p.x + p.y, p.x - p.y) * 34.0;
  vec2 f = abs(fract(g) - 0.5);
  float lat = smoothstep(0.08, 0.0, min(f.x, f.y));
  return dot(uPat, vec3(rings, rays, lat));
}

void main() {
  vec4 m = texture2D(uMap, vUv);
  vec2 p = (vUv - 0.5) * vec2(ASP, 1.0);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 N0 = normalize(vN);
  vec3 T = normalize(vT);
  vec3 B = normalize(vB);
  vec3 vt = vec3(dot(V, T), dot(V, B), dot(V, N0));

  // ---- bump: baked emboss (alpha) + procedural pattern inside the foil
  float pat = pattern(p);
  #ifndef BACK
  vec2 e = vec2(1.0 / 1600.0, 1.0 / 1008.0) * 1.5;
  float hx = texture2D(uMap, vUv + vec2(e.x, 0.0)).a - texture2D(uMap, vUv - vec2(e.x, 0.0)).a;
  float hy = texture2D(uMap, vUv + vec2(0.0, e.y)).a - texture2D(uMap, vUv - vec2(0.0, e.y)).a;
  float px1 = pattern(p + vec2(0.0012, 0.0)) - pattern(p - vec2(0.0012, 0.0));
  float py1 = pattern(p + vec2(0.0, 0.0012)) - pattern(p - vec2(0.0, 0.0012));
  float foilMask = m.g;
  vec3 N = normalize(N0 - T * (hx * 2.4 + px1 * 0.05 * foilMask) - B * (hy * 2.4 + py1 * 0.05 * foilMask));
  float h = m.a;
  #else
  float foilMask = m.g;
  vec3 N = N0;
  float h = 0.0;
  #endif

  vec3 L1 = normalize(vec3(-0.45, 0.7, 0.9));
  vec3 L2 = normalize(vec3(0.75, -0.25, 0.75));
  vec3 R = reflect(-V, N);
  float s1 = max(dot(R, L1), 0.0);
  float s2 = max(dot(R, L2), 0.0);
  // soft studio "environment": bright from above, a dim floor
  float env = smoothstep(-0.5, 0.9, R.y) * 0.55 + pow(s1, 6.0) * 0.6 + pow(s2, 10.0) * 0.3;

  // ---- thin-film hue: shifts with the viewing angle across the card, the emboss and the pattern
  float t = vt.x * 1.7 + vt.y * 1.2 + dot(p, vec2(0.55, -0.4)) + h * 0.45 + pat * 0.05 + uTime * 0.015;
  vec3 foil = film(t);

  // a specular sweep band that slides across as the card tilts
  float sweepPos = 0.5 + vt.x * 2.4 - vt.y * 1.6 + sin(uTime * 0.3) * 0.08;
  float sweep = exp(-pow((dot(vUv - 0.5, normalize(vec2(1.0, 0.62))) + 0.5 - sweepPos) / 0.1, 2.0));

  // ---- base stock
  vec3 base = mix(uBaseA, uBaseB, smoothstep(-0.7, 0.8, p.x * 0.55 + p.y * 0.9));
  base *= 0.95 + 0.05 * pat;
  float diff = 0.78 + 0.22 * max(dot(N, L1), 0.0);
  vec3 col = base * diff;

  // ---- foil
  float fm = clamp(foilMask * uFoil, 0.0, 1.0);
  vec3 foilC = foil * (0.32 + 0.95 * env) + foil * sweep * 0.75;
  foilC *= 0.9 + 0.1 * pat;
  col = mix(col, foilC, fm);

  // ---- glitter flakes: each cell has its own tilted micro-normal, so they light up one by one
  vec2 gp = vUv * vec2(210.0, 132.0);
  vec2 gi = floor(gp);
  vec3 rnd = hash3(gi);
  vec2 gf = fract(gp) - 0.5 - (rnd.xy - 0.5) * 0.5;
  float flake = smoothstep(0.3, 0.02, length(gf));
  vec3 fn = normalize(N + T * (rnd.x - 0.5) * 1.1 + B * (rnd.y - 0.5) * 1.1);
  vec3 Rf = reflect(-V, fn);
  float tw = pow(max(dot(Rf, L1), 0.0), 90.0) + pow(max(dot(Rf, L2), 0.0), 120.0) * 0.7;
  float glit = tw * flake * step(0.5, rnd.z) * (fm * uGlitter + uGlitterAll);
  col += glit * (film(t + rnd.z * 0.6) * 1.6 + 0.6) * 2.2;

  #ifndef BACK
  // ---- chip (brushed metal, contacts separated by dark gaps)
  float chipM = smoothstep(0.2, 0.35, m.b);
  float gap = 1.0 - smoothstep(0.55, 0.85, m.b);
  float brush = 0.92 + 0.08 * sin(vUv.x * 900.0 + sin(vUv.y * 40.0) * 2.0);
  vec3 chipC = uChip * (0.45 + 0.75 * env) * brush + pow(s1, 30.0) * 0.6;
  chipC = mix(chipC, uChip * 0.25, gap * 0.85);
  col = mix(col, chipC, chipM);
  #else
  // ---- magnetic stripe, signature panel, cvv box
  float stripe = m.a;
  vec3 stripeC = vec3(0.025, 0.025, 0.03) + pow(s1, 14.0) * 0.18 + env * 0.03;
  col = mix(col, stripeC, stripe);
  float panel = smoothstep(0.8, 0.95, m.b);
  float cvvBox = smoothstep(0.35, 0.5, m.b) * (1.0 - panel);
  vec2 sp = vUv * vec2(260.0, 164.0);
  float wav = 0.5 + 0.5 * sin((sp.x + sp.y) * 1.7);
  vec3 panelC = mix(vec3(0.93, 0.92, 0.88), vec3(0.83, 0.85, 0.9), wav * 0.5) * (0.85 + 0.2 * env);
  col = mix(col, panelC, panel);
  col = mix(col, vec3(0.9, 0.9, 0.9) * (0.85 + 0.2 * env), cvvBox * 0.9);
  #endif

  // ---- printed text (foil-stamped in some styles); on the signature panel it is blue-black ink
  vec3 txt = mix(uText * (0.85 + 0.25 * env), foil * (0.55 + 0.9 * env) + sweep * 0.3, uTextFoil);
  #ifdef BACK
  txt = mix(txt, vec3(0.08, 0.1, 0.2), max(panel, cvvBox));
  #endif
  col = mix(col, txt, m.r);

  // ---- clear coat: tight key highlight + broad sheen
  float fres = pow(1.0 - clamp(vt.z, 0.0, 1.0), 4.0);
  col += pow(s1, 80.0) * 0.55 + pow(s1, 8.0) * 0.06 * (0.4 + uLight) + sweep * 0.06 + fres * 0.12;

  gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`

const edgeVert = /* glsl */ `
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const edgeFrag = /* glsl */ `
uniform vec3 uEdge;
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 R = reflect(-V, N);
  float env = smoothstep(-0.4, 0.9, R.y);
  vec3 col = uEdge * (0.35 + 0.75 * env) + pow(max(dot(R, normalize(vec3(-0.45, 0.7, 0.9))), 0.0), 40.0) * 0.5;
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const shadowFrag = /* glsl */ `
uniform vec2 uSize;
uniform vec2 uPlane;
uniform float uBlur;
uniform float uOpacity;
varying vec2 vUv;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  vec2 p = (vUv - 0.5) * uPlane;
  float d = sdRound(p, uSize * 0.5, 0.18);
  float a = 1.0 - smoothstep(-uBlur * 0.6, uBlur, d);
  a *= a;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity);
}
`
const glowFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAmt;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float g = exp(-dot(p, p) * 3.2) * smoothstep(1.0, 0.55, length(p));
  gl_FragColor = vec4(pow(uColor, vec3(2.2)) * g * uAmt, 1.0);
  #include <colorspace_fragment>
}
`
const bgFrag = /* glsl */ `
uniform vec2 uC;
varying vec2 vUv;
void main() {
  vec2 p = vUv - uC;
  p.x *= 1.6;
  float g = exp(-dot(p, p) * 2.6);
  vec3 col = mix(vec3(0.035, 0.035, 0.055), vec3(0.09, 0.09, 0.13), g);
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}
`

/* ---------------------------------------------------------------- geometry */

const CW = 3.4
const CH = CW / 1.5873
const RAD = 0.14
const BEV = 0.014
const DEPTH = 0.03

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false)
  s.lineTo(x + w, y + h - r)
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false)
  s.lineTo(x + r, y + h)
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false)
  s.lineTo(x, y + r)
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false)
  return s
}

function useCardGeometry() {
  return useMemo(() => {
    const iw = CW - BEV * 2
    const ih = CH - BEV * 2
    const shape = roundedRect(iw, ih, RAD - BEV)
    const body = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 5, curveSegments: 14 })
    body.translate(0, 0, -DEPTH / 2)
    const face = new THREE.ShapeGeometry(shape, 14)
    const pos = face.attributes.position
    const uv = face.attributes.uv
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / iw + 0.5, pos.getY(i) / ih + 0.5)
    uv.needsUpdate = true
    return { body, face, z: DEPTH / 2 + BEV + 0.0015 }
  }, [])
}

/* ---------------------------------------------------------------- scene */

type Springs = { rx: MotionValue<number>; ry: MotionValue<number>; flip: MotionValue<number>; wob: MotionValue<number> }

function Card({ springs, tiltT, target, mixK, from, to, onFlip, layoutRef }: {
  springs: Springs
  tiltT: { rx: MotionValue<number>; ry: MotionValue<number> }
  target: React.RefObject<{ x: number; y: number; active: number }>
  mixK: MotionValue<number>
  from: React.RefObject<Vec>
  to: React.RefObject<Vec>
  onFlip: () => void
  layoutRef: React.RefObject<{ cx: number; cy: number; px: number }>
}) {
  const { body, face, z } = useCardGeometry()
  const front = useMemo(() => makeFront(), [])
  const back = useMemo(() => makeBack(), [])
  useEffect(
    () => () => {
      front.dispose()
      back.dispose()
      body.dispose()
      face.dispose()
    },
    [front, back, body, face],
  )

  const u = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseA: { value: new THREE.Vector3() },
      uBaseB: { value: new THREE.Vector3() },
      uText: { value: new THREE.Vector3() },
      uEdge: { value: new THREE.Vector3() },
      uChip: { value: new THREE.Vector3() },
      uTextFoil: { value: 0 },
      uFoil: { value: 1 },
      uGlitter: { value: 1 },
      uGlitterAll: { value: 0 },
      uPa: { value: new THREE.Vector3() },
      uPb: { value: new THREE.Vector3() },
      uPc: { value: new THREE.Vector3() },
      uPd: { value: new THREE.Vector3() },
      uPat: { value: new THREE.Vector3() },
      uLight: { value: 0 },
    }),
    [],
  )
  const frontMat = useShaderMaterial(() => ({ vertexShader: faceVert, fragmentShader: faceFrag, uniforms: { ...u, uMap: { value: front } } }))
  const backMat = useShaderMaterial(() => ({ vertexShader: faceVert, fragmentShader: faceFrag, uniforms: { ...u, uMap: { value: back } }, defines: { BACK: '' } }))
  const edgeMat = useShaderMaterial(() => ({ vertexShader: edgeVert, fragmentShader: edgeFrag, uniforms: { uEdge: u.uEdge } }))
  const shadowU = useMemo(() => ({ uSize: { value: new THREE.Vector2(CW, CH) }, uPlane: { value: new THREE.Vector2(9, 7) }, uBlur: { value: 0.5 }, uOpacity: { value: 0.9 } }), [])
  const shadowMat = useShaderMaterial(() => ({ vertexShader: quadVert, fragmentShader: shadowFrag, uniforms: shadowU, transparent: true, depthWrite: false }))
  const glowU = useMemo(() => ({ uColor: { value: new THREE.Vector3(0.6, 0.9, 1) }, uAmt: { value: 0.2 } }), [])
  const glowMat = useShaderMaterial(() => ({ vertexShader: quadVert, fragmentShader: glowFrag, uniforms: glowU, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  const bgU = useMemo(() => ({ uC: { value: new THREE.Vector2(0.65, 0.5) } }), [])
  const bgMat = useShaderMaterial(() => ({ vertexShader: quadVert, fragmentShader: bgFrag, uniforms: bgU, depthWrite: false }))

  const root = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const flipG = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const clock = useRef(0)
  const cur = useRef<Vec>(to.current.slice())
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  // layout: card on the right on desktop, above the copy on phones, centred for posters
  const layout = useMemo(() => {
    const W = size.width
    const H = size.height
    const ppu = H / (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    let cx: number, cy: number, px: number
    if (POSTER) {
      cx = W / 2
      cy = H / 2
      px = Math.min(W * 0.46, H * 0.95)
    } else if (W < 760) {
      px = Math.min(W * 0.8, 360)
      cx = W / 2
      cy = Math.max(72 + px * 0.42, H * 0.355)
    } else {
      px = Math.min(Math.max(W * 0.36, 380), 600, H * 0.95)
      cx = W * (W > 1100 ? 0.665 : 0.68)
      cy = H * 0.49
    }
    return { x: (cx - W / 2) / ppu, y: -(cy - H / 2) / ppu, s: px / (CW * ppu), cx, cy, px, bgx: cx / W, bgy: 1 - cy / H }
  }, [size, camera])

  useEffect(() => {
    layoutRef.current = { cx: layout.cx, cy: layout.cy, px: layout.px }
    bgU.uC.value.set(layout.bgx, layout.bgy)
  }, [layout, layoutRef, bgU])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    clock.current += dt
    const t = clock.current

    // idle sway when nobody is steering
    const tg = target.current
    if (POSTER) {
      tiltT.rx.set(-0.1)
      tiltT.ry.set(-0.36)
    } else if (tg.active > 0) {
      tiltT.rx.set(tg.y * 0.34)
      tiltT.ry.set(tg.x * 0.46)
    } else {
      tiltT.rx.set(Math.sin(t * 0.47) * 0.13 - 0.04)
      tiltT.ry.set(Math.sin(t * 0.31 + 1.0) * 0.34)
    }

    // style blend
    const k = mixK.get()
    const a = from.current
    const b = to.current
    const c = cur.current
    for (let i = 0; i < c.length; i++) c[i] = a[i] + (b[i] - a[i]) * k
    u.uBaseA.value.set(c[0], c[1], c[2])
    u.uBaseB.value.set(c[3], c[4], c[5])
    u.uText.value.set(c[6], c[7], c[8])
    u.uEdge.value.set(c[9], c[10], c[11])
    u.uChip.value.set(c[12], c[13], c[14])
    u.uTextFoil.value = c[15]
    u.uFoil.value = c[16]
    u.uGlitter.value = c[17]
    u.uGlitterAll.value = c[18]
    u.uPa.value.set(c[19], c[20], c[21])
    u.uPb.value.set(c[22], c[23], c[24])
    u.uPc.value.set(c[25], c[26], c[27])
    u.uPd.value.set(c[28], c[29], c[30])
    u.uPat.value.set(c[31], c[32], c[33])
    u.uLight.value = c[34]
    glowU.uColor.value.set(c[35], c[36], c[37])
    u.uTime.value = t

    const rx = springs.rx.get()
    const ry = springs.ry.get()
    const fl = springs.flip.get()
    if (tilt.current) tilt.current.rotation.set(rx, ry, 0)
    if (flipG.current) {
      const prog = Math.sin(Math.min(Math.max(fl / Math.PI, 0), 1) * Math.PI)
      flipG.current.rotation.y = fl + springs.wob.get()
      flipG.current.position.z = prog * 0.5
    }
    // the shadow narrows as the card turns edge-on, and drifts opposite the tilt
    const yaw = ry + fl
    const sx = Math.max(0.08, Math.abs(Math.cos(yaw))) * 0.94
    const sy = Math.max(0.3, Math.abs(Math.cos(rx))) * 0.86
    shadowU.uSize.value.set(CW * sx, CH * sy)
    if (shadow.current) shadow.current.position.set(-ry * 0.5, -0.38 + rx * 0.3, -0.9)
    glowU.uAmt.value = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(yaw * 2.4 + rx * 3))
    if (glow.current) glow.current.position.set(ry * 0.8, -rx * 0.5, -1.4)
  })

  return (
    <>
      <mesh position={[0, 0, -6]} scale={[60, 40, 1]} material={bgMat}>
        <planeGeometry />
      </mesh>
      <group ref={root} position={[layout.x, layout.y, 0]} scale={layout.s}>
        <mesh ref={glow} material={glowMat} scale={[9, 7, 1]}>
          <planeGeometry />
        </mesh>
        <mesh ref={shadow} material={shadowMat} scale={[9, 7, 1]}>
          <planeGeometry />
        </mesh>
        <group ref={tilt}>
          <group
            ref={flipG}
            onClick={(e) => {
              e.stopPropagation()
              onFlip()
            }}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <mesh geometry={body} material={edgeMat} />
            <mesh geometry={face} material={frontMat} position={[0, 0, z]} />
            <mesh geometry={face} material={backMat} position={[0, 0, -z]} rotation={[0, Math.PI, 0]} />
          </group>
        </group>
      </group>
    </>
  )
}

/* ---------------------------------------------------------------- page */

export default function HoloCard() {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const rxT = useMotionValue(0)
  const ryT = useMotionValue(0)
  const rx = useSpring(rxT, { stiffness: 110, damping: 13, mass: 0.9 })
  const ry = useSpring(ryT, { stiffness: 110, damping: 13, mass: 0.9 })
  const flip = useMotionValue(0)
  const wob = useMotionValue(0)
  const tiltT = useMemo(() => ({ rx: rxT, ry: ryT }), [rxT, ryT])
  const springs = useMemo(() => ({ rx, ry, flip, wob }), [rx, ry, flip, wob])
  const target = useRef({ x: 0, y: 0, active: 0 })
  const layoutRef = useRef({ cx: 0, cy: 0, px: 1 })
  const mixK = useMotionValue(1)
  const from = useRef<Vec>(flat(STYLES[0]))
  const to = useRef<Vec>(flat(STYLES[0]))
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const k = mixK.get()
    from.current = from.current.map((v, i) => v + (to.current[i] - v) * k)
    to.current = flat(STYLES[idx])
    mixK.set(0)
    const a = animate(mixK, 1, { duration: 0.9, ease: [0.45, 0, 0.2, 1] })
    // a little swing so the new foil catches the light
    wob.set(0.55)
    const b = animate(wob, 0, { type: 'spring', stiffness: 90, damping: 8 })
    return () => {
      a.stop()
      b.stop()
    }
  }, [idx, mixK, wob])

  useEffect(() => {
    const a = animate(flip, flipped ? Math.PI : 0, { type: 'spring', stiffness: 60, damping: 11, mass: 1 })
    return () => a.stop()
  }, [flipped, flip])

  useEffect(() => {
    let timer = 0
    const onMove = (e: PointerEvent) => {
      const L = layoutRef.current
      const r = L.px * 0.62
      target.current.x = Math.max(-1, Math.min(1, (e.clientX - L.cx) / r))
      target.current.y = Math.max(-1, Math.min(1, (e.clientY - L.cy) / r))
      target.current.active = 1
      clearTimeout(timer)
      timer = window.setTimeout(() => (target.current.active = 0), 2600)
    }
    const onLeave = () => {
      clearTimeout(timer)
      target.current.active = 0
    }
    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <div className="stage" style={{ background: '#0b0b12' }}>
      <style>{css}</style>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 30 }} gl={{ antialias: true, alpha: false }}>
        <color attach="background" args={['#0b0b12']} />
        <Card springs={springs} tiltT={tiltT} target={target} mixK={mixK} from={from} to={to} onFlip={() => setFlipped((f) => !f)} layoutRef={layoutRef} />
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.82} luminanceSmoothing={0.2} radius={0.55} />
        </EffectComposer>
      </Canvas>

      <div className="overlay">
        <div className="hero-copy hc-copy">
          <motion.div initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}>
            <p className="kicker">
              <i style={{ background: STYLES[idx].bg, boxShadow: `0 0 10px ${STYLES[idx].bg}` }} />
              Holo Foil · Membership
            </p>
            <h1>
              会员卡，
              <br />
              也可以是一件收藏品
            </h1>
            <p>镭射箔随视角流转出彩虹色带，闪粉在转动时一粒粒亮起。移动指针让卡片倾斜，点一下翻到背面。</p>
            <div className="hero-actions">
              <button className="btn primary">申领会员卡</button>
              <button className="btn" onClick={() => setFlipped((f) => !f)}>
                {flipped ? '翻回正面' : '翻到背面'}
              </button>
            </div>
          </motion.div>
        </div>

        <div className="dock">
          <Seg items={STYLES.map((s, i) => ({ value: i, label: s.zh }))} value={idx} onChange={setIdx} />
        </div>
        <p className="hint">移动指针倾斜 · 点击卡片翻面</p>
      </div>
    </div>
  )
}

const css = `
.hc-copy h1 { font-size: clamp(32px, 3.4vw, 50px); }
.hc-copy .kicker i { transition: background .6s, box-shadow .6s; }
@media (max-width: 760px) {
  .hc-copy h1 { font-size: 32px; }
  .hc-copy p { font-size: 14.5px; line-height: 1.65; margin-top: 14px; }
  .hc-copy .hero-actions { margin-top: 20px; }
}
`
