import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a}from"./index-uImfd-0P.js";import{$t as o,T as s,_n as c,gn as l,h as u,u as d,w as f,yt as p}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as m}from"./react-three-fiber.esm-BQtD7wyt.js";import{t as h}from"./Seg-BfWvO_Xs.js";import{n as g,r as _,t as v}from"./glsl-CTWV-b_3.js";var y=e(t(),1),b=n(),x=[{key:`rose`,zh:`玫瑰金`,en:`Rose Gold`,c:[`#ff9db8`,`#f6c49a`,`#e98aa0`],back:`#5a2236`,spec:`#fff1e6`,bg:`#0d0a10`,dot:`#ffb3c7`},{key:`glacier`,zh:`冰川`,en:`Glacier`,c:[`#8fd0ff`,`#d6f1ff`,`#7f97ff`],back:`#1d2c66`,spec:`#f2fbff`,bg:`#070b12`,dot:`#9fd8ff`},{key:`neon`,zh:`霓虹`,en:`Neon`,c:[`#ff3ea5`,`#7b5cff`,`#21d4ff`],back:`#2a0f4a`,spec:`#ffffff`,bg:`#08060f`,dot:`#ff3ea5`}],S=[{seed:.3,y:.5,width:1.05,amp:.9,twist:2.2,ci:0},{seed:4.1,y:0,width:1.4,amp:1,twist:1.6,ci:1},{seed:8.7,y:-.45,width:.85,amp:.85,twist:2.6,ci:2},{seed:13.2,y:.05,width:.5,amp:1.2,twist:3,ci:0}],C=360,w=12;function T(){let e=new s,t=new Float32Array(14079),n=[],r=0;for(let e=0;e<=C;e++)for(let n=0;n<=w;n++)t[r++]=e/C,t[r++]=n/w*2-1,t[r++]=0;for(let e=0;e<C;e++)for(let t=0;t<w;t++){let r=e*13+t,i=r+w+1;n.push(r,i,r+1,i,i+1,r+1)}return e.setAttribute(`position`,new f(t,3)),e.setIndex(n),e.boundingSphere=new o(new c,50),e}var E=`
uniform float uTime;
uniform float uSeed;
uniform float uWidth;
uniform float uAmp;
uniform float uTwist;
uniform float uY;
uniform vec3 uPointer;
uniform float uBend;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec2 vSV;
${v}

const float LEN = 20.0;

vec3 curve(float s) {
  float t = uTime;
  float x = (s - 0.5) * LEN;
  float y = uY
    + sin(s * 3.4 + t * 0.21 + uSeed) * 0.42 * uAmp
    + snoise(vec3(s * 1.5, uSeed, t * 0.06)) * 0.75 * uAmp;
  float z = cos(s * 2.6 + t * 0.17 + uSeed * 1.7) * 0.9 * uAmp
    + snoise(vec3(s * 1.1 + 5.0, uSeed, t * 0.05)) * 1.1 * uAmp;
  // pointer: ribbons lean gently towards it
  float near = exp(-pow((x - uPointer.x) / 2.6, 2.0));
  y += (uPointer.y - y) * 0.16 * near * uBend;
  z += 0.35 * near * uBend;
  return vec3(x, y, z);
}

void main() {
  float s = position.x;
  float v = position.y;
  vec3 p = curve(s);
  vec3 T = normalize(curve(s + 0.0015) - p);
  vec3 N0 = normalize(cross(T, vec3(0.0, 0.0, 1.0)));
  vec3 B0 = cross(T, N0);
  float th = snoise(vec3(s * 1.2, uSeed + 3.0, uTime * 0.05)) * uTwist + s * 2.2 + uTime * 0.04 + uSeed;
  vec3 W = cos(th) * N0 + sin(th) * B0;
  vec3 Nrm = normalize(cross(T, W));
  // slight curl across the width so it reads as cloth, not paper
  vec3 pos = p + W * v * uWidth * 0.5 + Nrm * (v * v) * 0.12 * uWidth;
  vec3 nC = normalize(Nrm - W * v * 0.35);

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vN = normalize(normalMatrix * nC);
  vT = normalize(normalMatrix * T);
  vView = -mv.xyz;
  vSV = vec2(s, v);
  gl_Position = projectionMatrix * mv;
}
`,D=`
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uBack;
uniform vec3 uSpec;
uniform float uFade;
varying vec3 vN;
varying vec3 vT;
varying vec3 vView;
varying vec2 vSV;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 T = normalize(vT);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.2);

  // iridescent drift between the two front colours along the length and with view angle
  float k = clamp(0.5 + 0.5 * sin(vSV.x * 7.0 + vSV.y * 0.8) * 0.8 + (fr - 0.3) * 0.6, 0.0, 1.0);
  vec3 front = mix(uA, uB, k);
  vec3 base = gl_FrontFacing ? front : mix(uBack, front, 0.25);

  vec3 L1 = normalize(vec3(-0.3, 0.8, 0.6));
  vec3 L2 = normalize(vec3(0.6, -0.2, 0.7));
  float dif = 0.35 + 0.65 * max(dot(n, L1), 0.0);

  // Kajiya-Kay anisotropic sheen along the threads
  vec3 H1 = normalize(L1 + v);
  vec3 H2 = normalize(L2 + v);
  float th1 = dot(T, H1);
  float th2 = dot(T, H2);
  float an1 = pow(sqrt(max(1.0 - th1 * th1, 0.0)), 70.0);
  float an2 = pow(sqrt(max(1.0 - th2 * th2, 0.0)), 24.0);
  float blinn = pow(max(dot(n, H1), 0.0), 60.0);

  vec3 col = base * dif * 0.42;
  col += front * fr * 0.55;
  col += uSpec * (an1 * 0.55 + blinn * 0.5);
  col += front * an2 * 0.22;

  // threads + soft edges
  float edge = smoothstep(1.0, 0.72, abs(vSV.y));
  float ends = smoothstep(0.0, 0.18, vSV.x) * smoothstep(1.0, 0.82, vSV.x);
  float a = edge * ends * uFade * (0.5 + 0.5 * fr + an1 * 0.4);
  gl_FragColor = vec4(col * a, 1.0);
}
`,O=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }
`,k=`
uniform vec3 uBg;
uniform vec3 uTint;
uniform vec2 uRes;
uniform vec2 uCenter;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 p = (vUv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
  float d = length(p);
  vec3 col = uBg + uTint * 0.07 * exp(-d * d * 1.6);
  col *= 1.0 - 0.35 * smoothstep(0.4, 1.3, d);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * 2.0; // dither the gradient
  gl_FragColor = vec4(col, 1.0);
}
`;function A({colors:e}){let t=u(e=>e.size),n=(0,y.useMemo)(()=>({uBg:{value:new c},uTint:{value:new c},uRes:{value:new l},uCenter:{value:new l(.62,.55)}}),[]),r=_(()=>({vertexShader:O,fragmentShader:k,uniforms:n,depthWrite:!1,depthTest:!1}));return d(()=>{let[r,i]=e();n.uBg.value.set(r[0],r[1],r[2]),n.uTint.value.set(i[0],i[1],i[2]),n.uRes.value.set(t.width,t.height),n.uCenter.value.set(t.width<760?.5:.64,t.width<760?.66:.52)}),(0,b.jsx)(`mesh`,{material:r,frustumCulled:!1,renderOrder:-1,children:(0,b.jsx)(`planeGeometry`,{args:[2,2]})})}function j({cfg:e,geo:t,uniRef:n}){let r=(0,y.useMemo)(()=>({uTime:{value:0},uSeed:{value:e.seed},uWidth:{value:e.width},uAmp:{value:e.amp},uTwist:{value:e.twist},uY:{value:e.y},uPointer:{value:new c(0,0,0)},uBend:{value:0},uA:{value:new c},uB:{value:new c},uBack:{value:new c},uSpec:{value:new c(1,1,1)},uFade:{value:0}}),[e]),i=_(()=>({vertexShader:E,fragmentShader:D,uniforms:r,side:2,transparent:!0,depthWrite:!1,blending:2}));return(0,y.useEffect)(()=>n(r),[r,n]),(0,b.jsx)(`mesh`,{geometry:t,material:i,frustumCulled:!1})}function M({mix:e,from:t,to:n,pointer:r}){let i=(0,y.useMemo)(T,[]);(0,y.useEffect)(()=>()=>i.dispose(),[i]);let a=(0,y.useRef)(null),o=(0,y.useRef)([]),{viewport:s,size:l}=u(),f=l.width<760,m=(0,y.useRef)(12),h=(0,y.useRef)(new c),g=(0,y.useMemo)(()=>new c,[]),_=(0,y.useRef)(0),v=(0,y.useRef)(0),x=(0,y.useMemo)(()=>S.map((e,t)=>e=>void(o.current[t]=e)),[]);d((i,c)=>{c=Math.min(c,1/30),m.current+=c,v.current=Math.min(1,v.current+c*.5);let l=e.get(),u=t.current,d=n.current,f=(e,t)=>u[e][t]+(d[e][t]-u[e][t])*l,y=a.current,b=r.current;y&&(g.set(b.x*s.width/2,b.y*s.height/2,0),y.worldToLocal(g),h.current.lerp(g,1-Math.exp(-c*2.5)),y.rotation.x=p.damp(y.rotation.x,-b.y*.06,1.5,c),y.rotation.y=p.damp(y.rotation.y,b.x*.08,1.5,c)),_.current=p.damp(_.current,Math.abs(b.x)>1.5?0:1,1.2,c);let x=Math.sin(Math.min(1,v.current)*Math.PI*.5);for(let e=0;e<o.current.length;e++){let t=o.current[e];if(!t)continue;let n=S[e].ci;t.uTime.value=m.current,t.uPointer.value.copy(h.current),t.uBend.value=_.current,t.uFade.value=x*(e===3?.7:1),t.uA.value.set(f(n,0),f(n,1),f(n,2));let r=(n+1)%3;t.uB.value.set(f(r,0),f(r,1),f(r,2)),t.uBack.value.set(f(3,0),f(3,1),f(3,2)),t.uSpec.value.set(f(4,0),f(4,1),f(4,2))}});let C=(0,y.useMemo)(()=>[0,0,0],[]),w=(0,y.useMemo)(()=>[0,0,0],[]),E=(0,y.useMemo)(()=>()=>{let r=e.get();for(let e=0;e<3;e++)C[e]=t.current[5][e]+(n.current[5][e]-t.current[5][e])*r,w[e]=t.current[6][e]+(n.current[6][e]-t.current[6][e])*r;return[C,w]},[e,t,n,C,w]);return(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(A,{colors:E}),(0,b.jsx)(`group`,{ref:a,position:f?[.1,1.05,0]:[1.7,-.15,0],rotation:[.18,-.25,f?.95:.56],scale:f?.72:1,children:S.map((e,t)=>(0,b.jsx)(j,{cfg:e,geo:i,uniRef:x[t]},t))})]})}var N=e=>[...e.c.map(g),g(e.back),g(e.spec),g(e.bg),g(e.dot)];function P(){let[e,t]=(0,y.useState)(0),n=i(1),o=(0,y.useRef)(N(x[0])),s=(0,y.useRef)(N(x[0])),c=(0,y.useRef)(new l(9,9)),u=(0,y.useRef)(!1);(0,y.useEffect)(()=>{let t=n.get();o.current=o.current.map((e,n)=>e.map((e,r)=>e+(s.current[n][r]-e)*t)),s.current=N(x[e]),n.set(0);let i=r(n,1,{duration:2.2,ease:[.45,0,.2,1]});return()=>i.stop()},[e,n]),(0,y.useEffect)(()=>{let e=setInterval(()=>{u.current||t(e=>(e+1)%x.length)},8e3),n=e=>c.current.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight*2-1)),r=()=>c.current.set(9,9);return window.addEventListener(`pointermove`,n),document.addEventListener(`pointerleave`,r),()=>{clearInterval(e),window.removeEventListener(`pointermove`,n),document.removeEventListener(`pointerleave`,r)}},[]);let d=x[e];return(0,b.jsxs)(`div`,{className:`stage`,style:{background:d.bg},children:[(0,b.jsx)(`style`,{children:F}),(0,b.jsx)(m,{dpr:[1,2],camera:{position:[0,0,8],fov:38},gl:{antialias:!0,alpha:!1},children:(0,b.jsx)(M,{mix:n,from:o,to:s,pointer:c})}),(0,b.jsxs)(`div`,{className:`overlay`,children:[(0,b.jsxs)(a.div,{className:`hero-copy sr-copy`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.9,delay:.25,ease:[.23,1,.32,1]},style:{"--soft-bg":d.bg},children:[(0,b.jsx)(`span`,{className:`scrim`}),(0,b.jsxs)(`p`,{className:`kicker`,children:[(0,b.jsx)(`i`,{style:{background:d.dot,transition:`background 1.2s`}}),` Silk · `,d.en]}),(0,b.jsxs)(`h1`,{children:[`柔软的光`,(0,b.jsx)(`br`,{}),`缓慢流过`]}),(0,b.jsx)(`p`,{children:`四条丝带在 GPU 上沿噪声曲线翻卷，正反面分别着色，高光顺着纤维方向拉开。移动指针，它们会轻轻弯向你。`}),(0,b.jsxs)(`div`,{className:`hero-actions`,children:[(0,b.jsx)(`button`,{className:`btn primary`,children:`预约体验`}),(0,b.jsx)(`button`,{className:`btn`,children:`了解工艺`})]})]}),(0,b.jsx)(`div`,{className:`dock`,children:(0,b.jsx)(h,{items:x.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{u.current=!0,t(e)}})}),(0,b.jsx)(`p`,{className:`hint`,children:`移动指针 · 丝带随之弯曲`})]})]})}var F=`
.sr-copy h1 { font-weight: 500; letter-spacing: -0.03em; }
.sr-copy p:not(.kicker) { max-width: 400px; }
.sr-copy .scrim { opacity: .75 }
`;export{P as default};