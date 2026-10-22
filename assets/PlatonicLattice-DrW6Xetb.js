import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{E as a,J as o,K as s,Nt as c,P as l,T as u,Xt as d,at as f,h as p,ln as m,u as h,w as g,xt as _,yn as v}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as y}from"./react-three-fiber.esm-zWEOtJjG.js";import{t as b}from"./Seg-CH5KfWEm.js";import{t as x}from"./BigLabel-CceM23C6.js";import{t as S}from"./fit-oWU2iFZb.js";var C=e(t(),1),w=n(),T=30,E=[{zh:`正四面体`,en:`Tetrahedron`,faces:`V4 · E6 · F4`,make:()=>new m(1),dual:0},{zh:`立方体`,en:`Cube`,faces:`V8 · E12 · F6`,make:()=>new g(1,1,1),dual:2},{zh:`正八面体`,en:`Octahedron`,faces:`V6 · E12 · F8`,make:()=>new c(1),dual:1},{zh:`正十二面体`,en:`Dodecahedron`,faces:`V20 · E30 · F12`,make:()=>new s(1),dual:4},{zh:`正二十面体`,en:`Icosahedron`,faces:`V12 · E30 · F20`,make:()=>new f(1),dual:3}];function D(e){let t=new o(e.make(),1).attributes.position.array,n=0;for(let e=0;e<t.length;e+=3)n=Math.max(n,Math.hypot(t[e],t[e+1],t[e+2]));let r=[],i=[];for(let e=0;e<t.length;e+=6)r.push(new v(t[e],t[e+1],t[e+2]).divideScalar(n)),i.push(new v(t[e+3],t[e+4],t[e+5]).divideScalar(n));for(;r.length<T;)r.push(new v),i.push(new v);return{a:r,b:i,n:t.length/6}}var O=E.map(D),k=`
#define MAX_EDGES ${T}
uniform vec3 uA0[MAX_EDGES];
uniform vec3 uA1[MAX_EDGES];
uniform vec3 uB0[MAX_EDGES];
uniform vec3 uB1[MAX_EDGES];
uniform float uNA;
uniform float uNB;
uniform float uProg;
uniform float uTime;
uniform float uSize;
uniform float uScale;
uniform vec3 uColA;
uniform vec3 uColB;
attribute vec4 aRand;
varying vec3 vColor;
varying float vAlpha;

vec3 onEdge(vec3 a, vec3 b, float t) { return mix(a, b, t); }

void main() {
  // most particles stream along an edge, a few sit on the vertices as glowing nodes
  bool node = aRand.z < 0.07;
  float t = node ? step(0.5, aRand.w) : fract(aRand.y + uTime * (0.05 + aRand.w * 0.09));
  int ia = int(floor(aRand.x * uNA));
  int ib = int(floor(aRand.x * uNB));
  vec3 pa = onEdge(uA0[ia], uA1[ia], t);
  vec3 pb = onEdge(uB0[ib], uB1[ib], t);
  float delay = aRand.x * 0.4;
  float k = clamp((uProg - delay) / 0.6, 0.0, 1.0);
  float e = k < 0.5 ? 4.0 * k * k * k : 1.0 - pow(-2.0 * k + 2.0, 3.0) / 2.0;
  vec3 p = mix(pa, pb, e);
  float flight = sin(e * 3.14159);
  p *= 1.0 + flight * 0.35 * (aRand.w - 0.3);
  p += (node ? 0.012 : 0.006) * vec3(sin(aRand.y * 90.0), cos(aRand.w * 70.0), sin(aRand.x * 50.0));
  p *= uScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (node ? 2.4 : 0.6 + aRand.w * 0.7) / -mv.z;
  vColor = mix(uColA, uColB, node ? 1.0 : t * 0.6 + flight * 0.4);
  vAlpha = (node ? 0.9 : 0.55) * mix(0.35, 1.0, smoothstep(-11.0, -6.0, mv.z));
}
`,A=`
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;function j({solid:e,count:t,scale:n,spin:o,colors:s}){let c=p(e=>e.viewport.dpr),f=i(1),m=(0,C.useRef)(null),g=(0,C.useRef)(null),_=(0,C.useRef)(e),v=(0,C.useMemo)(()=>{let e=new a,n=new Float32Array(t*4);for(let e=0;e<n.length;e++)n[e]=Math.random()*.9999;return e.setAttribute(`position`,new u(new Float32Array(t*3),3)),e.setAttribute(`aRand`,new u(n,4)),e},[t]),y=(0,C.useMemo)(()=>{let t=O[e];return new d({vertexShader:k,fragmentShader:A,transparent:!0,depthWrite:!1,blending:2,uniforms:{uA0:{value:t.a.map(e=>e.clone())},uA1:{value:t.b.map(e=>e.clone())},uB0:{value:t.a.map(e=>e.clone())},uB1:{value:t.b.map(e=>e.clone())},uNA:{value:t.n},uNB:{value:t.n},uProg:{value:1},uTime:{value:0},uSize:{value:30},uScale:{value:n},uColA:{value:new l(s[0])},uColB:{value:new l(s[1])}}})},[]);return(0,C.useEffect)(()=>{if(_.current===e)return;let t=y.uniforms,n=O[_.current],i=O[e];t.uA0.value.forEach((e,t)=>e.copy(n.a[t])),t.uA1.value.forEach((e,t)=>e.copy(n.b[t])),t.uB0.value.forEach((e,t)=>e.copy(i.a[t])),t.uB1.value.forEach((e,t)=>e.copy(i.b[t])),t.uNA.value=n.n,t.uNB.value=i.n,_.current=e,m.current?.stop(),f.set(0),m.current=r(f,1,{duration:2.2,ease:`linear`})},[e,y,f]),h((e,t)=>{let n=y.uniforms;n.uTime.value=e.clock.elapsedTime,n.uProg.value=f.get(),n.uSize.value=40*c*(e.size.height/900),g.current&&(g.current.rotation.y+=t*o,g.current.rotation.x+=t*o*.37)}),(0,w.jsx)(`points`,{ref:g,geometry:v,material:y,frustumCulled:!1})}function M({children:e}){let t=(0,C.useRef)(null),n=S();return h((e,n)=>{t.current&&(t.current.rotation.x=_.damp(t.current.rotation.x,-e.pointer.y*.35,2,n),t.current.rotation.y=_.damp(t.current.rotation.y,e.pointer.x*.45,2,n))}),(0,w.jsx)(`group`,{ref:t,scale:n,children:e})}function N(){let[e,t]=(0,C.useState)(0),[n,r]=(0,C.useState)(!0),i=typeof window<`u`&&window.innerWidth<760;(0,C.useEffect)(()=>{if(!n)return;let e=setInterval(()=>t(e=>(e+1)%E.length),4800);return()=>clearInterval(e)},[n]);let a=E[e];return(0,w.jsxs)(`div`,{className:`stage`,style:{background:`radial-gradient(90% 75% at 50% 45%, #22141f 0%, #0d080e 72%)`},children:[(0,w.jsx)(y,{dpr:[1,2],camera:{position:[0,0,8.5],fov:42},gl:{antialias:!1,alpha:!0},children:(0,w.jsxs)(M,{children:[(0,w.jsx)(j,{solid:e,count:i?14e3:26e3,scale:2.4,spin:.16,colors:[`#ff7a4f`,`#ffe2b8`]}),(0,w.jsx)(j,{solid:a.dual,count:i?5e3:9e3,scale:1.05,spin:-.3,colors:[`#7a6bff`,`#d8d2ff`]})]})}),(0,w.jsxs)(`div`,{className:`overlay`,children:[(0,w.jsx)(x,{id:String(e),meta:`${String(e+1).padStart(2,`0`)} / 05 · outer + dual inside`,title:a.zh,sub:`${a.en} ↔ ${E[a.dual].en}`,aside:a.faces}),(0,w.jsxs)(`div`,{className:`dock`,children:[(0,w.jsx)(b,{items:E.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{t(e),r(!1)}}),(0,w.jsx)(`span`,{className:`dock-sep`}),(0,w.jsx)(`button`,{className:`seg`,"aria-pressed":n,onClick:()=>r(e=>!e),children:(0,w.jsx)(`span`,{children:n?`暂停`:`播放`})})]})]})]})}export{N as default};