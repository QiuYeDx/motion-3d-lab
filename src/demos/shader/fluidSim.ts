import * as THREE from 'three'

/**
 * GPU stable-fluids solver (Jos Stam, after Pavel Dobryakov's WebGL fluid) on three.js render targets.
 * Velocity / pressure / divergence / curl live at sim resolution, dye at a higher one; everything is
 * half-float ping-pong. One full-screen quad, materials swapped per pass.
 */

const baseVert = /* glsl */ `
uniform vec2 texelSize;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
void main() {
  vUv = uv;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const head = /* glsl */ `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
`

const copyFrag = head + /* glsl */ `
uniform sampler2D uTexture;
uniform float value;
void main() { gl_FragColor = value * texture2D(uTexture, vUv); }
`

const splatFrag = head + /* glsl */ `
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main() {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.0);
}
`

const advectFrag = head + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 simTexel;
uniform float dt;
uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * simTexel;
  vec4 result = texture2D(uSource, coord);
  float decay = 1.0 + dissipation * dt;
  gl_FragColor = result / decay;
}
`

const divergenceFrag = head + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).x;
  float R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y;
  float B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`

const curlFrag = head + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uVelocity, vL).y;
  float R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x;
  float B = texture2D(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`

const vorticityFrag = head + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main() {
  float L = texture2D(uCurl, vL).x;
  float R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x;
  float B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = min(max(velocity, -1000.0), 1000.0);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

const pressureFrag = head + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`

const gradientFrag = head + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture2D(uPressure, vL).x;
  float R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x;
  float B = texture2D(uPressure, vB).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`

/* soft-threshold the dye into the small bloom buffer */
const prefilterFrag = head + /* glsl */ `
uniform sampler2D uTexture;
uniform float threshold;
void main() {
  vec3 c = texture2D(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float k = max(br - threshold, 0.0) / max(br, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}
`

/* 9-tap gaussian using linear sampling (5 fetches) */
const blurFrag = head + /* glsl */ `
uniform sampler2D uTexture;
uniform vec2 dir;
void main() {
  vec3 c = texture2D(uTexture, vUv).rgb * 0.227027;
  vec2 o1 = dir * 1.3846153846;
  vec2 o2 = dir * 3.2307692308;
  c += texture2D(uTexture, vUv + o1).rgb * 0.3162162162;
  c += texture2D(uTexture, vUv - o1).rgb * 0.3162162162;
  c += texture2D(uTexture, vUv + o2).rgb * 0.0702702703;
  c += texture2D(uTexture, vUv - o2).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`

/* final composite: three looks blended by uW = (neon, ink, aurora) */
const displayFrag = head + /* glsl */ `
uniform sampler2D uDye;
uniform sampler2D uBloom;
uniform vec2 uTexel;
uniform vec3 uW;
uniform float uTime;
uniform vec2 uRes;
uniform float uPx;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 c = texture2D(uDye, vUv).rgb;
  vec3 bl = texture2D(uBloom, vUv).rgb;
  vec2 px = vUv * uRes * uPx;           // CSS pixels, so grain is DPR-independent
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float vig = smoothstep(1.25, 0.15, length(q));
  float grain = hash(floor(px) + fract(uTime * 0.37) * 97.0) - 0.5;

  vec3 col = vec3(0.0);

  // ---- shaded dye (neon + aurora)
  if (uW.x + uW.z > 0.001) {
    // trim the faint haze left by long-diffused dye so the darks stay clean
    float cm = max(c.r, max(c.g, c.b));
    c *= smoothstep(0.0, 0.06, cm);
    vec3 lc = texture2D(uDye, vUv - vec2(uTexel.x, 0.0)).rgb;
    vec3 rc = texture2D(uDye, vUv + vec2(uTexel.x, 0.0)).rgb;
    vec3 tc = texture2D(uDye, vUv + vec2(0.0, uTexel.y)).rgb;
    vec3 bc = texture2D(uDye, vUv - vec2(0.0, uTexel.y)).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 n = normalize(vec3(dx, dy, length(uTexel)));
    float diffuse = clamp(dot(n, normalize(vec3(-0.35, 0.45, 1.0))) + 0.62, 0.66, 1.08);

    // neon: vivid dye on near-black, glow from the blurred buffer
    vec3 neon = c * diffuse * 1.25 + bl * 0.8;
    // hue-preserving soft clip (keeps saturated colours from washing to white), a touch of white-hot core
    float nm = max(neon.r, max(neon.g, neon.b));
    vec3 neonH = neon * (1.0 - exp(-nm * 1.5)) / max(nm, 1e-4);
    neon = mix(neonH, 1.0 - exp(-neon * 1.5), 0.25);
    neon += mix(vec3(0.010, 0.010, 0.018), vec3(0.035, 0.030, 0.055), vig);
    neon += grain * 0.014;
    col += neon * uW.x;

    // aurora: night sky gradient + faint twinkling stars behind cool dye
    vec3 sky = mix(vec3(0.008, 0.016, 0.035), vec3(0.025, 0.05, 0.085), smoothstep(0.0, 1.0, vUv.y));
    sky *= 0.55 + 0.45 * vig;
    vec2 cell = floor(px / 3.0);
    float sr = hash(cell * 1.37 + 4.1);
    float star = step(0.9984, sr) * (0.45 + 0.55 * sin(uTime * (1.2 + sr * 3.0) + sr * 90.0));
    sky += vec3(0.8, 0.9, 1.0) * max(star, 0.0) * 0.45 * (1.0 - clamp(length(c) * 4.0, 0.0, 1.0));
    vec3 aur = c * diffuse * 1.1 + bl * 1.3;
    float am = max(aur.r, max(aur.g, aur.b));
    aur = mix(aur * (1.0 - exp(-am * 1.4)) / max(am, 1e-4), 1.0 - exp(-aur * 1.4), 0.3);
    aur += sky + grain * 0.012;
    col += aur * uW.z;
  }

  // ---- ink wash on rice paper
  if (uW.y > 0.001) {
    float g1 = vnoise(px * 0.9);
    float g2 = vnoise(px * 0.21 + 7.0);
    float g3 = vnoise(px * 0.035 + 19.0);
    float grainP = g1 * 0.35 + g2 * 0.35 + g3 * 0.3;
    // fibres: thin, slightly curved streaks at a few orientations
    vec2 r1 = mat2(0.87, 0.5, -0.5, 0.87) * px;
    vec2 r2 = mat2(0.34, -0.94, 0.94, 0.34) * px;
    float f1 = vnoise(vec2(r1.x * 0.03 + vnoise(px * 0.02) * 2.0, r1.y * 0.55));
    float f2 = vnoise(vec2(r2.x * 0.025 + 3.0, r2.y * 0.6 + vnoise(px * 0.015) * 2.0));
    float fib = smoothstep(0.78, 0.95, f1) * 0.6 + smoothstep(0.8, 0.96, f2) * 0.5;
    vec3 paper = vec3(0.945, 0.915, 0.858);
    paper *= 0.965 + 0.06 * grainP;
    paper -= fib * vec3(0.016, 0.017, 0.02);
    paper += vec3(0.012, 0.008, 0.0) * (g3 - 0.5);
    paper *= mix(0.9, 1.0, vig);

    float d = max(c.r, max(c.g, c.b));
    float db = max(bl.r, max(bl.g, bl.b));
    float absorb = mix(0.82, 1.12, grainP) * (1.0 + fib * 0.1);
    float core = 1.0 - exp(-d * 1.7 * absorb);
    float halo = 1.0 - exp(-db * 1.5);
    float t = max(core, halo * 0.42);
    // pigment collects at the rim of a wet stroke
    float rim = smoothstep(0.04, 0.22, core) * (1.0 - smoothstep(0.3, 0.75, core));
    t = clamp(t + rim * 0.1, 0.0, 1.0);
    vec3 inkLight = vec3(0.47, 0.45, 0.43);
    vec3 inkDark = vec3(0.05, 0.05, 0.062);
    vec3 inkCol = mix(inkLight, inkDark, smoothstep(0.18, 0.92, t));
    vec3 ink = mix(paper, inkCol, smoothstep(0.0, 0.85, t));
    ink += grain * 0.02;
    col += ink * uW.y;
  }

  gl_FragColor = vec4(col, 1.0);
}
`

type RT = THREE.WebGLRenderTarget
type Double = { read: RT; write: RT; swap: () => void }

function makeRT(w: number, h: number, linear: boolean): RT {
  const f = linear ? THREE.LinearFilter : THREE.NearestFilter
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: f,
    magFilter: f,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  })
}
function makeDouble(w: number, h: number, linear: boolean): Double {
  const d: Double = {
    read: makeRT(w, h, linear),
    write: makeRT(w, h, linear),
    swap() {
      const t = d.read
      d.read = d.write
      d.write = t
    },
  }
  return d
}

function res(r: number, w: number, h: number) {
  let a = w / h
  if (a < 1) a = 1 / a
  const min = Math.round(r)
  const max = Math.round(r * a)
  return w > h ? { w: max, h: min } : { w: min, h: max }
}

export type FluidParams = { curl: number; velDiss: number; dyeDiss: number; pressure: number; threshold: number }

export class FluidSim {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh
  private mats: Record<string, THREE.ShaderMaterial> = {}
  private simRes: number
  private dyeRes: number
  private W = 0
  private H = 0
  sw = 0
  sh = 0
  dw = 0
  dh = 0
  velocity!: Double
  dye!: Double
  pressure!: Double
  divergence!: RT
  curl!: RT
  bloomA!: RT
  bloomB!: RT
  display: THREE.ShaderMaterial
  iterations = 20

  constructor(renderer: THREE.WebGLRenderer, simRes: number, dyeRes: number) {
    this.renderer = renderer
    this.simRes = simRes
    this.dyeRes = dyeRes
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: baseVert, fragmentShader: frag, uniforms: { texelSize: { value: new THREE.Vector2() }, ...uniforms }, depthTest: false, depthWrite: false })
    const tex = () => ({ value: null as THREE.Texture | null })
    this.mats.copy = mk(copyFrag, { uTexture: tex(), value: { value: 1 } })
    this.mats.splat = mk(splatFrag, { uTarget: tex(), aspectRatio: { value: 1 }, color: { value: new THREE.Vector3() }, point: { value: new THREE.Vector2() }, radius: { value: 0.0025 } })
    this.mats.advect = mk(advectFrag, { uVelocity: tex(), uSource: tex(), simTexel: { value: new THREE.Vector2() }, dt: { value: 0 }, dissipation: { value: 0 } })
    this.mats.divergence = mk(divergenceFrag, { uVelocity: tex() })
    this.mats.curl = mk(curlFrag, { uVelocity: tex() })
    this.mats.vorticity = mk(vorticityFrag, { uVelocity: tex(), uCurl: tex(), curl: { value: 0 }, dt: { value: 0 } })
    this.mats.pressure = mk(pressureFrag, { uPressure: tex(), uDivergence: tex() })
    this.mats.gradient = mk(gradientFrag, { uPressure: tex(), uVelocity: tex() })
    this.mats.prefilter = mk(prefilterFrag, { uTexture: tex(), threshold: { value: 0.2 } })
    this.mats.blur = mk(blurFrag, { uTexture: tex(), dir: { value: new THREE.Vector2() } })
    this.display = mk(displayFrag, {
      uDye: tex(),
      uBloom: tex(),
      uTexel: { value: new THREE.Vector2() },
      uW: { value: new THREE.Vector3(1, 0, 0) },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPx: { value: 1 },
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mats.copy)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  private blit(mat: THREE.ShaderMaterial, target: RT | null, texel?: { x: number; y: number }) {
    if (texel) (mat.uniforms.texelSize.value as THREE.Vector2).set(texel.x, texel.y)
    this.quad.material = mat
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.cam)
  }

  private copyInto(src: RT, dst: RT) {
    const m = this.mats.copy
    m.uniforms.uTexture.value = src.texture
    m.uniforms.value.value = 1
    this.blit(m, dst, { x: 1 / dst.width, y: 1 / dst.height })
  }

  /** (re)allocate targets for a drawing buffer of w×h, carrying velocity + dye over */
  resize(w: number, h: number) {
    if (w === this.W && h === this.H) return false
    this.W = w
    this.H = h
    const s = res(this.simRes, w, h)
    const d = res(this.dyeRes, w, h)
    const b = res(Math.max(64, Math.round(this.dyeRes / 4)), w, h)
    const oldV = this.velocity
    const oldD = this.dye
    this.velocity = makeDouble(s.w, s.h, true)
    this.dye = makeDouble(d.w, d.h, true)
    if (oldV) {
      this.copyInto(oldV.read, this.velocity.read)
      this.copyInto(oldD.read, this.dye.read)
      ;[oldV.read, oldV.write, oldD.read, oldD.write].forEach((t) => t.dispose())
      ;[this.pressure.read, this.pressure.write, this.divergence, this.curl, this.bloomA, this.bloomB].forEach((t) => t.dispose())
    }
    this.pressure = makeDouble(s.w, s.h, false)
    this.divergence = makeRT(s.w, s.h, false)
    this.curl = makeRT(s.w, s.h, false)
    this.bloomA = makeRT(b.w, b.h, true)
    this.bloomB = makeRT(b.w, b.h, true)
    this.sw = s.w
    this.sh = s.h
    this.dw = d.w
    this.dh = d.h
    return true
  }

  /** x, y in 0..1 (y up); dx, dy velocity; rgb dye; radius in Pavel units (0.25 ≈ default) */
  splat(x: number, y: number, dx: number, dy: number, r: number, g: number, b: number, radius: number) {
    const m = this.mats.splat
    const aspect = this.W / this.H
    m.uniforms.aspectRatio.value = aspect
    ;(m.uniforms.point.value as THREE.Vector2).set(x, y)
    m.uniforms.radius.value = (radius / 100) * (aspect > 1 ? aspect : 1)
    m.uniforms.uTarget.value = this.velocity.read.texture
    ;(m.uniforms.color.value as THREE.Vector3).set(dx, dy, 0)
    this.blit(m, this.velocity.write, { x: 1 / this.sw, y: 1 / this.sh })
    this.velocity.swap()
    m.uniforms.uTarget.value = this.dye.read.texture
    ;(m.uniforms.color.value as THREE.Vector3).set(r, g, b)
    this.blit(m, this.dye.write, { x: 1 / this.dw, y: 1 / this.dh })
    this.dye.swap()
  }

  step(dt: number, p: FluidParams) {
    const st = { x: 1 / this.sw, y: 1 / this.sh }
    const M = this.mats

    M.curl.uniforms.uVelocity.value = this.velocity.read.texture
    this.blit(M.curl, this.curl, st)

    M.vorticity.uniforms.uVelocity.value = this.velocity.read.texture
    M.vorticity.uniforms.uCurl.value = this.curl.texture
    M.vorticity.uniforms.curl.value = p.curl
    M.vorticity.uniforms.dt.value = dt
    this.blit(M.vorticity, this.velocity.write, st)
    this.velocity.swap()

    M.divergence.uniforms.uVelocity.value = this.velocity.read.texture
    this.blit(M.divergence, this.divergence, st)

    M.copy.uniforms.uTexture.value = this.pressure.read.texture
    M.copy.uniforms.value.value = p.pressure
    this.blit(M.copy, this.pressure.write, st)
    this.pressure.swap()

    M.pressure.uniforms.uDivergence.value = this.divergence.texture
    for (let i = 0; i < this.iterations; i++) {
      M.pressure.uniforms.uPressure.value = this.pressure.read.texture
      this.blit(M.pressure, this.pressure.write, st)
      this.pressure.swap()
    }

    M.gradient.uniforms.uPressure.value = this.pressure.read.texture
    M.gradient.uniforms.uVelocity.value = this.velocity.read.texture
    this.blit(M.gradient, this.velocity.write, st)
    this.velocity.swap()

    const a = M.advect
    ;(a.uniforms.simTexel.value as THREE.Vector2).set(st.x, st.y)
    a.uniforms.dt.value = dt
    a.uniforms.uVelocity.value = this.velocity.read.texture
    a.uniforms.uSource.value = this.velocity.read.texture
    a.uniforms.dissipation.value = p.velDiss
    this.blit(a, this.velocity.write, st)
    this.velocity.swap()

    a.uniforms.uVelocity.value = this.velocity.read.texture
    a.uniforms.uSource.value = this.dye.read.texture
    a.uniforms.dissipation.value = p.dyeDiss
    this.blit(a, this.dye.write, { x: 1 / this.dw, y: 1 / this.dh })
    this.dye.swap()

    // small blurred copy of the dye: glow for neon / aurora, wet halo for ink
    const bt = { x: 1 / this.bloomA.width, y: 1 / this.bloomA.height }
    M.prefilter.uniforms.uTexture.value = this.dye.read.texture
    M.prefilter.uniforms.threshold.value = p.threshold
    this.blit(M.prefilter, this.bloomA, bt)
    for (let i = 0; i < 2; i++) {
      const s = 1 + i * 1.5
      M.blur.uniforms.uTexture.value = this.bloomA.texture
      ;(M.blur.uniforms.dir.value as THREE.Vector2).set(bt.x * s, 0)
      this.blit(M.blur, this.bloomB, bt)
      M.blur.uniforms.uTexture.value = this.bloomB.texture
      ;(M.blur.uniforms.dir.value as THREE.Vector2).set(0, bt.y * s)
      this.blit(M.blur, this.bloomA, bt)
    }
  }

  render(time: number, dprInv: number) {
    const u = this.display.uniforms
    u.uDye.value = this.dye.read.texture
    u.uBloom.value = this.bloomA.texture
    ;(u.uTexel.value as THREE.Vector2).set(1 / this.dw, 1 / this.dh)
    ;(u.uRes.value as THREE.Vector2).set(this.W, this.H)
    u.uTime.value = time
    u.uPx.value = dprInv
    this.blit(this.display, null)
  }

  dispose() {
    ;[this.velocity.read, this.velocity.write, this.dye.read, this.dye.write, this.pressure.read, this.pressure.write, this.divergence, this.curl, this.bloomA, this.bloomB].forEach((t) => t?.dispose())
    Object.values(this.mats).forEach((m) => m.dispose())
    this.display.dispose()
    this.quad.geometry.dispose()
  }
}
