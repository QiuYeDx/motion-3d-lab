import{$ as e,Bt as t,_n as n,kt as r,vn as i,z as a}from"./events-9ce18a08.esm-BkDjjFw8.js";var o=[{id:`pompeii`,label:`庞贝`,en:`Pompeii`},{id:`byzantine`,label:`拜占庭`,en:`Byzantine`},{id:`ostia`,label:`黑白`,en:`Ostia`}],s={title:`罗马镶嵌`,en:`Roman Mosaic`,background:`#e9dfcc`,theme:`light`},c={pompeii:[{hex:`#efe8d8`,name:`白大理石`},{hex:`#dccdac`,name:`石灰岩`},{hex:`#c9a35e`,name:`赭黄`},{hex:`#bb7a42`,name:`土橙`},{hex:`#a9512f`,name:`赤陶`},{hex:`#7e3320`,name:`铁锈红`},{hex:`#d6a28a`,name:`粉大理石`},{hex:`#8e9677`,name:`灰绿`},{hex:`#4d5f47`,name:`蛇纹石`},{hex:`#6a7379`,name:`板岩`},{hex:`#a29d91`,name:`灰石`},{hex:`#5e4330`,name:`褐石`},{hex:`#242221`,name:`玄武岩`},{hex:`#2e5b95`,name:`蓝玻璃`,kind:1},{hex:`#3e8d8a`,name:`青玻璃`,kind:1},{hex:`#d6a63a`,name:`金箔`,kind:2}],byzantine:[{hex:`#d9ad45`,name:`金箔`,kind:2},{hex:`#efd283`,name:`浅金`,kind:2},{hex:`#182869`,name:`青金石`,kind:1},{hex:`#2b4fb0`,name:`群青`,kind:1},{hex:`#6c99d6`,name:`天蓝`,kind:1},{hex:`#86202b`,name:`深红`,kind:1},{hex:`#c4412e`,name:`朱红`,kind:1},{hex:`#1d5e42`,name:`祖母绿`,kind:1},{hex:`#4f9450`,name:`翠绿`,kind:1},{hex:`#55285f`,name:`帝王紫`,kind:1},{hex:`#efe7d4`,name:`白大理石`},{hex:`#d9ae8c`,name:`肉色石`},{hex:`#a87a3c`,name:`赭石`},{hex:`#4d3122`,name:`褐石`},{hex:`#18171c`,name:`黑石`},{hex:`#c3c7cc`,name:`银箔`,kind:2}],ostia:[{hex:`#f0ebdf`,name:`白大理石`},{hex:`#1d1c1e`,name:`黑玄武岩`},{hex:`#8e8a82`,name:`灰石`}]},l={pompeii:{A:[8.5,3,.9,.1],B:[5,1.3,.85,.6],C:[0,.012,16,.4],D:[.79,.75,.67,0]},byzantine:{A:[10,2,1.2,.2],B:[4,1.35,.75,1],C:[1,.03,16,.3],D:[.4,.34,.27,0]},ostia:{A:[9,2,1,.08],B:[4,1,1,.45],C:[2,0,3,.35],D:[.8,.78,.73,.66]}},u=[`pompeii`,`byzantine`,`ostia`],d={pompeii:0,byzantine:1,ostia:2},f=16,p=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},m=e=>e<=.04045?e/12.92:((e+.055)/1.055)**2.4;function h(e){let[t,n,r]=p(e).map(m),i=Math.cbrt(.4122214708*t+.5363325363*n+.0514459929*r),a=Math.cbrt(.2119034982*t+.6806995451*n+.1073969566*r),o=Math.cbrt(.0883024619*t+.2817188376*n+.6299787005*r);return[.2104542553*i+.793617785*a-.0040720468*o,1.9779984951*i-2.428592205*a+.4505937099*o,.0259040371*i+.7827717662*a-.808675766*o]}var g=`
#define PI 3.14159265
// palettes as a 16×6 float texture: row 2m = OKLab + kind, row 2m+1 = sRGB (m = mode)
uniform sampler2D tPal;
uniform int uK;      // search directions (8)
uniform int uR;      // radial steps per direction
uniform int uB;      // bisection steps
// parameters of the incoming (T) and outgoing (F) mode:
//  A tile size (CSS px), contour courses, grout width (CSS px), stone tilt
//  B lightness bands, chroma boost before snapping, outline strength, gloss
//  C style (0 pompeii · 1 byzantine · 2 ostia), smalti sprinkle, palette size, chipped corners
//  D mortar colour, black/white threshold (OKLab L)
uniform vec4 uTA; uniform vec4 uTB; uniform vec4 uTC; uniform vec4 uTD;
uniform vec4 uFA; uniform vec4 uFB; uniform vec4 uFC; uniform vec4 uFD;
uniform float uFrom;
uniform float uTo;
uniform float uMix;
uniform float uSize;   // tile size multiplier
uniform vec3 uLight;   // point light: device px (x, y from the bottom) + height above the floor (device px)

vec4 PA; vec4 PB; vec4 PC; vec4 PD;
float ROW;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + vec2(37.1, 11.7))); }

// explicit-LOD fetches (no implicit derivatives inside loops). rgb linear, a = coverage
vec4 tapS(vec2 px) {
  vec2 uv = px / uRes;
  return vec4(textureLod(tScene, uv, 0.0).rgb * uExposure, textureLod(tNormal, uv, 0.0).a);
}
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec3 toSrgb(vec3 c) { c = c / (1.0 + c * 0.12); return clamp(linearToSrgb(c), 0.0, 1.0); }

vec3 toLab(vec3 c) {
  vec3 l = srgbToLinear(c);
  vec3 lms = vec3(
    0.4122214708 * l.r + 0.5363325363 * l.g + 0.0514459929 * l.b,
    0.2119034982 * l.r + 0.6806995451 * l.g + 0.1073969566 * l.b,
    0.0883024619 * l.r + 0.2817188376 * l.g + 0.6299787005 * l.b);
  lms = pow(max(lms, vec3(1e-6)), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}

// region key of a sample: lightness band + chromaticity
vec3 keyOf(vec4 s) {
  float l = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
  float L = pow(max(l, 1e-5), 1.0 / 3.0);
  vec2 ch = (s.rg / (s.r + s.g + s.b + 0.03) - 1.0 / 3.0) * smoothstep(0.002, 0.04, l);
  return vec3(floor(L * PB.x), ch);
}
bool differs(vec3 k0, float a0, vec4 s) {
  vec3 k = keyOf(s);
  return abs(a0 - s.a) > 0.5 || abs(k0.x - k.x) > 0.5 || length(k0.yz - k.yz) > 0.075;
}
float Z0;
float W0;   // 1 / depth at the pixel
vec2 GW;    // screen gradient of 1 / depth (linear across any plane, so receding floors are not edges)
// colour / coverage / depth discontinuity between the pixel and a point
bool edgeAt(vec3 k0, float a0, vec2 q) {
  float w = 1.0 / depthL(q);
  return differs(k0, a0, tapS(q)) || abs(w - W0 - dot(GW, q - gl_FragCoord.xy)) > 0.012 * W0;
}

// nearest stone of the current palette → sRGB + kind
vec4 snapStone(vec3 c) {
  vec3 lab = toLab(c);
  lab.yz *= PB.y;
  float best = 1e9;
  int bi = 0;
  int row = int(ROW);
  int np = int(PC.z);
  for (int i = 0; i < np; i++) {
    vec3 d = lab - texelFetch(tPal, ivec2(i, row), 0).xyz;
    float dd = d.x * d.x * 1.2 + (d.y * d.y + d.z * d.z) * 1.8;
    if (dd < best) { best = dd; bi = i; }
  }
  vec4 k = texelFetch(tPal, ivec2(bi, row), 0);
  return vec4(texelFetch(tPal, ivec2(bi, row + 1), 0).rgb, k.w);
}

vec2 dirK(float k) { float a = k * (PI * 0.25); return vec2(cos(a), sin(a)); }

// distance + unit normal (edge → pixel) of an edge through two hits (relative to the pixel)
vec3 fitEdge(vec2 u1, float r1, vec2 u2, float r2) {
  if (r1 > 1e3) return vec3(1e4, 0.0, 1.0);
  vec2 P1 = u1 * r1;
  if (r2 > 1e3) return vec3(r1 * 0.96, -u1);
  vec2 e = u2 * r2 - P1;
  float t = clamp(dot(-P1, e) / max(dot(e, e), 1e-4), 0.0, 1.0);
  vec2 f = P1 + e * t;
  float d = length(f);
  return vec3(d, -f / max(d, 1e-4));
}

// cut positions along a course: jittered spacing w, returns (cut before, cut after, index)
vec3 cuts(float c, float w, float seed) {
  float i = floor(c / w);
  float c0 = (i + (hash12(vec2(i, seed)) - 0.5) * 0.45) * w;
  if (c < c0) { i -= 1.0; c0 = (i + (hash12(vec2(i, seed)) - 0.5) * 0.45) * w; }
  float c1 = (i + 1.0 + (hash12(vec2(i + 1.0, seed)) - 0.5) * 0.45) * w;
  return vec3(c0, c1, i);
}

vec3 roman(vec2 px) {
  vec2 cp = px / uDpr;
  float h = max(PA.x * uSize * uDpr, 4.0);   // course height ≈ stone size (device px)
  float g = max(PA.z * uDpr * 0.5, 0.45);     // half joint
  float nRows = PA.y;
  float stepR = h * 0.5;

  vec4 s0 = tapS(px);
  vec3 k0 = keyOf(s0);
  float a0 = s0.a;
  Z0 = depthL(px);
  W0 = 1.0 / Z0;
  {
    // one-sided differences: the smaller slope wins, so a silhouette next door doesn't tilt the plane
    float wl = 1.0 / depthL(px - vec2(1.0, 0.0)), wr = 1.0 / depthL(px + vec2(1.0, 0.0));
    float wd = 1.0 / depthL(px - vec2(0.0, 1.0)), wu = 1.0 / depthL(px + vec2(0.0, 1.0));
    float gx1 = W0 - wl, gx2 = wr - W0, gy1 = W0 - wd, gy2 = wu - W0;
    GW = vec2(abs(gx1) < abs(gx2) ? gx1 : gx2, abs(gy1) < abs(gy2) ? gy1 : gy2);
  }

  /* 1 · radial search for the nearest edge in 8 directions */
  float H[8];
  for (int k = 0; k < 8; k++) H[k] = 1e4;
  for (int k = 0; k < uK; k++) {
    vec2 u = dirK(float(k));
    for (int j = 1; j <= uR; j++) {
      float r = float(j) * stepR;
      if (edgeAt(k0, a0, px + u * r)) { H[k] = r; break; }
    }
  }
  int kb = 0;
  float hb = H[0];
  for (int k = 1; k < 8; k++) if (H[k] < hb) { hb = H[k]; kb = k; }
  int kp = (kb + 1) % 8, km = (kb + 7) % 8;
  int kn = H[kp] < H[km] ? kp : km;
  // nearest hit on the far side (≥ 90° away): the wall facing this one across a band
  int ko = (kb + 4) % 8;
  float ho = H[ko];
  for (int s = 2; s <= 6; s++) { int k = (kb + s) % 8; if (H[k] < ho) { ho = H[k]; ko = k; } }
  int op = (ko + 1) % 8, om = (ko + 7) % 8;
  int dp = (op - kb + 8) % 8, dm = (om - kb + 8) % 8;
  bool okp = dp >= 2 && dp <= 6, okm = dm >= 2 && dm <= 6;
  int kon = okp && (!okm || H[op] < H[om]) ? op : om;
  if (!okp && !okm) kon = ko;

  /* 2 · refine the four hits by bisection */
  vec4 kk = vec4(float(kb), float(kn), float(ko), float(kon));
  vec4 hh = vec4(H[kb], H[kn], H[ko], H[kon]);
  vec4 rr = vec4(1e4);
  for (int i = 0; i < 4; i++) {
    float hi = hh[i];
    if (hi > 1e3) continue;
    vec2 u = dirK(kk[i]);
    float lo = hi - stepR;
    for (int b = 0; b < uB; b++) {
      float m = 0.5 * (lo + hi);
      if (edgeAt(k0, a0, px + u * m)) hi = m; else lo = m;
    }
    rr[i] = 0.5 * (lo + hi);
  }
  vec3 E1 = fitEdge(dirK(kk.x), rr.x, dirK(kk.y), rr.y);
  vec3 E2 = fitEdge(dirK(kk.z), rr.z, dirK(kk.w), rr.w);
  if (kon == ko) E2.x = rr.z;
  float d = E1.x;
  vec2 n = E1.yz;
  // only a wall that faces this one counts (a curved edge seen sideways is the same wall)
  float dOpp = dot(E2.yz, n) < 0.3 || kon == ko ? E2.x : 1e4;

  // what is across the nearest edge: silhouette? which side is nearer / brighter?
  vec2 acrossPx = px - n * (d + max(2.0 * uDpr, h * 0.3));
  vec4 sO = tapS(acrossPx);
  float zO = depthL(acrossPx);
  float wO = 1.0 / zO - W0 - dot(GW, acrossPx - px);   // off the local plane: + nearer, − farther
  bool sil = abs(a0 - sO.a) > 0.5 || abs(wO) > 0.015 * W0;
  bool nearSide = a0 > sO.a + 0.5 || wO < -0.015 * W0;
  bool brighter = dot(s0.rgb, vec3(0.3, 0.59, 0.11)) > dot(sO.rgb, vec3(0.3, 0.59, 0.11));

  /* 3 · courses: contour-following near edges, straight and level beyond */
  // the pale ground only gets one or two courses round a figure before the straight courses start
  vec3 labP = toLab(toSrgb(s0.rgb));
  if (labP.x > 0.86 && length(labP.yz) < 0.05) nRows = max(nRows - 1.0, 1.0);
  // a band between two facing walls narrower than 2·rows+1 courses is filled evenly with whole courses
  // (a stripe one stone wide becomes one course); the middle course of an odd count is laid from one
  // canonical wall so its stones don't split along the medial axis
  float W = d + dOpp;
  bool narrow = dOpp < 1e3 && W < (2.0 * nRows + 1.0) * h;
  float hc = h;
  if (narrow) {
    float nf = max(1.0, floor(W / h + 0.5));
    hc = W / nf;
    float km = floor(d / hc);
    if (abs(km - (nf - 1.0) * 0.5) < 0.1 && dot(n, vec2(0.6, 0.8)) < 0.0) { d = dOpp; n = E2.yz; }
  }
  bool contour = narrow || d < nRows * h;
  vec2 t = vec2(-n.y, n.x);
  float sw = abs(t.x) - abs(t.y);

  // contour course
  float k = floor(d / hc);
  float fy = d / hc - k;
  bool ax = sw >= 0.0;
  float ta = ax ? t.x : t.y;
  vec2 e = px - n * d;
  float wE = h * 0.86;
  float c = (ax ? e.x : e.y) + k * 0.5 * wE + (ax ? 0.0 : 0.37 * wE);
  vec3 cc = cuts(c, wE, k + (ax ? 0.0 : 50.0));
  float ita = 1.0 / max(abs(ta), 0.5);
  float sAlongC = min(c - cc.x, cc.y - c) * ita;
  float sAcrossC = min(fy, 1.0 - fy) * hc;
  vec2 dirAlongC = (c - cc.x < cc.y - c ? -1.0 : 1.0) * sign(ta) * t;
  vec2 dirAcrossC = fy < 0.5 ? -n : n;
  vec2 centreC = e + t * ((0.5 * (cc.x + cc.y) - c) / (abs(ta) < 1e-3 ? 1e-3 : ta)) + n * (k + 0.5) * hc;

  // straight course (gently waving)
  float wave = (vnoise(cp * 0.011 + 3.0) - 0.5) * h * 0.9;
  float yy = px.y + wave;
  float rowS = floor(yy / h);
  float fyS = yy / h - rowS;
  float cS = px.x + rowS * 0.5 * h + hash12(vec2(rowS, 9.0)) * h;
  vec3 cs = cuts(cS, h, rowS + 700.0);
  float sAlongS = min(cS - cs.x, cs.y - cS);
  float sAcrossS = min(fyS, 1.0 - fyS) * h;
  vec2 dirAlongS = vec2(cS - cs.x < cs.y - cS ? -1.0 : 1.0, 0.0);
  vec2 dirAcrossS = vec2(0.0, fyS < 0.5 ? -1.0 : 1.0);
  vec2 centreS = vec2(px.x + 0.5 * (cs.x + cs.y) - cS, (rowS + 0.5) * h - wave);

  float sAlong = contour ? sAlongC : sAlongS;
  float sAcross = contour ? sAcrossC : sAcrossS;
  vec2 tid = contour ? vec2(cc.z + (ax ? 0.0 : 733.0), k * 7.0 + k0.x * 61.0 + a0 * 13.0) : vec2(cs.z, rowS + 5000.0);
  float s = min(sAlong, sAcross);
  if (!contour && d < 1e3) {
    s = min(s, d - nRows * h);     // straight courses are cut by the outermost contour course
  }
  // rounded and chipped corners, slightly irregular sides
  float rc = h * 0.2;
  if (sAlong < rc && sAcross < rc) s = min(s, rc - length(vec2(rc) - vec2(sAlong, sAcross)));
  vec2 corner = vec2(step(0.0, dot(contour ? dirAlongC : dirAlongS, vec2(1.0, 0.7))), step(0.0, dot(contour ? dirAcrossC : dirAcrossS, vec2(0.6, 1.0))));
  if (hash12(tid * 1.7 + corner * 3.3) < PC.w) {
    float chip = h * (0.16 + 0.2 * hash12(tid + corner + 4.0));
    s = min(s, (sAlong + sAcross - chip) * 0.7071);
  }
  s += (vnoise(cp * 0.55 + tid * 3.1) - 0.5) * 0.45 * uDpr;

  /* 4 · the stone's colour: sampled once at its centre, snapped to the palette */
  vec2 centre = contour ? centreC : centreS;
  vec4 sc = tapS(centre);
  if (differs(k0, a0, sc)) sc = s0;          // a strongly curved course reached across an edge
  vec3 src = toSrgb(sc.rgb);
  vec3 lab0 = toLab(src);
  float chroma = length(lab0.yz);
  float style = PC.x;
  bool firstRow = contour && k < 0.5;
  bool outline = firstRow && sil && nearSide;
  float ht = hash12(tid * 1.37 + 0.71);
  // the first course inside a silhouette is laid in a darker stone of the same hue
  vec3 q = outline ? mix(src, mix(src * src * 0.3, vec3(0.06), 0.7), PB.z) : src;
  vec4 P = snapStone(q);
  vec3 base = P.rgb;
  float kind = P.w;
  if (style > 1.5) {
    // Ostia: black figures on white, details picked out in white lines
    bool dark = lab0.x < PD.w || outline;
    if (firstRow && !sil && brighter && lab0.x > PD.w - 0.22) dark = false;
    if (firstRow && sil && !nearSide) dark = false;
    base = dark ? vec3(0.113, 0.11, 0.118) : vec3(0.94, 0.92, 0.875);
    if (!dark && hash12(tid + 21.7) < 0.02) base = vec3(0.56, 0.54, 0.51);
    kind = 0.0;
  } else if (style > 0.5) {
    // Byzantine: pale, unsaturated ground becomes gold leaf
    if ((lab0.x > 0.82 && chroma < 0.06) || a0 < 0.5) {
      base = mix(vec3(0.85, 0.66, 0.26), vec3(0.95, 0.8, 0.45), hash12(tid + 2.2));
      kind = 2.0;
    }
  }
  // a few gold smalti on the brightest stones
  bool ground = lab0.x > 0.86 && chroma < 0.05;
  if (kind < 0.5 && lab0.x > 0.74 && hash12(tid + 8.8) < (ground ? PC.y * 0.3 : PC.y * 8.0) && (ground || a0 > 0.5)) { base = vec3(0.86, 0.66, 0.24); kind = 2.0; }

  /* 5 · shading */
  vec3 col = base * (0.9 + 0.2 * ht);
  col += (hash12(tid + 3.1) - 0.5) * vec3(0.04, 0.012, -0.035) * (kind < 0.5 ? 1.0 : 0.4);
  if (kind < 0.5) {
    // limestone speckle + marble veins on the light stones
    float sp = vnoise(cp * 1.6 + tid * 7.0);
    col *= 0.94 + 0.08 * vnoise(cp * 0.42 + tid * 3.0);
    col *= 1.0 - 0.16 * smoothstep(0.74, 0.9, sp);
    col += 0.04 * smoothstep(0.82, 0.95, vnoise(cp * 2.3 + tid));
    float va = ht * 6.283;
    float vein = abs(sin(dot(cp, vec2(cos(va), sin(va))) * 0.33 + vnoise(cp * 0.16 + tid) * 5.0));
    col *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.14, vein)) * step(0.62, luma(base));
  } else if (kind < 1.5) {
    // glass: deeper colour toward the middle, a few seed bubbles
    col *= 0.86 + 0.24 * smoothstep(0.0, h * 0.5, s);
    float bub = 1.0 - smoothstep(0.15, 0.3, length(fract(cp * 0.42 + tid) - 0.5));
    col *= 1.0 + 0.1 * bub * step(0.6, hash12(floor(cp * 0.42 + tid)));
  } else {
    // gold leaf under a thin cover glass: crackle + uneven leaf
    col *= 0.86 + 0.24 * vnoise(cp * 0.9 + tid * 5.0);
  }
  vec2 tilt = (hash22(tid + 11.0) - 0.5) * 2.0 * PA.w * (kind > 1.5 ? 1.8 : kind > 0.5 ? 1.3 : 1.0);
  vec2 edgeDir = sAlong < sAcross ? (contour ? dirAlongC : dirAlongS) : (contour ? dirAcrossC : dirAcrossS);
  float bev = 1.0 - smoothstep(g, g + max(1.4 * uDpr, h * 0.22), s);
  vec3 nrm = normalize(vec3(tilt + edgeDir * bev * 0.55, 1.0));
  vec3 L = normalize(vec3(uLight.xy - px, uLight.z));
  vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
  float nl = max(dot(nrm, L), 0.0);
  float nh = max(dot(nrm, Hh), 0.0);
  col *= 0.68 + 0.4 * nl;
  float gl = PB.w * (kind > 1.5 ? 2.4 : kind > 0.5 ? 1.0 : 0.32);
  float shin = kind > 1.5 ? 110.0 : kind > 0.5 ? 70.0 : 26.0;
  vec3 specC = kind > 1.5 ? vec3(1.0, 0.88, 0.6) : vec3(1.0);
  col += specC * pow(nh, shin) * gl;
  if (kind > 1.5) col += base * pow(nh, 9.0) * 0.35;  // broad sheen of the leaf

  /* 6 · lime mortar */
  vec3 mortar = PD.rgb * (0.9 + 0.12 * vnoise(cp * 0.6)) * (0.96 + 0.06 * hash12(floor(cp * 1.3)));
  mortar *= 0.72 + 0.28 * clamp(1.0 - s / max(g, 1e-3), 0.0, 1.0);
  float m = smoothstep(g - 0.5, g + 0.5, s);
  return mix(mortar, col, m);
}

vec3 stylize(vec2 px) {
  // which mode this pixel shows (a ragged front re-lays the floor during a switch)
  bool to = true;
  if (uMix < 1.0) {
    float wc = wipeCoord(px) + (vnoise(px / uDpr * 0.03) - 0.5) * 0.06;
    to = wc < uMix * 1.16 - 0.08;
  }
  PA = to ? uTA : uFA;
  PB = to ? uTB : uFB;
  PC = to ? uTC : uFC;
  PD = to ? uTD : uFD;
  ROW = (to ? uTo : uFrom) * 2.0;
  return roman(px);
}
`,_=new WeakMap,v=e=>e.uniforms?_.get(e.uniforms):void 0;function y(o={}){let m=o.mode??`pompeii`,v=o.size??1,y=new Float32Array(384);u.forEach((e,t)=>{c[e].forEach((e,n)=>{let r=h(e.hex);y.set([r[0],r[1],r[2],e.kind??0],(t*2*f+n)*4),y.set([...p(e.hex),1],((t*2+1)*f+n)*4)})});let b=new a(y,f,6,t,e);b.minFilter=b.magFilter=r,b.needsUpdate=!0;let x=()=>new i,S={tPal:{value:b},uK:{value:8},uR:{value:7},uB:{value:3},uTA:{value:x()},uTB:{value:x()},uTC:{value:x()},uTD:{value:x()},uFA:{value:x()},uFB:{value:x()},uFC:{value:x()},uFD:{value:x()},uFrom:{value:d[m]},uTo:{value:d[m]},uMix:{value:1},uSize:{value:v},uLight:{value:new n(600,500,900)}},C={mode:m,size:v,sizeT:v,t:0,light:null,lx:.5,ly:.6,init:!1};_.set(S,C);let w=(e,t)=>{let n=l[u[t]];S[e+`A`].value.fromArray(n.A),S[e+`B`].value.fromArray(n.B),S[e+`C`].value.fromArray(n.C),S[e+`D`].value.fromArray(n.D)},T=()=>{w(`uT`,S.uTo.value),w(`uF`,S.uFrom.value)};return T(),{frag:g,uniforms:S,normals:!0,background:s.background,update(e,t){let n=S;C.t+=e,n.uMix.value<1&&(n.uMix.value=Math.min(1,n.uMix.value+e/1.4),n.uMix.value>=1&&(n.uFrom.value=n.uTo.value)),C.size+=(C.sizeT-C.size)*(1-Math.exp(-e*6)),Math.abs(C.size-C.sizeT)<.001&&(C.size=C.sizeT),n.uSize.value=C.size,T();let r=C.t,i=.5+.4*Math.sin(r*.19),a=.62+.2*Math.sin(r*.13+1.2);C.light&&(i=C.light.x,a=C.light.y);let o=C.init?1-Math.exp(-e*(C.light?4:1.2)):1;C.init=!0,C.lx+=(i-C.lx)*o,C.ly+=(a-C.ly)*o,n.uLight.value.set(C.lx*t.width,(1-C.ly)*t.height,.62*Math.max(t.width,t.height))}}}function b(e,t){let n=v(e),r=e.uniforms;n&&n.mode!==t&&(n.mode=t,r.uMix.value>=.5&&(r.uFrom.value=r.uTo.value),r.uTo.value=d[t],r.uMix.value=0)}function x(e,t){let n=v(e);n&&(n.sizeT=t)}function S(e,t){let n=v(e);n&&(n.light=t)}export{S as a,o as i,y as n,b as o,s as r,x as s,c as t};