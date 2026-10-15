import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./use-transform-D6WS83kB.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{t as a}from"./use-motion-value-CIZAIwyH.js";import{n as o}from"./index-uImfd-0P.js";import{Gt as s,Jt as c,N as l,T as u,at as d,gn as f,h as p,ot as m,u as h,w as g,yt as _}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as v}from"./react-three-fiber.esm-BQtD7wyt.js";import{t as y}from"./Seg-BfWvO_Xs.js";import{a as b,n as x,r as S,t as C}from"./dist-vKXJJnic.js";var w=e(t(),1),T=n(),E=64,D=2.4,O=E*D,k=3.4,A=12,j=typeof window<`u`&&window.innerWidth<760?900:2e3,M=[{key:`aurora`,label:`极光`,ring:`#6bffd8`,ringWarp:`#7f8bff`,head:`#e8fff8`,tail:`#3fd2c7`,tailWarp:`#ff4fd8`,bg:`#04070a`},{key:`sunset`,label:`日落`,ring:`#ffad5c`,ringWarp:`#ff4f86`,head:`#fff3dc`,tail:`#ff8a5c`,tailWarp:`#6b7bff`,bg:`#0a0506`},{key:`volt`,label:`电光`,ring:`#5b8cff`,ringWarp:`#c46bff`,head:`#eef3ff`,tail:`#5b8cff`,tailWarp:`#3fffd2`,bg:`#05050c`}],N=`
  uniform float uTravel;
  vec2 path(float s) {
    return vec2(sin(s * 0.019) * 9.0 + sin(s * 0.043 + 1.7) * 3.0, sin(s * 0.015 + 0.6) * 6.0 + cos(s * 0.037) * 2.4);
  }
  vec2 dpath(float s) {
    return vec2(cos(s * 0.019) * 0.171 + cos(s * 0.043 + 1.7) * 0.129, cos(s * 0.015 + 0.6) * 0.09 - sin(s * 0.037) * 0.0888);
  }
  vec2 bend(float z) {
    float s = uTravel - z;
    return path(s) - path(uTravel) - dpath(uTravel) * (-z);
  }
  float depthFade(float d) {
    return smoothstep(0.6, 5.0, d) * exp(-d * 0.021);
  }
`,P=`
  ${N}
  attribute float aSlot;
  uniform float uTwist;
  varying float vBand;
  varying float vDepth;
  void main() {
    float z = -mod(aSlot * ${D.toFixed(2)} - uTravel, ${O.toFixed(2)});
    float s = uTravel - z;
    float a = s * uTwist;
    vec2 p = position.xy;
    vBand = length(p);
    p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p * ${k.toFixed(2)};
    vDepth = -z;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + bend(z), z, 1.0);
  }
`,F=`
  uniform vec3 uRing;
  uniform vec3 uRingWarp;
  uniform float uWarp;
  uniform float uPulse;
  varying float vBand;
  varying float vDepth;
  float depthFade(float d) { return smoothstep(0.6, 5.0, d) * exp(-d * 0.021); }
  void main() {
    float prof = 1.0 - abs(vBand - 0.988) / 0.012;
    prof = clamp(prof, 0.0, 1.0);
    prof *= prof;
    // a travelling brightness wave along the tunnel
    float wave = 0.65 + 0.35 * sin(vDepth * 0.35 - uPulse * 6.0);
    vec3 c = mix(uRing, uRingWarp, uWarp) * (1.3 + uWarp * 1.4) * wave;
    gl_FragColor = vec4(c * prof * depthFade(vDepth), 1.0);
  }
`,I=`
  ${N}
  attribute vec3 aRail; // slot, angle, end
  uniform float uTwist;
  varying float vDepth;
  void main() {
    float z = -mod(aRail.x * ${D.toFixed(2)} - uTravel, ${O.toFixed(2)}) - aRail.z * ${D.toFixed(2)};
    float s = uTravel - z;
    float a = aRail.y + s * uTwist;
    vDepth = -z;
    gl_Position = projectionMatrix * viewMatrix * vec4(vec2(cos(a), sin(a)) * ${k.toFixed(2)} + bend(z), z, 1.0);
  }
`,L=`
  uniform vec3 uRing;
  uniform vec3 uRingWarp;
  uniform float uWarp;
  varying float vDepth;
  float depthFade(float d) { return smoothstep(0.6, 5.0, d) * exp(-d * 0.021); }
  void main() {
    gl_FragColor = vec4(mix(uRing, uRingWarp, uWarp) * 0.32 * depthFade(vDepth), 1.0);
  }
`,R=`
  ${N}
  attribute vec4 aSeed; // angle, radius, offset, speed
  uniform float uSpeedTravel;
  uniform float uStreak;
  uniform vec2 uRes;
  uniform float uDpr;
  varying float vEnd;
  varying float vSide;
  varying float vFade;
  vec3 at(float z) {
    float r = aSeed.y * ${(k*.96).toFixed(2)};
    return vec3(vec2(cos(aSeed.x), sin(aSeed.x)) * r + bend(z), z);
  }
  void main() {
    float zh = -mod(aSeed.z - uSpeedTravel * aSeed.w, ${O.toFixed(2)});
    zh = min(zh, -0.35);
    float zt = zh - uStreak * (0.55 + 0.45 * aSeed.w);
    vec4 ch = projectionMatrix * viewMatrix * vec4(at(zh), 1.0);
    vec4 ct = projectionMatrix * viewMatrix * vec4(at(zt), 1.0);
    vec2 sh = ch.xy / ch.w * uRes;
    vec2 st = ct.xy / ct.w * uRes;
    vec2 dir = sh - st;
    float l = length(dir);
    dir = l > 0.001 ? dir / l : vec2(0.0, 1.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = clamp(7.0 / -zh, 0.7, 3.2) * uDpr;
    vec4 c = position.y < 0.5 ? ch : ct;
    vec2 off = nrm * position.x * w + dir * (position.y < 0.5 ? w : -w * 0.5);
    c.xy += off / uRes * c.w;
    gl_Position = c;
    vEnd = position.y;
    vSide = position.x;
    vFade = depthFade(-zh) * (0.5 + 0.5 * aSeed.w);
  }
`,z=`
  uniform vec3 uHead;
  uniform vec3 uTail;
  uniform vec3 uTailWarp;
  uniform float uChroma;
  varying float vEnd;
  varying float vSide;
  varying float vFade;
  void main() {
    float across = 1.0 - vSide * vSide;
    float along = pow(1.0 - vEnd, 1.4);
    vec3 tail = mix(uTail, uTailWarp, uChroma);
    // chromatic split: the trailing part of the streak drifts toward the warp hue
    vec3 c = mix(uHead, tail, smoothstep(0.0, 0.7, vEnd + uChroma * 0.25));
    gl_FragColor = vec4(c * across * along * vFade * 1.8, 1.0);
  }
`;function B({springs:e,palette:t,hex:n,pointer:r}){let i=p(e=>e.camera),a=p(e=>e.size),o=p(e=>e.viewport.dpr),v=(0,w.useRef)({travel:0,streakTravel:0,pulse:0,yaw:0,pitch:0}),y=(0,w.useMemo)(()=>({uTravel:{value:0},uTwist:{value:.012},uWarp:{value:0},uPulse:{value:0},uRing:{value:new l(M[0].ring)},uRingWarp:{value:new l(M[0].ringWarp)}}),[]),b=(0,w.useMemo)(()=>({uTravel:y.uTravel,uSpeedTravel:{value:0},uStreak:{value:.3},uRes:{value:new f(1,1)},uDpr:{value:1},uChroma:{value:0},uHead:{value:new l(M[0].head)},uTail:{value:new l(M[0].tail)},uTailWarp:{value:new l(M[0].tailWarp)}}),[y]),x=(0,w.useMemo)(()=>{let e=new s(.976,1,n?6:128,1);return e.setAttribute(`aSlot`,new d(Float32Array.from({length:E},(e,t)=>t),1)),e},[n]),S=(0,w.useMemo)(()=>new c({uniforms:y,vertexShader:P,fragmentShader:F,transparent:!0,depthWrite:!1,blending:2,side:2}),[y]),C=(0,w.useMemo)(()=>{let e=n?6:A,t=new Float32Array(E*e*2*3),r=0;for(let n=0;n<E;n++)for(let i=0;i<e;i++)for(let a=0;a<2;a++)t[r++]=n,t[r++]=i/e*Math.PI*2,t[r++]=a;let i=new u;return i.setAttribute(`aRail`,new g(t,3)),i.setAttribute(`position`,new g(new Float32Array(t.length),3)),i},[n]),D=(0,w.useMemo)(()=>new c({uniforms:y,vertexShader:I,fragmentShader:L,transparent:!0,depthWrite:!1,blending:2}),[y]),k=(0,w.useMemo)(()=>{let e=new m;e.setAttribute(`position`,new g(new Float32Array([-1,0,0,1,0,0,-1,1,0,1,1,0]),3)),e.setIndex([0,2,1,1,2,3]);let t=new Float32Array(j*4);for(let e=0;e<j;e++)t[e*4]=Math.random()*Math.PI*2,t[e*4+1]=.18+Math.random()**.45*.82,t[e*4+2]=Math.random()*O,t[e*4+3]=.55+Math.random()*.9;return e.setAttribute(`aSeed`,new d(t,4)),e.instanceCount=j,e},[]),N=(0,w.useMemo)(()=>new c({uniforms:b,vertexShader:R,fragmentShader:z,transparent:!0,side:2,depthWrite:!1,blending:2}),[b]),B=(0,w.useMemo)(()=>({ring:new l,ringWarp:new l,head:new l,tail:new l,tailWarp:new l}),[]);return h((s,c)=>{let l=Math.min(c,1/30),u=v.current,d=_.clamp(e.speed.get(),-.2,1.4),f=7+d*78;u.travel+=l*f,u.pulse+=l*(.4+d*1.6),y.uTravel.value=u.travel,y.uWarp.value=_.clamp(e.chroma.get(),0,1),y.uPulse.value=u.pulse,y.uTwist.value=n?.012+d*.01:.004,b.uSpeedTravel.value=u.travel*1.15,b.uStreak.value=.25+Math.max(0,e.streak.get())*11,b.uChroma.value=_.clamp(e.chroma.get(),0,1),b.uRes.value.set(a.width*o*.5,a.height*o*.5),b.uDpr.value=o;let p=1-Math.exp(-l*3);y.uRing.value.lerp(B.ring.set(t.ring),p),y.uRingWarp.value.lerp(B.ringWarp.set(t.ringWarp),p),b.uHead.value.lerp(B.head.set(t.head),p),b.uTail.value.lerp(B.tail.set(t.tail),p),b.uTailWarp.value.lerp(B.tailWarp.set(t.tailWarp),p);let m=58+e.fov.get()*40;Math.abs(i.fov-m)>.01&&(i.fov=m,i.updateProjectionMatrix()),u.yaw=_.damp(u.yaw,-r.current.x*.22,2.5,l),u.pitch=_.damp(u.pitch,r.current.y*.16,2.5,l);let h=Math.max(0,d-.6)*.012;i.rotation.set(u.pitch+(Math.random()-.5)*h,u.yaw+(Math.random()-.5)*h,-u.yaw*.35+Math.sin(s.clock.elapsedTime*.3)*.05)}),(0,T.jsxs)(T.Fragment,{children:[(0,T.jsx)(`instancedMesh`,{args:[x,S,E],frustumCulled:!1}),(0,T.jsx)(`lineSegments`,{geometry:C,material:D,frustumCulled:!1}),(0,T.jsx)(`mesh`,{geometry:k,material:N,frustumCulled:!1})]})}function V({chroma:e}){let t=(0,w.useRef)(null),n=(0,w.useMemo)(()=>new f(4e-4,4e-4),[]);return h(()=>{let n=Math.max(0,e.get());t.current&&t.current.offset.set(4e-4+n*.0035,3e-4+n*.002)}),(0,T.jsxs)(S,{multisampling:0,children:[(0,T.jsx)(C,{mipmapBlur:!0,intensity:1.05,luminanceThreshold:.18,luminanceSmoothing:.3,radius:.72}),(0,T.jsx)(x,{ref:t,offset:n,radialModulation:!0,modulationOffset:.25}),(0,T.jsx)(b,{eskil:!1,offset:.22,darkness:.75})]})}function H(){let e=a(0),t=i(e,{stiffness:38,damping:13,mass:1}),n=i(e,{stiffness:120,damping:11,mass:.9}),s=i(e,{stiffness:70,damping:16}),c=i(e,{stiffness:55,damping:15}),l=(0,w.useMemo)(()=>({speed:t,fov:n,streak:s,chroma:c}),[t,n,s,c]),u=r(t,e=>(.08+Math.max(0,e)*.91).toFixed(2)),d=r(t,e=>Math.min(1,Math.max(.04,.04+e*.96))),[p,m]=(0,w.useState)(!1),[h,g]=(0,w.useState)(M[0].key),[_,b]=(0,w.useState)(`ring`),x=(0,w.useRef)(0),S=(0,w.useRef)(new f),C=M.find(e=>e.key===h),E=t=>{x.current=performance.now(),e.set(+!!t),m(t)};return(0,w.useEffect)(()=>{let e=e=>S.current.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);return window.addEventListener(`pointermove`,e),()=>window.removeEventListener(`pointermove`,e)},[]),(0,w.useEffect)(()=>{let e=e=>{e.code===`Space`&&!e.repeat&&!e.target?.closest(`input, textarea, button`)&&(e.preventDefault(),E(!0))},t=e=>e.code===`Space`&&E(!1);return window.addEventListener(`keydown`,e),window.addEventListener(`keyup`,t),()=>{window.removeEventListener(`keydown`,e),window.removeEventListener(`keyup`,t)}},[]),(0,w.useEffect)(()=>{let t,n=setInterval(()=>{performance.now()-x.current<8e3||e.get()>=1||(e.set(.42),t=setTimeout(()=>e.get()<1&&e.set(0),1500))},7e3);return()=>{clearInterval(n),clearTimeout(t)}},[e]),(0,T.jsxs)(`div`,{className:`stage warp-stage`,style:{background:C.bg},onPointerDown:e=>{if(e.button===0){try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}E(!0)}},onPointerUp:()=>E(!1),onPointerCancel:()=>E(!1),onContextMenu:e=>e.preventDefault(),children:[(0,T.jsx)(`style`,{children:`
        .warp-stage { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: crosshair; transition: background .8s; }
        .warp-hud { position: absolute; left: 50%; bottom: 104px; transform: translateX(-50%); text-align: center; pointer-events: none !important; width: max-content; max-width: calc(100% - 32px); }
        .warp-hud { isolation: isolate; }
        .warp-hud::before { content: ''; position: absolute; z-index: -1; inset: -70px -160px -50px; background: radial-gradient(closest-side, rgba(0,0,0,.62), rgba(0,0,0,.3) 55%, transparent); }
        .warp-hud .k { margin: 0 0 12px; font: 500 11px/1 var(--mono); letter-spacing: .22em; color: var(--fg-2); text-transform: uppercase; }
        .warp-hud h1 { margin: 0; font: 600 clamp(30px, 4.2vw, 52px)/1.05 var(--display); letter-spacing: -.02em; text-shadow: 0 2px 30px rgba(0,0,0,.6); }
        .warp-speed { display: inline-flex; align-items: baseline; gap: 8px; margin-top: 16px; font: 500 13px/1 var(--mono); color: var(--fg-2); }
        .warp-speed b { font: 600 22px/1 var(--mono); color: var(--fg); font-variant-numeric: tabular-nums; min-width: 3.2ch; text-align: right; }
        .warp-meter { width: 180px; height: 2px; margin: 14px auto 0; border-radius: 2px; background: rgba(255,255,255,.12); overflow: hidden; }
        .warp-meter i { display: block; height: 100%; transform-origin: 0 50%; background: var(--warp-accent); box-shadow: 0 0 12px var(--warp-accent); }
        .warp-stage .dock { cursor: default; }
      `}),(0,T.jsxs)(v,{dpr:[1,2],camera:{position:[0,0,0],fov:58,near:.05,far:400},gl:{antialias:!1,alpha:!1},children:[(0,T.jsx)(`color`,{attach:`background`,args:[C.bg]}),(0,T.jsx)(B,{springs:l,palette:C,hex:_===`hex`,pointer:S}),(0,T.jsx)(V,{chroma:c})]}),(0,T.jsxs)(`div`,{className:`overlay`,style:{"--warp-accent":C.ring},children:[(0,T.jsxs)(`div`,{className:`warp-hud`,children:[(0,T.jsx)(`p`,{className:`k`,children:`Warp drive · Hold to engage`}),(0,T.jsx)(`h1`,{children:p?`曲速航行中`:`按住 进入曲速`}),(0,T.jsxs)(`div`,{className:`warp-speed`,children:[(0,T.jsx)(o.b,{children:u}),` c`]}),(0,T.jsx)(`div`,{className:`warp-meter`,children:(0,T.jsx)(o.i,{style:{scaleX:d}})})]}),(0,T.jsxs)(`div`,{className:`dock`,onPointerDown:e=>e.stopPropagation(),children:[(0,T.jsx)(y,{items:M.map(e=>({value:e.key,label:e.label})),value:h,onChange:g}),(0,T.jsx)(`span`,{className:`dock-sep`}),(0,T.jsx)(y,{items:[{value:`ring`,label:`圆环`},{value:`hex`,label:`六边`}],value:_,onChange:b})]}),(0,T.jsx)(`p`,{className:`hint`,children:`按住任意位置 · 空格键同样有效`})]})]})}export{H as default};