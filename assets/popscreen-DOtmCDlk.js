import{$ as e,Bt as t,_n as n,kt as r,vn as i,yt as a,z as o}from"./events-9ce18a08.esm-BkDjjFw8.js";var s=[{id:`quad`,label:`四联`,en:`2 × 2`},{id:`nine`,label:`九宫`,en:`3 × 3`},{id:`strip`,label:`条带`,en:`1 × 4`}],c={title:`丝印四联`,en:`Pop Silkscreen`,background:`#f3ece0`,theme:`light`},l={quad:{cols:2,rows:2,aMin:.74,aMax:1.5,gutter:12,benday:0,halftone:.4,mis:1},nine:{cols:3,rows:3,aMin:.74,aMax:1.5,gutter:9,benday:0,halftone:.34,mis:.8},strip:{cols:4,rows:1,aMin:.64,aMax:.95,gutter:10,benday:1,halftone:0,mis:.75}},u=[[`#ff2d87`,`#ffe23d`,`#e8132b`,`#1fc6c0`,`#2a3fe0`,`#ff7a1a`],[`#ff8c1a`,`#ff9ad5`,`#d0102e`,`#ffe600`,`#12b5e8`,`#6c2bd9`],[`#19c6d1`,`#ff9fc0`,`#ff3b1f`,`#ffe600`,`#2a2ad8`,`#0f8f4e`],[`#ffe600`,`#ff5ca8`,`#d4021d`,`#1fb2ff`,`#7b2cff`,`#ff6a00`],[`#2b3bd8`,`#ffb3d1`,`#ff2a2a`,`#ffe100`,`#26e0b8`,`#ff6a00`],[`#36cc68`,`#fff04d`,`#ff1f6b`,`#ff7a00`,`#3f37c9`,`#0d7fb8`],[`#8a3cff`,`#ffd24a`,`#ff2d55`,`#3df5c4`,`#ff9ae0`,`#1d4fff`],[`#ff3b30`,`#bff2ff`,`#ffe600`,`#ff5ac8`,`#1f3bd6`,`#7a1fa2`],[`#ffa0c8`,`#fff3a6`,`#ff2a5f`,`#18c9e0`,`#5a2df0`,`#ff7a33`],[`#12b5e8`,`#ffe23d`,`#ff2d87`,`#ff6b1a`,`#2a2ad8`,`#8fd61f`],[`#c6f432`,`#ff8fc8`,`#e8132b`,`#7b2cff`,`#1fb2ff`,`#ff6a00`],[`#ff6a00`,`#c9f7ff`,`#ff1f8f`,`#ffe600`,`#1a3bd0`,`#a1127a`]],d=`#141117`,f=`#fbf6ec`,p=9,m=16,h=10,g=`
uniform sampler2D tData;
uniform vec4 uSheetA;   // previous layout: x, y (GL device px), w, h
uniform vec4 uSheetB;   // current layout
uniform vec4 uGridA;    // cols, rows, gutter (device px), Ben-Day amount
uniform vec4 uGridB;
uniform vec4 uWinA;     // scene window for a panel: centre uv, size uv
uniform vec4 uWinB;
uniform vec4 uMisAB;    // misregistration scale of layout A, B
uniform float uLine;    // global squeegee line (GL device px); new layout above it
uniform vec4 uLineSpan; // x0, x1 of the global blade
uniform vec3 uBead;
uniform vec3 uPaper;
uniform vec3 uKey;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 sceneL(vec2 uv) {
  vec3 c = textureLod(tScene, uv, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
bool inside01(vec2 uv) { return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0; }
float rawDepth(vec2 uv) { return inside01(uv) ? textureLod(tDepth, uv, 0.0).r : 1.0; }
float covL(vec2 uv) { return step(rawDepth(uv), 0.99999); }
float invZ(vec2 uv) {
  float d = rawDepth(uv);
  if (uOrtho > 0.5) return 1.0 / (uNear + d * (uFar - uNear));
  float z = d * 2.0 - 1.0;
  return (uFar + uNear - z * (uFar - uNear)) / (2.0 * uNear * uFar);
}
float covBlur(vec2 uv, vec2 r) {
  return (covL(uv + vec2(r.x, r.y * 0.4)) + covL(uv + vec2(-r.x * 0.4, r.y)) + covL(uv + vec2(-r.x, -r.y * 0.4)) + covL(uv + vec2(r.x * 0.4, -r.y))) * 0.25;
}

// 1 light · 2 warm · 3 yellow · 4 cool · 5 shadow
int inkClass(vec3 c) {
  float V = max(c.r, max(c.g, c.b));
  float m = min(c.r, min(c.g, c.b));
  float C = V - m;
  float S = C / max(V, 1e-3);
  if (V < 0.42) return 5;
  if (S < 0.27) return 1;
  float h;
  if (V == c.r) h = (c.g - c.b) / C;
  else if (V == c.g) h = 2.0 + (c.b - c.r) / C;
  else h = 4.0 + (c.r - c.g) / C;
  h = fract(h / 6.0);
  if (h < 0.045 || h > 0.84) return 2;
  if (h < 0.2) return 3;
  return 4;
}

float benday(vec2 p, float cell, float cover) {
  vec2 r = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p / cell;
  float d = length(fract(r) - 0.5) * cell;
  float R = cell * sqrt(cover / 3.14159);
  return smoothstep(R + 0.7, R - 0.7, d);
}

// squeegee blade + the bead of ink it pushes ahead of itself (dy > 0 above the blade)
vec3 blade(vec3 col, float dy, float k, vec3 ink) {
  float bw = 4.5 * k;
  float bead = 9.0 * k;
  if (dy < 0.0 && dy > -bead) {
    float t = -dy / bead;                       // 0 at the blade → 1 at the bead's front
    float wet = 1.0 - smoothstep(0.75, 1.0, t);
    vec3 b = ink * (0.78 + 0.22 * t);
    b += vec3(0.35) * exp(-pow((t - 0.35) * 7.0, 2.0)); // glossy rim
    col = mix(col, b, wet);
  }
  if (dy >= 0.0 && dy < bw) {
    float t = dy / bw;
    col = mix(vec3(0.16, 0.16, 0.19), vec3(0.42, 0.42, 0.46), smoothstep(0.1, 0.9, t));
  }
  if (dy >= bw && dy < bw + 5.0 * k) col *= 0.82 + 0.18 * smoothstep(0.0, 5.0 * k, dy - bw); // blade shadow
  return col;
}

vec3 printPanel(vec2 px, vec2 cp, vec2 rel, vec4 sheet, vec4 grid, vec4 win, float mis, bool isNew, vec3 paper) {
  vec2 cellSz = sheet.zw / grid.xy;
  vec2 cell = min(floor(rel / cellSz), grid.xy - 1.0);
  vec2 ps = cellSz - grid.z;
  vec2 lp = rel - cell * cellSz - grid.z * 0.5;
  // CSS px → panel px: ink features scale a little with the panel so the 3×3 prints read as smaller copies
  float k = uDpr * clamp(ps.y / (uDpr * 330.0), 0.55, 1.2);
  // ragged print edge (the stencil's open area, slightly uneven)
  float rag = (vnoise(cp * 0.4 + cell * 7.1) - 0.5) * 1.4 * uDpr;
  if (lp.x < rag || lp.y < rag || lp.x > ps.x - rag || lp.y > ps.y - rag) return paper;

  int idx = int((grid.y - 1.0 - cell.y) * grid.x + cell.x);
  vec4 an = texelFetch(tData, ivec2(idx, ${p}), 0);
  float tilt = (lp.x / ps.x - 0.5) * ps.y * 0.06;
  float pullY = mix(ps.y + 12.0 * k, -16.0 * k, an.x) + tilt;
  bool cur = isNew && lp.y >= pullY;
  int base = cur ? 0 : ${m/2};
  vec4 P0 = texelFetch(tData, ivec2(base + 6, idx), 0); // key offset, colour offset (CSS px)
  vec4 P1 = texelFetch(tData, ivec2(base + 7, idx), 0); // bg offset, halftone flag, seed
  float seed = P1.w;

  // panel px → scene uv
  vec2 sc = win.zw / ps;
  vec2 q = lp;
  vec2 wob = (vec2(vnoise(cp * 0.03 + seed * 9.0), vnoise(cp * 0.03 + seed * 9.0 + 5.3)) - 0.5) * 4.0 * k;

  /* background screen */
  vec2 uvB = win.xy + (q - P1.xy * k * mis + wob - ps * 0.5) * sc;
  vec2 rb = 2.6 * k * sc;
  float covB = covBlur(uvB, rb);
  float bgM = 1.0 - smoothstep(0.42, 0.58, covB);
  float buildB = 1.0 - clamp(abs(covB - 0.5) * 2.4, 0.0, 1.0);

  /* colour screen */
  vec2 uvF = win.xy + (q - P0.zw * k * mis + wob * 0.6 - ps * 0.5) * sc;
  float covF = covBlur(uvF, rb);
  float fM = smoothstep(0.44, 0.6, covF);
  float buildF = 1.0 - clamp(abs(covF - 0.5) * 2.4, 0.0, 1.0);
  int cls = inkClass(sceneL(uvF));

  /* key screen */
  vec2 uvK = win.xy + (q - P0.xy * k * mis - ps * 0.5) * sc;
  vec3 sK = sceneL(uvK);
  float L = luma(sK);
  vec2 rl = 1.25 * k * sc;
  float iz0 = invZ(uvK);
  float lapX = abs(invZ(uvK + vec2(rl.x, 0.0)) + invZ(uvK - vec2(rl.x, 0.0)) - 2.0 * iz0);
  float lapY = abs(invZ(uvK + vec2(0.0, rl.y)) + invZ(uvK - vec2(0.0, rl.y)) - 2.0 * iz0);
  float edge = smoothstep(0.03, 0.08, max(lapX, lapY) / max(iz0, 1e-4));

  vec3 inkB = texelFetch(tData, ivec2(base, idx), 0).rgb;
  vec3 inkF = texelFetch(tData, ivec2(base + cls, idx), 0).rgb;

  /* ink behaviour: streaks along the pull, starving toward its end, voids, build-up at stencil edges */
  float st = vnoise(vec2(cp.x * 0.5 + seed * 31.0, cp.y * 0.012 + seed)) * 0.6 + vnoise(vec2(cp.x * 1.9 + seed * 7.0, cp.y * 0.04)) * 0.4;
  float starve = smoothstep(0.3, 1.0, 1.0 - lp.y / ps.y) * (0.35 + 0.65 * fract(seed * 3.7));
  float load = 1.0 - 0.09 * st - 0.16 * starve * st;
  float vn = vnoise(cp * 0.3 / (k / uDpr) + seed * 13.0) * 0.62 + hash12(floor(cp * 0.9) + seed * 50.0) * 0.38;
  float voidM = smoothstep(0.9 - 0.16 * starve, 0.94 - 0.16 * starve, vn);
  float flood = 1.0 - smoothstep(0.0, 22.0 * k, ps.y - lp.y); // heavy ink where the flood starts

  vec3 col = paper;
  // background ink (Ben-Day dots in the strip)
  float bd = grid.w > 0.5 ? benday(lp, 5.6 * k, 0.62) : 1.0;
  vec3 iB = inkB * (1.0 - 0.13 * buildB - 0.07 * flood);
  col = mix(col, iB, bgM * bd * load * (1.0 - voidM * 0.85));
  // colour ink (semi-opaque: an overprint on the background reads as a darker sliver)
  vec3 iF = inkF * (1.0 - 0.12 * buildF - 0.06 * flood) * mix(vec3(1.0), col, 0.22);
  float fA = fM * load * (1.0 - voidM * 0.8);
  if (grid.w > 0.5 && cls == 1) fA *= mix(0.55, 1.0, benday(lp + 2.0 * k, 4.4 * k, 0.5));
  col = mix(col, iF, fA);
  // key ink: darks + contours (+ coarse halftone in some panels)
  float kThr = 0.18;
  float key = smoothstep(kThr + 0.035, kThr - 0.035, L);
  if (P1.z > 0.5) {
    float v = smoothstep(0.5, kThr, L);
    vec2 r = mat2(0.7071, 0.7071, -0.7071, 0.7071) * lp / (4.6 * k);
    float d = length(fract(r) - 0.5);
    float R = 0.62 * sqrt(v);
    key = max(key, smoothstep(R + 0.06, R - 0.06, d) * step(0.04, v));
  }
  key = max(key, edge);
  float kv = vnoise(cp * 0.55 + seed * 3.0) * 0.6 + hash12(floor(cp * 1.3) + seed * 70.0) * 0.4;
  float kVoid = smoothstep(0.9 - 0.14 * starve, 0.94 - 0.14 * starve, kv);
  col = mix(col, uKey, key * (0.97 - 0.06 * st) * (1.0 - kVoid * 0.8));

  // fresh print: squeegee still crossing this panel
  if (isNew && an.x > 0.0 && an.x < 1.0) col = blade(col, lp.y - pullY, k, texelFetch(tData, ivec2(0, idx), 0).rgb);
  return col;
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec3 paper = uPaper * (1.0 - 0.03 * (vnoise(cp * 0.012) - 0.5) - 0.025 * (hash12(floor(cp)) - 0.5));
  paper -= vec3(0.012) * smoothstep(0.75, 0.95, vnoise(vec2(cp.x * 0.015, cp.y * 0.12)));
  bool isNew = px.y > uLine;
  vec4 sheet = isNew ? uSheetB : uSheetA;
  vec4 grid = isNew ? uGridB : uGridA;
  vec4 win = isNew ? uWinB : uWinA;
  float mis = isNew ? uMisAB.y : uMisAB.x;
  vec2 rel = px - sheet.xy;
  vec3 col = paper;
  if (rel.x >= 0.0 && rel.y >= 0.0 && rel.x < sheet.z && rel.y < sheet.w) col = printPanel(px, cp, rel, sheet, grid, win, mis, isNew, paper);
  if (px.x >= uLineSpan.x && px.x <= uLineSpan.y && abs(px.y - uLine) < 20.0 * uDpr) col = blade(col, px.y - uLine, uDpr, uBead);
  return col;
}
`,_=new WeakMap,v=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},y=(e,t)=>e+Math.random()*(t-e),b=e=>{let t=Math.random()*Math.PI*2,n=y(.45,1)*e;return[Math.cos(t)*n,Math.sin(t)*n]},x=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2;function S(e,t){let n=u[e].map(v);return Math.random()<.35&&([n[3],n[4]]=[n[4],n[3]]),{pal:n,key:b(y(3,7)),fill:b(y(1.5,4)),bg:b(y(1,3)),halftone:+(Math.random()<t),seed:Math.random()}}function C(e,t=[]){let n=u.map((e,t)=>t);for(let e=n.length-1;e>0;e--){let t=Math.floor(Math.random()*(e+1));[n[e],n[t]]=[n[t],n[e]]}let r=[];for(let i=0;i<e;i++){let e=n.findIndex(e=>e!==t[i]&&!r.includes(e));e<0&&(e=0),r.push(n.splice(e,1)[0])}return r}function w(e,t,n,r){let i=e.data,a=(t*m+r)*4;for(let e=0;e<6;e++)i.set([n.pal[e][0],n.pal[e][1],n.pal[e][2],1],a+e*4);i.set([n.key[0],n.key[1],n.fill[0],n.fill[1]],a+24),i.set([n.bg[0],n.bg[1],n.halftone,n.seed],a+28)}function T(e){for(let t=0;t<p;t++)w(e,t,e.cur[t],0),w(e,t,e.prev[t],m/2);e.tex.needsUpdate=!0}function E(e,t){let n=l[e];return e===`strip`&&t.w/t.h<1.1?{cols:2,rows:2}:{cols:n.cols,rows:n.rows}}function D(e,t,n){let r={...l[e],...E(e,t)},i=r.gutter*n*(e===`nine`&&t.w<600*n?.7:1),o=a.clamp((t.w/r.cols-i)/(t.h/r.rows-i),r.aMin,r.aMax),s=Math.min(t.w/r.cols-i,(t.h/r.rows-i)*o),c=s/o,u=r.cols*(s+i),d=r.rows*(c+i);return{x:t.x+(t.w-u)/2,y:t.y+(t.h-d)/2,w:u,h:d,g:i,aspect:o,cols:r.cols,rows:r.rows}}function O(a={}){let s=a.mode??`quad`,u=new Float32Array(640),y=new o(u,m,h,t,e);y.minFilter=y.magFilter=r;let b=()=>new i,w={tData:{value:y},uSheetA:{value:b()},uSheetB:{value:b()},uGridA:{value:b()},uGridB:{value:b()},uWinA:{value:b()},uWinB:{value:b()},uMisAB:{value:b()},uLine:{value:-1e5},uLineSpan:{value:b()},uBead:{value:new n(...v(`#ff2d87`))},uPaper:{value:new n(...v(f))},uKey:{value:new n(...v(d))}},E=C(p),O=E.map(e=>S(e,l[s].halftone)),k={data:u,tex:y,cur:O,prev:O.slice(),pull:O.map(()=>({t:1,delay:0,dur:.6})),modeA:s,modeB:s,wipe:1,area:null,focus:null,css:{w:1,h:1,dpr:1},sheet:{x:0,y:0,w:1,h:1},grid:{cols:l[s].cols,rows:l[s].rows},palIdx:E};T(k);let A={frag:g,uniforms:w,background:c.background,update(e,{dpr:t,width:n,height:r}){let i=n,a=r;k.css={w:i/t,h:a/t,dpr:t};let o=w,s=Math.max(16,Math.min(i,a)/t*.04),c=k.area?{x:k.area.x*t,y:k.area.y*t,w:k.area.w*t,h:k.area.h*t}:{x:s*t,y:s*t,w:i-2*s*t,h:a-2*s*t},d=k.focus?{x:k.focus.x*t,y:k.focus.y*t,w:k.focus.w*t,h:k.focus.h*t}:{x:0,y:0,w:i,h:a},f=(e,n,r,o)=>{let s=D(e,c,t);n.set(s.x,a-(s.y+s.h),s.w,s.h),r.set(s.cols,s.rows,s.g,l[e].benday);let u=d.w,f=d.h;return s.aspect<d.w/d.h?u=d.h*s.aspect:f=d.w/s.aspect,o.set((d.x+d.w/2)/i,1-(d.y+d.h/2)/a,u/i,f/a),s};f(k.modeA,o.uSheetA.value,o.uGridA.value,o.uWinA.value);let p=f(k.modeB,o.uSheetB.value,o.uGridB.value,o.uWinB.value);if(k.sheet={x:p.x/t,y:p.y/t,w:p.w/t,h:p.h/t},k.grid={cols:p.cols,rows:p.rows},o.uMisAB.value.set(l[k.modeA].mis,l[k.modeB].mis,0,0),k.wipe<1){k.wipe=Math.min(1,k.wipe+e/1.05);let n=o.uSheetA.value,r=o.uSheetB.value,i=Math.max(n.y+n.w,r.y+r.w)+14*t,a=Math.min(n.y,r.y)-24*t;o.uLine.value=i-x(k.wipe)*(i-a),o.uLineSpan.value.set(Math.min(n.x,r.x),Math.max(n.x+n.z,r.x+r.z),0,0),k.wipe>=1&&(k.modeA=k.modeB,o.uLine.value=-1e5)}let m=!1;k.pull.forEach((t,n)=>{t.t>=1||(t.delay>0?t.delay-=e:(t.t=Math.min(1,t.t+e/t.dur),u[(144+n)*4]=x(t.t),m=!0))}),m&&(y.needsUpdate=!0)}};for(let e=0;e<p;e++)u[(144+e)*4]=1;return y.needsUpdate=!0,_.set(A,k),A}function k(e,t){let n=_.get(e);if(!n||t===n.modeB)return;n.modeA=n.modeB,n.modeB=t,n.prev=n.cur;let r=C(p,n.palIdx);n.palIdx=r,n.cur=r.map(e=>S(e,l[t].halftone)),n.pull.forEach((e,t)=>{e.t=1,n.data[(144+t)*4]=1}),T(n),n.wipe=0;let i=n.cur[0].pal[0];e.uniforms.uBead.value.set(i[0],i[1],i[2]),n.css.w<=1&&(n.modeA=t,n.wipe=1)}function A(e,t,n=0){let r=_.get(e);if(!r||t<0||t>=p)return;let i=new Set(r.palIdx),a=Math.floor(Math.random()*u.length);for(let e=0;e<20&&(i.has(a)||a===r.palIdx[t]);e++)a=Math.floor(Math.random()*u.length);r.palIdx[t]=a,r.prev[t]=r.pull[t].t>=.5?r.cur[t]:r.prev[t],r.cur[t]=S(a,l[r.modeB].halftone),w(r,t,r.prev[t],m/2),w(r,t,r.cur[t],0),r.pull[t]={t:0,delay:n,dur:y(.5,.68)},r.data[(144+t)*4]=0,r.tex.needsUpdate=!0}function j(e){if(!_.get(e))return;let t=M(e);for(let n=0;n<t;n++)A(e,n,n*(t>4?.07:.13))}function M(e){let t=_.get(e);return t?t.grid.cols*t.grid.rows:4}function N(e,t){let n=_.get(e);n&&(t.area!==void 0&&(n.area=t.area),t.focus!==void 0&&(n.focus=t.focus))}function P(e,t,n){let r=_.get(e);if(!r)return-1;let i=r.sheet,a=r.grid,o=Math.floor((t-i.x)/i.w*a.cols),s=Math.floor((n-i.y)/i.h*a.rows);return o<0||s<0||o>=a.cols||s>=a.rows?-1:s*a.cols+o}function F(e){let t=_.get(e);return t?t.palIdx.map(e=>u[e]):[]}export{M as a,N as c,P as i,k as l,c as n,F as o,s as r,A as s,O as t,j as u};