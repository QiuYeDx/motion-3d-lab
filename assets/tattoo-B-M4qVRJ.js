import{_n as e,gn as t,vn as n}from"./events-9ce18a08.esm-BkDjjFw8.js";var r=[{id:`traditional`,label:`美式传统`,en:`American Traditional`},{id:`blackgrey`,label:`黑灰写实`,en:`Black & Grey`},{id:`dotwork`,label:`点刺几何`,en:`Dotwork`}],i={title:`刺青线稿`,en:`Tattoo Flash`,background:`#efe2c8`,theme:`light`},a=[`#c4281c`,`#b8611e`,`#ecb52a`,`#2f7d3b`,`#2a5a9e`,`#6a3d8a`],o={traditional:{lineW:6.2,inner:.6,color:1,wash:0,stip:1,solid:1,hi:1,geo:0,dot:.95,cell:3.3,soft:.45,shadeHi:.68,shadeLo:.16,gamma:1.1},blackgrey:{lineW:2.2,inner:.7,color:0,wash:1,stip:.18,solid:.75,hi:.75,geo:0,dot:.6,cell:3,soft:.35,shadeHi:.9,shadeLo:.08,gamma:1.1},dotwork:{lineW:1.7,inner:.85,color:0,wash:0,stip:1,solid:0,hi:0,geo:1,dot:.85,cell:3,soft:.2,shadeHi:.9,shadeLo:.12,gamma:1}},s=`
uniform float uLineW;
uniform float uLineScale;
uniform float uInner;
uniform float uColor;
uniform float uWash;
uniform float uStip;
uniform float uSolid;
uniform float uHi;
uniform float uGeo;
uniform float uDot;
uniform float uCell;
uniform float uSoft;
uniform float uShadeHi;
uniform float uShadeLo;
uniform float uGamma;
uniform float uSkin;
uniform vec4 uGeoC;      // centre (GL device px), radius (device px), unused
uniform vec2 uMis;       // paint offset, CSS px
uniform vec3 uPaper;
uniform vec3 uSkinCol;
uniform vec3 uInk;
uniform vec3 uHealed;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float rawD(vec2 px) { return textureLod(tDepth, px / uRes, 0.0).r; }
float izOf(float d) {
  if (uOrtho > 0.5) return 1.0 / (uNear + d * (uFar - uNear));
  float z = d * 2.0 - 1.0;
  return (uFar + uNear - z * (uFar - uNear)) / (2.0 * uNear * uFar);
}

// colour family for outlines / fills: 0 = neutral or too dark to tell
int family(vec3 c) {
  float V = max(c.r, max(c.g, c.b));
  float m = min(c.r, min(c.g, c.b));
  float C = V - m;
  if (V < 0.1 || C / max(V, 1e-3) < 0.3) return 0;
  float h;
  if (V == c.r) h = (c.g - c.b) / C;
  else if (V == c.g) h = 2.0 + (c.b - c.r) / C;
  else h = 4.0 + (c.r - c.g) / C;
  h = fract(h / 6.0);
  if (h < 0.035 || h >= 0.9) return 1;
  if (h < 0.1) return 2;
  if (h < 0.19) return 3;
  if (h < 0.47) return 4;
  if (h < 0.76) return 5;
  return 6;
}
vec3 inkOf(int f) {
  if (f == 1) return vec3(0.769, 0.157, 0.110);
  if (f == 2) return vec3(0.722, 0.380, 0.118);
  if (f == 3) return vec3(0.925, 0.710, 0.165);
  if (f == 4) return vec3(0.184, 0.490, 0.231);
  if (f == 5) return vec3(0.165, 0.353, 0.620);
  return vec3(0.416, 0.239, 0.541);
}

// edge between the centre pixel and q: 2 = silhouette, 1 = inner, 0 = none
int edgeAt(vec2 q, vec2 px, float cov0, float iz0, vec2 grad, int fam0) {
  float d = rawD(q);
  float c = step(d, 0.99999);
  if (c != cov0) return 2;
  if (cov0 < 0.5) return 0;
  float iz = izOf(d);
  float pred = iz0 + dot(grad, q - px);
  if (abs(iz - pred) > 0.0022 * iz0) return 1;
  if (fam0 > 0) {
    int f = family(sceneL(q));
    if (f > 0 && f != fam0) return 1;
  }
  return 0;
}

vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + 31.7)); }

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  float skin = uSkin;

  /* ground: tea-stained flash paper ↔ skin */
  float n1 = vnoise(cp * 0.0026 + 3.0) * 0.65 + vnoise(cp * 0.008) * 0.35;
  float stain = smoothstep(0.52, 0.7, n1);
  float ring = smoothstep(0.035, 0.0, abs(n1 - 0.6)) * 0.8;
  float fox = smoothstep(0.985, 0.995, hash12(floor(cp * 0.12))) * smoothstep(0.6, 0.2, length(fract(cp * 0.12) - 0.5) * 2.0);
  vec3 paper = uPaper * (1.0 - 0.035 * (hash12(floor(cp)) - 0.5) - 0.03 * (vnoise(cp * 0.06) - 0.5));
  paper *= mix(vec3(1.0), vec3(0.9, 0.8, 0.62), stain * 0.16 + ring * 0.13 + fox * 0.4);
  vec2 sv = px / uRes - 0.5;
  paper *= 1.0 - 0.18 * smoothstep(0.25, 0.75, length(sv * vec2(1.0, 0.85)));
  float pore = vnoise(cp * 0.7) * 0.55 + vnoise(cp * 0.13) * 0.45;
  vec3 skinG = uSkinCol * (0.96 + 0.07 * pore) * (1.0 - 0.05 * vnoise(cp * 0.008));
  skinG = mix(skinG, skinG * vec3(1.03, 0.94, 0.92), smoothstep(0.55, 0.8, vnoise(cp * 0.01 + 7.0)) * 0.5);
  vec3 ground = mix(paper, skinG, skin);
  vec3 ink = mix(uInk, uHealed, skin);

  /* centre */
  float d0 = rawD(px);
  float cov0 = step(d0, 0.99999);
  float iz0 = izOf(d0);
  vec3 s0 = sceneL(px);
  int fam0 = family(s0);
  vec2 grad = vec2(0.0);
  if (cov0 > 0.5) {
    float r = izOf(rawD(px + vec2(1.0, 0.0))), l = izOf(rawD(px - vec2(1.0, 0.0)));
    float u = izOf(rawD(px + vec2(0.0, 1.0))), b = izOf(rawD(px - vec2(0.0, 1.0)));
    grad.x = abs(r - iz0) < abs(iz0 - l) ? r - iz0 : iz0 - l;
    grad.y = abs(u - iz0) < abs(iz0 - b) ? u - iz0 : iz0 - b;
  }

  /* distance to the nearest edge (silhouette / inner) */
  float Ws = 0.5 * uLineW * uLineScale * uDpr;
  float Wi = Ws * uInner;
  float aa = (0.7 + uSoft + skin * 1.3) * uDpr;
  float R = Ws + aa + 1.5 * uDpr;
  float dSil = 1e5;
  float dIn = 1e5;
  for (int i = 0; i < 10; i++) {
    float a = (float(i) + 0.5) * 0.6283185;
    vec2 dir = vec2(cos(a), sin(a));
    float lo = 0.0;
    float hi = 0.0;
    int hit = 0;
    for (int k = 1; k <= 3; k++) {
      float r = R * float(k) / 3.0;
      int e = edgeAt(px + dir * r, px, cov0, iz0, grad, fam0);
      if (e > 0) { hi = r; hit = e; break; }
      lo = r;
    }
    if (hit > 0) {
      for (int b = 0; b < 3; b++) {
        float m = 0.5 * (lo + hi);
        if (edgeAt(px + dir * m, px, cov0, iz0, grad, fam0) > 0) hi = m; else lo = m;
      }
      float dd = 0.5 * (lo + hi);
      if (hit == 2) dSil = min(dSil, dd); else dIn = min(dIn, dd);
    }
  }
  float line = max(smoothstep(Ws + aa, Ws - aa, dSil), smoothstep(Wi + aa, Wi - aa, dIn));
  float halo = smoothstep(R, Ws, min(dSil, dIn)) * (0.1 + 0.12 * skin);

  /* paint: off-register, wobbling, granulating */
  vec2 wob = (vec2(vnoise(cp * 0.02 + 4.0), vnoise(cp * 0.02 + 9.0)) - 0.5) * 6.0;
  vec2 pq = px + (uMis + wob) * uDpr;
  vec3 sF = sceneL(pq);
  float covF = step(rawD(pq), 0.99999);
  int famF = family(sF);
  float VF = max(sF.r, max(sF.g, sF.b));
  float mF = min(sF.r, min(sF.g, sF.b));
  // highlights stay bare: the specular whitens the colour until it drops out of its family (famF = 0);
  // a little before that the paint already thins out
  float bare = max(smoothstep(0.55, 0.68, mF / max(VF, 1e-3)), smoothstep(0.95, 0.99, VF));
  float gran = 0.84 + 0.16 * (vnoise(cp * 0.16) * 0.55 + vnoise(cp * 0.045 + 2.0) * 0.45);
  float fillA = (famF > 0 ? 1.0 : 0.0) * covF * (1.0 - bare) * uColor * gran;
  vec3 fillCol = famF > 0 ? inkOf(famF) : vec3(1.0);
  fillCol = mix(fillCol, vec3(luma(fillCol)), skin * 0.2);
  vec3 col = ground * mix(vec3(1.0), fillCol, fillA * 0.94);

  /* shading */
  float V0 = max(s0.r, max(s0.g, s0.b));
  float tone = mix(V0, luma(s0) * 1.15, uWash);
  float D = cov0 * pow(smoothstep(uShadeHi, uShadeLo, tone), uGamma);
  // black & grey wash: smooth, with a faint needle grain
  float washA = uWash * D * 0.82 * (0.94 + 0.06 * hash12(floor(cp * 1.5)));
  col *= mix(vec3(1.0), mix(ink, vec3(0.42, 0.43, 0.46), 0.35), washA);
  // stipple: two jittered grids, each cell one dot whose chance and size follow the darkness there
  float dots = 0.0;
  float cell = uCell * uDpr;
  for (int g = 0; g < 2; g++) {
    vec2 gp = px / cell + float(g) * vec2(0.5, 0.37);
    vec2 id = floor(gp);
    vec2 c = (id + 0.3 + 0.4 * hash22(id + float(g) * 17.0) - float(g) * vec2(0.5, 0.37)) * cell;
    vec3 sc = sceneL(c);
    float tc = mix(max(sc.r, max(sc.g, sc.b)), luma(sc) * 1.15, uWash);
    float Dc = step(rawD(c), 0.99999) * pow(smoothstep(uShadeHi, uShadeLo, tc), uGamma);
    float on = step(hash12(id * 1.37 + float(g) * 5.1), Dc * 1.05) * step(0.002, Dc);
    float r = uDot * uDpr * (0.55 + 0.45 * Dc);
    dots = max(dots, on * smoothstep(r + 0.55 * uDpr + skin * uDpr, r - 0.45 * uDpr, length(px - c)));
  }
  col = mix(col, ink, dots * uStip * 0.95);
  float solid = uSolid * cov0 * smoothstep(0.2, 0.12, tone);
  col = mix(col, ink, solid);

  /* outline, blowout */
  col = mix(col, ink, halo * (1.0 - line));
  col = mix(col, ink, line * 0.97);

  /* white highlight dashes */
  if (uHi > 0.01 && cov0 > 0.5) {
    vec2 q = mat2(0.866, 0.5, -0.5, 0.866) * cp;
    vec2 hc = vec2(9.0, 4.5);
    vec2 hid = floor(q / hc);
    vec2 hcen = (hid + 0.5) * hc;
    vec2 cpx = (mat2(0.866, -0.5, 0.5, 0.866) * hcen) * uDpr;
    vec3 sh = sceneL(cpx);
    float wh = min(sh.r, min(sh.g, sh.b)) / max(max(sh.r, max(sh.g, sh.b)), 1e-3);
    float zone = smoothstep(0.58, 0.64, wh);
    float pick = step(hash12(hid + 3.3), 0.4) * zone * (family(sh) > 0 ? 1.0 : 0.0);
    vec2 o = q - hcen;
    o.x = max(abs(o.x) - 2.2, 0.0);
    float dash = smoothstep(1.15, 0.6, length(o)) * pick;
    col = mix(col, vec3(0.99, 0.98, 0.95), dash * uHi * (1.0 - line) * (1.0 - 0.45 * skin));
  }

  /* fine geometric linework behind the subject (dotwork) */
  if (uGeo > 0.01 && cov0 < 0.5) {
    vec2 v = px - uGeoC.xy;
    float rr = length(v);
    float Rg = uGeoC.z;
    float ang = atan(v.y, v.x);
    float lw = 0.6 * uDpr;
    float g = 0.0;
    // solid fine circles
    g = max(g, smoothstep(lw + 0.6 * uDpr, lw - 0.4 * uDpr, abs(rr - Rg)));
    g = max(g, smoothstep(lw + 0.6 * uDpr, lw - 0.4 * uDpr, abs(rr - Rg * 1.045)));
    // dotted circles
    for (int j = 0; j < 2; j++) {
      float Rj = Rg * (j == 0 ? 0.62 : 0.84);
      float sp = 5.0 * uDpr / Rj;
      float aj = (floor(ang / sp) + 0.5) * sp;
      g = max(g, smoothstep(1.3 * uDpr, 0.5 * uDpr, length(v - Rj * vec2(cos(aj), sin(aj)))));
    }
    // dotted spokes between the dotted rings, and a scalloped band (arcs) outside
    float sa = 6.2831853 / 24.0;
    float as = (floor(ang / sa) + 0.5) * sa;
    vec2 dirS = vec2(cos(as), sin(as));
    float along = dot(v, dirS);
    float st = 6.0 * uDpr;
    float an = (floor(along / st) + 0.5) * st;
    float inBand = step(Rg * 0.66, an) * step(an, Rg * 0.8);
    g = max(g, inBand * smoothstep(1.1 * uDpr, 0.4 * uDpr, length(v - dirS * an)));
    float sc = 6.2831853 / 36.0;
    float ac = (floor(ang / sc) + 0.5) * sc;
    vec2 cc = Rg * 1.045 * vec2(cos(ac), sin(ac));
    float arc = abs(length(v - cc) - Rg * 0.09);
    g = max(g, step(Rg * 1.045, rr) * smoothstep(lw + 0.6 * uDpr, lw - 0.4 * uDpr, arc));
    g *= smoothstep(Rg * 0.5, Rg * 0.56, rr);
    col = mix(col, ink, g * uGeo * 0.85);
  }
  return col;
}
`,c=new WeakMap,l=t=>{let n=parseInt(t.slice(1),16);return new e((n>>16&255)/255,(n>>8&255)/255,(n&255)/255)},u={lineW:`uLineW`,inner:`uInner`,color:`uColor`,wash:`uWash`,stip:`uStip`,solid:`uSolid`,hi:`uHi`,geo:`uGeo`,dot:`uDot`,cell:`uCell`,soft:`uSoft`,shadeHi:`uShadeHi`,shadeLo:`uShadeLo`,gamma:`uGamma`},d=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2;function f(e={}){let r=e.mode??`traditional`,a=o[r],f={uLineScale:{value:1},uSkin:{value:0},uGeoC:{value:new n},uMis:{value:new t(2.4,-1.8)},uPaper:{value:l(`#efe2c8`)},uSkinCol:{value:l(`#e6b597`)},uInk:{value:l(`#141114`)},uHealed:{value:l(`#20283a`)}};for(let e of Object.keys(u))f[u[e]]={value:a[e]};let p={mode:r,from:a,to:a,k:1,skin:0,skinT:0,geo:null},m={frag:s,uniforms:f,background:i.background,update(e,{dpr:t,width:n,height:r}){if(p.k<1){p.k=Math.min(1,p.k+e/.75);let t=d(p.k);for(let e of Object.keys(u))f[u[e]].value=p.from[e]+(p.to[e]-p.from[e])*t}if(p.skin!==p.skinT){let t=p.skinT-p.skin;p.skin=Math.abs(t)<.002?p.skinT:p.skin+t*Math.min(1,e*4.5),f.uSkin.value=p.skin}let i=p.geo,a=f.uGeoC.value;i?a.set(i.x*t,r-i.y*t,i.r*t,0):a.set(n/2,r/2,Math.min(n,r)*.42,0)}};return c.set(m,p),m}function p(e,t){let n=c.get(e);if(!n||n.mode===t)return;let r=e.uniforms,i={};for(let e of Object.keys(u))i[e]=r[u[e]].value;n.from=i,n.to=o[t],n.mode=t,n.k=0}function m(e,t){e.uniforms.uLineScale.value=t}function h(e,t){let n=c.get(e);n&&(n.skinT=+!!t)}function g(e,t){let n=c.get(e);n&&(n.geo=t)}export{p as a,r as c,m as i,f as n,h as o,g as r,i as s,a as t};