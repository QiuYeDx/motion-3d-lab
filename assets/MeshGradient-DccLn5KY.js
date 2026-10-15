import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a}from"./index-uImfd-0P.js";import{_n as o,gn as s,h as c,u as l,yt as u}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as d}from"./react-three-fiber.esm-BQtD7wyt.js";import{t as f}from"./Seg-BfWvO_Xs.js";import{n as p,r as m,t as h}from"./glsl-CTWV-b_3.js";var g=e(t(),1),_=n(),v=[{key:`mist`,zh:`晨雾`,colors:[`#edf0fb`,`#8ea6ff`,`#ffb3cf`,`#a6e6d8`,`#b9a3ff`],fg:`#16182a`,fg2:`rgba(22,24,42,0.66)`},{key:`coral`,zh:`珊瑚`,colors:[`#fff0e4`,`#ff8a6b`,`#ffc65c`,`#ff5f8f`,`#ffd3bd`],fg:`#2a1310`,fg2:`rgba(42,19,16,0.68)`},{key:`aurora`,zh:`极光`,colors:[`#e3faf3`,`#2fd0b5`,`#6f7dff`,`#c4f27e`,`#a77bff`],fg:`#0b2420`,fg2:`rgba(11,36,32,0.68)`},{key:`night`,zh:`夜幕`,colors:[`#0a0c1e`,`#2b35a8`,`#7d3fe6`,`#ff5c8d`,`#0f2a66`],fg:`#f6f4ff`,fg2:`rgba(246,244,255,0.7)`,dark:!0}],y=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,b=`
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC[5];
uniform vec2 uPointer;
uniform float uPush;
uniform float uDark;
${h}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  float t = uTime;

  // two octaves of domain warp — the blobs bend instead of being round
  vec2 q = p;
  q += 0.22 * vec2(snoise(vec3(p * 1.1, t * 0.06)), snoise(vec3(p * 1.1 + 7.3, t * 0.06 + 2.0)));
  q += 0.07 * vec2(snoise(vec3(q * 2.7, t * 0.1 + 3.0)), snoise(vec3(q * 2.7 + 1.7, t * 0.1 + 5.0)));

  // pointer pushes space outward
  vec2 dp = q - uPointer;
  float fall = exp(-dot(dp, dp) * 6.0);
  q += normalize(dp + 1e-4) * fall * 0.16 * uPush;

  float sx = max(asp, 0.75) * 0.5;
  vec2 c1 = vec2(sin(t * 0.090 + 0.0) * sx * 0.9, cos(t * 0.070 + 1.0) * 0.36);
  vec2 c2 = vec2(cos(t * 0.075 + 2.1) * sx * 0.85, sin(t * 0.095 + 0.4) * 0.40);
  vec2 c3 = vec2(sin(t * 0.060 + 4.2) * sx * 0.7, sin(t * 0.083 + 3.3) * 0.42);
  vec2 c4 = vec2(cos(t * 0.105 + 5.0) * sx * 0.8, cos(t * 0.064 + 2.6) * 0.38);

  // Shepard-style blend: each blob dominates its neighbourhood, the "air" fills the rest
  float w0 = 0.9;
  float w1 = 1.0 / pow(length(q - c1) + 0.06, 2.4);
  float w2 = 1.0 / pow(length(q - c2) + 0.06, 2.4);
  float w3 = 1.0 / pow(length(q - c3) + 0.06, 2.4);
  float w4 = 1.0 / pow(length(q - c4) + 0.06, 2.4);
  vec3 col = (uC[0] * w0 + uC[1] * w1 + uC[2] * w2 + uC[3] * w3 + uC[4] * w4) / (w0 + w1 + w2 + w3 + w4);

  // soft sheen along a slow noise ridge
  float ridge = 1.0 - abs(snoise(vec3(q * 1.1 + 11.0, t * 0.05)));
  col += pow(ridge, 3.0) * mix(0.035, 0.025, uDark);

  // vignette (subtle)
  vec2 vp = (vUv - 0.5) * 2.0;
  float vig = smoothstep(0.55, 1.6, length(vp));
  col *= 1.0 - vig * mix(0.12, 0.3, uDark);

  // film grain
  float g = hash(gl_FragCoord.xy + fract(t * 7.13) * 413.0) - 0.5;
  col += g * mix(0.05, 0.04, uDark);

  gl_FragColor = vec4(col, 1.0);
}
`;function x({mix:e,from:t,to:n,push:r,pointer:i}){let a=c(e=>e.size),d=(0,g.useMemo)(()=>({uRes:{value:new s(1,1)},uTime:{value:0},uC:{value:Array.from({length:5},()=>new o)},uPointer:{value:new s(0,0)},uPush:{value:0},uDark:{value:0}}),[]),f=m(()=>({vertexShader:y,fragmentShader:b,uniforms:d,depthTest:!1,depthWrite:!1})),p=(0,g.useRef)(new s(0,-.6)),h=(0,g.useRef)(Math.random()*40+20);return l((o,s)=>{s=Math.min(s,1/30),h.current+=s;let c=d;c.uTime.value=h.current,c.uRes.value.set(a.width,a.height);let l=e.get(),f=t.current,m=n.current;for(let e=0;e<5;e++)c.uC.value[e].set(f[e][0]+(m[e][0]-f[e][0])*l,f[e][1]+(m[e][1]-f[e][1])*l,f[e][2]+(m[e][2]-f[e][2])*l);c.uDark.value=f[5][0]+(m[5][0]-f[5][0])*l;let g=a.width/a.height,_=i.current;p.current.x=u.damp(p.current.x,_.x*.5*g,3,s),p.current.y=u.damp(p.current.y,_.y*.5,3,s),c.uPointer.value.copy(p.current),c.uPush.value=r.get()}),(0,_.jsx)(`mesh`,{frustumCulled:!1,material:f,children:(0,_.jsx)(`planeGeometry`,{args:[2,2]})})}var S=e=>[...e.colors.map(p),[+!!e.dark,0,0]];function C(){let[e,t]=(0,g.useState)(0),[n,o]=(0,g.useState)(!0),c=i(1),l=i(0),u=(0,g.useRef)(S(v[0])),p=(0,g.useRef)(S(v[0])),m=(0,g.useRef)(new s(0,-1.2));(0,g.useEffect)(()=>{let t=c.get();u.current=u.current.map((e,n)=>e.map((e,r)=>e+(p.current[n][r]-e)*t)),p.current=S(v[e]),c.set(0);let n=r(c,1,{duration:1.8,ease:[.45,0,.2,1]});return()=>n.stop()},[e,c]),(0,g.useEffect)(()=>{if(!n)return;let e=setInterval(()=>t(e=>(e+1)%v.length),6500);return()=>clearInterval(e)},[n]),(0,g.useEffect)(()=>{let e=0,t=t=>{m.current.set(t.clientX/innerWidth*2-1,-(t.clientY/innerHeight*2-1)),r(l,1,{type:`spring`,stiffness:120,damping:20}),clearTimeout(e),e=window.setTimeout(()=>r(l,.35,{duration:2.2,ease:`easeInOut`}),1400)};return window.addEventListener(`pointermove`,t),()=>{window.removeEventListener(`pointermove`,t),clearTimeout(e)}},[l]);let h=v[e];return(0,_.jsxs)(`div`,{className:`stage`,style:{background:h.colors[0],transition:`background 1.6s`},children:[(0,_.jsx)(`style`,{children:w}),(0,_.jsx)(d,{dpr:[1,1.5],gl:{antialias:!1,alpha:!0},camera:{position:[0,0,1]},children:(0,_.jsx)(x,{mix:c,from:u,to:p,push:l,pointer:m})}),(0,_.jsxs)(`div`,{className:`overlay mg-overlay`,style:{"--mg-fg":h.fg,"--mg-fg2":h.fg2},"data-dark":h.dark?``:void 0,children:[(0,_.jsx)(`div`,{className:`mg-hero`,children:(0,_.jsxs)(a.div,{className:`mg-hero-in`,initial:{opacity:0,y:14,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.8,delay:.15,ease:[.23,1,.32,1]},children:[(0,_.jsxs)(`a`,{className:`mg-badge`,href:`#/shader-gradient`,onClick:e=>e.preventDefault(),children:[(0,_.jsx)(`i`,{}),`新版本 2.0 已发布`,(0,_.jsx)(`svg`,{width:`12`,height:`12`,viewBox:`0 0 12 12`,"aria-hidden":!0,children:(0,_.jsx)(`path`,{d:`M4.5 2.5 8 6l-3.5 3.5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.4`,strokeLinecap:`round`,strokeLinejoin:`round`})})]}),(0,_.jsxs)(`h1`,{children:[`让首屏的背景`,(0,_.jsx)(`br`,{}),`自己慢慢呼吸`]}),(0,_.jsx)(`p`,{children:`五个色块沿扭曲噪声漂移，叠一层胶片颗粒。整块背景只是一张全屏着色器，没有图片和视频。`}),(0,_.jsxs)(`div`,{className:`mg-actions`,children:[(0,_.jsx)(`button`,{className:`mg-btn primary`,children:`免费开始使用`}),(0,_.jsx)(`button`,{className:`mg-btn`,onClick:()=>{o(!1),t(e=>(e+1)%v.length)},children:`换一套配色`})]})]})}),(0,_.jsxs)(`div`,{className:`dock`,children:[(0,_.jsx)(f,{items:v.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{t(e),o(!1)}}),(0,_.jsx)(`span`,{className:`dock-sep`}),(0,_.jsx)(`button`,{className:`seg`,"aria-pressed":n,onClick:()=>o(e=>!e),children:(0,_.jsx)(`span`,{children:n?`暂停`:`轮播`})})]}),(0,_.jsx)(`p`,{className:`hint mg-hint`,children:`移动指针 · 推开色块`})]})]})}var w=`
.mg-overlay { --mg-fg: #16182a; --mg-fg2: rgba(22,24,42,.66); }
.mg-hero {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%);
  width: min(760px, calc(100% - 40px)); text-align: center;
  display: flex; flex-direction: column; align-items: center;
  color: var(--mg-fg); transition: color 1.2s;
}
.mg-hero-in { display: flex; flex-direction: column; align-items: center; }
.mg-badge {
  display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 10px;
  border-radius: 999px; font: 500 13px/1 var(--sans); color: var(--mg-fg);
  background: color-mix(in srgb, #fff 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 55%, transparent), 0 6px 20px -10px rgba(0,0,0,.25);
  backdrop-filter: blur(12px) saturate(1.4); -webkit-backdrop-filter: blur(12px) saturate(1.4);
  transition: color 1.2s, background 1.2s, box-shadow 1.2s;
}
.mg-badge i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .75 }
.mg-badge svg { opacity: .6 }
.mg-hero h1 {
  margin: 26px 0 0; font: 600 clamp(38px, 5.8vw, 80px)/1.06 var(--display); letter-spacing: -0.04em;
}
.mg-hero p {
  max-width: 520px; margin: 22px 0 0; font-size: 16.5px; line-height: 1.75; color: var(--mg-fg2); transition: color 1.2s;
}
.mg-actions { display: flex; gap: 10px; margin-top: 32px; }
.mg-btn {
  height: 46px; padding: 0 22px; border: 0; border-radius: 999px; cursor: pointer;
  font: 500 14.5px/1 var(--sans); color: var(--mg-fg);
  background: color-mix(in srgb, #fff 30%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mg-fg) 16%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  transition: transform .15s var(--ease-out), color 1.2s, background 1.2s, box-shadow 1.2s;
}
.mg-btn:active { transform: scale(.97) }
.mg-btn.primary { background: var(--mg-fg); color: color-mix(in srgb, var(--mg-fg) 8%, #fff); box-shadow: 0 10px 24px -12px rgba(0,0,0,.45) }
.mg-overlay[data-dark] .mg-btn.primary { color: #12132a }
.mg-overlay[data-dark] .mg-badge, .mg-overlay[data-dark] .mg-btn:not(.primary) {
  background: color-mix(in srgb, #fff 10%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 18%, transparent);
}
.mg-hint { color: var(--mg-fg2); transition: color 1.2s }
@media (max-width: 760px) {
  .mg-hero { transform: translate(-50%, -58%) }
  .mg-hero p { font-size: 15px }
  .mg-actions { flex-direction: column; width: 100%; max-width: 280px }
}
`;export{C as default};