import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{E as a,It as o,T as s,Wt as c,Xt as l,h as u,it as d,u as f,xt as p,yn as m}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as h}from"./react-three-fiber.esm-zWEOtJjG.js";import{t as g}from"./Seg-CH5KfWEm.js";import{t as _}from"./GPUComputationRenderer-BkSo-k_S.js";import{t as v}from"./BigLabel-CceM23C6.js";var y=e(t(),1),b=n(),x=[{key:`soft`,zh:`柔流`,en:`Soft Drift`,aside:`curl ψ · f 0.32`,u:{freq:.32,amp:.9,evolve:.07,oct2:0,ring:0,drag:1.6}},{key:`turb`,zh:`湍流`,en:`Turbulence`,aside:`2 octaves · f 0.6`,u:{freq:.6,amp:1.9,evolve:.2,oct2:.7,ring:0,drag:3}},{key:`ring`,zh:`环流`,en:`Orbital Ring`,aside:`swirl + curl · r 2.3`,u:{freq:.55,amp:.55,evolve:.12,oct2:.35,ring:1,drag:2.2}}],S=Object.keys(x[0].u),C=[{value:0,label:`吸引`},{value:1,label:`排斥`},{value:2,label:`旋涡`}],w=`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(3.5, 9.5, hash12(uv * 517.31 + 3.7)); }
`,T=`
uniform float uDt, uTime, uFreq, uAmp, uEvolve, uOct2, uRing, uDrag, uMaxR;
uniform vec3 uPointer, uModeW;
uniform float uPStrength;
${w}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v, out vec3 gradient) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  vec4 m2 = m * m;
  vec4 m4 = m2 * m2;
  vec4 pdotx = vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3));
  vec4 temp = m2 * m * pdotx;
  gradient = -8.0 * (temp.x * x0 + temp.y * x1 + temp.z * x2 + temp.w * x3);
  gradient += m4.x * p0 + m4.y * p1 + m4.z * p2 + m4.w * p3;
  gradient *= 105.0;
  return 105.0 * dot(m4, pdotx);
}
// curl of a 3-component potential built from offset simplex fields: 3 noise taps
vec3 curl(vec3 p) {
  vec3 g1, g2, g3;
  snoise(p, g1);
  snoise(p + vec3(31.416, -47.853, 12.793), g2);
  snoise(p + vec3(-23.17, 19.31, 73.41), g3);
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || dot(p.xyz, p.xyz) > uMaxR * uMaxR) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 pos = p.xyz;
  float te = uTime * uEvolve;
  vec3 q = pos * uFreq + vec3(te * 0.7, -te * 0.45, te);
  vec3 field = curl(q) * uAmp * 0.22;
  if (uOct2 > 0.001) field += curl(q * 2.37 + vec3(17.0, 4.0, -9.0) - te * 0.8) * uAmp * uOct2 * 0.12;

  // orbital ring around the view axis (z), pulled toward radius 2.9 and z = 0
  vec2 xy = pos.xy;
  float rr = length(xy) + 1e-4;
  vec2 rad = xy / rr;
  vec3 ringV = vec3(-rad.y, rad.x, 0.0) * (1.5 + 1.0 / (0.6 + rr)) + vec3(rad * (2.3 - rr) * 1.7, -pos.z * 1.6);
  field = mix(field, field * 0.6 + ringV, uRing);

  // soft containment so the cloud keeps its silhouette
  float d = length(pos);
  field -= pos / (d + 1e-4) * smoothstep(3.4, 5.6, d) * 1.8;

  // relax toward the field velocity (streamlines) ...
  vec3 nv = mix(field, v.xyz, exp(-uDrag * uDt));

  // ... and add the pointer source
  vec3 dp = uPointer - pos;
  float r2 = dot(dp, dp);
  float r = sqrt(r2) + 1e-3;
  vec3 dir = dp / r;
  float fall = 1.0 / (1.0 + r2 * 0.55);
  // soft core: the pull fades inside r ~ 0.6 so particles slingshot through instead of piling up
  float core = smoothstep(0.0, 0.9, r);
  vec3 attract = (dir * core + cross(vec3(0.0, 0.0, 1.0), dir) * 0.45) * fall * 9.0;
  vec3 repel = -dir * exp(-r2 * 0.35) * 26.0;
  vec3 swirl = (cross(vec3(0.0, 0.0, 1.0), dir) * 1.0 + dir * 0.35) * fall * 18.0;
  nv += (uModeW.x * attract + uModeW.y * repel + uModeW.z * swirl) * uPStrength * uDt;

  float sp = length(nv);
  if (sp > 9.0) nv *= 9.0 / sp;
  gl_FragColor = vec4(nv, 0.0);
}
`,E=`
uniform float uDt, uTime, uMaxR;
${w}
vec3 spawn(vec2 uv) {
  float a = hash12(uv * 913.1 + uTime * 1.31);
  float b = hash12(uv * 271.7 - uTime * 0.77 + 5.1);
  float c = hash12(uv * 631.9 + uTime * 0.53 + 9.3);
  float th = a * 6.2831853;
  float ph = acos(2.0 * b - 1.0);
  float r = 3.3 * pow(c, 0.5);
  return vec3(sin(ph) * cos(th) * 1.25, sin(ph) * sin(th) * 0.85, cos(ph) * 0.9) * r;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w > lifeOf(uv) || dot(p.xyz, p.xyz) > uMaxR * uMaxR) {
    gl_FragColor = vec4(spawn(uv), 0.0);
    return;
  }
  gl_FragColor = vec4(p.xyz + v.xyz * uDt, p.w + uDt);
}
`,D=`
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize, uPR, uMaxSpeed;
varying vec3 vCol;
varying float vA;
${w}
vec3 pal(float t) {
  vec3 c0 = vec3(0.30, 0.07, 0.34);
  vec3 c1 = vec3(0.78, 0.16, 0.38);
  vec3 c2 = vec3(1.00, 0.46, 0.17);
  vec3 c3 = vec3(1.00, 0.90, 0.74);
  t *= 3.0;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  return mix(c2, c3, t - 2.0);
}
void main() {
  vec2 uv = position.xy;
  vec4 p = texture2D(tPos, uv);
  vec4 v = texture2D(tVel, uv);
  float t = clamp(length(v.xyz) / uMaxSpeed, 0.0, 1.0);
  t = smoothstep(0.0, 1.0, pow(t, 0.75));
  vCol = pal(t);
  float life = lifeOf(uv);
  vA = smoothstep(0.0, 0.7, p.w) * (1.0 - smoothstep(life - 1.4, life, p.w));
  vA *= 0.45 + 0.55 * t;
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.8 + 0.7 * t) * (9.0 / -mv.z);
}
`,O=`
uniform float uAlpha;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(vCol, vA * uAlpha * (1.0 - d * 2.4));
}
`,k=`
uniform float uTime, uMode, uOpacity;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float ang = atan(c.y, c.x) / 6.2831853 + 0.5;
  // attract: rings collapse inward, repel: expand outward, vortex: rotating dashes
  float wave = uMode < 0.5 ? fract(r * 1.6 + uTime * 0.9) : fract(r * 1.6 - uTime * 0.9);
  float rings = smoothstep(0.0, 0.06, wave) * (1.0 - smoothstep(0.08, 0.16, wave));
  float dash = step(0.5, fract(ang * 18.0 + uTime * 0.6)) * smoothstep(0.86, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float a = uMode > 1.5 ? dash : rings * (1.0 - smoothstep(0.7, 1.0, r)) * smoothstep(0.1, 0.3, r);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.62), a * uOpacity);
}
`,A=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;function j({size:e,u:t,modeW:n,mode:r,lastMove:i}){let h=u(e=>e.gl),g=u(e=>e.viewport.dpr),v=(0,y.useMemo)(()=>{let t=new _(e,e,h);h.extensions.has(`EXT_color_buffer_float`)||t.setDataType(d);let n=t.createTexture(),r=t.createTexture(),i=n.image.data;for(let e=0;e<i.length;e+=4){let t=Math.random()*Math.PI*2,n=Math.acos(2*Math.random()-1),r=3.3*Math.sqrt(Math.random());i[e]=Math.sin(n)*Math.cos(t)*r*1.25,i[e+1]=Math.sin(n)*Math.sin(t)*r*.85,i[e+2]=Math.cos(n)*r*.9,i[e+3]=Math.random()*3.5}let a=t.addVariable(`textureVelocity`,T,r),o=t.addVariable(`texturePosition`,E,n);t.setVariableDependencies(a,[a,o]),t.setVariableDependencies(o,[a,o]),Object.assign(a.material.uniforms,{uDt:{value:0},uTime:{value:0},uFreq:{value:.3},uAmp:{value:1},uEvolve:{value:.1},uOct2:{value:0},uRing:{value:0},uDrag:{value:2},uMaxR:{value:7.5},uPointer:{value:new m(99,99,0)},uModeW:{value:new m(1,0,0)},uPStrength:{value:0}}),Object.assign(o.material.uniforms,{uDt:{value:0},uTime:{value:0},uMaxR:{value:7.5}});let s=t.init();return s&&console.error(s),{gpu:t,velVar:a,posVar:o}},[h,e]);(0,y.useEffect)(()=>()=>v.gpu.dispose(),[v]);let x=(0,y.useMemo)(()=>{let t=new a,n=new Float32Array(e*e*3);for(let t=0;t<e*e;t++)n[t*3]=(t%e+.5)/e,n[t*3+1]=(Math.floor(t/e)+.5)/e;return t.setAttribute(`position`,new s(n,3)),t},[e]),C=(0,y.useMemo)(()=>new l({vertexShader:D,fragmentShader:O,uniforms:{tPos:{value:null},tVel:{value:null},uSize:{value:e>300?1.6:3.4},uPR:{value:1},uMaxSpeed:{value:2.6},uAlpha:{value:e>300?.42:.58}},transparent:!0,depthWrite:!1,blending:2}),[e]),w=(0,y.useMemo)(()=>new l({vertexShader:A,fragmentShader:k,uniforms:{uTime:{value:0},uMode:{value:0},uOpacity:{value:0}},transparent:!0,depthWrite:!1,blending:2}),[]),j=(0,y.useRef)(null),M=(0,y.useMemo)(()=>({ray:new c,plane:new o(new m(0,0,1),0),hit:new m,target:new m,cur:new m(0,0,0),strength:0,time:0}),[]);return f((e,a)=>{let o=Math.min(a,1/30);M.time+=o;let s=M.time,c=v.velVar.material.uniforms,l=v.posVar.material.uniforms,u=e.camera,d=e.size.width/e.size.height;u.position.set(Math.sin(s*.07)*1.6,Math.sin(s*.05)*.6,9.5/Math.min(1,d*1.25)),u.lookAt(0,0,0);let f=performance.now()-i.current<2600;f?(M.ray.setFromCamera(e.pointer,u),M.ray.ray.intersectPlane(M.plane,M.hit)&&M.target.copy(M.hit)):M.target.set(Math.sin(s*.29)*3.1,Math.sin(s*.43+1.2)*1.7,0);let m=1-Math.exp(-o*(f?14:2));M.cur.lerp(M.target,m),M.strength=p.damp(M.strength,f?1:.4,3,o),c.uDt.value=o,c.uTime.value=s;for(let e of S){let n=`u`+e[0].toUpperCase()+e.slice(1);c[n].value=t[e].get()}c.uPointer.value.copy(M.cur),c.uModeW.value.set(n[0].get(),n[1].get(),n[2].get()),c.uPStrength.value=M.strength,l.uDt.value=o,l.uTime.value=s,v.gpu.compute(),C.uniforms.tPos.value=v.gpu.getCurrentRenderTarget(v.posVar).texture,C.uniforms.tVel.value=v.gpu.getCurrentRenderTarget(v.velVar).texture,C.uniforms.uPR.value=g,j.current&&(j.current.position.copy(M.cur),j.current.quaternion.copy(u.quaternion),w.uniforms.uTime.value=s,w.uniforms.uMode.value=r,w.uniforms.uOpacity.value=p.damp(w.uniforms.uOpacity.value,f?.55:.18,4,o))}),(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`points`,{geometry:x,material:C,frustumCulled:!1}),(0,b.jsx)(`mesh`,{ref:j,material:w,renderOrder:2,children:(0,b.jsx)(`planeGeometry`,{args:[1.5,1.5]})})]})}function M(){let e=(0,y.useMemo)(()=>typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,[])?256:512,[t,n]=(0,y.useState)(0),[a,o]=(0,y.useState)(!0),[s,c]=(0,y.useState)(0),l=(0,y.useRef)(-1e9),u=i(x[0].u.freq),d=i(x[0].u.amp),f=i(x[0].u.evolve),p=i(x[0].u.oct2),m=i(x[0].u.ring),_=i(x[0].u.drag),w=(0,y.useMemo)(()=>({freq:u,amp:d,evolve:f,oct2:p,ring:m,drag:_}),[u,d,f,p,m,_]),T=i(1),E=i(0),D=i(0),O=(0,y.useMemo)(()=>[T,E,D],[T,E,D]);(0,y.useEffect)(()=>{let e=x[t].u,n=S.map(t=>r(w[t],e[t],{duration:2.2,ease:[.45,0,.2,1]}));return()=>n.forEach(e=>e.stop())},[t,w]),(0,y.useEffect)(()=>{let e=O.map((e,t)=>r(e,+(t===s),{duration:.7,ease:[.23,1,.32,1]}));return()=>e.forEach(e=>e.stop())},[s,O]),(0,y.useEffect)(()=>{if(!a)return;let e=setInterval(()=>n(e=>(e+1)%x.length),9e3);return()=>clearInterval(e)},[a]);let k=x[t];return(0,b.jsxs)(`div`,{className:`stage`,style:{background:`radial-gradient(80% 70% at 55% 45%, #1a0f1f 0%, #0b0810 60%, #060509 100%)`,touchAction:`none`},onPointerMove:()=>l.current=performance.now(),onPointerDown:()=>l.current=performance.now(),children:[(0,b.jsx)(h,{dpr:[1,2],camera:{position:[0,0,9.5],fov:45},gl:{antialias:!1,alpha:!0},children:(0,b.jsx)(j,{size:e,u:w,modeW:O,mode:s,lastMove:l})}),(0,b.jsxs)(`div`,{className:`overlay`,children:[(0,b.jsx)(v,{id:k.key,meta:`${(e*e).toLocaleString()} particles · GPGPU`,title:k.zh,sub:k.en,aside:k.aside}),(0,b.jsxs)(`div`,{className:`dock`,children:[(0,b.jsx)(g,{items:x.map((e,t)=>({value:t,label:e.zh})),value:t,onChange:e=>{n(e),o(!1)}}),(0,b.jsx)(`span`,{className:`dock-sep`}),(0,b.jsx)(g,{items:C,value:s,onChange:c})]}),(0,b.jsxs)(`p`,{className:`hint`,children:[`移动指针牵引粒子`,(0,b.jsx)(`br`,{}),`静置时引力源自动巡游`]})]})]})}export{M as default};