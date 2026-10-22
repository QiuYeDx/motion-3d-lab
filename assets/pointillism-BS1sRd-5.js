import{B as e,Ht as t,bn as n,jt as r,yn as i}from"./events-9ce18a08.esm-BJiOHOtz.js";var a=[{id:`seurat`,label:`修拉`},{id:`signac`,label:`西涅克`},{id:`modern`,label:`现代`}],o={title:`点彩派`,en:`Pointillism`,background:`#f1ead9`,theme:`light`},s={seurat:`#efe6d2`,signac:`#f2ead8`,modern:`#fbfaf6`},c=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},l={seurat:[`#f6f0dc`,`#f2dc5a`,`#e8b335`,`#e2802f`,`#cf3f2c`,`#d9798a`,`#7a5aa6`,`#2e47a3`,`#4f78c4`,`#7fb6dc`,`#1f7a62`,`#3f9f56`,`#a4c24a`,`#2b2f66`,`#6f9e3c`,`#1f4a3c`].map(c),signac:[`#fbf6e6`,`#ffe14a`,`#ffb323`,`#ff7a1e`,`#ec3524`,`#f06d9c`,`#8a4fd0`,`#2a3fc0`,`#3f7ee6`,`#4fc3ee`,`#0f8f6f`,`#2fb455`,`#b4dc3a`,`#22205e`,`#62b030`,`#124f3a`].map(c),modern:[`#e8e3d8`,`#ffe600`,`#ffc400`,`#ff7a00`,`#ff2d2d`,`#ff2d8f`,`#8f3fe0`,`#1d3fe0`,`#0088ff`,`#00c2e8`,`#00a86b`,`#2fd05a`,`#a8e600`,`#16161d`,`#5cc23a`,`#00664a`].map(c)},u=16,d=[6,6,7,8,10,11,2,3,3,4,5,5,6,2,5,3],f={seurat:{ground:c(s.seurat),cell:6.2,rad:.6,layers:[1,.9,.78],aspect:1.28,square:0,jit:.75,hex:0,flow:.25,sat:1.18,comp:1,warm:1,tex:1,tone:0,crisp:0,weave:1,minMix:.24,maxMix:.5,analog:.12},signac:{ground:c(s.signac),cell:10,rad:.5,layers:[1,.78,0],aspect:1.12,square:1,jit:.3,hex:0,flow:1,sat:1.4,comp:.7,warm:.7,tex:.8,tone:0,crisp:.25,weave:.8,minMix:.2,maxMix:.5,analog:.12},modern:{ground:c(s.modern),cell:15,rad:.47,layers:[1,.36,.36],aspect:1,square:0,jit:0,hex:1,flow:0,sat:1.35,comp:0,warm:0,tex:0,tone:1,crisp:1,weave:0,minMix:0,maxMix:.3,analog:.7}},p=(e,t,n)=>{let r={};for(let i of Object.keys(e)){let a=e[i],o=t[i];r[i]=Array.isArray(a)?a.map((e,t)=>e+(o[t]-e)*n):a+(o-a)*n}return r},m=`
uniform sampler2D tPal;     // NPAL × 2: row 0 colours (sRGB), row 1 .r = complement index / 255
uniform vec3 uGround;
uniform float uCell;        // CSS px (size × view zoom already applied)
uniform float uRad;
uniform vec3 uLayerR;
uniform float uAspect;
uniform float uSquare;
uniform float uJit;
uniform float uHex;
uniform float uFlow;
uniform float uSat;
uniform float uComp;
uniform float uWarm;
uniform float uTex;
uniform float uTone;
uniform float uCrisp;
uniform float uWeave;
uniform float uMinMix;      // least share of the second colour
uniform float uMaxMix;      // most share of the second colour
uniform float uAnalog;      // preference for partners close to the target colour
uniform vec4 uLens;         // centre (device px, GL y-up), radius (device px), zoom
uniform float uLensA;       // lens opacity

#define NPAL ${u}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec3 palAt(int i) { return texelFetch(tPal, ivec2(i, 0), 0).rgb; }

/* split a colour into two palette colours + the share of the second one */
vec3 splitColour(vec3 t, out int i1, out int i2) {
  // near-neutral passages (white cloth, a cream table) stay calm; coloured ones are always a mixture
  float chroma = max(t.r, max(t.g, t.b)) - min(t.r, min(t.g, t.b));
  float minMix = uMinMix * smoothstep(0.05, 0.2, chroma);
  float b1 = 1e9;
  i1 = 0;
  for (int i = 0; i < NPAL; i++) {
    vec3 d = palAt(i) - t;
    float l = dot(d, vec3(0.299, 0.587, 0.114));
    float e = dot(d * d, vec3(0.3, 0.45, 0.25)) + l * l * 0.8;
    if (e < b1) { b1 = e; i1 = i; }
  }
  vec3 p1 = palAt(i1);
  float b2 = 1e9, w = 0.0;
  i2 = i1;
  for (int i = 0; i < NPAL; i++) {
    if (i == i1) continue;
    vec3 d = palAt(i) - p1;
    // at least ~a quarter of the dabs are a second colour: every passage is a mixture, never flat
    float k = clamp(dot(t - p1, d) / max(dot(d, d), 1e-4), min(minMix, uMaxMix), uMaxMix);
    vec3 r = p1 + d * k - t;
    float l = dot(r, vec3(0.299, 0.587, 0.114));
    // partners of a similar value mix better optically (and keep the dabs from looking noisy)
    float dv = dot(d, vec3(0.299, 0.587, 0.114));
    // …and a partner that is itself close to the target (analogous dabs); complements come as flecks
    vec3 dp = palAt(i) - t;
    float e = dot(r * r, vec3(0.3, 0.45, 0.25)) + l * l * 0.8 + dv * dv * 0.06 * k + dot(dp * dp, vec3(0.3, 0.45, 0.25)) * uAnalog * k;
    if (e < b2) { b2 = e; i2 = i; w = k; }
  }
  // only use a partner that actually improves on the single colour
  // light neutrals are one colour (a chromatic partner would only be there to darken them)
  w *= mix(1.0, smoothstep(0.05, 0.14, chroma), smoothstep(0.5, 0.8, luma(t)));
  return vec3(w, b1, b2);
}

vec3 stylize(vec2 px) {
  /* lens: the painting under it is shown magnified */
  vec2 p = px;
  float lensR = uLens.z;
  float ld = length(px - uLens.xy);
  float inLens = 0.0;
  if (uLensA > 0.001 && ld < lensR) {
    p = uLens.xy + (px - uLens.xy) / uLens.w;
    inLens = 1.0;
  }
  float zoom = mix(1.0, uLens.w, inLens);
  float cell = uCell * uDpr;              // device px
  float rowH = mix(1.0, 0.8660254, uHex);
  vec2 cssP = p / uDpr;

  /* find the two top-most dabs covering p */
  float z1 = -1.0, z2 = -1.0;
  vec4 A1 = vec4(0.0), A2 = vec4(0.0);    // alpha, centre.xy (device px), radius (device px)
  vec4 B1 = vec4(0.0), B2 = vec4(0.0);    // local q.xy, threshold, random
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float rs = L == 0 ? uLayerR.x : (L == 1 ? uLayerR.y : uLayerR.z);
    if (rs < 0.02) continue;
    float ga = fl * 0.47 * (1.0 - uHex);
    float cg = cos(ga), sg = sin(ga);
    vec2 offR = vec2(0.31, 0.57) * fl;
    vec2 offH = L == 1 ? vec2(-0.5, -rowH / 3.0) : (L == 2 ? vec2(-1.0, -rowH * 2.0 / 3.0) : vec2(0.0));
    vec2 off = mix(offR, offH, uHex);
    vec2 g = vec2(cg * p.x + sg * p.y, -sg * p.x + cg * p.y) / cell + off;
    float gy = g.y / rowH;
    for (int j = 0; j < 9; j++) {
      float dx = float(j - (j / 3) * 3) - 1.0;
      float dy = float(j / 3) - 1.0;
      float row = floor(gy) + dy;
      float shift = uHex * 0.5 * mod(row, 2.0);
      float col = floor(g.x - shift) + dx;
      vec2 id = vec2(col, row) + fl * 113.0;
      vec2 h = hash22(id);
      float h3 = hash12(id + 7.7);
      vec2 cen = vec2(col + 0.5 + shift, (row + 0.5) * rowH) + (h - 0.5) * uJit;
      // centre in screen px straight from the lattice (identical for every pixel of the dab, so the
      // colour decision can't flicker inside a dab)
      vec2 cL = (cen - off) * cell;
      vec2 cenP = vec2(cg * cL.x - sg * cL.y, sg * cL.x + cg * cL.y);
      vec2 rel = p - cenP;
      float rad = uRad * rs * cell * mix(0.84 + 0.32 * h3, 1.0, uCrisp);
      if (uTone > 0.001) {
        float lt = luma(sceneL(cenP));
        rad *= mix(1.0, mix(0.42, 1.06, smoothstep(0.95, 0.25, lt)), uTone);
      }
      // orientation: random, or along a slow flow field
      float fa = vnoise(cenP / uDpr * 0.006) * 9.0;
      float ang = mix(h.x * 6.2832, fa + (h.y - 0.5) * 0.5, uFlow);
      float ca = cos(ang), sa = sin(ang);
      vec2 q = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y) / rad;
      q.x /= uAspect;
      vec2 q2 = q * q;
      float d = mix(length(q), sqrt(sqrt(q2.x * q2.x + q2.y * q2.y)) * 1.04, uSquare);
      d += (1.0 - uCrisp) * 0.09 * sin(q.x * 3.1 + h3 * 9.0) * sin(q.y * 2.7 + h.y * 9.0);
      float a = clamp((1.0 - d) * rad * zoom + 0.5, 0.0, 1.0);   // AA over one screen px
      if (a <= 0.0) continue;
      float z = fl + h3 * 0.9;
      // ordered threshold over the lattice (R2 sequence) → neighbouring dabs alternate evenly
      float tau = fract(0.7548777 * col + 0.5698403 * row + fl * 0.381966);
      if (z > z1) {
        z2 = z1; A2 = A1; B2 = B1;
        z1 = z; A1 = vec4(a, cenP, rad); B1 = vec4(q, tau, h3);
      } else if (z > z2) {
        z2 = z; A2 = vec4(a, cenP, rad); B2 = vec4(q, tau, h3);
      }
    }
  }

  /* canvas ground */
  float wv = sin(cssP.x * 2.3) * sin(cssP.y * 2.3);
  vec3 col = uGround * (1.0 + uWeave * (0.035 * wv + 0.03 * (hash12(floor(cssP * 1.1)) - 0.5) - 0.02 * (vnoise(cssP * 0.05) - 0.5)));

  /* paint the two dabs, lower first */
  for (int k = 0; k < 2; k++) {
    vec4 A = k == 0 ? A2 : A1;
    vec4 B = k == 0 ? B2 : B1;
    if (A.x <= 0.0) continue;
    vec2 c = A.yz;
    // empty background (nothing rendered there): bare canvas with only a sparse scatter of dabs
    if (textureLod(tNormal, c / uRes, 0.0).a < 0.5 && fract(B.w * 37.13 + B.z * 0.37) > 0.14) continue;
    float r = A.w;
    vec3 t = (sceneL(c) * 2.0 + sceneL(c + vec2(r * 0.45, 0.0)) + sceneL(c - vec2(0.0, r * 0.45))) * 0.25;
    float lt = luma(t);
    t = clamp(mix(vec3(lt), t, uSat), 0.0, 1.0);
    int i1, i2;
    vec3 sw = splitColour(t, i1, i2);
    int ci = B.z < sw.x ? i2 : i1;
    // Seurat's contrasts: complements in the shadows, warm light, cool half-shadow
    float rr = hash12(vec2(B.w, B.z) * 113.7 + 3.1);
    float shadow = smoothstep(0.5, 0.18, lt);
    if (rr < uComp * 0.08 * shadow) {
      ci = int(texelFetch(tPal, ivec2(i1, 1), 0).r * 255.0 + 0.5);
    } else if (rr > 1.0 - uWarm * 0.08 * smoothstep(0.42, 0.8, lt)) {
      ci = rr > 1.0 - uWarm * 0.025 ? 3 : 2;
    } else if (rr > 1.0 - uWarm * 0.07 * smoothstep(0.2, 0.42, lt) * smoothstep(0.62, 0.42, lt)) {
      ci = rr > 1.0 - uWarm * 0.03 ? 6 : 7;
    }
    vec3 dc = palAt(ci);
    // paint body: a dome lit from the upper left, bristle streaks along the dab, a slightly darker rim
    vec2 ns = clamp(B.xy, -1.0, 1.0);
    float dome = dot(normalize(vec2(-0.6, 0.8)), (p - c) / r);
    float brist = sin(B.y * 9.0 + B.w * 40.0) * 0.5 + 0.5 * sin(B.y * 23.0 + B.w * 17.0);
    float rim = smoothstep(0.55, 1.0, length(ns));
    float shade = 1.0 + uTex * (0.07 * dome + 0.035 * brist - 0.06 * rim + 0.03 * (B.w - 0.5));
    col = mix(col, dc * shade, A.x);
  }

  /* lens rim */
  if (uLensA > 0.001) {
    float edge = abs(ld - lensR);
    float ring = 1.0 - smoothstep(1.2 * uDpr, 2.4 * uDpr, edge);
    float shadow = smoothstep(lensR + 18.0 * uDpr, lensR, ld) * step(lensR, ld) * 0.2;
    float glint = inLens * smoothstep(lensR * 0.75, lensR, ld) * max(0.0, dot(normalize(px - uLens.xy + 1e-4), vec2(-0.7, 0.7))) * 0.25;
    col = mix(col, col * 0.7, shadow * uLensA);
    col = mix(col, vec3(1.0), glint * uLensA);
    col = mix(col, vec3(0.13, 0.12, 0.14), ring * uLensA);
  }
  return clamp(col, 0.0, 1.0);
}
`,h=2.7;function g(){let a={from:f.seurat,to:f.seurat,cur:f.seurat,palFrom:l.seurat,palTo:l.seurat,k:1,size:1,sizeTarget:1,view:1,viewTarget:1,lens:{x:0,y:0,on:!1,a:0,r:120,zoom:3},mode:`seurat`},s=new Uint8Array(128);for(let e=0;e<u;e++)s[(u+e)*4]=d[e],s[(u+e)*4+3]=255;let c=new e(s,u,2,t);c.colorSpace=``,c.magFilter=c.minFilter=r;let h=(e,t,n)=>{for(let r=0;r<u;r++){for(let i=0;i<3;i++)s[r*4+i]=Math.round((e[r][i]+(t[r][i]-e[r][i])*n)*255);s[r*4+3]=255}c.needsUpdate=!0};h(l.seurat,l.seurat,1);let g={tPal:{value:c},uGround:{value:new i(...f.seurat.ground)},uCell:{value:6},uRad:{value:.6},uLayerR:{value:new i(1,1,1)},uAspect:{value:1},uSquare:{value:0},uJit:{value:0},uHex:{value:0},uFlow:{value:0},uSat:{value:1},uComp:{value:0},uWarm:{value:0},uTex:{value:0},uTone:{value:0},uCrisp:{value:0},uWeave:{value:0},uMinMix:{value:.24},uMaxMix:{value:.5},uAnalog:{value:.12},uLens:{value:new n(0,0,1,3)},uLensA:{value:0}},_=e=>{g.uGround.value.set(...e.ground),g.uCell.value=e.cell*a.size*a.view,g.uRad.value=e.rad,g.uLayerR.value.set(...e.layers),g.uAspect.value=e.aspect,g.uSquare.value=e.square,g.uJit.value=e.jit,g.uHex.value=e.hex,g.uFlow.value=e.flow,g.uSat.value=e.sat,g.uComp.value=e.comp,g.uWarm.value=e.warm,g.uTex.value=e.tex,g.uTone.value=e.tone,g.uCrisp.value=e.crisp,g.uWeave.value=e.weave,g.uMinMix.value=e.minMix,g.uMaxMix.value=e.maxMix,g.uAnalog.value=e.analog};return _(a.cur),{normals:!0,frag:m,uniforms:g,background:o.background,pt:a,update(e,t){if(a.k<1){a.k=Math.min(1,a.k+e/.85);let t=a.k<.5?4*a.k**3:1-(-2*a.k+2)**3/2;a.cur=p(a.from,a.to,t),h(a.palFrom,a.palTo,t)}a.size+=(a.sizeTarget-a.size)*Math.min(1,e*6);let n=Math.log(a.view);a.view=Math.exp(n+(Math.log(a.viewTarget)-n)*Math.min(1,e*3.2));let r=a.lens;r.a+=(+!!r.on-r.a)*Math.min(1,e*10);let i=t?.dpr??1,o=t?.height??0;g.uLens.value.set(r.x*i,o-r.y*i,r.r*i*(.6+.4*r.a),r.zoom),g.uLensA.value=r.a,_(a.cur)}}}function _(e,t){let n=e.pt;if(!n||n.mode===t)return;let r=e.uniforms.tPal.value.image.data;n.palFrom=Array.from({length:u},(e,t)=>[r[t*4]/255,r[t*4+1]/255,r[t*4+2]/255]),n.palTo=l[t],n.mode=t,n.from=n.cur,n.to=f[t],n.k=0}function v(e,t){let n=e.pt;n&&(n.sizeTarget=t)}function y(e,t){let n=e.pt;n&&(n.viewTarget=t===`near`?h:1)}function b(e,t,n,r,i=120,a=3.2){let o=e.pt?.lens;o&&(o.x=t,o.y=n,o.on=r,o.r=i,o.zoom=a)}export{b as a,y as c,a as i,s as n,_ as o,o as r,v as s,g as t};