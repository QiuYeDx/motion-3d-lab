import{Bt as e,N as t,Wt as n,_n as r,dt as i,pn as a,vn as o,xt as s,z as c}from"./events-9ce18a08.esm-BkDjjFw8.js";var l=[{id:`indigo`,label:`蓝靛`,en:`Indigo shibori`},{id:`rainbow`,label:`彩虹扎染`,en:`Rainbow tie-dye`},{id:`jiaoxie`,label:`绞缬`,en:`Dotted resist`}],u=[{id:`kumo`,label:`蜘蛛绞`},{id:`itajime`,label:`板缔`},{id:`rings`,label:`圈染`},{id:`spiral`,label:`螺旋`}],d={indigo:`kumo`,rainbow:`spiral`,jiaoxie:`rings`},f={title:`扎染`,en:`Tie-dye`,background:`#e9ecef`,theme:`light`},p=e=>{let t=parseInt(e.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]},m={indigo:{cloth:p(`#f2efe7`),pale:p(`#9fb8d3`),mid:p(`#3b6492`),deep:p(`#13284b`),gPale:p(`#c9d09a`),gMid:p(`#4f8a72`),gDeep:p(`#1b474a`),vat:p(`#24504f`),bleed:1},rainbow:{cloth:p(`#f7f4ef`),pale:p(`#9fb8d3`),mid:p(`#3b6492`),deep:p(`#13284b`),gPale:p(`#9fb8d3`),gMid:p(`#3b6492`),gDeep:p(`#13284b`),vat:p(`#4a2a66`),bleed:.8},jiaoxie:{cloth:p(`#f1ede3`),pale:p(`#8eaacb`),mid:p(`#2f5687`),deep:p(`#0f2142`),gPale:p(`#c2cb94`),gMid:p(`#46806c`),gDeep:p(`#173f44`),vat:p(`#214849`),bleed:.55}},h={indigo:0,rainbow:1,jiaoxie:2},g={kumo:0,itajime:1,rings:2,spiral:3},_=[`#e8177a`,`#f6731c`,`#f8cd17`,`#35b04a`,`#0fa7b5`,`#2856d6`,`#7a3cc0`,`#d52457`],v=`
#define PI 3.14159265
#define TAU 6.28318531
uniform sampler2D tRainbow;   // 8×1, linear, repeat
uniform vec3 uPaper;
uniform vec3 uCloth;
uniform vec3 uPale;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uGPale;
uniform vec3 uGMid;
uniform vec3 uGDeep;
uniform vec3 uVat;
uniform float uMode;     // 0 indigo, 1 rainbow, 2 jiaoxie
uniform float uPat;      // 0 kumo, 1 itajime, 2 rings, 3 spiral
uniform float uBleed;
uniform float uCell;     // pattern unit, CSS px (screen mode)
uniform float uGround;   // 1: the empty background is dyed cloth too
uniform float uAnchor;
uniform mat4 uAM;
uniform vec4 uAP;        // tan(fov/2), units per object unit, plane (0 xy, 1 xz), threads per unit
uniform mat4 uAM2;
uniform vec4 uAP2;       // on, units per object unit, plane, threads per unit
uniform vec4 uAB2;       // object 2 bounds in its own space: half x, y min, y max, half z
uniform vec4 uAO;        // pattern offsets (units): object 1 xy, object 2 xy
uniform vec4 uAC;        // where a single rainbow spiral is centred (object plane coords): object 1, object 2
uniform vec4 uDip;       // vat front (0 bottom … 1 top, < 0 none), bloom 0..1, oxidation 0..1, wet 0..1
uniform float uSeed;

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.11 + 17.3; a *= 0.5; }
  return s / 0.875;
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

/*
 * The bound pattern at cloth point P (units). cen / Rm: the binding point inside this unit and the radius its
 * pattern may reach. Returns (resist potential, units, > 0 = white; dye hue 0..1; distance from the binding
 * 0 → 1; fold crease 0..1).
 */
vec4 pattern(vec2 P, vec2 cen, float Rm) {
  vec2 id = floor(P);
  vec2 q = fract(P) - cen;
  float r = length(q);
  float nr = r / Rm;
  float th = atan(q.y, q.x);
  float h = hash12(id + uSeed * 7.13);
  float pot = -1.0, hue = 0.0, dist = nr, crease = 0.0;
  if (uPat < 0.5) {
    // 蜘蛛绞: white pleat ridges radiating, a zig-zag web of binding thread, a white core
    float N = floor(20.0 + 10.0 * h);
    // pleats crinkle as they run out; the whole burst twists a little
    float ang = th + 0.12 * sin(nr * 4.0 + h * 6.0) + 0.09 * (vnoise(vec2(th * 5.0 + h * 9.0, nr * 16.0)) - 0.5);
    float a = fract(ang * N / TAU + 0.5) - 0.5;            // 0 on a ridge, ±0.5 in a valley
    float arc = TAU / N * r;
    float rayEnd = 0.62 + 0.38 * hash12(vec2(floor(ang * N / TAU + 0.5), h * 13.0));
    float pRay = arc * (0.24 - 0.2 * nr - abs(a)) + (vnoise(vec2(th * 30.0, nr * 40.0)) - 0.5) * 0.004;
    pRay = min(pRay, (rayEnd - nr) * Rm * 0.6);
    float rz = nr + 0.06 * abs(a);                          // the web sags between rays
    float pWeb = (0.011 - abs(fract(rz * 4.0 + 0.5) - 0.5) / 4.0) * Rm * step(0.16, nr) - smoothstep(0.62, 0.8, nr) * 0.2;
    float pCore = (0.12 + 0.04 * vnoise(vec2(th * 3.0, h * 7.0))) * Rm - r;
    pot = max(pCore, max(pRay, pWeb));
    crease = smoothstep(0.36, 0.5, abs(a)) * (1.0 - nr);
    hue = fract(floor(ang * N / TAU * 0.5) * 0.25 + h) * 0.999;
  } else if (uPat < 1.5) {
    // 板缔: folded into panels both ways, clamped between boards — white diamonds, squares at the corners
    vec2 g = P * 2.0;
    vec2 fq = abs(fract(g) - 0.5);                          // 0 panel centre … 0.5 fold
    float pD = (0.29 - (fq.x + fq.y)) * 0.354;
    pD = min(pD, (max(fq.x, fq.y) - 0.055) * 0.5);           // a dyed eye through the board's hole
    vec2 cq = 0.5 - fq;
    float pC = (0.085 - max(cq.x, cq.y)) * 0.5;
    pot = max(pD, pC);
    crease = smoothstep(0.43, 0.5, max(fq.x, fq.y));
    vec2 gi = floor(g);
    hue = fract((mod(gi.x + gi.y, 2.0) * 0.5 + hash12(gi + 3.0) * 0.18 + h * 0.3));
    dist = max(fq.x, fq.y) * 2.0;
  } else if (uPat < 2.5) {
    // 圈染: stitched rings — the stitches bite into the ring's edges; a white bud at the centre
    float k = floor(nr * 4.5);
    float t = fract(nr * 4.5);
    float bite = (abs(fract(th / TAU * (22.0 + 8.0 * k) + h) - 0.5) - 0.25) * 0.05;
    float pR = (0.14 + bite - abs(t - 0.55)) / 4.5 * Rm * step(0.6, nr * 4.5) - step(3.9, nr * 4.5) * 0.05;
    float pC = (0.075 + 0.02 * sin(th * 5.0 + h * 9.0)) * Rm - r;
    pot = max(pR, pC);
    crease = smoothstep(0.92, 1.0, cos(th * 30.0 + nr * 3.0 + h * 5.0)) * 0.6 * step(nr, 1.0);
    hue = fract(k * 0.29 + h);
  } else {
    // 螺旋: twisted flat, dye laid in wedges → arms of colour with white fold lines between them
    float arms = 8.0;
    float turns = 0.8;
    float ph = th / TAU + nr * turns + h;
    float a = fract(ph * arms);
    float da = min(a, 1.0 - a);
    float grad = arms * sqrt(1.0 / (TAU * TAU * max(r * r, 1e-4)) + turns * turns / (Rm * Rm));
    pot = (0.07 + 0.05 * nr - da) / grad;
    pot = max(pot, 0.05 * Rm - r);
    crease = smoothstep(0.3, 0.5, da) * 0.5;
    hue = (floor(ph * arms) + smoothstep(0.3, 0.7, a)) / arms;
  }
  // round patterns thin out into the dyed ground at the edge of their binding (no hard circle)
  if (uPat > 1.5) pot -= smoothstep(0.86, 1.0, nr) * 0.2;
  if (uPat < 0.5 || uPat > 1.5) crease *= 1.0 - smoothstep(0.8, 1.0, nr);
  return vec4(pot, hue, dist, crease);
}

vec3 indigo(float A, float ox) {
  vec3 pale = mix(uGPale, uPale, ox), mid = mix(uGMid, uMid, ox), deep = mix(uGDeep, uDeep, ox);
  vec3 c = mix(uCloth, pale, smoothstep(0.0, 0.32, A));
  c = mix(c, mid, smoothstep(0.26, 0.66, A));
  return mix(c, deep, smoothstep(0.6, 1.0, A));
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;
  vec2 uv = px / uRes;
  vec4 s0 = sceneT(px);
  vec4 n0 = nrmT(px);
  vec3 c0 = toS(s0.rgb);
  float cov = n0.a;
  // (cov is exactly 0.5 where 2 of 4 MSAA samples are covered: test with >=)
  if (cov >= 0.5 && s0.a < 0.97) return c0;   // pass-through props
  if (cov < 0.5 && uGround < 0.5) {
    float base = luma(toS(srgbToLinear(uPaper)));
    float sh = clamp(luma(c0) / max(base, 1e-3), 0.0, 1.0);
    return uPaper * mix(vec3(0.8, 0.84, 0.9), vec3(1.0), sh);
  }
  float d0 = cov >= 0.5 ? depthL(px) : uFar;
  vec3 nv = cov >= 0.5 ? normalize(n0.rgb * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);

  /* ---- folds in the scene: depth / normal / coverage changes, and a soft value for the dye */
  float edge = 0.0;
  float vs = luma(c0);
  float dMin = d0;
  for (int k = 0; k < 6; k++) {
    float a = float(k) * 1.0471976 + 0.3;
    vec2 q = px + vec2(cos(a), sin(a)) * 1.7 * uDpr;
    vec4 nk = nrmT(q);
    float e = abs(nk.a - cov) * 0.7;
    if (nk.a > 0.5 && cov >= 0.5) {
      float dk = depthL(q);
      dMin = min(dMin, dk);
      e = max(e, smoothstep(0.02, 0.07, abs(dk - d0) / d0));
      e = max(e, smoothstep(0.2, 0.5, 1.0 - dot(nk.rgb * 2.0 - 1.0, nv)) * 0.7);
    }
    edge = max(edge, e);
    vs += luma(toS(sceneT(q).rgb));
  }
  vs /= 7.0;

  /* ---- cloth coordinates: on an anchored cloth, or the screen */
  // screen units: cp = (P - pOff) · cellPx + cpOff. A rainbow shirt is one big spiral: on the screen a single
  // unit covers the whole frame (its centre is then pulled to the centroid of everything in view)
  bool one = uMode > 0.5 && uMode < 1.5;
  float cellPx = one ? 1.2 * max(uRes.x, uRes.y) / uDpr : uCell;
  vec2 pOff = one ? vec2(0.5) : vec2(uSeed * 3.7, uSeed * 1.9);
  vec2 cpOff = one ? 0.5 * uRes / uDpr : vec2(0.0);
  vec2 P = (cp - cpOff) / cellPx + pOff;
  float threads = uCell / 3.2;
  bool anchored = false;
  if (uAnchor > 0.5 && cov >= 0.5) {
    vec2 ndc = uv * 2.0 - 1.0;
    // antialiased silhouette pixels can carry the background's depth: use the nearer surface beside them
    float dA = (d0 - dMin) / dMin > 0.05 ? dMin : d0;
    vec3 vp = vec3(ndc.x * dA * uAP.x * uRes.x / uRes.y, ndc.y * dA * uAP.x, -dA);
    vec3 o = (uAM * vec4(vp, 1.0)).xyz;
    vec3 o2 = (uAM2 * vec4(vp, 1.0)).xyz;
    vec4 ap = uAP;
    vec2 off = uAO.xy;
    vec2 ctr = uAC.xy;
    if (uAP2.x > 0.5 && abs(o2.x) < uAB2.x && o2.y > uAB2.y && o2.y < uAB2.z && abs(o2.z) < uAB2.w) {
      o = o2;
      ap = vec4(0.0, uAP2.yzw);
      off = uAO.zw;
      ctr = uAC.zw;
    }
    vec2 pc = ap.z > 0.5 ? vec2(o.x, -o.z) : o.xy;
    // rainbow: one big spiral centred on the cloth
    P = one ? (pc - ctr) * ap.y * 0.26 + 0.5 : pc * ap.y + off;
    threads = one ? ap.w / 0.26 : ap.w;
    anchored = true;
  }
  vec2 dPx = dFdx(P), dPy = dFdy(P);
  float gpx = 0.5 * (length(dPx) + length(dPy));       // units per device px

  /* ---- 绞缬 reads the pattern at the centre of each tied dot */
  float dots = 11.0;
  vec2 Dg = P * dots;
  float drow = floor(Dg.y);
  Dg.x += mod(drow, 2.0) * 0.5;
  vec2 dLocal = fract(Dg) - 0.5;
  vec2 Pc = (vec2(floor(Dg.x) + 0.5 - mod(drow, 2.0) * 0.5, drow + 0.5)) / dots;
  vec2 Pe = uMode > 1.5 ? Pc * 0.36 : P;

  /* ---- binding point of this unit: jittered, pulled to the geometry inside it on the screen */
  // round bindings sit in staggered rows (brick-like), so the units don't line up in a grid
  bool round = abs(uPat - 1.0) > 0.5;
  float odd = round ? mod(floor(Pe.y), 2.0) : 0.0;
  vec2 Qe = Pe + vec2(odd * 0.5, 0.0);
  vec2 id = floor(Qe);
  vec2 cen = 0.5 + (vec2(hash12(id + 1.7 + uSeed), hash12(id + 9.1 + uSeed)) - 0.5) * (one ? 0.0 : 0.3);
  if (!anchored && round) {
    vec2 acc = vec2(0.0);
    float n = 0.0;
    for (int k = 0; k < 16; k++) {
      vec2 g = (vec2(float(k - (k / 4) * 4), float(k / 4)) + 0.5) / 4.0;
      vec2 sp = ((id + g - vec2(odd * 0.5, 0.0) - pOff) * cellPx + cpOff) * uDpr;
      float c = textureLod(tNormal, sp / uRes, 0.0).a;
      acc += g * c;
      n += c;
    }
    if (n > 1.5) cen = mix(cen, clamp(acc / n, 0.32, 0.68), one ? 1.0 : 0.85);
  }
  float Rm = (0.5 - max(abs(cen.x - 0.5), abs(cen.y - 0.5))) * mix(0.78, 1.0, hash12(id + 4.4 + uSeed));
  vec4 F = pattern(Qe, cen, Rm);

  /* ---- feathered resist: capillary fingers along warp and weft, a tide line just outside */
  float warp = (fbm(P * 9.0 + 4.0) - 0.5) * 0.026
             + (vnoise(vec2(P.x * 46.0, P.y * 11.0)) - 0.5) * 0.009 * uBleed
             + (vnoise(vec2(P.x * 11.0, P.y * 46.0) + 7.0) - 0.5) * 0.009 * uBleed;
  float fe = 0.008 + 0.01 * uBleed;
  float pw = F.x + (uMode > 1.5 ? 0.0 : warp);
  float R = smoothstep(-fe, fe, pw);
  float tide = exp(-pow((pw + fe * 1.6) / fe, 2.0));
  float bloom = 1.0 - smoothstep(uDip.y * 1.3 - 0.25, uDip.y * 1.3, min(F.z, 1.0));

  // 绞缬: inside the motif, a white ring per tied dot with a dyed pinch at its centre and a pale halo
  if (uMode > 1.5) {
    float present = smoothstep(-0.003, 0.003, F.x + 0.006);
    // a sparse sprinkle of single ties between the motifs (鹿胎缬)
    float dcol = floor(Dg.x);
    present = max(present, step(mod(drow, 2.0), 0.5) * step(mod(dcol + drow * 1.5, 4.0), 0.5) * 0.9);
    float dd = length(dLocal) + (vnoise(Dg * 5.0) - 0.5) * 0.06;
    float ring = 1.0 - smoothstep(0.22, 0.29, dd);
    float pinch = 1.0 - smoothstep(0.035, 0.075, dd);
    float halo = (1.0 - smoothstep(0.27, 0.46, dd)) * (1.0 - ring);
    R = present * (ring * (1.0 - pinch * 0.85) + halo * 0.32);
    tide = present * exp(-pow((dd - 0.3) / 0.04, 2.0)) * 0.6;
    F.w = 0.0;
  }
  R *= bloom;
  tide *= bloom;

  /* ---- dye density */
  float v = mix(luma(c0), vs, 0.5);
  float A = mix(1.02, 0.36, smoothstep(0.08, 0.92, v));
  if (uMode > 1.5) A = mix(1.02, 0.56, smoothstep(0.08, 0.92, v));
  if (one) A = mix(1.02, 0.62, smoothstep(0.08, 0.92, v));
  // uneven: slow mottling, streaks along the warp
  A *= 1.0 + (fbm(P * 2.2 + 5.0 + uSeed) - 0.5) * 0.34 + (vnoise(vec2(P.x * 1.3, P.y * 16.0)) - 0.5) * 0.08;
  // dye gathers in folds: the bundle's random creases, the pattern's folds, the scene's own folds
  float c1 = abs(fract(dot(P, vec2(0.8, 0.6)) * 0.62 + vnoise(P * 0.7 + 3.0) * 0.22) - 0.5) / 0.62;
  float c2 = abs(fract(dot(P, vec2(-0.47, 0.88)) * 0.5 + vnoise(P * 0.6 + 8.0) * 0.22 + 0.3) - 0.5) / 0.5;
  float randCrease = (1.0 - smoothstep(0.003, 0.016, c1)) * smoothstep(0.45, 0.7, vnoise(P * 0.55 + 1.0))
                   + (1.0 - smoothstep(0.003, 0.016, c2)) * smoothstep(0.45, 0.7, vnoise(P * 0.5 + 6.0));
  randCrease *= 0.8;
  A += F.w * 0.22 + randCrease * 0.16 + edge * 0.32;
  A = clamp(A, 0.0, 1.15) * (1.0 - R * 0.96) + tide * 0.14;

  vec3 col;
  if (uMode > 0.5 && uMode < 1.5) {
    // rainbow: colours from the palette by the pattern's sectors, bleeding across the borders
    float hu = F.y + (fbm(P * 3.0 + 2.0) - 0.5) * 0.09 * uBleed;
    vec3 dye = textureLod(tRainbow, vec2(hu, 0.5), 0.0).rgb;
    float amt = clamp(A * 1.1, 0.0, 1.0);
    col = mix(uCloth, dye, smoothstep(0.0, 0.85, amt));
    col = mix(col, col * col * 0.9, smoothstep(0.55, 1.1, A) * 0.75);
    // over-dye: neighbours bleed a little colour into the white
    col = mix(col, mix(uCloth, dye, 0.25), R * 0.2);
  } else {
    col = indigo(A, uDip.z);
  }

  /* ---- cloth: lit form, plain weave, wet sheen */
  float shade = mix(0.66, 1.04, smoothstep(0.06, 0.88, luma(c0)));
  col *= mix(1.0, shade, mix(0.6, 1.0, R));
  vec2 W = anchored ? P * threads : cp / 3.2;
  float gW = anchored ? gpx * threads : 1.0 / (3.2 * uDpr);
  vec2 wi = floor(W);
  vec2 wf = fract(W);
  float over = mod(wi.x + wi.y, 2.0);
  float prof = over > 0.5 ? sin(PI * wf.x) : sin(PI * wf.y);
  float slub = (hash12(vec2(over > 0.5 ? wi.x : wi.y, over)) - 0.5) * 0.08;
  float wk = 1.0 - smoothstep(0.28, 0.5, gW);
  col *= 1.0 + ((pow(prof, 0.7) - 0.6) * 0.16 + slub) * wk;

  // wet from the vat: darker, with a soft sheen
  float wet = uDip.w;
  col *= 1.0 - 0.3 * wet;
  vec3 H = normalize(vec3(-0.3, 0.5, 1.0));
  col += wet * pow(max(dot(nv, H), 0.0), 24.0) * 0.18 * step(0.5, cov);

  // the vat: a rising (or draining) wet front, with a bright meniscus line and drips under it
  if (uDip.x > -0.5) {
    float y = px.y / uRes.y;
    float fy = uDip.x + (vnoise(vec2(cp.x * 0.015, uTime * 0.8)) - 0.5) * 0.02;
    float drip = step(0.82, hash12(vec2(floor(cp.x / 7.0), 3.0))) * 0.05 * hash12(vec2(floor(cp.x / 7.0), 5.0));
    float sub = 1.0 - smoothstep(-0.003, 0.003, y - fy - drip);
    vec3 vat = uVat * (0.92 + 0.12 * vnoise(cp * 0.05 + uTime * 0.3));
    col = mix(col, vat, sub * 0.9);
    col += exp(-pow((y - fy) / 0.0035, 2.0)) * 0.22;
  }
  return clamp(col, 0.0, 1.0);
}
`,y=.85,b=.3,x=.95,S=1.91,C=2.2,w=1.15+.4,T=3.6,E=5.15;function D(t={}){let l=t.mode??`indigo`,u=t.pattern??d[l],D={mode:l,pat:u,next:null,dip:1/0,seed:0},O=new Uint8Array(_.length*4);_.forEach((e,t)=>O.set([...p(e).map(e=>Math.round(e*255)),255],t*4));let k=new c(O,_.length,1,e,a);k.wrapS=n,k.minFilter=k.magFilter=i,k.needsUpdate=!0;let A=()=>new r,j={tRainbow:{value:k},uPaper:{value:new r(...p(f.background))},uCloth:{value:A()},uPale:{value:A()},uMid:{value:A()},uDeep:{value:A()},uGPale:{value:A()},uGMid:{value:A()},uGDeep:{value:A()},uVat:{value:A()},uMode:{value:h[l]},uPat:{value:g[u]},uBleed:{value:1},uCell:{value:t.cell??230},uGround:{value:1},uAnchor:{value:0},uAM:{value:new s},uAP:{value:new o(.3,1,0,60)},uAM2:{value:new s},uAP2:{value:new o(0,1,1,40)},uAB2:{value:new o(1,0,1,1)},uAO:{value:new o},uAC:{value:new o},uDip:{value:new o(-1,1,1,0)},uSeed:{value:0}},M=e=>{let t=m[e];j.uCloth.value.set(...t.cloth),j.uPale.value.set(...t.pale),j.uMid.value.set(...t.mid),j.uDeep.value.set(...t.deep),j.uGPale.value.set(...t.gPale),j.uGMid.value.set(...t.gMid),j.uGDeep.value.set(...t.gDeep),j.uBleed.value=t.bleed,j.uMode.value=h[e]};M(l);let N=e=>e<.5?4*e*e*e:1-(-2*e+2)**3/2,P=e=>Math.min(1,Math.max(0,e));return{normals:!0,frag:v,uniforms:j,background:f.background,td:D,update(e){let t=j.uDip.value;if(D.dip>=E){t.set(-1,1,1,0);return}let n=D.dip;D.dip+=e;let r=D.dip;n<y&&r>=y&&(D.next&&(D.mode=D.next.mode,D.pat=D.next.pat,D.next=null,M(D.mode),j.uPat.value=g[D.pat]),D.seed=(D.seed+1)%7,j.uSeed.value=D.seed*.618);let i=r<y?-.06+N(r/y)*1.14:r<1.15?1.08:r<2.0999999999999996?1.08-N((r-y-b)/x)*1.16:-1,a=r>=y,o=a?N(P((r-S)/C)):1,s=a?N(P((r-w)/T)):1,c=r<y?0:1-N(P((r-y-b-x*.5)/3));t.set(i,o,D.mode===`rainbow`?1:s,c)}}}var O=e=>{e.dip<y||(e.dip=0)};function k(e){let t=e.td;t&&O(t)}function A(e){let t=e.td;t&&(t.dip=2.0999999999999996)}function j(e,t){let n=e.td;n&&(n.next??{mode:n.mode,pat:n.pat}).mode!==t&&(n.next={mode:t,pat:d[t]},O(n))}function M(e,t){let n=e.td;if(!n)return;let r=n.next??{mode:n.mode,pat:n.pat};r.pat!==t&&(n.next={mode:r.mode,pat:t},O(n))}function N(e){let t=e.td;if(!t||t.dip>=E)return{p:1,stage:0};let n=t.dip;return{p:n/E,stage:n<1.15?1:n<2.0999999999999996?2:3}}function P(e,n,r){let i=e.uniforms;if(i.uGround.value=+!!n,r!==void 0){let n=new t(r).convertLinearToSRGB();i.uPaper.value.set(n.r,n.g,n.b),e.background=r}}function F(e,t,n){let r=e.uniforms;if(r.uAnchor.value=+!!t,!t)return;r.uAM.value.copy(t.viewToObject),r.uAP.value.set(t.tanHalfFov,t.scale,+(t.plane===`xz`),t.threads);let i=r.uAO.value;i.x=t.offset?.[0]??0,i.y=t.offset?.[1]??0;let a=r.uAC.value;a.x=t.center?.[0]??0,a.y=t.center?.[1]??0;let o=r.uAP2.value;n?(r.uAM2.value.copy(n.viewToObject),o.set(1,n.scale,+(n.plane===`xz`),n.threads),r.uAB2.value.set(n.halfX,n.yMin,n.yMax,n.halfZ),i.z=n.offset?.[0]??0,i.w=n.offset?.[1]??0,a.z=n.center?.[0]??0,a.w=n.center?.[1]??0):o.x=0}export{F as a,M as c,u as d,N as f,k as i,f as l,A as n,P as o,D as r,j as s,d as t,l as u};