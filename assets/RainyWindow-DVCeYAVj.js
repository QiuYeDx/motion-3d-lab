import{a as e,n as t,t as n}from"./jsx-runtime-D3jfb0Ew.js";import{t as r}from"./animate-CT_7TBmH.js";import{t as i}from"./use-motion-value-CVpXW8PZ.js";import{n as a,r as o}from"./index-gQ65n0JU.js";import{Ht as s,Lt as c,Pt as l,Sn as u,Xt as d,Yt as f,h as p,ht as m,it as h,ot as g,pt as _,q as v,st as y,u as b,vn as x,wt as S}from"./events-9ce18a08.esm-BJiOHOtz.js";import{t as C}from"./react-three-fiber.esm-zWEOtJjG.js";import{n as w}from"./iso-CLB38p39.js";import{t as T}from"./Seg-CH5KfWEm.js";import{t as E}from"./glsl-oFfHlTlN.js";var D=e(t(),1),O=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,k=`
float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 h42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
`,A=`
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uM;
uniform float uTime;
uniform float uFocus; // 0 = sharp (what the drops focus), 1 = bokeh (what the glass shows)
uniform float uDusk;  // 1 = 黄昏, 0 = 深夜
uniform float uYOff;  // portrait: lift the skyline above the copy
${k}

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

const float ROAD = 0.205;

vec3 palette(float h) {
  vec3 c;
  if (h < 0.40) c = vec3(1.0, 0.52, 0.16);       // sodium
  else if (h < 0.64) c = vec3(1.0, 0.80, 0.52);  // warm white
  else if (h < 0.76) c = vec3(0.62, 0.80, 1.0);  // cool white
  else if (h < 0.86) c = vec3(1.0, 0.16, 0.10);  // red
  else if (h < 0.94) c = vec3(0.12, 0.85, 0.95); // teal neon
  else c = vec3(1.0, 0.22, 0.58);                // magenta neon
  return c;
}

// 深夜: warm whites turn to sodium — the street is left to the lamps and the odd neon
vec3 lightCol(float h) {
  return h < 0.64 ? mix(palette(h * 0.62), palette(h), uDusk) : palette(h);
}

float bokehDisc(float d, float r) {
  float disc = smoothstep(r, r * 0.86, d);
  float rim = 0.8 + 0.32 * smoothstep(r * 0.45, r * 0.95, d);
  float rings = 1.0 + 0.05 * sin(d / r * 22.0);
  return disc * rim * rings;
}

float pointLight(float d, float rs) {
  return exp(-d * d / (rs * rs)) * 1.7 + exp(-d / (rs * 2.6)) * 0.16;
}

vec3 lights(vec2 p, float cs, float y0, float y1, float prob, float rs, float rb, float amp, float seed, float ys) {
  vec3 acc = vec3(0.0);
  vec2 id0 = floor(p / cs);
  float r = mix(rs, rb, uFocus);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = id0 + vec2(float(i), float(j));
      vec4 h = h42(id + seed);
      if (h.x > prob) continue;
      vec2 c = (id + 0.1 + 0.8 * h.yz) * cs;
      if (c.y < y0 || c.y > y1) continue;
      vec2 dv = p - c;
      dv.y *= ys;
      float d = length(dv);
      float tw = 0.78 + 0.22 * sin(uTime * (0.35 + h.w * 1.2) + h.w * 40.0);
      vec3 col = lightCol(fract(h.w * 7.13 + seed * 0.01)) * amp * (0.4 + 0.6 * h.y) * tw;
      acc += col * mix(pointLight(d, rs) * 2.4, bokehDisc(d, r) * 0.4, uFocus);
    }
  }
  return acc;
}

// a lane of cars: pairs of lights sliding along y = laneY
vec3 cars(vec2 p, float laneY, float speed, vec3 col, float sep, float seed, float ys, float prob) {
  float cs = 0.24;
  float x = p.x - uTime * speed;
  float id0 = floor(x / cs);
  float rs = 0.0026;
  float r = mix(rs, 0.026, uFocus);
  vec3 acc = vec3(0.0);
  float cy = ys < 1.0 ? laneY - 0.035 : laneY;
  for (int i = -1; i <= 1; i++) {
    float id = id0 + float(i);
    vec4 h = h42(vec2(id, seed));
    if (h.x > prob) continue;
    float cx = (id + 0.2 + 0.6 * h.y) * cs;
    for (int k = 0; k < 2; k++) {
      vec2 c = vec2(cx + (k == 0 ? -sep : sep), cy);
      vec2 dv = vec2(x - c.x, (p.y - c.y) * ys);
      float d = length(dv);
      acc += col * (0.7 + 0.3 * h.z) * mix(pointLight(d, rs) * 2.4, bokehDisc(d, r) * 0.45, uFocus);
    }
  }
  return acc;
}

// one row of building silhouettes; returns coverage, writes window emission
float buildings(vec2 p, float cw, float hmin, float hvar, float seed, float litP, out vec3 win) {
  float id = floor(p.x / cw);
  float fx = fract(p.x / cw);
  float hh = hmin + hvar * pow(h11(id + seed), 1.8);
  if (h11(id * 3.17 + seed) > 0.86) hh += 0.1;
  float ew = mix(0.0012, 0.02, uFocus);
  float gx = mix(0.025, 0.0, uFocus);
  float cover = smoothstep(hh + ew, hh - ew, p.y) * smoothstep(0.0, gx + 0.001, fx) * smoothstep(1.0, 1.0 - gx - 0.001, fx);

  vec2 wsz = vec2(0.0062, 0.0095);
  vec2 wid = floor(p / wsz);
  vec2 wf = fract(p / wsz);
  float rowLit = step(0.25, h21(vec2(id, wid.y) + seed)); // whole dark floors
  float lit = step(1.0 - litP, h21(wid + seed * 1.7)) * rowLit;
  float frame = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.25, wf.y) * step(wf.y, 0.72);
  vec3 wc = mix(vec3(1.0, 0.68, 0.34), vec3(0.7, 0.85, 1.0), step(0.78, h21(wid * 1.31 + 4.0)));
  wc *= 0.35 + 0.65 * h21(wid + 9.0);
  vec3 sharpW = wc * lit * frame;
  vec3 avgW = vec3(1.0, 0.72, 0.42) * litP * 0.75 * 0.31 * 0.75;
  float below = smoothstep(hh - 0.004, hh - 0.012, p.y);
  win = mix(sharpW * 1.6, avgW, uFocus) * below * cover;
  return cover;
}

void main() {
  vec2 p = vec2((vUv.x * (1.0 + 2.0 * uM) - uM) * uA, vUv.y * (1.0 + 2.0 * uM) - uM - uYOff);
  float y = p.y;

  // sky — city glow sits on the horizon
  vec3 nTop = lin(vec3(0.020, 0.028, 0.055));
  vec3 nMid = lin(vec3(0.050, 0.055, 0.095));
  vec3 nHor = lin(vec3(0.20, 0.13, 0.12));
  vec3 dTop = lin(vec3(0.03, 0.05, 0.12));
  vec3 dMid = lin(vec3(0.1, 0.09, 0.19));
  vec3 dHor = lin(vec3(0.6, 0.3, 0.15));
  vec3 top = mix(nTop, dTop, uDusk);
  vec3 mid = mix(nMid, dMid, uDusk);
  vec3 hor = mix(nHor, dHor, uDusk);
  vec3 col = mix(hor, mid, smoothstep(0.36, 0.62, y));
  col = mix(col, top, smoothstep(0.6, 1.05, y));

  // far skyline
  vec3 win;
  float cov = buildings(p, 0.05, 0.40, 0.2, 3.0, mix(0.13, 0.3, uDusk), win);
  vec3 farB = mix(lin(vec3(0.05, 0.05, 0.08)), lin(vec3(0.08, 0.06, 0.09)), uDusk);
  col = mix(col, farB, cov * 0.92) + win * 0.55;

  // far city lights scattered through the skyline
  col += lights(p, 0.028, 0.26, 0.5, mix(0.3, 0.5, uDusk), 0.0019, 0.014, 0.75, 11.0, 1.0);

  // near buildings occlude
  float cov2 = buildings(p + vec2(0.37, 0.0), 0.12, 0.28, 0.26, 17.0, mix(0.08, 0.18, uDusk), win);
  vec3 nearB = mix(lin(vec3(0.018, 0.02, 0.03)), lin(vec3(0.04, 0.025, 0.04)), uDusk);
  col = mix(col, nearB, cov2) + win * 0.9;

  // street level
  float road = smoothstep(ROAD + 0.002, ROAD - 0.004, y);
  vec3 roadC = mix(lin(vec3(0.03, 0.03, 0.04)), lin(vec3(0.07, 0.04, 0.05)), uDusk);
  col = mix(col, roadC * (0.6 + 0.6 * smoothstep(-0.1, ROAD, y)), road);

  // street lamps, signs, traffic lights
  col += lights(p, 0.075, 0.21, 0.62, 0.34, 0.0034, 0.042, 1.3, 29.0, 1.0);
  // cars: tail lights drifting left, headlights drifting right
  col += cars(p, ROAD + 0.008, -0.05, vec3(1.0, 0.1, 0.06) * 1.3, 0.011, 5.0, 1.0, 0.55);
  col += cars(p, ROAD - 0.012, 0.075, vec3(1.0, 0.86, 0.62) * 1.25, 0.014, 8.0, 1.0, 0.5);
  // close, very out-of-focus lights
  col += lights(p, 0.17, 0.0, 0.78, 0.22, 0.005, 0.1, 0.36, 41.0, 1.0);

  // wet asphalt: everything above smears down into long vertical reflections
  if (y < ROAD) {
    float k = smoothstep(-0.15, ROAD, y);
    float rx = p.x + 0.0025 * sin(y * 260.0 + uTime * 1.1) * (1.0 - uFocus);
    // mirror the band just above the kerb, stretched ~3x downward
    vec2 pm = vec2(rx, ROAD + (ROAD - y) * 0.32);
    vec3 refl = lights(pm, 0.075, 0.21, 0.62, 0.42, 0.0034, 0.042, 1.0, 29.0, 1.0);
    refl += lights(pm, 0.028, 0.26, 0.5, 0.5, 0.0019, 0.014, 0.75, 11.0, 1.0) * 0.6;
    vec2 pr = vec2(rx, y);
    refl += cars(pr, ROAD + 0.008, -0.05, vec3(1.0, 0.1, 0.06) * 1.3, 0.011, 5.0, 0.3, 0.55);
    refl += cars(pr, ROAD - 0.012, 0.075, vec3(1.0, 0.86, 0.62) * 1.25, 0.014, 8.0, 0.3, 0.5);
    k *= smoothstep(ROAD + 0.004, ROAD - 0.035, y);
    col += refl * 0.32 * k;
  }

  // warm/cool grade
  col *= mix(vec3(0.95, 1.0, 1.08), vec3(1.06, 0.97, 0.88), uDusk);
  gl_FragColor = vec4(col, 1.0);
}
`,j=`
attribute vec4 aDrop;  // x, y, r, stretch
attribute float aKind; // 1 = sliding
uniform float uA;
uniform float uKR;
varying vec2 vD;
varying float vR;
varying float vS;
varying float vKind;
void main() {
  float r = aDrop.z;
  float s = aDrop.w;
  float ext = r * uKR;
  vec2 local = vec2(position.x * ext, mix(-ext, ext * (1.0 + 2.0 * s), position.y * 0.5 + 0.5));
  vD = local;
  vR = r;
  vS = s;
  vKind = aKind;
  vec2 pane = aDrop.xy + local;
  gl_Position = vec4(pane.x / uA * 2.0 - 1.0, pane.y * 2.0 - 1.0, 0.0, 1.0);
}
`,M=`
precision highp float;
uniform float uKR;
varying vec2 vD;
varying float vR;
varying float vS;
void main() {
  vec2 d = vD;
  if (d.y > 0.0) d.y /= 1.0 + 2.0 * vS;
  d.x *= 1.0 + vS * 0.25;
  float s = length(d) / (vR * uKR);
  if (s >= 1.0) discard;
  float w = (1.0 - s * s);
  w *= w;
  gl_FragColor = vec4(d * w, w, vR * w);
}
`,N=`
precision highp float;
uniform float uTime;
varying vec2 vD;
varying float vR;
varying float vS;
varying float vKind;
void main() {
  if (vKind < 0.5) discard;
  vec2 d = vD;
  if (d.y > 0.0) d.y /= 1.0 + 2.0 * vS;
  float s = length(d) / (vR * 1.15);
  if (s >= 1.0) discard;
  gl_FragColor = vec4(uTime, uTime - 13.0, 0.0, 0.0);
}
`,P=`
precision highp float;
varying vec2 vUv;
uniform float uA;
uniform float uTime;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uRad;
void main() {
  vec2 p = vec2(vUv.x * uA, vUv.y);
  vec2 ba = uP1 - uP0;
  float t = clamp(dot(p - uP0, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float d = length(p - uP0 - ba * t) / uRad;
  if (d >= 1.0) discard;
  float edge = smoothstep(0.25, 1.0, d);
  gl_FragColor = vec4(uTime - edge * 30.0, uTime - edge * 40.0, uTime - edge * 40.0, 0.0);
}
`,F=`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform sampler2D tDrops;
uniform sampler2D tState;
uniform vec2 uRes;
uniform float uA;
uniform float uM;
uniform float uTime;
uniform float uKR;
uniform float uDensity;
uniform float uFog;
uniform float uDusk;
uniform float uSharpK;
${k}
${E}

vec2 bgUv(vec2 p) {
  return vec2((p.x / uA + uM) / (1.0 + 2.0 * uM), (p.y + uM) / (1.0 + 2.0 * uM));
}

// a lens: the drop shows an inverted, zoomed-out, sharp view of the city
vec3 lens(vec2 p, vec2 d, float r, float inner, float V) {
  vec2 q = d / r;
  // a ball lens: very wide angle, upside down — V is the radius of the city patch it shows
  vec2 sp = (p - d) - q * V * (1.0 + 0.4 * dot(q, q));
  // explicit LOD: implicit derivatives are undefined inside the per-drop branches
  float lod = log2(max(1.0, (1.0 + V / r) * uSharpK / uRes.y)) - 0.35;
  vec3 c = textureLod(tSharp, bgUv(sp), lod).rgb * 1.9;
  c = mix(c, textureLod(tBlur, bgUv(p - d), 0.0).rgb, 0.18);
  // dark refractive rim, bright caustic crescent at the bottom, specular glint top-left
  c *= mix(0.08, 1.0, smoothstep(0.0, 0.55, inner));
  float crescent = smoothstep(0.35, 0.95, -q.y) * smoothstep(0.0, 0.35, inner) * (1.0 - smoothstep(0.35, 0.8, inner));
  c += crescent * textureLod(tBlur, bgUv(p + vec2(0.0, r * 3.0)), 0.0).rgb * 0.9;
  float spec = smoothstep(0.32, 0.0, length(q - vec2(-0.32, 0.4))) * 0.22 + smoothstep(0.1, 0.0, length(q - vec2(-0.28, 0.44))) * 0.6;
  c += spec * vec3(0.95, 0.97, 1.0);
  return c;
}

// procedural micro-droplets on one grid layer; returns (rgb, coverage)
vec4 droplets(vec2 p, float off, float cs, float dens, float rmin, float rmax, float seed, float px) {
  vec2 id = floor((p + off) / cs);
  vec4 h = h42(id + seed);
  if (h.x > dens) return vec4(0.0);
  vec2 c = (id + 0.22 + 0.56 * h.yz) * cs - off;
  float age = uTime - textureLod(tState, vec2(c.x / uA, c.y), 0.0).r;
  float regrow = 2.5 + 22.0 * h.w;
  float grow = smoothstep(regrow, regrow + 1.2, age);
  float r = mix(rmin, rmax, h.w * h.w) * grow;
  if (r < px * 0.6) return vec4(0.0);
  vec2 d = p - c;
  float dl = length(d);
  float cov = smoothstep(r, r - px * 1.2, dl);
  if (cov <= 0.0) return vec4(0.0);
  float inner = 1.0 - (dl * dl) / (r * r);
  return vec4(lens(p, d, r, inner, r * 3.4), cov);
}

void main() {
  vec2 p = vec2(vUv.x * uA, vUv.y);
  float px = 1.0 / uRes.y;
  vec4 st = texture2D(tState, vUv);

  // glass: bokeh city, plus condensation
  vec2 bu = bgUv(p);
  vec3 glass = texture2D(tBlur, bu).rgb;
  // where a hand wiped the glass, the city snaps into focus (fades back as the glass fogs over)
  float clarity = 1.0 - smoothstep(4.0, 28.0, uTime - st.b);
  if (clarity > 0.0) {
    vec3 sharp = textureLod(tSharp, bu, 1.2).rgb * 1.15 + glass * 0.3;
    glass = mix(glass, sharp, clarity * 0.85);
  }
  float fogAge = uTime - st.g;
  float fogBack = smoothstep(4.0, 30.0, fogAge);
  float n = snoise(vec3(p * 2.2, uTime * 0.02)) * 0.5 + 0.5;
  float n2 = snoise(vec3(p * 9.0, 3.0)) * 0.5 + 0.5;
  vec2 ev = (vUv - 0.5) * vec2(1.0, 1.25);
  float shape = 0.32 + 0.45 * n * n + 0.5 * smoothstep(0.28, 0.72, length(ev)) + 0.2 * smoothstep(0.3, 0.0, p.y) + 0.08 * n2;
  float fog = clamp(fogBack * uFog * shape, 0.0, 1.0);
  vec3 heavy = textureLod(tBlur, bu, 2.5).rgb * 0.5 + textureLod(tBlur, bu + vec2(0.0, 0.01), 4.0).rgb * 0.6;
  vec3 haze = mix(vec3(0.008, 0.011, 0.018), vec3(0.012, 0.012, 0.022), uDusk);
  vec3 fogged = heavy * 0.85 + haze;
  fogged = mix(fogged, vec3(dot(fogged, vec3(0.3, 0.55, 0.15))), 0.3);
  // micro-condensation: a faint frosted sheen lit by whatever glows behind it
  fogged += heavy * (0.25 + 0.35 * n2) * 0.3;
  // micro-texture of condensation catching the light
  // a freshly wiped glass is a little darker and crisper
  vec3 col = mix(glass, fogged, fog);
  // water collects along the edge of a wipe
  float wipeEdge = smoothstep(0.15, 0.45, fogBack) * (1.0 - smoothstep(0.45, 0.8, fogBack)) * step(fogAge, 60.0);
  col += heavy * wipeEdge * 0.12;

  float see = 1.0 - fog * 0.35; // drops are on the outside; condensation softens them

  // micro droplets
  vec4 dd = droplets(p, 0.0, 0.011, 0.55 * uDensity, 0.0012, 0.0034, 1.0, px);
  col = mix(col, dd.rgb, dd.a * see * 0.95);
  dd = droplets(p, 0.37, 0.021, 0.42 * uDensity, 0.002, 0.0058, 7.0, px);
  col = mix(col, dd.rgb, dd.a * see);
  dd = droplets(p, 0.71, 0.043, 0.3 * uDensity, 0.003, 0.0085, 13.0, px);
  col = mix(col, dd.rgb, dd.a * see);

  // big drops & trails from the simulation (metaball field)
  vec4 D = texture2D(tDrops, vUv);
  float F = D.b;
  float T = 0.3086; // field value at s = 1/1.5 → the drop's visual radius
  float aa = max(fwidth(F), 1e-4);
  if (F > T * 0.6) {
    float m = smoothstep(T - aa, T + aa, F);
    vec2 d = D.rg / F;
    float r = max(D.a / F, 1e-4);
    float inner = clamp((F - T) / (1.0 - T), 0.0, 1.0);
    vec3 dc = lens(p, d, r, inner, r * 3.2);
    col = mix(col, dc, m * see);
  }

  // vignette, tone map, grain
  vec2 vp = vUv - 0.5;
  vp.x *= uA;
  col *= 1.0 - smoothstep(0.3, 1.2, length(vp)) * 0.62;
  col = 1.0 - exp(-col * 1.25);
  col = pow(col, vec3(1.0 / 2.2));
  col += (h21(gl_FragCoord.xy + fract(uTime * 7.1) * 311.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`,I=n(),L=typeof window<`u`&&Math.min(window.innerWidth,window.innerHeight)<760,R=.14,z=1.5,B=100,V=[{zh:`小雨`,rate:1.5,dens:.55,fog:.62},{zh:`中雨`,rate:3.8,dens:.8,fog:.72},{zh:`暴雨`,rate:10,dens:1,fog:.84}],H=[{zh:`黄昏`,clock:`18:47`,dot:`#ffb86b`},{zh:`深夜`,clock:`02:13`,dot:`#7fb8ff`}],U=170,W=900,G=.012,K=.036,q=class{drops=[];nd=0;trails=[];nt=0;A=1.6;acc=0;constructor(){for(let e=0;e<U;e++)this.drops.push({x:0,y:0,r:0,vy:0,drift:0,stick:0,trail:0,seed:0,moving:!1,dead:!1});for(let e=0;e<W;e++)this.trails.push({x:0,y:0,r:0,life:0,age:0})}addDrop(e,t,n){if(this.nd>=U)return;let r=this.drops[this.nd++];r.x=e,r.y=t,r.r=n,r.vy=0,r.drift=(Math.random()-.5)*.4,r.stick=0,r.trail=n,r.seed=Math.random()*100,r.moving=!1,r.dead=!1}addTrail(e,t,n,r){if(this.nt>=W)return;let i=this.trails[this.nt++];i.x=e,i.y=t,i.r=n,i.life=r,i.age=0}spawn(e,t){for(this.acc+=e*t;this.acc>=1;){--this.acc;let e=Math.random()*this.A,t=.03+Math.random()*1,n=Math.random()<.22?.012+Math.random()*.014:.0045+Math.random()**2.2*.016,r=!1;for(let i=0;i<this.nd;i++){let a=this.drops[i],o=a.x-e,s=a.y-t;if(o*o+s*s<(a.r+n*.5)**2){a.r=Math.min(K,Math.hypot(a.r,n)),r=!0;break}}r||this.addDrop(e,t,n)}}step(e,t){let n=this.A;for(let t=0;t<this.nd;t++){let r=this.drops[t];if(!r.moving&&r.r>G&&(r.moving=!0,r.stick=Math.random()*.5),r.moving){let t=Math.min(1,Math.max(0,(r.r-G*.9)/.014)),n=.035+.24*t;if(r.stick>0?(r.stick-=e,n=0):Math.random()<e*(1.1-t*.8)&&(r.stick=.1+Math.random()*(.9-t*.6),r.drift=(Math.random()-.5)*.7),r.vy+=(n-r.vy)*Math.min(1,e*7),r.y-=r.vy*e,r.x+=(r.drift+.4*Math.sin(r.y*42+r.seed))*r.vy*e*.45,r.trail-=r.vy*e,r.trail<=0&&r.vy>.03){let e=r.r*(.2+Math.random()*.24);this.addTrail(r.x+(Math.random()-.5)*r.r*.5,r.y+r.r*(.9+Math.random()*.5),e,6+Math.random()*14),r.r=Math.sqrt(Math.max(G*G*.7,r.r*r.r-e*e*.5)),r.trail=r.r*(.6+Math.random()*1.8)}r.r<G*.86&&r.stick<=0&&(r.moving=!1,r.vy=0);for(let e=0;e<this.nt;e++){let t=this.trails[e];if(t.age<.6||t.life<=0)continue;let n=t.x-r.x,i=t.y-r.y,a=r.r*.95+t.r;n*n+i*i<a*a&&(r.r=Math.min(K,Math.sqrt(r.r*r.r+t.r*t.r*.8)),t.life=0)}}else r.r-=e*7e-5;(r.y<-.06||r.x<-.05||r.x>n+.05||r.r<.002)&&(r.dead=!0)}for(let e=0;e<this.nd;e++){let t=this.drops[e];if(!t.dead)for(let n=e+1;n<this.nd;n++){let e=this.drops[n];if(e.dead)continue;let r=t.x-e.x,i=t.y-e.y,a=(t.r+e.r)*.8;if(r*r+i*i<a*a){let n=t.r>=e.r?t:e,r=n===t?e:t,i=n.r*n.r,a=r.r*r.r;n.x=(n.x*i+r.x*a*.4)/(i+a*.4),n.r=Math.min(K,Math.sqrt(i+a)),n.vy=Math.max(n.vy,r.vy),r.moving&&(n.stick=0),r.dead=!0}}}for(let e=this.nd-1;e>=0;e--)if(this.drops[e].dead){let t=this.drops[this.nd-1];this.drops[this.nd-1]=this.drops[e],this.drops[e]=t,this.nd--}for(let t=this.nt-1;t>=0;t--){let n=this.trails[t];if(n.age+=e,n.life-=e,n.life<=0){let e=this.trails[this.nt-1];this.trails[this.nt-1]=n,this.trails[t]=e,this.nt--}}}};function J(e,t,n){return new u(Math.max(2,e),Math.max(2,t),{type:h,format:s,minFilter:n?m:_,magFilter:_,generateMipmaps:n,depthBuffer:!1,stencilBuffer:!1})}function Y({levelRef:e,dusk:t,density:n,fog:r,wipes:i,touched:a}){let o=p(e=>e.gl),s=p(e=>e.size),u=(0,D.useMemo)(()=>{let e=new l(-1,1,1,-1,0,1),t=new c(2,2),n=(e,t,n)=>{let r=new d({vertexShader:O,fragmentShader:e,uniforms:t,depthTest:!1,depthWrite:!1});return n===`max`&&(r.blending=5,r.blendEquation=104,r.blendEquationAlpha=104,r.blendSrc=r.blendDst=201),r},r=n(A,{uA:{value:1},uM:{value:R},uTime:{value:0},uFocus:{value:0},uDusk:{value:1},uYOff:{value:0}}),i=n(P,{uA:{value:1},uTime:{value:0},uP0:{value:new x},uP1:{value:new x},uRad:{value:.06}},`max`),a=n(F,{tSharp:{value:null},tBlur:{value:null},tDrops:{value:null},tState:{value:null},uRes:{value:new x(1,1)},uA:{value:1},uM:{value:R},uTime:{value:0},uKR:{value:z},uDensity:{value:.8},uFog:{value:.7},uDusk:{value:1},uSharpK:{value:500}}),o=new S(t,a);o.frustumCulled=!1;let s=new f;s.add(o);let u=new y;u.index=t.index,u.setAttribute(`position`,t.getAttribute(`position`));let p=1070,m=new g(new Float32Array(p*4),4),h=new g(new Float32Array(p),1);m.setUsage(v),h.setUsage(v),u.setAttribute(`aDrop`,m),u.setAttribute(`aKind`,h),u.instanceCount=0;let _={uA:{value:1},uKR:{value:z},uTime:{value:0}},b=new d({vertexShader:j,fragmentShader:M,uniforms:_,depthTest:!1,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:201,blendSrcAlpha:201,blendDstAlpha:201}),C=new d({vertexShader:j,fragmentShader:N,uniforms:_,depthTest:!1,depthWrite:!1});C.blending=5,C.blendEquation=104,C.blendEquationAlpha=104;let w=new S(u,b);w.frustumCulled=!1;let T=new f;return T.add(w),{cam:e,city:r,wipe:i,comp:a,quad:o,scene:s,geo:u,aDrop:m,aKind:h,dropU:_,dropMat:b,clearMat:C,drops:w,dropScene:T,plane:t}},[]),m=(0,D.useRef)(null),h=(0,D.useMemo)(()=>new q,[]),_=(0,D.useRef)({t:B,frame:0,prewarmed:!1,intro:0,ix:-1,iy:-1,clear:!0});return(0,D.useEffect)(()=>()=>{let e=m.current;e&&[e.sharp,e.blur,e.drops,e.state].forEach(e=>e.dispose()),[u.city,u.wipe,u.comp,u.dropMat,u.clearMat].forEach(e=>e.dispose()),u.geo.dispose(),u.plane.dispose()},[u]),b((c,l)=>{let d=Math.min(l,1/30),f=_.current;f.t+=d;let p=s.width,g=s.height,v=p/g;h.A=v;let y=m.current;if(!y||y.w!==p||y.h!==g){y&&[y.sharp,y.blur,y.drops,y.state].forEach(e=>e.dispose());let e=1.28,t=L?.7:.6,n=Math.min(1,(L?1100:1700)/Math.max(p,g));y=m.current={w:p,h:g,sharp:J(Math.round(p*t*e),Math.round(g*t*e),!0),blur:J(Math.round(p*.36*e),Math.round(g*.36*e),!0),drops:J(Math.round(p*n),Math.round(g*n),!1),state:J(Math.round(p*.34),Math.round(g*.34),!1)},f.clear=!0}if(!f.prewarmed){f.prewarmed=!0;for(let t=0;t<(w?1100:750);t++)h.spawn(V[e.current].rate,1/30),h.step(1/30,t/30)}h.spawn(V[e.current].rate,d),h.step(d,f.t);let b=i.current;if(!a.current&&f.intro<1){let e=w?0:1.3,t=w?.001:1.5,n=f.t-B-e;if(n>0){let e=w?40:1;for(let r=0;r<e;r++){f.intro=w?(r+1)/e:Math.min(1,n/t);let i=f.intro,a=i*i*(3-2*i),o=v*(L||v<1?.14+.72*a:.5+.36*a),s=(v<1?.6:.5)+.05*Math.sin(a*Math.PI*2.1)-.06*a;f.ix>=0&&b.push([f.ix,f.iy,o,s]),f.ix=o,f.iy=s}}}let x=u.aDrop.array,S=u.aKind.array,C=0;for(let e=0;e<h.nd;e++){let t=h.drops[e];x[C*4]=t.x,x[C*4+1]=t.y,x[C*4+2]=t.r,x[C*4+3]=Math.min(.5,t.vy*2.2),S[C]=t.moving&&t.vy>.02?1:0,C++}for(let e=0;e<h.nt;e++){let t=h.trails[e],n=Math.min(1,t.life/1.5);x[C*4]=t.x,x[C*4+1]=t.y,x[C*4+2]=t.r*(.4+.6*n)*Math.min(1,t.age*6),x[C*4+3]=0,S[C]=0,C++}u.geo.instanceCount=C,u.aDrop.needsUpdate=!0,u.aKind.needsUpdate=!0,u.aDrop.clearUpdateRanges(),u.aDrop.addUpdateRange(0,C*4),u.aKind.clearUpdateRanges(),u.aKind.addUpdateRange(0,C);let T=f.t,E=o.autoClear;o.autoClear=!1;let D=o.getRenderTarget();if((f.frame++%2==0||f.clear)&&(u.quad.material=u.city,u.city.uniforms.uA.value=v,u.city.uniforms.uTime.value=T,u.city.uniforms.uDusk.value=t.get(),u.city.uniforms.uYOff.value=v<1?.13:.05,u.city.uniforms.uFocus.value=0,o.setRenderTarget(y.sharp),o.render(u.scene,u.cam),u.city.uniforms.uFocus.value=1,o.setRenderTarget(y.blur),o.render(u.scene,u.cam)),u.dropU.uA.value=v,u.dropU.uTime.value=T,u.drops.material=u.dropMat,o.setRenderTarget(y.drops),o.setClearColor(0,0),o.clear(!0,!1,!1),o.render(u.dropScene,u.cam),o.setRenderTarget(y.state),f.clear&&=(o.clear(!0,!1,!1),!1),u.drops.material=u.clearMat,o.render(u.dropScene,u.cam),b.length){u.quad.material=u.wipe,u.wipe.uniforms.uA.value=v,u.wipe.uniforms.uTime.value=T,u.wipe.uniforms.uRad.value=v<1?.05:.058;for(let e of b)u.wipe.uniforms.uP0.value.set(e[0],e[1]),u.wipe.uniforms.uP1.value.set(e[2],e[3]),o.render(u.scene,u.cam);b.length=0}let O=u.comp.uniforms;O.tSharp.value=y.sharp.texture,O.tBlur.value=y.blur.texture,O.tDrops.value=y.drops.texture,O.tState.value=y.state.texture,O.uRes.value.set(p,g),O.uA.value=v,O.uTime.value=T,O.uDensity.value=n.get(),O.uFog.value=r.get(),O.uDusk.value=t.get(),O.uSharpK.value=y.sharp.height/1.28,u.quad.material=u.comp,o.setRenderTarget(D),o.render(u.scene,u.cam),o.autoClear=E},1),null}function X(){let[e,t]=(0,D.useState)(1),[n,s]=(0,D.useState)(0),c=(0,D.useRef)(e),l=i(1),u=i(V[1].dens),d=i(V[1].fog),f=(0,D.useRef)([]),p=(0,D.useRef)(!1),m=(0,D.useRef)(null);(0,D.useEffect)(()=>{c.current=e;let t=r(u,V[e].dens,{duration:1.4,ease:[.45,0,.2,1]}),n=r(d,V[e].fog,{duration:2.4,ease:[.45,0,.2,1]});return()=>{t.stop(),n.stop()}},[e,u,d]),(0,D.useEffect)(()=>{let e=r(l,+(n===0),{duration:1.8,ease:[.45,0,.2,1]});return()=>e.stop()},[n,l]),(0,D.useEffect)(()=>{let e=m.current,t=!1,n=0,r=0,i=t=>{let n=e.getBoundingClientRect();return[(t.clientX-n.left)/n.height,1-(t.clientY-n.top)/n.height]},a=a=>{t=!0,p.current=!0;let[o,s]=i(a);n=o,r=s,f.current.push([o,s,o+1e-4,s]),e.setPointerCapture?.(a.pointerId)},o=e=>{if(!t)return;let[a,o]=i(e);f.current.push([n,r,a,o]),n=a,r=o},s=()=>t=!1;return e.addEventListener(`pointerdown`,a),e.addEventListener(`pointermove`,o),e.addEventListener(`pointerup`,s),e.addEventListener(`pointercancel`,s),()=>{e.removeEventListener(`pointerdown`,a),e.removeEventListener(`pointermove`,o),e.removeEventListener(`pointerup`,s),e.removeEventListener(`pointercancel`,s)}},[]);let h=H[n];return(0,I.jsxs)(`div`,{className:`stage rw-root`,style:{background:`#0b0f17`},children:[(0,I.jsx)(`style`,{children:Z}),(0,I.jsx)(`div`,{ref:m,className:`rw-canvas`,children:(0,I.jsx)(C,{dpr:[1,1.75],gl:{antialias:!1,alpha:!1,powerPreference:`high-performance`},camera:{position:[0,0,1]},children:(0,I.jsx)(Y,{levelRef:c,dusk:l,density:u,fog:d,wipes:f,touched:p})})}),(0,I.jsxs)(`div`,{className:`overlay`,children:[(0,I.jsxs)(a.div,{className:`rw-copy soft-text`,initial:{opacity:0,y:12,filter:`blur(6px)`},animate:{opacity:1,y:0,filter:`blur(0px)`},transition:{duration:.9,delay:.3,ease:[.23,1,.32,1]},children:[(0,I.jsxs)(`p`,{className:`rw-kicker`,children:[(0,I.jsx)(`i`,{style:{background:h.dot}}),(0,I.jsx)(`span`,{children:`RAIN ON GLASS ·`}),(0,I.jsx)(o,{mode:`popLayout`,initial:!1,children:(0,I.jsx)(a.span,{initial:{opacity:0,y:8},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.4,ease:[.23,1,.32,1]},children:h.clock},h.clock)})]}),(0,I.jsx)(`h1`,{children:`窗外是整座城市`}),(0,I.jsx)(`p`,{className:`rw-sub`,children:`每颗雨滴都是一枚小透镜，把虚焦的街灯重新对准、倒着装进去。`})]}),(0,I.jsxs)(`div`,{className:`dock`,children:[(0,I.jsx)(T,{items:V.map((e,t)=>({value:t,label:e.zh})),value:e,onChange:t}),(0,I.jsx)(`span`,{className:`dock-sep`}),(0,I.jsx)(T,{items:H.map((e,t)=>({value:t,label:e.zh})),value:n,onChange:s})]}),(0,I.jsx)(`p`,{className:`hint`,children:`按住拖动 · 擦掉玻璃上的雾`})]})]})}var Z=`
.rw-canvas { position: absolute; inset: 0; touch-action: none; cursor: grab; }
.rw-canvas:active { cursor: grabbing; }
.rw-copy {
  --soft-bg: #05070c;
  position: absolute; left: clamp(24px, 6vw, 96px); bottom: 104px;
  max-width: 420px; pointer-events: none !important;
}
.rw-kicker {
  display: flex; align-items: center; gap: 8px; margin: 0 0 14px;
  font: 500 12px/1 var(--mono); letter-spacing: .08em; color: var(--fg-2);
}
.rw-kicker i { width: 6px; height: 6px; border-radius: 50%; transition: background 1.2s; box-shadow: 0 0 10px currentColor; }
.rw-kicker span { display: inline-block; }
.rw-copy h1 {
  margin: 0; font: 600 clamp(30px, 3.4vw, 46px)/1.08 var(--display); letter-spacing: -.03em;
}
.rw-sub { margin: 12px 0 0; font-size: 14px; line-height: 1.7; color: var(--fg-2); }
@media (max-width: 760px) {
  .rw-copy { bottom: 92px; right: 24px; }
  .rw-copy h1 { font-size: 30px; }
  .rw-sub { font-size: 13px; }
}
`;export{X as default};