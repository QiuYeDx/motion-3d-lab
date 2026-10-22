import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{E as r,P as i,St as a,T as o,Xt as s,h as c,it as l,u,vn as d,xt as f,yn as p}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as m}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as h}from"./iso-CLB38p39.js";import{t as g}from"./Seg-CH5KfWEm.js";import{i as _,o as v,r as y,t as b}from"./dist-NDw4pbEK.js";import{t as x}from"./GPUComputationRenderer-BkSo-k_S.js";import{t as S}from"./BigLabel-CceM23C6.js";var C=e(t(),1),w=n(),T=1,E=3,D=1.6,O=.14,k=.35,A=.8,j=.85,M=7.2,N=.55,P=[{key:`head`,zh:`正面`,en:`Head-on`,aside:`r_p 0.4`,rp:.4,fv:1,kdf:.26,a:[28,20],b:[62,200]},{key:`graze`,zh:`擦身`,en:`Grazing`,aside:`r_p 1.9 · prograde`,rp:1.9,fv:.94,kdf:.3,a:[18,30],b:[48,150]},{key:`retro`,zh:`逆行`,en:`Retrograde`,aside:`B spins backwards`,rp:1.45,fv:.94,kdf:.3,a:[22,40],b:[158,120]}],F=[{key:`approach`,zh:`接近`,en:`Approach`},{key:`pass`,zh:`初次掠过`,en:`First passage`},{key:`tails`,zh:`潮汐尾`,en:`Tidal tails`},{key:`fall`,zh:`回落`,en:`Falling back`},{key:`merge`,zh:`并合`,en:`Coalescence`},{key:`ellip`,zh:`椭圆星系`,en:`Elliptical remnant`}],I=[{value:.5,label:`0.5×`},{value:1,label:`1×`},{value:2,label:`2×`}];function L(e,t,n,r){return t*(T/(e+r*r*n*n)**1.5+E/(e+D*D*n*n)**1.5)}function R(e){let t=e=>L(e,1,1,k)+L(e,A,j,k),n=Math.sqrt(-2*(e=>-(T/Math.hypot(e,k)+E/Math.hypot(e,D))*1.8)(e.rp)),r=e.rp,i=0,a=0,o=n*e.fv,s=.002;for(let e=0;e<4e4&&Math.hypot(r,i)<M;e++){let e=-t(r*r+i*i);a-=e*r*s,o-=e*i*s,r-=a*s,i-=o*s}let c=-Math.atan2(i,r),l=Math.cos(c),u=Math.sin(c);[r,i]=[l*r-u*i,u*r+l*i],[a,o]=[l*a-u*o,u*a+l*o];let d=[a,o],f=.01,p=4801,m=new Float32Array(p),h=new Float32Array(p);for(let n=0;n<p;n++){m[n]=r,h[n]=i;for(let n=0;n<5;n++){let n=r*r+i*i,c=-t(n),l=1/(1+n/(D*D))**1.5;a+=(c*r-e.kdf*l*a)*s,o+=(c*i-e.kdf*l*o)*s,r+=a*s,i+=o*s}}let g=e=>Math.hypot(m[e],h[e]),_=[];for(let e=1;e<4800;e++){let t=g(e-1),n=g(e),r=g(e+1);n<t&&n<=r?_.push({t:e*f,min:!0}):n>t&&n>=r&&_.push({t:e*f,min:!1})}let v=0;for(let e=0;e<p;e++)g(e)>.55&&(v=e);let y=v*f,b=_.filter(e=>e.min),x=_.filter(e=>!e.min),S=b[0]?.t??5,C=x.find(e=>e.t>S)?.t??S+2;return{step:f,rx:m,rz:h,v0:d,tPeri1:S,tApo1:C,tPeri2:Math.min(b.find(e=>e.t>C)?.t??y,y),tMerge:y,tEnd:Math.min(y+8,48)}}function z(e,t,n){let r=Math.min(Math.max(t/e.step,0),e.rx.length-1.001),i=Math.floor(r),a=r-i;return n.set(e.rx[i]+(e.rx[i+1]-e.rx[i])*a,0,e.rz[i]+(e.rz[i+1]-e.rz[i])*a)}function B(e,t){return t<e.tPeri1-1.1?0:t<e.tPeri1+1.4?1:t<Math.max(e.tApo1,e.tPeri1+3)?2:t<e.tPeri2-.6?3:t<e.tMerge+1.5?4:5}function V([e,t]){let n=f.degToRad(e),r=f.degToRad(t),i=new p(Math.sin(n)*Math.cos(r),-Math.cos(n),Math.sin(n)*Math.sin(r)).normalize(),a=new p(1,0,0).cross(i);return a.lengthSq()<1e-4&&a.set(0,0,1).cross(i),a.normalize(),{n:i,e1:a,e2:new p().crossVectors(i,a).normalize()}}var H=(()=>{let e=1234567;return()=>(e^=e<<13,e^=e>>>17,e^=e<<5,(e>>>0)%1e9/1e9)})(),U=()=>Math.sqrt(-2*Math.log(H()+1e-9))*Math.cos(6.2831853*H());function W(e,t,n,r,i){let a=n*r,o=new Float32Array(a*4),s=new Float32Array(a*4),c=1.8,l=new p(t.rx[0],0,t.rz[0]),u=new p(t.v0[0],0,t.v0[1]),d=[{m:1,s:1,c:l.clone().multiplyScalar(-.8/c),v:u.clone().multiplyScalar(-.8/c),b:V(e.a)},{m:A,s:j,c:l.clone().multiplyScalar(1/c),v:u.clone().multiplyScalar(1/c),b:V(e.b)}],f=new p,m=a/2;for(let e=0;e<a;e++){let t=d[e<m?0:1],n=i[e],r,a,c,l,u,p;if(n===1){let e=0;do e=.22*Math.sqrt(1/(H()*.98+.01)**(2/3)-1);while(e>.7||e<.05);e*=t.s;let n=H()*2-1,i=H()*Math.PI*2,o=Math.sqrt(1-n*n);r=e*o*Math.cos(i),a=e*o*Math.sin(i),c=e*n*.7;let s=Math.sqrt(e*e*L(e*e,t.m,t.s,O));f.set(U(),U(),U());let d=Math.hypot(r,a,c),m=(f.x*r+f.y*a+f.z*c)/(d*d);f.set(f.x-m*r,f.y-m*a,f.z-m*c).normalize().multiplyScalar(s),l=f.x,u=f.y,p=f.z}else{let e=0;do e=-.44*Math.log((H()+1e-9)*(H()+1e-9));while(e>2.3||e<.12);n===2&&(e=Math.max(e,.45));let i=n===2||H()<.4?(-6.6*Math.log(e/.6)+(H()<.5?0:2*Math.PI)+U()*.55)/2:H()*Math.PI*2;e*=t.s,r=e*Math.cos(i),a=e*Math.sin(i),c=U()*.035*t.s*(1+e*.6);let o=Math.sqrt(e*e*L(e*e,t.m,t.s,O)),s=.035+.05*Math.exp(-e/.5);l=-Math.sin(i)*o+U()*s,u=Math.cos(i)*o+U()*s,p=U()*s*.5}let{e1:h,e2:g,n:_}=t.b;o[e*4]=t.c.x+h.x*r+g.x*a+_.x*c,o[e*4+1]=t.c.y+h.y*r+g.y*a+_.y*c,o[e*4+2]=t.c.z+h.z*r+g.z*a+_.z*c,o[e*4+3]=1,s[e*4]=t.v.x+h.x*l+g.x*u+_.x*p,s[e*4+1]=t.v.y+h.y*l+g.y*u+_.y*p,s[e*4+2]=t.v.z+h.z*l+g.z*u+_.z*p,s[e*4+3]=0}return{pos:o,vel:s}}var G=`
uniform vec3 uCA, uCB;
uniform float uH;
vec3 acc(vec3 p) {
  vec3 d = uCA - p;
  float r2 = dot(d, d);
  vec3 a = d * (${T.toFixed(3)} * pow(r2 + ${(O*O).toFixed(5)}, -1.5) + ${E.toFixed(3)} * pow(r2 + ${(D*D).toFixed(5)}, -1.5));
  d = uCB - p;
  r2 = dot(d, d);
  a += d * ${A.toFixed(3)} * (${T.toFixed(3)} * pow(r2 + ${(O*O*j*j).toFixed(5)}, -1.5) + ${E.toFixed(3)} * pow(r2 + ${(D*D*j*j).toFixed(5)}, -1.5));
  return a;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`,K=`
uniform float uRelax, uSeed;
${G}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 p = texture2D(texturePosition, uv).xyz;
  vec3 v = texture2D(textureVelocity, uv).xyz;
  v += acc(p) * uH;
  // after coalescence: "violent relaxation" — orbit planes get scrambled, energy kept → a spheroidal remnant
  if (uRelax > 0.0) {
    float sp = length(v);
    float a = hash12(uv * 731.3 + uSeed) * 6.2831853;
    float z = hash12(uv * 197.1 - uSeed * 1.7) * 2.0 - 1.0;
    vec3 rd = vec3(sqrt(1.0 - z * z) * vec2(cos(a), sin(a)), z);
    // only the bound inner body relaxes; the tails keep streaming
    float inner = exp(-dot(p, p) / 5.0);
    v = normalize(mix(v, rd * sp, min(uRelax * inner * uH * 0.9, 0.5)) + 1e-6) * sp;
  }
  gl_FragColor = vec4(v, 0.0);
}
`,q=`
${G}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec3 v = texture2D(textureVelocity, uv).xyz;
  // symplectic Euler: drift with the freshly kicked velocity (same kick as the velocity pass)
  gl_FragColor = vec4(p.xyz + (v + acc(p.xyz) * uH) * uH, p.w);
}
`,J=`
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform vec3 uCA, uCB;
uniform mat3 uBA, uBB;     // columns e1, e2, n
uniform vec2 uArm;         // density-wave strength per galaxy (fades once tides take over)
uniform float uTime, uSize, uPR, uFade, uHalfV;
uniform vec3 uColA, uColB, uCore, uHiiA, uHiiB;
attribute float aKind;
attribute float aSeed;
varying vec3 vCol;

float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
  vec2 uv = position.xy;
  vec3 p = texture2D(tPos, uv).xyz;
  vec3 v = texture2D(tVel, uv).xyz;
  bool isB = uv.y > uHalfV;
  vec3 c = isB ? uCB : uCA;
  mat3 B = isB ? uBB : uBA;
  float sc = isB ? ${j.toFixed(3)} : 1.0;
  vec3 q = (p - c) / sc;
  vec3 l = q * B;                         // local disk coords (x, y in plane, z along the spin)
  float r = length(l.xy) + 1e-4;
  float th = atan(l.y, l.x);

  // two trailing log-spiral arms rotating at a fixed pattern speed (stars stream through them)
  float ph = 2.0 * (th - uTime * 0.42) + 6.6 * log(r / 0.6);
  float arm = pow(0.5 + 0.5 * cos(ph), 3.0);
  float dust = pow(0.5 + 0.5 * cos(ph + 0.95), 10.0) * smoothstep(0.25, 0.6, r) * (0.45 + 0.9 * vnoise(l * 7.0 + 3.1));
  float armK = (isB ? uArm.y : uArm.x) * smoothstep(0.18, 0.5, r) * (1.0 - smoothstep(1.7, 2.4, r));

  vec3 base = isB ? uColB : uColA;
  vec3 hii = isB ? uHiiB : uHiiA;
  float b = 1.0;
  vec3 col = base;
  if (aKind > 1.5) {            // HII knots / young clusters: only lit in the arms
    col = hii;
    b = 0.45 + armK * 4.0 * arm;
  } else {
    b = mix(1.0, 0.3 + 2.2 * arm, armK) * (1.0 - 0.8 * dust * armK);
  }
  // warm, dense core
  float rc = length(q);
  float core = exp(-rc * rc * 9.0);
  if (aKind > 0.5 && aKind < 1.5) core = max(core, 0.6);
  col = mix(col, uCore, core * 0.8);
  b *= 1.0 - 0.45 * core;
  // fast stars (flung out at pericentre) burn hotter
  float sp = smoothstep(1.2, 3.2, length(v));
  col = mix(col, vec3(1.0), sp * 0.35);
  b *= 1.0 + sp * 0.6;
  b *= mix(0.75, 1.25, fract(aSeed * 7.13));
  // sparse debris far from both nuclei glows fainter (surface brightness, not just dot count)
  vec3 da = p - uCA;
  vec3 db = p - uCB;
  float dmin2 = min(dot(da, da), dot(db, db));
  b *= 0.55 + 0.45 * exp(-dmin2 / 7.0);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * (aKind > 1.5 ? 1.5 : mix(0.8, 1.25, aSeed));
  gl_PointSize = max(sz * uPR * (16.0 / -mv.z), 1.0);
  vCol = col * b * uFade;
}
`,Y=`
uniform float uGain;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = exp(-d * 3.2) - 0.04;
  gl_FragColor = vec4(vCol * a * uGain, 1.0);
}
`,X=`
varying vec2 vUv;
void main() {
  vUv = uv;
  // camera-facing billboard
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  gl_Position = projectionMatrix * mv;
}
`,Z=`
uniform vec3 uCol;
uniform float uI;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float g = exp(-r * r * 7.0) * 0.8 + exp(-r * r * 60.0) * 2.2;
  gl_FragColor = vec4(uCol * g * uI * (1.0 - smoothstep(0.8, 1.0, r)), 1.0);
}
`,Q=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`,ee=`
uniform vec2 uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uAspect;
  float r = length(p - vec2(0.05, 0.02));
  vec3 col = mix(vec3(0.0032, 0.0026, 0.0085), vec3(0.0004, 0.0003, 0.0012), smoothstep(0.0, 0.9, r));
  col += vec3(0.004, 0.0025, 0.011) * exp(-r * r * 5.0);
  gl_FragColor = vec4(col, 1.0);
}
`,te=`
attribute float aSeed;
uniform float uTime, uPR;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 40.0);
  float big = step(0.985, aSeed);
  gl_PointSize = (1.2 + big * 1.6) * uPR;
  vec3 c = mix(vec3(0.62, 0.7, 1.0), vec3(1.0, 0.82, 0.62), fract(aSeed * 13.7));
  vCol = c * (0.05 + 0.2 * pow(fract(aSeed * 91.3), 6.0) + big * 0.4) * tw;
}
`,ne=`
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = 1.0 - smoothstep(0.1, 0.5, length(c));
  gl_FragColor = vec4(vCol * a, 1.0);
}
`,$=e=>new i(e);function re({w:e,h:t,ctl:n}){let i=c(e=>e.gl),m=e*t,g=(0,C.useMemo)(()=>{let e=new Float32Array(m);for(let t=0;t<m;t++){let n=H();e[t]=n<.09?1:n<.14?2:0}return e},[m]),_=(0,C.useMemo)(()=>P.map(e=>R(e)),[]),v=(0,C.useMemo)(()=>{let n=new x(e,t,i);i.extensions.has(`EXT_color_buffer_float`)||n.setDataType(l);let r=n.createTexture(),a=n.createTexture(),o=n.addVariable(`textureVelocity`,K,a),s=n.addVariable(`texturePosition`,q,r);n.setVariableDependencies(o,[o,s]),n.setVariableDependencies(s,[o,s]);let c=()=>({uCA:{value:new p},uCB:{value:new p},uH:{value:0}});Object.assign(o.material.uniforms,c(),{uRelax:{value:0},uSeed:{value:0}}),Object.assign(s.material.uniforms,c());let u=n.init();return u&&console.error(u),{gpu:n,velVar:o,posVar:s,pos0:r,vel0:a}},[i,e,t]);(0,C.useEffect)(()=>()=>v.gpu.dispose(),[v]);let y=(0,C.useMemo)(()=>{let n=new r,i=new Float32Array(m*3),a=new Float32Array(m);for(let n=0;n<m;n++)i[n*3]=(n%e+.5)/e,i[n*3+1]=(Math.floor(n/e)+.5)/t,a[n]=H();return n.setAttribute(`position`,new o(i,3)),n.setAttribute(`aKind`,new o(g,1)),n.setAttribute(`aSeed`,new o(a,1)),n},[m,e,t,g]),b=(0,C.useMemo)(()=>new s({vertexShader:J,fragmentShader:Y,uniforms:{tPos:{value:null},tVel:{value:null},uCA:{value:new p},uCB:{value:new p},uBA:{value:new a},uBB:{value:new a},uArm:{value:new d(1,1)},uTime:{value:0},uSize:{value:m>8e4?2.1:2.5},uPR:{value:1},uFade:{value:0},uHalfV:{value:.5},uGain:{value:m>8e4?.34:.48},uColA:{value:$(`#7d9dff`)},uColB:{value:$(`#ffb455`)},uCore:{value:$(`#fff1dc`)},uHiiA:{value:$(`#9ad2ff`)},uHiiB:{value:$(`#ff7f9e`)}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),[m]),S=(0,C.useMemo)(()=>[$(`#ffe6c4`),$(`#ffd59a`)].map(e=>new s({vertexShader:X,fragmentShader:Z,uniforms:{uCol:{value:e},uI:{value:0}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2})),[]),T=(0,C.useRef)(null),E=(0,C.useRef)(null),D=(0,C.useMemo)(()=>({t:0,clock:0,orbit:_[n.preset.current],preset:-1,reset:-1,fade:0,ending:!1,phase:-1,years:``,lastUi:0,ca:new p,cb:new p,rel:new p,basisA:new a,basisB:new a,warm:h}),[_,n]),O=n=>{let r=P[n],i=_[n],a=W(r,i,e,t,g);v.pos0.image.data.set(a.pos),v.vel0.image.data.set(a.vel),v.pos0.needsUpdate=!0,v.vel0.needsUpdate=!0;for(let e of v.posVar.renderTargets)v.gpu.renderTexture(v.pos0,e);for(let e of v.velVar.renderTargets)v.gpu.renderTexture(v.vel0,e);let o=V(r.a),s=V(r.b);D.basisA.set(o.e1.x,o.e2.x,o.n.x,o.e1.y,o.e2.y,o.n.y,o.e1.z,o.e2.z,o.n.z),D.basisB.set(s.e1.x,s.e2.x,s.n.x,s.e1.y,s.e2.y,s.n.y,s.e1.z,s.e2.z,s.n.z),D.orbit=i,D.preset=n,D.t=0,D.ending=!1},k=e=>{z(D.orbit,e,D.rel);let t=1.8;D.ca.copy(D.rel).multiplyScalar(-.8/t),D.cb.copy(D.rel).multiplyScalar(1/t)},A=e=>{k(D.t+e*.5);let t=v.velVar.material.uniforms,n=v.posVar.material.uniforms;t.uCA.value.copy(D.ca),t.uCB.value.copy(D.cb),n.uCA.value.copy(D.ca),n.uCB.value.copy(D.cb),t.uH.value=e,n.uH.value=e;let r=D.orbit;t.uRelax.value=f.smoothstep(D.t,r.tMerge-2,r.tMerge+3),t.uSeed.value=(t.uSeed.value+.6180339)%97,v.gpu.compute(),D.t+=e};return u((e,t)=>{let r=Math.min(t,1/30);D.clock+=r,(D.preset!==n.preset.current||D.reset!==n.resetReq.current)&&(D.reset=n.resetReq.current,O(n.preset.current),D.fade=0,h&&(D.warm=!0));let i=D.orbit,a=.0125;if(D.warm){let e=i.tPeri1+3;for(let t=0;t<60&&D.t<e;t++)A(a);D.t>=e&&(D.warm=!1)}else if(n.playing.current&&!D.ending){let e=r*n.speed.current,t=Math.min(8,Math.ceil(e/a));for(let n=0;n<t;n++)A(e/t)}D.t>=i.tEnd&&(D.ending=!0),D.fade=f.damp(D.fade,+!D.ending,D.ending?3.2:2.2,r),D.ending&&D.fade<.02&&n.resetReq.current++,k(D.t);let o=b.uniforms;o.tPos.value=v.gpu.getCurrentRenderTarget(v.posVar).texture,o.tVel.value=v.gpu.getCurrentRenderTarget(v.velVar).texture,o.uCA.value.copy(D.ca),o.uCB.value.copy(D.cb),o.uBA.value.copy(D.basisA),o.uBB.value.copy(D.basisB);let s=1-f.smoothstep(D.t,i.tPeri1-1.2,i.tPeri1+2.2);o.uArm.value.set(s,s),o.uTime.value=D.t,o.uPR.value=e.viewport.dpr,o.uFade.value=D.fade;let c=D.rel.length();if(T.current&&E.current){T.current.position.copy(D.ca),E.current.position.copy(D.cb);let e=1-f.smoothstep(c,.2,.9);S[0].uniforms.uI.value=D.fade*(.5+.35*e),S[1].uniforms.uI.value=D.fade*.42*(1-e*.8)}let l=n.drag.current,u=!l.down&&performance.now()-l.last>2500;if(!l.down){l.yaw+=l.vy*r,l.pitch+=l.vp*r;let e=Math.exp(-r*3.2);l.vy*=e,l.vp*=e}u&&(l.yaw+=r*.035),l.pitch=f.clamp(l.pitch,-1.25,1.35);let d=e.camera,{width:p,height:m}=e.size,g=p/m,_=p<760,y=(9.5+Math.max(f.clamp(c,2.5,7.2),f.lerp(2.5,7.4,f.smoothstep(D.t,i.tPeri1,i.tPeri1+4)))*1.05)/Math.min(1,g*(_?.95:.8)),x=d.userData;x.dist=f.damp(x.dist??y,y,.8,r);let C=x.dist,w=.5+l.pitch;d.position.set(Math.sin(l.yaw)*Math.cos(w)*C,Math.sin(w)*C,Math.cos(l.yaw)*Math.cos(w)*C),d.lookAt(0,0,0);let j=h?0:_?.1:.02;j?d.setViewOffset(p,m,0,j*m,p,m):d.clearViewOffset(),d.updateProjectionMatrix();let M=B(i,D.t),P=(D.t*N).toFixed(1);(M!==D.phase||P!==D.years&&D.clock-D.lastUi>.2)&&(D.phase=M,D.years=P,D.lastUi=D.clock,n.onPhase(M,P))}),(0,w.jsxs)(w.Fragment,{children:[(0,w.jsx)(`points`,{geometry:y,material:b,frustumCulled:!1,renderOrder:2}),(0,w.jsx)(`mesh`,{ref:T,material:S[0],frustumCulled:!1,renderOrder:3,scale:1.5,children:(0,w.jsx)(`planeGeometry`,{args:[1,1]})}),(0,w.jsx)(`mesh`,{ref:E,material:S[1],frustumCulled:!1,renderOrder:3,scale:1.3,children:(0,w.jsx)(`planeGeometry`,{args:[1,1]})})]})}function ie(){let e=c(e=>e.size),t=c(e=>e.viewport.dpr),n=(0,C.useMemo)(()=>new s({vertexShader:Q,fragmentShader:ee,uniforms:{uAspect:{value:new d(1,1)}},depthWrite:!1,depthTest:!1}),[]),i=(0,C.useMemo)(()=>{let e=2600,t=new Float32Array(e*3),n=new Float32Array(e);for(let r=0;r<e;r++){let e=H()*2-1,i=H()*Math.PI*2,a=70+H()*20,o=Math.sqrt(1-e*e);t[r*3]=o*Math.cos(i)*a,t[r*3+1]=e*a,t[r*3+2]=o*Math.sin(i)*a,n[r]=H()}let i=new r;return i.setAttribute(`position`,new o(t,3)),i.setAttribute(`aSeed`,new o(n,1)),{g:i,m:new s({vertexShader:te,fragmentShader:ne,uniforms:{uTime:{value:0},uPR:{value:1}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2})}},[]);return u(r=>{i.m.uniforms.uTime.value=r.clock.elapsedTime,i.m.uniforms.uPR.value=t;let a=e.width/e.height;n.uniforms.uAspect.value.set(Math.max(a,1),Math.max(1/a,1))}),(0,w.jsxs)(w.Fragment,{children:[(0,w.jsx)(`mesh`,{material:n,frustumCulled:!1,renderOrder:-2,children:(0,w.jsx)(`planeGeometry`,{args:[2,2]})}),(0,w.jsx)(`points`,{geometry:i.g,material:i.m,frustumCulled:!1,renderOrder:-1})]})}function ae(){let[e,t]=(0,C.useMemo)(()=>typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,[])?[256,256]:[320,320],[n,r]=(0,C.useState)(1),[i,a]=(0,C.useState)(!0),[o,s]=(0,C.useState)(1),[c,l]=(0,C.useState)({phase:0,years:`0.0`}),u=(0,C.useRef)(1),d=(0,C.useRef)(!0),p=(0,C.useRef)(1),h=(0,C.useRef)(0),x=(0,C.useRef)({yaw:-.35,pitch:0,vy:0,vp:0,down:!1,last:-1e9}),T=(0,C.useRef)({x:0,y:0,t:0,id:-1}),E=(0,C.useMemo)(()=>({preset:u,playing:d,speed:p,resetReq:h,drag:x,onPhase:(e,t)=>l(n=>n.phase===e&&n.years===t?n:{phase:e,years:t})}),[]),D=F[c.phase],O=P[n];return(0,w.jsxs)(`div`,{className:`stage gx-stage`,style:{background:`#04030a`,touchAction:`none`},onPointerDown:e=>{if(e.target.closest?.(`.dock, .demo-chrome`))return;let t=x.current;t.down=!0,t.vy=t.vp=0,t.last=performance.now(),T.current={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId},e.currentTarget.setPointerCapture(e.pointerId)},onPointerMove:e=>{let t=x.current;if(!t.down||e.pointerId!==T.current.id)return;let n=performance.now(),r=e.clientX-T.current.x,i=e.clientY-T.current.y,a=Math.max((n-T.current.t)/1e3,1/240),o=3.6/Math.max(window.innerWidth,600);t.yaw-=r*o,t.pitch+=i*o,t.vy=f.lerp(t.vy,-r*o/a,.5),t.vp=f.lerp(t.vp,i*o/a,.5),t.last=n,T.current={x:e.clientX,y:e.clientY,t:n,id:e.pointerId}},onPointerUp:e=>{let t=x.current;e.pointerId===T.current.id&&(t.down=!1,t.last=performance.now(),performance.now()-T.current.t>80&&(t.vy=t.vp=0))},onPointerCancel:()=>x.current.down=!1,children:[(0,w.jsx)(`style`,{children:`
        .gx-stage canvas { cursor: grab; }
        .gx-stage:active canvas { cursor: grabbing; }
        .gx-play { display: inline-flex; align-items: center; gap: 7px; }
        .gx-play svg { width: 10px; height: 10px; }
        .gx-legend { position: absolute; right: 24px; top: 88px; display: grid; gap: 8px; font: 500 12px/1 var(--mono); color: var(--fg-2); pointer-events: none !important; }
        .gx-legend i { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 8px; vertical-align: 0; }
        .gx-stage .big-label p span { font-variant-numeric: tabular-nums; }
        @media (max-width: 760px) {
          .gx-legend { display: none; }
          .gx-stage .dock .seg { padding: 0 10px; }
          .gx-stage .dock .dock-sep { margin: 0 2px; }
        }
      `}),(0,w.jsxs)(m,{dpr:[1,2],camera:{position:[0,6,16],fov:38,near:.1,far:300},gl:{antialias:!1,alpha:!1},children:[(0,w.jsx)(ie,{}),(0,w.jsx)(re,{w:e,h:t,ctl:E}),(0,w.jsxs)(y,{multisampling:0,children:[(0,w.jsx)(b,{mipmapBlur:!0,intensity:1.05,luminanceThreshold:.42,luminanceSmoothing:.35,radius:.72}),(0,w.jsx)(_,{mode:v.AGX})]})]}),(0,w.jsxs)(`div`,{className:`overlay`,children:[(0,w.jsx)(S,{id:D.key,meta:`${(e*t).toLocaleString()} stars · 3-body · ${O.zh}`,title:D.zh,sub:D.en,aside:`${c.years} 亿年`}),(0,w.jsxs)(`div`,{className:`gx-legend`,children:[(0,w.jsxs)(`span`,{children:[(0,w.jsx)(`i`,{style:{background:`#9db4ff`}}),`星系 A · M = 1`]}),(0,w.jsxs)(`span`,{children:[(0,w.jsx)(`i`,{style:{background:`#ffc070`}}),`星系 B · M = 0.8`]})]}),(0,w.jsxs)(`div`,{className:`dock`,children:[(0,w.jsx)(`button`,{className:`seg gx-play`,"aria-pressed":i,onClick:()=>{d.current=!i,a(!i)},children:(0,w.jsxs)(`span`,{className:`gx-play`,children:[(0,w.jsx)(`svg`,{viewBox:`0 0 10 10`,"aria-hidden":!0,children:i?(0,w.jsx)(`path`,{d:`M2 1h2v8H2zM6 1h2v8H6z`,fill:`currentColor`}):(0,w.jsx)(`path`,{d:`M2 1l7 4-7 4z`,fill:`currentColor`})}),i?`暂停`:`播放`]})}),(0,w.jsx)(`span`,{className:`dock-sep`}),(0,w.jsx)(g,{items:I,value:o,onChange:e=>{p.current=e,s(e)}}),(0,w.jsx)(`span`,{className:`dock-sep`}),(0,w.jsx)(g,{items:P.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:e=>{u.current=e,r(e),d.current=!0,a(!0)}})]}),(0,w.jsxs)(`p`,{className:`hint`,children:[`拖动旋转视角 · 碰撞参数决定潮汐尾`,(0,w.jsx)(`br`,{}),`1 秒 ≈ `,(N*o).toFixed(2),` 亿年 · `,o,`×`]})]})]})}export{ae as default};