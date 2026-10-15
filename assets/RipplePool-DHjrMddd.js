import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-motion-value-CIZAIwyH.js";import{n as a}from"./index-uImfd-0P.js";import{At as o,Bt as s,Ft as c,Jt as l,M as u,Mt as d,N as f,P as p,St as m,W as h,_n as g,bn as _,dt as v,gn as y,h as b,qt as ee,rt as te,u as x,vn as S,w as ne,xt as C,yt as w}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as T}from"./react-three-fiber.esm-BQtD7wyt.js";import{n as E,t as re}from"./iso-C377rVhz.js";import{t as ie}from"./Seg-BfWvO_Xs.js";import{n as D}from"./glsl-CTWV-b_3.js";var O=e(t(),1),k=n(),A={x0:-4.4,z0:-3,W:6.2,L:5.8},j=A.x0+A.W,M=A.z0+A.L,N={x0:-6,x1:6,z0:-4.6,z1:4.4},P=-.2,ae=1.55,F=256,I={deck:`#f6e9d8`,deckSide:`#efd2bd`,coping:`#fffaf2`,coping2:`#f4e8d6`,liner:`#d9f2f0`,rock:[`#eab3a0`,`#d48f92`,`#a7708c`,`#7c587a`],white:`#ffffff`,coral:`#ff8f7d`,coralDeep:`#e9705f`,sun:`#ffd27a`,teal:`#6cc6c9`,pot:`#d9846c`,leaf:`#76c39b`,leaf2:`#9ad6ae`,trunk:`#a8786a`,chrome:`#dfe7ec`},L=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,oe=`
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDelta;
uniform float uDamp;
uniform float uWind;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 info = texture2D(uTex, vUv);
  vec2 dx = vec2(uDelta.x, 0.0);
  vec2 dy = vec2(0.0, uDelta.y);
  float avg = (texture2D(uTex, vUv - dx).r + texture2D(uTex, vUv + dx).r +
               texture2D(uTex, vUv - dy).r + texture2D(uTex, vUv + dy).r) * 0.25;
  info.g += (avg - info.r) * 2.0;
  info.g *= uDamp;
  info.r += info.g;
  info.r *= 0.9992;
  // wave maker along the deep (-x) wall: an oblique travelling swell
  if (uWind > 0.0) {
    float edge = 1.0 - smoothstep(0.0, 3.0 * uDelta.x, vUv.x);
    float swell = sin(uTime * 8.0 - vUv.y * 9.0) * 0.65 + sin(uTime * 11.0 + vUv.y * 5.0) * 0.35;
    info.r = mix(info.r, swell * uWind, edge);
  }
  gl_FragColor = info;
}
`,se=`
precision highp float;
uniform sampler2D uTex;
uniform vec4 uDrops[8];
uniform int uCount;
uniform vec2 uAspect;
varying vec2 vUv;
void main() {
  vec4 info = texture2D(uTex, vUv);
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 d = uDrops[i];
    float r = length((vUv - d.xy) * uAspect) / d.z;
    float k = max(0.0, 1.0 - r);
    k = 0.5 - cos(k * 3.14159265) * 0.5;
    info.r += k * d.w;
  }
  gl_FragColor = info;
}
`,ce=`
precision highp float;
uniform sampler2D uTex;
uniform float uKeep;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTex, vUv) * uKeep; }
`,R=e=>`vec3(${D(e).map(e=>e.toFixed(4)).join(`,`)})`,le=`
uniform sampler2D uH;
uniform float uHS;
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.y += texture2D(uH, uv).r * uHS;
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,z=`
precision highp float;
uniform sampler2D uH;
uniform vec2 uTexel;
uniform vec4 uPool;     // x0, z0, W, L
uniform float uWaterY;
uniform float uDepth;
uniform float uHS;
uniform float uNS;
uniform vec3 uView;     // direction the camera looks
uniform vec3 uSun;      // direction towards the glint sun
uniform float uTime;
uniform float uRain;
varying vec2 vUv;
varying vec3 vPos;

float H(vec2 uv) { return texture2D(uH, uv).r * uHS; }

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/* distance to the nearest voronoi edge → bright caustic web */
float voro(vec2 x, float t) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(n + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return f2 - f1;
}
float caustic(vec2 p, float t) {
  float a = voro(p * 1.25, t * 0.8);
  float b = voro(p * 2.1 + 3.7, t * 1.1);
  float ca = clamp(1.0 - a / 0.2, 0.0, 1.0);
  float cb = clamp(1.0 - b / 0.14, 0.0, 1.0);
  return ca * ca * ca * 0.65 + cb * cb * 0.45;
}

/* ---- pool interior: shallow steps at the +x end, deep floor elsewhere */
const float STEP_W = 0.62;
float floorDepth(vec2 xz) {
  float fromEnd = (uPool.x + uPool.z) - xz.x;
  float k = floor(fromEnd / STEP_W);
  return k < 3.0 ? 0.3 * (k + 1.0) : uDepth;
}

vec3 tiles(vec2 q, float size, vec3 base, vec3 grout) {
  vec2 g = q / size;
  vec2 f = abs(fract(g) - 0.5);
  float e = smoothstep(0.42, 0.47, max(f.x, f.y));
  float n = hash1(floor(g));
  return mix(base * (0.965 + 0.06 * n), grout, e * 0.85);
}

vec3 floorColor(vec3 p, out float isStep) {
  vec3 col = tiles(p.xz, 0.42, ${R(`#c5eeee`)}, ${R(`#f4fffe`)});
  float fromEnd = (uPool.x + uPool.z) - p.x;
  float k = floor(fromEnd / STEP_W);
  isStep = k < 3.0 ? 1.0 : 0.0;
  if (k < 3.0) {
    // contrasting nosing on each step edge
    float nose = fract(fromEnd / STEP_W);
    col = tiles(p.xz, 0.42, ${R(`#e2faf8`)}, ${R(`#ffffff`)});
    col = mix(col, ${R(`#2f93ad`)}, smoothstep(0.84, 0.87, nose));
  } else {
    // lane lines with T ends
    float lz = (p.z - uPool.y) / uPool.w;
    float lx = p.x - uPool.x;
    float lane = 0.0;
    for (int i = 1; i <= 2; i++) {
      float c = float(i) / 3.0;
      float d = abs(lz - c) * uPool.w;
      float aa = fwidth(d) + 0.004;
      lane = max(lane, (1.0 - smoothstep(0.09 - aa, 0.09 + aa, d)) * step(0.7, lx) * step(lx, uPool.z - 3.0 * STEP_W - 0.45));
      float tEnd = (1.0 - smoothstep(0.09 - aa, 0.09 + aa, abs(lx - 0.8))) * (1.0 - smoothstep(0.32, 0.34, d));
      lane = max(lane, tEnd);
    }
    col = mix(col, ${R(`#3c9fb5`)}, lane);
  }
  return col;
}

vec3 wallColor(vec2 q, float y) {
  vec3 col = tiles(vec2(q.x, y), 0.26, ${R(`#d4f1ef`)}, ${R(`#f6fffe`)});
  // mosaic band just under the water line
  float band = smoothstep(-0.36, -0.34, y - uWaterY) * (1.0 - smoothstep(-0.06, -0.04, y - uWaterY));
  return mix(col, tiles(vec2(q.x, y), 0.11, ${R(`#4fb2c6`)}, ${R(`#8fd3de`)}), band);
}

void main() {
  vec2 e = uTexel;
  float hl = H(vUv - vec2(e.x, 0.0));
  float hr = H(vUv + vec2(e.x, 0.0));
  float hd = H(vUv - vec2(0.0, e.y));
  float hu = H(vUv + vec2(0.0, e.y));
  float h0 = H(vUv);
  float dhx = (hr - hl) / (2.0 * e.x * uPool.z);
  float dhv = (hu - hd) / (2.0 * e.y * uPool.w); // v grows toward -z
  vec3 n = normalize(vec3(-dhx * uNS, 1.0, dhv * uNS));

  vec3 v = normalize(uView);
  vec3 r = refract(v, n, 1.0 / 1.333);
  vec3 p = vec3(vPos.x, uWaterY, vPos.z);

  // analytic wall exit, then march the stepped floor
  float tX = r.x > 0.0 ? (uPool.x + uPool.z - p.x) / r.x : (uPool.x - p.x) / r.x;
  float tZ = r.z > 0.0 ? (uPool.y + uPool.w - p.z) / r.z : (uPool.y - p.z) / r.z;
  float tW = min(tX, tZ);
  float tMax = min(tW, uDepth / max(-r.y, 0.05));
  float t = tMax;
  float hitFloor = 0.0;
  float prev = 0.0;
  for (int i = 1; i <= 28; i++) {
    float tt = tMax * float(i) / 28.0;
    vec3 q = p + r * tt;
    if (uWaterY - q.y >= floorDepth(q.xz)) {
      float a = prev;
      float b = tt;
      for (int j = 0; j < 5; j++) {
        float m = 0.5 * (a + b);
        vec3 qm = p + r * m;
        if (uWaterY - qm.y >= floorDepth(qm.xz)) b = m; else a = m;
      }
      t = b;
      hitFloor = 1.0;
      break;
    }
    prev = tt;
  }
  vec3 hit = p + r * t;

  vec3 base;
  float isStep = 0.0;
  float wallK = 0.0;
  if (hitFloor > 0.5) {
    base = floorColor(hit, isStep);
  } else if (tX < tZ) {
    base = wallColor(vec2(hit.z, 0.0), hit.y);
    wallK = 1.0;
  } else {
    base = wallColor(vec2(hit.x, 0.0), hit.y);
    wallK = 1.0;
  }

  // caustics: an ambient web, warped by the surface normal, plus light focused under ripple crests
  vec2 huv = vec2((hit.x - uPool.x) / uPool.z, 1.0 - (hit.z - uPool.y) / uPool.w);
  float lap = H(huv + vec2(e.x, 0.0)) + H(huv - vec2(e.x, 0.0)) + H(huv + vec2(0.0, e.y)) + H(huv - vec2(0.0, e.y)) - 4.0 * H(huv);
  float focus = clamp(-lap * 260.0, 0.0, 1.2);
  float cst = caustic(hit.xz + n.xz * 1.4, uTime) * mix(1.0, 0.45, wallK) + focus;
  base *= 0.8 + cst * 0.5;

  // absorption along the refracted path
  float path = t;
  base *= mix(vec3(1.0), ${R(`#7fd8de`)}, clamp(path * 0.8, 0.0, 1.0));
  vec3 col = mix(base, ${R(`#1f95b0`)}, 1.0 - exp(-path * 0.5));

  // reflection of a pastel sky + fresnel
  vec3 R = reflect(v, n);
  vec3 sky = mix(${R(`#fff3ea`)}, ${R(`#bfe9ee`)}, clamp(R.y * 1.2, 0.0, 1.0));
  float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, -v), 0.0), 5.0);
  col = mix(col, sky, clamp(fr * 2.4, 0.0, 0.7));

  // sun glints only where ripples tilt the surface toward the sun
  float sd = max(dot(R, normalize(uSun)), 0.0);
  col += vec3(1.0, 0.97, 0.9) * (pow(sd, 160.0) * 0.9 + pow(sd, 1400.0) * 2.4);

  // soft contact shade against the walls + a light rim where water meets tile
  float ed = min(min(vPos.x - uPool.x, uPool.x + uPool.z - vPos.x), min(vPos.z - uPool.y, uPool.y + uPool.w - vPos.z));
  col *= mix(0.84, 1.0, smoothstep(0.0, 0.5, ed));
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.05, ed)) * 0.35);
  // rain dims the sky reflection a touch
  col = mix(col, col * vec3(0.93, 0.96, 0.98), uRain * 0.6);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;function B(e,t){let n=b(e=>e.gl),r=(0,O.useMemo)(()=>{let e={type:te,format:s,minFilter:v,magFilter:v,wrapS:u,wrapT:u,depthBuffer:!1,stencilBuffer:!1},t=new _(F,F,e),n=new _(F,F,e),r=new ee,i=new d(-1,1,1,-1,0,1),a=new m(new c(2,2));a.frustumCulled=!1,r.add(a);let o=new l({vertexShader:L,fragmentShader:oe,uniforms:{uTex:{value:null},uDelta:{value:new y(1/F,1/F)},uDamp:{value:.995},uWind:{value:0},uTime:{value:0}}}),f=new l({vertexShader:L,fragmentShader:se,uniforms:{uTex:{value:null},uDrops:{value:Array.from({length:8},()=>new S)},uCount:{value:0},uAspect:{value:new y(A.W/Math.max(A.W,A.L),A.L/Math.max(A.W,A.L))}}}),p=new l({vertexShader:L,fragmentShader:ce,uniforms:{uTex:{value:null},uKeep:{value:0}}});return{rt:[t,n],read:0,scene:r,cam:i,quad:a,update:o,drop:f,fade:p,t:0,acc:0,clearReq:0}},[]);(0,O.useEffect)(()=>()=>{r.rt.forEach(e=>e.dispose()),r.update.dispose(),r.drop.dispose(),r.fade.dispose(),r.quad.geometry.dispose()},[r]);let i=(0,O.useMemo)(()=>({drops:[],tex:{current:r.rt[0].texture},clear:()=>void(r.clearReq=1)}),[r]);return x((a,o)=>{let s=Math.min(o,1/30);r.t+=s;let c=e=>{e.uniforms.uTex.value=r.rt[r.read].texture,r.quad.material=e,n.setRenderTarget(r.rt[1-r.read]),n.render(r.scene,r.cam),r.read=1-r.read},l=n.getRenderTarget();r.clearReq&&(r.clearReq=0,r.fade.uniforms.uKeep.value=0,c(r.fade));let u=0;for(;i.drops.length&&u++<4;){let e=Math.min(8,i.drops.length),t=r.drop.uniforms.uDrops.value;for(let n=0;n<e;n++){let e=i.drops[n];t[n].set(e[0],e[1],e[2],e[3])}i.drops.splice(0,e),r.drop.uniforms.uCount.value=e,c(r.drop)}i.drops.length=0;let d=e.current;for(r.update.uniforms.uDamp.value=d===`rain`?.985:d===`wind`?.988:.995,r.update.uniforms.uWind.value=t.current??0,r.acc=Math.min(r.acc+s*60,3);r.acc>=1;)--r.acc,r.update.uniforms.uTime.value=r.t-r.acc/60,c(r.update);n.setRenderTarget(l),i.tex.current=r.rt[r.read].texture}),i}function V({sim:e,rain:t,burst:n}){let r=b(e=>e.camera),i=(0,O.useMemo)(()=>new l({vertexShader:le,fragmentShader:z,uniforms:{uH:{value:null},uTexel:{value:new y(1/F,1/F)},uPool:{value:new S(A.x0,A.z0,A.W,A.L)},uWaterY:{value:P},uDepth:{value:ae},uHS:{value:.5},uNS:{value:9},uView:{value:new g(-1,-1,-1).normalize()},uSun:{value:new g(-.35,1,-.95).normalize()},uTime:{value:0},uRain:{value:0}}}),[]);(0,O.useEffect)(()=>()=>i.dispose(),[i]);let a=(0,O.useMemo)(()=>new g,[]);x(n=>{i.uniforms.uH.value=e.tex.current,i.uniforms.uTime.value=n.clock.elapsedTime,i.uniforms.uRain.value=t.current??0,r.getWorldDirection(a),i.uniforms.uView.value.copy(a)});let o=(0,O.useRef)({down:!1,last:null,t:0});(0,O.useEffect)(()=>{let e=()=>{o.current.down=!1,o.current.last=null};return window.addEventListener(`pointerup`,e),()=>window.removeEventListener(`pointerup`,e)},[]);let s=(t,n,r)=>{let i=o.current;if(i.last){let a=i.last.distanceTo(t),o=Math.min(6,Math.floor(a/.018));for(let a=1;a<=o;a++){let s=a/(o+1);e.drops.push([i.last.x+(t.x-i.last.x)*s,i.last.y+(t.y-i.last.y)*s,n,r])}}e.drops.push([t.x,t.y,n,r]),i.last=t.clone()};return(0,k.jsx)(`mesh`,{position:[A.x0+A.W/2,P,A.z0+A.L/2],rotation:[-Math.PI/2,0,0],material:i,onPointerDown:t=>{t.stopPropagation(),t.uv&&(o.current.down=!0,o.current.last=null,e.drops.push([t.uv.x,t.uv.y,.04,.085]),n.current?.(t.point.x,t.point.z,9,1.9),o.current.last=t.uv.clone())},onPointerMove:t=>{if(!t.uv)return;let n=o.current;if(n.down)s(t.uv,.028,.026);else{let r=performance.now();r-n.t>40&&(n.t=r,e.drops.push([t.uv.x,t.uv.y,.02,.0035]))}},onPointerEnter:()=>void(document.body.style.cursor=`crosshair`),onPointerLeave:()=>void(document.body.style.cursor=``),children:(0,k.jsx)(`planeGeometry`,{args:[A.W,A.L,160,150]})})}function H({p:e,s:t,c:n,cast:r=!0,receive:i=!0}){return(0,k.jsxs)(`mesh`,{position:e,castShadow:r,receiveShadow:i,children:[(0,k.jsx)(`boxGeometry`,{args:t}),(0,k.jsx)(`meshLambertMaterial`,{color:n})]})}function U(){let e=-.6,t=.6,n=A.x0,r=j;return(0,k.jsxs)(`group`,{children:[(0,k.jsx)(H,{p:[(N.x0+n)/2,e/2,(N.z0+N.z1)/2],s:[n-N.x0,t,N.z1-N.z0],c:I.deck}),(0,k.jsx)(H,{p:[(r+N.x1)/2,e/2,(N.z0+N.z1)/2],s:[N.x1-r,t,N.z1-N.z0],c:I.deck}),(0,k.jsx)(H,{p:[(n+r)/2,e/2,(N.z0+A.z0)/2],s:[A.W,t,A.z0-N.z0],c:I.deck}),(0,k.jsx)(H,{p:[(n+r)/2,e/2,(M+N.z1)/2],s:[A.W,t,N.z1-M],c:I.deck}),(0,k.jsx)(H,{p:[n+.02,e/2,A.z0+A.L/2],s:[.04,t,A.L],c:I.liner,cast:!1}),(0,k.jsx)(H,{p:[r-.02,e/2,A.z0+A.L/2],s:[.04,t,A.L],c:I.liner,cast:!1}),(0,k.jsx)(H,{p:[n+A.W/2,e/2,A.z0+.02],s:[A.W,t,.04],c:I.liner,cast:!1}),(0,k.jsx)(H,{p:[n+A.W/2,e/2,M-.02],s:[A.W,t,.04],c:I.liner,cast:!1}),(0,k.jsx)(H,{p:[0,-1.1,(N.z0+N.z1)/2],s:[N.x1-N.x0,1,N.z1-N.z0],c:I.deckSide}),[0,1,2,3].map(e=>{let t=.62*(e+1)+(e>1?.5*(e-1):0);return(0,k.jsx)(H,{p:[0,-2.1-e*.9,(N.z0+N.z1)/2],s:[N.x1-N.x0-t*2,.9,N.z1-N.z0-t*2],c:I.rock[e]},e)})]})}function ue(){let e=(0,O.useRef)(null),t=(0,O.useMemo)(()=>{let e=.52,t=[],n=.08,r=Math.round((A.W+2*e)/e),i=A.x0-e,a=(A.W+2*e)/r;for(let o=0;o<r;o++){let r=i+a*(o+.5);t.push({p:[r,.05,A.z0-e/2+n/2],s:[a-.035,.1,.6]}),t.push({p:[r,.05,M+e/2-n/2],s:[a-.035,.1,.6]})}let o=Math.round(A.L/e),s=A.L/o;for(let r=0;r<o;r++){let i=A.z0+s*(r+.5);t.push({p:[A.x0-e/2+n/2,.05,i],s:[.6,.1,s-.035]}),t.push({p:[j+e/2-n/2,.05,i],s:[.6,.1,s-.035]})}return t},[]);return(0,O.useEffect)(()=>{let n=e.current;if(!n)return;let r=new o,i=new f(I.coping),a=new f(I.coping2);t.forEach((e,t)=>{r.position.set(...e.p),r.scale.set(...e.s),r.updateMatrix(),n.setMatrixAt(t,r.matrix),n.setColorAt(t,(t>>1)%2?i:a)}),n.instanceMatrix.needsUpdate=!0,n.instanceColor&&(n.instanceColor.needsUpdate=!0)},[t]),(0,k.jsxs)(`instancedMesh`,{ref:e,args:[void 0,void 0,t.length],castShadow:!0,receiveShadow:!0,children:[(0,k.jsx)(`boxGeometry`,{}),(0,k.jsx)(`meshLambertMaterial`,{color:`#ffffff`})]})}function de(e,t,n,r,i){return(0,O.useMemo)(()=>{let a=new p(e,t,n,1,!0).toNonIndexed(),o=a.attributes.position.count,s=new Float32Array(o*3),c=new f(r),l=new f(i);for(let e=0;e<o/3;e++){let t=Math.floor(e/2)%2?c:l;for(let n=0;n<3;n++)t.toArray(s,(e*3+n)*3)}return a.setAttribute(`color`,new ne(s,3)),a.computeVertexNormals(),a},[e,t,n,r,i])}function fe({p:e,wind:t}){let n=(0,O.useRef)(null),r=de(1.15,.5,12,I.coral,`#fff6ec`);return x(e=>{if(!n.current)return;let r=Math.abs(t.current??0)*6,i=e.clock.elapsedTime;n.current.rotation.z=Math.sin(i*2.3)*.015*(.4+r)+.05*r,n.current.rotation.x=Math.sin(i*1.7+1)*.012*(.4+r)}),(0,k.jsxs)(`group`,{position:e,children:[(0,k.jsx)(H,{p:[0,.06,0],s:[.42,.12,.42],c:I.teal}),(0,k.jsxs)(`group`,{ref:n,children:[(0,k.jsxs)(`mesh`,{position:[0,1.15,0],castShadow:!0,children:[(0,k.jsx)(`cylinderGeometry`,{args:[.035,.035,2.2,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.white})]}),(0,k.jsx)(`mesh`,{position:[0,2.25,0],geometry:r,castShadow:!0,children:(0,k.jsx)(`meshLambertMaterial`,{vertexColors:!0,side:2})}),(0,k.jsxs)(`mesh`,{position:[0,2.55,0],children:[(0,k.jsx)(`sphereGeometry`,{args:[.06,12,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.coralDeep})]})]})]})}function W({p:e,ry:t=0}){return(0,k.jsxs)(`group`,{position:e,rotation:[0,t,0],children:[[-.27,.27].flatMap(e=>[-.75,.75].map(t=>(0,k.jsx)(H,{p:[e,.14,t],s:[.07,.28,.07],c:I.white},`${e}${t}`))),(0,k.jsx)(H,{p:[0,.31,.15],s:[.66,.08,1.5],c:I.white}),(0,k.jsx)(H,{p:[0,.39,.15],s:[.58,.08,1.42],c:I.coral}),(0,k.jsxs)(`group`,{position:[0,.32,-.62],rotation:[.62,0,0],children:[(0,k.jsx)(H,{p:[0,0,-.36],s:[.66,.08,.76],c:I.white}),(0,k.jsx)(H,{p:[0,.08,-.36],s:[.58,.08,.7],c:I.coral})]}),(0,k.jsx)(H,{p:[0,.47,.6],s:[.5,.06,.34],c:I.sun})]})}function G({p:e,s:t=1,wind:n}){let r=(0,O.useRef)(null),i=(0,O.useMemo)(()=>Array.from({length:7},(e,t)=>({a:t/7*Math.PI*2+.3,tilt:.75+t%3*.18,len:.62+t%2*.16})),[]);return x(t=>{if(!r.current)return;let i=Math.abs(n.current??0)*6;r.current.rotation.z=Math.sin(t.clock.elapsedTime*2.1+e[0])*.03*(.3+i)+.08*i}),(0,k.jsxs)(`group`,{position:e,scale:t,children:[(0,k.jsxs)(`mesh`,{position:[0,.26,0],castShadow:!0,receiveShadow:!0,children:[(0,k.jsx)(`cylinderGeometry`,{args:[.34,.26,.52,18]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.pot})]}),(0,k.jsxs)(`mesh`,{position:[0,.53,0],children:[(0,k.jsx)(`cylinderGeometry`,{args:[.3,.3,.03,18]}),(0,k.jsx)(`meshLambertMaterial`,{color:`#8a6a58`})]}),(0,k.jsxs)(`group`,{ref:r,position:[0,.5,0],children:[i.map((e,t)=>(0,k.jsx)(`group`,{rotation:[0,e.a,0],children:(0,k.jsx)(`group`,{rotation:[0,0,e.tilt],children:(0,k.jsxs)(`mesh`,{position:[0,e.len/2+.05,0],scale:[.17,e.len/2,.07],castShadow:!0,children:[(0,k.jsx)(`sphereGeometry`,{args:[1,12,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:t%2?I.leaf:I.leaf2})]})})},t)),(0,k.jsxs)(`mesh`,{position:[0,.5,0],scale:[.14,.5,.06],castShadow:!0,children:[(0,k.jsx)(`sphereGeometry`,{args:[1,12,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.leaf2})]})]})]})}function K({p:e,h:t=1}){return(0,k.jsxs)(`group`,{position:e,children:[(0,k.jsxs)(`mesh`,{position:[0,.15,0],castShadow:!0,children:[(0,k.jsx)(`cylinderGeometry`,{args:[.06,.08,.3,6]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.trunk})]}),(0,k.jsxs)(`mesh`,{position:[0,.3+.55*t,0],castShadow:!0,children:[(0,k.jsx)(`coneGeometry`,{args:[.36*t,1.1*t,5]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.leaf,flatShading:!0})]})]})}function pe({x:e}){let t=A.z0+.16,n=A.z0-.4,r=(t+n)/2,i=(t-n)/2;return(0,k.jsx)(`group`,{children:[e-.3,e+.3].map(e=>(0,k.jsxs)(`group`,{children:[(0,k.jsxs)(`mesh`,{position:[e,.42,r],rotation:[0,Math.PI/2,0],castShadow:!0,children:[(0,k.jsx)(`torusGeometry`,{args:[i,.035,8,20,Math.PI]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.chrome})]}),(0,k.jsxs)(`mesh`,{position:[e,.42-.5,t],castShadow:!0,children:[(0,k.jsx)(`cylinderGeometry`,{args:[.035,.035,1,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.chrome})]}),(0,k.jsxs)(`mesh`,{position:[e,.22,n],children:[(0,k.jsx)(`cylinderGeometry`,{args:[.035,.035,.44,8]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.chrome})]})]},e))})}var q=N.x0+1.05,J=.1,Y=2.2,X=[-1.45,P,J];function me({flex:e,ctl:t,sim:n,burst:r}){let i=(0,O.useRef)(null),a=(0,O.useRef)(null),o=(0,O.useMemo)(()=>({splashed:-1}),[]);return x(()=>{let s=e.get()*.13;i.current&&(i.current.rotation.z=s);let c=a.current;if(!c)return;let l=t.at<0?99:(performance.now()-t.at)/1e3,u=q+Math.cos(s)*Y,d=.48+Math.sin(s)*Y;if(l<.3)c.visible=!0,c.position.set(u,d,J),c.rotation.set(0,0,0),c.scale.set(1,1-.18*Math.max(0,-e.get()),1);else if(l<.95){let e=(l-.3)/.65;c.visible=!0,c.position.set(w.lerp(u,X[0],e),w.lerp(d,X[1]-.3,e)+5.2*e*(1-e)*.42,J),c.rotation.set(0,0,-e*Math.PI*1.05),c.scale.set(1,1,1)}else if(l<3){if(c.visible=!1,o.splashed!==t.at){o.splashed=t.at;let e=(X[0]-A.x0)/A.W,i=1-(X[2]-A.z0)/A.L;n.drops.push([e,i,.065,.15],[e,i,.025,-.06]),r.current?.(X[0],X[2],34,3.4)}}else{let e=Math.min(1,(l-3)/.45)-1,t=Math.max(.001,1+2.4*e*e*e+1.4*e*e);c.visible=!0,c.position.set(u,d,J),c.rotation.set(0,0,0),c.scale.setScalar(t)}}),(0,k.jsxs)(`group`,{children:[(0,k.jsx)(H,{p:[N.x0+.8,.2,J],s:[.7,.4,.7],c:I.teal}),(0,k.jsxs)(`group`,{ref:i,position:[q,.44,J],children:[(0,k.jsx)(H,{p:[1.25,0,0],s:[2.5,.08,.56],c:I.white}),(0,k.jsx)(H,{p:[2.42,.045,0],s:[.16,.012,.56],c:I.coral,cast:!1})]}),(0,k.jsxs)(`group`,{ref:a,children:[(0,k.jsxs)(`mesh`,{position:[0,.23,0],castShadow:!0,children:[(0,k.jsx)(`coneGeometry`,{args:[.13,.46,16]}),(0,k.jsx)(`meshLambertMaterial`,{color:`#ffffff`})]}),(0,k.jsxs)(`mesh`,{position:[0,.52,0],castShadow:!0,children:[(0,k.jsx)(`sphereGeometry`,{args:[.095,16,12]}),(0,k.jsx)(`meshLambertMaterial`,{color:`#ffffff`})]}),(0,k.jsxs)(`mesh`,{position:[0,.545,0],children:[(0,k.jsx)(`sphereGeometry`,{args:[.1,16,8,0,Math.PI*2,0,Math.PI/2]}),(0,k.jsx)(`meshLambertMaterial`,{color:I.coral})]})]})]})}var Z=64;function he({api:e}){let t=(0,O.useRef)(null),n=(0,O.useMemo)(()=>({p:new Float32Array(192),v:new Float32Array(192),life:new Float32Array(Z),next:0,m:new C}),[]);return(0,O.useEffect)(()=>{e.current=(e,t,r,i)=>{for(let a=0;a<r;a++){let r=n.next++%Z,a=Math.random()*Math.PI*2,o=(.25+Math.random()*.75)*i*.32;n.p.set([e+Math.cos(a)*.08,-.18000000000000002,t+Math.sin(a)*.08],r*3),n.v.set([Math.cos(a)*o,i*(.55+Math.random()*.6),Math.sin(a)*o],r*3),n.life[r]=1}}},[e,n]),x((e,r)=>{let i=Math.min(r,1/30),a=t.current;if(!a)return;let o=!1;for(let e=0;e<Z;e++){let t=0;n.life[e]>0&&(n.v[e*3+1]-=9.8*i,n.p[e*3]+=n.v[e*3]*i,n.p[e*3+1]+=n.v[e*3+1]*i,n.p[e*3+2]+=n.v[e*3+2]*i,n.p[e*3+1]<P&&n.v[e*3+1]<0?n.life[e]=0:(t=.6+.4*Math.min(1,n.v[e*3+1]+1),o=!0)),n.m.makeScale(t,t,t).setPosition(n.p[e*3],n.p[e*3+1],n.p[e*3+2]),a.setMatrixAt(e,n.m)}a.visible=o,a.instanceMatrix.needsUpdate=!0}),(0,k.jsxs)(`instancedMesh`,{ref:t,args:[void 0,void 0,Z],frustumCulled:!1,raycast:()=>null,children:[(0,k.jsx)(`sphereGeometry`,{args:[.05,8,6]}),(0,k.jsx)(`meshBasicMaterial`,{color:`#ffffff`})]})}function ge({sim:e,wind:t}){let n=(0,O.useRef)(null),r=(0,O.useMemo)(()=>Array.from({length:8},(e,t)=>t),[]),i=(0,O.useMemo)(()=>({x:-1.4,z:.8,vx:.18,vz:.1,t:0,last:0}),[]);return x((r,a)=>{let o=Math.min(a,1/30),s=r.clock.elapsedTime,c=t.current??0;i.vx+=(Math.sin(s*.23)*.12+c*6-i.vx)*o*.6,i.vz+=(Math.cos(s*.31+1.2)*.12-i.vz)*o*.6,i.x+=i.vx*o,i.z+=i.vz*o;let l=.75;if(i.x<A.x0+l&&(i.x=A.x0+l,i.vx=Math.abs(i.vx)),i.x>j-l-1.4&&(i.x=j-l-1.4,i.vx=-Math.abs(i.vx)*.6),i.z<A.z0+l&&(i.z=A.z0+l,i.vz=Math.abs(i.vz)),i.z>M-l&&(i.z=M-l,i.vz=-Math.abs(i.vz)),n.current&&(n.current.position.set(i.x,-.14+Math.sin(s*1.9)*.025,i.z),n.current.rotation.set(Math.sin(s*1.3)*.05,s*.15,Math.cos(s*1.1)*.05)),s-i.last>.12){i.last=s;let t=Math.hypot(i.vx,i.vz);e.drops.push([(i.x-A.x0)/A.W,1-(i.z-A.z0)/A.L,.05,.0025+t*.01])}}),(0,k.jsx)(`group`,{ref:n,children:r.map(e=>(0,k.jsxs)(`mesh`,{rotation:[Math.PI/2,0,e*Math.PI/4],castShadow:!0,children:[(0,k.jsx)(`torusGeometry`,{args:[.42,.16,12,10,Math.PI/4+.01]}),(0,k.jsx)(`meshLambertMaterial`,{color:e%2?`#fffaf3`:I.coral})]},e))})}var Q=70;function _e({sim:e,amount:t}){let n=(0,O.useRef)(null),r=(0,O.useMemo)(()=>{let e=new Float32Array(210);for(let t=0;t<Q;t++)e[t*3]=A.x0+Math.random()*A.W,e[t*3+1]=P+Math.random()*8,e[t*3+2]=A.z0+Math.random()*A.L;return{p:e,m:new C}},[]);return x((i,a)=>{let o=Math.min(a,1/30),s=t.current??0,c=n.current;if(!c||(c.visible=s>.02,!c.visible))return;let l=Math.round(Q*s);for(let t=0;t<Q;t++){let n=r.p[t*3+1]-o*11;if(r.p[t*3]+=o*.6,n<P){let i=r.p[t*3],a=r.p[t*3+2];t<l&&i>A.x0&&i<j&&e.drops.push([(i-A.x0)/A.W,1-(a-A.z0)/A.L,.018,.022]),n+=8,r.p[t*3]=A.x0-.4+Math.random()*A.W,r.p[t*3+2]=A.z0+Math.random()*A.L}r.p[t*3+1]=n;let i=+(t<l);r.m.makeScale(i,i,i).setPosition(r.p[t*3],n+.2,r.p[t*3+2]),c.setMatrixAt(t,r.m)}c.instanceMatrix.needsUpdate=!0}),(0,k.jsxs)(`instancedMesh`,{ref:n,args:[void 0,void 0,Q],frustumCulled:!1,raycast:()=>null,children:[(0,k.jsx)(`boxGeometry`,{args:[.018,.42,.018]}),(0,k.jsx)(`meshBasicMaterial`,{color:`#ffffff`,transparent:!0,opacity:.75})]})}function ve({sim:e,mode:t}){let n=(0,O.useMemo)(()=>({next:1.2,cat:0}),[]);return x((r,i)=>{let a=Math.min(i,1/30),o=r.clock.elapsedTime,s=t.current;e.drops.push([Math.random(),Math.random(),.05,(Math.random()-.5)*.0024]),s===`calm`&&o>n.next&&(n.next=o+2.2+Math.random()*2.2,e.drops.push([.12+Math.random()*.62,.12+Math.random()*.76,.03,.04])),s===`wind`&&(n.cat+=a,n.cat>.05&&(n.cat=0,e.drops.push([.1+Math.random()*.8,Math.random(),.025,(Math.random()-.5)*.02])))}),null}function ye(){let e=(0,O.useMemo)(()=>{let e=new h(`#fff4e6`,1.6);e.position.set(-4,11,7),e.castShadow=!0,e.shadow.mapSize.set(2048,2048);let t=e.shadow.camera;return t.left=t.bottom=-10,t.right=t.top=10,t.near=.5,t.far=40,e.shadow.bias=-5e-4,e.shadow.normalBias=.02,e},[]);return(0,k.jsxs)(k.Fragment,{children:[(0,k.jsx)(`ambientLight`,{intensity:1.55,color:`#fff4ec`}),(0,k.jsx)(`hemisphereLight`,{args:[`#fffaf2`,`#d7a7b3`,.6]}),(0,k.jsx)(`primitive`,{object:e})]})}function be({mode:e,wind:t,rain:n,flex:r,ctl:i,simOut:a}){let o=(0,O.useRef)(null),s=B(e,t);a.current=s,(0,O.useEffect)(()=>{s.drops.push([.3,.55,.05,.09],[.62,.3,.04,.07],[.5,.8,.035,.06])},[s]);let c=(0,O.useRef)(null);return x(e=>{c.current&&(c.current.position.y=Math.sin(e.clock.elapsedTime*.7)*.08)}),(0,k.jsxs)(`group`,{ref:c,children:[(0,k.jsx)(U,{}),(0,k.jsx)(ue,{}),(0,k.jsx)(V,{sim:s,rain:n,burst:o}),(0,k.jsx)(pe,{x:-1.6}),(0,k.jsx)(me,{flex:r,ctl:i,sim:s,burst:o}),(0,k.jsx)(he,{api:o}),(0,k.jsx)(W,{p:[3.3,0,-.9]}),(0,k.jsx)(W,{p:[4.6,0,-.9]}),(0,k.jsx)(fe,{p:[4,0,-3.15],wind:t}),(0,k.jsx)(G,{p:[5.1,0,2.9],s:1.05,wind:t}),(0,k.jsx)(G,{p:[-5.25,0,-3.8],s:.9,wind:t}),(0,k.jsx)(K,{p:[-5.3,0,3.6],h:1}),(0,k.jsx)(K,{p:[-4.7,0,3.95],h:.7}),(0,k.jsx)(K,{p:[5.3,0,-4],h:.85}),(0,k.jsx)(H,{p:[3,.02,2.6],s:[1.1,.04,.6],c:I.sun,cast:!1}),(0,k.jsx)(H,{p:[3,.045,2.6],s:[1.1,.01,.12],c:`#ffffff`,cast:!1}),(0,k.jsx)(ge,{sim:s,wind:t}),(0,k.jsx)(_e,{sim:s,amount:n}),(0,k.jsx)(ve,{sim:s,mode:e})]})}var $=[{value:`calm`,label:`平静`},{value:`rain`,label:`雨滴`},{value:`wind`,label:`起风`}],xe={calm:`偶尔一滴水落下，圆环一圈圈扩散、撞到池壁再反射回来。`,rain:`几十条雨丝同时落入水面，波纹彼此叠加、干涉，此起彼伏。`,wind:`深水端推出斜向的涌浪，水面被风吹出细碎的波纹，泳圈也被推着走。`};function Se(){let[e,t]=(0,O.useState)(`calm`),n=(0,O.useRef)(`calm`);n.current=e;let o=i(0),s=i(0),c=i(0),l=(0,O.useRef)(0),u=(0,O.useRef)(0),d=(0,O.useRef)(null),f=(0,O.useRef)(E?1/0:-1e9),[p,m]=(0,O.useState)(0);(0,O.useEffect)(()=>o.on(`change`,e=>void(l.current=e)),[o]),(0,O.useEffect)(()=>s.on(`change`,e=>void(u.current=e)),[s]),(0,O.useEffect)(()=>{let t=r(o,e===`wind`?.05:0,{duration:1.6,ease:`easeInOut`}),n=r(s,+(e===`rain`),{duration:1.4,ease:`easeInOut`});return()=>{t.stop(),n.stop()}},[e,o,s]);let h=(0,O.useMemo)(()=>({at:-1}),[]),g=(0,O.useCallback)(()=>{h.at>0&&performance.now()-h.at<3500||(h.at=performance.now(),c.stop(),c.set(0),r(c,[0,-1,.7,-.3,.1,0],{duration:1.1,ease:`easeOut`}),m(e=>e+1))},[c,h]);(0,O.useEffect)(()=>{if(E)return;let e=setInterval(()=>{performance.now()-f.current<1e4||document.hidden||t(e=>$[($.findIndex(t=>t.value===e)+1)%$.length].value)},9e3),r=setInterval(()=>{performance.now()-f.current<1e4||document.hidden||n.current===`calm`&&g()},5200);return()=>{clearInterval(e),clearInterval(r)}},[g]),(0,O.useEffect)(()=>()=>void(document.body.style.cursor=``),[]);let _=()=>void(f.current=performance.now());return(0,k.jsxs)(`div`,{className:`stage rp-root rp-${e}`,style:{background:`linear-gradient(180deg, #eaf6f4 0%, #f5f0e8 55%, #f7e2d8 100%)`},children:[(0,k.jsx)(a.div,{"aria-hidden":!0,className:`rp-rainsky`,animate:{opacity:+(e===`rain`)},transition:{duration:1.4}}),(0,k.jsx)(`div`,{"aria-hidden":!0,className:`rp-sun`}),(0,k.jsxs)(T,{orthographic:!0,flat:!0,shadows:!0,dpr:[1,2],camera:{near:.1,far:300},gl:{antialias:!0,alpha:!0},onPointerDown:_,children:[(0,k.jsx)(re,{fit:21.5,mobileFit:16.6,mobileOffsetY:.13,offset:[.2,-.02],target:[0,-1.1,0]}),(0,k.jsx)(ye,{}),(0,k.jsx)(be,{mode:n,wind:l,rain:u,flex:c,ctl:h,simOut:d})]}),(0,k.jsxs)(`div`,{className:`overlay`,children:[(0,k.jsxs)(a.div,{className:`hero-copy`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.7,delay:.2,ease:[.23,1,.32,1]},children:[(0,k.jsx)(`div`,{className:`scrim`}),(0,k.jsxs)(`p`,{className:`kicker`,children:[(0,k.jsx)(`i`,{style:{background:`#2fb3c4`}}),` Isometric · Heightfield`]}),(0,k.jsxs)(`h1`,{children:[`一池`,(0,k.jsx)(`br`,{}),`会回应的水`]}),(0,k.jsxs)(`p`,{children:[(0,k.jsx)(`span`,{className:`rp-tech`,children:`水面是一张 256×256 的实时高度场，按波动方程以 60 Hz 推进；池底瓷砖随法线折射晃动，焦散光斑在波峰下聚拢。`}),(0,k.jsx)(a.span,{className:`rp-mode-line`,initial:{opacity:0,y:4},animate:{opacity:1,y:0},transition:{duration:.4},children:xe[e]},e)]}),(0,k.jsxs)(`div`,{className:`hero-actions`,children:[(0,k.jsx)(`button`,{className:`btn primary`,onClick:()=>{_(),g()},children:`跳水`}),(0,k.jsx)(`button`,{className:`btn`,onClick:()=>{_(),d.current?.clear()},children:`抚平水面`})]}),(0,k.jsxs)(`p`,{className:`rp-meta`,children:[`已跳水 `,p,` 次`]})]}),(0,k.jsxs)(`div`,{className:`dock`,children:[(0,k.jsx)(ie,{items:$,value:e,onChange:e=>{_(),t(e)}}),(0,k.jsx)(`span`,{className:`dock-sep`}),(0,k.jsx)(`button`,{className:`seg`,onClick:()=>{_(),g()},children:(0,k.jsx)(`span`,{children:`跳水`})})]}),(0,k.jsx)(`p`,{className:`hint`,children:`点击或拖过水面 · 激起涟漪`})]}),(0,k.jsx)(`style`,{children:`
        .rp-root { --soft-bg: #f2f3ee; }
        .rp-rainsky { position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(180deg, #dfe9ec 0%, #e8ecea 55%, #e9dcd8 100%); }
        .rp-sun { position: absolute; right: 15%; top: 9%; width: min(30vw, 400px); aspect-ratio: 1; border-radius: 50%; pointer-events: none;
          background: radial-gradient(circle, #fff6df 0%, #fdf0d8 45%, transparent 70%); transition: opacity 1.4s; }
        .rp-rain .rp-sun { opacity: .35; }
        .rp-mode-line { display: block; margin-top: 10px; color: var(--fg); opacity: .8; }
        .rp-meta { margin-top: 14px !important; font: 12px/1 var(--mono) !important; color: var(--fg-2); }
        @media (max-width: 760px) {
          .rp-root .hero-copy > p:not(.kicker):not(.rp-meta) { font-size: 14px; line-height: 1.6; margin-top: 14px; }
          .rp-tech { display: none; }
          .rp-mode-line { margin-top: 0; }
          .rp-meta { display: none; }
          .rp-sun { right: 4%; top: 8%; width: 50vw; }
        }
      `})]})}export{Se as default};