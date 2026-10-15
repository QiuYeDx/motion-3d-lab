import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-transform-D6WS83kB.js";import{t as a}from"./use-motion-value-CIZAIwyH.js";import{n as o,r as s}from"./index-uImfd-0P.js";import{Ft as c,Jt as l,Mt as u,St as d,bn as f,dt as p,gn as m,h,pt as g,qt as _,rt as v,u as y,yt as b}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as x}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as S}from"./iso-C377rVhz.js";import{t as C}from"./Seg-BfWvO_Xs.js";import{t as w}from"./glsl-CTWV-b_3.js";var T=e(t(),1),E=n(),D=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,O=.5,k=[{key:`cmyk`,zh:`CMYK 半调`,short:`CMYK`,spec:`C 15° · M 75° · Y 0° · K 45°`,inks:[{name:`C`,hex:`#00a0e0`},{name:`M`,hex:`#e8007f`},{name:`Y`,hex:`#ffe500`},{name:`K`,hex:`#231f20`}],paper:`#f6f2e8`},{key:`riso`,zh:`Riso 双色`,short:`Riso`,spec:`Fluo Pink 75° · Blue 15°`,inks:[{name:`P`,hex:`#ff48b0`},{name:`B`,hex:`#0078bf`}],paper:`#f3ede0`},{key:`mono`,zh:`网点单色`,short:`单色`,spec:`K 45° · Newsprint`,inks:[{name:`K`,hex:`#1c1b1a`}],paper:`#e8e1cf`}],A=[{zh:`细`,css:5},{zh:`中`,css:8},{zh:`粗`,css:13}],j=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,M=`
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;      // drawing-buffer size (device px)
uniform float uDpr;
uniform float uCell;    // dot cell, CSS px
uniform float uFbo;     // scene target scale
uniform float uMis;     // misregistration amount 0..1
uniform float uTime;
uniform float uWipe;
uniform int uModeA;
uniform int uModeB;

${w}

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 sceneAt(vec2 p, float cell) {
  float lod = log2(max(cell * uFbo, 1.0)) - 0.6;
  vec3 c = textureLod(tScene, p / uRes, lod).rgb;
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}

// AM screen with a cosine spot: round dots → checkerboard at 50% → round holes. p, cell in device px.
float screen(vec2 p, float ang, float cell, float v, float rough) {
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, s, -s, c) * p / cell;
  float spot = 0.5 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  v = clamp(v, 0.0, 1.0);
  v = v + 0.78 * v * (1.0 - v) * (1.0 - 2.0 * v); // spot area → tone
  v = v + 0.07 * v * (1.0 - v);                    // dot gain
  float w = fwidth(spot) * 0.7;
  // threshold runs from just above the spot's peak (no ink) to just below its trough (solid)
  float T = mix(1.0 + 1.3 * w, -1.0 - 1.3 * w, v) + rough * min(1.0, v * 10.0) * min(1.0, (1.0 - v) * 10.0);
  return smoothstep(T - w, T + w, spot);
}

// ragged dot edges: ink wicks into the fibres (CSS-px scale so it looks the same at any DPR)
float roughAt(vec2 cp, float seed) {
  return (snoise(vec3(cp * 0.55, seed)) * 0.55 + snoise(vec3(cp * 2.3, seed + 11.0)) * 0.4) * 0.17;
}

vec3 paperAt(vec2 cp, vec3 base) {
  float blotch = snoise(vec3(cp * 0.0028, 9.0));
  float c1 = cos(0.35), s1 = sin(0.35);
  float c2 = cos(-1.2), s2 = sin(-1.2);
  vec2 r1 = mat2(c1, s1, -s1, c1) * cp;
  vec2 r2 = mat2(c2, s2, -s2, c2) * cp;
  float f1 = smoothstep(0.62, 0.95, snoise(vec3(r1 * vec2(0.012, 0.21), 1.0)));
  float f2 = smoothstep(0.66, 0.97, snoise(vec3(r2 * vec2(0.016, 0.24), 5.0)));
  float f3 = smoothstep(0.7, 0.98, snoise(vec3(r1 * vec2(0.03, 0.4), 7.0)));
  float grain = hash12(floor(cp)) - 0.5;
  vec3 c = base * (1.0 - 0.028 * blotch - 0.022 * grain);
  c -= vec3(0.05, 0.05, 0.045) * (f1 * 0.6 + f2 * 0.45);
  c += vec3(0.03) * f3;
  return c;
}

float mottle(vec2 cp, float seed) { return 0.86 + 0.14 * (snoise(vec3(cp * 0.018, seed)) * 0.5 + 0.5); }

vec2 drift(float i) {
  return vec2(sin(uTime * 0.7 + i * 2.1), cos(uTime * 0.55 + i * 1.3)) * 0.9;
}

vec3 printCMYK(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr;
  float m = uMis * uDpr * (0.6 + uCell / 16.0);
  vec2 oC = (vec2(2.6, -1.6) + drift(0.0)) * m;
  vec2 oM = (vec2(-2.1, 2.4) + drift(1.0)) * m;
  vec2 oY = (vec2(3.2, 2.8) + drift(2.0)) * m;
  vec3 sC = sceneAt(p - oC, cell);
  vec3 sM = sceneAt(p - oM, cell);
  vec3 sY = sceneAt(p - oY, cell);
  vec3 sK = sceneAt(p, cell);
  // separation with a little grey-component replacement
  float c = 1.0 - sC.r, mg = 1.0 - sM.g, y = 1.0 - sY.b;
  vec3 kq = 1.0 - sK;
  float kmin = min(kq.r, min(kq.g, kq.b));
  float k = smoothstep(0.3, 0.92, kmin) * kmin;
  c = max(c - k * 0.75, 0.0);
  mg = max(mg - k * 0.75, 0.0);
  y = max(y - k * 0.75, 0.0);
  float dC = screen(p - oC, radians(15.0), cell, c, roughAt(cp, 1.0)) * mottle(cp, 1.0);
  float dM = screen(p - oM, radians(75.0), cell, mg, roughAt(cp, 2.0)) * mottle(cp, 2.0);
  float dY = screen(p - oY, 0.0, cell, y, roughAt(cp, 3.0)) * mottle(cp, 3.0);
  float dK = screen(p, radians(45.0), cell, k, roughAt(cp, 4.0)) * mottle(cp, 4.0);
  vec3 col = paperAt(cp, vec3(0.965, 0.95, 0.91));
  col *= mix(vec3(1.0), vec3(0.0, 0.63, 0.88), dC);
  col *= mix(vec3(1.0), vec3(0.91, 0.0, 0.5), dM);
  col *= mix(vec3(1.0), vec3(1.0, 0.9, 0.0), dY);
  col *= mix(vec3(1.0), vec3(0.14, 0.12, 0.13), dK);
  return col;
}

vec2 risoSep(vec3 c) {
  // least-squares fit of the colour's optical density with the two inks' densities
  vec3 P = vec3(1.0, 0.28, 0.69);
  vec3 B = vec3(0.0, 0.47, 0.75);
  vec3 dP = -log(max(P, 0.04));
  vec3 dB = -log(max(B, 0.04));
  vec3 D = -log(max(c, 0.04));
  float a11 = dot(dP, dP), a12 = dot(dP, dB), a22 = dot(dB, dB);
  float det = a11 * a22 - a12 * a12;
  float a = (a22 * dot(dP, D) - a12 * dot(dB, D)) / det;
  float b = (a11 * dot(dB, D) - a12 * dot(dP, D)) / det;
  return clamp(vec2(a, b), 0.0, 1.0);
}

vec3 printRiso(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.1;
  float m = uDpr * (0.6 + uCell / 16.0);
  // a riso drum is never quite square: a baseline offset, plus the misregistration control
  vec2 oP = (vec2(1.2, -0.8) * 0.6 + (vec2(-3.2, 2.2) + drift(5.0)) * uMis) * m;
  vec2 oB = (vec2(-0.8, 0.6) * 0.6 + (vec2(2.6, -2.6) + drift(6.0)) * uMis) * m;
  float a = risoSep(sceneAt(p - oP, cell)).x;
  float b = risoSep(sceneAt(p - oB, cell)).y;
  float grain = hash12(floor(p / max(uDpr * 0.75, 1.0)));
  float dP = screen(p - oP, radians(75.0), cell, a * 1.05, roughAt(cp, 6.0) * 1.4) * (0.78 + 0.22 * grain) * mottle(cp, 6.0);
  float dB = screen(p - oB, radians(15.0), cell, b, roughAt(cp, 7.0) * 1.4) * (0.78 + 0.22 * hash12(floor(p / max(uDpr * 0.75, 1.0)) + 9.7)) * mottle(cp, 7.0);
  vec3 col = paperAt(cp, vec3(0.953, 0.93, 0.878));
  col *= mix(vec3(1.0), vec3(1.0, 0.28, 0.69), dP * 0.95);
  col *= mix(vec3(1.0), vec3(0.0, 0.47, 0.75), dB * 0.92);
  return col;
}

vec3 printMono(vec2 p) {
  vec2 cp = p / uDpr;
  float cell = uCell * uDpr * 1.05;
  vec3 c = sceneAt(p, cell);
  float v = 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
  v = smoothstep(0.1, 0.9, v); // newsprint: light tints drop out, shadows plug up
  float d = screen(p, radians(45.0), cell, v, roughAt(cp, 8.0) * 1.2) * mottle(cp, 8.0);
  vec3 col = paperAt(cp, vec3(0.91, 0.882, 0.812));
  col *= mix(vec3(1.0), vec3(0.11, 0.105, 0.1), d);
  return col;
}

vec3 printMode(int mode, vec2 p) {
  if (mode == 0) return printCMYK(p);
  if (mode == 1) return printRiso(p);
  return printMono(p);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float e = (p.x / uRes.x) * 0.82 + (1.0 - p.y / uRes.y) * 0.18;
  float side = smoothstep(uWipe - 0.002, uWipe + 0.002, e); // 1 = old sheet
  vec3 col = vec3(0.0);
  if (side > 0.0) col += printMode(uModeA, p) * side;
  if (side < 1.0) col += printMode(uModeB, p) * (1.0 - side);
  // the squeegee: a soft shadow line riding the wipe edge
  if (uWipe > 0.0 && uWipe < 1.0) col *= 1.0 - 0.14 * exp(-abs(e - uWipe) * 260.0);
  gl_FragColor = vec4(col, 1.0);
}
`;function N({rx:e,ry:t,cell:n,mis:r,wipe:i,modes:a}){let o=h(e=>e.gl),s=h(e=>e.scene),b=h(e=>e.camera),x=h(e=>e.size),C=h(e=>e.viewport),w=(0,T.useMemo)(()=>{let e=new f(2,2,{type:v,minFilter:g,magFilter:p,generateMipmaps:!0,depthBuffer:!0}),t=new l({vertexShader:j,fragmentShader:M,uniforms:{tScene:{value:e.texture},uRes:{value:new m(1,1)},uDpr:{value:1},uCell:{value:8},uFbo:{value:O},uMis:{value:0},uTime:{value:0},uWipe:{value:0},uModeA:{value:0},uModeB:{value:0}},depthTest:!1,depthWrite:!1}),n=new c(2,2),r=new d(n,t);r.frustumCulled=!1;let i=new _;return i.add(r),{fbo:e,mat:t,geo:n,post:i,cam:new u(-1,1,1,-1,0,1),buf:new m}},[]);(0,T.useEffect)(()=>()=>{w.fbo.dispose(),w.mat.dispose(),w.geo.dispose()},[w]);let D=(0,T.useRef)(!1);(0,T.useEffect)(()=>{let e=!0,t=o.getRenderTarget();return o.setRenderTarget(null),o.compileAsync(w.post,w.cam).catch(()=>{}).then(()=>{e&&(D.current=!0)}),o.setRenderTarget(t),()=>{e=!1}},[w,o]);let k=(0,T.useRef)(null),A=(0,T.useRef)(null),N=(0,T.useRef)({t:0,auto:S?-.4:0});return y((c,l)=>{let u=Math.min(l,1/30),d=N.current;d.t+=u,d.auto+=u*.22;let f=x.width<760;if(k.current){let e=C.width,t=C.height,n=f?Math.min(.92,e/5.6):Math.min(1,t/6.2);k.current.scale.setScalar(S?n*1.2:n),k.current.position.set(S||f?0:e*.17,S?0:f?t*.13:0,0)}if(A.current&&A.current.rotation.set(e.get()+Math.sin(d.t*.3)*.06,d.auto+t.get(),0),!D.current){o.setRenderTarget(null),o.setClearColor(16184040,1),o.clear(!0,!0,!1),o.render(s,b);return}o.getDrawingBufferSize(w.buf);let p=Math.max(2,Math.round(w.buf.x*O)),m=Math.max(2,Math.round(w.buf.y*O));(w.fbo.width!==p||w.fbo.height!==m)&&w.fbo.setSize(p,m),o.setRenderTarget(w.fbo),o.setClearColor(16777215,1),o.clear(!0,!0,!1),o.render(s,b);let h=w.mat.uniforms;h.uRes.value.copy(w.buf),h.uDpr.value=o.getPixelRatio(),h.uCell.value=n.get(),h.uMis.value=r.get(),h.uTime.value=d.t,h.uWipe.value=i.get(),h.uModeA.value=a.current.a,h.uModeB.value=a.current.b,o.setRenderTarget(null),o.render(w.post,w.cam)},1),(0,E.jsxs)(E.Fragment,{children:[(0,E.jsx)(`ambientLight`,{intensity:.35}),(0,E.jsx)(`directionalLight`,{position:[-4.5,5.5,5],intensity:3.4,castShadow:!0,"shadow-mapSize":[1024,1024],"shadow-camera-left":-5,"shadow-camera-right":5,"shadow-camera-top":5,"shadow-camera-bottom":-5,"shadow-bias":-5e-4}),(0,E.jsx)(`directionalLight`,{position:[5,-1,-4],intensity:.9}),(0,E.jsxs)(`group`,{ref:k,children:[(0,E.jsxs)(`mesh`,{position:[.35,.15,-2.6],receiveShadow:!0,children:[(0,E.jsx)(`circleGeometry`,{args:[2.7,96]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#ffd9b8`,roughness:1})]}),(0,E.jsxs)(`group`,{ref:A,children:[(0,E.jsxs)(`mesh`,{castShadow:!0,receiveShadow:!0,children:[(0,E.jsx)(`torusKnotGeometry`,{args:[.95,.32,260,36,2,3]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#ff4a5a`,roughness:.38})]}),(0,E.jsxs)(`mesh`,{position:[1.75,1.05,.45],castShadow:!0,receiveShadow:!0,children:[(0,E.jsx)(`sphereGeometry`,{args:[.5,48,32]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#ffc21a`,roughness:.35})]}),(0,E.jsxs)(`mesh`,{position:[-1.75,-1,.7],rotation:[.6,.7,.2],castShadow:!0,receiveShadow:!0,children:[(0,E.jsx)(`boxGeometry`,{args:[.8,.8,.8]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#1f7fff`,roughness:.5})]}),(0,E.jsxs)(`mesh`,{position:[-1.35,1.35,-.5],rotation:[1.1,.3,0],castShadow:!0,receiveShadow:!0,children:[(0,E.jsx)(`torusGeometry`,{args:[.36,.12,20,48]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#12b39a`,roughness:.4})]}),(0,E.jsxs)(`mesh`,{position:[1.45,-1.25,-.6],rotation:[.3,0,-.4],castShadow:!0,receiveShadow:!0,children:[(0,E.jsx)(`coneGeometry`,{args:[.4,.85,40]}),(0,E.jsx)(`meshStandardMaterial`,{color:`#6a3cff`,roughness:.45})]})]})]})]})}function P(){let[e,t]=(0,T.useState)(0),[n,c]=(0,T.useState)(1),[l,u]=(0,T.useState)(!1),[d]=(0,T.useState)(D),f=a(.18),p=a(0),m=a(A[1].css),h=a(0),g=a(0),_=(0,T.useRef)({a:0,b:0}),v=i(h,e=>`${(e*4).toFixed(2)}px ${(e*3).toFixed(2)}px 0 rgba(255, 72, 176, ${(.15+e*.7).toFixed(2)})`);(0,T.useEffect)(()=>{let e=r(m,A[n].css,{duration:.9,ease:[.45,0,.2,1]});return()=>e.stop()},[n,m]),(0,T.useEffect)(()=>{let e=r(h,+!!l,{type:`spring`,stiffness:120,damping:9,mass:1});return()=>e.stop()},[l,h]),(0,T.useEffect)(()=>{let t=_.current;if(t.a===e&&t.b===e)return;g.get()>.5&&(t.a=t.b),t.b=e,g.set(0);let n=r(g,1,{duration:1.1,ease:[.65,0,.35,1],onComplete:()=>{t.a=t.b,g.set(0)}});return()=>n.stop()},[e,g]);let y=(0,T.useRef)(null),S=(0,T.useRef)([]),w=e=>{e.target.closest(`.dock`)||(S.current.forEach(e=>e.stop()),y.current={x:e.clientX,y:e.clientY,id:e.pointerId},e.currentTarget.setPointerCapture(e.pointerId))},O=e=>{let t=y.current;t&&t.id===e.pointerId&&(p.set(p.get()+(e.clientX-t.x)*.009),f.set(b.clamp(f.get()+(e.clientY-t.y)*.006,-.9,.9)),t.x=e.clientX,t.y=e.clientY)},j=e=>{y.current&&y.current.id===e.pointerId&&(y.current=null,S.current=[r(p,p.get(),{type:`inertia`,velocity:p.getVelocity(),power:.5,timeConstant:600}),r(f,f.get(),{type:`inertia`,velocity:f.getVelocity(),power:.4,timeConstant:450,min:-.9,max:.9,bounceStiffness:160,bounceDamping:18})])},M=k[e],P=Math.round(96/A[n].css);return(0,E.jsxs)(`div`,{className:`stage ht`,style:{background:M.paper,transition:`background .8s`},onPointerDown:w,onPointerMove:O,onPointerUp:j,onPointerCancel:j,children:[(0,E.jsx)(`style`,{children:F}),(0,E.jsx)(x,{shadows:!0,dpr:[1,2],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,.5,9],fov:34},children:(0,E.jsx)(N,{rx:f,ry:p,cell:m,mis:h,wipe:g,modes:_})}),(0,E.jsxs)(`div`,{className:`overlay`,children:[(0,E.jsx)(`span`,{className:`ht-crop tl`}),(0,E.jsx)(`span`,{className:`ht-crop tr`}),(0,E.jsx)(`span`,{className:`ht-crop bl`}),(0,E.jsx)(`span`,{className:`ht-crop br`}),(0,E.jsx)(`div`,{className:`ht-copy`,children:(0,E.jsxs)(o.div,{initial:{opacity:0,y:14},animate:{opacity:1,y:0},transition:{duration:.8,delay:.15,ease:[.23,1,.32,1]},children:[(0,E.jsxs)(`p`,{className:`ht-kicker`,children:[(0,E.jsx)(`b`,{children:`PRINT STUDY`}),(0,E.jsxs)(`span`,{children:[P,` LPI · `,M.short]})]}),(0,E.jsxs)(o.h1,{style:{textShadow:v},children:[`把 3D`,(0,E.jsx)(`br`,{}),`印在纸上`]}),(0,E.jsx)(`p`,{className:`ht-sub`,children:`每一帧先渲染进离屏缓冲，再按设备像素分色、加网：几块网屏各转一个角度，在纸面上相乘叠印。`}),(0,E.jsx)(`div`,{className:`ht-spec`,children:(0,E.jsx)(s,{mode:`popLayout`,initial:!1,children:(0,E.jsxs)(o.span,{initial:{opacity:0,x:-10},animate:{opacity:1,x:0},exit:{opacity:0,x:10},transition:{duration:.4,ease:[.23,1,.32,1]},children:[M.inks.map(e=>(0,E.jsx)(`i`,{style:{background:e.hex}},e.name)),M.spec]},M.key)})})]})}),(0,E.jsxs)(`div`,{className:`dock`,children:[(0,E.jsx)(C,{items:k.map((e,t)=>({value:t,label:d?e.short:e.zh})),value:e,onChange:t}),(0,E.jsx)(`span`,{className:`dock-sep`}),(0,E.jsx)(C,{items:A.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:c}),(0,E.jsx)(`span`,{className:`dock-sep`}),(0,E.jsxs)(`button`,{className:`seg ht-toggle`,"aria-pressed":l,onClick:()=>u(e=>!e),children:[l&&(0,E.jsx)(o.span,{layoutId:`ht-mis`,className:`seg-bg`,transition:{type:`spring`,stiffness:520,damping:40}}),(0,E.jsxs)(`span`,{children:[(0,E.jsx)(`i`,{}),d?`错位`:`套印错位`]})]})]}),(0,E.jsx)(`p`,{className:`hint`,children:`拖动转动物体 · 松手会惯性滑行`})]})]})}var F=`
.ht { cursor: grab; touch-action: none; }
.ht:active { cursor: grabbing; }
.ht canvas { display: block; }
.ht-copy {
  position: absolute; left: clamp(24px, 6vw, 96px); top: 72px; bottom: 88px;
  display: flex; flex-direction: column; justify-content: center;
  width: min(440px, calc(100% - 48px)); pointer-events: none !important;
  color: #1d1c1a;
}
.ht-kicker {
  display: flex; align-items: center; gap: 10px; margin: 0 0 20px;
  font: 600 11px/1 var(--mono); letter-spacing: .14em; text-transform: uppercase; color: #1d1c1a;
}
.ht-kicker b { padding: 5px 7px 4px; background: #1d1c1a; color: #f6f2e8; font-weight: 600; }
.ht-kicker span { color: #57534c; }
.ht-copy h1 {
  margin: 0; font: 900 clamp(48px, 6.4vw, 92px)/.98 var(--display); letter-spacing: -.045em;
  color: #1d1c1a; mix-blend-mode: multiply;
}
.ht-sub { margin: 22px 0 0; max-width: 380px; font-size: 15px; line-height: 1.75; color: #57534c; }
.ht-spec { margin-top: 22px; min-height: 18px; font: 500 11.5px/18px var(--mono); letter-spacing: .04em; color: #57534c; }
.ht-spec span { display: inline-flex; align-items: center; gap: 4px; }
.ht-spec i { width: 10px; height: 10px; mix-blend-mode: multiply; }
.ht-spec i:last-of-type { margin-right: 8px; }
.ht-toggle span { display: inline-flex; align-items: center; gap: 7px; }
.ht-toggle i {
  width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid currentColor; position: relative;
  transition: box-shadow .4s;
}
.ht-toggle[aria-pressed='true'] i { box-shadow: 2.5px 1.5px 0 -0.5px #ff48b0; }
.ht-crop { position: absolute; width: 22px; height: 22px; pointer-events: none !important; opacity: .55; }
.ht-crop::before, .ht-crop::after { content: ''; position: absolute; background: #1d1c1a; }
.ht-crop::before { width: 100%; height: 1px; }
.ht-crop::after { width: 1px; height: 100%; }
.ht-crop.tl { left: 20px; top: 76px; } .ht-crop.tl::before { top: 0 } .ht-crop.tl::after { left: 0 }
.ht-crop.tr { right: 20px; top: 76px; } .ht-crop.tr::before { top: 0 } .ht-crop.tr::after { right: 0 }
.ht-crop.bl { left: 20px; bottom: 20px; } .ht-crop.bl::before { bottom: 0 } .ht-crop.bl::after { left: 0 }
.ht-crop.br { right: 20px; bottom: 20px; } .ht-crop.br::before { bottom: 0 } .ht-crop.br::after { right: 0 }
@media (max-width: 760px) {
  .ht-copy { top: auto; bottom: 88px; justify-content: flex-end; }
  .ht-copy h1 { font-size: 44px; }
  .ht-sub { display: none; }
  .ht-spec { margin-top: 14px; }
  .ht-kicker { margin-bottom: 14px; }
  .ht .dock .seg { padding: 0 10px; }
}
`;export{P as default};