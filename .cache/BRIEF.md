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
Screenshot tool (off-screen Edge via CDP; the in-app browser pane is hidden so rAF is paused there — don't use it):
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
