import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a}from"./index-gQ65n0JU.js";import{$ as o,$t as s,E as c,Ht as l,It as u,O as d,P as f,Qt as p,Rt as m,Sn as h,T as g,Tt as _,Wt as v,Xt as y,Yt as b,bn as x,h as S,it as C,ot as w,pt as T,st as E,u as D,vn as O,xt as k,yn as A}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as ee}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as j}from"./iso-CLB38p39.js";import{t as M}from"./Seg-CH5KfWEm.js";import{t as N}from"./GPUComputationRenderer-BkSo-k_S.js";var P=e(t(),1),F={min:[-22,-6,-18],dim:[44,26,32],cell:1,tilesX:8},I=[F.dim[0]*F.tilesX,F.dim[1]*Math.ceil(F.dim[2]/F.tilesX)],L=`
uniform sampler2D tGrid;
uniform vec3 uMin, uDim;
uniform float uCell, uTilesX;
uniform vec2 uGridTex;
`,R=`
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uCount;
${L}
varying vec4 vVal;
void main() {
  vec2 uv = position.xy;
  vec3 p = texture2D(tPos, uv).xyz;
  vec3 c = floor((p - uMin) / uCell);
  if (position.z >= uCount || any(lessThan(c, vec3(0.0))) || any(greaterThanEqual(c, uDim))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vVal = vec4(0.0);
    return;
  }
  vec2 tile = vec2(mod(c.z, uTilesX), floor(c.z / uTilesX));
  vec2 px = tile * uDim.xy + c.xy + 0.5;
  gl_Position = vec4(px / uGridTex * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vVal = vec4(texture2D(tVel, uv).xyz, 1.0);
}
`,z=`
varying vec4 vVal;
void main() { gl_FragColor = vVal; }
`,B=`
${L}
uniform float uDt, uTime;
uniform float uAli, uCoh, uSep, uSpeed, uNoise, uTargetK, uDensRef;
uniform vec3 uTarget, uBMin, uBMax;
uniform vec4 uPred;   // xyz, strength
uniform float uPredR;

vec4 gridAt(vec3 c) {
  vec3 g = clamp(c - 0.5, vec3(0.0), uDim - 1.0);
  float z0 = floor(g.z);
  float z1 = min(z0 + 1.0, uDim.z - 1.0);
  vec2 inTile = g.xy + 0.5;
  vec2 t0 = vec2(mod(z0, uTilesX), floor(z0 / uTilesX)) * uDim.xy + inTile;
  vec2 t1 = vec2(mod(z1, uTilesX), floor(z1 / uTilesX)) * uDim.xy + inTile;
  return mix(texture2D(tGrid, t0 / uGridTex), texture2D(tGrid, t1 / uGridTex), g.z - z0);
}
float dens(vec3 c) { return gridAt(c).w; }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// low-frequency shared wind: neighbours get nearly the same push, so the flock banks together
vec3 wander(vec3 p, float t) {
  return vec3(
    sin(p.y * 0.21 + t * 0.53) + sin(p.z * 0.17 - t * 0.37),
    0.9 * sin(p.z * 0.19 + t * 0.41) + 0.7 * sin(p.x * 0.13 + t * 0.29),
    sin(p.x * 0.23 - t * 0.47) + sin(p.y * 0.15 + t * 0.31)
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  vec3 p = P.xyz;
  vec3 v = V.xyz;
  float rnd = hash12(uv * 371.3);
  vec3 c = (p - uMin) / uCell;
  vec4 g = gridAt(c);
  float n = g.w;
  vec3 acc = vec3(0.0);

  // alignment: steer toward the local mean velocity
  if (n > 0.6) acc += (g.xyz / n - v) * uAli;

  // separation: fine density gradient, push downhill when crowded
  vec3 gf = vec3(dens(c + vec3(1.0, 0.0, 0.0)) - dens(c - vec3(1.0, 0.0, 0.0)),
                 dens(c + vec3(0.0, 1.0, 0.0)) - dens(c - vec3(0.0, 1.0, 0.0)),
                 dens(c + vec3(0.0, 0.0, 1.0)) - dens(c - vec3(0.0, 0.0, 1.0)));
  acc -= gf * vec3(1.1, 0.75, 1.1) / (n + 2.0) * uSep * 9.0 * smoothstep(0.3, 1.4, n / uDensRef);

  // cohesion: coarse density gradient (±3 cells), climb toward the body of the flock
  vec3 gc = vec3(dens(c + vec3(3.0, 0.0, 0.0)) - dens(c - vec3(3.0, 0.0, 0.0)),
                 dens(c + vec3(0.0, 3.0, 0.0)) - dens(c - vec3(0.0, 3.0, 0.0)),
                 dens(c + vec3(0.0, 0.0, 3.0)) - dens(c - vec3(0.0, 0.0, 3.0)));
  float nc = dens(c + vec3(3.0, 0.0, 0.0)) + dens(c - vec3(3.0, 0.0, 0.0)) + dens(c + vec3(0.0, 3.0, 0.0))
           + dens(c - vec3(0.0, 3.0, 0.0)) + dens(c + vec3(0.0, 0.0, 3.0)) + dens(c - vec3(0.0, 0.0, 3.0));
  // anisotropic: firm vertically, soft horizontally → the flock spreads into a banking sheet
  acc += gc * vec3(0.85, 1.3, 0.85) / (nc / 6.0 + n + 2.0) * uCoh * 4.0 * (1.0 - smoothstep(0.8, 1.6, n / uDensRef));

  // the roost path: weak always, firm when a bird strays
  vec3 dT = uTarget - p;
  float lT = length(dT) + 1e-3;
  acc += dT / lT * uTargetK * (0.25 + smoothstep(4.0, 13.0, lT) * 1.6);

  acc += wander(p * 2.1, uTime) * uNoise;
  // starlings hold altitude: damp climb/dive so the flock spreads into sheets that bank, not a ball
  acc.y -= v.y * 0.5;

  // soft bounds + keep clear of the ground
  acc -= (p - clamp(p, uBMin, uBMax)) * 2.0;
  acc.y += smoothstep(uBMin.y + 2.5, uBMin.y - 0.5, p.y) * 8.0;

  // predator: flee outward and sideways (the side the bird is already heading), panic boosts speed
  float panic = V.w * exp(-uDt * 0.9);
  if (uPred.w > 0.001) {
    vec3 dp = p - uPred.xyz;
    float r = length(dp) + 1e-3;
    float threat = uPred.w * (1.0 - smoothstep(0.0, uPredR, r));
    if (threat > 0.0) {
      vec3 away = dp / r;
      vec3 side = cross(away, vec3(0.0, 1.0, 0.0));
      side /= length(side) + 1e-4;
      side *= dot(v, side) >= 0.0 ? 1.0 : -1.0;
      acc += (away * 26.0 + side * 12.0 + vec3(0.0, (rnd - 0.4) * 10.0, 0.0)) * threat;
      panic = max(panic, threat);
    }
  }
  // panic spreads through the local field: crowded panicking neighbours carry it as speed
  float cruise = uSpeed * (0.9 + rnd * 0.2) * (1.0 + panic * 0.9);
  float sp = length(v) + 1e-4;
  acc += v / sp * (cruise - sp) * 1.8;

  v += acc * uDt;
  sp = length(v) + 1e-4;
  float lo = uSpeed * 0.5;
  float hi = uSpeed * 2.6;
  if (sp < lo) v *= lo / sp;
  if (sp > hi) v *= hi / sp;
  gl_FragColor = vec4(v, panic);
}
`,V=`
uniform float uDt;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 P = texture2D(texturePosition, uv);
  vec4 V = texture2D(textureVelocity, uv);
  float freq = 11.0 + hash12(uv * 91.7) * 5.0 + V.w * 14.0;
  gl_FragColor = vec4(P.xyz + V.xyz * uDt, mod(P.w + uDt * freq, 6.2831853));
}
`,H=`
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize, uCount, uReveal;
attribute vec3 aRef;   // uv, index
attribute float aWing; // 0 body, 1 wing tip
varying float vFog;
void main() {
  vec4 P = texture2D(tPos, aRef.xy);
  vec4 V = texture2D(tVel, aRef.xy);
  float reveal = clamp((uCount - aRef.z) / uReveal, 0.0, 1.0);
  vec3 f = normalize(V.xyz + vec3(1e-4, 0.0, 0.0));
  vec3 r = cross(f, vec3(0.0, 1.0, 0.0));
  r /= length(r) + 1e-4;
  vec3 u = cross(r, f);
  vec3 lp = position;
  float flap = sin(P.w);
  lp.y += aWing * flap * 0.34;
  lp.x *= 1.0 - aWing * 0.22 * (1.0 - flap * flap);
  vec3 wp = P.xyz + (r * lp.x + u * lp.y + f * lp.z) * uSize * reveal;
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vFog = smoothstep(30.0, 58.0, -mv.z);
}
`,U=`
uniform vec3 uInk, uHaze;
uniform float uAlpha;
varying float vFog;
void main() {
  gl_FragColor = vec4(mix(uInk, uHaze, vFog * 0.75), uAlpha);
}
`,W=n(),G=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,K=128,q=G?64:128,J=K*q,Y=G?[2048,4096,8192]:[4096,8192,16384],X=[{key:`loose`,label:`松散`,u:{ali:1.3,coh:1.4,sep:1.5,speed:4.4,noise:2,targetK:1.7,densRef:15},dive:11},{key:`tight`,label:`紧密`,u:{ali:3,coh:2.6,sep:1,speed:5.2,noise:2.2,targetK:1.8,densRef:28},dive:10},{key:`startle`,label:`惊散`,u:{ali:2.4,coh:1.7,sep:1.8,speed:5.8,noise:2.4,targetK:2,densRef:16},dive:4.2}],Z=Object.keys(X[0].u),Q=new f(`#2b2630`),te=new f(`#b8aeb6`);function $(e,t,n=0){return t.set(n+Math.sin(e*.23)*4.2+Math.sin(e*.53)*1.4,7.6+Math.sin(e*.37+1.1)*1.8,Math.sin(e*.29+.6)*3.5-2)}function ne(){let e=[[0,.62],[.08,.52],[.13,.3],[.5,.26],[.9,.16],[1.14,.04],[1.2,-.03],[1.06,-.06],[1.1,-.12],[.96,-.12],[.98,-.18],[.78,-.16],[.5,-.16],[.22,-.22],[.13,-.36],[.26,-.66],[0,-.7]],t=new p;t.moveTo(e[0][0],e[0][1]);for(let n=1;n<e.length;n++)t.lineTo(e[n][0],e[n][1]);for(let n=e.length-2;n>0;n--)t.lineTo(-e[n][0],e[n][1]);return t.closePath(),new s(t)}function re({ctl:e}){let t=S(e=>e.gl),n=(0,P.useMemo)(()=>{let e=new N(K,q,t);t.extensions.has(`EXT_color_buffer_float`)||e.setDataType(C);let n=e.createTexture(),r=e.createTexture(),i=n.image.data,a=r.image.data,o=$(0,new A);for(let e=0;e<J;e++){let t=Math.random()*Math.PI*2,n=Math.sqrt(Math.random());i[e*4]=o.x+Math.cos(t)*n*7,i[e*4+1]=o.y+(Math.random()-.5)*2.4,i[e*4+2]=o.z+Math.sin(t)*n*4,i[e*4+3]=Math.random()*Math.PI*2,a[e*4]=3.5+Math.random(),a[e*4+1]=(Math.random()-.5)*.6,a[e*4+2]=1+(Math.random()-.5)*1.5}let s=e.addVariable(`textureVelocity`,B,r),u=e.addVariable(`texturePosition`,V,n);e.setVariableDependencies(s,[s,u]),e.setVariableDependencies(u,[s,u]);let f=new h(I[0],I[1],{type:C,format:l,minFilter:T,magFilter:T,depthBuffer:!1,stencilBuffer:!1}),p={tGrid:{value:f.texture},uMin:{value:new A(...F.min)},uDim:{value:new A(...F.dim)},uCell:{value:F.cell},uTilesX:{value:F.tilesX},uGridTex:{value:new O(I[0],I[1])}};Object.assign(s.material.uniforms,p,{uDt:{value:0},uTime:{value:0},uAli:{value:1},uCoh:{value:1},uSep:{value:1},uSpeed:{value:4},uNoise:{value:1},uTargetK:{value:1},uDensRef:{value:6},uTarget:{value:new A},uBMin:{value:new A(-11,1.5,-10)},uBMax:{value:new A(11,15,6)},uPred:{value:new x},uPredR:{value:5}}),Object.assign(u.material.uniforms,{uDt:{value:0}});let _=e.init();_&&console.error(_);let v=new Float32Array(J*3);for(let e=0;e<J;e++)v[e*3]=(e%K+.5)/K,v[e*3+1]=(Math.floor(e/K)+.5)/q,v[e*3+2]=e;let S=new c;S.setAttribute(`position`,new g(v,3));let w=new y({vertexShader:R,fragmentShader:z,uniforms:{...p,tPos:{value:null},tVel:{value:null},uCount:{value:J}},blending:5,blendEquation:100,blendSrc:201,blendDst:201,blendSrcAlpha:201,blendDstAlpha:201,depthTest:!1,depthWrite:!1}),E=new m(S,w);E.frustumCulled=!1;let D=new b;return D.add(E),{gpu:e,velVar:s,posVar:u,grid:f,splatGeo:S,splatMat:w,splatScene:D,splatCam:new d,ref:v}},[t]),r=(0,P.useMemo)(()=>{let e=[[0,0,.6],[-.07,0,-.45],[.07,0,-.45],[0,0,.14],[0,0,-.16],[-.8,0,-.22],[0,0,.14],[.8,0,-.22],[0,0,-.16]],t=[0,0,0,0,0,1,0,1,0],r=new E;return r.setAttribute(`position`,new o(e.flat(),3)),r.setAttribute(`aWing`,new o(t,1)),r.setAttribute(`aRef`,new w(n.ref,3)),r.instanceCount=J,{g:r,m:new y({vertexShader:H,fragmentShader:U,uniforms:{tPos:{value:null},tVel:{value:null},uSize:{value:G?.22:.17},uCount:{value:J},uReveal:{value:J*.06},uInk:{value:Q},uHaze:{value:te},uAlpha:{value:.9}},transparent:!0,depthWrite:!1,side:2})}},[n]),i=(0,P.useMemo)(()=>({g:ne(),m:new _({color:`#221d26`,transparent:!0,opacity:0,depthWrite:!1,side:2})}),[]),a=(0,P.useRef)(null);(0,P.useEffect)(()=>()=>{n.gpu.dispose(),n.grid.dispose(),n.splatGeo.dispose(),n.splatMat.dispose(),r.g.dispose(),r.m.dispose(),i.g.dispose(),i.m.dispose()},[n,r,i]);let s=(0,P.useMemo)(()=>({time:0,target:new A,pred:new A(0,30,0),predGoal:new A,predPrev:new A,strength:0,heading:0,ray:new v,plane:new u(new A(0,0,1),0),hit:new A,a:new A,b:new A,sp:new A,sp2:new A,clear:new f,nextDive:3.5,diveT:-1,lastDiveReq:0,acc:0,n:0,t0:0}),[]);return D((o,c)=>{let l=Math.min(c,1/30);s.time+=l;let u=s.time,d=o.camera,{width:f,height:p}=o.size;d.fov=40;let m=f/p,h=40/Math.min(1,m*.95);d.position.set(Math.sin(u*.045)*3,2+Math.sin(u*.06)*.6,h),d.lookAt(0,7,0);let g=f<760,_=j||g?0:.17,v=j?0:g?.17:0;_||v?d.setViewOffset(f,p,-_*f,v*p,f,p):d.clearViewOffset(),d.updateProjectionMatrix();let y=_?.6:0;$(u,s.target,y);let b=performance.now(),x=e.pred.current&&e.inside.current&&b-e.lastMove.current<2500;if(e.dive.current!==s.lastDiveReq&&(s.lastDiveReq=e.dive.current,s.nextDive=u),s.diveT<0&&e.pred.current&&!x&&u>=s.nextDive){let e=Math.random()*Math.PI*2;s.a.set(Math.cos(e)*15,Math.sin(e)*6+2,3).add(s.target),s.b.set(-Math.cos(e)*15,-Math.sin(e)*6-2,-2).add(s.target),s.diveT=0}let S=x;if(x)s.diveT=-1,s.ray.setFromCamera(o.pointer,d),s.plane.constant=-s.target.z,s.ray.ray.intersectPlane(s.plane,s.hit)&&s.predGoal.copy(s.hit);else if(s.diveT>=0){s.diveT+=l/2.6;let t=s.diveT,n=t*t*(3-2*t);s.predGoal.lerpVectors(s.a,s.b,n),s.predGoal.y-=Math.sin(t*Math.PI)*2.5,S=t<1,t>=1&&(s.diveT=-1,s.nextDive=u+e.diveEvery.current*(.8+Math.random()*.4))}else e.pred.current||(s.nextDive=Math.max(s.nextDive,u+2));s.predPrev.copy(s.pred),s.strength<.02&&S?s.pred.copy(s.predGoal):s.pred.lerp(s.predGoal,1-Math.exp(-l*(x?9:14))),s.strength=k.damp(s.strength,+!!S,S?5:2.5,l);let C=n.velVar.material.uniforms;C.uDt.value=l,C.uTime.value=u,C.uAli.value=e.b.ali.get(),C.uCoh.value=e.b.coh.get(),C.uSep.value=e.b.sep.get(),C.uSpeed.value=e.b.speed.get(),C.uNoise.value=e.b.noise.get(),C.uTargetK.value=e.b.targetK.get(),C.uDensRef.value=e.b.densRef.get(),C.uTarget.value.copy(s.target),C.uBMin.value.set(y-8,2.5,-9),C.uBMax.value.set(y+7.5,13,5),C.uPred.value.set(s.pred.x,s.pred.y,s.pred.z,s.strength),n.posVar.material.uniforms.uDt.value=l;let w=e.count.get(),T=n.gpu.getCurrentRenderTarget(n.posVar).texture,E=n.gpu.getCurrentRenderTarget(n.velVar).texture;n.splatMat.uniforms.tPos.value=T,n.splatMat.uniforms.tVel.value=E,n.splatMat.uniforms.uCount.value=w;let D=t.getRenderTarget();t.getClearColor(s.clear);let O=t.getClearAlpha();t.setRenderTarget(n.grid),t.setClearColor(0,0),t.clear(!0,!1,!1),t.render(n.splatScene,n.splatCam),t.setRenderTarget(D),t.setClearColor(s.clear,O),n.gpu.compute(),r.m.uniforms.tPos.value=n.gpu.getCurrentRenderTarget(n.posVar).texture,r.m.uniforms.tVel.value=n.gpu.getCurrentRenderTarget(n.velVar).texture,r.m.uniforms.uCount.value=w;let A=a.current;if(A){A.position.copy(s.pred),s.sp.copy(s.pred).project(d),s.sp2.copy(s.predPrev).project(d);let e=(s.sp.x-s.sp2.x)*m,t=s.sp.y-s.sp2.y;if(e*e+t*t>1e-8){let n=Math.atan2(t,e)-Math.PI/2-s.heading;n=Math.atan2(Math.sin(n),Math.cos(n)),s.heading+=n*(1-Math.exp(-l*6))}A.quaternion.copy(d.quaternion),A.rotateZ(s.heading);let n=Math.sin(u*7);A.scale.set(.95*(1-.18*Math.max(0,n)),.95,.95),i.m.opacity=k.damp(i.m.opacity,S?.92:0,6,l),A.visible=i.m.opacity>.01}s.acc+=c,s.n++,b-s.t0>500&&e.stats.current&&(e.stats.current.textContent=`${Math.round(w).toLocaleString()} 只 · ${Math.round(s.n/Math.max(s.acc,.001))} fps`,s.acc=0,s.n=0,s.t0=b)}),(0,W.jsxs)(W.Fragment,{children:[(0,W.jsx)(`mesh`,{geometry:r.g,material:r.m,frustumCulled:!1}),(0,W.jsx)(`mesh`,{ref:a,geometry:i.g,material:i.m,renderOrder:2,visible:!1})]})}function ie(e){let t=e>>>0;return()=>(t=t*1664525+1013904223>>>0,t/4294967296)}function ae(){return(0,P.useMemo)(()=>{let e=1600,t=ie(7),n=`M0 220 L0 150`;for(let t=0;t<=e;t+=6){let e=150-Math.sin(t*.004)*10-Math.sin(t*.011+1)*6;n+=` L${t} ${e.toFixed(1)}`}n+=` L${e} 220 Z`;let r=``;for(let e=-10;e<1610;e+=5+t()*9){let n=150-Math.sin(e*.004)*10-Math.sin(e*.011+1)*6,i=.5+.5*Math.sin(e*.0065+.8)*Math.sin(e*.0021+2),a=5+t()*9*(.4+i),o=n-a*(.5+t()*.6)*(.5+i);if(r+=`M${(e-a).toFixed(1)} ${(n+2).toFixed(1)} L${(e-a).toFixed(1)} ${o.toFixed(1)} a${a.toFixed(1)} ${(a*1.05).toFixed(1)} 0 0 1 ${(a*2).toFixed(1)} 0 L${(e+a).toFixed(1)} ${(n+2).toFixed(1)} Z `,t()<.07){let i=34+t()*26,a=4+t()*3;r+=`M${(e-a).toFixed(1)} ${n.toFixed(1)} Q${(e-a*1.2).toFixed(1)} ${(n-i*.6).toFixed(1)} ${e.toFixed(1)} ${(n-i).toFixed(1)} Q${(e+a*1.2).toFixed(1)} ${(n-i*.6).toFixed(1)} ${(e+a).toFixed(1)} ${n.toFixed(1)} Z `}}let i=`M0 220 L0 196`;for(let t=0;t<=e;t+=8)i+=` L${t} ${(196-Math.sin(t*.006)*4).toFixed(1)}`;i+=` L${e} 220 Z `;for(let n=0;n<e;n+=2+t()*7){let e=198-Math.sin(n*.006)*4,r=14+t()*46*(.6+.4*Math.sin(n*.003+2)),a=(t()-.35)*14,o=1+t()*1.4;if(i+=`M${(n-o).toFixed(1)} ${e.toFixed(1)} Q${(n+a*.3).toFixed(1)} ${(e-r*.6).toFixed(1)} ${(n+a).toFixed(1)} ${(e-r).toFixed(1)} Q${(n+a*.3+o).toFixed(1)} ${(e-r*.6).toFixed(1)} ${(n+o).toFixed(1)} ${e.toFixed(1)} Z `,t()<.12){let t=n+a,o=e-r;i+=`M${(t-1.6).toFixed(1)} ${(o+9).toFixed(1)} q1.6 -12 3.2 0 q-1.6 4 -3.2 0 Z `}}return{W:e,H:220,far:n,trees:r,near:i}},[])}function oe(){let[e,t]=(0,P.useState)(2),[n,o]=(0,P.useState)(1),[s,c]=(0,P.useState)(!0),l=(0,P.useRef)(!0),u=(0,P.useRef)(0),d=(0,P.useRef)(X[1].dive),f=(0,P.useRef)(-1e9),p=(0,P.useRef)(!1),m=(0,P.useRef)(null),h={ali:i(X[1].u.ali),coh:i(X[1].u.coh),sep:i(X[1].u.sep),speed:i(X[1].u.speed),noise:i(X[1].u.noise),targetK:i(X[1].u.targetK),densRef:i(X[1].u.densRef)},g=i(Y[2]),_=(0,P.useRef)(h).current,v=(0,P.useMemo)(()=>({b:_,count:g,pred:l,dive:u,diveEvery:d,lastMove:f,inside:p,stats:m}),[_,g]);(0,P.useEffect)(()=>{let e=X[n].u;d.current=X[n].dive;let t=Z.map(t=>r(_[t],e[t],{duration:1.6,ease:[.45,0,.2,1]}));return X[n].key===`startle`&&l.current&&u.current++,()=>t.forEach(e=>e.stop())},[n,_]),(0,P.useEffect)(()=>{let t=r(g,Y[e],{duration:1.4,ease:[.23,1,.32,1]});return()=>t.stop()},[e,g]),(0,P.useEffect)(()=>{l.current=s},[s]);let y=ae();return(0,W.jsxs)(`div`,{className:`stage mur-stage`,style:{background:`radial-gradient(60% 42% at 68% 96%, rgba(255, 196, 150, 0.85) 0%, rgba(255, 206, 166, 0) 70%), linear-gradient(180deg, #d5d5e3 0%, #e7dfe3 34%, #f4e3d6 62%, #f6d6bd 84%, #f2c7a6 100%)`,touchAction:`none`},onPointerMove:e=>{f.current=performance.now(),p.current=!e.target.closest?.(`.dock, .hero-copy`)},onPointerDown:e=>{f.current=performance.now(),p.current=!e.target.closest?.(`.dock, .hero-copy`)},onPointerLeave:()=>p.current=!1,children:[(0,W.jsx)(`style`,{children:`
        .mur-ground { position: absolute; left: 0; right: 0; bottom: 0; height: min(190px, 24vh); width: 100%; pointer-events: none; }
        .mur-stage .hero-copy h1 { color: #26212b; }
        .mur-stage .hero-copy p { color: #5a5058; }
        .mur-stat { font: 500 13px/1 var(--mono); font-variant-numeric: tabular-nums; }
        .mur-toggle .seg-bg { position: absolute; inset: 0; border-radius: inherit; background: color-mix(in srgb, var(--fg) 10%, transparent); z-index: -1; }
        .mur-toggle i { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; vertical-align: 1px; background: currentColor; opacity: .35; transition: opacity .2s, background .2s; }
        .mur-toggle[aria-pressed='true'] i { opacity: 1; background: #d2553a; }
        @media (max-width: 760px) {
          .mur-stage .dock .seg { padding: 0 10px; }
          .mur-stage .dock .dock-sep { margin: 0 2px; }
          .mur-stage .hero-copy p { font-size: 14px; line-height: 1.65; }
        }
      `}),(0,W.jsx)(ee,{dpr:[1,2],camera:{position:[0,2,40],fov:40,near:.5,far:200},gl:{antialias:!0,alpha:!0},children:(0,W.jsx)(re,{ctl:v})}),(0,W.jsxs)(`svg`,{className:`mur-ground`,viewBox:`0 0 ${y.W} ${y.H}`,preserveAspectRatio:`xMidYMax slice`,"aria-hidden":!0,children:[(0,W.jsx)(`path`,{d:y.far+y.trees,fill:`#6a5866`,opacity:.13}),(0,W.jsx)(`path`,{d:y.near,fill:`#3a3038`,opacity:.24})]}),(0,W.jsxs)(`div`,{className:`overlay`,children:[(0,W.jsxs)(a.div,{className:`hero-copy`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.7,delay:.2,ease:[.23,1,.32,1]},children:[(0,W.jsx)(`div`,{className:`scrim`,style:{"--soft-bg":`rgba(240, 230, 228, 0.55)`}}),(0,W.jsxs)(`p`,{className:`kicker`,children:[(0,W.jsx)(`i`,{}),` Boids · GPGPU · `,(e=>e>=1e4?`${(e/1e4).toFixed(e%1e4?1:0)} 万`:e.toLocaleString())(Y[2])]}),(0,W.jsxs)(`h1`,{children:[`一万只鸟，`,(0,W.jsx)(`br`,{}),`没有指挥`]}),(0,W.jsx)(`p`,{children:`每只鸟只看身边：别撞上、跟着飞、别掉队。三条局部规则叠在一起，整群就像椋鸟一样流动变形。指针是一只鹰，靠近看鸟群裂开又合拢。`}),(0,W.jsxs)(`div`,{className:`hero-actions`,children:[(0,W.jsx)(`button`,{className:`btn primary`,onClick:()=>{c(!0),l.current=!0,u.current++},children:`放一只鹰`}),(0,W.jsx)(`span`,{className:`btn`,style:{cursor:`default`},children:(0,W.jsxs)(`span`,{ref:m,className:`mur-stat`,children:[Y[2].toLocaleString(),` 只`]})})]})]}),(0,W.jsxs)(`div`,{className:`dock`,children:[(0,W.jsx)(M,{items:[`少`,`中`,`多`].map((e,t)=>({value:t,label:e})),value:e,onChange:t}),(0,W.jsx)(`span`,{className:`dock-sep`}),(0,W.jsx)(M,{items:X.map((e,t)=>({value:t,label:e.label})),value:n,onChange:o}),(0,W.jsx)(`span`,{className:`dock-sep`}),(0,W.jsxs)(`button`,{className:`seg mur-toggle`,"aria-pressed":s,onClick:()=>c(e=>!e),children:[s&&(0,W.jsx)(`span`,{className:`seg-bg`}),(0,W.jsxs)(`span`,{children:[(0,W.jsx)(`i`,{}),`捕食者`]})]})]}),(0,W.jsxs)(`p`,{className:`hint`,children:[s?`指针是一只鹰 · 掠过鸟群`:`捕食者已关闭`,(0,W.jsx)(`br`,{}),s?`静置时它会自己俯冲`:`鸟群只按三条规则飞`]})]})]})}export{oe as default};