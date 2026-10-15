import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a}from"./index-uImfd-0P.js";import{$ as o,Bt as s,Jt as c,Kt as l,N as u,O as d,Ot as f,R as p,T as m,Wt as h,gn as g,h as _,kt as v,lt as y,u as b,w as x,yt as S,z as C}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as w}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as T}from"./iso-C377rVhz.js";import{t as E}from"./Seg-BfWvO_Xs.js";var D=e(t(),1),O=1.55,k=`
float bulb(float t) {
  t = min(abs(t), 1.0);
  if (t < 0.7) return pow(sin(1.5707963 * (t / 0.7)), 1.5);
  float u = (t - 0.7) / 0.3;
  return 1.0 - 0.28 * pow(u, 2.2);
}
float profileR(float y, float neck) { return neck + (${.86.toFixed(4)} - neck) * bulb(y / ${O.toFixed(4)}); }
`,A=n(),j=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,M=128,N=j?3584:5120,P=6,F=.0084*Math.sqrt(5120/N),ee=14,I=1.1,L=.2,R=I,z=O+L,B=[{value:0,label:`细颈`,neck:.036,flow:62},{value:1,label:`标准`,neck:.05,flow:112},{value:2,label:`宽颈`,neck:.068,flow:200}],V=[{value:0,label:`金沙`,en:`Gold`,pal:{a:`#f4d095`,b:`#d59a4e`,c:`#9c5f2a`,glint:0},bg:`#f3ede4`},{value:1,label:`粉沙`,en:`Rose`,pal:{a:`#f8d3c9`,b:`#e49c96`,c:`#b5636d`,glint:0},bg:`#f5ebe6`},{value:2,label:`星砂`,en:`Star`,pal:{a:`#b4b3e6`,b:`#5d5ea8`,c:`#1f2150`,glint:1},bg:`#eeeaf0`}],te=`
uniform highp sampler2D tSim;
uniform float uScale, uSize, uTime, uGlint;
uniform vec3 uA, uB, uC;
varying vec3 vCol;
varying float vGl;
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float idx = position.x;
  float phi = position.y;
  float s = position.z;
  vec4 t = texelFetch(tSim, ivec2(int(mod(idx, ${M}.0)), int(floor(idx / ${M}.0))), 0);
  // each replica gets a little jitter so the copies never line up
  vec2 j = (vec2(h11(s * 3.7), h11(s * 9.1 + 1.3)) - 0.5) * uSize * 1.3;
  vec2 q = t.xy + j;
  float rr = abs(q.x);
  // revolve the cross-section grain around the hourglass axis (x → radius)
  vec3 p = vec3(q.x * cos(phi), q.y, rr * sin(phi));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;

  // pile surface normal ≈ radial with an upward lean (angle of repose); lit from the upper left
  vec3 radial = vec3(sign(q.x) * cos(phi), 0.0, sin(phi));
  vec3 up = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  vec3 n = normalize(mat3(modelMatrix) * radial * 0.8 + vec3(0.0, 0.62, 0.0));
  float lam = clamp(dot(n, normalize(vec3(-0.45, 0.85, 0.5))), 0.0, 1.0);
  float tone = h11(s * 17.3 + 4.1);
  // mostly mid-tone grains, a share of pale ones and a sprinkle of dark minerals
  vec3 col = mix(uB, uA, smoothstep(0.35, 1.0, tone) * 0.85);
  col = mix(col, uC, step(tone, 0.07) * 0.75);
  // fast grains (the stream) catch a bit more light
  float moving = smoothstep(0.4, 1.6, t.z);
  col *= 0.58 + 0.55 * lam + 0.1 * moving;
  // a few glittering grains
  float g = step(0.955, h11(s * 5.3 + 7.7)) * uGlint;
  float tw = pow(max(sin(uTime * (1.3 + tone * 2.4) + s * 61.0), 0.0), 12.0);
  vGl = g * tw;
  vCol = col;
  // outer rings hold fewer grains per arc length: draw them a touch larger so the pile surface stays closed
  float size = uSize * (0.75 + 0.5 * t.w) * (1.0 + vGl * 0.5) * (1.0 + 0.45 * smoothstep(0.15, 0.75, rr));
  gl_PointSize = max(1.5, 2.0 * size * uScale / -mv.z);
}
`,ne=`
varying vec3 vCol;
varying float vGl;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  vec3 col = vCol * (1.08 - d * 1.3);
  col = mix(col, vec3(1.0, 0.93, 0.7), clamp(vGl * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`,H=`
uniform float uNeck, uOff;
varying vec3 vN;
varying vec3 vV;
varying vec3 vNv;
varying float vY;
${k}
void main() {
  float y = position.y;
  vec2 dir = normalize(position.xz);
  float R = profileR(y, uNeck) + uOff;
  float e = 0.004;
  float dR = (profileR(y + e, uNeck) - profileR(y - e, uNeck)) / (2.0 * e);
  vec3 p = vec3(dir.x * R, y, dir.y * R);
  vec3 n = normalize(vec3(dir.x, -dR, dir.y));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  vNv = normalize(normalMatrix * n);
  vY = y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,U=`
uniform float uBack;
varying vec3 vN;
varying vec3 vV;
varying vec3 vNv;
varying float vY;
void main() {
  float sgn = uBack > 0.5 ? -1.0 : 1.0;
  vec3 n = normalize(vN) * sgn;
  vec3 v = normalize(vV);
  vec3 nv = normalize(vNv) * sgn;
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.2);
  // on a light backdrop glass reads by its darker, warm-grey silhouette plus crisp window reflections
  vec3 edge = vec3(0.42, 0.36, 0.31);
  vec3 col = mix(vec3(1.0), edge, smoothstep(0.1, 0.9, fr));
  float a = 0.035 + fr * 0.62;
  // studio softboxes (fixed to the view, so they slide over the glass while it turns)
  float s1 = smoothstep(0.14, 0.03, abs(nv.x + 0.5)) * smoothstep(-0.7, 0.2, nv.y);
  float s2 = smoothstep(0.05, 0.0, abs(nv.x - 0.66)) * 0.85;
  float s3 = smoothstep(0.55, 0.85, nv.y) * 0.5;
  float hl = max(max(s1, s2), s3) * (uBack > 0.5 ? 0.3 : 1.0);
  col = mix(col, vec3(1.0), hl);
  a = max(a, hl * 0.9);
  // ends fade into the wooden caps
  a *= smoothstep(${O.toFixed(3)}, ${(O-.04).toFixed(3)}, abs(vY));
  gl_FragColor = vec4(col, a * (uBack > 0.5 ? 0.55 : 1.0));
}
`,W=`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`,G=`
uniform vec2 uExt;
uniform float uLift;
uniform float uCap;
varying vec2 vP;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  // plane is rotated so local y is world -z; nudge the shadow away from the key light (upper left front)
  vec2 p = vP - vec2(0.28, 0.18) * (1.0 + uLift * 0.6);
  float blur = 0.3 + uLift * 0.7;
  float d = sdBox(p, uExt, min(uExt.x, uExt.y) * 0.9);
  float a = (1.0 - smoothstep(-blur, blur * 1.5, d)) * 0.34 / (1.0 + uLift * 1.4);
  // tight contact shadow under the resting cap
  float dc = length(vP - vec2(0.05, 0.03)) - ${I.toFixed(2)};
  a += (1.0 - smoothstep(-0.18, 0.12, dc)) * 0.28 * uCap;
  gl_FragColor = vec4(vec3(0.33, 0.22, 0.13), a);
}
`;function K(e){let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]}function q(){let e=document.createElement(`canvas`);e.width=512,e.height=256;let t=e.getContext(`2d`),n=t.createLinearGradient(0,0,512,0);n.addColorStop(0,`#8a5532`),n.addColorStop(.5,`#a0663b`),n.addColorStop(1,`#8a5532`),t.fillStyle=n,t.fillRect(0,0,512,256);let r=7,i=()=>(r=r*16807%2147483647)/2147483647;for(let e=0;e<260;e++){let n=i()*512,r=.6+i()*2.4;t.strokeStyle=i()<.5?`rgba(70,38,18,${.08+i()*.22})`:`rgba(200,140,90,${.05+i()*.12})`,t.lineWidth=r,t.beginPath(),t.moveTo(n,0);for(let r=0;r<=256;r+=16)t.lineTo(n+Math.sin(r*.03+e)*3*i(),r);t.stroke()}let a=new d(e);return a.colorSpace=l,a.wrapS=a.wrapT=h,a.anisotropy=4,a}function J(){let e=[],t=L/2;e.push(new g(0,-.1)),e.push(new g(1.02,-.1));for(let t=0;t<=8;t++){let n=-Math.PI/2+t/8*Math.PI;e.push(new g(1.02+Math.cos(n)*.08,Math.sin(n)*.1*.999))}return e.push(new g(.9800000000000001,t)),e.push(new g(.9600000000000001,.125)),e.push(new g(0,.125)),new y(e,72)}function re(){let e=[],t=e=>{let t=Math.abs(e),n=.034+.006*Math.cos(t*Math.PI*.5);return n+=.028*Math.exp(-(((t-.86)/.035)**2)),n+=.016*Math.exp(-(((t-.74)/.03)**2)),n+=.02*Math.exp(-((t/.05)**2)),n};e.push(new g(0,-O));for(let n=0;n<=120;n++){let r=-1+2*n/120;e.push(new g(t(r),r*O))}return e.push(new g(0,O)),new y(e,20)}function Y(){let e=_(e=>e.camera),{width:t,height:n}=_(e=>e.size);return(0,D.useLayoutEffect)(()=>{let r=t/n,i=t<760,a=r<.9?Math.max(8,4.05/r):5.1;e.fov=28;let o=a/(2*Math.tan(S.degToRad(14)));e.position.set(0,o*.13,o),e.lookAt(0,-.05,0),e.near=.5,e.far=80;let s=T||i?0:.14,c=T?0:i?.17:.01;e.setViewOffset(t,n,-s*t,c*n,t,n),e.updateProjectionMatrix()},[e,t,n]),null}function X({theta:e,neckMv:t,flowRef:n,pal:r,stats:i,onFlip:a}){let l=_(e=>e.size),d=_(e=>e.viewport.dpr),h=(0,D.useRef)(null),y=N/M,w=(0,D.useMemo)(()=>{let e=new C(new Float32Array(N*4),M,y,s,o);return e.minFilter=e.magFilter=v,e.needsUpdate=!0,e},[y]);(0,D.useEffect)(()=>()=>w.dispose(),[w]);let E=(0,D.useRef)({worker:null,busy:!0,latest:null,spare:void 0,dt:0,ready:!1});(0,D.useEffect)(()=>{let e=new Worker(new URL(`/motion-3d-lab/assets/hourglassWorker-Bq191BX2.js`,``+import.meta.url),{type:`module`}),r=E.current;return r.worker=e,e.onmessage=e=>{r.latest=e.data,r.busy=!1},e.postMessage({type:`init`,n:N,r:F,fracLower:T?.42:.3,neck:t.get(),flow:n.current,warm:T?1.2:.7}),()=>{e.terminate(),r.worker=null}},[t,n]);let k=(0,D.useMemo)(()=>{let e=new m,t=new Float32Array(N*P*3),n=99,r=()=>(n=n*16807%2147483647)/2147483647;for(let e=0;e<N;e++)for(let n=0;n<P;n++){let i=(e*P+n)*3;t[i]=e,t[i+1]=-Math.PI/2+(n+r())/P*Math.PI,t[i+2]=r()*100}return e.setAttribute(`position`,new x(t,3)),e},[]);(0,D.useEffect)(()=>()=>k.dispose(),[k]);let j=(0,D.useMemo)(()=>new c({vertexShader:te,fragmentShader:ne,uniforms:{tSim:{value:w},uScale:{value:400},uSize:{value:F*1.3},uTime:{value:0},uGlint:{value:0},uA:{value:new u},uB:{value:new u},uC:{value:new u}}}),[w]);(0,D.useEffect)(()=>()=>j.dispose(),[j]);let B=(0,D.useMemo)(()=>({uNeck:{value:t.get()},uOff:{value:.012}}),[t]),V=(0,D.useMemo)(()=>new c({vertexShader:H,fragmentShader:U,uniforms:{...B,uBack:{value:1}},transparent:!0,depthWrite:!1,side:1}),[B]),K=(0,D.useMemo)(()=>new c({vertexShader:H,fragmentShader:U,uniforms:{...B,uBack:{value:0}},transparent:!0,depthWrite:!1,side:0}),[B]),Y=(0,D.useMemo)(()=>new p(1,1,O*2,72,180,!0),[]),X=(0,D.useMemo)(()=>{let e=q();return{cap:new f({map:e,color:`#ffffff`,roughness:.52,metalness:0}),pillar:new f({map:e,color:`#f2e2d2`,roughness:.45,metalness:0}),capGeo:J(),pillarGeo:re()}},[]),Z=(0,D.useMemo)(()=>new c({vertexShader:W,fragmentShader:G,uniforms:{uExt:{value:new g(1,1)},uLift:{value:0},uCap:{value:1}},transparent:!0,depthWrite:!1}),[]),Q=(0,D.useRef)(0);b((a,o)=>{let s=Math.min(o,1/30);Q.current+=s;let c=e.get(),u=h.current,f=Math.abs(Math.sin(c)),p=Math.abs(Math.cos(c)),m=Math.abs(c-Math.round(c/Math.PI)*Math.PI),g=.42*Math.sin(Math.min(m,Math.PI/2))**.8,_=Math.max(0,R*f+z*p-z)+g;u&&(u.rotation.z=c,u.position.y=_,u.rotation.y=Math.sin(Q.current*.35)*.06);let v=E.current;if(v.dt+=s,v.latest){let e=v.latest;v.latest=null,v.spare=w.image.data,w.image.data=e.buf,w.needsUpdate=!0;let t=i.current;t.upper=e.upper,t.passed=e.passed,v.ready=!0}if(!v.busy&&v.worker){let r=t.get(),i=Math.abs(e.getVelocity()),a=ee*(1-.82*S.smoothstep(i,.4,2.2)),o={type:`tick`,dt:v.ready?v.dt:0,gx:-a*Math.sin(c),gy:-a*Math.cos(c),neck:r,flow:n.current,up:Math.cos(c)>=0?1:-1},s=v.spare;s&&s.length===N*4?(o.buf=s,v.worker.postMessage(o,[s.buffer])):v.worker.postMessage(o),v.spare=void 0,v.busy=!0,v.dt=0}let y=j.uniforms;y.uScale.value=l.height*d/(2*Math.tan(S.degToRad(a.camera.fov/2))),y.uTime.value=Q.current;let b=r.current;y.uA.value.setRGB(b.a[0],b.a[1],b.a[2]),y.uB.value.setRGB(b.b[0],b.b[1],b.b[2]),y.uC.value.setRGB(b.c[0],b.c[1],b.c[2]),y.uGlint.value=b.glint,B.uNeck.value=t.get();let x=Z.uniforms;x.uExt.value.set(R*p+z*f*.92,R*.92),x.uLift.value=_,x.uCap.value=Math.max(0,1-_*6)});let $=[Math.PI/2+Math.PI/3,Math.PI/2-Math.PI/3,-Math.PI/2];return(0,A.jsxs)(A.Fragment,{children:[(0,A.jsx)(`ambientLight`,{intensity:1.15,color:`#fff4e8`}),(0,A.jsx)(`hemisphereLight`,{args:[`#fff8ef`,`#d9b28c`,.7]}),(0,A.jsx)(`directionalLight`,{position:[-3.5,5,4],intensity:2.1,color:`#fff1df`}),(0,A.jsx)(`directionalLight`,{position:[4,1.5,2],intensity:.55,color:`#ffd9b8`}),(0,A.jsx)(`mesh`,{"rotation-x":-Math.PI/2,"position-y":-z-.002,material:Z,renderOrder:-1,children:(0,A.jsx)(`planeGeometry`,{args:[9,9]})}),(0,A.jsxs)(`group`,{ref:h,children:[(0,A.jsx)(`points`,{geometry:k,material:j,frustumCulled:!1}),(0,A.jsx)(`mesh`,{geometry:Y,material:V,renderOrder:2,frustumCulled:!1}),(0,A.jsx)(`mesh`,{geometry:Y,material:K,renderOrder:3,frustumCulled:!1}),(0,A.jsx)(`mesh`,{geometry:X.capGeo,material:X.cap,"position-y":O+L/2}),(0,A.jsx)(`mesh`,{geometry:X.capGeo,material:X.cap,"position-y":-O-L/2,"rotation-x":Math.PI}),$.map((e,t)=>(0,A.jsx)(`mesh`,{geometry:X.pillarGeo,material:X.pillar,position:[Math.cos(e)*.98,0,Math.sin(e)*.98]},t)),(0,A.jsxs)(`mesh`,{onClick:e=>{e.stopPropagation(),a()},onPointerOver:()=>document.body.style.cursor=`pointer`,onPointerOut:()=>document.body.style.cursor=``,children:[(0,A.jsx)(`cylinderGeometry`,{args:[I,I,z*2,24]}),(0,A.jsx)(`meshBasicMaterial`,{transparent:!0,opacity:0,depthWrite:!1,colorWrite:!1})]})]})]})}var Z=e=>{e=Math.max(0,e);let t=Math.floor(e/60),n=e-t*60;return`${String(t).padStart(2,`0`)}:${n.toFixed(1).padStart(4,`0`)}`};function Q(){let[e,t]=(0,D.useState)(0),[n,o]=(0,D.useState)(1),[s,c]=(0,D.useState)(0),l=i(0),u=i(B[1].neck),d=(0,D.useRef)(B[1].flow),f=(0,D.useRef)({upper:N,passed:0,shown:-1}),p=(0,D.useRef)({a:K(V[0].pal.a),b:K(V[0].pal.b),c:K(V[0].pal.c),glint:0}),m=(0,D.useRef)(0),h=(0,D.useRef)(null),g=(0,D.useRef)(null),_=(0,D.useRef)(null),v=(0,D.useRef)(null),y=(0,D.useCallback)(()=>{m.current=Math.round(l.get()/Math.PI)*Math.PI+Math.PI,r(l,m.current,{type:`spring`,stiffness:62,damping:10.5,mass:1}),c(e=>e+1)},[l]);(0,D.useEffect)(()=>{let e=B[n];d.current=e.flow;let t=r(u,e.neck,{type:`spring`,stiffness:120,damping:18});return()=>t.stop()},[n,u]),(0,D.useEffect)(()=>{let t={a:[...p.current.a],b:[...p.current.b],c:[...p.current.c],glint:p.current.glint},n=V[e].pal,i=K(n.a),a=K(n.b),o=K(n.c),s=r(0,1,{duration:.9,ease:[.23,1,.32,1],onUpdate:e=>{let r=p.current;for(let n=0;n<3;n++)r.a[n]=t.a[n]+(i[n]-t.a[n])*e,r.b[n]=t.b[n]+(a[n]-t.b[n])*e,r.c[n]=t.c[n]+(o[n]-t.c[n])*e;r.glint=t.glint+(n.glint-t.glint)*e}});return()=>s.stop()},[e]),(0,D.useEffect)(()=>{let e=0,t=performance.now(),n=0,r=``,i=()=>{e=requestAnimationFrame(i);let a=performance.now(),o=Math.min((a-t)/1e3,.1);t=a;let s=f.current,c=d.current*.985,u=s.upper/c,p=Math.abs(l.get()-m.current)>.05;s.shown<0?s.shown=u:(s.shown-=p?0:o,s.shown+=(u-s.shown)*Math.min(1,o*(p?4:.8))),s.upper===0&&(s.shown=Math.max(0,s.shown-o*4));let b=Z(s.shown);b!==r&&h.current&&(h.current.textContent=b,r=b),g.current&&(g.current.style.transform=`scaleX(${(s.upper/N).toFixed(4)})`),_.current&&(_.current.textContent=`${s.upper.toLocaleString()} / ${N.toLocaleString()}`);let x=s.upper<=2&&!p;n=x?n+o:0,v.current&&(v.current.textContent=x?`已流尽 · 即将翻转`:p?`翻转中`:`流动中`),n>2.4&&!T&&(n=-10,y())};return e=requestAnimationFrame(i),()=>cancelAnimationFrame(e)},[y,l]);let b=V[e].bg;return(0,A.jsxs)(`div`,{className:`stage hg`,style:{background:`radial-gradient(90% 80% at 62% 42%, #fffaf3 0%, ${b} 55%, #e6dccd 100%)`,transition:`background 0.9s`},children:[(0,A.jsx)(`style`,{children:$}),(0,A.jsxs)(w,{flat:!0,dpr:[1,2],gl:{antialias:!0,alpha:!0},camera:{fov:28,position:[0,1.3,10]},children:[(0,A.jsx)(Y,{}),(0,A.jsx)(X,{theta:l,neckMv:u,flowRef:d,pal:p,stats:f,onFlip:y})]}),(0,A.jsxs)(`div`,{className:`overlay`,children:[(0,A.jsxs)(a.div,{className:`hero-copy`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.7,delay:.2,ease:[.23,1,.32,1]},children:[(0,A.jsx)(`div`,{className:`scrim`,style:{"--soft-bg":`#f6f0e7`}}),(0,A.jsxs)(`p`,{className:`kicker`,children:[(0,A.jsx)(`i`,{}),` Granular · 2.5D`]}),(0,A.jsxs)(`h1`,{children:[`时间，`,(0,A.jsx)(`br`,{}),`一粒一粒地落下`]}),(0,A.jsxs)(`p`,{className:`hg-lede`,children:[N.toLocaleString(),` 粒沙在沙漏截面里做带摩擦的位置约束模拟，再绕轴旋转成 `,(N*P).toLocaleString(),` 粒立体的沙堆。点一下沙漏把它翻过来，重力始终朝下。`]}),(0,A.jsxs)(`div`,{className:`hg-timer`,children:[(0,A.jsxs)(`div`,{className:`hg-timer-row`,children:[(0,A.jsx)(`span`,{className:`hg-time`,ref:h,children:`00:00.0`}),(0,A.jsxs)(`span`,{className:`hg-state`,children:[(0,A.jsx)(`i`,{}),(0,A.jsx)(`span`,{ref:v,children:`流动中`})]})]}),(0,A.jsx)(`span`,{className:`hg-bar`,children:(0,A.jsx)(`span`,{ref:g})}),(0,A.jsxs)(`p`,{className:`hg-meta`,children:[`上层剩余 `,(0,A.jsx)(`span`,{ref:_,children:`—`}),` 粒 · 已翻转 `,s,` 次`]})]})]}),(0,A.jsxs)(`div`,{className:`dock hg-dock`,children:[(0,A.jsxs)(`button`,{className:`seg hg-flip`,onClick:y,"aria-label":`翻转沙漏`,children:[(0,A.jsx)(a.svg,{width:`14`,height:`14`,viewBox:`0 0 14 14`,"aria-hidden":!0,initial:{rotate:-180},animate:{rotate:0},transition:{type:`spring`,stiffness:300,damping:18},children:(0,A.jsx)(`path`,{d:`M3.5 1.8h7M3.5 12.2h7M4.2 2c0 3 5.6 3.4 5.6 5s-5.6 2-5.6 5M9.8 2c0 3-5.6 3.4-5.6 5s5.6 2 5.6 5`,fill:`none`,stroke:`currentColor`,strokeWidth:`1.3`,strokeLinecap:`round`})},s),(0,A.jsx)(`span`,{className:`hg-flip-label`,children:`翻转`})]}),(0,A.jsx)(`span`,{className:`dock-sep`}),(0,A.jsx)(E,{items:B.map(e=>({value:e.value,label:e.label})),value:n,onChange:o}),(0,A.jsx)(`span`,{className:`dock-sep`}),(0,A.jsx)(E,{items:V.map(e=>({value:e.value,label:e.label})),value:e,onChange:t})]}),(0,A.jsxs)(`p`,{className:`hint`,children:[`点击沙漏翻转`,(0,A.jsx)(`br`,{}),`颈口越宽，沙流越快`]})]})]})}var $=`
.hg .hg-lede { max-width: 400px }
.hg-timer { margin-top: 30px; width: min(320px, 100%) }
.hg-timer-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px }
.hg-time {
  font: 500 44px/1 var(--mono); letter-spacing: -0.02em; color: var(--fg);
  font-variant-numeric: tabular-nums;
}
.hg-state { display: inline-flex; align-items: center; gap: 7px; font: 500 12px/1 var(--sans); color: var(--fg-2); white-space: nowrap }
.hg-state i { width: 6px; height: 6px; border-radius: 50%; background: #c98a4b; animation: hg-blink 1.6s ease-in-out infinite }
@keyframes hg-blink { 50% { opacity: .3 } }
.hg-bar { position: relative; display: block; height: 3px; margin-top: 14px; border-radius: 3px; background: rgba(29,28,26,.09); overflow: hidden }
.hg-bar span { position: absolute; inset: 0; background: linear-gradient(90deg, #b9783c, #e2b06b); transform-origin: left; border-radius: inherit }
.hg-meta { margin: 10px 0 0 !important; font: 12px/1.4 var(--mono) !important; color: var(--fg-2) }
.hg-flip { display: inline-flex; align-items: center; gap: 6px; color: var(--fg) !important; background: color-mix(in srgb, var(--fg) 7%, transparent) }
.hg-flip:active { transform: scale(.96) }
@media (max-width: 760px) {
  .hg .hg-lede { display: none }
  .hg-timer { margin-top: 18px }
  .hg-time { font-size: 34px }
  .hg-dock .seg { padding: 0 9px }
  .hg-flip-label { display: none }
  .hg-dock .dock-sep { margin: 0 2px }
}
`;export{Q as default};