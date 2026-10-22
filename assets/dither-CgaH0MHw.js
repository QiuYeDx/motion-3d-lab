import{B as e,Ht as t,Kt as n,hn as r,jt as i,vn as a,xt as o,yn as s}from"./events-9ce18a08.esm-BJiOHOtz.js";import{n as c}from"./glsl-oFfHlTlN.js";var l={title:`1-bit 抖动`,en:`1-bit Dither`,background:`#e8dfc8`,theme:`light`},u=[{id:`bayer`,label:`Bayer 8×8`,en:`Ordered`},{id:`blue`,label:`蓝噪声`,en:`Blue noise`},{id:`error`,label:`误差扩散`,en:`Atkinson`}],d=[{id:`obra`,label:`奥伯拉丁`,dark:`#2b2118`,light:`#e8dfc8`},{id:`mac`,label:`Mac 1-bit`,dark:`#000000`,light:`#ffffff`},{id:`phosphor`,label:`磷光绿`,dark:`#07160c`,light:`#5cff86`},{id:`duo`,label:`两色印刷`,dark:`#1f3a93`,light:`#f6c4ad`}];function f(e){return()=>{e|=0,e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}function p(e,t=1.6,n=7){let r=e*e,i=new Float32Array(4*r);for(let n=0;n<2*e;n++)for(let r=0;r<2*e;r++){let a=Math.min(r%e,e-r%e),o=Math.min(n%e,e-n%e);i[n*2*e+r]=Math.exp(-(a*a+o*o)/(2*t*t))}let a=(t,n,r)=>{let a=n%e,o=n/e|0;for(let n=0;n<e;n++){let s=(n-o+e)*2*e+e-a,c=n*e;for(let n=0;n<e;n++)t[c+n]+=r*i[s+n]}},o=(e,t,n,i)=>{let a=-1,o=i?-1/0:1/0;for(let s=0;s<r;s++){if(t[s]!==n)continue;let r=e[s];(i?r>o:r<o)&&(o=r,a=s)}return a},s=f(n),c=new Uint8Array(r),l=new Float32Array(r),u=0,d=Math.round(r*.1);for(;u<d;){let e=Math.floor(s()*r);c[e]||(c[e]=1,a(l,e,1),u++)}for(let e=0;e<r*4;e++){let e=o(l,c,1,!0);c[e]=0,a(l,e,-1);let t=o(l,c,0,!1);if(c[t]=1,a(l,t,1),t===e)break}let p=new Uint32Array(r);{let e=c.slice(),t=l.slice(),n=u;for(;n>0;){let r=o(t,e,1,!0);e[r]=0,a(t,r,-1),n--,p[r]=n}}{let e=u;for(;e<r;){let t=o(l,c,0,!1);c[t]=1,a(l,t,1),p[t]=e,e++}}return p}var m=null;function h(a,o,s){let c=new Uint8Array(o*o*4);for(let e=0;e<o*o;e++){let t=Math.round((a[e]+.5)/s*255);c[e*4]=c[e*4+1]=c[e*4+2]=t,c[e*4+3]=255}let l=new e(c,o,o,t,r);return l.magFilter=l.minFilter=i,l.wrapS=l.wrapT=n,l.generateMipmaps=!1,l.needsUpdate=!0,l}function g(){if(m)return m;let e=[[0]];for(;e.length<8;){let t=e.length,n=Array.from({length:t*2},()=>Array(t*2).fill(0));for(let r=0;r<t;r++)for(let i=0;i<t;i++){let a=4*e[r][i];n[r][i]=a,n[r][i+t]=a+2,n[r+t][i]=a+3,n[r+t][i+t]=a+1}e=n}return m={bayer:h(e.flat(),8,64),blue:h(p(64),64,4096)},m}var _=`
uniform sampler2D tBayer;
uniform sampler2D tBlue;
uniform float uCell;      // dither cell, CSS px
uniform float uModeA;     // 0 bayer · 1 blue · 2 error
uniform float uModeB;
uniform float uModeMix;   // cells dissolve A → B in blue-noise order
uniform float uWorld;     // 0 screen-space · 1 world-stable (also dissolves)
uniform vec2 uPan;        // camera yaw / pitch, radians
uniform float uProjY;     // projectionMatrix[1][1] (0 = no camera bound)
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uContrast;
uniform float uGamma;
uniform float uBias;
uniform float uEdge;

float CELL;

float toneAt(vec2 cell) {
  float v = luma(sceneAt((cell + 0.5) * CELL));
  v = pow(max(v, 0.0), uGamma);
  return clamp((v - 0.5) * uContrast + 0.5 + uBias, 0.0, 1.0);
}
float bayerAt(vec2 c) { return texture2D(tBayer, (mod(c, 8.0) + 0.5) / 8.0).r; }
float blueAt(vec2 c) { return texture2D(tBlue, (mod(c, 64.0) + 0.5) / 64.0).r; }

#define EL 9
#define EW 13
// Atkinson error diffusion over a causal window ending at this cell. Rows scan top → bottom
// (decreasing gl y), cells left → right; row r only needs to reach (3 - r) cells past this column.
float atkinson(vec2 c) {
  float e0[EW];
  float e1[EW];
  float e2[EW];
  for (int i = 0; i < EW; i++) { e0[i] = 0.0; e1[i] = 0.0; e2[i] = 0.0; }
  float o = 0.0;
  for (int r = 0; r < 4; r++) {
    float y = c.y + float(3 - r);
    for (int i = 0; i < EW; i++) {
      if (i > EL + 3 - r) break;
      vec2 q = vec2(c.x + float(i - EL), y);
      float v = toneAt(q) + e0[i];
      // the error that would have arrived from outside the window is unknown: seed it with blue noise
      if (r == 0 || i < 2) v += (blueAt(q + vec2(17.0, 31.0)) - 0.5) * 0.4;
      o = step(0.5, v);
      float err = (v - o) * 0.125;
      if (i + 1 < EW) e0[i + 1] += err;
      if (i + 2 < EW) e0[i + 2] += err;
      if (i > 0) e1[i - 1] += err;
      e1[i] += err;
      if (i + 1 < EW) e1[i + 1] += err;
      e2[i] += err;
    }
    for (int i = 0; i < EW; i++) { e0[i] = e1[i]; e1[i] = e2[i]; e2[i] = 0.0; }
  }
  return o;
}

float ditherWith(float mode, vec2 c, vec2 pc, float v) {
  if (mode > 1.5) return atkinson(c);
  float t = mode < 0.5 ? bayerAt(pc) : blueAt(pc);
  return step(t, v);
}

// x: edge strength · y: 1 if it's a silhouette (depth step) rather than a crease
vec2 edgeAt(vec2 c) {
  vec2 p = (c + 0.5) * CELL;
  vec2 dx = vec2(CELL, 0.0), dy = vec2(0.0, CELL);
  float i0 = 1.0 / depthAt(p);
  float iL = 1.0 / depthAt(p - dx), iR = 1.0 / depthAt(p + dx);
  float iD = 1.0 / depthAt(p - dy), iU = 1.0 / depthAt(p + dy);
  // Laplacian of 1/z is ~0 on planes; strongly negative on the near side of a depth step
  float lap = min(iL + iR - 2.0 * i0, iD + iU - 2.0 * i0) / i0;
  float sil = smoothstep(0.035, 0.07, -lap);
  float e = sil;
  vec3 n = normalAt(p);
  if (dot(n, n) > 0.5) {
    vec3 nr = normalAt(p + dx), nu = normalAt(p + dy);
    float crease = min(dot(nr, nr) > 0.5 ? dot(n, nr) : 1.0, dot(nu, nu) > 0.5 ? dot(n, nu) : 1.0);
    e = max(e, smoothstep(0.82, 0.62, crease));
  }
  return vec2(e, step(0.5, sil));
}

vec3 stylize(vec2 px) {
  CELL = max(1.0, floor(uCell * uDpr + 0.5));
  vec2 c = floor(px / CELL);
  float v = toneAt(c);

  // world-stable pattern: shift by the camera's turn, in whole cells
  float focal = 0.5 * uRes.y * uProjY;
  vec2 pan = floor(uPan * focal / CELL + 0.5);
  float h = hash12(c * 0.7919 + 3.17);
  vec2 pc = c + (h < uWorld ? pan : vec2(0.0));

  float mode = blueAt(c + vec2(7.0, 3.0)) < uModeMix ? uModeB : uModeA;
  float ink = 1.0 - ditherWith(mode, c, pc, v); // 1 = dark

  vec2 e = edgeAt(c);
  // dark ink lines; a silhouette inside deep shadow flips to the light ink so the shape still reads
  if (e.x * uEdge > 0.5) ink = (e.y > 0.5 && v < 0.06) ? 0.0 : 1.0;
  return mix(uLight, uDark, ink);
}
`,v=new WeakMap,y=e=>e.uniforms?v.get(e.uniforms):void 0,b={bayer:0,blue:1,error:2},x=e=>new s(...c(e));function S(e={}){let t=g(),n=d.find(t=>t.id===(e.palette??`obra`)),r=b[e.mode??`blue`],i={tBayer:{value:t.bayer},tBlue:{value:t.blue},uCell:{value:2},uModeA:{value:r},uModeB:{value:r},uModeMix:{value:0},uWorld:{value:e.world===!1?0:1},uPan:{value:new a},uProjY:{value:0},uDark:{value:x(n.dark)},uLight:{value:x(n.light)},uContrast:{value:1.6},uGamma:{value:.9},uBias:{value:0},uEdge:{value:1}},c={mode:r,pending:null,world:i.uWorld.value,worldTarget:i.uWorld.value,dark:i.uDark.value,light:i.uLight.value,darkT:i.uDark.value.clone(),lightT:i.uLight.value.clone(),camera:null,yaw:0,prevYaw:null,dir:new s},l={frag:_,uniforms:i,normals:!0,update(e){i.uModeA.value!==i.uModeB.value&&(i.uModeMix.value=Math.min(1,i.uModeMix.value+e/.7),i.uModeMix.value>=1&&(i.uModeA.value=i.uModeB.value,i.uModeMix.value=0));let t=c.worldTarget-c.world;c.world+=Math.sign(t)*Math.min(Math.abs(t),e/.6),i.uWorld.value=c.world;let n=1-Math.exp(-e*7);c.dark.lerp(c.darkT,n),c.light.lerp(c.lightT,n);let r=c.camera;if(r&&r.isPerspectiveCamera){r.getWorldDirection(c.dir);let e=Math.atan2(c.dir.x,-c.dir.z);if(c.prevYaw!==null){let t=e-c.prevYaw;t>Math.PI&&(t-=2*Math.PI),t<-Math.PI&&(t+=2*Math.PI),c.yaw+=t}else c.yaw=e;c.prevYaw=e,i.uPan.value.set(c.yaw,Math.asin(o.clamp(c.dir.y,-1,1))),i.uProjY.value=r.projectionMatrix.elements[5]}else i.uProjY.value=0}};return v.set(i,c),l}var C=e=>e.uniforms;function w(e,t){let n=C(e),r=b[t];(n.uModeB.value!==r||n.uModeMix.value!==0||n.uModeA.value!==r)&&(n.uModeA.value!==n.uModeB.value&&n.uModeMix.value>.5&&(n.uModeA.value=n.uModeB.value),n.uModeB.value=r,n.uModeMix.value=0,n.uModeA.value===r&&(n.uModeB.value=r))}function T(e,t,n=!1){let r=y(e),i=d.find(e=>e.id===t);r&&i&&(r.darkT.set(...c(i.dark)),r.lightT.set(...c(i.light)),n&&(r.dark.copy(r.darkT),r.light.copy(r.lightT)))}function E(e,t){let n=y(e);n&&(n.worldTarget=+!!t)}function D(e,t){let n=C(e);t.contrast!==void 0&&(n.uContrast.value=t.contrast),t.bias!==void 0&&(n.uBias.value=t.bias),t.gamma!==void 0&&(n.uGamma.value=t.gamma),t.edges!==void 0&&(n.uEdge.value=t.edges),t.cell!==void 0&&(n.uCell.value=t.cell)}function O(e,t){let n=y(e);n&&(n.camera=t,n.prevYaw=null)}export{d as a,D as c,u as i,E as l,S as n,w as o,l as r,T as s,O as t};