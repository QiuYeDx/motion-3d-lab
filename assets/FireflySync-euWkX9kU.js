import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{B as a,E as o,Gt as s,It as c,T as l,Wt as u,Xt as d,bn as f,bt as p,h as m,hn as h,k as g,pt as ee,q as _,u as te,vn as v,xt as y,yn as b}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as x}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as ne}from"./iso-CLB38p39.js";import{t as S}from"./Seg-CH5KfWEm.js";import{a as C}from"./isoWarmup-CvqWCm1z.js";import{t as w}from"./BigLabel-CceM23C6.js";var T=e(t(),1),E=n(),D=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,O=D?1500:2600,k=D?{x0:-5.6,x1:5.6,y0:.35,y1:5.6,z0:-7,z1:2.6}:{x0:-12,x1:12,y0:.3,y1:5.4,z0:-7.5,z1:2.8},A=1.25,j=Math.ceil((k.x1-k.x0)/A)+1,M=Math.ceil((k.y1-k.y0)/A)+1,N=Math.ceil((k.z1-k.z0)/A)+1,P=j*M*N,re=Math.PI*2/1.55,F=Math.PI*2,I=[0,.32,1.7],L=[0,0,.24],R=56,ie=24,z={x0:-17,x1:17,z0:-11,z1:6},B=`#05090a`,V=[.62,.95,.24],H=[.96,1,.78];function U(e){let t=e>>>0;return()=>(t=t*1664525+1013904223>>>0,t/4294967296)}function ae(e){let t=e%F;if(t<0&&(t+=F),t<1.8)return Math.exp(-t*2.5);let n=F-.16;if(t>n){let e=(t-n)/.16;return e*e}return 0}function W(e,t,n,r){let i=document.createElement(`canvas`);i.width=e,i.height=t;let a=i.getContext(`2d`),o=U(n);a.fillStyle=`#fff`,a.strokeStyle=`#fff`;for(let n=-40;n<e+40;n+=10+o()*26){let e=t*(.05+o()*.09),i=t*r.canopy*(.15+o()*.85);a.beginPath(),a.ellipse(n,i,e*(1+o()*.8),e,0,0,F),a.fill()}a.fillRect(0,0,e,t*r.canopy*.35);for(let n=0;n<r.trunks;n++){let i=(n+.15+o()*.7)*(e/r.trunks),s=r.wMin+o()*(r.wMax-r.wMin),c=(o()-.5)*r.lean*s,l=t*r.canopy*(.3+o()*.6),u=t*(1-r.ground*.6);a.beginPath(),a.moveTo(i-s*.5-s*.45,u),a.quadraticCurveTo(i-s*.52,u-s*.6,i-s*.5,u-s*1.4),a.lineTo(i-s*.32+c,l),a.lineTo(i+s*.32+c,l),a.lineTo(i+s*.5,u-s*1.4),a.quadraticCurveTo(i+s*.52,u-s*.6,i+s*.5+s*.5,u),a.closePath(),a.fill();let d=1+Math.floor(o()*3);for(let e=0;e<d;e++){let e=l+(u-l)*(.05+o()*.4),t=o()<.5?-1:1,n=s*(2+o()*4);a.lineWidth=Math.max(1.5,s*(.12+o()*.12)),a.lineCap=`round`,a.beginPath(),a.moveTo(i+c*((e-u)/(l-u)),e),a.quadraticCurveTo(i+t*n*.5,e-n*.2,i+t*n,e-n*(.5+o()*.6)),a.stroke()}}if(r.ground>0){a.beginPath(),a.moveTo(0,t);for(let n=0;n<=e;n+=16)a.lineTo(n,t*(1-r.ground)+Math.sin(n*.01)*t*r.ground*.25+o()*3);a.lineTo(e,t),a.closePath(),a.fill()}return K(i)}function G(e,t,n,r,i){let a=document.createElement(`canvas`);a.width=e,a.height=t;let o=a.getContext(`2d`),s=U(n);o.fillStyle=`#fff`,o.fillRect(0,t-6,e,6);for(let n=0;n<e;n+=r*(.3+s())){let e=.55+.45*Math.sin(n*.006+1.3)*Math.sin(n*.017),r=t*(.18+s()*.62*(.5+e*.5))*i,a=(s()-.45)*r*.45,c=1.4+s()*3.2;if(o.beginPath(),o.moveTo(n-c,t),o.quadraticCurveTo(n+a*.25,t-r*.62,n+a,t-r),o.quadraticCurveTo(n+a*.25+c,t-r*.62,n+c,t),o.closePath(),o.fill(),s()<.05){let e=r*1.25;o.lineWidth=1.4,o.strokeStyle=`#fff`,o.beginPath(),o.moveTo(n,t),o.quadraticCurveTo(n+a*.2,t-e*.6,n+a*.8,t-e),o.stroke(),o.beginPath(),o.ellipse(n+a*.8,t-e,3,9,a*.004,0,F),o.fill()}}return K(a)}function K(e){let t=new g(e);return t.colorSpace=``,t.anisotropy=4,t.needsUpdate=!0,t}var q=`
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,J=`
uniform sampler2D tLight;
uniform vec4 uLRect; // x0, z0, 1/w, 1/h
float lightAt(vec2 xz) {
  vec2 uv = (xz - uLRect.xy) * uLRect.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture2D(tLight, uv).r;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
`,oe=`
uniform vec3 uTop, uHorizon, uMoonCol;
uniform vec2 uMoon;
varying vec3 vW;
${J}
void main() {
  float t = clamp((vW.y + 2.0) / 30.0, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(t, 0.7));
  float d = length(vW.xy - uMoon);
  col += uMoonCol * (0.20 * exp(-d * 0.16) + 0.10 * exp(-d * 0.55));
  float disc = smoothstep(1.55, 1.4, d);
  col = mix(col, vec3(0.86, 0.92, 0.9), disc);
  // a few faint stars
  vec2 g = floor(vW.xy * 1.6);
  float s = hash12(g);
  float star = step(0.985, s) * smoothstep(0.35, 0.0, length(fract(vW.xy * 1.6) - 0.5)) * t;
  col += vec3(0.5, 0.6, 0.62) * star * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`,se=`
uniform sampler2D tMask;
uniform vec3 uColor, uGlow, uRim;
uniform float uLightK, uLightZ, uSway, uTime, uGust, uGustX;
varying vec2 vUv;
varying vec3 vW;
${J}
void main() {
  float h = vUv.y;
  vec2 uv = vUv;
  float sway = sin(uTime * 1.1 + vW.x * 0.9) * 0.6 + sin(uTime * 2.3 + vW.x * 2.1) * 0.25;
  float gust = uGust * exp(-pow((vW.x - uGustX) / 5.0, 2.0));
  uv.x += (sway * 0.0016 + gust * 0.01) * h * h * uSway;
  float a = texture2D(tMask, uv).a;
  if (a < 0.01) discard;
  float l = lightAt(vec2(vW.x, uLightZ));
  vec3 col = uColor + uRim * smoothstep(0.0, 1.0, h);
  col += uGlow * l * uLightK * (0.25 + 0.75 * h);
  gl_FragColor = vec4(col, a);
}
`,Y=`
uniform vec3 uColor, uGlow, uFar;
uniform float uLightK;
varying vec3 vW;
${J}
void main() {
  float l = lightAt(vW.xz);
  float far = smoothstep(2.0, -11.0, vW.z);
  vec3 col = mix(uColor, uFar, far);
  col *= 0.8 + 0.4 * vnoise(vW.xz * 1.7);
  col += uGlow * l * uLightK;
  gl_FragColor = vec4(col, 1.0);
}
`,X=`
uniform vec3 uColor, uGlow;
uniform float uAlpha, uLightK, uTime, uTop, uLightZ;
varying vec3 vW;
${J}
void main() {
  float band = smoothstep(uTop, uTop * 0.15, vW.y) * smoothstep(-0.9, 0.2, vW.y);
  vec2 p = vec2(vW.x * 0.18 + uTime * 0.035, vW.y * 0.5);
  float n = vnoise(p) * 0.6 + vnoise(p * 2.3 - uTime * 0.05) * 0.4;
  float a = band * (0.35 + 0.65 * n) * uAlpha;
  float l = lightAt(vec2(vW.x, uLightZ));
  vec3 col = uColor + uGlow * l * uLightK;
  gl_FragColor = vec4(col, a * (1.0 + l * uLightK * 1.6));
}
`,Z=`
attribute float aB;
uniform float uSize, uPR, uFocus;
varying float vB;
varying float vCoc;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float coc = clamp(abs(dist - uFocus) * 0.085, 0.0, 1.0);
  vCoc = coc;
  vB = aB;
  gl_PointSize = uSize * uPR * (0.12 + aB * 0.95 + coc * 0.22) / dist;
}
`,ce=`
uniform vec3 uGlow, uCore;
varying float vB;
varying float vCoc;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float k = mix(170.0, 14.0, vCoc);
  float core = exp(-d * d * k);
  float halo = (exp(-d * 6.0) * 0.55 + exp(-d * 2.2) * 0.12) * (1.0 - d);
  // between flashes a faint ember stays visible so the drifting swarm still reads
  float ember = exp(-d * d * mix(60.0, 9.0, vCoc)) * 0.22;
  float I = vB * (core * 1.6 + halo) + ember * (1.0 - vB);
  I *= mix(1.0, 0.6, vCoc);
  vec3 col = mix(uGlow, uCore, clamp(core * vB * 1.3, 0.0, 1.0));
  gl_FragColor = vec4(col * I, 1.0);
}
`,le=`
uniform float uI;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 140.0);
  float halo = (exp(-d * 7.0) * 0.9 + exp(-d * 2.6) * 0.3) * (1.0 - d);
  vec3 col = mix(vec3(1.0, 0.62, 0.24), vec3(1.0, 0.96, 0.84), clamp(core * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (core * 1.8 + halo) * uI, 1.0);
}
`,Q=e=>new b(...e);function ue({ctl:e}){let t=m(e=>e.viewport.dpr),n=m(e=>e.gl);C();let r=(0,T.useRef)(0),i=(0,T.useMemo)(()=>{let e=Math.random,t=new Float32Array(O*3),n=new Float32Array(O*3),r=new Float32Array(O),i=new Float32Array(O),o=new Float32Array(O),c=new Float32Array(O),l=new Float32Array(O),u=new Float32Array(O),d=new Float32Array(O),f=new Float32Array(O),p=new Int32Array(O);for(let n=0;n<O;n++){let a=k.x0+(k.x1-k.x0)*(.5+(e()-.5)*(.6+.4*e()));t[n*3]=a,t[n*3+1]=k.y0+(k.y1-k.y0)*e()**1.5,t[n*3+2]=k.z0+(k.z1-k.z0)*e(),o[n]=e()*F,c[n]=(e()-.5)*.6,l[n]=.18+e()*.32;let s=(e()+e()+e()-1.5)*1.15;i[n]=re*(1+.045*s),r[n]=ne?F/13*a+(e()-.5)*.5:e()*F}let m=new Float32Array(P),g=new Float32Array(P),_=new Float32Array(P),te=new Float32Array(P),v=new Float32Array(P),y=new Float32Array(P),b=new Float32Array(P),x=new Float32Array(P),S=new Float32Array(1344),C=new Float32Array(1344),w=new Uint8Array(1344),T=new a(w,R,ie,s,h);return T.minFilter=ee,T.magFilter=ee,T.needsUpdate=!0,{pos:t,vel:n,th:r,om:i,yaw:o,pitch:c,speed:l,bright:u,cs:d,sn:f,cell:p,C:m,S:g,Cn:_,bufA:te,bufB:v,BC:y,BS:b,BN:x,lAcc:S,lTmp:C,lData:w,lightTex:T}},[]),g=(0,T.useMemo)(()=>{let e=()=>({tLight:{value:i.lightTex},uLRect:{value:new f(z.x0,z.z0,1/(z.x1-z.x0),1/(z.z1-z.z0))}}),t=new d({vertexShader:q,fragmentShader:oe,uniforms:{...e(),uTop:{value:new b(.012,.024,.03)},uHorizon:{value:new b(.05,.1,.105)},uMoonCol:{value:new b(.55,.7,.72)},uMoon:{value:new v(-6,17)}},depthWrite:!1}),n=(t,n,r)=>new d({vertexShader:q,fragmentShader:se,uniforms:{...e(),tMask:{value:t},uColor:{value:Q(n)},uRim:{value:Q(r.rim??[0,0,0])},uGlow:{value:Q(V)},uLightK:{value:r.lightK??0},uLightZ:{value:r.lightZ},uSway:{value:r.sway??0},uTime:{value:0},uGust:{value:0},uGustX:{value:0}},transparent:!0,depthWrite:!1}),r=(t,n,r,i,a)=>new d({vertexShader:q,fragmentShader:X,uniforms:{...e(),uColor:{value:Q(t)},uGlow:{value:Q(V)},uAlpha:{value:n},uTop:{value:r},uLightZ:{value:i},uLightK:{value:a},uTime:{value:0}},transparent:!0,depthWrite:!1}),a=W(2048,560,11,{trunks:34,wMin:6,wMax:16,canopy:.42,ground:.05,lean:.4}),o=W(2048,760,23,{trunks:11,wMin:26,wMax:54,canopy:.36,ground:.07,lean:.6}),s=G(2048,200,5,7,.8),c=G(2048,300,9,5,1),l=W(256,1024,41,{trunks:1,wMin:120,wMax:130,canopy:.12,ground:0,lean:.2}),u=new d({vertexShader:q,fragmentShader:Y,uniforms:{...e(),uColor:{value:new b(.018,.03,.026)},uFar:{value:new b(.03,.05,.05)},uGlow:{value:Q(V)},uLightK:{value:.32}},depthWrite:!1}),p=new d({vertexShader:Z,fragmentShader:ce,uniforms:{uSize:{value:D?640:600},uPR:{value:1},uFocus:{value:15},uGlow:{value:Q(V)},uCore:{value:Q(H)}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),m=new d({vertexShader:q,fragmentShader:le,uniforms:{uI:{value:0}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2});return{sky:t,far:n(a,[.028,.05,.053],{lightZ:-9,rim:[0,.01,.012]}),farFog:r([.36,.48,.5],.16,7,-9,.3),mid:n(o,[.012,.022,.022],{lightZ:-8.5,lightK:.22}),grassFar:n(s,[.01,.02,.017],{lightZ:-5.5,lightK:.5,sway:1,rim:[0,.012,.008]}),midFog:r([.3,.42,.44],.1,3.2,-3,.6),ground:u,ff:p,nearFog:r([.24,.34,.35],.08,1.6,1.5,.8),grassNear:n(c,[.006,.011,.009],{lightZ:2.2,lightK:.7,sway:1.4,rim:[.004,.012,.004]}),trunk:n(l,[.004,.007,.007],{lightZ:3,lightK:.12}),lantern:m,textures:[a,o,s,c,l]}},[i]),x=(0,T.useMemo)(()=>{let e=new o,t=new l(i.pos,3);t.setUsage(_);let n=new l(i.bright,1);return n.setUsage(_),e.setAttribute(`position`,t),e.setAttribute(`aB`,n),e},[i]);(0,T.useEffect)(()=>()=>{x.dispose(),i.lightTex.dispose();for(let e of Object.values(g))e instanceof p&&e.dispose();g.textures.forEach(e=>e.dispose())},[x,g,i]);let S=(0,T.useRef)(null),w=(0,T.useRef)(null),I=(0,T.useRef)(null),L=(0,T.useMemo)(()=>({time:0,ray:new u,plane:new c(new b(0,0,1),1),hit:new b,o:new b,d:new b,look:new b,ndc:new v,camX:0,camY:0,lanterns:[],gust:0,gustX:0,gustDir:1,nextGust:18,lastPtr:-1e9,resetSeen:0,r:0,rSmooth:0,hist:new Float32Array(150),histN:0,lastMeter:0,state:-1}),[]);return te((a,o)=>{r.current<g.textures.length&&n.initTexture(g.textures[r.current++]);let s=Math.min(o,1/30);L.time+=s;let c=L.time,l=a.camera,{width:u,height:d}=a.size,f=u/d,p=performance.now(),m=e.ptr.current,h=p-m.t<3e3;L.camX=y.damp(L.camX,h?m.x*.7:Math.sin(c*.05)*.8,1.2,s),L.camY=y.damp(L.camY,h?m.y*.25:0,1.2,s);let ee=f<1?13.5:12;l.position.set(L.camX,1.9+L.camY,ee),L.look.set(L.camX*.3,f<1?3.1:2.6,-4),l.lookAt(L.look),l.fov!==42&&(l.fov=42,l.updateProjectionMatrix());let _=Math.tan(y.degToRad(21))*(ee-6.5)*f;if(S.current&&(S.current.position.x=-_-(f<1?.4:-.2)+L.camX),w.current&&(w.current.position.x=_+(f<1?.36:0)+L.camX),g.sky.uniforms.uMoon.value.set(f<1?-3.5:-9,f<1?19:17),e.reset.current!==L.resetSeen){L.resetSeen=e.reset.current;for(let e=0;e<O;e++)i.th[e]=Math.random()*F;L.hist.fill(0),L.histN=0,L.nextGust=c+20}let te=Math.hypot(m.vx,m.vy),v=p-m.t<120?Math.min(te*.55,1.6):0;for(v>.05&&(L.lastPtr=c,L.ray.setFromCamera(L.ndc.set(m.x,m.y),l),L.o.copy(L.ray.ray.origin),L.d.copy(L.ray.ray.direction));e.clicks.current.length;){let t=e.clicks.current.shift();if(L.ray.setFromCamera(L.ndc.set(t.x,t.y),l),L.plane.set(new b(0,0,1),2),L.ray.ray.intersectPlane(L.plane,L.hit)){L.hit.y=y.clamp(L.hit.y,.6,4.5),L.lanterns.length>2&&L.lanterns.shift();let e={x:L.hit.x,y:L.hit.y,z:L.hit.z,ph:-.12,life:0};L.lanterns.push(e);for(let t=0;t<O;t++){let n=i.pos[t*3]-e.x,r=i.pos[t*3+1]-e.y,a=i.pos[t*3+2]-e.z,o=Math.sqrt(n*n+r*r+a*a);if(o<4.2){let n=1-o/4.2,r=e.ph-o*.55-i.th[t];r=Math.atan2(Math.sin(r),Math.cos(r)),i.th[t]+=r*Math.min(1,n*1.6)}}}L.lastPtr=c}if(c-L.lastPtr>6&&c>L.nextGust&&(L.rSmooth>.75||c>L.nextGust+10)){let e=Math.floor(Math.random()*O);L.gustX=i.pos[e*3],L.gustDir=Math.random()<.5?-1:1;let t=i.pos[e*3+2],n=D?4.5:8;for(let e=0;e<O;e++){let r=i.pos[e*3]-L.gustX,a=i.pos[e*3+2]-t,o=Math.sqrt(r*r+a*a);if(o<n){let t=1-o/n;Math.random()<.6+t&&(i.th[e]=Math.random()*F),i.vel[e*3]+=L.gustDir*(.6+t*1.6),i.vel[e*3+1]+=t*.5}}L.gust=1,L.nextGust=c+15+Math.random()*6}L.gust=Math.max(0,L.gust-s*.45),L.gustX+=L.gustDir*s*2.5;let C=0;for(let e=L.lanterns.length-1;e>=0;e--){let t=L.lanterns[e];t.life+=s,t.ph+=re*s,t.life>7&&L.lanterns.splice(e,1)}let T=L.lanterns[L.lanterns.length-1];if(T&&I.current){let e=Math.min(1,T.life*8)*(1-y.smoothstep(T.life,5.5,7)),t=ae(T.ph);C=(.55+t*1.2)*e,I.current.position.set(T.x,T.y+Math.sin(T.life*1.7)*.06,T.z),I.current.quaternion.copy(l.quaternion),I.current.scale.setScalar(2.6+t*2.2)}g.lantern.uniforms.uI.value=C,I.current&&(I.current.visible=C>.005);let{pos:E,vel:P,th:B,om:V,cs:H,sn:U,cell:W,C:G,S:K,Cn:q,BC:J,BS:oe,BN:se,bufA:Y,bufB:X}=i;G.fill(0),K.fill(0),q.fill(0);let Z=0,ce=0;for(let e=0;e<O;e++){let t=Math.cos(B[e]),n=Math.sin(B[e]);H[e]=t,U[e]=n,Z+=t,ce+=n;let r=Math.min(j-1,Math.max(0,(E[e*3]-k.x0)/A|0))+j*(Math.min(M-1,Math.max(0,(E[e*3+1]-k.y0)/A|0))+M*Math.min(N-1,Math.max(0,(E[e*3+2]-k.z0)/A|0)));W[e]=r,G[r]+=t,K[r]+=n,q[r]+=1}L.r=Math.hypot(Z,ce)/O,de(G,J,Y,X),de(K,oe,Y,X),de(q,se,Y,X);let le=e.k.get(),Q=e.kg.get(),ue=Z/O,me=ce/O,he=k.x1-k.x0,ge=0;for(let e=0;e<O;e++){let t=W[e],n=se[t],r=V[e];n>1&&le>0&&(r+=le*(oe[t]*H[e]-J[t]*U[e])/n),Q>0&&(r+=Q*(me*H[e]-ue*U[e]));let a=e*3,o=E[a],l=E[a+1],u=E[a+2];for(let t=0;t<L.lanterns.length;t++){let n=L.lanterns[t],i=o-n.x,a=l-n.y,s=u-n.z,c=i*i+a*a+s*s;c<16&&(r+=3.2*(1-Math.sqrt(c)/4)*Math.sin(n.ph-B[e]))}if(B[e]+=r*s,B[e]>1e4&&(B[e]-=F*1e3),v>.05){let t=o-L.o.x,n=l-L.o.y,r=u-L.o.z,i=t*L.d.x+n*L.d.y+r*L.d.z,c=t-L.d.x*i,d=n-L.d.y*i,f=r-L.d.z*i,p=c*c+d*d+f*f,m=1.5;if(p<m*m){let t=Math.sqrt(p)+.001,n=(1-t/m)*v;P[a]+=c/t*n*7*s*4,P[a+1]+=d/t*n*7*s*4,P[a+2]+=f/t*n*7*s*4,Math.random()<n*s*14&&(B[e]=Math.random()*F)}}i.yaw[e]+=(Math.random()-.5)*s*2.2,i.pitch[e]=y.clamp(i.pitch[e]+(Math.random()-.5)*s*1.4,-.7,.7);let d=i.speed[e],f=Math.cos(i.yaw[e])*d,p=Math.sin(i.yaw[e])*d*.7,m=Math.sin(i.pitch[e])*d*.55+Math.sin(c*1.3+e)*.04,h=1-Math.exp(-s*1.1);P[a]+=(f-P[a])*h,P[a+1]+=(m-P[a+1])*h,P[a+2]+=(p-P[a+2])*h,o<k.x0?P[a]+=(k.x0-o)*2*s:o>k.x1&&(P[a]-=(o-k.x1)*2*s),l<k.y0?P[a+1]+=(k.y0-l)*3*s:l>k.y1&&(P[a+1]-=(l-k.y1)*2*s),u<k.z0?P[a+2]+=(k.z0-u)*2*s:u>k.z1&&(P[a+2]-=(u-k.z1)*2*s),o+=P[a]*s,l+=P[a+1]*s,u+=P[a+2]*s,o<k.x0-3?o+=he:o>k.x1+3&&(o-=he),E[a]=o,E[a+1]=l,E[a+2]=u;let g=ne?.4+.6*ae(B[e]):ae(B[e]);i.bright[e]=g,ge+=g}let{lAcc:$,lTmp:_e,lData:ve}=i;$.fill(0);let ye=55/(z.x1-z.x0),be=23/(z.z1-z.z0);for(let e=0;e<O;e++){let t=i.bright[e];if(t<.05)continue;let n=(E[e*3]-z.x0)*ye,r=(E[e*3+2]-z.z0)*be,a=n|0,o=r|0;if(a<0||o<0||a>=55||o>=23)continue;let s=n-a,c=r-o,l=t/(1+E[e*3+1]*.35),u=a+o*R;$[u]+=l*(1-s)*(1-c),$[u+1]+=l*s*(1-c),$[u+R]+=l*(1-s)*c,$[u+R+1]+=l*s*c}for(let e of L.lanterns){let t=Math.round((e.x-z.x0)*ye),n=Math.round((e.z-z.z0)*be);t>=0&&n>=0&&t<R&&n<ie&&($[t+n*R]+=C*40)}fe($,_e),fe($,_e);let xe=D?.22:.16;for(let e=0;e<1344;e++){let t=1-Math.exp(-$[e]*xe);ve[e]=t*255|0}i.lightTex.needsUpdate=!0,x.attributes.position.needsUpdate=!0,x.attributes.aB.needsUpdate=!0,g.ff.uniforms.uPR.value=t;for(let e of[g.grassFar,g.grassNear,g.far,g.mid,g.trunk])e.uniforms.uTime.value=c,e.uniforms.uGust.value=L.gust*L.gustDir,e.uniforms.uGustX.value=L.gustX;for(let e of[g.farFog,g.midFog,g.nearFog])e.uniforms.uTime.value=c;let Se=e.meter.current.pulse;if(Se){let e=Math.min(1,ge/O*3);Se.style.opacity=(.18+.82*e).toFixed(3),Se.style.transform=`scale(${(.8+e*.5).toFixed(3)})`}if(L.rSmooth+=(L.r-L.rSmooth)*(1-Math.exp(-s*2.5)),p-L.lastMeter>100){L.lastMeter=p,L.hist.copyWithin(0,1),L.hist[L.hist.length-1]=L.rSmooth,L.histN=Math.min(L.hist.length,L.histN+1);let t=e.meter.current;t.value&&(t.value.textContent=L.rSmooth.toFixed(2)),t.spark&&pe(t.spark,L.hist,L.histN);let n=L.rSmooth,r=L.state,i=[.3,.62,.9],a=[.24,.55,.84];if(r<0)r=n>i[2]?3:n>i[1]?2:+(n>i[0]);else{for(;r<3&&n>i[r];)r++;for(;r>0&&n<a[r-1];)r--}r!==L.state&&(L.state=r,e.onState(r))}}),(0,E.jsxs)(E.Fragment,{children:[(0,E.jsx)(`color`,{attach:`background`,args:[B]}),(0,E.jsx)(`mesh`,{material:g.sky,position:[0,14,-40],renderOrder:0,children:(0,E.jsx)(`planeGeometry`,{args:[170,70]})}),(0,E.jsx)(`mesh`,{material:g.far,position:[0,13,-26],renderOrder:1,children:(0,E.jsx)(`planeGeometry`,{args:[110,30]})}),(0,E.jsx)(`mesh`,{material:g.farFog,position:[0,3,-18],renderOrder:2,children:(0,E.jsx)(`planeGeometry`,{args:[100,10]})}),(0,E.jsx)(`mesh`,{material:g.mid,position:[0,11.5,-12],renderOrder:3,children:(0,E.jsx)(`planeGeometry`,{args:[74,25]})}),(0,E.jsx)(`mesh`,{material:g.ground,position:[0,0,.5],rotation:[-Math.PI/2,0,0],renderOrder:4,children:(0,E.jsx)(`planeGeometry`,{args:[60,25]})}),(0,E.jsx)(`mesh`,{material:g.grassFar,position:[0,.7,-6],renderOrder:5,children:(0,E.jsx)(`planeGeometry`,{args:[46,1.6]})}),(0,E.jsx)(`mesh`,{material:g.midFog,position:[0,1.1,-3],renderOrder:6,children:(0,E.jsx)(`planeGeometry`,{args:[60,4.2]})}),(0,E.jsx)(`points`,{geometry:x,material:g.ff,frustumCulled:!1,renderOrder:7}),(0,E.jsx)(`mesh`,{ref:I,material:g.lantern,renderOrder:8,visible:!1,children:(0,E.jsx)(`planeGeometry`,{args:[1,1]})}),(0,E.jsx)(`mesh`,{material:g.nearFog,position:[0,.3,1.5],renderOrder:9,children:(0,E.jsx)(`planeGeometry`,{args:[40,2.6]})}),(0,E.jsx)(`mesh`,{material:g.grassNear,position:[0,.85,4.6],renderOrder:10,children:(0,E.jsx)(`planeGeometry`,{args:[22,2]})}),(0,E.jsx)(`mesh`,{ref:S,material:g.trunk,position:[-6,4.5,6.5],renderOrder:11,children:(0,E.jsx)(`planeGeometry`,{args:[1.1,10]})}),(0,E.jsx)(`mesh`,{ref:w,material:g.trunk,position:[6,4.5,6.5],rotation:[0,0,.04],scale:[.7,1,1],renderOrder:11,children:(0,E.jsx)(`planeGeometry`,{args:[1.1,10]})})]})}function de(e,t,n,r){for(let t=0;t<N;t++)for(let r=0;r<M;r++){let i=j*(r+M*t);for(let t=0;t<j;t++){let r=i+t;n[r]=e[r]+(t>0?e[r-1]:0)+(t<j-1?e[r+1]:0)}}for(let e=0;e<N;e++)for(let t=0;t<M;t++)for(let i=0;i<j;i++){let a=i+j*(t+M*e);r[a]=n[a]+(t>0?n[a-j]:0)+(t<M-1?n[a+j]:0)}let i=j*M;for(let e=0;e<N;e++)for(let n=0;n<i;n++){let a=n+i*e;t[a]=r[a]+(e>0?r[a-i]:0)+(e<N-1?r[a+i]:0)}}function fe(e,t){for(let n=0;n<ie;n++)for(let r=0;r<R;r++){let i=r+n*R;t[i]=(e[i]*2+(r>0?e[i-1]:0)+(r<55?e[i+1]:0))*.25}for(let n=0;n<ie;n++)for(let r=0;r<R;r++){let i=r+n*R;e[i]=(t[i]*2+(n>0?t[i-R]:0)+(n<23?t[i+R]:0))*.25}}function pe(e,t,n){let r=e.getContext(`2d`);if(!r)return;let i=Math.min(2,window.devicePixelRatio||1),a=e.clientWidth,o=e.clientHeight;e.width!==Math.round(a*i)&&(e.width=Math.round(a*i),e.height=Math.round(o*i)),r.setTransform(i,0,0,i,0,0),r.clearRect(0,0,a,o),r.strokeStyle=`rgba(216,255,106,0.12)`,r.lineWidth=1,r.setLineDash([2,3]);for(let e of[.5,1]){let t=Math.round(o-2-e*(o-4))+.5;r.beginPath(),r.moveTo(0,t),r.lineTo(a,t),r.stroke()}if(r.setLineDash([]),n<2)return;let s=t.length,c=a/(s-1);r.beginPath();for(let e=s-n;e<s;e++){let i=e*c,a=o-2-t[e]*(o-4);e===s-n?r.moveTo(i,a):r.lineTo(i,a)}r.strokeStyle=`#d8ff6a`,r.lineWidth=1.5,r.stroke(),r.lineTo(a,o),r.lineTo((s-n)*c,o),r.closePath();let l=r.createLinearGradient(0,0,0,o);l.addColorStop(0,`rgba(216,255,106,0.28)`),l.addColorStop(1,`rgba(216,255,106,0)`),r.fillStyle=l,r.fill();let u=o-2-t[s-1]*(o-4);r.fillStyle=`#f4ffc8`,r.beginPath(),r.arc(a-2.5,u,2.5,0,F),r.fill()}var me=[{zh:`各自闪烁`,en:`Incoherent`,aside:`phases random`},{zh:`局部成团`,en:`Local clusters`,aside:`neighbours lock in`},{zh:`同步波`,en:`Travelling waves`,aside:`phase gradients sweep`},{zh:`齐声明灭`,en:`Global sync`,aside:`r → 1`}],he=[{value:0,label:`无耦合`},{value:1,label:`弱`},{value:2,label:`强`}];function ge(){let[e,t]=(0,T.useState)(2),[n,a]=(0,T.useState)(0),o=i(I[2]),s=i(L[2]),c=(0,T.useRef)({x:0,y:0,vx:0,vy:0,t:-1e9}),l=(0,T.useRef)([]),u=(0,T.useRef)(0),d=(0,T.useRef)({value:null,spark:null,pulse:null}),f=(0,T.useRef)(null),p=(0,T.useMemo)(()=>({k:o,kg:s,ptr:c,clicks:l,reset:u,meter:d,onState:a}),[o,s]);(0,T.useEffect)(()=>{let t=r(o,I[e],{duration:1.2,ease:[.23,1,.32,1]}),n=r(s,L[e],{duration:1.2,ease:[.23,1,.32,1]});return()=>{t.stop(),n.stop()}},[e,o,s]);let m=e=>{let t=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-t.left)/t.width*2-1,y:-((e.clientY-t.top)/t.height)*2+1}},h=e=>!!e.target.closest?.(`.dock, .ff-meter`),g=me[n];return(0,E.jsxs)(`div`,{className:`stage ff-stage`,style:{background:B,touchAction:`none`},onPointerMove:e=>{if(h(e))return;let t=m(e),n=c.current,r=performance.now(),i=Math.max(8,r-n.t)/1e3;r-n.t<200?(n.vx=n.vx*.5+(t.x-n.x)/i*.5,n.vy=n.vy*.5+(t.y-n.y)/i*.5):(n.vx=0,n.vy=0),n.x=t.x,n.y=t.y,n.t=r,f.current&&(f.current.moved+=Math.hypot(e.clientX-f.current.x,e.clientY-f.current.y))},onPointerDown:e=>{if(h(e))return;f.current={x:e.clientX,y:e.clientY,moved:0};let t=m(e);Object.assign(c.current,{x:t.x,y:t.y,vx:0,vy:0,t:performance.now()})},onPointerUp:e=>{let t=f.current;f.current=null,t&&!h(e)&&Math.hypot(e.clientX-t.x,e.clientY-t.y)<8&&t.moved<24&&l.current.push(m(e))},children:[(0,E.jsx)(`style`,{children:`
        .ff-meter { position: absolute; top: 84px; right: 24px; width: 216px; padding: 14px 16px 12px; border-radius: 18px;
          background: rgba(10, 18, 16, 0.42); box-shadow: inset 0 0 0 1px rgba(216, 255, 106, 0.12); backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px); color: var(--fg); pointer-events: none !important; }
        .ff-meter-row { display: flex; align-items: baseline; justify-content: space-between; }
        .ff-pulse { display: inline-block; width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; vertical-align: 0; background: #e6ffb0; box-shadow: 0 0 10px 2px rgba(216,255,106,.7); opacity: .2; }
        .ff-meter-label { font: 500 11px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2); text-transform: uppercase; }
        .ff-meter-value { font: 600 26px/1 var(--mono); font-variant-numeric: tabular-nums; color: #e6ffb0; text-shadow: 0 0 14px rgba(216,255,106,.45); }
        .ff-meter canvas { display: block; width: 100%; height: 40px; margin-top: 10px; }
        .ff-meter-foot { display: flex; justify-content: space-between; margin-top: 6px; font: 10px/1 var(--mono); color: var(--fg-2); opacity: .7; }
        .ff-stage .big-label h1 { text-shadow: 0 0 40px rgba(5, 9, 10, 0.9); }
        @media (max-width: 760px) {
          .ff-meter { top: 76px; right: 16px; width: 150px; padding: 10px 12px 9px; border-radius: 14px; }
          .ff-meter-value { font-size: 20px; }
          .ff-meter canvas { height: 28px; margin-top: 7px; }
          .ff-meter-foot { display: none; }
          .ff-stage .dock .seg { padding: 0 12px; }
        }
      `}),(0,E.jsx)(x,{dpr:[1,2],camera:{position:[0,1.9,12],fov:42,near:.1,far:120},gl:{antialias:!0,alpha:!1},children:(0,E.jsx)(ue,{ctl:p})}),(0,E.jsxs)(`div`,{className:`overlay`,children:[(0,E.jsx)(w,{id:String(n),meta:`${O.toLocaleString()} 只萤火虫 · Kuramoto 耦合`,title:g.zh,sub:g.en,aside:g.aside}),(0,E.jsxs)(`div`,{className:`ff-meter`,"aria-live":`off`,children:[(0,E.jsxs)(`div`,{className:`ff-meter-row`,children:[(0,E.jsxs)(`span`,{className:`ff-meter-label`,children:[(0,E.jsx)(`i`,{className:`ff-pulse`,ref:e=>void(d.current.pulse=e)}),`同步度 r`]}),(0,E.jsx)(`span`,{className:`ff-meter-value`,ref:e=>void(d.current.value=e),children:`0.00`})]}),(0,E.jsx)(`canvas`,{ref:e=>void(d.current.spark=e)}),(0,E.jsxs)(`div`,{className:`ff-meter-foot`,children:[(0,E.jsx)(`span`,{children:`−15 s`}),(0,E.jsx)(`span`,{children:`|⟨e^iθ⟩|`})]})]}),(0,E.jsxs)(`div`,{className:`dock`,children:[(0,E.jsx)(S,{items:he,value:e,onChange:t}),(0,E.jsx)(`span`,{className:`dock-sep`}),(0,E.jsx)(`button`,{className:`seg`,onClick:()=>u.current++,children:(0,E.jsx)(`span`,{children:`重置`})})]}),(0,E.jsxs)(`p`,{className:`hint`,children:[`划过萤火虫打乱节奏 · 点击点一盏灯笼`,(0,E.jsx)(`br`,{}),`静置时偶尔起风，同步再次浮现`]})]})]})}export{ge as default};