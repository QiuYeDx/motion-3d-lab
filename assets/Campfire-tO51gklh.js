import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CX_WDEyT.js";import{t as i}from"./use-spring-BV8nDvvz.js";import{n as a,r as o}from"./index-uImfd-0P.js";import{$t as s,Ft as c,J as l,Jt as u,Kt as d,Mt as f,N as p,O as m,Ot as h,P as g,Q as _,R as v,St as y,T as b,Wt as x,_n as S,bn as C,dt as w,gn as T,h as E,it as D,pt as O,qt as k,rt as ee,u as A,vt as j,w as te,xt as ne,yt as M,zt as N}from"./events-9ce18a08.esm-BkDjjFw8.js";import{t as P}from"./react-three-fiber.esm-BQtD7wyt.js";import{t as F}from"./BufferGeometryUtils-B9M8crG1.js";import{n as I}from"./iso-C377rVhz.js";import{t as re}from"./Seg-BfWvO_Xs.js";import{t as ie}from"./PerformanceMonitor-DPWwL5ZK.js";import{t as L}from"./glsl-CTWV-b_3.js";import{t as ae}from"./precompile-DQa1gWiJ.js";var R=e(t(),1),oe=`
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float h13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`,se=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,ce=`
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime, uHeight, uWidth, uLean, uFlare, uInt;
${L}

vec3 ramp(float T) {
  vec3 c = mix(vec3(0.0), vec3(0.55, 0.04, 0.005), smoothstep(0.0, 0.22, T));
  c = mix(c, vec3(2.2, 0.55, 0.06), smoothstep(0.18, 0.5, T));
  c = mix(c, vec3(4.0, 2.1, 0.45), smoothstep(0.45, 0.8, T));
  c = mix(c, vec3(5.5, 4.6, 2.6), smoothstep(0.8, 1.25, T));
  return c;
}

void main() {
  vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
  float t = uTime;
  float h = uHeight * (1.0 + 0.45 * uFlare) * (1.0 - 0.22 * abs(uLean));
  float y = p.y;
  // wind: the whole flame leans, more at the top
  float x = p.x - uLean * pow(max(y, 0.0), 1.3) * 0.42;
  vec3 q = vec3(x * 3.4, y * 2.3 - t * 2.7, t * 0.5);
  float n = snoise(q) * 0.55 + snoise(q * 2.13 + vec3(1.7, -t * 1.1, 4.0)) * 0.3 + snoise(q * 4.4 + vec3(3.1, -t * 2.0, 9.0)) * 0.15;
  float yh = y / h;
  x += n * 0.085 * (0.25 + yh) * uWidth;

  float body = 0.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float r = fract(sin(fk * 91.37) * 437.53);
    float cx = (fk - 2.0) * 0.12 * uWidth + sin(t * (1.1 + r) + fk * 2.1) * 0.03;
    float hk = h * (0.55 + 0.45 * r + 0.25 * step(1.5, fk) * step(fk, 2.5)) * (0.86 + 0.14 * sin(t * (3.1 + fk * 0.7) + fk * 4.0) + 0.06 * sin(t * 7.3 + fk));
    float yn = y / hk;
    float w = (0.15 + 0.05 * r) * uWidth * pow(max(1.0 - yn, 0.0), 0.62) * smoothstep(-0.12, 0.08, yn);
    float d = abs(x - cx * (1.0 - yn * 0.7)) / max(w, 1e-3);
    body = max(body, max(1.0 - d, 0.0) * max(1.0 - yn * 0.85, 0.0));
  }
  // noise only lives in the flame column: it frays the edges and tears licks off the tips
  float colW = 0.26 * uWidth * (1.0 - 0.45 * clamp(yh, 0.0, 1.0));
  float column = exp(-x * x / (colW * colW)) * (1.0 - smoothstep(0.7, 1.35, yh));
  float f = body * (1.0 + 0.5 * n) + n * 0.3 * column * smoothstep(-0.05, 0.25, yh) - 0.04;
  f = max(f, (n * 0.95 - 0.42) * column * smoothstep(0.35, 0.85, yh));
  float T = clamp(f * 1.45, 0.0, 1.4);
  vec3 c = ramp(T) * smoothstep(0.0, 0.18, f);
  // a little blue at the root, where the gas is hottest and leanest
  c += vec3(0.05, 0.12, 0.6) * smoothstep(0.12, 0.0, y) * smoothstep(0.2, 0.6, body) * 0.8;
  c *= smoothstep(0.0, 0.05, y + 0.02);
  gl_FragColor = vec4(c * uInt, 1.0);
}
`,le=`
varying vec2 vUv;
uniform float uInt;
void main() {
  vec2 p = vUv - 0.5;
  p.y *= 1.2;
  float r2 = dot(p, p);
  vec3 c = vec3(1.0, 0.36, 0.07) * (exp(-r2 * 30.0) * 0.32 + exp(-r2 * 14.0) * 0.08);
  gl_FragColor = vec4(c * uInt * (1.0 - smoothstep(0.08, 0.25, r2)), 1.0);
}
`,ue=`
varying vec2 vUv;
uniform vec2 uSize;
uniform float uTime, uLean, uAmt, uBase;
${L}
void main() {
  vec2 p = (vUv - vec2(0.5, 0.0)) * uSize;
  float y = p.y;
  float yr = y / uSize.y;
  float wy = y + uBase;
  float x = p.x - uLean * pow(max(wy, 0.0), 1.45) * 0.42 + 0.06 * sin(y * 1.3 - uTime * 0.6);
  float t = uTime;
  float n = snoise(vec3(x * 1.7, y * 1.05 - t * 0.5, t * 0.13)) * 0.65 + snoise(vec3(x * 4.0, y * 2.6 - t * 0.9, t * 0.3 + 5.0)) * 0.35;
  float w = 0.13 + y * 0.2;
  float dens = exp(-(x * x) / (w * w)) * smoothstep(0.0, 0.18, yr) * (1.0 - smoothstep(0.45, 1.0, yr));
  dens *= smoothstep(-0.35, 0.6, n);
  float a = clamp(dens * 0.45 * uAmt, 0.0, 1.0);
  vec3 col = mix(vec3(0.32, 0.13, 0.05), vec3(0.04, 0.045, 0.06), smoothstep(0.0, 0.35, yr));
  gl_FragColor = vec4(col, a);
}
`,de=`
attribute vec4 aSeed;
uniform float uTime, uRate, uLean, uBurstT, uBurstAmt, uMode, uPx, uLift, uInt;
varying float vA;
varying float vHeat;
void main() {
  float life = 1.4 + aSeed.y * 2.2;
  float u;
  if (uMode < 0.5) {
    u = fract((uTime + aSeed.x * 41.0) / life);
    if (aSeed.x > uRate) u = 2.0;
  } else {
    life *= 0.9;
    u = (uTime - uBurstT - aSeed.x * 0.55) / life;
    if (fract(aSeed.x * 13.1) > uBurstAmt) u = 2.0;
  }
  if (u < 0.0 || u > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vHeat = 0.0;
    return;
  }
  float t = u * life;
  float ang = aSeed.z * 6.2831853;
  float r0 = 0.04 + 0.2 * fract(aSeed.w * 7.3);
  vec3 p = vec3(cos(ang) * r0, 0.18 + 0.2 * fract(aSeed.y * 5.1), sin(ang) * r0);
  float vy = (0.65 + 1.25 * aSeed.w) * uLift * (uMode > 0.5 ? 1.35 : 1.0);
  p.y += vy * t - 0.05 * t * t;
  // burst sparks are flung outwards a little before the updraft takes them
  float out1 = uMode > 0.5 ? 0.35 * (1.0 - exp(-t * 3.0)) : 0.0;
  p.x += cos(ang) * out1;
  p.z += sin(ang) * out1;
  // turbulence: wobbling corkscrews that widen as they rise, and the wind
  p.x += sin(t * (2.2 + aSeed.w * 3.0) + aSeed.z * 17.0) * 0.1 * t + uLean * 0.55 * t * t;
  p.z += cos(t * (1.7 + aSeed.y * 2.5) + aSeed.x * 23.0) * 0.1 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.01 + 0.016 * aSeed.y) * (1.0 - u * 0.55);
  float px = size * uPx / -mv.z;
  gl_PointSize = max(px, 1.6);
  // sub-pixel sparks keep their energy instead of shimmering
  float tw = 0.65 + 0.35 * sin(uTime * (18.0 + aSeed.x * 20.0) + aSeed.z * 40.0);
  vA = (1.0 - u) * smoothstep(0.0, 0.04, u) * tw * min(1.0, px / 1.6) * uInt;
  vHeat = 1.0 - u;
}
`,fe=`
varying float vA;
varying float vHeat;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 3.0) * smoothstep(1.0, 0.6, r);
  vec3 c = mix(vec3(1.4, 0.18, 0.02), vec3(5.0, 2.6, 0.7), vHeat * vHeat);
  gl_FragColor = vec4(c * a * vA * 1.6, 1.0);
}
`,pe=`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`,me=`
varying vec3 vDir;
uniform float uTime, uPix;
${oe}
void main() {
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 c = mix(vec3(0.03, 0.03, 0.05), vec3(0.006, 0.009, 0.022), smoothstep(-0.02, 0.45, e));
  // the treeline glows faintly where a distant town would be, and around the fire's side of the sky
  c += vec3(0.05, 0.025, 0.02) * exp(-max(e, 0.0) * 9.0) * 0.6;
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 70.0 : 170.0;
    vec3 sp = d * sc;
    vec3 id = floor(sp);
    vec3 f = fract(sp) - 0.5;
    float h = h13(id + float(L) * 13.0);
    if (h > (L == 0 ? 0.92 : 0.9)) {
      vec3 off = (vec3(h13(id + 1.3), h13(id + 2.7), h13(id + 5.1)) - 0.5) * 0.5;
      float dd = length(f - off);
      float cellPx = (1.0 / sc) / uPix;
      float r = max(0.7 / cellPx, 0.05);
      float m = h13(id + 9.1);
      float mag = (L == 0 ? 0.6 + 3.0 * m * m * m : 0.35 + 0.5 * m) * (L == 0 ? 1.0 : smoothstep(1.6, 3.4, cellPx));
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + h * 4.0) + h * 70.0);
      vec3 tint = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h13(id + 4.4));
      c += tint * exp(-dd * dd / (r * r)) * mag * tw * 0.5 / max(r * cellPx, 0.7) * smoothstep(0.02, 0.2, e);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}
`,he=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,ge=`
varying vec2 vUv;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec2 uFireA;
uniform vec2 uFireB;
uniform float uHazeW, uHaze, uTime, uFade, uExposure, uBloom;
${oe}
${L}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 uv = vUv;
  // heat haze: a column of rising refraction above the flames (screen space)
  float aspect = uRes.x / uRes.y;
  float span = max(uFireB.y - uFireA.y, 0.02);
  float yy = (uv.y - uFireA.y) / span;
  float dx = (uv.x - mix(uFireA.x, uFireB.x, clamp(yy, 0.0, 1.0))) * aspect / max(uHazeW, 0.01);
  float m = exp(-dx * dx * 2.2) * smoothstep(0.35, 0.95, yy) * (1.0 - smoothstep(1.6, 3.4, yy));
  vec2 off = vec2(0.0);
  if (m > 0.002) {
    vec2 hp = vec2(uv.x * aspect, uv.y) / max(uHazeW, 0.05);
    off.x = snoise(vec3(hp * vec2(7.0, 4.5) - vec2(0.0, uTime * 2.2), uTime * 0.7));
    off.y = snoise(vec3(hp * vec2(6.0, 4.0) - vec2(0.0, uTime * 2.6), uTime * 0.7 + 9.0));
    off *= m * uHaze * 0.008;
  }
  vec3 col = textureLod(tScene, uv + off, 0.0).rgb;
  // bloom from the target's own mip chain (flames, embers, sparks are the only HDR > 1 things)
  vec3 b = textureLod(tScene, uv, 3.0).rgb * 0.45 + textureLod(tScene, uv, 4.5).rgb * 0.35 + textureLod(tScene, uv, 6.0).rgb * 0.3;
  col += max(b - 0.08, 0.0) * uBloom;
  col = aces(col * uExposure);
  col = toSRGB(col);
  vec2 sv = uv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.7;
  col += (h12(gl_FragCoord.xy + fract(uTime) * 71.0) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uFade, uFade);
}
`,z=`
#include <emissivemap_fragment>
{
  vec2 eu = vEmissiveMapUv;
  float pulse = 0.55 + 0.45 * sin(uEmberTime * 2.3 + eu.x * 31.0 + eu.y * 17.0) * sin(uEmberTime * 1.3 + eu.y * 23.0 - eu.x * 7.0);
  totalEmissiveRadiance *= pulse * uEmberGain;
}
`;function B(e){let t=e>>>0;return()=>(t=t*1664525+1013904223>>>0,t/4294967296)}function V(e,t){let n=document.createElement(`canvas`);return n.width=e,n.height=t,[n,n.getContext(`2d`)]}function H(e,t=!0,n=!1){let r=new m(e);return t&&(r.colorSpace=d),r.anisotropy=4,r.wrapS=n?r.wrapT=x:x,r}function U(){let e=B(7),[t,n]=V(256,512),[r,i]=V(256,512);n.fillStyle=`#4b3527`,n.fillRect(0,0,256,512);for(let t=0;t<160;t++){let t=e()*256,r=1+e()*4;n.strokeStyle=e()<.5?`#2c1f17`:`#6a4d38`,n.globalAlpha=.35+e()*.45,n.lineWidth=r,n.beginPath();let i=t;n.moveTo(i,0);for(let t=0;t<=512;t+=24)i+=(e()-.5)*6,n.lineTo(i,t);n.stroke()}n.globalAlpha=1;let a=n.createLinearGradient(0,0,0,256);a.addColorStop(0,`rgba(10,8,7,1)`),a.addColorStop(.55,`rgba(18,13,10,0.95)`),a.addColorStop(1,`rgba(25,18,14,0)`),n.fillStyle=a,n.fillRect(0,0,256,256),i.fillStyle=`#000`,i.fillRect(0,0,256,512),i.shadowColor=`#ff7a20`;for(let t=0;t<260;t++){let t=e()**1.6*512*.42,r=e()*256,a=1-t/215.04,o=e()<.55,s=6+e()*18;n.strokeStyle=`#050403`,n.lineWidth=1.5+e()*1.5,n.beginPath(),n.moveTo(r,t),n.lineTo(o?r+s:r+(e()-.5)*3,o?t+(e()-.5)*3:t+s),n.stroke();let c=Math.floor(150+105*a);i.strokeStyle=`rgb(${c}, ${Math.floor(c*.42*a+20)}, 10)`,i.globalAlpha=.35+.65*a,i.shadowBlur=6,i.lineWidth=1+e()*1.6,i.beginPath(),i.moveTo(r,t),i.lineTo(o?r+s:r+(e()-.5)*3,o?t+(e()-.5)*3:t+s),i.stroke()}i.globalAlpha=1,i.shadowBlur=0;let o=i.createLinearGradient(0,0,0,40);return o.addColorStop(0,`rgba(255,120,30,0.9)`),o.addColorStop(1,`rgba(255,60,10,0)`),i.fillStyle=o,i.fillRect(0,0,256,40),{map:H(t),emissive:H(r)}}function W(){let e=B(11),[t,n]=V(128,128);n.fillStyle=`#1a0d07`,n.fillRect(0,0,128,128);for(let t=0;t<90;t++){let t=3+e()*9,r=e()*128,i=e()*128,a=n.createRadialGradient(r,i,0,r,i,t),o=e();a.addColorStop(0,o>.5?`rgba(255,190,90,1)`:`rgba(255,100,30,1)`),a.addColorStop(1,`rgba(120,20,0,0)`),n.fillStyle=a,n.fillRect(r-t,i-t,t*2,t*2)}let[r,i]=V(128,128);i.fillStyle=`#9a7650`,i.fillRect(0,0,128,128);for(let t=4;t<64;t+=3+e()*3)i.strokeStyle=e()<.5?`rgba(90,60,38,0.7)`:`rgba(150,115,80,0.6)`,i.lineWidth=1+e(),i.beginPath(),i.arc(64+(e()-.5)*2,64+(e()-.5)*2,t,0,Math.PI*2),i.stroke();return i.strokeStyle=`#3a271a`,i.lineWidth=6,i.beginPath(),i.arc(64,64,61,0,Math.PI*2),i.stroke(),{ember:H(t),wood:H(r)}}function G(){let e=B(23),[t,n]=V(512,512);n.fillStyle=`#231c15`,n.fillRect(0,0,512,512);for(let t=0;t<2600;t++){let t=e()*512,r=e()*512,i=1+e()*5,a=e();n.fillStyle=a<.4?`rgba(15,11,8,0.5)`:a<.75?`rgba(52,40,28,0.45)`:`rgba(40,46,28,0.45)`,n.beginPath(),n.arc(t,r,i,0,Math.PI*2),n.fill()}n.lineCap=`round`;for(let t=0;t<1400;t++){let t=e()*512,r=e()*512,i=e()*Math.PI,a=4+e()*9;n.strokeStyle=e()<.5?`rgba(92,66,40,0.55)`:`rgba(60,44,28,0.6)`,n.lineWidth=.8+e()*.6,n.beginPath(),n.moveTo(t,r),n.lineTo(t+Math.cos(i)*a,r+Math.sin(i)*a),n.stroke()}for(let t=0;t<160;t++){let t=e()*512,r=e()*512;for(let i=0;i<7;i++){let i=-Math.PI/2+(e()-.5)*1.6,a=5+e()*10;n.strokeStyle=e()<.5?`rgba(58,70,36,0.7)`:`rgba(84,90,48,0.6)`,n.lineWidth=1,n.beginPath(),n.moveTo(t,r),n.lineTo(t+Math.cos(i)*a,r+Math.sin(i)*a),n.stroke()}}return H(t,!0,!0)}function _e(){let e=B(31),[t,n]=V(256,256),[r,i]=V(256,256),a=n.createRadialGradient(128,128,0,128,128,128);a.addColorStop(0,`#2a2522`),a.addColorStop(.6,`#3a3430`),a.addColorStop(.92,`rgba(40,34,30,0.6)`),a.addColorStop(1,`rgba(35,28,21,0)`),n.fillStyle=a,n.fillRect(0,0,256,256),i.fillStyle=`#000`,i.fillRect(0,0,256,256);for(let t=0;t<260;t++){let t=e()*Math.PI*2,r=Math.sqrt(e())*256*.36,a=128+Math.cos(t)*r,o=128+Math.sin(t)*r,s=2+e()*6;if(n.fillStyle=e()<.6?`#0d0b0a`:`#57504a`,n.beginPath(),n.arc(a,o,s,0,Math.PI*2),n.fill(),e()<.55){let e=1-r/92.16,t=i.createRadialGradient(a,o,0,a,o,s*1.6);t.addColorStop(0,`rgba(255,${Math.floor(90+110*e)},30,${.5+.5*e})`),t.addColorStop(1,`rgba(160,30,0,0)`),i.fillStyle=t,i.fillRect(a-s*2,o-s*2,s*4,s*4)}}return{map:H(t),emissive:H(r)}}function ve(){let e=B(41),[t,n]=V(128,128);n.fillStyle=`#b8582a`,n.fillRect(0,0,128,128);for(let t=0;t<128;t+=2)n.fillStyle=`rgba(0,0,0,${.03+e()*.05})`,n.fillRect(0,t,128,1);for(let t=0;t<128;t+=2)n.fillStyle=`rgba(255,255,255,${.02+e()*.03})`,n.fillRect(t,0,1,128);return H(t,!0,!0)}var K=n(),ye=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,q=new S(0,.62,0),J=.38,be=.2,xe=1.7,Se=2.7,Ce=2.6,we=4.2,Te=.85,Ee=320,De=200,Oe=70,Y=[{zh:`小火`,en:`Embers`,height:.5,width:.78,light:3.2,rate:.22,int:.85,smoke:.75,ember:1.25},{zh:`中火`,en:`Steady`,height:1,width:1.05,light:6,rate:.5,int:1,smoke:1,ember:1},{zh:`旺火`,en:`Roaring`,height:1.38,width:1.24,light:10,rate:1,int:1.15,smoke:1.3,ember:1.1}],ke=[`height`,`width`,`light`,`rate`,`int`,`smoke`,`ember`];function Ae(e){return e}function X(e){let t=new D(1,1),n=t.attributes.position,r=new S,i=t=>{let n=Math.sin(t*127.1+e*311.7)*43758.5453;return n-Math.floor(n)};for(let e=0;e<n.count;e++){r.fromBufferAttribute(n,e);let t=Math.round(r.x*100)*7+Math.round(r.y*100)*13+Math.round(r.z*100)*17;r.multiplyScalar(.82+.3*i(t)),n.setXYZ(e,r.x,r.y,r.z)}return t.computeVertexNormals(),t}function je(){let e=[],t=new v(.07,.1,.8,6);t.translate(0,.4,0),e.push(t);for(let[t,n,r]of[[.95,1.5,.65],[.75,1.3,1.35],[.55,1.1,1.95],[.33,.9,2.5]]){let i=new g(t,n,7);i.translate(0,r+n/2-.2,0),e.push(i)}let n=F(e.map(e=>e.toNonIndexed()));return n.computeVertexNormals(),n}function Me(){let e=.78,t=1.08,n=-1.7/2,r=1.7/2,i=[],a=(e,t,n,r)=>i.push(...e,...t,...n,...e,...n,...r),o=(e,t,n)=>i.push(...e,...t,...n);a([-.78,0,n],[-.78,0,r],[0,t,r],[0,t,n]),a([e,0,r],[e,0,n],[0,t,n],[0,t,r]),o([-.78,0,n],[0,t,n],[e,0,n]),o([-.78,0,r],[-.1,0,.9],[0,t,r]),o([e,0,r],[0,t,r],[.42,0,1.13]);let s=new b;s.setAttribute(`position`,new _(i,3));let c=[];for(let e=0;e<i.length;e+=3)c.push(i[e]*1.5+i[e+2]*1.5,i[e+1]*1.5);s.setAttribute(`uv`,new _(c,2)),s.computeVertexNormals();let l=new b;return l.setAttribute(`position`,new _([-.78*.9,.02,-.82,0,t*.94,-.82,e*.9,.02,-.82],3)),l.computeVertexNormals(),{shell:s,inner:l}}function Ne(e,t,n){return e.onBeforeCompile=e=>{e.uniforms.uEmberTime=t.uEmberTime,e.uniforms.uEmberGain=t.uEmberGain,e.fragmentShader=`uniform float uEmberTime;
uniform float uEmberGain;
`+e.fragmentShader.replace(`#include <emissivemap_fragment>`,z)},e.customProgramCacheKey=()=>n,e}var Z=new S(0,1,0);function Q({a:e,b:t,r:n,mat:r}){let{pos:i,quat:a,len:o}=(0,R.useMemo)(()=>{let n=new S(...e),r=new S(...t),i=r.clone().sub(n),a=i.length();return{pos:n.add(r).multiplyScalar(.5),quat:new N().setFromUnitVectors(Z,i.normalize()),len:a}},[e.join(),t.join()]);return(0,K.jsx)(`mesh`,{position:i,quaternion:a,material:r,castShadow:!0,receiveShadow:!0,children:(0,K.jsx)(`capsuleGeometry`,{args:[n,o,2,7]})})}function Pe({at:e,seat:t,jacket:n,pants:r,hat:i,scarf:a,pose:o,M:s}){let c=Math.atan2(-e[0],-e[1]),l=t+.07,u=o===`mug`?(0,K.jsxs)(K.Fragment,{children:[(0,K.jsx)(Q,{a:[.19,l+.45,.07],b:[.21,l+.22,.23],r:.055,mat:n}),(0,K.jsx)(Q,{a:[.21,l+.22,.23],b:[.06,l+.31,.36],r:.05,mat:n}),(0,K.jsx)(Q,{a:[-.19,l+.45,.07],b:[-.21,l+.22,.23],r:.055,mat:n}),(0,K.jsx)(Q,{a:[-.21,l+.22,.23],b:[-.06,l+.31,.36],r:.05,mat:n}),(0,K.jsx)(`mesh`,{position:[0,l+.33,.4],material:s.enamel,castShadow:!0,children:(0,K.jsx)(`cylinderGeometry`,{args:[.042,.038,.1,12]})}),(0,K.jsx)(`mesh`,{position:[0,l+.378,.4],"rotation-x":-Math.PI/2,material:s.coffee,children:(0,K.jsx)(`circleGeometry`,{args:[.036,12]})})]}):(0,K.jsxs)(K.Fragment,{children:[(0,K.jsx)(Q,{a:[-.19,l+.45,.07],b:[-.22,l+.26,.28],r:.055,mat:n}),(0,K.jsx)(Q,{a:[-.22,l+.26,.28],b:[-.12,l+.32,.52],r:.05,mat:n}),(0,K.jsx)(Q,{a:[.19,l+.45,.07],b:[.21,l+.22,.22],r:.055,mat:n}),(0,K.jsx)(Q,{a:[.21,l+.22,.22],b:[.12,l+.1,.42],r:.05,mat:n}),(0,K.jsx)(`mesh`,{position:[-.12,l+.32,.52],material:s.skin,children:(0,K.jsx)(`icosahedronGeometry`,{args:[.042,0]})}),(0,K.jsx)(Q,{a:[-.12,l+.3,.5],b:[-.06,l+.6,1.5],r:.009,mat:s.stick}),(0,K.jsx)(`mesh`,{position:[-.06,l+.61,1.52],material:s.marsh,children:(0,K.jsx)(`cylinderGeometry`,{args:[.028,.028,.05,8]})})]});return(0,K.jsxs)(`group`,{position:[e[0],0,e[1]],"rotation-y":c,children:[(0,K.jsx)(`mesh`,{position:[0,l,0],scale:[1,.62,.95],material:r,castShadow:!0,children:(0,K.jsx)(`icosahedronGeometry`,{args:[.17,1]})}),(0,K.jsx)(`mesh`,{position:[0,l+.27,.03],"rotation-x":.18,material:n,castShadow:!0,receiveShadow:!0,children:(0,K.jsx)(`cylinderGeometry`,{args:[.15,.185,.52,7]})}),(0,K.jsx)(`mesh`,{position:[0,l+.53,.08],"rotation-x":Math.PI/2+.18,material:a,castShadow:!0,children:(0,K.jsx)(`torusGeometry`,{args:[.085,.038,6,10]})}),(0,K.jsx)(`mesh`,{position:[0,l+.68,.11],material:s.skin,castShadow:!0,children:(0,K.jsx)(`icosahedronGeometry`,{args:[.112,1]})}),(0,K.jsx)(`mesh`,{position:[0,l+.71,.1],"rotation-x":-.25,material:i,castShadow:!0,children:(0,K.jsx)(`sphereGeometry`,{args:[.122,9,6,0,Math.PI*2,0,Math.PI*.52]})}),(0,K.jsx)(`mesh`,{position:[0,l+.84,.07],material:i,children:(0,K.jsx)(`icosahedronGeometry`,{args:[.034,0]})}),(0,K.jsx)(Q,{a:[.09,l,.03],b:[.1,l+.03,.4],r:.075,mat:r}),(0,K.jsx)(Q,{a:[-.09,l,.03],b:[-.1,l+.03,.4],r:.075,mat:r}),(0,K.jsx)(Q,{a:[.1,l+.02,.42],b:[.12,.08,.5],r:.062,mat:r}),(0,K.jsx)(Q,{a:[-.1,l+.02,.42],b:[-.12,.08,.5],r:.062,mat:r}),(0,K.jsx)(`mesh`,{position:[.12,.045,.55],material:s.boot,castShadow:!0,children:(0,K.jsx)(`boxGeometry`,{args:[.11,.09,.22]})}),(0,K.jsx)(`mesh`,{position:[-.12,.045,.55],material:s.boot,castShadow:!0,children:(0,K.jsx)(`boxGeometry`,{args:[.11,.09,.22]})}),u]})}function Fe(e){let t=(0,R.useMemo)(()=>{let t={uEmberTime:{value:0},uEmberGain:{value:1}},n=e=>new h({roughness:.9,flatShading:!0,...e}),r=Ne(new h({map:e.bark.map,emissiveMap:e.bark.emissive,emissive:new p(`#ff6a1c`),emissiveIntensity:3,roughness:.95}),t,`cf-bark`),i=Ne(new h({map:e.caps.ember,emissiveMap:e.caps.ember,emissive:new p(`#ff7a2a`),emissiveIntensity:3.2,roughness:1}),t,`cf-cap`),a=new h({map:e.caps.wood,roughness:.9}),o=new h({map:e.bark.map,color:`#b9a493`,roughness:.95});return o.map=e.bark.map,{ember:t,bark:r,emberCap:i,woodCap:a,plainBark:o,ash:Ne(new h({map:e.ash.map,emissiveMap:e.ash.emissive,emissive:new p(`#ff5a14`),emissiveIntensity:2.4,transparent:!0,depthWrite:!1,roughness:1}),t,`cf-ash`),ground:new h({map:e.ground,roughness:1,color:`#d8ccc0`}),stone:n({color:`#77716b`,roughness:.85}),stoneDark:n({color:`#55504b`,roughness:.9}),skin:n({color:`#d9a07a`,roughness:.75}),boot:n({color:`#2a211c`}),stick:n({color:`#7a5a3a`}),marsh:new h({color:`#f4eadb`,emissive:new p(`#ff9a40`),emissiveIntensity:.25,roughness:.7}),enamel:n({color:`#e9e6df`,roughness:.35,flatShading:!1}),enamelRim:n({color:`#1f3550`,roughness:.4}),coffee:n({color:`#2a170c`,roughness:.2}),jacketA:n({color:`#c4432c`}),pantsA:n({color:`#2b3240`}),hatA:n({color:`#e2b23b`}),scarfA:n({color:`#2d7276`}),jacketB:n({color:`#3b6e8f`}),pantsB:n({color:`#3d322b`}),hatB:n({color:`#ddd5c6`}),scarfB:n({color:`#b9442e`}),fabric:new h({map:e.fabric,roughness:.95,side:2,flatShading:!0}),tentGlow:new h({color:`#2a1408`,emissive:new p(`#ffae5a`),emissiveIntensity:.4,side:2}),pine:new h({color:`#0d1712`,roughness:1,flatShading:!0}),lantern:new h({color:`#000`,emissive:new p(`#ffd28a`),emissiveIntensity:4})}},[e]);return(0,R.useEffect)(()=>()=>Object.values(t).forEach(e=>e instanceof j&&e.dispose()),[t]),t}function Ie({T:e,live:t,yaw:n,pitch:i,tossRef:a,onReady:o}){let d=E(e=>e.gl),p=E(e=>e.camera),m=E(e=>e.size),h=E(e=>e.scene),g=Fe(e),_=(0,R.useMemo)(()=>{let e=new v(.072,.08,.86,10,1),t=new v(.07,.074,.72,10,1),n=[X(1),X(2),X(3)],r=je(),i=Me(),a=new v(.15,.16,1.5,10,1),o=new v(.2,.23,.42,10,1),l=new c(xe,Se).translate(0,Se/2,0),u=new c(Ce,we).translate(0,we/2,0),d=new c(2.6,2.6),f=(e,t)=>{let n=new b,r=new Float32Array(e*4),i=t,a=()=>(i=i*16807%2147483647,i/2147483647);for(let t=0;t<e*4;t++)r[t]=a();return n.setAttribute(`position`,new te(new Float32Array(e*3),3)),n.setAttribute(`aSeed`,new te(r,4)),n.boundingSphere=new s(new S(0,2,0),6),n};return{log:e,toss:t,stones:n,pine:r,tent:i,bench:a,stump:o,fire:l,smoke:u,glow:d,sparks:f(Ee,12345),burst:f(De,777)}},[]);(0,R.useEffect)(()=>()=>{for(let e of Object.values(_))Array.isArray(e)?e.forEach(e=>e.dispose()):e instanceof b?e.dispose():Object.values(e).forEach(e=>e.dispose())},[_]);let x=(0,R.useMemo)(()=>{let e={uSize:{value:new T(xe,Se)},uTime:{value:0},uHeight:{value:1},uWidth:{value:1},uLean:{value:0},uFlare:{value:0},uInt:{value:1}},t=new u({vertexShader:se,fragmentShader:ce,uniforms:e,transparent:!0,depthWrite:!1,blending:2}),n=new u({vertexShader:se,fragmentShader:le,uniforms:{uInt:{value:1}},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),r={uSize:{value:new T(Ce,we)},uTime:{value:0},uLean:{value:0},uAmt:{value:1},uBase:{value:Te}},i=new u({vertexShader:se,fragmentShader:ue,uniforms:r,transparent:!0,depthWrite:!1}),a=e=>({uTime:{value:0},uRate:{value:.5},uLean:{value:0},uBurstT:{value:-100},uBurstAmt:{value:1},uMode:{value:e},uPx:{value:800},uLift:{value:1},uInt:{value:1}});return{fire:t,glow:n,smoke:i,spark:new u({vertexShader:de,fragmentShader:fe,uniforms:a(0),transparent:!0,depthWrite:!1,blending:2}),burst:new u({vertexShader:de,fragmentShader:fe,uniforms:a(1),transparent:!0,depthWrite:!1,blending:2}),sky:new u({vertexShader:pe,fragmentShader:me,uniforms:{uTime:{value:0},uPix:{value:.002}},side:1,depthWrite:!1})}},[]);(0,R.useEffect)(()=>()=>Object.values(x).forEach(e=>e.dispose()),[x]);let D=(0,R.useMemo)(()=>{let e=new C(2,2,{type:ee,samples:4,depthBuffer:!0,generateMipmaps:!0,minFilter:O,magFilter:w}),t={tScene:{value:e.texture},uRes:{value:new T(1,1)},uFireA:{value:new T(.5,.4)},uFireB:{value:new T(.5,.6)},uHazeW:{value:.1},uHaze:{value:1},uTime:{value:0},uFade:{value:0},uExposure:{value:1.05},uBloom:{value:.32}},n=new u({vertexShader:he,fragmentShader:ge,uniforms:t,depthTest:!1,depthWrite:!1}),r=new c(2,2),i=new y(r,n);i.frustumCulled=!1;let a=new k;return a.add(i),{fbo:e,uniforms:t,mat:n,geo:r,post:a,cam:new f(-1,1,1,-1,0,1),buf:new T}},[]);(0,R.useEffect)(()=>()=>{D.fbo.dispose(),D.mat.dispose(),D.geo.dispose()},[D]);let j=(0,R.useRef)(null),M=ae(j),P=(0,R.useRef)(!1);(0,R.useEffect)(()=>{let e=!0,t=d.getRenderTarget();return d.setRenderTarget(null),d.compileAsync(D.post,D.cam).catch(()=>{}).then(()=>{e&&(P.current=!0)}),d.setRenderTarget(t),()=>{e=!1}},[d,D]);let F=(0,R.useRef)(!1),re=(0,R.useMemo)(()=>{let e=[];for(let t=0;t<5;t++){let n=t/5*Math.PI*2+.4+Math.sin(t*3.1)*.15,r=.2+t%2*.12,i=new S(-Math.cos(n)*Math.cos(r),Math.sin(r),-Math.sin(n)*Math.cos(r)),a=new S(Math.cos(n)*.32,.1+t%2*.05,Math.sin(n)*.32);e.push({p:a,q:new N().setFromUnitVectors(Z,i)})}return e},[]),ie=(0,R.useMemo)(()=>Array.from({length:13},(e,t)=>{let n=t/13*Math.PI*2+Math.sin(t*7.7)*.08,r=.7+Math.sin(t*3.3)*.04,i=.12+t*37%7*.008;return{p:[Math.cos(n)*r,i*.45,Math.sin(n)*r],s:[i*1.1,i*.75,i*.95],ry:n*1.7+t,g:t%3}}),[]),L=(0,R.useMemo)(()=>{let e=[],t=new N,n=new S,r=new S,i=99,a=()=>(i=i*16807%2147483647,i/2147483647);for(;e.length<Oe;){let i=a()*Math.PI*2,o=Math.atan2(Math.sin(i-J),Math.cos(i-J));if(Math.abs(o)<1.35)continue;let s=e.length<6,c=s?7+a()*3:15+a()*9;r.set(Math.sin(i)*c,0,Math.cos(i)*c);let l=s?1.6+a()*.6:1+a()*.9;n.set(l*(.85+a()*.3),l,l*(.85+a()*.3)),t.setFromAxisAngle(Z,a()*6.28),e.push(new ne().compose(r,t,n))}return e},[]),oe=e=>{e&&(L.forEach((t,n)=>e.setMatrixAt(n,t)),e.instanceMatrix.needsUpdate=!0)},z=(0,R.useRef)(Array.from({length:3},()=>({mesh:null,active:!1,k:0,burn:0,from:new S,to:new S,q0:new N,q1:new N,spin:0,anims:[]}))),B=(0,R.useRef)(null);(0,R.useEffect)(()=>{let e=z.current;return a.current=()=>{let n=t.current,i=e.find(e=>!e.active);i||=e.reduce((e,t)=>t.burn>e.burn?t:e),i.anims.forEach(e=>e.stop());let a=new S;p.getWorldDirection(a);let o=new S().crossVectors(a,Z).normalize();i.from.copy(p.position).addScaledVector(a,1.1).addScaledVector(o,.55).addScaledVector(Z,-.65);let s=Math.random()*Math.PI*2;i.to.set(Math.cos(s)*.08,.3,Math.sin(s)*.08),i.q0.setFromEuler(new l(Math.random()*3,Math.random()*3,.4)),i.q1.setFromEuler(new l(0,Math.random()*Math.PI,Math.PI/2+(Math.random()-.5)*.3,`YXZ`)),i.spin=(Math.random()<.5?-1:1)*(5+Math.random()*3),i.active=!0,i.k=0,i.burn=0;let c=i,u=r(0,1,{duration:.8,ease:[.35,0,.65,1],onUpdate:e=>c.k=e,onComplete:()=>{n.burstT=n.time,n.burstAmt=1,B.current?.stop();let e=n.flare;B.current=r(0,1,{duration:5,ease:`linear`,onUpdate:t=>{let r=Math.min(1,t/.06);n.flare=e*(1-r)+r*(1-t)**1.8}});let t=r(0,1,{duration:14,ease:[.3,0,.7,1],onUpdate:e=>c.burn=e,onComplete:()=>c.active=!1});c.anims.push(t)}});i.anims=[u]},()=>{a.current=null,e.forEach(e=>e.anims.forEach(e=>e.stop())),B.current?.stop()}},[p,t,a]);let V=(0,R.useRef)(null),H=(0,R.useRef)(null),U=(0,R.useRef)(null),W=(0,R.useRef)(null),G=(0,R.useMemo)(()=>({v:new S,w:new S,key:``,fade:0,sway:0,popAt:3+Math.random()*3}),[]);return A((e,r)=>{let a=Math.min(r,1/30),s=t.current;s.time+=a;let c=s.time+(I?30:0);G.sway+=a,!I&&s.time>G.popAt&&(G.popAt=s.time+2.5+Math.random()*4,s.time-s.burstT>3&&(s.burstT=s.time,s.burstAmt=.18+Math.random()*.15*s.rate));let l=m.width<760,u=m.width<m.height,f=u?56:42,_=I?4.6:u?7.2:4.9,v=J+n.get()+(I?0:Math.sin(G.sway*.11)*.04),y=be+i.get()+(u?.04:0);p.position.set(q.x+Math.sin(v)*Math.cos(y)*_,q.y+Math.sin(y)*_,q.z+Math.cos(v)*Math.cos(y)*_),p.lookAt(q);let b=I||l?0:-.17*m.width,S=I?.02*m.height:l?.11*m.height:.02*m.height,C=`${m.width}x${m.height}:${f}:${b}:${S}`;G.key!==C&&(G.key=C,p.fov=f,p.far=120,p.setViewOffset(m.width,m.height,b,S,m.width,m.height),p.updateProjectionMatrix());let w=s.flare,T=s.height,E=1+.09*Math.sin(c*11.7)+.06*Math.sin(c*17.3+1.3)+.08*Math.sin(c*5.1+.4)*Math.sin(c*2.3),O=x.fire.uniforms;O.uTime.value=c,O.uHeight.value=T,O.uWidth.value=s.width*(1+.15*w),O.uLean.value=s.lean,O.uFlare.value=w,O.uInt.value=s.int*(1+.35*w),x.glow.uniforms.uInt.value=s.int*E*(.55+.4*T)*(1+.8*w);let k=x.smoke.uniforms;k.uTime.value=c,k.uLean.value=s.lean,k.uAmt.value=s.smoke*(1+.6*w),d.getDrawingBufferSize(D.buf);let ee=D.buf.y*p.projectionMatrix.elements[5]/2;for(let e of[x.spark,x.burst]){let t=e.uniforms;t.uTime.value=c,t.uRate.value=s.rate,t.uLean.value=s.lean,t.uBurstT.value=s.burstT+(I?30:0),t.uBurstAmt.value=s.burstAmt,t.uPx.value=ee,t.uLift.value=.75+.35*T+.3*w,t.uInt.value=.8+.3*T}x.sky.uniforms.uTime.value=c,x.sky.uniforms.uPix.value=2/(D.buf.y*p.projectionMatrix.elements[5]),g.ember.uEmberTime.value=c,g.ember.uEmberGain.value=s.ember*(.8+.25*E)*(1+.5*w),G.v.set(p.position.x,0,p.position.z).normalize();let A=Math.atan2(G.v.x,G.v.z);H.current&&(H.current.position.set(G.v.x*.3,.08,G.v.z*.3),H.current.rotation.set(0,A,0)),W.current&&(W.current.position.set(-G.v.x*.2,Te,-G.v.z*.2),W.current.rotation.set(0,A,0)),U.current&&(U.current.position.set(G.v.x*.5,.35+.3*T,G.v.z*.5),U.current.quaternion.copy(p.quaternion),U.current.scale.setScalar(.8+.5*T+.3*w));let j=V.current;j&&(j.intensity=s.light*E*(1+.9*w),j.position.set(Math.sin(c*3.7)*.04+s.lean*.15,.5+.18*T+Math.sin(c*5.3)*.03,Math.cos(c*4.1)*.04));for(let e of z.current){let t=e.mesh;if(!t||(t.visible=e.active,!e.active))continue;let n=e.k;t.position.lerpVectors(e.from,e.to,n),t.position.y+=Math.sin(Math.PI*n)*.85-e.burn*.14,t.quaternion.slerpQuaternions(e.q0,e.q1,Math.min(1,n*1.15)),n<1&&t.rotateY(e.spin*(1-n)*.4);let r=1-e.burn*.65;t.scale.set(r,Math.max(.05,1-e.burn*.45),r)}G.w.set(0,.25,0).project(p),D.uniforms.uFireA.value.set(G.w.x*.5+.5,G.w.y*.5+.5),G.w.set(s.lean*.35*T,.25+T*(1.05+.45*w),0).project(p),D.uniforms.uFireB.value.set(G.w.x*.5+.5,G.w.y*.5+.5),D.uniforms.uHazeW.value=Math.max(.03,(D.uniforms.uFireB.value.y-D.uniforms.uFireA.value.y)*.32*s.width),D.uniforms.uHaze.value=.6+.5*T+.6*w,D.uniforms.uTime.value=c,D.uniforms.uRes.value.copy(D.buf),M&&P.current?(F.current||(F.current=!0,o()),G.fade=I?1:Math.min(1,G.fade+a/.8),D.uniforms.uFade.value=G.fade,(D.fbo.width!==D.buf.x||D.fbo.height!==D.buf.y)&&D.fbo.setSize(D.buf.x,D.buf.y),d.setRenderTarget(D.fbo),d.setClearColor(0,1),d.clear(!0,!0,!1),d.render(h,p),d.setRenderTarget(null),d.render(D.post,D.cam)):(d.setRenderTarget(null),d.setClearColor(0,0),d.clear(!0,!0,!1))},1),(0,K.jsxs)(K.Fragment,{children:[(0,K.jsx)(`hemisphereLight`,{args:[`#33467a`,`#120c09`,.9]}),(0,K.jsx)(`directionalLight`,{position:[-6,9,-7],intensity:.6,color:`#8aa2e6`}),(0,K.jsx)(`pointLight`,{ref:V,color:`#ff8a3c`,intensity:6,distance:0,decay:2,castShadow:!0,"shadow-mapSize":[512,512],"shadow-bias":-.004,"shadow-camera-near":.1,"shadow-camera-far":20}),(0,K.jsx)(`fog`,{attach:`fog`,args:[`#030409`,6,30]}),(0,K.jsxs)(`group`,{ref:j,children:[(0,K.jsx)(`mesh`,{material:x.sky,renderOrder:-10,frustumCulled:!1,children:(0,K.jsx)(`sphereGeometry`,{args:[60,32,16]})}),(0,K.jsx)(`mesh`,{"rotation-x":-Math.PI/2,material:g.ground,receiveShadow:!0,children:(0,K.jsx)(`circleGeometry`,{args:[30,48]})}),(0,K.jsx)(`mesh`,{"rotation-x":-Math.PI/2,"position-y":.006,material:g.ash,renderOrder:0,children:(0,K.jsx)(`circleGeometry`,{args:[.62,32]})}),re.map((e,t)=>(0,K.jsx)(`mesh`,{geometry:_.log,position:e.p,quaternion:e.q,material:[g.bark,g.emberCap,g.woodCap],receiveShadow:!0},t)),ie.map((e,t)=>(0,K.jsx)(`mesh`,{geometry:_.stones[e.g],position:e.p,scale:e.s,"rotation-y":e.ry,material:t%4==0?g.stoneDark:g.stone,castShadow:!0,receiveShadow:!0},t)),(0,K.jsx)(`mesh`,{geometry:_.bench,position:[-1.62,.15,.28],rotation:[0,Math.atan2(-1.62,.28)+Math.PI/2,Math.PI/2],material:[g.plainBark,g.woodCap,g.woodCap],castShadow:!0,receiveShadow:!0}),(0,K.jsx)(Pe,{at:[-1.62,.28],seat:.3,jacket:g.jacketA,pants:g.pantsA,hat:g.hatA,scarf:g.scarfA,pose:`stick`,M:g}),(0,K.jsx)(`mesh`,{geometry:_.stump,position:[1.25,.21,-1.32],material:[g.plainBark,g.woodCap,g.woodCap],castShadow:!0,receiveShadow:!0}),(0,K.jsx)(Pe,{at:[1.25,-1.32],seat:.42,jacket:g.jacketB,pants:g.pantsB,hat:g.hatB,scarf:g.scarfB,pose:`mug`,M:g}),(0,K.jsxs)(`group`,{position:[1.05,0,.92],children:[(0,K.jsx)(`mesh`,{geometry:_.stones[1],scale:[.28,.09,.22],"position-y":.05,material:g.stone,castShadow:!0,receiveShadow:!0}),[[-.07,.02],[.09,-.05]].map(([e,t],n)=>(0,K.jsxs)(`group`,{position:[e,.17,t],"rotation-y":n*2.2+.6,children:[(0,K.jsx)(`mesh`,{material:g.enamel,castShadow:!0,children:(0,K.jsx)(`cylinderGeometry`,{args:[.042,.038,.1,14]})}),(0,K.jsx)(`mesh`,{"position-y":.048,material:g.enamelRim,children:(0,K.jsx)(`torusGeometry`,{args:[.042,.004,4,16]})}),(0,K.jsx)(`mesh`,{position:[.05,0,0],"rotation-x":Math.PI/2,material:g.enamel,children:(0,K.jsx)(`torusGeometry`,{args:[.024,.006,5,10,Math.PI*1.2]})})]},n))]}),(0,K.jsxs)(`group`,{position:[-.95,0,-3.4],"rotation-y":Math.atan2(.95,3.4)+.25,children:[(0,K.jsx)(`mesh`,{geometry:_.tent.shell,material:g.fabric,castShadow:!0,receiveShadow:!0}),(0,K.jsx)(`mesh`,{geometry:_.tent.inner,material:g.tentGlow}),(0,K.jsx)(`mesh`,{position:[.15,.12,-.3],material:g.lantern,children:(0,K.jsx)(`boxGeometry`,{args:[.07,.11,.07]})})]}),(0,K.jsx)(`instancedMesh`,{ref:oe,args:[_.pine,g.pine,Oe],frustumCulled:!1}),z.current.map((e,t)=>(0,K.jsx)(`mesh`,{ref:t=>{e.mesh=t},geometry:_.toss,material:[g.bark,g.emberCap,g.woodCap],visible:!1},t)),(0,K.jsx)(`mesh`,{ref:W,geometry:_.smoke,material:x.smoke,renderOrder:1,frustumCulled:!1}),(0,K.jsx)(`mesh`,{ref:U,geometry:_.glow,material:x.glow,renderOrder:2,frustumCulled:!1}),(0,K.jsx)(`mesh`,{ref:H,geometry:_.fire,material:x.fire,renderOrder:3,frustumCulled:!1}),(0,K.jsx)(`points`,{geometry:_.sparks,material:x.spark,renderOrder:4,frustumCulled:!1}),(0,K.jsx)(`points`,{geometry:_.burst,material:x.burst,renderOrder:4,frustumCulled:!1})]})]})}function Le(){let[e,t]=(0,R.useState)(1),[n,s]=(0,R.useState)(!1),[c,l]=(0,R.useState)(()=>Math.min(typeof window<`u`&&window.devicePixelRatio||1,ye?1.5:1.75)),[u,d]=(0,R.useState)(null),[f,p]=(0,R.useState)(!1),m=(0,R.useRef)(null),h=(0,R.useRef)({...$(Y[1]),lean:0,flare:I?.35:0,burstT:I?-.6:-100,burstAmt:1,time:0});(0,R.useEffect)(()=>{let e=0,t={},n=[()=>t.bark=U(),()=>t.caps=W(),()=>t.ground=G(),()=>t.ash=_e(),()=>t.fabric=ve()],r=0,i=()=>{n[r++](),r<n.length?e=requestAnimationFrame(i):d(Ae(t))};return e=requestAnimationFrame(i),()=>cancelAnimationFrame(e)},[]),(0,R.useEffect)(()=>()=>{u&&[u.bark.map,u.bark.emissive,u.caps.ember,u.caps.wood,u.ground,u.ash.map,u.ash.emissive,u.fabric].forEach(e=>e.dispose())},[u]),(0,R.useEffect)(()=>{u&&u.ground.repeat.set(16,16)},[u]),(0,R.useEffect)(()=>{let t=$(h.current),n=$(Y[e]),i=r(0,1,{duration:1.8,ease:[.45,0,.2,1],onUpdate:e=>{for(let r of ke)h.current[r]=t[r]+(n[r]-t[r])*e}});return()=>i.stop()},[e]),(0,R.useEffect)(()=>{let e=r(h.current.lean,n?.5:0,{type:`spring`,stiffness:30,damping:9,onUpdate:e=>h.current.lean=e});return()=>e.stop()},[n]),(0,R.useEffect)(()=>{if(!n)return;let e=0,t=()=>{r(h.current.lean,.5+(Math.random()-.3)*.3,{type:`spring`,stiffness:26,damping:7,onUpdate:e=>h.current.lean=e}),e=window.setTimeout(t,1400+Math.random()*2200)};return e=window.setTimeout(t,1800),()=>window.clearTimeout(e)},[n]);let g=i(0,{stiffness:70,damping:18,mass:1}),_=i(0,{stiffness:70,damping:18,mass:1}),v=(0,R.useRef)(null),y=e=>{e.target.closest(`.dock, .btn, .demo-chrome`)||(v.current={x:e.clientX,y:e.clientY,yaw:g.get(),pitch:_.get(),moved:!1,id:e.pointerId},e.currentTarget.setPointerCapture(e.pointerId))},b=e=>{let t=v.current;if(!t||t.id!==e.pointerId)return;let n=e.clientX-t.x,r=e.clientY-t.y;!t.moved&&Math.hypot(n,r)>6&&(t.moved=!0),t.moved&&(g.set(M.clamp(t.yaw-n*.0045,-.75,.75)),_.set(M.clamp(t.pitch+r*.0025,-.14,.22)))},x=e=>{let t=v.current;t&&t.id===e.pointerId&&(v.current=null,t.moved||m.current?.())},S=Y[e];return(0,K.jsxs)(`div`,{className:`stage cf`,onPointerDown:y,onPointerMove:b,onPointerUp:x,onPointerCancel:()=>v.current=null,children:[(0,K.jsx)(`style`,{children:Re}),(0,K.jsxs)(P,{shadows:`percentage`,dpr:c,gl:{antialias:!1,alpha:!0,powerPreference:`high-performance`},camera:{fov:42,near:.1,far:120,position:[2,2,4.5]},children:[(0,K.jsx)(ie,{onDecline:()=>l(e=>Math.max(.75,e*.8)),flipflops:3}),u&&(0,K.jsx)(Ie,{T:u,live:h,yaw:g,pitch:_,tossRef:m,onReady:()=>p(!0)})]}),(0,K.jsxs)(`div`,{className:`overlay`,children:[(0,K.jsxs)(a.div,{className:`hero-copy cf-copy soft-text`,initial:{opacity:0,x:-12},animate:{opacity:1,x:0},transition:{duration:.8,delay:.25,ease:[.23,1,.32,1]},children:[(0,K.jsx)(`div`,{className:`scrim`}),(0,K.jsxs)(`p`,{className:`kicker`,children:[(0,K.jsx)(`i`,{className:`cf-dot`}),` Procedural fire ·`,` `,(0,K.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,K.jsx)(a.span,{className:`cf-lv`,initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.35,ease:[.23,1,.32,1]},children:S.en},S.en)})]}),(0,K.jsxs)(`h1`,{children:[`围炉，`,(0,K.jsx)(`br`,{}),`是最古老的界面`]}),(0,K.jsx)(`p`,{className:`cf-lede`,children:`火焰是一张按温度上色的噪声着色器，火星是 GPU 粒子，热浪在后期里扭曲身后的夜色；一盏会闪的点光源，照亮每张围坐的脸。`}),(0,K.jsx)(`div`,{className:`hero-actions`,children:(0,K.jsx)(`button`,{className:`btn primary`,onClick:()=>m.current?.(),disabled:!f,children:`添一根柴`})})]}),(0,K.jsxs)(`div`,{className:`dock`,children:[(0,K.jsx)(re,{items:Y.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,K.jsx)(`span`,{className:`dock-sep`}),(0,K.jsx)(`button`,{className:`seg cf-tog`,"aria-pressed":n,onClick:()=>s(e=>!e),children:(0,K.jsxs)(`span`,{children:[(0,K.jsx)(`i`,{}),`风`]})})]}),(0,K.jsxs)(`p`,{className:`hint`,children:[`点击场景 · 添柴`,(0,K.jsx)(`br`,{}),`拖动 · 绕火转一点`]})]})]})}function $(e){return{height:e.height,width:e.width,light:e.light,rate:e.rate,int:e.int,smoke:e.smoke,ember:e.ember}}var Re=`
.cf { background: radial-gradient(90% 70% at 66% 60%, #2a1308 0%, #0f0805 45%, #050304 100%); cursor: grab; touch-action: none; }
.cf:active { cursor: grabbing; }
.cf-copy { --soft-bg: #070404; }
.cf-copy h1 { font-size: clamp(34px, 4.2vw, 58px); }
.cf-dot { background: #ff8a2a !important; box-shadow: 0 0 10px #ff8a2a; }
.cf-lv { display: inline-block; }
.cf-lede { max-width: 400px; font-size: 15px !important; }
.cf .btn.primary { background: #ffb36b; color: #2a1406; }
.cf .btn.primary:disabled { opacity: .5; }
.cf-tog span { display: inline-flex; align-items: center; gap: 7px; }
.cf-tog i { width: 7px; height: 7px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px currentColor; transition: background .25s, box-shadow .25s; }
.cf-tog[aria-pressed='true'] i { background: #ffc58a; box-shadow: 0 0 8px #ff8a2a; }
@media (max-width: 760px) {
  .cf-copy h1 { font-size: 30px; }
  .cf-lede { display: none; }
  .cf .hero-actions { margin-top: 16px; }
}
`;export{Le as default};