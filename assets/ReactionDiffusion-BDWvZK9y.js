import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{$ as s,E as c,Ht as l,N as u,Pt as d,Sn as f,Xt as p,Yt as m,bn as h,et as g,h as _,it as v,jt as y,k as b,pt as x,u as S,vn as C,wt as w,xt as T,yn as E}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as D}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as O}from"./iso-CLB38p39.js";import{t as k}from"./Seg-CH5KfWEm.js";import{n as A}from"./glsl-oFfHlTlN.js";var j=e(t(),1),M=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,N=`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`,P=`
uniform vec2 uFK;     // preset (F, k)
uniform float uMap;   // 0 = preset everywhere, 1 = parameter map
vec2 fkAt(vec2 uv) {
  // k runs left → right; F runs bottom → top inside the band where Gray-Scott makes patterns
  float k = mix(0.046, 0.066, uv.x);
  float lo = 0.006 + (k - 0.045) * 1.25;
  float hi = 0.012 + (k - 0.045) * 2.2;
  float F = mix(lo, hi, uv.y);
  return mix(uFK, vec2(F, k), uMap);
}
`,F=N+P+`
uniform sampler2D tState;
uniform sampler2D tMask;
uniform float uContain; // > 0: outside the seed word the recipe can't sustain V, so the pattern stays inside the glyphs
uniform vec2 uTexel;
void main() {
  vec2 e = uTexel;
  vec2 c = texture2D(tState, vUv).xy;
  vec2 n = texture2D(tState, vUv + vec2(0.0, e.y)).xy;
  vec2 s = texture2D(tState, vUv - vec2(0.0, e.y)).xy;
  vec2 w = texture2D(tState, vUv - vec2(e.x, 0.0)).xy;
  vec2 ea = texture2D(tState, vUv + vec2(e.x, 0.0)).xy;
  vec2 ne = texture2D(tState, vUv + e).xy;
  vec2 nw = texture2D(tState, vUv + vec2(-e.x, e.y)).xy;
  vec2 se = texture2D(tState, vUv + vec2(e.x, -e.y)).xy;
  vec2 sw = texture2D(tState, vUv - e).xy;
  vec2 lap = (n + s + w + ea) * 0.2 + (ne + nw + se + sw) * 0.05 - c;
  vec2 fk = fkAt(vUv);
  if (uContain > 0.0) fk = mix(fk, vec2(0.03, 0.07), uContain * (1.0 - texture2D(tMask, vUv).r));
  float u = c.x;
  float v = c.y;
  float uvv = u * v * v;
  u += 1.0 * lap.x - uvv + fk.x * (1.0 - u);
  v += 0.5 * lap.y + uvv - (fk.x + fk.y) * v;
  gl_FragColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}
`,I=N+`
uniform sampler2D tMask;
uniform vec2 uSimRes;
uniform float uSprinkle;
uniform float uSeed;
uniform float uMaskK;
void main() {
  float m = texture2D(tMask, vUv).r * uMaskK;
  vec2 cell = floor(vUv * uSimRes / 7.0);
  float sp = step(1.0 - uSprinkle, hash12(cell + uSeed)) * step(length(fract(vUv * uSimRes / 7.0) - 0.5), 0.3);
  // light grain inside the glyphs so the seed breaks up into pattern instead of a uniform blob
  float g = hash12(vUv * uSimRes + uSeed * 3.1);
  float v = max(m * (0.22 + 0.1 * g), sp * 0.3);
  gl_FragColor = vec4(1.0 - v * 2.0, v, 0.0, 1.0);
}
`,L=N+`
uniform sampler2D tState;
uniform vec2 uSimRes;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uRad;
uniform float uErase;
uniform float uSeed;
void main() {
  vec2 c = texture2D(tState, vUv).xy;
  vec2 p = vUv * uSimRes;
  vec2 pa = p - uP0;
  vec2 ba = uP1 - uP0;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  float d = length(pa - ba * h);
  float a = smoothstep(uRad, uRad * 0.55, d);
  // seeds go down as grain so a painted stroke breaks into pattern quickly
  if (uErase < 0.5) a *= step(0.35, hash12(p + uSeed));
  vec2 target = uErase > 0.5 ? vec2(1.0, 0.0) : vec2(0.5, 0.25);
  gl_FragColor = vec4(mix(c, target, a), 0.0, 1.0);
}
`,R=N+P+`
uniform sampler2D tState;
uniform vec2 uTexel;
uniform vec2 uRes;      // drawing buffer px
uniform float uDpr;
uniform vec3 uGround;
uniform vec3 uGlaze;
uniform vec3 uDeep;
uniform vec3 uRim;
uniform float uFade;
uniform float uTime;
uniform vec4 uVeil;      // centre (uv), radii (uv): the relief sinks flat under the copy so text stays legible
uniform float uVeilK;
float vk;

float hgt(vec2 uv) {
  float v = texture2D(tState, uv).y;
  return smoothstep(0.08, 0.34, v) * vk;
}

void main() {
  vec2 uv = vUv;
  float vd = length((uv - uVeil.xy) / uVeil.zw);
  vk = 1.0 - uVeilK * (1.0 - smoothstep(0.35, 1.0, vd));
  vec2 e = uTexel;
  float h = hgt(uv);
  float hx = hgt(uv + vec2(e.x, 0.0)) - hgt(uv - vec2(e.x, 0.0));
  float hy = hgt(uv + vec2(0.0, e.y)) - hgt(uv - vec2(0.0, e.y));
  // broad height (cavity / thickness of glaze pooling)
  float hb = (hgt(uv + vec2(3.0 * e.x, 0.0)) + hgt(uv - vec2(3.0 * e.x, 0.0)) + hgt(uv + vec2(0.0, 3.0 * e.y)) + hgt(uv - vec2(0.0, 3.0 * e.y))) * 0.25;
  vec3 n = normalize(vec3(-hx * 1.25, -hy * 1.25, 1.0));

  vec3 L = normalize(vec3(-0.55, 0.62, 0.56));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  // the relief casts a short soft shadow on the ground, away from the key light
  vec2 sdir = -L.xy * e * 2.4;
  float occ = max(max(hgt(uv + sdir) , hgt(uv + sdir * 2.0) * 0.8), hgt(uv + sdir * 3.2) * 0.55);
  float shadow = smoothstep(0.0, 0.9, occ - h) * (1.0 - h);

  float slope = clamp(length(vec2(hx, hy)) * 1.4, 0.0, 1.0);
  // glaze: thin and light on the shoulders (it "breaks" over edges), deep where it pools on the crown
  vec3 glaze = mix(uRim, uGlaze, smoothstep(0.15, 0.75, h));
  glaze = mix(glaze, uDeep, smoothstep(0.55, 1.0, hb) * 0.55);
  vec3 base = mix(uGround, glaze, smoothstep(0.02, 0.4, h));

  // ground: soft contact darkening next to the relief
  base *= 1.0 - 0.10 * smoothstep(0.0, 0.6, hb - h) * (1.0 - h);
  base *= 1.0 - 0.16 * shadow;

  // lambert normalised so the flat ground keeps its exact colour
  float diff = 1.0 + (dot(n, L) - L.z) * 0.9;
  vec3 col = base * clamp(diff, 0.6, 1.2);

  // specular: tight wet-glaze highlight + broad sheen, only on the glaze
  float gloss = smoothstep(0.1, 0.5, h);
  float nh = max(dot(n, H), 0.0);
  float spec = pow(nh, 90.0) * 0.85 + pow(nh, 12.0) * 0.06;
  col += vec3(1.0, 0.985, 0.95) * spec * gloss * (0.4 + 0.6 * slope);
  // fresnel-ish rim catches a cool sky
  col += vec3(0.82, 0.9, 1.0) * pow(slope, 2.0) * 0.06 * gloss;

  // ceramic grain + very soft vignette
  vec2 px = gl_FragCoord.xy / uDpr;
  float g = hash12(floor(px)) - 0.5;
  col += g * 0.018;
  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.06 * dot(q, q) * 2.0;

  col = mix(uGround, col, uFade);
  gl_FragColor = vec4(col, 1.0);
}
`,z=n(),B=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,V=8,H=[{zh:`斑点`,en:`Spots`,F:.03,k:.0625,note:`一颗颗独立的斑点，挤满就停`},{zh:`迷宫`,en:`Maze`,F:.029,k:.057,note:`条纹不断延长、拐弯，铺成迷宫`},{zh:`珊瑚`,en:`Coral`,F:.0545,k:.062,note:`枝杈从边缘向外分叉生长`},{zh:`细胞分裂`,en:`Mitosis`,F:.0367,k:.0649,note:`斑点长大后一分为二，再分裂`},{zh:`波纹`,en:`Waves`,F:.014,k:.045,note:`一圈圈波前相撞、湮灭、再生`}],U=[{zh:`青釉`,ground:`#f3efe7`,glaze:`#1f6f6a`,deep:`#123f45`,rim:`#7fb7aa`,dot:`#1f6f6a`},{zh:`赤陶`,ground:`#f5ede3`,glaze:`#b4492f`,deep:`#6e2417`,rim:`#e3a27f`,dot:`#b4492f`},{zh:`靛蓝`,ground:`#f1efea`,glaze:`#27407a`,deep:`#141f45`,rim:`#8ea4cf`,dot:`#27407a`}],W=e=>new E(...A(e)),G=U.map(e=>({ground:W(e.ground),glaze:W(e.glaze),deep:W(e.deep),rim:W(e.rim)}));function K(e,t,n,r){return new f(e,t,{type:n,format:l,minFilter:r?x:y,magFilter:r?x:y,wrapS:u,wrapT:u,generateMipmaps:!1,depthBuffer:!1,stencilBuffer:!1})}function q(e,t){let n=document.createElement(`canvas`);n.width=e,n.height=t;let r=n.getContext(`2d`);r.fillStyle=`#000`,r.fillRect(0,0,e,t);let i=t>e,a=Math.round(i?Math.min(e*.46,t*.22):Math.min(t*.46,e*.25));r.font=`900 ${a}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif`,r.textAlign=`center`,r.textBaseline=`middle`,r.fillStyle=`#fff`,r.strokeStyle=`#fff`,r.lineJoin=`round`,r.lineWidth=a*.1;let o=O||i?e*.5:e*.655,s=O?t*.5:i?t*.35:t*.48,c=(e,t,n)=>{r.fillText(e,t,n),r.strokeText(e,t,n)};i&&!O?(c(`生`,o,s-a*.56),c(`长`,o,s+a*.56)):c(`生长`,o,s);let l=new b(n);return l.minFilter=x,l.magFilter=x,l.generateMipmaps=!1,l}function J({F:e,K:t,map:n,pal:r,palFrom:i,palTo:a,strokes:o,cmd:l}){let u=_(e=>e.gl),f=_(e=>e.size),y=(0,j.useMemo)(()=>{let e=new c;e.setAttribute(`position`,new s([-1,-1,0,3,-1,0,-1,3,0],3)),e.setAttribute(`uv`,new s([0,0,2,0,0,2],2));let t=(e,t)=>new p({vertexShader:M,fragmentShader:e,uniforms:t,depthTest:!1,depthWrite:!1,toneMapped:!1}),n=t(F,{tState:{value:null},tMask:{value:null},uContain:{value:0},uTexel:{value:new C},uFK:{value:new C(.0545,.062)},uMap:{value:0}}),r=t(I,{tMask:{value:null},uMaskK:{value:1},uSimRes:{value:new C},uSprinkle:{value:0},uSeed:{value:0}}),i=t(L,{tState:{value:null},uSimRes:{value:new C},uP0:{value:new C},uP1:{value:new C},uRad:{value:8},uErase:{value:0},uSeed:{value:0}}),a=t(R,{tState:{value:null},uTexel:{value:new C},uRes:{value:new C},uDpr:{value:1},uFK:{value:new C},uMap:{value:0},uGround:{value:new E},uGlaze:{value:new E},uDeep:{value:new E},uRim:{value:new E},uFade:{value:0},uTime:{value:0},uVeil:{value:new h(.2,.5,.3,.4)},uVeilK:{value:0}}),o=new w(e,n);o.frustumCulled=!1;let l=new m;l.add(o);let f=new d(-1,1,1,-1,0,1),_=u.capabilities.isWebGL2&&u.extensions.has(`EXT_color_buffer_float`);return{geo:e,step:n,init:r,brush:i,show:a,quad:o,scene:l,cam:f,type:_?g:v,linear:!_||u.extensions.has(`OES_texture_float_linear`),mats:[n,r,i,a]}},[u]),b=(0,j.useRef)(null),x=(0,j.useRef)({ready:!1,t:0,fade:0,seeded:!1,born:0,boost:O?34:0,seed:1,lastReset:0});return(0,j.useEffect)(()=>{let e=!1,t=new m;for(let e of y.mats){let n=new w(y.geo,e);n.frustumCulled=!1,t.add(n)}let n=u.getRenderTarget();return u.setRenderTarget(null),u.compileAsync(t,y.cam).catch(()=>{}).then(()=>{e||(x.current.ready=!0)}),u.setRenderTarget(n),()=>{e=!0}},[u,y]),(0,j.useEffect)(()=>()=>{let e=b.current;e&&[e.a,e.b,e.mask].forEach(e=>e.dispose()),y.mats.forEach(e=>e.dispose()),y.geo.dispose()},[y]),S((s,c)=>{let d=Math.min(c,1/30),p=x.current,m=u.getRenderTarget();if(!p.ready){u.setRenderTarget(null),u.setClearColor(U[0].ground,1),u.clear(!0,!1,!1);return}p.t+=d;let h=f.width,g=f.height,_=b.current,v=Math.max(O?1.6:B?1.4:2,Math.max(h,g)/1024),S=Math.max(16,Math.round(h/v)),C=Math.max(16,Math.round(g/v));(!_||_.w!==S||_.h!==C)&&(_&&[_.a,_.b,_.mask].forEach(e=>e.dispose()),_=b.current={w:S,h:C,cell:v,a:K(S,C,y.type,y.linear),b:K(S,C,y.type,y.linear),mask:q(S,C)},p.seeded=!1);let w=()=>{let e=_.a;_.a=_.b,_.b=e},E=e=>{y.quad.material=e,u.setRenderTarget(_.b),u.render(y.scene,y.cam),w()},D=l.current;(!p.seeded||D.reset!==p.lastReset)&&(p.seeded=!0,p.lastReset=D.reset,p.seed=Math.random()*100,p.born=p.t,D.free=!1,y.init.uniforms.tMask.value=_.mask,y.init.uniforms.uSimRes.value.set(S,C),y.init.uniforms.uSprinkle.value=D.field?.2:0,y.init.uniforms.uMaskK.value=+!D.field,y.init.uniforms.uSeed.value=p.seed,E(y.init));let k=y.brush.uniforms;k.tState.value=null,k.uSimRes.value.set(S,C),k.uRad.value=(B?16:13)/v;let A=o.current;for(let e of A)k.tState.value=_.a.texture,k.uP0.value.set(e[0]*S,e[1]*C),k.uP1.value.set(e[2]*S,e[3]*C),k.uErase.value=e[4],k.uRad.value=(B?16:13)*(e[4]?2.8:1)/v,k.uSeed.value=Math.random()*100,E(y.brush);A.length=0;let j=y.step.uniforms;j.uTexel.value.set(1/S,1/C),j.uFK.value.set(e.get(),t.get()),j.uMap.value=n.get();let M=p.t-p.born,N=O?1e9:3.2;D.free&&(p.born=Math.min(p.born,p.t-N-2.5)),j.uContain.value=n.get()>.5?0:1-T.smoothstep(M,N,N+2.5),j.tMask.value=_.mask;let P=V;p.boost>0&&(P=160,p.boost--);for(let e=0;e<P;e++)j.tState.value=_.a.texture,E(y.step);p.fade=Math.min(1,p.fade+d/.7);let F=y.show.uniforms;if(F.tState.value=_.a.texture,F.uTexel.value.set(1/S,1/C),u.getDrawingBufferSize(F.uRes.value),F.uDpr.value=u.getPixelRatio(),F.uFade.value=p.fade*p.fade*(3-2*p.fade),F.uTime.value=p.t,O)F.uVeilK.value=0;else if(h<760)F.uVeil.value.set(.5,220/g,.8,210/g),F.uVeilK.value=.8;else{let e=Math.min(96,h*.06)+230;F.uVeil.value.set(e/h,.5,400/h,330/g),F.uVeilK.value=.9}let I=G[i.current],L=G[a.current],R=r.get();F.uGround.value.lerpVectors(I.ground,L.ground,R),F.uGlaze.value.lerpVectors(I.glaze,L.glaze,R),F.uDeep.value.lerpVectors(I.deep,L.deep,R),F.uRim.value.lerpVectors(I.rim,L.rim,R),y.quad.material=y.show,u.setRenderTarget(m),u.render(y.scene,y.cam)},1),null}var Y={erase:(0,z.jsxs)(`svg`,{viewBox:`0 0 16 16`,width:`15`,height:`15`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,children:[(0,z.jsx)(`path`,{d:`M6.2 13.5 2.6 9.9a1.2 1.2 0 0 1 0-1.7l5.6-5.6a1.2 1.2 0 0 1 1.7 0l3.6 3.6a1.2 1.2 0 0 1 0 1.7L8 13.5Z`}),(0,z.jsx)(`path`,{d:`M5 6.2 10 11.2M8 13.5h5.5`})]}),map:(0,z.jsxs)(`svg`,{viewBox:`0 0 16 16`,width:`15`,height:`15`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,children:[(0,z.jsx)(`rect`,{x:`2.25`,y:`2.25`,width:`11.5`,height:`11.5`,rx:`2.5`}),(0,z.jsx)(`path`,{d:`M2.5 10.5c2.5-.2 4.6-2.2 5.4-4.6.6-1.6 2.2-3 5.6-3.4`}),(0,z.jsx)(`circle`,{cx:`5.2`,cy:`5.4`,r:`.9`,fill:`currentColor`,stroke:`none`}),(0,z.jsx)(`circle`,{cx:`10.8`,cy:`10.6`,r:`.9`,fill:`currentColor`,stroke:`none`})]}),reset:(0,z.jsxs)(`svg`,{viewBox:`0 0 16 16`,width:`15`,height:`15`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.5`,strokeLinecap:`round`,strokeLinejoin:`round`,children:[(0,z.jsx)(`path`,{d:`M3 8a5 5 0 1 0 1.6-3.7`}),(0,z.jsx)(`path`,{d:`M3.2 2.4v2.8H6`})]})};function X(){let[e,t]=(0,j.useState)(2),[n,s]=(0,j.useState)(0),[c,l]=(0,j.useState)(!1),[u,d]=(0,j.useState)(!1),f=i(H[2].F),p=i(H[2].k),m=i(0),h=i(1),g=(0,j.useRef)(0),_=(0,j.useRef)(0),v=(0,j.useRef)([]),y=(0,j.useRef)({reset:0,field:!1,free:!1}),b=(0,j.useRef)(performance.now()),x=(0,j.useRef)(u);x.current=u;let S=(0,j.useRef)(null);(0,j.useEffect)(()=>{let t=H[e],n=[.45,0,.2,1],i=r(f,t.F,{duration:1.5,ease:n}),a=r(p,t.k,{duration:1.5,ease:n});return()=>{i.stop(),a.stop()}},[e,f,p]),(0,j.useEffect)(()=>{if(y.current.field=c,c){m.set(1),y.current.reset++;return}let e=r(m,0,{duration:1.6,ease:[.45,0,.2,1]});return()=>e.stop()},[c,m]),(0,j.useEffect)(()=>{if(_.current===n)return;g.current=_.current,_.current=n,h.set(0);let e=r(h,1,{duration:.9,ease:[.45,0,.2,1]});return()=>e.stop()},[n,h]),(0,j.useEffect)(()=>{let e=()=>{let e=S.current;e&&(e.textContent=c?`F · k  ⟶ 全谱`:`F ${f.get().toFixed(4)} · k ${p.get().toFixed(4)}`)};e();let t=f.on(`change`,e),n=p.on(`change`,e);return()=>{t(),n()}},[f,p,c]),(0,j.useEffect)(()=>{if(O)return;let e=setInterval(()=>{performance.now()-b.current<14e3||(t(e=>(e+1)%H.length),b.current=performance.now()-14e3+9e3)},1e3);return()=>clearInterval(e)},[]);let C=(0,j.useRef)(null),w=e=>{let t=e.currentTarget.getBoundingClientRect();return[(e.clientX-t.left)/t.width,1-(e.clientY-t.top)/t.height]},T=e=>{if(e.button!==0&&e.button!==2)return;b.current=performance.now();let[t,n]=w(e),r=e.button===2||x.current?1:0;C.current={id:e.pointerId,x:t,y:n,erase:r},y.current.free=!0,v.current.push([t,n,t+1e-4,n,r]),e.currentTarget.setPointerCapture(e.pointerId)},E=e=>{let t=C.current;if(!t||t.id!==e.pointerId)return;b.current=performance.now();let[n,r]=w(e);v.current.push([t.x,t.y,n,r,t.erase]),t.x=n,t.y=r},A=e=>{C.current?.id===e.pointerId&&(C.current=null)},M=()=>b.current=performance.now(),N=H[e],P=U[n];return(0,z.jsxs)(`div`,{className:`stage rd`,style:{background:P.ground,transition:`background .9s`},children:[(0,z.jsx)(`style`,{children:Q}),(0,z.jsx)(`div`,{className:`rd-canvas`,onPointerDown:T,onPointerMove:E,onPointerUp:A,onPointerCancel:A,onContextMenu:e=>e.preventDefault(),children:(0,z.jsx)(D,{linear:!0,flat:!0,dpr:[1,2],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},children:(0,z.jsx)(J,{F:f,K:p,map:m,pal:h,palFrom:g,palTo:_,strokes:v,cmd:y})})}),(0,z.jsx)(o,{children:c&&(0,z.jsxs)(a.div,{className:`rd-axes`,initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},transition:{duration:.6},children:[(0,z.jsx)(`span`,{className:`rd-ax-k`,children:`k 0.045 → 0.068 · 消耗率`}),(0,z.jsx)(`span`,{className:`rd-ax-f`,children:`F 低 → 高 · 补给率`})]})}),(0,z.jsxs)(`div`,{className:`overlay`,children:[(0,z.jsx)(`div`,{className:`hero-copy rd-copy`,children:(0,z.jsxs)(a.div,{initial:{opacity:0,y:14},animate:{opacity:1,y:0},transition:{duration:.8,delay:.2,ease:[.23,1,.32,1]},children:[(0,z.jsxs)(`p`,{className:`kicker`,children:[(0,z.jsx)(`i`,{style:{background:P.dot,transition:`background .9s`}}),(0,z.jsx)(`span`,{ref:S,children:`F · k`})]}),(0,z.jsxs)(`h1`,{children:[`两种物质，`,(0,z.jsx)(`br`,{}),`长出一整片纹样`]}),(0,z.jsx)(`p`,{children:`Gray-Scott 反应扩散：一种物质被补给、一种被消耗，彼此扩散又相互吞食。只改两个数 F 与 k，图案就在斑点、迷宫和珊瑚之间变形。`}),(0,z.jsx)(`div`,{className:`rd-recipe`,children:(0,z.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,z.jsxs)(a.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-8,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:[(0,z.jsx)(`b`,{children:c?`全谱`:N.zh}),c?`横向 k、纵向 F 逐渐变化，所有形态并排生长`:N.note]},c?`map`:N.en)})})]})}),(0,z.jsxs)(`div`,{className:`dock rd-dock`,onPointerDown:M,onClick:M,children:[(0,z.jsx)(k,{items:H.map((e,t)=>({value:t,label:B&&e.zh.length>2?`分裂`:e.zh})),value:e,onChange:e=>{M(),t(e),c&&l(!1)}}),(0,z.jsx)(`span`,{className:`dock-sep`}),(0,z.jsx)(`button`,{className:`seg rd-pal`,onClick:()=>s(e=>(e+1)%U.length),"aria-label":`配色：${P.zh}`,title:`配色：${P.zh}`,children:(0,z.jsxs)(`span`,{children:[(0,z.jsx)(`i`,{style:{background:P.glaze,boxShadow:`0 0 0 3px ${P.ground}, 0 0 0 4px ${P.glaze}55`}}),!B&&P.zh]})}),(0,z.jsx)(Z,{on:c,onClick:()=>l(e=>!e),label:`全谱`,icon:Y.map,id:`rd-map`}),(0,z.jsx)(Z,{on:u,onClick:()=>d(e=>!e),label:`橡皮`,icon:Y.erase,id:`rd-erase`}),(0,z.jsx)(`button`,{className:`seg rd-icon`,onClick:()=>{y.current.reset++,M()},"aria-label":`重置`,title:`重置`,children:(0,z.jsxs)(`span`,{children:[Y.reset,!B&&`重置`]})})]}),(0,z.jsx)(`p`,{className:`hint`,children:`拖动播种 · 右键擦除`})]})]})}function Z({on:e,onClick:t,label:n,icon:r,id:i}){return(0,z.jsxs)(`button`,{className:`seg rd-icon`,"aria-pressed":e,onClick:t,"aria-label":n,title:n,children:[e&&(0,z.jsx)(a.span,{layoutId:i,className:`seg-bg`,transition:{type:`spring`,stiffness:520,damping:40}}),(0,z.jsxs)(`span`,{children:[r,!B&&n]})]})}var Q=`
.rd { color: #1d1c1a; }
.rd-canvas { position: absolute; inset: 0; touch-action: none; cursor: crosshair; }
.rd-canvas canvas { display: block; }
.rd-copy { pointer-events: none !important; }
.rd-copy h1 { font-size: clamp(34px, 4vw, 54px); }
.rd-copy p { color: #4f4b45; }
.rd-copy .kicker { color: #4f4b45; font-variant-numeric: tabular-nums; }
.rd-recipe { margin-top: 22px; min-height: 22px; font-size: 13.5px; color: #4f4b45; }
.rd-recipe span { display: inline-flex; align-items: baseline; gap: 10px; }
.rd-recipe b { font-weight: 600; color: #1d1c1a; }
.rd-dock .seg span { display: inline-flex; align-items: center; gap: 7px; }
.rd-pal i { width: 10px; height: 10px; border-radius: 50%; transition: background .6s, box-shadow .6s; }
.rd-axes { position: absolute; inset: 0; pointer-events: none; font: 500 11px/1 var(--mono); letter-spacing: .06em; color: #4f4b45; }
.rd-ax-k { position: absolute; right: 24px; bottom: 76px; padding: 6px 9px; border-radius: 999px; background: color-mix(in srgb, #fff 55%, transparent); backdrop-filter: blur(8px); }
.rd-ax-f { position: absolute; right: 24px; top: 84px; padding: 6px 9px; border-radius: 999px; background: color-mix(in srgb, #fff 55%, transparent); backdrop-filter: blur(8px); }
@media (max-width: 760px) {
  .rd-copy h1 { font-size: 30px; }
  .rd-copy p { font-size: 13.5px; margin-top: 12px; }
  .rd-recipe { margin-top: 12px; font-size: 12.5px; }
  .rd-dock { gap: 0; }
  .rd-dock .seg { padding: 0 8px; }
  .rd-dock .dock-sep { margin: 0 3px; }
  .rd-ax-k { bottom: 74px; right: 16px; }
  .rd-ax-f { top: 80px; right: 16px; }
}
`;export{X as default};