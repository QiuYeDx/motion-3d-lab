import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{B as s,Ct as c,E as l,Ft as u,Gt as d,Kt as f,Lt as p,Mt as m,P as h,Pt as g,Rt as _,Sn as v,T as y,Xt as b,Yt as x,at as S,bn as C,ct as ee,et as w,fn as T,h as E,ht as D,in as O,it as k,j as A,pt as j,rt as te,u as M,ut as N,vn as P,wt as F,xt as I,yn as L}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as ne}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as R}from"./iso-CLB38p39.js";import{t as z}from"./Seg-CH5KfWEm.js";import{t as re}from"./PerformanceMonitor-DOuNfnyh.js";var B=e(t(),1),V=`
uniform float uTime;
uniform float uL;
uniform float uSurf;
uniform sampler2D uSim;
uniform float uSimAmp;
uniform float uWaveAmp;
uniform float uRough;
vec3 wave1(vec2 p, vec2 mn, float a, float w, float ph) {
  vec2 k = (6.2831853 / uL) * mn;
  float th = dot(k, p) - w * uTime + ph;
  return a * vec3(sin(th), k * cos(th));
}
vec3 water(vec2 p) {
  vec3 w = wave1(p, vec2(6.0, 7.0), 0.045, 1.25, 0.0);
  w += wave1(p, vec2(-9.0, 4.0), 0.040, 1.40, 1.7);
  w += wave1(p, vec2(3.0, -10.0), 0.035, 1.55, 4.1);
  w += wave1(p, vec2(-7.0, -8.0), 0.030, 1.70, 2.3);
  w += wave1(p, vec2(12.0, 1.0), 0.022, 1.95, 5.2);
  w += wave1(p, vec2(2.0, 14.0), 0.016, 2.20, 0.6);
  w *= 0.6;
  w += wave1(p, vec2(2.0, 1.0), 0.08, 0.45, 3.0);
  w *= uWaveAmp;
  // rough water: a bigger swell and choppy short waves on top
  w += uRough * (wave1(p, vec2(3.0, -2.0), 0.12, 0.7, 1.0) + wave1(p, vec2(15.0, -9.0), 0.009, 2.9, 1.1)
               + wave1(p, vec2(-12.0, 16.0), 0.007, 3.3, 3.9) + wave1(p, vec2(-5.0, 9.0), 0.016, 1.9, 0.4));
  vec2 uv = p / uL + 0.5;
  const float e = 1.0 / 128.0;
  float h = texture2D(uSim, uv).r;
  float hx = texture2D(uSim, uv + vec2(e, 0.0)).r - texture2D(uSim, uv - vec2(e, 0.0)).r;
  float hz = texture2D(uSim, uv + vec2(0.0, e)).r - texture2D(uSim, uv - vec2(0.0, e)).r;
  float k = 128.0 / (2.0 * uL);
  w += uSimAmp * vec3(h, hx * k, hz * k);
  return w;
}
`,ie=`
uniform vec3 uSunAir;
uniform float uEta;
varying vec2 vOld;
varying vec2 vNew;
${V}
void main() {
  vec2 p = position.xz;
  vec3 w = water(p);
  vec3 N = normalize(vec3(-w.y, 1.0, -w.z));
  vec3 rd = refract(uSunAir, N, uEta);
  vec3 rf = refract(uSunAir, vec3(0.0, 1.0, 0.0), uEta);
  float y0 = uSurf + w.x;
  vec2 hit = p + rd.xz * (y0 / -rd.y);
  // map coords: subtract the flat-water offset so the map is indexed by "surface point above"
  vec2 m = hit - rf.xz * (uSurf / -rf.y);
  vOld = p;
  vNew = m;
  gl_Position = vec4(m / (0.5 * uL), 0.0, 1.0);
}
`,ae=`
uniform vec3 uMask;
varying vec2 vOld;
varying vec2 vNew;
void main() {
  vec2 ox = dFdx(vOld), oy = dFdy(vOld);
  vec2 nx = dFdx(vNew), ny = dFdy(vNew);
  float a0 = abs(ox.x * oy.y - ox.y * oy.x);
  float a1 = abs(nx.x * ny.y - nx.y * ny.x);
  float I = min(a0 / max(a1, 1e-7), 14.0);
  gl_FragColor = vec4(uMask * I, 1.0);
}
`,H=`
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`,oe=`
uniform float uTime;
uniform float uRough;
varying vec3 vPw;
varying vec3 vNw;
varying vec2 vUv;

float dune(vec2 p) {
  float r = length(p);
  float h = 0.42 * sin(p.x * 0.21 + 1.0) * sin(p.y * 0.17) + 0.3 * sin(p.x * 0.09 - p.y * 0.13 + 2.0) + 0.12 * sin(p.x * 0.5 + p.y * 0.3);
  return h * smoothstep(2.5, 9.0, r) + 0.6 * smoothstep(14.0, 40.0, -p.y) - 0.04;
}

void main() {
  vec3 pos = position;
  vec3 nrm = normal;
  vUv = uv;
#ifdef GRASS
  vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float k = uv.y * uv.y;
  pos.x *= 1.0 - uv.y * 0.75;
  float sway = sin(uTime * 1.1 + base.x * 0.6 + base.z * 0.4) * (0.32 + 0.25 * uRough) + sin(uTime * 2.3 + base.z * 1.3) * 0.08;
  pos.x += sway * k;
  pos.z += 0.18 * sin(uTime * 0.9 + base.x * 1.7) * k;
#endif
#ifdef USE_INSTANCING
  vec4 wp = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  vNw = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * nrm);
#else
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vNw = normalize(mat3(modelMatrix) * nrm);
#endif
#ifdef FLOOR
  float e = 0.15;
  float h0 = dune(wp.xz);
  wp.y += h0;
  vNw = normalize(vec3(h0 - dune(wp.xz + vec2(e, 0.0)), e, h0 - dune(wp.xz + vec2(0.0, e))));
#endif
  vPw = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,se=`
uniform float uTime;
uniform float uL;
uniform float uSurf;
uniform vec3 uAlbedo;
uniform sampler2D uCaus;
uniform vec3 uSunUW;
uniform vec2 uFlatOff;
uniform vec3 uSunCol;
uniform vec3 uSigma;
uniform float uLightDepth;
uniform vec3 uAmbTop;
uniform vec3 uAmbBot;
uniform float uCausLod;
uniform vec3 uVase;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
varying vec3 vPw;
varying vec3 vNw;
varying vec2 vUv;
${H}
float sand(vec2 p) {
  float n = vnoise(p * 0.35);
  return 0.035 * sin(dot(p, vec2(0.92, 0.39)) * 4.6 + n * 5.0) * (0.55 + 0.45 * vnoise(p * 0.9 + 7.0));
}
void main() {
  vec3 P = vPw;
  vec3 N = normalize(vNw);
  vec3 alb = uAlbedo;
  float ao = 1.0;
  float shadow = 1.0;
#ifdef FLOOR
  // wind-rippled sand: bump the normal with ridges, speckle the albedo
  float e = 0.04;
  float s0 = sand(P.xz);
  vec3 bn = normalize(vec3(s0 - sand(P.xz + vec2(e, 0.0)), e, s0 - sand(P.xz + vec2(0.0, e))));
  N = normalize(N + vec3(bn.x, 0.0, bn.z) * 1.6);
  float sp = hash12(floor(P.xz * 40.0));
  alb *= 0.86 + 0.14 * vnoise(P.xz * 1.7) + (sp > 0.93 ? 0.12 : 0.0) - (sp < 0.04 ? 0.18 : 0.0);
  alb *= 1.0 + 0.25 * (s0 / 0.035) * 0.3;
  // the amphora: contact shadow + a soft shadow cast along the light (vertical capsule)
  vec2 rp = P.xz - uVase.xz;
  ao = mix(0.35, 1.0, smoothstep(0.45, 1.9, length(rp)));
  vec2 dxz = uSunUW.xz / max(uSunUW.y, 0.2);
  float tm = clamp(-dot(rp, dxz) / max(dot(dxz, dxz), 1e-4), 0.0, 3.3);
  shadow = mix(0.25, 1.0, smoothstep(0.55, 1.15, length(rp + dxz * tm)));
#endif
#ifdef GRASS
  alb *= mix(0.55, 1.25, vUv.y);
  if (!gl_FrontFacing) N = -N;
#endif
#ifdef VASE
  // glazed cream body with a terracotta band and sandy wear near the foot
  float yv = P.y - uVase.y;
  alb = mix(alb, vec3(0.62, 0.26, 0.15), smoothstep(0.012, 0.0, abs(yv - 2.28) - 0.05));
  alb = mix(alb, vec3(0.62, 0.26, 0.15), smoothstep(0.012, 0.0, abs(yv - 1.02) - 0.025));
  alb = mix(alb, vec3(0.55, 0.48, 0.36), smoothstep(0.55, 0.0, yv) * (0.5 + 0.5 * vnoise(P.xz * 6.0 + yv * 3.0)));
  ao = mix(0.55, 1.0, smoothstep(0.0, 0.7, yv));
#endif
  // light reaching this point: the caustic pattern of the surface patch above it, attenuated by the water column
  vec2 m = P.xz - uFlatOff * (uSurf - P.y);
  vec3 caus = texture2D(uCaus, m / uL + 0.5, uCausLod).rgb;
  float dB = max(uSurf - P.y, 0.0) * uLightDepth;
  vec3 att = exp(-uSigma * dB);
  float ndl = dot(N, uSunUW);
#ifdef GRASS
  ndl = abs(ndl) * 0.8 + 0.2;
#endif
  ndl = max(ndl, 0.0);
  vec3 sun = uSunCol * att * ndl * caus * shadow;
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5) * exp(-uSigma * dB * 0.5) * ao;
  vec3 col = alb * (sun + amb * ao);
#ifdef VASE
  vec3 V = normalize(cameraPosition - P);
  vec3 R = reflect(-V, N);
  float fr = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  vec3 envc = mix(uFogDeep, uFogUp * 1.6, smoothstep(-0.3, 0.9, R.y)) + uSunCol * att * pow(max(dot(R, uSunUW), 0.0), 60.0) * 2.0;
  col += envc * fr * 0.8;
#endif
  gl_FragColor = vec4(col, length(P - cameraPosition));
}
`,ce=`
varying vec3 vPw;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPw = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`,le=`
uniform vec3 uSunUp;
uniform vec3 uSunCol;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
uniform float uSkyK;
varying vec3 vPw;
${V}
${H}
void main() {
  vec3 w = water(vPw.xz);
  vec3 Nd = -normalize(vec3(-w.y, 1.0, -w.z));
  vec3 V = normalize(vPw - cameraPosition);
  float ci = clamp(dot(-V, Nd), 0.0, 1.0);
  vec3 T = refract(V, Nd, 1.333);
  vec3 col;
  // the mirrored underwater world (total internal reflection) — dark, with a hint of the light above
  vec3 R = reflect(V, Nd);
  vec3 under = mix(uFogDeep * 0.6, uFogUp * 0.9, smoothstep(-1.0, -0.2, R.y));
  if (dot(T, T) < 1e-4) {
    col = under;
  } else {
    // Fresnel for water → air, evaluated on the transmitted side so it rises to 1 at the critical angle
    float ct = clamp(T.y, 0.0, 1.0);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(T, -Nd), 0.0), 5.0);
    float el = T.y;
    vec3 sky = mix(vec3(1.25, 1.35, 1.35), vec3(0.45, 0.78, 1.05), smoothstep(0.0, 0.85, el));
    // drifting clouds, seen through the moving lens of the surface
    vec2 cu = T.xz / max(T.y, 0.06) * 0.55 + vec2(uTime * 0.012, uTime * 0.004);
    float cl = vnoise(cu * 1.3) * 0.55 + vnoise(cu * 2.9 + 3.1) * 0.3 + vnoise(cu * 6.5 - 1.7) * 0.15;
    cl = smoothstep(0.42, 0.78, cl) * smoothstep(0.04, 0.3, el);
    sky = mix(sky, vec3(1.7, 1.75, 1.8), cl * 0.85);
    float sd = max(dot(T, uSunUp), 0.0);
    sky += vec3(1.0, 0.95, 0.85) * (pow(sd, 900.0) * 40.0 + pow(sd, 40.0) * 1.6 + pow(sd, 6.0) * 0.35);
    // the compressed horizon at the window rim picks up a slight prismatic fringe
    sky *= vec3(1.0 + 0.15 * smoothstep(0.08, 0.0, ct), 1.0, 1.0 + 0.2 * smoothstep(0.03, 0.12, ct) * smoothstep(0.2, 0.1, ct));
    col = mix(sky * uSkyK, under, F);
  }
  gl_FragColor = vec4(col, length(vPw - cameraPosition));
}
`,ue=`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`,U=`
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
vec3 viewDir(vec2 uv) {
  vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  p /= p.w;
  return normalize((uCamWorld * vec4(p.xyz, 0.0)).xyz);
}
`,de=`
uniform sampler2D tScene;
uniform sampler2D uCaus;
uniform vec3 uCamPos;
uniform float uL;
uniform float uSurf;
uniform vec2 uFlatOff;
uniform vec3 uSigma;
uniform float uLightDepth;
uniform vec3 uSunCol;
uniform vec3 uSunUW;
uniform float uRayK;
uniform float uFrame;
varying vec2 vUv;
${U}
#define STEPS 34
void main() {
  vec3 dir = viewDir(vUv);
  float d = texture2D(tScene, vUv).a;
  d = d < 0.001 ? 34.0 : min(d, 34.0);
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy + uFrame * 5.588238, vec2(0.06711056, 0.00583715))));
  float st = d / float(STEPS);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float t = (float(i) + j) * st;
    vec3 S = uCamPos + dir * t;
    if (S.y > uSurf) break;
    vec2 m = S.xz - uFlatOff * (uSurf - S.y);
    vec3 c = textureLod(uCaus, m / uL + 0.5, 3.6).rgb;
    vec3 sh = c * c * c;
    acc += sh * exp(-uSigma * ((uSurf - S.y) * uLightDepth + t));
  }
  float mu = dot(dir, uSunUW);
  float g = 0.55;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.0065;
  gl_FragColor = vec4(acc * st * uRayK * hg * uSunCol, 1.0);
}
`,fe=`
uniform sampler2D tScene;
uniform sampler2D tRays;
uniform vec3 uSigma;
uniform vec3 uFogDeep;
uniform vec3 uFogUp;
uniform vec3 uSunUW;
uniform vec3 uSunCol;
uniform float uExposure;
uniform float uFade;
uniform vec2 uRes;
varying vec2 vUv;
${U}
void main() {
  vec4 s = texture2D(tScene, vUv);
  float d = s.a < 0.001 ? 200.0 : s.a;
  vec3 dir = viewDir(vUv);
  vec3 T = exp(-uSigma * d * 0.62);
  vec3 fog = mix(uFogDeep, uFogUp, smoothstep(-0.45, 0.95, dir.y));
  fog += uSunCol * uFogUp * pow(max(dot(dir, uSunUW), 0.0), 8.0) * 0.35;
  vec3 col = s.rgb * T + fog * (1.0 - T);
  // soften the half-res, jittered march: centre + four diagonal taps
  vec2 px = 1.0 / uRes;
  vec3 rays = texture2D(tRays, vUv).rgb * 0.2;
  rays += texture2D(tRays, vUv + vec2(2.5, 1.0) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-2.5, -1.0) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(1.0, -2.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-1.0, 2.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(4.5, 4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-4.5, 4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(4.5, -4.5) * px).rgb * 0.1;
  rays += texture2D(tRays, vUv + vec2(-4.5, -4.5) * px).rgb * 0.1;
  col += rays;
  col *= uExposure;
  // filmic shoulder, vignette, display gamma, dither
  col = col / (1.0 + col * 0.55);
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  vec2 sv = vUv - 0.5;
  col *= 1.0 - dot(sv, sv) * 0.75;
  col *= uFade;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 160.0;
  gl_FragColor = vec4(col, 1.0);
}
`,pe=`
attribute float aSeed;
uniform float uTime;
uniform float uPx;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
varying float vD;
varying float vY;
varying float vSeed;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.21 + aSeed * 6.0) * 0.4 + uTime * 0.05, -uTime * (0.05 + 0.06 * fract(aSeed * 7.3)), cos(uTime * 0.17 + aSeed * 4.0) * 0.4);
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vD = -mv.z;
  vY = p.y;
  vSeed = aSeed;
  gl_PointSize = clamp((0.6 + 1.4 * fract(aSeed * 13.1)) * uPx * 0.035 / max(vD, 0.3), 1.0, 9.0);
  gl_Position = projectionMatrix * mv;
}
`,me=`
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec3 uSigma;
uniform vec3 uFogUp;
uniform float uSurf;
uniform float uExposure;
uniform float uTime;
varying float vD;
varying float vY;
varying float vSeed;
void main() {
  float sd = texture2D(tScene, gl_FragCoord.xy / uRes).a;
  if (sd > 0.001 && sd < vD) discard;
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.2, 1.0, r);
  vec3 c = uFogUp * 1.6 * exp(-uSigma * ((uSurf - vY) * 0.7 + vD * 0.62));
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + vSeed * 2.0) + vSeed * 30.0);
  c *= a * tw * uExposure * smoothstep(0.25, 1.2, vD);
  gl_FragColor = vec4(pow(c / (1.0 + c), vec3(1.0 / 2.2)), 1.0);
}
`,W=n(),G=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,K=20,q=7,J=new L(0,-.12,0),he=G?768:1024,Y=G?700:1300,X=typeof window<`u`?Math.min(window.devicePixelRatio||1,G?1.5:1.25):1,Z=[{label:`浅`,note:`约 3 米 · 红光还在，光网锐利、明亮`,p:{sigma:[.2,.05,.046],fogDeep:[.006,.072,.078],fogUp:[.07,.48,.46],sun:[2.7,2.6,2.3],ambTop:[.1,.3,.29],ambBot:[.025,.07,.07],rayK:.7,causLod:0,lightDepth:.7,skyK:1.25,exposure:1.05}},{label:`中`,note:`约 8 米 · 红光被吃掉，海水只剩青绿`,p:{sigma:[.25,.072,.06],fogDeep:[.004,.034,.042],fogUp:[.05,.28,.3],sun:[2.6,2.55,2.35],ambTop:[.05,.2,.22],ambBot:[.01,.04,.05],rayK:1,causLod:.1,lightDepth:1,skyK:1.1,exposure:1.1}},{label:`深`,note:`约 15 米 · 只剩蓝光，焦散变糊，光柱更显`,p:{sigma:[.36,.105,.072],fogDeep:[.002,.012,.03],fogUp:[.018,.12,.22],sun:[2.5,2.5,2.6],ambTop:[.025,.1,.16],ambBot:[.004,.015,.03],rayK:1.5,causLod:.8,lightDepth:1.5,skyK:.8,exposure:1.25}}],Q=[{label:`平静`,v:0},{label:`汹涌`,v:1}];function ge(){let e=16384,t=new Float32Array(e),n=new Float32Array(e),r=new s(t,128,128,d,w);return r.wrapS=r.wrapT=f,r.magFilter=r.minFilter=j,r.needsUpdate=!0,{tex:r,step:()=>{for(let e=0;e<128;e++){let r=(e+128-1)%128*128,i=(e+1)%128*128,a=e*128;for(let e=0;e<128;e++){let o=(e+128-1)%128,s=(e+1)%128,c=a+e,l=(t[a+o]+t[a+s]+t[r+e]+t[i+e])*.25;n[c]=(n[c]+(l-t[c])*.7)*.994}}for(let r=0;r<e;r++)t[r]+=n[r]},drop:(e,n,r,i)=>{let a=(e/K+.5)*128,o=(n/K+.5)*128,s=r/K*128,c=Math.ceil(s);for(let e=-c;e<=c;e++)for(let n=-c;n<=c;n++){let r=Math.floor(a)+n,c=Math.floor(o)+e,l=Math.hypot(r+.5-a,c+.5-o)/s;if(l>=1)continue;let u=(c%128+128)%128*128+(r%128+128)%128;t[u]-=i*.5*(Math.cos(Math.PI*l)+1)}},upload:()=>void(r.needsUpdate=!0)}}function _e(){let e=new O([[.001,0],[.3,0],[.36,.06],[.31,.2],[.33,.38],[.55,.75],[.82,1.25],[.93,1.75],[.88,2.15],[.7,2.48],[.42,2.75],[.29,2.95],[.26,3.2],[.3,3.36],[.39,3.44],[.36,3.5],[.24,3.47],[.2,3.2]].map(([e,t])=>new P(e,t))),t=new N(e.getPoints(110),72),n=e=>new T(new A([new L(.2*e,3.12,0),new L(.55*e,3.2,0),new L(.8*e,3,0),new L(.8*e,2.62,0),new L(.62*e,2.36,0)]),48,.07,12);return[t,n(1),n(-1)]}function ve(e){let t=new S(1,2),n=t.attributes.position,r=new L;for(let t=0;t<n.count;t++){r.fromBufferAttribute(n,t).normalize();let i=.22*Math.sin(r.x*2.1+e)*Math.sin(r.y*2.7+e*1.3)+.12*Math.sin(r.z*4.3+r.x*3.1+e*2.1)+.06*Math.sin(r.y*9+r.z*7+e);r.multiplyScalar(1+i),r.y=r.y<0?r.y*.35:r.y*.72,n.setXYZ(t,r.x,r.y,r.z)}return t.computeVertexNormals(),t}var ye=[{p:[-3.1,0,-1.2],s:[1.25,1.1,1.05],seed:1},{p:[3.3,0,-3.4],s:[.9,.8,.85],seed:2.6},{p:[-1.55,0,2.3],s:[.48,.45,.5],seed:4.1},{p:[4.6,0,1.4],s:[.62,.5,.58],seed:5.3},{p:[-6.8,0,-6.5],s:[2,1.6,1.8],seed:6.7},{p:[1.3,0,1.6],s:[.28,.25,.3],seed:8.2}],be=[{p:[-2.4,-2.2],n:70,r:.9},{p:[-4.2,-.2],n:45,r:.7},{p:[2.6,-2.5],n:60,r:.8},{p:[4.1,2.2],n:35,r:.55},{p:[-6,-4.6],n:60,r:1.2},{p:[1,2.4],n:22,r:.4}];function xe(e,t,n){let r=t.dot(e),i=1-n*n*(1-r*r);return e.clone().multiplyScalar(n).addScaledVector(t,-(n*r+Math.sqrt(Math.max(i,0))))}function Se({depth:e,rough:t,dropReq:n,onReady:r}){let i=E(e=>e.gl),a=E(e=>e.size),o=(0,B.useMemo)(()=>{let e=ge(),t=new L(-.3,-1,.22).normalize(),n=xe(t,new L(0,1,0),1/1.333),r=n.clone().negate(),i=new P(n.x/-n.y,n.z/-n.y),a=new v(he,he,{type:k,depthBuffer:!1,generateMipmaps:!0,minFilter:D,magFilter:j,wrapS:f,wrapT:f}),o=new v(4,4,{type:k,samples:4}),s=new v(4,4,{type:k,depthBuffer:!1}),d=()=>({value:new L}),S={uTime:{value:0},uL:{value:K},uSurf:{value:q},uSim:{value:e.tex},uSimAmp:{value:.6},uWaveAmp:{value:1},uRough:{value:0},uSunAir:{value:t},uCaus:{value:a.texture},uSunUW:{value:r},uSunUp:{value:t.clone().negate()},uFlatOff:{value:i},uSunCol:d(),uSigma:d(),uLightDepth:{value:1},uAmbTop:d(),uAmbBot:d(),uCausLod:{value:0},uVase:{value:J},uFogDeep:d(),uFogUp:d(),uSkyK:{value:1},uRayK:{value:1},uExposure:{value:1},uFade:{value:0},uFrame:{value:0},uCamPos:d(),uInvProj:{value:new c},uCamWorld:{value:new c},uRes:{value:new P(1,1)},tScene:{value:o.texture},tRays:{value:s.texture},uPx:{value:900},uBoxMin:{value:new L(-12,-.2,-16)},uBoxSize:{value:new L(24,7.2,26)}},C=new g(-1,1,1,-1,0,1),w=[a,o,s,e.tex],T=e=>(w.push(e),e),E=new x,O=T(new p(24,24,G?170:230,G?170:230).rotateX(-Math.PI/2));for(let[e,t]of[[1/1.3,[1,0,0]],[1/1.333,[0,1,0]],[1/1.37,[0,0,1]]]){let n=T(new b({vertexShader:ie,fragmentShader:ae,uniforms:{...S,uEta:{value:e},uMask:{value:new L(...t)}},blending:5,blendEquation:100,blendSrc:201,blendDst:201,side:2,depthTest:!1,depthWrite:!1,toneMapped:!1})),r=new F(O,n);r.frustumCulled=!1,E.add(r)}let A=new x,M=(e,t,n=0)=>T(new b({vertexShader:oe,fragmentShader:se,defines:e,uniforms:{...S,uAlbedo:{value:new h(t)}},side:n,toneMapped:!1})),N=T(new p(170,170,G?160:240,G?160:240).rotateX(-Math.PI/2)),I=new F(N,M({FLOOR:``},`#d9c7a2`));I.frustumCulled=!1,A.add(I);let ne=M({VASE:``},`#e8dcc6`),R=new te;for(let e of _e())R.add(new F(T(e),ne));R.position.copy(J),R.rotation.set(.05,.4,-.09),A.add(R);let z=M({},`#5c6a66`);for(let e of ye){let t=new F(T(ve(e.seed)),z);t.position.set(...e.p),t.scale.set(...e.s),t.rotation.y=e.seed,A.add(t)}let re=T(new p(.08,1,1,7).translate(0,.5,0)),B=be.reduce((e,t)=>e+t.n,0),V=new ee(re,M({GRASS:``},`#3f8a52`,2),B),H=new m,U=0,W=7,X=()=>(W=W*16807%2147483647)/2147483647;for(let e of be)for(let t=0;t<e.n;t++){let t=X()*Math.PI*2,n=Math.sqrt(X())*e.r;H.position.set(e.p[0]+Math.cos(t)*n,-.05,e.p[1]+Math.sin(t)*n),H.rotation.set((X()-.5)*.25,X()*Math.PI,(X()-.5)*.25);let r=.6+X()*1.4*(1-n/e.r*.5);H.scale.set(.8+X()*.6,r,1),H.updateMatrix(),V.setMatrixAt(U++,H.matrix)}V.frustumCulled=!1,A.add(V);let Z=new F(T(new p(240,240).rotateX(-Math.PI/2)),T(new b({vertexShader:ce,fragmentShader:le,uniforms:S,side:2,toneMapped:!1})));Z.position.y=q,Z.frustumCulled=!1,A.add(Z);let Q=T(new p(2,2)),Se=e=>{let t=new x,n=new F(Q,T(new b({vertexShader:ue,fragmentShader:e,uniforms:S,depthTest:!1,depthWrite:!1,toneMapped:!1})));return n.frustumCulled=!1,t.add(n),t},Ce=Se(de),we=Se(fe),Te=T(new l),$=new Float32Array(Y*3),Ee=new Float32Array(Y);for(let e=0;e<Y;e++)$[e*3]=-12+Math.random()*24,$[e*3+1]=Math.random()*q,$[e*3+2]=-16+Math.random()*26,Ee[e]=Math.random();Te.setAttribute(`position`,new y($,3)),Te.setAttribute(`aSeed`,new y(Ee,1));let De=new _(Te,T(new b({vertexShader:pe,fragmentShader:me,uniforms:S,transparent:!0,depthTest:!1,depthWrite:!1,blending:2,toneMapped:!1})));De.frustumCulled=!1;let Oe=new x;return Oe.add(De),{ripples:e,U:S,causRT:a,sceneRT:o,raysRT:s,causScene:E,scene:A,raysScene:Ce,compScene:we,snowScene:Oe,ortho:C,cam:new u(64,1,.1,400),disposables:w,flatOff:i}},[]);(0,B.useEffect)(()=>()=>o.disposables.forEach(e=>e.dispose()),[o]);let s=(0,B.useRef)(!1);(0,B.useEffect)(()=>{let e=!1,t=requestAnimationFrame(()=>{if(e)return;let t=i.getRenderTarget();o.sceneRT.setSize(8,8),o.raysRT.setSize(8,8);let n=[];i.setRenderTarget(o.causRT),n.push(i.compileAsync(o.causScene,o.ortho)),i.setRenderTarget(o.sceneRT),n.push(i.compileAsync(o.scene,o.cam)),i.setRenderTarget(o.raysRT),n.push(i.compileAsync(o.raysScene,o.ortho)),i.setRenderTarget(null),n.push(i.compileAsync(o.compScene,o.ortho)),n.push(i.compileAsync(o.snowScene,o.cam)),i.setRenderTarget(t),Promise.all(n).catch(()=>{}).then(()=>{e||(s.current=!0,r())})});return()=>{e=!0,cancelAnimationFrame(t)}},[o,i,r]);let d=(0,B.useMemo)(()=>({t:R?30:0,clock:0,acc:0,fade:+!!R,frame:0,lastDrop:0,nextAuto:2.2,buf:new P,fwd:new L,tmp:new L,v4:new C,lastUser:-1e9}),[]),S=(0,B.useCallback)((e,t,n=1)=>{let r=o.cam,i=d.v4.set(e,t,1,1).applyMatrix4(r.projectionMatrixInverse),a=d.tmp.set(i.x/i.w,i.y/i.w,i.z/i.w).transformDirection(r.matrixWorld),s=r.position,c,l;if(a.y>.02){let e=(q-s.y)/a.y;c=s.x+a.x*e,l=s.z+a.z*e}else{let e=Math.min((s.y-0)/Math.max(-a.y,.001),60);c=s.x+a.x*e-o.flatOff.x*q,l=s.z+a.z*e-o.flatOff.y*q}o.ripples.drop(c,l,.95,n)},[o,d]);return M((r,c)=>{if(!s.current){i.setRenderTarget(null),i.setClearColor(268834,1),i.clear();return}let l=Math.min(c,1/30),u=o.U;d.t+=R?0:l,d.clock+=l,d.frame++,d.fade=Math.min(1,d.fade+l*.8);let f=I.clamp(e.get(),0,2),p=Math.min(Math.floor(f),1),m=f-p,h=Z[p].p,g=Z[p+1].p,_=(e,t)=>e+(t-e)*m,v=(e,t,n)=>e.value.set(_(t[0],n[0]),_(t[1],n[1]),_(t[2],n[2]));v(u.uSigma,h.sigma,g.sigma),v(u.uFogDeep,h.fogDeep,g.fogDeep),v(u.uFogUp,h.fogUp,g.fogUp),v(u.uSunCol,h.sun,g.sun),v(u.uAmbTop,h.ambTop,g.ambTop),v(u.uAmbBot,h.ambBot,g.ambBot),u.uRayK.value=_(h.rayK,g.rayK),u.uCausLod.value=_(h.causLod,g.causLod),u.uLightDepth.value=_(h.lightDepth,g.lightDepth),u.uSkyK.value=_(h.skyK,g.skyK),u.uExposure.value=_(h.exposure,g.exposure);let y=t.get();u.uRough.value=y,u.uWaveAmp.value=1+.3*y,u.uTime.value=d.t,u.uFade.value=d.fade*d.fade*(3-2*d.fade),u.uFrame.value=d.frame%64;let b=n.current;if(b.n!==d.lastDrop&&(d.lastDrop=b.n,d.lastUser=d.clock,S(b.x,b.y,1.6)),!R&&d.clock>d.nextAuto&&(d.nextAuto=d.clock+2.8+Math.random()*2.6,d.clock-d.lastUser>6)){let e=Math.random()*Math.PI*2,t=.8+Math.random()*3;o.ripples.drop(Math.cos(e)*t-o.flatOff.x*q,Math.sin(e)*t-o.flatOff.y*q,.5,.8)}d.acc+=R?0:l;let x=0;for(;d.acc>=1/60&&x<3;)o.ripples.step(),d.acc-=1/60,x++;x&&o.ripples.upload();let C=a.width,ee=a.height,w=C<760,T=o.cam,E=R?0:d.clock,D=.22+.16*Math.sin(E*.045)+.05*Math.sin(E*.11),O=(w?8.4:6.8)+.4*Math.sin(E*.06),k=1.1+.15*Math.sin(E*.13+1),A=(w?.36:.37)+.08*Math.sin(E*.09+2);T.position.set(J.x+Math.sin(D)*O,k,J.z+Math.cos(D)*O),d.fwd.set(-Math.sin(D)*Math.cos(A),Math.sin(A),-Math.cos(D)*Math.cos(A)),T.lookAt(d.tmp.copy(T.position).add(d.fwd)),T.fov=w?82:68,T.aspect=C/ee,T.updateProjectionMatrix();let j=R||w?0:.3,te=R?.08:w?.44:.15;T.projectionMatrix.elements[8]-=j,T.projectionMatrix.elements[9]-=te,T.projectionMatrixInverse.copy(T.projectionMatrix).invert(),T.updateMatrixWorld(),u.uInvProj.value.copy(T.projectionMatrixInverse),u.uCamWorld.value.copy(T.matrixWorld),u.uCamPos.value.copy(T.position),i.getDrawingBufferSize(d.buf);let M=Math.max(2,Math.floor(d.buf.x)),N=Math.max(2,Math.floor(d.buf.y));(o.sceneRT.width!==M||o.sceneRT.height!==N)&&(o.sceneRT.setSize(M,N),o.raysRT.setSize(Math.max(2,M>>1),Math.max(2,N>>1))),u.uRes.value.set(M,N),u.uPx.value=N/(2*Math.tan(T.fov*Math.PI/360));let P=i.autoClear;i.autoClear=!1,i.setClearColor(0,0),i.setRenderTarget(o.causRT),i.clear(!0,!1,!1),i.render(o.causScene,o.ortho),i.setRenderTarget(o.sceneRT),i.clear(!0,!0,!1),i.render(o.scene,T),i.setRenderTarget(o.raysRT),i.render(o.raysScene,o.ortho),i.setRenderTarget(null),i.render(o.compScene,o.ortho),i.render(o.snowScene,T),i.autoClear=P},1),null}function Ce(){let[e,t]=(0,B.useState)(1),[n,s]=(0,B.useState)(0),[c,l]=(0,B.useState)(!1),[u,d]=(0,B.useState)(X),[f,p]=(0,B.useState)(0),m=i(1),h=i(0),g=(0,B.useRef)({n:0,x:0,y:0});(0,B.useEffect)(()=>{let t=r(m,e,{duration:1.6,ease:[.4,0,.2,1]});return()=>t.stop()},[e,m]),(0,B.useEffect)(()=>{let e=r(h,Q[n].v,{duration:2.2,ease:`easeInOut`});return()=>e.stop()},[n,h]);let _=(0,B.useCallback)(()=>l(!0),[]),v=e=>{if(e.target.closest(`.dock, button, a, input, .demo-chrome`))return;let t=e.currentTarget.getBoundingClientRect(),n=g.current;n.x=(e.clientX-t.left)/t.width*2-1,n.y=-((e.clientY-t.top)/t.height*2-1),n.n++,p(e=>e+1)},y=Z[e];return(0,W.jsxs)(`div`,{className:`stage uc`,style:{background:`#041a22`,touchAction:`manipulation`},onPointerDown:v,children:[(0,W.jsx)(`style`,{children:we}),(0,W.jsxs)(ne,{dpr:u,gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},children:[(0,W.jsx)(re,{onDecline:()=>d(e=>Math.max(.6,e*.82)),onIncline:()=>d(e=>Math.min(X,e*1.12)),flipflops:3}),(0,W.jsx)(Se,{depth:m,rough:h,dropReq:g,onReady:_})]}),(0,W.jsx)(a.div,{className:`uc-veil`,initial:{opacity:1},animate:{opacity:+!c},transition:{duration:1.2,ease:`easeOut`}}),(0,W.jsxs)(`div`,{className:`overlay`,children:[(0,W.jsxs)(a.div,{className:`hero-copy uc-copy`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.35,ease:[.23,1,.32,1]},children:[(0,W.jsx)(`div`,{className:`scrim`}),(0,W.jsxs)(`p`,{className:`kicker`,children:[(0,W.jsx)(`i`,{}),` Caustics · God rays · Snell's window`]}),(0,W.jsx)(`h1`,{children:`水下焦散`}),(0,W.jsx)(`p`,{className:`uc-lede`,children:`海面的每一道起伏都是一枚小透镜，把阳光聚成游动的光网，投在沙地和陶罐上。抬头看，整片天空被压进头顶一圈明亮的「斯涅尔窗」。`}),(0,W.jsx)(`div`,{className:`uc-meta`,children:(0,W.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,W.jsx)(a.span,{initial:{opacity:0,y:8,filter:`blur(4px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},exit:{opacity:0,y:-6,filter:`blur(4px)`},transition:{duration:.45,ease:[.23,1,.32,1]},children:y.note},y.label)})}),(0,W.jsxs)(`p`,{className:`uc-count`,children:[`已投下 `,(0,W.jsx)(`b`,{children:f}),` 滴`]})]}),(0,W.jsxs)(`div`,{className:`dock uc-dock`,children:[(0,W.jsx)(`span`,{className:`uc-label`,children:`水深`}),(0,W.jsx)(z,{items:Z.map((e,t)=>({value:t,label:e.label})),value:e,onChange:t}),(0,W.jsx)(`span`,{className:`dock-sep`}),(0,W.jsx)(`span`,{className:`uc-label`,children:`波浪`}),(0,W.jsx)(z,{items:Q.map((e,t)=>({value:t,label:e.label})),value:n,onChange:s})]}),(0,W.jsxs)(`p`,{className:`hint`,children:[`点击任意处 → 水面落下一滴`,(0,W.jsx)(`br`,{}),`光网随涟漪扭动、荡开`]})]})]})}var we=`
.uc-veil { position: absolute; inset: 0; background: #041a22; pointer-events: none; }
.uc .uc-copy { --soft-bg: rgba(2, 18, 24, .78); }
.uc .kicker i { background: #7ff0e0; box-shadow: 0 0 10px #7ff0e0; }
.uc .uc-copy h1 { font-size: clamp(42px, 5vw, 68px); }
.uc .uc-lede { max-width: 370px; font-size: 15px; }
.uc-meta { margin-top: 22px; min-height: 20px; font: 500 12px/1.6 var(--mono); letter-spacing: .02em; color: var(--fg-2); }
.uc-meta span { display: inline-block; }
.uc-count { margin-top: 10px !important; font: 500 12px/1 var(--mono) !important; color: var(--fg-2); }
.uc-count b { color: #7ff0e0; font-weight: 600; }
.uc-label { padding: 0 4px 0 10px; font: 500 12px/1 var(--sans); color: var(--fg-2); }
.uc canvas { cursor: crosshair; }
@media (max-width: 760px) {
  .uc .uc-copy { bottom: 92px; }
  .uc .uc-lede { font-size: 13.5px; margin-top: 12px; }
  .uc-meta, .uc-count { display: none; }
  .uc-dock .seg { padding: 0 11px; }
  .uc-label { display: none; }
}
`;export{Ce as default};