import{$ as e,Bt as t,gn as n,kt as r,pn as i,vn as a,z as o}from"./events-9ce18a08.esm-BkDjjFw8.js";var s=[{id:`lamp`,label:`灯影`,en:`Lamp shadow`},{id:`silhouette`,label:`剪影`,en:`Silhouette`},{id:`lantern`,label:`走马灯`,en:`Revolving lantern`}],c={title:`皮影`,en:`Shadow Puppet`,background:`#ffffff`,theme:`dark`},l=[{id:`black`,zh:`墨`,hex:`#1b100a`},{id:`hide`,zh:`本色`,hex:`#f6cf8a`},{id:`red`,zh:`红`,hex:`#e8321c`},{id:`yellow`,zh:`黄`,hex:`#fbb51e`},{id:`green`,zh:`绿`,hex:`#3fa035`},{id:`cyan`,zh:`青`,hex:`#168a86`}],u={lamp:{A:[1,0,0,1],B:[1,.95,.84,.05],C:[.62,1,.36,.38]},silhouette:{A:[0,0,1,1],B:[1,.97,.9,.035],C:[.5,1.15,.3,0]},lantern:{A:[1,1,0,1],B:[1,.8,.56,.05],C:[.3,.85,.5,.3]}},d=e=>{let t=parseInt(e.slice(1),16);return[t>>16&255,t>>8&255,t&255]},f=`
#define PI 3.14159265
#define TAU 6.28318531
uniform sampler2D tDye;   // 8×1 RGBA8: dye transmittance
uniform sampler2D tRig;   // 2×32 float: per depth layer (origin x, y [CSS px, y up], motif, cut) (inverse frame a b c d)
uniform int uTaps;        // erosion probe taps (as a uniform: keeps the loop rolled on ANGLE/FXC)
uniform vec4 uPA;
uniform vec4 uPB;
uniform vec4 uPC;
uniform vec2 uLamp;       // lamp centre (uv)
uniform float uLampK;     // lamp intensity (breathing + flicker)
uniform float uDim;       // mode change: the lamp dips
uniform float uDrift;     // lantern drum rotation (fraction of the picture width)
uniform float uBlur;      // lantern motion blur (CSS px)
uniform float uCell;      // lattice scale
uniform float uBand;      // solid border band (CSS px)
uniform vec4 uRig;        // on, depth of layer 0, depth step per layer, layer count
uniform vec4 uRod0; uniform vec4 uRod1; uniform vec4 uRod2; uniform vec4 uRod3;  // CSS px from the top left
uniform float uRodK;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec4 sceneT(vec2 px) { return textureLod(tScene, px / uRes, 0.0); }
vec3 toS(vec3 c) {
  c *= uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
vec4 nrmT(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// traditional dyes by hue: 0 black · 1 undyed hide · 2 red · 3 yellow · 4 green · 5 青
float dyeOf(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float ch = mx - mn;
  if (mx < 0.17) return 0.0;
  if (ch < 0.17 * mx + 0.03) return mx < 0.36 ? 0.0 : 1.0;
  float h;
  if (mx == c.r) h = mod((c.g - c.b) / ch, 6.0);
  else if (mx == c.g) h = (c.b - c.r) / ch + 2.0;
  else h = (c.r - c.g) / ch + 4.0;
  h /= 6.0;
  if (h < 0.075 || h > 0.8) return 2.0;
  if (h < 0.2) return 3.0;
  if (h < 0.46) return 4.0;
  return 5.0;
}

/* lattice motifs in CSS px (local frame). Returns (signed distance to the hole, < 0 inside; cell centre; cell radius) */
vec4 motif(vec2 p, float m, float S) {
  if (m < 0.5) {
    // 菱形网格: square holes on a 45° grid, thin leather bars between
    float c = 10.0 * S;
    vec2 q = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
    vec2 id = floor(q / c);
    vec2 f = q - (id + 0.5) * c;
    float h = c * 0.5 - 1.55 * S;
    vec2 dq = abs(f) - (h - 1.0);
    float sd = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - 1.0;
    vec2 cq = (id + 0.5) * c;
    return vec4(sd, vec2(cq.x - cq.y, cq.x + cq.y) * 0.70710678, h * 1.42);
  }
  if (m > 3.5) {
    // 回纹: a square ring round a square hole; the ring is bridged on one side (turning per cell)
    float c = 15.0 * S;
    vec2 id = floor(p / c);
    vec2 cen = (id + 0.5) * c;
    vec2 f = p - cen;
    float k = mod(id.x + id.y * 2.0, 4.0);
    f = k < 0.5 ? f : (k < 1.5 ? vec2(-f.y, f.x) : (k < 2.5 ? -f : vec2(f.y, -f.x)));
    float chb = max(abs(f.x), abs(f.y));
    float ring = abs(chb - 4.5 * S) - 1.15 * S;
    ring = max(ring, min(1.25 * S - abs(f.y), f.x));
    return vec4(min(ring, chb - 1.6 * S), cen, 6.6 * S);
  }
  // the rest sit on staggered rows
  float c = m < 1.5 ? 22.0 * S : (m < 2.5 ? 17.0 * S : 6.6 * S);
  vec2 g = p / c;
  float row = floor(g.y);
  float sh = mod(row, 2.0) * 0.5;
  vec2 id = vec2(floor(g.x + sh), row);
  vec2 cen = (id + vec2(0.5 - sh, 0.5)) * c;
  vec2 f = p - cen;
  float r = length(f);
  if (m < 1.5) {
    // 团花: six petals round a centre dot
    float a = atan(f.y, f.x) + hash12(id) * 1.2;
    float sec = TAU / 6.0;
    float a2 = mod(a + sec * 0.5, sec) - sec * 0.5;
    vec2 q = r * vec2(cos(a2), sin(a2));
    float petal = (length((q - vec2(5.9 * S, 0.0)) / (vec2(3.3, 1.7) * S)) - 1.0) * 1.7 * S;
    return vec4(min(petal, r - 1.75 * S), cen, 9.4 * S);
  }
  if (m < 2.5) {
    // 云纹: an open ring curling round a dot, opening alternating per cell
    float a = atan(f.y, f.x);
    float a0 = mod(id.x + id.y, 2.0) < 0.5 ? 0.6 : 0.6 + PI;
    float ring = abs(r - 4.6 * S) - 1.15 * S;
    float da = abs(mod(a - a0 + PI, TAU) - PI);
    ring = max(ring, (0.8 - da) * r);
    vec2 t = f - vec2(cos(a0 + 1.9), sin(a0 + 1.9)) * 6.4 * S;   // a small tail curl
    float tail = abs(length(t) - 2.2 * S) - 0.75 * S;
    tail = max(tail, -dot(t, vec2(cos(a0 + 1.9), sin(a0 + 1.9))));
    return vec4(min(min(ring, r - 1.55 * S), tail), cen, 8.6 * S);
  }
  // 珠串: rows of small round holes
  return vec4(r - 1.45 * S, cen, 1.5 * S);
}

vec3 lampAt(vec2 uv) {
  vec2 d = (uv - uLamp) * vec2(uRes.x / uRes.y, 1.0);
  float r2 = dot(d, d);
  float g = exp(-r2 * 1.9 / (uPC.y * uPC.y));
  float core = exp(-r2 * 10.0 / (uPC.y * uPC.y));
  vec3 L = vec3(1.0, 0.66, 0.32) * (0.2 + 0.72 * g) + vec3(1.0, 0.9, 0.7) * core * uPC.z;
  return L * uLampK;
}

float rodShadow(vec2 tl, vec4 r) {
  vec2 ba = r.zw - r.xy;
  float L2 = dot(ba, ba);
  if (L2 < 1.0) return 0.0;
  vec2 pa = tl - r.xy;
  float h = clamp(dot(pa, ba) / L2, 0.0, 1.0);
  float d = length(pa - ba * h);
  float w = mix(1.1, 7.5, h);   // farther from the cloth → wider, softer
  return (1.0 - smoothstep(0.0, w, d - 0.5)) * mix(1.0, 0.3, h);
}

// lantern: approximate leather + screen at a sample position (for the motion-blur trail)
vec3 ghostAt(vec2 q, vec3 L) {
  vec3 c = toS(sceneT(q).rgb);
  float a = nrmT(q).a;
  vec3 t = mix(vec3(uPB.w), pow(c, vec3(1.25)) * 1.1, uPA.x);
  return L * mix(uPB.rgb, t, a);
}

vec3 stylize(vec2 px) {
  vec2 uv = px / uRes;
  float L = uPA.y;

  // lantern: the picture is wrapped round a turning drum; the sample position wraps round it
  vec2 sp = px;
  float cylA = uv.x * 2.0 - 1.0;
  if (L > 0.001) {
    cylA = mix(cylA, asin(clamp(cylA * 0.985, -1.0, 1.0)) / (PI * 0.5), 0.5);
    float xs = fract(cylA * 0.5 + 0.5 - uDrift);
    sp.x = mix(px.x, xs * uRes.x, L);
  }
  vec2 cp = sp / uDpr;               // picture space, CSS px (y up)
  vec2 tl = vec2(cp.x, uRes.y / uDpr - cp.y);

  vec3 c0 = toS(sceneT(sp).rgb);
  vec4 n0 = nrmT(sp);
  float d0 = depthL(sp);
  float dye = dyeOf(c0);
  float lay = floor((uRig.y - d0) / uRig.z + 0.5);
  bool rig = uRig.x > 0.5 && lay >= 0.0 && lay < uRig.w && n0.a > 0.5;
  float tol = rig ? uRig.z * 0.45 : max(d0 * 0.035, 0.02);

  // 1 · fine ring: soft silhouette, contact rim, engraved lines (creases, overlaps, dye borders)
  float r1 = 1.2 * uDpr;
  float cov = n0.a * 2.0;
  float line = 0.0;
  float rim = 0.0;
  for (int k = 0; k < 4; k++) {
    float a = float(k) * PI * 0.5 + 0.4;
    vec2 q = sp + vec2(cos(a), sin(a)) * r1;
    vec4 nk = nrmT(q);
    cov += nk.a;
    rim = max(rim, 1.0 - nk.a);
    if (n0.a > 0.5 && nk.a > 0.5) {
      float dn = 1.0 - dot(n0.rgb * 2.0 - 1.0, nk.rgb * 2.0 - 1.0);
      float dd = abs(depthL(q) - d0);
      float dc = abs(dyeOf(toS(sceneT(q).rgb)) - dye);   // dye borders (not shading / cast shadows)
      line = max(line, max(max(smoothstep(0.05, 0.22, dn), step(tol, dd)), step(0.5, dc)));
    }
  }
  cov = smoothstep(0.12, 0.88, cov / 6.0);

  // 2 · lattice: motif cell in the piece's frame (rig) or on the screen
  vec4 rigA = vec4(0.0), rigB = vec4(1.0, 0.0, 0.0, 1.0);
  vec2 lp = cp;
  float mId = dye < 0.5 ? 3.0 : (dye < 1.5 ? 0.0 : (dye < 2.5 ? 1.0 : (dye < 3.5 ? 4.0 : (dye < 4.5 ? 2.0 : 0.0))));
  float cut = 1.0;
  if (rig) {
    rigA = texelFetch(tRig, ivec2(0, int(lay)), 0);
    rigB = texelFetch(tRig, ivec2(1, int(lay)), 0);
    vec2 dl = cp - rigA.xy;
    lp = vec2(rigB.x * dl.x + rigB.y * dl.y, rigB.z * dl.x + rigB.w * dl.y);
    if (rigA.z > -0.5) mId = rigA.z;
    cut = rigA.w;
  }
  vec4 M = motif(lp, mId, uCell);
  float hole = 0.0;
  float hd = M.x;
  if (n0.a > 0.5 && cut > 0.5 && uPA.w > 0.01 && hd < 3.0) {
    // erosion probe round the whole cell: the hole exists only if the cell sits inside this piece
    vec2 cl = M.yz;
    vec2 ccp = cl;
    if (rig) {
      float det = rigB.x * rigB.w - rigB.y * rigB.z;
      ccp = rigA.xy + vec2(rigB.w * cl.x - rigB.y * cl.y, -rigB.z * cl.x + rigB.x * cl.y) / det;
    }
    vec2 cpx = ccp * uDpr;
    float R = (uBand + M.w) * uDpr;
    float inside = 1.0;
    for (int k = 0; k <= uTaps; k++) {
      float a = float(k) * TAU / float(uTaps) + 0.2;
      vec2 q = cpx + (k == uTaps ? vec2(0.0) : vec2(cos(a), sin(a)) * R);
      vec4 nk = nrmT(q);
      float same = nk.a > 0.5 && abs(depthL(q) - d0) < tol && dot(nk.rgb * 2.0 - 1.0, n0.rgb * 2.0 - 1.0) > 0.55
        && abs(dyeOf(toS(sceneT(q).rgb)) - dye) < 0.5 ? 1.0 : 0.0;
      inside = min(inside, same);
    }
    hole = inside * (1.0 - smoothstep(-0.6, 0.55, hd)) * uPA.w;
    hd = mix(9.0, hd, inside);
  } else {
    hd = 9.0;
  }

  // 3 · light
  vec3 Lc = lampAt(uv);
  vec2 sc = px / uDpr;   // the cloth does not turn with the drum
  float wv = sin(sc.x * 2.1) * sin(sc.y * 2.1);
  float slub = vnoise(sc * vec2(0.04, 0.9)) + vnoise(sc * vec2(0.9, 0.035) + 7.0);
  float weave = 0.96 + 0.035 * wv + 0.05 * (slub - 1.0) + 0.03 * (vnoise(sc * 0.02) - 0.5);
  vec3 cloth = Lc * uPB.rgb * weave;

  // 4 · leather
  vec3 T = texelFetch(tDye, ivec2(int(dye), 0), 0).rgb;
  T = mix(vec3(uPB.w) * vec3(1.0, 0.82, 0.7), T, uPA.x);
  float mott = 0.9 + 0.16 * vnoise(cp * 0.06 + lay * 5.3) + 0.08 * (vnoise(cp * vec2(0.5, 0.12) + lay) - 0.5);
  vec3 leather = Lc * T * mott * 1.22 * weave;
  leather *= 1.0 - uPC.w * rim;
  leather += Lc * T * 0.75 * exp(-max(hd, 0.0) / 1.4) * uPA.x;          // light bleeding round the holes
  leather += Lc * vec3(1.0, 0.6, 0.3) * 0.12 * exp(-max(hd, 0.0) / 1.0) * (1.0 - uPA.x);
  vec3 lineCol = mix(leather * 0.2, cloth * 0.92, uPA.z);
  leather = mix(leather, lineCol, line * 0.92 * (1.0 - hole));
  leather = mix(leather, cloth * 1.05, hole);

  vec3 col = mix(cloth, leather, cov);

  // lantern motion blur: a trail of the drifting figures
  if (L > 0.001) {
    vec3 gsum = vec3(0.0);
    float wsum = 0.0;
    for (int k = 1; k <= 6; k++) {
      float w = 1.0 - float(k) / 7.0;
      vec2 q = vec2(mod(sp.x - float(k) * uBlur / 6.0 * uDpr + uRes.x, uRes.x), sp.y);
      gsum += ghostAt(q, Lc) * w;
      wsum += w;
    }
    col = mix(col, gsum / wsum, 0.45 * L);
  }

  // 5 · rod shadows
  float rods = max(max(rodShadow(tl, uRod0), rodShadow(tl, uRod1)), max(rodShadow(tl, uRod2), rodShadow(tl, uRod3)));
  col *= 1.0 - rods * uRodK;

  // lantern shade: drum falls off to the sides, the frame's ribs stand still
  if (L > 0.001) {
    float drum = 0.45 + 0.55 * cos(clamp(uv.x * 2.0 - 1.0, -1.0, 1.0) * 1.35);
    float rib = abs(fract(cylA * 2.0) - 0.5) * uRes.x * 0.5 / uDpr;   // CSS px to the nearest rib (cylA = ±¼, ±¾)
    float ribs = 1.0 - 0.55 * (1.0 - smoothstep(1.5, 9.0, rib));
    float band = 0.9 + 0.12 * sin(cylA * 6.0 - uTime * 0.9);
    col *= mix(1.0, drum * ribs * band, L);
  }

  // vignette, lamp dip on mode change, a soft tone shoulder
  vec2 vq = (uv - vec2(0.5, 0.52)) * vec2(uRes.x / uRes.y * 0.75, 1.0);
  col *= 1.0 - uPC.x * smoothstep(0.25, 0.95, length(vq));
  col *= 1.0 - 0.88 * uDim;
  col = col / (1.0 + max(col - 1.0, 0.0));
  return clamp(col, 0.0, 1.0);
}
`,p=new WeakMap,m=e=>e.uniforms?p.get(e.uniforms):void 0,h=32;function g(s={}){let m=s.mode??`lamp`,g=s.flicker??.55,_=new Uint8Array(32);l.forEach((e,t)=>_.set([...d(e.hex),255],t*4));let v=new o(_,8,1,t,i);v.minFilter=v.magFilter=r,v.needsUpdate=!0;let y=new o(new Float32Array(256),2,h,t,e);y.minFilter=y.magFilter=r,y.needsUpdate=!0;let b=u[m],x={tDye:{value:v},tRig:{value:y},uTaps:{value:8},uPA:{value:new a().fromArray(b.A)},uPB:{value:new a().fromArray(b.B)},uPC:{value:new a().fromArray(b.C)},uLamp:{value:new n(.5,.56)},uLampK:{value:1},uDim:{value:0},uDrift:{value:0},uBlur:{value:14},uCell:{value:1},uBand:{value:7},uRig:{value:new a(0,50,.1,0)},uRod0:{value:new a},uRod1:{value:new a},uRod2:{value:new a},uRod3:{value:new a},uRodK:{value:.22}},S={mode:m,pending:null,dip:0,flicker:g,flickerT:g,t:0,drift:0,rods:null,lamp:null};p.set(x,S);let C=e=>{let t=u[e];x.uPA.value.fromArray(t.A),x.uPB.value.fromArray(t.B),x.uPC.value.fromArray(t.C)};return{frag:f,uniforms:x,normals:!0,background:c.background,update(e,t){let n=x;S.t+=e;let r=S.t;(S.pending||S.dip>0)&&(S.dip<1?(S.dip=Math.min(1,S.dip+e/.32),S.dip>=1&&S.pending&&(S.mode=S.pending,S.pending=null,C(S.mode),S.drift=0)):(S.dip=Math.min(2,S.dip+e/.6),S.dip>=2&&(S.dip=0)));let i=S.dip<=1?S.dip:2-S.dip;n.uDim.value=i*i*(3-2*i),S.flicker+=(S.flickerT-S.flicker)*(1-Math.exp(-e*4));let a=S.flicker,o=S.mode===`lantern`&&!S.pending;o&&(S.drift=(S.drift+e*.032)%1),n.uDrift.value=S.drift;let s=Math.sin(r*9.3)*.5+Math.sin(r*14.1+1.3)*.32+Math.sin(r*23.7+.4)*.18,c=Math.max(0,Math.sin(r*.73)*Math.sin(r*1.91+.5));n.uLampK.value=1+.045*Math.sin(r*1.2)+a*(.05*s+.09*c*Math.sin(r*17));let[l,u]=S.lamp??[.5,.56];o?n.uLamp.value.set(.5+Math.sin(r*.55)*.2,u+Math.sin(r*.9)*.03):n.uLamp.value.set(l+a*(.018*Math.sin(r*2.3)+.01*s*c),u+a*.012*Math.sin(r*3.1+1));let d=t.width/t.dpr,f=t.height/t.dpr,p=S.rods??[[d*.45,f*.44,d*.4,f*1.15],[d*.6,f*.5,d*.7,f*1.15]];for(let e=0;e<4;e++){let t=n[`uRod`+e].value,r=p[e];r?t.set(r[0],r[1],r[2],r[3]):t.set(0,0,0,0)}}}}function _(e,t){let n=m(e);n&&(n.pending??n.mode)!==t&&(n.pending=t,n.dip>1&&(n.dip=2-n.dip))}function v(e,t){let n=m(e);n&&(n.flickerT=t)}function y(e,t){let n=m(e);n&&(n.rods=t)}function b(e,t){let n=e.uniforms,r=n.uRig.value;if(!t){r.x=0;return}let i=n.tRig.value,a=i.image.data,o=Math.min(t.layers.length,h);for(let e=0;e<o;e++){let n=t.layers[e],r=e*8;n?(a[r]=n.x,a[r+1]=n.y,a[r+2]=n.motif,a[r+3]=+!!n.cut,a[r+4]=n.a,a[r+5]=n.b,a[r+6]=n.c,a[r+7]=n.d):(a.fill(0,r,r+8),a[r+4]=1,a[r+7]=1)}i.needsUpdate=!0,r.set(1,t.depth0,t.step,o)}export{v as a,y as c,s as i,g as n,_ as o,c as r,b as s,l as t};