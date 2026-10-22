import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{Ct as r,Lt as i,Xt as a,h as o,ht as s,k as c,ot as l,u,xt as d}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as f}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as p}from"./iso-CLB38p39.js";import{n as m,t as h}from"./Lightformer-DFdpx6x6.js";import{t as g}from"./RoundedBox-DrdXcTlF.js";import{t as _}from"./BigLabel-CceM23C6.js";var v=e(t(),1),y=n(),b=16,x=4,S=64,C=.72,w=1,T=.012,E=.8049999999999999,D=1.2,O=x*D-.2,k=16,A=16,j=108,M=150,N=512;function P(){let e=document.createElement(`canvas`);e.width=1728,e.height=2400;let t=e.getContext(`2d`);t.fillStyle=`#000`,t.fillRect(0,0,e.width,e.height);let n=new c(e);n.colorSpace=``,n.anisotropy=4,n.generateMipmaps=!0,n.minFilter=s;let r=new Map,i=`600 ${Math.round(M*.74)}px Bahnschrift, "DIN Alternate", "Roboto Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif`,a=`700 ${Math.round(j*.8)}px "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", sans-serif`;t.font=i;let o=t.measureText(`H`).actualBoundingBoxAscent,l=(e,n)=>{let r=n%k*j,s=Math.floor(n/k)*M;t.save(),t.beginPath(),t.rect(r,s,j,M),t.clip(),t.fillStyle=`#000`,t.fillRect(r,s,j,M),t.fillStyle=`#fff`,t.textAlign=`center`;let c=e.charCodeAt(0)>11904;t.font=c?a:i;let l=t.measureText(e),u;u=c?s+M/2+(l.actualBoundingBoxAscent-l.actualBoundingBoxDescent)/2:s+M/2+o/2;let d=Math.min(c?1:.86,j*(c?.9:.8)/Math.max(1,l.width));t.translate(r+j/2,0),t.scale(d,1),t.fillText(e,0,u),t.restore()},u=e=>{let t=!1;for(let n of Array.from(e)){if(r.has(n)||r.size>=256)continue;let e=r.size;r.set(n,e),l(n,e),t=!0}t&&(n.needsUpdate=!0)};return u(` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:-/·!?'&@#+%()→×，、。`),{tex:n,ensure:u,index:e=>r.get(e)??r.get(`?`)??0}}var F=e=>{let t=Array.from(e),n=Math.max(0,Math.floor((b-t.length)/2));return` `.repeat(n)+e},I=(e,t)=>{let n=b-Array.from(e).length-Array.from(t).length;return e+` `.repeat(Math.max(1,n))+t},L=[{key:`dep`,title:`出发`,sub:`Departures`,aside:`逐列错落 · 50ms`,lines:[[I(`DEPARTURES`,`出发`),!0],[I(`MU5101`,`SHANGHAI`)],[I(`GATE 12`,`08:45`)],[I(`ON TIME`,`准点`),!0]]},{key:`motion`,title:`动效`,sub:`Kinetic type`,aside:`每格 3 个面`,lines:[[``],[F(`动效 · 3D · 粒子`),!0],[F(`MOTION × WEBGL`)],[``]]},{key:`arr`,title:`到达`,sub:`Arrivals`,aside:`64 片翻牌`,lines:[[I(`ARRIVALS`,`到达`),!0],[I(`NH919`,`TOKYO`)],[I(`BELT 5`,`21:30`)],[I(`LANDED`,`已到达`),!0]]},{key:`ship`,title:`交付`,sub:`Design → Code`,aside:`重力缓动 + 回弹`,lines:[[``],[F(`DESIGN → CODE`)],[F(`设计 → 代码 → 上线`),!0],[``]]},{key:`hello`,title:`你好`,sub:`Hello, world`,aside:`试试输入你自己的话`,lines:[[``],[F(`HELLO, WORLD!`)],[F(`你好，世界`),!0],[``]]}];function R(e){let t=e.trim().toUpperCase().split(/\s+/).filter(Boolean),n=[],r=``;for(let e of t){let t=e;for(;Array.from(t).length>b;)r&&=(n.push(r),``),n.push(Array.from(t).slice(0,b).join(``)),t=Array.from(t).slice(b).join(``);let i=r?`${r} ${t}`:t;Array.from(i).length>b?(n.push(r),r=t):r=i}r&&n.push(r);let i=n.slice(0,x).map(F),a=Math.floor((x-i.length)/2);return Array.from({length:x},(e,t)=>[i[t-a]??``,t-a===0&&i.length>1])}var z=`
  #define PI 3.14159265
  attribute float aA;
  attribute float aB;
  attribute float aAngle;
  uniform float uPart; // 0 top, 1 bottom, 2 flap
  varying vec2 vCell;
  varying vec2 vCellBack;
  varying float vA;
  varying float vB;
  varying float vShadeF;
  varying float vShadeB;
  varying float vDrop;
  void main() {
    vec3 p = position;
    vCell = vec2(p.x / ${C.toFixed(3)} + 0.5, p.y + 0.5);
    vCellBack = vec2(vCell.x, 0.5 - p.y);
    vec3 n = vec3(0.0, 0.0, 1.0);
    if (uPart > 1.5) {
      float c = cos(aAngle), s = sin(aAngle);
      p = vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
      n = vec3(0.0, -s, c);
      p.z += 0.006;
    }
    vec3 L = normalize(vec3(-0.25, 0.85, 0.75));
    vShadeF = 0.5 + 0.62 * max(dot(n, L), 0.0);
    vShadeB = 0.5 + 0.62 * max(dot(-n, L), 0.0);
    // the falling flap darkens the half it is about to cover
    vDrop = uPart > 0.5 && uPart < 1.5 ? smoothstep(0.35, 1.0, aAngle / PI) * (1.0 - smoothstep(0.92, 1.0, aAngle / PI)) : 0.0;
    vA = aA;
    vB = aB;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`,B=`
  uniform sampler2D uAtlas;
  uniform float uPart;
  varying vec2 vCell;
  varying vec2 vCellBack;
  varying float vA;
  varying float vB;
  varying float vShadeF;
  varying float vShadeB;
  varying float vDrop;

  vec3 card(float code, vec2 cell, float shade, float lower) {
    float amber = step(${N}.0 - 0.5, code);
    float idx = floor(code - amber * ${N}.0 + 0.5);
    float row = floor((idx + 0.5) / ${k}.0);
    float col = idx - row * ${k}.0;
    vec2 uv = vec2((col + cell.x) / ${k}.0, 1.0 - (row + 1.0 - cell.y) / ${A}.0);
    float ink = texture2D(uAtlas, uv).r;
    vec3 base = mix(vec3(0.085, 0.085, 0.095), vec3(0.13, 0.13, 0.145), cell.y);
    // a faint bevel at the card edges and a dark slit at the hinge
    float ex = min(cell.x, 1.0 - cell.x);
    base *= 0.82 + 0.18 * smoothstep(0.0, 0.06, ex);
    float hinge = abs(cell.y - 0.5);
    base *= 0.55 + 0.45 * smoothstep(0.0, 0.05, hinge);
    vec3 glyph = mix(vec3(0.95, 0.93, 0.88), vec3(1.0, 0.76, 0.33), amber);
    vec3 c = mix(base, glyph * (0.82 + 0.18 * cell.y), ink);
    c *= shade * mix(1.0, 0.86, lower);
    return c;
  }

  void main() {
    // rounded card corners
    vec2 q = abs(vCell - 0.5) * vec2(${C.toFixed(3)}, 1.0);
    vec2 d = q - vec2(${C/2-.05}, 0.45);
    if (length(max(d, 0.0)) > 0.05) discard;

    vec3 c;
    if (uPart < 0.5) c = card(vB, vCell, vShadeF, 0.0);
    else if (uPart < 1.5) c = card(vA, vCell, vShadeF, 1.0) * (1.0 - 0.45 * vDrop);
    else c = gl_FrontFacing ? card(vA, vCell, vShadeF, 0.0) : card(vB, vCellBack, vShadeB, 1.0);
    gl_FragColor = vec4(c, 1.0);
  }
`,V=.72;function H({atlas:e,target:t}){let n=(0,v.useRef)([]),o=(0,v.useMemo)(()=>Array.from({length:S},()=>({cur:0,queue:[],t:0,delay:0})),[]),s=(0,v.useMemo)(()=>({a:new l(new Float32Array(S),1),b:new l(new Float32Array(S),1),angle:new l(new Float32Array(S),1)}),[]),c=(0,v.useMemo)(()=>{let t=(e,t)=>{let n=new i(C,t-e);return n.translate(0,(e+t)/2,0),n.setAttribute(`aA`,s.a),n.setAttribute(`aB`,s.b),n.setAttribute(`aAngle`,s.angle),n},n=t(T,.5),r=t(-.5,-.012),o=t(T,.5),c=t=>new a({uniforms:{uAtlas:{value:e.tex},uPart:{value:t}},vertexShader:z,fragmentShader:B,side:t===2?2:0});return[{geo:n,mat:c(0)},{geo:r,mat:c(1)},{geo:o,mat:c(2)}]},[e,s]);return(0,v.useLayoutEffect)(()=>{let e=new r;for(let t of n.current)if(t){for(let n=0;n<S;n++){let r=n%b,i=Math.floor(n/b);e.makeTranslation(-6.037499999999999+r*E,O/2-w/2-i*D,0),t.setMatrixAt(n,e)}t.instanceMatrix.needsUpdate=!0}},[]),(0,v.useEffect)(()=>{let e=e=>{let t=e%N;return t<43?t:Math.floor(Math.random()*43)};for(let n=0;n<S;n++){let r=o[n],i=t[n];if((r.queue.length?r.queue[r.queue.length-1]:r.cur)===i)continue;let a=i>=N?N:0,s=2+Math.floor(Math.random()*5),c=e(r.queue.length?r.queue[0]:r.cur),l=r.queue.length?[r.queue[0]]:[],u=[];for(let e=1;e<=s;e++)u.push((c+e)%43+a);if(r.queue=[...l,...u,i],!l.length){let e=n%b,t=Math.floor(n/b);r.delay=e*.05+t*.11+Math.random()*.06,r.t=0}}},[t,o]),u((e,t)=>{let n=Math.min(t,1/30),r=s.a.array,i=s.b.array,a=s.angle.array;for(let e=0;e<S;e++){let t=o[e];if(!t.queue.length){r[e]=i[e]=t.cur,a[e]=0;continue}if(t.delay>0){t.delay-=n,r[e]=i[e]=t.cur,a[e]=0;continue}let s=t.queue.length===1;if(t.t+=n/(s?.34:.105),t.t>=1){t.cur=t.queue.shift(),t.t=t.queue.length?Math.min(t.t-1,.5):0,r[e]=i[e]=t.cur,a[e]=0;continue}let c=t.queue[0],l=t.t;if(l<V){let n=l/V;r[e]=t.cur,i[e]=c,a[e]=Math.PI*(.18*n+.82*n*n)}else{let t=(l-V)/.28;r[e]=i[e]=c,a[e]=Math.PI-Math.sin(Math.PI*t)*(1-t)*(s?.42:.16)}}s.a.needsUpdate=s.b.needsUpdate=s.angle.needsUpdate=!0}),(0,y.jsx)(y.Fragment,{children:c.map((e,t)=>(0,y.jsx)(`instancedMesh`,{ref:e=>void(n.current[t]=e),args:[e.geo,e.mat,S],frustumCulled:!1},t))})}function U(){let e=5.699999999999999;return(0,y.jsxs)(`group`,{children:[(0,y.jsx)(g,{args:[13.694999999999999,e,.5],radius:.16,smoothness:5,position:[0,0,-.32],children:(0,y.jsx)(`meshStandardMaterial`,{color:`#5a5a62`,metalness:.92,roughness:.3})}),(0,y.jsxs)(`mesh`,{position:[0,0,-.06],children:[(0,y.jsx)(`planeGeometry`,{args:[13.094999999999999,5.02]}),(0,y.jsx)(`meshStandardMaterial`,{color:`#060607`,roughness:.7,metalness:.2})]}),Array.from({length:5},(e,t)=>(0,y.jsxs)(`mesh`,{position:[0,2.4-t*D,-.02],children:[(0,y.jsx)(`boxGeometry`,{args:[13.034999999999998,.05,.05]}),(0,y.jsx)(`meshStandardMaterial`,{color:`#8a8a92`,metalness:1,roughness:.22})]},t)),(0,y.jsxs)(`mesh`,{position:[-6.097499999999999,e/2-.27,-.05],children:[(0,y.jsx)(`circleGeometry`,{args:[.06,20]}),(0,y.jsx)(`meshBasicMaterial`,{color:`#ffb547`,toneMapped:!1})]}),(0,y.jsxs)(`mesh`,{position:[-5.8774999999999995,e/2-.27,-.05],children:[(0,y.jsx)(`circleGeometry`,{args:[.06,20]}),(0,y.jsx)(`meshBasicMaterial`,{color:`#3c3c42`})]})]})}function W({children:e}){let t=(0,v.useRef)(null),n=o(e=>e.camera),{width:r,height:i}=o(e=>e.size);return(0,v.useLayoutEffect)(()=>{let e=r<760,t=r/i,a=d.degToRad(n.fov/2),o=e?.9:.74,s=e?.5:.56,c=Math.max(13.994999999999997/2/(Math.tan(a)*t*o),3/(Math.tan(a)*s));n.position.set(0,0,c),n.lookAt(0,0,0);let l=p?0:e?.1:.07;n.setViewOffset(r,i,0,l*i,r,i),n.updateProjectionMatrix()},[n,r,i]),u((e,n)=>{if(!t.current)return;let r=Math.min(n,1/30),i=e.clock.elapsedTime;t.current.rotation.y=d.damp(t.current.rotation.y,-.16+e.pointer.x*.14+Math.sin(i*.25)*.03,3,r),t.current.rotation.x=d.damp(t.current.rotation.x,-.1-e.pointer.y*.1,3,r)}),(0,y.jsx)(`group`,{ref:t,children:e})}function G(){let e=(0,v.useMemo)(P,[]),[t,n]=(0,v.useState)(0),[r,i]=(0,v.useState)(null),[a,o]=(0,v.useState)(``),[s,c]=(0,v.useState)(!0),l=(0,v.useRef)(0),u=r??L[t].lines,d=(0,v.useMemo)(()=>{let t=[];for(let n=0;n<x;n++){let[r,i]=u[n]??[``];e.ensure(r);let a=Array.from(r);for(let n=0;n<b;n++)t.push(e.index(a[n]??` `)+(i&&a[n]&&a[n]!==` `?N:0))}return t},[u,e]);(0,v.useEffect)(()=>{if(!s)return;let e=setInterval(()=>{performance.now()<l.current||(i(null),n(e=>(e+1)%L.length))},6500);return()=>clearInterval(e)},[s]);let p=()=>{let e=a.trim();e&&(i(R(e)),l.current=performance.now()+12e3)},g=L[t];return(0,y.jsxs)(`div`,{className:`stage flap-stage`,children:[(0,y.jsx)(`style`,{children:`
        .flap-stage { background: radial-gradient(80% 70% at 50% 38%, #1f1d1b 0%, #121214 55%, #0b0b0c 100%); }
        .flap-stage .flap-glow { position: absolute; left: 50%; top: 40%; width: min(90vw, 1100px); height: 46vh; transform: translate(-50%, -50%);
          background: radial-gradient(closest-side, rgba(242, 196, 109, 0.12), transparent 70%); pointer-events: none; }
        .flap-input { width: clamp(150px, 26vw, 280px); height: 34px; padding: 0 14px; border: 0; border-radius: 999px; outline: none;
          background: rgba(255, 255, 255, 0.06); color: var(--fg); font: 500 13px/1 var(--sans); }
        .flap-input::placeholder { color: var(--fg-2); }
        .flap-input:focus { box-shadow: inset 0 0 0 1px rgba(242, 196, 109, 0.55); }
        .flap-go { color: #f2c46d !important; }
        @media (max-width: 760px) { .flap-stage .flap-glow { top: 30%; } }
      `}),(0,y.jsx)(`div`,{className:`flap-glow`,"aria-hidden":!0}),(0,y.jsxs)(f,{dpr:[1,2],camera:{fov:30,near:.1,far:200},gl:{antialias:!0,alpha:!0},children:[(0,y.jsxs)(m,{resolution:256,frames:1,children:[(0,y.jsx)(h,{form:`rect`,intensity:2.2,color:`#fff3df`,position:[0,6,4],scale:[14,2.4,1],target:[0,0,0]}),(0,y.jsx)(h,{form:`rect`,intensity:1.4,color:`#ffd59a`,position:[-8,1,3],scale:[3,8,1],target:[0,0,0]}),(0,y.jsx)(h,{form:`rect`,intensity:.9,color:`#9fb6ff`,position:[8,-2,3],scale:[3,8,1],target:[0,0,0]}),(0,y.jsx)(h,{form:`rect`,intensity:1.6,color:`#ffffff`,position:[0,3.2,12],scale:[40,1.1,1],target:[0,0,0]}),(0,y.jsx)(h,{form:`rect`,intensity:.5,color:`#ffe2b8`,position:[0,-4,12],scale:[40,3,1],target:[0,0,0]}),(0,y.jsx)(h,{form:`ring`,intensity:1.2,color:`#ffffff`,position:[3,3,6],scale:2,target:[0,0,0]})]}),(0,y.jsx)(`ambientLight`,{intensity:.25}),(0,y.jsxs)(W,{children:[(0,y.jsx)(U,{}),(0,y.jsx)(H,{atlas:e,target:d})]})]}),(0,y.jsxs)(`div`,{className:`overlay`,children:[(0,y.jsx)(_,{id:r?`custom`:g.key,meta:r?`CUSTOM · 64 FLAPS`:`${String(t+1).padStart(2,`0`)} / ${String(L.length).padStart(2,`0`)} · 64 FLAPS`,title:r?`你的文字`:g.title,sub:r?`Your message`:g.sub,aside:r?`12 秒后继续轮播`:g.aside}),(0,y.jsxs)(`form`,{className:`dock`,onSubmit:e=>{e.preventDefault(),p()},children:[(0,y.jsx)(`input`,{className:`flap-input`,value:a,maxLength:64,placeholder:`输入一句话，回车翻牌…`,onChange:e=>o(e.target.value),"aria-label":`翻牌内容`}),(0,y.jsx)(`button`,{className:`seg flap-go`,type:`submit`,children:(0,y.jsx)(`span`,{children:`翻牌`})}),(0,y.jsx)(`span`,{className:`dock-sep`}),(0,y.jsx)(`button`,{className:`seg`,type:`button`,onClick:()=>{i(null),n(e=>(e+1)%L.length),l.current=performance.now()+4e3},children:(0,y.jsx)(`span`,{children:`下一条`})}),(0,y.jsx)(`button`,{className:`seg`,type:`button`,"aria-pressed":s,onClick:()=>c(e=>!e),children:(0,y.jsx)(`span`,{children:s?`暂停`:`轮播`})})]}),(0,y.jsx)(`p`,{className:`hint`,children:`移动指针改变视角 · 中英文都能翻`})]})]})}export{G as default};