import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{n as i}from"./index-gQ65n0JU.js";import{$ as a,Ct as o,E as s,It as c,Jt as l,Lt as u,M as d,P as f,Pt as p,Rt as m,Sn as h,T as g,Wt as _,Xt as v,Yt as y,h as b,ht as x,it as S,k as C,pt as w,rt as ee,u as T,ut as E,vn as D,wt as O,xt as k,yn as A,z as te}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as j}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as M}from"./iso-CLB38p39.js";import{t as N}from"./Seg-CH5KfWEm.js";import{t as P}from"./PerformanceMonitor-DOuNfnyh.js";import{t as F}from"./GPUComputationRenderer-BkSo-k_S.js";var I=e(t(),1),L=`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lifeOf(vec2 uv) { return mix(5.5, 9.5, hash12(uv * 517.31 + 3.7)); }
`,R=`
uniform float uDt, uTime, uTurb, uPS;
uniform vec3 uPtr, uPtrVel;
${L}

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
void snoiseGrad(vec3 v, out vec3 gradient) {
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
}
vec3 curl(vec3 p) {
  vec3 g1, g2, g3;
  snoiseGrad(p, g1);
  snoiseGrad(p + vec3(31.416, -47.853, 12.793), g2);
  snoiseGrad(p + vec3(-23.17, 19.31, 73.41), g3);
  return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w < 0.0 || p.w > lifeOf(uv) || p.y > 8.5) {
    gl_FragColor = vec4(0.0, 0.6, 0.0, 0.0);
    return;
  }
  vec3 pos = p.xyz;
  float h = max(pos.y, 0.0);
  // laminar right above the tips, turbulent higher up (like a real incense plume)
  float tb = smoothstep(0.35, 2.8, h);
  vec3 q = pos * vec3(0.62, 0.42, 0.62) + vec3(0.0, -uTime * 0.3, uTime * 0.06);
  vec3 field = vec3(0.0, mix(0.95, 0.4, smoothstep(0.0, 5.5, h)), 0.0);
  field += curl(q) * (0.035 + tb * 0.36 * uTurb);
  float sway = smoothstep(0.3, 3.2, h);
  field.x += (sin(uTime * 0.21 + h * 0.55) * 0.15 + sin(uTime * 0.13 + h * 1.3) * 0.05) * sway;
  field.z += sin(uTime * 0.17 + h * 0.4 + 1.3) * 0.07 * sway;
  // the plume entrains air and widens as it rises
  field.xz += pos.xz * 0.06 * tb;
  vec3 nv = mix(field, v.xyz, exp(-1.5 * uDt));

  // pointer: drag the smoke along with the cursor and spin it around
  vec3 d = pos - uPtr;
  float r2 = dot(d.xy, d.xy) + d.z * d.z * 0.35;
  float fall = exp(-r2 / 0.6) * uPS;
  float sp = length(uPtrVel);
  vec3 swirl = vec3(-d.y, d.x, 0.0) * sp * 0.9;
  nv += ((uPtrVel * 1.25 - nv) * min(1.0, uDt * 7.0) + swirl * uDt * 2.0) * fall;
  float s = length(nv);
  if (s > 6.0) nv *= 6.0 / s;
  gl_FragColor = vec4(nv, 0.0);
}
`,z=`
uniform float uDt, uTime;
${L}
vec3 spawn(vec2 uv) {
  float a = hash12(uv * 913.1 + uTime * 1.31);
  float b = hash12(uv * 271.7 - uTime * 0.77 + 5.1);
  float c = hash12(uv * 631.9 + uTime * 0.53 + 9.3);
  vec3 tip = a < 0.34 ? vec3(-0.13, 0.0, 0.05) : a < 0.67 ? vec3(0.0, 0.07, -0.05) : vec3(0.12, -0.03, 0.06);
  float th = b * 6.2831853;
  float r = 0.022 * sqrt(c);
  return tip + vec3(cos(th) * r, 0.0, sin(th) * r);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 p = texture2D(texturePosition, uv);
  vec4 v = texture2D(textureVelocity, uv);
  if (p.w < 0.0) {
    float a = p.w + uDt;
    gl_FragColor = vec4(a >= 0.0 ? spawn(uv) : p.xyz, a);
    return;
  }
  if (p.w > lifeOf(uv) || p.y > 8.5) {
    gl_FragColor = vec4(spawn(uv), 0.0);
    return;
  }
  gl_FragColor = vec4(p.xyz + v.xyz * uDt, p.w + uDt);
}
`,B=`
uniform sampler2D tPos;
uniform float uSizeK, uDensity;
${L}
bool particle(vec2 uv, out vec3 p, out float size, out float a, out float h1) {
  vec4 P = texture2D(tPos, uv);
  h1 = hash12(uv * 91.7 + 1.3);
  p = P.xyz;
  if (P.w <= 0.0) { size = 0.0; a = 0.0; return false; }
  float t = P.w / lifeOf(uv);
  size = mix(0.035, 0.74, pow(t, 0.8)) * (0.6 + 0.8 * h1) * uSizeK;
  a = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.5, 1.0, t)) * smoothstep(8.5, 6.5, p.y);
  a *= 0.0035 / (0.003 + size * size) * uDensity;
  return true;
}
`,ne=`
uniform mat4 uLightVP;
uniform float uLScale;
varying float vD, vA;
${B}
void main() {
  vec3 p; float size, a, h1;
  if (!particle(position.xy, p, size, a, h1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vD = 0.0; return; }
  vec4 c = uLightVP * vec4(p, 1.0);
  gl_Position = c;
  vD = c.z * 0.5 + 0.5;
  vA = a;
  gl_PointSize = max(1.0, size * uLScale);
}
`,re=`
uniform float uBase;
varying float vD, vA;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float m = exp(-d2 * 2.6) * vA;
  vec4 s = (uBase + vec4(1.0, 2.0, 3.0, 4.0)) / 8.0;
  vec4 w = 1.0 - smoothstep(s - 0.07, s + 0.07, vec4(vD));
  gl_FragColor = w * m;
}
`,ie=`
uniform sampler2D tL0, tL1;
uniform mat4 uLightVP;
uniform float uScale, uExt, uKeyI, uG, uInk;
uniform vec3 uL, uKey, uAmbLo, uAmbHi, uCam;
varying vec3 vCol;
varying float vA, vRot, vTile;
${B}
float sliceAt(vec4 A, vec4 B, float f) {
  vec4 wA = max(vec4(0.0), 1.0 - abs(f - vec4(0.0, 1.0, 2.0, 3.0)));
  vec4 wB = max(vec4(0.0), 1.0 - abs(f - vec4(4.0, 5.0, 6.0, 7.0)));
  return dot(A, wA) + dot(B, wB);
}
void main() {
  vec3 p; float size, a, h1;
  if (!particle(position.xy, p, size, a, h1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); vRot = 0.0; vTile = 0.0; return; }
  vec3 l = (uLightVP * vec4(p, 1.0)).xyz * 0.5 + 0.5;
  vec4 A = texture2D(tL0, l.xy);
  vec4 B = texture2D(tL1, l.xy);
  float tau = sliceAt(A, B, l.z * 8.0 - 1.0) * uExt;
  float T = exp(-tau);
  vec3 V = normalize(uCam - p);
  float ct = dot(-uL, V);
  float g = uG;
  // Henyey-Greenstein, normalised so its forward peak is 1
  float hg = (1.0 - g) * (1.0 - g) * (1.0 - g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5);
  float phase = 0.3 + 1.0 * hg;
  vec3 amb = mix(uAmbLo, uAmbHi, smoothstep(0.0, 6.0, p.y)) * (0.3 + 0.7 * exp(-tau * 0.3));
  vec3 lit = uKey * (T * phase * uKeyI) + amb;
  // ink: shadowed smoke is dense ink, lit smoke thins out toward the paper
  float lum = dot(lit, vec3(0.3, 0.55, 0.15));
  vCol = lit;
  vA = a * mix(1.0, clamp(1.0 - lum * 0.45, 0.22, 0.8), uInk);
  vRot = h1 * 6.2831853;
  vTile = floor(fract(h1 * 7.31) * 4.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / -mv.z;
}
`,ae=`
uniform sampler2D tSprite;
uniform float uInk;
uniform vec3 uInkCol;
varying vec3 vCol;
varying float vA, vRot, vTile;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, sn, -sn, cs) * c;
  vec2 tuv = (clamp(c, -0.5, 0.5) + 0.5 + vec2(mod(vTile, 2.0), floor(vTile / 2.0))) * 0.5;
  float m = texture2D(tSprite, tuv).r * (1.0 - smoothstep(0.16, 0.25, dot(c, c)));
  float a = m * vA;
  vec3 col = mix(vCol, uInkCol, uInk);
  gl_FragColor = vec4(col * a, a);
}
`,oe=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,se=`
uniform sampler2D tSmoke;
uniform vec3 uBg0, uBg1, uGlowCol;
uniform vec2 uLightUV, uBaseUV;
uniform float uGlowI, uAspect, uRays, uInk, uTime, uReady;
varying vec2 vUv;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float glowAt(vec2 uv) {
  vec2 d = (uv - uLightUV) * vec2(uAspect, 1.0);
  float r2 = dot(d, d);
  return exp(-r2 * 7.0) * 0.6 + 0.12 / (1.0 + r2 * 10.0);
}
void main() {
  vec2 uv = vUv;
  vec3 bg = mix(uBg1, uBg0, smoothstep(0.0, 1.0, uv.y));
  // a soft pool of light on the table under the censer
  vec2 bd = (uv - uBaseUV) * vec2(uAspect * 0.55, 2.4);
  bg += uGlowCol * exp(-dot(bd, bd) * 3.0) * 0.05 * (1.0 - uInk);
  bg += uGlowCol * glowAt(uv) * uGlowI;
  vec2 vd = (uv - 0.5) * vec2(uAspect, 1.0);
  bg *= mix(1.0 - dot(vd, vd) * 0.35, 1.0 - dot(vd, vd) * 0.08, uInk);
  // paper fibres in ink mode
  float grain = h12(floor(uv * vec2(uAspect, 1.0) * 900.0)) - 0.5;
  bg += grain * mix(0.006, 0.03, uInk);

  vec4 s = textureLod(tSmoke, uv, 0.0) * uReady;
  vec3 col = bg * (1.0 - s.a) + s.rgb;

  // light shafts: march toward the light, the glow is blocked wherever smoke is dense
  if (uRays > 0.001) {
    vec2 dl = uLightUV - uv;
    vec2 stp = dl * (0.85 / float(RAY_STEPS));
    vec2 q = uv + stp * h12(uv * 1777.0 + uTime);
    float acc = 0.0;
    float w = 1.0;
    for (int i = 0; i < RAY_STEPS; i++) {
      float a = textureLod(tSmoke, q, 0.0).a * uReady;
      acc += glowAt(q) * (1.0 - min(1.0, a * 2.2)) * w;
      w *= 0.94;
      q += stp;
    }
    col += uGlowCol * acc * uRays * (1.0 / float(RAY_STEPS)) * (1.0 - s.a * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,ce=`
varying vec3 vN, vP;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,le=`
uniform vec3 uL, uKey, uBase, uCamW, uInkCol;
uniform float uInk, uKeyI;
varying vec3 vN, vP;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(uCamW - vP);
  float nl = max(dot(n, uL), 0.0);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 H = normalize(uL + V);
  float spec = pow(max(dot(n, H), 0.0), 40.0);
  vec3 c = uBase * (0.18 + nl * 0.9 * uKeyI) + uKey * (spec * 0.5 * uKeyI + rim * 0.12);
  vec3 ink = uInkCol * (0.9 + nl * 0.25) + rim * 0.08;
  gl_FragColor = vec4(mix(c, ink, uInk), 1.0);
}
`,ue=`
uniform float uScale, uTime;
attribute float aSeed;
varying float vF;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vF = 0.75 + 0.25 * sin(uTime * (2.0 + aSeed) + aSeed * 9.0) * sin(uTime * 3.7 + aSeed * 3.0);
  gl_PointSize = 0.28 * uScale / -mv.z;
}
`,de=`
uniform float uInk;
varying float vF;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(c, c);
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 60.0);
  float halo = exp(-d2 * 6.0) * 0.35;
  // dark themes: additive glow (alpha 0); ink: a small deep-red ember painted over the paper
  vec3 glow = vec3(1.0, 0.42, 0.12) * (core * 2.0 + halo);
  vec3 ink = vec3(0.7, 0.12, 0.08) * core * 1.4;
  gl_FragColor = vec4(mix(glow, ink, uInk) * vF, clamp(core * 1.4, 0.0, 1.0) * vF * uInk);
}
`,V=n(),H=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,U=H?144:192,fe=U*U,W=H?192:256,pe=H?14:24,G=2.3,K=11,q=40,J=new A(0,3.1,0),Y=4.4,me=[[-.13,0,.05],[0,.07,-.05],[.12,-.03,.06]],X=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},Z=[{key:`side`,zh:`侧光`,en:`Side light`,dir:[1,.32,.38],keyI:2.3,glowI:.42,rays:.9,g:.45},{key:`back`,zh:`逆光`,en:`Back light`,dir:[.18,.28,-1],keyI:1.2,glowI:.55,rays:.9,g:.62},{key:`top`,zh:`顶光`,en:`Top light`,dir:[.15,1,.22],keyI:2.1,glowI:.38,rays:.8,g:.45}],Q=[{key:`ash`,zh:`烟灰`,bg0:`#101117`,bg1:`#060609`,keyCol:`#ffeedd`,ambLo:`#2e3038`,ambHi:`#343a48`,glow:`#ffdcb0`,base:`#5b4632`,stick:`#5a2a1a`,rays:1,glowMul:1,ink:0},{key:`neon`,zh:`霓虹`,bg0:`#0d0718`,bg1:`#05030a`,keyCol:`#ff3fae`,ambLo:`#0a5a8a`,ambHi:`#3a1f9a`,glow:`#ff58c0`,base:`#3a2a52`,stick:`#3a1a40`,rays:.8,glowMul:.45,ink:0},{key:`ink`,zh:`水墨`,bg0:`#f3ede2`,bg1:`#e7ddcb`,keyCol:`#ffffff`,ambLo:`#4a4a4a`,ambHi:`#6a6a6a`,glow:`#fff6e6`,base:`#2a2622`,stick:`#2a1a14`,rays:0,glowMul:.25,ink:1}],$=[{value:0,label:`淡`,k:.55},{value:1,label:`中`,k:1},{value:2,label:`浓`,k:1.7}],he=[`L`,`bg0`,`bg1`,`key`,`ambLo`,`ambHi`,`glow`,`base`,`stick`],ge=[`keyI`,`glowI`,`rays`,`g`,`ink`,`dens`];function _e(e,t,n){let r=Z[e],i=Q[t],a=new A(...r.dir).normalize();return{L:[a.x,a.y,a.z],keyI:r.keyI,glowI:r.glowI*i.glowMul,rays:r.rays*i.rays,g:r.g,ink:i.ink,dens:$[n].k,bg0:X(i.bg0),bg1:X(i.bg1),key:X(i.keyCol),ambLo:X(i.ambLo),ambHi:X(i.ambHi),glow:X(i.glow),base:X(i.base),stick:X(i.stick)}}var ve=e=>{let t={...e};for(let n of he)t[n]=[...e[n]];return t};function ye(){let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`);t.fillStyle=`#000`,t.fillRect(0,0,256,256),t.globalCompositeOperation=`lighter`;for(let e=0;e<4;e++){let n=e%2*128+64,r=Math.floor(e/2)*128+64;for(let e=0;e<26;e++){let e=Math.random()*Math.PI*2,i=Math.random()**.7*30,a=n+Math.cos(e)*i,o=r+Math.sin(e)*i,s=10+Math.random()*26,c=t.createRadialGradient(a,o,0,a,o,s),l=.06+Math.random()*.1;c.addColorStop(0,`rgba(255,255,255,${l})`),c.addColorStop(1,`rgba(255,255,255,0)`),t.fillStyle=c,t.fillRect(n-64,r-64,128,128)}}let n=new C(e);return n.colorSpace=``,n.generateMipmaps=!0,n.minFilter=x,n}function be(){let e=new E([[.001,0],[.3,0],[.33,.04],[.27,.09],[.3,.13],[.48,.2],[.58,.33],[.62,.48],[.6,.54],[.66,.57],[.66,.61],[.6,.62],[.57,.58],[.56,.5]].map(([e,t])=>new D(e,t-1.85)),64);return e.computeVertexNormals(),e}function xe({look:e,ptr:t}){let n=b(e=>e.gl),r=b(e=>e.scene),i=b(e=>e.camera),x=(0,I.useMemo)(()=>{let e=new F(U,U,n);n.extensions.has(`EXT_color_buffer_float`)||e.setDataType(S);let t=e.createTexture(),r=e.createTexture(),i=t.image.data,a=r.image.data;for(let e=0;e<i.length;e+=4){let t=me[Math.floor(Math.random()*3)],n=Math.random()<.15?-Math.random()*2:Math.random()*5.2,r=Math.max(0,n)*.72,o=.03+r*r*.025;i[e]=t[0]+(Math.random()-.5)*2*o,i[e+1]=t[1]+r,i[e+2]=t[2]+(Math.random()-.5)*2*o,i[e+3]=n,a[e+1]=.6}let o=e.addVariable(`textureVelocity`,R,r),s=e.addVariable(`texturePosition`,z,t);e.setVariableDependencies(o,[o,s]),e.setVariableDependencies(s,[o,s]),Object.assign(o.material.uniforms,{uDt:{value:0},uTime:{value:0},uTurb:{value:1},uPS:{value:0},uPtr:{value:new A(99,99,0)},uPtrVel:{value:new A}}),Object.assign(s.material.uniforms,{uDt:{value:0},uTime:{value:0}});let c=e.init();return c&&console.error(c),{gpu:e,velVar:o,posVar:s}},[n]);(0,I.useEffect)(()=>()=>x.gpu.dispose(),[x]);let C=(0,I.useMemo)(()=>{let e=new s,t=new Float32Array(fe*3);for(let e=0;e<fe;e++)t[e*3]=(e%U+.5)/U,t[e*3+1]=(Math.floor(e/U)+.5)/U;e.setAttribute(`position`,new g(t,3));let n={type:S,depthBuffer:!1,minFilter:w,magFilter:w},r=new h(W,W,n),i=new h(W,W,n),l=new h(4,4,n),f=new o,b=new v({vertexShader:ne,fragmentShader:re,uniforms:{tPos:{value:null},uSizeK:{value:1},uDensity:{value:1},uLightVP:{value:f},uLScale:{value:W/(2*Y)},uBase:{value:0}},transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:201,blendDst:201}),x=new m(e,b);x.frustumCulled=!1;let C=new y;C.add(x);let T=new p(-4.4,Y,Y,-4.4,.1,Y*4),E=ye(),k=new v({vertexShader:ie,fragmentShader:ae,uniforms:{tPos:{value:null},tL0:{value:r.texture},tL1:{value:i.texture},tSprite:{value:E},uLightVP:{value:f},uSizeK:{value:1},uDensity:{value:1},uScale:{value:500},uExt:{value:.35},uKeyI:{value:1.5},uG:{value:.5},uInk:{value:0},uL:{value:new A(1,0,0)},uKey:{value:new A(1,1,1)},uAmbLo:{value:new A},uAmbHi:{value:new A},uCam:{value:new A},uInkCol:{value:new A(.13,.125,.14)}},transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:201,blendDst:205}),j=new m(e,k);j.frustumCulled=!1,j.matrixAutoUpdate=!1;let M=new y;M.add(j);let N=new v({vertexShader:oe,fragmentShader:se,defines:{RAY_STEPS:pe},uniforms:{tSmoke:{value:l.texture},uBg0:{value:new A},uBg1:{value:new A},uGlowCol:{value:new A},uLightUV:{value:new D(1.1,.6)},uBaseUV:{value:new D(.7,.1)},uGlowI:{value:.5},uAspect:{value:1},uRays:{value:1},uInk:{value:0},uTime:{value:0},uReady:{value:1}},depthTest:!1,depthWrite:!1}),P=new u(2,2),F=new O(P,N);F.frustumCulled=!1,F.renderOrder=-1;let I=()=>({uL:{value:new A(1,0,0)},uKey:{value:new A(1,1,1)},uBase:{value:new A(.3,.25,.2)},uCamW:{value:new A},uInkCol:{value:new A(.1,.095,.1)},uInk:{value:0},uKeyI:{value:1}}),L=new v({vertexShader:ce,fragmentShader:le,uniforms:I(),side:2}),R=new v({vertexShader:ce,fragmentShader:le,uniforms:I()}),z=be(),B=new O(z,L),V=new d(.57,48).rotateX(-Math.PI/2).translate(0,-1.31,0),H=new v({vertexShader:ce,fragmentShader:le,uniforms:I()}),G=new O(V,H),K=new te(.011,.011,1,6,1),q=me.map((e,t)=>{let n=new A(e[0]*.55+(t-1)*.02,-1.3,e[2]*.6),r=new A(...e).add(new A(0,-.02,0)).clone().sub(n),i=new O(K,R);return i.scale.set(1,r.length(),1),i.position.copy(n).addScaledVector(r,.5),i.quaternion.setFromUnitVectors(new A(0,1,0),r.normalize()),i}),J=new s;J.setAttribute(`position`,new a(me.flat(),3)),J.setAttribute(`aSeed`,new a([.3,1.7,2.9],1));let X=new v({vertexShader:ue,fragmentShader:de,uniforms:{uScale:{value:500},uTime:{value:0},uInk:{value:0}},transparent:!0,depthWrite:!1,blending:5,blendSrc:201,blendDst:205}),Z=new m(J,X);Z.frustumCulled=!1,Z.renderOrder=3;let Q=new ee;return Q.add(B,G,...q,Z),{geo:e,L0:r,L1:i,smokeRT:l,lightVP:f,lightMat:b,lightScene:C,lightCam:T,sprite:E,smokeMat:k,smokePts:j,smokeScene:M,compMat:N,compGeo:P,comp:F,bowlMat:L,stickMat:R,ashMat:H,bowlGeo:z,ashGeo:V,stickGeo:K,tipGeo:J,tipMat:X,group:Q,buf:new D,v:new A,L:new A,lp:new A,inv:new o,ray:new _,ndc:new D,plane:new c(new A(0,0,1),0),hit:new A}},[]);(0,I.useEffect)(()=>()=>{for(let e of[C.geo,C.L0,C.L1,C.smokeRT,C.lightMat,C.sprite,C.smokeMat,C.compMat,C.compGeo,C.bowlMat,C.stickMat,C.ashMat,C.bowlGeo,C.ashGeo,C.stickGeo,C.tipGeo,C.tipMat])e.dispose()},[C]);let E=(0,I.useRef)(!1);(0,I.useEffect)(()=>{let e=!0,t=n.getRenderTarget(),a=new y,o=new u(2,2);a.add(new O(o,x.velVar.material),new O(o,x.posVar.material));let s=new p(-1,1,1,-1,0,1),c=[];return n.setRenderTarget(x.gpu.getCurrentRenderTarget(x.posVar)),c.push(n.compileAsync(a,s)),n.setRenderTarget(C.L0),c.push(n.compileAsync(C.lightScene,C.lightCam)),n.setRenderTarget(C.smokeRT),c.push(n.compileAsync(C.smokeScene,i)),n.setRenderTarget(null),c.push(n.compileAsync(r,i)),n.setRenderTarget(t),Promise.all(c).catch(()=>{}).then(()=>{o.dispose(),e&&(E.current=!0)}),()=>{e=!1}},[n,x,C,r,i]);let j=(0,I.useRef)({t:0,ff:M?5:1.6,ghost:0,prev:new A,vel:new A,ps:0,hasPrev:!1,lastPtr:-1});return T((a,o)=>{let s=Math.min(o,1/30),c=j.current,u=e.current,{width:d,height:p}=a.size,m=d/p,h=d<760;i.position.set(0,G,K),i.lookAt(0,G,0);let g=2*Math.tan(k.degToRad(q/2))*K,_=g*m,v=h&&!M?Math.min(.8,_/4.6):1,y=M||h?0:Math.min(_*.2,_/2-2.6),b=h&&!M?G-g/2+g*.36:G-g/2+1.05;if(C.group.position.set(y,b+1.85*v,0),C.group.scale.setScalar(v),C.group.updateMatrixWorld(),C.smokePts.matrix.copy(C.group.matrixWorld),C.smokePts.matrixWorld.copy(C.group.matrixWorld),C.inv.copy(C.group.matrixWorld).invert(),!E.current){n.setRenderTarget(null),n.setClearColor(new f().setRGB(u.bg1[0],u.bg1[1],u.bg1[2],l),1),n.clear(!0,!0,!1);return}let S=t.current,w=performance.now(),ee=w-S.t<450,T=null;if(ee)C.ray.setFromCamera(C.ndc.set(S.x,S.y),i),C.ray.ray.intersectPlane(C.plane,C.hit)&&(T=C.hit.applyMatrix4(C.inv)),c.ghost=0;else if(w-S.t>5e3&&!M){c.ghost+=s;let e=c.ghost%11;if(e>3&&e<5.6){let t=(e-3)/2.6,n=t*t*(3-2*t),r=Math.floor(c.ghost/11)%2?-1:1;T=C.hit.set(r*(-2.8+5.6*n),3+Math.sin(t*3.1)*.7,0)}}T?(c.hasPrev&&(C.v.copy(T).sub(c.prev).divideScalar(Math.max(s,.001)),C.v.length()>14&&C.v.setLength(14),c.vel.lerp(C.v,1-Math.exp(-s*18))),c.prev.copy(T),c.hasPrev=!0):(c.hasPrev=!1,c.vel.multiplyScalar(Math.exp(-s*6))),c.ps=k.damp(c.ps,+!!T,10,s);let D=c.ff>0?3:1;c.ff-=s;let O=x.velVar.material.uniforms,A=x.posVar.material.uniforms;for(let e=0;e<D;e++)c.t+=s,O.uDt.value=s,O.uTime.value=c.t,O.uPS.value=c.ps,O.uPtr.value.copy(c.prev),O.uPtrVel.value.copy(c.vel),A.uDt.value=s,A.uTime.value=c.t,x.gpu.compute();let te=x.gpu.getCurrentRenderTarget(x.posVar).texture,N=C.L.set(u.L[0],u.L[1],u.L[2]).normalize();C.lightCam.position.copy(J).addScaledVector(N,Y*2),C.lightCam.up.set(0,1,0),Math.abs(N.y)>.92&&C.lightCam.up.set(0,0,-1),C.lightCam.lookAt(J),C.lightCam.updateMatrixWorld(),C.lightVP.multiplyMatrices(C.lightCam.projectionMatrix,C.lightCam.matrixWorldInverse);let P=C.lightMat.uniforms;P.tPos.value=te,P.uDensity.value=u.dens,n.setClearColor(0,0);for(let e=0;e<2;e++)P.uBase.value=e*4,n.setRenderTarget(e?C.L1:C.L0),n.clear(!0,!1,!1),n.render(C.lightScene,C.lightCam);n.getDrawingBufferSize(C.buf);let F=Math.max(2,Math.round(C.buf.x*.5)),I=Math.max(2,Math.round(C.buf.y*.5));(C.smokeRT.width!==F||C.smokeRT.height!==I)&&C.smokeRT.setSize(F,I);let L=Math.tan(k.degToRad(q/2)),R=C.smokeMat.uniforms;R.tPos.value=te,R.uDensity.value=u.dens,R.uScale.value=I/(2*L)*v,R.uKeyI.value=u.keyI,R.uG.value=u.g,R.uInk.value=u.ink,R.uL.value.copy(N),R.uKey.value.fromArray(u.key),R.uAmbLo.value.fromArray(u.ambLo),R.uAmbHi.value.fromArray(u.ambHi),R.uCam.value.copy(i.position).applyMatrix4(C.inv),n.setRenderTarget(C.smokeRT),n.clear(!0,!1,!1),n.render(C.smokeScene,i);let z=C.compMat.uniforms;z.uBg0.value.fromArray(u.bg0),z.uBg1.value.fromArray(u.bg1),z.uGlowCol.value.fromArray(u.glow),z.uGlowI.value=u.glowI,z.uRays.value=u.rays,z.uInk.value=u.ink,z.uAspect.value=m,z.uTime.value=c.t;let B=C.lp.copy(J).addScaledVector(N,7).applyMatrix4(C.group.matrixWorld).project(i);z.uLightUV.value.set(k.clamp(B.x*.5+.5,-.25,1.25),k.clamp(B.y*.5+.5,-.25,1.25));let ne=C.v.set(0,-1.85,0).applyMatrix4(C.group.matrixWorld).project(i);z.uBaseUV.value.set(ne.x*.5+.5,ne.y*.5+.5);for(let[e,t]of[[C.bowlMat,u.base],[C.stickMat,u.stick],[C.ashMat,[.2,.19,.18]]]){let n=e.uniforms;n.uL.value.copy(N),n.uKey.value.fromArray(u.key),n.uBase.value.fromArray(t),n.uCamW.value.copy(i.position),n.uInk.value=u.ink,n.uKeyI.value=Math.min(1.2,u.keyI*.6)*(e===C.ashMat?.3:1)}C.tipMat.uniforms.uScale.value=C.buf.y/(2*L)*v,C.tipMat.uniforms.uTime.value=c.t,C.tipMat.uniforms.uInk.value=u.ink,n.setRenderTarget(null),n.render(r,i)},1),(0,V.jsxs)(V.Fragment,{children:[(0,V.jsx)(`primitive`,{object:C.comp}),(0,V.jsx)(`primitive`,{object:C.group})]})}function Se(){let[e,t]=(0,I.useState)(+!!M),[n,a]=(0,I.useState)(0),[o,s]=(0,I.useState)(1),[c,l]=(0,I.useState)(!M),[u,d]=(0,I.useState)(1.5),f=(0,I.useRef)(_e(e,n,o)),p=(0,I.useRef)({x:0,y:0,t:-1e9}),m=(0,I.useRef)(null),h=(0,I.useRef)(!0);(0,I.useEffect)(()=>{let t=_e(e,n,o);if(h.current){h.current=!1,f.current=t;return}let i=ve(f.current),a=r(0,1,{duration:1.4,ease:[.45,0,.2,1],onUpdate:e=>{let n=f.current;for(let r of ge)n[r]=i[r]+(t[r]-i[r])*e;for(let r of he)for(let a=0;a<3;a++)n[r][a]=i[r][a]+(t[r][a]-i[r][a])*e}});return()=>a.stop()},[e,n,o]),(0,I.useEffect)(()=>{if(!c)return;let e=setInterval(()=>t(e=>(e+1)%Z.length),9e3);return()=>clearInterval(e)},[c]),(0,I.useEffect)(()=>{let e=m.current,t=t=>{let n=e.getBoundingClientRect();p.current.x=(t.clientX-n.left)/n.width*2-1,p.current.y=-((t.clientY-n.top)/n.height*2-1),p.current.t=performance.now()},n=e=>{(e.pointerType===`mouse`||e.buttons!==0)&&t(e)};return e.addEventListener(`pointermove`,n),e.addEventListener(`pointerdown`,t),()=>{e.removeEventListener(`pointermove`,n),e.removeEventListener(`pointerdown`,t)}},[]);let g=Q[n],_=Z[e];return(0,V.jsxs)(`div`,{className:`stage vs-root`,"data-mode":g.key,style:{background:g.bg1},children:[(0,V.jsx)(`style`,{children:Ce}),(0,V.jsx)(`div`,{ref:m,className:`vs-canvas`,children:(0,V.jsxs)(j,{dpr:u,flat:!0,gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,G,K],fov:q,near:.1,far:100},children:[(0,V.jsx)(P,{onDecline:()=>d(e=>Math.max(.85,e*.8)),flipflops:3}),(0,V.jsx)(xe,{look:f,ptr:p})]})}),(0,V.jsxs)(`div`,{className:`overlay`,children:[(0,V.jsxs)(i.div,{className:`hero-copy vs-copy`,initial:{opacity:0,y:14,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.2,ease:[.23,1,.32,1]},children:[(0,V.jsx)(`div`,{className:`scrim`}),(0,V.jsxs)(`p`,{className:`kicker`,children:[(0,V.jsx)(`i`,{}),_.en,` · `,fe.toLocaleString(),` soft particles`]}),(0,V.jsx)(`h1`,{children:`让光穿过烟`}),(0,V.jsx)(`p`,{children:`烟会给自己投下阴影。逆光时，只剩一圈发亮的边。划过去，把它搅开。`})]}),(0,V.jsxs)(`div`,{className:`dock vs-dock`,children:[(0,V.jsx)(N,{items:Z.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:e=>{t(e),l(!1)}}),(0,V.jsx)(`span`,{className:`dock-sep`}),(0,V.jsx)(N,{items:Q.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:a}),(0,V.jsx)(`span`,{className:`dock-sep`}),H?(0,V.jsx)(`button`,{className:`seg vs-dens`,"aria-label":`浓度 ${$[o].label}`,onClick:()=>s(e=>(e+1)%$.length),children:(0,V.jsxs)(`span`,{children:[$.map(e=>(0,V.jsx)(`i`,{"data-on":e.value<=o},e.value)),$[o].label]})}):(0,V.jsx)(N,{items:$.map(e=>({value:e.value,label:e.label})),value:o,onChange:s})]}),(0,V.jsxs)(`p`,{className:`hint`,children:[`划过烟雾把它搅开`,(0,V.jsx)(`br`,{}),`静置时会有一阵风吹过`]})]})]})}var Ce=`
.vs-canvas { position: absolute; inset: 0; touch-action: none; }
.vs-root { transition: background .8s; }
.vs-copy { --soft-bg: #08080c; pointer-events: none !important; }
.vs-copy h1 { font-size: clamp(40px, 5vw, 68px); }
.vs-copy p:not(.kicker) { max-width: 360px; }
.vs-copy .kicker i { background: #ffcf9a; box-shadow: 0 0 10px #ffcf9a; }
.vs-root[data-mode='neon'] .vs-copy .kicker i { background: #ff58c0; box-shadow: 0 0 10px #ff58c0; }
.vs-root[data-mode='ink'] .vs-copy { --soft-bg: #f0e9dd; }
.vs-root[data-mode='ink'] .vs-copy .kicker i { background: #b8322a; box-shadow: none; }
.vs-copy .scrim { opacity: .55; transition: opacity .8s; }
.demo-page:has(.vs-root[data-mode='ink']) {
  --fg: #1f1c18;
  --fg-2: rgba(31, 28, 24, .62);
  --glass: rgba(250, 245, 236, .6);
  --glass-line: rgba(31, 28, 24, .1);
  color-scheme: light;
}
.demo-page:has(.vs-root) .chip, .demo-page:has(.vs-root) .overlay { transition: background .6s, color .6s; }
@media (max-width: 760px) {
  .vs-copy { bottom: 84px; }
  .vs-copy h1 { font-size: 34px; }
  .vs-copy p:not(.kicker) { font-size: 13.5px; margin-top: 10px; }
  .vs-copy .kicker { margin-bottom: 12px; font-size: 11px; }
  .vs-dock .seg { padding: 0 9px; }
  .vs-dock .dock-sep { margin: 0 1px; }
  .vs-dens i { display: inline-block; width: 3px; height: 10px; margin-right: 2px; border-radius: 2px; background: currentColor; opacity: .25; vertical-align: -1px; }
  .vs-dens i:nth-of-type(3) { margin-right: 6px; }
  .vs-dens i[data-on='true'] { opacity: 1; }
}
`;export{Se as default};