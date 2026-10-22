import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{$ as s,Ct as c,E as l,It as u,M as d,T as f,Vt as p,Wt as m,Xt as h,h as g,k as _,nn as v,ot as y,q as b,u as x,vn as S,xt as C,yn as w,z as T}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as E}from"./react-three-fiber.esm-zWEOtJjG.js";import{t as D}from"./BufferGeometryUtils-CFh0TICt.js";import{n as O}from"./iso-CLB38p39.js";import{a as k}from"./isoWarmup-CvqWCm1z.js";import{t as A}from"./BigLabel-CceM23C6.js";var j=e(t(),1),M=n(),N=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760?180:240,P=N*2,F=.13,I=.62,L=.2,R=4.8,z=Math.PI*(3-Math.sqrt(5)),B=0,V=1,H=2,U=new w(0,1,0);function W(){let e=document.createElement(`canvas`);e.width=256,e.height=256;let t=e.getContext(`2d`);t.lineCap=`round`;for(let e=0;e<64;e++){let n=e/64*Math.PI*2+(Math.random()-.5)*.05,r=122.88*(.86+Math.random()*.14),i=(Math.random()-.5)*.08,a=128+Math.cos(n+i)*r,o=128+Math.sin(n+i)*r,s=t.createLinearGradient(128,128,a,o);s.addColorStop(0,`rgba(255,255,255,0.15)`),s.addColorStop(.35,`rgba(255,255,255,0.75)`),s.addColorStop(1,`rgba(255,255,255,0.95)`),t.strokeStyle=s,t.lineWidth=1.3,t.beginPath(),t.moveTo(128,128),t.quadraticCurveTo(128+Math.cos(n)*r*.55,128+Math.sin(n)*r*.55,a,o),t.stroke(),t.lineWidth=.7,t.strokeStyle=`rgba(255,255,255,0.55)`;for(let e=0;e<9;e++){let e=.42+Math.random()*.56,a=128+Math.cos(n+i*e)*r*e,o=128+Math.sin(n+i*e)*r*e,s=n+(Math.random()<.5?-1:1)*(.5+Math.random()*.4),c=4+Math.random()*9;t.beginPath(),t.moveTo(a,o),t.lineTo(a+Math.cos(s)*c,o+Math.sin(s)*c),t.stroke()}}let n=t.createRadialGradient(128,128,0,128,128,10);n.addColorStop(0,`rgba(240,236,220,0.9)`),n.addColorStop(1,`rgba(240,236,220,0)`),t.fillStyle=n,t.fillRect(116,116,24,24);let r=new _(e);return r.colorSpace=``,r.anisotropy=4,r}function G(){let e=new v(1,8,6);e.scale(.014,.05,.014),e.translate(0,.062,0);let t=new T(.0034,.0034,1,4,1,!0);t.scale(1,.51,1),t.translate(0,.365,0);let n=(e,t)=>{let n=e.attributes.position.count,r=new Float32Array(n*3);for(let e=0;e<n;e++)r.set(t,e*3);return e.setAttribute(`color`,new f(r,3)),e.deleteAttribute(`uv`),e};return D([n(e,[.5,.42,.28]),n(t,[.88,.86,.78])])}function K(){let e=new d(L,40);e.rotateX(-Math.PI/2);let t=e.attributes.position;for(let e=0;e<t.count;e++){let n=Math.hypot(t.getX(e),t.getZ(e))/L;t.setY(e,.075*n)}return e.computeVertexNormals(),e}function q(){let e=[],t=[];for(let n=0;n<14;n++){let r=n/14*Math.PI*2+n%2*.2,i=Math.cos(r),a=Math.sin(r),o=.85+n*37%10/30,s=e.length/3;for(let n=0;n<=6;n++){let r=n/6,c=.07+.2*r*o,l=-.07-.36*r*r*o,u=.026*(1-r*.92);if(e.push(i*c-a*u,l,a*c+i*u),e.push(i*c+a*u,l,a*c-i*u),n<6){let e=s+n*2;t.push(e,e+1,e+2,e+1,e+3,e+2)}}}let n=new l;return n.setAttribute(`position`,new s(e,3)),n.setIndex(t),n.computeVertexNormals(),n}var J=`
attribute vec3 color;
attribute float aFade;
attribute float aBlur;
varying vec3 vCol;
varying vec3 vN;
varying float vFade;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vN = normalize(mat3(m) * normal);
  vCol = color;
  vFade = aFade * (1.0 - aBlur * 0.55);
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}
`,Y=`
uniform vec3 uLight;
varying vec3 vCol;
varying vec3 vN;
varying float vFade;
void main() {
  if (vFade < 0.01) discard;
  float l = 0.62 + 0.38 * max(dot(normalize(vN), uLight), 0.0);
  gl_FragColor = vec4(vCol * l, vFade);
}
`,X=`
attribute float aFade;
attribute float aBlur;
varying vec2 vUv;
varying float vFade;
varying float vBlur;
varying float vFacing;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vec3 n = normalize(mat3(m) * vec3(0.0, 1.0, 0.0));
  vFacing = abs(dot(n, normalize(cameraPosition - w.xyz)));
  vUv = uv;
  vFade = aFade;
  vBlur = aBlur;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`,Z=`
uniform sampler2D tPap;
uniform vec3 uTint;
varying vec2 vUv;
varying float vFade;
varying float vBlur;
varying float vFacing;
void main() {
  if (vFade < 0.01) discard;
  float a = texture2D(tPap, vUv, vBlur * 3.5).a;
  // seen edge-on the filaments stack up: a touch denser
  a *= mix(1.25, 0.9, vFacing);
  a *= vFade * (1.0 - vBlur * 0.45);
  if (a < 0.004) discard;
  vec3 col = gl_FrontFacing ? vec3(1.0) : uTint;
  gl_FragColor = vec4(col, min(a, 1.0));
}
`,Q=`
uniform vec2 uBend;
uniform float uLen;
varying vec3 vN;
varying float vS;
void main() {
  vec3 p = position;
  float s = clamp(p.y / uLen, 0.0, 1.0);
  p.x += uBend.x * s * s;
  p.z += uBend.y * s * s;
  vS = s;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`,ee=`
uniform vec3 uLow, uHigh;
varying vec3 vN;
varying float vS;
void main() {
  vec3 n = normalize(vN);
  float l = 0.55 + 0.45 * max(dot(n, normalize(vec3(-0.5, 0.4, 0.8))), 0.0);
  float rim = pow(1.0 - abs(n.z), 2.0) * 0.18;
  vec3 col = mix(uLow, uHigh, smoothstep(0.0, 1.0, vS)) * l + rim;
  gl_FragColor = vec4(col, 1.0);
}
`,$=`
varying vec3 vN;
varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,te=`
varying vec3 vN;
varying vec3 vP;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 n = normalize(vN);
  float l = 0.5 + 0.5 * max(dot(n, normalize(vec3(-0.5, 0.6, 0.7))), 0.0);
  // pitted surface where the seeds sat
  vec3 d = normalize(vP);
  vec2 sph = vec2(atan(d.z, d.x) * 9.0, acos(clamp(d.y, -1.0, 1.0)) * 9.0);
  vec2 cell = fract(sph) - 0.5;
  float pit = smoothstep(0.24, 0.12, length(cell)) * step(0.25, hash12(floor(sph)));
  vec3 col = mix(vec3(0.82, 0.74, 0.55), vec3(0.55, 0.45, 0.3), pit * 0.8);
  gl_FragColor = vec4(col * l, 1.0);
}
`,ne=`
varying vec3 vN;
varying vec3 vP;
void main() {
  vec3 n = normalize(vN);
  float l = 0.6 + 0.4 * abs(dot(n, normalize(vec3(-0.5, 0.6, 0.7))));
  vec3 col = mix(vec3(0.36, 0.45, 0.22), vec3(0.5, 0.58, 0.3), smoothstep(-0.4, -0.05, vP.y));
  gl_FragColor = vec4(col * l, 1.0);
}
`;function re(e){return 1+2.5*(e-1)**3+1.5*(e-1)**2}function ie({ctl:e}){let t=g(e=>e.size);k();let n=(0,j.useMemo)(()=>{let e=G(),t=K(),n=new y(new Float32Array(P),1),r=new y(new Float32Array(P),1);n.setUsage(b),r.setUsage(b),e.setAttribute(`aFade`,n),e.setAttribute(`aBlur`,r),t.setAttribute(`aFade`,n),t.setAttribute(`aBlur`,r);let i=W(),a=new h({vertexShader:J,fragmentShader:Y,uniforms:{uLight:{value:new w(-.5,.7,.6).normalize()}},transparent:!0}),o=new h({vertexShader:X,fragmentShader:Z,uniforms:{tPap:{value:i},uTint:{value:new w(.86,.87,.82)}},transparent:!0,depthWrite:!1,side:2}),s=new T(.026,.034,R,10,30,!0);return s.translate(0,R/2,0),{seedGeo:e,papGeo:t,fade:n,blur:r,papTex:i,seedMat:a,papMat:o,stemGeo:s,stemMat:new h({vertexShader:Q,fragmentShader:ee,uniforms:{uBend:{value:new S},uLen:{value:R},uLow:{value:new w(.36,.46,.24)},uHigh:{value:new w(.55,.6,.36)}}}),recGeo:new v(F,24,16),recMat:new h({vertexShader:$,fragmentShader:te}),bractGeo:q(),bractMat:new h({vertexShader:$,fragmentShader:ne,side:2})}},[]);(0,j.useEffect)(()=>()=>{for(let e of Object.values(n))`dispose`in e&&typeof e.dispose==`function`&&e.dispose()},[n]);let r=(0,j.useMemo)(()=>{let e=new Float32Array(N*3),t=[],n=new Float32Array(N),r=new Uint8Array(N),i=new Float32Array(N);for(let a=0;a<N;a++){let o=1-2*((a+.5)/(N/.95)),s=Math.sqrt(1-o*o),c=a*z;e[a*3]=Math.cos(c)*s,e[a*3+1]=o,e[a*3+2]=Math.sin(c)*s;let l=new w(e[a*3],e[a*3+1],e[a*3+2]);t.push(new p().setFromUnitVectors(U,l).multiply(new p().setFromAxisAngle(U,Math.random()*Math.PI*2))),n[a]=.18+.82*Math.random()**.8,r[a]=B,i[a]=1e9}return{n:e,q:t,thr:n,state:r,growT:i,fp:new Float32Array(N*3),fv:new Float32Array(N*3),fa:new Float32Array(N*3),fspin:new Float32Array(N),fspinR:new Float32Array(N),fk:new Float32Array(N),fage:new Float32Array(N),fon:new Uint8Array(N),flean:new Float32Array(N*2)}},[]),i=(0,j.useRef)(null),a=(0,j.useRef)(null),o=(0,j.useRef)(null),s=(0,j.useRef)(null),l=(0,j.useMemo)(()=>({time:0,bend:new S,bendV:new S,m:new c,m2:new c,pm:new c,zero:new c().makeScale(0,0,0),v:new w,v2:new w,w:new w,q:new p,q2:new p,s:new w,headPos:new w,headQ:new p,ray:new m,plane:new u(new w(0,0,1),0),ndc:new S,ptrP:new w(99,99,0),ptrDir:new w(1,0,0),ptrLevel:0,micLevel:0,nextPuff:3,nextGust:O?1e9:9,posterPuff:O,regrowAt:-1,regrowSeen:0,lastStats:0,camDist:7,base:new w}),[]),d=(e,t,n)=>{let i=-1,a=-1,s=-1;for(let e=0;e<N;e++){if(!r.fon[e]){i=e;break}r.fage[e]>s&&(s=r.fage[e],a=e)}i<0&&(i=a);let c=o.current.matrixWorld;l.v.set(r.n[e*3],r.n[e*3+1],r.n[e*3+2]).transformDirection(c),l.w.copy(l.v).multiplyScalar(F).add(l.headPos),r.fp[i*3]=l.w.x,r.fp[i*3+1]=l.w.y,r.fp[i*3+2]=l.w.z;let u=n*(.3+Math.random()*1),d=(Math.random()-.5)*.9,f=(Math.random()-.4)*.9,p=(Math.random()-.5)*1.4;r.fv[i*3]=(t.x+d)*u+l.v.x*.45,r.fv[i*3+1]=(t.y+f)*u+l.v.y*.45,r.fv[i*3+2]=(t.z+p)*u+l.v.z*.45,r.fa[i*3]=l.v.x,r.fa[i*3+1]=l.v.y,r.fa[i*3+2]=l.v.z,r.fspin[i]=Math.random()*6.28,r.fspinR[i]=(Math.random()<.5?-1:1)*(.8+Math.random()*2.2),r.fk[i]=.9+Math.random()*2;let m=Math.random()*Math.PI*2,h=.15+Math.random()*.4;r.flean[i*2]=Math.cos(m)*h,r.flean[i*2+1]=Math.sin(m)*h,r.fage[i]=0,r.fon[i]=1,r.state[e]=V,r.growT[e]=1e9};return x((c,u)=>{let f=Math.min(u,1/30);l.time+=f;let p=l.time,m=c.camera,{width:h,height:g}=t,_=h/g,v=performance.now(),y=h<760,b=7/Math.min(1,_*1.25);l.camDist=b,m.position.set(Math.sin(p*.07)*.25,.15+Math.sin(p*.05)*.08,b),m.lookAt(0,0,0);let x=O||y?0:.35,S=O?.15:y?.95:.35;l.base.set(x-.25,S-R,0);let w=e.gust.get()*e.gustS.current,T=e.gustDir.current,E=e.ptr.current,D=Math.hypot(E.vx,E.vy);if(v-E.t<90&&D>260&&(l.ray.setFromCamera(l.ndc.set(E.x,E.y),m),l.ray.ray.intersectPlane(l.plane,l.v))){let e=Math.min(1.5,(D-260)/1500);e>l.ptrLevel*.7&&(l.ptrP.copy(l.v),l.ptrDir.set(E.vx,-E.vy,-.15*D).normalize()),l.ptrLevel=Math.max(l.ptrLevel,e)}l.ptrLevel*=Math.exp(-f*3.2);let k=e.mic.current;if(k.an&&k.buf){k.an.getFloatTimeDomainData(k.buf);let t=0;for(let e=0;e<k.buf.length;e++)t+=k.buf[e]*k.buf[e];let n=Math.sqrt(t/k.buf.length);k.level+=(n-k.level)*(n>k.level?.5:.08),e.micBar.current&&(e.micBar.current.style.transform=`scaleX(${Math.min(1,k.level*6).toFixed(3)})`)}let A=k.an?C.clamp((k.level-.035)*9,0,1.6):0;l.micLevel=A,A>.05&&(e.lastUser.current=v);let j=(.5+Math.sin(p*.37)*.35+Math.sin(p*1.13)*.15)*.08+w*T.x*.9+A*.55+l.ptrLevel*l.ptrDir.x*.7*Math.exp(-l.ptrP.distanceToSquared(l.headPos)*.4),M=Math.sin(p*.29+1)*.05+w*T.z*.6-A*.35;l.bendV.x+=(-l.bend.x*9-l.bendV.x*2.2+j*9)*f,l.bendV.y+=(-l.bend.y*9-l.bendV.y*2.2+M*9)*f,l.bend.x+=l.bendV.x*f,l.bend.y+=l.bendV.y*f,n.stemMat.uniforms.uBend.value.copy(l.bend),s.current&&s.current.position.copy(l.base);let P=o.current,L=R;l.headPos.set(l.base.x+l.bend.x,l.base.y+L-Math.abs(l.bend.x)*.12,l.base.z+l.bend.y),P.position.copy(l.headPos),P.rotation.set(Math.atan(2*l.bend.y/L),0,-Math.atan(2*l.bend.x/L)),P.updateMatrixWorld(),l.headQ.setFromRotationMatrix(P.matrixWorld),e.regrow.current!==l.regrowSeen&&(l.regrowSeen=e.regrow.current,l.regrowAt=p);let z=0,W=0;for(let e=0;e<N;e++)r.state[e]===B?z++:r.state[e]===H&&W++;if(l.regrowAt<0&&z+W<N*.12&&(l.regrowAt=p+2.5),l.regrowAt>=0&&p>=l.regrowAt){l.regrowAt=-1;for(let e=0;e<N;e++)r.state[e]===V&&(r.state[e]=H,r.growT[e]=p+e/N*2.8+Math.random()*.12)}if(l.posterPuff&&p>.4){l.posterPuff=!1,l.v2.set(1,.6,.1).normalize();for(let e=0,t=7;e<14&&t<N;t+=17,e++)d(t,l.v2,.55)}let G=v-e.lastUser.current>6e3;if(p>l.nextPuff&&(l.nextPuff=p+2.5+Math.random()*3,z>N*.3&&!O)){let e=1+Math.floor(Math.random()*2.4);l.v2.set(1,.3,(Math.random()-.5)*.6).normalize();for(let t=0;t<e;t++){let e=-1,t=1e9;for(let n=0;n<24;n++){let n=Math.floor(Math.random()*N);if(r.state[n]!==B)continue;let i=r.thr[n]- -r.n[n*3]*.2;i<t&&(t=i,e=n)}e>=0&&d(e,l.v2,.6)}}G&&p>l.nextGust&&!k.an&&(l.nextGust=p+14+Math.random()*3,z>N*.12&&e.blow(.8+(1-z/N)*.7+Math.random()*.2)),G||(l.nextGust=Math.max(l.nextGust,p+8));let K=i.current,q=a.current,J=n.fade.array,Y=n.blur.array,X=Math.min(1,w+A*.6+l.ptrLevel*.5);for(let e=0;e<N;e++){let t=r.state[e];if(t===V||t===H&&p<r.growT[e]){K.setMatrixAt(e,l.zero),q.setMatrixAt(e,l.zero),J[e]=0;continue}let n=1,i=1;if(t===H){let t=(p-r.growT[e])/.9;n=t>=1?1:Math.max(.001,re(Math.min(1,t))),i=C.smoothstep(t,.35,1.25),t>=1.3&&(r.state[e]=B)}if(l.v.set(r.n[e*3],r.n[e*3+1],r.n[e*3+2]),l.w.copy(l.v).applyQuaternion(l.headQ),t===B){let t=0;if(w>.01&&(t+=w*(.65+.45*-l.w.dot(T))),A>.01&&(t+=A*(.65+.45*l.w.z)),l.ptrLevel>.02){l.v2.copy(l.v).multiplyScalar(I).applyQuaternion(l.headQ).add(l.headPos);let e=l.v2.distanceToSquared(l.ptrP);t+=l.ptrLevel*Math.exp(-e*2.2)*(.7+.5*-l.w.dot(l.ptrDir))*1.4}if(t>r.thr[e]&&Math.random()<(t-r.thr[e])*f*4+.006){let n=l.ptrLevel*Math.exp(-l.ptrP.distanceToSquared(l.headPos))>w+A?l.ptrDir:A>w?l.v2.set(.55,.35,-1).normalize():T;d(e,n,.7+t*.9),K.setMatrixAt(e,l.zero),q.setMatrixAt(e,l.zero),J[e]=0;continue}}l.q.copy(r.q[e]),X>.01&&(l.q2.setFromAxisAngle(l.v2.set(Math.sin(e*1.7),0,Math.cos(e*2.3)).normalize(),Math.sin(p*17+e)*.06*X),l.q.premultiply(l.q2)),l.s.setScalar(n),l.m.compose(l.v.multiplyScalar(F*.92),l.q,l.s),l.m.premultiply(P.matrixWorld),K.setMatrixAt(e,l.m);let a=.2+.8*i;l.pm.makeScale(a,.4+.6*i,a),l.pm.setPosition(0,I,0),l.m2.multiplyMatrices(l.m,l.pm),q.setMatrixAt(e,l.m2),J[e]=Math.min(1,n*1.4),Y[e]=0}let Z=.32+Math.sin(p*.21)*.1,Q=p;for(let e=0;e<N;e++){let t=N+e;if(!r.fon[e]){K.setMatrixAt(t,l.zero),q.setMatrixAt(t,l.zero),J[t]=0;continue}let n=e*3,i=r.fp[n],a=r.fp[n+1],o=r.fp[n+2],s=e*2.399,c=Math.sin(1.3*a+.7*Q+1.7+s)+.5*Math.sin(2.9*o-.5*Q+s*.7),u=Math.sin(1.1*o+.6*Q+.3+s)+.5*Math.sin(2.7*i+.8*Q-s),d=Math.sin(1.2*i-.5*Q+2.1+s)+.5*Math.sin(2.3*a+.4*Q+s*1.3),p=Z+c*.36+w*T.x*1.25+A*.8,m=.05+u*.36+w*T.y*1.25+A*.4,h=d*.3+w*T.z*1.25-A*.9;if(l.ptrLevel>.02){let e=i-l.ptrP.x,t=a-l.ptrP.y,n=Math.exp(-(e*e+t*t)*.9)*l.ptrLevel*3;p+=l.ptrDir.x*n,m+=l.ptrDir.y*n,h+=l.ptrDir.z*n}let g=r.fk[e];r.fv[n]+=(p-r.fv[n])*g*f,r.fv[n+1]+=((m-r.fv[n+1])*g-.55)*f,r.fv[n+2]+=(h-r.fv[n+2])*g*f,r.fp[n]+=r.fv[n]*f,r.fp[n+1]+=r.fv[n+1]*f,r.fp[n+2]+=r.fv[n+2]*f,r.fage[e]+=f,l.v.set((p-r.fv[n])*.6+r.flean[e*2]+Math.sin(Q*(1.6+e%7*.21)+e)*.3,1,(h-r.fv[n+2])*.6+r.flean[e*2+1]+Math.cos(Q*(1.3+e%5*.27)+e)*.3).normalize(),l.w.set(r.fa[n],r.fa[n+1],r.fa[n+2]),l.w.lerp(l.v,1-Math.exp(-f*.8)).normalize(),r.fa[n]=l.w.x,r.fa[n+1]=l.w.y,r.fa[n+2]=l.w.z,r.fspin[e]+=r.fspinR[e]*f,l.q.setFromUnitVectors(U,l.w),l.q2.setFromAxisAngle(U,r.fspin[e]),l.q.multiply(l.q2),l.v.set(r.fp[n],r.fp[n+1],r.fp[n+2]);let v=Math.tan(C.degToRad(17.5))*(b-l.v.z),y=v*_;if(Math.abs(l.v.x)>y+.8||l.v.y>v+.8||l.v.y<-v-.8||l.v.z>b-.6||r.fage[e]>22){r.fon[e]=0,K.setMatrixAt(t,l.zero),q.setMatrixAt(t,l.zero),J[t]=0;continue}l.s.setScalar(1),l.m.compose(l.v,l.q,l.s),K.setMatrixAt(t,l.m);let x=1+Math.sin(Q*3+e)*.04,S=Math.min(1,r.fage[e]*1.5);l.pm.makeScale(x,1+S*1.6,x),l.pm.setPosition(0,I,0),l.m2.multiplyMatrices(l.m,l.pm),q.setMatrixAt(t,l.m2),J[t]=Math.min(1,(22-r.fage[e])/2);let E=Math.abs(l.v.z);Y[t]=C.clamp((E-.4)*.45,0,1)}if(K.instanceMatrix.needsUpdate=!0,q.instanceMatrix.needsUpdate=!0,n.fade.needsUpdate=!0,n.blur.needsUpdate=!0,v-l.lastStats>200){l.lastStats=v;let t=0;for(let e=0;e<N;e++)t+=r.fon[e];let n=W>0?2:+(z<N*.96||t>6);e.onStats(z,n)}}),(0,M.jsxs)(M.Fragment,{children:[(0,M.jsx)(`mesh`,{ref:s,geometry:n.stemGeo,material:n.stemMat,frustumCulled:!1}),(0,M.jsxs)(`group`,{ref:o,children:[(0,M.jsx)(`mesh`,{geometry:n.recGeo,material:n.recMat}),(0,M.jsx)(`mesh`,{geometry:n.bractGeo,material:n.bractMat})]}),(0,M.jsx)(`instancedMesh`,{ref:i,args:[n.seedGeo,n.seedMat,P],frustumCulled:!1}),(0,M.jsx)(`instancedMesh`,{ref:a,args:[n.papGeo,n.papMat,P],frustumCulled:!1,renderOrder:2})]})}function ae(){let e=(0,j.useMemo)(()=>{let e=17,t=()=>(e=e*1664525+1013904223>>>0)/4294967296,n=``;for(let e=-20;e<1620;e+=6+t()*14){let r=60+t()*170,i=(t()-.5)*60,a=3+t()*6;n+=`M${(e-a).toFixed(1)} 300 Q${(e+i*.3).toFixed(1)} ${(300-r*.6).toFixed(1)} ${(e+i).toFixed(1)} ${(300-r).toFixed(1)} Q${(e+i*.3+a).toFixed(1)} ${(300-r*.6).toFixed(1)} ${(e+a).toFixed(1)} 300 Z `}return n},[]);return(0,M.jsxs)(M.Fragment,{children:[(0,M.jsx)(`div`,{className:`dl-bokeh`,"aria-hidden":!0}),(0,M.jsx)(`svg`,{className:`dl-grass`,viewBox:`0 0 1600 300`,preserveAspectRatio:`xMidYMax slice`,"aria-hidden":!0,children:(0,M.jsx)(`path`,{d:e,fill:`#7d8f5a`,opacity:.5})})]})}var oe=[{zh:`绒球`,en:`Seed head`,aside:`${N} seeds · 137.5°`},{zh:`随风飘散`,en:`Dispersal`,aside:`drag ≫ gravity`},{zh:`重新长出`,en:`Regrowth`,aside:`spiral, crown first`}];function se(){let e=i(0),t=(0,j.useRef)(new w(1,.3,-.3).normalize()),n=(0,j.useRef)(1),s=(0,j.useRef)({x:0,y:0,vx:0,vy:0,t:-1e9}),c=(0,j.useRef)(0),l=(0,j.useRef)({an:null,buf:null,level:0}),u=(0,j.useRef)(null),d=(0,j.useRef)(-1e9),[f,p]=(0,j.useState)({attached:N,phase:0}),[m,h]=(0,j.useState)(`off`),[g,_]=(0,j.useState)(null),v=(0,j.useRef)(null),y=(0,j.useCallback)(i=>{t.current.set(1,.45+Math.random()*.2,(Math.random()-.5)*.8).normalize(),n.current=i,r(e,[0,1,.7,0],{duration:2.2,times:[0,.18,.5,1],ease:`easeInOut`})},[e]),b=(0,j.useCallback)((e,t)=>{p(n=>n.attached===e&&n.phase===t?n:{attached:e,phase:t})},[]),x=(0,j.useMemo)(()=>({gust:e,gustDir:t,gustS:n,ptr:s,regrow:c,mic:l,micBar:u,blow:y,lastUser:d,onStats:b}),[e,y,b]),S=(0,j.useCallback)(()=>{v.current?.s.getTracks().forEach(e=>e.stop()),v.current?.ctx.close(),v.current=null,l.current.an=null,l.current.level=0},[]);(0,j.useEffect)(()=>S,[S]),(0,j.useEffect)(()=>{if(!g)return;let e=setTimeout(()=>_(null),3200);return()=>clearTimeout(e)},[g]);let C=async()=>{if(m===`on`)S(),h(`off`);else if(!navigator.mediaDevices?.getUserMedia)h(`denied`),_(`这个浏览器不支持麦克风 · 点「吹一口」试试`);else{h(`asking`);try{let e=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:!1,noiseSuppression:!1,autoGainControl:!1}}),t=new AudioContext,n=t.createMediaStreamSource(e),r=t.createAnalyser();r.fftSize=1024,n.connect(r),v.current={s:e,ctx:t},l.current.an=r,l.current.buf=new Float32Array(r.fftSize),h(`on`),_(`对着麦克风吹气 · 越用力种子飞得越多`)}catch{h(`denied`),_(`没有拿到麦克风权限 · 点「吹一口」也一样`)}}},T=e=>!!e.target.closest?.(`.dock`),D=oe[f.phase];return(0,M.jsxs)(`div`,{className:`stage dl-stage`,style:{touchAction:`none`},onPointerMove:e=>{if(T(e))return;let t=e.currentTarget.getBoundingClientRect(),n=(e.clientX-t.left)/t.width*2-1,r=-((e.clientY-t.top)/t.height)*2+1,i=s.current,a=performance.now(),o=Math.max(8,a-i.t)/1e3;a-i.t<150?(i.vx=i.vx*.4+(n-i.x)*t.width/2/o*.6,i.vy=i.vy*.4+-(r-i.y)*t.height/2/o*.6):(i.vx=0,i.vy=0),i.x=n,i.y=r,i.t=a,d.current=a},children:[(0,M.jsx)(`style`,{children:`
        .dl-stage { background:
          radial-gradient(46% 52% at 60% 40%, #aebd98 0%, rgba(174,189,152,0.55) 45%, rgba(174,189,152,0) 100%),
          radial-gradient(120% 90% at 50% 110%, #c3cdb1 0%, #dbe2d1 45%, #eef1ea 80%); }
        .dl-bokeh { position: absolute; inset: 0; pointer-events: none;
          background:
            radial-gradient(circle at 12% 30%, rgba(255,255,255,0.55) 0, rgba(255,255,255,0) 7%),
            radial-gradient(circle at 86% 22%, rgba(255,255,255,0.45) 0, rgba(255,255,255,0) 9%),
            radial-gradient(circle at 78% 70%, rgba(240,214,92,0.55) 0, rgba(240,214,92,0) 4.5%),
            radial-gradient(circle at 22% 78%, rgba(240,214,92,0.45) 0, rgba(240,214,92,0) 3.5%),
            radial-gradient(circle at 93% 84%, rgba(240,214,92,0.4) 0, rgba(240,214,92,0) 3%),
            radial-gradient(circle at 40% 18%, rgba(255,255,255,0.35) 0, rgba(255,255,255,0) 6%);
          filter: blur(6px); }
        .dl-grass { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: min(260px, 30vh); pointer-events: none; filter: blur(5px); }
        .dl-stage canvas { position: relative; }
        .dl-stage .big-label h1 { color: #2d3524; }
        .dl-stage .big-label-meta, .dl-stage .big-label p { color: #56604a; }
        .dl-mic { display: inline-flex; align-items: center; gap: 8px; }
        .dl-meter { position: relative; display: inline-block; width: 26px; height: 4px; border-radius: 2px; overflow: hidden;
          background: color-mix(in srgb, var(--fg) 14%, transparent); }
        .dl-meter b { position: absolute; inset: 0; background: #7d8f5a; transform-origin: left center; transform: scaleX(0); }
        .dl-mic i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .35; }
        .dl-mic[data-state='on'] i { opacity: 1; background: #d2553a; }
        .dl-toast { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); padding: 9px 16px; border-radius: 999px;
          font: 500 13px/1 var(--sans); color: var(--fg); background: var(--glass); box-shadow: inset 0 0 0 1px var(--glass-line);
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); white-space: nowrap; pointer-events: none; }
        @media (max-width: 760px) {
          .dl-stage .dock .seg { padding: 0 11px; }
          .dl-meter { width: 18px; }
        }
      `}),(0,M.jsx)(ae,{}),(0,M.jsx)(E,{dpr:[1,2],camera:{position:[0,.15,7],fov:35,near:.1,far:60},gl:{antialias:!0,alpha:!0},children:(0,M.jsx)(ie,{ctl:x})}),(0,M.jsxs)(`div`,{className:`overlay`,children:[(0,M.jsx)(A,{id:String(f.phase),meta:`${f.attached} / ${N} 颗种子还在`,title:D.zh,sub:D.en,aside:D.aside}),(0,M.jsx)(o,{children:g&&(0,M.jsx)(a.p,{className:`dl-toast`,initial:{opacity:0,y:8,x:`-50%`},animate:{opacity:1,y:0,x:`-50%`},exit:{opacity:0,y:4,x:`-50%`},transition:{duration:.3,ease:[.23,1,.32,1]},children:g},g)}),(0,M.jsxs)(`div`,{className:`dock`,children:[(0,M.jsx)(`button`,{className:`seg`,onClick:()=>{d.current=performance.now(),y(1.15)},children:(0,M.jsx)(`span`,{children:`吹一口`})}),(0,M.jsxs)(`button`,{className:`seg dl-mic`,"data-state":m,"aria-pressed":m===`on`,onClick:C,children:[m===`on`&&(0,M.jsx)(`span`,{className:`seg-bg`}),(0,M.jsxs)(`span`,{className:`dl-mic`,children:[(0,M.jsx)(`i`,{}),m===`asking`?`请求中…`:m===`denied`?`麦克风不可用`:`麦克风`,m===`on`&&(0,M.jsx)(`span`,{className:`dl-meter`,children:(0,M.jsx)(`b`,{ref:e=>void(u.current=e)})})]})]}),(0,M.jsx)(`span`,{className:`dock-sep`}),(0,M.jsx)(`button`,{className:`seg`,onClick:()=>{d.current=performance.now(),c.current++},children:(0,M.jsx)(`span`,{children:`重新长出`})})]}),(0,M.jsxs)(`p`,{className:`hint`,children:[`划过绒球扬起一阵风`,(0,M.jsx)(`br`,{}),`静置时微风会带走几颗`]})]})]})}export{se as default};