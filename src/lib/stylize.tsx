import { useFrame, useThree } from '@react-three/fiber'
import type { MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

/*
 * Stylized-rendering pipeline shared by the 风格化渲染 demos.
 *
 *   1. the R3F scene is rendered into an off-screen target (colour + depth, optional view-space normals)
 *   2. a full-screen "effect" shader redraws it to the screen — dots, glyphs, hatching, pixels …
 *
 * An effect is plain data, so one scene can swap between effects and wipe from one to another:
 *
 *   const fx = useMemo(() => createAsciiEffect(), [])
 *   <Stylize effect={fx} />
 *
 * Effect GLSL defines `vec3 stylize(vec2 px)` (px = gl_FragCoord.xy in device pixels) and returns the final
 * sRGB colour. The header below declares the shared uniforms and helpers it can use.
 */

export type StylizeEffect = {
  /** GLSL that defines `vec3 stylize(vec2 px)`; may declare its own uniforms, functions, defines */
  frag: string
  /** the effect's own uniforms (create them per instance — effects are usually made by a factory) */
  uniforms?: Record<string, THREE.IUniform>
  /** render a view-space normal buffer (needed for edge detection / direction-aware strokes) */
  normals?: boolean
  /** scene target resolution relative to the drawing buffer (pixel-art effects use e.g. 1/6) */
  scale?: number
  /** texture filter for the scene target; 'nearest' for pixel art */
  filter?: 'linear' | 'nearest'
  /** scene clear colour this effect wants (overrides the <Stylize background> prop) */
  background?: THREE.ColorRepresentation
  /** per-frame hook for effects that animate their own uniforms (called for every effect being drawn) */
  update?: (dt: number, ctx: { dpr: number; width: number; height: number }) => void
}

export const STYLIZE_HEADER = /* glsl */ `
precision highp float;
uniform sampler2D tScene;   // scene colour (linear, un-tonemapped)
uniform sampler2D tNormal;  // view-space normal * 0.5 + 0.5, alpha 0 where empty (only if effect.normals)
uniform sampler2D tDepth;   // depth buffer
uniform vec2 uRes;          // drawing buffer size, device px
uniform vec2 uSceneRes;     // scene target size, px
uniform float uDpr;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uOrtho;       // 1 for orthographic cameras
uniform float uExposure;
uniform vec2 uClip;         // effect only drawn where uClip.x <= wipeCoord(px) < uClip.y
varying vec2 vUv;

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** scene colour (display-referred sRGB, 0..1) at device px */
vec3 sceneAt(vec2 px) {
  vec3 c = texture2D(tScene, px / uRes).rgb * uExposure;
  c = c / (1.0 + c * 0.12); // gentle shoulder so highlights don't clip flat
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
/** same, sampled at a uv (0..1) */
vec3 sceneUv(vec2 uv) { return sceneAt(uv * uRes); }
/** view-space normal (-1..1); vec3(0) where nothing was drawn */
vec3 normalAt(vec2 px) {
  vec4 n = texture2D(tNormal, px / uRes);
  return n.a < 0.5 ? vec3(0.0) : normalize(n.rgb * 2.0 - 1.0);
}
/** 1 where geometry was drawn, 0 on the background */
float coverageAt(vec2 px) { return texture2D(tNormal, px / uRes).a; }
/** linear view depth in world units (uFar on the background) */
float depthAt(vec2 px) {
  float d = texture2D(tDepth, px / uRes).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
/** coordinate used by wipes: 0 at the left edge → 1 at the right, slightly diagonal */
float wipeCoord(vec2 px) { return (px.x / uRes.x) * 0.84 + (1.0 - px.y / uRes.y) * 0.16; }
`

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const MAIN = /* glsl */ `
void main() {
  vec2 px = gl_FragCoord.xy;
  float e = wipeCoord(px);
  if (e < uClip.x || e >= uClip.y) discard;
  gl_FragColor = vec4(stylize(px), 1.0);
}
`

/** shows the scene untouched — for split-screen "before / after" comparisons */
export const createOriginalEffect = (): StylizeEffect => ({
  frag: /* glsl */ `vec3 stylize(vec2 px) { return sceneAt(px); }`,
})

type Shared = {
  tScene: THREE.IUniform<THREE.Texture | null>
  tNormal: THREE.IUniform<THREE.Texture | null>
  tDepth: THREE.IUniform<THREE.Texture | null>
  uRes: THREE.IUniform<THREE.Vector2>
  uSceneRes: THREE.IUniform<THREE.Vector2>
  uDpr: THREE.IUniform<number>
  uTime: THREE.IUniform<number>
  uNear: THREE.IUniform<number>
  uFar: THREE.IUniform<number>
  uOrtho: THREE.IUniform<number>
  uExposure: THREE.IUniform<number>
}

function compile(effect: StylizeEffect, shared: Shared) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: STYLIZE_HEADER + '\n' + effect.frag + '\n' + MAIN,
    // shared uniform objects are referenced, not copied, so one update reaches every effect
    uniforms: { ...shared, ...(effect.uniforms ?? {}), uClip: { value: new THREE.Vector2(-1, 2) } },
    depthTest: false,
    depthWrite: false,
  })
}

type Num = number | MotionValue<number>
const val = (v: Num | undefined, d: number) => (v === undefined ? d : typeof v === 'number' ? v : v.get())

export type StylizeProps = {
  effect: StylizeEffect
  /** the effect being wiped away; drawn where wipeCoord > wipe */
  prev?: StylizeEffect | null
  /** 0..1 progress of `effect` covering `prev` (left → right) */
  wipe?: Num
  /** scene clear colour (what the effect sees as "background") */
  background?: THREE.ColorRepresentation
  exposure?: Num
  /** MSAA samples on the scene target */
  samples?: number
  /** called after the scene pass, before the effect pass — set your effect uniforms here */
  onFrame?: (dt: number) => void
  /**
   * effects that may be shown later: their shaders are compiled in the background (KHR_parallel_shader_compile
   * via renderer.compileAsync), one at a time, so the first switch to a heavy effect doesn't freeze the page
   */
  preload?: StylizeEffect[]
}

/**
 * Takes over rendering (useFrame priority 1). Put it anywhere inside <Canvas>; everything else in the
 * scene is what gets stylized.
 */
export function Stylize({ effect, prev, wipe, background = '#ffffff', exposure, samples = 4, onFrame, preload }: StylizeProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  const R = useMemo(() => {
    const makeTarget = (withDepth: boolean) => {
      const t = new THREE.WebGLRenderTarget(2, 2, {
        type: THREE.HalfFloatType,
        samples,
        depthBuffer: true,
      })
      if (withDepth) t.depthTexture = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType)
      return t
    }
    const shared: Shared = {
      tScene: { value: null },
      tNormal: { value: null },
      tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSceneRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uOrtho: { value: 0 },
      uExposure: { value: 1 },
    }
    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1)
    blank.needsUpdate = true
    const geo = new THREE.BufferGeometry()
    // one oversized triangle covers the screen
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    const quad = new THREE.Mesh(geo)
    quad.frustumCulled = false
    const post = new THREE.Scene()
    post.add(quad)
    return {
      color: makeTarget(true),
      colorPrev: null as THREE.WebGLRenderTarget | null,
      normal: null as THREE.WebGLRenderTarget | null,
      makeTarget,
      normalMat: new THREE.MeshNormalMaterial(),
      shared,
      blank,
      geo,
      quad,
      post,
      cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      mats: new Map<StylizeEffect, THREE.ShaderMaterial>(),
      buf: new THREE.Vector2(),
      bgA: new THREE.Color(),
      bgB: new THREE.Color(),
      clear: new THREE.Color(),
      t: 0,
    }
  }, [samples])

  useEffect(
    () => () => {
      R.color.dispose()
      R.colorPrev?.dispose()
      R.normal?.dispose()
      R.normalMat.dispose()
      R.blank.dispose()
      R.geo.dispose()
      R.mats.forEach((m) => m.dispose())
    },
    [R],
  )

  const matFor = (fx: StylizeEffect) => {
    let m = R.mats.get(fx)
    if (!m) {
      m = compile(fx, R.shared)
      R.mats.set(fx, m)
    }
    return m
  }

  // drop materials of effects that are no longer in use (preloaded ones count as in use)
  const live = useRef(new Set<StylizeEffect>())
  live.current = new Set([effect, ...(prev ? [prev] : []), ...(preload ?? [])])

  useEffect(() => {
    if (!preload?.length) return
    let cancelled = false
    ;(async () => {
      for (const fx of preload) {
        if (cancelled) return
        if (R.mats.has(fx)) continue
        const m = matFor(fx)
        const keep = R.quad.material
        R.quad.material = m
        try {
          await gl.compileAsync(R.post, R.cam)
        } catch {
          /* compile errors surface when the effect is drawn */
        }
        R.quad.material = keep
        // let a few frames through between compiles
        await new Promise((r) => setTimeout(r, 120))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preload, R, gl])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    R.t += dt
    const s = R.shared
    const needNormals = effect.normals || prev?.normals
    // two effects on screen at once: render at the finer of their resolutions (low-res effects snap to
    // their own pixel grid, so they still look right; the other side stays sharp)
    const scale = Math.max(effect.scale ?? 1, prev?.scale ?? 0)
    const nearest = (effect.filter ?? prev?.filter) === 'nearest'

    gl.getDrawingBufferSize(R.buf)
    const w = Math.max(2, Math.round(R.buf.x * scale))
    const h = Math.max(2, Math.round(R.buf.y * scale))
    for (const t of [R.color, R.colorPrev, R.normal]) {
      if (!t) continue
      if (t.width !== w || t.height !== h) t.setSize(w, h)
      const f = nearest ? THREE.NearestFilter : THREE.LinearFilter
      if (t.texture.magFilter !== f) {
        t.texture.magFilter = f
        t.texture.minFilter = f
        t.texture.needsUpdate = true
      }
    }

    const prevClear = gl.getClearColor(R.clear)
    const prevAlpha = gl.getClearAlpha()

    /* 1 · scene colour + depth (a second pass when the outgoing effect wants another background) */
    const bgA = R.bgA.set(effect.background ?? background)
    gl.setRenderTarget(R.color)
    gl.setClearColor(bgA, 1)
    gl.clear(true, true, false)
    gl.render(scene, camera)
    const pPrev = THREE.MathUtils.clamp(val(wipe, 1), 0, 1)
    let prevTarget = R.color
    if (prev && pPrev < 1) {
      const bgB = R.bgB.set(prev.background ?? background)
      if (bgB.getHex() !== bgA.getHex()) {
        if (!R.colorPrev) {
          R.colorPrev = R.makeTarget(true)
          R.colorPrev.setSize(w, h)
        }
        gl.setRenderTarget(R.colorPrev)
        gl.setClearColor(bgB, 1)
        gl.clear(true, true, false)
        gl.render(scene, camera)
        prevTarget = R.colorPrev
      }
    }

    /* 1b · view-space normals (alpha marks coverage) */
    if (needNormals) {
      if (!R.normal) {
        R.normal = R.makeTarget(false)
        R.normal.setSize(w, h)
      }
      const bg = scene.background
      scene.background = null
      scene.overrideMaterial = R.normalMat
      gl.setRenderTarget(R.normal)
      gl.setClearColor(0x8080ff, 0)
      gl.clear(true, true, false)
      gl.render(scene, camera)
      scene.overrideMaterial = null
      scene.background = bg
    }

    /* 2 · effect pass(es) → screen */
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera
    s.tScene.value = R.color.texture
    s.tDepth.value = R.color.depthTexture
    s.tNormal.value = needNormals && R.normal ? R.normal.texture : R.blank
    s.uRes.value.copy(R.buf)
    s.uSceneRes.value.set(w, h)
    s.uDpr.value = gl.getPixelRatio()
    s.uTime.value = R.t
    s.uNear.value = cam.near
    s.uFar.value = cam.far
    s.uOrtho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0
    s.uExposure.value = val(exposure, 1)
    const ctx = { dpr: gl.getPixelRatio(), width: R.buf.x, height: R.buf.y }
    effect.update?.(dt, ctx)
    if (prev && prev !== effect) prev.update?.(dt, ctx)
    onFrame?.(dt)

    gl.setRenderTarget(null)
    gl.setClearColor(bgA, 1)
    gl.clear(true, true, false)
    const p = THREE.MathUtils.clamp(val(wipe, 1), 0, 1)
    // the two halves of a wipe are separate draws — don't let the renderer clear between them
    const autoClear = gl.autoClear
    gl.autoClear = false
    const drawOne = (fx: StylizeEffect, lo: number, hi: number, target = R.color) => {
      s.tScene.value = target.texture
      s.tDepth.value = target.depthTexture
      const m = matFor(fx)
      m.uniforms.uClip.value.set(lo, hi)
      R.quad.material = m
      gl.render(R.post, R.cam)
    }
    if (prev && p < 1) {
      drawOne(prev, p, 2, prevTarget)
      if (p > 0) drawOne(effect, -1, p)
    } else {
      drawOne(effect, -1, 2)
    }

    gl.autoClear = autoClear
    gl.setClearColor(prevClear, prevAlpha)
    R.mats.forEach((m, fx) => {
      if (!live.current.has(fx)) {
        m.dispose()
        R.mats.delete(fx)
      }
    })
  }, 1)

  return null
}
