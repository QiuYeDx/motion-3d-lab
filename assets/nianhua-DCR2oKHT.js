import{P as e,yn as t}from"./events-9ce18a08.esm-BJiOHOtz.js";import{a as n,i as r,n as i,o as a,r as o,t as s}from"./woodblock-DUldRbgP.js";var c=[{id:`yangliuqing`,label:`杨柳青`,en:`Yangliuqing`},{id:`taohuawu`,label:`桃花坞`,en:`Taohuawu`},{id:`zhuxianzhen`,label:`朱仙镇`,en:`Zhuxianzhen`}],l={title:`木版年画`,en:`Woodblock Nianhua`,background:`#f5eedc`,theme:`light`},u=[`黄版`,`红版`,`桃红版`,`绿版`,`蓝版`,`紫版`,`开脸`],d=[`#f2c02a`,`#d8302a`,`#ec6f9a`,`#2fa060`,`#3a62d0`,`#7d55c8`,`#f6dcc6`],f={yangliuqing:{inks:[`#f7d35c`,`#de4a3a`,`#f39db3`,`#5fae7c`,`#6382c8`,`#a67bbd`,`#fde6d4`],key:`#1d1713`,paper:`#f5eedc`,lineW:2.3,mis:1.5,grain:.35,soft:.62,patch:.25,blush:1},taohuawu:{inks:[`#ffd31c`,`#f0262d`,`#f6479c`,`#0fa85a`,`#2c5fde`,`#9a3ab9`,`#fcdcc8`],key:`#15100c`,paper:`#f7f0de`,lineW:3,mis:2.6,grain:1,soft:0,patch:.4,blush:.55},zhuxianzhen:{inks:[`#f0b62a`,`#d0322a`,`#d0322a`,`#2f8c4c`,`#71388a`,`#71388a`,`#f4e2b8`],key:`#120d0a`,paper:`#e9d5ab`,lineW:4,mis:5.2,grain:.75,soft:0,patch:.8,blush:0}},p=`
uniform sampler2D tPal;   // 8×2 float: row 0 = inks (blocks 0..6, key ink at 7); row 1 = class targets (xy)
uniform int uNB;          // colour blocks (7) — uniform loop bounds keep ANGLE/FXC from unrolling
uniform int uNT;          // classifier targets (8 = 7 blocks + paper)
uniform float uLineW;
uniform float uMis;
uniform float uGrain;
uniform float uSoft;
uniform float uPatch;
uniform float uBlush;
uniform float uSeed;
uniform float uPrint;     // 0 blank paper … 1 key block printed … 1 + k colour block k printed
uniform vec3 uPaper;

${s}

// soft membership of colour c in block k
float member(vec3 c, int k) {
  vec2 q = chromaKey(c);
  float dk = 1e3, dm = 1e3;
  for (int j = 0; j < uNT; j++) {
    float d = distance(q, texelFetch(tPal, ivec2(j, 1), 0).xy);
    if (j == k) dk = d; else dm = min(dm, d);
  }
  return smoothstep(-0.05, 0.05, dm - dk) * (1.0 - blackness(c, 0.14));
}

// wood grain picked up by the ink: 1 on an ink-starved streak
float woodGrain(vec2 cp, float k) {
  float a = (hash12(vec2(k, 3.1)) - 0.5) * 0.7;
  float ca = cos(a), sa = sin(a);
  vec2 r = vec2(ca * cp.x + sa * cp.y, -sa * cp.x + ca * cp.y);
  float w = r.y / 4.6 + 2.6 * fbm2(r * vec2(0.0035, 0.018) + k * 7.0) + 0.5 * vnoise(r * vec2(0.03, 0.2));
  float f = abs(fract(w) - 0.5) * 2.0;
  float streak = 1.0 - smoothstep(0.0, 0.42, f);
  float band = smoothstep(0.38, 0.78, vnoise(r * vec2(0.008, 0.05) + k * 3.0));
  return clamp(streak * (0.35 + 0.65 * band) + 0.3 * band, 0.0, 1.0);
}

// rubbing reveal for print stage progress p (0..1); dir alternates per block
float rub(vec2 px, vec2 cp, float p, float k) {
  if (p >= 1.0) return 1.0;
  if (p <= 0.0) return 0.0;
  float a = k * 2.39996 + 0.6;
  vec2 d = vec2(cos(a), sin(a));
  vec2 uv = (px / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float wc = dot(uv, d) / 1.6 + 0.5 + (fbm2(cp * vec2(0.004, 0.03) + k * 5.0) - 0.5) * 0.22;
  float x = p * 1.3 - 0.15;
  return smoothstep(wc - 0.05, wc + 0.01, x);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;

  /* --- key block: lines ------------------------------------------------ */
  float wob = 0.7 + 0.6 * fbm2(cp * 0.028 + uSeed * 3.0);
  float r = max(0.85, uLineW * 0.5 * wob) * uDpr;
  vec2 p0 = px + (vec2(vnoise(cp * 0.23), vnoise(cp * 0.23 + 7.7)) - 0.5) * 1.1 * uDpr;
  float i0 = idepthL(p0);
  vec4 n0 = normalL(p0);
  vec3 c0 = sceneL(p0);
  vec2 k0 = chromaKey(c0);
  float b0 = blackness(c0, 0.14);
  float s0 = specular(c0);
  float lap = 0.0, crease = 0.0, colr = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 0.7853982 + 0.2;
    vec2 d = vec2(cos(a), sin(a)) * r * (i == 1 || i == 3 ? 0.85 : 1.0);
    vec2 pa = p0 + d, pb = p0 - d;
    float ia = idepthL(pa), ib = idepthL(pb);
    lap = max(lap, abs(ia + ib - 2.0 * i0) / max(i0, max(ia, ib)));
    vec4 na = normalL(pa), nb = normalL(pb);
    if (n0.w > 0.5 && na.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, na.xyz));
    if (n0.w > 0.5 && nb.w > 0.5) crease = max(crease, 1.0 - dot(n0.xyz, nb.xyz));
    crease = max(crease, abs(na.w - nb.w) * 2.0);
    vec3 ca = sceneL(pa), cb = sceneL(pb);
    // highlights have no colour of their own: no colour edge into or out of them (depth / creases still ink)
    colr = max(colr, (distance(chromaKey(ca), k0) + abs(blackness(ca, 0.14) - b0)) * (1.0 - max(s0, specular(ca))));
    colr = max(colr, (distance(chromaKey(cb), k0) + abs(blackness(cb, 0.14) - b0)) * (1.0 - max(s0, specular(cb))));
  }
  float line = max(max(smoothstep(0.025, 0.07, lap), smoothstep(0.22, 0.42, crease)), smoothstep(0.26, 0.44, colr));
  // solid black areas (hair, lacquer) belong to the key block; no misregistration
  float key = max(line, b0);
  key *= rub(px, cp, clamp(uPrint, 0.0, 1.0), -1.0);
  key *= (0.9 + 0.1 * vnoise(cp * 0.31)) * (1.0 - 0.55 * step(0.9, vnoise(cp * 0.55 + 3.3)));

  /* --- paper ----------------------------------------------------------- */
  float fib = paperFibres(cp, 1.0);
  vec3 col = uPaper * (1.0 + fib);

  /* --- colour blocks, overprinted --------------------------------------- */
  vec4 N = normalL(px);
  for (int k = 0; k < uNB; k++) {
    float fk = float(k);
    float pk = clamp((uPrint - 1.0 - fk) * 1.35, 0.0, 1.0);
    if (pk <= 0.0) continue;
    bool hand = k == uNB - 1;    // the last block is the hand-painted face wash (开脸)
    vec2 h = vec2(hash12(vec2(fk * 7.1 + 1.3, uSeed)), hash12(vec2(fk * 3.7 + 9.1, uSeed + 4.2))) - 0.5;
    vec2 q = px - h * 2.0 * uMis * uDpr * (hand ? 0.3 : 1.0);
    float ang = hash12(vec2(fk, 5.5)) * 6.283;
    vec2 dir = vec2(cos(ang), sin(ang)) * 4.5 * uDpr;
    float m = 0.0, me = 1.0, sp = 0.0;
    vec3 cq = vec3(0.0);
    for (int j = 0; j < 3; j++) {           // 0: the block here · 1, 2: probes for the block's edge
      vec2 qj = q + (j == 0 ? vec2(0.0) : (j == 1 ? dir : -dir));
      vec3 c = sceneL(qj);
      float mm = member(c, k);
      if (j == 0) { m = mm; cq = c; sp = specular(c); } else me = min(me, mm);
    }
    // a small highlight enclosed by this block (both probes inside it) is printed over, not left as a hole
    m = max(m, sp * me);
    me = max(me, sp);
    if (m < 0.003) continue;
    float rev = hand ? smoothstep(0.0, 1.0, pk) : rub(px, cp, pk, fk);
    float load = 1.0 - uPatch * 0.5 * smoothstep(0.3, 0.85, fbm2(cp * 0.007 + fk * 13.0));
    load *= 1.0 - uPatch * 0.18 * vnoise(cp * 0.09 + fk);
    vec3 ink = texelFetch(tPal, ivec2(k, 0), 0).rgb;
    if (hand) {
      // 开脸: soft pink on the cheeks — where a round face turns sideways, a little below its middle
      vec2 cv = vec2(abs(N.x) - 0.48, N.y + 0.22);
      float bl = uBlush * exp(-dot(cv, cv) / 0.045) * step(0.5, N.w);
      ink = mix(ink, vec3(0.95, 0.52, 0.58), clamp(bl, 0.0, 1.0) * 0.75);
    } else {
      load *= 1.0 - 0.32 * (1.0 - me);                         // thinner where the block runs out
      load *= 1.0 - uGrain * 0.5 * woodGrain(cp, fk);
    }
    // 杨柳青: hand-finished gradients keep a little of the modelling
    float V = max(max(cq.r, cq.g), cq.b);
    ink *= mix(1.0, mix(0.74, 1.05, smoothstep(0.15, 0.85, V)), uSoft);
    float a = clamp(m * load * rev * (1.0 - max(fib, 0.0) * 1.6), 0.0, 1.0);
    col *= mix(vec3(1.0), ink, a);                              // transparent inks multiply
  }

  vec3 keyInk = texelFetch(tPal, ivec2(7, 0), 0).rgb;
  return mix(col, keyInk, clamp(key, 0.0, 1.0));
}
`,m=new WeakMap,h=e=>e.uniforms?m.get(e.uniforms):void 0,g=1.2,_=.62,v=1+u.length+.2;function y(s={}){let c=s.mode??`yangliuqing`,u=r(8,2);d.forEach((e,t)=>u.set(t,1,[...i(e),0,1])),u.set(7,1,[0,0,0,1]);let h={tPal:{value:u.tex},uNB:{value:7},uNT:{value:8},uLineW:{value:2},uMis:{value:2},uGrain:{value:.5},uSoft:{value:0},uPatch:{value:.3},uBlush:{value:1},uSeed:{value:.37},uPrint:{value:99},uPaper:{value:new t}},y={mode:c,from:f[c],to:f[c],k:1,print:99,printing:!1,scale:1};m.set(h,y);let b=new e,x=new e,S=(e,t,n)=>(b.setRGB(...a(e)),x.setRGB(...a(t)),b.lerp(x,n),[b.r,b.g,b.b]),C=()=>{let e=o(y.k),t=y.from,r=y.to;for(let n=0;n<7;n++)u.set(n,0,S(t.inks[n],r.inks[n],e));u.set(7,0,S(t.key,r.key,e)),u.tex.needsUpdate=!0,h.uPaper.value.set(...S(t.paper,r.paper,e)),h.uLineW.value=n(t.lineW,r.lineW,e)*y.scale,h.uMis.value=n(t.mis,r.mis,e)*y.scale,h.uGrain.value=n(t.grain,r.grain,e),h.uSoft.value=n(t.soft,r.soft,e),h.uPatch.value=n(t.patch,r.patch,e),h.uBlush.value=n(t.blush,r.blush,e)};return C(),{frag:p,uniforms:h,normals:!0,background:l.background,update(e){y.k<1&&(y.k=Math.min(1,y.k+e/.9),C()),y.printing&&(y.print+=e/(y.print<1?g:_),y.print>=v&&(y.print=99,y.printing=!1)),h.uPrint.value=y.print}}}function b(t,r){let i=h(t);if(!i||i.mode===r)return;let s=o(i.k),c=i.from,l=i.to,u={inks:c.inks.map((t,n)=>`#`+new e().setRGB(...a(t)).lerp(new e().setRGB(...a(l.inks[n])),s).getHexString()),key:`#`+new e().setRGB(...a(c.key)).lerp(new e().setRGB(...a(l.key)),s).getHexString(),paper:`#`+new e().setRGB(...a(c.paper)).lerp(new e().setRGB(...a(l.paper)),s).getHexString(),lineW:n(c.lineW,l.lineW,s),mis:n(c.mis,l.mis,s),grain:n(c.grain,l.grain,s),soft:n(c.soft,l.soft,s),patch:n(c.patch,l.patch,s),blush:n(c.blush,l.blush,s)};i.mode=r,i.from=u,i.to=f[r],i.k=0}function x(e,t){let r=h(e);if(!r||Math.abs(r.scale-t)<.001)return;r.scale=t;let i=e.uniforms,a=o(r.k);i.uLineW.value=n(r.from.lineW,r.to.lineW,a)*t,i.uMis.value=n(r.from.mis,r.to.mis,a)*t}function S(e){let t=h(e);t&&(t.print=0,t.printing=!0,e.uniforms.uSeed.value=Math.random()*10,e.uniforms.uPrint.value=0)}function C(e){let t=h(e);if(!t||!t.printing)return{stage:-1,label:``};if(t.print<1)return{stage:0,label:`墨线版`};let n=Math.min(u.length-1,Math.floor(t.print-1));return{stage:n+1,label:u[n]}}export{C as a,x as c,c as i,y as n,S as o,l as r,b as s,u as t};