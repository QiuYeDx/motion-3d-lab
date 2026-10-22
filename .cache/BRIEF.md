# Brief for demo authors — motion-3d-lab

Project: `E:\workspace\AI工作区\motion-3d-lab` — a gallery of 3D creative demos for product / landing pages.
Stack: Vite 8, React 19, TypeScript 7 (`npx tsc -p .` from project root), three 0.186, @react-three/fiber 9,
@react-three/drei 10, @react-three/postprocessing 3, @react-three/rapier 2, motion 14 (`import ... from 'motion/react'`), maath.
Do NOT add new npm dependencies without saying so in your report (none should be needed). No network fonts / assets:
everything procedural (canvas textures with system fonts are fine).

## Your job
Replace the stub files you are assigned (each currently exports a `Todo` component) with a finished, polished demo.
The registry entry for each demo (`src/demos/registry.ts`) already exists — read it: the title/desc/tags/theme there
are the promise you must deliver (you may NOT edit registry.ts; if the desc no longer matches, say so in your report
with the replacement text).
Only edit/create files under your own demo paths (you may add a sibling helper file next to your demo, e.g.
`src/demos/shader/orbShader.ts`). Do NOT edit shared files (`src/lib/*`, `src/components/*`, `src/styles.css`,
registry, App) — other agents are working in parallel. Put demo-specific CSS in a `<style>` tag inside the demo
(prefix class names with a demo-specific prefix). If a shared change is truly needed, describe it in your report.

## Read these first (conventions to follow)
- `src/styles.css` — overlay kit: `.stage` (absolute full-size container; set its background), `.overlay`,
  `.hero-copy` (left column copy: `.kicker` with `<i/>` dot, `h1`, `p`, `.hero-actions`, `.btn`, `.btn.primary`),
  `.scrim` (soft local backdrop behind copy; set `--soft-bg`), `.dock` (bottom-centre glass control bar) with `.seg`
  buttons and `.dock-sep`, `.hint` (bottom-right small mono hint). `.demo-page.theme-dark` swaps `--fg/--fg-2/--glass`.
- `src/components/Seg.tsx` (segmented control w/ Motion layoutId), `src/components/BigLabel.tsx` (bottom-left
  big label that blur-swaps; used by particle demos).
- `src/lib/iso.tsx` — `IsoRig` orthographic true-isometric camera (fit, offset to make room for hero copy,
  mobileFit/mobileOffsetY; centres automatically when URL has `?poster`). Use `<Canvas orthographic ...>` with it.
- `src/lib/fit.ts` — `usePortraitScale()` to shrink centred perspective scenes on portrait phones.
- `src/lib/MorphCloud.tsx`, `src/lib/shapes.ts` — particle morph helpers.
- Reference demos: `src/demos/iso/FloatingIsle.tsx` (iso hero layout, Motion spring → useFrame),
  `src/demos/particles/ShapeMorph.tsx` (dark particle demo layout with BigLabel + dock),
  `src/demos/iso/LayerStack.tsx`, `src/demos/lab/ScrollStory.tsx`.

## Patterns
- Motion owns state/timelines (`useMotionValue`, `animate()`, `useSpring`); read `.get()` inside `useFrame` and write
  to uniforms / transforms — no React re-render per frame. DOM overlay uses `motion.*`, `AnimatePresence`, `layoutId`.
- Every demo should loop on its own (auto-play / ambient) AND have at least one meaningful interaction.
- `<Canvas dpr={[1, 2]} gl={{ antialias, alpha: true }}>`; the page background is set on `.stage`.
- No per-frame allocations in hot loops; dispose nothing manually unless you create raw GPU resources outside R3F.
- Clamp `dt` (e.g. `Math.min(dt, 1/30)`), handle tab switches gracefully.
- Layout: desktop copy sits on the left (≈ 460px column from `clamp(24px,6vw,96px)`), 3D on the right / centre;
  on phones (<760px) `.hero-copy` is bottom-anchored, so lift the 3D up (IsoRig mobileOffsetY, or your own offset).
  The top 72px is reserved for the floating demo chrome (back / title / prev-next chips) — keep it clear.
- UI copy is Chinese, short and specific (explain what the visitor sees / can do), like existing demos.
- Visual bar: this is a showcase — composition, palette and motion should feel designed, not a tech test.
  Avoid washed-out or muddy colours; check contrast of text over 3D (use `.scrim` if needed).

## Verify (required)
Dev server normally runs at http://localhost:5196 (HMR), but the app may stop it between turns. If it is unreachable,
start your OWN private one in the background on your assigned port and kill it when done:
`npx vite --port <your vite port> --strictPort` (run from the project root; it reads the same vite.config.ts).
Never stop a server you did not start.
Screenshot tool (HEADLESS Chrome via CDP, hardware GPU incl. WebGPU, throw-away profile; no window ever appears).
NEVER launch Microsoft Edge or a visible browser window for testing — the user's desktop gets interrupted. Don't use
the in-app browser pane for rendering checks either (it's hidden, so rAF is paused there):
```
cd E:/workspace/AI工作区/motion-3d-lab/.cache
CDP_PORT=<your port> PROFILE=<your profile> node --experimental-websocket shot.mjs shots-<you> 1440x900 2500 "name=http://localhost:5196/?<uniq>#/<demo-id>"
```
- Use the CDP_PORT / PROFILE you were given (other agents run concurrently). Use a unique `?query` per load.
- Real mouse input (needed to test R3F clicks/drags — synthetic dispatchEvent coords are wrong in this setup): append
  `||CLICKS:x,y@waitMs;x1,y1>x2,y2@waitMs` to the job (click, or drag from → to), run after the script.
- Optional per-job script after `|`: MUST be an async IIFE, e.g.
  `"name=URL|(async()=>{document.querySelector('.seg:nth-child(2)').click();await new Promise(r=>setTimeout(r,1500))})()"`
  A returned value is printed as `EVAL name ...`; console errors/exceptions are printed too. Ignore `ethereum` errors.
- Check desktop 1440x900 AND mobile 390x844, plus at least one mid-transition / after-interaction frame. Read the PNGs
  and actually look at them; iterate until it looks good. If an edit doesn't show up, `curl` the module from the dev
  server to confirm it was served.
- `npx tsc -p .` must pass for your files (errors in other agents' in-progress files can be ignored).

## Known pitfalls (learned by earlier agents)
- R3F 9: passing `uniforms={obj}` as a JSX prop on `<shaderMaterial>` copies scalar uniforms, so later
  `obj.uX.value = n` never reaches the GPU. Build `new THREE.ShaderMaterial({...})` in `useMemo` and pass
  `material={mat}` (see `useShaderMaterial` in `src/demos/shader/glsl.ts`, which you may import; it also has simplex noise).
- Additive blending onto a transparent (`alpha: true`) canvas writes alpha=1 → dark patches. Use an opaque canvas
  with an in-scene background, or custom blending.
- drei `<Html>` logs a StrictMode "synchronously unmount a root" warning per label; prefer your own DOM labels
  positioned from `useFrame` (project the 3D point, write `style.transform` directly).
- Add a sensible `?poster` look: the gallery poster is captured at 1280×800 with `?poster` in the URL and
  `body.poster` hiding `.overlay`, `.hint`, `.demo-chrome`. `IsoRig` centres itself for posters; custom rigs should
  check `POSTER` from `src/lib/iso.tsx` and centre the subject too.

## Report (final message, concise)
Per demo: what it shows, interactions, auto-loop, notable techniques, any limitations, and paths of 1–2 final
screenshots (desktop + mobile). Mention any shared-file change you'd recommend.

## Stylized-rendering demos (group `stylize`)
All 风格化渲染 demos share `src/lib/stylize.tsx` — READ IT FIRST. It renders the R3F scene to an off-screen
target (colour + depth, optional view-space normals with coverage in alpha) and redraws it with a full-screen
effect shader. Do NOT write your own FBO pipeline; use `<Stylize effect={fx} … />` (it takes over rendering at
useFrame priority 1). If the lib truly lacks something, say so in your report (don't edit it — others use it).
The older `src/demos/shader/HalftonePrint.tsx` is the visual bar (it predates the lib).

Each style is TWO files:
1. `src/demos/stylize/effects/<name>.ts` — the reusable effect, no React:
   `export function create<Name>Effect(): StylizeEffect` (fresh uniforms per call; glyph/palette textures built
   from canvas inside), with defaults that look good on ANY reasonable lit scene (another demo — the style
   switcher — will import it and drive it on a different scene without touching its uniforms except via the
   modes you expose). Also export `<name>Meta = { title, en, background /* scene clear colour */, theme: 'light'|'dark' }`
   and, if it has modes, a typed setter, e.g. `setAsciiMode(fx, 'braille')`, plus the list of modes
   (`asciiModes: { id, label }[]`) so other demos can build a Seg from it. Mode switches inside one effect should
   be smooth where possible (crossfade a uniform) — the wipe between different effects is handled by the lib.
   GLSL defines `vec3 stylize(vec2 px)` (px = device pixels) and uses the header helpers (sceneAt, normalAt,
   coverageAt, depthAt, luma, hash12, uTime, uDpr, uRes, uSceneRes). Size cells/lines in CSS px × uDpr so the look
   is the same at DPR 1 and 2. Animate with `uTime` or the effect's `update(dt)` hook, never by re-rendering React.
2. `src/demos/stylize/<Name>.tsx` — the showcase page: its own scene composed FOR the style (subject, lighting,
   motion that shows the technique off), hero copy, dock with the modes and 1–2 parameters, a "原图" comparison
   affordance (e.g. press-and-hold or a draggable split using `prev={createOriginalEffect()}` + `wipe`, or a lens),
   drag-to-rotate with Motion inertia, auto-play when idle, `?poster`.
Scene lighting matters a lot for these looks: strong key light + clear value structure + readable silhouettes.
Additions (later batch):
- `effect.update(dt, { dpr, width, height })` now receives the real pixel ratio and drawing-buffer size.
- Reuse `src/demos/stylize/OriginalSplit.tsx` (`useOriginalSplit()` + `<OriginalSplit>`) for the 原图 split so every
  stylize page behaves the same. Existing pages to study: `AsciiArt.tsx`, `PencilSketch.tsx`, `OneBitDither.tsx`,
  `Engraving.tsx`, `TileMosaic.tsx` and their `effects/*.ts`.
- Your effect will also be added to the style switcher (`StyleSwitcher.tsx`, a red torus knot + yellow ball + blue cube
  + purple cone + teal ring still life on a cream disc). Make sure the default look is good on that scene too — you may
  screenshot it by temporarily rendering your effect there in a scratch page, but don't edit StyleSwitcher/styles.ts.
- On ANGLE/D3D a big multi-mode shader can fail to LINK with an empty log: pick the mode first and run each expensive
  routine once per pixel instead of inlining it per mode.

## Shader compile cost (MANDATORY for stylize effects)
The lib compiles effects asynchronously (renderer.compileAsync against the screen target) and shows the plain render
until ready, then wipes in; your `update()` only starts ticking once the effect is visible. Still, a shader that
takes seconds for ANGLE/D3D11 (HLSL/FXC) to compile delays your style and, worse, can block the main thread.
Rules: choose the mode first and call each expensive routine from ONE call site per pixel; no derivative ops
(fwidth/dFdx, implicit-LOD texture2D) inside loops or per-mode branches — hoist them, use textureLod/texelFetch;
no dynamically indexed uniform arrays (put palettes in a small DataTexture + texelFetch); keep loops rollable.
Measure first-load stall like this (must be < 300 ms): job URL = the GALLERY (`http://localhost:5196/?<uniq>`) with
script `(async()=>{await new Promise(r=>setTimeout(r,1500));const g=[];let l=performance.now();location.hash='/<demo-id>';const t0=l;while(performance.now()-t0<9000){await new Promise(r=>requestAnimationFrame(r));const n=performance.now();g.push(n-l);l=n}return Math.max(...g)})()`
and report the number.
- If you use `usePrecompiled` (src/demos/stylize/precompile.ts) with shadows, use `<Canvas shadows="percentage">`
  (three r186 swaps the default PCFSoft for PCF on the first shadow render, invalidating precompiled programs).
- The style switcher's still life is one big lit scene with a cream floor disc; make sure your effect's default mode
  reads well there too (report how it looks).
- Effects are created lazily by the switcher, so keep `create<Name>Effect()` reasonably cheap (< ~60 ms): build big
  CPU textures incrementally or cache them at module level after first creation.
- Use a UNIQUE scratch-file name prefixed with your PROFILE (e.g. `_p-sty19Still.tsx`) if you make a temporary test
  page, and delete it before reporting.

## Non-stylize demos (iso / particle / shader / lab) — later batches
- Same first-load budget: < 300 ms max frame gap, measured from the gallery with the script in "Shader compile cost".
  Heavy custom shaders: compile them with `renderer.compileAsync` against the SCREEN target before first draw (see
  how `src/lib/stylize.tsx` `prepare()` and `src/demos/shader/HalftonePrint.tsx` do it), show a cheap fallback until
  ready. Heavy lit scenes: `usePrecompiled` from `src/demos/stylize/precompile.ts` (+ `shadows="percentage"`).
  Heavy CPU setup (geometry generation, textures): spread across frames / after mount, never all in the first frame.
- Raymarched full-screen shaders: render at reduced resolution (e.g. 0.5–0.75 of the drawing buffer, upscale) and
  adapt with drei `PerformanceMonitor`; bounded step counts; keep 60 fps on a mid GPU at 1440×900.
- Every page needs a good `?poster` look (centred subject, `body.poster` hides overlay/hint/chrome).

## Learned in batch 7 (2026-10-22)
- Canvas textures: `getContext('2d', { willReadFrequently: true })` (software canvas) — the default GPU canvas cost
  ~200 ms on the first texture upload here.
- `renderer.compile()` collects lights with `traverseVisible`: lights inside a hidden subject are left out, programs get
  compiled for the wrong light count and relink synchronously on first visible draw. Keep lights outside the hidden
  subject. Under StrictMode, don't dispose a PMREMGenerator while its programs are still linking (dispose after the
  compile job settles) — see `src/demos/lab/stagedStudio.ts`.
- Heavy static iso scenes: bake plain-coloured meshes into one vertex-coloured mesh and mount in stages
  (`src/demos/iso/staticMerge.ts`: `useBakeStatic`, `useStagedWarmup`).
- `useScreenWarmup` (isoWarmup.ts) can't coexist with EffectComposer (both render at priority 1); see the layer-based
  Warmup in `src/demos/iso/DataCenter.tsx` for bloom scenes.
- drei `ContactShadows` drew nothing in one agent's setup; blurred blob shadows per piece are a reliable fallback.
- Polished metal in the black lab studio env reads as dark "faces" — give metal a surround (see PendulumWave's
  `PENDULUM_ENV`). Reflected window panes with a cross mullion read as a logo — avoid.
