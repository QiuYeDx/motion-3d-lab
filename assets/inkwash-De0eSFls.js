import{vn as e,yn as t}from"./events-9ce18a08.esm-BJiOHOtz.js";var n=[{id:`xieyi`,label:`写意`},{id:`gongbi`,label:`工笔`},{id:`pomo`,label:`泼墨`}],r={title:`水墨`,en:`Ink Wash`,background:`#f2ede2`,theme:`light`},i={xieyi:{lineK:.95,lineW:1.45,press:.95,sel:.7,dry:.8,lift:.55,halo:.7,bleed:.75,bleedR:9,wet:.5,steps:.85,cun:.85,color:0,splash:0,contrast:1.1,white:.27},gongbi:{lineK:.92,lineW:.7,press:.1,sel:0,dry:0,lift:0,halo:.08,bleed:.12,bleedR:5,wet:.2,steps:.5,cun:0,color:1,splash:0,contrast:1.25,white:.29},pomo:{lineK:.75,lineW:2.1,press:1,sel:.9,dry:.6,lift:.4,halo:1,bleed:1,bleedR:17,wet:.85,steps:.9,cun:.35,color:0,splash:1,contrast:1.5,white:.35}},a=(e,t,n)=>{let r={};for(let i of Object.keys(e))r[i]=e[i]+(t[i]-e[i])*n;return r},o=`
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uInkThin;
uniform vec3 uIndigo;
uniform vec3 uOchre;
uniform vec3 uCinnabar;
uniform float uLineK;
uniform float uLineW;
uniform float uPress;
uniform float uSel;
uniform float uDry;
uniform float uLift;
uniform float uHalo;
uniform float uBleed;
uniform float uBleedR;
uniform float uWet;
uniform float uSteps;
uniform float uCun;
uniform float uColor;
uniform float uSplash;
uniform float uContrast;
uniform float uWhite;
uniform float uDensity;  // visitor's 墨色浓淡
uniform vec3 uFog;       // depth near, depth far (world units), strength
uniform vec2 uMist;      // mist drift offset, CSS px
uniform float uMistK;
uniform float uReveal;   // 0 → 1 painting progress

// explicit-LOD reads: safe inside loops and branches
vec3 sceneL(vec2 px) {
  vec3 c = textureLod(tScene, px / uRes, 0.0).rgb * uExposure;
  c = c / (1.0 + c * 0.12);
  return clamp(linearToSrgb(c), 0.0, 1.0);
}
float depthL(vec2 px) {
  float d = textureLod(tDepth, px / uRes, 0.0).r;
  if (uOrtho > 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
vec4 normL(vec2 px) { return textureLod(tNormal, px / uRes, 0.0); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

/* xuan paper: long thin fibres in every direction (0..1, high on a fibre) */
float fibres(vec2 cp) {
  vec2 r1 = rot(0.5) * cp;
  vec2 r2 = rot(-1.1) * cp;
  vec2 r3 = rot(2.2) * cp;
  float f = vnoise(vec2(r1.x * 0.045, r1.y * 0.85));
  f = max(f, vnoise(vec2(r2.x * 0.035, r2.y * 0.7) + 7.0));
  f = max(f, vnoise(vec2(r3.x * 0.055, r3.y * 1.0) + 13.0));
  return f;
}

float inkOf(float l, float fogK) {
  float D = clamp((1.0 - l - uWhite) / (0.8 - uWhite), 0.0, 1.0);
  return pow(D, uContrast) * uDensity * (1.0 - fogK * 0.8);
}

vec3 stylize(vec2 px) {
  vec2 cp = px / uDpr;

  /* the hand trembles a little */
  vec2 trem = vec2(vnoise(cp * 0.022 + 3.0), vnoise(cp * 0.022 + 11.0)) - 0.5;
  vec2 q = px + trem * 3.2 * uDpr;

  vec3 c0 = sceneL(q);
  float l0 = luma(c0);
  float d0 = depthL(q);
  float fog0 = smoothstep(uFog.x, uFog.y, d0) * uFog.z;

  /* ring: near / wide blur, contour normal, nearest depth around */
  float R = uBleedR * (0.75 + 0.9 * fog0) * uDpr;
  float lIn = 0.0, lOut = 0.0, dMin = d0;
  vec3 cAvg = c0;
  vec2 g = vec2(0.0);
  mat2 tw = rot(0.314);
  for (int i = 0; i < 10; i++) {
    float a = float(i) * 0.6283185 + 0.31;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 p1 = q + dir * R * 0.42;
    vec2 p2 = q + (tw * dir) * R;
    vec3 c1 = sceneL(p1);
    float l1 = luma(c1);
    float l2 = luma(sceneL(p2));
    lIn += l1;
    lOut += l2;
    cAvg += c1;
    g += dir * (l1 - l0);
    dMin = min(dMin, depthL(p2));
  }
  lIn *= 0.1;
  lOut *= 0.1;
  cAvg /= 11.0;
  float fogW = smoothstep(uFog.x, uFog.y, dMin) * uFog.z;

  /* mist band drifting through the middle distance */
  float mist = 0.0;
  if (uMistK > 0.001) {
    float band = smoothstep(uFog.x, mix(uFog.x, uFog.y, 0.45), dMin) * (1.0 - 0.5 * smoothstep(mix(uFog.x, uFog.y, 0.6), uFog.y, dMin));
    mist = smoothstep(0.42, 0.75, fbm(vec2(cp.x + uMist.x, cp.y * 2.4) / vec2(520.0, 900.0) + 4.0)) * band * uMistK;
  }

  /* washes: posterised into the five tones */
  float wet = clamp(uWet + fogW * 0.8, 0.0, 1.0);
  float lNear = (l0 + lIn * 10.0) / 11.0;
  float lWide = (l0 + lIn * 10.0 + lOut * 10.0) / 21.0;
  float L = mix(l0, mix(lNear, lWide, wet), wet);
  float D = inkOf(L, fogW) * (1.0 - mist * 0.85);
  float jit = (fbm(cp / 60.0 + 20.0) - 0.5) * 0.55;
  float x = clamp(D, 0.0, 1.2) * 5.0 + jit;
  float fl = floor(x);
  float fr = fract(x);
  float s = mix(0.5, 0.05, uSteps * (1.0 - wet * 0.55));
  float kq = max(fl + smoothstep(0.5 - s, 0.5 + s, fr), 0.0);
  float Dq = 0.95 * pow(min(kq / 5.0, 1.15), 1.15);
  Dq = mix(Dq, D, wet * 0.35);
  // 水痕: the leading edge of each tone keeps a slightly darker rim
  float fw = max(fwidth(x), 1e-4);
  float rim = step(0.5, fr) * (1.0 - smoothstep(0.0, fw * 2.8 * uDpr, fr - 0.5)) * step(0.6, x);
  Dq += rim * 0.09 * (1.0 - wet * 0.7);

  /* 洇: the wide blur wicks out along the paper fibres */
  float fib = fibres(cp);
  float Dw = inkOf(lWide, fogW) * (1.0 - mist * 0.85);
  float feather = smoothstep(0.3, 0.95, Dw * 1.6 + (fib - 0.5) * 0.9 + (vnoise(cp * 0.11) - 0.5) * 0.35);
  float halo = Dw * feather * 0.6 * uBleed;
  float Iw = max(Dq, halo);
  // ink settles into the fibres
  Iw *= 1.0 + (fib - 0.5) * 0.22 * (1.0 - Iw);

  /* 泼墨: splashed blots with a ragged, bleeding border + spatter */
  float spat = 0.0;
  if (uSplash > 0.001) {
    float bn = fbm(cp / 58.0 + 40.0);
    float blot = smoothstep(0.42, 0.5, Dw * 1.3 + (bn - 0.5) * 0.75 + (fib - 0.5) * 0.12);
    Iw = max(Iw, blot * mix(0.5, 0.97, smoothstep(0.25, 0.8, Dw + bn * 0.35)) * uSplash * (1.0 - smoothstep(0.15, 0.5, fogW)));
    vec2 sc = floor(cp / 17.0);
    vec2 sp = (sc + vec2(0.2, 0.2) + 0.6 * vec2(hash12(sc + 5.1), hash12(sc + 9.7))) * 17.0;
    float sr = 0.7 + 3.0 * pow(hash12(sc + 2.3), 3.0);
    float sd = length(cp - sp);
    spat = (1.0 - smoothstep(sr - 0.7, sr + 0.5, sd)) * step(hash12(sc + 13.3), 0.3)
         * smoothstep(0.08, 0.3, Dw) * (1.0 - smoothstep(0.6, 0.85, Dw)) * uSplash;
  }

  /* contours */
  vec2 nrm = dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, 1.0);
  vec2 tng = vec2(-nrm.y, nrm.x);
  float pn = vnoise(cp / 40.0 + 50.0);
  float press = mix(1.0, 0.3 + 1.5 * pn * pn, uPress);
  float rw = max(uLineW * press * uDpr, 0.6);
  float eLine = 0.0, eHalo = 0.0;
  for (int k = 0; k < 2; k++) {
    float r = k == 0 ? rw : rw * 2.6 + 3.5 * uDpr;
    float d1 = depthL(q + vec2(r, 0.0));
    float d2 = depthL(q - vec2(r, 0.0));
    float d3 = depthL(q + vec2(0.0, r));
    float d4 = depthL(q - vec2(0.0, r));
    float lap = abs(d1 + d2 + d3 + d4 - 4.0 * d0) / max(min(min(d1, d2), min(min(d3, d4), d0)), 1e-3);
    vec4 n1 = normL(q + vec2(r, 0.0));
    vec4 n2 = normL(q - vec2(r, 0.0));
    vec4 n3 = normL(q + vec2(0.0, r));
    vec4 n4 = normL(q - vec2(0.0, r));
    float en = length(n1.xyz - n2.xyz) + length(n3.xyz - n4.xyz);
    // (no coverage term: a ground plane clipped by the far plane would draw a false horizon line)
    float e = smoothstep(mix(0.03, 0.09, uSel), mix(0.08, 0.2, uSel), lap);
    e = max(e, smoothstep(0.28, 0.55, en) * (1.0 - uSel));
    if (k == 0) eLine = e; else eHalo = e;
  }
  // 飞白: streaks along the stroke, in a cell-local stroke frame (joins between cells stay solid)
  float P = 84.0;
  vec2 cc = (floor(cp / P) + 0.5) * P;
  vec2 dc = cp - cc;
  float streak = vnoise(vec2(dot(dc, tng) * 0.028, dot(dc, nrm) * 0.45) + cc * 0.137);
  float seam = smoothstep(0.0, 0.1, 0.5 - max(abs(dc.x), abs(dc.y)) / P);
  float dryAmt = uDry * smoothstep(0.3, 0.7, vnoise(cp / 52.0 + 9.0) + (1.0 - pn) * 0.25) * seam;
  float dryMask = mix(1.0, smoothstep(0.32, 0.56, streak), dryAmt);
  float lift = mix(1.0, smoothstep(0.16, 0.3, vnoise(cp / 34.0 + 70.0)), uLift);
  float near = 1.0 - smoothstep(0.0, 0.6, fogW) * 0.95;
  float Il = eLine * uLineK * (0.8 + 0.12 * press) * dryMask * lift * near * (1.0 - mist);
  float Ih = eHalo * uHalo * 0.3 * (1.0 - dryAmt) * lift * near
           * smoothstep(0.25, 0.85, fib * 0.75 + vnoise(cp * 0.2) * 0.45);

  /* 皴: short directional dabs in the dark masses */
  float cun = 0.0;
  float cunMask = smoothstep(0.32, 0.6, Dq) * (1.0 - fogW) * uCun * smoothstep(0.3, 0.55, fbm(cp / 90.0 + 3.0));
  if (cunMask > 0.01) {
    for (int fam = 0; fam < 2; fam++) {
      float ff = float(fam);
      vec2 r = rot(mix(1.3, 0.5, ff)) * cp;
      vec2 cell = vec2(15.0, 5.5);
      vec2 b = floor(r / cell);
      for (int j = -1; j <= 1; j++) {
        vec2 id = b + vec2(float(j), 0.0);
        float h = hash12(id + ff * 37.0);
        vec2 ctr = (id + vec2(0.5 + (hash12(id + 3.1) - 0.5) * 0.7, 0.5)) * cell;
        vec2 d = rot((hash12(id + 5.3) - 0.5) * 0.7) * (r - ctr);
        float len = 3.5 + 8.5 * h * h;
        float al = d.x / len;
        float th = (0.7 + 1.0 * hash12(id + 7.7)) * (1.0 - al * al * 0.6) * (0.75 + 0.25 * (al + 1.0));
        float dab = (1.0 - smoothstep(th * 0.55, th, abs(d.y))) * (1.0 - smoothstep(0.55, 1.0, abs(al)));
        dab *= 0.45 + 0.55 * step(0.38, vnoise(vec2(d.x * 0.18, d.y * 2.2) + id * 3.0));
        dab *= step(hash12(id + 11.9), mix(0.42, 0.32, ff)) * mix(1.0, smoothstep(0.5, 0.75, Dq), ff);
        cun = max(cun, dab);
      }
    }
    cun *= cunMask;
  }

  /* painting order: lines are written first, then the washes soak in */
  float fld = 0.62 * fbm(cp / 260.0 + 1.7) + 0.38 * vnoise(cp / 40.0);
  float rv = uReveal * 1.9;
  Il *= smoothstep(0.0, 0.06, rv - fld);
  Ih *= smoothstep(0.3, 0.6, rv - fld);
  float soak = smoothstep(0.35, 0.9, rv - fld);
  Iw *= soak;
  cun *= smoothstep(0.7, 0.95, rv - fld);
  spat *= smoothstep(0.75, 0.8, rv - fld);

  float I = 1.0 - (1.0 - Iw) * (1.0 - Il) * (1.0 - Ih) * (1.0 - cun * 0.62) * (1.0 - spat * 0.9);
  I = clamp(I, 0.0, 0.97);

  /* 工笔: pale mineral / plant pigments glazed under the ink */
  vec3 base = uPaper;
  if (uColor > 0.001) {
    vec3 cs = mix(c0, cAvg, 0.5);
    float mx = max(cs.r, max(cs.g, cs.b));
    float mn = min(cs.r, min(cs.g, cs.b));
    float sat = (mx - mn) / max(mx, 1e-3);
    float dlt = max(mx - mn, 1e-4);
    float hue = mx == cs.r ? mod((cs.g - cs.b) / dlt, 6.0) : (mx == cs.g ? (cs.b - cs.r) / dlt + 2.0 : (cs.r - cs.g) / dlt + 4.0);
    hue /= 6.0;
    float wc = 1.0 - smoothstep(0.035, 0.075, min(hue, 1.0 - hue));
    float wo = smoothstep(0.035, 0.075, hue) * (1.0 - smoothstep(0.17, 0.24, hue));
    float wi = clamp(1.0 - wc - wo, 0.0, 1.0);
    vec3 pig = uCinnabar * wc + uOchre * wo + uIndigo * wi;
    float a = uColor * smoothstep(0.1, 0.42, sat) * soak * (1.0 - fogW * 0.7) * (0.55 + 0.45 * (fib * 0.4 + 0.6));
    base = mix(base, uPaper * pig, a * 0.85);
  }

  vec3 inkCol = mix(uInkThin, uInk, smoothstep(0.12, 0.85, I));
  vec3 col = mix(base, inkCol, I);

  /* paper: warm, mottled, with a few pale fibres */
  col *= 1.0 - 0.04 * (fbm(cp / 190.0) - 0.5);
  col += vec3(0.014, 0.012, 0.008) * smoothstep(0.82, 0.97, fib) * (1.0 - I);
  return clamp(col, 0.0, 1.0);
}
`,s=4.2,c=e=>{let n=parseInt(e.slice(1),16);return new t((n>>16&255)/255,(n>>8&255)/255,(n&255)/255)};function l(){let n={from:i.xieyi,to:i.xieyi,cur:i.xieyi,k:1,mode:`xieyi`,t:s,density:1,densityTarget:1},r={uPaper:{value:c(`#f2ede2`)},uInk:{value:c(`#15130f`)},uInkThin:{value:c(`#4c5257`)},uIndigo:{value:c(`#8fa8b8`)},uOchre:{value:c(`#e3b47c`)},uCinnabar:{value:c(`#e48a72`)},uLineK:{value:1},uLineW:{value:1},uPress:{value:1},uSel:{value:0},uDry:{value:0},uLift:{value:0},uHalo:{value:0},uBleed:{value:0},uBleedR:{value:8},uWet:{value:0},uSteps:{value:.5},uCun:{value:0},uColor:{value:0},uSplash:{value:0},uContrast:{value:1},uWhite:{value:.2},uDensity:{value:1},uFog:{value:new t(14,40,1)},uMist:{value:new e(0,0)},uMistK:{value:0},uReveal:{value:1}},l=e=>{r.uLineK.value=e.lineK,r.uLineW.value=e.lineW,r.uPress.value=e.press,r.uSel.value=e.sel,r.uDry.value=e.dry,r.uLift.value=e.lift,r.uHalo.value=e.halo,r.uBleed.value=e.bleed,r.uBleedR.value=e.bleedR,r.uWet.value=e.wet,r.uSteps.value=e.steps,r.uCun.value=e.cun,r.uColor.value=e.color,r.uSplash.value=e.splash,r.uContrast.value=e.contrast,r.uWhite.value=e.white,r.uDensity.value=n.density};return l(n.cur),{normals:!0,frag:o,uniforms:r,ink:n,update(e){n.t+=e;let t=Math.min(1,n.t/s);if(r.uReveal.value=1-(1-t)**2.2,n.k<1){n.k=Math.min(1,n.k+e/.9);let t=n.k<.5?4*n.k**3:1-(-2*n.k+2)**3/2;n.cur=a(n.from,n.to,t)}n.density+=(n.densityTarget-n.density)*Math.min(1,e*5),r.uMist.value.x+=e*14,l(n.cur)}}}function u(e){let t=e.ink;t&&(t.t=0)}function d(e){let t=e.ink;t&&(t.t=s)}function f(e){let t=e.ink;return t?Math.min(1,t.t/s):1}function p(e,t){let n=e.ink;n&&n.mode!==t&&(n.mode=t,n.from=n.cur,n.to=i[t],n.k=0)}function m(e,t){let n=e.ink;n&&(n.densityTarget=t)}function h(e,t,n,r=1){e.uniforms.uFog.value.set(t,n,r)}function g(e,t){e.uniforms.uMistK.value=t}export{u as a,g as c,f as i,p as l,r as n,m as o,n as r,h as s,l as t,d as u};