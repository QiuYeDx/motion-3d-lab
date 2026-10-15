import{M as e,N as t,dt as n,gn as r,mt as i,yt as a,z as o}from"./events-9ce18a08.esm-BkDjjFw8.js";var s=[{id:`iron`,label:`铁红`},{id:`rainbow`,label:`彩虹`},{id:`white`,label:`白热`},{id:`night`,label:`夜视仪`}],c={title:`热成像`,en:`Thermal Vision`,background:`#07060a`,theme:`dark`},l=e=>(e- -10)/150,u=e=>-10+150*e;function d(e,n=new t){let r=l(e),o=a.clamp((r-.3)/.7,0,1);return n.setRGB(1,o,0,i)}var f=(e,t,n)=>{let r=a.clamp((n-e)/(t-e),0,1);return r*r*(3-2*r)},p=e=>e<=.0031308?e*12.92:1.055*e**(1/2.4)-.055;function m(e,t,n){let r=e=>a.clamp(p(e/(1+e*.12)),0,1),i=.05+.26*(.299*r(e)+.587*r(t)+.114*r(n)),o=f(.2,.75,e-n)*f(.15,.6,e-t*.5);return i+(.3+.7*a.clamp(t/Math.max(e,.001),0,1)-i)*o}function h(e,n=new t){let r=l(e);if(r>=.3)return{color:d(e,n),intensity:1};let a=f(18,34,e),o=1-.72*a,s=1-.85*a,c=0,u=4;for(let e=0;e<28;e++){let e=(c+u)/2;m(e,e*o,e*s)<r?c=e:u=e}return{color:n.setRGB(1,o,s,i),intensity:(c+u)/2}}var g={iron:[[0,`#000004`],[.12,`#1b0c5a`],[.3,`#6a0d83`],[.46,`#b3245e`],[.6,`#e8501f`],[.74,`#f99312`],[.88,`#fcd34a`],[1,`#fffbe8`]],rainbow:[[0,`#23103a`],[.1,`#4145ab`],[.22,`#4675ed`],[.34,`#2ab3e6`],[.46,`#1ae0b0`],[.57,`#6dfa64`],[.67,`#c4f034`],[.77,`#f9c432`],[.87,`#f97a1f`],[.95,`#db3a0a`],[1,`#ffe8e0`]],white:[[0,`#050505`],[.5,`#6f6f6f`],[1,`#ffffff`]]},_=[[0,`#020a03`],[.5,`#2f8a3a`],[1,`#d8ffc8`]];function v(e,t=`to top`){return`linear-gradient(${t}, ${(e===`night`?_:g[e]).map(([e,t])=>`${t} ${(e*100).toFixed(0)}%`).join(`, `)})`}var y=null;function b(){if(y)return y;let t=[g.iron,g.rainbow,g.white],r=new Uint8Array(1024*t.length),i=e=>{let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]};t.forEach((e,t)=>{for(let n=0;n<256;n++){let o=n/255,s=0;for(;s<e.length-2&&o>e[s+1][0];)s++;let[c,l]=e[s],[u,d]=e[s+1],f=a.clamp((o-c)/(u-c),0,1),p=i(l),m=i(d),h=(t*256+n)*4;for(let e=0;e<3;e++)r[h+e]=Math.round(p[e]+(m[e]-p[e])*f);r[h+3]=255}});let s=new o(r,256,t.length);return s.colorSpace=``,s.magFilter=n,s.minFilter=n,s.wrapS=s.wrapT=e,s.needsUpdate=!0,y=s,s}var x=`
uniform sampler2D tPal;
uniform float uRowA;
uniform float uRowB;
uniform float uRowMix;
uniform float uNV;
uniform vec2 uRange;     // normalised T mapped to palette 0 … 1
uniform float uNuc;      // shutter (flat field) envelope
uniform float uDrift;    // non-uniformity, grows after each NUC
uniform float uDriftA;   // its direction
uniform float uSeed;     // temporal noise frame

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 lin(vec2 px) { return texture2D(tScene, px / uRes).rgb * uExposure; }

float tempOf(vec3 c) {
  vec3 s = linearToSrgb(c / (1.0 + c * 0.12));
  float amb = 0.05 + 0.26 * luma(clamp(s, 0.0, 1.0));
  float w = smoothstep(0.2, 0.75, c.r - c.b) * smoothstep(0.15, 0.6, c.r - c.g * 0.5);
  float hot = 0.3 + 0.7 * clamp(c.g / max(c.r, 1e-3), 0.0, 1.0);
  return mix(amb, hot, w);
}

// image-intensifier response: green-weighted (a red heat paint barely registers, lamps do)
float nvLum(vec3 c) { return dot(c, vec3(0.12, 0.68, 0.2)); }

vec3 palette(float t) {
  t = clamp(t, 0.002, 0.998);
  vec3 a = texture2D(tPal, vec2(t, (uRowA + 0.5) / 3.0)).rgb;
  vec3 b = texture2D(tPal, vec2(t, (uRowB + 0.5) / 3.0)).rgb;
  return mix(a, b, uRowMix);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec3 c0 = lin(px);
  float T0 = tempOf(c0);
  float N0 = nvLum(c0);

  // optics: a soft inner ring + a wide ring for bloom (temperature for thermal, luminance for NV)
  float Tin = 0.0, Nin = 0.0, Tout = 0.0, Nout = 0.0;
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.0472 + 0.3;
    vec2 d = vec2(cos(a), sin(a));
    vec3 ci = lin(px + d * 2.2 * uDpr);
    Tin += tempOf(ci);
    Nin += nvLum(ci);
    vec3 co = lin(px + d * 9.0 * uDpr);
    vec3 cw = lin(px + vec2(-d.y, d.x) * 20.0 * uDpr);
    float to = tempOf(co), tw = tempOf(cw);
    Tout += to * 0.6 + tw * 0.4;
    Nout += nvLum(co) * 0.6 + nvLum(cw) * 0.4;
  }
  Tin /= 6.0; Nin /= 6.0; Nout /= 6.0; Tout /= 6.0;

  /* ---- thermal */
  float T = mix(T0, Tin, 0.45);
  T += max(Tout - T, 0.0) * 0.45;                         // heat bloom bleeds outward from hot things
  float tn = (T - uRange.x) / max(uRange.y - uRange.x, 1e-3);
  // sensor: fixed pattern (columns + pixels), temporal noise, cold vignette, drifting non-uniformity
  float col = hash12(vec2(floor(cp.x * 0.75), 7.0)) - 0.5;
  float fpn = col * 0.016 + (hash12(floor(cp * 0.75) + 3.7) - 0.5) * 0.012;
  float tnoise = (hash12(floor(cp * 0.75) + uSeed * 17.31) - 0.5) * 0.03;
  vec2 vc = uv - 0.5;
  float vig = dot(vc * vec2(uRes.x / uRes.y, 1.0), vc * vec2(uRes.x / uRes.y, 1.0));
  vec2 dd = vec2(cos(uDriftA), sin(uDriftA));
  float nonU = uDrift * (dot(vc, dd) * 0.14 + (vnoise(uv * 2.3 + uDriftA) - 0.5) * 0.08);
  tn += fpn + tnoise + nonU - vig * 0.07;
  // NUC: the shutter covers the sensor → a flat, slightly noisy field
  tn = mix(tn, 0.34 + fpn * 0.6 + tnoise * 0.5, uNuc);
  vec3 th = palette(tn);

  /* ---- night vision */
  vec3 nvc = vec3(0.0);
  if (uNV > 0.01) {
    float I = mix(N0, Nin, 0.35) * 7.0;
    I += max(Nout * 7.0 - 0.8, 0.0) * 0.6;              // halos around light sources
    I = 1.0 - exp(-I * 1.6);
    float grainK = 0.06 + 0.3 * (1.0 - I);              // photon noise: worst in the dark
    float sc = hash12(floor(cp * 0.9) + uSeed * 23.7) - 0.5;
    float spark = step(0.9988, hash12(floor(cp * 0.5) + uSeed * 5.1));
    I = clamp(I + sc * grainK + spark * 0.7, 0.0, 1.0);
    // fibre-optic honeycomb, very faint
    vec2 hp = cp * 0.42;
    vec2 hq = vec2(hp.x + hp.y * 0.5, hp.y * 0.866);
    float hex = smoothstep(0.32, 0.5, length(fract(hq) - 0.5));
    I *= 1.0 - hex * 0.06;
    // tube: round field of view with a soft edge
    float R = min(uRes.x, uRes.y) * 0.49;
    vec2 pc = px - uRes * 0.5;
    float tube = 1.0 - smoothstep(R * 0.86, R * 1.0, length(pc));
    I *= tube * (1.0 - 0.35 * smoothstep(0.3, 1.0, length(pc) / R));
    nvc = mix(vec3(0.008, 0.03, 0.012), vec3(0.42, 1.0, 0.38), I);
    nvc = mix(nvc, vec3(0.86, 1.0, 0.8), smoothstep(0.82, 1.0, I) * 0.7);
    nvc *= 1.0 - 0.85 * uNuc;
  }
  return mix(th, nvc, uNV);
}
`,S={iron:0,rainbow:1,white:2},C=.55;function w(){let e={mode:`iron`,rowFrom:0,rowTo:0,rowK:1,nv:0,nvTarget:0,lo:l(-5),hi:l(90),loTarget:l(-5),hiTarget:l(90),t:0,nextNuc:6+Math.random()*3,nucT:-1,drift:0,nucEnabled:!0},t={tPal:{value:b()},uRowA:{value:0},uRowB:{value:0},uRowMix:{value:0},uNV:{value:0},uRange:{value:new r(e.lo,e.hi)},uNuc:{value:0},uDrift:{value:0},uDriftA:{value:Math.random()*6.28},uSeed:{value:0}};return{frag:x,uniforms:t,background:c.background,thermal:e,update(n){e.t+=n,t.uSeed.value=Math.floor(e.t*30)%512,e.rowK<1&&(e.rowK=Math.min(1,e.rowK+n/.6));let r=e.rowK*e.rowK*(3-2*e.rowK);t.uRowA.value=e.rowFrom,t.uRowB.value=e.rowTo,t.uRowMix.value=r,e.nv+=(e.nvTarget-e.nv)*Math.min(1,n*5),t.uNV.value=e.nv;let i=Math.min(1,n*2.2);if(e.lo+=(e.loTarget-e.lo)*i,e.hi+=(e.hiTarget-e.hi)*i,t.uRange.value.set(e.lo,e.hi),e.drift=Math.min(1,e.drift+n/9),e.nucT<0&&e.nucEnabled&&e.t>e.nextNuc&&(e.nucT=0),e.nucT>=0){e.nucT+=n;let r=e.nucT,i=r<.05?r/.05:r<.4?1:Math.max(0,1-(r-.4)/.15000000000000002);t.uNuc.value=i,r>.2&&e.drift>0&&(e.drift=0,t.uDriftA.value=Math.random()*6.28),r>=C&&(e.nucT=-1,t.uNuc.value=0,e.nextNuc=e.t+9+Math.random()*3)}t.uDrift.value=e.drift}}}function T(e,t){let n=e.thermal;if(!n||n.mode===t)return;if(n.mode=t,t===`night`){n.nvTarget=1;return}n.nvTarget=0;let r=S[t];r!==n.rowTo&&(n.rowFrom=n.rowK<.5?n.rowFrom:n.rowTo,n.rowTo=r,n.rowK=+(n.rowFrom===r))}function E(e,t){let n=e.thermal;if(!n)return;let[r,i]=t??[-5,90];n.loTarget=l(r),n.hiTarget=l(Math.max(i,r+5))}function D(e){let t=e.thermal;return{nuc:t.nucT>=0,range:[u(t.lo),u(t.hi)],mode:t.mode}}function O(e,t){let n=e.thermal;n&&(n.nucEnabled=t)}export{h as a,d as c,E as i,v as l,T as n,c as o,O as r,s,w as t,D as u};