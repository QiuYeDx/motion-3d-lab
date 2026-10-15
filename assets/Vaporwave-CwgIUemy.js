import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{C as s,J as c,Ot as l,R as u,_n as d,en as f,gn as p,h as m,it as h,k as g,ln as _,lt as v,u as y,xt as b,yt as x,zt as S}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as C}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as w}from"./iso-C377rVhz.js";import{t as T}from"./Seg-BfWvO_Xs.js";import{t as E}from"./precompile-DQa1gWiJ.js";import{n as D,t as O}from"./stylize-crQqMM2W.js";import{n as k,t as A}from"./OriginalSplit-CgB5B9FY.js";import{a as j,i as M,n as N,o as P,r as F,t as I}from"./vaporwave--TgoV3sA.js";var L=e(t(),1),R=n(),z=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,B=[{zh:`停`,k:0},{zh:`慢`,k:.45},{zh:`中`,k:1},{zh:`快`,k:2.1}],ee={sunset:`粉橙落日 · 紫色网格 · 青色高光与品红暗部`,y2k:`冰蓝银色铬面 · 泡泡高光 · 闪烁星芒`,plaster:`粉青大理石 · 棋盘格地面 · 柔光石膏`},V={sunset:`SUNSET.MID`,y2k:`Y2K_CHROME.WAV`,plaster:`MARBLE.BMP`},H={sunset:`日落`,y2k:`千禧`,plaster:`石膏`},U={sunset:`#ff6ad5`,y2k:`#7fe9ff`,plaster:`#ff8fc0`},W={sunset:`#12062a`,y2k:`#040d2c`,plaster:`#86d4cf`},G={sunset:`#1d0733`,y2k:`#04102c`,plaster:`#3d8f8b`};function K(){let e=[],t=new S,n=new d,r=new d;for(let i=0;i<230;i++){let a=1-i/229*2,o=Math.sqrt(1-a*a),s=i*2.39996,c=new d(Math.cos(s)*o,a,Math.sin(s)*o);if(c.y<-.2||c.z>.15&&c.y<.45||Math.abs(c.x)>.8&&c.y<.25&&c.z>-.3||c.z>.5&&c.y<.56)continue;n.set(c.x*.34,1.93+c.y*.41,c.z*.38);let l=.06+i*7919%13/13*.028;r.set(l,l*.9,l),e.push(new b().compose(n,t,r))}return e}function q(){let e=[],t=new c,n=new S;for(let r=0;r<30;r++){let i=(r/29*2-1)*2.5,a=Math.sin(i)*.385,o=Math.cos(i)*.42,s=2.1+(1-Math.cos(i))*.04+(r%2?.045:-.015);t.set(r%2?.45:-.45,i+Math.PI/2,1.2,`YZX`),n.setFromEuler(t),e.push(new b().compose(new d(a,s,o),n,new d(.04,.022,.1)))}return e}function te({ry:e,onHead:t}){let n=m(e=>e.size),r=m(e=>e.viewport),i=m(e=>e.camera),a=(0,L.useRef)(null),o=(0,L.useRef)(null),c=(0,L.useRef)(null),b=(0,L.useRef)(null),x=(0,L.useRef)(null),S=(0,L.useRef)(null),C=(0,L.useRef)(null),T=(0,L.useRef)(null),D=(0,L.useRef)(null),O=E(D),k=(0,L.useRef)(w?6.5:0),A=(0,L.useMemo)(()=>new d,[]),j=(0,L.useMemo)(()=>({sphere:new f(1,48,32),curl:new f(1,14,10),leaf:new f(1,12,8),nose:new u(0,1,1,3,1),neck:new u(.17,.21,.56,32),shoulder:new g(.2,1,12,32),chest:new v([[0,.5],[.17,.5],[.2,.56],[.3,.62],[.45,.72],[.56,.86],[.62,1],[.6,1.12],[.46,1.23],[.2,1.3],[0,1.31]].map(([e,t])=>new p(e,t)),64),plinthTop:new u(.46,.54,.14,48),plinth:new s(1.2,.34,1),ring:new _(.3,.075,20,64),ico:new h(.24,0)}),[]),M=(0,L.useMemo)(()=>({plaster:new l({color:`#f1ebe3`,roughness:.55}),laurel:new l({color:`#8fbf6a`,roughness:.45}),plinth:new l({color:`#3f6fd8`,roughness:.4}),ring:new l({color:`#e8405e`,roughness:.3}),ico:new l({color:`#1fb3a4`,roughness:.35,flatShading:!0}),ball:new l({color:`#f4b43a`,roughness:.25})}),[]),N=(0,L.useMemo)(K,[]),P=(0,L.useMemo)(q,[]),F=(0,L.useRef)(null),I=(0,L.useRef)(null);return(0,L.useEffect)(()=>{N.forEach((e,t)=>F.current?.setMatrixAt(t,e)),P.forEach((e,t)=>I.current?.setMatrixAt(t,e)),F.current&&(F.current.instanceMatrix.needsUpdate=!0),I.current&&(I.current.instanceMatrix.needsUpdate=!0)},[N,P]),(0,L.useEffect)(()=>()=>{Object.values(j).forEach(e=>e.dispose()),Object.values(M).forEach(e=>e.dispose())},[j,M]),y((s,l)=>{w||(k.current+=Math.min(l,1/30));let u=k.current,d=n.width<760,f=r.width,p=r.height;if(a.current){let e=w?p*.62/2.45:d?Math.min(p*.4/2.45,f*.62/2):Math.min(p*.6/2.45,f*.4/2);a.current.scale.setScalar(e);let t=w||d?0:f*.16,n=w?-p*.36:d?p*.5-p*.62:-p*.36;a.current.position.set(t,n,0)}if(o.current&&o.current.rotation.set(0,e.get(),0),c.current&&c.current.rotation.set(.32,u*.42,.12),b.current&&b.current.rotation.set(u*.6,u*.9,0),x.current&&x.current.rotation.set(u*.5,u*.35,0),S.current&&(S.current.position.y=.12+Math.sin(u*1.4)*.08),C.current&&T.current){C.current.getWorldPosition(A).project(i);let e=A.x*.5+.5,n=.5-A.y*.5;T.current.getWorldPosition(A).project(i),t(e,n,.5-A.y*.5)}}),(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(`ambientLight`,{intensity:.45}),(0,R.jsx)(`hemisphereLight`,{args:[`#ffffff`,`#6a4a7a`,.5]}),(0,R.jsx)(`directionalLight`,{position:[-3.2,4,4.5],intensity:1.9}),(0,R.jsx)(`directionalLight`,{position:[3.5,1.2,2],intensity:.45}),(0,R.jsx)(`directionalLight`,{position:[.5,3,-4],intensity:1.4}),(0,R.jsxs)(`group`,{ref:a,children:[(0,R.jsx)(`object3D`,{ref:T,position:[0,0,0]}),(0,R.jsxs)(`group`,{ref:D,visible:O,children:[(0,R.jsxs)(`group`,{ref:o,children:[(0,R.jsx)(`object3D`,{ref:C,position:[0,1.8,0]}),(0,R.jsx)(`mesh`,{geometry:j.plinth,material:M.plinth,position:[0,.17,0]}),(0,R.jsx)(`mesh`,{geometry:j.plinthTop,material:M.plinth,position:[0,.41,0]}),(0,R.jsx)(`mesh`,{geometry:j.chest,material:M.plaster,position:[0,-.02,-.03],scale:[1,1,.6]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[-.21,1,.1],scale:[.26,.2,.12]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[.21,1,.1],scale:[.26,.2,.12]}),(0,R.jsx)(`mesh`,{geometry:j.shoulder,material:M.plaster,position:[0,1.17,-.05],rotation:[0,0,Math.PI/2],scale:[1,1,.85]}),(0,R.jsx)(`mesh`,{geometry:j.neck,material:M.plaster,position:[0,1.44,.02],rotation:[.08,0,0]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.93,0],scale:[.33,.4,.37]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.74,.1],scale:[.25,.23,.26]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.975,.295],scale:[.22,.035,.07]}),(0,R.jsx)(`mesh`,{geometry:j.nose,material:M.plaster,position:[0,1.86,.37],rotation:[-.3,0,0],scale:[.065,.21,.075]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[-.11,1.91,.3],scale:[.055,.034,.045]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[.11,1.91,.3],scale:[.055,.034,.045]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.735,.335],scale:[.08,.024,.045]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.695,.325],scale:[.06,.026,.045]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[0,1.62,.28],scale:[.09,.075,.07]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[-.33,1.9,0],scale:[.045,.1,.07]}),(0,R.jsx)(`mesh`,{geometry:j.sphere,material:M.plaster,position:[.33,1.9,0],scale:[.045,.1,.07]}),(0,R.jsx)(`instancedMesh`,{ref:F,args:[j.curl,M.plaster,N.length]}),(0,R.jsx)(`instancedMesh`,{ref:I,args:[j.leaf,M.laurel,P.length]})]}),(0,R.jsx)(`group`,{position:[0,1.6,0],children:(0,R.jsxs)(`group`,{ref:c,children:[(0,R.jsx)(`mesh`,{ref:b,geometry:j.ring,material:M.ring,position:[1.45,.1,0]}),(0,R.jsx)(`mesh`,{ref:x,geometry:j.ico,material:M.ico,position:[-1.3,.35,.6]}),(0,R.jsx)(`mesh`,{ref:S,geometry:j.sphere,material:M.ball,position:[.2,.12,-1.4],scale:.13})]})})]})]})]})}function J({flip:e,color:t,className:n}){return(0,R.jsx)(`svg`,{className:n,viewBox:`-150 -110 300 520`,style:{transform:e?`scaleX(-1)`:void 0},"aria-hidden":!0,children:(0,R.jsxs)(`g`,{fill:t,children:[(0,R.jsx)(`path`,{d:`M-6 0 C 4 120 26 260 64 410 L 88 410 C 46 262 20 124 8 0 Z`}),[`M0 0 C -40 -18 -92 -10 -128 26 C -96 4 -52 2 0 0`,`M0 0 C -30 -40 -82 -52 -122 -34 C -80 -40 -40 -26 0 0`,`M0 0 C -6 -46 -36 -82 -70 -96 C -40 -70 -20 -40 0 0`,`M0 0 C 18 -44 52 -72 92 -80 C 56 -62 28 -36 0 0`,`M0 0 C 40 -30 90 -36 128 -14 C 90 -24 46 -16 0 0`,`M0 0 C 44 -6 92 12 118 48 C 86 18 46 8 0 0`,`M0 0 C -14 -10 -48 6 -70 42 C -44 12 -22 4 0 0`].map((e,t)=>(0,R.jsx)(`path`,{d:e},t)),(0,R.jsx)(`circle`,{cx:`2`,cy:`4`,r:`9`})]})})}function ne({mode:e,onNext:t,onClose:n,bounds:r}){return(0,R.jsxs)(a.div,{className:`vw-win`,drag:!0,dragConstraints:r,dragMomentum:!0,dragElastic:.15,initial:{opacity:0,scale:.9,y:12},animate:{opacity:1,scale:1,y:0},exit:{opacity:0,scale:.9},transition:{type:`spring`,stiffness:320,damping:24},onPointerDown:e=>e.stopPropagation(),children:[(0,R.jsxs)(`div`,{className:`vw-title`,children:[(0,R.jsx)(`span`,{children:`aesthetic.exe`}),(0,R.jsxs)(`div`,{className:`vw-tbtn`,children:[(0,R.jsx)(`button`,{tabIndex:-1,"aria-hidden":!0,children:`_`}),(0,R.jsx)(`button`,{"aria-label":`关闭`,onClick:n,children:`×`})]})]}),(0,R.jsxs)(`div`,{className:`vw-body`,children:[(0,R.jsx)(`div`,{className:`vw-icon`,children:`i`}),(0,R.jsxs)(`div`,{children:[(0,R.jsx)(`p`,{children:`正在载入 ＡＥＳＴＨＥＴＩＣＳ…`}),(0,R.jsxs)(`p`,{className:`vw-file`,children:[`C:\\DREAMS\\`,V[e]]})]})]}),(0,R.jsx)(`div`,{className:`vw-bar`,children:(0,R.jsx)(`i`,{})}),(0,R.jsxs)(`div`,{className:`vw-btns`,children:[(0,R.jsx)(`button`,{onClick:t,children:`换个年代`}),(0,R.jsx)(`button`,{onClick:n,children:`取消`})]})]})}function Y(){let e=(0,L.useMemo)(()=>I(),[]),t=(0,L.useMemo)(()=>[e],[e]),n=(0,L.useMemo)(D,[]),[s,c]=(0,L.useState)(`sunset`),[l,u]=(0,L.useState)(2),[d]=(0,L.useState)(z),[f,p]=(0,L.useState)(!1),[m,h]=(0,L.useState)(w),g=k(z?.5:.62),_=(0,L.useRef)(!1);_.current=g.open;let v=(0,L.useRef)(null),y=(0,L.useRef)(null),b=i(w?-.45:-.5),S=(0,L.useRef)(w?1/0:-1e9),E=()=>S.current=performance.now(),V=(0,L.useRef)(!1);(0,L.useEffect)(()=>M(e,s),[e,s]),(0,L.useEffect)(()=>N(e,w?0:B[l].k),[e,l]),(0,L.useEffect)(()=>{if(w)return;let e=window.setInterval(()=>{performance.now()-S.current<12e3||_.current||c(e=>P[(P.findIndex(t=>t.id===e)+1)%P.length].id)},8e3);return()=>window.clearInterval(e)},[]);let K=(0,L.useRef)(!1);(0,L.useEffect)(()=>{if(f||w)return;let e=window.setTimeout(()=>{K.current=!0,p(!0)},K.current?9e3:1800);return()=>window.clearTimeout(e)},[f]),(0,L.useEffect)(()=>{if(w)return;let e=window.setTimeout(()=>h(!0),700);return()=>window.clearTimeout(e)},[]),(0,L.useEffect)(()=>{let e=0,t=performance.now()-754e3,n=()=>{let r=Math.floor((performance.now()-t)/1e3),i=e=>String(e).padStart(2,`0`);v.current&&(v.current.textContent=`SP ${i(Math.floor(r/3600))}:${i(Math.floor(r/60)%60)}:${i(r%60)}`),e=requestAnimationFrame(n)};return n(),()=>cancelAnimationFrame(e)},[]);let q=(0,L.useRef)({x:.5,h:.6,init:!1}),Y=(t,n,r)=>{let i=q.current,a=x.clamp(r-(d?.1:.15),.3,.8);i.init||=(i.x=t,i.h=a,!0),i.x+=(t-i.x)*.08,i.h+=(a-i.h)*.08,F(e,i.x,i.h,d?.2:.27)},X=(0,L.useRef)(null),Z=(0,L.useRef)(null),ae=e=>{e.target.closest(`.dock, .osplit-knob, .vw-win`)||(E(),Z.current?.stop(),V.current=!0,X.current={x:e.clientX,id:e.pointerId},e.currentTarget.setPointerCapture(e.pointerId))},oe=e=>{let t=X.current;t&&t.id===e.pointerId&&(b.set(b.get()+(e.clientX-t.x)*.0085),t.x=e.clientX)},Q=e=>{let t=X.current;t&&t.id===e.pointerId&&(X.current=null,Z.current=r(b,b.get(),{type:`inertia`,velocity:b.getVelocity(),power:.4,timeConstant:600,onComplete:()=>V.current=!1}))},$=P.find(e=>e.id===s).label;return(0,R.jsxs)(`div`,{className:`stage vw vw-${s}${g.open?` vw-split`:``}`,style:{"--vw-accent":U[s],"--vw-palm":G[s],background:W[s]},onPointerDown:ae,onPointerMove:oe,onPointerUp:Q,onPointerCancel:Q,children:[(0,R.jsx)(`style`,{children:ie}),(0,R.jsxs)(C,{dpr:[1,2],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,0,10],fov:30,near:.5,far:40},children:[(0,R.jsx)(O,{effect:g.on?n:e,prev:g.on?e:null,wipe:g.wipe,background:j.background,preload:t}),(0,R.jsx)(re,{ry:b,busy:V}),(0,R.jsx)(te,{ry:b,onHead:Y})]}),(0,R.jsxs)(`div`,{className:`vw-deco`,children:[m&&(0,R.jsxs)(R.Fragment,{children:[(0,R.jsx)(J,{className:`vw-palm l`,color:`var(--vw-palm)`}),(0,R.jsx)(J,{className:`vw-palm r`,color:`var(--vw-palm)`,flip:!0})]}),(0,R.jsx)(`p`,{className:`vw-kata`,children:`ヴェイパーウェイヴ`})]}),(0,R.jsxs)(`div`,{className:`overlay`,ref:y,children:[(0,R.jsx)(A,{split:g,label:$}),(0,R.jsx)(`p`,{className:`vw-float a`,children:`ＡＥＳＴＨＥＴＩＣ`}),(0,R.jsx)(`p`,{className:`vw-float b`,children:`夢`}),(0,R.jsx)(`p`,{className:`vw-float c`,children:`エステティック ・ 1995`}),(0,R.jsxs)(`div`,{className:`vw-osd`,children:[(0,R.jsx)(`span`,{children:`PLAY ▶`}),(0,R.jsx)(`span`,{ref:v,children:`SP 00:12:34`})]}),(0,R.jsxs)(`div`,{className:`hero-copy vw-copy`,children:[(0,R.jsx)(`div`,{className:`scrim vw-scrim`}),(0,R.jsxs)(a.div,{initial:{opacity:0,y:14},animate:{opacity:1,y:0},transition:{duration:.8,delay:.15,ease:[.23,1,.32,1]},children:[(0,R.jsxs)(`p`,{className:`kicker`,children:[(0,R.jsx)(`i`,{}),`Vaporwave ·`,` `,(0,R.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,R.jsx)(a.span,{className:`vw-kmode`,initial:{opacity:0,y:6},animate:{opacity:1,y:0},exit:{opacity:0,y:-6},transition:{duration:.3,ease:[.23,1,.32,1]},children:$},s)})]}),(0,R.jsxs)(`h1`,{children:[`落日、网格`,(0,R.jsx)(`br`,{}),(0,R.jsx)(`span`,{className:`vw-grad`,children:`与石膏像`})]}),(0,R.jsx)(`p`,{className:`vw-sub`,children:`画面亮度经过粉、紫、青三色渐变重新上色，石膏像有了青色高光和品红暗部；空着的背景换成条纹落日和朝地平线滚去的网格，再盖一层 VHS 跟踪噪声与色偏。`}),(0,R.jsx)(`div`,{className:`vw-spec`,children:(0,R.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,R.jsxs)(a.span,{initial:{opacity:0,y:6,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.35,ease:[.23,1,.32,1]},children:[(0,R.jsx)(`i`,{}),ee[s]]},s)})})]})]}),(0,R.jsx)(o,{children:f&&!d&&(0,R.jsx)(ne,{mode:s,onNext:()=>{E(),c(e=>P[(P.findIndex(t=>t.id===e)+1)%P.length].id)},onClose:()=>p(!1),bounds:y},`win`)}),(0,R.jsxs)(`div`,{className:`dock`,children:[(0,R.jsx)(T,{items:P.map(e=>({value:e.id,label:d?H[e.id]:e.label})),value:s,onChange:e=>{E(),c(e)}}),(0,R.jsx)(`span`,{className:`dock-sep`}),(0,R.jsx)(`button`,{className:`seg vw-cycle`,onClick:()=>{E(),u(e=>(e+1)%B.length)},children:(0,R.jsxs)(`span`,{children:[d?`网格`:`网格速度`,` `,(0,R.jsx)(`b`,{children:B[l].zh})]})}),(0,R.jsx)(`span`,{className:`dock-sep`}),(0,R.jsxs)(`button`,{className:`seg`,"aria-pressed":g.open,onClick:()=>{E(),g.toggle()},children:[g.open&&(0,R.jsx)(a.span,{layoutId:`vw-split-bg`,className:`seg-bg`,transition:{type:`spring`,stiffness:520,damping:40}}),(0,R.jsx)(`span`,{children:`原图`})]})]}),(0,R.jsx)(`p`,{className:`hint`,children:`拖动转动石膏像 · 窗口可以拖走`})]})]})}function re({ry:e,busy:t}){return y((n,r)=>{w||t.current||e.set(e.get()+Math.min(r,1/30)*.28)}),null}var ie=`
.vw { cursor: grab; touch-action: none; transition: background .8s; overflow: hidden; }
.vw:active { cursor: grabbing; }
.vw canvas { display: block; }
.vw-deco { position: absolute; inset: 0; pointer-events: none; }
.vw-palm { position: absolute; bottom: -4%; height: 64vh; width: auto; opacity: .96; animation: vw-in 1.2s ease-out both; }
@keyframes vw-in { from { opacity: 0; } }
.vw-palm path, .vw-palm circle { transition: fill .8s; }
.vw-palm.l { left: 33vw; height: 30vh; bottom: 4vh; opacity: .9; }
.vw-palm.r { right: -4vw; }
.vw-kata {
  position: absolute; right: clamp(14px, 2.4vw, 34px); top: 50%; transform: translateY(-50%); margin: 0;
  writing-mode: vertical-rl; font: 600 15px/1 var(--sans); letter-spacing: .5em; color: #fff;
  text-shadow: -1.5px 0 rgba(255, 60, 180, .75), 1.5px 0 rgba(60, 230, 255, .75); opacity: .78;
}
.overlay > .vw-float { pointer-events: none; }
.vw-float {
  position: absolute; margin: 0; color: #fff; white-space: nowrap; mix-blend-mode: screen;
  text-shadow: -2px 0 rgba(255, 50, 190, .8), 2px 0 rgba(50, 230, 255, .8), 0 0 18px var(--vw-accent);
  animation: vw-bob 7s ease-in-out infinite;
}
.vw-float.a { right: 8vw; top: 13vh; font: 700 clamp(18px, 2vw, 28px)/1 var(--sans); letter-spacing: .3em; }
.vw-float.b { left: 40vw; top: 24vh; font: 800 clamp(48px, 6vw, 86px)/1 var(--sans); opacity: .5; animation-duration: 9s; animation-delay: -3s; }
.vw-float.c { left: 44vw; top: 12vh; font: 500 12px/1 var(--mono); letter-spacing: .32em; opacity: .7; animation-duration: 11s; animation-delay: -5s; }
@keyframes vw-bob { 0%, 100% { transform: translate3d(0, 0, 0); } 50% { transform: translate3d(0, -10px, 0); } }
.vw-osd {
  position: absolute; right: clamp(56px, 6vw, 96px); bottom: 86px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  font: 600 15px/1 var(--mono); color: #fff; letter-spacing: .08em; pointer-events: none !important;
  text-shadow: 0 0 6px rgba(255, 255, 255, .6), -1px 0 rgba(255, 60, 180, .8), 1px 0 rgba(60, 230, 255, .8);
}
.vw-osd span:first-child { animation: vw-blink 1.6s steps(1) infinite; }
@keyframes vw-blink { 50% { opacity: 0; } }
.vw-copy { pointer-events: none !important; }
.vw-scrim { --soft-bg: rgba(18, 6, 42, .62); transition: --soft-bg .8s; }
.vw-copy .kicker i { background: var(--vw-accent); box-shadow: 0 0 10px var(--vw-accent); transition: background .6s, box-shadow .6s; }
.vw-kmode { display: inline-block; color: var(--fg); }
.vw-copy h1 { font-size: clamp(40px, 4.6vw, 64px); }
.vw-grad {
  background: linear-gradient(90deg, #ff6ad5, #c774e8 45%, #8ff2ff); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(-2px 0 rgba(255, 60, 180, .35)) drop-shadow(2px 0 rgba(60, 230, 255, .35));
}
.vw-sub { max-width: 400px; }
.vw-spec { margin-top: 22px; min-height: 22px; font: 500 12px/22px var(--mono); color: var(--fg-2); }
.vw-spec span { display: inline-flex; align-items: center; gap: 9px; }
.vw-spec i { width: 18px; height: 3px; border-radius: 3px; background: linear-gradient(90deg, #ff6ad5, #8ff2ff); }
.vw-cycle span { display: inline-flex; align-items: center; gap: 6px; }
.vw-cycle b { font-weight: 600; color: var(--fg); }
.vw .hint { transition: opacity .4s; }
.vw-split .hint, .vw-split .vw-float, .vw-split .vw-osd { opacity: 0; transition: opacity .4s; }
.vw-plaster .vw-copy { --fg: #2a1d3c; --fg-2: rgba(42, 29, 60, .74); color: var(--fg); }
.vw-plaster .vw-scrim { --soft-bg: rgba(214, 246, 240, .72); }
.vw-plaster .vw-grad { background: linear-gradient(90deg, #e2508f, #9a5fd0 50%, #2a9b98); -webkit-background-clip: text; background-clip: text; }

/* Windows 95 dialog */
.overlay > .vw-win {
  position: absolute; right: 5vw; top: 25vh; width: 268px; padding: 3px; touch-action: none; cursor: default;
  background: #c3c3c3; color: #000; font: 12px/1.35 Tahoma, 'Segoe UI', sans-serif;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf, 10px 14px 0 rgba(20, 0, 40, .35);
}
.vw-title {
  display: flex; align-items: center; justify-content: space-between; height: 20px; padding: 0 3px 0 6px; cursor: move;
  background: linear-gradient(90deg, #000080, #1084d0); color: #fff; font-weight: 700; letter-spacing: .02em;
}
.vw-tbtn { display: flex; gap: 2px; }
.vw-tbtn button, .vw-btns button {
  border: 0; background: #c3c3c3; color: #000; font: inherit; cursor: pointer;
  box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #ffffff, inset -2px -2px #808080, inset 2px 2px #dfdfdf;
}
.vw-tbtn button { width: 16px; height: 14px; padding: 0; font: 700 11px/12px Tahoma, sans-serif; }
.vw-btns button:active, .vw-tbtn button:active { box-shadow: inset 1px 1px #0a0a0a, inset -1px -1px #ffffff, inset 2px 2px #808080, inset -2px -2px #dfdfdf; }
.vw-body { display: flex; gap: 12px; padding: 14px 12px 8px; }
.vw-body p { margin: 0; }
.vw-file { margin-top: 4px !important; font: 11px/1.3 var(--mono); color: #3a3a3a; }
.vw-icon {
  flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
  background: #fff; color: #000080; font: 700 18px/1 Georgia, serif; box-shadow: inset 0 0 0 2px #000080;
}
.vw-bar {
  margin: 4px 12px 10px; height: 18px; padding: 2px;
  box-shadow: inset 1px 1px #808080, inset -1px -1px #ffffff; background: #c3c3c3; overflow: hidden;
}
.vw-bar i {
  display: block; height: 100%;
  background: repeating-linear-gradient(90deg, #000080 0 9px, transparent 9px 11px);
  animation: vw-load 4.2s steps(22) infinite;
}
@keyframes vw-load { from { width: 0%; } 80%, to { width: 100%; } }
.vw-btns { display: flex; justify-content: flex-end; gap: 6px; padding: 0 10px 10px; }
.vw-btns button { min-width: 74px; height: 23px; padding: 0 10px; }

@media (max-width: 760px) {
  .vw-copy { transition: opacity .4s; }
  .vw-split .vw-copy { opacity: 0; }
  .vw-sub { display: none; }
  .vw-copy h1 { font-size: 36px; }
  .vw-spec { margin-top: 12px; font-size: 11px; }
  .vw .dock .seg { padding: 0 9px; }
  .vw .dock .dock-sep { margin: 0 1px; }
  .vw-palm { height: 40vh; bottom: 14vh; opacity: .9; }
  .vw-palm.l { height: 30vh; left: -12vw; bottom: 14vh; }
  .vw-palm.r { right: -14vw; }
  .vw-kata { font-size: 12px; top: 30%; }
  .vw-float.a { right: 6vw; top: 84px; font-size: 14px; }
  .vw-float.b, .vw-float.c, .vw-osd { display: none; }
}
body.poster .vw-kata { opacity: .9; }
`;export{Y as default};