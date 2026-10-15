import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{gn as s,u as c,yt as l}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as u}from"./react-three-fiber.esm-BQtD7wyt.js";import{t as d}from"./Seg-BfWvO_Xs.js";import{r as f,t as p}from"./dist-vKXJJnic.js";import{r as m,t as h}from"./glsl-CTWV-b_3.js";import{t as g}from"./fit-CkWZ68TI.js";var _=e(t(),1),v=n(),y=[{key:`idle`,zh:`待机`,en:`Idle`,desc:`缓慢呼吸，等待唤起`,p:{amp:.065,freq:.9,speed:.22,hue:0,scale:1,swirl:0,glow:.6,drift:0}},{key:`listen`,zh:`聆听`,en:`Listening`,desc:`表面随声音起伏，音量越大波动越强`,p:{amp:.06,freq:1.2,speed:.5,hue:.45,scale:1.02,swirl:0,glow:.6,drift:0}},{key:`think`,zh:`思考`,en:`Thinking`,desc:`噪声场加速旋转，色相持续流动`,p:{amp:.09,freq:1.45,speed:.9,hue:.22,scale:.94,swirl:1.9,glow:.75,drift:.16}},{key:`answer`,zh:`回答`,en:`Responding`,desc:`跟随语句节奏脉动，像在开口说话`,p:{amp:.075,freq:1.1,speed:.55,hue:.72,scale:1,swirl:.4,glow:1.05,drift:0}}],b=[`amp`,`freq`,`speed`,`hue`,`scale`,`swirl`,`glow`,`drift`],x=`
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uSwirl;
uniform float uScale;
varying vec3 vN;
varying vec3 vSN;
varying vec3 vView;
varying float vDisp;
${h}

float field(vec3 p) {
  vec3 q = p * uFreq;
  float a = uSwirl * p.y + uTime * 0.15 * uSwirl;
  float c = cos(a), s = sin(a);
  q.xz = mat2(c, -s, s, c) * q.xz;
  float n = snoise(q + vec3(0.0, uTime * 0.55, uTime * 0.3));
  n += 0.28 * snoise(q * 2.0 + vec3(uTime * 0.35, 0.0, -uTime * 0.2));
  return n;
}
vec3 displace(vec3 n) { return n * (1.0 + uAmp * field(n)); }

void main() {
  vec3 p = normalize(position);
  vec3 t = normalize(cross(p, abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(p, t);
  float e = 0.012;
  float f0 = field(p);
  vec3 d0 = p * (1.0 + uAmp * f0);
  vec3 d1 = displace(normalize(p + t * e));
  vec3 d2 = displace(normalize(p + b * e));
  vec3 nrm = normalize(cross(d1 - d0, d2 - d0));
  vDisp = f0;
  vec4 mv = modelViewMatrix * vec4(d0 * uScale, 1.0);
  vN = normalize(normalMatrix * nrm);
  vSN = normalize(normalMatrix * p);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`,S=`
uniform float uHue;
uniform float uGlow;
varying vec3 vN;
varying vec3 vSN;
varying vec3 vView;
varying float vDisp;

vec3 pal(float t) {
  // cyclic violet → blue → cyan → pink film palette (sRGB stops, linearised)
  t = fract(t) * 4.0;
  vec3 c0 = vec3(0.50, 0.36, 1.00);
  vec3 c1 = vec3(0.26, 0.52, 1.00);
  vec3 c2 = vec3(0.36, 0.92, 0.98);
  vec3 c3 = vec3(1.00, 0.46, 0.84);
  vec3 c = t < 1.0 ? mix(c0, c1, smoothstep(0.0, 1.0, t))
         : t < 2.0 ? mix(c1, c2, smoothstep(1.0, 2.0, t))
         : t < 3.0 ? mix(c2, c3, smoothstep(2.0, 3.0, t))
         : mix(c3, c0, smoothstep(3.0, 4.0, t));
  return pow(c, vec3(2.2));
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.4);

  vec3 base = pal(uHue);
  vec3 rimC = pal(uHue + 0.1 + (1.0 - ndv) * 0.12 + vDisp * 0.05);
  vec3 film = pal(uHue - 0.08 + vDisp * 0.12);

  // dark glassy body with a soft luminous core
  vec3 col = base * 0.012;
  col += base * pow(ndv, 3.0) * uGlow * 0.15;
  // internal thin-film bands that follow the displacement
  float band = 0.5 + 0.5 * sin(vDisp * 8.0 + ndv * 6.0);
  col += film * band * pow(1.0 - ndv, 1.4) * 0.28;
  // fresnel rim
  col += rimC * fr * 1.35;

  // studio reflections: a soft top strip + one sharp key highlight
  vec3 r = reflect(-v, n);
  col += smoothstep(0.45, 0.95, r.y) * smoothstep(-0.2, 0.6, r.z) * 0.1 * mix(vec3(1.0), rimC, 0.4);
  vec3 l1 = normalize(vec3(-0.45, 0.75, 0.6));
  vec3 l2 = normalize(vec3(0.7, -0.35, 0.4));
  // highlights use a softened normal so they stay clean ovals that wobble, not noisy squiggles
  vec3 ns = normalize(mix(n, normalize(vSN), 0.82));
  col += pow(max(dot(ns, normalize(l1 + v)), 0.0), 320.0) * 1.1 + pow(max(dot(n, normalize(l1 + v)), 0.0), 40.0) * 0.08;
  col += pow(max(dot(ns, normalize(l2 + v)), 0.0), 50.0) * pal(uHue + 0.25) * 0.22;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`,C=`
uniform float uHue;
uniform float uGlow;
varying vec2 vUv;
vec3 pal(float t) {
  // cyclic violet → blue → cyan → pink film palette (sRGB stops, linearised)
  t = fract(t) * 4.0;
  vec3 c0 = vec3(0.50, 0.36, 1.00);
  vec3 c1 = vec3(0.26, 0.52, 1.00);
  vec3 c2 = vec3(0.36, 0.92, 0.98);
  vec3 c3 = vec3(1.00, 0.46, 0.84);
  vec3 c = t < 1.0 ? mix(c0, c1, smoothstep(0.0, 1.0, t))
         : t < 2.0 ? mix(c1, c2, smoothstep(1.0, 2.0, t))
         : t < 3.0 ? mix(c2, c3, smoothstep(2.0, 3.0, t))
         : mix(c3, c0, smoothstep(3.0, 4.0, t));
  return pow(c, vec3(2.2));
}
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float g = exp(-d * d * 7.0) * 0.05 + exp(-d * d * 20.0) * 0.045;
  vec3 c = pal(uHue) * g * uGlow;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`,w=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,T=typeof window<`u`&&window.innerWidth<760?48:80;function E({mv:e,mode:t,bars:n}){let r=g(1.5),i=(0,_.useRef)(null),a=(0,_.useMemo)(()=>({uTime:{value:0},uAmp:{value:.1},uFreq:{value:1},uSwirl:{value:0},uScale:{value:1},uHue:{value:0},uGlow:{value:.6}}),[]),o=m(()=>({vertexShader:x,fragmentShader:S,uniforms:a})),u=m(()=>({vertexShader:w,fragmentShader:C,uniforms:{uHue:a.uHue,uGlow:a.uGlow},transparent:!0,blending:2,depthWrite:!1})),d=(0,_.useRef)({t:0,clock:0,drift:0,voice:0,voiceTarget:0,syll:0,talk:0}),f=(0,_.useRef)(new s);return(0,_.useEffect)(()=>{let e=e=>f.current.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1));return window.addEventListener(`pointermove`,e),()=>window.removeEventListener(`pointermove`,e)},[]),c((r,o)=>{o=Math.min(o,1/30);let s=d.current,c=t.current;s.clock+=o,s.t+=o*e.speed.get();let u=e.drift.get();s.drift+=o*u,u<.02&&(s.drift=l.damp(s.drift,Math.round(s.drift),1.2,o)),s.syll-=o,s.syll<=0&&(s.syll=.09+Math.random()*.22,s.voiceTarget=Math.random()<.78?.35+Math.random()*.65:.04);let p=+(c===`listen`);s.voice=l.damp(s.voice,s.voiceTarget*p,14,o);let m=+(c===`answer`),h=(.5+.5*Math.sin(s.clock*7.2))**3*(.55+.45*Math.sin(s.clock*1.7));s.talk=l.damp(s.talk,m*h,10,o);let g=a;g.uTime.value=s.t,g.uAmp.value=e.amp.get()+s.voice*.075+s.talk*.03,g.uFreq.value=e.freq.get(),g.uSwirl.value=e.swirl.get(),g.uScale.value=e.scale.get()*(1+s.voice*.07+s.talk*.045),g.uHue.value=e.hue.get()+s.drift,g.uGlow.value=e.glow.get()*(1+s.voice*.5+s.talk*.6);let _=i.current;_&&(_.rotation.y+=o*.08,_.rotation.x=l.damp(_.rotation.x,-f.current.y*.18,2.5,o),_.rotation.z=l.damp(_.rotation.z,f.current.x*-.1,2.5,o),_.position.x=l.damp(_.position.x,f.current.x*.12,2,o));let v=n.current;if(v)for(let e=0;e<v.length;e++){let t=v[e];if(!t)continue;let n=.55+.45*Math.sin(s.clock*(9+e*2.3)+e*1.7),r=c===`listen`?.15+s.voice*n:c===`answer`?.15+s.talk*.8*n:c===`think`?.25+.2*Math.sin(s.clock*6-e*.9):.15;t.style.transform=`scaleY(${Math.max(.12,Math.min(1,r)).toFixed(3)})`}}),(0,v.jsxs)(`group`,{position:[0,.42*r+(r<1?.25:0),0],scale:r,children:[(0,v.jsx)(`mesh`,{position:[0,0,-1.5],material:u,children:(0,v.jsx)(`planeGeometry`,{args:[9,9]})}),(0,v.jsx)(`group`,{ref:i,children:(0,v.jsx)(`mesh`,{material:o,children:(0,v.jsx)(`icosahedronGeometry`,{args:[1,T]})})})]})}function D(){let[e,t]=(0,_.useState)(0),[n,s]=(0,_.useState)(``),[c,l]=(0,_.useState)(null),m=(0,_.useRef)(`idle`),h=(0,_.useRef)([]),g=(0,_.useRef)(-1e9),x=(0,_.useRef)([]),S=i(y[0].p.amp),C=i(y[0].p.freq),w=i(y[0].p.speed),T=i(y[0].p.hue),D=i(y[0].p.scale),k=i(y[0].p.swirl),A=i(y[0].p.glow),j=i(y[0].p.drift),M=(0,_.useMemo)(()=>({amp:S,freq:C,speed:w,hue:T,scale:D,swirl:k,glow:A,drift:j}),[S,C,w,T,D,k,A,j]),N=y[e];(0,_.useEffect)(()=>{m.current=N.key;let e=b.map(e=>r(M[e],N.p[e],e===`scale`?{type:`spring`,stiffness:140,damping:9}:{type:`spring`,stiffness:38,damping:13}));return()=>e.forEach(e=>e.stop())},[N,M]),(0,_.useEffect)(()=>{let e=setInterval(()=>{performance.now()-g.current<12e3||x.current.length||t(e=>(e+1)%y.length)},4800);return()=>clearInterval(e)},[]);let P=()=>{x.current.forEach(clearTimeout),x.current=[]};(0,_.useEffect)(()=>P,[]);let F=(0,_.useCallback)(e=>{g.current=performance.now(),P(),l(null),t(e)},[]),I=()=>{let e=n.trim()||`帮我写一句首页标语`;g.current=performance.now(),P(),s(``),l(`“${e.length>18?e.slice(0,18)+`…`:e}”`),t(2),x.current.push(window.setTimeout(()=>t(3),2400),window.setTimeout(()=>{t(0),l(null),g.current=performance.now(),x.current=[]},7600))},L=c?N.key===`think`?`正在思考 ${c}`:N.key===`answer`?`正在回答，光球随语句节奏脉动`:N.desc:N.desc;return(0,v.jsxs)(`div`,{className:`stage`,style:{background:`#06060b`},children:[(0,v.jsx)(`style`,{children:O}),(0,v.jsxs)(u,{dpr:[1,2],camera:{position:[0,0,6],fov:40},gl:{antialias:!0,alpha:!1},children:[(0,v.jsx)(`color`,{attach:`background`,args:[`#06060b`]}),(0,v.jsx)(E,{mv:M,mode:m,bars:h}),(0,v.jsx)(f,{multisampling:0,children:(0,v.jsx)(p,{mipmapBlur:!0,intensity:.75,luminanceThreshold:.42,luminanceSmoothing:.3,radius:.7})})]}),(0,v.jsxs)(`div`,{className:`overlay`,children:[(0,v.jsxs)(`div`,{className:`lo-panel`,children:[(0,v.jsxs)(`div`,{className:`lo-caption`,children:[(0,v.jsxs)(`p`,{className:`lo-meta`,children:[(0,v.jsx)(`i`,{style:{animationDuration:N.key===`idle`?`2.4s`:`0.9s`}}),String(e+1).padStart(2,`0`),` / 04 · `,N.en]}),(0,v.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,v.jsxs)(a.div,{initial:{opacity:0,y:10,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-8,filter:`blur(6px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:[(0,v.jsx)(`h2`,{children:N.zh}),(0,v.jsx)(`p`,{children:L})]},N.key+(c?`r`:``))})]}),(0,v.jsxs)(`form`,{className:`lo-pill`,onSubmit:e=>{e.preventDefault(),I()},children:[(0,v.jsx)(`button`,{type:`button`,className:`lo-mic`,"aria-label":`语音输入`,"aria-pressed":N.key===`listen`,onClick:()=>F(N.key===`listen`?0:1),children:(0,v.jsx)(`span`,{className:`lo-bars`,"aria-hidden":!0,children:[0,1,2,3,4].map(e=>(0,v.jsx)(`b`,{ref:t=>void(h.current[e]=t)},e))})}),(0,v.jsx)(`input`,{value:n,onChange:e=>{s(e.target.value),g.current=performance.now()},placeholder:`问点什么，按回车发送`,"aria-label":`提问`}),(0,v.jsx)(`button`,{type:`submit`,className:`lo-send`,"aria-label":`发送`,children:(0,v.jsx)(`svg`,{width:`16`,height:`16`,viewBox:`0 0 16 16`,"aria-hidden":!0,children:(0,v.jsx)(`path`,{d:`M8 13V3.5M3.8 7.5 8 3.3l4.2 4.2`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.7`,strokeLinecap:`round`,strokeLinejoin:`round`})})})]})]}),(0,v.jsx)(`div`,{className:`dock`,children:(0,v.jsx)(d,{items:y.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:F})}),(0,v.jsx)(`p`,{className:`hint`,children:`回车发送 · 进入 思考 → 回答`})]})]})}var O=`
.lo-panel {
  position: absolute; left: 50%; bottom: 96px; transform: translateX(-50%);
  width: min(520px, calc(100% - 32px));
  display: flex; flex-direction: column; align-items: center; gap: 22px;
  pointer-events: none;
}
.lo-panel > * { pointer-events: auto }
.lo-caption { text-align: center; min-height: 96px; }
.lo-meta {
  display: inline-flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font: 500 11.5px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-2);
}
.lo-meta i { width: 6px; height: 6px; border-radius: 50%; background: #b9a6ff; box-shadow: 0 0 10px #b9a6ff; animation: lo-blink 2.4s ease-in-out infinite }
@keyframes lo-blink { 50% { opacity: .35 } }
.lo-caption h2 { margin: 0; font: 600 30px/1.1 var(--display); letter-spacing: -.02em; color: var(--fg) }
.lo-caption p { margin: 8px 0 0; font-size: 14.5px; color: var(--fg-2) }
.lo-pill {
  display: flex; align-items: center; gap: 6px; width: 100%; height: 54px; padding: 6px;
  border-radius: 999px; background: rgba(255,255,255,.055);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.1), 0 20px 50px -24px rgba(120,100,255,.45);
  backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4);
  transition: box-shadow .3s;
}
.lo-pill:focus-within { box-shadow: inset 0 0 0 1px rgba(185,166,255,.45), 0 20px 50px -20px rgba(120,100,255,.6) }
.lo-pill input {
  flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: transparent;
  color: var(--fg); font: 15px/1 var(--sans); padding: 0 6px;
}
.lo-pill input::placeholder { color: rgba(244,242,238,.42) }
.lo-mic, .lo-send {
  flex: none; width: 42px; height: 42px; border: 0; border-radius: 50%; cursor: pointer;
  display: grid; place-items: center; color: var(--fg);
  background: rgba(255,255,255,.07); transition: background .2s, transform .15s var(--ease-out);
}
.lo-mic:active, .lo-send:active { transform: scale(.94) }
.lo-mic[aria-pressed='true'] { background: rgba(140,200,255,.18) }
.lo-send { background: #f1edff; color: #14111f }
.lo-bars { display: flex; align-items: center; gap: 2.5px; height: 18px }
.lo-bars b { width: 2.5px; height: 18px; border-radius: 2px; background: currentColor; transform: scaleY(.15); opacity: .9 }
@media (max-width: 760px) {
  .lo-panel { bottom: 86px; gap: 16px }
  .lo-caption { min-height: 84px }
  .lo-caption h2 { font-size: 26px }
}
`;export{D as default};